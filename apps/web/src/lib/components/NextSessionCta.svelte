<script lang="ts">
  import AddToCalendar from './AddToCalendar.svelte';
  import { Calendar } from 'lucide-svelte';
  import type { CalEvent } from '$lib/calendar';
  import { t, dateLocale } from '$lib/i18n';

  // The dark band that closes a public page. Every page ends on an
  // invitation rather than trailing off into the footer.
  interface Venue { name: string; postcode?: string | null }

  export let event: CalEvent | null = null;
  export let venue: Venue | null = null;
  /** Photo shown behind the band, at low contrast. */
  export let image: string | null = null;
  // Leave the text props out to get the standard wording, in the visitor's
  // language. Text a page passes in is shown as it is.
  export let heading: string | null = null;
  export let body: string | null = null;
  export let ctaHref = '/events';
  export let ctaLabel: string | null = null;

  $: shownHeading = heading ?? $t('Got something broken?');
  $: shownBody =
    body ?? $t('Bring it along to our next session. Repairs are free, everyone is welcome, and the kettle is always on.');
  $: shownCtaLabel = ctaLabel ?? $t('See upcoming events');

  function formatDate(d: string): string {
    return new Date(d + 'T12:00:00Z').toLocaleDateString(dateLocale(), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }
  // Keep a postcode on one line: a break in the middle of it looks wrong.
  function noWrap(s: string): string {
    return s.replace(/\s+/g, ' ');
  }
</script>

<section class="relative isolate overflow-hidden bg-brand-900 text-white">
  {#if image}
    <div aria-hidden="true" class="absolute inset-0 -z-20 bg-cover bg-center" style={`background-image: url('${image}')`}></div>
    <div aria-hidden="true" class="absolute inset-0 -z-10 bg-brand-900/90"></div>
  {:else}
    <div aria-hidden="true" class="absolute inset-0 -z-10 bg-gradient-to-br from-brand-800 to-brand-600"></div>
  {/if}

  <div class="section text-center">
    <h2 class="section-title !text-white">{shownHeading}</h2>
    <p class="section-lede !text-white/85 max-w-2xl mx-auto">{shownBody}</p>
    {#if event}
      <p class="mt-6 text-lg font-semibold">
        {formatDate(event.date)}, {event.startTime.slice(0, 5)}–{event.endTime.slice(0, 5)}
      </p>
      {#if venue}
        <p class="mt-1 text-white/75">{venue.name}{#if venue.postcode}, {noWrap(venue.postcode)}{/if}</p>
      {/if}
    {/if}
    <div class="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 sm:justify-center">
      <a href={ctaHref} class="btn-primary !bg-white !text-brand-800 hover:!bg-slate-100">
        <Calendar size={18} /> {shownCtaLabel}
      </a>
      {#if event}
        <AddToCalendar {event} variant="button" class="!bg-white/10 !text-white !ring-1 !ring-white/40 hover:!bg-white/20" />
      {/if}
    </div>
  </div>
</section>
