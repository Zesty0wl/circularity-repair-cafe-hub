import type { Handle, HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// ── Content Security Policy: one exception, for the globe ──────────────────
//
// The whole site runs under a strict policy set in svelte.config.js, which
// bans running code built from strings. CesiumJS, which draws the globe on
// /world, cannot work under that rule: it bundles a library that builds a
// function from a string as soon as the file is read, it compiles
// WebAssembly, and it starts its map-drawing workers from blobs it builds in
// memory rather than from files.
//
// Rather than open that up everywhere, we relax it for the one page that needs
// it. Every other page, including sign-in, the admin area and anything showing
// personal data, keeps the strict policy. The globe page renders no third-party
// code of its own, and the cafe names it shows are set as text, never as
// markup, so there is nothing on the page for the looser rule to be used
// against.
const GLOBE_PATH = '/world';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (event.url.pathname !== GLOBE_PATH) return response;

  const policy = response.headers.get('content-security-policy');
  if (!policy) return response;

  const relaxed = policy
    .split(';')
    .map((directive) => {
      const trimmed = directive.trim();
      if (trimmed.startsWith('script-src ')) {
        return `${trimmed} 'unsafe-eval' 'wasm-unsafe-eval' blob:`;
      }
      if (trimmed.startsWith('worker-src ')) return `${trimmed} blob:`;
      return directive;
    })
    .join(';');

  response.headers.set('content-security-policy', relaxed);
  return response;
};

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
