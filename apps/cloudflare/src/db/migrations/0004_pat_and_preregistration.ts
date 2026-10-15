// PAT testing and pre-registration. Both are switched off until an admin
// turns them on, so an updated hub behaves exactly as it did before.
//
// PAT testing: a category can be marked as electrical, and each repair keeps
// its own PAT result, when it was recorded and who recorded it. A repair's
// is_electrical is empty unless a repairer changed it, and empty means "use
// the category". The two default categories that are nearly always mains
// powered start ticked. That changes nothing while PAT testing is off.
//
// Pre-registration: a visitor can tell us about an item before the session.
// It waits in pre_registrations, where a repairer can take it and make notes.
// A real repair (repair_jobs) is only made when the item is checked in on the
// day, so the queue, the figures and the live board never see items that have
// not arrived.
export default `ALTER TABLE cafes ADD COLUMN pat_testing_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cafes ADD COLUMN pre_registration_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skill_categories ADD COLUMN is_electrical INTEGER NOT NULL DEFAULT 0;
UPDATE skill_categories SET is_electrical = 1 WHERE name IN ('Electronics', 'Small appliances');
ALTER TABLE repair_jobs ADD COLUMN is_electrical INTEGER;
ALTER TABLE repair_jobs ADD COLUMN pat_result TEXT;
ALTER TABLE repair_jobs ADD COLUMN pat_tested_at INTEGER;
ALTER TABLE repair_jobs ADD COLUMN pat_tested_by TEXT;
ALTER TABLE repair_jobs ADD COLUMN pat_notes TEXT;
CREATE TABLE IF NOT EXISTS pre_registrations (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_contact TEXT,
  customer_token TEXT NOT NULL,
  item_description TEXT NOT NULL,
  item_category_id TEXT REFERENCES skill_categories(id),
  co2_factor_id TEXT REFERENCES co2_factors(id) ON DELETE SET NULL,
  item_brand TEXT,
  fault_description TEXT NOT NULL,
  gdpr_consent INTEGER NOT NULL DEFAULT 0,
  data_retention_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  repairer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  claimed_at INTEGER,
  research_notes TEXT,
  repair_job_id TEXT REFERENCES repair_jobs(id) ON DELETE SET NULL,
  checked_in_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_pre_registrations_event_id ON pre_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_pre_registrations_customer_token ON pre_registrations(customer_token);
CREATE INDEX IF NOT EXISTS idx_pre_registrations_repairer_id ON pre_registrations(repairer_id);
CREATE INDEX IF NOT EXISTS idx_pre_registrations_status ON pre_registrations(status);`;
