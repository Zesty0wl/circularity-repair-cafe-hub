<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { api } from '$lib/api';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import { Wrench, ArrowRight, ArrowLeft, Sparkles, CheckCircle2, Plus, ExternalLink, Copy, Heart } from 'lucide-svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';

  $: token = $page.params.token;

  interface SkillCategory { id: string; name: string; icon: string; colour: string }
  interface CheckInData {
    event: { id: string; name: string; date: string; startTime: string; endTime: string; status: string };
    venue: { name: string; address: string | null };
    cafe: { name: string; logoUrl: string | null; allowSkipPhoto: boolean; enableContactField: boolean; donateUrl: string | null };
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
  let itemCategoryId: string | null = null;
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
    } catch (err: any) {
      loadError = err?.message || 'Could not load this event';
    }
  });

  function next() {
    error = '';
    if (step === 2) {
      if (!customerName.trim()) return (error = 'Please enter your first name');
      if (!gdpr) return (error = 'Please confirm we can store your details');
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

  async function submitJob() {
    if (!itemDescription.trim()) return (error = 'Please describe your item');
    if (!faultDescription.trim()) return (error = 'Please tell us what is wrong');
    busy = true;
    error = '';
    try {
      const payload: Record<string, unknown> = {
        itemDescription: itemDescription.trim(),
        faultDescription: faultDescription.trim(),
        itemBrand: itemBrand.trim() || null,
        itemCategoryId,
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
    } catch (err: any) {
      error = err?.message || 'Could not check in';
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
      });
      uploadedThumb = res.url;
    } catch (err: any) {
      error = err?.message || 'Could not upload photo';
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
    itemCategoryId = null;
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
    itemCategoryId = null;
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
      return `This event hasn't started yet. Doors open at ${info.event.startTime.slice(0,5)}.`;
    }
    if (info.event.status === 'completed') return 'This event has now finished. See our events page for upcoming dates.';
    if (info.event.status === 'cancelled') return "Unfortunately today's event has been cancelled. See our events page for future dates.";
    return null;
  }
</script>

<main class="min-h-screen bg-slate-50 customer-ui">
  <div class="max-w-md mx-auto px-4 py-8">
    {#if loadError}
      <div class="card p-6 text-center">
        <h1 class="text-2xl font-semibold">Sorry</h1>
        <p class="mt-3 text-slate-700">{loadError}</p>
        <a class="btn-primary mt-6" href="/events">See our events</a>
      </div>
    {:else if !info}
      <div class="card p-6 text-center text-slate-500">Loading…</div>
    {:else if eventStatusMessage()}
      <div class="card p-6 text-center">
        <h1 class="text-2xl font-semibold">{info.cafe.name}</h1>
        <p class="mt-3 text-slate-700">{eventStatusMessage()}</p>
        <a class="btn-primary mt-6" href="/events">See our events</a>
      </div>
    {:else}
      {#if step < 4}
        <div class="mb-6"><ProgressBar current={progressCurrent} total={totalSteps} /></div>
      {/if}

      {#if step === 1}
        <div class="card p-8 text-center">
          {#if info.cafe.logoUrl}
            <img src={info.cafe.logoUrl} alt={`${info.cafe.name} logo`} class="h-20 w-20 mx-auto rounded-2xl bg-white object-contain p-2 ring-1 ring-slate-200" />
          {:else}
            <span class="h-16 w-16 mx-auto rounded-2xl bg-brand-600 text-white flex items-center justify-center"><Wrench size={28} /></span>
          {/if}
          {#if returning && savedCustomer}
            <h1 class="text-3xl font-bold mt-5">Welcome back, {savedCustomer.customerName}!</h1>
            <p class="mt-3 text-slate-700 text-lg">Got another item to repair?</p>
            <p class="mt-1 text-sm text-slate-500">{info.event.name} · {info.venue.name}</p>
            <button class="btn-primary btn-lg mt-8 w-full" on:click={next}>
              <Plus size={20} /> Add another item
            </button>
            <a
              href={buildTrackingUrl(savedCustomer.customerToken)}
              target="_blank"
              rel="noopener"
              class="btn-secondary mt-3 w-full"
            >
              See my existing items <ExternalLink size={16} />
            </a>
            <button class="block mx-auto mt-6 text-sm text-slate-500 underline" on:click={startFresh}>
              Not {savedCustomer.customerName}? Start fresh
            </button>
          {:else}
            <h1 class="text-3xl font-bold mt-5">Welcome to {info.cafe.name}!</h1>
            <p class="mt-3 text-slate-700 text-lg">Let's get your repair started.</p>
            <p class="mt-1 text-sm text-slate-500">{info.event.name} · {info.venue.name}</p>
            <button class="btn-primary btn-lg mt-8 w-full" on:click={next}>Check in my item <ArrowRight size={20} /></button>
          {/if}
        </div>
      {:else if step === 2}
        <div class="card p-8">
          <h1 class="text-2xl font-bold">First, a little about you</h1>
          <div class="mt-6 space-y-5">
            <div>
              <label class="label text-base" for="cn">Your first name</label>
              <input id="cn" class="input text-lg py-4" maxlength="50" bind:value={customerName} autocomplete="given-name" />
            </div>
            {#if info.cafe.enableContactField}
              <div>
                <label class="label text-base" for="cc">Phone or email <span class="font-normal text-slate-500">(only if you want us to contact you)</span></label>
                <input id="cc" class="input text-lg py-4" maxlength="100" bind:value={customerContact} />
              </div>
            {/if}
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" class="h-6 w-6 rounded border-slate-300 text-brand-600 mt-0.5" bind:checked={gdpr} />
              <span class="text-base">I'm happy for my details to be stored for this repair session.</span>
            </label>
            <p class="text-sm text-slate-500">We only keep your name and contact if you provide it. We don't share it with anyone.</p>
          </div>
          {#if error}<p class="mt-4 text-sm text-rose-600">{error}</p>{/if}
          <div class="mt-8 flex justify-between">
            <button class="btn-ghost" on:click={prev}><ArrowLeft size={18} /> Back</button>
            <button class="btn-primary btn-lg" on:click={next}>Next <ArrowRight size={18} /></button>
          </div>
        </div>
      {:else if step === 3}
        <div class="card p-8">
          <h1 class="text-2xl font-bold">
            {returning ? 'Tell us about your next item' : 'Now, tell us about the item'}
          </h1>
          {#if returning && savedCustomer}
            <p class="mt-2 text-sm text-slate-500">Adding to {savedCustomer.customerName}'s list of repairs today.</p>
          {/if}
          <div class="mt-6 space-y-5">
            <div>
              <p class="label text-base">What type of item is it?</p>
              <div class="grid grid-cols-2 gap-3 mt-1">
                {#each info.categories as cat}
                  <button
                    type="button"
                    class="card p-4 text-center transition-colors {itemCategoryId === cat.id ? 'ring-2 ring-brand-600 bg-brand-50' : 'hover:bg-slate-50'}"
                    on:click={() => (itemCategoryId = cat.id)}
                  >
                    <span class="flex w-12 h-12 mx-auto rounded-xl text-white items-center justify-center" style="background-color: {cat.colour}">
                      <Icon icon={categoryIcon(cat.icon)} width="24" height="24" />
                    </span>
                    <span class="block mt-2 font-medium text-base">{cat.name}</span>
                  </button>
                {/each}
              </div>
            </div>
            <div>
              <label class="label text-base" for="id">Item description</label>
              <input id="id" class="input text-lg py-4" maxlength="200" placeholder="e.g. Bosch cordless drill, blue" bind:value={itemDescription} />
            </div>
            <div>
              <label class="label text-base" for="ib">Brand (optional)</label>
              <input id="ib" class="input text-lg py-4" maxlength="100" bind:value={itemBrand} />
            </div>
            <div>
              <label class="label text-base" for="fd">What's wrong with it?</label>
              <textarea id="fd" class="input text-lg py-4" rows="3" maxlength="500" placeholder="e.g. Won't turn on, battery seems dead" bind:value={faultDescription}></textarea>
            </div>
          </div>
          {#if error}<p class="mt-4 text-sm text-rose-600">{error}</p>{/if}
          <div class="mt-8 flex justify-between">
            <button class="btn-ghost" on:click={prev}><ArrowLeft size={18} /> Back</button>
            <button class="btn-primary btn-lg" on:click={submitJob} disabled={busy}>
              {busy ? 'Saving…' : 'Continue'} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      {:else if step === 4}
        {#if !createdJob}
          <div class="card p-6 text-center text-slate-500">Working on it…</div>
        {:else}
          <div class="card p-8 text-center">
            <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
            <h1 class="text-3xl font-bold mt-5">Got it, we're on it!</h1>
            <p class="mt-3 text-slate-700 text-lg">Your repair has been sent to our team.</p>
            <p class="mt-4 text-sm uppercase tracking-wide text-slate-500">Your job number</p>
            <p class="text-5xl font-extrabold text-brand-700 mt-1 tracking-wide">{createdJob.jobNumber}</p>
            <p class="mt-5 text-slate-700">A repairer will come and find you shortly.</p>
            <p class="mt-1 text-slate-700">Please have a seat and hold on to your item.</p>

            {#if trackingUrl}
              <div class="mt-8 rounded-xl border border-brand-200 bg-brand-50 p-5 text-left">
                <h2 class="text-base font-semibold text-brand-900 flex items-center gap-2">
                  <Sparkles size={18} /> Track your repair, live
                </h2>
                <p class="mt-1 text-sm text-brand-900/80">
                  Save this link. It shows the status of every item you check in today.
                </p>
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener"
                  class="btn-primary mt-4 w-full justify-center"
                >
                  <ExternalLink size={18} /> Open my tracker
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
                    <Copy size={16} /> <span class="sr-only">Copy link</span>
                  </button>
                </div>
                {#if copiedLink}<p class="mt-2 text-xs text-emerald-700">Link copied!</p>{/if}
              </div>
            {/if}

            {#if info.cafe.donateUrl}
              <div class="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-5 text-left">
                <h2 class="text-base font-semibold text-rose-900 flex items-center gap-2">
                  <Heart size={18} class="fill-rose-500 text-rose-500" /> Love what we do?
                </h2>
                <p class="mt-1 text-sm text-rose-900/80">
                  Our repairs are free, but parts, tools and venue hire aren't. If you can spare a few pounds, every donation keeps us running.
                </p>
                <a
                  href={info.cafe.donateUrl}
                  target="_blank"
                  rel="noopener"
                  class="btn-primary mt-4 w-full justify-center !bg-rose-600 hover:!bg-rose-700"
                >
                  <Heart size={16} /> Make a donation
                </a>
              </div>
            {/if}

            <div class="mt-6 text-left">
              <h2 class="text-lg font-semibold flex items-center gap-2"><Sparkles size={18} /> Want to add a photo?</h2>
              <p class="mt-1 text-sm text-slate-600">A photo helps our repairers see what they'll be working on while you wait.</p>
              {#if uploadedThumb}
                <div class="mt-3 text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={16} /> Photo uploaded, thanks!</div>
                <img src={uploadedThumb} alt="Uploaded" class="mt-2 w-32 h-32 rounded-lg object-cover" />
              {:else}
                <div class="mt-3"><CameraCapture on:capture={onCapture} maxLongestEdge={1200} quality={0.8} /></div>
              {/if}
              {#if uploadingPhoto}<p class="text-sm text-slate-500 mt-2">Uploading…</p>{/if}
            </div>

            <button type="button" class="btn-secondary mt-8 w-full justify-center" on:click={addAnotherItem}>
              <Plus size={18} /> I have another item to register
            </button>

            <p class="mt-8 text-sm text-slate-500">Thank you for choosing to repair rather than replace.</p>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</main>
