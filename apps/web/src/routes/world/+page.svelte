<script lang="ts">
  import { onMount } from 'svelte';
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import WorldGlobe from '$lib/components/WorldGlobe.svelte';
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
  let globe: WorldGlobe;

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
    globe?.flyTo(target);
  }

  function clearSelection(): void {
    selected = null;
    globe?.resetView();
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

  function formatKm(km: number): string {
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-GB')} km`;
  }

  const number = (n: number) => n.toLocaleString('en-GB');
</script>

<SiteHeader variant="public" />

<PageHeader
  eyebrow="Repair Café International"
  title="Part of a worldwide movement"
  lede="Every time we fix something together, we join thousands of other Repair Cafés doing the same thing. Here is the whole family, on one globe."
>
  <span slot="icon"><Globe2 size={22} /></span>
</PageHeader>

<!-- ── The globe ─────────────────────────────────────────────────────────── -->
<section class="globe-band">
  <div class="max-w-6xl mx-auto px-4 py-10 md:py-14">
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <!-- Stage -->
      <div class="globe-frame">
        {#if status === 'ready'}
          <WorldGlobe bind:this={globe} {cafes} {ours} {selected} on:select={(e) => choose(e.detail)} />

          <div class="globe-counts">
            <p><strong>{number(cafes.length)}</strong> Repair Cafés on the globe</p>
            <p class="muted">{number(snapshot?.totalListed ?? 0)} listed worldwide</p>
          </div>

          <div class="globe-tools">
            {#if ours}
              <button type="button" class="globe-btn" on:click={showUs}>
                <MapPin size={15} /> Find us
              </button>
            {/if}
            <button type="button" class="globe-btn" on:click={clearSelection}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        {:else if status === 'loading'}
          <div class="globe-state">
            <span class="spinner" aria-hidden="true"></span>
            <p>Loading Repair Cafés from around the world…</p>
          </div>
        {:else}
          <div class="globe-state">
            <p>We could not load the worldwide map just now.</p>
            <a
              class="underline underline-offset-4 hover:text-white"
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
      <aside class="globe-panel">
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
            it. Click a circle to zoom in and split it up. Drag the globe to spin it, and
            click any pin to see that café.
            {#if ours}
              Ours is the white pin with a ring around it.
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
        We are one of the pins on that globe. We run our own sessions, keep our own volunteers and
        raise our own funds, and we follow the same simple idea as everyone else on the map.
      </p>
      <p>
        If you are travelling, or you live somewhere else, use the globe above to find a Repair Café
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
    and are refreshed once a day. Some cafés are listed without a map position, so the globe shows
    slightly fewer than the total. The globe is drawn with
    <a
      class="underline underline-offset-2 hover:text-slate-700"
      href="https://cesium.com/platform/cesiumjs/"
      target="_blank"
      rel="noopener"
    >CesiumJS</a>, and its map is
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
  /* A deep, softly lit backdrop so the planet appears to sit in space. The
     tint follows the cafe's own brand colour. */
  .globe-band {
    background:
      radial-gradient(
        60rem 40rem at 50% 28%,
        rgb(var(--brand-700) / 0.5),
        transparent 70%
      ),
      linear-gradient(180deg, #061512 0%, #04100e 100%);
  }

  .globe-frame {
    position: relative;
    min-height: 26rem;
    height: min(70vh, 34rem);
    border-radius: 1.25rem;
    overflow: hidden;
  }
  @media (min-width: 1024px) {
    .globe-frame {
      height: min(78vh, 40rem);
    }
  }

  /* Readouts sit on top of the canvas. */
  .globe-counts,
  .globe-tools {
    position: absolute;
    pointer-events: none;
    color: #fff;
  }
  .globe-counts {
    left: 1rem;
    bottom: 1rem;
    font-size: 0.85rem;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
  }
  .globe-counts strong {
    font-size: 1.05rem;
    font-weight: 600;
  }
  .globe-counts .muted {
    color: rgba(255, 255, 255, 0.6);
  }
  /* Top right, so the buttons never sit on top of the counts on a narrow
     screen. */
  .globe-tools {
    right: 1rem;
    top: 1rem;
    display: flex;
    gap: 0.5rem;
    pointer-events: auto;
  }
  .globe-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.75rem;
    border-radius: 0.6rem;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 500;
    backdrop-filter: blur(6px);
    transition: background-color 0.15s ease;
  }
  .globe-btn:hover {
    background: rgba(255, 255, 255, 0.22);
  }

  .globe-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    padding: 2rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.75);
  }
  .spinner {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-top-color: #fff;
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
  .globe-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 1.25rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    /* Hug the content rather than stretching to the height of the globe, so an
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
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
  }
  .search-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    color: #fff;
    font-size: 0.9rem;
  }
  .search-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
  .search-input:focus {
    outline: none;
  }
  /* The browser's own clear button is a dark blue cross, which disappears on
     this panel. */
  .search-input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
    width: 0.85rem;
    height: 0.85rem;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.65);
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
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 500;
    transition: background-color 0.15s ease;
  }
  .near-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }
  .near-btn:disabled {
    opacity: 0.55;
  }

  .panel-heading {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
  }
  .panel-note {
    font-size: 0.8rem;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.65);
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
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }
  .result-name {
    font-size: 0.85rem;
    font-weight: 500;
  }
  .result-meta {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-card {
    position: relative;
    padding: 0.85rem 0.9rem;
    border-radius: 0.8rem;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .selected-close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.2rem;
    border-radius: 0.4rem;
    color: rgba(255, 255, 255, 0.6);
  }
  .selected-close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.15);
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
    color: #fbbf24;
  }
  .selected-address {
    margin-top: 0.3rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
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
    color: rgba(255, 255, 255, 0.85);
  }
  .selected-links a:hover {
    color: #fff;
  }
</style>
