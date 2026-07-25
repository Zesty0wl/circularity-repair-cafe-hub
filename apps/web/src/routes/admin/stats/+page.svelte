<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { CalendarDays, Wrench, Users, Leaf, Clock, CheckCircle2 } from 'lucide-svelte';

  type Range = '3m' | '6m' | '12m' | 'all';
  type Overview = {
    range: Range;
    eventCount: number;
    repairCount: number;
    completedCount: number;
    cannotRepairCount: number;
    returnedCount: number;
    successRate: number;
    repairerCount: number;
    avgDurationMin: number;
    avgRepairsPerEvent: number;
    environmentalSavingKg: number;
  };
  type HeatmapDay = { day: string; events: number; repairs: number; completed: number };
  type EventRow = {
    id: string;
    name: string;
    date: string;
    status: string;
    venueName: string;
    repairCount: number;
    completedCount: number;
    cannotRepairCount: number;
    repairerCount: number;
    avgDurationMin: number;
  };

  let range: Range = '12m';
  let overview: Overview | null = null;
  let heatmap: HeatmapDay[] = [];
  let events: EventRow[] = [];
  let busy = false;

  const RANGE_LABELS: Record<Range, string> = {
    '3m': 'Last 3 months',
    '6m': 'Last 6 months',
    '12m': 'Last 12 months',
    all: 'All time',
  };

  async function loadAll() {
    busy = true;
    try {
      [overview, heatmap, events] = await Promise.all([
        api<Overview>(`/api/admin/stats/overview?range=${range}`),
        api<HeatmapDay[]>(`/api/admin/stats/heatmap`),
        api<EventRow[]>(`/api/admin/stats/events?range=${range}`),
      ]);
    } finally {
      busy = false;
    }
  }

  async function setRange(r: Range) {
    range = r;
    await loadAll();
  }

  onMount(loadAll);

  // ── Heatmap geometry ────────────────────────────────────────────────
  // GitHub-style: 53 columns (weeks) × 7 rows (days, Mon → Sun).
  // We anchor on today, walk back ~365 days, then snap to the Monday
  // before that so each column is a full ISO week.
  type Cell = { day: HeatmapDay | null; date: Date; inRange: boolean };
  type WeekCol = { cells: Cell[]; monthLabel: string | null };

  function startOfWeek(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7; // Mon = 0 .. Sun = 6
    x.setDate(x.getDate() - dow);
    return x;
  }
  function fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function prettyDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  $: byDay = new Map<string, HeatmapDay>(heatmap.map((h) => [h.day, h]));
  $: weeks = buildWeeks(byDay);

  function buildWeeks(map: Map<string, HeatmapDay>): WeekCol[] {
    const today = new Date();
    const end = startOfWeek(today); // Monday of this week
    end.setDate(end.getDate() + 7); // include this week
    const start = new Date(end);
    start.setDate(start.getDate() - 53 * 7);
    const cols: WeekCol[] = [];
    let cursor = new Date(start);
    let lastMonth = -1;
    while (cursor < end) {
      const cells: Cell[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor);
        d.setDate(cursor.getDate() + i);
        const iso = fmtDate(d);
        const inRange = d <= today;
        cells.push({ day: map.get(iso) ?? null, date: d, inRange });
      }
      const first = cells[0].date;
      const showMonth = first.getMonth() !== lastMonth && first.getDate() <= 7;
      lastMonth = first.getMonth();
      cols.push({ cells, monthLabel: showMonth ? first.toLocaleDateString(undefined, { month: 'short' }) : null });
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
    }
    return cols;
  }

  // 5-step colour scale based on repair count, using the brand palette
  // so the heatmap follows the cafe's primary colour automatically.
  function bucket(count: number): number {
    if (count <= 0) return 0;
    if (count <= 3) return 1;
    if (count <= 6) return 2;
    if (count <= 12) return 3;
    return 4;
  }
  const BUCKET_CLASS = [
    'bg-slate-100',
    'bg-brand-100',
    'bg-brand-300',
    'bg-brand-500',
    'bg-brand-700',
  ];

  function fmtDuration(min: number): string {
    if (!min || min <= 0) return '-';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  }

  function exportCsv() {
    window.location.href = `/api/admin/repairs/export.csv`;
  }
</script>

<div class="flex flex-wrap items-center justify-between gap-3">
  <h1 class="text-2xl font-bold">Statistics</h1>
  <button class="btn-secondary" on:click={exportCsv}>Export raw data (CSV)</button>
</div>

<!-- Period selector. Applies to summary cards and the events table.
     The heatmap below always shows the last 12 months so the rhythm of
     events stays comparable between visits. -->
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

{#if overview}
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><CalendarDays size={14} /> Events</div>
      <p class="text-2xl font-bold mt-1">{overview.eventCount}</p>
      <p class="text-xs text-slate-400 mt-0.5">{overview.avgRepairsPerEvent} avg per event</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Wrench size={14} /> Items in</div>
      <p class="text-2xl font-bold mt-1">{overview.repairCount}</p>
      <p class="text-xs text-slate-400 mt-0.5">{overview.completedCount} fixed</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><CheckCircle2 size={14} /> Success rate</div>
      <p class="text-2xl font-bold mt-1">{overview.successRate}%</p>
      <p class="text-xs text-slate-400 mt-0.5">{overview.cannotRepairCount} couldn't fix</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Users size={14} /> Volunteers</div>
      <p class="text-2xl font-bold mt-1">{overview.repairerCount}</p>
      <p class="text-xs text-slate-400 mt-0.5">took on a repair</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Clock size={14} /> Avg repair time</div>
      <p class="text-2xl font-bold mt-1">{fmtDuration(overview.avgDurationMin)}</p>
      <p class="text-xs text-slate-400 mt-0.5">from accept to done</p>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-2 text-slate-500 text-xs"><Leaf size={14} /> CO₂ saved</div>
      <p class="text-2xl font-bold mt-1">{overview.environmentalSavingKg.toFixed(1)}<span class="text-sm font-normal text-slate-500"> kg</span></p>
      <p class="text-xs text-slate-400 mt-0.5">est. from completed jobs</p>
    </div>
  </div>
{/if}

<!-- ── Activity heatmap (last 12 months) ───────────────────────────── -->
<div class="card p-4 mt-4 overflow-x-auto">
  <div class="flex items-baseline justify-between mb-3">
    <h2 class="text-lg font-semibold">Activity in the last 12 months</h2>
    <p class="text-xs text-slate-500">{heatmap.length} days with events</p>
  </div>
  <div class="inline-block min-w-full">
    <!-- Month labels -->
    <div class="flex pl-7 mb-1 text-[10px] text-slate-500 select-none">
      {#each weeks as w}
        <div class="w-3 mr-[2px] text-left">{w.monthLabel ?? ''}</div>
      {/each}
    </div>
    <div class="flex">
      <!-- Day-of-week labels (Mon, Wed, Fri) -->
      <div class="flex flex-col mr-1 text-[10px] text-slate-500 select-none" style="gap: 2px;">
        {#each ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as d, i}
          <div class="h-3 leading-3">{i % 2 === 0 ? d : ''}</div>
        {/each}
      </div>
      <div class="flex">
        {#each weeks as w}
          <div class="flex flex-col mr-[2px]" style="gap: 2px;">
            {#each w.cells as c}
              {#if !c.inRange}
                <div class="w-3 h-3"></div>
              {:else}
                <div
                  class="w-3 h-3 rounded-[2px] {BUCKET_CLASS[bucket(c.day?.repairs ?? 0)]}"
                  title={c.day
                    ? `${prettyDate(c.day.day)}: ${c.day.events} event${c.day.events === 1 ? '' : 's'}, ${c.day.repairs} repair${c.day.repairs === 1 ? '' : 's'} (${c.day.completed} fixed)`
                    : prettyDate(fmtDate(c.date))}
                ></div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
    <!-- Legend -->
    <div class="flex items-center gap-2 mt-3 text-[11px] text-slate-500">
      <span>Less</span>
      {#each BUCKET_CLASS as cls}
        <div class="w-3 h-3 rounded-[2px] {cls}"></div>
      {/each}
      <span>More</span>
      <span class="ml-3">(intensity = repairs that day)</span>
    </div>
  </div>
</div>

<!-- ── Events table ──────────────────────────────────────────────── -->
<section class="mt-6">
  <div class="flex items-baseline justify-between mb-2">
    <h2 class="text-lg font-semibold">Events ({RANGE_LABELS[range].toLowerCase()})</h2>
    <p class="text-xs text-slate-500">{events.length} event{events.length === 1 ? '' : 's'}</p>
  </div>
  {#if events.length === 0}
    <div class="card p-6 text-center text-sm text-slate-500">No events in this period.</div>
  {:else}
    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-3 py-2">Date</th>
            <th class="px-3 py-2">Event</th>
            <th class="px-3 py-2">Venue</th>
            <th class="px-3 py-2 text-right">Items</th>
            <th class="px-3 py-2 text-right">Fixed</th>
            <th class="px-3 py-2 text-right">Volunteers</th>
            <th class="px-3 py-2 text-right">Avg time</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each events as e}
            <tr>
              <td class="px-3 py-2 text-slate-600 whitespace-nowrap">{e.date}</td>
              <td class="px-3 py-2 font-medium text-slate-900">{e.name}</td>
              <td class="px-3 py-2 text-slate-600">{e.venueName}</td>
              <td class="px-3 py-2 text-right">{e.repairCount}</td>
              <td class="px-3 py-2 text-right text-emerald-700 font-medium">{e.completedCount}</td>
              <td class="px-3 py-2 text-right">{e.repairerCount}</td>
              <td class="px-3 py-2 text-right text-slate-600">{fmtDuration(e.avgDurationMin)}</td>
              <td class="px-3 py-2 text-right">
                <a class="btn-ghost btn-sm whitespace-nowrap" href={`/admin/stats/events/${e.id}`}>Details</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

