<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { BookOpen, Search, Clock, Gauge, ExternalLink, Loader2 } from 'lucide-svelte';
  import {
    POPULAR_TOPICS,
    difficultyTone,
    type GuideSearchResult,
    type GuideSummary,
  } from '$lib/guides';

  const PAGE_SIZE = 24;

  let term = '';
  let active = '';
  let guides: GuideSummary[] = [];
  let moreResults = false;
  let status: 'idle' | 'loading' | 'more' | 'error' = 'idle';
  /** Rises with every search, so a slow reply cannot overwrite a newer one. */
  let requestId = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  async function fetchGuides(query: string, offset: number): Promise<GuideSearchResult> {
    const res = await fetch(
      `/api/public/guides?q=${encodeURIComponent(query)}&offset=${offset}&limit=${PAGE_SIZE}`,
    );
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as GuideSearchResult;
  }

  async function search(query: string, { push = true } = {}): Promise<void> {
    const q = query.trim();
    active = q;
    if (!q) {
      guides = [];
      moreResults = false;
      status = 'idle';
      if (push) void goto('/guides', { replaceState: true, keepFocus: true, noScroll: true });
      return;
    }

    const mine = ++requestId;
    status = 'loading';
    try {
      const result = await fetchGuides(q, 0);
      if (mine !== requestId) return;
      guides = result.guides;
      moreResults = result.moreResults;
      status = 'idle';
    } catch {
      if (mine !== requestId) return;
      guides = [];
      moreResults = false;
      status = 'error';
    }
    if (push) {
      void goto(`/guides?q=${encodeURIComponent(q)}`, {
        replaceState: true,
        keepFocus: true,
        noScroll: true,
      });
    }
  }

  async function loadMore(): Promise<void> {
    if (status !== 'idle' || !moreResults) return;
    const mine = requestId;
    status = 'more';
    try {
      const result = await fetchGuides(active, guides.length);
      if (mine !== requestId) return;
      guides = [...guides, ...result.guides];
      moreResults = result.moreResults;
      status = 'idle';
    } catch {
      if (mine !== requestId) return;
      status = 'idle';
      moreResults = false;
    }
  }

  /** Wait for a pause in typing, so we do not search on every keystroke. */
  function onInput(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void search(term), 350);
  }

  function pickTopic(topic: string): void {
    term = topic;
    if (debounce) clearTimeout(debounce);
    void search(topic);
  }

  onMount(() => {
    // Let a shared link open straight onto its results.
    const fromUrl = $page.url.searchParams.get('q') ?? '';
    if (fromUrl) {
      term = fromUrl;
      void search(fromUrl, { push: false });
    }
  });

  $: showingTopics = active === '' && status === 'idle';
</script>

<SiteHeader variant="public" />

<PageHeader
  eyebrow="Fix it yourself"
  title="Repair guides"
  lede="Thousands of free, step-by-step guides from iFixit. Look something up before you come, or follow along at the table with us."
>
  <span slot="icon"><BookOpen size={22} /></span>
</PageHeader>

<!-- ── Search ────────────────────────────────────────────────────────────── -->
<section class="max-w-5xl mx-auto px-4 pt-10">
  <label class="sr-only" for="guide-search">Search repair guides</label>
  <div class="search-row">
    <Search size={18} class="shrink-0 text-slate-400" />
    <input
      id="guide-search"
      class="search-input"
      type="search"
      placeholder="What needs fixing? Try a make and model, like &quot;Bosch dishwasher&quot;"
      autocomplete="off"
      bind:value={term}
      on:input={onInput}
      on:keydown={(e) => {
        if (e.key === 'Enter') {
          if (debounce) clearTimeout(debounce);
          void search(term);
        }
      }}
    />
    {#if status === 'loading'}
      <span class="shrink-0 text-slate-400" aria-label="Searching"><Loader2 size={18} class="animate-spin" /></span>
    {/if}
  </div>

  <!-- Starting points, for anyone who has not thought of a search yet. -->
  {#if showingTopics}
    <p class="mt-8 eyebrow text-center">Or start with something common</p>
    <div class="mt-4 flex flex-wrap justify-center gap-2">
      {#each POPULAR_TOPICS as topic}
        <button type="button" class="topic" on:click={() => pickTopic(topic)}>{topic}</button>
      {/each}
    </div>
  {/if}
</section>

<!-- ── Results ───────────────────────────────────────────────────────────── -->
<section class="max-w-5xl mx-auto px-4 py-10">
  {#if status === 'error'}
    <div class="card p-8 text-center">
      <p class="text-slate-700">We could not reach the guide library just now.</p>
      <a
        class="mt-4 inline-flex btn-secondary"
        href="https://www.ifixit.com/Guide"
        target="_blank"
        rel="noopener"
      >
        Search on iFixit <ExternalLink size={16} />
      </a>
    </div>
  {:else if active && guides.length === 0 && status === 'idle'}
    <div class="card p-8 text-center">
      <p class="text-slate-700">No guides found for &ldquo;{active}&rdquo;.</p>
      <p class="mt-2 text-sm text-slate-500">
        Try the make and model, or something more general like &ldquo;laptop battery&rdquo;.
      </p>
    </div>
  {:else if guides.length > 0}
    <p class="eyebrow">
      {guides.length}{moreResults ? '+' : ''} guide{guides.length === 1 ? '' : 's'} for &ldquo;{active}&rdquo;
    </p>

    <div class="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {#each guides as guide (guide.id)}
        <a class="guide-card" href="/guides/{guide.id}">
          <div class="guide-image">
            {#if guide.thumbnail}
              <img src={guide.thumbnail} alt="" loading="lazy" />
            {:else}
              <span class="guide-image-empty"><BookOpen size={26} /></span>
            {/if}
          </div>
          <div class="p-4">
            {#if guide.category}
              <p class="text-xs font-semibold uppercase tracking-wider text-clay truncate">
                {guide.category}
              </p>
            {/if}
            <p class="mt-1 font-semibold text-pine leading-snug">{guide.title}</p>
            {#if guide.summary}
              <p class="mt-2 text-sm text-slate-600 line-clamp-2">{guide.summary}</p>
            {/if}
            <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {#if guide.difficulty}
                <span class="chip ring-1 {difficultyTone(guide.difficulty)}">
                  <Gauge size={12} /> {guide.difficulty}
                </span>
              {/if}
              {#if guide.timeRequired}
                <span class="chip ring-1 bg-slate-100 text-slate-700 ring-slate-200">
                  <Clock size={12} /> {guide.timeRequired}
                </span>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>

    {#if moreResults}
      <div class="mt-8 text-center">
        <button type="button" class="btn-secondary" on:click={loadMore} disabled={status === 'more'}>
          {status === 'more' ? 'Loading…' : 'Show more guides'}
        </button>
      </div>
    {/if}
  {/if}
</section>

<!-- ── Where the guides come from ────────────────────────────────────────── -->
<section class="band">
  <div class="max-w-3xl mx-auto px-4 py-12 text-center">
    <p class="text-slate-700">
      These guides are written by the
      <a
        class="underline underline-offset-2 hover:text-pine"
        href="https://www.ifixit.com"
        target="_blank"
        rel="noopener"
      >iFixit</a>
      community and shared under a
      <a
        class="underline underline-offset-2 hover:text-pine"
        href="https://creativecommons.org/licenses/by-nc-sa/3.0/"
        target="_blank"
        rel="noopener"
      >Creative Commons BY-NC-SA licence</a>. Every guide here links back to the original,
      where you can also find tools, parts and the people who wrote it.
    </p>
  </div>
</section>

<SiteFooter />

<style>
  .search-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.85rem 1.1rem;
    border-radius: 1rem;
    background: #fff;
    border: 1px solid rgb(203 213 225);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  }
  .search-row:focus-within {
    border-color: rgb(var(--brand-500));
    box-shadow: 0 0 0 3px rgb(var(--brand-500) / 0.15);
  }
  .search-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    font-size: 1rem;
    color: rgb(30 41 59);
  }
  .search-input:focus {
    outline: none;
  }
  .search-input::placeholder {
    color: rgb(148 163 184);
  }

  .topic {
    padding: 0.45rem 0.9rem;
    border-radius: 9999px;
    background: #fff;
    border: 1px solid rgb(203 213 225);
    font-size: 0.85rem;
    font-weight: 500;
    color: rgb(51 65 85);
    transition:
      border-color 0.12s ease,
      background-color 0.12s ease;
  }
  .topic:hover,
  .topic:focus-visible {
    background: rgb(var(--brand-50));
    border-color: rgb(var(--brand-400));
    outline: none;
  }

  .guide-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 1rem;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    outline: 1px solid rgb(226 232 240);
    transition: outline-color 0.12s ease;
  }
  .guide-card:hover,
  .guide-card:focus-visible {
    outline: 2px solid rgb(var(--brand-400));
  }

  .guide-image {
    aspect-ratio: 4 / 3;
    background: rgb(241 245 249);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .guide-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .guide-image-empty {
    color: rgb(148 163 184);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    border-radius: 9999px;
    font-weight: 600;
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
