// Asking admins which repaircafe.org listing is their cafe's own.
//
// listing_prompted_version: the hub version at which we last asked. The admin
// dashboard asks once per version, like the question about sharing numbers,
// and only while no listing is linked.
// listing_not_listed: the admin told us the cafe is not on repaircafe.org, so
// we stop asking. They can still link a listing later under Settings.
export default `ALTER TABLE cafes ADD COLUMN listing_prompted_version TEXT;
ALTER TABLE cafes ADD COLUMN listing_not_listed INTEGER NOT NULL DEFAULT 0;`;
