<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import { Calendar, MapPin } from 'lucide-svelte';

  interface PublicEvent {
    id: string;
    name: string;
    description: string | null;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    venue: { name: string; address: string | null };
  }

  let upcoming: PublicEvent[] = [];
  let past: PublicEvent[] = [];
  let showPast = false;

  onMount(async () => {
    upcoming = await api<PublicEvent[]>('/api/public/events').catch(() => []);
  });

  async function loadPast() {
    showPast = true;
    const all = await api<PublicEvent[]>('/api/public/events?past=true').catch(() => []);
    const today = new Date().toISOString().slice(0, 10);
    past = all.filter((e) => e.date < today);
  }

  function formatDate(d: string): string {
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
</script>

<SiteHeader variant="public" />

<main class="max-w-3xl mx-auto px-4 py-12">
  <h1>Upcoming events</h1>
  <p class="text-slate-600 mt-2">Bring an item to repair — we'll do our best to fix it together.</p>

  <div class="mt-8 space-y-4">
    {#if upcoming.length === 0}
      <div class="card p-6 text-slate-500">No upcoming events scheduled. Check back soon!</div>
    {:else}
      {#each upcoming as evt}
        <article class="card p-6">
          <h3 class="text-xl font-semibold">{evt.name}</h3>
          <p class="mt-2 text-slate-600 flex items-center gap-2"><Calendar size={16} /> {formatDate(evt.date)} · {evt.startTime.slice(0,5)}–{evt.endTime.slice(0,5)}</p>
          <p class="mt-1 text-slate-600 flex items-center gap-2"><MapPin size={16} /> {evt.venue.name}{evt.venue.address ? ` · ${evt.venue.address}` : ''}</p>
          {#if evt.description}<p class="mt-3 text-slate-700">{evt.description}</p>{/if}
          {#if evt.status === 'cancelled'}
            <span class="badge badge-cancelled mt-3">Cancelled</span>
          {/if}
        </article>
      {/each}
    {/if}
  </div>

  <div class="mt-10">
    {#if !showPast}
      <button class="btn-secondary" type="button" on:click={loadPast}>Show past events</button>
    {:else}
      <h2 class="text-xl font-semibold mb-3">Past events</h2>
      <ul class="space-y-2 text-sm text-slate-600">
        {#each past as evt}
          <li>{formatDate(evt.date)} — {evt.name} <span class="text-slate-400">at {evt.venue.name}</span></li>
        {/each}
      </ul>
    {/if}
  </div>
</main>

<SiteFooter />
