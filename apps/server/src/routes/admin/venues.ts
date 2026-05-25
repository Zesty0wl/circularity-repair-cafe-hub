import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { venues } from '../../db/schema.js';
import { asc, eq, ne } from 'drizzle-orm';
import { venueSchema } from '@circularity/shared';
import { audit } from '../../utils/audit.js';

export async function adminVenuesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/venues', async () => {
    return db.select().from(venues).orderBy(asc(venues.name));
  });

  app.post('/api/admin/venues', async (request, reply) => {
    const me = request.auth!;
    const parsed = venueSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const [created] = await db
      .insert(venues)
      .values({
        name: data.name,
        address: data.address ?? null,
        postcode: data.postcode ?? null,
        what3words: data.what3words ?? null,
        mapUrl: data.mapUrl || null,
        directions: data.directions ?? null,
        parkingInfo: data.parkingInfo ?? null,
        accessibilityInfo: data.accessibilityInfo ?? null,
        notes: data.notes ?? null,
        isHomeVenue: data.isHomeVenue ?? false,
        isActive: data.isActive ?? true,
      })
      .returning();
    if (created.isHomeVenue) {
      await db.update(venues).set({ isHomeVenue: false }).where(ne(venues.id, created.id));
    }
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'venue.created', entityType: 'venue', entityId: created.id });
    return created;
  });

  app.patch('/api/admin/venues/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const parsed = venueSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const update: any = {};
    for (const k of [
      'name',
      'address',
      'postcode',
      'what3words',
      'mapUrl',
      'directions',
      'parkingInfo',
      'accessibilityInfo',
      'notes',
      'isHomeVenue',
      'isActive',
    ]) {
      if ((data as any)[k] !== undefined) update[k] = (data as any)[k];
    }
    const [updated] = await db.update(venues).set(update).where(eq(venues.id, id)).returning();
    if (updated && update.isHomeVenue === true) {
      await db.update(venues).set({ isHomeVenue: false }).where(ne(venues.id, id));
    }
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'venue.updated', entityType: 'venue', entityId: id });
    return updated;
  });

  app.delete('/api/admin/venues/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await db.delete(venues).where(eq(venues.id, id));
      return { ok: true };
    } catch {
      reply.code(409).send({ error: 'Venue is in use', code: 'venue/in_use' });
    }
  });
}
