import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cafes, events, repairImages, repairJobs, skillCategories, users, venues } from '../db/schema.js';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { checkInSubmitSchema } from '@circularity/shared';
import { nextJobNumber } from '../services/jobNumber.js';
import { audit } from '../utils/audit.js';
import { saveValidatedImage } from '../services/imageUpload.js';
import { randomToken } from '../utils/tokens.js';
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
    const [cafe] = await db
      .select({
        name: cafes.name,
        logoUrl: cafes.logoUrl,
        allowSkipPhoto: cafes.allowSkipPhoto,
        enableContactField: cafes.enableContactField,
        donateUrl: cafes.donateUrl,
      })
      .from(cafes)
      .limit(1);
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
      cafe: cafe ?? { name: '', logoUrl: null, allowSkipPhoto: true, enableContactField: true, donateUrl: null },
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

    // Returning customer: look up the existing token + reuse customer details so
    // they don't have to re-enter their name/contact/consent for each item.
    let customerToken = data.customerToken ?? null;
    let customerName = data.customerName ?? null;
    let customerContact = data.customerContact ?? null;
    let gdprConsent = data.gdprConsent === true;

    if (customerToken) {
      const [existing] = await db
        .select({
          customerName: repairJobs.customerName,
          customerContact: repairJobs.customerContact,
          gdprConsent: repairJobs.gdprConsent,
        })
        .from(repairJobs)
        .where(and(eq(repairJobs.customerToken, customerToken), eq(repairJobs.eventId, found.event.id)))
        .limit(1);
      if (!existing) {
        // Token is unknown for this event — treat as a fresh check-in and require
        // the customer fields. If they aren't there, refuse rather than silently
        // creating an anonymous job.
        if (!customerName || !gdprConsent) {
          reply.code(400).send({
            error: 'Returning customer token not recognised for this event',
            code: 'checkin/unknown_token',
          });
          return;
        }
        customerToken = randomToken(16);
      } else {
        customerName = existing.customerName;
        customerContact = existing.customerContact;
        gdprConsent = existing.gdprConsent;
      }
    } else {
      // New customer — mint a token they can use to track all their items.
      customerToken = randomToken(16);
    }

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
        customerName,
        customerContact,
        customerToken,
        itemDescription: data.itemDescription,
        itemCategoryId: data.itemCategoryId ?? null,
        itemBrand: data.itemBrand ?? null,
        faultDescription: data.faultDescription,
        gdprConsent,
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
      metadata: { eventId: found.event.id, jobNumber, returning: Boolean(data.customerToken) },
    });

    return {
      id: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      customerToken,
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

  // ── Customer self-service tracking ───────────────────────────────
  // A `customerToken` is issued at first check-in and shared across all of a
  // customer's items at the same event. The customer can revisit this URL at
  // any time to see the live status of every item they handed in.
  app.get('/api/track/:customerToken', async (request, reply) => {
    const { customerToken } = request.params as { customerToken: string };
    if (!customerToken || customerToken.length < 8) {
      reply.code(404).send({ error: 'Tracking link not found', code: 'track/not_found' });
      return;
    }
    const rows = await db
      .select({
        job: {
          id: repairJobs.id,
          jobNumber: repairJobs.jobNumber,
          status: repairJobs.status,
          customerName: repairJobs.customerName,
          itemDescription: repairJobs.itemDescription,
          itemBrand: repairJobs.itemBrand,
          faultDescription: repairJobs.faultDescription,
          outcomeNotes: repairJobs.outcomeNotes,
          createdAt: repairJobs.createdAt,
          acceptedAt: repairJobs.acceptedAt,
          completedAt: repairJobs.completedAt,
        },
        category: {
          name: skillCategories.name,
          icon: skillCategories.icon,
          colour: skillCategories.colour,
        },
        repairer: {
          displayName: users.displayName,
        },
        event: {
          id: events.id,
          name: events.name,
          date: events.date,
          startTime: events.startTime,
          endTime: events.endTime,
          status: events.status,
        },
        venue: {
          name: venues.name,
          address: venues.address,
        },
      })
      .from(repairJobs)
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .innerJoin(venues, eq(venues.id, events.venueId))
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .leftJoin(users, eq(users.id, repairJobs.repairerId))
      .where(eq(repairJobs.customerToken, customerToken))
      .orderBy(desc(repairJobs.createdAt));

    if (rows.length === 0) {
      reply.code(404).send({ error: 'Tracking link not found', code: 'track/not_found' });
      return;
    }

    const [cafe] = await db
      .select({ name: cafes.name, logoUrl: cafes.logoUrl, donateUrl: cafes.donateUrl })
      .from(cafes)
      .limit(1);

    // Pull the first check-in photo per job in one query so the tracker can
    // show guests a thumbnail of what they handed in (reassuring + easier
    // to spot their item amongst several).
    const jobIds = rows.map((r) => r.job.id);
    const photoByJob = new Map<string, string>();
    if (jobIds.length > 0) {
      const imgs = await db
        .select({
          jobId: repairImages.repairJobId,
          filePath: repairImages.filePath,
          createdAt: repairImages.createdAt,
        })
        .from(repairImages)
        .where(and(inArray(repairImages.repairJobId, jobIds), eq(repairImages.stage, 'check_in')))
        .orderBy(asc(repairImages.createdAt));
      for (const im of imgs) {
        if (!photoByJob.has(im.jobId)) photoByJob.set(im.jobId, im.filePath);
      }
    }

    const first = rows[0];

    // Light caching hint — page polls every minute, no harm if a tab re-fetches.
    reply.header('Cache-Control', 'no-store');

    return {
      customerName: first.job.customerName,
      event: first.event,
      venue: first.venue,
      cafe: cafe ?? { name: '', logoUrl: null, donateUrl: null },
      jobs: rows.map((r) => {
        // `repair_images.file_path` is stored relative to the uploads dir
        // (see services/imageUpload.ts). Prefix `/uploads/` so the SPA can
        // drop it straight into an <img src>.
        const rel = photoByJob.get(r.job.id);
        return {
          id: r.job.id,
          jobNumber: r.job.jobNumber,
          status: r.job.status,
          itemDescription: r.job.itemDescription,
          itemBrand: r.job.itemBrand,
          faultDescription: r.job.faultDescription,
          outcomeNotes:
            r.job.status === 'completed' ||
            r.job.status === 'cannot_repair' ||
            r.job.status === 'returned'
              ? r.job.outcomeNotes
              : null,
          category: r.category?.name ? r.category : null,
          // First name only to stay light on personal data exposed on a public link.
          repairerFirstName: r.repairer?.displayName
            ? r.repairer.displayName.split(' ')[0]
            : null,
          photoUrl: rel ? `/uploads/${rel}` : null,
          createdAt: r.job.createdAt,
          acceptedAt: r.job.acceptedAt,
          completedAt: r.job.completedAt,
        };
      }),
    };
  });
}
