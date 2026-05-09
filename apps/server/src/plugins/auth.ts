import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { env } from '../env.js';
import { db } from '../db/index.js';
import { refreshTokens, users } from '../db/schema.js';
import { and, eq, gt } from 'drizzle-orm';
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
    'issueTokens',
    async (user: { id: string; email: string; role: 'super_admin' | 'admin' | 'repairer'; displayName: string }) => {
      const accessToken = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      });
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

export async function rotateRefreshToken(rawToken: string): Promise<{
  user: { id: string; email: string; role: 'super_admin' | 'admin' | 'repairer'; displayName: string };
} | null> {
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select({
      tokenId: refreshTokens.id,
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
  // Rotate: delete old token; caller will issue new
  await db.delete(refreshTokens).where(eq(refreshTokens.id, row.tokenId));
  return {
    user: {
      id: row.userId,
      email: row.email,
      role: row.role,
      displayName: row.displayName,
    },
  };
}
