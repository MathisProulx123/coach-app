// Analyse une notation de plaques façon gym pour la charge d'un exercice.
// Formule : poids total = poids de la barre + 2 × (somme des plaques par côté).
//   « plate » / « plates » sans chiffre = 1 plaque standard (ex. 45 lb).
//   Un chiffre juste avant « plate(s) » = ce nombre de plaques standards.
//   Les autres chiffres tapés sont des plaques supplémentaires (une chacune), par côté.
// Exemples (avec plaque standard 45 lb, barre 45 lb) :
//   « 1 plate 25 »  -> 1×45 + 25 = 70 par côté  -> 45 + 2×70 = 185
//   « 2 plates »    -> 2×45 = 90 par côté        -> 45 + 2×90 = 225
//   « 45 10 »       -> 45+10 = 55 par côté       -> 45 + 2×55 = 155 (sans le mot « plate »)
export function parsePlates(input, { plateLb = 45, barLb = 45 } = {}) {
  const s = String(input).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)?\s*plates?/);
  let perSide = 0, found = false, rest = s;
  if (m) {
    found = true;
    const count = m[1] ? parseFloat(m[1].replace(',', '.')) : 1;
    perSide += count * plateLb;
    rest = s.slice(0, m.index) + s.slice(m.index + m[0].length);
  }
  const nums = rest.match(/\d+(?:[.,]\d+)?/g) || [];
  if (nums.length) found = true;
  perSide += nums.reduce((sum, n) => sum + parseFloat(n.replace(',', '.')), 0);
  if (!found) return null;
  return { perSideLb: perSide, totalLb: barLb + 2 * perSide };
}
