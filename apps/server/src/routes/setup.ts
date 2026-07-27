import type { FastifyInstance } from 'fastify';
import { setupCompleteSchema } from '@circularity/shared';
import { db } from '../db/index.js';
import { APP_VERSION } from '../version.js';
import { cafes, users, venues } from '../db/schema.js';
import { hashPassword } from '../utils/password.js';
import { audit } from '../utils/audit.js';
import { eq } from 'drizzle-orm';

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/setup/status', async () => {
    const [cafe] = await db.select({ setupCompleted: cafes.setupCompleted }).from(cafes).limit(1);
    return { setupCompleted: cafe?.setupCompleted ?? false };
  });

  app.post('/api/setup/complete', async (request, reply) => {
    const [cafe] = await db.select().from(cafes).limit(1);
    if (cafe?.setupCompleted) {
      reply.code(409).send({ error: 'Setup already completed', code: 'setup/already_done' });
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
        setupCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(cafes.id, cafe!.id));

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
      secure: false,
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
