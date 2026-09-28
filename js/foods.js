// Base d'aliments du plan alimentaire.
// Valeurs moyennes pour 100 g (k = kcal, p = protéines, c = glucides, f = lipides), aliments cuits sauf indication.
// Les marques sont des EXEMPLES courants au Québec : les valeurs varient selon la marque, vérifie l'étiquette.
// Pour ajouter un aliment : ajoute une ligne dans FOODS.
//   role   : protein | carb | fat | fruit | veg
//   slots  : repas où il peut apparaître (dej = déjeuner, din = dîner, sou = souper, col = collation)
//   max    : quantité maximale raisonnable par repas, en grammes
//   animal : meat | fish | dairy | egg (sert aux régimes végétarien / végétalien / pescétarien)
//   pork   : true pour le porc (régime « sans porc »)
//   allergens : arachide, noix, lait, oeuf, gluten, soya, poisson, crustaces, sesame
//   unit   : { n: nom, p: pluriel, g: grammes par unité, whole: unités entières seulement }
//   kw     : mots-clés pour reconnaître ce que la personne n'aime pas
export const ALLERGENS = {
  arachide: 'Arachides', noix: 'Noix / fruits à coque', lait: 'Lait / lactose', oeuf: 'Œufs', gluten: 'Gluten (blé)',
  soya: 'Soya', poisson: 'Poisson', crustaces: 'Fruits de mer', sesame: 'Sésame',
};
// Autres mots qui mènent à une allergie de la liste dans la recherche (ex. « noisette » → Noix / fruits à coque).
export const ALLERGEN_WORDS = {
  arachide: 'cacahuete peanut beurre d arachide', noix: 'noisette amande cajou pistache pacane pecan macadamia',
  lait: 'lactose laitier fromage yogourt yaourt creme beurre', oeuf: 'oeuf', gluten: 'ble farine seigle orge celiaque',
  soya: 'soja tofu edamame', poisson: 'saumon thon morue truite sardine', crustaces: 'crevette homard crabe moule petoncle mollusque',
  sesame: 'tahini',
};

// Allergies moins courantes, proposées par la recherche du formulaire. Elles écartent les aliments dont le nom (ou un
// mot-clé) contient un des termes. N'importe quelle autre allergie tapée à la main marche pareil, avec son propre nom.
export const EXTRA_ALLERGIES = {
  moutarde: { label: 'Moutarde', terms: ['moutarde'] },
  kiwi: { label: 'Kiwi', terms: ['kiwi'] },
  fraise: { label: 'Fraises', terms: ['fraise'] },
  banane: { label: 'Banane', terms: ['banane'] },
  agrumes: { label: 'Agrumes (orange, citron…)', terms: ['orange', 'citron', 'pamplemousse', 'clementine', 'lime', 'agrume'] },
  tomate: { label: 'Tomate', terms: ['tomate'] },
  celeri: { label: 'Céleri', terms: ['celeri'] },
  mais: { label: 'Maïs', terms: ['mais'] },
  avoine: { label: 'Avoine', terms: ['avoine'] },
  riz: { label: 'Riz', terms: ['riz'] },
  legumineuses: { label: 'Légumineuses (lentilles, pois chiches…)', terms: ['lentille', 'pois chiche', 'haricot', 'feve', 'legumineuse'] },
};
export const otherAllergyLabel = (a) => EXTRA_ALLERGIES[a]?.label || a;

export const DIETS = {
  aucun: 'Aucune restriction', vegetarien: 'Végétarien', vegetalien: 'Végétalien', pescetarien: 'Pescétarien', sans_porc: 'Sans porc (halal)',
};

const F = (id, name, role, slots, k, p, c, f, extra = {}) => ({ id, name, role, slots, per100: { k, p, c, f }, allergens: [], ...extra });

export const FOODS = [
  // ---------- Protéines ----------
  F('poulet', 'Poitrine de poulet cuite', 'protein', ['din', 'sou'], 165, 31, 0, 3.6, { max: 300, animal: 'meat', kw: ['poulet', 'volaille'], brands: 'n’importe quelle marque (ex. Flamingo, Maple Leaf, Kirkland)' }),
  F('dinde', 'Poitrine de dinde cuite', 'protein', ['din', 'sou'], 135, 30, 0, 1, { max: 300, animal: 'meat', kw: ['dinde', 'volaille'], brands: 'n’importe quelle marque (ex. Butterball, Maple Leaf)' }),
  F('boeuf', 'Bœuf haché extra-maigre cuit', 'protein', ['din', 'sou'], 205, 27, 0, 10, { max: 250, animal: 'meat', kw: ['boeuf', 'viande'], brands: 'extra-maigre, 5 % de gras (ex. Kirkland, marque de l’épicerie)' }),
  F('porc', 'Filet de porc cuit', 'protein', ['din', 'sou'], 143, 26, 0, 3.5, { max: 300, animal: 'meat', pork: true, kw: ['porc', 'viande'], brands: 'filet ou longe, n’importe quelle marque' }),
  F('saumon', 'Saumon cuit', 'protein', ['din', 'sou'], 206, 22, 0, 12, { max: 250, animal: 'fish', allergens: ['poisson'], kw: ['saumon', 'poisson'], brands: 'frais ou surgelé (ex. Kirkland, Irresistibles)' }),
  F('morue', 'Poisson blanc cuit (morue, tilapia)', 'protein', ['din', 'sou'], 105, 23, 0, 0.9, { max: 350, animal: 'fish', allergens: ['poisson'], kw: ['morue', 'tilapia', 'poisson'], brands: 'frais ou surgelé, n’importe quelle marque' }),
  F('thon', 'Thon en conserve (eau, égoutté)', 'protein', ['din', 'sou'], 116, 26, 0, 1, { max: 200, animal: 'fish', allergens: ['poisson'], kw: ['thon', 'poisson'], brands: 'Clover Leaf, Bumble Bee, Kirkland' }),
  F('crevettes', 'Crevettes cuites', 'protein', ['din', 'sou'], 99, 24, 0.2, 0.3, { max: 250, animal: 'fish', allergens: ['crustaces'], kw: ['crevette', 'fruits de mer'], brands: 'surgelées décortiquées (ex. Kirkland, Irresistibles)' }),
  F('oeufs', 'Œufs entiers', 'protein', ['dej', 'din', 'sou'], 143, 12.6, 0.7, 9.5, { max: 250, animal: 'egg', allergens: ['oeuf'], unit: { n: 'œuf', p: 'œufs', g: 50, whole: true }, kw: ['oeuf'], brands: 'Burnbrae Farms, Nutri, œufs de catégorie A' }),
  F('yogourt', 'Yogourt grec nature 0 %', 'protein', ['dej', 'col'], 59, 10, 3.6, 0.4, { max: 400, animal: 'dairy', allergens: ['lait'], kw: ['yogourt', 'yaourt', 'yogurt'], brands: 'Oikos, Iögo, Liberté, Astro' }),
  F('whey', 'Poudre de protéines (whey)', 'protein', ['dej', 'col'], 400, 80, 10, 5, { max: 60, supplement: true, animal: 'dairy', allergens: ['lait'], unit: { n: 'mesure', p: 'mesures', g: 30 }, kw: ['whey', 'poudre', 'proteine'], brands: 'Optimum Nutrition Gold Standard, Dymatize ISO100, Isopure, Kirkland' }),
  F('vegprot', 'Poudre de protéines végétales (pois/riz)', 'protein', ['dej', 'col'], 380, 75, 8, 6, { max: 60, supplement: true, unit: { n: 'mesure', p: 'mesures', g: 30 }, kw: ['poudre', 'proteine', 'vegetale'], brands: 'Vega Sport, Sunwarrior, Garden of Life' }),
  F('tofu', 'Tofu ferme', 'protein', ['din', 'sou'], 140, 16, 3, 8, { max: 250, allergens: ['soya'], kw: ['tofu', 'soya'], brands: 'Unisoya, Sunrise Soya Foods' }),
  F('lentilles', 'Lentilles cuites', 'protein', ['din', 'sou'], 116, 9, 20, 0.4, { max: 200, kw: ['lentille', 'legumineuse'], brands: 'en conserve (ex. Unico, Kirkland) ou sèches' }),
  F('haricots_rouges', 'Haricots rouges cuits', 'protein', ['din', 'sou'], 127, 8.7, 22.8, 0.5, { max: 250, kw: ['haricot rouge', 'legumineuse', 'fèves'], brands: 'en conserve (ex. Unico, Kirkland, Irresistibles)' }),

  // ---------- Glucides ----------
  // Plafonds relevés pour rester précis même sur de grosses cibles (ex. prise de masse à 3500-4000+ kcal).
  F('avoine', 'Flocons d’avoine (secs)', 'carb', ['dej'], 379, 13, 68, 6.5, { max: 160, allergens: ['gluten'], kw: ['avoine', 'gruau'], brands: 'Quaker, Nature’s Path' }),
  F('avoine_sg', 'Flocons d’avoine sans gluten (secs)', 'carb', ['dej'], 379, 13, 68, 6.5, { max: 120, kw: ['avoine', 'gruau'], brands: 'Bob’s Red Mill (certifiés sans gluten), Nature’s Path' }),
  F('pain', 'Pain de blé entier', 'carb', ['dej'], 247, 13, 41, 3.4, { max: 105, allergens: ['gluten'], unit: { n: 'tranche', p: 'tranches', g: 35, whole: true }, kw: ['pain', 'ble'], brands: 'Dempster’s, Bon Matin, Kirkland' }),
  F('riz', 'Riz blanc cuit', 'carb', ['din', 'sou'], 130, 2.7, 28, 0.3, { max: 400, kw: ['riz'], brands: 'Sun-Rice, Ben’s Original, Kirkland' }),
  F('riz_brun', 'Riz brun cuit', 'carb', ['din', 'sou'], 123, 2.7, 26, 1, { max: 400, kw: ['riz'], brands: 'Sun-Rice, Ben’s Original, Kirkland' }),
  F('pates', 'Pâtes cuites', 'carb', ['din', 'sou'], 158, 5.8, 31, 0.9, { max: 400, allergens: ['gluten'], kw: ['pate', 'spaghetti'], brands: 'Barilla, Catelli, Kirkland' }),
  F('pates_sg', 'Pâtes sans gluten cuites (riz/maïs)', 'carb', ['din', 'sou'], 150, 3, 32, 1, { max: 400, kw: ['pate', 'spaghetti'], brands: 'Barilla sans gluten, Catelli sans gluten' }),
  F('patate', 'Pomme de terre cuite', 'carb', ['din', 'sou'], 87, 1.9, 20, 0.1, { max: 500, kw: ['patate', 'pomme de terre'], brands: 'n’importe laquelle (fraîche)' }),
  F('patate_douce', 'Patate douce cuite', 'carb', ['din', 'sou'], 90, 2, 21, 0.2, { max: 450, kw: ['patate douce'], brands: 'fraîche' }),
  F('quinoa', 'Quinoa cuit', 'carb', ['din', 'sou'], 120, 4.4, 21, 1.9, { max: 350, kw: ['quinoa'], brands: 'Ancient Harvest, Kirkland, Irresistibles' }),

  // ---------- Lipides ----------
  F('huile', 'Huile d’olive', 'fat', ['dej', 'din', 'sou'], 884, 0, 0, 100, { max: 20, unit: { n: 'c. à thé', p: 'c. à thé', g: 5, whole: true }, kw: ['huile'], brands: 'Bertolli, Filippo Berio, Kirkland' }),
  F('avocat', 'Avocat', 'fat', ['dej', 'din', 'sou'], 160, 2, 9, 15, { max: 150, unit: { n: 'demi-avocat', p: 'demi-avocats', g: 75, whole: true }, kw: ['avocat'], brands: 'frais' }),
  F('amandes', 'Amandes', 'fat', ['dej'], 579, 21, 22, 50, { max: 35, allergens: ['noix'], kw: ['amande', 'noix'], brands: 'Blue Diamond, Kirkland, Planters' }),
  F('grenoble', 'Noix de Grenoble', 'fat', ['dej', 'din', 'sou'], 654, 15, 14, 65, { max: 35, allergens: ['noix'], kw: ['grenoble', 'noix'], brands: 'Kirkland, Planters' }),
  F('arachide', 'Beurre d’arachide naturel', 'fat', ['dej'], 588, 25, 20, 50, { max: 32, allergens: ['arachide'], unit: { n: 'c. à soupe', p: 'c. à soupe', g: 16 }, kw: ['arachide', 'peanut'], brands: 'Adams, Kraft, Kirkland' }),
  F('beurre', 'Beurre', 'fat', ['dej', 'din', 'sou'], 717, 0.9, 0.1, 81, { max: 20, allergens: ['lait'], unit: { n: 'c. à thé', p: 'c. à thé', g: 5, whole: true }, kw: ['beurre'], brands: 'Lactantia, Beatrice, Kirkland' }),

  // ---------- Fruits ----------
  F('banane', 'Banane', 'fruit', ['dej', 'col'], 89, 1.1, 23, 0.3, { unit: { n: 'banane', p: 'bananes', g: 120, whole: true }, kw: ['banane'], brands: 'fraîche' }),
  F('pomme', 'Pomme', 'fruit', ['dej', 'col'], 52, 0.3, 14, 0.2, { unit: { n: 'pomme', p: 'pommes', g: 180, whole: true }, kw: ['pomme'], brands: 'fraîche' }),
  F('bleuets', 'Bleuets', 'fruit', ['dej', 'col'], 57, 0.7, 14.5, 0.3, { kw: ['bleuet', 'petits fruits'], brands: 'frais ou surgelés' }),
  F('fraises', 'Fraises', 'fruit', ['dej', 'col'], 32, 0.7, 7.7, 0.3, { kw: ['fraise', 'petits fruits'], brands: 'fraîches ou surgelées' }),
  F('orange', 'Orange', 'fruit', ['dej', 'col'], 47, 0.9, 12, 0.1, { unit: { n: 'orange', p: 'oranges', g: 130, whole: true }, kw: ['orange', 'agrume'], brands: 'fraîche' }),

  // ---------- Légumes ----------
  F('brocoli', 'Brocoli cuit', 'veg', ['din', 'sou'], 35, 2.4, 7, 0.4, { kw: ['brocoli'], brands: 'frais ou surgelé' }),
  F('legumes', 'Légumes variés cuits', 'veg', ['din', 'sou'], 40, 2, 8, 0.4, { kw: ['legume'], brands: 'frais ou surgelés (ex. Kirkland, Irresistibles)' }),
  F('haricots', 'Haricots verts cuits', 'veg', ['din', 'sou'], 31, 1.8, 7, 0.2, { kw: ['haricot'], brands: 'frais ou surgelés' }),
  F('salade', 'Salade verte', 'veg', ['din', 'sou'], 15, 1.3, 2.9, 0.2, { kw: ['salade', 'laitue'], brands: 'fraîche' }),
];

export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Un aliment d'un repas vient soit de la liste ci-dessus (id), soit d'une recherche externe (custom).
export const resolveFood = (id, custom) => custom || FOOD_BY_ID[id];

// Construit un aliment « personnalisé » à partir d'un résultat de recherche (Open Food Facts).
export function externalFood({ id, name, brands, k, p, c, f }) {
  return { id, name, per100: { k, p, c, f }, max: 500, allergens: [], brands: brands || 'Trouvé par recherche : vérifie l’étiquette de l’emballage.', external: true };
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Cet aliment convient-il à la personne ? (allergies, régime, aliments non aimés)
export function allowed(food, prefs = {}) {
  const allergies = prefs.allergies || [];
  if (food.allergens.some((a) => allergies.includes(a))) return false;
  const diet = prefs.diet || 'aucun';
  if (diet === 'vegetarien' && (food.animal === 'meat' || food.animal === 'fish')) return false;
  if (diet === 'vegetalien' && food.animal) return false;
  if (diet === 'pescetarien' && food.animal === 'meat') return false;
  if (diet === 'sans_porc' && food.pork) return false;
  // « oeufs, saumon » -> on retire le « s » final pour reconnaître le pluriel
  const dislikes = String(prefs.dislikes || '').split(/[,;\n]/).map((s) => norm(s.trim()).replace(/s$/, '')).filter((s) => s.length >= 3);
  // Autres allergies (recherche du formulaire) : même règle que les aliments non aimés, par nom et mots-clés.
  // Une allergie tapée en plusieurs mots compte aussi chaque mot important (« fraises des bois » écarte les fraises) :
  // pour une allergie, mieux vaut écarter trop d'aliments que pas assez.
  const words = (s) => [s, ...(s.includes(' ') ? s.split(/\s+/).filter((w) => w.length >= 4) : [])];
  const others = (prefs.other_allergies || []).flatMap((a) => EXTRA_ALLERGIES[a]?.terms || words(norm(a.trim())))
    .map((s) => norm(s.trim()).replace(/s$/, '')).filter((s) => s.length >= 3);
  const hay = [norm(food.name), ...(food.kw || []).map(norm)];
  return ![...dislikes, ...others].some((d) => hay.some((h) => h.includes(d)));
}
