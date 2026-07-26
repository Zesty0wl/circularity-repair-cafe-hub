/**
 * Repair guides, as our server hands them to us.
 *
 * The guides come from iFixit. Our server proxies and caches them, so this is
 * a same-origin request. See apps/server/src/services/ifixit.ts.
 */

export interface GuideSummary {
  id: number;
  title: string;
  category: string | null;
  subject: string | null;
  difficulty: string | null;
  summary: string | null;
  timeRequired: string | null;
  thumbnail: string | null;
  image: string | null;
  url: string;
}

export interface GuideStep {
  title: string | null;
  lines: Array<{ text: string; bullet: string }>;
  images: string[];
}

export interface GuideDetail extends GuideSummary {
  introduction: string | null;
  conclusion: string | null;
  tools: string[];
  parts: string[];
  steps: GuideStep[];
}

export interface GuideSearchResult {
  guides: GuideSummary[];
  moreResults: boolean;
  query: string;
}

/**
 * Things people actually carry into a Repair Café, as starting points.
 *
 * iFixit indexes by device, so these are device names rather than the cafe's
 * own skill categories. They give someone something to press before they have
 * thought of what to type.
 */
export const POPULAR_TOPICS: string[] = [
  'Laptop',
  'Phone',
  'Vacuum cleaner',
  'Headphones',
  'Coffee maker',
  'Toaster',
  'Game console',
  'Camera',
  'Bicycle',
  'Sewing machine',
  'Power tool',
  'Speaker',
  'Printer',
  'Watch',
  'Kettle',
  'Lamp',
];

/** How hard iFixit says a repair is, and a colour to show it in. */
export function difficultyTone(difficulty: string | null): string {
  switch ((difficulty ?? '').toLowerCase()) {
    case 'very easy':
    case 'easy':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    case 'moderate':
      return 'bg-amber-50 text-amber-900 ring-amber-200';
    case 'difficult':
    case 'very difficult':
      return 'bg-rose-50 text-rose-900 ring-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

/**
 * The colour iFixit gives a step line. Red and orange mean take care, so they
 * keep their meaning here rather than all becoming plain text.
 */
export function bulletTone(bullet: string): string {
  if (bullet.startsWith('red')) return 'border-rose-400 bg-rose-50/60';
  if (bullet.startsWith('orange')) return 'border-amber-400 bg-amber-50/60';
  if (bullet.startsWith('yellow')) return 'border-yellow-400 bg-yellow-50/60';
  if (bullet.startsWith('green')) return 'border-emerald-400 bg-emerald-50/60';
  if (bullet.startsWith('blue')) return 'border-sky-400 bg-sky-50/60';
  if (bullet.startsWith('violet') || bullet.startsWith('purple')) {
    return 'border-violet-400 bg-violet-50/60';
  }
  return 'border-slate-300';
}
