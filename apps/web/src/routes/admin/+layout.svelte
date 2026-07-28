<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth, isAdmin } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import { LayoutDashboard, Calendar, Users, Wrench, BarChart3, Tags, MapPin, Settings, LogOut, Menu, X, MonitorPlay, UserCircle2, Globe } from 'lucide-svelte';
  import { api, restoreSession } from '$lib/api';
  import UpdateBanner from '$lib/components/UpdateBanner.svelte';

  let sidebarOpen = false;

  onMount(async () => {
    // Wait for the session restore before deciding the user is signed out,
    // otherwise every page refresh bounces signed-in users to /login.
    await restoreSession();
    if (!$auth || !isAdmin($auth)) {
      goto('/login');
    }
  });

  const items = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/events', label: 'Events', icon: Calendar },
    { href: '/admin/repairs', label: 'Repairs', icon: Wrench },
    { href: '/admin/board', label: 'Live board', icon: MonitorPlay },
    { href: '/admin/repairers', label: 'Repairers', icon: Users },
    { href: '/admin/stats', label: 'Statistics', icon: BarChart3 },
    { href: '/admin/skills', label: 'Skills', icon: Tags },
    { href: '/admin/venues', label: 'Venues', icon: MapPin },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', autoRefresh: false }).catch(() => {});
    auth.set(null);
    goto('/');
  }
</script>

{#if $auth && isAdmin($auth)}
  <div class="min-h-screen flex bg-slate-100">
    <aside class="hidden md:flex md:flex-col w-60 bg-white border-r border-slate-200">
      <div class="px-5 py-4 border-b border-slate-200">
        <p class="font-bold">Admin</p>
        <p class="text-xs text-slate-500 truncate">{$auth.user.displayName}</p>
      </div>
      <nav class="flex-1 p-3 space-y-1 text-sm">
        {#each items as it}
          <a href={it.href} class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700">
            <svelte:component this={it.icon} size={16} /> {it.label}
          </a>
        {/each}
      </nav>
      <!-- The way back to the cafe's own site. The narrow-screen header has had
           one all along; on a laptop there was no way out of the admin area
           except the browser's back button. -->
      <a href="/" class="mx-3 text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700">
        <Globe size={16} /> View site
      </a>
      <a href="/repairer/profile" class="mx-3 text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700">
        <UserCircle2 size={16} /> My profile
      </a>
      <button on:click={logout} class="mx-3 text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700">
        <LogOut size={16} /> Sign out
      </button>
      <!-- Which version this hub is on. Worth having in front of an admin: it
           is the first thing anybody helping them will ask for. -->
      <a
        href="/admin/settings?tab=about"
        class="m-3 mt-2 pt-3 border-t border-slate-200 text-xs text-slate-400 hover:text-slate-600"
        title="Version, licence and how to update"
      >
        Repair Cafe Hub {$cafe?.appVersion ?? ''}
      </a>
    </aside>

    <!-- Mobile -->
    {#if sidebarOpen}
      <div class="md:hidden fixed inset-0 bg-slate-900/50 z-40" on:click={() => (sidebarOpen = false)}></div>
      <aside class="md:hidden fixed inset-y-0 left-0 w-64 bg-white z-50 flex flex-col">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span class="font-bold">Admin</span>
          <button on:click={() => (sidebarOpen = false)}><X size={20} /></button>
        </div>
        <nav class="flex-1 p-3 space-y-1 text-sm">
          {#each items as it}
            <a href={it.href} on:click={() => (sidebarOpen = false)} class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700">
              <svelte:component this={it.icon} size={16} /> {it.label}
            </a>
          {/each}
        </nav>
        <a href="/" on:click={() => (sidebarOpen = false)} class="mx-3 text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100"><Globe size={16} /> View site</a>
        <a href="/repairer/profile" on:click={() => (sidebarOpen = false)} class="mx-3 text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100"><UserCircle2 size={16} /> My profile</a>
        <button on:click={logout} class="mx-3 text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100"><LogOut size={16} /> Sign out</button>
        <a href="/admin/settings?tab=about" on:click={() => (sidebarOpen = false)} class="m-3 mt-2 pt-3 border-t border-slate-200 text-xs text-slate-400">
          Repair Cafe Hub {$cafe?.appVersion ?? ''}
        </a>
      </aside>
    {/if}

    <div class="flex-1 min-w-0">
      <div class="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <button class="btn-ghost !px-2" on:click={() => (sidebarOpen = true)} aria-label="Open menu"><Menu size={20} /></button>
        <span class="font-semibold">Admin</span>
        <a href="/" class="text-sm text-brand-700">Site</a>
      </div>
      <!-- Centred in the space next to the sidebar so wide screens stay balanced. -->
      <main class="p-4 md:p-8 max-w-6xl mx-auto">
        <UpdateBanner />
        <slot />
      </main>
    </div>
  </div>
{/if}
