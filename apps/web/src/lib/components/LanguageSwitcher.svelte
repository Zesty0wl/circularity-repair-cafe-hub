<script lang="ts">
  // A small language picker. It writes the choice to a cookie (see
  // selectLocale), so the next page the visitor opens is drawn in the same
  // language on the server.
  import { Languages } from 'lucide-svelte';
  import { LOCALES, LOCALE_NAMES, locale, selectLocale, t, type Locale } from '$lib/i18n';

  /** Use "dark" on a dark background and "light" on a white or tinted one. */
  export let tone: 'light' | 'dark' = 'light';
  /** "full" shows the language name; "compact" shows the picker alone. */
  export let variant: 'full' | 'compact' = 'full';

  function change(event: Event): void {
    selectLocale((event.currentTarget as HTMLSelectElement).value as Locale);
  }
</script>

<label
  class="language-switcher {tone} {variant}"
  title={$t('Language')}
>
  <Languages size={16} class="shrink-0" aria-hidden="true" />
  <span class="sr-only">{$t('Language')}</span>
  <select value={$locale} on:change={change} aria-label={$t('Language')}>
    {#each LOCALES as code}
      <option value={code}>{LOCALE_NAMES[code]}</option>
    {/each}
  </select>
</label>

<style>
  .language-switcher {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.5rem;
    border-radius: 0.6rem;
    border: 1px solid rgb(226 232 240);
    background: #fff;
    color: rgb(51 65 85);
    font-size: 0.85rem;
    line-height: 1.2;
  }
  .language-switcher:focus-within {
    outline: 2px solid rgb(var(--brand-500));
    outline-offset: 1px;
  }
  .language-switcher select {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0 0.1rem;
  }
  .language-switcher select:focus {
    outline: none;
  }
  .language-switcher select option {
    color: rgb(30 41 59);
    background: #fff;
  }
  .language-switcher.dark {
    border-color: rgb(255 255 255 / 0.25);
    background: rgb(255 255 255 / 0.1);
    color: #fff;
  }
  .language-switcher.compact select {
    max-width: 5.5rem;
  }
</style>
