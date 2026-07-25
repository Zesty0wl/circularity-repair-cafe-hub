import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

// Server-rendered data for the home page. Uses the load `fetch` so the calls
// run in-process during SSR (rewritten to the local API by hooks.server.ts) and
// directly from the browser on client-side navigation. `seo` (built here) is
// rendered once by the root layout from $page.data.seo.
export const load: PageLoad = async ({ fetch, url, parent }) => {
  const eventsP = fetch('/api/public/events')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const skillsP = fetch('/api/public/skills')
    .then((r) => (r.ok ? r.json() : { categories: [], repairers: [] }))
    .catch(() => ({ categories: [], repairers: [] }));
  const venueP = fetch('/api/public/venue')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  // Headline numbers for the "Our numbers" band. Always fetched; the page
  // only renders them if the cafe has switched the band on.
  const statsP = fetch('/api/public/stats')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const { cafe } = await parent();
  const [upcomingEvents, skills, venue, stats] = await Promise.all([eventsP, skillsP, venueP, statsP]);

  const seo = buildSeo({
    route: 'home',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    events: upcomingEvents,
    venue,
  });

  return {
    upcomingEvents,
    stats,
    categories: skills?.categories ?? [],
    repairers: skills?.repairers ?? [],
    seo,
  };
};
