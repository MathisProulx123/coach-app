// Bibliothèque d'exercices et modèles de programmes.
// Pour ajouter un exercice : ajoute une ligne dans EXERCISES, puis utilise son id dans un programme plus bas.
//   name  = nom affiché
//   lower = true pour les jambes (progression plus grosse)
//   bw    = poids du corps (pompes, tractions...) : la charge de départ est 0
//   time  = mesuré en secondes (planche)
//   inc   = petite progression en kg propre à l'exercice (sinon règle générale dans rules.js)
export const EXERCISES = {
  // --- Salle ---
  squat: { name: 'Squat', lower: true },
  legpress: { name: 'Presse à cuisses', lower: true },
  rdl: { name: 'Soulevé de terre roumain', lower: true },
  legcurl: { name: 'Curl jambes', lower: true, inc: 2.5 },
  legext: { name: 'Extension jambes', lower: true, inc: 2.5 },
  calf: { name: 'Mollets debout', lower: true },
  hip_thrust: { name: 'Hip thrust', lower: true },
  lunge: { name: 'Fentes (haltères)', lower: true, inc: 2 },
  bench: { name: 'Développé couché' },
  incline_db: { name: 'Développé incliné haltères', inc: 2 },
  ohp: { name: 'Développé militaire' },
  lateral: { name: 'Élévations latérales', inc: 1 },
  tricep_push: { name: 'Extension triceps à la poulie', inc: 2.5 },
  row: { name: 'Rowing barre' },
  lat_pd: { name: 'Tirage vertical' },
  cable_row: { name: 'Rowing câble assis' },
  face_pull: { name: 'Face pull', inc: 2.5 },
  curl: { name: 'Curl biceps haltères', inc: 1 },
  pullup: { name: 'Tractions', bw: true },
  dips: { name: 'Dips', bw: true },
  plank: { name: 'Planche (secondes)', bw: true, time: true },
  // --- Maison (haltères + poids du corps) ---
  goblet: { name: 'Squat gobelet', lower: true, inc: 2 },
  db_rdl: { name: 'Soulevé de terre roumain haltères', lower: true, inc: 2 },
  bulg: { name: 'Split squat bulgare', lower: true, inc: 2 },
  glute_bridge: { name: 'Pont fessier', lower: true, inc: 2 },
  calf_db: { name: 'Mollets haltères', lower: true, inc: 2 },
  pushup: { name: 'Pompes', bw: true },
  pushup_inc: { name: 'Pompes pieds surélevés', bw: true },
  db_bench: { name: 'Développé couché haltères', inc: 2 },
  db_row: { name: 'Rowing haltère un bras', inc: 2 },
  db_ohp: { name: 'Développé épaules haltères', inc: 2 },
  db_lateral: { name: 'Élévations latérales haltères', inc: 1 },
  db_curl: { name: 'Curl haltères', inc: 1 },
  tri_ext: { name: 'Extension triceps haltère', inc: 1 },
  pullover: { name: 'Pull-over haltère', inc: 2 },
  reardelt: { name: 'Oiseau haltères', inc: 1 },
};

// Version « maison » : chaque exercice de salle est remplacé par un équivalent.
const HOME_MAP = {
  squat: 'goblet', legpress: 'bulg', rdl: 'db_rdl', legcurl: 'glute_bridge', legext: 'bulg', calf: 'calf_db',
  hip_thrust: 'glute_bridge', bench: 'db_bench', incline_db: 'pushup_inc', ohp: 'db_ohp', lateral: 'db_lateral',
  tricep_push: 'tri_ext', row: 'db_row', lat_pd: 'pullover', cable_row: 'db_row', face_pull: 'reardelt',
  curl: 'db_curl', pullup: 'db_row', dips: 'pushup',
};

// [id, séries, reps min, reps max]
const T = (id, sets, lo, hi) => ({ id, sets, lo, hi });

const GYM = {
  FB_A: [T('squat', 3, 5, 8), T('bench', 3, 6, 10), T('row', 3, 8, 12), T('ohp', 2, 8, 12), T('legcurl', 2, 10, 15), T('plank', 2, 30, 60)],
  FB_B: [T('rdl', 3, 6, 10), T('incline_db', 3, 8, 12), T('lat_pd', 3, 8, 12), T('lunge', 2, 10, 12), T('lateral', 3, 12, 15), T('curl', 2, 10, 15)],
  FB_C: [T('legpress', 3, 8, 12), T('dips', 3, 6, 12), T('cable_row', 3, 8, 12), T('hip_thrust', 3, 8, 12), T('face_pull', 2, 12, 15), T('tricep_push', 2, 10, 15)],
  UP_A: [T('bench', 4, 5, 8), T('row', 4, 6, 10), T('ohp', 3, 8, 12), T('lat_pd', 3, 8, 12), T('tricep_push', 2, 10, 15), T('curl', 2, 10, 15)],
  LO_A: [T('squat', 4, 5, 8), T('rdl', 3, 6, 10), T('legcurl', 3, 10, 15), T('calf', 4, 10, 15), T('plank', 3, 30, 60)],
  UP_B: [T('incline_db', 3, 8, 12), T('pullup', 3, 6, 10), T('face_pull', 3, 12, 15), T('lateral', 3, 12, 15), T('dips', 3, 6, 12), T('curl', 3, 10, 15)],
  LO_B: [T('hip_thrust', 3, 8, 12), T('legpress', 3, 8, 12), T('lunge', 3, 10, 12), T('legext', 3, 12, 15), T('legcurl', 3, 10, 15), T('calf', 3, 12, 15)],
  PUSH_A: [T('bench', 4, 5, 8), T('ohp', 3, 6, 10), T('incline_db', 3, 8, 12), T('lateral', 3, 12, 15), T('tricep_push', 3, 10, 15)],
  PULL_A: [T('row', 4, 6, 10), T('lat_pd', 3, 8, 12), T('cable_row', 3, 8, 12), T('face_pull', 3, 12, 15), T('curl', 3, 8, 12)],
  LEGS_A: [T('squat', 4, 5, 8), T('rdl', 3, 6, 10), T('legpress', 3, 10, 12), T('legcurl', 3, 10, 15), T('calf', 4, 10, 15)],
  PUSH_B: [T('incline_db', 4, 6, 10), T('dips', 3, 6, 12), T('ohp', 3, 8, 12), T('lateral', 4, 12, 20), T('tricep_push', 3, 10, 15)],
  PULL_B: [T('pullup', 4, 5, 10), T('cable_row', 3, 8, 12), T('row', 3, 8, 12), T('face_pull', 3, 12, 15), T('curl', 3, 10, 15)],
  LEGS_B: [T('hip_thrust', 4, 6, 10), T('legpress', 3, 8, 12), T('lunge', 3, 10, 12), T('legext', 3, 12, 15), T('legcurl', 3, 10, 15), T('calf', 3, 12, 15)],
};

// Quel programme selon le nombre de jours par semaine : [nom affiché, modèle]
const LAYOUT = {
  2: [['Full body A', 'FB_A'], ['Full body B', 'FB_B']],
  3: [['Full body A', 'FB_A'], ['Full body B', 'FB_B'], ['Full body C', 'FB_C']],
  4: [['Haut A', 'UP_A'], ['Bas A', 'LO_A'], ['Haut B', 'UP_B'], ['Bas B', 'LO_B']],
  5: [['Push', 'PUSH_A'], ['Pull', 'PULL_A'], ['Jambes', 'LEGS_A'], ['Haut', 'UP_A'], ['Bas', 'LO_B']],
  6: [['Push A', 'PUSH_A'], ['Pull A', 'PULL_A'], ['Jambes A', 'LEGS_A'], ['Push B', 'PUSH_B'], ['Pull B', 'PULL_B'], ['Jambes B', 'LEGS_B']],
};

export function buildProgram(days, equipment) {
  const layout = LAYOUT[Math.min(6, Math.max(2, days))];
  return layout.map(([label, key]) => {
    let list = GYM[key].map((e) => ({ ...e }));
    if (equipment === 'home') {
      const seen = new Set();
      list = list
        .map((e) => ({ ...e, id: HOME_MAP[e.id] || e.id }))
        .filter((e) => !seen.has(e.id) && seen.add(e.id));
    }
    return { label, exercises: list };
  });
}
