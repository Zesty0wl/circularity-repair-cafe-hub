// The languages the hub can show, and the code that picks and applies one.
//
// The English text is the key: `translate('fr', 'How did it go?')` looks the
// sentence up in the French dictionary, and English needs no dictionary at all.
// This keeps the English source readable and makes a new language a single
// dictionary file. The trade-off is that translators match on the English
// wording, so if the wording changes, that text shows in English until the
// dictionary is updated.
//
// This lives in the shared package so the website and the Worker (which draws
// the link-sharing pictures) use the same words.
import { fr } from './fr.js';

export type Locale = 'en' | 'fr';

/** Languages we can show. English is always the fallback. */
export const LOCALES: readonly Locale[] = ['en', 'fr'];
export const DEFAULT_LOCALE: Locale = 'en';

/** Filled in per language. English is the source text itself, so it is not here. */
const dictionaries: Partial<Record<Locale, Record<string, string>>> = { fr };

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'fr';
}

/**
 * Pick the language for a request. A `LANGUAGE` setting of 'en' or 'fr' always
 * wins. Otherwise ('auto', or not set) we follow the browser's Accept-Language
 * header, which lists languages with an optional weight, best first, such as
 * "fr-CH, fr;q=0.9, en;q=0.8". We take the best language we have, and English
 * when the browser asks for none of ours.
 */
export function pickLocale(acceptLanguage: string | null | undefined, setting?: string | null): Locale {
  const forced = setting?.trim().toLowerCase();
  if (isLocale(forced)) return forced;
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map((part, position) => {
      const [tag = '', ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: tag.trim().split('-')[0], weight: Number.isFinite(weight) ? weight : 0, position };
    })
    .filter((entry) => entry.weight > 0 && isLocale(entry.lang))
    .sort((a, b) => b.weight - a.weight || a.position - b.position);
  return (wanted[0]?.lang as Locale | undefined) ?? DEFAULT_LOCALE;
}

/** Replace {name} placeholders with the given values. */
function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/**
 * Translate `source` for a locale. An unknown string falls back to the source.
 *
 * A few short English words need different translations in different places,
 * such as "Next" on a button ("Suivant") and on a date badge ("Prochaine").
 * For those, pass a `context`: the dictionary entry 'badge|Next' is used first,
 * then the plain 'Next'. English always shows `source` as it is.
 */
export function translate(
  locale: Locale,
  source: string,
  vars?: Record<string, string | number>,
  context?: string,
): string {
  const dictionary = locale === 'en' ? undefined : dictionaries[locale];
  const text = (context && dictionary?.[`${context}|${source}`]) || dictionary?.[source] || source;
  return interpolate(text, vars);
}

/** The language tag to format dates and numbers with, such as 13 March 2026. */
export function dateLocale(locale: Locale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-GB';
}
