<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { describeRecurrence, describeTimes } from '$lib/recurrence';
  import { Pencil, Trash2 } from 'lucide-svelte';

  let events: any[] = [];
  let templates: any[] = [];
  let error = '';
  let busyId = '';

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

  async function removeTemplate(t: any) {
    // Deleting a template does not delete the sessions it made: the database
    // sets their link to null instead. Worth saying so, because "delete the
    // repeating event" sounds like it takes the history with it.
    const ok = confirm(
      `Stop repeating "${t.name}"?\n\n` +
        'Sessions it has already created stay exactly as they are, including ' +
        'their repairs. They just stop being linked to this pattern, and no ' +
        'new ones will be added.',
    );
    if (!ok) return;
    busyId = t.id;
    error = '';
    try {
      await api(`/api/admin/event-templates/${t.id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      error = err?.message || 'Could not delete that repeating event';
    } finally {
      busyId = '';
    }
  }
</script>

<div class="flex items-center justify-between">
  <h1 class="text-2xl font-bold">Events</h1>
  <a href="/admin/events/new" class="btn-primary">Create event</a>
</div>

{#if error}
  <p class="mt-4 rounded-lg bg-red-50 text-red-800 px-4 py-2 text-sm">{error}</p>
{/if}

{#if templates.length > 0}
  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-2">Repeating events</h2>
    <ul class="card divide-y divide-slate-100">
      {#each templates as t}
        <li class="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <p class="font-semibold">{t.name}</p>
            <p class="text-xs text-slate-500">
              {describeRecurrence(t.recurrenceRule) ?? 'Repeats'}
              {#if describeTimes(t.startTime, t.endTime)}
                · {describeTimes(t.startTime, t.endTime)}
              {/if}
              {#if t.venueName}· {t.venueName}{/if}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              class="badge {t.isPublished
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-700'}">{t.isPublished ? 'Published' : 'Draft'}</span
            >
            <a href={`/admin/events/templates/${t.id}`} class="btn-secondary btn-xs">
              <Pencil size={14} /> Edit
            </a>
            <button
              class="btn-danger-outline btn-xs"
              disabled={busyId === t.id}
              on:click={() => removeTemplate(t)}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
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
            <td class="px-3 py-1.5 whitespace-nowrap">{e.date}</td>
            <td class="px-3 py-1.5"><a href={`/admin/events/${e.id}`} class="text-brand-700 hover:underline">{e.name}</a></td>
            <td class="px-3 py-1.5">{e.venueName}</td>
            <td class="px-3 py-1.5"><span class="badge badge-{e.status}">{e.status}</span></td>
            <td class="px-3 py-1.5"><button class="badge {e.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}" on:click={() => publish(e, !e.isPublished)}>{e.isPublished ? 'Yes' : 'No'}</button></td>
            <td class="px-3 py-1.5">{e.jobCount}</td>
            <td class="px-3 py-1.5 text-right">
              <!-- btn-xs, not btn-sm. A btn-sm here is 36px tall inside a cell
                   of text, which made every row with an Activate button half
                   as tall again as the rest of the table. -->
              {#if e.status === 'scheduled'}
                <button class="btn-secondary btn-xs" on:click={() => activate(e.id)}>Activate</button>
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
