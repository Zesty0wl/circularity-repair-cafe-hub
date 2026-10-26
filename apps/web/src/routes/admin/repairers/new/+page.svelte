<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { t, tNow } from '$lib/i18n';
  import { ArrowLeft, Laptop } from 'lucide-svelte';
  import { cafe } from '$lib/stores/cafe';

  let categories: any[] = [];
  let displayName = '';
  let email = '';
  let role: 'admin' | 'repairer' = 'repairer';
  let bio = '';
  let skills: string[] = [];
  /** Helps at Linux sessions. Only asked for when the cafe runs them. */
  let linuxRepairer = false;
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
        json: { displayName, email, role, bio: bio || null, skills, linuxRepairer },
      });
      result = { userId: res.user.id, token: res.resetToken };
    } catch (e: any) {
      error = e?.message || tNow('Could not create user');
    } finally {
      busy = false;
    }
  }
</script>

<a href="/admin/repairers" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={14} /> {$t('Back to list')}</a>
<h1 class="text-2xl font-bold mt-1">{$t('Add repairer')}</h1>

{#if result}
  <div class="card p-6 mt-4 max-w-2xl">
    <p class="font-semibold text-emerald-700">{$t('User created')}</p>
    <p class="mt-2 text-sm">{$t('Send them this single-use reset link (expires in 14 days):')}</p>
    <code class="mt-3 block break-all bg-slate-100 p-3 rounded-lg">{`${window.location.origin}/reset/${result.token}`}</code>
    <a href="/admin/repairers" class="btn-primary mt-4">{$t('Back to list')}</a>
  </div>
{:else}
  <div class="card p-6 mt-4 max-w-2xl space-y-4">
    <div>
      <label class="label" for="dn">{$t('Display name')}</label>
      <input id="dn" class="input" bind:value={displayName} />
    </div>
    <div>
      <label class="label" for="em">{$t('Email')}</label>
      <input id="em" type="email" class="input" bind:value={email} />
    </div>
    <div>
      <label class="label" for="ro">{$t('Role')}</label>
      <select id="ro" class="input" bind:value={role}>
        <option value="repairer">{$t('Repairer')}</option>
        <option value="admin">{$t('Admin')}</option>
      </select>
    </div>
    <div>
      <label class="label" for="bi">{$t('Short bio (optional)')}</label>
      <textarea id="bi" class="input" rows="2" bind:value={bio}></textarea>
    </div>
    <div>
      <span class="label">{$t('Skills')}</span>
      <div class="grid grid-cols-2 gap-2">
        {#each categories as c}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" value={c.id} bind:group={skills} /> {$t(c.name)}
          </label>
        {/each}
      </div>
    </div>
    {#if $cafe?.linuxEnabled}
      <div class="border-t border-slate-200 pt-4">
        <span class="label">{$t('Linux Repair Cafe')}</span>
        <label class="flex items-start gap-2">
          <input type="checkbox" class="mt-0.5" bind:checked={linuxRepairer} />
          <span class="text-sm">
            <span class="font-medium inline-flex items-center gap-1.5">
              <Laptop size={14} class={linuxRepairer ? 'text-emerald-600' : 'text-slate-400'} />
              {$t('Helps at Linux sessions')}
            </span>
            <span class="block text-xs text-slate-500">
              {$t('Lists them on your Linux Repair Cafe page as somebody who can help.')}
            </span>
          </span>
        </label>
      </div>
    {/if}
    {#if error}<p class="text-rose-600 text-sm">{error}</p>{/if}
    <div class="flex justify-end"><button class="btn-primary" on:click={submit} disabled={busy}>{$t('Create')}</button></div>
  </div>
{/if}
