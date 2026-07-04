<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { goto } from '$app/navigation';
  import { Printer, Download, RotateCw, Copy } from 'lucide-svelte';

  $: id = $page.params.id;
  let detail: any = null;
  let venues: any[] = [];
  let users: any[] = [];
  let cafe: any = null;

  async function load() {
    [detail, venues, users, cafe] = await Promise.all([
      api(`/api/admin/events/${id}`),
      api('/api/admin/venues'),
      api('/api/admin/users'),
      api('/api/admin/settings'),
    ]);
  }

  onMount(load);

  async function update(data: any) {
    await api(`/api/admin/events/${id}`, { method: 'PATCH', json: data });
    await load();
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
      <button class="btn-secondary" on:click={clone}><Copy size={16} /> Clone</button>
    </div>
  </div>

  <div class="grid md:grid-cols-2 gap-4 mt-6">
    <div class="card p-5">
      <h2 class="font-semibold">QR code</h2>
      {#if detail.event.qrCodeUrl}
        <img src={detail.event.qrCodeUrl} alt="QR Code" class="mt-3 w-48 h-48" />
        <p class="mt-2 text-xs text-slate-500 break-all">{checkInUrl()}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a href={detail.event.qrCodeUrl} download class="btn-secondary text-sm"><Download size={14} /> Download PNG</a>
          <a href={`/admin/events/${id}/print`} target="_blank" class="btn-secondary text-sm"><Printer size={14} /> Print view</a>
          <button class="btn-ghost text-sm" on:click={regenerate}><RotateCw size={14} /> Regenerate</button>
        </div>
      {:else}
        <p class="mt-3 text-sm text-slate-500">QR not yet generated</p>
        <button class="btn-secondary mt-3" on:click={regenerate}>Generate QR</button>
      {/if}
    </div>

    <div class="card p-5">
      <h2 class="font-semibold">Settings</h2>
      <label class="mt-3 flex items-center gap-2"><input type="checkbox" checked={detail.event.isPublished} on:change={(e) => update({ isPublished: e.currentTarget.checked })} /> Published on public calendar</label>
      <div class="mt-3">
        <label class="label" for="vid">Venue</label>
        <select id="vid" class="input" value={detail.event.venueId} on:change={(e) => update({ venueId: e.currentTarget.value })}>
          {#each venues as v}<option value={v.id}>{v.name}</option>{/each}
        </select>
      </div>
      <div class="mt-3">
        <label class="label" for="notes">Admin notes</label>
        <textarea id="notes" class="input" rows="3" on:blur={(e) => update({ notes: e.currentTarget.value })}>{detail.event.notes ?? ''}</textarea>
      </div>
    </div>
  </div>

  <section class="mt-6">
    <h2 class="font-semibold mb-2">Attending repairers</h2>
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
    <h2 class="font-semibold mb-2">Repair jobs ({detail.jobs.length})</h2>
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
