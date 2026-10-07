// =============================================================================
//  Remembering that setup is finished
//  ---------------------------------------------------------------------------
//  Every page the web app draws first asks /api/setup/status. In Docker that
//  is a quick local query. On Cloudflare each query is a trip to D1, and the
//  free plan counts rows read, so a Worker instance remembers the answer once
//  it is "yes". It can only change back to "no" through a restore, which
//  calls resetCafeCache().
// =============================================================================
import { db } from '../db/index.js';
import { cafes } from '../db/schema.js';

let setupDone = false;

export async function isSetupCompleted(): Promise<boolean> {
  if (setupDone) return true;
  const [cafe] = await db.select({ setupCompleted: cafes.setupCompleted }).from(cafes).limit(1);
  setupDone = cafe?.setupCompleted ?? false;
  return setupDone;
}

export function resetCafeCache(): void {
  setupDone = false;
}
