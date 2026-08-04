<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  $: id = $page.params.id;
  let detail: any = null;
  let cafe: any = null;

  onMount(async () => {
    [detail, cafe] = await Promise.all([api(`/api/admin/events/${id}`), api('/api/admin/settings')]);
    setTimeout(() => window.print(), 800);
  });
</script>

<svelte:head><title>Print QR</title></svelte:head>

<!-- The white background sits on this wrapper, not on a :global(body) rule.
     A route's CSS stays loaded for the rest of the browsing session, so a
     global rule would repaint every page visited after this one. Printing is
     already covered: app.css forces a white body inside media print. -->
{#if detail}
  <div class="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
    <h1 class="text-4xl font-bold">{cafe?.name ?? ''}</h1>
    <h2 class="text-2xl mt-2">{detail.event.name}</h2>
    <p class="text-lg mt-1">{detail.event.date} · {detail.event.startTime?.slice(0,5)}–{detail.event.endTime?.slice(0,5)} · {detail.venue.name}</p>
    {#if detail.event.qrCodeUrl}
      <img src={detail.event.qrCodeUrl} alt="QR Code" class="mt-8 w-96 h-96" />
    {/if}
    <p class="text-2xl font-semibold mt-6">Scan to check in your item for repair</p>
    <p class="text-sm text-slate-500 mt-2">Powered by Repair Cafe Hub</p>
  </div>
{/if}
