import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { events, repairImages, repairJobs, skillCategories, users } from '../../db/schema.js';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { repairUpdateSchema } from '@circularity/shared';
import { audit } from '../../utils/audit.js';
import { deleteImage } from '../../services/imageUpload.js';

export async function adminRepairsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/repairs', async (request) => {
    const q = request.query as {
      page?: string;
      perPage?: string;
      eventId?: string;
      status?: string;
      categoryId?: string;
      repairerId?: string;
      from?: string;
      to?: string;
      search?: string;
    };
    const page = Math.max(1, Number(q.page ?? 1));
    const perPage = Math.min(100, Number(q.perPage ?? 25));
    const offset = (page - 1) * perPage;
    const conditions: any[] = [];
    if (q.eventId) conditions.push(eq(repairJobs.eventId, q.eventId));
    if (q.status) conditions.push(eq(repairJobs.status, q.status as any));
    if (q.categoryId) conditions.push(eq(repairJobs.itemCategoryId, q.categoryId));
    if (q.repairerId) conditions.push(eq(repairJobs.repairerId, q.repairerId));
    if (q.from) conditions.push(sql`${repairJobs.createdAt} >= ${q.from}::date`);
    if (q.to) conditions.push(sql`${repairJobs.createdAt} <= (${q.to}::date + INTERVAL '1 day')`);
    if (q.search) {
      const s = `%${q.search}%`;
      conditions.push(or(ilike(repairJobs.customerName, s), ilike(repairJobs.itemDescription, s), ilike(repairJobs.jobNumber, s)));
    }
    const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: count() }).from(repairJobs).where(whereExpr as any);
    const rows = await db
      .select({
        id: repairJobs.id,
        jobNumber: repairJobs.jobNumber,
        customerName: repairJobs.customerName,
        itemDescription: repairJobs.itemDescription,
        status: repairJobs.status,
        createdAt: repairJobs.createdAt,
        completedAt: repairJobs.completedAt,
        eventId: repairJobs.eventId,
        eventName: events.name,
        eventDate: events.date,
        category: skillCategories.name,
        repairerId: repairJobs.repairerId,
        repairerName: users.displayName,
      })
      .from(repairJobs)
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .leftJoin(users, eq(users.id, repairJobs.repairerId))
      .where(whereExpr as any)
      .orderBy(desc(repairJobs.createdAt))
      .limit(perPage)
      .offset(offset);
    return {
      data: rows,
      meta: { page, perPage, total: Number(total), totalPages: Math.ceil(Number(total) / perPage) },
    };
  });

  app.get('/api/admin/repairs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db
      .select({
        job: repairJobs,
        category: skillCategories,
        event: events,
        repairer: users,
      })
      .from(repairJobs)
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .leftJoin(users, eq(users.id, repairJobs.repairerId))
      .where(eq(repairJobs.id, id))
      .limit(1);
    if (rows.length === 0) {
      reply.code(404).send({ error: 'Repair not found', code: 'repair/not_found' });
      return;
    }
    const images = await db
      .select()
      .from(repairImages)
      .where(eq(repairImages.repairJobId, id));
    return { ...rows[0], images };
  });

  app.patch('/api/admin/repairs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const parsed = repairUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const update: any = { updatedAt: new Date() };
    for (const k of ['status', 'repairerId', 'outcomeNotes', 'partsUsed', 'customerName', 'customerContact', 'itemDescription', 'faultDescription', 'itemCategoryId', 'itemBrand']) {
      if ((data as any)[k] !== undefined) update[k] = (data as any)[k];
    }
    if (data.environmentalSavingKg !== undefined) {
      update.environmentalSavingKg = data.environmentalSavingKg !== null ? String(data.environmentalSavingKg) : null;
    }
    if (data.status === 'completed' || data.status === 'cannot_repair') {
      update.completedAt = new Date();
    }
    const [updated] = await db.update(repairJobs).set(update).where(eq(repairJobs.id, id)).returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'repair.admin_updated', entityType: 'repair_job', entityId: id });
    return updated;
  });

  app.delete('/api/admin/repairs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const [job] = await db
      .select({ id: repairJobs.id, jobNumber: repairJobs.jobNumber })
      .from(repairJobs)
      .where(eq(repairJobs.id, id))
      .limit(1);
    if (!job) {
      reply.code(404).send({ error: 'Repair not found', code: 'repair/not_found' });
      return;
    }
    // Grab the image paths before the rows disappear so we can remove the files
    // from disk. The repair_images rows themselves are removed by the DB via the
    // foreign-key ON DELETE CASCADE when the job is deleted.
    const images = await db
      .select({ filePath: repairImages.filePath })
      .from(repairImages)
      .where(eq(repairImages.repairJobId, id));
    await db.delete(repairJobs).where(eq(repairJobs.id, id));
    for (const img of images) {
      await deleteImage(img.filePath);
    }
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'repair.deleted',
      entityType: 'repair_job',
      entityId: id,
      metadata: { jobNumber: job.jobNumber, images: images.length },
    });
    return { ok: true };
  });

  // CSV export
  app.get('/api/admin/repairs/export.csv', async (request, reply) => {
    const rows = await db
      .select({
        jobNumber: repairJobs.jobNumber,
        eventDate: events.date,
        eventName: events.name,
        customerName: repairJobs.customerName,
        itemDescription: repairJobs.itemDescription,
        category: skillCategories.name,
        brand: repairJobs.itemBrand,
        fault: repairJobs.faultDescription,
        status: repairJobs.status,
        repairer: users.displayName,
        outcomeNotes: repairJobs.outcomeNotes,
        environmentalSavingKg: repairJobs.environmentalSavingKg,
        createdAt: repairJobs.createdAt,
        completedAt: repairJobs.completedAt,
      })
      .from(repairJobs)
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .leftJoin(users, eq(users.id, repairJobs.repairerId))
      .orderBy(desc(repairJobs.createdAt));
    const headers = ['jobNumber', 'eventDate', 'eventName', 'customerName', 'itemDescription', 'category', 'brand', 'fault', 'status', 'repairer', 'outcomeNotes', 'environmentalSavingKg', 'createdAt', 'completedAt'];
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => esc((r as any)[h])).join(','));
    }
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="repairs.csv"`);
    return lines.join('\n');
  });

  // GDPR PII purge
  app.post('/api/admin/repairs/purge-expired-pii', async (request) => {
    const me = request.auth!;
    const result = await db.execute(sql`
      UPDATE repair_jobs SET customer_name = NULL, customer_contact = NULL, updated_at = NOW()
      WHERE data_retention_date IS NOT NULL AND data_retention_date < CURRENT_DATE
      AND (customer_name IS NOT NULL OR customer_contact IS NOT NULL)
    `);
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'repair.pii_purged', entityType: 'system', metadata: { rows: result.rowCount } });
    return { purged: result.rowCount ?? 0 };
  });
}
