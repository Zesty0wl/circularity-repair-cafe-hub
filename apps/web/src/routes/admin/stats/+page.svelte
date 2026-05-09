<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';

  let from = '';
  let to = '';
  let summary: any = null;
  let byMonth: any[] = [];
  let byCategory: any[] = [];
  let success: any[] = [];
  let topRepairers: any[] = [];
  let env: any = null;
  let perEvent: any[] = [];

  let monthlyCanvas: HTMLCanvasElement;
  let categoryCanvas: HTMLCanvasElement;
  let successCanvas: HTMLCanvasElement;
  let charts: any[] = [];

  async function loadAll() {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString() ? `?${q}` : '';
    [summary, byMonth, byCategory, success, topRepairers, env, perEvent] = await Promise.all([
      api(`/api/admin/stats/summary${qs}`),
      api(`/api/admin/stats/repairs-by-month${qs}`),
      api(`/api/admin/stats/repairs-by-category${qs}`),
      api(`/api/admin/stats/success-rate-over-time${qs}`),
      api(`/api/admin/stats/top-repairers${qs}`),
      api(`/api/admin/stats/environmental-savings${qs}`),
      api(`/api/admin/stats/jobs-per-event${qs}`),
    ]);
    await renderCharts();
  }

  async function renderCharts() {
    const Chart = (await import('chart.js/auto')).default;
    charts.forEach((c) => c.destroy());
    charts = [];
    if (monthlyCanvas) {
      charts.push(new Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels: byMonth.map((m: any) => m.month),
          datasets: [
            { label: 'Completed', data: byMonth.map((m) => m.completed), backgroundColor: '#0f4f3f' },
            { label: 'Cannot repair', data: byMonth.map((m) => m.cannotRepair), backgroundColor: '#dc2626' },
          ],
        },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true } } },
      }));
    }
    if (categoryCanvas) {
      charts.push(new Chart(categoryCanvas, {
        type: 'doughnut',
        data: {
          labels: byCategory.map((c: any) => c.category),
          datasets: [{ data: byCategory.map((c: any) => c.count), backgroundColor: ['#0f4f3f', '#16a34a', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#dc2626', '#64748b', '#0ea5e9'] }],
        },
      }));
    }
    if (successCanvas) {
      charts.push(new Chart(successCanvas, {
        type: 'line',
        data: {
          labels: success.map((s: any) => s.month),
          datasets: [{ label: 'Success rate %', data: success.map((s: any) => s.successRatePct), borderColor: '#0f4f3f', backgroundColor: 'rgba(15,79,63,.1)', fill: true, tension: 0.25 }],
        },
        options: { scales: { y: { min: 0, max: 100 } } },
      }));
    }
  }

  onMount(loadAll);
  onDestroy(() => charts.forEach((c) => c.destroy()));

  function exportCsv() {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    window.location.href = `/api/admin/repairs/export.csv?${q}`;
  }
</script>

<div class="flex justify-between items-center">
  <h1 class="text-2xl font-bold">Statistics</h1>
  <button class="btn-secondary" on:click={exportCsv}>Export raw data (CSV)</button>
</div>

<div class="card p-4 mt-4 flex items-end gap-3 text-sm flex-wrap">
  <div><label class="label" for="fr">From</label><input id="fr" type="date" class="input" bind:value={from} /></div>
  <div><label class="label" for="to">To</label><input id="to" type="date" class="input" bind:value={to} /></div>
  <button class="btn-primary" on:click={loadAll}>Apply</button>
</div>

{#if summary}
  <div class="grid sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4">
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{summary.totalJobs}</p><p class="text-xs text-slate-500">Total jobs</p></div>
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{summary.completed}</p><p class="text-xs text-slate-500">Repaired</p></div>
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{summary.successRate}%</p><p class="text-xs text-slate-500">Success rate</p></div>
    <div class="card p-4 text-center"><p class="text-3xl font-bold">{Number(summary.totalSavingsKg).toFixed(1)}<span class="text-base">kg</span></p><p class="text-xs text-slate-500">CO₂ saved</p></div>
  </div>
{/if}

<div class="grid lg:grid-cols-2 gap-4 mt-4">
  <div class="card p-4"><h2 class="font-semibold mb-2">Repairs by month</h2><canvas bind:this={monthlyCanvas}></canvas></div>
  <div class="card p-4"><h2 class="font-semibold mb-2">By category</h2><canvas bind:this={categoryCanvas}></canvas></div>
  <div class="card p-4"><h2 class="font-semibold mb-2">Success rate over time</h2><canvas bind:this={successCanvas}></canvas></div>
  <div class="card p-4">
    <h2 class="font-semibold mb-2">Top repairers</h2>
    <ol class="text-sm space-y-1">
      {#each topRepairers as r, i}
        <li class="flex justify-between"><span>{i + 1}. {r.displayName}</span><span class="font-semibold">{r.repairs}</span></li>
      {/each}
    </ol>
  </div>
</div>

<div class="grid md:grid-cols-2 gap-4 mt-4">
  {#if env}
    <div class="card p-4">
      <h2 class="font-semibold mb-2">Environmental savings</h2>
      <p class="text-3xl font-bold text-emerald-700">{Number(env.totalKg).toFixed(1)} kg</p>
      <p class="text-sm text-slate-600">Across {env.count} repairs</p>
    </div>
  {/if}
  <div class="card p-4">
    <h2 class="font-semibold mb-2">Jobs per event</h2>
    <table class="w-full text-sm">
      <thead class="text-slate-600 text-left"><tr><th>Event</th><th>Date</th><th class="text-right">Jobs</th></tr></thead>
      <tbody class="divide-y divide-slate-100">
        {#each perEvent as e}
          <tr><td>{e.name}</td><td>{e.date}</td><td class="text-right">{e.jobs}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
