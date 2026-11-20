// Sesi aktif: mesin state siap -> set berjalan (TUT) -> jeda + input -> siap berikutnya.
// Semua waktu disimpan sebagai timestamp, jadi tetap akurat saat layar mati atau aplikasi dimuat ulang.
import { state, save, getExercise } from './store.js';
import { onMany, rerender, navigate, icon } from './ui.js';
import { esc, num, fmtClock, fmtStop, uid, localDate, fmtThousands, setTable } from './util.js';
import { planForDay, lastPerf, lastSets, sessionStats, activeDeload } from './analysis.js';
import { unlockAudio, beepRestDone, tickBeep, acquireWake, releaseWake } from './device.js';

const A = () => state.active;
let lastTickKey = null;
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
    load: lp ? lp.load : 20, rir: ex.compound ? 2 : 1, rest: ex.compound ? 120 : 90,
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

/** Nilai isian set berikutnya hanya ikut berubah bila yang diedit adalah set terakhir. */
function syncInputs(a, s) {
  if (s === a.sets[a.sets.length - 1]) a.inputs = { load: s.load, reps: s.reps };
}

/**
 * Gerakan yang dimaksud tombol "+ Set" dan "− Set". Di layar jeda setelah set terakhir sebuah gerakan,
 * aplikasi sudah menunjuk gerakan berikutnya, tetapi maksud pengguna tetap gerakan yang baru selesai.
 */
function ctxEi(a) {
  const last = a.sets[a.sets.length - 1];
  return a.phase === 'rest' && last && last.ei !== a.ei && a.plan[last.ei] ? last.ei : a.ei;
}

const cleanLoad = (v) => {
  const n = parseNum(v);
  return n === null ? null : Math.min(999, Math.max(0, Math.round(n * 10) / 10));
};
const cleanReps = (v) => {
  const n = parseNum(v);
  return n === null ? null : Math.min(99, Math.max(1, Math.round(n)));
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
    syncInputs(a, s);
    touchSheet(a);
    save();
    rerender();
  },
  'sh-load+': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.load = stepLoad(s.load, 1);
    syncInputs(a, s);
    touchSheet(a);
    save();
    rerender();
  },
  'sh-reps-': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.reps = Math.max(1, s.reps - 1);
    syncInputs(a, s);
    touchSheet(a);
    save();
    rerender();
  },
  'sh-reps+': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    s.reps += 1;
    syncInputs(a, s);
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
    const ei = ctxEi(a);
    a.plan[ei].sets += 1;
    if (ei !== a.ei) {
      // Kembali ke gerakan yang baru selesai, dengan beban dan reps set terakhir.
      const last = a.sets[a.sets.length - 1];
      a.ei = ei;
      a.inputs = { load: last.load, reps: last.reps };
    }
    a.allDone = false;
    save();
    rerender();
  },
  'ses-less-set': () => {
    const a = A();
    const ei = ctxEi(a);
    const it = a.plan[ei];
    if (it.sets <= Math.max(1, doneCount(a, ei))) return;
    it.sets -= 1;
    if (doneCount(a, ei) >= it.sets) recomputeProgress(ei);
    save();
    rerender();
  },
  // Ketik langsung beban / reps.
  'in-load-set': (el) => {
    const v = cleanLoad(el.value);
    if (v !== null) A().inputs.load = v;
    save();
    rerender();
  },
  'in-reps-set': (el) => {
    const v = cleanReps(el.value);
    if (v !== null) A().inputs.reps = v;
    save();
    rerender();
  },
  'sh-load-set': (el) => {
    const a = A();
    const s = sheetSet(a);
    const v = cleanLoad(el.value);
    if (s && v !== null) {
      s.load = v;
      syncInputs(a, s);
    }
    touchSheet(a);
    save();
    rerender();
  },
  'sh-reps-set': (el) => {
    const a = A();
    const s = sheetSet(a);
    const v = cleanReps(el.value);
    if (s && v !== null) {
      s.reps = v;
      syncInputs(a, s);
    }
    touchSheet(a);
    save();
    rerender();
  },
  // Buka set yang sudah tersimpan untuk diedit (ketuk barisnya di tabel).
  'sh-edit': (el) => {
    const a = A();
    if (!a.sets.some((s) => s.id === el.dataset.id)) return;
    a.sheetSet = el.dataset.id;
    touchSheet(a);
    save();
    rerender();
  },
  'sh-del': () => {
    const a = A();
    const s = sheetSet(a);
    if (!s) return;
    const idx = a.sets.indexOf(s);
    a.sets.splice(idx, 1);
    a.sheetSet = null;
    recomputeProgress(s.ei);
    const last = a.sets[a.sets.length - 1];
    if (last && last.ei === s.ei) a.inputs = { load: last.load, reps: last.reps };
    save();
    rerender();
  },
  'ses-undo': () => {
    const a = A();
    const s = a.sets.pop();
    if (!s) return;
    a.ei = s.ei;
    a.allDone = false;
    a.inputs = { load: s.load, reps: s.reps };
    a.sheetSet = null;
    a.phase = 'ready';
    a.phaseStart = Date.now();
    a.lastRestSec = null;
    save();
    rerender();
  },
  'ses-rm-ex': () => {
    const a = A();
    const idx = a.ei;
    if (a.plan.length <= 1 || doneCount(a, idx) > 0) return;
    a.plan.splice(idx, 1);
    a.sets.forEach((t) => {
      if (t.ei > idx) t.ei -= 1;
    });
    if (a.ei >= a.plan.length) {
      a.ei = a.plan.length - 1;
      a.allDone = true;
    } else {
      a.inputs = initInputs(a.plan[a.ei]);
    }
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

let menuOpen = false;
let menuFresh = false;
onMany({
  'menu-open': () => {
    menuOpen = true;
    menuFresh = true;
    rerender();
  },
  'menu-close': () => {
    menuOpen = false;
    rerender();
  },
});
// Aksi di dalam menu menutup menu lebih dulu.
document.addEventListener('click', (e) => {
  if (menuOpen && e.target.closest('.menu [data-act]')) menuOpen = false;
}, true);

function top(a) {
  return `<div class="ses-top">
    <div class="ses-name"><b>${esc(a.name)}</b><span class="ses-clock" id="sclock">${fmtClock((Date.now() - a.startedAt) / 1000)}</span></div>
    <button class="btn-sm" data-act="ses-finish">Akhiri</button>
  </div>`;
}

/** Angka bisa diketuk lalu diketik langsung (data-change), atau diubah dengan tombol − / +. */
export function stepper(label, valText, minus, plus, typed) {
  return `<div class="stp">
    <div class="stp-lbl">${label}</div>
    <div class="stp-row">
      <button class="sb" data-act="${minus}" aria-label="Kurangi ${label}">−</button>
      <input class="stp-val" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${valText}" data-change="${typed}" onfocus="this.select()" aria-label="${label}">
      <button class="sb" data-act="${plus}" aria-label="Tambah ${label}">+</button>
    </div>
  </div>`;
}

const parseNum = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Tabel set seperti halaman buku log: set selesai, set sekarang (disorot), lalu sisa target. */
function logTable(a, it) {
  const ei = a.ei;
  const logged = a.sets.filter((s) => s.ei === ei);
  const prev = lastSets(it.exId);
  const done = doneCount(a, ei);
  const n = Math.max(it.sets, done);
  const fmtPrev = (p) => (p ? `${num(p.load)}×${p.reps}` : '–');
  let rows = '';
  let w = 0;
  for (const s of logged) {
    const isW = s.type === 'working';
    const label = isW ? String(++w) : s.type === 'warmup' ? 'P' : 'D';
    const cls = `done ${isW ? '' : 'wu'} ${s.confirmed ? '' : 'unc'}`;
    rows += `<tr class="${cls} tap" data-act="sh-edit" data-id="${s.id}"><td>${label}</td><td class="prev">${isW ? fmtPrev(prev[w - 1]) : ''}</td><td>${num(s.load)}</td><td>${s.reps}</td><td>${s.rir != null ? (s.rir >= 5 ? '5+' : s.rir) : '–'}</td><td class="ck">${s.confirmed ? '✓' : '•'}</td></tr>`;
  }
  for (let i = done; i < n; i++) {
    const cur = i === done && !a.allDone;
    rows += cur
      ? `<tr class="cur"><td>${i + 1}</td><td class="prev">${fmtPrev(prev[i])}</td><td>${num(a.inputs.load)}</td><td>${a.inputs.reps}</td><td>${it.rir}</td><td></td></tr>`
      : `<tr class="plan"><td>${i + 1}</td><td class="prev">${fmtPrev(prev[i])}</td><td>${num(it.load)}</td><td>${it.repMin}–${it.repMax}</td><td>${it.rir}</td><td></td></tr>`;
  }
  return `<table class="log"><thead><tr><th>Set</th><th>Lalu</th><th>Kg</th><th>Reps</th><th>RIR</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function extras(a, withQuick) {
  const ce = ctxEi(a);
  const other = ce !== a.ei ? ` ${esc(getExercise(a.plan[ce].exId).name.split(' ')[0])}` : '';
  return `<div class="extras">
    ${withQuick ? '<button class="btn-link" data-act="ses-quick">Catat tanpa timer</button>' : '<span></span>'}
    <span><button class="btn-link" data-act="ses-add-set">+ Set${other}</button><button class="btn-link" data-act="menu-open" aria-haspopup="menu">Lainnya ⋯</button></span>
  </div>`;
}

function menuHtml(a) {
  if (!menuOpen) return '';
  const it = a.plan[a.ei];
  const ex = getExercise(it.exId);
  const ce = ctxEi(a);
  const cit = a.plan[ce];
  const canLess = cit.sets > Math.max(1, doneCount(a, ce));
  const canRm = a.plan.length > 1 && doneCount(a, a.ei) === 0;
  const last = a.sets[a.sets.length - 1];
  const fresh = menuFresh ? ' fresh' : '';
  menuFresh = false;
  return `<div class="menu-bg${fresh}" data-act="menu-close"></div>
    <div class="menu${fresh}" role="menu">
      <div class="grip"></div>
      <div class="menu-t">${esc(ex.name)}</div>
      <button class="mi" data-act="ses-less-set" ${canLess ? '' : 'disabled'}>Kurangi satu set${ce !== a.ei ? ' · ' + esc(getExercise(cit.exId).name) : ''} <span>${cit.sets} set</span></button>
      ${last ? `<button class="mi" data-act="ses-undo">Urungkan set terakhir <span class="num">${num(last.load)}×${last.reps}</span></button>` : ''}
      <button class="mi" data-act="ses-skip-ex">Lewati gerakan ini</button>
      <button class="mi" data-act="ses-add-ex">Tambah gerakan</button>
      <button class="mi" data-act="nav" data-to="#/ex/${encodeURIComponent(it.exId)}">Lihat gambar gerakan</button>
      <button class="mi danger" data-act="ses-rm-ex" ${canRm ? '' : 'disabled'}>Hapus dari sesi ${canRm ? '' : '<span>sudah ada set</span>'}</button>
      <button class="mi" data-act="menu-close">Tutup</button>
    </div>`;
}

function nextInputs(a) {
  return `<div class="stp-pair">
    ${stepper('Beban (kg)', num(a.inputs.load), 'in-load-', 'in-load+', 'in-load-set')}
    ${stepper('Reps', String(a.inputs.reps), 'in-reps-', 'in-reps+', 'in-reps-set')}
  </div>`;
}

function readyView(a, it, ex) {
  const done = doneCount(a, a.ei);
  const dl = activeDeload();
  const editing = sheetSet(a);
  return `<section class="ses">
    ${top(a)}
    <div class="ses-ex">
      <div class="ex-pos"><span>${a.ei + 1}/${a.plan.length}</span>${dl ? '<span>deload</span>' : ''}<button class="btn-link inline" data-act="nav" data-to="#/ex/${encodeURIComponent(it.exId)}">lihat gerakan</button></div>
      <h1 class="ex-title">${esc(ex.name)}</h1>
      <div class="ex-meta"><span class="num">${it.repMin}–${it.repMax}</span> rep · RIR <span class="num">${it.rir}</span> · jeda <span class="num">${fmtClock(it.rest)}</span></div>
    </div>
    ${logTable(a, it)}
    ${editing ? '' : a.allDone ? '' : nextInputs(a)}
    <div class="grow"></div>
    ${
      editing
        ? sheetHtml(a, editing)
        : a.allDone
          ? `<button class="btn-big acc" data-act="ses-finish">Akhiri sesi</button>`
          : `<button class="btn-big work" data-act="ses-start-set">${icon('play', 24)} Mulai set ${done + 1}</button>`
    }
    ${editing ? '' : extras(a, !a.allDone)}
    ${menuHtml(a)}
  </section>`;
}

function workingView(a, it, ex) {
  const done = doneCount(a, a.ei);
  return `<section class="ses">
    ${top(a)}
    <div class="ses-ex">
      <div class="ex-pos"><span>Set ${done + 1} dari ${Math.max(it.sets, done + 1)}</span></div>
      <h1 class="ex-title">${esc(ex.name)}</h1>
      <div class="ex-meta"><span class="num">${num(a.inputs.load)}</span> kg · target <span class="num">${it.repMin}–${it.repMax}</span> rep</div>
    </div>
    <div class="tmr-wrap">
      <div class="tmr work" id="tm">${fmtStop((Date.now() - a.setStart) / 1000)}</div>
      <div class="muted-s">waktu di bawah beban</div>
      <div class="bar"><span class="band"></span><i id="tbar" style="width:0%"></i></div>
      <div class="bar-scale"><span style="left:0">0</span><span style="left:66.67%;transform:translateX(-50%)">40</span><span>60 dtk</span></div>
    </div>
    <div class="grow"></div>
    <button class="btn-stop" data-act="ses-done-set">${icon('stop', 44)}Selesai set</button>
  </section>`;
}

function sheetHtml(a, s) {
  const ex = getExercise(s.exId);
  const setNo = a.sets.filter((t) => t.exId === s.exId && t.ei === s.ei && t.type === 'working' && t.at <= s.at).length || 1;
  const rirSel = s.rir ?? s.targetRir ?? 2;
  const typeLbl = { working: 'Set kerja', warmup: 'Pemanasan', drop: 'Drop set' }[s.type];
  const chips = [0, 1, 2, 3, 4, 5]
    .map((v) => `<button class="chip-b ${rirSel === v ? 'sel' : ''}" data-act="sh-rir" data-v="${v}">${v === 5 ? '5+' : v}</button>`)
    .join('');
  return `<div class="sheet">
    <div class="grip"></div>
    <div class="sheet-h"><b>Set ${setNo} · ${esc(ex.name)}</b>${s.tut != null ? `<span class="tutc">${fmtClock(s.tut)}</span>` : ''}</div>
    <div class="stp-pair sm">
      ${stepper('Beban (kg)', num(s.load), 'sh-load-', 'sh-load+', 'sh-load-set')}
      ${stepper('Reps', String(s.reps), 'sh-reps-', 'sh-reps+', 'sh-reps-set')}
    </div>
    <div class="muted-s">Sisa rep (RIR)</div>
    <div class="chips-row">${chips}</div>
    <div class="row-g"><button class="btn-sm wide" data-act="sh-type">${typeLbl} ▾</button><button class="btn-sm" data-act="sh-del">Hapus set</button></div>
    <button class="btn-primary" data-act="sh-save">Simpan set</button>
    <div class="tiny">${a.phase === 'rest' ? 'Tersimpan otomatis setelah 20 detik tanpa disentuh.' : 'Ketuk angka untuk mengetik langsung.'}</div>
  </div>`;
}

function restView(a, it, ex) {
  const now = Date.now();
  const left = a.restTarget - (now - a.phaseStart) / 1000;
  const over = left < 0;
  const s = sheetSet(a);
  const done = doneCount(a, a.ei);
  const pct = Math.min(100, ((now - a.phaseStart) / 1000 / a.restTarget) * 100);
  return `<section class="ses">
    ${top(a)}
    <div class="rest-head"><span class="rest-lbl">Jeda</span><span class="muted-s">target <span class="num">${fmtClock(a.restTarget)}</span></span></div>
    <div class="tmr-wrap left" id="tmwrap">
      <div class="tmr rest ${over ? 'over' : ''}" id="tm">${over ? '+' + fmtClock(-left) : fmtClock(Math.ceil(left))}</div>
    </div>
    <div class="bar rest"><i id="tbar" style="width:${pct}%"></i></div>
    <div class="rest-ctl">
      <button class="btn-sm wide" data-act="rest-minus">−15</button>
      <button class="btn-sm wide" data-act="rest-plus">+15</button>
      <button class="btn-sm wide outline" data-act="rest-skip">Lewati</button>
    </div>
    <div class="grow"></div>
    ${
      s
        ? sheetHtml(a, s)
        : `<div class="nextpanel">
            ${
              a.allDone
                ? `<div class="next-line">Semua set selesai.</div><button class="btn-big acc" data-act="ses-finish">Akhiri sesi</button>`
                : `<div class="next-line">Berikut: <b>${esc(ex.name)}</b> · set ${done + 1} · <span class="num">${it.repMin}–${it.repMax}</span> rep</div>
                   ${nextInputs(a)}
                   <button class="btn-big work" data-act="ses-start-set">${icon('play', 24)} Mulai set ${done + 1}</button>`
            }
            ${extras(a, !a.allDone)}
          </div>`
    }
    ${menuHtml(a)}
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
      <div class="stat"><div class="k">Volume</div><div class="v">${fmtThousands(st.volume)}</div></div>
    </div>
    ${byEx.map((g) => `<div class="card"><div class="card-h"><b>${esc(getExercise(g.exId).name)}</b><span class="muted-s">${g.sets.length} set</span></div>
      ${setTable(g.sets)}</div>`).join('')}
    <div class="q"><div class="q-t">Seberat apa sesi ini? <span class="muted-s">(RPE, 10 = maksimal)</span></div><div class="chips-row">${rpe}</div></div>
    <div class="grow"></div>
    <button class="btn-primary" data-act="ses-save" ${a.sets.length ? '' : 'disabled'}>Simpan sesi</button>
    <button class="btn-ghost" data-act="ses-resume">Kembali ke sesi</button>
    <button class="btn-link danger" data-act="ses-discard">${a.confirmDiscard ? 'Ketuk lagi untuk membuang sesi ini' : 'Buang sesi'}</button>
  </section>`;
}

export function sessionView() {
  const a = A();
  if (!a) {
    return {
      nav: 'today',
      html: `<section class="page"><div class="empty"><h2>Tidak ada sesi berjalan</h2><p>Pilih hari latihan untuk mulai.</p><button class="btn-primary" data-act="nav" data-to="#/start">Pilih hari</button></div></section>`,
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
    const sLeft = Math.ceil(left);
    if (left > 0 && sLeft <= 3) {
      const k = a.phaseStart + ':' + sLeft;
      if (k !== lastTickKey) {
        lastTickKey = k;
        if (document.visibilityState === 'visible') tickBeep();
      }
    }
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
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sheet') && document.activeElement.tagName === 'INPUT';
    if (typing) a.sheetOpenAt = now;
    if (a.sheetSet && now - a.sheetOpenAt > 20000) {
      a.sheetSet = null;
      save();
      rerender();
    }
  }
}
