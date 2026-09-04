import { env } from '../env.js';
import { APP_VERSION } from '../version.js';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  cafeGallery,
  cafes,
  eventImages,
  events,
  repairImages,
  repairJobs,
  skillCategories,
  users,
  venues,
} from '../db/schema.js';
import { and, asc, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { iconVersion } from '../services/pwaIcons.js';
import { uploadUrl } from '../services/imageUpload.js';
import { findOurs, getNetwork, resolveSlugs } from '../services/repairCafeNetwork.js';
import { getGuide, recentGuides, searchGuides } from '../services/ifixit.js';
import { co2Settings, listFactors } from '../services/co2.js';
import { linuxStats, linuxStatsForEvent } from '../services/linux.js';

/** How many photos the site's main gallery will ever return. */
const MAIN_GALLERY_LIMIT = 60;

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/public/cafe', async () => {
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) return null;
    const gallery = await mainGallery();
    return {
      name: cafe.name,
      tagline: cafe.tagline,
      description: cafe.description,
      logoUrl: cafe.logoUrl,
      bannerUrl: cafe.bannerUrl,
      websiteUrl: cafe.websiteUrl,
      contactEmail: cafe.contactEmail,
      address: cafe.address,
      socialLinks: cafe.socialLinks,
      homePage: cafe.homePage,
      gallery,
      // ── Linux Repair Cafe ────────────────────────────────────────
      // The flag is always sent, because every page uses it to decide whether
      // the menu item and the home page card appear. The wording only follows
      // when the feature is on, so cafes that do not offer it are not sending
      // a page nobody will read on every request.
      linuxEnabled: cafe.linuxEnabled,
      linuxPage: cafe.linuxEnabled ? cafe.linuxPage : null,
      primaryColor: cafe.primaryColor,
      accentColor: cafe.accentColor,
      headingFont: cafe.headingFont,
      bodyFont: cafe.bodyFont,
      donateUrl: cafe.donateUrl,
      // ── SEO + analytics surfaced for the SPA <head> ────────────
      faviconUrl: cafe.faviconUrl,
      seoTitle: cafe.seoTitle,
      seoDescription: cafe.seoDescription,
      ogImageUrl: cafe.ogImageUrl,
      plausibleDomain: cafe.plausibleDomain,
      plausibleSrc: cafe.plausibleSrc,
      // Set when the cafe is listed on repaircafe.org. The world map uses it
      // to highlight our own pin.
      repaircafeSlug: cafe.repaircafeSlug,
      // Hash of the branding the home screen icons are built from. The web
      // <head> uses it to point at the right (immutable) icon file.
      pwaIconVersion: iconVersion({
        logoUrl: cafe.logoUrl,
        faviconUrl: cafe.faviconUrl,
        primaryColor: cafe.primaryColor,
      }),
      // True only on a public try-it-out site. The pages use it to show a
      // banner saying the data is made up and resets, and to keep the whole
      // site out of search results.
      demoMode: env.DEMO_MODE,
      // Which version this hub is running. Shown in the footer and in the
      // admin sidebar, so anybody looking at a cafe's site, or asking one for
      // help, can see it without going near a terminal.
      appVersion: APP_VERSION,
    };
  });

  // ── The worldwide Repair Café directory, for the /world map ─────────────
  // A cached mirror of the repaircafe.org location API. See
  // services/repairCafeNetwork.ts for why we proxy it rather than calling it
  // from the browser. `ours` is this cafe's own pin, when an admin has saved
  // the cafe's repaircafe.org address under Settings.
  app.get('/api/public/repair-cafe-network', async (_request, reply) => {
    const snapshot = await getNetwork();
    if (!snapshot) {
      reply.code(503).send({
        error: 'The Repair Café directory is not available right now',
        code: 'network/unavailable',
      });
      return;
    }
    const [cafe] = await db.select({ slug: cafes.repaircafeSlug }).from(cafes).limit(1);
    // The directory only changes daily, so let browsers and any proxy in front
    // of us hold on to it for an hour.
    void reply.header('Cache-Control', 'public, max-age=3600');
    return {
      ...snapshot,
      ours: findOurs(snapshot, cafe?.slug ?? null),
    };
  });

  // ── The kinds of thing people bring in, and what each one saves ─────────
  // Used by the check-in item picker, and by the About page to show its
  // workings. Public because check-in is done by visitors who are not signed
  // in. It is reference data with nothing personal in it.
  app.get('/api/public/co2-factors', async (_request, reply) => {
    const [settings, factors] = await Promise.all([co2Settings(), listFactors()]);
    void reply.header('Cache-Control', 'public, max-age=3600');
    return {
      enabled: settings.enabled,
      displacementRate: settings.displacementRate,
      factors,
      source: {
        name: 'Fixometer reference data (2021), The Restart Project',
        url: 'https://zenodo.org/records/5900046',
        licence: 'CC BY-SA 4.0',
      },
    };
  });

  // ── Neighbouring cafes we know and support ──────────────────────────────
  // Backs the "local repair cafe community" card on the home page. Returns an
  // empty list, never an error, when nothing has been chosen or the directory
  // is briefly unreachable, so the card simply does not appear.
  app.get('/api/public/local-cafes', async (_request, reply) => {
    const [cafe] = await db
      .select({ slug: cafes.repaircafeSlug, selected: cafes.localCafeSlugs, name: cafes.name })
      .from(cafes)
      .limit(1);
    const selected = cafe?.selected ?? [];
    if (selected.length === 0) return { ours: null, cafes: [] };

    const snapshot = await getNetwork();
    if (!snapshot) return { ours: null, cafes: [] };

    const ours = findOurs(snapshot, cafe?.slug ?? null);
    // The directory only changes daily, so let browsers hold on to this for an
    // hour, the same as the world map.
    void reply.header('Cache-Control', 'public, max-age=3600');
    return {
      // Our own pin, so the map can show where the group is centred. We use
      // the cafe's own name rather than the directory's, because that is the
      // name the rest of the site uses.
      ours: ours ? { ...ours, name: cafe?.name || ours.name } : null,
      cafes: resolveSlugs(snapshot, selected, ours),
    };
  });

  // ── Proving this hub is real ────────────────────────────────────────────
  // The telemetry collector cannot tell a real cafe from somebody with curl,
  // so it does not take our word for it: it fetches this endpoint and checks
  // that the install id here matches the one that was sent to it. Only a hub
  // that genuinely runs at this address can answer.
  //
  // This is the same idea as an ACME HTTP-01 challenge. The install id is a
  // random value that identifies this install to the collector and means
  // nothing to anybody else, and every figure below is already public on
  // /api/public/stats. See docs/proposal-telemetry.md.
  //
  // Answering at all is a form of consent, so a cafe that has not agreed to
  // share gets a 404 rather than a payload.
  app.get('/api/public/telemetry', async (_request, reply) => {
    const [cafe] = await db
      .select({
        level: cafes.telemetryLevel,
        installId: cafes.telemetryInstallId,
        name: cafes.name,
      })
      .from(cafes)
      .limit(1);

    if (!cafe || cafe.level === 'none' || !cafe.installId) {
      reply.code(404).send({ error: 'Not shared', code: 'telemetry/not_shared' });
      return;
    }

    const totals = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                          AS recorded,
        COUNT(*) FILTER (WHERE status = 'completed')::int                      AS fixed,
        COUNT(*) FILTER (WHERE status = 'cannot_repair')::int                  AS not_fixed,
        COALESCE(SUM(co2_saving_kg) FILTER (WHERE status = 'completed'), 0)::float AS co2_kg
      FROM repair_jobs
    `);
    const t = (totals.rows[0] ?? {}) as Record<string, unknown>;

    const others = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM events WHERE status IN ('completed','active'))          AS sessions,
        (SELECT COUNT(*)::int FROM users WHERE is_active AND role <> 'super_admin')        AS volunteers
    `);
    const o = (others.rows[0] ?? {}) as Record<string, unknown>;

    // Never cached: a stale answer would let a hub look verified after it had
    // stopped sharing.
    void reply.header('Cache-Control', 'no-store');
    return {
      installId: cafe.installId,
      level: cafe.level,
      // Sent only at the Community level, where the cafe already asked to be
      // named in public.
      name: cafe.level === 'community' ? cafe.name || null : null,
      repairsRecorded: Number(t.recorded ?? 0),
      repairsFixed: Number(t.fixed ?? 0),
      repairsNotFixed: Number(t.not_fixed ?? 0),
      sessionsHeld: Number(o.sessions ?? 0),
      volunteers: Number(o.volunteers ?? 0),
      co2SavedKg: Math.round(Number(t.co2_kg ?? 0) * 10) / 10,
    };
  });

  // ── Repair guides from iFixit ───────────────────────────────────────────
  // Proxied and cached, so visitors' searches stay between them and us. See
  // services/ifixit.ts.
  app.get('/api/public/guides', async (request, reply) => {
    const query = request.query as { q?: string; offset?: string; limit?: string };
    const q = (query.q ?? '').trim().slice(0, 120);
    const offset = Math.max(0, Math.min(200, Number(query.offset) || 0));
    const limit = Math.max(1, Math.min(48, Number(query.limit) || 24));

    if (!q) return { guides: [], moreResults: false, query: '' };

    try {
      const result = await searchGuides(q, offset, limit);
      void reply.header('Cache-Control', 'public, max-age=3600');
      return result;
    } catch {
      reply.code(503).send({
        error: 'Repair guides are not available right now',
        code: 'guides/unavailable',
      });
      return;
    }
  });

  // Something to look at before anybody has typed anything. The page used to
  // open empty, which made it look broken rather than ready.
  app.get('/api/public/guides/recent', async (_request, reply) => {
    try {
      const guides = await recentGuides(9);
      void reply.header('Cache-Control', 'public, max-age=3600');
      return { guides };
    } catch {
      // A quiet empty list: the page has a search box and works without this.
      return { guides: [] };
    }
  });

  app.get('/api/public/guides/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const guideId = Number(id);
    if (!Number.isInteger(guideId) || guideId <= 0) {
      reply.code(400).send({ error: 'Unknown guide', code: 'guides/bad_id' });
      return;
    }
    const guide = await getGuide(guideId);
    if (!guide) {
      reply.code(404).send({ error: 'Guide not found', code: 'guides/not_found' });
      return;
    }
    void reply.header('Cache-Control', 'public, max-age=21600');
    return guide;
  });

  // ── Headline numbers for the home page ──────────────────────────────────
  // Counted over sessions that actually happened ('completed' or 'active'),
  // the same rule the admin stats use, so the public figures and the internal
  // ones can never disagree. Only shown if the cafe turns it on.
  app.get('/api/public/stats', async () => {
    const rows = await db.execute(sql`
      SELECT
        COUNT(DISTINCT e.id)::int AS event_count,
        COUNT(rj.id)::int AS repair_count,
        COUNT(rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed,
        COUNT(rj.id) FILTER (WHERE rj.status = 'cannot_repair')::int AS cannot_repair,
        COALESCE(SUM(rj.co2_saving_kg) FILTER (WHERE rj.status = 'completed'), 0)::float AS savings_kg,
        -- How many finished repairs actually carry a figure. The total is a sum
        -- over these, not over every repair, and the page says so.
        COUNT(rj.id) FILTER (WHERE rj.status = 'completed' AND rj.co2_saving_kg IS NOT NULL)::int AS savings_counted
      FROM events e
      LEFT JOIN repair_jobs rj ON rj.event_id = e.id
      WHERE e.status IN ('completed','active')
    `);
    const r = (rows.rows[0] ?? {}) as Record<string, unknown>;
    const completed = Number(r.completed ?? 0);
    // Success rate is out of the repairs we finished either way. Repairs still
    // open, or paused waiting for a part, would drag it down unfairly.
    const closed = completed + Number(r.cannot_repair ?? 0);

    const [volunteerRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(and(eq(users.isActive, true), ne(users.role, 'super_admin')));

    return {
      eventCount: Number(r.event_count ?? 0),
      repairCount: Number(r.repair_count ?? 0),
      completedCount: completed,
      successRate: closed > 0 ? Math.round((completed / closed) * 100) : 0,
      co2SavedKg: Math.round(Number(r.savings_kg ?? 0) * 10) / 10,
      // What the CO2 total is actually based on, so the page can say
      // "from 78% of repairs" rather than implying it covers all of them.
      co2CountedRepairs: Number(r.savings_counted ?? 0),
      volunteerCount: Number(volunteerRow?.count ?? 0),
    };
  });

  app.get('/api/public/events', async (request) => {
    const query = request.query as { past?: string };
    const includePast = query.past === 'true';
    const today = new Date().toISOString().slice(0, 10);
    const conditions = [eq(events.isPublished, true), ne(events.status, 'cancelled')];
    if (!includePast) conditions.push(gte(events.date, today));
    // A session is only flagged as a Linux one while the cafe still runs them.
    const [cafeRow] = await db.select({ linuxEnabled: cafes.linuxEnabled }).from(cafes).limit(1);
    const linuxEnabled = cafeRow?.linuxEnabled ?? false;
    const rows = await db
      .select({
        id: events.id,
        name: events.name,
        description: events.description,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        supportsLinux: events.supportsLinux,
        venueName: venues.name,
        venueAddress: venues.address,
        venuePostcode: venues.postcode,
        // Enough for a past-events list to show a thumbnail and a count
        // without a second round trip per event.
        photoCount: sql<number>`(
          SELECT COUNT(*)::int FROM event_images ei
          WHERE ei.event_id = ${events.id} AND ei.is_published
        ) + (
          SELECT COUNT(*)::int FROM repair_images ri
          JOIN repair_jobs rj ON rj.id = ri.repair_job_id
          WHERE rj.event_id = ${events.id} AND ri.is_published
        )`,
        coverUrl: sql<string | null>`COALESCE(
          (SELECT ei.file_path FROM event_images ei
             WHERE ei.event_id = ${events.id} AND ei.is_published
             ORDER BY ei.sort_order, ei.created_at LIMIT 1),
          (SELECT ri.file_path FROM repair_images ri
             JOIN repair_jobs rj ON rj.id = ri.repair_job_id
             WHERE rj.event_id = ${events.id} AND ri.is_published
             ORDER BY ri.created_at LIMIT 1)
        )`,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(and(...conditions))
      .orderBy(asc(events.date), asc(events.startTime));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      supportsLinux: r.supportsLinux && linuxEnabled,
      venue: { name: r.venueName, address: r.venueAddress, postcode: r.venuePostcode },
      photoCount: Number(r.photoCount ?? 0),
      coverUrl: r.coverUrl ? uploadUrl(r.coverUrl) : null,
    }));
  });

  // Single published event — backs the crawlable /events/:id detail page. Past
  // events still resolve (so the page keeps ranking after the date); cancelled
  // or unpublished events 404.
  app.get('/api/public/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      reply.code(404).send({ error: 'Not found', code: 'event/not_found' });
      return;
    }
    const [row] = await db
      .select({
        id: events.id,
        name: events.name,
        description: events.description,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        supportsLinux: events.supportsLinux,
        venueName: venues.name,
        venueAddress: venues.address,
        venuePostcode: venues.postcode,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(and(eq(events.id, id), eq(events.isPublished, true), ne(events.status, 'cancelled')))
      .limit(1);
    if (!row) {
      reply.code(404).send({ error: 'Not found', code: 'event/not_found' });
      return;
    }

    // Photos and figures only make sense once a session has run. We go by the
    // date as well as the status, because plenty of cafes never get round to
    // marking a session "completed" and their photos should still show.
    const hasHappened =
      row.status === 'active' ||
      row.status === 'completed' ||
      row.date < new Date().toISOString().slice(0, 10);
    const [gallery, stats, cafeRow] = await Promise.all([
      hasHappened ? eventGallery(row.id) : Promise.resolve([]),
      hasHappened ? eventStats(row.id) : Promise.resolve(null),
      db.select({ homePage: cafes.homePage, linuxEnabled: cafes.linuxEnabled }).from(cafes).limit(1),
    ]);
    // Linux help happens at an ordinary session, so what a session achieved
    // includes the computers kept in use as well as the items mended.
    const linuxSummary =
      hasHappened && cafeRow[0]?.linuxEnabled ? await linuxStatsForEvent(row.id) : null;
    // Admins can turn the per-session figures off under Settings. Anything
    // saved before that switch existed keeps showing them.
    const showEventStats = (cafeRow[0]?.homePage as { showEventStats?: boolean } | undefined)?.showEventStats !== false;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
      // Only ever true while the cafe runs Linux sessions. A cafe that turns
      // the feature off should not still be telling visitors about it.
      supportsLinux: row.supportsLinux && (cafeRow[0]?.linuxEnabled ?? false),
      venue: { name: row.venueName, address: row.venueAddress, postcode: row.venuePostcode },
      gallery,
      stats: showEventStats ? stats : null,
      linuxStats: showEventStats ? linuxSummary : null,
    };
  });

  app.get('/api/public/skills', async () => {
    const cats = await db
      .select()
      .from(skillCategories)
      .where(eq(skillCategories.isActive, true))
      .orderBy(asc(skillCategories.sortOrder), asc(skillCategories.name));

    const repairerRows = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
        skills: users.skills,
        joinDate: users.joinDate,
        showOnHomePage: users.showOnHomePage,
      })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.showOnPublicPage, true)))
      .orderBy(asc(users.displayName));

    // users.skills stores skill_category UUIDs (the admin UI binds checkbox
    // values to category.id). Resolve to display names for the public site
    // and silently drop any stale IDs that no longer match a category.
    const nameById = new Map(cats.map((c) => [c.id, c.name]));
    const repairers = repairerRows.map((r) => ({
      ...r,
      skills: (r.skills ?? []).map((s) => nameById.get(s)).filter((n): n is string => Boolean(n)),
    }));

    const categoryWithCounts = cats.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      colour: c.colour,
      repairerCount: repairerRows.filter((r) => r.skills?.includes(c.id)).length,
    }));

    return { categories: categoryWithCounts, repairers };
  });

  // Single repairer profile, for the public /team/:id page. 404 if the user
  // is inactive or has hidden themselves from the public listing.
  app.get('/api/public/repairers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Basic shape check — id is a UUID, but we don't want to throw on garbage.
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      reply.code(404).send({ error: 'Not found', code: 'repairer/not_found' });
      return;
    }
    const [row] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
        skills: users.skills,
        joinDate: users.joinDate,
        repairCount: users.repairCountCache,
      })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true), eq(users.showOnPublicPage, true)))
      .limit(1);
    if (!row) {
      reply.code(404).send({ error: 'Not found', code: 'repairer/not_found' });
      return;
    }
    // Resolve skill IDs → names (same approach as /api/public/skills).
    const cats = await db
      .select({ id: skillCategories.id, name: skillCategories.name, colour: skillCategories.colour, icon: skillCategories.icon })
      .from(skillCategories)
      .where(eq(skillCategories.isActive, true));
    const byId = new Map(cats.map((c) => [c.id, c]));
    const skills = (row.skills ?? [])
      .map((sId) => byId.get(sId))
      .filter((s): s is { id: string; name: string; colour: string; icon: string } => Boolean(s));
    reply.header('Cache-Control', 'no-store');
    return { ...row, skills };
  });

  app.get('/api/public/venue', async () => {
    const [venue] = await db
      .select()
      .from(venues)
      .where(eq(venues.isHomeVenue, true))
      .limit(1);
    return venue ?? null;
  });

  app.get('/api/public/skill-categories', async () => {
    return db
      .select()
      .from(skillCategories)
      .where(eq(skillCategories.isActive, true))
      .orderBy(asc(skillCategories.sortOrder));
  });

  // ── The Linux Repair Cafe page ──────────────────────────────────────────
  // Everything that page needs in one call: the wording an admin wrote, the
  // next sessions where Linux help is on offer, who will be there to give it,
  // and what the cafe has managed so far.
  //
  // Returns 404 while the feature is off, which is what the page checks before
  // it redirects. A cafe that does not run Linux sessions has no such page.
  app.get('/api/public/linux', async (_request, reply) => {
    const [cafe] = await db
      .select({ enabled: cafes.linuxEnabled, page: cafes.linuxPage })
      .from(cafes)
      .limit(1);
    if (!cafe?.enabled) {
      reply.code(404).send({ error: 'Not found', code: 'linux/not_enabled' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = await db
      .select({
        id: events.id,
        name: events.name,
        description: events.description,
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        status: events.status,
        venueName: venues.name,
        venueAddress: venues.address,
        venuePostcode: venues.postcode,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          eq(events.isPublished, true),
          ne(events.status, 'cancelled'),
          eq(events.supportsLinux, true),
          gte(events.date, today),
        ),
      )
      .orderBy(asc(events.date), asc(events.startTime));

    // The volunteers who help at these sessions. Same visibility rules as the
    // rest of the site: a repairer who has hidden themselves stays hidden.
    const volunteers = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
        joinDate: users.joinDate,
      })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          eq(users.showOnPublicPage, true),
          eq(users.linuxRepairer, true),
        ),
      )
      .orderBy(asc(users.displayName));

    return {
      page: cafe.page,
      upcomingEvents: upcoming.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status,
        supportsLinux: true,
        venue: { name: r.venueName, address: r.venueAddress, postcode: r.venuePostcode },
      })),
      volunteers,
      stats: await linuxStats(),
    };
  });

  // Allow checking if URL is reachable for setup wizard
  app.get('/api/public/ping', async () => ({ ok: true, ts: Date.now() }));
}

/**
 * The site's main photo gallery.
 *
 * Curated photos an admin uploaded under Settings come first and keep their
 * order. Anything an admin has starred from an event gallery follows, newest
 * session first, so the gallery grows on its own as volunteers add photos.
 */
async function mainGallery(): Promise<
  Array<{
    id: string;
    url: string;
    caption: string | null;
    eventId: string | null;
    eventName: string | null;
    eventDate: string | null;
  }>
> {
  const curated = await db
    .select({ id: cafeGallery.id, url: cafeGallery.filePath, caption: cafeGallery.caption })
    .from(cafeGallery)
    .orderBy(asc(cafeGallery.sortOrder), asc(cafeGallery.createdAt));

  const sessionShots = await db
    .select({
      id: eventImages.id,
      url: eventImages.filePath,
      caption: eventImages.caption,
      eventId: events.id,
      eventName: events.name,
      eventDate: events.date,
      sortOrder: eventImages.sortOrder,
    })
    .from(eventImages)
    .innerJoin(events, eq(events.id, eventImages.eventId))
    .where(and(eq(eventImages.showOnHome, true), eq(eventImages.isPublished, true)))
    .orderBy(desc(events.date), asc(eventImages.sortOrder), asc(eventImages.createdAt))
    .limit(MAIN_GALLERY_LIMIT);

  const repairShots = await db
    .select({
      id: repairImages.id,
      url: repairImages.filePath,
      caption: repairImages.caption,
      categoryName: skillCategories.name,
      eventId: events.id,
      eventName: events.name,
      eventDate: events.date,
    })
    .from(repairImages)
    .innerJoin(repairJobs, eq(repairJobs.id, repairImages.repairJobId))
    .innerJoin(events, eq(events.id, repairJobs.eventId))
    .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
    .where(and(eq(repairImages.showOnHome, true), eq(repairImages.isPublished, true)))
    .orderBy(desc(events.date), asc(repairImages.createdAt))
    .limit(MAIN_GALLERY_LIMIT);

  return [
    ...curated.map((r) => ({
      id: r.id,
      url: uploadUrl(r.url),
      caption: r.caption,
      eventId: null,
      eventName: null,
      eventDate: null,
    })),
    ...sessionShots.map((r) => ({
      id: r.id,
      url: uploadUrl(r.url),
      caption: r.caption,
      eventId: r.eventId,
      eventName: r.eventName,
      eventDate: r.eventDate,
    })),
    ...repairShots.map((r) => ({
      id: r.id,
      url: uploadUrl(r.url),
      caption: r.caption ?? r.categoryName ?? null,
      eventId: r.eventId,
      eventName: r.eventName,
      eventDate: r.eventDate,
    })),
  ].slice(0, MAIN_GALLERY_LIMIT);
}

/**
 * Every photo a visitor may see for one event: the session photos volunteers
 * added, then the repair photos an admin chose to show.
 */
async function eventGallery(eventId: string): Promise<
  Array<{ id: string; url: string; caption: string | null; kind: 'session' | 'repair' }>
> {
  const sessionShots = await db
    .select({ id: eventImages.id, url: eventImages.filePath, caption: eventImages.caption })
    .from(eventImages)
    .where(and(eq(eventImages.eventId, eventId), eq(eventImages.isPublished, true)))
    .orderBy(asc(eventImages.sortOrder), asc(eventImages.createdAt));

  const repairShots = await db
    .select({
      id: repairImages.id,
      url: repairImages.filePath,
      caption: repairImages.caption,
      categoryName: skillCategories.name,
    })
    .from(repairImages)
    .innerJoin(repairJobs, eq(repairJobs.id, repairImages.repairJobId))
    .leftJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
    .where(and(eq(repairJobs.eventId, eventId), eq(repairImages.isPublished, true)))
    .orderBy(asc(repairImages.createdAt));

  return [
    ...sessionShots.map((r) => ({
      id: r.id,
      url: uploadUrl(r.url),
      caption: r.caption,
      kind: 'session' as const,
    })),
    ...repairShots.map((r) => ({
      id: r.id,
      url: uploadUrl(r.url),
      // Fall back to the item's category, never to the free-text description
      // a volunteer typed at check-in.
      caption: r.caption ?? r.categoryName ?? null,
      kind: 'repair' as const,
    })),
  ];
}

/**
 * What happened at one session: how many items came in, how many went home
 * working, which kinds of thing they were, and how many volunteers helped.
 * Returns null for a session that has no repairs recorded, so the page can
 * leave the whole block out.
 */
async function eventStats(eventId: string): Promise<{
  repairCount: number;
  completedCount: number;
  cannotRepairCount: number;
  awaitingReturnCount: number;
  successRate: number;
  co2SavedKg: number;
  volunteerCount: number;
  categories: Array<{ name: string; colour: string | null; icon: string | null; count: number; completedCount: number }>;
} | null> {
  const totals = await db.execute(sql`
    SELECT
      COUNT(*)::int AS repair_count,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'cannot_repair')::int AS cannot_repair,
      COUNT(*) FILTER (WHERE status = 'awaiting_return')::int AS awaiting_return,
      COUNT(DISTINCT repairer_id) FILTER (WHERE repairer_id IS NOT NULL)::int AS volunteer_count,
      COALESCE(SUM(co2_saving_kg) FILTER (WHERE status = 'completed'), 0)::float AS savings_kg
    FROM repair_jobs
    WHERE event_id = ${eventId}
  `);
  const t = (totals.rows[0] ?? {}) as Record<string, unknown>;
  const repairCount = Number(t.repair_count ?? 0);
  if (repairCount === 0) return null;

  const completed = Number(t.completed ?? 0);
  const cannotRepair = Number(t.cannot_repair ?? 0);
  // Out of the items we finished either way. Items still open, or paused
  // waiting for a part, would drag the figure down unfairly.
  const closed = completed + cannotRepair;

  const categoryRows = await db
    .select({
      name: skillCategories.name,
      colour: skillCategories.colour,
      icon: skillCategories.icon,
      count: sql<number>`COUNT(${repairJobs.id})::int`,
      completedCount: sql<number>`COUNT(${repairJobs.id}) FILTER (WHERE ${repairJobs.status} = 'completed')::int`,
    })
    .from(repairJobs)
    .innerJoin(skillCategories, eq(skillCategories.id, repairJobs.itemCategoryId))
    .where(eq(repairJobs.eventId, eventId))
    .groupBy(skillCategories.id, skillCategories.name, skillCategories.colour, skillCategories.icon)
    .orderBy(desc(sql`COUNT(${repairJobs.id})`), asc(skillCategories.name));

  return {
    repairCount,
    completedCount: completed,
    cannotRepairCount: cannotRepair,
    awaitingReturnCount: Number(t.awaiting_return ?? 0),
    successRate: closed > 0 ? Math.round((completed / closed) * 100) : 0,
    co2SavedKg: Math.round(Number(t.savings_kg ?? 0) * 10) / 10,
    volunteerCount: Number(t.volunteer_count ?? 0),
    categories: categoryRows.map((r) => ({
      name: r.name,
      colour: r.colour,
      icon: r.icon,
      count: Number(r.count ?? 0),
      completedCount: Number(r.completedCount ?? 0),
    })),
  };
}
