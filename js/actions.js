// Changements que le coach IA peut proposer dans le chat. Il termine sa réponse par un bloc ```actions [...]```,
// l'app vérifie chaque action (valeurs sûres, exercices qui existent, matériel compatible) et n'applique RIEN
// tant que la personne n'a pas touché « Appliquer ». Ce fichier ne touche pas à la base : il calcule le nouveau
// profil et le nouveau plan, et app.js les enregistre (avec un « Annuler » possible).
import { EXERCISES, buildProgram } from './data.js';
import { ALLERGENS, DIETS, EXTRA_ALLERGIES, otherAllergyLabel } from './foods.js';
import { calcTargets } from './rules.js';

const GOALS = { lose: 'perdre du gras', maintain: 'maintenir', gain: 'prendre du muscle' };
const ACTIVITY = { low: 'surtout assis', medium: 'assez actif', high: 'très actif' };
const STYLES = { strength: 'force', hypertrophy: 'hypertrophie', endurance: 'endurance musculaire' };
const BUDGETS = { serre: 'serré', normal: 'normal', genereux: 'généreux' };
const TYPE_NAMES = {
  targets: 'Cibles', food_prefs: 'Alimentation', reroll_meal: 'Nouveau repas', swap_exercise: 'Remplacer un exercice',
  set_sets_reps: 'Séries et répétitions', add_exercise: 'Ajouter un exercice', remove_exercise: 'Retirer un exercice',
  profile: 'Profil', weight_unit: 'Unité de poids',
};

// Mode d'emploi donné à l'IA (dans le contexte du chat seulement).
export const ACTIONS_DOC = `IMPORTANT : tu peux maintenant faire toi-même des changements dans l'application. Quand la personne demande un changement de la liste ci-dessous (ou accepte ta suggestion), ne lui explique PAS où toucher : fais la proposition toi-même. Décris-la en une phrase dans ta réponse, puis termine par un bloc de code « actions » contenant une liste JSON, par exemple :
\`\`\`actions
[{"type": "swap_exercise", "from": "squat", "to": "legpress"}]
\`\`\`
La personne voit alors un bouton « Appliquer » : rien ne change sans son accord, donc ne dis pas que c'est déjà fait. Propose un bloc seulement quand elle demande un changement ou accepte ta suggestion ; si tu n'es pas sûr de ce qu'elle veut, pose d'abord la question. Pas de bloc si tu ne proposes rien.
Types possibles (utilise seulement les identifiants fournis dans les données) :
- {"type": "targets", "protein": g, "carbs": g, "fat": g, "water": litres (optionnel)} : cibles moyennes de la semaine ; calories = 4×protéines + 4×glucides + 9×lipides, jamais sous metabolisme_de_base_kcal. Pour changer seulement les calories : {"type": "targets", "calories": kcal} (les glucides s'ajustent, protéines et lipides gardés).
- {"type": "food_prefs", "diet", "allergies", "other_allergies", "dislikes", "meals", "budget"} : mets seulement les champs à changer (la liste complète pour allergies / other_allergies) ; diet parmi ${Object.keys(DIETS).join(', ')} ; allergies parmi ${Object.keys(ALLERGENS).join(', ')} ; other_allergies : autres allergies (clés ${Object.keys(EXTRA_ALLERGIES).join(', ')} ou nom d'aliment) ; dislikes : texte séparé par des virgules ; meals 3 à 6 ; budget serre, normal ou genereux. Les repas sont recréés.
- {"type": "reroll_meal", "meal": n} : refait le repas numéro n (1 = premier repas de la journée).
- {"type": "swap_exercise", "from": id, "to": id} : remplace un exercice partout dans le programme (to parmi exercices_disponibles).
- {"type": "set_sets_reps", "day": "nom du jour", "exercise": id, "sets": n, "reps_min": n, "reps_max": n}
- {"type": "add_exercise", "day": "nom du jour", "exercise": id, "sets": n, "reps_min": n, "reps_max": n}
- {"type": "remove_exercise", "day": "nom du jour", "exercise": id}
- {"type": "profile", "goal": "lose|maintain|gain", "activity": "low|medium|high", "days_per_week": 2 à 6, "equipment": "gym|home", "training_style": "strength|hypertrophy|endurance", "goal_weight_kg": n, "goal_date": "AAAA-MM-JJ"} : seulement les champs à changer. Changer jours, matériel ou type d'entraînement recrée TOUT le programme (préviens la personne) ; changer objectif ou activité recalcule les cibles.
- {"type": "weight_unit", "unit": "kg|lb"}
Tu ne peux pas supprimer de données, faire un check-in, ni gérer le compte ou les amis : pour ça, explique où toucher.`;

// Sépare le texte affiché du bloc d'actions. Un bloc illisible est ignoré (le texte reste affiché).
export function splitActions(text) {
  const re = /```actions\s*([\s\S]*?)```/i;
  const m = String(text).match(re);
  if (!m) return { text: String(text).trim(), actions: [] };
  let actions = [];
  try { const j = JSON.parse(m[1].trim()); actions = (Array.isArray(j) ? j : [j]).filter((a) => a && typeof a.type === 'string').slice(0, 8); } catch { /* bloc illisible */ }
  return { text: String(text).replace(re, '').trim(), actions };
}

// Nouvelles calories en gardant protéines et lipides : les glucides comblent la différence (lipides réduits,
// jamais sous 20 g, seulement s'il n'y a plus de glucides à enlever). Partagé avec « Modifier mes cibles ».
export function carbsForCalories(kcal, protein, fat) {
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  if (carbs < 0) { carbs = 0; fat = Math.max(20, Math.floor((kcal - protein * 4) / 9)); }
  return { carbs, fat };
}

const n = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
const within = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const lc = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const exName = (id, program) => EXERCISES[id]?.name || program.flatMap((d) => d.exercises).find((e) => e.id === id)?.custom?.name || id;

// Retrouve un exercice du catalogue ou du programme (id exact, sinon par nom).
function findEx(ref, program) {
  if (EXERCISES[ref] || program.some((d) => d.exercises.some((e) => e.id === ref))) return ref;
  const r = lc(ref);
  const cat = Object.entries(EXERCISES).find(([, e]) => lc(e.name) === r);
  if (cat) return cat[0];
  return program.flatMap((d) => d.exercises).find((e) => lc(e.custom?.name) === r)?.id || null;
}
function findDay(ref, program) {
  const i = program.findIndex((d) => lc(d.label) === lc(ref));
  if (i >= 0) return i;
  const k = Number(ref);
  return Number.isInteger(k) && k >= 1 && k <= program.length ? k - 1 : -1;
}

// Applique UNE action sur une copie de travail st = { profile, plan, prefs, weight, bmr }.
// Renvoie le libellé à montrer, ou lance une erreur (en français) si l'action est refusée.
function applyOne(a, st) {
  const { plan } = st;
  switch (a.type) {
    case 'targets': {
      // Calories seules (ex. « mets-moi à 2700 kcal ») : protéines et lipides gardés sauf indication, glucides ajustés.
      if (a.calories !== undefined && a.carbs === undefined) {
        const k = Math.round(n(a.calories));
        if (!within(k, 800, 6000)) throw new Error('calories hors limites (800 à 6000)');
        const keep = { protein: a.protein ?? plan.protein, fat: a.fat ?? plan.fat };
        a = { ...a, ...keep, ...carbsForCalories(k, n(keep.protein), n(keep.fat)) }; // copie : l'action d'origine reste intacte
      }
      const p = Math.round(n(a.protein)), c = Math.round(n(a.carbs)), f = Math.round(n(a.fat));
      if (!within(p, 40, 400) || !within(c, 0, 700) || !within(f, 20, 250)) throw new Error('valeurs de cibles hors limites');
      if (p < st.weight * 1.2 || p > st.weight * 3.3) throw new Error(`protéines hors d'une zone sûre (${Math.round(st.weight * 1.2)} à ${Math.round(st.weight * 3.3)} g)`);
      const kcal = p * 4 + c * 4 + f * 9;
      if (kcal < st.bmr) throw new Error(`${kcal} kcal : sous ton métabolisme de base (${st.bmr} kcal)`);
      Object.assign(plan, { protein: p, carbs: c, fat: f, calories: kcal });
      st.targets = true;
      let label = `Cibles : ${kcal} kcal · P ${p} g · G ${c} g · L ${f} g`;
      if (a.water !== undefined) {
        const w = Math.round(n(a.water) * 10) / 10;
        if (!within(w, 1, 8)) throw new Error('eau hors limites (1 à 8 L)');
        st.prefs.water = w; st.profileChanged = true;
        label += ` · eau ${String(w).replace('.', ',')} L`;
      }
      return label;
    }
    case 'food_prefs': {
      const parts = [];
      if (a.diet !== undefined) {
        if (!DIETS[a.diet]) throw new Error(`régime inconnu « ${a.diet} »`);
        st.prefs.diet = a.diet; parts.push(`régime ${DIETS[a.diet].toLowerCase()}`);
      }
      if (a.allergies !== undefined) {
        const list = (Array.isArray(a.allergies) ? a.allergies : []).filter((x) => ALLERGENS[x]);
        st.prefs.allergies = list; parts.push(`allergies : ${list.map((x) => ALLERGENS[x]).join(', ') || 'aucune'}`);
      }
      if (a.other_allergies !== undefined) {
        const list = (Array.isArray(a.other_allergies) ? a.other_allergies : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 40)).slice(0, 15);
        st.prefs.other_allergies = list; parts.push(`autres allergies : ${list.map(otherAllergyLabel).join(', ') || 'aucune'}`);
      }
      if (a.dislikes !== undefined) {
        st.prefs.dislikes = String(a.dislikes).slice(0, 300); parts.push(`à éviter : ${st.prefs.dislikes || 'rien'}`);
      }
      if (a.meals !== undefined) {
        if (![3, 4, 5, 6].includes(n(a.meals))) throw new Error('nombre de repas entre 3 et 6');
        st.prefs.meals = n(a.meals); parts.push(`${n(a.meals)} repas par jour`);
      }
      if (a.budget !== undefined) {
        if (!BUDGETS[a.budget]) throw new Error(`budget inconnu « ${a.budget} »`);
        st.prefs.budget = a.budget; parts.push(`budget ${BUDGETS[a.budget]}`);
      }
      if (!parts.length) throw new Error('aucun changement alimentaire indiqué');
      st.prefs.done = true; st.profileChanged = true; st.regenMeals = true;
      return `Alimentation : ${parts.join(' · ')} (repas recréés)`;
    }
    case 'reroll_meal': {
      const k = n(a.meal);
      const count = plan.meal_plan?.meals?.length || 0;
      if (!Number.isInteger(k) || k < 1 || k > count) throw new Error(`repas n° ${a.meal} introuvable (1 à ${count})`);
      (st.rerolls ||= []).push(k - 1);
      return `Nouveau repas n° ${k}`;
    }
    case 'swap_exercise': {
      const from = findEx(a.from, plan.program), to = findEx(a.to, plan.program);
      if (!from || !plan.program.some((d) => d.exercises.some((e) => e.id === from))) throw new Error(`« ${a.from} » n'est pas dans ton programme`);
      if (!EXERCISES[to]) throw new Error(`exercice « ${a.to} » inconnu`);
      if (st.profile.equipment === 'home' && !EXERCISES[to].home) throw new Error(`${EXERCISES[to].name} demande du matériel de salle`);
      if (from === to) throw new Error('même exercice');
      const clash = plan.program.find((d) => d.exercises.some((e) => e.id === from) && d.exercises.some((e) => e.id === to));
      if (clash) throw new Error(`${EXERCISES[to].name} est déjà dans ${clash.label}`);
      const od = EXERCISES[from] || {}, nw = EXERCISES[to];
      plan.program = plan.program.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) => {
          if (e.id !== from) return e;
          let { lo, hi } = e;
          if (nw.time && !od.time) { lo = 30; hi = 60; } else if (!nw.time && od.time) { lo = 10; hi = 20; }
          const { custom, ...rest } = e; // un exercice perso remplacé par un exercice du catalogue perd sa fiche perso
          return { ...rest, id: to, lo, hi };
        }),
      }));
      return `${exName(from, st.origProgram)} → ${nw.name} (partout dans le programme)`;
    }
    case 'set_sets_reps':
    case 'add_exercise':
    case 'remove_exercise': {
      const di = findDay(a.day, plan.program);
      if (di < 0) throw new Error(`jour « ${a.day} » introuvable`);
      const day = plan.program[di] = { ...plan.program[di], exercises: [...plan.program[di].exercises] };
      const id = findEx(a.exercise, plan.program);
      if (a.type === 'remove_exercise') {
        const i = day.exercises.findIndex((e) => e.id === id);
        if (i < 0) throw new Error(`« ${a.exercise} » n'est pas dans ${day.label}`);
        if (day.exercises.length === 1) throw new Error(`${day.label} n'aurait plus aucun exercice`);
        day.exercises.splice(i, 1);
        return `${day.label} : retirer ${exName(id, st.origProgram)}`;
      }
      const sets = Math.round(n(a.sets)), lo = Math.round(n(a.reps_min)), hi = Math.round(n(a.reps_max));
      if (!within(sets, 1, 8) || !within(lo, 1, 100) || !within(hi, lo, 100)) throw new Error('séries (1 à 8) ou répétitions invalides');
      const reps = EXERCISES[id]?.time ? `${lo}–${hi} s` : `${lo}–${hi} répétitions`;
      if (a.type === 'add_exercise') {
        if (!EXERCISES[id]) throw new Error(`exercice « ${a.exercise} » inconnu`);
        if (st.profile.equipment === 'home' && !EXERCISES[id].home) throw new Error(`${EXERCISES[id].name} demande du matériel de salle`);
        if (day.exercises.some((e) => e.id === id)) throw new Error(`${EXERCISES[id].name} est déjà dans ${day.label}`);
        day.exercises.push({ id, sets, lo, hi });
        return `${day.label} : ajouter ${EXERCISES[id].name} (${sets} × ${reps})`;
      }
      const i = day.exercises.findIndex((e) => e.id === id);
      if (i < 0) throw new Error(`« ${a.exercise} » n'est pas dans ${day.label}`);
      day.exercises[i] = { ...day.exercises[i], sets, lo, hi };
      return `${day.label} : ${exName(id, st.origProgram)} en ${sets} × ${reps}`;
    }
    case 'profile': {
      const p = st.profile, parts = [];
      const old = { days: p.days_per_week, eq: p.equipment, style: st.prefs.training_style, goal: p.goal, act: p.activity };
      if (a.goal !== undefined) { if (!GOALS[a.goal]) throw new Error(`objectif inconnu « ${a.goal} »`); p.goal = a.goal; parts.push(`objectif : ${GOALS[a.goal]}`); }
      if (a.activity !== undefined) { if (!ACTIVITY[a.activity]) throw new Error(`activité inconnue « ${a.activity} »`); p.activity = a.activity; parts.push(`activité : ${ACTIVITY[a.activity]}`); }
      if (a.days_per_week !== undefined) { if (!within(n(a.days_per_week), 2, 6)) throw new Error('jours par semaine entre 2 et 6'); p.days_per_week = Math.round(n(a.days_per_week)); parts.push(`${p.days_per_week} jours par semaine`); }
      if (a.equipment !== undefined) { if (!['gym', 'home'].includes(a.equipment)) throw new Error('matériel : gym ou home'); p.equipment = a.equipment; parts.push(a.equipment === 'home' ? 'entraînement à la maison' : 'entraînement en salle'); }
      if (a.training_style !== undefined) { if (!STYLES[a.training_style]) throw new Error(`type d'entraînement inconnu « ${a.training_style} »`); st.prefs.training_style = a.training_style; parts.push(`type : ${STYLES[a.training_style]}`); }
      if (a.goal_weight_kg !== undefined) { if (!within(n(a.goal_weight_kg), 30, 250)) throw new Error('poids visé invalide'); st.prefs.goal_weight = n(a.goal_weight_kg); parts.push(`poids visé : ${n(a.goal_weight_kg)} kg`); }
      if (a.goal_date !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(a.goal_date)) throw new Error('date visée invalide'); st.prefs.goal_date = a.goal_date; parts.push(`date visée : ${a.goal_date}`); }
      if (!parts.length) throw new Error('aucun changement de profil indiqué');
      st.profileChanged = true;
      let label = `Profil : ${parts.join(' · ')}`;
      if (p.days_per_week !== old.days || p.equipment !== old.eq || st.prefs.training_style !== old.style) {
        plan.program = buildProgram(p.days_per_week, p.equipment, st.prefs.training_style);
        label += ' — ⚠️ ton programme sera recréé (tes modifications du programme seront remplacées)';
      }
      if (p.goal !== old.goal || p.activity !== old.act) {
        Object.assign(plan, calcTargets(p, st.weight));
        st.targets = true;
        label += ` — nouvelles cibles : ${plan.calories} kcal`;
      }
      return label;
    }
    case 'weight_unit': {
      if (!['kg', 'lb'].includes(a.unit)) throw new Error('unité : kg ou lb');
      st.prefs.weight_unit = a.unit; st.profileChanged = true;
      return `Poids affichés en ${a.unit}`;
    }
    default:
      throw new Error(`type de changement inconnu « ${a.type} »`);
  }
}

// Simule toutes les actions d'un message sur une copie de l'état actuel.
// Renvoie les libellés (ok / refusé avec la raison) et le nouvel état à enregistrer si au moins une est valide.
export function planActions(actions, { profile, plan, prefs, weight, bmr }) {
  const st = {
    profile: structuredClone(profile), plan: structuredClone(plan), prefs: structuredClone(prefs), weight, bmr,
    origProgram: plan.program,
  };
  const items = actions.map((a) => {
    const before = structuredClone({ profile: st.profile, plan: st.plan, prefs: st.prefs });
    try { return { ok: true, label: applyOne(a, st) }; } catch (e) {
      Object.assign(st, before); // une action refusée ne laisse aucune trace
      return { ok: false, label: `${TYPE_NAMES[a.type] || 'Changement inconnu'} : ${e.message}` };
    }
  });
  return { items, valid: items.some((i) => i.ok), result: st };
}
