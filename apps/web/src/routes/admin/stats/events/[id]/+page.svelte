<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';
  import { ArrowLeft, Wrench, CheckCircle2, XCircle, PackageX, Hourglass, Clock, Users, Leaf, Laptop } from 'lucide-svelte';
  import { t, tNow } from '$lib/i18n';

  type Status = 'waiting' | 'in_progress' | 'completed' | 'cannot_repair' | 'awaiting_return' | 'returned';

  interface Detail {
    event: {
      id: string;
      name: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      venueName: string;
      venueAddress: string | null;
    };
    totals: {
      repairCount: number;
      completedCount: number;
      cannotRepairCount: number;
      returnedCount: number;
      openCount: number;
      successRate: number;
      avgDurationMin: number;
      totalDurationMin: number;
      environmentalSavingKg: number;
    };
    /** Computers seen here, when the cafe offers Linux help. Null otherwise. */
    linux: {
      installCount: number;
      installedCount: number;
      advisedCount: number;
      co2SavedKg: number;
    } | null;
    repairers: Array<{ id: string; displayName: string; count: number; completedCount: number; avgDurationMin: number }>;
    categories: Array<{ id: string | null; name: string; icon: string | null; colour: string | null; count: number; completedCount: number }>;
    jobs: Array<{
      id: string;
      jobNumber: string;
      itemDescription: string;
      itemBrand: string | null;
      status: Status;
      environmentalSavingKg: number | null;
      durationMin: number | null;
      /** Finished, but not within one sitting, so it has no repair time. */
      finishedLater?: boolean;
      repairerName: string | null;
      categoryName: string | null;
      categoryIcon: string | null;
      categoryColour: string | null;
    }>;
  }

  $: id = $page.params.id;
  let detail: Detail | null = null;
  let loadError = '';

  async function load() {
    if (!id) return;
    try {
      detail = await api<Detail>(`/api/admin/stats/events/${id}`);
      loadError = '';
    } catch (err: any) {
      loadError = err?.message || tNow('Could not load event stats');
    }
  }
  onMount(load);

  function fmtDuration(min: number | null | undefined): string {
    if (!min || min <= 0) return '-';
    if (min < 60) return tNow('{n} min', { n: min });
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? tNow('{h} hr', { h }) : tNow('{h} hr {m} min', { h, m });
  }

  function statusLabel(s: Status): string {
    switch (s) {
      case 'waiting': return tNow('Waiting');
      case 'in_progress': return tNow('In progress');
      case 'completed': return tNow('Fixed');
      case 'cannot_repair': return tNow("Couldn't fix");
      case 'awaiting_return': return tNow('Awaiting return');
      case 'returned': return tNow('Returned');
    }
  }
</script>

<a href="/admin/stats" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
  <ArrowLeft size={14} /> {$t('Back to statistics')}
</a>

{#if loadError}
  <div class="card p-6 mt-4 text-center">
    <p class="text-slate-700">{loadError}</p>
  </div>
{:else if !detail}
  <p class="text-slate-500 mt-4">{$t('Loading…')}</p>
{:else}
  <!-- Header -->
  <div class="mt-3 flex items-start justify-between gap-3 flex-wrap">
    <div>
      <h1 class="text-2xl font-bold">{detail.event.name}</h1>
      <p class="text-slate-600 mt-1">
        {detail.event.venueName} · {detail.event.date} · {detail.event.startTime?.slice(0, 5)}–{detail.event.endTime?.slice(0, 5)}
      </p>
      <span class="badge badge-{detail.event.status} mt-2 inline-block">{$t(detail.event.status)}</span>
    </div>
    <a href={`/admin/events/${detail.event.id}`} class="btn-secondary">{$t('Manage event')}</a>
  </div>

  <!-- Totals -->
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Wrench size={14} /> {$t('Items in')}</div>
      <p class="text-2xl font-bold mt-1">{detail.totals.repairCount}</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><CheckCircle2 size={14} /> {$t('Fixed')}</div>
      <p class="text-2xl font-bold mt-1 text-emerald-700">{detail.totals.completedCount}</p>
      <p class="text-xs text-slate-400 mt-0.5">{$t('{n}% success', { n: detail.totals.successRate })}</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><XCircle size={14} /> {$t("Couldn't fix")}</div>
      <p class="text-2xl font-bold mt-1">{detail.totals.cannotRepairCount}</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Users size={14} /> {$t('Volunteers')}</div>
      <p class="text-2xl font-bold mt-1">{detail.repairers.length}</p>
      <p class="text-xs text-slate-400 mt-0.5">{$t('took on a repair')}</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Clock size={14} /> {$t('Avg time')}</div>
      <p class="text-2xl font-bold mt-1">{fmtDuration(detail.totals.avgDurationMin)}</p>
      <p class="text-xs text-slate-400 mt-0.5">{$t('{time} total', { time: fmtDuration(detail.totals.totalDurationMin) })}</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Leaf size={14} /> {$t('CO₂ saved')}</div>
      <p class="text-2xl font-bold mt-1">{detail.totals.environmentalSavingKg.toFixed(1)}<span class="text-sm font-normal text-slate-500"> kg</span></p>
    </div>
  </div>

  <!-- Linux help is an extra offered at an ordinary session, so it is reported
       alongside the repairs rather than on a page of its own. -->
  {#if detail.linux}
    <div class="card p-4 mt-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-semibold flex items-center gap-2"><Laptop size={18} class="text-brand-600" /> {$t('Linux help at this session')}</h2>
        <a href="/admin/linux" class="text-sm text-brand-700 hover:underline">{$t('See all Linux records')}</a>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div>
          <p class="text-xs text-slate-500">{$t('Computers seen')}</p>
          <p class="text-2xl font-bold mt-0.5">{detail.linux.installCount}</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">{$t('Now on Linux')}</p>
          <p class="text-2xl font-bold mt-0.5 text-emerald-700">{detail.linux.installedCount}</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">{$t('Advised')}</p>
          <p class="text-2xl font-bold mt-0.5">{detail.linux.advisedCount}</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">{$t('CO₂ saved')}</p>
          <p class="text-2xl font-bold mt-0.5">{detail.linux.co2SavedKg.toFixed(1)}<span class="text-sm font-normal text-slate-500"> kg</span></p>
        </div>
      </div>
    </div>
  {/if}

  <div class="grid md:grid-cols-2 gap-4 mt-4">
    <!-- Volunteers -->
    <div class="card p-4">
      <h2 class="text-lg font-semibold mb-3">{$t('Volunteers')}</h2>
      {#if detail.repairers.length === 0}
        <p class="text-sm text-slate-500 py-4 text-center">{$t('No repairs taken on yet.')}</p>
      {:else}
        <ul class="divide-y divide-slate-100 text-sm">
          {#each detail.repairers as r}
            <li class="flex items-center justify-between py-2">
              <span class="font-medium text-slate-900">{r.displayName}</span>
              <span class="flex items-center gap-3 text-slate-600">
                <span><strong class="text-slate-900">{r.count}</strong> {$t('taken')}</span>
                <span class="text-emerald-700">{$t('{n} fixed', { n: r.completedCount })}</span>
                <span class="text-xs text-slate-500 whitespace-nowrap">{$t('avg {time}', { time: fmtDuration(r.avgDurationMin) })}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Categories -->
    <div class="card p-4">
      <h2 class="text-lg font-semibold mb-3">{$t('Item categories')}</h2>
      {#if detail.categories.length === 0}
        <p class="text-sm text-slate-500 py-4 text-center">{$t('No items yet.')}</p>
      {:else}
        <ul class="divide-y divide-slate-100 text-sm">
          {#each detail.categories as c}
            <li class="flex items-center justify-between py-2">
              <span class="flex items-center gap-2">
                <span
                  class="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                  style="background-color: {c.colour ?? '#94a3b8'}"
                >
                  <Icon icon={categoryIcon(c.icon ?? '')} width="16" height="16" />
                </span>
                <span class="font-medium text-slate-900">{c.name}</span>
              </span>
              <span class="flex items-center gap-3 text-slate-600">
                <span><strong class="text-slate-900">{c.count}</strong></span>
                <span class="text-emerald-700">{$t('{n} fixed', { n: c.completedCount })}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Job list -->
  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-2">{$t('All repairs')}</h2>
    {#if detail.jobs.length === 0}
      <div class="card p-6 text-center text-sm text-slate-500">{$t('No items checked in.')}</div>
    {:else}
      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">#</th>
              <th class="px-3 py-2">{$t('Item')}</th>
              <th class="px-3 py-2">{$t('Category')}</th>
              <th class="px-3 py-2">{$t('Volunteer')}</th>
              <th class="px-3 py-2">{$t('Status')}</th>
              <th class="px-3 py-2 text-right">{$t('Time')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each detail.jobs as j}
              <tr>
                <td class="px-3 py-2 font-mono text-xs text-slate-500">{j.jobNumber}</td>
                <td class="px-3 py-2 text-slate-900">
                  {j.itemDescription}{#if j.itemBrand} <span class="text-slate-500">· {j.itemBrand}</span>{/if}
                </td>
                <td class="px-3 py-2 text-slate-600">
                  {#if j.categoryName}
                    <span class="inline-flex items-center gap-1">
                      <span
                        class="w-4 h-4 rounded inline-flex items-center justify-center text-white"
                        style="background-color: {j.categoryColour ?? '#94a3b8'}"
                      >
                        <Icon icon={categoryIcon(j.categoryIcon ?? '')} width="10" height="10" />
                      </span>
                      {j.categoryName}
                    </span>
                  {:else}
                    <span class="text-slate-400">-</span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-slate-600">{j.repairerName ?? '-'}</td>
                <td class="px-3 py-2">
                  <span class="badge badge-{j.status} inline-flex items-center gap-1">
                    {#if j.status === 'waiting'}<Hourglass size={11} />{/if}
                    {#if j.status === 'in_progress'}<Clock size={11} />{/if}
                    {#if j.status === 'completed'}<CheckCircle2 size={11} />{/if}
                    {#if j.status === 'cannot_repair'}<XCircle size={11} />{/if}
                    {#if j.status === 'returned'}<PackageX size={11} />{/if}
                    {statusLabel(j.status)}
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-slate-600 whitespace-nowrap">
                  {#if j.finishedLater}
                    <span title={$t('This repair took 4 hours or more, so it was most likely finished after the session. Its time is left out of the averages.')}>{$t('Finished later')}</span>
                  {:else}
                    {fmtDuration(j.durationMin)}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{/if}
