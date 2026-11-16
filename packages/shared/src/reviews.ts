// =============================================================================
//  Google reviews
//  ---------------------------------------------------------------------------
//  A cafe can ask visitors to review it on Google. In Settings it gives either
//  its Google Place ID or a Google link, and this file turns that into the
//  address a visitor is sent to.
//
//  A Place ID (it usually starts "ChIJ") is the best choice. It gives a link
//  that opens Google's "write a review" box straight away. Anyone can find a
//  Place ID with Google's Place ID Finder, whether or not they manage the
//  cafe's Google listing.
//
//  Other Google links (a share link, a Maps or search link) cannot be turned
//  into that box, so they are used as they are. They open the cafe's listing,
//  and the visitor presses "Write a review" there.
// =============================================================================

/** Where Google's own help says to find a Place ID. */
export const PLACE_ID_FINDER_URL =
  'https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder';

export interface GoogleReviewLink {
  /** Where to send the visitor. */
  url: string;
  /** True when the link opens the "write a review" box itself. */
  direct: boolean;
}

/** Google's review box for a place. */
export function writeReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/** A Place ID: letters, digits, "-" and "_", with no spaces, dots or slashes. */
function isPlaceId(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,300}$/.test(value);
}

/** Hosts that belong to Google, for the links we accept as they are. */
function isGoogleHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'google.com' ||
    h.endsWith('.google.com') ||
    /^(www\.)?google\.(com?\.)?[a-z]{2,3}$/.test(h) ||
    ['g.page', 'share.google', 'goo.gl', 'maps.app.goo.gl', 'g.co'].includes(h)
  );
}

/**
 * The review link for what an admin typed in Settings, or null when it is
 * neither a Place ID nor a Google link. An empty value also gives null.
 */
export function googleReviewLink(raw: string | null | undefined): GoogleReviewLink | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (isPlaceId(value)) return { url: writeReviewUrl(value), direct: true };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isGoogleHost(url.hostname)) return null;

  // A link that names the place, such as one from the Place ID Finder or a
  // Maps link with "place_id:", becomes the review box.
  const fromParam = url.searchParams.get('placeid') ?? url.searchParams.get('place_id');
  const fromQuery = /place_id:([A-Za-z0-9_-]{20,300})/.exec(url.searchParams.get('q') ?? '')?.[1];
  const placeId = fromParam ?? fromQuery;
  if (placeId && isPlaceId(placeId)) return { url: writeReviewUrl(placeId), direct: true };

  // A Google Business Profile review link (g.page/r/<code>/review) opens the
  // review box too.
  const direct = url.hostname === 'g.page' && /\/review\/?$/.test(url.pathname);
  return { url: url.toString(), direct };
}
