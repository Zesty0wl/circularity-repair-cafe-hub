// The recurring-session rules are plain date arithmetic with no Node in them,
// so they are shared with the Docker edition rather than copied.
//
// todayIso() is the one exception. The Docker edition reads the container's
// local date, which is the cafe's own because Docker sets TZ. A Worker's
// local date is always UTC, so "today" comes from lib/dates.ts instead.
export { addMonthsIso, generateInstances } from '../../../server/src/services/recurrence.js';
export { localToday as todayIso } from '../lib/dates.js';
