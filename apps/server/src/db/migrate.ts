import type { PoolClient } from 'pg';
import { pool } from './index.js';
import { CO2_FACTORS } from './co2Factors.js';
import { matchCo2FactorKey } from './co2Match.js';

/**
 * Idempotent migration runner. We avoid drizzle-kit at runtime and just
 * apply DDL ourselves. Each statement is wrapped in IF NOT EXISTS where
 * possible. Enums are created defensively.
 */
const STATEMENTS: string[] = [
  'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',

  `DO $$ BEGIN
     CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'repairer');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN
     CREATE TYPE repair_status AS ENUM ('waiting', 'in_progress', 'completed', 'cannot_repair', 'returned');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN
     CREATE TYPE event_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN
     CREATE TYPE image_stage AS ENUM ('check_in', 'during_repair', 'completed');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,

  `CREATE TABLE IF NOT EXISTS cafes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '',
    tagline TEXT,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    website_url TEXT,
    public_url TEXT NOT NULL DEFAULT '',
    contact_email TEXT,
    address TEXT,
    social_links JSONB NOT NULL DEFAULT '{}',
    setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
    allow_skip_photo BOOLEAN NOT NULL DEFAULT TRUE,
    enable_contact_field BOOLEAN NOT NULL DEFAULT TRUE,
    data_retention_days INT NOT NULL DEFAULT 365,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'repairer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    show_on_public_page BOOLEAN NOT NULL DEFAULT TRUE,
    skills TEXT[] NOT NULL DEFAULT '{}',
    join_date DATE,
    repair_count_cache INT NOT NULL DEFAULT 0,
    notification_preferences JSONB NOT NULL DEFAULT '{}',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS skill_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'wrench',
    colour TEXT NOT NULL DEFAULT '#1B6B5A',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
  )`,

  `CREATE TABLE IF NOT EXISTS venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    postcode TEXT,
    what3words TEXT,
    map_url TEXT,
    notes TEXT,
    is_home_venue BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS event_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    venue_id UUID NOT NULL REFERENCES venues(id),
    description TEXT,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    recurrence_rule JSONB NOT NULL,
    recurrence_end_date DATE,
    max_items_per_session INT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES event_templates(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    venue_id UUID NOT NULL REFERENCES venues(id),
    description TEXT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status event_status NOT NULL DEFAULT 'scheduled',
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_template_override BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    qr_code_url TEXT,
    check_in_token TEXT UNIQUE,
    max_items INT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)',
  'CREATE INDEX IF NOT EXISTS idx_events_check_in_token ON events(check_in_token)',
  'CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)',

  `CREATE TABLE IF NOT EXISTS repairer_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT repairer_events_event_user UNIQUE (event_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS repair_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    job_number TEXT NOT NULL UNIQUE,
    customer_name TEXT,
    customer_contact TEXT,
    item_description TEXT NOT NULL,
    item_category_id UUID REFERENCES skill_categories(id),
    item_brand TEXT,
    fault_description TEXT NOT NULL,
    status repair_status NOT NULL DEFAULT 'waiting',
    repairer_id UUID REFERENCES users(id),
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    outcome_notes TEXT,
    parts_used TEXT,
    environmental_saving_kg NUMERIC(8,3),
    gdpr_consent BOOLEAN NOT NULL DEFAULT FALSE,
    data_retention_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_repair_jobs_event_id ON repair_jobs(event_id)',
  'CREATE INDEX IF NOT EXISTS idx_repair_jobs_status ON repair_jobs(status)',
  'CREATE INDEX IF NOT EXISTS idx_repair_jobs_repairer_id ON repair_jobs(repairer_id)',
  'CREATE INDEX IF NOT EXISTS idx_repair_jobs_created_at ON repair_jobs(created_at)',

  `CREATE TABLE IF NOT EXISTS repair_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_job_id UUID NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_size_bytes INT,
    mime_type TEXT,
    stage image_stage NOT NULL DEFAULT 'check_in',
    taken_by UUID REFERENCES users(id),
    caption TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID,
    actor_type TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)',

  // ── Editable home-page content & gallery (additive, idempotent) ──
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS home_page JSONB NOT NULL DEFAULT '{}'`,

  `CREATE TABLE IF NOT EXISTS cafe_gallery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL,
    caption TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cafe_gallery_sort_order ON cafe_gallery(sort_order)',

  // ── SEO / analytics / favicon (additive, idempotent) ─────────────
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS favicon_url TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS seo_title TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS seo_description TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS og_image_url TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS plausible_domain TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS plausible_src TEXT`,

  // ── Customer self-service tracking token (additive, idempotent) ──
  // Groups all of one customer's items at an event so they can track them via
  // a single shareable link (`/track/<token>`).
  `ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS customer_token TEXT`,
  'CREATE INDEX IF NOT EXISTS idx_repair_jobs_customer_token ON repair_jobs(customer_token)',

  // ── Richer venue contact info for the public Contact page (additive) ──
  `ALTER TABLE venues ADD COLUMN IF NOT EXISTS directions TEXT`,
  `ALTER TABLE venues ADD COLUMN IF NOT EXISTS parking_info TEXT`,
  `ALTER TABLE venues ADD COLUMN IF NOT EXISTS accessibility_info TEXT`,

  // ── Per-repairer "feature on home page" toggle (additive, idempotent) ──
  // Lets admins curate which volunteers appear in the home page "Meet our
  // team" strip independently from the wider Skills & Team listing.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS show_on_home_page BOOLEAN NOT NULL DEFAULT TRUE`,

  // ── Brand primary colour for the public site (additive, idempotent) ──
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS primary_color TEXT`,

  // ── Accent (call-to-action) colour + typeface choices (additive) ──
  // Let a cafe theme its buttons separately from its brand/text colour and
  // pick a display + body typeface. All optional; null falls back to the
  // Circularity defaults baked into the web app.
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS accent_color TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS heading_font TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS body_font TEXT`,

  // ── Optional donate link shown on guest receipt + tracker pages ──
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS donate_url TEXT`,

  // ── This cafe's own listing on repaircafe.org (additive, idempotent) ──
  // Just the slug from the cafe's page URL, e.g. "repair-cafe-hattem" from
  // https://www.repaircafe.org/cafe/repair-cafe-hattem. The world map page
  // uses it to pick our own pin out of the worldwide directory.
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS repaircafe_slug TEXT`,

  // ── Neighbouring cafes we know and support (additive, idempotent) ──
  // Just the repaircafe.org slugs. Everything shown about them is read from
  // the directory when a page is drawn, so nothing here can go stale.
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS local_cafe_slugs TEXT[] NOT NULL DEFAULT '{}'`,

  // ── Telemetry (additive, idempotent) ──────────────────────────────
  // Starts at 'none' on purpose. An install that upgrades into this sends
  // nothing until somebody has been asked and has said yes.
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS telemetry_level TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS telemetry_install_id UUID`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS telemetry_token TEXT`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS telemetry_last_sent_at TIMESTAMPTZ`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS telemetry_decided_at TIMESTAMPTZ`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS telemetry_prompted_version TEXT`,
  // Generated once and then left alone. It identifies this install to the
  // collector and nothing else: it is not derived from anything about the cafe.
  `UPDATE cafes SET telemetry_install_id = gen_random_uuid() WHERE telemetry_install_id IS NULL`,

  // ── "Awaiting return": the repair is paused because the visitor is coming
  //    back with a part at a later session. Not finished, so it stays open.
  //    ADD VALUE is safe here because runMigrations applies each statement on
  //    its own (no surrounding transaction).
  `ALTER TYPE repair_status ADD VALUE IF NOT EXISTS 'awaiting_return'`,

  // ── Event galleries (additive, idempotent) ───────────────────────
  // Photos of a session itself, uploaded by repairers and admins from a phone
  // or a laptop. Published by default, because someone chose to add them.
  `CREATE TABLE IF NOT EXISTS event_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_size_bytes INT,
    mime_type TEXT,
    caption TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    show_on_home BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images(event_id)',
  'CREATE INDEX IF NOT EXISTS idx_event_images_sort_order ON event_images(sort_order)',

  // Repair photos are of a visitor's belongings, so they stay private until an
  // admin picks them out for the event gallery. Both flags default to false.
  `ALTER TABLE repair_images ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE repair_images ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT FALSE`,
  'CREATE INDEX IF NOT EXISTS idx_repair_images_repair_job_id ON repair_images(repair_job_id)',

  // ── Working out the CO2 figure (additive, idempotent) ─────────────
  // Reference data for what it costs the planet to make the things people
  // bring in, so the saving is looked up rather than guessed. See
  // db/co2Factors.ts for where the numbers come from.
  `CREATE TABLE IF NOT EXISTS co2_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    group_label TEXT NOT NULL,
    category TEXT NOT NULL,
    weight_kg NUMERIC(8,3),
    co2e_kg NUMERIC(8,2),
    sample INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS idx_co2_factors_category ON co2_factors(category)',

  // What kind of thing this was, and what that works out to. The figure is
  // stored rather than worked out on the way past: if the reference data is
  // updated later, totals a cafe has already published must not move.
  `ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS co2_factor_id UUID REFERENCES co2_factors(id) ON DELETE SET NULL`,
  `ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS co2_saving_kg NUMERIC(8,3)`,
  // 'calculated' from the reference data, 'manual' where somebody typed a
  // number in, 'none' where there is no figure. Older repairs carry whatever a
  // repairer typed, so they start as 'manual' and are not relabelled.
  `ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS co2_saving_source TEXT`,
  `UPDATE repair_jobs SET co2_saving_source = 'manual', co2_saving_kg = environmental_saving_kg
     WHERE co2_saving_source IS NULL AND environmental_saving_kg IS NOT NULL`,
  `UPDATE repair_jobs SET co2_saving_source = 'none'
     WHERE co2_saving_source IS NULL`,

  // How much of a new purchase a repair is taken to prevent. The Restart
  // Project's figure is 0.5: a repaired thing lives about half as long again,
  // so it displaces half a new one. Kept as a setting so it is visible, and so
  // a cafe can be more cautious.
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS co2_displacement_rate NUMERIC(4,3) NOT NULL DEFAULT 0.5`,
  `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS co2_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
];

const DEFAULT_CATEGORIES: Array<{ name: string; icon: string; colour: string }> = [
  { name: 'Electronics', icon: 'cpu', colour: '#0ea5e9' },
  { name: 'Small appliances', icon: 'plug', colour: '#f97316' },
  { name: 'Clothing & textiles', icon: 'shirt', colour: '#ec4899' },
  { name: 'Bicycles', icon: 'bike', colour: '#22c55e' },
  { name: 'Furniture & wood', icon: 'armchair', colour: '#a16207' },
  { name: 'Toys', icon: 'toy-brick', colour: '#eab308' },
  { name: 'Tools', icon: 'wrench', colour: '#6366f1' },
  { name: 'Jewellery', icon: 'gem', colour: '#8b5cf6' },
  { name: 'Books & paper', icon: 'book-open', colour: '#0d9488' },
  { name: 'Other', icon: 'help-circle', colour: '#64748b' },
];

/**
 * Default editable home-page content seeded on first run.
 * Admins can edit any of these fields under Admin → Settings → Home page.
 */
const DEFAULT_HOME_PAGE = {
  intro: {
    heading: 'What & Who',
    body:
      'We are a volunteer-powered Repair Cafe designed to help our community ' +
      'repair, reuse, and recycle. Bring along your broken or damaged item (small ' +
      'electronics, clothing, bikes, furniture, toys) and our skilled volunteers ' +
      'will do their best to fix it with you, for free.\n\n' +
      'It is also a great place to meet, drink tea, and learn a few repair skills. ' +
      'New volunteer repairers are always welcome.',
  },
  howItWorks: [
    { title: 'Bring it along', body: 'Turn up at one of our sessions with your broken item.' },
    { title: 'Check it in', body: 'A volunteer will sign your item in and add it to the queue.' },
    { title: 'Repair together', body: 'Our repairers work with you to diagnose and fix it.' },
    { title: 'Take it home', body: 'You leave with a working item, fewer things in landfill, and new skills.' },
  ],
  whatToBring: {
    heading: 'What to bring',
    body:
      '• The item you want repaired (and any unusual cables, batteries, or parts)\n' +
      '• Any tools or attachments specific to it\n' +
      '• Your patience. Repairs take time, and we work alongside you, not for you',
  },
  faqs: [
    {
      q: 'How much does it cost?',
      a: 'Nothing! Repairs are free. Donations to cover hall hire and consumables are very welcome.',
    },
    {
      q: 'Will you guarantee the repair?',
      a: 'No. We do our best, but repairs are carried out by volunteers and we can\'t offer a warranty. We\'ll always be honest about what we can and can\'t fix.',
    },
    {
      q: 'Can you fix anything?',
      a: 'We try! Some things are too hazardous (microwaves, anything with a sealed gas system) or genuinely beyond economic repair, but we\'ll always have a look.',
    },
  ],
};

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const sql of STATEMENTS) {
      await client.query(sql);
    }
    // Ensure singleton cafe row
    const cafeCount = await client.query<{ count: string }>('SELECT COUNT(*)::text as count FROM cafes');
    if (Number(cafeCount.rows[0]?.count ?? '0') === 0) {
      await client.query(`INSERT INTO cafes (name) VALUES ('')`);
    }
    // Backfill default home_page JSON for existing rows that haven't been customised yet.
    // Stored as a single jsonb blob so admins can extend without schema changes.
    await client.query(
      `UPDATE cafes SET home_page = $1::jsonb WHERE home_page IS NULL OR home_page = '{}'::jsonb`,
      [JSON.stringify(DEFAULT_HOME_PAGE)],
    );
    // Seed default skill categories if empty
    const skillCount = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM skill_categories'
    );
    if (Number(skillCount.rows[0]?.count ?? '0') === 0) {
      let order = 0;
      for (const cat of DEFAULT_CATEGORIES) {
        await client.query(
          `INSERT INTO skill_categories (name, icon, colour, sort_order) VALUES ($1, $2, $3, $4)`,
          [cat.name, cat.icon, cat.colour, order++]
        );
      }
    }

    // Reference data for the CO2 figure. Written on every start rather than
    // only when empty, so a corrected number reaches existing installs. `key`
    // is what an entry is matched on, and `is_active` is left alone because a
    // cafe may have hidden the kinds of thing it never sees.
    let factorOrder = 0;
    for (const factor of CO2_FACTORS) {
      await client.query(
        `INSERT INTO co2_factors (key, label, group_label, category, weight_kg, co2e_kg, sample, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (key) DO UPDATE SET
           label = EXCLUDED.label,
           group_label = EXCLUDED.group_label,
           category = EXCLUDED.category,
           weight_kg = EXCLUDED.weight_kg,
           co2e_kg = EXCLUDED.co2e_kg,
           sample = EXCLUDED.sample,
           sort_order = EXCLUDED.sort_order`,
        [
          factor.key,
          factor.label,
          factor.groupLabel,
          factor.category,
          factor.weightKg,
          factor.co2eKg,
          factor.sample,
          factorOrder++,
        ],
      );
    }

    await backfillCo2Types(client);
  } finally {
    client.release();
  }
}

/** The audit entry that records the one-off pass, so it cannot run twice. */
const CO2_BACKFILL_ACTION = 'co2.backfilled';

/**
 * Give old repairs the kind of thing they were.
 *
 * Repairs recorded before we asked "what kind of thing is it?" carry a number
 * a volunteer typed from memory at a busy table. This reads what was written
 * down (the description, the brand, the skill category) and, where that is
 * clear enough, records the type and replaces the guess with the looked-up
 * figure. See db/co2Match.ts for how a type is worked out.
 *
 * Three things keep it safe:
 *
 *  - It runs once. After the first pass an audit entry says so, and later
 *    starts skip it, so a number a repairer types in from now on is never
 *    quietly overwritten.
 *  - It only touches repairs with no type at all.
 *  - It never invents a figure. Where the type cannot be worked out, or that
 *    type has no CO2e data behind it, the repair keeps exactly what it had.
 *
 * Nothing is lost either way: the original typed-in number stays in
 * `environmental_saving_kg`, which this never writes to.
 */
async function backfillCo2Types(client: PoolClient): Promise<void> {
  const done = await client.query(
    `SELECT 1 FROM audit_log WHERE action = $1 LIMIT 1`,
    [CO2_BACKFILL_ACTION],
  );
  if ((done.rowCount ?? 0) > 0) return;

  const untyped = await client.query<{
    id: string;
    item_description: string | null;
    item_brand: string | null;
    category: string | null;
  }>(`
    SELECT rj.id, rj.item_description, rj.item_brand, sc.name AS category
    FROM repair_jobs rj
    LEFT JOIN skill_categories sc ON sc.id = rj.item_category_id
    WHERE rj.co2_factor_id IS NULL
  `);

  const factors = await client.query<{ id: string; key: string; co2e_kg: string | null }>(
    `SELECT id, key, co2e_kg FROM co2_factors`,
  );
  const byKey = new Map(factors.rows.map((f) => [f.key, f]));

  const cafe = await client.query<{ co2_enabled: boolean; co2_displacement_rate: string }>(
    `SELECT co2_enabled, co2_displacement_rate FROM cafes LIMIT 1`,
  );
  const enabled = cafe.rows[0]?.co2_enabled ?? true;
  const rawRate = Number(cafe.rows[0]?.co2_displacement_rate ?? 0.5);
  const rate = Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 1 ? rawRate : 0.5;

  let typed = 0;
  let recalculated = 0;
  for (const job of untyped.rows) {
    const key = matchCo2FactorKey({
      itemDescription: job.item_description,
      itemBrand: job.item_brand,
      categoryName: job.category,
    });
    if (!key) continue;
    const factor = byKey.get(key);
    if (!factor) continue;

    const preUse = factor.co2e_kg === null ? null : Number(factor.co2e_kg);
    const canCalculate = enabled && preUse !== null && Number.isFinite(preUse) && preUse > 0;
    if (canCalculate) {
      // Same sum as services/co2.ts, to three decimal places, which is what
      // the column holds and as much precision as an average deserves.
      const saving = Math.round(preUse * rate * 1000) / 1000;
      await client.query(
        `UPDATE repair_jobs
           SET co2_factor_id = $1, co2_saving_kg = $2, co2_saving_source = 'calculated'
         WHERE id = $3`,
        [factor.id, saving, job.id],
      );
      recalculated++;
    } else {
      // The type is worth recording even with no CO2e figure behind it, so
      // the history is complete if the reference data grows later.
      await client.query(`UPDATE repair_jobs SET co2_factor_id = $1 WHERE id = $2`, [factor.id, job.id]);
    }
    typed++;
  }

  // Written even when there was nothing to do. On a new install this closes
  // the door straight away, so the pass can never wake up months later and
  // rewrite a figure a repairer typed in by hand.
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_type, action, entity_type, metadata)
     VALUES (NULL, 'system', $1, 'repair_job', $2::jsonb)`,
    [
      CO2_BACKFILL_ACTION,
      JSON.stringify({
        considered: untyped.rowCount ?? 0,
        typed,
        recalculated,
        skipped: (untyped.rowCount ?? 0) - typed,
      }),
    ],
  );
  if ((untyped.rowCount ?? 0) > 0) {
    console.log(
      `[migrate] CO2 backfill: looked at ${untyped.rowCount} untyped repairs, ` +
        `named ${typed}, recalculated ${recalculated}. The rest keep the figure they had.`,
    );
  }
}
