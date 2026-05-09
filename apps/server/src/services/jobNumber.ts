import { db } from '../db/index.js';
import { repairJobs } from '../db/schema.js';
import { sql } from 'drizzle-orm';

/**
 * Generates the next sequential job number for the current year.
 * Format: YYYY-NNNN.
 *
 * Done in a single SQL statement so it remains correct under concurrency
 * because each successful insert can resolve the same number; a UNIQUE
 * constraint on job_number forces retry by the caller in the rare race.
 */
export async function nextJobNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `${year}-`;
  const result = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(job_number FROM 6) AS INT)), 0
    ) + 1 AS next
    FROM ${repairJobs}
    WHERE job_number LIKE ${prefix + '%'}
  `);
  const row = result.rows[0] as { next: number | string } | undefined;
  const next = Number(row?.next ?? 1);
  return `${year}-${String(next).padStart(4, '0')}`;
}
