// The old Docker edition's utils/password.ts. verifyPassword() here also says
// when an old bcrypt hash should be replaced: see lib/crypto.ts.
export { hashPassword, verifyPassword } from '../lib/crypto.js';
