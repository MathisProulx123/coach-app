// Recherche d'aliments dans Open Food Facts (base de données ouverte et gratuite, sans clé nécessaire).
// Sert quand la liste d'aliments intégrée à l'app (js/foods.js) ne suffit pas : on cherche un produit précis,
// avec sa vraie marque et ses vraies valeurs nutritives par 100 g.
let seq = 0; // ignore les réponses d'une recherche devenue obsolète (l'utilisateur a retapé entre-temps)

export async function searchFoods(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const mine = ++seq;
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&lc=fr&fields=product_name,product_name_fr,brands,nutriments,code`;
  let j;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    j = await res.json();
  } catch {
    throw new Error('Recherche indisponible pour le moment, réessaie.');
  }
  if (mine !== seq) return null; // une recherche plus récente a été lancée : on jette ce résultat périmé

  const out = [];
  for (const p of j.products || []) {
    const n = p.nutriments || {};
    const k = n['energy-kcal_100g'], pr = n.proteins_100g, c = n.carbohydrates_100g, f = n.fat_100g;
    if (![k, pr, c, f].every((x) => typeof x === 'number' && x >= 0 && x < 1000)) continue; // données manquantes ou aberrantes
    const name = (p.product_name_fr || p.product_name || '').trim();
    if (!name) continue;
    out.push({ id: `off_${p.code || Math.random().toString(36).slice(2)}`, name, brands: p.brands || '', k, p: pr, c, f });
    if (out.length >= 12) break;
  }
  return out;
}
