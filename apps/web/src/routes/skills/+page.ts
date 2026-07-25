import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const skillsP = fetch('/api/public/skills')
    .then((res) => (res.ok ? res.json() : { categories: [], repairers: [] }))
    .catch(() => ({ categories: [], repairers: [] }));
  // The closing invitation names the next session, so the page needs it too.
  const eventsP = fetch('/api/public/events')
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => []);

  const { cafe } = await parent();
  const [r, upcoming] = await Promise.all([skillsP, eventsP]);
  const categories = r?.categories ?? [];
  const repairers = r?.repairers ?? [];

  const seo = buildSeo({
    route: 'skills',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    categories: categories.map((c: { name: string }) => c.name),
  });

  return { categories, repairers, upcoming, seo };
};
