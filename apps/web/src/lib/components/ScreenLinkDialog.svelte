<script lang="ts">
  // The private link for a screen in the waiting area. Opening it shows the
  // queue to the room without anyone signing in on that screen. See
  // apps/cloudflare/src/routes/display.ts for what the screen is shown.
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from '$lib/api';
  import { Check, Copy, ExternalLink, MonitorPlay, RefreshCw, X } from 'lucide-svelte';

  const dispatch = createEventDispatcher<{ close: void }>();

  let url = '';
  let error = '';
  let copied = false;
  let confirmReplace = false;
  let busy = false;

  function fromPath(path: string): string {
    return `${window.location.origin}${path}`;
  }

  onMount(async () => {
    try {
      const res = await api<{ path: string }>('/api/admin/display-link');
      url = fromPath(res.path);
    } catch (err: any) {
      error = err?.message ?? 'Could not get the link';
    }
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      error = 'Your browser would not copy it. Select the address and copy it instead.';
    }
  }

  async function replace() {
    busy = true;
    try {
      const res = await api<{ path: string }>('/api/admin/display-link/regenerate', { method: 'POST', json: {} });
      url = fromPath(res.path);
      confirmReplace = false;
    } catch (err: any) {
      error = err?.message ?? 'Could not replace the link';
    } finally {
      busy = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="screen-link-title">
  <button type="button" class="absolute inset-0 bg-slate-900/50" aria-label="Close" on:click={() => dispatch('close')}></button>
  <div class="modal-panel relative max-w-lg">
    <button type="button" class="absolute top-3 right-3 p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close" on:click={() => dispatch('close')}><X size={18} /></button>
    <span class="h-11 w-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center"><MonitorPlay size={22} /></span>
    <h2 id="screen-link-title" class="text-lg font-semibold mt-3">A screen for the waiting area</h2>
    <p class="mt-1 text-sm text-slate-600">
      Open this address on the computer or TV in the waiting area. It shows the queue, what is being repaired and what is
      ready to collect, plus the check-in QR code. Nobody needs to sign in on it, and it never shows visitors' names.
    </p>
    {#if error}
      <p class="mt-3 text-sm text-rose-700">{error}</p>
    {/if}
    {#if url}
      <input class="input mt-4 font-mono text-sm" readonly value={url} on:focus={(e) => e.currentTarget.select()} />
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="btn-primary btn-sm" on:click={copy}>{#if copied}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy the address{/if}</button>
        <a class="btn-secondary btn-sm" href={url} target="_blank" rel="noopener"><ExternalLink size={16} /> Open it here</a>
      </div>
      <div class="mt-5 pt-4 border-t border-slate-100 text-sm">
        {#if confirmReplace}
          <p class="text-slate-700">The screen using the old address will stop showing the queue until you open the new one on it.</p>
          <div class="mt-2 flex gap-2">
            <button class="btn-ghost btn-sm" on:click={() => (confirmReplace = false)}>Keep this one</button>
            <button class="btn-secondary btn-sm" disabled={busy} on:click={replace}><RefreshCw size={14} /> Make a new address</button>
          </div>
        {:else}
          <p class="text-slate-500">Anyone with this address can see the queue. If it has gone somewhere it should not,
            <button class="underline underline-offset-2 hover:text-slate-800" on:click={() => (confirmReplace = true)}>make a new one</button>.
          </p>
        {/if}
      </div>
    {/if}
  </div>
</div>
