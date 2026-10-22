<script lang="ts">
  /**
   * A flat map of the cafes near us.
   *
   * Deliberately small and quiet: it exists to show roughly where a handful of
   * neighbouring cafes are, not to be explored. The list beside it is the way
   * to actually read the information, and is what a screen reader or a keyboard
   * uses. Clicking a pin picks that cafe out in the list, and picking one in
   * the list moves the map to it.
   *
   * MapLibre only runs in a browser, so it is loaded after the page has
   * rendered. Until then the card shows a plain placeholder rather than
   * collapsing to nothing.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type * as MapLibre from 'maplibre-gl';
  import type { LocalCafe } from '$lib/localCafes';
  import { MAP_STYLES, hideHillShading, loadMapLibre } from '$lib/mapStyle';

  export let cafes: LocalCafe[] = [];
  /** Our own cafe, drawn differently so it is clearly the middle of the group. */
  export let ours: LocalCafe | null = null;
  export let selectedSlug: string | null = null;
  export let height = '22rem';

  const dispatch = createEventDispatcher<{ select: { slug: string | null } }>();

  let container: HTMLDivElement;
  let ml: typeof MapLibre | null = null;
  let map: MapLibre.Map | null = null;
  let markers: MapLibre.Marker[] = [];
  /** The map exists, so pins can be drawn on it. */
  let ready = false;
  /** The map background has arrived, so the placeholder can go. */
  let shown = false;
  let failed = false;

  /**
   * A pin drawn as HTML rather than an image, so it is in the cafe's own
   * colour. The name sits above it and shows when the pointer is on the pin.
   */
  function pinElement(label: string, name: string, isOurs: boolean, isSelected: boolean): HTMLElement {
    const base = isOurs
      ? 'bg-accent-600 text-white ring-white'
      : isSelected
        ? 'bg-brand-700 text-white ring-white'
        : 'bg-white text-brand-800 ring-brand-600';
    const size = isOurs || isSelected ? 30 : 26;

    const el = document.createElement('div');
    el.className = 'local-cafe-pin';
    const dot = document.createElement('span');
    dot.className = `flex items-center justify-center rounded-full font-bold shadow-md ring-2 ${base}`;
    dot.style.cssText = `width:${size}px;height:${size}px;font-size:${isOurs ? 13 : 12}px`;
    dot.textContent = label;
    // Cafe names come from an outside directory, so they go in as text only.
    const tip = document.createElement('span');
    tip.className = 'local-cafe-label';
    tip.textContent = name;
    el.append(dot, tip);
    return el;
  }

  function points(): LocalCafe[] {
    return ours ? [ours, ...cafes] : cafes;
  }

  function fit() {
    const all = points();
    if (!map || !ml || all.length === 0) return;
    if (all.length === 1) {
      map.jumpTo({ center: [all[0]!.lng, all[0]!.lat], zoom: 11 });
      return;
    }
    const bounds = new ml.LngLatBounds();
    for (const c of all) bounds.extend([c.lng, c.lat]);
    map.fitBounds(bounds, {
      // Room for the pins themselves, with extra at the bottom for the credit
      // line, and a ceiling so two cafes on the same street do not zoom in to
      // individual buildings.
      padding: { top: 40, right: 40, bottom: 64, left: 40 },
      maxZoom: 12,
      animate: false,
    });
  }

  function draw() {
    if (!map || !ml) return;
    for (const marker of markers) marker.remove();
    markers = [];

    cafes.forEach((cafe, i) => {
      if (!cafe.slug) return;
      const el = pinElement(String(i + 1), cafe.name, false, cafe.slug === selectedSlug);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch('select', { slug: cafe.slug });
      });
      markers.push(new ml!.Marker({ element: el }).setLngLat([cafe.lng, cafe.lat]).addTo(map!));
    });

    // Added last, so it sits on top of any pin it overlaps.
    if (ours) {
      const el = pinElement('★', `${ours.name} (that is us)`, true, false);
      markers.push(new ml.Marker({ element: el }).setLngLat([ours.lng, ours.lat]).addTo(map));
    }
  }

  onMount(async () => {
    try {
      ml = await loadMapLibre();
      map = new ml.Map({
        container,
        style: MAP_STYLES.light,
        // A flat map that stays north up. Turning and tilting only get in the
        // way of a map this small.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // The card sits in the middle of a page people are scrolling through,
        // so the wheel must scroll the page, not zoom the map. Clicking the
        // map first says "I mean this", and then the wheel zooms.
        scrollZoom: false,
      });
      hideHillShading(map);
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
      map.on('click', () => map?.scrollZoom.enable());
      map.on('mouseout', () => map?.scrollZoom.disable());
      map.once('load', () => (shown = true));
      // An error before the style has loaded means there is no background to
      // show. Later errors are a missing tile or two, which do not matter.
      map.on('error', () => {
        if (!shown && !map?.isStyleLoaded()) failed = true;
      });
      draw();
      fit();
      ready = true;
    } catch {
      // No map is a shame, not a failure. The list still tells the whole story.
      // This is also where we land when the browser cannot draw with WebGL.
      failed = true;
    }
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });

  // What was drawn last time. Held on an object rather than in plain variables
  // so updating it does not make the block below run itself again.
  const drawn = { key: '', selected: null as string | null };

  // A different set of cafes means redraw and refit. The same set with a
  // different one picked means redraw and glide across to it, because refitting
  // would throw away the zoom the reader is looking at.
  $: if (ready) {
    const key = points()
      .map((c) => c.slug ?? c.name)
      .join('|');
    if (key !== drawn.key) {
      drawn.key = key;
      drawn.selected = selectedSlug;
      draw();
      fit();
    } else if (selectedSlug !== drawn.selected) {
      drawn.selected = selectedSlug;
      draw();
      const chosen = cafes.find((c) => c.slug === selectedSlug);
      if (chosen && map) map.panTo([chosen.lng, chosen.lat]);
    }
  }
</script>

<div class="relative overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-slate-100" style={`height:${height}`}>
  <div bind:this={container} class="local-map h-full w-full" aria-hidden="true"></div>
  {#if !shown || failed}
    <div class="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm text-slate-500">
      {failed ? 'The map could not be loaded. The list below has every cafe.' : 'Loading the map…'}
    </div>
  {/if}
</div>

<style>
  /* Keep the map under any header or dialog, and let it inherit the site's
     typeface. */
  .local-map {
    font: inherit;
    z-index: 0;
  }
  .local-map :global(.maplibregl-ctrl-top-left),
  .local-map :global(.maplibregl-ctrl-bottom-right) {
    z-index: 1;
  }

  .local-map :global(.local-cafe-pin) {
    cursor: pointer;
  }
  /* The pin under the pointer comes to the front, so its name is never
     hidden behind the next pin. */
  .local-map :global(.local-cafe-pin:hover) {
    z-index: 10;
  }
  .local-map :global(.local-cafe-label) {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 7px;
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.96);
    color: rgb(30 41 59);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.22);
    pointer-events: none;
  }
  .local-map :global(.local-cafe-pin:hover .local-cafe-label) {
    display: block;
  }
</style>
