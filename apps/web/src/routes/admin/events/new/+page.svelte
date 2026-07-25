<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  let venues: any[] = [];
  let mode: 'oneoff' | 'recurring' = 'oneoff';
  let busy = false;
  let error = '';

  // One-off
  let oneoff = {
    name: '',
    venueId: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '10:00',
    endTime: '14:00',
    isPublished: false,
  };

  // Template
  let template = {
    name: '',
    venueId: '',
    description: '',
    startTime: '10:00',
    endTime: '14:00',
    frequency: 'monthly' as 'weekly' | 'biweekly' | 'monthly',
    weekday: 'SA',
    bySetPos: 2,
    isPublished: false,
  };

  onMount(async () => {
    venues = await api('/api/admin/venues');
    const home = venues.find((v) => v.isHomeVenue) ?? venues[0];
    if (home) {
      oneoff.venueId = home.id;
      template.venueId = home.id;
    }
  });

  async function submit() {
    busy = true;
    error = '';
    try {
      if (mode === 'oneoff') {
        const created = await api<any>('/api/admin/events', {
          method: 'POST',
          json: oneoff,
        });
        goto(`/admin/events/${created.id}`);
      } else {
        const rule: any = { frequency: template.frequency, byWeekday: template.weekday };
        if (template.frequency === 'monthly') rule.bySetPos = Number(template.bySetPos);
        const tpl = await api<any>('/api/admin/event-templates', {
          method: 'POST',
          json: {
            name: template.name,
            venueId: template.venueId,
            description: template.description || null,
            startTime: template.startTime,
            endTime: template.endTime,
            recurrenceRule: rule,
            isPublished: template.isPublished,
          },
        });
        goto('/admin/events');
      }
    } catch (err: any) {
      error = err?.message || 'Could not create event';
    } finally {
      busy = false;
    }
  }
</script>

<h1 class="text-2xl font-bold">Create event</h1>

<div class="mt-4 flex gap-2">
  <button class="btn-{mode === 'oneoff' ? 'primary' : 'secondary'}" on:click={() => (mode = 'oneoff')}>One-off</button>
  <button class="btn-{mode === 'recurring' ? 'primary' : 'secondary'}" on:click={() => (mode = 'recurring')}>Recurring (template)</button>
</div>

<div class="card p-6 mt-4 max-w-2xl space-y-4">
  {#if mode === 'oneoff'}
    <div>
      <label class="label" for="n">Name</label>
      <input id="n" class="input" bind:value={oneoff.name} />
    </div>
    <div>
      <label class="label" for="v">Venue</label>
      <select id="v" class="input" bind:value={oneoff.venueId}>
        {#each venues as v}<option value={v.id}>{v.name}</option>{/each}
      </select>
    </div>
    <div>
      <label class="label" for="d">Date</label>
      <input id="d" type="date" class="input" bind:value={oneoff.date} />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="label" for="st">Start</label><input id="st" type="time" class="input" bind:value={oneoff.startTime} /></div>
      <div><label class="label" for="et">End</label><input id="et" type="time" class="input" bind:value={oneoff.endTime} /></div>
    </div>
    <div>
      <label class="label" for="ds">Description</label>
      <textarea id="ds" class="input" rows="3" bind:value={oneoff.description}></textarea>
    </div>
    <label class="flex items-center gap-2"><input type="checkbox" bind:checked={oneoff.isPublished} /> Publish on public calendar</label>
  {:else}
    <div>
      <label class="label" for="tn">Template name</label>
      <input id="tn" class="input" bind:value={template.name} />
    </div>
    <div>
      <label class="label" for="tv">Venue</label>
      <select id="tv" class="input" bind:value={template.venueId}>
        {#each venues as v}<option value={v.id}>{v.name}</option>{/each}
      </select>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="label" for="tst">Start</label><input id="tst" type="time" class="input" bind:value={template.startTime} /></div>
      <div><label class="label" for="tet">End</label><input id="tet" type="time" class="input" bind:value={template.endTime} /></div>
    </div>
    <div>
      <label class="label" for="freq">Frequency</label>
      <select id="freq" class="input" bind:value={template.frequency}>
        <option value="weekly">Weekly</option>
        <option value="biweekly">Every 2 weeks</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label" for="wd">Day of week</label>
        <select id="wd" class="input" bind:value={template.weekday}>
          <option value="MO">Monday</option><option value="TU">Tuesday</option><option value="WE">Wednesday</option>
          <option value="TH">Thursday</option><option value="FR">Friday</option><option value="SA">Saturday</option><option value="SU">Sunday</option>
        </select>
      </div>
      {#if template.frequency === 'monthly'}
        <div>
          <label class="label" for="pos">Which</label>
          <select id="pos" class="input" bind:value={template.bySetPos}>
            <option value={1}>First</option><option value={2}>Second</option><option value={3}>Third</option><option value={4}>Fourth</option><option value={-1}>Last</option>
          </select>
        </div>
      {/if}
    </div>
    <div>
      <label class="label" for="td">Description</label>
      <textarea id="td" class="input" rows="3" bind:value={template.description}></textarea>
    </div>
    <label class="flex items-center gap-2"><input type="checkbox" bind:checked={template.isPublished} /> Publish on public calendar</label>
  {/if}
  {#if error}<p class="text-rose-600 text-sm">{error}</p>{/if}
  <div class="flex justify-end"><button class="btn-primary" on:click={submit} disabled={busy}>Create</button></div>
</div>
