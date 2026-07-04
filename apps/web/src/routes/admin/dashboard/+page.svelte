<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { goto } from '$app/navigation';

  let data: any = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    data = await api('/api/admin/dashboard');
  }

  onMount(() => {
    load();
    timer = setInterval(load, 30000);
    return () => { if (timer) clearInterval(timer); };
  });

  async function activate(id: string) {
    await api(`/api/admin/events/${id}/activate`, { method: 'POST', json: {} });
    await load();
  }
  async function endEvent(id: string) {
    if (!confirm('End the active event? This cannot be undone.')) return;
    await api(`/api/admin/events/${id}/complete`, { method: 'POST', json: {} });
    await load();
  }
</script>

<h1 class="text-2xl font-bold mb-4">Dashboard</h1>

{#if !data}
  <p class="text-slate-500">Loading…</p>
{:else}
  {#if data.activeEvent}
    <div class="card p-6">
      <div class="flex justify-between items-start gap-3">
        <div>
          <p class="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Active event</p>
          <h2 class="text-xl font-semibold mt-1">{data.activeEvent.name}</h2>
          <p class="text-slate-600 text-sm">{data.activeEvent.venueName} · {data.activeEvent.startTime.slice(0,5)}–{data.activeEvent.endTime.slice(0,5)}</p>
        </div>
        <span class="badge badge-active">Active</span>
      </div>
      {#if data.activeCounts}
        <div class="mt-5 grid grid-cols-4 gap-3 text-center">
          <div class="rounded-xl bg-amber-50 text-amber-800 p-3"><p class="text-xs">Waiting</p><p class="text-3xl font-bold">{data.activeCounts.waiting}</p></div>
          <div class="rounded-xl bg-blue-50 text-blue-800 p-3"><p class="text-xs">In progress</p><p class="text-3xl font-bold">{data.activeCounts.in_progress}</p></div>
          <div class="rounded-xl bg-emerald-50 text-emerald-800 p-3"><p class="text-xs">Done</p><p class="text-3xl font-bold">{data.activeCounts.completed}</p></div>
          <div class="rounded-xl bg-rose-50 text-rose-800 p-3"><p class="text-xs">Couldn't</p><p class="text-3xl font-bold">{data.activeCounts.cannot_repair}</p></div>
        </div>
      {/if}
      <div class="mt-5 flex flex-wrap gap-2">
        <a href="/repairer/checkin" class="btn-primary">Add a repair</a>
        <a href={`/admin/events/${data.activeEvent.id}`} class="btn-secondary">View event</a>
        <button on:click={() => endEvent(data.activeEvent.id)} class="btn-danger">End event</button>
      </div>
    </div>
  {:else if data.nextEvent}
    <div class="card p-6">
      <p class="text-xs uppercase tracking-wide text-slate-500 font-semibold">Next event</p>
      <h2 class="text-xl font-semibold mt-1">{data.nextEvent.name}</h2>
      <p class="text-slate-600 text-sm">{data.nextEvent.venueName} · {data.nextEvent.date}</p>
      <div class="mt-4 flex gap-2">
        <button class="btn-primary" on:click={() => activate(data.nextEvent.id)}>Activate event</button>
        <a href={`/admin/events/${data.nextEvent.id}`} class="btn-secondary">View</a>
      </div>
    </div>
  {:else}
    <div class="card p-6">
      <p class="text-slate-600">No upcoming events scheduled.</p>
      <a href="/admin/events/new" class="btn-primary mt-4">Create event</a>
    </div>
  {/if}

  <div class="mt-6 grid sm:grid-cols-2 md:grid-cols-4 gap-3">
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{data.stats.totalRepairs}</p><p class="text-xs text-slate-500">Total repairs</p></div>
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{data.stats.totalEvents}</p><p class="text-xs text-slate-500">Events held</p></div>
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{Number(data.stats.totalSavingsKg).toFixed(1)}<span class="text-base">kg</span></p><p class="text-xs text-slate-500">Saved</p></div>
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{data.stats.activeRepairers}</p><p class="text-xs text-slate-500">Active repairers</p></div>
  </div>

  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-3">Recent activity</h2>
    <ul class="card divide-y divide-slate-100">
      {#each data.recentActivity as a}
        <li class="px-4 py-2 text-sm flex justify-between gap-2">
          <div>
            <code class="text-slate-700">{a.action}</code>
            <span class="text-slate-500"> {a.entityType}</span>
          </div>
          <span class="text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
        </li>
      {:else}
        <li class="px-4 py-3 text-sm text-slate-500">No activity yet.</li>
      {/each}
    </ul>
  </section>
{/if}
