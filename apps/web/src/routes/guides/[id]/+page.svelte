<script lang="ts">
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import { ArrowLeft, Clock, Gauge, ExternalLink, Wrench, Package } from 'lucide-svelte';
  import { bulletTone, difficultyTone, type GuideDetail } from '$lib/guides';
  import type { PageData } from './$types';

  export let data: PageData;
  $: guide = data.guide as GuideDetail;
</script>

<SiteHeader variant="public" />

<article class="max-w-3xl mx-auto px-4 py-10 md:py-14">
  <a href="/guides" class="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-pine">
    <ArrowLeft size={16} /> All repair guides
  </a>

  <header class="mt-6">
    {#if guide.category}
      <p class="eyebrow">{guide.category}</p>
    {/if}
    <h1 class="mt-2 text-pine">{guide.title}</h1>

    <div class="mt-4 flex flex-wrap items-center gap-2 text-xs">
      {#if guide.difficulty}
        <span class="chip ring-1 {difficultyTone(guide.difficulty)}">
          <Gauge size={13} /> {guide.difficulty}
        </span>
      {/if}
      {#if guide.timeRequired}
        <span class="chip ring-1 bg-slate-100 text-slate-700 ring-slate-200">
          <Clock size={13} /> {guide.timeRequired}
        </span>
      {/if}
      <span class="chip ring-1 bg-slate-100 text-slate-700 ring-slate-200">
        {guide.steps.length} step{guide.steps.length === 1 ? '' : 's'}
      </span>
    </div>

    {#if guide.image}
      <img
        class="mt-6 w-full rounded-2xl bg-slate-100 object-cover"
        src={guide.image}
        alt=""
        loading="lazy"
      />
    {/if}

    {#if guide.introduction}
      <p class="mt-6 text-lg text-slate-700">{guide.introduction}</p>
    {/if}
  </header>

  <!-- ── What you need ──────────────────────────────────────────────────── -->
  {#if guide.tools.length > 0 || guide.parts.length > 0}
    <div class="mt-8 grid gap-4 sm:grid-cols-2">
      {#if guide.tools.length > 0}
        <div class="card p-5">
          <p class="flex items-center gap-2 font-semibold text-pine">
            <Wrench size={16} /> Tools
          </p>
          <ul class="mt-3 space-y-1 text-sm text-slate-700">
            {#each guide.tools as tool}<li>{tool}</li>{/each}
          </ul>
        </div>
      {/if}
      {#if guide.parts.length > 0}
        <div class="card p-5">
          <p class="flex items-center gap-2 font-semibold text-pine">
            <Package size={16} /> Parts
          </p>
          <ul class="mt-3 space-y-1 text-sm text-slate-700">
            {#each guide.parts as part}<li>{part}</li>{/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}

  <!-- ── Steps ──────────────────────────────────────────────────────────── -->
  {#if guide.steps.length > 0}
    <ol class="mt-10 space-y-10">
      {#each guide.steps as step, i}
        <li>
          <div class="flex items-baseline gap-3">
            <span class="step-number">{i + 1}</span>
            <h2 class="text-xl font-display font-semibold text-pine">
              {step.title || `Step ${i + 1}`}
            </h2>
          </div>

          {#if step.images.length > 0}
            <div
              class="mt-4 grid gap-3"
              class:sm:grid-cols-2={step.images.length > 1}
              class:sm:grid-cols-3={step.images.length > 2}
            >
              {#each step.images as image}
                <img
                  class="w-full rounded-xl bg-slate-100 object-cover"
                  src={image}
                  alt=""
                  loading="lazy"
                />
              {/each}
            </div>
          {/if}

          {#if step.lines.length > 0}
            <ul class="mt-4 space-y-2">
              {#each step.lines as line}
                <li class="step-line {bulletTone(line.bullet)}">{line.text}</li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="mt-10 text-slate-600">
      This guide's steps are not available here. You can read the whole thing on iFixit.
    </p>
  {/if}

  {#if guide.conclusion}
    <div class="mt-10 card p-5">
      <p class="eyebrow">To put it back together</p>
      <p class="mt-2 text-slate-700">{guide.conclusion}</p>
    </div>
  {/if}

  <!-- ── Credit ─────────────────────────────────────────────────────────── -->
  <footer class="mt-12 border-t border-slate-200 pt-6">
    <a class="btn-primary" href={guide.url} target="_blank" rel="noopener">
      Open on iFixit <ExternalLink size={16} />
    </a>
    <p class="mt-4 text-sm text-slate-500">
      Written by the iFixit community and shared under a
      <a
        class="underline underline-offset-2 hover:text-slate-700"
        href="https://creativecommons.org/licenses/by-nc-sa/3.0/"
        target="_blank"
        rel="noopener"
      >Creative Commons BY-NC-SA licence</a>. Follow it at your own risk, and please
      unplug anything electrical before you open it.
    </p>
  </footer>
</article>

<SiteFooter />

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.6rem;
    border-radius: 9999px;
    font-weight: 600;
  }

  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    border-radius: 9999px;
    background: rgb(var(--brand-600));
    color: #fff;
    font-weight: 700;
    font-size: 0.9rem;
  }

  /* iFixit colours its instructions, and the warm colours mean "take care".
     Keeping the colour keeps that meaning. */
  .step-line {
    border-left-width: 3px;
    padding: 0.35rem 0 0.35rem 0.75rem;
    border-radius: 0 0.4rem 0.4rem 0;
    color: rgb(51 65 85);
    line-height: 1.6;
  }
</style>
