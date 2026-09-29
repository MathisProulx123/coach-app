# Régénère js/exercises_lib.js : Free Exercise DB (domaine public) + traductions.tsv (noms et consignes en français).
# Usage (depuis la racine du projet) : python tools/exercices/construire.py
# Pour corriger un nom ou une consigne : modifie traductions.tsv, puis relance ce script.
import json, os, re, urllib.request, collections

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
SOURCE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'

db = {e['id']: e for e in json.load(urllib.request.urlopen(SOURCE))}
fr = {}
for l in open(os.path.join(ICI, 'traductions.tsv'), encoding='utf-8'):
    if l.startswith('#') or not l.strip():
        continue
    i, nom, cue = l.rstrip('\n').split('\t')
    fr[i] = (nom.strip(), cue.strip())

MUSCLE = {'abdominals': 'abdos', 'abductors': 'abducteurs', 'adductors': 'adducteurs', 'biceps': 'biceps', 'calves': 'mollets',
          'chest': 'pectoraux', 'forearms': 'avant-bras', 'glutes': 'fessiers', 'hamstrings': 'ischios', 'lats': 'dorsaux',
          'lower back': 'lombaires', 'middle back': 'milieu du dos', 'neck': 'cou', 'quadriceps': 'quadriceps',
          'shoulders': 'épaules', 'traps': 'trapèzes', 'triceps': 'triceps'}
EQ = {'barbell': 'barre', 'dumbbell': 'haltères', 'cable': 'poulie', 'machine': 'machine', 'kettlebells': 'kettlebell',
      'bands': 'élastique', 'body only': 'aucun', None: 'aucun', 'medicine ball': 'médecine-ball', 'exercise ball': 'ballon',
      'foam roll': 'rouleau', 'e-z curl bar': 'barre EZ', 'other': 'autre'}
CAT = {'strength': 'musculation', 'stretching': 'étirement', 'plyometrics': 'pliométrie', 'powerlifting': 'dynamophilie',
       'olympic weightlifting': 'haltérophilie', 'strongman': 'force athlétique', 'cardio': 'cardio'}
HOME_EQ = {'body only', None, 'dumbbell', 'kettlebells', 'bands', 'exercise ball', 'foam roll', 'medicine ball'}
LOWER = {'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'}
LVL = {'beginner': 1, 'intermediate': 2, 'expert': 3}
MECH = {'compound': 'c', 'isolation': 'i'}

# Les exercices de base (js/data.js) gardent leur fiche ; on leur donne seulement muscle, type et matériel.
base = set(re.findall(r"img: '([^']+)'", open(os.path.join(RACINE, 'js', 'data.js'), encoding='utf-8').read()))
muscle = lambda e: MUSCLE[(e['primaryMuscles'] or ['abdominals'])[0]]
out = []
for i, (nom, cue) in fr.items():
    if i in base or i not in db or len(db[i].get('images', [])) < 2:
        continue
    e = db[i]
    m = (e['primaryMuscles'] or ['abdominals'])[0]
    flags = ('h' if e.get('equipment') in HOME_EQ else '') + ('l' if m in LOWER else '') \
        + ('b' if e.get('equipment') in ('body only', None) else '') \
        + ('t' if e['category'] in ('stretching', 'cardio') or e.get('force') == 'static' else '') + MECH.get(e.get('mechanic'), '')
    out.append([i, nom, MUSCLE[m], EQ[e.get('equipment')], CAT[e['category']], LVL[e['level']], flags, cue])
out.sort(key=lambda x: (x[2], x[1]))
info = {i: [muscle(db[i]), MECH.get(db[i].get('mechanic'), ''), EQ[db[i].get('equipment')]] for i in sorted(base) if i in db}

js = ['// Bibliothèque d’exercices complète, générée à partir de la Free Exercise DB (domaine public, licence Unlicense) :',
      '// https://github.com/yuhonas/free-exercise-db. Noms et consignes rédigés en français pour l’app.',
      '// Ne pas modifier à la main : corriger tools/exercices/traductions.tsv puis lancer tools/exercices/construire.py.',
      '// Format : [identifiant (= dossier des photos), nom, muscle principal, matériel, type, niveau 1-3, repères, consigne]',
      '//   repères : h = faisable à la maison · l = jambes · b = poids du corps · t = en secondes (étirement, gainage, cardio)',
      '//             c = polyarticulaire (squat, développé…) · i = isolation (curl, extension…)',
      'export const LIB = [']
js += ['  ' + json.dumps(x, ensure_ascii=False) + ',' for x in out]
js += ['];', '// Muscle principal, type (c / i) et matériel des exercices de base de l’app (clé = identifiant des photos)',
       'export const BASE_INFO = ' + json.dumps(info, ensure_ascii=False) + ';']
open(os.path.join(RACINE, 'js', 'exercises_lib.js'), 'w', encoding='utf-8', newline='\n').write('\n'.join(js) + '\n')
print(len(out), 'exercices ;', collections.Counter(x[2] for x in out).most_common(5), '…')
