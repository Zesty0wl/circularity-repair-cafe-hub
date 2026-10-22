<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import PatBadge from '$lib/components/PatBadge.svelte';
  import { ArrowLeft } from 'lucide-svelte';

  $: id = $page.params.id;
  let detail: any = null;
  let categories: any[] = [];
  let allUsers: any[] = [];
  let busy = false;
  let claiming = false;
  let assigning = false;
  let assignError = '';
  let deleting = false;

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
    weightKg: '' as string | number,
    /** 'yes', 'no', or '' when nobody answered. */
    firstVisit: '' as '' | 'yes' | 'no',
    satisfaction: '' as '' | 'satisfied' | 'not_satisfied',
    satisfactionComment: '',
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
      weightKg: detail.job.weightKg ?? '',
      firstVisit: detail.job.isFirstVisit === true ? 'yes' : detail.job.isFirstVisit === false ? 'no' : '',
      satisfaction: detail.job.satisfaction ?? '',
      satisfactionComment: detail.job.satisfactionComment ?? '',
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
          weightKg: form.weightKg === '' ? null : Number(form.weightKg),
          isFirstVisit: form.firstVisit === 'yes' ? true : form.firstVisit === 'no' ? false : null,
          satisfaction: form.satisfaction || null,
          satisfactionComment: form.satisfactionComment || null,
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

  // Permanently delete the repair (and its photos). Irreversible, so we confirm
  // first and then return to the list once the server has removed it.
  async function deleteRepair() {
    if (!detail) return;
    if (!confirm(`Permanently delete repair ${detail.job.jobNumber}? This also removes its photos and cannot be undone.`)) return;
    deleting = true;
    try {
      await api(`/api/admin/repairs/${id}`, { method: 'DELETE' });
      await goto('/admin/repairs');
    } catch (e: any) {
      alert(e?.message ?? 'Could not delete repair');
      deleting = false;
    }
  }
</script>

{#if detail}
  <a href="/admin/repairs" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={14} /> Back to repairs</a>
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

  {#if detail.pat && (detail.pat.needed || detail.pat.result)}
    <!-- The PAT test record, while the cafe does PAT tests. -->
    <div class="card p-4 mt-4 max-w-2xl">
      <h2 class="font-semibold">PAT test</h2>
      <p class="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <PatBadge needed={detail.pat.needed} result={detail.pat.result} />
        {#if detail.pat.result}
          <span class="text-slate-600">
            {#if detail.pat.testedByName}Recorded by {detail.pat.testedByName}{/if}{#if detail.pat.testedAt} on {new Date(detail.pat.testedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}{/if}
          </span>
        {:else}
          <span class="text-slate-600">No result recorded yet.</span>
        {/if}
      </p>
      {#if detail.pat.notes}<p class="mt-2 text-sm text-slate-700 whitespace-pre-line">{detail.pat.notes}</p>{/if}
    </div>
  {/if}

  {#if detail.preRegistration}
    <div class="card p-4 mt-4 max-w-2xl">
      <h2 class="font-semibold">Pre-registered</h2>
      <p class="mt-1 text-sm text-slate-600">The visitor told us about this item on {new Date(detail.preRegistration.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}, before the session.</p>
      {#if detail.preRegistration.researchNotes}
        <p class="mt-2 text-sm text-slate-700 whitespace-pre-line">{detail.preRegistration.researchNotes}</p>
      {/if}
    </div>
  {/if}

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
        <option value="">Unassigned</option>
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
        <option value="">No category</option>
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
    <!-- Shown while the cafe asks for them, or when this repair already has an answer. -->
    {#if $cafe?.weighItemsEnabled || $cafe?.askFirstVisitEnabled || form.weightKg !== '' || form.firstVisit !== ''}
      <div class="grid sm:grid-cols-2 gap-3">
        {#if $cafe?.weighItemsEnabled || form.weightKg !== ''}
          <div><label class="label" for="wt">Weight (kg)</label><input id="wt" class="input" type="number" min="0" step="0.001" bind:value={form.weightKg} /></div>
        {/if}
        {#if $cafe?.askFirstVisitEnabled || form.firstVisit !== ''}
          <div>
            <label class="label" for="fv">First visit</label>
            <select id="fv" class="input" bind:value={form.firstVisit}>
              <option value="">Not answered</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        {/if}
      </div>
    {/if}
    <div>
      <label class="label" for="st">Status</label>
      <select id="st" class="input" bind:value={form.status}>
        <option value="waiting">Waiting</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
        <option value="cannot_repair">Cannot repair</option>
        <option value="awaiting_return">Awaiting return</option>
      </select>
    </div>
    {#if $cafe?.askSatisfactionEnabled || form.satisfaction !== '' || form.satisfactionComment !== ''}
    <div class="grid sm:grid-cols-2 gap-3">
      <div>
        <label class="label" for="sat">Satisfaction</label>
        <select id="sat" class="input" bind:value={form.satisfaction}>
          <option value="">Not recorded</option>
          <option value="satisfied">Satisfied</option>
          <option value="not_satisfied">Not satisfied</option>
        </select>
      </div>
      <div><label class="label" for="satc">Comment</label><input id="satc" class="input" maxlength="500" bind:value={form.satisfactionComment} /></div>
    </div>
    {/if}
    <div class="flex justify-end"><button class="btn-primary" on:click={save} disabled={busy}>Save</button></div>
  </div>

  {#if detail.images?.length}
    <section class="mt-6">
      <h2 class="text-lg font-semibold mb-2">Photos</h2>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {#each detail.images as img}
          <a href={`/uploads/${img.filePath}`} target="_blank" rel="noopener">
            <img src={`/uploads/${img.filePath}`} alt={img.stage} class="w-full aspect-square object-cover rounded-xl ring-1 ring-slate-200" />
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <section class="mt-8 max-w-2xl">
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-4">
      <div class="min-w-0">
        <p class="font-semibold text-rose-900">Delete this repair</p>
        <p class="text-sm text-rose-700">Permanently removes this repair record and any photos. This cannot be undone.</p>
      </div>
      <button class="btn-danger shrink-0" disabled={deleting} on:click={deleteRepair}>
        {deleting ? 'Deleting…' : 'Delete repair'}
      </button>
    </div>
  </section>
{/if}
