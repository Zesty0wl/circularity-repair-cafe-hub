<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { Clock, CheckCircle2, XCircle, Hourglass, History, UserCircle2, UserPlus } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  interface Job {
    id: string; jobNumber: string; customerName: string | null; itemDescription: string;
    faultDescription: string; itemBrand: string | null; status: string; repairerId: string | null;
    repairerName: string | null;
    createdAt: string; category: string | null; categoryIcon: string | null; categoryColour: string | null;
  }
  interface ActiveData {
    event: any | null;
    jobs: Job[];
    counts: { waiting: number; in_progress: number; completed: number; cannot_repair: number } | null;
    myJobs: Job[];
  }

  let data: ActiveData | null = null;
  let stats: { total: number; successRate: number; busiestCategory: string | null } | null = null;
  let filter: 'all' | 'waiting' | 'in_progress' | 'completed' | 'cannot_repair' = 'waiting';
  let timer: ReturnType<typeof setInterval> | null = null;
  let busyId: string | null = null;

  $: myId = $auth?.user.id ?? null;

  async function load() {
    [data, stats] = await Promise.all([
      api<ActiveData>('/api/repairer/active-event'),
      api<{ total: number; successRate: number; busiestCategory: string | null }>('/api/repairer/stats'),
    ]);
  }

  onMount(() => {
    load();
    timer = setInterval(load, 60000);
    return () => { if (timer) clearInterval(timer); };
  });

  async function accept(id: string) {
    busyId = id;
    try {
      await api(`/api/repairer/jobs/${id}/accept`, { method: 'PATCH', json: {} });
      await load();
      goto(`/repairer/job/${id}`);
    } finally {
      busyId = null;
    }
  }

  async function takeOver(job: Job) {
    const owner = job.repairerName ?? 'another repairer';
    if (!confirm(`Take over this job from ${owner}? They will be removed as the active repairer.`)) return;
    await accept(job.id);
  }

  $: filteredJobs = (data?.jobs ?? []).filter((j) => filter === 'all' || j.status === filter);

  function fmtTime(ts: string): string {
    const d = new Date(ts);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="grid sm:grid-cols-2 gap-4">
  {#if data?.event}
    <div class="card p-5">
      <h2 class="text-lg font-semibold">{data.event.name}</h2>
      <p class="text-slate-600 text-sm">{data.event.venueName} · {data.event.startTime.slice(0,5)}–{data.event.endTime.slice(0,5)}</p>
      {#if data.counts}
        <div class="mt-4 grid grid-cols-2 gap-2 text-center">
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-waiting"></span>Waiting</p><p class="mt-auto text-2xl font-bold text-slate-900">{data.counts.waiting}</p></div>
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-in_progress"></span>In progress</p><p class="mt-auto text-2xl font-bold text-slate-900">{data.counts.in_progress}</p></div>
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-completed"></span>Done</p><p class="mt-auto text-2xl font-bold text-slate-900">{data.counts.completed}</p></div>
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-cannot_repair"></span>Cannot repair</p><p class="mt-auto text-2xl font-bold text-slate-900">{data.counts.cannot_repair}</p></div>
        </div>
      {/if}
      <a href="/repairer/checkin" class="mt-4 btn-primary w-full"><UserPlus size={16} /> Register a repair for a visitor</a>
    </div>
  {:else}
    <div class="card p-5">
      <h2 class="text-lg font-semibold">No active event</h2>
      <p class="text-slate-600 text-sm mt-2">An admin will activate an event when it starts.</p>
    </div>
  {/if}

  <div class="card p-5">
    <h2 class="text-lg font-semibold">My stats</h2>
    <div class="mt-3 grid grid-cols-3 gap-2 text-center">
      <div class="flex flex-col"><p class="text-2xl font-bold text-slate-900">{stats?.total ?? 0}</p><p class="mt-auto text-xs text-slate-500">My repairs</p></div>
      <div class="flex flex-col"><p class="text-2xl font-bold text-slate-900">{stats?.successRate ?? 0}%</p><p class="mt-auto text-xs text-slate-500">Success rate</p></div>
      <div class="flex flex-col"><p class="text-sm font-semibold text-slate-900 leading-snug">{stats?.busiestCategory ?? '-'}</p><p class="mt-auto text-xs text-slate-500">Busiest category</p></div>
    </div>
    <a href="/repairer/history" class="mt-4 btn-secondary w-full"><History size={16} /> My history</a>
    <a href="/repairer/profile" class="mt-2 btn-secondary w-full"><UserCircle2 size={16} /> My profile</a>
  </div>
</div>

{#if data?.myJobs?.length}
  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-3">My active repairs</h2>
    <div class="grid sm:grid-cols-2 gap-3">
      {#each data.myJobs as j}
        <a href={`/repairer/job/${j.id}`} class="card p-4 hover:bg-slate-50">
          <p class="text-xs text-slate-500">{j.jobNumber}</p>
          <p class="font-semibold">{j.itemDescription}</p>
          <p class="text-sm text-slate-600">{j.customerName ?? '-'}</p>
        </a>
      {/each}
    </div>
  </section>
{/if}

<section class="mt-8">
  <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
    <h2 class="text-lg font-semibold">Job queue</h2>
    <div class="flex flex-wrap gap-1 text-sm">
      {#each ['waiting', 'in_progress', 'completed', 'cannot_repair', 'all'] as f}
        <button class="px-3 py-1 rounded-full whitespace-nowrap {filter === f ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-slate-200 text-slate-700'}" on:click={() => (filter = f)}>{f.replace('_', ' ')}</button>
      {/each}
    </div>
  </div>

  {#if filteredJobs.length === 0}
    <p class="text-slate-500">No jobs to show.</p>
  {:else}
    <div class="grid sm:grid-cols-2 gap-3">
      {#each filteredJobs as j}
        <article class="card p-4">
          <div class="flex justify-between items-start gap-3">
            <div class="min-w-0">
              <p class="text-xs text-slate-500">{j.jobNumber} · <Clock class="inline" size={12} /> {fmtTime(j.createdAt)}</p>
              <h3 class="font-semibold mt-1">{j.itemDescription}</h3>
              {#if j.itemBrand}<p class="text-sm text-slate-500">{j.itemBrand}</p>{/if}
              {#if j.category}<span class="badge mt-2" style="background-color: {j.categoryColour}22; color: {j.categoryColour}">{j.category}</span>{/if}
              <p class="mt-2 text-sm text-slate-700 line-clamp-2">{j.faultDescription}</p>
              <p class="mt-2 text-xs text-slate-500">Customer: {j.customerName ?? '-'}</p>
              {#if j.status === 'in_progress' && j.repairerName}
                <p class="mt-1 text-xs text-slate-500">With: <strong>{j.repairerId === myId ? 'you' : j.repairerName}</strong></p>
              {/if}
            </div>
            <span class="badge badge-{j.status} shrink-0">{j.status.replace('_', ' ')}</span>
          </div>
          <div class="mt-3 flex justify-end gap-2">
            {#if j.status === 'waiting'}
              <button class="btn-primary text-sm" disabled={busyId === j.id} on:click={() => accept(j.id)}>Claim this repair</button>
            {:else if j.status === 'in_progress' && j.repairerId === myId}
              <a href={`/repairer/job/${j.id}`} class="btn-primary text-sm">Continue</a>
            {:else if j.status === 'in_progress'}
              <a href={`/repairer/job/${j.id}`} class="btn-secondary text-sm">View</a>
              <button class="btn-primary text-sm" disabled={busyId === j.id} on:click={() => takeOver(j)}>Take over</button>
            {:else}
              <a href={`/repairer/job/${j.id}`} class="btn-secondary text-sm">View</a>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>
