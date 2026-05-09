<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { LogIn } from 'lucide-svelte';

  let email = '';
  let password = '';
  let busy = false;
  let error = '';

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      const body = await api<{ accessToken: string; user: any }>('/api/auth/login', {
        method: 'POST',
        json: { email: email.trim(), password },
        autoRefresh: false,
      });
      auth.set({ accessToken: body.accessToken, user: body.user });
      const dest = body.user.role === 'repairer' ? '/repairer' : '/admin/dashboard';
      goto(dest);
    } catch (err: any) {
      error = err?.message || 'Could not sign in';
    } finally {
      busy = false;
    }
  }
</script>

<main class="min-h-screen grid place-items-center bg-slate-100 px-4 py-12">
  <form on:submit={submit} class="card p-8 w-full max-w-sm">
    <h1 class="text-2xl font-semibold">Sign in</h1>
    <p class="mt-1 text-sm text-slate-600">For repairers and admins.</p>
    <div class="mt-6 space-y-4">
      <div>
        <label class="label" for="email">Email</label>
        <input id="email" class="input" type="email" autocomplete="email" required bind:value={email} />
      </div>
      <div>
        <label class="label" for="password">Password</label>
        <input id="password" class="input" type="password" autocomplete="current-password" required bind:value={password} />
      </div>
      {#if error}<p class="text-sm text-rose-600">{error}</p>{/if}
      <button class="btn-primary w-full" disabled={busy} type="submit">
        <LogIn size={18} /> Sign in
      </button>
    </div>
    <a href="/" class="block text-center mt-6 text-sm text-slate-500 hover:underline">Back to home</a>
  </form>
</main>
