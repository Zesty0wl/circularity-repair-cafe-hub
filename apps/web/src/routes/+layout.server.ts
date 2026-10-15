import type { LayoutServerLoad } from './$types';

// Hand the language resolved in hooks.server.ts to the app, so the layout can
// set it before the page draws.
export const load: LayoutServerLoad = ({ locals }) => {
  return { locale: locals.locale ?? 'en' };
};
