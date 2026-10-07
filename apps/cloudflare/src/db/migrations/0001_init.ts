// The first migration, as plain SQL in a string. It is a .ts file because a
// Worker cannot read .sql files at run time. See ../migrate.ts for how the
// migrations run.
export default `-- The whole schema of the old Docker edition at version 1.10.0, written for SQLite.
-- See src/db/schema.ts for how each Postgres type is stored here.
--
-- Times are whole milliseconds since 1970. This expression is "now" in that
-- form, and works on every SQLite that D1 has used.

CREATE TABLE IF NOT EXISTS cafes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  tagline TEXT,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  public_url TEXT NOT NULL DEFAULT '',
  primary_color TEXT,
  accent_color TEXT,
  heading_font TEXT,
  body_font TEXT,
  donate_url TEXT,
  contact_email TEXT,
  address TEXT,
  social_links TEXT NOT NULL DEFAULT '{}',
  home_page TEXT NOT NULL DEFAULT '{}',
  favicon_url TEXT,
  seo_title TEXT,
  seo_description TEXT,
  og_image_url TEXT,
  plausible_domain TEXT,
  plausible_src TEXT,
  carto_api_key TEXT,
  repaircafe_slug TEXT,
  local_cafe_slugs TEXT NOT NULL DEFAULT '[]',
  telemetry_level TEXT NOT NULL DEFAULT 'none',
  telemetry_install_id TEXT,
  telemetry_token TEXT,
  telemetry_last_sent_at INTEGER,
  telemetry_decided_at INTEGER,
  telemetry_prompted_version TEXT,
  telemetry_verified INTEGER,
  telemetry_verify_reason TEXT,
  co2_displacement_rate REAL NOT NULL DEFAULT 0.5,
  co2_enabled INTEGER NOT NULL DEFAULT 1,
  linux_enabled INTEGER NOT NULL DEFAULT 0,
  linux_page TEXT NOT NULL DEFAULT '{}',
  setup_completed INTEGER NOT NULL DEFAULT 0,
  allow_skip_photo INTEGER NOT NULL DEFAULT 1,
  enable_contact_field INTEGER NOT NULL DEFAULT 1,
  data_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);

CREATE TABLE IF NOT EXISTS cafe_gallery (
  id TEXT PRIMARY KEY NOT NULL,
  file_path TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_cafe_gallery_sort_order ON cafe_gallery(sort_order);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'repairer',
  is_active INTEGER NOT NULL DEFAULT 1,
  show_on_public_page INTEGER NOT NULL DEFAULT 1,
  show_on_home_page INTEGER NOT NULL DEFAULT 1,
  skills TEXT NOT NULL DEFAULT '[]',
  linux_repairer INTEGER NOT NULL DEFAULT 0,
  join_date TEXT,
  repair_count_cache INTEGER NOT NULL DEFAULT 0,
  notification_preferences TEXT NOT NULL DEFAULT '{}',
  last_login_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);

CREATE TABLE IF NOT EXISTS skill_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'wrench',
  colour TEXT NOT NULL DEFAULT '#1B6B5A',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS co2_factors (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  group_label TEXT NOT NULL,
  category TEXT NOT NULL,
  weight_kg REAL,
  co2e_kg REAL,
  sample INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_co2_factors_category ON co2_factors(category);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  postcode TEXT,
  what3words TEXT,
  map_url TEXT,
  directions TEXT,
  parking_info TEXT,
  accessibility_info TEXT,
  notes TEXT,
  is_home_venue INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);

CREATE TABLE IF NOT EXISTS event_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  recurrence_rule TEXT NOT NULL,
  recurrence_end_date TEXT,
  max_items_per_session INTEGER,
  is_published INTEGER NOT NULL DEFAULT 0,
  supports_linux INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT REFERENCES event_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  description TEXT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  is_published INTEGER NOT NULL DEFAULT 0,
  is_template_override INTEGER NOT NULL DEFAULT 0,
  supports_linux INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  qr_code_url TEXT,
  check_in_token TEXT UNIQUE,
  max_items INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_check_in_token ON events(check_in_token);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE TABLE IF NOT EXISTS repairer_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirmed INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT repairer_events_event_user UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS repair_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  job_number TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  customer_contact TEXT,
  customer_token TEXT,
  item_description TEXT NOT NULL,
  item_category_id TEXT REFERENCES skill_categories(id),
  item_brand TEXT,
  fault_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  repairer_id TEXT REFERENCES users(id),
  accepted_at INTEGER,
  completed_at INTEGER,
  outcome_notes TEXT,
  parts_used TEXT,
  environmental_saving_kg REAL,
  co2_factor_id TEXT REFERENCES co2_factors(id) ON DELETE SET NULL,
  co2_saving_kg REAL,
  co2_saving_source TEXT,
  gdpr_consent INTEGER NOT NULL DEFAULT 0,
  data_retention_date TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_event_id ON repair_jobs(event_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_status ON repair_jobs(status);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_repairer_id ON repair_jobs(repairer_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_created_at ON repair_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_customer_token ON repair_jobs(customer_token);

CREATE TABLE IF NOT EXISTS repair_images (
  id TEXT PRIMARY KEY NOT NULL,
  repair_job_id TEXT NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  stage TEXT NOT NULL DEFAULT 'check_in',
  taken_by TEXT REFERENCES users(id),
  caption TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  show_on_home INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_repair_images_repair_job_id ON repair_images(repair_job_id);

CREATE TABLE IF NOT EXISTS event_images (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  caption TEXT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  show_on_home INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images(event_id);
CREATE INDEX IF NOT EXISTS idx_event_images_sort_order ON event_images(sort_order);

CREATE TABLE IF NOT EXISTS linux_installs (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  repairer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  device_description TEXT NOT NULL,
  device_brand TEXT,
  device_type TEXT NOT NULL DEFAULT 'laptop',
  device_age_years INTEGER,
  previous_os TEXT,
  distro TEXT,
  outcome TEXT NOT NULL DEFAULT 'installed',
  customer_name TEXT,
  customer_contact TEXT,
  gdpr_consent INTEGER NOT NULL DEFAULT 0,
  data_retention_date TEXT,
  notes TEXT,
  co2_factor_id TEXT REFERENCES co2_factors(id) ON DELETE SET NULL,
  co2_saving_kg REAL,
  co2_saving_source TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_linux_installs_event_id ON linux_installs(event_id);
CREATE INDEX IF NOT EXISTS idx_linux_installs_repairer_id ON linux_installs(repairer_id);
CREATE INDEX IF NOT EXISTS idx_linux_installs_created_at ON linux_installs(created_at);
CREATE INDEX IF NOT EXISTS idx_linux_installs_outcome ON linux_installs(outcome);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Only the Cloudflare edition has these two.

CREATE TABLE IF NOT EXISTS hub_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts(key, created_at);
`;
