// Past sessions added from a spreadsheet (routes/admin/history.ts). Each one
// remembers which import made it, so an import can be listed and removed in
// one go. Empty for everything recorded in the hub itself, so an updated hub
// behaves exactly as it did before.
export default `ALTER TABLE events ADD COLUMN import_id TEXT;
ALTER TABLE repair_jobs ADD COLUMN import_id TEXT;
ALTER TABLE venues ADD COLUMN import_id TEXT;
CREATE INDEX IF NOT EXISTS idx_events_import_id ON events(import_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_import_id ON repair_jobs(import_id);`;
