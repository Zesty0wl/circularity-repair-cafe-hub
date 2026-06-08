import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const skillsP = fetch('/api/public/skills')
    .then((res) => (res.ok ? res.json() : { categories: [], repairers: [] }))
    .catch(() => ({ categories: [], repairers: [] }));

  const { cafe } = await parent();
  const r = await skillsP;
  const categories = r?.categories ?? [];
  const repairers = r?.repairers ?? [];

  const seo = buildSeo({
    route: 'skills',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    categories: categories.map((c: { name: string }) => c.name),
  });

  return { categories, repairers, seo };
};
