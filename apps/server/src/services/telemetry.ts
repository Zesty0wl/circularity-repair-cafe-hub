// =============================================================================
//  Telemetry
//  ---------------------------------------------------------------------------
//  Once a day, a cafe that has said yes sends the project a short summary of
//  what it has achieved. It lets us add up what community repair does across
//  every cafe running this, which is a number nobody currently has.
//
//  Two rules this file exists to keep:
//
//  1. NOTHING IS SENT UNTIL SOMEBODY SAID YES. The level starts at 'none' and
//     only a person can change it. An install that upgrades into this feature
//     sends nothing at all until it has been asked.
//
//  2. NOTHING BUT COUNTS EVER LEAVES. Every value below is a number, a date, a
//     version or a flag. There is no free text, because free text is where
//     personal data hides: item descriptions and outcome notes contain things
//     like "Mrs Shaw's kettle". Nothing about a visitor, a volunteer or a
//     repair record is read here, and the payload is built from aggregate SQL
//     so there is nowhere for a row to hide.
//
//  Everything is a running total rather than a figure for the day, so a cafe
//  that is offline for a week needs no outbox: the next send carries the whole
//  picture.
// =============================================================================
import { db } from '../db/index.js';
import { cafes } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { env } from '../env.js';
import { APP_VERSION } from '../version.js';

/** What a cafe agreed to. */
export type TelemetryLevel = 'none' | 'standard' | 'community';

const SCHEMA_VERSION = 1;
const SEND_TIMEOUT_MS = 15_000;
/** Don't send again until the last one was this long ago. */
const MIN_HOURS_BETWEEN_SENDS = 20;

const USER_AGENT = `CircularityRepairCafeHub/${APP_VERSION} (+https://github.com/Zesty0wl/circularity-repair-cafe-hub)`;

export interface TelemetryPayload {
  schemaVersion: number;
  level: 'standard' | 'community';
  installId: string;
  sentAt: string;
  app: { version: string };
  howManySessions: number;
  howManyVenues: number;
  howManyVolunteers: number;
  firstSession: string | null;
  latestSession: string | null;
  repairsRecorded: number;
  repairsFixed: number;
  repairsNotFixed: number;
  repairsPaused: number;
  repairsReturned: number;
  co2: {
    enabled: boolean;
    savedKg: number;
    fromThisManyRepairs: number;
    displacementRate: number;
  };
  kindsOfThing: Array<{ kind: string; howMany: number; fixed: number }>;
  featuresInUse: Record<string, number | boolean>;
  cafe: null | {
    repaircafeSlug?: string | null;
    name?: string | null;
    publicUrl?: string | null;
  };
}

/** The telemetry settings, or null when this install has no cafe row yet. */
export async function telemetryState(): Promise<{
  level: TelemetryLevel;
  installId: string | null;
  token: string | null;
  lastSentAt: Date | null;
  decidedAt: Date | null;
  promptedVersion: string | null;
  /** True when an operator has ruled it out for the whole install. */
  disabledByEnv: boolean;
} | null> {
  const [row] = await db
    .select({
      level: cafes.telemetryLevel,
      installId: cafes.telemetryInstallId,
      token: cafes.telemetryToken,
      lastSentAt: cafes.telemetryLastSentAt,
      decidedAt: cafes.telemetryDecidedAt,
      promptedVersion: cafes.telemetryPromptedVersion,
    })
    .from(cafes)
    .limit(1);
  if (!row) return null;
  return {
    level: (row.level as TelemetryLevel) ?? 'none',
    installId: row.installId,
    token: row.token,
    lastSentAt: row.lastSentAt,
    decidedAt: row.decidedAt,
    promptedVersion: row.promptedVersion,
    disabledByEnv: env.TELEMETRY_DISABLED,
  };
}

/**
 * Should the admin area offer the choice?
 *
 * Yes when nobody has said yes yet, and we have not already asked at this
 * version. So the offer comes back after an upgrade, once, rather than sitting
 * on the dashboard forever or never appearing again after one "not now".
 */
export function shouldPrompt(state: {
  level: TelemetryLevel;
  promptedVersion: string | null;
  disabledByEnv: boolean;
}): boolean {
  if (state.disabledByEnv) return false;
  if (state.level !== 'none') return false;
  return state.promptedVersion !== APP_VERSION;
}

/**
 * Build the summary.
 *
 * Every figure comes from a COUNT or a SUM. No row is read, so nothing that
 * was typed by a person can reach the payload even by mistake.
 */
export async function buildPayload(level: 'standard' | 'community'): Promise<TelemetryPayload | null> {
  const [cafe] = await db.select().from(cafes).limit(1);
  if (!cafe?.telemetryInstallId) return null;

  // Sessions that actually happened, matching what the public stats count.
  const activity = await db.execute(sql`
    SELECT
      COUNT(*)::int                                   AS sessions,
      to_char(MIN(date), 'YYYY-MM-DD')                AS first_session,
      to_char(MAX(date), 'YYYY-MM-DD')                AS latest_session
    FROM events WHERE status IN ('completed','active')
  `);
  const a = (activity.rows[0] ?? {}) as Record<string, unknown>;

  const repairs = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                AS recorded,
      COUNT(*) FILTER (WHERE status = 'completed')::int            AS fixed,
      COUNT(*) FILTER (WHERE status = 'cannot_repair')::int        AS not_fixed,
      COUNT(*) FILTER (WHERE status = 'awaiting_return')::int      AS paused,
      COUNT(*) FILTER (WHERE status = 'returned')::int             AS returned,
      COALESCE(SUM(co2_saving_kg) FILTER (WHERE status = 'completed'), 0)::float       AS co2_kg,
      COUNT(*) FILTER (WHERE status = 'completed' AND co2_saving_kg IS NOT NULL)::int  AS co2_from
    FROM repair_jobs
  `);
  const r = (repairs.rows[0] ?? {}) as Record<string, unknown>;

  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM venues WHERE is_active)                                   AS venues,
      (SELECT COUNT(*)::int FROM users WHERE is_active AND role <> 'super_admin')          AS volunteers,
      (SELECT COUNT(*)::int FROM cafe_gallery)                                             AS gallery_photos,
      (SELECT COUNT(*)::int FROM event_images)                                             AS event_photos
  `);
  const c = (counts.rows[0] ?? {}) as Record<string, unknown>;

  // Keyed by the CO2 reference vocabulary, which every install shares. Never
  // the cafe's own category names: those are free text an admin can rename.
  const kinds = await db.execute(sql`
    SELECT f.key AS kind,
           COUNT(rj.id)::int AS how_many,
           COUNT(rj.id) FILTER (WHERE rj.status = 'completed')::int AS fixed
    FROM repair_jobs rj
    JOIN co2_factors f ON f.id = rj.co2_factor_id
    GROUP BY f.key
    ORDER BY how_many DESC
    LIMIT 200
  `);

  const homePage = (cafe.homePage ?? {}) as Record<string, unknown>;

  return {
    schemaVersion: SCHEMA_VERSION,
    level,
    installId: cafe.telemetryInstallId,
    sentAt: new Date().toISOString(),
    app: { version: APP_VERSION },

    howManySessions: Number(a.sessions ?? 0),
    howManyVenues: Number(c.venues ?? 0),
    howManyVolunteers: Number(c.volunteers ?? 0),
    firstSession: (a.first_session as string | null) ?? null,
    latestSession: (a.latest_session as string | null) ?? null,

    repairsRecorded: Number(r.recorded ?? 0),
    repairsFixed: Number(r.fixed ?? 0),
    repairsNotFixed: Number(r.not_fixed ?? 0),
    repairsPaused: Number(r.paused ?? 0),
    repairsReturned: Number(r.returned ?? 0),

    co2: {
      enabled: cafe.co2Enabled ?? true,
      savedKg: Math.round(Number(r.co2_kg ?? 0) * 10) / 10,
      fromThisManyRepairs: Number(r.co2_from ?? 0),
      displacementRate: Number(cafe.co2DisplacementRate ?? 0.5),
    },

    kindsOfThing: kinds.rows.map((k: any) => ({
      kind: String(k.kind),
      howMany: Number(k.how_many ?? 0),
      fixed: Number(k.fixed ?? 0),
    })),

    featuresInUse: {
      galleryPhotos: Number(c.gallery_photos ?? 0),
      eventPhotos: Number(c.event_photos ?? 0),
      localCafesChosen: (cafe.localCafeSlugs ?? []).length,
      showsStats: homePage.showStats === true,
      showsEventStats: homePage.showEventStats !== false,
      usesPlausible: Boolean(cafe.plausibleDomain && cafe.plausibleSrc),
      hasLogo: Boolean(cafe.logoUrl),
      hasOwnColour: Boolean(cafe.primaryColor),
      listedOnRepairCafeOrg: Boolean(cafe.repaircafeSlug),
    },

    // Only at the Community level, and only ever the cafe's own public
    // details: the name it already shows on its own site, and its slug in the
    // public repaircafe.org directory.
    cafe:
      level === 'community'
        ? {
            repaircafeSlug: cafe.repaircafeSlug ?? null,
            name: cafe.name || null,
            publicUrl: cafe.publicUrl || null,
          }
        : null,
  };
}

export interface SendResult {
  ok: boolean;
  skipped?: 'disabled' | 'not_agreed' | 'too_soon' | 'no_cafe';
  status?: number;
  error?: string;
}

/**
 * Send today's summary, if there is one to send.
 *
 * Never throws. A collector that is down, a hall with no internet, or a DNS
 * failure must never show up as an error in a cafe's logs or slow anything
 * down: this is the least important thing the server does.
 */
export async function sendTelemetry(options: { force?: boolean } = {}): Promise<SendResult> {
  try {
    if (env.TELEMETRY_DISABLED) return { ok: false, skipped: 'disabled' };
    const state = await telemetryState();
    if (!state) return { ok: false, skipped: 'no_cafe' };
    if (state.level === 'none') return { ok: false, skipped: 'not_agreed' };

    if (!options.force && state.lastSentAt) {
      const hours = (Date.now() - state.lastSentAt.getTime()) / 3_600_000;
      if (hours < MIN_HOURS_BETWEEN_SENDS) return { ok: false, skipped: 'too_soon' };
    }

    const payload = await buildPayload(state.level as 'standard' | 'community');
    if (!payload) return { ok: false, skipped: 'no_cafe' };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const res = await fetch(`${env.TELEMETRY_ENDPOINT.replace(/\/+$/, '')}/api/v1/ping`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) return { ok: false, status: res.status, error: `collector responded ${res.status}` };

    const body = (await res.json().catch(() => ({}))) as { token?: string };
    const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);
    if (cafe) {
      await db
        .update(cafes)
        .set({
          telemetryLastSentAt: new Date(),
          // The collector hands the token over exactly once, on the call that
          // mints it. Losing it would mean losing the ability to be forgotten.
          ...(body.token ? { telemetryToken: body.token } : {}),
        })
        .where(eq(cafes.id, cafe.id));
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'send failed' };
  }
}

/**
 * Ask the collector to delete everything it holds about this install, then
 * forget the token so the next send starts fresh.
 */
export async function forgetUs(): Promise<{ ok: boolean; error?: string }> {
  try {
    const state = await telemetryState();
    if (!state?.installId || !state.token) {
      // Never sent anything, so there is nothing to delete. Still counts as
      // done from the admin's point of view.
      return { ok: true };
    }
    const res = await fetch(`${env.TELEMETRY_ENDPOINT.replace(/\/+$/, '')}/api/v1/forget`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ installId: state.installId }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    // A 404 means it is already gone, which is the outcome we wanted.
    if (!res.ok && res.status !== 404) {
      return { ok: false, error: `collector responded ${res.status}` };
    }
    const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);
    if (cafe) {
      await db
        .update(cafes)
        .set({ telemetryToken: null, telemetryLastSentAt: null })
        .where(eq(cafes.id, cafe.id));
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'could not reach the collector' };
  }
}

/**
 * Wake up now and then and send if it is due.
 *
 * The first send waits a few minutes so a restart loop cannot hammer the
 * collector, and the hour is nudged by the install id so a thousand cafes do
 * not all arrive on the stroke of midnight. Whether it is actually due is
 * decided from a stored timestamp, so restarts do not cause extra sends.
 */
export function startTelemetrySchedule(log: {
  info: (o: unknown, m?: string) => void;
  warn: (o: unknown, m?: string) => void;
}): void {
  if (env.TELEMETRY_DISABLED) {
    log.info({}, 'telemetry is switched off by TELEMETRY_DISABLED');
    return;
  }

  const FIRST_RUN_MS = 5 * 60 * 1000;
  const EVERY_MS = 60 * 60 * 1000;

  const tick = async () => {
    const result = await sendTelemetry();
    if (result.ok) log.info({}, 'telemetry sent');
    else if (result.error) log.warn({ err: result.error }, 'telemetry could not be sent, will try later');
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), EVERY_MS);
  }, FIRST_RUN_MS).unref?.();
}
