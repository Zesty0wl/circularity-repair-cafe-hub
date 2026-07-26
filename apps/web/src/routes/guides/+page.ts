import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

/**
 * Guides are fetched in the browser as someone searches, so only the page copy
 * and its SEO tags are built here.
 */
export const load: PageLoad = async ({ url, parent }) => {
  const { cafe } = await parent();

  const seo = buildSeo({
    route: 'guides',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
  });

  return { seo };
};
