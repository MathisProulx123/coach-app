// Filet de sécurité pour la langue du coach IA : même avec la consigne, Gemini laisse parfois passer un mot anglais
// (ex. « choice » au lieu de « choix »). On corrige ces mots dans chaque réponse avant de l'afficher.
// Pour en ajouter un : une ligne [mot anglais (expression régulière), remplacement français].
// Gardés exprès (courants et compris au Québec) : cardio, shake, smoothie, check-in (nom d'un onglet de l'app),
// et les noms de séances (Full body, Push, Pull, Legs).
const CORRECTIONS = [
  ['lean bulk', 'prise de masse sans trop de gras'],
  ['protéines?-friendly', 'riches en protéines'],
  ['budget-friendly', 'économique'],
  ['friendly', 'adapté'],
  ['meal preps?', 'préparation de repas'],
  ['cheat meals?', 'repas plaisir'],
  ['warm-?ups?', 'échauffement'],
  ['cool-?downs?', 'retour au calme'],
  ['good job', 'bravo'],
  ['fait du sens', 'a du sens'],
  ['font du sens', 'ont du sens'],
  ['faire du sens', 'avoir du sens'],
  ['choices', 'choix'],
  ['choice', 'choix'],
  ['workouts', 'entraînements'],
  ['workout', 'entraînement'],
  ['snacks', 'collations'],
  ['snack', 'collation'],
  ['reps', 'répétitions'],
  ['rep', 'répétition'],
  ['sets', 'séries'],
  ['bulking', 'prise de masse'],
  ['bulk', 'prise de masse'],
  ['cutting', 'sèche'],
  ['cut', 'sèche'],
  ['deload', 'semaine légère'],
  ['feedback', 'rétroaction'],
  ['goals', 'objectifs'],
  ['goal', 'objectif'],
  ['timing', 'moment'],
  ['stretching', 'étirements'],
  ['healthy', 'santé'],
  ['anyway', 'de toute façon'],
  ['basically', 'au fond'],
  ['overall', 'dans l’ensemble'],
  ['protein', 'protéines'],
  ['update', 'mise à jour'],
  ['le focus', 'la priorité'],
];
// Limites de mot qui comprennent les lettres accentuées (\b ne les connaît pas).
const RULES = CORRECTIONS.map(([en, fr]) => [new RegExp(`(?<![\\p{L}\\-])${en}(?![\\p{L}\\-])`, 'giu'), fr]);

// Les remplacements féminins changent le déterminant devant : « un snack » → « une collation », « ton cut » → « ta sèche ».
const FEMININ = '(collation|sèche|préparation de repas|prise de masse|semaine légère|rétroaction|mise à jour)';
const ACCORD = { un: 'une', ton: 'ta', mon: 'ma', son: 'sa', le: 'la', du: 'de la', au: 'à la' };
const ACCORD_RE = new RegExp(`(?<![\\p{L}])(un|ton|mon|son|le|du|au) ${FEMININ}(?![\\p{L}])`, 'giu');

// Garde la majuscule du début si le mot anglais en avait une (« Choice » → « Choix »).
const cap = (m, fr) => (m[0] !== m[0].toLowerCase() ? fr[0].toUpperCase() + fr.slice(1) : fr);
export function franciser(text) {
  let out = String(text ?? '');
  let changed = false;
  for (const [re, fr] of RULES) out = out.replace(re, (m) => { changed = true; return cap(m, fr); });
  // Seulement si on a remplacé quelque chose : un texte déjà en bon français n'est jamais touché.
  if (changed) out = out.replace(ACCORD_RE, (m, det, mot) => `${cap(det, ACCORD[det.toLowerCase()])} ${mot}`);
  return out;
}
