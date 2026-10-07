<script lang="ts">
  // The frame round every page staff see after signing in: the admin area and
  // the repairer area alike. See $lib/staff/nav.ts for why it is one frame.
  //
  // It also looks after being signed in:
  //   - nobody signed in: off to the sign-in page, which brings them straight
  //     back here afterwards
  //   - the session ends while a page is open: the same, instead of the blank
  //     page people used to sign out and in again to escape
  //   - a repairer opens an admin page: a short note and a way back to the
  //     queue, rather than being bounced to the sign-in page
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api, restoreSession } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import { homeFor, isAdminRole, isCurrent, navFor, tabsFor } from '$lib/staff/nav';
  import { Globe, LogOut, Menu, ShieldAlert, Wrench, X } from 'lucide-svelte';

  /** Only admins may see this part of the site. */
  export let requireAdmin = false;

  let ready = false;
  let drawerOpen = false;
  let signingOut = false;

  $: user = $auth?.user ?? null;
  $: admin = isAdminRole(user);
  $: groups = navFor(user, { linuxEnabled: $cafe?.linuxEnabled === true });
  $: tabs = tabsFor(user);
  $: pathname = $page.url.pathname;
  $: allowed = !requireAdmin || admin;

  function toSignIn() {
    const here = `${$page.url.pathname}${$page.url.search}`;
    goto(`/login?next=${encodeURIComponent(here)}`, { replaceState: true });
  }

  onMount(async () => {
    // Wait for the session to be restored from the cookie before deciding
    // anyone is signed out, or every refresh would send people to sign in.
    await restoreSession();
    ready = true;
  });

  // Covers both the first visit and a session that ends later on.
  $: if (ready && !$auth && !signingOut) toSignIn();

  afterNavigate(() => {
    drawerOpen = false;
  });

  async function signOut() {
    signingOut = true;
    await api('/api/auth/logout', { method: 'POST', autoRefresh: false }).catch(() => {});
    auth.set(null);
    goto('/login', { replaceState: true });
  }
</script>

{#if $auth && user}
  <div class="min-h-screen bg-slate-100 md:flex">
    <!-- ── Sidebar, on a laptop or tablet ─────────────────────────────── -->
    <aside class="hidden md:flex md:flex-col w-64 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen no-print">
      <a href={homeFor(user)} class="flex items-center gap-3 px-5 py-4 border-b border-slate-200 min-w-0">
        {#if $cafe?.logoUrl}
          <img src={$cafe.logoUrl} alt="" class="h-9 w-auto max-w-[7rem] rounded-md object-contain shrink-0" />
        {:else}
          <span class="h-9 w-9 rounded-lg bg-brand-600 text-white inline-flex items-center justify-center shrink-0"><Wrench size={18} /></span>
        {/if}
        <span class="font-semibold text-slate-900 leading-tight truncate">{$cafe?.name || 'Repair Cafe'}</span>
      </a>
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5 text-sm" aria-label="Main">
        {#each groups as group}
          <div>
            <p class="px-3 mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-400">{group.title}</p>
            {#each group.items as item}
              {@const current = isCurrent(item, pathname)}
              <a
                href={item.href}
                class="flex items-center gap-3 px-3 py-2 rounded-lg {current ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-slate-700 hover:bg-slate-100'}"
                aria-current={current ? 'page' : undefined}
              >
                <svelte:component this={item.icon} size={18} class={current ? 'text-brand-700' : 'text-slate-400'} />
                {item.label}
              </a>
            {/each}
          </div>
        {/each}
      </nav>
      <div class="border-t border-slate-200 p-3 text-sm space-y-1">
        <div class="px-3 py-2 min-w-0">
          <p class="font-medium text-slate-900 truncate">{user.displayName}</p>
          <p class="text-xs text-slate-500">{admin ? (user.role === 'super_admin' ? 'Super admin' : 'Admin') : 'Repairer'}</p>
        </div>
        <a href="/" class="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100"><Globe size={18} class="text-slate-400" /> View the website</a>
        <button type="button" on:click={signOut} class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100"><LogOut size={18} class="text-slate-400" /> Sign out</button>
        {#if admin}
          <a href="/admin/settings?tab=about" class="block px-3 pt-2 text-xs text-slate-400 hover:text-slate-600" title="Version, licence and how to update">
            Repair Cafe Hub {$cafe?.appVersion ?? ''}
          </a>
        {/if}
      </div>
    </aside>

    <!-- ── Top bar, on a phone ───────────────────────────────────────── -->
    <div class="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 no-print">
      <a href={homeFor(user)} class="flex items-center gap-2 min-w-0">
        {#if $cafe?.logoUrl}
          <img src={$cafe.logoUrl} alt="" class="h-8 w-auto max-w-[6rem] rounded-md object-contain" />
        {:else}
          <span class="h-8 w-8 rounded-lg bg-brand-600 text-white inline-flex items-center justify-center"><Wrench size={16} /></span>
        {/if}
        <span class="font-semibold text-slate-900 truncate">{$cafe?.name || 'Repair Cafe'}</span>
      </a>
      <button
        type="button"
        class="inline-flex items-center justify-center h-10 w-10 rounded-lg text-slate-700 hover:bg-slate-100"
        aria-label="Open the menu"
        aria-expanded={drawerOpen}
        on:click={() => (drawerOpen = true)}
      >
        <Menu size={22} />
      </button>
    </div>

    {#if drawerOpen}
      <div class="md:hidden fixed inset-0 z-50 flex no-print" role="dialog" aria-modal="true" aria-label="Menu">
        <button type="button" class="absolute inset-0 bg-slate-900/50" aria-label="Close the menu" on:click={() => (drawerOpen = false)}></button>
        <div class="relative ml-auto w-80 max-w-[85vw] h-full bg-white flex flex-col shadow-xl">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div class="min-w-0">
              <p class="font-semibold text-slate-900 truncate">{user.displayName}</p>
              <p class="text-xs text-slate-500">{admin ? 'Admin' : 'Repairer'}</p>
            </div>
            <button type="button" class="h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Close the menu" on:click={() => (drawerOpen = false)}><X size={22} /></button>
          </div>
          <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Main">
            {#each groups as group}
              <div>
                <p class="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.title}</p>
                {#each group.items as item}
                  {@const current = isCurrent(item, pathname)}
                  <a href={item.href} class="flex items-center gap-3 px-3 py-3 rounded-lg {current ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-slate-800 hover:bg-slate-100'}" aria-current={current ? 'page' : undefined}>
                    <svelte:component this={item.icon} size={20} class={current ? 'text-brand-700' : 'text-slate-400'} />
                    {item.label}
                  </a>
                {/each}
              </div>
            {/each}
          </nav>
          <div class="border-t border-slate-200 p-3 space-y-1">
            <a href="/" class="flex items-center gap-3 px-3 py-3 rounded-lg text-slate-800 hover:bg-slate-100"><Globe size={20} class="text-slate-400" /> View the website</a>
            <button type="button" on:click={signOut} class="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-slate-800 hover:bg-slate-100"><LogOut size={20} class="text-slate-400" /> Sign out</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- ── The page ─────────────────────────────────────────────────── -->
    <div class="flex-1 min-w-0 pb-20 md:pb-0">
      <main class="staff px-4 py-5 md:px-8 md:py-8 max-w-6xl mx-auto">
        {#if allowed}
          <slot />
        {:else}
          <div class="card p-8 max-w-lg mx-auto text-center mt-8">
            <span class="h-12 w-12 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center"><ShieldAlert size={24} /></span>
            <h1 class="text-xl font-semibold mt-4">This page is for admins</h1>
            <p class="mt-2 text-slate-600">You are signed in as a repairer, so this part of the hub is not open to you. Everything you need for the session is in the repair queue.</p>
            <a href="/repairer" class="btn-primary mt-6">Go to the repair queue</a>
          </div>
        {/if}
      </main>
    </div>

    <!-- ── Bottom tabs, on a phone ──────────────────────────────────── -->
    <nav class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid no-print" style="grid-template-columns: repeat({tabs.length}, minmax(0, 1fr)); padding-bottom: env(safe-area-inset-bottom);" aria-label="Quick links">
      {#each tabs as tab}
        {@const current = isCurrent(tab, pathname)}
        <a href={tab.href} class="flex flex-col items-center gap-0.5 py-2 text-xs {current ? 'text-brand-700 font-semibold' : 'text-slate-500'}" aria-current={current ? 'page' : undefined}>
          <svelte:component this={tab.icon} size={22} />
          {tab.label}
        </a>
      {/each}
    </nav>
  </div>
{:else}
  <div class="min-h-screen grid place-items-center bg-slate-100 text-slate-500">Loading…</div>
{/if}
