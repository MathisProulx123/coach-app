// Recherche d'aliments (Open Food Facts) côté serveur.
// Nécessaire car Open Food Facts bloque ou dégrade les recherches faites anonymement depuis un navigateur
// (« not available to anonymous users » en période de forte demande). Un appel serveur avec un User-Agent
// identifiable, comme demandé par Open Food Facts, est beaucoup plus fiable.
// Reçoit : { q: "yogourt oikos vanille" }  →  Renvoie : { results: [{ id, name, brands, k, p, c, f }] }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { q } = await req.json();
    const query = String(q ?? '').trim();
    if (query.length < 2) return new Response(JSON.stringify({ results: [] }), { headers: { ...cors, 'Content-Type': 'application/json' } });

    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&lc=fr&fields=product_name,product_name_fr,brands,nutriments,code`;
    // Open Food Facts bloque parfois les appels en période de forte demande : on réessaie 2 fois avant d'abandonner.
    let j = null;
    for (let attempt = 0; attempt < 3 && !j; attempt++) {
      if (attempt) await new Promise((res) => setTimeout(res, 800 * attempt));
      const r = await fetch(url, {
        headers: {
          // Open Food Facts demande un User-Agent identifiable pour les appels API (voir leurs conditions d'usage).
          'User-Agent': 'CoachApp-PersonalProject/1.0 (usage personnel, deux utilisateurs)',
          Accept: 'application/json',
        },
      });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('json')) j = await r.json();
    }
    if (!j) throw new Error('Open Food Facts est momentanément indisponible, réessaie dans un instant.');

    const results = [];
    for (const p of j.products || []) {
      const n = p.nutriments || {};
      const k = n['energy-kcal_100g'], pr = n.proteins_100g, c = n.carbohydrates_100g, f = n.fat_100g;
      if (![k, pr, c, f].every((x) => typeof x === 'number' && x >= 0 && x < 1000)) continue;
      const name = (p.product_name_fr || p.product_name || '').trim();
      if (!name) continue;
      results.push({ id: `off_${p.code || Math.random().toString(36).slice(2)}`, name, brands: p.brands || '', k, p: pr, c, f });
      if (results.length >= 12) break;
    }
    return new Response(JSON.stringify({ results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
