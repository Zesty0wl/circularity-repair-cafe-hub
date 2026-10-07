// =============================================================================
//  Resetting the public demo site
//  ---------------------------------------------------------------------------
//  The public demo publishes its password, so it is wiped and filled again
//  with an invented cafe every hour (see demo/seed.py and
//  .github/workflows/demo-reset.yml). These routes let the seeder do that over
//  HTTP, the same way the browser talks to the hub.
//
//      GET  /api/demo/status   has anybody changed anything since the last seed?
//      POST /api/demo/reset    wipe everything, as if the hub were brand new
//      POST /api/demo/seeded   the seeder has finished: remember this moment
//
//  They exist only on a hub with DEMO_MODE on and a DEMO_RESET_KEY secret set,
//  and only for a request that carries that key. Anywhere else they answer 404,
//  exactly as if they were not there.
// =============================================================================
import type { App, HubReply, HubRequest } from '../lib/router.js';
import { bindings, env } from '../env.js';
import { seed } from '../db/migrate.js';
import { localToday } from '../lib/dates.js';
import { resetCafeCache } from '../services/cafeCache.js';
import { wipeEverything } from './admin/backup.js';
import { hasDemoKey } from '../plugins/demoMode.js';

const STATE_KEY = 'demo_seed';

interface SeedState {
  /** What the data looked like when the seeder finished. */
  fingerprint: string;
  /** The cafe's local date then. The seed opens a session "today". */
  day: string;
  /** When the seeder finished, in milliseconds. */
  at: number;
}

/**
 * A short summary of the data. If it is the same as when the seeder finished,
 * nobody has changed anything. The audit log covers signing in and checking an
 * item in. The counts and newest times cover edits that are not audited.
 */
async function fingerprint(): Promise<string> {
  const row = await bindings()
    .DB.prepare(
      `SELECT
         (SELECT COALESCE(MAX(id), 0) FROM audit_log) AS a,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(updated_at), 0) FROM repair_jobs) AS j,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(updated_at), 0) FROM events) AS e,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(updated_at), 0) FROM users) AS u,
         (SELECT COALESCE(MAX(updated_at), 0) FROM cafes) AS c,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at), 0) FROM venues) AS v,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at), 0) FROM cafe_gallery) AS g,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at), 0) FROM event_images) AS i,
         (SELECT COUNT(*) FROM skill_categories) AS s`,
    )
    .first<Record<string, string | number>>();
  return Object.values(row ?? {}).join('|');
}

async function readState(): Promise<SeedState | null> {
  const row = await bindings()
    .DB.prepare('SELECT value FROM hub_meta WHERE key = ?')
    .bind(STATE_KEY)
    .first<{ value: string }>();
  return row ? (JSON.parse(row.value) as SeedState) : null;
}

/** A preHandler: answer 404 unless this is the demo and the key is right. */
async function requireDemoKey(request: HubRequest, reply: HubReply): Promise<void> {
  if (!env.DEMO_MODE || !(await hasDemoKey(request))) {
    reply.code(404).send({ error: 'Not found', code: 'not_found' });
  }
}

export async function demoRoutes(app: App): Promise<void> {
  const keyed = { preHandler: requireDemoKey };

  app.get('/api/demo/status', keyed, async () => {
    const state = await readState();
    const now = await fingerprint();
    const lastAudit = await bindings()
      .DB.prepare('SELECT MAX(created_at) AS at FROM audit_log')
      .first<{ at: number | null }>();
    let reason = '';
    if (!state) reason = 'there is no record of a previous seed';
    else if (state.day !== localToday()) reason = "the date has changed, so today's session is out of date";
    else if (state.fingerprint !== now) reason = 'somebody has changed something';
    return {
      rebuild: reason !== '',
      reason: reason || 'nothing has changed',
      secondsSinceSeed: state?.at ? Math.round((Date.now() - state.at) / 1000) : null,
      secondsSinceActivity: lastAudit?.at ? Math.round((Date.now() - lastAudit.at) / 1000) : null,
    };
  });

  app.post('/api/demo/reset', keyed, async () => {
    await wipeEverything();
    await bindings().DB.prepare('DELETE FROM hub_meta WHERE key = ?').bind(STATE_KEY).run();
    // Put back what a brand new hub starts with: the empty cafe row, the
    // default skill categories and the CO2 figures.
    await seed(bindings().DB, { force: true });
    resetCafeCache();
    return { ok: true };
  });

  app.post('/api/demo/seeded', keyed, async () => {
    const state: SeedState = { fingerprint: await fingerprint(), day: localToday(), at: Date.now() };
    await bindings()
      .DB.prepare(
        `INSERT INTO hub_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(STATE_KEY, JSON.stringify(state), Date.now())
      .run();
    return { ok: true };
  });
}
