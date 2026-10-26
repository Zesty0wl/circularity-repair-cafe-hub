/**
 * Turn a repeating-event rule into a sentence.
 *
 * The admin events page used to print the rule as raw JSON, which meant an
 * organiser looking at their own repeating session saw
 * `{"frequency":"monthly","byWeekday":"SA","bySetPos":2}` instead of
 * "Second Saturday of the month".
 */

import { tNow } from '$lib/i18n';

type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface RecurrenceRule {
  frequency?: 'weekly' | 'biweekly' | 'monthly';
  interval?: number;
  byWeekday?: Weekday | Weekday[];
  bySetPos?: number | number[];
}

const DAY_NAMES: Record<Weekday, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

const POSITIONS: Record<number, string> = {
  1: 'First',
  2: 'Second',
  3: 'Third',
  4: 'Fourth',
  5: 'Fifth',
  [-1]: 'Last',
};

/** "Monday", or "Saturday and Sunday", or "Monday, Wednesday and Friday". */
function joinDays(days: Weekday[]): string {
  const names = days.map((d) => DAY_NAMES[d]).filter(Boolean).map((name) => tNow(name));
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return tNow('{list} and {last}', { list: names.slice(0, -1).join(', '), last: names[names.length - 1] ?? '' });
}

/**
 * A plain-English description, or null when the rule makes no sense. Returning
 * null rather than a half-sentence lets the caller fall back to something
 * sensible instead of showing "Every undefined".
 */
export function describeRecurrence(rule: RecurrenceRule | null | undefined): string | null {
  if (!rule || typeof rule !== 'object') return null;

  const days = Array.isArray(rule.byWeekday)
    ? rule.byWeekday
    : rule.byWeekday
      ? [rule.byWeekday]
      : [];
  const dayText = joinDays(days);
  if (!dayText) return null;

  switch (rule.frequency) {
    case 'weekly':
      return tNow('Every {days}', { days: dayText });
    case 'biweekly':
      return tNow('Every other {days}', { days: dayText });
    case 'monthly': {
      const positions = Array.isArray(rule.bySetPos)
        ? rule.bySetPos
        : rule.bySetPos !== undefined
          ? [rule.bySetPos]
          : [];
      const words = positions.map((p) => POSITIONS[p]).filter(Boolean).map((word) => tNow(word));
      if (words.length === 0) return tNow('Monthly on a {days}', { days: dayText });
      // "Second Saturday of the month", "First and third Saturday of the month"
      const joined =
        words.length === 1
          ? words[0]
          : tNow('{list} and {last}', { list: words.slice(0, -1).join(', '), last: (words[words.length - 1] ?? '').toLowerCase() });
      return tNow('{positions} {days} of the month', { positions: joined, days: dayText });
    }
    default:
      return tNow('Repeats on {days}', { days: dayText });
  }
}

/** "10:00 to 15:00", from either "10:00" or "10:00:00". */
export function describeTimes(start?: string | null, end?: string | null): string {
  const trim = (t?: string | null) => (t ? t.slice(0, 5) : '');
  const a = trim(start);
  const b = trim(end);
  if (a && b) return tNow('{start} to {end}', { start: a, end: b });
  return a || b || '';
}
