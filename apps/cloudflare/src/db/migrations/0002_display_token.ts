// The waiting-room display link (/display/<token>). Added in the Docker
// edition by apps/server/src/db/migrate.ts at the same time.
export default `ALTER TABLE cafes ADD COLUMN display_token TEXT;`;
