import QRCode from 'qrcode';
import path from 'node:path';
import fs from 'node:fs/promises';
import { env } from '../env.js';

export async function generateEventQrPng(
  publicUrl: string,
  token: string,
  eventId: string
): Promise<string> {
  const checkInUrl = `${publicUrl.replace(/\/$/, '')}/checkin/${token}`;
  const dir = path.join(env.UPLOADS_DIR, 'qr');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${eventId}.png`;
  const fullPath = path.join(dir, filename);
  await QRCode.toFile(fullPath, checkInUrl, {
    errorCorrectionLevel: 'M',
    width: 500,
    margin: 4,
    color: { dark: '#000000', light: '#FFFFFF' },
    type: 'png',
  });
  return `/uploads/qr/${filename}`;
}
