// =============================================================================
//  SEO — page metadata + structured-data (JSON-LD) builders, shared by SSR.
//  -----------------------------------------------------------------------------
//  Pure, dependency-free functions that turn the public cafe / event / team data
//  into both:
//    • a per-route `PageSeo` (title, description, canonical, OG, JSON-LD), and
//    • the schema.org @graph embedded in <head>.
//
//  `buildSeo()` is the single entry point. Each public route's `+page.ts`
//  returns its `seo` (built here) in the load data, and the root layout renders
//  exactly one set of <head> tags from `$page.data.seo`. Centralising it this
//  way means every route gets its own <title>, description, canonical and
//  JSON-LD with no duplicate tags (SvelteKit only de-dupes <title>, not <meta>).
//
//  The serialised JSON-LD is embedded as <script type="application/ld+json">,
//  which browsers treat as a data block (never executed) — so it is exempt from
//  the app's strict script-src CSP. Closing-sequence characters are still
//  escaped (see serializeJsonLd) so DB-sourced strings can't break out.
// =============================================================================

export interface SeoCafe {
  name: string;
  tagline?: string | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  ogImageUrl?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  socialLinks?: Record<string, string> | null;
  homePage?: { faqs?: Array<{ q?: string; a?: string }> } | null;
}

export interface SeoEventVenue {
  name: string;
  address?: string | null;
  postcode?: string | null;
}

export interface SeoEvent {
  id: string;
  name: string;
  description?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  venue: SeoEventVenue;
}

// The cafe's home venue — used to give the LocalBusiness a postal address and
// area served when the cafe profile itself has none.
export interface SeoVenue {
  name?: string | null;
  address?: string | null;
  postcode?: string | null;
}

/**
 * The looks a repairer's sharing card can be drawn in. The first one is the
 * default when a shared link does not name a style. The server draws the
 * cards (apps/server/src/services/shareCard.ts) and the web app offers the
 * choice in the profile share menu.
 */
export const SHARE_CARD_STYLES = ['classic', 'bold', 'photo'] as const;
export type ShareCardStyle = (typeof SHARE_CARD_STYLES)[number];

export interface SeoRepairer {
  id: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  joinDate?: string | null;
  repairCount?: number | null;
  skills?: Array<{ name?: string | null } | string>;
}

export type SeoRoute =
  | 'home'
  | 'events'
  | 'event'
  | 'skills'
  | 'contact'
  | 'team'
  | 'world'
  | 'guides'
  | 'about'
  | 'linux';

export interface BuildSeoOptions {
  route: SeoRoute;
  origin: string;
  pathname: string;
  cafe: SeoCafe | null;
  events?: SeoEvent[]; // home, events list
  event?: SeoEvent | null; // event detail
  venue?: SeoVenue | null; // home venue (address / opening-hours source)
  repairer?: SeoRepairer | null; // team profile
  /** Card style for the team profile share picture (?style= on the page URL). */
  shareStyle?: string | null;
  categories?: string[]; // skills page (category names)
}

export interface JsonLdGraph {
  '@context': string;
  '@graph': Node[];
}

export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  ogType: string;
  ogImage?: string;
  noindex?: boolean;
  jsonLd: JsonLdGraph | null;
}

type Node = Record<string, unknown>;

const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const DAY_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
].map((d) => `https://schema.org/${d}`);

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function siteName(cafe: SeoCafe): string {
  return (cafe.name || '').trim() || 'Repair Café';
}

function absoluteUrl(path: string | null | undefined, origin: string): string | undefined {
  const value = (path ?? '').trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return origin + (value.startsWith('/') ? value : `/${value}`);
}

function clamp(text: string | null | undefined, max: number): string {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

// "2026-06-20" + "10:00:00" -> "2026-06-20T10:00:00" (floating local time, no
// offset — matching how the app stores and exports wall-clock event times).
function isoDateTime(isoDate: string, time: string): string {
  const t = (time ?? '00:00:00').slice(0, 8);
  return `${isoDate}T${t.length === 5 ? `${t}:00` : t}`;
}

// Human-friendly date (e.g. "Saturday, 20 June 2026"). Anchored at UTC noon +
// a fixed locale so SSR and the browser render identical text.
function humanDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function socialUrls(cafe: SeoCafe): string[] {
  const links = (cafe.socialLinks ?? {}) as Record<string, unknown>;
  return Object.values(links)
    .filter((v): v is string => typeof v === 'string' && /^https?:\/\//i.test(v.trim()))
    .map((v) => v.trim());
}

// Best-effort town/locality from a free-text address. Only returns a value when
// the address has at least two comma-separated parts (street + town), so a bare
// street line is never mistaken for a locality.
function localityFrom(address?: string | null, postcode?: string | null): string | undefined {
  void postcode;
  const segs = (address ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !UK_POSTCODE_RE.test(s));
  if (segs.length >= 2) return segs[segs.length - 1];
  return undefined;
}

function postalAddress(
  source: { address?: string | null; postcode?: string | null } | null,
  fallbackAddress?: string | null,
): Node | undefined {
  const raw = (source?.address ?? fallbackAddress ?? '').trim();
  const postcode = (source?.postcode ?? '').trim();
  if (!raw && !postcode) return undefined;

  const segs = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !UK_POSTCODE_RE.test(s));

  const address: Node = { '@type': 'PostalAddress' };
  if (segs.length >= 2) {
    address.streetAddress = segs.slice(0, -1).join(', ');
    address.addressLocality = segs[segs.length - 1];
  } else if (raw) {
    address.streetAddress = raw;
  }
  if (postcode) address.postalCode = postcode;
  address.addressCountry = 'GB';
  return address;
}

// Derive distinct opening-hours specs from the upcoming event schedule (the
// cafe has no standalone opening-hours field — its hours ARE its sessions).
function openingHoursFrom(events: SeoEvent[]): Node[] {
  const seen = new Set<string>();
  const specs: Node[] = [];
  for (const e of events) {
    const day = DAY_OF_WEEK[new Date(`${e.date}T12:00:00Z`).getUTCDay()];
    const opens = (e.startTime ?? '').slice(0, 5);
    const closes = (e.endTime ?? '').slice(0, 5);
    if (!day || !opens || !closes) continue;
    const key = `${day}|${opens}|${closes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: day, opens, closes });
  }
  return specs;
}

function contactPoint(cafe: SeoCafe): Node | undefined {
  if (!cafe.contactEmail) return undefined;
  return {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: cafe.contactEmail,
    availableLanguage: 'en',
  };
}

// -----------------------------------------------------------------------------
// Graph nodes
// -----------------------------------------------------------------------------

// The cafe as a LocalBusiness (a subtype of Organization, so a single node
// serves both roles and keeps the `#organization` @id that events/website
// reference). Address falls back to the home venue when the cafe profile has
// none; opening hours are derived from the event schedule.
//
// NOTE: geo (latitude/longitude) is intentionally omitted — there is no lat/lng
// in the data model yet. Add a `geo: { '@type': 'GeoCoordinates', latitude,
// longitude }` node here once coordinates are captured on the venue/cafe.
function businessNode(cafe: SeoCafe, venue: SeoVenue | null, events: SeoEvent[], origin: string): Node {
  const node: Node = {
    '@type': 'LocalBusiness',
    '@id': `${origin}/#organization`,
    name: siteName(cafe),
    url: `${origin}/`,
    priceRange: 'Free',
  };

  const description = clamp(cafe.seoDescription || cafe.description || cafe.tagline, 300);
  if (description) node.description = description;

  const logo = absoluteUrl(cafe.logoUrl, origin);
  if (logo) node.logo = logo;
  const image = absoluteUrl(cafe.ogImageUrl || cafe.bannerUrl || cafe.logoUrl, origin);
  if (image) node.image = image;
  if (cafe.contactEmail) node.email = cafe.contactEmail;

  const address = postalAddress(venue, cafe.address);
  if (address) node.address = address;

  const locality = localityFrom(venue?.address ?? cafe.address, venue?.postcode);
  if (locality) node.areaServed = locality;

  const cp = contactPoint(cafe);
  if (cp) node.contactPoint = cp;

  const hours = openingHoursFrom(events);
  if (hours.length) node.openingHoursSpecification = hours;

  const sameAs = socialUrls(cafe);
  if (cafe.websiteUrl && /^https?:\/\//i.test(cafe.websiteUrl)) sameAs.push(cafe.websiteUrl.trim());
  if (sameAs.length) node.sameAs = Array.from(new Set(sameAs));

  return node;
}

function webSiteNode(cafe: SeoCafe, origin: string): Node {
  const description = clamp(cafe.seoDescription || cafe.description || cafe.tagline, 300);
  return {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: `${origin}/`,
    name: siteName(cafe),
    ...(description ? { description } : {}),
    publisher: { '@id': `${origin}/#organization` },
    inLanguage: 'en',
  };
}

function eventNode(event: SeoEvent, cafe: SeoCafe, origin: string): Node {
  const url = `${origin}/events/${event.id}`;
  const image = absoluteUrl(cafe.ogImageUrl || cafe.bannerUrl || cafe.logoUrl, origin);
  const venueAddress = postalAddress(event.venue);
  const node: Node = {
    '@type': 'Event',
    name: event.name,
    startDate: isoDateTime(event.date, event.startTime),
    endDate: isoDateTime(event.date, event.endTime),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    isAccessibleForFree: true,
    url,
    location: {
      '@type': 'Place',
      name: event.venue.name,
      ...(venueAddress ? { address: venueAddress } : {}),
    },
    organizer: { '@id': `${origin}/#organization` },
    // A free event still needs an Offer so search engines can render the
    // "Free" price and validity. Price 0 / GBP / in-stock from the event date.
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'GBP',
      availability: 'https://schema.org/InStock',
      url,
      validFrom: isoDateTime(event.date, '00:00:00'),
    },
  };
  const description = clamp(
    event.description || `Free community repair session hosted by ${siteName(cafe)}.`,
    500,
  );
  if (description) node.description = description;
  if (image) node.image = [image];
  return node;
}

function faqNode(cafe: SeoCafe, origin: string): Node | null {
  const faqs = (cafe.homePage?.faqs ?? []).filter((f) => f?.q && f?.a);
  if (!faqs.length) return null;
  return {
    '@type': 'FAQPage',
    '@id': `${origin}/#faq`,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function personNode(repairer: SeoRepairer, cafe: SeoCafe, origin: string): Node {
  void cafe;
  const node: Node = {
    '@type': 'Person',
    '@id': `${origin}/team/${repairer.id}#person`,
    name: repairer.displayName,
    url: `${origin}/team/${repairer.id}`,
    memberOf: { '@id': `${origin}/#organization` },
  };
  const bio = clamp(repairer.bio, 300);
  if (bio) node.description = bio;
  const avatar = absoluteUrl(repairer.avatarUrl, origin);
  if (avatar) node.image = avatar;
  const skills = (repairer.skills ?? [])
    .map((s) => (typeof s === 'string' ? s : s?.name))
    .filter((s): s is string => Boolean(s && s.trim()));
  if (skills.length) node.knowsAbout = Array.from(new Set(skills));
  return node;
}

function breadcrumbNode(origin: string, trail: Array<{ name: string; path: string }>): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${origin}${crumb.path}`,
    })),
  };
}

// -----------------------------------------------------------------------------
// Title / description defaults
// -----------------------------------------------------------------------------

function locationDescriptor(cafe: SeoCafe, venue: SeoVenue | null): string {
  const locality = localityFrom(venue?.address ?? cafe.address, venue?.postcode ?? null);
  return locality ? `Repair Café in ${locality}` : 'Community Repair Café';
}

function defaultTitle(cafe: SeoCafe, venue: SeoVenue | null): string {
  return cafe.seoTitle?.trim() || `${siteName(cafe)} | ${locationDescriptor(cafe, venue)}`;
}

function defaultDescription(cafe: SeoCafe): string {
  return clamp(
    cafe.seoDescription ||
      cafe.description ||
      cafe.tagline ||
      `Free community repair events at ${siteName(cafe)}. Bring an item and our volunteers will help you fix it.`,
    300,
  );
}

// -----------------------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------------------

export function buildSeo(opts: BuildSeoOptions): PageSeo {
  const { route, origin, pathname, cafe } = opts;
  const canonical = `${origin}${pathname || '/'}`;

  if (!cafe) {
    return { title: 'Repair Café', description: '', canonical, ogType: 'website', jsonLd: null };
  }

  const name = siteName(cafe);
  const venue = opts.venue ?? null;
  const defaultImage = absoluteUrl(cafe.ogImageUrl || cafe.bannerUrl || cafe.logoUrl, origin);
  const hoursEvents = opts.events ?? (opts.event ? [opts.event] : []);
  const graph: Node[] = [businessNode(cafe, venue, hoursEvents, origin), webSiteNode(cafe, origin)];

  let title = defaultTitle(cafe, venue);
  let description = defaultDescription(cafe);
  let ogType = 'website';
  let noindex = false;

  // ── The picture shown when a link is shared ─────────────────────────────
  // Each section gets its own card, drawn by the server in the cafe's colours
  // (see apps/server/src/services/ogImage.ts). Otherwise every link pasted into
  // a chat looks identical, whether it is an event, a repair guide or the
  // contact page. Pages with a real photograph of their own, such as a
  // volunteer's portrait or a repair guide's opening shot, override this below.
  const sectionCard = (key: string): string => `${origin}/og/section/${key}.png`;
  const CARD_FOR: Partial<Record<SeoRoute, string>> = {
    home: 'home',
    events: 'events',
    skills: 'skills',
    contact: 'contact',
    world: 'world',
    guides: 'guides',
    linux: 'linux',
  };
  const card = CARD_FOR[route];
  // The home page is the one place a cafe's own banner photograph beats a
  // drawn card: it is the picture they chose to represent themselves.
  let ogImage =
    route === 'home' ? (defaultImage ?? sectionCard('home')) : card ? sectionCard(card) : defaultImage;

  switch (route) {
    case 'home': {
      for (const event of (opts.events ?? []).slice(0, 12)) graph.push(eventNode(event, cafe, origin));
      const faq = faqNode(cafe, origin);
      if (faq) graph.push(faq);
      break;
    }
    case 'events': {
      const events = opts.events ?? [];
      const next = events[0];
      title = `Upcoming Repair Events | ${name}`;
      description = clamp(
        next
          ? `See upcoming repair events at ${name}. Next session: ${humanDate(next.date)} at ${next.venue.name}. Bring an item and we'll help you fix it for free.`
          : `Upcoming repair events at ${name}. Bring an item and our volunteers will help you fix it for free.`,
        300,
      );
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'Events', path: '/events' },
        ]),
      );
      for (const event of events.slice(0, 25)) graph.push(eventNode(event, cafe, origin));
      break;
    }
    case 'event': {
      const event = opts.event ?? null;
      if (!event) {
        title = `Event | ${name}`;
        noindex = true;
        break;
      }
      // A shared session shows its own date and venue on the card.
      ogImage = `${origin}/og/event/${event.id}.png`;
      title = `${event.name} · ${humanDate(event.date)} | ${name}`;
      description = clamp(
        event.description ||
          `Join ${name} on ${humanDate(event.date)} at ${event.venue.name} for a free community repair session. Bring an item and we'll help you fix it.`,
        300,
      );
      ogType = 'article';
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'Events', path: '/events' },
          { name: event.name, path: `/events/${event.id}` },
        ]),
      );
      graph.push(eventNode(event, cafe, origin));
      break;
    }
    case 'skills': {
      const categories = opts.categories ?? [];
      title = `What We Repair | ${name}`;
      description = clamp(
        categories.length
          ? `Discover what our volunteers can help fix at ${name}: ${categories.slice(0, 10).join(', ')}. Free community repairs.`
          : `Discover what our volunteers can help fix at ${name}. Free community repairs, every session.`,
        300,
      );
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'What We Repair', path: '/skills' },
        ]),
      );
      break;
    }
    case 'world': {
      title = `The Worldwide Repair Café Movement | ${name}`;
      description = clamp(
        `${name} is one of thousands of Repair Cafés around the world. Explore the global map, see where the movement started, and find a Repair Café near you.`,
        300,
      );
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'Worldwide', path: '/world' },
        ]),
      );
      break;
    }
    case 'linux': {
      title = `Linux Repair Cafe | ${name}`;
      description = clamp(
        `Is your computer too old for Windows 11? ${name} can install Linux on it for free, so it keeps working and stays out of the bin. Come to a Linux Repair Cafe session.`,
        300,
      );
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'Linux Repair Cafe', path: '/linux' },
        ]),
      );
      break;
    }
    case 'about': {
      title = `About & how we measure | ${name}`;
      description = clamp(
        `How ${name} works, and how we work out the figures we publish, including the carbon saved by each repair.`,
        300,
      );
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'About', path: '/about' },
        ]),
      );
      break;
    }
    case 'guides': {
      title = `Repair Guides | ${name}`;
      description = clamp(
        `Free step-by-step repair guides for phones, laptops, appliances and more, from iFixit. Search thousands of guides and fix it yourself, or bring it to ${name}.`,
        300,
      );
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'Repair Guides', path: '/guides' },
        ]),
      );
      break;
    }
    case 'contact': {
      title = `Contact & Find Us | ${name}`;
      description = clamp(
        venue?.name
          ? `Get in touch with ${name} and find us at ${venue.name}${venue.postcode ? `, ${venue.postcode}` : ''}. Directions, opening times and how to volunteer.`
          : `Get in touch with ${name}. Find out where we meet, how to volunteer and how to support your local Repair Café.`,
        300,
      );
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'Contact', path: '/contact' },
        ]),
      );
      break;
    }
    case 'team': {
      const repairer = opts.repairer ?? null;
      if (!repairer) {
        title = `Volunteer Repairer | ${name}`;
        description = `Meet the volunteers behind ${name}.`;
        noindex = true;
        break;
      }
      title = `${repairer.displayName} · Volunteer Repairer | ${name}`;
      description = clamp(
        repairer.bio ||
          `${repairer.displayName} volunteers at ${name}, helping the community repair and reuse the things they own.`,
        300,
      );
      ogType = 'profile';
      // A profile link shares the drawn card: portrait, what they fix, and
      // the next session, on one picture. The style rides on the page URL so
      // the card a volunteer chose is the card their friends see.
      const style = SHARE_CARD_STYLES.find((s) => s === opts.shareStyle);
      ogImage = `${origin}/og/repairer/${repairer.id}.png${
        style && style !== 'classic' ? `?style=${style}` : ''
      }`;
      graph.push(
        breadcrumbNode(origin, [
          { name: 'Home', path: '/' },
          { name: 'Our Team', path: '/skills' },
          { name: repairer.displayName, path: `/team/${repairer.id}` },
        ]),
      );
      graph.push(personNode(repairer, cafe, origin));
      break;
    }
  }

  return {
    title,
    description,
    canonical,
    ogType,
    ...(ogImage ? { ogImage } : {}),
    ...(noindex ? { noindex: true } : {}),
    jsonLd: { '@context': 'https://schema.org', '@graph': graph },
  };
}

// Serialise a JSON-LD graph into a full <script> tag for use with Svelte's
// {@html ...} inside <svelte:head>. Closing-sequence characters are escaped so
// the value can never terminate the script element early.
export function serializeJsonLd(graph: unknown | null): string {
  if (!graph) return '';
  const json = JSON.stringify(graph)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}<\/script>`;
}
