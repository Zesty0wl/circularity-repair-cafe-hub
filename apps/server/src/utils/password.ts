import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const COST_FACTOR = 12;

const pbkdf2 = promisify(crypto.pbkdf2);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_FACTOR);
}

/**
 * A hub moved back from the Cloudflare edition brings PBKDF2 hashes with it,
 * because a Cloudflare Worker cannot run bcrypt. They look like:
 *
 *   pbkdf2$sha256$<rounds>$<salt, base64url>$<hash, base64url>
 *
 * They are checked here so nobody has to reset their password, and
 * needsRehash() says to replace them with bcrypt at that first sign-in.
 */
async function verifyPbkdf2(plain: string, hash: string): Promise<boolean> {
  const parts = hash.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const rounds = Number(parts[2]);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10_000_000) return false;
  const salt = Buffer.from(parts[3]!, 'base64url');
  const expected = Buffer.from(parts[4]!, 'base64url');
  const actual = await pbkdf2(plain, salt, rounds, expected.length, 'sha256');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (hash.startsWith('pbkdf2$')) return verifyPbkdf2(plain, hash);
  return bcrypt.compare(plain, hash);
}

/** True for a hash this edition does not make itself. Replace it after a good sign-in. */
export function needsRehash(hash: string): boolean {
  return !hash.startsWith('$2');
}
