// =============================================================================
//  Progressive web app icons
//  ---------------------------------------------------------------------------
//  Home screen icons have to be square PNGs at fixed sizes, but a cafe uploads
//  whatever shape its logo happens to be (most are wide wordmarks). So we
//  derive the icons from the uploaded logo rather than asking admins to
//  prepare a second set of images.
//
//  Two purposes are produced:
//    • "any"      — the logo on its own background, with a small margin.
//    • "maskable" — the same logo inside the safe zone, because Android crops
//                   the icon to whatever shape the launcher uses. Anything
//                   outside the middle ~60% can be cut off, so we pad heavily.
//
//  Icons are generated once and cached on disk. The filename carries a hash of
//  everything they are derived from, so a new logo or a new brand colour
//  produces new filenames and the old ones simply stop being requested. That
//  lets us serve them as immutable.
// =============================================================================
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { env } from '../env.js';

export interface IconSource {
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
}

/** Circularity teal, used when a cafe has not chosen a colour. */
const DEFAULT_COLOUR = '#1B6B5A';

/** Fraction of the canvas the artwork fills, per purpose. */
const INSET = { any: 0.86, maskable: 0.6 } as const;

export type IconPurpose = keyof typeof INSET;

export const ICON_SIZES = [192, 512] as const;

function pwaDir(): string {
  return path.join(env.UPLOADS_DIR, 'pwa');
}

/**
 * Short hash of every input the icons are built from. Any change to the logo
 * or the brand colour changes this, and therefore changes the icon filenames.
 */
export function iconVersion(src: IconSource): string {
  const key = [src.logoUrl ?? '', src.faviconUrl ?? '', src.primaryColor ?? ''].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);
}

export function iconFilename(version: string, purpose: IconPurpose, size: number): string {
  return `${purpose}-${version}-${size}.png`;
}

/**
 * Resolve an uploaded file URL (`/uploads/branding/x.jpg`) to a path on disk,
 * refusing anything that escapes the uploads directory.
 */
function resolveUploadPath(url: string | null): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const relative = url.slice('/uploads/'.length);
  const full = path.resolve(env.UPLOADS_DIR, relative);
  const root = path.resolve(env.UPLOADS_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

/** Normalise a hex colour, falling back to the Circularity default. */
function safeColour(hex: string | null): string {
  return /^#[0-9a-fA-F]{6}$/.test((hex ?? '').trim()) ? hex!.trim() : DEFAULT_COLOUR;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function hexToRgb(hex: string): Rgb {
  const int = parseInt(hex.replace('#', ''), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/**
 * The colour to pad the artwork with. Uploaded logos are always flattened to
 * opaque JPEG, so a logo with a white background padded with anything else
 * shows an obvious seam. Reading the source's top-left pixel gives us the
 * logo's own background, which pads invisibly whatever colour it is.
 */
async function padColour(source: Buffer): Promise<Rgb> {
  try {
    const { data } = await sharp(source)
      .rotate()
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { r: data[0]!, g: data[1]!, b: data[2]! };
  } catch {
    return WHITE;
  }
}

/**
 * Fallback artwork for a cafe with no logo: a white spanner, drawn on a
 * transparent background so it goes through the same padding as a real logo.
 * A path rather than text, so it never depends on a font being installed in
 * the container.
 */
function fallbackArtwork(size: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
      `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" ` +
      `fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`,
  );
}

async function renderIcon(src: IconSource, purpose: IconPurpose, size: number): Promise<Buffer> {
  const sourcePath = resolveUploadPath(src.logoUrl) ?? resolveUploadPath(src.faviconUrl);
  const inner = Math.round(size * INSET[purpose]);

  const logo = sourcePath ? await fs.readFile(sourcePath).catch(() => null) : null;
  // No logo: the spanner on the cafe's own colour. It gets the same inset as a
  // logo would, so a round launcher mask cannot clip its ends.
  const artwork: Buffer = logo ?? fallbackArtwork(inner);
  const background: Rgb = logo ? await padColour(logo) : hexToRgb(safeColour(src.primaryColor));

  const scaled = await sharp(artwork)
    .rotate()
    .resize(inner, inner, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: { ...background, alpha: 1 } },
  })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png()
    .toBuffer();
}

/**
 * Return the path on disk for one icon, generating and caching it on first
 * request. Returns null if the filename does not match a name we would issue.
 */
export async function getIconPath(src: IconSource, filename: string): Promise<string | null> {
  const match = /^(any|maskable)-([0-9a-f]{10})-(\d{2,4})\.png$/.exec(filename);
  if (!match) return null;
  const [, purpose, version, sizeText] = match;
  const size = Number(sizeText);
  // Only serve the sizes and the version we currently advertise, so this
  // cannot be used to make the server render arbitrary images on demand.
  if (!ICON_SIZES.includes(size as (typeof ICON_SIZES)[number])) return null;
  if (version !== iconVersion(src)) return null;

  const dir = pwaDir();
  const full = path.join(dir, filename);
  try {
    await fs.access(full);
    return full;
  } catch {
    /* not generated yet */
  }

  const png = await renderIcon(src, purpose as IconPurpose, size);
  await fs.mkdir(dir, { recursive: true });
  // Write to a temporary name first so a concurrent request never reads a
  // half-written file.
  const temp = path.join(dir, `.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temp, png);
  await fs.rename(temp, full);
  return full;
}
