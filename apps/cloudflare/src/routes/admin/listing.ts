import type { App } from '../../lib/router.js';
import { db } from '../../db/index.js';
import { cafes, venues } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { audit } from '../../utils/audit.js';
import { APP_VERSION } from '../../version.js';
import {
  findOurs,
  getNetwork,
  searchNetwork,
  suggestListings,
  townFromAddress,
  type NetworkCafe,
} from '../../services/repairCafeNetwork.js';

/** What the page needs to show a listing and let an admin check it. */
function listingView(cafe: NetworkCafe) {
  return { slug: cafe.slug, name: cafe.name, address: cafe.address, website: cafe.website };
}

/**
 * Which repaircafe.org listing is this cafe's own.
 *
 * After an update, the admin dashboard asks once, while no listing is linked:
 * the same rule as the question about sharing numbers. New hubs are asked in
 * the setup wizard instead (see routes/setup.ts), which counts as asking at
 * that version.
 */
export async function adminListingRoutes(app: App): Promise<void> {
  app.get('/api/admin/repaircafe-listing', async (request) => {
    const query = request.query as { q?: string };
    const [cafe] = await db
      .select({
        name: cafes.name,
        slug: cafes.repaircafeSlug,
        promptedVersion: cafes.listingPromptedVersion,
        notListed: cafes.listingNotListed,
      })
      .from(cafes)
      .limit(1);
    const [home] = await db
      .select({ address: venues.address, postcode: venues.postcode })
      .from(venues)
      .where(eq(venues.isHomeVenue, true))
      .limit(1);

    const shouldPrompt = Boolean(cafe) && !cafe!.slug && !cafe!.notListed && cafe!.promptedVersion !== APP_VERSION;
    const snapshot = await getNetwork();
    if (!snapshot) {
      // Nothing to choose from right now. The page says nothing rather than
      // asking a question it cannot help with, and asks again next time.
      return { available: false, shouldPrompt, linked: null, suggestions: [], results: [] };
    }
    const ours = findOurs(snapshot, cafe?.slug ?? null);
    const q = (query.q ?? '').trim().slice(0, 100);
    return {
      available: true,
      shouldPrompt,
      linked: ours ? listingView(ours) : null,
      suggestions: suggestListings(snapshot, {
        name: cafe?.name,
        town: townFromAddress(home?.address),
        postcode: home?.postcode,
      }).map(listingView),
      results: q ? searchNetwork(snapshot, { query: q, limit: 10 }).map(listingView) : [],
    };
  });

  /**
   * The admin's answer. "link" saves the listing, "not_listed" stops us asking,
   * and "not_now" waits until the next update.
   */
  app.patch('/api/admin/repaircafe-listing', async (request, reply) => {
    const me = request.auth!;
    const body = (request.body ?? {}) as { action?: string; slug?: unknown };
    const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }

    const update: Partial<typeof cafes.$inferInsert> = { listingPromptedVersion: APP_VERSION, updatedAt: new Date() };
    if (body.action === 'link') {
      const snapshot = await getNetwork();
      if (!snapshot) {
        reply.code(503).send({
          error: 'The Repair Café directory is not available right now. Please try again later.',
          code: 'network/unavailable',
        });
        return;
      }
      const listing = typeof body.slug === 'string' ? findOurs(snapshot, body.slug) : null;
      if (!listing?.slug) {
        reply.code(400).send({ error: 'That listing is not in the repaircafe.org directory', code: 'listing/unknown' });
        return;
      }
      update.repaircafeSlug = listing.slug;
      update.listingNotListed = false;
    } else if (body.action === 'not_listed') {
      update.listingNotListed = true;
    } else if (body.action !== 'not_now') {
      reply.code(400).send({ error: 'action must be link, not_listed or not_now', code: 'validation/failed' });
      return;
    }

    const [updated] = await db
      .update(cafes)
      .set(update)
      .where(eq(cafes.id, cafe.id))
      .returning({ slug: cafes.repaircafeSlug, notListed: cafes.listingNotListed });
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'cafe.listing_answered',
      entityType: 'cafe',
      entityId: cafe.id,
      metadata: { action: body.action, slug: updated?.slug ?? null },
    });
    return { slug: updated?.slug ?? null, notListed: updated?.notListed ?? false };
  });
}
