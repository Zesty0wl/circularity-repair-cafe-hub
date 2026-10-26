// What a new hub starts with, in its language. A hub set to French starts with
// French page text and category names. The CO2 item types stay in English,
// because other code matches on them. A hub that already has its content
// keeps it, whatever the language setting says later.
import { env, withEnv } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { freshHub } from './helpers.js';
import { ensureDatabase, seed } from '../src/db/migrate.js';

const db = (env as unknown as { DB: D1Database }).DB;

/** Run some code with the LANGUAGE setting changed, for this call only. */
function inLanguage<T>(language: string, run: () => Promise<T>): Promise<T> {
  return withEnv({ ...(env as object), LANGUAGE: language }, run) as Promise<T>;
}

async function categoryNames(): Promise<string[]> {
  const rows = await db.prepare('SELECT name FROM skill_categories ORDER BY sort_order').all<{ name: string }>();
  return (rows.results ?? []).map((r) => r.name);
}

async function pages(): Promise<{ home: any; linux: any }> {
  const row = await db.prepare('SELECT home_page, linux_page FROM cafes').first<{ home_page: string; linux_page: string }>();
  return { home: JSON.parse(row!.home_page), linux: JSON.parse(row!.linux_page) };
}

/** Empty the values seeding fills in, as on a hub that has just been made. */
async function emptyContent(): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM skill_categories'),
    db.prepare(`UPDATE cafes SET home_page = '{}', linux_page = '{}'`),
  ]);
}

beforeAll(freshHub);

describe('seeding a new hub', () => {
  it('writes French category names and page text when LANGUAGE is fr', async () => {
    await inLanguage('fr', () => ensureDatabase());

    const names = await categoryNames();
    expect(names).toContain('Électronique');
    expect(names).toContain('Petit électroménager');
    expect(names).not.toContain('Electronics');

    const { home, linux } = await pages();
    expect(home.intro.heading).toBe('Qui sommes-nous ?');
    expect(home.howItWorks[0].title).toBe('Apportez-le');
    expect(home.faqs[0].q).toBe('Combien ça coûte ?');
    expect(linux.hero.heading).toBe('Repair Café Linux');
    expect(linux.homeCard.ctaLabel).toBe('En savoir plus sur Linux');
    // Values that are not text are kept as they are.
    expect(linux.showStats).toBe(true);

    // The CO2 item types stay in English.
    const kettle = await db
      .prepare(`SELECT label, category FROM co2_factors WHERE key = 'kettle'`)
      .first<{ label: string; category: string }>();
    expect(kettle).toEqual({ label: 'Kettle', category: 'Small appliances' });
  });

  it('keeps French content when the setting changes back to English', async () => {
    await inLanguage('en', () => seed(db, { force: true }));
    expect(await categoryNames()).toContain('Électronique');
    expect((await pages()).home.intro.heading).toBe('Qui sommes-nous ?');
  });

  it("writes English when LANGUAGE is 'en' or 'auto', and never changes an existing hub", async () => {
    for (const language of ['en', 'auto']) {
      await emptyContent();
      await inLanguage(language, () => seed(db, { force: true }));
      expect(await categoryNames()).toContain('Electronics');
      expect((await pages()).home.intro.heading).toBe('What & Who');
    }

    // Switching an English hub to French later leaves its content alone.
    await inLanguage('fr', () => seed(db, { force: true }));
    expect(await categoryNames()).toContain('Electronics');
    expect(await categoryNames()).not.toContain('Électronique');
    const { home, linux } = await pages();
    expect(home.intro.heading).toBe('What & Who');
    expect(linux.hero.heading).toBe('Linux Repair Cafe');
  });
});
