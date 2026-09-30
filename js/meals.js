// Génère un vrai plan de repas à partir de tes cibles (calories, protéines, glucides, lipides).
// On mémorise seulement les CHOIX d'aliments (« choices ») ; les quantités sont recalculées à chaque affichage,
// donc quand le coach change tes calories après un check-in, tes repas s'ajustent automatiquement.
import { FOODS, FOOD_BY_ID, allowed, resolveFood } from './foods.js';

export const SLOT_NAMES = { dej: 'Déjeuner', din: 'Dîner', col: 'Collation', col2: 'Collation', col3: 'Collation', sou: 'Souper' };

// [repas, part de la journée]. Plus de repas = portions plus normales par repas, surtout sur une grosse cible
// (ex. prise de masse) : mieux vaut manger plus souvent que forcer une quantité énorme dans une seule assiette.
export const MEAL_LAYOUT = {
  3: [['dej', 0.30], ['din', 0.35], ['sou', 0.35]],
  4: [['dej', 0.27], ['din', 0.30], ['col', 0.13], ['sou', 0.30]],
  5: [['dej', 0.25], ['col', 0.10], ['din', 0.28], ['col2', 0.10], ['sou', 0.27]],
  6: [['dej', 0.22], ['col', 0.09], ['din', 0.24], ['col2', 0.09], ['sou', 0.24], ['col3', 0.12]],
};
// Ce qu'il y a dans chaque repas (les collations sont plus légères)
const ROLES = {
  dej: ['protein', 'carb', 'fruit', 'fat'],
  din: ['protein', 'carb', 'veg', 'fat'],
  sou: ['protein', 'carb', 'veg', 'fat'],
  col: ['protein', 'fruit'],
  col2: ['protein', 'fruit'],
  col3: ['protein', 'carb', 'fruit'],
};
const isSnack = (slot) => slot === 'col' || slot === 'col2' || slot === 'col3';
const slotKey = (slot) => (slot === 'col2' || slot === 'col3' ? 'col' : slot);
export const ROLE_NAMES = { protein: 'Protéines', carb: 'Glucides', fat: 'Lipides', fruit: 'Fruit', veg: 'Légumes', milk: 'Lait' };
const VEG_GRAMS = 150;
// Portion la plus basse / la plus haute d'un aliment. min : sous ce seuil la portion n'a pas de sens dans une
// assiette (ex. 50 g de bœuf, 10 g d'avoine) ; les fruits peuvent monter jusqu'à ~2 portions les jours à gros glucides.
// Un modèle de repas peut resserrer ces limites pour un aliment (ex. 40 g d'avoine au plus dans un smoothie) : it.min / it.max.
const minG = (food, it = {}) => it.min ?? food.min ?? 0;
const maxG = (food, role, it = {}) => it.max ?? (role === 'fruit' ? Math.max(260, food.unit ? food.unit.g * 2 : 0) : food.max ?? 600);

function rng(seed) { // petit générateur aléatoire reproductible
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const candidates = (role, slot, prefs) => FOODS.filter((f) => f.role === role && f.slots.includes(slotKey(slot)) && allowed(f, prefs));
// Budget « serré » : on laisse de côté les aliments les plus chers (cost 3) quand il reste d'autres choix.
const affordable = (list, prefs) => {
  if (prefs.budget !== 'serre') return list;
  const cheap = list.filter((f) => (f.cost ?? 2) < 3);
  return cheap.length ? cheap : list;
};

// ---------- Modèles de repas ----------
// De vrais repas comme en mangent les gens qui s'entraînent (bols, assiettes, gruau protéiné, omelettes, wraps…),
// plutôt que des aliments tirés au hasard qui ne vont pas ensemble. Pour chaque rôle, la liste des aliments possibles
// (filtrés ensuite selon les allergies, le régime, les aliments non aimés et le budget).
//   name  : début du nom, suivi des noms courts des aliments choisis pour les rôles de « show » (« Bol poulet, riz et brocoli »)
//   label : description du modèle (donnée au coach IA)
//   need  : rôle que le nom annonce (« Bagel… », « Spaghetti… ») : si cet aliment est retiré, le repas n'est pas nommé
//   items : [rôle, aliments possibles, options] ; options (facultatives) : fixed = quantité fixe en grammes,
//           min / max = limites de portion propres à ce repas (ex. 2 tranches de pain pour un sandwich),
//           first = prendre le premier aliment permis de la liste (ex. du lait, et la boisson de soya seulement sans lait)
const MILK = ['lait', 'boisson_soya'];
const CUP = 258; // 1 tasse (250 ml) de lait
export const TEMPLATES = [
  // --- Déjeuners ---
  { id: 'gruau', label: 'gruau protéiné au lait, fruits et noix', need: 'carb', slots: ['dej'], name: 'Gruau protéiné,', show: ['fruit', 'fat'], items: [
    ['carb', ['avoine', 'avoine_sg', 'creme_ble']], ['milk', MILK, { fixed: CUP, first: true }], ['protein', ['yogourt', 'whey', 'vegprot']],
    ['fruit', ['bleuets', 'fraises', 'framboises', 'banane', 'pomme', 'poire']], ['fat', ['amandes', 'grenoble', 'arachide', 'beurre_amande']]] },
  { id: 'oeufs_roties', label: 'œufs, rôties (ou bagel) et fruit', slots: ['dej'], name: 'Déjeuner', show: ['protein', 'carb', 'fruit'], items: [
    ['protein', ['oeufs']], ['carb', ['pain', 'muffin_anglais', 'bagel']],
    ['fruit', ['orange', 'banane', 'fraises', 'kiwi', 'pomme', 'cantaloup', 'melon_eau', 'raisins']], ['fat', ['avocat', 'beurre', 'cheddar']]] },
  { id: 'omelette', label: 'omelette aux légumes et fromage, rôties', need: 'protein', slots: ['dej'], name: 'Omelette', show: ['veg', 'fat', 'carb'], items: [
    ['protein', ['oeufs']], ['veg', ['epinards', 'champignons', 'poivron', 'tomates']], ['fat', ['cheddar', 'avocat']], ['carb', ['pain', 'muffin_anglais']]] },
  { id: 'bol_yogourt', label: 'bol de yogourt grec, céréales ou gruau, fruits et noix', slots: ['dej'], name: 'Bol de', show: ['protein', 'carb', 'fruit'], items: [
    ['protein', ['yogourt']], ['carb', ['cereales', 'avoine']],
    ['fruit', ['bleuets', 'fraises', 'framboises', 'mangue', 'banane', 'ananas']], ['fat', ['amandes', 'grenoble', 'arachide']]] },
  { id: 'smoothie', label: 'smoothie : lait, banane ou petits fruits, whey et beurre d’arachide', need: 'fruit', slots: ['dej'], name: 'Smoothie', show: ['fruit', 'protein', 'fat'], items: [
    ['fruit', ['banane', 'fraises', 'bleuets', 'mangue', 'framboises']], ['milk', MILK, { fixed: CUP, first: true }], ['protein', ['whey', 'vegprot', 'yogourt']],
    ['carb', ['avoine'], { max: 40 }], ['fat', ['arachide', 'beurre_amande']]] },
  { id: 'bagel_arachide', label: 'bagel au beurre d’arachide, yogourt ou shake et fruit', need: 'carb', slots: ['dej'], name: 'Bagel au', show: ['fat', 'protein', 'fruit'], items: [
    ['carb', ['bagel']], ['fat', ['arachide', 'beurre_amande']], ['protein', ['yogourt', 'whey', 'vegprot']], ['fruit', ['banane', 'pomme', 'fraises']]] },
  { id: 'cereales', label: 'bol de céréales et lait, yogourt grec et fruit', need: 'carb', slots: ['dej'], name: 'Céréales et lait,', show: ['protein', 'fruit'], items: [
    ['carb', ['cereales']], ['milk', MILK, { fixed: CUP, first: true }], ['protein', ['yogourt']], ['fruit', ['banane', 'bleuets', 'fraises']]] },
  { id: 'muffin_oeuf', label: 'muffin anglais œuf (ou jambon) et cheddar, fruit', need: 'carb', slots: ['dej'], name: 'Muffin anglais :', show: ['protein', 'fat', 'fruit'], items: [
    ['carb', ['muffin_anglais']], ['protein', ['oeufs', 'jambon']], ['fat', ['cheddar']], ['fruit', ['orange', 'pomme', 'kiwi']]] },
  // --- Dîners et soupers ---
  { id: 'sandwich', label: 'sandwich (jambon, dinde, poulet, thon ou œufs), fromage et crudités', need: 'carb', slots: ['din'], name: 'Sandwich', show: ['protein', 'fat'], items: [
    ['carb', ['pain'], { min: 70, max: 70 }], ['protein', ['jambon', 'dinde', 'poulet', 'thon', 'oeufs']],
    ['veg', ['salade', 'tomates', 'concombre', 'carottes']], ['fat', ['cheddar', 'mozza', 'avocat']]] },
  { id: 'pate_chinois', label: 'pâté chinois (bœuf haché, maïs, pommes de terre)', need: 'carb', slots: ['din', 'sou'], name: 'Pâté chinois', show: [], items: [
    ['protein', ['boeuf_maigre', 'boeuf', 'dinde_hachee']], ['veg', ['mais'], { fixed: 125 }], ['carb', ['patate']], ['fat', ['beurre']]] },
  { id: 'bol', label: 'bol protéine, riz ou quinoa et légumes', slots: ['din', 'sou'], name: 'Bol', show: ['protein', 'carb', 'veg'], items: [
    ['protein', ['poulet', 'cuisse_poulet', 'dinde', 'tofu', 'crevettes']], ['carb', ['riz', 'riz_brun', 'quinoa']],
    ['veg', ['brocoli', 'legumes', 'poivron', 'haricots', 'epinards']], ['fat', ['huile', 'huile_canola', 'avocat']]] },
  { id: 'assiette', label: 'assiette viande ou poisson, féculent et légumes', slots: ['din', 'sou'], name: 'Assiette', show: ['protein', 'carb', 'veg'], items: [
    ['protein', ['saumon', 'truite', 'morue', 'bifteck', 'porc', 'poulet', 'cuisse_poulet']], ['carb', ['patate', 'patate_douce', 'riz', 'riz_brun', 'quinoa', 'orge']],
    ['veg', ['asperges', 'brocoli', 'haricots', 'choux_bruxelles', 'carottes', 'salade', 'courgette']], ['fat', ['huile', 'beurre']]] },
  { id: 'spaghetti', label: 'spaghetti sauce à la viande', need: 'carb', slots: ['din', 'sou'], name: 'Spaghetti sauce', show: ['protein', 'veg'], items: [
    ['carb', ['pates', 'pates_sg']], ['protein', ['boeuf', 'boeuf_maigre', 'dinde_hachee']],
    ['veg', ['tomates', 'champignons', 'courgette', 'poivron']], ['fat', ['mozza', 'huile']]] },
  { id: 'chili', label: 'chili à la viande hachée ou aux haricots, avec riz', slots: ['din', 'sou'], name: 'Chili de', show: ['protein', 'veg', 'carb'], items: [
    ['protein', ['dinde_hachee', 'boeuf_maigre', 'boeuf', 'haricots_rouges', 'haricots_noirs']], ['veg', ['poivron', 'tomates']],
    ['carb', ['riz', 'riz_brun', 'mais']], ['fat', ['cheddar', 'avocat']]] },
  { id: 'wrap', label: 'wrap protéiné aux légumes', need: 'carb', slots: ['din', 'sou'], name: 'Wrap', show: ['protein', 'veg', 'fat'], items: [
    ['carb', ['tortilla']], ['protein', ['poulet', 'dinde', 'thon', 'jambon', 'oeufs']],
    ['veg', ['salade', 'epinards', 'tomates', 'concombre', 'poivron']], ['fat', ['avocat', 'hummus', 'cheddar', 'mozza']]] },
  { id: 'pita', label: 'pita garni (poulet ou pois chiches, hummus)', need: 'carb', slots: ['din', 'sou'], name: 'Pita garni', show: ['protein', 'veg', 'fat'], items: [
    ['carb', ['pita']], ['protein', ['poulet', 'pois_chiches', 'thon', 'dinde']],
    ['veg', ['concombre', 'tomates', 'salade', 'epinards']], ['fat', ['hummus', 'olives']]] },
  { id: 'saute', label: 'sauté de protéine et légumes, nouilles de riz ou riz', slots: ['din', 'sou'], name: 'Sauté', show: ['protein', 'veg', 'carb'], items: [
    ['protein', ['poulet', 'cuisse_poulet', 'bifteck', 'crevettes', 'tofu', 'porc']], ['veg', ['legumes', 'brocoli', 'poivron', 'champignons', 'pois_verts']],
    ['carb', ['nouilles_riz', 'riz', 'riz_brun']], ['fat', ['huile_canola', 'huile']]] },
  { id: 'salade_repas', label: 'salade-repas protéinée avec féculent', slots: ['din', 'sou'], name: 'Salade-repas', show: ['protein', 'carb', 'veg'], items: [
    ['protein', ['poulet', 'thon', 'saumon', 'oeufs', 'pois_chiches', 'crevettes', 'sardines']], ['carb', ['quinoa', 'couscous', 'orge', 'patate']],
    ['veg', ['salade', 'epinards', 'concombre', 'tomates', 'carottes']], ['fat', ['huile', 'avocat', 'olives', 'grenoble']]] },
  { id: 'mexicain', label: 'bol mexicain (viande hachée ou haricots noirs, riz ou maïs, avocat)', slots: ['din', 'sou'], name: 'Bol mexicain', show: ['protein', 'carb', 'veg'], items: [
    ['protein', ['dinde_hachee', 'boeuf', 'haricots_noirs', 'poulet', 'cuisse_poulet']], ['carb', ['riz', 'mais', 'riz_brun']],
    ['veg', ['poivron', 'tomates', 'salade']], ['fat', ['avocat', 'cheddar']]] },
  { id: 'curry', label: 'curry de poulet, tofu ou pois chiches avec riz', slots: ['din', 'sou'], name: 'Curry de', show: ['protein', 'veg', 'carb'], items: [
    ['protein', ['poulet', 'cuisse_poulet', 'tofu', 'pois_chiches']], ['veg', ['legumes', 'epinards', 'pois_verts']],
    ['carb', ['riz', 'riz_brun', 'pita']], ['fat', ['huile', 'huile_canola']]] },
  // --- Collations ---
  { id: 'yogourt_fruit', label: 'yogourt grec et fruits', slots: ['col'], name: '', show: ['protein', 'fruit'], items: [
    ['protein', ['yogourt']], ['fruit', ['bleuets', 'fraises', 'framboises', 'banane', 'mangue', 'ananas', 'kiwi']]] },
  { id: 'shake', label: 'shake protéiné et fruit', need: 'protein', slots: ['col'], name: 'Shake protéiné et', show: ['fruit'], items: [
    ['protein', ['whey', 'vegprot']], ['fruit', ['banane', 'pomme', 'poire', 'orange', 'raisins']]] },
  { id: 'ficelle_fruit', label: 'fromage ficelle et fruit', slots: ['col'], name: '', show: ['protein', 'fruit'], items: [
    ['protein', ['ficelle']], ['fruit', ['pomme', 'poire', 'raisins', 'orange', 'kiwi']]] },
  { id: 'oeufs_durs', label: 'œufs cuits durs et fruit', need: 'protein', slots: ['col'], name: 'Œufs cuits durs et', show: ['fruit'], items: [
    ['protein', ['oeufs']], ['fruit', ['pomme', 'orange', 'raisins', 'poire']]] },
  { id: 'galettes', label: 'galettes de riz, fromage ou yogourt et fruit', slots: ['col'], name: '', show: ['carb', 'protein', 'fruit'], items: [
    ['carb', ['galette_riz']], ['protein', ['ficelle', 'yogourt', 'whey']], ['fruit', ['pomme', 'banane', 'fraises']]] },
  { id: 'craquelins', label: 'craquelins, thon ou fromage et fruit', slots: ['col'], name: '', show: ['carb', 'protein', 'fruit'], items: [
    ['carb', ['craquelins']], ['protein', ['thon', 'ficelle']], ['fruit', ['raisins', 'pomme']]] },
  { id: 'roties_arachide', label: 'rôtie au beurre d’arachide et banane', need: 'carb', slots: ['col'], name: 'Rôtie au', show: ['fat', 'fruit'], items: [
    ['carb', ['pain'], { fixed: 35 }], ['fat', ['arachide', 'beurre_amande'], { fixed: 16 }], ['fruit', ['banane', 'pomme']]] },
  { id: 'cereales_col', label: 'céréales et lait', need: 'carb', slots: ['col'], name: 'Céréales et lait,', show: ['fruit'], items: [
    ['carb', ['cereales']], ['milk', MILK, { fixed: CUP, first: true }], ['fruit', ['banane', 'bleuets', 'fraises']]] },
  { id: 'apres_entrainement', label: 'lait au chocolat et banane après l’entraînement', need: 'carb', slots: ['col'], name: 'Après l’entraînement :', show: ['carb', 'fruit'], items: [
    ['carb', ['lait_choco']], ['fruit', ['banane']]] },
];
const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// Nom d'un repas calculé à partir de son modèle et des aliments vraiment servis (un aliment retiré n'est pas nommé).
const listFr = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}`);
export function mealName(meal, items) {
  if (meal.name) return meal.name; // repas composé à la demande (coach IA)
  const t = TEMPLATE_BY_ID[meal.tpl];
  if (!t) return '';
  const byRole = {};
  for (const it of items) if (it.g > 0 && !it.extra && !byRole[it.role]) byRole[it.role] = it.food.short || it.food.name.toLowerCase();
  if (t.need && !byRole[t.need]) return '';
  const txt = `${t.name} ${listFr(t.show.map((r) => byRole[r]).filter(Boolean))}`.replace(/\s+/g, ' ').replace(/[,:]\s*$/, '').trim();
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// Choisit un modèle pour un repas (différent de ceux déjà servis dans la journée si possible), puis un aliment par rôle
// (en évitant de répéter un aliment déjà utilisé ailleurs dans la journée). null si aucun modèle ne convient.
// Les légumineuses (pois chiches, haricots…) ont trop peu de protéines pour être la base d'un dîner ou d'un souper
// de quelqu'un qui mange de la viande ou du poisson : chez lui, le curry et le chili se font au poulet, au bœuf ou au tofu.
const VEGGIE_DIETS = ['vegetarien', 'vegetalien'];
// Aliment « de base » pour cette personne : ce que la plupart des gens achètent (common), plus le tofu et les
// légumineuses pour un végétarien, et le poisson pour un pescétarien (sinon ils n'auraient rien à manger au souper).
const isCommon = (f, prefs) => f.common || (VEGGIE_DIETS.includes(prefs.diet) && (f.legume || f.id === 'tofu' || f.id === 'vegprot'))
  || (prefs.diet === 'pescetarien' && f.animal === 'fish');
function pickFromTemplate(slot, prefs, rand, used, usedTpl, avoidTpl = null) {
  const main = !isSnack(slot) && slot !== 'dej';
  // strict : seulement les aliments de base. Si aucun repas n'est possible ainsi (restrictions), on prend tous les aliments.
  let strict = true;
  const options = (ids, role) => {
    const all = affordable(ids.map((id) => FOOD_BY_ID[id]).filter((f) => f && allowed(f, prefs) && (!strict || isCommon(f, prefs))), prefs);
    if (role !== 'protein' || !main || VEGGIE_DIETS.includes(prefs.diet)) return all;
    const noLegume = all.filter((f) => !f.legume);
    return noLegume.length ? noLegume : all;
  };
  const possible = () => TEMPLATES.filter((t) => t.slots.includes(slotKey(slot)) && t.items.every(([role, ids]) => options(ids, role).length));
  let ok = possible();
  if (!ok.length) { strict = false; ok = possible(); }
  const fresh = ok.filter((t) => !usedTpl.has(t.id) && t.id !== avoidTpl);
  const pool = fresh.length ? fresh : ok.filter((t) => t.id !== avoidTpl).length ? ok.filter((t) => t.id !== avoidTpl) : ok;
  if (!pool.length) return null;
  const t = pool[Math.floor(rand() * pool.length)];
  usedTpl.add(t.id);
  const items = t.items.map(([role, ids, opt = {}]) => {
    const all = options(ids, role);
    const freshFoods = all.filter((f) => !used.has(f.id));
    const food = opt.first ? all[0] : (freshFoods.length ? freshFoods : all)[Math.floor(rand() * (freshFoods.length || all.length))];
    used.add(food.id);
    return { role, food: food.id };
  });
  return { slot, tpl: t.id, items };
}

// Écart entre un plan de repas et les cibles de la journée (plus c'est petit, mieux c'est)
function dayError(T, choices, prefs) {
  const t = computeDay(T, choices, prefs).totals;
  // Les protéines sont un minimum : les rater coûte cher, les dépasser un peu (vraies portions de viande, féculents
  // riches en protéines sur une grosse cible) beaucoup moins.
  const dp = t.p / T.protein - 1;
  return Math.abs(t.k / T.calories - 1) * 2 + (dp < 0 ? -dp * 2 : dp * 0.5) + Math.abs(t.c / T.carbs - 1) + Math.abs(t.f / T.fat - 1);
}

// Choisit les aliments de chaque repas en respectant allergies, régime et aliments non aimés.
// Avec des cibles, on essaie 40 combinaisons et on garde celle qui colle le mieux.
export function buildChoices(prefs, seed = Date.now(), targets = null) {
  if (!targets) return pickChoices(prefs, seed);
  let best = null, bestErr = Infinity;
  for (let i = 0; i < 40; i++) {
    const c = pickChoices(prefs, seed + i * 104729);
    const e = dayError(targets, c, prefs);
    if (e < bestErr) { bestErr = e; best = c; }
  }
  return best;
}

function pickChoices(prefs, seed) {
  const rand = rng(seed);
  const used = new Set(), usedTpl = new Set();
  const meals = (MEAL_LAYOUT[prefs.meals] || MEAL_LAYOUT[4]).map(([slot]) => pickFromTemplate(slot, prefs, rand, used, usedTpl) || ({
    slot,
    items: ROLES[slot].map((role) => {
      const all = affordable(candidates(role, slot, prefs), prefs);
      if (!all.length) return null;
      const fresh = all.filter((f) => !used.has(f.id));
      const pool = fresh.length ? fresh : all;
      const food = pool[Math.floor(rand() * pool.length)];
      used.add(food.id);
      return { role, food: food.id };
    }).filter(Boolean),
  }));
  return { seed, meals };
}

// Un repas peut-il être remplacé par autre chose ? Regénère un seul repas.
export function rerollMeal(choices, slotIdx, prefs, targets = null) {
  const other = new Set(choices.meals.filter((_, i) => i !== slotIdx).flatMap((m) => m.items.map((i) => i.food)));
  const cur = choices.meals[slotIdx];
  const attempt = (seed) => {
    const rand = rng(seed);
    const fromTpl = pickFromTemplate(cur.slot, prefs, rand, new Set(other), new Set(), cur.tpl);
    if (fromTpl) return { ...choices, seed, meals: choices.meals.map((m, i) => (i === slotIdx ? fromTpl : m)) };
    const items = cur.items.map((it) => {
      const all = candidates(it.role, cur.slot, prefs).filter((f) => f.id !== it.food);
      if (!all.length) return it;
      const fresher = all.filter((f) => !other.has(f.id));
      const pool = fresher.length ? fresher : all;
      return { role: it.role, food: pool[Math.floor(rand() * pool.length)].id };
    });
    return { ...choices, seed, meals: choices.meals.map((m, i) => (i === slotIdx ? { ...m, items } : m)) };
  };
  const base = Date.now() + slotIdx;
  if (!targets) return attempt(base);
  let best = null, bestErr = Infinity;
  for (let i = 0; i < 20; i++) {
    const c = attempt(base + i * 7919);
    const e = dayError(targets, c, prefs);
    if (e < bestErr) { bestErr = e; best = c; }
  }
  return best;
}

// Aliments équivalents pour remplacer un élément d'un repas
export function equivalents(choices, slotIdx, itemIdx, prefs) {
  const meal = choices.meals[slotIdx];
  const it = meal.items[itemIdx];
  return candidates(it.role, meal.slot, prefs).filter((f) => f.id !== it.food);
}

// Remplace un aliment par un autre de la liste curatée (perd tout aliment personnalisé précédent à cette place).
export function swapItem(choices, slotIdx, itemIdx, foodId) {
  return {
    ...choices,
    meals: choices.meals.map((m, i) => (i !== slotIdx ? m : { ...m, items: m.items.map((it, j) => (j === itemIdx ? { role: it.role, food: foodId } : it)) })),
  };
}

// Remplace un aliment par un résultat de recherche externe (aliment « personnalisé », voir foods.js:externalFood).
export function swapItemCustom(choices, slotIdx, itemIdx, customFood) {
  return {
    ...choices,
    meals: choices.meals.map((m, i) => (i !== slotIdx ? m : { ...m, items: m.items.map((it, j) => (j === itemIdx ? { role: it.role, food: customFood.id, custom: customFood } : it)) })),
  };
}

const macrosOf = (food, g) => ({
  k: (food.per100.k * g) / 100, p: (food.per100.p * g) / 100, c: (food.per100.c * g) / 100, f: (food.per100.f * g) / 100,
});
const add = (a, b) => ({ k: a.k + b.k, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });
const ZERO = { k: 0, p: 0, c: 0, f: 0 };
const KEY = { protein: 'p', carb: 'c', fat: 'f' };

// Trouve les quantités (en grammes) pour atteindre les cibles du repas.
// « Une vraie portion ou rien » : un féculent (ou la protéine d'une collation) dont il ne faudrait qu'une miette
// est retiré plutôt que servi en quantité ridicule (ex. souper sans féculent en sèche, collation = un fruit).
// La protéine d'un repas principal, elle, garde toujours au moins sa portion minimale.
// L'aliment qui donne son nom au repas (need : l'avoine d'un gruau, les céréales de « céréales et lait »…) n'est jamais retiré.
const droppable = (it, snack) => !it.keep && (it.role === 'carb' || (snack && it.role === 'protein'));
function solve(items, target, keys, snack = false) {
  const q = items.map((it) => it.fixed ?? 0);
  const vars = items.map((it, i) => i).filter((i) => items[i].fixed == null);
  for (let iter = 0; iter < 14; iter++) {
    for (const i of vars) {
      const key = KEY[items[i].role];
      if (!keys.includes(key)) continue;
      const others = items.reduce((s, it, j) => (j === i ? s : s + (it.food.per100[key] * q[j]) / 100), 0);
      const per = items[i].food.per100[key] / 100;
      const raw = (target[key] - others) / per;
      const lo = minG(items[i].food, items[i]);
      q[i] = per <= 0 ? 0 : droppable(items[i], snack) && raw < lo / 2 ? 0 : Math.min(maxG(items[i].food, items[i].role, items[i]), Math.max(lo, raw));
    }
  }
  // Si les plafonds de portions laissent le repas sous sa cible de calories, on complète avec glucides puis lipides.
  if (target.k && keys.includes('c')) {
    const kcal = () => items.reduce((s, it, j) => s + (it.food.per100.k * q[j]) / 100, 0);
    let short = target.k - kcal();
    for (const role of ['carb', 'fat']) {
      const i = items.findIndex((it) => it.role === role);
      if (i < 0 || short < 40 || (q[i] === 0 && droppable(items[i], snack))) continue; // un féculent retiré le reste
      const kpg = items[i].food.per100.k / 100;
      const room = maxG(items[i].food, items[i].role, items[i]) - q[i];
      const add = Math.max(0, Math.min(room, short / kpg));
      q[i] += add;
      short -= add * kpg;
    }
  }
  return q;
}

// Arrondit à une quantité pratique (œufs entiers, cuillères, 5 g…)
function practical(food, g, role) {
  const u = food.unit;
  if (g <= 0 && role !== 'fruit' && role !== 'veg') return { g: 0 }; // aliment retiré du repas
  // Si la cible de lipides est déjà atteinte, on n'ajoute pas de portion minimale de gras
  if (role === 'fat' && g < 3) return { g: 0 };
  if (role === 'fruit' || role === 'veg') {
    if (u) return { units: Math.max(1, Math.round(g / u.g)), g: Math.max(1, Math.round(g / u.g)) * u.g };
    return { g: Math.max(50, Math.round(g / 10) * 10) };
  }
  if (u) {
    const whole = u.whole || u.g <= 5;
    const units = whole ? Math.max(1, Math.round(g / u.g)) : Math.max(0.5, Math.round((g / u.g) * 2) / 2);
    return { units, g: units * u.g };
  }
  return { g: Math.max(5, Math.round(g / 5) * 5) };
}

// « 1 ¾ tasse » : au quart de tasse près, plus parlant que des grammes pour des raisins ou des petits fruits.
const FRACTIONS = ['', ' ¼', ' ½', ' ¾'];
function cupsText(g, cup) {
  const q = Math.max(1, Math.round((g / cup) * 4));
  const whole = Math.floor(q / 4), frac = FRACTIONS[q % 4];
  const n = whole ? `${whole}${frac}` : frac.trim();
  return `${n} tasse${q >= 8 ? 's' : ''}`; // « 1 ¾ tasse » : singulier sous 2
}

export function qtyText(item) {
  const f = item.food;
  if (!item.g) return '0 g';
  if (item.units == null && f.cup) return `${item.g} g (≈ ${cupsText(item.g, f.cup)})`;
  if (item.units != null) {
    const label = item.units > 1 ? f.unit.p : f.unit.n;
    const shown = Number.isInteger(item.units) ? item.units : String(item.units).replace('.', ',');
    if (f.liquid) return `${shown} ${label}`; // « 1 tasse (250 ml) », sans les grammes
    return `${shown} ${label} (${Math.round(item.g)} g)`;
  }
  return `${item.g} g`;
}

// Calcule les repas complets (quantités + macros) pour des cibles données.
export function computeDay(targets, choices, prefs = {}) {
  const day = { k: targets.calories, p: targets.protein, c: targets.carbs, f: targets.fat };
  const dayK = targets.calories;
  const layout = MEAL_LAYOUT[choices.meals.length] || MEAL_LAYOUT[4];
  const share = (slot) => layout.find(([s]) => s === slot)[1];

  const build = (meal, T, keys) => {
    // Si un aliment choisi a depuis été retiré de la liste (mise à jour de l'app), on l'ignore plutôt que
    // de faire planter l'affichage : le repas se recalcule avec ce qu'il reste, quitte à être un peu à côté
    // jusqu'à ce que la personne touche « Autre repas » ou change ses préférences.
    const tplItems = TEMPLATE_BY_ID[meal.tpl]?.items || [];
    const items = meal.items.map((it) => {
      const food = resolveFood(it.food, it.custom);
      if (!food) return null;
      const opt = tplItems.find(([role]) => role === it.role)?.[2] || {};
      let fixed = opt.fixed ?? null;
      if (fixed == null && it.role === 'veg') fixed = VEG_GRAMS;
      if (fixed == null && it.role === 'fruit') fixed = food.unit ? food.unit.g : 100;
      if (fixed == null && it.role === 'milk') fixed = CUP;
      return { role: it.role, food, fixed, min: opt.min, max: opt.max, keep: TEMPLATE_BY_ID[meal.tpl]?.need === it.role };
    }).filter(Boolean);
    const q = solve(items, T, keys, isSnack(meal.slot));
    const built = items.map((it, i) => {
      const p = practical(it.food, q[i], it.role);
      return { role: it.role, food: it.food, g: p.g, units: p.units ?? null, macros: macrosOf(it.food, p.g), min: it.min, max: it.max, fixed: it.fixed != null };
    });
    // Si un aliment plafonne (ex. pois chiches) et qu'il manque des protéines, on ajoute un complément protéiné.
    if (keys.includes('p')) {
      const short = T.p - built.reduce((s, it) => s + it.macros.p, 0);
      if (short > 10 && short > T.p * 0.15) {
        const sup = FOODS.find((f) => f.supplement && f.slots.includes(slotKey(meal.slot)) && allowed(f, prefs) && !built.some((b) => b.food.id === f.id));
        if (sup) {
          const g = Math.min(sup.max, Math.max(minG(sup) || 15, (short / sup.per100.p) * 100));
          const p = practical(sup, g, 'protein');
          built.push({ role: 'protein', extra: true, food: sup, g: p.g, units: p.units ?? null, macros: macrosOf(sup, p.g) });
        }
      }
    }
    return built;
  };
  const total = (items) => items.reduce((s, it) => add(s, it.macros), ZERO);

  const out = new Array(choices.meals.length);
  // 1) Collations : elles apportent surtout des protéines + un fruit
  let used = ZERO;
  choices.meals.forEach((meal, i) => {
    if (!isSnack(meal.slot)) return;
    const s = share(meal.slot);
    const keys = meal.items.some((it) => it.role === 'carb') ? ['p', 'c'] : ['p'];
    const items = build(meal, { p: day.p * s, c: day.c * s, f: day.f * s }, keys);
    out[i] = { slot: meal.slot, tpl: meal.tpl, name: meal.name, items, totals: total(items) };
    used = add(used, out[i].totals);
  });
  // 2) Repas principaux : se partagent ce qui reste de la journée
  const mainShare = choices.meals.reduce((s, m) => (isSnack(m.slot) ? s : s + share(m.slot)), 0);
  const rest = { k: Math.max(0, dayK - used.k), p: Math.max(0, day.p - used.p), c: Math.max(0, day.c - used.c), f: Math.max(0, day.f - used.f) };
  choices.meals.forEach((meal, i) => {
    if (isSnack(meal.slot)) return;
    const r = share(meal.slot) / mainShare;
    const items = build(meal, { k: rest.k * r, p: rest.p * r, c: rest.c * r, f: rest.f * r }, ['p', 'c', 'f']);
    out[i] = { slot: meal.slot, tpl: meal.tpl, name: meal.name, items, totals: total(items) };
  });
  finishDay(out, targets, prefs);
  // crowded : il a fallu ajouter un aliment de plus à un repas pour atteindre la cible (portions à l'étroit)
  return { meals: out, totals: out.reduce((s, m) => add(s, m.totals), ZERO), crowded: !!out.crowded };
}

// Dernière retouche : ajuste UN aliment à quantité continue par macro (protéines, glucides, lipides)
// pour que le total du jour colle à quelques grammes près à la cible exacte (ex. « 200 g de protéines »),
// même après un échange d'aliment ou un changement de cible. Ignore les aliments à unité entière
// (œufs, tranches de pain…) pour ne pas afficher des quantités bizarres comme « 2,3 œufs ».
// Sur une très grosse cible (ex. prise de masse), même les aliments à leur plafond peuvent ne pas suffire :
// dans ce cas on ajoute carrément un aliment de plus, plutôt que de laisser un écart.
const ROLE_OF_MACRO = { p: 'protein', c: 'carb', f: 'fat' };
const TARGET_KEY = { p: 'protein', c: 'carbs', f: 'fat' };
function finishDay(mealsOut, targets, prefs = {}) {
  for (const key of ['p', 'c', 'f']) {
    let residual = targets[TARGET_KEY[key]] - mealsOut.reduce((s, m) => add(s, m.totals), ZERO)[key];
    if (Math.abs(residual) < 1.5) continue;
    // Protéines en trop : on laisse faire (c'est un minimum). Les réduire vidait la viande d'un repas pour compenser
    // les protéines du riz ou de l'avoine ailleurs (ex. dîner à 26 g de protéines).
    if (key === 'p' && residual < 0) continue;
    // Tous les aliments ajustables (quantité continue) pour ce macro, du plus de marge au moins de marge :
    // si un seul ne suffit pas à absorber l'écart (plafond atteint), on complète avec le suivant.
    // Glucides en trop peu : on grossit d'abord les fruits (1 fruit de plus au déjeuner ou en collation, c'est
    // plus naturel qu'un 2e féculent dans l'assiette), puis les féculents.
    const roles = key === 'c' && residual > 0 ? ['fruit', 'carb'] : [ROLE_OF_MACRO[key]];
    const candidates = [];
    for (const m of mealsOut) for (const it of m.items) {
      if (!roles.includes(it.role) || it.extra || (it.fixed && it.role !== 'fruit') || it.g <= 0 || (it.food.unit && it.food.unit.whole && it.role !== 'fruit')) continue;
      const room = residual > 0 ? maxG(it.food, it.role, it) - it.g : it.g - minG(it.food, it);
      if (room > 3) candidates.push({ meal: m, item: it });
    }
    const rank = (c) => roles.indexOf(c.item.role) * 10000 - (residual > 0 ? maxG(c.item.food, c.item.role, c.item) - c.item.g : c.item.g);
    candidates.sort((a, b) => rank(a) - rank(b));
    for (const { meal, item } of candidates) {
      if (Math.abs(residual) < 1.5) break;
      const per = item.food.per100[key] / 100;
      if (per <= 0) continue;
      const room = residual > 0 ? maxG(item.food, item.role, item) - item.g : item.g - minG(item.food, item);
      const deltaG = Math.max(-room, Math.min(room, residual / per));
      const before = item.macros[key];
      const p = practical(item.food, item.g + deltaG, item.role);
      Object.assign(item, { g: p.g, units: p.units ?? null, macros: macrosOf(item.food, p.g) });
      meal.totals = meal.items.reduce((s, x) => add(s, x.macros), ZERO);
      residual -= item.macros[key] - before;
    }
    // Tout est déjà à son plafond mais il manque encore beaucoup : ajoute un aliment de plus.
    // Il est ajouté à un repas où il a sa place (pas d'avoine au souper), de préférence un repas qui n'a pas déjà
    // reçu un ajout du même type, d'abord une collation (plutôt que d'alourdir une assiette), puis le plus petit repas.
    while (residual > 30) {
      const used = new Set(mealsOut.flatMap((m) => m.items.map((it) => it.food.id)));
      const hasExtra = (m) => m.items.some((i) => i.extra && i.role === ROLE_OF_MACRO[key]);
      const order = [...mealsOut].sort((a, b) => (hasExtra(a) - hasExtra(b))
        || (isSnack(b.slot) - isSnack(a.slot)) || a.totals.k - b.totals.k);
      let meal = null, extra = null;
      // 1er essai : un aliment de base qui a sa place à ce repas (ex. une tranche de pain à côté de l'assiette) ;
      // sinon, un aliment du modèle du repas, même moins courant.
      for (const common of [true, false]) {
        for (const m of order) {
          const tpl = TEMPLATE_BY_ID[m.tpl];
          const fromTpl = tpl && !isSnack(m.slot) ? new Set(tpl.items.filter(([r]) => r === ROLE_OF_MACRO[key]).flatMap(([, ids]) => ids)) : null;
          extra = FOODS.find((f) => f.role === ROLE_OF_MACRO[key] && !f.supplement && allowed(f, prefs) && !used.has(f.id)
            && (common ? isCommon(f, prefs) && f.slots.includes(slotKey(m.slot)) : (fromTpl ? fromTpl.has(f.id) : f.slots.includes(slotKey(m.slot)))));
          if (extra) { meal = m; break; }
        }
        if (extra) break;
      }
      if (!extra) break; // plus aucun aliment disponible pour ce macro dans les restrictions actuelles
      const per = extra.per100[key] / 100;
      const g = Math.max(minG(extra), Math.min(extra.max ?? 300, residual / per));
      const p = practical(extra, g, ROLE_OF_MACRO[key]);
      const macros = macrosOf(extra, p.g);
      meal.items.push({ role: ROLE_OF_MACRO[key], extra: true, food: extra, g: p.g, units: p.units ?? null, macros });
      mealsOut.crowded = true; // la cible déborde des repas prévus : l'app conseillera d'ajouter des repas
      meal.totals = add(meal.totals, macros);
      residual -= macros[key];
    }
  }
  // Dernier ajustement : les calories d'un aliment (comme sur un vrai emballage) ne suivent pas toujours
  // exactement « 4 kcal/g de protéines et glucides, 9 kcal/g de lipides » (fibres, arrondis…). Même avec des
  // protéines/glucides/lipides déjà justes, ce petit écart par aliment s'accumule sur toute la journée.
  // On comble ce qui reste via un aliment gras ou glucidique (leur variation en grammes reste minime).
  let kResidual = targets.calories - mealsOut.reduce((s, m) => add(s, m.totals), ZERO).k;
  for (const role of ['fat', 'carb', 'protein']) {
    if (Math.abs(kResidual) < 15) break;
    const candidates = [];
    for (const m of mealsOut) for (const it of m.items) {
      if (it.role !== role || it.fixed || it.g <= 0 || (it.food.unit && it.food.unit.whole)) continue;
      const room = kResidual > 0 ? maxG(it.food, it.role, it) - it.g : it.g - minG(it.food, it);
      if (room > 2) candidates.push({ meal: m, item: it });
    }
    candidates.sort((a, b) => (kResidual > 0 ? maxG(b.item.food, b.item.role, b.item) - b.item.g - (maxG(a.item.food, a.item.role, a.item) - a.item.g) : b.item.g - a.item.g));
    for (const { meal, item } of candidates) {
      if (Math.abs(kResidual) < 15) break;
      const per = item.food.per100.k / 100;
      if (per <= 0) continue;
      const room = kResidual > 0 ? maxG(item.food, item.role, item) - item.g : item.g - minG(item.food, item);
      const deltaG = Math.max(-room, Math.min(room, kResidual / per));
      const beforeK = item.macros.k;
      const p = practical(item.food, item.g + deltaG, item.role);
      Object.assign(item, { g: p.g, units: p.units ?? null, macros: macrosOf(item.food, p.g) });
      meal.totals = meal.items.reduce((s, x) => add(s, x.macros), ZERO);
      kResidual -= item.macros.k - beforeK;
    }
  }
}

// Liste d'épicerie pour N jours
export function groceryList(computed, days = 7) {
  const acc = {};
  computed.meals.forEach((m) => m.items.filter((it) => it.g > 0).forEach((it) => {
    acc[it.food.id] = acc[it.food.id] || { food: it.food, g: 0 };
    acc[it.food.id].g += it.g * days;
  }));
  return Object.values(acc).map(({ food, g }) => {
    if (food.liquid) return { name: food.name, text: `${String(Math.round(g / 250) / 4).replace('.', ',')} L`, brands: food.brands };
    if (food.id === 'avocat') return { name: food.name, text: `${Math.ceil(g / 150)} ×`, brands: food.brands };
    if (food.unit && food.unit.whole && food.unit.g > 5) return { name: food.name, text: `${Math.round(g / food.unit.g)} ×`, brands: food.brands };
    if (food.external) return { name: food.name, text: `≈ ${Math.round(g / 50) * 50} g`, brands: food.brands };
    const r = Math.round(g / 50) * 50;
    return { name: food.name, text: r >= 1000 ? `${String(r / 1000).replace('.', ',')} kg` : `${r} g`, brands: food.brands };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
