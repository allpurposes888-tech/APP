// Katalog gerakan bawaan + program awal. Pemetaan otot: primer 1.0, sekunder 0.5 (sesuai dokumen desain).

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
};

/** Filter kelompok di pemilih gerakan. */
export const GROUPS = [
  { id: 'dada', label: 'Dada', muscles: ['dada'] },
  { id: 'punggung', label: 'Punggung', muscles: ['punggung'] },
  { id: 'bahu', label: 'Bahu', muscles: ['bahu'] },
  { id: 'kaki', label: 'Kaki', muscles: ['quad', 'hamstring', 'glute', 'betis'] },
  { id: 'lengan', label: 'Lengan', muscles: ['bisep', 'trisep'] },
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

export const CATALOG = RAW.map(([id, name, equip, muscles, compound, main]) => ({
  id,
  name,
  equip,
  muscles: muscles.map(([muscleId, weight]) => ({ muscleId, weight })),
  compound,
  main,
  builtin: true,
}));

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
          it('bench', 4, 6, 8, 40, 2, 180),
          it('row', 4, 8, 10, 40, 2, 180),
          it('dbpress', 3, 8, 10, 14, 2, 150),
          it('latpd', 3, 10, 12, 40, 2, 120),
          it('latraise', 3, 12, 15, 6, 1, 90),
          it('pushdown', 3, 10, 12, 20, 1, 90),
        ],
      },
      {
        id: 'd2',
        name: 'Lower A',
        items: [
          it('squat', 4, 6, 8, 50, 2, 180),
          it('rdl', 3, 8, 10, 50, 2, 150),
          it('legpress', 3, 10, 12, 80, 2, 150),
          it('legcurl', 3, 10, 12, 30, 1, 90),
          it('calf', 4, 10, 15, 40, 1, 75),
        ],
      },
      {
        id: 'd3',
        name: 'Upper B',
        items: [
          it('incdb', 4, 8, 10, 18, 2, 150),
          it('dbrow', 4, 8, 10, 22, 2, 150),
          it('ohp', 3, 6, 8, 30, 2, 180),
          it('cablerow', 3, 10, 12, 40, 2, 120),
          it('dbcurl', 3, 10, 12, 10, 1, 90),
          it('ohtri', 3, 10, 12, 20, 1, 90),
        ],
      },
      {
        id: 'd4',
        name: 'Lower B',
        items: [
          it('hipthrust', 4, 8, 10, 60, 2, 150),
          it('legext', 3, 10, 12, 30, 1, 90),
          it('legcurl', 3, 10, 12, 30, 1, 90),
          it('legpress', 3, 10, 12, 80, 2, 150),
          it('calf', 4, 10, 15, 40, 1, 75),
        ],
      },
    ],
  };
}
