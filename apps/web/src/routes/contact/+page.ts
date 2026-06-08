import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const venueP = fetch('/api/public/venue')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  const { cafe } = await parent();
  const venue = await venueP;

  const seo = buildSeo({
    route: 'contact',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    venue,
  });

  return { venue, seo };
};
