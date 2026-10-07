// =============================================================================
//  Migrations and first-run seeding
//  ---------------------------------------------------------------------------
//  The old Docker edition brings its database up to date every time it starts.
//  A Worker does not "start" in the same way, so this runs on the first
//  request each Worker instance handles, and is remembered for the rest of
//  that instance's life. That costs one small query per instance.
//
//  Migrations are numbered SQL files in ./migrations. Each runs once, inside a
//  D1 batch (which is one transaction), and is recorded in hub_migrations.
//
//  Seeding fills in what a new hub needs: the single cafe row, the default
//  categories and page wording, and the CO2 reference data. It runs again only
//  when the seed data changes, because a Worker instance starts far more often
//  than a Docker container restarts and D1 counts every write.
// =============================================================================
import { CO2_FACTORS } from './co2Factors.js';
import { matchCo2FactorKey } from './co2Match.js';
import { DEFAULT_CATEGORIES, DEFAULT_HOME_PAGE, DEFAULT_LINUX_PAGE } from './defaults.js';
import { bindings } from '../env.js';
import { APP_VERSION } from '../version.js';
import m0001 from './migrations/0001_init.js';
import m0002 from './migrations/0002_display_token.js';

const MIGRATIONS: Array<{ id: string; sql: string }> = [
  { id: '0001_init', sql: m0001 },
  { id: '0002_display_token', sql: m0002 },
];

/** Split a migration into statements. Our SQL never puts ";" inside a string. */
export function splitStatements(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runMigrations(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS hub_migrations (
         id TEXT PRIMARY KEY NOT NULL,
         applied_at INTEGER NOT NULL
       )`,
    )
    .run();
  const applied = new Set(
    ((await db.prepare('SELECT id FROM hub_migrations').all<{ id: string }>()).results ?? []).map((r) => r.id),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const statements = splitStatements(migration.sql).map((s) => db.prepare(s));
    statements.push(db.prepare('INSERT INTO hub_migrations (id, applied_at) VALUES (?, ?)').bind(migration.id, Date.now()));
    try {
      await db.batch(statements);
    } catch (err) {
      // Another Worker instance may have applied it a moment ago. If so the
      // record is there now and there is nothing to do.
      const done = await db.prepare('SELECT 1 FROM hub_migrations WHERE id = ?').bind(migration.id).first();
      if (!done) throw err;
    }
  }
}

/** A short fingerprint of everything seeding writes, so a change re-seeds. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

const SEED_VERSION = `${APP_VERSION}:${fingerprint(
  JSON.stringify([CO2_FACTORS, DEFAULT_CATEGORIES, DEFAULT_HOME_PAGE, DEFAULT_LINUX_PAGE]),
)}`;

/**
 * Make sure the database holds what a hub needs. Safe to run any number of
 * times. `force` runs it even when the seed version has not changed, which
 * an import does, because it has just replaced every table.
 */
export async function seed(db: D1Database, options: { force?: boolean } = {}): Promise<void> {
  if (!options.force) {
    const row = await db.prepare(`SELECT value FROM hub_meta WHERE key = 'seed_version'`).first<{ value: string }>();
    if (row?.value === SEED_VERSION) return;
  }

  const statements: D1PreparedStatement[] = [];

  // The single cafe row. Its install id is random and identifies this hub to
  // the telemetry collector and nothing else.
  const cafeCount = await db.prepare('SELECT COUNT(*) AS n FROM cafes').first<{ n: number }>();
  if ((cafeCount?.n ?? 0) === 0) {
    statements.push(
      db
        .prepare(`INSERT INTO cafes (id, name, telemetry_install_id) VALUES (?, '', ?)`)
        .bind(crypto.randomUUID(), crypto.randomUUID()),
    );
  }
  statements.push(
    db
      .prepare('UPDATE cafes SET telemetry_install_id = ? WHERE telemetry_install_id IS NULL')
      .bind(crypto.randomUUID()),
  );
  // Default wording for pages nobody has edited yet.
  statements.push(
    db
      .prepare(`UPDATE cafes SET home_page = ? WHERE home_page IS NULL OR home_page = '{}' OR home_page = ''`)
      .bind(JSON.stringify(DEFAULT_HOME_PAGE)),
  );
  statements.push(
    db
      .prepare(`UPDATE cafes SET linux_page = ? WHERE linux_page IS NULL OR linux_page = '{}' OR linux_page = ''`)
      .bind(JSON.stringify(DEFAULT_LINUX_PAGE)),
  );

  const categoryCount = await db.prepare('SELECT COUNT(*) AS n FROM skill_categories').first<{ n: number }>();
  if ((categoryCount?.n ?? 0) === 0) {
    DEFAULT_CATEGORIES.forEach((cat, order) => {
      statements.push(
        db
          .prepare('INSERT INTO skill_categories (id, name, icon, colour, sort_order) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), cat.name, cat.icon, cat.colour, order),
      );
    });
  }

  // Reference data for the CO2 figure. Updated in place so a corrected number
  // reaches existing hubs. `is_active` is left alone because a cafe may have
  // hidden the kinds of thing it never sees.
  CO2_FACTORS.forEach((factor, order) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO co2_factors (id, key, label, group_label, category, weight_kg, co2e_kg, sample, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET
             label = excluded.label,
             group_label = excluded.group_label,
             category = excluded.category,
             weight_kg = excluded.weight_kg,
             co2e_kg = excluded.co2e_kg,
             sample = excluded.sample,
             sort_order = excluded.sort_order`,
        )
        .bind(
          crypto.randomUUID(),
          factor.key,
          factor.label,
          factor.groupLabel,
          factor.category,
          factor.weightKg,
          factor.co2eKg,
          factor.sample,
          order,
        ),
    );
  });

  statements.push(
    db
      .prepare(
        `INSERT INTO hub_meta (key, value, updated_at) VALUES ('seed_version', ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(SEED_VERSION, Date.now()),
  );

  await db.batch(statements);
  await backfillCo2Types(db);
}

/** The audit entry that records the one-off pass, so it cannot run twice. */
const CO2_BACKFILL_ACTION = 'co2.backfilled';

/**
 * Give old repairs the kind of thing they were. The same one-off pass as
 * the old Docker edition's db/migrate.ts, for repairs imported from a Docker hub that
 * was older than the CO2 feature. See that file for the reasoning.
 */
async function backfillCo2Types(db: D1Database): Promise<void> {
  const done = await db.prepare('SELECT 1 FROM audit_log WHERE action = ? LIMIT 1').bind(CO2_BACKFILL_ACTION).first();
  if (done) return;

  const untyped =
    (
      await db
        .prepare(
          `SELECT rj.id, rj.item_description, rj.item_brand, sc.name AS category
           FROM repair_jobs rj
           LEFT JOIN skill_categories sc ON sc.id = rj.item_category_id
           WHERE rj.co2_factor_id IS NULL`,
        )
        .all<{ id: string; item_description: string | null; item_brand: string | null; category: string | null }>()
    ).results ?? [];

  const factors =
    (await db.prepare('SELECT id, key, co2e_kg FROM co2_factors').all<{ id: string; key: string; co2e_kg: number | null }>())
      .results ?? [];
  const byKey = new Map(factors.map((f) => [f.key, f]));

  const cafe = await db
    .prepare('SELECT co2_enabled, co2_displacement_rate FROM cafes LIMIT 1')
    .first<{ co2_enabled: number; co2_displacement_rate: number }>();
  const enabled = cafe ? cafe.co2_enabled !== 0 : true;
  const rawRate = Number(cafe?.co2_displacement_rate ?? 0.5);
  const rate = Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 1 ? rawRate : 0.5;

  const updates: D1PreparedStatement[] = [];
  let typed = 0;
  let recalculated = 0;
  for (const job of untyped) {
    const key = matchCo2FactorKey({
      itemDescription: job.item_description,
      itemBrand: job.item_brand,
      categoryName: job.category,
    });
    if (!key) continue;
    const factor = byKey.get(key);
    if (!factor) continue;
    const preUse = factor.co2e_kg === null ? null : Number(factor.co2e_kg);
    if (enabled && preUse !== null && Number.isFinite(preUse) && preUse > 0) {
      const saving = Math.round(preUse * rate * 1000) / 1000;
      updates.push(
        db
          .prepare(
            `UPDATE repair_jobs SET co2_factor_id = ?, co2_saving_kg = ?, co2_saving_source = 'calculated' WHERE id = ?`,
          )
          .bind(factor.id, saving, job.id),
      );
      recalculated++;
    } else {
      updates.push(db.prepare('UPDATE repair_jobs SET co2_factor_id = ? WHERE id = ?').bind(factor.id, job.id));
    }
    typed++;
  }

  updates.push(
    db
      .prepare(
        `INSERT INTO audit_log (actor_id, actor_type, action, entity_type, metadata, created_at)
         VALUES (NULL, 'system', ?, 'repair_job', ?, ?)`,
      )
      .bind(
        CO2_BACKFILL_ACTION,
        JSON.stringify({ considered: untyped.length, typed, recalculated, skipped: untyped.length - typed }),
        Date.now(),
      ),
  );
  // D1 batches have a size limit, so go in groups.
  for (let i = 0; i < updates.length; i += 50) {
    await db.batch(updates.slice(i, i + 50));
  }
}

let ready: Promise<void> | null = null;

/** Bring the database up to date, once per Worker instance. */
export function ensureDatabase(): Promise<void> {
  ready ??= (async () => {
    const db = bindings().DB;
    await runMigrations(db);
    await seed(db);
  })().catch((err) => {
    // Try again on the next request rather than failing for ever.
    ready = null;
    throw err;
  });
  return ready;
}

/** For tests and imports: forget that the database was checked. */
export function resetDatabaseCheck(): void {
  ready = null;
}
