<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  interface Venue {
    id?: string;
    name: string;
    address: string | null;
    postcode: string | null;
    what3words: string | null;
    mapUrl: string | null;
    directions: string | null;
    parkingInfo: string | null;
    accessibilityInfo: string | null;
    notes: string | null;
    isHomeVenue: boolean;
    isActive: boolean;
  }

  let venues: Venue[] = [];
  let editing: Venue | null = null;

  async function load() {
    venues = await api<Venue[]>('/api/admin/venues');
  }
  onMount(load);

  function blank(): Venue {
    return {
      name: '',
      address: '',
      postcode: '',
      what3words: '',
      mapUrl: '',
      directions: '',
      parkingInfo: '',
      accessibilityInfo: '',
      notes: '',
      isHomeVenue: false,
      isActive: true,
    };
  }
  function startNew() {
    editing = blank();
  }
  function startEdit(v: Venue) {
    editing = {
      ...v,
      address: v.address ?? '',
      postcode: v.postcode ?? '',
      what3words: v.what3words ?? '',
      mapUrl: v.mapUrl ?? '',
      directions: v.directions ?? '',
      parkingInfo: v.parkingInfo ?? '',
      accessibilityInfo: v.accessibilityInfo ?? '',
      notes: v.notes ?? '',
    };
  }

  async function save() {
    if (!editing) return;
    const body = {
      name: editing.name.trim(),
      address: editing.address?.trim() || null,
      postcode: editing.postcode?.trim() || null,
      what3words: editing.what3words?.trim() || null,
      mapUrl: editing.mapUrl?.trim() || null,
      directions: editing.directions?.trim() || null,
      parkingInfo: editing.parkingInfo?.trim() || null,
      accessibilityInfo: editing.accessibilityInfo?.trim() || null,
      notes: editing.notes?.trim() || null,
      isHomeVenue: editing.isHomeVenue,
      isActive: editing.isActive,
    };
    if (editing.id) {
      await api(`/api/admin/venues/${editing.id}`, { method: 'PATCH', json: body });
    } else {
      await api('/api/admin/venues', { method: 'POST', json: body });
    }
    editing = null;
    await load();
  }

  async function del(v: Venue) {
    if (v.isHomeVenue) return alert('Cannot delete the home venue');
    if (!confirm(`Delete "${v.name}"?`)) return;
    try {
      await api(`/api/admin/venues/${v.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      alert(e?.message || 'Could not delete');
    }
  }
</script>

<div class="flex justify-between items-center">
  <h1 class="text-2xl font-bold">Venues</h1>
  <button class="btn-primary" on:click={startNew}>Add venue</button>
</div>

<ul class="card mt-4 divide-y divide-slate-100">
  {#each venues as v}
    <li class="px-4 py-3 flex justify-between gap-3">
      <div class="min-w-0">
        <p class="font-semibold">
          {v.name}
          {#if v.isHomeVenue}<span class="badge bg-amber-100 text-amber-800 ml-2">Home</span>{/if}
          {#if !v.isActive}<span class="badge bg-slate-100 text-slate-600 ml-2">Inactive</span>{/if}
        </p>
        <p class="text-sm text-slate-600 truncate">
          {[v.address, v.postcode].filter(Boolean).join(', ') || '-'}
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button class="btn-ghost text-sm" on:click={() => startEdit(v)}>Edit</button>
        <button class="btn-ghost text-sm text-rose-600" on:click={() => del(v)}>Delete</button>
      </div>
    </li>
  {/each}
  {#if venues.length === 0}
    <li class="px-4 py-6 text-center text-slate-500 text-sm">No venues yet. Add one to get started.</li>
  {/if}
</ul>

{#if editing}
  <div class="fixed inset-0 bg-slate-900/50 z-50 overflow-y-auto">
    <div class="min-h-full flex items-start sm:items-center justify-center p-4">
      <div class="bg-white rounded-2xl max-w-2xl w-full p-6 my-8 space-y-4 shadow-xl">
        <h2 class="text-lg font-semibold">{editing.id ? 'Edit venue' : 'New venue'}</h2>

      <div>
        <label class="label" for="vn">Venue name</label>
        <input id="vn" class="input" maxlength="200" bind:value={editing.name} />
      </div>

      <div class="grid sm:grid-cols-3 gap-3">
        <div class="sm:col-span-2">
          <label class="label" for="va">Address</label>
          <textarea
            id="va"
            class="input"
            rows="3"
            maxlength="500"
            placeholder="Street, town"
            bind:value={editing.address}
          ></textarea>
          <p class="text-xs text-slate-500 mt-1">Free-form. Use line breaks for street and town.</p>
        </div>
        <div>
          <label class="label" for="vp">Postcode</label>
          <input id="vp" class="input" maxlength="20" bind:value={editing.postcode} />
        </div>
      </div>

      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label class="label" for="vw">what3words <span class="font-normal text-slate-500">(precise location)</span></label>
          <input id="vw" class="input" maxlength="100" placeholder="filled.count.soap" bind:value={editing.what3words} />
        </div>
        <div>
          <label class="label" for="vm">Map URL <span class="font-normal text-slate-500">(optional)</span></label>
          <input id="vm" class="input" placeholder="https://www.google.com/maps/embed?pb=..." bind:value={editing.mapUrl} />
          <p class="text-xs text-slate-500 mt-1">
            Paste an <strong>embed</strong> URL to show a map on the Contact page.
            In Google Maps: <em>Share &rarr; Embed a map &rarr; Copy HTML</em>, then paste only the
            <code>src="…"</code> value (starts with <code>https://www.google.com/maps/embed?pb=</code>).
            A regular share link (e.g. <code>maps.app.goo.gl/…</code>) will show as a clickable
            "View on map" button instead.
          </p>
        </div>
      </div>

      <div>
        <label class="label" for="vd">How to find us</label>
        <textarea
          id="vd"
          class="input"
          rows="4"
          maxlength="2000"
          placeholder={'e.g. "Use the side entrance off Main Street; we\'re in the upstairs hall. Follow the signs."'}
          bind:value={editing.directions}
        ></textarea>
      </div>

      <div>
        <label class="label" for="vk">Parking &amp; transport</label>
        <textarea
          id="vk"
          class="input"
          rows="3"
          maxlength="1000"
          placeholder={'e.g. "Free on-street parking on adjacent roads. Bus stops 12, 14 outside. Bike racks at the rear."'}
          bind:value={editing.parkingInfo}
        ></textarea>
      </div>

      <div>
        <label class="label" for="vac">Accessibility</label>
        <textarea
          id="vac"
          class="input"
          rows="3"
          maxlength="1000"
          placeholder={'e.g. "Step-free entrance. Accessible WC on ground floor. Hearing loop available."'}
          bind:value={editing.accessibilityInfo}
        ></textarea>
      </div>

      <div>
        <label class="label" for="vn2">Good-to-know notes <span class="font-normal text-slate-500">(optional)</span></label>
        <textarea
          id="vn2"
          class="input"
          rows="2"
          maxlength="1000"
          placeholder="Any other useful info for visitors"
          bind:value={editing.notes}
        ></textarea>
      </div>

      <div class="flex flex-wrap gap-4 pt-1">
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={editing.isHomeVenue} /> Home venue (shown on public Contact page)
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={editing.isActive} /> Active
        </label>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button class="btn-ghost" on:click={() => (editing = null)}>Cancel</button>
        <button class="btn-primary" on:click={save}>Save</button>
      </div>
    </div>
    </div>
  </div>
{/if}
