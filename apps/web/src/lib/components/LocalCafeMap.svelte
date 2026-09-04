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
   * Leaflet only runs in a browser, so it is loaded after the page has
   * rendered. Until then the card shows a plain placeholder rather than
   * collapsing to nothing.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { LocalCafe } from '$lib/localCafes';
  import { CARTO_ATTRIBUTION, CARTO_SUBDOMAINS, cartoTileUrl } from '$lib/mapTiles';

  export let cafes: LocalCafe[] = [];
  /** Our own cafe, drawn differently so it is clearly the middle of the group. */
  export let ours: LocalCafe | null = null;
  export let selectedSlug: string | null = null;
  export let height = '22rem';
  /** The cafe's CARTO key, from the public profile. Null means watermarked tiles. */
  export let cartoApiKey: string | null = null;

  const dispatch = createEventDispatcher<{ select: { slug: string | null } }>();

  let container: HTMLDivElement;
  let map: any = null;
  let L: any = null;
  let tiles: any = null;
  let markers = new Map<string, any>();
  let ready = false;
  let failed = false;

  // Map tiles from CARTO, the same source the world map uses. Their light
  // style sits quietly under the brand-coloured pins. See $lib/mapTiles for
  // the address, the credit line and the cafe's key.
  const TILE_STYLE = 'light_all';

  /**
   * A pin drawn as HTML rather than an image. It keeps the pins in the cafe's
   * own colour, and it avoids Leaflet's default marker images, which need a
   * file path that bundlers routinely get wrong.
   */
  function pinIcon(label: string, isOurs: boolean, isSelected: boolean) {
    const base = isOurs
      ? 'bg-accent-600 text-white ring-white'
      : isSelected
        ? 'bg-brand-700 text-white ring-white'
        : 'bg-white text-brand-800 ring-brand-600';
    const size = isOurs || isSelected ? 30 : 26;
    return L.divIcon({
      className: 'local-cafe-pin',
      html:
        `<span class="flex items-center justify-center rounded-full font-bold shadow-md ring-2 ${base}" ` +
        `style="width:${size}px;height:${size}px;font-size:${isOurs ? 13 : 12}px">${label}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function points(): LocalCafe[] {
    return ours ? [ours, ...cafes] : cafes;
  }

  function fit() {
    const all = points();
    if (!map || all.length === 0) return;
    if (all.length === 1) {
      map.setView([all[0]!.lat, all[0]!.lng], 12);
      return;
    }
    map.fitBounds(
      all.map((c) => [c.lat, c.lng]),
      // Room for the pins themselves, and a ceiling so two cafes on the same
      // street do not zoom in to individual buildings.
      { padding: [40, 40], maxZoom: 13 },
    );
  }

  function draw() {
    if (!map || !L) return;
    for (const marker of markers.values()) marker.remove();
    markers = new Map();

    if (ours) {
      const marker = L.marker([ours.lat, ours.lng], {
        icon: pinIcon('★', true, false),
        title: `${ours.name} (that is us)`,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindTooltip(`${ours.name} (that is us)`, { direction: 'top', offset: [0, -16] });
      markers.set('__ours__', marker);
    }

    cafes.forEach((cafe, i) => {
      if (!cafe.slug) return;
      const marker = L.marker([cafe.lat, cafe.lng], {
        icon: pinIcon(String(i + 1), false, cafe.slug === selectedSlug),
        title: cafe.name,
        // Nothing inside the map takes keyboard focus. The map is hidden from
        // screen readers, and putting focus stops inside something hidden
        // strands anyone using a keyboard. The list does that job instead.
        keyboard: false,
        alt: cafe.name,
      }).addTo(map);
      marker.bindTooltip(cafe.name, { direction: 'top', offset: [0, -16] });
      marker.on('click', () => dispatch('select', { slug: cafe.slug }));
      markers.set(cafe.slug, marker);
    });
  }

  onMount(async () => {
    try {
      const mod = await import('leaflet');
      L = mod.default ?? mod;
      map = L.map(container, {
        // The card sits in the middle of a page people are scrolling through,
        // so the wheel must scroll the page, not zoom the map. Clicking the
        // map first says "I mean this", and then the wheel zooms.
        scrollWheelZoom: false,
        attributionControl: true,
        zoomControl: true,
      });
      tiles = L.tileLayer(cartoTileUrl(TILE_STYLE, cartoApiKey), {
        attribution: CARTO_ATTRIBUTION,
        subdomains: CARTO_SUBDOMAINS,
        maxZoom: 19,
      }).addTo(map);
      map.on('click', () => map.scrollWheelZoom.enable());
      map.on('mouseout', () => map.scrollWheelZoom.disable());
      draw();
      fit();
      ready = true;
    } catch {
      // No map is a shame, not a failure. The list still tells the whole story.
      failed = true;
    }
  });

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
      if (chosen && map) map.panTo([chosen.lat, chosen.lng], { animate: true });
    }
  }
</script>

<div class="relative overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-slate-100" style={`height:${height}`}>
  <div bind:this={container} class="h-full w-full" aria-hidden="true"></div>
  {#if !ready}
    <div class="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
      {failed ? 'The map could not be loaded. The list below has every cafe.' : 'Loading the map…'}
    </div>
  {/if}
</div>

<style>
  /* Leaflet writes its own font and z-index rules. Keep the map under any
     header or dialog, and let it inherit the site's typeface. */
  :global(.leaflet-container) {
    font: inherit;
    background: rgb(241 245 249);
    z-index: 0;
  }
  :global(.leaflet-pane) {
    z-index: 0;
  }
  :global(.leaflet-top),
  :global(.leaflet-bottom) {
    z-index: 1;
  }
  /* The pin is our own HTML, so clear Leaflet's default box. */
  :global(.local-cafe-pin) {
    background: transparent;
    border: 0;
  }
  :global(.leaflet-container a.leaflet-popup-close-button) {
    color: rgb(71 85 105);
  }
</style>
