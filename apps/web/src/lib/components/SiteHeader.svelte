<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth, type AuthState } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import { LogOut, Wrench } from 'lucide-svelte';
  import { api } from '$lib/api';

  export let variant: 'public' | 'admin' | 'repairer' = 'public';
  export let user: AuthState['user'] | null = null;

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', autoRefresh: false }).catch(() => {});
    auth.set(null);
    goto('/');
  }
</script>

<header class="bg-white shadow-sm border-b border-slate-200 no-print">
  <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
    <a href="/" class="flex items-center gap-3 text-slate-900 font-semibold text-lg">
      {#if $cafe?.logoUrl}
        <img src={$cafe.logoUrl} alt="" class="h-9 w-9 rounded-lg object-contain" />
      {:else}
        <span class="h-9 w-9 rounded-lg bg-brand-600 text-white inline-flex items-center justify-center"><Wrench size={18} /></span>
      {/if}
      <span class="hidden sm:inline">{$cafe?.name || 'Repair Cafe'}</span>
    </a>
    <nav class="flex items-center gap-1 sm:gap-3 text-sm">
      {#if variant === 'public'}
        <a href="/" class="px-3 py-2 rounded-lg hover:bg-slate-100">Home</a>
        <a href="/events" class="px-3 py-2 rounded-lg hover:bg-slate-100">Events</a>
        <a href="/skills" class="px-3 py-2 rounded-lg hover:bg-slate-100">Skills &amp; Team</a>
        <a href="/contact" class="px-3 py-2 rounded-lg hover:bg-slate-100">Contact</a>
        {#if $auth}
          {#if $auth.user.role === 'admin' || $auth.user.role === 'super_admin'}
            <a href="/admin/dashboard" class="btn-primary !px-4 !py-2 text-sm">Admin</a>
          {:else}
            <a href="/repairer" class="btn-primary !px-4 !py-2 text-sm">Repairer</a>
          {/if}
        {:else}
          <a href="/login" class="btn-secondary !px-4 !py-2 text-sm">Sign in</a>
        {/if}
      {:else if user}
        <span class="hidden sm:inline text-slate-600">{user.displayName}</span>
        <button class="btn-ghost !px-3 !py-2 text-sm" on:click={logout}>
          <LogOut size={16} /> <span class="hidden sm:inline">Sign out</span>
        </button>
      {/if}
    </nav>
  </div>
</header>
