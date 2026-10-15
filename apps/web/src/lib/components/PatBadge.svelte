<script lang="ts">
  // Shows where an electrical item is with its PAT test (a safety check on an
  // electrical item). Nothing at all for an item that does not need one and
  // has no result, so a cafe that does not do PAT tests never sees it.
  import { Zap } from 'lucide-svelte';

  /** The item needs a PAT test. */
  export let needed = false;
  /** The result, once somebody has recorded one. */
  export let result: string | null | undefined = null;

  const LABEL: Record<string, string> = {
    pass: 'PAT passed',
    fail: 'PAT failed',
    not_needed: 'PAT not needed',
  };
  const TONE: Record<string, string> = {
    pass: 'bg-emerald-100 text-emerald-800',
    fail: 'bg-rose-100 text-rose-800',
    not_needed: 'bg-slate-100 text-slate-700',
  };
</script>

{#if result && LABEL[result]}
  <span class="badge {TONE[result]}"><Zap size={12} /> {LABEL[result]}</span>
{:else if needed}
  <span class="badge bg-amber-100 text-amber-900" title="This is an electrical item. Record a PAT test before you mark it as fixed.">
    <Zap size={12} /> PAT test needed
  </span>
{/if}
