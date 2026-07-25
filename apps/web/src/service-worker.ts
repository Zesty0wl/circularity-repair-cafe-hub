/// <reference types="@sveltejs/kit" />
// =============================================================================
//  Service worker
//  ---------------------------------------------------------------------------
//  Deliberately small. Its job is to make the app installable and to fail
//  gracefully when the connection drops, not to run the site offline.
//
//  What it does:
//    • Precaches the build output and the static files, so the app shell opens
//      instantly and works when the network is slow.
//    • Serves those files cache-first. They carry content hashes in their
//      names, so a cached copy is never stale.
//    • Serves pages network-first, falling back to a cached copy and then to
//      an offline page.
//
//  What it deliberately does NOT do:
//    • Touch /api at all. Those responses are per-user and change constantly,
//      and a stale one could show the wrong person's data or a repair in the
//      wrong state. They always go to the network.
//    • Cache anything for a request that is not a plain GET.
// =============================================================================
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `circularity-${version}`;
const OFFLINE_PAGE = '/offline.html';

// Pages that are specific to one person or one repair. There is nothing
// useful to show from a cached copy (a stale repair status would be worse
// than an honest "you are offline"), so we never keep one.
const PRIVATE_PAGE = /^\/(admin|repairer|checkin|track|login|reset|setup)(\/|$)/;

// Hashed build assets plus everything in static/ (which includes the offline
// page). Both lists are generated at build time by SvelteKit.
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // A new worker should take over as soon as it is ready. Waiting for
      // every tab to close means a volunteer who never closes the app would
      // stay on an old version indefinitely.
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  // Never come between the app and its API (see the note at the top).
  if (url.pathname.startsWith('/api/')) return;

  // Build assets and static files: cache-first, because their names change
  // whenever their contents do.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
    return;
  }

  // Pages: always try the network first so the content is current. Fall back
  // to whatever we have, then to the offline page.
  if (request.mode === 'navigate') {
    const cacheable = !PRIVATE_PAGE.test(url.pathname);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable && response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = cacheable ? await caches.match(request) : undefined;
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_PAGE);
          return offline ?? new Response('Offline', { status: 503, statusText: 'Offline' });
        }),
    );
  }
});
