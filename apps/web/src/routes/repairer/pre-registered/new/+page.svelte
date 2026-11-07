<script lang="ts">
  // Add a pre-registered item for a visitor who phones, emails or asks in
  // person. It follows the same rules as the visitor's own form. The visitor
  // gets the same tracking link, which the volunteer can pass on.
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  import { api } from '$lib/api';
  import { categoryIcon } from '$lib/categoryIcon';
  import { sessionTimes } from '$lib/staff/queue';
  import { ArrowLeft, CalendarOff, CalendarPlus, CheckCircle2, ChevronRight, Copy, Plus, UserPlus } from 'lucide-svelte';
  import { t, tNow, dateLocale } from '$lib/i18n';

  interface Session { id: string; name: string; date: string; startTime: string; endTime: string }
  interface SkillCategory { id: string; name: string; icon: string; colour: string }
  /** The visitor we are adding items for, once their first item is saved. */
  interface Visitor { eventId: string; customerToken: string; customerName: string }

  let sessions: Session[] = [];
  let askContact = false;
  let categories: SkillCategory[] = [];
  let loading = true;
  let loadError = '';

  let eventId = '';
  let customerName = '';
  let customerContact = '';
  let consent = false;
  let itemCategoryId: string | null = null;
  let itemDescription = '';
  let itemBrand = '';
  let faultDescription = '';
  let take = false;

  let visitor: Visitor | null = null;
  let busy = false;
  let error = '';
  let done: { id: string; itemDescription: string; taken: boolean } | null = null;
  let copied = false;

  onMount(async () => {
    try {
      const [list, cats] = await Promise.all([
        api<{ sessions?: Session[]; askContact?: boolean }>('/api/repairer/pre-registrations'),
        api<SkillCategory[]>('/api/public/skill-categories', { autoRefresh: false }),
      ]);
      sessions = list.sessions ?? [];
      askContact = list.askContact === true;
      categories = cats;
      eventId = sessions[0]?.id ?? '';
    } catch (err: any) {
      loadError = err?.status === 404 ? tNow('Pre-registration is switched off for this cafe.') : err?.message ?? tNow('Could not load the form');
    } finally {
      loading = false;
    }
  });

  $: session = sessions.find((s) => s.id === eventId) ?? null;
  $: trackingUrl = visitor ? `${typeof window === 'undefined' ? '' : window.location.origin}/track/${visitor.customerToken}` : '';

  function sessionLabel(s: Session): string {
    const day = new Date(`${s.date}T12:00:00Z`).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return `${day}, ${sessionTimes(s.startTime, s.endTime)} · ${s.name}`;
  }

  async function submit() {
    error = '';
    if (!eventId) return (error = tNow('Choose a session'));
    if (!visitor) {
      if (!customerName.trim()) return (error = tNow("Please enter the visitor's first name"));
      if (!consent) return (error = tNow('Please confirm the visitor is happy for their details to be stored'));
    }
    if (!itemDescription.trim()) return (error = tNow('Please describe the item'));
    if (!faultDescription.trim()) return (error = tNow("Please describe what's wrong with it"));
    busy = true;
    try {
      const payload: Record<string, unknown> = {
        eventId,
        itemDescription: itemDescription.trim(),
        faultDescription: faultDescription.trim(),
        itemBrand: itemBrand.trim() || null,
        itemCategoryId,
        take,
      };
      if (visitor) {
        payload.customerToken = visitor.customerToken;
      } else {
        payload.customerName = customerName.trim();
        payload.customerContact = askContact ? customerContact.trim() || null : null;
        payload.gdprConsent = true;
      }
      const res = await api<{ id: string; customerToken: string; customerName: string | null }>('/api/repairer/pre-registrations', {
        method: 'POST',
        json: payload,
      });
      visitor = { eventId, customerToken: res.customerToken, customerName: res.customerName ?? visitor?.customerName ?? customerName.trim() };
      done = { id: res.id, itemDescription: itemDescription.trim(), taken: take };
    } catch (err: any) {
      error = err?.message || tNow('Could not save the item');
    } finally {
      busy = false;
    }
  }

  function clearItem() {
    done = null;
    itemCategoryId = null;
    itemDescription = '';
    itemBrand = '';
    faultDescription = '';
    take = false;
    error = '';
    copied = false;
  }

  /** Another item for the same visitor and session. */
  function sameVisitor() {
    clearItem();
  }

  /** Start again for a different visitor. */
  function newVisitor() {
    clearItem();
    visitor = null;
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
      /* the link is still there to select by hand */
    }
  }
</script>

<svelte:head><title>{$t('Add an item for a visitor')}</title></svelte:head>

<div class="max-w-2xl mx-auto">
  <a href="/repairer/pre-registered" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
    <ArrowLeft size={16} /> {$t('Back to pre-registered items')}
  </a>

  {#if loading}
    <div class="card p-6 text-center text-slate-500 mt-4">{$t('Loading…')}</div>
  {:else if loadError}
    <div class="card p-6 text-center mt-4">
      <h1 class="text-xl font-semibold">{$t('Sorry')}</h1>
      <p class="mt-2 text-slate-700">{loadError}</p>
    </div>
  {:else if sessions.length === 0}
    <div class="card p-8 text-center mt-4">
      <span class="h-12 w-12 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center"><CalendarOff size={22} /></span>
      <h1 class="text-2xl font-bold mt-4">{$t('No sessions to add items to')}</h1>
      <p class="mt-2 text-slate-700">{$t('You can add items to a session that is published and has not started yet. There is none at the moment.')}</p>
      <a href="/repairer/pre-registered" class="btn-secondary mt-6">{$t('Back to pre-registered items')}</a>
    </div>
  {:else if done && visitor}
    <div class="card p-8 text-center mt-4">
      <span class="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={32} /></span>
      <h1 class="text-2xl font-bold mt-5">{$t('The item is on the list')}</h1>
      <p class="mt-2 text-slate-700">{$t('We have saved {item} for {name}.', { item: done.itemDescription, name: visitor.customerName })}</p>
      {#if session}<p class="mt-1 text-sm text-slate-500">{sessionLabel(session)}</p>{/if}
      {#if done.taken}<p class="mt-2 text-sm text-slate-600">{$t('You have taken it to look into.')}</p>{/if}

      <div class="mt-6 rounded-2xl bg-brand-50 ring-1 ring-brand-200 p-5 text-left">
        <h2 class="text-base font-semibold text-brand-900">{$t("The visitor's tracking link")}</h2>
        <p class="mt-1 text-sm text-brand-900/80">{$t('Give the visitor this link if you can. It shows their items, and they can cancel an item there if their plans change. On the day, they can also give their name at the welcome desk.')}</p>
        <div class="mt-3 flex items-stretch gap-2">
          <input type="text" readonly value={trackingUrl} class="input flex-1 text-xs bg-white" on:focus={(e) => e.currentTarget.select()} aria-label={$t("The visitor's tracking link")} />
          <button type="button" class="btn-secondary !px-3" on:click={copyLink}><Copy size={16} /> <span class="sr-only">{$t('Copy link')}</span></button>
        </div>
        {#if copied}<p class="mt-2 text-xs text-emerald-700">{$t('Link copied')}</p>{/if}
      </div>

      <div class="mt-6 grid sm:grid-cols-2 gap-3">
        <button type="button" class="btn-primary justify-center" on:click={sameVisitor}><Plus size={18} /> {$t('Another item for {name}', { name: visitor.customerName })}</button>
        <button type="button" class="btn-secondary justify-center" on:click={newVisitor}><UserPlus size={18} /> {$t('An item for someone else')}</button>
      </div>
      <div class="mt-4 flex flex-wrap justify-center gap-4 text-sm">
        {#if done.taken}<a href={`/repairer/pre-registered/${done.id}`} class="text-slate-600 underline underline-offset-2 inline-flex items-center gap-1">{$t('Open the item')} <ChevronRight size={14} /></a>{/if}
        <a href="/repairer/pre-registered" class="text-slate-600 underline underline-offset-2">{$t('Back to pre-registered items')}</a>
      </div>
    </div>
  {:else}
    <header class="mt-4">
      <h1 class="text-2xl font-bold flex items-center gap-2"><CalendarPlus size={22} /> {$t('Add an item for a visitor')}</h1>
      <p class="mt-1 text-slate-600">{$t('For a visitor who phones, emails or asks in person. Their item goes on the list for the session, just as if they had filled in the form themselves.')}</p>
    </header>

    <form class="card p-6 mt-4 space-y-6" on:submit|preventDefault={submit}>
      <div>
        <label class="label" for="session">{$t('Session')}</label>
        {#if visitor}
          <p id="session" class="text-slate-800">{session ? sessionLabel(session) : ''}</p>
        {:else}
          <select id="session" class="input" bind:value={eventId}>
            {#each sessions as s (s.id)}
              <option value={s.id}>{sessionLabel(s)}</option>
            {/each}
          </select>
        {/if}
      </div>

      {#if visitor}
        <p class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-sm text-slate-700">
          {$t("Adding to {name}'s items for this session.", { name: visitor.customerName })}
          <button type="button" class="underline text-slate-500" on:click={newVisitor}>{$t('Someone else')}</button>
        </p>
      {:else}
        <fieldset class="space-y-4">
          <legend class="text-sm font-semibold text-slate-700">{$t('About the visitor')}</legend>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label class="label" for="cn">{$t('First name')}</label>
              <input id="cn" class="input" maxlength="50" autocomplete="off" bind:value={customerName} />
            </div>
            {#if askContact}
              <div>
                <label class="label" for="cc">{$t('Phone or email')} <span class="font-normal text-slate-400">{$t('(optional)')}</span></label>
                <input id="cc" class="input" maxlength="100" autocomplete="off" bind:value={customerContact} />
              </div>
            {/if}
          </div>
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" class="h-5 w-5 rounded border-slate-300 text-brand-600 mt-0.5" bind:checked={consent} />
            <span class="text-sm text-slate-700">{$t("I've asked, and the visitor is happy for their details to be stored for this repair.")}</span>
          </label>
        </fieldset>
      {/if}

      <fieldset class="space-y-4 border-t border-slate-200 pt-5">
        <legend class="text-sm font-semibold text-slate-700">{$t('About the item')}</legend>
        {#if categories.length}
          <div>
            <p class="label">{$t('What type of item is it?')} <span class="font-normal text-slate-400">{$t('(optional)')}</span></p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
              {#each categories as cat}
                <button
                  type="button"
                  class="card p-3 text-center transition-shadow {itemCategoryId === cat.id ? 'ring-2 ring-brand-600 bg-brand-50' : 'hover:ring-brand-400'}"
                  aria-pressed={itemCategoryId === cat.id}
                  on:click={() => (itemCategoryId = itemCategoryId === cat.id ? null : cat.id)}
                >
                  <span class="icon-chip" style="background-color: {cat.colour}">
                    <Icon icon={categoryIcon(cat.icon, cat.name)} width="24" height="24" />
                  </span>
                  <span class="block mt-1.5 font-medium text-sm">{$t(cat.name)}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
        <div>
          <label class="label" for="item">{$t('Item description')}</label>
          <input id="item" class="input" maxlength="200" placeholder={$t('For example: table lamp, blue')} bind:value={itemDescription} />
        </div>
        <div>
          <label class="label" for="brand">{$t('Brand and model')} <span class="font-normal text-slate-400">{$t('(optional)')}</span></label>
          <input id="brand" class="input" maxlength="100" placeholder={$t('For example: Roberts R250')} bind:value={itemBrand} />
        </div>
        <div>
          <label class="label" for="fault">{$t("What's wrong with it?")}</label>
          <textarea id="fault" class="input" rows="3" maxlength="500" placeholder={$t('For example: it will not turn on')} bind:value={faultDescription}></textarea>
        </div>
      </fieldset>

      <label class="flex items-start gap-3 cursor-pointer border-t border-slate-200 pt-5">
        <input type="checkbox" class="h-5 w-5 rounded border-slate-300 text-brand-600 mt-0.5" bind:checked={take} />
        <span class="text-sm">
          <span class="font-medium text-slate-900">{$t('I will look into this item')}</span>
          <span class="block text-slate-500">{$t('The item is taken by you, so other repairers know you are preparing for it.')}</span>
        </span>
      </label>

      {#if error}<p class="text-sm text-rose-700">{error}</p>{/if}

      <div class="flex justify-end gap-3">
        <a href="/repairer/pre-registered" class="btn-ghost">{$t('Cancel')}</a>
        <button type="submit" class="btn-primary" disabled={busy}>{busy ? $t('Saving…') : $t('Add the item')}</button>
      </div>
    </form>
  {/if}
</div>
