<script lang="ts">
  // The one heading pattern used by every section of the public site:
  // an optional small label, the title, then an optional line of support
  // text. Using it everywhere is what makes the page feel like one page.
  export let eyebrow: string | null = null;
  export let title: string;
  export let lede: string | null = null;
  export let align: 'center' | 'left' = 'center';
  // Set on dark backgrounds (the hero and the closing band).
  export let tone: 'default' | 'inverse' = 'default';
</script>

<div class={align === 'center' ? 'max-w-2xl mx-auto text-center' : 'max-w-2xl'}>
  {#if eyebrow}
    <p class="eyebrow" class:text-white={tone === 'inverse'} class:opacity-80={tone === 'inverse'}>{eyebrow}</p>
  {/if}
  <h2 class="section-title" class:mt-3={eyebrow} class:!text-white={tone === 'inverse'}>{title}</h2>
  {#if lede}
    <p class="section-lede" class:!text-white={tone === 'inverse'} class:opacity-85={tone === 'inverse'}>{lede}</p>
  {/if}
  <slot />
</div>
