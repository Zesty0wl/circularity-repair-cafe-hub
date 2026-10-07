<script lang="ts">
  // The live board, drawn for one of two audiences:
  //
  //   display  a screen in the waiting area. Big, calm, readable from across
  //            the room. It answers what a visitor wants to know: where am I
  //            in the queue, how long will it be, is mine ready? No names and
  //            no photos, because everyone in the room can see it.
  //   control  an admin at a laptop. The same picture with the detail behind
  //            it: who brought what, a photo, and a link to each repair.
  //
  // Everything is sized from the width of the screen, so it fills a phone, a
  // laptop or a big TV without anyone setting a zoom level.
  import { onDestroy, onMount } from 'svelte';
  import type { BoardData, BoardJob } from '$lib/staff/board';
  import { qrSession } from '$lib/staff/board';
  import {
    estimatedWaitMinutes,
    formatMinutes,
    minutesBetween,
    sessionTimes,
    waitTone,
  } from '$lib/staff/queue';
  import { CheckCircle2, Clock, Hand, Image as ImageIcon, Wrench } from 'lucide-svelte';

  export let data: BoardData | null;
  export let mode: 'display' | 'control' = 'display';
  /** Job numbers that have just arrived, to make them stand out for a moment. */
  export let fresh: Set<string> = new Set();
  /** Text size, from the screen's own controls. 1 is normal. */
  export let textScale = 1;

  const PAGE_MS = 12_000;

  let now = Date.now();
  let root: HTMLElement;
  let waitingBoxHeight = 0;
  let workingBoxHeight = 0;
  let fontPx = 16;
  /** A phone: one scrolling column, so no pages. */
  let narrow = false;
  let waitingPage = 0;
  let workingPage = 0;

  $: control = mode === 'control';
  $: jobs = data?.jobs ?? [];
  $: oldestFirst = [...jobs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  $: waiting = oldestFirst.filter((j) => j.status === 'waiting');
  $: working = oldestFirst.filter((j) => j.status === 'in_progress');
  $: finished = [...jobs]
    .filter((j) => j.status === 'completed' || j.status === 'cannot_repair')
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
  $: busyRepairers = new Set(working.map((j) => j.repairerName).filter(Boolean)).size;
  $: estimate = estimatedWaitMinutes({
    waiting: waiting.length,
    repairersBusy: busyRepairers,
    averageRepairMinutes: data?.today.averageRepairMinutes ?? null,
  });
  $: qr = qrSession(data);
  $: running = data?.sessions.find((s) => s.status === 'active') ?? data?.sessions[0] ?? null;

  // How many rows fit, so a long queue turns pages instead of being cut off.
  $: rowPx = fontPx * (control ? 3.6 : 3.9);
  $: waitingPerPage = narrow ? 1000 : Math.max(1, Math.floor(waitingBoxHeight / rowPx));
  $: workingPerPage = narrow ? 1000 : Math.max(1, Math.floor(workingBoxHeight / (fontPx * (control ? 4.4 : 4.6))));
  $: waitingPages = Math.max(1, Math.ceil(waiting.length / waitingPerPage));
  $: workingPages = Math.max(1, Math.ceil(working.length / workingPerPage));
  $: if (waitingPage >= waitingPages) waitingPage = 0;
  $: if (workingPage >= workingPages) workingPage = 0;
  $: waitingShown = waiting.slice(waitingPage * waitingPerPage, (waitingPage + 1) * waitingPerPage);
  $: workingShown = working.slice(workingPage * workingPerPage, (workingPage + 1) * workingPerPage);
  $: waitingOffset = waitingPage * waitingPerPage;

  // A new arrival always shows on the first page.
  $: if ([...fresh].some((n) => waiting.slice(0, waitingPerPage).every((j) => j.jobNumber !== n))) waitingPage = 0;

  function measure() {
    if (root) fontPx = parseFloat(getComputedStyle(root).fontSize) || 16;
    narrow = window.innerWidth <= 760;
  }

  let tick: ReturnType<typeof setInterval>;
  let pager: ReturnType<typeof setInterval>;
  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    tick = setInterval(() => (now = Date.now()), 15_000);
    pager = setInterval(() => {
      if (waitingPages > 1) waitingPage = (waitingPage + 1) % waitingPages;
      if (workingPages > 1) workingPage = (workingPage + 1) % workingPages;
    }, PAGE_MS);
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
    clearInterval(tick);
    clearInterval(pager);
  });
  $: textScale, setTimeout(measure, 0);

  function minutesText(m: number): string {
    return formatMinutes(m).replace('Just now', 'just now');
  }
  function linkFor(j: BoardJob): string | null {
    return control && j.id ? `/admin/repairs/${j.id}` : null;
  }
</script>

<div bind:this={root} class="board" class:control style="--text-scale: {textScale}">
  <header class="top">
    <div class="brand">
      {#if data?.logoUrl}<img src={data.logoUrl} alt="" class="logo" />{/if}
      <div class="brand-text">
        <p class="cafe">{data?.cafeName ?? ''}</p>
        {#if running}
          <p class="session">{running.name}{#if running.startTime && running.endTime} · {sessionTimes(running.startTime, running.endTime)}{/if}</p>
        {/if}
      </div>
    </div>
    <p class="clock" aria-label="Time now">{new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
  </header>

  {#if !data}
    <div class="empty"><p class="empty-big">Loading…</p></div>
  {:else if !data.sessions.length}
    <div class="empty">
      <p class="empty-big">No repair session running right now</p>
      <p class="empty-sub">The queue appears here as soon as today's session starts.</p>
    </div>
  {:else}
    <main class="columns">
      <!-- ── Being repaired ────────────────────────────────────────── -->
      <section class="col col-working" aria-labelledby="col-working">
        <h2 id="col-working" class="col-title"><Wrench class="col-icon" /> Being repaired <span class="col-count">{working.length}</span></h2>
        <div class="col-body" bind:clientHeight={workingBoxHeight}>
          {#if working.length === 0}
            <p class="col-empty">{waiting.length ? 'Our repairers will start on the next item soon.' : 'Nothing on the bench right now.'}</p>
          {:else}
            <ul class="cards">
              {#each workingShown as j (j.jobNumber)}
                <li class="card-row">
                  <svelte:element this={linkFor(j) ? 'a' : 'div'} href={linkFor(j)} class="card-inner">
                    {#if control}
                      <span class="thumb">{#if j.thumbnailUrl}<img src={j.thumbnailUrl} alt="" />{:else}<ImageIcon />{/if}</span>
                    {/if}
                    <span class="card-text">
                      <span class="item">{j.item}</span>
                      <span class="meta">
                        <span class="num">{j.jobNumber}</span>
                        {#if control && j.customerName}<span>· {j.customerName}</span>{/if}
                        {#if j.repairerName}<span>· with {control ? j.repairerName : j.repairerName.split(' ')[0]}</span>{/if}
                      </span>
                    </span>
                    <span class="elapsed">{minutesText(minutesBetween(j.acceptedAt ?? j.createdAt, now))}</span>
                  </svelte:element>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if workingPages > 1}<p class="pager">Page {workingPage + 1} of {workingPages}</p>{/if}
      </section>

      <!-- ── Waiting ───────────────────────────────────────────────── -->
      <section class="col col-waiting" aria-labelledby="col-waiting">
        <h2 id="col-waiting" class="col-title"><Clock class="col-icon" /> Waiting <span class="col-count">{waiting.length}</span></h2>
        {#if waiting.length && estimate !== null}
          <p class="estimate">About <strong>{estimate} minutes</strong> for anyone checking in now</p>
        {/if}
        <div class="col-body" bind:clientHeight={waitingBoxHeight}>
          {#if waiting.length === 0}
            <p class="col-empty">No queue. Bring your item straight to a table.</p>
          {:else}
            <ol class="rows">
              {#each waitingShown as j, i (j.jobNumber)}
                {@const m = minutesBetween(j.createdAt, now)}
                <li class="row" class:fresh={fresh.has(j.jobNumber)} class:next={waitingOffset + i === 0}>
                  <svelte:element this={linkFor(j) ? 'a' : 'div'} href={linkFor(j)} class="row-inner">
                    <span class="pos">{waitingOffset + i + 1}</span>
                    <span class="row-text">
                      <span class="item">{j.item}</span>
                      <span class="meta">
                        <span class="num">{j.jobNumber}</span>
                        {#if j.category}<span class="cat" style="--c: {j.categoryColour ?? '#64748b'}">{j.category}</span>{/if}
                        {#if control && j.customerName}<span>· {j.customerName}</span>{/if}
                      </span>
                    </span>
                    <span class="waited wait-{waitTone(m)}">{minutesText(m)}</span>
                  </svelte:element>
                </li>
              {/each}
            </ol>
          {/if}
          {#if !control && !narrow && waiting.length <= waitingPerPage - 5}
            <!-- Room to spare: say what happens next, for anyone just arrived. -->
            <div class="howto">
              <p class="howto-title">What happens next</p>
              <ol>
                <li><strong>Check in</strong> with the QR code, or at the desk.</li>
                <li><strong>Watch for your number.</strong> Items are seen in the order they arrive.</li>
                <li><strong>Repair it together.</strong> A volunteer will call you over.</li>
              </ol>
            </div>
          {/if}
        </div>
        {#if waitingPages > 1}<p class="pager">Page {waitingPage + 1} of {waitingPages} · the list turns by itself</p>{/if}
      </section>

      <!-- ── Ready, and how to join ───────────────────────────────── -->
      <section class="col col-side">
        <div class="ready">
          <h2 class="col-title"><CheckCircle2 class="col-icon" /> Ready to collect</h2>
          {#if finished.length === 0}
            <p class="col-empty">Finished repairs appear here.</p>
          {:else}
            <ul class="ready-list">
              {#each finished.slice(0, control ? 8 : 5) as j (j.jobNumber)}
                <li class="ready-row" class:is-fixed={j.status === 'completed'}>
                  <svelte:element this={linkFor(j) ? 'a' : 'div'} href={linkFor(j)} class="ready-inner">
                    <span class="num">{j.jobNumber}</span>
                    <span class="ready-item">{j.item}</span>
                    <span class="ready-status">{#if j.status === 'completed'}<CheckCircle2 /> Fixed{:else}<Hand /> See the desk{/if}</span>
                  </svelte:element>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if qr?.qrCodeUrl}
          <div class="qr">
            <img src={qr.qrCodeUrl} alt="QR code to check in" />
            <div>
              <p class="qr-title">Not checked in yet?</p>
              <p class="qr-sub">Point your phone's camera at the code. It takes a minute, and you keep your place.</p>
            </div>
          </div>
        {/if}
      </section>
    </main>

    <footer class="bottom">
      <p>
        Today: <strong>{data.today.checkedIn}</strong> brought in · <strong>{data.today.fixed}</strong> fixed
        {#if data.today.co2SavedKg}· <strong>{data.today.co2SavedKg} kg</strong> of CO₂ saved{/if}
      </p>
      <p class="tagline">Every repair keeps something out of the bin</p>
    </footer>
  {/if}
</div>

<style>
  /* Every size is in em, from one font size set by the width of the screen.
     A big TV and a laptop show the same layout, just larger. */
  .board {
    --paper: #fbf7ef;
    --ink: #1c2622;
    --muted: #5b6662;
    --line: #e7e1d4;
    --amber: #b45309;
    --amber-soft: #fef3c7;
    --blue: #1d4ed8;
    --blue-soft: #dbeafe;
    --green: #047857;
    --green-soft: #d1fae5;
    --rose: #be123c;
    font-size: calc(clamp(13px, 1.12vw, 46px) * var(--text-scale, 1));
    height: 100vh;
    height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: var(--paper);
    color: var(--ink);
    overflow: hidden;
    font-family: var(--font-sans);
  }
  .board.control {
    font-size: calc(clamp(12px, 0.92vw, 30px) * var(--text-scale, 1));
    height: calc(100dvh - 3.25rem);
  }

  .top {
    display: flex; align-items: center; justify-content: space-between; gap: 1em;
    padding: 0.8em 1.4em;
    background: rgb(var(--brand-800));
    color: white;
  }
  .brand { display: flex; align-items: center; gap: 0.9em; min-width: 0; }
  .logo { height: 2.6em; width: auto; max-width: 9em; object-fit: contain; background: white; border-radius: 0.4em; padding: 0.2em; }
  .brand-text { min-width: 0; }
  .cafe { font-family: var(--font-display); font-weight: 700; font-size: 1.7em; line-height: 1.1; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session { margin: 0.1em 0 0; opacity: 0.8; font-size: 1em; }
  .clock { font-size: 2.2em; font-weight: 700; font-variant-numeric: tabular-nums; margin: 0; }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1.25fr 0.95fr;
    gap: 1.1em;
    padding: 1.1em 1.4em;
    min-height: 0;
  }
  .col { display: flex; flex-direction: column; min-height: 0; background: white; border-radius: 1em; padding: 1em 1.1em; box-shadow: 0 1px 0 var(--line), 0 0 0 1px var(--line); }
  .col-title { display: flex; align-items: center; gap: 0.45em; font-size: 1.25em; font-weight: 700; margin: 0 0 0.6em; }
  .col-title :global(.col-icon) { width: 1.1em; height: 1.1em; }
  .col-working .col-title { color: var(--blue); }
  .col-waiting .col-title { color: var(--amber); }
  .ready .col-title { color: var(--green); }
  .col-count { margin-left: auto; font-size: 1.4em; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
  .col-body { flex: 1; min-height: 0; overflow: hidden; }
  .col-empty { color: var(--muted); font-size: 1.1em; margin: 0.5em 0; }
  .pager { margin: 0.4em 0 0; color: var(--muted); font-size: 0.8em; }
  .estimate { margin: -0.2em 0 0.7em; padding: 0.45em 0.7em; border-radius: 0.6em; background: var(--amber-soft); color: #78350f; font-size: 1em; }

  a.card-inner, a.row-inner, a.ready-inner { color: inherit; text-decoration: none; }
  a.card-inner:hover, a.row-inner:hover, a.ready-inner:hover { background: #f8fafc; }

  .num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; letter-spacing: 0.02em; }
  .item { display: block; font-weight: 700; font-size: 1.2em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35em; color: var(--muted); font-size: 0.9em; margin-top: 0.15em; white-space: nowrap; overflow: hidden; }
  .cat { color: var(--c); background: color-mix(in srgb, var(--c) 13%, white); padding: 0 0.4em; border-radius: 0.3em; font-weight: 600; }

  /* Being repaired */
  .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6em; }
  .card-row { height: 4em; }
  .card-inner { display: flex; align-items: center; gap: 0.8em; height: 100%; padding: 0 0.8em; border-radius: 0.7em; background: var(--blue-soft); }
  .control .card-row { height: 3.8em; }
  .thumb { width: 3em; height: 3em; border-radius: 0.5em; overflow: hidden; background: white; display: flex; align-items: center; justify-content: center; color: #94a3b8; flex-shrink: 0; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .card-text { min-width: 0; flex: 1; }
  .elapsed { font-weight: 700; font-size: 1.1em; font-variant-numeric: tabular-nums; color: var(--blue); white-space: nowrap; }

  /* Waiting */
  .rows { list-style: none; margin: 0; padding: 0; }
  .row { height: 3.9em; border-bottom: 1px solid var(--line); }
  .control .row { height: 3.6em; }
  .row-inner { display: flex; align-items: center; gap: 0.8em; height: 100%; padding: 0 0.3em; }
  .pos { width: 1.9em; height: 1.9em; flex-shrink: 0; border-radius: 999px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.05em; }
  .row.next .pos { background: var(--amber); color: white; }
  .row-text { min-width: 0; flex: 1; }
  .waited { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--muted); }
  .wait-long { color: var(--amber); }
  .wait-very-long { color: var(--rose); }
  .row.fresh { animation: arrive 2.4s ease-out 3; }
  @keyframes arrive { 0% { background: #fde68a; } 100% { background: transparent; } }

  .col-waiting .col-body { display: flex; flex-direction: column; }
  .howto { margin-top: auto; padding: 0.9em 1em; border-radius: 0.8em; background: #f8f5ee; color: var(--muted); }
  .howto-title { margin: 0 0 0.4em; font-weight: 700; color: var(--ink); }
  .howto ol { margin: 0; padding-left: 1.3em; display: grid; gap: 0.3em; list-style: decimal; }
  .howto strong { color: var(--ink); }

  /* Ready, and the QR code */
  .col-side { gap: 1em; background: transparent; box-shadow: none; padding: 0; }
  .ready { flex: 1; min-height: 0; overflow: hidden; background: white; border-radius: 1em; padding: 1em 1.1em; box-shadow: 0 0 0 1px var(--line); }
  .ready-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45em; }
  .ready-inner { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 0.6em; padding: 0.45em 0.6em; border-radius: 0.6em; background: #f8fafc; }
  .ready-row.is-fixed .ready-inner { background: var(--green-soft); }
  .ready-item { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ready-status { grid-column: 1 / -1; display: flex; align-items: center; gap: 0.3em; font-size: 0.85em; color: var(--muted); }
  .ready-row.is-fixed .ready-status { color: var(--green); font-weight: 600; }
  .ready-status :global(svg) { width: 1em; height: 1em; }
  .qr { display: flex; align-items: center; gap: 0.9em; background: white; border-radius: 1em; padding: 0.9em; box-shadow: 0 0 0 1px var(--line); }
  .qr img { width: 8.5em; height: 8.5em; flex-shrink: 0; image-rendering: pixelated; }
  .control .qr img { width: 6.5em; height: 6.5em; }
  .qr-title { margin: 0; font-weight: 800; font-size: 1.2em; }
  .qr-sub { margin: 0.3em 0 0; color: var(--muted); font-size: 0.95em; line-height: 1.35; }

  .bottom { display: flex; justify-content: space-between; align-items: center; gap: 1em; padding: 0.7em 1.4em; border-top: 1px solid var(--line); background: white; font-size: 1em; }
  .bottom p { margin: 0; }
  .tagline { color: var(--muted); }

  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2em; }
  .empty-big { font-family: var(--font-display); font-size: 2.6em; font-weight: 700; margin: 0; }
  .empty-sub { margin-top: 0.6em; color: var(--muted); font-size: 1.3em; }

  /* A phone or a narrow window: one column, scrolling. */
  @media (max-width: 760px) {
    .board, .board.control { height: auto; min-height: 100dvh; overflow: visible; font-size: 15px; }
    .columns { grid-template-columns: 1fr; }
    .col-body { overflow: visible; }
    .tagline { display: none; }
  }
</style>
