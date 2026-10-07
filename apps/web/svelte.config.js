import nodeAdapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// The same app is built for two homes. The Docker image uses adapter-node, and
// the Cloudflare edition (apps/cloudflare) uses adapter-cloudflare. Set
// HUB_TARGET=cloudflare to build for Cloudflare. Anything else builds for Node.
const target = process.env.HUB_TARGET === 'cloudflare' ? 'cloudflare' : 'node';
// Loaded only when needed, so a Docker build never loads Wrangler.
const cloudflareAdapter =
  target === 'cloudflare' ? (await import('@sveltejs/adapter-cloudflare')).default : null;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // adapter-node builds a self-contained Node server (build/handler.js +
    // build/client). The Fastify server imports handler.js at runtime and
    // delegates all non-/api requests to it, so the public pages are now
    // genuinely server-rendered (real HTML + JSON-LD) instead of an empty SPA
    // shell. See apps/server/src/index.ts (serveSveltePage / notFoundHandler).
    //
    // adapter-cloudflare writes the Worker and the static files to
    // .svelte-kit/cloudflare. apps/cloudflare/src/worker.ts wraps that Worker
    // with the API, the security headers and the scheduled jobs.
    adapter:
      cloudflareAdapter
        ? cloudflareAdapter({ config: 'wrangler.adapter.jsonc' })
        : nodeAdapter({
            out: 'build',
            precompress: false,
          }),
    prerender: { entries: [] },
    alias: {
      $lib: 'src/lib',
    },
    // With adapter-node, SvelteKit sends the policy as a Content-Security-Policy
    // response header on every rendered page. Hash mode auto-includes the
    // SHA-256 of the inline bootstrap script (which changes each build), so we
    // don't need 'unsafe-inline'. The Fastify server disables helmet's CSP so
    // this is the single source of truth.
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        // Plausible and similar self-hostable analytics ship as a single small
        // JS file from a third-party host. Allowing https: for script-src is
        // a deliberate trade-off so admins can plug in their analytics URL via
        // the Settings page without redeploying. Inline scripts are still
        // restricted to SvelteKit's hashed bootstrap (no 'unsafe-inline').
        'script-src': ['self', 'https:'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:', 'https:'],
        // api.iconify.design for icon JSON; https: for plausible's POSTs.
        'connect-src': ['self', 'https://api.iconify.design', 'https:'],
        'font-src': ['self', 'data:'],
        // The progressive web app: its own service worker, and its own
        // manifest. Both are same-origin only. Without these they would fall
        // back to script-src, which allows https: for analytics.
        'worker-src': ['self'],
        'manifest-src': ['self'],
        'frame-ancestors': ['none'],
        // Allow embedded maps from common providers. We deliberately allowlist
        // hosts rather than `https:` so a venue mapUrl can only iframe a map,
        // not arbitrary third-party content.
        'frame-src': [
          'self',
          'https://www.google.com',
          'https://maps.google.com',
          'https://www.openstreetmap.org',
          'https://www.bing.com',
        ],
        'base-uri': ['self'],
        'form-action': ['self'],
        'object-src': ['none'],
      },
    },
  },
};

export default config;
