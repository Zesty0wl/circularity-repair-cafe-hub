<script lang="ts">
  /**
   * A flat map of every Repair Café in the worldwide directory.
   *
   * This used to be a 3D globe drawn with CesiumJS. The globe looked good but it
   * did not load reliably: it needs a 14 MB runtime and a looser security policy
   * than the rest of the site. When anything was missing the page showed
   * nothing at all.
   *
   * A flat map does the same job with far less to go wrong. It is drawn with
   * MapLibre GL, the same as the map on the home page, over free OpenFreeMap
   * tiles that need no key. See $lib/mapStyle.
   *
   * Cafés that sit close together are still grouped into one numbered circle,
   * worked out by Supercluster before MapLibre sees anything. MapLibre is only
   * ever handed the markers that are actually on screen, so the map stays quick
   * with several thousand cafés loaded.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type * as MapLibre from 'maplibre-gl';
  import {
    buildClusterIndex,
    groupsInView,
    type CafeGroup,
    type CafeIndex,
    type NetworkCafe,
  } from '$lib/repairCafeNetwork';
  import { MAP_STYLES, hideHillShading, loadMapLibre } from '$lib/mapStyle';

  export let cafes: NetworkCafe[] = [];
  /** This cafe's own entry, drawn larger and never folded into a group. */
  export let ours: NetworkCafe | null = null;
  /** The cafe the page has selected. */
  export let selected: NetworkCafe | null = null;
  /** True once the map is drawn, so the page can drop its placeholder. */
  export let loaded = false;

  const dispatch = createEventDispatcher<{ select: NetworkCafe }>();

  // Fixed colours rather than the cafe's brand palette. A cafe that picked a
  // pale brand colour would have pins nobody could see against the map.
  //
  // Deep green for a cafe and amber for us. Neither appears in the map
  // underneath, which keeps to creams, pale greens and light blues, so a pin is
  // never mistaken for a road or a park.
  const PIN = '#0f5c4e';
  const MINE = '#e07a1f';

  // MapLibre zoom levels. Zoom 1 shows the whole world at once.
  const HOME_ZOOM = 1;
  const CAFE_ZOOM = 11;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 17;

  let container: HTMLDivElement;
  let ml: typeof MapLibre | null = null;
  let map: MapLibre.Map | null = null;
  let markers: MapLibre.Marker[] = [];
  let oursMarker: MapLibre.Marker | null = null;
  let index: CafeIndex | null = null;
  let failed = false;
  let redrawQueued = false;

  function sameCafe(a: NetworkCafe | null, b: NetworkCafe | null): boolean {
    if (!a || !b) return false;
    return a.slug === b.slug && a.name === b.name;
  }

  /**
   * A single café, drawn as a plain dot with its name above it. Café names
   * arrive from an outside directory, so they are put on the page as text and
   * never as markup.
   */
  function dotElement(
    name: string,
    size: number,
    colour: string,
    ring: string,
    ringWidth: number,
    labelOn: boolean,
    labelGreen: boolean,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'world-pin';
    const dot = document.createElement('span');
    dot.style.cssText =
      `display:block;width:${size}px;height:${size}px;border-radius:9999px;` +
      `background:${colour};box-shadow:0 0 0 ${ringWidth}px ${ring},0 1px 4px rgba(0,0,0,.35)`;
    const label = document.createElement('span');
    // Only the chosen cafe keeps its name on screen. Every name at once is
    // unreadable the moment you zoom into a town: nothing here works out which
    // labels are covering which, so a busy street ends up as a pile of text.
    label.className =
      'world-label' + (labelOn ? ' world-label-shown' : '') + (labelGreen ? ' world-label-on' : '');
    label.textContent = name;
    el.append(dot, label);
    return el;
  }

  /** A group of cafés, drawn as a circle with the count in it. */
  function bubbleElement(count: number): HTMLElement {
    const size = Math.round(Math.min(46, 26 + 9 * Math.log10(count)));
    const el = document.createElement('div');
    el.className = 'world-pin';
    el.title = `${count} Repair Cafés here. Click to zoom in.`;
    el.style.cssText =
      `display:flex;align-items:center;justify-content:center;` +
      `width:${size}px;height:${size}px;border-radius:9999px;` +
      `background:${PIN};color:#fff;font-weight:700;` +
      `font-size:${size < 30 ? 11 : 12}px;line-height:1;` +
      `box-shadow:0 0 0 2px rgba(255,255,255,.95),0 2px 7px rgba(0,0,0,.25)`;
    el.textContent = String(count);
    return el;
  }

  /** Point the map at a cafe. */
  export function flyTo(cafe: NetworkCafe): void {
    if (!map) return;
    map.flyTo({ center: [cafe.lng, cafe.lat], zoom: CAFE_ZOOM, duration: 1200 });
  }

  /** Pull back to the opening view. */
  export function resetView(): void {
    if (!map) return;
    const home = ours ?? cafes[0];
    map.flyTo({ center: [home?.lng ?? 5, home?.lat ?? 25], zoom: HOME_ZOOM, duration: 1200 });
  }

  function addMarker(el: HTMLElement, lng: number, lat: number, onClick: () => void): MapLibre.Marker {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return new ml!.Marker({ element: el }).setLngLat([lng, lat]).addTo(map!);
  }

  function addCafe(cafe: NetworkCafe): void {
    const chosen = sameCafe(cafe, selected);
    const el = chosen
      ? dotElement(cafe.name, 16, PIN, '#ffffff', 3, true, true)
      : dotElement(cafe.name, 10, PIN, 'rgba(255,255,255,.95)', 2, false, false);
    if (chosen) el.classList.add('world-pin-chosen');
    markers.push(addMarker(el, cafe.lng, cafe.lat, () => dispatch('select', cafe)));
  }

  function addGroup(group: CafeGroup): void {
    const el = bubbleElement(group.count);
    markers.push(
      addMarker(el, group.lng, group.lat, () => {
        if (!index || !map) return;
        // Supercluster knows the exact zoom this group comes apart at, so one
        // click always makes progress.
        const target = Math.min(MAX_ZOOM, index.getClusterExpansionZoom(group.id));
        map.flyTo({ center: [group.lng, group.lat], zoom: target, duration: 800 });
      }),
    );
  }

  /** Our own cafe, kept out of the grouping so it is never inside a group. */
  function drawOurs(): void {
    oursMarker?.remove();
    oursMarker = null;
    const mine = ours;
    if (!mine || !map || !ml) return;
    const chosen = sameCafe(mine, selected);
    const el = dotElement(`${mine.name} (that is us)`, chosen ? 22 : 18, MINE, '#ffffff', 3, chosen, true);
    el.classList.add('world-pin-ours');
    oursMarker = addMarker(el, mine.lng, mine.lat, () => dispatch('select', mine));
  }

  /** Give MapLibre the markers for what is on screen, at this zoom. */
  function redraw(): void {
    if (!map || !ml || !index) return;
    const bounds = map.getBounds();
    // Supercluster copes on its own with a view that has been panned past the
    // date line, or zoomed out until the world repeats.
    const { groups, singles } = groupsInView(
      index,
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      map.getZoom(),
    );

    for (const marker of markers) marker.remove();
    markers = [];

    for (const group of groups) addGroup(group);
    for (const cafe of singles) addCafe(cafe);
    // Our own pin is not in the grouping, so it is redrawn here rather than
    // only when the data changes. Otherwise picking ourselves would leave the
    // pin looking exactly as it did before.
    drawOurs();
  }

  /** Rebuild everything. Called when the directory or our own cafe changes. */
  function build(): void {
    if (!map || !ml) return;
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
      ml = await loadMapLibre();
      if (!container) return;
      const home = ours ?? cafes[0];
      map = new ml.Map({
        container,
        style: MAP_STYLES.streets,
        center: [home?.lng ?? 5, home?.lat ?? 25],
        zoom: HOME_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // A flat map that stays north up.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // The map is tall and sits in a page people scroll through, so the
        // wheel scrolls the page. Clicking the map first says "I mean this",
        // and then the wheel zooms.
        scrollZoom: false,
      });
    } catch {
      // No map is a shame, not a failure. The panel beside it still lists and
      // searches every cafe. This is also where we land when the browser
      // cannot draw with WebGL.
      failed = true;
      return;
    }

    hideHillShading(map);
    map.touchZoomRotate.disableRotation();
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
    map.on('click', () => map?.scrollZoom.enable());
    map.on('mouseout', () => map?.scrollZoom.disable());
    map.on('moveend', queueRedraw);
    map.once('load', () => (loaded = true));
    // An error before the style has loaded means there is no background to
    // show. Later errors are a missing tile or two, which do not matter.
    map.on('error', () => {
      if (!loaded && !map?.isStyleLoaded()) failed = true;
    });

    build();
  });

  // Redraw when the page hands over different data.
  $: if (map && ml) {
    cafes;
    ours;
    build();
  }

  // Restyle when the page changes what is selected.
  $: if (map && ml) {
    selected;
    redraw();
  }

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
    /* What shows through until the map arrives. */
    background: #eef1ec;
    font: inherit;
  }

  .world-fallback {
    position: absolute;
    inset: auto 1rem 1rem;
    text-align: center;
    color: rgb(71 85 105);
    font-size: 0.875rem;
  }

  /* MapLibre builds its own markup inside the container, so everything below
     has to reach past the component's own styles. */

  /* This map sits under the site header and any dialog. */
  .world-stage :global(.maplibregl-ctrl-top-left),
  .world-stage :global(.maplibregl-ctrl-bottom-right) {
    z-index: 1;
  }

  .world-stage :global(.world-pin) {
    cursor: pointer;
  }
  /* The chosen cafe, then our own, sit above the rest. The pin under the
     pointer comes to the very front, so its name is never hidden. */
  .world-stage :global(.world-pin-chosen) {
    z-index: 5;
  }
  .world-stage :global(.world-pin-ours) {
    z-index: 6;
  }
  .world-stage :global(.world-pin:hover) {
    z-index: 10;
  }

  /* Café names, as a quiet label above the pin. */
  .world-stage :global(.world-label) {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 7px;
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.94);
    color: rgb(30 41 59);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.22);
    pointer-events: none;
  }
  .world-stage :global(.world-label-shown),
  .world-stage :global(.world-pin:hover .world-label) {
    display: block;
  }
  .world-stage :global(.world-label-on) {
    background: #0f5c4e;
    color: #fff;
  }

  /* OpenStreetMap and OpenFreeMap both ask to be credited, so the credit
     stays. */
  .world-stage :global(.maplibregl-ctrl-attrib) {
    background: rgba(255, 255, 255, 0.82);
    color: rgb(100 116 139);
    font-size: 10px;
  }
  .world-stage :global(.maplibregl-ctrl-attrib a) {
    color: rgb(51 65 85);
  }
</style>
