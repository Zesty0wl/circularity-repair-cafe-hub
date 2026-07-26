import { error } from '@sveltejs/kit';
import { buildSeo } from '@circularity/shared';
import type { GuideDetail } from '$lib/guides';
import type { PageLoad } from './$types';

/**
 * A guide is fetched on the server so the page can be shared, and so someone
 * on a slow connection at the repair table sees the steps as the page arrives.
 */
export const load: PageLoad = async ({ fetch, params, url, parent }) => {
  const res = await fetch(`/api/public/guides/${params.id}`);
  if (res.status === 404) error(404, 'That repair guide could not be found');
  if (!res.ok) error(503, 'Repair guides are not available right now');

  const guide = (await res.json()) as GuideDetail;
  const { cafe } = await parent();

  const seo = buildSeo({
    route: 'guides',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
  });

  return {
    guide,
    seo: {
      ...seo,
      title: `${guide.title} | Repair guide`,
      description:
        guide.summary ??
        `Step-by-step guide to ${guide.title.toLowerCase()}, from the iFixit community.`,
      // The guide itself belongs to iFixit. Point search engines at their copy
      // rather than competing with it.
      canonical: guide.url,
      // The guide's opening photograph says far more than a drawn card would.
      ...(guide.image ? { ogImage: guide.image } : {}),
    },
  };
};
