// Category icon resolver
// ──────────────────────
// Skill categories store an `icon` string (legacy values are short kebab-case
// names like `cpu`, `plug`, `wrench` — originally Lucide IDs). To present a
// more polished, illustrative aesthetic on the public site we render via
// Iconify, which gives us access to large icon families (Fluent UI System
// Icons, Octicons, Material Design Icons) by string ID.
//
// Resolution rules:
//   1. If the stored value already contains ":" we treat it as a full Iconify
//      identifier (e.g. `fluent:laptop-24-regular`) and pass it through. This
//      lets admins paste any Iconify name in future without code changes.
//   2. Otherwise we look up the legacy short name in LEGACY_MAP below.
//   3. Unknown names fall back to a neutral tag icon.
//
// Icons are fetched from api.iconify.design on first render and cached in
// localStorage indefinitely by the Iconify runtime — see svelte.config.js
// where the host is added to the CSP `connect-src` allowlist.

const LEGACY_MAP: Record<string, string> = {
  // Fluent UI System Icons (rounded, filled-style — feels friendly and modern)
  'cpu': 'fluent:laptop-24-regular',
  'plug': 'fluent:plug-connected-24-regular',
  'armchair': 'fluent:chair-24-regular',
  'wrench': 'fluent:wrench-24-regular',
  'gem': 'fluent:diamond-24-regular',
  'book-open': 'fluent:book-24-regular',
  'help-circle': 'fluent:question-circle-24-regular',
  // Material Design Icons fill the Fluent gaps (no shirt/bike/toy in Fluent)
  'shirt': 'mdi:tshirt-crew-outline',
  'bike': 'mdi:bike',
  'toy-brick': 'mdi:toy-brick-outline',
};

const FALLBACK = 'fluent:tag-24-regular';

export function categoryIcon(name: string | null | undefined): string {
  if (!name) return FALLBACK;
  if (name.includes(':')) return name;
  return LEGACY_MAP[name] ?? FALLBACK;
}
