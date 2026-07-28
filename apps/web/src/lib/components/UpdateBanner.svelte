<script lang="ts">
  // Tells an admin when a newer version has been released, and how to get it.
  //
  // Cafes run this themselves, usually on a machine nobody looks at, and
  // nobody is going to watch a repository for releases. Without this, an
  // install sits on whatever version it was set up with for years.
  //
  // It never updates anything by itself. Someone has to decide when, because
  // an update restarts the site, and the middle of a session is the wrong
  // moment.
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { ArrowUpCircle, X } from 'lucide-svelte';

  interface UpdateStatus {
    current: string;
    latest: string | null;
    updateAvailable: boolean;
    checkedAt: string | null;
    enabled: boolean;
  }

  let status: UpdateStatus | null = null;
  let dismissed = false;

  // Dismissing is remembered per version, so saying "not now" to 1.8.0 does
  // not also hide 1.9.0 when it arrives.
  $: storageKey = status?.latest ? `hub.update.dismissed.${status.latest}` : '';

  onMount(async () => {
    try {
      status = await api<UpdateStatus>('/api/admin/update');
    } catch {
      // An update notice is never worth an error on somebody's dashboard.
      return;
    }
    if (status?.latest && localStorage.getItem(`hub.update.dismissed.${status.latest}`)) {
      dismissed = true;
    }
  });

  function dismiss(): void {
    dismissed = true;
    try {
      if (storageKey) localStorage.setItem(storageKey, '1');
    } catch {
      /* private browsing, or storage full. Hiding it for now is enough. */
    }
  }
</script>

{#if status?.updateAvailable && !dismissed}
  <div
    class="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 flex items-start gap-3"
    role="status"
  >
    <ArrowUpCircle class="shrink-0 mt-0.5 text-brand-700" size={20} />
    <div class="flex-1 text-sm">
      <p class="font-semibold text-brand-900">
        Version {status.latest} is out. You are running {status.current}.
      </p>
      <p class="mt-1 text-brand-800">
        Updating takes about a minute, and the site is down for roughly 30 seconds of
        it, so it is best done the day before a session rather than on the morning.
      </p>
      <p class="mt-2">
        <a
          class="font-medium text-brand-800 underline underline-offset-2 hover:no-underline"
          href="/admin/settings?tab=about">How to update</a
        >
        <span class="text-brand-700"> or read the </span>
        <a
          class="font-medium text-brand-800 underline underline-offset-2 hover:no-underline"
          href="https://github.com/Zesty0wl/circularity-repair-cafe-hub/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener">list of changes</a
        >.
      </p>
    </div>
    <button
      class="text-brand-700 hover:text-brand-900 shrink-0"
      on:click={dismiss}
      aria-label="Hide this until the next version"
    >
      <X size={18} />
    </button>
  </div>
{/if}
