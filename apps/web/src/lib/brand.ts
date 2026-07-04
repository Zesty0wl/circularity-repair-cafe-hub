// Per-cafe brand theming.
//
// The Tailwind `brand` palette reads its channels from CSS custom properties
// (`--brand-50` … `--brand-900`) declared in app.css. Those defaults are the
// Circularity teal scale. When a cafe sets a custom `primaryColor`, we derive a
// full tint/shade scale from that single hex and override the variables at
// runtime so the whole UI re-themes — while every cafe that leaves it untouched
// inherits the Circularity brand.
//
// Two colours + two fonts are themeable per cafe:
//   • primaryColor → `--brand-*`   (links, headings, focus, text accents)
//   • accentColor  → `--accent-*`  (call-to-action buttons; falls back to the
//                                   brand colour when unset)
//   • headingFont  → `--font-display`   • bodyFont → `--font-sans`

import { FONT_STACKS, type FontChoice } from '@circularity/shared';

type RGB = [number, number, number];

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

// Tint fractions (mix toward white) for the light end and shade fractions (mix
// toward black) for the dark end. 500 is the chosen base colour. These match the
// teal defaults baked into app.css so an explicit teal and the default render
// identically.
const TINTS: ReadonlyArray<readonly [number, number]> = [
  [50, 0.92],
  [100, 0.84],
  [200, 0.7],
  [300, 0.54],
  [400, 0.32],
];
const SHADES: ReadonlyArray<readonly [number, number]> = [
  [600, 0.18],
  [700, 0.36],
  [800, 0.55],
  [900, 0.72],
];

function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Build a 50–900 scale from a single base hex, or null if the hex is invalid. */
export function brandScale(hex: string): Record<number, RGB> | null {
  const base = parseHex(hex);
  if (!base) return null;
  const scale: Record<number, RGB> = { 500: base };
  for (const [step, t] of TINTS) scale[step] = mix(base, WHITE, t);
  for (const [step, t] of SHADES) scale[step] = mix(base, BLACK, t);
  return scale;
}

/**
 * Apply a cafe's primary colour to the document, or clear the override so the
 * app.css Circularity-teal defaults take over when no/invalid colour is given.
 */
export function applyBrandColor(hex: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const scale = hex ? brandScale(hex) : null;
  if (!scale) {
    for (const step of STEPS) root.style.removeProperty(`--brand-${step}`);
    return;
  }
  for (const step of STEPS) {
    const [r, g, b] = scale[step];
    root.style.setProperty(`--brand-${step}`, `${r} ${g} ${b}`);
  }
}

/**
 * Apply the accent (call-to-action) colour to `--accent-*`. When no accent is
 * set the buttons follow the brand colour, so we fall back to the primary hex;
 * if neither is valid we clear the override and app.css defaults apply.
 */
export function applyAccentColor(
  hex: string | null | undefined,
  fallback?: string | null,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const scale = (hex ? brandScale(hex) : null) ?? (fallback ? brandScale(fallback) : null);
  if (!scale) {
    for (const step of STEPS) root.style.removeProperty(`--accent-${step}`);
    return;
  }
  for (const step of STEPS) {
    const [r, g, b] = scale[step];
    root.style.setProperty(`--accent-${step}`, `${r} ${g} ${b}`);
  }
}

function fontStack(choice: string | null | undefined): string | null {
  return choice && choice in FONT_STACKS ? FONT_STACKS[choice as FontChoice] : null;
}

/** Point the display/body font CSS variables at the chosen typefaces. */
export function applyFonts(
  headingFont: string | null | undefined,
  bodyFont: string | null | undefined,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const display = fontStack(headingFont);
  const body = fontStack(bodyFont);
  if (display) root.style.setProperty('--font-display', display);
  else root.style.removeProperty('--font-display');
  if (body) root.style.setProperty('--font-sans', body);
  else root.style.removeProperty('--font-sans');
}

export interface BrandingSource {
  primaryColor?: string | null;
  accentColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
}

/** Apply every per-cafe branding override (colours + fonts) at once. */
export function applyBranding(cafe: BrandingSource | null | undefined): void {
  applyBrandColor(cafe?.primaryColor ?? null);
  applyAccentColor(cafe?.accentColor ?? null, cafe?.primaryColor ?? null);
  applyFonts(cafe?.headingFont ?? null, cafe?.bodyFont ?? null);
}

/**
 * Build a `:root { … }` CSS string of only the per-cafe overrides, for
 * inlining during SSR so the first paint is already themed (no flash of the
 * default Circularity palette before hydration). Returns '' when nothing is
 * customised.
 */
export function brandingCss(cafe: BrandingSource | null | undefined): string {
  const decls: string[] = [];
  const primary = cafe?.primaryColor ? brandScale(cafe.primaryColor) : null;
  if (primary) for (const s of STEPS) decls.push(`--brand-${s}:${primary[s].join(' ')}`);
  const accent =
    (cafe?.accentColor ? brandScale(cafe.accentColor) : null) ??
    (cafe?.primaryColor ? brandScale(cafe.primaryColor) : null);
  if (accent) for (const s of STEPS) decls.push(`--accent-${s}:${accent[s].join(' ')}`);
  const display = fontStack(cafe?.headingFont);
  if (display) decls.push(`--font-display:${display}`);
  const body = fontStack(cafe?.bodyFont);
  if (body) decls.push(`--font-sans:${body}`);
  // NB: `:root:root:root` (not a single `:root`). Tailwind v3 compiles the
  // app.css `@layer base { :root { … } }` defaults down to a PLAIN, unlayered
  // `:root{}` rule, and the app stylesheet <link> is emitted AFTER this inline
  // <style> in the head — so a single `:root` here would tie on specificity and
  // LOSE to the later stylesheet, showing the default teal/Fraunces for one
  // paint before hydration swapped it (the flash). Repeating the selector lifts
  // specificity above the stylesheet so the cafe's colours/fonts win from the
  // very first paint. Runtime element styles set by applyBranding still override
  // this (inline element styles beat any selector), so live re-theming works.
  return decls.length ? `:root:root:root{${decls.join(';')}}` : '';
}
