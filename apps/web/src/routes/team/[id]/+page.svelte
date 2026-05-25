<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';
  import { ArrowLeft, Wrench, Calendar } from 'lucide-svelte';

  interface Skill { id: string; name: string; colour: string; icon: string }
  interface Repairer {
    id: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    joinDate: string | null;
    repairCount: number;
    skills: Skill[];
  }

  let repairer: Repairer | null = null;
  let notFound = false;
  let loading = true;

  $: id = $page.params.id;

  async function load() {
    loading = true;
    notFound = false;
    try {
      repairer = await api<Repairer>(`/api/public/repairers/${id}`);
    } catch (e: any) {
      if (e?.status === 404 || /not_found/i.test(String(e?.message ?? ''))) {
        notFound = true;
      } else {
        throw e;
      }
    } finally {
      loading = false;
    }
  }
  onMount(load);

  function joinedDisplay(d: string | null): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  function initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!)
      .join('')
      .toUpperCase();
  }
</script>

<svelte:head>
  <title>{repairer ? `${repairer.displayName} · Volunteer repairer` : 'Volunteer repairer'}</title>
  {#if repairer?.bio}
    <meta name="description" content={repairer.bio.slice(0, 160)} />
  {/if}
</svelte:head>

<SiteHeader variant="public" />

<main class="max-w-3xl mx-auto px-4 py-10 space-y-6">
  <a href="/skills" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
    <ArrowLeft size={16} /> Back to the team
  </a>

  {#if loading}
    <div class="card p-8 text-center text-slate-500">Loading…</div>
  {:else if notFound || !repairer}
    <div class="card p-8 text-center">
      <h1 class="text-2xl font-semibold">Volunteer not found</h1>
      <p class="mt-2 text-slate-600">This volunteer may have left the team or hidden their profile.</p>
      <a href="/skills" class="btn-primary mt-4 inline-flex">See our team</a>
    </div>
  {:else}
    <!-- Hero -->
    <header class="card p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
      {#if repairer.avatarUrl}
        <img
          src={repairer.avatarUrl}
          alt={repairer.displayName}
          class="h-32 w-32 sm:h-36 sm:w-36 rounded-2xl object-cover ring-4 ring-white shadow-md shrink-0"
        />
      {:else}
        <div
          class="h-32 w-32 sm:h-36 sm:w-36 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center text-4xl font-bold ring-4 ring-white shadow-md shrink-0"
        >
          {initials(repairer.displayName)}
        </div>
      {/if}
      <div class="min-w-0 flex-1">
        <p class="text-sm text-brand-700 font-medium uppercase tracking-wide">Volunteer repairer</p>
        <h1 class="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">{repairer.displayName}</h1>
        <div class="mt-3 flex flex-wrap justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-slate-600">
          {#if repairer.joinDate}
            <span class="inline-flex items-center gap-1.5"><Calendar size={14} /> Joined {joinedDisplay(repairer.joinDate)}</span>
          {/if}
          {#if repairer.repairCount > 0}
            <span class="inline-flex items-center gap-1.5">
              <Wrench size={14} /> {repairer.repairCount} repair{repairer.repairCount === 1 ? '' : 's'} logged
            </span>
          {/if}
        </div>
      </div>
    </header>

    <!-- Bio -->
    {#if repairer.bio}
      <section class="card p-6 sm:p-8">
        <h2 class="text-sm text-slate-500 uppercase tracking-wide">About</h2>
        <p class="mt-3 text-lg leading-relaxed text-slate-700 whitespace-pre-line">{repairer.bio}</p>
      </section>
    {/if}

    <!-- Skills -->
    {#if repairer.skills.length > 0}
      <section class="card p-6 sm:p-8">
        <h2 class="text-sm text-slate-500 uppercase tracking-wide">Specialises in</h2>
        <div class="mt-4 flex flex-wrap gap-3">
          {#each repairer.skills as s}
            <span
              class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white shadow-sm"
              style="background-color: {s.colour}"
            >
              <Icon icon={categoryIcon(s.icon)} width="16" height="16" />
              {s.name}
            </span>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</main>

<SiteFooter />
