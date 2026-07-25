<script lang="ts">
  import { onMount } from 'svelte';
  import { Download, X } from 'lucide-svelte';
  import { cafe } from '$lib/stores/cafe';

  // A quiet offer to install the app. It only appears when the browser says
  // the site is installable, and once someone dismisses it we do not ask
  // again on that device.
  interface InstallEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  const DISMISSED_KEY = 'pwa-install-dismissed';

  let deferred: InstallEvent | null = null;
  let visible = false;

  function hide(remember: boolean) {
    visible = false;
    deferred = null;
    if (remember) {
      try {
        localStorage.setItem(DISMISSED_KEY, '1');
      } catch {
        /* private mode: just do not remember */
      }
    }
  }

  async function install() {
    if (!deferred) return;
    const event = deferred;
    // The banner has to go before the browser's own dialog opens, or the two
    // stack on top of each other.
    visible = false;
    await event.prompt();
    await event.userChoice;
    hide(true);
  }

  onMount(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      /* private mode: carry on and offer it */
    }
    // Already running as an installed app, so there is nothing to offer.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallEvent;
      visible = true;
    };
    const onInstalled = () => hide(true);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  });
</script>

{#if visible}
  <div
    class="no-print fixed inset-x-0 bottom-0 z-40 border-t border-brand-700 bg-brand-800 text-white"
    style="padding-bottom: env(safe-area-inset-bottom)"
    role="region"
    aria-label="Install this app"
  >
    <div class="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3">
      <p class="flex-1 text-sm">
        Add {$cafe?.name ?? 'this site'} to your home screen for quicker access.
      </p>
      <button type="button" class="btn-primary btn-sm !bg-white !text-brand-800 hover:!bg-slate-100" on:click={install}>
        <Download size={16} /> Install
      </button>
      <button
        type="button"
        class="shrink-0 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        aria-label="Not now"
        on:click={() => hide(true)}
      >
        <X size={18} />
      </button>
    </div>
  </div>
{/if}
