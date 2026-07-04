import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cafeGallery, cafes, events, skillCategories, users, venues } from '../db/schema.js';
import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/public/cafe', async () => {
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) return null;
    const gallery = await db
      .select({ id: cafeGallery.id, url: cafeGallery.filePath, caption: cafeGallery.caption })
      .from(cafeGallery)
      .orderBy(asc(cafeGallery.sortOrder), asc(cafeGallery.createdAt));
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
    };
  });

  app.get('/api/public/events', async (request) => {
    const query = request.query as { past?: string };
    const includePast = query.past === 'true';
    const today = new Date().toISOString().slice(0, 10);
    const conditions = [eq(events.isPublished, true), ne(events.status, 'cancelled')];
    if (!includePast) conditions.push(gte(events.date, today));
    const rows = await db
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
      venue: { name: r.venueName, address: r.venueAddress, postcode: r.venuePostcode },
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
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
      venue: { name: row.venueName, address: row.venueAddress, postcode: row.venuePostcode },
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

  // Allow checking if URL is reachable for setup wizard
  app.get('/api/public/ping', async () => ({ ok: true, ts: Date.now() }));
}
