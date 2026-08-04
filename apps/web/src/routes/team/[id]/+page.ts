import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

// Render the repairer profile on the server so /team/:id is fully crawlable.
// A 404 (inactive/hidden volunteer) resolves to a friendly not-found state
// (noindex via seo) rather than the generic error page.
export const load: PageLoad = async ({ fetch, url, params, parent }) => {
  const resP = fetch(`/api/public/repairers/${params.id}`).catch(() => null);
  // People often arrive here from a shared card inviting them to the next
  // session, so the page shows that session and links to its details.
  const eventsP = fetch('/api/public/events').catch(() => null);
  const { cafe } = await parent();
  const res = await resP;

  let repairer = null;
  let notFound = false;
  if (!res || res.status === 404 || !res.ok) {
    notFound = true;
  } else {
    repairer = await res.json();
  }

  let nextEvent = null;
  try {
    const eventsRes = await eventsP;
    if (eventsRes?.ok) {
      const events = await eventsRes.json();
      nextEvent = events[0] ?? null;
    }
  } catch {
    // The profile still works without the session card.
  }

  const seo = buildSeo({
    route: 'team',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    repairer,
    // Carried by shared links so the card style a volunteer picked in the
    // share menu is the one crawlers draw. buildSeo ignores unknown values.
    shareStyle: url.searchParams.get('style'),
  });

  return { repairer, nextEvent, notFound, seo };
};
