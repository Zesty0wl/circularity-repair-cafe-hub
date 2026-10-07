<script lang="ts">
  // Pages for running the cafe. Same frame and menu as the session pages (see
  // StaffShell), so admins never lose their way back. Repairers who open one
  // get a short note instead of being sent to the sign-in page.
  import StaffShell from '$lib/components/StaffShell.svelte';
  import UpdateBanner from '$lib/components/UpdateBanner.svelte';
</script>

<StaffShell requireAdmin>
  <UpdateBanner />
  <slot />
</StaffShell>
