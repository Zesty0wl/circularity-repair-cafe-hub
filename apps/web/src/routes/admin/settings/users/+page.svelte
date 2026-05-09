<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let users: any[] = [];
  async function load() { users = await api('/api/admin/users'); }
  onMount(load);
</script>

<a href="/admin/settings" class="text-sm text-slate-600 hover:underline">← Settings</a>
<div class="flex justify-between items-center mt-1">
  <h1 class="text-2xl font-bold">Users</h1>
  <a href="/admin/repairers/new" class="btn-primary">Add user</a>
</div>

<div class="card mt-4 overflow-x-auto">
  <table class="w-full text-sm">
    <thead class="bg-slate-50 text-left text-slate-600">
      <tr><th class="px-3 py-2">Name</th><th class="px-3 py-2">Email</th><th class="px-3 py-2">Role</th><th class="px-3 py-2">Active</th></tr>
    </thead>
    <tbody class="divide-y divide-slate-100">
      {#each users as u}
        <tr>
          <td class="px-3 py-2"><a href={`/admin/repairers/${u.id}`} class="text-brand-700 hover:underline">{u.displayName}</a></td>
          <td class="px-3 py-2">{u.email}</td>
          <td class="px-3 py-2"><span class="badge bg-slate-100 text-slate-700">{u.role}</span></td>
          <td class="px-3 py-2"><span class="badge {u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">{u.isActive ? 'Yes' : 'No'}</span></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
