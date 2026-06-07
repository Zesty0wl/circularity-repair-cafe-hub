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
<style>
  :global(body) { background: white; }
</style>

{#if detail}
  <div class="min-h-screen flex flex-col items-center justify-center p-8 text-center">
    <h1 class="text-4xl font-bold">{cafe?.name ?? ''}</h1>
    <h2 class="text-2xl mt-2">{detail.event.name}</h2>
    <p class="text-lg mt-1">{detail.event.date} · {detail.event.startTime?.slice(0,5)}–{detail.event.endTime?.slice(0,5)} · {detail.venue.name}</p>
    {#if detail.event.qrCodeUrl}
      <img src={detail.event.qrCodeUrl} alt="QR Code" class="mt-8 w-96 h-96" />
    {/if}
    <p class="text-2xl font-semibold mt-6">Scan to check in your item for repair</p>
    <p class="text-sm text-slate-500 mt-2 inline-flex items-center justify-center gap-1.5">
      <span>Powered by</span>
      <img src="/brand/logo-horizontal.svg" alt="Circularity.org" class="h-4 w-auto" />
      <span>Repair Cafe Hub</span>
    </p>
  </div>
{/if}
