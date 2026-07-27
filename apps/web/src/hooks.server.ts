import type { HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// The whole site runs under the strict Content Security Policy set in
// svelte.config.js, with no exceptions. There used to be one, for the 3D globe
// on /world: CesiumJS builds functions from strings, compiles WebAssembly, and
// starts its workers from blobs it makes in memory, none of which the policy
// allows. That page now draws a flat Leaflet map, which needs none of those, so
// the exception has gone.

// During SSR, load functions call relative URLs like /api/public/cafe. By
// default SvelteKit resolves those against the public origin, which would send
// the request all the way back out through the reverse proxy. Rewrite
// same-origin /api and /uploads calls to the local Fastify port so they stay
// in-process (a fast loopback request) during server rendering.
const INTERNAL_ORIGIN = env.INTERNAL_API_ORIGIN || 'http://127.0.0.1:3000';

export const handleFetch: HandleFetch = async ({ request, fetch, event }) => {
  const url = new URL(request.url);
  const sameOrigin = url.host === event.url.host;
  if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/'))) {
    const internal = new URL(INTERNAL_ORIGIN);
    url.protocol = internal.protocol;
    url.host = internal.host;
    return fetch(new Request(url, request));
  }
  return fetch(request);
};
