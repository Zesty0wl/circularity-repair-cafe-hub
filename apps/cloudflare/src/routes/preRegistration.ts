// =============================================================================
//  Pre-registration routes
//  ---------------------------------------------------------------------------
//  Visitors (no sign-in):
//    POST   /api/public/events/:id/pre-register        tell us about an item
//    GET    /api/checkin/:token/pre-registrations      what this visitor sent
//    POST   /api/checkin/:token/arrive                 "I am here": check in
//    DELETE /api/track/:customerToken/pre-registrations/:id   call it off
//
//  Volunteers (signed in):
//    GET    /api/repairer/pre-registrations            everything still to come
//    GET    /api/repairer/pre-registrations/:id        one item
//    PATCH  /api/repairer/pre-registrations/:id/claim  take it to look into
//    PATCH  /api/repairer/pre-registrations/:id/release
//    PATCH  /api/repairer/pre-registrations/:id/notes  what you found out
//    POST   /api/repairer/pre-registrations/:id/check-in   it has arrived
//    PATCH  /api/repairer/pre-registrations/:id/cancel admins only
//
//  All of them answer 404 while the cafe has pre-registration switched off,
//  so a hub that never turns it on behaves exactly as before.
//  See services/preRegistration.ts for how an item becomes a repair.
// =============================================================================
import { and, asc, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { needsPatTest, preRegistrationSchema } from '@circularity/shared';
import type { App, HubReply } from '../lib/router.js';
import { db } from '../db/index.js';
import { events, preRegistrations, skillCategories, users, venues } from '../db/schema.js';
import { localToday } from '../lib/dates.js';
import { audit } from '../utils/audit.js';
import { randomToken } from '../utils/tokens.js';
import {
  CLOSED_MESSAGE,
  MAX_OPEN_PER_EVENT,
  MAX_PER_VISITOR,
  activeEvent,
  cafeFeatures,
  checkInPreRegistration,
  closedReason,
  retentionDate,
} from '../services/preRegistration.js';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function featureOff(reply: HubReply): void {
  reply.code(404).send({ error: 'Pre-registration is switched off', code: 'preregistration/off' });
}

function firstName(name: string | null | undefined): string | null {
  return name ? name.trim().split(/\s+/)[0] ?? null : null;
}

export async function preRegistrationPublicRoutes(app: App): Promise<void> {
  // ── A visitor tells us about an item before the session ────────────────
  app.post('/api/public/events/:id/pre-register', async (request, reply) => {
    const { id } = request.params as { id: string };
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    if (!UUID.test(id)) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!event || !event.isPublished) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const closed = closedReason(event);
    if (closed) {
      reply.code(400).send({ error: CLOSED_MESSAGE[closed], code: 'preregistration/closed' });
      return;
    }
    const parsed = preRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    // A session with a limit on items keeps the same limit here. Every session
    // also has an upper limit, so nobody can fill the list with junk.
    const [{ open }] = await db
      .select({ open: count() })
      .from(preRegistrations)
      .where(and(eq(preRegistrations.eventId, event.id), eq(preRegistrations.status, 'open')));
    const limit = Math.min(event.maxItems ?? MAX_OPEN_PER_EVENT, MAX_OPEN_PER_EVENT);
    if (Number(open) >= limit) {
      reply.code(409).send({
        error: 'This session has no pre-registration places left.',
        code: 'preregistration/full',
      });
      return;
    }

    // A visitor adding a second item keeps the same token, name and consent,
    // so one tracking link shows everything they are bringing.
    let customerToken: string | null = null;
    let customerName = data.customerName ?? null;
    let customerContact = features.enableContactField ? data.customerContact?.trim() || null : null;
    let gdprConsent = data.gdprConsent === true;
    if (data.customerToken) {
      const mine = await db
        .select({
          customerName: preRegistrations.customerName,
          customerContact: preRegistrations.customerContact,
          gdprConsent: preRegistrations.gdprConsent,
          status: preRegistrations.status,
        })
        .from(preRegistrations)
        .where(and(eq(preRegistrations.customerToken, data.customerToken), eq(preRegistrations.eventId, event.id)));
      const known = mine[0];
      if (known) {
        if (mine.filter((m) => m.status === 'open').length >= MAX_PER_VISITOR) {
          reply.code(409).send({
            error: `You can pre-register up to ${MAX_PER_VISITOR} items for one session.`,
            code: 'preregistration/too_many',
          });
          return;
        }
        customerToken = data.customerToken;
        customerName = known.customerName;
        customerContact = known.customerContact;
        gdprConsent = known.gdprConsent;
      } else if (!customerName || !gdprConsent) {
        reply.code(400).send({
          error: 'We could not find your earlier items. Please enter your name again.',
          code: 'preregistration/unknown_token',
        });
        return;
      }
    }
    customerToken ??= randomToken(16);

    const [created] = await db
      .insert(preRegistrations)
      .values({
        eventId: event.id,
        customerName,
        customerContact,
        customerToken,
        itemDescription: data.itemDescription,
        itemCategoryId: data.itemCategoryId ?? null,
        co2FactorId: data.co2FactorId ?? null,
        itemBrand: data.itemBrand ?? null,
        faultDescription: data.faultDescription,
        gdprConsent,
        dataRetentionDate: retentionDate(features.dataRetentionDays),
      })
      .returning();

    await audit({
      request,
      actorType: 'customer',
      action: 'preregistration.created',
      entityType: 'pre_registration',
      entityId: created.id,
      metadata: { eventId: event.id, returning: Boolean(data.customerToken) },
    });
    return { id: created.id, customerToken, status: created.status };
  });

  // ── On the day: what this visitor pre-registered ───────────────────────
  // The check-in page asks this when the visitor's phone still holds the
  // token from pre-registering, so it can offer to check everything in.
  app.get('/api/checkin/:token/pre-registrations', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { customerToken } = request.query as { customerToken?: string };
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const [event] = await db.select().from(events).where(eq(events.checkInToken, token)).limit(1);
    if (!event) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    if (!customerToken || customerToken.length < 8) return { customerName: null, items: [] };
    const rows = await db
      .select({
        id: preRegistrations.id,
        itemDescription: preRegistrations.itemDescription,
        itemBrand: preRegistrations.itemBrand,
        customerName: preRegistrations.customerName,
      })
      .from(preRegistrations)
      .where(
        and(
          eq(preRegistrations.eventId, event.id),
          eq(preRegistrations.customerToken, customerToken),
          eq(preRegistrations.status, 'open'),
        ),
      )
      .orderBy(asc(preRegistrations.createdAt));
    return {
      customerName: rows[0]?.customerName ?? null,
      items: rows.map(({ customerName: _name, ...item }) => item),
    };
  });

  // ── On the day: the visitor checks in everything they pre-registered ───
  app.post('/api/checkin/:token/arrive', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = (request.body ?? {}) as { customerToken?: unknown };
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const [event] = await db.select().from(events).where(eq(events.checkInToken, token)).limit(1);
    if (!event) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    if (event.status !== 'active') {
      reply.code(400).send({ error: 'Event is not currently accepting check-ins', code: 'event/not_active' });
      return;
    }
    const customerToken = typeof body.customerToken === 'string' ? body.customerToken : '';
    if (customerToken.length < 8) {
      reply.code(400).send({ error: 'Tracking token required', code: 'validation/failed' });
      return;
    }
    const open = await db
      .select()
      .from(preRegistrations)
      .where(
        and(
          eq(preRegistrations.eventId, event.id),
          eq(preRegistrations.customerToken, customerToken),
          eq(preRegistrations.status, 'open'),
        ),
      )
      .orderBy(asc(preRegistrations.createdAt));
    const jobs = [];
    for (const pre of open) {
      const job = await checkInPreRegistration(pre);
      if (!job) continue;
      jobs.push({ id: job.id, jobNumber: job.jobNumber, itemDescription: job.itemDescription, status: job.status });
      await audit({
        request,
        actorType: 'customer',
        action: 'preregistration.checked_in',
        entityType: 'pre_registration',
        entityId: pre.id,
        metadata: { eventId: event.id, repairJobId: job.id, jobNumber: job.jobNumber, by: 'visitor' },
      });
    }
    return { customerToken, customerName: open[0]?.customerName ?? null, jobs };
  });

  // ── The visitor calls it off ───────────────────────────────────────────
  // Allowed until the item is checked in. Their tracking link is the only key.
  app.delete('/api/track/:customerToken/pre-registrations/:id', async (request, reply) => {
    const { customerToken, id } = request.params as { customerToken: string; id: string };
    if (!UUID.test(id)) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    const [cancelled] = await db
      .update(preRegistrations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(preRegistrations.id, id),
          eq(preRegistrations.customerToken, customerToken),
          eq(preRegistrations.status, 'open'),
        ),
      )
      .returning({ id: preRegistrations.id, eventId: preRegistrations.eventId });
    if (!cancelled) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    await audit({
      request,
      actorType: 'customer',
      action: 'preregistration.cancelled',
      entityType: 'pre_registration',
      entityId: id,
      metadata: { eventId: cancelled.eventId, by: 'visitor' },
    });
    return { ok: true };
  });
}

export async function preRegistrationStaffRoutes(app: App): Promise<void> {
  app.addHook('preHandler', app.requireRole('super_admin', 'admin', 'repairer'));

  async function load(id: string) {
    if (!UUID.test(id)) return null;
    const [pre] = await db.select().from(preRegistrations).where(eq(preRegistrations.id, id)).limit(1);
    return pre ?? null;
  }

  // Everything still to come, soonest session first. Items from sessions
  // that have finished, or were cancelled, are no longer anyone's work.
  app.get('/api/repairer/pre-registrations', async (request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const me = request.auth!;
    const rows = await db
      .select({
        pre: preRegistrations,
        event: {
          id: events.id,
          name: events.name,
          date: events.date,
          startTime: events.startTime,
          endTime: events.endTime,
          status: events.status,
        },
        category: {
          name: skillCategories.name,
          icon: skillCategories.icon,
          colour: skillCategories.colour,
          isElectrical: skillCategories.isElectrical,
        },
        repairerName: users.displayName,
      })
      .from(preRegistrations)
      .innerJoin(events, eq(events.id, preRegistrations.eventId))
      .leftJoin(skillCategories, eq(skillCategories.id, preRegistrations.itemCategoryId))
      .leftJoin(users, eq(users.id, preRegistrations.repairerId))
      .where(
        and(
          eq(preRegistrations.status, 'open'),
          inArray(events.status, ['scheduled', 'active']),
          gte(events.date, localToday()),
        ),
      )
      .orderBy(asc(events.date), asc(events.startTime), asc(preRegistrations.createdAt));

    return {
      items: rows.map((r) => ({
        id: r.pre.id,
        itemDescription: r.pre.itemDescription,
        itemBrand: r.pre.itemBrand,
        faultDescription: r.pre.faultDescription,
        customerFirstName: firstName(r.pre.customerName),
        createdAt: r.pre.createdAt,
        repairerId: r.pre.repairerId,
        repairerName: r.repairerName,
        claimedAt: r.pre.claimedAt,
        isMine: r.pre.repairerId === me.sub,
        hasNotes: Boolean(r.pre.researchNotes?.trim()),
        categoryId: r.pre.itemCategoryId,
        category: r.category?.name ? r.category : null,
        needsPat: needsPatTest(features.patTestingEnabled, null, r.category?.isElectrical),
        event: r.event,
      })),
    };
  });

  app.get('/api/repairer/pre-registrations/:id', async (request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const { id } = request.params as { id: string };
    if (!UUID.test(id)) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    const [row] = await db
      .select({
        pre: preRegistrations,
        event: events,
        venue: { name: venues.name },
        category: skillCategories,
        repairer: { id: users.id, displayName: users.displayName },
      })
      .from(preRegistrations)
      .innerJoin(events, eq(events.id, preRegistrations.eventId))
      .innerJoin(venues, eq(venues.id, events.venueId))
      .leftJoin(skillCategories, eq(skillCategories.id, preRegistrations.itemCategoryId))
      .leftJoin(users, eq(users.id, preRegistrations.repairerId))
      .where(eq(preRegistrations.id, id))
      .limit(1);
    if (!row) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    const { customerToken: _token, ...pre } = row.pre;
    return {
      preRegistration: pre,
      event: {
        id: row.event.id,
        name: row.event.name,
        date: row.event.date,
        startTime: row.event.startTime,
        endTime: row.event.endTime,
        status: row.event.status,
        venueName: row.venue.name,
      },
      category: row.category?.id ? row.category : null,
      repairer: row.repairer?.id ? row.repairer : null,
      needsPat: needsPatTest(features.patTestingEnabled, null, row.category?.isElectrical),
    };
  });

  app.patch('/api/repairer/pre-registrations/:id/claim', async (request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const pre = await load(id);
    if (!pre) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    if (pre.status !== 'open') {
      reply.code(409).send({ error: 'This item has already been checked in or cancelled', code: 'preregistration/not_open' });
      return;
    }
    if (pre.repairerId === me.sub) return pre;
    const [updated] = await db
      .update(preRegistrations)
      .set({ repairerId: me.sub, claimedAt: new Date(), updatedAt: new Date() })
      .where(eq(preRegistrations.id, id))
      .returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: pre.repairerId ? 'preregistration.taken_over' : 'preregistration.claimed',
      entityType: 'pre_registration',
      entityId: id,
      metadata: pre.repairerId ? { previousRepairerId: pre.repairerId } : undefined,
    });
    return updated;
  });

  app.patch('/api/repairer/pre-registrations/:id/release', async (request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const pre = await load(id);
    if (!pre) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    if (pre.repairerId !== me.sub && me.role === 'repairer') {
      reply.code(403).send({ error: 'Not your item', code: 'preregistration/not_owner' });
      return;
    }
    const [updated] = await db
      .update(preRegistrations)
      .set({ repairerId: null, claimedAt: null, updatedAt: new Date() })
      .where(eq(preRegistrations.id, id))
      .returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'preregistration.released',
      entityType: 'pre_registration',
      entityId: id,
    });
    return updated;
  });

  // Notes stay with the item. Whoever repairs it on the day sees them.
  app.patch('/api/repairer/pre-registrations/:id/notes', async (request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const body = (request.body ?? {}) as { researchNotes?: unknown };
    const notes = typeof body.researchNotes === 'string' ? body.researchNotes.trim() : '';
    if (notes.length > 4000) {
      reply.code(400).send({ error: 'Notes are too long (4,000 characters at most)', code: 'validation/failed' });
      return;
    }
    const pre = await load(id);
    if (!pre) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    if (pre.repairerId !== me.sub && me.role === 'repairer') {
      reply.code(403).send({ error: 'Take this item first, then add your notes', code: 'preregistration/not_owner' });
      return;
    }
    const [updated] = await db
      .update(preRegistrations)
      .set({ researchNotes: notes || null, updatedAt: new Date() })
      .where(eq(preRegistrations.id, id))
      .returning();
    return updated;
  });

  // A volunteer checks the item in when the visitor arrives.
  app.post('/api/repairer/pre-registrations/:id/check-in', async (request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const pre = await load(id);
    if (!pre) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    if (pre.status !== 'open') {
      reply.code(409).send({ error: 'This item has already been checked in or cancelled', code: 'preregistration/not_open' });
      return;
    }
    const running = await activeEvent();
    if (!running || running.id !== pre.eventId) {
      reply.code(400).send({
        error: 'This item can be checked in when its session is running.',
        code: 'event/not_active',
      });
      return;
    }
    const job = await checkInPreRegistration(pre);
    if (!job) {
      reply.code(409).send({ error: 'This item has already been checked in', code: 'preregistration/not_open' });
      return;
    }
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'preregistration.checked_in',
      entityType: 'pre_registration',
      entityId: pre.id,
      metadata: { eventId: pre.eventId, repairJobId: job.id, jobNumber: job.jobNumber, by: 'staff' },
    });
    return { id: job.id, jobNumber: job.jobNumber, status: job.status, repairerId: job.repairerId };
  });

  // For duplicates and items the visitor said they will not bring.
  app.patch('/api/repairer/pre-registrations/:id/cancel', async (request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const { id } = request.params as { id: string };
    const me = request.auth!;
    if (me.role === 'repairer') {
      reply.code(403).send({ error: 'Only admins can cancel a pre-registration', code: 'auth/forbidden' });
      return;
    }
    const [cancelled] = await db
      .update(preRegistrations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(preRegistrations.id, id), eq(preRegistrations.status, 'open')))
      .returning({ id: preRegistrations.id, eventId: preRegistrations.eventId });
    if (!cancelled) {
      reply.code(404).send({ error: 'Not found', code: 'preregistration/not_found' });
      return;
    }
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'preregistration.cancelled',
      entityType: 'pre_registration',
      entityId: id,
      metadata: { eventId: cancelled.eventId, by: 'staff' },
    });
    return { ok: true };
  });

  // The items expected at the session that is running now, for the welcome
  // desk. Includes the visitor's name, so a volunteer can find them.
  app.get('/api/repairer/pre-registrations-today', async (_request, reply) => {
    const features = await cafeFeatures();
    if (!features.preRegistrationEnabled) return featureOff(reply);
    const running = await activeEvent();
    if (!running) return { event: null, items: [] };
    const rows = await db
      .select({
        id: preRegistrations.id,
        customerName: preRegistrations.customerName,
        itemDescription: preRegistrations.itemDescription,
        itemBrand: preRegistrations.itemBrand,
        repairerName: users.displayName,
        category: skillCategories.name,
        categoryColour: skillCategories.colour,
      })
      .from(preRegistrations)
      .leftJoin(users, eq(users.id, preRegistrations.repairerId))
      .leftJoin(skillCategories, eq(skillCategories.id, preRegistrations.itemCategoryId))
      .where(and(eq(preRegistrations.eventId, running.id), eq(preRegistrations.status, 'open')))
      .orderBy(sql`lower(coalesce(${preRegistrations.customerName}, ''))`, asc(preRegistrations.createdAt));
    return { event: { id: running.id, name: running.name }, items: rows };
  });
}
