<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import { Calendar, Clock, MapPin, Mail, Phone, ChevronDown, ChevronLeft, ChevronRight, X, Heart, Package, CheckCircle2, HelpCircle } from 'lucide-svelte';
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
  interface Repairer { id: string; displayName: string; avatarUrl: string | null; bio: string | null; skills: string[]; joinDate: string | null; showOnHomePage?: boolean }

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
  // Split a date into the pieces a calendar tile needs (day number, short
  // month, weekday name) using the visitor's locale.
  function dateParts(d: string) {
    const dt = new Date(d + 'T12:00:00');
    return {
      day: dt.toLocaleDateString(undefined, { day: 'numeric' }),
      monthShort: dt.toLocaleDateString(undefined, { month: 'short' }),
      weekdayLong: dt.toLocaleDateString(undefined, { weekday: 'long' }),
    };
  }

  // The same homeVenue is shown for most "When & where" sections.
  $: homeVenue = upcomingEvents[0]?.venue ?? null;
  $: nextEvent = upcomingEvents[0] ?? null;
  // When every upcoming event shares one name (the common case for a regular
  // monthly cafe) we hide the repetitive label on the date tiles; if some
  // events are specially named we surface those names instead.
  $: uniformEventName = upcomingEvents.length > 0 && upcomingEvents.every((e) => e.name === upcomingEvents[0]!.name);
  $: hp = $cafe?.homePage ?? {};
  $: gallery = $cafe?.gallery ?? [];

  // Volunteers featured in the "Meet our team" strip — anyone whose admin
  // (or self-edit) has opted in. The field defaults to true server-side, so
  // existing volunteers keep showing until someone explicitly opts them out.
  $: homeRepairers = repairers.filter((r) => r.showOnHomePage !== false);

  // "What to bring" can be free prose or a bullet list. We split on lines
  // starting with -, *, • or a number (e.g. "1."). If most non-empty lines
  // look like bullets we render a checklist; otherwise we render paragraphs.
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
  $: bring = parseBringList(hp.whatToBring?.body ?? '');

  // Split the intro body into paragraphs on blank lines so the first one can
  // be rendered as a larger "lead" and subsequent ones as supporting text.
  $: introParagraphs = (hp.intro?.body ?? '')
    .split(/\n\s*\n/)
    .map((p: string) => p.trim())
    .filter(Boolean);

  // ── Lightbox state ────────────────────────────────────────────────────────
  let lightboxIndex: number | null = null;

  function openLightbox(i: number) {
    lightboxIndex = i;
  }
  function closeLightbox() {
    lightboxIndex = null;
  }
  function nextImage() {
    if (lightboxIndex === null || gallery.length === 0) return;
    lightboxIndex = (lightboxIndex + 1) % gallery.length;
  }
  function prevImage() {
    if (lightboxIndex === null || gallery.length === 0) return;
    lightboxIndex = (lightboxIndex - 1 + gallery.length) % gallery.length;
  }
  function handleKey(e: KeyboardEvent) {
    if (lightboxIndex === null) return;
    if (e.key === 'Escape') { closeLightbox(); }
    else if (e.key === 'ArrowRight') { nextImage(); }
    else if (e.key === 'ArrowLeft') { prevImage(); }
  }

  // Lock body scroll while the lightbox is open.
  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = lightboxIndex === null ? '' : 'hidden';
  }
</script>

<svelte:window on:keydown={handleKey} />

<SiteHeader variant="public" />

<main>
  <!-- ───────────────────────── Hero ───────────────────────── -->
  <section
    class="relative bg-gradient-to-br from-brand-700 to-brand-500 text-white"
    style={$cafe?.bannerUrl ? `background-image: linear-gradient(to bottom right, rgb(var(--brand-800) / .88), rgb(var(--brand-600) / .82)), url('${$cafe.bannerUrl}'); background-size: cover; background-position: center;` : ''}
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

  <!-- ───────────────── Tagline (cafe.description) ────────────────────── -->
  {#if $cafe?.description}
    <section class="max-w-3xl mx-auto px-4 pt-12 pb-2 text-center">
      <p class="inline-flex items-center gap-3 text-brand-700 font-medium uppercase tracking-wide text-sm">
        <span aria-hidden="true" class="h-px w-8 bg-brand-300"></span>
        {$cafe.description}
        <span aria-hidden="true" class="h-px w-8 bg-brand-300"></span>
      </p>
    </section>
  {/if}

  <!-- ──────────────── Intro / "What & Who" body ───────────────── -->
  {#if hp.intro?.body || hp.intro?.heading}
    <section class="max-w-4xl mx-auto px-4 pt-6 pb-12">
      <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-brand-50 ring-1 ring-brand-100 shadow-sm px-6 py-10 sm:px-12 sm:py-14">
        <!-- decorative blobs -->
        <div aria-hidden="true" class="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-brand-200/40 blur-3xl"></div>
        <div aria-hidden="true" class="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-brand-200/30 blur-3xl"></div>

        <div class="relative text-center">
          <span class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 text-white shadow-md">
            <Heart size={26} />
          </span>
          {#if hp.intro?.heading}
            <h2 class="mt-5 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">{hp.intro.heading}</h2>
            <span class="mt-3 inline-block h-1 w-16 rounded-full bg-brand-500"></span>
          {/if}
          {#if introParagraphs.length > 0}
            <p class="mt-6 text-xl sm:text-2xl leading-relaxed font-medium text-slate-800 whitespace-pre-line max-w-2xl mx-auto">
              {introParagraphs[0]}
            </p>
            {#each introParagraphs.slice(1) as p}
              <p class="mt-4 text-lg leading-relaxed text-slate-600 whitespace-pre-line max-w-2xl mx-auto">{p}</p>
            {/each}
          {/if}
        </div>
      </div>
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
        <div class="flex flex-col gap-2 w-full sm:w-auto">
          <a href="/events" class="btn-primary">Find out more</a>
          <AddToCalendar event={nextEvent} variant="button" />
        </div>
      </div>
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
    <section id="when" class="bg-sage/30 py-16">
      <div class="max-w-5xl mx-auto px-4">
        <div class="text-center">
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-clay">Mark your calendar</p>
          <h2 class="mt-2 text-3xl md:text-4xl font-bold tracking-tight text-pine">When &amp; where</h2>
          {#if homeVenue}
            <p class="mt-3 text-slate-600 flex items-center justify-center gap-2">
              <MapPin size={16} /> {homeVenue.name}{#if homeVenue.address}, {homeVenue.address}{/if}{#if homeVenue.postcode} · {homeVenue.postcode}{/if}
            </p>
          {/if}
        </div>

        <div class="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {#each upcomingEvents.slice(0, 8) as e, i}
            {@const p = dateParts(e.date)}
            <div
              class="group relative rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden text-center shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:ring-brand-300"
            >
              {#if i === 0}
                <span class="absolute top-2 right-2 z-10 rounded-full bg-sun text-ink text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Next</span>
              {/if}
              <div class="absolute top-2 left-2 z-10">
                <AddToCalendar event={e} variant="compact" />
              </div>
              <a href="/events" class="block">
                <div class="bg-brand-600 text-white text-xs font-bold uppercase tracking-wider py-1.5">{p.monthShort}</div>
                <div class="px-3 py-4">
                  <div class="text-4xl font-bold font-display text-pine leading-none">{p.day}</div>
                  <div class="mt-1 text-sm text-slate-500">{p.weekdayLong}</div>
                  <div class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                    <Clock size={12} class="text-clay" /> {e.startTime.slice(0,5)}–{e.endTime.slice(0,5)}
                  </div>
                  {#if !uniformEventName}
                    <div class="mt-2 text-xs text-slate-500 truncate" title={e.name}>{e.name}</div>
                  {/if}
                </div>
              </a>
            </div>
          {/each}
        </div>

        {#if upcomingEvents.length > 8}
          <p class="mt-6 text-center text-sm text-slate-500">+ {upcomingEvents.length - 8} more {upcomingEvents.length - 8 === 1 ? 'date' : 'dates'} on the schedule</p>
        {/if}

        <div class="text-center mt-8">
          <a href="/events" class="btn-secondary">See full schedule</a>
        </div>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── Photo gallery ─────────────────────── -->
  {#if gallery.length > 0}
    <section class="bg-slate-50 py-14">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {#each gallery as img, i}
            <button
              type="button"
              on:click={() => openLightbox(i)}
              class="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-200 group focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              aria-label={img.caption ? `View larger: ${img.caption}` : `View image ${i + 1} of ${gallery.length}`}
            >
              <img src={img.url} alt={img.caption ?? ''} loading="lazy" class="w-full h-full object-cover transition-transform group-hover:scale-105" />
              {#if img.caption}
                <span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-2 text-left line-clamp-2">{img.caption}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ────────────────── What to bring ───────────────────────── -->
  {#if hp.whatToBring?.body}
    <section class="max-w-4xl mx-auto px-4 py-14">
      <div class="relative overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm px-6 py-10 sm:px-12 sm:py-12">
        <div aria-hidden="true" class="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-brand-100/60 blur-3xl"></div>

        <div class="relative">
          <div class="flex items-center gap-4">
            <span class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-600 text-white shadow-md shrink-0">
              <Package size={22} />
            </span>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-brand-700">Before you come</p>
              {#if hp.whatToBring.heading}
                <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{hp.whatToBring.heading}</h2>
              {/if}
            </div>
          </div>

          {#if bring.isList}
            <ul class="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {#each bring.items as item}
                <li class="flex items-start gap-3 text-slate-700">
                  <CheckCircle2 size={20} class="text-emerald-600 shrink-0 mt-0.5" />
                  <span class="leading-snug">{item}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="mt-6 space-y-4">
              {#each bring.paragraphs as p}
                <p class="text-lg leading-relaxed text-slate-700 whitespace-pre-line">{p}</p>
              {/each}
            </div>
          {/if}
        </div>
      </div>
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
  {#if homeRepairers.length > 0}
    <section class="max-w-6xl mx-auto px-4 pb-16">
      <div class="flex items-end justify-between mb-6">
        <h2 class="text-2xl font-semibold">Meet our team</h2>
        <a href="/skills" class="text-brand-700 hover:underline text-sm">See everyone →</a>
      </div>
      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {#each homeRepairers.slice(0, 12) as r}
          <a
            href="/team/{r.id}"
            aria-label={`View profile: ${r.displayName}`}
            class="card p-5 block hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div class="flex items-center gap-3">
              {#if r.avatarUrl}
                <img src={r.avatarUrl} alt="" class="h-14 w-14 rounded-full object-cover" />
              {:else}
                <div class="h-14 w-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold">{r.displayName.slice(0, 2).toUpperCase()}</div>
              {/if}
              <div>
                <p class="font-semibold text-brand-700">{r.displayName}</p>
                {#if r.joinDate}<p class="text-xs text-slate-500">Joined {new Date(r.joinDate).getFullYear()}</p>{/if}
              </div>
            </div>
            {#if r.bio}<p class="mt-3 text-sm text-slate-700 line-clamp-3">{r.bio}</p>{/if}
            {#if r.skills.length > 0}
              <div class="mt-3 flex flex-wrap gap-1">
                {#each r.skills as s}
                  <span class="badge bg-slate-100 text-slate-700">{s}</span>
                {/each}
              </div>
            {/if}
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ──────────────────── FAQ ──────────────────────────────── -->
  {#if Array.isArray(hp.faqs) && hp.faqs.length > 0}
    <section class="bg-sage/30 py-16">
      <div class="max-w-3xl mx-auto px-4">
        <div class="text-center">
          <span class="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-600 text-white shadow-md">
            <HelpCircle size={26} />
          </span>
          <p class="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-clay">Good to know</p>
          <h2 class="mt-2 text-3xl md:text-4xl font-bold tracking-tight text-pine">Questions</h2>
        </div>
        <div class="mt-10 space-y-3">
          {#each hp.faqs as faq, i}
            <details
              class="group rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm transition-all hover:ring-brand-300 open:ring-2 open:ring-brand-400 open:shadow-md"
              open={openFaq === i}
              on:toggle={(e) => { if ((e.target as HTMLDetailsElement).open) openFaq = i; }}
            >
              <summary class="cursor-pointer flex items-center gap-4 px-5 py-4 list-none">
                <span class="shrink-0 grid place-items-center h-9 w-9 rounded-full bg-sage text-pine font-bold font-display transition-colors group-open:bg-brand-600 group-open:text-white">{i + 1}</span>
                <span class="flex-1 font-semibold text-pine">{faq.q}</span>
                <span class="shrink-0 grid place-items-center h-8 w-8 rounded-full bg-slate-100 text-slate-500 transition-all group-open:bg-clay group-open:text-white group-open:rotate-180">
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

<!-- ────────────────────── Gallery lightbox ────────────────────── -->
{#if lightboxIndex !== null && gallery[lightboxIndex]}
  <div
    class="fixed inset-0 z-50 bg-black/90 flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label="Photo viewer"
    on:click|self={closeLightbox}
  >
    <!-- Top bar: counter + close -->
    <div class="flex items-center justify-between px-4 py-3 text-white/90 text-sm">
      <span class="font-mono tabular-nums">{lightboxIndex + 1} / {gallery.length}</span>
      <button
        type="button"
        on:click={closeLightbox}
        class="p-2 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
        aria-label="Close (Esc)"
      >
        <X size={24} />
      </button>
    </div>

    <!-- Image + nav -->
    <div class="relative flex-1 flex items-center justify-center min-h-0" on:click|self={closeLightbox}>
      <img
        src={gallery[lightboxIndex].url}
        alt={gallery[lightboxIndex].caption ?? ''}
        class="max-h-full max-w-full object-contain rounded"
        on:click|stopPropagation
      />
      {#if gallery.length > 1}
        <button
          type="button"
          on:click|stopPropagation={prevImage}
          class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Previous image (←)"
        >
          <ChevronLeft size={28} />
        </button>
        <button
          type="button"
          on:click|stopPropagation={nextImage}
          class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Next image (→)"
        >
          <ChevronRight size={28} />
        </button>
      {/if}
    </div>

    <!-- Caption -->
    {#if gallery[lightboxIndex].caption}
      <div class="px-6 py-4 text-center text-white text-sm sm:text-base max-w-3xl mx-auto">
        {gallery[lightboxIndex].caption}
      </div>
    {:else}
      <div class="py-4"></div>
    {/if}
  </div>
{/if}

<SiteFooter />
