<script lang="ts">
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import AddToCalendar from '$lib/components/AddToCalendar.svelte';
  import { Mail, MapPin, Navigation, Locate, Car, Accessibility, Info, Globe, CalendarDays, Clock, Heart } from 'lucide-svelte';
  import type { PageData } from './$types';

  interface PublicEvent {
    id: string;
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: { name: string; postcode: string | null };
  }

  interface Venue {
    name: string;
    address: string | null;
    postcode: string | null;
    what3words: string | null;
    mapUrl: string | null;
    directions: string | null;
    parkingInfo: string | null;
    accessibilityInfo: string | null;
    notes: string | null;
  }
  let venue: Venue | null = null;

  export let data: PageData;
  $: venue = (data.venue ?? null) as Venue | null;
  $: nextEvent = ((data.upcoming ?? []) as PublicEvent[])[0] ?? null;

  function fullDate(d: string): string {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }

  // Build a Google Maps directions URL from the venue name + address.
  // We deliberately use the universal `maps.google.com` URL (rather than a
  // platform-specific scheme) so it opens whatever maps app the device prefers.
  function directionsUrl(v: Venue): string {
    const q = [v.name, v.address, v.postcode].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
  }

  // Normalise a what3words value like "///filled.count.soap" or "filled.count.soap"
  // into a clean three-word display + a what3words.com deep link.
  function w3wDisplay(raw: string): string {
    return '///' + raw.replace(/^\/+/, '').trim();
  }
  function w3wLink(raw: string): string {
    return `https://what3words.com/${raw.replace(/^\/+/, '').trim()}`;
  }

  // Only iframe URLs that are real *embed* URLs. Share links like
  // https://maps.app.goo.gl/... or https://www.google.com/maps/place/... return
  // X-Frame-Options: SAMEORIGIN and will render as a blank box. For those we
  // fall back to a plain external-link button.
  function isEmbeddableMap(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      // Google Maps embed:  https://www.google.com/maps/embed?pb=...
      if (u.hostname === 'www.google.com' && u.pathname.startsWith('/maps/embed')) return true;
      // Legacy Google Maps embed:  https://maps.google.com/maps?...&output=embed
      if (u.hostname === 'maps.google.com' && u.searchParams.get('output') === 'embed') return true;
      // OpenStreetMap embed:  https://www.openstreetmap.org/export/embed.html?...
      if (u.hostname === 'www.openstreetmap.org' && u.pathname.startsWith('/export/embed')) return true;
      // Bing Maps embed:  https://www.bing.com/maps/embed?...
      if (u.hostname === 'www.bing.com' && u.pathname.startsWith('/maps/embed')) return true;
      return false;
    } catch {
      return false;
    }
  }
</script>

<SiteHeader variant="public" />

<main>
  <PageHeader
    eyebrow="Contact"
    title="Get in touch"
    lede="Come along to a session, or reach us before you visit."
  >
    <Mail size={22} slot="icon" />
  </PageHeader>

  <div class="max-w-3xl mx-auto px-4 py-16 md:py-24 space-y-6">
  <!-- When to come, before where to come: it is the question people ask
       first, and the venue is no use without a date. -->
  {#if nextEvent}
    <div class="card p-6">
      <p class="kicker">Next session</p>
      <p class="mt-2 flex items-start gap-2 text-xl font-semibold text-pine">
        <CalendarDays size={22} class="shrink-0 mt-0.5 text-clay" /> <span>{fullDate(nextEvent.date)}</span>
      </p>
      <p class="mt-1 ml-8 flex items-center gap-2 text-slate-700">
        <Clock size={16} class="text-clay shrink-0" /> {nextEvent.startTime.slice(0,5)}–{nextEvent.endTime.slice(0,5)}
      </p>
      <div class="mt-5 flex flex-wrap gap-2">
        <AddToCalendar event={nextEvent} variant="button" class="!py-2" />
        <a href="/events" class="btn-secondary !py-2">See all dates</a>
      </div>
    </div>
  {/if}

  {#if $cafe?.contactEmail}
    <a href="mailto:{$cafe.contactEmail}" class="card-link p-6">
      <p class="kicker">Email us</p>
      <p class="mt-2 inline-flex items-center gap-2 text-xl font-semibold text-brand-700">
        <Mail size={20} /> {$cafe.contactEmail}
      </p>
    </a>
  {/if}

  {#if venue}
    <!-- Find us -->
    <div class="card p-6 space-y-4">
      <div>
        <p class="kicker">Find us</p>
        <p class="mt-2 inline-flex items-start gap-2 text-xl font-semibold">
          <MapPin size={22} class="shrink-0 mt-1" /> <span>{venue.name}</span>
        </p>
        {#if venue.address || venue.postcode}
          <p class="mt-1 text-slate-700 whitespace-pre-line ml-7">
            {venue.address ?? ''}{#if venue.address && venue.postcode}<br />{/if}{venue.postcode ?? ''}
          </p>
        {/if}
      </div>

      {#if venue.what3words}
        <a
          href={w3wLink(venue.what3words)}
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <Locate size={16} class="text-rose-600 shrink-0" />
          <span class="font-mono"><span class="text-rose-600">///</span>{venue.what3words.replace(/^\/+/, '').trim()}</span>
          <!-- The explanation is helpful but not essential, so it drops away
               on a phone rather than wrapping to a second line. -->
          <span class="hidden sm:inline text-slate-400">·</span>
          <span class="hidden sm:inline">pin-precise location</span>
        </a>
      {/if}

      <div class="flex flex-wrap gap-2">
        <a
          href={directionsUrl(venue)}
          target="_blank"
          rel="noopener"
          class="btn-primary !py-2"
        >
          <Navigation size={18} /> Get directions
        </a>
        <!-- A map link that cannot be embedded becomes a button here, so all
             the venue actions stay on one row. -->
        {#if venue.mapUrl && !isEmbeddableMap(venue.mapUrl)}
          <a href={venue.mapUrl} target="_blank" rel="noopener" class="btn-secondary !py-2">
            <MapPin size={16} /> View on map
          </a>
        {/if}
        {#if $cafe?.websiteUrl}
          <a href={$cafe.websiteUrl} target="_blank" rel="noopener" class="btn-secondary !py-2">
            <Globe size={16} /> Visit our website
          </a>
        {/if}
      </div>

      {#if venue.mapUrl && isEmbeddableMap(venue.mapUrl)}
        <iframe
          src={venue.mapUrl}
          title="Map of {venue.name}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          class="w-full h-64 sm:h-80 rounded-xl border border-slate-200"
        ></iframe>
      {/if}
    </div>

    {#if venue.directions}
      <div class="card p-6">
        <p class="kicker flex items-center gap-2"><Info size={14} /> How to find us</p>
        <p class="mt-3 text-slate-700 whitespace-pre-line leading-relaxed">{venue.directions}</p>
      </div>
    {/if}

    {#if venue.parkingInfo}
      <div class="card p-6">
        <p class="kicker flex items-center gap-2"><Car size={14} /> Parking &amp; transport</p>
        <p class="mt-3 text-slate-700 whitespace-pre-line leading-relaxed">{venue.parkingInfo}</p>
      </div>
    {/if}

    {#if venue.accessibilityInfo}
      <div class="card p-6">
        <p class="kicker flex items-center gap-2"><Accessibility size={14} /> Accessibility</p>
        <p class="mt-3 text-slate-700 whitespace-pre-line leading-relaxed">{venue.accessibilityInfo}</p>
      </div>
    {/if}

    {#if venue.notes}
      <div class="card p-6">
        <p class="kicker">Good to know</p>
        <p class="mt-3 text-slate-700 whitespace-pre-line leading-relaxed">{venue.notes}</p>
      </div>
    {/if}
  {/if}

  {#if $cafe?.socialLinks && Object.values($cafe.socialLinks).some((v) => v)}
    <div class="card p-6">
      <p class="kicker">Find us online</p>
      <ul class="mt-3 space-y-2">
        {#each Object.entries($cafe.socialLinks) as [k, v]}
          {#if v}
            <li>
              <a class="text-brand-700 hover:underline break-all" href={v} target="_blank" rel="noopener">
                <span class="capitalize font-medium">{k}</span>: {v}
              </a>
            </li>
          {/if}
        {/each}
      </ul>
    </div>
  {/if}

  {#if $cafe?.donateUrl}
    <div class="card p-6">
      <p class="kicker">Support us</p>
      <p class="mt-2 text-slate-700 leading-relaxed">
        Repairs are free. Donations pay for the tools, the room and the tea, and they keep the sessions running.
      </p>
      <a href={$cafe.donateUrl} target="_blank" rel="noopener" class="btn-secondary !py-2 mt-5">
        <Heart size={18} /> Make a donation
      </a>
    </div>
  {/if}
  </div>
</main>

<SiteFooter />
