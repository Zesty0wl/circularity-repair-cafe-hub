/**
 * Turn a repeating-event rule into a sentence.
 *
 * The admin events page used to print the rule as raw JSON, which meant an
 * organiser looking at their own repeating session saw
 * `{"frequency":"monthly","byWeekday":"SA","bySetPos":2}` instead of
 * "Second Saturday of the month".
 */

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
  const names = days.map((d) => DAY_NAMES[d]).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
      return `Every ${dayText}`;
    case 'biweekly':
      return `Every other ${dayText}`;
    case 'monthly': {
      const positions = Array.isArray(rule.bySetPos)
        ? rule.bySetPos
        : rule.bySetPos !== undefined
          ? [rule.bySetPos]
          : [];
      const words = positions.map((p) => POSITIONS[p]).filter(Boolean);
      if (words.length === 0) return `Monthly on a ${dayText}`;
      // "Second Saturday of the month", "First and third Saturday of the month"
      const joined =
        words.length === 1
          ? words[0]
          : `${words.slice(0, -1).join(', ')} and ${(words[words.length - 1] ?? '').toLowerCase()}`;
      return `${joined} ${dayText} of the month`;
    }
    default:
      return `Repeats on ${dayText}`;
  }
}

/** "10:00 to 15:00", from either "10:00" or "10:00:00". */
export function describeTimes(start?: string | null, end?: string | null): string {
  const trim = (t?: string | null) => (t ? t.slice(0, 5) : '');
  const a = trim(start);
  const b = trim(end);
  if (a && b) return `${a} to ${b}`;
  return a || b || '';
}
