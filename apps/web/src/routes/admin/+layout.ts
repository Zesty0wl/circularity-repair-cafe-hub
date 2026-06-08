// Operational area — no SEO value, relies on client-only auth state. Opt out of
// SSR so it renders entirely on the client (as the whole app did before the
// switch to genuine SSR for the public marketing pages).
export const ssr = false;
