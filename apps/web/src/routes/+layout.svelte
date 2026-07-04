<script lang="ts">
  import '../app.css';
  // Self-hosted brand fonts. Every selectable family is bundled from
  // node_modules so they load offline and comply with the app's CSP; the
  // cafe's font choice just repoints the --font-* CSS variables.
  import '@fontsource-variable/fraunces/index.css';
  import '@fontsource-variable/mulish/index.css';
  import '@fontsource-variable/hanken-grotesk/index.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth';
  import { cafe, setupCompleted } from '$lib/stores/cafe';
  import { applyBranding, brandingCss } from '$lib/brand';
  import { api } from '$lib/api';
  import { serializeJsonLd, type PageSeo } from '@circularity/shared';
  import type { LayoutData } from './$types';

  export let data: LayoutData;

  // Keep the module-level stores in sync with the (server-)loaded data so the
  // many child components that read $cafe keep working. The cafe is a
  // per-deployment singleton (one row), so writing it during SSR is safe —
  // every concurrent request resolves to the same value. The auth store is the
  // opposite: it is per-user and is therefore ONLY ever set on the client
  // (see onMount) so it can never leak between SSR requests.
  $: cafe.set(data.cafe);
  $: setupCompleted.set(data.setupCompleted);

  // Re-theme the UI whenever the cafe's branding changes. Unset colours/fonts
  // fall back to the Circularity defaults declared in app.css. Guarded to the
  // browser because applyBranding touches document; SSR is covered by the
  // inline <style> below so the first paint is already themed (no flash).
  $: if (browser) applyBranding(data.cafe);
  $: brandStyle = brandingCss(data.cafe);

  onMount(async () => {
    // Restore the session — client-only (see note above about the auth store).
    try {
      const body = await api<{ accessToken: string; user: any }>('/api/auth/refresh', {
        method: 'POST',
        autoRefresh: false,
      });
      auth.set({ accessToken: body.accessToken, user: body.user });
    } catch {
      // not authed
    }
  });

  // ── SEO/meta — centralised here so every route emits exactly one of each ──
  // tag (SvelteKit only de-dupes <title>, not <meta>). Public pages return a
  // per-route `seo` from their load (see packages/shared buildSeo); the layout
  // renders it, falling back to cafe-derived defaults for routes without one.
  $: c = data.cafe;
  $: cafeName = c?.name ?? 'Repair Café';
  $: seo = ($page.data as { seo?: PageSeo }).seo ?? null;
  $: origin = $page.url.origin;
  $: pageTitle = seo?.title || c?.seoTitle?.trim() || cafeName;
  $: metaDesc = seo?.description || c?.seoDescription?.trim() || c?.description || c?.tagline || '';
  $: ogType = seo?.ogType || 'website';
  // og:image must be absolute for crawlers/social cards.
  $: ogImageRaw = seo?.ogImage || c?.ogImageUrl || c?.bannerUrl || c?.logoUrl || '';
  $: ogImage = ogImageRaw ? (/^https?:\/\//i.test(ogImageRaw) ? ogImageRaw : origin + ogImageRaw) : '';
  $: faviconHref = c?.faviconUrl || '/favicon.svg';
  $: canonicalUrl = seo?.canonical || origin + $page.url.pathname;
  // Operational areas (admin/check-in/etc.) carry no SEO value and are already
  // blocked in robots.txt; emit noindex too as defence in depth.
  $: operational = /^\/(admin|checkin|repairer|login|reset|setup|track)(\/|$)/.test($page.url.pathname);
  $: noindex = seo?.noindex === true || operational;
  $: jsonLdScript = serializeJsonLd(seo?.jsonLd ?? null);
  // Plausible only loads when both fields are configured. Domain matches the
  // site name registered in Plausible; src is the script URL (e.g.
  // https://plausible.io/js/script.js or a self-hosted instance).
  $: plausibleEnabled = Boolean(c?.plausibleDomain && c?.plausibleSrc);
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <!-- Inline the per-cafe branding CSS variables during SSR so the first paint
       is already themed (no flash of the default palette). The tag name is
       assembled at runtime so Svelte's preprocessor does not mistake this for
       the component's own scoped style block and try to compile it as CSS. -->
  {#if brandStyle}{@html `<${'style'}>${brandStyle}</${'style'}>`}{/if}
  {#if metaDesc}<meta name="description" content={metaDesc} />{/if}
  {#if noindex}<meta name="robots" content="noindex, nofollow" />{/if}
  <link rel="icon" href={faviconHref} />
  <!-- Open Graph / Twitter -->
  <meta property="og:title" content={pageTitle} />
  {#if metaDesc}<meta property="og:description" content={metaDesc} />{/if}
  <meta property="og:type" content={ogType} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:site_name" content={cafeName} />
  {#if ogImage}<meta property="og:image" content={ogImage} />{/if}
  <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
  <link rel="canonical" href={canonicalUrl} />
  <!-- Structured data (schema.org @graph) for the current route. -->
  {#if jsonLdScript}{@html jsonLdScript}{/if}
  {#if plausibleEnabled}
    <script defer data-domain={c?.plausibleDomain} src={c?.plausibleSrc}></script>
  {/if}
</svelte:head>

<slot />
