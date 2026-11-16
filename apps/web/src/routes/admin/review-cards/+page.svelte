<script lang="ts">
  // A sheet of cards to hand out with finished repairs, asking for a review on
  // Google. Eight cards fill one A4 page, two across and four down, with light
  // dashed lines to cut along.
  //
  // The QR code and the address on each card point at the hub's own /review
  // address (routes/reviews.ts), not at Google. It is short enough to type, and
  // cards already handed out keep working if the cafe changes its Google link.
  import { onMount } from 'svelte';
  import { Printer, ArrowLeft } from 'lucide-svelte';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';

  const CARDS = 8;

  let cafe: any = null;
  let ready = false;
  let qrLoaded = 0;

  onMount(async () => {
    cafe = await api('/api/admin/settings');
    ready = true;
  });

  $: publicUrl = (cafe?.publicUrl ?? '').replace(/\/$/, '');
  $: shortAddress = publicUrl ? `${publicUrl.replace(/^https?:\/\//, '')}/review` : '';
  $: hasReviews = !!(cafe?.googleReview ?? '').trim();
  // The same image eight times: the browser fetches it once.
  const qrSrc = '/api/public/review-qr.png';
</script>

<svelte:head>
  <title>{$t('Review cards')}</title>
  <!-- In the head, not in a <style> block: a route's styles stay loaded for
       the rest of the visit, and this page size must not reach other printouts.
       In print, the admin area's padding goes, so the sheet fills the page. -->
  {@html '<style>@page { size: A4; margin: 0; } @media print { main.staff { padding: 0 !important; margin: 0 !important; max-width: none !important; } }</style>'}
</svelte:head>

<div class="no-print max-w-3xl">
  <a href="/admin/settings" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={14} /> {$t('Settings')}</a>
  <h1 class="text-2xl font-bold mt-1">{$t('Review cards')}</h1>
  <p class="mt-2 text-slate-600">
    {$t('Print this sheet and cut it into eight cards. Hand one to each visitor with their item, whether or not it was fixed. The QR code takes them to your Google review page.')}
  </p>
  {#if ready && !hasReviews}
    <p class="mt-4 rounded-lg bg-amber-50 text-amber-900 px-4 py-3 text-sm">
      {$t('First add your Google Maps link in Settings, under Cafe profile, Google reviews. The cards need it.')}
    </p>
  {:else if ready}
    <button class="btn-primary mt-4" on:click={() => window.print()} disabled={qrLoaded === 0}>
      <Printer size={16} /> {$t('Print')}
    </button>
    <p class="text-xs text-slate-500 mt-2">{$t('Print on A4 at 100% (actual size), with no page margins or headers if your browser offers them.')}</p>
  {/if}
</div>

{#if ready && hasReviews}
  <!-- On screen this is a preview. In print it is the whole page. -->
  <div class="sheet mt-6 bg-white ring-1 ring-slate-200 print:ring-0 print:mt-0">
    {#each Array(CARDS) as _, i}
      <div class="card-cut">
        <div class="flex items-center gap-2 min-w-0">
          {#if cafe.logoUrl}<img src={cafe.logoUrl} alt="" class="h-8 w-8 object-contain shrink-0" />{/if}
          <span class="font-semibold text-sm leading-tight truncate">{cafe.name}</span>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="font-bold text-base leading-snug">{$t('Thank you for visiting!')}</p>
            <p class="text-[11px] leading-snug mt-1 text-slate-700">
              {$t('Did we help? Please tell others about us in a Google review. It takes a minute, and it helps more people find us.')}
            </p>
          </div>
          <img
            src={qrSrc}
            alt={i === 0 ? $t('QR code for our Google review page') : ''}
            class="h-[30mm] w-[30mm] shrink-0"
            on:load={() => (qrLoaded += 1)}
          />
        </div>
        <p class="mt-2 text-[10px] text-slate-600">{$t('Scan the code, or go to')} <span class="font-semibold text-slate-900">{shortAddress}</span></p>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* A4 is 210 x 297 mm. Two cards across and four down makes each one
     105 x 74.25 mm, the size of an A7 card. */
  .sheet {
    width: 210mm;
    height: 297mm;
    display: grid;
    grid-template-columns: repeat(2, 105mm);
    grid-template-rows: repeat(4, 74.25mm);
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* A light dashed line to cut along. Neutral grey, the same on every side. */
  .card-cut {
    box-sizing: border-box;
    padding: 7mm 8mm;
    border: 1px dashed #cbd5e1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }
  @media screen {
    .sheet {
      /* Fit the preview on a laptop screen without changing its proportions. */
      zoom: 0.75;
    }
  }
</style>
