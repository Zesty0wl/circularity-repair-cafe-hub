import type { Handle, HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Which language to show. A setting of 'en' or 'fr' forces one; 'auto' (the
 * default) follows the browser's Accept-Language, with English as the fallback.
 */
function pickLocale(acceptLanguage: string | null, setting: string): 'en' | 'fr' {
  if (setting === 'en' || setting === 'fr') return setting;
  const header = (acceptLanguage ?? '').toLowerCase();
  const first = header.split(',')[0]?.trim() ?? '';
  if (first.startsWith('fr')) return 'fr';
  if (first.startsWith('en')) return 'en';
  // The first tag is something else: use French if it comes before English.
  const fr = header.indexOf('fr');
  const en = header.indexOf('en');
  return fr !== -1 && (en === -1 || fr < en) ? 'fr' : 'en';
}

// Only the pages that actually have French translations follow the browser.
// The public pages are still English, so they stay lang="en" even when the
// browser asks for French — otherwise a screen reader would read English text
// with a French voice. It also keeps the public-page cache stable: those pages
// are always English, so the language never varies between visitors.
const TRANSLATED = /^\/(checkin|track)(\/|$)/;

// Resolve the language for every request and put it on <html lang>, which is
// what tells screen readers and search engines what the page is in. The value
// is also handed to the app (see routes/+layout.server.ts).
export const handle: Handle = async ({ event, resolve }) => {
  const requested = pickLocale(event.request.headers.get('accept-language'), (env.LANGUAGE ?? 'auto').toLowerCase());
  const locale = TRANSLATED.test(event.url.pathname) ? requested : 'en';
  event.locals.locale = locale;
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('<html lang="en"', `<html lang="${locale}"`),
  });
};

// The whole site runs under the strict Content Security Policy set in
// svelte.config.js, with no exceptions. There used to be one, for the 3D globe
// on /world: CesiumJS builds functions from strings, compiles WebAssembly, and
// starts its workers from blobs it makes in memory, none of which the policy
// allows. That page now draws a flat MapLibre map, which loads its worker from
// this site (see $lib/mapStyle), so the exception has gone.

// During server rendering, load functions call relative URLs such as
// /api/public/cafe. The API runs in the same Worker as these pages. The Worker
// entry (apps/cloudflare/src/worker.ts) hands it to us as `HUB_API`, so a call
// to /api is a function call, not a network request.
//
// Under `vite dev` there is no Worker, so those calls go to the hub running
// under `pnpm cf:dev` instead.
const DEV_API_ORIGIN = env.API_ORIGIN || 'http://127.0.0.1:8787';

type HubApi = (request: Request) => Promise<Response>;

export const handleFetch: HandleFetch = async ({ request, fetch, event }) => {
  const url = new URL(request.url);
  const sameOrigin = url.host === event.url.host;
  if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/'))) {
    const hubApi = (event.platform as { env?: { HUB_API?: HubApi } } | undefined)?.env?.HUB_API;
    if (hubApi) return hubApi(request);
    const internal = new URL(DEV_API_ORIGIN);
    url.protocol = internal.protocol;
    url.host = internal.host;
    return fetch(new Request(url, request));
  }
  return fetch(request);
};
