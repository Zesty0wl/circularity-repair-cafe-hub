<script lang="ts">
  import { onMount } from 'svelte';
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import WorldMap from '$lib/components/WorldMap.svelte';
  import { Globe2, Search, LocateFixed, ExternalLink, MapPin, X, RotateCcw } from 'lucide-svelte';
  import {
    cafeUrl,
    nearest,
    searchCafes,
    type NetworkCafe,
    type NetworkSnapshot,
  } from '$lib/repairCafeNetwork';

  let snapshot: NetworkSnapshot | null = null;
  let status: 'loading' | 'ready' | 'error' = 'loading';
  let worldMap: WorldMap;

  let term = '';
  let selected: NetworkCafe | null = null;
  /** Cafes near the visitor, once they ask for them. */
  let nearby: Array<NetworkCafe & { km: number }> = [];
  let locating = false;
  let locateError = '';

  $: cafes = snapshot?.cafes ?? [];
  $: ours = snapshot?.ours ?? null;
  $: results = searchCafes(cafes, term);
  $: cafeName = $cafe?.name || 'our Repair Café';

  onMount(async () => {
    try {
      const res = await fetch('/api/public/repair-cafe-network');
      if (!res.ok) throw new Error(String(res.status));
      snapshot = (await res.json()) as NetworkSnapshot;
      status = 'ready';
    } catch {
      status = 'error';
    }
  });

  function choose(target: NetworkCafe): void {
    selected = target;
    worldMap?.flyTo(target);
  }

  function clearSelection(): void {
    selected = null;
    worldMap?.resetView();
  }

  function showUs(): void {
    if (ours) choose(ours);
  }

  /** Ask the browser where the visitor is, then list the closest cafes. */
  function findNearMe(): void {
    locateError = '';
    if (!navigator.geolocation) {
      locateError = 'Your browser cannot share your location.';
      return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locating = false;
        term = '';
        nearby = nearest(cafes, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        if (nearby[0]) choose(nearby[0]);
      },
      () => {
        locating = false;
        locateError = 'We could not get your location. Please search instead.';
      },
      { timeout: 10_000 },
    );
  }

  /**
   * Where the figures cafes choose to share are published. This is the same
   * service the software sends to, set on the server as TELEMETRY_ENDPOINT.
   */
  const TELEMETRY_SITE = 'https://repaircafetelemetry.bzwrd.co.uk';

  function formatKm(km: number): string {
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-GB')} km`;
  }

  const number = (n: number) => n.toLocaleString('en-GB');
</script>

<SiteHeader variant="public" />

<PageHeader
  eyebrow="Repair Café International"
  title="Part of a worldwide movement"
  lede="Every time we fix something together, we join thousands of other Repair Cafés doing the same thing. Here is the whole family, on one map."
>
  <span slot="icon"><Globe2 size={22} /></span>
</PageHeader>

<!-- ── The map ───────────────────────────────────────────────────────────── -->
<section class="map-band">
  <div class="max-w-6xl mx-auto px-4 py-10 md:py-14">
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <!-- Stage -->
      <div class="map-frame">
        {#if status === 'ready'}
          <WorldMap bind:this={worldMap} {cafes} {ours} {selected} on:select={(e) => choose(e.detail)} />

          <div class="map-counts">
            <p><strong>{number(cafes.length)}</strong> Repair Cafés on the map</p>
            <p class="muted">{number(snapshot?.totalListed ?? 0)} listed worldwide</p>
          </div>

          <div class="map-tools">
            {#if ours}
              <button type="button" class="map-btn" on:click={showUs}>
                <MapPin size={15} /> Find us
              </button>
            {/if}
            <button type="button" class="map-btn" on:click={clearSelection}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        {:else if status === 'loading'}
          <div class="map-state">
            <span class="spinner" aria-hidden="true"></span>
            <p>Loading Repair Cafés from around the world…</p>
          </div>
        {:else}
          <div class="map-state">
            <p>We could not load the worldwide map just now.</p>
            <a
              class="underline underline-offset-4 hover:text-brand-800"
              href="https://www.repaircafe.org/en/visit/"
              target="_blank"
              rel="noopener"
            >
              Browse the map on repaircafe.org
            </a>
          </div>
        {/if}
      </div>

      <!-- Search and results -->
      <aside class="map-panel">
        <label class="sr-only" for="cafe-search">Search Repair Cafés</label>
        <div class="search-row">
          <Search size={16} class="shrink-0 opacity-60" />
          <input
            id="cafe-search"
            class="search-input"
            type="search"
            placeholder="Search by name or town"
            autocomplete="off"
            bind:value={term}
            disabled={status !== 'ready'}
          />
        </div>

        <button
          type="button"
          class="near-btn"
          on:click={findNearMe}
          disabled={status !== 'ready' || locating}
        >
          <LocateFixed size={15} />
          {locating ? 'Finding you…' : 'Find cafés near me'}
        </button>
        {#if locateError}<p class="panel-note">{locateError}</p>{/if}

        {#if selected}
          <div class="selected-card">
            <button type="button" class="selected-close" on:click={clearSelection} aria-label="Close">
              <X size={15} />
            </button>
            <p class="selected-name">{selected.name}</p>
            {#if ours && selected.slug === ours.slug}
              <p class="selected-badge">This is us</p>
            {/if}
            {#if selected.address}<p class="selected-address">{selected.address}</p>{/if}
            <div class="selected-links">
              {#if cafeUrl(selected)}
                <a href={cafeUrl(selected)} target="_blank" rel="noopener">
                  On repaircafe.org <ExternalLink size={13} />
                </a>
              {/if}
              {#if selected.website}
                <a href={selected.website} target="_blank" rel="noopener noreferrer">
                  Their website <ExternalLink size={13} />
                </a>
              {/if}
            </div>
          </div>
        {/if}

        {#if term.trim().length >= 2}
          <p class="panel-heading">
            {results.length > 0 ? `${number(results.length)} match${results.length === 1 ? '' : 'es'}` : 'No matches'}
          </p>
          <ul class="result-list">
            {#each results as result (result.slug ?? result.name + result.lat)}
              <li>
                <button type="button" class="result" on:click={() => choose(result)}>
                  <span class="result-name">{result.name}</span>
                  {#if result.address}<span class="result-meta">{result.address}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else if nearby.length > 0}
          <p class="panel-heading">Closest to you</p>
          <ul class="result-list">
            {#each nearby as near (near.slug ?? near.name + near.lat)}
              <li>
                <button type="button" class="result" on:click={() => choose(near)}>
                  <span class="result-name">{near.name}</span>
                  <span class="result-meta">{formatKm(near.km)} away</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="panel-note">
            Where cafés sit close together they are grouped into one circle with a number in
            it. Click a circle to zoom in and split it up. Drag the map to move around,
            and click any pin to see that café.
            {#if ours}
              Ours is the orange pin, and every other café is green.
            {/if}
          </p>
        {/if}
      </aside>
    </div>
  </div>
</section>

<!-- ── What the organisation is ──────────────────────────────────────────── -->
<section class="max-w-4xl mx-auto px-4 py-16 md:py-20">
  <SectionHeading eyebrow="Where it started" title="What is Repair Café International?" />

  <div class="mt-8 space-y-5 text-lg text-slate-700">
    <p>
      The first Repair Café was held in Amsterdam on 18 October 2009. Martine Postma, a Dutch
      journalist, wanted to show that repairing things is practical, sociable and worth doing. People
      brought broken lamps, clothes and bicycles, and volunteers helped them fix the items themselves.
    </p>
    <p>
      The idea spread quickly. In 2011 the Repair Café International Foundation was set up to help
      other groups start their own. It is a non-profit organisation based in the Netherlands. It does
      not run the local cafés. Instead it gives new groups the advice, materials and shared name they
      need to get going.
    </p>
    <p>
      Every Repair Café is run by local volunteers and makes its own decisions. What we share is the
      idea: bring a broken thing, sit down with someone who knows how to fix it, and learn something
      while you are there. Nothing is thrown away that could have been saved.
    </p>
  </div>

  <div class="mt-10 grid gap-4 sm:grid-cols-3">
    <div class="card p-5">
      <p class="text-3xl font-display font-semibold text-pine">2009</p>
      <p class="mt-1 text-sm text-slate-600">The first Repair Café, in Amsterdam.</p>
    </div>
    <div class="card p-5">
      <p class="text-3xl font-display font-semibold text-pine">2011</p>
      <p class="mt-1 text-sm text-slate-600">The foundation starts helping new groups.</p>
    </div>
    <div class="card p-5">
      <p class="text-3xl font-display font-semibold text-pine">
        {status === 'ready' ? number(snapshot?.totalListed ?? 0) : 'Thousands'}
      </p>
      <p class="mt-1 text-sm text-slate-600">Repair Cafés listed around the world today.</p>
    </div>
  </div>
</section>

<!-- ── How we fit in ─────────────────────────────────────────────────────── -->
<section class="band">
  <div class="max-w-4xl mx-auto px-4 py-16 md:py-20">
    <SectionHeading eyebrow="Our place in it" title="How {cafeName} fits in" />
    <div class="mt-8 space-y-5 text-lg text-slate-700">
      <p>
        We are one of the pins on that map. We run our own sessions, keep our own volunteers and
        raise our own funds, and we follow the same simple idea as everyone else on the map.
      </p>
      <p>
        If you are travelling, or you live somewhere else, use the map above to find a Repair Café
        near you. If there is not one yet, you can start one. The foundation has a starter kit and
        will help you set it up.
      </p>
    </div>

    <div class="mt-8 flex flex-wrap gap-3">
      <a class="btn-primary" href="https://www.repaircafe.org/en/" target="_blank" rel="noopener">
        Visit repaircafe.org <ExternalLink size={16} />
      </a>
      <a
        class="btn-secondary"
        href="https://www.repaircafe.org/en/start/"
        target="_blank"
        rel="noopener"
      >
        Start a Repair Café <ExternalLink size={16} />
      </a>
    </div>
  </div>
</section>

<!-- ── Cafés running this software ───────────────────────────────────────── -->
<section class="max-w-4xl mx-auto px-4 py-16 md:py-20">
  <SectionHeading eyebrow="Open figures" title="Cafés running this software" />

  <div class="mt-8 space-y-5 text-lg text-slate-700">
    <p>
      This website runs on Repair Café Hub. It is free software that any Repair Café can use to
      run its own site, book its sessions and keep track of what it repairs.
    </p>
    <p>
      Cafés using it can choose to share a few counts with us: how many repairs they recorded,
      how many were fixed, and the kinds of thing they saw. No names, no notes and no
      photographs are ever sent. We publish every figure we are given on one open page, so
      anyone can see how much the software is used and what it all adds up to.
    </p>
  </div>

  <div class="mt-8">
    <a class="btn-primary" href={TELEMETRY_SITE} target="_blank" rel="noopener">
      See the shared figures <ExternalLink size={16} />
    </a>
  </div>
</section>

<!-- ── Where the data comes from ─────────────────────────────────────────── -->
<section class="max-w-4xl mx-auto px-4 py-10">
  <p class="text-sm text-slate-500">
    Café locations come from the
    <a
      class="underline underline-offset-2 hover:text-slate-700"
      href="https://www.repaircafe.org/en/api/"
      target="_blank"
      rel="noopener"
    >Repair Café location API</a>
    and are refreshed once a day. Some cafés are listed without a map position, so the map shows
    slightly fewer than the total. The map is drawn with
    <a
      class="underline underline-offset-2 hover:text-slate-700"
      href="https://leafletjs.com/"
      target="_blank"
      rel="noopener"
    >Leaflet</a>, and its tiles are
    &copy; <a
      class="underline underline-offset-2 hover:text-slate-700"
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noopener"
    >OpenStreetMap</a> contributors, &copy; <a
      class="underline underline-offset-2 hover:text-slate-700"
      href="https://carto.com/attributions"
      target="_blank"
      rel="noopener"
    >CARTO</a>.
  </p>
</section>

<SiteFooter />

<style>
  /* A softly tinted band, the same one the rest of the site uses, so the map
     reads as part of the page rather than a picture dropped on it. The tint
     follows the cafe's own brand colour. */
  .map-band {
    background: rgb(var(--brand-50));
    /* No line along the top: the page heading above uses this same tint, so the
       two run together as one opening block. The section below is a different
       colour, which is what the bottom line tidies up. */
    border-bottom: 1px solid rgb(var(--brand-100));
  }

  .map-frame {
    position: relative;
    min-height: 26rem;
    height: min(70vh, 34rem);
    border-radius: 1.25rem;
    overflow: hidden;
    /* Its own background, for the moments before the map itself is there. */
    background: rgb(241 245 249);
    box-shadow: 0 0 0 1px rgb(226 232 240);
  }
  @media (min-width: 1024px) {
    .map-frame {
      height: min(78vh, 40rem);
    }
  }

  /* Readouts sit on top of the map, so they carry their own background. */
  .map-counts,
  .map-tools {
    position: absolute;
    pointer-events: none;
    /* Above Leaflet's own controls, which sit in the same corners. */
    z-index: 2;
  }
  .map-counts {
    left: 1rem;
    /* Clear of Leaflet's credit, which on a narrow screen is a bar across the
       whole width of the map. */
    bottom: 1.6rem;
    padding: 0.35rem 0.6rem;
    border-radius: 0.6rem;
    background: rgba(255, 255, 255, 0.92);
    color: rgb(30 41 59);
    font-size: 0.85rem;
    box-shadow: 0 1px 6px rgba(15, 23, 42, 0.16);
  }
  .map-counts strong {
    font-size: 1.05rem;
    font-weight: 600;
  }
  .map-counts .muted {
    color: rgb(100 116 139);
  }
  /* Top right, so the buttons never sit on top of the counts on a narrow
     screen. */
  .map-tools {
    right: 1rem;
    top: 1rem;
    display: flex;
    gap: 0.5rem;
    pointer-events: auto;
  }
  .map-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.75rem;
    border-radius: 0.6rem;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgb(226 232 240);
    color: rgb(30 41 59);
    font-size: 0.8rem;
    font-weight: 500;
    box-shadow: 0 1px 5px rgba(15, 23, 42, 0.14);
    transition: background-color 0.15s ease;
  }
  .map-btn:hover {
    background: #fff;
    border-color: rgb(var(--brand-300));
  }

  .map-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    padding: 2rem;
    text-align: center;
    color: rgb(71 85 105);
  }
  .map-state a {
    color: rgb(var(--brand-700));
  }
  .spinner {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    border: 2px solid rgb(203 213 225);
    border-top-color: rgb(var(--brand-600));
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 3s;
    }
  }

  /* ── Side panel ──────────────────────────────────────────────────────── */
  .map-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 1.25rem;
    background: #fff;
    border: 1px solid rgb(226 232 240);
    color: rgb(30 41 59);
    /* Hug the content rather than stretching to the height of the map, so an
       empty panel is not a tall empty box. */
    align-self: start;
    max-height: min(78vh, 40rem);
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-radius: 0.7rem;
    background: rgb(248 250 252);
    border: 1px solid rgb(226 232 240);
  }
  .search-row:focus-within {
    border-color: rgb(var(--brand-400));
  }
  .search-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    color: rgb(30 41 59);
    font-size: 0.9rem;
  }
  .search-input::placeholder {
    color: rgb(100 116 139);
  }
  .search-input:focus {
    outline: none;
  }
  /* Match the browser's own clear button to the panel's text colour. */
  .search-input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
    width: 0.85rem;
    height: 0.85rem;
    cursor: pointer;
    background-color: rgb(100 116 139);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E")
      center / contain no-repeat;
  }

  .near-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.7rem;
    background: rgb(248 250 252);
    border: 1px solid rgb(226 232 240);
    color: rgb(30 41 59);
    font-size: 0.85rem;
    font-weight: 500;
    transition: background-color 0.15s ease;
  }
  .near-btn:hover:not(:disabled) {
    background: rgb(var(--brand-50));
    border-color: rgb(var(--brand-300));
  }
  .near-btn:disabled {
    opacity: 0.55;
  }

  .panel-heading {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgb(100 116 139);
  }
  .panel-note {
    font-size: 0.8rem;
    line-height: 1.5;
    color: rgb(71 85 105);
  }

  .result-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .result {
    display: flex;
    flex-direction: column;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-radius: 0.6rem;
    transition: background-color 0.12s ease;
  }
  .result:hover,
  .result:focus-visible {
    background: rgb(var(--brand-50));
    outline: none;
  }
  .result-name {
    font-size: 0.85rem;
    font-weight: 500;
  }
  .result-meta {
    font-size: 0.75rem;
    color: rgb(100 116 139);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-card {
    position: relative;
    padding: 0.85rem 0.9rem;
    border-radius: 0.8rem;
    background: rgb(var(--brand-50));
    border: 1px solid rgb(var(--brand-200));
  }
  .selected-close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.2rem;
    border-radius: 0.4rem;
    color: rgb(100 116 139);
  }
  .selected-close:hover {
    color: rgb(15 23 42);
    background: rgb(var(--brand-100));
  }
  .selected-name {
    padding-right: 1.5rem;
    font-weight: 600;
    line-height: 1.3;
  }
  .selected-badge {
    margin-top: 0.15rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: rgb(var(--accent-600));
  }
  .selected-address {
    margin-top: 0.3rem;
    font-size: 0.8rem;
    color: rgb(71 85 105);
  }
  .selected-links {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .selected-links a {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    text-decoration: underline;
    text-underline-offset: 2px;
    color: rgb(var(--brand-700));
  }
  .selected-links a:hover {
    color: rgb(var(--brand-800));
  }
</style>
