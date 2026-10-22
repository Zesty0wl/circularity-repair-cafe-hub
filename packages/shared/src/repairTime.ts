/**
 * The longest a repair can take and still count as time at the bench.
 *
 * A repair's time runs from when a repairer takes it on to when they finish
 * it. Sometimes that spans more than one session: the item waits weeks for a
 * part, or nobody closes it until the next session. That gap is not repair
 * time, so a repair that took this long or longer is left out of every average
 * and total. A session rarely runs past four hours.
 */
export const MAX_REPAIR_MINUTES = 240;

/** Whether a repair that took this many minutes counts as time at the bench. */
export function isBenchTime(minutes: number): boolean {
  return minutes > 0 && minutes < MAX_REPAIR_MINUTES;
}
