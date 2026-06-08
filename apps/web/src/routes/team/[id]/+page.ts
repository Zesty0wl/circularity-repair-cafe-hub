import { buildSeo } from '@circularity/shared';
import type { PageLoad } from './$types';

// Render the repairer profile on the server so /team/:id is fully crawlable.
// A 404 (inactive/hidden volunteer) resolves to a friendly not-found state
// (noindex via seo) rather than the generic error page.
export const load: PageLoad = async ({ fetch, url, params, parent }) => {
  const resP = fetch(`/api/public/repairers/${params.id}`).catch(() => null);
  const { cafe } = await parent();
  const res = await resP;

  let repairer = null;
  let notFound = false;
  if (!res || res.status === 404 || !res.ok) {
    notFound = true;
  } else {
    repairer = await res.json();
  }

  const seo = buildSeo({
    route: 'team',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    repairer,
  });

  return { repairer, notFound, seo };
};
