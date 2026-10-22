import { db, inList } from '../db/index.js';
import { repairJobs } from '../db/schema.js';
import { and, eq, ne } from 'drizzle-orm';

/**
 * The statuses in which a visitor still holds their numbered card. A card is
 * handed back when the item leaves, so a number is only taken while its job
 * is in one of these. The unique index in migrations/0006_session_card_number
 * uses the same list.
 */
export const CARD_OPEN_STATUSES = ['waiting', 'in_progress', 'awaiting_return'] as const;

export function holdsCard(status: string): boolean {
  return (CARD_OPEN_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether another open job in this session already has this card number.
 * Pass the job's own id when changing an existing job, so it does not clash
 * with itself.
 */
export async function cardInUse(eventId: string, cardNumber: number, exceptJobId?: string): Promise<boolean> {
  const conditions = [
    eq(repairJobs.eventId, eventId),
    eq(repairJobs.cardNumber, cardNumber),
    inList(repairJobs.status, [...CARD_OPEN_STATUSES]),
  ];
  if (exceptJobId) conditions.push(ne(repairJobs.id, exceptJobId));
  const clash = await db.select({ id: repairJobs.id }).from(repairJobs).where(and(...conditions)).limit(1);
  return clash.length > 0;
}

/** The reply when a card number is already taken. */
export function cardInUseError(cardNumber: number) {
  return {
    error: `Card ${cardNumber} is already with another visitor in this session. Choose a different number.`,
    code: 'checkin/card_in_use',
  };
}
