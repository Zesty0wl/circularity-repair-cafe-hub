<script lang="ts">
  import { Camera, RefreshCw, Check, X } from 'lucide-svelte';
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let maxLongestEdge = 1200;
  export let quality = 0.8;

  const dispatch = createEventDispatcher<{ capture: { blob: Blob; previewUrl: string }; close: void }>();

  let stream: MediaStream | null = null;
  let videoEl: HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let previewUrl: string | null = null;
  let lastBlob: Blob | null = null;
  let active = false;
  let supportsCamera = false;
  let errorMsg: string | null = null;
  let fileInput: HTMLInputElement;

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    supportsCamera = true;
  }

  async function start() {
    errorMsg = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play();
      }
      active = true;
    } catch (err) {
      errorMsg = 'Could not access the camera. You can upload a photo instead.';
      supportsCamera = false;
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    active = false;
  }

  onDestroy(stop);

  async function capture() {
    if (!videoEl) return;
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    const scale = Math.min(1, maxLongestEdge / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    canvasEl.width = cw;
    canvasEl.height = ch;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0, cw, ch);
    canvasEl.toBlob(
      (blob) => {
        if (!blob) return;
        lastBlob = blob;
        previewUrl = URL.createObjectURL(blob);
        stop();
      },
      'image/jpeg',
      quality
    );
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    lastBlob = null;
    start();
  }

  function confirm() {
    if (lastBlob && previewUrl) {
      dispatch('capture', { blob: lastBlob, previewUrl });
    }
  }

  async function onFile(e: Event) {
    const t = e.target as HTMLInputElement;
    const f = t.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    // Re-encode through canvas to enforce size/quality
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => (img.onload = resolve));
    const scale = Math.min(1, maxLongestEdge / Math.max(img.width, img.height));
    const cw = Math.round(img.width * scale);
    const ch = Math.round(img.height * scale);
    canvasEl.width = cw;
    canvasEl.height = ch;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, cw, ch);
    canvasEl.toBlob(
      (blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return;
        lastBlob = blob;
        previewUrl = URL.createObjectURL(blob);
      },
      'image/jpeg',
      quality
    );
  }
</script>

<div class="card p-4">
  {#if previewUrl}
    <img src={previewUrl} alt="Preview" class="w-full rounded-lg max-h-96 object-contain bg-slate-100" />
    <div class="flex gap-3 mt-4 justify-end">
      <button class="btn-secondary" type="button" on:click={retake}><RefreshCw size={18} /> Retake</button>
      <button class="btn-primary" type="button" on:click={confirm}><Check size={18} /> Use this photo</button>
    </div>
  {:else if active}
    <video bind:this={videoEl} class="w-full rounded-lg bg-black aspect-[4/3] object-cover" muted playsinline></video>
    <div class="flex justify-center mt-4">
      <button class="btn-primary btn-lg rounded-full !p-6" type="button" on:click={capture} aria-label="Take photo">
        <Camera size={32} />
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#if supportsCamera}
        <button class="btn-primary btn-lg w-full" type="button" on:click={start}>
          <Camera size={20} /> Open camera
        </button>
        <p class="text-center text-sm text-slate-500">or</p>
      {/if}
      <input
        bind:this={fileInput}
        on:change={onFile}
        type="file"
        accept="image/*"
        capture="environment"
        class="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
      />
      {#if errorMsg}<p class="text-sm text-amber-700">{errorMsg}</p>{/if}
    </div>
  {/if}
  <canvas bind:this={canvasEl} class="hidden"></canvas>
</div>
