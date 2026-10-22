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
import { eq } from 'drizzle-orm';
import { cafes, hubMeta } from '../db/schema.js';

const REMEMBER_MS = 30_000;

let doneUntil = 0;

export async function isSetupCompleted(now = Date.now()): Promise<boolean> {
  if (now < doneUntil) return true;
  const done = await wasEverSetUp();
  doneUntil = done ? now + REMEMBER_MS : 0;
  return done;
}

// ── Whether this hub has ever been set up ────────────────────────────────────
//
// A restore empties every table a backup fills, the cafe row included, so the
// cafe row cannot answer this question for the few minutes a restore takes.
// The routes anyone can reach on a new hub must not read that as "this is a
// new hub". If they did, a stranger could finish setup, or start an import of
// their own, in the middle of somebody's restore and take the hub over. So we
// also keep a marker in hub_meta, which a restore leaves alone.

const SETUP_MARKER = 'setup_done';

/** True once setup has finished, even while a restore has emptied the cafe row. Never cached. */
export async function wasEverSetUp(): Promise<boolean> {
  const [marker] = await db.select({ key: hubMeta.key }).from(hubMeta).where(eq(hubMeta.key, SETUP_MARKER)).limit(1);
  if (marker) return true;
  const [cafe] = await db.select({ setupCompleted: cafes.setupCompleted }).from(cafes).limit(1);
  return cafe?.setupCompleted ?? false;
}

/** Remember that setup has finished. Called by setup, and at the end of an import. */
export async function markSetUp(): Promise<void> {
  await db
    .insert(hubMeta)
    .values({ key: SETUP_MARKER, value: '1', updatedAt: new Date() })
    .onConflictDoUpdate({ target: hubMeta.key, set: { value: '1', updatedAt: new Date() } });
}

/** Forget it. Only for the demo, whose reset really does make it a new hub. */
export async function forgetSetUp(): Promise<void> {
  await db.delete(hubMeta).where(eq(hubMeta.key, SETUP_MARKER));
  doneUntil = 0;
}

export function resetCafeCache(): void {
  doneUntil = 0;
}
