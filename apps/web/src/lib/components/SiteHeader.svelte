<script lang="ts">
  import { goto } from '$app/navigation';
  import { afterNavigate } from '$app/navigation';
  import { auth, type AuthState } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import { LogOut, Wrench, Menu, X } from 'lucide-svelte';
  import { api } from '$lib/api';

  export let variant: 'public' | 'admin' | 'repairer' = 'public';
  export let user: AuthState['user'] | null = null;

  let mobileOpen = false;

  afterNavigate(() => {
    mobileOpen = false;
  });

  async function logout() {
    mobileOpen = false;
    await api('/api/auth/logout', { method: 'POST', autoRefresh: false }).catch(() => {});
    auth.set(null);
    goto('/');
  }
</script>

<header class="bg-white shadow-sm border-b border-slate-200 no-print sticky top-0 z-30">
  <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
    <div class="flex items-center gap-3 min-w-0">
      <a href="/" class="flex items-center gap-3 text-slate-900 font-semibold text-lg min-w-0">
        {#if $cafe?.logoUrl}
          <img src={$cafe.logoUrl} alt="" class="h-9 w-9 rounded-lg object-contain shrink-0" />
        {:else}
          <span class="h-9 w-9 rounded-lg bg-brand-600 text-white inline-flex items-center justify-center shrink-0"><Wrench size={18} /></span>
        {/if}
        <span class="truncate">{$cafe?.name || 'Repair Cafe'}</span>
      </a>
      <span class="hidden lg:block h-8 w-px bg-slate-200 shrink-0" aria-hidden="true"></span>
      <a
        href="https://circularity.org"
        target="_blank"
        rel="noopener"
        class="hidden lg:inline-flex items-center gap-1.5 text-xs font-normal text-slate-500 hover:text-slate-700 shrink-0"
      >
        <span>Powered by</span>
        <img src="/brand/logo-horizontal.svg" alt="Circularity.org" class="h-7 w-auto" />
      </a>
    </div>

    <!-- Desktop nav -->
    <nav class="hidden md:flex items-center gap-2 text-sm">
      {#if variant === 'public'}
        <a href="/" class="px-3 py-2 rounded-lg hover:bg-slate-100">Home</a>
        <a href="/events" class="px-3 py-2 rounded-lg hover:bg-slate-100">Events</a>
        <a href="/skills" class="px-3 py-2 rounded-lg hover:bg-slate-100 whitespace-nowrap">Skills &amp; Team</a>
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
        {#if variant === 'repairer'}
          <a href="/repairer" class="px-3 py-2 rounded-lg hover:bg-slate-100">Dashboard</a>
          <a href="/repairer/profile" class="px-3 py-2 rounded-lg hover:bg-slate-100">My profile</a>
        {/if}
        <span class="text-slate-600">{user.displayName}</span>
        <button class="btn-ghost !px-3 !py-2 text-sm" on:click={logout}>
          <LogOut size={16} /> <span>Sign out</span>
        </button>
      {/if}
    </nav>

    <!-- Mobile trigger -->
    <button
      type="button"
      class="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
      aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={mobileOpen}
      aria-controls="site-mobile-nav"
      on:click={() => (mobileOpen = !mobileOpen)}
    >
      {#if mobileOpen}
        <X size={22} />
      {:else}
        <Menu size={22} />
      {/if}
    </button>
  </div>

  <!-- Mobile drawer -->
  {#if mobileOpen}
    <nav
      id="site-mobile-nav"
      class="md:hidden border-t border-slate-200 bg-white shadow-sm"
    >
      <div class="max-w-6xl mx-auto px-4 py-2 flex flex-col">
        {#if variant === 'public'}
          <a href="/" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Home</a>
          <a href="/events" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Events</a>
          <a href="/skills" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Skills &amp; Team</a>
          <a href="/contact" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Contact</a>
          <div class="h-px bg-slate-200 my-2"></div>
          {#if $auth}
            {#if $auth.user.role === 'admin' || $auth.user.role === 'super_admin'}
              <a href="/admin/dashboard" class="btn-primary !py-3 text-center">Admin</a>
            {:else}
              <a href="/repairer" class="btn-primary !py-3 text-center">Repairer</a>
            {/if}
          {:else}
            <a href="/login" class="btn-secondary !py-3 text-center">Sign in</a>
          {/if}
        {:else if user}
          {#if variant === 'repairer'}
            <a href="/repairer" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Dashboard</a>
            <a href="/repairer/profile" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">My profile</a>
            <div class="h-px bg-slate-200 my-2"></div>
          {/if}
          <div class="px-3 py-3 text-slate-600 text-sm">Signed in as <span class="font-medium text-slate-800">{user.displayName}</span></div>
          <button class="btn-ghost !py-3 justify-center" on:click={logout}>
            <LogOut size={16} /> <span>Sign out</span>
          </button>
        {/if}
      </div>
    </nav>
  {/if}
</header>
