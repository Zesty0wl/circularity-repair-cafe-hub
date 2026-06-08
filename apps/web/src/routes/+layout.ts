import { redirect } from '@sveltejs/kit';
import type { CafeInfo } from '$lib/stores/cafe';
import type { LayoutLoad } from './$types';

// Public pages are server-rendered (adapter-node). Operational areas opt out of
// SSR via their own +layout.ts (export const ssr = false) — they have no SEO
// value and rely on client-only auth state.
export const prerender = false;
export const trailingSlash = 'never';

// Universal load: runs on the server for SSR pages and on the client for
// client-only (ssr=false) routes + client-side navigations. Provides the cafe
// profile and setup status the whole app needs.
export const load: LayoutLoad = async ({ fetch, url }) => {
  let setupCompleted = false;
  try {
    const res = await fetch('/api/setup/status');
    if (res.ok) {
      const body = (await res.json()) as { setupCompleted?: boolean };
      setupCompleted = Boolean(body.setupCompleted);
    }
  } catch {
    /* treat as not-set-up */
  }

  // Before setup is finished the only reachable area is the wizard.
  if (!setupCompleted && !url.pathname.startsWith('/setup')) {
    throw redirect(307, '/setup');
  }
  // Once set up, the wizard route bounces to the admin dashboard.
  if (setupCompleted && url.pathname === '/setup') {
    throw redirect(307, '/admin/dashboard');
  }

  let cafe: CafeInfo | null = null;
  if (setupCompleted) {
    try {
      const res = await fetch('/api/public/cafe');
      if (res.ok) cafe = (await res.json()) as CafeInfo;
    } catch {
      /* leave cafe null; the UI falls back to defaults */
    }
  }

  return { setupCompleted, cafe };
};
