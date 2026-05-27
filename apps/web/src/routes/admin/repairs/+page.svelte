<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let categories: any[] = [];
  let users: any[] = [];
  let events: any[] = [];

  let filters = {
    eventId: '',
    repairerId: '',
    categoryId: '',
    status: '',
    from: '',
    to: '',
    search: '',
  };
  let data: { data: any[]; meta: any } | null = null;
  let pageNum = 1;

  async function load() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    params.set('page', String(pageNum));
    params.set('perPage', '25');
    data = await api(`/api/admin/repairs?${params}`);
  }

  onMount(async () => {
    [categories, users, events] = await Promise.all([
      api('/api/admin/skill-categories'),
      api('/api/admin/users'),
      api('/api/admin/events'),
    ]);
    // Default the event filter to the currently-active event (if any) so
    // staff don't have to hunt for it during an event night.
    const active = events.find((e: any) => e.status === 'active');
    if (active) filters.eventId = active.id;
    load();
  });

  function reset() {
    filters = { eventId: '', repairerId: '', categoryId: '', status: '', from: '', to: '', search: '' };
    pageNum = 1;
    load();
  }

  function exportCsv() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    window.location.href = `/api/admin/repairs/export.csv?${params}`;
  }

  // Repairers + admins (active only) can be assigned a job.
  $: assignable = users
    .filter((u) => u.isActive && (u.role === 'repairer' || u.role === 'admin' || u.role === 'super_admin'))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Per-row inline reassignment. We don't reload the whole table — just patch
  // the local row so the dropdown stays responsive on a busy event night.
  let savingRowId: string | null = null;
  async function assignRow(row: any, userId: string) {
    savingRowId = row.id;
    try {
      await api(`/api/admin/repairs/${row.id}`, {
        method: 'PATCH',
        json: { repairerId: userId || null },
      });
      row.repairerId = userId || null;
      row.repairerName = userId ? (assignable.find((u) => u.id === userId)?.displayName ?? null) : null;
      data = data; // trigger reactivity
    } catch (e: any) {
      alert(e?.message ?? 'Could not reassign repair');
    } finally {
      savingRowId = null;
    }
  }
</script>

<div class="flex justify-between items-center">
  <h1 class="text-2xl font-bold">Repairs</h1>
  <button class="btn-secondary" on:click={exportCsv}>Export CSV</button>
</div>

<div class="card p-4 mt-4 grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
  <input class="input" placeholder="Search…" bind:value={filters.search} />
  <select class="input" bind:value={filters.eventId}>
    <option value="">All events</option>
    {#each events as e}<option value={e.id}>{e.date} {e.name}</option>{/each}
  </select>
  <select class="input" bind:value={filters.repairerId}>
    <option value="">All repairers</option>
    {#each users as u}<option value={u.id}>{u.displayName}</option>{/each}
  </select>
  <select class="input" bind:value={filters.categoryId}>
    <option value="">All categories</option>
    {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
  </select>
  <select class="input" bind:value={filters.status}>
    <option value="">Any status</option>
    <option value="waiting">Waiting</option>
    <option value="in_progress">In progress</option>
    <option value="completed">Completed</option>
    <option value="cannot_repair">Cannot repair</option>
  </select>
  <input class="input" type="date" bind:value={filters.from} />
  <input class="input" type="date" bind:value={filters.to} />
  <div class="flex gap-2">
    <button class="btn-primary flex-1" on:click={() => { pageNum = 1; load(); }}>Apply</button>
    <button class="btn-ghost" on:click={reset}>Reset</button>
  </div>
</div>

{#if data}
  <div class="card mt-4 overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-left text-slate-600">
        <tr>
          <th class="px-3 py-2">Date</th>
          <th class="px-3 py-2">Job</th>
          <th class="px-3 py-2">Item</th>
          <th class="px-3 py-2">Customer</th>
          <th class="px-3 py-2">Repairer</th>
          <th class="px-3 py-2">Outcome</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each data.data as r}
          <tr>
            <td class="px-3 py-2 whitespace-nowrap">{r.eventDate}</td>
            <td class="px-3 py-2 font-mono"><a href={`/admin/repairs/${r.id}`} class="text-brand-700 hover:underline">{r.jobNumber}</a></td>
            <td class="px-3 py-2">{r.itemDescription}</td>
            <td class="px-3 py-2">{r.customerName ?? '—'}</td>
            <td class="px-3 py-2 min-w-[180px]">
              <select
                class="input input-sm py-1 text-sm w-full"
                disabled={savingRowId === r.id}
                value={r.repairerId ?? ''}
                on:change={(e) => assignRow(r, (e.currentTarget as HTMLSelectElement).value)}
                title="Assign this repair to a repairer"
              >
                <option value="">— Unassigned —</option>
                {#each assignable as u}
                  <option value={u.id}>{u.displayName}</option>
                {/each}
              </select>
            </td>
            <td class="px-3 py-2"><span class="badge badge-{r.status}">{r.status.replace('_',' ')}</span></td>
          </tr>
        {:else}
          <tr><td colspan="6" class="px-3 py-6 text-center text-slate-500">No matching repairs</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="mt-3 flex items-center justify-between text-sm text-slate-600">
    <span>{data.meta.total} repairs · page {data.meta.page} of {data.meta.totalPages}</span>
    <div class="flex gap-2">
      <button class="btn-ghost" disabled={pageNum <= 1} on:click={() => { pageNum--; load(); }}>Prev</button>
      <button class="btn-ghost" disabled={pageNum >= data.meta.totalPages} on:click={() => { pageNum++; load(); }}>Next</button>
    </div>
  </div>
{/if}
