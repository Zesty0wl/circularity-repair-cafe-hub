import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { cafes, eventTemplates, events, linuxInstalls, repairImages, repairJobs, repairerEvents, skillCategories, users, venues } from '../../db/schema.js';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { eventTemplateSchema, oneOffEventSchema } from '@circularity/shared';
import { addMonthsIso, generateInstances, todayIso } from '../../services/recurrence.js';
import { generateEventQrPng } from '../../services/qrcode.js';
import { checkInToken } from '../../utils/tokens.js';
import { audit } from '../../utils/audit.js';
import { env } from '../../env.js';

async function regenerateQr(eventId: string): Promise<string | null> {
  const [cafe] = await db.select({ publicUrl: cafes.publicUrl }).from(cafes).limit(1);
  if (!cafe || !cafe.publicUrl) return null;
  const [evt] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!evt) return null;
  const token = evt.checkInToken ?? checkInToken();
  const qrUrl = await generateEventQrPng(cafe.publicUrl, token, eventId);
  await db.update(events).set({ qrCodeUrl: qrUrl, checkInToken: token, updatedAt: new Date() }).where(eq(events.id, eventId));
  return qrUrl;
}

export async function adminEventsRoutes(app: FastifyInstance): Promise<void> {
  // List events
  app.get('/api/admin/events', async (request) => {
    const q = request.query as { status?: string; from?: string; to?: string };
    const conditions = [];
    if (q.status) conditions.push(eq(events.status, q.status as any));
    if (q.from) conditions.push(sql`${events.date} >= ${q.from}`);
    if (q.to) conditions.push(sql`${events.date} <= ${q.to}`);
    const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        isPublished: events.isPublished,
        supportsLinux: events.supportsLinux,
        templateId: events.templateId,
        venueId: events.venueId,
        venueName: venues.name,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(whereExpr as any)
      .orderBy(desc(events.date));

    // Job counts per event
    const jobCounts = await db
      .select({ eventId: repairJobs.eventId, c: sql<number>`COUNT(*)::int` })
      .from(repairJobs)
      .groupBy(repairJobs.eventId);
    const map = new Map(jobCounts.map((r) => [r.eventId, Number(r.c)]));
    return rows.map((r) => ({ ...r, jobCount: map.get(r.id) ?? 0 }));
  });

  // Event detail
  app.get('/api/admin/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db
      .select({ event: events, venue: venues })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(eq(events.id, id))
      .limit(1);
    if (rows.length === 0) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const attending = await db
      .select({
        userId: users.id,
        displayName: users.displayName,
        confirmed: repairerEvents.confirmed,
      })
      .from(repairerEvents)
      .innerJoin(users, eq(users.id, repairerEvents.userId))
      .where(eq(repairerEvents.eventId, id));
    const jobs = await db
      .select()
      .from(repairJobs)
      .where(eq(repairJobs.eventId, id))
      .orderBy(desc(repairJobs.createdAt));
    return { ...rows[0], attending, jobs };
  });

  // Create one-off event
  app.post('/api/admin/events', async (request, reply) => {
    const me = request.auth!;
    const parsed = oneOffEventSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const token = checkInToken();
    const [created] = await db
      .insert(events)
      .values({
        name: data.name,
        venueId: data.venueId,
        description: data.description ?? null,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        isPublished: data.isPublished ?? false,
        maxItems: data.maxItems ?? null,
        supportsLinux: data.supportsLinux ?? false,
        checkInToken: token,
        createdBy: me.sub,
      })
      .returning();
    const qrUrl = await regenerateQr(created.id);
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'event.created', entityType: 'event', entityId: created.id });
    return { ...created, qrCodeUrl: qrUrl };
  });

  // Update one-off / individual event
  app.patch('/api/admin/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const body = request.body as any;
    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const update: any = { updatedAt: new Date() };
    for (const k of ['name', 'venueId', 'description', 'date', 'startTime', 'endTime', 'isPublished', 'notes', 'maxItems', 'status', 'supportsLinux']) {
      if (body[k] !== undefined) update[k === 'venueId' ? 'venueId' : k] = body[k];
    }
    if (existing.templateId) update.isTemplateOverride = true;
    const [updated] = await db.update(events).set(update).where(eq(events.id, id)).returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'event.updated', entityType: 'event', entityId: id });
    return updated;
  });

  // Delete a session outright.
  //
  // Only for one put in by mistake, like a duplicate or the wrong date. A
  // session that actually happened should be cancelled or completed instead,
  // so the record of it stays.
  //
  // The database already refuses to remove a session that has repairs against
  // it: repair_jobs.event_id is NO ACTION, so PostgreSQL raises a foreign key
  // error. That is the right answer, but it reaches the browser as an
  // unexplained failure, so we check first and say why in words. Photographs
  // and the list of who was coming are removed with it, because those cascade,
  // which is worth warning about before rather than explaining after.
  app.delete('/api/admin/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;

    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(repairJobs)
      .where(eq(repairJobs.eventId, id));

    if (count > 0) {
      reply.code(409).send({
        error:
          `This session has ${count} repair${count === 1 ? '' : 's'} recorded against it, ` +
          'so it cannot be deleted. Cancel it instead, which keeps the record of what happened.',
        code: 'event/has_repairs',
      });
      return;
    }

    // Linux installs point at the session the same way, so the database would
    // refuse in the same manner. Say so in words rather than letting a foreign
    // key error reach the browser.
    const [{ count: linuxCount }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(linuxInstalls)
      .where(eq(linuxInstalls.eventId, id));

    if (linuxCount > 0) {
      reply.code(409).send({
        error:
          `This session has ${linuxCount} Linux install${linuxCount === 1 ? '' : 's'} recorded ` +
          'against it, so it cannot be deleted. Cancel it instead, which keeps the record of ' +
          'what happened.',
        code: 'event/has_linux_installs',
      });
      return;
    }

    await db.delete(events).where(eq(events.id, id));
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'event.deleted',
      entityType: 'event',
      entityId: id,
      metadata: { name: existing.name, date: existing.date },
    });
    return { ok: true };
  });

  app.post('/api/admin/events/:id/activate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const [updated] = await db
      .update(events)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    if (!updated) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'event.activated', entityType: 'event', entityId: id });
    return updated;
  });

  app.post('/api/admin/events/:id/complete', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const [updated] = await db
      .update(events)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    if (!updated) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'event.completed', entityType: 'event', entityId: id });
    return updated;
  });

  app.post('/api/admin/events/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const [updated] = await db
      .update(events)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    if (!updated) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'event.cancelled', entityType: 'event', entityId: id });
    return updated;
  });

  app.post('/api/admin/events/:id/clone', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { date?: string };
    if (!body?.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      reply.code(400).send({ error: 'Date required', code: 'validation/failed' });
      return;
    }
    const me = request.auth!;
    const [orig] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!orig) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const token = checkInToken();
    const [clone] = await db
      .insert(events)
      .values({
        name: orig.name,
        venueId: orig.venueId,
        description: orig.description,
        date: body.date,
        startTime: orig.startTime,
        endTime: orig.endTime,
        isPublished: orig.isPublished,
        maxItems: orig.maxItems,
        supportsLinux: orig.supportsLinux,
        checkInToken: token,
        templateId: null,
        createdBy: me.sub,
      })
      .returning();
    const qrUrl = await regenerateQr(clone.id);
    return { ...clone, qrCodeUrl: qrUrl };
  });

  app.post('/api/admin/events/:id/regenerate-qr', async (request, reply) => {
    const { id } = request.params as { id: string };
    const url = await regenerateQr(id);
    if (!url) {
      reply.code(400).send({ error: 'Could not generate QR', code: 'qr/failed' });
      return;
    }
    return { url };
  });

  // Repairer attendance
  app.put('/api/admin/events/:id/attendance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { repairers: Array<{ userId: string; confirmed?: boolean }> };
    if (!Array.isArray(body?.repairers)) {
      reply.code(400).send({ error: 'Invalid payload', code: 'validation/failed' });
      return;
    }
    await db.delete(repairerEvents).where(eq(repairerEvents.eventId, id));
    for (const r of body.repairers) {
      await db.insert(repairerEvents).values({ eventId: id, userId: r.userId, confirmed: r.confirmed ?? false }).onConflictDoNothing();
    }
    return { ok: true };
  });

  // Templates
  app.get('/api/admin/event-templates', async () => {
    // Joined to venues so the list can say where a repeating event happens,
    // the same as the events list does. Without it the admin page could only
    // show a name and a rule.
    const rows = await db
      .select({
        id: eventTemplates.id,
        name: eventTemplates.name,
        venueId: eventTemplates.venueId,
        venueName: venues.name,
        description: eventTemplates.description,
        startTime: eventTemplates.startTime,
        endTime: eventTemplates.endTime,
        recurrenceRule: eventTemplates.recurrenceRule,
        recurrenceEndDate: eventTemplates.recurrenceEndDate,
        maxItemsPerSession: eventTemplates.maxItemsPerSession,
        isPublished: eventTemplates.isPublished,
        supportsLinux: eventTemplates.supportsLinux,
      })
      .from(eventTemplates)
      .leftJoin(venues, eq(eventTemplates.venueId, venues.id))
      .orderBy(asc(eventTemplates.name));
    return rows;
  });

  app.post('/api/admin/event-templates', async (request, reply) => {
    const me = request.auth!;
    const parsed = eventTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const [created] = await db
      .insert(eventTemplates)
      .values({
        name: data.name,
        venueId: data.venueId,
        description: data.description ?? null,
        startTime: data.startTime,
        endTime: data.endTime,
        recurrenceRule: data.recurrenceRule as any,
        recurrenceEndDate: data.recurrenceEndDate ?? null,
        maxItemsPerSession: data.maxItemsPerSession ?? null,
        isPublished: data.isPublished ?? false,
        supportsLinux: data.supportsLinux ?? false,
        createdBy: me.sub,
      })
      .returning();

    // Generate instances
    await generateInstancesForTemplate(created.id, me.sub);

    await audit({ request, actorId: me.sub, actorType: me.role, action: 'template.created', entityType: 'event_template', entityId: created.id });
    return created;
  });

  app.patch('/api/admin/event-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const body = request.body as { regenerate?: 'all_future' | 'none'; data: any };
    const parsed = eventTemplateSchema.partial().safeParse(body?.data);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const update: any = { updatedAt: new Date() };
    if (data.name !== undefined) update.name = data.name;
    if (data.venueId !== undefined) update.venueId = data.venueId;
    if (data.description !== undefined) update.description = data.description;
    if (data.startTime !== undefined) update.startTime = data.startTime;
    if (data.endTime !== undefined) update.endTime = data.endTime;
    if (data.recurrenceRule !== undefined) update.recurrenceRule = data.recurrenceRule;
    if (data.recurrenceEndDate !== undefined) update.recurrenceEndDate = data.recurrenceEndDate;
    if (data.maxItemsPerSession !== undefined) update.maxItemsPerSession = data.maxItemsPerSession;
    if (data.isPublished !== undefined) update.isPublished = data.isPublished;
    if (data.supportsLinux !== undefined) update.supportsLinux = data.supportsLinux;
    const [updated] = await db.update(eventTemplates).set(update).where(eq(eventTemplates.id, id)).returning();

    if (body.regenerate === 'all_future') {
      const rebuilt = await regenerateFutureInstances(id, me.sub);
      await audit({
        request,
        actorId: me.sub,
        actorType: me.role,
        action: 'template.regenerated',
        entityType: 'event_template',
        entityId: id,
        metadata: rebuilt,
      });
      return { ...updated, regenerated: rebuilt };
    }
    return updated;
  });

  app.delete('/api/admin/event-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(eventTemplates).where(eq(eventTemplates.id, id));
    return { ok: true };
  });

  // Public QR png passthrough (admin only)
  app.get('/api/admin/events/:id/qr.png', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [evt] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!evt || !evt.qrCodeUrl) {
      reply.code(404).send({ error: 'QR not found', code: 'qr/not_found' });
      return;
    }
    return reply.redirect(evt.qrCodeUrl);
  });
}

/**
 * Rebuild the sessions a repeating event has put on the calendar, from today on.
 *
 * A session that already has something recorded against it is never deleted.
 * Somebody checked an item in there, or a computer was written up, and that is
 * the record of a real day. Deleting it used to fail outright: the database
 * refuses to remove a session that repairs point at, so the whole request
 * ended in an unexplained error and nothing was rebuilt at all. A session
 * running today is the usual victim, because "future" includes today.
 *
 * So those sessions are updated in place instead. They keep their date, their
 * check-in link and their QR poster, which are all in use, and they pick up the
 * changes to the template, which is what the organiser asked for.
 *
 * Everything else is a placeholder nobody has used yet, so it is removed and
 * built again from the current rule. Sessions edited by hand are left alone
 * either way, as they always were.
 */
async function regenerateFutureInstances(
  templateId: string,
  actorId: string,
): Promise<{ kept: number; removed: number }> {
  const [tpl] = await db.select().from(eventTemplates).where(eq(eventTemplates.id, templateId)).limit(1);
  if (!tpl) return { kept: 0, removed: 0 };

  const future = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.templateId, templateId),
        sql`${events.date} >= ${todayIso()}`,
        eq(events.isTemplateOverride, false),
      ),
    );
  const futureIds = future.map((e) => e.id);

  const inUse = new Set<string>();
  if (futureIds.length > 0) {
    const [withRepairs, withLinux] = await Promise.all([
      db
        .selectDistinct({ id: repairJobs.eventId })
        .from(repairJobs)
        .where(inArray(repairJobs.eventId, futureIds)),
      db
        .selectDistinct({ id: linuxInstalls.eventId })
        .from(linuxInstalls)
        .where(inArray(linuxInstalls.eventId, futureIds)),
    ]);
    for (const row of [...withRepairs, ...withLinux]) inUse.add(row.id);
  }

  const removable = futureIds.filter((eventId) => !inUse.has(eventId));
  if (removable.length > 0) {
    await db.delete(events).where(inArray(events.id, removable));
  }

  // The edit still has to reach the sessions we kept, otherwise an organiser
  // who moves the start time, or ticks Linux help, would find today's session
  // quietly left on the old details.
  if (inUse.size > 0) {
    await db
      .update(events)
      .set({
        name: tpl.name,
        venueId: tpl.venueId,
        description: tpl.description,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        isPublished: tpl.isPublished,
        maxItems: tpl.maxItemsPerSession,
        supportsLinux: tpl.supportsLinux,
        updatedAt: new Date(),
      })
      .where(inArray(events.id, [...inUse]));
  }

  await generateInstancesForTemplate(templateId, actorId);
  return { kept: inUse.size, removed: removable.length };
}

async function generateInstancesForTemplate(templateId: string, createdBy: string): Promise<void> {
  const [tpl] = await db.select().from(eventTemplates).where(eq(eventTemplates.id, templateId)).limit(1);
  if (!tpl) return;
  const [cafe] = await db.select({ publicUrl: cafes.publicUrl }).from(cafes).limit(1);
  const from = todayIso();
  const to = tpl.recurrenceEndDate ?? addMonthsIso(from, env.EVENT_GENERATION_MONTHS);
  const dates = generateInstances(tpl.recurrenceRule as any, from, to);
  for (const date of dates) {
    // Skip if instance already exists for this template+date
    const exists = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.templateId, templateId), eq(events.date, date)))
      .limit(1);
    if (exists.length > 0) continue;
    const token = checkInToken();
    const [created] = await db
      .insert(events)
      .values({
        templateId,
        name: tpl.name,
        venueId: tpl.venueId,
        description: tpl.description,
        date,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        isPublished: tpl.isPublished,
        maxItems: tpl.maxItemsPerSession,
        supportsLinux: tpl.supportsLinux,
        checkInToken: token,
        createdBy,
      })
      .returning();
    if (cafe?.publicUrl) {
      const qrUrl = await generateEventQrPng(cafe.publicUrl, token, created.id);
      await db.update(events).set({ qrCodeUrl: qrUrl }).where(eq(events.id, created.id));
    }
  }
}
