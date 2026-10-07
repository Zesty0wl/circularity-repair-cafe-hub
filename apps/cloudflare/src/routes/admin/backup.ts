// =============================================================================
//  Backups: download and restore
//  ---------------------------------------------------------------------------
//  The Docker edition streams a zip from the server: a pg_dump plus the
//  uploads folder. A Worker cannot do that. It has a few milliseconds of CPU
//  per request and cannot hold a large zip in memory.
//
//  So the browser builds and reads the zip, and the Worker hands over, or
//  takes in, the contents in small pieces:
//
//    Download (super admins)
//      GET  /api/admin/backup/info                    what to ask for
//      GET  /api/admin/backup/export/table?name=&offset=   one page of rows
//      GET  /api/admin/backup/export/files?cursor=    one page of file names
//      GET  /uploads/<key>                            each file
//      POST /api/admin/backup/export/done             record it in the audit log
//
//    Restore (super admins, or anyone while setup is not finished)
//      POST /api/admin/backup/import/begin            wipe, and get an import token
//      POST /api/setup/import/begin                   the same, on a new hub
//      POST /api/backup/import/rows                   one batch of rows
//      PUT  /api/backup/import/file?path=             one file
//      POST /api/backup/import/finish                 tidy up and fill in defaults
//
//  The zip layout and the row format are described in docs/cloudflare/MIGRATION.md.
// =============================================================================
import { eq } from 'drizzle-orm';
import type { App, HubReply, HubRequest } from '../../lib/router.js';
import { db } from '../../db/index.js';
import { cafes, hubMeta } from '../../db/schema.js';
import { seed } from '../../db/migrate.js';
import { bindings } from '../../env.js';
import { hashToken, randomToken } from '../../utils/tokens.js';
import { audit } from '../../utils/audit.js';
import { APP_VERSION, BACKUP_FORMAT_VERSION, EDITION } from '../../version.js';
import { insertStatement, PortableRowError, TABLES, TABLE_BY_NAME, toPortable } from '../../services/portable.js';
import { resetCafeCache } from '../../services/cafeCache.js';

const CONFIRM_HEADER = 'x-confirm-wipe';
const CONFIRM_VALUE = 'WIPE AND RESTORE';
const IMPORT_HEADER = 'x-import-token';
const IMPORT_SESSION_KEY = 'import_session';
/** Long enough for a slow upload of a few thousand photos. */
const IMPORT_SESSION_MS = 6 * 60 * 60 * 1000;
const EXPORT_PAGE = 500;
const IMPORT_MAX_ROWS = 200;
/** One photo, branding file or QR code. Generous, because old hubs kept large files. */
const IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Files the hub makes for itself and can make again, so they are not backed up. */
const DERIVED_PREFIXES = ['cache/', 'og/', 'pwa/'];

export function isDerived(key: string): boolean {
  return DERIVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** A file path from a backup, made safe to use as a key in the bucket. */
export function safeUploadPath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//, '');
  if (!path || path.length > 512) return null;
  const parts = path.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..')) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(path)) return null;
  return path;
}

// ── Import sessions ──────────────────────────────────────────────────────────

async function startImportSession(): Promise<string> {
  const token = randomToken(32);
  const value = JSON.stringify({ tokenHash: await hashToken(token), expiresAt: Date.now() + IMPORT_SESSION_MS });
  await db
    .insert(hubMeta)
    .values({ key: IMPORT_SESSION_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: hubMeta.key, set: { value, updatedAt: new Date() } });
  return token;
}

/** A preHandler: the request must carry the token from begin. */
async function requireImportSession(request: HubRequest, reply: HubReply): Promise<void> {
  const token = request.headers[IMPORT_HEADER];
  const [row] = await db.select({ value: hubMeta.value }).from(hubMeta).where(eq(hubMeta.key, IMPORT_SESSION_KEY)).limit(1);
  const session = row ? (JSON.parse(row.value) as { tokenHash: string; expiresAt: number }) : null;
  if (!token || !session || session.expiresAt < Date.now() || session.tokenHash !== (await hashToken(token))) {
    reply.code(401).send({
      error: 'This import has expired or was not started. Start it again from the beginning.',
      code: 'import/no_session',
    });
  }
}

/** Empty every table a backup fills, and the bucket apart from caches. */
async function wipeEverything(): Promise<void> {
  const d1 = bindings().DB;
  await d1.batch([...TABLES].reverse().map((t) => d1.prepare(`DELETE FROM "${t.name}"`)));
  // Sign-in attempts belong to the old data too.
  await d1.prepare('DELETE FROM login_attempts').run();

  const bucket = bindings().UPLOADS;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    const keys = page.objects.map((o) => o.key).filter((k) => !k.startsWith('cache/'));
    if (keys.length > 0) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function beginImport(request: HubRequest, reply: HubReply, actor: { id: string | null; role: string }): Promise<unknown> {
  if (request.headers[CONFIRM_HEADER] !== CONFIRM_VALUE) {
    reply.code(400).send({
      error: `Missing or wrong ${CONFIRM_HEADER} header`,
      code: 'restore/confirm_required',
    });
    return;
  }
  const body = (request.body ?? {}) as { manifest?: { backupFormatVersion?: unknown; appVersion?: unknown } };
  const version = Number(body.manifest?.backupFormatVersion);
  if (!Number.isInteger(version) || version < 1) {
    reply.code(400).send({ error: 'This does not look like a hub backup', code: 'restore/bad_manifest' });
    return;
  }
  if (version > BACKUP_FORMAT_VERSION) {
    reply.code(400).send({
      error: `Backup format v${version} is newer than this hub (v${BACKUP_FORMAT_VERSION}). Update the hub first.`,
      code: 'restore/too_new',
    });
    return;
  }
  await wipeEverything();
  resetCafeCache();
  const importToken = await startImportSession();
  console.warn('Restore started: everything was wiped', {
    actor: actor.id,
    from: body.manifest?.appVersion,
    format: version,
  });
  return { ok: true, importToken, tables: TABLES.map((t) => t.name) };
}

// ── Routes for super admins ──────────────────────────────────────────────────

export async function adminBackupRoutes(app: App): Promise<void> {
  const superAdmin = { preHandler: app.requireRole('super_admin') };

  app.get('/api/admin/backup/info', superAdmin, async () => ({
    appVersion: APP_VERSION,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    confirmPhrase: CONFIRM_VALUE,
    edition: EDITION,
    tables: TABLES.map((t) => t.name),
  }));

  app.get('/api/admin/backup/export/table', superAdmin, async (request, reply) => {
    const q = request.query as { name?: string; offset?: string };
    const info = TABLE_BY_NAME.get(String(q.name ?? ''));
    if (!info) {
      reply.code(400).send({ error: 'Unknown table', code: 'backup/unknown_table' });
      return;
    }
    const offset = Math.max(0, Number(q.offset) || 0);
    const result = await bindings()
      .DB.prepare(`SELECT * FROM "${info.name}" ORDER BY rowid LIMIT ? OFFSET ?`)
      .bind(EXPORT_PAGE, offset)
      .all<Record<string, unknown>>();
    const rows = (result.results ?? []).map((row) => toPortable(info, row));
    void reply.header('Cache-Control', 'no-store');
    return { table: info.name, offset, rows, done: rows.length < EXPORT_PAGE };
  });

  app.get('/api/admin/backup/export/files', superAdmin, async (request, reply) => {
    const q = request.query as { cursor?: string };
    const page = await bindings().UPLOADS.list({ cursor: q.cursor || undefined, limit: 500 });
    void reply.header('Cache-Control', 'no-store');
    return {
      files: page.objects.filter((o) => !isDerived(o.key)).map((o) => ({ path: o.key, size: o.size })),
      cursor: page.truncated ? page.cursor : null,
    };
  });

  app.post('/api/admin/backup/export/done', superAdmin, async (request) => {
    const me = request.auth!;
    const body = (request.body ?? {}) as { counts?: Record<string, number>; filename?: string };
    const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'backup.downloaded',
      entityType: 'cafe',
      entityId: cafe?.id ?? null,
      metadata: { appVersion: APP_VERSION, counts: body.counts ?? {}, filename: body.filename ?? null },
    });
    return { ok: true };
  });

  app.post('/api/admin/backup/import/begin', superAdmin, async (request, reply) =>
    beginImport(request, reply, { id: request.auth!.sub, role: request.auth!.role }),
  );
}

// ── Routes anyone can reach on a hub that is not set up yet ──────────────────

export async function setupImportRoutes(app: App): Promise<void> {
  app.post('/api/setup/import/begin', async (request, reply) => {
    const [cafe] = await db.select({ setupCompleted: cafes.setupCompleted }).from(cafes).limit(1);
    if (cafe?.setupCompleted) {
      reply.code(409).send({
        error: 'This hub is already set up. Sign in as a super admin and restore from Settings instead.',
        code: 'setup/already_done',
      });
      return;
    }
    return beginImport(request, reply, { id: null, role: 'setup' });
  });
}

// ── The import itself, for whoever holds the token ───────────────────────────

export async function importRoutes(app: App): Promise<void> {
  app.addHook('preHandler', requireImportSession);

  app.post('/api/backup/import/rows', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const body = (request.body ?? {}) as { table?: string; rows?: unknown[] };
    const info = TABLE_BY_NAME.get(String(body.table ?? ''));
    if (!info) {
      reply.code(400).send({ error: `Unknown table: ${String(body.table)}`, code: 'import/unknown_table' });
      return;
    }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length > IMPORT_MAX_ROWS) {
      reply.code(400).send({ error: `Send at most ${IMPORT_MAX_ROWS} rows at a time`, code: 'import/too_many_rows' });
      return;
    }
    if (rows.length === 0) return { ok: true, inserted: 0 };
    const d1 = bindings().DB;
    let statements: D1PreparedStatement[];
    try {
      statements = rows.map((row) => insertStatement(d1, info, row as Record<string, unknown>));
    } catch (err) {
      if (err instanceof PortableRowError) {
        reply.code(400).send({ error: err.message, code: 'import/bad_row' });
        return;
      }
      throw err;
    }
    try {
      const results = await d1.batch(statements);
      return { ok: true, inserted: results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0) };
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      reply.code(400).send({ error: `Could not import ${info.name}: ${message}`, code: 'import/failed' });
      return;
    }
  });

  app.put('/api/backup/import/file', { bodyLimit: IMPORT_MAX_FILE_BYTES }, async (request, reply) => {
    const q = request.query as { path?: string };
    const path = safeUploadPath(String(q.path ?? ''));
    if (!path || isDerived(path)) {
      reply.code(400).send({ error: 'That file name cannot be used', code: 'import/bad_path' });
      return;
    }
    const bytes = new Uint8Array(await request.raw.arrayBuffer());
    if (bytes.length > IMPORT_MAX_FILE_BYTES) {
      reply.code(413).send({ error: 'That file is too large', code: 'import/too_large' });
      return;
    }
    // The type comes from the file name, never from the request, so a file
    // cannot claim to be something it is not.
    await bindings().UPLOADS.put(path, bytes, {
      httpMetadata: { contentType: contentTypeFor(path), cacheControl: 'public, max-age=86400' },
    });
    return { ok: true, path, size: bytes.length };
  });

  app.post('/api/backup/import/finish', async (request) => {
    const body = (request.body ?? {}) as { manifest?: Record<string, unknown> };
    // Fill in anything an older backup did not have: the default page wording,
    // the CO2 reference data and so on. It never overwrites imported rows.
    await seed(bindings().DB, { force: true });
    await db.delete(hubMeta).where(eq(hubMeta.key, IMPORT_SESSION_KEY));
    resetCafeCache();
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      const row = await bindings().DB.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).first<{ n: number }>();
      counts[t.name] = row?.n ?? 0;
    }
    const [cafe] = await db.select({ id: cafes.id, setupCompleted: cafes.setupCompleted }).from(cafes).limit(1);
    await audit({
      request,
      actorType: 'system',
      action: 'backup.restored',
      entityType: 'cafe',
      entityId: cafe?.id ?? null,
      metadata: {
        sourceAppVersion: body.manifest?.appVersion ?? null,
        backupFormatVersion: body.manifest?.backupFormatVersion ?? null,
        counts,
      },
    });
    return { ok: true, counts, setupCompleted: cafe?.setupCompleted ?? false };
  });
}

function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'ico':
      return 'image/x-icon';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}
