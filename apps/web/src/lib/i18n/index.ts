// A small, dependency-free i18n layer.
//
// The English text is the key: `t('How did it go?')` returns that string in
// English and looks it up in a dictionary for other languages. This keeps the
// English source readable and makes a new language a single dictionary file. The
// trade-off is that the English wording is what translators match on, so if the
// wording changes the translation falls back to English until it is updated.
//
// `t` is a store, so components stay reactive to a language change: `$t('…')`.
// In plain code (not a component) use `tNow('…')`.
import { derived, get, writable } from 'svelte/store';
import { fr } from './fr';

export type Locale = 'en' | 'fr';

/** Languages we can show. English is always the fallback. */
export const LOCALES: readonly Locale[] = ['en', 'fr'];
export const DEFAULT_LOCALE: Locale = 'en';

/** Filled in per language. English is the source text itself, so it is not here. */
const dictionaries: Partial<Record<Locale, Record<string, string>>> = { fr };

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'fr';
}

const localeStore = writable<Locale>(DEFAULT_LOCALE);
export const locale = { subscribe: localeStore.subscribe };

export function setLocale(next: Locale): void {
  localeStore.set(isLocale(next) ? next : DEFAULT_LOCALE);
}

export function currentLocale(): Locale {
  return get(localeStore);
}

/** Replace {name} placeholders with the given values. */
function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/** Translate `source` for a locale. An unknown string falls back to the source. */
export function translate(locale: Locale, source: string, vars?: Record<string, string | number>): string {
  const text = locale === 'en' ? source : dictionaries[locale]?.[source] ?? source;
  return interpolate(text, vars);
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
