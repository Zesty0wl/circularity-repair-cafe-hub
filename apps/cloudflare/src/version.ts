import rootPackage from '../../../package.json';

/**
 * Bumped whenever the backup layout or restore rules change in a way that an
 * older hub cannot safely read. The old Docker edition writes format 1 (a pg_dump
 * and the uploads folder). The Cloudflare edition writes format 2 (one JSON
 * file per table and the uploads folder), and reads both.
 */
export const BACKUP_FORMAT_VERSION = 2;

/** The app version, from the root package.json, the one place it lives. */
export const APP_VERSION: string = (rootPackage as { version?: string }).version ?? '0.0.0';

/** Which edition this is. Shown in the admin area and sent with telemetry. */
export const EDITION = 'cloudflare' as const;
