// =============================================================================
//  /uploads, robots.txt and sitemap.xml
//  ---------------------------------------------------------------------------
//  The old Docker edition serves these straight from Fastify: uploads from disk
//  with @fastify/static, and robots.txt and sitemap.xml from live data. Here
//  uploads come from the R2 bucket, at the same addresses.
// =============================================================================
import type { App } from '../lib/router.js';
import { getSeoData, renderRobots, renderSitemap, resolveOrigin } from '../services/seo.js';
import { serveUpload } from '../services/imageUpload.js';
import { drawMissingQr } from '../services/qrcode.js';
import { bindings } from '../env.js';

const QR_KEY = /^qr\/([0-9a-f-]{36})\.png$/i;

export async function fileRoutes(app: App): Promise<void> {
  app.get('/uploads/*', async (request, reply) => {
    const key = request.params['*'] ?? '';
    // Cached copies the hub keeps for itself are not uploads.
    if (key.startsWith('cache/')) {
      reply.code(404).send({ error: 'Not found', code: 'not_found' });
      return;
    }
    const res = await serveUpload(request.raw, key);
    if (res.status !== 404) return reply.send(res);

    // A session's QR code is drawn the first time somebody asks for it. See
    // services/qrcode.ts for why.
    const qr = QR_KEY.exec(key);
    if (qr) {
      const png = await drawMissingQr(qr[1]!);
      if (png) {
        return reply
          .type('image/png')
          .header('Cache-Control', 'public, max-age=86400')
          .send(png);
      }
    }
    return reply.send(res);
  });

  app.get('/robots.txt', async (request, reply) => {
    const data = await getSeoData();
    void reply.type('text/plain').send(renderRobots(resolveOrigin(request, data.cafe)));
  });

  app.get('/sitemap.xml', async (request, reply) => {
    const data = await getSeoData();
    void reply.type('application/xml').send(renderSitemap(data, resolveOrigin(request, data.cafe)));
  });
}

/** Whether the bucket is bound at all. Used by the health check. */
export function hasUploads(): boolean {
  return Boolean(bindings().UPLOADS);
}
