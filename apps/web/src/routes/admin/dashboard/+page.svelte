<script lang="ts">
  // The admin's home page, built around the question an organiser actually
  // has: "what needs me right now?"
  //
  //   During a session: the queue at a glance, anything waiting too long, who
  //   is working on what, and the buttons to run the day (check someone in,
  //   put the queue on a screen, end the session).
  //   Between sessions: the next session, with a button to start it, and the
  //   repairs still waiting for a visitor to come back with a part.
  //
  // The all-time totals and the activity log are still here, but out of the
  // way. They are for reading, not for doing.
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { formatDistanceToNowStrict } from 'date-fns';
  import { cafe } from '$lib/stores/cafe';
  import TelemetryChoice from '$lib/components/TelemetryChoice.svelte';
  import ScreenLinkDialog from '$lib/components/ScreenLinkDialog.svelte';
  import { activityLink, describeActivity } from '$lib/staff/activity';
  import {
    WAIT_TONE_CLASS,
    averageRepairMinutes,
    firstName,
    formatMinutes,
    minutesBetween,
    sessionTimes,
    waitTone,
  } from '$lib/staff/queue';
  import {
    AlertTriangle,
    CalendarPlus,
    ChevronRight,
    MonitorPlay,
    Package,
    Play,
    Square,
    Tv,
    UserPlus,
    X,
  } from 'lucide-svelte';

  interface DashJob {
    id: string;
    jobNumber: string;
    itemDescription: string;
    customerName: string | null;
    status: string;
    createdAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
    repairerId: string | null;
    repairerName: string | null;
    category: string | null;
    categoryColour: string | null;
  }

  let data: any = null;
  let loadError = '';
  let now = Date.now();
  let showScreenLink = false;
  let confirmEnd = false;
  let busy = false;

  // ── Sharing our numbers with the project ──────────────────────────
  // Only ever shown when nobody has said yes yet, and only once per version:
  // the server decides, using the version it last asked at.
  let askTelemetry = false;
  let telemetryLevel: 'none' | 'standard' | 'community' = 'standard';
  let telemetryBusy = false;
  let telemetryDone = '';

  async function loadTelemetryPrompt() {
    try {
      const t = await api<{ shouldPrompt: boolean }>('/api/admin/telemetry');
      askTelemetry = t?.shouldPrompt === true;
    } catch {
      askTelemetry = false;
    }
  }

  async function saveTelemetry() {
    telemetryBusy = true;
    try {
      await api('/api/admin/telemetry', { method: 'PATCH', json: { level: telemetryLevel } });
      telemetryDone = telemetryLevel === 'none' ? 'Nothing will be sent.' : 'Thank you, that really helps.';
      setTimeout(() => (askTelemetry = false), 2200);
    } finally {
      telemetryBusy = false;
    }
  }

  async function dismissTelemetry() {
    askTelemetry = false;
    await api('/api/admin/telemetry/dismiss', { method: 'POST', json: {} }).catch(() => {});
  }

  async function load() {
    try {
      data = await api('/api/admin/dashboard');
      loadError = '';
      now = Date.now();
    } catch (err: any) {
      loadError = err?.message ?? 'Could not load the dashboard';
    }
  }

  onMount(() => {
    load();
    void loadTelemetryPrompt();
    const poll = setInterval(load, 20_000);
    const tick = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  });

  async function start(id: string) {
    busy = true;
    try {
      await api(`/api/admin/events/${id}/activate`, { method: 'POST', json: {} });
      await load();
    } finally {
      busy = false;
    }
  }

  async function endSession(id: string) {
    busy = true;
    try {
      await api(`/api/admin/events/${id}/complete`, { method: 'POST', json: {} });
      confirmEnd = false;
      await load();
    } finally {
      busy = false;
    }
  }

  function longDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
  function shortDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  function isToday(iso: string): boolean {
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return iso === local;
  }

  $: jobs = (data?.activeJobs ?? []) as DashJob[];
  $: waiting = jobs.filter((j) => j.status === 'waiting');
  $: inProgress = jobs.filter((j) => j.status === 'in_progress');
  $: fixed = jobs.filter((j) => j.status === 'completed');
  $: notFixed = jobs.filter((j) => j.status === 'cannot_repair');
  $: paused = jobs.filter((j) => j.status === 'awaiting_return');
  $: overdue = waiting.filter((j) => minutesBetween(j.createdAt, now) >= 30);
  $: typicalRepair = averageRepairMinutes(jobs);
  $: typicalWait = (() => {
    const waits = jobs.filter((j) => j.acceptedAt).map((j) => minutesBetween(j.createdAt, new Date(j.acceptedAt!).getTime()));
    return waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  })();
  $: segments = [
    { label: 'Waiting', n: waiting.length, cls: 'bg-amber-400' },
    { label: 'Being repaired', n: inProgress.length, cls: 'bg-blue-500' },
    { label: 'Fixed', n: fixed.length, cls: 'bg-emerald-500' },
    { label: 'Could not fix', n: notFixed.length, cls: 'bg-rose-400' },
    { label: 'Coming back', n: paused.length, cls: 'bg-violet-400' },
  ];
  $: segmentTotal = Math.max(1, segments.reduce((n, s) => n + s.n, 0));
  $: todayPlanned = !data?.activeEvent ? (data?.upcomingEvents ?? []).find((e: any) => isToday(e.date)) ?? null : null;
  $: nextPlanned = !data?.activeEvent && !todayPlanned ? data?.upcomingEvents?.[0] ?? null : null;
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<div class="flex flex-wrap items-end justify-between gap-3 mb-5">
  <div>
    <h1 class="text-2xl font-bold">Dashboard</h1>
    <p class="text-sm text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
  </div>
  <div class="flex flex-wrap gap-2">
    <a href="/admin/events/new" class="btn-secondary btn-sm"><CalendarPlus size={16} /> Plan a session</a>
  </div>
</div>

{#if askTelemetry}
  <!-- Quiet by design: a card in the flow of the page, not a dialog over it. -->
  <section class="card p-5 mb-5 ring-brand-200 bg-brand-50/40 relative">
    <button class="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-slate-700" type="button" aria-label="Not now" on:click={dismissTelemetry}>
      <X size={16} />
    </button>
    {#if telemetryDone}
      <p class="text-sm text-emerald-800 font-medium">{telemetryDone}</p>
    {:else}
      <TelemetryChoice bind:level={telemetryLevel} cafeName={$cafe?.name ?? 'Your Repair Café'} />
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn-primary btn-sm" type="button" disabled={telemetryBusy} on:click={saveTelemetry}>
          {telemetryLevel === 'none' ? 'Save' : 'Yes, share our numbers'}
        </button>
        <button class="btn-ghost btn-sm" type="button" on:click={dismissTelemetry}>Not now</button>
      </div>
    {/if}
  </section>
{/if}

{#if !data}
  <p class="text-slate-500">{loadError || 'Loading…'}</p>
{:else}
  <div class="grid lg:grid-cols-3 gap-5 items-start">
    <!-- ── Left: today ───────────────────────────────────────────── -->
    <div class="lg:col-span-2 space-y-5">
      {#if data.activeEvent}
        <section class="card p-5 md:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="kicker flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Session running</p>
              <h2 class="text-xl md:text-2xl font-semibold mt-1">{data.activeEvent.name}</h2>
              <p class="text-sm text-slate-600">{data.activeEvent.venueName} · {sessionTimes(data.activeEvent.startTime, data.activeEvent.endTime)}</p>
            </div>
            <a href={`/admin/events/${data.activeEvent.id}`} class="text-sm text-brand-700 hover:underline">Session details</a>
          </div>

          <!-- The day so far, as one bar. -->
          <div class="mt-5 h-3 rounded-full bg-slate-100 overflow-hidden flex" aria-hidden="true">
            {#each segments as s}
              {#if s.n}<div class={s.cls} style="width: {(s.n / segmentTotal) * 100}%"></div>{/if}
            {/each}
          </div>
          <dl class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><dt class="text-xs text-slate-500 flex items-center gap-1.5"><span class="status-dot status-dot-waiting"></span> Waiting</dt><dd class="text-2xl font-bold">{waiting.length}</dd></div>
            <div><dt class="text-xs text-slate-500 flex items-center gap-1.5"><span class="status-dot status-dot-in_progress"></span> Being repaired</dt><dd class="text-2xl font-bold">{inProgress.length}</dd></div>
            <div><dt class="text-xs text-slate-500 flex items-center gap-1.5"><span class="status-dot status-dot-completed"></span> Fixed</dt><dd class="text-2xl font-bold">{fixed.length}</dd></div>
            <div><dt class="text-xs text-slate-500 flex items-center gap-1.5"><span class="status-dot status-dot-cannot_repair"></span> Could not fix</dt><dd class="text-2xl font-bold">{notFixed.length}</dd></div>
          </dl>
          {#if typicalWait !== null || typicalRepair !== null}
            <p class="mt-3 text-sm text-slate-600">
              {#if typicalWait !== null}People wait about <strong>{formatMinutes(typicalWait).toLowerCase()}</strong> to be seen.{/if}
              {#if typicalRepair !== null} A repair takes about <strong>{formatMinutes(typicalRepair).toLowerCase()}</strong>.{/if}
            </p>
          {/if}

          <div class="mt-5 flex flex-wrap gap-2">
            <a href="/repairer/checkin" class="btn-primary btn-sm"><UserPlus size={16} /> Check in a visitor</a>
            <a href="/admin/board" class="btn-secondary btn-sm"><MonitorPlay size={16} /> Live board</a>
            <button class="btn-secondary btn-sm" on:click={() => (showScreenLink = true)}><Tv size={16} /> Show on a screen</button>
            {#if confirmEnd}
              <span class="inline-flex items-center gap-2 text-sm">
                <span class="text-slate-700">{waiting.length + inProgress.length ? `${waiting.length + inProgress.length} still open. End anyway?` : 'End the session?'}</span>
                <button class="btn-ghost btn-sm" on:click={() => (confirmEnd = false)}>No</button>
                <button class="btn-danger btn-sm" disabled={busy} on:click={() => endSession(data.activeEvent.id)}>Yes, end it</button>
              </span>
            {:else}
              <button class="btn-danger-outline btn-sm ml-auto" on:click={() => (confirmEnd = true)}><Square size={14} /> End session</button>
            {/if}
          </div>
        </section>

        {#if overdue.length || (waiting.length && !inProgress.length)}
          <section class="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4 md:p-5">
            <h2 class="font-semibold text-amber-900 flex items-center gap-2"><AlertTriangle size={18} /> Needs a look</h2>
            <ul class="mt-2 space-y-1 text-sm text-amber-900">
              {#if waiting.length && !inProgress.length}
                <li>{waiting.length} waiting and nobody repairing. Is everyone on a break?</li>
              {/if}
              {#each overdue as j}
                <li><a class="underline underline-offset-2" href={`/admin/repairs/${j.id}`}>{j.itemDescription}</a> ({j.jobNumber}) has waited {formatMinutes(minutesBetween(j.createdAt, now)).toLowerCase()}.</li>
              {/each}
            </ul>
          </section>
        {/if}

        <div class="grid md:grid-cols-2 gap-5">
          <section class="card">
            <h2 class="px-4 pt-4 pb-2 font-semibold flex items-center justify-between">Waiting next <span class="text-sm font-normal text-slate-500">{waiting.length}</span></h2>
            {#if waiting.length}
              <ol class="divide-y divide-slate-100">
                {#each waiting.slice(0, 6) as j, i}
                  {@const m = minutesBetween(j.createdAt, now)}
                  <li>
                    <a href={`/admin/repairs/${j.id}`} class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                      <span class="h-6 w-6 rounded-full bg-slate-100 text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium truncate">{j.itemDescription}</span>
                        <span class="block text-xs text-slate-500 truncate">{j.jobNumber}{#if j.category} · {j.category}{/if}</span>
                      </span>
                      <span class="text-xs shrink-0 {WAIT_TONE_CLASS[waitTone(m)]}">{formatMinutes(m)}</span>
                    </a>
                  </li>
                {/each}
              </ol>
              {#if waiting.length > 6}<p class="px-4 py-2 text-xs text-slate-500">and {waiting.length - 6} more</p>{/if}
            {:else}
              <p class="px-4 pb-4 text-sm text-slate-500">Nobody is waiting.</p>
            {/if}
          </section>

          <section class="card">
            <h2 class="px-4 pt-4 pb-2 font-semibold flex items-center justify-between">Being repaired <span class="text-sm font-normal text-slate-500">{inProgress.length}</span></h2>
            {#if inProgress.length}
              <ul class="divide-y divide-slate-100">
                {#each inProgress as j}
                  <li>
                    <a href={`/admin/repairs/${j.id}`} class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                      <span class="h-8 w-8 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center shrink-0" title={j.repairerName ?? ''}>{(j.repairerName ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium truncate">{j.itemDescription}</span>
                        <span class="block text-xs text-slate-500 truncate">{firstName(j.repairerName) || 'Someone'} · {j.jobNumber}</span>
                      </span>
                      <span class="text-xs text-slate-500 shrink-0">{formatMinutes(minutesBetween(j.acceptedAt ?? j.createdAt, now))}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="px-4 pb-4 text-sm text-slate-500">Nothing is being repaired.</p>
            {/if}
          </section>
        </div>
      {:else if todayPlanned}
        <section class="card p-6 ring-2 ring-brand-200">
          <p class="kicker text-brand-700">Today</p>
          <h2 class="text-xl md:text-2xl font-semibold mt-1">{todayPlanned.name}</h2>
          <p class="text-sm text-slate-600">{todayPlanned.venueName} · {sessionTimes(todayPlanned.startTime, todayPlanned.endTime)}</p>
          <p class="mt-3 text-slate-700">Start the session when the doors open. Visitors can check in, and repairers see the queue.</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="btn-primary" disabled={busy} on:click={() => start(todayPlanned.id)}><Play size={18} /> Start the session</button>
            <button class="btn-secondary" on:click={() => (showScreenLink = true)}><Tv size={18} /> Show on a screen</button>
          </div>
        </section>
      {:else if nextPlanned}
        <section class="card p-6">
          <p class="kicker">Next session</p>
          <h2 class="text-xl md:text-2xl font-semibold mt-1">{longDate(nextPlanned.date)}</h2>
          <p class="text-sm text-slate-600">{nextPlanned.name} · {nextPlanned.venueName} · {sessionTimes(nextPlanned.startTime, nextPlanned.endTime)}</p>
          {#if !nextPlanned.isPublished}
            <p class="mt-3 text-sm text-amber-800">This session is not on the website yet. <a class="underline" href={`/admin/events/${nextPlanned.id}`}>Publish it</a> so people know to come.</p>
          {/if}
          <div class="mt-4 flex flex-wrap gap-2">
            <a href={`/admin/events/${nextPlanned.id}`} class="btn-secondary btn-sm">Session details</a>
            <button class="btn-ghost btn-sm" disabled={busy} on:click={() => start(nextPlanned.id)}>Start it now instead</button>
          </div>
        </section>
      {:else}
        <section class="card p-6">
          <h2 class="text-xl font-semibold">No sessions planned</h2>
          <p class="mt-2 text-slate-600">Plan your next session so it appears on the website and visitors can check in on the day.</p>
          <a href="/admin/events/new" class="btn-primary mt-4"><CalendarPlus size={18} /> Plan a session</a>
        </section>
      {/if}

      <section class="card">
        <h2 class="px-4 pt-4 pb-2 font-semibold">Recent activity</h2>
        <ul class="divide-y divide-slate-100">
          {#each data.recentActivity as a}
            {@const d = describeActivity(a)}
            {@const link = activityLink(a)}
            <li class="px-4 py-2.5 text-sm flex justify-between items-baseline gap-3">
              <span class="text-slate-700 min-w-0">
                {#if d.who}<span class="font-semibold text-slate-900">{d.who}</span>{/if}
                {#if link}<a href={link} class="hover:underline">{d.rest}</a>{:else}{d.rest}{/if}
              </span>
              <span class="text-slate-400 text-xs whitespace-nowrap shrink-0" title={new Date(a.createdAt).toLocaleString()}>
                {formatDistanceToNowStrict(new Date(a.createdAt), { addSuffix: true })}
              </span>
            </li>
          {:else}
            <li class="px-4 py-3 text-sm text-slate-500">Nothing yet.</li>
          {/each}
        </ul>
      </section>
    </div>

    <!-- ── Right: what is coming, and what is outstanding ─────────── -->
    <aside class="space-y-5">
      <section class="card">
        <div class="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 class="font-semibold">Coming up</h2>
          <a href="/admin/events" class="text-sm text-brand-700 hover:underline">All events</a>
        </div>
        {#if data.upcomingEvents?.length}
          <ul class="divide-y divide-slate-100">
            {#each data.upcomingEvents as e}
              <li>
                <a href={`/admin/events/${e.id}`} class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span class="w-12 shrink-0 text-center rounded-lg bg-slate-50 ring-1 ring-slate-200 py-1">
                    <span class="block text-[0.65rem] uppercase text-slate-500">{shortDate(e.date).split(' ')[0]}</span>
                    <span class="block text-lg font-bold leading-none">{shortDate(e.date).split(' ')[1]}</span>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium truncate">{e.name}</span>
                    <span class="block text-xs text-slate-500 truncate">{shortDate(e.date).split(' ').slice(2).join(' ')} · {sessionTimes(e.startTime, e.endTime)}</span>
                  </span>
                  {#if !e.isPublished}<span class="badge badge-scheduled shrink-0">Draft</span>{/if}
                  <ChevronRight size={16} class="text-slate-300 shrink-0" />
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="px-4 pb-4 text-sm text-slate-500">Nothing planned. <a class="underline" href="/admin/events/new">Plan a session</a>.</p>
        {/if}
      </section>

      {#if data.awaitingReturn?.length}
        <section class="card">
          <h2 class="px-4 pt-4 pb-1 font-semibold flex items-center gap-2"><Package size={18} class="text-violet-600" /> Coming back with a part</h2>
          <p class="px-4 text-xs text-slate-500">Paused until the visitor returns. They stay here until someone finishes them.</p>
          <ul class="mt-2 divide-y divide-slate-100">
            {#each data.awaitingReturn as j}
              <li>
                <a href={`/admin/repairs/${j.id}`} class="block px-4 py-2.5 hover:bg-slate-50">
                  <span class="block text-sm font-medium truncate">{j.itemDescription}</span>
                  <span class="block text-xs text-slate-500 truncate">{j.jobNumber} · {shortDate(j.eventDate)}{#if j.customerName} · {firstName(j.customerName)}{/if}</span>
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="card p-4">
        <h2 class="font-semibold">Since you started</h2>
        <dl class="mt-3 grid grid-cols-2 gap-3">
          <div><dt class="text-xs text-slate-500">Repairs</dt><dd class="text-xl font-bold">{data.stats.totalRepairs}</dd></div>
          <div><dt class="text-xs text-slate-500">Sessions</dt><dd class="text-xl font-bold">{data.stats.totalEvents}</dd></div>
          <div><dt class="text-xs text-slate-500">CO₂ saved</dt><dd class="text-xl font-bold">{Math.round(Number(data.stats.totalSavingsKg))}<span class="text-sm font-medium"> kg</span></dd></div>
          <div><dt class="text-xs text-slate-500">Volunteers</dt><dd class="text-xl font-bold">{data.stats.activeRepairers}</dd></div>
        </dl>
        <a href="/admin/stats" class="mt-3 inline-block text-sm text-brand-700 hover:underline">All the statistics</a>
      </section>
    </aside>
  </div>
{/if}

{#if showScreenLink}
  <ScreenLinkDialog on:close={() => (showScreenLink = false)} />
{/if}
