// =============================================================================
//  Remembering that setup is finished
//  ---------------------------------------------------------------------------
//  Every page the web app draws first asks /api/setup/status. Each question is
//  a trip to D1, and the free plan counts rows read, so a Worker instance
//  remembers a "yes" for a short while.
//
//  Only for a short while, because the answer can change back to "no": a
//  restore or a demo reset empties the hub. resetCafeCache() clears it at once
//  in the instance that did the work, but other instances only notice when
//  their memory runs out.
// =============================================================================
import { db } from '../db/index.js';
import { cafes } from '../db/schema.js';

const REMEMBER_MS = 30_000;

let doneUntil = 0;

export async function isSetupCompleted(now = Date.now()): Promise<boolean> {
  if (now < doneUntil) return true;
  const [cafe] = await db.select({ setupCompleted: cafes.setupCompleted }).from(cafes).limit(1);
  const done = cafe?.setupCompleted ?? false;
  doneUntil = done ? now + REMEMBER_MS : 0;
  return done;
}

export function resetCafeCache(): void {
  doneUntil = 0;
}
