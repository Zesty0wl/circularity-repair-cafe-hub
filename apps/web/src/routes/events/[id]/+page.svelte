<script lang="ts">
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import { ArrowLeft, Clock, MapPin, ArrowUpRight, CalendarX2 } from 'lucide-svelte';
  import type { PageData } from './$types';

  interface Venue {
    name: string;
    address: string | null;
    postcode: string | null;
  }
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

  export let data: PageData;
  $: event = (data.event ?? null) as PublicEvent | null;
  $: notFound = data.notFound;

  // Anchored at UTC noon + a fixed locale so SSR and the browser render
  // identical text (no hydration mismatch).
  function dateParts(d: string) {
    const dt = new Date(d + 'T12:00:00Z');
    return {
      day: dt.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' }),
      monthShort: dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    };
  }
  function fullDate(d: string): string {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  function mapsUrl(v: Venue): string {
    const parts = [v.name, v.address, v.postcode].filter(Boolean);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
  }

  // An event whose date has passed still resolves (good for SEO) but we surface
  // that it has been and gone rather than implying it is upcoming.
  $: isPast = !!event && event.date < new Date().toISOString().slice(0, 10);
</script>

<SiteHeader variant="public" />

<main class="max-w-3xl mx-auto px-4 py-10 space-y-6">
  <a href="/events" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
    <ArrowLeft size={16} /> Back to all events
  </a>

  {#if notFound || !event}
    <div class="card p-8 text-center">
      <span class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sage/50 text-pine">
        <CalendarX2 size={26} />
      </span>
      <h1 class="mt-4 !text-pine">Event not found</h1>
      <p class="mt-2 text-slate-600">This event may have been removed or is no longer published.</p>
      <a href="/events" class="btn-primary mt-4 inline-flex">See upcoming events</a>
    </div>
  {:else}
    {@const p = dateParts(event.date)}
    <article class="card overflow-hidden">
      <!-- Header band -->
      <div class="relative bg-gradient-to-br from-brand-700 to-brand-600 text-white p-6 sm:p-8">
        {#if isPast}
          <span class="inline-block mb-2 rounded-full bg-white/15 ring-1 ring-white/20 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Past event</span>
        {/if}
        <div class="flex items-center gap-4">
          <div class="shrink-0 w-16 rounded-2xl bg-white/15 ring-1 ring-white/20 text-center py-2">
            <div class="text-[11px] font-bold uppercase tracking-wider text-brand-100">{p.monthShort}</div>
            <div class="text-3xl font-bold font-display leading-none">{p.day}</div>
          </div>
          <div class="min-w-0">
            <h1 class="!text-white text-2xl sm:text-3xl font-bold font-display leading-tight">{event.name}</h1>
            <p class="mt-1 text-sm text-brand-100">{fullDate(event.date)}</p>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="p-6 sm:p-8 space-y-5">
        <div class="space-y-2.5 text-slate-700">
          <p class="flex items-center gap-2.5">
            <Clock size={18} class="text-clay shrink-0" />
            <span>{event.startTime.slice(0, 5)}–{event.endTime.slice(0, 5)}</span>
          </p>
          <p class="flex items-start gap-2.5">
            <MapPin size={18} class="text-clay shrink-0 mt-0.5" />
            <span>
              {event.venue.name}{#if event.venue.address}<br />{event.venue.address}{/if}{#if event.venue.postcode} · {event.venue.postcode}{/if}
            </span>
          </p>
        </div>

        {#if event.description}
          <p class="text-slate-600 leading-relaxed whitespace-pre-line border-t border-slate-100 pt-5">{event.description}</p>
        {/if}

        {#if !isPast}
          <div class="flex flex-col sm:flex-row gap-2 pt-2">
            <a href={mapsUrl(event.venue)} target="_blank" rel="noopener" class="btn-secondary flex-1">
              <MapPin size={16} /> Get directions <ArrowUpRight size={14} />
            </a>
            <AddToCalendar {event} variant="button" class="flex-1" />
          </div>
        {:else}
          <div class="pt-2">
            <a href="/events" class="btn-primary inline-flex">See upcoming events</a>
          </div>
        {/if}
      </div>
    </article>
  {/if}
</main>

<SiteFooter />
