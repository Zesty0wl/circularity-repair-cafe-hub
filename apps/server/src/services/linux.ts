// =============================================================================
//  Linux Repair Cafe figures
//  ---------------------------------------------------------------------------
//  A Linux Repair Cafe helps people move an ageing computer to Linux rather
//  than replace it. See https://www.repaircafe.org/en/linux-repair-cafe/.
//
//  Counting these is not the same as counting repairs, so the sums live here
//  rather than being bolted on to the repair stats:
//
//    - A repair asks "does it work again?". An install asks "did somebody go
//      home able to use their computer?", which is true for an install and for
//      a dual boot, and not true for advice or a machine that could not run it.
//    - The interesting breakdowns are different too: which system it ran
//      before (mostly Windows 10, whose support ended in October 2025), and
//      which Linux went on.
//
//  The CO2 saving reuses the same reference data and the same sum as a repair
//  (see services/co2.ts), so the two totals can honestly be added together.
// =============================================================================
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { LINUX_SUCCESS_OUTCOMES } from '@circularity/shared';

/** The outcomes that mean somebody left with Linux on their own computer. */
const SUCCESS_LIST = sql.raw(LINUX_SUCCESS_OUTCOMES.map((o) => `'${o}'`).join(', '));

export interface LinuxStats {
  /** Every computer written up, whatever happened to it. */
  installCount: number;
  /** Those that went home running Linux, on their own or alongside Windows. */
  installedCount: number;
  /** People we talked it through with, or tried it on a USB stick for. */
  advisedCount: number;
  /** Sessions where at least one computer was written up. */
  sessionCount: number;
  /** Volunteers who have done at least one. */
  volunteerCount: number;
  co2SavedKg: number;
}

/**
 * Headline figures, over the whole history.
 *
 * Used by the public Linux page, so it counts only what actually happened and
 * never guesses. A cafe that has just started shows zeros, and the page leaves
 * the band out rather than printing a row of noughts.
 */
export async function linuxStats(): Promise<LinuxStats> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                      AS install_count,
      COUNT(*) FILTER (WHERE outcome IN (${SUCCESS_LIST}))::int          AS installed_count,
      COUNT(*) FILTER (WHERE outcome IN ('tried_live','advice_only'))::int AS advised_count,
      COUNT(DISTINCT event_id)::int                                      AS session_count,
      COUNT(DISTINCT repairer_id) FILTER (WHERE repairer_id IS NOT NULL)::int AS volunteer_count,
      COALESCE(SUM(co2_saving_kg) FILTER (WHERE outcome IN (${SUCCESS_LIST})), 0)::float AS co2_kg
    FROM linux_installs
  `);
  const r = (rows.rows[0] ?? {}) as Record<string, unknown>;
  return {
    installCount: Number(r.install_count ?? 0),
    installedCount: Number(r.installed_count ?? 0),
    advisedCount: Number(r.advised_count ?? 0),
    sessionCount: Number(r.session_count ?? 0),
    volunteerCount: Number(r.volunteer_count ?? 0),
    co2SavedKg: Math.round(Number(r.co2_kg ?? 0) * 10) / 10,
  };
}

/**
 * The same figures for one session, or null when nothing was written up there.
 * Null rather than a set of zeros, so a page can leave the block out entirely.
 */
export async function linuxStatsForEvent(eventId: string): Promise<LinuxStats | null> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                      AS install_count,
      COUNT(*) FILTER (WHERE outcome IN (${SUCCESS_LIST}))::int          AS installed_count,
      COUNT(*) FILTER (WHERE outcome IN ('tried_live','advice_only'))::int AS advised_count,
      COUNT(DISTINCT repairer_id) FILTER (WHERE repairer_id IS NOT NULL)::int AS volunteer_count,
      COALESCE(SUM(co2_saving_kg) FILTER (WHERE outcome IN (${SUCCESS_LIST})), 0)::float AS co2_kg
    FROM linux_installs
    WHERE event_id = ${eventId}
  `);
  const r = (rows.rows[0] ?? {}) as Record<string, unknown>;
  const installCount = Number(r.install_count ?? 0);
  if (installCount === 0) return null;
  return {
    installCount,
    installedCount: Number(r.installed_count ?? 0),
    advisedCount: Number(r.advised_count ?? 0),
    sessionCount: 1,
    volunteerCount: Number(r.volunteer_count ?? 0),
    co2SavedKg: Math.round(Number(r.co2_kg ?? 0) * 10) / 10,
  };
}
