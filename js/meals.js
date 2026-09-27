// Génère un vrai plan de repas à partir de tes cibles (calories, protéines, glucides, lipides).
// On mémorise seulement les CHOIX d'aliments (« choices ») ; les quantités sont recalculées à chaque affichage,
// donc quand le coach change tes calories après un check-in, tes repas s'ajustent automatiquement.
import { FOODS, FOOD_BY_ID, allowed, resolveFood } from './foods.js';

export const SLOT_NAMES = { dej: 'Déjeuner', din: 'Dîner', col: 'Collation', col2: 'Collation', sou: 'Souper' };

// [repas, part de la journée]
export const MEAL_LAYOUT = {
  3: [['dej', 0.30], ['din', 0.35], ['sou', 0.35]],
  4: [['dej', 0.27], ['din', 0.30], ['col', 0.13], ['sou', 0.30]],
  5: [['dej', 0.25], ['col', 0.10], ['din', 0.28], ['col2', 0.10], ['sou', 0.27]],
};
// Ce qu'il y a dans chaque repas (les collations sont plus légères)
const ROLES = {
  dej: ['protein', 'carb', 'fruit', 'fat'],
  din: ['protein', 'carb', 'veg', 'fat'],
  sou: ['protein', 'carb', 'veg', 'fat'],
  col: ['protein', 'fruit'],
  col2: ['protein', 'fruit'],
};
const isSnack = (slot) => slot === 'col' || slot === 'col2';
const slotKey = (slot) => (slot === 'col2' ? 'col' : slot);
export const ROLE_NAMES = { protein: 'Protéines', carb: 'Glucides', fat: 'Lipides', fruit: 'Fruit', veg: 'Légumes' };
const VEG_GRAMS = 150;

function rng(seed) { // petit générateur aléatoire reproductible
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const candidates = (role, slot, prefs) => FOODS.filter((f) => f.role === role && f.slots.includes(slotKey(slot)) && allowed(f, prefs));

// Écart entre un plan de repas et les cibles de la journée (plus c'est petit, mieux c'est)
function dayError(T, choices, prefs) {
  const t = computeDay(T, choices, prefs).totals;
  return Math.abs(t.k / T.calories - 1) * 2 + Math.abs(t.p / T.protein - 1) * 2 + Math.abs(t.c / T.carbs - 1) + Math.abs(t.f / T.fat - 1);
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
  const used = new Set();
  const meals = (MEAL_LAYOUT[prefs.meals] || MEAL_LAYOUT[4]).map(([slot]) => ({
    slot,
    items: ROLES[slot].map((role) => {
      const all = candidates(role, slot, prefs);
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
function solve(items, target, keys) {
  const q = items.map((it) => it.fixed ?? 0);
  const vars = items.map((it, i) => i).filter((i) => items[i].fixed == null);
  for (let iter = 0; iter < 14; iter++) {
    for (const i of vars) {
      const key = KEY[items[i].role];
      if (!keys.includes(key)) continue;
      const others = items.reduce((s, it, j) => (j === i ? s : s + (it.food.per100[key] * q[j]) / 100), 0);
      const per = items[i].food.per100[key] / 100;
      q[i] = per > 0 ? Math.min(items[i].food.max ?? 600, Math.max(0, (target[key] - others) / per)) : 0;
    }
  }
  // Si les plafonds de portions laissent le repas sous sa cible de calories, on complète avec glucides puis lipides.
  if (target.k && keys.includes('c')) {
    const kcal = () => items.reduce((s, it, j) => s + (it.food.per100.k * q[j]) / 100, 0);
    let short = target.k - kcal();
    for (const role of ['carb', 'fat']) {
      const i = items.findIndex((it) => it.role === role);
      if (i < 0 || short < 40) continue;
      const kpg = items[i].food.per100.k / 100;
      const room = (items[i].food.max ?? 600) - q[i];
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

export function qtyText(item) {
  const f = item.food;
  if (!item.g) return '0 g';
  if (item.units != null) {
    const label = item.units > 1 ? f.unit.p : f.unit.n;
    const shown = Number.isInteger(item.units) ? item.units : String(item.units).replace('.', ',');
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
    const items = meal.items.map((it) => {
      const food = resolveFood(it.food, it.custom);
      let fixed = null;
      if (it.role === 'veg') fixed = VEG_GRAMS;
      if (it.role === 'fruit') fixed = food.unit ? food.unit.g : 100;
      return { role: it.role, food, fixed };
    });
    const q = solve(items, T, keys);
    const built = items.map((it, i) => {
      const p = practical(it.food, q[i], it.role);
      return { role: it.role, food: it.food, g: p.g, units: p.units ?? null, macros: macrosOf(it.food, p.g) };
    });
    // Si un aliment plafonne (ex. lentilles) et qu'il manque des protéines, on ajoute un complément protéiné.
    if (keys.includes('p')) {
      const short = T.p - built.reduce((s, it) => s + it.macros.p, 0);
      if (short > 10 && short > T.p * 0.15) {
        const sup = FOODS.find((f) => f.supplement && allowed(f, prefs) && !built.some((b) => b.food.id === f.id));
        if (sup) {
          const g = Math.min(sup.max, Math.max(15, (short / sup.per100.p) * 100));
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
    const items = build(meal, { p: day.p * s, c: day.c * s, f: day.f * s }, ['p']);
    out[i] = { slot: meal.slot, items, totals: total(items) };
    used = add(used, out[i].totals);
  });
  // 2) Repas principaux : se partagent ce qui reste de la journée
  const mainShare = choices.meals.reduce((s, m) => (isSnack(m.slot) ? s : s + share(m.slot)), 0);
  const rest = { k: Math.max(0, dayK - used.k), p: Math.max(0, day.p - used.p), c: Math.max(0, day.c - used.c), f: Math.max(0, day.f - used.f) };
  choices.meals.forEach((meal, i) => {
    if (isSnack(meal.slot)) return;
    const r = share(meal.slot) / mainShare;
    const items = build(meal, { k: rest.k * r, p: rest.p * r, c: rest.c * r, f: rest.f * r }, ['p', 'c', 'f']);
    out[i] = { slot: meal.slot, items, totals: total(items) };
  });
  finishDay(out, targets);
  return { meals: out, totals: out.reduce((s, m) => add(s, m.totals), ZERO) };
}

// Dernière retouche : ajuste UN aliment à quantité continue par macro (protéines, glucides, lipides)
// pour que le total du jour colle à quelques grammes près à la cible exacte (ex. « 200 g de protéines »),
// même après un échange d'aliment ou un changement de cible. Ignore les aliments à unité entière
// (œufs, tranches de pain…) pour ne pas afficher des quantités bizarres comme « 2,3 œufs ».
const ROLE_OF_MACRO = { p: 'protein', c: 'carb', f: 'fat' };
const TARGET_KEY = { p: 'protein', c: 'carbs', f: 'fat' };
function finishDay(mealsOut, targets) {
  for (const key of ['p', 'c', 'f']) {
    let residual = targets[TARGET_KEY[key]] - mealsOut.reduce((s, m) => add(s, m.totals), ZERO)[key];
    if (Math.abs(residual) < 1.5) continue;
    // Tous les aliments ajustables (quantité continue) pour ce macro, du plus de marge au moins de marge :
    // si un seul ne suffit pas à absorber l'écart (plafond atteint), on complète avec le suivant.
    const candidates = [];
    for (const m of mealsOut) for (const it of m.items) {
      if (it.role !== ROLE_OF_MACRO[key] || (it.food.unit && it.food.unit.whole)) continue;
      const room = residual > 0 ? (it.food.max ?? 600) - it.g : it.g;
      if (room > 3) candidates.push({ meal: m, item: it });
    }
    candidates.sort((a, b) => (residual > 0 ? (b.item.food.max ?? 600) - b.item.g - ((a.item.food.max ?? 600) - a.item.g) : b.item.g - a.item.g));
    for (const { meal, item } of candidates) {
      if (Math.abs(residual) < 1.5) break;
      const per = item.food.per100[key] / 100;
      if (per <= 0) continue;
      const room = residual > 0 ? (item.food.max ?? 600) - item.g : item.g;
      const deltaG = Math.max(-room, Math.min(room, residual / per));
      const before = item.macros[key];
      const p = practical(item.food, item.g + deltaG, item.role);
      Object.assign(item, { g: p.g, units: p.units ?? null, macros: macrosOf(item.food, p.g) });
      meal.totals = meal.items.reduce((s, x) => add(s, x.macros), ZERO);
      residual -= item.macros[key] - before;
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
    if (food.id === 'avocat') return { name: food.name, text: `${Math.ceil(g / 150)} ×`, brands: food.brands };
    if (food.unit && food.unit.whole && food.unit.g > 5) return { name: food.name, text: `${Math.round(g / food.unit.g)} ×`, brands: food.brands };
    if (food.external) return { name: food.name, text: `≈ ${Math.round(g / 50) * 50} g`, brands: food.brands };
    const r = Math.round(g / 50) * 50;
    return { name: food.name, text: r >= 1000 ? `${String(r / 1000).replace('.', ',')} kg` : `${r} g`, brands: food.brands };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
