import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { eventImages, events, repairImages, repairJobs, skillCategories, users, venues } from '../db/schema.js';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { deleteImage, saveValidatedImage, uploadUrl } from '../services/imageUpload.js';
import { audit } from '../utils/audit.js';

/**
 * Event galleries
 * ───────────────
 * Two kinds of photo end up on an event's page:
 *
 *  1. Session photos (`event_images`). The room, the team at work, the queue.
 *     Any repairer or admin can add them from a phone or a laptop. They are
 *     published by default, because someone chose to add them.
 *  2. Repair photos (`repair_images`). Taken during a repair, so they show a
 *     visitor's belongings. These stay private until an admin picks them out,
 *     one at a time or all at once.
 *
 * Everyone signed in can add and caption their own session photos. Only admins
 * can publish, hide, reorder, or put a photo in the site's main gallery.
 */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isAdmin(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export async function eventGalleryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireRole('super_admin', 'admin', 'repairer'));

  // ── Events you can add photos to ──────────────────────────────────
  // Everything that has already started, newest first, plus anything in the
  // next week so a volunteer can add a photo the moment a session opens.
  app.get('/api/event-gallery/events', async () => {
    const rows = await db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        venueName: venues.name,
        photoCount: sql<number>`(
          SELECT COUNT(*)::int FROM event_images ei WHERE ei.event_id = ${events.id}
        )`,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(sql`${events.date} <= CURRENT_DATE + INTERVAL '7 days' AND ${events.status} <> 'cancelled'`)
      .orderBy(desc(events.date), desc(events.startTime))
      .limit(60);
    return rows.map((r) => ({ ...r, photoCount: Number(r.photoCount ?? 0) }));
  });

  // ── One event's photos ────────────────────────────────────────────
  // Repairers see the session photos. Admins also get the repair photos, so
  // they can choose which of them to show.
  app.get('/api/event-gallery/:eventId', async (request, reply) => {
    const me = request.auth!;
    const { eventId } = request.params as { eventId: string };
    if (!UUID_RE.test(eventId)) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const [evt] = await db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        isPublished: events.isPublished,
        venueName: venues.name,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(eq(events.id, eventId))
      .limit(1);
    if (!evt) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }

    const photos = await db
      .select({
        id: eventImages.id,
        url: eventImages.filePath,
        caption: eventImages.caption,
        isPublished: eventImages.isPublished,
        showOnHome: eventImages.showOnHome,
        sortOrder: eventImages.sortOrder,
        uploadedBy: eventImages.uploadedBy,
        uploaderName: users.displayName,
        createdAt: eventImages.createdAt,
      })
      .from(eventImages)
      .leftJoin(users, eq(users.id, eventImages.uploadedBy))
      .where(eq(eventImages.eventId, eventId))
      .orderBy(asc(eventImages.sortOrder), asc(eventImages.createdAt));

    const canModerate = isAdmin(me.role);
    const repairPhotos = canModerate
      ? (
          await db
            .select({
              id: repairImages.id,
              url: repairImages.filePath,
              caption: repairImages.caption,
              stage: repairImages.stage,
              isPublished: repairImages.isPublished,
              showOnHome: repairImages.showOnHome,
              createdAt: repairImages.createdAt,
              jobId: repairJobs.id,
              jobNumber: repairJobs.jobNumber,
              itemDescription: repairJobs.itemDescription,
              jobStatus: repairJobs.status,
              categoryName: skillCategories.name,
            })
            .from(repairImages)
            .innerJoin(repairJobs, eq(repairJobs.id, repairImages.repairJobId))
            .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
            .where(eq(repairJobs.eventId, eventId))
            .orderBy(asc(repairJobs.jobNumber), asc(repairImages.createdAt))
        ).map((r) => ({ ...r, url: uploadUrl(r.url) }))
      : [];

    return {
      event: evt,
      canModerate,
      photos: photos.map((p) => ({
        ...p,
        url: uploadUrl(p.url),
        isMine: p.uploadedBy === me.sub,
      })),
      repairPhotos,
    };
  });

  // ── Add a session photo ───────────────────────────────────────────
  // One file per request: the multipart plugin is set to a single file, and
  // uploading one at a time keeps the progress bar honest on a phone.
  app.post('/api/event-gallery/:eventId', async (request, reply) => {
    const me = request.auth!;
    const { eventId } = request.params as { eventId: string };
    if (!UUID_RE.test(eventId)) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const [evt] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!evt) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    if (evt.status === 'cancelled') {
      reply.code(409).send({ error: 'This event was cancelled', code: 'event/cancelled' });
      return;
    }
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ error: 'No file provided', code: 'upload/missing' });
      return;
    }
    const buf = await file.toBuffer();
    try {
      const saved = await saveValidatedImage(buf, file.mimetype, `events/${eventId}`, {
        maxLongestEdge: 1800,
        quality: 0.85,
      });
      const [{ nextOrder }] = await db
        .select({ nextOrder: sql<number>`COALESCE(MAX(${eventImages.sortOrder}), -1) + 1` })
        .from(eventImages)
        .where(eq(eventImages.eventId, eventId));
      const [row] = await db
        .insert(eventImages)
        .values({
          eventId,
          filePath: saved.url,
          fileSizeBytes: saved.size,
          mimeType: saved.mimeType,
          uploadedBy: me.sub,
          sortOrder: Number(nextOrder ?? 0),
        })
        .returning();
      await audit({
        request,
        actorId: me.sub,
        actorType: me.role,
        action: 'event.photo_added',
        entityType: 'event_image',
        entityId: row.id,
        metadata: { eventId },
      });
      return {
        id: row.id,
        url: row.filePath,
        caption: row.caption,
        isPublished: row.isPublished,
        showOnHome: row.showOnHome,
        sortOrder: row.sortOrder,
        uploadedBy: row.uploadedBy,
        uploaderName: me.displayName,
        isMine: true,
        createdAt: row.createdAt,
      };
    } catch (err) {
      request.log.warn({ err }, 'event photo upload failed');
      reply.code(400).send({ error: 'Could not process image', code: 'upload/invalid' });
    }
  });

  // ── Edit a session photo ──────────────────────────────────────────
  // You can caption your own photo. Only admins can change who sees it.
  app.patch('/api/event-gallery/photos/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      caption?: string | null;
      isPublished?: boolean;
      showOnHome?: boolean;
    };
    const [existing] = await db.select().from(eventImages).where(eq(eventImages.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Photo not found', code: 'gallery/not_found' });
      return;
    }
    const admin = isAdmin(me.role);
    if (!admin && existing.uploadedBy !== me.sub) {
      reply.code(403).send({ error: 'You can only edit your own photos', code: 'gallery/not_owner' });
      return;
    }
    const update: Record<string, unknown> = {};
    if ('caption' in body) {
      const caption = (body.caption ?? '').toString().trim().slice(0, 500);
      update.caption = caption || null;
    }
    if (admin) {
      if (typeof body.isPublished === 'boolean') update.isPublished = body.isPublished;
      if (typeof body.showOnHome === 'boolean') update.showOnHome = body.showOnHome;
      // A photo in the main gallery has to be visible on the event page too,
      // otherwise "hidden" would not mean hidden.
      if (update.showOnHome === true) update.isPublished = true;
      if (update.isPublished === false) update.showOnHome = false;
    } else if (body.isPublished !== undefined || body.showOnHome !== undefined) {
      reply.code(403).send({ error: 'Only admins can publish photos', code: 'gallery/not_admin' });
      return;
    }
    if (Object.keys(update).length === 0) return { ok: true };
    const [updated] = await db.update(eventImages).set(update).where(eq(eventImages.id, id)).returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'event.photo_updated',
      entityType: 'event_image',
      entityId: id,
      metadata: { eventId: existing.eventId },
    });
    return { ...updated, url: uploadUrl(updated.filePath) };
  });

  app.delete('/api/event-gallery/photos/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(eventImages).where(eq(eventImages.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Photo not found', code: 'gallery/not_found' });
      return;
    }
    if (!isAdmin(me.role) && existing.uploadedBy !== me.sub) {
      reply.code(403).send({ error: 'You can only remove your own photos', code: 'gallery/not_owner' });
      return;
    }
    await db.delete(eventImages).where(eq(eventImages.id, id));
    await deleteImage(existing.filePath.replace(/^\/uploads\//, ''));
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'event.photo_deleted',
      entityType: 'event_image',
      entityId: id,
      metadata: { eventId: existing.eventId },
    });
    return { ok: true };
  });

  // ── Reorder session photos (admins) ───────────────────────────────
  app.post('/api/event-gallery/:eventId/reorder', async (request, reply) => {
    const me = request.auth!;
    const { eventId } = request.params as { eventId: string };
    const body = (request.body ?? {}) as { ids?: string[] };
    if (!isAdmin(me.role)) {
      reply.code(403).send({ error: 'Only admins can reorder photos', code: 'gallery/not_admin' });
      return;
    }
    if (!Array.isArray(body.ids)) {
      reply.code(400).send({ error: 'ids must be an array', code: 'validation/failed' });
      return;
    }
    for (let i = 0; i < body.ids.length; i++) {
      await db
        .update(eventImages)
        .set({ sortOrder: i })
        .where(and(eq(eventImages.id, body.ids[i]!), eq(eventImages.eventId, eventId)));
    }
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'event.photos_reordered',
      entityType: 'event',
      entityId: eventId,
    });
    return { ok: true };
  });

  // ── Show or hide a repair photo (admins) ──────────────────────────
  app.patch('/api/event-gallery/repair-photos/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      caption?: string | null;
      isPublished?: boolean;
      showOnHome?: boolean;
    };
    if (!isAdmin(me.role)) {
      reply.code(403).send({ error: 'Only admins can publish repair photos', code: 'gallery/not_admin' });
      return;
    }
    const [existing] = await db.select().from(repairImages).where(eq(repairImages.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Photo not found', code: 'gallery/not_found' });
      return;
    }
    const update: Record<string, unknown> = {};
    if ('caption' in body) {
      const caption = (body.caption ?? '').toString().trim().slice(0, 500);
      update.caption = caption || null;
    }
    if (typeof body.isPublished === 'boolean') update.isPublished = body.isPublished;
    if (typeof body.showOnHome === 'boolean') update.showOnHome = body.showOnHome;
    if (update.showOnHome === true) update.isPublished = true;
    if (update.isPublished === false) update.showOnHome = false;
    if (Object.keys(update).length === 0) return { ok: true };
    const [updated] = await db.update(repairImages).set(update).where(eq(repairImages.id, id)).returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'event.repair_photo_updated',
      entityType: 'repair_image',
      entityId: id,
    });
    return { ...updated, url: uploadUrl(updated.filePath) };
  });

  // ── Show or hide every repair photo at an event (admins) ──────────
  // The quick way to fill an event gallery once a session is over. Pass
  // `ids` to limit it to a selection.
  app.post('/api/event-gallery/:eventId/repair-photos/bulk', async (request, reply) => {
    const me = request.auth!;
    const { eventId } = request.params as { eventId: string };
    const body = (request.body ?? {}) as { publish?: boolean; ids?: string[] };
    if (!isAdmin(me.role)) {
      reply.code(403).send({ error: 'Only admins can publish repair photos', code: 'gallery/not_admin' });
      return;
    }
    if (typeof body.publish !== 'boolean') {
      reply.code(400).send({ error: 'publish must be true or false', code: 'validation/failed' });
      return;
    }
    const jobIds = (
      await db.select({ id: repairJobs.id }).from(repairJobs).where(eq(repairJobs.eventId, eventId))
    ).map((r) => r.id);
    if (jobIds.length === 0) return { ok: true, changed: 0 };

    const conditions = [inArray(repairImages.repairJobId, jobIds)];
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      conditions.push(inArray(repairImages.id, body.ids));
    }
    const changed = await db
      .update(repairImages)
      .set(body.publish ? { isPublished: true } : { isPublished: false, showOnHome: false })
      .where(and(...conditions))
      .returning({ id: repairImages.id });
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: body.publish ? 'event.repair_photos_published' : 'event.repair_photos_hidden',
      entityType: 'event',
      entityId: eventId,
      metadata: { count: changed.length },
    });
    return { ok: true, changed: changed.length };
  });
}
