import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

// Server-rendered list of upcoming events. Past events are still fetched lazily
// on the client behind the "Show past events" toggle (see +page.svelte).
export const load: PageLoad = async ({ fetch, url, parent }) => {
  const eventsP = fetch('/api/public/events')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const venueP = fetch('/api/public/venue')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const { cafe } = await parent();
  const [upcoming, venue] = await Promise.all([eventsP, venueP]);

  const seo = buildSeo({
    route: 'events',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    events: upcoming,
    venue,
  });

  return { upcoming, seo };
};
