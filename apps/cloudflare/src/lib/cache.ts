// =============================================================================
//  Remembering answers from other sites
//  ---------------------------------------------------------------------------
//  The old Docker edition keeps answers from iFixit in memory, and its one process
//  runs for weeks. A Worker instance may only last minutes, so memory alone
//  would mean asking iFixit again and again. This keeps them in Cloudflare's
//  cache as well, which lasts as long as we ask and is shared by every Worker
//  instance in the same data centre.
//
//  The cache only works on a real domain, not on workers.dev or in tests. That
//  is fine: it is a speed-up, never the only copy of anything.
// =============================================================================

const memory = new Map<string, { at: number; ttl: number; value: unknown }>();
const MAX_IN_MEMORY = 300;

function cacheUrl(key: string): string {
  return `https://cache.repair-cafe-hub.internal/${encodeURIComponent(key)}`;
}

function edgeCache(): Cache | null {
  try {
    return (caches as unknown as { default?: Cache }).default ?? null;
  } catch {
    return null;
  }
}

export async function readCached<T>(key: string): Promise<T | null> {
  const hit = memory.get(key);
  if (hit) {
    if (Date.now() - hit.at <= hit.ttl) {
      // Touch it, so the entries in use are the ones that stay.
      memory.delete(key);
      memory.set(key, hit);
      return hit.value as T;
    }
    memory.delete(key);
  }
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const res = await cache.match(cacheUrl(key));
    if (!res) return null;
    const value = (await res.json()) as T;
    const ttl = Number(res.headers.get('x-ttl-ms')) || 60_000;
    remember(key, value, ttl);
    return value;
  } catch {
    return null;
  }
}

function remember(key: string, value: unknown, ttl: number): void {
  memory.set(key, { at: Date.now(), ttl, value });
  while (memory.size > MAX_IN_MEMORY) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

export async function writeCached(key: string, value: unknown, ttlMs: number): Promise<void> {
  remember(key, value, ttlMs);
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.put(
      cacheUrl(key),
      new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${Math.max(1, Math.floor(ttlMs / 1000))}`,
          'x-ttl-ms': String(ttlMs),
        },
      }),
    );
  } catch {
    // A cache that will not take it is no reason to fail the request.
  }
}
