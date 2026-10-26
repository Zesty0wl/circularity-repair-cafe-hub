// The website's side of the translations. The dictionary and the lookup live
// in the shared package (see packages/shared/src/i18n), so the Worker can use
// them too.
//
// `t` is a store, so components stay reactive to a language change: `$t('…')`.
// In plain code (not a component) use `tNow('…')`.
import { derived, get, writable } from 'svelte/store';
import { DEFAULT_LOCALE, dateLocale as dateLocaleFor, isLocale, translate, type Locale } from '@circularity/shared';

export { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@circularity/shared';

const localeStore = writable<Locale>(DEFAULT_LOCALE);
export const locale = { subscribe: localeStore.subscribe };

export function setLocale(next: Locale): void {
  localeStore.set(isLocale(next) ? next : DEFAULT_LOCALE);
}

export function currentLocale(): Locale {
  return get(localeStore);
}

/** Reactive translator for components: `$t('How did it go?')`. */
export const t = derived(
  localeStore,
  (l) => (source: string, vars?: Record<string, string | number>) => translate(l, source, vars),
);

/** For code that runs outside a component and does not need reactivity. */
export function tNow(source: string, vars?: Record<string, string | number>): string {
  return translate(get(localeStore), source, vars);
}

/**
 * The language tag to format dates and numbers with, for the language now
 * shown: `date.toLocaleDateString(dateLocale(), …)`.
 */
export function dateLocale(): string {
  return dateLocaleFor(get(localeStore));
}
