import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

// Crawlable detail page for a single event. Past events still resolve (the API
// only 404s unpublished/cancelled ones) so the page keeps ranking after the
// date. A 404 resolves to a friendly not-found state (noindex via seo).
export const load: PageLoad = async ({ fetch, url, params, parent }) => {
  const eventP = fetch(`/api/public/events/${params.id}`).catch(() => null);
  const venueP = fetch('/api/public/venue')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const { cafe } = await parent();
  const res = await eventP;

  let event = null;
  let notFound = false;
  if (!res || res.status === 404 || !res.ok) {
    notFound = true;
  } else {
    event = await res.json();
  }

  const venue = await venueP;

  const seo = buildSeo({
    route: 'event',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    event,
    venue,
  });

  return { event, notFound, seo };
};
