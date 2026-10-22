// Remember that a hub has been set up, somewhere a restore does not wipe.
//
// A restore empties the cafes table while it runs. The routes anyone can reach
// on a new hub used to read "no cafe row" as "not set up yet", which let a
// stranger take a hub over during a restore. They now also check this marker
// in hub_meta. See wasEverSetUp() in services/cafeCache.ts.
//
// Hubs that are already set up get the marker here, before anyone can start a
// restore on them.
export default `INSERT OR IGNORE INTO hub_meta (key, value, updated_at)
SELECT 'setup_done', '1', CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM cafes WHERE setup_completed = 1 LIMIT 1;`;
