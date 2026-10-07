// =============================================================================
//  Check-in QR codes
//  ---------------------------------------------------------------------------
//  Ported from the old Docker edition. The QR code is the same: the
//  session's check-in link, error correction level M, four modules of white
//  margin, about 500 pixels across. It is kept in R2 at the same address the
//  Docker edition used, /uploads/qr/<event id>.png.
//
//  Drawing is cheap, but a recurring session makes a year of events at once,
//  and drawing fifty QR codes in one request would go over the Worker's CPU
//  limit. So a code is drawn when it is first asked for (see routes/uploads.ts)
//  and kept from then on. Regenerating draws it again straight away.
// =============================================================================
import qrcode from 'qrcode-generator';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cafes, events } from '../db/schema.js';
import { encodeGreyPng } from '../lib/png.js';
import { putUpload } from './imageUpload.js';

const TARGET_SIZE = 500;
const MARGIN_MODULES = 4;

export function qrUrlFor(eventId: string): string {
  return `/uploads/qr/${eventId}.png`;
}

export function checkInUrl(publicUrl: string, token: string): string {
  return `${publicUrl.replace(/\/$/, '')}/checkin/${token}`;
}

/** A QR code for some text, as a PNG. */
export async function qrPng(text: string): Promise<Uint8Array> {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const total = modules + MARGIN_MODULES * 2;
  const scale = Math.max(1, Math.floor(TARGET_SIZE / total));
  const size = total * scale;
  const pixels = new Uint8Array(size * size).fill(255);
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!qr.isDark(row, col)) continue;
      const top = (row + MARGIN_MODULES) * scale;
      const left = (col + MARGIN_MODULES) * scale;
      for (let y = 0; y < scale; y++) {
        pixels.fill(0, (top + y) * size + left, (top + y) * size + left + scale);
      }
    }
  }
  return encodeGreyPng(size, size, pixels);
}

/** Draw a session's QR code now and keep it. Returns its address. */
export async function generateEventQrPng(publicUrl: string, token: string, eventId: string): Promise<string> {
  const png = await qrPng(checkInUrl(publicUrl, token));
  await putUpload(`qr/${eventId}.png`, png, 'image/png');
  return qrUrlFor(eventId);
}

/**
 * Draw a QR code that was asked for but has not been drawn yet. Returns null
 * when there is no such session, or it has no check-in link.
 */
export async function drawMissingQr(eventId: string): Promise<Uint8Array | null> {
  const [evt] = await db
    .select({ token: events.checkInToken })
    .from(events)
    .where(and(eq(events.id, eventId)))
    .limit(1);
  if (!evt?.token) return null;
  const [cafe] = await db.select({ publicUrl: cafes.publicUrl }).from(cafes).limit(1);
  if (!cafe?.publicUrl) return null;
  const png = await qrPng(checkInUrl(cafe.publicUrl, evt.token));
  await putUpload(`qr/${eventId}.png`, png, 'image/png');
  return png;
}
