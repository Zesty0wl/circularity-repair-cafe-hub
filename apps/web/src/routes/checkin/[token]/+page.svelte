<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import { Wrench, ArrowRight, ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';

  $: token = $page.params.token;

  interface SkillCategory { id: string; name: string; icon: string; colour: string }
  interface CheckInData {
    event: { id: string; name: string; date: string; startTime: string; endTime: string; status: string };
    venue: { name: string; address: string | null };
    cafe: { name: string; allowSkipPhoto: boolean; enableContactField: boolean };
    categories: SkillCategory[];
  }

  let info: CheckInData | null = null;
  let loadError = '';

  // Form state
  let step = 1;
  const TOTAL = 4;
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

  onMount(async () => {
    try {
      info = await api<CheckInData>(`/api/checkin/${token}`, { autoRefresh: false });
    } catch (err: any) {
      loadError = err?.message || 'Could not load this event';
    }
  });

  function next() {
    error = '';
    if (step === 2) {
      if (!customerName.trim()) return (error = 'Please enter your first name');
      if (!gdpr) return (error = 'Please confirm we can store your details');
    }
    if (step === 3) {
      if (!itemDescription.trim()) return (error = 'Please describe your item');
      if (!faultDescription.trim()) return (error = 'Please tell us what is wrong');
    }
    step++;
  }

  function prev() {
    error = '';
    if (step > 1) step--;
  }

  async function submitJob() {
    busy = true;
    error = '';
    try {
      const job = await api<{ id: string; jobNumber: string; status: string }>(`/api/checkin/${token}/jobs`, {
        method: 'POST',
        json: {
          customerName: customerName.trim(),
          customerContact: customerContact.trim() || null,
          gdprConsent: true,
          itemDescription: itemDescription.trim(),
          faultDescription: faultDescription.trim(),
          itemBrand: itemBrand.trim() || null,
          itemCategoryId,
        },
        autoRefresh: false,
      });
      createdJob = { id: job.id, jobNumber: job.jobNumber };
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

  function reset() {
    step = 1;
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
        <div class="mb-6"><ProgressBar current={step} total={TOTAL} /></div>
      {/if}

      {#if step === 1}
        <div class="card p-8 text-center">
          <span class="h-16 w-16 mx-auto rounded-2xl bg-brand-600 text-white flex items-center justify-center"><Wrench size={28} /></span>
          <h1 class="text-3xl font-bold mt-5">Welcome to {info.cafe.name}!</h1>
          <p class="mt-3 text-slate-700 text-lg">Let's get your repair started.</p>
          <p class="mt-1 text-sm text-slate-500">{info.event.name} · {info.venue.name}</p>
          <button class="btn-primary btn-lg mt-8 w-full" on:click={next}>Check in my item <ArrowRight size={20} /></button>
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
          <h1 class="text-2xl font-bold">Now, tell us about the item</h1>
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
            <h1 class="text-3xl font-bold mt-5">You're checked in!</h1>
            <p class="mt-3 text-slate-700 text-lg">Your job number is</p>
            <p class="text-5xl font-extrabold text-brand-700 mt-2 tracking-wide">{createdJob.jobNumber}</p>
            <p class="mt-4 text-slate-700">A repairer will come and find you shortly.</p>
            <p class="mt-1 text-slate-700">Please have a seat and hold on to your item.</p>

            <div class="mt-8 text-left">
              <h2 class="text-lg font-semibold flex items-center gap-2"><Sparkles size={18} /> Want to add a photo?</h2>
              <p class="mt-1 text-sm text-slate-600">A photo helps our repairers see what they'll be working on.</p>
              {#if uploadedThumb}
                <div class="mt-3 text-sm text-emerald-700">Photo uploaded</div>
                <img src={uploadedThumb} alt="Uploaded" class="mt-2 w-32 h-32 rounded-lg object-cover" />
              {:else}
                <div class="mt-3"><CameraCapture on:capture={onCapture} maxLongestEdge={1200} quality={0.8} /></div>
              {/if}
              {#if uploadingPhoto}<p class="text-sm text-slate-500 mt-2">Uploading…</p>{/if}
            </div>

            <p class="mt-10 text-sm text-slate-500">Thank you for choosing to repair rather than replace.</p>
            <button class="btn-secondary mt-6" on:click={reset}>Next customer →</button>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</main>
