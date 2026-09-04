import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { repairJobs, users } from '../../db/schema.js';
import { asc, eq, sql } from 'drizzle-orm';
import { userCreateSchema, userUpdateSchema } from '@circularity/shared';
import { hashPassword } from '../../utils/password.js';
import { generateResetLinkForUser } from '../auth.js';
import { audit } from '../../utils/audit.js';
import { randomToken } from '../../utils/tokens.js';

export async function adminUsersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/users', async () => {
    return db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        isActive: users.isActive,
        showOnPublicPage: users.showOnPublicPage,
        showOnHomePage: users.showOnHomePage,
        skills: users.skills,
        linuxRepairer: users.linuxRepairer,
        joinDate: users.joinDate,
        repairCountCache: users.repairCountCache,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(asc(users.displayName));
  });

  app.get('/api/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      reply.code(404).send({ error: 'User not found', code: 'user/not_found' });
      return;
    }
    return user;
  });

  app.post('/api/admin/users', async (request, reply) => {
    const me = request.auth!;
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    if (data.role === 'super_admin' && me.role !== 'super_admin') {
      reply.code(403).send({ error: 'Only super admins can create super admins', code: 'auth/forbidden' });
      return;
    }
    // Generate temp password (user will reset via link)
    const tempPassword = randomToken(16);
    const passwordHash = await hashPassword(tempPassword);
    let created;
    try {
      [created] = await db
        .insert(users)
        .values({
          email: data.email.toLowerCase(),
          passwordHash,
          displayName: data.displayName,
          role: data.role,
          bio: data.bio ?? null,
          skills: data.skills,
          joinDate: data.joinDate ?? new Date().toISOString().slice(0, 10),
          showOnPublicPage: data.showOnPublicPage,
          showOnHomePage: data.showOnHomePage,
          linuxRepairer: data.linuxRepairer,
        })
        .returning();
    } catch (err: any) {
      if (err?.code === '23505') {
        reply.code(409).send({ error: 'Email already in use', code: 'user/email_taken' });
        return;
      }
      throw err;
    }
    const resetToken = await generateResetLinkForUser(created.id);
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'user.created', entityType: 'user', entityId: created.id });
    return { user: created, resetToken };
  });

  app.patch('/api/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const parsed = userUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    if (data.role === 'super_admin' && me.role !== 'super_admin') {
      reply.code(403).send({ error: 'Only super admins can promote to super admin', code: 'auth/forbidden' });
      return;
    }
    const update: any = { updatedAt: new Date() };
    for (const k of ['displayName', 'role', 'bio', 'skills', 'isActive', 'showOnPublicPage', 'showOnHomePage', 'linuxRepairer', 'joinDate']) {
      if ((data as any)[k] !== undefined) update[k] = (data as any)[k];
    }
    if (data.email !== undefined) update.email = data.email.toLowerCase();
    const [updated] = await db.update(users).set(update).where(eq(users.id, id)).returning();
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'user.updated', entityType: 'user', entityId: id });
    return updated;
  });

  app.post('/api/admin/users/:id/reset-link', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.auth!;
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) {
      reply.code(404).send({ error: 'User not found', code: 'user/not_found' });
      return;
    }
    const token = await generateResetLinkForUser(id);
    await audit({ request, actorId: me.sub, actorType: me.role, action: 'user.reset_link_generated', entityType: 'user', entityId: id });
    return { token };
  });

  app.delete('/api/admin/users/:id', async (request, reply) => {
    const me = request.auth!;
    if (me.role !== 'super_admin') {
      reply.code(403).send({ error: 'Only super admins can delete users', code: 'auth/forbidden' });
      return;
    }
    const { id } = request.params as { id: string };
    // Disallow if has repairs
    const [{ c }] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(repairJobs).where(eq(repairJobs.repairerId, id));
    if (Number(c) > 0) {
      reply.code(409).send({ error: 'User has repair history; deactivate instead', code: 'user/has_history' });
      return;
    }
    await db.delete(users).where(eq(users.id, id));
    return { ok: true };
  });
}
