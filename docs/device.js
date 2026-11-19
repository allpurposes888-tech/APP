// Perangkat: bunyi pengingat (WebAudio), wake lock layar, getar bila tersedia.
import { state } from './store.js';

let ctx = null;

const VOLUME = { pelan: 0.12, sedang: 0.3, keras: 0.6 };
const level = () => VOLUME[state.settings?.volume] ?? VOLUME.sedang;

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

/**
 * Safari (iOS 16.4+) memperbolehkan menentukan jenis sesi audio. 'transient' dipakai untuk bunyi singkat
 * yang bercampur dengan musik dan tidak ikut dibisukan tombol senyap. Bila tidak didukung, diabaikan.
 */
function sessionType(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {
    /* tidak didukung */
  }
}

function tone(freq, startOffset, dur, gain) {
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

function ready() {
  if (!ctx) unlockAudio();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume();
  sessionType('transient');
  return true;
}

/** Jeda selesai: tiga nada naik, lebih keras dari detik hitung mundur. */
export function beepRestDone(force = false) {
  if ((force || state.settings?.sound !== false) && ready()) {
    try {
      const v = level();
      tone(660, 0, 0.16, v);
      tone(880, 0.2, 0.16, v);
      tone(1175, 0.4, 0.3, v);
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

/** Detak pendek untuk 3 detik terakhir jeda. */
export function tickBeep() {
  if (state.settings?.sound === false || state.settings?.countdown === false || !ready()) return;
  try {
    tone(880, 0, 0.07, level() * 0.7);
  } catch {
    /* abaikan */
  }
}

/** Dipakai tombol "Tes bunyi" di Pengaturan, agar bunyi bisa dicek dengan tombol senyap menyala. */
export function testBeep() {
  unlockAudio();
  beepRestDone(true);
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
