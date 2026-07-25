<script lang="ts">
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import VolunteerCard from '$lib/components/VolunteerCard.svelte';
  import NextSessionCta from '$lib/components/NextSessionCta.svelte';
  import Icon from '@iconify/svelte';
  import { Wrench } from 'lucide-svelte';
  import { categoryIcon, categoryTint, categoryInk } from '$lib/categoryIcon';
  import type { PageData } from './$types';

  interface SkillCategory { id: string; name: string; icon: string; colour: string; repairerCount: number }
  interface Repairer { id: string; displayName: string; avatarUrl: string | null; bio: string | null; skills: string[]; joinDate: string | null }
  interface PublicEvent { id: string; name: string; date: string; startTime: string; endTime: string; venue: { name: string; postcode: string | null } }

  let categories: SkillCategory[] = [];
  let repairers: Repairer[] = [];

  export let data: PageData;
  $: categories = (data.categories ?? []) as SkillCategory[];
  $: repairers = (data.repairers ?? []) as Repairer[];
  $: nextEvent = ((data.upcoming ?? []) as PublicEvent[])[0] ?? null;

  $: gallery = $cafe?.gallery ?? [];
  $: ctaImage = gallery.length > 0 ? gallery[gallery.length - 1]!.url : null;
</script>

<SiteHeader variant="public" />

<main>
  <PageHeader
    eyebrow="Skills &amp; team"
    title="What we repair"
    lede="Meet our volunteers and see the kinds of items they can help you fix."
  >
    <Wrench size={22} slot="icon" />
  </PageHeader>

  <!-- ─────────────────────── Categories ─────────────────────── -->
  {#if categories.length > 0}
    <section class="section">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {#each categories as cat}
          <div class="card p-5 text-center">
            <!-- One lightness for every tile: the category colour as a soft
                 wash, with a darkened version of the same colour as the
                 glyph so it stays readable. -->
            <div class="icon-tile mx-auto" style={`background-color: ${categoryTint(cat.colour)}; color: ${categoryInk(cat.colour)}`}>
              <Icon icon={categoryIcon(cat.icon, cat.name)} width="24" height="24" />
            </div>
            <p class="mt-3 font-medium text-pine">{cat.name}</p>
            <p class="text-xs text-slate-500">{cat.repairerCount} volunteer{cat.repairerCount === 1 ? '' : 's'}</p>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ─────────────────────── Volunteers ─────────────────────── -->
  <section class="band">
    <div class="section">
      <SectionHeading
        eyebrow="The people who fix things"
        title="Our volunteers"
        lede="Our repairers are volunteers. They give their time, their tools and their know-how."
      />
      {#if repairers.length === 0}
        <p class="mt-8 text-center text-slate-500">Our team will appear here once volunteers join.</p>
      {:else}
        <div class="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each repairers as r}
            <VolunteerCard volunteer={r} />
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <NextSessionCta
    event={nextEvent}
    venue={nextEvent?.venue ?? null}
    image={ctaImage}
    heading="Want to join us?"
    body="We always welcome new repairers, and you do not need to be an expert. Come to a session and say hello."
  />
</main>

<SiteFooter />
