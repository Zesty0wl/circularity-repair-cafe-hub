// =============================================================================
//  Pre-registration
//  ---------------------------------------------------------------------------
//  A visitor can tell us about an item before a session. A repairer can then
//  take it and look into it: find the manual, a diagram, a part. The item is
//  not a repair yet. It becomes one (a row in repair_jobs) only when it is
//  checked in on the day, by the visitor or by a volunteer.
//
//  Keeping the two apart means every queue, figure and board in the hub only
//  ever counts items that actually arrived, exactly as before.
//
//  On check-in the repair clock starts. If a repairer took the item, it goes
//  straight to them as "being repaired", timed from that moment. If nobody
//  took it, it joins the queue like any other item.
// =============================================================================
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cafes, events, preRegistrations, repairJobs, users, type Event, type PreRegistration } from '../db/schema.js';
import { localToday } from '../lib/dates.js';
import { env } from '../env.js';
import { withJobNumber } from './jobNumber.js';

/** The most items one session will take before the session itself. */
export const MAX_OPEN_PER_EVENT = 200;

/** The most items one visitor may pre-register for one session. */
export const MAX_PER_VISITOR = 10;

/** The two switches and the settings pre-registration needs, in one read. */
export async function cafeFeatures() {
  const [cafe] = await db
    .select({
      preRegistrationEnabled: cafes.preRegistrationEnabled,
      patTestingEnabled: cafes.patTestingEnabled,
      enableContactField: cafes.enableContactField,
      dataRetentionDays: cafes.dataRetentionDays,
    })
    .from(cafes)
    .limit(1);
  return {
    preRegistrationEnabled: cafe?.preRegistrationEnabled ?? false,
    patTestingEnabled: cafe?.patTestingEnabled ?? false,
    enableContactField: cafe?.enableContactField ?? true,
    dataRetentionDays: cafe?.dataRetentionDays ?? env.DATA_RETENTION_DEFAULT_DAYS,
  };
}

/** The day personal details are removed, counted from today. */
export function retentionDate(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Why an event cannot take pre-registrations, or null if it can. Only a
 * published session that has not started yet takes them. Once a session is
 * running, visitors check in at the door instead.
 */
export function closedReason(
  event: Pick<Event, 'isPublished' | 'status' | 'date'>,
): 'not_published' | 'running' | 'finished' | 'cancelled' | null {
  if (!event.isPublished) return 'not_published';
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'active') return 'running';
  if (event.status === 'completed' || event.date < localToday()) return 'finished';
  return null;
}

export const CLOSED_MESSAGE: Record<NonNullable<ReturnType<typeof closedReason>>, string> = {
  not_published: 'This session is not open for pre-registration.',
  running: 'This session has started. Please check in your item at the venue.',
  finished: 'This session has finished.',
  cancelled: 'This session has been cancelled.',
};

/**
 * Turn a pre-registered item into a repair, now. Returns the new repair, or
 * null if somebody else checked it in a moment ago (two volunteers tapping
 * at once, or the visitor and a volunteer).
 */
export async function checkInPreRegistration(pre: PreRegistration, at: Date = new Date()) {
  // Claim the row first, so only one check-in can win.
  const [won] = await db
    .update(preRegistrations)
    .set({ status: 'checked_in', checkedInAt: at, updatedAt: at })
    .where(and(eq(preRegistrations.id, pre.id), eq(preRegistrations.status, 'open')))
    .returning({ id: preRegistrations.id });
  if (!won) return null;

  // The repairer who took it gets it straight away, if they can still sign in.
  let repairerId: string | null = null;
  if (pre.repairerId) {
    const [repairer] = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, pre.repairerId))
      .limit(1);
    if (repairer?.isActive) repairerId = pre.repairerId;
  }

  const features = await cafeFeatures();
  try {
    const [job] = await withJobNumber((jobNumber) =>
      db
        .insert(repairJobs)
        .values({
          eventId: pre.eventId,
          jobNumber,
          customerName: pre.customerName,
          customerContact: pre.customerContact,
          customerToken: pre.customerToken,
          itemDescription: pre.itemDescription,
          itemCategoryId: pre.itemCategoryId,
          co2FactorId: pre.co2FactorId,
          itemBrand: pre.itemBrand,
          faultDescription: pre.faultDescription,
          gdprConsent: pre.gdprConsent,
          dataRetentionDate: retentionDate(features.dataRetentionDays, at),
          status: repairerId ? 'in_progress' : 'waiting',
          repairerId,
          // The repair clock starts now, at check-in, not when it was taken.
          acceptedAt: repairerId ? at : null,
          createdAt: at,
          updatedAt: at,
        })
        .returning(),
    );
    await db
      .update(preRegistrations)
      .set({ repairJobId: job.id, updatedAt: new Date() })
      .where(eq(preRegistrations.id, pre.id));
    return job;
  } catch (err) {
    // Put it back so it can be checked in again.
    await db
      .update(preRegistrations)
      .set({ status: 'open', checkedInAt: null, updatedAt: new Date() })
      .where(eq(preRegistrations.id, pre.id));
    throw err;
  }
}

/** The session that is running now, if there is one. */
export async function activeEvent(): Promise<Event | null> {
  const [evt] = await db.select().from(events).where(eq(events.status, 'active')).orderBy(events.date).limit(1);
  return evt ?? null;
}
