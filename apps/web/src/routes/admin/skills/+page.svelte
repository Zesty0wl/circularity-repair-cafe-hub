<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { Trash2, Plus, GripVertical } from 'lucide-svelte';

  let categories: any[] = [];
  let newName = '';
  let newDesc = '';
  let dragId: string | null = null;

  async function load() { categories = await api('/api/admin/skill-categories'); }
  onMount(load);

  async function add() {
    if (!newName.trim()) return;
    await api('/api/admin/skill-categories', {
      method: 'POST',
      json: { name: newName.trim(), description: newDesc.trim() || null, sortOrder: categories.length },
    });
    newName = ''; newDesc = '';
    await load();
  }

  async function rename(c: any) {
    const name = prompt('New name', c.name);
    if (!name || name === c.name) return;
    await api(`/api/admin/skill-categories/${c.id}`, { method: 'PATCH', json: { name } });
    await load();
  }

  async function toggleActive(c: any) {
    await api(`/api/admin/skill-categories/${c.id}`, { method: 'PATCH', json: { isActive: !c.isActive } });
    await load();
  }

  async function del(c: any) {
    if (!confirm(`Delete "${c.name}"? This will fail if any jobs use it.`)) return;
    try { await api(`/api/admin/skill-categories/${c.id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { alert(e?.message || 'Could not delete'); }
  }

  async function persistOrder() {
    await api('/api/admin/skill-categories/reorder', { method: 'POST', json: { ids: categories.map((c) => c.id) } });
  }

  function dragStart(e: DragEvent, id: string) { dragId = id; e.dataTransfer?.setData('text/plain', id); }
  function dragOver(e: DragEvent) { e.preventDefault(); }
  function drop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const ids = categories.map((c) => c.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    const [moved] = categories.splice(fromIdx, 1);
    categories.splice(toIdx, 0, moved);
    categories = [...categories];
    dragId = null;
    persistOrder();
  }
</script>

<h1 class="text-2xl font-bold">Skill categories</h1>

<div class="card p-4 mt-4 flex gap-2 items-end max-w-2xl">
  <div class="flex-1"><label class="label" for="nm">Name</label><input id="nm" class="input" bind:value={newName} /></div>
  <div class="flex-1"><label class="label" for="ds">Description</label><input id="ds" class="input" bind:value={newDesc} /></div>
  <button class="btn-primary" on:click={add}><Plus size={16} /> Add</button>
</div>

<ul class="card mt-4 divide-y divide-slate-100 max-w-2xl">
  {#each categories as c (c.id)}
    <li class="px-3 py-3 flex items-center gap-3"
        draggable="true"
        on:dragstart={(e) => dragStart(e, c.id)}
        on:dragover={dragOver}
        on:drop={(e) => drop(e, c.id)}>
      <GripVertical class="cursor-grab text-slate-400" size={16} />
      <div class="flex-1 cursor-pointer" on:click={() => rename(c)} on:keydown role="button" tabindex="0">
        <p class="font-semibold">{c.name}</p>
        {#if c.description}<p class="text-xs text-slate-500">{c.description}</p>{/if}
      </div>
      <button class="badge {c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}" on:click={() => toggleActive(c)}>{c.isActive ? 'Active' : 'Hidden'}</button>
      <button class="text-rose-600 p-1" on:click={() => del(c)}><Trash2 size={16} /></button>
    </li>
  {/each}
</ul>
