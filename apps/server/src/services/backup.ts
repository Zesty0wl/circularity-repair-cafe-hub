import archiver from 'archiver';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { Open as UnzipperOpen } from 'unzipper';
import { db, pool } from '../db/index.js';
import { cafes, users, events, repairJobs, repairImages, auditLog } from '../db/schema.js';
import { count } from 'drizzle-orm';
import { env } from '../env.js';
import { APP_VERSION, BACKUP_FORMAT_READABLE, BACKUP_FORMAT_VERSION } from '../version.js';
import { BACKUP_TABLE_ORDER } from '@circularity/shared';

/**
 * Backup zip layout (v1):
 *
 *   manifest.json
 *   postgres/dump.sql      ← pg_dump --format=plain --no-owner --no-privileges
 *   uploads/…              ← mirror of env.UPLOADS_DIR
 *
 * Restore wipes the `public` schema and replays dump.sql, then swaps the
 * uploads directory wholesale. The node process is expected to exit
 * afterwards so s6 restarts it (re-running idempotent migrations on boot).
 *
 * Restore also reads format 2, which the Cloudflare edition writes:
 *
 *   manifest.json
 *   data/<table>.json      one JSON array of rows per table
 *   uploads/…
 *
 * See restorePortable() below and packages/shared/src/backup.ts.
 */

export interface BackupManifest {
  backupFormatVersion: number;
  appVersion: string;
  createdAt: string;
  postgresMajorVersion: number;
  cafe: { id: string | null; name: string };
  counts: {
    users: number;
    events: number;
    repairJobs: number;
    repairImages: number;
    auditLog: number;
  };
}

function parseDbUrl(url: string): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  // postgresql://user:pass@host:port/db
  const u = new URL(url);
  return {
    host: u.hostname || '127.0.0.1',
    port: u.port || '5432',
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

function pgEnv(): NodeJS.ProcessEnv {
  const c = parseDbUrl(env.DATABASE_URL);
  return {
    ...process.env,
    PGHOST: c.host,
    PGPORT: c.port,
    PGDATABASE: c.database,
    PGUSER: c.user,
    PGPASSWORD: c.password,
  };
}

async function gatherCounts(): Promise<BackupManifest['counts']> {
  const [u, e, j, i, a] = await Promise.all([
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(events),
    db.select({ c: count() }).from(repairJobs),
    db.select({ c: count() }).from(repairImages),
    db.select({ c: count() }).from(auditLog),
  ]);
  return {
    users: u[0]?.c ?? 0,
    events: e[0]?.c ?? 0,
    repairJobs: j[0]?.c ?? 0,
    repairImages: i[0]?.c ?? 0,
    auditLog: a[0]?.c ?? 0,
  };
}

async function buildManifest(): Promise<BackupManifest> {
  const [cafe] = await db.select({ id: cafes.id, name: cafes.name }).from(cafes).limit(1);
  return {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    postgresMajorVersion: 16,
    cafe: { id: cafe?.id ?? null, name: cafe?.name ?? '' },
    counts: await gatherCounts(),
  };
}

/**
 * Slug for the download filename, e.g. "circularity-2025-11-04T1530.zip".
 */
export function suggestedBackupFilename(name: string): string {
  const slug = (name || 'circularity')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'circularity';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${slug}-backup-${stamp}.zip`;
}

/**
 * Stream a full backup zip into the supplied writable. Resolves when the
 * archive has been finalised and fully flushed to the destination.
 */
export async function createBackup(out: NodeJS.WritableStream): Promise<BackupManifest> {
  const manifest = await buildManifest();
  const archive = archiver('zip', { zlib: { level: 6 } });

  const finished = new Promise<void>((resolve, reject) => {
    out.on('close', resolve);
    out.on('finish', resolve);
    out.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if ((err as any).code !== 'ENOENT') reject(err);
    });
  });

  archive.pipe(out);

  // 1. Manifest
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  // 2. Database dump — stream pg_dump stdout straight into the zip
  const dump = spawn(
    'pg_dump',
    [
      '--format=plain',
      '--no-owner',
      '--no-privileges',
      '--clean',
      '--if-exists',
      '--encoding=UTF8',
    ],
    { env: pgEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const dumpErr: Buffer[] = [];
  dump.stderr.on('data', (b) => dumpErr.push(b));
  archive.append(dump.stdout, { name: 'postgres/dump.sql' });

  const dumpDone = new Promise<void>((resolve, reject) => {
    dump.on('error', reject);
    dump.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}: ${Buffer.concat(dumpErr).toString('utf8')}`));
    });
  });

  // 3. Uploads — mirror the directory tree
  if (fs.existsSync(env.UPLOADS_DIR)) {
    archive.directory(env.UPLOADS_DIR, 'uploads');
  }

  // pg_dump must finish before we finalise so all bytes are flushed.
  await dumpDone;
  await archive.finalize();
  await finished;
  return manifest;
}

/**
 * Pipe a Node readable into a file on disk, resolving on close.
 */
export async function streamToFile(src: NodeJS.ReadableStream, dest: string): Promise<number> {
  const out = fs.createWriteStream(dest);
  let bytes = 0;
  src.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
  });
  await new Promise<void>((resolve, reject) => {
    src.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => resolve());
    src.pipe(out);
  });
  return bytes;
}

async function readManifestFromZip(zipPath: string): Promise<BackupManifest> {
  const dir = await UnzipperOpen.file(zipPath);
  const entry = dir.files.find((f) => f.path === 'manifest.json');
  if (!entry) throw new Error('Backup is missing manifest.json');
  const buf = await entry.buffer();
  let parsed: any;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new Error('Backup manifest.json is not valid JSON');
  }
  if (typeof parsed?.backupFormatVersion !== 'number') {
    throw new Error('Backup manifest is missing backupFormatVersion');
  }
  return parsed as BackupManifest;
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fsp.mkdir(destDir, { recursive: true });
  const dir = await UnzipperOpen.file(zipPath);
  for (const entry of dir.files) {
    // Reject path traversal
    const safeRel = entry.path.replace(/\\/g, '/');
    if (safeRel.includes('..')) {
      throw new Error(`Unsafe path in backup: ${entry.path}`);
    }
    const outPath = path.join(destDir, safeRel);
    if (entry.type === 'Directory') {
      await fsp.mkdir(outPath, { recursive: true });
      continue;
    }
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      entry
        .stream()
        .pipe(fs.createWriteStream(outPath))
        .on('finish', () => resolve())
        .on('error', reject);
    });
  }
}

async function runPsql(args: string[], stdin?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', ...args], {
      env: pgEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const errBuf: Buffer[] = [];
    child.stderr.on('data', (b) => errBuf.push(b));
    child.stdout.resume(); // drain
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql exited ${code}: ${Buffer.concat(errBuf).toString('utf8')}`));
    });
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

/**
 * SQL that drops every table, sequence and enum type in the `public` schema
 * owned by the connecting user. Safer than `DROP SCHEMA public CASCADE` since
 * the `circularity` role does not own the schema itself.
 */
const WIPE_PUBLIC_SQL = `
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  ) LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  FOR r IN (
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  ) LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
  END LOOP;
  FOR r IN (
    SELECT t.typname FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  ) LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$;
`;

export interface RestoreResult {
  manifest: BackupManifest;
}

/**
 * Replace ALL data with the contents of a backup zip on disk.
 *
 * 1. Validate the manifest's backupFormatVersion.
 * 2. Extract zip to a temp dir.
 * 3. Drop every object in the public schema.
 * 4. Replay postgres/dump.sql via psql.
 * 5. Swap /data/uploads with the extracted uploads tree.
 *
 * The caller is expected to terminate the process after this resolves so s6
 * restarts node with a fresh connection pool and re-runs migrations.
 */
export async function restoreBackup(zipPath: string): Promise<RestoreResult> {
  const manifest = await readManifestFromZip(zipPath);
  if (manifest.backupFormatVersion > BACKUP_FORMAT_READABLE) {
    throw new Error(
      `Backup format v${manifest.backupFormatVersion} is newer than this server (v${BACKUP_FORMAT_READABLE}). Upgrade the app first.`,
    );
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'circ-restore-'));
  try {
    await extractZip(zipPath, workDir);

    const dumpPath = path.join(workDir, 'postgres', 'dump.sql');
    const dataDir = path.join(workDir, 'data');
    const portable = !fs.existsSync(dumpPath) && fs.existsSync(dataDir);
    if (!fs.existsSync(dumpPath) && !portable) {
      throw new Error('Backup is missing postgres/dump.sql');
    }

    const uploadsSrc = path.join(workDir, 'uploads');
    const hasUploads = fs.existsSync(uploadsSrc);

    if (portable) {
      // Format 2, from the Cloudflare edition. Loaded through the open pool,
      // inside one transaction, so a failure leaves the hub as it was.
      await restorePortable(dataDir);
      if (hasUploads) await swapUploads(uploadsSrc);
      return { manifest };
    }

    // Release Drizzle's pool so pg_dump's DROP statements don't deadlock on
    // open queries. We're about to exit the process anyway.
    try {
      await pool.end();
    } catch {
      // already closed — fine
    }

    // 1. Wipe schema
    await runPsql(['-c', WIPE_PUBLIC_SQL]);

    // 2. Replay the dump
    await runPsql(['-f', dumpPath]);

    // 3. Swap uploads
    if (hasUploads) await swapUploads(uploadsSrc);

    return { manifest };
  } finally {
    // Clean tmp work dir (after uploads swap the uploads sub-tree is already
    // gone, but the rest of the staging tree still needs sweeping)
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Put a restored uploads folder in place of the current one. */
async function swapUploads(uploadsSrc: string): Promise<void> {
  const existing = env.UPLOADS_DIR;
  const stash = `${existing}.pre-restore-${Date.now()}`;
  if (fs.existsSync(existing)) {
    await fsp.rename(existing, stash);
  }
  await fsp.mkdir(path.dirname(existing), { recursive: true });
  await fsp.rename(uploadsSrc, existing);
  // Pictures the hub draws for itself (sharing cards, icons) are drawn again
  // when asked for. A Cloudflare backup leaves them out, and old ones would
  // only be stale, so make sure their folders exist and are empty.
  for (const dir of ['og', 'pwa']) {
    await fsp.mkdir(path.join(existing, dir), { recursive: true });
  }
  // Best-effort cleanup of the stash directory. We don't keep it because
  // /data fills up fast; the operator can take a fresh backup before
  // restoring if they want a safety net.
  if (fs.existsSync(stash)) {
    await fsp.rm(stash, { recursive: true, force: true });
  }
}

/**
 * Load a format 2 backup: one JSON file of "portable rows" per table. Each row
 * is keyed by column name, with plain JSON values (ISO times, true and false,
 * arrays, objects). Columns this server does not have are skipped and columns
 * the backup lacks get their defaults, so a backup from a newer or older hub
 * still loads.
 */
async function restorePortable(dataDir: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tables = [...BACKUP_TABLE_ORDER];
    const present = new Set(
      (
        await client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        )
      ).rows.map((r) => r.table_name),
    );
    const known = tables.filter((t) => present.has(t));
    await client.query(`TRUNCATE TABLE ${known.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);

    for (const table of known) {
      const file = path.join(dataDir, `${table}.json`);
      if (!fs.existsSync(file)) continue;
      const rows = JSON.parse(await fsp.readFile(file, 'utf8')) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const columns = (
        await client.query<{ column_name: string; data_type: string }>(
          `SELECT column_name, data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1`,
          [table],
        )
      ).rows;
      const typeOf = new Map(columns.map((c) => [c.column_name, c.data_type]));
      const names = [...typeOf.keys()].filter((name) => rows.some((r) => name in r));
      if (names.length === 0) continue;

      // Postgres allows 65,535 values in one statement.
      const perStatement = Math.max(1, Math.floor(60_000 / names.length));
      for (let start = 0; start < rows.length; start += perStatement) {
        const slice = rows.slice(start, start + perStatement);
        const values: unknown[] = [];
        const tuples = slice.map((row) => {
          const marks = names.map((name) => {
            // A column this row does not have takes the table's default.
            if (!(name in row)) return 'DEFAULT';
            const type = typeOf.get(name);
            let value = row[name];
            if (value !== null && (type === 'jsonb' || type === 'json')) value = JSON.stringify(value);
            values.push(value);
            return `$${values.length}`;
          });
          return `(${marks.join(', ')})`;
        });
        const list = names.map((n) => `"${n}"`).join(', ');
        await client.query(`INSERT INTO "${table}" (${list}) VALUES ${tuples.join(', ')}`, values);
      }
    }

    // The audit log numbers its entries. Carry on from the highest restored.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('audit_log', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM audit_log), 0), 1))`,
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

