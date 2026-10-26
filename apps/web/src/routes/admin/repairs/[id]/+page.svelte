<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { t, tNow, dateLocale } from '$lib/i18n';
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
    cardNumber: '' as string | number,
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
      cardNumber: detail.job.cardNumber ?? '',
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
          cardNumber: form.cardNumber === '' ? null : Number(form.cardNumber),
        },
      });
      await load();
    } finally { busy = false; }
  }

  async function claim() {
    if (status === 'in_progress' && detail.job.repairerId && detail.job.repairerId !== myId) {
      const owner = detail.repairer?.displayName ?? tNow('another repairer');
      if (!confirm(tNow('Take over this job from {owner}? They will be removed as the active repairer.', { owner }))) return;
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
      assignError = e?.message ?? tNow('Could not reassign');
    } finally {
      assigning = false;
    }
  }

  // Permanently delete the repair (and its photos). Irreversible, so we confirm
  // first and then return to the list once the server has removed it.
  async function deleteRepair() {
    if (!detail) return;
    if (!confirm(tNow('Permanently delete repair {number}? This also removes its photos and cannot be undone.', { number: detail.job.jobNumber }))) return;
    deleting = true;
    try {
      await api(`/api/admin/repairs/${id}`, { method: 'DELETE' });
      await goto('/admin/repairs');
    } catch (e: any) {
      alert(e?.message ?? tNow('Could not delete repair'));
      deleting = false;
    }
  }
</script>

{#if detail}
  <a href="/admin/repairs" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={14} /> {$t('Back to repairs')}</a>
  <h1 class="text-2xl font-bold mt-1">{detail.job.jobNumber}</h1>
  <p class="text-slate-600">{detail.event?.name} · {detail.event?.date}</p>

  <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
    <span class="badge badge-{detail.job.status}">{$t(detail.job.status.replace('_',' '))}</span>
    {#if detail.repairer}
      <span class="text-slate-600">{$t('Repairer:')} <strong>{isMine ? $t('you') : detail.repairer.displayName}</strong></span>
    {:else}
      <span class="text-slate-500">{$t('No repairer assigned')}</span>
    {/if}
    {#if canClaim}
      <button class="btn-primary ml-auto" disabled={claiming} on:click={claim}>
        {status === 'waiting' ? $t('Claim this repair') : $t('Take over this job')}
      </button>
    {/if}
  </div>

  {#if detail.pat && (detail.pat.needed || detail.pat.result)}
    <!-- The PAT test record, while the cafe does PAT tests. -->
    <div class="card p-4 mt-4 max-w-2xl">
      <h2 class="font-semibold">{$t('PAT test')}</h2>
      <p class="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <PatBadge needed={detail.pat.needed} result={detail.pat.result} />
        {#if detail.pat.result}
          <span class="text-slate-600">
            {#if detail.pat.testedByName && detail.pat.testedAt}{$t('Recorded by {name} on {date}', { name: detail.pat.testedByName, date: new Date(detail.pat.testedAt).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' }) })}{:else if detail.pat.testedByName}{$t('Recorded by {name}', { name: detail.pat.testedByName })}{:else if detail.pat.testedAt} {$t('on {date}', { date: new Date(detail.pat.testedAt).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' }) })}{/if}
          </span>
        {:else}
          <span class="text-slate-600">{$t('No result recorded yet.')}</span>
        {/if}
      </p>
      {#if detail.pat.notes}<p class="mt-2 text-sm text-slate-700 whitespace-pre-line">{detail.pat.notes}</p>{/if}
    </div>
  {/if}

  {#if detail.preRegistration}
    <div class="card p-4 mt-4 max-w-2xl">
      <h2 class="font-semibold">{$t('Pre-registered')}</h2>
      <p class="mt-1 text-sm text-slate-600">{$t('The visitor told us about this item on {date}, before the session.', { date: new Date(detail.preRegistration.createdAt).toLocaleDateString(dateLocale(), { dateStyle: 'medium' }) })}</p>
      {#if detail.preRegistration.researchNotes}
        <p class="mt-2 text-sm text-slate-700 whitespace-pre-line">{detail.preRegistration.researchNotes}</p>
      {/if}
    </div>
  {/if}

  <div class="card p-4 mt-4 max-w-2xl">
    <label class="label" for="assign">{$t('Assign to repairer')}</label>
    <div class="flex flex-wrap items-center gap-2">
      <select
        id="assign"
        class="input flex-1 min-w-[200px]"
        disabled={assigning}
        value={detail.job.repairerId ?? ''}
        on:change={(e) => assignTo((e.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">{$t('Unassigned')}</option>
        {#each assignableUsers as u}
          <option value={u.id}>
            {u.displayName}{u.id === myId ? $t(' (you)') : ''}{u.role !== 'repairer' ? ` · ${$t(u.role.replace('_', ' '))}` : ''}
          </option>
        {/each}
      </select>
      {#if detail.job.repairerId}
        <button class="btn-ghost" disabled={assigning} on:click={() => assignTo('')}>{$t('Unassign')}</button>
      {/if}
      {#if assigning}<span class="text-xs text-slate-500">{$t('Saving…')}</span>{/if}
    </div>
    {#if assignError}<p class="text-sm text-rose-600 mt-2">{assignError}</p>{/if}
    <p class="text-xs text-slate-500 mt-2">{$t("Reassigning doesn't change the status. Use the status field below to mark the repair in progress, completed, etc.")}</p>
  </div>

  <div class="card p-6 mt-4 max-w-2xl space-y-4">
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="label" for="im">{$t('Item')}</label><input id="im" class="input" bind:value={form.itemDescription} /></div>
      <div><label class="label" for="br">{$t('Brand')}</label><input id="br" class="input" bind:value={form.itemBrand} /></div>
    </div>
    {#if $cafe?.cardNumbersEnabled || form.cardNumber !== ''}
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label class="label" for="cn2">{$t('Card number')}</label><input id="cn2" class="input" type="number" min="1" max="999" bind:value={form.cardNumber} /></div>
      </div>
    {/if}
    <div>
      <label class="label" for="cat">{$t('Category')}</label>
      <select id="cat" class="input" bind:value={form.categoryId}>
        <option value="">{$t('No category')}</option>
        {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
    <div><label class="label" for="ft">{$t('Fault')}</label><textarea id="ft" class="input" rows="3" bind:value={form.faultDescription}></textarea></div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="label" for="cn">{$t('Customer')}</label><input id="cn" class="input" bind:value={form.customerName} /></div>
      <div><label class="label" for="cc">{$t('Contact')}</label><input id="cc" class="input" bind:value={form.customerContact} /></div>
    </div>
    <div><label class="label" for="on">{$t('Repair notes')}</label><textarea id="on" class="input" rows="3" bind:value={form.outcomeNotes}></textarea></div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="label" for="pa">{$t('Parts used')}</label><input id="pa" class="input" bind:value={form.partsUsed} /></div>
      <div><label class="label" for="es">{$t('Saving (kg)')}</label><input id="es" class="input" type="number" step="0.001" bind:value={form.environmentalSavingKg} /></div>
    </div>
    <!-- Shown while the cafe asks for them, or when this repair already has an answer. -->
    {#if $cafe?.weighItemsEnabled || $cafe?.askFirstVisitEnabled || form.weightKg !== '' || form.firstVisit !== ''}
      <div class="grid sm:grid-cols-2 gap-3">
        {#if $cafe?.weighItemsEnabled || form.weightKg !== ''}
          <div><label class="label" for="wt">{$t('Weight (kg)')}</label><input id="wt" class="input" type="number" min="0" step="0.001" bind:value={form.weightKg} /></div>
        {/if}
        {#if $cafe?.askFirstVisitEnabled || form.firstVisit !== ''}
          <div>
            <label class="label" for="fv">{$t('First visit')}</label>
            <select id="fv" class="input" bind:value={form.firstVisit}>
              <option value="">{$t('Not answered')}</option>
              <option value="yes">{$t('Yes')}</option>
              <option value="no">{$t('No')}</option>
            </select>
          </div>
        {/if}
      </div>
    {/if}
    <div>
      <label class="label" for="st">{$t('Status')}</label>
      <select id="st" class="input" bind:value={form.status}>
        <option value="waiting">{$t('Waiting')}</option>
        <option value="in_progress">{$t('In progress')}</option>
        <option value="completed">{$t('Completed')}</option>
        <option value="cannot_repair">{$t('Cannot repair')}</option>
        <option value="awaiting_return">{$t('Awaiting return')}</option>
      </select>
    </div>
    {#if $cafe?.askSatisfactionEnabled || form.satisfaction !== '' || form.satisfactionComment !== ''}
    <div class="grid sm:grid-cols-2 gap-3">
      <div>
        <label class="label" for="sat">{$t('Satisfaction')}</label>
        <select id="sat" class="input" bind:value={form.satisfaction}>
          <option value="">{$t('Not recorded')}</option>
          <option value="satisfied">{$t('Satisfied')}</option>
          <option value="not_satisfied">{$t('Not satisfied')}</option>
        </select>
      </div>
      <div><label class="label" for="satc">{$t('Comment')}</label><input id="satc" class="input" maxlength="500" bind:value={form.satisfactionComment} /></div>
    </div>
    {/if}
    <div class="flex justify-end"><button class="btn-primary" on:click={save} disabled={busy}>{$t('Save')}</button></div>
  </div>

  {#if detail.images?.length}
    <section class="mt-6">
      <h2 class="text-lg font-semibold mb-2">{$t('Photos')}</h2>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {#each detail.images as img}
          <a href={`/uploads/${img.filePath}`} target="_blank" rel="noopener">
            <img src={`/uploads/${img.filePath}`} alt={$t(img.stage)} class="w-full aspect-square object-cover rounded-xl ring-1 ring-slate-200" />
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <section class="mt-8 max-w-2xl">
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-4">
      <div class="min-w-0">
        <p class="font-semibold text-rose-900">{$t('Delete this repair')}</p>
        <p class="text-sm text-rose-700">{$t('Permanently removes this repair record and any photos. This cannot be undone.')}</p>
      </div>
      <button class="btn-danger shrink-0" disabled={deleting} on:click={deleteRepair}>
        {deleting ? $t('Deleting…') : $t('Delete repair')}
      </button>
    </div>
  </section>
{/if}
