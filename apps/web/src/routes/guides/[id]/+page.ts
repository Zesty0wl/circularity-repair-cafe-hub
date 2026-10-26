import { error } from '@sveltejs/kit';
import { buildSeo, translate } from '@circularity/shared';
import type { GuideDetail } from '$lib/guides';
import type { PageLoad } from './$types';

/**
 * A guide is fetched on the server so the page can be shared, and so someone
 * on a slow connection at the repair table sees the steps as the page arrives.
 */
export const load: PageLoad = async ({ fetch, params, url, parent }) => {
  const res = await fetch(`/api/public/guides/${params.id}`);
  const { cafe, locale } = await parent();
  if (res.status === 404) error(404, translate(locale, 'That repair guide could not be found'));
  if (!res.ok) error(503, translate(locale, 'Repair guides are not available right now'));

  const guide = (await res.json()) as GuideDetail;

  const seo = buildSeo({
    route: 'guides',
    origin: url.origin,
    pathname: url.pathname,
    cafe,
    locale,
  });

  return {
    guide,
    seo: {
      ...seo,
      title: `${guide.title} | ${translate(locale, 'Repair guide')}`,
      description:
        guide.summary ??
        translate(locale, 'Step-by-step guide to {title}, from the iFixit community.', {
          title: guide.title.toLowerCase(),
        }),
      // The guide itself belongs to iFixit. Point search engines at their copy
      // rather than competing with it.
      canonical: guide.url,
      // The guide's opening photograph says far more than a drawn card would.
      ...(guide.image ? { ogImage: guide.image } : {}),
    },
  };
};
