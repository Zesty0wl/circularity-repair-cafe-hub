// =============================================================================
//  SEO data, robots.txt and sitemap.xml
//  -----------------------------------------------------------------------------
//  The web app is server-rendered by SvelteKit (adapter-node), so page <head>
//  metadata and JSON-LD structured data are produced by the pages themselves.
//  This module only provides what the Fastify server still owns:
//
//    1. getSeoData()    — cached read of the public cafe / events / team used by
//                         the sitemap (and available for future server needs).
//    2. resolveOrigin() — the canonical site origin (configured public URL, or
//                         the forwarded request headers behind a proxy).
//    3. renderRobots()  — robots.txt.
//    4. renderSitemap() — sitemap.xml.
// =============================================================================
import type { FastifyRequest } from 'fastify';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cafes, events, skillCategories, users, venues } from '../db/schema.js';

type CafeRow = typeof cafes.$inferSelect;
type VenueRow = typeof venues.$inferSelect;

interface SeoEvent {
  id: string;
  name: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  updatedAt: Date | null;
  venue: { name: string; address: string | null; postcode: string | null };
}

interface TeamMember {
  id: string;
  displayName: string;
  updatedAt: Date | null;
}

export interface SeoData {
  cafe: CafeRow | null;
  events: SeoEvent[];
  homeVenue: VenueRow | null;
  categories: string[];
  team: TeamMember[];
}

// -----------------------------------------------------------------------------
// Escaping
// -----------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// -----------------------------------------------------------------------------
// Origin
// -----------------------------------------------------------------------------

// Prefer the admin-configured public URL (set at setup, stable, correct for
// canonical/sitemap even behind proxies/CDNs). Fall back to the forwarded
// request headers so a freshly-installed instance still works.
export function resolveOrigin(request: FastifyRequest, cafe: CafeRow | null): string {
  const configured = (cafe?.publicUrl ?? '').trim();
  if (configured) {
    try {
      const url = new URL(configured);
      return `${url.protocol}//${url.host}`;
    } catch {
      /* fall through to header-derived origin */
    }
  }
  const fwdProto = request.headers['x-forwarded-proto'];
  const fwdHost = request.headers['x-forwarded-host'];
  const proto =
    (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto) || (request as { protocol?: string }).protocol || 'https';
  const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) || request.headers.host || '';
  return `${proto}://${host}`;
}

// -----------------------------------------------------------------------------
// Data loading (cached briefly so crawl bursts don't hammer Postgres)
// -----------------------------------------------------------------------------

let cache: SeoData | null = null;
let cacheExpires = 0;
const CACHE_TTL_MS = 60_000;

export async function getSeoData(): Promise<SeoData> {
  const now = Date.now();
  if (cache && now < cacheExpires) return cache;

  const [cafe] = await db.select().from(cafes).limit(1);

  // All published, non-cancelled events (past + future) so every event has a
  // crawlable /events/:id URL in the sitemap — past sessions keep ranking.
  const eventRows = await db
    .select({
      id: events.id,
      name: events.name,
      description: events.description,
      date: events.date,
      startTime: events.startTime,
      endTime: events.endTime,
      updatedAt: events.updatedAt,
      venueName: venues.name,
      venueAddress: venues.address,
      venuePostcode: venues.postcode,
    })
    .from(events)
    .innerJoin(venues, eq(venues.id, events.venueId))
    .where(and(eq(events.isPublished, true), ne(events.status, 'cancelled')))
    .orderBy(asc(events.date), asc(events.startTime));

  const [homeVenue] = await db.select().from(venues).where(eq(venues.isHomeVenue, true)).limit(1);

  const categoryRows = await db
    .select({ name: skillCategories.name })
    .from(skillCategories)
    .where(eq(skillCategories.isActive, true))
    .orderBy(asc(skillCategories.sortOrder), asc(skillCategories.name));

  const teamRows = await db
    .select({ id: users.id, displayName: users.displayName, updatedAt: users.updatedAt })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.showOnPublicPage, true)))
    .orderBy(asc(users.displayName));

  cache = {
    cafe: cafe ?? null,
    events: eventRows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      updatedAt: r.updatedAt,
      venue: { name: r.venueName, address: r.venueAddress, postcode: r.venuePostcode },
    })),
    homeVenue: homeVenue ?? null,
    categories: categoryRows.map((c) => c.name),
    team: teamRows,
  };
  cacheExpires = now + CACHE_TTL_MS;
  return cache;
}

// -----------------------------------------------------------------------------
// robots.txt + sitemap.xml
// -----------------------------------------------------------------------------

export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /checkin',
    'Disallow: /track',
    'Disallow: /repairer',
    'Disallow: /login',
    'Disallow: /reset',
    'Disallow: /setup',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function renderSitemap(data: SeoData, origin: string): string {
  const lastEvent = data.events.reduce<string | null>((acc, e) => (acc && acc > e.date ? acc : e.date), null);
  const now = new Date().toISOString().slice(0, 10);

  const urls: Array<{ loc: string; lastmod?: string; changefreq: string; priority: string }> = [
    { loc: `${origin}/`, lastmod: now, changefreq: 'weekly', priority: '1.0' },
    { loc: `${origin}/events`, lastmod: lastEvent ?? now, changefreq: 'daily', priority: '0.9' },
    { loc: `${origin}/skills`, changefreq: 'monthly', priority: '0.7' },
    { loc: `${origin}/guides`, changefreq: 'weekly', priority: '0.6' },
    { loc: `${origin}/about`, changefreq: 'monthly', priority: '0.5' },
    { loc: `${origin}/world`, changefreq: 'monthly', priority: '0.5' },
    { loc: `${origin}/contact`, changefreq: 'yearly', priority: '0.4' },
  ];

  // One crawlable URL per published event.
  for (const event of data.events) {
    urls.push({
      loc: `${origin}/events/${event.id}`,
      lastmod: event.updatedAt ? new Date(event.updatedAt).toISOString().slice(0, 10) : event.date,
      changefreq: 'weekly',
      priority: '0.6',
    });
  }

  for (const member of data.team) {
    urls.push({
      loc: `${origin}/team/${member.id}`,
      lastmod: member.updatedAt ? new Date(member.updatedAt).toISOString().slice(0, 10) : undefined,
      changefreq: 'monthly',
      priority: '0.5',
    });
  }

  const body = urls
    .map((u) => {
      const lines = [`    <loc>${escapeHtml(u.loc)}</loc>`];
      if (u.lastmod) lines.push(`    <lastmod>${u.lastmod}</lastmod>`);
      lines.push(`    <changefreq>${u.changefreq}</changefreq>`);
      lines.push(`    <priority>${u.priority}</priority>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
