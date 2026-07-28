<script lang="ts">
  import { cafe } from '$lib/stores/cafe';
  import { Mail, MapPin, Heart } from 'lucide-svelte';

  // Social links are stored as { platform: url }. Capitalise the key for the
  // link text so "facebook" reads as "Facebook".
  function label(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  $: socials = Object.entries($cafe?.socialLinks ?? {}).filter(([, v]) => Boolean(v));
</script>

<!-- A solid dark block closes the page. Without it the page trails off into
     white and never feels finished. -->
<footer class="bg-brand-900 text-white no-print">
  <div class="max-w-6xl mx-auto px-4 py-14">
    <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <p class="font-display text-xl font-semibold">{$cafe?.name ?? ''}</p>
        {#if $cafe?.tagline}<p class="mt-2 text-white/70">{$cafe.tagline}</p>{/if}
        {#if $cafe?.donateUrl}
          <a
            href={$cafe.donateUrl}
            target="_blank"
            rel="noopener"
            class="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 ring-1 ring-white/20 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/20"
          >
            <Heart size={16} /> Support us
          </a>
        {/if}
      </div>

      <div>
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Visit</p>
        <ul class="mt-4 space-y-2 text-white/80">
          <li><a class="hover:text-white" href="/events">Events</a></li>
          <li><a class="hover:text-white" href="/skills">Skills &amp; team</a></li>
          <li><a class="hover:text-white" href="/guides">Repair guides</a></li>
          <li><a class="hover:text-white" href="/world">Repair Cafés worldwide</a></li>
          <li><a class="hover:text-white" href="/about">About &amp; how we measure</a></li>
          <li><a class="hover:text-white" href="/contact">Contact</a></li>
        </ul>
      </div>

      <div>
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Get in touch</p>
        <ul class="mt-4 space-y-2 text-white/80">
          {#if $cafe?.contactEmail}
            <li>
              <a class="inline-flex items-start gap-2 hover:text-white" href="mailto:{$cafe.contactEmail}">
                <Mail size={16} class="shrink-0 mt-0.5" /> <span class="break-all">{$cafe.contactEmail}</span>
              </a>
            </li>
          {/if}
          {#if $cafe?.address}
            <li class="inline-flex items-start gap-2">
              <MapPin size={16} class="shrink-0 mt-0.5" /> <span>{$cafe.address}</span>
            </li>
          {/if}
          {#if socials.length > 0}
            <li class="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              {#each socials as [k, v]}
                <a class="hover:text-white underline underline-offset-2" href={v} target="_blank" rel="noopener">{label(k)}</a>
              {/each}
            </li>
          {/if}
          {#if !$cafe?.contactEmail && !$cafe?.address && socials.length === 0}
            <li><a class="hover:text-white underline underline-offset-2" href="/contact">Send us a message</a></li>
          {/if}
        </ul>
      </div>
    </div>

    <!-- Attribution: equal-sized icons + text, lined up on one baseline -->
    <div class="mt-12 pt-6 border-t border-white/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-white/50">
      <a
        href="https://circularity.org/repair-cafe"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-2 hover:text-white/80"
      >
        <span>Powered by Repair Cafe Hub</span>
      </a>
      <a
        href="https://github.com/Zesty0wl/circularity-repair-cafe-hub"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-2 hover:text-white/80"
        aria-label="Repair Café Hub, open source on GitHub"
      >
        <svg viewBox="0 0 98 96" class="h-5 w-5 shrink-0" aria-hidden="true" focusable="false">
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
            fill="currentColor"
          />
        </svg>
        <span>Repair Café Hub on GitHub</span>
      </a>
    </div>
  </div>
</footer>
