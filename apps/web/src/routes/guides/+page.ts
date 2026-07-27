import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

/**
 * Searches are made in the browser as somebody types. The recently updated
 * guides are fetched here instead, so the page has something real on it the
 * moment it opens rather than an empty box, and so a crawler sees it too.
 */
export const load: PageLoad = async ({ fetch, url, parent }) => {
  const recentP = fetch('/api/public/guides/recent')
    .then((r) => (r.ok ? r.json() : { guides: [] }))
    .catch(() => ({ guides: [] }));

  const { cafe } = await parent();
  const recent = await recentP;

  const seo = buildSeo({
    route: 'guides',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
  });

  return { seo, recent: recent?.guides ?? [] };
};
