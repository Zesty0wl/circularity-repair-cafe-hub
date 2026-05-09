import type { FastifyInstance } from 'fastify';
import { loginSchema, passwordSchema } from '@circularity/shared';
import { db } from '../db/index.js';
import { passwordResetTokens, users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { eq } from 'drizzle-orm';
import { rotateRefreshToken } from '../plugins/auth.js';
import { audit } from '../utils/audit.js';
import { hashToken, randomToken } from '../utils/tokens.js';
import { env } from '../env.js';

const REFRESH_COOKIE = 'circ_refresh';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Per-route rate limiting on login
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '10 minutes',
          keyGenerator: (req) => `${req.ip}:${(req.body as { email?: string })?.email ?? ''}`,
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'Invalid credentials', code: 'auth/invalid' });
        return;
      }
      const { email, password } = parsed.data;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (!user || !user.isActive) {
        reply.code(401).send({ error: 'Invalid credentials', code: 'auth/invalid' });
        return;
      }
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        reply.code(401).send({ error: 'Invalid credentials', code: 'auth/invalid' });
        return;
      }
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      const tokens = await app.issueTokens({
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      });
      reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * env.REFRESH_TOKEN_DAYS,
      });
      await audit({
        request,
        actorId: user.id,
        actorType: user.role,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
      });
      return {
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
      };
    }
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE];
    if (raw) await app.revokeRefreshToken(raw);
    reply.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE];
    if (!raw) {
      reply.code(401).send({ error: 'Not authenticated', code: 'auth/required' });
      return;
    }
    const result = await rotateRefreshToken(raw);
    if (!result) {
      reply.clearCookie(REFRESH_COOKIE, { path: '/' });
      reply.code(401).send({ error: 'Session expired', code: 'auth/expired' });
      return;
    }
    const tokens = await app.issueTokens(result.user);
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * env.REFRESH_TOKEN_DAYS,
    });
    return {
      accessToken: tokens.accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        role: result.user.role,
        avatarUrl: null,
      },
    };
  });

  app.post('/api/auth/reset/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as { password?: string };
    const parsed = passwordSchema.safeParse(body?.password);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Password too weak', code: 'auth/weak_password' });
      return;
    }
    const tokenHash = hashToken(token);
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      reply.code(400).send({ error: 'Reset link is invalid or expired', code: 'auth/reset_invalid' });
      return;
    }
    const passwordHash = await hashPassword(parsed.data);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    // Sign the user in straight away — matches the login response shape so
    // the SPA can route them to /repairer or /admin/dashboard immediately.
    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user || !user.isActive) {
      reply.code(400).send({ error: 'Account is not active', code: 'auth/inactive' });
      return;
    }
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const tokens = await app.issueTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    });
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * env.REFRESH_TOKEN_DAYS,
    });
    await audit({
      request,
      actorId: user.id,
      actorType: user.role,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: user.id,
    });
    return {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  });
}

export async function generateResetLinkForUser(userId: string): Promise<string> {
  const raw = randomToken(24);
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
  return raw;
}
