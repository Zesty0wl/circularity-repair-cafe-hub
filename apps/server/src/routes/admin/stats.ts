import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { cafes } from '../../db/schema.js';
import { sql } from 'drizzle-orm';
import { linuxStatsForEvent } from '../../services/linux.js';

// ─── Stats: kept deliberately small and useful ─────────────────────
// The dashboard surfaces "what we did, how often, who, and how long".
// Each endpoint accepts an optional ?range=3m|6m|12m|all and clamps to
// the past N months of events (anchored on `events.date`, not the
// repair created_at — events are the meaningful unit of activity).

type Range = '3m' | '6m' | '12m' | 'all';

function parseRange(v: unknown): Range {
  return v === '3m' || v === '6m' || v === 'all' ? v : '12m';
}

/** Returns a SQL fragment like `e.date >= CURRENT_DATE - INTERVAL '12 months'`,
 *  or empty when the caller wants the full history. */
function rangeFilter(range: Range, column: string) {
  if (range === 'all') return sql``;
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  return sql`AND ${sql.raw(column)} >= CURRENT_DATE - (${months} || ' months')::interval`;
}

export async function adminStatsRoutes(app: FastifyInstance): Promise<void> {
  // ── Period summary: events, repairs, success rate, volunteers ──────
  // Averages are computed over events that actually took place (status
  // 'active' or 'completed') so cancelled / scheduled-future events don't
  // skew the "repairs per event" figure.
  app.get('/api/admin/stats/overview', async (request) => {
    const range = parseRange((request.query as { range?: string }).range);
    const filter = rangeFilter(range, 'e.date');

    const eventRows = await db.execute(sql`
      SELECT
        COUNT(DISTINCT e.id)::int AS event_count,
        COUNT(rj.id)::int AS repair_count,
        COUNT(rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed,
        COUNT(rj.id) FILTER (WHERE rj.status = 'cannot_repair')::int AS cannot_repair,
        COUNT(rj.id) FILTER (WHERE rj.status = 'returned')::int AS returned,
        COUNT(DISTINCT rj.repairer_id) FILTER (WHERE rj.repairer_id IS NOT NULL)::int AS repairer_count,
        COALESCE(SUM(rj.co2_saving_kg) FILTER (WHERE rj.status = 'completed'), 0)::float AS savings_kg,
        COALESCE(AVG(EXTRACT(EPOCH FROM (rj.completed_at - rj.accepted_at)) / 60.0)
                 FILTER (WHERE rj.accepted_at IS NOT NULL AND rj.completed_at IS NOT NULL), 0)::float AS avg_duration_min
      FROM events e
      LEFT JOIN repair_jobs rj ON rj.event_id = e.id
      WHERE e.status IN ('completed','active') ${filter}
    `);
    const r: any = eventRows.rows[0] ?? {};
    const completed = Number(r.completed ?? 0);
    const closed = completed + Number(r.cannot_repair ?? 0);
    const eventCount = Number(r.event_count ?? 0);
    const repairCount = Number(r.repair_count ?? 0);
    return {
      range,
      eventCount,
      repairCount,
      completedCount: completed,
      cannotRepairCount: Number(r.cannot_repair ?? 0),
      returnedCount: Number(r.returned ?? 0),
      successRate: closed > 0 ? Math.round((completed / closed) * 100) : 0,
      repairerCount: Number(r.repairer_count ?? 0),
      avgDurationMin: Math.round(Number(r.avg_duration_min ?? 0)),
      avgRepairsPerEvent: eventCount > 0 ? Math.round((repairCount / eventCount) * 10) / 10 : 0,
      environmentalSavingKg: Number(r.savings_kg ?? 0),
    };
  });

  // ── 12-month activity heatmap (one row per event day) ─────────────
  // Anchored on the event date so the heatmap rhythm is "which days did
  // we hold a cafe and how busy was it". Range is fixed at 12 months —
  // independent of the page period selector — to give a stable rhythm.
  app.get('/api/admin/stats/heatmap', async () => {
    const rows = await db.execute(sql`
      SELECT
        to_char(e.date, 'YYYY-MM-DD') AS day,
        COUNT(DISTINCT e.id)::int AS events,
        COUNT(rj.id)::int AS repairs,
        COUNT(rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed
      FROM events e
      LEFT JOIN repair_jobs rj ON rj.event_id = e.id
      WHERE e.status IN ('completed','active')
        AND e.date >= CURRENT_DATE - INTERVAL '12 months'
        AND e.date <= CURRENT_DATE
      GROUP BY e.date
      ORDER BY e.date
    `);
    return rows.rows.map((r: any) => ({
      day: r.day,
      events: Number(r.events ?? 0),
      repairs: Number(r.repairs ?? 0),
      completed: Number(r.completed ?? 0),
    }));
  });

  // ── Events list with per-event summary (newest first) ─────────────
  app.get('/api/admin/stats/events', async (request) => {
    const range = parseRange((request.query as { range?: string }).range);
    const filter = rangeFilter(range, 'e.date');
    const rows = await db.execute(sql`
      SELECT
        e.id,
        e.name,
        to_char(e.date, 'YYYY-MM-DD') AS date,
        e.status,
        v.name AS venue_name,
        COUNT(rj.id)::int AS repair_count,
        COUNT(rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed,
        COUNT(rj.id) FILTER (WHERE rj.status = 'cannot_repair')::int AS cannot_repair,
        COUNT(DISTINCT rj.repairer_id) FILTER (WHERE rj.repairer_id IS NOT NULL)::int AS repairer_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (rj.completed_at - rj.accepted_at)) / 60.0)
                 FILTER (WHERE rj.accepted_at IS NOT NULL AND rj.completed_at IS NOT NULL), 0)::float AS avg_duration_min
      FROM events e
      JOIN venues v ON v.id = e.venue_id
      LEFT JOIN repair_jobs rj ON rj.event_id = e.id
      WHERE e.status IN ('completed','active') ${filter}
      GROUP BY e.id, e.name, e.date, e.status, v.name
      ORDER BY e.date DESC, e.start_time DESC
    `);
    return rows.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      date: r.date,
      status: r.status,
      venueName: r.venue_name,
      repairCount: Number(r.repair_count ?? 0),
      completedCount: Number(r.completed ?? 0),
      cannotRepairCount: Number(r.cannot_repair ?? 0),
      repairerCount: Number(r.repairer_count ?? 0),
      avgDurationMin: Math.round(Number(r.avg_duration_min ?? 0)),
    }));
  });

  // ── Single-event drill-down: totals + volunteers + categories + jobs ─
  app.get('/api/admin/stats/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const eventRows = await db.execute(sql`
      SELECT
        e.id,
        e.name,
        to_char(e.date, 'YYYY-MM-DD') AS date,
        e.start_time AS start_time,
        e.end_time AS end_time,
        e.status,
        v.name AS venue_name,
        v.address AS venue_address
      FROM events e
      JOIN venues v ON v.id = e.venue_id
      WHERE e.id = ${id}
      LIMIT 1
    `);
    const event: any = eventRows.rows[0];
    if (!event) {
      reply.code(404).send({ error: 'Event not found', code: 'event/not_found' });
      return;
    }

    const totalsRows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS repair_count,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'cannot_repair')::int AS cannot_repair,
        COUNT(*) FILTER (WHERE status = 'returned')::int AS returned,
        COUNT(*) FILTER (WHERE status IN ('waiting','in_progress'))::int AS open_count,
        COALESCE(SUM(co2_saving_kg) FILTER (WHERE status = 'completed'), 0)::float AS savings_kg,
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at)) / 60.0)
                 FILTER (WHERE accepted_at IS NOT NULL AND completed_at IS NOT NULL), 0)::float AS avg_duration_min,
        COALESCE(SUM(EXTRACT(EPOCH FROM (completed_at - accepted_at)) / 60.0)
                 FILTER (WHERE accepted_at IS NOT NULL AND completed_at IS NOT NULL), 0)::float AS total_duration_min
      FROM repair_jobs WHERE event_id = ${id}
    `);
    const t: any = totalsRows.rows[0] ?? {};
    const completed = Number(t.completed ?? 0);
    const closed = completed + Number(t.cannot_repair ?? 0);

    const repairersRows = await db.execute(sql`
      SELECT
        u.id,
        u.display_name AS display_name,
        COUNT(rj.id)::int AS count,
        COUNT(rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed,
        COALESCE(AVG(EXTRACT(EPOCH FROM (rj.completed_at - rj.accepted_at)) / 60.0)
                 FILTER (WHERE rj.accepted_at IS NOT NULL AND rj.completed_at IS NOT NULL), 0)::float AS avg_duration_min
      FROM repair_jobs rj
      JOIN users u ON u.id = rj.repairer_id
      WHERE rj.event_id = ${id}
      GROUP BY u.id, u.display_name
      ORDER BY count DESC, u.display_name
    `);

    const categoriesRows = await db.execute(sql`
      SELECT
        sc.id,
        sc.name,
        sc.icon,
        sc.colour,
        COUNT(rj.id)::int AS count,
        COUNT(rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed
      FROM repair_jobs rj
      LEFT JOIN skill_categories sc ON sc.id = rj.item_category_id
      WHERE rj.event_id = ${id}
      GROUP BY sc.id, sc.name, sc.icon, sc.colour
      ORDER BY count DESC NULLS LAST, sc.name
    `);

    const jobsRows = await db.execute(sql`
      SELECT
        rj.id,
        rj.job_number AS job_number,
        rj.item_description AS item_description,
        rj.item_brand AS item_brand,
        rj.status,
        rj.co2_saving_kg AS env_saving,
        EXTRACT(EPOCH FROM (rj.completed_at - rj.accepted_at)) / 60.0 AS duration_min,
        u.display_name AS repairer_name,
        sc.name AS category_name,
        sc.icon AS category_icon,
        sc.colour AS category_colour
      FROM repair_jobs rj
      LEFT JOIN users u ON u.id = rj.repairer_id
      LEFT JOIN skill_categories sc ON sc.id = rj.item_category_id
      WHERE rj.event_id = ${id}
      ORDER BY rj.created_at
    `);

    // Linux help is something a cafe offers at an ordinary session rather than
    // a separate event, so the report for a session covers both. Null when the
    // cafe does not run Linux, or nothing was written up here, and the page
    // then leaves the block out.
    const [cafeRow] = await db.select({ linuxEnabled: cafes.linuxEnabled }).from(cafes).limit(1);
    const linux = cafeRow?.linuxEnabled ? await linuxStatsForEvent(id) : null;

    return {
      event: {
        id: event.id,
        name: event.name,
        date: event.date,
        startTime: event.start_time,
        endTime: event.end_time,
        status: event.status,
        venueName: event.venue_name,
        venueAddress: event.venue_address,
      },
      linux,
      totals: {
        repairCount: Number(t.repair_count ?? 0),
        completedCount: completed,
        cannotRepairCount: Number(t.cannot_repair ?? 0),
        returnedCount: Number(t.returned ?? 0),
        openCount: Number(t.open_count ?? 0),
        successRate: closed > 0 ? Math.round((completed / closed) * 100) : 0,
        avgDurationMin: Math.round(Number(t.avg_duration_min ?? 0)),
        totalDurationMin: Math.round(Number(t.total_duration_min ?? 0)),
        environmentalSavingKg: Number(t.savings_kg ?? 0),
      },
      repairers: repairersRows.rows.map((r: any) => ({
        id: r.id,
        displayName: r.display_name,
        count: Number(r.count ?? 0),
        completedCount: Number(r.completed ?? 0),
        avgDurationMin: Math.round(Number(r.avg_duration_min ?? 0)),
      })),
      categories: categoriesRows.rows.map((r: any) => ({
        id: r.id ?? null,
        name: r.name ?? 'Uncategorised',
        icon: r.icon ?? null,
        colour: r.colour ?? null,
        count: Number(r.count ?? 0),
        completedCount: Number(r.completed ?? 0),
      })),
      jobs: jobsRows.rows.map((r: any) => ({
        id: r.id,
        jobNumber: r.job_number,
        itemDescription: r.item_description,
        itemBrand: r.item_brand,
        status: r.status,
        environmentalSavingKg: r.env_saving == null ? null : Number(r.env_saving),
        durationMin: r.duration_min == null ? null : Math.round(Number(r.duration_min)),
        repairerName: r.repairer_name,
        categoryName: r.category_name,
        categoryIcon: r.category_icon,
        categoryColour: r.category_colour,
      })),
    };
  });
}
