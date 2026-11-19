// Penyimpanan lokal: satu dokumen state di IndexedDB (cadangan di localStorage). Tanpa server.
import { CATALOG, defaultProgram } from './catalog.js';
import { localDate } from './util.js';

export const state = {};

export function defaults() {
  return {
    v: 1,
    createdAt: localDate(),
    settings: { sound: true, wakeLock: true, deloadIntervalWeeks: 6 },
    program: defaultProgram(),
    customExercises: [],
    sessions: [],
    checkins: [],
    deload: { lastDeloadDate: null, snoozeUntil: null, hiddenUntil: null, active: null },
    active: null,
    lastDayId: null,
  };
}

const DB_NAME = 'gym-hipertrofi';
const KEY = 'state';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(KEY);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function migrate(s) {
  const d = defaults();
  for (const k of Object.keys(d)) if (!(k in s)) s[k] = d[k];
  s.settings = { ...d.settings, ...s.settings };
  s.deload = { ...d.deload, ...s.deload };
  return s;
}

export async function load() {
  let saved = null;
  try {
    saved = await idbGet();
  } catch {
    /* lanjut ke cadangan */
  }
  if (!saved) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* abaikan */
    }
  }
  replaceState(saved ? migrate(saved) : defaults());
}

export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
}

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 120);
}

export async function flush() {
  clearTimeout(timer);
  const snapshot = JSON.parse(JSON.stringify(state));
  try {
    await idbSet(snapshot);
  } catch {
    /* cadangan di bawah */
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
}

// Simpan segera saat aplikasi disembunyikan (iOS dapat menutup tab kapan saja).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
addEventListener('pagehide', () => flush());

export function exportJson() {
  return JSON.stringify({ app: 'gym-hipertrofi', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.app === 'gym-hipertrofi' ? parsed.data : parsed;
  if (!data || !Array.isArray(data.sessions) || !data.program) throw new Error('Berkas bukan cadangan Gym Hipertrofi.');
  replaceState(migrate(data));
  return flush();
}

export function allExercises() {
  return [...CATALOG, ...state.customExercises];
}

export function getExercise(id) {
  return allExercises().find((e) => e.id === id) || { id, name: id, equip: '', muscles: [], compound: false, main: false };
}

export function engineExercises() {
  return allExercises().map((e) => ({
    id: e.id,
    name: e.name,
    isMain: !!e.main,
    muscles: e.muscles,
  }));
}
