<script lang="ts">
  /**
   * Drop photos here.
   *
   * Takes files by drag and drop, by browsing, or by pasting. Big photos from
   * a phone are shrunk in the browser first, so the upload finishes quickly on
   * a hall's wifi. Files go up one at a time, each with its own progress bar,
   * and each one that lands is reported straight away so the grid fills in as
   * you watch.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { uploadFile } from '$lib/api';
  import { ImagePlus, Loader2, AlertCircle, Check } from 'lucide-svelte';

  /** Where to POST each file. */
  export let endpoint: string;
  /** Form field name the server reads the file from. */
  export let fieldName = 'image';
  /** Longest edge, in pixels, to shrink to before uploading. */
  export let maxLongestEdge = 2000;
  /** JPEG quality used when we re-encode. */
  export let quality = 0.9;
  /** Stop new uploads (for example while the page is saving something else). */
  export let disabled = false;
  /** Also accept a photo pasted from the clipboard. */
  export let acceptPaste = true;
  export let title = 'Add photos';
  export let hint = 'Drag photos here, paste them, or browse your device. JPEG, PNG or WebP.';

  const dispatch = createEventDispatcher<{
    /** One file finished. `result` is whatever the endpoint returned. */
    uploaded: { result: unknown };
    /** The whole batch finished (even if some files failed). */
    done: { uploaded: number; failed: number };
  }>();

  type QueueItem = {
    key: number;
    name: string;
    previewUrl: string;
    progress: number;
    status: 'waiting' | 'uploading' | 'done' | 'error';
    error?: string;
  };

  let queue: QueueItem[] = [];
  // Files still to go up. One loop drains this, so dropping a second batch
  // while the first is uploading adds to the same run rather than stalling.
  let pending: Array<{ item: QueueItem; file: File }> = [];
  let dragging = false;
  let busy = false;
  let fileInput: HTMLInputElement;
  let nextKey = 0;
  // Nested drag enter/leave events fire as the pointer crosses child elements.
  // Counting them keeps the highlight steady instead of flickering.
  let dragDepth = 0;

  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

  function humanName(f: File): string {
    return f.name.length > 40 ? `${f.name.slice(0, 37)}…` : f.name;
  }

  /**
   * Shrink a photo in the browser before it goes up. A phone photo is often
   * 5MB; this gets it under about 500KB with no visible loss at the sizes we
   * display. If the browser cannot decode the file (an iPhone HEIC that was
   * not converted, say) we send the original and let the server decide.
   */
  async function shrink(file: File): Promise<Blob> {
    if (!ACCEPTED.includes(file.type)) return file;
    // A small file is left exactly as it is. Re-encoding it would only lose
    // quality for no saving.
    if (file.size < 1_200_000) return file;
    const objectUrl = URL.createObjectURL(file);
    try {
      // Decoded through an <img>, so the browser applies the "this way up"
      // tag a phone writes into a photo. Reading the raw pixels instead would
      // send portrait photos in sideways.
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return file;
      const scale = Math.min(1, maxLongestEdge / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );
      return blob && blob.size < file.size ? blob : file;
    } catch {
      // Anything the browser cannot decode (an iPhone HEIC, say) goes up as
      // it is and the server decides what to do with it.
      return file;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  export async function addFiles(files: File[]): Promise<void> {
    if (disabled) return;
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;

    const items: QueueItem[] = images.map((f) => ({
      key: nextKey++,
      name: humanName(f),
      previewUrl: URL.createObjectURL(f),
      progress: 0,
      status: 'waiting',
    }));
    queue = [...queue, ...items];
    pending = [...pending, ...items.map((item, i) => ({ item, file: images[i]! }))];

    if (busy) return; // the loop below is already draining `pending`
    busy = true;
    let uploaded = 0;
    let failed = 0;
    try {
      while (pending.length > 0) {
        const { item, file } = pending[0]!;
        pending = pending.slice(1);
        setItem(item.key, { status: 'uploading', progress: 0 });
        try {
          const blob = await shrink(file);
          const result = await uploadFile(endpoint, blob, {
            fieldName,
            onProgress: (fraction) => setItem(item.key, { progress: fraction }),
          });
          setItem(item.key, { status: 'done', progress: 1 });
          uploaded++;
          dispatch('uploaded', { result });
        } catch (err: any) {
          failed++;
          setItem(item.key, {
            status: 'error',
            error: err?.message ?? 'Upload failed',
          });
        }
      }
    } finally {
      busy = false;
      dispatch('done', { uploaded, failed });
      // Clear the finished rows shortly after, but leave failures on screen
      // so nobody loses track of a photo that did not make it.
      setTimeout(() => {
        queue = queue.filter((q) => {
          if (q.status === 'done') URL.revokeObjectURL(q.previewUrl);
          return q.status !== 'done';
        });
      }, 1200);
    }
  }

  function setItem(key: number, patch: Partial<QueueItem>) {
    queue = queue.map((q) => (q.key === key ? { ...q, ...patch } : q));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragDepth = 0;
    dragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    void addFiles(files);
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    dragDepth++;
    if (!disabled) dragging = true;
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragging = false;
  }

  function onBrowse(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    void addFiles(Array.from(input.files ?? []));
    // Reset so choosing the same file twice still fires a change event.
    input.value = '';
  }

  function onPaste(e: ClipboardEvent) {
    if (!acceptPaste || disabled) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    void addFiles(files);
  }

  onMount(() => {
    if (acceptPaste) document.addEventListener('paste', onPaste);
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') document.removeEventListener('paste', onPaste);
    for (const q of queue) URL.revokeObjectURL(q.previewUrl);
  });

  function dismiss(key: number) {
    queue = queue.filter((q) => {
      if (q.key === key) URL.revokeObjectURL(q.previewUrl);
      return q.key !== key;
    });
  }
</script>

<div>
  <!-- The whole panel is the drop target; the button inside opens the file
       picker. Keyboard users get there with Tab, so the panel itself does not
       need to be focusable. -->
  <div
    role="group"
    aria-label={title}
    class="rounded-2xl border-2 border-dashed p-6 text-center transition-colors
      {dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'}
      {disabled ? 'opacity-60' : ''}"
    on:dragenter={onDragEnter}
    on:dragover={(e) => e.preventDefault()}
    on:dragleave={onDragLeave}
    on:drop={onDrop}
  >
    <span class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
      <ImagePlus size={22} />
    </span>
    <p class="mt-3 font-semibold text-slate-800">{title}</p>
    <p class="mt-1 text-sm text-slate-600 max-w-md mx-auto">{hint}</p>
    <button
      class="btn-secondary btn-sm mt-4"
      type="button"
      {disabled}
      on:click={() => fileInput?.click()}
    >
      Choose photos
    </button>
    <input
      bind:this={fileInput}
      class="sr-only"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      on:change={onBrowse}
    />
  </div>

  {#if queue.length > 0}
    <ul class="mt-3 space-y-2">
      {#each queue as item (item.key)}
        <li class="flex items-center gap-3 rounded-xl bg-white ring-1 ring-slate-200 p-2">
          <img src={item.previewUrl} alt="" class="h-10 w-10 rounded-lg object-cover bg-slate-100" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-slate-700">{item.name}</p>
            {#if item.status === 'error'}
              <p class="text-xs text-rose-700">{item.error}</p>
            {:else}
              <div class="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  class="h-full rounded-full bg-brand-500 transition-[width] duration-150"
                  style={`width: ${Math.round(item.progress * 100)}%`}
                ></div>
              </div>
            {/if}
          </div>
          {#if item.status === 'done'}
            <Check size={16} class="text-emerald-600 shrink-0" />
          {:else if item.status === 'error'}
            <button
              class="shrink-0 text-xs text-slate-500 hover:text-slate-800 underline"
              type="button"
              on:click={() => dismiss(item.key)}
            >
              Dismiss
            </button>
            <AlertCircle size={16} class="text-rose-600 shrink-0" />
          {:else}
            <Loader2 size={16} class="text-slate-400 shrink-0 animate-spin" />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
