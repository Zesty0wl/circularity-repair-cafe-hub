import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

/**
 * The reference data is fetched here rather than in the browser, so the page
 * can show its workings even to a reader with JavaScript switched off.
 */
export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { cafe } = await parent();

  const co2 = await fetch('/api/public/co2-factors')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  const stats = await fetch('/api/public/stats')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  const seo = buildSeo({
    route: 'about',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
  });

  return { co2, stats, seo };
};
