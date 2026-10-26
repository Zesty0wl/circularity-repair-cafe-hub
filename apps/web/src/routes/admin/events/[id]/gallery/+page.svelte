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
  import { t, tNow, dateLocale } from '$lib/i18n';

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
      error = err?.message ?? tNow('Could not load the photos for this event');
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
      ? tNow('Show all {n} repair photos on the public site?', { n: repairPhotos.length })
      : tNow('Hide every repair photo for this session?');
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
    return new Date(d + 'T12:00:00Z').toLocaleDateString(dateLocale(), {
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
  <ArrowLeft size={16} /> {$t('Back to the event')}
</a>

{#if loading}
  <p class="mt-4 text-slate-500">{$t('Loading…')}</p>
{:else if error}
  <div class="card p-6 mt-4">
    <p class="text-rose-700">{error}</p>
  </div>
{:else if event}
  <div class="mt-3 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-bold">{$t('Photos')}</h1>
      <p class="text-slate-600">{event.name} · {fullDate(event.date)} · {event.venueName}</p>
    </div>
    {#if event.isPublished}
      <a href={`/events/${id}`} target="_blank" rel="noopener" class="btn-secondary btn-sm">
        {$t('View the public page')} <ExternalLink size={14} />
      </a>
    {/if}
  </div>

  <p class="mt-2 text-sm text-slate-600">
    {#if publicCount === 0}
      {$t('Nothing is on the public page for this session yet.')}
    {:else}
      {publicCount === 1
        ? $t('{n} photo showing on the public page for this session.', { n: publicCount })
        : $t('{n} photos showing on the public page for this session.', { n: publicCount })}
    {/if}
  </p>

  <!-- ─────────────────── Session photos ─────────────────── -->
  <section class="card p-5 mt-5 space-y-5">
    <div>
      <h2 class="text-lg font-semibold flex items-center gap-2"><Camera size={18} class="text-clay" /> {$t('Photos of the session')}</h2>
      <p class="text-sm text-slate-600 mt-1">
        {$t('The room, the team at work, the queue, the cake. Repairers can add these too, from the Photos page in their own area. They go on the public page straight away.')}
      </p>
    </div>

    <ImageDropzone
      endpoint={`/api/event-gallery/${id}`}
      title={$t('Add photos of this session')}
      hint={$t('Drag photos here, paste one from your clipboard, or browse your device. JPEG, PNG or WebP.')}
      on:done={load}
    />

    <GalleryManager
      bind:photos
      onSaveCaption={saveCaption}
      onDelete={removePhoto}
      onReorder={reorder}
      onToggle={togglePhoto}
      emptyMessage={$t('No photos of this session yet.')}
      homeToggleLabel={$t('Show in the main gallery on the site')}
    />
  </section>

  <!-- ─────────────────── Repair photos ─────────────────── -->
  <section class="card p-5 mt-5 space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold flex items-center gap-2"><Wrench size={18} class="text-clay" /> {$t('Repair photos')}</h2>
        <p class="text-sm text-slate-600 mt-1 max-w-2xl">
          {$t("Photos volunteers took of the items themselves. They stay private until you choose to show them, because they are pictures of someone else's belongings. Check first that nothing personal is in shot.")}
        </p>
      </div>
      {#if repairPhotos.length > 0}
        <div class="flex gap-2">
          <button class="btn-secondary btn-sm" type="button" disabled={bulkBusy} on:click={() => bulkRepairPhotos(true)}>
            <Eye size={14} /> {$t('Show all')}
          </button>
          <button class="btn-ghost btn-sm" type="button" disabled={bulkBusy} on:click={() => bulkRepairPhotos(false)}>
            <EyeOff size={14} /> {$t('Hide all')}
          </button>
        </div>
      {/if}
    </div>

    {#if repairPhotos.length > 0}
      <p class="text-sm text-slate-500">
        {$t('{shown} of {total} showing on the public site.', { shown: publishedRepairCount, total: repairPhotos.length })}
      </p>
    {/if}

    <GalleryManager
      bind:photos={repairPhotos}
      onSaveCaption={saveRepairCaption}
      onToggle={toggleRepairPhoto}
      emptyMessage={$t('No repair photos were taken at this session.')}
      homeToggleLabel={$t('Show in the main gallery on the site')}
    />
  </section>
{/if}
