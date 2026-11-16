// "Review us on Google": the setting, the short /review address, the QR code
// for the printed cards, and the link on a visitor's tracker.
import { beforeAll, describe, expect, it } from 'vitest';
import { googleReviewLink, isMapsShortLink, placeIdFromMapsUrl, writeReviewUrl } from '../../../packages/shared/src/reviews.js';
import { placeIdFromShortLink } from '../src/routes/reviews.js';
import { BASE, call, freshHub, setUpHub, worker } from './helpers.js';

/** Ask for /review without following the redirect. */
async function review(): Promise<{ status: number; location: string | null }> {
  const res = await worker.fetch(`${BASE}/review`, { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') };
}

const PLACE_ID = 'ChIJa8Z3z1L_eUgR7KL9pkWrCe0';
const REVIEW_URL = `https://search.google.com/local/writereview?placeid=${PLACE_ID}`;
// Repair Cafe Woodville in Google Maps, as the Maps website gives it.
const MAPS_URL =
  'https://www.google.com/maps/place/Repair+Cafe+Woodville/@52.7695,-1.5323,17z/data=!3m1!4b1!4m6!3m5!1s0x4879ff52cf77c66b:0xed09ab45a6fda2ec!8m2!3d52.7695!4d-1.5323!16s%2Fg%2F11z901g9h9';
const SHORT_URL = 'https://maps.app.goo.gl/Abc123Def456';

/** A stand-in for Google's link shortener: one redirect to the Maps page. */
const fakeShortener = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url === SHORT_URL) return new Response(null, { status: 302, headers: { location: MAPS_URL } });
  return new Response('not found', { status: 404 });
}) as typeof fetch;

describe('reading the Google review setting', () => {
  it('turns a Place ID into the "write a review" box', () => {
    expect(googleReviewLink(PLACE_ID)).toEqual({ url: REVIEW_URL, direct: true });
    expect(googleReviewLink(`  ${PLACE_ID}  `)?.url).toBe(REVIEW_URL);
    expect(writeReviewUrl(PLACE_ID)).toBe(REVIEW_URL);
  });

  it('finds the Place ID inside a Google link', () => {
    expect(googleReviewLink(REVIEW_URL)).toEqual({ url: REVIEW_URL, direct: true });
    expect(googleReviewLink(`https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`)).toEqual({ url: REVIEW_URL, direct: true });
  });

  it('finds the Place ID inside a Google Maps link', () => {
    expect(placeIdFromMapsUrl(MAPS_URL)).toBe(PLACE_ID);
    expect(googleReviewLink(MAPS_URL)).toEqual({ url: REVIEW_URL, direct: true });
    // The same code, written with %3A for the colon.
    expect(placeIdFromMapsUrl('https://www.google.com/maps?ftid=0x4879ff52cf77c66b%3A0xed09ab45a6fda2ec')).toBe(PLACE_ID);
    expect(placeIdFromMapsUrl('https://www.google.com/maps/search/repair+cafe')).toBeNull();
  });

  it('follows a short link from the Share button to the Place ID', async () => {
    expect(isMapsShortLink(SHORT_URL)).toBe(true);
    expect(isMapsShortLink('https://www.google.com/maps')).toBe(false);
    expect(await placeIdFromShortLink(SHORT_URL, fakeShortener)).toBe(PLACE_ID);
    expect(await placeIdFromShortLink('https://maps.app.goo.gl/gone', fakeShortener)).toBeNull();
  });

  it('keeps other Google links as they are, as a link to the listing', () => {
    expect(googleReviewLink('https://share.google/AcrFBKS8Rv7i1NWxp')).toEqual({
      url: 'https://share.google/AcrFBKS8Rv7i1NWxp',
      direct: false,
    });
    expect(googleReviewLink('https://maps.app.goo.gl/abc123')?.direct).toBe(false);
    expect(googleReviewLink('https://www.google.co.uk/search?q=repair+cafe')?.direct).toBe(false);
    // A Business Profile review link opens the review box itself.
    expect(googleReviewLink('https://g.page/r/CewiK0aZ_qL7EBM/review')?.direct).toBe(true);
  });

  it('refuses anything that is not Google, or not secure', () => {
    expect(googleReviewLink('https://example.org/review')).toBeNull();
    expect(googleReviewLink('https://google.com.evil.example/x')).toBeNull();
    expect(googleReviewLink('http://www.google.com/maps')).toBeNull();
    expect(googleReviewLink('javascript:alert(1)')).toBeNull();
    expect(googleReviewLink('Repair Cafe Woodville')).toBeNull();
    expect(googleReviewLink('')).toBeNull();
    expect(googleReviewLink(null)).toBeNull();
  });
});

describe('Google reviews on a hub', () => {
  let admin = '';

  beforeAll(async () => {
    await freshHub();
    admin = (await setUpHub()).token;
  });

  it('sends /review home, and has no QR code, until it is set up', async () => {
    expect(await review()).toEqual({ status: 302, location: '/' });
    expect((await call('/api/public/review-qr.png')).status).toBe(404);
    expect((await call('/api/public/cafe')).body.googleReviewUrl).toBeNull();
  });

  it('refuses a setting that is not a Place ID or a Google link', async () => {
    const bad = await call('/api/admin/settings', { method: 'PATCH', token: admin, json: { googleReview: 'https://example.org' } });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('cafe/bad_google_review');
  });

  it('saves a Place ID and sends /review to the review box', async () => {
    const saved = await call('/api/admin/settings', { method: 'PATCH', token: admin, json: { googleReview: ` ${PLACE_ID} ` } });
    expect(saved.status).toBe(200);
    expect(saved.body.googleReview).toBe(PLACE_ID);

    expect((await call('/api/public/cafe')).body.googleReviewUrl).toBe(REVIEW_URL);
    expect(await review()).toEqual({ status: 302, location: REVIEW_URL });

    const qr = await call('/api/public/review-qr.png');
    expect(qr.status).toBe(200);
    expect(qr.headers.get('content-type')).toContain('image/png');
    const bytes = new Uint8Array(await qr.raw.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG');
  });

  it("puts the link on a visitor's tracker", async () => {
    const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const created = await call('/api/admin/events', {
      token: admin,
      json: { name: 'Saturday session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
    });
    await call(`/api/admin/events/${created.body.id}/activate`, { method: 'POST', token: admin });
    const job = await call(`/api/checkin/${created.body.checkInToken}/jobs`, {
      json: { customerName: 'Sam Visitor', gdprConsent: true, itemDescription: 'Lamp', faultDescription: 'Flickers' },
    });
    expect(job.status).toBe(200);
    const track = await call(`/api/track/${job.body.customerToken}`);
    expect(track.status).toBe(200);
    expect(track.body.cafe.googleReviewUrl).toBe(REVIEW_URL);
  });

  it('can be cleared again', async () => {
    const cleared = await call('/api/admin/settings', { method: 'PATCH', token: admin, json: { googleReview: '' } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.googleReview).toBeNull();
    expect((await review()).location).toBe('/');
  });
});
