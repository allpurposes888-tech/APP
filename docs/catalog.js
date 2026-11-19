// Katalog gerakan bawaan + program awal. Pemetaan otot: primer 1.0, sekunder 0.5 (sesuai dokumen desain).
// 27 gerakan inti ditulis tangan di bawah; ratusan gerakan lain berasal dari Free Exercise DB (Unlicense), lihat exdb.js.
import { EXDB } from './exdb.js';

export const MUSCLE_NAMES = {
  dada: 'Dada',
  punggung: 'Punggung',
  bahu: 'Bahu',
  bisep: 'Bisep',
  trisep: 'Trisep',
  quad: 'Quad',
  hamstring: 'Hamstring',
  glute: 'Glute',
  betis: 'Betis',
  core: 'Core',
  forearm: 'Lengan bawah',
  adduktor: 'Adduktor',
  abduktor: 'Abduktor',
};

/** Filter kelompok di pemilih gerakan. */
export const GROUPS = [
  { id: 'dada', label: 'Dada', muscles: ['dada'] },
  { id: 'punggung', label: 'Punggung', muscles: ['punggung'] },
  { id: 'bahu', label: 'Bahu', muscles: ['bahu'] },
  { id: 'kaki', label: 'Kaki', muscles: ['quad', 'hamstring', 'glute', 'betis', 'adduktor', 'abduktor'] },
  { id: 'lengan', label: 'Lengan', muscles: ['bisep', 'trisep', 'forearm'] },
  { id: 'core', label: 'Core', muscles: ['core'] },
];

export const EQUIPMENT = ['Barbel', 'Dumbel', 'Mesin', 'Kabel', 'Bodyweight'];

// [id, nama, alat, [[otot, bobot], ...], compound, utama]
const RAW = [
  ['bench', 'Bench Press', 'Barbel', [['dada', 1], ['trisep', 0.5], ['bahu', 0.5]], true, true],
  ['incdb', 'Incline Dumbbell Press', 'Dumbel', [['dada', 1], ['bahu', 0.5], ['trisep', 0.5]], true, false],
  ['ohp', 'Overhead Press', 'Barbel', [['bahu', 1], ['trisep', 0.5]], true, true],
  ['dbpress', 'Dumbbell Shoulder Press', 'Dumbel', [['bahu', 1], ['trisep', 0.5]], true, false],
  ['cablefly', 'Cable Fly', 'Kabel', [['dada', 1]], false, false],
  ['pecdeck', 'Pec Deck', 'Mesin', [['dada', 1]], false, false],
  ['row', 'Barbell Row', 'Barbel', [['punggung', 1], ['bisep', 0.5]], true, true],
  ['dbrow', 'Dumbbell Row', 'Dumbel', [['punggung', 1], ['bisep', 0.5]], true, false],
  ['latpd', 'Lat Pulldown', 'Kabel', [['punggung', 1], ['bisep', 0.5]], true, false],
  ['cablerow', 'Seated Cable Row', 'Kabel', [['punggung', 1], ['bisep', 0.5]], true, false],
  ['pullup', 'Pull-up', 'Bodyweight', [['punggung', 1], ['bisep', 0.5]], true, false],
  ['latraise', 'Lateral Raise', 'Dumbel', [['bahu', 1]], false, false],
  ['reardelt', 'Reverse Pec Deck', 'Mesin', [['bahu', 1]], false, false],
  ['barcurl', 'Barbell Curl', 'Barbel', [['bisep', 1]], false, false],
  ['dbcurl', 'Dumbbell Curl', 'Dumbel', [['bisep', 1]], false, false],
  ['hammer', 'Hammer Curl', 'Dumbel', [['bisep', 1]], false, false],
  ['pushdown', 'Triceps Pushdown', 'Kabel', [['trisep', 1]], false, false],
  ['skull', 'Skull Crusher', 'Barbel', [['trisep', 1]], false, false],
  ['ohtri', 'Overhead Triceps Extension', 'Kabel', [['trisep', 1]], false, false],
  ['squat', 'Back Squat', 'Barbel', [['quad', 1], ['glute', 0.5]], true, true],
  ['legpress', 'Leg Press', 'Mesin', [['quad', 1], ['glute', 0.5]], true, false],
  ['rdl', 'Romanian Deadlift', 'Barbel', [['hamstring', 1], ['glute', 0.5]], true, true],
  ['legcurl', 'Leg Curl', 'Mesin', [['hamstring', 1]], false, false],
  ['legext', 'Leg Extension', 'Mesin', [['quad', 1]], false, false],
  ['hipthrust', 'Hip Thrust', 'Barbel', [['glute', 1], ['hamstring', 0.25]], true, false],
  ['calf', 'Standing Calf Raise', 'Mesin', [['betis', 1]], false, false],
  ['cablecrunch', 'Cable Crunch', 'Kabel', [['core', 1]], false, false],
];

/** Gambar gerakan (2 posisi) dimuat dari CDN publik saat dilihat, tidak disimpan di repositori. */
export const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
export const imgUrl = (ex, n) => (ex && ex.img ? `${IMG_BASE}${ex.img}/${n}.jpg` : null);

// id gerakan inti -> id foto di Free Exercise DB
const IMG_FOR = {
  bench: 'Barbell_Bench_Press_-_Medium_Grip', incdb: 'Incline_Dumbbell_Press', ohp: 'Standing_Military_Press',
  dbpress: 'Dumbbell_Shoulder_Press', cablefly: 'Cable_Crossover', pecdeck: 'Butterfly', row: 'Bent_Over_Barbell_Row',
  dbrow: 'One-Arm_Dumbbell_Row', latpd: 'Wide-Grip_Lat_Pulldown', cablerow: 'Seated_Cable_Rows', pullup: 'Pullups',
  latraise: 'Side_Lateral_Raise', reardelt: 'Reverse_Machine_Flyes', barcurl: 'Barbell_Curl', dbcurl: 'Dumbbell_Bicep_Curl',
  hammer: 'Hammer_Curls', pushdown: 'Triceps_Pushdown', skull: 'EZ-Bar_Skullcrusher', ohtri: 'Cable_Rope_Overhead_Triceps_Extension',
  squat: 'Barbell_Squat', legpress: 'Leg_Press', rdl: 'Romanian_Deadlift', legcurl: 'Lying_Leg_Curls', legext: 'Leg_Extensions',
  hipthrust: 'Barbell_Hip_Thrust', calf: 'Standing_Calf_Raises', cablecrunch: 'Cable_Crunch',
};

const CORE = RAW.map(([id, name, equip, muscles, compound, main]) => ({
  id,
  name,
  equip,
  muscles: muscles.map(([muscleId, weight]) => ({ muscleId, weight })),
  compound,
  main,
  builtin: true,
  core: true,
  img: IMG_FOR[id] || null,
}));

const usedImg = new Set(Object.values(IMG_FOR));
const EXTRA = EXDB.filter((e) => !usedImg.has(e[0])).map(([id, name, equip, muscles, compound, level]) => ({
  id,
  name,
  equip,
  muscles: muscles.map(([muscleId, weight]) => ({ muscleId, weight })),
  compound: !!compound,
  main: false,
  builtin: true,
  core: false,
  img: id,
  level,
}));

export const CATALOG = [...CORE, ...EXTRA];

const it = (exId, sets, repMin, repMax, load, rir, rest) => ({ exId, sets, repMin, repMax, load, rir, rest });

/** Program awal Upper/Lower 4x. Beban awal hanya tebakan: ubah di menu Program. */
export function defaultProgram() {
  return {
    name: 'Upper/Lower 4x',
    days: [
      {
        id: 'd1',
        name: 'Upper A',
        items: [
          it('bench', 4, 6, 8, 40, 2, 120),
          it('row', 4, 8, 10, 40, 2, 120),
          it('dbpress', 3, 8, 10, 14, 2, 120),
          it('latpd', 3, 10, 12, 40, 2, 120),
          it('latraise', 3, 12, 15, 6, 1, 90),
          it('pushdown', 3, 10, 12, 20, 1, 90),
        ],
      },
      {
        id: 'd2',
        name: 'Lower A',
        items: [
          it('squat', 4, 6, 8, 50, 2, 120),
          it('rdl', 3, 8, 10, 50, 2, 120),
          it('legpress', 3, 10, 12, 80, 2, 120),
          it('legcurl', 3, 10, 12, 30, 1, 90),
          it('calf', 4, 10, 15, 40, 1, 75),
        ],
      },
      {
        id: 'd3',
        name: 'Upper B',
        items: [
          it('incdb', 4, 8, 10, 18, 2, 120),
          it('dbrow', 4, 8, 10, 22, 2, 120),
          it('ohp', 3, 6, 8, 30, 2, 120),
          it('cablerow', 3, 10, 12, 40, 2, 120),
          it('dbcurl', 3, 10, 12, 10, 1, 90),
          it('ohtri', 3, 10, 12, 20, 1, 90),
        ],
      },
      {
        id: 'd4',
        name: 'Lower B',
        items: [
          it('hipthrust', 4, 8, 10, 60, 2, 120),
          it('legext', 3, 10, 12, 30, 1, 90),
          it('legcurl', 3, 10, 12, 30, 1, 90),
          it('legpress', 3, 10, 12, 80, 2, 120),
          it('calf', 4, 10, 15, 40, 1, 75),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Kerangka program untuk layar "Buat program"
// ---------------------------------------------------------------------------

const day = (id, name, items) => ({ id, name, items });

export const TEMPLATES = [
  {
    id: 'ul4',
    name: 'Upper/Lower 4x',
    desc: '4 hari: atas, bawah, atas, bawah. Pilihan umum untuk hipertrofi.',
    build: () => defaultProgram().days,
  },
  {
    id: 'ppl3',
    name: 'Push/Pull/Legs 3x',
    desc: '3 hari: dorong, tarik, kaki. Cocok bila waktu terbatas.',
    build: () => [
      day('d1', 'Push', [
        it('bench', 4, 6, 8, 40, 2, 120),
        it('incdb', 3, 8, 12, 18, 2, 120),
        it('dbpress', 3, 8, 10, 14, 2, 120),
        it('latraise', 3, 12, 15, 6, 1, 90),
        it('pushdown', 3, 10, 12, 20, 1, 90),
      ]),
      day('d2', 'Pull', [
        it('row', 4, 8, 10, 40, 2, 120),
        it('latpd', 3, 10, 12, 40, 2, 120),
        it('cablerow', 3, 10, 12, 40, 2, 120),
        it('reardelt', 3, 12, 15, 20, 1, 90),
        it('barcurl', 3, 8, 12, 20, 1, 90),
      ]),
      day('d3', 'Legs', [
        it('squat', 4, 6, 8, 50, 2, 120),
        it('rdl', 3, 8, 10, 50, 2, 120),
        it('legpress', 3, 10, 12, 80, 2, 120),
        it('legcurl', 3, 10, 12, 30, 1, 90),
        it('calf', 4, 10, 15, 40, 1, 75),
      ]),
    ],
  },
  {
    id: 'fb3',
    name: 'Full Body 3x',
    desc: '3 hari seluruh tubuh, tiap otot dilatih 3 kali seminggu.',
    build: () => [
      day('d1', 'Full Body A', [
        it('squat', 3, 6, 8, 50, 2, 120),
        it('bench', 3, 6, 8, 40, 2, 120),
        it('row', 3, 8, 10, 40, 2, 120),
        it('latraise', 2, 12, 15, 6, 1, 90),
        it('dbcurl', 2, 10, 12, 10, 1, 90),
      ]),
      day('d2', 'Full Body B', [
        it('rdl', 3, 8, 10, 50, 2, 120),
        it('ohp', 3, 6, 8, 30, 2, 120),
        it('latpd', 3, 10, 12, 40, 2, 120),
        it('legpress', 2, 10, 12, 80, 2, 120),
        it('pushdown', 2, 10, 12, 20, 1, 90),
      ]),
      day('d3', 'Full Body C', [
        it('legpress', 3, 8, 12, 80, 2, 120),
        it('incdb', 3, 8, 10, 18, 2, 120),
        it('cablerow', 3, 10, 12, 40, 2, 120),
        it('legcurl', 2, 10, 12, 30, 1, 90),
        it('hammer', 2, 10, 12, 10, 1, 90),
      ]),
    ],
  },
  {
    id: 'kosong',
    name: 'Mulai dari kosong',
    desc: 'Susun hari dan gerakan sendiri dari awal.',
    build: () => [day('d1', 'Hari 1', [])],
  },
];

export function programFromTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id) || TEMPLATES[0];
  return { name: t.name, days: t.build() };
}
