import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// The tests run inside workerd, the real Workers runtime, with a local D1
// database and R2 bucket that start empty for every test file.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './test/entry.ts',
      wrangler: { configPath: './wrangler.test.jsonc' },
    }),
  ],
  test: {
    testTimeout: 30_000,
    // The files share one local database, so they run one at a time and each
    // starts by clearing it (freshHub in test/helpers.ts).
    fileParallelism: false,
  },
});
