<script lang="ts">
  /**
   * The photo editor used across the admin area.
   *
   * Shows a grid of photos you can drag into the order you want. Click a photo
   * to open it large and write its description, then step through the rest
   * with Previous and Next without closing the panel. Every change saves as
   * you go, so there is no separate Save button to forget.
   *
   * The page that uses this decides what each action calls, so the same editor
   * works for the site gallery and for an event's photos.
   */
  import { createEventDispatcher, tick } from 'svelte';
  import {
    Trash2,
    Pencil,
    GripVertical,
    X,
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    Star,
    Check,
    Loader2,
  } from 'lucide-svelte';
  import type { ManagedPhoto } from '$lib/gallery';

  export let photos: ManagedPhoto[] = [];
  /** Save one photo's description. */
  export let onSaveCaption: (photo: ManagedPhoto, caption: string) => Promise<void>;
  /** Remove a photo for good. Leave null where photos belong elsewhere. */
  export let onDelete: ((photo: ManagedPhoto) => Promise<void>) | null = null;
  /** Save a new order. Leave null to turn dragging off. */
  export let onReorder: ((ids: string[]) => Promise<void>) | null = null;
  /** Change who can see a photo. Leave null to hide those controls. */
  export let onToggle:
    | ((photo: ManagedPhoto, patch: { isPublished?: boolean; showOnHome?: boolean }) => Promise<void>)
    | null = null;
  /** Whether this user may edit a given photo. */
  export let canEdit: (photo: ManagedPhoto) => boolean = () => true;
  export let emptyMessage = 'No photos yet.';
  /** Words for the "show on the main gallery" star, when it is offered. */
  export let homeToggleLabel = 'Show in the main gallery on the site';

  const dispatch = createEventDispatcher<{ changed: void }>();

  const MAX_CAPTION = 500;

  // ── Editing panel ───────────────────────────────────────────────────
  let editingIndex: number | null = null;
  let draftCaption = '';
  let savingCaption = false;
  let savedAt = 0;
  let captionEl: HTMLTextAreaElement;

  $: editing = editingIndex === null ? null : (photos[editingIndex] ?? null);

  async function openEditor(i: number) {
    if (editingIndex !== null) await flushCaption();
    editingIndex = i;
    draftCaption = photos[i]?.caption ?? '';
    savedAt = 0;
    await tick();
    captionEl?.focus();
  }

  async function closeEditor() {
    await flushCaption();
    editingIndex = null;
  }

  async function step(delta: number) {
    if (editingIndex === null || photos.length === 0) return;
    await flushCaption();
    const next = (editingIndex + delta + photos.length) % photos.length;
    editingIndex = next;
    draftCaption = photos[next]?.caption ?? '';
    savedAt = 0;
    await tick();
    captionEl?.focus();
  }

  /** Save the description if it changed. Called before we move or close. */
  async function flushCaption() {
    const photo = editingIndex === null ? null : photos[editingIndex];
    if (!photo) return;
    const trimmed = draftCaption.trim().slice(0, MAX_CAPTION);
    if ((photo.caption ?? '') === trimmed) return;
    savingCaption = true;
    try {
      await onSaveCaption(photo, trimmed);
      photos = photos.map((p) => (p.id === photo.id ? { ...p, caption: trimmed || null } : p));
      savedAt = Date.now();
      dispatch('changed');
    } finally {
      savingCaption = false;
    }
  }

  function onPanelKey(e: KeyboardEvent) {
    if (editingIndex === null) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      void closeEditor();
    }
    // Ctrl/Cmd + Enter saves and closes, the usual shortcut in a text box.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void closeEditor();
    }
  }

  // ── Reordering ──────────────────────────────────────────────────────
  let dragIndex: number | null = null;
  let overIndex: number | null = null;
  let savingOrder = false;

  function onDragStart(e: DragEvent, i: number) {
    if (!onReorder) return;
    dragIndex = i;
    e.dataTransfer?.setData('text/plain', String(i));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, i: number) {
    if (!onReorder || dragIndex === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    overIndex = i;
  }

  async function onDrop(e: DragEvent, i: number) {
    if (!onReorder || dragIndex === null) return;
    e.preventDefault();
    const from = dragIndex;
    dragIndex = null;
    overIndex = null;
    if (from === i) return;
    await moveTo(from, i);
  }

  function onDragEnd() {
    dragIndex = null;
    overIndex = null;
  }

  async function moveTo(from: number, to: number) {
    if (!onReorder) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    photos = next;
    // Keep the editing panel on the same photo after it moves.
    if (editingIndex === from) editingIndex = to;
    savingOrder = true;
    try {
      await onReorder(next.map((p) => p.id));
      dispatch('changed');
    } finally {
      savingOrder = false;
    }
  }

  /** Arrow keys move a photo when its drag handle has focus. */
  function onHandleKey(e: KeyboardEvent, i: number) {
    if (!onReorder) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (i > 0) void moveTo(i, i - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (i < photos.length - 1) void moveTo(i, i + 1);
    }
  }

  // ── Visibility + delete ─────────────────────────────────────────────
  let busyId: string | null = null;

  async function toggle(photo: ManagedPhoto, patch: { isPublished?: boolean; showOnHome?: boolean }) {
    if (!onToggle) return;
    busyId = photo.id;
    try {
      await onToggle(photo, patch);
      photos = photos.map((p) => (p.id === photo.id ? { ...p, ...patch } : p));
      dispatch('changed');
    } finally {
      busyId = null;
    }
  }

  // The editing panel works on whichever photo is open. These wrappers keep
  // the "is one open?" check in one place.
  function toggleEditing(patch: { isPublished?: boolean; showOnHome?: boolean }) {
    if (editing) void toggle(editing, patch);
  }
  function removeEditing() {
    if (editing) void remove(editing);
  }

  async function remove(photo: ManagedPhoto) {
    if (!onDelete) return;
    if (!confirm('Remove this photo? This cannot be undone.')) return;
    busyId = photo.id;
    try {
      await onDelete(photo);
      const removedIndex = photos.findIndex((p) => p.id === photo.id);
      photos = photos.filter((p) => p.id !== photo.id);
      if (editingIndex !== null) {
        if (photos.length === 0) editingIndex = null;
        else if (removedIndex <= editingIndex) editingIndex = Math.max(0, editingIndex - 1);
        draftCaption = editingIndex === null ? '' : (photos[editingIndex]?.caption ?? '');
      }
      dispatch('changed');
    } finally {
      busyId = null;
    }
  }
</script>

{#if photos.length === 0}
  <p class="text-sm text-slate-500">{emptyMessage}</p>
{:else}
  {#if onReorder}
    <p class="text-xs text-slate-500 mb-3">
      Drag a photo to change its place. Using a keyboard? Tab to a photo's grip, then press the arrow keys.
      {#if savingOrder}<span class="text-brand-700">Saving order…</span>{/if}
    </p>
  {/if}

  <ul class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {#each photos as photo, i (photo.id)}
      <li
        class="group relative rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden transition-shadow
          {dragIndex === i ? 'opacity-40' : ''}
          {overIndex === i && dragIndex !== null && dragIndex !== i ? 'ring-2 ring-brand-500' : ''}"
        draggable={onReorder ? true : undefined}
        on:dragstart={(e) => onDragStart(e, i)}
        on:dragover={(e) => onDragOver(e, i)}
        on:drop={(e) => onDrop(e, i)}
        on:dragend={onDragEnd}
      >
        <button
          type="button"
          class="block w-full aspect-[4/3] bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          on:click={() => openEditor(i)}
          aria-label={photo.caption ? `Edit description: ${photo.caption}` : 'Add a description to this photo'}
        >
          <img src={photo.url} alt={photo.caption ?? ''} class="h-full w-full object-cover" loading="lazy" />
        </button>

        <!-- Status marks sit on the photo so you can scan the grid at a glance. -->
        <div class="absolute top-1.5 left-1.5 flex items-center gap-1">
          {#if onReorder}
            <button
              type="button"
              class="rounded-lg bg-black/45 p-1.5 text-white/90 backdrop-blur-sm cursor-grab hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/70"
              aria-label={`Move photo ${i + 1} of ${photos.length}. Use the arrow keys.`}
              on:keydown={(e) => onHandleKey(e, i)}
            >
              <GripVertical size={14} />
            </button>
          {/if}
          {#if onToggle && photo.isPublished === false}
            <span class="rounded-lg bg-slate-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
              Hidden
            </span>
          {/if}
          {#if photo.showOnHome}
            <span
              class="rounded-lg bg-amber-500/90 p-1.5 text-white backdrop-blur-sm"
              title={homeToggleLabel}
              aria-label={homeToggleLabel}
            >
              <Star size={14} />
            </span>
          {/if}
        </div>

        <div class="p-2">
          {#if photo.jobNumber}
            <p class="text-[11px] font-mono text-slate-400 truncate">{photo.jobNumber}{#if photo.categoryName} · {photo.categoryName}{/if}</p>
          {/if}
          <p class="text-xs {photo.caption ? 'text-slate-700' : 'text-slate-400 italic'} line-clamp-2 min-h-[2rem]">
            {photo.caption || 'No description yet'}
          </p>
          {#if photo.uploaderName}
            <p class="mt-1 text-[11px] text-slate-400 truncate">Added by {photo.uploaderName}</p>
          {/if}
          <div class="mt-2 flex items-center gap-1">
            <button
              class="btn-ghost btn-sm !px-2 !py-1 text-xs"
              type="button"
              on:click={() => openEditor(i)}
              disabled={!canEdit(photo)}
            >
              <Pencil size={13} /> Describe
            </button>
            {#if onToggle}
              <button
                class="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                type="button"
                title={photo.isPublished ? 'Hide from the public site' : 'Show on the public site'}
                aria-label={photo.isPublished ? 'Hide from the public site' : 'Show on the public site'}
                disabled={busyId === photo.id}
                on:click={() => toggle(photo, { isPublished: !photo.isPublished })}
              >
                {#if busyId === photo.id}
                  <Loader2 size={14} class="animate-spin" />
                {:else if photo.isPublished}
                  <Eye size={14} />
                {:else}
                  <EyeOff size={14} />
                {/if}
              </button>
              <button
                class="p-1.5 rounded-lg hover:bg-amber-50 disabled:opacity-40 {photo.showOnHome ? 'text-amber-600' : 'text-slate-400'}"
                type="button"
                title={homeToggleLabel}
                aria-label={homeToggleLabel}
                aria-pressed={photo.showOnHome === true}
                disabled={busyId === photo.id}
                on:click={() => toggle(photo, { showOnHome: !photo.showOnHome })}
              >
                <Star size={14} />
              </button>
            {/if}
            {#if onDelete}
              <button
                class="ml-auto p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                type="button"
                title="Remove"
                aria-label="Remove photo"
                disabled={!canEdit(photo) || busyId === photo.id}
                on:click={() => remove(photo)}
              >
                <Trash2 size={14} />
              </button>
            {/if}
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<!-- ─────────────────── Description editor ─────────────────── -->
{#if editing}
  <div
    class="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-0 sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-label="Photo description"
    tabindex="-1"
    on:keydown={onPanelKey}
  >
    <!-- Clicking outside the panel saves and closes it. -->
    <button type="button" class="absolute inset-0 cursor-default" aria-label="Close" on:click={closeEditor}></button>

    <div class="relative z-10 bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <p class="text-sm text-slate-500 font-mono tabular-nums">
          {(editingIndex ?? 0) + 1} / {photos.length}
        </p>
        <div class="flex items-center gap-1">
          <button
            class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            type="button"
            on:click={() => step(-1)}
            disabled={photos.length < 2}
            aria-label="Previous photo"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            type="button"
            on:click={() => step(1)}
            disabled={photos.length < 2}
            aria-label="Next photo"
          >
            <ChevronRight size={18} />
          </button>
          <button
            class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 ml-1"
            type="button"
            on:click={closeEditor}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 grid md:grid-cols-2 overflow-y-auto">
        <div class="bg-slate-900 flex items-center justify-center p-3 min-h-[40vh] md:min-h-0">
          <img src={editing.url} alt={editing.caption ?? ''} class="max-h-[60vh] max-w-full object-contain rounded-lg" />
        </div>

        <div class="p-5 space-y-4">
          <div>
            <label class="label" for="photo-caption">Description</label>
            <textarea
              id="photo-caption"
              bind:this={captionEl}
              class="input"
              rows="4"
              maxlength={MAX_CAPTION}
              placeholder="For example: Sam fixing a toaster at the March session."
              bind:value={draftCaption}
            ></textarea>
            <div class="mt-1 flex items-start justify-between gap-3">
              <p class="text-xs text-slate-500">
                Say what is happening in the photo. People who use a screen reader hear this text instead
                of seeing the photo, and it shows under the photo on the site.
              </p>
              <span class="text-xs text-slate-400 tabular-nums shrink-0">{draftCaption.length}/{MAX_CAPTION}</span>
            </div>
            <p class="mt-2 text-xs h-4">
              {#if savingCaption}
                <span class="text-slate-500 inline-flex items-center gap-1"><Loader2 size={12} class="animate-spin" /> Saving…</span>
              {:else if savedAt}
                <span class="text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> Saved</span>
              {/if}
            </p>
          </div>

          {#if editing.jobNumber}
            <p class="text-xs text-slate-500">
              From repair {editing.jobNumber}{#if editing.categoryName} · {editing.categoryName}{/if}
            </p>
          {/if}
          {#if editing.uploaderName}
            <p class="text-xs text-slate-500">Added by {editing.uploaderName}</p>
          {/if}

          {#if onToggle}
            <div class="space-y-2 border-t border-slate-100 pt-4">
              <label class="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={editing.isPublished !== false}
                  on:change={(e) => toggleEditing({ isPublished: e.currentTarget.checked })}
                />
                <span>
                  Show on the public site
                  <span class="block text-xs text-slate-500">Visitors see this photo on the event's page.</span>
                </span>
              </label>
              <label class="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={editing.showOnHome === true}
                  on:change={(e) => toggleEditing({ showOnHome: e.currentTarget.checked })}
                />
                <span>
                  {homeToggleLabel}
                  <span class="block text-xs text-slate-500">Also adds it to the photo strip on the home page.</span>
                </span>
              </label>
            </div>
          {/if}

          <div class="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
            {#if onDelete}
              <button
                class="btn-ghost btn-sm text-rose-700"
                type="button"
                disabled={!canEdit(editing)}
                on:click={removeEditing}
              >
                <Trash2 size={14} /> Remove photo
              </button>
            {:else}
              <span></span>
            {/if}
            <button class="btn-primary btn-sm" type="button" on:click={closeEditor}>
              Save and close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
