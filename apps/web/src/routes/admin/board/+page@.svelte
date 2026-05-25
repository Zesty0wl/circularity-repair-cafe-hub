<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth, isAdmin } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import {
    Maximize2, Minimize2, Volume2, VolumeX, Zap, ZapOff, ArrowLeft,
    Image as ImageIcon, ZoomIn, ZoomOut,
  } from 'lucide-svelte';

  type Job = {
    id: string;
    jobNumber: string;
    customerName: string | null;
    itemDescription: string;
    itemBrand: string | null;
    status: 'waiting' | 'in_progress' | 'completed' | 'cannot_repair' | 'returned';
    createdAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
    eventId: string;
    eventName: string;
    category: string | null;
    categoryColour: string | null;
    repairerName: string | null;
    thumbnailUrl: string | null;
  };
  type EventLite = { id: string; name: string; date: string; status: string };

  let jobs: Job[] = [];
  let eventsList: EventLite[] = [];
  let selectedEventId = '';
  let lastError = '';

  let seenIds = new Set<string>();
  let highlightIds = new Set<string>();
  let firstLoadDone = false;
  let now = Date.now();

  // User-controlled toggles
  let soundEnabled = false;
  let isFullscreen = false;
  let wakeLockOn = false;
  let wakeLock: any = null;

  // ───────────── Scale ─────────────
  // Default 1.0 is tuned to fit ~10 rows on a 1080p screen with the standard
  // chrome above. Stored in localStorage so it persists between visits.
  let scale = 1.0;
  const SCALE_MIN = 0.6;
  const SCALE_MAX = 2.0;
  const SCALE_STEP = 0.1;

  // ───────────── Paging ─────────────
  // Page size adapts to viewport so phones don't have to scroll to see
  // every row. We recompute on resize/orientation change. Auto-rotation
  // walks through the pages every PAGE_INTERVAL.
  const PAGE_INTERVAL_MS = 60_000;
  let pageSize = 10;
  let currentPage = 0;
  function computePageSize(): number {
    if (typeof window === 'undefined') return 10;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 540) return 5;                     // phone portrait
    if (w < 900) return h < 700 ? 6 : 8;       // tablet / phone landscape
    return h < 800 ? 8 : 10;                   // desktop / TV
  }
  function syncPageSize() {
    const next = computePageSize();
    if (next !== pageSize) {
      pageSize = next;
      // Keep the first item of the current page visible when paging shrinks
      if (currentPage * pageSize >= jobs.length) currentPage = 0;
    }
  }

  // Polling cadence (ms)
  const POLL_MS = 4000;
  // Highlight a new row for this many ms
  const HIGHLIGHT_MS = 12_000;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let pageTimer: ReturnType<typeof setInterval> | null = null;
  let audioCtx: AudioContext | null = null;

  // ────────────────────────────── data ────────────────────────────────
  async function load() {
    try {
      const params = new URLSearchParams();
      if (selectedEventId) params.set('eventId', selectedEventId);
      const data = await api<{ events: EventLite[]; jobs: Job[] }>(
        `/api/admin/board${params.toString() ? `?${params}` : ''}`,
      );
      eventsList = data.events;
      const incoming = data.jobs;

      const incomingIds = new Set(incoming.map((j) => j.id));
      let newWaitingCount = 0;
      if (firstLoadDone) {
        for (const j of incoming) {
          if (!seenIds.has(j.id)) {
            highlightIds.add(j.id);
            window.setTimeout(() => {
              highlightIds.delete(j.id);
              highlightIds = new Set(highlightIds);
            }, HIGHLIGHT_MS);
            if (j.status === 'waiting') newWaitingCount++;
          }
        }
        if (newWaitingCount > 0) {
          // Always jump back to page 1 so the new check-in is on screen
          currentPage = 0;
          if (soundEnabled) playChime(newWaitingCount);
        }
      }
      seenIds = incomingIds;
      jobs = incoming;
      firstLoadDone = true;
      lastError = '';
    } catch (e: any) {
      lastError = e?.message ?? 'Failed to load';
    }
  }

  // ───────────────────────────── audio ─────────────────────────────────
  function playChime(count = 1) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const tones = [880, 1320];
    for (let n = 0; n < Math.min(count, 3); n++) {
      const offset = n * 0.18;
      tones.forEach((freq, i) => {
        const osc = audioCtx!.createOscillator();
        const gain = audioCtx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx!.destination);
        const start = t0 + offset + i * 0.12;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
        osc.start(start);
        osc.stop(start + 0.5);
      });
    }
  }

  async function enableSound() {
    try {
      audioCtx = audioCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      soundEnabled = true;
      playChime(1);
    } catch {
      soundEnabled = false;
    }
  }
  function disableSound() {
    soundEnabled = false;
  }

  // ─────────────────────────── fullscreen ──────────────────────────────
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        isFullscreen = true;
      } else {
        await document.exitFullscreen();
        isFullscreen = false;
      }
    } catch {
      /* user gesture required, ignored */
    }
  }
  function onFsChange() {
    isFullscreen = !!document.fullscreenElement;
  }

  // ─────────────────────────── wake lock ───────────────────────────────
  async function enableWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await (navigator as any).wakeLock.request('screen');
        wakeLockOn = true;
        wakeLock.addEventListener('release', () => {
          wakeLockOn = false;
        });
      }
    } catch {
      wakeLockOn = false;
    }
  }
  async function disableWakeLock() {
    try {
      await wakeLock?.release?.();
    } catch {
      /* noop */
    }
    wakeLock = null;
    wakeLockOn = false;
  }

  // ───────────────────────────── scale ─────────────────────────────────
  function clampScale(v: number) {
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v * 10) / 10));
  }
  function bumpScale(delta: number) {
    scale = clampScale(scale + delta);
    persistScale();
  }
  function persistScale() {
    try { localStorage.setItem('boardScale', String(scale)); } catch { /* noop */ }
  }
  function loadScale() {
    try {
      const v = localStorage.getItem('boardScale');
      if (v) scale = clampScale(parseFloat(v));
    } catch { /* noop */ }
  }
  function onWheelZoom(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    bumpScale(e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
  }
  function onKey(e: KeyboardEvent) {
    if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === '+' || e.key === '=') bumpScale(SCALE_STEP);
    else if (e.key === '-' || e.key === '_') bumpScale(-SCALE_STEP);
    else if (e.key === '0') { scale = 1.0; persistScale(); }
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  }

  // ──────────────────────────── lifecycle ──────────────────────────────
  onMount(() => {
    if (!$auth || !isAdmin($auth)) {
      goto('/login');
      return;
    }
    loadScale();
    syncPageSize();
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('keydown', onKey);
    document.addEventListener('wheel', onWheelZoom, { passive: false });
    window.addEventListener('resize', syncPageSize);
    window.addEventListener('orientationchange', syncPageSize);
    load();
    pollTimer = setInterval(load, POLL_MS);
    // Tick every second so timers update live
    clockTimer = setInterval(() => (now = Date.now()), 1000);
    // Auto-rotate pages
    pageTimer = setInterval(() => {
      if (totalPages > 1) currentPage = (currentPage + 1) % totalPages;
    }, PAGE_INTERVAL_MS);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (clockTimer) clearInterval(clockTimer);
    if (pageTimer) clearInterval(pageTimer);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('wheel', onWheelZoom);
    window.removeEventListener('resize', syncPageSize);
    window.removeEventListener('orientationchange', syncPageSize);
    disableWakeLock();
  });

  // ────────────────────────── derived state ────────────────────────────
  // Newest first
  $: sortedJobs = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  $: totalPages = Math.max(1, Math.ceil(sortedJobs.length / pageSize));
  // Clamp page if jobs shrunk
  $: if (currentPage >= totalPages) currentPage = 0;
  $: pageJobs = sortedJobs.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  $: counts = {
    waiting: jobs.filter((j) => j.status === 'waiting').length,
    inProgress: jobs.filter((j) => j.status === 'in_progress').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
  };

  // ─────────────────────────── timer formatting ────────────────────────
  // Compact, big-from-a-distance "MM:SS" / "H:MM:SS" elapsed format.
  function fmtElapsedMs(ms: number): string {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /** Returns { primary, secondary } for the time column, depending on status. */
  function timeFor(j: Job): { primary: string; secondary: string } {
    const created = new Date(j.createdAt).getTime();
    const accepted = j.acceptedAt ? new Date(j.acceptedAt).getTime() : null;
    const completed = j.completedAt ? new Date(j.completedAt).getTime() : null;
    if (j.status === 'waiting') {
      return { primary: fmtElapsedMs(now - created), secondary: 'waiting' };
    }
    if (j.status === 'in_progress') {
      return {
        primary: fmtElapsedMs(now - (accepted ?? created)),
        secondary: 'in progress',
      };
    }
    if (j.status === 'completed' && completed) {
      return {
        primary: fmtElapsedMs(completed - created),
        secondary: 'total time',
      };
    }
    if (j.status === 'cannot_repair' && completed) {
      return {
        primary: fmtElapsedMs(completed - created),
        secondary: 'cannot repair',
      };
    }
    return { primary: fmtElapsedMs(now - created), secondary: '' };
  }

  function statusLabel(s: Job['status']): string {
    return s.replace('_', ' ');
  }
</script>

<svelte:head>
  <title>Repairs board · live</title>
</svelte:head>

<div class="board" style="--scale: {scale}">
  {#if !soundEnabled && !firstLoadDone}
    <div class="overlay">
      <div class="overlay-card">
        <h1>Loading the board…</h1>
      </div>
    </div>
  {/if}

  {#if !soundEnabled && firstLoadDone}
    <button class="overlay" on:click={enableSound}>
      <div class="overlay-card">
        <h1>Tap to enable alert sound</h1>
        <p>Browsers require a tap before they will let this page play a chime when a new repair is checked in.</p>
        <span class="enable-pill">Enable sound</span>
      </div>
    </button>
  {/if}

  <header class="topbar">
    <div class="topbar-left">
      <a class="back" href="/admin/dashboard" title="Back to admin"><ArrowLeft size={18} /></a>
      <div>
        <p class="brand">Repair Cafe · Live board</p>
        <p class="sub">
          {#if eventsList.length === 0}
            no events today
          {:else if selectedEventId}
            {eventsList.find((e) => e.id === selectedEventId)?.name ?? ''}
          {:else}
            {eventsList.map((e) => e.name).join(' · ')}
          {/if}
          {#if totalPages > 1}
            <span class="page-pill">page {currentPage + 1} / {totalPages}</span>
          {/if}
        </p>
      </div>
    </div>

    <div class="topbar-mid">
      <div class="stat"><span class="stat-num text-amber-300">{counts.waiting}</span><span class="stat-lbl">waiting</span></div>
      <div class="stat"><span class="stat-num text-sky-300">{counts.inProgress}</span><span class="stat-lbl">in progress</span></div>
      <div class="stat"><span class="stat-num text-emerald-300">{counts.completed}</span><span class="stat-lbl">just finished</span></div>
    </div>

    <div class="topbar-right">
      {#if eventsList.length > 1}
        <select class="ctl" bind:value={selectedEventId} on:change={load}>
          <option value="">All events</option>
          {#each eventsList as e}
            <option value={e.id}>{e.name}</option>
          {/each}
        </select>
      {/if}

      <div class="scale-group" title="Scale (Ctrl+Wheel · keys + / − / 0 to reset)">
        <button class="ctl" on:click={() => bumpScale(-SCALE_STEP)} disabled={scale <= SCALE_MIN}><ZoomOut size={16} /></button>
        <input
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          bind:value={scale}
          on:change={persistScale}
          class="scale-range"
        />
        <button class="ctl" on:click={() => bumpScale(SCALE_STEP)} disabled={scale >= SCALE_MAX}><ZoomIn size={16} /></button>
        <span class="scale-pct">{Math.round(scale * 100)}%</span>
      </div>

      <button class="ctl" class:active={soundEnabled} on:click={() => (soundEnabled ? disableSound() : enableSound())} title="Toggle sound">
        {#if soundEnabled}<Volume2 size={18} />{:else}<VolumeX size={18} />{/if}
      </button>
      <button class="ctl" class:active={wakeLockOn} on:click={() => (wakeLockOn ? disableWakeLock() : enableWakeLock())} title="Keep screen awake">
        {#if wakeLockOn}<Zap size={18} />{:else}<ZapOff size={18} />{/if}
      </button>
      <button class="ctl" on:click={toggleFullscreen} title="Fullscreen (F)">
        {#if isFullscreen}<Minimize2 size={18} />{:else}<Maximize2 size={18} />{/if}
      </button>
      <span class="clock">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  </header>

  {#if lastError}
    <div class="err">Couldn't refresh: {lastError}</div>
  {/if}

  {#if sortedJobs.length === 0}
    <div class="empty">
      <p class="empty-big">No repairs yet</p>
      <p class="empty-sub">When a customer checks in, their job will appear here.</p>
    </div>
  {:else}
    <ul class="rows">
      {#each pageJobs as j (j.id)}
        {@const t = timeFor(j)}
        <li class="row status-{j.status}" class:flash={highlightIds.has(j.id)}>
          <div class="thumb">
            {#if j.thumbnailUrl}
              <img src={j.thumbnailUrl} alt="" loading="lazy" />
            {:else}
              <div class="thumb-empty"><ImageIcon size={28} /></div>
            {/if}
          </div>

          <div class="who">
            <p class="customer">{j.customerName ?? 'Anonymous'}</p>
            <p class="job-no">{j.jobNumber}</p>
          </div>

          <div class="what">
            <p class="item">{j.itemDescription}</p>
            <p class="meta-line">
              {#if j.itemBrand}<span class="brand-pill">{j.itemBrand}</span>{/if}
              {#if j.category}
                <span class="cat" style="background-color: {j.categoryColour ?? '#6366f1'}33; color: {j.categoryColour ?? '#a5b4fc'}">{j.category}</span>
              {/if}
              {#if j.repairerName}<span class="repairer-pill">{j.repairerName}</span>{/if}
            </p>
          </div>

          <div class="time">
            <span class="time-big">{t.primary}</span>
            <span class="time-lbl">{t.secondary}</span>
          </div>

          <div class="status-col">
            <span class="badge">{statusLabel(j.status)}</span>
          </div>
        </li>
      {/each}
    </ul>

    {#if totalPages > 1}
      <!-- Page-progress bar: visually shows the 60s countdown to the next flip.
           Wrapped in {#key currentPage} so the bar re-mounts and the CSS
           animation restarts cleanly when we flip pages. -->
      <div class="page-bar">
        {#key currentPage}
          <div class="page-bar-fill" style="animation-duration: {PAGE_INTERVAL_MS}ms"></div>
        {/key}
        <div class="page-dots">
          {#each Array(totalPages) as _, i}
            <span class="dot" class:active={i === currentPage}></span>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* This page intentionally fills the viewport and ignores the admin chrome.
     It's mounted with +page@.svelte so the only parent layout is the root one. */
  :global(body), :global(html) { background: #0b1220; }

  .board {
    /* Master scale — every sized thing on the page derives from this var.
       Default 1.0 is tuned so 10 rows + chrome fit on a 1080p screen. */
    --scale: 1.0;
    --row-h:        calc(88px  * var(--scale));
    --thumb-w:      calc(132px * var(--scale));
    --gap:          calc(8px   * var(--scale));
    --pad-x:        calc(20px  * var(--scale));
    --customer-fs:  calc(1.7rem  * var(--scale));
    --item-fs:      calc(1.45rem * var(--scale));
    --time-fs:      calc(2.0rem  * var(--scale));
    --meta-fs:      calc(0.95rem * var(--scale));
    --badge-fs:     calc(0.95rem * var(--scale));
    --jobno-fs:     calc(0.9rem  * var(--scale));
    --stat-fs:      calc(2.4rem  * var(--scale));

    min-height: 100vh;
    color: #e2e8f0;
    background: linear-gradient(180deg, #0b1220 0%, #0f172a 100%);
    padding: 12px var(--pad-x) 24px;
    box-sizing: border-box;
  }

  .topbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }
  .topbar-left { display: flex; align-items: center; gap: 12px; }
  .topbar-left .back {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 8px;
    background: rgba(148, 163, 184, 0.12); color: #cbd5e1; text-decoration: none;
  }
  .topbar-left .back:hover { background: rgba(148, 163, 184, 0.22); }
  .brand { font-weight: 700; font-size: 1.1rem; line-height: 1.1; margin: 0; }
  .sub { color: #94a3b8; font-size: 0.85rem; margin: 2px 0 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .page-pill {
    background: rgba(99, 102, 241, 0.25); color: #c7d2fe;
    padding: 2px 8px; border-radius: 999px; font-size: 0.78rem; font-variant-numeric: tabular-nums;
  }

  .topbar-mid { display: flex; gap: 32px; justify-content: center; }
  .stat { display: flex; flex-direction: column; align-items: center; line-height: 1; }
  .stat-num { font-size: var(--stat-fs); font-weight: 800; font-variant-numeric: tabular-nums; }
  .stat-lbl { color: #94a3b8; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }

  .topbar-right { display: flex; align-items: center; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .ctl {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; min-width: 36px; padding: 0 10px;
    background: rgba(148, 163, 184, 0.12); color: #cbd5e1;
    border: none; border-radius: 8px; cursor: pointer; font: inherit;
  }
  .ctl:hover:not(:disabled) { background: rgba(148, 163, 184, 0.22); }
  .ctl:disabled { opacity: 0.4; cursor: not-allowed; }
  .ctl.active { background: rgba(99, 102, 241, 0.35); color: white; }
  select.ctl { padding-right: 24px; }

  .scale-group {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(148, 163, 184, 0.10); border-radius: 8px; padding: 0 6px;
  }
  .scale-range { width: 110px; accent-color: #6366f1; }
  .scale-pct {
    font-variant-numeric: tabular-nums; font-size: 0.85rem; color: #cbd5e1;
    min-width: 42px; text-align: right; padding-right: 4px;
  }

  .clock { font-variant-numeric: tabular-nums; color: #cbd5e1; font-size: 1rem; min-width: 64px; text-align: right; }

  .err {
    background: rgba(244, 63, 94, 0.18); color: #fecaca;
    padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 0.9rem;
  }

  .empty { text-align: center; padding: 80px 20px; color: #94a3b8; }
  .empty-big { font-size: 2.4rem; font-weight: 700; color: #cbd5e1; margin: 0; }
  .empty-sub { margin-top: 8px; }

  /* ──────────────────────────── Rows ──────────────────────────────── */
  .rows {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: var(--gap);
  }
  .row {
    display: grid;
    grid-template-columns:
      var(--thumb-w)
      minmax(180px, 1.1fr)
      minmax(220px, 2fr)
      minmax(140px, 0.8fr)
      minmax(150px, 0.55fr);
    gap: calc(14px * var(--scale));
    align-items: center;
    background: #1e293b;
    border-left: 8px solid transparent;
    border-radius: 12px;
    min-height: var(--row-h);
    padding: calc(8px * var(--scale)) calc(14px * var(--scale)) calc(8px * var(--scale)) calc(8px * var(--scale));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }
  .row.status-waiting       { border-left-color: #fbbf24; }
  .row.status-in_progress   { border-left-color: #38bdf8; }
  .row.status-completed     { border-left-color: #34d399; opacity: 0.85; }
  .row.status-cannot_repair { border-left-color: #f472b6; opacity: 0.75; }
  .row.status-returned      { border-left-color: #94a3b8; opacity: 0.6; }

  .thumb {
    width: var(--thumb-w);
    height: calc(var(--row-h) - 16px);
    border-radius: 8px; overflow: hidden;
    background: #0f172a;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb-empty { color: #475569; }

  .who { min-width: 0; }
  .customer {
    font-size: var(--customer-fs); font-weight: 700; color: white;
    margin: 0; line-height: 1.1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .job-no {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--jobno-fs); color: #94a3b8; margin: 4px 0 0; letter-spacing: 0.04em;
  }

  .what { min-width: 0; }
  .item {
    font-size: var(--item-fs); color: #e2e8f0; line-height: 1.2; margin: 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
  }
  .meta-line {
    margin: 6px 0 0; font-size: var(--meta-fs); color: #94a3b8;
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  }
  .brand-pill, .repairer-pill {
    background: rgba(148, 163, 184, 0.18); color: #cbd5e1;
    padding: 2px 8px; border-radius: 6px;
  }
  .cat { padding: 2px 8px; border-radius: 6px; font-weight: 600; }

  .time {
    display: flex; flex-direction: column; align-items: flex-end; line-height: 1;
    min-width: 0;
  }
  .time-big {
    font-size: var(--time-fs); font-weight: 800; color: white;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .time-lbl {
    font-size: var(--meta-fs); color: #94a3b8; margin-top: 4px;
    text-transform: uppercase; letter-spacing: 0.08em;
  }

  .status-col { display: flex; justify-content: flex-end; }
  .badge {
    text-transform: uppercase; letter-spacing: 0.08em;
    font-size: var(--badge-fs); font-weight: 700;
    padding: 6px 14px; border-radius: 999px;
    background: rgba(148, 163, 184, 0.18); color: #e2e8f0; white-space: nowrap;
  }
  .status-waiting       .badge { background: rgba(251, 191, 36, 0.30); color: #fde68a; }
  .status-in_progress   .badge { background: rgba(56, 189, 248, 0.30); color: #bae6fd; }
  .status-completed     .badge { background: rgba(52, 211, 153, 0.30); color: #a7f3d0; }
  .status-cannot_repair .badge { background: rgba(244, 114, 182, 0.30); color: #fbcfe8; }
  .status-returned      .badge { background: rgba(148, 163, 184, 0.30); color: #cbd5e1; }

  /* Flash animation for newly arrived rows */
  @keyframes flashRow {
    0%   { background: #1e293b; }
    25%  { background: #423500; }
    50%  { background: #1e293b; }
    75%  { background: #423500; }
    100% { background: #1e293b; }
  }
  .row.flash {
    animation: flashRow 1.6s ease-out 4;
    border-left-color: #fbbf24 !important;
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.6), 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  /* ───────────────────────── Page indicator ────────────────────────── */
  .page-bar {
    margin-top: 14px;
    display: flex; align-items: center; gap: 16px;
  }
  .page-bar-fill {
    flex: 1; height: 4px; border-radius: 999px; background: rgba(148, 163, 184, 0.18);
    position: relative; overflow: hidden;
  }
  .page-bar-fill::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, #6366f1, #38bdf8);
    transform-origin: left center;
    animation-name: shrinkBar;
    animation-timing-function: linear;
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
  }
  @keyframes shrinkBar {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }
  .page-dots { display: flex; gap: 6px; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%; background: rgba(148, 163, 184, 0.3);
  }
  .dot.active { background: #6366f1; }

  /* Audio-enable / loading overlay */
  .overlay {
    position: fixed; inset: 0; z-index: 50;
    background: rgba(2, 6, 23, 0.85); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    border: none; color: inherit; font: inherit; cursor: pointer; padding: 24px; text-align: center;
  }
  .overlay-card {
    max-width: 480px;
    background: #1e293b; border-radius: 16px; padding: 28px 32px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  .overlay-card h1 { margin: 0 0 8px; font-size: 1.6rem; color: white; }
  .overlay-card p  { margin: 0; color: #cbd5e1; line-height: 1.4; }
  .enable-pill {
    display: inline-block; margin-top: 18px;
    background: #6366f1; color: white;
    padding: 10px 22px; border-radius: 999px; font-weight: 600;
  }

  @media (max-width: 900px) {
    /* ───── Tablet / phone landscape ───── */
    .board {
      /* Override the TV-tuned scale so text/spacing don't get tiny when an
         admin loads the board on their iPad after running it at 1.0 on a TV. */
      --scale: 1.0;
      --customer-fs: 1.25rem;
      --item-fs: 1.05rem;
      --time-fs: 1.5rem;
      --meta-fs: 0.85rem;
      --badge-fs: 0.75rem;
      --jobno-fs: 0.75rem;
      --stat-fs: 1.6rem;
      --row-h: 88px;
      --thumb-w: 88px;
      padding: 10px 14px 20px;
    }
    .topbar {
      grid-template-columns: auto 1fr auto;
      grid-template-areas: "left mid right";
      gap: 10px;
    }
    .topbar-left   { grid-area: left; }
    .topbar-mid    { grid-area: mid; gap: 18px; }
    .topbar-right  { grid-area: right; gap: 6px; }
    .scale-group   { display: none; }
    .clock         { display: none; }
    .row {
      grid-template-columns: var(--thumb-w) minmax(140px, 1.3fr) minmax(0, 2fr) auto auto;
      gap: 10px;
    }
  }

  @media (max-width: 540px) {
    /* ───── Phone portrait ───── */
    .board {
      --customer-fs: 1.05rem;
      --item-fs: 0.95rem;
      --time-fs: 1.35rem;
      --meta-fs: 0.78rem;
      --badge-fs: 0.7rem;
      --jobno-fs: 0.72rem;
      --stat-fs: 1.35rem;
      --row-h: auto;
      --thumb-w: 56px;
      padding: 8px 10px 16px;
    }
    .topbar {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "left  right"
        "mid   mid";
      gap: 8px 10px;
    }
    .topbar-mid   { justify-content: space-around; gap: 0; }
    .stat-lbl     { font-size: 0.62rem; }
    .topbar-right { gap: 4px; flex-wrap: nowrap; }
    .topbar-right select.ctl { display: none; }   /* event picker collapses; multi-event sites rarely run board from a phone */
    .ctl { height: 34px; min-width: 34px; padding: 0 8px; }
    .brand { font-size: 0.95rem; }
    .sub   { font-size: 0.72rem; }

    .row {
      display: grid;
      grid-template-columns: var(--thumb-w) minmax(0, 1fr) auto;
      grid-template-areas:
        "thumb who   time"
        "thumb what  status";
      align-items: start;
      gap: 6px 10px;
      padding: 10px;
      min-height: 0;
    }
    .thumb       { grid-area: thumb; width: var(--thumb-w); height: var(--thumb-w); align-self: center; }
    .who         { grid-area: who; }
    .what        { grid-area: what; }
    .time        { grid-area: time; flex-direction: row; align-items: baseline; gap: 8px; justify-content: flex-end; line-height: 1; align-self: start; }
    .time-lbl    { margin-top: 0; }
    .status-col  { grid-area: status; justify-content: flex-end; align-self: end; }
    .badge       { padding: 4px 10px; }
    .customer    { line-height: 1.15; }
    .item        { -webkit-line-clamp: 3; }
    .meta-line   { margin-top: 4px; gap: 4px; }

    .page-bar    { margin-top: 10px; }
    .empty       { padding: 40px 16px; }
    .empty-big   { font-size: 1.5rem; }
    .overlay-card { padding: 20px 22px; }
    .overlay-card h1 { font-size: 1.25rem; }
  }
</style>
