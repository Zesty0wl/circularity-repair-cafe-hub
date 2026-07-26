/**
 * Neighbouring Repair Cafes.
 *
 * A cafe can pick nearby cafes it knows and supports out of the repaircafe.org
 * directory, and they show as a small map and list on the home page. We only
 * ever store the repaircafe.org slug, so everything below is read fresh from
 * the directory rather than copied and left to go stale.
 */

export interface LocalCafe {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  /** Their page on repaircafe.org, e.g. "repair-cafe-hattem". */
  slug: string | null;
  /** Their own website, when the directory has one that works. */
  website: string | null;
  /** Straight-line distance from us in kilometres, when we know where we are. */
  distanceKm?: number | null;
}

/** The most neighbouring cafes a cafe may show. Matches the server's cap. */
export const MAX_LOCAL_CAFES = 10;

/** The full address of a cafe's page on repaircafe.org. */
export function repairCafeOrgUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `https://www.repaircafe.org/cafe/${encodeURIComponent(slug)}`;
}

/** "12 km away", or "800 m away" when it is close enough to walk. */
export function formatDistance(km: number | null | undefined): string | null {
  if (km === null || km === undefined || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}
