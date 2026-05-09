<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import { Calendar, MapPin, Mail, Phone, ChevronDown } from 'lucide-svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';

  interface PublicEvent {
    id: string;
    name: string;
    description: string | null;
    date: string;
    startTime: string;
    endTime: string;
    venue: { name: string; address: string | null; postcode: string | null };
  }
  interface SkillCategory { id: string; name: string; icon: string; colour: string; repairerCount: number }
  interface Repairer { id: string; displayName: string; avatarUrl: string | null; skills: string[] }

  let upcomingEvents: PublicEvent[] = [];
  let categories: SkillCategory[] = [];
  let repairers: Repairer[] = [];
  let openFaq = -1;

  onMount(async () => {
    upcomingEvents = (await api<PublicEvent[]>('/api/public/events').catch(() => [])) ?? [];
    const skills = await api<{ categories: SkillCategory[]; repairers: Repairer[] }>('/api/public/skills').catch(() => ({ categories: [], repairers: [] }));
    categories = skills.categories;
    repairers = skills.repairers;
  });

  function formatDate(d: string): string {
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function shortDate(d: string): string {
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // The same homeVenue is shown for most "When & where" sections.
  $: homeVenue = upcomingEvents[0]?.venue ?? null;
  $: nextEvent = upcomingEvents[0] ?? null;
  $: hp = $cafe?.homePage ?? {};
  $: gallery = $cafe?.gallery ?? [];
</script>

<SiteHeader variant="public" />

<main>
  <!-- ───────────────────────── Hero ───────────────────────── -->
  <section
    class="relative bg-gradient-to-br from-brand-700 to-brand-500 text-white"
    style={$cafe?.bannerUrl ? `background-image: linear-gradient(rgba(49,46,129,.78), rgba(99,102,241,.78)), url('${$cafe.bannerUrl}'); background-size: cover; background-position: center;` : ''}
  >
    <div class="max-w-6xl mx-auto px-4 py-20 md:py-28 flex flex-col md:flex-row items-start md:items-center gap-8">
      {#if $cafe?.logoUrl}
        <img src={$cafe.logoUrl} alt={`${$cafe.name} logo`} class="h-24 w-24 md:h-32 md:w-32 rounded-2xl bg-white/95 p-3 object-contain shadow-lg flex-shrink-0" />
      {/if}
      <div>
        <h1 class="text-4xl md:text-6xl font-bold tracking-tight">{$cafe?.name ?? 'Welcome'}</h1>
        {#if $cafe?.tagline}<p class="mt-4 text-xl md:text-2xl text-white/90 max-w-2xl">{$cafe.tagline}</p>{/if}
        <div class="mt-8 flex flex-wrap gap-3">
          {#if upcomingEvents.length > 0}
            <a href="#when" class="btn-primary !bg-white !text-brand-700 hover:!bg-slate-100"><Calendar size={18} /> See upcoming events</a>
          {:else}
            <a href="/events" class="btn-primary !bg-white !text-brand-700 hover:!bg-slate-100"><Calendar size={18} /> See upcoming events</a>
          {/if}
          <a href="/skills" class="btn-secondary !bg-white/10 !text-white !ring-white/30 hover:!bg-white/20">What we repair</a>
        </div>
      </div>
    </div>
  </section>

  <!-- ───────────────── Short description ────────────────────── -->
  {#if $cafe?.description}
    <section class="max-w-3xl mx-auto px-4 py-12 text-center">
      <p class="text-lg leading-relaxed text-slate-700 whitespace-pre-line">{$cafe.description}</p>
    </section>
  {/if}

  <!-- ───────────────── Next event spotlight ────────────────── -->
  {#if nextEvent}
    <section class="max-w-3xl mx-auto px-4 pb-12">
      <div class="card p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between border-t-4 border-brand-600">
        <div>
          <p class="text-sm font-medium text-brand-700 uppercase tracking-wide">Next event</p>
          <h2 class="mt-2 text-2xl font-semibold">{nextEvent.name}</h2>
          <p class="mt-1 text-slate-600 flex items-center gap-2"><Calendar size={16} /> {formatDate(nextEvent.date)} · {nextEvent.startTime.slice(0,5)}–{nextEvent.endTime.slice(0,5)}</p>
          <p class="mt-1 text-slate-600 flex items-center gap-2"><MapPin size={16} /> {nextEvent.venue.name}</p>
        </div>
        <a href="/events" class="btn-primary">Find out more</a>
      </div>
    </section>
  {/if}

  <!-- ────────────── Intro / "What & Who" body ───────────────── -->
  {#if hp.intro?.body}
    <section class="max-w-4xl mx-auto px-4 py-12">
      {#if hp.intro.heading}<h2 class="text-3xl font-bold tracking-tight uppercase text-slate-900 text-center">{hp.intro.heading}</h2>{/if}
      <div class="mt-6 prose prose-slate max-w-none text-lg leading-relaxed text-slate-700 whitespace-pre-line text-center">{hp.intro.body}</div>
    </section>
  {/if}

  <!-- ──────────────── How it works steps ─────────────────────── -->
  {#if Array.isArray(hp.howItWorks) && hp.howItWorks.length > 0}
    <section class="bg-slate-50 py-14">
      <div class="max-w-6xl mx-auto px-4">
        <h2 class="text-3xl font-bold tracking-tight text-center text-slate-900">How it works</h2>
        <div class="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {#each hp.howItWorks as step, i}
            <div class="card p-6 text-center">
              <div class="w-12 h-12 mx-auto rounded-full bg-brand-600 text-white flex items-center justify-center text-xl font-bold">{i + 1}</div>
              <h3 class="mt-4 text-lg font-semibold">{step.title}</h3>
              <p class="mt-2 text-slate-600 text-sm leading-relaxed whitespace-pre-line">{step.body}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── When & where ──────────────────────── -->
  {#if upcomingEvents.length > 0}
    <section id="when" class="max-w-4xl mx-auto px-4 py-14">
      <h2 class="text-3xl font-bold tracking-tight text-center text-slate-900 uppercase">When &amp; where</h2>
      {#if homeVenue}
        <p class="mt-3 text-center text-slate-600 flex items-center justify-center gap-2">
          <MapPin size={16} /> {homeVenue.name}{#if homeVenue.address}, {homeVenue.address}{/if}{#if homeVenue.postcode} · {homeVenue.postcode}{/if}
        </p>
      {/if}
      <p class="mt-6 text-center text-sm text-slate-500 uppercase tracking-wide">Upcoming dates</p>
      <ul class="mt-4 max-w-md mx-auto divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
        {#each upcomingEvents as e}
          <li class="flex items-center justify-between gap-4 px-5 py-3">
            <div>
              <p class="font-medium text-slate-900">{shortDate(e.date)}</p>
              <p class="text-xs text-slate-500">{e.name}</p>
            </div>
            <span class="text-sm text-slate-600 font-mono tabular-nums">{e.startTime.slice(0,5)}–{e.endTime.slice(0,5)}</span>
          </li>
        {/each}
      </ul>
      <div class="text-center mt-6">
        <a href="/events" class="btn-secondary">See full schedule</a>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── Photo gallery ─────────────────────── -->
  {#if gallery.length > 0}
    <section class="bg-slate-50 py-14">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {#each gallery as img}
            <figure class="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-200 group">
              <img src={img.url} alt={img.caption ?? ''} loading="lazy" class="w-full h-full object-cover transition-transform group-hover:scale-105" />
              {#if img.caption}
                <figcaption class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-2">{img.caption}</figcaption>
              {/if}
            </figure>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ────────────────── What to bring ───────────────────────── -->
  {#if hp.whatToBring?.body}
    <section class="max-w-3xl mx-auto px-4 py-14">
      {#if hp.whatToBring.heading}<h2 class="text-3xl font-bold tracking-tight text-center text-slate-900 uppercase">{hp.whatToBring.heading}</h2>{/if}
      <div class="mt-6 text-lg leading-relaxed text-slate-700 whitespace-pre-line text-center">{hp.whatToBring.body}</div>
    </section>
  {/if}

  <!-- ──────────────── What we repair (categories) ───────────── -->
  {#if categories.length > 0}
    <section class="max-w-6xl mx-auto px-4 pb-12">
      <h2 class="text-3xl font-bold tracking-tight text-center text-slate-900 uppercase">What we repair</h2>
      <div class="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {#each categories as cat}
          <div class="card p-4 text-center">
            <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-white shadow-sm" style="background-color: {cat.colour}">
              <Icon icon={categoryIcon(cat.icon)} width="28" height="28" />
            </div>
            <p class="mt-3 font-medium">{cat.name}</p>
            <p class="text-xs text-slate-500">{cat.repairerCount} volunteer{cat.repairerCount === 1 ? '' : 's'}</p>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ──────────────────── Team ──────────────────────────────── -->
  {#if repairers.length > 0}
    <section class="max-w-6xl mx-auto px-4 pb-16">
      <div class="flex items-end justify-between mb-6">
        <h2 class="text-2xl font-semibold">Meet our team</h2>
        <a href="/skills" class="text-brand-700 hover:underline text-sm">See everyone →</a>
      </div>
      <div class="flex flex-wrap gap-3">
        {#each repairers.slice(0, 12) as r}
          {#if r.avatarUrl}
            <img src={r.avatarUrl} alt={r.displayName} class="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow" />
          {:else}
            <div class="h-14 w-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold ring-2 ring-white shadow">{r.displayName.slice(0,2).toUpperCase()}</div>
          {/if}
        {/each}
      </div>
    </section>
  {/if}

  <!-- ──────────────────── FAQ ──────────────────────────────── -->
  {#if Array.isArray(hp.faqs) && hp.faqs.length > 0}
    <section class="bg-slate-50 py-14">
      <div class="max-w-3xl mx-auto px-4">
        <h2 class="text-3xl font-bold tracking-tight text-center text-slate-900 uppercase">Questions</h2>
        <div class="mt-8 space-y-2">
          {#each hp.faqs as faq, i}
            <details class="bg-white rounded-lg shadow-sm group" open={openFaq === i} on:toggle={(e) => { if ((e.target as HTMLDetailsElement).open) openFaq = i; }}>
              <summary class="cursor-pointer flex items-center justify-between gap-3 px-5 py-4 list-none">
                <span class="font-medium text-slate-900">{faq.q}</span>
                <ChevronDown size={18} class="text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div class="px-5 pb-4 text-slate-600 leading-relaxed whitespace-pre-line">{faq.a}</div>
            </details>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── Contact / address ─────────────────── -->
  {#if $cafe?.contactEmail || $cafe?.address}
    <section class="max-w-3xl mx-auto px-4 py-14 text-center">
      <h2 class="text-2xl font-semibold text-slate-900">Get in touch</h2>
      <div class="mt-4 flex flex-col sm:flex-row gap-6 justify-center text-slate-700">
        {#if $cafe?.contactEmail}
          <a href={`mailto:${$cafe.contactEmail}`} class="flex items-center gap-2 hover:text-brand-700"><Mail size={18} /> {$cafe.contactEmail}</a>
        {/if}
        {#if $cafe?.address}
          <span class="flex items-center gap-2"><MapPin size={18} /> {$cafe.address}</span>
        {/if}
      </div>
    </section>
  {/if}
</main>

<SiteFooter />
