<script lang="ts">
  // Import a backup into the hub, in the browser.
  //
  // Used in two places: the setup wizard on a brand new hub ("Move from an
  // existing hub"), and Settings, Backup & restore, where a super admin can
  // restore over what is there. Both read a backup zip (from this hub or an old
  // Docker hub) and
  // send it to the hub in small pieces. See $lib/backup/transfer.ts.
  import { createEventDispatcher } from 'svelte';
  import { AlertTriangle, CheckCircle2, Upload } from 'lucide-svelte';
  import { importBackup, openBackup, type OpenedBackup, type TransferProgress } from '$lib/backup/transfer';

  /** 'setup' on a new hub, 'admin' when restoring over existing data. */
  export let mode: 'setup' | 'admin';
  export let confirmPhrase = 'WIPE AND RESTORE';

  const dispatch = createEventDispatcher<{ done: { counts: Record<string, number> } }>();

  let files: FileList | null = null;
  let opened: OpenedBackup | null = null;
  let reading = false;
  let running = false;
  let typedPhrase = '';
  let error = '';
  let progress: TransferProgress | null = null;
  let finished: { counts: Record<string, number>; files: number } | null = null;

  $: if (files && files[0]) void read(files[0]);

  async function read(file: File) {
    error = '';
    opened = null;
    reading = true;
    try {
      opened = await openBackup(file);
    } catch (err: any) {
      error = err?.message ?? 'That file could not be read.';
    } finally {
      reading = false;
    }
  }

  function count(table: string): number {
    return opened?.tables.get(table)?.length ?? 0;
  }

  $: source = opened
    ? opened.manifest.edition === 'cloudflare'
      ? 'a hub'
      : 'an old Docker hub'
    : '';
  $: oldAddress = (opened?.tables.get('cafes')?.[0]?.public_url as string | undefined) ?? '';
  $: newAddress = typeof window !== 'undefined' ? window.location.origin : '';
  $: addressChanges = Boolean(oldAddress && newAddress && !oldAddress.startsWith(newAddress));
  $: canStart = Boolean(opened) && !running && (mode === 'setup' || typedPhrase === confirmPhrase);

  async function start() {
    if (!opened) return;
    if (mode === 'admin' && !confirm('This deletes everything on this hub and replaces it with the backup. Continue?')) return;
    error = '';
    running = true;
    try {
      finished = await importBackup(opened, {
        mode,
        confirmPhrase,
        onProgress: (p) => (progress = p),
      });
      dispatch('done', { counts: finished.counts });
    } catch (err: any) {
      error = `${err?.message ?? 'The import stopped.'} Nothing is lost: the backup file is unchanged. You can start the import again.`;
    } finally {
      running = false;
    }
  }

  $: percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
</script>

{#if finished}
  <div class="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-4 text-sm text-emerald-900 space-y-2">
    <p class="font-semibold flex items-center gap-2"><CheckCircle2 size={18} /> Your hub has moved.</p>
    <p>
      {finished.counts.users ?? 0} accounts, {finished.counts.events ?? 0} sessions,
      {finished.counts.repair_jobs ?? 0} repairs and {finished.files} files are now on this hub.
    </p>
    <p>Sign in with the same email and password you used on the old hub.</p>
    {#if addressChanges}
      <p>
        Your web address is still saved as <span class="font-mono">{oldAddress}</span>. If people will
        reach this hub at a different address, change it under Settings, Cafe profile, after you sign in.
        The QR codes on printed posters use that address.
      </p>
    {/if}
  </div>
{:else}
  <div class="space-y-4">
    <div>
      <label class="label" for="backup-file">Backup file (.zip)</label>
      <input id="backup-file" class="input" type="file" accept=".zip,application/zip" bind:files disabled={running} />
      <p class="mt-1 text-xs text-slate-500">
        On the old hub, go to Settings, Backup &amp; restore, and choose Download backup zip.
        This page can also read a backup from an old Docker hub.
      </p>
    </div>

    {#if reading}
      <p class="text-sm text-slate-600">Reading the backup…</p>
    {/if}

    {#if opened}
      <div class="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4 text-sm space-y-1">
        <p class="font-semibold">{opened.manifest.cafe?.name || 'Unnamed cafe'}</p>
        <p class="text-slate-600">
          From {source}, version {opened.manifest.appVersion}, made
          {new Date(opened.manifest.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.
        </p>
        <p class="text-slate-600">
          {count('users')} accounts · {count('events')} sessions · {count('repair_jobs')} repairs ·
          {opened.files.length} files
        </p>
      </div>

      {#if mode === 'admin'}
        <div class="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-900 flex gap-2">
          <AlertTriangle size={18} class="shrink-0 mt-0.5" />
          <p>This deletes every account, session, repair and photo on this hub, and puts the backup in their place. You will need to sign in again afterwards.</p>
        </div>
        <div>
          <label class="label" for="import-phrase">Type <span class="font-mono">{confirmPhrase}</span> to confirm</label>
          <input id="import-phrase" class="input font-mono" bind:value={typedPhrase} placeholder={confirmPhrase} disabled={running} />
        </div>
      {/if}

      {#if running && progress}
        <div>
          <div class="flex justify-between text-sm text-slate-700">
            <span>{progress.message}</span>
            <span>{percent}%</span>
          </div>
          <div class="mt-1 h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-brand-600 transition-all" style="width: {percent}%"></div>
          </div>
          <p class="mt-2 text-xs text-slate-500">Keep this page open until it finishes. Large hubs with many photos can take several minutes.</p>
        </div>
      {/if}

      <button class={mode === 'admin' ? 'btn-danger inline-flex items-center gap-2' : 'btn-primary w-full inline-flex items-center justify-center gap-2'} on:click={start} disabled={!canStart}>
        <Upload size={16} />
        {running ? 'Importing…' : mode === 'admin' ? 'Wipe and restore' : 'Move this hub here'}
      </button>
    {/if}

    {#if error}
      <p class="text-sm text-rose-700">{error}</p>
    {/if}
  </div>
{/if}
