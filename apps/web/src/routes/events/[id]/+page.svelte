<script lang="ts">
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import PhotoGrid from '$lib/components/PhotoGrid.svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon, categoryTint, categoryInk } from '$lib/categoryIcon';
  import type { GalleryPhoto } from '$lib/gallery';
  import { ArrowLeft, Clock, MapPin, ArrowUpRight, CalendarX2, Camera, BarChart3, Laptop } from 'lucide-svelte';
  import type { PageData } from './$types';

  interface Venue {
    name: string;
    address: string | null;
    postcode: string | null;
  }
  interface EventStats {
    repairCount: number;
    completedCount: number;
    cannotRepairCount: number;
    awaitingReturnCount: number;
    successRate: number;
    co2SavedKg: number;
    volunteerCount: number;
    categories: Array<{ name: string; colour: string | null; icon: string | null; count: number; completedCount: number }>;
  }
  interface PublicEvent {
    id: string;
    name: string;
    description: string | null;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    /** Help moving a computer to Linux is on offer at this session too. */
    supportsLinux?: boolean;
    venue: Venue;
    gallery?: GalleryPhoto[];
    stats?: EventStats | null;
    /** Computers seen at this session, when the cafe offers Linux help. */
    linuxStats?: { installedCount: number; advisedCount: number } | null;
  }

  export let data: PageData;
  $: event = (data.event ?? null) as PublicEvent | null;
  $: notFound = data.notFound;
  $: gallery = event?.gallery ?? [];
  $: stats = event?.stats ?? null;
  // Linux help is offered at an ordinary session, so its figures belong in the
  // same summary rather than in a box of their own.
  $: linuxStats = event?.linuxStats ?? null;

  // Only the figures worth reading. A tile that would say "0" is dropped, so a
  // quiet session shows a short honest row rather than a wall of noughts.
  $: statTiles = [
    ...(!stats
      ? []
      : [
          { value: String(stats.repairCount), label: stats.repairCount === 1 ? 'Item brought in' : 'Items brought in', show: stats.repairCount > 0 },
          { value: String(stats.completedCount), label: 'Went home working', show: stats.completedCount > 0 },
          { value: `${stats.successRate}%`, label: 'Fixed on the day', show: stats.successRate > 0 },
          { value: String(stats.volunteerCount), label: stats.volunteerCount === 1 ? 'Volunteer repairer' : 'Volunteer repairers', show: stats.volunteerCount > 0 },
          { value: `${stats.co2SavedKg} kg`, label: 'CO₂ saved', show: stats.co2SavedKg > 0 },
        ]),
    ...(!linuxStats
      ? []
      : [
          { value: String(linuxStats.installedCount), label: linuxStats.installedCount === 1 ? 'Computer moved to Linux' : 'Computers moved to Linux', show: linuxStats.installedCount > 0 },
          { value: String(linuxStats.advisedCount), label: 'Advised about Linux', show: linuxStats.advisedCount > 0 },
        ]),
  ].filter((t) => t.show);

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

<main class="max-w-3xl mx-auto px-4 py-8 md:py-12 space-y-6">
  <a href="/events" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
    <ArrowLeft size={16} /> Back to all events
  </a>

  {#if notFound || !event}
    <div class="card p-8 text-center">
      <span class="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-brand-100 text-pine">
        <CalendarX2 size={22} />
      </span>
      <h1 class="mt-4 text-pine">Event not found</h1>
      <p class="mt-2 text-slate-600">This event may have been removed or is no longer published.</p>
      <a href="/events" class="btn-primary mt-4 inline-flex">See upcoming events</a>
    </div>
  {:else}
    {@const p = dateParts(event.date)}
    <article class="card overflow-hidden">
      <!-- Header band -->
      <div class="relative bg-gradient-to-br from-brand-700 to-brand-500 text-white p-6 sm:p-8">
        {#if isPast}
          <span class="inline-block mb-2 rounded-full bg-white/15 ring-1 ring-white/20 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Past event</span>
        {/if}
        <div class="flex items-center gap-4">
          <div class="shrink-0 w-16 rounded-2xl bg-white/15 ring-1 ring-white/20 text-center py-2">
            <div class="text-[11px] font-bold uppercase tracking-wider text-brand-100">{p.monthShort}</div>
            <div class="text-3xl font-bold font-display leading-none">{p.day}</div>
          </div>
          <div class="min-w-0">
            <h1 class="text-white text-2xl sm:text-3xl font-bold font-display leading-tight">{event.name}</h1>
            <p class="mt-1 text-sm text-brand-100">{fullDate(event.date)}</p>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="p-6 sm:p-8 space-y-5">
        {#if event.supportsLinux}
          <!-- Stated up front, because it is the reason some people come at
               all, and they need to know to bring the computer and a backup. -->
          <a
            href="/linux"
            class="flex items-start gap-3 rounded-xl bg-brand-50 ring-1 ring-brand-200 p-4 transition-colors hover:bg-brand-100"
          >
            <Laptop size={20} class="shrink-0 mt-0.5 text-brand-700" />
            <span class="min-w-0">
              <span class="block font-semibold text-pine">Linux help at this session</span>
              <span class="block mt-0.5 text-sm text-slate-600">
                Bring an old computer and we can put Linux on it, free of charge. Back up your
                files first. Read what to expect.
              </span>
            </span>
          </a>
        {/if}

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

    <!-- ─────────────── What happened at this session ─────────────── -->
    {#if statTiles.length > 0}
      <section class="card p-6 sm:p-8">
        <h2 class="text-xl font-semibold font-display text-pine flex items-center gap-2">
          <BarChart3 size={20} class="text-clay shrink-0" /> What happened at this session
        </h2>
        <dl class="mt-5 flex flex-wrap gap-3">
          {#each statTiles as tile}
            <div class="flex-1 min-w-[7.5rem] rounded-xl bg-brand-50 ring-1 ring-brand-100 px-4 py-3 text-center">
              <dt class="sr-only">{tile.label}</dt>
              <dd>
                <span class="block text-2xl font-bold font-display text-pine leading-none">{tile.value}</span>
                <span class="mt-1 block text-xs text-slate-600">{tile.label}</span>
              </dd>
            </div>
          {/each}
        </dl>

        {#if stats && stats.categories.length > 0}
          <h3 class="mt-6 text-base font-semibold text-slate-800">What we worked on</h3>
          <ul class="mt-3 flex flex-wrap gap-2">
            {#each stats.categories as cat}
              <li
                class="inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-slate-200 pl-2 pr-3 py-1.5 text-sm text-slate-700"
              >
                <span class="inline-flex h-6 w-6 items-center justify-center rounded-lg" style={`background:${categoryTint(cat.colour)}`}>
                  <Icon icon={categoryIcon(cat.icon, cat.name)} width="14" height="14" style={`color:${categoryInk(cat.colour)}`} />
                </span>
                <span>{cat.name}</span>
                <span class="font-semibold tabular-nums text-pine">{cat.count}</span>
              </li>
            {/each}
          </ul>
        {/if}

        {#if stats && stats.awaitingReturnCount > 0}
          <p class="mt-4 text-sm text-slate-600">
            {stats.awaitingReturnCount}
            {stats.awaitingReturnCount === 1 ? 'item is' : 'items are'} waiting for a part and will be finished at a later session.
          </p>
        {/if}
        <p class="mt-4 text-xs text-slate-500">
          Figures come from our own records. We never show visitor names or contact details.
        </p>
      </section>
    {/if}

    <!-- ───────────────────── Photos from the day ───────────────────── -->
    {#if gallery.length > 0}
      <section>
        <h2 class="text-xl font-semibold font-display text-pine flex items-center gap-2">
          <Camera size={20} class="text-clay shrink-0" /> Photos from the day
        </h2>
        <div class="mt-4">
          <PhotoGrid photos={gallery} fallbackAlt={`Photo from ${event.name}`} />
        </div>
      </section>
    {/if}
  {/if}
</main>

<SiteFooter />
