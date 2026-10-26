<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { t, tNow } from '$lib/i18n';

  $: token = $page.params.token;
  let password = '';
  let confirm = '';
  let error = '';
  let busy = false;

  async function submit() {
    error = '';
    if (password !== confirm) { error = tNow('Passwords do not match'); return; }
    busy = true;
    try {
      const res = await api<{ accessToken: string; user: { role: string } }>(`/api/auth/reset/${token}`, {
        method: 'POST',
        json: { password },
        autoRefresh: false,
      });
      auth.set({ accessToken: res.accessToken, user: res.user as any });
      goto(res.user.role === 'repairer' ? '/repairer' : '/admin/dashboard');
    } catch (e: any) {
      error = e?.message || tNow('Reset link expired or invalid');
    } finally { busy = false; }
  }
</script>

<main class="min-h-screen grid place-items-center bg-slate-100 px-4 py-12">
  <div class="card p-8 w-full max-w-sm">
    <h1 class="text-2xl font-semibold">{$t('Set your password')}</h1>
    <p class="mt-1 text-sm text-slate-600">{$t('Use at least 10 characters, with upper and lower case letters and a number.')}</p>
    <div class="mt-6 space-y-4">
      <div><label class="label" for="p1">{$t('New password')}</label><input id="p1" class="input" type="password" bind:value={password} /></div>
      <div><label class="label" for="p2">{$t('Confirm password')}</label><input id="p2" class="input" type="password" bind:value={confirm} /></div>
      {#if error}<p class="text-sm text-rose-600">{error}</p>{/if}
      <button class="btn-primary w-full" on:click={submit} disabled={busy}>{$t('Set password and sign in')}</button>
    </div>
  </div>
</main>
