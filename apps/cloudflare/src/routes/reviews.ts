// =============================================================================
//  "Review us on Google"
//  ---------------------------------------------------------------------------
//    GET /review                      sends the visitor on to Google
//    GET /api/public/review-qr.png    a QR code for that address, for printing
//
//  The printed cards and the QR code point at the hub's own /review address,
//  not at Google. It is short enough to type, and when the cafe changes its
//  Google link in Settings the cards it has already handed out still work.
//
//  Where the visitor lands is worked out by googleReviewLink() in
//  packages/shared/src/reviews.ts. Every visitor is offered the same link,
//  whatever happened to their item: Google does not allow asking only the
//  people who were happy.
// =============================================================================
import type { App } from '../lib/router.js';
import { db } from '../db/index.js';
import { cafes } from '../db/schema.js';
import { googleReviewLink } from '@circularity/shared';
import { qrPng } from '../services/qrcode.js';

async function reviewSettings() {
  const [cafe] = await db.select({ googleReview: cafes.googleReview, publicUrl: cafes.publicUrl }).from(cafes).limit(1);
  return { link: googleReviewLink(cafe?.googleReview), publicUrl: cafe?.publicUrl ?? '' };
}

/** The hub's own short review address, such as https://repair.example.org/review. */
export function shortReviewUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/$/, '')}/review`;
}

export async function reviewRoutes(app: App): Promise<void> {
  app.get('/review', async (_request, reply) => {
    const { link } = await reviewSettings();
    // No link set (or it was removed): the home page is the kindest place to land.
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(link?.url ?? '/', 302);
  });

  app.get('/api/public/review-qr.png', async (_request, reply) => {
    const { link, publicUrl } = await reviewSettings();
    if (!link || !publicUrl) {
      reply.code(404).send({ error: 'This cafe has no Google review link', code: 'review/not_set' });
      return;
    }
    void reply
      .type('image/png')
      .header('Cache-Control', 'public, max-age=3600')
      .send(await qrPng(shortReviewUrl(publicUrl)));
  });
}
