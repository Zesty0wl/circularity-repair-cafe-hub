// =============================================================================
//  Words and numbers for the repair queue
//  ---------------------------------------------------------------------------
//  The queue page, the admin dashboard and the live board all describe the
//  same repairs, so they share how a status is named, how a wait is written,
//  and when a wait counts as long.
// =============================================================================

export type RepairStatus = 'waiting' | 'in_progress' | 'completed' | 'cannot_repair' | 'awaiting_return' | 'returned';

/** Plain words for each status, as visitors and volunteers would say them. */
export const STATUS_LABEL: Record<RepairStatus, string> = {
  waiting: 'Waiting',
  in_progress: 'Being repaired',
  completed: 'Fixed',
  cannot_repair: 'Could not fix',
  awaiting_return: 'Coming back with a part',
  returned: 'Collected',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as RepairStatus] ?? status.replace(/_/g, ' ');
}

/** Whole minutes from one moment to another (now, unless given). */
export function minutesBetween(from: string | Date | null | undefined, to: number = Date.now()): number {
  if (!from) return 0;
  const start = typeof from === 'string' ? new Date(from).getTime() : from.getTime();
  return Math.max(0, Math.floor((to - start) / 60000));
}

/** "Just now", "8 min", "1 hr 5 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** How worried to be about a wait: fine, getting long, or too long. */
export function waitTone(minutes: number): 'ok' | 'long' | 'very-long' {
  if (minutes >= 60) return 'very-long';
  if (minutes >= 30) return 'long';
  return 'ok';
}

export const WAIT_TONE_CLASS: Record<ReturnType<typeof waitTone>, string> = {
  ok: 'text-slate-600',
  long: 'text-amber-700 font-semibold',
  'very-long': 'text-rose-700 font-semibold',
};

/** A clock time, "14:05", in the visitor's own time zone. */
export function clockTime(ts: string | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "10:00 to 13:00" from Postgres-style times. */
export function sessionTimes(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '';
  return `${start.slice(0, 5)} to ${end.slice(0, 5)}`;
}

/** First name only, for anything a visitor or the room might see. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Roughly how long the next person in the queue will wait, from how long
 * repairs have taken today and how many people are repairing. Null when there
 * is not enough to go on: a guess with nothing behind it is worse than none.
 */
export function estimatedWaitMinutes(opts: {
  waiting: number;
  repairersBusy: number;
  averageRepairMinutes: number | null;
}): number | null {
  if (!opts.averageRepairMinutes || opts.waiting === 0) return null;
  const lanes = Math.max(1, opts.repairersBusy);
  const minutes = Math.ceil(opts.waiting / lanes) * opts.averageRepairMinutes;
  // Round to five minutes: anything more exact would claim too much.
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** Average minutes from starting a repair to finishing it, or null. */
export function averageRepairMinutes(
  jobs: Array<{ acceptedAt: string | null; completedAt: string | null }>,
): number | null {
  const durations = jobs
    .filter((j) => j.acceptedAt && j.completedAt)
    .map((j) => minutesBetween(j.acceptedAt, new Date(j.completedAt!).getTime()))
    .filter((m) => m > 0 && m < 240);
  if (!durations.length) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}
