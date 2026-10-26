<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import { describeRecurrence } from '$lib/recurrence';
  import { cafe } from '$lib/stores/cafe';
  import { t, tNow } from '$lib/i18n';

  const id = $page.params.id;

  let venues: any[] = [];
  let loading = true;
  let busy = false;
  let error = '';

  let form = {
    name: '',
    venueId: '',
    description: '',
    startTime: '10:00',
    endTime: '14:00',
    frequency: 'monthly' as 'weekly' | 'biweekly' | 'monthly',
    weekday: 'SA',
    bySetPos: 2,
    isPublished: false,
    supportsLinux: false,
  };

  // What to do about sessions already on the calendar. Changing the day a
  // repeating event falls on is meaningless unless the existing dates move
  // with it, but somebody who is only fixing a typo in the name should not
  // have their calendar rebuilt underneath them.
  let regenerate: 'all_future' | 'none' = 'none';

  $: rulePreview = describeRecurrence({
    frequency: form.frequency,
    byWeekday: form.weekday as any,
    bySetPos: form.frequency === 'monthly' ? Number(form.bySetPos) : undefined,
  });

  onMount(async () => {
    try {
      const [tpls, vs] = await Promise.all([
        api<any[]>('/api/admin/event-templates'),
        api<any[]>('/api/admin/venues'),
      ]);
      venues = vs;
      const t = tpls.find((x) => x.id === id);
      if (!t) {
        error = tNow('That repeating event no longer exists.');
        return;
      }
      const rule = t.recurrenceRule ?? {};
      form = {
        name: t.name ?? '',
        venueId: t.venueId ?? '',
        description: t.description ?? '',
        startTime: (t.startTime ?? '10:00').slice(0, 5),
        endTime: (t.endTime ?? '14:00').slice(0, 5),
        frequency: rule.frequency ?? 'monthly',
        weekday: Array.isArray(rule.byWeekday) ? rule.byWeekday[0] : (rule.byWeekday ?? 'SA'),
        bySetPos: Array.isArray(rule.bySetPos) ? rule.bySetPos[0] : (rule.bySetPos ?? 2),
        isPublished: Boolean(t.isPublished),
        supportsLinux: Boolean(t.supportsLinux),
      };
    } catch (err: any) {
      error = err?.message || tNow('Could not load that repeating event');
    } finally {
      loading = false;
    }
  });

  async function save() {
    busy = true;
    error = '';
    try {
      const rule: any = { frequency: form.frequency, byWeekday: form.weekday };
      if (form.frequency === 'monthly') rule.bySetPos = Number(form.bySetPos);
      await api(`/api/admin/event-templates/${id}`, {
        method: 'PATCH',
        json: {
          regenerate,
          data: {
            name: form.name,
            venueId: form.venueId,
            description: form.description || null,
            startTime: form.startTime,
            endTime: form.endTime,
            recurrenceRule: rule,
            isPublished: form.isPublished,
            supportsLinux: form.supportsLinux,
          },
        },
      });
      goto('/admin/events');
    } catch (err: any) {
      error = err?.message || tNow('Could not save');
    } finally {
      busy = false;
    }
  }
</script>

<div class="max-w-2xl">
  <a href="/admin/events" class="text-sm text-brand-700 hover:underline">← {$t('Back to events')}</a>
  <h1 class="text-2xl font-bold mt-2">{$t('Edit repeating event')}</h1>

  {#if loading}
    <p class="mt-6 text-slate-500">{$t('Loading…')}</p>
  {:else}
    {#if error}
      <p class="mt-4 rounded-lg bg-red-50 text-red-800 px-4 py-2 text-sm">{error}</p>
    {/if}

    <div class="card p-6 mt-4 space-y-4">
      <div>
        <label class="label" for="name">{$t('Name')}</label>
        <input id="name" class="input" bind:value={form.name} />
      </div>

      <div>
        <label class="label" for="venue">{$t('Venue')}</label>
        <select id="venue" class="input" bind:value={form.venueId}>
          {#each venues as v}<option value={v.id}>{v.name}</option>{/each}
        </select>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label" for="start">{$t('Starts')}</label>
          <input id="start" type="time" class="input" bind:value={form.startTime} />
        </div>
        <div>
          <label class="label" for="end">{$t('Ends')}</label>
          <input id="end" type="time" class="input" bind:value={form.endTime} />
        </div>
      </div>

      <div>
        <label class="label" for="freq">{$t('How often')}</label>
        <select id="freq" class="input" bind:value={form.frequency}>
          <option value="weekly">{$t('Every week')}</option>
          <option value="biweekly">{$t('Every other week')}</option>
          <option value="monthly">{$t('Once a month')}</option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label" for="day">{$t('Day')}</label>
          <select id="day" class="input" bind:value={form.weekday}>
            <option value="MO">{$t('Monday')}</option>
            <option value="TU">{$t('Tuesday')}</option>
            <option value="WE">{$t('Wednesday')}</option>
            <option value="TH">{$t('Thursday')}</option>
            <option value="FR">{$t('Friday')}</option>
            <option value="SA">{$t('Saturday')}</option>
            <option value="SU">{$t('Sunday')}</option>
          </select>
        </div>
        {#if form.frequency === 'monthly'}
          <div>
            <label class="label" for="pos">{$t('Which one')}</label>
            <select id="pos" class="input" bind:value={form.bySetPos}>
              <option value={1}>{$t('First')}</option>
              <option value={2}>{$t('Second')}</option>
              <option value={3}>{$t('Third')}</option>
              <option value={4}>{$t('Fourth')}</option>
              <option value={-1}>{$t('Last')}</option>
            </select>
          </div>
        {/if}
      </div>

      {#if rulePreview}
        <p class="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
          {$t('This will run:')} <strong>{rulePreview}</strong>, {$t('{start} to {end}', { start: form.startTime, end: form.endTime })}.
        </p>
      {/if}

      <div>
        <label class="label" for="desc">{$t('Description')}</label>
        <textarea id="desc" class="input" rows="3" bind:value={form.description}></textarea>
      </div>

      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={form.isPublished} />
        {$t('Show these sessions on the public site')}
      </label>

      {#if $cafe?.linuxEnabled}
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-1" bind:checked={form.supportsLinux} />
          <span>
            {$t('Linux help at every one of these sessions')}
            <span class="block text-xs text-slate-500">
              {$t('Applies to dates this template creates from now on. Sessions already on the calendar keep what they have, unless you rebuild them below.')}
            </span>
          </span>
        </label>
      {/if}

      <div class="border-t border-slate-200 pt-4">
        <p class="label">{$t('Sessions already on the calendar')}</p>
        <label class="flex items-start gap-2 text-sm mb-2">
          <input type="radio" bind:group={regenerate} value="none" class="mt-1" />
          <span>
            <strong>{$t('Leave them alone.')}</strong> {$t('Use this when you are correcting the name or description. Nothing on the calendar moves.')}
          </span>
        </label>
        <label class="flex items-start gap-2 text-sm">
          <input type="radio" bind:group={regenerate} value="all_future" class="mt-1" />
          <span>
            <strong>{$t('Rebuild the future ones.')}</strong> {$t('Use this when you have changed the day or the time. Sessions that have already happened are never touched.')}
            <span class="block text-xs text-slate-500 mt-0.5">
              {$t('A session that already has repairs or Linux installs recorded against it is kept, not rebuilt. It keeps its date, its check-in link and its QR poster, and picks up your changes.')}
            </span>
          </span>
        </label>
      </div>

      {#if error}
        <p class="text-sm text-red-700">{error}</p>
      {/if}

      <div class="flex gap-3 pt-2">
        <button class="btn-primary" on:click={save} disabled={busy || !form.name || !form.venueId}>
          {busy ? $t('Saving…') : $t('Save changes')}
        </button>
        <a href="/admin/events" class="btn-secondary">{$t('Cancel')}</a>
      </div>
    </div>
  {/if}
</div>
