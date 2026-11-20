// Layar selain sesi aktif: Hari Ini, Check-in, Program, Pilih gerakan, Riwayat, Fatigue, Pengaturan.
import * as F from './fatigue.js';
import { state, save, getExercise, allExercises, exportJson, importJson, flush, replaceState, defaults } from './store.js';
import { CATALOG, GROUPS, EQUIPMENT, MUSCLE_NAMES, defaultProgram, TEMPLATES, programFromTemplate, imgUrl } from './catalog.js';
import { testBeep } from './device.js';
import { onMany, navigate, rerender, icon } from './ui.js';
import {
  esc, num, fmtClock, fmtThousands, fmtDurationMin, localDate, addDaysStr, dayShort, dayLong, weekStart, uid, mean, setTable,
} from './util.js';
import {
  analyzeAt, hasTrainingData, activeDeload, lastPerf, sessionStats, sessionPRs, sessionsDesc, e1rmOf, estimateKcal, fmtKcal,
} from './analysis.js';
import { startSession, addToActive, stepper } from './session.js';

const bar = (title, sub, back = true) => `<div class="page-h">${
  back ? `<button class="icon-btn" data-act="back" aria-label="Kembali">${icon('back', 20)}</button>` : ''
}<div><div class="muted-s">${sub || ''}</div><h1 class="h1">${title}</h1></div></div>`;

export function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.append(document.createTextNode(msg));
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-act';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.fn();
      el.remove();
    });
    el.append(b);
  }
  document.body.appendChild(el);
  const life = action ? 5200 : 2600;
  setTimeout(() => el.classList.add('hide'), life);
  setTimeout(() => el.remove(), life + 500);
}

function level(score) {
  if (score >= 70) return { label: 'Tinggi', cls: 'bad' };
  if (score >= 55) return { label: 'Meningkat', cls: 'warn' };
  if (score >= 35) return { label: 'Sedang', cls: 'good' };
  return { label: 'Rendah', cls: 'good' };
}

function spark(values, { threshold = null, w = 352, h = 70, min = null, max = null } = {}) {
  if (values.length < 2) return '';
  const lo = min ?? Math.min(...values, threshold ?? Infinity) - 5;
  const hi = max ?? Math.max(...values, threshold ?? -Infinity) + 5;
  const x = (i) => 8 + (i * (w - 16)) / (values.length - 1);
  const y = (v) => h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 12);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const th = threshold !== null ? `<line x1="0" y1="${y(threshold).toFixed(1)}" x2="${w}" y2="${y(threshold).toFixed(1)}" class="sp-th"/>` : '';
  const last = values.length - 1;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Grafik tren">${th}<path d="${d}" class="sp-line"/><circle cx="${x(last).toFixed(1)}" cy="${y(values[last]).toFixed(1)}" r="4.5" class="sp-dot"/></svg>`;
}

export function nextDay() {
  const days = state.program.days;
  if (!days.length) return null;
  const i = days.findIndex((d) => d.id === state.lastDayId);
  return days[(i + 1) % days.length];
}

/** Layar tombol Latih (tengah): pilih hari, yang berikutnya diberi tanda. */
export function startView() {
  const next = nextDay();
  const days = state.program.days;
  return {
    nav: 'latih',
    html: `<section class="page">
      ${bar('Pilih hari', 'Mulai latihan', false)}
      ${days.map((d) => `<button class="card tap" data-act="ses-begin" data-day="${d.id}">
        <div class="card-h"><b>${esc(d.name)}</b>${next && next.id === d.id ? '<span class="pr">berikutnya</span>' : ''}</div>
        <div class="muted-s">${d.items.length} gerakan · ${d.items.slice(0, 3).map((i) => esc(getExercise(i.exId).name)).join(' · ')}${d.items.length > 3 ? ' …' : ''}</div></button>`).join('')}
      ${days.length ? '' : '<div class="empty"><h2>Program kosong</h2><p>Tambahkan hari latihan dulu.</p><button class="btn-primary" data-act="nav" data-to="#/program">Buka Program</button></div>'}
    </section>`,
  };
}

// ---------------------------------------------------------------------------
// Hari Ini
// ---------------------------------------------------------------------------

function deloadBanner(an, today) {
  const dl = activeDeload();
  if (dl) {
    const what = dl.type === 'volume' ? 'set −50%, beban tetap, RIR ≥ 3' : 'beban −12,5%, set −30%, RIR ≥ 2';
    return `<button class="banner good" data-act="nav" data-to="#/fatigue">${icon('pulse', 22)}<div><b>Deload aktif sampai ${dayShort(dl.endDate)}</b><div class="muted-s">${what}</div></div></button>`;
  }
  if (!an) return '';
  const s = state.deload;
  if ((s.snoozeUntil && today <= s.snoozeUntil) || (s.hiddenUntil && today <= s.hiddenUntil)) return '';
  const d = an.deload;
  if (d.status === 'deload') {
    return `<button class="banner warn" data-act="nav" data-to="#/fatigue">${icon('warn', 22)}<div><b>Deload disarankan</b><div class="muted-s">${d.proactive && d.coreTriggerCount < 2 ? 'Jadwal proaktif tercapai' : `${d.coreTriggerCount} pemicu aktif`} · ketuk untuk alasan</div></div></button>`;
  }
  if (d.status === 'watch' && d.coreTriggerCount >= 1) {
    return `<button class="banner soft" data-act="nav" data-to="#/fatigue">${icon('pulse', 22)}<div><b>Waspada</b><div class="muted-s">${d.coreTriggerCount} pemicu mulai terlihat</div></div></button>`;
  }
  return '';
}

export function todayView() {
  const today = localDate();
  const an = hasTrainingData() ? analyzeAt(today) : null;
  const day = nextDay();
  const a = state.active;
  const week = state.sessions.filter((s) => s.date >= weekStart(today)).length;
  const planned = state.program.days.length;
  const ci = state.checkins.find((c) => c.date === today);

  let sessionCard = '';
  if (a) {
    sessionCard = `<div><div class="next-k">Sesi berjalan · mulai ${new Date(a.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div><div class="next-t">${esc(a.name)}</div>
      <div class="muted-s">${a.sets.length} set tercatat</div></div>
      <button class="btn-primary" data-act="nav" data-to="#/session">Lanjutkan sesi</button>`;
  } else if (day) {
    const items = day.items;
    const mins = Math.round(items.reduce((t, i) => t + i.sets * (i.rest / 60 + 0.8), 0) + 5);
    sessionCard = `<div><div class="next-k">Berikutnya · ${items.length} gerakan · ±${mins} mnt</div><div class="next-t">${esc(day.name)}</div></div>
      <table class="plan">${items.map((i) => `<tr><td class="n">${esc(getExercise(i.exId).name)}</td><td class="sr">${i.sets}×${i.repMin}–${i.repMax}</td><td class="kg">${num(i.load)} kg</td></tr>`).join('')}</table>
      <button class="btn-primary" data-act="ses-begin" data-day="${day.id}">${icon('play', 20)} Mulai ${esc(day.name)}</button>`;
  } else {
    sessionCard = `<div class="empty"><h2>Program masih kosong</h2><p>Tambahkan hari latihan dulu.</p><button class="btn-primary" data-act="nav" data-to="#/program">Buka Program</button></div>`;
  }

  const muscles = an ? [...an.snapshot.muscles].sort((x, y) => y.acute - x.acute).slice(0, 3) : [];
  return {
    nav: 'today',
    html: `<section class="page">
      <div class="page-h"><div><div class="muted-s">${dayLong(today)}</div><h1 class="h1">Hari ini</h1></div>
        <button class="icon-btn" data-act="nav" data-to="#/settings" aria-label="Pengaturan">${icon('gear', 22)}</button></div>
      ${deloadBanner(an, today)}
      ${sessionCard}
      <div class="strip">
        <button data-act="nav" data-to="#/checkin"><span class="k">Kesiapan</span>${ci ? `<span class="v">${Math.round(F.readinessOfCheckin(ci))}<span class="muted-s">/100</span></span>` : '<span class="go">Check-in →</span>'}</button>
        <div><span class="k">Minggu ini</span><span class="v">${week}<span class="muted-s">/${planned}</span></span>
          <span class="dots">${Array.from({ length: planned }, (_, i) => `<i class="${i < week ? 'on' : ''}"></i>`).join('')}</span></div>
      </div>
      ${muscles.length ? `<div><div class="k" style="margin-bottom:6px">Set efektif 7 hari</div><div class="chips-row wrap">${muscles.map((m) => `<span class="chip">${MUSCLE_NAMES[m.muscleId] || m.muscleId} <span class="num">${num(m.acute)}</span></span>`).join('')}</div></div>` : ''}
    </section>`,
  };
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

let ci = null;
const JOINTS = ['Bahu', 'Siku', 'Lutut', 'Pinggang', 'Pergelangan'];

function ciInit() {
  const today = localDate();
  const ex = state.checkins.find((c) => c.date === today);
  const last = [...state.checkins].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  ci = ex
    ? { ...ex, joints: [...(ex.joints || [])] }
    : last
      ? { sleep: last.sleep, soreness: last.soreness, jointPain: last.jointPain, motivation: last.motivation, joints: [] }
      : { sleep: 4, soreness: 4, jointPain: 5, motivation: 3, joints: [] };
}

function seg(key, labels) {
  return `<div class="seg5">${labels
    .map((l, i) => `<button class="seg-b ${ci[key] === i + 1 ? 'sel' : ''}" data-act="ci-set" data-k="${key}" data-v="${i + 1}">${l}</button>`)
    .join('')}</div>`;
}

export function checkinView() {
  if (!ci) ciInit();
  const pain = ['Berat', 'Sedang', 'Ringan', 'Sedikit', 'Tidak'];
  return {
    nav: null,
    html: `<section class="page">
      <div class="page-h"><div><div class="muted-s">Sebelum latihan</div><h1 class="h1">Check-in</h1></div>
        <button class="btn-link" data-act="ci-skip">Lewati</button></div>
      <div class="q"><div class="q-t">Tidur semalam</div>${seg('sleep', ['<5 jam', '5–6', '6–7', '7–8', '>8'])}</div>
      <div class="q"><div class="q-t">Pegal otot</div>${seg('soreness', pain)}</div>
      <div class="q"><div class="q-t">Nyeri sendi</div>${seg('jointPain', pain)}
        ${ci.jointPain <= 3 ? `<div class="chips-row wrap"><span class="muted-s">Bagian mana?</span>${JOINTS.map((j) => `<button class="chip-b ${ci.joints.includes(j) ? 'sel warn' : ''}" data-act="ci-joint" data-v="${j}">${j}</button>`).join('')}</div>` : ''}</div>
      <div class="q"><div class="q-t">Motivasi</div>${seg('motivation', ['1', '2', '3', '4', '5'])}</div>
      <p class="tiny">Terisi dari check-in terakhir.</p>
      <div class="grow"></div>
      <button class="btn-primary" data-act="ci-save">Simpan</button>
    </section>`,
  };
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export function programView() {
  const days = state.program.days;
  const hint = state.setupHint;
  return {
    nav: hint ? null : 'program',
    html: `<section class="page">
      ${bar('Program', esc(state.program.name), false)}
      ${hint ? `<div class="banner soft"><div><b>Sesuaikan gerakanmu</b><div class="muted-s">Ketuk satu hari untuk mengatur gerakannya. Beban awal hanya perkiraan.</div></div></div>` : ''}
      ${days.map((d) => `<button class="card tap" data-act="nav" data-to="#/day/${d.id}"><div class="card-h"><b>${esc(d.name)}</b><span class="muted-s num">${d.items.length} ›</span></div>
        <div class="muted-s">${d.items.length ? d.items.slice(0, 3).map((i) => esc(getExercise(i.exId).name)).join(' · ') + (d.items.length > 3 ? ' …' : '') : 'Belum ada gerakan. Ketuk untuk menambah.'}</div></button>`).join('')}
      <button class="btn-ghost" data-act="day-add">+ Tambah hari</button>
      ${hint ? '<div class="grow"></div><button class="btn-primary" data-act="setup-done">Selesai</button>' : '<button class="btn-ghost" data-act="nav" data-to="#/setup">Ganti kerangka program</button>'}
    </section>`,
  };
}

export function setupView() {
  const first = !state.setupDone;
  return {
    nav: null,
    html: `<section class="page">
      ${first
        ? '<div class="page-h"><div><div class="muted-s">Langkah pertama</div><h1 class="h1">Buat program latihan</h1></div></div>'
        : bar('Ganti program', 'Riwayat latihan tidak dihapus')}
      <p class="muted-s">Pilih kerangka. Gerakannya bisa diubah setelah ini.</p>
      ${TEMPLATES.map((t) => `<button class="card tap" data-act="setup-pick" data-id="${t.id}"><div class="card-h"><b>${esc(t.name)}</b><span class="muted-s">${t.id === 'kosong' ? '' : t.build().length + ' hari'}</span></div><div class="muted-s">${esc(t.desc)}</div></button>`).join('')}
      ${first ? '<button class="btn-link" data-act="setup-skip">Lewati, pakai program bawaan</button>' : ''}
    </section>`,
  };
}

export function dayView(id) {
  const day = state.program.days.find((d) => d.id === id);
  if (!day) return { nav: 'program', html: `<section class="page">${bar('Hari tidak ditemukan')}</section>` };
  return {
    nav: null,
    html: `<section class="page">
      ${bar('Atur hari', esc(state.program.name))}
      <label class="field"><span class="k">Nama hari</span><input id="dayname" type="text" value="${esc(day.name)}" data-in="day-name" data-day="${day.id}"></label>
      ${day.items.map((it, i) => {
        const ex = getExercise(it.exId);
        return `<div class="card item"><button class="item-main" data-act="nav" data-to="#/item/${day.id}/${i}"><b>${esc(ex.name)}</b>
          <span class="muted-s">${it.sets}×${it.repMin}–${it.repMax} · ${num(it.load)} kg · RIR ${it.rir} · jeda ${fmtClock(it.rest)}</span></button>
          <div class="item-ctl"><button class="icon-btn sm" data-act="item-move" data-day="${day.id}" data-i="${i}" data-d="-1" aria-label="Naik" ${i === 0 ? 'disabled' : ''}>${icon('up', 18)}</button>
          <button class="icon-btn sm" data-act="item-move" data-day="${day.id}" data-i="${i}" data-d="1" aria-label="Turun" ${i === day.items.length - 1 ? 'disabled' : ''}>${icon('down', 18)}</button>
          <button class="icon-btn sm del" data-act="item-rm" data-day="${day.id}" data-i="${i}" aria-label="Hapus ${esc(ex.name)}">${icon('trash', 18)}</button></div></div>`;
      }).join('')}
      <button class="btn-ghost" data-act="nav" data-to="#/pick/day:${day.id}">+ Tambah gerakan</button>
      <button class="btn-link danger" data-act="day-del" data-day="${day.id}">${pendingDel === day.id ? 'Ketuk lagi untuk menghapus hari ini' : 'Hapus hari'}</button>
    </section>`,
  };
}

let pendingDel = null;

function stepperRow(label, valText, k, dayId, idx) {
  return `<div class="srow"><span>${label}</span><div class="stp-row">
    <button class="sb" data-act="it-step" data-k="${k}" data-d="-1" data-day="${dayId}" data-i="${idx}" aria-label="Kurangi ${label}">−</button>
    <span class="stp-val sm">${valText}</span>
    <button class="sb" data-act="it-step" data-k="${k}" data-d="1" data-day="${dayId}" data-i="${idx}" aria-label="Tambah ${label}">+</button></div></div>`;
}

export function itemView(dayId, idx) {
  const day = state.program.days.find((d) => d.id === dayId);
  const it = day?.items[idx];
  if (!it) return { nav: null, html: `<section class="page">${bar('Gerakan tidak ditemukan')}</section>` };
  const ex = getExercise(it.exId);
  return {
    nav: null,
    html: `<section class="page">
      ${bar(esc(ex.name), `${esc(day.name)} · latihan ${Number(idx) + 1} dari ${day.items.length}`)}
      <div class="card tight">
        ${stepperRow('Jumlah set', it.sets, 'sets', dayId, idx)}
        ${stepperRow('Rep minimum', it.repMin, 'repMin', dayId, idx)}
        ${stepperRow('Rep maksimum', it.repMax, 'repMax', dayId, idx)}
        ${stepperRow('Beban (kg)', num(it.load), 'load', dayId, idx)}
        ${stepperRow('Jeda antar set', fmtClock(it.rest), 'rest', dayId, idx)}
      </div>
      <div class="q"><div class="q-t">RIR target</div><div class="seg5">${[0, 1, 2, 3, 4].map((v) => `<button class="seg-b ${it.rir === v ? 'sel' : ''}" data-act="it-rir" data-day="${dayId}" data-i="${idx}" data-v="${v}">${v}</button>`).join('')}</div></div>
      <div class="q"><div class="q-t">Otot yang dihitung</div><div class="chips-row wrap">${ex.muscles.map((m) => `<span class="chip">${MUSCLE_NAMES[m.muscleId] || m.muscleId} · ${num(m.weight)}</span>`).join('') || '<span class="muted-s">-</span>'}</div></div>
      <button class="btn-ghost" data-act="nav" data-to="#/ex/${encodeURIComponent(ex.id)}">Lihat gambar gerakan</button>
      <div class="grow"></div>
      <button class="btn-primary" data-act="back">Selesai</button>
      <button class="btn-link danger" data-act="item-del" data-day="${dayId}" data-i="${idx}">Hapus gerakan dari hari ini</button>
    </section>`,
  };
}

// ---------------------------------------------------------------------------
// Pilih gerakan
// ---------------------------------------------------------------------------

let pk = null;
const pkInit = () => {
  pk = { sel: new Set(), q: '', group: 'all', equip: null, custom: false };
};

function pickItems() {
  const q = pk.q.trim().toLowerCase();
  const grp = GROUPS.find((g) => g.id === pk.group);
  return allExercises()
    .filter((e) => !q || q.split(/\s+/).every((t) => hay(e).includes(t)))
    .filter((e) => !grp || e.muscles.some((m) => grp.muscles.includes(m.muscleId) && m.weight >= 1))
    .filter((e) => !pk.equip || e.equip === pk.equip)
    .sort((a, b) => Number(!!b.core) - Number(!!a.core) || a.name.localeCompare(b.name));
}

const hay = (e) =>
  `${e.name} ${e.equip} ${e.muscles.map((m) => MUSCLE_NAMES[m.muscleId] || '').join(' ')}`.toLowerCase();

function thumb(e, cls = '') {
  const u = imgUrl(e, 0);
  return u ? `<img class="${cls}" src="${u}" crossorigin="anonymous" loading="lazy" decoding="async" alt="" onerror="this.remove()">` : '';
}

function pickList() {
  const items = pickItems();
  if (!items.length) return '<div class="empty small">Tidak ada gerakan yang cocok.</div>';
  return (
    `<div class="muted-s pk-count">${items.length} gerakan${pk.q || pk.group !== 'all' || pk.equip ? ' cocok' : ''}</div>` +
    items
      .map((e) => {
        const lp = lastPerf(e.id);
        const sel = pk.sel.has(e.id);
        const sub = e.muscles.map((m) => MUSCLE_NAMES[m.muscleId] || m.muscleId).join(', ');
        return `<div class="pkrow"><button class="pk ${sel ? 'sel' : ''}" data-act="pk-toggle" data-id="${esc(e.id)}">
        <span class="pk-ic">${esc((e.equip || '??').slice(0, 2).toUpperCase())}${thumb(e)}</span>
        <span class="pk-t"><b>${esc(e.name)}</b><span class="muted-s">${esc(e.equip)} · ${esc(sub)}${lp ? ` · terakhir ${num(lp.load)} kg × ${lp.reps}` : ''}</span></span>
        <span class="pk-c">${sel ? '✓' : ''}</span></button>
        <button class="pk-i" data-act="nav" data-to="#/ex/${encodeURIComponent(e.id)}" aria-label="Lihat gerakan ${esc(e.name)}">i</button></div>`;
      })
      .join('')
  );
}

export function pickView(mode) {
  if (!pk) pkInit();
  const target = mode.startsWith('day:') ? state.program.days.find((d) => d.id === mode.slice(4)) : null;
  const sub = mode === 'session' ? 'Tambah ke sesi berjalan' : `Tambah ke ${target ? esc(target.name) : 'program'}`;
  return {
    nav: null,
    html: `<section class="page pick">
      ${bar('Pilih gerakan', sub)}
      <label class="search"><span class="s-ic">${icon('search', 20)}</span><input id="pkq" type="text" inputmode="search" placeholder="Cari: row, pulldown, dumbel…" value="${esc(pk.q)}" data-in="pk-q"></label>
      <div class="chips-row scroll">
        <button class="chip-b ${pk.group === 'all' ? 'sel acc' : ''}" data-act="pk-group" data-v="all">Semua</button>
        ${GROUPS.map((g) => `<button class="chip-b ${pk.group === g.id ? 'sel acc' : ''}" data-act="pk-group" data-v="${g.id}">${g.label}</button>`).join('')}
      </div>
      <div class="chips-row scroll">
        ${EQUIPMENT.map((e) => `<button class="chip-b sm ${pk.equip === e ? 'sel' : ''}" data-act="pk-equip" data-v="${e}">${e}</button>`).join('')}
      </div>
      <div class="plist" id="plist">${pickList()}</div>
      ${
        pk.custom
          ? `<div class="card"><label class="field"><span class="k">Nama gerakan</span><input id="cname" type="text" placeholder="Contoh: Smith Machine Press"></label>
             <div class="row-g"><select id="cmuscle">${Object.entries(MUSCLE_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
             <select id="cequip">${EQUIPMENT.map((e) => `<option>${e}</option>`).join('')}</select></div>
             <button class="btn-sm wide" data-act="pk-csave">Simpan gerakan</button></div>`
          : `<button class="btn-ghost dashed" data-act="pk-custom">+ Buat gerakan kustom</button>`
      }
      <button class="btn-primary" id="pkadd" data-act="pk-add" data-mode="${esc(mode)}" ${pk.sel.size ? '' : 'disabled'}>${pk.sel.size ? `Tambah ${pk.sel.size} gerakan` : 'Pilih gerakan'}</button>
    </section>`,
  };
}

const LEVEL = { beginner: 'Pemula', intermediate: 'Menengah', expert: 'Lanjut' };

export function exDetailView(id) {
  const ex = getExercise(id);
  const lp = lastPerf(ex.id);
  const a = imgUrl(ex, 0);
  const b = imgUrl(ex, 1);
  const fig = (u, cap) => `<figure><div class="ph"><img src="${u}" crossorigin="anonymous" alt="${cap} ${esc(ex.name)}" onerror="this.closest('figure').classList.add('broken')"></div><figcaption>${cap}</figcaption></figure>`;
  return {
    nav: null,
    html: `<section class="page">
      ${bar(esc(ex.name), esc(ex.equip || 'Gerakan'))}
      ${a ? `<div class="imgs">${fig(a, 'Posisi awal')}${fig(b, 'Posisi akhir')}</div>` : '<div class="card muted-s">Gerakan kustom belum punya gambar.</div>'}
      <div class="q"><div class="q-t">Otot yang dihitung</div><div class="chips-row wrap">${ex.muscles.map((m) => `<span class="chip">${MUSCLE_NAMES[m.muscleId] || m.muscleId} · ${m.weight >= 1 ? 'utama' : 'bantu'}</span>`).join('') || '<span class="muted-s">-</span>'}</div></div>
      <div class="infocard"><div><div class="k">Tipe</div><div>${ex.compound ? 'Compound' : 'Isolasi'}${ex.level ? ' · ' + (LEVEL[ex.level] || ex.level) : ''}</div></div>
        <div class="r"><div class="k">Terakhir</div><div>${lp ? `${num(lp.load)} kg × ${lp.reps}` : 'belum pernah'}</div></div></div>
      ${a ? '<p class="tiny">Gambar: Free Exercise DB (domain publik).</p>' : ''}
    </section>`,
  };
}

// ---------------------------------------------------------------------------
// Riwayat
// ---------------------------------------------------------------------------

let histTab = 'sesi';

function weekLabel(date, today) {
  const ws = weekStart(date);
  const cur = weekStart(today);
  if (ws === cur) return 'Minggu ini';
  if (ws === addDaysStr(cur, -7)) return 'Minggu lalu';
  return 'Minggu ' + dayShort(ws);
}

export function historyView() {
  const today = localDate();
  const list = sessionsDesc();
  let body = '';
  if (histTab === 'sesi') {
    if (!list.length) body = `<div class="empty"><h2>Halaman log masih kosong</h2><p>Setiap sesi yang disimpan masuk ke sini, dikelompokkan per minggu.</p></div>`;
    else {
      const wk = state.sessions.filter((s) => s.date >= weekStart(today));
      const sets = wk.reduce((t, s) => t + sessionStats(s).workSets, 0);
      const vol = wk.reduce((t, s) => t + sessionStats(s).volume, 0);
      body = `<div class="stats3"><div class="stat"><div class="k">Minggu ini</div><div class="v">${wk.length} sesi</div></div>
        <div class="stat"><div class="k">Set kerja</div><div class="v">${sets}</div></div>
        <div class="stat"><div class="k">Volume</div><div class="v">${num(vol / 1000)} t</div></div></div>`;
      const kc = wk.map(estimateKcal).filter(Boolean);
      if (kc.length) body += `<div class="tiny">Perkiraan kalori minggu ini: <span class="num">${fmtKcal({ lo: kc.reduce((t, k) => t + k.lo, 0), hi: kc.reduce((t, k) => t + k.hi, 0) })}</span> kkal</div>`;
      else if (!state.settings.bodyWeightKg) body += `<button class="btn-link inline" data-act="nav" data-to="#/settings">Isi berat badan untuk perkiraan kalori</button>`;
      let last = '';
      for (const s of list) {
        const lbl = weekLabel(s.date, today);
        if (lbl !== last) {
          body += `<div class="sec">${lbl}</div>`;
          last = lbl;
        }
        const st = sessionStats(s);
        const prs = sessionPRs(s);
        body += `<button class="card tap" data-act="nav" data-to="#/ses/${s.id}"><div class="card-h"><b>${esc(s.name)}</b><span class="muted-s">${dayShort(s.date)}</span></div>
          <div class="muted-s num">${fmtDurationMin(s.durationMin)} · ${st.workSets} set · ${fmtThousands(st.volume)} kg</div>
          ${prs.length ? `<div class="chips-row"><span class="pr">PR ${esc(getExercise(prs[0].exId).name)} ${num(prs[0].set.load)}×${prs[0].set.reps}${prs.length > 1 ? ` +${prs.length - 1}` : ''}</span></div>` : ''}</button>`;
      }
    }
  } else {
    const ids = [...new Set(state.sessions.flatMap((s) => s.sets.map((t) => t.exId)))];
    if (!ids.length) body = `<div class="empty"><h2>Belum ada gerakan tercatat</h2><p>Grafik kekuatan tiap gerakan muncul setelah sesi pertama.</p></div>`;
    else {
      body = ids
        .map((id) => {
          const rows = state.sessions
            .map((s) => ({ s, best: Math.max(0, ...s.sets.filter((t) => t.exId === id && t.type === 'working').map((t) => e1rmOf(t) ?? 0)) }))
            .filter((r) => r.best > 0);
          const best = rows.length ? Math.max(...rows.map((r) => r.best)) : null;
          return { id, n: state.sessions.filter((s) => s.sets.some((t) => t.exId === id)).length, best };
        })
        .sort((a, b) => b.n - a.n)
        .map((r) => `<button class="card tap" data-act="nav" data-to="#/hist-ex/${esc(r.id)}"><div class="card-h"><b>${esc(getExercise(r.id).name)}</b><span class="muted-s">${r.n} sesi ›</span></div>
          <div class="muted-s">${r.best ? `e1RM terbaik ${num(r.best)} kg` : 'e1RM belum dapat dihitung'}</div></button>`)
        .join('');
    }
  }
  return {
    nav: 'history',
    html: `<section class="page">${bar('Riwayat', '', false)}
      <div class="tabs"><button class="tab ${histTab === 'sesi' ? 'on' : ''}" data-act="hist-tab" data-v="sesi">Sesi</button>
      <button class="tab ${histTab === 'latihan' ? 'on' : ''}" data-act="hist-tab" data-v="latihan">Per latihan</button></div>
      ${body}</section>`,
  };
}

export function histExView(exId) {
  const ex = getExercise(exId);
  const rows = sessionsDesc()
    .map((s) => {
      const w = s.sets.filter((t) => t.exId === exId && t.type === 'working');
      if (!w.length) return null;
      const top = w.reduce((a, b) => ((e1rmOf(b) ?? 0) > (e1rmOf(a) ?? 0) ? b : a));
      return { s, w, top, e: e1rmOf(top) };
    })
    .filter(Boolean);
  const series = [...rows].reverse().map((r) => r.e).filter((e) => e !== null);
  return {
    nav: null,
    html: `<section class="page">${bar(esc(ex.name), 'Riwayat gerakan')}
      ${series.length >= 2 ? `<div class="card"><div class="card-h"><span class="k">e1RM terbaik per sesi</span><span class="muted-s">${num(series[0])} → ${num(series[series.length - 1])} kg</span></div>${spark(series)}</div>` : '<div class="card muted-s">Grafik muncul setelah 2 sesi atau lebih.</div>'}
      ${rows.map((r) => `<button class="card tap" data-act="nav" data-to="#/ses/${r.s.id}"><div class="card-h"><b>${dayShort(r.s.date)}</b><span class="muted-s">${r.w.length} set</span></div>
        ${setTable(r.w, { tut: false })}</button>`).join('')}
    </section>`,
  };
}

export function summaryView(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return { nav: 'history', html: `<section class="page">${bar('Sesi tidak ditemukan')}</section>` };
  const st = sessionStats(s);
  const prs = sessionPRs(s);
  const an = analyzeAt(s.date);
  const sys = an.snapshot.systemic.score;
  const lv = level(sys);
  const top = [...an.snapshot.muscles].sort((a, b) => b.fatigue - a.fatigue).slice(0, 2);
  const byEx = [];
  for (const t of s.sets) {
    let g = byEx.find((x) => x.exId === t.exId);
    if (!g) byEx.push((g = { exId: t.exId, sets: [] }));
    g.sets.push(t);
  }
  return {
    nav: null,
    html: `<section class="page">
      ${bar(esc(s.name), `${dayLong(s.date)} · sesi selesai`)}
      <div class="stats3"><div class="stat"><div class="k">Durasi</div><div class="v">${fmtDurationMin(s.durationMin)}</div></div>
        <div class="stat"><div class="k">Set kerja</div><div class="v">${st.workSets}</div></div>
        <div class="stat"><div class="k">Volume (kg)</div><div class="v">${fmtThousands(st.volume)}</div></div></div>
      ${prs.map((p) => `<div class="banner good">${icon('trophy', 22)}<div><b>PR baru</b> · ${esc(getExercise(p.exId).name)} ${num(p.set.load)} kg × ${p.set.reps}</div></div>`).join('')}
      <div class="stats3 two"><div class="stat"><div class="k">Waktu per set</div><div class="v work">${st.avgTut != null ? fmtClock(st.avgTut) : '-'}</div></div>
        <div class="stat"><div class="k">Jeda rata-rata</div><div class="v rest">${st.avgRest != null ? fmtClock(st.avgRest) : '-'}</div></div>
        <div class="stat"><div class="k">Kalori (kkal)</div><div class="v">${estimateKcal(s) ? fmtKcal(estimateKcal(s)) : '–'}</div></div></div>
      ${estimateKcal(s) ? '<div class="tiny">Kalori hanya perkiraan kasar dari berat badan, durasi, dan RPE sesi (bisa meleset 30–50%).</div>' : '<button class="btn-link inline" data-act="nav" data-to="#/settings">Isi berat badan untuk perkiraan kalori</button>'}
      ${byEx.map((g) => `<div class="card"><div class="card-h"><b>${esc(getExercise(g.exId).name)}</b><span class="muted-s">${g.sets.length} set · ${fmtThousands(g.sets.reduce((a, t) => a + t.load * t.reps, 0))} kg</span></div>
        ${setTable(g.sets, { editSid: s.id })}</div>`).join('')}
      ${st.unconfirmed ? `<div class="tiny">Baris redup: ${st.unconfirmed} set belum dikonfirmasi, RIR-nya tidak dihitung.</div>` : ''}
      <div class="card row-card"><div><div class="k">Fatigue hari itu</div><div class="big ${lv.cls}">${Math.round(sys)} <span class="muted-s">${lv.label}${top.length ? ' · ' + top.map((m) => `${MUSCLE_NAMES[m.muscleId] || m.muscleId} ${Math.round(m.fatigue)}`).join(' · ') : ''}</span></div></div>
        <button class="btn-link" data-act="nav" data-to="#/fatigue">Mengapa?</button></div>
      ${s.rpe ? `<div class="muted-s">RPE sesi: ${s.rpe}</div>` : ''}
      <p class="tiny">Ketuk satu baris set untuk mengoreksi beban, reps, atau RIR.</p>
      <button class="btn-link danger" data-act="ses-del" data-id="${s.id}">${pendingSesDel === s.id ? 'Ketuk lagi untuk menghapus sesi ini' : 'Hapus sesi'}</button>
      ${histSheet(s)}
    </section>`,
  };
}
let pendingSesDel = null;

// Koreksi set pada sesi yang sudah tersimpan.
let hs = null;
let hsFresh = false;
const hsSet = () => {
  if (!hs) return null;
  const s = state.sessions.find((x) => x.id === hs.sid);
  const t = s && s.sets.find((x) => x.id === hs.id);
  return t ? { s, t } : null;
};
function histSheet(s) {
  const f = hsSet();
  if (!f || f.s.id !== s.id) return '';
  const { t } = f;
  const typeLbl = { working: 'Set kerja', warmup: 'Pemanasan', drop: 'Drop set' }[t.type];
  const rirSel = t.rir ?? t.targetRir ?? 2;
  const chips = [0, 1, 2, 3, 4, 5].map((v) => `<button class="chip-b ${t.rir != null && rirSel === v ? 'sel' : ''}" data-act="hs-rir" data-v="${v}">${v === 5 ? '5+' : v}</button>`).join('');
  const fresh = hsFresh ? ' fresh' : '';
  hsFresh = false;
  return `<div class="menu-bg${fresh}" data-act="hs-close"></div>
    <div class="menu${fresh}" role="dialog" aria-label="Koreksi set">
      <div class="grip"></div>
      <div class="sheet-h"><b>${esc(getExercise(t.exId).name)}</b>${t.tut != null ? `<span class="tutc">${fmtClock(t.tut)}</span>` : ''}</div>
      <div class="stp-pair sm" style="margin:10px 0">
        ${stepper('Beban (kg)', num(t.load), 'hs-load-', 'hs-load+', 'hs-load-set')}
        ${stepper('Reps', String(t.reps), 'hs-reps-', 'hs-reps+', 'hs-reps-set')}
      </div>
      <div class="muted-s" style="margin-bottom:6px">Sisa rep (RIR)</div>
      <div class="chips-row">${chips}</div>
      <div class="row-g" style="margin:10px 0"><button class="btn-sm wide" data-act="hs-type">${typeLbl} ▾</button><button class="btn-sm" data-act="hs-del">Hapus set</button></div>
      <button class="btn-primary" data-act="hs-close">Selesai</button>
    </div>`;
}
const hsChange = (fn) => {
  const f = hsSet();
  if (!f) return;
  fn(f.t);
  save();
  rerender();
};
const hsStep = (v, dir) => {
  const step = (dir > 0 ? v : v - 0.01) < 20 ? 1 : 2.5;
  return Math.max(0, Math.round((v + dir * step) * 2) / 2);
};
const hsNum = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// Fatigue & deload
// ---------------------------------------------------------------------------

let fatMuscle = null;

function deloadCard(an, today) {
  const dl = activeDeload();
  if (dl) {
    return `<div class="card"><div class="card-h"><b>Deload aktif</b><span class="muted-s">sampai ${dayShort(dl.endDate)}</span></div>
      <p class="muted-s">${dl.type === 'volume' ? 'Tipe volume: set −50%, beban tetap, RIR ≥ 3.' : 'Tipe intensitas: beban −12,5%, set −30%, RIR ≥ 2.'} Sesi yang dimulai dalam periode ini otomatis memakai rencana deload.</p>
      <button class="btn-sm wide" data-act="dl-end">Akhiri deload lebih awal</button></div>`;
  }
  const d = an.deload;
  const hidden = (state.deload.snoozeUntil && today <= state.deload.snoozeUntil) || (state.deload.hiddenUntil && today <= state.deload.hiddenUntil);
  const trig = d.triggers.map((t) => `<div class="trig ${t.triggered ? 'on' : ''}"><span class="tdot">${t.triggered ? '✓' : ''}</span><div><b>${esc(t.label)}</b><div class="muted-s">${esc(t.detail)}</div></div></div>`).join('');
  const rx = d.type === 'intensity' ? 'Beban −12,5% · set −30% · RIR ≥ 2' : 'Set −50% · beban tetap · RIR ≥ 3';
  const title = { ok: 'Tidak ada pemicu deload', watch: 'Waspada', deload: `Deload disarankan${d.durationDays ? ' · ' + d.durationDays + ' hari' : ''}` }[d.status];
  return `<div class="card"><div class="card-h"><b>${title}</b><span class="muted-s">${d.coreTriggerCount} dari 4 pemicu reaktif</span></div>
    <div class="trigs">${trig}</div>
    ${d.status === 'deload' ? `<div class="infocard one"><div><div class="k">Usulan · tipe ${d.type === 'intensity' ? 'intensitas' : 'volume'}</div><div>${rx}</div></div></div>
      ${hidden ? '<div class="muted-s">Peringatan ditunda atau diabaikan sementara.</div>' : ''}
      <div class="row-g"><button class="btn-primary flex" data-act="dl-accept">Mulai deload</button></div>
      <div class="row-g"><button class="btn-sm wide" data-act="dl-snooze" data-n="3">Tunda 3 hari</button><button class="btn-sm wide" data-act="dl-snooze" data-n="7">Tunda 1 minggu</button><button class="btn-sm wide" data-act="dl-ignore">Abaikan</button></div>`
      : `<p class="muted-s">${esc(d.message)}</p>`}
  </div>`;
}

export function fatigueView() {
  const today = localDate();
  if (!hasTrainingData()) {
    return {
      nav: 'fatigue',
      html: `<section class="page">${bar('Fatigue', '', false)}<div class="empty"><h2>Skor muncul setelah sesi pertama</h2><p>Dihitung per otot dari set yang dicatat dan check-in harian.</p>
        <div class="ghost-rows">${['Dada', 'Punggung', 'Paha depan', 'Bahu'].map((m) => `<div><span>${m}</span><i></i><b>–</b></div>`).join('')}</div></div></section>`,
    };
  }
  const an = analyzeAt(today);
  const snap = an.snapshot;
  const sys = snap.systemic.score;
  const lv = level(sys);
  const muscles = [...snap.muscles].sort((a, b) => b.fatigue - a.fatigue);
  const lowConf = muscles.length && muscles.every((m) => m.confidence === 'rendah');
  const sel = muscles.find((m) => m.muscleId === fatMuscle) || muscles[0];
  const segN = Math.min(5, Math.max(0, Math.ceil(sys / 20)));
  const hist = an.history.map((h) => h.score);
  return {
    nav: 'fatigue',
    html: `<section class="page">${bar('Fatigue', 'Perkiraan, bukan diagnosis', false)}
      <div class="card"><div class="fat-top"><div><div class="k">Fatigue sistemik</div><div class="score">${Math.round(sys)}</div></div><span class="lvl ${lv.cls}">${lv.label}</span></div>
        <div class="gauge">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < segN ? (i >= 3 ? 'warn' : 'on') : ''}"></i>`).join('')}</div>
        <div class="bar-scale"><span>0</span><span>70 ambang</span><span>100</span></div>
        ${lowConf ? '<p class="tiny">Riwayat masih di bawah 14 hari: skor memakai baseline default dan kepercayaannya rendah.</p>' : ''}</div>
      <div class="sec">Per otot</div>
      <div class="mus">${muscles.map((m) => {
        const l = level(m.fatigue);
        return `<button class="mrow ${sel && sel.muscleId === m.muscleId ? 'sel' : ''}" data-act="fat-muscle" data-v="${m.muscleId}"><span class="mn">${MUSCLE_NAMES[m.muscleId] || m.muscleId}</span>
          <span class="mbar"><i class="${l.cls}" style="width:${Math.min(100, m.fatigue)}%"></i></span><span class="mv">${Math.round(m.fatigue)}</span></button>`;
      }).join('')}</div>
      ${hist.length > 1 ? `<div class="card"><div class="card-h"><span class="k">Tren 7 hari</span><span class="muted-s">ambang 70</span></div>${spark(hist, { threshold: 70, min: 0, max: 100 })}</div>` : ''}
      ${sel ? `<div class="card"><b>Mengapa ${MUSCLE_NAMES[sel.muscleId] || sel.muscleId} ${Math.round(sel.fatigue)}?</b>
        <div class="why">${sel.explanation.components.map((c) => `<div class="li"><span>${esc(c.name)}</span><span class="v">${c.value}${c.contribution !== undefined ? ` <span class="muted">→ ${num(c.contribution, 1)}</span>` : ''}</span></div>`).join('')}</div>
        <p class="tiny">${esc(sel.explanation.caveats?.[0] || '')}</p></div>` : ''}
      <div class="sec">Deload</div>
      ${deloadCard(an, today)}
      <p class="tiny">Estimasi heuristik berdasarkan data Anda, bukan saran medis. Keputusan akhir ada di Anda.</p>
    </section>`,
  };
}

// ---------------------------------------------------------------------------
// Pengaturan
// ---------------------------------------------------------------------------

let confirmReset = null;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export function settingsView() {
  const s = state.settings;
  const sw = (k, label, hint) => `<div class="srow"><div><div>${label}</div><div class="muted-s">${hint}</div></div>
    <button class="tog ${s[k] ? 'on' : ''}" data-act="set-toggle" data-k="${k}" role="switch" aria-checked="${s[k]}" aria-label="${label}"><i></i></button></div>`;
  return {
    nav: null,
    html: `<section class="page">${bar('Pengaturan', 'Gym Hipertrofi')}
      ${isIos() && !isStandalone() ? `<div class="banner soft"><div><b>Pasang ke Layar Utama</b><div class="muted-s">Di Safari ketuk tombol Bagikan, lalu Tambah ke Layar Utama. Data lebih awet dan aplikasi jalan layar penuh.</div></div></div>` : ''}
      <div class="card tight">
        ${sw('sound', 'Bunyi saat jeda selesai', 'Mungkin dibisukan tombol senyap iPhone')}
        <div class="srow"><div><div>Volume bunyi</div><div class="muted-s">Untuk bunyi jeda selesai</div></div>
          <div class="seg3">${['pelan', 'sedang', 'keras'].map((v) => `<button class="${s.volume === v ? 'sel' : ''}" data-act="set-volume" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div>
        ${sw('countdown', 'Detak 3 detik terakhir', 'Tiga bunyi pendek sebelum jeda habis')}
        <div class="srow"><div><div>Tes bunyi</div><div class="muted-s">Coba dengan tombol senyap menyala dan mati</div></div><button class="btn-sm" data-act="sound-test">Putar</button></div>
        ${sw('wakeLock', 'Jaga layar tetap menyala saat sesi', 'Agar timer dan bunyi tetap berjalan')}
        <div class="srow"><div><div>Berat badan</div><div class="muted-s">Untuk perkiraan kalori (kg)</div></div>
          <input class="num-in" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="–" value="${s.bodyWeightKg ? num(s.bodyWeightKg) : ''}" data-change="set-weight" aria-label="Berat badan dalam kg"></div>
        <div class="srow"><div><div>Jadwal deload proaktif</div><div class="muted-s">Tiap berapa minggu (4–8)</div></div>
          <div class="stp-row"><button class="sb" data-act="set-interval" data-d="-1" aria-label="Kurangi">−</button><span class="stp-val sm">${s.deloadIntervalWeeks}</span><button class="sb" data-act="set-interval" data-d="1" aria-label="Tambah">+</button></div></div>
      </div>
      <div class="sec">Data</div>
      <div class="card">
        <p class="muted-s">Semua data tersimpan di perangkat ini. Buat cadangan berkala, karena Safari dapat menghapus data situs yang lama tidak dibuka.</p>
        <div class="row-g"><button class="btn-sm wide" data-act="data-export">Ekspor cadangan</button>
        <label class="btn-sm wide file">Impor cadangan<input type="file" accept="application/json,.json" data-change="data-import"></label></div>
        <div class="muted-s">${state.sessions.length} sesi · ${state.checkins.length} check-in tersimpan</div>
      </div>
      <div class="card">
        <button class="btn-link" data-act="reset-program">${confirmReset === 'program' ? 'Ketuk lagi: kembalikan program ke awal' : 'Kembalikan program ke bawaan'}</button>
        <button class="btn-link danger" data-act="reset-all">${confirmReset === 'all' ? 'Ketuk lagi: hapus SEMUA data' : 'Hapus semua data'}</button>
      </div>
      <p class="tiny">Estimasi fatigue dan deload adalah heuristik, bukan saran medis.</p>
    </section>`,
  };
}

// ---------------------------------------------------------------------------
// Aksi
// ---------------------------------------------------------------------------

const dayById = (id) => state.program.days.find((d) => d.id === id);

export function resetDrafts() {
  ci = null;
  pk = null;
  pendingDel = null;
  pendingSesDel = null;
  hs = null;
  confirmReset = null;
}

function stepItem(it, k, d) {
  if (k === 'sets') it.sets = Math.min(12, Math.max(1, it.sets + d));
  else if (k === 'repMin') it.repMin = Math.min(it.repMax, Math.max(1, it.repMin + d));
  else if (k === 'repMax') it.repMax = Math.min(40, Math.max(it.repMin, it.repMax + d));
  else if (k === 'rest') it.rest = Math.min(600, Math.max(15, it.rest + d * 15));
  else if (k === 'load') {
    const step = (d > 0 ? it.load : it.load - 0.01) < 20 ? 1 : 2.5;
    it.load = Math.max(0, Math.round((it.load + d * step) * 2) / 2);
  }
}

function newItemFor(exId) {
  const ex = getExercise(exId);
  const lp = lastPerf(exId);
  return {
    exId, sets: 3, repMin: ex.compound ? 6 : 10, repMax: ex.compound ? 10 : 15,
    load: lp ? lp.load : 20, rir: ex.compound ? 2 : 1, rest: ex.compound ? 120 : 90,
  };
}

onMany({
  'hs-edit': (el) => {
    hs = { sid: el.dataset.sid, id: el.dataset.id };
    hsFresh = true;
    rerender();
  },
  'hs-close': () => {
    hs = null;
    rerender();
  },
  'hs-load-': () => hsChange((t) => { t.load = hsStep(t.load, -1); }),
  'hs-load+': () => hsChange((t) => { t.load = hsStep(t.load, 1); }),
  'hs-reps-': () => hsChange((t) => { t.reps = Math.max(1, t.reps - 1); }),
  'hs-reps+': () => hsChange((t) => { t.reps += 1; }),
  'hs-load-set': (el) => hsChange((t) => {
    const n = hsNum(el.value);
    if (n !== null) t.load = Math.min(999, Math.max(0, Math.round(n * 10) / 10));
  }),
  'hs-reps-set': (el) => hsChange((t) => {
    const n = hsNum(el.value);
    if (n !== null) t.reps = Math.min(99, Math.max(1, Math.round(n)));
  }),
  'hs-rir': (el) => hsChange((t) => {
    t.rir = Number(el.dataset.v);
    t.confirmed = true;
  }),
  'hs-type': () => hsChange((t) => {
    const order = ['working', 'warmup', 'drop'];
    t.type = order[(order.indexOf(t.type) + 1) % order.length];
  }),
  'hs-del': () => {
    const f = hsSet();
    if (!f) return;
    f.s.sets = f.s.sets.filter((x) => x.id !== f.t.id);
    hs = null;
    if (!f.s.sets.length) {
      state.sessions = state.sessions.filter((x) => x.id !== f.s.id);
      save();
      navigate('#/history');
      return;
    }
    save();
    rerender();
    toast('Set dihapus');
  },
  'setup-pick': (el) => {
    state.program = programFromTemplate(el.dataset.id);
    state.lastDayId = null;
    state.setupDone = true;
    state.setupHint = true;
    save();
    navigate('#/program');
  },
  'setup-skip': () => {
    state.setupDone = true;
    state.setupHint = false;
    save();
    navigate('#/today');
  },
  'setup-done': () => {
    state.setupHint = false;
    save();
    navigate('#/today');
  },
  'item-rm': (el) => {
    const d = dayById(el.dataset.day);
    const i = Number(el.dataset.i);
    if (!d || !d.items[i]) return;
    const [removed] = d.items.splice(i, 1);
    save();
    rerender();
    toast(`${getExercise(removed.exId).name} dihapus`, {
      label: 'Urungkan',
      fn: () => {
        d.items.splice(i, 0, removed);
        save();
        rerender();
      },
    });
  },
  'set-volume': (el) => {
    state.settings.volume = el.dataset.v;
    save();
    rerender();
    testBeep();
  },
  'sound-test': () => testBeep(),
  'go-today': () => navigate('#/today'),
  'ses-begin': (el) => startSession(el.dataset.day),
  'ci-set': (el) => {
    ci[el.dataset.k] = Number(el.dataset.v);
    rerender();
  },
  'ci-joint': (el) => {
    const j = el.dataset.v;
    ci.joints = ci.joints.includes(j) ? ci.joints.filter((x) => x !== j) : [...ci.joints, j];
    rerender();
  },
  'ci-save': () => {
    const today = localDate();
    const rec = { date: today, sleep: ci.sleep, soreness: ci.soreness, jointPain: ci.jointPain, motivation: ci.motivation, joints: ci.jointPain <= 3 ? ci.joints : [] };
    const i = state.checkins.findIndex((c) => c.date === today);
    if (i >= 0) state.checkins[i] = rec;
    else state.checkins.push(rec);
    ci = null;
    save();
    toast('Check-in tersimpan');
    navigate('#/today');
  },
  'ci-skip': () => {
    ci = null;
    navigate('#/today');
  },
  'day-add': () => {
    const id = 'd' + uid();
    state.program.days.push({ id, name: `Hari ${state.program.days.length + 1}`, items: [] });
    save();
    navigate('#/day/' + id);
  },
  'day-name': (el) => {
    const d = dayById(el.dataset.day);
    if (d) {
      d.name = el.value.trim() || 'Tanpa nama';
      save();
    }
  },
  'day-del': (el) => {
    if (pendingDel !== el.dataset.day) {
      pendingDel = el.dataset.day;
      rerender();
      return;
    }
    state.program.days = state.program.days.filter((d) => d.id !== el.dataset.day);
    pendingDel = null;
    save();
    navigate('#/program');
  },
  'item-move': (el) => {
    const d = dayById(el.dataset.day);
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.d);
    if (!d || j < 0 || j >= d.items.length) return;
    [d.items[i], d.items[j]] = [d.items[j], d.items[i]];
    save();
    rerender();
  },
  'item-del': (el) => {
    const d = dayById(el.dataset.day);
    if (d) d.items.splice(Number(el.dataset.i), 1);
    save();
    history.back();
  },
  'it-step': (el) => {
    const d = dayById(el.dataset.day);
    const it = d?.items[Number(el.dataset.i)];
    if (!it) return;
    stepItem(it, el.dataset.k, Number(el.dataset.d));
    save();
    rerender();
  },
  'it-rir': (el) => {
    const it = dayById(el.dataset.day)?.items[Number(el.dataset.i)];
    if (!it) return;
    it.rir = Number(el.dataset.v);
    save();
    rerender();
  },
  'pk-q': (el) => {
    pk.q = el.value;
    document.getElementById('plist').innerHTML = pickList();
  },
  'pk-group': (el) => {
    pk.group = el.dataset.v;
    rerender();
  },
  'pk-equip': (el) => {
    pk.equip = pk.equip === el.dataset.v ? null : el.dataset.v;
    rerender();
  },
  'pk-toggle': (el) => {
    const id = el.dataset.id;
    pk.sel.has(id) ? pk.sel.delete(id) : pk.sel.add(id);
    document.getElementById('plist').innerHTML = pickList();
    const b = document.getElementById('pkadd');
    b.disabled = !pk.sel.size;
    b.textContent = pk.sel.size ? `Tambah ${pk.sel.size} gerakan` : 'Pilih gerakan';
  },
  'pk-custom': () => {
    pk.custom = true;
    rerender();
  },
  'pk-csave': () => {
    const name = document.getElementById('cname').value.trim();
    if (!name) return toast('Isi nama gerakan dulu');
    const id = 'c' + uid();
    state.customExercises.push({
      id, name, equip: document.getElementById('cequip').value,
      muscles: [{ muscleId: document.getElementById('cmuscle').value, weight: 1 }], compound: false, main: false,
    });
    pk.sel.add(id);
    pk.custom = false;
    save();
    rerender();
  },
  'pk-add': (el) => {
    const mode = el.dataset.mode;
    const ids = [...pk.sel];
    if (!ids.length) return;
    if (mode === 'session') {
      ids.forEach(addToActive);
      pk = null;
      navigate('#/session');
    } else {
      const d = dayById(mode.slice(4));
      if (d) ids.forEach((id) => d.items.push(newItemFor(id)));
      pk = null;
      save();
      navigate('#/day/' + mode.slice(4));
    }
  },
  'hist-tab': (el) => {
    histTab = el.dataset.v;
    rerender();
  },
  'ses-del': (el) => {
    if (pendingSesDel !== el.dataset.id) {
      pendingSesDel = el.dataset.id;
      rerender();
      return;
    }
    state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id);
    pendingSesDel = null;
    save();
    navigate('#/history');
  },
  'fat-muscle': (el) => {
    fatMuscle = el.dataset.v;
    rerender();
  },
  'dl-accept': () => {
    const today = localDate();
    const d = analyzeAt(today).deload;
    if (d.status !== 'deload') return;
    state.deload.active = { type: d.type, startDate: today, endDate: addDaysStr(today, (d.durationDays || 7) - 1) };
    state.deload.lastDeloadDate = today;
    state.deload.snoozeUntil = null;
    state.deload.hiddenUntil = null;
    save();
    toast('Deload dimulai. Sesi berikutnya memakai rencana ringan.');
    rerender();
  },
  'dl-snooze': (el) => {
    state.deload.snoozeUntil = addDaysStr(localDate(), Number(el.dataset.n));
    save();
    toast(`Ditunda ${el.dataset.n} hari`);
    navigate('#/today');
  },
  'dl-ignore': () => {
    state.deload.hiddenUntil = addDaysStr(localDate(), 7);
    save();
    toast('Peringatan disembunyikan 7 hari');
    navigate('#/today');
  },
  'dl-end': () => {
    state.deload.active = null;
    save();
    rerender();
  },
  'set-toggle': (el) => {
    state.settings[el.dataset.k] = !state.settings[el.dataset.k];
    save();
    rerender();
  },
  'set-weight': (el) => {
    const n = parseFloat(String(el.value).replace(',', '.'));
    state.settings.bodyWeightKg = Number.isFinite(n) && n >= 25 && n <= 300 ? Math.round(n * 10) / 10 : null;
    save();
    if (el.value && !state.settings.bodyWeightKg) toast('Isi berat badan antara 25 dan 300 kg');
    rerender();
  },
  'set-interval': (el) => {
    state.settings.deloadIntervalWeeks = Math.min(8, Math.max(4, state.settings.deloadIntervalWeeks + Number(el.dataset.d)));
    save();
    rerender();
  },
  'data-export': async () => {
    const text = exportJson();
    const name = `gym-hipertrofi-${localDate()}.json`;
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Cadangan Gym Hipertrofi' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  },
  'data-import': async (el) => {
    const f = el.files?.[0];
    if (!f) return;
    try {
      await importJson(await f.text());
      toast('Cadangan dipulihkan');
      navigate('#/today');
    } catch (e) {
      toast(e.message || 'Gagal mengimpor berkas');
    }
  },
  'reset-program': () => {
    if (confirmReset !== 'program') {
      confirmReset = 'program';
      rerender();
      return;
    }
    state.program = defaultProgram();
    state.lastDayId = null;
    confirmReset = null;
    save();
    toast('Program dikembalikan');
    rerender();
  },
  'reset-all': async () => {
    if (confirmReset !== 'all') {
      confirmReset = 'all';
      rerender();
      return;
    }
    replaceState(defaults());
    confirmReset = null;
    await flush();
    toast('Semua data dihapus');
    navigate('#/today');
  },
});
