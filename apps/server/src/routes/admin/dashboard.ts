import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { auditLog, events, repairJobs, users, venues } from '../../db/schema.js';
import { and, asc, count, desc, eq, ne, sql, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export async function adminDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/dashboard', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Active event
    const activeRows = await db
      .select({ event: events, venue: venues })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(eq(events.status, 'active'))
      .orderBy(asc(events.date))
      .limit(1);

    let activeEvent = null;
    let activeCounts = null;
    if (activeRows.length > 0) {
      const evt = activeRows[0].event;
      const jobs = await db.select({ status: repairJobs.status }).from(repairJobs).where(eq(repairJobs.eventId, evt.id));
      activeCounts = {
        waiting: jobs.filter((j) => j.status === 'waiting').length,
        in_progress: jobs.filter((j) => j.status === 'in_progress').length,
        completed: jobs.filter((j) => j.status === 'completed').length,
        cannot_repair: jobs.filter((j) => j.status === 'cannot_repair').length,
        awaiting_return: jobs.filter((j) => j.status === 'awaiting_return').length,
      };
      activeEvent = { ...evt, venueName: activeRows[0].venue.name };
    }

    // Next scheduled event if no active
    let nextEvent = null;
    if (!activeEvent) {
      const nextRows = await db
        .select({ event: events, venue: venues })
        .from(events)
        .innerJoin(venues, eq(venues.id, events.venueId))
        .where(and(eq(events.status, 'scheduled'), sql`${events.date} >= ${today}`))
        .orderBy(asc(events.date), asc(events.startTime))
        .limit(1);
      if (nextRows[0]) {
        nextEvent = { ...nextRows[0].event, venueName: nextRows[0].venue.name };
      }
    }

    // Quick stats
    const [{ totalRepairs }] = await db.select({ totalRepairs: count() }).from(repairJobs);
    const [{ totalEvents }] = await db.select({ totalEvents: count() }).from(events);
    const [{ totalSavings }] = await db
      .select({ totalSavings: sum(repairJobs.environmentalSavingKg) })
      .from(repairJobs)
      .where(eq(repairJobs.status, 'completed'));
    const [{ activeRepairers }] = await db
      .select({ activeRepairers: count() })
      .from(users)
      .where(eq(users.isActive, true));

    // Recent activity. Join in the actor and the affected repair, event or
    // user so the dashboard can say who did what. Sign-ins are left out
    // because they would crowd out the useful entries.
    const actor = alias(users, 'actor');
    const targetUser = alias(users, 'target_user');
    const recent = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        actorType: auditLog.actorType,
        actorName: actor.displayName,
        jobNumber: repairJobs.jobNumber,
        itemDescription: repairJobs.itemDescription,
        eventName: events.name,
        targetUserName: targetUser.displayName,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(actor, eq(actor.id, auditLog.actorId))
      .leftJoin(repairJobs, and(eq(auditLog.entityType, 'repair_job'), eq(repairJobs.id, auditLog.entityId)))
      .leftJoin(events, and(eq(auditLog.entityType, 'event'), eq(events.id, auditLog.entityId)))
      .leftJoin(targetUser, and(eq(auditLog.entityType, 'user'), eq(targetUser.id, auditLog.entityId)))
      .where(ne(auditLog.action, 'auth.login'))
      .orderBy(desc(auditLog.createdAt))
      .limit(10);

    return {
      activeEvent,
      activeCounts,
      nextEvent,
      stats: {
        totalRepairs: Number(totalRepairs),
        totalEvents: Number(totalEvents),
        totalSavingsKg: Number(totalSavings ?? 0),
        activeRepairers: Number(activeRepairers),
      },
      recentActivity: recent,
    };
  });
}
