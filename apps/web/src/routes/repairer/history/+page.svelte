<script lang="ts">
  // Everything you have repaired, newest first, and your own totals. Each row
  // opens the repair, so you can look back at your notes.
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { statusLabel } from '$lib/staff/queue';
  import { ChevronRight } from 'lucide-svelte';

  interface Row {
    id: string;
    jobNumber: string;
    itemDescription: string;
    status: string;
    completedAt: string | null;
    createdAt: string;
    category: string | null;
    eventDate: string;
    eventName: string;
  }
  let data: { data: Row[]; meta: { page: number; totalPages: number; total: number } } | null = null;
  let stats: { total: number; successRate: number; busiestCategory: string | null } | null = null;
  let page = 1;
  let error = '';

  async function load() {
    try {
      data = await api(`/api/repairer/history?page=${page}&perPage=25`);
      error = '';
    } catch (err: any) {
      error = err?.message ?? 'Could not load your repairs';
    }
  }
  onMount(() => {
    load();
    api<typeof stats>('/api/repairer/stats').then((s) => (stats = s)).catch(() => {});
  });

  function day(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
</script>

<svelte:head><title>My repairs</title></svelte:head>

<h1 class="text-2xl font-bold">My repairs</h1>

<dl class="mt-4 grid grid-cols-3 gap-2 md:gap-3 max-w-2xl">
  <div class="card px-4 py-3"><dt class="text-xs text-slate-500">Repairs</dt><dd class="text-2xl font-bold">{stats?.total ?? '…'}</dd></div>
  <div class="card px-4 py-3"><dt class="text-xs text-slate-500">Fixed</dt><dd class="text-2xl font-bold">{stats ? `${stats.successRate}%` : '…'}</dd></div>
  <div class="card px-4 py-3"><dt class="text-xs text-slate-500">You fix most</dt><dd class="text-base font-semibold leading-tight mt-1">{stats?.busiestCategory ?? '…'}</dd></div>
</dl>

{#if error}
  <p class="mt-4 text-rose-700">{error}</p>
{:else if !data}
  <p class="text-slate-500 mt-4">Loading…</p>
{:else if data.data.length === 0}
  <div class="card p-6 mt-4 text-slate-600">Nothing yet. The repairs you start will be listed here.</div>
{:else}
  <ul class="card mt-4 divide-y divide-slate-100">
    {#each data.data as r}
      <li>
        <a href={`/repairer/job/${r.id}`} class="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-slate-900 truncate">{r.itemDescription}</p>
            <p class="text-xs text-slate-500 truncate"><span class="font-mono">{r.jobNumber}</span> · {day(r.eventDate)}{#if r.category} · {r.category}{/if}</p>
          </div>
          <span class="badge badge-{r.status} shrink-0">{statusLabel(r.status)}</span>
          <ChevronRight size={16} class="text-slate-400 shrink-0" />
        </a>
      </li>
    {/each}
  </ul>
  {#if data.meta.totalPages > 1}
    <div class="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>Page {data.meta.page} of {data.meta.totalPages}</span>
      <div class="flex gap-2">
        <button class="btn-secondary btn-sm" disabled={page <= 1} on:click={() => { page--; load(); }}>Newer</button>
        <button class="btn-secondary btn-sm" disabled={page >= data.meta.totalPages} on:click={() => { page++; load(); }}>Older</button>
      </div>
    </div>
  {/if}
{/if}
