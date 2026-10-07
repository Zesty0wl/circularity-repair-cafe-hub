// =============================================================================
//  Signing in: access tokens, refresh cookies and role checks
//  ---------------------------------------------------------------------------
//  Ported from the old Docker edition. The rules are the same:
//    - a 15 minute access token, sent as "Authorization: Bearer ..."
//    - a long-lived refresh token in an httpOnly cookie called circ_refresh
//    - the refresh token rotates at most once a day, so two tabs refreshing at
//      the same time do not sign each other out
// =============================================================================
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { hubMeta, refreshTokens, users } from '../db/schema.js';
import { bindings, env } from '../env.js';
import { hashToken, randomToken, signJwt, verifyJwt } from './crypto.js';
import type { HubReply, HubRequest, Hook, JWTPayload } from './router.js';

export type { JWTPayload };
export type Role = JWTPayload['role'];

export const REFRESH_COOKIE = 'circ_refresh';
const ACCESS_TOKEN_SECONDS = 15 * 60;

// ── The signing key ──────────────────────────────────────────────────────────

let secretPromise: Promise<string> | null = null;

/**
 * SECRET_KEY if one is set on the Worker. If not, a random key the hub made
 * for itself on first run and keeps in the database. Either way it is read
 * once per Worker instance.
 */
export function signingSecret(): Promise<string> {
  const fromEnv = bindings().SECRET_KEY?.trim();
  if (fromEnv && fromEnv.length >= 32) return Promise.resolve(fromEnv);
  secretPromise ??= (async () => {
    const [row] = await db.select().from(hubMeta).where(eq(hubMeta.key, 'secret_key')).limit(1);
    if (row) return row.value;
    // Two Worker instances could get here at once. Only the first insert
    // sticks, and both then read back the same key.
    await db
      .insert(hubMeta)
      .values({ key: 'secret_key', value: randomToken(48) })
      .onConflictDoNothing();
    const [saved] = await db.select().from(hubMeta).where(eq(hubMeta.key, 'secret_key')).limit(1);
    return saved!.value;
  })().catch((err) => {
    secretPromise = null;
    throw err;
  });
  return secretPromise;
}

/** For tests: forget the key read from the database. */
export function resetSigningSecret(): void {
  secretPromise = null;
}

// ── Access tokens ────────────────────────────────────────────────────────────

interface TokenUser {
  id: string;
  email: string;
  role: Role;
  displayName: string;
}

export async function signAccessToken(user: TokenUser): Promise<string> {
  return signJwt(
    { sub: user.id, email: user.email, role: user.role, displayName: user.displayName },
    await signingSecret(),
    ACCESS_TOKEN_SECONDS,
  );
}

async function readAuth(request: HubRequest): Promise<JWTPayload | null> {
  const header = request.headers['authorization'] ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  return verifyJwt<JWTPayload>(match[1]!.trim(), await signingSecret());
}

export const requireAuth: Hook = async (request: HubRequest, reply: HubReply) => {
  const decoded = await readAuth(request);
  if (!decoded) {
    reply.code(401).send({ error: 'Authentication required', code: 'auth/required' });
    return;
  }
  request.auth = decoded;
};

export function requireRole(...roles: Role[]): Hook {
  return async (request: HubRequest, reply: HubReply) => {
    const decoded = await readAuth(request);
    if (!decoded) {
      reply.code(401).send({ error: 'Authentication required', code: 'auth/required' });
      return;
    }
    request.auth = decoded;
    if (!roles.includes(decoded.role)) {
      reply.code(403).send({ error: 'Insufficient permissions', code: 'auth/forbidden' });
    }
  };
}

// ── Refresh tokens ───────────────────────────────────────────────────────────

export async function issueTokens(user: TokenUser): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken(user);
  const refreshToken = randomToken(32);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: await hashToken(refreshToken),
    expiresAt,
  });
  return { accessToken, refreshToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, await hashToken(rawToken)));
}

// Only rotate a refresh token once a day. Rotating on every call breaks
// concurrent tabs: two tabs refresh at the same time, the first one wins,
// and the second one gets logged out.
const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
// After a rotation, the old token stays valid for a short grace window so
// requests that were already in flight with it still succeed.
const ROTATE_GRACE_MS = 60 * 1000;

export async function rotateRefreshToken(rawToken: string): Promise<{
  user: TokenUser;
  /** New refresh token to set as the cookie, or null to keep the current one. */
  newToken: string | null;
} | null> {
  const tokenHash = await hashToken(rawToken);
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
  const user = { id: row.userId, email: row.email, role: row.role, displayName: row.displayName };

  if (Date.now() - row.createdAt.getTime() < ROTATE_AFTER_MS) {
    return { user, newToken: null };
  }

  // Rotate: issue a fresh token with a full lifetime, shorten the old one to
  // the grace window, and clean up this user's expired tokens.
  const newToken = randomToken(32);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await db.batch([
    db.insert(refreshTokens).values({ userId: row.userId, tokenHash: await hashToken(newToken), expiresAt }),
    db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() + ROTATE_GRACE_MS) })
      .where(eq(refreshTokens.id, row.tokenId)),
    db.delete(refreshTokens).where(and(eq(refreshTokens.userId, row.userId), lt(refreshTokens.expiresAt, new Date()))),
  ]);
  return { user, newToken };
}
