import type { App } from '../lib/router.js';
import { setupCompleteSchema } from '@circularity/shared';
import { db } from '../db/index.js';
import { APP_VERSION, EDITION } from '../version.js';
import { cafes, users, venues } from '../db/schema.js';
import { hashPassword } from '../utils/password.js';
import { audit } from '../utils/audit.js';
import { eq } from 'drizzle-orm';
import { isSetupCompleted, markSetUp, wasEverSetUp } from '../services/cafeCache.js';
import {
  findOurs,
  getNetwork,
  searchNetwork,
  suggestListings,
  type NetworkCafe,
} from '../services/repairCafeNetwork.js';

/**
 * A slug from the wizard, kept only if the directory knows it. When the
 * directory cannot be read just now, the slug is kept as it is: it came from
 * the directory a moment ago, and the hub reads it fresh every time anyway.
 */
async function knownSlug(slug: string | null): Promise<string | null> {
  const wanted = (slug ?? '').trim().toLowerCase();
  if (!wanted) return null;
  const snapshot = await getNetwork();
  if (!snapshot) return wanted;
  return findOurs(snapshot, wanted)?.slug ?? null;
}

export async function setupRoutes(app: App): Promise<void> {
  // `edition` and `canImport` tell the setup page it can offer to move an
  // existing hub across, which only the Cloudflare edition can do.
  app.get('/api/setup/status', async () => {
    return { setupCompleted: await isSetupCompleted(), edition: EDITION, canImport: true };
  });

  // Suggestions for the wizard's "Find your cafe on repaircafe.org" step.
  // Nobody is signed in yet, so this only answers until setup is finished.
  // Everything it returns is already public on repaircafe.org.
  app.get('/api/setup/repaircafe-listings', async (request, reply) => {
    if (await wasEverSetUp()) {
      reply.code(404).send({ error: 'Setup is already finished', code: 'setup/already_done' });
      return;
    }
    const query = request.query as { name?: string; town?: string; postcode?: string; q?: string };
    const snapshot = await getNetwork();
    if (!snapshot) return { available: false, suggestions: [], results: [] };
    const view = (c: NetworkCafe) => ({ slug: c.slug, name: c.name, address: c.address, website: c.website });
    const q = (query.q ?? '').trim().slice(0, 100);
    return {
      available: true,
      suggestions: suggestListings(snapshot, {
        name: query.name?.slice(0, 200),
        town: query.town?.slice(0, 100),
        postcode: query.postcode?.slice(0, 20),
      }).map(view),
      results: q ? searchNetwork(snapshot, { query: q, limit: 10 }).map(view) : [],
    };
  });

  app.post('/api/setup/complete', async (request, reply) => {
    // Read fresh, never from the cache. See wasEverSetUp() for why the cafe
    // row alone is not enough.
    if (await wasEverSetUp()) {
      reply.code(409).send({ error: 'Setup already completed', code: 'setup/already_done' });
      return;
    }
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) {
      // Only while a backup is being restored onto this new hub.
      reply.code(409).send({ error: 'A backup is being restored on this hub', code: 'setup/import_running' });
      return;
    }

    const parsed = setupCompleteSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({
        error: 'Validation failed',
        code: 'validation/failed',
        details: parsed.error.flatten(),
      });
      return;
    }
    const data = parsed.data;

    const passwordHash = await hashPassword(data.admin.password);

    const [created] = await db
      .insert(users)
      .values({
        email: data.admin.email.toLowerCase(),
        passwordHash,
        displayName: data.admin.displayName,
        role: 'super_admin',
        isActive: true,
        joinDate: new Date().toISOString().slice(0, 10),
      })
      .returning();

    const [venue] = await db
      .insert(venues)
      .values({
        name: data.venue.name,
        address: data.venue.address ?? null,
        postcode: data.venue.postcode ?? null,
        notes: data.venue.notes ?? null,
        isHomeVenue: true,
      })
      .returning();

    await db
      .update(cafes)
      .set({
        name: data.cafe.name,
        tagline: data.cafe.tagline ?? null,
        description: data.cafe.description ?? null,
        contactEmail: data.cafe.contactEmail ?? null,
        websiteUrl: data.cafe.websiteUrl ?? null,
        primaryColor: data.cafe.primaryColor || null,
        accentColor: data.cafe.accentColor || null,
        headingFont: data.cafe.headingFont || null,
        bodyFont: data.cafe.bodyFont || null,
        publicUrl: data.publicUrl,
        // The wizard asked, so this is a real answer either way. Recording the
        // version too means we do not ask again until the next upgrade.
        telemetryLevel: data.telemetry?.level ?? 'none',
        telemetryDecidedAt: new Date(),
        telemetryPromptedVersion: APP_VERSION,
        // The wizard asked which repaircafe.org listing is ours. Whatever the
        // answer, that counts as asking at this version.
        ...(data.repaircafeListing
          ? {
              repaircafeSlug: await knownSlug(data.repaircafeListing.slug),
              listingNotListed: data.repaircafeListing.notListed === true,
              listingPromptedVersion: APP_VERSION,
            }
          : {}),
        setupCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(cafes.id, cafe.id));
    await markSetUp();

    const tokens = await app.issueTokens({
      id: created.id,
      email: created.email,
      role: created.role,
      displayName: created.displayName,
    });
    reply.setCookie('circ_refresh', tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    await audit({
      request,
      actorId: created.id,
      actorType: 'super_admin',
      action: 'setup.completed',
      entityType: 'cafe',
      entityId: cafe!.id,
      metadata: { venueId: venue.id },
    });
    return {
      ok: true,
      accessToken: tokens.accessToken,
      user: {
        id: created.id,
        email: created.email,
        displayName: created.displayName,
        role: created.role,
        avatarUrl: created.avatarUrl,
      },
    };
  });
}
