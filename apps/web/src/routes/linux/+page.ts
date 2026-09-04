import { redirect } from '@sveltejs/kit';
import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

/**
 * The Linux Repair Cafe page.
 *
 * The API answers 404 while the cafe has the feature switched off, and this
 * sends the visitor to the home page rather than showing them an empty page
 * about something the cafe does not do. A permanent redirect would be wrong:
 * a cafe may well turn this on next month.
 */
export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { cafe } = await parent();

  const res = await fetch('/api/public/linux').catch(() => null);
  if (!res || !res.ok) throw redirect(307, '/');

  const data = (await res.json()) as {
    page: Record<string, unknown>;
    upcomingEvents: unknown[];
    volunteers: unknown[];
    stats: Record<string, number>;
  };

  const seo = buildSeo({
    route: 'linux',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
  });

  return { ...data, seo };
};
