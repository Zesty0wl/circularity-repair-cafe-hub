<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';

  $: id = $page.params.id;
  let detail: any = null;
  let categories: any[] = [];
  let allUsers: any[] = [];
  let busy = false;
  let claiming = false;
  let assigning = false;
  let assignError = '';

  $: myId = $auth?.user.id ?? null;
  $: status = detail?.job?.status as string | undefined;
  $: isMine = !!detail && detail.job.repairerId === myId && status === 'in_progress';
  $: canClaim = !!detail && (status === 'waiting' || (status === 'in_progress' && detail.job.repairerId !== myId));
  // Repairers + admins can be assigned to a job. We exclude inactive accounts
  // so the dropdown stays short and only shows people who can actually work.
  $: assignableUsers = allUsers
    .filter((u) => u.isActive && (u.role === 'repairer' || u.role === 'admin' || u.role === 'super_admin'))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  let form = {
    itemDescription: '',
    itemBrand: '',
    faultDescription: '',
    categoryId: '',
    customerName: '',
    customerContact: '',
    outcomeNotes: '',
    partsUsed: '',
    environmentalSavingKg: '' as string | number,
    status: 'waiting',
  };

  async function load() {
    [detail, categories, allUsers] = await Promise.all([
      api(`/api/admin/repairs/${id}`),
      api('/api/admin/skill-categories'),
      api('/api/admin/users'),
    ]);
    form = {
      ...form,
      itemDescription: detail.job.itemDescription ?? '',
      itemBrand: detail.job.itemBrand ?? '',
      faultDescription: detail.job.faultDescription ?? '',
      categoryId: detail.job.itemCategoryId ?? '',
      customerName: detail.job.customerName ?? '',
      customerContact: detail.job.customerContact ?? '',
      outcomeNotes: detail.job.outcomeNotes ?? '',
      partsUsed: detail.job.partsUsed ?? '',
      environmentalSavingKg: detail.job.environmentalSavingKg ?? '',
      status: detail.job.status,
    };
  }

  onMount(load);

  async function save() {
    busy = true;
    try {
      await api(`/api/admin/repairs/${id}`, {
        method: 'PATCH',
        json: {
          status: form.status,
          itemDescription: form.itemDescription,
          faultDescription: form.faultDescription,
          itemBrand: form.itemBrand || null,
          itemCategoryId: form.categoryId || null,
          customerName: form.customerName || null,
          customerContact: form.customerContact || null,
          outcomeNotes: form.outcomeNotes || null,
          partsUsed: form.partsUsed || null,
          environmentalSavingKg: form.environmentalSavingKg === '' ? null : Number(form.environmentalSavingKg),
        },
      });
      await load();
    } finally { busy = false; }
  }

  async function claim() {
    if (status === 'in_progress' && detail.job.repairerId && detail.job.repairerId !== myId) {
      const owner = detail.repairer?.displayName ?? 'another repairer';
      if (!confirm(`Take over this job from ${owner}? They will be removed as the active repairer.`)) return;
    }
    claiming = true;
    try {
      await api(`/api/repairer/jobs/${id}/accept`, { method: 'PATCH', json: {} });
      await load();
    } finally { claiming = false; }
  }

  // Admin reassignment. We only set repairerId here — the job's status is left
  // as-is so admins can pre-assign a "waiting" job to a volunteer without
  // misreporting it as already in progress. The assignee can then accept it
  // (or the admin can flip the status manually via the form below).
  async function assignTo(userId: string) {
    assigning = true;
    assignError = '';
    try {
      await api(`/api/admin/repairs/${id}`, {
        method: 'PATCH',
        json: { repairerId: userId || null },
      });
      await load();
    } catch (e: any) {
      assignError = e?.message ?? 'Could not reassign';
    } finally {
      assigning = false;
    }
  }
</script>

{#if detail}
  <a href="/admin/repairs" class="text-sm text-slate-600 hover:underline">← Back to repairs</a>
  <h1 class="text-2xl font-bold mt-1">{detail.job.jobNumber}</h1>
  <p class="text-slate-600">{detail.event?.name} · {detail.event?.date}</p>

  <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
    <span class="badge badge-{detail.job.status}">{detail.job.status.replace('_',' ')}</span>
    {#if detail.repairer}
      <span class="text-slate-600">Repairer: <strong>{isMine ? 'you' : detail.repairer.displayName}</strong></span>
    {:else}
      <span class="text-slate-500">No repairer assigned</span>
    {/if}
    {#if canClaim}
      <button class="btn-primary ml-auto" disabled={claiming} on:click={claim}>
        {status === 'waiting' ? 'Claim this repair' : 'Take over this job'}
      </button>
    {/if}
  </div>

  <div class="card p-4 mt-4 max-w-2xl">
    <label class="label" for="assign">Assign to repairer</label>
    <div class="flex flex-wrap items-center gap-2">
      <select
        id="assign"
        class="input flex-1 min-w-[200px]"
        disabled={assigning}
        value={detail.job.repairerId ?? ''}
        on:change={(e) => assignTo((e.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">— Unassigned —</option>
        {#each assignableUsers as u}
          <option value={u.id}>
            {u.displayName}{u.id === myId ? ' (you)' : ''}{u.role !== 'repairer' ? ` · ${u.role.replace('_', ' ')}` : ''}
          </option>
        {/each}
      </select>
      {#if detail.job.repairerId}
        <button class="btn-ghost" disabled={assigning} on:click={() => assignTo('')}>Unassign</button>
      {/if}
      {#if assigning}<span class="text-xs text-slate-500">Saving…</span>{/if}
    </div>
    {#if assignError}<p class="text-sm text-rose-600 mt-2">{assignError}</p>{/if}
    <p class="text-xs text-slate-500 mt-2">Reassigning doesn't change the status. Use the status field below to mark the repair in progress, completed, etc.</p>
  </div>

  <div class="card p-6 mt-4 max-w-2xl space-y-4">
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="label" for="im">Item</label><input id="im" class="input" bind:value={form.itemDescription} /></div>
      <div><label class="label" for="br">Brand</label><input id="br" class="input" bind:value={form.itemBrand} /></div>
    </div>
    <div>
      <label class="label" for="cat">Category</label>
      <select id="cat" class="input" bind:value={form.categoryId}>
        <option value="">—</option>
        {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
    <div><label class="label" for="ft">Fault</label><textarea id="ft" class="input" rows="3" bind:value={form.faultDescription}></textarea></div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="label" for="cn">Customer</label><input id="cn" class="input" bind:value={form.customerName} /></div>
      <div><label class="label" for="cc">Contact</label><input id="cc" class="input" bind:value={form.customerContact} /></div>
    </div>
    <div><label class="label" for="on">Repair notes</label><textarea id="on" class="input" rows="3" bind:value={form.outcomeNotes}></textarea></div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="label" for="pa">Parts used</label><input id="pa" class="input" bind:value={form.partsUsed} /></div>
      <div><label class="label" for="es">Saving (kg)</label><input id="es" class="input" type="number" step="0.001" bind:value={form.environmentalSavingKg} /></div>
    </div>
    <div>
      <label class="label" for="st">Status</label>
      <select id="st" class="input" bind:value={form.status}>
        <option value="waiting">Waiting</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
        <option value="cannot_repair">Cannot repair</option>
      </select>
    </div>
    <div class="flex justify-end"><button class="btn-primary" on:click={save} disabled={busy}>Save</button></div>
  </div>

  {#if detail.images?.length}
    <section class="mt-6">
      <h2 class="font-semibold mb-2">Photos</h2>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {#each detail.images as img}
          <a href={`/uploads/${img.filePath}`} target="_blank" rel="noopener">
            <img src={`/uploads/${img.filePath}`} alt={img.stage} class="w-full aspect-square object-cover rounded-lg" />
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/if}
