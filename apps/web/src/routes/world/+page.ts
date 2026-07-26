import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

/**
 * The directory itself is a few thousand cafes, so the page fetches it in the
 * browser once the globe is ready rather than pushing it through the server
 * render. Only the page copy and its SEO tags are built here.
 */
export const load: PageLoad = async ({ url, parent }) => {
  const { cafe } = await parent();

  const seo = buildSeo({
    route: 'world',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
  });

  return { seo };
};
