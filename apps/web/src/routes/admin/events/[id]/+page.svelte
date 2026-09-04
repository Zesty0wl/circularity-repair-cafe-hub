<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { goto } from '$app/navigation';
  import { Printer, Download, RotateCw, Copy, Images, Trash2 } from 'lucide-svelte';
  // Aliased: this page already has its own `cafe` holding the admin settings.
  import { cafe as cafeProfile } from '$lib/stores/cafe';

  $: id = $page.params.id;
  let detail: any = null;
  let venues: any[] = [];
  let users: any[] = [];
  let cafe: any = null;
  // How many photos this session has, and how many a visitor can see. Shown
  // so the "Photos" button says whether there is anything to look at.
  let photoCounts: { total: number; published: number } | null = null;

  async function load() {
    [detail, venues, users, cafe] = await Promise.all([
      api(`/api/admin/events/${id}`),
      api('/api/admin/venues'),
      api('/api/admin/users'),
      api('/api/admin/settings'),
    ]);
    await loadPhotoCounts();
  }

  async function loadPhotoCounts() {
    try {
      const res = await api<{ photos: any[]; repairPhotos: any[] }>(`/api/event-gallery/${id}`);
      const all = [...(res.photos ?? []), ...(res.repairPhotos ?? [])];
      photoCounts = {
        total: all.length,
        published: all.filter((p) => p.isPublished).length,
      };
    } catch {
      photoCounts = null;
    }
  }

  onMount(load);

  let error = '';

  async function update(data: any) {
    error = '';
    try {
      await api(`/api/admin/events/${id}`, { method: 'PATCH', json: data });
      await load();
    } catch (err: any) {
      error = err?.message || 'Could not save that change';
    }
  }

  /**
   * Remove a session entirely.
   *
   * Only for one entered by mistake. A session that happened should be
   * cancelled, so the record of it survives. The server refuses to delete
   * anything with repairs against it and says so, which is the case worth
   * protecting.
   */
  async function remove() {
    const jobs = detail?.jobs?.length ?? 0;
    if (jobs > 0) {
      alert(
        `This session has ${jobs} repair${jobs === 1 ? '' : 's'} recorded against it, so it ` +
          'cannot be deleted.\n\nUse Cancel instead. That keeps the record of what happened.',
      );
      return;
    }
    const ok = confirm(
      `Delete "${detail.event.name}" on ${detail.event.date}?\n\n` +
        'Its photographs and the list of who was coming go with it. This cannot be undone.\n\n' +
        'If this session actually happened, use Cancel instead so the record survives.',
    );
    if (!ok) return;
    error = '';
    try {
      await api(`/api/admin/events/${id}`, { method: 'DELETE' });
      goto('/admin/events');
    } catch (err: any) {
      error = err?.message || 'Could not delete this session';
    }
  }

  async function activate() {
    await api(`/api/admin/events/${id}/activate`, { method: 'POST', json: {} });
    await load();
  }
  async function complete() {
    if (!confirm('Mark event as completed?')) return;
    await api(`/api/admin/events/${id}/complete`, { method: 'POST', json: {} });
    await load();
  }
  async function cancel() {
    if (!confirm('Cancel this event?')) return;
    await api(`/api/admin/events/${id}/cancel`, { method: 'POST', json: {} });
    await load();
  }
  async function regenerate() {
    await api(`/api/admin/events/${id}/regenerate-qr`, { method: 'POST', json: {} });
    await load();
  }
  async function clone() {
    const date = prompt('New event date (YYYY-MM-DD)?');
    if (!date) return;
    const res = await api<any>(`/api/admin/events/${id}/clone`, { method: 'POST', json: { date } });
    goto(`/admin/events/${res.id}`);
  }

  async function toggleAttendance(userId: string, checked: boolean) {
    const current = detail.attending.map((a: any) => ({ userId: a.userId, confirmed: a.confirmed }));
    const filtered = current.filter((a: any) => a.userId !== userId);
    if (checked) filtered.push({ userId, confirmed: false });
    await api(`/api/admin/events/${id}/attendance`, { method: 'PUT', json: { repairers: filtered } });
    await load();
  }

  function checkInUrl(): string {
    if (!cafe?.publicUrl || !detail?.event?.checkInToken) return '';
    return `${cafe.publicUrl.replace(/\/$/, '')}/checkin/${detail.event.checkInToken}`;
  }
</script>

{#if !detail}
  <p class="text-slate-500">Loading…</p>
{:else}
  <div class="flex justify-between items-start gap-3">
    <div>
      <h1 class="text-2xl font-bold">{detail.event.name}</h1>
      <p class="text-slate-600">{detail.venue.name} · {detail.event.date} · {detail.event.startTime.slice(0,5)}–{detail.event.endTime.slice(0,5)}</p>
      <span class="badge badge-{detail.event.status} mt-2">{detail.event.status}</span>
    </div>
    <div class="flex flex-wrap gap-2 justify-end">
      {#if detail.event.status === 'scheduled'}
        <button class="btn-primary" on:click={activate}>Activate</button>
      {/if}
      {#if detail.event.status === 'active'}
        <button class="btn-danger" on:click={complete}>End event</button>
      {/if}
      {#if detail.event.status !== 'cancelled' && detail.event.status !== 'completed'}
        <button class="btn-ghost" on:click={cancel}>Cancel</button>
      {/if}
      <a class="btn-secondary" href={`/admin/events/${id}/gallery`}>
        <Images size={16} /> Photos{#if photoCounts && photoCounts.total > 0}<span class="font-normal text-slate-500"> ({photoCounts.total})</span>{/if}
      </a>
      <button class="btn-secondary" on:click={clone}><Copy size={16} /> Clone</button>
      <!-- Quiet, not a solid red button: deleting a session is rare and should
           not sit here looking like the obvious next step. -->
      <button class="btn-danger-outline" on:click={remove}><Trash2 size={16} /> Delete</button>
    </div>
  </div>

  {#if error}
    <p class="mt-4 rounded-lg bg-red-50 text-red-800 px-4 py-2 text-sm">{error}</p>
  {/if}

  {#if photoCounts && photoCounts.total === 0}
    <p class="mt-3 text-sm text-slate-500">
      No photos yet. Adding a few makes this session's page on the public site far more interesting.
    </p>
  {/if}

  <div class="grid md:grid-cols-2 gap-4 mt-6">
    <div class="card p-5">
      <h2 class="text-lg font-semibold">QR code</h2>
      {#if detail.event.qrCodeUrl}
        <img src={detail.event.qrCodeUrl} alt="QR Code" class="mt-3 w-48 h-48" />
        <p class="mt-2 text-xs text-slate-500 break-all">{checkInUrl()}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a href={detail.event.qrCodeUrl} download class="btn-secondary btn-sm"><Download size={14} /> Download PNG</a>
          <a href={`/admin/events/${id}/print`} target="_blank" class="btn-secondary btn-sm"><Printer size={14} /> Print view</a>
          <button class="btn-ghost btn-sm" on:click={regenerate}><RotateCw size={14} /> Regenerate</button>
        </div>
      {:else}
        <p class="mt-3 text-sm text-slate-500">QR not yet generated</p>
        <button class="btn-secondary mt-3" on:click={regenerate}>Generate QR</button>
      {/if}
    </div>

    <!-- Everything about the session is editable here. It used to offer only
         the venue, the notes and whether it was published, so a session put in
         with the wrong date or a typo in its name could never be corrected. -->
    <div class="card p-5">
      <h2 class="text-lg font-semibold">Details</h2>
      <p class="text-xs text-slate-500 mt-1">Changes save as you go.</p>

      <div class="mt-3">
        <label class="label" for="ename">Name</label>
        <input id="ename" class="input" value={detail.event.name}
          on:blur={(e) => e.currentTarget.value !== detail.event.name && update({ name: e.currentTarget.value })} />
      </div>

      <div class="mt-3">
        <label class="label" for="edate">Date</label>
        <input id="edate" type="date" class="input" value={detail.event.date}
          on:change={(e) => update({ date: e.currentTarget.value })} />
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="estart">Starts</label>
          <input id="estart" type="time" class="input" value={detail.event.startTime.slice(0, 5)}
            on:change={(e) => update({ startTime: e.currentTarget.value })} />
        </div>
        <div>
          <label class="label" for="eend">Ends</label>
          <input id="eend" type="time" class="input" value={detail.event.endTime.slice(0, 5)}
            on:change={(e) => update({ endTime: e.currentTarget.value })} />
        </div>
      </div>

      <div class="mt-3">
        <label class="label" for="vid">Venue</label>
        <select id="vid" class="input" value={detail.event.venueId} on:change={(e) => update({ venueId: e.currentTarget.value })}>
          {#each venues as v}<option value={v.id}>{v.name}</option>{/each}
        </select>
      </div>

      <div class="mt-3">
        <label class="label" for="edesc">Description</label>
        <textarea id="edesc" class="input" rows="3"
          on:blur={(e) => e.currentTarget.value !== (detail.event.description ?? '') && update({ description: e.currentTarget.value || null })}
        >{detail.event.description ?? ''}</textarea>
        <p class="mt-1 text-xs text-slate-500">Shown to visitors on the public events page.</p>
      </div>

      <label class="mt-3 flex items-center gap-2"><input type="checkbox" checked={detail.event.isPublished} on:change={(e) => update({ isPublished: e.currentTarget.checked })} /> Published on public calendar</label>

      {#if $cafeProfile?.linuxEnabled}
        <label class="mt-3 flex items-start gap-2">
          <input type="checkbox" class="mt-1" checked={detail.event.supportsLinux} on:change={(e) => update({ supportsLinux: e.currentTarget.checked })} />
          <span>
            Linux help at this session
            <span class="block text-xs text-slate-500">
              Says so on your public calendar, and lets you file Linux installs against this session.
            </span>
          </span>
        </label>
      {/if}

      <div class="mt-3">
        <label class="label" for="notes">Admin notes</label>
        <textarea id="notes" class="input" rows="3" on:blur={(e) => update({ notes: e.currentTarget.value })}>{detail.event.notes ?? ''}</textarea>
        <p class="mt-1 text-xs text-slate-500">Only visible here, never to visitors.</p>
      </div>
    </div>
  </div>

  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-2">Attending repairers</h2>
    <div class="card p-4 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
      {#each users.filter((u: any) => u.isActive) as u}
        {@const attending = detail.attending.find((a: any) => a.userId === u.id)}
        <label class="flex items-center gap-2">
          <input type="checkbox" checked={!!attending} on:change={(e) => toggleAttendance(u.id, e.currentTarget.checked)} />
          <span>{u.displayName}</span>
        </label>
      {/each}
    </div>
  </section>

  <section class="mt-6">
    <h2 class="text-lg font-semibold mb-2">Repair jobs ({detail.jobs.length})</h2>
    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr><th class="px-3 py-2">Job</th><th class="px-3 py-2">Item</th><th class="px-3 py-2">Customer</th><th class="px-3 py-2">Status</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each detail.jobs as j}
            <tr>
              <td class="px-3 py-2 font-mono">{j.jobNumber}</td>
              <td class="px-3 py-2">{j.itemDescription}</td>
              <td class="px-3 py-2">{j.customerName ?? '-'}</td>
              <td class="px-3 py-2"><span class="badge badge-{j.status}">{j.status}</span></td>
            </tr>
          {:else}
            <tr><td colspan="4" class="px-3 py-4 text-center text-slate-500">No jobs yet</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}
