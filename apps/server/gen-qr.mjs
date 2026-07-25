import QRCode from 'qrcode';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const URL = 'https://repaircafe.circularity.org/';
const SIZE = 1024;
const OUTPUT = path.join(repoRoot, 'repair-cafe-qr.png');
const LOGO_SVG = path.join(repoRoot, 'Circularity logo - text only - grey.svg');

// 1. Generate the QR code at full size. High error correction (H) lets us
//    cover the centre with a logo and still scan reliably.
const qrBuffer = await QRCode.toBuffer(URL, {
  errorCorrectionLevel: 'H',
  width: SIZE,
  margin: 4,
  color: { dark: '#231F20', light: '#FFFFFF' },
  type: 'png',
});

// 2. Render the circularity wordmark to a PNG. It is a wide logo
//    (viewBox 2201 x 795, about 2.77:1), so the badge is a wide rectangle.
const logoAspect = 2201 / 795;
const logoWidth = Math.round(SIZE * 0.4); // wordmark width
const logoHeight = Math.round(logoWidth / logoAspect);
const padX = Math.round(logoWidth * 0.12);
const padY = Math.round(logoHeight * 0.35);
const badgeWidth = logoWidth + padX * 2;
const badgeHeight = logoHeight + padY * 2;
const radius = Math.round(badgeHeight * 0.28);

const logoSvg = await fs.readFile(LOGO_SVG);
const logoPng = await sharp(logoSvg, { density: 300 })
  .resize(logoWidth, logoHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// 3. Build a white rounded-rectangle badge to sit behind the wordmark.
const badgeSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${badgeWidth}" height="${badgeHeight}">` +
    `<rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="${radius}" ry="${radius}" fill="#FFFFFF"/>` +
    `</svg>`
);
const badge = await sharp(badgeSvg).png().toBuffer();

// Centre the wordmark on the badge.
const badgeWithLogo = await sharp(badge)
  .composite([{ input: logoPng, left: padX, top: padY }])
  .png()
  .toBuffer();

// 4. Composite the badge onto the centre of the QR code.
const badgeLeft = Math.round((SIZE - badgeWidth) / 2);
const badgeTop = Math.round((SIZE - badgeHeight) / 2);
await sharp(qrBuffer)
  .composite([{ input: badgeWithLogo, left: badgeLeft, top: badgeTop }])
  .png()
  .toFile(OUTPUT);

console.log(`Wrote ${OUTPUT}`);
