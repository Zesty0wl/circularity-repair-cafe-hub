<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { loadCafe } from '$lib/stores/cafe';
  import { FONT_OPTIONS } from '@circularity/shared';
  import { Trash2, Plus, Download, Upload, AlertTriangle } from 'lucide-svelte';
  import ImageDropzone from '$lib/components/ImageDropzone.svelte';
  import GalleryManager from '$lib/components/GalleryManager.svelte';
  import type { ManagedPhoto } from '$lib/gallery';
  import { MAX_LOCAL_CAFES, formatDistance, repairCafeOrgUrl, type LocalCafe } from '$lib/localCafes';
  import TelemetryChoice from '$lib/components/TelemetryChoice.svelte';

  let cafe: any = null;
  let busy = false;
  type Tab = 'profile' | 'home' | 'linux' | 'gallery' | 'local' | 'maps' | 'preferences' | 'seo' | 'gdpr' | 'telemetry' | 'backup' | 'about';
  let tab: Tab = 'profile';

  $: isSuperAdmin = $auth?.user.role === 'super_admin';

  // ─── Backup & restore state ───
  let backupInfo: { appVersion: string; backupFormatVersion: number; confirmPhrase: string } | null = null;
  let backupBusy = false;
  let backupDownloadError = '';
  let restoreFile: FileList | null = null;
  let restorePhrase = '';
  let restoreBusy = false;
  let restoreError = '';
  let restoreInfo = '';
  let logoFile: FileList | null = null;
  let bannerFile: FileList | null = null;
  let faviconFile: FileList | null = null;
  let ogFile: FileList | null = null;

  // Home-page editable content (loaded from cafe.homePage)
  type Step = { title: string; body: string };
  type Faq = { q: string; a: string };
  let intro = { heading: '', body: '' };
  let howItWorks: Step[] = [];
  let whatToBring = { heading: '', body: '' };
  let faqs: Faq[] = [];
  // Show the headline numbers (repairs, CO2 saved, volunteers) on the home page.
  let showStats = false;
  // Show what happened at each session on its own page in Past events.
  let showEventStats = true;

  // ── Linux Repair Cafe ─────────────────────────────────────────────
  // Off unless an admin turns it on. Everything below is the wording of the
  // page that switch turns on, in the same shape as the home page above.
  let linuxEnabled = false;
  let linuxNavLabel = '';
  let linuxHero = { heading: '', tagline: '' };
  let linuxIntro = { heading: '', body: '' };
  let linuxHowItWorks: Step[] = [];
  let linuxWhatToBring = { heading: '', body: '' };
  let linuxFaqs: Faq[] = [];
  let linuxHomeCard = { heading: '', body: '', ctaLabel: '' };
  let linuxShowStats = true;
  let linuxSaved = false;

  async function saveLinux() {
    busy = true;
    linuxSaved = false;
    try {
      const linuxPage = {
        navLabel: linuxNavLabel || '',
        hero: { heading: linuxHero.heading || '', tagline: linuxHero.tagline || '' },
        intro: { heading: linuxIntro.heading || '', body: linuxIntro.body || '' },
        howItWorks: linuxHowItWorks.filter((s) => s.title || s.body),
        whatToBring: { heading: linuxWhatToBring.heading || '', body: linuxWhatToBring.body || '' },
        faqs: linuxFaqs.filter((f) => f.q || f.a),
        homeCard: {
          heading: linuxHomeCard.heading || '',
          body: linuxHomeCard.body || '',
          ctaLabel: linuxHomeCard.ctaLabel || '',
        },
        showStats: linuxShowStats,
      };
      await api('/api/admin/settings/linux', {
        method: 'PATCH',
        json: { linuxEnabled, linuxPage },
      });
      linuxSaved = true;
      // Reload the shared cafe profile so the menu item appears or disappears
      // straight away, rather than after the next full page load.
      await loadCafe();
      await load();
    } finally { busy = false; }
  }

  // Gallery
  let gallery: ManagedPhoto[] = [];

  // ── Sharing our numbers with the project ──────────────────────────
  let telemetry: {
    level: 'none' | 'standard' | 'community';
    lastSentAt: string | null;
    disabledByEnv: boolean;
    verified: boolean | null;
    verifyReason: string | null;
  } | null = null;
  let telemetryLevel: 'none' | 'standard' | 'community' = 'none';
  let telemetryPayload: unknown = null;
  let telemetryMsg = '';
  let telemetryErr = '';
  let telemetryLoaded = false;

  async function loadTelemetry() {
    try {
      telemetry = await api('/api/admin/telemetry');
      telemetryLevel = telemetry?.level ?? 'none';
      // The real payload, built from this cafe's own data. The whole point is
      // that nobody has to take our word for what leaves the building.
      const preview = await api<{ payload: unknown }>('/api/admin/telemetry/preview');
      telemetryPayload = preview?.payload ?? null;
      telemetryErr = '';
    } catch (err: any) {
      telemetryErr = err?.message ?? 'Could not read the telemetry settings';
    } finally {
      telemetryLoaded = true;
    }
  }

  async function saveTelemetry() {
    busy = true; telemetryMsg = ''; telemetryErr = '';
    try {
      const res = await api<{ sent: boolean; error: string | null }>('/api/admin/telemetry', {
        method: 'PATCH', json: { level: telemetryLevel },
      });
      telemetryMsg = telemetryLevel === 'none'
        ? 'Saved. Nothing more will be sent.'
        : res.sent ? 'Saved and sent. Thank you.' : 'Saved. We could not reach the collector just now, so it will try again later.';
      await loadTelemetry();
    } catch (err: any) {
      telemetryErr = err?.message ?? 'Could not save';
    } finally { busy = false; }
  }

  async function forgetTelemetry() {
    if (!confirm('Ask the project to delete everything it holds about this cafe, and stop sending?')) return;
    busy = true; telemetryMsg = ''; telemetryErr = '';
    try {
      await api('/api/admin/telemetry/forget', { method: 'POST', json: {} });
      telemetryMsg = 'Deleted. Nothing more will be sent.';
      await loadTelemetry();
    } catch (err: any) {
      telemetryErr = err?.message ?? 'Could not reach the collector';
    } finally { busy = false; }
  }

  $: if (tab === 'telemetry' && !telemetryLoaded) void loadTelemetry();

  // ── Neighbouring cafes we know and support ────────────────────────
  let localQuery = '';
  let localResults: LocalCafe[] = [];
  let localChosen: LocalCafe[] = [];
  let localSelected: string[] = [];
  let localAnchor: { name: string; lat: number; lng: number } | null = null;
  let localMax = MAX_LOCAL_CAFES;
  let localLoading = false;
  let localError = '';
  let localSaved = false;
  let localSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let localLoadedOnce = false;

  async function loadLocalCafes() {
    localLoading = true;
    try {
      const res = await api<{
        anchor: { name: string; lat: number; lng: number } | null;
        max: number;
        selected: string[];
        chosen: LocalCafe[];
        results: LocalCafe[];
      }>(`/api/admin/local-cafes?q=${encodeURIComponent(localQuery)}`);
      localAnchor = res.anchor;
      localMax = res.max ?? MAX_LOCAL_CAFES;
      localSelected = res.selected ?? [];
      localChosen = res.chosen ?? [];
      localResults = res.results ?? [];
      localError = '';
      localLoadedOnce = true;
    } catch (err: any) {
      localError = err?.message ?? 'Could not reach the Repair Café directory';
    } finally {
      localLoading = false;
    }
  }

  /** Wait for a pause in typing before searching, so each key is not a call. */
  function onLocalSearch() {
    if (localSearchTimer) clearTimeout(localSearchTimer);
    localSearchTimer = setTimeout(() => void loadLocalCafes(), 300);
  }

  function toggleLocalCafe(cafe: LocalCafe, checked: boolean) {
    if (!cafe.slug) return;
    localSaved = false;
    if (checked) {
      if (localSelected.includes(cafe.slug) || localSelected.length >= localMax) return;
      localSelected = [...localSelected, cafe.slug];
      localChosen = [...localChosen, cafe];
    } else {
      localSelected = localSelected.filter((s) => s !== cafe.slug);
      localChosen = localChosen.filter((c) => c.slug !== cafe.slug);
    }
  }

  async function saveLocalCafes() {
    busy = true;
    localError = '';
    try {
      await api('/api/admin/settings/local-cafes', { method: 'PATCH', json: { slugs: localSelected } });
      localSaved = true;
      await loadCafe();
    } catch (err: any) {
      localError = err?.message ?? 'Could not save your choices';
    } finally {
      busy = false;
    }
  }

  // Load the directory the first time the tab is opened, not on every page
  // load: it is the only part of Settings that talks to another service.
  $: if (tab === 'local' && !localLoadedOnce && !localLoading) {
    void loadLocalCafes();
  }

  // Brand colour — <input type="color"> requires #rrggbb. We normalise on load
  // and via the change handler so an empty/legacy value never reaches the
  // native control (which otherwise logs a console error).
  const DEFAULT_PRIMARY = '#1B6B5A';
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  function normaliseHex(v: unknown): string {
    return typeof v === 'string' && HEX_RE.test(v) ? v : DEFAULT_PRIMARY;
  }
  let primaryColorInput = DEFAULT_PRIMARY;

  // Accent (button) colour is optional — when disabled, call-to-action buttons
  // follow the brand colour. Font choices default to the Circularity typefaces
  // (empty string = use default).
  let accentEnabled = false;
  let accentColorInput = DEFAULT_PRIMARY;
  let headingFontInput = '';
  let bodyFontInput = '';

  async function load() {
    cafe = await api('/api/admin/settings');
    if (cafe) cafe.primaryColor = normaliseHex(cafe.primaryColor);
    primaryColorInput = normaliseHex(cafe?.primaryColor);
    accentEnabled = Boolean(cafe?.accentColor);
    accentColorInput = normaliseHex(cafe?.accentColor ?? cafe?.primaryColor);
    headingFontInput = cafe?.headingFont ?? '';
    bodyFontInput = cafe?.bodyFont ?? '';
    const hp = cafe?.homePage ?? {};
    intro = { heading: hp.intro?.heading ?? '', body: hp.intro?.body ?? '' };
    howItWorks = Array.isArray(hp.howItWorks) ? hp.howItWorks.map((s: any) => ({ title: s.title ?? '', body: s.body ?? '' })) : [];
    whatToBring = { heading: hp.whatToBring?.heading ?? '', body: hp.whatToBring?.body ?? '' };
    faqs = Array.isArray(hp.faqs) ? hp.faqs.map((f: any) => ({ q: f.q ?? '', a: f.a ?? '' })) : [];
    showStats = hp.showStats === true;
    // On unless it has been turned off, so cafes that saved their home page
    // before this setting existed still get the session summaries.
    showEventStats = hp.showEventStats !== false;

    linuxEnabled = cafe?.linuxEnabled === true;
    const lp = cafe?.linuxPage ?? {};
    linuxNavLabel = lp.navLabel ?? '';
    linuxHero = { heading: lp.hero?.heading ?? '', tagline: lp.hero?.tagline ?? '' };
    linuxIntro = { heading: lp.intro?.heading ?? '', body: lp.intro?.body ?? '' };
    linuxHowItWorks = Array.isArray(lp.howItWorks)
      ? lp.howItWorks.map((s: any) => ({ title: s.title ?? '', body: s.body ?? '' }))
      : [];
    linuxWhatToBring = { heading: lp.whatToBring?.heading ?? '', body: lp.whatToBring?.body ?? '' };
    linuxFaqs = Array.isArray(lp.faqs) ? lp.faqs.map((f: any) => ({ q: f.q ?? '', a: f.a ?? '' })) : [];
    linuxHomeCard = {
      heading: lp.homeCard?.heading ?? '',
      body: lp.homeCard?.body ?? '',
      ctaLabel: lp.homeCard?.ctaLabel ?? '',
    };
    linuxShowStats = lp.showStats !== false;
  }
  async function loadGallery() {
    gallery = await api<ManagedPhoto[]>('/api/admin/gallery');
  }
  onMount(async () => {
    await load();
    await loadGallery();
  });

  async function save() {
    busy = true;
    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        json: {
          name: cafe.name, tagline: cafe.tagline || null, description: cafe.description || null,
          contactEmail: cafe.contactEmail, contactPhone: cafe.contactPhone || null,
          publicUrl: cafe.publicUrl, primaryColor: normaliseHex(primaryColorInput),
          accentColor: accentEnabled ? normaliseHex(accentColorInput) : null,
          headingFont: headingFontInput || null,
          bodyFont: bodyFontInput || null,
          donateUrl: cafe.donateUrl || null,
          repaircafeSlug: cafe.repaircafeSlug || null,
          socialFacebook: cafe.socialFacebook || null, socialTwitter: cafe.socialTwitter || null,
          socialInstagram: cafe.socialInstagram || null,
        },
      });
      await loadCafe();
      await load();
    } finally { busy = false; }
  }

  async function savePrefs() {
    busy = true;
    try {
      await api('/api/admin/settings/preferences', {
        method: 'PATCH',
        json: {
          allowSkipPhoto: cafe.allowSkipPhoto,
          enableContactField: cafe.enableContactField,
          dataRetentionDays: cafe.dataRetentionDays,
        },
      });
      await load();
    } finally { busy = false; }
  }

  async function saveHome() {
    busy = true;
    try {
      const homePage = {
        intro: { heading: intro.heading || '', body: intro.body || '' },
        howItWorks: howItWorks.filter((s) => s.title || s.body),
        whatToBring: { heading: whatToBring.heading || '', body: whatToBring.body || '' },
        faqs: faqs.filter((f) => f.q || f.a),
        showStats,
        showEventStats,
      };
      await api('/api/admin/settings/home-page', { method: 'PATCH', json: { homePage } });
      await loadCafe();
      await load();
    } finally { busy = false; }
  }

  async function uploadAsset(kind: 'logo' | 'banner' | 'favicon' | 'og', files: FileList | null) {
    if (!files || !files[0]) return;
    const fd = new FormData();
    fd.append('image', files[0]);
    await api(`/api/admin/uploads/branding?kind=${kind}`, { method: 'POST', formData: fd });
    await loadCafe();
    await load();
  }

  async function saveSeo() {
    busy = true;
    try {
      await api('/api/admin/settings/seo', {
        method: 'PATCH',
        json: {
          seoTitle: cafe.seoTitle ?? null,
          seoDescription: cafe.seoDescription ?? null,
          plausibleDomain: cafe.plausibleDomain ?? null,
          plausibleSrc: cafe.plausibleSrc ?? null,
        },
      });
      await loadCafe();
      await load();
    } finally { busy = false; }
  }

  // ── Map background ────────────────────────────────────────────────
  // The cafe's CARTO key. Saved on its own so pasting a key does not touch
  // the list of chosen cafes, and the other way round.
  let mapsSaved = false;
  let mapsError = '';
  async function saveMaps() {
    busy = true;
    mapsSaved = false;
    mapsError = '';
    try {
      await api('/api/admin/settings/maps', {
        method: 'PATCH',
        json: { cartoApiKey: cafe.cartoApiKey ?? null },
      });
      mapsSaved = true;
      // The public maps read the key from the shared cafe profile, so refresh
      // it, and reload the form so a pasted address shows as the bare key.
      await loadCafe();
      await load();
    } catch (err) {
      mapsError = (err as Error).message || 'The key could not be saved. Please try again.';
    } finally { busy = false; }
  }

  // ── Gallery actions, handed to <GalleryManager> ──────────────────
  async function saveGalleryCaption(photo: ManagedPhoto, caption: string) {
    await api(`/api/admin/gallery/${photo.id}`, { method: 'PATCH', json: { caption } });
    await loadCafe();
  }
  async function deleteGalleryPhoto(photo: ManagedPhoto) {
    await api(`/api/admin/gallery/${photo.id}`, { method: 'DELETE' });
    await loadCafe();
  }
  async function reorderGallery(ids: string[]) {
    await api('/api/admin/gallery/reorder', { method: 'POST', json: { ids } });
    await loadCafe();
  }
  async function onGalleryUploaded() {
    await loadGallery();
    await loadCafe();
  }

  async function purgePii() {
    if (!confirm('Purge expired customer PII now? This cannot be undone.')) return;
    const res = await api<{ purged: number }>('/api/admin/repairs/purge-expired-pii', { method: 'POST', json: {} });
    alert(`Purged PII from ${res.purged} jobs.`);
  }

  async function loadBackupInfo() {
    if (!isSuperAdmin) return;
    try {
      backupInfo = await api('/api/admin/backup/info');
    } catch (err: any) {
      backupDownloadError = err?.message ?? 'Failed to load backup info';
    }
  }

  async function downloadBackup() {
    backupBusy = true;
    backupDownloadError = '';
    try {
      const state = get(auth);
      const res = await fetch('/api/admin/backup/download', {
        method: 'GET',
        headers: state?.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        let msg = res.statusText;
        try { const body = await res.json(); msg = body?.error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? 'circularity-backup.zip';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      backupDownloadError = err?.message ?? 'Backup failed';
    } finally {
      backupBusy = false;
    }
  }

  async function restoreBackupNow() {
    restoreError = '';
    restoreInfo = '';
    if (!restoreFile || restoreFile.length === 0) {
      restoreError = 'Choose a backup zip first.';
      return;
    }
    const expected = backupInfo?.confirmPhrase ?? 'WIPE AND RESTORE';
    if (restorePhrase !== expected) {
      restoreError = `Type the phrase exactly: ${expected}`;
      return;
    }
    const file = restoreFile[0];
    if (!confirm(`This will DELETE all current data and replace it with the contents of ${file.name}. The app will restart. Continue?`)) return;

    restoreBusy = true;
    try {
      const state = get(auth);
      const headers: Record<string, string> = {
        'Content-Type': 'application/zip',
        'X-Confirm-Wipe': expected,
      };
      if (state?.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
      const res = await fetch('/api/admin/backup/restore', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: file,
      });
      if (!res.ok) {
        let msg = res.statusText;
        try { const body = await res.json(); msg = body?.error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const body = await res.json();
      restoreInfo = `Restored backup from ${body?.manifest?.appVersion ?? 'unknown'} (${body?.manifest?.counts?.users ?? '?'} users, ${body?.manifest?.counts?.events ?? '?'} events). The app is restarting. You will need to sign back in.`;
      // The server restarts in ~1s; wait a bit longer then bounce to /login.
      setTimeout(() => { window.location.href = '/login'; }, 4000);
    } catch (err: any) {
      restoreError = err?.message ?? 'Restore failed';
    } finally {
      restoreBusy = false;
    }
  }

  $: if (tab === 'backup' && isSuperAdmin && !backupInfo) {
    void loadBackupInfo();
  }
</script>

<h1 class="text-2xl font-bold">Settings</h1>

<div class="mt-3 flex gap-2 flex-wrap">
  {#each [['profile','Cafe profile'],['home','Home page'],['linux','Linux Repair Cafe'],['gallery','Gallery'],['local','Local cafes'],['maps','Maps'],['preferences','Check-in & preferences'],['seo','SEO & analytics'],['gdpr','GDPR'],['telemetry','Sharing our numbers'], ...(isSuperAdmin ? [['backup','Backup & restore']] : []),['about','About']] as [key, label]}
    <button class="btn-{tab === key ? 'primary' : 'secondary'} btn-sm" on:click={() => (tab = key as Tab)}>{label}</button>
  {/each}
  <a href="/admin/settings/users" class="btn-secondary btn-sm">Users…</a>
</div>

{#if cafe}
  {#if tab === 'profile'}
    <div class="card p-6 mt-4 max-w-2xl space-y-4">
      <div><label class="label" for="cn">Cafe name</label><input id="cn" class="input" bind:value={cafe.name} /></div>
      <div><label class="label" for="tg">Tagline</label><input id="tg" class="input" bind:value={cafe.tagline} /></div>
      <div><label class="label" for="de">Short description</label><textarea id="de" class="input" rows="3" bind:value={cafe.description}></textarea><p class="text-xs text-slate-500 mt-1">Appears under the hero. For longer copy, use the Home page tab.</p></div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label class="label" for="em">Contact email</label><input id="em" class="input" type="email" bind:value={cafe.contactEmail} /></div>
        <div><label class="label" for="ph">Phone</label><input id="ph" class="input" bind:value={cafe.contactPhone} /></div>
      </div>
      <div><label class="label" for="pu">Public URL</label><input id="pu" class="input" bind:value={cafe.publicUrl} /><p class="text-xs text-slate-500 mt-1">Used in QR codes and public links. Must match your reverse-proxy domain.</p></div>
      <div>
        <label class="label" for="du">Donate link <span class="font-normal text-slate-500">(optional)</span></label>
        <input id="du" class="input" type="url" placeholder="https://www.justgiving.com/…" bind:value={cafe.donateUrl} />
        <p class="text-xs text-slate-500 mt-1">Shown to guests after they check in and on their live tracker. Leave blank to hide.</p>
      </div>
      <div>
        <label class="label" for="rc">Your page on repaircafe.org <span class="font-normal text-slate-500">(optional)</span></label>
        <input id="rc" class="input" placeholder="https://www.repaircafe.org/cafe/your-cafe" bind:value={cafe.repaircafeSlug} />
        <p class="text-xs text-slate-500 mt-1">
          Paste the address of your cafe's page on repaircafe.org. We use it to highlight you on the
          <a href="/world" class="text-brand-700 underline underline-offset-2" target="_blank" rel="noopener">world map</a>.
          Leave blank if you are not listed yet.
        </p>
      </div>
      <div>
        <label class="label" for="pc">Primary colour</label>
        <div class="flex items-center gap-3">
          <input
            id="pc"
            class="h-10 w-16 rounded-lg border border-slate-300 cursor-pointer p-1"
            type="color"
            value={primaryColorInput}
            on:input={(e) => (primaryColorInput = normaliseHex((e.currentTarget as HTMLInputElement).value))}
          />
          <input
            class="input w-32 font-mono"
            type="text"
            maxlength="7"
            placeholder="#1B6B5A"
            value={primaryColorInput}
            on:change={(e) => (primaryColorInput = normaliseHex((e.currentTarget as HTMLInputElement).value))}
          />
          <button type="button" class="btn-ghost btn-sm" on:click={() => (primaryColorInput = DEFAULT_PRIMARY)}>Reset</button>
        </div>
        <p class="text-xs text-slate-500 mt-1">Used for links, headings, focus states and text accents across your site. Leave at the Circularity default teal, or set your cafe's own colour. Stored as #rrggbb hex.</p>
      </div>
      <div>
        <span class="label">Accent / button colour</span>
        <label class="flex items-center gap-2 text-sm text-slate-700 mb-2">
          <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600" bind:checked={accentEnabled} />
          Use a separate colour for call-to-action buttons
        </label>
        {#if accentEnabled}
          <div class="flex items-center gap-3">
            <input
              id="ac"
              class="h-10 w-16 rounded-lg border border-slate-300 cursor-pointer p-1"
              type="color"
              value={accentColorInput}
              on:input={(e) => (accentColorInput = normaliseHex((e.currentTarget as HTMLInputElement).value))}
            />
            <input
              class="input w-32 font-mono"
              type="text"
              maxlength="7"
              placeholder="#ED6A42"
              value={accentColorInput}
              on:change={(e) => (accentColorInput = normaliseHex((e.currentTarget as HTMLInputElement).value))}
            />
          </div>
        {/if}
        <p class="text-xs text-slate-500 mt-1">Buttons use this colour instead of the brand colour. Useful when your brand colour is dark (best for text) but you want a brighter call-to-action. Keep button labels bold and 16px+ for contrast.</p>
      </div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label class="label" for="hf">Heading font</label>
          <select id="hf" class="input" bind:value={headingFontInput}>
            <option value="">Default (Fraunces)</option>
            {#each FONT_OPTIONS as f}<option value={f.value}>{f.label}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="bf">Body font</label>
          <select id="bf" class="input" bind:value={bodyFontInput}>
            <option value="">Default (Mulish)</option>
            {#each FONT_OPTIONS as f}<option value={f.value}>{f.label}</option>{/each}
          </select>
        </div>
      </div>
      <div class="grid sm:grid-cols-3 gap-3">
        <div><label class="label" for="fb">Facebook</label><input id="fb" class="input" bind:value={cafe.socialFacebook} /></div>
        <div><label class="label" for="tw">Twitter / X</label><input id="tw" class="input" bind:value={cafe.socialTwitter} /></div>
        <div><label class="label" for="ig">Instagram</label><input id="ig" class="input" bind:value={cafe.socialInstagram} /></div>
      </div>

      <div class="grid sm:grid-cols-2 gap-3 pt-2">
        <div>
          <span class="label">Logo</span>
          {#if cafe.logoUrl}<img src={cafe.logoUrl} alt="logo" class="h-16 mb-2 bg-slate-100 rounded-lg p-1" />{/if}
          <input type="file" accept="image/png,image/jpeg,image/webp" bind:files={logoFile} on:change={() => uploadAsset('logo', logoFile)} />
          <p class="text-xs text-slate-500 mt-1">Square works best. Shown in the header and on the home page hero.</p>
        </div>
        <div>
          <span class="label">Banner</span>
          {#if cafe.bannerUrl}<img src={cafe.bannerUrl} alt="banner" class="h-16 mb-2 rounded-lg object-cover" />{/if}
          <input type="file" accept="image/png,image/jpeg,image/webp" bind:files={bannerFile} on:change={() => uploadAsset('banner', bannerFile)} />
          <p class="text-xs text-slate-500 mt-1">Wide image (~1600×600). Used as the home-page hero background.</p>
        </div>
      </div>

      <div class="flex justify-end pt-2"><button class="btn-primary" on:click={save} disabled={busy}>Save changes</button></div>
    </div>
  {/if}

  {#if tab === 'home'}
    <div class="card p-6 mt-4 max-w-2xl space-y-6">
      <p class="text-sm text-slate-600">All sections are optional. Leave anything blank to hide it from the home page.</p>

      <section>
        <h2 class="text-lg font-semibold">Our numbers</h2>
        <p class="text-xs text-slate-500 mt-0.5">
          Show what your cafe has achieved: repairs done, waste kept out of landfill, and how many volunteers help.
        </p>
        <label class="mt-3 flex items-start gap-3 cursor-pointer">
          <input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" bind:checked={showStats} />
          <span class="text-sm text-slate-700">
            Show our numbers on the home page
            <span class="block text-xs text-slate-500">
              Figures come from your own records and update on their own. Numbers that are still zero stay hidden,
              so a new cafe never shows an empty row.
            </span>
          </span>
        </label>
        <label class="mt-3 flex items-start gap-3 cursor-pointer">
          <input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" bind:checked={showEventStats} />
          <span class="text-sm text-slate-700">
            Show what happened at each past session
            <span class="block text-xs text-slate-500">
              Adds a short summary to every past event's page: how many items came in, how many went home
              working, and what kinds of thing they were. No visitor names or item details are shown.
            </span>
          </span>
        </label>
      </section>

      <section>
        <h2 class="text-lg font-semibold">Intro / About section</h2>
        <p class="text-xs text-slate-500 mt-0.5">Like the “What &amp; Who” paragraph at the top of your page.</p>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. What & Who)" bind:value={intro.heading} />
          <textarea class="input" rows="6" placeholder="Body text. Blank lines start a new paragraph." bind:value={intro.body}></textarea>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-semibold">How it works</h2>
        <p class="text-xs text-slate-500 mt-0.5">Numbered steps that show customers what to expect.</p>
        <div class="mt-2 space-y-3">
          {#each howItWorks as step, i}
            <div class="border border-slate-200 rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono text-slate-400 w-6">{i + 1}</span>
                <input class="input flex-1" placeholder="Step title" bind:value={step.title} />
                <button class="p-2 rounded-lg text-rose-600 hover:bg-rose-50" type="button" on:click={() => howItWorks = howItWorks.filter((_, k) => k !== i)} title="Remove" aria-label="Remove step"><Trash2 size={16} /></button>
              </div>
              <textarea class="input" rows="2" placeholder="Short description" bind:value={step.body}></textarea>
            </div>
          {/each}
          <button class="btn-secondary btn-sm" type="button" on:click={() => howItWorks = [...howItWorks, { title: '', body: '' }]}><Plus size={14} /> Add step</button>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-semibold">What to bring</h2>
        <p class="text-xs text-slate-500 mt-0.5">Customer guidance. Bullet points work well (start each line with “• ”).</p>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. What to bring)" bind:value={whatToBring.heading} />
          <textarea class="input" rows="5" placeholder="One line per bullet." bind:value={whatToBring.body}></textarea>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-semibold">FAQs</h2>
        <div class="mt-2 space-y-3">
          {#each faqs as faq, i}
            <div class="border border-slate-200 rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2">
                <input class="input flex-1" placeholder="Question" bind:value={faq.q} />
                <button class="p-2 rounded-lg text-rose-600 hover:bg-rose-50" type="button" on:click={() => faqs = faqs.filter((_, k) => k !== i)} title="Remove" aria-label="Remove FAQ"><Trash2 size={16} /></button>
              </div>
              <textarea class="input" rows="2" placeholder="Answer" bind:value={faq.a}></textarea>
            </div>
          {/each}
          <button class="btn-secondary btn-sm" type="button" on:click={() => faqs = [...faqs, { q: '', a: '' }]}><Plus size={14} /> Add FAQ</button>
        </div>
      </section>

      <div class="flex justify-end pt-2 border-t">
        <button class="btn-primary" on:click={saveHome} disabled={busy}>Save home page</button>
      </div>
    </div>
  {/if}

  {#if tab === 'linux'}
    <div class="card p-6 mt-4 max-w-2xl space-y-6">
      <section>
        <h2 class="text-lg font-semibold">Linux Repair Cafe</h2>
        <p class="text-sm text-slate-600 mt-1">
          A Linux Repair Cafe helps people move an ageing computer to Linux instead of throwing it
          away. Microsoft stopped supporting Windows 10 in October 2025, so a lot of working
          computers are being called too old. Linux keeps them going, and it is free.
        </p>
        <p class="text-sm text-slate-600 mt-2">
          This is an extra you offer at your normal sessions, not a separate event. You tick the
          sessions where Linux help is available, and most cafes tick all of them.
        </p>
        <p class="text-sm text-slate-600 mt-2">
          Read about the movement at
          <a
            href="https://www.repaircafe.org/en/linux-repair-cafe/"
            target="_blank"
            rel="noopener"
            class="text-brand-700 underline underline-offset-2"
          >repaircafe.org</a>.
        </p>

        <label class="mt-4 flex items-start gap-3 cursor-pointer rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
          <input
            type="checkbox"
            class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            bind:checked={linuxEnabled}
          />
          <span class="text-sm text-slate-700">
            <span class="font-semibold text-slate-800">We are a Linux Repair Cafe</span>
            <span class="block text-xs text-slate-500 mt-0.5">
              Adds a Linux Repair Cafe menu item to your site, a page explaining what it is, and a
              card about it on your home page. It also adds a Linux section to your admin area for
              recording installs. Leave this off if you do not offer Linux help.
            </span>
          </span>
        </label>

        {#if !linuxEnabled}
          <p class="mt-3 text-xs text-slate-500">
            Everything below is saved either way. You can write your page first, then switch it on
            when you are ready.
          </p>
        {:else}
          <div class="mt-3 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-900">
            <p class="font-semibold">Two more things to do.</p>
            <ol class="list-decimal ml-5 mt-1 space-y-0.5">
              <li>
                Tick <span class="font-medium">Linux help at this session</span> on the sessions
                where you offer it, under <a href="/admin/events" class="underline underline-offset-2">Events</a>.
              </li>
              <li>
                Mark your Linux volunteers under
                <a href="/admin/repairers" class="underline underline-offset-2">Repairers</a>,
                so visitors can see who will help them.
              </li>
            </ol>
          </div>
        {/if}
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">Menu item</h2>
        <p class="text-xs text-slate-500 mt-0.5">What the menu item on your site is called.</p>
        <input class="input mt-2" placeholder="Linux Repair Cafe" bind:value={linuxNavLabel} />
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">Top of the page</h2>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. Linux Repair Cafe)" bind:value={linuxHero.heading} />
          <input class="input" placeholder="One line under it (e.g. Give your old computer years more life, for free.)" bind:value={linuxHero.tagline} />
        </div>
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">Card on your home page</h2>
        <p class="text-xs text-slate-500 mt-0.5">
          A short explanation on your home page that links to the Linux page. This is what most
          visitors will read first, so keep it plain.
        </p>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. We are a Linux Repair Cafe)" bind:value={linuxHomeCard.heading} />
          <textarea class="input" rows="3" placeholder="A sentence or two explaining what it is." bind:value={linuxHomeCard.body}></textarea>
          <input class="input" placeholder="Button label (e.g. Find out about Linux)" bind:value={linuxHomeCard.ctaLabel} />
        </div>
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">What a Linux Repair Cafe is</h2>
        <p class="text-xs text-slate-500 mt-0.5">The opening explanation on the Linux page.</p>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. What is a Linux Repair Cafe?)" bind:value={linuxIntro.heading} />
          <textarea class="input" rows="8" placeholder="Body text. Blank lines start a new paragraph." bind:value={linuxIntro.body}></textarea>
        </div>
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">How it works</h2>
        <p class="text-xs text-slate-500 mt-0.5">Numbered steps that show visitors what to expect.</p>
        <div class="mt-2 space-y-3">
          {#each linuxHowItWorks as step, i}
            <div class="border border-slate-200 rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono text-slate-400 w-6">{i + 1}</span>
                <input class="input flex-1" placeholder="Step title" bind:value={step.title} />
                <button class="p-2 rounded-lg text-rose-600 hover:bg-rose-50" type="button" on:click={() => linuxHowItWorks = linuxHowItWorks.filter((_, k) => k !== i)} title="Remove" aria-label="Remove step"><Trash2 size={16} /></button>
              </div>
              <textarea class="input" rows="2" placeholder="Short description" bind:value={step.body}></textarea>
            </div>
          {/each}
          <button class="btn-secondary btn-sm" type="button" on:click={() => linuxHowItWorks = [...linuxHowItWorks, { title: '', body: '' }]}><Plus size={14} /> Add step</button>
        </div>
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">What to bring</h2>
        <p class="text-xs text-slate-500 mt-0.5">
          Bullet points work well (start each line with “• ”). Please keep the reminder about
          backing up files: installing Linux erases the whole computer.
        </p>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. What to bring)" bind:value={linuxWhatToBring.heading} />
          <textarea class="input" rows="6" placeholder="One line per bullet." bind:value={linuxWhatToBring.body}></textarea>
        </div>
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">FAQs</h2>
        <div class="mt-2 space-y-3">
          {#each linuxFaqs as faq, i}
            <div class="border border-slate-200 rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2">
                <input class="input flex-1" placeholder="Question" bind:value={faq.q} />
                <button class="p-2 rounded-lg text-rose-600 hover:bg-rose-50" type="button" on:click={() => linuxFaqs = linuxFaqs.filter((_, k) => k !== i)} title="Remove" aria-label="Remove FAQ"><Trash2 size={16} /></button>
              </div>
              <textarea class="input" rows="2" placeholder="Answer" bind:value={faq.a}></textarea>
            </div>
          {/each}
          <button class="btn-secondary btn-sm" type="button" on:click={() => linuxFaqs = [...linuxFaqs, { q: '', a: '' }]}><Plus size={14} /> Add FAQ</button>
        </div>
      </section>

      <section class="pt-2 border-t">
        <h2 class="text-lg font-semibold">Our numbers</h2>
        <label class="mt-2 flex items-start gap-3 cursor-pointer">
          <input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" bind:checked={linuxShowStats} />
          <span class="text-sm text-slate-700">
            Show how many computers we have saved
            <span class="block text-xs text-slate-500">
              Counted from the installs your volunteers write up. Figures that are still zero stay
              hidden, so a cafe that has just started never shows an empty row.
            </span>
          </span>
        </label>
      </section>

      <div class="flex items-center justify-end gap-3 pt-2 border-t">
        {#if linuxSaved}<span class="text-sm text-emerald-700">Saved</span>{/if}
        {#if linuxEnabled}
          <a href="/linux" target="_blank" rel="noopener" class="btn-secondary">Preview the page</a>
        {/if}
        <button class="btn-primary" on:click={saveLinux} disabled={busy}>Save Linux settings</button>
      </div>
    </div>
  {/if}

  {#if tab === 'gallery'}
    <div class="card p-6 mt-4 max-w-4xl space-y-6">
      <div>
        <h2 class="text-lg font-semibold">Photo gallery</h2>
        <p class="text-sm text-slate-600 mt-1">
          These photos fill the gallery on your home page. Volunteers can also add photos to each
          session under <a href="/admin/events" class="text-brand-700 underline underline-offset-2">Events</a>,
          and you can star any of those to bring them in here too.
        </p>
      </div>

      <ImageDropzone
        endpoint="/api/admin/gallery"
        title="Add photos to the gallery"
        hint="Drag photos here, paste one from your clipboard, or browse your device. JPEG, PNG or WebP."
        on:done={onGalleryUploaded}
      />

      <div>
        <h3 class="text-base font-semibold mb-2">
          Photos in the gallery
          {#if gallery.length > 0}<span class="font-normal text-slate-500">({gallery.length})</span>{/if}
        </h3>
        <GalleryManager
          bind:photos={gallery}
          onSaveCaption={saveGalleryCaption}
          onDelete={deleteGalleryPhoto}
          onReorder={reorderGallery}
          emptyMessage="No photos yet. Add a few to fill the gallery on your home page."
        />
      </div>
    </div>
  {/if}

  {#if tab === 'local'}
    <div class="card p-6 mt-4 max-w-3xl space-y-5">
      <div>
        <h2 class="text-lg font-semibold">Repair Cafes near us</h2>
        <p class="text-sm text-slate-600 mt-1">
          Pick up to {localMax} nearby Repair Cafes you know and want to support. They show as a small
          map and list on your home page, so a visitor you cannot help can find someone who can.
          Names, addresses and pins come from repaircafe.org, so they stay right on their own.
        </p>
      </div>

      {#if !localAnchor && localLoadedOnce}
        <div class="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900">
          <p class="font-semibold">We do not know where you are yet.</p>
          <p class="mt-1">
            Add your own page on repaircafe.org under
            <button class="underline underline-offset-2 font-medium" type="button" on:click={() => (tab = 'profile')}>Cafe profile</button>,
            and this list will start with your closest neighbours. Until then you can still search by
            name or town.
          </p>
        </div>
      {/if}

      <div>
        <label class="label" for="local-search">Search by name or town</label>
        <input
          id="local-search"
          class="input"
          type="search"
          placeholder={localAnchor ? 'Leave blank to see your closest cafes' : 'For example: Sheffield'}
          bind:value={localQuery}
          on:input={onLocalSearch}
        />
        {#if localAnchor}
          <p class="text-xs text-slate-500 mt-1">Distances are measured from {localAnchor.name}, in a straight line.</p>
        {/if}
      </div>

      {#if localError}
        <p class="text-sm text-rose-700">{localError}</p>
      {/if}

      <!-- What is ticked, kept in view even when a search hides it. -->
      <div>
        <h3 class="text-base font-semibold">
          Chosen <span class="font-normal text-slate-500">({localSelected.length} of {localMax})</span>
        </h3>
        {#if localChosen.length === 0}
          <p class="text-sm text-slate-500 mt-1">None yet. Tick a cafe below to add it.</p>
        {:else}
          <ul class="mt-2 flex flex-wrap gap-2">
            {#each localChosen as cafe (cafe.slug)}
              <li class="inline-flex items-center gap-2 rounded-full bg-brand-50 ring-1 ring-brand-200 pl-3 pr-1.5 py-1 text-sm">
                <span class="text-brand-900">{cafe.name}</span>
                {#if formatDistance(cafe.distanceKm)}
                  <span class="text-xs text-slate-500">{formatDistance(cafe.distanceKm)}</span>
                {/if}
                <button
                  class="p-1 rounded-full text-slate-500 hover:bg-white hover:text-rose-700"
                  type="button"
                  aria-label={`Remove ${cafe.name}`}
                  on:click={() => toggleLocalCafe(cafe, false)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div>
        <h3 class="text-base font-semibold">
          {localQuery.trim() ? 'Search results' : 'Closest to you'}
        </h3>
        {#if localLoading}
          <p class="text-sm text-slate-500 mt-2">Looking…</p>
        {:else if localResults.length === 0}
          <p class="text-sm text-slate-500 mt-2">
            {localQuery.trim() ? 'No cafes match that. Try a town name.' : 'No cafes to show.'}
          </p>
        {:else}
          <ul class="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {#each localResults as cafe (cafe.slug)}
              {@const isOn = !!cafe.slug && localSelected.includes(cafe.slug)}
              {@const isFull = localSelected.length >= localMax && !isOn}
              <li class="flex items-start gap-3 p-3 {isOn ? 'bg-brand-50' : 'bg-white'}">
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 disabled:opacity-40"
                  checked={isOn}
                  disabled={isFull}
                  aria-label={`Show ${cafe.name} on our home page`}
                  on:change={(e) => toggleLocalCafe(cafe, e.currentTarget.checked)}
                />
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-slate-800">{cafe.name}</p>
                  {#if cafe.address}
                    <p class="text-sm text-slate-500">{cafe.address}</p>
                  {/if}
                  <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {#if formatDistance(cafe.distanceKm)}
                      <span class="text-slate-500">{formatDistance(cafe.distanceKm)}</span>
                    {/if}
                    {#if repairCafeOrgUrl(cafe.slug)}
                      <a href={repairCafeOrgUrl(cafe.slug)} target="_blank" rel="noopener" class="text-brand-700 underline underline-offset-2">Their page on repaircafe.org</a>
                    {/if}
                    {#if cafe.website}
                      <a href={cafe.website} target="_blank" rel="noopener" class="text-brand-700 underline underline-offset-2">Their own website</a>
                    {/if}
                  </p>
                </div>
              </li>
            {/each}
          </ul>
          {#if localSelected.length >= localMax}
            <p class="text-xs text-amber-800 mt-2">
              That is {localMax}, the most we show. Remove one to add another.
            </p>
          {/if}
        {/if}
      </div>

      <div class="flex items-center justify-end gap-3 pt-2 border-t">
        {#if localSaved}<span class="text-sm text-emerald-700">Saved</span>{/if}
        <button class="btn-primary" on:click={saveLocalCafes} disabled={busy}>Save local cafes</button>
      </div>
    </div>
  {/if}

  {#if tab === 'maps'}
    <div class="card p-6 mt-4 max-w-2xl space-y-4">
      <div>
        <h2 class="text-lg font-semibold">Map background <span class="text-xs text-slate-400 font-normal">(CARTO API key)</span></h2>
        <p class="text-sm text-slate-600 mt-1">
          The map of nearby cafes on your home page and the map on your Worldwide page both use
          free map tiles from
          <a href="https://carto.com/basemaps/" target="_blank" rel="noopener" class="underline underline-offset-2">CARTO</a>.
          CARTO asks every site to use its own key. Without one the maps still work, but every
          tile carries an "API key required" watermark. The key is free.
        </p>
      </div>

      {#if cafe.cartoApiKey}
        <div class="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-900">
          <p class="font-semibold">A key is saved.</p>
          <p class="mt-1">Your maps use it. If you still see the watermark, reload the page with a hard refresh.</p>
        </div>
      {:else}
        <div class="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900">
          <p class="font-semibold">No key yet.</p>
          <p class="mt-1">Your maps show an "API key required" watermark until you add one. It takes a few minutes.</p>
        </div>
      {/if}

      <details class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 text-sm text-slate-700" open={!cafe.cartoApiKey}>
        <summary class="cursor-pointer font-semibold text-slate-800">How to get a key</summary>
        <ol class="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Go to
            <a href="https://carto.com/basemaps/apikey/" target="_blank" rel="noopener" class="text-brand-700 underline underline-offset-2">carto.com/basemaps/apikey</a>.
          </li>
          <li>
            Fill in the short form: your email address, the web address of this site
            {#if cafe.publicUrl}(<code>{cafe.publicUrl}</code>){/if}, and a line about what the map
            is for. Something like "Repair Cafe website showing nearby Repair Cafes" is enough.
          </li>
          <li>CARTO emails the key straight back. You do not need a CARTO account or a bank card.</li>
          <li>Paste the key below and click <strong>Save map key</strong>.</li>
        </ol>
      </details>

      <div>
        <label class="label" for="carto-key">CARTO API key</label>
        <input
          id="carto-key"
          class="input font-mono"
          autocomplete="off"
          spellcheck="false"
          bind:value={cafe.cartoApiKey}
          placeholder="Paste the key from CARTO's email"
        />
        <p class="text-xs text-slate-500 mt-1">
          You can paste the whole tile address from the email instead. Only the key is kept.
          Leave blank to use the maps without a key.
        </p>
      </div>

      <ul class="text-xs text-slate-500 space-y-1 list-disc pl-4">
        <li>The free plan allows 5 million map tiles a month. A cafe website uses a tiny fraction of that.</li>
        <li>The key is for this site only. CARTO asks that one key is not shared between unrelated projects.</li>
        <li>
          The CARTO and OpenStreetMap credits in the corner of the map must stay visible. That is
          the condition of the free plan, and the hub shows them for you.
        </li>
        <li>
          Still see the watermark after saving? Reload the page with a hard refresh (Ctrl+Shift+R,
          or Cmd+Shift+R on a Mac). Browsers keep old map tiles for a while.
        </li>
      </ul>

      {#if mapsError}
        <p class="text-sm text-rose-700">{mapsError}</p>
      {/if}
      <div class="flex items-center justify-end gap-3 pt-2 border-t">
        {#if mapsSaved}<span class="text-sm text-emerald-700">Saved</span>{/if}
        <button class="btn-primary" on:click={saveMaps} disabled={busy}>Save map key</button>
      </div>
    </div>
  {/if}

  {#if tab === 'telemetry'}
    <div class="card p-6 mt-4 max-w-3xl space-y-5">
      {#if telemetry?.disabledByEnv}
        <div class="rounded-xl bg-slate-100 ring-1 ring-slate-200 p-3 text-sm text-slate-700">
          <p class="font-semibold">Switched off for this whole install.</p>
          <p class="mt-1">
            <code>TELEMETRY_DISABLED=true</code> is set, so nothing is sent whatever is chosen here.
            Whoever runs this server decided that.
          </p>
        </div>
      {/if}

      <TelemetryChoice bind:level={telemetryLevel} payload={telemetryPayload} cafeName={cafe?.name ?? ''} />

      {#if telemetry?.lastSentAt}
        <p class="text-xs text-slate-500">
          Last sent {new Date(telemetry.lastSentAt).toLocaleString('en-GB')}.
        </p>
      {:else}
        <p class="text-xs text-slate-500">Nothing has been sent yet.</p>
      {/if}

      <!-- Whether the project could check us. Without this, a cafe whose
           public address is wrong sees nothing at all: it sends happily, and
           its numbers simply never appear in the community figures. -->
      {#if telemetry && telemetry.level !== 'none' && telemetry.lastSentAt}
        {#if telemetry.verified === true}
          <div class="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-900">
            <p class="font-semibold">Your numbers are counted.</p>
            <p class="mt-1">
              The project checked your public site and found this hub, so your figures are included
              in the community totals.
            </p>
          </div>
        {:else if telemetry.verified === false}
          <div class="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900">
            <p class="font-semibold">Your numbers are not being counted yet.</p>
            <p class="mt-1">{telemetry.verifyReason ?? 'The project could not check your site.'}</p>
            <p class="mt-1">
              Your public web address is
              <code class="bg-white/70 rounded px-1">{cafe?.publicUrl || 'not set'}</code>.
              It has to be the address visitors use, over https, and reachable from outside your
              network. Change it under
              <button class="underline underline-offset-2 font-medium" type="button" on:click={() => (tab = 'profile')}>Cafe profile</button>,
              then press Save here to try again.
            </p>
          </div>
        {/if}
      {/if}

      {#if telemetryMsg}<p class="text-sm text-emerald-700">{telemetryMsg}</p>{/if}
      {#if telemetryErr}<p class="text-sm text-rose-700">{telemetryErr}</p>{/if}

      <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t">
        <button class="btn-ghost btn-sm text-rose-700" type="button" disabled={busy} on:click={forgetTelemetry}>
          Delete everything you hold about us
        </button>
        <button class="btn-primary" type="button" disabled={busy} on:click={saveTelemetry}>Save</button>
      </div>
    </div>
  {/if}

  {#if tab === 'preferences'}
    <div class="card p-6 mt-4 max-w-2xl space-y-4">
      <label class="flex items-center gap-3"><input type="checkbox" bind:checked={cafe.allowSkipPhoto} /> Allow customers to skip the &quot;before&quot; photo step</label>
      <label class="flex items-center gap-3"><input type="checkbox" bind:checked={cafe.enableContactField} /> Show optional contact (phone/email) field on check-in</label>
      <div>
        <label class="label" for="rd">Data retention period (days)</label>
        <input id="rd" class="input w-32" type="number" min="30" max="3650" bind:value={cafe.dataRetentionDays} />
        <p class="text-xs text-slate-500 mt-1">Customer PII (name, contact) is purged this many days after the event.</p>
      </div>
      <div class="flex justify-end"><button class="btn-primary" on:click={savePrefs} disabled={busy}>Save preferences</button></div>
    </div>
  {/if}

  {#if tab === 'seo'}
    <div class="card p-6 mt-4 max-w-2xl space-y-6">
      <section class="space-y-3">
        <h2 class="text-lg font-semibold">Search engine listing</h2>
        <p class="text-xs text-slate-500 -mt-1">How your home page appears in Google results and on social shares.</p>
        <div>
          <label class="label" for="st">Page title</label>
          <input id="st" class="input" maxlength="70" bind:value={cafe.seoTitle} placeholder={cafe.tagline ? `${cafe.name}: ${cafe.tagline}` : cafe.name} />
          <p class="text-xs text-slate-500 mt-1">Leave blank to auto-generate from cafe name + tagline. ~60 chars works best.</p>
        </div>
        <div>
          <label class="label" for="sd">Meta description</label>
          <textarea id="sd" class="input" rows="3" maxlength="200" bind:value={cafe.seoDescription} placeholder={cafe.description ?? ''}></textarea>
          <p class="text-xs text-slate-500 mt-1">Leave blank to use the short description. ~150 chars works best.</p>
        </div>
      </section>

      <section class="space-y-3 pt-2 border-t">
        <h2 class="text-lg font-semibold">Icons &amp; share image</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <span class="label">Favicon</span>
            {#if cafe.faviconUrl}<img src={cafe.faviconUrl} alt="favicon" class="h-12 w-12 mb-2 bg-slate-100 rounded-lg p-1 object-contain" />{/if}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" bind:files={faviconFile} on:change={() => uploadAsset('favicon', faviconFile)} />
            <p class="text-xs text-slate-500 mt-1">Square, 32–256px. Shown in browser tabs.</p>
          </div>
          <div>
            <span class="label">Social share image (Open Graph)</span>
            {#if cafe.ogImageUrl}<img src={cafe.ogImageUrl} alt="How your site looks when someone shares it" class="h-16 mb-2 rounded-lg object-cover" />{/if}
            <input type="file" accept="image/png,image/jpeg,image/webp" bind:files={ogFile} on:change={() => uploadAsset('og', ogFile)} />
            <p class="text-xs text-slate-500 mt-1">~1200×630 works best. Falls back to your banner if blank.</p>
          </div>
        </div>
      </section>

      <section class="space-y-3 pt-2 border-t">
        <h2 class="text-lg font-semibold">Plausible analytics <span class="text-xs text-slate-400 font-normal">(optional)</span></h2>
        <p class="text-xs text-slate-500 -mt-1">Privacy-friendly, cookie-free. Leave blank to disable.</p>
        <div>
          <label class="label" for="pd">Site domain</label>
          <input id="pd" class="input" bind:value={cafe.plausibleDomain} placeholder="repaircafe.example.org" />
          <p class="text-xs text-slate-500 mt-1">The domain you registered in Plausible.</p>
        </div>
        <div>
          <label class="label" for="ps">Script URL</label>
          <input id="ps" class="input" bind:value={cafe.plausibleSrc} placeholder="https://plausible.io/js/script.js" />
          <p class="text-xs text-slate-500 mt-1">
            Use <code>https://plausible.io/js/script.js</code> for managed Plausible, or the same path on
            your own server. Plausible also offers a per-site script whose address looks like
            <code>/js/pa-XXXX.js</code>. Either works here.
          </p>
        </div>
      </section>

      <div class="flex justify-end pt-2 border-t">
        <button class="btn-primary" on:click={saveSeo} disabled={busy}>Save SEO &amp; analytics</button>
      </div>
    </div>
  {/if}

  {#if tab === 'gdpr'}
    <div class="card p-6 mt-4 max-w-2xl space-y-3">
      <h2 class="text-lg font-semibold">Data retention</h2>
      <p class="text-sm text-slate-600">Customer-personal data is automatically purged after the configured retention period. You can also trigger an immediate purge of expired data.</p>
      <button class="btn-danger" on:click={purgePii}>Purge expired PII now</button>
    </div>
  {/if}

  {#if tab === 'backup' && isSuperAdmin}
    <div class="mt-4 max-w-2xl space-y-4">
      <div class="card p-6 space-y-3">
        <h2 class="text-lg font-semibold flex items-center gap-2"><Download class="w-4 h-4" /> Download a backup</h2>
        <p class="text-sm text-slate-600">Creates a zip containing the entire database (all tables including audit log) plus every uploaded photo and branding asset. Keep this somewhere safe. Anyone with the file can restore your cafe's data.</p>
        {#if backupInfo}
          <p class="text-xs text-slate-500">App version <span class="font-mono">{backupInfo.appVersion}</span> · backup format v{backupInfo.backupFormatVersion}</p>
        {/if}
        {#if backupDownloadError}
          <p class="text-sm text-rose-700">{backupDownloadError}</p>
        {/if}
        <button class="btn-primary inline-flex items-center gap-2" on:click={downloadBackup} disabled={backupBusy}>
          <Download class="w-4 h-4" />
          {backupBusy ? 'Preparing backup…' : 'Download backup zip'}
        </button>
        <p class="text-xs text-slate-500">The download starts as soon as the database dump is ready. Big cafes with lots of photos may take a minute.</p>
      </div>

      <div class="card p-6 space-y-3 ring-rose-200">
        <h2 class="text-lg font-semibold text-rose-800 flex items-center gap-2"><AlertTriangle class="w-4 h-4" /> Restore from a backup</h2>
        <div class="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-900">
          <p class="font-semibold">This wipes every record currently in this install.</p>
          <ul class="list-disc ml-5 mt-1 space-y-0.5">
            <li>All users, events, repair jobs, photos and settings are replaced with the backup's contents.</li>
            <li>You will be signed out and must log in with credentials from the backup.</li>
            <li>The app restarts as part of the restore. Give it about 10 seconds before refreshing.</li>
          </ul>
        </div>
        <div>
          <label class="label" for="restore-file">Backup zip</label>
          <input id="restore-file" class="input" type="file" accept=".zip,application/zip" bind:files={restoreFile} />
        </div>
        <div>
          <label class="label" for="restore-phrase">Type <span class="font-mono">{backupInfo?.confirmPhrase ?? 'WIPE AND RESTORE'}</span> to confirm</label>
          <input id="restore-phrase" class="input font-mono" bind:value={restorePhrase} placeholder={backupInfo?.confirmPhrase ?? 'WIPE AND RESTORE'} />
        </div>
        {#if restoreError}<p class="text-sm text-rose-700">{restoreError}</p>{/if}
        {#if restoreInfo}<p class="text-sm text-emerald-700">{restoreInfo}</p>{/if}
        <button class="btn-danger inline-flex items-center gap-2" on:click={restoreBackupNow} disabled={restoreBusy || !restoreFile || restorePhrase !== (backupInfo?.confirmPhrase ?? 'WIPE AND RESTORE')}>
          <Upload class="w-4 h-4" />
          {restoreBusy ? 'Restoring…' : 'Wipe and restore'}
        </button>
      </div>
    </div>
  {/if}

  {#if tab === 'about'}
    <div class="card p-6 mt-4 max-w-2xl text-sm space-y-2">
      <p><strong>Repair Cafe Hub</strong></p>
      <p>Self-hosted, open-source platform for grass-roots repair cafes.</p>
      <p>Source: <a class="text-brand-700 hover:underline" href="https://github.com/Zesty0wl/circularity-repair-cafe-hub" target="_blank" rel="noopener">github.com/Zesty0wl/circularity-repair-cafe-hub</a></p>
      <p>Released under the MIT licence.</p>
    </div>

    <div class="card p-6 mt-4 max-w-2xl text-sm space-y-3">
      <h2 class="font-semibold text-base">Updating</h2>
      <p class="text-slate-700">
        Log in to the machine running the hub, go to the folder you installed it
        into, and run these three commands. Your data is kept in a separate
        volume, so nothing is lost.
      </p>
      <pre class="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-xs leading-relaxed"><code>cd ~/circularity-repair-cafe-hub
git pull
docker compose pull
docker compose up -d</code></pre>
      <p class="text-slate-700">
        If you did not clone the repository, and only have a
        <code class="bg-slate-100 px-1 rounded">docker-compose.yml</code>, leave
        out the <code class="bg-slate-100 px-1 rounded">git pull</code>.
      </p>
      <p class="text-slate-700">
        The site is unavailable for about 30 seconds while it restarts, so do it
        the day before a session rather than on the morning. Database changes are
        applied automatically on start, and are safe to run more than once.
      </p>
      <p class="text-slate-700">
        Afterwards, <code class="bg-slate-100 px-1 rounded">./doctor.sh</code>
        checks everything came back up.
      </p>
      <p class="text-slate-600">
        To stay on one version rather than always taking the newest, set
        <code class="bg-slate-100 px-1 rounded">HUB_VERSION</code> in your
        <code class="bg-slate-100 px-1 rounded">.env</code>, for example
        <code class="bg-slate-100 px-1 rounded">HUB_VERSION=1.7.0</code>.
      </p>
    </div>
  {/if}
{/if}
