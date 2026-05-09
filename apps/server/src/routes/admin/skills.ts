import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { skillCategories } from '../../db/schema.js';
import { asc, eq } from 'drizzle-orm';
import { skillCategorySchema } from '@circularity/shared';
import { audit } from '../../utils/audit.js';

export async function adminSkillsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/skill-categories', async () => {
    return db.select().from(skillCategories).orderBy(asc(skillCategories.sortOrder), asc(skillCategories.name));
  });

  app.post('/api/admin/skill-categories', async (request, reply) => {
    const me = request.auth!;
    const parsed = skillCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const [created] = await db.insert(skillCategories).values(parsed.data).returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'skill_category.created', entityType: 'skill_category', entityId: created.id });
    return created;
  });

  app.patch('/api/admin/skill-categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = skillCategorySchema.partial().safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const [updated] = await db.update(skillCategories).set(parsed.data as any).where(eq(skillCategories.id, id)).returning();
    return updated;
  });

  app.delete('/api/admin/skill-categories/:id', async (request) => {
    const { id } = request.params as { id: string };
    // Soft delete = deactivate
    await db.update(skillCategories).set({ isActive: false }).where(eq(skillCategories.id, id));
    return { ok: true };
  });

  app.post('/api/admin/skill-categories/reorder', async (request, reply) => {
    const body = request.body as { ids: string[] };
    if (!Array.isArray(body?.ids)) {
      reply.code(400).send({ error: 'ids array required', code: 'validation/failed' });
      return;
    }
    for (let i = 0; i < body.ids.length; i++) {
      await db.update(skillCategories).set({ sortOrder: i }).where(eq(skillCategories.id, body.ids[i]));
    }
    return { ok: true };
  });
}
