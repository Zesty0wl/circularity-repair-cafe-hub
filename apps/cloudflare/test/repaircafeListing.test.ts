// Asking which repaircafe.org listing is the cafe's own: in the setup wizard
// for a new hub, and once per version on the admin dashboard after an update.
// See routes/admin/listing.ts and routes/setup.ts.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, call, freshHub } from './helpers.js';
import { suggestListings, type NetworkSnapshot } from '../src/services/repairCafeNetwork.js';
import { APP_VERSION } from '../src/version.js';

const listing = (name: string, slug: string, address: string | null, lat = 51.1, lng = 0.2) => ({
  name,
  slug,
  address,
  lat,
  lng,
  website: null,
});

const SNAPSHOT: NetworkSnapshot = {
  cafes: [
    listing('Repair Café Villeneuve dAscq', 'repair-cafe-villeneuve-dascq', 'Villeneuve-d’Ascq, France', 50.6, 3.1),
    listing('Repair Café Villeneuve-Loubet', 'repair-cafe-villeneuve-loubet', null, 43.66, 7.12),
    listing('Tinkerton Repair Café', 'tinkerton-repair-cafe', '1 High Street, Tinkerton TN1 1AA'),
    listing('Hartshorne Fixers', 'hartshorne-fixers', 'Village Hall, Tinkerton'),
  ],
  totalListed: 4,
  fetchedAt: new Date().toISOString(),
  source: 'test',
};

/** Store the directory the way the hub keeps its copy, so no test reaches repaircafe.org. */
async function seedDirectory() {
  await (env as unknown as { UPLOADS: R2Bucket }).UPLOADS.put('cache/repair-cafe-network.json', JSON.stringify(SNAPSHOT), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { version: '2', fetchedAt: String(Date.now()) },
  });
}

const db = () => (env as unknown as { DB: D1Database }).DB;

// One hub for the whole file. It is set up by the wizard test below.
let admin = '';

beforeAll(async () => {
  await freshHub();
  await seedDirectory();
});

describe('suggesting a listing', () => {
  it('needs every distinctive word of the name, so one Villeneuve is not another', () => {
    const found = suggestListings(SNAPSHOT, { name: 'Villeneuve Loubet' });
    expect(found.map((c) => c.slug)).toEqual(['repair-cafe-villeneuve-loubet']);
  });

  it('ranks a name match above a cafe that is only in the same town', () => {
    const found = suggestListings(SNAPSHOT, { name: 'Tinkerton Repair Café', town: 'Tinkerton', postcode: 'TN1 1AA' });
    expect(found.map((c) => c.slug)).toEqual(['tinkerton-repair-cafe', 'hartshorne-fixers']);
  });
});

describe('the setup wizard', () => {
  it('suggests listings before setup, and saves the one chosen', async () => {
    const res = await call('/api/setup/repaircafe-listings?name=Tinkerton%20Repair%20Caf%C3%A9&town=Tinkerton&postcode=TN1%201AA');
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0].slug).toBe('tinkerton-repair-cafe');

    const done = await call('/api/setup/complete', {
      json: {
        admin: ADMIN,
        cafe: { name: 'Tinkerton Repair Café' },
        venue: { name: 'Village Hall', address: '1 High Street\nTinkerton', postcode: 'TN1 1AA' },
        publicUrl: 'https://hub.test',
        repaircafeListing: { slug: 'tinkerton-repair-cafe' },
      },
    });
    expect(done.status).toBe(200);
    admin = done.body.accessToken;

    const answer = await call('/api/admin/repaircafe-listing', { token: admin });
    expect(answer.body.linked.slug).toBe('tinkerton-repair-cafe');
    // The wizard asked, so the dashboard does not ask again.
    expect(answer.body.shouldPrompt).toBe(false);
  });

  it('stops answering once setup is finished', async () => {
    expect((await call('/api/setup/repaircafe-listings?name=Tinkerton')).status).toBe(404);
  });
});

describe('the question after an update', () => {
  beforeAll(async () => {
    // A hub set up by an older wizard, which never asked.
    await db().prepare('UPDATE cafes SET repaircafe_slug = NULL, listing_prompted_version = NULL, listing_not_listed = 0').run();
  });

  it('asks a hub with no listing, with suggestions from its name and venue', async () => {
    const res = await call('/api/admin/repaircafe-listing', { token: admin });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: true, shouldPrompt: true, linked: null });
    expect(res.body.suggestions[0].slug).toBe('tinkerton-repair-cafe');

    const searched = await call('/api/admin/repaircafe-listing?q=hartshorne', { token: admin });
    expect(searched.body.results.map((r: any) => r.slug)).toEqual(['hartshorne-fixers']);
  });

  it('waits for the next update after "Not now"', async () => {
    await call('/api/admin/repaircafe-listing', { method: 'PATCH', token: admin, json: { action: 'not_now' } });
    expect((await call('/api/admin/repaircafe-listing', { token: admin })).body.shouldPrompt).toBe(false);

    // A later version asks again.
    await db().prepare("UPDATE cafes SET listing_prompted_version = '0.0.1'").run();
    expect((await call('/api/admin/repaircafe-listing', { token: admin })).body.shouldPrompt).toBe(true);
  });

  it('stops asking for good after "We are not listed"', async () => {
    await call('/api/admin/repaircafe-listing', { method: 'PATCH', token: admin, json: { action: 'not_listed' } });
    await db().prepare("UPDATE cafes SET listing_prompted_version = '0.0.1'").run();
    expect((await call('/api/admin/repaircafe-listing', { token: admin })).body.shouldPrompt).toBe(false);
  });

  it('links only a listing the directory knows', async () => {
    const bad = await call('/api/admin/repaircafe-listing', {
      method: 'PATCH',
      token: admin,
      json: { action: 'link', slug: 'not-a-real-cafe' },
    });
    expect(bad.status).toBe(400);

    const good = await call('/api/admin/repaircafe-listing', {
      method: 'PATCH',
      token: admin,
      json: { action: 'link', slug: 'tinkerton-repair-cafe' },
    });
    expect(good.body).toEqual({ slug: 'tinkerton-repair-cafe', notListed: false });
    const row = await db()
      .prepare('SELECT repaircafe_slug, listing_prompted_version FROM cafes')
      .first<{ repaircafe_slug: string; listing_prompted_version: string }>();
    expect(row).toEqual({ repaircafe_slug: 'tinkerton-repair-cafe', listing_prompted_version: APP_VERSION });
  });
});
