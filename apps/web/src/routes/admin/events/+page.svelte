<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let events: any[] = [];
  let templates: any[] = [];

  async function load() {
    [events, templates] = await Promise.all([
      api('/api/admin/events'),
      api('/api/admin/event-templates'),
    ]);
  }
  onMount(load);

  async function activate(id: string) {
    await api(`/api/admin/events/${id}/activate`, { method: 'POST', json: {} });
    load();
  }
  async function publish(e: any, val: boolean) {
    await api(`/api/admin/events/${e.id}`, { method: 'PATCH', json: { isPublished: val } });
    load();
  }
</script>

<div class="flex items-center justify-between">
  <h1 class="text-2xl font-bold">Events</h1>
  <a href="/admin/events/new" class="btn-primary">Create event</a>
</div>

{#if templates.length > 0}
  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-2">Templates</h2>
    <ul class="card divide-y divide-slate-100">
      {#each templates as t}
        <li class="px-4 py-3 flex justify-between gap-3">
          <div>
            <p class="font-semibold">{t.name}</p>
            <p class="text-xs text-slate-500">{t.startTime?.slice(0,5)}–{t.endTime?.slice(0,5)} · {JSON.stringify(t.recurrenceRule)}</p>
          </div>
          <span class="badge {t.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">{t.isPublished ? 'Published' : 'Draft'}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="mt-6">
  <h2 class="text-lg font-semibold mb-2">All events</h2>
  <div class="overflow-x-auto card">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-left text-slate-600">
        <tr>
          <th class="px-3 py-2">Date</th>
          <th class="px-3 py-2">Name</th>
          <th class="px-3 py-2">Venue</th>
          <th class="px-3 py-2">Status</th>
          <th class="px-3 py-2">Published</th>
          <th class="px-3 py-2">Jobs</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each events as e}
          <tr>
            <td class="px-3 py-2 whitespace-nowrap">{e.date}</td>
            <td class="px-3 py-2"><a href={`/admin/events/${e.id}`} class="text-brand-700 hover:underline">{e.name}</a></td>
            <td class="px-3 py-2">{e.venueName}</td>
            <td class="px-3 py-2"><span class="badge badge-{e.status}">{e.status}</span></td>
            <td class="px-3 py-2"><button class="badge {e.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}" on:click={() => publish(e, !e.isPublished)}>{e.isPublished ? 'Yes' : 'No'}</button></td>
            <td class="px-3 py-2">{e.jobCount}</td>
            <td class="px-3 py-2 text-right">
              {#if e.status === 'scheduled'}
                <button class="btn-secondary btn-sm" on:click={() => activate(e.id)}>Activate</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">No events yet</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
