// Two optional details a cafe can record at check-in.
//
// weight_kg is how heavy the item is. Some cafes weigh what comes in so they
// can report the mass of goods kept out of waste, which funders and local
// authorities ask for.
//
// is_first_visit says whether this is the visitor's first time with the cafe,
// so a cafe can tell new visitors from returning ones.
//
// Both are nullable: older hubs are unaffected, and a cafe that does not want
// them simply leaves them empty. Nothing else reads them unless it is filled
// in.
export default `ALTER TABLE repair_jobs ADD COLUMN weight_kg REAL;
ALTER TABLE repair_jobs ADD COLUMN is_first_visit INTEGER;`;
