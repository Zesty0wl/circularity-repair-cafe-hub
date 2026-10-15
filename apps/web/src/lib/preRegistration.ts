// =============================================================================
//  Remembering a pre-registration on the visitor's phone
//  ---------------------------------------------------------------------------
//  When a visitor pre-registers an item, their tracking token is kept in this
//  browser, one entry per session. Two pages use it:
//    - the pre-register form, so a second item joins the first one
//    - the check-in page on the day, so the visitor can check in everything
//      they pre-registered with one tap after scanning the QR code
//  Storage can be missing or blocked (private browsing), so every read and
//  write is allowed to fail. The tracking link still works without it.
// =============================================================================

export interface SavedPreRegistration {
  customerToken: string;
  customerName: string;
  savedAt: number;
}

/** Long enough for a session booked well in advance. */
const KEEP_MS = 120 * 24 * 60 * 60 * 1000;

function key(eventId: string): string {
  return `repair-cafe:prereg:${eventId}`;
}

export function loadPreRegistration(eventId: string): SavedPreRegistration | null {
  try {
    const raw = localStorage.getItem(key(eventId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedPreRegistration;
    if (!saved.customerToken || !saved.savedAt || Date.now() - saved.savedAt > KEEP_MS) {
      localStorage.removeItem(key(eventId));
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function savePreRegistration(eventId: string, saved: SavedPreRegistration): void {
  try {
    localStorage.setItem(key(eventId), JSON.stringify(saved));
  } catch {
    /* storage is full or blocked: the tracking link still works */
  }
}

export function forgetPreRegistration(eventId: string): void {
  try {
    localStorage.removeItem(key(eventId));
  } catch {
    /* nothing to do */
  }
}
