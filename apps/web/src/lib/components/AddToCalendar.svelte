<script lang="ts">
  import { CalendarPlus } from 'lucide-svelte';
  import { downloadICS, type CalEvent } from '$lib/calendar';

  export let event: CalEvent;
  // link    — inline text action (sits next to e.g. "Get directions")
  // button  — full secondary button (e.g. the home "Next event" spotlight)
  // compact — icon-only, for overlaying on small date tiles
  export let variant: 'link' | 'button' | 'compact' = 'link';

  $: label = `Add ${event.name} to your calendar`;

  function add() {
    downloadICS(event);
  }
</script>

{#if variant === 'compact'}
  <button
    type="button"
    on:click|stopPropagation={add}
    aria-label={label}
    title="Add to calendar"
    class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-brand-700 ring-1 ring-black/5 shadow-sm transition hover:bg-white hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
  >
    <CalendarPlus size={15} />
  </button>
{:else if variant === 'button'}
  <button type="button" on:click={add} aria-label={label} class="btn-secondary">
    <CalendarPlus size={16} /> Add to calendar
  </button>
{:else}
  <button
    type="button"
    on:click={add}
    aria-label={label}
    class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:underline"
  >
    <CalendarPlus size={16} class="shrink-0" /> Add to calendar
  </button>
{/if}
