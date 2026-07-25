<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let users: any[] = [];

  async function load() { users = await api('/api/admin/users'); }
  onMount(load);

  async function toggleActive(u: any) {
    await api(`/api/admin/users/${u.id}`, { method: 'PATCH', json: { isActive: !u.isActive } });
    load();
  }

  async function resetLink(id: string) {
    const res = await api<{ token: string }>(`/api/admin/users/${id}/reset-link`, { method: 'POST', json: {} });
    const url = `${window.location.origin}/reset/${res.token}`;
    prompt('Reset link (14-day expiry, single use):', url);
  }
</script>

<div class="flex justify-between items-center">
  <h1 class="text-2xl font-bold">Repairers &amp; admins</h1>
  <a href="/admin/repairers/new" class="btn-primary">Add repairer</a>
</div>

<div class="card mt-4 overflow-x-auto">
  <table class="w-full text-sm">
    <thead class="bg-slate-50 text-left text-slate-600">
      <tr>
        <th class="px-3 py-2">Name</th>
        <th class="px-3 py-2">Email</th>
        <th class="px-3 py-2">Role</th>
        <th class="px-3 py-2">Skills</th>
        <th class="px-3 py-2">Repairs</th>
        <th class="px-3 py-2">Active</th>
        <th class="px-3 py-2"></th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100">
      {#each users as u}
        <tr>
          <td class="px-3 py-2"><a href={`/admin/repairers/${u.id}`} class="text-brand-700 hover:underline">{u.displayName}</a></td>
          <td class="px-3 py-2">{u.email}</td>
          <td class="px-3 py-2"><span class="badge bg-slate-100 text-slate-700">{u.role}</span></td>
          <td class="px-3 py-2 text-xs text-slate-600">{(u.skills || []).length} skill{(u.skills || []).length === 1 ? '' : 's'}</td>
          <td class="px-3 py-2">{u.repairCountCache}</td>
          <td class="px-3 py-2"><button class="badge {u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}" on:click={() => toggleActive(u)}>{u.isActive ? 'Yes' : 'No'}</button></td>
          <td class="px-3 py-2 text-right"><button class="btn-ghost btn-sm" on:click={() => resetLink(u.id)}>Reset link</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
