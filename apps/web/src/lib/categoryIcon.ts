// Category icon resolver
// ──────────────────────
// Skill categories store an `icon` string (legacy values are short kebab-case
// names like `cpu`, `plug`, `wrench`, originally Lucide IDs). To present a
// more polished, illustrative aesthetic on the public site we render via
// Iconify, which gives us access to large icon families (Fluent UI System
// Icons, Material Design Icons) by string ID.
//
// Resolution rules, in order:
//   1. If the stored value already contains ":" we treat it as a full Iconify
//      identifier (e.g. `fluent:laptop-24-regular`) and pass it through. This
//      is the only deliberate per-cafe choice, so it always wins.
//   2. Otherwise, if the category name matches a keyword we know, use that.
//      The seed data gives several categories the same generic icon (Clocks
//      and Musical Instruments both ship as `wrench`), and there is no icon
//      picker in the admin area yet, so the name is the better signal.
//   3. Otherwise fall back to the legacy short name.
//   4. Otherwise a neutral tag icon.
//
// Icons are fetched from api.iconify.design on first render and cached in
// localStorage indefinitely by the Iconify runtime. See svelte.config.js
// where the host is added to the CSP `connect-src` allowlist.

const LEGACY_MAP: Record<string, string> = {
  // Fluent UI System Icons (rounded, friendly, modern)
  'cpu': 'fluent:laptop-24-regular',
  'plug': 'fluent:plug-connected-24-regular',
  'wrench': 'fluent:wrench-24-regular',
  'gem': 'fluent:diamond-24-regular',
  'book-open': 'fluent:book-24-regular',
  'help-circle': 'fluent:question-circle-24-regular',
  // Material Design Icons fill the Fluent gaps (no shirt, bike, sofa or toy)
  'armchair': 'mdi:sofa-outline',
  'shirt': 'mdi:tshirt-crew-outline',
  'bike': 'mdi:bike',
  'toy-brick': 'mdi:toy-brick-outline',
  'clock': 'mdi:clock-outline',
  'music': 'mdi:guitar-acoustic',
  'lamp': 'mdi:lamp-outline',
  'camera': 'mdi:camera-outline',
  'phone': 'mdi:cellphone',
  'printer': 'mdi:printer-outline',
  'washing-machine': 'mdi:washing-machine',
  'tools': 'mdi:hammer-wrench',
  'watch': 'mdi:watch',
};

// Keyword → icon, checked against the category name in the order listed. The
// first keyword found anywhere in the lower-cased name wins, so put the more
// specific words first ("sewing machine" before "machine").
const NAME_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['clock', 'mdi:clock-outline'],
  ['watch', 'mdi:watch'],
  ['music', 'mdi:guitar-acoustic'],
  ['instrument', 'mdi:guitar-acoustic'],
  ['guitar', 'mdi:guitar-acoustic'],
  ['bicycle', 'mdi:bike'],
  ['bike', 'mdi:bike'],
  ['furniture', 'mdi:sofa-outline'],
  ['wood', 'mdi:sofa-outline'],
  ['cloth', 'mdi:tshirt-crew-outline'],
  ['textile', 'mdi:tshirt-crew-outline'],
  ['sewing', 'mdi:tshirt-crew-outline'],
  ['jewel', 'fluent:diamond-24-regular'],
  ['book', 'fluent:book-24-regular'],
  ['paper', 'fluent:book-24-regular'],
  ['toy', 'mdi:toy-brick-outline'],
  ['garden', 'mdi:hammer-wrench'],
  ['tool', 'mdi:hammer-wrench'],
  ['lamp', 'mdi:lamp-outline'],
  ['light', 'mdi:lamp-outline'],
  ['camera', 'mdi:camera-outline'],
  ['phone', 'mdi:cellphone'],
  ['printer', 'mdi:printer-outline'],
  ['computer', 'fluent:laptop-24-regular'],
  ['laptop', 'fluent:laptop-24-regular'],
  ['electronic', 'fluent:laptop-24-regular'],
  ['appliance', 'fluent:plug-connected-24-regular'],
  ['electrical', 'fluent:plug-connected-24-regular'],
];

const FALLBACK = 'fluent:tag-24-regular';

/**
 * Resolve the Iconify ID for a skill category.
 *
 * @param icon          the category's stored `icon` value
 * @param categoryName  the category's display name, used when the stored icon
 *                      is a generic seed value
 */
export function categoryIcon(icon: string | null | undefined, categoryName?: string | null): string {
  if (icon && icon.includes(':')) return icon;

  if (categoryName) {
    const lower = categoryName.toLowerCase();
    for (const [keyword, id] of NAME_HINTS) {
      if (lower.includes(keyword)) return id;
    }
  }

  if (!icon) return FALLBACK;
  return LEGACY_MAP[icon] ?? FALLBACK;
}

/**
 * Turn a category colour into a soft background wash. Every tile then shares
 * one lightness, so a grid of categories reads as one set while each keeps its
 * own hue. Returns a plain rgba() string, or a neutral tint if the colour is
 * missing or not a 6-digit hex.
 */
export function categoryTint(hex: string | null | undefined, alpha = 0.14): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgb(100 116 139 / ${alpha})`;
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
}

/**
 * The glyph colour to draw on top of `categoryTint`. Light category colours
 * (yellows, limes) have too little contrast against their own wash, so we
 * darken every colour by the same amount. That keeps each category's hue and
 * still clears the 3:1 contrast floor for meaningful graphics.
 */
export function categoryInk(hex: string | null | undefined, darken = 0.35): string {
  const rgb = parseHex(hex);
  if (!rgb) return 'rgb(51 65 85)';
  const k = 1 - darken;
  return `rgb(${Math.round(rgb[0] * k)} ${Math.round(rgb[1] * k)} ${Math.round(rgb[2] * k)})`;
}

function parseHex(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim());
  if (!m) return null;
  const int = parseInt(m[1]!, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}
