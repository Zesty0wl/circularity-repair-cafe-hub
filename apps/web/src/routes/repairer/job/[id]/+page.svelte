<script lang="ts">
  // One repair. What it is, what is wrong, the photos, and whatever you can
  // do with it next, which depends on where it has got to:
  //
  //   waiting                Start this repair
  //   coming back for a part Carry on (the visitor is back)
  //   someone else's         Take over, after a second tap to be sure
  //   yours                  Finish: pick how it went, add notes, save
  //   finished               What happened
  //
  // Finishing used to be a drop-down and a pop-up to confirm. It is now three
  // big buttons, which is easier with greasy fingers and shows every choice.
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import { clockTime, firstName, formatMinutes, minutesBetween, statusLabel } from '$lib/staff/queue';
  import { ArrowLeft, Camera as CameraIcon, CheckCircle2, ChevronDown, Package, User, XCircle } from 'lucide-svelte';

  $: id = $page.params.id;

  interface JobDetail {
    job: any;
    category: any;
    event: any;
    venue: any;
    repairer: any;
    images: Array<{ id: string; filePath: string; stage: string; caption: string | null; createdAt: string }>;
  }

  type Outcome = 'completed' | 'cannot_repair' | 'awaiting_return';

  let detail: JobDetail | null = null;
  let loadError = '';
  let outcome: Outcome | null = null;
  let outcomeNotes = '';
  let partsUsed = '';
  let savings: number | string = '';
  /** What kind of thing it is, which is what the carbon figure comes from. */
  let co2FactorId: string | null = null;
  let factors: Array<{ id: string; label: string; category: string; co2eKg: number | null }> = [];
  let displacementRate = 0.5;
  let showCarbon = false;
  let busy = false;
  let error = '';
  let showCamera = false;
  let cameraStage: 'during_repair' | 'completed' = 'during_repair';
  let confirmTakeOver = false;
  let confirmRelease = false;

  $: myId = $auth?.user.id ?? null;
  $: status = detail?.job.status as string | undefined;
  $: isMine = !!detail && detail.job.repairerId === myId && status === 'in_progress';
  $: isFinished = status === 'completed' || status === 'cannot_repair' || status === 'returned';

  async function load() {
    try {
      detail = await api<JobDetail>(`/api/repairer/jobs/${id}`);
      loadError = '';
      if (detail.job.outcomeNotes) outcomeNotes = detail.job.outcomeNotes;
      if (detail.job.partsUsed) partsUsed = detail.job.partsUsed;
      if (detail.job.environmentalSavingKg) savings = detail.job.environmentalSavingKg;
      co2FactorId = detail.job.co2FactorId ?? null;
    } catch (err: any) {
      loadError = err?.status === 404 ? 'We could not find this repair. It may have been removed.' : err?.message ?? 'Could not load this repair';
    }
  }

  /** Grouped for the drop-down, so a long list is still easy to scan. */
  $: factorGroups = Array.from(
    factors.reduce((map, f) => {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
      return map;
    }, new Map<string, typeof factors>()),
  ).map(([name, types]) => ({ name, types }));

  $: chosenFactor = factors.find((f) => f.id === co2FactorId) ?? null;
  $: estimate = chosenFactor?.co2eKg ? Math.round(chosenFactor.co2eKg * displacementRate * 10) / 10 : null;

  onMount(async () => {
    await load();
    try {
      const res = await fetch('/api/public/co2-factors');
      if (!res.ok) return;
      const body = (await res.json()) as { enabled: boolean; displacementRate: number; factors: typeof factors };
      if (!body.enabled) return;
      factors = body.factors;
      displacementRate = body.displacementRate;
    } catch {
      /* the picker just stays empty */
    }
  });

  async function claim() {
    busy = true;
    error = '';
    try {
      await api(`/api/repairer/jobs/${id}/accept`, { method: 'PATCH', json: {} });
      await load();
    } catch (err: any) {
      error = err?.message ?? 'Could not start this repair';
    } finally {
      busy = false;
      confirmTakeOver = false;
    }
  }

  async function finish() {
    if (!outcome) {
      error = 'Choose how it went first.';
      return;
    }
    busy = true;
    error = '';
    try {
      await api(`/api/repairer/jobs/${id}/complete`, {
        method: 'PATCH',
        json: {
          outcome,
          outcomeNotes: outcomeNotes.trim() || null,
          partsUsed: partsUsed.trim() || null,
          environmentalSavingKg: savings === '' || savings === null ? null : Number(savings),
          co2FactorId,
        },
      });
      goto(`/repairer?done=${encodeURIComponent(detail?.job.jobNumber ?? '')}&outcome=${outcome}`);
    } catch (err: any) {
      error = err?.message ?? 'Could not save this repair';
    } finally {
      busy = false;
    }
  }

  async function release() {
    busy = true;
    error = '';
    try {
      await api(`/api/repairer/jobs/${id}/release`, { method: 'PATCH', json: {} });
      goto('/repairer');
    } catch (err: any) {
      error = err?.message ?? 'Could not put this back in the queue';
    } finally {
      busy = false;
    }
  }

  async function onCapture(e: CustomEvent<{ blob: Blob; previewUrl: string }>) {
    const fd = new FormData();
    fd.append('image', e.detail.blob, 'photo.jpg');
    try {
      await api(`/api/repairer/jobs/${id}/image?stage=${cameraStage}`, { method: 'POST', formData: fd });
      showCamera = false;
      await load();
    } catch (err: any) {
      error = err?.message ?? 'Could not upload the photo';
    }
  }

  const OUTCOMES: Array<{ value: Outcome; label: string; hint: string; icon: typeof CheckCircle2; tone: string }> = [
    { value: 'completed', label: 'Fixed', hint: 'It works again', icon: CheckCircle2, tone: 'emerald' },
    { value: 'cannot_repair', label: 'Could not fix', hint: 'Say why in the notes', icon: XCircle, tone: 'rose' },
    { value: 'awaiting_return', label: 'Coming back', hint: 'They will bring a part', icon: Package, tone: 'violet' },
  ];

  const TONE: Record<string, string> = {
    emerald: 'ring-emerald-500 bg-emerald-50 text-emerald-900',
    rose: 'ring-rose-500 bg-rose-50 text-rose-900',
    violet: 'ring-violet-500 bg-violet-50 text-violet-900',
  };
</script>

<svelte:head><title>{detail?.job.itemDescription ?? 'Repair'}</title></svelte:head>

<a href="/repairer" class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-3"><ArrowLeft size={16} /> Repair queue</a>

{#if loadError}
  <div class="card p-6 max-w-lg">
    <h1 class="text-xl font-semibold">Something went wrong</h1>
    <p class="mt-2 text-slate-600">{loadError}</p>
    <div class="mt-4 flex gap-2">
      <button class="btn-secondary" on:click={load}>Try again</button>
      <a href="/repairer" class="btn-primary">Back to the queue</a>
    </div>
  </div>
{:else if !detail}
  <p class="text-slate-500">Loading…</p>
{:else}
  <div class="grid lg:grid-cols-5 gap-4 items-start">
    <!-- ── What it is ──────────────────────────────────────────────── -->
    <div class="lg:col-span-3 space-y-4">
      <header class="card p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-slate-500 font-mono">{detail.job.jobNumber}</p>
            <h1 class="text-2xl font-bold leading-tight mt-0.5">{detail.job.itemDescription}</h1>
            <p class="text-slate-600 text-sm mt-1">
              {#if detail.category?.name}<span class="font-medium" style="color: {detail.category.colour}">{detail.category.name}</span>{/if}
              {#if detail.job.itemBrand}{detail.category?.name ? ' · ' : ''}{detail.job.itemBrand}{/if}
            </p>
          </div>
          <span class="badge badge-{detail.job.status} shrink-0">{statusLabel(detail.job.status)}</span>
        </div>
        <dl class="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
          <div class="flex gap-2 items-start">
            <User size={16} class="text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt class="text-slate-500">Visitor</dt>
              <dd class="text-slate-900">{detail.job.customerName ?? 'Not given'}{#if detail.job.customerContact}<span class="block text-slate-600">{detail.job.customerContact}</span>{/if}</dd>
            </div>
          </div>
          <div>
            <dt class="text-slate-500">Checked in</dt>
            <dd class="text-slate-900">{clockTime(detail.job.createdAt)} · waited {formatMinutes(minutesBetween(detail.job.createdAt, detail.job.acceptedAt ? new Date(detail.job.acceptedAt).getTime() : Date.now())).toLowerCase()}</dd>
          </div>
          {#if detail.repairer && (status === 'in_progress' || isFinished)}
            <div>
              <dt class="text-slate-500">{isFinished ? 'Repaired by' : 'With'}</dt>
              <dd class="text-slate-900">{isMine ? 'You' : detail.repairer.displayName}</dd>
            </div>
          {/if}
        </dl>
      </header>

      <section class="card p-5">
        <h2 class="font-semibold">What is wrong</h2>
        <p class="mt-2 text-slate-700 whitespace-pre-line">{detail.job.faultDescription}</p>
      </section>

      <section class="card p-5">
        <div class="flex justify-between items-center gap-2">
          <h2 class="font-semibold">Photos</h2>
          {#if isMine && !showCamera}
            <button class="btn-secondary btn-sm" on:click={() => { cameraStage = 'during_repair'; showCamera = true; }}><CameraIcon size={16} /> Add a photo</button>
          {/if}
        </div>
        {#if detail.images.length === 0}
          <p class="mt-2 text-slate-500 text-sm">No photos yet.</p>
        {:else}
          <div class="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {#each detail.images as img}
              <a href={`/uploads/${img.filePath}`} target="_blank" rel="noopener" class="block">
                <img src={`/uploads/${img.filePath}`} alt={img.stage.replace('_', ' ')} class="w-full aspect-square object-cover rounded-xl ring-1 ring-slate-200" />
              </a>
            {/each}
          </div>
        {/if}
        {#if showCamera && isMine}
          <div class="mt-4 flex gap-2 items-center flex-wrap">
            <span class="text-sm text-slate-600">This photo is</span>
            <select bind:value={cameraStage} class="input !py-1.5 !text-sm w-auto">
              <option value="during_repair">during the repair</option>
              <option value="completed">of the finished repair</option>
            </select>
            <button class="btn-ghost btn-sm ml-auto" on:click={() => (showCamera = false)}>Cancel</button>
          </div>
          <div class="mt-3"><CameraCapture on:capture={onCapture} maxLongestEdge={2000} quality={0.82} /></div>
        {/if}
      </section>
    </div>

    <!-- ── What to do next ─────────────────────────────────────────── -->
    <div class="lg:col-span-2 space-y-4 lg:sticky lg:top-6">
      {#if status === 'waiting'}
        <section class="card p-5">
          <h2 class="font-semibold">Waiting for a repairer</h2>
          <p class="mt-1 text-sm text-slate-600">Start it and it is yours. Nobody else will pick it up.</p>
          <button class="btn-primary w-full mt-4" disabled={busy} on:click={claim}>{busy ? 'Starting…' : 'Start this repair'}</button>
        </section>
      {:else if status === 'awaiting_return'}
        <section class="card p-5">
          <h2 class="font-semibold">Coming back with a part</h2>
          {#if detail.job.outcomeNotes}<p class="mt-2 text-sm text-slate-700 whitespace-pre-line">{detail.job.outcomeNotes}</p>{/if}
          <p class="mt-2 text-sm text-slate-600">When the visitor is back, carry on with the repair here.</p>
          <button class="btn-primary w-full mt-4" disabled={busy} on:click={claim}>{busy ? 'Starting…' : 'They are back: carry on'}</button>
        </section>
      {:else if status === 'in_progress' && !isMine}
        <section class="card p-5">
          <h2 class="font-semibold">{firstName(detail.repairer?.displayName) || 'Another repairer'} is working on this</h2>
          <p class="mt-1 text-sm text-slate-600">Take it over if they have had to stop, or have handed it to you.</p>
          {#if confirmTakeOver}
            <div class="mt-4 grid grid-cols-2 gap-2">
              <button class="btn-ghost" on:click={() => (confirmTakeOver = false)}>Cancel</button>
              <button class="btn-primary" disabled={busy} on:click={claim}>Yes, take it over</button>
            </div>
          {:else}
            <button class="btn-secondary w-full mt-4" on:click={() => (confirmTakeOver = true)}>Take over this repair</button>
          {/if}
        </section>
      {:else if isMine}
        <section class="card p-5 space-y-4">
          <h2 class="font-semibold">How did it go?</h2>
          <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Outcome">
            {#each OUTCOMES as o}
              <button
                type="button"
                role="radio"
                aria-checked={outcome === o.value}
                class="rounded-xl p-3 text-center ring-1 transition {outcome === o.value ? `ring-2 ${TONE[o.tone]}` : 'ring-slate-200 bg-white hover:bg-slate-50 text-slate-700'}"
                on:click={() => (outcome = o.value)}
              >
                <svelte:component this={o.icon} size={24} class="mx-auto" />
                <span class="block mt-1 text-sm font-semibold">{o.label}</span>
                <span class="block text-[0.7rem] leading-tight text-slate-500">{o.hint}</span>
              </button>
            {/each}
          </div>
          <div>
            <label class="label" for="notes">{outcome === 'awaiting_return' ? 'Which part do they need to bring?' : outcome === 'cannot_repair' ? 'Why could it not be fixed?' : 'Notes'} <span class="font-normal text-slate-400">(the visitor sees these)</span></label>
            <textarea id="notes" class="input" rows="3" bind:value={outcomeNotes}></textarea>
          </div>
          <div>
            <label class="label" for="parts">Parts used <span class="font-normal text-slate-400">(optional)</span></label>
            <input id="parts" class="input" bind:value={partsUsed} />
          </div>

          {#if factors.length}
            <div class="rounded-xl ring-1 ring-slate-200">
              <button type="button" class="w-full flex items-center justify-between px-4 py-3 text-sm" on:click={() => (showCarbon = !showCarbon)} aria-expanded={showCarbon}>
                <span class="text-slate-700">Carbon saving: <strong>{savings !== '' && savings !== null ? `${savings} kg (typed in)` : estimate !== null ? `about ${estimate} kg` : chosenFactor ? 'no figure for this item' : 'item type not chosen'}</strong></span>
                <ChevronDown size={16} class="transition {showCarbon ? 'rotate-180' : ''}" />
              </button>
              {#if showCarbon}
                <div class="px-4 pb-4 space-y-3">
                  <div>
                    <label class="label" for="ctype">What kind of thing is it?</label>
                    <select id="ctype" class="input" bind:value={co2FactorId}>
                      <option value={null}>Not recorded</option>
                      {#each factorGroups as group}
                        <optgroup label={group.name}>
                          {#each group.types as type (type.id)}
                            <option value={type.id}>{type.label}</option>
                          {/each}
                        </optgroup>
                      {/each}
                    </select>
                    <p class="text-xs text-slate-500 mt-1"><a class="underline" href="/about#carbon" target="_blank">How the figure is worked out</a></p>
                  </div>
                  <div>
                    <label class="label" for="esv">Or type a figure (kg, optional)</label>
                    <input id="esv" class="input" type="number" step="0.001" min="0" bind:value={savings} />
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          {#if error}<p class="text-sm text-rose-700">{error}</p>{/if}
          <button class="btn-primary w-full" disabled={busy || !outcome} on:click={finish}>
            {busy ? 'Saving…' : outcome === 'awaiting_return' ? 'Save and pause' : outcome ? 'Save and finish' : 'Choose how it went'}
          </button>

          <div class="pt-2 border-t border-slate-100">
            {#if confirmRelease}
              <p class="text-sm text-slate-700">Put it back so someone else can pick it up?</p>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <button class="btn-ghost btn-sm" on:click={() => (confirmRelease = false)}>Keep it</button>
                <button class="btn-secondary btn-sm" disabled={busy} on:click={release}>Put it back</button>
              </div>
            {:else}
              <button class="text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2" on:click={() => (confirmRelease = true)}>Put it back in the queue</button>
            {/if}
          </div>
        </section>
      {:else if isFinished}
        <section class="card p-5 space-y-2">
          <h2 class="font-semibold">{statusLabel(detail.job.status)}{#if detail.job.completedAt} at {clockTime(detail.job.completedAt)}{/if}</h2>
          {#if detail.job.outcomeNotes}<p class="text-sm text-slate-700 whitespace-pre-line">{detail.job.outcomeNotes}</p>{/if}
          {#if detail.job.partsUsed}<p class="text-sm"><span class="text-slate-500">Parts:</span> {detail.job.partsUsed}</p>{/if}
          {#if detail.job.co2SavingKg && Number(detail.job.co2SavingKg) > 0}<p class="text-sm"><span class="text-slate-500">Carbon saved:</span> {Number(detail.job.co2SavingKg)} kg</p>{/if}
        </section>
      {/if}
      {#if error && !isMine}<p class="text-sm text-rose-700">{error}</p>{/if}
    </div>
  </div>
{/if}
