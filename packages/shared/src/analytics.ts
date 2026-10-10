// =============================================================================
//  Web analytics
//  ---------------------------------------------------------------------------
//  A cafe can count its visitors with one of two privacy-friendly services:
//
//   - Plausible (plausible.io, or a copy on the cafe's own server)
//   - Quick Web Analytics, "QWA" (a cookie-free tracker, also self-hostable)
//
//  Only one runs at a time. Both scripts answer to window.plausible, so
//  loading the two together would mix up their counts.
//
//  QWA can also count a few things people do on the site, such as checking an
//  item in. Each of these "events" can be turned on or off in the admin area.
//  Shared so the server (which checks what is saved) and the web app (which
//  draws the settings and sends the events) agree on the list.
// =============================================================================

export const ANALYTICS_PROVIDERS = ['none', 'plausible', 'qwa'] as const;
export type AnalyticsProvider = (typeof ANALYTICS_PROVIDERS)[number];

/** The things QWA can count. `name` is what shows in the QWA dashboard. */
export const QWA_EVENTS = [
  {
    key: 'checkin',
    name: 'Item Check-in',
    label: 'Item checked in',
    help: 'A visitor finishes checking in an item. Also records the kind of item.',
  },
  {
    key: 'donate',
    name: 'Donate',
    label: 'Donate link',
    help: 'Someone opens your donation page.',
  },
  {
    key: 'calendar',
    name: 'Add to Calendar',
    label: 'Add to calendar',
    help: 'Someone saves one of your sessions to their calendar.',
  },
  {
    key: 'directions',
    name: 'Get Directions',
    label: 'Directions and maps',
    help: 'Someone opens directions, a map or a what3words link for a venue.',
  },
  {
    key: 'contact',
    name: 'Contact Email',
    label: 'Contact email',
    help: 'Someone clicks your contact email address.',
  },
  {
    key: 'install',
    name: 'Install App',
    label: 'App installed',
    help: 'Someone adds your site to their home screen.',
  },
  {
    key: 'outbound',
    name: 'Outbound Link: Click',
    label: 'Links to other sites',
    help: 'Someone follows a link to another website. QWA counts these for you.',
  },
  {
    key: 'downloads',
    name: 'File Download',
    label: 'File downloads',
    help: 'Someone downloads a file, such as a PDF. QWA counts these for you.',
  },
] as const;

export type QwaEventKey = (typeof QWA_EVENTS)[number]['key'];

/** Every event is on until an admin turns it off. */
export const DEFAULT_QWA_EVENTS: QwaEventKey[] = QWA_EVENTS.map((e) => e.key);

/** The settings that decide which analytics script a page loads. */
export interface AnalyticsSettings {
  analyticsProvider?: string | null;
  plausibleDomain?: string | null;
  plausibleSrc?: string | null;
  qwaSite?: string | null;
  qwaSrc?: string | null;
}

/**
 * Which service is actually running.
 *
 * Hubs from before QWA have no provider saved. For them, Plausible runs when
 * both of its fields are filled in, exactly as it always did. The same is true
 * of a backup from an older hub restored onto a newer one.
 *
 * A service with missing fields counts as off, so a half-finished form never
 * loads a broken script.
 */
export function activeAnalytics(s: AnalyticsSettings | null | undefined): AnalyticsProvider {
  if (!s) return 'none';
  const plausibleReady = Boolean(s.plausibleDomain && s.plausibleSrc);
  const qwaReady = Boolean(s.qwaSite && s.qwaSrc);
  switch (s.analyticsProvider) {
    case 'qwa':
      return qwaReady ? 'qwa' : 'none';
    case 'plausible':
      return plausibleReady ? 'plausible' : 'none';
    case 'none':
      return 'none';
    default:
      return plausibleReady ? 'plausible' : 'none';
  }
}

/** Keep only the event keys we know, once each. Null means "the defaults". */
export function cleanQwaEvents(value: unknown): QwaEventKey[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const known = new Set<string>(DEFAULT_QWA_EVENTS);
  return [...new Set(value.filter((v): v is QwaEventKey => typeof v === 'string' && known.has(v)))];
}

/** The events that are on. A hub that never chose gets every one. */
export function enabledQwaEvents(value: unknown): QwaEventKey[] {
  return cleanQwaEvents(value) ?? [...DEFAULT_QWA_EVENTS];
}

/**
 * The site name as QWA and Plausible expect it: a bare host name, such as
 * repaircafe.example.org. Admins often paste a whole address, so take the host
 * out of one.
 */
export function cleanSiteDomain(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const host = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/)[0]!
    .toLowerCase();
  return host || null;
}

/**
 * Hide the secret part of links that carry one before they reach analytics.
 *
 * A visitor's tracking page, the check-in page, the waiting-room screen and
 * the password reset page all have a token in the address. Anyone who has the
 * token can open the page, so it must not be stored in somebody else's
 * analytics.
 */
export function redactAnalyticsPath(path: string): string {
  return path.replace(/^\/(track|checkin|display|reset)\/[^/]+/, '/$1/_');
}
