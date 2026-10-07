// =============================================================================
//  The API
//  ---------------------------------------------------------------------------
//  Every route of the API, registered in the same groups and order as the old
//  old Docker edition's server, plus the Cloudflare-only
//  routes for files and for importing a backup.
// =============================================================================
import { ensureDatabase } from './db/migrate.js';
import { createRouter } from './lib/router.js';
import { demoModeHook } from './plugins/demoMode.js';
import { healthRoutes } from './routes/health.js';
import { setupRoutes } from './routes/setup.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { pwaRoutes } from './routes/pwa.js';
import { ogRoutes } from './routes/og.js';
import { checkInRoutes } from './routes/checkin.js';
import { repairerRoutes } from './routes/repairer.js';
import { eventGalleryRoutes } from './routes/eventGallery.js';
import { adminRoutes } from './routes/admin/index.js';
import { displayRoutes } from './routes/display.js';
import { demoRoutes } from './routes/demo.js';
import { importRoutes, setupImportRoutes } from './routes/admin/backup.js';
import { fileRoutes } from './routes/files.js';

const router = createRouter();

const registered = (async () => {
  const app = router.app;
  // Everything that changes on a public demo site. Does nothing at all when
  // DEMO_MODE is off, which is the default. See plugins/demoMode.ts.
  app.addHook('preHandler', demoModeHook);

  await app.register(healthRoutes);
  await app.register(setupRoutes);
  await app.register(setupImportRoutes);
  await app.register(authRoutes);
  await app.register(publicRoutes);
  await app.register(pwaRoutes);
  await app.register(ogRoutes);
  await app.register(checkInRoutes);
  await app.register(repairerRoutes);
  await app.register(eventGalleryRoutes);
  await app.register(displayRoutes);
  await app.register(demoRoutes);
  await app.register(adminRoutes);
  await app.register(importRoutes);
  await app.register(fileRoutes);
})();

/** Paths the API answers. Everything else is a page for SvelteKit. */
export function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/') ||
    pathname.startsWith('/og/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  );
}

/**
 * Answer an API request. Unknown /api paths get a JSON 404, rather than
 * falling through to the web app.
 */
export async function handleApi(request: Request): Promise<Response> {
  await registered;
  await ensureDatabase();
  const response = await router.handle(request);
  return response ?? Response.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
}
