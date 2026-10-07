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
//  Icons are generated once and kept in R2. The filename carries a hash of
//  everything they are derived from, so a new logo or a new brand colour
//  produces new filenames and the old ones simply stop being requested. That
//  lets us serve them as immutable. Drawing uses resvg: see lib/render.ts.
// =============================================================================
import { imageSize, MIME_FOR, sniffImage } from '../lib/images.js';
import { dataUrl, svgToPixels, svgToPng } from '../lib/render.js';
import { readUpload } from './imageUpload.js';
import { keepDrawn, readDrawn } from './ogImage.js';

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

/**
 * Short hash of every input the icons are built from. Any change to the logo
 * or the brand colour changes this, and therefore changes the icon filenames.
 *
 * The old Docker edition takes the first characters of a SHA-256. Web Crypto only
 * hashes asynchronously, and this is called while building the cafe profile,
 * so here it is two rounds of FNV-1a instead. It only has to change when the
 * inputs change; nobody relies on its exact value.
 */
export function iconVersion(src: IconSource): string {
  const key = [src.logoUrl ?? '', src.faviconUrl ?? '', src.primaryColor ?? ''].join('|');
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13);
  }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, 10);
}

export function iconFilename(version: string, purpose: IconPurpose, size: number): string {
  return `${purpose}-${version}-${size}.png`;
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
 * The colour to pad the artwork with. A logo with a white background padded
 * with anything else shows an obvious seam. Reading the source's top-left
 * pixel gives us the logo's own background, which pads invisibly whatever
 * colour it is. A see-through corner counts as white.
 */
async function padColour(source: Uint8Array): Promise<Rgb> {
  try {
    const kind = sniffImage(source);
    const size = kind ? imageSize(source, kind) : null;
    if (!kind || !size) return WHITE;
    const { pixels } = await svgToPixels(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">` +
        `<rect width="1" height="1" fill="#ffffff"/>` +
        `<image href="${dataUrl(source, MIME_FOR[kind])}" width="${size.width}" height="${size.height}" preserveAspectRatio="none"/>` +
        `</svg>`,
    );
    return { r: pixels[0]!, g: pixels[1]!, b: pixels[2]! };
  } catch {
    return WHITE;
  }
}

/**
 * Fallback artwork for a cafe with no logo: a white spanner, drawn on a
 * transparent background so it goes through the same padding as a real logo.
 * A path rather than text, so it never depends on a font.
 */
function fallbackArtwork(x: number, y: number, size: number): string {
  return (
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" ` +
    `fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

function hex({ r, g, b }: Rgb): string {
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

async function renderIcon(src: IconSource, purpose: IconPurpose, size: number): Promise<Uint8Array> {
  const inner = Math.round(size * INSET[purpose]);
  const offset = Math.round((size - inner) / 2);

  const fromLogo = src.logoUrl ? await readUpload(src.logoUrl).catch(() => null) : null;
  const logo = fromLogo ?? (src.faviconUrl ? await readUpload(src.faviconUrl).catch(() => null) : null);
  const kind = logo ? sniffImage(logo) : null;

  // No logo: the spanner on the cafe's own colour. It gets the same inset as a
  // logo would, so a round launcher mask cannot clip its ends.
  const background: Rgb = logo && kind ? await padColour(logo) : hexToRgb(safeColour(src.primaryColor));
  const artwork =
    logo && kind
      ? `<image href="${dataUrl(logo, MIME_FOR[kind])}" x="${offset}" y="${offset}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet"/>`
      : fallbackArtwork(offset, offset, inner);

  return svgToPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" fill="${hex(background)}"/>${artwork}</svg>`,
  );
}

/**
 * One icon as a PNG, generating and keeping it on first request. Returns null
 * if the filename does not match a name we would issue.
 */
export async function getIcon(src: IconSource, filename: string): Promise<Uint8Array | null> {
  const match = /^(any|maskable)-([0-9a-f]{10})-(\d{2,4})\.png$/.exec(filename);
  if (!match) return null;
  const [, purpose, version, sizeText] = match;
  const size = Number(sizeText);
  // Only serve the sizes and the version we currently advertise, so this
  // cannot be used to make the server render arbitrary images on demand.
  if (!ICON_SIZES.includes(size as (typeof ICON_SIZES)[number])) return null;
  if (version !== iconVersion(src)) return null;

  const key = `pwa/${filename}`;
  const existing = await readDrawn(key).catch(() => null);
  if (existing) return existing;
  const png = await renderIcon(src, purpose as IconPurpose, size);
  await keepDrawn(key, png).catch(() => {});
  return png;
}
