// Moving a cafe across: a backup from a Docker hub imported into a new
// Cloudflare hub, then a Cloudflare backup taken and restored over it. This is
// the same sequence of calls the browser makes (apps/web/src/lib/backup).
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { BACKUP_TABLE_ORDER, pgDumpToPortable, type PortableRow } from '../../../packages/shared/src/backup.js';
import { call, refreshCookie, freshHub } from './helpers.js';
import { DOCKER_DUMP, DOCKER_MANIFEST } from './dockerDump.js';
import { bytes, TINY_JPEG } from './fixtures.js';

const CONFIRM = { 'X-Confirm-Wipe': 'WIPE AND RESTORE' };

async function sendTables(token: string, tables: Map<string, PortableRow[]>): Promise<void> {
  for (const table of BACKUP_TABLE_ORDER) {
    const rows = tables.get(table) ?? [];
    for (let i = 0; i < rows.length; i += 200) {
      const res = await call('/api/backup/import/rows', {
        headers: { 'X-Import-Token': token },
        json: { table, rows: rows.slice(i, i + 200) },
      });
      expect(res.status, `${table}: ${JSON.stringify(res.body)}`).toBe(200);
    }
  }
}

async function putFile(token: string, path: string, data: Uint8Array): Promise<number> {
  const res = await call(`/api/backup/import/file?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'X-Import-Token': token, 'Content-Type': 'application/octet-stream' },
    body: data,
  });
  return res.status;
}

let admin = '';

beforeAll(freshHub);

describe('moving a Docker hub to Cloudflare', () => {
  it('reads every table and type out of the pg_dump', () => {
    const tables = pgDumpToPortable(DOCKER_DUMP);
    const cafe = tables.get('cafes')![0]!;
    expect(cafe.setup_completed).toBe(true);
    expect(cafe.tagline).toBe("Mend it\tdon't end it");
    expect(cafe.local_cafe_slugs).toEqual(['repair-cafe-a', 'repair cafe b']);
    expect((cafe.home_page as any).intro.body).toBe('Line one\nLine two');
    expect(cafe.updated_at).toBe('2026-09-30T17:30:00.000Z');
    expect(cafe.created_at).toBe('2025-03-01T09:00:00.123Z');
    expect(cafe.co2_displacement_rate).toBe(0.5);
    const fixer = tables.get('users')![1]!;
    expect(fixer.bio).toBe('Kettles\nand toasters');
    expect(fixer.skills).toEqual(['11111111-0000-4000-8000-000000000001']);
    expect(fixer.avatar_url).toBeNull();
    expect(tables.get('audit_log')![0]!.id).toBe(1);
  });

  it('refuses to start without the confirmation, or with a backup from the future', async () => {
    const none = await call('/api/setup/import/begin', { json: { manifest: DOCKER_MANIFEST } });
    expect(none.status).toBe(400);
    const future = await call('/api/setup/import/begin', {
      headers: CONFIRM,
      json: { manifest: { ...DOCKER_MANIFEST, backupFormatVersion: 99 } },
    });
    expect(future.status).toBe(400);
    const noToken = await call('/api/backup/import/rows', { json: { table: 'users', rows: [] } });
    expect(noToken.status).toBe(401);
  });

  it('imports the backup into a hub that is not set up yet', async () => {
    expect((await call('/api/setup/status')).body.setupCompleted).toBe(false);
    const begun = await call('/api/setup/import/begin', { headers: CONFIRM, json: { manifest: DOCKER_MANIFEST } });
    expect(begun.status).toBe(200);
    const token = begun.body.importToken as string;

    await sendTables(token, pgDumpToPortable(DOCKER_DUMP));
    expect(await putFile(token, 'profiles/olive.jpg', bytes(TINY_JPEG))).toBe(200);
    expect(await putFile(token, 'branding/logo.jpg', bytes(TINY_JPEG))).toBe(200);
    // Paths that try to escape, or caches the hub makes itself, are refused.
    expect(await putFile(token, '../secret.txt', bytes(TINY_JPEG))).toBe(400);
    expect(await putFile(token, 'og/card.png', bytes(TINY_JPEG))).toBe(400);

    const done = await call('/api/backup/import/finish', {
      headers: { 'X-Import-Token': token },
      json: { manifest: DOCKER_MANIFEST },
    });
    expect(done.status).toBe(200);
    expect(done.body.setupCompleted).toBe(true);
    expect(done.body.counts.users).toBe(2);
    expect(done.body.counts.repair_jobs).toBe(2);
    // Defaults filled in for what the old hub did not have.
    expect(done.body.counts.co2_factors).toBeGreaterThan(30);

    // The token is used up.
    const again = await call('/api/backup/import/rows', {
      headers: { 'X-Import-Token': token },
      json: { table: 'users', rows: [] },
    });
    expect(again.status).toBe(401);
    // And setup cannot be imported over now it is finished.
    const late = await call('/api/setup/import/begin', { headers: CONFIRM, json: { manifest: DOCKER_MANIFEST } });
    expect(late.status).toBe(409);
  });

  it('shows the old cafe on the public site', async () => {
    expect((await call('/api/setup/status')).body.setupCompleted).toBe(true);
    const cafe = await call('/api/public/cafe');
    expect(cafe.body.name).toBe('Old Town Repair Café');
    expect(cafe.body.socialLinks.instagram).toBe('https://instagram.com/oldtown');
    expect(cafe.body.linuxEnabled).toBe(false);
    // The Linux page wording was missing from the old hub, so the default went in.
    const stats = await call('/api/public/stats');
    expect(stats.body.repairCount).toBe(2);
    expect(stats.body.co2SavedKg).toBe(12.5);
    const event = await call('/api/public/events/33333333-0000-4000-8000-000000000001');
    expect(event.body.stats.completedCount).toBe(1);
    const logo = await call('/uploads/branding/logo.jpg');
    expect(logo.status).toBe(200);
    // The QR poster was not in the backup, so it is drawn when asked for.
    const qr = await call('/uploads/qr/33333333-0000-4000-8000-000000000001.png');
    expect(qr.status).toBe(200);
    // The visitor's tracking link still works.
    const track = await call('/api/track/trackme-token-123');
    expect(track.body.jobs[0].outcomeNotes).toBe('Replaced the switch');
  });

  it('keeps people signed in, and keeps their old passwords', async () => {
    // A browser that was signed in to the old hub, at the same address.
    const session = await call('/api/auth/refresh', {
      method: 'POST',
      cookie: 'circ_refresh=docker-refresh-token-0123456789',
    });
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe('owner@example.org');

    const login = await call('/api/auth/login', { json: { email: 'owner@example.org', password: 'OldPassword1' } });
    expect(login.status).toBe(200);
    admin = login.body.accessToken;
    expect(refreshCookie(login)).toMatch(/^circ_refresh=/);

    // The bcrypt hash was replaced on that first sign-in.
    const row = await (env as unknown as { DB: D1Database }).DB.prepare('SELECT password_hash FROM users WHERE email = ?')
      .bind('owner@example.org')
      .first<{ password_hash: string }>();
    expect(row!.password_hash).toMatch(/^pbkdf2\$sha256\$/);
    const second = await call('/api/auth/login', { json: { email: 'owner@example.org', password: 'OldPassword1' } });
    expect(second.status).toBe(200);
    const wrong = await call('/api/auth/login', { json: { email: 'fixer@example.org', password: 'nope' } });
    expect(wrong.status).toBe(401);
  });
});

describe('backing up a Cloudflare hub and restoring it', () => {
  it('exports every table and file, and restores them exactly', async () => {
    const info = await call('/api/admin/backup/info', { token: admin });
    expect(info.status).toBe(200);
    expect(info.body.edition).toBe('cloudflare');
    expect(info.body.backupFormatVersion).toBe(2);

    const tables = new Map<string, PortableRow[]>();
    for (const table of info.body.tables as string[]) {
      const page = await call(`/api/admin/backup/export/table?name=${table}&offset=0`, { token: admin });
      expect(page.status).toBe(200);
      tables.set(table, page.body.rows);
    }
    const files = await call('/api/admin/backup/export/files', { token: admin });
    const paths = (files.body.files as Array<{ path: string }>).map((f) => f.path).sort();
    expect(paths).toContain('branding/logo.jpg');
    expect(paths.every((p) => !p.startsWith('og/') && !p.startsWith('cache/'))).toBe(true);

    const before = Object.fromEntries([...tables].map(([t, rows]) => [t, rows.length]));
    const repairBefore = tables.get('repair_jobs')!.find((r) => r.job_number === '2026-0001');
    expect(repairBefore!.completed_at).toBe('2026-09-20T09:45:00.000Z');
    expect(repairBefore!.gdpr_consent).toBe(true);

    // Repairers cannot take a backup.
    expect((await call('/api/admin/backup/info')).status).toBe(401);

    // Restore over the top, as a super admin.
    const begun = await call('/api/admin/backup/import/begin', {
      token: admin,
      headers: CONFIRM,
      json: { manifest: { backupFormatVersion: 2, appVersion: '1.10.0', createdAt: new Date().toISOString() } },
    });
    expect(begun.status).toBe(200);
    const token = begun.body.importToken;
    // Everything is gone until it is put back.
    expect((await call('/api/setup/status')).body.setupCompleted).toBe(false);
    expect((await call('/uploads/branding/logo.jpg')).status).toBe(404);

    await sendTables(token, tables);
    for (const path of paths) {
      if (path.startsWith('qr/')) continue;
      expect(await putFile(token, path, bytes(TINY_JPEG))).toBe(200);
    }
    const done = await call('/api/backup/import/finish', { headers: { 'X-Import-Token': token }, json: {} });
    expect(done.status).toBe(200);
    // The counts are taken before the restore writes its own audit line.
    for (const [table, n] of Object.entries(before)) {
      expect(done.body.counts[table], table).toBe(n);
    }
    const repairAfter = await call(`/api/admin/backup/export/table?name=repair_jobs&offset=0`, {
      token: (await call('/api/auth/login', { json: { email: 'owner@example.org', password: 'OldPassword1' } })).body.accessToken,
    });
    expect(repairAfter.body.rows.find((r: PortableRow) => r.job_number === '2026-0001')).toEqual(repairBefore);
  });
});
