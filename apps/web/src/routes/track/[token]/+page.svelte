<script lang="ts">
  import { track } from '$lib/analytics';
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { api } from '$lib/api';
  import { Wrench, RefreshCw, Clock, CheckCircle2, XCircle, PackageX, Hourglass, Heart, CalendarClock } from 'lucide-svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';
  import { t, tNow } from '$lib/i18n';

  type Status = 'waiting' | 'in_progress' | 'completed' | 'cannot_repair' | 'awaiting_return' | 'returned';

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
  /** An item told to us before the session that has not been checked in. */
  interface TrackPreRegistration {
    id: string;
    status: 'open' | 'cancelled';
    itemDescription: string;
    itemBrand: string | null;
    faultDescription: string;
    category: { name: string; icon: string; colour: string } | null;
    repairerFirstName: string | null;
    createdAt: string;
  }
  interface TrackData {
    customerName: string | null;
    preRegistrations?: TrackPreRegistration[];
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
      if (!data) loadError = err?.message || tNow('Could not load your tracker');
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
      case 'waiting': return tNow('Waiting for a repairer');
      case 'in_progress': return tNow('Being repaired now');
      case 'completed': return tNow('Fixed!');
      case 'cannot_repair': return tNow("Couldn't be fixed");
      case 'awaiting_return': return tNow('Waiting for your next visit');
      case 'returned': return tNow('Returned to you');
    }
  }

  // Calling off a pre-registered item, with a second tap to be sure.
  let confirmCancel: string | null = null;
  let cancelling = false;
  let cancelError = '';

  async function cancelPreRegistration(id: string): Promise<void> {
    cancelling = true;
    cancelError = '';
    try {
      await api(`/api/track/${token}/pre-registrations/${id}`, { method: 'DELETE', autoRefresh: false });
      confirmCancel = null;
      await load();
    } catch (err: any) {
      cancelError = err?.message || 'Could not cancel this item';
    } finally {
      cancelling = false;
    }
  }

  function longDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  $: openPre = (data?.preRegistrations ?? []).filter((p) => p.status === 'open');

  function timeAgo(iso: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return tNow('just now');
    if (mins < 60) return tNow('{mins} min ago', { mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return tNow('{hrs} hr ago', { hrs });
    const days = Math.floor(hrs / 24);
    return tNow(days === 1 ? '{days} day ago' : '{days} days ago', { days });
  }

  function formatUpdated(d: Date | null): string {
    if (!d) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<svelte:head>
  <title>{$t('Track my repair')}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen bg-slate-100 customer-ui">
  <div class="max-w-md mx-auto px-4 py-8">
    {#if loadError && !data}
      <div class="card p-6 text-center">
        <h1 class="text-2xl font-semibold">{$t('Sorry')}</h1>
        <p class="mt-3 text-slate-700">{loadError}</p>
        <p class="mt-2 text-sm text-slate-500">{$t('This tracking link may be incorrect or has expired.')}</p>
        <a class="btn-primary mt-6" href="/events">{$t('See our events')}</a>
      </div>
    {:else if !data}
      <div class="card p-6 text-center text-slate-500">{$t('Loading…')}</div>
    {:else}
      <!-- Header -->
      <div class="card p-6 text-center">
        {#if data.cafe.logoUrl}
          <img src={data.cafe.logoUrl} alt={`${data.cafe.name} logo`} class="h-16 w-16 mx-auto rounded-2xl bg-white object-contain p-2 ring-1 ring-slate-200" />
        {:else}
          <span class="h-14 w-14 mx-auto rounded-2xl bg-brand-600 text-white flex items-center justify-center"><Wrench size={24} /></span>
        {/if}
        <h1 class="text-2xl font-semibold mt-4">
          {#if data.customerName}{$t("{name}'s repairs", { name: data.customerName })}{:else}{$t('Your repairs')}{/if}
        </h1>
        <p class="mt-1 text-sm text-slate-600">{data.event.name} · {data.venue.name}</p>
      </div>

      <!-- Refresh strip -->
      <div class="mt-4 flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          {#if lastUpdated}{$t('Updated {time} · auto-refreshes', { time: formatUpdated(lastUpdated) })}{:else}&nbsp;{/if}
        </span>
        <button class="btn-ghost !px-2 !py-1 text-xs" on:click={load} disabled={busy}>
          <RefreshCw size={14} class={busy ? 'animate-spin' : ''} /> {$t('Refresh')}
        </button>
      </div>

      {#if data.cafe.donateUrl}
        <!-- Donate prompt. Kept subtle, easy to scroll past, and only shown when the cafe has set a link. -->
        <a
          href={data.cafe.donateUrl}
          target="_blank"
          rel="noopener"
          on:click={() => track('donate', { place: 'tracking page' })}
          class="mt-3 flex items-center gap-3 rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-4 text-rose-900 hover:bg-rose-100 transition-colors"
        >
          <Heart size={20} class="fill-rose-500 text-rose-500 shrink-0" />
          <span class="text-sm leading-tight flex-1">
            <strong class="block">{$t('Enjoying the repair cafe?')}</strong>
            {$t('A small donation helps us keep going.')}
          </span>
          <span class="text-sm font-semibold text-rose-700 whitespace-nowrap">{$t('Donate →')}</span>
        </a>
      {/if}

      {#if data.event.status === 'cancelled'}
        <div class="mt-3 card p-4 text-sm text-rose-900 bg-rose-50">
          This session has been cancelled. Please see our events page for other dates.
        </div>
      {/if}

      {#if data.preRegistrations?.length}
        <!-- Items pre-registered for the session that have not arrived yet -->
        <section class="mt-3 space-y-3">
          {#if openPre.length && data.event.status !== 'cancelled'}
            <div class="card p-4 text-sm text-slate-700">
              <p class="font-semibold text-slate-900 flex items-center gap-2"><CalendarClock size={16} /> {longDate(data.event.date)}, {data.event.startTime.slice(0, 5)} to {data.event.endTime.slice(0, 5)}</p>
              <p class="mt-1">Bring your {openPre.length === 1 ? 'item' : 'items'} to {data.venue.name}. When you arrive, scan the QR code at the door, or give your name at the welcome desk. The repair starts when your item is checked in.</p>
            </div>
          {/if}
          {#if cancelError}<p class="text-sm text-rose-700 px-1">{cancelError}</p>{/if}
          {#each data.preRegistrations as pre (pre.id)}
            <div class="card p-5 {pre.status === 'cancelled' ? 'opacity-70' : ''}">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-slate-500">Pre-registered</span>
                <span class="badge {pre.status === 'cancelled' ? 'badge-cancelled' : 'badge-scheduled'}">
                  {pre.status === 'cancelled' ? 'Cancelled' : 'Not checked in yet'}
                </span>
              </div>
              <p class="mt-1 font-semibold text-slate-900 break-words">
                {pre.itemDescription}{#if pre.itemBrand} <span class="font-normal text-slate-500">· {pre.itemBrand}</span>{/if}
              </p>
              <p class="mt-1 text-sm text-slate-600 break-words">{pre.faultDescription}</p>
              {#if pre.status === 'open'}
                {#if pre.repairerFirstName}
                  <p class="mt-3 text-sm text-slate-700">{pre.repairerFirstName}, one of our repairers, is looking into it before the day.</p>
                {/if}
                {#if data.event.status !== 'cancelled'}
                  {#if confirmCancel === pre.id}
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                      <span class="text-sm text-slate-700">Cancel this item?</span>
                      <button class="btn-ghost btn-sm" on:click={() => (confirmCancel = null)}>Keep it</button>
                      <button class="btn-secondary btn-sm" disabled={cancelling} on:click={() => cancelPreRegistration(pre.id)}>Yes, cancel it</button>
                    </div>
                  {:else}
                    <button class="mt-3 text-sm text-slate-500 underline underline-offset-2" on:click={() => (confirmCancel = pre.id)}>I will not bring this item</button>
                  {/if}
                {/if}
              {/if}
            </div>
          {/each}
        </section>
      {/if}

      <!-- Job list -->
      <div class="mt-3 space-y-3">
        {#each data.jobs as job (job.id)}
          {@const isDone = job.status === 'completed' || job.status === 'cannot_repair' || job.status === 'returned'}
          <div class="card p-5">
            <div class="flex items-start gap-3">
              {#if job.photoUrl}
                <!-- Photo of the item the guest handed in. Reassuring and helps spot their item -->
                <a href={job.photoUrl} target="_blank" rel="noopener" class="shrink-0">
                  <img
                    src={job.photoUrl}
                    alt={$t('Photo of {item}', { item: job.itemDescription })}
                    class="w-16 h-16 rounded-xl object-cover ring-1 ring-slate-200 bg-slate-100"
                    loading="lazy"
                  />
                </a>
              {:else if job.category}
                <span class="flex w-10 h-10 shrink-0 rounded-xl text-white items-center justify-center" style="background-color: {job.category.colour}">
                  <Icon icon={categoryIcon(job.category.icon, job.category.name)} width="20" height="20" />
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
                  <p>{$t('Checked in {time}', { time: timeAgo(job.createdAt) })}</p>
                  {#if job.acceptedAt && !isDone}
                    <p>{$t('Picked up by {repairer} {time}', { repairer: job.repairerFirstName ?? $t('a repairer'), time: timeAgo(job.acceptedAt) })}</p>
                  {/if}
                  {#if job.completedAt}
                    <p>{$t('Finished {time}', { time: timeAgo(job.completedAt) })}{#if job.repairerFirstName} {$t('by {repairer}', { repairer: job.repairerFirstName })}{/if}</p>
                  {/if}
                </div>

                {#if isDone && job.outcomeNotes}
                  <div class="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-sm text-slate-700 whitespace-pre-wrap break-words">
                    <span class="font-medium text-slate-900">{$t('From your repairer:')}</span>
                    {job.outcomeNotes}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <p class="mt-8 text-center text-sm text-slate-500">
        {$t('Keep this page open while you wait. It updates automatically.')}
      </p>
      <p class="mt-2 text-center text-xs text-slate-400">
        {$t('Bookmark this link to check back on your repairs later.')}
      </p>
    {/if}
  </div>
</main>
