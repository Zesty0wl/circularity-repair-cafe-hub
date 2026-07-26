<script lang="ts">
  import { cafe } from '$lib/stores/cafe';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import { Info, ExternalLink, Leaf } from 'lucide-svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  interface Factor {
    id: string;
    label: string;
    category: string;
    co2eKg: number | null;
    weightKg: number | null;
    sample: number;
  }
  interface Co2Data {
    enabled: boolean;
    displacementRate: number;
    factors: Factor[];
    source: { name: string; url: string; licence: string };
  }

  $: co2 = (data.co2 ?? null) as Co2Data | null;
  $: stats = data.stats as
    | { co2SavedKg: number; completedCount: number; co2CountedRepairs: number }
    | null;
  $: cafeName = $cafe?.name || 'our Repair Café';

  /** A handful of everyday things, to show the sum rather than describe it. */
  const SHOWN = ['Kettle', 'Toaster', 'Laptop medium', 'Mobile', 'Vacuum', 'Clothing/textile'];
  $: examples = (co2?.factors ?? [])
    .filter((f) => SHOWN.includes(f.label) && f.co2eKg !== null)
    .sort((a, b) => (b.co2eKg ?? 0) - (a.co2eKg ?? 0));

  /** What share of finished repairs the published total actually covers. */
  $: coverage =
    stats && stats.completedCount > 0
      ? Math.round((stats.co2CountedRepairs / stats.completedCount) * 100)
      : null;

  const round = (n: number) => Math.round(n * 10) / 10;
</script>

<SiteHeader variant="public" />

<PageHeader
  eyebrow="About"
  title="How this works"
  lede="A few notes on how {cafeName} runs, and on where the numbers we publish come from."
>
  <span slot="icon"><Info size={22} /></span>
</PageHeader>

<!-- ── How the carbon figure is worked out ───────────────────────────────── -->
<section id="carbon" class="max-w-3xl mx-auto px-4 py-14 md:py-16 scroll-mt-24">
  <SectionHeading eyebrow="Our numbers" title="How we work out the carbon saved" align="left" />

  <div class="mt-7 space-y-5 text-lg text-slate-700">
    <p>
      Most of the carbon cost of an everyday object is spent before you ever switch it
      on. Mining the metals, making the parts, putting it together and shipping it
      across the world all happen first. Keeping a thing working means nobody has to
      make a new one yet, and that is where a repair does its good.
    </p>
    <p>
      So when you check something in, we ask what kind of thing it is. We look up what
      it costs the planet to make one, then take half of that. We do not ask our
      volunteers to guess a number.
    </p>
  </div>

  {#if co2?.enabled}
    <!-- The sum, written out. -->
    <div class="mt-8 card p-6">
      <p class="eyebrow">The sum</p>
      <p class="mt-3 font-mono text-sm sm:text-base text-pine leading-relaxed">
        carbon saved = carbon to make one &times; {co2.displacementRate}
      </p>
      <p class="mt-4 text-slate-700">
        That last number matters. A repair does not save the whole cost of a new item.
        We assume a repaired thing lasts about half as long again as it would have, so
        one repair prevents about half a new purchase. It is a careful way to count,
        and it is the same one used across the wider repair movement.
      </p>
    </div>

    {#if examples.length > 0}
      <div class="mt-8">
        <p class="eyebrow">Some everyday examples</p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-slate-500">
                <th class="py-2 pr-4 font-medium">Thing</th>
                <th class="py-2 pr-4 font-medium">Carbon to make one</th>
                <th class="py-2 font-medium">Saved by fixing it</th>
              </tr>
            </thead>
            <tbody>
              {#each examples as item}
                <tr class="border-b border-slate-100">
                  <td class="py-2.5 pr-4 text-slate-800">{item.label}</td>
                  <td class="py-2.5 pr-4 text-slate-600">{round(item.co2eKg ?? 0)} kg</td>
                  <td class="py-2.5 font-semibold text-pine">
                    {round((item.co2eKg ?? 0) * co2.displacementRate)} kg
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-sm text-slate-500">
          Measured in kg of CO₂e, which counts all greenhouse gases together as if they
          were carbon dioxide.
        </p>
      </div>
    {/if}

    <!-- Being straight about what the number is and is not. -->
    <div class="mt-8 band rounded-2xl p-6">
      <p class="flex items-center gap-2 font-semibold text-pine">
        <Leaf size={18} /> What this figure is, and what it is not
      </p>
      <ul class="mt-4 space-y-3 text-slate-700">
        <li>
          <strong>It is an estimate.</strong> It uses an average for each kind of thing,
          not the actual object on the table. Your kettle is not the average kettle.
        </li>
        <li>
          <strong>It only counts repairs that worked.</strong> If we cannot fix
          something, it counts for nothing, even though we tried.
        </li>
        {#if coverage !== null && coverage < 100}
          <li>
            <strong>It does not cover every repair.</strong> We have a figure for about
            {coverage}% of the repairs we have finished. The rest were things we had no
            reference for, so they are left out rather than guessed at.
          </li>
        {/if}
        <li>
          <strong>It assumes a repair prevents a purchase.</strong> Somebody who would
          have thrown a thing away and not replaced it saves nothing by our sum, and we
          have no way of knowing which is which.
        </li>
      </ul>
      <p class="mt-4 text-slate-700">
        We would rather publish a number we can explain than a bigger one we cannot.
      </p>
    </div>

    {#if co2.source}
      <p class="mt-6 text-sm text-slate-500">
        The figures come from
        <a
          class="underline underline-offset-2 hover:text-slate-700"
          href={co2.source.url}
          target="_blank"
          rel="noopener"
        >{co2.source.name}</a>, shared under a {co2.source.licence} licence. It covers
        {co2.factors.length} kinds of thing, gathered from real products at community
        repair events. Some rest on only a handful of measurements.
      </p>
    {/if}
  {:else}
    <p class="mt-6 text-slate-600">
      We do not publish a carbon figure at the moment.
    </p>
  {/if}
</section>

<!-- ── Where the rest of our numbers come from ───────────────────────────── -->
<section class="band">
  <div class="max-w-3xl mx-auto px-4 py-14">
    <SectionHeading eyebrow="Our numbers" title="Everything else we count" align="left" />
    <div class="mt-7 space-y-4 text-slate-700">
      <p>
        <strong>Repairs done</strong> counts items that went home working. An item we
        could not fix is not counted, and neither is one still waiting for a part.
      </p>
      <p>
        <strong>Success rate</strong> is out of the repairs we finished one way or the
        other. Items still open are left out, because counting them would make us look
        worse than we are while we are still working.
      </p>
      <p>
        <strong>Volunteers</strong> counts the people on our team, not visits. Somebody
        who comes to every session counts once.
      </p>
      <p>
        <strong>Sessions held</strong> counts sessions that actually happened, not ones
        we had in the diary.
      </p>
    </div>
  </div>
</section>

<!-- ── About the software ────────────────────────────────────────────────── -->
<section class="max-w-3xl mx-auto px-4 py-14">
  <SectionHeading eyebrow="Behind the scenes" title="The software we run on" align="left" />
  <div class="mt-7 space-y-4 text-slate-700">
    <p>
      This site runs on Repair Café Hub, free and open source software made for
      grass-roots repair groups. Anyone can read the code, check our sums, or run it
      for their own cafe.
    </p>
    <a
      class="btn-secondary mt-2"
      href="https://github.com/Zesty0wl/circularity-repair-cafe-hub"
      target="_blank"
      rel="noopener"
    >
      See the code <ExternalLink size={16} />
    </a>
  </div>
</section>

<SiteFooter />
