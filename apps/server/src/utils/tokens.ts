import crypto from 'node:crypto';

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function checkInToken(): string {
  // 12 bytes -> 16 url-safe chars (per PRD Appendix B)
  return crypto.randomBytes(12).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
