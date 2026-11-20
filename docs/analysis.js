// Jembatan antara data aplikasi dan engine fatigue (fatigue.js, dibuat dari fatigue.ts).
import * as F from './fatigue.js';
import { state, engineExercises } from './store.js';
import { localDate, mean } from './util.js';

export function buildInput() {
  const sets = [];
  const sessions = [];
  for (const s of state.sessions) {
    for (const t of s.sets) {
      sets.push({
        date: s.date,
        exerciseId: t.exId,
        setType: t.type,
        reps: t.reps,
        loadKg: t.load,
        rir: t.confirmed ? t.rir ?? null : null, // set yang belum dikonfirmasi tidak memakai RIR tebakan
        targetRir: t.targetRir ?? null,
        targetLoadKg: t.targetLoad ?? null,
        tutSeconds: t.tut ?? null,
        restBeforeSeconds: t.restBefore ?? null,
      });
    }
    if (s.rpe) sessions.push({ date: s.date, sessionRpe: s.rpe, durationMinutes: s.durationMin || 0 });
  }
  const checkins = state.checkins.map((c) => ({
    date: c.date,
    sleep: c.sleep,
    soreness: c.soreness,
    jointPain: c.jointPain,
    motivation: c.motivation,
  }));
  return { sets, exercises: engineExercises(), checkins, sessions };
}

export function trainingStart() {
  const dates = state.sessions.map((s) => s.date).sort();
  return dates[0] || state.createdAt;
}

export function analyzeAt(asOf = localDate()) {
  return F.analyze(buildInput(), asOf, {
    lastDeloadDate: state.deload.lastDeloadDate,
    trainingStartDate: trainingStart(),
    deloadIntervalWeeks: state.settings.deloadIntervalWeeks,
  });
}

export function hasTrainingData() {
  return state.sessions.some((s) => s.sets.some((t) => t.type !== 'warmup'));
}

export function activeDeload() {
  const a = state.deload.active;
  if (!a) return null;
  const today = localDate();
  return today >= a.startDate && today <= a.endDate ? a : null;
}

/** Rencana hari ini; bila deload aktif, set/beban/RIR disesuaikan lewat engine. */
export function planForDay(day) {
  const base = day.items.map((i) => ({ ...i }));
  const dl = activeDeload();
  if (!dl) return base;
  const adjusted = F.applyDeloadToPlan(
    base.map((i) => ({ exerciseId: i.exId, sets: i.sets, reps: i.repMax, loadKg: i.load, targetRir: i.rir })),
    dl.type,
    { loadStepKg: 0.5 },
  );
  return base.map((i, idx) => ({ ...i, sets: adjusted[idx].sets, load: adjusted[idx].loadKg, rir: adjusted[idx].targetRir }));
}

export function e1rmOf(t) {
  return F.computeE1RM(t.load, t.reps, t.rir ?? t.targetRir ?? 2);
}

/** Set terbaik dari sesi terbaru untuk satu gerakan (dipakai sebagai nilai ghost). */
export function lastPerf(exId) {
  const sessions = [...state.sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  for (const s of sessions) {
    const w = s.sets.filter((t) => t.exId === exId && t.type === 'working');
    if (w.length) {
      const best = w.reduce((a, b) => (b.load > a.load || (b.load === a.load && b.reps > a.reps) ? b : a));
      return { load: best.load, reps: best.reps, rir: best.rir, date: s.date };
    }
  }
  return null;
}

/** Semua set kerja satu gerakan dari sesi terbaru yang memuatnya (kolom "Lalu" di tabel set). */
export function lastSets(exId) {
  const sessions = [...state.sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  for (const s of sessions) {
    const w = s.sets.filter((t) => t.exId === exId && t.type === 'working');
    if (w.length) return w;
  }
  return [];
}

export function sessionStats(s) {
  const work = s.sets.filter((t) => t.type !== 'warmup');
  const volume = work.reduce((a, t) => a + t.reps * t.load, 0);
  const tuts = s.sets.map((t) => t.tut).filter((x) => x != null);
  const rests = s.sets.map((t) => t.restBefore).filter((x) => x != null);
  return {
    workSets: work.length,
    volume,
    avgTut: tuts.length ? mean(tuts) : null,
    avgRest: rests.length ? mean(rests) : null,
    unconfirmed: s.sets.filter((t) => !t.confirmed).length,
  };
}

/** Gerakan yang mencetak e1RM terbaik baru dibanding semua sesi sebelumnya. */
export function sessionPRs(s) {
  const prs = [];
  const ids = [...new Set(s.sets.filter((t) => t.type === 'working').map((t) => t.exId))];
  for (const exId of ids) {
    let best = null;
    for (const t of s.sets) {
      if (t.exId !== exId || t.type !== 'working') continue;
      const e = e1rmOf(t);
      if (e !== null && (!best || e > best.e)) best = { e, set: t };
    }
    if (!best) continue;
    let prior = 0;
    for (const o of state.sessions) {
      if (o.id === s.id) continue;
      const before = o.date < s.date || (o.date === s.date && (o.startedAt || 0) < (s.startedAt || 0));
      if (!before) continue;
      for (const t of o.sets) {
        if (t.exId !== exId || t.type !== 'working') continue;
        const e = e1rmOf(t);
        if (e !== null && e > prior) prior = e;
      }
    }
    if (prior > 0 && best.e > prior + 1e-6) prs.push({ exId, set: best.set });
  }
  return prs;
}

/** Sesi terbaru dulu. */
export function sessionsDesc() {
  return [...state.sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

/**
 * Perkiraan kalori sesi: MET x berat badan (kg) x durasi (jam).
 * MET latihan beban dari Compendium of Physical Activities (sekitar 3,5 sampai 6), dipilih menurut RPE sesi.
 * MET sudah memasukkan waktu jeda antar set. Hasil berupa rentang, akurasi sekitar +-30-50%.
 */
export function estimateKcal(s) {
  const kg = state.settings.bodyWeightKg;
  if (!kg || !s.durationMin) return null;
  const rpe = s.rpe || 7;
  const [lo, hi] = rpe <= 6 ? [3.0, 4.0] : rpe <= 8 ? [4.0, 5.5] : [5.0, 6.5];
  const h = Math.min(s.durationMin, 180) / 60;
  return { lo: Math.round((lo * kg * h) / 10) * 10, hi: Math.round((hi * kg * h) / 10) * 10 };
}

export function fmtKcal(k) {
  return k ? `${fmtNum(k.lo)}–${fmtNum(k.hi)}` : '–';
}
const fmtNum = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
