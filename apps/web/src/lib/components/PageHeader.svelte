<script lang="ts">
  // The tinted band at the top of an inner public page. The home page opens
  // with a photo hero instead; every other page opens with this, so the site
  // has one way of starting a page.
  export let eyebrow: string | null = null;
  export let title: string;
  export let lede: string | null = null;
</script>

<section class="band">
  <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 text-center">
    {#if $$slots.icon}
      <span class="icon-chip"><slot name="icon" /></span>
    {/if}
    {#if eyebrow}<p class="mt-5 eyebrow">{eyebrow}</p>{/if}
    <h1 class="mt-2 text-pine">{title}</h1>
    {#if lede}<p class="mt-4 text-lg text-slate-600 max-w-xl mx-auto">{lede}</p>{/if}
    <slot />
  </div>
</section>
