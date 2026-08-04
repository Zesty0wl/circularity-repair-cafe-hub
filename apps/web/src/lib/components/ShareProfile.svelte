<script lang="ts">
  // The share menu for a repairer profile. It previews the sharing card the
  // server draws (see /og/repairer/:id.png), lets the sharer pick a style,
  // and opens the usual sharing pages. Facebook, X and Bluesky read the
  // picture from the profile link, so the link carries the chosen style.
  import Icon from '@iconify/svelte';
  import { Share2, Link as LinkIcon, Check, Download, X } from 'lucide-svelte';
  import { cafe } from '$lib/stores/cafe';
  import { SHARE_CARD_STYLES, type ShareCardStyle } from '@circularity/shared';

  export let repairerId: string;
  export let displayName: string;
  // own    — the repairer sharing themselves, from My profile ("I will be...")
  // public — anyone sharing this repairer, from the public team page
  export let mode: 'own' | 'public' = 'own';

  const STYLES: Array<{ key: ShareCardStyle; label: string }> = [
    { key: 'classic', label: 'Classic' },
    { key: 'bold', label: 'Bold' },
    { key: 'photo', label: 'Photo' },
  ];

  let open = false;
  let style: ShareCardStyle = SHARE_CARD_STYLES[0];
  let copied = false;
  // Changes each time the menu opens, so the previews are drawn fresh after
  // a new photo or a new session rather than coming from the browser cache.
  let openedAt = 0;

  interface NextEvent {
    date: string;
    startTime: string;
    venue: { name: string };
  }
  let nextEvent: NextEvent | null = null;
  let eventLoaded = false;

  async function openMenu() {
    open = true;
    openedAt = Date.now();
    if (!eventLoaded) {
      try {
        const res = await fetch('/api/public/events');
        const list = (await res.json()) as NextEvent[];
        nextEvent = list[0] ?? null;
      } catch {
        nextEvent = null;
      }
      eventLoaded = true;
    }
  }
  function closeMenu() {
    open = false;
    copied = false;
  }

  function humanDate(isoDate: string): string {
    return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  }

  function cardUrl(key: ShareCardStyle): string {
    return `/og/repairer/${repairerId}.png?style=${key}&t=${openedAt}`;
  }

  $: cafeName = $cafe?.name || 'our repair cafe';
  $: shareUrl =
    (typeof location !== 'undefined' ? location.origin : '') +
    `/team/${repairerId}` +
    (style === 'classic' ? '' : `?style=${style}`);
  $: shareText =
    mode === 'own'
      ? nextEvent
        ? `I will be repairing at ${cafeName} on ${humanDate(nextEvent.date)} at ${nextEvent.venue.name}. Bring something broken and we will help you fix it for free.`
        : `I volunteer as a repairer at ${cafeName}. Bring something broken to our next session and we will help you fix it for free.`
      : nextEvent
        ? `${displayName} will be repairing at ${cafeName} on ${humanDate(nextEvent.date)} at ${nextEvent.venue.name}. Bring something broken and get help fixing it for free.`
        : `${displayName} volunteers as a repairer at ${cafeName}. Bring something broken to a repair session and get help fixing it for free.`;

  $: facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  $: xHref = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  $: blueskyHref = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
  $: whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

  $: downloadName =
    `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'repairer'}-share-card.png`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard needs a secure context; the link is still there to select.
    }
  }

  $: canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  async function nativeShare() {
    try {
      await navigator.share({ title: shareText, text: shareText, url: shareUrl });
    } catch {
      // Cancelled by the user; nothing to do.
    }
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && closeMenu()} />

{#if mode === 'own'}
  <button type="button" class="btn-primary" on:click={openMenu}>
    <Share2 size={16} /> Share my profile
  </button>
{:else}
  <button type="button" class="btn-secondary btn-sm" on:click={openMenu}>
    <Share2 size={14} /> Share this profile
  </button>
{/if}

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button class="absolute inset-0 bg-slate-900/50" aria-label="Close" on:click={closeMenu}></button>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'own' ? 'Share your profile' : `Share ${displayName}'s profile`}
      class="modal-panel relative w-full max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold">
            {mode === 'own' ? 'Share your profile' : `Share ${displayName}'s profile`}
          </h2>
          <p class="text-sm text-slate-600 mt-0.5">
            Pick a style, then share the card where your friends are.
          </p>
        </div>
        <button type="button" class="btn-ghost btn-sm -mr-2" aria-label="Close" on:click={closeMenu}>
          <X size={18} />
        </button>
      </div>

      <!-- The card, exactly as it will appear when shared -->
      <img
        src={cardUrl(style)}
        alt="Preview of the sharing card"
        class="mt-4 w-full aspect-[1200/630] rounded-xl object-cover ring-1 ring-slate-200 bg-slate-100"
      />

      <!-- Style picker -->
      <div class="mt-3 grid grid-cols-3 gap-3" role="radiogroup" aria-label="Card style">
        {#each STYLES as s}
          <button
            type="button"
            role="radio"
            aria-checked={style === s.key}
            class="rounded-lg p-1 ring-2 transition {style === s.key
              ? 'ring-brand-600 bg-brand-50'
              : 'ring-transparent hover:bg-slate-50'}"
            on:click={() => (style = s.key)}
          >
            <img
              src={cardUrl(s.key)}
              alt=""
              class="w-full aspect-[1200/630] rounded-md object-cover bg-slate-100"
            />
            <span
              class="mt-1 block text-center text-xs font-medium {style === s.key
                ? 'text-brand-700'
                : 'text-slate-600'}">{s.label}</span
            >
          </button>
        {/each}
      </div>

      <!-- Where to share it -->
      <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <a class="btn-secondary" href={facebookHref} target="_blank" rel="noopener">
          <Icon icon="simple-icons:facebook" width="16" height="16" /> Facebook
        </a>
        <a class="btn-secondary" href={xHref} target="_blank" rel="noopener">
          <Icon icon="simple-icons:x" width="16" height="16" /> X
        </a>
        <a class="btn-secondary" href={blueskyHref} target="_blank" rel="noopener">
          <Icon icon="simple-icons:bluesky" width="16" height="16" /> Bluesky
        </a>
        <a class="btn-secondary" href={whatsappHref} target="_blank" rel="noopener">
          <Icon icon="simple-icons:whatsapp" width="16" height="16" /> WhatsApp
        </a>
        <button type="button" class="btn-secondary" on:click={copyLink}>
          {#if copied}<Check size={16} class="text-emerald-600" /> Copied{:else}<LinkIcon size={16} /> Copy link{/if}
        </button>
        <a class="btn-secondary" href={cardUrl(style)} download={downloadName}>
          <Download size={16} /> Download card
        </a>
      </div>

      {#if canNativeShare}
        <button type="button" class="btn-ghost btn-sm mt-2 w-full justify-center" on:click={nativeShare}>
          <Share2 size={14} /> More ways to share
        </button>
      {/if}

      <p class="mt-3 text-xs text-slate-500">
        Facebook, X and Bluesky show the card when the link is shared. To post the picture itself,
        download it and attach it to your post.
      </p>
    </div>
  </div>
{/if}
