// Coach IA de l'application, via l'offre gratuite de Google Gemini.
// La clé reste secrète côté Supabase (jamais dans l'app). Seuls les utilisateurs connectés peuvent appeler la fonction.
// Déploiement : voir README, section « Coach IA ».
//
// Reçoit : { messages: [{ role: 'user' | 'model', text }], context: { ...profil, plan, check-ins... } }
// Renvoie : { text }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `Tu es le coach d'une application d'entraînement et de nutrition utilisée par deux amis. Réponds toujours en français, de façon claire, chaleureuse et concrète, en 3 à 8 phrases (plus seulement si on te demande un plan détaillé). Évite le jargon.

Tu connais le profil, le plan de repas, le programme et les derniers check-ins de la personne (JSON fourni). Base-toi dessus et n'invente jamais de données. Si une information manque, dis-le.

Comment fonctionne l'application (guide la personne vers ces boutons quand c'est utile) :
- Onglet Séance : toucher le nom d'un exercice montre la photo de départ et d'arrivée ; « voir les variantes » propose un remplacement qui change l'exercice partout dans le programme.
- Onglet Repas : le bouton ↔ remplace un aliment (quantités recalculées), « Autre repas » régénère un repas, « Mes préférences » change allergies, régime et aliments non aimés, « Modifier mes cibles » change les calories et macros, « Liste d'épicerie » donne les quantités pour 7 jours.
- Onglet Check-in : chaque semaine, le poids, le sommeil, l'énergie et les séances faites servent au coach automatique (règles) pour ajuster les calories (±150 kcal), les charges et proposer une semaine légère. Le premier check-in sert de point de départ.
- Onglet Progrès : courbe de poids, photos avant/après, et le progrès de l'ami.

Règles importantes :
- Tu ne donnes pas d'avis médical. En cas de douleur, blessure, malaise, maladie, grossesse ou signes de trouble alimentaire (restriction extrême, culpabilité, perte de poids très rapide), recommande de consulter un professionnel de la santé.
- Respecte strictement les allergies et le régime indiqués. Ne propose jamais un aliment incompatible.
- Sois prudent : propose des changements progressifs (ex. ±100 à 200 kcal, une semaine à la fois), jamais de calories sous le métabolisme de base.
- Si la demande dépasse ce que l'application permet, dis-le simplement et suggère de noter l'idée.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const key = Deno.env.get('GEMINI_API_KEY');
    // Si Google change le nom du modèle gratuit, modifie GEMINI_MODEL dans les secrets Supabase.
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
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

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 700 },
        }),
      },
    );
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(j?.error?.message ?? 'Réponse vide');
    return new Response(JSON.stringify({ text: text.trim() }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
