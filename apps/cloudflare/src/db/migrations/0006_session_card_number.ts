// A short number a cafe can give a job for the session, so a small reusable
// deck of numbered cards can be handed to visitors and the same number used to
// call them. Handing the card back at the exit frees the number for another
// visitor in the same session, which is why the unique index only covers the
// jobs that are still open.
//
// The number is per event, so two sessions can both use 1..N. The column is
// nullable: a cafe that does not use cards leaves it empty, and older hubs are
// unaffected.
export default `ALTER TABLE repair_jobs ADD COLUMN card_number INTEGER;
CREATE UNIQUE INDEX idx_repair_jobs_event_card_open ON repair_jobs(event_id, card_number) WHERE card_number IS NOT NULL AND status IN ('waiting', 'in_progress', 'awaiting_return');`;
