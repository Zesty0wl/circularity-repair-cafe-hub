// While a super admin restores a backup, the cafe row is empty, so the hub
// looks like a new one. The routes anyone can reach on a new hub must still
// refuse, or a stranger could take the hub over mid-restore. See wasEverSetUp()
// in services/cafeCache.ts.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

const SETUP = {
  admin: { displayName: 'Mallory', email: 'mallory@example.org', password: 'TakeOver1234' },
  cafe: { name: 'Not your cafe' },
  venue: { name: 'Somewhere' },
  publicUrl: 'https://hub.test',
};

describe('a restore in progress', () => {
  let importToken = '';

  it('marks a hub as set up somewhere a restore does not wipe', async () => {
    const admin = (await setUpHub()).token;
    const marker = await (env as unknown as { DB: D1Database }).DB.prepare(
      "SELECT value FROM hub_meta WHERE key = 'setup_done'",
    ).first<{ value: string }>();
    expect(marker?.value).toBe('1');

    const begun = await call('/api/admin/backup/import/begin', {
      token: admin,
      headers: { 'x-confirm-wipe': 'WIPE AND RESTORE' },
      json: { manifest: { backupFormatVersion: 1 } },
    });
    expect(begun.status).toBe(200);
    importToken = begun.body.importToken;
    const cafes = await (env as unknown as { DB: D1Database }).DB.prepare('SELECT COUNT(*) AS n FROM cafes').first<{ n: number }>();
    expect(cafes?.n).toBe(0);
  });

  it('refuses setup from a stranger while the cafe row is empty', async () => {
    const res = await call('/api/setup/complete', { json: SETUP });
    expect(res.status).toBe(409);
    const users = await (env as unknown as { DB: D1Database }).DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE email = 'mallory@example.org'",
    ).first<{ n: number }>();
    expect(users?.n).toBe(0);
  });

  it('refuses a second import from a stranger, and keeps the admin import going', async () => {
    const res = await call('/api/setup/import/begin', {
      headers: { 'x-confirm-wipe': 'WIPE AND RESTORE' },
      json: { manifest: { backupFormatVersion: 1 } },
    });
    expect(res.status).toBe(409);

    const finished = await call('/api/backup/import/finish', {
      headers: { 'x-import-token': importToken },
      json: { manifest: {} },
    });
    expect(finished.status).toBe(200);
  });

  it('still says the hub is set up', async () => {
    expect((await call('/api/setup/status')).body.setupCompleted).toBe(true);
    expect(ADMIN.email).toBeTruthy();
  });
});
