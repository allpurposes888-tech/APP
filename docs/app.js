// Titik masuk: muat data, daftarkan service worker, router berbasis hash, navigasi bawah.
import { load, state } from './store.js';
import { setRenderer, rerender, navigate, onMany, root, icon } from './ui.js';
import { sessionView, tick, startSession } from './session.js';
import {
  todayView, checkinView, programView, dayView, itemView, pickView, historyView, histExView, summaryView,
  fatigueView, settingsView, resetDrafts, nextDay,
} from './views.js';

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
    default: return todayView();
  }
}

function navHtml(active) {
  const item = (k, ic, label) =>
    `<button class="nv ${active === k ? 'on' : ''}" data-act="nav" data-to="#/${k}" ${active === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`;
  return `<nav class="nav" aria-label="Navigasi utama">
    ${item('today', 'home', 'Hari Ini')}
    ${item('program', 'list', 'Program')}
    <button class="nv center" data-act="nav-latih" aria-label="Latih"><span class="orb">${icon('play', 22)}</span><span>Latih</span></button>
    ${item('history', 'clock', 'Riwayat')}
    ${item('fatigue', 'pulse', 'Fatigue')}
  </nav>`;
}

let lastName = null;
let lastHash = null;

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
    root.innerHTML = `<main class="screen ${v.nav ? '' : 'nonav'}" id="screen">${v.html}</main>${v.nav ? navHtml(v.nav) : ''}`;
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
    else navigate('#/today');
  },
});

async function boot() {
  await load();
  setRenderer(render);
  addEventListener('hashchange', render);
  if (state.active && (!location.hash || location.hash === '#/today')) location.hash = '#/session';
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
