// The old Docker edition's utils/tokens.ts, on Web Crypto. hashToken() is async
// here, because Web Crypto is, so callers await it.
export { randomToken, checkInToken, hashToken } from '../lib/crypto.js';
