// LE COACH : toutes les règles automatiques sont ici, en français.
// Pour changer le comportement (ex. « ajouter 200 kcal au lieu de 150 »), modifie les chiffres de RULES.

export const RULES = {
  // Protéines par kg de poids corporel, selon l'objectif
  proteinPerKg: { lose: 2.2, maintain: 1.8, gain: 1.8 },
  // Part des calories en lipides (le reste après protéines = glucides)
  fatPercent: 0.25,
  // Multiplicateur d'activité (vie de tous les jours + entraînement)
  activity: { low: 1.4, medium: 1.55, high: 1.7 },
  // Écart de calories vs maintien, au départ
  goalCalories: { lose: -0.2, maintain: 0, gain: 0.1 },
  // Rythme de poids visé, en % du poids par semaine. Sous « min » ou au-dessus de « max » = ajustement.
  weeklyRate: {
    lose: { min: -1.0, max: -0.4 },
    maintain: { min: -0.3, max: 0.3 },
    gain: { min: 0.15, max: 0.5 },
  },
  calorieStep: 150,          // combien de kcal on ajoute / retire à chaque ajustement
  minNutritionAdherence: 70, // sous ce % de respect du plan, on ne touche pas aux calories
  minTrainingAdherence: 60,  // sous ce % de séances faites, on ne monte pas les charges
  loadIncrement: { upper: 2.5, lower: 5 }, // kg ajoutés quand toutes les séries atteignent le haut de la fourchette
  deloadEveryWeeks: 6,       // une semaine plus légère toutes les X semaines
  deload: { volumeFactor: 0.6, loadFactor: 0.9 }, // 60 % des séries, 90 % de la charge
  // Récupération : 2 signaux ou plus = semaine légère
  poorRecovery: { sleepMax: 2, energyMax: 2, sorenessMin: 4, stressMin: 4 },
  // Cycle glucidique jour d'entraînement / jour de repos : protéines et lipides ne bougent pas,
  // seuls les glucides (donc les calories) montent les jours d'entraînement et baissent les jours de repos.
  dayCycle: { trainCarbFactor: 1.20, restCarbFactor: 0.80 },
};

import { daysBetween, roundHalf, round1, today } from './util.js';

export const ageOf = (p) => new Date().getFullYear() - p.birth_year;

// Métabolisme de base (formule Mifflin-St Jeor)
export function bmr(p, kg) {
  const base = 10 * kg + 6.25 * p.height_cm - 5 * ageOf(p);
  return Math.round(base + (p.sex === 'homme' ? 5 : -161));
}

export function macros(p, kg, calories) {
  const protein = Math.round(RULES.proteinPerKg[p.goal] * kg);
  const fat = Math.round((calories * RULES.fatPercent) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

// Autres repères de nutrition (indicatifs) : fibres, eau, gras saturés
export function extraTargets(calories, kg) {
  return {
    fibre: Math.round((14 * calories) / 1000),          // 14 g de fibres par 1000 kcal
    eau: Math.round(kg * 0.035 * 10) / 10,              // environ 35 ml par kg, en litres
    satfat: Math.round((calories * 0.1) / 9),           // gras saturés : au plus 10 % des calories
  };
}

// Cibles du jour selon que c'est un jour d'entraînement ou de repos (cycle glucidique).
// plan = les cibles moyennes de la semaine (celles que le coach ajuste chaque semaine).
export function dayVariant(plan, kind) {
  if (kind !== 'train' && kind !== 'rest') return { calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat };
  const factor = kind === 'train' ? RULES.dayCycle.trainCarbFactor : RULES.dayCycle.restCarbFactor;
  const carbs = Math.max(0, Math.round((plan.carbs * factor) / 5) * 5);
  const calories = Math.round((plan.protein * 4 + carbs * 4 + plan.fat * 9) / 10) * 10;
  return { calories, protein: plan.protein, carbs, fat: plan.fat };
}

// Cibles de départ
export function calcTargets(p, kg) {
  const tdee = bmr(p, kg) * RULES.activity[p.activity || 'medium'];
  const cal = Math.round((tdee * (1 + RULES.goalCalories[p.goal])) / 10) * 10;
  return macros(p, kg, cal);
}

// Si la personne a fixé un poids et une date visés, calcule le rythme hebdomadaire nécessaire pour les atteindre,
// borné à un rythme sûr (jamais plus agressif que RULES.weeklyRate). Sinon, la fourchette générique par défaut.
export function targetWindow(profile, kg) {
  const generic = RULES.weeklyRate[profile.goal];
  if (!profile.goal_weight_kg || !profile.goal_date) return generic;
  const weeksLeft = Math.max(daysBetween(today(), profile.goal_date), 1) / 7;
  const neededPercent = (((profile.goal_weight_kg - kg) / kg) * 100) / weeksLeft;
  const safe = Math.max(generic.min, Math.min(generic.max, neededPercent));
  return { min: safe - 0.1, max: safe + 0.1 };
}

// Résumé de la progression vers un poids et une date visés, pour l'afficher à la personne.
// Renvoie null si aucun objectif chiffré n'est fixé.
export function goalStatus(profile, kg) {
  if (!profile.goal_weight_kg || !profile.goal_date) return null;
  const gap = round1(profile.goal_weight_kg - kg);
  if (Math.abs(gap) < 0.3) return { done: true, reached: true, gap };
  const daysLeft = daysBetween(today(), profile.goal_date);
  if (daysLeft <= 0) return { done: true, reached: false, gap, daysLeft };
  const weeksLeft = daysLeft / 7;
  const neededPercent = ((gap / kg) * 100) / weeksLeft;
  const generic = RULES.weeklyRate[profile.goal];
  const safePercent = Math.max(generic.min, Math.min(generic.max, neededPercent));
  const realistic = Math.abs(neededPercent - safePercent) < 0.05;
  let realisticDays = daysLeft;
  if (!realistic) {
    const weeksNeeded = Math.abs(gap) / ((Math.abs(safePercent) / 100) * kg);
    realisticDays = Math.round(weeksNeeded * 7);
  }
  return {
    done: false, gap, daysLeft, weeksLeft: Math.round(weeksLeft),
    neededPercent: round1(neededPercent), realistic, realisticDays,
  };
}

// Ajustement de la semaine, calculé après chaque check-in.
// checkins = tous les check-ins triés du plus ancien au plus récent (le dernier = celui de cette semaine).
export function weeklyAdjust({ profile, plan, checkins }) {
  const cur = checkins[checkins.length - 1];
  const prev = checkins[checkins.length - 2];
  const kg = cur.weight;
  const messages = [];
  let cal = plan.calories;

  // 1) Poids -> calories
  let rate = null;
  if (prev) {
    const weeks = Math.max(1, daysBetween(prev.week_start, cur.week_start) / 7);
    rate = ((cur.weight - prev.weight) / prev.weight) * 100 / weeks;
  }
  const target = targetWindow(profile, kg);
  const pct = rate === null ? null : `${rate > 0 ? '+' : ''}${round1(rate)} %/sem`;

  if (rate === null) {
    messages.push({ icon: '🏁', text: 'Premier check-in enregistré : c’est ton point de départ. Les ajustements commencent la semaine prochaine.' });
  } else if (cur.adherence_nutrition < RULES.minNutritionAdherence) {
    messages.push({ icon: '🍽️', text: `Nutrition suivie à ${cur.adherence_nutrition} % : pas de changement de calories cette semaine. On suit d’abord le plan, sinon les chiffres ne veulent rien dire.` });
  } else if (rate < target.min) {
    cal += RULES.calorieStep;
    messages.push({ icon: '⬆️', text: `Poids ${pct} : ${profile.goal === 'lose' ? 'perte trop rapide, on protège ton muscle' : 'trop bas pour ton objectif'}. Calories +${RULES.calorieStep} kcal.` });
  } else if (rate > target.max) {
    cal -= RULES.calorieStep;
    messages.push({ icon: '⬇️', text: `Poids ${pct} : ${profile.goal === 'gain' ? 'prise trop rapide, on limite le gras' : profile.goal === 'lose' ? 'perte trop lente' : 'trop haut pour maintenir'}. Calories −${RULES.calorieStep} kcal.` });
  } else {
    messages.push({ icon: '✅', text: `Poids ${pct} : dans la cible. On garde les calories.` });
  }
  const floor = bmr(profile, kg);
  if (cal < floor) {
    cal = floor;
    messages.push({ icon: '🛑', text: `Les calories ne descendent pas sous ton métabolisme de base (${floor} kcal). Si ça stagne, on ajustera l’activité plutôt que de manger moins.` });
  }

  // 2) Récupération -> semaine légère
  const R = RULES.poorRecovery;
  const flags = [];
  if (cur.sleep <= R.sleepMax) flags.push('sommeil');
  if (cur.energy <= R.energyMax) flags.push('énergie');
  if (cur.soreness >= R.sorenessMin) flags.push('courbatures');
  if (cur.stress >= R.stressMin) flags.push('stress');
  const scheduled = checkins.length > 0 && checkins.length % RULES.deloadEveryWeeks === 0;
  const deload = flags.length >= 2 || scheduled;
  if (flags.length >= 2) messages.push({ icon: '😴', text: `Récupération fragile (${flags.join(', ')}). Semaine légère : moins de séries, charges réduites.` });
  else if (scheduled) messages.push({ icon: '🔄', text: `Semaine ${checkins.length} : semaine légère prévue pour récupérer.` });

  // 3) Séances faites -> progression des charges
  const hold = !deload && cur.adherence_training < RULES.minTrainingAdherence;
  if (hold) messages.push({ icon: '🏋️', text: `Séances faites à ${cur.adherence_training} % : on ne monte pas les charges cette semaine. Vise au moins ${RULES.minTrainingAdherence} % des séances.` });
  else if (!deload) messages.push({ icon: '📈', text: 'Charges : quand toutes les séries atteignent le haut de la fourchette de répétitions, la charge monte la séance suivante.' });

  // 4) Objectif chiffré (poids + date), si fixé
  const goal = goalStatus(profile, kg);
  if (goal?.done && goal.reached) messages.push({ icon: '🎉', text: `Tu es à ton poids visé (${profile.goal_weight_kg} kg) !` });
  else if (goal?.done) messages.push({ icon: '📅', text: `La date visée est passée : il te reste ${Math.abs(goal.gap)} kg. Choisis une nouvelle date dans ton profil.` });
  else if (goal) {
    const fmtLong = (d) => d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
    const rythme = goal.realistic
      ? `au rythme actuel, c’est atteignable.`
      : `ce rythme dépasse ce qui est sûr ; de façon réaliste, compte plutôt jusqu’au ${fmtLong(new Date(Date.now() + goal.realisticDays * 864e5))}.`;
    messages.push({ icon: '🎯', text: `Objectif : ${profile.goal_weight_kg} kg d’ici le ${fmtLong(new Date(profile.goal_date + 'T12:00:00'))} (${goal.weeksLeft} sem.). Il reste ${Math.abs(goal.gap)} kg, soit ${goal.neededPercent > 0 ? '+' : ''}${goal.neededPercent} %/sem nécessaire — ${rythme}` });
  }

  // Protéines et lipides restent ceux du plan actuel (par défaut ou modifiés à la main) : seules les calories
  // bougent selon le poids, et les glucides s'ajustent pour combler le reste.
  const protein = plan.protein;
  const fat = plan.fat;
  const carbs = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));
  return { calories: cal, protein, carbs, fat, deload, hold, messages };
}

// Objectif de la prochaine séance pour un exercice, selon la dernière fois.
// prog = {sets, lo, hi}; last = [{w, r}, ...] ou null
export function nextTarget(ex, prog, last, { deload = false, hold = false } = {}) {
  if (!last || !last.length) {
    return { sets: prog.sets, w: null, first: true, note: ex.bw ? 'Fais un maximum propre dans la fourchette.' : 'Choisis une charge qui te laisse 1 ou 2 répétitions en réserve.' };
  }
  const w = Math.max(...last.map((s) => +s.w || 0));
  const done = last.filter((s) => +s.r > 0);
  if (deload) {
    return { sets: Math.max(2, Math.ceil(prog.sets * RULES.deload.volumeFactor)), w: roundHalf(w * RULES.deload.loadFactor), note: 'Semaine légère : moins de séries, charge réduite.' };
  }
  const allTop = done.length >= prog.sets && done.every((s) => +s.r >= prog.hi);
  const anyLow = done.some((s) => +s.r < prog.lo);
  if (allTop && !hold) {
    if (ex.bw && w === 0) return { sets: prog.sets, w: 0, note: 'Haut de la fourchette atteint : ajoute une charge ou une variante plus difficile.' };
    const inc = ex.inc ?? (ex.lower ? RULES.loadIncrement.lower : RULES.loadIncrement.upper);
    return { sets: prog.sets, w: roundHalf(w + inc), note: `Toutes les séries au sommet : +${inc} kg.` };
  }
  return { sets: prog.sets, w, note: anyLow ? 'Sous la fourchette : garde cette charge et vise plus de répétitions.' : 'Garde la charge et vise plus de répétitions.' };
}
