// Switches for the optional check-in features, and the country for the Open
// Repair Data Standard (ORDS) export. Every switch starts off, so an updated
// hub behaves exactly as it did before until an admin turns a feature on.
//
// weigh_items_enabled: ask for the item's weight at check-in.
// ask_first_visit_enabled: ask whether this is the visitor's first visit.
// ask_satisfaction_enabled: ask the visitor at the exit if they are satisfied.
// card_numbers_enabled: give each visitor a numbered card for the session.
// ords_country: the cafe's country as a 3-letter code, such as GBR or FRA.
export default `ALTER TABLE cafes ADD COLUMN weigh_items_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cafes ADD COLUMN ask_first_visit_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cafes ADD COLUMN ask_satisfaction_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cafes ADD COLUMN card_numbers_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cafes ADD COLUMN ords_country TEXT;`;
