<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import { Mail, MapPin } from 'lucide-svelte';

  interface Venue { name: string; address: string | null; postcode: string | null; mapUrl: string | null; notes: string | null }
  let venue: Venue | null = null;

  onMount(async () => {
    venue = await api<Venue | null>('/api/public/venue').catch(() => null);
  });
</script>

<SiteHeader variant="public" />

<main class="max-w-3xl mx-auto px-4 py-12 space-y-8">
  <h1>Get in touch</h1>

  {#if $cafe?.contactEmail}
    <div class="card p-6">
      <p class="text-sm text-slate-500 uppercase tracking-wide">Email</p>
      <a href="mailto:{$cafe.contactEmail}" class="mt-2 inline-flex items-center gap-2 text-xl font-semibold text-brand-700 hover:underline">
        <Mail size={20} /> {$cafe.contactEmail}
      </a>
    </div>
  {/if}

  {#if venue}
    <div class="card p-6">
      <p class="text-sm text-slate-500 uppercase tracking-wide">Find us</p>
      <p class="mt-2 inline-flex items-center gap-2 text-xl font-semibold"><MapPin size={20} /> {venue.name}</p>
      {#if venue.address}<p class="mt-1 text-slate-700 whitespace-pre-line">{venue.address}{venue.postcode ? `, ${venue.postcode}` : ''}</p>{/if}
      {#if venue.notes}<p class="mt-3 text-sm text-slate-600">{venue.notes}</p>{/if}
      {#if venue.mapUrl}
        <iframe src={venue.mapUrl} title="Map" class="mt-4 w-full h-64 rounded-lg border border-slate-200"></iframe>
      {/if}
    </div>
  {/if}

  {#if $cafe?.socialLinks && Object.values($cafe.socialLinks).some((v) => v)}
    <div class="card p-6">
      <p class="text-sm text-slate-500 uppercase tracking-wide">Social</p>
      <ul class="mt-2 space-y-1">
        {#each Object.entries($cafe.socialLinks) as [k, v]}
          {#if v}<li><a class="text-brand-700 hover:underline" href={v} target="_blank" rel="noopener">{k}: {v}</a></li>{/if}
        {/each}
      </ul>
    </div>
  {/if}
</main>

<SiteFooter />
