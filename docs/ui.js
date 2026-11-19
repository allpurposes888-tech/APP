// Mesin UI minimal: delegasi klik/input berbasis atribut data-*, tanpa framework.

export const root = document.getElementById('app');

const handlers = {};
export const on = (name, fn) => {
  handlers[name] = fn;
};
export const onMany = (obj) => Object.assign(handlers, obj);

let renderer = () => {};
export const setRenderer = (fn) => {
  renderer = fn;
};
export const rerender = () => renderer();

export function navigate(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = handlers[el.dataset.act];
  if (fn) fn(el, e);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-in]');
  if (!el) return;
  const fn = handlers[el.dataset.in];
  if (fn) fn(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = handlers[el.dataset.change];
  if (fn) fn(el, e);
});

/** Ikon SVG garis (stroke), konsisten dengan prototipe. */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M6 4h12v4a6 6 0 0 1-12 0zM6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};

export function icon(name, size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
