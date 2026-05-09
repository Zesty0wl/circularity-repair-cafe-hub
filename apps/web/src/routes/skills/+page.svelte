<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';

  interface SkillCategory { id: string; name: string; icon: string; colour: string; repairerCount: number }
  interface Repairer { id: string; displayName: string; avatarUrl: string | null; bio: string | null; skills: string[]; joinDate: string | null }

  let categories: SkillCategory[] = [];
  let repairers: Repairer[] = [];

  onMount(async () => {
    const r = await api<{ categories: SkillCategory[]; repairers: Repairer[] }>('/api/public/skills').catch(() => ({ categories: [], repairers: [] }));
    categories = r.categories;
    repairers = r.repairers;
  });
</script>

<SiteHeader variant="public" />

<main class="max-w-6xl mx-auto px-4 py-12">
  <section>
    <h1>What we repair</h1>
    <div class="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {#each categories as cat}
        <div class="card p-4 text-center">
          <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-white shadow-sm" style="background-color: {cat.colour}">
            <Icon icon={categoryIcon(cat.icon)} width="28" height="28" />
          </div>
          <p class="mt-3 font-semibold">{cat.name}</p>
          <p class="text-xs text-slate-500">{cat.repairerCount} volunteer{cat.repairerCount === 1 ? '' : 's'}</p>
        </div>
      {/each}
    </div>
  </section>

  <section class="mt-16">
    <h2>Our volunteers</h2>
    {#if repairers.length === 0}
      <p class="text-slate-500 mt-3">Our team will appear here once volunteers join.</p>
    {:else}
      <div class="mt-6 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {#each repairers as r}
          <div class="card p-5">
            <div class="flex items-center gap-3">
              {#if r.avatarUrl}
                <img src={r.avatarUrl} alt="" class="h-14 w-14 rounded-full object-cover" />
              {:else}
                <div class="h-14 w-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold">{r.displayName.slice(0,2).toUpperCase()}</div>
              {/if}
              <div>
                <p class="font-semibold">{r.displayName}</p>
                {#if r.joinDate}<p class="text-xs text-slate-500">Joined {new Date(r.joinDate).getFullYear()}</p>{/if}
              </div>
            </div>
            {#if r.bio}<p class="mt-3 text-sm text-slate-700">{r.bio}</p>{/if}
            {#if r.skills.length > 0}
              <div class="mt-3 flex flex-wrap gap-1">
                {#each r.skills as s}
                  <span class="badge bg-slate-100 text-slate-700">{s}</span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>

<SiteFooter />
