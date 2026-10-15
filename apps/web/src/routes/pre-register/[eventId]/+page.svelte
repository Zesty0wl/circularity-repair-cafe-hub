<script lang="ts">
  // Pre-register an item for a session. The visitor tells us what it is and
  // what is wrong, so a repairer can prepare before the day. Nothing is
  // repaired, or timed, until the item is checked in at the session.
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  import { api } from '$lib/api';
  import { cafe } from '$lib/stores/cafe';
  import { categoryIcon } from '$lib/categoryIcon';
  import { sessionTimes } from '$lib/staff/queue';
  import { forgetPreRegistration, loadPreRegistration, savePreRegistration, type SavedPreRegistration } from '$lib/preRegistration';
  import { ArrowLeft, CheckCircle2, Copy, ExternalLink, MapPin, Plus, Wrench } from 'lucide-svelte';

  interface PublicEvent {
    id: string;
    name: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: { name: string; address: string | null; postcode: string | null };
    preRegistration?: { open: boolean; askContact: boolean } | null;
  }
  interface SkillCategory { id: string; name: string; icon: string; colour: string }

  $: eventId = $page.params.eventId;

  let event: PublicEvent | null = null;
  let categories: SkillCategory[] = [];
  let loadError = '';
  let saved: SavedPreRegistration | null = null;

  let customerName = '';
  let customerContact = '';
  let consent = false;
  let itemCategoryId: string | null = null;
  let itemDescription = '';
  let itemBrand = '';
  let faultDescription = '';
  let busy = false;
  let error = '';
  let done: { itemDescription: string } | null = null;
  let copied = false;

  onMount(async () => {
    try {
      const [evt, cats] = await Promise.all([
        api<PublicEvent>(`/api/public/events/${eventId}`, { autoRefresh: false }),
        api<SkillCategory[]>('/api/public/skill-categories', { autoRefresh: false }),
      ]);
      event = evt;
      categories = cats;
      saved = loadPreRegistration(evt.id);
    } catch (err: any) {
      loadError = err?.status === 404 ? 'We could not find this session.' : err?.message || 'Could not load this session';
    }
  });

  $: trackingUrl = saved ? `${typeof window === 'undefined' ? '' : window.location.origin}/track/${saved.customerToken}` : '';

  function longDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  async function submit() {
    error = '';
    if (!saved) {
      if (!customerName.trim()) return (error = 'Please enter your first name');
      if (!consent) return (error = 'Please confirm we can store your details');
    }
    if (!itemDescription.trim()) return (error = 'Please describe your item');
    if (!faultDescription.trim()) return (error = 'Please tell us what is wrong with it');
    busy = true;
    try {
      const payload: Record<string, unknown> = {
        itemDescription: itemDescription.trim(),
        faultDescription: faultDescription.trim(),
        itemBrand: itemBrand.trim() || null,
        itemCategoryId,
      };
      if (saved) {
        payload.customerToken = saved.customerToken;
      } else {
        payload.customerName = customerName.trim();
        payload.customerContact = customerContact.trim() || null;
        payload.gdprConsent = true;
      }
      const res = await api<{ id: string; customerToken: string }>(`/api/public/events/${eventId}/pre-register`, {
        method: 'POST',
        json: payload,
        autoRefresh: false,
      });
      saved = { customerToken: res.customerToken, customerName: saved?.customerName ?? customerName.trim(), savedAt: Date.now() };
      if (event) savePreRegistration(event.id, saved);
      done = { itemDescription: itemDescription.trim() };
    } catch (err: any) {
      error = err?.message || 'Could not save your item';
    } finally {
      busy = false;
    }
  }

  function another() {
    done = null;
    itemCategoryId = null;
    itemDescription = '';
    itemBrand = '';
    faultDescription = '';
    error = '';
  }

  function notMe() {
    if (event) forgetPreRegistration(event.id);
    saved = null;
    customerName = '';
    customerContact = '';
    consent = false;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the visitor can still press and hold the link */
    }
  }
</script>

<svelte:head>
  <title>Pre-register your item</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen bg-slate-100 customer-ui">
  <div class="max-w-md mx-auto px-4 py-8">
    <a href={`/events/${eventId}`} class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> Back to the session</a>

    {#if loadError}
      <div class="card p-6 text-center mt-4">
        <h1 class="text-2xl font-semibold">Sorry</h1>
        <p class="mt-3 text-slate-700">{loadError}</p>
        <a class="btn-primary mt-6" href="/events">See our events</a>
      </div>
    {:else if !event}
      <div class="card p-6 text-center text-slate-500 mt-4">Loading…</div>
    {:else if !event.preRegistration?.open && !done}
      <div class="card p-6 text-center mt-4">
        <h1 class="text-2xl font-semibold">Pre-registration is closed</h1>
        <p class="mt-3 text-slate-700">
          {#if event.preRegistration}You cannot pre-register for this session any more. You can still bring your item on the day.{:else}This cafe does not take pre-registrations. Just bring your item on the day.{/if}
        </p>
        <a class="btn-primary mt-6" href={`/events/${event.id}`}>See the session</a>
      </div>
    {:else}
      <div class="card p-6 mt-4">
        <div class="flex items-center gap-3">
          {#if $cafe?.logoUrl}
            <img src={$cafe.logoUrl} alt="" class="h-12 w-12 rounded-xl bg-white object-contain p-1.5 ring-1 ring-slate-200" />
          {:else}
            <span class="h-12 w-12 rounded-xl bg-brand-600 text-white flex items-center justify-center"><Wrench size={22} /></span>
          {/if}
          <div class="min-w-0">
            <p class="font-semibold text-slate-900">{event.name}</p>
            <p class="text-sm text-slate-600">{longDate(event.date)}, {sessionTimes(event.startTime, event.endTime)}</p>
          </div>
        </div>
        <p class="mt-3 text-sm text-slate-600 flex items-start gap-1.5"><MapPin size={16} class="shrink-0 mt-0.5" /> {event.venue.name}{#if event.venue.address}, {event.venue.address}{/if}</p>
      </div>

      {#if done && saved}
        <div class="card p-8 mt-4 text-center">
          <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
          <h1 class="text-2xl font-bold mt-5">Your item is on the list</h1>
          <p class="mt-2 text-slate-700">Thank you, {saved.customerName}. We have saved your {done.itemDescription}.</p>

          <ol class="mt-6 text-left space-y-3 text-slate-700">
            <li class="flex gap-3"><span class="h-6 w-6 shrink-0 rounded-full bg-brand-100 text-brand-800 text-sm font-bold flex items-center justify-center">1</span> A repairer may look into your item before the day.</li>
            <li class="flex gap-3"><span class="h-6 w-6 shrink-0 rounded-full bg-brand-100 text-brand-800 text-sm font-bold flex items-center justify-center">2</span> Bring your item to the session. When you arrive, scan the QR code at the door with this phone, or give your name at the welcome desk.</li>
            <li class="flex gap-3"><span class="h-6 w-6 shrink-0 rounded-full bg-brand-100 text-brand-800 text-sm font-bold flex items-center justify-center">3</span> The repair starts when your item is checked in.</li>
          </ol>

          <div class="mt-6 rounded-2xl bg-brand-50 ring-1 ring-brand-200 p-5 text-left">
            <h2 class="text-base font-semibold text-brand-900">Your tracking link</h2>
            <p class="mt-1 text-sm text-brand-900/80">Save this link. It shows your items, and you can cancel an item there if your plans change.</p>
            <a href={trackingUrl} class="btn-primary mt-4 w-full justify-center"><ExternalLink size={18} /> Open my tracking page</a>
            <div class="mt-3 flex items-stretch gap-2">
              <input type="text" readonly value={trackingUrl} class="input flex-1 text-xs bg-white" on:focus={(e) => e.currentTarget.select()} />
              <button type="button" class="btn-secondary !px-3" on:click={copyLink}><Copy size={16} /> <span class="sr-only">Copy link</span></button>
            </div>
            {#if copied}<p class="mt-2 text-xs text-emerald-700">Link copied</p>{/if}
          </div>

          {#if event.preRegistration?.open}
            <button type="button" class="btn-secondary mt-6 w-full justify-center" on:click={another}><Plus size={18} /> Pre-register another item</button>
          {/if}
        </div>
      {:else}
        <form class="card p-6 mt-4 space-y-5" on:submit|preventDefault={submit}>
          <div>
            <h1 class="text-2xl font-bold">Pre-register your item</h1>
            <p class="mt-1 text-slate-600">Tell us about your item before the session. Our repairers can then prepare, for example by finding a manual.</p>
          </div>

          {#if saved}
            <p class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-sm text-slate-700">
              Adding to {saved.customerName}'s items for this session.
              <button type="button" class="underline text-slate-500" on:click={notMe}>Not {saved.customerName}?</button>
            </p>
          {:else}
            <fieldset class="space-y-4">
              <legend class="text-sm font-semibold text-slate-800">About you</legend>
              <div>
                <label class="label" for="pn">Your first name</label>
                <input id="pn" class="input" maxlength="50" autocomplete="given-name" bind:value={customerName} />
              </div>
              {#if event.preRegistration?.askContact}
                <div>
                  <label class="label" for="pc">Phone or email <span class="font-normal text-slate-500">(optional, if a repairer may contact you about the item)</span></label>
                  <input id="pc" class="input" maxlength="100" bind:value={customerContact} />
                </div>
              {/if}
              <label class="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" class="h-5 w-5 rounded border-slate-300 text-brand-600 mt-0.5" bind:checked={consent} />
                <span class="text-sm text-slate-700">I am happy for my details to be stored for this repair. We do not share them with anyone.</span>
              </label>
            </fieldset>
          {/if}

          <fieldset class="space-y-4 border-t border-slate-200 pt-5">
            <legend class="text-sm font-semibold text-slate-800">About the item</legend>
            {#if categories.length}
              <div>
                <p class="label">What type of item is it? <span class="font-normal text-slate-400">(optional)</span></p>
                <div class="grid grid-cols-2 gap-2 mt-1">
                  {#each categories as cat}
                    <button
                      type="button"
                      class="card p-3 text-center transition-shadow {itemCategoryId === cat.id ? 'ring-2 ring-brand-600 bg-brand-50' : 'hover:ring-brand-400'}"
                      aria-pressed={itemCategoryId === cat.id}
                      on:click={() => (itemCategoryId = itemCategoryId === cat.id ? null : cat.id)}
                    >
                      <span class="icon-chip" style="background-color: {cat.colour}">
                        <Icon icon={categoryIcon(cat.icon, cat.name)} width="22" height="22" />
                      </span>
                      <span class="block mt-1.5 font-medium text-sm">{cat.name}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
            <div>
              <label class="label" for="pi">What is the item?</label>
              <input id="pi" class="input" maxlength="200" placeholder="For example: table lamp, blue" bind:value={itemDescription} />
            </div>
            <div>
              <label class="label" for="pb">Brand and model <span class="font-normal text-slate-400">(optional, but it helps us prepare)</span></label>
              <input id="pb" class="input" maxlength="100" placeholder="For example: Roberts R250" bind:value={itemBrand} />
            </div>
            <div>
              <label class="label" for="pf">What is wrong with it?</label>
              <textarea id="pf" class="input" rows="3" maxlength="500" placeholder="For example: it will not turn on" bind:value={faultDescription}></textarea>
            </div>
          </fieldset>

          {#if error}<p class="text-sm text-rose-700">{error}</p>{/if}
          <button type="submit" class="btn-primary btn-lg w-full" disabled={busy}>{busy ? 'Saving…' : 'Pre-register my item'}</button>
          <p class="text-xs text-slate-500 text-center">Pre-registering does not book a time. Please bring your item during the session.</p>
        </form>
      {/if}
    {/if}
  </div>
</main>
