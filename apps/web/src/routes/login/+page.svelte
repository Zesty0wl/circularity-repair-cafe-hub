<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api, restoreSession } from '$lib/api';
  import { auth, type AuthUser } from '$lib/stores/auth';
  import { safeNext } from '$lib/staff/nav';
  import { LogIn } from 'lucide-svelte';

  let email = '';
  let password = '';
  let busy = false;
  let error = '';

  // Back to the page that sent you here, if you may open it. Otherwise your
  // usual starting page: the dashboard for admins, the queue for repairers.
  function destinationFor(user: AuthUser): string {
    return safeNext($page.url.searchParams.get('next'), user);
  }

  onMount(async () => {
    // If the user still has a valid session, skip the form.
    await restoreSession();
    if ($auth) goto(destinationFor($auth.user), { replaceState: true });
  });

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
      goto(destinationFor(body.user), { replaceState: true });
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
    {#if $page.url.searchParams.get('next')}
      <p class="mt-3 text-sm rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-slate-700">Sign in to carry on where you were.</p>
    {/if}
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
