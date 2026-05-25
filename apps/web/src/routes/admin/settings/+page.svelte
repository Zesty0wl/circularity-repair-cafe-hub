<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { loadCafe } from '$lib/stores/cafe';
  import { Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-svelte';

  let cafe: any = null;
  let busy = false;
  type Tab = 'profile' | 'home' | 'gallery' | 'preferences' | 'seo' | 'gdpr' | 'about';
  let tab: Tab = 'profile';
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

  // Gallery
  type GalleryRow = { id: string; url: string; caption: string | null; sortOrder: number };
  let gallery: GalleryRow[] = [];

  // Brand colour — <input type="color"> requires #rrggbb. We normalise on load
  // and via the change handler so an empty/legacy value never reaches the
  // native control (which otherwise logs a console error).
  const DEFAULT_PRIMARY = '#0ea5e9';
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  function normaliseHex(v: unknown): string {
    return typeof v === 'string' && HEX_RE.test(v) ? v : DEFAULT_PRIMARY;
  }
  let primaryColorInput = DEFAULT_PRIMARY;

  async function load() {
    cafe = await api('/api/admin/settings');
    if (cafe) cafe.primaryColor = normaliseHex(cafe.primaryColor);
    primaryColorInput = normaliseHex(cafe?.primaryColor);
    const hp = cafe?.homePage ?? {};
    intro = { heading: hp.intro?.heading ?? '', body: hp.intro?.body ?? '' };
    howItWorks = Array.isArray(hp.howItWorks) ? hp.howItWorks.map((s: any) => ({ title: s.title ?? '', body: s.body ?? '' })) : [];
    whatToBring = { heading: hp.whatToBring?.heading ?? '', body: hp.whatToBring?.body ?? '' };
    faqs = Array.isArray(hp.faqs) ? hp.faqs.map((f: any) => ({ q: f.q ?? '', a: f.a ?? '' })) : [];
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
</script>

<h1 class="text-2xl font-bold">Settings</h1>

<div class="mt-3 flex gap-2 flex-wrap text-sm">
  {#each [['profile','Cafe profile'],['home','Home page'],['gallery','Gallery'],['preferences','Check-in & preferences'],['seo','SEO & analytics'],['gdpr','GDPR'],['about','About']] as [key, label]}
    <button class="btn-{tab === key ? 'primary' : 'secondary'}" on:click={() => (tab = key as Tab)}>{label}</button>
  {/each}
  <a href="/admin/settings/users" class="btn-secondary">Users…</a>
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
            placeholder="#0ea5e9"
            value={primaryColorInput}
            on:change={(e) => (primaryColorInput = normaliseHex((e.currentTarget as HTMLInputElement).value))}
          />
          <button type="button" class="btn-ghost text-sm" on:click={() => (primaryColorInput = DEFAULT_PRIMARY)}>Reset</button>
        </div>
        <p class="text-xs text-slate-500 mt-1">Used as the brand accent. Stored as #rrggbb hex.</p>
      </div>
      <div class="grid sm:grid-cols-3 gap-3">
        <div><label class="label" for="fb">Facebook</label><input id="fb" class="input" bind:value={cafe.socialFacebook} /></div>
        <div><label class="label" for="tw">Twitter / X</label><input id="tw" class="input" bind:value={cafe.socialTwitter} /></div>
        <div><label class="label" for="ig">Instagram</label><input id="ig" class="input" bind:value={cafe.socialInstagram} /></div>
      </div>

      <div class="grid sm:grid-cols-2 gap-3 pt-2">
        <div>
          <span class="label">Logo</span>
          {#if cafe.logoUrl}<img src={cafe.logoUrl} alt="logo" class="h-16 mb-2 bg-slate-100 rounded p-1" />{/if}
          <input type="file" accept="image/png,image/jpeg,image/webp" bind:files={logoFile} on:change={() => uploadAsset('logo', logoFile)} />
          <p class="text-xs text-slate-500 mt-1">Square works best. Shown in the header and on the home page hero.</p>
        </div>
        <div>
          <span class="label">Banner</span>
          {#if cafe.bannerUrl}<img src={cafe.bannerUrl} alt="banner" class="h-16 mb-2 rounded object-cover" />{/if}
          <input type="file" accept="image/png,image/jpeg,image/webp" bind:files={bannerFile} on:change={() => uploadAsset('banner', bannerFile)} />
          <p class="text-xs text-slate-500 mt-1">Wide image (~1600×600). Used as the home-page hero background.</p>
        </div>
      </div>

      <div class="flex justify-end pt-2"><button class="btn-primary" on:click={save} disabled={busy}>Save changes</button></div>
    </div>
  {/if}

  {#if tab === 'home'}
    <div class="card p-6 mt-4 max-w-3xl space-y-6">
      <p class="text-sm text-slate-600">All sections are optional — leave anything blank to hide it from the home page.</p>

      <section>
        <h2 class="font-semibold">Intro / About section</h2>
        <p class="text-xs text-slate-500 mt-0.5">Like the “What &amp; Who” paragraph at the top of your page.</p>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. What & Who)" bind:value={intro.heading} />
          <textarea class="input" rows="6" placeholder="Body text — blank lines start a new paragraph." bind:value={intro.body}></textarea>
        </div>
      </section>

      <section>
        <h2 class="font-semibold">How it works</h2>
        <p class="text-xs text-slate-500 mt-0.5">Numbered steps that show customers what to expect.</p>
        <div class="mt-2 space-y-3">
          {#each howItWorks as step, i}
            <div class="border border-slate-200 rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono text-slate-400 w-6">{i + 1}</span>
                <input class="input flex-1" placeholder="Step title" bind:value={step.title} />
                <button class="btn-ghost" type="button" on:click={() => howItWorks = howItWorks.filter((_, k) => k !== i)} title="Remove"><Trash2 size={16} /></button>
              </div>
              <textarea class="input" rows="2" placeholder="Short description" bind:value={step.body}></textarea>
            </div>
          {/each}
          <button class="btn-secondary text-sm" type="button" on:click={() => howItWorks = [...howItWorks, { title: '', body: '' }]}><Plus size={14} /> Add step</button>
        </div>
      </section>

      <section>
        <h2 class="font-semibold">What to bring</h2>
        <p class="text-xs text-slate-500 mt-0.5">Customer guidance — bullet points work well (start each line with “• ”).</p>
        <div class="mt-2 space-y-2">
          <input class="input" placeholder="Heading (e.g. What to bring)" bind:value={whatToBring.heading} />
          <textarea class="input" rows="5" placeholder="One line per bullet." bind:value={whatToBring.body}></textarea>
        </div>
      </section>

      <section>
        <h2 class="font-semibold">FAQs</h2>
        <div class="mt-2 space-y-3">
          {#each faqs as faq, i}
            <div class="border border-slate-200 rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2">
                <input class="input flex-1" placeholder="Question" bind:value={faq.q} />
                <button class="btn-ghost" type="button" on:click={() => faqs = faqs.filter((_, k) => k !== i)} title="Remove"><Trash2 size={16} /></button>
              </div>
              <textarea class="input" rows="2" placeholder="Answer" bind:value={faq.a}></textarea>
            </div>
          {/each}
          <button class="btn-secondary text-sm" type="button" on:click={() => faqs = [...faqs, { q: '', a: '' }]}><Plus size={14} /> Add FAQ</button>
        </div>
      </section>

      <div class="flex justify-end pt-2 border-t">
        <button class="btn-primary" on:click={saveHome} disabled={busy}>Save home page</button>
      </div>
    </div>
  {/if}

  {#if tab === 'gallery'}
    <div class="card p-6 mt-4 max-w-3xl space-y-4">
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
              <img src={g.url} alt="" class="h-24 w-32 object-cover rounded" />
              <div class="flex-1">
                <input class="input text-sm" placeholder="Caption (optional)" bind:value={g.caption} on:blur={() => updateCaption(g)} />
                <p class="text-xs text-slate-400 mt-1 truncate">{g.url}</p>
              </div>
              <div class="flex flex-col gap-1">
                <button class="btn-ghost p-1" type="button" disabled={i === 0} on:click={() => move(i, -1)} title="Move up"><ArrowUp size={14} /></button>
                <button class="btn-ghost p-1" type="button" disabled={i === gallery.length - 1} on:click={() => move(i, 1)} title="Move down"><ArrowDown size={14} /></button>
                <button class="btn-ghost p-1 text-rose-600" type="button" on:click={() => deleteImage(g)} title="Remove"><Trash2 size={14} /></button>
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
        <h2 class="font-semibold">Search engine listing</h2>
        <p class="text-xs text-slate-500 -mt-1">How your home page appears in Google results and on social shares.</p>
        <div>
          <label class="label" for="st">Page title</label>
          <input id="st" class="input" maxlength="70" bind:value={cafe.seoTitle} placeholder={cafe.tagline ? `${cafe.name} — ${cafe.tagline}` : cafe.name} />
          <p class="text-xs text-slate-500 mt-1">Leave blank to auto-generate from cafe name + tagline. ~60 chars works best.</p>
        </div>
        <div>
          <label class="label" for="sd">Meta description</label>
          <textarea id="sd" class="input" rows="3" maxlength="200" bind:value={cafe.seoDescription} placeholder={cafe.description ?? ''}></textarea>
          <p class="text-xs text-slate-500 mt-1">Leave blank to use the short description. ~150 chars works best.</p>
        </div>
      </section>

      <section class="space-y-3 pt-2 border-t">
        <h2 class="font-semibold">Icons &amp; share image</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <span class="label">Favicon</span>
            {#if cafe.faviconUrl}<img src={cafe.faviconUrl} alt="favicon" class="h-12 w-12 mb-2 bg-slate-100 rounded p-1 object-contain" />{/if}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" bind:files={faviconFile} on:change={() => uploadAsset('favicon', faviconFile)} />
            <p class="text-xs text-slate-500 mt-1">Square, 32–256px. Shown in browser tabs.</p>
          </div>
          <div>
            <span class="label">Social share image (Open Graph)</span>
            {#if cafe.ogImageUrl}<img src={cafe.ogImageUrl} alt="og image" class="h-16 mb-2 rounded object-cover" />{/if}
            <input type="file" accept="image/png,image/jpeg,image/webp" bind:files={ogFile} on:change={() => uploadAsset('og', ogFile)} />
            <p class="text-xs text-slate-500 mt-1">~1200×630 works best. Falls back to your banner if blank.</p>
          </div>
        </div>
      </section>

      <section class="space-y-3 pt-2 border-t">
        <h2 class="font-semibold">Plausible analytics <span class="text-xs text-slate-400 font-normal">(optional)</span></h2>
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
      <h2 class="font-semibold">Data retention</h2>
      <p class="text-sm text-slate-600">Customer-personal data is automatically purged after the configured retention period. You can also trigger an immediate purge of expired data.</p>
      <button class="btn-danger" on:click={purgePii}>Purge expired PII now</button>
    </div>
  {/if}

  {#if tab === 'about'}
    <div class="card p-6 mt-4 max-w-2xl text-sm space-y-2">
      <p><strong>Circularity Repair Cafe Hub</strong></p>
      <p>Self-hosted, open-source platform for grass-roots repair cafes.</p>
      <p>Source: <a class="text-brand-700 hover:underline" href="https://github.com/" target="_blank" rel="noopener">github.com</a></p>
      <p>Released under the MIT licence.</p>
    </div>
  {/if}
{/if}
