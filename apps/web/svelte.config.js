import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),
    prerender: { entries: [] },
    alias: {
      $lib: 'src/lib',
    },
    // CSP is emitted by SvelteKit as a <meta http-equiv="content-security-policy">
    // tag in index.html. Hash mode auto-includes the SHA-256 of the inline
    // bootstrap script (which changes each build), so we don't need 'unsafe-inline'.
    // The Fastify server disables helmet's CSP header so this meta tag is the
    // single source of truth.
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
        'frame-ancestors': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'object-src': ['none'],
      },
    },
  },
};

export default config;
