// fatigue.ts - Skor FATIGUE transparan + aturan DELOAD untuk aplikasi pencatat latihan hipertrofi.
// TypeScript murni, tanpa dependensi, tanpa sintaks non-erasable (siap Node type stripping).
//
// Prinsip: setiap angka punya rumus tertulis dan setiap skor mengembalikan `explanation`
// (komponen + kontribusi) supaya UI dapat menjawab "mengapa skor ini?".
// ACWR dipakai hanya sebagai indikator RELATIF terhadap kebiasaan pribadi, bukan prediktor cedera
// (kritik: Impellizzeri et al. 2020, rasio & coupling matematis bermasalah).
//
// Keputusan arsitek (review): model beban memakai JENDELA BERGULIR, bukan EWMA harian.
//   akut   = total ESL 7 hari terakhir (= "hard set efektif minggu ini")
//   kronis = rata-rata ESL per minggu pada 28 hari SEBELUM jendela akut (tidak tumpang tindih / uncoupled)
// Alasan: EWMA harian berosilasi menurut hari dalam pekan (skor turun di hari libur), sehingga pemicu
// "fatigue tinggi N hari" tidak stabil; jendela tak tumpang tindih juga menghindari mathematical coupling.
// `ewma()` tetap diekspor sebagai utilitas (mis. menghaluskan grafik tren).

// ---------------------------------------------------------------------------
// Tipe
// ---------------------------------------------------------------------------

                                                    
                                                        
                                                
                                                     
                                                                                  
                                                             

                         
                                 
                     
                   
               
                 
                                                                         
                                                      
                                                                                  
                                                                                                 
                             
                                    
 

                                     
                   
                                             
 

                           
             
                
                                                                  
                                
 

                                   
               
                                    
                                                
                                                  
                                         
                                                                               
 

                             
               
                                            
                          
 

                                       
               
                                
                  
                                                          
                
 

                              
                  
                                     
                     
 

// ---------------------------------------------------------------------------
// Parameter (satu tempat, mudah diaudit)
// ---------------------------------------------------------------------------

export const PARAMS = {
  failureFatigueExtra: 0.15,
  restShortSeconds: 60,
  restShortMultiplier: 1.1,
  restMediumSeconds: 90,
  restMediumMultiplier: 1.05,
  tutSecondsPerRepThreshold: 6,
  tutMultiplier: 1.05,
  multiplierCap: 1.3,
  dropSetFactor: 0.5, // drop set = sub-set lanjutan; dihitung setengah hard set
  acuteWindowDays: 7,
  chronicWindowDays: 28,
  coldStartDays: 14, // < 14 hari riwayat: kronis = baseline default
  fullConfidenceDays: 35, // >= 35 hari: jendela kronis 28 hari penuh
  defaultWeeklyHardSets: 12,
  defaultTargetRir: 2,
  objectiveWeight: 0.7,
  subjectiveWeight: 0.3,
  readinessWeights: { sleep: 0.3, soreness: 0.3, jointPain: 0.25, motivation: 0.15 },
  smoothingDays: 3,
  maxE1rmReps: 12,
  trendImproveThresholdPct: 1,
  trendDeclineThresholdPct: -2,
  rirDriftThreshold: -1.0,
  rirDriftMinSets: 6,
  rirDriftHeavierToleranceRatio: 1.025,
}         ;

export const DELOAD_PARAMS = {
  systemicHighScore: 70,
  systemicHighDaysRequired: 5,
  systemicWindowDays: 7,
  stagnantMainLiftsRequired: 2,
  readinessLow: 40,
  defaultIntervalWeeks: 6,
  minIntervalWeeks: 4,
  maxIntervalWeeks: 8,
  cooldownWeeks: 3,
  jointPainDominantMax: 2.5,
  durationDaysFull: 7,
  durationDaysMild: 5,
}         ;

/** Preskripsi deload. Volume: set -50%, beban tetap, RIR >= 3. Intensity: beban -12.5%, set -30%, RIR >= 2. */
export const DELOAD_PRESCRIPTION = {
  volume: { setsMultiplier: 0.5, loadMultiplier: 1, minRir: 3 },
  intensity: { setsMultiplier: 0.7, loadMultiplier: 0.875, minRir: 2 },
}         ;

// ---------------------------------------------------------------------------
// Util tanggal & angka
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function toDay(date        )         {
  const t = Date.parse(date.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(t)) throw new Error(`Tanggal tidak valid: ${date}`);
  return Math.floor(t / DAY_MS);
}

export function addDays(date        , n        )         {
  return new Date((toDay(date) + n) * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from        , to        )         {
  return toDay(to) - toDay(from);
}

export function clamp(x        , lo        , hi        )         {
  return Math.min(hi, Math.max(lo, x));
}

function mean(xs          )         {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round(x        , digits = 2)         {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function inWindow(date        , asOf        , days        )          {
  const d = daysBetween(date, asOf);
  return d >= 0 && d < days;
}

// ---------------------------------------------------------------------------
// 1. Beban per set (Effective Set Load, ESL)
// ---------------------------------------------------------------------------

                              
              
                    
 

/** rir -> 10 - rpe -> targetRir -> default. Nilai tidak pernah negatif. */
export function resolveRir(set        , defaultTargetRir         = PARAMS.defaultTargetRir)              {
  if (set.rir !== null && set.rir !== undefined) return { rir: Math.max(0, set.rir), source: 'rir' };
  if (set.rpe !== null && set.rpe !== undefined) return { rir: Math.max(0, 10 - set.rpe), source: 'rpe' };
  if (set.targetRir !== null && set.targetRir !== undefined) return { rir: Math.max(0, set.targetRir), source: 'target' };
  return { rir: defaultTargetRir, source: 'default' };
}

/** Bobot stimulus/fatigue menurut RIR: 0-1 -> 1.0, 2 -> 0.9, 3 -> 0.75, 4 -> 0.5, >=5 -> 0.25. */
export function rirWeight(rir        )         {
  const r = Math.round(Math.max(0, rir));
  if (r <= 1) return 1.0;
  if (r === 2) return 0.9;
  if (r === 3) return 0.75;
  if (r === 4) return 0.5;
  return 0.25;
}

                                   
                     
              
                       
                                
                                               
                         
                        
                                       
                                        
                                               
                                                                        
                                                     
 

export function computeSetLoad(set        , defaultTargetRir         = PARAMS.defaultTargetRir)                   {
  const { rir, source } = resolveRir(set, defaultTargetRir);
  const volumeLoad = set.reps * set.loadKg;
  const hard = set.setType !== 'warmup' && set.reps > 0;
  if (!hard) {
    return {
      isHardSet: false, rir, rirSource: source, stimulus: 0, failureMultiplier: 1,
      restMultiplier: 1, tutMultiplier: 1, rawMultiplier: 1, multiplier: 1, setTypeFactor: 0, esl: 0, volumeLoad,
    };
  }
  const stimulus = rirWeight(rir);
  const failureMultiplier = Math.round(rir) <= 0 ? 1 + PARAMS.failureFatigueExtra : 1;
  const rest = set.restBeforeSeconds;
  let restMultiplier = 1;
  if (rest !== null && rest !== undefined) {
    if (rest < PARAMS.restShortSeconds) restMultiplier = PARAMS.restShortMultiplier;
    else if (rest < PARAMS.restMediumSeconds) restMultiplier = PARAMS.restMediumMultiplier;
  }
  const tut = set.tutSeconds;
  const tutMultiplier =
    tut !== null && tut !== undefined && tut / set.reps > PARAMS.tutSecondsPerRepThreshold ? PARAMS.tutMultiplier : 1;
  const rawMultiplier = failureMultiplier * restMultiplier * tutMultiplier;
  const multiplier = Math.min(PARAMS.multiplierCap, rawMultiplier);
  const setTypeFactor = set.setType === 'drop' ? PARAMS.dropSetFactor : 1;
  return {
    isHardSet: true, rir, rirSource: source, stimulus, failureMultiplier, restMultiplier,
    tutMultiplier, rawMultiplier, multiplier, setTypeFactor, esl: stimulus * multiplier * setTypeFactor, volumeLoad,
  };
}

// ---------------------------------------------------------------------------
// 2. Beban harian per otot
// ---------------------------------------------------------------------------

/** muscleId -> (date -> beban). Beban = sum(ESL * muscleWeight). Latihan tak dikenal diabaikan. */
                                                                      

export function buildDailyMuscleLoads(
  sets          ,
  exercises            ,
  defaultTargetRir         = PARAMS.defaultTargetRir,
)                   {
  const byId = new Map(exercises.map((e) => [e.id, e]         ));
  const out                   = {};
  for (const s of sets) {
    const ex = byId.get(s.exerciseId);
    if (!ex) continue;
    const { esl } = computeSetLoad(s, defaultTargetRir);
    if (esl <= 0) continue;
    for (const m of ex.muscles) {
      const days = (out[m.muscleId] ??= {});
      days[s.date] = (days[s.date] ?? 0) + esl * m.weight;
    }
  }
  return out;
}

/** Deret harian (nol bila tak ada data) dari `start` sampai `end` inklusif. */
export function dailySeries(byDate                        , start        , end        )           {
  const n = daysBetween(start, end) + 1;
  const out           = [];
  for (let i = 0; i < n; i++) out.push(byDate[addDays(start, i)] ?? 0);
  return out;
}

// ---------------------------------------------------------------------------
// 3. EWMA
// ---------------------------------------------------------------------------

/**
 * EWMA dengan lambda = 2/(span+1) (Williams et al. 2017). s_t = lambda*x_t + (1-lambda)*s_{t-1}.
 * Tanpa `seed`, s_{-1} = x_0 sehingga s_0 = x_0.
 */
export function ewma(values          , span        , seed         )           {
  const lambda = 2 / (span + 1);
  const out           = [];
  let prev = seed ?? values[0] ?? 0;
  for (const v of values) {
    prev = lambda * v + (1 - lambda) * prev;
    out.push(prev);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Readiness (subjektif)
// ---------------------------------------------------------------------------

export function readinessOfCheckin(c                  )         {
  const w = PARAMS.readinessWeights;
  const map = (x        ) => ((clamp(x, 1, 5) - 1) / 4) * 100;
  return w.sleep * map(c.sleep) + w.soreness * map(c.soreness) + w.jointPain * map(c.jointPain) + w.motivation * map(c.motivation);
}

                                  
                                                                    
                                                      
                    
                                                                                                               
                           
 

/** Rata-rata check-in dalam `days` hari terakhir (default 3 = smoothing). */
export function computeReadiness(
  checkins                    ,
  asOf        ,
  days         = PARAMS.smoothingDays,
)                  {
  const used = checkins.filter((c) => inWindow(c.date, asOf, days));
  if (used.length === 0) {
    return {
      readiness: null, subjectiveFatigue: null, nCheckins: 0, itemAverages: null,
      explanation: { summary: `Tidak ada check-in dalam ${days} hari terakhir; komponen subjektif diabaikan.`, components: [] },
    };
  }
  const readiness = mean(used.map(readinessOfCheckin));
  const avg = (k                                                   ) => mean(used.map((c) => c[k]));
  const itemAverages = { sleep: avg('sleep'), soreness: avg('soreness'), jointPain: avg('jointPain'), motivation: avg('motivation') };
  const w = PARAMS.readinessWeights;
  const comp = (name                )                       => {
    const v = ((itemAverages[name] - 1) / 4) * 100;
    return { name, value: round(itemAverages[name]), weight: w[name], contribution: round(w[name] * v), note: `(x-1)/4*100 = ${round(v)}` };
  };
  return {
    readiness, subjectiveFatigue: 100 - readiness, nCheckins: used.length, itemAverages,
    explanation: {
      summary: `Readiness ${round(readiness, 1)}/100 dari ${used.length} check-in (${days} hari terakhir).`,
      components: [comp('sleep'), comp('soreness'), comp('jointPain'), comp('motivation')],
    },
  };
}

/** Fatigue subjektif berbasis soreness (0-100), opsional per otot. null bila tak ada data. */
export function sorenessFatigue(
  checkins                    ,
  asOf        ,
  muscleId         ,
  days         = PARAMS.smoothingDays,
)                {
  const used = checkins.filter((c) => inWindow(c.date, asOf, days));
  if (used.length === 0) return null;
  const vals = used.map((c) => clamp((muscleId && c.muscleSoreness?.[muscleId]) || c.soreness, 1, 5));
  return 100 - ((mean(vals) - 1) / 4) * 100;
}

// ---------------------------------------------------------------------------
// 5. Fatigue per otot, sistemik
// ---------------------------------------------------------------------------

                                    
                   
                                    
               
                                  
                            
 

                                
                   
                                                    
                                                                                          
               
                                                              
                                   
                                                                                            
                         
                     
                      
                           
 

export function computeMuscleFatigue(args                   )                {
  const { muscleId, asOf } = args;
  const weekly = args.weeklyTargetSets ?? PARAMS.defaultWeeklyHardSets;
  const baselineWeekly = weekly; // asumsi ESL ~ 1 per hard set
  const A = PARAMS.acuteWindowDays;
  const C = PARAMS.chronicWindowDays;
  const dates = Object.keys(args.dailyLoad).filter((d) => d <= asOf && args.dailyLoad[d] > 0).sort();
  const first = dates[0];
  const historyDays = first ? daysBetween(first, asOf) + 1 : 0;
  const coldStart = historyDays < PARAMS.coldStartDays;
  const confidence             = historyDays < PARAMS.coldStartDays ? 'rendah' : historyDays < PARAMS.fullConfidenceDays ? 'sedang' : 'tinggi';

  // akut: total ESL hari ke-0..6 sebelum asOf (inklusif hari ini)
  const sumRange = (fromBack        , toBack        ) => {
    let s = 0;
    for (let i = fromBack; i <= toBack; i++) s += args.dailyLoad[addDays(asOf, -i)] ?? 0;
    return s;
  };
  const acute = sumRange(0, A - 1);
  // kronis: rata-rata per minggu pada hari ke-7..34 (hanya hari yang sudah tercakup riwayat)
  let chronic = baselineWeekly;
  let chronicDaysUsed = 0;
  if (!coldStart) {
    chronicDaysUsed = Math.min(C, historyDays - A);
    const c = (sumRange(A, A + chronicDaysUsed - 1) / chronicDaysUsed) * 7;
    chronic = c > 1e-6 ? c : baselineWeekly;
  }

  const acwr = acute / chronic;
  const objectiveScore = clamp(50 * acwr, 0, 100);
  const subj = args.sorenessFatigue ?? null;
  const fatigue = subj === null ? objectiveScore : PARAMS.objectiveWeight * objectiveScore + PARAMS.subjectiveWeight * subj;

  const components                         = [
    { name: 'beban akut (hard set efektif 7 hari)', value: round(acute, 2), note: 'total ESL x bobot otot' },
    {
      name: coldStart ? 'baseline default (cold start)' : `beban kronis (rata-rata/minggu, ${chronicDaysUsed} hari sebelumnya)`,
      value: round(chronic, 2),
      note: coldStart ? `${weekly} hard set/minggu (target default)` : 'kebiasaan pribadi, tidak tumpang tindih dengan akut',
    },
    { name: 'ACWR', value: round(acwr, 3), note: 'indikator relatif, bukan prediktor cedera' },
    {
      name: 'skor objektif', value: round(objectiveScore, 1),
      weight: subj === null ? 1 : PARAMS.objectiveWeight,
      contribution: round((subj === null ? 1 : PARAMS.objectiveWeight) * objectiveScore, 2),
      note: '50 * ACWR, batas 0-100',
    },
  ];
  if (subj !== null) {
    components.push({
      name: 'fatigue subjektif (soreness)', value: round(subj, 1), weight: PARAMS.subjectiveWeight,
      contribution: round(PARAMS.subjectiveWeight * subj, 2),
    });
  }
  const caveats = [
    'ACWR hanya indikator relatif terhadap kebiasaan; kritik metodologis: Impellizzeri et al. 2020.',
  ];
  if (coldStart) caveats.push(`Riwayat ${historyDays} hari (< ${PARAMS.coldStartDays}); baseline memakai target volume default, kepercayaan rendah.`);
  if (subj === null) caveats.push('Tidak ada check-in; skor hanya dari komponen objektif.');

  return {
    muscleId, acute, chronic, acwr, objectiveScore, subjectiveFatigue: subj, fatigue, confidence, coldStart, historyDays,
    explanation: {
      summary: `${muscleId}: fatigue ${round(fatigue, 1)} (objektif ${round(objectiveScore, 1)}, ACWR ${round(acwr, 2)}, kepercayaan ${confidence}).`,
      components, caveats,
    },
  };
}

                                  
                
                            
                                   
                           
 

/**
 * Sistemik = 0.7 * rata-rata tertimbang (bobot = beban kronis) skor OBJEKTIF otot + 0.3 * fatigue subjektif (100 - readiness).
 * Memakai skor objektif (bukan skor otot yang sudah memuat soreness) agar komponen subjektif tidak dihitung ganda.
 */
export function computeSystemicFatigue(muscles                 , readiness                        )                  {
  const totalW = muscles.reduce((a, m) => a + m.chronic, 0);
  const objectiveWeighted =
    muscles.length === 0 ? 0 : totalW > 0
      ? muscles.reduce((a, m) => a + m.chronic * m.objectiveScore, 0) / totalW
      : mean(muscles.map((m) => m.objectiveScore));
  const subj = readiness?.subjectiveFatigue ?? null;
  const wObj = subj === null ? 1 : PARAMS.objectiveWeight;
  const score = wObj * objectiveWeighted + (subj === null ? 0 : PARAMS.subjectiveWeight * subj);
  const components                         = [
    { name: 'objektif (rata-rata tertimbang beban kronis)', value: round(objectiveWeighted, 1), weight: wObj, contribution: round(wObj * objectiveWeighted, 2) },
    ...muscles.map((m)                       => ({
      name: `otot ${m.muscleId}`, value: round(m.objectiveScore, 1),
      weight: totalW > 0 ? round(m.chronic / totalW, 3) : round(1 / muscles.length, 3),
      note: 'bobot = porsi beban kronis',
    })),
  ];
  if (subj !== null) {
    components.push({ name: 'subjektif (100 - readiness)', value: round(subj, 1), weight: PARAMS.subjectiveWeight, contribution: round(PARAMS.subjectiveWeight * subj, 2) });
  }
  return {
    score, objectiveWeighted, subjectiveFatigue: subj,
    explanation: {
      summary: `Fatigue sistemik ${round(score, 1)}/100.`,
      components,
      caveats: subj === null ? ['Tidak ada check-in; hanya komponen objektif.'] : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline gabungan
// ---------------------------------------------------------------------------

                               
                 
                        
                                
                          
                            
                            
 

                                  
               
                           
                             
                            
 

function snapshotFromLoads(loads                  , input              , asOf        )                  {
  const checkins = input.checkins ?? [];
  const muscles = Object.keys(loads)
    .sort()
    .map((muscleId) =>
      computeMuscleFatigue({
        muscleId, dailyLoad: loads[muscleId], asOf,
        sorenessFatigue: sorenessFatigue(checkins, asOf, muscleId),
        weeklyTargetSets: input.weeklyTargetSets,
      }),
    )
    .filter((m) => m.historyDays > 0);
  const readiness = computeReadiness(checkins, asOf);
  return { asOf, muscles, readiness, systemic: computeSystemicFatigue(muscles, readiness) };
}

export function computeFatigueSnapshot(input              , asOf        )                  {
  const loads = buildDailyMuscleLoads(input.sets, input.exercises, input.defaultTargetRir);
  return snapshotFromLoads(loads, input, asOf);
}

/** Skor sistemik harian untuk `days` hari terakhir (tertua dulu). Rata-ratanya = fatigue mingguan. */
export function systemicHistory(input              , asOf        , days = 7)                                    {
  const loads = buildDailyMuscleLoads(input.sets, input.exercises, input.defaultTargetRir);
  const out                                    = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(asOf, -i);
    out.push({ date: d, score: snapshotFromLoads(loads, input, d).systemic.score });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Performa: e1RM & tren
// ---------------------------------------------------------------------------

/** Epley dengan reps efektif = reps + RIR. null bila reps > 12, reps < 1, atau beban <= 0. */
export function computeE1RM(loadKg        , reps        , rir         = 0)                {
  if (!(loadKg > 0) || reps < 1 || reps > PARAMS.maxE1rmReps) return null;
  return loadKg * (1 + (reps + Math.max(0, rir)) / 30);
}

                                   
                     
                      
                           
                           
                             
                       
                           
 

/**
 * Bandingkan rata-rata e1RM terbaik 2 sesi terakhir vs 2-3 sesi sebelumnya (hanya set 'working').
 * improving >= +1%; stagnant [-2%, +1%); declining < -2%. Butuh minimal 4 sesi.
 */
export function performanceTrend(sets          , exerciseId        , asOf         , defaultTargetRir         = PARAMS.defaultTargetRir)                   {
  const best = new Map                ();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.setType !== 'working') continue;
    if (asOf && s.date > asOf) continue;
    const e = computeE1RM(s.loadKg, s.reps, resolveRir(s, defaultTargetRir).rir);
    if (e === null) continue;
    best.set(s.date, Math.max(best.get(s.date) ?? 0, e));
  }
  const sessions = [...best.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]);
  if (sessions.length < 4) {
    return {
      exerciseId, status: 'insufficient', changePct: null, recentAvg: null, previousAvg: null, sessionsUsed: sessions.length,
      explanation: { summary: `Data belum cukup (${sessions.length} sesi, butuh >= 4).`, components: [] },
    };
  }
  const recent = sessions.slice(-2);
  const previous = sessions.slice(-5, -2); // hingga 3 sesi sebelumnya (minimal 2)
  const recentAvg = mean(recent);
  const previousAvg = mean(previous);
  const changePct = ((recentAvg - previousAvg) / previousAvg) * 100;
  const status              =
    changePct >= PARAMS.trendImproveThresholdPct ? 'improving' : changePct < PARAMS.trendDeclineThresholdPct ? 'declining' : 'stagnant';
  return {
    exerciseId, status, changePct, recentAvg, previousAvg, sessionsUsed: recent.length + previous.length,
    explanation: {
      summary: `e1RM ${round(changePct, 1)}% (${status}).`,
      components: [
        { name: 'rata-rata e1RM 2 sesi terakhir', value: round(recentAvg, 1) },
        { name: `rata-rata e1RM ${previous.length} sesi sebelumnya`, value: round(previousAvg, 1) },
        { name: 'perubahan %', value: round(changePct, 2), note: 'improving >= +1, declining < -2' },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// 7. RIR drift
// ---------------------------------------------------------------------------

                                 
                       
                                         
                
                     
                           
 

/**
 * Pilihan metode (paling bisa dihitung dari data log):
 *  1) 'target': rata-rata (RIR aktual - targetRir) pada working set 7 hari terakhir yang punya target.
 *     Set yang bebannya > 2.5% di atas targetLoadKg dikecualikan (user sengaja lebih berat, bukan tanda fatigue),
 *     sehingga ukurannya "RIR pada beban yang sama".
 *  2) 'baseline' (bila tidak ada target): rata-rata RIR 7 hari terakhir - rata-rata RIR hari ke-8..35 (kebiasaan pribadi).
 * RIR aktual hanya dari `rir`/`rpe` nyata; set dengan RIR hanya asumsi diabaikan agar tidak mengencerkan drift.
 * Pemicu: drift <= -1.0.
 */
export function rirDrift(sets          , asOf        )                 {
  const actual = (s        )                => {
    const r = resolveRir({ ...s, targetRir: null }, 0);
    return r.source === 'rir' || r.source === 'rpe' ? r.rir : null;
  };
  const recent = sets.filter((s) => s.setType === 'working' && inWindow(s.date, asOf, 7));

  const diffs           = [];
  for (const s of recent) {
    const a = actual(s);
    if (a === null || s.targetRir === null || s.targetRir === undefined) continue;
    if (s.targetLoadKg && s.loadKg > s.targetLoadKg * PARAMS.rirDriftHeavierToleranceRatio) continue;
    diffs.push(a - s.targetRir);
  }
  const mk = (drift               , method                          , n        , summary        , comps                        )                 => ({
    drift, method, nSets: n, triggered: drift !== null && drift <= PARAMS.rirDriftThreshold,
    explanation: { summary, components: comps },
  });

  if (diffs.length >= PARAMS.rirDriftMinSets) {
    const d = mean(diffs);
    return mk(d, 'target', diffs.length, `RIR drift ${round(d, 2)} vs target (${diffs.length} set).`, [
      { name: 'rata-rata (RIR aktual - target)', value: round(d, 2), note: 'pemicu <= -1.0' },
    ]);
  }

  const recentActual = recent.map(actual).filter((x)              => x !== null);
  const base = sets
    .filter((s) => s.setType === 'working' && daysBetween(s.date, asOf) >= 7 && daysBetween(s.date, asOf) < 35)
    .map(actual)
    .filter((x)              => x !== null);
  if (recentActual.length >= PARAMS.rirDriftMinSets && base.length >= PARAMS.rirDriftMinSets) {
    const d = mean(recentActual) - mean(base);
    return mk(d, 'baseline', recentActual.length, `RIR drift ${round(d, 2)} vs kebiasaan 4 minggu.`, [
      { name: 'RIR rata-rata 7 hari', value: round(mean(recentActual), 2) },
      { name: 'RIR rata-rata hari ke-8..35', value: round(mean(base), 2) },
    ]);
  }
  return mk(null, 'none', Math.max(diffs.length, recentActual.length), 'Data RIR belum cukup untuk menghitung drift.', []);
}

// ---------------------------------------------------------------------------
// 8. Monotony & strain (Foster)
// ---------------------------------------------------------------------------

                                 
                       
                     
               
             
                                                                  
                        
 

export function monotonyStrain(sessions              , asOf        , days = 7)                 {
  const daily           = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(asOf, -i);
    daily.push(sessions.filter((s) => s.date === d).reduce((a, s) => a + s.sessionRpe * s.durationMinutes, 0));
  }
  const m = mean(daily);
  const sd = Math.sqrt(mean(daily.map((x) => (x - m) ** 2))); // SD populasi
  const weeklyLoad = daily.reduce((a, b) => a + b, 0);
  const monotony = sd > 1e-9 ? m / sd : null;
  return { dailyLoads: daily, weeklyLoad, mean: m, sd, monotony, strain: monotony === null ? null : weeklyLoad * monotony };
}

// ---------------------------------------------------------------------------
// 9. Deload
// ---------------------------------------------------------------------------

                                                                                                           

                                
                      
                
                     
                        
                    
                 
 

                              
               
                                                                     
                                                    
                          
                             
                                                                                                                        
                                 
                                                                          
                                                 
 

                                 
                       
                            
                                      
                     
                                
                          
                              
                  
                           
 

export function evaluateDeload(input             )                 {
  const P = DELOAD_PARAMS;
  const interval = clamp(input.deloadIntervalWeeks ?? P.defaultIntervalWeeks, P.minIntervalWeeks, P.maxIntervalWeeks);

  const hist = input.systemicLast7.slice(-P.systemicWindowDays);
  const highDays = hist.filter((s) => s >= P.systemicHighScore).length;
  const stagnantMain = input.trends.filter((t) => t.status === 'stagnant' || t.status === 'declining');
  const refDate = input.lastDeloadDate ?? input.trainingStartDate ?? null;
  const weeksSince = refDate ? daysBetween(refDate, input.asOf) / 7 : null;
  const weeksSinceLast = input.lastDeloadDate ? daysBetween(input.lastDeloadDate, input.asOf) / 7 : null;

  const triggers                  = [
    {
      id: 'systemic_fatigue', label: `Fatigue sistemik >= ${P.systemicHighScore} pada >= ${P.systemicHighDaysRequired} dari ${P.systemicWindowDays} hari`,
      triggered: highDays >= P.systemicHighDaysRequired, actual: highDays, threshold: P.systemicHighDaysRequired,
      detail: `${highDays} hari dengan skor >= ${P.systemicHighScore}`,
    },
    {
      id: 'performance', label: `Performa stagnan/turun pada >= ${P.stagnantMainLiftsRequired} latihan utama`,
      triggered: stagnantMain.length >= P.stagnantMainLiftsRequired, actual: stagnantMain.length, threshold: P.stagnantMainLiftsRequired,
      detail: stagnantMain.length ? stagnantMain.map((t) => `${t.exerciseId} (${t.status})`).join(', ') : 'tidak ada',
    },
    {
      id: 'rir_drift', label: `RIR drift <= ${PARAMS.rirDriftThreshold.toFixed(1)}`,
      triggered: input.rirDrift !== null && input.rirDrift <= PARAMS.rirDriftThreshold, actual: input.rirDrift, threshold: PARAMS.rirDriftThreshold,
      detail: input.rirDrift === null ? 'data tidak cukup' : `drift ${round(input.rirDrift, 2)}`,
    },
    {
      id: 'readiness', label: `Readiness rata-rata 7 hari < ${P.readinessLow}`,
      triggered: input.readiness7d !== null && input.readiness7d < P.readinessLow, actual: input.readiness7d, threshold: P.readinessLow,
      detail: input.readiness7d === null ? 'tidak ada check-in' : `rata-rata ${round(input.readiness7d, 1)}`,
    },
    {
      id: 'proactive', label: `Minggu sejak deload terakhir >= ${interval}`,
      triggered: weeksSince !== null && weeksSince >= interval, actual: weeksSince === null ? null : round(weeksSince, 1), threshold: interval,
      detail: weeksSince === null ? 'tanggal acuan tidak diketahui' : `${round(weeksSince, 1)} minggu`,
    },
  ];

  const core = triggers.slice(0, 4);
  const coreCount = core.filter((t) => t.triggered).length;
  const proactive = triggers[4].triggered;
  const wouldDeload = proactive || coreCount >= 2;
  const cooldownActive = weeksSinceLast !== null && weeksSinceLast < P.cooldownWeeks;
  const override = core[0].triggered && core[3].triggered; // (a)+(d)
  const deload = wouldDeload && (!cooldownActive || override);
  const suppressedByCooldown = wouldDeload && !deload;
  const status               = deload ? 'deload' : coreCount >= 1 || suppressedByCooldown ? 'watch' : 'ok';

  let type                    = null;
  let durationDays                = null;
  if (deload) {
    const it = input.readinessItems7d;
    const jointDominant = !!it && it.jointPain <= P.jointPainDominantMax && it.jointPain <= Math.min(it.sleep, it.soreness, it.motivation);
    type = jointDominant ? 'intensity' : 'volume';
    durationDays = coreCount === 0 ? P.durationDaysMild : P.durationDaysFull;
  }

  const fired = triggers.filter((t) => t.triggered).map((t) => t.label);
  let message        ;
  if (status === 'deload') {
    message =
      type === 'intensity'
        ? `Rekomendasi deload ${durationDays} hari (intensitas): turunkan beban ~12.5%, kurangi volume ~30%, pertahankan RIR >= 2. Pemicu utama: nyeri sendi.`
        : `Rekomendasi deload ${durationDays} hari (volume): kurangi hard set 50%, pertahankan beban, RIR >= 3.`;
    message += ` Pemicu: ${fired.join('; ')}.`;
  } else if (status === 'watch') {
    message = suppressedByCooldown
      ? `Waspada: pemicu deload terpenuhi, tetapi deload terakhir < ${P.cooldownWeeks} minggu lalu. Pantau; deload baru bila fatigue sistemik tinggi dan readiness rendah bersamaan.`
      : `Waspada: ${fired.join('; ')}. Pantau beberapa sesi ke depan.`;
  } else {
    message = 'Tidak ada pemicu deload. Lanjutkan program.';
  }

  return {
    status, triggers, coreTriggerCount: coreCount, proactive, suppressedByCooldown, type, durationDays, message,
    explanation: {
      summary: `Status ${status}: ${coreCount} dari 4 pemicu reaktif, proaktif ${proactive ? 'ya' : 'tidak'}${cooldownActive ? ', cooldown aktif' : ''}.`,
      components: triggers.map((t) => ({ name: t.label, value: t.actual, note: `${t.triggered ? 'TERPICU' : 'aman'} (ambang ${t.threshold}); ${t.detail}` })),
      caveats: ['Aturan heuristik transparan, bukan diagnosis; keputusan akhir tetap di pengguna/pelatih.'],
    },
  };
}

/** Jalankan seluruh pipeline dari log mentah menjadi keputusan deload. */
export function analyze(
  input              ,
  asOf        ,
  opts                                                                                                      = {},
)                                                                                                                                                                                        {
  const snapshot = computeFatigueSnapshot(input, asOf);
  const history = systemicHistory(input, asOf, 7);
  const trends = input.exercises.filter((e) => e.isMain).map((e) => performanceTrend(input.sets, e.id, asOf, input.defaultTargetRir));
  const drift = rirDrift(input.sets, asOf);
  const r7 = computeReadiness(input.checkins ?? [], asOf, 7);
  const deload = evaluateDeload({
    asOf, systemicLast7: history.map((h) => h.score), trends, rirDrift: drift.drift, readiness7d: r7.readiness,
    readinessItems7d: r7.itemAverages, lastDeloadDate: opts.lastDeloadDate, trainingStartDate: opts.trainingStartDate,
    deloadIntervalWeeks: opts.deloadIntervalWeeks,
  });
  return { snapshot, history, trends, drift, monotony: input.sessions ? monotonyStrain(input.sessions, asOf) : null, deload };
}

// ---------------------------------------------------------------------------
// 10. Terapkan deload ke rencana
// ---------------------------------------------------------------------------

                                  
                     
               
               
                 
                    
 

export function applyDeloadToPlan(
  plan                   ,
  type            ,
  opts                          = {},
)                    {
  const rx = DELOAD_PRESCRIPTION[type];
  const step = opts.loadStepKg ?? 0.5;
  return plan.map((p) => ({
    ...p,
    sets: Math.max(1, Math.round(p.sets * rx.setsMultiplier)),
    loadKg: Math.round((p.loadKg * rx.loadMultiplier) / step) * step,
    targetRir: Math.max(p.targetRir, rx.minRir),
  }));
}
