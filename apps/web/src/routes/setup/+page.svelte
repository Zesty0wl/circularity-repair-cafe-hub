<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { loadCafe, loadSetupStatus } from '$lib/stores/cafe';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import { CheckCircle2, Wrench } from 'lucide-svelte';
  import { onMount } from 'svelte';

  const TOTAL = 6;
  let step = 1;

  let admin = { displayName: '', email: '', password: '', confirm: '' };
  let cafe = { name: '', tagline: '', contactEmail: '', websiteUrl: '', description: '' };
  let venue = { name: '', addressLine1: '', addressLine2: '', town: '', postcode: '', notes: '' };
  let publicUrl = '';

  let busy = false;
  let error = '';
  let validating = false;
  let urlOk: boolean | null = null;

  onMount(() => {
    if (typeof window !== 'undefined') publicUrl = window.location.origin;
  });

  function passwordValid(): string | null {
    if (admin.password.length < 10) return 'At least 10 characters';
    if (!/[A-Z]/.test(admin.password)) return 'Needs an uppercase letter';
    if (!/[a-z]/.test(admin.password)) return 'Needs a lowercase letter';
    if (!/[0-9]/.test(admin.password)) return 'Needs a number';
    if (admin.password !== admin.confirm) return 'Passwords do not match';
    return null;
  }

  function emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email);
  }

  function next() {
    error = '';
    if (step === 2) {
      if (!admin.displayName.trim()) return (error = 'Please enter your name');
      if (!emailValid()) return (error = 'Please enter a valid email');
      const pe = passwordValid();
      if (pe) return (error = pe);
    }
    if (step === 3) {
      if (!cafe.name.trim()) return (error = 'Please enter the cafe name');
    }
    if (step === 4) {
      if (!venue.name.trim()) return (error = 'Please enter your venue name');
    }
    if (step === 5) {
      if (!publicUrl.trim()) return (error = 'Public URL is required');
      try { new URL(publicUrl); } catch { return (error = 'Please enter a valid URL'); }
    }
    step++;
  }

  function prev() {
    error = '';
    if (step > 1) step--;
  }

  async function pingUrl() {
    validating = true;
    urlOk = null;
    try {
      const res = await fetch('/api/public/ping');
      urlOk = res.ok;
    } catch {
      urlOk = false;
    } finally {
      validating = false;
    }
  }

  function joinAddress(): string {
    return [venue.addressLine1, venue.addressLine2, venue.town].filter((x) => x.trim()).join('\n');
  }

  async function submit() {
    busy = true;
    error = '';
    try {
      const payload = {
        admin: {
          displayName: admin.displayName.trim(),
          email: admin.email.trim().toLowerCase(),
          password: admin.password,
        },
        cafe: {
          name: cafe.name.trim(),
          tagline: cafe.tagline.trim() || null,
          contactEmail: cafe.contactEmail.trim() || null,
          websiteUrl: cafe.websiteUrl.trim() || null,
          description: cafe.description.trim() || null,
        },
        venue: {
          name: venue.name.trim(),
          address: joinAddress() || null,
          postcode: venue.postcode.trim() || null,
          notes: venue.notes.trim() || null,
        },
        publicUrl: publicUrl.trim(),
      };
      const body = await api<{ accessToken: string; user: any }>('/api/setup/complete', {
        method: 'POST',
        json: payload,
        autoRefresh: false,
      });
      auth.set({ accessToken: body.accessToken, user: body.user });
      await loadSetupStatus();
      await loadCafe();
      goto('/admin/dashboard');
    } catch (err: any) {
      error = err?.message || 'Setup failed';
    } finally {
      busy = false;
    }
  }
</script>

<main class="min-h-screen bg-slate-100 py-10 px-4">
  <div class="max-w-xl mx-auto">
    <div class="flex items-center gap-3 mb-8">
      <span class="h-10 w-10 rounded-xl bg-brand-600 text-white inline-flex items-center justify-center"><Wrench size={20} /></span>
      <span class="font-semibold text-lg">Circularity Repair Cafe Hub</span>
    </div>
    <ProgressBar current={step} total={TOTAL} />

    <div class="mt-6 card p-8">
      {#if step === 1}
        <h1 class="text-3xl font-bold">Welcome</h1>
        <p class="mt-3 text-slate-700">This wizard will set up your repair cafe hub. We'll create your admin account, configure your cafe details and home venue, and have you ready in just a few minutes.</p>
        <button class="btn-primary mt-8 w-full" on:click={next}>Let's get started</button>
      {:else if step === 2}
        <h1 class="text-3xl font-bold">Create your admin account</h1>
        <p class="mt-2 text-slate-600">This account will be the system administrator. You can add more team members later.</p>
        <div class="mt-6 space-y-4">
          <div>
            <label class="label" for="dn">Your name</label>
            <input id="dn" class="input" bind:value={admin.displayName} autocomplete="name" />
          </div>
          <div>
            <label class="label" for="em">Email address</label>
            <input id="em" type="email" class="input" bind:value={admin.email} autocomplete="email" />
          </div>
          <div>
            <label class="label" for="pw">Password</label>
            <input id="pw" type="password" class="input" bind:value={admin.password} autocomplete="new-password" />
            <p class="mt-1 text-xs text-slate-500">Min 10 chars, with upper/lower case and a number.</p>
          </div>
          <div>
            <label class="label" for="cf">Confirm password</label>
            <input id="cf" type="password" class="input" bind:value={admin.confirm} autocomplete="new-password" />
          </div>
        </div>
      {:else if step === 3}
        <h1 class="text-3xl font-bold">Your repair cafe</h1>
        <div class="mt-6 space-y-4">
          <div>
            <label class="label" for="cn">Repair cafe name</label>
            <input id="cn" class="input" bind:value={cafe.name} />
          </div>
          <div>
            <label class="label" for="ct">Tagline (optional)</label>
            <input id="ct" class="input" maxlength="120" bind:value={cafe.tagline} />
          </div>
          <div>
            <label class="label" for="ce">Contact email (optional)</label>
            <input id="ce" type="email" class="input" bind:value={cafe.contactEmail} />
          </div>
          <div>
            <label class="label" for="cw">Website (optional)</label>
            <input id="cw" type="url" class="input" placeholder="https://..." bind:value={cafe.websiteUrl} />
          </div>
          <div>
            <label class="label" for="cd">About (optional)</label>
            <textarea id="cd" class="input" rows="4" bind:value={cafe.description}></textarea>
          </div>
        </div>
      {:else if step === 4}
        <h1 class="text-3xl font-bold">Your home venue</h1>
        <p class="mt-2 text-slate-600">Where do you usually hold events?</p>
        <div class="mt-6 space-y-4">
          <div>
            <label class="label" for="vn">Venue name</label>
            <input id="vn" class="input" bind:value={venue.name} />
          </div>
          <div>
            <label class="label" for="va1">Address line 1</label>
            <input id="va1" class="input" bind:value={venue.addressLine1} />
          </div>
          <div>
            <label class="label" for="va2">Address line 2 (optional)</label>
            <input id="va2" class="input" bind:value={venue.addressLine2} />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="vt">Town / city</label>
              <input id="vt" class="input" bind:value={venue.town} />
            </div>
            <div>
              <label class="label" for="vp">Postcode</label>
              <input id="vp" class="input" bind:value={venue.postcode} />
            </div>
          </div>
          <div>
            <label class="label" for="vno">Notes (parking, accessibility — optional)</label>
            <textarea id="vno" class="input" rows="3" bind:value={venue.notes}></textarea>
          </div>
        </div>
      {:else if step === 5}
        <h1 class="text-3xl font-bold">Your public URL</h1>
        <p class="mt-2 text-slate-600">This is the web address where your hub is hosted. We need this to generate QR codes for your customers.</p>
        <div class="mt-6 space-y-3">
          <div>
            <label class="label" for="pu">Public URL</label>
            <input id="pu" type="url" class="input" bind:value={publicUrl} />
          </div>
          <div class="flex items-center gap-3">
            <button class="btn-secondary" type="button" on:click={pingUrl} disabled={validating}>{validating ? 'Checking…' : 'Check URL'}</button>
            {#if urlOk === true}<span class="text-emerald-700 text-sm">✓ Server reachable</span>{/if}
            {#if urlOk === false}<span class="text-amber-700 text-sm">Could not verify (you can still continue)</span>{/if}
          </div>
        </div>
      {:else if step === 6}
        <h1 class="text-3xl font-bold">Ready</h1>
        <p class="mt-2 text-slate-600">Review your setup:</p>
        <dl class="mt-6 space-y-2 text-sm">
          <div class="flex justify-between border-b border-slate-100 pb-2"><dt class="text-slate-500">Cafe name</dt><dd class="font-medium">{cafe.name}</dd></div>
          <div class="flex justify-between border-b border-slate-100 pb-2"><dt class="text-slate-500">Admin email</dt><dd class="font-medium">{admin.email}</dd></div>
          <div class="flex justify-between border-b border-slate-100 pb-2"><dt class="text-slate-500">Home venue</dt><dd class="font-medium">{venue.name}</dd></div>
          <div class="flex justify-between border-b border-slate-100 pb-2"><dt class="text-slate-500">Public URL</dt><dd class="font-medium break-all">{publicUrl}</dd></div>
        </dl>
        <button class="btn-primary mt-8 w-full" disabled={busy} on:click={submit}>
          <CheckCircle2 size={18} /> Complete setup and open my hub
        </button>
      {/if}

      {#if error}
        <p class="mt-4 text-sm text-rose-600">{error}</p>
      {/if}

      {#if step > 1 && step < 6}
        <div class="mt-8 flex justify-between">
          <button class="btn-ghost" type="button" on:click={prev}>Back</button>
          <button class="btn-primary" type="button" on:click={next}>Next</button>
        </div>
      {:else if step === 6}
        <div class="mt-3"><button class="btn-ghost" type="button" on:click={prev}>Back</button></div>
      {/if}
    </div>
  </div>
</main>
