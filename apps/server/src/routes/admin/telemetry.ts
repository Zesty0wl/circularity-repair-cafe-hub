import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { cafes } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { audit } from '../../utils/audit.js';
import { APP_VERSION } from '../../version.js';
import {
  buildPayload,
  forgetUs,
  sendTelemetry,
  shouldPrompt,
  telemetryState,
  type TelemetryLevel,
} from '../../services/telemetry.js';

const LEVELS: TelemetryLevel[] = ['none', 'standard', 'community'];

export async function adminTelemetryRoutes(app: FastifyInstance): Promise<void> {
  /** What is switched on, and whether we should be asking. */
  app.get('/api/admin/telemetry', async () => {
    const state = await telemetryState();
    if (!state) return null;
    return {
      level: state.level,
      lastSentAt: state.lastSentAt,
      decidedAt: state.decidedAt,
      hasSentAnything: Boolean(state.lastSentAt),
      verified: state.verified,
      verifyReason: state.verifyReason,
      disabledByEnv: state.disabledByEnv,
      shouldPrompt: shouldPrompt(state),
      appVersion: APP_VERSION,
    };
  });

  /**
   * The exact JSON we would send, built from this cafe's own data.
   *
   * This is the whole point of the feature being trustworthy: nobody has to
   * take our word for what leaves the building, they can read it.
   */
  app.get('/api/admin/telemetry/preview', async (request) => {
    const query = request.query as { level?: string };
    const level = query.level === 'community' ? 'community' : 'standard';
    return { level, payload: await buildPayload(level) };
  });

  /** Save the answer. This is the only thing that can turn sending on. */
  app.patch('/api/admin/telemetry', async (request, reply) => {
    const me = request.auth!;
    const body = (request.body ?? {}) as { level?: string };
    if (!body.level || !LEVELS.includes(body.level as TelemetryLevel)) {
      reply.code(400).send({ error: 'level must be none, standard or community', code: 'validation/failed' });
      return;
    }
    const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    await db
      .update(cafes)
      .set({
        telemetryLevel: body.level,
        telemetryDecidedAt: new Date(),
        // Answering also counts as having been asked at this version, so a
        // "no" is not followed by the same card on the next page load.
        telemetryPromptedVersion: APP_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(cafes.id, cafe.id));
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'cafe.telemetry_updated',
      entityType: 'cafe',
      entityId: cafe.id,
      metadata: { level: body.level },
    });

    // Send straight away so the answer has a visible effect, rather than the
    // admin wondering for a day whether it worked.
    if (body.level !== 'none') {
      const result = await sendTelemetry({ force: true });
      return { level: body.level, sent: result.ok, error: result.error ?? null };
    }
    return { level: body.level, sent: false, error: null };
  });

  /**
   * "Not now". Records that we asked at this version so the card goes away,
   * without recording a decision, so the offer comes back after an upgrade.
   */
  app.post('/api/admin/telemetry/dismiss', async (request, reply) => {
    const me = request.auth!;
    const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);
    if (!cafe) {
      reply.code(404).send({ error: 'Cafe not initialized', code: 'cafe/missing' });
      return;
    }
    await db
      .update(cafes)
      .set({ telemetryPromptedVersion: APP_VERSION, updatedAt: new Date() })
      .where(eq(cafes.id, cafe.id));
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'cafe.telemetry_dismissed',
      entityType: 'cafe',
      entityId: cafe.id,
    });
    return { ok: true };
  });

  /** Send now, for an admin who has just changed something and wants to see it work. */
  app.post('/api/admin/telemetry/send', async (request) => {
    const me = request.auth!;
    const result = await sendTelemetry({ force: true });
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'cafe.telemetry_sent',
      entityType: 'cafe',
    });
    return result;
  });

  /** Ask the collector to delete everything it holds about this cafe. */
  app.post('/api/admin/telemetry/forget', async (request, reply) => {
    const me = request.auth!;
    const result = await forgetUs();
    if (!result.ok) {
      reply.code(502).send({
        error: result.error ?? 'Could not reach the collector',
        code: 'telemetry/forget_failed',
      });
      return;
    }
    const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);
    if (cafe) {
      // Stop sending as well, otherwise tomorrow's send would put it all back.
      await db
        .update(cafes)
        .set({ telemetryLevel: 'none', telemetryDecidedAt: new Date(), updatedAt: new Date() })
        .where(eq(cafes.id, cafe.id));
    }
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: 'cafe.telemetry_forgotten',
      entityType: 'cafe',
      entityId: cafe?.id,
    });
    return { ok: true };
  });
}
