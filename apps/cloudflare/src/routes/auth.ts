import type { App } from '../lib/router.js';
import { loginSchema, passwordSchema } from '@circularity/shared';
import { db } from '../db/index.js';
import { passwordResetTokens, users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { and, count, eq, gt } from 'drizzle-orm';
import { loginAttempts } from '../db/schema.js';
import { rotateRefreshToken } from '../lib/auth.js';
import { audit } from '../utils/audit.js';
import { hashToken, randomToken } from '../utils/tokens.js';
import { env } from '../env.js';

const REFRESH_COOKIE = 'circ_refresh';

// Login rate limit: the same numbers as the old Docker edition's
// @fastify/rate-limit setting, 10 tries per address and email in 10 minutes.
// Fastify kept the count in memory. A Worker has no lasting memory, so failed
// tries are written to a small table instead, and only failures count.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

function loginKey(ip: string, email: string): string {
  return `${ip}:${email.trim().toLowerCase()}`;
}

async function recentFailures(key: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, new Date(Date.now() - LOGIN_WINDOW_MS))));
  return Number(row?.n ?? 0);
}

export async function authRoutes(app: App): Promise<void> {
  // Per-route rate limiting on login
  app.post(
    '/api/auth/login',
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'Invalid credentials', code: 'auth/invalid' });
        return;
      }
      const { email, password } = parsed.data;
      const key = loginKey(request.ip, email);
      if ((await recentFailures(key)) >= LOGIN_MAX_FAILURES) {
        reply.code(429).send({
          statusCode: 429,
          error: 'Too many sign-in attempts. Wait 10 minutes and try again.',
          code: 'auth/rate_limited',
        });
        return;
      }
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (!user || !user.isActive) {
        await db.insert(loginAttempts).values({ key });
        reply.code(401).send({ error: 'Invalid credentials', code: 'auth/invalid' });
        return;
      }
      const check = await verifyPassword(password, user.passwordHash);
      if (!check.ok) {
        await db.insert(loginAttempts).values({ key });
        reply.code(401).send({ error: 'Invalid credentials', code: 'auth/invalid' });
        return;
      }
      // A password moved across from a Docker hub is still a bcrypt hash.
      // It has just been checked once, slowly, so replace it with a fast one.
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), ...(check.upgradedHash ? { passwordHash: check.upgradedHash } : {}) })
        .where(eq(users.id, user.id));

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
    const accessToken = await app.signAccessToken(result.user);
    // Re-set the cookie even when the token is not rotated so the browser
    // expiry slides forward on every visit.
    reply.setCookie(REFRESH_COOKIE, result.newToken ?? raw, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * env.REFRESH_TOKEN_DAYS,
    });
    return {
      accessToken,
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
    const tokenHash = await hashToken(token);
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
  const tokenHash = await hashToken(raw);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
  return raw;
}
