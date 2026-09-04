<script lang="ts">
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import VolunteerCard from '$lib/components/VolunteerCard.svelte';
  import NextSessionCta from '$lib/components/NextSessionCta.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import { Calendar, Clock, MapPin, ChevronDown, CheckCircle2, Laptop, ExternalLink } from 'lucide-svelte';
  import type { PageData } from './$types';

  interface LinuxEvent {
    id: string;
    name: string;
    description: string | null;
    date: string;
    startTime: string;
    endTime: string;
    venue: { name: string; address: string | null; postcode: string | null };
  }
  interface Volunteer {
    id: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    joinDate: string | null;
  }
  interface LinuxStats {
    installCount: number;
    installedCount: number;
    advisedCount: number;
    sessionCount: number;
    volunteerCount: number;
    co2SavedKg: number;
  }

  export let data: PageData;

  $: page = (data.page ?? {}) as Record<string, any>;
  $: upcoming = (data.upcomingEvents ?? []) as LinuxEvent[];
  $: volunteers = (data.volunteers ?? []) as Volunteer[];
  $: stats = (data.stats ?? null) as LinuxStats | null;

  // How much of each list the page shows before it hands off to a fuller one.
  const DATE_PREVIEW = 4;
  const TEAM_PREVIEW = 6;

  let openFaq = -1;

  $: cafeName = $cafe?.name ?? 'Repair Café';
  $: heroHeading = page.hero?.heading?.trim() || 'Linux Repair Cafe';
  $: heroTagline = page.hero?.tagline?.trim() || '';
  $: nextEvent = upcoming[0] ?? null;
  $: homeVenue = upcoming[0]?.venue ?? null;

  function formatDateShort(d: string): string {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    });
  }
  function dateParts(d: string) {
    const dt = new Date(d + 'T12:00:00Z');
    return {
      day: dt.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' }),
      monthShort: dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      weekdayLong: dt.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    };
  }
  function noWrap(s: string): string {
    return s.replace(/\s+/g, ' ');
  }

  // The intro reads as one lead paragraph followed by supporting ones, the
  // same as the home page, so the two pages feel like one site.
  $: introParagraphs = String(page.intro?.body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // "What to bring" can be bullets or prose. Same rule as the home page: if
  // most non-empty lines look like bullets, show a checklist.
  function parseBringList(body: string): { items: string[]; isList: boolean; paragraphs: string[] } {
    const lines = (body ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const bulletRe = /^(?:[-*•]|\d+[.)])\s+(.+)$/;
    const items: string[] = [];
    let bulletCount = 0;
    for (const l of lines) {
      const m = l.match(bulletRe);
      if (m) { items.push(m[1]!.trim()); bulletCount++; }
      else items.push(l);
    }
    const isList = bulletCount >= 2 && bulletCount >= lines.length - 1;
    const paragraphs = (body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return { items, isList, paragraphs };
  }
  $: bring = parseBringList(String(page.whatToBring?.body ?? ''));

  // ── What we have managed so far ───────────────────────────────────────────
  // Off unless the cafe turns it on, and each figure is dropped while it is
  // still zero, so a cafe that has just started never shows a row of noughts.
  $: showStats = page.showStats !== false && stats !== null;
  $: statTiles = !stats
    ? []
    : [
        { value: stats.installedCount.toLocaleString('en-GB'), label: 'Computers now running Linux', show: stats.installedCount > 0 },
        { value: `${stats.co2SavedKg.toLocaleString('en-GB')} kg`, label: 'CO₂ saved', show: stats.co2SavedKg > 0 },
        { value: stats.advisedCount.toLocaleString('en-GB'), label: 'People we advised', show: stats.advisedCount > 0 },
        { value: stats.sessionCount.toLocaleString('en-GB'), label: 'Sessions held', show: stats.sessionCount > 0 },
      ].filter((t) => t.show);
</script>

<SiteHeader variant="public" />

<main>
  <!-- ───────────────────────── Hero ───────────────────────── -->
  <section class="bg-brand-600 text-white">
    <div class="max-w-3xl mx-auto px-4 py-20 md:py-28 text-center">
      <span class="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-white/10 ring-1 ring-white/20">
        <Laptop size={32} />
      </span>
      <h1 class="mt-6 text-4xl md:text-6xl font-bold tracking-tight">{heroHeading}</h1>
      {#if heroTagline}
        <p class="mt-4 text-xl md:text-2xl text-white/90">{heroTagline}</p>
      {/if}

      {#if nextEvent}
        <div class="mt-10 inline-flex flex-col items-center gap-1 rounded-2xl bg-white/10 ring-1 ring-white/20 px-6 py-4">
          <span class="eyebrow text-white/70">Next session with Linux help</span>
          <span class="text-lg font-semibold">
            {formatDateShort(nextEvent.date)}, {nextEvent.startTime.slice(0,5)}–{nextEvent.endTime.slice(0,5)}
          </span>
          {#if homeVenue}
            <span class="flex items-start justify-center gap-1.5 text-sm text-white/75">
              <MapPin size={15} class="shrink-0 mt-0.5" />
              <span>{homeVenue.name}</span>
            </span>
          {/if}
        </div>
      {/if}

      <div class="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 sm:justify-center">
        {#if upcoming.length > 0}
          <a href="#dates" class="btn-primary !bg-white !text-brand-800 hover:!bg-slate-100">
            <Calendar size={18} /> See when to come
          </a>
        {:else}
          <a href="/events" class="btn-primary !bg-white !text-brand-800 hover:!bg-slate-100">
            <Calendar size={18} /> See upcoming events
          </a>
        {/if}
        <a href="/contact" class="btn-secondary !bg-white/10 !text-white !ring-white/40 hover:!bg-white/20">Ask us a question</a>
      </div>
    </div>
  </section>

  <!-- ──────────────── What this is ───────────────── -->
  {#if page.intro?.body || page.intro?.heading}
    <section class="section">
      <div class="max-w-2xl mx-auto text-center">
        {#if page.intro?.heading}
          <h2 class="section-title">{page.intro.heading}</h2>
        {/if}
        {#if introParagraphs.length > 0}
          <p class="mt-6 text-xl sm:text-2xl leading-relaxed font-medium text-slate-800 whitespace-pre-line">
            {introParagraphs[0]}
          </p>
          {#each introParagraphs.slice(1) as p}
            <p class="mt-4 text-lg leading-relaxed text-slate-600 whitespace-pre-line">{p}</p>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  <!-- ──────────────── How it works ─────────────────────── -->
  {#if Array.isArray(page.howItWorks) && page.howItWorks.length > 0}
    <section class="band">
      <div class="section">
        <SectionHeading eyebrow="Your visit" title="How it works" />
        <div class="relative mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
          <div aria-hidden="true" class="hidden lg:block absolute top-6 left-[12.5%] right-[12.5%] h-px bg-brand-200"></div>
          {#each page.howItWorks as step, i}
            <div class="relative text-center">
              <div class="w-12 h-12 mx-auto rounded-full bg-brand-600 text-white ring-8 ring-brand-50 flex items-center justify-center text-xl font-bold font-display">{i + 1}</div>
              <h3 class="mt-4 text-lg font-semibold text-pine">{step.title}</h3>
              <p class="mt-2 text-slate-600 text-sm leading-relaxed whitespace-pre-line">{step.body}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── What we have managed ─────────────────────── -->
  {#if showStats && statTiles.length > 0}
    <section class="bg-brand-800 text-white">
      <div class="section">
        <SectionHeading
          tone="inverse"
          eyebrow="What we have done together"
          title="Computers saved"
          lede="Every computer that keeps working is one that nobody had to buy, and one that stays out of the bin."
        />
        <dl class="mt-12 grid grid-cols-2 gap-8 {statTiles.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}">
          {#each statTiles as tile}
            <div class="text-center">
              <dt class="sr-only">{tile.label}</dt>
              <dd>
                <span class="block font-display text-4xl md:text-5xl font-bold leading-none">{tile.value}</span>
                <span class="mt-3 block text-sm text-white/75">{tile.label}</span>
              </dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>
  {/if}

  <!-- ────────────────── What to bring ───────────────────────── -->
  {#if page.whatToBring?.body}
    <section class="section">
      <SectionHeading eyebrow="Before you come" title={page.whatToBring.heading || 'What to bring'} />
      <div class="mt-10 max-w-3xl mx-auto card p-6 sm:p-10">
        {#if bring.isList}
          <ul class="space-y-4">
            {#each bring.items as item}
              <li class="flex items-start gap-3 text-slate-700">
                <CheckCircle2 size={20} class="text-brand-600 shrink-0 mt-0.5" />
                <span class="leading-relaxed">{item}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="space-y-4">
            {#each bring.paragraphs as p}
              <p class="text-lg leading-relaxed text-slate-700 whitespace-pre-line">{p}</p>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <!-- ──────────────────── When ──────────────────────── -->
  {#if upcoming.length > 0}
    <section id="dates" class="band">
      <div class="section">
        <SectionHeading
          eyebrow="Mark your calendar"
          title="When to come"
          lede="Linux help runs as part of our ordinary repair sessions. Come to any of these and bring your computer."
        >
          {#if homeVenue}
            <p class="section-lede">
              <MapPin size={18} class="inline-block align-text-bottom mr-1.5" />{homeVenue.name}{#if homeVenue.address}, {homeVenue.address}{/if}{#if homeVenue.postcode}{' · '}{noWrap(homeVenue.postcode)}{/if}
            </p>
          {/if}
        </SectionHeading>

        <div class="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {#each upcoming.slice(0, DATE_PREVIEW) as e, i}
            {@const p = dateParts(e.date)}
            <div class="group relative card overflow-hidden text-center transition-shadow hover:ring-brand-400">
              {#if i === 0}
                <span class="absolute top-2 right-2 z-10 rounded-full bg-accent-600 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Next</span>
              {/if}
              <div class="absolute top-2 left-2 z-10">
                <AddToCalendar event={e} variant="compact" class="!bg-brand-800/90 !text-white !ring-white/20 hover:!bg-brand-800" />
              </div>
              <a href={`/events/${e.id}`} class="block">
                <div class="text-xs font-bold uppercase tracking-wider py-1.5 {i === 0 ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-800'}">{p.monthShort}</div>
                <div class="px-3 py-5">
                  <div class="text-4xl font-bold font-display text-pine leading-none">{p.day}</div>
                  <div class="mt-1 text-sm text-slate-500">{p.weekdayLong}</div>
                  <div class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                    <Clock size={12} class="text-clay" /> {e.startTime.slice(0,5)}–{e.endTime.slice(0,5)}
                  </div>
                </div>
              </a>
            </div>
          {/each}
        </div>

        <div class="text-center mt-10">
          {#if upcoming.length > DATE_PREVIEW}
            <p class="mb-4 text-sm text-slate-500">
              We have {upcoming.length - DATE_PREVIEW} more {upcoming.length - DATE_PREVIEW === 1 ? 'date' : 'dates'} with Linux help after these.
            </p>
          {/if}
          <a href="/events" class="btn-secondary">See every session</a>
        </div>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── Who will help ──────────────────────── -->
  {#if volunteers.length > 0}
    <section class="section">
      <SectionHeading
        eyebrow="The people who will help you"
        title="Our Linux volunteers"
        lede="They will install it with you, not for you, so you leave knowing how your computer works."
      />
      <div class="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each volunteers.slice(0, TEAM_PREVIEW) as v}
          <VolunteerCard volunteer={{ ...v, skills: [] }} />
        {/each}
      </div>
      {#if volunteers.length > TEAM_PREVIEW}
        <div class="text-center mt-10">
          <a href="/skills" class="btn-secondary">Meet the whole team</a>
        </div>
      {/if}
    </section>
  {/if}

  <!-- ──────────────────── FAQ ──────────────────────────────── -->
  {#if Array.isArray(page.faqs) && page.faqs.length > 0}
    <section class="band">
      <div class="section">
        <SectionHeading eyebrow="Good to know" title="Common questions" />
        <div class="mt-10 max-w-3xl mx-auto space-y-3">
          {#each page.faqs as faq, i}
            <details
              class="group card transition-shadow hover:ring-brand-400 open:ring-brand-400"
              open={openFaq === i}
              on:toggle={(e) => { if ((e.target as HTMLDetailsElement).open) openFaq = i; }}
            >
              <summary class="cursor-pointer flex items-center gap-4 px-5 py-4 list-none">
                <span class="shrink-0 grid place-items-center h-9 w-9 rounded-full bg-brand-100 text-pine font-bold font-display transition-colors group-open:bg-brand-600 group-open:text-white">{i + 1}</span>
                <span class="flex-1 font-semibold text-pine">{faq.q}</span>
                <span class="shrink-0 grid place-items-center h-8 w-8 rounded-full bg-slate-100 text-slate-500 transition-transform group-open:rotate-180">
                  <ChevronDown size={18} />
                </span>
              </summary>
              <div class="px-5 pb-5 sm:pl-[4.5rem] text-slate-600 leading-relaxed whitespace-pre-line">{faq.a}</div>
            </details>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ─────────────── Part of a wider movement ───────────────── -->
  <section class="section">
    <div class="max-w-3xl mx-auto card p-6 sm:p-8 text-center">
      <h2 class="text-xl font-semibold text-pine">Not just us</h2>
      <p class="mt-3 text-slate-600 leading-relaxed">
        Linux Repair Cafes are a worldwide effort to keep working computers out of the bin.
        You can read about the movement, and find other cafes doing the same thing, on the
        Repair Café International website.
      </p>
      <a
        href="https://www.repaircafe.org/en/linux-repair-cafe/"
        target="_blank"
        rel="noopener"
        class="btn-secondary mt-5"
      >
        Read about Linux Repair Cafes <ExternalLink size={16} />
      </a>
    </div>
  </section>

  <!-- ──────────────── Closing call to action ──────────────── -->
  <NextSessionCta
    event={nextEvent}
    venue={homeVenue}
    heading="Bring your old computer along"
    body={`Come to our next Linux session and we will show you what your computer can still do. It is free, and there is no pressure to decide anything on the day.`}
    ctaHref="/contact"
    ctaLabel="Get in touch"
  />
</main>

<SiteFooter />
