<script lang="ts">
  // The repair queue: the page a repairer lives on during a session.
  //
  // In order of what matters at the table:
  //   1. what you are working on now, so you can get back to it
  //   2. what is waiting, oldest first, so the person who has waited longest
  //      is seen next (it used to list the newest first)
  //   3. everything else, a tap away
  // Your own totals moved to "My repairs": useful, but not during a session.
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import {
    WAIT_TONE_CLASS,
    firstName,
    formatMinutes,
    minutesBetween,
    sessionTimes,
    statusLabel,
    waitTone,
  } from '$lib/staff/queue';
  import { Camera, CheckCircle2, ChevronRight, Clock, RefreshCw, UserPlus, Wrench, X } from 'lucide-svelte';

  interface Job {
    id: string;
    jobNumber: string;
    customerName: string | null;
    itemDescription: string;
    faultDescription: string;
    itemBrand: string | null;
    status: string;
    repairerId: string | null;
    repairerName: string | null;
    createdAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
    categoryId: string | null;
    category: string | null;
    categoryColour: string | null;
  }
  interface ActiveData {
    event: { id: string; name: string; venueName: string; startTime: string; endTime: string } | null;
    jobs: Job[];
  }
  interface NextSession {
    id: string;
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: { name: string };
  }

  type Tab = 'waiting' | 'in_progress' | 'awaiting_return' | 'finished';

  let data: ActiveData | null = null;
  let loadError = '';
  let mySkills: string[] = [];
  let onlyMine = false;
  let tab: Tab = 'waiting';
  let busyId: string | null = null;
  let confirmTakeOver: string | null = null;
  let actionError = '';
  let nextSession: NextSession | null = null;
  let now = Date.now();

  $: myId = $auth?.user.id ?? null;
  $: done = $page.url.searchParams.get('done');
  $: doneOutcome = $page.url.searchParams.get('outcome');

  async function load() {
    try {
      data = await api<ActiveData>('/api/repairer/active-event');
      loadError = '';
      now = Date.now();
      if (!data.event && !nextSession) {
        const upcoming = await fetch('/api/public/events').then((r) => (r.ok ? r.json() : []));
        nextSession = (upcoming as NextSession[])[0] ?? null;
      }
    } catch (err: any) {
      // Keep showing what we had. A hall's wifi drops now and then.
      loadError = err?.message ?? 'Could not refresh the queue';
    }
  }

  onMount(() => {
    load();
    api<{ skills: string[] }>('/api/repairer/me')
      .then((me) => (mySkills = me?.skills ?? []))
      .catch(() => {});
    try {
      onlyMine = localStorage.getItem('queue.onlyMine') === '1';
    } catch {
      /* private browsing */
    }
    const poll = setInterval(load, 20_000);
    const tick = setInterval(() => (now = Date.now()), 30_000);
    // Coming back to the tab (a phone in a pocket) shows the queue as it is now.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  function setOnlyMine(value: boolean) {
    onlyMine = value;
    try {
      localStorage.setItem('queue.onlyMine', value ? '1' : '0');
    } catch {
      /* fine */
    }
  }

  $: jobs = data?.jobs ?? [];
  $: oldestFirst = [...jobs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  $: mine = oldestFirst.filter((j) => j.status === 'in_progress' && j.repairerId === myId);
  $: waiting = oldestFirst.filter((j) => j.status === 'waiting');
  $: waitingShown = onlyMine && mySkills.length ? waiting.filter((j) => j.categoryId && mySkills.includes(j.categoryId)) : waiting;
  $: beingRepaired = oldestFirst.filter((j) => j.status === 'in_progress');
  $: paused = oldestFirst.filter((j) => j.status === 'awaiting_return');
  $: finished = [...jobs]
    .filter((j) => j.status === 'completed' || j.status === 'cannot_repair' || j.status === 'returned')
    .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime());
  $: fixedCount = jobs.filter((j) => j.status === 'completed').length;

  $: tabs = [
    { key: 'waiting' as Tab, label: 'Waiting', count: waiting.length },
    { key: 'in_progress' as Tab, label: 'Being repaired', count: beingRepaired.length },
    ...(paused.length ? [{ key: 'awaiting_return' as Tab, label: 'Coming back', count: paused.length }] : []),
    { key: 'finished' as Tab, label: 'Finished', count: finished.length },
  ];
  $: shown =
    tab === 'waiting' ? waitingShown : tab === 'in_progress' ? beingRepaired : tab === 'awaiting_return' ? paused : finished;

  async function start(job: Job) {
    busyId = job.id;
    actionError = '';
    try {
      await api(`/api/repairer/jobs/${job.id}/accept`, { method: 'PATCH', json: {} });
      goto(`/repairer/job/${job.id}`);
    } catch (err: any) {
      actionError = err?.message ?? 'Could not start that repair';
      await load();
    } finally {
      busyId = null;
      confirmTakeOver = null;
    }
  }

  function dismissDone() {
    goto('/repairer', { replaceState: true, noScroll: true });
  }

  function longDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  const OUTCOME_WORDS: Record<string, string> = {
    completed: 'marked as fixed. Nice work.',
    cannot_repair: 'marked as could not fix. Thanks for trying.',
    awaiting_return: 'paused until the visitor comes back with a part.',
  };
</script>

<svelte:head><title>Repair queue</title></svelte:head>

{#if done}
  <div class="mb-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 flex items-start gap-3 text-emerald-900">
    <CheckCircle2 size={20} class="shrink-0 mt-0.5" />
    <p class="flex-1 text-sm"><strong>{done}</strong> {OUTCOME_WORDS[doneOutcome ?? ''] ?? 'saved.'}{#if waiting.length} The next item is waiting below.{/if}</p>
    <button class="p-1 rounded-md hover:bg-emerald-100" aria-label="Hide this message" on:click={dismissDone}><X size={16} /></button>
  </div>
{/if}

{#if !data}
  <p class="text-slate-500">{loadError || 'Loading the queue…'}</p>
{:else if !data.event}
  <!-- ── No session running ───────────────────────────────────────── -->
  <section class="card p-6 md:p-8 max-w-2xl">
    <p class="kicker">Repair queue</p>
    <h1 class="text-2xl font-bold mt-1">No session is running</h1>
    <p class="mt-2 text-slate-600">The queue opens when an admin starts a session. It updates by itself, so you can leave this page open.</p>
    {#if nextSession}
      <div class="mt-5 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
        <p class="text-sm text-slate-500">Next session</p>
        <p class="font-semibold text-slate-900">{longDate(nextSession.date)}, {sessionTimes(nextSession.startTime, nextSession.endTime)}</p>
        <p class="text-sm text-slate-600">{nextSession.name} · {nextSession.venue.name}</p>
      </div>
    {/if}
    <div class="mt-6 grid sm:grid-cols-2 gap-3">
      <a href="/repairer/photos" class="btn-secondary"><Camera size={18} /> Add photos of a session</a>
      <a href="/repairer/history" class="btn-secondary"><Wrench size={18} /> My repairs</a>
    </div>
  </section>
{:else}
  <!-- ── The session ──────────────────────────────────────────────── -->
  <header class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
    <div class="min-w-0">
      <p class="kicker flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Session running</p>
      <h1 class="text-2xl md:text-3xl font-bold mt-1 truncate">{data.event.name}</h1>
      <p class="text-slate-600 text-sm">{data.event.venueName} · {sessionTimes(data.event.startTime, data.event.endTime)}</p>
    </div>
    <div class="flex gap-2 shrink-0">
      <a href="/repairer/checkin" class="btn-primary"><UserPlus size={18} /> Check in a visitor</a>
    </div>
  </header>

  <dl class="mt-5 grid grid-cols-3 gap-2 md:gap-3">
    <div class="card px-4 py-3">
      <dt class="text-xs text-slate-500 flex items-center gap-1.5"><span class="status-dot status-dot-waiting"></span> Waiting</dt>
      <dd class="text-2xl md:text-3xl font-bold text-slate-900">{waiting.length}</dd>
    </div>
    <div class="card px-4 py-3">
      <dt class="text-xs text-slate-500 flex items-center gap-1.5"><span class="status-dot status-dot-in_progress"></span> Being repaired</dt>
      <dd class="text-2xl md:text-3xl font-bold text-slate-900">{beingRepaired.length}</dd>
    </div>
    <div class="card px-4 py-3">
      <dt class="text-xs text-slate-500 flex items-center gap-1.5"><span class="status-dot status-dot-completed"></span> Fixed today</dt>
      <dd class="text-2xl md:text-3xl font-bold text-slate-900">{fixedCount}</dd>
    </div>
  </dl>

  {#if loadError}
    <p class="mt-3 text-sm text-amber-800 flex items-center gap-2"><RefreshCw size={14} /> Could not refresh just now. Trying again shortly.</p>
  {/if}
  {#if actionError}
    <p class="mt-3 text-sm text-rose-700">{actionError}</p>
  {/if}

  <!-- ── Your repairs ─────────────────────────────────────────────── -->
  {#if mine.length}
    <section class="mt-6">
      <h2 class="text-lg font-semibold mb-2">You are working on</h2>
      <div class="grid md:grid-cols-2 gap-3">
        {#each mine as j (j.id)}
          <a href={`/repairer/job/${j.id}`} class="card-link p-4 ring-2 ring-blue-200 flex items-center gap-4">
            <span class="h-11 w-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><Wrench size={20} /></span>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-slate-900 truncate">{j.itemDescription}</p>
              <p class="text-sm text-slate-600 truncate">{j.jobNumber}{#if j.customerName} · {firstName(j.customerName)}{/if} · started {formatMinutes(minutesBetween(j.acceptedAt ?? j.createdAt, now)).toLowerCase()} ago</p>
            </div>
            <span class="text-sm font-semibold text-brand-700 flex items-center gap-1 shrink-0">Carry on <ChevronRight size={16} /></span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ── The queue ────────────────────────────────────────────────── -->
  <section class="mt-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-1 rounded-xl bg-slate-200/70 p-1 overflow-x-auto max-w-full" role="tablist">
        {#each tabs as t}
          <button
            role="tab"
            aria-selected={tab === t.key}
            class="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap {tab === t.key ? 'bg-white shadow-sm font-semibold text-slate-900' : 'text-slate-600 hover:text-slate-900'}"
            on:click={() => (tab = t.key)}
          >
            {t.label} <span class="ml-1 text-xs rounded-full px-1.5 py-0.5 {tab === t.key ? 'bg-slate-100' : 'bg-white/60'}">{t.count}</span>
          </button>
        {/each}
      </div>
      {#if tab === 'waiting' && mySkills.length}
        <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600" checked={onlyMine} on:change={(e) => setOnlyMine(e.currentTarget.checked)} />
          Only things I fix
        </label>
      {/if}
    </div>

    {#if shown.length === 0}
      <div class="card mt-3 p-6 text-center text-slate-500">
        {#if tab === 'waiting'}
          {onlyMine && waiting.length ? 'Nothing waiting that matches your skills. Untick "Only things I fix" to see everything.' : 'Nobody is waiting. Time for a cup of tea.'}
        {:else if tab === 'in_progress'}
          Nothing is being repaired right now.
        {:else if tab === 'awaiting_return'}
          Nothing is waiting for a part.
        {:else}
          Nothing has been finished yet today.
        {/if}
      </div>
    {:else}
      <ol class="mt-3 grid lg:grid-cols-2 gap-3">
        {#each shown as j, i (j.id)}
          {@const waited = minutesBetween(j.createdAt, now)}
          <li class="card p-4 flex gap-4">
            {#if tab === 'waiting'}
              <span class="h-9 w-9 shrink-0 rounded-full {i === 0 && !onlyMine ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'} flex items-center justify-center font-bold text-sm" title="Place in the queue">{i + 1}</span>
            {/if}
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <a href={`/repairer/job/${j.id}`} class="font-semibold text-slate-900 hover:underline leading-snug">{j.itemDescription}</a>
                {#if tab !== 'waiting'}<span class="badge badge-{j.status} shrink-0">{statusLabel(j.status)}</span>{/if}
              </div>
              <p class="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="font-mono">{j.jobNumber}</span>
                {#if j.category}<span class="rounded px-1.5 py-0.5 font-medium" style="background-color: {j.categoryColour}22; color: {j.categoryColour}">{j.category}</span>{/if}
                {#if j.itemBrand}<span>{j.itemBrand}</span>{/if}
                {#if j.customerName}<span>· {firstName(j.customerName)}</span>{/if}
              </p>
              <p class="mt-2 text-sm text-slate-700 line-clamp-2">{j.faultDescription}</p>
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm flex items-center gap-1.5 {tab === 'waiting' ? WAIT_TONE_CLASS[waitTone(waited)] : 'text-slate-500'}">
                  <Clock size={14} />
                  {#if tab === 'waiting'}Waiting {formatMinutes(waited).toLowerCase()}
                  {:else if tab === 'in_progress'}{j.repairerId === myId ? 'With you' : `With ${firstName(j.repairerName) || 'someone'}`} · {formatMinutes(minutesBetween(j.acceptedAt ?? j.createdAt, now)).toLowerCase()}
                  {:else if j.repairerName}{firstName(j.repairerName)}
                  {:else}Checked in at {new Date(j.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{/if}
                </p>
                <div class="flex gap-2">
                  {#if j.status === 'waiting'}
                    <button class="btn-primary btn-sm" disabled={busyId === j.id} on:click={() => start(j)}>{busyId === j.id ? 'Starting…' : 'Start this repair'}</button>
                  {:else if j.status === 'awaiting_return'}
                    <button class="btn-primary btn-sm" disabled={busyId === j.id} on:click={() => start(j)}>They are back: carry on</button>
                  {:else if j.status === 'in_progress' && j.repairerId === myId}
                    <a href={`/repairer/job/${j.id}`} class="btn-primary btn-sm">Carry on</a>
                  {:else if j.status === 'in_progress'}
                    {#if confirmTakeOver === j.id}
                      <button class="btn-ghost btn-sm" on:click={() => (confirmTakeOver = null)}>Cancel</button>
                      <button class="btn-primary btn-sm" disabled={busyId === j.id} on:click={() => start(j)}>Yes, take it over</button>
                    {:else}
                      <a href={`/repairer/job/${j.id}`} class="btn-secondary btn-sm">View</a>
                      <button class="btn-secondary btn-sm" on:click={() => (confirmTakeOver = j.id)}>Take over</button>
                    {/if}
                  {:else}
                    <a href={`/repairer/job/${j.id}`} class="btn-secondary btn-sm">View</a>
                  {/if}
                </div>
              </div>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <p class="mt-6 text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-2">
    <a href="/repairer/photos" class="inline-flex items-center gap-1.5 hover:text-slate-800"><Camera size={16} /> Add photos of this session</a>
  </p>
{/if}
