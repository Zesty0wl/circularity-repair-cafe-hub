import { execute } from '../db/index.js';
import { repairJobs } from '../db/schema.js';
import { sql } from 'drizzle-orm';

/**
 * Generates the next sequential job number for the current year.
 * Format: YYYY-NNNN.
 *
 * Two check-ins at the same moment can work out the same number. The UNIQUE
 * constraint on job_number stops both being saved, and withJobNumber() below
 * tries again with a fresh number.
 */
export async function nextJobNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `${year}-`;
  const result = await execute(sql`
    SELECT COALESCE(
      MAX(CAST(substr(job_number, 6) AS INTEGER)), 0
    ) + 1 AS next
    FROM ${repairJobs}
    WHERE job_number LIKE ${prefix + '%'}
  `);
  const row = result.rows[0] as { next: number | string } | undefined;
  const next = Number(row?.next ?? 1);
  return `${year}-${String(next).padStart(4, '0')}`;
}

/**
 * Run an insert that needs a job number, trying again if another check-in
 * took the same number first. Requests run side by side on Cloudflare far more
 * than in one Node process, so this matters more here than in Docker.
 */
export async function withJobNumber<T>(insert: (jobNumber: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const jobNumber = await nextJobNumber();
    try {
      return await insert(jobNumber);
    } catch (err) {
      // Drizzle wraps the database error, so look at its cause as well.
      const e = err as { message?: string; cause?: { message?: string } };
      const message = `${e?.message ?? err} ${e?.cause?.message ?? ''}`;
      const clash = /UNIQUE constraint failed: repair_jobs\.job_number/i.test(message);
      if (!clash || attempt >= 4) throw err;
    }
  }
}
