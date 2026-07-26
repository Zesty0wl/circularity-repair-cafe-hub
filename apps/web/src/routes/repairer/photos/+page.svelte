<script lang="ts">
  /**
   * Add photos to a session.
   *
   * Built for a phone in a busy hall: pick the session, take or choose photos,
   * and they are up. You can describe and remove your own photos afterwards.
   * Only admins can hide a photo or put it in the main gallery on the site.
   */
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import ImageDropzone from '$lib/components/ImageDropzone.svelte';
  import GalleryManager from '$lib/components/GalleryManager.svelte';
  import type { ManagedPhoto } from '$lib/gallery';
  import { CalendarDays, Camera, Info } from 'lucide-svelte';

  interface EventRow {
    id: string;
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    venueName: string;
    photoCount: number;
  }

  let events: EventRow[] = [];
  let selectedId = '';
  let photos: ManagedPhoto[] = [];
  let loadingEvents = true;
  let loadingPhotos = false;
  let error = '';

  $: isAdmin = $auth?.user.role === 'admin' || $auth?.user.role === 'super_admin';
  $: selected = events.find((e) => e.id === selectedId) ?? null;

  async function loadEvents() {
    try {
      events = await api<EventRow[]>('/api/event-gallery/events');
      // Start on the session running now, or else the most recent one.
      const active = events.find((e) => e.status === 'active');
      selectedId = active?.id ?? events[0]?.id ?? '';
      if (selectedId) await loadPhotos();
    } catch (err: any) {
      error = err?.message ?? 'Could not load your sessions';
    } finally {
      loadingEvents = false;
    }
  }

  async function loadPhotos() {
    if (!selectedId) return;
    loadingPhotos = true;
    try {
      const res = await api<{ photos: ManagedPhoto[] }>(`/api/event-gallery/${selectedId}`);
      photos = res.photos ?? [];
      error = '';
    } catch (err: any) {
      error = err?.message ?? 'Could not load the photos for this session';
      photos = [];
    } finally {
      loadingPhotos = false;
    }
  }

  onMount(loadEvents);

  async function onPick(e: Event) {
    selectedId = (e.currentTarget as HTMLSelectElement).value;
    await loadPhotos();
  }

  async function afterUpload() {
    await loadPhotos();
    // Keep the count on the picker honest.
    events = events.map((ev) => (ev.id === selectedId ? { ...ev, photoCount: photos.length } : ev));
  }

  async function saveCaption(photo: ManagedPhoto, caption: string) {
    await api(`/api/event-gallery/photos/${photo.id}`, { method: 'PATCH', json: { caption } });
  }
  async function removePhoto(photo: ManagedPhoto) {
    await api(`/api/event-gallery/photos/${photo.id}`, { method: 'DELETE' });
  }

  /** You can change your own photos. Admins can change anyone's. */
  function canEdit(photo: ManagedPhoto): boolean {
    return isAdmin || photo.isMine === true;
  }

  function eventLabel(e: EventRow): string {
    const d = new Date(e.date + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const suffix = e.status === 'active' ? ' · on now' : '';
    return `${d} · ${e.name}${suffix}`;
  }
</script>

<h1 class="text-2xl font-bold">Session photos</h1>
<p class="mt-1 text-slate-600">
  Add photos of a session so the website shows what we actually do. Photos of the room, the team at
  work, or a repair in progress all work well.
</p>

{#if loadingEvents}
  <p class="mt-6 text-slate-500">Loading…</p>
{:else if events.length === 0}
  <div class="card p-6 mt-6 text-center">
    <span class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
      <CalendarDays size={22} />
    </span>
    <h2 class="mt-3 text-lg font-semibold">No sessions yet</h2>
    <p class="mt-1 text-slate-600 text-sm">Once a session has been set up you can add photos to it here.</p>
  </div>
{:else}
  <div class="card p-5 mt-6 space-y-4">
    <div>
      <label class="label" for="event-pick">Which session?</label>
      <select id="event-pick" class="input" value={selectedId} on:change={onPick}>
        {#each events as e}
          <option value={e.id}>{eventLabel(e)}{e.photoCount > 0 ? ` (${e.photoCount} photo${e.photoCount === 1 ? '' : 's'})` : ''}</option>
        {/each}
      </select>
      {#if selected}
        <p class="mt-1 text-xs text-slate-500">
          {selected.venueName} · {selected.startTime.slice(0, 5)}–{selected.endTime.slice(0, 5)}
        </p>
      {/if}
    </div>

    <div class="rounded-xl bg-brand-50 ring-1 ring-brand-100 p-3 flex gap-2.5 text-sm text-slate-700">
      <Info size={16} class="text-brand-700 shrink-0 mt-0.5" />
      <p>
        Please ask before you photograph anyone, and avoid names, addresses or anything else personal
        in shot. An admin can hide a photo at any time.
      </p>
    </div>

    <ImageDropzone
      endpoint={`/api/event-gallery/${selectedId}`}
      disabled={!selectedId}
      title="Add photos"
      hint="Take a photo, choose one from your device, or drag photos in from a folder."
      on:done={afterUpload}
    />
  </div>

  <section class="mt-6">
    <h2 class="text-lg font-semibold flex items-center gap-2">
      <Camera size={18} class="text-clay" /> Photos of this session
      {#if photos.length > 0}<span class="font-normal text-slate-500 text-base">({photos.length})</span>{/if}
    </h2>
    {#if error}
      <p class="mt-2 text-sm text-rose-700">{error}</p>
    {/if}
    <div class="mt-3">
      {#if loadingPhotos}
        <p class="text-slate-500 text-sm">Loading…</p>
      {:else}
        <GalleryManager
          bind:photos
          onSaveCaption={saveCaption}
          onDelete={removePhoto}
          {canEdit}
          emptyMessage="No photos for this session yet. Yours will show up here."
        />
      {/if}
    </div>
  </section>
{/if}
