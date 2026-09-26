// Bibliothèque d'exercices et modèles de programmes.
// Pour ajouter un exercice : ajoute une ligne dans EXERCISES, puis utilise son id dans un programme ou dans ALT.
//   name  = nom affiché
//   img   = identifiant de l'exercice dans la base libre « Free Exercise DB » (photos de départ et d'arrivée)
//   cue   = consigne d'exécution en une phrase
//   home  = true si faisable à la maison avec haltères / poids du corps
//   lower = jambes (progression plus grosse) · bw = poids du corps · time = en secondes · inc = progression en kg
export const EXERCISES = {
  // --- Jambes ---
  squat: { name: 'Squat', lower: true, img: 'Barbell_Squat', cue: 'Pieds à largeur d’épaules, descends les hanches vers l’arrière jusqu’aux cuisses parallèles, dos droit, remonte en poussant dans les talons.' },
  legpress: { name: 'Presse à cuisses', lower: true, img: 'Leg_Press', cue: 'Dos collé au dossier, descends les genoux vers la poitrine sans décoller le bassin, pousse sans verrouiller les genoux.' },
  rdl: { name: 'Soulevé de terre roumain', lower: true, img: 'Romanian_Deadlift', cue: 'Jambes presque tendues, pousse les hanches vers l’arrière en gardant la barre près des jambes, dos plat, remonte en serrant les fessiers.' },
  legcurl: { name: 'Curl jambes (allongé)', lower: true, inc: 2.5, img: 'Lying_Leg_Curls', cue: 'Ramène les talons vers les fessiers en contrôlant, sans balancer, puis redescends lentement.' },
  seated_curl: { name: 'Curl jambes (assis)', lower: true, inc: 2.5, img: 'Seated_Leg_Curl', cue: 'Assis, cale les jambes, ramène les talons sous le siège en contrôlant, reviens lentement.' },
  legext: { name: 'Extension jambes', lower: true, inc: 2.5, img: 'Leg_Extensions', cue: 'Étends les jambes jusqu’en haut, serre les cuisses une seconde, redescends lentement.' },
  calf: { name: 'Mollets debout (machine)', lower: true, img: 'Standing_Calf_Raises', cue: 'Monte sur la pointe des pieds le plus haut possible, pause en haut, descends jusqu’à l’étirement complet.' },
  seated_calf: { name: 'Mollets assis', lower: true, img: 'Seated_Calf_Raise', cue: 'Genoux à 90°, monte sur la pointe des pieds, pause en haut, descends jusqu’à l’étirement.' },
  hip_thrust: { name: 'Hip thrust', lower: true, img: 'Barbell_Hip_Thrust', cue: 'Haut du dos appuyé sur un banc, pousse les hanches vers le haut jusqu’à l’alignement épaules-hanches-genoux, serre les fessiers.' },
  bb_bridge: { name: 'Pont fessier à la barre', lower: true, img: 'Barbell_Glute_Bridge', cue: 'Allongé, barre sur les hanches, monte le bassin en serrant les fessiers, pause en haut.' },
  lunge: { name: 'Fentes (haltères)', lower: true, inc: 2, home: true, img: 'Dumbbell_Lunges', cue: 'Grand pas en avant, descends jusqu’à environ 90° aux deux genoux, puis pousse pour revenir.' },
  good_morning: { name: 'Good morning', lower: true, img: 'Good_Morning', cue: 'Barre sur les épaules, hanches vers l’arrière et dos plat, descends jusqu’à sentir l’arrière des cuisses, remonte.' },
  goblet: { name: 'Squat gobelet', lower: true, inc: 2, home: true, img: 'Goblet_Squat', cue: 'Tiens un haltère contre la poitrine, descends en gardant le buste droit et les coudes entre les genoux.' },
  db_squat: { name: 'Squat aux haltères', lower: true, inc: 2, home: true, img: 'Dumbbell_Squat', cue: 'Haltères le long du corps, descends les hanches vers l’arrière jusqu’aux cuisses parallèles, remonte en poussant dans les talons.' },
  bw_squat: { name: 'Squat poids du corps', lower: true, bw: true, home: true, img: 'Bodyweight_Squat', cue: 'Pieds à largeur d’épaules, descends jusqu’aux cuisses parallèles, bras devant, remonte.' },
  db_rdl: { name: 'Soulevé de terre roumain haltères', lower: true, inc: 2, home: true, img: 'Stiff-Legged_Dumbbell_Deadlift', cue: 'Haltères devant les cuisses, pousse les hanches vers l’arrière en gardant le dos plat, descends sous les genoux, remonte.' },
  bulg: { name: 'Split squat (haltères)', lower: true, inc: 2, home: true, img: 'Split_Squat_with_Dumbbells', cue: 'Un pied devant, un pied derrière, descends verticalement jusqu’à ce que la cuisse avant soit parallèle au sol, remonte.' },
  stepup: { name: 'Montées sur banc (haltères)', lower: true, inc: 2, home: true, img: 'Dumbbell_Step_Ups', cue: 'Un pied sur un banc, monte en poussant avec la jambe d’appui sans t’aider de l’autre, redescends contrôlé.' },
  glute_bridge: { name: 'Pont fessier (une jambe)', lower: true, inc: 2, home: true, img: 'Single_Leg_Glute_Bridge', cue: 'Sur le dos, un pied au sol, monte les hanches en serrant les fessiers, pause en haut, descends lentement.' },
  calf_db: { name: 'Mollets à l’haltère', lower: true, inc: 2, home: true, img: 'Standing_Dumbbell_Calf_Raise', cue: 'Haltère en main, monte sur la pointe des pieds, descends jusqu’à l’étirement.' },
  calf_step: { name: 'Mollets sur une marche', lower: true, bw: true, home: true, img: 'Calf_Raise_On_A_Dumbbell', cue: 'Pointe des pieds sur le bord d’une marche, monte le plus haut possible, descends sous le niveau de la marche.' },
  // --- Poussée ---
  bench: { name: 'Développé couché', img: 'Barbell_Bench_Press_-_Medium_Grip', cue: 'Omoplates serrées, descends la barre vers le milieu de la poitrine, pousse en gardant les pieds au sol.' },
  incline_db: { name: 'Développé incliné haltères', inc: 2, img: 'Incline_Dumbbell_Press', cue: 'Banc incliné à environ 30°, descends les haltères aux côtés de la poitrine, pousse sans claquer les haltères.' },
  db_bench: { name: 'Développé couché haltères', inc: 2, home: true, img: 'Dumbbell_Bench_Press', cue: 'Allongé, haltères au niveau de la poitrine, pousse vers le haut en rapprochant les haltères, descends lentement.' },
  machine_press: { name: 'Développé couché à la machine', img: 'Machine_Bench_Press', cue: 'Dos collé au dossier, pousse les poignées vers l’avant sans verrouiller les coudes, reviens lentement.' },
  db_fly: { name: 'Écartés aux haltères', inc: 1, home: true, img: 'Dumbbell_Flyes', cue: 'Allongé, bras presque tendus, ouvre les haltères en arc, ramène-les au-dessus de la poitrine.' },
  pushup: { name: 'Pompes', bw: true, home: true, img: 'Pushups', cue: 'Mains sous les épaules, corps en planche, descends la poitrine près du sol, pousse jusqu’aux bras tendus.' },
  pushup_inc: { name: 'Pompes pieds surélevés', bw: true, home: true, img: 'Push-Ups_With_Feet_Elevated', cue: 'Pieds sur un banc ou une chaise, corps en ligne droite, descends la poitrine vers le sol, pousse.' },
  close_pushup: { name: 'Pompes mains rapprochées', bw: true, home: true, img: 'Push-Ups_-_Close_Triceps_Position', cue: 'Mains rapprochées sous la poitrine, coudes près du corps, descends et pousse. Cible les triceps.' },
  ohp: { name: 'Développé militaire', img: 'Barbell_Shoulder_Press', cue: 'Barre à hauteur des épaules, pousse au-dessus de la tête en serrant abdos et fessiers, sans cambrer le dos.' },
  db_ohp: { name: 'Développé épaules haltères', inc: 2, home: true, img: 'Seated_Dumbbell_Press', cue: 'Haltères aux épaules, pousse au-dessus de la tête sans cambrer, descends lentement.' },
  machine_shoulder: { name: 'Développé épaules à la machine', img: 'Machine_Shoulder_Military_Press', cue: 'Dos collé, pousse les poignées au-dessus de la tête sans verrouiller les coudes, redescends lentement.' },
  lateral: { name: 'Élévations latérales', inc: 1, home: true, img: 'Side_Lateral_Raise', cue: 'Légère flexion des coudes, monte les bras sur les côtés jusqu’à l’épaule, descends lentement, sans élan.' },
  db_lateral: { name: 'Élévations latérales haltères', inc: 1, home: true, img: 'Side_Lateral_Raise', cue: 'Légère flexion des coudes, monte les bras sur les côtés jusqu’à l’épaule, descends lentement, sans élan.' },
  cable_lateral: { name: 'Élévations latérales à la poulie', inc: 1, img: 'Cable_Seated_Lateral_Raise', cue: 'Assis, poignée en main, monte le bras sur le côté jusqu’à l’épaule, descends lentement.' },
  tricep_push: { name: 'Extension triceps à la poulie', inc: 2.5, img: 'Triceps_Pushdown', cue: 'Coudes collés au corps, pousse la poignée vers le bas jusqu’à l’extension complète, remonte en contrôlant.' },
  ovh_rope: { name: 'Extension triceps corde (au-dessus de la tête)', inc: 2.5, img: 'Triceps_Overhead_Extension_with_Rope', cue: 'Corde derrière la tête, coudes fixes, étends les bras vers l’avant et le haut, reviens lentement.' },
  tri_ext: { name: 'Extension triceps haltère', inc: 1, home: true, img: 'Standing_Dumbbell_Triceps_Extension', cue: 'Haltère derrière la tête, coudes vers l’avant, étends les bras vers le haut, descends contrôlé.' },
  skull: { name: 'Barre au front (triceps)', inc: 1, img: 'Lying_Triceps_Press', cue: 'Allongé, barre EZ au-dessus du front, plie les coudes sans les écarter, étends les bras.' },
  dips: { name: 'Dips', bw: true, img: 'Dips_-_Chest_Version', cue: 'Buste légèrement penché, descends jusqu’à environ 90° aux coudes, remonte sans verrouiller.' },
  dip_machine: { name: 'Dips à la machine', img: 'Dip_Machine', cue: 'Dos droit, pousse les poignées vers le bas jusqu’à l’extension, remonte lentement.' },
  bench_dips: { name: 'Dips sur banc', bw: true, home: true, img: 'Bench_Dips', cue: 'Mains sur un banc derrière toi, descends jusqu’à 90° aux coudes, remonte en poussant.' },
  // --- Tirage ---
  row: { name: 'Rowing barre', img: 'Bent_Over_Barbell_Row', cue: 'Buste penché à environ 45°, tire la barre vers le bas du ventre en serrant les omoplates, dos plat.' },
  dbl_row: { name: 'Rowing deux haltères', inc: 2, home: true, img: 'Bent_Over_Two-Dumbbell_Row', cue: 'Buste penché, haltères pendus, tire les coudes vers l’arrière en serrant les omoplates, descends lentement.' },
  db_row: { name: 'Rowing haltère un bras', inc: 2, home: true, img: 'One-Arm_Dumbbell_Row', cue: 'Une main et un genou sur un banc, tire l’haltère vers la hanche en gardant le dos plat, descends contrôlé.' },
  cable_row: { name: 'Rowing câble assis', img: 'Seated_Cable_Rows', cue: 'Dos droit, tire la poignée vers le ventre en serrant les omoplates, reviens lentement bras tendus.' },
  inv_row: { name: 'Rowing inversé', bw: true, img: 'Inverted_Row', cue: 'Sous une barre basse ou une table solide, corps droit, tire la poitrine vers la barre, descends contrôlé.' },
  lat_pd: { name: 'Tirage vertical', img: 'Wide-Grip_Lat_Pulldown', cue: 'Tire la barre vers le haut de la poitrine en abaissant les coudes, poitrine sortie, sans te balancer.' },
  vbar: { name: 'Tirage vertical prise serrée', img: 'V-Bar_Pulldown', cue: 'Prise neutre serrée, tire vers le haut de la poitrine en abaissant les coudes.' },
  underhand_pd: { name: 'Tirage vertical supination', img: 'Underhand_Cable_Pulldowns', cue: 'Paumes vers toi, tire vers la poitrine en serrant dos et biceps.' },
  pullup: { name: 'Tractions', bw: true, img: 'Pullups', cue: 'Prise un peu plus large que les épaules, tire jusqu’à ce que le menton dépasse la barre, descends contrôlé.' },
  chinup: { name: 'Tractions supination', bw: true, img: 'Chin-Up', cue: 'Paumes vers toi, mains à largeur d’épaules, tire jusqu’au menton au-dessus de la barre, descends lentement.' },
  pullover: { name: 'Pull-over haltère', inc: 2, home: true, img: 'Bent-Arm_Dumbbell_Pullover', cue: 'Allongé, haltère à deux mains, descends-le derrière la tête bras presque tendus, ramène-le au-dessus de la poitrine.' },
  face_pull: { name: 'Face pull', inc: 2.5, img: 'Face_Pull', cue: 'Corde à hauteur du visage, tire vers le front en écartant les mains, coudes hauts, serre l’arrière des épaules.' },
  rev_machine: { name: 'Oiseau à la machine', img: 'Reverse_Machine_Flyes', cue: 'Poitrine contre le dossier, ouvre les bras vers l’arrière en serrant les omoplates, reviens lentement.' },
  reardelt: { name: 'Oiseau haltères', inc: 1, home: true, img: 'Reverse_Flyes', cue: 'Buste penché, monte les haltères sur les côtés en serrant les omoplates, descends lentement.' },
  curl: { name: 'Curl biceps haltères', inc: 1, home: true, img: 'Dumbbell_Bicep_Curl', cue: 'Coudes collés au corps, monte les haltères en tournant les paumes vers le haut, descends lentement sans balancer.' },
  db_curl: { name: 'Curl haltères', inc: 1, home: true, img: 'Dumbbell_Bicep_Curl', cue: 'Coudes collés au corps, monte les haltères en tournant les paumes vers le haut, descends lentement sans balancer.' },
  hammer: { name: 'Curl marteau', inc: 1, home: true, img: 'Hammer_Curls', cue: 'Paumes face à face, monte l’haltère sans balancer, coudes collés, descends lentement.' },
  bbcurl: { name: 'Curl à la barre', inc: 2.5, img: 'Barbell_Curl', cue: 'Barre en supination, coudes collés, monte la barre vers les épaules, descends lentement.' },
  // --- Abdos ---
  plank: { name: 'Planche (secondes)', bw: true, time: true, home: true, img: 'Plank', cue: 'Avant-bras au sol, corps en ligne droite de la tête aux talons, abdos et fessiers serrés, respire normalement.' },
  side_bridge: { name: 'Planche latérale (secondes)', bw: true, time: true, home: true, img: 'Side_Bridge', cue: 'Sur le côté, avant-bras au sol, monte les hanches en ligne droite et tiens la position.' },
  crunch: { name: 'Crunch', bw: true, home: true, img: 'Crunches', cue: 'Sur le dos, genoux pliés, soulève les épaules en contractant les abdos, sans tirer sur la nuque.' },
  reverse_crunch: { name: 'Crunch inversé', bw: true, home: true, img: 'Reverse_Crunch', cue: 'Sur le dos, ramène les genoux vers la poitrine en décollant le bassin, redescends lentement.' },
};

// Variantes proposées quand un exercice ne convient pas (douleur, matériel manquant, pas envie).
const ALT = {
  squat: ['legpress', 'goblet', 'db_squat', 'bulg', 'stepup', 'bw_squat'],
  legpress: ['squat', 'goblet', 'bulg', 'stepup', 'db_squat'],
  rdl: ['db_rdl', 'good_morning', 'hip_thrust', 'seated_curl'],
  legcurl: ['seated_curl', 'db_rdl', 'glute_bridge', 'good_morning'],
  seated_curl: ['legcurl', 'db_rdl', 'glute_bridge'],
  legext: ['bulg', 'goblet', 'stepup', 'db_squat'],
  calf: ['seated_calf', 'calf_db', 'calf_step'],
  seated_calf: ['calf', 'calf_db', 'calf_step'],
  hip_thrust: ['glute_bridge', 'bb_bridge', 'db_rdl'],
  bb_bridge: ['hip_thrust', 'glute_bridge'],
  lunge: ['bulg', 'stepup', 'goblet', 'db_squat'],
  good_morning: ['rdl', 'db_rdl', 'hip_thrust'],
  goblet: ['db_squat', 'bw_squat', 'bulg', 'stepup'],
  db_squat: ['goblet', 'bw_squat', 'bulg', 'stepup'],
  bw_squat: ['goblet', 'db_squat', 'bulg'],
  db_rdl: ['glute_bridge', 'db_squat', 'good_morning'],
  bulg: ['goblet', 'stepup', 'lunge', 'db_squat'],
  stepup: ['bulg', 'lunge', 'goblet'],
  glute_bridge: ['db_rdl', 'stepup', 'hip_thrust'],
  calf_db: ['calf_step', 'calf', 'seated_calf'],
  calf_step: ['calf_db', 'calf', 'seated_calf'],
  bench: ['db_bench', 'machine_press', 'incline_db', 'pushup', 'db_fly'],
  incline_db: ['db_bench', 'machine_press', 'pushup_inc', 'bench'],
  db_bench: ['pushup', 'db_fly', 'pushup_inc', 'machine_press'],
  machine_press: ['db_bench', 'bench', 'pushup'],
  db_fly: ['pushup', 'db_bench'],
  pushup: ['pushup_inc', 'close_pushup', 'db_bench', 'db_fly'],
  pushup_inc: ['pushup', 'db_bench', 'close_pushup'],
  close_pushup: ['pushup', 'bench_dips', 'tri_ext'],
  ohp: ['db_ohp', 'machine_shoulder', 'pushup_inc'],
  db_ohp: ['ohp', 'machine_shoulder', 'lateral', 'pushup_inc'],
  machine_shoulder: ['db_ohp', 'ohp'],
  lateral: ['cable_lateral', 'reardelt'],
  db_lateral: ['cable_lateral', 'reardelt'],
  cable_lateral: ['lateral', 'reardelt'],
  tricep_push: ['ovh_rope', 'tri_ext', 'skull', 'close_pushup', 'dips', 'bench_dips'],
  ovh_rope: ['tricep_push', 'tri_ext', 'skull'],
  tri_ext: ['close_pushup', 'skull', 'ovh_rope', 'bench_dips'],
  skull: ['tricep_push', 'tri_ext', 'ovh_rope'],
  dips: ['bench_dips', 'close_pushup', 'tricep_push', 'dip_machine'],
  dip_machine: ['dips', 'bench_dips', 'tricep_push'],
  bench_dips: ['close_pushup', 'tri_ext', 'dips'],
  row: ['dbl_row', 'db_row', 'cable_row', 'inv_row'],
  dbl_row: ['row', 'db_row', 'cable_row'],
  db_row: ['dbl_row', 'inv_row', 'pullover', 'cable_row'],
  cable_row: ['row', 'db_row', 'dbl_row', 'inv_row'],
  inv_row: ['db_row', 'dbl_row', 'cable_row'],
  lat_pd: ['vbar', 'underhand_pd', 'pullup', 'chinup', 'db_row'],
  vbar: ['lat_pd', 'underhand_pd', 'chinup'],
  underhand_pd: ['lat_pd', 'vbar', 'chinup'],
  pullup: ['chinup', 'lat_pd', 'inv_row', 'db_row'],
  chinup: ['pullup', 'lat_pd', 'inv_row'],
  pullover: ['db_row', 'dbl_row', 'db_fly'],
  face_pull: ['reardelt', 'rev_machine', 'cable_lateral'],
  rev_machine: ['reardelt', 'face_pull'],
  reardelt: ['rev_machine', 'face_pull', 'dbl_row'],
  curl: ['hammer', 'bbcurl'],
  db_curl: ['hammer', 'bbcurl'],
  hammer: ['curl', 'bbcurl'],
  bbcurl: ['curl', 'hammer'],
  plank: ['side_bridge', 'crunch', 'reverse_crunch'],
  side_bridge: ['plank', 'crunch', 'reverse_crunch'],
  crunch: ['reverse_crunch', 'plank', 'side_bridge'],
  reverse_crunch: ['crunch', 'plank', 'side_bridge'],
};

// Variantes disponibles pour un exercice, selon le matériel et ce qui est déjà dans la journée.
export function altsFor(id, equipment, exclude = []) {
  return (ALT[id] || []).filter((a) => EXERCISES[a] && !exclude.includes(a) && (equipment !== 'home' || EXERCISES[a].home));
}

// Photos de départ (0) et d'arrivée (1) : Free Exercise DB (domaine public, licence Unlicense)
export const imgUrl = (id, n) => `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/${EXERCISES[id].img}/${n}.jpg`;
export const imgFallback = (id, n) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${EXERCISES[id].img}/${n}.jpg`;

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
