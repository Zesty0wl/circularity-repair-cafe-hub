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

/** The name of each language in that language, as a language picker shows it. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
};

/** The cookie that remembers a visitor's choice between visits. */
export const LOCALE_COOKIE = 'locale';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

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

/**
 * Switch language because the visitor chose it.
 *
 * Unlike setLocale (which follows the server on each page load), this also
 * writes the choice to a cookie so the next request renders in the same
 * language, and it tells screen readers about the new page language straight
 * away. Only call it from the browser.
 */
export function selectLocale(next: Locale): void {
  const chosen = isLocale(next) ? next : DEFAULT_LOCALE;
  localeStore.set(chosen);
  if (typeof document === 'undefined') return;
  document.documentElement.lang = chosen;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${chosen}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

export function currentLocale(): Locale {
  return get(localeStore);
}

/** A BCP 47 tag for dates and numbers in the current language. */
export function intlLocale(locale: Locale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-GB';
}

/** Reactive BCP 47 tag for date and number formatting. */
export const dateLocale = derived(localeStore, intlLocale);

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
