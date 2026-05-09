<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth';

  $: id = $page.params.id;
  let user: any = null;
  let categories: any[] = [];
  let busy = false;
  let error = '';

  let displayName = ''; let email = ''; let role = 'repairer';
  let bio = ''; let isActive = true; let skills: string[] = [];

  async function load() {
    [user, categories] = await Promise.all([
      api(`/api/admin/users/${id}`),
      api('/api/admin/skill-categories'),
    ]);
    displayName = user.displayName; email = user.email; role = user.role;
    bio = user.bio ?? ''; isActive = user.isActive; skills = user.skills ?? [];
  }

  onMount(load);

  async function save() {
    busy = true; error = '';
    try {
      await api(`/api/admin/users/${id}`, {
        method: 'PATCH',
        json: { displayName, email, role, bio: bio || null, isActive, skills },
      });
      await load();
    } catch (e: any) { error = e?.message || 'Could not save'; }
    finally { busy = false; }
  }

  async function resetLink() {
    const res = await api<{ token: string }>(`/api/admin/users/${id}/reset-link`, { method: 'POST', json: {} });
    prompt('Reset link (14-day expiry, single use):', `${window.location.origin}/reset/${res.token}`);
  }

  async function del() {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return;
    try {
      await api(`/api/admin/users/${id}`, { method: 'DELETE' });
      goto('/admin/repairers');
    } catch (e: any) { alert(e?.message || 'Could not delete'); }
  }
</script>

{#if user}
  <a href="/admin/repairers" class="text-sm text-slate-600 hover:underline">← Back to list</a>
  <h1 class="text-2xl font-bold mt-1">{user.displayName}</h1>

  <div class="card p-6 mt-4 max-w-xl space-y-4">
    <div><label class="label" for="dn">Display name</label><input id="dn" class="input" bind:value={displayName} /></div>
    <div><label class="label" for="em">Email</label><input id="em" type="email" class="input" bind:value={email} /></div>
    <div><label class="label" for="ro">Role</label>
      <select id="ro" class="input" bind:value={role}>
        <option value="repairer">Repairer</option>
        <option value="admin">Admin</option>
        {#if $auth?.user.role === 'super_admin'}<option value="super_admin">Super admin</option>{/if}
      </select>
    </div>
    <div><label class="label" for="bi">Bio</label><textarea id="bi" class="input" rows="2" bind:value={bio}></textarea></div>
    <label class="flex items-center gap-2"><input type="checkbox" bind:checked={isActive} /> Active</label>
    <div>
      <span class="label">Skills</span>
      <div class="grid grid-cols-2 gap-2">
        {#each categories as c}
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" value={c.id} bind:group={skills} /> {c.name}</label>
        {/each}
      </div>
    </div>
    {#if error}<p class="text-rose-600 text-sm">{error}</p>{/if}
    <div class="flex justify-between">
      <button class="btn-ghost" on:click={resetLink}>Generate password reset link</button>
      <button class="btn-primary" on:click={save} disabled={busy}>Save</button>
    </div>
  </div>

  {#if $auth?.user.role === 'super_admin' && user.id !== $auth.user.id}
    <div class="card p-4 mt-4 max-w-xl border-rose-200">
      <button class="btn-danger" on:click={del}>Delete user</button>
      <p class="text-xs text-slate-500 mt-2">Cannot delete users who have repaired items.</p>
    </div>
  {/if}
{/if}
