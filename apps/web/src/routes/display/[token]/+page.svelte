<script lang="ts">
  // The waiting-room screen. Open /display/<token> on the computer or TV in
  // the waiting area and leave it. Nobody signs in on it: the link itself is
  // the key, and an admin can replace it from the dashboard. It shows nothing
  // personal. See apps/cloudflare/src/routes/display.ts.
  //
  // Leave it alone and it looks after itself: it updates every ten seconds,
  // keeps the screen awake, hides the mouse pointer, and keeps showing the
  // last queue it had if the wifi drops. Move the mouse or tap the screen to
  // see its few controls.
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import LiveBoard from '$lib/components/LiveBoard.svelte';
  import { fromDisplay, type BoardData } from '$lib/staff/board';
  import { TEXT_SCALES, keepAwake, loadNumber, newlyWaiting, saveNumber } from '$lib/staff/screen';
  import { Maximize2, Minimize2, Minus, Plus, WifiOff } from 'lucide-svelte';

  const POLL_MS = 10_000;

  let data: BoardData | null = null;
  let notFound = false;
  let offline = false;
  let fresh = new Set<string>();
  let textScale = 1;
  let controlsVisible = false;
  let fullscreen = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let release: (() => void) | undefined;

  async function load() {
    try {
      const res = await fetch(`/api/display/${encodeURIComponent($page.params.token ?? "")}`, { cache: 'no-store' });
      if (res.status === 404) {
        notFound = true;
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const next = fromDisplay(await res.json());
      const arrived = newlyWaiting(data?.jobs ?? null, next.jobs);
      if (arrived.length) {
        fresh = new Set(arrived);
        setTimeout(() => (fresh = new Set()), 8000);
      }
      data = next;
      notFound = false;
      offline = false;
    } catch {
      offline = true;
    }
  }

  function showControls() {
    controlsVisible = true;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => (controlsVisible = false), 4000);
  }

  function size(step: number) {
    const i = Math.max(0, Math.min(TEXT_SCALES.length - 1, TEXT_SCALES.indexOf(textScale) + step));
    textScale = TEXT_SCALES[i] ?? 1;
    saveNumber('display.textScale', textScale);
    showControls();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* needs a tap first on some browsers */
    }
  }

  const onFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));

  onMount(() => {
    textScale = loadNumber('display.textScale', 1);
    if (!TEXT_SCALES.includes(textScale)) textScale = 1;
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

<svelte:head>
  <title>{data?.cafeName ? `${data.cafeName} · queue` : 'Repair queue'}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="screen" class:idle={!controlsVisible} on:mousemove={showControls} on:touchstart={showControls}>
  {#if notFound}
    <div class="message">
      <p class="big">This screen's link no longer works</p>
      <p>An admin can find the current link on the dashboard, under "Show on a screen".</p>
    </div>
  {:else}
    <LiveBoard {data} mode="display" {fresh} {textScale} />
  {/if}

  {#if offline}
    <p class="offline"><WifiOff size={16} /> Reconnecting… showing the last update</p>
  {/if}

  {#if controlsVisible && !notFound}
    <div class="controls">
      <button on:click={() => size(-1)} aria-label="Smaller text"><Minus size={18} /></button>
      <span>Text size</span>
      <button on:click={() => size(1)} aria-label="Bigger text"><Plus size={18} /></button>
      <button on:click={toggleFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}>
        {#if fullscreen}<Minimize2 size={18} />{:else}<Maximize2 size={18} />{/if}
      </button>
    </div>
  {/if}
</div>

<style>
  .screen { position: fixed; inset: 0; background: #fbf7ef; }
  .screen.idle { cursor: none; }
  .controls {
    position: fixed; right: 1rem; bottom: 4.5rem; z-index: 10;
    display: flex; align-items: center; gap: 0.4rem;
    background: rgba(28, 38, 34, 0.88); color: white; border-radius: 999px; padding: 0.35rem 0.5rem;
    font-size: 0.85rem; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  }
  .controls button {
    width: 2.25rem; height: 2.25rem; border-radius: 999px; border: 0; background: rgba(255, 255, 255, 0.12); color: white;
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .controls button:hover { background: rgba(255, 255, 255, 0.25); }
  .controls span { padding: 0 0.25rem; }
  .offline {
    position: fixed; left: 1rem; bottom: 4.5rem; z-index: 10; margin: 0;
    display: inline-flex; align-items: center; gap: 0.4rem;
    background: #fef3c7; color: #78350f; border-radius: 999px; padding: 0.4rem 0.8rem; font-size: 0.9rem;
  }
  .message { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem; color: #1c2622; }
  .message .big { font-size: clamp(1.6rem, 3vw, 3rem); font-weight: 700; margin: 0 0 0.5rem; }
</style>
