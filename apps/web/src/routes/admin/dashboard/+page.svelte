<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { goto } from '$app/navigation';
  import { formatDistanceToNowStrict } from 'date-fns';

  let data: any = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Turn an audit log row into "who did what" in plain English. The name is
  // returned separately so the template can show it in bold.
  function describeActivity(a: any): { who: string | null; rest: string } {
    const who =
      a.actorName ??
      (a.actorType === 'customer' ? 'A visitor' : a.actorType === 'system' ? 'The system' : 'Someone');
    const item = a.itemDescription
      ? `${a.itemDescription} (#${a.jobNumber})`
      : a.metadata?.jobNumber
        ? `repair #${a.metadata.jobNumber}`
        : 'a repair';
    const ev = a.eventName ? `"${a.eventName}"` : 'an event';
    const person = a.targetUserName ?? 'a team member';
    switch (a.action) {
      case 'checkin.created': return { who, rest: `checked in ${item}` };
      case 'checkin.assisted': return { who, rest: `checked in ${item} for a visitor` };
      case 'repair.accepted': return { who, rest: `started work on ${item}` };
      case 'repair.taken_over': return { who, rest: `took over ${item}` };
      case 'repair.released': return { who, rest: `put ${item} back in the queue` };
      case 'repair.completed': return { who, rest: `fixed ${item}` };
      case 'repair.cannot_repair': return { who, rest: `could not fix ${item}` };
      case 'repair.admin_updated': return { who, rest: `updated ${item}` };
      case 'repair.deleted': return { who, rest: `deleted ${item}` };
      case 'repair.pii_purged': return { who: null, rest: `Personal details were removed from ${item}` };
      case 'event.created': return { who, rest: `created the event ${ev}` };
      case 'event.updated': return { who, rest: `updated the event ${ev}` };
      case 'event.activated': return { who, rest: `started the event ${ev}` };
      case 'event.completed': return { who, rest: `ended the event ${ev}` };
      case 'event.cancelled': return { who, rest: `cancelled the event ${ev}` };
      case 'user.created': return { who, rest: `added ${person} to the team` };
      case 'user.updated': return { who, rest: `updated the profile of ${person}` };
      case 'user.reset_link_generated': return { who, rest: `created a password reset link for ${person}` };
      case 'user.self_updated': return { who, rest: 'updated their profile' };
      case 'user.avatar_updated': return { who, rest: `updated the photo of ${person}` };
      case 'user.avatar_removed': return { who, rest: `removed the photo of ${person}` };
      case 'user.avatar_self_updated': return { who, rest: 'updated their photo' };
      case 'user.avatar_self_removed': return { who, rest: 'removed their photo' };
      case 'auth.password_reset': return { who, rest: 'reset their password' };
      case 'venue.created': return { who, rest: 'added a venue' };
      case 'venue.updated': return { who, rest: 'updated a venue' };
      case 'template.created': return { who, rest: 'created an event template' };
      case 'skill_category.created': return { who, rest: 'added a skill category' };
      case 'backup.downloaded': return { who, rest: 'downloaded a backup' };
      case 'backup.restored': return { who, rest: 'restored a backup' };
      case 'setup.completed': return { who: null, rest: 'Setup was completed' };
      default: {
        if (a.action?.startsWith('cafe.gallery')) return { who, rest: 'updated the photo gallery' };
        if (a.action?.startsWith('cafe.')) return { who, rest: 'updated the cafe settings' };
        return { who, rest: `updated ${String(a.entityType).replace(/_/g, ' ')}` };
      }
    }
  }

  function activityLink(a: any): string | null {
    if (a.entityType === 'repair_job' && a.entityId && a.itemDescription) return `/admin/repairs/${a.entityId}`;
    if (a.entityType === 'event' && a.entityId && a.eventName) return `/admin/events/${a.entityId}`;
    return null;
  }

  async function load() {
    data = await api('/api/admin/dashboard');
  }

  onMount(() => {
    load();
    timer = setInterval(load, 30000);
    return () => { if (timer) clearInterval(timer); };
  });

  async function activate(id: string) {
    await api(`/api/admin/events/${id}/activate`, { method: 'POST', json: {} });
    await load();
  }
  async function endEvent(id: string) {
    if (!confirm('End the active event? This cannot be undone.')) return;
    await api(`/api/admin/events/${id}/complete`, { method: 'POST', json: {} });
    await load();
  }
</script>

<h1 class="text-2xl font-bold mb-4">Dashboard</h1>

{#if !data}
  <p class="text-slate-500">Loading…</p>
{:else}
  {#if data.activeEvent}
    <div class="card p-6">
      <div class="flex justify-between items-start gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-brand-700 font-semibold">Active event</p>
          <h2 class="text-xl font-semibold mt-1 break-words">{data.activeEvent.name}</h2>
          <p class="text-slate-600 text-sm">{data.activeEvent.venueName} · {data.activeEvent.startTime.slice(0,5)}–{data.activeEvent.endTime.slice(0,5)}</p>
        </div>
        <span class="badge badge-active shrink-0">Active</span>
      </div>
      {#if data.activeCounts}
        <div class="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-waiting"></span>Waiting</p><p class="mt-auto text-2xl sm:text-3xl font-bold text-slate-900">{data.activeCounts.waiting}</p></div>
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-in_progress"></span>In progress</p><p class="mt-auto text-2xl sm:text-3xl font-bold text-slate-900">{data.activeCounts.in_progress}</p></div>
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-completed"></span>Done</p><p class="mt-auto text-2xl sm:text-3xl font-bold text-slate-900">{data.activeCounts.completed}</p></div>
          <div class="rounded-xl bg-slate-50 p-3 flex flex-col"><p class="text-xs text-slate-600 flex items-center justify-center gap-1.5"><span class="status-dot status-dot-cannot_repair"></span>Cannot repair</p><p class="mt-auto text-2xl sm:text-3xl font-bold text-slate-900">{data.activeCounts.cannot_repair}</p></div>
        </div>
      {/if}
      <div class="mt-5 flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <a href="/repairer/checkin" class="btn-primary">Add a repair</a>
        <a href={`/admin/events/${data.activeEvent.id}`} class="btn-secondary">View event</a>
        <button on:click={() => endEvent(data.activeEvent.id)} class="btn-danger-outline">End event</button>
      </div>
    </div>
  {:else if data.nextEvent}
    <div class="card p-6">
      <p class="text-xs uppercase tracking-wide text-slate-500 font-semibold">Next event</p>
      <h2 class="text-xl font-semibold mt-1">{data.nextEvent.name}</h2>
      <p class="text-slate-600 text-sm">{data.nextEvent.venueName} · {data.nextEvent.date}</p>
      <div class="mt-4 flex flex-col sm:flex-row gap-2">
        <button class="btn-primary" on:click={() => activate(data.nextEvent.id)}>Activate event</button>
        <a href={`/admin/events/${data.nextEvent.id}`} class="btn-secondary">View</a>
      </div>
    </div>
  {:else}
    <div class="card p-6">
      <p class="text-slate-600">No upcoming events scheduled.</p>
      <a href="/admin/events/new" class="btn-primary mt-4">Create event</a>
    </div>
  {/if}

  <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="card p-4 text-center flex flex-col"><p class="text-2xl sm:text-3xl font-bold">{data.stats.totalRepairs}</p><p class="mt-auto text-xs text-slate-500">Total repairs</p></div>
    <div class="card p-4 text-center flex flex-col"><p class="text-2xl sm:text-3xl font-bold">{data.stats.totalEvents}</p><p class="mt-auto text-xs text-slate-500">Events held</p></div>
    <div class="card p-4 text-center flex flex-col"><p class="text-2xl sm:text-3xl font-bold">{Number(data.stats.totalSavingsKg).toFixed(1)}<span class="text-base">kg</span></p><p class="mt-auto text-xs text-slate-500">Saved</p></div>
    <div class="card p-4 text-center flex flex-col"><p class="text-2xl sm:text-3xl font-bold">{data.stats.activeRepairers}</p><p class="mt-auto text-xs text-slate-500">Active repairers</p></div>
  </div>

  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-3">Recent activity</h2>
    <ul class="card divide-y divide-slate-100">
      {#each data.recentActivity as a}
        {@const d = describeActivity(a)}
        {@const link = activityLink(a)}
        <li class="px-4 py-2.5 text-sm flex justify-between items-baseline gap-3">
          <span class="text-slate-700 min-w-0">
            {#if d.who}<span class="font-semibold text-slate-900">{d.who}</span>{/if}
            {#if link}<a href={link} class="hover:underline">{d.rest}</a>{:else}{d.rest}{/if}
          </span>
          <span class="text-slate-400 text-xs whitespace-nowrap shrink-0" title={new Date(a.createdAt).toLocaleString()}>
            {formatDistanceToNowStrict(new Date(a.createdAt), { addSuffix: true })}
          </span>
        </li>
      {:else}
        <li class="px-4 py-3 text-sm text-slate-500">No activity yet.</li>
      {/each}
    </ul>
  </section>
{/if}
