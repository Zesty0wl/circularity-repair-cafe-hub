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
  // Neighbouring cafes, when the cafe has chosen some. Comes back empty
  // otherwise, and the card is left out.
  const localCafesP = fetch('/api/public/local-cafes')
    .then((r) => (r.ok ? r.json() : { ours: null, cafes: [] }))
    .catch(() => ({ ours: null, cafes: [] }));

  const { cafe } = await parent();
  const [upcomingEvents, skills, venue, stats, localCafes] = await Promise.all([
    eventsP,
    skillsP,
    venueP,
    statsP,
    localCafesP,
  ]);

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
    localCafes,
    seo,
  };
};
