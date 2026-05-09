import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { events, repairImages, repairJobs, skillCategories, users, venues } from '../db/schema.js';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { saveValidatedImage } from '../services/imageUpload.js';
import { audit } from '../utils/audit.js';

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
    };
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
        createdAt: repairJobs.createdAt,
        category: skillCategories.name,
        categoryIcon: skillCategories.icon,
        categoryColour: skillCategories.colour,
      })
      .from(repairJobs)
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .where(eq(repairJobs.eventId, evt.id))
      .orderBy(desc(repairJobs.createdAt));

    const counts = {
      waiting: jobs.filter((j) => j.status === 'waiting').length,
      in_progress: jobs.filter((j) => j.status === 'in_progress').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      cannot_repair: jobs.filter((j) => j.status === 'cannot_repair').length,
    };

    return {
      event: { ...evt, venueName: rows[0].venue.name },
      jobs,
      counts,
      myJobs: jobs.filter((j) => j.repairerId === me.sub && j.status === 'in_progress'),
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
    if (existing.status !== 'waiting') {
      reply.code(409).send({ error: 'Job is not waiting', code: 'job/not_waiting' });
      return;
    }
    const [updated] = await db
      .update(repairJobs)
      .set({ status: 'in_progress', repairerId: me.sub, acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(repairJobs.id, id))
      .returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'repair.accepted',
      entityType: 'repair_job',
      entityId: id,
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
      outcome: 'completed' | 'cannot_repair';
      outcomeNotes?: string;
      partsUsed?: string;
      environmentalSavingKg?: number | null;
    };
    const me = request.auth!;
    if (!['completed', 'cannot_repair'].includes(body?.outcome)) {
      reply.code(400).send({ error: 'Outcome required', code: 'validation/failed' });
      return;
    }
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
      .set({
        status: body.outcome,
        outcomeNotes: body.outcomeNotes ?? existing.outcomeNotes ?? null,
        partsUsed: body.partsUsed ?? existing.partsUsed ?? null,
        environmentalSavingKg:
          body.environmentalSavingKg !== undefined && body.environmentalSavingKg !== null
            ? String(body.environmentalSavingKg)
            : existing.environmentalSavingKg,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(repairJobs.id, id))
      .returning();

    if (existing.repairerId) {
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
    const stage = stageQuery === 'completed' ? 'completed' : stageQuery === 'during_repair' ? 'during_repair' : 'during_repair';
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
