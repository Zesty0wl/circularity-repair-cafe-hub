import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Where `vite dev` sends API calls: the hub running locally under
// `pnpm cf:dev`, which listens on port 8787. Set API_ORIGIN to use another.
const api = process.env.API_ORIGIN || 'http://localhost:8787';

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
