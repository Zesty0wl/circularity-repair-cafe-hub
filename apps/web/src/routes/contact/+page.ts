import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const venueP = fetch('/api/public/venue')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  // Most people who open this page want to know when to turn up, not just
  // where, so the page leads with the next session.
  const eventsP = fetch('/api/public/events')
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => []);

  const { cafe } = await parent();
  const [venue, upcoming] = await Promise.all([venueP, eventsP]);

  const seo = buildSeo({
    route: 'contact',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    venue,
  });

  return { venue, upcoming, seo };
};
