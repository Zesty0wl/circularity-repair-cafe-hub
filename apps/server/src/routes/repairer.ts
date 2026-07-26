import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cafes, events, repairImages, repairJobs, skillCategories, users, venues } from '../db/schema.js';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { assistedCheckInSchema } from '@circularity/shared';
import { saveValidatedImage } from '../services/imageUpload.js';
import { nextJobNumber } from '../services/jobNumber.js';
import { randomToken } from '../utils/tokens.js';
import { audit } from '../utils/audit.js';
import { env } from '../env.js';
import { resolveSaving } from '../services/co2.js';

export async function repairerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireRole('super_admin', 'admin', 'repairer'));

  app.get('/api/repairer/me', async (request) => {
    const me = request.auth!;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, me.sub))
      .limit(1);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      role: user.role,
      skills: user.skills,
      joinDate: user.joinDate,
      repairCountCache: user.repairCountCache,
      showOnPublicPage: user.showOnPublicPage,
      showOnHomePage: user.showOnHomePage,
    };
  });

  // Update your own profile. Repairers can edit their display name, bio and
  // public-visibility toggle. Skills, role and email remain admin-only.
  app.patch('/api/repairer/me', async (request, reply) => {
    const me = request.auth!;
    const body = (request.body ?? {}) as {
      displayName?: string;
      bio?: string | null;
      showOnPublicPage?: boolean;
      showOnHomePage?: boolean;
    };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.displayName === 'string') {
      const trimmed = body.displayName.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        reply.code(400).send({ error: 'Display name must be 1–100 characters', code: 'validation/failed' });
        return;
      }
      update.displayName = trimmed;
    }
    if ('bio' in body) {
      if (body.bio === null || body.bio === '') {
        update.bio = null;
      } else if (typeof body.bio === 'string') {
        if (body.bio.length > 2000) {
          reply.code(400).send({ error: 'Bio is too long (max 2000 chars)', code: 'validation/failed' });
          return;
        }
        update.bio = body.bio;
      }
    }
    if (typeof body.showOnPublicPage === 'boolean') {
      update.showOnPublicPage = body.showOnPublicPage;
    }
    if (typeof body.showOnHomePage === 'boolean') {
      update.showOnHomePage = body.showOnHomePage;
    }
    const [updated] = await db.update(users).set(update).where(eq(users.id, me.sub)).returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'user.self_updated',
      entityType: 'user',
      entityId: me.sub,
    });
    return {
      id: updated.id,
      displayName: updated.displayName,
      bio: updated.bio,
      avatarUrl: updated.avatarUrl,
      showOnPublicPage: updated.showOnPublicPage,
      showOnHomePage: updated.showOnHomePage,
    };
  });

  // Upload your own avatar. Mirrors the admin avatar endpoint but scoped to self.
  app.post('/api/repairer/me/avatar', async (request, reply) => {
    const me = request.auth!;
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ error: 'No file provided', code: 'upload/missing' });
      return;
    }
    const buf = await file.toBuffer();
    try {
      const saved = await saveValidatedImage(buf, file.mimetype, 'profiles', {
        maxLongestEdge: 600,
        quality: 0.85,
      });
      await db.update(users).set({ avatarUrl: saved.url, updatedAt: new Date() }).where(eq(users.id, me.sub));
      await audit({
        request,
        actorId: me.sub,
        actorType: me.role,
        action: 'user.avatar_self_updated',
        entityType: 'user',
        entityId: me.sub,
      });
      return { url: saved.url };
    } catch (err) {
      request.log.warn({ err }, 'avatar upload failed');
      reply.code(400).send({ error: 'Could not process image', code: 'upload/invalid' });
    }
  });

  app.delete('/api/repairer/me/avatar', async (request) => {
    const me = request.auth!;
    await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, me.sub));
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'user.avatar_self_removed',
      entityType: 'user',
      entityId: me.sub,
    });
    return { ok: true };
  });

  app.get('/api/repairer/active-event', async (request) => {
    const me = request.auth!;
    const rows = await db
      .select({ event: events, venue: venues })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(eq(events.status, 'active'))
      .orderBy(asc(events.date))
      .limit(1);
    if (rows.length === 0) {
      return { event: null, jobs: [], counts: null, myJobs: [] };
    }
    const evt = rows[0].event;
    const jobs = await db
      .select({
        id: repairJobs.id,
        jobNumber: repairJobs.jobNumber,
        customerName: repairJobs.customerName,
        itemDescription: repairJobs.itemDescription,
        faultDescription: repairJobs.faultDescription,
        itemBrand: repairJobs.itemBrand,
        status: repairJobs.status,
        repairerId: repairJobs.repairerId,
        repairerName: users.displayName,
        createdAt: repairJobs.createdAt,
        category: skillCategories.name,
        categoryIcon: skillCategories.icon,
        categoryColour: skillCategories.colour,
      })
      .from(repairJobs)
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .leftJoin(users, eq(users.id, repairJobs.repairerId))
      .where(eq(repairJobs.eventId, evt.id))
      .orderBy(desc(repairJobs.createdAt));

    const counts = {
      waiting: jobs.filter((j) => j.status === 'waiting').length,
      in_progress: jobs.filter((j) => j.status === 'in_progress').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      cannot_repair: jobs.filter((j) => j.status === 'cannot_repair').length,
      awaiting_return: jobs.filter((j) => j.status === 'awaiting_return').length,
    };

    return {
      event: { ...evt, venueName: rows[0].venue.name },
      jobs,
      counts,
      myJobs: jobs.filter((j) => j.repairerId === me.sub && j.status === 'in_progress'),
    };
  });

  // Staff-assisted check-in. Lets a logged-in repairer register an item on
  // behalf of a walk-in who can't use the QR self-service flow (e.g. no phone).
  // The job is created against the *active* event — the same one the dashboard
  // shows — so it drops straight into the shared queue everyone is watching.
  app.post('/api/repairer/checkin', async (request, reply) => {
    const me = request.auth!;
    const parsed = assistedCheckInSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const [activeEvent] = await db
      .select()
      .from(events)
      .where(eq(events.status, 'active'))
      .orderBy(asc(events.date))
      .limit(1);
    if (!activeEvent) {
      reply.code(400).send({ error: 'There is no active event to check in to', code: 'event/not_active' });
      return;
    }

    const customerName = data.customerName?.trim() || null;
    const customerContact = data.customerContact?.trim() || null;
    // Only record consent when we are actually storing something personal.
    const hasPii = Boolean(customerName) || Boolean(customerContact);
    const gdprConsent = hasPii ? data.gdprConsent === true : false;
    // Mint a tracking token like the public flow so the item still has a stable
    // tracker, even though a device-less customer will rely on the job number.
    const customerToken = randomToken(16);

    const jobNumber = await nextJobNumber();
    const [cafe] = await db.select({ dataRetentionDays: cafes.dataRetentionDays }).from(cafes).limit(1);
    const retentionDays = cafe?.dataRetentionDays ?? env.DATA_RETENTION_DEFAULT_DAYS;
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + retentionDays);

    const [job] = await db
      .insert(repairJobs)
      .values({
        eventId: activeEvent.id,
        jobNumber,
        customerName,
        customerContact,
        customerToken,
        itemDescription: data.itemDescription,
        itemCategoryId: data.itemCategoryId ?? null,
        // Recorded now so the CO2 saving can be worked out at the end. The
        // repairer can correct it if the visitor picked the wrong thing.
        co2FactorId: data.co2FactorId ?? null,
        itemBrand: data.itemBrand ?? null,
        faultDescription: data.faultDescription,
        gdprConsent,
        dataRetentionDate: retentionDate.toISOString().slice(0, 10),
      })
      .returning();

    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'checkin.assisted',
      entityType: 'repair_job',
      entityId: job.id,
      metadata: { eventId: activeEvent.id, jobNumber },
    });

    return {
      id: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      customerToken,
    };
  });

  app.get('/api/repairer/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db
      .select({
        job: repairJobs,
        category: skillCategories,
        event: events,
        venue: venues,
        repairer: users,
      })
      .from(repairJobs)
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .innerJoin(venues, eq(venues.id, events.venueId))
      .leftJoin(users, eq(users.id, repairJobs.repairerId))
      .where(eq(repairJobs.id, id))
      .limit(1);
    if (rows.length === 0) {
      reply.code(404).send({ error: 'Job not found', code: 'job/not_found' });
      return;
    }
    const images = await db
      .select()
      .from(repairImages)
      .where(eq(repairImages.repairJobId, id))
      .orderBy(asc(repairImages.createdAt));
    return { ...rows[0], images };
  });

  app.patch('/api/repairer/jobs/:id/accept', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const [existing] = await db.select().from(repairJobs).where(eq(repairJobs.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Job not found', code: 'job/not_found' });
      return;
    }
    if (existing.status === 'completed' || existing.status === 'cannot_repair') {
      reply.code(409).send({ error: 'Job is already finished', code: 'job/already_finished' });
      return;
    }
    if (existing.status === 'in_progress' && existing.repairerId === me.sub) {
      // Already mine — no-op
      return existing;
    }
    const isTakeover = existing.status === 'in_progress' && existing.repairerId && existing.repairerId !== me.sub;
    const previousRepairerId = existing.repairerId;
    const [updated] = await db
      .update(repairJobs)
      .set({ status: 'in_progress', repairerId: me.sub, acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(repairJobs.id, id))
      .returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: isTakeover ? 'repair.taken_over' : 'repair.accepted',
      entityType: 'repair_job',
      entityId: id,
      metadata: isTakeover ? { previousRepairerId } : undefined,
    });
    return updated;
  });

  app.patch('/api/repairer/jobs/:id/release', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const [existing] = await db.select().from(repairJobs).where(eq(repairJobs.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Job not found', code: 'job/not_found' });
      return;
    }
    if (existing.repairerId !== me.sub && me.role === 'repairer') {
      reply.code(403).send({ error: 'Not your job', code: 'job/not_owner' });
      return;
    }
    const [updated] = await db
      .update(repairJobs)
      .set({ status: 'waiting', repairerId: null, acceptedAt: null, updatedAt: new Date() })
      .where(eq(repairJobs.id, id))
      .returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'repair.released',
      entityType: 'repair_job',
      entityId: id,
    });
    return updated;
  });

  app.patch('/api/repairer/jobs/:id/complete', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      outcome: 'completed' | 'cannot_repair' | 'awaiting_return';
      outcomeNotes?: string;
      partsUsed?: string;
      environmentalSavingKg?: number | null;
      /** Lets a repairer correct what the visitor picked. */
      co2FactorId?: string | null;
    };
    const me = request.auth!;
    if (!['completed', 'cannot_repair', 'awaiting_return'].includes(body?.outcome)) {
      reply.code(400).send({ error: 'Outcome required', code: 'validation/failed' });
      return;
    }
    // "Awaiting return" pauses a repair rather than finishing it: the visitor
    // is coming back with a part at a later session. So it does not count
    // towards a repairer's total and it does not set completedAt.
    const isPaused = body.outcome === 'awaiting_return';
    const [existing] = await db.select().from(repairJobs).where(eq(repairJobs.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Job not found', code: 'job/not_found' });
      return;
    }
    if (existing.repairerId !== me.sub && me.role === 'repairer') {
      reply.code(403).send({ error: 'Not your job', code: 'job/not_owner' });
      return;
    }
    // Work the saving out from the kind of thing it is. A number typed in by
    // hand always wins: whoever did that has looked at the actual item.
    const factorId =
      body.co2FactorId !== undefined ? body.co2FactorId : existing.co2FactorId ?? null;
    const manualKg =
      body.environmentalSavingKg !== undefined && body.environmentalSavingKg !== null
        ? body.environmentalSavingKg
        : null;
    const saving = await resolveSaving({ factorId, manualKg });

    const [updated] = await db
      .update(repairJobs)
      .set({
        status: body.outcome,
        outcomeNotes: body.outcomeNotes ?? existing.outcomeNotes ?? null,
        partsUsed: body.partsUsed ?? existing.partsUsed ?? null,
        co2FactorId: factorId,
        co2SavingKg: saving.savingKg === null ? null : String(saving.savingKg),
        co2SavingSource: saving.source,
        environmentalSavingKg:
          body.environmentalSavingKg !== undefined && body.environmentalSavingKg !== null
            ? String(body.environmentalSavingKg)
            : existing.environmentalSavingKg,
        completedAt: isPaused ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(repairJobs.id, id))
      .returning();

    if (existing.repairerId && !isPaused) {
      await db.execute(
        sql`UPDATE users SET repair_count_cache = repair_count_cache + 1 WHERE id = ${existing.repairerId}`
      );
    }

    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: `repair.${body.outcome}`,
      entityType: 'repair_job',
      entityId: id,
    });
    return updated;
  });

  app.post('/api/repairer/jobs/:id/image', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const stageQuery = (request.query as { stage?: string }).stage;
    const stage =
      stageQuery === 'completed'
        ? 'completed'
        : stageQuery === 'check_in'
          ? 'check_in'
          : 'during_repair';
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ error: 'No file provided', code: 'upload/missing' });
      return;
    }
    const [job] = await db.select().from(repairJobs).where(eq(repairJobs.id, id)).limit(1);
    if (!job) {
      reply.code(404).send({ error: 'Job not found', code: 'job/not_found' });
      return;
    }
    const buf = await file.toBuffer();
    try {
      const saved = await saveValidatedImage(buf, file.mimetype, `repairs/${id}`, {
        maxLongestEdge: 2000,
        quality: 0.82,
      });
      const [img] = await db
        .insert(repairImages)
        .values({
          repairJobId: id,
          filePath: saved.relativePath,
          fileSizeBytes: saved.size,
          mimeType: saved.mimeType,
          stage,
          takenBy: me.sub,
        })
        .returning();
      return { id: img.id, url: saved.url, stage };
    } catch (err) {
      request.log.warn({ err }, 'image upload failed');
      reply.code(400).send({ error: 'Could not process image', code: 'upload/invalid' });
    }
  });

  app.get('/api/repairer/history', async (request) => {
    const me = request.auth!;
    const q = request.query as { page?: string; perPage?: string };
    const page = Math.max(1, Number(q.page ?? 1));
    const perPage = Math.min(100, Number(q.perPage ?? 25));
    const offset = (page - 1) * perPage;

    const [{ total }] = await db
      .select({ total: count() })
      .from(repairJobs)
      .where(eq(repairJobs.repairerId, me.sub));

    const rows = await db
      .select({
        id: repairJobs.id,
        jobNumber: repairJobs.jobNumber,
        itemDescription: repairJobs.itemDescription,
        status: repairJobs.status,
        completedAt: repairJobs.completedAt,
        createdAt: repairJobs.createdAt,
        category: skillCategories.name,
        eventDate: events.date,
        eventName: events.name,
      })
      .from(repairJobs)
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .where(eq(repairJobs.repairerId, me.sub))
      .orderBy(desc(repairJobs.createdAt))
      .limit(perPage)
      .offset(offset);

    return {
      data: rows,
      meta: { page, perPage, total: Number(total), totalPages: Math.ceil(Number(total) / perPage) },
    };
  });

  app.get('/api/repairer/stats', async (request) => {
    const me = request.auth!;
    const allJobs = await db
      .select({ status: repairJobs.status, category: skillCategories.name })
      .from(repairJobs)
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .where(eq(repairJobs.repairerId, me.sub));
    const completed = allJobs.filter((j) => j.status === 'completed').length;
    const closed = allJobs.filter((j) => ['completed', 'cannot_repair'].includes(j.status)).length;
    const successRate = closed > 0 ? Math.round((completed / closed) * 100) : 0;
    const counts: Record<string, number> = {};
    for (const j of allJobs) {
      const k = j.category ?? 'Other';
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      total: allJobs.length,
      successRate,
      busiestCategory: busiest,
    };
  });
}
