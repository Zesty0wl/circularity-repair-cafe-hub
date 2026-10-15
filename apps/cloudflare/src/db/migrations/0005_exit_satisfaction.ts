// Whether the visitor was satisfied, recorded when they collect the item.
//
// Some cafes ask at the exit and mark the job "satisfied" or "not satisfied",
// with an optional comment. Both columns are nullable: older hubs are
// unaffected, and a cafe that does not ask leaves them empty. Nothing reads
// them unless they are filled in.
export default `ALTER TABLE repair_jobs ADD COLUMN satisfaction TEXT;
ALTER TABLE repair_jobs ADD COLUMN satisfaction_comment TEXT;`;
