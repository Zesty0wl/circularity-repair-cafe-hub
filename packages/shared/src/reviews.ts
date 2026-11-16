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

/**
 * The Place ID inside a Google Maps link, or null when it has none.
 *
 * A Maps link to a place includes the place's code as two hex numbers, such
 * as "0x4879ff52cf77c66b:0xed09ab45a6fda2ec". A Place ID starting "ChIJ" is
 * those same two numbers, packed into 20 bytes and written in base64:
 *   0a 12 | 09 <first, 8 bytes, low byte first> | 11 <second, the same way>
 * Google does not document this, so a wrong guess is possible. The "Test the
 * link" button in Settings shows which place the review box is for.
 */
export function placeIdFromMapsUrl(link: string): string | null {
  let text = link;
  try {
    text = decodeURIComponent(link);
  } catch {
    // Use the link as it is.
  }
  const m = /0x([0-9a-f]{1,16}):0x([0-9a-f]{1,16})/i.exec(text);
  if (!m) return null;
  const bytes = [0x0a, 0x12, 0x09, ...littleEndian(m[1]), 0x11, ...littleEndian(m[2])];
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A hex number as 8 bytes, lowest first. */
function littleEndian(hex: string): number[] {
  const padded = hex.padStart(16, '0');
  const out: number[] = [];
  for (let i = 14; i >= 0; i -= 2) out.push(parseInt(padded.slice(i, i + 2), 16));
  return out;
}

/** Short links from the Share button in Google Maps, which hide the place's code. */
export function isMapsShortLink(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' && (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl');
  } catch {
    return false;
  }
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

  // A Google Maps link to a place carries the place's code ("0x…:0x…"), which
  // is the Place ID written another way.
  const fromMaps = placeIdFromMapsUrl(value);
  if (fromMaps) return { url: writeReviewUrl(fromMaps), direct: true };

  // A Google Business Profile review link (g.page/r/<code>/review) opens the
  // review box too.
  const direct = url.hostname === 'g.page' && /\/review\/?$/.test(url.pathname);
  return { url: url.toString(), direct };
}
