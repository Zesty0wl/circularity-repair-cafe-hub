<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { ExternalLink, Upload, Trash2, Eye, EyeOff, Save } from 'lucide-svelte';

  interface Me {
    id: string;
    email: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    role: string;
    showOnPublicPage: boolean;
    showOnHomePage: boolean;
  }

  let me: Me | null = null;
  let loading = true;
  let saving = false;
  let uploading = false;
  let savedAt: number | null = null;
  let error = '';

  // Form fields (local working copy)
  let displayName = '';
  let bio = '';
  let showOnPublicPage = true;
  let showOnHomePage = true;

  async function load() {
    loading = true;
    error = '';
    try {
      me = await api<Me>('/api/repairer/me');
      if (me) {
        displayName = me.displayName;
        bio = me.bio ?? '';
        showOnPublicPage = me.showOnPublicPage;
        showOnHomePage = me.showOnHomePage;
      }
    } catch (e: any) {
      error = e?.message ?? 'Could not load your profile';
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function save() {
    if (!me) return;
    saving = true;
    error = '';
    try {
      const updated = await api<Partial<Me>>('/api/repairer/me', {
        method: 'PATCH',
        json: {
          displayName: displayName.trim(),
          bio: bio.trim() || null,
          showOnPublicPage,
          showOnHomePage,
        },
      });
      Object.assign(me, updated);
      savedAt = Date.now();
    } catch (e: any) {
      error = e?.message ?? 'Could not save';
    } finally {
      saving = false;
    }
  }

  async function uploadAvatar(e: Event) {
    if (!me) return;
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    error = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ url: string }>('/api/repairer/me/avatar', { method: 'POST', formData: fd });
      me.avatarUrl = r.url;
      me = me; // trigger reactivity
    } catch (err: any) {
      error = err?.message ?? 'Could not upload photo';
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  async function removeAvatar() {
    if (!me?.avatarUrl) return;
    if (!confirm('Remove your photo?')) return;
    try {
      await api('/api/repairer/me/avatar', { method: 'DELETE' });
      me.avatarUrl = null;
      me = me;
    } catch (e: any) {
      error = e?.message ?? 'Could not remove photo';
    }
  }

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!)
      .join('')
      .toUpperCase();
  }
</script>

<header class="flex items-start justify-between gap-4 flex-wrap">
  <div>
    <h1 class="text-2xl font-bold">My profile</h1>
    <p class="text-slate-600 text-sm">This is what visitors see on the public team page.</p>
  </div>
  {#if me}
    <a href="/team/{me.id}" target="_blank" rel="noopener" class="btn-secondary text-sm">
      <ExternalLink size={14} /> View my public page
    </a>
  {/if}
</header>

{#if loading}
  <div class="card p-6 mt-4 text-center text-slate-500">Loading…</div>
{:else if me}
  <div class="grid md:grid-cols-3 gap-4 mt-4">
    <!-- Avatar -->
    <div class="card p-6 text-center md:col-span-1">
      <p class="text-sm text-slate-500 uppercase tracking-wide">Photo</p>
      <div class="mt-4 flex justify-center">
        {#if me.avatarUrl}
          <img src={me.avatarUrl} alt="" class="h-32 w-32 rounded-2xl object-cover ring-4 ring-white shadow-md" />
        {:else}
          <div class="h-32 w-32 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center text-3xl font-bold ring-4 ring-white shadow-md">
            {initials(displayName || me.displayName)}
          </div>
        {/if}
      </div>
      <label class="btn-primary mt-4 inline-flex cursor-pointer w-full justify-center">
        <Upload size={16} /> {me.avatarUrl ? 'Change photo' : 'Upload photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" on:change={uploadAvatar} disabled={uploading} />
      </label>
      {#if me.avatarUrl}
        <button class="btn-ghost text-sm mt-2 text-rose-600 inline-flex items-center gap-1" on:click={removeAvatar}>
          <Trash2 size={14} /> Remove photo
        </button>
      {/if}
      {#if uploading}<p class="text-xs text-slate-500 mt-2">Uploading…</p>{/if}
      <p class="text-xs text-slate-400 mt-3">JPEG, PNG or WebP. Max ~5 MB. Square photos look best.</p>
    </div>

    <!-- Details -->
    <div class="card p-6 md:col-span-2 space-y-4">
      <div>
        <label class="label" for="dn">Display name</label>
        <input id="dn" class="input" maxlength="100" bind:value={displayName} />
        <p class="text-xs text-slate-500 mt-1">How your name appears on the public team page and the live shop-floor board.</p>
      </div>

      <div>
        <label class="label" for="bio">About me <span class="font-normal text-slate-500">(optional)</span></label>
        <textarea
          id="bio"
          class="input"
          rows="6"
          maxlength="2000"
          placeholder={'A few sentences about you — what you love fixing, how you got into it, anything that makes you human.'}
          bind:value={bio}
        ></textarea>
        <p class="text-xs text-slate-500 mt-1">{bio.length}/2000 characters</p>
      </div>

      <label class="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" class="mt-1" bind:checked={showOnPublicPage} />
        <span>
          <span class="font-medium flex items-center gap-2">
            {#if showOnPublicPage}
              <Eye size={16} class="text-emerald-600" /> Show me on the public team page
            {:else}
              <EyeOff size={16} class="text-slate-400" /> Hide me from the public team page
            {/if}
          </span>
          <span class="block text-xs text-slate-500 mt-1">
            When hidden, your public profile returns "not found" and your card doesn't appear in the team listings.
          </span>
        </span>
      </label>

      <label class="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" class="mt-1" bind:checked={showOnHomePage} disabled={!showOnPublicPage} />
        <span>
          <span class="font-medium flex items-center gap-2">
            {#if showOnHomePage && showOnPublicPage}
              <Eye size={16} class="text-emerald-600" /> Feature me on the home page
            {:else}
              <EyeOff size={16} class="text-slate-400" /> Don't feature me on the home page
            {/if}
          </span>
          <span class="block text-xs text-slate-500 mt-1">
            {#if !showOnPublicPage}Turn on "Show me on the public team page" first.{:else}When off, you still appear on the team listing but not on the home page "Meet our team" strip.{/if}
          </span>
        </span>
      </label>

      {#if error}
        <p class="text-sm text-rose-600">{error}</p>
      {/if}

      <div class="flex items-center justify-end gap-3 pt-2">
        {#if savedAt && Date.now() - savedAt < 4000}
          <span class="text-sm text-emerald-700">Saved ✓</span>
        {/if}
        <button class="btn-primary" disabled={saving || !displayName.trim()} on:click={save}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  </div>

  <p class="text-xs text-slate-400 mt-6">
    Your skills, email address and join date are managed by your repair cafe's admin. Ask them if anything needs updating.
  </p>
{/if}
