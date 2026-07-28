import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from './env.js';
import { runMigrations } from './db/migrate.js';
import { getSeoData, renderRobots, renderSitemap, resolveOrigin } from './services/seo.js';
import authPlugin from './plugins/auth.js';
import securityPlugin from './plugins/security.js';
import demoModePlugin from './plugins/demoMode.js';
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
import { startTelemetrySchedule } from './services/telemetry.js';

// Shape of the SvelteKit (adapter-node) request handler: a connect-style
// middleware that takes the raw Node req/res plus a `next` callback.
type SvelteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;


const trustProxyValue = env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY === 'false' ? false : env.TRUST_PROXY;

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
  trustProxy: trustProxyValue === 'cloudflare' ? true : trustProxyValue,
  bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
});

async function start(): Promise<void> {
  // Ensure data dirs exist
  for (const dir of [env.UPLOADS_DIR, env.CONFIG_DIR, path.join(env.UPLOADS_DIR, 'repairs'), path.join(env.UPLOADS_DIR, 'events'), path.join(env.UPLOADS_DIR, 'profiles'), path.join(env.UPLOADS_DIR, 'branding'), path.join(env.UPLOADS_DIR, 'qr')]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Wait for Postgres
  await waitForPostgres();
  await runMigrations();

  await app.register(securityPlugin);
  await app.register(authPlugin);
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      files: 1,
    },
  });

  // Everything that changes on a public demo site. Registers nothing at all
  // when DEMO_MODE is off, which is the default. See plugins/demoMode.ts.
  await app.register(demoModePlugin);

  // Static: uploads
  await app.register(staticPlugin, {
    root: env.UPLOADS_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(setupRoutes);
  await app.register(authRoutes);
  await app.register(publicRoutes);
  // Progressive web app manifest + icons. Registered as real routes so they
  // take precedence over the SvelteKit fallback below.
  await app.register(pwaRoutes);
  // Social sharing pictures. Registered as real routes so they take precedence
  // over the SvelteKit fallback below.
  await app.register(ogRoutes);
  await app.register(checkInRoutes);
  await app.register(repairerRoutes);
  // Event photo galleries. Repairers and admins share these routes; the
  // handlers check the role for anything only an admin may do.
  await app.register(eventGalleryRoutes);
  await app.register(adminRoutes);

  // Setup-required gate. If setup not completed, JSON API responses redirect through 409 on most endpoints,
  // but the web app itself handles the redirect to /setup based on /api/setup/status.

  // ── SvelteKit SSR ──────────────────────────────────────────────────────────
  // The web app is built with @sveltejs/adapter-node. Its handler serves the
  // server-rendered pages and the client assets (/_app/...). We load it at
  // runtime from the build output so the server's TypeScript build does not
  // depend on the web build being present (in dev, vite serves the web).
  const handlerPath = path.join(env.WEB_BUILD_DIR, 'handler.js');
  let svelteHandler: SvelteHandler | null = null;
  if (fs.existsSync(handlerPath)) {
    try {
      const mod = (await import(pathToFileURL(handlerPath).href)) as { handler: SvelteHandler };
      svelteHandler = mod.handler;
      app.log.info(`SvelteKit SSR handler loaded (${handlerPath})`);
    } catch (err) {
      app.log.error({ err }, 'Failed to load SvelteKit SSR handler');
    }
  } else {
    app.log.warn(`SvelteKit handler not found at ${handlerPath}; serving API only (dev uses vite).`);
  }

  // robots.txt + sitemap.xml are generated from live data by the server (they
  // are not SvelteKit routes), so register them explicitly to take precedence.
  app.get('/robots.txt', async (request, reply) => {
    const data = await getSeoData();
    void reply.type('text/plain').send(renderRobots(resolveOrigin(request, data.cafe)));
  });
  app.get('/sitemap.xml', async (request, reply) => {
    const data = await getSeoData();
    void reply.type('application/xml').send(renderSitemap(data, resolveOrigin(request, data.cafe)));
  });

  // Anything that isn't an explicit API / uploads / robots / sitemap route is a
  // page (or client asset) — hand it to the SvelteKit handler. Unknown /api and
  // /uploads paths still return a JSON 404.
  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? '';
    if (url.startsWith('/api/') || url.startsWith('/uploads/') || !svelteHandler) {
      void reply.code(404).send({ error: 'Not found', code: 'not_found' });
      return;
    }
    // Detach Fastify from the response and let SvelteKit write to it directly.
    reply.hijack();
    svelteHandler(request.raw, reply.raw, (err?: unknown) => {
      if (err) request.log.error({ err }, 'SSR handler error');
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = err ? 500 : 404;
        reply.raw.end(err ? 'Internal Server Error' : 'Not Found');
      }
    });
  });

  // Once a day, and only if this cafe has agreed to it. Started last so
  // nothing about it can delay the server coming up, and it does nothing at
  // all until somebody has answered the question. See services/telemetry.ts.
  startTelemetrySchedule(app.log);

  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(`Circularity Hub listening on ${env.HOST}:${env.PORT}`);
}

async function waitForPostgres(maxAttempts = 60, delayMs = 1000): Promise<void> {
  const { pool } = await import('./db/index.js');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return;
    } catch (err) {
      if (i === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
