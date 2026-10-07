// =============================================================================
//  Helpers for a page left running on a screen
// =============================================================================
import type { BoardJob } from './board';

/**
 * Ask the screen not to go to sleep. Browsers drop the request when the tab
 * is hidden, so it is asked for again whenever the page comes back. Returns a
 * function that stops it. Does nothing where the browser cannot do it.
 */
export function keepAwake(): () => void {
  let lock: { release: () => Promise<void> } | null = null;
  let stopped = false;
  const request = async () => {
    if (stopped || document.visibilityState !== 'visible') return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
      lock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      lock = null;
    }
  };
  document.addEventListener('visibilitychange', request);
  void request();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', request);
    lock?.release().catch(() => {});
  };
}

/** Job numbers of repairs that are waiting now and were not there before. */
export function newlyWaiting(before: BoardJob[] | null, after: BoardJob[]): string[] {
  if (!before) return [];
  const seen = new Set(before.map((j) => j.jobNumber));
  return after.filter((j) => j.status === 'waiting' && !seen.has(j.jobNumber)).map((j) => j.jobNumber);
}

let audio: AudioContext | null = null;

/** Turn sound on. Browsers only allow this from a tap or a click. */
export async function unlockSound(): Promise<boolean> {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === 'suspended') await audio.resume();
    return true;
  } catch {
    return false;
  }
}

/** A short, friendly two-note chime. */
export function chime(): void {
  if (!audio) return;
  const t0 = audio.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audio!.destination);
    const start = t0 + i * 0.12;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    osc.start(start);
    osc.stop(start + 0.5);
  });
}

/** Text size steps for the screen's own controls. */
export const TEXT_SCALES = [0.8, 0.9, 1, 1.15, 1.3, 1.5];

export function loadNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private browsing */
  }
}
