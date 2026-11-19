// Sesi aktif: mesin state siap -> set berjalan (TUT) -> jeda + input -> siap berikutnya.
// Semua waktu disimpan sebagai timestamp, jadi tetap akurat saat layar mati atau aplikasi dimuat ulang.
import { state, save, getExercise } from './store.js';
import { onMany, rerender, navigate, icon } from './ui.js';
import { esc, num, fmtClock, fmtStop, uid, localDate, fmtThousands } from './util.js';
import { planForDay, lastPerf, sessionStats, activeDeload } from './analysis.js';
import { unlockAudio, beepRestDone, acquireWake, releaseWake } from './device.js';

const A = () => state.active;
const doneCount = (a, ei) => a.sets.filter((s) => s.ei === ei && s.type === 'working').length;

function initInputs(item) {
  const lp = activeDeload() ? null : lastPerf(item.exId);
  return { load: lp ? lp.load : item.load, reps: lp ? lp.reps : item.repMax };
}

export function startSession(dayId) {
  const day = state.program.days.find((d) => d.id === dayId) || state.program.days[0];
  if (!day || !day.items.length) return;
  const plan = planForDay(day);
  const now = Date.now();
  state.active = {
    id: uid(), date: localDate(now), dayId: day.id, name: day.name, startedAt: now, plan,
    ei: 0, phase: 'ready', phaseStart: now, setStart: null, restTarget: 0, restBeeped: false,
    lastRestSec: null, restBefore: null, sets: [], inputs: initInputs(plan[0]),
    sheetSet: null, sheetOpenAt: 0, allDone: false, finishing: false, rpe: 7, confirmDiscard: false,
  };
  save();
  unlockAudio();
  acquireWake();
  navigate('#/session');
}

/** Tambahkan satu gerakan ke sesi berjalan (dipanggil dari pemilih gerakan). */
export function addToActive(exId) {
  const a = A();
  if (!a) return;
  const ex = getExercise(exId);
  const lp = lastPerf(exId);
  a.plan.push({
    exId, sets: 3, repMin: ex.compound ? 6 : 10, repMax: ex.compound ? 10 : 15,
    load: lp ? lp.load : 20, rir: ex.compound ? 2 : 1, rest: ex.compound ? 150 : 90,
  });
  if (a.allDone) {
    a.allDone = false;
    a.ei = a.plan.length - 1;
    a.inputs = initInputs(a.plan[a.ei]);
  }
  save();
}

// ---------------------------------------------------------------------------
// Transisi
// ---------------------------------------------------------------------------

function elapsedRest(a, now) {
  return Math.round((now - a.phaseStart) / 1000);
}

function startSet() {
  const a = A();
  const now = Date.now();
  unlockAudio();
  a.restBefore = a.phase === 'rest' ? elapsedRest(a, now) : a.lastRestSec;
  a.lastRestSec = null;
  a.sheetSet = null;
  a.phase = 'working';
  a.phaseStart = now;
  a.setStart = now;
  save();
  rerender();
}

function logSet(tut, restBefore, withSheet) {
  const a = A();
  const it = a.plan[a.ei];
  const now = Date.now();
  const set = {
    id: uid(), ei: a.ei, exId: it.exId, type: 'working', reps: a.inputs.reps, load: a.inputs.load,
    rir: null, tut, restBefore, confirmed: false, targetRir: it.rir, targetLoad: it.load, at: now,
  };
  a.sets.push(set);
  a.phase = 'rest';
  a.phaseStart = now;
  a.restTarget = it.rest;
  a.restBeeped = false;
  a.lastRestSec = null;
  a.restBefore = null;
  a.sheetSet = withSheet ? set.id : null;
  a.sheetOpenAt = now;
  if (doneCount(a, a.ei) >= it.sets) {
    if (a.ei < a.plan.length - 1) {
      a.ei += 1;
      a.inputs = initInputs(a.plan[a.ei]);
    } else {
      a.allDone = true;
    }
  }
  save();
  rerender();
}

function recomputeProgress(setEi) {
  const a = A();
  const it = a.plan[setEi];
  if (doneCount(a, setEi) >= it.sets) {
    if (setEi < a.plan.length - 1) {
      if (a.ei === setEi) {
        a.ei = setEi + 1;
        a.inputs = initInputs(a.plan[a.ei]);
      }
    } else {
      a.allDone = true;
    }
  } else {
    a.ei = setEi;
    a.allDone = false;
  }
}

const sheetSet = (a) => (a.sheetSet ? a.sets.find((s) => s.id === a.sheetSet) : null);
const touchSheet = (a) => {
  a.sheetOpenAt = Date.now();
};
const stepLoad = (v, dir) => {
  const step = (dir > 0 ? v : v - 0.01) < 20 ? 1 : 2.5;
  return Math.max(0, Math.round((v + dir * step) * 2) / 2);
};

onMany({
  'ses-start-set': () => startSet(),
  'ses-done-set': () => {
    const a = A();
    const tut = Math.round((Date.now() - a.setStart) / 1000);
    logSet(tut, a.restBefore, true);
  },
  'ses-quick': () => {
    const a = A();
    unlockAudio();
    const rb = a.phase === 'rest' ? elapsedRest(a, Date.now()) : a.lastRestSec;
    logSet(null, rb, false);
  },
  'rest-minus': () => {
    const a = A();
    a.restTarget = Math.max(15, a.restTarget - 15);
    a.restBeeped = false;
    save();
    rerender();
  },
  'rest-plus': () => {
    const a = A();
    a.restTarget += 15;
    a.restBeeped = false;
    save();
    rerender();
  },
  'rest-skip': () => {
    const a = A();
    a.lastRestSec = elapsedRest(a, Date.now());
    a.sheetSet = null;
    a.phase = 'ready';
    save();
    rerender();
  },
  'in-load-': () => {
    const a = A();
    a.inputs.load = stepLoad(a.inputs.load, -1);
    save();
    rerender();
  },
  'in-load+': () => {
    const a = A();
    a.inputs.load = stepLoad(a.inputs.load, 1);
    save();
    rerender();
  },
  'in-reps-': () => {
    const a = A();
    a.inputs.reps = Math.max(1, a.inputs.reps - 1);
    save();
    rerender();
  },
  'in-reps+': () => {
    const a = A();
    a.inputs.reps += 1;
    save();
    rerender();
  },
  'sh-load-': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.load = stepLoad(s.load, -1);
    a.inputs.load = s.load;
    touchSheet(a);
    save();
    rerender();
  },
  'sh-load+': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.load = stepLoad(s.load, 1);
    a.inputs.load = s.load;
    touchSheet(a);
    save();
    rerender();
  },
  'sh-reps-': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.reps = Math.max(1, s.reps - 1);
    a.inputs.reps = s.reps;
    touchSheet(a);
    save();
    rerender();
  },
  'sh-reps+': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.reps += 1;
    a.inputs.reps = s.reps;
    touchSheet(a);
    save();
    rerender();
  },
  'sh-rir': (el) => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.rir = Number(el.dataset.v);
    touchSheet(a);
    save();
    rerender();
  },
  'sh-type': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    const order = ['working', 'warmup', 'drop'];
    s.type = order[(order.indexOf(s.type) + 1) % order.length];
    recomputeProgress(s.ei);
    touchSheet(a);
    save();
    rerender();
  },
  'sh-save': () => {
    const a = A();
    const s = sheetSet(a);
    if (s) {
      if (s.rir === null || s.rir === undefined) s.rir = s.targetRir ?? 2;
      s.confirmed = true;
    }
    a.sheetSet = null;
    save();
    rerender();
  },
  'sh-close': () => {
    const a = A();
    a.sheetSet = null;
    save();
    rerender();
  },
  'ses-add-set': () => {
    const a = A();
    const it = a.plan[a.ei];
    it.sets += 1;
    a.allDone = false;
    save();
    rerender();
  },
  'ses-skip-ex': () => {
    const a = A();
    if (a.ei < a.plan.length - 1) {
      a.ei += 1;
      a.inputs = initInputs(a.plan[a.ei]);
    } else {
      a.allDone = true;
    }
    save();
    rerender();
  },
  'ses-add-ex': () => navigate('#/pick/session'),
  'ses-finish': () => {
    const a = A();
    a.finishing = true;
    a.confirmDiscard = false;
    save();
    rerender();
  },
  'ses-resume': () => {
    const a = A();
    a.finishing = false;
    save();
    rerender();
  },
  'ses-rpe': (el) => {
    const a = A();
    a.rpe = Number(el.dataset.v);
    save();
    rerender();
  },
  'ses-save': () => {
    const a = A();
    if (!a.sets.length) return;
    const now = Date.now();
    const sess = {
      id: a.id, date: a.date, dayId: a.dayId, name: a.name, startedAt: a.startedAt, endedAt: now,
      durationMin: Math.max(1, Math.round((now - a.startedAt) / 60000)), rpe: a.rpe,
      sets: a.sets.map(({ ei, ...t }) => t),
    };
    state.sessions.push(sess);
    state.lastDayId = a.dayId;
    state.active = null;
    releaseWake();
    save();
    navigate('#/ses/' + sess.id);
  },
  'ses-discard': () => {
    const a = A();
    if (!a.confirmDiscard) {
      a.confirmDiscard = true;
      rerender();
      return;
    }
    state.active = null;
    releaseWake();
    save();
    navigate('#/today');
  },
});

// ---------------------------------------------------------------------------
// Tampilan
// ---------------------------------------------------------------------------

function top(a) {
  return `<div class="ses-top">
    <div class="ses-name"><b>${esc(a.name)}</b><span class="ses-clock" id="sclock">${fmtClock((Date.now() - a.startedAt) / 1000)}</span></div>
    <button class="btn-sm" data-act="ses-finish">Selesai?</button>
  </div>`;
}

function pills(a, it) {
  const done = doneCount(a, a.ei);
  const n = Math.max(it.sets, done);
  let h = '';
  for (let i = 0; i < n; i++) {
    const cls = i < done ? 'done' : i === done && !a.allDone ? 'cur' : '';
    h += `<span class="pill ${cls}">${i < done ? '✓ ' : ''}${i + 1}</span>`;
  }
  return `<div class="pills">${h}</div>`;
}

function stepper(label, valText, minus, plus) {
  return `<div class="stp">
    <div class="stp-lbl">${label}</div>
    <div class="stp-row">
      <button class="sb" data-act="${minus}" aria-label="Kurangi ${label}">−</button>
      <span class="stp-val">${valText}</span>
      <button class="sb" data-act="${plus}" aria-label="Tambah ${label}">+</button>
    </div>
  </div>`;
}

function extras() {
  return `<div class="extras">
    <button class="btn-link" data-act="ses-add-set">+ Set</button>
    <button class="btn-link" data-act="ses-skip-ex">Lewati latihan</button>
    <button class="btn-link" data-act="ses-add-ex">+ Gerakan</button>
  </div>`;
}

function nextInputs(a, it) {
  return `<div class="stp-pair">
    ${stepper('BEBAN (KG)', num(a.inputs.load), 'in-load-', 'in-load+')}
    ${stepper('REPS', String(a.inputs.reps), 'in-reps-', 'in-reps+')}
  </div>`;
}

function readyView(a, it, ex) {
  const lp = lastPerf(it.exId);
  const done = doneCount(a, a.ei);
  const dl = activeDeload();
  return `<section class="ses">
    ${top(a)}
    <div class="ses-ex"><div class="muted-s">Latihan ${a.ei + 1} dari ${a.plan.length}${dl ? ' · deload aktif' : ''}</div>
      <h1 class="ex-title">${esc(ex.name)}</h1></div>
    ${pills(a, it)}
    <div class="infocard">
      <div><div class="k">TARGET</div><div>${it.repMin}–${it.repMax} rep · ${num(it.load)} kg · RIR ${it.rir}</div></div>
      <div class="r"><div class="k">SESI LALU</div><div>${lp ? `${num(lp.load)} kg × ${lp.reps}${lp.rir != null ? ' · RIR ' + lp.rir : ''}` : 'belum ada'}</div></div>
    </div>
    ${a.allDone ? '' : nextInputs(a, it)}
    <div class="note"><span class="ic">${icon('clock', 16)}</span> Jeda setelah set ini: ${fmtClock(it.rest)} (bisa diubah di layar jeda)</div>
    <div class="grow"></div>
    ${
      a.allDone
        ? `<button class="btn-big acc" data-act="ses-finish">SELESAI SESI</button>`
        : `<button class="btn-big work" data-act="ses-start-set">${icon('play', 28)} MULAI SET ${done + 1}</button>
           <button class="btn-ghost" data-act="ses-quick">✓ Catat tanpa timer</button>`
    }
    ${extras()}
  </section>`;
}

function workingView(a, it, ex) {
  const done = doneCount(a, a.ei);
  return `<section class="ses">
    ${top(a)}
    <div class="ses-ex"><div class="muted-s">${esc(ex.name)} · ${num(a.inputs.load)} kg · target ${it.repMin}–${it.repMax} rep</div>
      <h1 class="ex-title">Set ${done + 1} berjalan</h1></div>
    <div class="tmr-wrap">
      <div class="tmr work" id="tm">${fmtStop((Date.now() - a.setStart) / 1000)}</div>
      <div class="muted-s">Time under tension (TUT)</div>
      <div class="bar"><i id="tbar" style="width:0%"></i></div>
      <div class="bar-scale"><span>0</span><span>rentang umum 40–60 dtk</span><span>60</span></div>
    </div>
    <div class="grow"></div>
    <button class="btn-stop" data-act="ses-done-set">${icon('stop', 56)}SELESAI SET</button>
  </section>`;
}

function sheetHtml(a, s) {
  const ex = getExercise(s.exId);
  const setNo = a.sets.filter((t) => t.exId === s.exId && t.ei === s.ei && t.type === 'working' && t.at <= s.at).length || 1;
  const rirSel = s.rir ?? s.targetRir ?? 2;
  const typeLbl = { working: 'Working', warmup: 'Warm-up', drop: 'Drop set' }[s.type];
  const chips = [0, 1, 2, 3, 4, 5]
    .map((v) => `<button class="chip-b ${rirSel === v ? 'sel' : ''}" data-act="sh-rir" data-v="${v}">${v === 5 ? '5+' : v}</button>`)
    .join('');
  return `<div class="sheet">
    <div class="grip"></div>
    <div class="sheet-h"><b>Set ${setNo} · ${esc(ex.name)}</b>${s.tut != null ? `<span class="tutc">TUT ${fmtClock(s.tut)}</span>` : ''}</div>
    <div class="stp-pair sm">
      ${stepper('BEBAN (KG)', num(s.load), 'sh-load-', 'sh-load+')}
      ${stepper('REPS', String(s.reps), 'sh-reps-', 'sh-reps+')}
    </div>
    <div class="muted-s">Berapa rep lagi yang masih bisa dilakukan? (RIR)</div>
    <div class="chips-row">${chips}</div>
    <div class="row-g"><button class="btn-sm wide" data-act="sh-type">Tipe: ${typeLbl} ▾</button></div>
    <button class="btn-primary" data-act="sh-save">✓ SIMPAN SET</button>
    <div class="tiny">Tidak disentuh 20 detik: tersimpan dengan tanda • belum dikonfirmasi</div>
  </div>`;
}

function restView(a, it, ex) {
  const now = Date.now();
  const left = a.restTarget - (now - a.phaseStart) / 1000;
  const over = left < 0;
  const s = sheetSet(a);
  const done = doneCount(a, a.ei);
  const label = a.allDone ? 'Semua set selesai' : `${esc(ex.name)} · set ${done + 1} berikut`;
  const pct = Math.min(100, ((now - a.phaseStart) / 1000 / a.restTarget) * 100);
  return `<section class="ses">
    ${top(a)}
    <div class="rest-head"><span class="rest-lbl">JEDA</span><span class="muted-s">${label}</span></div>
    <div class="tmr-wrap left" id="tmwrap">
      <div class="tmr rest ${over ? 'over' : ''}" id="tm">${over ? '+' + fmtClock(-left) : fmtClock(Math.ceil(left))}</div>
      <div class="muted-s">target ${fmtClock(a.restTarget)}</div>
    </div>
    <div class="bar rest"><i id="tbar" style="width:${pct}%"></i></div>
    <div class="rest-ctl">
      <button class="btn-sm wide" data-act="rest-minus">−15 dtk</button>
      <button class="btn-sm wide" data-act="rest-plus">+15 dtk</button>
      <button class="btn-sm wide outline" data-act="rest-skip">LEWATI</button>
    </div>
    <div class="grow"></div>
    ${
      s
        ? sheetHtml(a, s)
        : `<div class="nextpanel">
            ${a.allDone ? '' : `<div class="muted-s">Berikut: ${it.repMin}–${it.repMax} rep · target ${num(it.load)} kg</div>${nextInputs(a, it)}`}
            ${
              a.allDone
                ? `<button class="btn-big acc" data-act="ses-finish">SELESAI SESI</button>`
                : `<button class="btn-big work" data-act="ses-start-set">${icon('play', 28)} MULAI SET ${done + 1}</button>
                   <button class="btn-ghost" data-act="ses-quick">✓ Catat tanpa timer</button>`
            }
            ${extras()}
          </div>`
    }
  </section>`;
}

function finishView(a) {
  const tmp = { sets: a.sets };
  const st = sessionStats(tmp);
  const byEx = [];
  for (const t of a.sets) {
    let g = byEx.find((x) => x.exId === t.exId);
    if (!g) byEx.push((g = { exId: t.exId, sets: [] }));
    g.sets.push(t);
  }
  const rpe = [5, 6, 7, 8, 9, 10]
    .map((v) => `<button class="chip-b ${a.rpe === v ? 'sel' : ''}" data-act="ses-rpe" data-v="${v}">${v}</button>`)
    .join('');
  const dur = Math.max(1, Math.round((Date.now() - a.startedAt) / 60000));
  return `<section class="page">
    <div class="page-h"><button class="icon-btn" data-act="ses-resume" aria-label="Kembali ke sesi">${icon('back', 20)}</button>
      <div><div class="muted-s">Akhiri sesi</div><h1 class="h1">${esc(a.name)}</h1></div></div>
    <div class="stats3">
      <div class="stat"><div class="k">Durasi</div><div class="v">${dur} mnt</div></div>
      <div class="stat"><div class="k">Set kerja</div><div class="v">${st.workSets}</div></div>
      <div class="stat"><div class="k">Volume</div><div class="v">${fmtThousands(st.volume)} kg</div></div>
    </div>
    ${byEx.map((g) => `<div class="card"><div class="card-h"><b>${esc(getExercise(g.exId).name)}</b><span class="muted-s">${g.sets.length} set</span></div>
      <div class="setchips">${g.sets.map((t) => `<span class="setchip ${t.confirmed ? '' : 'unc'}">${num(t.load)} × ${t.reps}${t.rir != null ? ' · RIR ' + t.rir : ''}${t.type === 'warmup' ? ' · WU' : t.type === 'drop' ? ' · drop' : ''}${t.confirmed ? '' : ' •'}</span>`).join('')}</div></div>`).join('')}
    <div class="row-g"><span class="muted-s">RPE sesi (seberapa berat, 10 = maksimal)</span></div>
    <div class="chips-row">${rpe}</div>
    <div class="grow"></div>
    <button class="btn-primary" data-act="ses-save" ${a.sets.length ? '' : 'disabled'}>SIMPAN &amp; SELESAI</button>
    <button class="btn-ghost" data-act="ses-resume">Kembali ke sesi</button>
    <button class="btn-link danger" data-act="ses-discard">${a.confirmDiscard ? 'Ketuk lagi untuk membuang sesi ini' : 'Buang sesi'}</button>
  </section>`;
}

export function sessionView() {
  const a = A();
  if (!a) {
    return {
      nav: 'today',
      html: `<section class="page"><div class="empty"><h2>Tidak ada sesi aktif</h2><p>Mulai dari layar Hari Ini.</p><button class="btn-primary" data-act="go-today">Ke Hari Ini</button></div></section>`,
    };
  }
  if (a.finishing) return { nav: null, html: finishView(a) };
  const it = a.plan[a.ei];
  const ex = getExercise(it.exId);
  let html;
  if (a.phase === 'working') html = workingView(a, it, ex);
  else if (a.phase === 'rest') html = restView(a, it, ex);
  else html = readyView(a, it, ex);
  return { nav: null, html };
}

// ---------------------------------------------------------------------------
// Detak per 250 ms: hanya memperbarui teks timer, tanpa render ulang.
// ---------------------------------------------------------------------------

export function tick() {
  const a = A();
  if (!a || a.finishing || !location.hash.startsWith('#/session')) return;
  const now = Date.now();
  const clk = document.getElementById('sclock');
  if (clk) clk.textContent = fmtClock((now - a.startedAt) / 1000);
  const tm = document.getElementById('tm');
  if (!tm) return;
  if (a.phase === 'working') {
    const sec = (now - a.setStart) / 1000;
    tm.textContent = fmtStop(sec);
    const bar = document.getElementById('tbar');
    if (bar) bar.style.width = Math.min(100, (sec / 60) * 100) + '%';
  } else if (a.phase === 'rest') {
    const el = (now - a.phaseStart) / 1000;
    const left = a.restTarget - el;
    tm.textContent = left >= 0 ? fmtClock(Math.ceil(left)) : '+' + fmtClock(-left);
    tm.classList.toggle('over', left < 0);
    const bar = document.getElementById('tbar');
    if (bar) bar.style.width = Math.min(100, (el / a.restTarget) * 100) + '%';
    if (left <= 0 && !a.restBeeped) {
      a.restBeeped = true;
      save();
      // Jangan membunyikan alarm basi bila aplikasi baru kembali dari latar belakang.
      if (document.visibilityState === 'visible' && -left < 4) beepRestDone();
      const w = document.getElementById('tmwrap');
      if (w) {
        w.classList.add('flash');
        setTimeout(() => w.classList.remove('flash'), 700);
      }
    }
    if (a.sheetSet && now - a.sheetOpenAt > 20000) {
      a.sheetSet = null;
      save();
      rerender();
    }
  }
}
