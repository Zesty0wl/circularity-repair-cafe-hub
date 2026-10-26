// Choosing a language and translating text. The website and the Worker share
// this code, so it is tested once, here.
import { describe, expect, it } from 'vitest';
import { pickLocale, translate } from '../../../packages/shared/src/i18n/index.js';
import { fr } from '../../../packages/shared/src/i18n/fr.js';

describe('pickLocale', () => {
  it('lets a forced setting win over the browser', () => {
    expect(pickLocale('en-GB, en;q=0.9', 'fr')).toBe('fr');
    expect(pickLocale('fr-FR, fr;q=0.9', 'en')).toBe('en');
    expect(pickLocale(null, ' FR ')).toBe('fr');
  });

  it("follows the browser when the setting is 'auto' or empty", () => {
    expect(pickLocale('fr-FR', 'auto')).toBe('fr');
    expect(pickLocale('fr-FR', '')).toBe('fr');
    expect(pickLocale('fr-FR', undefined)).toBe('fr');
    expect(pickLocale('fr-FR', null)).toBe('fr');
    expect(pickLocale('en-GB', 'auto')).toBe('en');
  });

  it('picks the language with the highest weight', () => {
    expect(pickLocale('en;q=0.5, fr;q=0.9')).toBe('fr');
    expect(pickLocale('fr;q=0.4, en;q=0.8')).toBe('en');
    // With equal weights, the first one listed wins.
    expect(pickLocale('fr, en')).toBe('fr');
    // A weight of 0 means "not this one".
    expect(pickLocale('fr;q=0, en;q=0.5')).toBe('en');
  });

  it('counts a region tag as its language', () => {
    expect(pickLocale('fr-CH')).toBe('fr');
    expect(pickLocale('fr-CA, en;q=0.5')).toBe('fr');
    expect(pickLocale('de-DE, fr-BE;q=0.7')).toBe('fr');
  });

  it('falls back to English for a language we do not have', () => {
    expect(pickLocale('de-DE, es;q=0.8')).toBe('en');
    expect(pickLocale('')).toBe('en');
    expect(pickLocale(null)).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
    expect(pickLocale('*')).toBe('en');
  });

  it('does not take a tag that only starts with "fr" as French', () => {
    // Afrikaans and Frisian.
    expect(pickLocale('afr')).toBe('en');
    expect(pickLocale('fry')).toBe('en');
    expect(pickLocale('fry-NL, afr;q=0.9')).toBe('en');
  });
});

describe('translate', () => {
  it('passes English through unchanged', () => {
    expect(translate('en', 'Sign in')).toBe('Sign in');
    expect(translate('en', 'Not a key at all')).toBe('Not a key at all');
  });

  it('translates a known French key', () => {
    expect(translate('fr', 'Sign in')).toBe(fr['Sign in']);
    expect(translate('fr', 'Sign in')).not.toBe('Sign in');
  });

  it('falls back to English for an unknown key', () => {
    expect(translate('fr', 'This sentence is not in the dictionary')).toBe('This sentence is not in the dictionary');
  });

  it('fills in placeholders, in English and in French', () => {
    expect(translate('en', 'Welcome to {name}!', { name: 'Woodville' })).toBe('Welcome to Woodville!');
    expect(translate('fr', 'Welcome to {name}!', { name: 'Woodville' })).toBe('Bienvenue à Woodville !');
    expect(translate('fr', 'Page {page} of {total}', { page: 2, total: 5 })).toBe('Page 2 sur 5');
    // A placeholder with no value is left as it is.
    expect(translate('en', 'Hello {name}', {})).toBe('Hello {name}');
  });
});

describe('the French dictionary', () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).slice().sort();

  it('keeps exactly the same {placeholders} as each English key', () => {
    const broken = Object.entries(fr)
      .filter(([english, french]) => placeholders(english).join() !== placeholders(french).join())
      .map(([english, french]) => `${english}  =>  ${french}`);
    expect(broken).toEqual([]);
  });
});
