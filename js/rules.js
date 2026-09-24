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
};

import { daysBetween, roundHalf, round1 } from './util.js';

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

// Cibles de départ
export function calcTargets(p, kg) {
  const tdee = bmr(p, kg) * RULES.activity[p.activity || 'medium'];
  const cal = Math.round((tdee * (1 + RULES.goalCalories[p.goal])) / 10) * 10;
  return macros(p, kg, cal);
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
  const target = RULES.weeklyRate[profile.goal];
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
  else if (!deload) messages.push({ icon: '📈', text: 'Charges : quand toutes les séries atteignent le haut de la fourchette de reps, la charge monte la séance suivante.' });

  return { ...macros(profile, kg, cal), deload, hold, messages };
}

// Objectif de la prochaine séance pour un exercice, selon la dernière fois.
// prog = {sets, lo, hi}; last = [{w, r}, ...] ou null
export function nextTarget(ex, prog, last, { deload = false, hold = false } = {}) {
  if (!last || !last.length) {
    return { sets: prog.sets, w: null, note: ex.bw ? 'Fais un maximum propre dans la fourchette.' : 'Choisis une charge qui te laisse 1–2 reps en réserve.' };
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
  return { sets: prog.sets, w, note: anyLow ? 'Sous la fourchette : garde cette charge et vise plus de reps.' : 'Garde la charge et vise plus de reps.' };
}
