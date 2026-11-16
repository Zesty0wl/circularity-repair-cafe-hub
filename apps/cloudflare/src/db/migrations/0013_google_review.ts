// Where visitors are sent to review the cafe on Google: a Place ID or a Google
// link, as the admin typed it in Settings. See packages/shared/src/reviews.ts.
// Empty on every hub until an admin fills it in, so nothing changes before then.
export default `ALTER TABLE cafes ADD COLUMN google_review TEXT;`;
