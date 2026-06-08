import type { HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

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
