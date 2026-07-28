<script lang="ts">
  import '../app.css';
  // Self-hosted brand fonts. Every selectable family is bundled from
  // node_modules so they load offline and comply with the app's CSP; the
  // cafe's font choice just repoints the --font-* CSS variables.
  import '@fontsource-variable/fraunces/index.css';
  import '@fontsource-variable/mulish/index.css';
  import '@fontsource-variable/hanken-grotesk/index.css';
  import { onMount } from 'svelte';
  import { browser, dev } from '$app/environment';
  import { page } from '$app/stores';
  import { cafe, setupCompleted } from '$lib/stores/cafe';
  import { applyBranding, brandingCss } from '$lib/brand';
  import { restoreSession } from '$lib/api';
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';
  import { serializeJsonLd, shortAppName, type PageSeo } from '@circularity/shared';
  import type { LayoutData } from './$types';
  import DemoBanner from '$lib/components/DemoBanner.svelte';

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

  onMount(() => {
    // Restore the session, client-only (see note above about the auth store).
    // Protected layouts await the same promise before they redirect to
    // /login, so a page refresh no longer bounces signed-in users there.
    restoreSession();

    // Register the service worker that makes the app installable. Production
    // only: in development it would serve cached files back and hide the
    // changes you just made.
    if (!dev && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {
        /* an install offer is optional; never break the page over it */
      });
    }

    // Some Plausible scripts wait to be told to start. See startPlausible.
    if (plausibleEnabled) startPlausible();
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
  // A demo site is full of made-up cafes, events and repairs, so none of it
  // should ever reach a search result. robots.txt already refuses the whole
  // site; this is the same thing said again on the page itself.
  $: noindex = seo?.noindex === true || operational || c?.demoMode === true;
  $: jsonLdScript = serializeJsonLd(seo?.jsonLd ?? null);
  // Plausible only loads when both fields are configured. Domain matches the
  // site name registered in Plausible; src is the script URL (e.g.
  // https://plausible.io/js/script.js or a self-hosted instance).
  $: plausibleEnabled = Boolean(c?.plausibleDomain && c?.plausibleSrc);

  /**
   * Start Plausible when it needs starting.
   *
   * Plausible ships two kinds of script and they behave differently:
   *
   *  - The classic one (`/js/script.js`) reads the site name from the
   *    `data-domain` attribute and records a page view on its own.
   *  - The newer per-site one (`/js/pa-<id>.js`) has the site name and the
   *    endpoint built into it, but it does nothing at all until something
   *    calls `plausible.init()`. Paste that URL in on its own and no visit is
   *    ever recorded, with no error to say why.
   *
   * So we ask it to start, which is what the second kind needs and what the
   * first kind has already done for itself. Doing it from here rather than
   * from a tag in the page keeps it inside our own bundle, so the strict
   * content security policy needs no exception for inline scripts.
   */
  function startPlausible(): void {
    let attempts = 0;
    const tick = () => {
      const p = (window as { plausible?: { l?: boolean; init?: () => void } }).plausible;
      if (p) {
        // `l` means it is already running. Only the newer script exposes an
        // `init` that has not been called yet.
        if (!p.l && typeof p.init === 'function') p.init();
        return;
      }
      // The tag is deferred, so it may not have run yet. Give it a few
      // seconds, then let it go: analytics is never worth a busy loop.
      if (++attempts < 50) setTimeout(tick, 100);
    };
    tick();
  }

  // ── Progressive web app ───────────────────────────────────────────────────
  // The manifest and the icons are built per cafe by the server. The icon
  // filename carries a hash of the branding, so it changes whenever the logo
  // or the colour does.
  $: themeColor = c?.primaryColor?.trim() || '#1B6B5A';
  $: appleTouchIcon = c?.pwaIconVersion ? `/icons/any-${c.pwaIconVersion}-192.png` : null;
  // Same helper the server uses to build the manifest, so iOS and Android
  // never end up labelling the same install differently.
  $: appShortName = shortAppName(cafeName);
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
  <!-- Progressive web app: installable, themed with the cafe's own colour. -->
  <meta name="theme-color" content={themeColor} />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="mobile-web-app-capable" content="yes" />
  <!-- iOS reads its own tags rather than the manifest. -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content={appShortName} />
  {#if appleTouchIcon}<link rel="apple-touch-icon" href={appleTouchIcon} />{/if}
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

<DemoBanner show={c?.demoMode === true} />

<slot />

<InstallPrompt />
