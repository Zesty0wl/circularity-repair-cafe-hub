import Supercluster from 'supercluster';

/**
 * The worldwide Repair Café directory, as our server hands it to us.
 *
 * The data comes from repaircafe.org. Our server mirrors it and caches it for
 * a day, so this is a same-origin request. See
 * apps/server/src/services/repairCafeNetwork.ts.
 */

export interface NetworkCafe {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  /** Page on repaircafe.org, e.g. "repair-cafe-hattem". */
  slug: string | null;
  /** The cafe's own website, when it has one. */
  website: string | null;
}

export interface NetworkSnapshot {
  cafes: NetworkCafe[];
  /** Everything the directory lists, including cafes with no map pin yet. */
  totalListed: number;
  fetchedAt: string;
  source: string;
  /** Our own entry, when an admin has linked this cafe to its repaircafe.org page. */
  ours: NetworkCafe | null;
}


// ── Grouping cafes that sit close together ──────────────────────────────────
//
// Grouping is done by Supercluster, the library Mapbox and Leaflet maps use. It
// groups by distance on screen, so bubbles never land on top of each other.
//
// It earns its place twice over here. The globe is drawn by Cesium, and asking
// Cesium to hold all 3,892 cafes at once brings it to about one frame a second,
// which in turn starves the map of the tiles it needs to sharpen up. Grouping
// first means the globe is only ever given the hundred or so markers actually
// in view, and it stays quick.

/** A group of cafes, drawn as one bubble with a count. */
export interface CafeGroup {
  id: number;
  lat: number;
  lng: number;
  count: number;
}

interface CafeProps {
  cafe: NetworkCafe;
}

export type CafeIndex = Supercluster<CafeProps, Record<string, never>>;

/** How close two cafes must be on screen, in pixels, before they are grouped. */
const GROUP_RADIUS_PX = 42;

/** Below this many cafes no group is made, and each one keeps its own pin. */
const MIN_GROUP_SIZE = 3;

/** Supercluster measures in map tiles of this width. */
const TILE_SIZE = 256;

export function buildClusterIndex(cafes: NetworkCafe[]): CafeIndex {
  const index: CafeIndex = new Supercluster({
    radius: GROUP_RADIUS_PX,
    maxZoom: 14,
    minPoints: MIN_GROUP_SIZE,
  });
  index.load(
    cafes.map((cafe) => ({
      type: 'Feature' as const,
      properties: { cafe },
      geometry: { type: 'Point' as const, coordinates: [cafe.lng, cafe.lat] },
    })),
  );
  return index;
}

/**
 * Groups and single pins for a part of the world at a given zoom.
 * `bbox` is [west, south, east, north] in degrees.
 */
export function groupsInView(
  index: CafeIndex,
  bbox: [number, number, number, number],
  zoom: number,
): { groups: CafeGroup[]; singles: NetworkCafe[] } {
  const groups: CafeGroup[] = [];
  const singles: NetworkCafe[] = [];

  for (const feature of index.getClusters(bbox, Math.round(zoom))) {
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const props = feature.properties as {
      cluster?: boolean;
      cluster_id?: number;
      point_count?: number;
      cafe?: NetworkCafe;
    };
    if (props.cluster) {
      groups.push({ id: props.cluster_id!, lat, lng, count: props.point_count! });
    } else if (props.cafe) {
      singles.push(props.cafe);
    }
  }
  return { groups, singles };
}

/**
 * The map zoom level that matches what the camera can see.
 *
 * Supercluster measures distance on a Mercator map, which stretches east to
 * west by 1 / cos(latitude), so that is taken into account. Without it the same
 * view would group cafes more tightly near the equator than near the poles.
 */
export function zoomForView(
  metresPerPixel: number,
  lat: number,
): number {
  const stretch = Math.cos((Math.min(80, Math.abs(lat)) * Math.PI) / 180);
  // One degree of longitude at the equator is roughly 111,320 metres.
  const degPerPx = metresPerPixel / 111_320;
  if (!(degPerPx > 0)) return 0;
  const zoom = Math.log2((360 * stretch) / (TILE_SIZE * degPerPx));
  return Math.max(0, Math.min(20, zoom));
}

/** The public page for a cafe on repaircafe.org. */
export function cafeUrl(cafe: NetworkCafe): string | null {
  return cafe.slug ? `https://www.repaircafe.org/cafe/${encodeURIComponent(cafe.slug)}` : null;
}

/**
 * Rank cafes against what someone typed. Matches the name and the address, so
 * a town, a postcode or a country all find something. Sorted so names that
 * start with the search term come first.
 */
export function searchCafes(cafes: NetworkCafe[], term: string, limit = 40): NetworkCafe[] {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];

  const hits: Array<{ cafe: NetworkCafe; score: number }> = [];
  for (const cafe of cafes) {
    const name = cafe.name.toLowerCase();
    const address = (cafe.address ?? '').toLowerCase();
    let score = -1;
    if (name.startsWith(needle)) score = 0;
    else if (name.includes(needle)) score = 1;
    else if (address.includes(needle)) score = 2;
    if (score >= 0) hits.push({ cafe, score });
    // Stop early once there is plenty to choose from. The list is already in
    // alphabetical order, so this stays stable between keystrokes.
    if (hits.length >= limit * 6) break;
  }

  return hits
    .sort((a, b) => a.score - b.score || a.cafe.name.localeCompare(b.cafe.name))
    .slice(0, limit)
    .map((h) => h.cafe);
}

/** Great-circle distance in kilometres. Used to list the cafes nearest to you. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The cafes closest to a point, nearest first. */
export function nearest(
  cafes: NetworkCafe[],
  from: { lat: number; lng: number },
  count = 8,
): Array<NetworkCafe & { km: number }> {
  return cafes
    .map((cafe) => ({ ...cafe, km: distanceKm(from, cafe) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}
