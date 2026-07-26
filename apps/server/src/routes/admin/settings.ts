import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { cafeGallery, cafes } from '../../db/schema.js';
import { cafeSettingsSchema } from '@circularity/shared';
import { asc, eq } from 'drizzle-orm';
import { audit } from '../../utils/audit.js';
import { saveValidatedImage, deleteImage } from '../../services/imageUpload.js';
import { slugFromLink } from '../../services/repairCafeNetwork.js';

/**
 * Reduce whatever an admin pasted to a bare repaircafe.org slug.
 * Accepts a full page address or the slug on its own. Returns null when the
 * field is empty, which clears the setting.
 */
function normaliseRepaircafeSlug(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const fromLink = slugFromLink(raw);
  if (fromLink) return fromLink;
  // Not a link, so treat it as a slug. Drop anything that is not a plausible
  // slug character so a stray paste cannot reach the matcher.
  const slug = raw.replace(/^\/+|\/+$/g, '').toLowerCase();
  return /^[a-z0-9à-ſ._-]+$/.test(slug) ? slug : null;
}

export async function adminSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/settings', async () => {
    const [cafe] = await db.select().from(cafes).limit(1);
    return cafe;
  });

  app.patch('/api/admin/settings', async (request, reply) => {
    const me = request.auth!;
    const parsed = cafeSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    const update: any = { updatedAt: new Date() };
    for (const k of ['name', 'tagline', 'description', 'websiteUrl', 'publicUrl', 'contactEmail', 'address', 'socialLinks', 'primaryColor', 'accentColor', 'headingFont', 'bodyFont', 'donateUrl']) {
      if ((data as any)[k] !== undefined) update[k] = (data as any)[k] === '' ? null : (data as any)[k];
    }
    // Admins can paste the whole repaircafe.org page address. Store just the
    // slug, which is what the directory data matches on.
    if (data.repaircafeSlug !== undefined) {
      update.repaircafeSlug = normaliseRepaircafeSlug(data.repaircafeSlug);
    }
    const [updated] = await db.update(cafes).set(update).where(eq(cafes.id, cafe.id)).returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.updated', entityType: 'cafe', entityId: cafe.id });
    return updated;
  });

  app.patch('/api/admin/settings/preferences', async (request, reply) => {
    const me = request.auth!;
    const body = request.body as {
      allowSkipPhoto?: boolean;
      enableContactField?: boolean;
      dataRetentionDays?: number;
    };
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    const update: any = { updatedAt: new Date() };
    if (typeof body.allowSkipPhoto === 'boolean') update.allowSkipPhoto = body.allowSkipPhoto;
    if (typeof body.enableContactField === 'boolean') update.enableContactField = body.enableContactField;
    if (typeof body.dataRetentionDays === 'number' && body.dataRetentionDays > 0) update.dataRetentionDays = body.dataRetentionDays;
    const [updated] = await db.update(cafes).set(update).where(eq(cafes.id, cafe.id)).returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.preferences_updated', entityType: 'cafe', entityId: cafe.id });
    return updated;
  });

  // ─────────────────── Editable home-page content ───────────────────
  // Stored as a single JSONB blob on the cafes row so admins can reshape
  // sections without a schema migration. The public endpoint surfaces it
  // verbatim under `homePage`. We don't deeply validate the JSON here —
  // it's only writable by admins and the SPA renders known fields only.
  app.patch('/api/admin/settings/home-page', async (request, reply) => {
    const me = request.auth!;
    const body = request.body as { homePage?: unknown };
    if (!body || typeof body.homePage !== 'object' || body.homePage === null) {
      reply.code(400).send({ error: 'homePage must be an object', code: 'validation/failed' });
      return;
    }
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    const [updated] = await db
      .update(cafes)
      .set({ homePage: body.homePage as any, updatedAt: new Date() })
      .where(eq(cafes.id, cafe.id))
      .returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.home_page_updated', entityType: 'cafe', entityId: cafe.id });
    return updated;
  });

  // ────────────────── SEO + analytics settings ──────────────────────
  // All fields are optional. Plausible is only loaded by the SPA when
  // both `plausibleDomain` and `plausibleSrc` are present.
  app.patch('/api/admin/settings/seo', async (request, reply) => {
    const me = request.auth!;
    const body = request.body as {
      seoTitle?: string | null;
      seoDescription?: string | null;
      ogImageUrl?: string | null;
      faviconUrl?: string | null;
      plausibleDomain?: string | null;
      plausibleSrc?: string | null;
    };
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    const update: any = { updatedAt: new Date() };
    for (const k of ['seoTitle', 'seoDescription', 'ogImageUrl', 'faviconUrl', 'plausibleDomain', 'plausibleSrc']) {
      if (k in body) update[k] = ((body as any)[k] ?? '').toString().trim() || null;
    }
    const [updated] = await db.update(cafes).set(update).where(eq(cafes.id, cafe.id)).returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.seo_updated', entityType: 'cafe', entityId: cafe.id });
    return updated;
  });

  // ───────────────────────── Photo gallery ──────────────────────────
  app.get('/api/admin/gallery', async () => {
    return db
      .select({ id: cafeGallery.id, url: cafeGallery.filePath, caption: cafeGallery.caption, sortOrder: cafeGallery.sortOrder })
      .from(cafeGallery)
      .orderBy(asc(cafeGallery.sortOrder), asc(cafeGallery.createdAt));
  });

  app.post('/api/admin/gallery', async (request, reply) => {
    const me = request.auth!;
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ error: 'No file provided', code: 'upload/missing' });
      return;
    }
    const buf = await file.toBuffer();
    let saved;
    try {
      saved = await saveValidatedImage(buf, file.mimetype, 'gallery', { maxLongestEdge: 1800, quality: 0.85 });
    } catch (err) {
      // Anything sharp cannot read (a PDF, an iPhone HEIC that was not
      // converted) lands here. Say so plainly rather than failing with a 500.
      request.log.warn({ err }, 'gallery upload failed');
      reply.code(400).send({
        error: 'That file is not a photo we can use. Try a JPEG, PNG or WebP.',
        code: 'upload/invalid',
      });
      return;
    }
    // New uploads sort to the end (highest sortOrder + 1)
    const existing = await db.select({ s: cafeGallery.sortOrder }).from(cafeGallery).orderBy(asc(cafeGallery.sortOrder));
    const nextOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.s)) + 1 : 0;
    const [row] = await db
      .insert(cafeGallery)
      .values({ filePath: saved.url, sortOrder: nextOrder })
      .returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.gallery_uploaded', entityType: 'cafe_gallery', entityId: row.id });
    return { id: row.id, url: row.filePath, caption: row.caption, sortOrder: row.sortOrder };
  });

  app.patch('/api/admin/gallery/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const body = request.body as { caption?: string | null };
    const [updated] = await db
      .update(cafeGallery)
      .set({ caption: body.caption ?? null })
      .where(eq(cafeGallery.id, id))
      .returning();
    if (!updated) {
      reply.code(404).send({ error: 'Image not found', code: 'gallery/not_found' });
      return;
    }
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.gallery_updated', entityType: 'cafe_gallery', entityId: id });
    return updated;
  });

  app.delete('/api/admin/gallery/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(cafeGallery).where(eq(cafeGallery.id, id)).limit(1);
    if (!row) {
      reply.code(404).send({ error: 'Image not found', code: 'gallery/not_found' });
      return;
    }
    await db.delete(cafeGallery).where(eq(cafeGallery.id, id));
    // Best-effort file cleanup. URL is stored as "/uploads/<rel>" so strip prefix.
    await deleteImage(row.filePath.replace(/^\/uploads\//, ''));
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.gallery_deleted', entityType: 'cafe_gallery', entityId: id });
    return { ok: true };
  });

  app.post('/api/admin/gallery/reorder', async (request, reply) => {
    const me = request.auth!;
    const body = request.body as { ids?: string[] };
    if (!Array.isArray(body.ids)) {
      reply.code(400).send({ error: 'ids must be an array', code: 'validation/failed' });
      return;
    }
    for (let i = 0; i < body.ids.length; i++) {
      await db.update(cafeGallery).set({ sortOrder: i }).where(eq(cafeGallery.id, body.ids[i]));
    }
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'cafe.gallery_reordered', entityType: 'cafe_gallery' });
    return { ok: true };
  });
}
