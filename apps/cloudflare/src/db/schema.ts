// =============================================================================
//  The database schema, for D1 (SQLite)
//  ---------------------------------------------------------------------------
//  This is the old Docker edition's schema, moved from Postgres to SQLite. Every
//  table, column name and property name is the same, so code ported from the
//  Docker edition reads the same rows in the same shape.
//
//  SQLite has fewer types than Postgres, so a few are stored differently. The
//  column helpers below turn them back into what the Postgres driver returned,
//  so the API sends exactly the same JSON as before:
//
//    Postgres            stored here as             read back as
//    uuid                text                       string
//    timestamptz         integer (milliseconds)     Date
//    date, time          text                       'YYYY-MM-DD', 'HH:MM:SS'
//    numeric(p, s)       real                       string with s decimals, e.g. '0.500'
//    jsonb               text                       object
//    text[]              text (a JSON array)        string[]
//    boolean             integer 0 or 1             boolean
//    enum                text                       string
//
//  The tables themselves are created by the SQL files in ./migrations. A test
//  checks that every column here exists there.
// =============================================================================
import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

// ── Column helpers ───────────────────────────────────────────────────────────

const uuid = (name: string) => text(name);

/** A new random id, made by the Worker when a row is inserted through Drizzle. */
const newId = () => crypto.randomUUID();

/** Milliseconds since 1970, read back as a Date. */
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

const bool = (name: string) => integer(name, { mode: 'boolean' });

/**
 * A Postgres numeric. Postgres hands these back as strings with a fixed number
 * of decimals ('0.500'), and the API has always passed them on that way, so we
 * do the same.
 */
const numeric = (name: string, scale: number) =>
  customType<{ data: string; driverData: number | null }>({
    dataType: () => 'real',
    toDriver: (value) => (value === null || value === undefined || value === '' ? null : Number(value)),
    fromDriver: (value) => (value === null || value === undefined ? (null as unknown as string) : Number(value).toFixed(scale)),
  })(name);

/** A Postgres text[] array, kept as a JSON array. */
const textArray = (name: string) =>
  customType<{ data: string[]; driverData: string }>({
    dataType: () => 'text',
    toDriver: (value) => JSON.stringify(value ?? []),
    fromDriver: (value) => {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    },
  })(name);

/**
 * A Postgres time. Postgres always gave 'HH:MM:SS', even when it was sent
 * 'HH:MM', and some pages compare times as text, so we store the full form.
 */
const time = (name: string) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => 'text',
    toDriver: (value) => normaliseTime(value),
    fromDriver: (value) => value,
  })(name);

export function normaliseTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value ?? '').trim());
  if (!match) return String(value);
  return `${match[1]!.padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}`;
}

const date = (name: string) => text(name);

const json = <T = unknown>(name: string) => text(name, { mode: 'json' }).$type<T>();

// ── Enums ────────────────────────────────────────────────────────────────────

export const USER_ROLES = ['super_admin', 'admin', 'repairer'] as const;
export const REPAIR_STATUSES = [
  'waiting',
  'in_progress',
  'completed',
  'cannot_repair',
  'awaiting_return',
  'returned',
] as const;
export const EVENT_STATUSES = ['scheduled', 'active', 'completed', 'cancelled'] as const;
export const IMAGE_STAGES = ['check_in', 'during_repair', 'completed'] as const;

// ── Tables ───────────────────────────────────────────────────────────────────

export const cafes = sqliteTable('cafes', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  name: text('name').notNull().default(''),
  tagline: text('tagline'),
  description: text('description'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  websiteUrl: text('website_url'),
  publicUrl: text('public_url').notNull().default(''),
  primaryColor: text('primary_color'),
  accentColor: text('accent_color'),
  headingFont: text('heading_font'),
  bodyFont: text('body_font'),
  donateUrl: text('donate_url'),
  contactEmail: text('contact_email'),
  address: text('address'),
  socialLinks: json('social_links').notNull().default({}),
  homePage: json('home_page').notNull().default({}),
  faviconUrl: text('favicon_url'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  ogImageUrl: text('og_image_url'),
  plausibleDomain: text('plausible_domain'),
  plausibleSrc: text('plausible_src'),
  cartoApiKey: text('carto_api_key'),
  /** The secret part of the waiting-room display link. See routes/display.ts. */
  displayToken: text('display_token'),
  repaircafeSlug: text('repaircafe_slug'),
  localCafeSlugs: textArray('local_cafe_slugs').notNull().default([]),
  telemetryLevel: text('telemetry_level').notNull().default('none'),
  telemetryInstallId: uuid('telemetry_install_id'),
  telemetryToken: text('telemetry_token'),
  telemetryLastSentAt: timestamp('telemetry_last_sent_at'),
  telemetryDecidedAt: timestamp('telemetry_decided_at'),
  telemetryPromptedVersion: text('telemetry_prompted_version'),
  telemetryVerified: bool('telemetry_verified'),
  telemetryVerifyReason: text('telemetry_verify_reason'),
  co2DisplacementRate: numeric('co2_displacement_rate', 3).notNull().default('0.5'),
  co2Enabled: bool('co2_enabled').notNull().default(true),
  linuxEnabled: bool('linux_enabled').notNull().default(false),
  linuxPage: json('linux_page').notNull().default({}),
  setupCompleted: bool('setup_completed').notNull().default(false),
  allowSkipPhoto: bool('allow_skip_photo').notNull().default(true),
  enableContactField: bool('enable_contact_field').notNull().default(true),
  dataRetentionDays: integer('data_retention_days').notNull().default(365),
  createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
});

export const cafeGallery = sqliteTable(
  'cafe_gallery',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    filePath: text('file_path').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [index('idx_cafe_gallery_sort_order').on(t.sortOrder)],
);

export const users = sqliteTable('users', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: USER_ROLES }).notNull().default('repairer'),
  isActive: bool('is_active').notNull().default(true),
  showOnPublicPage: bool('show_on_public_page').notNull().default(true),
  showOnHomePage: bool('show_on_home_page').notNull().default(true),
  skills: textArray('skills').notNull().default([]),
  linuxRepairer: bool('linux_repairer').notNull().default(false),
  joinDate: date('join_date'),
  repairCountCache: integer('repair_count_cache').notNull().default(0),
  notificationPreferences: json('notification_preferences').notNull().default({}),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
});

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
});

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
});

export const skillCategories = sqliteTable('skill_categories', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('wrench'),
  colour: text('colour').notNull().default('#1B6B5A'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: bool('is_active').notNull().default(true),
});

export const co2Factors = sqliteTable(
  'co2_factors',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    groupLabel: text('group_label').notNull(),
    category: text('category').notNull(),
    weightKg: numeric('weight_kg', 3),
    co2eKg: numeric('co2e_kg', 2),
    sample: integer('sample').notNull().default(0),
    isActive: bool('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('idx_co2_factors_category').on(t.category)],
);

export const venues = sqliteTable('venues', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  name: text('name').notNull(),
  address: text('address'),
  postcode: text('postcode'),
  what3words: text('what3words'),
  mapUrl: text('map_url'),
  directions: text('directions'),
  parkingInfo: text('parking_info'),
  accessibilityInfo: text('accessibility_info'),
  notes: text('notes'),
  isHomeVenue: bool('is_home_venue').notNull().default(false),
  isActive: bool('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
});

export const eventTemplates = sqliteTable('event_templates', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  name: text('name').notNull(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id),
  description: text('description'),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  recurrenceRule: json('recurrence_rule').notNull(),
  recurrenceEndDate: date('recurrence_end_date'),
  maxItemsPerSession: integer('max_items_per_session'),
  isPublished: bool('is_published').notNull().default(false),
  supportsLinux: bool('supports_linux').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
});

export const events = sqliteTable(
  'events',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    templateId: uuid('template_id').references(() => eventTemplates.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    description: text('description'),
    date: date('date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    status: text('status', { enum: EVENT_STATUSES }).notNull().default('scheduled'),
    isPublished: bool('is_published').notNull().default(false),
    isTemplateOverride: bool('is_template_override').notNull().default(false),
    supportsLinux: bool('supports_linux').notNull().default(false),
    notes: text('notes'),
    qrCodeUrl: text('qr_code_url'),
    checkInToken: text('check_in_token').unique(),
    maxItems: integer('max_items'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('idx_events_date').on(t.date),
    index('idx_events_check_in_token').on(t.checkInToken),
    index('idx_events_status').on(t.status),
  ],
);

export const repairerEvents = sqliteTable(
  'repairer_events',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    confirmed: bool('confirmed').notNull().default(false),
  },
  (t) => [unique('repairer_events_event_user').on(t.eventId, t.userId)],
);

export const repairJobs = sqliteTable(
  'repair_jobs',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    jobNumber: text('job_number').notNull().unique(),
    customerName: text('customer_name'),
    customerContact: text('customer_contact'),
    customerToken: text('customer_token'),
    itemDescription: text('item_description').notNull(),
    itemCategoryId: uuid('item_category_id').references(() => skillCategories.id),
    itemBrand: text('item_brand'),
    faultDescription: text('fault_description').notNull(),
    status: text('status', { enum: REPAIR_STATUSES }).notNull().default('waiting'),
    repairerId: uuid('repairer_id').references(() => users.id),
    acceptedAt: timestamp('accepted_at'),
    completedAt: timestamp('completed_at'),
    outcomeNotes: text('outcome_notes'),
    partsUsed: text('parts_used'),
    environmentalSavingKg: numeric('environmental_saving_kg', 3),
    co2FactorId: uuid('co2_factor_id'),
    co2SavingKg: numeric('co2_saving_kg', 3),
    co2SavingSource: text('co2_saving_source'),
    gdprConsent: bool('gdpr_consent').notNull().default(false),
    dataRetentionDate: date('data_retention_date'),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('idx_repair_jobs_event_id').on(t.eventId),
    index('idx_repair_jobs_status').on(t.status),
    index('idx_repair_jobs_repairer_id').on(t.repairerId),
    index('idx_repair_jobs_created_at').on(t.createdAt),
    index('idx_repair_jobs_customer_token').on(t.customerToken),
  ],
);

export const repairImages = sqliteTable(
  'repair_images',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    repairJobId: uuid('repair_job_id')
      .notNull()
      .references(() => repairJobs.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    mimeType: text('mime_type'),
    stage: text('stage', { enum: IMAGE_STAGES }).notNull().default('check_in'),
    takenBy: uuid('taken_by').references(() => users.id),
    caption: text('caption'),
    isPublished: bool('is_published').notNull().default(false),
    showOnHome: bool('show_on_home').notNull().default(false),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [index('idx_repair_images_repair_job_id').on(t.repairJobId)],
);

export const eventImages = sqliteTable(
  'event_images',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    mimeType: text('mime_type'),
    caption: text('caption'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    isPublished: bool('is_published').notNull().default(true),
    showOnHome: bool('show_on_home').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('idx_event_images_event_id').on(t.eventId),
    index('idx_event_images_sort_order').on(t.sortOrder),
  ],
);

export const linuxInstalls = sqliteTable(
  'linux_installs',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    repairerId: uuid('repairer_id').references(() => users.id, { onDelete: 'set null' }),
    deviceDescription: text('device_description').notNull(),
    deviceBrand: text('device_brand'),
    deviceType: text('device_type').notNull().default('laptop'),
    deviceAgeYears: integer('device_age_years'),
    previousOs: text('previous_os'),
    distro: text('distro'),
    outcome: text('outcome').notNull().default('installed'),
    customerName: text('customer_name'),
    customerContact: text('customer_contact'),
    gdprConsent: bool('gdpr_consent').notNull().default(false),
    dataRetentionDate: date('data_retention_date'),
    notes: text('notes'),
    co2FactorId: uuid('co2_factor_id').references(() => co2Factors.id, { onDelete: 'set null' }),
    co2SavingKg: numeric('co2_saving_kg', 3),
    co2SavingSource: text('co2_saving_source'),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('idx_linux_installs_event_id').on(t.eventId),
    index('idx_linux_installs_repairer_id').on(t.repairerId),
    index('idx_linux_installs_created_at').on(t.createdAt),
    index('idx_linux_installs_outcome').on(t.outcome),
  ],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorId: uuid('actor_id'),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    metadata: json<Record<string, unknown>>('metadata').notNull().default({}),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('idx_audit_log_entity').on(t.entityType, t.entityId),
    index('idx_audit_log_created_at').on(t.createdAt),
  ],
);

// ── Tables only the Cloudflare edition has ───────────────────────────────────

/**
 * Small values the hub keeps for itself: the login signing key when no
 * SECRET_KEY was set, and cached answers from GitHub. One row per key.
 */
export const hubMeta = sqliteTable('hub_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
});

/** Failed sign-ins, so we can slow down anyone guessing passwords. */
export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  },
  (t) => [index('idx_login_attempts_key').on(t.key, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Cafe = typeof cafes.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventTemplate = typeof eventTemplates.$inferSelect;
export type RepairJob = typeof repairJobs.$inferSelect;
export type RepairImage = typeof repairImages.$inferSelect;
export type EventImage = typeof eventImages.$inferSelect;
export type SkillCategory = typeof skillCategories.$inferSelect;
export type LinuxInstall = typeof linuxInstalls.$inferSelect;

/** Used by raw SQL to mean "now", in the milliseconds this schema stores. */
export const NOW_MS = sql`CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)`;
