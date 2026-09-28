// Onboarding piloté par l'IA : une conversation qui remplit le profil, l'entraînement et les préférences alimentaires.
// Ce fichier contient la logique (consignes pour l'IA, validation des réponses, faux coach du mode démo) ;
// l'affichage est dans app.js. L'IA ne crée rien elle-même : elle remplit un BROUILLON que la personne vérifie
// dans un récapitulatif avant que le profil et le plan soient créés.
import { ALLERGENS, DIETS } from './foods.js';

// Mêmes clés que TRAINING_STYLES et BUDGETS dans app.js.
const STYLES = ['strength', 'hypertrophy', 'endurance'];
const BUDGET_KEYS = ['serre', 'normal', 'genereux'];

// Les infos sans lesquelles on ne peut pas calculer un plan (le reste a une valeur par défaut raisonnable).
export const ESSENTIALS = {
  name: 'prénom', sex: 'sexe', birth_year: 'âge', height_cm: 'taille', weight_kg: 'poids',
  goal: 'objectif', days_per_week: 'jours d’entraînement', equipment: 'matériel',
};

export const FIRST_MESSAGE = 'Salut ! Je suis ton coach 👋 En quelques questions, je vais préparer ton programme d’entraînement et ton plan de repas. Pour commencer : comment tu t’appelles, et qu’est-ce que tu aimerais changer ou atteindre ?';

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const oneOf = (v, keys) => (keys.includes(v) ? v : undefined);

// Garde seulement les valeurs valides (mêmes bornes que les formulaires) et les ajoute au brouillon existant :
// une réponse de l'IA incomplète ou fantaisiste n'efface jamais ce qui était déjà connu.
export function mergeDraft(prev, d = {}) {
  const year = new Date().getFullYear();
  const clean = {
    name: str(d.name, 40),
    sex: oneOf(d.sex, ['homme', 'femme']),
    birth_year: num(d.birth_year, 1940, year - 12),
    height_cm: num(d.height_cm, 120, 230),
    weight_kg: num(d.weight_kg, 30, 250),
    weight_unit: oneOf(d.weight_unit, ['kg', 'lb']),
    goal: oneOf(d.goal, ['lose', 'maintain', 'gain']),
    goal_weight_kg: num(d.goal_weight_kg, 30, 250),
    goal_date: typeof d.goal_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.goal_date) ? d.goal_date : undefined,
    days_per_week: num(d.days_per_week, 2, 6) && Math.round(d.days_per_week),
    equipment: oneOf(d.equipment, ['gym', 'home']),
    activity: oneOf(d.activity, ['low', 'medium', 'high']),
    limitations: str(d.limitations, 300),
    training_goal_text: str(d.training_goal_text, 600),
    training_style: oneOf(d.training_style, STYLES),
    diet: oneOf(d.diet, Object.keys(DIETS)),
    allergies: Array.isArray(d.allergies) ? d.allergies.filter((a) => ALLERGENS[a]) : undefined,
    dislikes: str(d.dislikes, 300),
    meals: num(d.meals, 3, 6) && Math.round(d.meals),
    budget: oneOf(d.budget, BUDGET_KEYS),
    caution: str(d.caution, 300),
  };
  const out = { ...prev };
  for (const [k, v] of Object.entries(clean)) if (v !== undefined) out[k] = v;
  return out;
}

export const missing = (draft) => Object.keys(ESSENTIALS).filter((k) => draft[k] === undefined);

// Consigne envoyée à l'IA à chaque tour (dans le contexte). Elle répond en JSON : sa phrase + le brouillon mis à jour.
const CONSIGNE = `Tu fais l'accueil d'une nouvelle personne dans l'application. Ton but : apprendre à la connaître par une conversation naturelle et chaleureuse, pour remplir le brouillon ci-dessous. Pose UNE question à la fois (tu peux regrouper 2 ou 3 infos simples dans la même question, ex. âge, taille et poids), en 1 à 3 phrases courtes, et rebondis sur ce qu'elle dit.

Ordre conseillé : prénom et objectif en ses mots → sexe, âge, taille, poids → jours d'entraînement par semaine et matériel (salle ou maison) → activité au quotidien et blessures → alimentation (régime, allergies, aliments détestés, nombre de repas, budget). Ne redemande jamais une info déjà dans le brouillon.

Réponds UNIQUEMENT avec un objet JSON, sans texte autour : {"reply": "ta phrase à la personne", "draft": {...}, "done": true|false}.
"draft" contient TOUT ce que tu sais jusqu'ici (reprends le brouillon actuel et ajoute les nouvelles infos), avec exactement ces clés et valeurs :
- name (prénom), sex ("homme" ou "femme"), birth_year (année de naissance, calcule-la depuis l'âge), height_cm, weight_kg (convertis les livres et les pieds ; si la personne parle en livres, mets aussi weight_unit: "lb")
- goal : "lose" (perdre du gras), "maintain" (maintenir, être en forme) ou "gain" (prendre du muscle)
- goal_weight_kg et goal_date ("AAAA-MM-JJ") seulement si la personne donne un poids ou une date visés
- days_per_week (2 à 6), equipment ("gym" ou "home"), activity ("low" surtout assis, "medium", "high" travail physique)
- limitations (blessures, douleurs, exercices à éviter), training_goal_text (son but en ses mots, résumé)
- training_style : "strength" (force), "hypertrophy" (muscle, par défaut) ou "endurance"
- diet : ${Object.keys(DIETS).map((k) => `"${k}"`).join(', ')} ; allergies : liste parmi ${Object.keys(ALLERGENS).map((k) => `"${k}"`).join(', ')}
- dislikes (aliments à éviter, séparés par des virgules), meals (3 à 6 repas par jour), budget ("serre", "normal" ou "genereux")
- caution : une courte note SEULEMENT si la personne a moins de 18 ans, est enceinte, parle d'une maladie, d'une blessure sérieuse ou de signes de trouble alimentaire (restriction extrême, culpabilité, perte de poids très rapide). Dans ce cas, dis-lui aussi avec douceur, dans "reply", d'en parler à un professionnel de la santé.
N'invente rien : laisse de côté une clé si tu ne sais pas.
Mets "done": true quand tu connais au moins prénom, sexe, âge, taille, poids, objectif, jours et matériel ET que tu as posé la question sur l'alimentation ; dans "reply", dis alors que tout est prêt et qu'elle peut vérifier le récapitulatif.`;

// Gemini veut une conversation qui commence par la personne et alterne personne / coach. On ajoute donc un premier
// message fictif, on retire les messages d'erreur, on fusionne deux messages consécutifs du même côté, et on ne garde
// que la fin (le serveur n'en lit que 12 ; le brouillon garde de toute façon ce qui a été appris avant).
export function onboardPayload(hist, draft) {
  const msgs = [];
  for (const m of [{ r: 'user', t: 'Bonjour, je viens de créer mon compte.' }, ...hist.filter((x) => !x.err)]) {
    const role = m.r === 'user' ? 'user' : 'model';
    const prev = msgs[msgs.length - 1];
    if (prev && prev.role === role) prev.text += `\n${m.t}`; else msgs.push({ role, text: m.t });
  }
  let tail = msgs.slice(1);
  while (tail.length > 11 || tail[0]?.role === 'user') tail = tail.slice(1);
  return {
    messages: [msgs[0], ...tail],
    context: { consigne_accueil: CONSIGNE, brouillon_actuel: draft, annee_actuelle: new Date().getFullYear() },
    format: 'json',
  };
}

// L'IA répond normalement en JSON pur ; on tolère un bloc de code autour, ou du texte avant/après l'objet.
export function parseReply(text) {
  const raw = String(text).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  const j = JSON.parse(a >= 0 && b > a ? raw.slice(a, b + 1) : raw);
  if (typeof j.reply !== 'string' || !j.reply.trim()) throw new Error('Réponse sans message');
  return { reply: j.reply.trim(), draft: j.draft && typeof j.draft === 'object' ? j.draft : {}, done: !!j.done };
}

// ---------- Faux coach du MODE DÉMO (sans IA) ----------
// Pose les mêmes questions dans le même ordre et devine les réponses avec des règles simples.
// Sert seulement à tester le parcours sans compte ni quota ; le vrai coach comprend beaucoup mieux.
const low = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const QUESTIONS = [
  'Merci ! Maintenant : tu es un homme ou une femme, quel âge as-tu, et quels sont ta taille et ton poids ?',
  'Combien de jours par semaine peux-tu t’entraîner (2 à 6), et plutôt en salle ou à la maison ?',
  'Au quotidien, tu es plutôt assis, assez actif ou très actif ? Et as-tu une blessure ou un exercice à éviter ?',
  'Dernière partie, l’alimentation : un régime particulier, des allergies, des aliments que tu détestes, et combien de repas par jour ?',
];
function guess(text, draft) {
  const t = low(text), d = {};
  if (draft.name === undefined) {
    const m = text.match(/(?:je m'?appelle|moi c'?est|c'?est)\s+([A-Za-zÀ-ÿ-]+)/i) || text.match(/^\s*([A-ZÀ-Ý][a-zà-ÿ-]+)/);
    if (m) d.name = m[1][0].toUpperCase() + m[1].slice(1);
  }
  if (/perdre|maigrir|seche|gras|mincir/.test(t)) d.goal = 'lose';
  else if (/muscle|masse|prendre|grossir/.test(t)) d.goal = 'gain';
  else if (/maintenir|forme|sante|energie/.test(t)) d.goal = 'maintain';
  if (/\b(femme|fille)\b/.test(t)) d.sex = 'femme'; else if (/\b(homme|gars|garcon)\b/.test(t)) d.sex = 'homme';
  const age = t.match(/(\d{2})\s*ans/); if (age) d.birth_year = new Date().getFullYear() - +age[1];
  const h = t.match(/1\s*[m,.]\s*(\d{2})/) || t.match(/(\d{3})\s*cm/); if (h) d.height_cm = h[0].includes('cm') ? +h[1] : 100 + +h[1];
  const kg = t.match(/(\d{2,3}(?:[.,]\d)?)\s*(kg|kilo)/); const lb = t.match(/(\d{2,3})\s*(lb|livre)/);
  if (kg) d.weight_kg = +kg[1].replace(',', '.'); else if (lb) { d.weight_kg = Math.round(+lb[1] * 0.4536 * 10) / 10; d.weight_unit = 'lb'; }
  const days = t.match(/([2-6])\s*(jours|fois|x)/); if (days) d.days_per_week = +days[1];
  if (/maison|chez moi|halteres/.test(t)) d.equipment = 'home'; else if (/salle|gym/.test(t)) d.equipment = 'gym';
  if (/assis|bureau/.test(t)) d.activity = 'low'; else if (/tres actif|physique|chantier|debout/.test(t)) d.activity = 'high'; else if (/actif/.test(t)) d.activity = 'medium';
  const hurt = text.match(/[^.,;]*(genou|dos|epaule|épaule|blessure|douleur)[^.,;]*/i); if (hurt) d.limitations = hurt[0].trim();
  if (/vegetalien|vegan/.test(t)) d.diet = 'vegetalien'; else if (/vegetarien|vege/.test(t)) d.diet = 'vegetarien'; else if (/pescetarien/.test(t)) d.diet = 'pescetarien';
  const al = { arachide: /arachide|peanut/, noix: /\bnoix\b/, lait: /lactose|\blait\b/, oeuf: /\boeufs?\b/, gluten: /gluten/, poisson: /poisson/, crustaces: /fruits de mer|crustace/ };
  const allergies = Object.keys(al).filter((k) => /allerg|intoleran/.test(t) && al[k].test(t)); if (allergies.length) d.allergies = allergies;
  const dis = text.match(/(?:deteste|déteste|aime pas|j'aime pas)\s+([^.,;]+)/i); if (dis) d.dislikes = dis[1].trim();
  const meals = t.match(/([3-6])\s*repas/); if (meals) d.meals = +meals[1];
  return d;
}
export function mockTurn(hist, draft, text) {
  const next = mergeDraft(draft, guess(text, draft));
  const asked = hist.filter((m) => m.r === 'ai').length; // questions déjà posées (le message d'accueil compte)
  const q = QUESTIONS[asked - 1];
  if (!q) return { reply: 'Parfait, j’ai tout ce qu’il me faut ! Vérifie le récapitulatif, corrige ce qui ne va pas, puis crée ton plan.', draft: next, done: true };
  return { reply: q, draft: next, done: false };
}
