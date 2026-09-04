// =============================================================================
//  Linux Repair Cafe: the records and the reports
//  ---------------------------------------------------------------------------
//  Writing up the computers people bring to a Linux session, and reporting on
//  them. See services/linux.ts for why these are counted apart from repairs.
//
//  Every route here answers 409 while the feature is switched off, rather than
//  quietly accepting records for something the cafe does not run. Turning the
//  feature off never deletes anything: the records stay, and reappear as they
//  were if it is turned back on.
// =============================================================================
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { cafes, co2Factors, events, linuxInstalls, users, venues } from '../../db/schema.js';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { linuxInstallCreateSchema, linuxInstallUpdateSchema } from '@circularity/shared';
import { resolveSaving } from '../../services/co2.js';
import { audit } from '../../utils/audit.js';
import { env } from '../../env.js';

type Range = '3m' | '6m' | '12m' | 'all';

function parseRange(v: unknown): Range {
  return v === '3m' || v === '6m' || v === 'all' ? v : '12m';
}

function rangeFilter(range: Range, column: string) {
  if (range === 'all') return sql``;
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  return sql`AND ${sql.raw(column)} >= CURRENT_DATE - (${months} || ' months')::interval`;
}

/** Whether this cafe runs Linux sessions at all. */
async function linuxEnabled(): Promise<boolean> {
  const [cafe] = await db.select({ enabled: cafes.linuxEnabled }).from(cafes).limit(1);
  return cafe?.enabled ?? false;
}

/**
 * The day a visitor's details stop being kept, using the cafe's own retention
 * setting. The same rule as a repair, so one purge clears both.
 */
async function retentionDate(): Promise<string> {
  const [cafe] = await db.select({ days: cafes.dataRetentionDays }).from(cafes).limit(1);
  const days = cafe?.days ?? env.DATA_RETENTION_DEFAULT_DAYS;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Everything one install record shows in a list, including who and where. */
const installColumns = {
  id: linuxInstalls.id,
  eventId: linuxInstalls.eventId,
  eventName: events.name,
  eventDate: events.date,
  repairerId: linuxInstalls.repairerId,
  repairerName: users.displayName,
  deviceDescription: linuxInstalls.deviceDescription,
  deviceBrand: linuxInstalls.deviceBrand,
  deviceType: linuxInstalls.deviceType,
  deviceAgeYears: linuxInstalls.deviceAgeYears,
  previousOs: linuxInstalls.previousOs,
  distro: linuxInstalls.distro,
  outcome: linuxInstalls.outcome,
  customerName: linuxInstalls.customerName,
  customerContact: linuxInstalls.customerContact,
  gdprConsent: linuxInstalls.gdprConsent,
  notes: linuxInstalls.notes,
  co2FactorId: linuxInstalls.co2FactorId,
  co2SavingKg: linuxInstalls.co2SavingKg,
  co2SavingSource: linuxInstalls.co2SavingSource,
  createdAt: linuxInstalls.createdAt,
};

export async function adminLinuxRoutes(app: FastifyInstance): Promise<void> {
  // ── What the write-up form needs to offer ───────────────────────────────
  // The sessions that offer Linux help, and the volunteers who give it, in one
  // call so the form opens ready to use.
  app.get('/api/admin/linux/context', async (_request, reply) => {
    if (!(await linuxEnabled())) {
      reply.code(409).send({ error: 'Linux Repair Cafe is switched off', code: 'linux/disabled' });
      return;
    }
    const sessions = await db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        status: events.status,
        venueName: venues.name,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(eq(events.supportsLinux, true))
      .orderBy(desc(events.date));

    const volunteers = await db
      .select({ id: users.id, displayName: users.displayName, linuxRepairer: users.linuxRepairer })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(desc(users.linuxRepairer), asc(users.displayName));

    // Only the kinds of thing somebody might bring to a Linux session. The
    // full list runs to hundreds of entries, and offering a kettle here would
    // be noise.
    const factors = await db
      .select({
        id: co2Factors.id,
        key: co2Factors.key,
        label: co2Factors.label,
        co2eKg: co2Factors.co2eKg,
      })
      .from(co2Factors)
      .where(
        and(
          eq(co2Factors.isActive, true),
          sql`${co2Factors.key} LIKE 'laptop%' OR ${co2Factors.key} LIKE 'desktop_computer%' OR ${co2Factors.key} = 'tablet'`,
        ),
      )
      .orderBy(asc(co2Factors.label));

    return {
      sessions,
      volunteers,
      co2Factors: factors.map((f) => ({ ...f, co2eKg: f.co2eKg === null ? null : Number(f.co2eKg) })),
    };
  });

  // ── The records ─────────────────────────────────────────────────────────
  app.get('/api/admin/linux/installs', async (request, reply) => {
    if (!(await linuxEnabled())) {
      reply.code(409).send({ error: 'Linux Repair Cafe is switched off', code: 'linux/disabled' });
      return;
    }
    const query = request.query as { eventId?: string; outcome?: string; limit?: string };
    const conditions = [];
    if (query.eventId) conditions.push(eq(linuxInstalls.eventId, query.eventId));
    if (query.outcome) conditions.push(eq(linuxInstalls.outcome, query.outcome));
    const rows = await db
      .select(installColumns)
      .from(linuxInstalls)
      .innerJoin(events, eq(events.id, linuxInstalls.eventId))
      .leftJoin(users, eq(users.id, linuxInstalls.repairerId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(events.date), desc(linuxInstalls.createdAt))
      .limit(Math.min(500, Number(query.limit) || 200));
    return rows.map((r) => ({ ...r, co2SavingKg: r.co2SavingKg === null ? null : Number(r.co2SavingKg) }));
  });

  app.post('/api/admin/linux/installs', async (request, reply) => {
    const me = request.auth!;
    if (!(await linuxEnabled())) {
      reply.code(409).send({ error: 'Linux Repair Cafe is switched off', code: 'linux/disabled' });
      return;
    }
    const parsed = linuxInstallCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({
        error: 'Validation failed',
        code: 'validation/failed',
        details: parsed.error.flatten(),
      });
      return;
    }
    const data = parsed.data;

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, data.eventId))
      .limit(1);
    if (!event) {
      reply.code(404).send({ error: 'Session not found', code: 'event/not_found' });
      return;
    }

    // Worked out the same way as a repair, from the same reference data, so a
    // cafe can add its Linux and repair totals together and defend the answer.
    const saving = await resolveSaving({ factorId: data.co2FactorId ?? null, manualKg: null });
    const keepsPersonalDetails = Boolean(data.customerName?.trim()) || Boolean(data.customerContact?.trim());

    const [created] = await db
      .insert(linuxInstalls)
      .values({
        eventId: data.eventId,
        repairerId: data.repairerId ?? me.sub,
        deviceDescription: data.deviceDescription,
        deviceBrand: data.deviceBrand ?? null,
        deviceType: data.deviceType,
        deviceAgeYears: data.deviceAgeYears ?? null,
        previousOs: data.previousOs ?? null,
        distro: data.distro ?? null,
        outcome: data.outcome,
        customerName: data.customerName ?? null,
        customerContact: data.customerContact ?? null,
        gdprConsent: data.gdprConsent ?? false,
        // Only set when there is something to forget, so a record with no
        // personal details in it is never queued for a pointless purge.
        dataRetentionDate: keepsPersonalDetails ? await retentionDate() : null,
        notes: data.notes ?? null,
        co2FactorId: data.co2FactorId ?? null,
        co2SavingKg: saving.savingKg === null ? null : String(saving.savingKg),
        co2SavingSource: saving.source,
      })
      .returning();

    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'linux_install.created',
      entityType: 'linux_install',
      entityId: created.id,
      metadata: { eventId: data.eventId, outcome: data.outcome },
    });
    return created;
  });

  app.patch('/api/admin/linux/installs/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    if (!(await linuxEnabled())) {
      reply.code(409).send({ error: 'Linux Repair Cafe is switched off', code: 'linux/disabled' });
      return;
    }
    const parsed = linuxInstallUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({
        error: 'Validation failed',
        code: 'validation/failed',
        details: parsed.error.flatten(),
      });
      return;
    }
    const [existing] = await db.select().from(linuxInstalls).where(eq(linuxInstalls.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Record not found', code: 'linux_install/not_found' });
      return;
    }
    const data = parsed.data;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      'deviceDescription',
      'deviceBrand',
      'deviceType',
      'deviceAgeYears',
      'previousOs',
      'distro',
      'outcome',
      'repairerId',
      'customerName',
      'customerContact',
      'gdprConsent',
      'notes',
    ] as const) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    // Changing what kind of computer it was changes what keeping it in use
    // saved, so the figure is worked out again rather than left behind.
    if (data.co2FactorId !== undefined) {
      const saving = await resolveSaving({ factorId: data.co2FactorId ?? null, manualKg: null });
      update.co2FactorId = data.co2FactorId ?? null;
      update.co2SavingKg = saving.savingKg === null ? null : String(saving.savingKg);
      update.co2SavingSource = saving.source;
    }
    // Adding a name to a record that had none starts its retention clock.
    const name = (update.customerName ?? existing.customerName) as string | null;
    const contact = (update.customerContact ?? existing.customerContact) as string | null;
    if (Boolean(name?.trim()) || Boolean(contact?.trim())) {
      if (!existing.dataRetentionDate) update.dataRetentionDate = await retentionDate();
    } else {
      update.dataRetentionDate = null;
    }

    const [updated] = await db
      .update(linuxInstalls)
      .set(update)
      .where(eq(linuxInstalls.id, id))
      .returning();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'linux_install.updated',
      entityType: 'linux_install',
      entityId: id,
    });
    return updated;
  });

  app.delete('/api/admin/linux/installs/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(linuxInstalls).where(eq(linuxInstalls.id, id)).limit(1);
    if (!existing) {
      reply.code(404).send({ error: 'Record not found', code: 'linux_install/not_found' });
      return;
    }
    await db.delete(linuxInstalls).where(eq(linuxInstalls.id, id));
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'linux_install.deleted',
      entityType: 'linux_install',
      entityId: id,
      metadata: { device: existing.deviceDescription, eventId: existing.eventId },
    });
    return { ok: true };
  });

  // ── The report ──────────────────────────────────────────────────────────
  // What the cafe has done, and the two breakdowns that actually tell a story:
  // what people were running before (mostly Windows 10, whose support ended in
  // October 2025), and which Linux they went home with.
  app.get('/api/admin/linux/stats', async (request, reply) => {
    if (!(await linuxEnabled())) {
      reply.code(409).send({ error: 'Linux Repair Cafe is switched off', code: 'linux/disabled' });
      return;
    }
    const range = parseRange((request.query as { range?: string }).range);
    const filter = rangeFilter(range, 'e.date');

    const totalsRows = await db.execute(sql`
      SELECT
        COUNT(li.id)::int                                                        AS install_count,
        COUNT(li.id) FILTER (WHERE li.outcome IN ('installed','dual_boot'))::int AS installed_count,
        COUNT(li.id) FILTER (WHERE li.outcome IN ('tried_live','advice_only'))::int AS advised_count,
        COUNT(li.id) FILTER (WHERE li.outcome = 'not_possible')::int             AS not_possible_count,
        COUNT(DISTINCT li.event_id)::int                                         AS session_count,
        COUNT(DISTINCT li.repairer_id) FILTER (WHERE li.repairer_id IS NOT NULL)::int AS volunteer_count,
        COALESCE(SUM(li.co2_saving_kg) FILTER (WHERE li.outcome IN ('installed','dual_boot')), 0)::float AS co2_kg
      FROM linux_installs li
      JOIN events e ON e.id = li.event_id
      WHERE TRUE ${filter}
    `);
    const t = (totalsRows.rows[0] ?? {}) as Record<string, unknown>;
    const installCount = Number(t.install_count ?? 0);
    const installedCount = Number(t.installed_count ?? 0);

    const byPreviousOs = await db.execute(sql`
      SELECT COALESCE(li.previous_os, 'unknown') AS key, COUNT(*)::int AS count
      FROM linux_installs li
      JOIN events e ON e.id = li.event_id
      WHERE TRUE ${filter}
      GROUP BY 1
      ORDER BY count DESC, key
    `);

    const byDistro = await db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(li.distro), ''), 'Not recorded') AS key, COUNT(*)::int AS count
      FROM linux_installs li
      JOIN events e ON e.id = li.event_id
      WHERE TRUE ${filter} AND li.outcome IN ('installed','dual_boot')
      GROUP BY 1
      ORDER BY count DESC, key
    `);

    const byOutcome = await db.execute(sql`
      SELECT li.outcome AS key, COUNT(*)::int AS count
      FROM linux_installs li
      JOIN events e ON e.id = li.event_id
      WHERE TRUE ${filter}
      GROUP BY 1
      ORDER BY count DESC, key
    `);

    const byDeviceType = await db.execute(sql`
      SELECT li.device_type AS key, COUNT(*)::int AS count
      FROM linux_installs li
      JOIN events e ON e.id = li.event_id
      WHERE TRUE ${filter}
      GROUP BY 1
      ORDER BY count DESC, key
    `);

    const byVolunteer = await db.execute(sql`
      SELECT
        u.id,
        u.display_name AS display_name,
        COUNT(li.id)::int AS count,
        COUNT(li.id) FILTER (WHERE li.outcome IN ('installed','dual_boot'))::int AS installed
      FROM linux_installs li
      JOIN events e ON e.id = li.event_id
      JOIN users u ON u.id = li.repairer_id
      WHERE TRUE ${filter}
      GROUP BY u.id, u.display_name
      ORDER BY count DESC, u.display_name
    `);

    const bySession = await db.execute(sql`
      SELECT
        e.id,
        e.name,
        to_char(e.date, 'YYYY-MM-DD') AS date,
        COUNT(li.id)::int AS count,
        COUNT(li.id) FILTER (WHERE li.outcome IN ('installed','dual_boot'))::int AS installed
      FROM events e
      JOIN linux_installs li ON li.event_id = e.id
      WHERE TRUE ${filter}
      GROUP BY e.id, e.name, e.date
      ORDER BY e.date DESC
    `);

    const counts = (rows: Array<Record<string, unknown>>) =>
      rows.map((r) => ({ key: String(r.key), count: Number(r.count ?? 0) }));

    // How many volunteers are on the books for Linux, whether or not they have
    // written anything up yet. A cafe planning a session needs this number.
    const [readyRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.linuxRepairer, true)));

    return {
      range,
      totals: {
        installCount,
        installedCount,
        advisedCount: Number(t.advised_count ?? 0),
        notPossibleCount: Number(t.not_possible_count ?? 0),
        sessionCount: Number(t.session_count ?? 0),
        volunteerCount: Number(t.volunteer_count ?? 0),
        linuxRepairerCount: Number(readyRow?.count ?? 0),
        // Out of every computer written up. Advice and a machine that could
        // not run it are both real outcomes, so neither is hidden from the sum.
        installRate: installCount > 0 ? Math.round((installedCount / installCount) * 100) : 0,
        avgPerSession:
          Number(t.session_count ?? 0) > 0
            ? Math.round((installCount / Number(t.session_count)) * 10) / 10
            : 0,
        co2SavedKg: Math.round(Number(t.co2_kg ?? 0) * 10) / 10,
      },
      byPreviousOs: counts(byPreviousOs.rows as Array<Record<string, unknown>>),
      byDistro: counts(byDistro.rows as Array<Record<string, unknown>>),
      byOutcome: counts(byOutcome.rows as Array<Record<string, unknown>>),
      byDeviceType: counts(byDeviceType.rows as Array<Record<string, unknown>>),
      byVolunteer: (byVolunteer.rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        displayName: String(r.display_name),
        count: Number(r.count ?? 0),
        installedCount: Number(r.installed ?? 0),
      })),
      bySession: (bySession.rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        date: String(r.date),
        count: Number(r.count ?? 0),
        installedCount: Number(r.installed ?? 0),
      })),
    };
  });

  // A spreadsheet of the records, for a cafe that wants to do its own sums or
  // report to a funder. Visitor names are left out on purpose: a report about
  // how many computers were saved has no business carrying them.
  app.get('/api/admin/linux/installs.csv', async (request, reply) => {
    if (!(await linuxEnabled())) {
      reply.code(409).send({ error: 'Linux Repair Cafe is switched off', code: 'linux/disabled' });
      return;
    }
    const rows = await db
      .select({
        date: events.date,
        session: events.name,
        volunteer: users.displayName,
        device: linuxInstalls.deviceDescription,
        brand: linuxInstalls.deviceBrand,
        type: linuxInstalls.deviceType,
        ageYears: linuxInstalls.deviceAgeYears,
        previousOs: linuxInstalls.previousOs,
        distro: linuxInstalls.distro,
        outcome: linuxInstalls.outcome,
        co2SavingKg: linuxInstalls.co2SavingKg,
      })
      .from(linuxInstalls)
      .innerJoin(events, eq(events.id, linuxInstalls.eventId))
      .leftJoin(users, eq(users.id, linuxInstalls.repairerId))
      .orderBy(desc(events.date), desc(linuxInstalls.createdAt));

    const headers = [
      'date',
      'session',
      'volunteer',
      'device',
      'brand',
      'type',
      'ageYears',
      'previousOs',
      'distro',
      'outcome',
      'co2SavingKg',
    ];
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => escape((row as Record<string, unknown>)[h])).join(','));
    }
    void reply.header('Content-Type', 'text/csv');
    void reply.header('Content-Disposition', 'attachment; filename="linux-installs.csv"');
    return lines.join('\n');
  });
}
