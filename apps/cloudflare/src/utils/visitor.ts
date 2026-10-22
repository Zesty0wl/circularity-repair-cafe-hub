/**
 * A repair or pre-registration without the visitor's tracking token.
 *
 * The token is the visitor's key to their tracking page, and to cancelling
 * their own pre-registered items. Only the visitor is given it, at check-in.
 * Responses to volunteers leave it out.
 */
export function withoutVisitorToken<T extends { customerToken?: unknown }>(row: T): Omit<T, 'customerToken'>;
export function withoutVisitorToken<T extends { customerToken?: unknown }>(row: T | undefined): Omit<T, 'customerToken'> | undefined;
export function withoutVisitorToken<T extends { customerToken?: unknown }>(row: T | undefined) {
  if (!row) return row;
  const { customerToken: _token, ...rest } = row;
  return rest;
}
