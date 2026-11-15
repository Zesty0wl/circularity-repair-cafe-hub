// =============================================================================
//  Past sessions from a spreadsheet
//  ---------------------------------------------------------------------------
//  Most cafes ran for years before they used the hub. Their history is in a
//  spreadsheet, a paper log or a tally of how many things were fixed. This file
//  reads such a spreadsheet, saved as a CSV file, and turns it into past
//  sessions and repairs. Then the hub's totals, charts and "first session" date
//  show the cafe's real age.
//
//  The browser does the reading and checking, so an admin sees a preview at
//  once and the Worker never parses a large file (a free Worker has very little
//  CPU time per request). The browser then sends the checked rows in small
//  chunks, and the Worker checks each chunk again with `historyChunkSchema`.
//
//  The file is kept simple on purpose:
//    - One row is one item, or several of the same item with "Number of items".
//    - A cafe that only kept a tally can leave "Item" empty and give an outcome
//      and a number: "12/03/2019, Fixed, 15".
//    - A row with only a date records a session where nothing was written down.
//    - Column names and outcomes can be in English or in French, and the file
//      can use commas or semicolons (French Excel saves with semicolons).
// =============================================================================
import { z } from 'zod';
import { translate, type Locale } from './i18n/index.js';

// ── The columns ──────────────────────────────────────────────────────────────

export type HistoryColumn =
  | 'date'
  | 'venue'
  | 'item'
  | 'category'
  | 'brand'
  | 'fault'
  | 'outcome'
  | 'quantity'
  | 'weightKg'
  | 'repairer'
  | 'notes';

/** The columns in the order the sample file has them, with their English names. */
export const HISTORY_COLUMNS: ReadonlyArray<{ key: HistoryColumn; label: string; aliases: string[] }> = [
  { key: 'date', label: 'Date', aliases: ['session date', 'event date', 'day'] },
  { key: 'venue', label: 'Venue', aliases: ['place', 'location', 'lieu'] },
  { key: 'item', label: 'Item', aliases: ['item description', 'description', 'product', 'object'] },
  { key: 'category', label: 'Category', aliases: ['skill', 'type', 'product category'] },
  { key: 'brand', label: 'Brand', aliases: ['make', 'manufacturer'] },
  { key: 'fault', label: 'Fault', aliases: ['problem', 'fault description', 'issue'] },
  { key: 'outcome', label: 'Outcome', aliases: ['status', 'result', 'repair status', 'fixed?'] },
  { key: 'quantity', label: 'Number of items', aliases: ['quantity', 'qty', 'count', 'number', 'items'] },
  { key: 'weightKg', label: 'Weight (kg)', aliases: ['weight', 'weight kg', 'kg'] },
  { key: 'repairer', label: 'Repairer', aliases: ['volunteer', 'fixer', 'repaired by'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'comments', 'comment', 'outcome notes'] },
];

/** What happened to an item, in the file's words. */
export type HistoryOutcome = 'fixed' | 'not_fixed' | 'other';

/** The words a cafe writes in the Outcome column, in English. The UI shows these. */
export const HISTORY_OUTCOME_LABELS: Record<HistoryOutcome, string> = {
  fixed: 'Fixed',
  not_fixed: 'Not fixed',
  other: 'Other',
};

/** More ways of saying the same thing, so most existing logs work as they are. */
const OUTCOME_ALIASES: Record<HistoryOutcome, string[]> = {
  fixed: ['fixed', 'repaired', 'yes', 'y', 'success', 'successful', 'completed', 'done', 'mended', 'repare', 'reparee', 'oui'],
  not_fixed: [
    'not fixed', 'notfixed', 'not repaired', 'no', 'n', 'cannot repair', 'cannot be repaired', 'could not repair',
    "can't repair", 'end of life', 'eol', 'failed', 'unrepairable', 'beyond repair', 'non repare', 'pas repare',
    'irreparable', 'non', 'echec',
  ],
  other: [
    'other', 'repairable', 'advice', 'advice given', 'partly fixed', 'partially fixed', 'partly', 'unknown',
    'not known', 'needs a part', 'needs parts', 'autre', 'conseil', 'conseils', 'inconnu', 'reparable',
    'partiellement repare',
  ],
};

/** How the database records each outcome. "Other" is the hub's "returned". */
export const HISTORY_STATUS: Record<HistoryOutcome, 'completed' | 'cannot_repair' | 'returned'> = {
  fixed: 'completed',
  not_fixed: 'cannot_repair',
  other: 'returned',
};

// ── Limits ───────────────────────────────────────────────────────────────────

/** No real cafe has more. It stops a stray extra zero creating 50,000 rows. */
export const HISTORY_MAX_ITEMS = 20_000;
export const HISTORY_MAX_QUANTITY = 500;
export const HISTORY_MAX_WEIGHT_KG = 1000;
/** Older than any repair cafe. A date before it is almost always a typing slip. */
export const HISTORY_EARLIEST_DATE = '1980-01-01';
/** Items the browser sends in one request. Each is one row in one D1 batch. */
export const HISTORY_ITEMS_PER_CHUNK = 150;

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Lower case, no accents, no spaces or punctuation: "Réparé !" becomes "repare". */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Read CSV text into rows of cells. Handles quoted cells (with commas, quotes
 * and line breaks inside), a byte order mark, Windows line endings, and a
 * comma, semicolon or tab between cells, whichever the first line uses most.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t']) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === candidate && !quoted) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * A date as 'YYYY-MM-DD', or null. Accepts 2023-03-11 and day-first dates
 * (11/03/2023, 11-03-2023, 11.03.2023, 11/03/23), with or without a time after
 * them, which is how Excel saves a date cell.
 */
export function parseHistoryDate(value: string): string | null {
  const text = value.trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?Z?$/, '');
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    if (match[3]!.length === 2) y += y >= 70 ? 1900 : 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** A number written either way, "1.5" or "1,5". Null when it is not one. */
function parseNumber(value: string): number | null {
  const text = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

// ── What the hub already has ─────────────────────────────────────────────────

/** What the browser fetches before it checks a file. See GET /api/admin/history/context. */
export interface HistoryContext {
  /** The cafe's date today, 'YYYY-MM-DD'. Nothing in the file may be after it. */
  today: string;
  categories: Array<{ id: string; name: string }>;
  venues: Array<{ id: string; name: string; isHomeVenue: boolean; isActive: boolean }>;
  people: Array<{ id: string; displayName: string; email: string }>;
  /** Sessions already in the hub, so we can add to one rather than repeat it. */
  sessions: Array<{ id: string; date: string; venueId: string; status: string }>;
}

// ── The result of checking a file ────────────────────────────────────────────

export interface HistoryProblem {
  /** The spreadsheet row, counting the column names as row 1. Null for the whole file. */
  row: number | null;
  /** An error stops the import. A warning does not. */
  severity: 'error' | 'warning';
  /** English text with {placeholders}, ready for $t(). */
  message: string;
  vars?: Record<string, string | number>;
}

export interface HistoryItem {
  item: string;
  categoryId: string | null;
  brand: string | null;
  fault: string;
  outcome: HistoryOutcome;
  quantity: number;
  weightKg: number | null;
  repairerId: string | null;
  notes: string | null;
}

export interface HistorySession {
  date: string;
  /** An existing venue, or null with `newVenueName` set. */
  venueId: string | null;
  /** A venue the file names that the hub does not have yet. */
  newVenueName: string | null;
  /** A finished session already in the hub on this date, which these items join. */
  existingEventId: string | null;
  items: HistoryItem[];
}

export interface HistoryPreview {
  sessions: HistorySession[];
  problems: HistoryProblem[];
  /** Columns the file has that we do not use. */
  ignoredColumns: string[];
  totals: {
    newSessions: number;
    existingSessions: number;
    items: number;
    fixed: number;
    notFixed: number;
    other: number;
    firstDate: string | null;
    lastDate: string | null;
    newVenues: string[];
  };
}

/** True when the preview has no errors and something to import. */
export function canImportHistory(preview: HistoryPreview): boolean {
  return preview.sessions.length > 0 && !preview.problems.some((p) => p.severity === 'error');
}

// ── Checking a file ──────────────────────────────────────────────────────────

/** The column a heading means, in English or French, or null. */
function columnFor(heading: string): HistoryColumn | null {
  const folded = foldText(heading);
  if (!folded) return null;
  for (const column of HISTORY_COLUMNS) {
    const names = [column.label, translate('fr', column.label), ...column.aliases];
    if (names.some((name) => foldText(name) === folded)) return column.key;
  }
  return null;
}

function outcomeFor(value: string): HistoryOutcome | null {
  const folded = foldText(value);
  for (const outcome of Object.keys(OUTCOME_ALIASES) as HistoryOutcome[]) {
    const names = [
      HISTORY_OUTCOME_LABELS[outcome],
      translate('fr', HISTORY_OUTCOME_LABELS[outcome]),
      ...OUTCOME_ALIASES[outcome],
    ];
    if (names.some((name) => foldText(name) === folded)) return outcome;
  }
  return null;
}

/** Find one thing by name. Two with the same name is as unhelpful as none. */
function findOne<T>(list: T[], value: string, names: (entry: T) => string[]): T | 'ambiguous' | null {
  const folded = foldText(value);
  const found = list.filter((entry) => names(entry).some((name) => foldText(name) === folded));
  if (found.length > 1) return 'ambiguous';
  return found[0] ?? null;
}

const LIMITS = { item: 500, brand: 200, fault: 2000, notes: 2000, venue: 200 } as const;

/**
 * Check a CSV file and plan what importing it would add. Nothing is saved.
 * `locale` is the language the admin is using, for the words we fill in.
 */
export function buildHistoryPreview(text: string, context: HistoryContext, locale: Locale): HistoryPreview {
  const problems: HistoryProblem[] = [];
  const empty: HistoryPreview = {
    sessions: [],
    problems,
    ignoredColumns: [],
    totals: { newSessions: 0, existingSessions: 0, items: 0, fixed: 0, notFixed: 0, other: 0, firstDate: null, lastDate: null, newVenues: [] },
  };
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header || header.every((cell) => cell.trim() === '')) {
    problems.push({ row: null, severity: 'error', message: 'The file is empty.' });
    return empty;
  }

  // Which column holds what.
  const at = new Map<HistoryColumn, number>();
  const ignoredColumns: string[] = [];
  header.forEach((heading, index) => {
    const column = columnFor(heading);
    if (column && !at.has(column)) at.set(column, index);
    else if (heading.trim()) ignoredColumns.push(heading.trim());
  });
  empty.ignoredColumns = ignoredColumns;
  if (!at.has('date')) {
    problems.push({
      row: 1,
      severity: 'error',
      message: 'The first row must hold the column names, with one called "{name}". Download the sample file to see the layout.',
      vars: { name: translate(locale, 'Date') },
    });
    return empty;
  }

  const homeVenue =
    context.venues.find((v) => v.isHomeVenue && v.isActive) ??
    context.venues.find((v) => v.isActive) ??
    context.venues[0] ??
    null;
  const notRecorded = translate(locale, 'Not recorded');
  const sessions = new Map<string, HistorySession>();
  const newVenues = new Map<string, string>();
  const warnedNames = new Set<string>();
  let itemCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const rowNumber = r + 1;
    const get = (column: HistoryColumn): string => {
      const index = at.get(column);
      return index === undefined ? '' : (cells[index] ?? '').trim();
    };
    if (cells.every((cell) => cell.trim() === '')) continue;

    const error = (message: string, vars?: Record<string, string | number>) =>
      problems.push({ row: rowNumber, severity: 'error', message, vars });
    const warn = (message: string, vars?: Record<string, string | number>) =>
      problems.push({ row: rowNumber, severity: 'warning', message, vars });
    const before = problems.filter((p) => p.severity === 'error').length;

    // Date
    const rawDate = get('date');
    const date = rawDate ? parseHistoryDate(rawDate) : null;
    if (!rawDate) error('The date is missing.');
    else if (!date) error('"{value}" is not a date we can read. Write it as 25/12/2023 (day first) or 2023-12-25.', { value: rawDate });
    else if (date > context.today) error('{date} is in the future. Only past sessions can be added.', { date });
    else if (date < HISTORY_EARLIEST_DATE) error('{date} is too long ago. Please check the year.', { date });

    // Venue
    const venueName = get('venue');
    let venueId: string | null = null;
    let newVenueName: string | null = null;
    if (venueName) {
      const venue = findOne(context.venues, venueName, (v) => [v.name]);
      if (venue === 'ambiguous') {
        error('More than one venue is called "{name}". Rename one of them first.', { name: venueName });
      } else if (venue) {
        venueId = venue.id;
      } else if (venueName.length > LIMITS.venue) {
        error('The venue name is too long.');
      } else {
        const key = foldText(venueName);
        if (!newVenues.has(key)) newVenues.set(key, venueName);
        newVenueName = newVenues.get(key)!;
      }
    } else if (homeVenue) {
      venueId = homeVenue.id;
    } else {
      error('No venue is given, and the hub has no venues yet. Add a venue first.');
    }

    // Item and outcome
    const itemText = get('item');
    const outcomeText = get('outcome');
    const quantityText = get('quantity');
    const sessionOnly = !itemText && !outcomeText && !quantityText && !get('fault') && !get('category');

    let item: HistoryItem | null = null;
    if (!sessionOnly) {
      let outcome = outcomeText ? outcomeFor(outcomeText) : null;
      if (outcomeText && !outcome) {
        error('"{value}" is not an outcome we know. Use {fixed}, {notFixed} or {other}.', {
          value: outcomeText,
          fixed: translate(locale, 'Fixed'),
          notFixed: translate(locale, 'Not fixed'),
          other: translate(locale, 'Other'),
        });
      }
      if (!outcomeText) {
        warn('No outcome is given, so it is counted as "{other}".', { other: translate(locale, 'Other') });
        outcome = 'other';
      }

      let quantity = 1;
      if (quantityText) {
        const n = parseNumber(quantityText);
        if (n === null || !Number.isInteger(n) || n < 1) error('"{value}" is not a whole number of items.', { value: quantityText });
        else if (n > HISTORY_MAX_QUANTITY) error('{value} items on one row is more than we allow ({max}). Split it over several rows.', { value: n, max: HISTORY_MAX_QUANTITY });
        else quantity = n;
      }

      let weightKg: number | null = null;
      const weightText = get('weightKg');
      if (weightText) {
        const w = parseNumber(weightText);
        if (w === null || w <= 0 || w > HISTORY_MAX_WEIGHT_KG) error('"{value}" is not a weight in kilograms we can use.', { value: weightText });
        else weightKg = Math.round(w * 1000) / 1000;
      }

      let categoryId: string | null = null;
      const categoryText = get('category');
      if (categoryText) {
        const category = findOne(context.categories, categoryText, (c) => [c.name, translate('fr', c.name)]);
        if (category && category !== 'ambiguous') categoryId = category.id;
        else if (!warnedNames.has(`c:${foldText(categoryText)}`)) {
          warnedNames.add(`c:${foldText(categoryText)}`);
          warn('"{name}" is not one of your skill categories, so these items have no category. Rows below with the same category are not listed again.', { name: categoryText });
        }
      }

      let repairerId: string | null = null;
      const repairerText = get('repairer');
      if (repairerText) {
        const person = findOne(context.people, repairerText, (p) => [p.displayName, p.email]);
        if (person && person !== 'ambiguous') repairerId = person.id;
        else if (!warnedNames.has(`p:${foldText(repairerText)}`)) {
          warnedNames.add(`p:${foldText(repairerText)}`);
          warn(
            person === 'ambiguous'
              ? 'More than one volunteer is called "{name}", so these repairs are not linked to anyone. Use their email address instead.'
              : '"{name}" is not a volunteer in the hub, so these repairs are not linked to anyone. Add them under Volunteers first, or use their email address.',
            { name: repairerText },
          );
        }
      }

      const brand = get('brand');
      const fault = get('fault');
      const notes = get('notes');
      const itemName = itemText || notRecorded;
      if (itemName.length > LIMITS.item) error('The item description is too long.');
      if (brand.length > LIMITS.brand) error('The brand is too long.');
      if (fault.length > LIMITS.fault) error('The fault description is too long.');
      if (notes.length > LIMITS.notes) error('The notes are too long.');

      item = {
        item: itemName,
        categoryId,
        brand: brand || null,
        fault,
        outcome: outcome ?? 'other',
        quantity,
        weightKg,
        repairerId,
        notes: notes || null,
      };
    }

    if (problems.filter((p) => p.severity === 'error').length > before || !date) continue;

    const venueKey = venueId ?? `new:${foldText(newVenueName ?? '')}`;
    const key = `${date}|${venueKey}`;
    let session = sessions.get(key);
    if (!session) {
      // A finished session already in the hub on the same day, at the same
      // venue (or any venue when the row does not say), gets these items.
      const existing = context.sessions.find(
        (s) => s.date === date && s.status === 'completed' && (!venueName || s.venueId === venueId),
      );
      session = { date, venueId, newVenueName, existingEventId: existing?.id ?? null, items: [] };
      sessions.set(key, session);
    }
    if (item) {
      session.items.push(item);
      itemCount += item.quantity;
    }
  }

  if (itemCount > HISTORY_MAX_ITEMS) {
    problems.push({
      row: null,
      severity: 'error',
      message: 'The file has {count} items. One file can add at most {max}. Split it into several files.',
      vars: { count: itemCount, max: HISTORY_MAX_ITEMS },
    });
  }
  if (sessions.size === 0 && !problems.some((p) => p.severity === 'error')) {
    problems.push({ row: null, severity: 'error', message: 'The file has no rows to add below the column names.' });
  }

  const list = [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const session of list.filter((s) => s.existingEventId)) {
    problems.push({
      row: null,
      severity: 'warning',
      message: 'You already have a finished session on {date}. Its items from this file are added to that session. Check that they are not in the hub already.',
      vars: { date: session.date },
    });
  }

  const totals = { ...empty.totals };
  for (const session of list) {
    if (session.existingEventId) totals.existingSessions++;
    else totals.newSessions++;
    for (const item of session.items) {
      totals.items += item.quantity;
      if (item.outcome === 'fixed') totals.fixed += item.quantity;
      else if (item.outcome === 'not_fixed') totals.notFixed += item.quantity;
      else totals.other += item.quantity;
    }
  }
  totals.firstDate = list[0]?.date ?? null;
  totals.lastDate = list[list.length - 1]?.date ?? null;
  totals.newVenues = [...newVenues.values()];

  return { sessions: list, problems, ignoredColumns, totals };
}

/**
 * Split the sessions into requests of at most `HISTORY_ITEMS_PER_CHUNK` items
 * (counting "Number of items"). A big session can span two requests: the
 * Worker finds the session it made for the first one and adds to it.
 */
export function chunkHistory(sessions: HistorySession[], perChunk = HISTORY_ITEMS_PER_CHUNK): HistorySession[][] {
  const chunks: HistorySession[][] = [];
  let current: HistorySession[] = [];
  let size = 0;
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
    size = 0;
  };
  for (const session of sessions) {
    const base = { ...session, items: [] as HistoryItem[] };
    if (session.items.length === 0) {
      if (size + 1 > perChunk) flush();
      current.push(base);
      size += 1;
      continue;
    }
    let part = { ...base, items: [] as HistoryItem[] };
    for (const item of session.items) {
      // A tally bigger than the space left is split: "200 fixed" can go as
      // 150 in one request and 50 in the next.
      let left = item.quantity;
      while (left > 0) {
        if (size >= perChunk) {
          if (part.items.length) current.push(part);
          flush();
          part = { ...base, items: [] };
        }
        const take = Math.min(left, perChunk - size);
        part.items.push(take === item.quantity ? item : { ...item, quantity: take });
        size += take;
        left -= take;
      }
    }
    if (part.items.length) current.push(part);
  }
  flush();
  return chunks;
}

// ── The sample file ──────────────────────────────────────────────────────────

/**
 * The sample file people download, fill in and send back, in the admin's
 * language. French uses semicolons, which is what French Excel expects. The
 * byte order mark makes Excel read the accents correctly.
 */
export function historySampleCsv(
  locale: Locale,
  options: { venueName?: string; categoryNames?: string[] } = {},
): { text: string; delimiter: string } {
  const delimiter = locale === 'fr' ? ';' : ',';
  const venueName = options.venueName ?? '';
  const tr = (s: string) => translate(locale, s);
  const cell = (value: string) => (/[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  // The cafe's own name for one of the starting categories, or nothing if it
  // was renamed or removed, so the sample never brings up a warning.
  const category = (english: string) =>
    (options.categoryNames ?? []).find((name) => [english, translate('fr', english)].some((n) => foldText(n) === foldText(name))) ?? '';
  const examples: string[][] = [
    // date, venue, item, category, brand, fault, outcome, number, weight, repairer, notes
    ['14/09/2019', venueName, tr('Kettle'), category('Small appliances'), 'Russell Hobbs', tr('Does not switch on'), tr('Fixed'), '', '1.2', '', tr('New fuse fitted')],
    ['14/09/2019', venueName, tr('Trousers'), category('Clothing & textiles'), '', tr('Torn seam'), tr('Fixed'), '', '', '', ''],
    ['14/09/2019', venueName, tr('Radio'), category('Electronics'), '', tr('No sound'), tr('Not fixed'), '', '', '', tr('Part no longer made')],
    ['12/10/2019', venueName, '', '', '', '', tr('Fixed'), '14', '', '', ''],
    ['12/10/2019', venueName, '', '', '', '', tr('Not fixed'), '5', '', '', ''],
    ['09/11/2019', '', '', '', '', '', '', '', '', '', ''],
  ];
  if (locale === 'fr') for (const row of examples) row[8] = row[8]!.replace('.', ',');
  const lines = [HISTORY_COLUMNS.map((c) => cell(tr(c.label))).join(delimiter)];
  for (const row of examples) lines.push(row.map(cell).join(delimiter));
  return { text: `﻿${lines.join('\r\n')}\r\n`, delimiter };
}

// ── What the browser sends ───────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const historyItemSchema = z.object({
  item: z.string().trim().min(1).max(LIMITS.item),
  categoryId: z.string().max(64).nullable(),
  brand: z.string().max(LIMITS.brand).nullable(),
  fault: z.string().max(LIMITS.fault),
  outcome: z.enum(['fixed', 'not_fixed', 'other']),
  quantity: z.number().int().min(1).max(HISTORY_MAX_QUANTITY),
  weightKg: z.number().positive().max(HISTORY_MAX_WEIGHT_KG).nullable(),
  repairerId: z.string().max(64).nullable(),
  notes: z.string().max(LIMITS.notes).nullable(),
});

export const historySessionSchema = z
  .object({
    date: isoDate,
    venueId: z.string().max(64).nullable(),
    newVenueName: z.string().trim().min(1).max(LIMITS.venue).nullable(),
    existingEventId: z.string().max(64).nullable(),
    items: z.array(historyItemSchema).max(HISTORY_ITEMS_PER_CHUNK),
  })
  .refine((s) => (s.venueId === null) !== (s.newVenueName === null) || s.existingEventId !== null, {
    message: 'A session needs either an existing venue or a new venue name',
  });

export const historyChunkSchema = z
  .object({
    /** Counts from 0. The Worker uses it to ignore a chunk sent twice. */
    chunk: z.number().int().min(0).max(10_000),
    sessions: z.array(historySessionSchema).min(1).max(HISTORY_ITEMS_PER_CHUNK),
  })
  .refine(
    (c) => c.sessions.reduce((n, s) => n + Math.max(1, s.items.reduce((m, i) => m + i.quantity, 0)), 0) <= HISTORY_ITEMS_PER_CHUNK,
    { message: `Send at most ${HISTORY_ITEMS_PER_CHUNK} items at a time` },
  );

export type HistoryChunk = z.infer<typeof historyChunkSchema>;

export const historyImportStartSchema = z.object({
  fileName: z.string().max(200).nullable().optional(),
  /** Show the new sessions in the list of past sessions on the public site. */
  publish: z.boolean().default(false),
});

/** Volunteers whose joined date should move back to their first recorded repair. */
export const historyJoinDatesSchema = z.object({ ids: z.array(z.string().max(64)).min(1).max(500) });
