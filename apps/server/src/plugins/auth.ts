import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { env } from '../env.js';
import { db } from '../db/index.js';
import { refreshTokens, users } from '../db/schema.js';
import { and, eq, gt, lt } from 'drizzle-orm';
import { hashToken, randomToken } from '../utils/tokens.js';

export interface JWTPayload {
  sub: string;
  email: string;
  role: 'super_admin' | 'admin' | 'repairer';
  displayName: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: Array<'super_admin' | 'admin' | 'repairer'>
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    issueTokens: (user: { id: string; email: string; role: 'super_admin' | 'admin' | 'repairer'; displayName: string }) => Promise<{
      accessToken: string;
      refreshToken: string;
    }>;
    signAccessToken: (user: { id: string; email: string; role: 'super_admin' | 'admin' | 'repairer'; displayName: string }) => string;
    revokeRefreshToken: (rawToken: string) => Promise<void>;
  }
  interface FastifyRequest {
    auth?: JWTPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

const REFRESH_COOKIE = 'circ_refresh';

const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(cookie, {
    secret: env.SECRET_KEY,
    parseOptions: {
      sameSite: 'lax',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      path: '/',
    },
  });

  await app.register(jwt, {
    secret: env.SECRET_KEY,
    sign: { expiresIn: '15m' },
  });

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const decoded = await req.jwtVerify<JWTPayload>();
      req.auth = decoded;
    } catch {
      reply.code(401).send({ error: 'Authentication required', code: 'auth/required' });
    }
  });

  app.decorate(
    'requireRole',
    (...roles: Array<'super_admin' | 'admin' | 'repairer'>) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        try {
          const decoded = await req.jwtVerify<JWTPayload>();
          req.auth = decoded;
          if (!roles.includes(decoded.role)) {
            reply.code(403).send({ error: 'Insufficient permissions', code: 'auth/forbidden' });
          }
        } catch {
          reply.code(401).send({ error: 'Authentication required', code: 'auth/required' });
        }
      }
  );

  app.decorate(
    'signAccessToken',
    (user: { id: string; email: string; role: 'super_admin' | 'admin' | 'repairer'; displayName: string }) =>
      app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      })
  );

  app.decorate(
    'issueTokens',
    async (user: { id: string; email: string; role: 'super_admin' | 'admin' | 'repairer'; displayName: string }) => {
      const accessToken = app.signAccessToken(user);
      const refreshToken = randomToken(32);
      const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      });
      return { accessToken, refreshToken };
    }
  );

  app.decorate('revokeRefreshToken', async (rawToken: string) => {
    if (!rawToken) return;
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hashToken(rawToken)));
  });
});

export default authPlugin;
export { REFRESH_COOKIE };

// Only rotate a refresh token once a day. Rotating on every call breaks
// concurrent tabs: two tabs refresh at the same time, the first one wins,
// and the second one gets logged out.
const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
// After a rotation, the old token stays valid for a short grace window so
// requests that were already in flight with it still succeed.
const ROTATE_GRACE_MS = 60 * 1000;

export async function rotateRefreshToken(rawToken: string): Promise<{
  user: { id: string; email: string; role: 'super_admin' | 'admin' | 'repairer'; displayName: string };
  /** New refresh token to set as the cookie, or null to keep the current one. */
  newToken: string | null;
} | null> {
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select({
      tokenId: refreshTokens.id,
      createdAt: refreshTokens.createdAt,
      userId: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      isActive: users.isActive,
    })
    .from(refreshTokens)
    .innerJoin(users, eq(users.id, refreshTokens.userId))
    .where(and(eq(refreshTokens.tokenHash, tokenHash), gt(refreshTokens.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.isActive) return null;
  const user = {
    id: row.userId,
    email: row.email,
    role: row.role,
    displayName: row.displayName,
  };

  if (Date.now() - row.createdAt.getTime() < ROTATE_AFTER_MS) {
    return { user, newToken: null };
  }

  // Rotate: issue a fresh token with a full lifetime, shorten the old one to
  // the grace window, and clean up this user's expired tokens.
  const newToken = randomToken(32);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokens).values({
    userId: row.userId,
    tokenHash: hashToken(newToken),
    expiresAt,
  });
  await db
    .update(refreshTokens)
    .set({ expiresAt: new Date(Date.now() + ROTATE_GRACE_MS) })
    .where(eq(refreshTokens.id, row.tokenId));
  await db
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.userId, row.userId), lt(refreshTokens.expiresAt, new Date())));
  return { user, newToken };
}
