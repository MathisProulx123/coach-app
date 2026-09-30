// Coach IA de l'application, via l'offre gratuite de Google Gemini.
// La clé Gemini reste secrète côté Supabase (jamais dans l'app). Seuls les utilisateurs connectés peuvent appeler la fonction :
// la fonction vérifie elle-même qui appelle (jeton de session), puis applique une limite de messages par jour et par personne.
// Déploiement : voir README, section « Coach IA ».
//
// Reçoit : { messages: [{ role: 'user' | 'model', text }], context: {...}, photos?: [{ path, label }], format?: 'json',
//           stream?: true, reflexion?: 'courte' }
// Renvoie : { text } — ou, avec stream: true, le texte brut au fur et à mesure qu'il s'écrit.
//
// Les photos : le client envoie seulement leur CHEMIN dans le stockage (jamais les octets). Cette fonction va les
// chercher elle-même dans le bucket privé « photos » avec la clé service_role (jamais exposée au navigateur).
// Comme cette clé passe outre les règles de sécurité, on n'accepte QUE les photos du dossier de la personne qui appelle.
//
// Secrets optionnels : GEMINI_MODEL (nom du modèle), AI_DAILY_LIMIT (messages par jour et par personne, 80 par défaut).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Coach-Model, X-Coach-Essais',
};

const SYSTEM = `Tu es le coach d'une application d'entraînement et de nutrition. Réponds toujours en français, de façon claire, chaleureuse et concrète, en 3 à 8 phrases (plus seulement si on te demande un plan détaillé). Évite le jargon.

Écris dans un français naturel, comme on le parle au Québec, en tutoyant. Pas d'anglicismes ni de calques de l'anglais : « prendre du muscle sans trop de gras » (pas « lean bulk », « construire du muscle », « muscle propre »), « perdre du gras » ou « sèche » (pas « cut »), « se concentrer sur » (pas « focus »), « avoir du sens » (pas « faire du sens »). Si la personne emploie un terme anglais, comprends-le mais reformule en bon français.

Tu connais le profil, le plan de repas (avec sa variante jour d'entraînement / jour de repos), le programme et les derniers check-ins de la personne (JSON fourni). Base-toi dessus et n'invente jamais de données. Si une information manque, dis-le.

Des photos de progrès (face, profil, dos) peuvent être jointes, avec une légende indiquant la semaine et l'angle. Quand il y en a, commente aussi ce qui est visible dessus (posture, définition musculaire, changement de silhouette dans le temps), en complément des chiffres — pas seulement les chiffres. Reste factuel et bienveillant, jamais intrusif ni gênant, ne commente jamais l'apparence hors du cadre entraînement/nutrition, et rappelle qu'une évaluation visuelle a ses limites (éclairage, angle, posture) si tu avances une observation incertaine.

Comment fonctionne l'application (guide la personne vers ces boutons quand c'est utile) :
- Si les données contiennent « actions_possibles », tu peux proposer toi-même les changements qui y sont décrits (la personne les confirme d'un bouton « Appliquer ») : suis ce mode d'emploi à la lettre. Pour tout le reste, explique où toucher dans l'application.
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

// X-Coach-Model : le modèle qui a répondu ; X-Coach-Essais : pourquoi les modèles d'avant ont échoué (diagnostic).
const diag = (model: string, tries: string[]) => ({ 'X-Coach-Model': model, 'X-Coach-Essais': encodeURIComponent(tries.join(' | ').slice(0, 500)) });
const json = (obj: unknown, status = 200, model = '', tries: string[] = []) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', ...diag(model, tries) } });

// Réponse au fur et à mesure : lit le flux de Gemini (événements « data: {...} ») et n'en garde que le texte
// (pas la « réflexion » du modèle). Attend le premier morceau : renvoie null si le modèle échoue avant (on essaiera le suivant).
async function startStream(r: Response, ctrl: AbortController, timer: number, started: number, model: string, tries: string[], debug = false) {
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '', ended = false;
  let events = 0, finish = '', why = ''; // diagnostic (debug: true) : pourquoi le flux s'est arrêté
  const next = async (): Promise<string | null> => { // prochain morceau de texte, ou null à la fin
    for (;;) {
      const i = buf.indexOf('\n');
      if (i >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const j = JSON.parse(line.slice(5));
          events++;
          finish = j?.candidates?.[0]?.finishReason ?? finish;
          const t = (j?.candidates?.[0]?.content?.parts ?? [])
            .filter((p: { thought?: boolean }) => !p.thought)
            .map((p: { text?: string }) => p.text ?? '').join('');
          if (t) return t;
        } catch { /* ligne incomplète ou autre événement : on l'ignore */ }
        continue;
      }
      if (ended) return null;
      const { value, done } = await reader.read();
      if (done) { ended = true; buf += '\n'; continue; }
      buf += dec.decode(value, { stream: true });
    }
  };
  let first: string | null = null;
  try { first = await next(); } catch { /* délai dépassé ou coupure */ }
  clearTimeout(timer);
  if (!first) { ctrl.abort(); return null; }
  // Une fois lancée, la réponse a jusqu'à ~140 s au total (Supabase coupe à 150 s).
  const cap = setTimeout(() => ctrl.abort(), Math.max(5000, 140000 - (Date.now() - started)));
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(first!));
      try { for (let t; (t = await next()) !== null;) c.enqueue(enc.encode(t)); } catch (e) { why = String(e); /* coupure : on garde ce qui est arrivé */ }
      clearTimeout(cap);
      // Signal de fin (caractère ␞ puis la raison) : l'app sait ainsi si la réponse est complète (FIN:STOP) ou coupée.
      c.enqueue(enc.encode(`␞FIN:${finish || 'COUPE'}${debug ? ` (${events} événements, erreur = ${why || 'aucune'})` : ''}`));
      c.close();
    },
  });
  return new Response(body, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', ...diag(model, tries) } });
}

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

    // Les modèles récents « réfléchissent » avant de répondre : on garde de la marge pour ne pas couper la réponse.
    // format: 'json' (accueil d'un nouvel utilisateur) : Gemini renvoie un objet JSON pur, plus fiable à lire pour l'app,
    // avec moins de « créativité » (questions simples : évite les mots inventés comme « que tu ne peaufines pas »).
    // reflexion: 'courte' (question simple, sans changement à faire) : Gemini réfléchit moins longtemps, donc répond plus vite.
    // Si le modèle refuse ce réglage, on le retire et on réessaie (voir plus bas).
    let short = body.reflexion === 'courte';
    const payload = () => JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: {
        ...(body.format === 'json'
          ? { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: 'application/json' }
          : { temperature: 0.6, maxOutputTokens: 4096 }),
        ...(short ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
      },
    });
    // stream: true : la réponse est envoyée au fur et à mesure (texte brut), l'app l'affiche pendant qu'elle s'écrit.
    // Une ancienne version de l'app n'envoie pas stream : elle reçoit toujours { text } comme avant.
    const stream = body.stream === true;

    const errors: string[] = []; // l'erreur de CHAQUE modèle, pour savoir si c'est une surcharge, la clé ou un nom de modèle
    // Supabase coupe une fonction après ~150 s : quand Google est lent, on s'arrête avant pour renvoyer un vrai message.
    const started = Date.now();
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const left = 110000 - (Date.now() - started);
        if (left < 5000) { errors.push('Google met trop de temps à répondre (surcharge)'); throw new Error(errors.join(' | ')); }
        // Délai pour RECEVOIR LE DÉBUT de la réponse ; une fois qu'elle arrive, on la laisse finir (jusqu'à ~140 s au total).
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(left, 50000));
        let r: Response;
        try {
          r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${key}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload(), signal: ctrl.signal },
          );
        } catch {
          clearTimeout(timer);
          errors.push(`${model} : délai dépassé`);
          break; // modèle suivant
        }
        let err: string;
        if (r.ok && stream) {
          // On attend le premier morceau de texte AVANT de répondre à l'app : si ce modèle échoue, on peut encore passer au suivant.
          const res = await startStream(r, ctrl, timer, started, model, errors, body.debug === true);
          if (res) return res;
          err = `${model} [${r.status}] réponse vide ou coupée`;
        } else {
          const j = await r.json().catch(() => ({}));
          clearTimeout(timer);
          const text = (j?.candidates?.[0]?.content?.parts ?? [])
            .filter((p: { thought?: boolean }) => !p.thought)
            .map((p: { text?: string }) => p.text ?? '').join('').trim();
          if (text) return json({ text }, 200, model, errors);
          err = `${model} [${r.status}] ${String(j?.error?.message ?? 'réponse vide').slice(0, 160)}`;
        }
        // Le modèle ne connaît pas le réglage de réflexion : on le retire et on réessaie tout de suite ce modèle.
        if (short && r.status === 400 && /think/i.test(err)) { short = false; attempt--; continue; }
        // Surcharge ou limite momentanée : on réessaie. Autre erreur (modèle inconnu, requête refusée) : modèle suivant.
        // Quota gratuit épuisé : réessayer ce modèle ne sert à rien (et consomme encore), on passe au suivant.
        if (!(r.status === 429 || r.status >= 500) || /quota/i.test(err)) { errors.push(err); break; }
        errors.push(err);
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
    }
    throw new Error(errors.join(' | ') || 'Réponse vide');
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
