import type { RecurrenceRule } from '@circularity/shared';

const WEEKDAY_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date | null {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + offset + (n - 1) * 7;
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate.getUTCMonth() !== month) return null;
    return candidate;
  }
  if (n < 0) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    const offset = (last.getUTCDay() - weekday + 7) % 7;
    const day = last.getUTCDate() - offset + (n + 1) * 7;
    if (day < 1) return null;
    return new Date(Date.UTC(year, month, day));
  }
  return null;
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Generate event date instances over a window.
 * fromDate / toDate are inclusive ISO date strings.
 */
export function generateInstances(
  rule: RecurrenceRule,
  fromDate: string,
  toDate: string
): string[] {
  const start = parseIsoDate(fromDate);
  const end = parseIsoDate(toDate);
  const dates: string[] = [];
  const weekdays = asArray(rule.byWeekday).map((wd) => WEEKDAY_INDEX[wd]).filter((w) => w !== undefined);
  if (weekdays.length === 0) return dates;
  const interval = rule.interval ?? 1;

  if (rule.frequency === 'weekly' || rule.frequency === 'biweekly') {
    const stepWeeks = rule.frequency === 'biweekly' ? 2 : interval || 1;
    // Find first matching weekday on or after start, then step in weeks
    // For biweekly we anchor to the first occurrence in window
    const cursor = new Date(start);
    while (cursor <= end) {
      for (const wd of weekdays) {
        const offset = (wd - cursor.getUTCDay() + 7) % 7;
        const candidate = addDays(cursor, offset);
        if (candidate >= start && candidate <= end) {
          const iso = toIsoDate(candidate);
          if (!dates.includes(iso)) dates.push(iso);
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7 * stepWeeks);
    }
  } else if (rule.frequency === 'monthly') {
    const positions = asArray(rule.bySetPos).filter((n) => Number.isFinite(n));
    if (positions.length === 0) positions.push(1);
    let monthCursor = startOfMonth(start);
    while (monthCursor <= end) {
      const y = monthCursor.getUTCFullYear();
      const m = monthCursor.getUTCMonth();
      for (const wd of weekdays) {
        for (const pos of positions) {
          const candidate = nthWeekdayOfMonth(y, m, wd, pos);
          if (candidate && candidate >= start && candidate <= end) {
            const iso = toIsoDate(candidate);
            if (!dates.includes(iso)) dates.push(iso);
          }
        }
      }
      monthCursor = startOfMonth(addDays(endOfMonth(monthCursor), 1));
    }
  }

  dates.sort();
  return dates;
}

export function todayIso(): string {
  const d = new Date();
  return toIsoDate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

export function addMonthsIso(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIsoDate(d);
}
