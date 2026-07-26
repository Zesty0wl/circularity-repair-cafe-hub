<script lang="ts">
  /**
   * Photos for one session.
   *
   * Two groups, because they come from different places and need different
   * care. Session photos are of the room and the team, so they go public as
   * soon as someone adds them. Repair photos are of a visitor's belongings, so
   * they stay hidden until an admin chooses to show them.
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import ImageDropzone from '$lib/components/ImageDropzone.svelte';
  import GalleryManager from '$lib/components/GalleryManager.svelte';
  import type { ManagedPhoto } from '$lib/gallery';
  import { ArrowLeft, Camera, Wrench, Eye, EyeOff, ExternalLink } from 'lucide-svelte';

  $: id = $page.params.id;

  interface EventInfo {
    id: string;
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    isPublished: boolean;
    venueName: string;
  }

  let event: EventInfo | null = null;
  let photos: ManagedPhoto[] = [];
  let repairPhotos: ManagedPhoto[] = [];
  let loading = true;
  let bulkBusy = false;
  let error = '';

  async function load() {
    try {
      const res = await api<{
        event: EventInfo;
        photos: ManagedPhoto[];
        repairPhotos: ManagedPhoto[];
      }>(`/api/event-gallery/${id}`);
      event = res.event;
      photos = res.photos ?? [];
      repairPhotos = res.repairPhotos ?? [];
      error = '';
    } catch (err: any) {
      error = err?.message ?? 'Could not load the photos for this event';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  // ── Session photos ────────────────────────────────────────────────
  async function saveCaption(photo: ManagedPhoto, caption: string) {
    await api(`/api/event-gallery/photos/${photo.id}`, { method: 'PATCH', json: { caption } });
  }
  async function removePhoto(photo: ManagedPhoto) {
    await api(`/api/event-gallery/photos/${photo.id}`, { method: 'DELETE' });
  }
  async function reorder(ids: string[]) {
    await api(`/api/event-gallery/${id}/reorder`, { method: 'POST', json: { ids } });
  }
  async function togglePhoto(photo: ManagedPhoto, patch: { isPublished?: boolean; showOnHome?: boolean }) {
    await api(`/api/event-gallery/photos/${photo.id}`, { method: 'PATCH', json: patch });
  }

  // ── Repair photos ─────────────────────────────────────────────────
  async function saveRepairCaption(photo: ManagedPhoto, caption: string) {
    await api(`/api/event-gallery/repair-photos/${photo.id}`, { method: 'PATCH', json: { caption } });
  }
  async function toggleRepairPhoto(photo: ManagedPhoto, patch: { isPublished?: boolean; showOnHome?: boolean }) {
    await api(`/api/event-gallery/repair-photos/${photo.id}`, { method: 'PATCH', json: patch });
  }
  async function bulkRepairPhotos(publish: boolean) {
    const wording = publish
      ? `Show all ${repairPhotos.length} repair photos on the public site?`
      : 'Hide every repair photo for this session?';
    if (!confirm(wording)) return;
    bulkBusy = true;
    try {
      await api(`/api/event-gallery/${id}/repair-photos/bulk`, { method: 'POST', json: { publish } });
      await load();
    } finally {
      bulkBusy = false;
    }
  }

  function fullDate(d: string): string {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  $: publishedRepairCount = repairPhotos.filter((p) => p.isPublished).length;
  $: publicCount = photos.filter((p) => p.isPublished !== false).length + publishedRepairCount;
</script>

<a href={`/admin/events/${id}`} class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
  <ArrowLeft size={16} /> Back to the event
</a>

{#if loading}
  <p class="mt-4 text-slate-500">Loading…</p>
{:else if error}
  <div class="card p-6 mt-4">
    <p class="text-rose-700">{error}</p>
  </div>
{:else if event}
  <div class="mt-3 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-bold">Photos</h1>
      <p class="text-slate-600">{event.name} · {fullDate(event.date)} · {event.venueName}</p>
    </div>
    {#if event.isPublished}
      <a href={`/events/${id}`} target="_blank" rel="noopener" class="btn-secondary btn-sm">
        View the public page <ExternalLink size={14} />
      </a>
    {/if}
  </div>

  <p class="mt-2 text-sm text-slate-600">
    {#if publicCount === 0}
      Nothing is on the public page for this session yet.
    {:else}
      {publicCount} photo{publicCount === 1 ? '' : 's'} showing on the public page for this session.
    {/if}
  </p>

  <!-- ─────────────────── Session photos ─────────────────── -->
  <section class="card p-5 mt-5 space-y-5">
    <div>
      <h2 class="text-lg font-semibold flex items-center gap-2"><Camera size={18} class="text-clay" /> Photos of the session</h2>
      <p class="text-sm text-slate-600 mt-1">
        The room, the team at work, the queue, the cake. Repairers can add these too, from the
        Photos page in their own area. They go on the public page straight away.
      </p>
    </div>

    <ImageDropzone
      endpoint={`/api/event-gallery/${id}`}
      title="Add photos of this session"
      hint="Drag photos here, paste one from your clipboard, or browse your device. JPEG, PNG or WebP."
      on:done={load}
    />

    <GalleryManager
      bind:photos
      onSaveCaption={saveCaption}
      onDelete={removePhoto}
      onReorder={reorder}
      onToggle={togglePhoto}
      emptyMessage="No photos of this session yet."
      homeToggleLabel="Show in the main gallery on the site"
    />
  </section>

  <!-- ─────────────────── Repair photos ─────────────────── -->
  <section class="card p-5 mt-5 space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold flex items-center gap-2"><Wrench size={18} class="text-clay" /> Repair photos</h2>
        <p class="text-sm text-slate-600 mt-1 max-w-2xl">
          Photos volunteers took of the items themselves. They stay private until you choose to show
          them, because they are pictures of someone else's belongings. Check first that nothing
          personal is in shot.
        </p>
      </div>
      {#if repairPhotos.length > 0}
        <div class="flex gap-2">
          <button class="btn-secondary btn-sm" type="button" disabled={bulkBusy} on:click={() => bulkRepairPhotos(true)}>
            <Eye size={14} /> Show all
          </button>
          <button class="btn-ghost btn-sm" type="button" disabled={bulkBusy} on:click={() => bulkRepairPhotos(false)}>
            <EyeOff size={14} /> Hide all
          </button>
        </div>
      {/if}
    </div>

    {#if repairPhotos.length > 0}
      <p class="text-sm text-slate-500">
        {publishedRepairCount} of {repairPhotos.length} showing on the public site.
      </p>
    {/if}

    <GalleryManager
      bind:photos={repairPhotos}
      onSaveCaption={saveRepairCaption}
      onToggle={toggleRepairPhoto}
      emptyMessage="No repair photos were taken at this session."
      homeToggleLabel="Show in the main gallery on the site"
    />
  </section>
{/if}
