// =============================================================================
//  The hourly jobs
//  ---------------------------------------------------------------------------
//  The old Docker edition runs a timer inside the Node process. A Worker has no
//  process to keep a timer in, so Cloudflare calls this once an hour instead
//  (the cron trigger in wrangler.jsonc). Each job decides for itself whether
//  it is due, from timestamps it keeps in the database, so running it more
//  often than needed is harmless.
// =============================================================================
import { lt } from 'drizzle-orm';
import { db } from './db/index.js';
import { ensureDatabase } from './db/migrate.js';
import { loginAttempts, refreshTokens } from './db/schema.js';
import { telemetryTick } from './services/telemetry.js';
import { updateStatus } from './services/updateCheck.js';
import { getNetworkJson } from './services/repairCafeNetwork.js';

async function quietly(name: string, job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch (err) {
    console.warn(`Scheduled job "${name}" failed, will try again next hour`, err);
  }
}

export async function runScheduled(_when: number): Promise<void> {
  await ensureDatabase();
  // Telemetry: sends at most once a day, and only if the cafe agreed.
  await quietly('telemetry', telemetryTick);
  // Ask GitHub about new versions now, so an admin page never has to wait.
  await quietly('update check', updateStatus);
  // Keep the Repair Cafe directory fresh for the maps. Refreshes when stale.
  await quietly('directory', getNetworkJson);
  // Tidy up: expired sign-ins and old failed login attempts.
  await quietly('tidy', async () => {
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
    await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  });
}
