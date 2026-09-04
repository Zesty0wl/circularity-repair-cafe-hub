import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  time,
  integer,
  numeric,
  jsonb,
  bigserial,
  unique,
  index,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['super_admin', 'admin', 'repairer']);
export const repairStatusEnum = pgEnum('repair_status', [
  'waiting',
  'in_progress',
  'completed',
  'cannot_repair',
  'awaiting_return',
  'returned',
]);
export const eventStatusEnum = pgEnum('event_status', [
  'scheduled',
  'active',
  'completed',
  'cancelled',
]);
export const imageStageEnum = pgEnum('image_stage', ['check_in', 'during_repair', 'completed']);

export const cafes = pgTable('cafes', {
  id: uuid('id').primaryKey().defaultRandom(),
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
  socialLinks: jsonb('social_links').default({}).notNull(),
  homePage: jsonb('home_page').default({}).notNull(),
  faviconUrl: text('favicon_url'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  ogImageUrl: text('og_image_url'),
  plausibleDomain: text('plausible_domain'),
  plausibleSrc: text('plausible_src'),
  /**
   * The cafe's own key for CARTO's free map tiles, used by the map on the home
   * page and the Worldwide map. CARTO asks every site to use its own key and
   * puts a watermark on tiles fetched without one. Optional: the maps still
   * work without it, only with the watermark.
   */
  cartoApiKey: text('carto_api_key'),
  repaircafeSlug: text('repaircafe_slug'),
  /**
   * Nearby Repair Cafes this cafe knows and wants to point people at, held as
   * repaircafe.org slugs. The names, addresses and pins come from the directory
   * at render time, so a cafe that moves or renames is right on our page too.
   */
  localCafeSlugs: text('local_cafe_slugs').array().default([]).notNull(),

  // ── Telemetry ─────────────────────────────────────────────────────
  // What this cafe agreed to share with the project, and what we need to keep
  // in order to do it. Nothing is ever sent while the level is 'none'.
  //   none      nobody has said yes. Also the state before anyone was asked.
  //   standard  anonymous counts: repairs, sessions, version. No name.
  //   community | the above plus the cafe's name and roughly where it is, so
  //             | it appears on the public map.
  telemetryLevel: text('telemetry_level').notNull().default('none'),
  /** Who we are to the collector. Random, generated once, means nothing alone. */
  telemetryInstallId: uuid('telemetry_install_id'),
  /** Issued by the collector the first time we say hello. */
  telemetryToken: text('telemetry_token'),
  telemetryLastSentAt: timestamp('telemetry_last_sent_at', { withTimezone: true }),
  /** When somebody last answered the question, either way. */
  telemetryDecidedAt: timestamp('telemetry_decided_at', { withTimezone: true }),
  /**
   * The app version we last asked at. We ask again after an upgrade, and only
   * once per version, so the offer stays open without becoming nagging.
   */
  telemetryPromptedVersion: text('telemetry_prompted_version'),
  /**
   * What the collector said last time about whether it could check us. A cafe
   * whose public address is wrong would otherwise never learn why its numbers
   * are missing from the community figures.
   */
  telemetryVerified: boolean('telemetry_verified'),
  telemetryVerifyReason: text('telemetry_verify_reason'),
  // How much of a new purchase a repair is taken to prevent, and whether the
  // CO2 figure is worked out and shown at all.
  co2DisplacementRate: numeric('co2_displacement_rate', { precision: 4, scale: 3 }).notNull().default('0.5'),
  co2Enabled: boolean('co2_enabled').notNull().default(true),

  // ── Linux Repair Cafe ─────────────────────────────────────────────
  // A Linux Repair Cafe helps people move an ageing computer to Linux instead
  // of throwing it away. See https://www.repaircafe.org/en/linux-repair-cafe/.
  // Off until an admin turns it on, so a cafe that does not offer this never
  // shows a page, a menu or a card about it.
  linuxEnabled: boolean('linux_enabled').notNull().default(false),
  /**
   * The wording on the Linux page, in the same shape as `homePage`, so admins
   * can rewrite every section without a schema change. Seeded with sensible
   * copy the first time the feature is switched on.
   */
  linuxPage: jsonb('linux_page').default({}).notNull(),

  setupCompleted: boolean('setup_completed').notNull().default(false),
  allowSkipPhoto: boolean('allow_skip_photo').notNull().default(true),
  enableContactField: boolean('enable_contact_field').notNull().default(true),
  dataRetentionDays: integer('data_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cafeGallery = pgTable('cafe_gallery', {
  id: uuid('id').primaryKey().defaultRandom(),
  filePath: text('file_path').notNull(),
  caption: text('caption'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').notNull().default('repairer'),
  isActive: boolean('is_active').notNull().default(true),
  showOnPublicPage: boolean('show_on_public_page').notNull().default(true),
  showOnHomePage: boolean('show_on_home_page').notNull().default(true),
  skills: text('skills').array().default([]).notNull(),
  /**
   * This volunteer helps at Linux sessions: installing Linux, showing people
   * round it, and answering questions afterwards. Kept apart from `skills`,
   * which lists the kinds of thing a repairer mends, because helping somebody
   * move to Linux is a different job from fixing a broken item.
   */
  linuxRepairer: boolean('linux_repairer').notNull().default(false),
  joinDate: date('join_date'),
  repairCountCache: integer('repair_count_cache').notNull().default(0),
  notificationPreferences: jsonb('notification_preferences').default({}).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skillCategories = pgTable('skill_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('wrench'),
  colour: text('colour').notNull().default('#1B6B5A'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

/**
 * What it costs the planet to make the things people bring in, so the CO2
 * saving is looked up rather than guessed. Seeded from db/co2Factors.ts.
 */
export const co2Factors = pgTable('co2_factors', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  groupLabel: text('group_label').notNull(),
  /** Which of our skill categories offers this type first. */
  category: text('category').notNull(),
  weightKg: numeric('weight_kg', { precision: 8, scale: 3 }),
  /** Carbon emitted making and shipping one, before anybody uses it. */
  co2eKg: numeric('co2e_kg', { precision: 8, scale: 2 }),
  /** How many real products the average came from. Some are just one. */
  sample: integer('sample').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address'),
  postcode: text('postcode'),
  what3words: text('what3words'),
  mapUrl: text('map_url'),
  directions: text('directions'),
  parkingInfo: text('parking_info'),
  accessibilityInfo: text('accessibility_info'),
  notes: text('notes'),
  isHomeVenue: boolean('is_home_venue').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventTemplates = pgTable('event_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id),
  description: text('description'),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  recurrenceRule: jsonb('recurrence_rule').notNull(),
  recurrenceEndDate: date('recurrence_end_date'),
  maxItemsPerSession: integer('max_items_per_session'),
  isPublished: boolean('is_published').notNull().default(false),
  /** Every session made from this template offers Linux help as well. */
  supportsLinux: boolean('supports_linux').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id').references(() => eventTemplates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    description: text('description'),
    date: date('date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    status: eventStatusEnum('status').notNull().default('scheduled'),
    isPublished: boolean('is_published').notNull().default(false),
    isTemplateOverride: boolean('is_template_override').notNull().default(false),
    /**
     * People can also get help moving a computer to Linux at this session.
     * Shown on the public event listings so a visitor knows before they set
     * out, and it is what the Linux page lists as its next dates.
     */
    supportsLinux: boolean('supports_linux').notNull().default(false),
    notes: text('notes'),
    qrCodeUrl: text('qr_code_url'),
    checkInToken: text('check_in_token').unique(),
    maxItems: integer('max_items'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index('idx_events_date').on(t.date),
    tokenIdx: index('idx_events_check_in_token').on(t.checkInToken),
    statusIdx: index('idx_events_status').on(t.status),
  })
);

export const repairerEvents = pgTable(
  'repairer_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    confirmed: boolean('confirmed').notNull().default(false),
  },
  (t) => ({
    uniq: unique('repairer_events_event_user').on(t.eventId, t.userId),
  })
);

export const repairJobs = pgTable(
  'repair_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
    status: repairStatusEnum('status').notNull().default('waiting'),
    repairerId: uuid('repairer_id').references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    outcomeNotes: text('outcome_notes'),
    partsUsed: text('parts_used'),
    environmentalSavingKg: numeric('environmental_saving_kg', { precision: 8, scale: 3 }),
    // What kind of thing this was, and what that works out to in CO2e. See
    // services/co2.ts. The older environmentalSavingKg above is kept as the
    // manual override, so existing records still read.
    co2FactorId: uuid('co2_factor_id'),
    co2SavingKg: numeric('co2_saving_kg', { precision: 8, scale: 3 }),
    co2SavingSource: text('co2_saving_source'),
    gdprConsent: boolean('gdpr_consent').notNull().default(false),
    dataRetentionDate: date('data_retention_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: index('idx_repair_jobs_event_id').on(t.eventId),
    statusIdx: index('idx_repair_jobs_status').on(t.status),
    repairerIdx: index('idx_repair_jobs_repairer_id').on(t.repairerId),
    createdIdx: index('idx_repair_jobs_created_at').on(t.createdAt),
    customerTokenIdx: index('idx_repair_jobs_customer_token').on(t.customerToken),
  })
);

export const repairImages = pgTable('repair_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  repairJobId: uuid('repair_job_id')
    .notNull()
    .references(() => repairJobs.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  mimeType: text('mime_type'),
  stage: imageStageEnum('stage').notNull().default('check_in'),
  takenBy: uuid('taken_by').references(() => users.id),
  caption: text('caption'),
  // A repair photo is of someone else's belongings, so it stays private until
  // an admin chooses to show it. `isPublished` puts it in the event gallery on
  // the public site; `showOnHome` also adds it to the main photo gallery.
  isPublished: boolean('is_published').notNull().default(false),
  showOnHome: boolean('show_on_home').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Photos of a session itself: the room, the team at work, the queue, the
 * cake. Repairers and admins upload these from a phone or a laptop. They are
 * separate from `repair_images`, which are photos of a visitor's item taken
 * as part of a repair job.
 */
export const eventImages = pgTable(
  'event_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    mimeType: text('mime_type'),
    caption: text('caption'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    // Shown on the public page for this event. On by default: a volunteer who
    // adds a photo of the session means it to be seen.
    isPublished: boolean('is_published').notNull().default(true),
    // Also shown in the main photo gallery on the site. Admins only.
    showOnHome: boolean('show_on_home').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: index('idx_event_images_event_id').on(t.eventId),
    sortIdx: index('idx_event_images_sort_order').on(t.sortOrder),
  })
);

/**
 * What happened when somebody brought a computer to a Linux session.
 *
 * These are kept apart from `repair_jobs` on purpose. A repair job is about a
 * broken thing and asks "did it work again?". A Linux install is about a
 * working computer that is losing its operating system support, and asks a
 * different question: what was on it, what went on instead, and did the person
 * leave able to use it. Mixing the two would spoil both sets of figures.
 */
export const linuxInstalls = pgTable(
  'linux_installs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    /** The volunteer who did the install. Kept if they later leave the cafe. */
    repairerId: uuid('repairer_id').references(() => users.id, { onDelete: 'set null' }),
    deviceDescription: text('device_description').notNull(),
    deviceBrand: text('device_brand'),
    /** 'laptop', 'desktop', 'all_in_one' or 'other'. */
    deviceType: text('device_type').notNull().default('laptop'),
    /** Roughly how old the machine was, in years. Optional, and often a guess. */
    deviceAgeYears: integer('device_age_years'),
    /**
     * What the computer ran before: 'windows_10', 'windows_11',
     * 'windows_older', 'macos', 'chromeos', 'linux', 'none' or 'other'.
     * Windows 10 support ends in October 2027, which is why most machines
     * arrive at all, so it is worth counting them separately.
     */
    previousOs: text('previous_os'),
    /** Which Linux went on, for example "Linux Mint 22". Free text on purpose. */
    distro: text('distro'),
    /**
     * How it went:
     *   installed     Linux is now the only system on the machine.
     *   dual_boot     Linux alongside what was there before.
     *   tried_live    they ran it from a USB stick to try it, nothing installed.
     *   advice_only   we talked it through, they took the machine home as it was.
     *   not_possible  the machine could not run it, or it went wrong.
     */
    outcome: text('outcome').notNull().default('installed'),
    customerName: text('customer_name'),
    customerContact: text('customer_contact'),
    /** Whether they were happy for us to keep their details, same as a repair. */
    gdprConsent: boolean('gdpr_consent').notNull().default(false),
    dataRetentionDate: date('data_retention_date'),
    notes: text('notes'),
    // What keeping this computer in use saves, worked out the same way as a
    // repair so the two totals can be added up together. See services/co2.ts.
    co2FactorId: uuid('co2_factor_id').references(() => co2Factors.id, { onDelete: 'set null' }),
    co2SavingKg: numeric('co2_saving_kg', { precision: 8, scale: 3 }),
    co2SavingSource: text('co2_saving_source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: index('idx_linux_installs_event_id').on(t.eventId),
    repairerIdx: index('idx_linux_installs_repairer_id').on(t.repairerId),
    createdIdx: index('idx_linux_installs_created_at').on(t.createdAt),
    outcomeIdx: index('idx_linux_installs_outcome').on(t.outcome),
  })
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id'),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').default({}).notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('idx_audit_log_entity').on(t.entityType, t.entityId),
    createdIdx: index('idx_audit_log_created_at').on(t.createdAt),
  })
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
