// =============================================================================
//  Repairer sharing cards
//  ---------------------------------------------------------------------------
//  A volunteer can share their profile to invite people to the next session.
//  The card is the invitation: their portrait, their name, what they fix,
//  what else people can bring, and when and where the next session is.
//
//  Three looks are offered, picked with ?style= on the image URL. The web app
//  shows all three and lets the volunteer choose one before sharing.
//
//  Each card is drawn in three layers, because the portrait is a photograph
//  that has to sit between the background and the footer band:
//    1. the background and the main text, drawn as SVG
//    2. the portrait, cropped and corner-rounded with sharp
//    3. the footer band and its text, drawn as SVG on top
//  Cards are cached on disk under a hash of everything they are made from,
//  the same way the section cards in ogImage.ts are.
// =============================================================================
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import type { ShareCardStyle } from '@circularity/shared';
import { env } from '../env.js';
import {
  OG_WIDTH,
  OG_HEIGHT,
  DEFAULT_COLOUR,
  FONT,
  type CardBranding,
  safeColour,
  escapeXml,
  wrap,
  darken,
} from './ogImage.js';

/** Fixed page colours, matching `paper` and `ink` in the web app's Tailwind config. */
const PAPER = '#FBF7EF';
const INK = '#1C2622';

export interface RepairerCardData {
  displayName: string;
  /** Where the portrait lives on disk. Null draws initials instead. */
  avatarPath: string | null;
  /** What this volunteer fixes, as category names. */
  skills: string[];
  /** The cafe's other active categories, so the card can say what else to bring. */
  otherSkills: string[];
  /** The next session, already put into words. Null when none is planned. */
  event: { dateLine: string; venueLine: string } | null;
  brand: CardBranding;
}

/**
 * Turn a stored avatar path or URL into a path on disk.
 * Returns null for an empty value or a full web address, because those cannot
 * be read from the uploads folder. The card then falls back to initials.
 */
export function avatarDiskPath(stored: string | null | undefined): string | null {
  const value = (stored ?? '').trim();
  if (!value || /^https?:\/\//i.test(value)) return null;
  const relative = value
    .replace(/^\/?uploads\//, '')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '');
  return relative ? path.join(env.UPLOADS_DIR, relative) : null;
}

/** "a, b and c", or "a, b, c and more" when the list was cut short. */
function listWords(items: string[], max: number): string {
  const shown = items.slice(0, max).map((s) => s.trim()).filter(Boolean);
  if (!shown.length) return '';
  if (items.length > max) return `${shown.join(', ')} and more`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/**
 * "a · b · c". Category names often contain "and" ("Lamps and lights"), so
 * joining them with another "and" would blur where one ends and the next
 * starts. Dots keep each one whole.
 */
function dotList(items: string[], max: number): string {
  const shown = items.slice(0, max).map((s) => s.trim()).filter(Boolean);
  return shown.join(' · ') + (items.length > max ? ' and more' : '');
}

/**
 * Shrink a font until the longest line fits its column. wrap() lets a long
 * single word run past the limit rather than breaking it, so a name like
 * "Featherstonehaugh-Smythe" needs a smaller size, not a clipped edge.
 */
function fitFont(lines: string[], charsPerLine: number, size: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return longest > charsPerLine ? Math.max(Math.floor((size * charsPerLine) / longest), 28) : size;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!)
    .join('')
    .toUpperCase();
}

function spans(lines: string[], x: number, top: number, lineHeight: number): string {
  return lines
    .map((line, i) => `<tspan x="${x}" y="${top + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
}

/** Where the portrait goes, and how round its corners are. */
interface PortraitBox {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

interface Layout {
  base: string;
  overlay: string;
  portrait: PortraitBox | null;
}

/** The wording every style shares, worked out once. */
interface CardText {
  eyebrow: string;
  nameLines: (chars: number, lines: number) => string[];
  fixes: string;
  bring: string;
  footEyebrow: string;
  footLine1: string;
  footLine2: string;
  monogram: string;
}

function cardText(data: RepairerCardData): CardText {
  return {
    eyebrow: data.brand.cafeName.toUpperCase(),
    nameLines: (chars, lines) => wrap(data.displayName, chars, lines),
    fixes: data.skills.length ? `Fixes: ${dotList(data.skills, 4)}` : 'Volunteer repairer',
    bring: data.otherSkills.length
      ? `You can also bring ${listWords(data.otherSkills, 5)}`
      : '',
    footEyebrow: data.event ? 'NEXT SESSION' : 'REPAIR SESSIONS',
    footLine1: data.event ? data.event.dateLine : 'New dates are announced soon',
    footLine2: data.event?.venueLine ?? '',
    monogram: initials(data.displayName),
  };
}

/** The footer band with the session details, shared by all three styles. */
function footer(opts: {
  bandTop: number;
  bandFill: string;
  bandOpacity?: number;
  seamFill: string;
  /** Colour of the big date line. */
  textFill: string;
  /** Colour of the small line above it. */
  eyebrowFill: string;
  eyebrowOpacity?: number;
  /** Colour of the venue line and the small right-hand tag. */
  mutedFill: string;
  mutedOpacity?: number;
  text: CardText;
}): string {
  const { bandTop, text } = opts;
  const bandOpacity = opts.bandOpacity ?? 1;
  const eyebrowOpacity = opts.eyebrowOpacity ?? 1;
  const mutedOpacity = opts.mutedOpacity ?? 1;
  const line1 = wrap(text.footLine1, 52, 1)[0] ?? '';
  const line2 = wrap(text.footLine2, 66, 1)[0] ?? '';
  return `
  <rect x="0" y="${bandTop - 6}" width="${OG_WIDTH}" height="6" fill="${opts.seamFill}"/>
  <rect x="0" y="${bandTop}" width="${OG_WIDTH}" height="${OG_HEIGHT - bandTop}" fill="${opts.bandFill}" opacity="${bandOpacity}"/>
  <text x="84" y="${bandTop + 44}" font-family="${FONT}" font-size="21" font-weight="bold"
        fill="${opts.eyebrowFill}" opacity="${eyebrowOpacity}" letter-spacing="2">${escapeXml(text.footEyebrow)}</text>
  <text x="84" y="${bandTop + 86}" font-family="${FONT}" font-size="33" font-weight="bold"
        fill="${opts.textFill}">${escapeXml(line1)}</text>
  ${
    line2
      ? `<text x="84" y="${bandTop + 120}" font-family="${FONT}" font-size="25"
        fill="${opts.mutedFill}" opacity="${mutedOpacity}">${escapeXml(line2)}</text>`
      : ''
  }
  <text x="${OG_WIDTH - 84}" y="${bandTop + 86}" font-family="${FONT}" font-size="22"
        fill="${opts.mutedFill}" opacity="${mutedOpacity}" text-anchor="end">Free community repairs</text>`;
}

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">${body}</svg>`;
}

// ── Classic: light and friendly, portrait beside the name ────────────────────
function classicLayout(data: RepairerCardData, hasPortrait: boolean): Layout {
  const primary = safeColour(data.brand.primaryColor, DEFAULT_COLOUR);
  const accent = safeColour(data.brand.accentColor, primary);
  const text = cardText(data);
  const box: PortraitBox = { left: 84, top: 150, width: 256, height: 256, radius: 44 };

  const nameLines = text.nameLines(19, 2);
  const nameSize = fitFont(nameLines, 19, 62);
  let y = 210;
  const nameSpans = spans(nameLines, 380, y, 70);
  y += (nameLines.length - 1) * 70 + 54;
  const fixesLines = wrap(text.fixes, 38, 2);
  const fixesSpans = spans(fixesLines, 380, y, 42);
  y += (fixesLines.length - 1) * 42 + 46;
  const bringSpans = text.bring ? spans(wrap(text.bring, 50, 2), 380, y, 34) : '';

  const monogram = hasPortrait
    ? ''
    : `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" rx="${box.radius}" fill="${primary}"/>
       <text x="${box.left + box.width / 2}" y="${box.top + box.height / 2 + 34}" font-family="${FONT}" font-size="96"
             font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(text.monogram)}</text>`;

  const base = svg(`
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${PAPER}"/>
  <circle cx="1120" cy="40" r="220" fill="${primary}" opacity="0.06"/>
  <circle cx="30" cy="470" r="150" fill="${accent}" opacity="0.08"/>
  <text x="84" y="96" font-family="${FONT}" font-size="26" font-weight="bold"
        fill="${primary}" letter-spacing="3">${escapeXml(text.eyebrow)}</text>
  ${monogram}
  <text font-family="${FONT}" font-size="${nameSize}" font-weight="bold" fill="${INK}">${nameSpans}</text>
  <text font-family="${FONT}" font-size="31" font-weight="bold" fill="${primary}">${fixesSpans}</text>
  ${bringSpans ? `<text font-family="${FONT}" font-size="25" fill="${INK}" opacity="0.66">${bringSpans}</text>` : ''}`);

  const overlay = svg(
    footer({
      bandTop: 480,
      bandFill: primary,
      seamFill: accent,
      textFill: '#ffffff',
      eyebrowFill: '#ffffff',
      eyebrowOpacity: 0.7,
      mutedFill: '#ffffff',
      mutedOpacity: 0.85,
      text,
    }),
  );

  return { base, overlay, portrait: hasPortrait ? box : null };
}

// ── Bold: the cafe's colours edge to edge, portrait in a ring ────────────────
function boldLayout(data: RepairerCardData, hasPortrait: boolean): Layout {
  const primary = safeColour(data.brand.primaryColor, DEFAULT_COLOUR);
  const accent = safeColour(data.brand.accentColor, primary);
  const deep = darken(primary, 0.55);
  const text = cardText(data);
  const box: PortraitBox = { left: 796, top: 80, width: 340, height: 340, radius: 170 };

  const nameLines = text.nameLines(17, 2);
  const nameSize = fitFont(nameLines, 17, 64);
  let y = 226;
  const nameSpans = spans(nameLines, 84, y, 72);
  y += (nameLines.length - 1) * 72 + 52;
  const fixesLines = wrap(text.fixes, 36, 2);
  const fixesSpans = spans(fixesLines, 84, y, 40);
  y += (fixesLines.length - 1) * 40 + 44;
  const bringSpans = text.bring ? spans(wrap(text.bring, 46, 2), 84, y, 32) : '';

  const monogram = hasPortrait
    ? ''
    : `<circle cx="966" cy="250" r="170" fill="#ffffff" opacity="0.12"/>
       <text x="966" y="288" font-family="${FONT}" font-size="110" font-weight="bold"
             fill="#ffffff" text-anchor="middle">${escapeXml(text.monogram)}</text>`;

  const base = svg(`
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${deep}"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <circle cx="1075" cy="580" r="260" fill="#ffffff" opacity="0.04"/>
  <text x="84" y="96" font-family="${FONT}" font-size="26" font-weight="bold"
        fill="#ffffff" opacity="0.72" letter-spacing="3">${escapeXml(text.eyebrow)}</text>
  <rect x="84" y="132" width="64" height="8" rx="4" fill="${accent}"/>
  ${monogram}
  <text font-family="${FONT}" font-size="${nameSize}" font-weight="bold" fill="#ffffff">${nameSpans}</text>
  <text font-family="${FONT}" font-size="31" font-weight="bold" fill="#ffffff" opacity="0.95">${fixesSpans}</text>
  ${bringSpans ? `<text font-family="${FONT}" font-size="24" fill="#ffffff" opacity="0.75">${bringSpans}</text>` : ''}`);

  const ring = hasPortrait
    ? `<circle cx="966" cy="250" r="172" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.95"/>`
    : '';
  const overlay = svg(`
  ${ring}
  ${footer({
    bandTop: 484,
    bandFill: '#ffffff',
    seamFill: accent,
    textFill: INK,
    eyebrowFill: primary,
    mutedFill: '#5B6662',
    text,
  })}`);

  return { base, overlay, portrait: hasPortrait ? box : null };
}

// ── Photo: the portrait fills the right half of the card ─────────────────────
function photoLayout(data: RepairerCardData, hasPortrait: boolean): Layout {
  const primary = safeColour(data.brand.primaryColor, DEFAULT_COLOUR);
  const accent = safeColour(data.brand.accentColor, primary);
  const deep = darken(primary, 0.5);
  const text = cardText(data);
  const box: PortraitBox = { left: 720, top: 0, width: 480, height: OG_HEIGHT, radius: 0 };

  const nameLines = text.nameLines(17, 2);
  const nameSize = fitFont(nameLines, 17, 58);
  let y = 232;
  const nameSpans = spans(nameLines, 84, y, 66);
  y += (nameLines.length - 1) * 66 + 52;
  const fixesLines = wrap(text.fixes, 34, 2);
  const fixesSpans = spans(fixesLines, 84, y, 40);
  y += (fixesLines.length - 1) * 40 + 44;
  const bringSpans = text.bring ? spans(wrap(text.bring, 42, 2), 84, y, 32) : '';

  const monogram = hasPortrait
    ? ''
    : `<rect x="${box.left}" y="0" width="${box.width}" height="${OG_HEIGHT}" fill="${primary}"/>
       <text x="960" y="378" font-family="${FONT}" font-size="180" font-weight="bold"
             fill="#ffffff" opacity="0.95" text-anchor="middle">${escapeXml(text.monogram)}</text>`;

  const base = svg(`
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${deep}"/>
  <text x="84" y="96" font-family="${FONT}" font-size="26" font-weight="bold"
        fill="#ffffff" opacity="0.7" letter-spacing="3">${escapeXml(text.eyebrow)}</text>
  <rect x="84" y="132" width="64" height="8" rx="4" fill="${accent}"/>
  ${monogram}
  <text font-family="${FONT}" font-size="${nameSize}" font-weight="bold" fill="#ffffff">${nameSpans}</text>
  <text font-family="${FONT}" font-size="29" font-weight="bold" fill="#ffffff">${fixesSpans}</text>
  ${bringSpans ? `<text font-family="${FONT}" font-size="24" fill="#ffffff" opacity="0.72">${bringSpans}</text>` : ''}`);

  // The seam melts the left edge of the photograph into the text panel, so
  // the two halves read as one picture rather than a picture and a sidebar.
  const overlay = svg(`
  <defs>
    <linearGradient id="seam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${deep}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${deep}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${hasPortrait ? `<rect x="${box.left}" y="0" width="160" height="${OG_HEIGHT}" fill="url(#seam)"/>` : ''}
  ${footer({
    bandTop: 500,
    bandFill: darken(primary, 0.75),
    bandOpacity: 0.9,
    seamFill: accent,
    textFill: '#ffffff',
    eyebrowFill: '#ffffff',
    eyebrowOpacity: 0.75,
    mutedFill: '#ffffff',
    mutedOpacity: 0.8,
    text,
  })}`);

  return { base, overlay, portrait: hasPortrait ? box : null };
}

const LAYOUTS: Record<ShareCardStyle, (data: RepairerCardData, hasPortrait: boolean) => Layout> = {
  classic: classicLayout,
  bold: boldLayout,
  photo: photoLayout,
};

function cardDir(): string {
  return path.join(env.UPLOADS_DIR, 'og');
}

/**
 * Raise this when the drawing code changes, so cards cached on disk from the
 * old code are drawn again. The data alone cannot tell the difference.
 */
const RENDER_VERSION = 2;

/** Everything the card is drawn from, so any change produces a new file. */
function cardHash(data: RepairerCardData, style: ShareCardStyle): string {
  const key = [
    `repairer-v${RENDER_VERSION}`,
    style,
    data.displayName,
    data.avatarPath ?? '',
    data.skills.join(','),
    data.otherSkills.join(','),
    data.event?.dateLine ?? '',
    data.event?.venueLine ?? '',
    data.brand.cafeName,
    data.brand.primaryColor ?? '',
    data.brand.accentColor ?? '',
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/** The portrait, cropped to fit its box and with its corners rounded. */
async function portraitLayer(filePath: string, box: PortraitBox): Promise<Buffer> {
  let img = await sharp(filePath)
    .rotate()
    // Crop from the centre, exactly like the profile page shows the same
    // photo (CSS object-cover). What a volunteer sees on their profile is
    // what appears on their card, and re-uploading a tighter photo fixes
    // both at once.
    .resize(box.width, box.height, { fit: 'cover' })
    .png()
    .toBuffer();
  if (box.radius > 0) {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}"><rect width="${box.width}" height="${box.height}" rx="${box.radius}" ry="${box.radius}" fill="#ffffff"/></svg>`,
    );
    img = await sharp(img).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }
  return img;
}

/**
 * The card as a PNG, drawing it only if this exact one has not been drawn
 * before. Returns null if the drawing fails, so the route can answer 404
 * rather than serving a broken image.
 */
export async function renderRepairerCard(
  data: RepairerCardData,
  style: ShareCardStyle,
): Promise<Buffer | null> {
  const file = path.join(cardDir(), `repairer-${cardHash(data, style)}.png`);
  try {
    return await fs.readFile(file);
  } catch {
    // Not drawn yet.
  }

  try {
    // Make sure the portrait can actually be read before laying the card out,
    // because a missing or unreadable file should fall back to initials
    // rather than leaving an empty hole.
    const hasPortrait = data.avatarPath
      ? await sharp(data.avatarPath)
          .metadata()
          .then(() => true)
          .catch(() => false)
      : false;

    const layout = LAYOUTS[style](data, hasPortrait);
    const layers: sharp.OverlayOptions[] = [];
    if (layout.portrait && data.avatarPath) {
      layers.push({
        input: await portraitLayer(data.avatarPath, layout.portrait),
        left: layout.portrait.left,
        top: layout.portrait.top,
      });
    }
    layers.push({ input: Buffer.from(layout.overlay), left: 0, top: 0 });

    const png = await sharp(Buffer.from(layout.base))
      .composite(layers)
      .png({ compressionLevel: 9 })
      .toBuffer();
    await fs.mkdir(cardDir(), { recursive: true });
    await fs.writeFile(file, png);
    return png;
  } catch {
    return null;
  }
}
