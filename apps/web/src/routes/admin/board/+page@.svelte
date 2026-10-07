<script lang="ts">
  // The live board, for an admin. Two ways to look at it:
  //
  //   Admin view          the whole picture with the detail behind it: who
  //                       brought what, photos, and a link to every repair.
  //   Waiting-room view   exactly what the screen in the waiting area shows,
  //                       for when this laptop is the screen.
  //
  // For a screen that stays up all day, "Show on a screen" gives a private
  // link that needs nobody signed in on it (/display/<token>). That is better
  // than leaving an admin signed in where anyone can walk up to it.
  //
  // This page uses +page@.svelte so it fills the window without the admin
  // menu around it.
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, restoreSession } from '$lib/api';
  import { auth, isAdmin } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import LiveBoard from '$lib/components/LiveBoard.svelte';
  import ScreenLinkDialog from '$lib/components/ScreenLinkDialog.svelte';
  import { fromAdminBoard, type BoardData } from '$lib/staff/board';
  import { TEXT_SCALES, chime, keepAwake, loadNumber, newlyWaiting, saveNumber, unlockSound } from '$lib/staff/screen';
  import { ArrowLeft, Bell, BellOff, Maximize2, Minimize2, Minus, Plus, Tv, UserPlus, Users } from 'lucide-svelte';

  const POLL_MS = 5_000;

  let ready = false;
  let data: BoardData | null = null;
  let eventIds: Array<{ id: string; name: string }> = [];
  let selectedEventId = '';
  let lastError = '';
  let fresh = new Set<string>();
  let view: 'control' | 'display' = 'control';
  let soundOn = false;
  let fullscreen = false;
  let textScale = 1;
  let showScreenLink = false;
  let controlsVisible = true;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let release: (() => void) | undefined;

  async function load() {
    try {
      const qs = selectedEventId ? `?eventId=${encodeURIComponent(selectedEventId)}` : '';
      const body = await api<any>(`/api/admin/board${qs}`);
      eventIds = (body.events ?? []).map((e: any) => ({ id: e.id, name: e.name }));
      const next = fromAdminBoard(body, $cafe);
      const arrived = newlyWaiting(data?.jobs ?? null, next.jobs);
      if (arrived.length) {
        fresh = new Set(arrived);
        setTimeout(() => (fresh = new Set()), 8000);
        if (soundOn) chime();
      }
      data = next;
      lastError = '';
    } catch (err: any) {
      lastError = err?.message ?? 'Could not refresh';
    }
  }

  async function toggleSound() {
    if (soundOn) {
      soundOn = false;
    } else {
      soundOn = await unlockSound();
      if (soundOn) chime();
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* ignored: needs a click */
    }
  }

  function setView(next: 'control' | 'display') {
    view = next;
    try {
      localStorage.setItem('board.view', next);
    } catch {
      /* fine */
    }
    showControls();
  }

  function size(step: number) {
    const i = Math.max(0, Math.min(TEXT_SCALES.length - 1, TEXT_SCALES.indexOf(textScale) + step));
    textScale = TEXT_SCALES[i] ?? 1;
    saveNumber('board.textScale', textScale);
  }

  // In the waiting-room view the controls get out of the way after a moment.
  function showControls() {
    controlsVisible = true;
    clearTimeout(hideTimer);
    if (view === 'display') hideTimer = setTimeout(() => (controlsVisible = false), 4000);
  }

  const onFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));

  onMount(async () => {
    await restoreSession();
    if (!$auth) {
      goto('/login?next=/admin/board', { replaceState: true });
      return;
    }
    if (!isAdmin($auth)) {
      goto('/repairer', { replaceState: true });
      return;
    }
    ready = true;
    try {
      if (localStorage.getItem('board.view') === 'display') view = 'display';
    } catch {
      /* fine */
    }
    textScale = loadNumber('board.textScale', 1);
    if (!TEXT_SCALES.includes(textScale)) textScale = 1;
    showControls();
    load();
    poll = setInterval(load, POLL_MS);
    release = keepAwake();
    document.addEventListener('fullscreenchange', onFullscreen);
  });

  onDestroy(() => {
    clearInterval(poll);
    clearTimeout(hideTimer);
    release?.();
    if (typeof document !== 'undefined') document.removeEventListener('fullscreenchange', onFullscreen);
  });
</script>

<svelte:head><title>Live board</title></svelte:head>

{#if ready}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="page" class:idle={view === 'display' && !controlsVisible} on:mousemove={showControls} on:touchstart={showControls}>
    {#if view === 'control'}
      <header class="bar">
        <a href="/admin/dashboard" class="bar-btn" title="Back to the dashboard"><ArrowLeft size={18} /> <span class="hide-sm">Dashboard</span></a>
        <p class="bar-title">Live board</p>
        {#if eventIds.length > 1}
          <select class="bar-select" bind:value={selectedEventId} on:change={load} aria-label="Which session">
            <option value="">All of today's sessions</option>
            {#each eventIds as e}<option value={e.id}>{e.name}</option>{/each}
          </select>
        {/if}
        <div class="seg" role="group" aria-label="View">
          <button class:on={view === 'control'} on:click={() => setView('control')}><Users size={16} /> <span class="hide-sm">Admin view</span></button>
          <button class:on={view !== 'control'} on:click={() => setView('display')}><Tv size={16} /> <span class="hide-sm">Waiting-room view</span></button>
        </div>
        <span class="spacer"></span>
        {#if lastError}<span class="bar-error">Could not refresh</span>{/if}
        <a href="/repairer/checkin" class="bar-btn"><UserPlus size={18} /> <span class="hide-sm">Check in</span></a>
        <button class="bar-btn" on:click={toggleSound} title={soundOn ? 'Chime is on for new check-ins' : 'Play a chime when someone checks in'}>
          {#if soundOn}<Bell size={18} />{:else}<BellOff size={18} />{/if}
        </button>
        <button class="bar-btn" on:click={() => (showScreenLink = true)}><Tv size={18} /> <span class="hide-sm">Show on a screen</span></button>
        <button class="bar-btn" on:click={toggleFullscreen} title={fullscreen ? 'Leave full screen' : 'Full screen'}>
          {#if fullscreen}<Minimize2 size={18} />{:else}<Maximize2 size={18} />{/if}
        </button>
      </header>
    {/if}

    <LiveBoard {data} mode={view} {fresh} {textScale} />

    {#if view === 'display' && controlsVisible}
      <div class="float">
        <button on:click={() => setView('control')}><ArrowLeft size={16} /> Admin view</button>
        <button on:click={() => size(-1)} aria-label="Smaller text"><Minus size={16} /></button>
        <button on:click={() => size(1)} aria-label="Bigger text"><Plus size={16} /></button>
        <button on:click={toggleFullscreen} aria-label="Full screen">{#if fullscreen}<Minimize2 size={16} />{:else}<Maximize2 size={16} />{/if}</button>
      </div>
    {/if}
  </div>

  {#if showScreenLink}
    <ScreenLinkDialog on:close={() => (showScreenLink = false)} />
  {/if}
{:else}
  <div class="loading">Loading…</div>
{/if}

<style>
  .page { min-height: 100dvh; background: #fbf7ef; }
  .page.idle { cursor: none; }
  .bar {
    height: 3.25rem; display: flex; align-items: center; gap: 0.5rem; padding: 0 0.75rem;
    background: white; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; color: #334155;
  }
  .bar-title { font-weight: 700; margin: 0 0.5rem 0 0.25rem; color: #0f172a; }
  .bar-btn {
    display: inline-flex; align-items: center; gap: 0.35rem; height: 2.25rem; padding: 0 0.7rem;
    border-radius: 0.6rem; border: 0; background: transparent; color: inherit; cursor: pointer; text-decoration: none; font: inherit;
  }
  .bar-btn:hover { background: #f1f5f9; }
  .bar-select { height: 2.25rem; border-radius: 0.6rem; border: 1px solid #cbd5e1; padding: 0 0.5rem; font: inherit; background: white; }
  .bar-error { color: #b45309; font-size: 0.85rem; }
  .seg { display: inline-flex; background: #f1f5f9; border-radius: 0.7rem; padding: 0.2rem; }
  .seg button {
    display: inline-flex; align-items: center; gap: 0.35rem; height: 1.9rem; padding: 0 0.65rem;
    border: 0; border-radius: 0.5rem; background: transparent; color: #475569; cursor: pointer; font: inherit;
  }
  .seg button.on { background: white; color: #0f172a; font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
  .spacer { flex: 1; }
  .float {
    position: fixed; right: 1rem; bottom: 4.5rem; z-index: 10; display: flex; gap: 0.35rem;
    background: rgba(28, 38, 34, 0.88); border-radius: 999px; padding: 0.35rem;
  }
  .float button {
    display: inline-flex; align-items: center; gap: 0.35rem; height: 2.2rem; min-width: 2.2rem; padding: 0 0.7rem;
    border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.12); color: white; cursor: pointer; font: inherit; font-size: 0.85rem;
  }
  .float button:hover { background: rgba(255, 255, 255, 0.25); }
  .loading { min-height: 100dvh; display: grid; place-items: center; color: #64748b; background: #fbf7ef; }
  @media (max-width: 900px) { .hide-sm { display: none; } }
</style>
