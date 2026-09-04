<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import {
    LINUX_DEVICE_TYPES,
    LINUX_PREVIOUS_OS,
    LINUX_OUTCOMES,
  } from '@circularity/shared';
  import { Laptop, Plus, Trash2, Pencil, Leaf, Users, CheckCircle2, CalendarDays, X } from 'lucide-svelte';

  type Range = '3m' | '6m' | '12m' | 'all';
  const RANGE_LABELS: Record<Range, string> = {
    '3m': 'Last 3 months',
    '6m': 'Last 6 months',
    '12m': 'Last 12 months',
    all: 'All time',
  };

  interface Install {
    id: string;
    eventId: string;
    eventName: string;
    eventDate: string;
    repairerId: string | null;
    repairerName: string | null;
    deviceDescription: string;
    deviceBrand: string | null;
    deviceType: string;
    deviceAgeYears: number | null;
    previousOs: string | null;
    distro: string | null;
    outcome: string;
    customerName: string | null;
    customerContact: string | null;
    gdprConsent: boolean;
    notes: string | null;
    co2FactorId: string | null;
    co2SavingKg: number | null;
  }
  interface Session { id: string; name: string; date: string; status: string; venueName: string }
  interface Volunteer { id: string; displayName: string; linuxRepairer: boolean }
  interface Factor { id: string; key: string; label: string; co2eKg: number | null }
  interface Stats {
    range: Range;
    totals: {
      installCount: number;
      installedCount: number;
      advisedCount: number;
      notPossibleCount: number;
      sessionCount: number;
      volunteerCount: number;
      linuxRepairerCount: number;
      installRate: number;
      avgPerSession: number;
      co2SavedKg: number;
    };
    byPreviousOs: Array<{ key: string; count: number }>;
    byDistro: Array<{ key: string; count: number }>;
    byOutcome: Array<{ key: string; count: number }>;
    byDeviceType: Array<{ key: string; count: number }>;
    byVolunteer: Array<{ id: string; displayName: string; count: number; installedCount: number }>;
    bySession: Array<{ id: string; name: string; date: string; count: number; installedCount: number }>;
  }

  let installs: Install[] = [];
  let sessions: Session[] = [];
  let volunteers: Volunteer[] = [];
  let factors: Factor[] = [];
  let stats: Stats | null = null;
  let range: Range = '12m';
  let busy = false;
  let loadError = '';

  // ── The write-up form ─────────────────────────────────────────────
  // One form for adding and for correcting. `editing` holds the record being
  // changed, or null when this is a new one.
  let formOpen = false;
  let editing: Install | null = null;
  let formError = '';
  let form = blankForm();

  function blankForm() {
    return {
      eventId: '',
      deviceDescription: '',
      deviceBrand: '',
      deviceType: 'laptop',
      deviceAgeYears: '' as string | number,
      previousOs: 'windows_10',
      distro: '',
      outcome: 'installed',
      repairerId: '',
      customerName: '',
      customerContact: '',
      gdprConsent: false,
      notes: '',
      co2FactorId: '',
    };
  }

  // Labels, so a stored value like "windows_10" is never shown to anybody raw.
  const DEVICE_LABEL = new Map(LINUX_DEVICE_TYPES.map((o) => [o.value as string, o.label]));
  const OS_LABEL = new Map(LINUX_PREVIOUS_OS.map((o) => [o.value as string, o.label]));
  const OUTCOME_LABEL = new Map(LINUX_OUTCOMES.map((o) => [o.value as string, o.label]));
  function label(map: Map<string, string>, key: string | null): string {
    if (!key) return 'Not recorded';
    return map.get(key) ?? (key === 'unknown' ? 'Not recorded' : key);
  }

  // Green for a computer that went home running Linux, amber for advice, grey
  // for one that could not be done. Colour carries the same meaning everywhere.
  function outcomeClass(outcome: string): string {
    if (outcome === 'installed' || outcome === 'dual_boot') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    if (outcome === 'not_possible') return 'bg-slate-100 text-slate-600 ring-slate-200';
    return 'bg-amber-50 text-amber-800 ring-amber-200';
  }

  async function loadAll() {
    busy = true;
    loadError = '';
    try {
      const [context, list, report] = await Promise.all([
        api<{ sessions: Session[]; volunteers: Volunteer[]; co2Factors: Factor[] }>('/api/admin/linux/context'),
        api<Install[]>('/api/admin/linux/installs'),
        api<Stats>(`/api/admin/linux/stats?range=${range}`),
      ]);
      sessions = context.sessions;
      volunteers = context.volunteers;
      factors = context.co2Factors;
      installs = list;
      stats = report;
    } catch (err: any) {
      loadError = err?.message ?? 'Could not load the Linux records';
    } finally {
      busy = false;
    }
  }

  async function setRange(r: Range) {
    range = r;
    try {
      stats = await api<Stats>(`/api/admin/linux/stats?range=${range}`);
    } catch { /* the figures already on screen stay */ }
  }

  onMount(loadAll);

  function openNew() {
    editing = null;
    form = blankForm();
    // Default to the most recent Linux session, which is almost always the one
    // being written up.
    form.eventId = sessions[0]?.id ?? '';
    // And to a medium laptop, which is what most people bring.
    form.co2FactorId = factors.find((f) => f.key === 'laptop_medium')?.id ?? '';
    formError = '';
    formOpen = true;
  }

  function openEdit(install: Install) {
    editing = install;
    form = {
      eventId: install.eventId,
      deviceDescription: install.deviceDescription,
      deviceBrand: install.deviceBrand ?? '',
      deviceType: install.deviceType,
      deviceAgeYears: install.deviceAgeYears ?? '',
      previousOs: install.previousOs ?? '',
      distro: install.distro ?? '',
      outcome: install.outcome,
      repairerId: install.repairerId ?? '',
      customerName: install.customerName ?? '',
      customerContact: install.customerContact ?? '',
      gdprConsent: install.gdprConsent,
      notes: install.notes ?? '',
      co2FactorId: install.co2FactorId ?? '',
    };
    formError = '';
    formOpen = true;
  }

  function closeForm() {
    formOpen = false;
    editing = null;
    formError = '';
  }

  $: keepsPersonalDetails = Boolean(form.customerName.trim()) || Boolean(form.customerContact.trim());

  async function save() {
    formError = '';
    if (!form.eventId) {
      formError = 'Choose the session this computer came to.';
      return;
    }
    if (!form.deviceDescription.trim()) {
      formError = 'Say what the computer is, for example "Dell Latitude E7450".';
      return;
    }
    if (keepsPersonalDetails && !form.gdprConsent) {
      formError = 'Confirm the visitor is happy for their details to be stored, or clear the name and contact.';
      return;
    }
    const age = form.deviceAgeYears === '' ? null : Number(form.deviceAgeYears);
    const payload: Record<string, unknown> = {
      deviceDescription: form.deviceDescription.trim(),
      deviceBrand: form.deviceBrand.trim() || null,
      deviceType: form.deviceType,
      deviceAgeYears: age !== null && Number.isFinite(age) ? age : null,
      previousOs: form.previousOs || null,
      distro: form.distro.trim() || null,
      outcome: form.outcome,
      repairerId: form.repairerId || null,
      customerName: form.customerName.trim() || null,
      customerContact: form.customerContact.trim() || null,
      gdprConsent: form.gdprConsent,
      notes: form.notes.trim() || null,
      co2FactorId: form.co2FactorId || null,
    };
    busy = true;
    try {
      if (editing) {
        await api(`/api/admin/linux/installs/${editing.id}`, { method: 'PATCH', json: payload });
      } else {
        await api('/api/admin/linux/installs', { method: 'POST', json: { ...payload, eventId: form.eventId } });
      }
      closeForm();
      await loadAll();
    } catch (err: any) {
      formError = err?.message ?? 'Could not save this record';
    } finally {
      busy = false;
    }
  }

  async function remove(install: Install) {
    if (!confirm(`Delete the record for "${install.deviceDescription}"? This cannot be undone.`)) return;
    busy = true;
    try {
      await api(`/api/admin/linux/installs/${install.id}`, { method: 'DELETE' });
      await loadAll();
    } finally {
      busy = false;
    }
  }

  function exportCsv() {
    window.location.href = '/api/admin/linux/installs.csv';
  }

  function prettyDate(iso: string): string {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
  }

  // A bar is drawn against the biggest count in its own list, so a breakdown
  // reads at a glance without needing a chart library.
  function share(count: number, rows: Array<{ count: number }>): number {
    const max = Math.max(...rows.map((r) => r.count), 1);
    return Math.round((count / max) * 100);
  }
</script>

<div class="flex flex-wrap items-center justify-between gap-3">
  <h1 class="text-2xl font-bold flex items-center gap-2"><Laptop size={22} class="text-brand-600" /> Linux Repair Cafe</h1>
  <div class="flex gap-2">
    <button class="btn-secondary" on:click={exportCsv}>Export (CSV)</button>
    <button class="btn-primary" on:click={openNew} disabled={busy}><Plus size={16} /> Record an install</button>
  </div>
</div>

{#if loadError}
  <div class="card p-6 mt-4 text-sm">
    <p class="text-rose-700 font-medium">{loadError}</p>
    <p class="mt-2 text-slate-600">
      If you have just switched this feature off, that is why. Turn it back on under
      <a href="/admin/settings?tab=linux" class="text-brand-700 underline underline-offset-2">Settings</a>.
      Nothing has been deleted.
    </p>
  </div>
{:else}
  {#if sessions.length === 0}
    <div class="card p-4 mt-4 bg-amber-50 ring-amber-200 text-sm text-amber-900">
      <p class="font-semibold">No sessions offer Linux help yet.</p>
      <p class="mt-1">
        Tick <span class="font-medium">Linux help at this session</span> on a session under
        <a href="/admin/events" class="underline underline-offset-2">Events</a>.
        Until then there is nowhere to file an install, and visitors cannot see when to come.
      </p>
    </div>
  {/if}

  <!-- Period selector, for the figures below. The records list always shows
       everything, because a volunteer looking for one row wants all of them. -->
  <div class="mt-4 inline-flex rounded-lg ring-1 ring-slate-200 bg-white overflow-hidden text-sm">
    {#each (['3m','6m','12m','all'] as Range[]) as r}
      <button
        class="px-3 py-1.5 {range === r ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-50'}"
        on:click={() => setRange(r)}
        disabled={busy}
      >
        {RANGE_LABELS[r]}
      </button>
    {/each}
  </div>

  {#if stats}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
      <div class="card p-4">
        <div class="flex items-center gap-2 text-slate-500 text-xs"><Laptop size={14} /> Computers seen</div>
        <p class="text-2xl font-bold mt-1">{stats.totals.installCount}</p>
        <p class="text-xs text-slate-400 mt-0.5">{stats.totals.avgPerSession} avg per session</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center gap-2 text-slate-500 text-xs"><CheckCircle2 size={14} /> Now on Linux</div>
        <p class="text-2xl font-bold mt-1">{stats.totals.installedCount}</p>
        <p class="text-xs text-slate-400 mt-0.5">{stats.totals.installRate}% of those seen</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center gap-2 text-slate-500 text-xs"><Users size={14} /> Advised</div>
        <p class="text-2xl font-bold mt-1">{stats.totals.advisedCount}</p>
        <p class="text-xs text-slate-400 mt-0.5">tried it, or talked it through</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center gap-2 text-slate-500 text-xs"><CalendarDays size={14} /> Sessions</div>
        <p class="text-2xl font-bold mt-1">{stats.totals.sessionCount}</p>
        <p class="text-xs text-slate-400 mt-0.5">with a computer written up</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center gap-2 text-slate-500 text-xs"><Users size={14} /> Volunteers</div>
        <p class="text-2xl font-bold mt-1">{stats.totals.volunteerCount}</p>
        <p class="text-xs text-slate-400 mt-0.5">{stats.totals.linuxRepairerCount} marked for Linux</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center gap-2 text-slate-500 text-xs"><Leaf size={14} /> CO₂ saved</div>
        <p class="text-2xl font-bold mt-1">{stats.totals.co2SavedKg.toFixed(1)}<span class="text-sm font-normal text-slate-500"> kg</span></p>
        <p class="text-xs text-slate-400 mt-0.5">from computers kept in use</p>
      </div>
    </div>

    <!-- The two breakdowns worth publishing: what people were escaping from,
         and what they went home with. -->
    <div class="grid md:grid-cols-2 gap-4 mt-4">
      <div class="card p-4">
        <h2 class="text-lg font-semibold">What they ran before</h2>
        <p class="text-xs text-slate-500 mt-0.5">Windows 10 lost support in October 2025, which is why most machines arrive.</p>
        {#if stats.byPreviousOs.length === 0}
          <p class="text-sm text-slate-500 mt-3">Nothing recorded in this period.</p>
        {:else}
          <ul class="mt-3 space-y-2">
            {#each stats.byPreviousOs as row}
              <li>
                <div class="flex items-baseline justify-between text-sm">
                  <span class="text-slate-700">{label(OS_LABEL, row.key)}</span>
                  <span class="font-medium text-slate-900">{row.count}</span>
                </div>
                <div class="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div class="h-full rounded-full bg-brand-500" style={`width: ${share(row.count, stats.byPreviousOs)}%`}></div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="card p-4">
        <h2 class="text-lg font-semibold">Which Linux they went home with</h2>
        <p class="text-xs text-slate-500 mt-0.5">Counted over the computers that went home running Linux.</p>
        {#if stats.byDistro.length === 0}
          <p class="text-sm text-slate-500 mt-3">Nothing recorded in this period.</p>
        {:else}
          <ul class="mt-3 space-y-2">
            {#each stats.byDistro as row}
              <li>
                <div class="flex items-baseline justify-between text-sm">
                  <span class="text-slate-700">{row.key}</span>
                  <span class="font-medium text-slate-900">{row.count}</span>
                </div>
                <div class="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div class="h-full rounded-full bg-brand-500" style={`width: ${share(row.count, stats.byDistro)}%`}></div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="card p-4">
        <h2 class="text-lg font-semibold">How it went</h2>
        {#if stats.byOutcome.length === 0}
          <p class="text-sm text-slate-500 mt-3">Nothing recorded in this period.</p>
        {:else}
          <ul class="mt-3 space-y-2">
            {#each stats.byOutcome as row}
              <li class="flex items-baseline justify-between text-sm">
                <span class="text-slate-700">{label(OUTCOME_LABEL, row.key)}</span>
                <span class="font-medium text-slate-900">{row.count}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="card p-4">
        <h2 class="text-lg font-semibold">Who did them</h2>
        {#if stats.byVolunteer.length === 0}
          <p class="text-sm text-slate-500 mt-3">Nothing recorded in this period.</p>
        {:else}
          <ul class="mt-3 space-y-2">
            {#each stats.byVolunteer as row}
              <li class="flex items-baseline justify-between text-sm">
                <span class="text-slate-700">{row.displayName}</span>
                <span class="text-slate-500">
                  {row.count} <span class="text-emerald-700 font-medium">({row.installedCount} on Linux)</span>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── The records ────────────────────────────────────────────────── -->
  <section class="mt-6">
    <div class="flex items-baseline justify-between mb-2">
      <h2 class="text-lg font-semibold">Every computer written up</h2>
      <p class="text-xs text-slate-500">{installs.length} record{installs.length === 1 ? '' : 's'}</p>
    </div>
    {#if installs.length === 0}
      <div class="card p-6 text-center text-sm text-slate-500">
        <p>Nothing written up yet.</p>
        <p class="mt-1">Use <span class="font-medium">Record an install</span> after a session to write up what came in.</p>
      </div>
    {:else}
      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">Session</th>
              <th class="px-3 py-2">Computer</th>
              <th class="px-3 py-2">Was running</th>
              <th class="px-3 py-2">Linux</th>
              <th class="px-3 py-2">Outcome</th>
              <th class="px-3 py-2">Volunteer</th>
              <th class="px-3 py-2 text-right">CO₂</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each installs as it}
              <tr>
                <td class="px-3 py-2 text-slate-600 whitespace-nowrap">{prettyDate(it.eventDate)}</td>
                <td class="px-3 py-2">
                  <span class="font-medium text-slate-900">{it.deviceDescription}</span>
                  <span class="block text-xs text-slate-500">
                    {label(DEVICE_LABEL, it.deviceType)}{#if it.deviceAgeYears}, about {it.deviceAgeYears} years old{/if}
                  </span>
                </td>
                <td class="px-3 py-2 text-slate-600">{label(OS_LABEL, it.previousOs)}</td>
                <td class="px-3 py-2 text-slate-600">{it.distro || '-'}</td>
                <td class="px-3 py-2">
                  <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 {outcomeClass(it.outcome)}">
                    {label(OUTCOME_LABEL, it.outcome)}
                  </span>
                </td>
                <td class="px-3 py-2 text-slate-600">{it.repairerName ?? '-'}</td>
                <td class="px-3 py-2 text-right text-slate-600 whitespace-nowrap">
                  {it.co2SavingKg === null ? '-' : `${Number(it.co2SavingKg).toFixed(1)} kg`}
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <button class="btn-ghost btn-sm" on:click={() => openEdit(it)} title="Edit" aria-label={`Edit ${it.deviceDescription}`}>
                    <Pencil size={14} />
                  </button>
                  <button class="btn-ghost btn-sm text-rose-600" on:click={() => remove(it)} title="Delete" aria-label={`Delete ${it.deviceDescription}`}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{/if}

<!-- ── Write-up form ────────────────────────────────────────────────── -->
{#if formOpen}
  <div class="fixed inset-0 z-50 bg-slate-900/50 overflow-y-auto p-4">
    <div class="card max-w-2xl mx-auto my-8 p-6 space-y-4 bg-white">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold">{editing ? 'Correct this record' : 'Record an install'}</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            One record per computer. It takes about a minute, and it is what your figures are built from.
          </p>
        </div>
        <button class="btn-ghost !px-2" on:click={closeForm} aria-label="Close"><X size={18} /></button>
      </div>

      {#if !editing}
        <div>
          <label class="label" for="li-event">Which session</label>
          <select id="li-event" class="input" bind:value={form.eventId}>
            <option value="">Choose a session…</option>
            {#each sessions as s}
              <option value={s.id}>{prettyDate(s.date)} · {s.name} · {s.venueName}</option>
            {/each}
          </select>
        </div>
      {:else}
        <p class="text-sm text-slate-600">
          Session: <span class="font-medium text-slate-800">{prettyDate(editing.eventDate)}, {editing.eventName}</span>
        </p>
      {/if}

      <div class="grid sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2">
          <label class="label" for="li-device">What is the computer</label>
          <input id="li-device" class="input" placeholder="Dell Latitude E7450" bind:value={form.deviceDescription} />
          <p class="text-xs text-slate-500 mt-1">The make and model if you know it. Anything recognisable will do.</p>
        </div>
        <div>
          <label class="label" for="li-type">Kind of computer</label>
          <select id="li-type" class="input" bind:value={form.deviceType}>
            {#each LINUX_DEVICE_TYPES as o}<option value={o.value}>{o.label}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="li-age">Roughly how old (years)</label>
          <input id="li-age" class="input" type="number" min="0" max="60" placeholder="8" bind:value={form.deviceAgeYears} />
        </div>
        <div>
          <label class="label" for="li-prev">What it ran before</label>
          <select id="li-prev" class="input" bind:value={form.previousOs}>
            <option value="">Not recorded</option>
            {#each LINUX_PREVIOUS_OS as o}<option value={o.value}>{o.label}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="li-distro">Which Linux went on</label>
          <input id="li-distro" class="input" placeholder="Linux Mint 22" bind:value={form.distro} />
        </div>
        <div>
          <label class="label" for="li-outcome">How it went</label>
          <select id="li-outcome" class="input" bind:value={form.outcome}>
            {#each LINUX_OUTCOMES as o}<option value={o.value}>{o.label}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="li-repairer">Who did it</label>
          <select id="li-repairer" class="input" bind:value={form.repairerId}>
            <option value="">Me</option>
            {#each volunteers as v}
              <option value={v.id}>{v.displayName}{v.linuxRepairer ? '' : ' (not marked for Linux)'}</option>
            {/each}
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="li-co2">For the CO₂ figure, this is closest to</label>
          <select id="li-co2" class="input" bind:value={form.co2FactorId}>
            <option value="">Do not work out a figure</option>
            {#each factors as f}
              <option value={f.id}>{f.label}{f.co2eKg ? ` (${f.co2eKg.toFixed(0)} kg to make one)` : ''}</option>
            {/each}
          </select>
          <p class="text-xs text-slate-500 mt-1">
            Worked out the same way as a repair, so this total and your repair total can be added
            together. Only counted when the computer went home running Linux.
          </p>
        </div>
      </div>

      <details class="rounded-lg border border-slate-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-slate-700">
          Visitor details and notes (optional)
        </summary>
        <div class="mt-3 space-y-3">
          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="label" for="li-name">Visitor name</label>
              <input id="li-name" class="input" bind:value={form.customerName} />
            </div>
            <div>
              <label class="label" for="li-contact">Contact</label>
              <input id="li-contact" class="input" bind:value={form.customerContact} />
            </div>
          </div>
          {#if keepsPersonalDetails}
            <label class="flex items-start gap-3 rounded-lg bg-amber-50 ring-1 ring-amber-200 p-3 text-sm">
              <input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600" bind:checked={form.gdprConsent} />
              <span class="text-amber-900">
                The visitor is happy for us to keep their details.
                <span class="block text-xs mt-0.5">
                  Kept for as long as your retention setting says, then removed automatically.
                  Leave the name and contact blank if you would rather not hold them at all.
                </span>
              </span>
            </label>
          {/if}
          <div>
            <label class="label" for="li-notes">Notes</label>
            <textarea id="li-notes" class="input" rows="3" placeholder="Anything worth remembering, for example a program they needed that does not run on Linux." bind:value={form.notes}></textarea>
          </div>
        </div>
      </details>

      {#if formError}<p class="text-sm text-rose-700">{formError}</p>{/if}

      <div class="flex justify-end gap-2 pt-2 border-t">
        <button class="btn-secondary" on:click={closeForm} disabled={busy}>Cancel</button>
        <button class="btn-primary" on:click={save} disabled={busy}>
          {editing ? 'Save changes' : 'Save record'}
        </button>
      </div>
    </div>
  </div>
{/if}
