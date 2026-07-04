<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  interface Row {
    id: string; jobNumber: string; itemDescription: string; status: string;
    completedAt: string | null; createdAt: string; category: string | null;
    eventDate: string; eventName: string;
  }
  let data: { data: Row[]; meta: any } | null = null;
  let page = 1;

  async function load() {
    data = await api(`/api/repairer/history?page=${page}&perPage=25`);
  }
  onMount(load);
</script>

<h1 class="text-2xl font-bold">My history</h1>
{#if !data}<p class="text-slate-500 mt-3">Loading…</p>{:else}
  <div class="overflow-x-auto card mt-4">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-slate-600 text-left">
        <tr>
          <th class="px-3 py-2">Date</th>
          <th class="px-3 py-2">Job</th>
          <th class="px-3 py-2">Item</th>
          <th class="px-3 py-2">Category</th>
          <th class="px-3 py-2">Outcome</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each data.data as r}
          <tr>
            <td class="px-3 py-2">{r.eventDate}</td>
            <td class="px-3 py-2 font-mono">{r.jobNumber}</td>
            <td class="px-3 py-2">{r.itemDescription}</td>
            <td class="px-3 py-2">{r.category ?? '-'}</td>
            <td class="px-3 py-2"><span class="badge badge-{r.status}">{r.status.replace('_', ' ')}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="mt-3 flex items-center justify-between text-sm text-slate-600">
    <span>Page {data.meta.page} of {data.meta.totalPages}</span>
    <div class="flex gap-2">
      <button class="btn-ghost" disabled={page <= 1} on:click={() => { page--; load(); }}>Prev</button>
      <button class="btn-ghost" disabled={page >= data.meta.totalPages} on:click={() => { page++; load(); }}>Next</button>
    </div>
  </div>
{/if}
