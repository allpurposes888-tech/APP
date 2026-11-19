import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rirWeight, resolveRir, computeSetLoad, buildDailyMuscleLoads, ewma, computeMuscleFatigue,
  computeSystemicFatigue, computeReadiness, readinessOfCheckin, computeE1RM, performanceTrend, rirDrift,
  monotonyStrain, evaluateDeload, applyDeloadToPlan, addDays, analyze, systemicHistory,
} from './fatigue.ts';
import type { SetLog, Exercise, ReadinessCheckin, PerformanceTrend, DeloadInput, MuscleFatigue, SessionLog } from './fatigue.ts';

const close = (a: number | null, b: number, eps = 1e-6) => {
  assert.ok(a !== null && Math.abs(a - b) <= eps, `diharapkan ${b}, dapat ${a}`);
};

const ASOF = '2026-03-01';

const bench: Exercise = {
  id: 'bench', isMain: true,
  muscles: [{ muscleId: 'chest', weight: 1 }, { muscleId: 'triceps', weight: 0.5 }],
};

function set(over: Partial<SetLog> = {}): SetLog {
  return { date: ASOF, exerciseId: 'bench', setType: 'working', reps: 8, loadKg: 100, rir: 1, ...over };
}

/** setsPerDay set (RIR 1 => ESL 1.0) setiap hari dari `from` sampai `to`. */
function dailySets(from: string, to: string, setsPerDay: number): SetLog[] {
  const out: SetLog[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) for (let i = 0; i < setsPerDay; i++) out.push(set({ date: d }));
  return out;
}

function chestScore(sets: SetLog[], asOf = ASOF) {
  const loads = buildDailyMuscleLoads(sets, [bench]);
  return computeMuscleFatigue({ muscleId: 'chest', dailyLoad: loads.chest, asOf });
}

// ---------------------------------------------------------------- ESL

test('bobot RIR: 0/1=1.0, 2=0.9, 3=0.75, 4=0.5, >=5=0.25', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8].map(rirWeight), [1, 1, 0.9, 0.75, 0.5, 0.25, 0.25]);
});

test('fallback RIR: rir -> 10-rpe -> target -> default', () => {
  assert.deepEqual(resolveRir(set({ rir: 3 })), { rir: 3, source: 'rir' });
  assert.deepEqual(resolveRir(set({ rir: null, rpe: 8 })), { rir: 2, source: 'rpe' });
  assert.deepEqual(resolveRir(set({ rir: null, targetRir: 3 })), { rir: 3, source: 'target' });
  assert.deepEqual(resolveRir(set({ rir: null }), 2), { rir: 2, source: 'default' });
});

test('warmup diabaikan: ESL 0 dan tidak masuk beban harian', () => {
  const w = computeSetLoad(set({ setType: 'warmup', rir: 5 }));
  assert.equal(w.esl, 0);
  assert.equal(w.isHardSet, false);
  assert.deepEqual(buildDailyMuscleLoads([set({ setType: 'warmup' })], [bench]), {});
  // drop set dihitung sebagai setengah hard set
  close(computeSetLoad(set({ setType: 'drop', rir: 2 })).esl, 0.45);
  close(computeSetLoad(set({ setType: 'drop', rir: 0 })).esl, 1.15 * 0.5);
});

test('pengali rest: <60 s x1.10, 60-89 s x1.05, >=90 s x1.0', () => {
  close(computeSetLoad(set({ rir: 2, restBeforeSeconds: 45 })).esl, 0.9 * 1.1);
  close(computeSetLoad(set({ rir: 2, restBeforeSeconds: 75 })).esl, 0.9 * 1.05);
  close(computeSetLoad(set({ rir: 2, restBeforeSeconds: 90 })).esl, 0.9);
});

test('pengali TUT, failure +15%, dan cap total 1.3', () => {
  // 8 rep, TUT 56 s = 7 s/rep > 6 -> x1.05
  close(computeSetLoad(set({ rir: 2, tutSeconds: 56 })).esl, 0.9 * 1.05);
  close(computeSetLoad(set({ rir: 2, tutSeconds: 48 })).esl, 0.9); // tepat 6 s/rep: tidak dihitung
  close(computeSetLoad(set({ rir: 0 })).esl, 1.15);
  // 1.15 * 1.10 * 1.05 = 1.328 -> dipotong 1.3
  const capped = computeSetLoad(set({ rir: 0, restBeforeSeconds: 30, tutSeconds: 60 }));
  close(capped.rawMultiplier, 1.15 * 1.1 * 1.05);
  assert.equal(capped.multiplier, 1.3);
  close(capped.esl, 1.3);
});

test('beban harian per otot memakai bobot primer 1.0 dan sekunder 0.5', () => {
  const loads = buildDailyMuscleLoads([set({ rir: 2 }), set({ rir: 2 })], [bench]);
  close(loads.chest[ASOF], 1.8);
  close(loads.triceps[ASOF], 0.9);
});

// ---------------------------------------------------------------- EWMA & ACWR

test('EWMA dihitung tangan (span 7, lambda 0.25)', () => {
  const r = ewma([10, 0, 0], 7);
  close(r[0], 10);
  close(r[1], 7.5);
  close(r[2], 5.625);
  // dengan seed 8: 0.25*0 + 0.75*8 = 6
  close(ewma([0], 7, 8)[0], 6);
  // span 28: lambda = 2/29
  close(ewma([29, 0], 28)[1], 29 * (1 - 2 / 29));
});

test('skor objektif = 50 pada beban stabil (ACWR 1)', () => {
  const m = chestScore(dailySets(addDays(ASOF, -59), ASOF, 2));
  close(m.acwr, 1, 1e-9);
  close(m.objectiveScore, 50, 1e-7);
  assert.equal(m.confidence, 'tinggi');
  assert.equal(m.coldStart, false);
});

test('lonjakan volume 1.5x selama 7 hari -> skor 75; 2x -> 100 (dibatasi)', () => {
  const base = dailySets(addDays(ASOF, -41), addDays(ASOF, -7), 2);
  const x15 = chestScore([...base, ...dailySets(addDays(ASOF, -6), ASOF, 3)]);
  const x2 = chestScore([...base, ...dailySets(addDays(ASOF, -6), ASOF, 4)]);
  close(x15.acwr, 1.5, 1e-9);
  close(x15.objectiveScore, 75, 1e-7);
  close(x2.objectiveScore, 100, 1e-7);
});

test('skor stabil di setiap hari dalam pekan pada pola Senin/Rabu/Jumat (tanpa osilasi)', () => {
  // 8 minggu, 3 sesi/minggu x 4 set RIR1 (ESL 1.0) -> 12 hard set efektif/minggu
  const sets: SetLog[] = [];
  const monday = '2026-01-05';
  for (let w = 0; w < 8; w++) for (const off of [0, 2, 4]) for (let i = 0; i < 4; i++) sets.push(set({ date: addDays(monday, w * 7 + off) }));
  const lastDay = addDays(monday, 8 * 7 - 1);
  for (let back = 0; back < 7; back++) {
    const m = chestScore(sets, addDays(lastDay, -back));
    close(m.acute, 12, 1e-9);
    close(m.objectiveScore, 50, 1e-7);
  }
});

test('cold start (<14 hari): baseline default 12 set/minggu, confidence rendah', () => {
  const m = chestScore(dailySets(addDays(ASOF, -4), ASOF, 2));
  assert.equal(m.coldStart, true);
  assert.equal(m.confidence, 'rendah');
  close(m.chronic, 12);
  close(m.acute, 10); // 5 hari x 2 set
  close(m.objectiveScore, 50 * 10 / 12, 1e-7);
  assert.ok(m.explanation.caveats!.some((c) => c.includes('cold') || c.includes('baseline')));
  // 14-27 hari: confidence sedang
  assert.equal(chestScore(dailySets(addDays(ASOF, -19), ASOF, 2)).confidence, 'sedang');
});

test('skor otot: 0.7 objektif + 0.3 subjektif, dan explanation berjumlah sama dengan skor', () => {
  const loads = buildDailyMuscleLoads(dailySets(addDays(ASOF, -59), ASOF, 2), [bench]);
  const m = computeMuscleFatigue({ muscleId: 'chest', dailyLoad: loads.chest, asOf: ASOF, sorenessFatigue: 80 });
  close(m.fatigue, 0.7 * 50 + 0.3 * 80, 1e-6);
  const sum = m.explanation.components.reduce((a, c) => a + (c.contribution ?? 0), 0);
  close(sum, m.fatigue, 0.02);
});

test('sistemik: rata-rata tertimbang beban kronis, dicampur 0.3 subjektif', () => {
  const stub = (id: string, chronic: number, obj: number) => ({ muscleId: id, chronic, objectiveScore: obj }) as unknown as MuscleFatigue;
  const ms = [stub('a', 3, 80), stub('b', 1, 40)];
  close(computeSystemicFatigue(ms, null).score, 70); // (3*80 + 1*40)/4
  const r = computeReadiness([{ date: ASOF, sleep: 3, soreness: 3, jointPain: 3, motivation: 3 }], ASOF); // readiness 50
  close(computeSystemicFatigue(ms, r).score, 0.7 * 70 + 0.3 * 50);
});

// ---------------------------------------------------------------- Readiness

test('readiness: semua 5 -> 100, semua 1 -> 0, bobot sleep 0.3', () => {
  const mk = (s: number, so: number, j: number, m: number): ReadinessCheckin => ({ date: ASOF, sleep: s, soreness: so, jointPain: j, motivation: m });
  close(readinessOfCheckin(mk(5, 5, 5, 5)), 100);
  close(readinessOfCheckin(mk(1, 1, 1, 1)), 0);
  close(readinessOfCheckin(mk(5, 1, 1, 1)), 30);
  close(readinessOfCheckin(mk(1, 1, 5, 1)), 25);
});

test('readiness: smoothing 3 hari terakhir, subjektif fatigue = 100 - readiness', () => {
  const cs: ReadinessCheckin[] = [
    { date: addDays(ASOF, -5), sleep: 1, soreness: 1, jointPain: 1, motivation: 1 }, // di luar jendela
    { date: addDays(ASOF, -2), sleep: 5, soreness: 5, jointPain: 5, motivation: 5 },
    { date: ASOF, sleep: 3, soreness: 3, jointPain: 3, motivation: 3 },
  ];
  const r = computeReadiness(cs, ASOF);
  assert.equal(r.nCheckins, 2);
  close(r.readiness, 75);
  close(r.subjectiveFatigue, 25);
  assert.equal(computeReadiness([], ASOF).readiness, null);
});

// ---------------------------------------------------------------- e1RM & tren

test('e1RM Epley RIR-adjusted: 100 kg x 8 RIR 2 = 133.3', () => {
  close(computeE1RM(100, 8, 2), 100 * (1 + 10 / 30));
  close(computeE1RM(100, 8, 2), 133.3333333, 1e-4);
});

test('e1RM null untuk reps > 12 (dan beban/reps tidak valid)', () => {
  assert.equal(computeE1RM(60, 13, 2), null);
  assert.equal(computeE1RM(0, 8, 2), null);
  assert.notEqual(computeE1RM(60, 12, 0), null);
});

function trendSets(loads: number[]): SetLog[] {
  return loads.map((l, i) => set({ date: addDays('2026-02-01', i * 3), loadKg: l, reps: 8, rir: 0 }));
}

test('tren performa: stagnan, turun, naik, dan data kurang', () => {
  assert.equal(performanceTrend(trendSets([100, 100, 100, 100, 100]), 'bench').status, 'stagnant');
  const up = performanceTrend(trendSets([100, 100, 100, 105, 105]), 'bench');
  assert.equal(up.status, 'improving');
  close(up.changePct, 5);
  assert.equal(performanceTrend(trendSets([100, 100, 100, 95, 95]), 'bench').status, 'declining');
  // -1.5% masih dihitung stagnan (batas turun < -2%)
  assert.equal(performanceTrend(trendSets([100, 100, 100, 98.5, 98.5]), 'bench').status, 'stagnant');
  assert.equal(performanceTrend(trendSets([100, 100, 100]), 'bench').status, 'insufficient');
  // set warmup tidak ikut dihitung
  const withWarm = [...trendSets([100, 100, 100, 100, 100]), set({ date: '2026-03-01', setType: 'warmup', loadKg: 300 })];
  assert.equal(performanceTrend(withWarm, 'bench').status, 'stagnant');
});

// ---------------------------------------------------------------- RIR drift

test('RIR drift vs target: pemicu bila <= -1.0; set yang lebih berat dari rencana dikecualikan', () => {
  const near = Array.from({ length: 6 }, (_, i) => set({ date: addDays(ASOF, -(i % 3)), rir: 1, targetRir: 2 }));
  const r = rirDrift(near, ASOF);
  assert.equal(r.method, 'target');
  close(r.drift, -1);
  assert.equal(r.triggered, true);

  const onPlan = Array.from({ length: 6 }, () => set({ rir: 2, targetRir: 2 }));
  assert.equal(rirDrift(onPlan, ASOF).triggered, false);

  // user sengaja menambah beban 10% di atas rencana -> bukan tanda fatigue, dikecualikan
  const heavier = Array.from({ length: 6 }, () => set({ rir: 0, targetRir: 2, loadKg: 110, targetLoadKg: 100 }));
  assert.equal(rirDrift(heavier, ASOF).method, 'none');

  // RIR hanya asumsi (null) tidak dihitung
  assert.equal(rirDrift(Array.from({ length: 8 }, () => set({ rir: null, targetRir: 2 })), ASOF).method, 'none');
});

test('RIR drift fallback baseline pribadi bila tidak ada target', () => {
  const recent = Array.from({ length: 6 }, () => set({ rir: 1 }));
  const old = Array.from({ length: 6 }, () => set({ date: addDays(ASOF, -14), rir: 3 }));
  const r = rirDrift([...recent, ...old], ASOF);
  assert.equal(r.method, 'baseline');
  close(r.drift, -2);
  assert.equal(r.triggered, true);
});

// ---------------------------------------------------------------- Monotony

test('monotony & strain Foster (dihitung tangan)', () => {
  // sRPE harian: 5 * [2,4,6,4,2,4,6] = [10,20,30,20,10,20,30]; mean 20, SD populasi sqrt(400/7)
  const durs = [2, 4, 6, 4, 2, 4, 6];
  const sessions: SessionLog[] = durs.map((d, i) => ({ date: addDays(ASOF, -(6 - i)), sessionRpe: 5, durationMinutes: d }));
  const r = monotonyStrain(sessions, ASOF);
  assert.equal(r.weeklyLoad, 140);
  close(r.mean, 20);
  close(r.monotony, 20 / Math.sqrt(400 / 7), 1e-9);
  close(r.strain, 140 * (20 / Math.sqrt(400 / 7)), 1e-6);
  // beban identik tiap hari: SD 0 -> monotony tidak terdefinisi
  const flat = durs.map((_, i) => ({ date: addDays(ASOF, -i), sessionRpe: 5, durationMinutes: 10 }));
  assert.equal(monotonyStrain(flat, ASOF).monotony, null);
});

// ---------------------------------------------------------------- Deload

const trend = (id: string, status: PerformanceTrend['status']): PerformanceTrend => ({
  exerciseId: id, status, changePct: 0, recentAvg: 1, previousAvg: 1, sessionsUsed: 4, explanation: { summary: '', components: [] },
});

/** Input jinak: tidak ada pemicu, deload terakhir 4 minggu lalu. */
function okInput(over: Partial<DeloadInput> = {}): DeloadInput {
  return {
    asOf: ASOF, systemicLast7: [50, 50, 50, 50, 50, 50, 50], trends: [trend('bench', 'improving'), trend('squat', 'improving')],
    rirDrift: 0, readiness7d: 70, readinessItems7d: { sleep: 4, soreness: 4, jointPain: 4, motivation: 4 },
    lastDeloadDate: addDays(ASOF, -28), deloadIntervalWeeks: 6, ...over,
  };
}

test('deload: tanpa pemicu -> ok', () => {
  const d = evaluateDeload(okInput());
  assert.equal(d.status, 'ok');
  assert.equal(d.type, null);
});

test('deload proaktif: minggu ke-6 -> rekomendasi, minggu ke-5 -> tidak', () => {
  const at6 = evaluateDeload(okInput({ lastDeloadDate: addDays(ASOF, -42) }));
  assert.equal(at6.status, 'deload');
  assert.equal(at6.proactive, true);
  assert.equal(at6.type, 'volume');
  assert.equal(at6.durationDays, 5); // hanya proaktif -> deload ringan 5 hari
  assert.equal(evaluateDeload(okInput({ lastDeloadDate: addDays(ASOF, -35) })).status, 'ok');
  // interval dipaksa ke rentang 4-8
  assert.equal(evaluateDeload(okInput({ lastDeloadDate: addDays(ASOF, -28), deloadIntervalWeeks: 2 })).status, 'deload');
  assert.equal(evaluateDeload(okInput({ lastDeloadDate: addDays(ASOF, -56), deloadIntervalWeeks: 20 })).status, 'deload');
});

test('deload: dua pemicu (a)+(c) -> rekomendasi 7 hari dengan nilai aktual vs ambang', () => {
  const d = evaluateDeload(okInput({ systemicLast7: [75, 80, 72, 71, 90, 50, 50], rirDrift: -1.2 }));
  assert.equal(d.status, 'deload');
  assert.equal(d.coreTriggerCount, 2);
  assert.equal(d.durationDays, 7);
  const a = d.triggers.find((t) => t.id === 'systemic_fatigue')!;
  assert.equal(a.actual, 5);
  assert.equal(a.threshold, 5);
  assert.ok(d.message.includes('volume'));
});

test('deload: satu pemicu -> watch', () => {
  assert.equal(evaluateDeload(okInput({ readiness7d: 35 })).status, 'watch');
  assert.equal(evaluateDeload(okInput({ trends: [trend('bench', 'stagnant'), trend('squat', 'improving')] })).status, 'ok');
  assert.equal(evaluateDeload(okInput({ trends: [trend('bench', 'stagnant'), trend('squat', 'declining')] })).status, 'watch');
});

test("deload bertipe 'intensity' bila nyeri sendi dominan, 'volume' bila tidak", () => {
  const joint = evaluateDeload(okInput({
    rirDrift: -1.5, readiness7d: 30, readinessItems7d: { sleep: 3, soreness: 3, jointPain: 1.8, motivation: 3 },
  }));
  assert.equal(joint.status, 'deload');
  assert.equal(joint.type, 'intensity');
  const sleepy = evaluateDeload(okInput({
    rirDrift: -1.5, readiness7d: 30, readinessItems7d: { sleep: 1.5, soreness: 3, jointPain: 2, motivation: 3 },
  }));
  assert.equal(sleepy.type, 'volume');
});

test('deload cooldown 3 minggu: ditekan kecuali (a)+(d)', () => {
  const recent = addDays(ASOF, -14);
  const twoOther = evaluateDeload(okInput({ lastDeloadDate: recent, rirDrift: -1.5, trends: [trend('a', 'stagnant'), trend('b', 'declining')] }));
  assert.equal(twoOther.status, 'watch');
  assert.equal(twoOther.suppressedByCooldown, true);
  const ad = evaluateDeload(okInput({ lastDeloadDate: recent, systemicLast7: [80, 80, 80, 80, 80, 80, 80], readiness7d: 30 }));
  assert.equal(ad.status, 'deload');
  assert.equal(ad.suppressedByCooldown, false);
  // lewat 3 minggu: aturan normal
  assert.equal(evaluateDeload(okInput({ lastDeloadDate: addDays(ASOF, -22), rirDrift: -1.5, readiness7d: 30 })).status, 'deload');
});

// ---------------------------------------------------------------- Rencana

test('applyDeloadToPlan volume: set -50% (dibulatkan, min 1), beban tetap, RIR >= 3', () => {
  const plan = [
    { exerciseId: 'bench', sets: 4, reps: 8, loadKg: 100, targetRir: 2 },
    { exerciseId: 'fly', sets: 3, reps: 12, loadKg: 20, targetRir: 1 },
    { exerciseId: 'curl', sets: 1, reps: 10, loadKg: 15, targetRir: 4 },
  ];
  const out = applyDeloadToPlan(plan, 'volume');
  assert.deepEqual(out.map((p) => p.sets), [2, 2, 1]); // 3 * 0.5 = 1.5 -> 2 ; 1 * 0.5 -> min 1
  assert.deepEqual(out.map((p) => p.loadKg), [100, 20, 15]);
  assert.deepEqual(out.map((p) => p.targetRir), [3, 3, 4]);
  assert.equal(plan[0].sets, 4); // input tidak dimutasi
});

test('applyDeloadToPlan intensity: beban -12.5%, set -30%', () => {
  const out = applyDeloadToPlan([{ exerciseId: 'bench', sets: 4, reps: 8, loadKg: 100, targetRir: 1 }], 'intensity');
  assert.equal(out[0].loadKg, 87.5);
  assert.equal(out[0].sets, 3); // 2.8 -> 3
  assert.equal(out[0].targetRir, 2);
});

// ---------------------------------------------------------------- Integrasi

test('analyze: pipeline end-to-end menghasilkan snapshot, riwayat 7 hari, dan keputusan', () => {
  const sets = dailySets(addDays(ASOF, -59), ASOF, 2);
  const res = analyze({ sets, exercises: [bench] }, ASOF, { lastDeloadDate: addDays(ASOF, -28) });
  assert.equal(res.history.length, 7);
  assert.equal(res.snapshot.muscles.length, 2);
  close(res.snapshot.systemic.score, 50, 1e-6);
  assert.equal(res.deload.status, 'ok'); // performa stagnan hanya 1 latihan utama
  assert.equal(systemicHistory({ sets, exercises: [bench] }, ASOF, 3).length, 3);
});
