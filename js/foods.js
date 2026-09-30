// Base d'aliments du plan alimentaire : aliments courants d'une épicerie du Québec.
// Valeurs pour 100 g (k = kcal, p = protéines, c = glucides, f = lipides), aliments cuits sauf indication, tirées du
// Fichier canadien sur les éléments nutritifs de Santé Canada (sauf poudres de protéines, tofu extra-ferme et pâtes
// sans gluten : valeurs d'étiquettes courantes).
// Les marques sont des EXEMPLES courants au Québec : les valeurs varient selon la marque, vérifie l'étiquette.
// Pour ajouter un aliment : ajoute une ligne dans FOODS.
//   role   : protein | carb | fat | fruit | veg | milk (lait ou boisson végétale, 1 tasse)
//   slots  : repas où il peut apparaître (dej = déjeuner, din = dîner, sou = souper, col = collation)
//   max    : quantité maximale raisonnable par repas, en grammes
//   animal : meat | fish | dairy | egg (sert aux régimes végétarien / végétalien / pescétarien)
//   pork   : true pour le porc (régime « sans porc »)
//   vegOnly : offert seulement aux végétariens et végétaliens (ex. tofu)
//   allergens : arachide, noix, lait, oeuf, gluten, soya, poisson, crustaces, sesame
//   unit   : { n: nom, p: pluriel, g: grammes par unité, whole: unités entières seulement }
//   kw     : mots-clés pour reconnaître ce que la personne n'aime pas
//   short  : nom court pour nommer un repas (« Bol poulet, riz et brocoli »)
//   cost   : prix relatif, 1 = économique, 2 = moyen, 3 = cher (budget « serré » : on évite les 3)
//   min    : plus petite portion qui a du sens dans une assiette
//   legume : légumineuse (base d'un repas seulement pour les végétariens : trop peu de protéines pour les autres)
//   liquid : se compte en litres dans la liste d'épicerie
//   cup    : grammes dans 1 tasse (250 ml), pour afficher « 260 g (≈ 1 ¾ tasse) » quand l'aliment ne se compte pas à l'unité
//   common : aliment que la plupart des gens achètent (poulet, bœuf, porc, riz, pâtes, patates…) : les repas sont
//            composés d'office avec ces aliments ; les autres restent offerts en remplacement (bouton ↔)
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
  F('poulet', 'Poitrine de poulet cuite', 'protein', ['din', 'sou'], 165, 31, 0, 3.6, { common: true, short: 'poulet', cost: 2, min: 100, max: 300, animal: 'meat', kw: ['poulet', 'volaille'], brands: 'n’importe quelle marque (ex. Flamingo, Maple Leaf, Kirkland)' }),
  F('cuisse_poulet', 'Haut de cuisse de poulet sans peau, cuit', 'protein', ['din', 'sou'], 179, 24.8, 0, 8.2, { common: true, short: 'poulet (cuisse)', cost: 1, min: 100, max: 250, animal: 'meat', kw: ['poulet', 'volaille', 'cuisse'], brands: 'désossé sans peau, n’importe quelle marque (souvent moins cher que la poitrine)' }),
  F('dinde', 'Poitrine de dinde cuite', 'protein', ['din', 'sou'], 150, 30.2, 0, 2.3, { short: 'dinde', cost: 2, min: 100, max: 300, animal: 'meat', kw: ['dinde', 'volaille'], brands: 'n’importe quelle marque (ex. Butterball, Maple Leaf)' }),
  F('dinde_hachee', 'Dinde hachée cuite', 'protein', ['din', 'sou'], 196, 27.6, 0, 8.7, { short: 'dinde hachée', cost: 1, min: 100, max: 250, animal: 'meat', kw: ['dinde', 'volaille', 'hache'], brands: 'n’importe quelle marque (ex. Butterball, marque de l’épicerie)' }),
  F('boeuf', 'Bœuf haché extra-maigre cuit', 'protein', ['din', 'sou'], 222, 30.6, 0, 10.1, { common: true, short: 'bœuf haché', cost: 2, min: 100, max: 250, animal: 'meat', kw: ['boeuf', 'viande', 'hache'], brands: 'extra-maigre (ex. Kirkland, marque de l’épicerie)' }),
  F('boeuf_maigre', 'Bœuf haché maigre cuit', 'protein', ['din', 'sou'], 233, 25.9, 0, 14.4, { common: true, short: 'bœuf haché', cost: 1, min: 100, max: 200, animal: 'meat', kw: ['boeuf', 'viande', 'hache'], brands: 'maigre (moins cher que l’extra-maigre), n’importe quelle marque' }),
  F('bifteck', 'Bifteck de surlonge grillé', 'protein', ['din', 'sou'], 172, 29, 0, 5.2, { common: true, short: 'bifteck', cost: 3, min: 100, max: 250, animal: 'meat', kw: ['boeuf', 'viande', 'steak', 'bifteck'], brands: 'haut de surlonge, dégraissé' }),
  F('porc', 'Filet de porc cuit', 'protein', ['din', 'sou'], 144, 28.4, 0, 2.5, { common: true, short: 'porc', cost: 2, min: 100, max: 300, animal: 'meat', pork: true, kw: ['porc', 'viande'], brands: 'filet ou longe, n’importe quelle marque' }),
  F('jambon', 'Jambon cuit tranché', 'protein', ['dej', 'din'], 122, 14.6, 5.8, 4.1, { common: true, short: 'jambon', cost: 2, min: 50, max: 120, animal: 'meat', pork: true, kw: ['jambon', 'porc', 'charcuterie'], brands: 'réduit en sodium si possible (ex. Maple Leaf, Olymel)' }),
  F('saumon', 'Saumon cuit', 'protein', ['din', 'sou'], 206, 22.1, 0, 12.3, { short: 'saumon', cost: 3, min: 100, max: 250, animal: 'fish', allergens: ['poisson'], kw: ['saumon', 'poisson'], brands: 'frais ou surgelé (ex. Kirkland, Irresistibles)' }),
  F('truite', 'Truite arc-en-ciel cuite', 'protein', ['din', 'sou'], 168, 23.8, 0, 7.4, { short: 'truite', cost: 3, min: 100, max: 250, animal: 'fish', allergens: ['poisson'], kw: ['truite', 'poisson'], brands: 'fraîche ou surgelée' }),
  F('morue', 'Poisson blanc cuit (morue, tilapia)', 'protein', ['din', 'sou'], 105, 22.8, 0, 0.9, { short: 'poisson blanc', cost: 2, min: 100, max: 350, animal: 'fish', allergens: ['poisson'], kw: ['morue', 'tilapia', 'poisson'], brands: 'frais ou surgelé, n’importe quelle marque' }),
  F('thon', 'Thon en conserve (eau, égoutté)', 'protein', ['din', 'sou', 'col'], 116, 25.5, 0, 0.8, { short: 'thon', cost: 1, min: 85, max: 200, animal: 'fish', allergens: ['poisson'], kw: ['thon', 'poisson'], brands: 'Clover Leaf, Bumble Bee, Kirkland' }),
  F('sardines', 'Sardines en conserve, sauce tomate', 'protein', ['din', 'sou'], 185, 20.9, 0.5, 10.4, { short: 'sardines', cost: 1, min: 80, max: 150, animal: 'fish', allergens: ['poisson'], kw: ['sardine', 'poisson'], brands: 'Brunswick, Clover Leaf' }),
  F('crevettes', 'Crevettes cuites', 'protein', ['din', 'sou'], 119, 22.8, 1.5, 1.7, { short: 'crevettes', cost: 3, min: 100, max: 250, animal: 'fish', allergens: ['crustaces'], kw: ['crevette', 'fruits de mer'], brands: 'surgelées décortiquées (ex. Kirkland, Irresistibles)' }),
  F('oeufs', 'Œufs entiers', 'protein', ['dej', 'din', 'sou', 'col'], 141, 11.8, 1.9, 10, { common: true, short: 'œufs', cost: 1, min: 100, max: 250, animal: 'egg', allergens: ['oeuf'], unit: { n: 'œuf', p: 'œufs', g: 50, whole: true }, kw: ['oeuf'], brands: 'Burnbrae Farms, Nutri, œufs de catégorie A' }),
  F('yogourt', 'Yogourt grec nature 0 %', 'protein', ['dej', 'col'], 58, 10.5, 3.2, 0, { common: true, short: 'yogourt grec', cost: 2, min: 150, max: 400, animal: 'dairy', allergens: ['lait'], kw: ['yogourt', 'yaourt', 'yogurt'], brands: 'Oikos, Iögo, Liberté, Astro' }),
  F('ficelle', 'Fromage ficelle (mozzarella)', 'protein', ['col'], 254, 24.3, 2.8, 15.9, { common: true, short: 'fromage ficelle', cost: 2, min: 21, max: 63, animal: 'dairy', allergens: ['lait'], unit: { n: 'bâtonnet', p: 'bâtonnets', g: 21, whole: true }, kw: ['fromage', 'ficelle', 'mozzarella'], brands: 'Black Diamond, Ficello, marque de l’épicerie' }),
  F('whey', 'Whey', 'protein', ['dej', 'col'], 400, 80, 10, 5, { common: true, short: 'whey', cost: 2, min: 30, max: 60, supplement: true, animal: 'dairy', allergens: ['lait'], unit: { n: 'mesure', p: 'mesures', g: 30 }, kw: ['whey', 'poudre', 'proteine'], brands: 'Optimum Nutrition Gold Standard, Dymatize ISO100, Isopure, Kirkland' }),
  F('vegprot', 'Poudre de protéines végétales (pois/riz)', 'protein', ['dej', 'col'], 380, 75, 8, 6, { short: 'protéines végétales en poudre', cost: 3, min: 30, max: 60, supplement: true, unit: { n: 'mesure', p: 'mesures', g: 30 }, kw: ['poudre', 'proteine', 'vegetale'], brands: 'Vega Sport, Sunwarrior, Garden of Life' }),
  F('tofu', 'Tofu ferme', 'protein', ['din', 'sou'], 140, 16, 3, 8, { vegOnly: true, short: 'tofu', cost: 1, min: 100, max: 250, allergens: ['soya'], kw: ['tofu', 'soya'], brands: 'Unisoya, Sunrise Soya Foods' }),
  F('haricots_rouges', 'Haricots rouges cuits', 'protein', ['din', 'sou'], 121, 8.1, 20.8, 0.9, { short: 'haricots rouges', cost: 1, legume: true, min: 120, max: 250, kw: ['haricot rouge', 'legumineuse', 'fèves'], brands: 'en conserve, égouttés et rincés (ex. Unico, Kirkland, Irresistibles)' }),
  F('haricots_noirs', 'Haricots noirs cuits', 'protein', ['din', 'sou'], 132, 8.9, 23.7, 0.5, { short: 'haricots noirs', cost: 1, legume: true, min: 120, max: 250, kw: ['haricot noir', 'legumineuse'], brands: 'en conserve, égouttés et rincés (ex. Unico, Compliments)' }),
  F('pois_chiches', 'Pois chiches cuits', 'protein', ['din', 'sou'], 138, 7, 22.9, 2.5, { short: 'pois chiches', cost: 1, legume: true, min: 120, max: 250, kw: ['pois chiche', 'legumineuse'], brands: 'en conserve, égouttés et rincés (ex. Unico, Compliments)' }),

  // ---------- Glucides (féculents) ----------
  F('avoine', 'Flocons d’avoine (secs)', 'carb', ['dej'], 388, 13.3, 66.7, 7.2, { common: true, short: 'gruau', cost: 1, min: 30, max: 100, allergens: ['gluten'], kw: ['avoine', 'gruau'], brands: 'Quaker, Nature’s Path' }),
  F('avoine_sg', 'Flocons d’avoine sans gluten (secs)', 'carb', ['dej'], 379, 13, 68, 6.5, { common: true, short: 'gruau', cost: 2, gf: true, min: 30, max: 100, kw: ['avoine', 'gruau'], brands: 'Bob’s Red Mill (certifiés sans gluten), Nature’s Path' }),
  F('creme_ble', 'Crème de blé (sèche)', 'carb', ['dej'], 382, 13.2, 77.1, 1.2, { short: 'crème de blé', cost: 1, min: 30, max: 100, allergens: ['gluten'], kw: ['creme de ble', 'ble'], brands: 'Crème de blé (B&G), marque de l’épicerie' }),
  F('cereales', 'Céréales d’avoine (type Cheerios)', 'carb', ['dej'], 397, 12.9, 72.7, 6.3, { common: true, short: 'céréales', cost: 2, min: 30, max: 90, allergens: ['gluten'], kw: ['cereale', 'cheerios', 'avoine'], brands: 'Cheerios, marque de l’épicerie' }),
  F('pain', 'Pain de blé entier', 'carb', ['dej', 'din', 'sou'], 257, 10.7, 45.6, 3, { common: true, short: 'rôties', cost: 1, min: 35, max: 105, allergens: ['gluten'], unit: { n: 'tranche', p: 'tranches', g: 35, whole: true }, kw: ['pain', 'ble', 'roties'], brands: 'Dempster’s, Bon Matin, Kirkland' }),
  F('bagel', 'Bagel nature', 'carb', ['dej'], 264, 10.6, 52.4, 1.3, { common: true, short: 'bagel', cost: 2, min: 90, max: 180, allergens: ['gluten'], unit: { n: 'bagel', p: 'bagels', g: 90, whole: true }, kw: ['bagel', 'ble'], brands: 'St-Viateur, Fairmount, marque de l’épicerie' }),
  F('muffin_anglais', 'Muffin anglais de blé', 'carb', ['dej'], 223, 8.7, 44.8, 2, { common: true, short: 'muffin anglais', cost: 1, min: 57, max: 114, allergens: ['gluten'], unit: { n: 'muffin anglais', p: 'muffins anglais', g: 57, whole: true }, kw: ['muffin', 'ble'], brands: 'Dempster’s, Weston' }),
  F('tortilla', 'Tortilla de blé (grande)', 'carb', ['din', 'sou'], 325, 8.7, 55.6, 7.1, { common: true, short: 'tortilla', cost: 1, min: 70, max: 140, allergens: ['gluten'], unit: { n: 'tortilla', p: 'tortillas', g: 70, whole: true }, kw: ['tortilla', 'wrap', 'ble'], brands: 'Old El Paso, Dempster’s, Mission' }),
  F('pita', 'Pain pita de blé entier', 'carb', ['din', 'sou'], 266, 9.8, 55, 2.6, { short: 'pita', cost: 1, min: 64, max: 128, allergens: ['gluten'], unit: { n: 'pita', p: 'pitas', g: 64, whole: true }, kw: ['pita', 'pain', 'ble'], brands: 'Pita Break, marque de l’épicerie' }),
  F('riz', 'Riz blanc cuit', 'carb', ['din', 'sou'], 130, 2.7, 28.2, 0.3, { common: true, short: 'riz', cost: 1, min: 100, max: 300, kw: ['riz'], brands: 'Sun-Rice, Ben’s Original, Kirkland' }),
  F('riz_brun', 'Riz brun cuit', 'carb', ['din', 'sou'], 111, 2.6, 23, 0.9, { short: 'riz brun', cost: 1, min: 100, max: 300, kw: ['riz'], brands: 'Sun-Rice, Ben’s Original, Kirkland' }),
  F('pates', 'Pâtes cuites', 'carb', ['din', 'sou'], 158, 5.8, 30.9, 0.9, { common: true, short: 'pâtes', cost: 1, min: 100, max: 300, allergens: ['gluten'], kw: ['pate', 'spaghetti'], brands: 'Barilla, Catelli, Kirkland' }),
  F('pates_sg', 'Pâtes sans gluten cuites (riz/maïs)', 'carb', ['din', 'sou'], 150, 3, 32, 1, { common: true, short: 'pâtes', cost: 2, gf: true, min: 100, max: 300, kw: ['pate', 'spaghetti'], brands: 'Barilla sans gluten, Catelli sans gluten' }),
  F('nouilles_riz', 'Nouilles de riz cuites', 'carb', ['din', 'sou'], 108, 1.8, 24, 0.2, { short: 'nouilles de riz', cost: 2, min: 100, max: 300, kw: ['nouille', 'riz'], brands: 'Thai Kitchen, Sun-Luck' }),
  F('couscous', 'Couscous cuit', 'carb', ['din', 'sou'], 112, 3.8, 23.2, 0.2, { short: 'couscous', cost: 1, min: 100, max: 300, allergens: ['gluten'], kw: ['couscous', 'ble'], brands: 'Casbah, marque de l’épicerie' }),
  F('orge', 'Orge perlé cuit', 'carb', ['din', 'sou'], 123, 2.3, 28.2, 0.4, { short: 'orge', cost: 1, min: 100, max: 300, allergens: ['gluten'], kw: ['orge'], brands: 'marque de l’épicerie' }),
  F('quinoa', 'Quinoa cuit', 'carb', ['din', 'sou'], 120, 4.4, 21.3, 1.9, { short: 'quinoa', cost: 2, min: 100, max: 300, kw: ['quinoa'], brands: 'Ancient Harvest, Kirkland, Irresistibles' }),
  F('patate', 'Pomme de terre cuite', 'carb', ['din', 'sou'], 87, 1.9, 20.1, 0.1, { common: true, short: 'pommes de terre', cost: 1, min: 150, max: 400, kw: ['patate', 'pomme de terre'], brands: 'n’importe laquelle (fraîche)' }),
  F('patate_douce', 'Patate douce cuite', 'carb', ['din', 'sou'], 90, 2, 20.7, 0.1, { short: 'patate douce', cost: 1, min: 150, max: 400, kw: ['patate douce'], brands: 'fraîche' }),
  F('mais', 'Maïs en grains cuit', 'carb', ['din', 'sou'], 96, 3.4, 21, 1.5, { common: true, short: 'maïs', cost: 1, min: 80, max: 250, kw: ['mais'], brands: 'surgelé ou en conserve (ex. Green Giant, Del Monte)' }),
  F('galette_riz', 'Galettes de riz', 'carb', ['col'], 387, 8.2, 81.5, 2.8, { common: true, short: 'galettes de riz', cost: 1, min: 9, max: 36, unit: { n: 'galette', p: 'galettes', g: 9, whole: true }, kw: ['galette', 'riz'], brands: 'Quaker, Suzie’s' }),
  F('craquelins', 'Craquelins de blé entier', 'carb', ['col'], 427, 10.6, 69.5, 14.1, { common: true, short: 'craquelins', cost: 2, min: 20, max: 60, allergens: ['gluten'], kw: ['craquelin', 'ble'], brands: 'Triscuit, Breton' }),
  F('lait_choco', 'Lait au chocolat 2 %', 'carb', ['col'], 77, 3, 12.1, 1.9, { common: true, liquid: true, short: 'lait au chocolat', cost: 1, min: 258, max: 516, animal: 'dairy', allergens: ['lait'], unit: { n: 'tasse (250 ml)', p: 'tasses (250 ml)', g: 258, whole: true }, kw: ['lait', 'chocolat'], brands: 'Natrel, Québon' }),

  // ---------- Lait (1 tasse dans un smoothie, un gruau, des céréales) ----------
  F('lait', 'Lait 2 %', 'milk', ['dej', 'col'], 50, 3.4, 4.9, 2, { common: true, short: 'lait', cost: 1, liquid: true, animal: 'dairy', allergens: ['lait'], unit: { n: 'tasse (250 ml)', p: 'tasses (250 ml)', g: 258, whole: true }, kw: ['lait'], brands: 'Natrel, Québon, Lactantia' }),
  F('boisson_soya', 'Boisson de soya enrichie', 'milk', ['dej', 'col'], 39, 2.7, 3.1, 1.6, { common: true, short: 'boisson de soya', cost: 2, liquid: true, allergens: ['soya'], unit: { n: 'tasse (250 ml)', p: 'tasses (250 ml)', g: 258, whole: true }, kw: ['soya', 'boisson vegetale'], brands: 'Silk, Natura, So Nice' }),

  // ---------- Lipides ----------
  F('huile', 'Huile d’olive', 'fat', ['din', 'sou'], 885, 0, 0, 100, { common: true, short: 'huile d’olive', cost: 2, max: 20, unit: { n: 'c. à thé', p: 'c. à thé', g: 5, whole: true }, kw: ['huile', 'olive'], brands: 'Bertolli, Filippo Berio, Kirkland' }),
  F('huile_canola', 'Huile de canola', 'fat', ['din', 'sou'], 885, 0, 0, 100, { common: true, short: 'huile de canola', cost: 1, max: 20, unit: { n: 'c. à thé', p: 'c. à thé', g: 5, whole: true }, kw: ['huile', 'canola'], brands: 'Crisco, Mazola, marque de l’épicerie' }),
  F('avocat', 'Avocat', 'fat', ['dej', 'din', 'sou'], 160, 2, 8.5, 14.7, { common: true, short: 'avocat', cost: 2, max: 150, unit: { n: 'demi-avocat', p: 'demi-avocats', g: 75, whole: true }, kw: ['avocat'], brands: 'frais' }),
  F('amandes', 'Amandes', 'fat', ['dej'], 579, 21.1, 21.6, 49.9, { common: true, short: 'amandes', cost: 3, max: 35, allergens: ['noix'], kw: ['amande', 'noix'], brands: 'Blue Diamond, Kirkland, Planters' }),
  F('grenoble', 'Noix de Grenoble', 'fat', ['dej', 'din', 'sou'], 655, 15.2, 13.7, 65.2, { common: true, short: 'noix de Grenoble', cost: 3, max: 35, allergens: ['noix'], kw: ['grenoble', 'noix'], brands: 'Kirkland, Planters' }),
  F('arachide', 'Beurre d’arachide naturel', 'fat', ['dej'], 585, 23.7, 21.5, 49.7, { common: true, short: 'beurre d’arachide', cost: 1, max: 32, allergens: ['arachide'], unit: { n: 'c. à soupe', p: 'c. à soupe', g: 16 }, kw: ['arachide', 'peanut'], brands: 'Adams, Kraft, Kirkland' }),
  F('beurre_amande', 'Beurre d’amande', 'fat', ['dej'], 614, 21, 18.8, 55.5, { short: 'beurre d’amande', cost: 3, max: 32, allergens: ['noix'], unit: { n: 'c. à soupe', p: 'c. à soupe', g: 16 }, kw: ['amande', 'noix'], brands: 'Nuts to You, Kirkland' }),
  F('beurre', 'Beurre', 'fat', ['dej', 'din', 'sou'], 717, 0.8, 0.1, 81.1, { common: true, short: 'beurre', cost: 1, max: 20, allergens: ['lait'], animal: 'dairy', unit: { n: 'c. à thé', p: 'c. à thé', g: 5, whole: true }, kw: ['beurre'], brands: 'Lactantia, Beatrice, Kirkland' }),
  F('cheddar', 'Fromage cheddar', 'fat', ['dej', 'din', 'sou'], 406, 24, 1.3, 33.8, { common: true, short: 'cheddar', cost: 2, min: 15, max: 40, animal: 'dairy', allergens: ['lait'], kw: ['fromage', 'cheddar'], brands: 'Black Diamond, Cracker Barrel, Perron' }),
  F('mozza', 'Mozzarella partiellement écrémée', 'fat', ['din', 'sou'], 254, 24.3, 2.8, 15.9, { common: true, short: 'mozzarella', cost: 2, min: 20, max: 50, animal: 'dairy', allergens: ['lait'], kw: ['fromage', 'mozzarella'], brands: 'Saputo, Black Diamond' }),
  F('hummus', 'Hummus', 'fat', ['din', 'sou'], 166, 7.9, 14.3, 9.6, { short: 'hummus', cost: 2, min: 30, max: 90, allergens: ['sesame'], kw: ['hummus', 'pois chiche'], brands: 'Fontaine Santé, Sabra' }),
  F('olives', 'Olives noires', 'fat', ['din', 'sou'], 115, 0.8, 6.3, 10.7, { short: 'olives', cost: 2, min: 15, max: 60, kw: ['olive'], brands: 'Unico, Irresistibles' }),

  // ---------- Fruits ----------
  F('banane', 'Banane', 'fruit', ['dej', 'col'], 89, 1.1, 22.8, 0.3, { common: true, short: 'banane', cost: 1, unit: { n: 'banane', p: 'bananes', g: 120, whole: true }, kw: ['banane'], brands: 'fraîche' }),
  F('pomme', 'Pomme', 'fruit', ['dej', 'col'], 52, 0.3, 13.8, 0.2, { common: true, short: 'pomme', cost: 1, unit: { n: 'pomme', p: 'pommes', g: 180, whole: true }, kw: ['pomme'], brands: 'fraîche (ex. McIntosh, Cortland du Québec)' }),
  F('poire', 'Poire', 'fruit', ['dej', 'col'], 57, 0.4, 15.2, 0.1, { short: 'poire', cost: 1, unit: { n: 'poire', p: 'poires', g: 180, whole: true }, kw: ['poire'], brands: 'fraîche' }),
  F('orange', 'Orange', 'fruit', ['dej', 'col'], 47, 0.9, 11.8, 0.1, { common: true, short: 'orange', cost: 1, unit: { n: 'orange', p: 'oranges', g: 130, whole: true }, kw: ['orange', 'agrume'], brands: 'fraîche' }),
  F('kiwi', 'Kiwi', 'fruit', ['dej', 'col'], 61, 1.1, 14.7, 0.5, { short: 'kiwi', cost: 2, unit: { n: 'kiwi', p: 'kiwis', g: 75, whole: true }, kw: ['kiwi'], brands: 'frais' }),
  F('bleuets', 'Bleuets', 'fruit', ['dej', 'col'], 57, 0.7, 14.5, 0.3, { cup: 148, common: true, short: 'bleuets', cost: 2, kw: ['bleuet', 'petits fruits'], brands: 'frais ou surgelés' }),
  F('fraises', 'Fraises', 'fruit', ['dej', 'col'], 33, 0.7, 7.7, 0.3, { cup: 150, common: true, short: 'fraises', cost: 2, kw: ['fraise', 'petits fruits'], brands: 'fraîches ou surgelées' }),
  F('framboises', 'Framboises', 'fruit', ['dej', 'col'], 53, 1.2, 11.9, 0.7, { cup: 125, short: 'framboises', cost: 3, kw: ['framboise', 'petits fruits'], brands: 'fraîches ou surgelées' }),
  F('raisins', 'Raisins', 'fruit', ['dej', 'col'], 69, 0.7, 18.1, 0.2, { cup: 150, common: true, short: 'raisins', cost: 2, kw: ['raisin'], brands: 'frais, rouges ou verts' }),
  F('mangue', 'Mangue', 'fruit', ['dej', 'col'], 60, 0.8, 15, 0.4, { cup: 165, short: 'mangue', cost: 2, kw: ['mangue'], brands: 'fraîche ou en morceaux surgelés' }),
  F('ananas', 'Ananas', 'fruit', ['dej', 'col'], 50, 0.5, 13.1, 0.1, { cup: 165, short: 'ananas', cost: 2, kw: ['ananas'], brands: 'frais ou en morceaux' }),
  F('melon_eau', 'Melon d’eau', 'fruit', ['dej', 'col'], 30, 0.6, 7.5, 0.1, { cup: 155, short: 'melon d’eau', cost: 1, kw: ['melon', 'pasteque'], brands: 'frais' }),
  F('cantaloup', 'Cantaloup', 'fruit', ['dej', 'col'], 34, 0.8, 8.2, 0.2, { cup: 160, short: 'cantaloup', cost: 1, kw: ['melon', 'cantaloup'], brands: 'frais' }),

  // ---------- Légumes ----------
  F('brocoli', 'Brocoli cuit', 'veg', ['din', 'sou'], 35, 2.4, 7.2, 0.4, { common: true, short: 'brocoli', cost: 1, kw: ['brocoli'], brands: 'frais ou surgelé' }),
  F('legumes', 'Légumes variés cuits', 'veg', ['din', 'sou'], 39, 2, 8.4, 0.4, { common: true, short: 'légumes', cost: 1, kw: ['legume'], brands: 'mélange frais ou surgelé (ex. Kirkland, Irresistibles)' }),
  F('haricots', 'Haricots verts cuits', 'veg', ['din', 'sou'], 35, 1.9, 7.9, 0.3, { common: true, short: 'haricots verts', cost: 1, kw: ['haricot'], brands: 'frais ou surgelés' }),
  F('salade', 'Salade verte', 'veg', ['din', 'sou'], 17, 1.2, 3.3, 0.3, { common: true, short: 'salade', cost: 1, kw: ['salade', 'laitue'], brands: 'fraîche' }),
  F('epinards', 'Épinards', 'veg', ['dej', 'din', 'sou'], 23, 2.9, 3.6, 0.4, { short: 'épinards', cost: 1, kw: ['epinard'], brands: 'frais (bébés épinards) ou surgelés' }),
  F('carottes', 'Carottes', 'veg', ['din', 'sou'], 41, 0.9, 9.6, 0.2, { common: true, short: 'carottes', cost: 1, kw: ['carotte'], brands: 'fraîches' }),
  F('poivron', 'Poivron', 'veg', ['dej', 'din', 'sou'], 31, 1, 6, 0.3, { common: true, short: 'poivron', cost: 2, kw: ['poivron'], brands: 'frais' }),
  F('courgette', 'Courgette cuite', 'veg', ['din', 'sou'], 15, 1.1, 2.7, 0.4, { short: 'courgette', cost: 1, kw: ['courgette', 'zucchini'], brands: 'fraîche' }),
  F('asperges', 'Asperges cuites', 'veg', ['din', 'sou'], 22, 2.4, 4.1, 0.2, { short: 'asperges', cost: 3, kw: ['asperge'], brands: 'fraîches' }),
  F('champignons', 'Champignons', 'veg', ['dej', 'din', 'sou'], 22, 3.1, 3.3, 0.3, { short: 'champignons', cost: 2, kw: ['champignon'], brands: 'frais' }),
  F('concombre', 'Concombre', 'veg', ['din', 'sou'], 16, 0.7, 3.6, 0.1, { common: true, short: 'concombre', cost: 1, kw: ['concombre'], brands: 'frais' }),
  F('tomates', 'Tomates', 'veg', ['dej', 'din', 'sou'], 18, 0.9, 3.9, 0.2, { common: true, short: 'tomates', cost: 1, kw: ['tomate'], brands: 'fraîches ou en conserve' }),
  F('pois_verts', 'Petits pois', 'veg', ['din', 'sou'], 78, 5.2, 14.3, 0.3, { short: 'petits pois', cost: 1, kw: ['pois'], brands: 'surgelés' }),
  F('choux_bruxelles', 'Choux de Bruxelles cuits', 'veg', ['din', 'sou'], 36, 2.5, 7.1, 0.5, { short: 'choux de Bruxelles', cost: 2, kw: ['chou de bruxelles', 'choux'], brands: 'frais ou surgelés' }),
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
  // Pâtes ou avoine « sans gluten » : seulement si la personne évite le gluten (sinon, la version normale suffit)
  if (food.gf && !allergies.includes('gluten')) return false;
  const diet = prefs.diet || 'aucun';
  if (diet === 'vegetarien' && (food.animal === 'meat' || food.animal === 'fish')) return false;
  if (diet === 'vegetalien' && food.animal) return false;
  if (diet === 'pescetarien' && food.animal === 'meat') return false;
  if (diet === 'sans_porc' && food.pork) return false;
  if (food.vegOnly && diet !== 'vegetarien' && diet !== 'vegetalien') return false;
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
