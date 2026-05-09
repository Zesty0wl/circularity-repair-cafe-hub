<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  $: id = $page.params.id;
  let detail: any = null;
  let categories: any[] = [];
  let busy = false;

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
    [detail, categories] = await Promise.all([
      api(`/api/admin/repairs/${id}`),
      api('/api/admin/skill-categories'),
    ]);
    Object.assign(form, {
      itemDescription: detail.job.itemDescription,
      itemBrand: detail.job.itemBrand ?? '',
      faultDescription: detail.job.faultDescription,
      categoryId: detail.job.categoryId ?? '',
      customerName: detail.job.customerName ?? '',
      customerContact: detail.job.customerContact ?? '',
      outcomeNotes: detail.job.outcomeNotes ?? '',
      partsUsed: detail.job.partsUsed ?? '',
      environmentalSavingKg: detail.job.environmentalSavingKg ?? '',
      status: detail.job.status,
    });
  }

  onMount(load);

  async function save() {
    busy = true;
    try {
      await api(`/api/admin/repairs/${id}`, {
        method: 'PATCH',
        json: {
          ...form,
          itemBrand: form.itemBrand || null,
          categoryId: form.categoryId || null,
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
</script>

{#if detail}
  <a href="/admin/repairs" class="text-sm text-slate-600 hover:underline">← Back to repairs</a>
  <h1 class="text-2xl font-bold mt-1">{detail.job.jobNumber}</h1>
  <p class="text-slate-600">{detail.event?.name} · {detail.event?.date}</p>

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
