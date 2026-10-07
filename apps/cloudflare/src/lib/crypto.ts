// =============================================================================
//  Tokens, passwords and login tokens, on the Web Crypto API
//  ---------------------------------------------------------------------------
//  The old Docker edition uses node:crypto, bcrypt and @fastify/jwt. None of those
//  run on a Worker, and bcrypt would be too slow if they did: the free plan
//  allows about 10 ms of CPU per request, and one bcrypt check at cost 12 takes
//  around 300 ms.
//
//  Passwords are hashed with PBKDF2-SHA256 instead, which the Worker runs
//  natively. 100,000 rounds is the most a Worker allows. Hashes look like:
//
//    pbkdf2$sha256$100000$<salt, base64url>$<hash, base64url>
//
//  Passwords moved across from a Docker hub are still bcrypt hashes. They are
//  checked with bcryptjs once, at that person's next sign-in, and replaced with
//  a PBKDF2 hash straight away. See verifyPassword().
// =============================================================================
import bcrypt from 'bcryptjs';

const encoder = new TextEncoder();

// ── Bytes and base64url ──────────────────────────────────────────────────────

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare two byte arrays without stopping early, so timing gives nothing away. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ── Random tokens (utils/tokens.ts) ──────────────────────────────────────────

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function checkInToken(): string {
  // 12 bytes -> 16 url-safe characters, the same as the old Docker edition.
  return randomToken(12);
}

/**
 * SHA-256 of a token, as hex. The same value node:crypto gave, so tokens moved
 * across from a Docker hub still match. Async because Web Crypto is.
 */
export async function hashToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', (typeof data === 'string' ? encoder.encode(data) : data) as BufferSource));
}

// ── Passwords (utils/password.ts) ────────────────────────────────────────────

const PBKDF2_ROUNDS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, rounds: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: rounds },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(plain, salt, PBKDF2_ROUNDS);
  return `pbkdf2$sha256$${PBKDF2_ROUNDS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export function isLegacyHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

export interface PasswordCheck {
  ok: boolean;
  /** A replacement hash to store, when the old one was bcrypt. */
  upgradedHash?: string;
}

export async function verifyPassword(plain: string, stored: string): Promise<PasswordCheck> {
  if (isLegacyHash(stored)) {
    const ok = await bcrypt.compare(plain, stored);
    return ok ? { ok, upgradedHash: await hashPassword(plain) } : { ok };
  }
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return { ok: false };
  const rounds = Number(parts[2]);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > PBKDF2_ROUNDS) return { ok: false };
  const actual = await pbkdf2(plain, fromBase64Url(parts[3]!), rounds);
  return { ok: sameBytes(actual, fromBase64Url(parts[4]!)) };
}

// ── Login tokens (JWT, HS256) ────────────────────────────────────────────────

const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toBase64Url(encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The payload of a valid, unexpired token, or null. */
export async function verifyJwt<T = Record<string, unknown>>(token: string, secret: string): Promise<T | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];
  try {
    const head = JSON.parse(new TextDecoder().decode(fromBase64Url(header))) as { alg?: string };
    if (head.alg !== 'HS256') return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(signature) as BufferSource,
      encoder.encode(`${header}.${body}`),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T & { exp?: number };
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
