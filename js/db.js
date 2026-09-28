// Couche de données. Deux modes avec la même interface :
//  - MODE DÉMO (config.js vide) : tout est stocké dans le navigateur (localStorage).
//  - MODE SUPABASE : vraies données partagées entre toi et ton ami.
import { CONFIG } from './config.js';
import { today, addDays, mondayOf } from './util.js';

// Ajouter ?demo à l'adresse force le mode démo (données locales seulement), même une fois Supabase branché.
export const DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || new URLSearchParams(location.search).has('demo');
const LS = 'coach_demo_v1';
let sb = null;
let store = null;

const persist = () => localStorage.setItem(LS, JSON.stringify(store));

export async function init() {
  if (DEMO) {
    try { store = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { store = null; }
    if (!store) { store = seed(); persist(); }
    return;
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

export function resetDemo() {
  localStorage.removeItem(LS);
  store = seed();
  persist();
}

// ---------- Accès générique aux tables ----------
async function select(table, match = {}, order = null) {
  if (DEMO) {
    let rows = store[table].filter((r) => Object.entries(match).every(([k, v]) => r[k] === v));
    if (order) {
      const [col, asc] = order;
      rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    return structuredClone(rows);
  }
  let q = sb.from(table).select('*').match(match);
  if (order) q = q.order(order[0], { ascending: order[1] });
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function upsert(table, row, conflict) {
  if (DEMO) {
    const keys = conflict.split(',');
    const i = store[table].findIndex((r) => keys.every((k) => r[k] === row[k]));
    if (i >= 0) store[table][i] = { ...store[table][i], ...row };
    else store[table].push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row });
    persist();
    return;
  }
  const { error } = await sb.from(table).upsert(row, { onConflict: conflict });
  if (error) throw error;
}

async function insert(table, row) {
  if (DEMO) {
    store[table].push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row });
    persist();
    return;
  }
  const { error } = await sb.from(table).insert(row);
  if (error) throw error;
}

// ---------- Comptes ----------
export async function getUser() {
  if (DEMO) return { id: 'me-demo', email: 'demo@local' };
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email } : null;
}
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Compte créé. Confirme ton courriel (ou désactive la confirmation dans Supabase), puis connecte-toi.');
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signOut() {
  if (!DEMO) await sb.auth.signOut();
}

// ---------- Données ----------
export const listProfiles = () => select('profiles');
export const getProfile = async (id) => (await select('profiles', { id }))[0] || null;
export const saveProfile = (p) => upsert('profiles', p, 'id');

// ---------- Amis (partage des données, migration_004) ----------
// Profils des personnes qui me partagent leurs données. Mode démo : l'ami fictif.
// Si la migration n'est pas encore appliquée (table absente), on garde l'ancien comportement : tous les autres profils.
export async function listPartners(uid) {
  const others = async () => (await listProfiles()).filter((p) => p.id !== uid);
  if (DEMO) return others();
  const { data, error } = await sb.from('partages').select('owner').eq('viewer', uid);
  if (error) return others();
  const ids = data.map((r) => r.owner);
  if (!ids.length) return [];
  const res = await sb.from('profiles').select('*').in('id', ids);
  if (res.error) throw res.error;
  return res.data;
}
async function rpc(fn, args) {
  if (DEMO) throw new Error('Les invitations ne marchent pas en mode démo.');
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
export const createInvite = () => rpc('creer_invitation');
export const acceptInvite = (code) => rpc('accepter_invitation', { code_saisi: code });
export const removePartner = (id) => rpc('retirer_partage', { autre: id });

export const getPlan = async (user_id) => (await select('plans', { user_id }, ['created_at', false]))[0] || null;
export const savePlan = (plan) => insert('plans', plan);

export const listWorkouts = (user_id) => select('workouts', { user_id }, ['date', true]);
export const saveWorkout = (w) => upsert('workouts', w, 'user_id,date,day_label');

export const listDaily = (user_id) => select('daily_logs', { user_id }, ['date', true]);
export const saveDaily = (d) => upsert('daily_logs', d, 'user_id,date');

export const listCheckins = (user_id) => select('checkins', { user_id }, ['week_start', true]);
export const saveCheckin = (c) => upsert('checkins', c, 'user_id,week_start');

// ---------- Mes données (Loi 25) : exporter, supprimer ----------
export async function exportMine(uid) {
  const [profile, plans, workouts, daily_logs, checkins] = await Promise.all([
    getProfile(uid), select('plans', { user_id: uid }, ['created_at', true]), listWorkouts(uid), listDaily(uid), listCheckins(uid),
  ]);
  return { exporte_le: new Date().toISOString(), profile, plans, workouts, daily_logs, checkins };
}
// Efface les photos (le stockage n'est pas lié au compte), puis le compte : la base efface tout le reste en cascade.
export async function deleteAccount(uid) {
  if (DEMO) { resetDemo(); return; }
  const { data: files, error } = await sb.storage.from('photos').list(uid, { limit: 1000 });
  if (error) throw error;
  if (files?.length) {
    const { error: e2 } = await sb.storage.from('photos').remove(files.map((f) => `${uid}/${f.name}`));
    if (e2) throw e2;
  }
  const { error: e3 } = await sb.rpc('supprimer_mon_compte');
  if (e3) throw new Error(/supprimer_mon_compte/.test(e3.message) ? 'La suppression de compte n’est pas encore activée (migration_006.sql).' : e3.message);
  await sb.auth.signOut();
}

// ---------- Photos ----------
export async function uploadPhoto(uid, week, slot, blob) {
  const path = `${uid}/${week}_${slot}.jpg`;
  if (DEMO) {
    store.photos[path] = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    persist();
    return path;
  }
  const { error } = await sb.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
export async function photoUrl(path) {
  if (DEMO) return store.photos[path] || null;
  const { data } = await sb.storage.from('photos').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// Le message d'erreur par défaut d'une fonction Supabase est vague : on lit la vraie raison qu'elle a renvoyée.
async function edgeError(error) {
  let msg = error.message;
  try {
    const status = error.context?.status;
    const raw = await error.context.text();
    let detail = raw;
    try { const j = JSON.parse(raw); detail = j.error || j.message || j.msg || raw; } catch { /* texte brut */ }
    msg = `${status ? `[${status}] ` : ''}${detail || msg}`;
  } catch { /* on garde le message par défaut */ }
  return new Error(msg);
}

// ---------- Avis IA (optionnel) ----------
export async function askCoach(payload) {
  if (DEMO) {
    return 'Mode démo : l’avis IA est désactivé. Une fois Supabase branché et la fonction coach-ai déployée, ton coach IA commentera ici ta semaine en quelques phrases.';
  }
  // Google peut être très lent quand il est surchargé : au-delà de 90 s, on arrête d'attendre plutôt que de laisser « … » affiché.
  const timeout = new Promise((_, no) => setTimeout(() => no(new Error('Le coach IA met trop de temps à répondre (Google est surchargé). Réessaie dans quelques minutes.')), 90000));
  const { data, error } = await Promise.race([sb.functions.invoke(CONFIG.AI_FUNCTION, { body: payload }), timeout]);
  if (error) throw await edgeError(error);
  if (!data?.text) throw new Error(data?.error || 'Réponse vide du coach IA');
  return data.text;
}

// ---------- Recherche d'aliments (Open Food Facts, via une fonction Supabase pour rester fiable) ----------
export async function searchFoods(query) {
  if (DEMO) {
    const { searchFoods: direct } = await import('./foodsearch.js');
    return direct(query); // pas de fonction serveur en mode démo : recherche directe, meilleur effort
  }
  const { data, error } = await sb.functions.invoke(CONFIG.FOOD_SEARCH_FUNCTION, { body: { q: query } });
  if (error) throw await edgeError(error);
  return data?.results ?? [];
}

// ---------- Données de démonstration : un ami fictif avec 6 semaines d'historique ----------
function seed() {
  const uid = 'partner-demo';
  const wk0 = mondayOf();
  const weights = [84.0, 83.5, 83.1, 82.8, 82.2, 81.9];
  const checkins = weights.map((w, i) => {
    const week_start = addDays(wk0, -7 * (weights.length - i));
    return {
      id: crypto.randomUUID(), created_at: week_start, user_id: uid, week_start, weight: w, waist: 88 - i * 0.6,
      sleep: 3 + (i % 2), energy: 4 - (i % 3 === 2 ? 1 : 0), soreness: 3, stress: 2, adherence_training: 90 - i * 3, adherence_nutrition: 85,
      notes: '', photos: {}, coach: { messages: [{ icon: '✅', text: 'Poids dans la cible. On garde les calories.' }], deload: false },
    };
  });
  const program = [
    { label: 'Haut A', exercises: [{ id: 'bench', sets: 4, lo: 5, hi: 8 }, { id: 'row', sets: 4, lo: 6, hi: 10 }] },
    { label: 'Bas A', exercises: [{ id: 'squat', sets: 4, lo: 5, hi: 8 }, { id: 'rdl', sets: 3, lo: 6, hi: 10 }] },
  ];
  const workouts = [];
  for (let i = 0; i < 10; i++) {
    const date = addDays(today(), -3 * (i + 1));
    const up = i % 2 === 0;
    workouts.push({
      id: crypto.randomUUID(), created_at: date, user_id: uid, date, day_label: up ? 'Bas A' : 'Haut A',
      exercises: up ? [{ id: 'squat', sets: [{ w: 90, r: 6 }, { w: 90, r: 6 }, { w: 90, r: 5 }] }] : [{ id: 'bench', sets: [{ w: 70, r: 7 }, { w: 70, r: 6 }, { w: 70, r: 6 }] }],
    });
  }
  return {
    profiles: [{ id: uid, name: 'Alex (démo)', sex: 'homme', birth_year: 1999, height_cm: 180, start_weight: 84, goal: 'lose', days_per_week: 4, equipment: 'gym', activity: 'medium', share_photos: true, created_at: addDays(wk0, -49) }],
    plans: [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), user_id: uid, calories: 2450, protein: 180, carbs: 250, fat: 68, program, deload: false, hold: false, reasons: [] }],
    workouts, daily_logs: [], checkins, photos: {},
  };
}
