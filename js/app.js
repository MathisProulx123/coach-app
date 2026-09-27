import * as db from './db.js';
import { CONFIG } from './config.js';
import { esc, today, addDays, fmtDate, round1, avg, resizeImage, weekStartFor, toKg, fromKg, fmtWeight } from './util.js';
import { EXERCISES, buildProgram, altsFor, imgUrl, imgFallback } from './data.js';
import { calcTargets, weeklyAdjust, nextTarget, extraTargets, dayVariant } from './rules.js';
import { ALLERGENS, DIETS, externalFood } from './foods.js';
import { buildChoices, rerollMeal, equivalents, swapItem, swapItemCustom, computeDay, qtyText, groceryList, SLOT_NAMES, ROLE_NAMES } from './meals.js';
import { searchFoods } from './foodsearch.js';

const S = {
  me: null, profile: null, plan: null, workouts: [], daily: [], checkins: [], other: null,
  view: 'home', dayIdx: null, who: 'me', slot: 'front', authMode: 'in', editPrefs: false, chatBusy: false,
};
const root = document.getElementById('app');
const acts = {};   // actions déclenchées par un clic : data-act="nom"
const forms = {};  // formulaires : data-form="nom"

// ================= Chargement des données =================
async function loadMine() {
  const id = S.me.id;
  S.profile = await db.getProfile(id);
  if (!S.profile) return;
  [S.plan, S.workouts, S.daily, S.checkins] = await Promise.all([
    db.getPlan(id), db.listWorkouts(id), db.listDaily(id), db.listCheckins(id),
  ]);
  await ensureMealPlan();
}
async function loadOther() {
  const others = (await db.listProfiles()).filter((p) => p.id !== S.me.id);
  if (!others.length) { S.other = null; return; }
  const p = others[0];
  const [plan, workouts, daily, checkins] = await Promise.all([
    db.getPlan(p.id), db.listWorkouts(p.id), db.listDaily(p.id), db.listCheckins(p.id),
  ]);
  S.other = { profile: p, plan, workouts, daily, checkins };
}
// Enregistre une nouvelle version du plan en reprenant l'actuel + les changements
async function savePlan(changes = {}) {
  const b = S.plan;
  await db.savePlan({
    user_id: S.me.id, calories: b.calories, protein: b.protein, carbs: b.carbs, fat: b.fat, program: b.program,
    deload: b.deload, hold: b.hold, reasons: b.reasons || [], meal_plan: b.meal_plan ?? null, ...changes,
  });
}
// Crée le plan de repas dès que les préférences alimentaires sont remplies
async function ensureMealPlan() {
  const pr = prefs();
  if (!S.plan || !pr.done) return;
  if (!S.plan.meal_plan || S.plan.meal_plan.meals.length !== pr.meals) {
    await savePlan({ meal_plan: buildChoices(pr, Date.now(), S.plan) });
    S.plan = await db.getPlan(S.me.id);
  }
}
const prefs = () => ({ allergies: [], diet: 'aucun', dislikes: '', meals: 4, done: false, water: null, weight_unit: 'kg', ...(S.profile?.food_prefs || {}) });
const wUnit = (p = S.profile) => (p?.food_prefs?.weight_unit) || 'kg';
const wTxt = (kg, p = S.profile) => `${fmtWeight(kg, wUnit(p))} ${wUnit(p)}`;
async function setFoodPrefs(patch) {
  const food_prefs = { ...prefs(), ...patch };
  await db.saveProfile({ ...S.profile, food_prefs });
  S.profile = { ...S.profile, food_prefs };
}
// Semaine personnelle : commence le jour du tout premier check-in de la personne (pas le lundi civil).
const curWeek = (checkins) => weekStartFor(today(), checkins[0]?.week_start);

// ================= Petits helpers d'affichage =================
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const bar = (v, t) => `<div class="bar"><i style="width:${Math.min(100, t ? (v / t) * 100 : 0)}%"></i></div>`;
const GOALS = { lose: 'Perdre du gras', maintain: 'Maintenir', gain: 'Prendre du muscle' };
const LEVEL5 = ['1 · Très bas', '2 · Bas', '3 · Correct', '4 · Bon', '5 · Excellent'];
const thumb = (id) => EXERCISES[id]
  ? `<img class="thumb" loading="lazy" src="${imgUrl(id, 0)}" data-fb="${imgFallback(id, 0)}" alt="">`
  : '<div class="thumb ph" aria-hidden="true">🏋️</div>';

// Un exercice du programme peut venir de la bibliothèque ou être créé par la personne (définition dans e.custom).
function customDef(c = {}) {
  return { name: c.name || 'Exercice', bw: c.kind === 'bw', time: c.kind === 'time', lower: !!c.lower, cue: c.cue || '', url: c.url || '', custom: true };
}
const defOf = (e) => EXERCISES[e.id] || customDef(e.custom);
const findEntry = (id) => S.plan.program.flatMap((d) => d.exercises).find((e) => e.id === id);
const defById = (id) => EXERCISES[id] || customDef(findEntry(id)?.custom);
const m1 = (n) => Math.round(n);

function lineChart(points, unit = 'kg') {
  if (points.length < 2) return '<p class="muted">Pas encore assez de données (2 check-ins minimum).</p>';
  const pts = points.map((p) => ({ d: p.d, y: fromKg(p.y, unit) }));
  const W = 320, H = 150, P = 26;
  const ys = pts.map((p) => p.y);
  const lo = Math.min(...ys) - 0.5, hi = Math.max(...ys) + 0.5;
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids">
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}
    <text x="${P}" y="${H - 6}" font-size="10" fill="var(--muted)">${fmtDate(pts[0].d)}</text>
    <text x="${W - P}" y="${H - 6}" font-size="10" fill="var(--muted)" text-anchor="end">${fmtDate(pts[pts.length - 1].d)}</text>
    <text x="${P}" y="14" font-size="11" fill="var(--muted)">${round1(hi - 0.5)} ${unit}</text>
    <text x="${P}" y="${H - 16}" font-size="11" fill="var(--muted)">${round1(lo + 0.5)} ${unit}</text></svg>`;
}

function nextDayIdx() {
  const prog = S.plan.program;
  const last = S.workouts[S.workouts.length - 1];
  const i = last ? prog.findIndex((d) => d.label === last.day_label) : -1;
  return (i + 1) % prog.length;
}
function lastSets(exId) {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const e = S.workouts[i].exercises.find((x) => x.id === exId);
    if (e) return e.sets;
  }
  return null;
}
function lastWeight() {
  const c = S.checkins[S.checkins.length - 1];
  return c ? c.weight : S.profile.start_weight;
}
function todayLog() { return S.daily.find((d) => d.date === today()) || {}; }
// Cibles du jour selon qu'aujourd'hui est un jour d'entraînement ou de repos (choix mémorisé dans le journal du jour).
function curDayTargets() { return dayVariant(S.plan, todayLog().day_type === 'rest' ? 'rest' : 'train'); }
function statsOf(d) {
  const first = d.checkins[0]?.weight ?? d.profile.start_weight;
  const last = d.checkins[d.checkins.length - 1]?.weight ?? first;
  const wk = curWeek(d.checkins);
  const weeks = new Set(d.checkins.map((c) => c.week_start));
  let streak = 0;
  let w = weeks.has(wk) ? wk : addDays(wk, -7);
  while (weeks.has(w)) { streak++; w = addDays(w, -7); }
  const adh = avg(d.checkins.map((c) => (c.adherence_training + c.adherence_nutrition) / 2));
  return {
    first, last, change: round1(last - first), streak, adh: adh === null ? null : Math.round(adh),
    total: d.workouts.length, week: d.workouts.filter((x) => x.date >= wk).length, checkins: d.checkins.length,
  };
}
const macroLine = (m) => `${m1(m.k)} kcal · P ${m1(m.p)} g · G ${m1(m.c)} g · L ${m1(m.f)} g`;

// ================= Fenêtre du bas (photos d'exercice, échanges d'aliments…) =================
const sheetEl = document.createElement('div');
sheetEl.id = 'sheet';
sheetEl.hidden = true;
document.body.appendChild(sheetEl);
function openSheet(html) {
  sheetEl.innerHTML = `<div class="backdrop" data-act="closeSheet"></div><div class="panel">${html}</div>`;
  sheetEl.hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() {
  sheetEl.hidden = true;
  sheetEl.innerHTML = '';
  document.body.classList.remove('noscroll');
}
acts.closeSheet = closeSheet;

// ================= Écrans =================
function vHome() {
  const p = S.profile, plan = S.plan, wk = curWeek(S.checkins);
  const done = S.checkins.some((c) => c.week_start === wk);
  const idx = nextDayIdx();
  const day = plan.program[idx];
  const log = S.daily.find((d) => d.date === today()) || {};
  const last = S.checkins[S.checkins.length - 1];
  const msgs = (last?.coach?.messages) || plan.reasons || [];
  const o = S.other, os = o ? statsOf(o) : null;
  return `
  <section class="card">
    <h2>Salut ${esc(p.name)} 👋</h2>
    <p class="muted">Semaine ${S.checkins.length + (done ? 0 : 1)} · objectif : ${GOALS[p.goal]}</p>
    ${done
      ? '<p>✅ Check-in de la semaine fait.</p>'
      : '<a class="btn block" href="#/checkin">Faire mon check-in de la semaine</a>'}
  </section>
  <section class="card">
    <div class="row between"><h2>Prochaine séance</h2>${plan.deload ? '<span class="pill">Semaine légère</span>' : ''}</div>
    <p><b>${esc(day.label)}</b><br><span class="muted">${day.exercises.map((e) => esc(defOf(e).name)).join(' · ')}</span></p>
    <button class="block" data-act="startDay" data-arg="${idx}">Commencer</button>
  </section>
  <section class="card">
    <h2>Nutrition aujourd’hui</h2>
    <div class="row between"><span>Calories</span><span>${log.calories || 0} / ${plan.calories} kcal</span></div>${bar(log.calories || 0, plan.calories)}
    <div class="row between"><span>Protéines</span><span>${log.protein || 0} / ${plan.protein} g</span></div>${bar(log.protein || 0, plan.protein)}
    ${prefs().done
      ? '<a class="btn ghost block" href="#/food">Voir mes repas</a>'
      : '<a class="btn block" href="#/food">Créer mon plan de repas (2 min)</a>'}
  </section>
  ${msgs.length ? `<section class="card"><h2>Le coach</h2>${msgs.map((m) => `<div class="msg"><span>${m.icon}</span><span>${esc(m.text)}</span></div>`).join('')}</section>` : ''}
  <section class="card">
    <h2>${o ? esc(o.profile.name) : 'Ton ami'}</h2>
    ${o
      ? `<div class="grid4"><div class="stat"><b>${os.week}</b><span>séances / sem.</span></div>
         <div class="stat"><b>${os.change > 0 ? '+' : ''}${fmtWeight(os.change, wUnit(o.profile))}</b><span>${wUnit(o.profile)}</span></div>
         <div class="stat"><b>${os.streak}</b><span>sem. d’affilée</span></div>
         <div class="stat"><b>${os.adh ?? '–'}${os.adh === null ? '' : '%'}</b><span>régularité</span></div></div>
         <a class="btn ghost block" style="margin-top:10px" href="#/progress" data-act="seeOther">Voir son progrès</a>`
      : '<p class="muted">Ton ami n’a pas encore créé son profil.</p>'}
  </section>`;
}

function vTrain() {
  const prog = S.plan.program;
  const idx = S.dayIdx ?? nextDayIdx();
  const day = prog[idx];
  const hist = [...S.workouts].reverse().slice(0, 8);
  return `
  <div class="tabs">${prog.map((d, i) => `<button class="${i === idx ? 'on' : ''}" data-act="pickDay" data-arg="${i}">${esc(d.label)}</button>`).join('')}</div>
  ${S.plan.deload ? '<div class="card"><span class="pill">Semaine légère</span> Moins de séries et charges réduites pour bien récupérer.</div>' : ''}
  <a class="btn ghost block small" style="margin-bottom:12px" href="#/edit">✏️ Modifier mon programme (jours, exercices)</a>
  <form data-form="workout" data-day="${idx}" class="card">
    <h2>${esc(day.label)}</h2>
    <p class="muted">Touche un exercice pour voir la position de départ et d’arrivée, ou pour le remplacer.</p>
    ${day.exercises.map((ex, i) => {
      const def = defOf(ex);
      const last = lastSets(ex.id);
      const t = nextTarget(def, ex, last, { deload: S.plan.deload, hold: S.plan.hold });
      const unit = def.time ? 's' : 'reps';
      return `<div class="ex">
        <div class="row tap" data-act="exInfo" data-arg="${ex.id}" role="button" tabindex="0" aria-label="Voir l’exercice ${esc(def.name)}">
          ${thumb(ex.id)}
          <div style="flex:1"><h3>${esc(def.name)} <span class="muted">ⓘ</span></h3>
          <div class="muted">${t.sets} × ${ex.lo}–${ex.hi} ${unit}${t.w !== null ? ` · objectif ${t.w} kg` : ''}</div></div>
        </div>
        <div class="muted">${esc(t.note)}${last ? ` Dernière fois : ${last.map((s) => `${s.w || 0}×${s.r}`).join(', ')}.` : ''}</div>
        <div class="sets">${Array.from({ length: t.sets }, (_, s) => `
          <span class="muted">${s + 1}</span>
          <input name="w_${i}_${s}" type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" value="${t.w ?? ''}" aria-label="Charge série ${s + 1}">
          <input name="r_${i}_${s}" type="number" inputmode="numeric" min="0" placeholder="${unit}" aria-label="Répétitions série ${s + 1}">`).join('')}
        </div></div>`;
    }).join('')}
    <button class="block" style="margin-top:12px">Terminer la séance</button>
  </form>
  <section class="card"><h2>Historique</h2>
    ${hist.length ? hist.map((w) => `<div class="row between"><span>${esc(w.day_label)}</span><span class="muted">${fmtDate(w.date)} · ${w.exercises.length} exercices</span></div>`).join('') : '<p class="muted">Aucune séance enregistrée.</p>'}
  </section>`;
}

// ----- Fiche d'un exercice (photos avant / après, consigne, variantes) -----
function exInfoHtml(id) {
  const ex = defById(id);
  if (ex.custom) {
    return `
    <div class="row between"><h2>${esc(ex.name)}</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p><span class="pill">exercice personnalisé</span></p>
    ${ex.cue ? `<p>${esc(ex.cue)}</p>` : '<p class="muted">Pas de consigne enregistrée.</p>'}
    ${/^https?:\/\//i.test(ex.url) ? `<a class="btn ghost block" href="${esc(ex.url)}" target="_blank" rel="noopener noreferrer">Voir la vidéo</a>` : ''}
    <a class="btn ghost block" style="margin-top:8px" href="#/edit">Modifier mon programme</a>`;
  }
  const fig = (n, label) => `<figure><img src="${imgUrl(id, n)}" data-fb="${imgFallback(id, n)}" alt="${label} : ${esc(ex.name)}"><figcaption>${label}</figcaption></figure>`;
  return `
    <div class="row between"><h2>${esc(ex.name)}</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <div class="photos one">${fig(0, 'Départ')}${fig(1, 'Arrivée')}</div>
    <p>${esc(ex.cue)}</p>
    <button class="ghost block" data-act="exAlts" data-arg="${id}">Je ne peux pas / n’aime pas cet exercice : voir les variantes</button>
    <p class="muted">Photos : Free Exercise DB (domaine public).</p>`;
}
acts.exInfo = (el) => openSheet(exInfoHtml(el.dataset.arg));
function exclusionFor(id) {
  return S.plan.program.filter((d) => d.exercises.some((e) => e.id === id)).flatMap((d) => d.exercises.map((e) => e.id));
}
acts.exAlts = (el) => {
  const id = el.dataset.arg;
  const alts = altsFor(id, S.profile.equipment, exclusionFor(id));
  openSheet(`
    <div class="row between"><h2>Variantes</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">Remplace <b>${esc(EXERCISES[id].name)}</b> partout dans ton programme par un exercice qui travaille les mêmes muscles.</p>
    ${alts.length ? alts.map((a) => `
      <div class="alt">
        ${thumb(a)}
        <div style="flex:1"><b>${esc(EXERCISES[a].name)}</b><div class="muted">${esc(EXERCISES[a].cue)}</div></div>
        <button class="small" data-act="exSwap" data-arg="${id}" data-new="${a}">Choisir</button>
      </div>`).join('') : '<p>Aucune variante disponible avec ton matériel. Demande au coach IA une idée.</p>'}
    <button class="ghost block" data-act="exInfo" data-arg="${id}">Retour</button>`);
};
acts.exSwap = async (el) => {
  const oldId = el.dataset.arg, newId = el.dataset.new;
  const od = EXERCISES[oldId], nw = EXERCISES[newId];
  const program = S.plan.program.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) => {
      if (e.id !== oldId) return e;
      let { lo, hi } = e;
      if (nw.time && !od.time) { lo = 30; hi = 60; } else if (!nw.time && od.time) { lo = 10; hi = 20; }
      return { ...e, id: newId, lo, hi };
    }),
  }));
  try {
    await savePlan({ program });
    closeSheet();
    toast(`${od.name} → ${nw.name}`);
    await refresh();
  } catch (e) { toast(e.message); }
};

// ----- Éditeur de programme : jours, exercices, exercices personnalisés (brouillon puis « Enregistrer ») -----
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dOf = (el) => +el.dataset.d;
const eOf = (el) => +el.dataset.e;
function move(arr, i, dir) { const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }

function vEdit() {
  const prog = S.draft;
  const mini = (k, d, e, v) => `<input class="mini" type="number" inputmode="numeric" min="1" max="${k === 'sets' ? 10 : 300}" data-edit="${k}" data-d="${d}" data-e="${e}" value="${v}" aria-label="${k === 'sets' ? 'Séries' : k === 'lo' ? 'Répétitions minimum' : 'Répétitions maximum'}">`;
  const btn = (act, d, e, dir, label, aria, disabled = false) => `<button type="button" class="ghost small" data-act="${act}" data-d="${d}" ${e !== null ? `data-e="${e}"` : ''} ${dir ? `data-dir="${dir}"` : ''} ${disabled ? 'disabled' : ''} aria-label="${aria}">${label}</button>`;
  return `
  <p class="muted">Change tes jours et tes exercices, puis touche <b>Enregistrer</b> en bas. Rien n’est gardé avant.</p>
  ${prog.map((d, di) => `
    <section class="card">
      <div class="row" style="gap:6px">
        <input class="dayname" data-edit="dayname" data-d="${di}" value="${esc(d.label)}" aria-label="Nom du jour" maxlength="30">
        ${btn('dayMove', di, null, -1, '↑', 'Monter ce jour', di === 0)}${btn('dayMove', di, null, 1, '↓', 'Descendre ce jour', di === prog.length - 1)}${btn('delDay', di, null, 0, '🗑', 'Supprimer ce jour')}
      </div>
      ${d.exercises.map((e, ei) => { const def = defOf(e); return `
        <div class="exrow">
          ${thumb(e.id)}
          <div style="flex:1;min-width:0">
            <b>${esc(def.name)}</b>${def.custom ? ' <span class="pill">perso</span>' : ''}
            <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">
              ${mini('sets', di, ei, e.sets)} <span class="muted">×</span> ${mini('lo', di, ei, e.lo)} <span class="muted">–</span> ${mini('hi', di, ei, e.hi)} <span class="muted">${def.time ? 's' : 'reps'}</span>
            </div>
          </div>
          <div class="col">
            ${btn('exMove', di, ei, -1, '↑', 'Monter', ei === 0)}${btn('exMove', di, ei, 1, '↓', 'Descendre', ei === d.exercises.length - 1)}
            ${def.custom ? btn('editCustom', di, ei, 0, '✎', 'Modifier cet exercice') : ''}${btn('delEx', di, ei, 0, '🗑', 'Retirer cet exercice')}
          </div>
        </div>`; }).join('') || '<p class="muted">Aucun exercice dans ce jour.</p>'}
      <button type="button" class="ghost block" style="margin-top:8px" data-act="addEx" data-d="${di}">+ Ajouter un exercice</button>
    </section>`).join('')}
  <button type="button" class="ghost block" data-act="addDay">+ Ajouter un jour d’entraînement</button>
  <div class="grid2" style="margin-top:12px">
    <button type="button" data-act="saveProgram">Enregistrer</button>
    <button type="button" class="ghost" data-act="cancelEdit">Annuler</button>
  </div>
  <button type="button" class="ghost small block" style="margin-top:12px" data-act="resetProgram">Rétablir le programme de départ</button>`;
}
function editField(t) {
  const d = +t.dataset.d, k = t.dataset.edit;
  if (k === 'dayname') { const v = t.value.trim(); if (v) S.draft[d].label = v.slice(0, 30); return; }
  const ex = S.draft[d].exercises[+t.dataset.e];
  ex[k] = Math.max(1, Math.min(k === 'sets' ? 10 : 300, Math.round(+t.value || 1)));
  if (ex.lo > ex.hi) { if (k === 'lo') ex.hi = ex.lo; else ex.lo = ex.hi; }
  render();
}
acts.dayMove = (el) => { move(S.draft, dOf(el), +el.dataset.dir); render(); };
acts.delDay = (el) => {
  if (S.draft.length <= 1) return toast('Garde au moins un jour d’entraînement.');
  if (!confirm('Supprimer ce jour et ses exercices ?')) return;
  S.draft.splice(dOf(el), 1);
  render();
};
acts.addDay = () => { S.draft.push({ label: `Jour ${S.draft.length + 1}`, exercises: [] }); render(); window.scrollTo(0, document.body.scrollHeight); };
acts.exMove = (el) => { move(S.draft[dOf(el)].exercises, eOf(el), +el.dataset.dir); render(); };
acts.delEx = (el) => { S.draft[dOf(el)].exercises.splice(eOf(el), 1); render(); };
acts.addEx = (el) => {
  const di = dOf(el);
  const used = new Set(S.draft[di].exercises.map((e) => e.id));
  const list = Object.entries(EXERCISES).filter(([id, x]) => !used.has(id) && (S.profile.equipment !== 'home' || x.home));
  openSheet(`
    <div class="row between"><h2>Ajouter un exercice</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <input type="search" data-filter placeholder="Rechercher (ex. curl, presse, fentes)…" aria-label="Rechercher un exercice">
    <button type="button" class="block" style="margin:10px 0" data-act="newEx" data-d="${di}">+ Créer un exercice personnalisé</button>
    ${list.map(([id, x]) => `
      <div class="alt" data-name="${esc(norm(x.name))}">
        ${thumb(id)}
        <div style="flex:1"><b>${esc(x.name)}</b><div class="muted">${esc(x.cue.slice(0, 90))}…</div></div>
        <button type="button" class="small" data-act="pickEx" data-d="${di}" data-id="${id}">Ajouter</button>
      </div>`).join('')}`);
};
acts.pickEx = (el) => {
  const id = el.dataset.id, x = EXERCISES[id];
  S.draft[dOf(el)].exercises.push({ id, sets: x.time ? 2 : 3, lo: x.time ? 30 : 8, hi: x.time ? 60 : 12 });
  closeSheet();
  render();
};
function customFormHtml(di, ei = null) {
  const cur = ei !== null ? S.draft[di].exercises[ei] : null;
  const c = cur?.custom || {};
  const kind = c.kind || 'load';
  const o = (v, t) => `<option value="${v}" ${kind === v ? 'selected' : ''}>${t}</option>`;
  return `
    <div class="row between"><h2>${cur ? 'Modifier l’exercice' : 'Nouvel exercice'}</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <form data-form="customEx" data-d="${di}" ${cur ? `data-e="${ei}"` : ''}>
      <label>Nom</label><input name="name" required maxlength="60" value="${esc(c.name || '')}" placeholder="ex. Tirage poitrine au câble">
      <label>Type</label><select name="kind">${o('load', 'Avec charge (kg)')}${o('bw', 'Poids du corps')}${o('time', 'Durée (secondes)')}</select>
      <div class="grid3">
        <div><label>Séries</label><input name="sets" type="number" min="1" max="10" required value="${cur?.sets ?? 3}"></div>
        <div><label>Min</label><input name="lo" type="number" min="1" max="300" required value="${cur?.lo ?? 8}"></div>
        <div><label>Max</label><input name="hi" type="number" min="1" max="300" required value="${cur?.hi ?? 12}"></div>
      </div>
      <label>Consigne (optionnel)</label><textarea name="cue" rows="3" maxlength="400" placeholder="Comment faire l’exercice, points d’attention…">${esc(c.cue || '')}</textarea>
      <label>Lien vidéo (optionnel, commence par https://)</label><input name="url" type="url" placeholder="https://…" value="${esc(c.url || '')}">
      <label class="check"><input type="checkbox" name="lower" ${c.lower ? 'checked' : ''}> Exercice de jambes (la charge monte de 5 kg)</label>
      <button class="block" style="margin-top:12px">${cur ? 'Enregistrer' : 'Ajouter à ce jour'}</button>
    </form>`;
}
acts.newEx = (el) => openSheet(customFormHtml(dOf(el)));
acts.editCustom = (el) => openSheet(customFormHtml(dOf(el), eOf(el)));
forms.customEx = (form) => {
  const fd = new FormData(form);
  const di = +form.dataset.d;
  const editIdx = form.dataset.e !== undefined ? +form.dataset.e : null;
  const sets = Math.max(1, Math.min(10, Math.round(+fd.get('sets')) || 3));
  const lo = Math.max(1, Math.round(+fd.get('lo')) || 8);
  const hi = Math.max(lo, Math.round(+fd.get('hi')) || 12);
  let url = String(fd.get('url') || '').trim();
  if (!/^https?:\/\//i.test(url)) url = ''; // on n'accepte que les vrais liens web
  const custom = { name: String(fd.get('name')).trim().slice(0, 60), kind: fd.get('kind'), lower: !!fd.get('lower'), cue: String(fd.get('cue') || '').trim().slice(0, 400), url };
  if (editIdx !== null) Object.assign(S.draft[di].exercises[editIdx], { sets, lo, hi, custom });
  else S.draft[di].exercises.push({ id: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, sets, lo, hi, custom });
  closeSheet();
  render();
};
acts.saveProgram = async () => {
  const empty = S.draft.find((d) => !d.exercises.length);
  if (empty) return toast(`« ${empty.label} » n’a aucun exercice : ajoutes-en un ou supprime ce jour.`);
  const seen = new Set();
  const program = S.draft.map((d) => { // deux jours ne peuvent pas porter le même nom
    let label = d.label, n = 2;
    while (seen.has(label)) label = `${d.label} ${n++}`;
    seen.add(label);
    return { ...d, label };
  });
  try {
    await savePlan({ program });
    S.draft = null;
    toast('Programme enregistré');
    await refresh('train');
  } catch (e) { toast(e.message); }
};
acts.cancelEdit = () => { S.draft = null; location.hash = '#/train'; };
acts.resetProgram = () => {
  if (!confirm('Remplacer ton programme par celui de départ ? Tes modifications (dans ce brouillon) seront perdues.')) return;
  S.draft = buildProgram(S.profile.days_per_week, S.profile.equipment);
  render();
};

// ----- Onglet Repas -----
function foodPrefsForm(pr, first) {
  return `
  <form data-form="food" class="card">
    <h2>${first ? 'Ton plan de repas' : 'Mes préférences alimentaires'}</h2>
    <p class="muted">Réponds à ces questions pour que je crée des repas qui te conviennent. Tu pourras les changer à tout moment.</p>
    <label>Allergies ou intolérances</label>
    <div class="checks">${Object.entries(ALLERGENS).map(([k, v]) => `<label class="check"><input type="checkbox" name="allergy" value="${k}" ${pr.allergies.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
    <label>Régime</label>
    <select name="diet">${Object.entries(DIETS).map(([k, v]) => `<option value="${k}" ${pr.diet === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label>Aliments que tu n’aimes pas ou veux éviter (séparés par des virgules)</label>
    <textarea name="dislikes" rows="2" placeholder="ex. saumon, brocoli, thon">${esc(pr.dislikes)}</textarea>
    <label>Repas par jour</label>
    <select name="meals">${[3, 4, 5].map((n) => `<option value="${n}" ${pr.meals === n ? 'selected' : ''}>${n} repas${n === 3 ? '' : n === 4 ? ' (dont 1 collation)' : ' (dont 2 collations)'}</option>`).join('')}</select>
    <button class="block" style="margin-top:14px">${first ? 'Créer mon plan de repas' : 'Enregistrer et régénérer mes repas'}</button>
    ${first ? '' : '<button type="button" class="ghost block" style="margin-top:8px" data-act="cancelPrefs">Annuler</button>'}
  </form>`;
}

function vFood() {
  const pl = S.plan, pr = prefs();
  const log = todayLog();
  if (!pr.done) return foodPrefsForm(pr, true);
  if (S.editPrefs) return foodPrefsForm(pr, false);
  const dayType = log.day_type === 'rest' ? 'rest' : 'train'; // par défaut : jour d'entraînement
  const dayT = dayVariant(pl, dayType);
  const cd = computeDay(dayT, pl.meal_plan, pr);
  const ex = extraTargets(dayT.calories, lastWeight());
  const week = S.daily.filter((d) => d.date >= addDays(today(), -6));
  const wAvg = avg(week.filter((d) => d.calories).map((d) => d.calories));
  return `
  <section class="card">
    <h2>Aujourd’hui</h2>
    <div class="tabs">
      <button type="button" class="${dayType === 'train' ? 'on' : ''}" data-act="setDayType" data-arg="train">🏋️ Jour d’entraînement</button>
      <button type="button" class="${dayType === 'rest' ? 'on' : ''}" data-act="setDayType" data-arg="rest">🛋️ Jour de repos</button>
    </div>
    <p class="muted">Les glucides (donc les calories) sont plus élevés les jours d’entraînement et plus bas les jours de repos. Protéines et lipides ne changent pas.</p>
  </section>
  <section class="card">
    <h2>Tes cibles du jour</h2>
    <div class="grid4">
      <div class="stat"><b>${dayT.calories}</b><span>kcal</span></div><div class="stat"><b>${dayT.protein}</b><span>protéines g</span></div>
      <div class="stat"><b>${dayT.carbs}</b><span>glucides g</span></div><div class="stat"><b>${dayT.fat}</b><span>lipides g</span></div>
    </div>
    <div class="grid3" style="margin-top:10px">
      <div class="stat"><b>≥ ${ex.fibre} g</b><span>fibres</span></div><div class="stat"><b>${pr.water ? '' : '≈ '}${String(pr.water ?? ex.eau).replace('.', ',')} L</b><span>eau</span></div>
      <div class="stat"><b>≤ ${ex.satfat} g</b><span>gras saturés</span></div>
    </div>
    <p class="muted">Moyenne hebdomadaire : ${pl.calories} kcal · ${pl.protein} g prot. · ${pl.carbs} g gluc. · ${pl.fat} g lip. Le coach ajuste cette moyenne chaque semaine selon ton check-in.</p>
    <button class="ghost block" data-act="editTargets">Modifier mes cibles</button>
  </section>
  <p class="muted">Quantités en aliments cuits, sauf indication. Les marques sont des exemples courants et les valeurs sont des moyennes : vérifie l’étiquette de ta marque.</p>
  ${cd.meals.map((m, si) => `
    <section class="card">
      <div class="row between"><h2>${SLOT_NAMES[m.slot]}</h2><span class="muted">${m1(m.totals.k)} kcal · ${m1(m.totals.p)} g prot.</span></div>
      ${m.items.map((it, ii) => it.g <= 0 ? '' : `
        <div class="food">
          <div style="flex:1">
            <b>${qtyText(it)}</b> ${esc(it.food.name)}${it.extra ? ' <span class="pill">complément</span>' : ''}
            <div class="muted">P ${m1(it.macros.p)} · G ${m1(it.macros.c)} · L ${m1(it.macros.f)} · ${m1(it.macros.k)} kcal</div>
            <div class="muted">Marques : ${esc(it.food.brands)}</div>
          </div>
          ${it.extra ? '' : `<button type="button" class="ghost small" data-act="swapFood" data-slot="${si}" data-item="${ii}" aria-label="Remplacer ${esc(it.food.name)}">↔</button>`}
        </div>`).join('')}
      <button type="button" class="ghost block" style="margin-top:8px" data-act="reroll" data-slot="${si}">Autre repas</button>
    </section>`).join('')}
  <section class="card">
    <h2>Total du plan</h2>
    <div class="row between"><span>Calories</span><span>${m1(cd.totals.k)} / ${dayT.calories}</span></div>${bar(cd.totals.k, dayT.calories)}
    <div class="row between"><span>Protéines</span><span>${m1(cd.totals.p)} / ${dayT.protein} g</span></div>${bar(cd.totals.p, dayT.protein)}
    <div class="row between"><span>Glucides</span><span>${m1(cd.totals.c)} / ${dayT.carbs} g</span></div>${bar(cd.totals.c, dayT.carbs)}
    <div class="row between"><span>Lipides</span><span>${m1(cd.totals.f)} / ${dayT.fat} g</span></div>${bar(cd.totals.f, dayT.fat)}
    <p class="muted">Les quantités visent tes cibles à quelques grammes près et se recalculent quand tu changes un aliment ou tes cibles.</p>
    <div class="grid2">
      <button class="ghost" data-act="grocery">Liste d’épicerie</button>
      <button class="ghost" data-act="showPrefs">Mes préférences</button>
    </div>
  </section>
  <form data-form="daily" class="card">
    <h2>Journal du jour</h2>
    <label>Poids du matin (${wUnit()}) — optionnel</label><input name="weight" type="number" step="0.1" inputmode="decimal" value="${log.weight != null ? fmtWeight(log.weight, wUnit()) : ''}">
    <label>Calories mangées</label><input name="calories" type="number" inputmode="numeric" value="${log.calories ?? ''}">
    <label>Protéines (g)</label><input name="protein" type="number" inputmode="numeric" value="${log.protein ?? ''}">
    <button class="block" style="margin-top:12px">Enregistrer</button>
    ${wAvg ? `<p class="muted">Moyenne des 7 derniers jours : ${Math.round(wAvg)} kcal (cible ${dayT.calories}).</p>` : ''}
  </form>`;
}
acts.setDayType = async (el) => {
  try {
    await db.saveDaily({ user_id: S.me.id, date: today(), day_type: el.dataset.arg });
    await refresh();
  } catch (e) { toast(e.message); }
};

acts.showPrefs = () => { S.editPrefs = true; render(); window.scrollTo(0, 0); };
acts.cancelPrefs = () => { S.editPrefs = false; render(); };
acts.swapFood = (el) => {
  const si = +el.dataset.slot, ii = +el.dataset.item;
  const pl = S.plan, pr = prefs();
  const it = pl.meal_plan.meals[si].items[ii];
  const cur = computeDay(curDayTargets(), pl.meal_plan, pr).meals[si].items[ii];
  const eq = equivalents(pl.meal_plan, si, ii, pr);
  openSheet(`
    <div class="row between"><h2>Remplacer</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">${ROLE_NAMES[it.role]} du ${SLOT_NAMES[pl.meal_plan.meals[si].slot].toLowerCase()} : <b>${esc(cur.food.name)}</b>. La quantité et le reste du repas se recalculent automatiquement.</p>
    ${eq.length ? eq.map((f) => `
      <div class="alt">
        <div style="flex:1"><b>${esc(f.name)}</b><div class="muted">Marques : ${esc(f.brands)}</div></div>
        <button class="small" data-act="pickFood" data-slot="${si}" data-item="${ii}" data-food="${f.id}">Choisir</button>
      </div>`).join('') : '<p class="muted">Aucun aliment de la liste intégrée ne convient à tes restrictions pour ce repas.</p>'}
    <h3>Ou cherche un aliment précis (marque, produit)</h3>
    <input type="search" data-act="searchInput" data-slot="${si}" data-item="${ii}" placeholder="ex. yogourt Oikos vanille, pain Country Harvest…" aria-label="Rechercher un aliment">
    <div id="food-search-results" class="muted" style="margin-top:8px">Tape au moins 2 lettres.</div>
    <p class="muted" style="margin-top:8px">Recherche fournie par Open Food Facts, une base ouverte : vérifie que le résultat correspond à tes restrictions et à l’étiquette réelle.</p>`);
};
acts.pickFood = async (el) => {
  try {
    await savePlan({ meal_plan: swapItem(S.plan.meal_plan, +el.dataset.slot, +el.dataset.item, el.dataset.food) });
    closeSheet();
    await refresh();
  } catch (e) { toast(e.message); }
};
let searchTimer = null;
acts.searchInput = (el) => {
  clearTimeout(searchTimer);
  const box = document.getElementById('food-search-results');
  const si = el.dataset.slot, ii = el.dataset.item;
  const q = el.value.trim();
  if (q.length < 2) { box.textContent = 'Tape au moins 2 lettres.'; return; }
  box.textContent = 'Recherche…';
  searchTimer = setTimeout(async () => {
    try {
      const results = await searchFoods(q);
      if (results === null) return; // recherche périmée, une plus récente est en cours
      box.innerHTML = results.length
        ? results.map((r) => `
          <div class="alt">
            <div style="flex:1"><b>${esc(r.name)}</b><div class="muted">${esc(r.brands || '—')} · ${Math.round(r.k)} kcal, P${Math.round(r.p)} G${Math.round(r.c)} L${Math.round(r.f)} /100 g</div></div>
            <button type="button" class="small" data-act="pickCustomFood" data-slot="${si}" data-item="${ii}"
              data-id="${esc(r.id)}" data-name="${esc(r.name)}" data-brands="${esc(r.brands)}" data-k="${r.k}" data-p="${r.p}" data-c="${r.c}" data-f="${r.f}">Choisir</button>
          </div>`).join('')
        : '<p class="muted">Aucun résultat. Essaie un autre nom (en français ou en anglais).</p>';
    } catch (e) { box.textContent = e.message; }
  }, 450);
};
acts.pickCustomFood = async (el) => {
  const d = el.dataset;
  const food = externalFood({ id: d.id, name: d.name, brands: d.brands, k: +d.k, p: +d.p, c: +d.c, f: +d.f });
  try {
    await savePlan({ meal_plan: swapItemCustom(S.plan.meal_plan, +d.slot, +d.item, food) });
    closeSheet();
    toast(`${food.name} ajouté à ton plan`);
    await refresh();
  } catch (e) { toast(e.message); }
};
acts.reroll = async (el) => {
  try {
    await savePlan({ meal_plan: rerollMeal(S.plan.meal_plan, +el.dataset.slot, prefs(), curDayTargets()) });
    await refresh();
  } catch (e) { toast(e.message); }
};
acts.grocery = () => {
  const list = groceryList(computeDay(curDayTargets(), S.plan.meal_plan, prefs()), 7);
  openSheet(`
    <div class="row between"><h2>Épicerie (7 jours)</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">Quantités pour une semaine de ton plan actuel (jour d’entraînement).</p>
    ${list.map((g) => `<div class="food"><div style="flex:1"><b>${esc(g.text)}</b> ${esc(g.name)}<div class="muted">Marques : ${esc(g.brands)}</div></div></div>`).join('')}`);
};
acts.editTargets = () => {
  const p = S.plan;
  openSheet(`
    <div class="row between"><h2>Modifier mes cibles</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">Les glucides se calculent automatiquement avec le reste. Le coach repartira de ces valeurs au prochain check-in.</p>
    <form data-form="targets">
      <label>Calories (kcal)</label><input name="calories" type="number" min="1000" max="6000" required value="${p.calories}">
      <label>Protéines (g)</label><input name="protein" type="number" min="40" max="400" required value="${p.protein}">
      <label>Lipides (g)</label><input name="fat" type="number" min="20" max="250" required value="${p.fat}">
      <label>Eau (litres par jour)</label><input name="eau" type="number" step="0.1" min="1" max="8" required value="${prefs().water ?? extraTargets(p.calories, lastWeight()).eau}">
      <button class="block" style="margin-top:12px">Enregistrer</button>
    </form>`);
};

function vCheckin() {
  const wk = curWeek(S.checkins);
  const cur = S.checkins.find((c) => c.week_start === wk);
  if (cur) {
    const c = cur.coach || { messages: [] };
    const pl = S.plan;
    return `
    <section class="card"><h2>Check-in de la semaine ✅</h2>
      <p class="muted">Envoyé pour la semaine du ${fmtDate(wk)}</p>
      ${c.messages.map((m) => `<div class="msg"><span>${m.icon}</span><span>${esc(m.text)}</span></div>`).join('')}
    </section>
    <section class="card"><h2>Ton plan cette semaine</h2>
      <div class="grid4"><div class="stat"><b>${pl.calories}</b><span>kcal</span></div><div class="stat"><b>${pl.protein}</b><span>prot. g</span></div>
      <div class="stat"><b>${pl.carbs}</b><span>gluc. g</span></div><div class="stat"><b>${pl.fat}</b><span>lip. g</span></div></div>
      ${pl.deload ? '<p><span class="pill">Semaine légère</span></p>' : ''}
    </section>
    ${canAI() ? `<section class="card"><h2>Avis du coach IA</h2>${cur.coach?.ai ? `<p>${esc(cur.coach.ai)}</p>` : '<p class="muted">Un commentaire personnalisé sur ta semaine.</p><button class="block" data-act="askAI">Demander un avis</button>'}</section>`
      : ''}`;
  }
  const wkDaily = S.daily.filter((d) => d.date >= wk && d.weight).map((d) => d.weight);
  const w0 = wkDaily.length ? round1(avg(wkDaily)) : lastWeight();
  const sel = (name, def = 3) => `<select name="${name}">${LEVEL5.map((t, i) => `<option value="${i + 1}" ${i + 1 === def ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const range = (name) => `<div class="row"><input name="${name}" type="range" min="0" max="100" step="10" value="90"><output style="width:48px">90%</output></div>`;
  return `
  <form data-form="checkin" class="card">
    <h2>Check-in de la semaine</h2>
    <p class="muted">Semaine du ${fmtDate(wk)} · sois honnête, le coach se base là-dessus.</p>
    <label>Poids moyen de la semaine (${wUnit()})</label><input name="weight" type="number" step="0.1" inputmode="decimal" required value="${fmtWeight(w0, wUnit())}">
    <label>Tour de taille (cm) — optionnel</label><input name="waist" type="number" step="0.5" inputmode="decimal">
    <div class="grid2">
      <div><label>Sommeil</label>${sel('sleep')}</div><div><label>Énergie</label>${sel('energy')}</div>
      <div><label>Courbatures</label>${sel('soreness')}</div><div><label>Stress</label>${sel('stress', 2)}</div>
    </div>
    <label>Séances faites (% du plan)</label>${range('adherence_training')}
    <label>Nutrition respectée (% du plan)</label>${range('adherence_nutrition')}
    <label>Notes (blessure, faim, contexte…)</label><textarea name="notes" rows="3"></textarea>
    <h3>Photos de progrès (optionnel)</h3>
    <label>De face</label><input type="file" name="photo_front" accept="image/*">
    <label>De profil</label><input type="file" name="photo_side" accept="image/*">
    <label>De dos</label><input type="file" name="photo_back" accept="image/*">
    <button class="block" style="margin-top:14px">Envoyer mon check-in</button>
  </form>`;
}

function vProgress() {
  const mine = S.who === 'me' || !S.other;
  const d = mine ? { profile: S.profile, checkins: S.checkins, workouts: S.workouts } : S.other;
  const st = statsOf(d);
  const pts = d.checkins.map((c) => ({ d: c.week_start, y: c.weight }));
  const withPhotos = d.checkins.filter((c) => c.photos && c.photos[S.slot]);
  const canSee = mine || d.profile.share_photos !== false;
  const a = withPhotos[0], b = withPhotos[withPhotos.length - 1];
  const SLOTS = { front: 'Face', side: 'Profil', back: 'Dos' };
  return `
  <div class="tabs">
    <button class="${mine ? 'on' : ''}" data-act="who" data-arg="me">Moi</button>
    <button class="${!mine ? 'on' : ''}" data-act="who" data-arg="other">${S.other ? esc(S.other.profile.name) : 'Ami'}</button>
  </div>
  <section class="card">
    <h2>${esc(d.profile.name)} · ${GOALS[d.profile.goal]}</h2>
    <div class="grid4">
      <div class="stat"><b>${st.change > 0 ? '+' : ''}${fmtWeight(st.change, wUnit(d.profile))}</b><span>${wUnit(d.profile)} depuis le début</span></div>
      <div class="stat"><b>${st.total}</b><span>séances</span></div>
      <div class="stat"><b>${st.streak}</b><span>sem. d’affilée</span></div>
      <div class="stat"><b>${st.adh ?? '–'}${st.adh === null ? '' : '%'}</b><span>régularité</span></div>
    </div>
  </section>
  <section class="card"><h2>Poids</h2>${lineChart(pts, wUnit(d.profile))}</section>
  <section class="card"><h2>Photos</h2>
    <div class="tabs">${Object.entries(SLOTS).map(([k, v]) => `<button class="${S.slot === k ? 'on' : ''}" data-act="slot" data-arg="${k}">${v}</button>`).join('')}</div>
    ${!canSee ? '<p class="muted">Cette personne ne partage pas ses photos.</p>'
      : withPhotos.length < 1 ? '<p class="muted">Pas encore de photo pour cet angle.</p>'
      : `<div class="photos">
          <div><img data-path="${esc(a.photos[S.slot])}" alt="Première photo"><p class="muted center">${fmtDate(a.week_start)}</p></div>
          <div>${withPhotos.length > 1 ? `<img data-path="${esc(b.photos[S.slot])}" alt="Dernière photo"><p class="muted center">${fmtDate(b.week_start)}</p>` : '<p class="muted">Une deuxième photo apparaîtra ici.</p>'}</div>
        </div>`}
  </section>
  <section class="card"><h2>Check-ins</h2>
    ${[...d.checkins].reverse().map((c) => `<div class="row between"><span>${fmtDate(c.week_start)}</span><span class="muted">${wTxt(c.weight, d.profile)} · séances ${c.adherence_training}% · nutrition ${c.adherence_nutrition}%</span></div>`).join('') || '<p class="muted">Aucun check-in.</p>'}
  </section>`;
}

// ----- Onglet Coach IA -----
const canAI = () => CONFIG.AI_ENABLED && !db.DEMO;
const chatKey = () => `coach_chat_${S.me.id}`;
function chatLoad() { try { return JSON.parse(localStorage.getItem(chatKey()) || '[]'); } catch { return []; } }
function chatSave(h) { try { localStorage.setItem(chatKey(), JSON.stringify(h.slice(-40))); } catch { /* stockage indisponible */ } }

const CHIPS = [
  'Comment remplacer un exercice que je ne peux pas faire ?',
  'Comment changer un aliment de mon plan ?',
  'Pourquoi mes calories ont changé ?',
  'Comment modifier mes cibles moi-même ?',
];

function faq(q) {
  const t = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const has = (...w) => w.some((x) => t.includes(x));
  if (has('ajouter un jour', 'programme', 'personnalis', 'creer un exercice', 'ajouter un exercice', 'nouvel exercice')) {
    return 'Dans l’onglet Séance, touche « Modifier mon programme » : tu peux ajouter, renommer, déplacer ou supprimer un jour, ajouter ou retirer des exercices (avec recherche), changer les séries et les répétitions, et créer un exercice personnalisé (nom, type, consigne, lien vidéo). Touche Enregistrer en bas pour garder tes changements.';
  }
  if (has('exercice', 'variante', 'remplac') && has('exercice', 'seance', 'douleur', 'mal', 'blessure', 'faire')) {
    return 'Dans l’onglet Séance, touche le nom d’un exercice : tu vois la photo de départ et d’arrivée. En bas de la fiche, « voir les variantes » propose des remplacements qui travaillent les mêmes muscles. Le choix remplace l’exercice partout dans ton programme. En cas de douleur, arrête l’exercice et consulte un professionnel.';
  }
  if (has('aliment', 'repas', 'manger', 'allerg', 'aime pas', 'remplac')) {
    return 'Onglet Repas : le bouton ↔ à côté d’un aliment propose des équivalents (la quantité se recalcule), et « Autre repas » régénère un repas complet. Pour les allergies, le régime ou les aliments que tu n’aimes pas, ouvre « Mes préférences » en bas de l’onglet : le plan est refait selon ces règles.';
  }
  if (has('calorie', 'macro', 'cible', 'proteine', 'glucide', 'lipide')) {
    return 'Tes cibles sont en haut de l’onglet Repas. Le coach les ajuste chaque semaine selon l’évolution de ton poids (± 150 kcal). Pour les changer toi-même, touche « Modifier mes cibles » : le coach repartira de tes chiffres au prochain check-in.';
  }
  if (has('check', 'semaine', 'ajust', 'poids', 'stagn')) {
    return 'Chaque semaine, le check-in enregistre ton poids, ton sommeil, ton énergie et tes séances. Le coach compare ton poids à la semaine précédente : trop lent ou trop rapide, il ajuste les calories ; s’il te sent fatigué, il propose une semaine légère ; si tu as bien fait tes séances, les charges montent. Le premier check-in sert seulement de point de départ.';
  }
  if (has('photo')) {
    return 'Les photos se prennent dans le check-in (face, profil, dos). Tu les compares ensuite dans l’onglet Progrès, avec la première photo et la plus récente côte à côte.';
  }
  if (has('charge', 'poids', 'kg', 'progress')) {
    return 'Quand toutes tes séries atteignent le haut de la fourchette de répétitions, l’objectif de charge monte à la séance suivante (+2,5 kg haut du corps, +5 kg bas du corps). Il est affiché sur chaque exercice.';
  }
  return null;
}
const FAQ_DEFAULT = 'Je peux répondre aux questions sur l’application (exercices, repas, cibles, check-in). Pour un coaching plus personnalisé, il faut activer le coach IA (voir le README, section « Coach IA »). Note ton idée et on l’ajoutera à l’application.';

function aiContext() {
  const p = S.profile, pl = S.plan, pr = prefs();
  const mealsFor = (dt) => pl.meal_plan ? computeDay(dayVariant(pl, dt), pl.meal_plan, pr).meals.map((m) => `${SLOT_NAMES[m.slot]} : ${m.items.filter((i) => i.g > 0).map((i) => `${qtyText(i)} ${i.food.name}`).join(', ')}`) : [];
  return {
    profil: {
      objectif: GOALS[p.goal], sexe: p.sex, age: new Date().getFullYear() - p.birth_year, taille_cm: p.height_cm,
      poids_kg: lastWeight(), unite_poids_affichee: wUnit(), jours_entrainement: p.days_per_week, materiel: p.equipment, limitations: p.limitations || '',
    },
    nutrition: {
      cibles_moyennes_semaine: { kcal: pl.calories, proteines_g: pl.protein, glucides_g: pl.carbs, lipides_g: pl.fat, eau_litres: pr.water ?? extraTargets(pl.calories, lastWeight()).eau },
      cycle_glucidique: { jour_entrainement: dayVariant(pl, 'train'), jour_repos: dayVariant(pl, 'rest'), note: 'Protéines et lipides identiques les deux types de jour ; seuls glucides et calories varient. La personne choisit le type de jour dans l’onglet Repas.' },
      allergies: pr.allergies, regime: pr.diet, non_aime: pr.dislikes, repas_par_jour: pr.meals,
      plan_de_repas_jour_entrainement: mealsFor('train'), plan_de_repas_jour_repos: mealsFor('rest'),
    },
    programme: pl.program.map((d) => ({ jour: d.label, exercices: d.exercises.map((e) => defOf(e).name) })),
    guide_application_supplementaire: 'Onglet Séance > « Modifier mon programme » : on peut ajouter, renommer, déplacer ou supprimer un jour, ajouter/retirer/déplacer des exercices, changer les séries et répétitions, et créer un exercice personnalisé (nom, type charge/poids du corps/durée, consigne, lien vidéo). Onglet Repas > le bouton ↔ propose aussi une recherche libre d’aliment (marques précises). Réglages : unité de poids kg/lb. Ces changements se font à la main dans l’application ; tu n’as pas à dire que c’est impossible.',
    semaine_legere: !!pl.deload,
    derniers_checkins: S.checkins.slice(-4).map(({ week_start, weight, sleep, energy, soreness, stress, adherence_training, adherence_nutrition, notes }) => ({ week_start, weight, sleep, energy, soreness, stress, adherence_training, adherence_nutrition, notes })),
    ajustements_du_coach: (pl.reasons || []).map((r) => r.text),
  };
}

// Photos de progrès à joindre pour que l'IA les analyse (pas seulement les chiffres). Non disponible en mode démo
// (pas de fonction serveur) ni pour des photos qui ne sont pas dans le stockage Supabase.
const ANGLE_NAME = { front: 'face', side: 'profil', back: 'dos' };
function photosOf(checkin, label) {
  if (!checkin || db.DEMO) return [];
  return Object.entries(checkin.photos || {}).map(([slot, path]) => ({ path, label: `${label} — ${ANGLE_NAME[slot] || slot}` }));
}
function recentPhotos(n = 2) {
  const withPhotos = S.checkins.filter((c) => c.photos && Object.keys(c.photos).length).slice(-n);
  return withPhotos.flatMap((c) => photosOf(c, `Semaine du ${fmtDate(c.week_start)}`));
}

function vCoach() {
  const hist = chatLoad();
  const hasPhotos = !db.DEMO && S.checkins.some((c) => c.photos && Object.keys(c.photos).length);
  return `
  <section class="card">
    <h2>Ton espace coach</h2>
    <p class="muted">${canAI()
      ? 'Pose tes questions sur ton entraînement, tes repas ou tes résultats. Je connais ton profil et ton plan. Je ne remplace pas un professionnel de la santé.'
      : 'Mode simple : je réponds aux questions sur l’application. Le coach IA complet n’est pas encore activé (voir le README, section « Coach IA »).'}</p>
    <div class="chat">
      ${hist.length ? hist.map((m) => `<div class="bubble ${m.r}">${esc(m.t).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted">Pose ta première question ou choisis une suggestion.</p>'}
      ${S.chatBusy ? '<div class="bubble ai">…</div>' : ''}
    </div>
    <div class="chips">
      ${canAI() && hasPhotos ? '<button type="button" class="ghost small" data-act="askPhotos">📸 Analyser mes photos de progrès</button>' : ''}
      ${CHIPS.map((c) => `<button type="button" class="ghost small" data-act="ask" data-q="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <form data-form="chat" class="chatform">
      <textarea name="q" rows="2" placeholder="Écris ton message…" required></textarea>
      <button ${S.chatBusy ? 'disabled' : ''}>Envoyer</button>
    </form>
    ${hist.length ? '<button type="button" class="ghost small" data-act="clearChat">Effacer la conversation</button>' : ''}
    ${canAI() ? '<p class="muted" style="margin-top:10px">Tes photos de progrès, quand tu les analyses, sont envoyées à Google (Gemini) pour cette réponse seulement.</p>' : ''}
  </section>`;
}
async function ask(q, photos = []) {
  const hist = chatLoad();
  hist.push({ r: 'user', t: q });
  chatSave(hist);
  S.chatBusy = true;
  render();
  window.scrollTo(0, document.body.scrollHeight);
  let text;
  if (!canAI()) {
    text = faq(q) ?? FAQ_DEFAULT;
  } else {
    const payload = { messages: hist.slice(-12).map((m) => ({ role: m.r === 'user' ? 'user' : 'model', text: m.t })), context: aiContext(), photos };
    const transient = (e) => /high demand|overload|unavailable|\[(429|500|503)\]/i.test(e.message);
    try {
      try {
        text = await db.askCoach(payload);
      } catch (e) {
        if (!transient(e)) throw e;
        await new Promise((r) => setTimeout(r, 3000)); // Google est parfois surchargé : on réessaie une fois
        text = await db.askCoach(payload);
      }
    } catch (e) {
      const help = faq(q);
      text = `${help ? `${help}\n\n` : ''}Le coach IA est momentanément indisponible, réessaie dans quelques instants.\n(${e.message})`;
    }
  }
  hist.push({ r: 'ai', t: text });
  chatSave(hist);
  S.chatBusy = false;
  render();
  window.scrollTo(0, document.body.scrollHeight);
}
acts.ask = (el) => ask(el.dataset.q);
acts.askPhotos = () => ask('Analyse l’évolution visible sur mes photos de progrès (silhouette, posture), en plus de mes derniers chiffres.', recentPhotos(2));
acts.clearChat = () => { chatSave([]); render(); };
forms.chat = async (form) => {
  const q = String(new FormData(form).get('q') || '').trim();
  if (q && !S.chatBusy) await ask(q);
};

function profileForm(p = {}, label = 'Enregistrer') {
  const opt = (v, t, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`;
  return `
  <form data-form="profile" class="card">
    <label>Prénom</label><input name="name" required value="${esc(p.name ?? '')}">
    <div class="grid2">
      <div><label>Sexe</label><select name="sex">${opt('homme', 'Homme', p.sex)}${opt('femme', 'Femme', p.sex)}</select></div>
      <div><label>Année de naissance</label><input name="birth_year" type="number" min="1940" max="2015" required value="${p.birth_year ?? ''}"></div>
      <div><label>Taille (cm)</label><input name="height_cm" type="number" min="120" max="230" required value="${p.height_cm ?? ''}"></div>
      <div><label>Poids actuel (${wUnit(p)})</label><input name="start_weight" type="number" step="0.1" min="15" max="550" required value="${p.start_weight != null ? fmtWeight(p.start_weight, wUnit(p)) : ''}"></div>
    </div>
    <label>Objectif</label><select name="goal">${Object.entries(GOALS).map(([k, v]) => opt(k, v, p.goal)).join('')}</select>
    <div class="grid2">
      <div><label>Jours d’entraînement / semaine</label><select name="days_per_week">${[2, 3, 4, 5, 6].map((n) => opt(String(n), n, String(p.days_per_week ?? 4))).join('')}</select></div>
      <div><label>Matériel</label><select name="equipment">${opt('gym', 'Salle de sport', p.equipment)}${opt('home', 'Maison (haltères)', p.equipment)}</select></div>
    </div>
    <label>Activité hors entraînement</label>
    <select name="activity">${opt('low', 'Surtout assis', p.activity)}${opt('medium', 'Assez actif', p.activity ?? 'medium')}${opt('high', 'Très actif / travail physique', p.activity)}</select>
    <label>Blessures ou exercices à éviter (optionnel)</label>
    <textarea name="limitations" rows="2" placeholder="ex. genou droit fragile, pas de barre au-dessus de la tête">${esc(p.limitations ?? '')}</textarea>
    <label><input type="checkbox" name="share_photos" ${p.share_photos === false ? '' : 'checked'}> Partager mes photos avec mon ami</label>
    <button class="block" style="margin-top:14px">${label}</button>
  </form>`;
}

function vSettings() {
  const u = wUnit();
  return `
  <section class="card">
    <h2>Unité de poids</h2>
    <div class="tabs">
      <button type="button" class="${u === 'kg' ? 'on' : ''}" data-act="setUnit" data-arg="kg">Kilogrammes (kg)</button>
      <button type="button" class="${u === 'lb' ? 'on' : ''}" data-act="setUnit" data-arg="lb">Livres (lb)</button>
    </div>
    <p class="muted">Change juste l’affichage : tes données restent enregistrées en kilogrammes.</p>
  </section>
  ${profileForm(S.profile)}
  <section class="card">
    <p class="muted">Connecté : ${esc(S.me.email)}</p>
    ${db.DEMO ? '<button class="ghost block" data-act="resetDemo">Réinitialiser la démo</button>' : '<button class="ghost block" data-act="logout">Se déconnecter</button>'}
  </section>`;
}
acts.setUnit = async (el) => {
  try { await setFoodPrefs({ weight_unit: el.dataset.arg }); toast(`Poids affichés en ${el.dataset.arg}`); render(); }
  catch (e) { toast(e.message); }
};

const routes = { home: vHome, train: vTrain, edit: vEdit, food: vFood, checkin: vCheckin, progress: vProgress, coach: vCoach, settings: vSettings };
const TITLES = { home: 'Accueil', train: 'Entraînement', edit: 'Mon programme', food: 'Repas', checkin: 'Check-in', progress: 'Progrès', coach: 'Coach', settings: 'Réglages' };
const TABS = [['home', '🏠', 'Accueil'], ['train', '🏋️', 'Séance'], ['food', '🍽️', 'Repas'], ['checkin', '📝', 'Check-in'], ['progress', '📈', 'Progrès'], ['coach', '💬', 'Coach']];

// ================= Rendu =================
function render() {
  if (!S.me) return renderAuth();
  if (!S.profile) return renderOnboarding();
  root.innerHTML = `${db.DEMO ? '<div class="demo">Mode démo : les données restent sur cet appareil</div>' : ''}
    <header><h1>${TITLES[S.view]}</h1><a href="#/settings" aria-label="Réglages">⚙️</a></header>
    <main>${routes[S.view]()}</main>
    <nav>${TABS.map(([k, i, t]) => `<a href="#/${k}" class="${S.view === k || (k === 'train' && S.view === 'edit') ? 'on' : ''}"><b>${i}</b>${t}</a>`).join('')}</nav>`;
  hydratePhotos();
}
function renderAuth() {
  const up = S.authMode === 'up';
  root.innerHTML = `<div class="auth"><form data-form="auth" class="card">
    <h2>${up ? 'Créer un compte' : 'Connexion'}</h2>
    <label>Courriel</label><input name="email" type="email" required autocomplete="email">
    <label>Mot de passe</label><input name="password" type="password" minlength="6" required autocomplete="${up ? 'new-password' : 'current-password'}">
    <button class="block" style="margin-top:14px">${up ? 'Créer mon compte' : 'Me connecter'}</button>
    <p class="center"><a href="#" data-act="toggleAuth">${up ? 'J’ai déjà un compte' : 'Créer un compte'}</a></p>
  </form></div>`;
}
function renderOnboarding() {
  root.innerHTML = `<div class="auth"><h2>Bienvenue 👋</h2><p class="muted">Quelques infos pour créer ton plan de départ. Tu pourras tout modifier ensuite.</p>${profileForm({}, 'Créer mon plan')}</div>`;
}
async function hydratePhotos() {
  for (const img of document.querySelectorAll('img[data-path]')) {
    const u = await db.photoUrl(img.dataset.path);
    if (u) img.src = u;
  }
}
function route() {
  const name = (location.hash.replace('#/', '') || 'home').split('?')[0];
  S.view = routes[name] ? name : 'home';
  if (S.view !== 'train') S.dayIdx = null;
  if (S.view !== 'food') S.editPrefs = false;
  // Le brouillon du programme n'existe que sur l'écran d'édition
  if (S.view === 'edit') { if (!S.draft) S.draft = structuredClone(S.plan.program); } else S.draft = null;
  closeSheet();
  render();
  window.scrollTo(0, 0);
}
async function refresh(v) {
  await loadMine();
  if (S.profile) await loadOther();
  if (v) location.hash = '#/' + v;
  route();
}

// ================= Actions (clics) =================
acts.startDay = (el) => { S.dayIdx = +el.dataset.arg; location.hash = '#/train'; route(); };
acts.pickDay = (el) => { S.dayIdx = +el.dataset.arg; render(); };
acts.who = (el) => { S.who = el.dataset.arg; render(); };
acts.seeOther = () => { S.who = 'other'; };
acts.slot = (el) => { S.slot = el.dataset.arg; render(); };
acts.toggleAuth = (el, e) => { e.preventDefault(); S.authMode = S.authMode === 'in' ? 'up' : 'in'; render(); };
acts.logout = async () => { await db.signOut(); S.me = null; S.profile = null; render(); };
acts.resetDemo = () => { db.resetDemo(); location.hash = '#/home'; location.reload(); };
acts.askAI = async (el) => {
  el.disabled = true; el.textContent = 'Le coach réfléchit…';
  try {
    const cur = S.checkins.find((c) => c.week_start === curWeek(S.checkins));
    const prev = S.checkins[S.checkins.length - 2];
    const photos = [...photosOf(cur, 'Cette semaine'), ...photosOf(prev, 'Semaine précédente')];
    const text = await db.askCoach({
      messages: [{ role: 'user', text: 'Commente ma semaine en 4 à 8 phrases : ce qui va bien, ce qui inquiète, et une action concrète pour la semaine à venir. Si des photos sont jointes, commente aussi ce qui est visible dessus (silhouette, posture), en plus des chiffres.' }],
      context: { ...aiContext(), ajustements_du_coach: cur.coach.messages.map((m) => m.text) },
      photos,
    });
    await db.saveCheckin({ ...cur, coach: { ...cur.coach, ai: text } });
    await refresh();
  } catch (e) { toast('Avis IA indisponible : ' + e.message); el.disabled = false; el.textContent = 'Demander un avis'; }
};

// ================= Formulaires =================
forms.auth = async (form) => {
  const fd = new FormData(form);
  try {
    if (S.authMode === 'up') await db.signUp(fd.get('email'), fd.get('password'));
    else await db.signIn(fd.get('email'), fd.get('password'));
    S.me = await db.getUser();
    await refresh('home');
  } catch (e) { toast(e.message); }
};

forms.profile = async (form) => {
  const fd = Object.fromEntries(new FormData(form));
  const old = S.profile;
  const p = {
    ...(old || {}),
    id: S.me.id, name: fd.name.trim(), sex: fd.sex, birth_year: +fd.birth_year, height_cm: +fd.height_cm,
    start_weight: toKg(+fd.start_weight, wUnit(old)), goal: fd.goal, days_per_week: +fd.days_per_week, equipment: fd.equipment,
    activity: fd.activity, limitations: (fd.limitations || '').trim(), share_photos: !!fd.share_photos,
  };
  if (old && (old.days_per_week !== p.days_per_week || old.equipment !== p.equipment)
      && !confirm('Changer les jours ou le matériel remplace ton programme actuel, y compris tes modifications. Continuer ?')) return;
  try {
    await db.saveProfile(p);
    if (!old) {
      await db.savePlan({
        user_id: S.me.id, ...calcTargets(p, p.start_weight), program: buildProgram(p.days_per_week, p.equipment),
        deload: false, hold: false, meal_plan: null,
        reasons: [{ icon: '🚀', text: 'Plan de départ créé selon ton profil. Fais ton premier check-in pour lancer le suivi.' }],
      });
      await refresh('home');
      return;
    }
    S.profile = p;
    const programChanged = old.days_per_week !== p.days_per_week || old.equipment !== p.equipment;
    const targetsChanged = old.goal !== p.goal || old.activity !== p.activity;
    if (programChanged || targetsChanged) {
      const ch = { reasons: [{ icon: '🛠️', text: 'Plan mis à jour après le changement de ton profil.' }] };
      if (programChanged) ch.program = buildProgram(p.days_per_week, p.equipment);
      if (targetsChanged) Object.assign(ch, calcTargets(p, lastWeight()));
      await savePlan(ch);
    }
    toast('Profil enregistré');
    await refresh();
  } catch (e) { toast(e.message); }
};

forms.food = async (form) => {
  const fd = new FormData(form);
  const pr = { allergies: fd.getAll('allergy'), diet: fd.get('diet'), dislikes: String(fd.get('dislikes') || '').trim(), meals: +fd.get('meals'), done: true };
  try {
    await db.saveProfile({ ...S.profile, food_prefs: pr });
    S.profile = { ...S.profile, food_prefs: pr };
    await savePlan({ meal_plan: buildChoices(pr, Date.now(), S.plan) });
    S.editPrefs = false;
    toast('Plan de repas créé');
    await refresh('food');
  } catch (e) { toast(e.message); }
};

forms.targets = async (form) => {
  const fd = new FormData(form);
  const calories = +fd.get('calories'), protein = +fd.get('protein'), fat = +fd.get('fat');
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const eau = Math.round(parseFloat(String(fd.get('eau')).replace(',', '.')) * 10) / 10;
  try {
    if (eau > 0 && eau !== prefs().water) {
      const food_prefs = { ...(S.profile.food_prefs || {}), water: eau };
      await db.saveProfile({ ...S.profile, food_prefs });
      S.profile = { ...S.profile, food_prefs };
    }
    await savePlan({ calories, protein, fat, carbs, reasons: [{ icon: '✏️', text: 'Cibles modifiées à la main. Le coach repartira de ces valeurs au prochain check-in.' }] });
    closeSheet();
    toast('Cibles enregistrées');
    await refresh();
  } catch (e) { toast(e.message); }
};

forms.workout = async (form) => {
  const idx = +form.dataset.day;
  const day = S.plan.program[idx];
  const fd = new FormData(form);
  const exercises = [];
  day.exercises.forEach((ex, i) => {
    const sets = [];
    for (let s = 0; fd.has(`r_${i}_${s}`); s++) {
      const r = +fd.get(`r_${i}_${s}`);
      if (r > 0) sets.push({ w: +fd.get(`w_${i}_${s}`) || 0, r });
    }
    if (sets.length) exercises.push({ id: ex.id, sets });
  });
  if (!exercises.length) return toast('Note au moins une série avant de terminer.');
  try {
    await db.saveWorkout({ user_id: S.me.id, date: today(), day_label: day.label, exercises });
    toast('Séance enregistrée 💪');
    S.dayIdx = null;
    await refresh('home');
  } catch (e) { toast(e.message); }
};

forms.daily = async (form) => {
  const fd = new FormData(form);
  const num = (k) => (fd.get(k) === '' ? null : +fd.get(k));
  const w = num('weight');
  try {
    await db.saveDaily({ user_id: S.me.id, date: today(), weight: w == null ? null : toKg(w, wUnit()), calories: num('calories'), protein: num('protein') });
    toast('Journal enregistré');
    await refresh();
  } catch (e) { toast(e.message); }
};

forms.checkin = async (form) => {
  const fd = new FormData(form);
  const wk = curWeek(S.checkins);
  const btn = form.querySelector('button');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const photos = {};
    for (const slot of ['front', 'side', 'back']) {
      const f = fd.get('photo_' + slot);
      if (f && f.size) photos[slot] = await db.uploadPhoto(S.me.id, wk, slot, await resizeImage(f));
    }
    const c = {
      user_id: S.me.id, week_start: wk, weight: toKg(+fd.get('weight'), wUnit()), waist: +fd.get('waist') || null,
      sleep: +fd.get('sleep'), energy: +fd.get('energy'), soreness: +fd.get('soreness'), stress: +fd.get('stress'),
      adherence_training: +fd.get('adherence_training'), adherence_nutrition: +fd.get('adherence_nutrition'),
      notes: fd.get('notes') || '', photos,
    };
    const all = [...S.checkins.filter((x) => x.week_start !== wk), c].sort((a, b) => (a.week_start > b.week_start ? 1 : -1));
    const res = weeklyAdjust({ profile: S.profile, plan: S.plan, checkins: all });
    c.coach = { messages: res.messages, deload: res.deload };
    await db.saveCheckin(c);
    await savePlan({ calories: res.calories, protein: res.protein, carbs: res.carbs, fat: res.fat, deload: res.deload, hold: res.hold, reasons: res.messages });
    await refresh('checkin');
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Envoyer mon check-in'; }
};

// ================= Événements globaux =================
function bindEvents(el) {
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (t && t.tagName !== 'SELECT' && acts[t.dataset.act]) acts[t.dataset.act](t, e);
  });
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tap[data-act]')) { e.preventDefault(); e.target.click(); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset.edit && S.draft) return editField(e.target);
    // Formulaire d'exercice perso : le type change les valeurs par défaut (durée = 2 × 30-60 s)
    if (e.target.name === 'kind' && e.target.form?.dataset.form === 'customEx' && e.target.form.dataset.e === undefined) {
      const f = e.target.form, time = e.target.value === 'time';
      f.sets.value = time ? 2 : 3; f.lo.value = time ? 30 : 8; f.hi.value = time ? 60 : 12;
      return;
    }
    const t = e.target.closest('select[data-act]');
    if (t && acts[t.dataset.act]) acts[t.dataset.act](t, e);
  });
  el.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (f && forms[f.dataset.form]) { e.preventDefault(); forms[f.dataset.form](f, e); }
  });
  el.addEventListener('input', (e) => {
    if (e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value + '%';
    // Recherche dans la liste d'exercices
    if (e.target.dataset.filter !== undefined) {
      const q = norm(e.target.value.trim());
      e.target.closest('.panel').querySelectorAll('[data-name]').forEach((r) => { r.hidden = !!q && !r.dataset.name.includes(q); });
    }
    // Champs qui réagissent en tapant (ex. recherche d'aliment)
    if (e.target.dataset.act && acts[e.target.dataset.act]) acts[e.target.dataset.act](e.target, e);
  });
}
bindEvents(root);
bindEvents(sheetEl);
// Si la photo d'un exercice ne charge pas depuis le premier hébergeur, on essaie le second.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.fb && !t.dataset.tried) { t.dataset.tried = '1'; t.src = t.dataset.fb; }
}, true);

// ================= Démarrage =================
(async function boot() {
  try {
    await db.init();
    S.me = await db.getUser();
    if (S.me) { await loadMine(); if (S.profile) await loadOther(); }
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="auth"><div class="card"><h2>Oups</h2><p>${esc(e.message)}</p><p class="muted">Vérifie js/config.js et ta connexion.</p></div></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
