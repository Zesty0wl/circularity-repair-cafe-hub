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
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  DATA_RETENTION_DEFAULT_DAYS: z.coerce.number().int().positive().default(365),
  EVENT_GENERATION_MONTHS: z.coerce.number().int().positive().default(12),
  TZ: z.string().default('UTC'),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
