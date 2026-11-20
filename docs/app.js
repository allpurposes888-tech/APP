// Titik masuk: muat data, daftarkan service worker, router berbasis hash, navigasi bawah.
import { load, state } from './store.js';
import { setRenderer, rerender, navigate, onMany, root, icon } from './ui.js';
import { sessionView, tick, startSession } from './session.js';
import {
  todayView, checkinView, programView, dayView, itemView, pickView, historyView, histExView, summaryView,
  fatigueView, settingsView, startView, setupView, exDetailView, resetDrafts,
} from './views.js';

// iOS Safari hanya menampilkan gaya :active bila ada pendengar sentuhan di dokumen.
document.addEventListener('touchstart', () => {}, { passive: true });

function parse() {
  const h = location.hash.replace(/^#\/?/, '') || 'today';
  const [name, ...p] = h.split('/');
  return { name, p };
}

function view() {
  const { name, p } = parse();
  switch (name) {
    case 'today': return todayView();
    case 'checkin': return checkinView();
    case 'program': return programView();
    case 'day': return dayView(p[0]);
    case 'item': return itemView(p[0], p[1]);
    case 'pick': return pickView(decodeURIComponent(p[0] || 'session'));
    case 'history': return historyView();
    case 'hist-ex': return histExView(decodeURIComponent(p[0]));
    case 'ses': return summaryView(p[0]);
    case 'session': return sessionView();
    case 'fatigue': return fatigueView();
    case 'settings': return settingsView();
    case 'start': return startView();
    case 'setup': return setupView();
    case 'ex': return exDetailView(decodeURIComponent(p[0]));
    default: return todayView();
  }
}

function navHtml(active) {
  const item = (k, ic, label) =>
    `<button class="nv ${active === k ? 'on' : ''}" data-act="nav" data-to="#/${k}" ${active === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`;
  return `<nav class="nav" aria-label="Navigasi utama">
    ${item('today', 'home', 'Hari ini')}
    ${item('program', 'list', 'Program')}
    <button class="nv center ${active === 'latih' ? 'on' : ''}" data-act="nav-latih" aria-label="Latih"><span class="orb">${icon('play', 18)}</span><span>Latih</span></button>
    ${item('history', 'clock', 'Riwayat')}
    ${item('fatigue', 'pulse', 'Fatigue')}
  </nav>`;
}

let lastName = null;
let lastHash = null;
let lastKey = null;

/** Kunci "layar" untuk animasi masuk: berubah saat rute atau fase sesi berganti, bukan saat angka diubah. */
function screenKey() {
  const a = state.active;
  const sess = location.hash.startsWith('#/session') && a ? `:${a.phase}:${a.finishing ? 'f' : ''}${a.sheetSet ? 's' : ''}` : '';
  return location.hash + sess;
}

function render() {
  try {
    const { name } = parse();
    if (name !== lastName) {
      resetDrafts();
      lastName = name;
    }
    const sameRoute = location.hash === lastHash;
    const prev = document.getElementById('screen');
    const keep = sameRoute && prev ? prev.scrollTop : 0;
    const v = view();
    const key = screenKey();
    const enter = key !== lastKey;
    lastKey = key;
    root.innerHTML = `<main class="screen ${v.nav ? '' : 'nonav'} ${enter ? 'enter' : ''}" id="screen">${v.html}</main>${v.nav ? navHtml(v.nav) : ''}`;
    document.getElementById('screen').scrollTop = keep;
    lastHash = location.hash;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<main class="screen"><section class="page"><div class="empty"><h2>Terjadi kesalahan</h2><p>${String(e.message || e)}</p>
      <button class="btn-primary" data-act="nav" data-to="#/today">Ke Hari Ini</button></div></section></main>`;
  }
}

onMany({
  nav: (el) => navigate(el.dataset.to),
  back: () => {
    if (history.length > 1) history.back();
    else navigate('#/today');
  },
  'nav-latih': () => {
    if (state.active) navigate('#/session');
    else navigate('#/start');
  },
});

async function boot() {
  await load();
  setRenderer(render);
  addEventListener('hashchange', render);
  const atHome = !location.hash || location.hash === '#/today';
  if (state.active && atHome) location.hash = '#/session';
  else if (!state.setupDone && atHome) location.hash = '#/setup';
  render();
  setInterval(tick, 250);
  try {
    navigator.storage?.persist?.();
  } catch {
    /* abaikan */
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
