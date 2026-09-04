<script lang="ts">
  import { goto } from '$app/navigation';
  import { afterNavigate } from '$app/navigation';
  import { auth, type AuthState } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import { LogOut, Wrench, Menu, X, Laptop } from 'lucide-svelte';
  import { api } from '$lib/api';

  export let variant: 'public' | 'admin' | 'repairer' = 'public';
  export let user: AuthState['user'] | null = null;

  let mobileOpen = false;

  // The Linux Repair Cafe menu item, which only exists for cafes that offer
  // it. Admins can rename it, so a cafe that calls it something else in its
  // own town is not stuck with our wording.
  $: linuxEnabled = $cafe?.linuxEnabled === true;
  $: linuxLabel = $cafe?.linuxPage?.navLabel?.trim() || 'Linux Repair Cafe';

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
      <!-- Only the cafe's own name and logo here. The Circularity credit
           lives in the footer. Most cafe logos are wide wordmarks, so we give
           the image its own width and cap it, rather than squashing it into a
           square. -->
      <a href="/" class="flex items-center gap-3 text-slate-900 font-semibold text-lg min-w-0">
        {#if $cafe?.logoUrl}
          <img src={$cafe.logoUrl} alt="" class="h-10 w-auto max-w-[9rem] rounded-lg object-contain shrink-0" />
        {:else}
          <span class="h-10 w-10 rounded-lg bg-brand-600 text-white inline-flex items-center justify-center shrink-0"><Wrench size={18} /></span>
        {/if}
        <span class="truncate">{$cafe?.name || 'Repair Cafe'}</span>
      </a>
    </div>

    <!-- Desktop nav -->
    <nav class="hidden md:flex items-center gap-2 text-sm">
      {#if variant === 'public'}
        <a href="/" class="px-3 py-2 rounded-lg hover:bg-slate-100">Home</a>
        <a href="/events" class="px-3 py-2 rounded-lg hover:bg-slate-100">Events</a>
        <a href="/skills" class="px-3 py-2 rounded-lg hover:bg-slate-100 whitespace-nowrap">Skills &amp; Team</a>
        <a href="/guides" class="px-3 py-2 rounded-lg hover:bg-slate-100 whitespace-nowrap">Repair guides</a>
        <a href="/world" class="px-3 py-2 rounded-lg hover:bg-slate-100">Worldwide</a>
        <a href="/about" class="px-3 py-2 rounded-lg hover:bg-slate-100">About</a>
        <a href="/contact" class="px-3 py-2 rounded-lg hover:bg-slate-100">Contact</a>
        {#if linuxEnabled}
          <!-- Its own menu, styled apart from the rest. A Linux Repair Cafe is
               a different offer from a repair session, and a visitor looking
               for it should be able to see it at a glance. -->
          <a
            href="/linux"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap font-medium text-brand-800 bg-brand-50 ring-1 ring-brand-200 hover:bg-brand-100"
          >
            <Laptop size={16} /> {linuxLabel}
          </a>
        {/if}
        {#if $auth}
          {#if $auth.user.role === 'admin' || $auth.user.role === 'super_admin'}
            <a href="/admin/dashboard" class="btn-primary btn-sm">Admin</a>
          {:else}
            <a href="/repairer" class="btn-primary btn-sm">Repairer</a>
          {/if}
        {:else}
          <a href="/login" class="btn-secondary btn-sm">Sign in</a>
        {/if}
      {:else if user}
        {#if variant === 'repairer'}
          <a href="/repairer" class="px-3 py-2 rounded-lg hover:bg-slate-100">Dashboard</a>
          <a href="/repairer/checkin" class="px-3 py-2 rounded-lg hover:bg-slate-100 whitespace-nowrap">Register a repair</a>
          <a href="/repairer/photos" class="px-3 py-2 rounded-lg hover:bg-slate-100">Photos</a>
          <a href="/repairer/profile" class="px-3 py-2 rounded-lg hover:bg-slate-100">My profile</a>
        {/if}
        <span class="text-slate-600">{user.displayName}</span>
        <button class="btn-ghost btn-sm" on:click={logout}>
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
          <a href="/guides" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Repair guides</a>
          <a href="/world" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Worldwide</a>
          <a href="/about" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">About</a>
          <a href="/contact" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Contact</a>
          {#if linuxEnabled}
            <a
              href="/linux"
              class="mt-2 inline-flex items-center gap-2 px-3 py-3 rounded-lg font-medium text-brand-800 bg-brand-50 ring-1 ring-brand-200 hover:bg-brand-100"
            >
              <Laptop size={16} /> {linuxLabel}
            </a>
          {/if}
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
            <a href="/repairer/checkin" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Register a repair</a>
            <a href="/repairer/photos" class="px-3 py-3 rounded-lg hover:bg-slate-100 text-slate-800">Photos</a>
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
