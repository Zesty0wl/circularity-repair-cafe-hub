<script lang="ts">
  export let current: number;
  export let total: number;
  export let label: string = '';
  $: pct = Math.round((current / total) * 100);
</script>

<div class="w-full">
  <div class="flex justify-between text-xs text-slate-600 mb-1">
    <span>Step {current} of {total}{label ? `: ${label}` : ''}</span>
    <span>{pct}%</span>
  </div>
  <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
    <div class="h-full bg-brand-600 transition-all duration-300" style="width: {pct}%"></div>
  </div>
</div>
