# Coach — plans, nutrition et check-ins à deux

Application web installable sur téléphone. Chacun a son profil, son plan et ses check-ins, et vous voyez le progrès de l'autre.
Le « coach » est un fichier de règles (`js/rules.js`) qui ajuste chaque semaine les calories, les charges et les semaines légères selon vos check-ins. Un avis IA est disponible en option.

**Coût : 0 $.** Hébergement GitHub Pages + base de données Supabase (offres gratuites) + Gemini (offre gratuite, optionnel).

## 0. Essayer tout de suite (sans rien créer)

Ouvre `index.html` via un petit serveur local (dans ce dossier) :

```
python -m http.server 5173
```

puis va sur http://localhost:5173. Sans configuration, l'app tourne en **mode démo** : les données restent dans ton navigateur et un ami fictif (Alex) est déjà là.

## 1. Créer la base de données (Supabase, gratuit)

1. Crée un compte sur https://supabase.com, puis **New project** (choisis la région la plus proche, note le mot de passe de la base).
2. Menu **SQL Editor → New query** : colle tout le contenu de `supabase/schema.sql` → **Run**.
3. Menu **Authentication → Sign In / Providers → Email** : désactive **Confirm email** (plus simple pour vous deux).
4. Menu **Project Settings → API** : copie l'**URL** du projet et la clé **anon public**.
5. Ouvre `js/config.js` et colle-les dans `SUPABASE_URL` et `SUPABASE_ANON_KEY`.

La clé « anon » est faite pour être publique. La sécurité vient des règles créées par `schema.sql`.

## 2. Mettre l'app en ligne (GitHub Pages, gratuit)

1. Crée un compte sur https://github.com, puis **New repository** (public, car Pages est gratuit pour les dépôts publics).
2. **Add file → Upload files** : glisse tout le contenu de ce dossier (sans le dossier `.claude`), puis **Commit**.
3. **Settings → Pages → Deploy from a branch → main / (root) → Save**.
4. Après 1–2 minutes, ton adresse est `https://TON-NOM.github.io/NOM-DU-DEPOT/`.

## 3. Les inscriptions

**Usage privé (à deux)** : créez vos comptes, puis **Authentication → Sign In / Providers → désactivez « Allow new users to sign up »**.

**Produit ouvert au public** (d'abord `migration_004.sql` à `migration_007.sql`, voir plus bas) :
1. **Authentication → Sign In / Providers → Email** : laisse « Allow new users to sign up » et active **Confirm email**.
2. **Authentication → URL Configuration** : **Site URL** = l'adresse de l'app (ex. `https://TON-NOM.github.io/NOM-DU-DEPOT/`) ; dans **Redirect URLs**, ajoute la même adresse suivie de `**`. Les liens des courriels (confirmation, mot de passe oublié) ramènent à cette adresse.
3. **Courriels** : l'envoi intégré de Supabase est limité à quelques courriels par heure et, sur un nouveau projet, seulement aux adresses de ton équipe Supabase. Pour de vrais clients, branche un service d'envoi (**Authentication → Emails → SMTP Settings**, ex. Resend ou Brevo, qui ont une offre gratuite).

Dans l'app : inscription avec confirmation par courriel, « Mot de passe oublié ? » sur l'écran de connexion, et **Réglages → Mes données** pour télécharger ses données ou supprimer son compte (Loi 25).

## 4. Installer sur l'écran d'accueil

- **iPhone (Safari)** : bouton Partager → **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu ⋮ → **Installer l'application**.

## 5. Coach IA (optionnel, gratuit)

Sans l'IA, l'onglet **Coach** répond déjà aux questions sur l'application (mode simple). Avec l'IA, il connaît ton profil, ton plan et tes check-ins, et répond à tes questions ou t'aide à décider d'un changement. Il commente aussi ta semaine après chaque check-in.

1. Crée une clé gratuite sur https://aistudio.google.com/apikey.
2. Supabase : **Edge Functions → Deploy a new function → Via Editor**, nom `coach-ai`, colle le contenu de `supabase/functions/coach-ai/index.ts`, **Deploy**.
3. **Edge Functions → Secrets** : ajoute `GEMINI_API_KEY` avec ta clé.
4. Dans `js/config.js`, mets `AI_ENABLED: true` et remets les fichiers en ligne.

Si Google change le nom du modèle gratuit, ajoute un secret `GEMINI_MODEL` avec le nouveau nom. L'offre gratuite a une limite de messages par minute et par jour.

**Sécurité et limite par personne.** La fonction vérifie qui l'appelle et n'analyse que les photos de cette personne. Avec `supabase/migration_005.sql` appliquée, chaque compte a droit à 80 messages IA par jour (modifiable avec un secret `AI_DAILY_LIMIT`). Sans cette migration, la fonction marche sans limite.

## Mise à jour de la base (migration)

Quand une nouvelle version de l'app ajoute des champs (ex. `supabase/migration_002.sql` à `migration_007.sql`, dans l'ordre), colle le fichier dans **SQL Editor → Run** **avant** de mettre l'app en ligne. Il ne touche pas à tes données. Après une migration, redéploie aussi la fonction `coach-ai` si son code a changé (**Edge Functions → coach-ai → Code**, colle le nouveau contenu de `supabase/functions/coach-ai/index.ts`, **Deploy**).

## Comptes privés et amis (migration_004)

`supabase/migration_004.sql` rend chaque compte privé : on ne voit plus que ses propres données et celles des amis reliés. Vos 2 comptes actuels sont reliés automatiquement (seulement s'il y a au plus 2 profils), donc rien ne change pour vous. Un nouvel utilisateur se relie à un ami dans **Réglages → Partage avec un ami** (code d'invitation valide 7 jours). **À appliquer avant d'ouvrir les inscriptions.** En cas de problème, `migration_004_retour.sql` remet les anciennes règles sans rien effacer.

## Ce que sait le coach IA

À chaque question, le coach reçoit un **guide de connaissances** (`js/knowledge.js`) : protéines selon l'objectif, rythme de perte ou de prise de poids, faim en sèche, prise de masse, entraînement (volume, surcharge progressive, semaines légères), suppléments bien documentés, épicerie à petit budget au Québec, sécurité. Les chiffres viennent de sources reconnues (positions officielles de l'ISSN, recommandations de préparation en musculation naturelle, Guide alimentaire canadien), citées en tête du fichier. Il connaît aussi les 88 aliments, les 29 modèles de repas et les 800+ exercices de l'app.

## Le coach IA peut modifier l'application

Dans l'onglet **Coach**, demande un changement en mots (« remplace le squat, j'ai mal au genou », « enlève le poisson de mes repas », « monte mes protéines ») : le coach répond puis affiche une carte **Changements proposés**. Rien ne change avant de toucher **Appliquer** ; **Annuler ces changements** revient en arrière. L'app vérifie chaque changement (jamais sous le métabolisme de base, exercices compatibles avec ton matériel, pas de jour vide) et refuse les autres en expliquant pourquoi.

Il peut changer : les cibles (protéines, glucides, lipides, eau), les préférences alimentaires, refaire un repas, remplacer / ajouter / retirer un exercice, les séries et répétitions, l'objectif, l'activité, les jours, le matériel, le type d'entraînement et l'unité de poids. Il ne peut pas supprimer de données, faire un check-in ni gérer le compte ou les amis. La logique est dans `js/actions.js`. Demande la fonction `coach-ai` à jour.

## Accueil d'un nouvel utilisateur (onboarding avec le coach IA)

À la création d'un compte, le coach IA fait connaissance par une courte discussion : prénom et objectif, sexe, âge, taille et poids (livres acceptées), jours et matériel, activité et blessures, puis alimentation (régime, allergies, aliments détestés, repas par jour, budget). Il remplit un **brouillon** ; la personne vérifie et corrige tout dans un **récapitulatif**, puis « Créer mon plan » crée d'un coup le profil, le programme, les cibles et le plan de repas. Un mineur ou une mention de grossesse, de maladie ou de trouble alimentaire affiche un avertissement recommandant un professionnel de la santé.

Toujours disponible : « Je préfère remplir un formulaire » (l'ancien formulaire). Sans coach IA activé, c'est ce formulaire qui s'affiche. En mode démo, un faux coach scripté (sans IA) permet de tester le parcours. La logique est dans `js/onboarding.js`. Demande la fonction `coach-ai` à jour (option `format: 'json'`), mais marche aussi avec l'ancienne.

## Semaines personnelles

La première semaine de chacun commence le jour de son tout premier check-in (pas forcément un lundi) ; les semaines suivantes s'enchaînent tous les 7 jours à partir de là. Chaque personne a son propre point de départ. Si un premier check-in a été fait par erreur un mauvais jour, supprime cette ligne dans **Table Editor → checkins** et refais le check-in : le bon jour deviendra le nouveau point de départ.

## Jour d'entraînement / jour de repos

Onglet Repas : un bouton en haut choisit le type de jour. Les glucides (donc les calories) montent les jours d'entraînement et baissent les jours de repos ; protéines et lipides ne changent pas. Réglable dans `js/rules.js` → `RULES.dayCycle`. Les cibles affichées ailleurs (calories moyennes que le coach ajuste) restent la moyenne de la semaine.

## Unité de poids (kg / lb)

Réglages → bascule kg/lb. N'affecte que l'affichage : tout reste stocké en kilogrammes, donc chacun choisit son unité sans rien casser pour l'autre.

## Recherche d'un aliment précis

Dans la fenêtre d'échange d'un aliment (bouton ↔), une recherche interroge [Open Food Facts](https://world.openfoodfacts.org) (base ouverte, gratuite, sans clé) pour trouver un produit précis avec sa vraie marque. Les données viennent de la communauté : vérifie l'étiquette réelle si un résultat semble étrange.

## Coach IA : photos et cibles plus poussées

Le bouton **Demander un avis** (après un check-in) et le bouton **Analyser mes photos de progrès** (onglet Coach) envoient tes photos de progrès à Google (Gemini) pour qu'il commente aussi ce qui est visible dessus, pas seulement tes chiffres. Cela demande la fonction `coach-ai` à jour (voir plus haut) ; aucun secret supplémentaire n'est nécessaire, la fonction va chercher les photos elle-même dans ton compte Supabase de façon sécurisée. Sans coach IA activé, ces boutons n'apparaissent pas.

## Les exercices : photos et variantes

Dans l'onglet **Séance**, touche un exercice : tu vois la photo de départ et d'arrivée et une consigne. « Voir les variantes » propose des remplacements qui travaillent les mêmes muscles, et le choix s'applique à tout ton programme. Les photos viennent de la base libre [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (domaine public).

## La bibliothèque d'exercices (plus de 800)

En plus des exercices de départ, l'app contient **plus de 800 exercices** de la [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (domaine public), chacun avec 2 photos, son muscle principal, son matériel et une consigne en français. On les trouve dans **Modifier mon programme → Ajouter un exercice** (recherche par mot et par muscle), dans les **variantes** d'un exercice (même muscle, même type de mouvement, matériel compatible) et le coach IA peut les proposer. Pour corriger un nom ou une consigne : `tools/exercices/traductions.tsv`, puis `python tools/exercices/construire.py`.

## Modifier ton programme

Onglet **Séance → Modifier mon programme** : tu peux ajouter, renommer, déplacer ou supprimer un jour, ajouter des exercices de la bibliothèque (avec recherche) ou en créer de zéro (nom, type charge / poids du corps / durée, consigne, lien vidéo), les retirer ou les déplacer, et changer les séries et répétitions. Tout se fait en brouillon : rien n'est gardé avant de toucher **Enregistrer**. « Rétablir le programme de départ » recrée le programme selon ton profil.

Attention : changer les jours par semaine ou le matériel dans les Réglages recrée le programme de départ (l'app te le demande avant).

## Le plan de repas

Dans l'onglet **Repas**, l'app pose d'abord tes allergies, ton régime et ce que tu n'aimes pas, puis crée de vrais repas (aliments, quantités, marques) qui atteignent tes cibles de calories, protéines, glucides et lipides. Tu peux échanger un aliment (↔), refaire un repas, modifier tes cibles à la main ou voir la liste d'épicerie de la semaine. Les quantités se recalculent automatiquement quand le coach change tes calories.

**3 menus qui alternent** : chaque jour, l'app sert le menu suivant (1, 2, 3, 1…), avec des viandes et des féculents différents d'un menu à l'autre ; des onglets permettent de voir les autres menus. Un plan créé avant cette version garde son menu (menu 1) et propose « Ajouter 2 menus ». La liste d'épicerie additionne les menus des 7 prochains jours, classée par rayon (riz et pâtes en poids sec). Sous chaque repas, « Comment le préparer » donne une mini-recette.

**Cocher « Mangé »** sur les repas du jour remplit tout seul le journal (calories et protéines). Demande `supabase/migration_007.sql` (ajoute une colonne au journal, sans toucher aux données).

Les repas suivent **29 modèles** comme en mangent les gens au Québec (gruau au lait, smoothie, céréales, sandwich, pâté chinois, bols, assiettes, wraps, chili, sautés, collations…), avec **88 aliments** d'une épicerie du Québec. Les repas sont composés d'office avec les aliments que la plupart des gens achètent (poulet, bœuf, porc, riz, pâtes, patates, légumes et fruits courants) ; les autres (poissons, tofu, légumineuses, quinoa…) restent offerts avec le bouton ↔ (et servent de base aux végétariens). Les valeurs nutritives viennent du Fichier canadien sur les éléments nutritifs (Santé Canada) ; les marques sont des exemples : vérifie l'étiquette de ta marque. Avec un budget « serré », les repas évitent les aliments les plus chers. Pour ajouter un aliment : une ligne dans `js/foods.js` ; pour un modèle de repas : `TEMPLATES` dans `js/meals.js`.

## Comment ça marche

| Fichier | Rôle |
|---|---|
| `js/rules.js` | **Le coach** : calories, protéines, ajustements hebdomadaires, progression des charges, semaines légères. Tous les chiffres sont en haut, commentés. |
| `js/data.js` | Les exercices (photos, consignes, variantes) et les programmes (2 à 6 jours, salle ou maison). |
| `js/foods.js` | La base d'aliments (valeurs nutritives, allergènes, marques). |
| `js/meals.js` | Le générateur de plan de repas. |
| `js/app.js` | Les écrans. |
| `js/db.js` | Le lien avec Supabase (et le mode démo). |
| `js/config.js` | Vos clés et l'option IA. |
| `style.css` | L'apparence. |
| `supabase/schema.sql` | Les tables et les règles de sécurité. |

**Pour modifier l'app, demande à Claude**, par exemple : « ajoute 200 kcal au lieu de 150 quand le poids stagne », « ajoute l'exercice Soulevé de terre au programme Bas A », « ajoute un champ pour les pas quotidiens ».

## Limites à connaître

- **Supabase gratuit** : le projet se met en pause après ~1 semaine sans activité (un clic dans le tableau de bord le réveille). Avec un check-in par semaine, ça reste actif.
- **Stockage** : 1 Go de photos gratuit. Les photos sont réduites à ~100–200 Ko, soit des années d'historique pour vous deux.
- **Vie privée** : depuis `migration_004.sql`, chaque compte ne voit que ses données et celles des amis reliés par un code d'invitation (Réglages → Partage avec un ami). Si « Partager mes photos » est décoché, la base refuse aussi l'accès aux photos.
- **Ce n'est pas un avis médical.** Les formules (Mifflin-St Jeor, 1,8–2,2 g de protéines/kg) sont des estimations : le vrai réglage vient de vos check-ins.
