import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bumped whenever the backup zip layout, manifest fields, or restore semantics
 * change in a way that older servers can't safely consume. Restore refuses any
 * backup whose `backupFormatVersion` is greater than this value.
 */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Read the human-facing app version from the root package.json. Cached at
 * module load so we don't hit the filesystem on every backup.
 *
 * Falls back to "0.0.0" if the file cannot be read (e.g. tests).
 */
function readAppVersion(): string {
  // From compiled dist this resolves to /app/dist/version.js; from tsx it's
  // /app/apps/server/src/version.ts. Walk upwards until we find package.json
  // with "circularity-hub" name to be robust to either layout.
  const here = path.dirname(fileURLToPath(import.meta.url));

  // 1. An explicit answer, for anyone building their own image.
  const fromEnv = (process.env.APP_VERSION ?? '').trim();
  if (fromEnv) return fromEnv;

  // 2. Written into the image at build time from the root package.json. The
  //    runtime stage does not contain that file, so without this every
  //    container reported "0.0.0": no version telemetry, a backup manifest
  //    that said nothing, and an upgrade prompt that could never notice an
  //    upgrade. See the Dockerfile.
  for (const candidate of ['/app/APP_VERSION', path.join(here, '..', 'APP_VERSION')]) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8').trim();
      if (/^\d+\.\d+\.\d+/.test(raw)) return raw;
    } catch {
      // try the next one
    }
  }

  let cursor = here;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(cursor, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (pkg?.name === 'circularity-hub' && typeof pkg.version === 'string') {
          return pkg.version;
        }
      } catch {
        // ignore and keep walking
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return '0.0.0';
}

export const APP_VERSION = readAppVersion();
