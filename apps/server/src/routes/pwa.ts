// =============================================================================
//  Progressive web app routes
//  ---------------------------------------------------------------------------
//  Both the manifest and the icons are built from the cafe's own branding, so
//  they cannot be static files in the web build. They live here, next to the
//  database, and take precedence over the SvelteKit fallback handler.
// =============================================================================
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import { shortAppName } from '@circularity/shared';
import { getSeoData } from '../services/seo.js';
import { ICON_SIZES, getIconPath, iconFilename, iconVersion, type IconSource } from '../services/pwaIcons.js';

/** Page background (`paper` in the Tailwind theme). Shown while the app opens. */
const BACKGROUND_COLOUR = '#FBF7EF';
const DEFAULT_THEME_COLOUR = '#1B6B5A';

export async function pwaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/manifest.webmanifest', async (request, reply) => {
    const { cafe } = await getSeoData();
    const source: IconSource = {
      logoUrl: cafe?.logoUrl ?? null,
      faviconUrl: cafe?.faviconUrl ?? null,
      primaryColor: cafe?.primaryColor ?? null,
    };
    const version = iconVersion(source);
    const name = cafe?.name ?? 'Repair Café';

    const manifest = {
      // A stable id keeps this the same installed app across branding changes.
      id: '/',
      name,
      short_name: shortAppName(name),
      description: cafe?.seoDescription?.trim() || cafe?.description?.trim() || cafe?.tagline?.trim() || undefined,
      // One app for everyone. It opens on the public home page, and the scope
      // covers the whole site so a volunteer who installs it can still reach
      // the repairer area without being kicked out to a browser tab.
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: BACKGROUND_COLOUR,
      theme_color: cafe?.primaryColor?.trim() || DEFAULT_THEME_COLOUR,
      lang: 'en-GB',
      dir: 'ltr',
      icons: [
        ...ICON_SIZES.map((size) => ({
          src: `/icons/${iconFilename(version, 'any', size)}`,
          sizes: `${size}x${size}`,
          type: 'image/png',
          purpose: 'any',
        })),
        ...ICON_SIZES.map((size) => ({
          src: `/icons/${iconFilename(version, 'maskable', size)}`,
          sizes: `${size}x${size}`,
          type: 'image/png',
          purpose: 'maskable',
        })),
      ],
    };

    // `return reply.send(...)` rather than a bare send: in an async handler
    // Fastify otherwise races the resolved promise against the response.
    return reply
      .type('application/manifest+json')
      // Short, because an admin can change the branding at any time.
      .header('Cache-Control', 'public, max-age=300')
      .send(JSON.stringify(manifest));
  });

  app.get('/icons/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const { cafe } = await getSeoData();
    const source: IconSource = {
      logoUrl: cafe?.logoUrl ?? null,
      faviconUrl: cafe?.faviconUrl ?? null,
      primaryColor: cafe?.primaryColor ?? null,
    };

    const filePath = await getIconPath(source, name).catch((err) => {
      request.log.error({ err, name }, 'Could not build PWA icon');
      return null;
    });
    if (!filePath) {
      void reply.code(404).send({ error: 'Not found', code: 'not_found' });
      return;
    }

    // Read into a buffer rather than piping a stream: an async Fastify handler
    // resolves before a stream finishes, which sent an empty body.
    const png = await fs.readFile(filePath);

    // The filename contains a hash of the branding, so this exact file never
    // changes meaning and can be cached hard.
    return reply
      .type('image/png')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(png);
  });
}
