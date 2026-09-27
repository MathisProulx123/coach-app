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

## 3. Créer vos comptes, puis fermer les inscriptions

1. Ouvre l'adresse sur ton téléphone → **Créer un compte** (courriel + mot de passe) → remplis ton profil.
2. Ton ami fait pareil.
3. Dans Supabase : **Authentication → Sign In / Providers → désactive « Allow new users to sign up »**.
   Ainsi, personne d'autre ne peut créer de compte, même s'il connaît l'adresse.

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

## Mise à jour de la base (migration)

Quand une nouvelle version de l'app ajoute des champs (ex. `supabase/migration_002.sql` pour les repas), colle le fichier dans **SQL Editor → Run** **avant** de mettre l'app en ligne. Il ne touche pas à tes données.

## Les exercices : photos et variantes

Dans l'onglet **Séance**, touche un exercice : tu vois la photo de départ et d'arrivée et une consigne. « Voir les variantes » propose des remplacements qui travaillent les mêmes muscles, et le choix s'applique à tout ton programme. Les photos viennent de la base libre [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (domaine public).

## Modifier ton programme

Onglet **Séance → Modifier mon programme** : tu peux ajouter, renommer, déplacer ou supprimer un jour, ajouter des exercices de la bibliothèque (avec recherche) ou en créer de zéro (nom, type charge / poids du corps / durée, consigne, lien vidéo), les retirer ou les déplacer, et changer les séries et répétitions. Tout se fait en brouillon : rien n'est gardé avant de toucher **Enregistrer**. « Rétablir le programme de départ » recrée le programme selon ton profil.

Attention : changer les jours par semaine ou le matériel dans les Réglages recrée le programme de départ (l'app te le demande avant).

## Le plan de repas

Dans l'onglet **Repas**, l'app pose d'abord tes allergies, ton régime et ce que tu n'aimes pas, puis crée de vrais repas (aliments, quantités, marques) qui atteignent tes cibles de calories, protéines, glucides et lipides. Tu peux échanger un aliment (↔), refaire un repas, modifier tes cibles à la main ou voir la liste d'épicerie de la semaine. Les quantités se recalculent automatiquement quand le coach change tes calories.

Les marques sont des exemples courants au Québec et les valeurs nutritives sont des moyennes : vérifie l'étiquette de ta marque. Pour ajouter un aliment, ajoute une ligne dans `js/foods.js`.

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
- **Vie privée** : les deux comptes peuvent lire les données de l'autre (c'est voulu). L'option « Partager mes photos » masque les photos dans l'app mais ne les protège pas au niveau de la base.
- **Ce n'est pas un avis médical.** Les formules (Mifflin-St Jeor, 1,8–2,2 g de protéines/kg) sont des estimations : le vrai réglage vient de vos check-ins.
