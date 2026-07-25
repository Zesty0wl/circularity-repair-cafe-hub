// =============================================================================
//  Progressive web app helpers
//  ---------------------------------------------------------------------------
//  Shared so the manifest (built by the server) and the iOS <head> tags
//  (rendered by the web app) always agree on the app's name.
// =============================================================================

/** Longest name a home screen label can show before it is cut off anyway. */
const MAX_SHORT_NAME = 24;

/**
 * A name short enough to sit under a home screen icon.
 *
 * Most cafes are called "Repair Café <place>", and the place is the part that
 * tells two of them apart, so we lead with it when there is one. Anything
 * still too long is cut at a word boundary rather than mid-word.
 */
export function shortAppName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  const place = trimmed.replace(/^repair\s+caf[eé]\s*/i, '').trim();
  const candidate = place || trimmed || 'Repair Café';
  if (candidate.length <= MAX_SHORT_NAME) return candidate;

  const cut = candidate.slice(0, MAX_SHORT_NAME);
  const lastSpace = cut.lastIndexOf(' ');
  // Only break at a space if it leaves something recognisable behind.
  return (lastSpace > 8 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
