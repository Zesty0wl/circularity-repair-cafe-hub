<script lang="ts">
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import ShareProfile from '$lib/components/ShareProfile.svelte';
  import Icon from '@iconify/svelte';
  import { categoryIcon } from '$lib/categoryIcon';
  import { ArrowLeft, ArrowRight, Wrench, Calendar, MapPin } from 'lucide-svelte';
  import type { PageData } from './$types';

  interface Skill { id: string; name: string; colour: string; icon: string }
  interface Repairer {
    id: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    joinDate: string | null;
    repairCount: number;
    skills: Skill[];
  }
  interface NextEvent {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: { name: string; postcode: string | null };
  }

  export let data: PageData;
  $: repairer = (data.repairer ?? null) as Repairer | null;
  $: nextEvent = (data.nextEvent ?? null) as NextEvent | null;
  $: notFound = data.notFound;
  const loading = false;

  function dateParts(d: string) {
    const dt = new Date(`${d}T12:00:00Z`);
    return {
      monthShort: dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      day: dt.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' }),
      full: dt.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
      }),
    };
  }

  function joinedDisplay(d: string | null): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  function initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!)
      .join('')
      .toUpperCase();
  }
</script>

<SiteHeader variant="public" />

<main class="max-w-3xl mx-auto px-4 py-8 md:py-12 space-y-6">
  <a href="/skills" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
    <ArrowLeft size={16} /> Back to the team
  </a>

  {#if loading}
    <div class="card p-8 text-center text-slate-500">Loading…</div>
  {:else if notFound || !repairer}
    <div class="card p-8 text-center">
      <h1 class="text-2xl font-semibold">Volunteer not found</h1>
      <p class="mt-2 text-slate-600">This volunteer may have left the team or hidden their profile.</p>
      <a href="/skills" class="btn-primary mt-4 inline-flex">See our team</a>
    </div>
  {:else}
    <!-- Hero -->
    <header class="card p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
      {#if repairer.avatarUrl}
        <img
          src={repairer.avatarUrl}
          alt={repairer.displayName}
          class="h-32 w-32 sm:h-36 sm:w-36 rounded-2xl object-cover ring-1 ring-slate-200 shrink-0"
        />
      {:else}
        <div
          class="h-32 w-32 sm:h-36 sm:w-36 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center text-4xl font-bold shrink-0"
        >
          {initials(repairer.displayName)}
        </div>
      {/if}
      <div class="min-w-0 flex-1">
        <p class="eyebrow">Volunteer repairer</p>
        <h1 class="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">{repairer.displayName}</h1>
        <div class="mt-3 flex flex-wrap justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-slate-600">
          {#if repairer.joinDate}
            <span class="inline-flex items-center gap-1.5"><Calendar size={14} /> Joined {joinedDisplay(repairer.joinDate)}</span>
          {/if}
          {#if repairer.repairCount > 0}
            <span class="inline-flex items-center gap-1.5">
              <Wrench size={14} /> {repairer.repairCount} repair{repairer.repairCount === 1 ? '' : 's'} logged
            </span>
          {/if}
        </div>
        <div class="mt-4 flex justify-center sm:justify-start">
          <ShareProfile repairerId={repairer.id} displayName={repairer.displayName} mode="public" />
        </div>
      </div>
    </header>

    <!-- Next session. People often arrive here from a shared card inviting
         them to it, so the whole card clicks through to the event page with
         the venue, directions and everything else they need. -->
    {#if nextEvent}
      {@const p = dateParts(nextEvent.date)}
      <a
        href="/events/{nextEvent.id}"
        class="card-link p-5 sm:p-6 flex items-center gap-5"
        aria-label={`Next session, ${p.full}, view details and directions`}
      >
        <div class="shrink-0 w-16 overflow-hidden rounded-xl bg-brand-600 text-white text-center">
          <div class="bg-black/15 text-[11px] font-bold uppercase tracking-wider py-1">{p.monthShort}</div>
          <div class="text-2xl font-bold font-display leading-none py-2">{p.day}</div>
        </div>
        <div class="min-w-0 flex-1">
          <p class="kicker">Next session</p>
          <p class="mt-1 text-lg font-semibold text-pine">
            {p.full}, {nextEvent.startTime.slice(0, 5)}–{nextEvent.endTime.slice(0, 5)}
          </p>
          <p class="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin size={14} class="shrink-0" />
            <span class="truncate">{nextEvent.venue.name}{#if nextEvent.venue.postcode}, {nextEvent.venue.postcode}{/if}</span>
          </p>
          <p class="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
            See details and directions <ArrowRight size={14} />
          </p>
        </div>
      </a>
    {/if}

    <!-- Bio -->
    {#if repairer.bio}
      <section class="card p-6 sm:p-8">
        <h2 class="kicker">About</h2>
        <p class="mt-3 text-lg leading-relaxed text-slate-700 whitespace-pre-line">{repairer.bio}</p>
      </section>
    {/if}

    <!-- Skills -->
    {#if repairer.skills.length > 0}
      <section class="card p-6 sm:p-8">
        <h2 class="kicker">Specialises in</h2>
        <div class="mt-4 flex flex-wrap gap-3">
          {#each repairer.skills as s}
            <span
              class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white"
              style="background-color: {s.colour}"
            >
              <Icon icon={categoryIcon(s.icon, s.name)} width="16" height="16" />
              {s.name}
            </span>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</main>

<SiteFooter />
