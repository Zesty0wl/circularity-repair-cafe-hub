/**
 * The map background shared by the home page map and the Worldwide map.
 *
 * Both draw OpenStreetMap's roads, parks and place names in one of CARTO's
 * styles, served from CARTO's free tile service. We do not use
 * tile.openstreetmap.org itself: that service is donated, and the people who
 * run it ask that software handed out to other people does not point at it.
 * This hub is meant to be installed by any cafe that wants it, so every copy
 * would be doing exactly that.
 *
 * CARTO asks every site to use its own key. Tiles fetched without one still
 * arrive, but with an "API key required" watermark. Each cafe pastes its own
 * key under Settings, Maps. It travels in the public cafe profile,
 * because the visitor's browser is what fetches the tiles.
 */

/** The CARTO styles the site uses. */
export type CartoStyle = 'light_all' | 'rastertiles/voyager';

/** OpenStreetMap and CARTO both ask to be credited. Leaflet shows this in the corner. */
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

/** The letters Leaflet swaps into {s}, spreading tile requests over CARTO's hosts. */
export const CARTO_SUBDOMAINS = 'abcd';

/**
 * The Leaflet tile address for a CARTO style, with the cafe's key on the end
 * when there is one. Leaflet fills in {s}, {z}, {x}, {y} and {r} for each
 * tile. The key is encoded, so it can never be mistaken for one of them.
 */
export function cartoTileUrl(style: CartoStyle, apiKey: string | null | undefined): string {
  const base = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  const key = (apiKey ?? '').trim();
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}
