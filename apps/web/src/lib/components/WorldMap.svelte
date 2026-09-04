<script lang="ts">
  /**
   * A flat map of every Repair Café in the worldwide directory.
   *
   * This used to be a 3D globe drawn with CesiumJS. The globe looked good but it
   * did not load reliably: it needs WebGL, a 14 MB runtime, its own web workers,
   * and a looser security policy than the rest of the site. When any one of
   * those was missing the page showed nothing at all.
   *
   * A flat map does the same job with far less to go wrong. Leaflet is already
   * used elsewhere on the site, it draws plain images rather than 3D, and it
   * works under the site's normal security policy.
   *
   * Cafés that sit close together are still grouped into one numbered circle,
   * worked out by Supercluster before Leaflet sees anything. Leaflet is only
   * ever handed the markers that are actually on screen, so the map stays quick
   * with several thousand cafés loaded.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import {
    buildClusterIndex,
    groupsInView,
    type CafeGroup,
    type CafeIndex,
    type NetworkCafe,
  } from '$lib/repairCafeNetwork';
  import { CARTO_ATTRIBUTION, CARTO_SUBDOMAINS, cartoTileUrl } from '$lib/mapTiles';

  export let cafes: NetworkCafe[] = [];
  /** This cafe's own entry, drawn larger and never folded into a group. */
  export let ours: NetworkCafe | null = null;
  /** The cafe the page has selected. */
  export let selected: NetworkCafe | null = null;
  /** True once the map is drawn, so the page can drop its placeholder. */
  export let loaded = false;
  /** The cafe's CARTO key, from the public profile. Null means watermarked tiles. */
  export let cartoApiKey: string | null = null;

  const dispatch = createEventDispatcher<{ select: NetworkCafe }>();

  // Fixed colours rather than the cafe's brand palette. A cafe that picked a
  // pale brand colour would have pins nobody could see against the map.
  //
  // Deep green for a cafe and amber for us. Neither appears in the map
  // underneath, which keeps to creams, pale greens and light blues, so a pin is
  // never mistaken for a road or a park.
  const PIN = '#0f5c4e';
  const MINE = '#e07a1f';

  /**
   * The OpenStreetMap look, served by CARTO in its Voyager style: OpenStreetMap's
   * own roads, parks and place names. See $lib/mapTiles for why the tiles come
   * from CARTO rather than tile.openstreetmap.org, and for the cafe's key.
   */
  const TILE_STYLE = 'rastertiles/voyager';

  const HOME_ZOOM = 2;
  const CAFE_ZOOM = 12;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 18;

  let container: HTMLDivElement;
  let L: any = null;
  let map: any = null;
  let tiles: any = null;
  let groupLayer: any = null;
  let cafeLayer: any = null;
  let oursLayer: any = null;
  let index: CafeIndex | null = null;
  let failed = false;
  let redrawQueued = false;

  function sameCafe(a: NetworkCafe | null, b: NetworkCafe | null): boolean {
    if (!a || !b) return false;
    return a.slug === b.slug && a.name === b.name;
  }

  /**
   * Café names arrive from an outside directory, so they are put on the page as
   * text and never as markup. Leaflet treats a string label as HTML, so the
   * label is built as a node instead.
   */
  function textLabel(text: string): HTMLElement {
    const el = document.createElement('span');
    el.textContent = text;
    return el;
  }

  /** A single café, drawn as a plain dot. */
  function dotIcon(size: number, colour: string, ring: string, ringWidth: number) {
    return L.divIcon({
      className: 'world-pin',
      html:
        `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;` +
        `background:${colour};box-shadow:0 0 0 ${ringWidth}px ${ring},0 1px 4px rgba(0,0,0,.35)"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  /** A group of cafés, drawn as a circle with the count in it. */
  function bubbleIcon(count: number) {
    const size = Math.round(Math.min(46, 26 + 9 * Math.log10(count)));
    return L.divIcon({
      className: 'world-pin',
      html:
        `<span style="display:flex;align-items:center;justify-content:center;` +
        `width:${size}px;height:${size}px;border-radius:9999px;` +
        `background:${PIN};color:#fff;font-weight:700;` +
        `font-size:${size < 30 ? 11 : 12}px;line-height:1;` +
        `box-shadow:0 0 0 2px rgba(255,255,255,.95),0 2px 7px rgba(0,0,0,.25)">${count}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  /** Point the map at a cafe. */
  export function flyTo(cafe: NetworkCafe): void {
    if (!map) return;
    map.flyTo([cafe.lat, cafe.lng], CAFE_ZOOM, { duration: 1.2 });
  }

  /** Pull back to the opening view. */
  export function resetView(): void {
    if (!map) return;
    const home = ours ?? cafes[0];
    map.flyTo([home?.lat ?? 25, home?.lng ?? 5], HOME_ZOOM, { duration: 1.2 });
  }

  function addCafe(cafe: NetworkCafe): void {
    const chosen = sameCafe(cafe, selected);
    const marker = L.marker([cafe.lat, cafe.lng], {
      icon: chosen
        ? dotIcon(16, PIN, '#ffffff', 3)
        : dotIcon(10, PIN, 'rgba(255,255,255,.95)', 2),
      // Nothing inside the map takes keyboard focus. The map is one image as
      // far as a screen reader is concerned, and the panel beside it is the
      // way to reach every cafe by keyboard.
      keyboard: false,
      title: cafe.name,
      zIndexOffset: chosen ? 500 : 0,
    });
    // Only the chosen cafe keeps its name on screen. Every name at once is
    // unreadable the moment you zoom into a town: nothing here works out which
    // labels are covering which, so a busy street ends up as a pile of text.
    marker.bindTooltip(textLabel(cafe.name), {
      direction: 'top',
      offset: [0, -8],
      permanent: chosen,
      className: chosen ? 'world-label world-label-on' : 'world-label',
    });
    marker.on('click', () => dispatch('select', cafe));
    marker.addTo(cafeLayer);
  }

  function addGroup(group: CafeGroup): void {
    const marker = L.marker([group.lat, group.lng], {
      icon: bubbleIcon(group.count),
      keyboard: false,
      title: `${group.count} Repair Cafés here. Click to zoom in.`,
    });
    marker.on('click', () => {
      if (!index) return;
      // Supercluster knows the exact zoom this group comes apart at, so one
      // click always makes progress.
      const target = Math.min(MAX_ZOOM, index.getClusterExpansionZoom(group.id));
      map.flyTo([group.lat, group.lng], target, { duration: 0.8 });
    });
    marker.addTo(groupLayer);
  }

  /** Our own cafe, in a layer of its own so it is never inside a group. */
  function drawOurs(): void {
    if (!oursLayer) return;
    oursLayer.clearLayers();
    const mine = ours;
    if (!mine) return;
    const chosen = sameCafe(mine, selected);
    const marker = L.marker([mine.lat, mine.lng], {
      icon: dotIcon(chosen ? 22 : 18, MINE, '#ffffff', 3),
      keyboard: false,
      title: `${mine.name} (that is us)`,
      zIndexOffset: 1000,
    });
    marker.bindTooltip(textLabel(mine.name), {
      direction: 'top',
      offset: [0, chosen ? -14 : -12],
      permanent: chosen,
      className: 'world-label world-label-on',
    });
    marker.on('click', () => dispatch('select', mine));
    marker.addTo(oursLayer);
  }

  /** Give Leaflet the markers for what is on screen, at this zoom. */
  function redraw(): void {
    if (!map || !L || !index) return;
    const bounds = map.getBounds();
    const zoom = Math.round(map.getZoom());
    // Supercluster copes on its own with a view that has been panned past the
    // date line, or zoomed out until the world repeats.
    const { groups, singles } = groupsInView(
      index,
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom,
    );

    groupLayer.clearLayers();
    cafeLayer.clearLayers();

    for (const group of groups) addGroup(group);
    for (const cafe of singles) addCafe(cafe);
    // Our own pin is not in the grouping, so it is redrawn here rather than
    // only when the data changes. Otherwise picking ourselves would leave the
    // pin looking exactly as it did before.
    drawOurs();
  }

  /** Rebuild everything. Called when the directory or our own cafe changes. */
  function build(): void {
    if (!map || !L) return;
    const mine = ours;
    index = buildClusterIndex(mine ? cafes.filter((c) => c.slug !== mine.slug) : cafes);
    redraw();
  }

  function queueRedraw(): void {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      redraw();
    });
  }

  onMount(async () => {
    try {
      const mod = await import('leaflet');
      L = mod.default ?? mod;
    } catch {
      // No map is a shame, not a failure. The panel beside it still lists and
      // searches every cafe.
      failed = true;
      return;
    }
    if (!container) return;

    const home = ours ?? cafes[0];
    map = L.map(container, {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      // Panning past the edge of the world quietly brings you back to the real
      // one, so the pins are always where the map is.
      worldCopyJump: true,
      // The map is tall and sits in a page people scroll through, so the wheel
      // scrolls the page. Clicking the map first says "I mean this", and then
      // the wheel zooms.
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([home?.lat ?? 25, home?.lng ?? 5], HOME_ZOOM);

    tiles = L.tileLayer(cartoTileUrl(TILE_STYLE, cartoApiKey), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: CARTO_SUBDOMAINS,
      maxZoom: MAX_ZOOM,
    }).addTo(map);

    groupLayer = L.layerGroup().addTo(map);
    cafeLayer = L.layerGroup().addTo(map);
    oursLayer = L.layerGroup().addTo(map);

    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    map.on('moveend', queueRedraw);

    build();
    loaded = true;
  });

  // Redraw when the page hands over different data.
  $: if (map && L) {
    cafes;
    ours;
    build();
  }

  // Restyle when the page changes what is selected.
  $: if (map && L) {
    selected;
    redraw();
  }

  // The key can arrive after the map is drawn, or change while the page is
  // open. Leaflet swaps the address and fetches fresh tiles. Nothing happens
  // when the address is the same as before.
  $: if (tiles) tiles.setUrl(cartoTileUrl(TILE_STYLE, cartoApiKey));

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });
</script>

<div
  class="world-stage"
  bind:this={container}
  role="img"
  aria-label="A map showing Repair Cafes around the world. The same cafes are listed beside it."
></div>

{#if failed}
  <p class="world-fallback">
    The map could not load in this browser. You can still search the list beside it.
  </p>
{/if}

<style>
  .world-stage {
    width: 100%;
    height: 100%;
    /* What shows through until the tiles arrive. */
    background: #eef1ec;
  }

  .world-fallback {
    position: absolute;
    inset: auto 1rem 1rem;
    text-align: center;
    color: rgb(71 85 105);
    font-size: 0.875rem;
  }

  /* Leaflet builds its own markup inside the container, so everything below
     has to reach past the component's own styles. */

  /* This map sits under the site header and any dialog. */
  .world-stage :global(.leaflet-pane) {
    z-index: 0;
  }
  .world-stage :global(.leaflet-top),
  .world-stage :global(.leaflet-bottom) {
    z-index: 1;
  }

  /* The pins are our own HTML, so clear Leaflet's default box. */
  .world-stage :global(.world-pin) {
    background: transparent;
    border: 0;
  }

  /* Café names, as a quiet label rather than Leaflet's speech bubble. */
  .world-stage :global(.world-label) {
    padding: 2px 7px;
    border: 0;
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.94);
    color: rgb(30 41 59);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.22);
  }
  .world-stage :global(.world-label-on) {
    background: #0f5c4e;
    color: #fff;
  }
  .world-stage :global(.world-label::before) {
    display: none;
  }

  /* OpenStreetMap and CARTO both ask to be credited, so the credit stays. */
  .world-stage :global(.leaflet-control-attribution) {
    background: rgba(255, 255, 255, 0.82);
    color: rgb(100 116 139);
    font-size: 10px;
  }
  .world-stage :global(.leaflet-control-attribution a) {
    color: rgb(51 65 85);
  }
</style>
