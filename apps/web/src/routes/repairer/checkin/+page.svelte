<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import { UserPlus, CheckCircle2, Plus, ArrowLeft, CalendarOff, X } from 'lucide-svelte';

  interface SkillCategory { id: string; name: string; icon: string; colour: string }

  let categories: SkillCategory[] = [];
  let activeEvent: { id: string; name: string; venueName?: string } | null = null;
  let loading = true;
  let loadError = '';

  // Item
  let itemCategoryId: string | null = null;
  let itemDescription = '';
  let itemBrand = '';
  let faultDescription = '';
  // Customer (all optional for a walk-in)
  let customerName = '';
  let customerContact = '';
  let consent = false;

  // Optional item photo, captured in-page and held until the job exists.
  let photoBlob: Blob | null = null;
  let photoPreview: string | null = null;
  let photoWarning = '';

  let busy = false;
  let error = '';
  let created: { jobNumber: string } | null = null;

  // Consent is only meaningful once we're actually storing a name/contact.
  $: hasPii = customerName.trim().length > 0 || customerContact.trim().length > 0;

  function onPhoto(e: CustomEvent<{ blob: Blob; previewUrl: string }>) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    photoBlob = e.detail.blob;
    photoPreview = e.detail.previewUrl;
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    photoBlob = null;
    photoPreview = null;
  }

  onMount(async () => {
    try {
      const [active, cats] = await Promise.all([
        api<{ event: { id: string; name: string; venueName?: string } | null }>('/api/repairer/active-event'),
        api<SkillCategory[]>('/api/public/skill-categories', { autoRefresh: false }),
      ]);
      activeEvent = active.event
        ? { id: active.event.id, name: active.event.name, venueName: active.event.venueName }
        : null;
      categories = cats;
    } catch (err: any) {
      loadError = err?.message || 'Could not load the check-in form';
    } finally {
      loading = false;
    }
  });

  async function submit() {
    error = '';
    if (!itemDescription.trim()) return (error = 'Please describe the item');
    if (!faultDescription.trim()) return (error = "Please describe what's wrong with it");
    if (hasPii && !consent) {
      return (error = 'Please confirm the customer is happy for their details to be stored');
    }
    busy = true;
    try {
      const payload: Record<string, unknown> = {
        itemDescription: itemDescription.trim(),
        faultDescription: faultDescription.trim(),
        itemBrand: itemBrand.trim() || null,
        itemCategoryId,
        customerName: customerName.trim() || null,
        customerContact: customerContact.trim() || null,
        gdprConsent: hasPii ? consent : false,
      };
      const res = await api<{ id: string; jobNumber: string }>('/api/repairer/checkin', { method: 'POST', json: payload });
      // Photo is optional and must attach to the created job, so upload after.
      // A failed photo upload must not lose the registration — keep it soft.
      if (photoBlob) {
        try {
          const fd = new FormData();
          fd.append('image', photoBlob, 'photo.jpg');
          await api(`/api/repairer/jobs/${res.id}/image?stage=check_in`, { method: 'POST', formData: fd });
        } catch {
          photoWarning = 'The repair was registered, but the photo could not be uploaded.';
        }
      }
      created = { jobNumber: res.jobNumber };
    } catch (err: any) {
      error = err?.message || 'Could not register the repair';
    } finally {
      busy = false;
    }
  }

  function registerAnother() {
    created = null;
    itemCategoryId = null;
    itemDescription = '';
    itemBrand = '';
    faultDescription = '';
    customerName = '';
    customerContact = '';
    consent = false;
    removePhoto();
    photoWarning = '';
    error = '';
  }
</script>

<div class="max-w-2xl mx-auto">
  <a href="/repairer" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
    <ArrowLeft size={16} /> Back to dashboard
  </a>

  {#if loading}
    <div class="card p-6 text-center text-slate-500 mt-4">Loading…</div>
  {:else if loadError}
    <div class="card p-6 text-center mt-4">
      <h1 class="text-xl font-semibold">Sorry</h1>
      <p class="mt-2 text-slate-700">{loadError}</p>
    </div>
  {:else if !activeEvent}
    <div class="card p-8 text-center mt-4">
      <span class="h-14 w-14 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center"><CalendarOff size={26} /></span>
      <h1 class="text-2xl font-bold mt-4">No active event</h1>
      <p class="mt-2 text-slate-700">An admin needs to start (activate) today's event before you can register repairs.</p>
      <a href="/repairer" class="btn-secondary mt-6">Back to dashboard</a>
    </div>
  {:else if created}
    <div class="card p-8 text-center mt-4">
      <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
      <h1 class="text-3xl font-bold mt-5">Repair registered</h1>
      <p class="mt-2 text-slate-700">It's now in the queue for this event.</p>
      <p class="mt-6 text-sm uppercase tracking-wide text-slate-500">Job number</p>
      <p class="text-6xl font-extrabold text-brand-700 mt-1 tracking-wide">{created.jobNumber}</p>
      <p class="mt-5 text-slate-600">Write this number on the item's tag and let the customer know it — that's how we'll match the item back to them.</p>
      {#if photoWarning}<p class="mt-4 text-sm text-amber-700">{photoWarning}</p>{/if}
      <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <button type="button" class="btn-primary" on:click={registerAnother}>
          <Plus size={18} /> Register another item
        </button>
        <a href="/repairer" class="btn-secondary">Back to dashboard</a>
      </div>
    </div>
  {:else}
    <header class="mt-4">
      <h1 class="text-2xl font-bold flex items-center gap-2"><UserPlus size={22} /> Register a repair</h1>
      <p class="mt-1 text-slate-600">For a visitor who can't check in on their own device.</p>
      <p class="mt-1 text-sm text-slate-500">{activeEvent.name}{#if activeEvent.venueName} · {activeEvent.venueName}{/if}</p>
    </header>

    <form class="card p-6 mt-4 space-y-6" on:submit|preventDefault={submit}>
      <!-- Item type -->
      {#if categories.length}
        <div>
          <p class="label">What type of item is it? <span class="font-normal text-slate-400">(optional)</span></p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
            {#each categories as cat}
              <button
                type="button"
                class="card p-3 text-center transition-colors {itemCategoryId === cat.id ? 'ring-2 ring-brand-600 bg-brand-50' : 'hover:bg-slate-50'}"
                on:click={() => (itemCategoryId = itemCategoryId === cat.id ? null : cat.id)}
              >
                <span class="flex w-10 h-10 mx-auto rounded-xl text-white items-center justify-center" style="background-color: {cat.colour}">
                  <Icon icon={categoryIcon(cat.icon)} width="20" height="20" />
                </span>
                <span class="block mt-1.5 font-medium text-sm">{cat.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div>
        <label class="label" for="item">Item description</label>
        <input id="item" class="input" maxlength="200" placeholder="e.g. Bosch cordless drill, blue" bind:value={itemDescription} />
      </div>

      <div>
        <label class="label" for="brand">Brand <span class="font-normal text-slate-400">(optional)</span></label>
        <input id="brand" class="input" maxlength="100" bind:value={itemBrand} />
      </div>

      <div>
        <label class="label" for="fault">What's wrong with it?</label>
        <textarea id="fault" class="input" rows="3" maxlength="500" placeholder="e.g. Won't turn on, battery seems dead" bind:value={faultDescription}></textarea>
      </div>

      <!-- Photo (optional) -->
      <div>
        <p class="label">Photo <span class="font-normal text-slate-400">(optional)</span></p>
        <p class="text-sm text-slate-500 mb-2">A photo helps repairers see what they'll be working on.</p>
        {#if photoPreview}
          <div class="flex items-start gap-3">
            <img src={photoPreview} alt="Item" class="w-32 h-32 rounded-lg object-cover ring-1 ring-slate-200" />
            <button type="button" class="btn-ghost text-sm" on:click={removePhoto}><X size={16} /> Remove</button>
          </div>
        {:else}
          <CameraCapture on:capture={onPhoto} maxLongestEdge={1200} quality={0.8} />
        {/if}
      </div>

      <!-- Customer (optional) -->
      <fieldset class="border-t border-slate-200 pt-5">
        <legend class="text-sm font-semibold text-slate-700">About the customer <span class="font-normal text-slate-400">(optional)</span></legend>
        <p class="text-sm text-slate-500 mt-1">Leave blank to register the item anonymously — the job number is enough to find them.</p>
        <div class="mt-4 grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label" for="cn">First name</label>
            <input id="cn" class="input" maxlength="50" bind:value={customerName} autocomplete="off" />
          </div>
          <div>
            <label class="label" for="cc">Phone or email</label>
            <input id="cc" class="input" maxlength="100" bind:value={customerContact} autocomplete="off" />
          </div>
        </div>
        {#if hasPii}
          <label class="flex items-start gap-3 mt-4 cursor-pointer">
            <input type="checkbox" class="h-5 w-5 rounded border-slate-300 text-brand-600 mt-0.5" bind:checked={consent} />
            <span class="text-sm text-slate-700">I've asked, and the customer is happy for their details to be stored for this repair.</span>
          </label>
        {/if}
      </fieldset>

      {#if error}<p class="text-sm text-rose-600">{error}</p>{/if}

      <div class="flex justify-end gap-3">
        <a href="/repairer" class="btn-ghost">Cancel</a>
        <button type="submit" class="btn-primary" disabled={busy}>
          {busy ? 'Registering…' : 'Register repair'}
        </button>
      </div>
    </form>
  {/if}
</div>
