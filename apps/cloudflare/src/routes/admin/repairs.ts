import type { App } from '../../lib/router.js';
import { db } from '../../db/index.js';
import { addDaysIso, localMidnightMs, localToday } from '../../lib/dates.js';
import { cafes, co2Factors, events, preRegistrations, repairImages, repairJobs, skillCategories, users } from '../../db/schema.js';
import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { needsPatTest, repairUpdateSchema } from '@circularity/shared';
import { cafeFeatures } from '../../services/preRegistration.js';
import { cardInUse, cardInUseError, holdsCard } from '../../services/cardNumbers.js';
import { audit } from '../../utils/audit.js';
import { repairerSummary } from '../../utils/users.js';
import { deleteImage } from '../../services/imageUpload.js';
import { env } from '../../env.js';

/** Escape one CSV cell: quote it when it contains a comma, a quote or a newline. */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function adminRepairsRoutes(app: App): Promise<void> {
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
    // Dates are the cafe's own days, as Postgres read them in the old Docker edition.
    if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) {
      conditions.push(sql`${repairJobs.createdAt} >= ${localMidnightMs(q.from)}`);
    }
    if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
      conditions.push(sql`${repairJobs.createdAt} <= ${localMidnightMs(addDaysIso(q.to, 1))}`);
    }
    if (q.search) {
      const s = `%${q.search}%`;
      // SQLite's LIKE ignores case, as Postgres's ILIKE did.
      conditions.push(or(like(repairJobs.customerName, s), like(repairJobs.itemDescription, s), like(repairJobs.jobNumber, s)));
    }
    const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: count() }).from(repairJobs).where(whereExpr as any);
    const rows = await db
      .select({
        id: repairJobs.id,
        jobNumber: repairJobs.jobNumber,
        customerName: repairJobs.customerName,
        itemDescription: repairJobs.itemDescription,
        isFirstVisit: repairJobs.isFirstVisit,
        weightKg: repairJobs.weightKg,
        status: repairJobs.status,
        satisfaction: repairJobs.satisfaction,
        cardNumber: repairJobs.cardNumber,
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
        repairer: repairerSummary,
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
    const job = rows[0].job;
    const features = await cafeFeatures();
    let pat = null;
    if (features.patTestingEnabled) {
      const [tester] = job.patTestedBy
        ? await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, job.patTestedBy)).limit(1)
        : [];
      pat = {
        needed: needsPatTest(true, job.isElectrical, rows[0].category?.isElectrical),
        result: job.patResult,
        testedAt: job.patTestedAt,
        testedByName: tester?.displayName ?? null,
        notes: job.patNotes,
      };
    }
    const [pre] = await db
      .select({ researchNotes: preRegistrations.researchNotes, createdAt: preRegistrations.createdAt })
      .from(preRegistrations)
      .where(eq(preRegistrations.repairJobId, id))
      .limit(1);
    return { ...rows[0], images, pat, preRegistration: pre ?? null };
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
    const [existing] = await db
      .select({ status: repairJobs.status, eventId: repairJobs.eventId, cardNumber: repairJobs.cardNumber })
      .from(repairJobs)
      .where(eq(repairJobs.id, id))
      .limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Repair not found', code: 'repair/not_found' });
      return;
    }
    // A card number must not clash with another open repair in the same
    // session. Check before saving, both when the number changes and when a
    // finished repair is opened again, as its number may have been reused.
    if (data.cardNumber !== undefined || data.status !== undefined) {
      const card = data.cardNumber !== undefined ? data.cardNumber : existing.cardNumber;
      const status = data.status ?? existing.status;
      if (card != null && holdsCard(status) && (await cardInUse(existing.eventId, card, id))) {
        reply.code(409).send(cardInUseError(card));
        return;
      }
    }
    const update: any = { updatedAt: new Date() };
    for (const k of ['status', 'repairerId', 'outcomeNotes', 'partsUsed', 'customerName', 'customerContact', 'itemDescription', 'faultDescription', 'itemCategoryId', 'itemBrand', 'isFirstVisit', 'satisfaction', 'satisfactionComment', 'cardNumber']) {
      if ((data as any)[k] !== undefined) update[k] = (data as any)[k];
    }
    if (data.environmentalSavingKg !== undefined) {
      update.environmentalSavingKg = data.environmentalSavingKg !== null ? String(data.environmentalSavingKg) : null;
    }
    if (data.weightKg !== undefined) {
      update.weightKg = data.weightKg !== null ? String(data.weightKg) : null;
    }
    // Stamp completed_at only when the job actually *transitions* into a terminal
    // state (completed / cannot_repair). Re-saving an already-terminal job (e.g.
    // to tweak notes) must NOT push completed_at forward — that inflated the
    // reported repair durations. Reopening to a non-terminal state clears it.
    if (data.status !== undefined) {
      const wasTerminal = existing.status === 'completed' || existing.status === 'cannot_repair';
      const nowTerminal = data.status === 'completed' || data.status === 'cannot_repair';
      if (nowTerminal && !wasTerminal) update.completedAt = new Date();
      else if (!nowTerminal && wasTerminal) update.completedAt = null;
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
    const patTester = alias(users, 'pat_tester');
    const rows = await db
      .select({
        jobNumber: repairJobs.jobNumber,
        eventDate: events.date,
        eventName: events.name,
        customerName: repairJobs.customerName,
        itemDescription: repairJobs.itemDescription,
        category: skillCategories.name,
        brand: repairJobs.itemBrand,
        weightKg: repairJobs.weightKg,
        isFirstVisit: repairJobs.isFirstVisit,
        fault: repairJobs.faultDescription,
        status: repairJobs.status,
        cardNumber: repairJobs.cardNumber,
        repairer: users.displayName,
        outcomeNotes: repairJobs.outcomeNotes,
        satisfaction: repairJobs.satisfaction,
        satisfactionComment: repairJobs.satisfactionComment,
        environmentalSavingKg: repairJobs.environmentalSavingKg,
        createdAt: repairJobs.createdAt,
        completedAt: repairJobs.completedAt,
        patResult: repairJobs.patResult,
        patTestedAt: repairJobs.patTestedAt,
        patTestedBy: patTester.displayName,
      })
      .from(repairJobs)
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .leftJoin(users, eq(users.id, repairJobs.repairerId))
      .leftJoin(patTester, eq(patTester.id, repairJobs.patTestedBy))
      .orderBy(desc(repairJobs.createdAt));
    const headers = ['jobNumber', 'cardNumber', 'eventDate', 'eventName', 'customerName', 'itemDescription', 'category', 'brand', 'weightKg', 'isFirstVisit', 'fault', 'status', 'repairer', 'outcomeNotes', 'satisfaction', 'satisfactionComment', 'environmentalSavingKg', 'createdAt', 'completedAt'];
    // The PAT columns only appear while the cafe does PAT tests, so the file
    // is the same as before for everyone else.
    if ((await cafeFeatures()).patTestingEnabled) headers.push('patResult', 'patTestedAt', 'patTestedBy');
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => escapeCsv((r as any)[h])).join(','));
    }
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="repairs.csv"`);
    return lines.join('\n');
  });

  // ORDS export — the Open Repair Data Standard, for contributing to the Open
  // Repair Alliance's public dataset. See https://standard.openrepair.org/.
  //
  // One row per repair attempt, with the standard's field names (section 3.4.1)
  // and repair_status codes (3.4.3). Only jobs that reached an outcome are
  // included. Fields we do not collect yet (product category mapping, year of
  // manufacture, barriers) are left blank for the Alliance to map — they map
  // partner categories and values at the source anyway.
  app.get('/api/admin/repairs/export.ords.csv', async (request, reply) => {
    const [cafe] = await db
      .select({ id: cafes.id, name: cafes.name, slug: cafes.repaircafeSlug })
      .from(cafes)
      .limit(1);
    // A stable identifier for the group. The cafe's repaircafe.org listing is
    // the most meaningful when it has one, otherwise its internal id.
    const groupIdentifier = cafe?.slug?.trim() || cafe?.id || '';
    const dataProvider = cafe?.name?.trim() || 'Repair Cafe';
    const country = env.ORDS_COUNTRY;

    // repair_status: 0 Unknown, 1 Fixed, 2 Repairable, 3 End of life.
    // "returned" (the item was collected) says nothing about whether it was
    // fixed, so it is recorded as Unknown rather than guessed.
    const ORDS_STATUS: Record<string, string> = {
      completed: '1',
      awaiting_return: '2',
      cannot_repair: '3',
      returned: '0',
    };

    const rows = await db
      .select({
        id: repairJobs.id,
        eventDate: events.date,
        partnerCategory: skillCategories.name,
        itemType: co2Factors.label,
        brand: repairJobs.itemBrand,
        problem: repairJobs.faultDescription,
        status: repairJobs.status,
      })
      .from(repairJobs)
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .leftJoin(co2Factors, eq(co2Factors.id, repairJobs.co2FactorId))
      .where(inArray(repairJobs.status, ['completed', 'cannot_repair', 'awaiting_return', 'returned']))
      .orderBy(asc(events.date), asc(repairJobs.createdAt));

    const headers = [
      'id',
      'partner_product_category',
      'product_category',
      'brand',
      'year_of_manufacture',
      'problem',
      'repair_status',
      'repair_barrier_if_end_of_life',
      'group_identifier',
      'event_date',
      'data_provider',
      'country',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      // The Alliance concatenates the cafe's category with the item type, the
      // way most partner datasets look.
      const partnerCategory = [r.partnerCategory, r.itemType].filter(Boolean).join(' ~ ');
      const out: Record<string, string> = {
        id: r.id,
        partner_product_category: partnerCategory,
        product_category: '',
        brand: r.brand ?? '',
        year_of_manufacture: '',
        problem: r.problem,
        repair_status: ORDS_STATUS[r.status] ?? '0',
        repair_barrier_if_end_of_life: '',
        group_identifier: groupIdentifier,
        event_date: r.eventDate,
        data_provider: dataProvider,
        country,
      };
      lines.push(headers.map((h) => escapeCsv(out[h])).join(','));
    }
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="repairs-ords.csv"`);
    return lines.join('\n');
  });

  // GDPR PII purge
  //
  // Covers every place a visitor's name or contact detail is written down, not
  // just repairs. The visitor's comment at the exit goes too, because people
  // often put a name or a phone number in it. A Linux install records the same details for the same
  // reason, so it has to be forgotten on the same day.
  app.post('/api/admin/repairs/purge-expired-pii', async (request) => {
    const me = request.auth!;
    const today = localToday();
    const now = Date.now();
    const result = await db.run(sql`
      UPDATE repair_jobs SET customer_name = NULL, customer_contact = NULL, satisfaction_comment = NULL, updated_at = ${now}
      WHERE data_retention_date IS NOT NULL AND data_retention_date < ${today}
      AND (customer_name IS NOT NULL OR customer_contact IS NOT NULL OR satisfaction_comment IS NOT NULL)
    `);
    const linuxResult = await db.run(sql`
      UPDATE linux_installs SET customer_name = NULL, customer_contact = NULL, updated_at = ${now}
      WHERE data_retention_date IS NOT NULL AND data_retention_date < ${today}
      AND (customer_name IS NOT NULL OR customer_contact IS NOT NULL)
    `);
    // Items told to us before a session hold the same details, so they go too.
    const preResult = await db.run(sql`
      UPDATE pre_registrations SET customer_name = NULL, customer_contact = NULL, updated_at = ${now}
      WHERE data_retention_date IS NOT NULL AND data_retention_date < ${today}
      AND (customer_name IS NOT NULL OR customer_contact IS NOT NULL)
    `);
    const repairs = result.meta?.changes ?? 0;
    const linuxInstalls = linuxResult.meta?.changes ?? 0;
    const preRegistrations = preResult.meta?.changes ?? 0;
    const rows = repairs + linuxInstalls + preRegistrations;
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'repair.pii_purged',
      entityType: 'system',
      metadata: { rows, repairs, linuxInstalls, preRegistrations },
    });
    return { purged: rows, repairs, linuxInstalls, preRegistrations };
  });
}
