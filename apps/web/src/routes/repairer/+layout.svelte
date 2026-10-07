<script lang="ts">
  // Session pages for everyone signed in: the queue, check-in, photos and your
  // own profile. The frame, the menu and the sign-in checks are in StaffShell.
  import StaffShell from '$lib/components/StaffShell.svelte';
</script>

<StaffShell>
  <slot />
</StaffShell>
