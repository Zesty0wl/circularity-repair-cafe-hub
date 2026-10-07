// =============================================================================
//  Portable rows: the data in a backup
//  ---------------------------------------------------------------------------
//  A backup has to move between the two editions. The old Docker edition keeps
//  Postgres types (real booleans, timestamps, arrays) and the Cloudflare
//  edition keeps SQLite ones (0 and 1, milliseconds, JSON text). So a backup
//  holds neither. It holds "portable rows": one JSON object per row, keyed by
//  the database column name, with plain JSON values:
//
//    text, date, time        string ('2026-10-07', '10:00:00')
//    whole and decimal       number
//    yes or no               true or false
//    a moment in time        ISO 8601 string ('2026-10-07T09:30:00.000Z')
//    JSON                    the object or array itself
//    list of text            array of strings
//    nothing                 null
//
//  This file turns rows from D1 into portable rows for export, and portable
//  rows into D1 statements for import. The browser turns a Docker backup's
//  pg_dump into the same portable rows (packages/shared/src/backup.ts), so the
//  server only ever deals with one format.
// =============================================================================
import { getTableColumns, getTableName } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { normaliseTime } from '../db/schema.js';
import * as schema from '../db/schema.js';

export type ColumnKind = 'text' | 'time' | 'number' | 'boolean' | 'timestamp' | 'json' | 'textArray';

export interface TableInfo {
  name: string;
  /** Column name to kind, in the order the table defines them. */
  columns: Map<string, ColumnKind>;
  primaryKey: string;
}

/**
 * Every table a backup carries, parents before children, which is the order
 * they must be imported in. Deleting goes the other way.
 *
 * The cafe row goes last. It is the row that says setup is finished, so until
 * an import has fully landed the hub still counts as not set up, and whoever
 * is moving it can simply start the import again.
 *
 * Not carried: hub_meta (this hub's own signing key and caches),
 * login_attempts and hub_migrations.
 */
const BACKUP_TABLES: SQLiteTable[] = [
  schema.users,
  schema.venues,
  schema.skillCategories,
  schema.co2Factors,
  schema.eventTemplates,
  schema.events,
  schema.repairerEvents,
  schema.repairJobs,
  schema.repairImages,
  schema.eventImages,
  schema.linuxInstalls,
  schema.cafeGallery,
  schema.refreshTokens,
  schema.passwordResetTokens,
  schema.auditLog,
  schema.cafes,
];

// The custom column types in schema.ts all store as text or real, so the kind
// cannot be read from Drizzle alone. These are the ones that need saying.
const KIND_BY_COLUMN: Record<string, ColumnKind> = {
  skills: 'textArray',
  local_cafe_slugs: 'textArray',
  start_time: 'time',
  end_time: 'time',
};

function kindOf(column: { name: string; columnType: string; getSQLType(): string }): ColumnKind {
  const override = KIND_BY_COLUMN[column.name];
  if (override) return override;
  switch (column.columnType) {
    case 'SQLiteTimestamp':
      return 'timestamp';
    case 'SQLiteBoolean':
      return 'boolean';
    case 'SQLiteTextJson':
      return 'json';
    case 'SQLiteInteger':
    case 'SQLiteReal':
      return 'number';
    default:
      return column.getSQLType() === 'real' ? 'number' : 'text';
  }
}

function describe(table: SQLiteTable): TableInfo {
  const columns = new Map<string, ColumnKind>();
  let primaryKey = 'id';
  for (const column of Object.values(getTableColumns(table))) {
    columns.set(column.name, kindOf(column as never));
    if (column.primary) primaryKey = column.name;
  }
  return { name: getTableName(table), columns, primaryKey };
}

export const TABLES: TableInfo[] = BACKUP_TABLES.map(describe);
export const TABLE_BY_NAME = new Map(TABLES.map((t) => [t.name, t]));

// ── D1 → portable ────────────────────────────────────────────────────────────

function parseJsonText(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function toPortable(info: TableInfo, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, kind] of info.columns) {
    const value = row[name];
    if (value === null || value === undefined) {
      out[name] = null;
      continue;
    }
    switch (kind) {
      case 'timestamp':
        out[name] = new Date(Number(value)).toISOString();
        break;
      case 'boolean':
        out[name] = Number(value) !== 0;
        break;
      case 'json':
      case 'textArray':
        out[name] = parseJsonText(value);
        break;
      case 'number':
        out[name] = Number(value);
        break;
      default:
        out[name] = value;
    }
  }
  return out;
}

// ── portable → D1 ────────────────────────────────────────────────────────────

export class PortableRowError extends Error {}

/** Postgres's {a,b,"c d"} array text, in case a backup carries it raw. */
function parsePgArray(text: string): string[] {
  const inner = text.trim().replace(/^\{/, '').replace(/\}$/, '');
  if (!inner) return [];
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quoted) {
      if (ch === '\\' && i + 1 < inner.length) current += inner[++i];
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out.map((v) => (v === 'NULL' ? '' : v));
}

function toDbValue(kind: ColumnKind, value: unknown, column: string): string | number | null {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case 'timestamp': {
      const ms = typeof value === 'number' ? value : Date.parse(String(value));
      if (!Number.isFinite(ms)) throw new PortableRowError(`${column}: "${String(value)}" is not a date and time`);
      return Math.round(ms);
    }
    case 'boolean':
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value === 't' || value === 'true' || value === 1 || value === '1') return 1;
      if (value === 'f' || value === 'false' || value === 0 || value === '0') return 0;
      throw new PortableRowError(`${column}: "${String(value)}" is not yes or no`);
    case 'json':
      return typeof value === 'string' ? (isJson(value) ? value : JSON.stringify(value)) : JSON.stringify(value);
    case 'textArray': {
      const list = Array.isArray(value)
        ? value
        : typeof value === 'string' && value.trim().startsWith('[')
          ? (JSON.parse(value) as unknown[])
          : typeof value === 'string'
            ? parsePgArray(value)
            : [];
      return JSON.stringify(list.map((v) => String(v)));
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new PortableRowError(`${column}: "${String(value)}" is not a number`);
      return n;
    }
    case 'time':
      return normaliseTime(String(value));
    default:
      return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * An INSERT for one portable row. Columns this hub does not know are left out,
 * and columns the row does not have get the table's default, so a backup from
 * an older or newer hub still imports. A row that is already there (a batch
 * sent twice after a dropped connection) is skipped rather than duplicated.
 */
export function insertStatement(
  db: D1Database,
  info: TableInfo,
  row: Record<string, unknown>,
): D1PreparedStatement {
  const names: string[] = [];
  const values: Array<string | number | null> = [];
  for (const [name, kind] of info.columns) {
    if (!(name in row)) continue;
    names.push(name);
    values.push(toDbValue(kind, row[name], `${info.name}.${name}`));
  }
  if (names.length === 0) throw new PortableRowError(`A row for ${info.name} has no columns this hub knows`);
  const quoted = names.map((n) => `"${n}"`).join(', ');
  const marks = names.map(() => '?').join(', ');
  return db
    .prepare(`INSERT INTO "${info.name}" (${quoted}) VALUES (${marks}) ON CONFLICT ("${info.primaryKey}") DO NOTHING`)
    .bind(...values);
}
