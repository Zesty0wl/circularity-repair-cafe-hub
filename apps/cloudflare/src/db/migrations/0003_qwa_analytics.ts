// Quick Web Analytics, and a choice of which analytics service runs.
//
// analytics_provider is left empty on older hubs. Empty means "Plausible if
// its two fields are filled in", which is how they already behave, so nothing
// changes until an admin picks a service. qwa_events is a JSON list of the
// events to count. Empty means every event.
export default `ALTER TABLE cafes ADD COLUMN analytics_provider TEXT;
ALTER TABLE cafes ADD COLUMN qwa_site TEXT;
ALTER TABLE cafes ADD COLUMN qwa_src TEXT;
ALTER TABLE cafes ADD COLUMN qwa_events TEXT;`;
