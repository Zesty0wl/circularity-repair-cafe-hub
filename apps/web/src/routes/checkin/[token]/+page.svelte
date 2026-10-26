<script lang="ts">
  import { track } from '$lib/analytics';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { api } from '$lib/api';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import { Wrench, ArrowRight, ArrowLeft, Sparkles, CheckCircle2, Plus, ExternalLink, Copy, Heart } from 'lucide-svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';
  import { loadPreRegistration } from '$lib/preRegistration';
  import { t, tNow } from '$lib/i18n';
  import { translate } from '@circularity/shared';

  $: token = $page.params.token;

  interface SkillCategory { id: string; name: string; icon: string; colour: string }
  interface CheckInData {
    event: { id: string; name: string; date: string; startTime: string; endTime: string; status: string };
    venue: { name: string; address: string | null };
    cafe: {
      name: string;
      logoUrl: string | null;
      allowSkipPhoto: boolean;
      enableContactField: boolean;
      weighItemsEnabled?: boolean;
      askFirstVisitEnabled?: boolean;
      donateUrl: string | null;
    };
    categories: SkillCategory[];
  }

  // Saved-on-device customer state, keyed by event token. Lets a returning
  // customer skip the "about you" step and adds every new item to the same
  // tracking link.
  interface SavedCustomer {
    customerToken: string;
    customerName: string;
    customerContact: string | null;
    savedAt: number;
  }
  const STORAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — stale entries are ignored

  let info: CheckInData | null = null;
  let loadError = '';

  // Form state
  let step = 1;
  let customerName = '';
  let customerContact = '';
  let gdpr = false;
  let itemDescription = '';
  let faultDescription = '';
  let itemBrand = '';
  /** Item weight in kilograms, as typed. Empty means "not weighed". */
  let weightKg = '';
  /**
   * Whether the visitor says this is their first time at the cafe. Null means
   * they did not answer, which is not the same as "no".
   */
  let isFirstVisit: boolean | null = null;
  let itemCategoryId: string | null = null;
  /** Which kind of thing it is, so the CO2 saving can be looked up. */
  let co2FactorId: string | null = null;
  let allTypes: Array<{ id: string; label: string; category: string }> = [];
  let busy = false;
  let error = '';
  let createdJob: { id: string; jobNumber: string } | null = null;
  let uploadedThumb: string | null = null;
  let uploadingPhoto = false;

  // Returning-customer state
  let savedCustomer: SavedCustomer | null = null;
  let customerToken: string | null = null;
  let trackingUrl = '';
  let copiedLink = false;

  // Items this visitor pre-registered for this session on this phone. When
  // there are any, the first screen offers to check them all in at once.
  interface PreItem { id: string; itemDescription: string; itemBrand: string | null }
  interface ArrivedJob { id: string; jobNumber: string; itemDescription: string; status: string }
  let preItems: PreItem[] = [];
  let preName = '';
  let preToken = '';
  let arrivedJobs: ArrivedJob[] | null = null;
  let arriving = false;

  async function findPreRegistered(eventId: string): Promise<void> {
    const saved = loadPreRegistration(eventId);
    if (!saved) return;
    try {
      const res = await api<{ customerName: string | null; items: PreItem[] }>(
        `/api/checkin/${token}/pre-registrations?customerToken=${encodeURIComponent(saved.customerToken)}`,
        { autoRefresh: false },
      );
      preItems = res.items;
      preName = res.customerName ?? saved.customerName;
      preToken = saved.customerToken;
    } catch {
      /* switched off, or the link is old: carry on with a normal check-in */
    }
  }

  async function arrive(): Promise<void> {
    arriving = true;
    error = '';
    try {
      const res = await api<{ customerToken: string; customerName: string | null; jobs: ArrivedJob[] }>(
        `/api/checkin/${token}/arrive`,
        { method: 'POST', json: { customerToken: preToken }, autoRefresh: false },
      );
      arrivedJobs = res.jobs;
      // From now on this visitor is a returning customer for this session, so
      // another item joins the same tracking link.
      const name = res.customerName ?? preName;
      savedCustomer = { customerToken: res.customerToken, customerName: name, customerContact: null, savedAt: Date.now() };
      if (token) saveCustomer(token, savedCustomer);
      customerName = name;
      customerToken = res.customerToken;
      gdpr = true;
      trackingUrl = buildTrackingUrl(res.customerToken);
      preItems = [];
      track('checkin', { category: 'Pre-registered', returning: 'yes' });
    } catch (err: any) {
      error = err?.message || tNow('Could not check in your items');
    } finally {
      arriving = false;
    }
  }

  function skipPreRegistered(): void {
    preItems = [];
  }

  $: returning = savedCustomer !== null;
  $: totalSteps = returning ? 3 : 4;
  // Returning customers see steps 1→3→4 internally but the progress bar should
  // show 1→2→3, so collapse the "you" step (#2) out of the visible count.
  $: progressCurrent = returning ? (step === 1 ? 1 : step === 3 ? 2 : 3) : step;

  function storageKey(eventToken: string): string {
    return `repair-cafe:checkin:${eventToken}`;
  }

  function loadSavedCustomer(eventToken: string): SavedCustomer | null {
    if (!browser) return null;
    try {
      const raw = localStorage.getItem(storageKey(eventToken));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedCustomer;
      if (!parsed.customerToken || !parsed.savedAt) return null;
      if (Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
        localStorage.removeItem(storageKey(eventToken));
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function saveCustomer(eventToken: string, c: SavedCustomer): void {
    if (!browser) return;
    try {
      localStorage.setItem(storageKey(eventToken), JSON.stringify(c));
    } catch {
      /* quota or disabled — non-fatal */
    }
  }

  function clearSavedCustomer(eventToken: string): void {
    if (!browser) return;
    try {
      localStorage.removeItem(storageKey(eventToken));
    } catch {
      /* ignore */
    }
    savedCustomer = null;
    customerToken = null;
  }

  onMount(async () => {
    try {
      info = await api<CheckInData>(`/api/checkin/${token}`, { autoRefresh: false });
      savedCustomer = loadSavedCustomer(token);
      if (savedCustomer) {
        customerName = savedCustomer.customerName;
        customerContact = savedCustomer.customerContact ?? '';
        customerToken = savedCustomer.customerToken;
        gdpr = true;
      }
      if (info.event.status === 'active') await findPreRegistered(info.event.id);
    } catch (err: any) {
      loadError = err?.message || tNow('Could not load this event');
    }
    // The kinds of thing we can work out a carbon saving for. If this fails the
    // picker simply does not appear, and check-in carries on as before.
    try {
      const res = await fetch('/api/public/co2-factors');
      if (res.ok) {
        const body = (await res.json()) as {
          enabled: boolean;
          factors: Array<{ id: string; label: string; category: string; co2eKg: number | null }>;
        };
        // Types with no carbon figure would give a visitor a choice that does
        // nothing, so they are left out here.
        if (body.enabled) allTypes = body.factors.filter((f) => f.co2eKg !== null);
      }
    } catch {
      /* leave the picker out */
    }
  });

  /**
   * The item types under whichever category the visitor tapped. Each type
   * names its category in English. A hub set up in French has French category
   * names, so a type also belongs to the category with the French name.
   */
  $: selectedCategoryName = info?.categories.find((c) => c.id === itemCategoryId)?.name ?? null;
  $: itemTypes = selectedCategoryName
    ? allTypes.filter(
        (t) => t.category === selectedCategoryName || translate('fr', t.category) === selectedCategoryName,
      )
    : [];
  // Changing the category makes the old choice meaningless.
  $: if (itemCategoryId && co2FactorId && !itemTypes.some((t) => t.id === co2FactorId)) {
    co2FactorId = null;
  }

  function next() {
    error = '';
    if (step === 2) {
      if (!customerName.trim()) return (error = tNow('Please enter your first name'));
      if (!gdpr) return (error = tNow('Please confirm we can store your details'));
      step = 3;
      return;
    }
    if (step === 1) {
      // Returning customers skip the "you" step.
      step = returning ? 3 : 2;
      return;
    }
    step++;
  }

  function prev() {
    error = '';
    if (step === 3 && returning) {
      step = 1;
      return;
    }
    if (step > 1) step--;
  }

  function buildTrackingUrl(t: string): string {
    if (!browser) return `/track/${t}`;
    return `${window.location.origin}/track/${t}`;
  }

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

  async function submitJob() {
    if (!itemDescription.trim()) return (error = tNow('Please describe your item'));
    if (!faultDescription.trim()) return (error = tNow('Please tell us what is wrong'));
    busy = true;
    error = '';
    // Someone who already checked in an item today has a token saved.
    const returning = Boolean(customerToken);
    try {
      const payload: Record<string, unknown> = {
        itemDescription: itemDescription.trim(),
        faultDescription: faultDescription.trim(),
        itemBrand: itemBrand.trim() || null,
        itemCategoryId,
        co2FactorId,
        weightKg: info?.cafe.weighItemsEnabled ? weightValue() : null,
        isFirstVisit: info?.cafe.askFirstVisitEnabled ? isFirstVisit : null,
      };
      if (customerToken) {
        payload.customerToken = customerToken;
      } else {
        payload.customerName = customerName.trim();
        payload.customerContact = customerContact.trim() || null;
        payload.gdprConsent = true;
      }
      const job = await api<{ id: string; jobNumber: string; status: string; customerToken: string }>(
        `/api/checkin/${token}/jobs`,
        { method: 'POST', json: payload, autoRefresh: false },
      );
      createdJob = { id: job.id, jobNumber: job.jobNumber };
      customerToken = job.customerToken;
      trackingUrl = buildTrackingUrl(job.customerToken);
      // Persist so they can add more items + return to their tracker later.
      saveCustomer(token, {
        customerToken: job.customerToken,
        customerName: customerName.trim(),
        customerContact: customerContact.trim() || null,
        savedAt: Date.now(),
      });
      savedCustomer = {
        customerToken: job.customerToken,
        customerName: customerName.trim(),
        customerContact: customerContact.trim() || null,
        savedAt: Date.now(),
      };
      step = 4;
      // Only the kind of item, never what the visitor typed about it.
      track('checkin', { category: selectedCategoryName ?? 'Not chosen', returning: returning ? 'yes' : 'no' });
    } catch (err: any) {
      error = err?.message || tNow('Could not check in');
    } finally {
      busy = false;
    }
  }

  async function onCapture(e: CustomEvent<{ blob: Blob; previewUrl: string }>) {
    if (!createdJob) return;
    uploadingPhoto = true;
    try {
      const fd = new FormData();
      fd.append('image', e.detail.blob, 'photo.jpg');
      const res = await api<{ id: string; url: string }>(`/api/checkin/${token}/jobs/${createdJob.id}/image`, {
        method: 'POST',
        formData: fd,
        autoRefresh: false,
        // Proves this visitor checked the item in.
        headers: customerToken ? { 'x-customer-token': customerToken } : undefined,
      });
      uploadedThumb = res.url;
    } catch (err: any) {
      error = err?.message || tNow('Could not upload photo');
    } finally {
      uploadingPhoto = false;
    }
  }

  function addAnotherItem(): void {
    // Keep customer info / token; reset just the item-specific fields and jump
    // straight back to step 3.
    itemDescription = '';
    faultDescription = '';
    itemBrand = '';
    weightKg = '';
    isFirstVisit = null;
    itemCategoryId = null;
    co2FactorId = null;
    createdJob = null;
    uploadedThumb = null;
    error = '';
    step = 3;
  }

  function startFresh(): void {
    clearSavedCustomer(token);
    customerName = '';
    customerContact = '';
    gdpr = false;
    itemDescription = '';
    faultDescription = '';
    itemBrand = '';
    weightKg = '';
    isFirstVisit = null;
    itemCategoryId = null;
    co2FactorId = null;
    createdJob = null;
    uploadedThumb = null;
    error = '';
    trackingUrl = '';
    step = 2;
  }

  async function copyTrackingUrl(): Promise<void> {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      copiedLink = true;
      setTimeout(() => (copiedLink = false), 2000);
    } catch {
      /* clipboard blocked — user can still long-press the link */
    }
  }

  function eventStatusMessage(): string | null {
    if (!info) return null;
    if (info.event.status === 'scheduled') {
      return tNow("This event hasn't started yet. Doors open at {time}.", { time: info.event.startTime.slice(0, 5) });
    }
    if (info.event.status === 'completed') return tNow('This event has now finished. See our events page for upcoming dates.');
    if (info.event.status === 'cancelled') return tNow("Unfortunately today's event has been cancelled. See our events page for future dates.");
    return null;
  }
</script>

<main class="min-h-screen bg-slate-100 customer-ui">
  <div class="max-w-md mx-auto px-4 py-8">
    {#if loadError}
      <div class="card p-6 text-center">
        <h1 class="text-2xl font-semibold">{$t('Sorry')}</h1>
        <p class="mt-3 text-slate-700">{loadError}</p>
        <a class="btn-primary mt-6" href="/events">{$t('See our events')}</a>
      </div>
    {:else if !info}
      <div class="card p-6 text-center text-slate-500">{$t('Loading…')}</div>
    {:else if eventStatusMessage()}
      <div class="card p-6 text-center">
        <h1 class="text-2xl font-semibold">{info.cafe.name}</h1>
        <p class="mt-3 text-slate-700">{eventStatusMessage()}</p>
        <a class="btn-primary mt-6" href="/events">{$t('See our events')}</a>
      </div>
    {:else}
      {#if step < 4 && !(step === 1 && (arrivedJobs || preItems.length))}
        <div class="mb-6"><ProgressBar current={progressCurrent} total={totalSteps} /></div>
      {/if}

      {#if step === 1 && arrivedJobs}
        <div class="card p-8 text-center">
          <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
          <h1 class="text-3xl font-bold mt-5">{$t('You are checked in')}</h1>
          {#if arrivedJobs.length}
            <ul class="mt-6 space-y-3 text-left">
              {#each arrivedJobs as job (job.id)}
                <li class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
                  <p class="text-sm text-slate-600">{job.itemDescription}</p>
                  <p class="text-sm uppercase tracking-wide text-slate-500 mt-1">{$t('Job number')}</p>
                  <p class="text-3xl font-extrabold text-brand-700 tracking-wide">{job.jobNumber}</p>
                </li>
              {/each}
            </ul>
            <p class="mt-5 text-slate-700">
              {#if arrivedJobs.some((j) => j.status === 'in_progress')}{$t('Your repairer knows you are here and will come and find you.')}{:else}{$t('A repairer will come and find you shortly.')}{/if}
            </p>
            <p class="mt-1 text-slate-700">{$t('Please have a seat and hold on to your item.')}</p>
          {:else}
            <p class="mt-3 text-slate-700">{$t('Your items were already checked in.')}</p>
          {/if}
          {#if trackingUrl}
            <a href={trackingUrl} target="_blank" rel="noopener" class="btn-primary mt-8 w-full justify-center"><ExternalLink size={18} /> {$t('Open my tracker')}</a>
          {/if}
          <button type="button" class="btn-secondary mt-3 w-full justify-center" on:click={() => { arrivedJobs = null; step = 3; }}>
            <Plus size={18} /> {$t('I have another item')}
          </button>
        </div>
      {:else if step === 1 && preItems.length}
        <div class="card p-8 text-center">
          <h1 class="text-3xl font-bold">{$t('Welcome, {name}!', { name: preName })}</h1>
          <p class="mt-3 text-slate-700 text-lg">{preItems.length === 1 ? $t('You pre-registered this item:') : $t('You pre-registered these items:')}</p>
          <ul class="mt-4 space-y-2 text-left">
            {#each preItems as item (item.id)}
              <li class="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3 font-medium text-slate-900">
                {item.itemDescription}{#if item.itemBrand} <span class="font-normal text-slate-500">· {item.itemBrand}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if error}<p class="mt-4 text-sm text-rose-600">{error}</p>{/if}
          <button class="btn-primary btn-lg mt-8 w-full" disabled={arriving} on:click={arrive}>
            {arriving ? $t('Checking in…') : preItems.length === 1 ? $t('Check in my item') : $t('Check in my items')} <ArrowRight size={20} />
          </button>
          <button class="block mx-auto mt-6 text-sm text-slate-500 underline" on:click={skipPreRegistered}>
            {$t('I have brought something else')}
          </button>
        </div>
      {:else if step === 1}
        <div class="card p-8 text-center">
          {#if info.cafe.logoUrl}
            <img src={info.cafe.logoUrl} alt={$t('{name} logo', { name: info.cafe.name })} class="h-16 w-16 mx-auto rounded-2xl bg-white object-contain p-2 ring-1 ring-slate-200" />
          {:else}
            <span class="h-14 w-14 mx-auto rounded-2xl bg-brand-600 text-white flex items-center justify-center"><Wrench size={24} /></span>
          {/if}
          {#if returning && savedCustomer}
            <h1 class="text-3xl font-bold mt-5">{$t('Welcome back, {name}!', { name: savedCustomer.customerName })}</h1>
            <p class="mt-3 text-slate-700 text-lg">{$t('Got another item to repair?')}</p>
            <p class="mt-1 text-sm text-slate-500">{info.event.name} · {info.venue.name}</p>
            <button class="btn-primary btn-lg mt-8 w-full" on:click={next}>
              <Plus size={20} /> {$t('Add another item')}
            </button>
            <a
              href={buildTrackingUrl(savedCustomer.customerToken)}
              target="_blank"
              rel="noopener"
              class="btn-secondary mt-3 w-full"
            >
              {$t('See my existing items')} <ExternalLink size={16} />
            </a>
            <button class="block mx-auto mt-6 text-sm text-slate-500 underline" on:click={startFresh}>
              {$t('Not {name}? Start fresh', { name: savedCustomer.customerName })}
            </button>
          {:else}
            <h1 class="text-3xl font-bold mt-5">{$t('Welcome to {name}!', { name: info.cafe.name })}</h1>
            <p class="mt-3 text-slate-700 text-lg">{$t("Let's get your repair started.")}</p>
            <p class="mt-1 text-sm text-slate-500">{info.event.name} · {info.venue.name}</p>
            <button class="btn-primary btn-lg mt-8 w-full" on:click={next}>{$t('Check in my item')} <ArrowRight size={20} /></button>
          {/if}
        </div>
      {:else if step === 2}
        <div class="card p-8">
          <h1 class="text-2xl font-bold">{$t('First, a little about you')}</h1>
          <div class="mt-6 space-y-5">
            <div>
              <label class="label text-base" for="cn">{$t('Your first name')}</label>
              <input id="cn" class="input text-lg py-4" maxlength="50" bind:value={customerName} autocomplete="given-name" />
            </div>
            {#if info.cafe.enableContactField}
              <div>
                <label class="label text-base" for="cc">{$t('Phone or email')} <span class="font-normal text-slate-500">{$t('(only if you want us to contact you)')}</span></label>
                <input id="cc" class="input text-lg py-4" maxlength="100" bind:value={customerContact} />
              </div>
            {/if}
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" class="h-6 w-6 rounded border-slate-300 text-brand-600 mt-0.5" bind:checked={gdpr} />
              <span class="text-base">{$t("I'm happy for my details to be stored for this repair session.")}</span>
            </label>
            <p class="text-sm text-slate-500">{$t("We only keep your name and contact if you provide it. We don't share it with anyone.")}</p>
          </div>
          {#if error}<p class="mt-4 text-sm text-rose-600">{error}</p>{/if}
          <div class="mt-8 flex justify-between">
            <button class="btn-ghost" on:click={prev}><ArrowLeft size={18} /> {$t('Back')}</button>
            <button class="btn-primary btn-lg" on:click={next}>{$t('Next')} <ArrowRight size={18} /></button>
          </div>
        </div>
      {:else if step === 3}
        <div class="card p-8">
          <h1 class="text-2xl font-bold">
            {returning ? $t('Tell us about your next item') : $t('Now, tell us about the item')}
          </h1>
          {#if returning && savedCustomer}
            <p class="mt-2 text-sm text-slate-500">{$t("Adding to {name}'s list of repairs today.", { name: savedCustomer.customerName })}</p>
          {/if}
          <div class="mt-6 space-y-5">
            <div>
              <p class="label text-base">{$t('What type of item is it?')}</p>
              <div class="grid grid-cols-2 gap-3 mt-1">
                {#each info.categories as cat}
                  <button
                    type="button"
                    class="card p-4 text-center transition-shadow {itemCategoryId === cat.id ? 'ring-2 ring-brand-600 bg-brand-50' : 'hover:ring-brand-400'}"
                    on:click={() => (itemCategoryId = cat.id)}
                  >
                    <span class="icon-chip" style="background-color: {cat.colour}">
                      <Icon icon={categoryIcon(cat.icon, cat.name)} width="24" height="24" />
                    </span>
                    <span class="block mt-2 font-medium text-base">{$t(cat.name)}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- What kind of thing it is. This is what lets us work out the
                 CO2 saving instead of guessing it. Only shown once a category
                 is chosen, so the list stays short, and always skippable
                 because somebody may not find their item. -->
            {#if itemCategoryId && itemTypes.length > 0}
              <div>
                <p class="label text-base">{$t('Which of these is closest?')}</p>
                <p class="text-sm text-slate-500 -mt-1 mb-2">
                  {$t('This helps us work out the carbon it saves. Skip it if none fit.')}
                </p>
                <div class="flex flex-wrap gap-2">
                  {#each itemTypes as type (type.id)}
                    <button
                      type="button"
                      class="type-chip {co2FactorId === type.id ? 'is-picked' : ''}"
                      on:click={() => (co2FactorId = co2FactorId === type.id ? null : type.id)}
                    >
                      {$t(type.label)}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <div>
              <label class="label text-base" for="id">{$t('Item description')}</label>
              <input id="id" class="input text-lg py-4" maxlength="200" placeholder={$t('e.g. Bosch cordless drill, blue')} bind:value={itemDescription} />
            </div>
            <div>
              <label class="label text-base" for="ib">{$t('Brand (optional)')}</label>
              <input id="ib" class="input text-lg py-4" maxlength="100" bind:value={itemBrand} />
            </div>
            {#if info.cafe.weighItemsEnabled}
              <div>
                <label class="label text-base" for="wt">{$t('Weight in kg (optional)')}</label>
                <input id="wt" type="text" inputmode="decimal" class="input text-lg py-4" placeholder={$t('e.g. 1.5')} bind:value={weightKg} />
              </div>
            {/if}
            {#if info.cafe.askFirstVisitEnabled}
              <fieldset>
                <legend class="label text-base">{$t('Is this your first visit to us? (optional)')}</legend>
                <div class="flex gap-2">
                  {#each [[true, 'Yes'], [false, 'No']] as [value, text]}
                    <button
                      type="button"
                      class="flex-1 rounded-xl py-3 text-base font-semibold ring-1 transition {isFirstVisit === value
                        ? 'ring-2 ring-brand-600 bg-brand-50 text-brand-800'
                        : 'ring-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
                      aria-pressed={isFirstVisit === value}
                      on:click={() => (isFirstVisit = isFirstVisit === value ? null : (value as boolean))}
                    >{$t(String(text))}</button>
                  {/each}
                </div>
              </fieldset>
            {/if}
            <div>
              <label class="label text-base" for="fd">{$t("What's wrong with it?")}</label>
              <textarea id="fd" class="input text-lg py-4" rows="3" maxlength="500" placeholder={$t("e.g. Won't turn on, battery seems dead")} bind:value={faultDescription}></textarea>
            </div>
          </div>
          {#if error}<p class="mt-4 text-sm text-rose-600">{error}</p>{/if}
          <div class="mt-8 flex justify-between">
            <button class="btn-ghost" on:click={prev}><ArrowLeft size={18} /> {$t('Back')}</button>
            <button class="btn-primary btn-lg" on:click={submitJob} disabled={busy}>
              {busy ? $t('Saving…') : $t('Continue')} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      {:else if step === 4}
        {#if !createdJob}
          <div class="card p-6 text-center text-slate-500">{$t('Working on it…')}</div>
        {:else}
          <div class="card p-8 text-center">
            <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
            <h1 class="text-3xl font-bold mt-5">{$t("Got it, we're on it!")}</h1>
            <p class="mt-3 text-slate-700 text-lg">{$t('Your repair has been sent to our team.')}</p>
            <p class="mt-4 text-sm uppercase tracking-wide text-slate-500">{$t('Your job number')}</p>
            <p class="text-5xl font-extrabold text-brand-700 mt-1 tracking-wide">{createdJob.jobNumber}</p>
            <p class="mt-5 text-slate-700">{$t('A repairer will come and find you shortly.')}</p>
            <p class="mt-1 text-slate-700">{$t('Please have a seat and hold on to your item.')}</p>

            {#if trackingUrl}
              <div class="mt-8 rounded-2xl bg-brand-50 ring-1 ring-brand-200 p-5 text-left">
                <h2 class="text-base font-semibold text-brand-900 flex items-center gap-2">
                  <Sparkles size={18} /> {$t('Track your repair, live')}
                </h2>
                <p class="mt-1 text-sm text-brand-900/80">
                  {$t('Save this link. It shows the status of every item you check in today.')}
                </p>
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener"
                  class="btn-primary mt-4 w-full justify-center"
                >
                  <ExternalLink size={18} /> {$t('Open my tracker')}
                </a>
                <div class="mt-3 flex items-stretch gap-2">
                  <input
                    type="text"
                    readonly
                    value={trackingUrl}
                    class="input flex-1 text-xs bg-white"
                    on:focus={(e) => (e.currentTarget as HTMLInputElement).select()}
                  />
                  <button type="button" class="btn-secondary !px-3" on:click={copyTrackingUrl}>
                    <Copy size={16} /> <span class="sr-only">{$t('Copy link')}</span>
                  </button>
                </div>
                {#if copiedLink}<p class="mt-2 text-xs text-emerald-700">{$t('Link copied!')}</p>{/if}
              </div>
            {/if}

            {#if info.cafe.donateUrl}
              <div class="mt-4 rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-5 text-left">
                <h2 class="text-base font-semibold text-rose-900 flex items-center gap-2">
                  <Heart size={18} class="fill-rose-500 text-rose-500" /> {$t('Love what we do?')}
                </h2>
                <p class="mt-1 text-sm text-rose-900/80">
                  {$t("Our repairs are free, but parts, tools and venue hire aren't. If you can spare a few pounds, every donation keeps us running.")}
                </p>
                <a
                  href={info.cafe.donateUrl}
                  target="_blank"
                  rel="noopener"
                  on:click={() => track('donate', { place: 'check-in' })}
                  class="btn-primary mt-4 w-full justify-center !bg-rose-600 hover:!bg-rose-700"
                >
                  <Heart size={16} /> {$t('Make a donation')}
                </a>
              </div>
            {/if}

            <div class="mt-6 text-left">
              <h2 class="text-lg font-semibold flex items-center gap-2"><Sparkles size={18} /> {$t('Want to add a photo?')}</h2>
              <p class="mt-1 text-sm text-slate-600">{$t("A photo helps our repairers see what they'll be working on while you wait.")}</p>
              {#if uploadedThumb}
                <div class="mt-3 text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={16} /> {$t('Photo uploaded, thanks!')}</div>
                <img src={uploadedThumb} alt={$t('Uploaded')} class="mt-2 w-32 h-32 rounded-xl object-cover ring-1 ring-slate-200" />
              {:else}
                <div class="mt-3"><CameraCapture on:capture={onCapture} maxLongestEdge={1200} quality={0.8} /></div>
              {/if}
              {#if uploadingPhoto}<p class="text-sm text-slate-500 mt-2">{$t('Uploading…')}</p>{/if}
            </div>

            <button type="button" class="btn-secondary mt-8 w-full justify-center" on:click={addAnotherItem}>
              <Plus size={18} /> {$t('I have another item to register')}
            </button>

            <p class="mt-8 text-sm text-slate-500">{$t('Thank you for choosing to repair rather than replace.')}</p>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</main>

<style>
  /* Item types. Big enough to tap on a phone, and quiet enough that they do
     not compete with the category tiles above them. */
  .type-chip {
    padding: 0.55rem 0.9rem;
    border-radius: 9999px;
    background: #fff;
    border: 1px solid rgb(203 213 225);
    font-size: 0.95rem;
    color: rgb(51 65 85);
    transition:
      border-color 0.12s ease,
      background-color 0.12s ease;
  }
  .type-chip:hover,
  .type-chip:focus-visible {
    border-color: rgb(var(--brand-400));
    outline: none;
  }
  .type-chip.is-picked {
    background: rgb(var(--brand-50));
    border-color: rgb(var(--brand-600));
    color: rgb(var(--brand-900));
    font-weight: 600;
  }
</style>
