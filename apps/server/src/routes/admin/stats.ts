import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { events, repairJobs, skillCategories, users } from '../../db/schema.js';
import { and, count, desc, eq, sql } from 'drizzle-orm';

function dateConditions(table: any, q: { from?: string; to?: string }) {
  const conds: any[] = [];
  if (q.from) conds.push(sql`${table.createdAt} >= ${q.from}::date`);
  if (q.to) conds.push(sql`${table.createdAt} <= (${q.to}::date + INTERVAL '1 day')`);
  return conds;
}

export async function adminStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/stats/summary', async () => {
    const [{ totalRepairs }] = await db.select({ totalRepairs: count() }).from(repairJobs);
    const [{ totalEvents }] = await db.select({ totalEvents: count() }).from(events);
    const closed = await db
      .select({ status: repairJobs.status, c: sql<number>`COUNT(*)::int` })
      .from(repairJobs)
      .groupBy(repairJobs.status);
    const completed = closed.find((s) => s.status === 'completed')?.c ?? 0;
    const cantRepair = closed.find((s) => s.status === 'cannot_repair')?.c ?? 0;
    const denom = Number(completed) + Number(cantRepair);
    const successRate = denom > 0 ? Math.round((Number(completed) / denom) * 100) : 0;
    const [{ savings }] = await db.select({ savings: sql<string>`COALESCE(SUM(environmental_saving_kg), 0)::text` }).from(repairJobs);
    const [{ activeRepairers }] = await db.select({ activeRepairers: count() }).from(users).where(eq(users.isActive, true));
    return {
      totalRepairs: Number(totalRepairs),
      totalEvents: Number(totalEvents),
      successRate,
      environmentalSavingKg: Number(savings ?? 0),
      activeRepairers: Number(activeRepairers),
    };
  });

  app.get('/api/admin/stats/repairs-by-month', async (request) => {
    const q = request.query as { from?: string; to?: string };
    const conditions = dateConditions(repairJobs, q);
    const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.execute(sql`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             status,
             COUNT(*)::int AS c
      FROM repair_jobs
      ${whereExpr ? sql`WHERE ${whereExpr}` : sql``}
      GROUP BY 1, 2
      ORDER BY 1
    `);
    return rows.rows;
  });

  app.get('/api/admin/stats/repairs-by-category', async (request) => {
    const q = request.query as { from?: string; to?: string };
    const conditions = dateConditions(repairJobs, q);
    const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select({
        category: skillCategories.name,
        c: sql<number>`COUNT(*)::int`,
      })
      .from(repairJobs)
      .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
      .where(whereExpr as any)
      .groupBy(skillCategories.name)
      .orderBy(desc(sql`COUNT(*)`));
    return rows.map((r) => ({ category: r.category ?? 'Uncategorised', c: Number(r.c) }));
  });

  app.get('/api/admin/stats/success-rate-over-time', async () => {
    const rows = await db.execute(sql`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
             SUM(CASE WHEN status IN ('completed','cannot_repair') THEN 1 ELSE 0 END)::int AS closed
      FROM repair_jobs
      GROUP BY 1 ORDER BY 1
    `);
    return rows.rows.map((r: any) => ({
      month: r.month,
      successRate: r.closed > 0 ? Math.round((r.completed / r.closed) * 100) : 0,
    }));
  });

  app.get('/api/admin/stats/top-repairers', async (request) => {
    const q = request.query as { limit?: string };
    const limit = Math.min(50, Number(q.limit ?? 10));
    const rows = await db
      .select({
        repairerId: repairJobs.repairerId,
        displayName: users.displayName,
        c: sql<number>`COUNT(*)::int`,
      })
      .from(repairJobs)
      .innerJoin(users, eq(users.id, repairJobs.repairerId))
      .where(eq(repairJobs.status, 'completed'))
      .groupBy(repairJobs.repairerId, users.displayName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);
    return rows.map((r) => ({ repairerId: r.repairerId, displayName: r.displayName, count: Number(r.c) }));
  });

  app.get('/api/admin/stats/environmental-savings', async () => {
    const rows = await db.execute(sql`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             COALESCE(SUM(environmental_saving_kg), 0)::numeric AS savings
      FROM repair_jobs
      GROUP BY 1 ORDER BY 1
    `);
    let cum = 0;
    return rows.rows.map((r: any) => {
      cum += Number(r.savings ?? 0);
      return { month: r.month, savings: Number(r.savings ?? 0), cumulative: cum };
    });
  });

  app.get('/api/admin/stats/jobs-per-event', async () => {
    const rows = await db.execute(sql`
      SELECT e.date AS date, e.name AS name, COUNT(rj.id)::int AS jobs
      FROM events e
      LEFT JOIN repair_jobs rj ON rj.event_id = e.id
      WHERE e.status IN ('completed','active')
      GROUP BY e.id, e.date, e.name
      ORDER BY e.date
    `);
    return rows.rows;
  });
}
