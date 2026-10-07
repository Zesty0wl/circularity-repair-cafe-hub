// Resetting the public demo, as demo/seed.py does every hour. The routes are in
// routes/demo.ts. Every call here goes through the same copy of the API, so
// what one call clears from memory, the next one sees.
import { env, withEnv } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, BASE, freshHub, photoForm } from './helpers.js';
import { handleApi } from '../src/app.js';
import { bytes, TINY_JPEG } from './fixtures.js';

beforeAll(freshHub);

const KEY = 'a-long-demo-reset-key-for-tests';

/** Call the API on a demo hub, with or without the reset key. */
async function demo(path: string, init: RequestInit & { json?: unknown } = {}, key: string | null = KEY): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  if (key) headers.set('X-Demo-Key', key);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = (await withEnv({ ...(env as object), DEMO_MODE: 'true', DEMO_RESET_KEY: KEY }, () =>
    handleApi(new Request(`${BASE}${path}`, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body })),
  )) as Response;
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function setUp(): Promise<string> {
  const res = await demo('/api/setup/complete', {
    json: {
      admin: ADMIN,
      cafe: { name: 'Tinkerton Repair Café', primaryColor: '#1B6B5A' },
      venue: { name: 'Village Hall', address: '1 High Street', postcode: 'TN1 1AA' },
      publicUrl: 'https://hub.test',
      telemetry: { level: 'none' },
    },
  }, null);
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

describe('resetting the demo', () => {
  it('is invisible without the key', async () => {
    expect((await demo('/api/demo/status', {}, null)).status).toBe(404);
    expect((await demo('/api/demo/status', {}, 'a-wrong-key-of-a-decent-length')).status).toBe(404);
    expect((await demo('/api/demo/reset', { method: 'POST' }, null)).status).toBe(404);
  });

  it('lets the seeder upload, notices changes, and wipes back to a new hub', async () => {
    const token = await setUp();
    const auth = { Authorization: `Bearer ${token}` };
    // A visitor may not upload on the demo, but the seeder may.
    expect((await demo('/api/repairer/me/avatar', { method: 'POST', headers: auth, body: photoForm(bytes(TINY_JPEG)) }, null)).status).toBe(403);
    expect((await demo('/api/repairer/me/avatar', { method: 'POST', headers: auth, body: photoForm(bytes(TINY_JPEG)) })).status).toBe(200);

    expect((await demo('/api/demo/status')).body.rebuild).toBe(true);
    expect((await demo('/api/demo/seeded', { method: 'POST' })).status).toBe(200);
    expect((await demo('/api/demo/status')).body).toMatchObject({ rebuild: false });

    // A visitor changes something.
    await demo('/api/admin/venues', { headers: auth, json: { name: 'Second Hall', address: '2 Low Road', postcode: 'TN2 2BB' } }, null);
    expect((await demo('/api/demo/status')).body).toMatchObject({ rebuild: true, reason: 'somebody has changed something' });

    expect((await demo('/api/demo/reset', { method: 'POST' })).status).toBe(200);
    expect((await demo('/api/setup/status', {}, null)).body.setupCompleted).toBe(false);
    // The defaults a new hub starts with are back.
    expect((await demo('/api/public/co2-factors', {}, null)).body.factors.length).toBeGreaterThan(0);
    const categories = await (env as unknown as { DB: D1Database }).DB.prepare('SELECT COUNT(*) AS n FROM skill_categories').first<{ n: number }>();
    expect(categories?.n).toBeGreaterThan(0);
    // And it can be set up again, as seed.py does next.
    await setUp();
  });
});
