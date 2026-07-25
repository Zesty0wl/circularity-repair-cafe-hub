<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { loadCafe } from '$lib/stores/cafe';
  import { FONT_OPTIONS } from '@circularity/shared';
  import { Trash2, Plus, ArrowUp, ArrowDown, Download, Upload, AlertTriangle } from 'lucide-svelte';

  let cafe: any = null;
  let busy = false;
  type Tab = 'profile' | 'home' | 'gallery' | 'preferences' | 'seo' | 'gdpr' | 'backup' | 'about';
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
  let galleryFile: FileList | null = null;
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

  // Gallery
  type GalleryRow = { id: string; url: string; caption: string | null; sortOrder: number };
  let gallery: GalleryRow[] = [];

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
  }
  async function loadGallery() {
    gallery = await api<GalleryRow[]>('/api/admin/gallery');
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

  async function uploadGallery(files: FileList | null) {
    if (!files || files.length === 0) return;
    busy = true;
    try {
      // Upload one at a time; keeps UX responsive and ordering predictable
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('image', file);
        await api('/api/admin/gallery', { method: 'POST', formData: fd });
      }
      await loadGallery();
      await loadCafe();
      galleryFile = null;
    } finally { busy = false; }
  }

  async function updateCaption(g: GalleryRow) {
    await api(`/api/admin/gallery/${g.id}`, { method: 'PATCH', json: { caption: g.caption } });
  }
  async function deleteImage(g: GalleryRow) {
    if (!confirm('Remove this image from the gallery?')) return;
    await api(`/api/admin/gallery/${g.id}`, { method: 'DELETE' });
    await loadGallery();
    await loadCafe();
  }
  async function move(idx: number, delta: number) {
    const j = idx + delta;
    if (j < 0 || j >= gallery.length) return;
    [gallery[idx], gallery[j]] = [gallery[j], gallery[idx]];
    gallery = gallery; // tell svelte
    await api('/api/admin/gallery/reorder', { method: 'POST', json: { ids: gallery.map((g) => g.id) } });
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
  {#each [['profile','Cafe profile'],['home','Home page'],['gallery','Gallery'],['preferences','Check-in & preferences'],['seo','SEO & analytics'],['gdpr','GDPR'], ...(isSuperAdmin ? [['backup','Backup & restore']] : []),['about','About']] as [key, label]}
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

  {#if tab === 'gallery'}
    <div class="card p-6 mt-4 max-w-2xl space-y-4">
      <div>
        <span class="label">Add photos</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple bind:files={galleryFile} on:change={() => uploadGallery(galleryFile)} />
        <p class="text-xs text-slate-500 mt-1">JPEG/PNG/WebP up to 1800px on the longest edge. Multiple at a time supported.</p>
      </div>

      {#if gallery.length === 0}
        <p class="text-sm text-slate-500 mt-2">No photos yet. Upload a few to fill the gallery on the home page.</p>
      {:else}
        <ul class="space-y-3 mt-2">
          {#each gallery as g, i (g.id)}
            <li class="flex gap-3 items-start border border-slate-200 rounded-lg p-3">
              <img src={g.url} alt="" class="h-24 w-32 object-cover rounded-lg ring-1 ring-slate-200" />
              <div class="flex-1">
                <input class="input text-sm" placeholder="Caption (optional)" bind:value={g.caption} on:blur={() => updateCaption(g)} />
                <p class="text-xs text-slate-400 mt-1 truncate">{g.url}</p>
              </div>
              <div class="flex flex-col gap-1">
                <button class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40" type="button" disabled={i === 0} on:click={() => move(i, -1)} title="Move up" aria-label="Move up"><ArrowUp size={14} /></button>
                <button class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40" type="button" disabled={i === gallery.length - 1} on:click={() => move(i, 1)} title="Move down" aria-label="Move down"><ArrowDown size={14} /></button>
                <button class="p-2 rounded-lg text-rose-600 hover:bg-rose-50" type="button" on:click={() => deleteImage(g)} title="Remove" aria-label="Remove image"><Trash2 size={14} /></button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
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
            {#if cafe.ogImageUrl}<img src={cafe.ogImageUrl} alt="og image" class="h-16 mb-2 rounded-lg object-cover" />{/if}
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
          <p class="text-xs text-slate-500 mt-1">Use <code>https://plausible.io/js/script.js</code> for managed Plausible, or your self-hosted equivalent.</p>
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
      <img src="/brand/logo-horizontal.svg" alt="Circularity.org" class="h-8 w-auto mb-1" />
      <p><strong>Repair Cafe Hub</strong></p>
      <p>Self-hosted, open-source platform for grass-roots repair cafes.</p>
      <p>Source: <a class="text-brand-700 hover:underline" href="https://github.com/" target="_blank" rel="noopener">github.com</a></p>
      <p>Released under the MIT licence.</p>
    </div>
  {/if}
{/if}
