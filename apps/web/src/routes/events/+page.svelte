<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { api } from '$lib/api';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import { Clock, MapPin, CalendarDays, CalendarX2, ArrowUpRight, History, ChevronRight, X } from 'lucide-svelte';

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
  }

  let upcoming: PublicEvent[] = [];
  let past: PublicEvent[] = [];
  let showPast = false;
  let loading = true;

  // The event whose details modal is currently open (null = closed).
  let selected: PublicEvent | null = null;

  onMount(async () => {
    upcoming = (await api<PublicEvent[]>('/api/public/events').catch(() => [])) ?? [];
    loading = false;
  });

  async function loadPast() {
    showPast = true;
    const all = (await api<PublicEvent[]>('/api/public/events?past=true').catch(() => [])) ?? [];
    const today = new Date().toISOString().slice(0, 10);
    past = all.filter((e) => e.date < today).reverse();
  }

  function openEvent(e: PublicEvent) {
    selected = e;
  }
  function closeEvent() {
    selected = null;
  }
  function handleKey(e: KeyboardEvent) {
    if (selected && e.key === 'Escape') closeEvent();
  }

  // Lock body scroll while the modal is open.
  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = selected ? 'hidden' : '';
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

  // Full, human-friendly date for the expanded modal.
  function fullDate(d: string): string {
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function mapsUrl(v: Venue): string {
    const parts = [v.name, v.address, v.postcode].filter(Boolean);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
  }

  // When every upcoming event shares one venue (the common case for a regular
  // monthly cafe) we surface it once in the header.
  $: uniformVenue = upcoming.length > 0 && upcoming.every((e) => e.venue.name === upcoming[0]!.venue.name)
    ? upcoming[0]!.venue
    : null;

  // True when the open modal is the soonest upcoming event (gets a "Next" badge).
  $: selectedIsNext = !!selected && upcoming[0]?.id === selected.id;
</script>

<svelte:window on:keydown={handleKey} />

<SiteHeader variant="public" />

<main>
  <!-- ───────────────────────── Header band ───────────────────────── -->
  <section class="bg-sage/30 border-b border-sage/50">
    <div class="max-w-4xl mx-auto px-4 py-14 text-center">
      <span class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 text-white shadow-md">
        <CalendarDays size={26} />
      </span>
      <p class="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-clay">What's on</p>
      <h1 class="mt-2 !text-pine">Upcoming events</h1>
      <span class="mt-3 inline-block h-1 w-16 rounded-full bg-brand-500"></span>
      <p class="mt-4 text-lg text-slate-600 max-w-xl mx-auto">Bring an item to repair — we'll do our best to fix it together.</p>
      {#if uniformVenue}
        <p class="mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-sage/60 px-4 py-1.5 text-sm text-slate-700">
          <MapPin size={15} class="text-clay shrink-0" />
          <span>{uniformVenue.name}{#if uniformVenue.postcode} · {uniformVenue.postcode}{/if}</span>
        </p>
      {/if}
    </div>
  </section>

  <!-- ───────────────────────── Event list ───────────────────────── -->
  <section class="max-w-4xl mx-auto px-4 py-12">
    {#if loading}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {#each Array(3) as _}
          <div class="h-24 rounded-2xl bg-slate-100 animate-pulse"></div>
        {/each}
      </div>
    {:else if upcoming.length === 0}
      <div class="card p-10 text-center">
        <span class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sage/50 text-pine">
          <CalendarX2 size={26} />
        </span>
        <h3 class="mt-4 !text-pine">No events scheduled just yet</h3>
        <p class="mt-2 text-slate-600">We're planning the next session — check back soon, or get in touch to be the first to know.</p>
        <a href="/contact" class="btn-secondary mt-6">Contact us</a>
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each upcoming as evt, i}
          {@const p = dateParts(evt.date)}
          <button
            type="button"
            on:click={() => openEvent(evt)}
            aria-haspopup="dialog"
            aria-label={`${evt.name}, ${fullDate(evt.date)} — view details`}
            class="group relative flex items-center gap-3 rounded-2xl bg-white ring-1 ring-slate-200 p-3 pr-2 text-left shadow-sm transition-all hover:shadow-md hover:ring-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {#if i === 0}
              <span class="absolute -top-2 right-3 rounded-full bg-sun text-ink text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 shadow-sm">Next</span>
            {/if}
            <!-- Date tile -->
            <div class="shrink-0 w-16 rounded-xl bg-gradient-to-br from-brand-700 to-brand-600 text-white text-center py-2">
              <div class="text-[11px] font-bold uppercase tracking-wider text-brand-100">{p.monthShort}</div>
              <div class="text-2xl font-bold font-display leading-none">{p.day}</div>
            </div>
            <!-- Critical detail -->
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-pine truncate">{evt.name}</p>
              <p class="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Clock size={14} class="text-clay shrink-0" /> {evt.startTime.slice(0,5)}–{evt.endTime.slice(0,5)}
              </p>
              {#if !uniformVenue}
                <p class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin size={13} class="text-clay shrink-0" /> <span class="truncate">{evt.venue.name}</span>
                </p>
              {/if}
            </div>
            <ChevronRight size={18} class="shrink-0 text-slate-300 transition-colors group-hover:text-brand-500" />
          </button>
        {/each}
      </div>
    {/if}

    <!-- ───────────────────────── Past events ───────────────────────── -->
    <div class="mt-14 pt-8 border-t border-slate-200">
      {#if !showPast}
        <div class="text-center">
          <button class="btn-secondary" type="button" on:click={loadPast}>
            <History size={16} /> Show past events
          </button>
        </div>
      {:else}
        <h2 class="!text-pine flex items-center gap-2"><History size={20} class="text-clay" /> Past events</h2>
        {#if past.length === 0}
          <p class="mt-3 text-slate-500">No past events to show.</p>
        {:else}
          <ul class="mt-5 divide-y divide-slate-100">
            {#each past as evt}
              {@const p = dateParts(evt.date)}
              <li class="flex items-center gap-4 py-3">
                <div class="shrink-0 w-12 rounded-lg bg-slate-100 py-1.5 text-center">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">{p.monthShort}</div>
                  <div class="text-lg font-bold font-display text-slate-700 leading-none">{p.day}</div>
                </div>
                <div class="min-w-0">
                  <p class="font-medium text-slate-800 truncate">{evt.name}</p>
                  <p class="text-sm text-slate-500 truncate">{evt.venue.name}</p>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  </section>
</main>

<!-- ───────────────────────── Event details modal ───────────────────────── -->
{#if selected}
  {@const p = dateParts(selected.date)}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="event-modal-title"
  >
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-ink/60 backdrop-blur-sm cursor-default"
      aria-label="Close details"
      on:click={closeEvent}
      transition:fade={{ duration: 150 }}
    ></button>

    <!-- Panel -->
    <div
      class="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
      transition:scale={{ duration: 200, start: 0.96, opacity: 0, easing: quintOut }}
    >
      <!-- Header band -->
      <div class="relative bg-gradient-to-br from-brand-700 to-brand-600 text-white p-6 pb-5">
        <button
          type="button"
          on:click={closeEvent}
          class="absolute top-3 right-3 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Close (Esc)"
        >
          <X size={20} />
        </button>
        {#if selectedIsNext}
          <span class="inline-block mb-2 rounded-full bg-sun text-ink text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Next event</span>
        {/if}
        <div class="flex items-center gap-4 pr-8">
          <div class="shrink-0 w-16 rounded-2xl bg-white/15 ring-1 ring-white/20 text-center py-2">
            <div class="text-[11px] font-bold uppercase tracking-wider text-brand-100">{p.monthShort}</div>
            <div class="text-3xl font-bold font-display leading-none">{p.day}</div>
          </div>
          <div class="min-w-0">
            <h2 id="event-modal-title" class="text-xl font-bold font-display leading-tight">{selected.name}</h2>
            <p class="mt-1 text-sm text-brand-100">{fullDate(selected.date)}</p>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-4">
        <div class="space-y-2.5 text-slate-700">
          <p class="flex items-center gap-2.5">
            <Clock size={18} class="text-clay shrink-0" />
            <span>{selected.startTime.slice(0,5)}–{selected.endTime.slice(0,5)}</span>
          </p>
          <p class="flex items-start gap-2.5">
            <MapPin size={18} class="text-clay shrink-0 mt-0.5" />
            <span>{selected.venue.name}{#if selected.venue.address}<br />{selected.venue.address}{/if}{#if selected.venue.postcode} · {selected.venue.postcode}{/if}</span>
          </p>
        </div>

        {#if selected.description}
          <p class="text-slate-600 leading-relaxed whitespace-pre-line border-t border-slate-100 pt-4">{selected.description}</p>
        {/if}

        <div class="flex flex-col sm:flex-row gap-2 pt-2">
          <a href={mapsUrl(selected.venue)} target="_blank" rel="noopener" class="btn-secondary flex-1">
            <MapPin size={16} /> Get directions <ArrowUpRight size={14} />
          </a>
          <AddToCalendar event={selected} variant="button" class="flex-1" />
        </div>
      </div>
    </div>
  </div>
{/if}

<SiteFooter />
