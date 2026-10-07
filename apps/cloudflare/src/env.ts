// =============================================================================
//  Bindings and settings
//  ---------------------------------------------------------------------------
//  The Docker edition reads its settings from environment variables, checked
//  by zod in apps/server/src/env.ts. A Worker gets them as "bindings" instead:
//  the database, the file bucket, and plain text variables set in
//  wrangler.jsonc or in the Cloudflare dashboard.
//
//  The variable names are the same as in Docker, so the documentation for one
//  is the documentation for the other.
// =============================================================================
import { env as workerEnv } from 'cloudflare:workers';

export interface Bindings {
  /** The database. */
  DB: D1Database;
  /** Photos, branding, QR codes and cached files. */
  UPLOADS: R2Bucket;
  /** The static files of the web app. */
  ASSETS: Fetcher;

  /** Signs login tokens. Optional: the hub makes one on first run if unset. */
  SECRET_KEY?: string;
  /** Where "today" is, for session dates and reports. Defaults to Europe/London. */
  TZ?: string;
  DEMO_MODE?: string;
  TELEMETRY_DISABLED?: string;
  TELEMETRY_ENDPOINT?: string;
  UPDATE_CHECK_DISABLED?: string;
  MAX_UPLOAD_SIZE_MB?: string;
  SESSION_MAX_AGE_HOURS?: string;
  REFRESH_TOKEN_DAYS?: string;
  DATA_RETENTION_DEFAULT_DAYS?: string;
  EVENT_GENERATION_MONTHS?: string;
}

export function bindings(): Bindings {
  return workerEnv as unknown as Bindings;
}

function flag(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * The same settings object as apps/server/src/env.ts, read from the Worker's
 * variables. A getter rather than a constant, because variables can change
 * between deploys without the code changing.
 */
export const env = {
  get NODE_ENV(): 'production' {
    return 'production';
  },
  get TZ(): string {
    return bindings().TZ?.trim() || 'Europe/London';
  },
  get DEMO_MODE(): boolean {
    return flag(bindings().DEMO_MODE);
  },
  get TELEMETRY_DISABLED(): boolean {
    return flag(bindings().TELEMETRY_DISABLED);
  },
  get TELEMETRY_ENDPOINT(): string {
    return bindings().TELEMETRY_ENDPOINT?.trim() || 'https://repaircafetelemetry.bzwrd.co.uk';
  },
  get UPDATE_CHECK_DISABLED(): boolean {
    return flag(bindings().UPDATE_CHECK_DISABLED);
  },
  get MAX_UPLOAD_SIZE_MB(): number {
    return positiveInt(bindings().MAX_UPLOAD_SIZE_MB, 10);
  },
  get SESSION_MAX_AGE_HOURS(): number {
    return positiveInt(bindings().SESSION_MAX_AGE_HOURS, 4);
  },
  get REFRESH_TOKEN_DAYS(): number {
    return positiveInt(bindings().REFRESH_TOKEN_DAYS, 365);
  },
  get DATA_RETENTION_DEFAULT_DAYS(): number {
    return positiveInt(bindings().DATA_RETENTION_DEFAULT_DAYS, 365);
  },
  get EVENT_GENERATION_MONTHS(): number {
    return positiveInt(bindings().EVENT_GENERATION_MONTHS, 12);
  },
};
