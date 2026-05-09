<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';

  $: token = $page.params.token;
  let password = '';
  let confirm = '';
  let error = '';
  let busy = false;

  async function submit() {
    error = '';
    if (password !== confirm) { error = 'Passwords do not match'; return; }
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
      error = e?.message || 'Reset link expired or invalid';
    } finally { busy = false; }
  }
</script>

<div class="max-w-sm mx-auto mt-12 card p-6">
  <h1 class="text-xl font-bold">Set your password</h1>
  <p class="text-sm text-slate-600 mt-1">Choose a strong password (10+ chars, mixed case &amp; number).</p>
  <div class="mt-4 space-y-3">
    <div><label class="label" for="p1">New password</label><input id="p1" class="input" type="password" bind:value={password} /></div>
    <div><label class="label" for="p2">Confirm</label><input id="p2" class="input" type="password" bind:value={confirm} /></div>
    {#if error}<p class="text-rose-600 text-sm">{error}</p>{/if}
    <button class="btn-primary w-full" on:click={submit} disabled={busy}>Set password &amp; sign in</button>
  </div>
</div>
