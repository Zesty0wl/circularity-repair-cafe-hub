<script lang="ts">
  /**
   * The one place the telemetry question is worded.
   *
   * Used by the setup wizard and by the gentle reminder on the dashboard, so
   * the two can never drift apart and say different things about what leaves
   * the building.
   */
  import { ChevronDown, ChevronUp, HeartHandshake } from 'lucide-svelte';

  /** 'none', 'standard' or 'community'. Bind it. */
  export let level: 'none' | 'standard' | 'community' = 'standard';
  /** The real payload, when we have data to show. Null shows an example. */
  export let payload: unknown = null;
  export let cafeName = 'Your Repair Café';
  /** Compact wording for the dashboard card. */
  export let compact = false;

  let showPayload = false;

  // Community is Standard plus being findable, so it cannot be on by itself.
  // Ticking it turns both on, unticking Standard turns both off.
  $: standardOn = level !== 'none';
  $: communityOn = level === 'community';

  function setStandard(on: boolean) {
    level = on ? (communityOn ? 'community' : 'standard') : 'none';
  }
  function setCommunity(on: boolean) {
    level = on ? 'community' : standardOn ? 'standard' : 'none';
  }

  // What a fresh install would send. Shown before there is any real data,
  // so an admin can still see the shape of it rather than take our word.
  $: example = {
    schemaVersion: 1,
    level: level === 'none' ? 'standard' : level,
    installId: '3f2b8c14-…',
    sentAt: '2026-07-27T18:04:11Z',
    app: { version: '1.0.0' },
    howManySessions: 0,
    howManyVenues: 1,
    howManyVolunteers: 1,
    repairsRecorded: 0,
    repairsFixed: 0,
    co2: { enabled: true, savedKg: 0, fromThisManyRepairs: 0, displacementRate: 0.5 },
    kindsOfThing: [],
    featuresInUse: { galleryPhotos: 0, eventPhotos: 0, showsStats: false },
    cafe: level === 'community' ? { name: cafeName, publicUrl: '…', repaircafeSlug: null } : null,
  };
  $: shown = payload ?? example;
</script>

<div class="space-y-4">
  {#if !compact}
    <div class="flex items-start gap-3">
      <span class="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <HeartHandshake size={20} />
      </span>
      <div>
        <h2 class="text-lg font-semibold text-slate-900">Help us count what repair cafes achieve</h2>
        <p class="mt-1 text-sm text-slate-600">
          This project is free, and we have no idea how many cafes use it or how much they have kept
          out of landfill between them. If you are happy to, your hub can send us a short summary
          once a day. It lets us show what community repair adds up to, and tells us what to work on
          next.
        </p>
      </div>
    </div>
  {/if}

  <label class="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
    <input
      type="checkbox"
      class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      checked={standardOn}
      on:change={(e) => setStandard(e.currentTarget.checked)}
    />
    <span class="text-sm">
      <span class="font-semibold text-slate-900">Share our numbers</span>
      <span class="block mt-0.5 text-slate-600">
        How many repairs we have done, how many sessions we have held, and which version we run.
        No names, no text anyone has typed, and nothing at all about our visitors or volunteers.
      </span>
    </span>
  </label>

  <label
    class="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50
      {standardOn ? '' : 'opacity-50'}"
  >
    <input
      type="checkbox"
      class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      checked={communityOn}
      disabled={!standardOn}
      on:change={(e) => setCommunity(e.currentTarget.checked)}
    />
    <span class="text-sm">
      <span class="font-semibold text-slate-900">Show us on the community map</span>
      <span class="block mt-0.5 text-slate-600">
        Also share our cafe's name and web address, so we appear on the public map of repair cafes
        with our numbers beside us. It helps people find us.
      </span>
    </span>
  </label>

  <div>
    <button
      type="button"
      class="inline-flex items-center gap-1 text-sm text-brand-700 hover:text-brand-800 underline underline-offset-2"
      on:click={() => (showPayload = !showPayload)}
      aria-expanded={showPayload}
    >
      {#if showPayload}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
      See exactly what would be sent
    </button>
    {#if showPayload}
      <pre class="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100 leading-relaxed">{JSON.stringify(shown, null, 2)}</pre>
      {#if !payload}
        <p class="mt-1 text-xs text-slate-500">
          An example, because this cafe has no numbers yet. The real thing is the same shape.
        </p>
      {/if}
    {/if}
  </div>

  <p class="text-xs text-slate-500">
    You can change this at any time under Settings, and ask us to delete everything we hold about
    you. Nothing is sent until you say yes.
  </p>
</div>
