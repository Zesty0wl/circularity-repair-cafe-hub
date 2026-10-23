<script lang="ts">
  // One pre-registered item. Take it, write down what you find out, and on
  // the day check it in. Whoever repairs it then sees your notes on the repair.
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { isAdminRole } from '$lib/staff/nav';
  import PatBadge from '$lib/components/PatBadge.svelte';
  import { firstName, sessionTimes } from '$lib/staff/queue';
  import { ArrowLeft, CalendarClock, CheckCircle2, User } from 'lucide-svelte';

  interface Detail {
    preRegistration: {
      id: string;
      itemDescription: string;
      itemBrand: string | null;
      faultDescription: string;
      customerName: string | null;
      customerContact: string | null;
      status: 'open' | 'checked_in' | 'cancelled';
      repairerId: string | null;
      researchNotes: string | null;
      repairJobId: string | null;
      createdAt: string;
    };
    event: { id: string; name: string; date: string; startTime: string; endTime: string; status: string; venueName: string };
    category: { name: string; colour: string } | null;
    repairer: { id: string; displayName: string } | null;
    needsPat: boolean;
    /** Null while the cafe does not do PAT tests. */
    pat: { needed: boolean; itemIsElectrical: boolean | null; categoryIsElectrical: boolean } | null;
  }

  $: id = $page.params.id;
  $: myId = $auth?.user.id ?? null;
  $: isAdmin = isAdminRole($auth?.user);

  let detail: Detail | null = null;
  let loadError = '';
  let notes = '';
  let savedNotes = '';
  let busy = false;
  let error = '';
  let saved = false;
  let confirmTakeOver = false;
  let confirmCancel = false;
  let checkedIn: { id: string; jobNumber: string } | null = null;

  $: pre = detail?.preRegistration;
  $: isMine = !!pre && pre.repairerId === myId;
  $: canWrite = isMine || isAdmin;
  $: isOpen = pre?.status === 'open';
  $: running = detail?.event.status === 'active';
  $: notesChanged = notes.trim() !== savedNotes.trim();

  async function load() {
    try {
      detail = await api<Detail>(`/api/repairer/pre-registrations/${id}`);
      notes = savedNotes = detail.preRegistration.researchNotes ?? '';
      loadError = '';
    } catch (err: any) {
      loadError = err?.status === 404 ? 'We could not find this item. It may have been removed, or pre-registration is switched off.' : err?.message ?? 'Could not load this item';
    }
  }
  onMount(load);

  async function run(action: () => Promise<unknown>, fallback: string) {
    busy = true;
    error = '';
    try {
      await action();
      await load();
    } catch (err: any) {
      error = err?.message ?? fallback;
    } finally {
      busy = false;
      confirmTakeOver = false;
    }
  }

  const take = () => run(() => api(`/api/repairer/pre-registrations/${id}/claim`, { method: 'PATCH', json: {} }), 'Could not take this item');
  const giveBack = () => run(() => api(`/api/repairer/pre-registrations/${id}/release`, { method: 'PATCH', json: {} }), 'Could not give this item back');

  async function saveNotes() {
    saved = false;
    await run(() => api(`/api/repairer/pre-registrations/${id}/notes`, { method: 'PATCH', json: { researchNotes: notes } }), 'Could not save your notes');
    if (!error) saved = true;
  }

  // Say whether this one item is electrical, whatever its category says.
  const setElectrical = (value: boolean) =>
    run(() => api(`/api/repairer/pre-registrations/${id}/electrical`, { method: 'PATCH', json: { isElectrical: value } }), 'Could not save that change');

  async function checkIn() {
    busy = true;
    error = '';
    try {
      checkedIn = await api<{ id: string; jobNumber: string }>(`/api/repairer/pre-registrations/${id}/check-in`, { method: 'POST', json: {} });
    } catch (err: any) {
      error = err?.message ?? 'Could not check this item in';
    } finally {
      busy = false;
    }
  }

  async function cancel() {
    busy = true;
    error = '';
    try {
      await api(`/api/repairer/pre-registrations/${id}/cancel`, { method: 'PATCH', json: {} });
      goto('/repairer/pre-registered');
    } catch (err: any) {
      error = err?.message ?? 'Could not cancel this item';
    } finally {
      busy = false;
    }
  }

  function longDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
</script>

<svelte:head><title>{pre?.itemDescription ?? 'Pre-registered item'}</title></svelte:head>

<a href="/repairer/pre-registered" class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-3"><ArrowLeft size={16} /> Pre-registered items</a>

{#if loadError}
  <div class="card p-6 max-w-lg">
    <h1 class="text-xl font-semibold">Something went wrong</h1>
    <p class="mt-2 text-slate-600">{loadError}</p>
    <a href="/repairer/pre-registered" class="btn-primary mt-4">Back to the list</a>
  </div>
{:else if !detail || !pre}
  <p class="text-slate-500">Loading…</p>
{:else if checkedIn}
  <div class="card p-8 text-center max-w-lg">
    <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
    <h1 class="text-2xl font-bold mt-5">Checked in</h1>
    <p class="mt-2 text-slate-700">The repair has started.</p>
    <p class="mt-5 text-sm uppercase tracking-wide text-slate-500">Job number</p>
    <p class="text-4xl font-extrabold text-brand-700 mt-1 tracking-wide">{checkedIn.jobNumber}</p>
    <p class="mt-4 text-slate-600">Write this number on the item's tag.</p>
    <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
      <a href={`/repairer/job/${checkedIn.id}`} class="btn-primary">Open the repair</a>
      <a href="/repairer" class="btn-secondary">Back to the queue</a>
    </div>
  </div>
{:else}
  <div class="grid lg:grid-cols-5 gap-4 items-start">
    <div class="lg:col-span-3 space-y-4">
      <header class="card p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="kicker flex items-center gap-1.5"><CalendarClock size={14} /> Pre-registered</p>
            <h1 class="text-2xl font-bold leading-tight mt-0.5">{pre.itemDescription}</h1>
            <p class="text-slate-600 text-sm mt-1">
              {#if detail.category}<span class="font-medium" style="color: {detail.category.colour}">{detail.category.name}</span>{/if}
              {#if pre.itemBrand}{detail.category ? ' · ' : ''}{pre.itemBrand}{/if}
            </p>
          </div>
          <PatBadge needed={detail.needsPat} />
        </div>
        <dl class="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
          <div class="flex gap-2 items-start">
            <User size={16} class="text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt class="text-slate-500">Visitor</dt>
              <dd class="text-slate-900">{pre.customerName ?? 'Not given'}{#if pre.customerContact}<span class="block text-slate-600">{pre.customerContact}</span>{/if}</dd>
            </div>
          </div>
          <div>
            <dt class="text-slate-500">Session</dt>
            <dd class="text-slate-900">{longDate(detail.event.date)}, {sessionTimes(detail.event.startTime, detail.event.endTime)}<span class="block text-slate-600">{detail.event.name} · {detail.event.venueName}</span></dd>
          </div>
        </dl>
      </header>

      <section class="card p-5">
        <h2 class="font-semibold">What is wrong</h2>
        <p class="mt-2 text-slate-700 whitespace-pre-line">{pre.faultDescription}</p>
      </section>

      <section class="card p-5">
        <h2 class="font-semibold">Your notes</h2>
        <p class="mt-1 text-sm text-slate-600">
          Write down what you find out: the model, a link to the manual or a diagram, parts to bring. Whoever repairs the
          item on the day will see these notes. The visitor does not.
        </p>
        {#if canWrite && isOpen}
          <textarea class="input mt-3" rows="8" maxlength="4000" bind:value={notes} on:input={() => (saved = false)}></textarea>
          <div class="mt-3 flex items-center justify-end gap-3">
            {#if saved && !notesChanged}<span class="text-sm text-emerald-700">Saved</span>{/if}
            <button class="btn-primary btn-sm" disabled={busy || !notesChanged} on:click={saveNotes}>Save notes</button>
          </div>
        {:else if pre.researchNotes}
          <p class="mt-3 text-slate-700 whitespace-pre-line">{pre.researchNotes}</p>
        {:else}
          <p class="mt-3 text-sm text-slate-500">{isOpen ? 'Take this item to add notes.' : 'No notes.'}</p>
        {/if}
      </section>
    </div>

    <div class="lg:col-span-2 space-y-4 lg:sticky lg:top-6">
      {#if pre.status === 'checked_in'}
        <section class="card p-5">
          <h2 class="font-semibold">Checked in</h2>
          <p class="mt-1 text-sm text-slate-600">This item has arrived and is now a repair.</p>
          {#if pre.repairJobId}<a href={`/repairer/job/${pre.repairJobId}`} class="btn-primary w-full mt-4">Open the repair</a>{/if}
        </section>
      {:else if pre.status === 'cancelled'}
        <section class="card p-5">
          <h2 class="font-semibold">Cancelled</h2>
          <p class="mt-1 text-sm text-slate-600">The visitor or an admin called this item off.</p>
        </section>
      {:else}
        <section class="card p-5">
          {#if isMine}
            <h2 class="font-semibold">You have taken this item</h2>
            <p class="mt-1 text-sm text-slate-600">When the visitor arrives and the item is checked in, it comes straight to you and the repair time starts.</p>
            <button class="mt-4 text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2" disabled={busy} on:click={giveBack}>Give it back for someone else to take</button>
          {:else if detail.repairer}
            <h2 class="font-semibold">{firstName(detail.repairer.displayName)} has taken this item</h2>
            <p class="mt-1 text-sm text-slate-600">Take it over if they have handed it to you.</p>
            {#if confirmTakeOver}
              <div class="mt-4 grid grid-cols-2 gap-2">
                <button class="btn-ghost" on:click={() => (confirmTakeOver = false)}>Cancel</button>
                <button class="btn-primary" disabled={busy} on:click={take}>Yes, take it over</button>
              </div>
            {:else}
              <button class="btn-secondary w-full mt-4" on:click={() => (confirmTakeOver = true)}>Take over this item</button>
            {/if}
            {#if isAdmin}
              <button class="mt-3 block text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2" disabled={busy} on:click={giveBack}>Give it back for anyone to take</button>
            {/if}
          {:else}
            <h2 class="font-semibold">Nobody has taken this item</h2>
            <p class="mt-1 text-sm text-slate-600">Take it to look into it before the day. When it is checked in, it comes straight to you.</p>
            <button class="btn-primary w-full mt-4" disabled={busy} on:click={take}>{busy ? 'Taking…' : 'Take this item'}</button>
          {/if}
        </section>

        {#if detail.pat}
          <section class="card p-5 {detail.pat.needed ? 'bg-amber-50/60' : ''}">
            <label class="flex items-start gap-3 text-sm {canWrite ? 'cursor-pointer' : ''}">
              <input
                type="checkbox"
                class="h-5 w-5 rounded border-slate-300 text-brand-600 mt-0.5"
                checked={detail.pat.needed}
                disabled={busy || !canWrite}
                on:change={(e) => setElectrical(e.currentTarget.checked)}
              />
              <span>
                <span class="font-medium text-slate-900">This is an electrical item</span>
                <span class="block text-xs text-slate-500">
                  {#if detail.pat.itemIsElectrical === null}Set from its category.{:else}Changed for this item.{/if}
                  Electrical items need a PAT test.
                  {#if !canWrite}Take this item to change this.{/if}
                </span>
              </span>
            </label>
          </section>
        {/if}

        {#if running}
          <section class="card p-5">
            <h2 class="font-semibold">Has the visitor arrived?</h2>
            <p class="mt-1 text-sm text-slate-600">Check the item in to start the repair.</p>
            <button class="btn-primary w-full mt-4" disabled={busy} on:click={checkIn}>Check in this item</button>
          </section>
        {/if}

        {#if isAdmin}
          <section class="card p-5">
            {#if confirmCancel}
              <p class="text-sm text-slate-700">Cancel this item? The visitor will see it is cancelled on their tracking page.</p>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button class="btn-ghost btn-sm" on:click={() => (confirmCancel = false)}>Keep it</button>
                <button class="btn-secondary btn-sm" disabled={busy} on:click={cancel}>Cancel the item</button>
              </div>
            {:else}
              <button class="text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2" on:click={() => (confirmCancel = true)}>Cancel this item (for example, a duplicate)</button>
            {/if}
          </section>
        {/if}
      {/if}
      {#if error}<p class="text-sm text-rose-700">{error}</p>{/if}
    </div>
  </div>
{/if}
