import { drizzle } from 'drizzle-orm/d1';
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { bindings } from '../env.js';
import * as schema from './schema.js';

/**
 * The database, shaped like apps/server/src/db/index.ts so ported code can
 * keep writing `db.select()...`.
 *
 * Bindings are read through `cloudflare:workers`, which makes them available
 * outside a request handler. Drizzle does no I/O until a query runs, so making
 * it here at the top of the module is safe.
 */
export const db = drizzle(bindings().DB, { schema });

export type DB = typeof db;

/**
 * Run raw SQL and get the rows back, the same shape as `pool.query()` and
 * `db.execute()` gave in the Docker edition: `{ rows }`.
 *
 * Remember that raw SQL skips the column helpers in schema.ts. Booleans come
 * back as 0 or 1 and times as milliseconds, so convert where it matters.
 */
export async function execute<T = Record<string, unknown>>(query: SQL): Promise<{ rows: T[] }> {
  const rows = (await db.all(query)) as T[];
  return { rows };
}

/**
 * `column IN (...)` for a list of any length.
 *
 * D1 allows at most 100 values in one query, so a long `inArray()` fails. This
 * sends the whole list as one JSON value and lets SQLite unpack it, which is
 * one value however long the list is.
 */
export function inList(column: SQLWrapper, values: readonly (string | number)[]): SQL {
  if (values.length === 0) return sql`0`;
  return sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;
}

export { schema };
