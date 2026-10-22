/**
 * The map background shared by the home page map and the Worldwide map.
 *
 * Both draw OpenStreetMap's roads, parks and place names from OpenFreeMap
 * (openfreemap.org). OpenFreeMap is free, and it needs no key, no account and
 * no sign-up, so every cafe that installs the hub gets working maps with
 * nothing to set up. Its only condition is the credit line, which MapLibre
 * shows in the corner of the map for us.
 *
 * We do not use tile.openstreetmap.org itself: that service is donated, and
 * the people who run it ask that software handed out to other people does not
 * point at it. This hub is meant to be installed by any cafe that wants it, so
 * every copy would be doing exactly that.
 *
 * OpenFreeMap sends the map as data rather than as pictures, so the browser
 * draws it with MapLibre GL. MapLibre does that drawing in a web worker.
 */
import type * as MapLibre from 'maplibre-gl';
// The worker as a file of its own, served from this site. MapLibre would
// otherwise build its worker from a blob in memory, which the site's security
// policy (worker-src 'self') does not allow.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

/** The OpenFreeMap styles the site uses. */
export const MAP_STYLES = {
  /** Pale and quiet, so brand-coloured pins stand out. */
  light: 'https://tiles.openfreemap.org/styles/positron',
  /** The familiar OpenStreetMap look: creams, pale greens and light blues. */
  streets: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

/**
 * Hide the shaded hills that OpenFreeMap draws when zoomed out. They turn the
 * world brown and grey, and the pins are much easier to see on flat colour.
 */
export function hideHillShading(map: MapLibre.Map): void {
  map.once('style.load', () => {
    for (const layer of map.getStyle().layers) {
      if ('source' in layer && layer.source === 'ne2_shaded') {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    }
  });
}

let loading: Promise<typeof MapLibre> | null = null;

/**
 * Load MapLibre the first time a map needs it, and point it at its worker.
 * MapLibre only runs in a browser, so it is never part of the page the server
 * draws.
 */
export function loadMapLibre(): Promise<typeof MapLibre> {
  loading ??= import('maplibre-gl').then((mod) => {
    mod.setWorkerUrl(workerUrl);
    return mod;
  });
  // A failed load is not kept, so the next map can try again.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
