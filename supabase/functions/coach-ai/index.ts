// Coach IA de l'application, via l'offre gratuite de Google Gemini.
// La clé Gemini reste secrète côté Supabase (jamais dans l'app). Seuls les utilisateurs connectés peuvent appeler la fonction :
// la fonction vérifie elle-même qui appelle (jeton de session), puis applique une limite de messages par jour et par personne.
// Déploiement : voir README, section « Coach IA ».
//
// Reçoit : { messages: [{ role: 'user' | 'model', text }], context: {...}, photos?: [{ path, label }] }
// Renvoie : { text }
//
// Les photos : le client envoie seulement leur CHEMIN dans le stockage (jamais les octets). Cette fonction va les
// chercher elle-même dans le bucket privé « photos » avec la clé service_role (jamais exposée au navigateur).
// Comme cette clé passe outre les règles de sécurité, on n'accepte QUE les photos du dossier de la personne qui appelle.
//
// Secrets optionnels : GEMINI_MODEL (nom du modèle), AI_DAILY_LIMIT (messages par jour et par personne, 80 par défaut).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `Tu es le coach d'une application d'entraînement et de nutrition. Réponds toujours en français, de façon claire, chaleureuse et concrète, en 3 à 8 phrases (plus seulement si on te demande un plan détaillé). Évite le jargon.

Tu connais le profil, le plan de repas (avec sa variante jour d'entraînement / jour de repos), le programme et les derniers check-ins de la personne (JSON fourni). Base-toi dessus et n'invente jamais de données. Si une information manque, dis-le.

Des photos de progrès (face, profil, dos) peuvent être jointes, avec une légende indiquant la semaine et l'angle. Quand il y en a, commente aussi ce qui est visible dessus (posture, définition musculaire, changement de silhouette dans le temps), en complément des chiffres — pas seulement les chiffres. Reste factuel et bienveillant, jamais intrusif ni gênant, ne commente jamais l'apparence hors du cadre entraînement/nutrition, et rappelle qu'une évaluation visuelle a ses limites (éclairage, angle, posture) si tu avances une observation incertaine.

Comment fonctionne l'application (guide la personne vers ces boutons quand c'est utile) :
- Tu ne peux PAS modifier l'application toi-même : tu expliques où toucher pour faire le changement.
- Onglet Séance : toucher le nom d'un exercice montre la photo de départ et d'arrivée ; « voir les variantes » propose un remplacement qui change l'exercice partout dans le programme. Le bouton « Modifier mon programme » permet d'ajouter, renommer, déplacer ou supprimer un jour, d'ajouter ou retirer des exercices (avec recherche), de changer séries et répétitions, et de créer un exercice personnalisé (nom, type charge / poids du corps / durée, consigne, lien vidéo).
- Onglet Repas : un bouton en haut choisit « jour d'entraînement » ou « jour de repos » (plus ou moins de glucides). Le bouton ↔ remplace un aliment par un équivalent OU par une recherche libre (marque précise, via Open Food Facts) ; « Autre repas » régénère un repas ; « Mes préférences » change allergies, régime et aliments non aimés ; « Modifier mes cibles » change les calories, protéines, lipides et la cible d'eau (moyenne de la semaine) ; « Liste d'épicerie » donne les quantités pour 7 jours.
- Onglet Check-in : chaque semaine, le poids, le sommeil, l'énergie et les séances faites servent au coach automatique (règles) pour ajuster les calories (±150 kcal), les charges et proposer une semaine légère. Le premier check-in sert de point de départ.
- Onglet Progrès : courbe de poids, photos avant/après, et le progrès de l'ami.
- Réglages : unité d'affichage du poids (kg ou lb) — les données restent en kg en arrière-plan.

Règles importantes :
- Tu ne donnes pas d'avis médical, y compris à partir des photos. En cas de douleur, blessure, malaise, maladie, grossesse ou signes de trouble alimentaire (restriction extrême, culpabilité, perte de poids très rapide), recommande de consulter un professionnel de la santé.
- Respecte strictement les allergies et le régime indiqués. Ne propose jamais un aliment incompatible.
- Sois prudent : propose des changements progressifs (ex. ±100 à 200 kcal, une semaine à la fois), jamais de calories sous le métabolisme de base.
- Si la demande dépasse ce que l'application permet, dis-le simplement et suggère de noter l'idée.`;

// Modèle principal (modifiable avec le secret GEMINI_MODEL), puis des modèles de secours si Google est surchargé.
const MODELS = [Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement à chaque fonction Supabase : rien à configurer.
const SUPA_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 80);

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Qui appelle ? On demande à Supabase Auth de valider le jeton de session envoyé par l'app.
async function callerId(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? SERVICE_KEY! },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return typeof u?.id === 'string' ? u.id : null;
}

// Compte ce message ; renvoie le total du jour, ou null si le compteur n'existe pas encore (migration_005 pas appliquée).
async function countMessage(uid: string): Promise<number | null> {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/ia_compter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  if (!r.ok) return null;
  const n = await r.json().catch(() => null);
  return typeof n === 'number' ? n : null;
}

async function photoPart(path: string) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/photos/${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY! },
  });
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return { inlineData: { mimeType: 'image/jpeg', data: btoa(bin) } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const uid = await callerId(req);
    if (!uid) return json({ error: 'Connecte-toi pour parler au coach.' }, 401);
    const used = await countMessage(uid);
    if (used !== null && used > DAILY_LIMIT) {
      return json({ error: `Limite quotidienne du coach IA atteinte (${DAILY_LIMIT} messages). Reviens demain !` }, 429);
    }

    const body = await req.json();
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY manquante');

    const messages = Array.isArray(body.messages) && body.messages.length
      ? body.messages
      : [{ role: 'user', text: 'Commente ma semaine.' }];
    const contents = messages.slice(-12).map((m: { role: string; text: string }) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(m.text ?? '').slice(0, 2000) }],
    }));
    // Le contexte de la personne est joint au premier message pour que l'IA le garde en tête.
    contents[0].parts[0].text = `Données de la personne (JSON) : ${JSON.stringify(body.context ?? {})}\n\n${contents[0].parts[0].text}`;

    // Photos de progrès (optionnel) : ajoutées au DERNIER message pour que l'IA les voie avec la question posée.
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, 6) : [];
    if (photos.length) {
      const last = contents[contents.length - 1];
      for (const { path, label } of photos) {
        // Seulement les photos de la personne qui appelle (dossier = son identifiant), sans « .. » pour sortir du dossier.
        if (typeof path !== 'string' || !path.startsWith(`${uid}/`) || path.includes('..')) continue;
        const part = await photoPart(path);
        if (part) last.parts.push({ text: String(label ?? 'Photo').slice(0, 100) + ' :' }, part);
      }
    }

    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      // Les modèles récents « réfléchissent » avant de répondre : on garde de la marge pour ne pas couper la réponse.
      generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
    });

    let text: string | undefined;
    let lastError = 'Réponse vide';
    outer:
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload },
        );
        const j = await r.json().catch(() => ({}));
        const parts = j?.candidates?.[0]?.content?.parts ?? [];
        text = parts.map((p: { text?: string }) => p.text ?? '').join('').trim();
        if (text) break outer;
        lastError = j?.error?.message ?? `Erreur ${r.status}`;
        // Surcharge ou limite momentanée : on réessaie. Autre erreur (modèle inconnu, requête refusée) : modèle suivant.
        if (!(r.status === 429 || r.status >= 500)) break;
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
    }
    if (!text) throw new Error(lastError);
    return json({ text });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
