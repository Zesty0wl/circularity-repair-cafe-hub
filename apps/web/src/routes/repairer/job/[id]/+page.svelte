<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import { ArrowLeft, Camera as CameraIcon } from 'lucide-svelte';

  $: id = $page.params.id;

  interface JobDetail {
    job: any; category: any; event: any; venue: any; repairer: any;
    images: Array<{ id: string; filePath: string; stage: string; caption: string | null; createdAt: string }>;
  }

  let detail: JobDetail | null = null;
  let outcome: 'completed' | 'cannot_repair' = 'completed';
  let outcomeNotes = '';
  let partsUsed = '';
  let savings: number | string = '';
  let busy = false;
  let showCamera = false;
  let cameraStage: 'during_repair' | 'completed' = 'during_repair';
  let confirming = false;

  $: myId = $auth?.user.id ?? null;
  $: status = detail?.job.status as string | undefined;
  $: isMine = !!detail && detail.job.repairerId === myId && status === 'in_progress';
  $: isFinished = status === 'completed' || status === 'cannot_repair';

  async function load() {
    detail = await api<JobDetail>(`/api/repairer/jobs/${id}`);
    if (detail.job.outcomeNotes) outcomeNotes = detail.job.outcomeNotes;
    if (detail.job.partsUsed) partsUsed = detail.job.partsUsed;
    if (detail.job.environmentalSavingKg) savings = detail.job.environmentalSavingKg;
  }

  onMount(load);

  async function claim() {
    busy = true;
    try {
      await api(`/api/repairer/jobs/${id}/accept`, { method: 'PATCH', json: {} });
      await load();
    } finally {
      busy = false;
    }
  }

  async function takeOver() {
    const owner = detail?.repairer?.displayName ?? 'another repairer';
    if (!confirm(`Take over this job from ${owner}? They will be removed as the active repairer.`)) return;
    await claim();
  }

  async function complete() {
    busy = true;
    try {
      await api(`/api/repairer/jobs/${id}/complete`, {
        method: 'PATCH',
        json: {
          outcome,
          outcomeNotes: outcomeNotes.trim() || null,
          partsUsed: partsUsed.trim() || null,
          environmentalSavingKg: savings === '' ? null : Number(savings),
        },
      });
      goto('/repairer');
    } finally {
      busy = false;
      confirming = false;
    }
  }

  async function release() {
    if (!confirm('Release this job back to the waiting queue?')) return;
    busy = true;
    try {
      await api(`/api/repairer/jobs/${id}/release`, { method: 'PATCH', json: {} });
      goto('/repairer');
    } finally {
      busy = false;
    }
  }

  async function onCapture(e: CustomEvent<{ blob: Blob; previewUrl: string }>) {
    const fd = new FormData();
    fd.append('image', e.detail.blob, 'photo.jpg');
    await api(`/api/repairer/jobs/${id}/image?stage=${cameraStage}`, {
      method: 'POST',
      formData: fd,
    });
    showCamera = false;
    await load();
  }
</script>

<a href="/repairer" class="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline mb-3"><ArrowLeft size={14} /> Back to queue</a>

{#if !detail}
  <p class="text-slate-500">Loading…</p>
{:else}
  <header class="card p-5">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs text-slate-500">{detail.job.jobNumber}</p>
        <h1 class="text-2xl font-bold">{detail.job.itemDescription}</h1>
        {#if detail.job.itemBrand}<p class="text-slate-600">{detail.job.itemBrand}</p>{/if}
      </div>
      <span class="badge badge-{detail.job.status}">{detail.job.status.replace('_', ' ')}</span>
    </div>
    <div class="mt-3 text-sm text-slate-600">
      Customer: <strong>{detail.job.customerName ?? '—'}</strong>
      {#if detail.job.customerContact}<span class="ml-3">Contact: {detail.job.customerContact}</span>{/if}
    </div>
    {#if status === 'in_progress' && detail.repairer}
      <p class="mt-2 text-sm text-slate-600">Currently with: <strong>{isMine ? 'you' : detail.repairer.displayName}</strong></p>
    {/if}
  </header>

  {#if status === 'waiting'}
    <div class="card p-4 mt-4 flex items-center justify-between gap-3 bg-amber-50">
      <p class="text-sm text-amber-900">This repair is waiting for a repairer.</p>
      <button class="btn-primary text-sm" disabled={busy} on:click={claim}>Claim this repair</button>
    </div>
  {:else if status === 'in_progress' && !isMine}
    <div class="card p-4 mt-4 flex items-center justify-between gap-3 bg-blue-50">
      <p class="text-sm text-blue-900">Another repairer is working on this. You can take over if needed.</p>
      <button class="btn-primary text-sm" disabled={busy} on:click={takeOver}>Take over this job</button>
    </div>
  {/if}

  <section class="card p-5 mt-4">
    <h2 class="text-lg font-semibold">Fault</h2>
    <p class="mt-2 text-slate-700 whitespace-pre-line">{detail.job.faultDescription}</p>
  </section>

  <section class="card p-5 mt-4">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold">Photos</h2>
      {#if isMine}
        <button class="btn-secondary text-sm" on:click={() => { cameraStage = 'during_repair'; showCamera = true; }}><CameraIcon size={16} /> Add photo</button>
      {/if}
    </div>
    {#if detail.images.length === 0}
      <p class="mt-3 text-slate-500 text-sm">No photos yet.</p>
    {:else}
      <div class="mt-3 grid grid-cols-3 gap-2">
        {#each detail.images as img}
          <a href={`/uploads/${img.filePath}`} target="_blank" rel="noopener">
            <img src={`/uploads/${img.filePath}`} alt={img.stage} class="w-full aspect-square object-cover rounded-lg" />
          </a>
        {/each}
      </div>
    {/if}
    {#if showCamera && isMine}
      <div class="mt-4 flex gap-2 items-center">
        <span class="text-sm">Stage:</span>
        <select bind:value={cameraStage} class="input !py-1 !text-sm w-auto">
          <option value="during_repair">During repair</option>
          <option value="completed">Completed</option>
        </select>
        <button class="btn-ghost text-sm ml-auto" on:click={() => (showCamera = false)}>Cancel</button>
      </div>
      <div class="mt-3"><CameraCapture on:capture={onCapture} maxLongestEdge={2000} quality={0.82} /></div>
    {/if}
  </section>

  {#if isMine}
  <section class="card p-5 mt-4 space-y-4">
    <h2 class="text-lg font-semibold">Repair details</h2>
    <div>
      <label class="label" for="notes">Repair notes</label>
      <textarea id="notes" class="input" rows="4" bind:value={outcomeNotes}></textarea>
    </div>
    <div>
      <label class="label" for="parts">Parts used</label>
      <input id="parts" class="input" bind:value={partsUsed} />
    </div>
    <div>
      <label class="label" for="esv">Environmental saving (kg, optional)</label>
      <input id="esv" class="input" type="number" step="0.001" min="0" bind:value={savings} />
    </div>
    <div>
      <label class="label" for="oc">Outcome</label>
      <select id="oc" class="input" bind:value={outcome}>
        <option value="completed">Repaired successfully</option>
        <option value="cannot_repair">Could not repair — see notes</option>
      </select>
    </div>
    <div class="flex justify-between gap-2">
      <button class="btn-ghost" disabled={busy} on:click={release}>Return to queue</button>
      <button class="btn-primary" disabled={busy} on:click={() => (confirming = true)}>Mark as complete</button>
    </div>
  </section>
  {:else if isFinished && (detail.job.outcomeNotes || detail.job.partsUsed || detail.job.environmentalSavingKg)}
  <section class="card p-5 mt-4 space-y-2">
    <h2 class="text-lg font-semibold">Repair details</h2>
    {#if detail.job.outcomeNotes}
      <p class="text-sm"><span class="text-slate-500">Notes:</span> <span class="whitespace-pre-line">{detail.job.outcomeNotes}</span></p>
    {/if}
    {#if detail.job.partsUsed}
      <p class="text-sm"><span class="text-slate-500">Parts:</span> {detail.job.partsUsed}</p>
    {/if}
    {#if detail.job.environmentalSavingKg}
      <p class="text-sm"><span class="text-slate-500">Saving:</span> {detail.job.environmentalSavingKg} kg</p>
    {/if}
  </section>
  {/if}

  {#if confirming}
    <div class="fixed inset-0 bg-slate-900/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl max-w-sm w-full p-6">
        <h3 class="text-lg font-semibold">Confirm</h3>
        <p class="mt-2 text-slate-700">Mark this job as <strong>{outcome === 'completed' ? 'repaired' : 'unable to repair'}</strong>?</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-ghost" on:click={() => (confirming = false)}>Cancel</button>
          <button class="btn-primary" on:click={complete} disabled={busy}>Confirm</button>
        </div>
      </div>
    </div>
  {/if}
{/if}
