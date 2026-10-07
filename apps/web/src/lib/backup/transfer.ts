// =============================================================================
//  Backups in the browser
//  ---------------------------------------------------------------------------
//  The hub cannot build or unpack a backup zip itself (see
//  apps/cloudflare/src/routes/admin/backup.ts), so this page does it, talking
//  to the hub in small pieces:
//
//    downloadBackup()   asks for each table and each file, and builds a zip
//    importBackup()     reads a zip, from this hub or an old Docker hub, and sends it back in
//                       batches of rows and one file at a time
//
//  The zip layouts are described in packages/shared/src/backup.ts.
// =============================================================================
import {
  BACKUP_TABLE_ORDER,
  isDerivedUpload,
  pgDumpToPortable,
  type BackupManifest,
  type PortableRow,
} from '@circularity/shared';
import { api } from '$lib/api';
import { readZipDirectory, readZipEntry, readZipText, ZipWriter, type ZipEntry } from './zip';

export interface TransferProgress {
  /** What is happening, in words for the page. */
  message: string;
  done: number;
  total: number;
}

export type OnProgress = (progress: TransferProgress) => void;

const encoder = new TextEncoder();

/** Try a few times before giving up, for a phone on a hall's wifi. */
async function withRetries<T>(what: string, job: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await job();
    } catch (err) {
      lastError = err;
      // A clear refusal from the hub will not change if we ask again.
      const status = (err as { status?: number })?.status ?? 0;
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  const message = (lastError as Error)?.message ?? String(lastError);
  throw new Error(`${what}: ${message}`);
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(body?.error ?? res.statusText), { status: res.status });
  }
  return body as T;
}

/** A file name like "tinkerton-repair-cafe-backup-20261007T0900Z.zip". */
export function backupFilename(cafeName: string): string {
  const slug =
    (cafeName || 'circularity')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'circularity';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').slice(0, 13) + 'Z';
  return `${slug}-backup-${stamp}.zip`;
}

// ── Download ─────────────────────────────────────────────────────────────────

interface BackupInfo {
  appVersion: string;
  backupFormatVersion: number;
  tables: string[];
}

export async function downloadBackup(cafe: { id?: string | null; name?: string | null }, onProgress: OnProgress): Promise<{ blob: Blob; filename: string }> {
  const info = await api<BackupInfo>('/api/admin/backup/info');
  const counts: Record<string, number> = {};
  const data: Array<{ name: string; bytes: Uint8Array }> = [];

  for (const [i, table] of info.tables.entries()) {
    onProgress({ message: `Reading ${table.replace(/_/g, ' ')}`, done: i, total: info.tables.length });
    const rows: PortableRow[] = [];
    for (let offset = 0; ; ) {
      const page = await withRetries(`Reading ${table}`, () =>
        api<{ rows: PortableRow[]; done: boolean }>(
          `/api/admin/backup/export/table?name=${encodeURIComponent(table)}&offset=${offset}`,
        ),
      );
      rows.push(...page.rows);
      offset += page.rows.length;
      if (page.done) break;
    }
    counts[table] = rows.length;
    data.push({ name: `data/${table}.json`, bytes: encoder.encode(JSON.stringify(rows)) });
  }

  const files: Array<{ path: string; size: number }> = [];
  for (let cursor: string | null = ''; cursor !== null; ) {
    const page: { files: Array<{ path: string; size: number }>; cursor: string | null } = await withRetries(
      'Listing photos',
      () => api(`/api/admin/backup/export/files?cursor=${encodeURIComponent(cursor ?? '')}`),
    );
    files.push(...page.files);
    cursor = page.cursor;
  }

  const manifest: BackupManifest = {
    backupFormatVersion: info.backupFormatVersion,
    appVersion: info.appVersion,
    createdAt: new Date().toISOString(),
    edition: 'cloudflare',
    cafe: { id: cafe.id ?? null, name: cafe.name ?? '' },
    counts: { ...counts, uploads: files.length },
    tables: info.tables,
  };

  const zip = new ZipWriter();
  await zip.add('manifest.json', encoder.encode(JSON.stringify(manifest, null, 2)), { compress: true });
  for (const entry of data) await zip.add(entry.name, entry.bytes, { compress: true });

  for (const [i, file] of files.entries()) {
    onProgress({ message: 'Adding photos', done: i, total: files.length });
    const bytes = await withRetries(`Fetching ${file.path}`, async () => {
      const res = await fetch(`/uploads/${file.path.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status });
      return new Uint8Array(await res.arrayBuffer());
    });
    await zip.add(`uploads/${file.path}`, bytes);
  }

  const filename = backupFilename(cafe.name ?? '');
  await api('/api/admin/backup/export/done', { method: 'POST', json: { counts: manifest.counts, filename } }).catch(() => {});
  onProgress({ message: 'Backup ready', done: files.length, total: files.length });
  return { blob: zip.finish(), filename };
}

/** Hand a finished backup to the browser to save. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Reading a backup ─────────────────────────────────────────────────────────

export interface OpenedBackup {
  manifest: BackupManifest;
  /** Rows for each table, ready to send. */
  tables: Map<string, PortableRow[]>;
  /** The uploaded files in the zip, with their path under uploads/. */
  files: Array<{ path: string; entry: ZipEntry }>;
  file: Blob;
}

/** Read a backup zip, from this hub or an old Docker hub, and check it makes sense. */
export async function openBackup(file: Blob): Promise<OpenedBackup> {
  const entries = await readZipDirectory(file);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const manifestEntry = byName.get('manifest.json');
  if (!manifestEntry) throw new Error('This zip has no manifest.json, so it is not a hub backup.');
  const manifest = JSON.parse(await readZipText(file, manifestEntry)) as BackupManifest;
  if (typeof manifest.backupFormatVersion !== 'number') {
    throw new Error('The manifest in this zip does not say which backup format it is.');
  }

  const tables = new Map<string, PortableRow[]>();
  const dump = byName.get('postgres/dump.sql');
  if (dump) {
    // Format 1, from an old Docker hub.
    for (const [name, rows] of pgDumpToPortable(await readZipText(file, dump))) tables.set(name, rows);
  } else {
    // Format 2, from this edition.
    for (const entry of entries) {
      const match = /^data\/([a-z_]+)\.json$/.exec(entry.name);
      if (!match) continue;
      const rows = JSON.parse(await readZipText(file, entry)) as unknown;
      if (!Array.isArray(rows)) throw new Error(`${entry.name} in this backup is not a list of rows.`);
      tables.set(match[1]!, rows as PortableRow[]);
    }
  }
  if (!tables.get('cafes')?.length) throw new Error('This backup has no cafe in it, so there is nothing to restore.');
  if (!tables.get('users')?.length) throw new Error('This backup has no accounts in it, so nobody could sign in after restoring it.');

  const files = entries
    .filter((e) => e.name.startsWith('uploads/') && !e.name.endsWith('/'))
    .map((e) => ({ path: e.name.slice('uploads/'.length), entry: e }))
    .filter((f) => f.path && !isDerivedUpload(f.path));

  return { manifest, tables, files, file };
}

// ── Import ───────────────────────────────────────────────────────────────────

const ROWS_PER_BATCH = 200;
const BYTES_PER_BATCH = 2_000_000;
const PARALLEL_UPLOADS = 3;

function batches(rows: PortableRow[]): PortableRow[][] {
  const out: PortableRow[][] = [];
  let current: PortableRow[] = [];
  let size = 0;
  for (const row of rows) {
    const rowSize = JSON.stringify(row).length;
    if (current.length > 0 && (current.length >= ROWS_PER_BATCH || size + rowSize > BYTES_PER_BATCH)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += rowSize;
  }
  if (current.length > 0) out.push(current);
  return out;
}

export interface ImportOptions {
  /** 'setup' on a new hub, 'admin' when a super admin restores over existing data. */
  mode: 'setup' | 'admin';
  confirmPhrase: string;
  onProgress: OnProgress;
}

export interface ImportResult {
  counts: Record<string, number>;
  files: number;
}

export async function importBackup(backup: OpenedBackup, options: ImportOptions): Promise<ImportResult> {
  const { onProgress } = options;
  const beginPath = options.mode === 'setup' ? '/api/setup/import/begin' : '/api/admin/backup/import/begin';
  onProgress({ message: 'Clearing this hub', done: 0, total: 1 });
  const begun =
    options.mode === 'setup'
      ? await jsonOrThrow<{ importToken: string }>(
          await fetch(beginPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Confirm-Wipe': options.confirmPhrase },
            body: JSON.stringify({ manifest: backup.manifest }),
          }),
        )
      : await api<{ importToken: string }>(beginPath, {
          method: 'POST',
          json: { manifest: backup.manifest },
          headers: { 'X-Confirm-Wipe': options.confirmPhrase },
        });
  const token = begun.importToken;
  const headers = { 'X-Import-Token': token };

  const plan = BACKUP_TABLE_ORDER.flatMap((table) => batches(backup.tables.get(table) ?? []).map((rows) => ({ table, rows })));
  for (const [i, step] of plan.entries()) {
    onProgress({ message: `Copying ${step.table.replace(/_/g, ' ')}`, done: i, total: plan.length });
    await withRetries(`Copying ${step.table}`, async () =>
      jsonOrThrow(
        await fetch('/api/backup/import/rows', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: step.table, rows: step.rows }),
        }),
      ),
    );
  }

  let next = 0;
  let sent = 0;
  const total = backup.files.length;
  const worker = async () => {
    while (next < total) {
      const file = backup.files[next++]!;
      const bytes = await readZipEntry(backup.file, file.entry);
      await withRetries(`Uploading ${file.path}`, async () =>
        jsonOrThrow(
          await fetch(`/api/backup/import/file?path=${encodeURIComponent(file.path)}`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/octet-stream' },
            body: bytes as BodyInit,
          }),
        ),
      );
      sent++;
      onProgress({ message: 'Uploading photos', done: sent, total });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, total) }, worker));

  onProgress({ message: 'Finishing', done: 1, total: 1 });
  const finished = await withRetries('Finishing', async () =>
    jsonOrThrow<{ counts: Record<string, number> }>(
      await fetch('/api/backup/import/finish', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: backup.manifest }),
      }),
    ),
  );
  return { counts: finished.counts, files: sent };
}
