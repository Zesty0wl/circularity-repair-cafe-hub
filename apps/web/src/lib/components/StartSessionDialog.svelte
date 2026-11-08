<script lang="ts">
  // Asked before a session is started. Admins kept pressing Start when they
  // only meant to put a session on the website, and a started session stops
  // taking pre-registrations and shows as "happening now" to the public. So
  // this says plainly what starting does, warns when the session is not
  // today, and offers to publish the session instead.
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/api';
  import { AlertTriangle, Check, Globe, Play, X } from 'lucide-svelte';
  import { cafe } from '$lib/stores/cafe';
  import { t, tNow, dateLocale } from '$lib/i18n';
  import { sessionTimes } from '$lib/staff/queue';

  export let session: {
    id: string;
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    isPublished: boolean;
  };

  const dispatch = createEventDispatcher<{ close: void; started: void; published: void }>();

  let busy = false;
  let error = '';
  let published = session.isPublished;

  function localToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  $: today = localToday();
  $: notToday = session.date !== today;
  $: inFuture = session.date > today;
  $: longDate = new Date(`${session.date}T12:00:00Z`).toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  async function start() {
    busy = true;
    error = '';
    try {
      await api(`/api/admin/events/${session.id}/activate`, { method: 'POST', json: {} });
      dispatch('started');
    } catch (err: any) {
      error = err?.message ?? tNow('Could not start the session');
    } finally {
      busy = false;
    }
  }

  async function publish() {
    busy = true;
    error = '';
    try {
      await api(`/api/admin/events/${session.id}`, { method: 'PATCH', json: { isPublished: true } });
      published = true;
      dispatch('published');
    } catch (err: any) {
      error = err?.message ?? tNow('Could not save that change');
    } finally {
      busy = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="start-session-title">
  <button type="button" class="absolute inset-0 bg-slate-900/50" aria-label={$t('Close')} on:click={() => dispatch('close')}></button>
  <div class="modal-panel relative max-w-lg max-h-[90vh] overflow-y-auto">
    <button type="button" class="absolute top-3 right-3 p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={$t('Close')} on:click={() => dispatch('close')}><X size={18} /></button>
    <span class="h-11 w-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center"><Play size={22} /></span>
    <h2 id="start-session-title" class="text-lg font-semibold mt-3">{$t('Start this session now?')}</h2>
    <p class="mt-1 text-sm text-slate-600">
      <strong class="text-slate-800">{session.name}</strong> · {longDate} · {sessionTimes(session.startTime, session.endTime)}
    </p>

    {#if notToday}
      <div class="mt-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900 flex gap-2">
        <AlertTriangle size={18} class="shrink-0 mt-0.5" />
        <p>
          {inFuture
            ? $t('This session is on {date}, not today. You normally start a session on the day, when the doors open.', { date: longDate })
            : $t('This session was on {date}, not today.', { date: longDate })}
        </p>
      </div>
    {/if}

    <p class="mt-4 text-sm font-medium text-slate-800">{$t('Starting a session opens it for the day itself:')}</p>
    <ul class="mt-2 space-y-1.5 text-sm text-slate-700 list-disc pl-5">
      <li>{$t('Visitors can check in their items with the QR code.')}</li>
      <li>{$t('Repairers see the queue and can record repairs.')}</li>
      <li>{$t('Your website says the session is happening now.')}</li>
      {#if $cafe?.preRegistrationEnabled}
        <li>{$t('Pre-registration closes. People who pre-registered check in at the door instead.')}</li>
      {/if}
    </ul>

    <div class="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-sm">
      <p class="font-medium text-slate-800 flex items-center gap-2"><Globe size={16} /> {$t('Only want it on your website?')}</p>
      {#if published}
        <p class="mt-1 text-slate-600 flex items-start gap-1.5">
          <Check size={16} class="shrink-0 mt-0.5 text-emerald-600" />
          {$t('It is already published, so people can see it on your website. You do not need to start it until the day.')}
        </p>
      {:else}
        <p class="mt-1 text-slate-600">{$t('You do not need to start it. Publish it instead, and it shows on your public calendar so people know to come.')}</p>
        <button class="btn-secondary btn-sm mt-2" disabled={busy} on:click={publish}><Globe size={14} /> {$t('Publish it on the website')}</button>
      {/if}
    </div>

    {#if error}
      <p class="mt-3 text-sm text-rose-700">{error}</p>
    {/if}

    <div class="mt-5 flex flex-wrap justify-end gap-2">
      <button class="btn-ghost" on:click={() => dispatch('close')}>{$t('Not now')}</button>
      <button class="btn-primary" disabled={busy} on:click={start}>
        <Play size={16} /> {notToday ? $t('Start it anyway') : $t('Yes, start the session')}
      </button>
    </div>
    <p class="mt-3 text-xs text-slate-500 text-right">{$t('Started by mistake? You can undo it until the first repair is recorded.')}</p>
  </div>
</div>
