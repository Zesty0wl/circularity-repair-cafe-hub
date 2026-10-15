<script lang="ts">
  // Items visitors told us about before a session, soonest session first.
  // A repairer can take one to look into before the day: find the manual, a
  // diagram, a part. Nothing here is a repair yet. It becomes one when the
  // item is checked in at the session, and that is when the repair time starts.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import PatBadge from '$lib/components/PatBadge.svelte';
  import { firstName, sessionTimes } from '$lib/staff/queue';
  import { CalendarClock, ChevronRight, NotebookPen } from 'lucide-svelte';

  interface Item {
    id: string;
    itemDescription: string;
    itemBrand: string | null;
    faultDescription: string;
    customerFirstName: string | null;
    repairerId: string | null;
    repairerName: string | null;
    isMine: boolean;
    hasNotes: boolean;
    categoryId: string | null;
    category: { name: string; colour: string } | null;
    needsPat: boolean;
    event: { id: string; name: string; date: string; startTime: string; endTime: string; status: string };
  }

  type Filter = 'all' | 'mine' | 'free';

  let items: Item[] = [];
  let loading = true;
  let loadError = '';
  let filter: Filter = 'all';
  let busyId: string | null = null;
  let actionError = '';

  async function load() {
    try {
      items = (await api<{ items: Item[] }>('/api/repairer/pre-registrations')).items;
      loadError = '';
    } catch (err: any) {
      loadError = err?.status === 404 ? 'Pre-registration is switched off for this cafe.' : err?.message ?? 'Could not load the list';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem('preregistered.filter');
      if (saved === 'mine' || saved === 'free' || saved === 'all') filter = saved;
    } catch {
      /* private browsing */
    }
    load();
  });

  function setFilter(value: Filter) {
    filter = value;
    try {
      localStorage.setItem('preregistered.filter', value);
    } catch {
      /* fine */
    }
  }

  async function take(item: Item) {
    busyId = item.id;
    actionError = '';
    try {
      await api(`/api/repairer/pre-registrations/${item.id}/claim`, { method: 'PATCH', json: {} });
      goto(`/repairer/pre-registered/${item.id}`);
    } catch (err: any) {
      actionError = err?.message ?? 'Could not take that item';
      await load();
    } finally {
      busyId = null;
    }
  }

  $: shown = items.filter((i) => (filter === 'mine' ? i.isMine : filter === 'free' ? !i.repairerId : true));
  // Grouped by session, keeping the soonest first as the server sent them.
  $: groups = shown.reduce<Array<{ event: Item['event']; items: Item[] }>>((list, item) => {
    const last = list[list.length - 1];
    if (last && last.event.id === item.event.id) last.items.push(item);
    else list.push({ event: item.event, items: [item] });
    return list;
  }, []);
  $: mineCount = items.filter((i) => i.isMine).length;
  $: freeCount = items.filter((i) => !i.repairerId).length;

  function longDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
</script>

<svelte:head><title>Pre-registered items</title></svelte:head>

<header>
  <p class="kicker flex items-center gap-2"><CalendarClock size={14} /> Before the session</p>
  <h1 class="text-2xl md:text-3xl font-bold mt-1">Pre-registered items</h1>
  <p class="mt-1 text-slate-600 max-w-2xl">
    Visitors have told us about these items before they come. Take one to look into it before the day. The repair starts
    when the item is checked in at the session.
  </p>
</header>

{#if loading}
  <p class="mt-6 text-slate-500">Loading…</p>
{:else if loadError}
  <div class="card p-6 mt-6 max-w-lg">
    <p class="text-slate-700">{loadError}</p>
    <a href="/repairer" class="btn-secondary mt-4">Back to the queue</a>
  </div>
{:else}
  <div class="mt-5 flex gap-1 rounded-xl bg-slate-200/70 p-1 w-fit max-w-full overflow-x-auto" role="tablist">
    {#each [['all', 'All', items.length], ['free', 'Not taken', freeCount], ['mine', 'Taken by me', mineCount]] as [key, label, n]}
      <button
        role="tab"
        aria-selected={filter === key}
        class="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap {filter === key ? 'bg-white shadow-sm font-semibold text-slate-900' : 'text-slate-600 hover:text-slate-900'}"
        on:click={() => setFilter(String(key) as Filter)}
      >
        {label} <span class="ml-1 text-xs rounded-full px-1.5 py-0.5 {filter === key ? 'bg-slate-100' : 'bg-white/60'}">{n}</span>
      </button>
    {/each}
  </div>

  {#if actionError}<p class="mt-3 text-sm text-rose-700">{actionError}</p>{/if}

  {#if groups.length === 0}
    <div class="card mt-4 p-6 text-center text-slate-500">
      {#if items.length === 0}
        Nobody has pre-registered an item for an upcoming session yet.
      {:else if filter === 'mine'}
        You have not taken any items yet.
      {:else}
        Every item has been taken.
      {/if}
    </div>
  {:else}
    {#each groups as group (group.event.id)}
      <section class="mt-6">
        <h2 class="text-lg font-semibold flex flex-wrap items-baseline gap-x-2">
          {longDate(group.event.date)}
          <span class="text-sm font-normal text-slate-500">{sessionTimes(group.event.startTime, group.event.endTime)} · {group.event.name}</span>
          {#if group.event.status === 'active'}<span class="badge badge-active">Running now</span>{/if}
        </h2>
        <ul class="mt-3 grid lg:grid-cols-2 gap-3">
          {#each group.items as item (item.id)}
            <li class="card p-4">
              <div class="flex items-start justify-between gap-2">
                <a href={`/repairer/pre-registered/${item.id}`} class="font-semibold text-slate-900 hover:underline leading-snug">{item.itemDescription}</a>
                <PatBadge needed={item.needsPat} />
              </div>
              <p class="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                {#if item.category}<span class="rounded px-1.5 py-0.5 font-medium" style="background-color: {item.category.colour}22; color: {item.category.colour}">{item.category.name}</span>{/if}
                {#if item.itemBrand}<span>{item.itemBrand}</span>{/if}
                {#if item.customerFirstName}<span>· {item.customerFirstName}</span>{/if}
              </p>
              <p class="mt-2 text-sm text-slate-700 line-clamp-2">{item.faultDescription}</p>
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm text-slate-500 flex items-center gap-1.5">
                  {#if item.isMine}Taken by you{:else if item.repairerName}Taken by {firstName(item.repairerName)}{:else}Not taken yet{/if}
                  {#if item.hasNotes}<span class="inline-flex items-center gap-1 text-slate-600"><NotebookPen size={14} /> Notes</span>{/if}
                </p>
                <div class="flex gap-2">
                  {#if item.isMine}
                    <a href={`/repairer/pre-registered/${item.id}`} class="btn-primary btn-sm">Open <ChevronRight size={16} /></a>
                  {:else if !item.repairerId}
                    <a href={`/repairer/pre-registered/${item.id}`} class="btn-secondary btn-sm">View</a>
                    <button class="btn-primary btn-sm" disabled={busyId === item.id} on:click={() => take(item)}>{busyId === item.id ? 'Taking…' : 'Take this item'}</button>
                  {:else}
                    <a href={`/repairer/pre-registered/${item.id}`} class="btn-secondary btn-sm">View</a>
                  {/if}
                </div>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
{/if}
