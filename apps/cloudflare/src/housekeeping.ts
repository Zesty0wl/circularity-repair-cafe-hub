// =============================================================================
//  The hourly jobs, without a cron trigger
//  ---------------------------------------------------------------------------
//  The hub has a few jobs to do now and then (see scheduled.ts). Cloudflare's
//  cron triggers would run them, but the free plan allows only five per
//  account, and a cafe's account may already use them for something else. So
//  the jobs ride along with ordinary visits instead: after a request has been
//  answered, the Worker checks whether an hour has passed since the jobs last
//  ran, and if so runs them in the background. The visitor never waits.
//
//  A hub with no visitors at all runs no jobs, which is fine: telemetry, the
//  update check and the map directory only matter when somebody looks.
//
//  If you do have a cron slot free, add this to wrangler.jsonc and the jobs
//  run on the hour as well:
//    "triggers": { "crons": ["17 * * * *"] }
// =============================================================================
import { bindings } from './env.js';
import { ensureDatabase } from './db/migrate.js';
import { runScheduled } from './scheduled.js';

const EVERY_MS = 60 * 60 * 1000;
/** How often one Worker instance asks the database whether the jobs are due. */
const CHECK_EVERY_MS = 10 * 60 * 1000;
const KEY = 'jobs_last_run';

let lastChecked = 0;

/**
 * Run the hourly jobs if they are due. Cheap when they are not: one Worker
 * instance asks the database at most every ten minutes.
 */
export async function maybeRunHousekeeping(
  now = Date.now(),
  jobs: (when: number) => Promise<void> = runScheduled,
): Promise<boolean> {
  if (now - lastChecked < CHECK_EVERY_MS) return false;
  lastChecked = now;
  const db = bindings().DB;
  try {
    await ensureDatabase();
    // Claim the run in one statement, so two Worker instances that check at
    // the same moment do not both run it: only the update that changes a row
    // wins.
    const claimed = await db
      .prepare(
        `INSERT INTO hub_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
         WHERE CAST(hub_meta.value AS INTEGER) < ?`,
      )
      .bind(KEY, String(now), now, now - EVERY_MS)
      .run();
    if ((claimed.meta?.changes ?? 0) === 0) return false;
    await jobs(now);
    return true;
  } catch (err) {
    console.warn('Background jobs could not run, will try again later', err);
    return false;
  }
}

/** For tests: forget when this instance last checked. */
export function resetHousekeepingCheck(): void {
  lastChecked = 0;
}
