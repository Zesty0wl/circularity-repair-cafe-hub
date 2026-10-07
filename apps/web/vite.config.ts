import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Where `vite dev` sends API calls. The Docker edition's server listens on
// port 3000. To work against the Cloudflare edition instead, run `pnpm cf:dev`
// and start this with API_ORIGIN=http://localhost:8787 (and the same value in
// INTERNAL_API_ORIGIN, for pages drawn on the server).
const api = process.env.API_ORIGIN || 'http://localhost:3000';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
      '/og': api,
      '/icons': api,
      '/manifest.webmanifest': api,
    },
  },
});
