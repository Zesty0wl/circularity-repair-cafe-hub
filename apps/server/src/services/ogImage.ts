// =============================================================================
//  Social sharing images
//  ---------------------------------------------------------------------------
//  When a page is pasted into Facebook, WhatsApp, Slack or a group chat, the
//  preview picture is the first thing anyone sees. Using one picture for the
//  whole site makes every link look the same, so nobody can tell an events page
//  from a repair guide.
//
//  This draws a card per section instead: the cafe's own colour and name, and
//  the name of the section, at the 1200x630 that every platform expects. Pages
//  that have a real photograph worth showing (a volunteer's portrait, a repair
//  guide's opening shot) keep the photograph. These cards are for the pages
//  that have no picture of their own.
//
//  Cards are drawn once and cached on disk under a hash of everything they are
//  made from, so changing the cafe's colour or name quietly produces new ones.
// =============================================================================
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { env } from '../env.js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Circularity teal, used when a cafe has not chosen a colour. */
const DEFAULT_COLOUR = '#1B6B5A';

/**
 * The one font we can rely on being installed (see the Dockerfile). Text is
 * drawn by the SVG renderer, which reads fonts from the system rather than
 * from the web app, so this cannot be the site's own typeface.
 */
const FONT = 'DejaVu Sans';

export interface CardContent {
  /** The big line, e.g. "Repair guides". */
  title: string;
  /** A quieter line under it, e.g. the next session date. Optional. */
  subtitle?: string | null;
}

export interface CardBranding {
  cafeName: string;
  primaryColor: string | null;
  accentColor: string | null;
}

function safeColour(hex: string | null | undefined, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test((hex ?? '').trim()) ? (hex as string).trim() : fallback;
}

/** Escape text so a name containing & or < cannot break the drawing. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Break text into lines that fit.
 *
 * We have no way to measure the font here, so this counts characters. The
 * limits are set well inside what fits, which is why a long word is allowed to
 * run on rather than being broken mid-word.
 */
function wrap(text: string, charsPerLine: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= charsPerLine || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Show that something was cut rather than ending mid-sentence.
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!;
    const used = lines.join(' ').length;
    if (used < text.length && last.length > 1) {
      lines[maxLines - 1] = `${last.replace(/[,.;:]$/, '')}…`;
    }
  }
  return lines;
}

function darken(hex: string, amount: number): string {
  const int = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((int >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((int >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((int & 255) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function buildSvg(content: CardContent, brand: CardBranding): string {
  const primary = safeColour(brand.primaryColor, DEFAULT_COLOUR);
  const accent = safeColour(brand.accentColor, primary);
  const deep = darken(primary, 0.55);

  const titleLines = wrap(content.title, 24, 3);
  const subtitleLines = content.subtitle ? wrap(content.subtitle, 52, 2) : [];

  // Push the block up when there are more lines, so it stays optically centred.
  const titleTop = 250 - (titleLines.length - 1) * 34;
  const titleSpans = titleLines
    .map(
      (line, i) =>
        `<tspan x="96" y="${titleTop + i * 88}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  const subtitleTop = titleTop + titleLines.length * 88 + 22;
  const subtitleSpans = subtitleLines
    .map(
      (line, i) =>
        `<tspan x="96" y="${subtitleTop + i * 46}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${deep}"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <circle cx="1075" cy="120" r="300" fill="#ffffff" opacity="0.05"/>
  <circle cx="1160" cy="560" r="190" fill="#ffffff" opacity="0.04"/>
  <rect x="0" y="${OG_HEIGHT - 14}" width="${OG_WIDTH}" height="14" fill="${accent}"/>
  <text x="96" y="118" font-family="${FONT}" font-size="30" font-weight="bold"
        fill="#ffffff" opacity="0.72" letter-spacing="3">${escapeXml(
          brand.cafeName.toUpperCase(),
        )}</text>
  <text font-family="${FONT}" font-size="76" font-weight="bold" fill="#ffffff">${titleSpans}</text>
  ${
    subtitleSpans
      ? `<text font-family="${FONT}" font-size="36" fill="#ffffff" opacity="0.8">${subtitleSpans}</text>`
      : ''
  }
</svg>`;
}

function cardDir(): string {
  return path.join(env.UPLOADS_DIR, 'og');
}

/** Everything the card is drawn from, so a change produces a new file. */
function cardHash(content: CardContent, brand: CardBranding): string {
  const key = [
    content.title,
    content.subtitle ?? '',
    brand.cafeName,
    brand.primaryColor ?? '',
    brand.accentColor ?? '',
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * The card as a PNG, drawing it only if this exact one has not been drawn
 * before. Returns null if the drawing fails, so a page can fall back to the
 * cafe's own picture rather than advertising a broken image.
 */
export async function renderCard(
  content: CardContent,
  brand: CardBranding,
): Promise<Buffer | null> {
  const file = path.join(cardDir(), `${cardHash(content, brand)}.png`);
  try {
    return await fs.readFile(file);
  } catch {
    // Not drawn yet.
  }

  try {
    const png = await sharp(Buffer.from(buildSvg(content, brand)))
      .png({ compressionLevel: 9 })
      .toBuffer();
    await fs.mkdir(cardDir(), { recursive: true });
    await fs.writeFile(file, png);
    return png;
  } catch {
    return null;
  }
}
