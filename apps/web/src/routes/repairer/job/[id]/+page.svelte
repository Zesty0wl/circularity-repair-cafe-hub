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
  // While the cafe does PAT tests, an electrical item also has a PAT section.
  // "Fixed" stays greyed out until a result is chosen, and a failed item
  // cannot be marked as fixed. The server checks the same rules.
  //
  // Finishing used to be a drop-down and a pop-up to confirm. It is now three
  // big buttons, which is easier with greasy fingers and shows every choice.
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth';
  import { cafe } from '$lib/stores/cafe';
  import CameraCapture from '$lib/components/CameraCapture.svelte';
  import PatBadge from '$lib/components/PatBadge.svelte';
  import { clockTime, firstName, minutesBetween, statusLabel, formatDuration } from '$lib/staff/queue';
  import { PAT_RESULTS, type PatResult } from '@circularity/shared';
  import { ArrowLeft, Camera as CameraIcon, CheckCircle2, ChevronDown, NotebookPen, Package, User, XCircle, Zap } from 'lucide-svelte';
  import { t, tNow } from '$lib/i18n';

  $: id = $page.params.id;

  interface JobDetail {
    job: any;
    category: any;
    event: any;
    venue: any;
    repairer: any;
    images: Array<{ id: string; filePath: string; stage: string; caption: string | null; createdAt: string }>;
    /** Null while the cafe does not do PAT tests. */
    pat: {
      needed: boolean;
      itemIsElectrical: boolean | null;
      categoryIsElectrical: boolean;
      result: PatResult | null;
      testedAt: string | null;
      testedByName: string | null;
      notes: string | null;
    } | null;
    /** Set when the visitor pre-registered the item before the session. */
    preRegistration: { researchNotes: string | null; repairerName: string | null; createdAt: string } | null;
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
  /** The visitor's verdict at the exit, if they gave one. */
  let satisfaction: '' | 'satisfied' | 'not_satisfied' = '';
  let satisfactionComment = '';
  let savingFeedback = false;
  /** The PAT result chosen on this page, saved with the repair. */
  let patChoice: PatResult | null = null;
  let patNotes = '';
  let changingPat = false;

  $: myId = $auth?.user.id ?? null;
  $: status = detail?.job.status as string | undefined;
  $: isMine = !!detail && detail.job.repairerId === myId && status === 'in_progress';
  $: isFinished = status === 'completed' || status === 'cannot_repair' || status === 'returned';
  $: pat = detail?.pat ?? null;
  $: patNeeded = pat?.needed === true;
  // The result that will count: one chosen now, or one recorded earlier.
  $: patEffective = patChoice ?? (changingPat ? null : pat?.result ?? null);
  $: patBlocksFix = outcome === 'completed' && patNeeded && (!patEffective || patEffective === 'fail');

  async function load() {
    try {
      detail = await api<JobDetail>(`/api/repairer/jobs/${id}`);
      loadError = '';
      if (detail.job.outcomeNotes) outcomeNotes = detail.job.outcomeNotes;
      if (detail.job.partsUsed) partsUsed = detail.job.partsUsed;
      if (detail.job.environmentalSavingKg) savings = detail.job.environmentalSavingKg;
      co2FactorId = detail.job.co2FactorId ?? null;
      satisfaction = detail.job.satisfaction ?? '';
      if (detail.job.satisfactionComment) satisfactionComment = detail.job.satisfactionComment;
    } catch (err: any) {
      loadError =
        err?.status === 404
          ? tNow('We could not find this repair. It may have been removed.')
          : err?.message ?? tNow('Could not load this repair');
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
      error = err?.message ?? tNow('Could not start this repair');
    } finally {
      busy = false;
      confirmTakeOver = false;
    }
  }

  async function finish() {
    if (!outcome) {
      error = tNow('Choose how it went first.');
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
          pat: patNeeded && patChoice ? { result: patChoice, notes: patNotes.trim() || null } : undefined,
        },
      });
      goto(`/repairer?done=${encodeURIComponent(detail?.job.jobNumber ?? '')}&outcome=${outcome}`);
    } catch (err: any) {
      error = err?.message ?? tNow('Could not save this repair');
    } finally {
      busy = false;
    }
  }

  // Say whether this one item is electrical, whatever its category says.
  async function setElectrical(value: boolean) {
    error = '';
    try {
      await api(`/api/repairer/jobs/${id}/electrical`, { method: 'PATCH', json: { isElectrical: value } });
      await load();
    } catch (err: any) {
      error = err?.message ?? 'Could not save that change';
    }
  }

  async function release() {
    busy = true;
    error = '';
    try {
      await api(`/api/repairer/jobs/${id}/release`, { method: 'PATCH', json: {} });
      goto('/repairer');
    } catch (err: any) {
      error = err?.message ?? tNow('Could not put this back in the queue');
    } finally {
      busy = false;
    }
  }

  /** The visitor's verdict, recorded at the exit. */
  async function saveFeedback(value: 'satisfied' | 'not_satisfied' | '') {
    savingFeedback = true;
    error = '';
    try {
      await api(`/api/repairer/jobs/${id}/feedback`, {
        method: 'PATCH',
        json: { satisfaction: value || null, satisfactionComment: satisfactionComment.trim() || null },
      });
      await load();
    } catch (err: any) {
      error = err?.message ?? tNow('Could not save the answer');
    } finally {
      savingFeedback = false;
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
      error = err?.message ?? tNow('Could not upload the photo');
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

<svelte:head><title>{detail?.job.itemDescription ?? $t('Repair')}</title></svelte:head>

<a href="/repairer" class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-3"><ArrowLeft size={16} /> {$t('Repair queue')}</a>

{#if loadError}
  <div class="card p-6 max-w-lg">
    <h1 class="text-xl font-semibold">{$t('Something went wrong')}</h1>
    <p class="mt-2 text-slate-600">{loadError}</p>
    <div class="mt-4 flex gap-2">
      <button class="btn-secondary" on:click={load}>{$t('Try again')}</button>
      <a href="/repairer" class="btn-primary">{$t('Back to the queue')}</a>
    </div>
  </div>
{:else if !detail}
  <p class="text-slate-500">{$t('Loading…')}</p>
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
          <div class="flex flex-col items-end gap-1 shrink-0">
            <span class="badge badge-{detail.job.status}">{statusLabel(detail.job.status)}</span>
            {#if pat}<PatBadge needed={pat.needed} result={pat.result} />{/if}
          </div>
        </div>
        <dl class="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
          <div class="flex gap-2 items-start">
            <User size={16} class="text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt class="text-slate-500">{$t('Visitor')}</dt>
              <dd class="text-slate-900">{detail.job.customerName ?? $t('Not given')}{#if detail.job.customerContact}<span class="block text-slate-600">{detail.job.customerContact}</span>{/if}</dd>
            </div>
          </div>
          <div>
            <dt class="text-slate-500">{$t('Checked in')}</dt>
            <dd class="text-slate-900">{clockTime(detail.job.createdAt)} · {$t('waited {duration}', { duration: formatDuration(minutesBetween(detail.job.createdAt, detail.job.acceptedAt ? new Date(detail.job.acceptedAt).getTime() : Date.now())) })}</dd>
          </div>
          {#if detail.repairer && (status === 'in_progress' || isFinished)}
            <div>
              <dt class="text-slate-500">{isFinished ? $t('Repaired by') : $t('With')}</dt>
              <dd class="text-slate-900">{isMine ? $t('You') : detail.repairer.displayName}</dd>
            </div>
          {/if}
        </dl>
      </header>

      <section class="card p-5">
        <h2 class="font-semibold">{$t('What is wrong')}</h2>
        <p class="mt-2 text-slate-700 whitespace-pre-line">{detail.job.faultDescription}</p>
      </section>

      {#if detail.preRegistration?.researchNotes}
        <section class="card p-5">
          <h2 class="font-semibold flex items-center gap-2"><NotebookPen size={18} class="text-slate-500" /> Notes from before the session</h2>
          <p class="mt-1 text-xs text-slate-500">The visitor pre-registered this item.{detail.preRegistration.repairerName ? ` ${detail.preRegistration.repairerName} looked into it.` : ''}</p>
          <p class="mt-2 text-slate-700 whitespace-pre-line">{detail.preRegistration.researchNotes}</p>
        </section>
      {/if}

      <section class="card p-5">
        <div class="flex justify-between items-center gap-2">
          <h2 class="font-semibold">{$t('Photos')}</h2>
          {#if isMine && !showCamera}
            <button class="btn-secondary btn-sm" on:click={() => { cameraStage = 'during_repair'; showCamera = true; }}><CameraIcon size={16} /> {$t('Add a photo')}</button>
          {/if}
        </div>
        {#if detail.images.length === 0}
          <p class="mt-2 text-slate-500 text-sm">{$t('No photos yet.')}</p>
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
            <span class="text-sm text-slate-600">{$t('This photo is')}</span>
            <select bind:value={cameraStage} class="input !py-1.5 !text-sm w-auto">
              <option value="during_repair">{$t('during the repair')}</option>
              <option value="completed">{$t('of the finished repair')}</option>
            </select>
            <button class="btn-ghost btn-sm ml-auto" on:click={() => (showCamera = false)}>{$t('Cancel')}</button>
          </div>
          <div class="mt-3"><CameraCapture on:capture={onCapture} maxLongestEdge={2000} quality={0.82} /></div>
        {/if}
      </section>
    </div>

    <!-- ── What to do next ─────────────────────────────────────────── -->
    <div class="lg:col-span-2 space-y-4 lg:sticky lg:top-6">
      {#if status === 'waiting'}
        <section class="card p-5">
          <h2 class="font-semibold">{$t('Waiting for a repairer')}</h2>
          <p class="mt-1 text-sm text-slate-600">{$t('Start it and it is yours. Nobody else will pick it up.')}</p>
          <button class="btn-primary w-full mt-4" disabled={busy} on:click={claim}>{busy ? $t('Starting…') : $t('Start this repair')}</button>
        </section>
      {:else if status === 'awaiting_return'}
        <section class="card p-5">
          <h2 class="font-semibold">{$t('Coming back with a part')}</h2>
          {#if detail.job.outcomeNotes}<p class="mt-2 text-sm text-slate-700 whitespace-pre-line">{detail.job.outcomeNotes}</p>{/if}
          <p class="mt-2 text-sm text-slate-600">{$t('When the visitor is back, carry on with the repair here.')}</p>
          <button class="btn-primary w-full mt-4" disabled={busy} on:click={claim}>{busy ? $t('Starting…') : $t('They are back: carry on')}</button>
        </section>
      {:else if status === 'in_progress' && !isMine}
        <section class="card p-5">
          <h2 class="font-semibold">{$t('{name} is working on this', { name: firstName(detail.repairer?.displayName) || $t('Another repairer') })}</h2>
          <p class="mt-1 text-sm text-slate-600">{$t('Take it over if they have had to stop, or have handed it to you.')}</p>
          {#if confirmTakeOver}
            <div class="mt-4 grid grid-cols-2 gap-2">
              <button class="btn-ghost" on:click={() => (confirmTakeOver = false)}>{$t('Cancel')}</button>
              <button class="btn-primary" disabled={busy} on:click={claim}>{$t('Yes, take it over')}</button>
            </div>
          {:else}
            <button class="btn-secondary w-full mt-4" on:click={() => (confirmTakeOver = true)}>{$t('Take over this repair')}</button>
          {/if}
        </section>
      {:else if isMine}
        <section class="card p-5 space-y-4">
          <h2 class="font-semibold">{$t('How did it go?')}</h2>
          <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label={$t('Outcome')}>
            {#each OUTCOMES as o}
              <button
                type="button"
                role="radio"
                aria-checked={outcome === o.value}
                class="rounded-xl p-3 text-center ring-1 transition {outcome === o.value ? `ring-2 ${TONE[o.tone]}` : 'ring-slate-200 bg-white hover:bg-slate-50 text-slate-700'}"
                on:click={() => (outcome = o.value)}
              >
                <svelte:component this={o.icon} size={24} class="mx-auto" />
                <span class="block mt-1 text-sm font-semibold">{$t(o.label)}</span>
                <span class="block text-[0.7rem] leading-tight text-slate-500">{$t(o.hint)}</span>
              </button>
            {/each}
          </div>

          {#if pat}
            <div class="rounded-xl ring-1 {patNeeded ? 'ring-amber-200 bg-amber-50/60' : 'ring-slate-200'} p-4 space-y-3">
              <label class="flex items-start gap-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  class="h-5 w-5 rounded border-slate-300 text-brand-600 mt-0.5"
                  checked={patNeeded}
                  on:change={(e) => setElectrical(e.currentTarget.checked)}
                />
                <span>
                  <span class="font-medium text-slate-900">This is an electrical item</span>
                  <span class="block text-xs text-slate-500">
                    {#if pat.itemIsElectrical === null}Set from its category.{:else}Changed for this item.{/if}
                    Electrical items need a PAT test.
                  </span>
                </span>
              </label>

              {#if patNeeded}
                {#if pat.result && !changingPat}
                  <div class="text-sm">
                    <p class="flex items-center gap-2 flex-wrap"><PatBadge result={pat.result} /> <span class="text-slate-600">{#if pat.testedByName}by {pat.testedByName}{/if}{#if pat.testedAt} at {clockTime(pat.testedAt)}{/if}</span></p>
                    {#if pat.notes}<p class="mt-1 text-slate-700 whitespace-pre-line">{pat.notes}</p>{/if}
                    <button type="button" class="mt-2 text-sm text-slate-600 underline underline-offset-2" on:click={() => { changingPat = true; patChoice = null; }}>Test it again</button>
                  </div>
                {:else}
                  <div>
                    <p class="text-sm font-medium text-slate-900 flex items-center gap-1.5"><Zap size={16} class="text-amber-700" /> PAT test result</p>
                    <div class="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="PAT test result">
                      {#each PAT_RESULTS as r}
                        <button
                          type="button"
                          role="radio"
                          aria-checked={patChoice === r.value}
                          class="rounded-lg px-2 py-2 text-sm font-medium ring-1 transition {patChoice === r.value
                            ? r.value === 'pass'
                              ? 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-900'
                              : r.value === 'fail'
                                ? 'ring-2 ring-rose-500 bg-rose-50 text-rose-900'
                                : 'ring-2 ring-slate-500 bg-slate-50 text-slate-900'
                            : 'ring-slate-200 bg-white hover:bg-slate-50 text-slate-700'}"
                          on:click={() => (patChoice = r.value)}
                        >{r.label}</button>
                      {/each}
                    </div>
                    <label class="label mt-3" for="patnotes">PAT notes <span class="font-normal text-slate-400">(optional)</span></label>
                    <input id="patnotes" class="input" maxlength="500" placeholder="For example: battery only, or why it failed" bind:value={patNotes} />
                    <p class="mt-1 text-xs text-slate-500">Your name and the time are saved with the result.</p>
                  </div>
                {/if}
              {/if}
            </div>
          {/if}

          <div>
            <label class="label" for="notes">{$t(outcome === 'awaiting_return' ? 'Which part do they need to bring?' : outcome === 'cannot_repair' ? 'Why could it not be fixed?' : 'Notes')} <span class="font-normal text-slate-400">{$t('(the visitor sees these)')}</span></label>
            <textarea id="notes" class="input" rows="3" bind:value={outcomeNotes}></textarea>
          </div>
          <div>
            <label class="label" for="parts">{$t('Parts used')} <span class="font-normal text-slate-400">{$t('(optional)')}</span></label>
            <input id="parts" class="input" bind:value={partsUsed} />
          </div>

          {#if factors.length}
            <div class="rounded-xl ring-1 ring-slate-200">
              <button type="button" class="w-full flex items-center justify-between px-4 py-3 text-sm" on:click={() => (showCarbon = !showCarbon)} aria-expanded={showCarbon}>
                <span class="text-slate-700">{$t('Carbon saving:')} <strong>{savings !== '' && savings !== null ? $t('{n} kg (typed in)', { n: savings }) : estimate !== null ? $t('about {n} kg', { n: estimate }) : chosenFactor ? $t('no figure for this item') : $t('item type not chosen')}</strong></span>
                <ChevronDown size={16} class="transition {showCarbon ? 'rotate-180' : ''}" />
              </button>
              {#if showCarbon}
                <div class="px-4 pb-4 space-y-3">
                  <div>
                    <label class="label" for="ctype">{$t('What kind of thing is it?')}</label>
                    <select id="ctype" class="input" bind:value={co2FactorId}>
                      <option value={null}>{$t('Not recorded')}</option>
                      {#each factorGroups as group}
                        <optgroup label={group.name}>
                          {#each group.types as type (type.id)}
                            <option value={type.id}>{type.label}</option>
                          {/each}
                        </optgroup>
                      {/each}
                    </select>
                    <p class="text-xs text-slate-500 mt-1"><a class="underline" href="/about#carbon" target="_blank">{$t('How the figure is worked out')}</a></p>
                  </div>
                  <div>
                    <label class="label" for="esv">{$t('Or type a figure (kg, optional)')}</label>
                    <input id="esv" class="input" type="number" step="0.001" min="0" bind:value={savings} />
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          {#if patBlocksFix}
            <p class="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
              {#if patEffective === 'fail'}This item failed its PAT test, so it cannot be marked as fixed. Choose "Could not fix", or test it again.
              {:else}This is an electrical item. Choose the PAT test result before you mark it as fixed.{/if}
            </p>
          {/if}
          {#if error}<p class="text-sm text-rose-700">{error}</p>{/if}
          <button class="btn-primary w-full" disabled={busy || !outcome || patBlocksFix} on:click={finish}>
            {busy ? $t('Saving…') : outcome === 'awaiting_return' ? $t('Save and pause') : outcome ? $t('Save and finish') : $t('Choose how it went')}
          </button>

          <div class="pt-2 border-t border-slate-100">
            {#if confirmRelease}
              <p class="text-sm text-slate-700">{$t('Put it back so someone else can pick it up?')}</p>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <button class="btn-ghost btn-sm" on:click={() => (confirmRelease = false)}>{$t('Keep it')}</button>
                <button class="btn-secondary btn-sm" disabled={busy} on:click={release}>{$t('Put it back')}</button>
              </div>
            {:else}
              <button class="text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2" on:click={() => (confirmRelease = true)}>{$t('Put it back in the queue')}</button>
            {/if}
          </div>
        </section>
      {:else if isFinished}
        <section class="card p-5 space-y-2">
          <h2 class="font-semibold">{statusLabel(detail.job.status)}{#if detail.job.completedAt} {$t('at {time}', { time: clockTime(detail.job.completedAt) })}{/if}</h2>
          {#if detail.job.outcomeNotes}<p class="text-sm text-slate-700 whitespace-pre-line">{detail.job.outcomeNotes}</p>{/if}
          {#if detail.job.partsUsed}<p class="text-sm"><span class="text-slate-500">{$t('Parts:')}</span> {detail.job.partsUsed}</p>{/if}
          {#if detail.job.co2SavingKg && Number(detail.job.co2SavingKg) > 0}<p class="text-sm"><span class="text-slate-500">{$t('Carbon saved:')}</span> {Number(detail.job.co2SavingKg)} kg</p>{/if}
          {#if pat?.result}
            <p class="text-sm flex items-center gap-2 flex-wrap"><PatBadge result={pat.result} /> <span class="text-slate-600">{#if pat.testedByName}{$t('by {name}', { name: pat.testedByName })} {/if}{#if pat.testedAt}{$t('at {time}', { time: clockTime(pat.testedAt) })}{/if}</span></p>
            {#if pat.notes}<p class="text-sm text-slate-700">{pat.notes}</p>{/if}
          {/if}
          {#if $cafe?.askSatisfactionEnabled}
          <div class="pt-3 mt-1 border-t border-slate-100">
            <p class="text-sm font-medium text-slate-700">{$t('At the exit, was the visitor satisfied?')}</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-xl px-4 py-2 text-sm font-semibold ring-1 transition {satisfaction === 'satisfied' ? 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-900' : 'ring-slate-200 bg-white hover:bg-slate-50 text-slate-700'}"
                disabled={savingFeedback}
                on:click={() => saveFeedback('satisfied')}
              >{$t('Satisfied')}</button>
              <button
                type="button"
                class="rounded-xl px-4 py-2 text-sm font-semibold ring-1 transition {satisfaction === 'not_satisfied' ? 'ring-2 ring-rose-500 bg-rose-50 text-rose-900' : 'ring-slate-200 bg-white hover:bg-slate-50 text-slate-700'}"
                disabled={savingFeedback}
                on:click={() => saveFeedback('not_satisfied')}
              >{$t('Not satisfied')}</button>
              {#if satisfaction}
                <button type="button" class="text-sm text-slate-500 underline underline-offset-2" disabled={savingFeedback} on:click={() => saveFeedback('')}>{$t('Clear')}</button>
              {/if}
            </div>
            <input class="input mt-3" maxlength="500" placeholder={$t('Comment (optional)')} bind:value={satisfactionComment} on:change={() => satisfaction && saveFeedback(satisfaction)} />
          </div>
          {/if}
        </section>
      {/if}
      {#if error && !isMine}<p class="text-sm text-rose-700">{error}</p>{/if}
    </div>
  </div>
{/if}
