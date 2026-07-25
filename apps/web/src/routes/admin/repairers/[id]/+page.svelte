<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth';
  import { ArrowLeft, ExternalLink, Upload, Trash2, Eye, EyeOff } from 'lucide-svelte';

  $: id = $page.params.id;
  let user: any = null;
  let categories: any[] = [];
  let busy = false;
  let uploading = false;
  let error = '';
  let uploadError = '';

  let displayName = ''; let email = ''; let role = 'repairer';
  let bio = ''; let isActive = true; let skills: string[] = [];
  let showOnPublicPage = true;
  let showOnHomePage = true;

  async function load() {
    [user, categories] = await Promise.all([
      api<any>(`/api/admin/users/${id}`),
      api<any[]>('/api/admin/skill-categories'),
    ]);
    displayName = user.displayName; email = user.email; role = user.role;
    bio = user.bio ?? ''; isActive = user.isActive; skills = user.skills ?? [];
    showOnPublicPage = user.showOnPublicPage ?? true;
    showOnHomePage = user.showOnHomePage ?? true;
  }

  onMount(load);

  async function save() {
    busy = true; error = '';
    try {
      await api(`/api/admin/users/${id}`, {
        method: 'PATCH',
        json: { displayName, email, role, bio: bio || null, isActive, skills, showOnPublicPage, showOnHomePage },
      });
      await load();
    } catch (e: any) { error = e?.message || 'Could not save'; }
    finally { busy = false; }
  }

  async function uploadAvatar(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    uploadError = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ url: string }>(`/api/admin/uploads/avatar/${id}`, { method: 'POST', formData: fd });
      user.avatarUrl = r.url;
      user = user;
    } catch (err: any) {
      uploadError = err?.message || 'Could not upload photo';
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  async function removeAvatar() {
    if (!user?.avatarUrl) return;
    if (!confirm('Remove this photo?')) return;
    uploadError = '';
    try {
      await api(`/api/admin/uploads/avatar/${id}`, { method: 'DELETE' });
      user.avatarUrl = null;
      user = user;
    } catch (err: any) {
      uploadError = err?.message || 'Could not remove photo';
    }
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

  function initials(name: string): string {
    return (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!)
      .join('')
      .toUpperCase();
  }

  $: publicVisible = user && user.isActive && user.showOnPublicPage;
</script>

{#if user}
  <a href="/admin/repairers" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={14} /> Back to list</a>
  <div class="mt-1 flex items-start justify-between gap-3 flex-wrap">
    <h1 class="text-2xl font-bold">{user.displayName}</h1>
    {#if publicVisible}
      <a href="/team/{user.id}" target="_blank" rel="noopener" class="btn-secondary btn-sm">
        <ExternalLink size={14} /> View public profile
      </a>
    {:else}
      <span class="text-xs text-slate-500 inline-flex items-center gap-1">
        <EyeOff size={14} /> Public profile is hidden
      </span>
    {/if}
  </div>

  <!-- Profile photo -->
  <div class="card p-6 mt-4 max-w-2xl">
    <p class="kicker">Profile photo</p>
    <div class="mt-3 flex items-center gap-4">
      {#if user.avatarUrl}
        <img src={user.avatarUrl} alt="" class="h-20 w-20 rounded-2xl object-cover ring-1 ring-slate-200" />
      {:else}
        <div class="h-20 w-20 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center text-2xl font-bold">
          {initials(displayName || user.displayName)}
        </div>
      {/if}
      <div class="flex flex-col gap-2">
        <label class="btn-secondary btn-sm cursor-pointer">
          <Upload size={14} /> {user.avatarUrl ? 'Change photo' : 'Upload photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" on:change={uploadAvatar} disabled={uploading} />
        </label>
        {#if user.avatarUrl}
          <button class="btn-ghost btn-sm text-rose-600" on:click={removeAvatar}>
            <Trash2 size={14} /> Remove
          </button>
        {/if}
      </div>
    </div>
    {#if uploading}<p class="text-xs text-slate-500 mt-2">Uploading…</p>{/if}
    {#if uploadError}<p class="text-xs text-rose-600 mt-2">{uploadError}</p>{/if}
    <p class="text-xs text-slate-400 mt-3">JPEG, PNG or WebP. Square photos look best.</p>
  </div>

  <div class="card p-6 mt-4 max-w-2xl space-y-4">
    <div><label class="label" for="dn">Display name</label><input id="dn" class="input" bind:value={displayName} /></div>
    <div><label class="label" for="em">Email</label><input id="em" type="email" class="input" bind:value={email} /></div>
    <div><label class="label" for="ro">Role</label>
      <select id="ro" class="input" bind:value={role}>
        <option value="repairer">Repairer</option>
        <option value="admin">Admin</option>
        {#if $auth?.user.role === 'super_admin'}<option value="super_admin">Super admin</option>{/if}
      </select>
    </div>
    <div>
      <label class="label" for="bi">Bio</label>
      <textarea id="bi" class="input" rows="4" maxlength="2000" bind:value={bio}></textarea>
      <p class="text-xs text-slate-500 mt-1">Shown on their public profile page. {bio.length}/2000 characters.</p>
    </div>
    <div class="space-y-2 border-t border-slate-200 pt-4">
      <label class="flex items-center gap-2"><input type="checkbox" bind:checked={isActive} /> Active (can sign in and work events)</label>
      <label class="flex items-start gap-2">
        <input type="checkbox" class="mt-0.5" bind:checked={showOnPublicPage} />
        <span class="text-sm">
          <span class="font-medium inline-flex items-center gap-1.5">
            {#if showOnPublicPage}<Eye size={14} class="text-emerald-600" />{:else}<EyeOff size={14} class="text-slate-400" />{/if}
            Show on the public Skills &amp; Team page
          </span>
          <span class="block text-xs text-slate-500">When off, their card is hidden and the public profile URL returns "not found".</span>
        </span>
      </label>
      <label class="flex items-start gap-2">
        <input type="checkbox" class="mt-0.5" bind:checked={showOnHomePage} disabled={!showOnPublicPage} />
        <span class="text-sm">
          <span class="font-medium inline-flex items-center gap-1.5">
            {#if showOnHomePage && showOnPublicPage}<Eye size={14} class="text-emerald-600" />{:else}<EyeOff size={14} class="text-slate-400" />{/if}
            Feature in the home page "Meet our team" strip
          </span>
          <span class="block text-xs text-slate-500">
            {#if !showOnPublicPage}Requires "Show on the public Skills &amp; Team page" to be on.{:else}When off, this volunteer still appears on the team listing but isn't featured on the home page.{/if}
          </span>
        </span>
      </label>
    </div>
    <div>
      <span class="label">Skills</span>
      <div class="grid grid-cols-2 gap-2">
        {#each categories as c}
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" value={c.id} bind:group={skills} /> {c.name}</label>
        {/each}
      </div>
    </div>
    {#if error}<p class="text-rose-600 text-sm">{error}</p>{/if}
    <div class="flex justify-between gap-2 flex-wrap">
      <button class="btn-ghost" on:click={resetLink}>Generate password reset link</button>
      <button class="btn-primary" on:click={save} disabled={busy}>Save</button>
    </div>
  </div>

  {#if $auth?.user.role === 'super_admin' && user.id !== $auth.user.id}
    <section class="mt-8 max-w-2xl">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-4">
        <div class="min-w-0">
          <p class="font-semibold text-rose-900">Delete this user</p>
          <p class="text-sm text-rose-700">This cannot be undone. Users who have repaired items cannot be deleted.</p>
        </div>
        <button class="btn-danger shrink-0" on:click={del}>Delete user</button>
      </div>
    </section>
  {/if}
{/if}
