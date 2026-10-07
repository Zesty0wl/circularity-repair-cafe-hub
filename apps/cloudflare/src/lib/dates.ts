// =============================================================================
//  Dates in the cafe's own time zone
//  ---------------------------------------------------------------------------
//  In the old Docker edition Postgres runs in the cafe's time zone (the TZ
//  setting), so CURRENT_DATE and NOW() there mean the cafe's today. SQLite on
//  D1 only knows UTC. So "today" is worked out here, in the TZ setting, and
//  passed into the query as a value.
// =============================================================================
import { env } from '../env.js';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** The cafe's date today, as 'YYYY-MM-DD'. Postgres's CURRENT_DATE. */
export function localToday(at: Date = new Date()): string {
  return formatter(env.TZ).format(at);
}

/** 'YYYY-MM-DD' plus a number of days, which may be negative. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' plus a number of months, which may be negative. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Minutes to add to UTC to get the cafe's local time at a moment. Used to put
 * check-in times into hours of the day for the reports.
 */
export function offsetMinutes(at: Date, timeZone: string = env.TZ): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
  } catch {
    return 0;
  }
}

/**
 * The moment the cafe's day starts, in milliseconds, for a 'YYYY-MM-DD' date.
 * Postgres's `'2026-10-07'::date` compared with a timestamp.
 */
export function localMidnightMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(utcMidnight)) return NaN;
  // The offset at noon that day is the offset at midnight, except on the two
  // nights a year the clocks change, which nobody runs a session across.
  return utcMidnight - offsetMinutes(new Date(utcMidnight + 12 * 3600_000)) * 60_000;
}
