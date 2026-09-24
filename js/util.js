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
