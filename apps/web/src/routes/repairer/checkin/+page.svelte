<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import { cafe } from '$lib/stores/cafe';
  import { firstName } from '$lib/staff/queue';
  import { UserPlus, CheckCircle2, Plus, ArrowLeft, CalendarClock, CalendarOff, Search, X } from 'lucide-svelte';

  interface SkillCategory { id: string; name: string; icon: string; colour: string }

  let categories: SkillCategory[] = [];
  let activeEvent: { id: string; name: string; venueName?: string } | null = null;
  let loading = true;
  let loadError = '';

  // Item
  let itemCategoryId: string | null = null;
  let itemDescription = '';
  let itemBrand = '';
  /** Item weight in kilograms, as typed. Empty means "not weighed". */
  let weightKg = '';
  /** Whether this is the visitor's first visit. Null means not asked or not answered. */
  let isFirstVisit: boolean | null = null;
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
  let created: { jobNumber: string; cardNumber: number | null } | null = null;

  /** The session card numbers, 1..50. A cafe may use fewer. */
  const CARD_NUMBERS = Array.from({ length: 50 }, (_, i) => i + 1);
  /** The number on the card handed to this visitor, or null. */
  let cardNumber: number | null = null;
  /** Numbers already in use by an open job this session. */
  let takenCards: number[] = [];

  // Items visitors pre-registered for this session that have not arrived yet.
  // Only while the cafe has pre-registration switched on.
  interface Expected {
    id: string;
    customerName: string | null;
    itemDescription: string;
    itemBrand: string | null;
    repairerName: string | null;
    category: string | null;
    categoryColour: string | null;
  }
  let expected: Expected[] = [];
  let expectedSearch = '';
  let expectedBusy: string | null = null;
  let expectedError = '';
  /** Items checked in from the list on this visit to the page, by id. */
  let arrived: Record<string, { jobNumber: string; withRepairer: boolean }> = {};

  async function loadExpected() {
    if (!$cafe?.preRegistrationEnabled) return;
    try {
      expected = (await api<{ items: Expected[] }>('/api/repairer/pre-registrations-today')).items;
    } catch {
      expected = [];
    }
  }

  async function checkInExpected(item: Expected) {
    expectedBusy = item.id;
    expectedError = '';
    try {
      const res = await api<{ jobNumber: string; repairerId: string | null }>(`/api/repairer/pre-registrations/${item.id}/check-in`, { method: 'POST', json: {} });
      arrived = { ...arrived, [item.id]: { jobNumber: res.jobNumber, withRepairer: Boolean(res.repairerId) } };
    } catch (err: any) {
      expectedError = err?.message ?? 'Could not check that item in';
      await loadExpected();
    } finally {
      expectedBusy = null;
    }
  }

  $: needle = expectedSearch.trim().toLowerCase();
  $: expectedShown = needle
    ? expected.filter((i) => `${i.customerName ?? ''} ${i.itemDescription} ${i.itemBrand ?? ''}`.toLowerCase().includes(needle))
    : expected;
  // The cafe profile may arrive after the page, so wait for both, then load once.
  let expectedRequested = false;
  $: if ($cafe?.preRegistrationEnabled && activeEvent && !expectedRequested) {
    expectedRequested = true;
    void loadExpected();
  }

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

  type SessionJob = { cardNumber: number | null; status: string };

  /** A number is taken while its job is still open. The rest are free. */
  function cardsInUse(jobs: SessionJob[] | undefined): number[] {
    const open = ['waiting', 'in_progress', 'awaiting_return'];
    return (jobs ?? []).filter((j) => open.includes(j.status) && j.cardNumber != null).map((j) => j.cardNumber as number);
  }

  /**
   * Other volunteers check people in and hand cards back at the same time, so
   * read the numbers in use again before each new visitor, and after a clash.
   */
  async function refreshCards() {
    if (!$cafe?.cardNumbersEnabled) return;
    try {
      takenCards = cardsInUse((await api<{ jobs?: SessionJob[] }>('/api/repairer/active-event')).jobs);
    } catch {
      // Keep the list we have. The hub still refuses a number that is taken.
    }
  }

  onMount(async () => {
    try {
      const [active, cats] = await Promise.all([
        api<{
          event: { id: string; name: string; venueName?: string } | null;
          jobs?: SessionJob[];
        }>('/api/repairer/active-event'),
        api<SkillCategory[]>('/api/public/skill-categories', { autoRefresh: false }),
      ]);
      activeEvent = active.event
        ? { id: active.event.id, name: active.event.name, venueName: active.event.venueName }
        : null;
      takenCards = cardsInUse(active.jobs);
      categories = cats;
    } catch (err: any) {
      loadError = err?.message || 'Could not load the check-in form';
    } finally {
      loading = false;
    }
  });

  /**
   * The typed weight as a number, or null when it was left empty. A comma
   * works as the decimal mark too, so "1,5" and "1.5" are both 1.5 kg.
   */
  function weightValue(): number | null {
    const raw = String(weightKg).trim().replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

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
        weightKg: $cafe?.weighItemsEnabled ? weightValue() : null,
        isFirstVisit: $cafe?.askFirstVisitEnabled ? isFirstVisit : null,
        cardNumber: $cafe?.cardNumbersEnabled ? cardNumber : null,
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
      created = { jobNumber: res.jobNumber, cardNumber: $cafe?.cardNumbersEnabled ? cardNumber : null };
      if (created.cardNumber != null) takenCards = [...takenCards, created.cardNumber];
    } catch (err: any) {
      error = err?.message || 'Could not register the repair';
      // The number may have just been taken by someone else. Show it as taken.
      if (cardNumber != null) {
        await refreshCards();
        if (takenCards.includes(cardNumber)) cardNumber = null;
      }
    } finally {
      busy = false;
    }
  }

  function registerAnother() {
    created = null;
    itemCategoryId = null;
    itemDescription = '';
    itemBrand = '';
    weightKg = '';
    isFirstVisit = null;
    cardNumber = null;
    void refreshCards();
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
    <ArrowLeft size={16} /> Back to the queue
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
      <span class="h-12 w-12 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center"><CalendarOff size={22} /></span>
      <h1 class="text-2xl font-bold mt-4">No active event</h1>
      <p class="mt-2 text-slate-700">An admin needs to start (activate) today's event before you can register repairs.</p>
      <a href="/repairer" class="btn-secondary mt-6">Back to the queue</a>
    </div>
  {:else if created}
    <div class="card p-8 text-center mt-4">
      <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
      <h1 class="text-3xl font-bold mt-5">Repair registered</h1>
      <p class="mt-2 text-slate-700">It's now in the queue for this event.</p>
      {#if created.cardNumber}
        <p class="mt-6 text-sm uppercase tracking-wide text-slate-500">Card number</p>
        <p class="text-5xl font-extrabold text-brand-700 mt-1 tracking-wide">{created.cardNumber}</p>
        <p class="text-sm text-slate-500 mt-1">Job number {created.jobNumber}</p>
        <p class="mt-5 text-slate-600">
          The visitor keeps card {created.cardNumber}, and we call them by that number. Write the job number on the
          item's tag, so we can match the item back to them.
        </p>
      {:else}
        <p class="mt-6 text-sm uppercase tracking-wide text-slate-500">Job number</p>
        <p class="text-5xl font-extrabold text-brand-700 mt-1 tracking-wide">{created.jobNumber}</p>
        <p class="mt-5 text-slate-600">Write this number on the item's tag and let the customer know it. That's how we'll match the item back to them.</p>
      {/if}
      {#if photoWarning}<p class="mt-4 text-sm text-amber-700">{photoWarning}</p>{/if}
      <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <button type="button" class="btn-primary" on:click={registerAnother}>
          <Plus size={18} /> Register another item
        </button>
        <a href="/repairer" class="btn-secondary">Back to the queue</a>
      </div>
    </div>
  {:else}
    {#if expected.length}
      <section class="card p-5 mt-4">
        <h2 class="text-lg font-semibold flex items-center gap-2"><CalendarClock size={20} /> Pre-registered for today</h2>
        <p class="mt-1 text-sm text-slate-600">These visitors told us about their item before the session. When one arrives, check their item in here. The repair time starts now.</p>
        {#if expected.length > 5}
          <label class="relative block mt-3">
            <span class="sr-only">Search by name or item</span>
            <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input class="input pl-9" placeholder="Search by name or item" bind:value={expectedSearch} />
          </label>
        {/if}
        {#if expectedError}<p class="mt-3 text-sm text-rose-700">{expectedError}</p>{/if}
        <ul class="mt-3 divide-y divide-slate-100">
          {#each expectedShown as item (item.id)}
            <li class="py-3 flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-slate-900">{item.customerName ?? 'No name given'}</p>
                <p class="text-sm text-slate-600">
                  {item.itemDescription}{item.itemBrand ? ` · ${item.itemBrand}` : ''}
                  {#if item.repairerName}<span class="text-slate-500">{` · taken by ${firstName(item.repairerName)}`}</span>{/if}
                </p>
              </div>
              {#if arrived[item.id]}
                <p class="text-sm text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 size={16} />
                  <span>Job <strong>{arrived[item.id].jobNumber}</strong>{arrived[item.id].withRepairer ? ', with its repairer' : ', in the queue'}</span>
                </p>
              {:else}
                <button class="btn-primary btn-sm" disabled={expectedBusy === item.id} on:click={() => checkInExpected(item)}>
                  {expectedBusy === item.id ? 'Checking in…' : 'Check in'}
                </button>
              {/if}
            </li>
          {:else}
            <li class="py-3 text-sm text-slate-500">Nobody matches that search.</li>
          {/each}
        </ul>
      </section>
    {/if}

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
                class="card p-3 text-center transition-shadow {itemCategoryId === cat.id ? 'ring-2 ring-brand-600 bg-brand-50' : 'hover:ring-brand-400'}"
                on:click={() => (itemCategoryId = itemCategoryId === cat.id ? null : cat.id)}
              >
                <span class="icon-chip" style="background-color: {cat.colour}">
                  <Icon icon={categoryIcon(cat.icon, cat.name)} width="24" height="24" />
                </span>
                <span class="block mt-1.5 font-medium text-sm">{cat.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Card number: the number on the card handed to the visitor. -->
      {#if $cafe?.cardNumbersEnabled}
      <div>
        <p class="label">Card number <span class="font-normal text-slate-400">(optional)</span></p>
        <p class="text-sm text-slate-500 mb-2">Tap the number on the card you gave the visitor. Numbers already in use are greyed out.</p>
        <div class="grid grid-cols-10 gap-1.5">
          {#each CARD_NUMBERS as n}
            <button
              type="button"
              class="rounded-lg py-1.5 text-sm font-semibold ring-1 transition {cardNumber === n ? 'ring-2 ring-brand-600 bg-brand-50 text-brand-800' : takenCards.includes(n) ? 'ring-slate-100 bg-slate-100 text-slate-300' : 'ring-slate-200 bg-white hover:bg-slate-50 text-slate-700'}"
              disabled={takenCards.includes(n)}
              on:click={() => (cardNumber = cardNumber === n ? null : n)}
            >{n}</button>
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

      {#if $cafe?.weighItemsEnabled}
        <div>
          <label class="label" for="weight">Weight in kg <span class="font-normal text-slate-400">(optional)</span></label>
          <input id="weight" type="text" inputmode="decimal" class="input" placeholder="For example 1.5" bind:value={weightKg} />
        </div>
      {/if}

      {#if $cafe?.askFirstVisitEnabled}
        <fieldset>
          <legend class="label">Is this their first visit? <span class="font-normal text-slate-400">(optional)</span></legend>
          <div class="flex gap-2">
            {#each [[true, 'Yes'], [false, 'No']] as [value, text]}
              <button
                type="button"
                class="flex-1 rounded-lg py-2 text-sm font-semibold ring-1 transition {isFirstVisit === value
                  ? 'ring-2 ring-brand-600 bg-brand-50 text-brand-800'
                  : 'ring-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
                aria-pressed={isFirstVisit === value}
                on:click={() => (isFirstVisit = isFirstVisit === value ? null : (value as boolean))}
              >{text}</button>
            {/each}
          </div>
        </fieldset>
      {/if}

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
            <img src={photoPreview} alt="Item" class="w-32 h-32 rounded-xl object-cover ring-1 ring-slate-200" />
            <button type="button" class="btn-ghost btn-sm" on:click={removePhoto}><X size={16} /> Remove</button>
          </div>
        {:else}
          <CameraCapture on:capture={onPhoto} maxLongestEdge={1200} quality={0.8} />
        {/if}
      </div>

      <!-- Customer (optional) -->
      <fieldset class="border-t border-slate-200 pt-5">
        <legend class="text-sm font-semibold text-slate-700">About the customer <span class="font-normal text-slate-400">(optional)</span></legend>
        <p class="text-sm text-slate-500 mt-1">Leave blank to register the item anonymously. The job number is enough to find them.</p>
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
