import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './env.js';
import { runMigrations } from './db/migrate.js';
import { db } from './db/index.js';
import { cafes } from './db/schema.js';
import authPlugin from './plugins/auth.js';
import securityPlugin from './plugins/security.js';
import { healthRoutes } from './routes/health.js';
import { setupRoutes } from './routes/setup.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { checkInRoutes } from './routes/checkin.js';
import { repairerRoutes } from './routes/repairer.js';
import { adminRoutes } from './routes/admin/index.js';

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
  for (const dir of [env.UPLOADS_DIR, env.CONFIG_DIR, path.join(env.UPLOADS_DIR, 'repairs'), path.join(env.UPLOADS_DIR, 'profiles'), path.join(env.UPLOADS_DIR, 'branding'), path.join(env.UPLOADS_DIR, 'qr')]) {
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
  await app.register(checkInRoutes);
  await app.register(repairerRoutes);
  await app.register(adminRoutes);

  // Setup-required gate. If setup not completed, JSON API responses redirect through 409 on most endpoints,
  // but the SPA itself handles the redirect to /setup based on /api/setup/status.

  // SPA static assets — must be last so it does not catch /api routes
  if (fs.existsSync(env.PUBLIC_DIR)) {
    await app.register(staticPlugin, {
      root: env.PUBLIC_DIR,
      prefix: '/',
      decorateReply: false,
      wildcard: false,
      // Don't auto-serve index.html on '/'; we render it through serveSpaIndex
      // below so crawlers see proper SEO meta tags inlined from the database.
      index: false,
    });

    const indexPath = path.join(env.PUBLIC_DIR, 'index.html');
    const escapeHtml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Cache the cafe row briefly so crawlers/page loads don't hammer Postgres.
    let cachedCafe: any = null;
    let cacheExpires = 0;
    async function getCachedCafe(): Promise<any> {
      const now = Date.now();
      if (now < cacheExpires && cachedCafe) return cachedCafe;
      const [row] = await db.select().from(cafes).limit(1);
      cachedCafe = row ?? null;
      cacheExpires = now + 30_000;
      return cachedCafe;
    }

    // Inject server-rendered SEO tags into the SPA shell so social/search
    // crawlers (which often don't execute JavaScript) see proper metadata.
    // The client-side <svelte:head> still updates on SPA navigation.
    async function serveSpaIndex(request: any, reply: any): Promise<void> {
      if (!fs.existsSync(indexPath)) {
        reply.code(404).send({ error: 'Not found', code: 'not_found' });
        return;
      }
      let html = fs.readFileSync(indexPath, 'utf8');
      try {
        const cafe = await getCachedCafe();
        if (cafe) {
          const name = cafe.name || 'Repair Cafe';
          const title = (cafe.seoTitle || (cafe.tagline ? `${name} — ${cafe.tagline}` : name)).slice(0, 200);
          const desc = (cafe.seoDescription || cafe.description || cafe.tagline || '').slice(0, 300);
          const ogImg = cafe.ogImageUrl || cafe.bannerUrl || cafe.logoUrl || '';
          const favicon = cafe.faviconUrl || '/favicon.svg';
          const fwdProto = request.headers['x-forwarded-proto'];
          const fwdHost = request.headers['x-forwarded-host'];
          const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto) || (request as any).protocol || 'https';
          const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) || request.headers.host || '';
          const canonical = `${proto}://${host}${request.url.split('?')[0]}`;
          const tags = [
            `<title>${escapeHtml(title)}</title>`,
            desc ? `<meta name="description" content="${escapeHtml(desc)}" />` : '',
            `<meta property="og:title" content="${escapeHtml(title)}" />`,
            desc ? `<meta property="og:description" content="${escapeHtml(desc)}" />` : '',
            `<meta property="og:type" content="website" />`,
            `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
            ogImg ? `<meta property="og:image" content="${escapeHtml(ogImg.startsWith('http') ? ogImg : proto + '://' + host + ogImg)}" />` : '',
            `<meta name="twitter:card" content="${ogImg ? 'summary_large_image' : 'summary'}" />`,
            `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
            cafe.plausibleDomain && cafe.plausibleSrc
              ? `<script defer data-domain="${escapeHtml(cafe.plausibleDomain)}" src="${escapeHtml(cafe.plausibleSrc)}"></script>`
              : '',
          ].filter(Boolean).join('\n    ');
          // Replace the static <link rel="icon"> with the configured favicon
          // and inject our SEO block right before </head>. The SPA's own
          // <svelte:head> will then layer on top once JS hydrates.
          html = html.replace(/<link rel="icon"[^>]*>/i, `<link rel="icon" href="${escapeHtml(favicon)}" />`);
          html = html.replace('</head>', `    ${tags}\n  </head>`);
        }
      } catch (err) {
        request.log.warn({ err }, 'SEO injection failed; serving raw index.html');
      }
      reply.type('text/html').send(html);
    }

    // Explicit handler for the root so we get SEO injection on '/'.
    app.get('/', serveSpaIndex);

    // SPA fallback: any unknown non-/api route returns index.html
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
        reply.code(404).send({ error: 'Not found', code: 'not_found' });
        return;
      }
      void serveSpaIndex(request, reply);
    });
  } else {
    app.log.warn(`PUBLIC_DIR ${env.PUBLIC_DIR} does not exist; serving API only`);
  }

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
