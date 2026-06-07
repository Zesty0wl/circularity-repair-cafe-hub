<script lang="ts">
  import '../app.css';
  // Self-hosted brand fonts (Fraunces display + Mulish body). Bundled from
  // node_modules so they load offline and comply with the app's CSP.
  import '@fontsource-variable/fraunces/index.css';
  import '@fontsource-variable/mulish/index.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth';
  import { cafe, loadCafe, loadSetupStatus } from '$lib/stores/cafe';
  import { applyBrandColor } from '$lib/brand';
  import { api } from '$lib/api';

  let booted = false;

  onMount(async () => {
    const completed = await loadSetupStatus();
    if (!completed && !$page.url.pathname.startsWith('/setup')) {
      goto('/setup', { replaceState: true });
      booted = true;
      return;
    }
    if (completed && $page.url.pathname === '/setup') {
      goto('/admin/dashboard', { replaceState: true });
    }
    if (completed) {
      await loadCafe();
      // Try silent refresh to restore session
      try {
        const body = await api<{ accessToken: string; user: any }>('/api/auth/refresh', {
          method: 'POST',
          autoRefresh: false,
        });
        auth.set({ accessToken: body.accessToken, user: body.user });
      } catch {
        // not authed
      }
    }
    booted = true;
  });

  // ── Derive SEO/meta values from the cafe profile. ───────────────
  // seoTitle/seoDescription override the defaults if set; otherwise we
  // synthesise from the cafe name + tagline/description.
  $: cafeName = $cafe?.name ?? 'Repair Cafe';
  // Re-theme the UI whenever the cafe's primary colour changes. A null/unset
  // colour falls back to the Circularity-teal defaults declared in app.css.
  $: applyBrandColor($cafe?.primaryColor);
  $: pageTitle = $cafe?.seoTitle?.trim() || ($cafe?.tagline ? `${cafeName} — ${$cafe.tagline}` : cafeName);
  $: metaDesc = $cafe?.seoDescription?.trim() || $cafe?.description || $cafe?.tagline || '';
  $: ogImage = $cafe?.ogImageUrl || $cafe?.bannerUrl || $cafe?.logoUrl || '';
  $: faviconHref = $cafe?.faviconUrl || '/favicon.svg';
  $: canonicalUrl = $page.url.origin + $page.url.pathname;
  // Plausible only loads when both fields are configured. Domain matches the
  // site name registered in Plausible; src is the script URL (e.g.
  // https://plausible.io/js/script.js or a self-hosted instance).
  $: plausibleEnabled = Boolean($cafe?.plausibleDomain && $cafe?.plausibleSrc);
</script>

<svelte:head>
  <title>{pageTitle}</title>
  {#if metaDesc}<meta name="description" content={metaDesc} />{/if}
  <link rel="icon" href={faviconHref} />
  <!-- Open Graph / Twitter -->
  <meta property="og:title" content={pageTitle} />
  {#if metaDesc}<meta property="og:description" content={metaDesc} />{/if}
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl} />
  {#if ogImage}<meta property="og:image" content={ogImage} />{/if}
  <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
  <link rel="canonical" href={canonicalUrl} />
  {#if plausibleEnabled}
    <script defer data-domain={$cafe?.plausibleDomain} src={$cafe?.plausibleSrc}></script>
  {/if}
</svelte:head>

{#if booted}
  <slot />
{:else}
  <div class="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>
{/if}
