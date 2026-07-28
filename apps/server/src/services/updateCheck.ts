// =============================================================================
//  Is there a newer version?
//  ---------------------------------------------------------------------------
//  Cafes run this themselves, often on a Pi in a cupboard, and nobody is going
//  to watch a repository for releases. Without something that says so, an
//  install quietly stays on whatever version it was set up with, including
//  through security fixes.
//
//  What this does and does not do:
//
//    - It asks GitHub for the list of published tags, once a day, and keeps the
//      answer in /data/config so a restart does not mean asking again.
//    - It sends nothing about the cafe. No version, no install id, no counts.
//      It is an ordinary GET of a public page, so GitHub learns the same thing
//      it learns from anyone visiting the repository: an IP address.
//    - It never installs anything. It puts a line in the admin area saying a
//      newer version exists, with the commands to run.
//    - It fails silently. A cafe with no outbound access, or GitHub being down,
//      must never produce an error a volunteer has to think about.
//
//  Set UPDATE_CHECK_DISABLED=true to switch it off completely, in which case no
//  request is ever made.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';
import { APP_VERSION } from '../version.js';

const TAGS_URL = 'https://api.github.com/repos/Zesty0wl/circularity-repair-cafe-hub/tags';
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const USER_AGENT = `circularity-repair-cafe-hub/${APP_VERSION}`;

export interface UpdateStatus {
  /** The version this hub is running. */
  current: string;
  /** The newest released version, or null if we have never managed to look. */
  latest: string | null;
  /** True only when we are confident latest is genuinely newer. */
  updateAvailable: boolean;
  /** When we last got an answer, ISO 8601, or null. */
  checkedAt: string | null;
  /** False when switched off, so the admin page can say so rather than lie. */
  enabled: boolean;
}

interface Cached {
  latest: string | null;
  checkedAt: number;
}

const cacheFile = (): string => path.join(env.CONFIG_DIR, 'update-check.json');

let memory: Cached | null = null;

function readCache(): Cached | null {
  if (memory) return memory;
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) as Cached;
    if (typeof raw?.checkedAt === 'number') {
      memory = raw;
      return raw;
    }
  } catch {
    // No cache yet, or it is unreadable. Either way we simply look again.
  }
  return null;
}

function writeCache(value: Cached): void {
  memory = value;
  try {
    fs.mkdirSync(env.CONFIG_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify(value), 'utf8');
  } catch {
    // Keeping it in memory is enough. Never fail over a cache write.
  }
}

/**
 * Compare two dotted versions. Returns true when `candidate` is newer than
 * `current`. Anything that is not three plain numbers is treated as not newer,
 * so a tag like "v2.0.0-rc1" never nags somebody running a stable release.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** The newest stable version from a list of tag names. */
export function newestStable(names: string[]): string | null {
  let best: string | null = null;
  for (const name of names) {
    if (!/^v?\d+\.\d+\.\d+$/.test(name.trim())) continue;
    const clean = name.trim().replace(/^v/, '');
    if (!best || isNewer(clean, best)) best = clean;
  }
  return best;
}

async function fetchLatest(): Promise<string | null> {
  try {
    const res = await fetch(TAGS_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const tags = (await res.json()) as Array<{ name?: string }>;
    if (!Array.isArray(tags)) return null;
    return newestStable(tags.map((t) => t?.name ?? ''));
  } catch {
    // Offline, blocked, rate limited, or GitHub having a bad day. None of
    // those are the cafe's problem, so none of them say anything.
    return null;
  }
}

/**
 * What to show the admin. Reads the cache, and refreshes it in the background
 * when it is older than a day. Always returns immediately: a slow or missing
 * network must never hold up the admin page.
 */
export async function updateStatus(): Promise<UpdateStatus> {
  const base: UpdateStatus = {
    current: APP_VERSION,
    latest: null,
    updateAvailable: false,
    checkedAt: null,
    enabled: !env.UPDATE_CHECK_DISABLED && !env.DEMO_MODE,
  };
  if (!base.enabled) return base;

  const cached = readCache();
  const stale = !cached || Date.now() - cached.checkedAt > CHECK_EVERY_MS;

  if (stale) {
    const latest = await fetchLatest();
    // Record the attempt even when it failed, so a cafe with no outbound
    // access asks once a day rather than on every page load.
    writeCache({ latest: latest ?? cached?.latest ?? null, checkedAt: Date.now() });
  }

  const now = readCache();
  return {
    ...base,
    latest: now?.latest ?? null,
    updateAvailable: Boolean(now?.latest && isNewer(now.latest, APP_VERSION)),
    checkedAt: now?.checkedAt ? new Date(now.checkedAt).toISOString() : null,
  };
}
