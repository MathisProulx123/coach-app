// Fonction OPTIONNELLE : avis du coach IA via l'offre gratuite de Google Gemini.
// La clé reste secrète côté Supabase (jamais dans l'app). Seuls les utilisateurs connectés peuvent l'appeler.
// Déploiement : voir README, section « Avis IA ».

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const key = Deno.env.get('GEMINI_API_KEY');
    // Si Google change le nom du modèle gratuit, modifie GEMINI_MODEL dans les secrets Supabase.
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    if (!key) throw new Error('GEMINI_API_KEY manquante');

    const prompt = `Tu es un coach de musculation et de nutrition bienveillant et direct. Réponds en français, en 4 à 6 phrases maximum, sans liste.
Voici les données de la personne (JSON) : ${JSON.stringify(body)}.
"rules_said" contient les ajustements déjà décidés par les règles automatiques : ne les contredis pas, complète-les avec un commentaire humain (tendances, encouragement, une seule action concrète pour la semaine).
Ne donne aucun avis médical. En cas de douleur, blessure ou signes de trouble alimentaire dans les notes, recommande de consulter un professionnel.`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
    );
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(j?.error?.message ?? 'Réponse vide');
    return new Response(JSON.stringify({ text: text.trim() }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message ?? e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
