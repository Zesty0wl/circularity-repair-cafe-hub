<!--
  Volunteers whose first recorded repair is before the day they joined, often
  because their old repairs were just added from a spreadsheet. One press moves
  each ticked volunteer's joined date back to their first repair.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { CalendarClock } from 'lucide-svelte';
  import { api } from '$lib/api';
  import { t, tNow, dateLocale } from '$lib/i18n';

  export let suggestions: Array<{ id: string; displayName: string; joinDate: string | null; firstRepairDate: string }> = [];

  const dispatch = createEventDispatcher<{ updated: void }>();
  let chosen: string[] = [];
  const seen = new Set<string>();
  let busy = false;
  let error = '';
  let done = 0;

  // Everyone starts ticked, including volunteers in a list that arrives later.
  $: chosen = [
    ...chosen.filter((id) => suggestions.some((s) => s.id === id)),
    ...suggestions.filter((s) => !seen.has(s.id) && seen.add(s.id)).map((s) => s.id),
  ];

  function show(date: string | null): string {
    if (!date) return tNow('not set');
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  }

  async function apply() {
    busy = true;
    error = '';
    try {
      const res = await api<{ updated: unknown[] }>('/api/admin/history/join-dates', { method: 'POST', json: { ids: chosen } });
      done = res.updated.length;
      dispatch('updated');
    } catch (e: any) {
      error = e?.message || tNow('Could not save');
    } finally {
      busy = false;
    }
  }
</script>

{#if done > 0 && suggestions.length === 0}
  <p class="rounded-xl bg-emerald-50 text-emerald-800 px-4 py-3 text-sm" role="status">
    {done === 1 ? $t('1 joined date moved back.') : $t('{count} joined dates moved back.', { count: done })}
  </p>
{:else if suggestions.length > 0}
  <section class="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4" aria-labelledby="join-dates-title">
    <div class="flex items-start gap-3">
      <CalendarClock size={20} class="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <h2 id="join-dates-title" class="font-semibold text-amber-900">
          {suggestions.length === 1
            ? $t('1 volunteer repaired things before the date they joined')
            : $t('{count} volunteers repaired things before the date they joined', { count: suggestions.length })}
        </h2>
        <p class="text-sm text-amber-800 mt-1">
          {$t('Move their joined date back to their first recorded repair, so their profile shows how long they have helped.')}
        </p>
        <ul class="mt-3 space-y-1.5">
          {#each suggestions as s (s.id)}
            <li>
              <label class="flex items-start gap-2 text-sm">
                <input type="checkbox" class="mt-0.5" value={s.id} bind:group={chosen} />
                <span>
                  <span class="font-medium">{s.displayName}</span>:
                  {$t('joined {from}, first repair {to}', { from: show(s.joinDate), to: show(s.firstRepairDate) })}
                </span>
              </label>
            </li>
          {/each}
        </ul>
        {#if error}<p class="text-rose-700 text-sm mt-2">{error}</p>{/if}
        <button class="btn-primary btn-sm mt-3" on:click={apply} disabled={busy || chosen.length === 0}>
          {$t('Use their first repair date')}
        </button>
      </div>
    </div>
  </section>
{/if}
