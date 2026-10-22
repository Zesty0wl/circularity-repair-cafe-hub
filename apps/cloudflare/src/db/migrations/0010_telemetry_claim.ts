// A secret the hub makes for itself, so the telemetry collector can tell this
// hub apart from anybody who copies its install id. The id is public: the
// hub's own /api/public/telemetry shows it, because that is how the collector
// checks a hub is real. The hub sends the secret with its pings, and publishes
// only its hash. It is made the first time it is needed. See
// telemetryClaim() in services/telemetry.ts.
export default `ALTER TABLE cafes ADD COLUMN telemetry_claim TEXT;`;
