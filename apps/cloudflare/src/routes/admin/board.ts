import type { App } from '../../lib/router.js';
import { db, inList } from '../../db/index.js';
import { localToday } from '../../lib/dates.js';
import { events, repairImages, repairJobs, skillCategories, users } from '../../db/schema.js';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

/**
 * Live "kiosk" board endpoint — returns the jobs that should appear on the
 * shop-floor screen. By default it includes every active event (status =
 * 'active') plus every event scheduled for today, and limits the visible
 * status set to those a repairer can still act on (waiting / in_progress)
 * plus any job completed in the last 45 minutes (so the room sees the win
 * for a moment before it scrolls off).
 *
 * Optional ?eventId=<uuid> scopes everything to a single event.
 */
export async function adminBoardRoutes(app: App): Promise<void> {
  app.get('/api/admin/board', async (request) => {
    const q = request.query as { eventId?: string };

    // Pick the events to show
    const eventConds: any[] = [];
    if (q.eventId) {
      eventConds.push(eq(events.id, q.eventId));
    } else {
      eventConds.push(
        sql`(${events.status} = 'active' OR ${events.date} = ${localToday()})`,
      );
    }
    const visibleEvents = await db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        qrCodeUrl: events.qrCodeUrl,
      })
      .from(events)
      .where(and(...eventConds))
      .orderBy(desc(events.date));

    let jobs: any[] = [];
    if (visibleEvents.length > 0) {
      const ids = visibleEvents.map((e) => e.id);
      const rows = await db
        .select({
          id: repairJobs.id,
          jobNumber: repairJobs.jobNumber,
          customerName: repairJobs.customerName,
          itemDescription: repairJobs.itemDescription,
          itemBrand: repairJobs.itemBrand,
          status: repairJobs.status,
          createdAt: repairJobs.createdAt,
          acceptedAt: repairJobs.acceptedAt,
          completedAt: repairJobs.completedAt,
          eventId: repairJobs.eventId,
          eventName: events.name,
          category: skillCategories.name,
          categoryColour: skillCategories.colour,
          repairerName: users.displayName,
        })
        .from(repairJobs)
        .innerJoin(events, eq(events.id, repairJobs.eventId))
        .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
        .leftJoin(users, eq(users.id, repairJobs.repairerId))
        .where(
          and(
            inList(repairJobs.eventId, ids),
            sql`(
              ${repairJobs.status} IN ('waiting','in_progress')
              OR (${repairJobs.completedAt} IS NOT NULL
                  AND ${repairJobs.completedAt} >= ${Date.now() - 45 * 60 * 1000})
            )`,
          ),
        )
        .orderBy(desc(repairJobs.createdAt))
        .limit(200);

      // Pull the first image (oldest, usually a check-in photo) per job in one query
      const jobIds = rows.map((r) => r.id);
      const imageMap = new Map<string, string>();
      if (jobIds.length > 0) {
        const imgs = await db
          .select({
            jobId: repairImages.repairJobId,
            filePath: repairImages.filePath,
            createdAt: repairImages.createdAt,
          })
          .from(repairImages)
          .where(inList(repairImages.repairJobId, jobIds))
          .orderBy(asc(repairImages.createdAt));
        for (const im of imgs) {
          if (!imageMap.has(im.jobId)) imageMap.set(im.jobId, im.filePath);
        }
      }

      // `repair_images.file_path` stores the path relative to the uploads dir
      // (see services/imageUpload.ts). The board renders it straight into an
      // <img src>, so we prefix `/uploads/` here to produce a working URL.
      jobs = rows.map((r) => {
        const rel = imageMap.get(r.id);
        return {
          ...r,
          thumbnailUrl: rel ? `/uploads/${rel}` : null,
        };
      });
    }

    // Today's totals for the footer of the board, over every repair at the
    // sessions shown, not just the ones still on screen.
    let today = { checkedIn: 0, fixed: 0, co2SavedKg: 0, averageRepairMinutes: null as number | null };
    if (visibleEvents.length > 0) {
      const all = await db
        .select({
          status: repairJobs.status,
          co2SavingKg: repairJobs.co2SavingKg,
          acceptedAt: repairJobs.acceptedAt,
          completedAt: repairJobs.completedAt,
        })
        .from(repairJobs)
        .where(inList(repairJobs.eventId, visibleEvents.map((e) => e.id)));
      const fixed = all.filter((r) => r.status === 'completed');
      const durations = all
        .filter((r) => r.acceptedAt && r.completedAt)
        .map((r) => new Date(r.completedAt!).getTime() - new Date(r.acceptedAt!).getTime())
        .filter((ms) => ms > 0 && ms < 4 * 60 * 60 * 1000);
      today = {
        checkedIn: all.length,
        fixed: fixed.length,
        co2SavedKg: Math.round(fixed.reduce((sum, r) => sum + Number(r.co2SavingKg ?? 0), 0) * 10) / 10,
        averageRepairMinutes: durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)
          : null,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      events: visibleEvents,
      jobs,
      today,
    };
  });
}
