// Lets a volunteer say whether one pre-registered item is electrical, before
// the day. Empty means "use the category", as on a repair. The value moves to
// the repair when the item is checked in.
export default `ALTER TABLE pre_registrations ADD COLUMN is_electrical INTEGER;`;
