/**
 * Repair guides from iFixit.
 *
 * iFixit publishes an open API with no key needed. We call it from our server
 * rather than from the browser for the same reasons as the Repair Café
 * directory: visitors' searches stay between them and us, popular searches are
 * answered from memory instead of going out again, and we can trim the reply
 * down to what the page actually draws.
 *
 * Guide text and photographs belong to iFixit and its contributors, and are
 * published under Creative Commons BY-NC-SA. Every guide we show links back to
 * the original.
 *
 * API reference: https://www.ifixit.com/api-docs
 */

const API_ROOT = 'https://www.ifixit.com/api/2.0';

/** Searches change slowly, so an answer is good for a few hours. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** Stop the cache growing without limit. Oldest entries go first. */
const MAX_CACHED = 300;

const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT =
  'CircularityRepairCafeHub/1.0 (+https://github.com/Zesty0wl/circularity-repair-cafe-hub)';

/** A guide as our pages use it. */
export interface GuideSummary {
  id: number;
  title: string;
  /** What the guide is about, e.g. "iPhone 13". */
  category: string | null;
  /** The part being worked on, e.g. "Battery". */
  subject: string | null;
  /** "Easy", "Moderate", "Difficult" and so on. */
  difficulty: string | null;
  summary: string | null;
  /** How long iFixit thinks it takes. */
  timeRequired: string | null;
  /** Picture for a card, and a larger one for a page heading. */
  thumbnail: string | null;
  image: string | null;
  /** The guide on ifixit.com. */
  url: string;
}

export interface GuideStep {
  title: string | null;
  /** One instruction per line, with the colour iFixit gives it. */
  lines: Array<{ text: string; bullet: string }>;
  images: string[];
}

export interface GuideDetail extends GuideSummary {
  introduction: string | null;
  conclusion: string | null;
  tools: string[];
  parts: string[];
  steps: GuideStep[];
}

export interface GuideSearchResult {
  guides: GuideSummary[];
  /** True when there are more to fetch after this page. */
  moreResults: boolean;
  query: string;
}

interface CacheEntry {
  at: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();

function readCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Touch it, so the entries in use are the ones that stay.
  cache.delete(key);
  cache.set(key, hit);
  return hit.value as T;
}

function writeCache(key: string, value: unknown): void {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function callApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`iFixit responded ${res.status}`);
  return (await res.json()) as T;
}

/** Strip iFixit's HTML back to plain text. Our pages render text, not markup. */
function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/** Pick one of iFixit's image sizes, falling back through what is offered. */
function pickImage(image: unknown, sizes: string[]): string | null {
  if (!image || typeof image !== 'object') return null;
  const bag = image as Record<string, unknown>;
  for (const size of sizes) {
    const url = bag[size];
    if (typeof url === 'string' && url.startsWith('https://')) return url;
  }
  return null;
}

function toSummary(raw: Record<string, unknown>): GuideSummary | null {
  const id = Number(raw.guideid);
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!Number.isFinite(id) || !title) return null;

  const url =
    typeof raw.url === 'string' && raw.url.startsWith('https://')
      ? raw.url
      : `https://www.ifixit.com/Guide/View/${id}`;

  return {
    id,
    title,
    category: typeof raw.category === 'string' ? raw.category : null,
    subject: typeof raw.subject === 'string' ? raw.subject : null,
    difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : null,
    summary: toText(raw.summary),
    timeRequired:
      typeof raw.time_required === 'string' && raw.time_required !== 'No estimate'
        ? raw.time_required
        : null,
    thumbnail: pickImage(raw.image, ['200x150', 'thumbnail', 'standard', 'medium']),
    image: pickImage(raw.image, ['440x330', 'standard', 'medium', 'large']),
    url,
  };
}

/**
 * Guides matching what someone typed.
 *
 * iFixit's search covers questions and wiki pages too, so it is filtered down
 * to guides, which are the step-by-step instructions people actually want.
 */
export async function searchGuides(
  query: string,
  offset: number,
  limit: number,
): Promise<GuideSearchResult> {
  const q = query.trim();
  if (!q) return { guides: [], moreResults: false, query: q };

  const key = `search:${q.toLowerCase()}:${offset}:${limit}`;
  const cached = readCache<GuideSearchResult>(key);
  if (cached) return cached;

  const body = await callApi<{
    results?: Array<Record<string, unknown>>;
    moreResults?: boolean;
  }>(
    `/search/${encodeURIComponent(q)}?filter=guide&offset=${offset}&limit=${limit}`,
  );

  const guides: GuideSummary[] = [];
  for (const row of body.results ?? []) {
    const guide = toSummary(row);
    if (guide) guides.push(guide);
  }

  const result: GuideSearchResult = {
    guides,
    moreResults: Boolean(body.moreResults),
    query: q,
  };
  writeCache(key, result);
  return result;
}

/** One guide, with its steps. */
export async function getGuide(id: number): Promise<GuideDetail | null> {
  const key = `guide:${id}`;
  const cached = readCache<GuideDetail>(key);
  if (cached) return cached;

  let raw: Record<string, unknown>;
  try {
    raw = await callApi<Record<string, unknown>>(`/guides/${id}`);
  } catch {
    return null;
  }

  const summary = toSummary(raw);
  if (!summary) return null;

  const steps: GuideStep[] = [];
  for (const step of (raw.steps as Array<Record<string, unknown>>) ?? []) {
    const lines: GuideStep['lines'] = [];
    for (const line of (step.lines as Array<Record<string, unknown>>) ?? []) {
      const text = toText(line.text_rendered ?? line.text_raw);
      if (text) lines.push({ text, bullet: String(line.bullet ?? 'black') });
    }

    const images: string[] = [];
    const media = step.media as Record<string, unknown> | undefined;
    if (media?.type === 'image' && Array.isArray(media.data)) {
      for (const item of media.data) {
        const url = pickImage(item, ['standard', 'medium', '440x330', 'large']);
        if (url) images.push(url);
      }
    }

    if (lines.length > 0 || images.length > 0) {
      steps.push({ title: toText(step.title), lines, images });
    }
  }

  const names = (list: unknown): string[] => {
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const item of list) {
      const text = toText((item as Record<string, unknown>)?.text);
      if (text) out.push(text);
    }
    return out;
  };

  const detail: GuideDetail = {
    ...summary,
    introduction: toText(raw.introduction_rendered ?? raw.introduction_raw),
    conclusion: toText(raw.conclusion_rendered ?? raw.conclusion_raw),
    tools: names(raw.tools),
    parts: names(raw.parts),
    steps,
  };
  writeCache(key, detail);
  return detail;
}
