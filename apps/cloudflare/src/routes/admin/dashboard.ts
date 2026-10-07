import type { App } from '../../lib/router.js';
import { db } from '../../db/index.js';
import { auditLog, events, repairJobs, skillCategories, users, venues } from '../../db/schema.js';
import { and, asc, count, desc, eq, ne, sql, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { localToday } from '../../lib/dates.js';

export async function adminDashboardRoutes(app: App): Promise<void> {
  app.get('/api/admin/dashboard', async () => {
    // The cafe's own date. See lib/dates.ts.
    const today = localToday();

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
      .select({ totalSavings: sum(repairJobs.co2SavingKg) })
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


    // ── What the dashboard needs to run today's session ──────────────
    // Every repair at the active session, oldest first, so the dashboard can
    // show the queue, who is working on what, and anything waiting too long.
    const activeJobs = activeEvent
      ? await db
          .select({
            id: repairJobs.id,
            jobNumber: repairJobs.jobNumber,
            itemDescription: repairJobs.itemDescription,
            customerName: repairJobs.customerName,
            status: repairJobs.status,
            createdAt: repairJobs.createdAt,
            acceptedAt: repairJobs.acceptedAt,
            completedAt: repairJobs.completedAt,
            repairerId: repairJobs.repairerId,
            repairerName: users.displayName,
            category: skillCategories.name,
            categoryColour: skillCategories.colour,
          })
          .from(repairJobs)
          .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
          .leftJoin(users, eq(users.id, repairJobs.repairerId))
          .where(eq(repairJobs.eventId, (activeEvent as { id: string }).id))
          .orderBy(asc(repairJobs.createdAt))
      : [];

    // The next few sessions, so planning is one glance away.
    const upcomingEvents = await db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        isPublished: events.isPublished,
        supportsLinux: events.supportsLinux,
        venueName: venues.name,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(and(eq(events.status, 'scheduled'), sql`${events.date} >= ${today}`))
      .orderBy(asc(events.date), asc(events.startTime))
      .limit(4);

    // Repairs paused until the visitor comes back with a part. Easy to forget
    // between sessions, so they stay on the dashboard until they are finished.
    const awaitingReturn = await db
      .select({
        id: repairJobs.id,
        jobNumber: repairJobs.jobNumber,
        itemDescription: repairJobs.itemDescription,
        customerName: repairJobs.customerName,
        outcomeNotes: repairJobs.outcomeNotes,
        eventDate: events.date,
      })
      .from(repairJobs)
      .innerJoin(events, eq(events.id, repairJobs.eventId))
      .where(eq(repairJobs.status, 'awaiting_return'))
      .orderBy(desc(events.date))
      .limit(20);

    return {
      activeEvent,
      activeCounts,
      nextEvent,
      activeJobs,
      upcomingEvents,
      awaitingReturn,
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
