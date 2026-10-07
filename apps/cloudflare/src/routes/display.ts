// =============================================================================
//  The waiting-room display
//  ---------------------------------------------------------------------------
//  A screen in the waiting area shows the queue: what is being repaired, what
//  is waiting and in what order, and what is ready to collect. It used to need
//  an admin signed in on that screen, which leaves the whole admin area open to
//  anyone who walks up to it.
//
//  Now the screen opens a private link instead, /display/<token>. The token is
//  random and only reaches people an admin gives the link to. An admin can
//  replace it at any time, which stops the old link working.
//
//  What the display gets is deliberately less than the admin board: no
//  visitor names, no contact details and no photographs, because everyone in
//  the room can read it. A visitor finds their item by its job number.
// =============================================================================
import type { App } from '../lib/router.js';
import { and, asc, eq, or } from 'drizzle-orm';
import { db, inList } from '../db/index.js';
import { localToday } from '../lib/dates.js';
import { cafes, events, repairJobs, skillCategories, users, venues } from '../db/schema.js';
import { randomToken } from '../utils/tokens.js';
import { audit } from '../utils/audit.js';

/** Finished repairs stay on the display this long, so visitors see theirs is ready. */
const RECENTLY_FINISHED_MS = 45 * 60 * 1000;

/** The cafe's own date today. See lib/dates.ts. */
function today(): string {
  return localToday();
}

/** The cafe's display token, made the first time an admin asks for it. */
async function displayToken(regenerate = false): Promise<string | null> {
  const [cafe] = await db.select({ id: cafes.id, token: cafes.displayToken }).from(cafes).limit(1);
  if (!cafe) return null;
  if (cafe.token && !regenerate) return cafe.token;
  const token = randomToken(18);
  await db.update(cafes).set({ displayToken: token, updatedAt: new Date() }).where(eq(cafes.id, cafe.id));
  return token;
}

export async function displayRoutes(app: App): Promise<void> {
  // ── For admins: the link to open on the screen ────────────────────
  app.get('/api/admin/display-link', { preHandler: app.requireRole('super_admin', 'admin') }, async (_request, reply) => {
    const token = await displayToken();
    if (!token) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    return { token, path: `/display/${token}` };
  });

  app.post(
    '/api/admin/display-link/regenerate',
    { preHandler: app.requireRole('super_admin', 'admin') },
    async (request, reply) => {
      const me = request.auth!;
      const token = await displayToken(true);
      if (!token) {
        reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
        return;
      }
      await audit({ request, actorId: me.sub, actorType: me.role, action: 'display.link_replaced', entityType: 'cafe' });
      return { token, path: `/display/${token}` };
    },
  );

  // ── For the screen itself ─────────────────────────────────────────
  app.get('/api/display/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const [cafe] = await db
      .select({
        name: cafes.name,
        logoUrl: cafes.logoUrl,
        primaryColor: cafes.primaryColor,
        accentColor: cafes.accentColor,
        token: cafes.displayToken,
        co2Enabled: cafes.co2Enabled,
      })
      .from(cafes)
      .limit(1);
    // A wrong token gets the same answer as no display at all.
    if (!cafe?.token || !token || token.length < 16 || token !== cafe.token) {
      reply.code(404).send({ error: 'This display link is not valid. Ask an admin for the current one.', code: 'display/not_found' });
      return;
    }

    // The sessions on now: anything started, and anything planned for today.
    const sessionRows = await db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        qrCodeUrl: events.qrCodeUrl,
        venueName: venues.name,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(or(eq(events.status, 'active'), and(eq(events.date, today()), eq(events.status, 'scheduled'))))
      .orderBy(asc(events.date), asc(events.startTime));
    const ids = sessionRows.map((e) => e.id);

    const rows = ids.length
      ? await db
          .select({
            jobNumber: repairJobs.jobNumber,
            item: repairJobs.itemDescription,
            status: repairJobs.status,
            createdAt: repairJobs.createdAt,
            acceptedAt: repairJobs.acceptedAt,
            completedAt: repairJobs.completedAt,
            co2SavingKg: repairJobs.co2SavingKg,
            category: skillCategories.name,
            categoryColour: skillCategories.colour,
            repairerName: users.displayName,
          })
          .from(repairJobs)
          .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
          .leftJoin(users, eq(users.id, repairJobs.repairerId))
          .where(inList(repairJobs.eventId, ids))
          .orderBy(asc(repairJobs.createdAt))
      : [];

    const now = Date.now();
    const fixed = rows.filter((r) => r.status === 'completed');
    const jobs = rows
      .filter(
        (r) =>
          r.status === 'waiting' ||
          r.status === 'in_progress' ||
          ((r.status === 'completed' || r.status === 'cannot_repair') &&
            r.completedAt !== null &&
            now - new Date(r.completedAt).getTime() < RECENTLY_FINISHED_MS),
      )
      .map((r) => ({
        jobNumber: r.jobNumber,
        // The visitor's own words, cut short. Long descriptions sometimes
        // carry more than the item, and a screen only needs enough to spot it.
        item: r.item.length > 60 ? `${r.item.slice(0, 57).trimEnd()}…` : r.item,
        category: r.category,
        categoryColour: r.categoryColour,
        status: r.status,
        createdAt: r.createdAt,
        acceptedAt: r.acceptedAt,
        completedAt: r.completedAt,
        // First names only, the same as the visitor's tracking page.
        repairerFirstName: r.repairerName ? r.repairerName.split(' ')[0] : null,
      }));

    // How long a repair takes here today, for the waiting time estimate.
    const durations = rows
      .filter((r) => r.acceptedAt && r.completedAt)
      .map((r) => new Date(r.completedAt!).getTime() - new Date(r.acceptedAt!).getTime())
      .filter((ms) => ms > 0 && ms < 4 * 60 * 60 * 1000);

    void reply.header('Cache-Control', 'no-store');
    return {
      cafe: { name: cafe.name, logoUrl: cafe.logoUrl, primaryColor: cafe.primaryColor, accentColor: cafe.accentColor },
      sessions: sessionRows.map((e) => ({
        name: e.name,
        startTime: e.startTime,
        endTime: e.endTime,
        status: e.status,
        venueName: e.venueName,
        qrCodeUrl: e.status === 'active' ? e.qrCodeUrl : null,
      })),
      jobs,
      today: {
        checkedIn: rows.length,
        fixed: fixed.length,
        co2SavedKg: cafe.co2Enabled
          ? Math.round(fixed.reduce((sum, r) => sum + Number(r.co2SavingKg ?? 0), 0) * 10) / 10
          : null,
        averageRepairMinutes: durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)
          : null,
      },
      generatedAt: new Date().toISOString(),
    };
  });
}
