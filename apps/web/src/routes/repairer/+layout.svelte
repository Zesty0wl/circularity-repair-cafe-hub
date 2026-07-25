<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { restoreSession } from '$lib/api';
  import SiteHeader from '$lib/components/SiteHeader.svelte';

  onMount(async () => {
    // Wait for the session restore before deciding the user is signed out,
    // otherwise every page refresh bounces signed-in users to /login.
    await restoreSession();
    if (!$auth) {
      goto('/login');
    }
  });
</script>

{#if $auth}
  <SiteHeader variant="repairer" user={$auth.user} />
  <!-- Same max width as the header, so page content lines up with the logo. -->
  <main class="max-w-6xl mx-auto px-4 py-6 md:py-8">
    <slot />
  </main>
{/if}
