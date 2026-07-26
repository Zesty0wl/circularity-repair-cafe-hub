import { writable, derived } from 'svelte/store';
import { api } from '../api';

export interface HomePageContent {
  intro?: { heading?: string; body?: string };
  howItWorks?: Array<{ title: string; body: string }>;
  whatToBring?: { heading?: string; body?: string };
  faqs?: Array<{ q: string; a: string }>;
  showStats?: boolean;
  showEventStats?: boolean;
}

export interface GalleryImage {
  id: string;
  url: string;
  caption: string | null;
  /** Set when the photo came from a session, so we can link back to it. */
  eventId?: string | null;
  eventName?: string | null;
  eventDate?: string | null;
}

export interface CafeInfo {
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  address: string | null;
  socialLinks: Record<string, string>;
  homePage: HomePageContent;
  gallery: GalleryImage[];
  primaryColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  donateUrl: string | null;
  // SEO + analytics (all optional)
  faviconUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  plausibleDomain: string | null;
  plausibleSrc: string | null;
  /** Slug of this cafe's own listing on repaircafe.org, when it has one. */
  repaircafeSlug: string | null;
  // Hash of the branding the home screen icons are built from. Used to point
  // the apple-touch-icon at the current, immutable icon file.
  pwaIconVersion?: string | null;
}

export const cafe = writable<CafeInfo | null>(null);

export async function loadCafe(): Promise<void> {
  try {
    const c = await api<CafeInfo>('/api/public/cafe');
    cafe.set(c);
  } catch {
    cafe.set(null);
  }
}

export const setupCompleted = writable<boolean | null>(null);

export async function loadSetupStatus(): Promise<boolean> {
  try {
    const res = await api<{ setupCompleted: boolean }>('/api/setup/status');
    setupCompleted.set(res.setupCompleted);
    return res.setupCompleted;
  } catch {
    setupCompleted.set(false);
    return false;
  }
}
