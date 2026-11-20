// Fungsi bantu umum: tanggal lokal, format angka/waktu, escape HTML.

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const pad = (n) => String(n).padStart(2, '0');

/** Tanggal lokal YYYY-MM-DD (bukan UTC). */
export function localDate(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysStr(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d.getTime());
}

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function dayShort(s) {
  const d = parseDate(s);
  return `${HARI[d.getDay()]} ${d.getDate()} ${BULAN[d.getMonth()]}`;
}

export function dayLong(s) {
  const d = parseDate(s);
  return `${HARI_PANJANG[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
}

/** Senin sebagai awal minggu. */
export function weekStart(s) {
  const d = parseDate(s);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return localDate(d.getTime());
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Angka dengan koma desimal. 72.5 -> "72,5"; 80 -> "80". */
export function num(x, digits = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '-';
  const f = 10 ** digits;
  return String(Math.round(x * f) / f).replace('.', ',');
}

export function fmtThousands(x) {
  return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** detik -> m:ss (atau h:mm:ss bila >= 1 jam) */
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** detik -> mm:ss dengan nol di depan (stopwatch set) */
export function fmtStop(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

export function fmtDurationMin(min) {
  min = Math.round(min);
  if (min < 60) return `${min} mnt`;
  return `${Math.floor(min / 60)}j ${pad(min % 60)}m`;
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Tabel set ala buku log (ringkasan sesi, akhir sesi, riwayat gerakan). */
export function setTable(sets, { tut = true, editSid = null } = {}) {
  let w = 0;
  const rows = sets
    .map((t) => {
      const lbl = t.type === 'working' ? String(++w) : t.type === 'warmup' ? 'P' : 'D';
      const rir = t.rir != null ? (t.rir >= 5 ? '5+' : t.rir) : '–';
      return `<tr class="${t.confirmed ? 'done' : 'unc'} ${t.type === 'working' ? '' : 'wu'}${editSid ? ' tap' : ''}"${editSid ? ` data-act="hs-edit" data-sid="${editSid}" data-id="${t.id}"` : ''}><td>${lbl}</td><td>${num(t.load)}</td><td>${t.reps}</td><td>${rir}</td>${tut ? `<td class="prev">${t.tut != null ? fmtClock(t.tut) : '–'}</td>` : ''}</tr>`;
    })
    .join('');
  return `<table class="log compact"><thead><tr><th>Set</th><th>Kg</th><th>Reps</th><th>RIR</th>${tut ? '<th>Waktu</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}
