<script lang="ts">
  // Add past sessions from a spreadsheet, so the hub's figures show how long
  // the cafe has really been running. The file is read and checked here in the
  // browser (packages/shared/src/history.ts), shown as a preview, and only then
  // sent to the hub in small parts. Each import can be removed again.
  import { onMount } from 'svelte';
  import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Info, Trash2, TriangleAlert, Upload } from 'lucide-svelte';
  import {
    buildHistoryPreview,
    canImportHistory,
    chunkHistory,
    HISTORY_COLUMNS,
    historySampleCsv,
    type HistoryContext,
    type HistoryPreview,
    type HistorySession,
  } from '@circularity/shared';
  import { api } from '$lib/api';
  import { t, tNow, dateLocale, currentLocale } from '$lib/i18n';
  import JoinDateSuggestions from '$lib/components/JoinDateSuggestions.svelte';

  let context: HistoryContext | null = null;
  let imports: any[] = [];
  let loadError = '';

  let fileName = '';
  let preview: HistoryPreview | null = null;
  let reading = false;
  let publish = false;

  // The import in progress. Parts already sent are skipped if it is resumed.
  let running = false;
  let importId = '';
  let chunks: HistorySession[][] = [];
  let sent = 0;
  let runError = '';
  let finished: { summary: any; joinDates: any[] } | null = null;
  /** Keeps the joined-date box up after it is used, so it can say what changed. */
  let joinDatesShown = false;

  /** Problems shown at once. A long list is cut short, with a count of the rest. */
  const SHOW_PROBLEMS = 50;

  async function load() {
    loadError = '';
    try {
      [context, imports] = await Promise.all([
        api<HistoryContext>('/api/admin/history/context'),
        api<any[]>('/api/admin/history/imports'),
      ]);
    } catch (e: any) {
      loadError = e?.message || tNow('Could not load this page. Please try again.');
    }
  }
  onMount(load);

  function day(date: string | null): string {
    if (!date) return '';
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function downloadSample() {
    const locale = currentLocale();
    const { text } = historySampleCsv(locale, { categoryNames: context?.categories.map((c) => c.name) ?? [] });
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = tNow('past-sessions-sample') + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function chooseFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !context) return;
    reset();
    reading = true;
    fileName = file.name;
    try {
      preview = buildHistoryPreview(await file.text(), context, currentLocale());
    } catch {
      preview = null;
      runError = tNow('That file could not be read. Save it from your spreadsheet as a CSV file and try again.');
    } finally {
      reading = false;
    }
  }

  function reset() {
    preview = null;
    fileName = '';
    importId = '';
    chunks = [];
    sent = 0;
    runError = '';
    finished = null;
    joinDatesShown = false;
    publish = false;
  }

  async function runImport() {
    if (!preview) return;
    running = true;
    runError = '';
    try {
      if (!importId) {
        chunks = chunkHistory(preview.sessions);
        sent = 0;
        importId = (await api<{ id: string }>('/api/admin/history/imports', { method: 'POST', json: { fileName, publish } })).id;
      }
      // Each part is saved in full or not at all, and a part sent twice is
      // ignored, so after a dropped connection it is safe to carry on.
      for (; sent < chunks.length; sent++) {
        await api(`/api/admin/history/imports/${importId}/rows`, { method: 'POST', json: { chunk: sent, sessions: chunks[sent] } });
      }
      finished = await api(`/api/admin/history/imports/${importId}/finish`, { method: 'POST', json: {} });
      joinDatesShown = (finished?.joinDates.length ?? 0) > 0;
      preview = null;
      await load();
    } catch (e: any) {
      runError = e?.message || tNow('The import stopped. Please try again.');
    } finally {
      running = false;
    }
  }

  async function removeImport(entry: any) {
    const question = tNow('Remove the {sessions} sessions and {repairs} repairs this file added? This cannot be undone.', {
      sessions: entry.sessions,
      repairs: entry.repairs,
    });
    if (!confirm(question)) return;
    try {
      await api(`/api/admin/history/imports/${entry.id}`, { method: 'DELETE' });
      if (entry.id === importId) reset();
      await load();
    } catch (e: any) {
      alert(e?.message || tNow('Could not remove it. Please try again.'));
    }
  }

  /** A problem's values, with any date written the reader's way. */
  function varsFor(p: { vars?: Record<string, string | number> }): Record<string, string | number> | undefined {
    if (!p.vars?.date) return p.vars;
    return { ...p.vars, date: day(String(p.vars.date)) };
  }

  function venueName(session: HistorySession): string {
    if (session.newVenueName) return session.newVenueName;
    return context?.venues.find((v) => v.id === session.venueId)?.name ?? '';
  }

  function countOf(session: HistorySession, outcome?: string): number {
    return session.items.filter((i) => !outcome || i.outcome === outcome).reduce((n, i) => n + i.quantity, 0);
  }

  // What each column is for, in the order of the sample file.
  const HELP: Record<string, { what: string; required?: boolean }> = {
    date: { what: 'The day of the session, day first: 14/09/2019. 2019-09-14 also works.', required: true },
    venue: { what: 'Where it was. Leave it empty for your main venue. A name the hub does not know is added as a past venue.' },
    item: { what: 'What the visitor brought. Leave it empty if you only counted items.' },
    category: { what: 'One of your skill categories, such as the ones under Skills. Optional.' },
    brand: { what: 'Optional.' },
    fault: { what: 'What was wrong with it. Optional.' },
    outcome: { what: 'Fixed, Not fixed, or Other (advice given, needs a part, or not known).' },
    quantity: { what: 'How many items this row stands for. Empty means 1. Use it for tallies: "Fixed, 14".' },
    weightKg: { what: 'The weight of one item in kilograms. Optional.' },
    repairer: { what: 'The volunteer who did the repair, by name or email address, as they are in the hub. Optional.' },
    notes: { what: 'Anything else, such as what was done. Optional.' },
  };

  $: errors = preview?.problems.filter((p) => p.severity === 'error') ?? [];
  $: warnings = preview?.problems.filter((p) => p.severity === 'warning') ?? [];
  $: ready = !!preview && canImportHistory(preview);
</script>

<a href="/admin/events" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={14} /> {$t('Events')}</a>
<h1 class="text-2xl font-bold mt-1">{$t('Add past sessions')}</h1>
<p class="mt-2 max-w-3xl text-slate-600">
  {$t('Did your cafe run before you used the hub? Add those sessions and repairs from a spreadsheet. They count in all your totals and charts, so your figures show how long you have really been running.')}
</p>

{#if loadError}
  <p class="mt-4 rounded-lg bg-rose-50 text-rose-800 px-4 py-2 text-sm">{loadError}</p>
{/if}

{#if finished}
  <section class="card p-6 mt-6 max-w-3xl" aria-live="polite">
    <div class="flex items-start gap-3">
      <CheckCircle2 size={22} class="text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
      <div class="min-w-0">
        <h2 class="font-semibold text-lg">{$t('Your past sessions are in the hub')}</h2>
        <p class="text-sm text-slate-600 mt-1">
          {$t('Added {sessions} sessions and {repairs} repairs, from {from} to {to}.', {
            sessions: finished.summary.sessions,
            repairs: finished.summary.repairs,
            from: day(finished.summary.firstDate),
            to: day(finished.summary.lastDate),
          })}
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <a href="/admin/stats" class="btn-primary btn-sm">{$t('See your statistics')}</a>
          <button class="btn-secondary btn-sm" on:click={reset}>{$t('Add another file')}</button>
        </div>
      </div>
    </div>
    {#if finished.joinDates.length || joinDatesShown}
      <div class="mt-5">
        <JoinDateSuggestions suggestions={finished.joinDates} on:updated={() => finished && (finished = { ...finished, joinDates: [] })} />
      </div>
    {/if}
  </section>
{:else}
  <ol class="mt-6 grid gap-4 max-w-3xl">
    <!-- 1. The sample file -->
    <li class="card p-6">
      <p class="kicker">{$t('Step {n}', { n: 1 })}</p>
      <h2 class="font-semibold text-lg mt-1">{$t('Download the sample file')}</h2>
      <p class="text-sm text-slate-600 mt-1">
        {$t('It opens in Excel, Numbers, LibreOffice or Google Sheets. It has the right columns and a few example rows to show how to fill it in.')}
      </p>
      <button class="btn-secondary mt-3" on:click={downloadSample} disabled={!context}>
        <Download size={16} /> {$t('Download the sample file')}
      </button>
    </li>

    <!-- 2. Filling it in -->
    <li class="card p-6">
      <p class="kicker">{$t('Step {n}', { n: 2 })}</p>
      <h2 class="font-semibold text-lg mt-1">{$t('Fill it in')}</h2>
      <ul class="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">
        <li>{$t('Delete the example rows, then add one row for each item.')}</li>
        <li>{$t('Only counted, not listed? Leave Item empty and write the outcome and the number: a row with "Fixed" and "14".')}</li>
        <li>{$t('A row with only a date adds a session where nothing was written down.')}</li>
        <li>{$t('Keep the first row with the column names. You can leave out columns you do not need.')}</li>
        <li>{$t('Save it as a CSV file (in Excel: File, Save As, CSV UTF-8).')}</li>
      </ul>
      <details class="mt-4">
        <summary class="cursor-pointer text-sm font-medium text-brand-700">{$t('What goes in each column')}</summary>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr><th class="px-3 py-2">{$t('Column')}</th><th class="px-3 py-2">{$t('What to write')}</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {#each HISTORY_COLUMNS as column}
                <tr>
                  <td class="px-3 py-2 font-medium whitespace-nowrap align-top">
                    {$t(column.label)}
                    {#if HELP[column.key]?.required}<span class="badge bg-slate-100 text-slate-700 ml-1">{$t('Required')}</span>{/if}
                  </td>
                  <td class="px-3 py-2 text-slate-600">{$t(HELP[column.key]?.what ?? '')}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
    </li>

    <!-- 3. Upload and check -->
    <li class="card p-6">
      <p class="kicker">{$t('Step {n}', { n: 3 })}</p>
      <h2 class="font-semibold text-lg mt-1">{$t('Upload it and check the preview')}</h2>
      <p class="text-sm text-slate-600 mt-1">{$t('Nothing is saved until you press the button under the preview.')}</p>
      <label class="btn-primary mt-3 cursor-pointer {running || !context ? 'opacity-50 pointer-events-none' : ''}">
        <Upload size={16} /> {fileName ? $t('Choose a different file') : $t('Choose your CSV file')}
        <input type="file" accept=".csv,text/csv,text/plain" class="sr-only" on:change={chooseFile} disabled={running || !context} />
      </label>
      {#if reading}<p class="text-sm text-slate-500 mt-2">{$t('Reading the file…')}</p>{/if}
      {#if fileName && !reading}
        <p class="text-sm text-slate-600 mt-2 inline-flex items-center gap-1.5"><FileSpreadsheet size={14} /> {fileName}</p>
      {/if}

      {#if preview}
        {#if errors.length}
          <div class="mt-4 rounded-xl bg-rose-50 ring-1 ring-rose-200 p-4" role="alert">
            <p class="font-semibold text-rose-900 inline-flex items-center gap-1.5"><TriangleAlert size={16} /> {$t('Please fix these in your file, then upload it again')}</p>
            <ul class="mt-2 text-sm text-rose-800 space-y-1">
              {#each errors.slice(0, SHOW_PROBLEMS) as p}
                <li>{#if p.row}<span class="font-medium">{$t('Row {n}', { n: p.row })}:</span>{' '}{/if}{$t(p.message, varsFor(p))}</li>
              {/each}
            </ul>
            {#if errors.length > SHOW_PROBLEMS}<p class="text-sm text-rose-800 mt-2">{$t('And {count} more.', { count: errors.length - SHOW_PROBLEMS })}</p>{/if}
          </div>
        {/if}

        {#if preview.sessions.length}
          <div class="mt-5">
            <h3 class="font-semibold">{$t('What will be added')}</h3>
            <dl class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs text-slate-500">{$t('New sessions')}</dt><dd class="text-xl font-bold">{preview.totals.newSessions}</dd></div>
              <div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs text-slate-500">{$t('Items')}</dt><dd class="text-xl font-bold">{preview.totals.items}</dd></div>
              <div class="rounded-xl bg-emerald-50 p-3"><dt class="text-xs text-emerald-700">{$t('Fixed')}</dt><dd class="text-xl font-bold text-emerald-900">{preview.totals.fixed}</dd></div>
              <div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs text-slate-500">{$t('Not fixed')}</dt><dd class="text-xl font-bold">{preview.totals.notFixed}</dd></div>
            </dl>
            <p class="text-sm text-slate-600 mt-3">
              {$t('From {from} to {to}.', { from: day(preview.totals.firstDate), to: day(preview.totals.lastDate) })}
              {#if preview.totals.other}{$t('{count} items have the outcome "Other".', { count: preview.totals.other })}{/if}
              {#if preview.totals.existingSessions}{$t('{count} sessions you already have get more items.', { count: preview.totals.existingSessions })}{/if}
            </p>
            {#if preview.totals.newVenues.length}
              <p class="text-sm text-slate-600 mt-2 inline-flex items-start gap-1.5">
                <Info size={14} class="mt-0.5 shrink-0" />
                {$t('These venues are new, and will be added as past venues: {names}.', { names: preview.totals.newVenues.join(', ') })}
              </p>
            {/if}
            {#if preview.ignoredColumns.length}
              <p class="text-sm text-slate-600 mt-2 inline-flex items-start gap-1.5">
                <Info size={14} class="mt-0.5 shrink-0" />
                {$t('These columns are not used: {names}.', { names: preview.ignoredColumns.join(', ') })}
              </p>
            {/if}
          </div>

          {#if warnings.length}
            <details class="mt-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4" open={warnings.length <= 5}>
              <summary class="cursor-pointer font-semibold text-amber-900">
                {warnings.length === 1 ? $t('1 thing to check') : $t('{count} things to check', { count: warnings.length })}
              </summary>
              <p class="text-sm text-amber-800 mt-1">{$t('These do not stop the import.')}</p>
              <ul class="mt-2 text-sm text-amber-900 space-y-1">
                {#each warnings.slice(0, SHOW_PROBLEMS) as p}
                  <li>{#if p.row}<span class="font-medium">{$t('Row {n}', { n: p.row })}:</span>{' '}{/if}{$t(p.message, varsFor(p))}</li>
                {/each}
              </ul>
              {#if warnings.length > SHOW_PROBLEMS}<p class="text-sm text-amber-800 mt-2">{$t('And {count} more.', { count: warnings.length - SHOW_PROBLEMS })}</p>{/if}
            </details>
          {/if}

          <details class="mt-4">
            <summary class="cursor-pointer text-sm font-medium text-brand-700">{$t('See each session')}</summary>
            <div class="mt-2 overflow-x-auto max-h-96">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-left text-slate-600 sticky top-0">
                  <tr>
                    <th class="px-3 py-2">{$t('Date')}</th>
                    <th class="px-3 py-2">{$t('Venue')}</th>
                    <th class="px-3 py-2 text-right">{$t('Items')}</th>
                    <th class="px-3 py-2 text-right">{$t('Fixed')}</th>
                    <th class="px-3 py-2 text-right">{$t('Not fixed')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  {#each preview.sessions as session}
                    <tr>
                      <td class="px-3 py-2 whitespace-nowrap">{day(session.date)}{#if session.existingEventId} <span class="badge bg-slate-100 text-slate-700">{$t('Already in the hub')}</span>{/if}</td>
                      <td class="px-3 py-2">{venueName(session)}</td>
                      <td class="px-3 py-2 text-right">{countOf(session)}</td>
                      <td class="px-3 py-2 text-right">{countOf(session, 'fixed')}</td>
                      <td class="px-3 py-2 text-right">{countOf(session, 'not_fixed')}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}

        {#if ready}
          <div class="mt-5 border-t border-slate-200 pt-4 space-y-3">
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-0.5" bind:checked={publish} disabled={running || !!importId} />
              <span>
                <span class="font-medium">{$t('Show these sessions in the list of past sessions on your website')}</span>
                <span class="block text-xs text-slate-500">{$t('Leave it off to count them in your figures without listing each one.')}</span>
              </span>
            </label>
            {#if running}
              <div aria-live="polite">
                <p class="text-sm text-slate-600">{$t('Adding… part {n} of {total}', { n: Math.min(sent + 1, chunks.length), total: chunks.length })}</p>
                <div class="mt-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div class="h-full bg-brand-600 transition-all" style="width: {chunks.length ? Math.round((sent / chunks.length) * 100) : 0}%"></div>
                </div>
              </div>
            {/if}
            {#if runError}
              <p class="rounded-lg bg-rose-50 text-rose-800 px-4 py-2 text-sm" role="alert">
                {runError}
                {#if importId}{$t('What was added so far is kept. Press the button again to carry on.')}{/if}
              </p>
            {/if}
            <button class="btn-primary" on:click={runImport} disabled={running}>
              {importId
                ? $t('Carry on adding')
                : $t('Add {sessions} sessions and {items} items', { sessions: preview.totals.newSessions, items: preview.totals.items })}
            </button>
          </div>
        {/if}
      {/if}
      {#if runError && !preview}
        <p class="mt-3 rounded-lg bg-rose-50 text-rose-800 px-4 py-2 text-sm" role="alert">{runError}</p>
      {/if}
    </li>
  </ol>
{/if}

{#if imports.length}
  <section class="mt-10 max-w-3xl">
    <h2 class="text-lg font-semibold">{$t('Files you have added')}</h2>
    <p class="text-sm text-slate-600">{$t('Added the wrong file, or the same file twice? Remove it here and everything it added goes.')}</p>
    <ul class="mt-3 grid gap-3">
      {#each imports as entry (entry.id)}
        <li class="card p-4 flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium inline-flex items-center gap-1.5">
              <FileSpreadsheet size={16} class="text-slate-500" />
              {entry.fileName || $t('Past sessions')}
              {#if !entry.finished}<span class="badge bg-amber-100 text-amber-800">{$t('Not finished')}</span>{/if}
            </p>
            <p class="text-sm text-slate-600">
              {$t('{sessions} sessions and {repairs} repairs, from {from} to {to}', {
                sessions: entry.sessions,
                repairs: entry.repairs,
                from: day(entry.firstDate),
                to: day(entry.lastDate),
              })}
            </p>
            <p class="text-xs text-slate-500">
              {$t('Added on {date} by {name}', {
                date: new Date(entry.importedAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }),
                name: entry.importedBy ?? '?',
              })}
            </p>
          </div>
          <button class="btn-danger-outline btn-sm" on:click={() => removeImport(entry)} disabled={running}>
            <Trash2 size={14} /> {$t('Remove')}
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}
