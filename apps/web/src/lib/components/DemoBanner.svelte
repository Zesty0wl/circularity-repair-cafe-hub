<script lang="ts">
  // Shown on every page of a public try-it-out site. Two jobs: say the cafe is
  // not real, so nobody turns up at the address expecting a repair, and warn
  // people off typing anything about themselves into a site whose password is
  // published in a README.
  //
  // Takes the flag as a prop rather than reading the store, so it is the same
  // value the page was rendered with on the server.
  export let show: boolean = false;
</script>

{#if show}
  <div
    class="bg-amber-100 text-amber-950 border-b border-amber-300 px-4 py-2 text-center text-sm"
    role="status"
  >
    <strong class="font-semibold">This is a demo.</strong>
    Every cafe, repair and volunteer here is made up, and the whole site is wiped and
    rebuilt every hour. Please do not enter real names, emails or phone numbers.
    <a
      class="underline underline-offset-2 hover:no-underline"
      href="https://github.com/Zesty0wl/circularity-repair-cafe-hub"
      target="_blank"
      rel="noopener">Run your own copy</a
    >.
  </div>
{/if}
