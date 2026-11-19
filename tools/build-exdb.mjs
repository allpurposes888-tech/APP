// Membuat docs/exdb.js dari Free Exercise DB (https://github.com/yuhonas/free-exercise-db, lisensi Unlicense).
// Pemakaian: node tools/build-exdb.mjs <jalur ke exercises.json>
// File exercises.json bisa diunduh dari: https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
// Hanya metadata ringkas yang disimpan. Foto dimuat langsung dari CDN saat dilihat, tidak disimpan di repositori.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Beri jalur exercises.json sebagai argumen.');
  process.exit(1);
}
const data = JSON.parse(readFileSync(src, 'utf8'));

const OK_CATEGORY = ['strength', 'powerlifting'];
const EQUIP = { barbell: 'Barbel', dumbbell: 'Dumbel', machine: 'Mesin', cable: 'Kabel', 'body only': 'Bodyweight', 'e-z curl bar': 'Barbel' };
const MUSCLE = {
  chest: 'dada', lats: 'punggung', 'middle back': 'punggung', 'lower back': 'punggung', traps: 'punggung',
  shoulders: 'bahu', biceps: 'bisep', triceps: 'trisep', quadriceps: 'quad', hamstrings: 'hamstring',
  glutes: 'glute', calves: 'betis', abdominals: 'core', forearms: 'forearm', adductors: 'adduktor', abductors: 'abduktor',
};

const rows = [];
for (const e of data) {
  if (!OK_CATEGORY.includes(e.category) || !(e.equipment in EQUIP) || e.images?.length < 2) continue;
  const w = new Map();
  for (const m of e.primaryMuscles) if (MUSCLE[m]) w.set(MUSCLE[m], 1);
  if (!w.size) continue;
  for (const m of e.secondaryMuscles) if (MUSCLE[m] && !w.has(MUSCLE[m])) w.set(MUSCLE[m], 0.5);
  rows.push([e.id, e.name, EQUIP[e.equipment], [...w.entries()], e.mechanic === 'compound' ? 1 : 0, e.level || '']);
}
rows.sort((a, b) => a[1].localeCompare(b[1]));

const out =
  '// DIHASILKAN oleh tools/build-exdb.mjs dari Free Exercise DB (Unlicense). Jangan diedit tangan.\n' +
  '// Kolom: [id, nama, alat, [[otot, bobot], ...], compound(1/0), level]\n' +
  'export const EXDB = ' + JSON.stringify(rows) + ';\n';
writeFileSync(new URL('../docs/exdb.js', import.meta.url), out);
console.log(rows.length, 'gerakan ditulis,', out.length, 'karakter');
