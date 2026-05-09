import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cafes, events, repairImages, repairJobs, skillCategories, venues } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { checkInSubmitSchema } from '@circularity/shared';
import { nextJobNumber } from '../services/jobNumber.js';
import { audit } from '../utils/audit.js';
import { saveValidatedImage } from '../services/imageUpload.js';
import { env } from '../env.js';

async function loadEventByToken(token: string) {
  const rows = await db
    .select({
      event: events,
      venue: venues,
    })
    .from(events)
    .innerJoin(venues, eq(venues.id, events.venueId))
    .where(eq(events.checkInToken, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function checkInRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/checkin/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadEventByToken(token);
    if (!found) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const [cafe] = await db.select({ name: cafes.name, allowSkipPhoto: cafes.allowSkipPhoto, enableContactField: cafes.enableContactField }).from(cafes).limit(1);
    const cats = await db
      .select()
      .from(skillCategories)
      .where(eq(skillCategories.isActive, true))
      .orderBy(skillCategories.sortOrder);

    return {
      event: {
        id: found.event.id,
        name: found.event.name,
        date: found.event.date,
        startTime: found.event.startTime,
        endTime: found.event.endTime,
        status: found.event.status,
      },
      venue: {
        name: found.venue.name,
        address: found.venue.address,
      },
      cafe: cafe ?? { name: '', allowSkipPhoto: true, enableContactField: true },
      categories: cats,
    };
  });

  app.post('/api/checkin/:token/jobs', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadEventByToken(token);
    if (!found) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    if (found.event.status !== 'active') {
      reply.code(400).send({ error: 'Event is not currently accepting check-ins', code: 'event/not_active' });
      return;
    }
    const parsed = checkInSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const jobNumber = await nextJobNumber();
    const [cafe] = await db.select({ dataRetentionDays: cafes.dataRetentionDays }).from(cafes).limit(1);
    const retentionDays = cafe?.dataRetentionDays ?? env.DATA_RETENTION_DEFAULT_DAYS;
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + retentionDays);

    const [job] = await db
      .insert(repairJobs)
      .values({
        eventId: found.event.id,
        jobNumber,
        customerName: data.customerName,
        customerContact: data.customerContact ?? null,
        itemDescription: data.itemDescription,
        itemCategoryId: data.itemCategoryId ?? null,
        itemBrand: data.itemBrand ?? null,
        faultDescription: data.faultDescription,
        gdprConsent: data.gdprConsent,
        dataRetentionDate: retentionDate.toISOString().slice(0, 10),
      })
      .returning();

    // Issue session cookie linking customer to job
    reply.setCookie(`checkin_${token}`, job.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * env.SESSION_MAX_AGE_HOURS,
    });

    await audit({
      request,
      actorType: 'customer',
      action: 'checkin.created',
      entityType: 'repair_job',
      entityId: job.id,
      metadata: { eventId: found.event.id, jobNumber },
    });

    return {
      id: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
    };
  });

  app.get('/api/checkin/:token/jobs/:id', async (request, reply) => {
    const { token, id } = request.params as { token: string; id: string };
    const found = await loadEventByToken(token);
    if (!found) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const [job] = await db
      .select({
        id: repairJobs.id,
        jobNumber: repairJobs.jobNumber,
        status: repairJobs.status,
        customerName: repairJobs.customerName,
      })
      .from(repairJobs)
      .where(and(eq(repairJobs.id, id), eq(repairJobs.eventId, found.event.id)))
      .limit(1);
    if (!job) {
      reply.code(404).send({ error: 'Job not found', code: 'job/not_found' });
      return;
    }
    return job;
  });

  app.post('/api/checkin/:token/jobs/:id/image', async (request, reply) => {
    const { token, id } = request.params as { token: string; id: string };
    const found = await loadEventByToken(token);
    if (!found) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }
    const [job] = await db
      .select()
      .from(repairJobs)
      .where(and(eq(repairJobs.id, id), eq(repairJobs.eventId, found.event.id)))
      .limit(1);
    if (!job) {
      reply.code(404).send({ error: 'Job not found', code: 'job/not_found' });
      return;
    }
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ error: 'No file provided', code: 'upload/missing' });
      return;
    }
    const buf = await file.toBuffer();
    try {
      const saved = await saveValidatedImage(buf, file.mimetype, `repairs/${job.id}`, {
        maxLongestEdge: 1200,
        quality: 0.8,
      });
      const [img] = await db
        .insert(repairImages)
        .values({
          repairJobId: job.id,
          filePath: saved.relativePath,
          fileSizeBytes: saved.size,
          mimeType: saved.mimeType,
          stage: 'check_in',
        })
        .returning();
      return { id: img.id, url: saved.url };
    } catch (err) {
      request.log.warn({ err }, 'image upload failed');
      reply.code(400).send({ error: 'Could not process image', code: 'upload/invalid' });
    }
  });
}
