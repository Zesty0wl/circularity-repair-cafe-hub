<script lang="ts" context="module">
  /** One repaircafe.org listing, as the hub's routes describe it. */
  export interface Listing {
    slug: string;
    name: string;
    address: string | null;
    website: string | null;
  }

  /** What the hub answers when asked for suggestions or a search. */
  export interface ListingAnswer {
    available: boolean;
    suggestions: Listing[];
    results: Listing[];
  }
</script>

<script lang="ts">
  /**
   * Pick this cafe's own listing on repaircafe.org.
   *
   * Shows the likely matches first, worked out by the hub from the cafe's name
   * and venue, and a search for when the right one is not among them. It never
   * chooses for the admin: names and addresses are free text, and a town can
   * have several cafes. Used by the setup wizard and the admin dashboard.
   */
  import { onDestroy, onMount } from 'svelte';
  import { ExternalLink, Search } from 'lucide-svelte';

  /** Asks the hub. An empty search term means "just the suggestions". */
  export let load: (q: string) => Promise<ListingAnswer>;
  /** The chosen listing's slug, or null. */
  export let selected: string | null = null;
  /** False once we know the directory cannot be reached. */
  export let available = true;

  let suggestions: Listing[] = [];
  let results: Listing[] = [];
  let loading = true;
  let term = '';
  let searching = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pageUrl = (slug: string) => `https://www.repaircafe.org/cafe/${encodeURIComponent(slug)}`;

  onMount(async () => {
    try {
      const answer = await load('');
      available = answer.available;
      suggestions = answer.suggestions;
    } catch {
      available = false;
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  // Search a moment after the admin stops typing, not on every key.
  function onType() {
    if (timer) clearTimeout(timer);
    const q = term.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    timer = setTimeout(async () => {
      searching = true;
      try {
        results = (await load(q)).results;
      } catch {
        results = [];
      } finally {
        searching = false;
      }
    }, 300);
  }

  function choose(slug: string) {
    selected = selected === slug ? null : slug;
  }
</script>

{#if loading}
  <p class="text-sm text-slate-500">Looking for your cafe on repaircafe.org…</p>
{:else if !available}
  <p class="text-sm text-slate-600">
    We cannot reach the repaircafe.org directory just now. You can link your cafe's page later, under Settings,
    Cafe profile.
  </p>
{:else}
  {#if suggestions.length > 0}
    <p class="text-sm font-medium text-slate-700">Is it one of these?</p>
    <ul class="mt-2 space-y-2">
      {#each suggestions as listing (listing.slug)}
        <li>
          <div
            class="flex items-start gap-3 rounded-xl p-3 ring-1 transition {selected === listing.slug
              ? 'ring-2 ring-brand-600 bg-brand-50'
              : 'ring-slate-200 bg-white'}"
          >
            <button
              type="button"
              class="flex-1 text-left"
              aria-pressed={selected === listing.slug}
              on:click={() => choose(listing.slug)}
            >
              <span class="block font-medium text-slate-900">{listing.name}</span>
              <span class="block text-sm text-slate-500">{listing.address ?? 'No address on the listing'}</span>
            </button>
            <a
              class="shrink-0 text-xs text-brand-700 underline underline-offset-2 inline-flex items-center gap-1 mt-1"
              href={pageUrl(listing.slug)}
              target="_blank"
              rel="noopener"
            >Check it <ExternalLink size={12} /></a>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-sm text-slate-600">We did not find a likely match. Try searching for your cafe's name or town.</p>
  {/if}

  <div class="mt-4">
    <label class="label" for="listing-search">{suggestions.length > 0 ? 'Not in the list? Search' : 'Search'}</label>
    <div class="relative">
      <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        id="listing-search"
        class="input pl-9"
        placeholder="Cafe name or town"
        bind:value={term}
        on:input={onType}
      />
    </div>
    {#if searching}
      <p class="mt-2 text-sm text-slate-500">Searching…</p>
    {:else if term.trim().length >= 2 && results.length === 0}
      <p class="mt-2 text-sm text-slate-500">Nothing found for "{term.trim()}".</p>
    {/if}
    {#if results.length > 0}
      <ul class="mt-2 space-y-2">
        {#each results as listing (listing.slug)}
          <li>
            <div
              class="flex items-start gap-3 rounded-xl p-3 ring-1 transition {selected === listing.slug
                ? 'ring-2 ring-brand-600 bg-brand-50'
                : 'ring-slate-200 bg-white'}"
            >
              <button
                type="button"
                class="flex-1 text-left"
                aria-pressed={selected === listing.slug}
                on:click={() => choose(listing.slug)}
              >
                <span class="block font-medium text-slate-900">{listing.name}</span>
                <span class="block text-sm text-slate-500">{listing.address ?? 'No address on the listing'}</span>
              </button>
              <a
                class="shrink-0 text-xs text-brand-700 underline underline-offset-2 inline-flex items-center gap-1 mt-1"
                href={pageUrl(listing.slug)}
                target="_blank"
                rel="noopener"
              >Check it <ExternalLink size={12} /></a>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
