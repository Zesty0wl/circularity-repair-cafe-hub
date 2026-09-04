<script lang="ts">
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import VolunteerCard from '$lib/components/VolunteerCard.svelte';
  import NextSessionCta from '$lib/components/NextSessionCta.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import PhotoGrid from '$lib/components/PhotoGrid.svelte';
  import LocalCafeMap from '$lib/components/LocalCafeMap.svelte';
  import { formatDistance, repairCafeOrgUrl, type LocalCafe } from '$lib/localCafes';
  import { Calendar, Clock, MapPin, ChevronDown, CheckCircle2, Laptop, ArrowRight } from 'lucide-svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon, categoryTint, categoryInk } from '$lib/categoryIcon';
  import type { PageData } from './$types';

  interface PublicEvent {
    id: string;
    name: string;
    description: string | null;
    date: string;
    startTime: string;
    endTime: string;
    /** Linux help is on offer at this session as well as ordinary repairs. */
    supportsLinux?: boolean;
    venue: { name: string; address: string | null; postcode: string | null };
  }
  interface SkillCategory { id: string; name: string; icon: string; colour: string; repairerCount: number }
  interface PublicStats {
    eventCount: number;
    repairCount: number;
    completedCount: number;
    successRate: number;
    co2SavedKg: number;
    volunteerCount: number;
  }
  interface Repairer { id: string; displayName: string; avatarUrl: string | null; bio: string | null; skills: string[]; joinDate: string | null; showOnHomePage?: boolean }

  let upcomingEvents: PublicEvent[] = [];
  let categories: SkillCategory[] = [];
  let repairers: Repairer[] = [];
  let openFaq = -1;

  export let data: PageData;
  $: upcomingEvents = (data.upcomingEvents ?? []) as PublicEvent[];
  $: categories = (data.categories ?? []) as SkillCategory[];
  $: repairers = (data.repairers ?? []) as Repairer[];
  $: stats = (data.stats ?? null) as PublicStats | null;

  // How much of each long list the home page shows before it hands off to the
  // full page. Each number fills its grid exactly, so no row is left ragged.
  const DATE_PREVIEW = 4;   // 4 across on desktop, 2 across on mobile
  const PHOTO_PREVIEW = 8;  // 2 rows of 4, or 4 rows of 2
  const TEAM_PREVIEW = 6;   // 2 rows of 3
  const BADGE_PREVIEW = 4;  // skills shown on a team card before "+n more"

  // A short form for the hero, where the full date is too long on a phone.
  function formatDateShort(d: string): string {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
  // Split a date into the pieces a calendar tile needs (day number, short
  // month, weekday name). Anchored at UTC noon + a fixed locale so the server
  // and client render identical text (no hydration mismatch).
  function dateParts(d: string) {
    const dt = new Date(d + 'T12:00:00Z');
    return {
      day: dt.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' }),
      monthShort: dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      weekdayLong: dt.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    };
  }

  // Keep a value on one line by swapping its spaces for non-breaking ones.
  // Used for postcodes, which look wrong when a line break splits them.
  function noWrap(s: string): string {
    return s.replace(/\s+/g, ' ');
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
  $: cafeName = $cafe?.name ?? 'Repair Café';

  // Volunteers featured in the "Meet our team" strip — anyone whose admin
  // (or self-edit) has opted in. The field defaults to true server-side, so
  // existing volunteers keep showing until someone explicitly opts them out.
  $: homeRepairers = repairers.filter((r) => r.showOnHomePage !== false);

  // ── "Our numbers" ─────────────────────────────────────────────────────────
  // Off unless the cafe turns it on in Settings. Each figure is dropped when
  // it is still zero, so a cafe that has just started never shows a row of
  // noughts, and the band itself disappears if nothing is worth showing yet.
  $: showStats = hp.showStats === true && stats !== null;
  $: statTiles = !stats
    ? []
    : [
        { value: stats.completedCount.toLocaleString('en-GB'), label: 'Repairs done', show: stats.completedCount > 0 },
        // Same figure the admin stats page reports as "CO₂ saved" (the
        // environmental_saving_kg a repairer records on a finished job), so
        // the public number and the internal one always agree.
        { value: `${stats.co2SavedKg.toLocaleString('en-GB')} kg`, label: 'CO₂ saved', show: stats.co2SavedKg > 0 },
        { value: stats.volunteerCount.toLocaleString('en-GB'), label: 'Volunteers', show: stats.volunteerCount > 0 },
        { value: stats.eventCount.toLocaleString('en-GB'), label: 'Sessions held', show: stats.eventCount > 0 },
      ].filter((t) => t.show);

  // The closing band sits on a real photo of a session. Nothing else does:
  // an image behind a heavy wash adds noise rather than atmosphere, so the
  // hero is a flat block of the cafe's own colour instead.
  $: closingImage = gallery.length > 0 ? gallery[gallery.length - 1]!.url : null;

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

  // Photos from a session say where and when they were taken, so the gallery
  // lede can promise something the strip actually delivers.
  $: galleryHasSessions = gallery.some((g) => g.eventId);

  // ── Linux Repair Cafe ─────────────────────────────────────────────────────
  // Only for cafes that offer it. The wording is the admin's, with a sensible
  // fallback so the card still reads properly if they clear a field.
  $: linuxEnabled = $cafe?.linuxEnabled === true;
  $: linuxCard = $cafe?.linuxPage?.homeCard ?? {};
  $: linuxHeading = linuxCard.heading?.trim() || 'We are a Linux Repair Cafe';
  $: linuxBody =
    linuxCard.body?.trim() ||
    'Is your computer too old for Windows 11? We can put Linux on it instead, for free. ' +
      'It keeps working, it keeps getting updates, and it stays out of the bin.';
  $: linuxCta = linuxCard.ctaLabel?.trim() || 'Find out about Linux';
  // The soonest session where Linux help is on offer, so the card can give a
  // date rather than only an explanation.
  $: nextLinuxEvent = upcomingEvents.find((e) => e.supportsLinux) ?? null;

  // ── Repair Cafes near us ──────────────────────────────────────────────────
  // Only appears when an admin has picked some under Settings, Local cafes.
  $: localCafes = ((data.localCafes?.cafes ?? []) as LocalCafe[]);
  $: localOurs = (data.localCafes?.ours ?? null) as LocalCafe | null;
  let selectedLocalSlug: string | null = null;

  /** Clicking a pin picks that cafe out in the list, and brings it into view. */
  function pickLocalCafe(slug: string | null) {
    selectedLocalSlug = slug;
    if (!slug || typeof document === 'undefined') return;
    document.getElementById(`local-cafe-${slug}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
</script>

<SiteHeader variant="public" />

<main>
  <!-- ───────────────────────── Hero ─────────────────────────
       A flat block of the cafe's own colour. One centred column: name,
       tagline, one line of description, the next session, then the two
       actions. The next session sits here because it is the thing most
       visitors came to find. -->
  <section class="bg-brand-600 text-white">
    <div class="max-w-3xl mx-auto px-4 py-20 md:py-28 text-center">
      <h1 class="text-4xl md:text-6xl font-bold tracking-tight">{$cafe?.name ?? 'Welcome'}</h1>
      {#if $cafe?.tagline}
        <p class="mt-4 text-xl md:text-2xl text-white/90">{$cafe.tagline}</p>
      {/if}
      {#if $cafe?.description}
        <p class="mt-3 text-base md:text-lg text-white/70 max-w-xl mx-auto">{$cafe.description}</p>
      {/if}

      {#if nextEvent}
        <div class="mt-10 inline-flex flex-col items-center gap-1 rounded-2xl bg-white/10 ring-1 ring-white/20 px-6 py-4">
          <span class="eyebrow text-white/70">Next session</span>
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
        {#if upcomingEvents.length > 0}
          <a href="#when" class="btn-primary !bg-white !text-brand-800 hover:!bg-slate-100"><Calendar size={18} /> See upcoming events</a>
        {:else}
          <a href="/events" class="btn-primary !bg-white !text-brand-800 hover:!bg-slate-100"><Calendar size={18} /> See upcoming events</a>
        {/if}
        <a href="/skills" class="btn-secondary !bg-white/10 !text-white !ring-white/40 hover:!bg-white/20">What we repair</a>
      </div>
    </div>
  </section>

  <!-- ──────────────── Intro / "What & Who" ───────────────── -->
  {#if hp.intro?.body || hp.intro?.heading}
    <section class="section">
      <div class="max-w-2xl mx-auto text-center">
        {#if hp.intro?.heading}
          <h2 class="section-title">{hp.intro.heading}</h2>
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
  {#if Array.isArray(hp.howItWorks) && hp.howItWorks.length > 0}
    <section class="band">
      <div class="section">
        <SectionHeading eyebrow="Your visit" title="How it works" />
        <div class="relative mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
          <!-- Hairline joining the numbered steps, so they read as one
               sequence rather than four separate boxes. -->
          <div aria-hidden="true" class="hidden lg:block absolute top-6 left-[12.5%] right-[12.5%] h-px bg-brand-200"></div>
          {#each hp.howItWorks as step, i}
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

  <!-- ──────────────────── Our numbers ─────────────────────────
       A dark block on purpose. The rest of the page alternates cream and a
       tint, and this section is optional, so making it a third surface keeps
       that alternation correct whether it is switched on or off. -->
  {#if showStats && statTiles.length > 0}
    <section class="bg-brand-800 text-white">
      <div class="section">
        <SectionHeading
          tone="inverse"
          eyebrow="What we have done together"
          title="Our numbers"
          lede="Every repair keeps something working, and keeps it out of the bin."
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

  <!-- ──────────────────── Photo gallery ─────────────────────── -->
  {#if gallery.length > 0}
    <section class="section">
      <SectionHeading
        eyebrow="From our sessions"
        title="In the workshop"
        lede={galleryHasSessions
          ? 'Photos from recent repair sessions. Open one to see which session it came from.'
          : 'A few photos from recent repair sessions.'}
      />
      <div class="mt-10">
        <PhotoGrid
          photos={gallery}
          previewCount={PHOTO_PREVIEW}
          fallbackAlt={`${cafeName} repair café`}
        />
      </div>
    </section>
  {/if}

  <!-- ──────────────────── When & where ──────────────────────── -->
  {#if upcomingEvents.length > 0}
    <section id="when" class="band">
      <div class="section">
        <SectionHeading eyebrow="Mark your calendar" title="When &amp; where">
          {#if homeVenue}
            <!-- The pin is inline, not a flex sibling, so it stays next to the
                 first word instead of being stranded when the address wraps. -->
            <p class="section-lede">
              <MapPin size={18} class="inline-block align-text-bottom mr-1.5" />{homeVenue.name}{#if homeVenue.address}, {homeVenue.address}{/if}{#if homeVenue.postcode}{' · '}{noWrap(homeVenue.postcode)}{/if}
            </p>
          {/if}
        </SectionHeading>

        <div class="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {#each upcomingEvents.slice(0, DATE_PREVIEW) as e, i}
            {@const p = dateParts(e.date)}
            <div class="group relative card overflow-hidden text-center transition-shadow hover:ring-brand-400">
              {#if i === 0}
                <span class="absolute top-2 right-2 z-10 rounded-full bg-accent-600 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Next</span>
              {/if}
              <div class="absolute top-2 left-2 z-10">
                <!-- Dark, so it reads on the lead tile's solid strip and on
                     the tinted strips of the tiles that follow it. -->
                <AddToCalendar event={e} variant="compact" class="!bg-brand-800/90 !text-white !ring-white/20 hover:!bg-brand-800" />
              </div>
              <a href="/events" class="block">
                <!-- The next date keeps the solid brand strip; later dates use
                     a tint, so one tile leads and the rest support it. -->
                <div
                  class="text-xs font-bold uppercase tracking-wider py-1.5 {i === 0 ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-800'}"
                >{p.monthShort}</div>
                <div class="px-3 py-5">
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

        <div class="text-center mt-10">
          {#if upcomingEvents.length > DATE_PREVIEW}
            <p class="mb-4 text-sm text-slate-500">
              We have {upcomingEvents.length - DATE_PREVIEW} more {upcomingEvents.length - DATE_PREVIEW === 1 ? 'date' : 'dates'} booked after these.
            </p>
          {/if}
          <a href="/events" class="btn-secondary">See full schedule</a>
        </div>
      </div>
    </section>
  {/if}

  <!-- ────────────────── What to bring ───────────────────────── -->
  {#if hp.whatToBring?.body}
    <section class="section">
      <SectionHeading eyebrow="Before you come" title={hp.whatToBring.heading || 'What to bring'} />
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

  <!-- ──────────────── What we repair (categories) ───────────── -->
  {#if categories.length > 0}
    <section class="band">
      <div class="section">
        <SectionHeading
          eyebrow="What we can look at"
          title="What we repair"
          lede="Bring one of these along, or just ask. We will always take a look."
        />
        <div class="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {#each categories as cat}
            <div class="card p-5 text-center">
              <!-- One lightness for every tile: the category colour as a soft
                   wash, with a darkened version of the same colour as the
                   glyph so it stays readable. -->
              <span
                class="icon-tile mx-auto"
                style={`background-color: ${categoryTint(cat.colour)}; color: ${categoryInk(cat.colour)}`}
              >
                <Icon icon={categoryIcon(cat.icon, cat.name)} width="24" height="24" />
              </span>
              <p class="mt-3 font-medium text-pine">{cat.name}</p>
              <p class="text-xs text-slate-500">{cat.repairerCount} volunteer{cat.repairerCount === 1 ? '' : 's'}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ─────────────── Linux Repair Cafe ───────────────────────
       Only for cafes that offer it. It sits straight after "What we repair"
       because that is the moment a visitor is wondering whether their own
       broken-ish thing counts, and an old computer is exactly the case people
       assume is beyond help. -->
  {#if linuxEnabled}
    <section class="section">
      <div class="max-w-4xl mx-auto rounded-2xl bg-brand-50 ring-1 ring-brand-200 overflow-hidden">
        <div class="p-6 sm:p-10 flex flex-col sm:flex-row gap-6 sm:items-start">
          <span class="shrink-0 grid place-items-center h-14 w-14 rounded-2xl bg-brand-600 text-white">
            <Laptop size={26} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="eyebrow">Also here</p>
            <h2 class="mt-2 text-2xl sm:text-3xl font-bold font-display text-pine">{linuxHeading}</h2>
            <p class="mt-3 text-slate-700 leading-relaxed whitespace-pre-line">{linuxBody}</p>

            {#if nextLinuxEvent}
              <p class="mt-4 inline-flex items-start gap-2 rounded-xl bg-white ring-1 ring-brand-200 px-4 py-2.5 text-sm text-slate-700">
                <Calendar size={16} class="shrink-0 mt-0.5 text-brand-700" />
                <span>
                  Next session with Linux help:
                  <span class="font-semibold text-pine">{formatDateShort(nextLinuxEvent.date)}</span>,
                  {nextLinuxEvent.startTime.slice(0, 5)}–{nextLinuxEvent.endTime.slice(0, 5)}
                </span>
              </p>
            {/if}

            <div class="mt-6">
              <a href="/linux" class="btn-primary">
                {linuxCta} <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── Team ──────────────────────────────── -->
  {#if homeRepairers.length > 0}
    <section class="section">
      <SectionHeading
        eyebrow="The people who fix things"
        title="Meet our team"
        lede="Our repairers are volunteers. They give their time, their tools and their know-how."
      />
      <div class="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each homeRepairers.slice(0, TEAM_PREVIEW) as r}
          <VolunteerCard volunteer={r} badgeLimit={BADGE_PREVIEW} />
        {/each}
      </div>
      <div class="text-center mt-10">
        <a href="/skills" class="btn-secondary">See everyone</a>
      </div>
    </section>
  {/if}

  <!-- ──────────────────── FAQ ──────────────────────────────── -->
  {#if Array.isArray(hp.faqs) && hp.faqs.length > 0}
    <section class="band">
      <div class="section">
        <SectionHeading eyebrow="Good to know" title="Common questions" />
        <div class="mt-10 max-w-3xl mx-auto space-y-3">
          {#each hp.faqs as faq, i}
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

  <!-- ─────────────── Repair Cafes near us ───────────────────── -->
  {#if localCafes.length > 0}
    <section class="section">
      <SectionHeading
        eyebrow="Not just us"
        title="Repair Cafes near us"
        lede="We are part of a wider community of repairers. If we cannot help, one of these might."
      />
      <div class="mt-10 grid gap-6 lg:grid-cols-5 items-start">
        <div class="lg:col-span-3">
          <LocalCafeMap
            cafes={localCafes}
            ours={localOurs}
            selectedSlug={selectedLocalSlug}
            cartoApiKey={$cafe?.cartoApiKey ?? null}
            height="24rem"
            on:select={(e) => pickLocalCafe(e.detail.slug)}
          />
          <p class="mt-2 text-xs text-slate-500">
            Tap a pin to find that cafe in the list. Details come from
            <a href="https://www.repaircafe.org" target="_blank" rel="noopener" class="underline underline-offset-2">repaircafe.org</a>.
          </p>
        </div>

        <ul class="lg:col-span-2 space-y-2 lg:max-h-[24rem] lg:overflow-y-auto lg:pr-1">
          {#each localCafes as cafe, i (cafe.slug ?? cafe.name)}
            <li
              id={`local-cafe-${cafe.slug}`}
              class="rounded-xl p-3 ring-1 transition-colors {selectedLocalSlug === cafe.slug
                ? 'bg-brand-50 ring-brand-300'
                : 'bg-white ring-slate-200'}"
            >
              <div class="flex items-start gap-3">
                <!-- The number matches the pin on the map. -->
                <button
                  type="button"
                  class="mt-0.5 shrink-0 h-6 w-6 rounded-full text-xs font-bold ring-2 transition-colors {selectedLocalSlug === cafe.slug
                    ? 'bg-brand-700 text-white ring-brand-700'
                    : 'bg-white text-brand-800 ring-brand-600 hover:bg-brand-50'}"
                  aria-label={`Show ${cafe.name} on the map`}
                  on:click={() => (selectedLocalSlug = selectedLocalSlug === cafe.slug ? null : cafe.slug)}
                >
                  {i + 1}
                </button>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-pine">{cafe.name}</p>
                  {#if cafe.address}
                    <p class="text-sm text-slate-600">{cafe.address}</p>
                  {/if}
                  <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {#if formatDistance(cafe.distanceKm)}
                      <span class="text-slate-500">{formatDistance(cafe.distanceKm)}</span>
                    {/if}
                    {#if cafe.website}
                      <a href={cafe.website} target="_blank" rel="noopener" class="text-brand-700 underline underline-offset-2 hover:text-brand-800">
                        Their website
                      </a>
                    {/if}
                    {#if repairCafeOrgUrl(cafe.slug)}
                      <a href={repairCafeOrgUrl(cafe.slug)} target="_blank" rel="noopener" class="text-brand-700 underline underline-offset-2 hover:text-brand-800">
                        On repaircafe.org
                      </a>
                    {/if}
                  </p>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}

  <!-- ──────────────── Closing call to action ────────────────
       The page ends on an invitation, not on a list. -->
  <NextSessionCta event={nextEvent} venue={homeVenue} image={closingImage} />
</main>

<SiteFooter />
