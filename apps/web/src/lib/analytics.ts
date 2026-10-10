// =============================================================================
//  Counting what visitors do, with Quick Web Analytics
//  ---------------------------------------------------------------------------
//  Pages call track('donate') and the like. Nothing is sent unless the cafe
//  uses QWA and has that event turned on under Settings, SEO & analytics.
//
//  The QWA script loads after the page, so early calls wait in a queue. The
//  script reads that queue when it starts. Page views go through here too
//  (see +layout.svelte), so the secret part of some addresses can be hidden
//  first.
// =============================================================================
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { QWA_EVENTS, redactAnalyticsPath, type QwaEventKey } from '@circularity/shared';
import { cafe } from '$lib/stores/cafe';

type Props = Record<string, string | number | boolean>;
type QwaFn = ((name: string, options?: { props?: Props; url?: string }) => void) & { q?: unknown[][] };

/** window.qwa, or a stand-in that queues calls until the script is ready. */
function qwa(): QwaFn {
  const w = window as unknown as { qwa?: QwaFn };
  if (!w.qwa) {
    const queue: QwaFn = (...args) => {
      (queue.q = queue.q ?? []).push(args);
    };
    w.qwa = queue;
  }
  return w.qwa;
}

function usingQwa(): boolean {
  return browser && get(cafe)?.analyticsProvider === 'qwa';
}

/** Count one thing a visitor did, if this cafe counts it. */
export function track(key: QwaEventKey, props?: Props): void {
  if (!usingQwa()) return;
  const c = get(cafe);
  if (!c?.qwaEvents?.includes(key)) return;
  const event = QWA_EVENTS.find((e) => e.key === key);
  if (!event) return;
  try {
    qwa()(event.name, props ? { props } : undefined);
  } catch {
    /* analytics must never break the page */
  }
}

/** Count a page view, with any secret part of the address hidden. */
export function trackPageview(url: URL): void {
  if (!usingQwa()) return;
  try {
    qwa()('pageview', { url: url.origin + redactAnalyticsPath(url.pathname) + url.search });
  } catch {
    /* analytics must never break the page */
  }
}
