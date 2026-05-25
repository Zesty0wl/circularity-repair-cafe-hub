<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { api } from '$lib/api';
  import { Wrench, RefreshCw, Clock, CheckCircle2, XCircle, PackageX, Hourglass, Heart } from 'lucide-svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';

  type Status = 'waiting' | 'in_progress' | 'completed' | 'cannot_repair' | 'returned';

  interface TrackJob {
    id: string;
    jobNumber: string;
    status: Status;
    itemDescription: string;
    itemBrand: string | null;
    faultDescription: string;
    outcomeNotes: string | null;
    category: { name: string; icon: string; colour: string } | null;
    repairerFirstName: string | null;
    photoUrl: string | null;
    createdAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
  }
  interface TrackData {
    customerName: string | null;
    event: { id: string; name: string; date: string; startTime: string; endTime: string; status: string };
    venue: { name: string; address: string | null };
    cafe: { name: string; logoUrl: string | null; donateUrl: string | null };
    jobs: TrackJob[];
  }

  $: token = $page.params.token;

  let data: TrackData | null = null;
  let loadError = '';
  let busy = false;
  let lastUpdated: Date | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  const REFRESH_MS = 60_000; // poll every minute — matches the user expectation of "every few minutes"

  async function load(): Promise<void> {
    if (!token) return;
    busy = true;
    try {
      data = await api<TrackData>(`/api/track/${token}`, { autoRefresh: false });
      loadError = '';
      lastUpdated = new Date();
    } catch (err: any) {
      // Only surface the error if we never had data — keep stale data on transient failures.
      if (!data) loadError = err?.message || 'Could not load your tracker';
    } finally {
      busy = false;
    }
  }

  function startPolling(): void {
    stopPolling();
    refreshTimer = setInterval(() => {
      if (browser && document.visibilityState === 'visible') {
        void load();
      }
    }, REFRESH_MS);
  }
  function stopPolling(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }
  function onVisibilityChange(): void {
    if (!browser) return;
    if (document.visibilityState === 'visible') {
      void load();
    }
  }

  onMount(() => {
    void load();
    startPolling();
    if (browser) document.addEventListener('visibilitychange', onVisibilityChange);
  });
  onDestroy(() => {
    stopPolling();
    if (browser) document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  function statusLabel(s: Status): string {
    switch (s) {
      case 'waiting': return 'Waiting for a repairer';
      case 'in_progress': return 'Being repaired now';
      case 'completed': return 'Fixed!';
      case 'cannot_repair': return "Couldn't be fixed";
      case 'returned': return 'Returned to you';
    }
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function formatUpdated(d: Date | null): string {
    if (!d) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<svelte:head>
  <title>Track my repair</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen bg-slate-50 customer-ui">
  <div class="max-w-md mx-auto px-4 py-6">
    {#if loadError && !data}
      <div class="card p-6 text-center">
        <h1 class="text-2xl font-semibold">Sorry</h1>
        <p class="mt-3 text-slate-700">{loadError}</p>
        <p class="mt-2 text-sm text-slate-500">This tracking link may be incorrect or has expired.</p>
        <a class="btn-primary mt-6" href="/events">See our events</a>
      </div>
    {:else if !data}
      <div class="card p-6 text-center text-slate-500">Loading…</div>
    {:else}
      <!-- Header -->
      <div class="card p-6 text-center">
        {#if data.cafe.logoUrl}
          <img src={data.cafe.logoUrl} alt={`${data.cafe.name} logo`} class="h-16 w-16 mx-auto rounded-2xl bg-white object-contain p-2 ring-1 ring-slate-200" />
        {:else}
          <span class="h-14 w-14 mx-auto rounded-2xl bg-brand-600 text-white flex items-center justify-center"><Wrench size={24} /></span>
        {/if}
        <h1 class="text-2xl font-bold mt-4">
          {#if data.customerName}{data.customerName}'s repairs{:else}Your repairs{/if}
        </h1>
        <p class="mt-1 text-sm text-slate-600">{data.event.name} · {data.venue.name}</p>
      </div>

      <!-- Refresh strip -->
      <div class="mt-4 flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          {#if lastUpdated}Updated {formatUpdated(lastUpdated)} · auto-refreshes{:else}&nbsp;{/if}
        </span>
        <button class="btn-ghost !px-2 !py-1 text-xs" on:click={load} disabled={busy}>
          <RefreshCw size={14} class={busy ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {#if data.cafe.donateUrl}
        <!-- Donate prompt — kept subtle, easy to scroll past, and only shown when the cafe has set a link. -->
        <a
          href={data.cafe.donateUrl}
          target="_blank"
          rel="noopener"
          class="mt-3 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 hover:bg-rose-100 transition-colors"
        >
          <Heart size={20} class="fill-rose-500 text-rose-500 shrink-0" />
          <span class="text-sm leading-tight flex-1">
            <strong class="block">Enjoying the repair cafe?</strong>
            A small donation helps us keep going.
          </span>
          <span class="text-sm font-semibold text-rose-700 whitespace-nowrap">Donate →</span>
        </a>
      {/if}

      <!-- Job list -->
      <div class="mt-3 space-y-3">
        {#each data.jobs as job (job.id)}
          {@const isDone = job.status === 'completed' || job.status === 'cannot_repair' || job.status === 'returned'}
          <div class="card p-5">
            <div class="flex items-start gap-3">
              {#if job.photoUrl}
                <!-- Photo of the item the guest handed in — reassuring + helps spot their item -->
                <a href={job.photoUrl} target="_blank" rel="noopener" class="shrink-0">
                  <img
                    src={job.photoUrl}
                    alt={`Photo of ${job.itemDescription}`}
                    class="w-16 h-16 rounded-xl object-cover ring-1 ring-slate-200 bg-slate-100"
                    loading="lazy"
                  />
                </a>
              {:else if job.category}
                <span class="flex w-10 h-10 shrink-0 rounded-xl text-white items-center justify-center" style="background-color: {job.category.colour}">
                  <Icon icon={categoryIcon(job.category.icon)} width="20" height="20" />
                </span>
              {:else}
                <span class="flex w-10 h-10 shrink-0 rounded-xl bg-slate-200 text-slate-600 items-center justify-center"><Wrench size={18} /></span>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-mono text-slate-500">#{job.jobNumber}</span>
                  <span class="badge badge-{job.status}">
                    {#if job.status === 'waiting'}<Hourglass size={12} />{/if}
                    {#if job.status === 'in_progress'}<Clock size={12} />{/if}
                    {#if job.status === 'completed'}<CheckCircle2 size={12} />{/if}
                    {#if job.status === 'cannot_repair'}<XCircle size={12} />{/if}
                    {#if job.status === 'returned'}<PackageX size={12} />{/if}
                    {statusLabel(job.status)}
                  </span>
                </div>
                <p class="mt-1 font-semibold text-slate-900 break-words">
                  {job.itemDescription}{#if job.itemBrand} <span class="font-normal text-slate-500">· {job.itemBrand}</span>{/if}
                </p>
                <p class="mt-1 text-sm text-slate-600 break-words">{job.faultDescription}</p>

                <div class="mt-3 text-xs text-slate-500 space-y-0.5">
                  <p>Checked in {timeAgo(job.createdAt)}</p>
                  {#if job.acceptedAt && !isDone}
                    <p>Picked up by {job.repairerFirstName ?? 'a repairer'} {timeAgo(job.acceptedAt)}</p>
                  {/if}
                  {#if job.completedAt}
                    <p>Finished {timeAgo(job.completedAt)}{#if job.repairerFirstName} by {job.repairerFirstName}{/if}</p>
                  {/if}
                </div>

                {#if isDone && job.outcomeNotes}
                  <div class="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-sm text-slate-700 whitespace-pre-wrap break-words">
                    <span class="font-medium text-slate-900">From your repairer:</span>
                    {job.outcomeNotes}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <p class="mt-8 text-center text-sm text-slate-500">
        Keep this page open while you wait. It updates automatically.
      </p>
      <p class="mt-2 text-center text-xs text-slate-400">
        Bookmark this link to check back on your repairs later.
      </p>
    {/if}
  </div>
</main>
