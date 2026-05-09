<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let venues: any[] = [];
  let editing: any | null = null;

  async function load() { venues = await api('/api/admin/venues'); }
  onMount(load);

  function blank() {
    return { name: '', addressLine1: '', addressLine2: '', city: '', postcode: '', country: 'United Kingdom', latitude: '', longitude: '', mapEmbedUrl: '', isHomeVenue: false };
  }
  function startNew() { editing = blank(); }

  async function save() {
    const body = {
      ...editing,
      latitude: editing.latitude === '' ? null : Number(editing.latitude),
      longitude: editing.longitude === '' ? null : Number(editing.longitude),
      addressLine2: editing.addressLine2 || null,
      mapEmbedUrl: editing.mapEmbedUrl || null,
    };
    if (editing.id) {
      await api(`/api/admin/venues/${editing.id}`, { method: 'PATCH', json: body });
    } else {
      await api('/api/admin/venues', { method: 'POST', json: body });
    }
    editing = null;
    await load();
  }

  async function del(v: any) {
    if (v.isHomeVenue) return alert('Cannot delete the home venue');
    if (!confirm(`Delete "${v.name}"?`)) return;
    try { await api(`/api/admin/venues/${v.id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { alert(e?.message || 'Could not delete'); }
  }
</script>

<div class="flex justify-between items-center">
  <h1 class="text-2xl font-bold">Venues</h1>
  <button class="btn-primary" on:click={startNew}>Add venue</button>
</div>

<ul class="card mt-4 divide-y divide-slate-100">
  {#each venues as v}
    <li class="px-4 py-3 flex justify-between gap-3">
      <div>
        <p class="font-semibold">{v.name} {#if v.isHomeVenue}<span class="badge bg-amber-100 text-amber-800 ml-2">Home</span>{/if}</p>
        <p class="text-sm text-slate-600">{v.addressLine1}, {v.city}, {v.postcode}</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost text-sm" on:click={() => (editing = { ...v, latitude: v.latitude ?? '', longitude: v.longitude ?? '', mapEmbedUrl: v.mapEmbedUrl ?? '' })}>Edit</button>
        <button class="btn-ghost text-sm text-rose-600" on:click={() => del(v)}>Delete</button>
      </div>
    </li>
  {/each}
</ul>

{#if editing}
  <div class="fixed inset-0 bg-slate-900/50 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto">
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 my-8 space-y-3">
      <h2 class="text-lg font-semibold">{editing.id ? 'Edit venue' : 'New venue'}</h2>
      <div><label class="label" for="vn">Name</label><input id="vn" class="input" bind:value={editing.name} /></div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label class="label" for="a1">Address line 1</label><input id="a1" class="input" bind:value={editing.addressLine1} /></div>
        <div><label class="label" for="a2">Address line 2</label><input id="a2" class="input" bind:value={editing.addressLine2} /></div>
        <div><label class="label" for="ci">City</label><input id="ci" class="input" bind:value={editing.city} /></div>
        <div><label class="label" for="pc">Postcode</label><input id="pc" class="input" bind:value={editing.postcode} /></div>
        <div><label class="label" for="co">Country</label><input id="co" class="input" bind:value={editing.country} /></div>
      </div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label class="label" for="la">Latitude</label><input id="la" class="input" type="number" step="0.000001" bind:value={editing.latitude} /></div>
        <div><label class="label" for="lo">Longitude</label><input id="lo" class="input" type="number" step="0.000001" bind:value={editing.longitude} /></div>
      </div>
      <div><label class="label" for="me">Map embed URL (Google/OSM iframe src)</label><input id="me" class="input" bind:value={editing.mapEmbedUrl} /></div>
      <label class="flex items-center gap-2"><input type="checkbox" bind:checked={editing.isHomeVenue} /> Set as home venue (default for events)</label>
      <div class="flex justify-end gap-2 pt-2"><button class="btn-ghost" on:click={() => (editing = null)}>Cancel</button><button class="btn-primary" on:click={save}>Save</button></div>
    </div>
  </div>
{/if}
