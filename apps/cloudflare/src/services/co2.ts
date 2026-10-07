// =============================================================================
//  Working out the CO2 figure
//  ---------------------------------------------------------------------------
//  We used to ask the repairer to type in a number of kilograms. Nobody can
//  estimate the embodied carbon of a toaster at a busy table, so the totals
//  were guesses, and the field was optional, so they were guesses over an
//  unknown subset of repairs.
//
//  Now a visitor says what kind of thing they have brought, and we look the
//  rest up. The sum is The Restart Project's:
//
//      CO2e prevented (kg) = pre-use CO2e of the product (kg) x displacement
//
//  The displacement rate is the part that is easy to lose. A repair does not
//  save the whole carbon cost of a new item. The assumption is that a repaired
//  thing lives about half as long again as it otherwise would, so it displaces
//  half a new purchase. Their default is 0.5, and it is kept as a setting so it
//  is visible rather than buried, and so a cafe can be more cautious.
//
//  See db/co2Factors.ts for the reference data and where it comes from.
// =============================================================================
import { db } from '../db/index.js';
import { cafes, co2Factors } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/** Where a figure came from, so calculated and typed-in are never confused. */
export type Co2Source = 'calculated' | 'manual' | 'none';

export interface Co2Settings {
  enabled: boolean;
  displacementRate: number;
}

/** Fallback if a cafe row is somehow missing. Matches the column default. */
const DEFAULT_DISPLACEMENT = 0.5;

export async function co2Settings(): Promise<Co2Settings> {
  const [cafe] = await db
    .select({ enabled: cafes.co2Enabled, rate: cafes.co2DisplacementRate })
    .from(cafes)
    .limit(1);

  const rate = Number(cafe?.rate ?? DEFAULT_DISPLACEMENT);
  return {
    enabled: cafe?.enabled ?? true,
    // A rate outside 0 to 1 would produce a figure we could not defend.
    displacementRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : DEFAULT_DISPLACEMENT,
  };
}

export interface CalculatedSaving {
  savingKg: number | null;
  source: Co2Source;
  /** Everything the figure was built from, so a page can explain itself. */
  workings: {
    label: string;
    preUseCo2eKg: number;
    displacementRate: number;
    sample: number;
  } | null;
}

/**
 * What one repair of this kind of thing saves.
 *
 * Returns no figure, rather than zero, when we cannot work one out: the cafe
 * has the feature off, no type was recorded, or that type has no CO2e data.
 * Zero would quietly drag an average down; nothing is honest.
 */
export async function savingForFactor(factorId: string | null): Promise<CalculatedSaving> {
  if (!factorId) return { savingKg: null, source: 'none', workings: null };

  const settings = await co2Settings();
  if (!settings.enabled) return { savingKg: null, source: 'none', workings: null };

  const [factor] = await db
    .select({
      label: co2Factors.label,
      co2eKg: co2Factors.co2eKg,
      sample: co2Factors.sample,
    })
    .from(co2Factors)
    .where(eq(co2Factors.id, factorId))
    .limit(1);

  const preUse = Number(factor?.co2eKg ?? NaN);
  if (!factor || !Number.isFinite(preUse) || preUse <= 0) {
    return { savingKg: null, source: 'none', workings: null };
  }

  const saving = preUse * settings.displacementRate;
  return {
    // Three decimal places is what the column holds, and more would be
    // false precision on top of an average.
    savingKg: Math.round(saving * 1000) / 1000,
    source: 'calculated',
    workings: {
      label: factor.label,
      preUseCo2eKg: preUse,
      displacementRate: settings.displacementRate,
      sample: factor.sample,
    },
  };
}

/**
 * The figure to store for a repair, given what was recorded against it.
 *
 * A number typed in by hand always wins. Somebody who overrides the estimate
 * has looked at the actual thing, which we have not.
 */
export async function resolveSaving(opts: {
  factorId: string | null;
  manualKg: number | null | undefined;
}): Promise<{ savingKg: number | null; source: Co2Source }> {
  if (opts.manualKg !== null && opts.manualKg !== undefined && Number.isFinite(opts.manualKg)) {
    return { savingKg: opts.manualKg, source: 'manual' };
  }
  const calculated = await savingForFactor(opts.factorId);
  return { savingKg: calculated.savingKg, source: calculated.source };
}

/** The item types on offer, newest reference data first, for the pickers. */
export async function listFactors(): Promise<
  Array<{
    id: string;
    key: string;
    label: string;
    category: string;
    groupLabel: string;
    co2eKg: number | null;
    weightKg: number | null;
    sample: number;
  }>
> {
  const rows = await db
    .select()
    .from(co2Factors)
    .where(eq(co2Factors.isActive, true))
    .orderBy(co2Factors.category, co2Factors.label);

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    category: r.category,
    groupLabel: r.groupLabel,
    co2eKg: r.co2eKg === null ? null : Number(r.co2eKg),
    weightKg: r.weightKg === null ? null : Number(r.weightKg),
    sample: r.sample,
  }));
}
