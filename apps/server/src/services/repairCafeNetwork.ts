import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

/**
 * Repair Café International location directory.
 *
 * repaircafe.org publishes every Repair Café on its world map through a small
 * open API (no key needed). We mirror it here instead of calling it from the
 * browser for three reasons:
 *
 *  1. The API sends no CORS headers, so a browser cannot read it directly.
 *  2. One upstream call every 24 hours is polite. Thousands of visitors each
 *     making their own call is not.
 *  3. We drop the contact email address before we pass the data on. The API
 *     includes it, but our map does not need it, and republishing several
 *     thousand volunteers' email addresses would only feed address scrapers.
 *
 * API documentation (version 1.1, May 2024):
 * https://www.repaircafe.org/en/api/
 */

const SOURCE_URL = 'https://www.repaircafe.org/wp-json/v1/map';

/** How long a cached copy is treated as fresh. */
const TTL_MS = 24 * 60 * 60 * 1000;

/** Give up on a slow upstream rather than holding a visitor's request open. */
const FETCH_TIMEOUT_MS = 20_000;

/** Tells repaircafe.org who is calling, so they can get in touch if we misbehave. */
const USER_AGENT =
  'CircularityRepairCafeHub/1.0 (+https://github.com/Zesty0wl/circularity-repair-cafe-hub)';

/** One cafe as repaircafe.org returns it. */
interface UpstreamCafe {
  email?: string | null;
  link?: string | null;
  address?: string | null;
  name?: string | null;
  /** "latitude,longitude" as a single string. Empty when the cafe is not geocoded. */
  coordinate?: string | null;
  external_link?: string | null;
  last_updated?: string | null;
}

/** One cafe as we publish it. No email address, and the coordinates parsed out. */
export interface NetworkCafe {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  /** Page on repaircafe.org, e.g. "repair-cafe-hattem". */
  slug: string | null;
  /** The cafe's own website, when it has one. */
  website: string | null;
}

export interface NetworkSnapshot {
  /** Cafes that have coordinates, so they can be drawn on the globe. */
  cafes: NetworkCafe[];
  /** Everything the directory lists, including cafes with no coordinates yet. */
  totalListed: number;
  /** When we last fetched from repaircafe.org. */
  fetchedAt: string;
  source: string;
}

/**
 * Bump this whenever the shape of a stored cafe changes, or whenever we start
 * cleaning the upstream data differently.
 *
 * What we keep on disk is the tidied-up result, not the raw reply, so a change
 * to the tidying would otherwise not show up until the day-old copy expired.
 * A copy saved under an older number is thrown away and fetched again.
 *
 * 2: web addresses written without "https://" are repaired rather than passed
 *    through, and HTML escapes in names are decoded.
 */
const CACHE_VERSION = 2;

const cacheFile = (): string => path.join(env.CONFIG_DIR, 'repair-cafe-network.json');

let memory: NetworkSnapshot | null = null;
/** Guards against several requests all triggering a refresh at once. */
let inFlight: Promise<NetworkSnapshot | null> | null = null;

/**
 * Turn HTML escapes back into real characters.
 *
 * Some names in the directory arrive escaped, so "Fix &amp; Mend" would show up
 * on our map with the "&amp;" spelled out. We render names as text, never as
 * markup, so decoding them here is safe.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith('#')) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
        eacute: 'é',
        egrave: 'è',
        agrave: 'à',
        ccedil: 'ç',
        uuml: 'ü',
        ouml: 'ö',
        auml: 'ä',
        szlig: 'ß',
      };
      return named[entity] ?? match;
    })
    .trim();
}

/**
 * Make a cafe's own web address safe to link to.
 *
 * Many entries in the directory are written without "https://" in front, and a
 * browser reads a bare "www.example.org" as a page on our own site, so the link
 * came out as https://our-site/www.example.org. A few have a mistyped scheme
 * ("httsp://"), and a few are not addresses at all but notes such as
 * "WhatsApp: ...". Anything we cannot make sense of is dropped rather than
 * shown as a broken link.
 */
export function normaliseWebsite(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  // Keep http and https as they are. A site that is only served over plain
  // http would break if we forced it to https.
  const hasGoodScheme = /^https?:\/\//i.test(raw);
  // Drop any other scheme and treat what follows as a bare address, which
  // turns "httsp://example.org" back into something that works.
  const bare = hasGoodScheme ? raw : raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');

  // Notes rather than addresses. A real one has no spaces and has a dot in it.
  if (/\s/.test(bare) || !bare.includes('.')) return null;

  const candidate = hasGoodScheme ? bare : `https://${bare}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // A hostname with no dot cannot be a public site.
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** "52.658025,4.745521" to a pair of numbers. Null if it is missing or unusable. */
function parseCoordinate(value: string | null | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  const [rawLat, rawLng] = value.split(',');
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // A few rows carry 0,0, which is in the Atlantic rather than anywhere real.
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Five decimal places is roughly one metre. Anything more is noise that only
  // makes the response bigger.
  return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
}

/** The last path segment of a repaircafe.org cafe link. */
export function slugFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const match = /\/cafe\/([^/?#]+)/.exec(link);
  return match ? decodeURIComponent(match[1]!) : null;
}

function toNetworkCafe(row: UpstreamCafe): NetworkCafe | null {
  const point = parseCoordinate(row.coordinate);
  if (!point) return null;
  const name = decodeEntities(row.name ?? '');
  if (!name) return null;
  const address = decodeEntities(row.address ?? '');
  const website = normaliseWebsite(row.external_link);
  return {
    name,
    lat: point.lat,
    lng: point.lng,
    address: address || null,
    slug: slugFromLink(row.link),
    website,
  };
}

async function fetchUpstream(): Promise<NetworkSnapshot> {
  const res = await fetch(SOURCE_URL, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`repaircafe.org responded ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error('repaircafe.org did not return a list');

  const cafes: NetworkCafe[] = [];
  for (const row of body as UpstreamCafe[]) {
    const cafe = toNetworkCafe(row);
    if (cafe) cafes.push(cafe);
  }
  // Alphabetical, so the list beside the globe reads sensibly and the payload
  // gzips a little better.
  cafes.sort((a, b) => a.name.localeCompare(b.name));

  return {
    cafes,
    totalListed: body.length,
    fetchedAt: new Date().toISOString(),
    source: SOURCE_URL,
  };
}

function readDisk(): NetworkSnapshot | null {
  try {
    const raw = fs.readFileSync(cacheFile(), 'utf8');
    const parsed = JSON.parse(raw) as { version?: number; snapshot?: NetworkSnapshot };
    if (parsed?.version !== CACHE_VERSION) return null;
    const snapshot = parsed.snapshot;
    if (!Array.isArray(snapshot?.cafes) || typeof snapshot.fetchedAt !== 'string') return null;
    return snapshot;
  } catch {
    return null;
  }
}

function writeDisk(snapshot: NetworkSnapshot): void {
  try {
    fs.mkdirSync(env.CONFIG_DIR, { recursive: true });
    // Write to a temporary file first so a restart mid-write cannot leave a
    // half-written file behind.
    const target = cacheFile();
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: CACHE_VERSION, snapshot }));
    fs.renameSync(temp, target);
  } catch {
    // A cache we cannot write is not worth failing the request over.
  }
}

function isFresh(snapshot: NetworkSnapshot | null): snapshot is NetworkSnapshot {
  if (!snapshot) return false;
  const age = Date.now() - new Date(snapshot.fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < TTL_MS;
}

function refresh(): Promise<NetworkSnapshot | null> {
  if (inFlight) return inFlight;
  inFlight = fetchUpstream()
    .then((snapshot) => {
      memory = snapshot;
      writeDisk(snapshot);
      return snapshot;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * The current directory.
 *
 * A fresh copy is served straight away. A stale copy is served straight away
 * too, and refreshed in the background, so a visitor never waits on
 * repaircafe.org. Only the very first call with nothing cached has to wait.
 * Returns null if we have never managed to fetch it.
 */
export async function getNetwork(): Promise<NetworkSnapshot | null> {
  if (!memory) memory = readDisk();
  if (isFresh(memory)) return memory;
  if (memory) {
    // Stale but usable: hand it over now and update it for next time.
    void refresh();
    return memory;
  }
  return refresh();
}

/**
 * Find this cafe's own entry in the directory, so the globe can mark it.
 * Matches on the repaircafe.org slug the admin saved in Settings.
 */
export function findOurs(snapshot: NetworkSnapshot, slug: string | null | undefined): NetworkCafe | null {
  if (!slug) return null;
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return null;
  return snapshot.cafes.find((c) => c.slug?.toLowerCase() === wanted) ?? null;
}
