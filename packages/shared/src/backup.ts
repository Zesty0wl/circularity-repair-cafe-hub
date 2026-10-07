// =============================================================================
//  Reading backups, in any edition
//  ---------------------------------------------------------------------------
//  A backup is a zip. There are two layouts:
//
//  Format 1, made by the old Docker edition:
//    manifest.json
//    postgres/dump.sql      a plain pg_dump, with the rows as COPY blocks
//    uploads/...            every uploaded file
//
//  Format 2, made by the Cloudflare edition:
//    manifest.json
//    data/<table>.json      the rows of each table, as "portable rows"
//    uploads/...            every uploaded file
//
//  A portable row is one JSON object per row, keyed by database column name,
//  with plain JSON values: strings, numbers, true and false, ISO 8601 times,
//  JSON objects, arrays of strings, and null. Both editions can read them.
//
//  This file turns a format 1 pg_dump into portable rows. It is plain
//  TypeScript with no Node or browser APIs, so the browser can run it (the
//  Cloudflare hub's import page does) and so can the tests.
// =============================================================================

/** What every backup's manifest.json says, whichever edition made it. */
export interface BackupManifest {
  backupFormatVersion: number;
  appVersion: string;
  createdAt: string;
  /** Format 2 only. */
  edition?: 'cloudflare' | 'docker';
  /** Format 1 only. */
  postgresMajorVersion?: number;
  cafe: { id: string | null; name: string };
  counts: Record<string, number>;
  /** Format 2 only: the tables in data/, in the order to import them. */
  tables?: string[];
}

export type PortableRow = Record<string, unknown>;

/**
 * The tables a backup carries, parents before children, which is the order
 * they must go into a database that checks its references. The cafe row is
 * last: it is the row that says setup is finished, so an import that stops
 * halfway leaves a hub that can simply be imported into again.
 */
export const BACKUP_TABLE_ORDER = [
  'users',
  'venues',
  'skill_categories',
  'co2_factors',
  'event_templates',
  'events',
  'repairer_events',
  'repair_jobs',
  'repair_images',
  'event_images',
  'linux_installs',
  'cafe_gallery',
  'refresh_tokens',
  'password_reset_tokens',
  'audit_log',
  'cafes',
] as const;

/** Files the hub draws for itself and draws again when asked, so they are left out. */
export const DERIVED_UPLOAD_PREFIXES = ['og/', 'pwa/', 'cache/'] as const;

export function isDerivedUpload(path: string): boolean {
  return DERIVED_UPLOAD_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ── pg_dump ──────────────────────────────────────────────────────────────────

export interface DumpTable {
  name: string;
  columns: string[];
  /** Column name to its Postgres type, e.g. "timestamp with time zone". */
  types: Map<string, string>;
  /** Each row as raw COPY fields. null is SQL NULL. */
  rows: Array<Array<string | null>>;
}

function unqualify(name: string): string {
  return name.replace(/^public\./, '').replace(/^"|"$/g, '');
}

/** Undo COPY's text escaping: \t, \n, \\, octal and hex bytes. */
export function unescapeCopyField(field: string): string {
  if (!field.includes('\\')) return field;
  let out = '';
  const bytes: number[] = [];
  const flushBytes = () => {
    if (bytes.length) {
      out += new TextDecoder().decode(new Uint8Array(bytes));
      bytes.length = 0;
    }
  };
  for (let i = 0; i < field.length; i++) {
    const ch = field[i]!;
    if (ch !== '\\' || i === field.length - 1) {
      flushBytes();
      out += ch;
      continue;
    }
    const next = field[++i]!;
    if (/[0-7]/.test(next)) {
      let digits = next;
      while (digits.length < 3 && /[0-7]/.test(field[i + 1] ?? '')) digits += field[++i];
      bytes.push(parseInt(digits, 8));
      continue;
    }
    if (next === 'x' && /[0-9a-fA-F]/.test(field[i + 1] ?? '')) {
      let digits = '';
      while (digits.length < 2 && /[0-9a-fA-F]/.test(field[i + 1] ?? '')) digits += field[++i];
      bytes.push(parseInt(digits, 16));
      continue;
    }
    flushBytes();
    switch (next) {
      case 'b':
        out += '\b';
        break;
      case 'f':
        out += '\f';
        break;
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'v':
        out += '\v';
        break;
      default:
        out += next;
    }
  }
  flushBytes();
  return out;
}

/**
 * Read the table definitions and the COPY blocks out of a plain pg_dump.
 * Statements we do not need (indexes, sequences, constraints) are skipped.
 */
export function parsePgDump(sql: string): DumpTable[] {
  const lines = sql.split('\n');
  const types = new Map<string, Map<string, string>>();
  const tables: DumpTable[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const create = /^CREATE TABLE ([\w."]+) \($/.exec(line);
    if (create) {
      const columns = new Map<string, string>();
      for (i++; i < lines.length && !lines[i]!.startsWith(')'); i++) {
        const def = /^\s+("?[\w]+"?)\s+(.+?)(?:\s+DEFAULT\s.*?)?(?:\s+NOT NULL)?,?$/.exec(lines[i]!);
        if (!def || def[1]!.toUpperCase() === 'CONSTRAINT') continue;
        columns.set(def[1]!.replace(/"/g, ''), def[2]!.replace(/\s+NOT NULL$/, '').trim());
      }
      types.set(unqualify(create[1]!), columns);
      continue;
    }

    const copy = /^COPY ([\w."]+) \((.*)\) FROM stdin;$/.exec(line);
    if (copy) {
      const name = unqualify(copy[1]!);
      const columns = copy[2]!.split(',').map((c) => c.trim().replace(/"/g, ''));
      const rows: Array<Array<string | null>> = [];
      for (i++; i < lines.length && lines[i] !== '\\.'; i++) {
        const raw = lines[i]!;
        // A trailing carriage return is part of the line ending on Windows.
        const fields = raw.replace(/\r$/, '').split('\t');
        rows.push(fields.map((f) => (f === '\\N' ? null : unescapeCopyField(f))));
      }
      tables.push({ name, columns, types: types.get(name) ?? new Map(), rows });
    }
  }
  return tables;
}

/** A Postgres timestamp as ISO 8601: '2026-10-07 00:00:12.364602+02' → '2026-10-06T22:00:12.364Z'. */
export function pgTimestampToIso(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(?:([+-]\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/.exec(value.trim());
  if (!match) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
  }
  const [, day, time, fraction = '', offsetHours, offsetMinutes = '00'] = match;
  const millis = (fraction.slice(1) + '000').slice(0, 3);
  // No offset at all means "timestamp without time zone", which the hub only
  // ever wrote in UTC.
  const offset = offsetHours ? `${offsetHours}:${offsetMinutes}` : 'Z';
  return new Date(`${day}T${time}.${millis}${offset}`).toISOString();
}

/** Postgres's {a,b,"c d"} array text as a list. */
export function parsePgArray(text: string): string[] {
  const inner = text.trim().replace(/^\{/, '').replace(/\}$/, '');
  if (!inner) return [];
  const out: string[] = [];
  let current = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quoted) {
      if (ch === '\\' && i + 1 < inner.length) current += inner[++i];
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') {
      quoted = true;
      wasQuoted = true;
    } else if (ch === ',') {
      out.push(!wasQuoted && current === 'NULL' ? '' : current);
      current = '';
      wasQuoted = false;
    } else current += ch;
  }
  out.push(!wasQuoted && current === 'NULL' ? '' : current);
  return out;
}

/** One COPY field as a portable value, using its Postgres column type. */
export function pgValueToPortable(type: string | undefined, raw: string | null): unknown {
  if (raw === null) return null;
  const t = (type ?? 'text').toLowerCase();
  if (t.endsWith('[]')) return parsePgArray(raw);
  if (t === 'boolean') return raw === 't' || raw === 'true';
  if (t === 'integer' || t === 'bigint' || t === 'smallint' || t.startsWith('numeric') || t === 'real' || t === 'double precision') {
    return Number(raw);
  }
  if (t.startsWith('timestamp')) return pgTimestampToIso(raw);
  if (t === 'jsonb' || t === 'json') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** Every table in a pg_dump as portable rows. */
export function pgDumpToPortable(sql: string): Map<string, PortableRow[]> {
  const out = new Map<string, PortableRow[]>();
  for (const table of parsePgDump(sql)) {
    out.set(
      table.name,
      table.rows.map((fields) => {
        const row: PortableRow = {};
        table.columns.forEach((column, i) => {
          row[column] = pgValueToPortable(table.types.get(column), fields[i] ?? null);
        });
        return row;
      }),
    );
  }
  return out;
}
