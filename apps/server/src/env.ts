import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters'),
  DATABASE_URL: z.string().default('postgresql://circularity:circularity@127.0.0.1:5432/circularity'),
  UPLOADS_DIR: z.string().default('/data/uploads'),
  CONFIG_DIR: z.string().default('/data/config'),
  // adapter-node build output dir for the web app (contains handler.js).
  WEB_BUILD_DIR: z.string().default('/app/web'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRUST_PROXY: z.string().default('cloudflare'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(10),
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().positive().default(4),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(365),
  DATA_RETENTION_DEFAULT_DAYS: z.coerce.number().int().positive().default(365),
  EVENT_GENERATION_MONTHS: z.coerce.number().int().positive().default(12),
  // ── Telemetry ────────────────────────────────────────────────────────────
  // Where a cafe that has agreed sends its daily summary of counts.
  TELEMETRY_ENDPOINT: z.string().default('https://repaircafetelemetry.bzwrd.co.uk'),
  // Rules it out for the whole install, before anybody is asked. For someone
  // running this on a client's behalf who wants the question settled in the
  // compose file rather than the browser.
  TELEMETRY_DISABLED: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  // ── Update check ─────────────────────────────────────────────────────────
  // Once a day the hub asks GitHub which versions have been released, so the
  // admin area can say when a newer one exists. It sends nothing about the
  // cafe: no version, no counts, no identifier. It is an ordinary request for
  // a public page, so GitHub sees an IP address and nothing else.
  //
  // Set this to true and no request is ever made. The admin page then says the
  // check is switched off rather than pretending it is up to date.
  UPDATE_CHECK_DISABLED: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  // ── Demo mode ────────────────────────────────────────────────────────────
  // For a public try-before-you-install site, where the login details are
  // published and anyone can sign in as an administrator.
  //
  // It is deliberately an instance-wide switch rather than a kind of user.
  // The check-in flow has no login at all, by design, because visitors scan a
  // QR code. So the riskiest thing on a public demo, somebody uploading a
  // picture nobody wants hosted on your domain, cannot be stopped by limiting
  // what a signed-in account may do. It has to be stopped for everyone.
  //
  // When on:
  //   - every upload route refuses, including the anonymous check-in one
  //   - robots.txt tells search engines to stay out of the whole site
  //   - nobody can change a password or remove a user, so the demo cannot be
  //     locked, and the published login keeps working
  //   - telemetry never sends, so a demo cafe is not counted as a real one
  //
  // Off by default. A normal cafe is completely unaffected.
  DEMO_MODE: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  TZ: z.string().default('UTC'),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
