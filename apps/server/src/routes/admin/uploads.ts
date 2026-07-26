import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { cafes, users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { saveValidatedImage } from '../../services/imageUpload.js';
import { audit } from '../../utils/audit.js';

export async function adminUploadsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/uploads/branding', async (request, reply) => {
    const me = request.auth!;
    const kind = (request.query as { kind?: string }).kind;
    if (kind !== 'logo' && kind !== 'banner' && kind !== 'favicon' && kind !== 'og') {
      reply.code(400).send({ error: 'kind must be logo, banner, favicon or og', code: 'validation/failed' });
      return;
    }
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ error: 'No file provided', code: 'upload/missing' });
      return;
    }
    const buf = await file.toBuffer();
    // Favicons stay small + square-ish; og images are wide; logo/banner unchanged.
    const longest = kind === 'favicon' ? 256 : kind === 'og' ? 1200 : 1600;
    let saved;
    try {
      saved = await saveValidatedImage(buf, file.mimetype, 'branding', { maxLongestEdge: longest, quality: 0.85 });
    } catch (err) {
      request.log.warn({ err }, 'branding upload failed');
      reply.code(400).send({
        error: 'That file is not a picture we can use. Try a JPEG, PNG or WebP.',
        code: 'upload/invalid',
      });
      return;
    }
    const [cafe] = await db.select().from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    const colMap: Record<string, string> = { logo: 'logoUrl', banner: 'bannerUrl', favicon: 'faviconUrl', og: 'ogImageUrl' };
    const update: any = { [colMap[kind]]: saved.url, updatedAt: new Date() };
    await db.update(cafes).set(update).where(eq(cafes.id, cafe.id));
    await audit({ request, actorId: me.sub, actorType: me.role, action: `cafe.${kind}_updated`, entityType: 'cafe', entityId: cafe.id });
    return { url: saved.url };
  });

  app.post('/api/admin/uploads/avatar/:userId', async (request, reply) => {
    const me = request.auth!;
    const { userId } = request.params as { userId: string };
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ error: 'No file provided', code: 'upload/missing' });
      return;
    }
    const buf = await file.toBuffer();
    let saved;
    try {
      saved = await saveValidatedImage(buf, file.mimetype, 'profiles', { maxLongestEdge: 600, quality: 0.85 });
    } catch (err) {
      request.log.warn({ err }, 'avatar upload failed');
      reply.code(400).send({
        error: 'That file is not a photo we can use. Try a JPEG, PNG or WebP.',
        code: 'upload/invalid',
      });
      return;
    }
    await db.update(users).set({ avatarUrl: saved.url, updatedAt: new Date() }).where(eq(users.id, userId));
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'user.avatar_updated', entityType: 'user', entityId: userId });
    return { url: saved.url };
  });

  app.delete('/api/admin/uploads/avatar/:userId', async (request, reply) => {
    const me = request.auth!;
    const { userId } = request.params as { userId: string };
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) {
      reply.code(404).send({ error: 'User not found', code: 'user/not_found' });
      return;
    }
    await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, userId));
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'user.avatar_removed', entityType: 'user', entityId: userId });
    return { ok: true };
  });
}
