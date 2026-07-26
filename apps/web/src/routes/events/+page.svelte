<script lang="ts">
  import { api } from '$lib/api';
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NextSessionCta from '$lib/components/NextSessionCta.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import { Clock, MapPin, CalendarDays, CalendarX2, History, ChevronRight, Camera } from 'lucide-svelte';
  import type { PageData } from './$types';

  interface Venue { name: string; address: string | null; postcode: string | null }
  interface PublicEvent {
    id: string;
    name: string;
    description: string | null;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    venue: Venue;
    /** Photos a visitor can see for this session, and the first of them. */
    photoCount?: number;
    coverUrl?: string | null;
  }

  let upcoming: PublicEvent[] = [];
  let past: PublicEvent[] = [];
  let showPast = false;

  export let data: PageData;
  $: upcoming = (data.upcoming ?? []) as PublicEvent[];

  async function loadPast() {
    showPast = true;
    const all = (await api<PublicEvent[]>('/api/public/events?past=true').catch(() => [])) ?? [];
    const today = new Date().toISOString().slice(0, 10);
    past = all.filter((e) => e.date < today).reverse();
  }

  // Split a date into the pieces a calendar tile needs (day number, short
  // month, weekday name) using the visitor's locale.
  function dateParts(d: string) {
    const dt = new Date(d + 'T12:00:00Z');
    return {
      day: dt.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' }),
      monthShort: dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      weekdayLong: dt.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
      monthLong: dt.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }),
      year: dt.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'UTC' }),
    };
  }

  // Full, human-friendly date for screen readers and labels.
  function fullDate(d: string): string {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  // Keep a postcode on one line: a break in the middle of it looks wrong.
  function noWrap(s: string): string {
    return s.replace(/\s+/g, ' ');
  }

  // When every upcoming event shares one venue (the common case for a regular
  // monthly cafe) we surface it once in the header.
  $: uniformVenue = upcoming.length > 0 && upcoming.every((e) => e.venue.name === upcoming[0]!.venue.name)
    ? upcoming[0]!.venue
    : null;
  // Same idea for the name. A regular cafe calls every session the same thing,
  // so repeating it down the list tells the reader nothing. When the names all
  // match we lead each row with the date instead, which is the useful part.
  $: uniformName = upcoming.length > 0 && upcoming.every((e) => e.name === upcoming[0]!.name);

  $: nextEvent = upcoming[0] ?? null;
  $: gallery = $cafe?.gallery ?? [];
  $: ctaImage = gallery.length > 0 ? gallery[gallery.length - 1]!.url : null;
</script>

<SiteHeader variant="public" />

<main>
  <PageHeader
    eyebrow="What's on"
    title="Upcoming events"
    lede="Bring an item to repair. We'll do our best to fix it together."
  >
    <CalendarDays size={22} slot="icon" />
    {#if uniformVenue}
      <p class="mt-6 inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-brand-200 px-4 py-1.5 text-sm text-slate-700">
        <MapPin size={15} class="text-clay shrink-0" />
        <span>{uniformVenue.name}{#if uniformVenue.postcode}{' · '}{noWrap(uniformVenue.postcode)}{/if}</span>
      </p>
    {/if}
  </PageHeader>

  <!-- ───────────────────────── Event list ───────────────────────── -->
  <section class="section">
    {#if upcoming.length === 0}
      <div class="card p-10 text-center max-w-xl mx-auto">
        <span class="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-brand-100 text-pine">
          <CalendarX2 size={22} />
        </span>
        <h3 class="mt-4 text-pine">No events scheduled just yet</h3>
        <p class="mt-2 text-slate-600">We're planning the next session. Check back soon, or get in touch to be the first to know.</p>
        <a href="/contact" class="btn-secondary mt-6">Contact us</a>
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each upcoming as evt, i}
          {@const p = dateParts(evt.date)}
          <!-- The card is the container; the title link stretches over the
               whole card, so the row is one tap target and the calendar
               button beside it stays a separate control. -->
          <div class="card group relative flex h-full items-center gap-4 overflow-hidden p-4 transition-shadow hover:ring-brand-400">
            {#if i === 0}
              <span class="absolute top-0 right-0 rounded-tr-2xl rounded-bl-xl bg-accent-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Next</span>
            {/if}
            <!-- Date tile, flat and in one colour so a column of them reads
                 as a set (the home page tiles use the same treatment). -->
            <div class="shrink-0 w-16 overflow-hidden rounded-xl bg-brand-600 text-white text-center">
              <div class="bg-black/15 text-[11px] font-bold uppercase tracking-wider py-1">{p.monthShort}</div>
              <div class="text-2xl font-bold font-display leading-none py-2">{p.day}</div>
            </div>
            <div class="min-w-0 flex-1">
              <!-- Lead with whatever actually differs between rows. -->
              <a
                href={`/events/${evt.id}`}
                aria-label={`${evt.name}, ${fullDate(evt.date)}, view details`}
                class="font-semibold text-pine block truncate after:absolute after:inset-0 focus:outline-none focus-visible:underline"
              >
                {#if uniformName}{p.weekdayLong} {p.day} {p.monthLong}{:else}{evt.name}{/if}
              </a>
              <p class="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Clock size={14} class="text-clay shrink-0" /> {evt.startTime.slice(0,5)}–{evt.endTime.slice(0,5)}
              </p>
              {#if !uniformVenue}
                <p class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin size={13} class="text-clay shrink-0" /> <span class="truncate">{evt.venue.name}</span>
                </p>
              {/if}
            </div>
            <AddToCalendar
              event={evt}
              variant="compact"
              class="relative z-10 shrink-0 !bg-brand-50 !text-brand-700 !ring-brand-200 hover:!bg-brand-100"
            />
            <ChevronRight size={18} class="shrink-0 text-slate-400 transition-colors group-hover:text-brand-600" />
          </div>
        {/each}
      </div>
    {/if}

    <!-- ───────────────────────── Past events ───────────────────────── -->
    <div class="mt-16 pt-10 border-t border-slate-200">
      {#if !showPast}
        <div class="text-center">
          <button class="btn-secondary" type="button" on:click={loadPast}>
            <History size={16} /> Show past events
          </button>
        </div>
      {:else}
        <h2 class="text-pine flex items-center gap-2"><History size={20} class="text-clay" /> Past events</h2>
        <p class="mt-2 text-slate-600">See how each session went, and the photos our volunteers took.</p>
        {#if past.length === 0}
          <p class="mt-3 text-slate-500">No past events to show.</p>
        {:else}
          <ul class="mt-5 divide-y divide-slate-100">
            {#each past as evt}
              {@const p = dateParts(evt.date)}
              <li>
                <a href={`/events/${evt.id}`} class="flex items-center gap-4 py-3 group focus:outline-none">
                  <div class="shrink-0 w-12 rounded-lg bg-slate-100 py-1.5 text-center">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">{p.monthShort}</div>
                    <div class="text-lg font-bold font-display text-slate-700 leading-none">{p.day}</div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-slate-800 truncate group-hover:text-brand-700">{evt.name}</p>
                    <p class="text-sm text-slate-500 truncate">{evt.venue.name}</p>
                    {#if evt.photoCount}
                      <p class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <Camera size={13} class="text-clay shrink-0" />
                        {evt.photoCount} photo{evt.photoCount === 1 ? '' : 's'}
                      </p>
                    {/if}
                  </div>
                  {#if evt.coverUrl}
                    <img
                      src={evt.coverUrl}
                      alt=""
                      loading="lazy"
                      class="shrink-0 h-14 w-20 rounded-lg object-cover ring-1 ring-slate-200"
                    />
                  {/if}
                  <ChevronRight size={16} class="shrink-0 text-slate-400 transition-colors group-hover:text-brand-600" />
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  </section>

  <NextSessionCta
    event={nextEvent}
    venue={uniformVenue ?? nextEvent?.venue ?? null}
    image={ctaImage}
    heading="Not sure if we can fix it?"
    body="Bring it anyway. We will always take a look, and we will be honest about what we can and cannot do."
    ctaHref="/contact"
    ctaLabel="Find us"
  />
</main>

<SiteFooter />
