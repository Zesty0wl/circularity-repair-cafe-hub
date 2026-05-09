<script lang="ts">
  import { cafe } from '$lib/stores/cafe';
</script>

<footer class="border-t border-slate-200 mt-16 py-10 bg-white no-print">
  <div class="max-w-6xl mx-auto px-4 grid sm:grid-cols-2 gap-6 text-sm text-slate-600">
    <div>
      <p class="font-semibold text-slate-900">{$cafe?.name ?? ''}</p>
      {#if $cafe?.tagline}<p class="mt-1">{$cafe.tagline}</p>{/if}
      {#if $cafe?.contactEmail}
        <p class="mt-2"><a class="text-brand-700 hover:underline" href="mailto:{$cafe.contactEmail}">{$cafe.contactEmail}</a></p>
      {/if}
    </div>
    <div class="sm:text-right">
      {#if $cafe?.socialLinks}
        <div class="space-x-3">
          {#each Object.entries($cafe.socialLinks) as [k, v]}
            {#if v}
              <a class="text-brand-700 hover:underline" href={v} target="_blank" rel="noopener">{k}</a>
            {/if}
          {/each}
        </div>
      {/if}
      <p class="mt-3 text-xs text-slate-500">Powered by Circularity Repair Cafe Hub</p>
    </div>
  </div>
</footer>
