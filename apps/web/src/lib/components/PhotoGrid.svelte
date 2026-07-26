<script lang="ts">
  /**
   * A grid of photos that opens into a full-screen viewer.
   *
   * Used by the home page gallery and by the gallery on a past event's page,
   * so both behave the same: tap a photo to see it large, arrow keys or the
   * side buttons to move through the set, Esc to come back.
   */
  import { X, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import type { GalleryPhoto } from '$lib/gallery';

  export let photos: GalleryPhoto[] = [];
  /** How many to show before the "Show all" button. 0 shows every photo. */
  export let previewCount = 0;
  /** Alt text for a photo with no caption. */
  export let fallbackAlt = 'Repair café photo';

  let showAll = false;
  $: visible = previewCount > 0 && !showAll ? photos.slice(0, previewCount) : photos;

  let index: number | null = null;

  function open(i: number) {
    index = i;
  }
  function close() {
    index = null;
  }
  function next() {
    if (index === null || photos.length === 0) return;
    index = (index + 1) % photos.length;
  }
  function prev() {
    if (index === null || photos.length === 0) return;
    index = (index - 1 + photos.length) % photos.length;
  }
  function handleKey(e: KeyboardEvent) {
    if (index === null) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }

  // Lock the page behind the viewer so a swipe moves the photo, not the page.
  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = index === null ? '' : 'hidden';
  }
</script>

<svelte:window on:keydown={handleKey} />

<div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
  {#each visible as photo, i (photo.id)}
    <button
      type="button"
      on:click={() => open(i)}
      class="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      aria-label={photo.caption ? `View larger: ${photo.caption}` : `View photo ${i + 1} of ${photos.length}`}
    >
      <img
        src={photo.url}
        alt={photo.caption || fallbackAlt}
        loading="lazy"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    </button>
  {/each}
</div>

{#if previewCount > 0 && photos.length > previewCount}
  <div class="text-center mt-8">
    <button type="button" class="btn-secondary" on:click={() => (showAll = !showAll)}>
      {showAll ? 'Show fewer photos' : `Show all ${photos.length} photos`}
    </button>
  </div>
{/if}

<!-- ────────────────────── Full-screen viewer ────────────────────── -->
{#if index !== null && photos[index]}
  <div
    class="fixed inset-0 z-50 bg-black/90 flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label="Photo viewer"
    tabindex="-1"
  >
    <!-- Tapping the space around the photo closes the viewer. It is a real
         button so a keyboard and a screen reader can do the same. -->
    <button type="button" class="absolute inset-0 cursor-default" aria-label="Close photo viewer" on:click={close}></button>

    <div class="relative z-10 flex items-center justify-between px-4 py-3 text-white/90 text-sm">
      <span class="font-mono tabular-nums">{index + 1} / {photos.length}</span>
      <button
        type="button"
        on:click={close}
        class="p-2 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
        aria-label="Close (Esc)"
      >
        <X size={24} />
      </button>
    </div>

    <div class="relative z-10 flex-1 flex items-center justify-center min-h-0 pointer-events-none">
      <img
        src={photos[index].url}
        alt={photos[index].caption ?? ''}
        class="max-h-full max-w-full object-contain rounded pointer-events-auto"
      />
      {#if photos.length > 1}
        <button
          type="button"
          on:click={prev}
          class="pointer-events-auto absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Previous photo (←)"
        >
          <ChevronLeft size={28} />
        </button>
        <button
          type="button"
          on:click={next}
          class="pointer-events-auto absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Next photo (→)"
        >
          <ChevronRight size={28} />
        </button>
      {/if}
    </div>

    <div class="relative z-10 px-6 py-4 text-center text-white text-sm sm:text-base max-w-3xl mx-auto min-h-[3.5rem]">
      {#if photos[index].caption}
        <p>{photos[index].caption}</p>
      {/if}
      {#if photos[index].eventId && photos[index].eventName}
        <a
          href={`/events/${photos[index].eventId}`}
          class="mt-1 inline-block text-white/70 underline underline-offset-2 hover:text-white text-sm"
        >
          From {photos[index].eventName}
        </a>
      {/if}
    </div>
  </div>
{/if}
