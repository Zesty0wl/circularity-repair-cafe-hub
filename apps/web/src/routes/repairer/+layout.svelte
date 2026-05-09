<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import SiteHeader from '$lib/components/SiteHeader.svelte';

  onMount(() => {
    if (!$auth) {
      goto('/login');
    }
  });
</script>

{#if $auth}
  <SiteHeader variant="repairer" user={$auth.user} />
  <main class="max-w-5xl mx-auto px-4 py-6">
    <slot />
  </main>
{/if}
