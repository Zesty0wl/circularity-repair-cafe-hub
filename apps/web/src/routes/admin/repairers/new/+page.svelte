<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let categories: any[] = [];
  let displayName = '';
  let email = '';
  let role: 'admin' | 'repairer' = 'repairer';
  let bio = '';
  let skills: string[] = [];
  let busy = false;
  let result: { token: string; userId: string } | null = null;
  let error = '';

  onMount(async () => {
    categories = await api('/api/admin/skill-categories');
  });

  async function submit() {
    busy = true; error = '';
    try {
      const res = await api<{ user: { id: string }; resetToken: string }>('/api/admin/users', {
        method: 'POST',
        json: { displayName, email, role, bio: bio || null, skills },
      });
      result = { userId: res.user.id, token: res.resetToken };
    } catch (e: any) {
      error = e?.message || 'Could not create user';
    } finally {
      busy = false;
    }
  }
</script>

<a href="/admin/repairers" class="text-sm text-slate-600 hover:underline">← Back to list</a>
<h1 class="text-2xl font-bold mt-1">Add repairer</h1>

{#if result}
  <div class="card p-6 mt-4 max-w-xl">
    <p class="font-semibold text-emerald-700">User created</p>
    <p class="mt-2 text-sm">Send them this single-use reset link (expires in 14 days):</p>
    <code class="mt-3 block break-all bg-slate-100 p-3 rounded">{`${window.location.origin}/reset/${result.token}`}</code>
    <a href="/admin/repairers" class="btn-primary mt-4">Back to list</a>
  </div>
{:else}
  <div class="card p-6 mt-4 max-w-xl space-y-4">
    <div>
      <label class="label" for="dn">Display name</label>
      <input id="dn" class="input" bind:value={displayName} />
    </div>
    <div>
      <label class="label" for="em">Email</label>
      <input id="em" type="email" class="input" bind:value={email} />
    </div>
    <div>
      <label class="label" for="ro">Role</label>
      <select id="ro" class="input" bind:value={role}>
        <option value="repairer">Repairer</option>
        <option value="admin">Admin</option>
      </select>
    </div>
    <div>
      <label class="label" for="bi">Short bio (optional)</label>
      <textarea id="bi" class="input" rows="2" bind:value={bio}></textarea>
    </div>
    <div>
      <span class="label">Skills</span>
      <div class="grid grid-cols-2 gap-2">
        {#each categories as c}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" value={c.id} bind:group={skills} /> {c.name}
          </label>
        {/each}
      </div>
    </div>
    {#if error}<p class="text-rose-600 text-sm">{error}</p>{/if}
    <div class="flex justify-end"><button class="btn-primary" on:click={submit} disabled={busy}>Create</button></div>
  </div>
{/if}
