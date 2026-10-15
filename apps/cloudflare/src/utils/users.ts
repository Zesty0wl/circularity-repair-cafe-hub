// What the hub may send about a user. A users row holds the password hash, so
// a whole row must never go into a reply.
import { users, type User } from '../db/schema.js';

/** Enough to show who is working on a repair. Use in a select with a join. */
export const repairerSummary = {
  id: users.id,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

/** A user row without its password hash, for the admin user pages. */
export function withoutPassword(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _hidden, ...rest } = user;
  return rest;
}
