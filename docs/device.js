// Perangkat: bunyi pengingat (WebAudio), wake lock layar, getar bila tersedia.
import { state } from './store.js';

let ctx = null;

/** Harus dipanggil dari ketukan pengguna (aturan iOS) agar bunyi bisa diputar nanti. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* tanpa bunyi */
  }
}

function tone(freq, startOffset, dur, gain = 0.25) {
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Jeda selesai: tiga nada naik. */
export function beepRestDone() {
  if (state.settings?.sound !== false && ctx) {
    try {
      if (ctx.state === 'suspended') ctx.resume();
      tone(660, 0, 0.16);
      tone(880, 0.2, 0.16);
      tone(1175, 0.4, 0.28);
    } catch {
      /* abaikan */
    }
  }
  try {
    navigator.vibrate?.([120, 80, 260]);
  } catch {
    /* iOS Safari tidak mendukung getar */
  }
}

let lock = null;

export async function acquireWake() {
  if (state.settings?.wakeLock === false) return;
  try {
    if ('wakeLock' in navigator && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        lock = null;
      });
    }
  } catch {
    lock = null;
  }
}

export function releaseWake() {
  try {
    lock?.release();
  } catch {
    /* abaikan */
  }
  lock = null;
}

// Wake lock dilepas otomatis saat halaman tersembunyi; minta lagi saat kembali.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.active) acquireWake();
});
