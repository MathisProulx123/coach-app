// Petits outils partagés.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const iso = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const today = () => iso(new Date());

// Lundi de la semaine d'une date (YYYY-MM-DD).
export const mondayOf = (dateStr = today()) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
};
export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
export const fmtDate = (s) => new Date(s + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
export const round1 = (n) => Math.round(n * 10) / 10;
export const roundHalf = (n) => Math.round(n * 2) / 2;
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// Semaine personnelle : la première semaine de quelqu'un commence le jour de son tout premier check-in,
// pas au lundi civil. Les semaines suivantes s'enchaînent ensuite tous les 7 jours à partir de là.
// anchor = week_start du tout premier check-in (ou undefined si la personne n'en a encore aucun).
export const weekStartFor = (dateStr, anchor) => {
  if (!anchor) return dateStr; // pas encore de première semaine : elle commence aujourd'hui
  const n = Math.floor(daysBetween(anchor, dateStr) / 7);
  return addDays(anchor, n * 7);
};

// Conversion de poids : les données restent en kg partout dans l'app et la base de données ;
// seul l'affichage change selon l'unité choisie par la personne.
export const KG_PER_LB = 0.45359237;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;
export const toKg = (val, unit) => (unit === 'lb' ? lbToKg(val) : val);
export const fromKg = (kg, unit) => (unit === 'lb' ? kgToLb(kg) : kg);
export const fmtWeight = (kg, unit) => round1(fromKg(kg, unit));

// Réduit une photo (max 1200 px, JPEG) pour rester dans le stockage gratuit.
export function resizeImage(file, max = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo illisible'))), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Photo illisible'));
    img.src = url;
  });
}
