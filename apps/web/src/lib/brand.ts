// Per-cafe brand theming.
//
// The Tailwind `brand` palette reads its channels from CSS custom properties
// (`--brand-50` … `--brand-900`) declared in app.css. Those defaults are the
// Circularity teal scale. When a cafe sets a custom `primaryColor`, we derive a
// full tint/shade scale from that single hex and override the variables at
// runtime so the whole UI re-themes — while every cafe that leaves it untouched
// inherits the Circularity brand.

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
