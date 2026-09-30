import * as db from './db.js';
import { CONFIG } from './config.js';
import { esc, today, addDays, daysBetween, fmtDate, round1, avg, resizeImage, weekStartFor, toKg, fromKg, fmtWeight, kgToLb, lbToKg } from './util.js';
import { parsePlates } from './plates.js';
import { EXERCISES, MUSCLES, buildProgram, altsFor, searchExercises, imgUrl, imgFallback } from './data.js';
import { calcTargets, weeklyAdjust, nextTarget, extraTargets, dayVariant, goalStatus, bmr } from './rules.js';
import { ALLERGENS, ALLERGEN_WORDS, DIETS, EXTRA_ALLERGIES, otherAllergyLabel, externalFood, FOODS } from './foods.js';
import { buildChoices, rerollMeal, equivalents, swapItem, swapItemCustom, computeDay, qtyText, groceryList, mealName, mealRecipe, TEMPLATES, SLOT_NAMES, ROLE_NAMES, menusOf, menuIndexFor, setMenu, addMenus } from './meals.js';
import { ACTIONS_DOC, splitActions, planActions, carbsForCalories } from './actions.js';
import { COACH_GUIDE } from './knowledge.js';
import { franciser } from './langue.js';
import { ESSENTIALS, FIRST_MESSAGE, mergeDraft, missing, onboardPayload, parseReply, mockTurn } from './onboarding.js';

const S = {
  me: null, profile: null, plan: null, workouts: [], daily: [], checkins: [], others: [],
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
// Les amis reliés (voir « Partage avec un ami » dans les Réglages), triés par prénom.
async function loadOthers() {
  const partners = (await db.listPartners(S.me.id)).sort((a, b) => a.name.localeCompare(b.name, 'fr')).slice(0, 12);
  S.others = await Promise.all(partners.map(async (p) => {
    const [plan, workouts, daily, checkins] = await Promise.all([
      db.getPlan(p.id), db.listWorkouts(p.id), db.listDaily(p.id), db.listCheckins(p.id),
    ]);
    return { profile: p, plan, workouts, daily, checkins };
  }));
  if (S.who !== 'me' && !S.others.some((o) => o.profile.id === S.who)) S.who = 'me';
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
const prefs = () => ({
  allergies: [], other_allergies: [], diet: 'aucun', dislikes: '', meals: 4, done: false, water: null, weight_unit: 'kg', goal_weight: null, goal_date: '',
  load_units: {}, plate_lb: 45, bar_lb: 45, training_goal_text: '', training_goal_ai: '', training_style: 'hypertrophy',
  budget: 'normal',
  ...(S.profile?.food_prefs || {}),
});
const BUDGETS = { serre: 'Serré (aliments les moins chers possible)', normal: 'Normal', genereux: 'Généreux (peu importe le prix)' };
const TRAINING_STYLES = {
  strength: 'Force (peu de répétitions)', hypertrophy: 'Hypertrophie (6 à 10 répétitions)', endurance: 'Endurance musculaire (10+ répétitions)',
};
// Chaque exercice a sa propre unité de charge (haltères en lb, machine en kg, barre en plates…).
const loadUnitFor = (exId) => prefs().load_units[exId] || 'kg';
async function setExUnit(exId, unit) {
  const load_units = { ...prefs().load_units, [exId]: unit };
  await setFoodPrefs({ load_units });
}
// Texte de l'objectif de charge, dans l'unité de CET exercice (kg, lb, ou lb + repère par côté pour les plates).
function loadTxt(kg, exId) {
  if (kg == null) return null;
  const u = loadUnitFor(exId);
  if (u === 'kg') return `${round1(kg)} kg`;
  const lb = round1(kgToLb(kg));
  if (u === 'lb') return `${lb} lb`;
  const perSide = round1((lb - (prefs().bar_lb ?? 45)) / 2);
  return `${lb} lb (${perSide} lb/côté sans la barre)`;
}
// Attributs du champ de saisie d'une série, selon l'unité de cet exercice.
function loadInputAttrs(kg, exId) {
  const u = loadUnitFor(exId);
  if (u === 'plates') return { type: 'text', value: '', placeholder: 'ex. 1 plate 25' };
  const v = kg == null ? '' : round1(u === 'lb' ? kgToLb(kg) : kg);
  return { type: 'number', value: v, placeholder: u };
}
// Convertit ce que la personne a tapé (kg, lb ou notation plates) en kilogrammes pour l'enregistrement.
function parseLoadInput(raw, exId) {
  const u = loadUnitFor(exId);
  if (raw === '' || raw == null) return 0;
  if (u === 'kg') return +raw || 0;
  if (u === 'lb') return lbToKg(+raw || 0);
  const p = parsePlates(raw, { plateLb: prefs().plate_lb ?? 45, barLb: prefs().bar_lb ?? 45 });
  return p ? lbToKg(p.totalLb) : 0;
}
const wUnit = (p = S.profile) => (p?.food_prefs?.weight_unit) || 'kg';
const wTxt = (kg, p = S.profile) => `${fmtWeight(kg, wUnit(p))} ${wUnit(p)}`;
async function setFoodPrefs(patch) {
  const food_prefs = { ...prefs(), ...patch };
  await db.saveProfile({ ...S.profile, food_prefs });
  S.profile = { ...S.profile, food_prefs };
}
// Semaine personnelle : commence le jour du tout premier check-in de la personne (pas le lundi civil).
const curWeek = (checkins) => weekStartFor(today(), checkins[0]?.week_start);
// Le poids et la date visés vivent dans food_prefs ; les règles du coach (rules.js) les attendent à plat sur le profil.
const profileWithGoal = () => ({ ...S.profile, goal_weight_kg: prefs().goal_weight, goal_date: prefs().goal_date });

// ================= Petits helpers d'affichage =================
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
// Ligne sous un aliment : vraies marques (« Marques : Natrel, Québon ») ou simple description (« Frais ou surgelé »)
const brandLine = (b) => !b ? '' : /^[A-ZÀ-Ý]/.test(b) ? `Marques : ${b}` : b[0].toUpperCase() + b.slice(1);
const bar = (v, t, kind = '') => `<div class="bar ${kind}"><i style="width:${Math.min(100, t ? (v / t) * 100 : 0)}%"></i></div>`;
const GOALS = { lose: 'Perdre du gras', maintain: 'Maintenir', gain: 'Prendre du muscle' };
const LEVEL5 = ['1 · Très bas', '2 · Bas', '3 · Correct', '4 · Bon', '5 · Excellent'];
// Exercice qu'on tient (planche…) : la 1re photo de la base est la position de départ (à genoux, couché),
// seule la 2e montre la position tenue.
const mainImg = (id) => (EXERCISES[id]?.time ? 1 : 0);
const thumb = (id) => EXERCISES[id]
  ? `<img class="thumb" loading="lazy" src="${imgUrl(id, mainImg(id))}" data-fb="${imgFallback(id, mainImg(id))}" alt="">`
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
// Menus qui alternent (voir meals.js) : celui d'aujourd'hui, et celui qu'on regarde dans l'onglet Repas.
const todayMenuIdx = () => menuIndexFor(today(), menusOf(S.plan.meal_plan).length);
function viewMenuIdx() {
  const i = S.menuIdx ?? todayMenuIdx();
  return i < menusOf(S.plan.meal_plan).length ? i : 0;
}
const viewMenu = () => menusOf(S.plan.meal_plan)[viewMenuIdx()];
const saveViewMenu = (menu) => savePlan({ meal_plan: setMenu(S.plan.meal_plan, viewMenuIdx(), menu) });
// Calories et protéines des repas cochés « Mangé » (menu du jour, selon le type de jour).
function eatenTotals(eaten, dayType) {
  const cd = computeDay(dayVariant(S.plan, dayType === 'rest' ? 'rest' : 'train'), menusOf(S.plan.meal_plan)[todayMenuIdx()], prefs());
  const ms = cd.meals.filter((m) => eaten.includes(m.slot));
  return { calories: Math.round(ms.reduce((t, m) => t + m.totals.k, 0)), protein: Math.round(ms.reduce((t, m) => t + m.totals.p, 0)) };
}
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
// Fenêtre de confirmation de l'app (remplace confirm() du navigateur : plus lisible, et marche partout,
// y compris là où le navigateur bloque ses propres fenêtres). Renvoie une promesse : true si la personne confirme.
function askConfirm(text, ok = 'Confirmer', cancel = 'Annuler') {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="backdrop"></div>
      <div class="dialog" role="alertdialog" aria-modal="true"><p>${esc(text)}</p>
        <div class="row"><button type="button" class="ghost" data-r="0">${esc(cancel)}</button><button type="button" data-r="1">${esc(ok)}</button></div></div>`;
    const done = (v) => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1'); else if (e.target.classList.contains('backdrop')) done(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(el);
    el.querySelector('[data-r="1"]').focus();
  });
}
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

// Carte « objectif » sur l'accueil : n'apparaît que si un poids et une date visés sont fixés (Réglages).
function goalCardHtml() {
  const g = goalStatus(profileWithGoal(), lastWeight());
  if (!g) return '';
  const pr = prefs(), u = wUnit();
  const dateTxt = new Date(pr.goal_date + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
  if (g.done && g.reached) return `<section class="card"><h2>🎉 Objectif atteint</h2><p>Tu es à ton poids visé (${fmtWeight(pr.goal_weight, u)} ${u}). Fixe un nouveau poids ou une nouvelle date dans Réglages si tu veux continuer.</p></section>`;
  if (g.done) return `<section class="card"><h2>📅 Date visée dépassée</h2><p>Il reste ${fmtWeight(Math.abs(g.gap), u)} ${u} pour atteindre ${fmtWeight(pr.goal_weight, u)} ${u}. Choisis une nouvelle date dans Réglages.</p></section>`;
  return `
  <section class="card">
    <h2>🎯 Objectif</h2>
    <p>${fmtWeight(pr.goal_weight, u)} ${u} d’ici le ${dateTxt} <span class="muted">(${g.weeksLeft} sem.)</span></p>
    <div class="grid2">
      <div class="stat"><b>${fmtWeight(Math.abs(g.gap), u)} ${u}</b><span>${g.gap < 0 ? 'à perdre' : 'à prendre'}</span></div>
      <div class="stat"><b>${g.neededPercent > 0 ? '+' : ''}${g.neededPercent} %</b><span>par semaine nécessaire</span></div>
    </div>
    <p class="muted">${g.realistic ? 'Rythme sûr pour ta date : le coach s’en sert pour ajuster tes calories.' : `Cette date demande un rythme plus rapide que ce qui est sûr. De façon réaliste, compte plutôt jusqu’au ${new Date(Date.now() + g.realisticDays * 864e5).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}.`}</p>
  </section>`;
}

// ================= Écrans =================
function vHome() {
  const p = S.profile, plan = S.plan, wk = curWeek(S.checkins);
  const done = S.checkins.some((c) => c.week_start === wk);
  const idx = nextDayIdx();
  const day = plan.program[idx];
  const log = S.daily.find((d) => d.date === today()) || {};
  const last = S.checkins[S.checkins.length - 1];
  const msgs = (last?.coach?.messages) || plan.reasons || [];
  return `
  <section class="hello">
    <h2>Salut ${esc(p.name)} 👋</h2>
    <p class="muted">Semaine ${S.checkins.length + (done ? 0 : 1)}, objectif : ${GOALS[p.goal].toLowerCase()}</p>
    ${done
      ? '<p class="done">✅ Check-in de la semaine fait</p>'
      : '<a class="btn ghost block" href="#/checkin">Faire mon check-in de la semaine</a>'}
  </section>
  <section class="card hero">
    <div class="row between"><p class="kicker">Prochaine séance</p>${plan.deload ? '<span class="pill">Semaine légère</span>' : ''}</div>
    <p class="day">${esc(day.label)}</p>
    <ul>${day.exercises.map((e) => `<li>${esc(defOf(e).name)}</li>`).join('')}</ul>
    <button class="block" data-act="startDay" data-arg="${idx}">Commencer la séance</button>
  </section>
  <section class="card nutri">
    <h2>Nutrition aujourd’hui</h2>
    <div class="row between"><span>Calories</span><span><b>${log.calories || 0}</b> / ${plan.calories} kcal</span></div>${bar(log.calories || 0, plan.calories)}
    <div class="row between"><span>Protéines</span><span><b>${log.protein || 0}</b> / ${plan.protein} g</span></div>${bar(log.protein || 0, plan.protein, 'p')}
    ${prefs().done
      ? '<a class="btn ghost block" href="#/food">Voir mes repas</a>'
      : '<a class="btn block" href="#/food">Créer mon plan de repas (2 min)</a>'}
  </section>
  ${goalCardHtml()}
  ${msgs.length ? `<section class="card"><h2>Le coach</h2>${msgs.map((m) => `<div class="msg"><span>${m.icon}</span><span>${esc(m.text)}</span></div>`).join('')}</section>` : ''}
  ${S.others.length ? S.others.map((o) => { const os = statsOf(o); return `
  <section class="card">
    <h2>${esc(o.profile.name)}</h2>
    <div class="grid4"><div class="stat"><b>${os.week}</b><span>séances / sem.</span></div>
      <div class="stat"><b>${os.change > 0 ? '+' : ''}${fmtWeight(os.change, wUnit(o.profile))}</b><span>${wUnit(o.profile)}</span></div>
      <div class="stat"><b>${os.streak}</b><span>sem. d’affilée</span></div>
      <div class="stat"><b>${os.adh ?? '–'}${os.adh === null ? '' : '%'}</b><span>régularité</span></div></div>
    <a class="btn ghost block" style="margin-top:10px" href="#/progress" data-act="seeOther" data-arg="${esc(o.profile.id)}">Voir son progrès</a>
  </section>`; }).join('') : `
  <section class="card">
    <h2>Tes amis</h2>
    <p class="muted">Invite un ami pour suivre vos progrès ensemble.</p><a class="btn ghost block" href="#/settings">Inviter un ami</a>
  </section>`}`;
}

// Consigne de première fois (« 1 ou 2 répétitions en réserve ») : dite UNE fois en haut de la séance, pas sous chaque exercice.
function firstTimeNote(day) {
  const firsts = day.exercises.filter((ex) => nextTarget(defOf(ex), ex, lastSets(ex.id), { deload: S.plan.deload, hold: S.plan.hold }).first);
  if (!firsts.length) return '';
  const bw = firsts.some((ex) => defOf(ex).bw);
  return `<p class="muted">💡 Première fois : choisis une charge qui te laisse 1 ou 2 répétitions en réserve${bw ? ' (au poids du corps : un maximum propre dans la fourchette)' : ''}.</p>`;
}

// Séries d'échauffement qui montent vers la charge du jour (arrondies à 2,5 kg ou 5 lb), pour le premier exercice
// avec charge de la séance. Sans charge connue (première fois) : conseil général.
function warmupHtml(targetKg, id) {
  if (!targetKg) return '<p class="muted warmup">🔥 Échauffement : 2 ou 3 séries légères qui montent vers ta charge de travail, avant tes séries.</p>';
  const lb = loadUnitFor(id) !== 'kg';
  const at = (pct) => (lb ? `${Math.max(5, Math.round((kgToLb(targetKg) * pct) / 5) * 5)} lb` : `${Math.max(2.5, Math.round((targetKg * pct) / 2.5) * 2.5)} kg`);
  const steps = targetKg >= 40 ? [[0.5, 8], [0.7, 4], [0.85, 2]] : [[0.5, 10], [0.75, 5]];
  return `<p class="muted warmup">🔥 Échauffement : ${steps.map(([pct, r]) => `${at(pct).replace('.', ',')} × ${r}`).join(', ')}, puis tes séries.</p>`;
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
    ${firstTimeNote(day)}
    ${day.exercises.map((ex, i) => {
      const def = defOf(ex);
      const last = lastSets(ex.id);
      const t = nextTarget(def, ex, last, { deload: S.plan.deload, hold: S.plan.hold });
      const warm = i === day.exercises.findIndex((e) => !defOf(e).bw && !defOf(e).time);
      const unit = def.time ? 's' : 'répétitions';
      return `<div class="ex">
        <div class="row tap" data-act="exInfo" data-arg="${ex.id}" role="button" tabindex="0" aria-label="Voir l’exercice ${esc(def.name)}">
          ${thumb(ex.id)}
          <div style="flex:1"><h3>${esc(def.name)} <span class="muted">ⓘ</span></h3>
          <div class="muted">${t.sets} × ${ex.lo}–${ex.hi} ${unit}${t.w !== null ? ` · objectif ${loadTxt(t.w, ex.id)}` : ''}</div></div>
        </div>
        ${warm ? warmupHtml(t.w, ex.id) : ''}
        ${t.first && !last ? '' : `<div class="muted">${t.first ? '' : esc(t.note)}${last ? ` Dernière fois : ${last.map((s) => `${loadUnitFor(ex.id) === 'kg' ? round1(s.w || 0) : round1(kgToLb(s.w || 0))}${loadUnitFor(ex.id) === 'kg' ? '' : ' lb'}×${s.r}`).join(', ')}.` : ''}</div>`}
        <div class="sets${def.time ? ' time' : ''}">${Array.from({ length: t.sets }, (_, s) => {
          const a = loadInputAttrs(t.w, ex.id);
          const dr = draftLoad()[ex.id]?.[s];
          const wVal = dr?.w !== undefined ? dr.w : a.value;
          const rVal = dr?.r !== undefined ? dr.r : '';
          return `
          <span class="muted">${s + 1}</span>
          ${def.time ? `<input type="hidden" name="w_${i}_${s}" value="0">` // Planche, gainage… : seulement la durée
            : `<input name="w_${i}_${s}" data-exid="${ex.id}" type="${a.type}" ${a.type === 'number' ? 'inputmode="decimal" step="0.5"' : ''} min="0" placeholder="${a.placeholder}" value="${esc(wVal)}" aria-label="Charge série ${s + 1}">`}
          <input name="r_${i}_${s}" data-exid="${ex.id}" type="number" inputmode="numeric" min="0" placeholder="${def.time ? 'secondes' : 'rép.'}" value="${esc(rVal)}" aria-label="${def.time ? 'Secondes' : 'Répétitions'} série ${s + 1}">`; }).join('')}
        </div></div>`;
    }).join('')}
    <button class="block" style="margin-top:12px">Terminer la séance</button>
  </form>
  <section class="card"><h2>Historique</h2>
    ${hist.length ? hist.map((w) => `<div class="row between"><span>${esc(w.day_label)}</span><span class="muted">${fmtDate(w.date)} · ${w.exercises.length} exercices</span></div>`).join('') : '<p class="muted">Aucune séance enregistrée.</p>'}
  </section>`;
}

// ----- Fiche d'un exercice (photos avant / après, consigne, variantes) -----
// Sélecteur d'unité de charge propre à UN exercice (haltères en lb, machine en kg, barre en plates…).
function loadUnitPickerHtml(id) {
  const u = loadUnitFor(id);
  const pr = prefs();
  return `
    <h3>Unité de charge pour cet exercice</h3>
    <div class="tabs">
      <button type="button" class="${u === 'kg' ? 'on' : ''}" data-act="setExUnit" data-arg="${id}" data-unit="kg">Kilogrammes</button>
      <button type="button" class="${u === 'lb' ? 'on' : ''}" data-act="setExUnit" data-arg="${id}" data-unit="lb">Livres</button>
      <button type="button" class="${u === 'plates' ? 'on' : ''}" data-act="setExUnit" data-arg="${id}" data-unit="plates">Plates</button>
    </div>
    ${u === 'plates' ? `
    <form data-form="plateSettings">
      <label>Poids d’une plate (lb)</label><input name="plate_lb" type="number" step="0.5" min="1" max="100" required value="${pr.plate_lb}">
      <label>Poids de la barre (lb)</label><input name="bar_lb" type="number" step="0.5" min="0" max="100" required value="${pr.bar_lb}">
      <button class="ghost block" style="margin-top:8px">Enregistrer</button>
    </form>
    <p class="muted">Total = barre + 2 × (plates que tu tapes). Ex. « 1 plate 25 » = 1×${pr.plate_lb} + 25 par côté. Ce réglage de plate/barre est le même pour tous tes exercices en mode plates.</p>`
      : '<p class="muted">Ne change que cet exercice ; les autres gardent leur propre unité.</p>'}`;
}
// ----- Progrès d'un exercice : record, courbe et dernières séances (fiche de l'exercice) -----
const shortLoad = (kg, id) => (loadUnitFor(id) === 'kg' ? `${round1(kg)} kg` : `${round1(kgToLb(kg))} lb`).replace('.', ',');
function exHistory(id) {
  return S.workouts.map((w) => ({ date: w.date, sets: (w.exercises.find((e) => e.id === id)?.sets || []).filter((x) => +x.r > 0) }))
    .filter((x) => x.sets.length);
}
function exProgressHtml(id) {
  const def = defById(id);
  const h = exHistory(id);
  if (!h.length) return '<h3>Tes progrès</h3><p class="muted">Pas encore de séance avec cet exercice : ton record apparaîtra ici.</p>';
  const loaded = !def.time && h.some((x) => x.sets.some((st) => +st.w > 0));
  // Série la plus forte : charge et répétitions ensemble (1RM estimé, formule d'Epley), ou le plus de répétitions / secondes.
  const score = (st) => (loaded ? (+st.w || 0) * (1 + st.r / 30) : +st.r);
  const setTxt = (st) => (def.time ? `${st.r} s` : +st.w > 0 ? `${shortLoad(+st.w, id)} × ${st.r}` : `${st.r} rép.`);
  const top = (sets) => sets.reduce((b, st) => (score(st) > score(b) ? st : b));
  // Une séance en une ligne courte : « 65 kg × 8, 7, 7 » (séries de même charge regroupées).
  const sessionTxt = (sets) => {
    if (def.time) return sets.map((st) => `${st.r} s`).join(', ');
    const groups = [];
    for (const st of sets) {
      const g = groups[groups.length - 1];
      if (g && g.w === (+st.w || 0)) g.r.push(st.r); else groups.push({ w: +st.w || 0, r: [st.r] });
    }
    return groups.map((g) => (g.w > 0 ? `${shortLoad(g.w, id)} × ${g.r.join(', ')}` : `${g.r.join(', ')} rép.`)).join(' · ');
  };
  let best = null;
  for (const x of h) { const t = top(x.sets); if (!best || score(t) > score(best.st)) best = { st: t, date: x.date }; }
  const pts = h.slice(-12).map((x) => score(top(x.sets)));
  let spark = '';
  if (pts.length >= 2) {
    const W = 300, H = 60, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const xy = pts.map((v, i) => `${Math.round((i / (pts.length - 1)) * (W - 8) + 4)},${Math.round(H - 6 - ((v - lo) / span) * (H - 12))}`);
    spark = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Évolution de ta meilleure série">
      <polyline points="${xy.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${xy.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="var(--accent)"/>`).join('')}</svg>
      <p class="muted">Ta meilleure série à chaque séance (${pts.length} dernières).</p>`;
  }
  return `
    <h3>Tes progrès</h3>
    <p><b>🏆 Record : ${setTxt(best.st)}</b> <span class="muted">(${fmtDate(best.date)})</span></p>
    ${spark}
    ${[...h].reverse().slice(0, 5).map((x) => `<p class="exhist"><span class="muted">${fmtDate(x.date)}</span> ${sessionTxt(x.sets)}</p>`).join('')}`;
}

function exInfoHtml(id) {
  const ex = defById(id);
  if (ex.custom) {
    return `
    <div class="row between"><h2>${esc(ex.name)}</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p><span class="pill">exercice personnalisé</span></p>
    ${ex.cue ? `<p>${esc(ex.cue)}</p>` : '<p class="muted">Pas de consigne enregistrée.</p>'}
    ${/^https?:\/\//i.test(ex.url) ? `<a class="btn ghost block" href="${esc(ex.url)}" target="_blank" rel="noopener noreferrer">Voir la vidéo</a>` : ''}
    <a class="btn ghost block" style="margin-top:8px" href="#/edit">Modifier mon programme</a>
    ${exProgressHtml(id)}
    ${loadUnitPickerHtml(id)}`;
  }
  const fig = (n, label) => `<figure><img src="${imgUrl(id, n)}" data-fb="${imgFallback(id, n)}" alt="${label} : ${esc(ex.name)}"><figcaption>${label}</figcaption></figure>`;
  return `
    <div class="row between"><h2>${esc(ex.name)}</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <div class="photos one">${ex.time ? fig(1, 'Position à tenir') : `${fig(0, 'Départ')}${fig(1, 'Arrivée')}`}</div>
    ${exMeta(ex) ? `<p class="muted">${esc(exMeta(ex))}</p>` : ''}
    <p>${esc(ex.cue)}</p>
    <button class="ghost block" data-act="exAlts" data-arg="${id}">Je ne peux pas / n’aime pas cet exercice : voir les variantes</button>
    ${exProgressHtml(id)}
    <p class="muted">${ex.like ? 'Photos d’un mouvement semblable (pas de photo exacte pour cette machine). ' : ''}Photos : Free Exercise DB (domaine public).</p>
    ${loadUnitPickerHtml(id)}`;
}
acts.exInfo = (el) => openSheet(exInfoHtml(el.dataset.arg));
acts.setExUnit = async (el) => {
  try {
    await setExUnit(el.dataset.arg, el.dataset.unit);
    draftClearWeights(el.dataset.arg); // le poids tapé n'a plus le même sens dans la nouvelle unité ; les reps restent
    render();
    openSheet(exInfoHtml(el.dataset.arg));
  } catch (e) { toast(e.message); }
};
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
              ${mini('sets', di, ei, e.sets)} <span class="muted">×</span> ${mini('lo', di, ei, e.lo)} <span class="muted">–</span> ${mini('hi', di, ei, e.hi)} <span class="muted">${def.time ? 's' : 'rép.'}</span>
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
acts.delDay = async (el) => {
  if (S.draft.length <= 1) return toast('Garde au moins un jour d’entraînement.');
  if (!(await askConfirm('Supprimer ce jour et ses exercices ?', 'Supprimer le jour'))) return;
  S.draft.splice(dOf(el), 1);
  render();
};
acts.addDay = () => { S.draft.push({ label: `Jour ${S.draft.length + 1}`, exercises: [] }); render(); window.scrollTo(0, document.body.scrollHeight); };
acts.exMove = (el) => { move(S.draft[dOf(el)].exercises, eOf(el), +el.dataset.dir); render(); };
acts.delEx = (el) => { S.draft[dOf(el)].exercises.splice(eOf(el), 1); render(); };
// Ligne d'infos d'un exercice : muscle · matériel · type (si ce n'est pas de la musculation) · niveau
const exMeta = (x) => [x.muscle, x.eq && x.eq !== 'aucun' ? x.eq : x.eq === 'aucun' ? 'poids du corps' : '', x.cat && x.cat !== 'musculation' ? x.cat : '', x.lvl === 3 ? 'avancé' : '']
  .filter(Boolean).join(' · ');
function exPickRows() {
  const { di, q, muscle } = S.exPick;
  const used = S.draft[di].exercises.map((e) => e.id);
  const list = searchExercises({ q, muscle, equipment: S.profile.equipment, exclude: used });
  if (!list.length) return '<p class="muted">Aucun exercice trouvé. Essaie un autre mot (ex. « curl », « fente », « poulie »), ou crée un exercice personnalisé.</p>';
  return list.map(([id, x]) => `
      <div class="alt">
        ${thumb(id)}
        <div style="flex:1"><b>${esc(x.name)}</b><div class="muted">${esc(exMeta(x))}</div></div>
        <button type="button" class="small" data-act="pickEx" data-d="${di}" data-id="${esc(id)}">Ajouter</button>
      </div>`).join('') + (list.length === 60 ? '<p class="muted center">Précise ta recherche ou choisis un muscle pour voir d’autres exercices.</p>' : '');
}
acts.addEx = (el) => {
  S.exPick = { di: dOf(el), q: '', muscle: '' };
  openSheet(`
    <div class="row between"><h2>Ajouter un exercice</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">Plus de 800 exercices, avec photos et consignes.</p>
    <input type="search" data-act="exSearch" placeholder="Rechercher (ex. curl, presse, fentes, poulie)…" aria-label="Rechercher un exercice" autocomplete="off">
    <select data-act="exMuscle" aria-label="Muscle" style="margin-top:8px"><option value="">Tous les muscles</option>${MUSCLES.map((m) => `<option value="${m}">${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select>
    <button type="button" class="ghost block" style="margin:10px 0" data-act="newEx" data-d="${S.exPick.di}">+ Créer un exercice personnalisé</button>
    <div id="ex-results">${exPickRows()}</div>`);
};
const refreshExPick = () => { const box = document.getElementById('ex-results'); if (box) box.innerHTML = exPickRows(); };
acts.exSearch = (el, e) => { if (e?.type === 'click') return; S.exPick.q = el.value; refreshExPick(); };
acts.exMuscle = (el) => { S.exPick.muscle = el.value; refreshExPick(); };
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
acts.resetProgram = async () => {
  if (!(await askConfirm('Remplacer ton programme par celui de départ ? Tes modifications (dans ce brouillon) seront perdues.', 'Remplacer'))) return;
  S.draft = buildProgram(S.profile.days_per_week, S.profile.equipment, prefs().training_style);
  render();
};

// ----- Onglet Repas -----
function foodPrefsForm(pr, first) {
  return `
  ${canAI() ? `
  <div class="card">
    <h2>Créer mon régime avec le coach IA</h2>
    <p class="muted">Décris ce que tu veux (ex. « méditerranéen, sans lactose, 5 petits repas, j’aime pas le poisson ») : le coach remplit le formulaire ci-dessous pour toi, à valider avant d’enregistrer.</p>
    <textarea id="ai-diet-text" rows="2" placeholder="Écris ton régime idéal…"></textarea>
    <button type="button" class="ghost block" style="margin-top:8px" data-act="aiFillDiet">Laisser le coach remplir mes préférences</button>
  </div>` : ''}
  <form data-form="food" class="card">
    <h2>${first ? 'Ton plan de repas' : 'Mes préférences alimentaires'}</h2>
    <p class="muted">Réponds à ces questions pour que je crée des repas qui te conviennent (ou laisse le coach les remplir ci-dessus). Tu pourras les changer à tout moment.</p>
    ${foodFields(pr)}
    <button class="block" style="margin-top:14px">${first ? 'Créer mon plan de repas' : 'Enregistrer et régénérer mes repas'}</button>
    ${first ? '' : '<button type="button" class="ghost block" style="margin-top:8px" data-act="cancelPrefs">Annuler</button>'}
  </form>`;
}
// Champs des préférences alimentaires (formulaire « Repas » et récapitulatif de l'onboarding).
function foodFields(pr) {
  return `
    <label>Allergies ou intolérances</label>
    <input type="search" data-allergy-search placeholder="Chercher une allergie (ex. kiwi, moutarde)…" autocomplete="off">
    <div class="checks allergies" style="margin-top:8px">
      ${Object.entries(ALLERGENS).map(([k, v]) => `<label class="check" data-name="${esc(norm(`${v} ${ALLERGEN_WORDS[k] || ''}`))}"><input type="checkbox" name="allergy" value="${k}" ${pr.allergies.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}
      ${Object.entries(EXTRA_ALLERGIES).map(([k, v]) => `<label class="check extra" data-name="${esc(norm(`${v.label} ${v.terms.join(' ')}`))}" ${pr.other_allergies.includes(k) ? '' : 'hidden'}><input type="checkbox" name="allergy_other" value="${k}" ${pr.other_allergies.includes(k) ? 'checked' : ''}> ${esc(v.label)}</label>`).join('')}
      ${pr.other_allergies.filter((a) => !EXTRA_ALLERGIES[a]).map((a) => `<label class="check extra" data-name="${esc(norm(a))}"><input type="checkbox" name="allergy_other" value="${esc(a)}" checked> ${esc(a)}</label>`).join('')}
    </div>
    <button type="button" class="ghost small" data-act="addAllergy" hidden style="margin-top:8px"></button>
    <p class="muted">Une allergie hors liste écarte de tes repas les aliments dont le nom la contient. Vérifie toujours l’étiquette des produits.</p>
    <label>Régime</label>
    <select name="diet">${Object.entries(DIETS).map(([k, v]) => `<option value="${k}" ${pr.diet === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label>Aliments que tu n’aimes pas ou veux éviter (séparés par des virgules)</label>
    <textarea name="dislikes" rows="2" placeholder="ex. saumon, brocoli, thon">${esc(pr.dislikes)}</textarea>
    <label>Repas par jour</label>
    <select name="meals">${[3, 4, 5, 6].map((n) => `<option value="${n}" ${pr.meals === n ? 'selected' : ''}>${n} repas${{3:'',4:' (dont 1 collation)',5:' (dont 2 collations)',6:' (dont 3 collations — recommandé sur une grosse cible)'}[n]}</option>`).join('')}</select>
    <p class="muted">Sur une grosse cible (prise de masse), plus de repas donne des portions plus normales.</p>
    <label>Budget épicerie</label>
    <select name="budget">${Object.entries(BUDGETS).map(([k, v]) => `<option value="${k}" ${pr.budget === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <p class="muted">Avec un budget serré, les repas évitent les aliments les plus chers (saumon, crevettes, bifteck, noix, petits fruits…) et le coach IA te propose des options économiques.</p>`;
}
const readFoodFields = (fd) => ({
  allergies: fd.getAll('allergy'), other_allergies: [...new Set(fd.getAll('allergy_other').map((a) => String(a).trim().slice(0, 40)).filter(Boolean))].slice(0, 15), diet: fd.get('diet'), dislikes: String(fd.get('dislikes') || '').trim(), meals: +fd.get('meals'), budget: fd.get('budget') || 'normal',
});

function vFood() {
  const pl = S.plan, pr = prefs();
  const log = todayLog();
  if (!pr.done) return foodPrefsForm(pr, true);
  if (S.editPrefs) return foodPrefsForm(pr, false);
  const dayType = log.day_type === 'rest' ? 'rest' : 'train'; // par défaut : jour d'entraînement
  const dayT = dayVariant(pl, dayType);
  const menus = menusOf(pl.meal_plan), vi = viewMenuIdx(), ti = todayMenuIdx();
  const cd = computeDay(dayT, menus[vi], pr);
  const eaten = vi === ti ? (log.eaten || []) : null; // on coche seulement le menu d'aujourd'hui
  const ex = extraTargets(dayT.calories, lastWeight());
  const week = S.daily.filter((d) => d.date >= addDays(today(), -6));
  const wAvg = avg(week.filter((d) => d.calories).map((d) => d.calories));
  return `
  <section class="card">
    <h2>Aujourd’hui</h2>
    <div class="tabs">
      <button type="button" class="${dayType === 'train' ? 'on' : ''}" data-act="setDayType" data-arg="train">🏋️ Entraînement</button>
      <button type="button" class="${dayType === 'rest' ? 'on' : ''}" data-act="setDayType" data-arg="rest">🛋️ Repos</button>
    </div>
    <p class="muted">Plus de glucides les jours d’entraînement, moins les jours de repos.</p>
  </section>
  <section class="card">
    <h2>Tes cibles du jour</h2>
    <div class="grid4 macros">
      <div class="stat k"><b>${dayT.calories}</b><span>kcal</span></div><div class="stat p"><b>${dayT.protein}</b><span>protéines g</span></div>
      <div class="stat g"><b>${dayT.carbs}</b><span>glucides g</span></div><div class="stat l"><b>${dayT.fat}</b><span>lipides g</span></div>
    </div>
    <div class="grid3" style="margin-top:10px">
      <div class="stat"><b>≥ ${ex.fibre} g</b><span>fibres</span></div><div class="stat"><b>${pr.water ? '' : '≈ '}${String(pr.water ?? ex.eau).replace('.', ',')} L</b><span>eau</span></div>
      <div class="stat"><b>≤ ${ex.satfat} g</b><span>gras saturés</span></div>
    </div>
    <p class="muted">Moyenne de la semaine : ${pl.calories} kcal, ajustée à chaque check-in.</p>
    <button class="ghost block" data-act="editTargets">Modifier mes cibles</button>
  </section>
  ${pl.meal_plan && !pl.meal_plan.meals.some((m) => m.tpl) ? `<section class="card">
    <h2>✨ Nouveaux repas disponibles</h2>
    <p class="muted">Tes repas peuvent maintenant suivre de vrais modèles (bols, gruau protéiné, wraps, chili…) avec plus d’aliments. Tes préférences et tes cibles ne changent pas.</p>
    <button type="button" class="ghost block" data-act="remakeMeals">Refaire mes repas</button>
  </section>` : ''}
  ${cd.crowded && pr.meals < 6 ? `<section class="card warn">
    <h2>💡 Ta cible est grosse pour ${pr.meals} repas</h2>
    <p>Pour atteindre ${dayT.calories} kcal, il a fallu ajouter un aliment en plus à un repas et les portions sont à l’étroit. Avec 6 repas (dont 3 collations), elles seraient plus normales.</p>
    <button type="button" class="block" data-act="moreMeals">Passer à 6 repas</button>
  </section>` : ''}
  ${menus.length > 1 ? `<div class="tabs menus">${menus.map((_, i) => `<button type="button" class="${i === vi ? 'on' : ''}" data-act="pickMenu" data-arg="${i}">Menu ${i + 1}${i === ti ? ' · aujourd’hui' : ''}</button>`).join('')}</div>
  <p class="muted">Tes ${menus.length} menus alternent d’un jour à l’autre${vi === ti ? '.' : ` : celui-ci revient un autre jour.`}</p>` : pl.meal_plan ? `<section class="card">
    <h2>🔁 Plus de variété</h2>
    <p class="muted">Ajoute 2 autres menus qui alternent avec celui-ci d’un jour à l’autre. Ton menu actuel ne change pas.</p>
    <button type="button" class="ghost block" data-act="addVariety">Ajouter 2 menus</button>
  </section>` : ''}
  <p class="muted">Quantités en aliments cuits, sauf indication. Les marques sont des exemples courants et les valeurs sont des moyennes : vérifie l’étiquette de ta marque.</p>
  ${cd.meals.map((m, si) => `
    <section class="card">
      <div class="meal-head">
        <div><h2>${SLOT_NAMES[m.slot]}</h2>${mealName(m, m.items) ? `<p class="meal-name">${esc(mealName(m, m.items))}</p>` : ''}
          <p class="meal-sum">${m1(m.totals.k)} kcal · <span class="mp">${m1(m.totals.p)} g prot.</span></p></div>
        ${eaten ? `<button type="button" class="small eat ${eaten.includes(m.slot) ? '' : 'ghost'}" data-act="toggleEaten" data-arg="${m.slot}" aria-pressed="${eaten.includes(m.slot)}">${eaten.includes(m.slot) ? '✓ Mangé' : 'Mangé ?'}</button>` : ''}
      </div>
      ${mealRecipe(m) ? `<details class="recipe"><summary>Comment le préparer</summary><p class="muted">${esc(mealRecipe(m))}</p></details>` : ''}
      ${m.items.map((it, ii) => it.g <= 0 ? '' : `
        <div class="food">
          <div style="flex:1">
            <b>${qtyText(it)}</b> ${esc(it.food.name)}${it.extra ? '<br><span class="muted small">+ ajouté pour atteindre ta cible</span>' : ''}
            <div class="macro-line"><span class="mp">P ${m1(it.macros.p)}</span><span class="mg">G ${m1(it.macros.c)}</span><span class="ml">L ${m1(it.macros.f)}</span><span>${m1(it.macros.k)} kcal</span></div>
            <div class="brands">${esc(brandLine(it.food.brands))}</div>
          </div>
          ${it.extra ? '' : `<button type="button" class="ghost small" data-act="swapFood" data-slot="${si}" data-item="${ii}" aria-label="Remplacer ${esc(it.food.name)}">↔</button>`}
        </div>`).join('')}
      <button type="button" class="ghost block" style="margin-top:8px" data-act="reroll" data-slot="${si}">Autre repas</button>
    </section>`).join('')}
  <section class="card">
    <h2>Total du plan</h2>
    <div class="row between"><span>Calories</span><span>${m1(cd.totals.k)} / ${dayT.calories}</span></div>${bar(cd.totals.k, dayT.calories)}
    <div class="row between"><span>Protéines</span><span>${m1(cd.totals.p)} / ${dayT.protein} g</span></div>${bar(cd.totals.p, dayT.protein, 'p')}
    <div class="row between"><span>Glucides</span><span>${m1(cd.totals.c)} / ${dayT.carbs} g</span></div>${bar(cd.totals.c, dayT.carbs, 'g')}
    <div class="row between"><span>Lipides</span><span>${m1(cd.totals.f)} / ${dayT.fat} g</span></div>${bar(cd.totals.f, dayT.fat, 'l')}
    <p class="muted">Les quantités visent tes cibles à quelques grammes près et se recalculent quand tu changes un aliment ou tes cibles.</p>
    <div class="grid2">
      <button class="ghost" data-act="grocery">Liste d’épicerie</button>
      <button class="ghost" data-act="showPrefs">Mes préférences</button>
    </div>
  </section>
  <form data-form="daily" class="card">
    <h2>Journal du jour</h2>
    <label>Poids du matin (${wUnit()}) — optionnel</label><input name="weight" type="number" step="0.1" inputmode="decimal" value="${log.weight != null ? fmtWeight(log.weight, wUnit()) : ''}">
    ${log.eaten?.length ? `<p class="muted">Rempli avec tes repas cochés « Mangé » (${log.eaten.length}). Corrige au besoin.</p>` : ''}
    <label>Calories mangées</label><input name="calories" type="number" inputmode="numeric" value="${log.calories ?? ''}">
    <label>Protéines (g)</label><input name="protein" type="number" inputmode="numeric" value="${log.protein ?? ''}">
    <button class="block" style="margin-top:12px">Enregistrer</button>
    ${wAvg ? `<p class="muted">Moyenne des 7 derniers jours : ${Math.round(wAvg)} kcal (cible ${dayT.calories}).</p>` : ''}
  </form>`;
}
acts.pickMenu = (el) => { S.menuIdx = +el.dataset.arg; render(); };
acts.addVariety = async () => {
  try {
    await savePlan({ meal_plan: addMenus(S.plan.meal_plan, prefs(), S.plan) });
    toast('2 menus ajoutés : ils alternent d’un jour à l’autre');
    await refresh();
  } catch (e) { toast(e.message); }
};
acts.toggleEaten = async (el) => {
  const log = todayLog(), slot = el.dataset.arg;
  const eaten = (log.eaten || []).includes(slot) ? log.eaten.filter((x) => x !== slot) : [...(log.eaten || []), slot];
  try {
    await db.saveDaily({ user_id: S.me.id, date: today(), eaten, ...eatenTotals(eaten, log.day_type) });
    await refresh();
  } catch (e) { toast(/eaten/.test(e.message) ? 'Mise à jour de la base nécessaire (migration_007.sql, voir README).' : e.message); }
};
acts.setDayType = async (el) => {
  const eaten = todayLog().eaten || [];
  try {
    // Le type de jour change les quantités : on recalcule aussi ce qui est déjà coché « Mangé ».
    await db.saveDaily({ user_id: S.me.id, date: today(), day_type: el.dataset.arg, ...(eaten.length ? eatenTotals(eaten, el.dataset.arg) : {}) });
    await refresh();
  } catch (e) { toast(e.message); }
};

acts.showPrefs = () => { S.editPrefs = true; render(); window.scrollTo(0, 0); };
acts.cancelPrefs = () => { S.editPrefs = false; render(); };
acts.swapFood = (el) => {
  const si = +el.dataset.slot, ii = +el.dataset.item;
  const pl = S.plan, pr = prefs();
  const menu = viewMenu();
  const it = menu.meals[si].items[ii];
  const cur = computeDay(curDayTargets(), menu, pr).meals[si].items[ii];
  const eq = equivalents(menu, si, ii, pr);
  openSheet(`
    <div class="row between"><h2>Remplacer</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">${ROLE_NAMES[it.role]} du ${SLOT_NAMES[menu.meals[si].slot].toLowerCase()} : <b>${esc(cur.food.name)}</b>. La quantité et le reste du repas se recalculent automatiquement.</p>
    ${eq.length ? eq.map((f) => `
      <div class="alt">
        <div style="flex:1"><b>${esc(f.name)}</b><div class="muted">${esc(brandLine(f.brands))}</div></div>
        <button class="small" data-act="pickFood" data-slot="${si}" data-item="${ii}" data-food="${f.id}">Choisir</button>
      </div>`).join('') : '<p class="muted">Aucun aliment de la liste intégrée ne convient à tes restrictions pour ce repas.</p>'}
    <h3>Ou cherche un aliment précis (marque, produit)</h3>
    <input type="search" data-act="searchInput" data-slot="${si}" data-item="${ii}" placeholder="ex. yogourt Oikos vanille, pain Country Harvest…" aria-label="Rechercher un aliment">
    <div id="food-search-results" class="muted" style="margin-top:8px">Tape au moins 2 lettres.</div>
    <p class="muted" style="margin-top:8px">Recherche fournie par Open Food Facts, une base ouverte : vérifie que le résultat correspond à tes restrictions et à l’étiquette réelle.</p>`);
};
acts.pickFood = async (el) => {
  try {
    await saveViewMenu(swapItem(viewMenu(), +el.dataset.slot, +el.dataset.item, el.dataset.food));
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
      const results = await db.searchFoods(q);
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
    await saveViewMenu(swapItemCustom(viewMenu(), +d.slot, +d.item, food));
    closeSheet();
    toast(`${food.name} ajouté à ton plan`);
    await refresh();
  } catch (e) { toast(e.message); }
};
acts.remakeMeals = async () => {
  if (!(await askConfirm('Refaire tous tes repas avec les nouveaux modèles ? Tes changements d’aliments actuels seront remplacés.', 'Refaire mes repas'))) return;
  try {
    await savePlan({ meal_plan: buildChoices(prefs(), Date.now(), S.plan) });
    toast('Nouveaux repas prêts');
    await refresh();
  } catch (e) { toast(e.message); }
};
acts.moreMeals = async () => {
  const pr = { ...prefs(), meals: 6, done: true };
  try {
    await db.saveProfile({ ...S.profile, food_prefs: pr });
    S.profile = { ...S.profile, food_prefs: pr };
    await savePlan({ meal_plan: buildChoices(pr, Date.now(), S.plan) });
    toast('Plan de repas refait sur 6 repas');
    await refresh();
  } catch (e) { toast(e.message); }
};
acts.reroll = async (el) => {
  try {
    await saveViewMenu(rerollMeal(viewMenu(), +el.dataset.slot, prefs(), curDayTargets()));
    await refresh();
  } catch (e) { toast(e.message); }
};
acts.grocery = () => {
  // Les 7 prochains jours : chaque menu compte pour le nombre de jours où il revient.
  const menus = menusOf(S.plan.meal_plan);
  const days = menus.map((m, i) => [computeDay(curDayTargets(), m, prefs()), [0, 1, 2, 3, 4, 5, 6].filter((d) => menuIndexFor(addDays(today(), d), menus.length) === i).length]);
  const list = groceryList(days.filter(([, n]) => n > 0));
  const aisles = [...new Set(list.map((g) => g.aisle))];
  openSheet(`
    <div class="row between"><h2>Épicerie (7 jours)</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">Quantités pour les 7 prochains jours${menus.length > 1 ? ` (tes ${menus.length} menus)` : ''}, jours d’entraînement, classées par rayon. Riz et pâtes en poids sec ; viandes en poids cuit (compte environ 25 % de plus à l’achat, cru).</p>
    ${aisles.map((a) => `<h3>${esc(a)}</h3>${list.filter((g) => g.aisle === a).map((g) => `<div class="food"><div style="flex:1"><b>${esc(g.text)}</b> ${esc(g.name)}<div class="muted">${esc(brandLine(g.brands))}</div></div></div>`).join('')}`).join('')}`);
};
acts.editTargets = () => {
  const p = S.plan;
  const bmrFloor = bmr(S.profile, lastWeight());
  openSheet(`
    <div class="row between"><h2>Modifier mes cibles</h2><button class="ghost small" data-act="closeSheet">Fermer</button></div>
    <p class="muted">Change directement tes calories (les glucides s’ajustent, protéines et lipides ne bougent pas), ou fixe tes protéines, glucides et lipides (les calories se recalculent). Le coach repartira de ces valeurs au prochain check-in (il n'ajustera que les calories et les glucides selon ton poids).</p>
    <form data-form="targets">
      <label>Calories par jour (moyenne de la semaine)</label><input name="kcal" type="number" min="800" max="6000" step="10" required value="${p.calories}" data-act="targetsKcal">
      <label>Protéines (g)</label><input name="protein" type="number" min="40" max="400" required value="${p.protein}" data-act="targetsLive">
      <label>Glucides (g)</label><input name="carbs" type="number" min="0" max="700" required value="${p.carbs}" data-act="targetsLive">
      <label>Lipides (g)</label><input name="fat" type="number" min="20" max="250" required value="${p.fat}" data-base="${p.fat}" data-act="targetsLive">
      <p id="targets-warn" class="muted" style="display:none;color:var(--warn)">⚠️ Sous ton métabolisme de base (${bmrFloor} kcal) : trop bas pour manger sur le long terme.</p>
      <label style="margin-top:10px">Eau (litres par jour)</label><input name="eau" type="number" step="0.1" min="1" max="8" required value="${prefs().water ?? extraTargets(p.calories, lastWeight()).eau}">
      <button class="block" style="margin-top:12px">Enregistrer</button>
    </form>`);
};
// Protéines, glucides ou lipides changés : les calories se recalculent.
acts.targetsLive = (el) => {
  const f = el.form;
  if (el.name === 'fat') f.fat.dataset.base = f.fat.value; // lipides choisis à la main : ceux qu'on retrouvera
  const kcal = Math.max(0, (+f.protein.value || 0) * 4 + (+f.carbs.value || 0) * 4 + (+f.fat.value || 0) * 9);
  f.kcal.value = Math.round(kcal);
  document.getElementById('targets-warn').style.display = kcal < bmr(S.profile, lastWeight()) ? 'block' : 'none';
};
// Calories changées : seuls les glucides bougent (protéines et lipides gardés) ; s'il n'en reste plus assez,
// on baisse aussi les lipides, jamais sous 20 g.
acts.targetsKcal = (el) => {
  const f = el.form;
  const { carbs, fat } = carbsForCalories(+f.kcal.value || 0, +f.protein.value || 0, +f.fat.dataset.base || +f.fat.value || 0);
  f.carbs.value = carbs;
  f.fat.value = fat;
  document.getElementById('targets-warn').style.display = (+f.kcal.value || 0) < bmr(S.profile, lastWeight()) ? 'block' : 'none';
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
      <div class="grid4 macros"><div class="stat k"><b>${pl.calories}</b><span>kcal</span></div><div class="stat p"><b>${pl.protein}</b><span>prot. g</span></div>
      <div class="stat g"><b>${pl.carbs}</b><span>gluc. g</span></div><div class="stat l"><b>${pl.fat}</b><span>lip. g</span></div></div>
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
    <div class="photopick">
      ${[['front', 'De face'], ['side', 'De profil'], ['back', 'De dos']].map(([k, t]) => `
      <label class="photoslot"><input type="file" name="photo_${k}" accept="image/*" data-photo>
        <span class="photoprev">📷</span><span>${t}</span></label>`).join('')}
    </div>
    <button class="block" style="margin-top:14px">Envoyer mon check-in</button>
  </form>`;
}

function vProgress() {
  const friend = S.others.find((o) => o.profile.id === S.who);
  const mine = !friend;
  const d = mine ? { profile: S.profile, checkins: S.checkins, workouts: S.workouts } : friend;
  const st = statsOf(d);
  const pts = d.checkins.map((c) => ({ d: c.week_start, y: c.weight }));
  const withPhotos = d.checkins.filter((c) => c.photos && c.photos[S.slot]);
  const canSee = mine || d.profile.share_photos !== false;
  const a = withPhotos[0], b = withPhotos[withPhotos.length - 1];
  const SLOTS = { front: 'Face', side: 'Profil', back: 'Dos' };
  return `
  <div class="tabs">
    <button class="${mine ? 'on' : ''}" data-act="who" data-arg="me">Moi</button>
    ${S.others.map((o) => `<button class="${friend === o ? 'on' : ''}" data-act="who" data-arg="${esc(o.profile.id)}">${esc(o.profile.name)}</button>`).join('')}
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

// ----- Brouillon de séance : ce que tu tapes est gardé même sans avoir appuyé sur « Terminer »,
// même si tu changes d'onglet ou fermes l'app. Un seul brouillon par exercice (peu importe le jour affiché).
const draftKey = () => `coach_wdraft_${S.me.id}`;
function draftLoad() { try { return JSON.parse(localStorage.getItem(draftKey()) || '{}'); } catch { return {}; } }
function draftSet(exId, setIdx, field, value) {
  const d = draftLoad();
  d[exId] = d[exId] || [];
  d[exId][setIdx] = { ...d[exId][setIdx], [field]: value };
  try { localStorage.setItem(draftKey(), JSON.stringify(d)); } catch { /* stockage indisponible */ }
}
function draftClear(exId) {
  const d = draftLoad();
  delete d[exId];
  try { localStorage.setItem(draftKey(), JSON.stringify(d)); } catch { /* stockage indisponible */ }
}
// Change d'unité : seul le poids tapé n'a plus le même sens, les répétitions restent valides.
function draftClearWeights(exId) {
  const d = draftLoad();
  if (d[exId]) d[exId] = d[exId].map((s) => (s ? { r: s.r } : s));
  try { localStorage.setItem(draftKey(), JSON.stringify(d)); } catch { /* stockage indisponible */ }
}

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
const FAQ_DEFAULT = 'Je peux répondre aux questions sur l’application (exercices, repas, cibles, check-in). Pour le reste, je n’ai pas encore la réponse : note ton idée et on l’ajoutera à l’application.';

// Chiffres déjà calculés pour que le coach parle de LA personne (« tu perds 0,6 kg par semaine ») sans refaire les calculs.
const PACE = { lose: 'perte de 0,5 à 1 % du poids par semaine', gain: 'prise de 0,25 à 0,5 % du poids par semaine', maintain: 'poids stable (±0,5 kg)' };
function progressSummary() {
  const cs = S.checkins.filter((c) => c.weight), last = cs.slice(-5);
  const out = { nombre_de_check_ins: S.checkins.length, premier_check_in: S.checkins[0]?.week_start ?? 'aucun encore', rythme_vise: PACE[S.profile.goal] };
  if (last.length >= 2) {
    const weeks = Math.max(1, daysBetween(last[0].week_start, last[last.length - 1].week_start) / 7);
    const perWeek = (last[last.length - 1].weight - last[0].weight) / weeks;
    Object.assign(out, {
      tendance_poids_kg_par_semaine: Math.round(perWeek * 100) / 100,
      tendance_poids_pourcent_par_semaine: Math.round((perWeek / last[0].weight) * 1000) / 10,
      tendance_calculee_sur: `${last.length} check-ins (${fmtDate(last[0].week_start)} au ${fmtDate(last[last.length - 1].week_start)})`,
      variation_totale_kg: round1(cs[cs.length - 1].weight - (S.profile.start_weight ?? cs[0].weight)),
    });
  }
  const recent = S.checkins.slice(-4);
  if (recent.length) {
    out.seances_faites_moyenne_pourcent = Math.round(avg(recent.map((c) => c.adherence_training)));
    out.nutrition_respectee_moyenne_pourcent = Math.round(avg(recent.map((c) => c.adherence_nutrition)));
  }
  return out;
}

function aiContext() {
  const p = S.profile, pl = S.plan, pr = prefs();
  // Chaque repas avec ses calories et protéines : le coach peut dire « ton dîner fait ~650 kcal et 45 g de protéines ».
  const mealsFor = (dt) => pl.meal_plan ? computeDay(dayVariant(pl, dt), pl.meal_plan, pr).meals.map((m) => {
    const k = Math.round(m.items.reduce((s, i) => s + (i.macros?.k || 0), 0)), pro = Math.round(m.items.reduce((s, i) => s + (i.macros?.p || 0), 0));
    return `${SLOT_NAMES[m.slot]}${mealName(m, m.items) ? ` (${mealName(m, m.items)})` : ''} : ${m.items.filter((i) => i.g > 0).map((i) => `${qtyText(i)} ${i.food.name}`).join(', ')} — environ ${k} kcal, ${pro} g de protéines`;
  }) : [];
  const train = mealsFor('train'), rest = mealsFor('rest');
  return {
    profil: {
      prenom: p.name, objectif: GOALS[p.goal], sexe: p.sex, age: new Date().getFullYear() - p.birth_year, taille_cm: p.height_cm,
      poids_kg: lastWeight(), unite_poids_affichee: wUnit(), jours_entrainement: p.days_per_week, materiel: p.equipment, limitations: p.limitations || '',
      but_entrainement_en_ses_mots: pr.training_goal_text || 'non précisé', type_entrainement: TRAINING_STYLES[pr.training_style],
      objectif_chiffre: goalStatus(profileWithGoal(), lastWeight()) ?? 'aucun poids/date visés fixés',
    },
    nutrition: {
      cibles_moyennes_semaine: { kcal: pl.calories, proteines_g: pl.protein, glucides_g: pl.carbs, lipides_g: pl.fat, eau_litres: pr.water ?? extraTargets(pl.calories, lastWeight()).eau },
      cycle_glucidique: { jour_entrainement: dayVariant(pl, 'train'), jour_repos: dayVariant(pl, 'rest'), note: 'Protéines et lipides identiques les deux types de jour ; seuls glucides et calories varient. La personne choisit le type de jour dans l’onglet Repas.' },
      allergies: pr.allergies, autres_allergies: pr.other_allergies.map(otherAllergyLabel), regime: pr.diet, non_aime: pr.dislikes, repas_par_jour: pr.meals, budget_epicerie: BUDGETS[pr.budget],
      nombre_de_menus: `${menusOf(pl.meal_plan).length || 0} menu(s) qui alternent d'un jour à l'autre ; voici le menu 1 (celui que tes actions sur les repas modifient)`,
      plan_de_repas_jour_entrainement: train,
      // Jour de repos : seulement les repas qui changent (moins de glucides), pour envoyer moins de texte.
      plan_de_repas_jour_repos: rest.every((m, i) => m === train[i]) ? 'identique au jour d’entraînement' : rest.filter((m, i) => m !== train[i]),
    },
    suivi: progressSummary(),
    programme: pl.program.map((d) => ({ jour: d.label, exercices: d.exercises.map((e) => defOf(e).name) })),
    guide_application_supplementaire: 'Onglet Séance > « Modifier mon programme » : on peut ajouter, renommer, déplacer ou supprimer un jour, ajouter/retirer/déplacer des exercices, changer les séries et répétitions, et créer un exercice personnalisé (nom, type charge/poids du corps/durée, consigne, lien vidéo). Onglet Repas > le bouton ↔ propose aussi une recherche libre d’aliment (marques précises). Réglages : unité de poids kg/lb.',
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
      : 'Je réponds à tes questions sur l’application : exercices, repas, cibles et check-in.'}</p>
    <div class="chat">
      ${hist.length ? hist.map((m, i) => `<div class="bubble ${m.r}">${esc(m.t).replace(/\n/g, '<br>')}</div>${m.actions ? actionCardHtml(m, i, i === lastApplied(hist)) : ''}`).join('') : '<p class="muted">Pose ta première question ou choisis une suggestion.</p>'}
      ${S.chatBusy ? `<div class="bubble ai" id="chat-stream">${S.chatPartial ? streamHtml(S.chatPartial) : '…'}</div>` : ''}
    </div>
    <div class="chips">
      ${canAI() ? '<button type="button" class="ghost small" data-act="buildDiet">🍽️ Construire mon régime avec le coach</button>' : ''}
      ${canAI() && hasPhotos ? '<button type="button" class="ghost small" data-act="askPhotos">📸 Analyser mes photos de progrès</button>' : ''}
      ${CHIPS.map((c) => `<button type="button" class="ghost small" data-act="ask" data-q="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <form data-form="chat" class="chatform">
      <textarea name="q" rows="2" placeholder="Écris ton message…" required></textarea>
      <button class="send" ${S.chatBusy ? 'disabled' : ''} aria-label="Envoyer"><svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
    </form>
    ${hist.length ? '<button type="button" class="ghost small" data-act="clearChat">Effacer la conversation</button>' : ''}
    ${canAI() ? '<p class="muted" style="margin-top:10px">Tes photos de progrès, quand tu les analyses, sont envoyées à Google (Gemini) pour cette réponse seulement.</p>' : ''}
  </section>`;
}
// ----- Changements proposés par le coach (voir actions.js) -----
const planFields = (pl) => ({ calories: pl.calories, protein: pl.protein, carbs: pl.carbs, fat: pl.fat, program: pl.program, deload: pl.deload, hold: pl.hold, meal_plan: pl.meal_plan ?? null });
const actionState = () => ({ profile: S.profile, plan: planFields(S.plan), prefs: prefs(), weight: lastWeight(), bmr: bmr(S.profile, lastWeight()) });
// Contexte du chat : celui de l'avis IA + ce qu'il faut pour proposer des changements précis (identifiants).
// Sujet des derniers messages : on n'envoie la bibliothèque d'exercices ou la liste d'aliments que si on en parle
// (réponses plus rapides). Sujet incertain : on envoie les deux.
const TRAINING_WORDS = /exerci|machine|seance|entrain|muscl|program|squat|developp|curl|jambe|dos|bras|pec|epaule|fess|abdo|douleur|genou|remplac|serie|repetition|cardio|etire|gym|salle|halter|poulie|barre|traction|force|mollet|biceps|triceps/;
const FOOD_WORDS = /repas|mang|aliment|nourri|proteine|calori|bulk|masse|seche|cut|dejeuner|diner|souper|collation|faim|recette|allerg|vege|budget|epicerie|glucide|lipide|gras|poulet|riz|oeuf|viande|poisson|fruit|legume|snack|dessert|sucre/;
function chatTopics(hist) {
  const txt = norm(hist.filter((m) => m.r === 'user').slice(-3).map((m) => m.t).join(' '));
  const training = TRAINING_WORDS.test(txt), food = FOOD_WORDS.test(txt);
  return training || food ? { training, food } : { training: true, food: true };
}
function chatContext(hist = []) {
  const topics = chatTopics(hist);
  const pl = S.plan, eq = S.profile.equipment;
  return {
    ...aiContext(),
    programme: undefined, // déjà dans programme_detaille (avec séries et répétitions)
    premier_message_de_la_conversation: hist.filter((m) => m.r === 'user').length <= 1,
    guide_du_coach: COACH_GUIDE,
    aliments_de_l_app: !topics.food ? '(non envoyé : la question ne porte pas sur l’alimentation)' : Object.fromEntries(Object.entries(ROLE_NAMES).map(([r, label]) => [label, FOODS.filter((f) => f.role === r).map((f) => `${f.name} (${f.per100.k} kcal, ${f.per100.p} g prot. / 100 g)`).join(' ; ')])),
    modeles_de_repas_de_l_app: TEMPLATES.map((t) => `${{ dej: 'déjeuner', din: 'dîner ou souper', col: 'collation' }[t.slots[0]]} : ${t.label}`),
    actions_possibles: ACTIONS_DOC,
    metabolisme_de_base_kcal: bmr(S.profile, lastWeight()),
    programme_detaille: pl.program.map((d) => ({ jour: d.label, exercices: d.exercises.map((e) => ({ id: e.id, nom: defOf(e).name, series: e.sets, reps: `${e.lo}-${e.hi}${defOf(e).time ? ' s' : ''}` })) })),
    // Exercices de base (identifiant : nom), puis toute la bibliothèque par muscle (nom exact = identifiant accepté)
    exercices_disponibles: Object.entries(EXERCISES).filter(([, e]) => e.base && (eq !== 'home' || e.home)).map(([id, e]) => `${id} : ${e.name}`),
    bibliotheque_par_muscle: topics.training ? libraryByMuscle(eq) : '(non envoyée : la question ne porte pas sur l’entraînement)',
    repas_numerotes: pl.meal_plan ? computeDay(dayVariant(pl, 'train'), pl.meal_plan, prefs()).meals.map((m, i) => `${i + 1}. ${SLOT_NAMES[m.slot]}${mealName(m, m.items) ? ` : ${mealName(m, m.items)}` : ''}`) : [],
  };
}
// Toute la bibliothèque, groupée par muscle, noms seulement (compact) : le coach peut proposer n'importe lequel
// par son nom exact. On laisse de côté la force athlétique et l'haltérophilie (matériel ou technique particuliers).
function libraryByMuscle(eq) {
  const out = {};
  for (const e of Object.values(EXERCISES)) {
    if (e.base || !e.muscle || (eq === 'home' && !e.home) || e.cat === 'force athlétique' || e.cat === 'haltérophilie') continue;
    (out[e.muscle] ||= []).push(e.cat && e.cat !== 'musculation' ? `${e.name} (${e.cat})` : e.name);
  }
  return Object.fromEntries(Object.entries(out).map(([m, l]) => [m, l.join(' ; ')]));
}
// Ce que le coach relit de ses messages précédents : le texte + ce qui est advenu de ses propositions.
const STATUS_TXT = { pending: 'en attente de réponse', applied: 'appliqué par la personne', declined: 'refusé par la personne', undone: 'appliqué puis annulé par la personne' };
const chatText = (m) => (m.actions ? `${m.t}\n[Changements proposés : ${(m.labels || []).join(' ; ')} — ${STATUS_TXT[m.status] || ''}]` : m.t);
const lastApplied = (hist) => hist.reduce((k, m, i) => (m.status === 'applied' && m.undo ? i : k), -1);
function actionCardHtml(m, i, canUndo) {
  if (m.status === 'applied' || m.status === 'undone') {
    return `<div class="actions-card done"><b>${m.status === 'applied' ? '✅ Changements appliqués' : '↩️ Changements annulés'}</b>
      <ul>${(m.done || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${m.status !== 'applied' ? '' : canUndo ? `<button type="button" class="ghost small" data-act="undoActions" data-i="${i}">Annuler ces changements</button>`
        : '<span class="muted">Pour revenir en arrière, demande-le au coach.</span>'}</div>`;
  }
  if (m.status === 'declined') return `<div class="actions-card done"><b>Changements refusés</b><ul>${(m.labels || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  const { items, valid } = planActions(m.actions, actionState()); // revérifié sur l'état actuel à chaque affichage
  return `<div class="actions-card">
    <b>Changements proposés</b>
    <ul>${items.map((it) => `<li class="${it.ok ? '' : 'bad'}">${it.ok ? '' : '⚠️ Impossible : '}${esc(it.label)}</li>`).join('')}</ul>
    <div class="row">
      ${valid ? `<button type="button" class="small" data-act="applyActions" data-i="${i}">Appliquer</button>` : ''}
      <button type="button" class="ghost small" data-act="declineActions" data-i="${i}">${valid ? 'Non merci' : 'Fermer'}</button>
    </div></div>`;
}
acts.applyActions = async (el) => {
  const hist = chatLoad(), m = hist[+el.dataset.i];
  if (!m?.actions || m.status !== 'pending') return;
  el.disabled = true; el.textContent = 'Application…';
  const { items, valid, result: st } = planActions(m.actions, actionState());
  if (!valid) return render();
  const done = items.filter((it) => it.ok).map((it) => it.label);
  try {
    const undo = { profile: structuredClone(S.profile), plan: planFields(S.plan) };
    if (st.profileChanged) {
      const p = { ...st.profile, food_prefs: st.prefs };
      await db.saveProfile(p);
      S.profile = p;
    }
    let meal_plan = st.plan.meal_plan;
    if (st.regenMeals || !meal_plan) meal_plan = st.prefs.done ? buildChoices(st.prefs, Date.now(), st.plan) : null;
    for (const k of st.rerolls || []) meal_plan = rerollMeal(meal_plan, k, st.prefs, dayVariant(st.plan, todayLog().day_type === 'rest' ? 'rest' : 'train'));
    await savePlan({ ...st.plan, meal_plan, reasons: [{ icon: '💬', text: `Changé avec le coach IA : ${done.join(' ; ')}` }] });
    // Pile d'annulation : on annule du plus récent au plus ancien (5 retours en arrière au maximum).
    hist.filter((x) => x.undo).slice(0, -4).forEach((x) => { delete x.undo; });
    Object.assign(m, { status: 'applied', done, undo });
    chatSave(hist);
    toast('Changements appliqués');
    await refresh();
  } catch (e) { toast(e.message); render(); }
};
acts.declineActions = (el) => {
  const hist = chatLoad(), m = hist[+el.dataset.i];
  if (!m?.actions) return;
  m.status = 'declined';
  chatSave(hist);
  render();
};
acts.undoActions = async (el) => {
  const hist = chatLoad(), m = hist[+el.dataset.i];
  if (!m?.undo || !(await askConfirm('Revenir à ce que tu avais avant ces changements ?', 'Oui, revenir en arrière', 'Garder'))) return;
  try {
    await db.saveProfile(m.undo.profile);
    S.profile = m.undo.profile;
    await savePlan({ ...m.undo.plan, reasons: [{ icon: '↩️', text: 'Changements du coach IA annulés.' }] });
    m.status = 'undone';
    delete m.undo;
    chatSave(hist);
    toast('Changements annulés');
    await refresh();
  } catch (e) { toast(e.message); }
};

// Réponse en cours d'écriture : on n'affiche pas le bloc d'actions (il devient la carte « Changements proposés » à la fin).
const streamHtml = (t) => esc(franciser(t.split('```')[0].trim() || '…')).replace(/\n/g, '<br>');
// Demande de changement (ou « oui » à une suggestion) : le coach doit bien réfléchir pour écrire un bloc d'actions valide.
// Sinon (question, conseil) : réflexion courte, donc réponse plus rapide.
const CHANGE_WORDS = /remplac|chang|ajout|enleve|retir|monte|baisse|augment|diminu|modifi|\bmets?\b|compos|refai|remet|passe[rz]? a|unite|cible|calori|annul|\boui\b|\bok\b|d.accord|vas-y|parfait|\bgo\b|fais-le|applique/;

async function ask(q, photos = []) {
  const hist = chatLoad();
  hist.push({ r: 'user', t: q });
  chatSave(hist);
  S.chatBusy = true;
  render();
  window.scrollTo(0, document.body.scrollHeight);
  let text;
  if (!canAI()) {
    // Mode simple (démo ou IA désactivée) : réponse toute faite, en le disant clairement pour ne pas décevoir.
    text = `${faq(q) ?? FAQ_DEFAULT}\n\n(${db.DEMO ? 'Mode démo' : 'Mode simple'} : réponse automatique sur l’utilisation de l’app. Le vrai coach IA, qui te répond de façon personnalisée et peut modifier ton plan, fonctionne une fois connecté à ton compte.)`;
  } else {
    const messages = hist.slice(-12).map((m) => ({ role: m.r === 'user' ? 'user' : 'model', text: chatText(m) }));
    // Rappel invisible pour la personne : sans lui, le coach retombe dans ses anciennes consignes (« va dans l'onglet… »).
    messages[messages.length - 1].text += '\n\n(Rappel pour le coach : si je demande un changement faisable avec actions_possibles, propose-le toi-même avec le bloc ```actions```, au lieu de m’expliquer où toucher.)';
    const payload = { messages, context: chatContext(hist), photos, ...(photos.length || CHANGE_WORDS.test(norm(q)) ? {} : { reflexion: 'courte' }) };
    // Affiche la réponse pendant qu'elle s'écrit (sans tout redessiner : seulement la bulle en cours).
    const onText = (t) => {
      S.chatPartial = t;
      const el = document.getElementById('chat-stream');
      if (el) el.innerHTML = streamHtml(t);
    };
    const quota = (e) => /exceeded your current quota/i.test(e.message); // quota gratuit Gemini du jour épuisé
    const limited = (e) => quota(e) || /limite quotidienne/i.test(e.message); // inutile de réessayer
    const transient = (e) => !limited(e) && /high demand|overload|unavailable|\[(429|500|503)\]/i.test(e.message);
    try {
      try {
        text = await db.askCoachStream(payload, onText);
      } catch (e) {
        if (!transient(e)) throw e;
        await new Promise((r) => setTimeout(r, 3000)); // Google est parfois surchargé : on réessaie une fois
        text = await db.askCoachStream(payload, onText);
      }
      // Toutes ses propositions sont refusées par l'app (ex. exercice déjà dans la séance) : on lui renvoie les raisons
      // une fois, pour qu'il propose autre chose plutôt que de laisser la personne devant « Impossible ».
      const first = splitActions(text);
      const check = first.actions.length && planActions(first.actions, actionState());
      if (check && !check.valid) {
        const why = check.items.map((i) => i.label).join(' ; ');
        try {
          text = await db.askCoach({ ...payload, reflexion: undefined, photos: [], messages: [...messages, { role: 'model', text }, { role: 'user', text: `(Message de l'application, pas de la personne : ta proposition a été refusée — ${why}. Propose une autre option valide, en te basant sur programme_detaille et exercices_disponibles, avec un nouveau bloc actions. Ne mentionne pas ce refus.)` }] });
        } catch { /* on garde la première réponse, la carte expliquera pourquoi c'est impossible */ }
      }
    } catch (e) {
      const help = faq(q);
      text = limited(e)
        ? `${help ? `${help}\n\n` : ''}${quota(e)
          ? 'Le coach IA a atteint la limite gratuite de Google. Réessaie dans une minute. Si ça continue, c’est la limite du jour : elle se renouvelle vers 3 h du matin (heure du Québec).'
          : e.message.replace(/^\[\d+\]\s*/, '')}`
        : `${help ? `${help}\n\n` : ''}Le coach IA est momentanément indisponible, réessaie dans quelques instants.\n(${e.message})`;
    }
  }
  const split = splitActions(text);
  const msg = { r: 'ai', t: split.text || 'Voici ce que je te propose :' };
  if (split.actions.length) Object.assign(msg, { actions: split.actions, status: 'pending', labels: planActions(split.actions, actionState()).items.map((i) => i.label) });
  hist.push(msg);
  chatSave(hist);
  S.chatBusy = false;
  S.chatPartial = '';
  render();
  window.scrollTo(0, document.body.scrollHeight);
}
acts.ask = (el) => ask(el.dataset.q);
acts.askPhotos = () => ask('Analyse l’évolution visible sur mes photos de progrès (silhouette, posture), en plus de mes derniers chiffres.', recentPhotos(2));
acts.buildDiet = () => ask('Aide-moi à construire mon régime : pose-moi des questions une à la fois sur ce que j’aime manger (au déjeuner, au dîner, au souper, en collation), les quantités qui me conviennent, et mon budget épicerie. Base-toi sur des aliments courants et faciles à trouver, pas des produits de niche, et propose des combinaisons qui se mangent bien ensemble. Commence par ta première question.');
acts.clearChat = () => { chatSave([]); render(); };
forms.chat = async (form) => {
  const q = String(new FormData(form).get('q') || '').trim();
  if (q && !S.chatBusy) await ask(q);
};

// Taille en cm ou en pieds et pouces (beaucoup de gens au Québec pensent en pieds). Toujours enregistrée en cm.
const cmToFtIn = (cm) => { const t = Math.round(cm / 2.54); return [Math.floor(t / 12), t % 12]; };
function heightFieldHtml(cm, unit) {
  const ft = unit === 'ft', [f, i] = cm ? cmToFtIn(cm) : ['', ''];
  return `<div class="height" data-unit="${unit}">
    <div class="labelrow"><label>Taille</label><span class="unitsw">
      <button type="button" class="${ft ? '' : 'on'}" data-act="heightUnit" data-arg="cm">cm</button><button type="button" class="${ft ? 'on' : ''}" data-act="heightUnit" data-arg="ft">pi-po</button></span></div>
    <input type="hidden" name="height_unit" value="${unit}">
    <input name="height_cm" type="number" min="120" max="230" inputmode="numeric" placeholder="cm" aria-label="Taille en centimètres" ${ft ? 'hidden' : 'required'} value="${cm ?? ''}">
    <div class="ftin" ${ft ? '' : 'hidden'}>
      <input name="height_ft" type="number" min="4" max="7" inputmode="numeric" placeholder="pi" aria-label="Pieds" ${ft ? 'required' : ''} value="${f}">
      <input name="height_in" type="number" min="0" max="11" inputmode="numeric" placeholder="po" aria-label="Pouces" value="${i}">
    </div></div>`;
}
acts.heightUnit = (el) => {
  const box = el.closest('.height'), ft = el.dataset.arg === 'ft';
  const cm = box.querySelector('[name=height_cm]'), f = box.querySelector('[name=height_ft]'), i = box.querySelector('[name=height_in]');
  // On garde la valeur déjà tapée en la convertissant
  if (ft && +cm.value) [f.value, i.value] = cmToFtIn(+cm.value);
  if (!ft && +f.value) cm.value = Math.round((+f.value * 12 + (+i.value || 0)) * 2.54);
  box.dataset.unit = el.dataset.arg; box.querySelector('[name=height_unit]').value = el.dataset.arg;
  cm.hidden = ft; cm.required = !ft; box.querySelector('.ftin').hidden = !ft; f.required = ft;
  box.querySelectorAll('.unitsw button').forEach((b) => b.classList.toggle('on', b === el));
};

// form/extra : le récapitulatif de l'onboarding réutilise ce formulaire sous un autre nom, avec les champs alimentaires en plus.
function profileForm(p = {}, label = 'Enregistrer', pr = prefs(), { form = 'profile', extra = '', ai = true } = {}) {
  const opt = (v, t, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`;
  return `
  <form data-form="${form}" class="card">
    <label>Prénom</label><input name="name" required value="${esc(p.name ?? '')}">
    <div class="grid2">
      <div><label>Sexe</label><select name="sex">${opt('homme', 'Homme', p.sex)}${opt('femme', 'Femme', p.sex)}</select></div>
      <div><label>Année de naissance</label><input name="birth_year" type="number" min="1940" max="2015" required value="${p.birth_year ?? ''}"></div>
      ${heightFieldHtml(p.height_cm, pr.height_unit || (wUnit(p) === 'lb' ? 'ft' : 'cm'))}
      <div><label>Poids actuel (${wUnit(p)})</label><input name="start_weight" type="number" step="0.1" min="15" max="550" required value="${p.start_weight != null ? fmtWeight(p.start_weight, wUnit(p)) : ''}"></div>
    </div>
    <label>Objectif</label><select name="goal">${Object.entries(GOALS).map(([k, v]) => opt(k, v, p.goal)).join('')}</select>
    <div class="grid2">
      <div><label>Poids visé (optionnel, ${wUnit(p)})</label><input name="goal_weight" type="number" step="0.1" min="15" max="550" value="${pr.goal_weight != null ? fmtWeight(pr.goal_weight, wUnit(p)) : ''}"></div>
      <div><label>Date visée (optionnel)</label><input name="goal_date" type="date" value="${pr.goal_date || ''}"></div>
    </div>
    <p class="muted">Avec les deux, le coach calcule le rythme nécessaire (jamais plus vite qu’un rythme sûr) et te montre où tu en es.</p>
    <div class="grid2 wide2">
      <div><label>Jours / semaine</label><select name="days_per_week">${[2, 3, 4, 5, 6].map((n) => opt(String(n), n, String(p.days_per_week ?? 4))).join('')}</select></div>
      <div><label>Matériel</label><select name="equipment">${opt('gym', 'Salle de sport', p.equipment)}${opt('home', 'Maison (haltères)', p.equipment)}</select></div>
    </div>
    <label>Ton but avec l’entraînement, en tes mots</label>
    <textarea name="training_goal_text" rows="3" maxlength="600" placeholder="ex. je veux surtout être en forme et avoir plus d’énergie au quotidien, sans nécessairement viser un gros physique">${esc(pr.training_goal_text)}</textarea>
    <label>Tu cherches plutôt…</label>
    <select name="training_style">${Object.entries(TRAINING_STYLES).map(([k, v]) => opt(k, v, pr.training_style)).join('')}</select>
    <p class="muted">Le type choisi change les fourchettes de répétitions de tout ton programme (ex. squat en 3–5 pour la force, 9–14 pour l’endurance). Le coach IA lit aussi ce que tu as écrit ci-dessus pour mieux te conseiller.</p>
    ${canAI() && ai ? `<button type="button" class="ghost block" style="margin-top:8px" data-act="askGoal">Demander l’avis du coach IA sur mon but</button>
    ${pr.training_goal_ai ? `<p class="msg"><span>💬</span><span>${esc(pr.training_goal_ai)}</span></p>` : ''}` : ''}
    <label>Activité hors entraînement</label>
    <select name="activity">${opt('low', 'Surtout assis', p.activity)}${opt('medium', 'Assez actif', p.activity ?? 'medium')}${opt('high', 'Très actif / travail physique', p.activity)}</select>
    <label>Blessures ou exercices à éviter (optionnel)</label>
    <textarea name="limitations" rows="2" placeholder="ex. genou droit fragile, pas de barre au-dessus de la tête">${esc(p.limitations ?? '')}</textarea>
    <label><input type="checkbox" name="share_photos" ${p.share_photos === false ? '' : 'checked'}> Partager mes photos avec mes amis</label>
    ${extra}
    <button class="block" style="margin-top:14px">${label}</button>
  </form>`;
}

function vSettings() {
  const u = wUnit();
  return `
  <section class="card">
    <h2>Unité de poids (balance, check-in)</h2>
    <div class="tabs">
      <button type="button" class="${u === 'kg' ? 'on' : ''}" data-act="setUnit" data-arg="kg">Kilogrammes (kg)</button>
      <button type="button" class="${u === 'lb' ? 'on' : ''}" data-act="setUnit" data-arg="lb">Livres (lb)</button>
    </div>
    <p class="muted">Change juste l’affichage : tes données restent enregistrées en kilogrammes.</p>
  </section>
  <section class="card">
    <h2>Charges à l’entraînement (kg, lb, plates)</h2>
    <p class="muted">Chaque exercice a sa propre unité : dans l’onglet Séance, touche le nom d’un exercice (ⓘ) pour choisir kg, lb ou plates juste pour celui-là — pratique quand un haltère est en lb et une machine en kg.</p>
  </section>
  ${profileForm(S.profile)}
  ${friendCardHtml()}
  <section class="card">
    <h2>Mes données</h2>
    <p class="muted">Tes données t’appartiennent : tu peux les télécharger ou tout supprimer, quand tu veux.</p>
    <button type="button" class="ghost block" data-act="exportData">Télécharger mes données</button>
    <button type="button" class="ghost block danger" data-act="deleteAccount">Supprimer mon compte</button>
  </section>
  <section class="card">
    <p class="muted">Connecté : ${esc(S.me.email)}</p>
    ${db.DEMO ? '<button class="ghost block" data-act="resetDemo">Réinitialiser la démo</button>' : '<button class="ghost block" data-act="logout">Se déconnecter</button>'}
  </section>`;
}
function friendCardHtml() {
  return `
  <section class="card">
    <h2>Partage avec des amis</h2>
    <p class="muted">Tes données restent privées. Avec un ami relié, chacun voit le progrès de l’autre (séances, poids, et photos si tu les partages).</p>
    ${S.others.map((o) => `<div class="row between friend-row"><b>${esc(o.profile.name)}</b>
      <button type="button" class="ghost small" data-act="removePartner" data-arg="${esc(o.profile.id)}">Arrêter de partager</button></div>`).join('')}
    ${S.invite ? `<p class="invite-code">${esc(S.invite)}</p><p class="muted center">Donne ce code à ton ami (valide 7 jours, une seule fois).</p>`
      : `<button type="button" class="block" style="margin-top:10px" data-act="createInvite">${S.others.length ? 'Inviter un autre ami' : 'Créer un code d’invitation'}</button>`}
    <form data-form="joinFriend" class="row" style="margin-top:12px">
      <input name="code" placeholder="J’ai reçu un code" autocomplete="off" required>
      <button class="ghost">Valider</button>
    </form>
  </section>`;
}
acts.exportData = async () => {
  try {
    const data = await db.exportMine(S.me.id);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `coach-mes-donnees-${today()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Données téléchargées');
  } catch (e) { toast(e.message); }
};
acts.deleteAccount = async (el) => {
  const ok = await askConfirm('Supprimer définitivement ton compte ? Ton profil, tes plans, tes séances, tes check-ins et tes photos seront effacés, et tes amis ne te verront plus. Impossible de revenir en arrière.', 'Supprimer définitivement', 'Garder mon compte');
  if (!ok) return;
  el.disabled = true; el.textContent = 'Suppression…';
  try {
    const uid = S.me.id;
    await db.deleteAccount(uid);
    // Ce que l'app gardait sur cet appareil pour ce compte (conversation, brouillons)
    try { Object.keys(localStorage).filter((k) => k.endsWith(`_${uid}`) || k.includes(`_${uid}_`)).forEach((k) => localStorage.removeItem(k)); } catch { /* rien à nettoyer */ }
    S.me = db.DEMO ? await db.getUser() : null; S.profile = null; S.onb = null; S.others = [];
    toast('Compte supprimé');
    if (db.DEMO) { location.hash = '#/home'; location.reload(); } else render();
  } catch (e) { toast(e.message); el.disabled = false; el.textContent = 'Supprimer mon compte'; }
};
acts.createInvite = async () => {
  try { S.invite = await db.createInvite(); render(); } catch (e) { toast(e.message); }
};
acts.removePartner = async (el) => {
  const o = S.others.find((x) => x.profile.id === el.dataset.arg);
  if (!o || !(await askConfirm(`Arrêter de partager avec ${o.profile.name} ? Aucun de vous deux ne verra plus le progrès de l’autre.`, 'Arrêter de partager'))) return;
  try { await db.removePartner(o.profile.id); toast('Partage arrêté'); await refresh(); } catch (e) { toast(e.message); }
};
forms.joinFriend = async (form) => {
  try { await db.acceptInvite(String(new FormData(form).get('code'))); S.invite = null; toast('Vous êtes reliés 🎉'); await refresh(); }
  catch (e) { toast(e.message); }
};
acts.setUnit = async (el) => {
  try { await setFoodPrefs({ weight_unit: el.dataset.arg }); toast(`Poids affichés en ${el.dataset.arg}`); render(); }
  catch (e) { toast(e.message); }
};
forms.plateSettings = async (form) => {
  const fd = new FormData(form);
  try {
    await setFoodPrefs({ plate_lb: +fd.get('plate_lb') || 45, bar_lb: +fd.get('bar_lb') || 0 });
    toast('Enregistré');
    render();
    closeSheet();
  } catch (e) { toast(e.message); }
};

const routes = { home: vHome, train: vTrain, edit: vEdit, food: vFood, checkin: vCheckin, progress: vProgress, coach: vCoach, settings: vSettings };
const TITLES = { home: 'Accueil', train: 'Séance', edit: 'Mon programme', food: 'Repas', checkin: 'Check-in', progress: 'Progrès', coach: 'Coach', settings: 'Réglages' };
const TABS = [['home', 'home', 'Accueil'], ['train', 'dumbbell', 'Séance'], ['food', 'food', 'Repas'], ['checkin', 'check', 'Check-in'], ['progress', 'trend', 'Progrès'], ['coach', 'chat', 'Coach']];
// Icônes (traits, 24×24), dessinées en SVG pour un rendu net et identique sur tous les téléphones.
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  dumbbell: '<path d="M6.5 6v12M17.5 6v12M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  food: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11"/><path d="M18 21V3c-2.2 1.2-3.5 3.8-3.5 7.5V14H18"/>',
  check: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 3h6v3H9z"/><path d="m9 13.5 2 2 4-4"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/>',
  gear: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12L17 12h4"/>',
};
const icon = (k) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const brandHtml = (sub) => `<div class="brand"><div class="logo">${icon('pulse')}</div><h1>Coach</h1><p>${sub}</p></div>`;

// ================= Rendu =================
function render() {
  if (!S.me || S.recovery) return renderAuth(); // S.recovery : arrivé par le lien « mot de passe oublié »
  if (!S.profile) return renderOnboarding();
  root.innerHTML = `${db.DEMO ? '<div class="demo">Mode démo : les données restent sur cet appareil</div>' : ''}
    <header><h1>${TITLES[S.view]}</h1><a href="#/settings" aria-label="Réglages">${icon('gear')}</a></header>
    <main>${routes[S.view]()}</main>
    <nav>${TABS.map(([k, i, t]) => `<a href="#/${k}" class="${S.view === k || (k === 'train' && S.view === 'edit') ? 'on' : ''}"><span class="ico">${icon(i)}</span>${t}</a>`).join('')}</nav>`;
  hydratePhotos();
}
// Écrans de connexion : in (connexion), up (inscription), sent (courriel de confirmation envoyé),
// forgot (mot de passe oublié), resetSent (lien envoyé), newpw (choisir un nouveau mot de passe, via le lien reçu).
function renderAuth() {
  const m = S.authMode, email = esc(S.authEmail || '');
  const back = '<p class="center"><a href="#" data-act="authMode" data-arg="in">Retour à la connexion</a></p>';
  const card = {
    sent: `<div class="card"><h2>Vérifie tes courriels 📬</h2>
      <p>On t’a envoyé un lien à <b>${email}</b>. Clique dessus pour activer ton compte : tu reviendras ici, connecté.</p>
      <p class="muted">Rien reçu après quelques minutes ? Regarde dans les courriels indésirables.</p>${back}</div>`,
    resetSent: `<div class="card"><h2>Lien envoyé 📬</h2>
      <p>Si un compte existe pour <b>${email}</b>, tu vas recevoir un lien pour choisir un nouveau mot de passe.</p>
      <p class="muted">Rien reçu après quelques minutes ? Regarde dans les courriels indésirables.</p>${back}</div>`,
    forgot: `<form data-form="forgot" class="card"><h2>Mot de passe oublié</h2>
      <p class="muted">Entre ton courriel : on t’envoie un lien pour en choisir un nouveau.</p>
      <label>Courriel</label><input name="email" type="email" required autocomplete="email" value="${email}">
      <button class="block" style="margin-top:14px">Envoyer le lien</button>${back}</form>`,
    newpw: `<form data-form="newPassword" class="card"><h2>Nouveau mot de passe</h2>
      <label>Nouveau mot de passe</label><input name="password" type="password" minlength="6" required autocomplete="new-password">
      <label>Encore une fois</label><input name="password2" type="password" minlength="6" required autocomplete="new-password">
      <button class="block" style="margin-top:14px">Enregistrer</button></form>`,
  }[m];
  const up = m === 'up';
  root.innerHTML = `<div class="auth">${brandHtml('Ton entraînement, tes repas et ton suivi, ajustés chaque semaine.')}${card || `<form data-form="auth" class="card">
    <h2>${up ? 'Créer un compte' : 'Connexion'}</h2>
    <label>Courriel</label><input name="email" type="email" required autocomplete="email" value="${email}">
    <label>Mot de passe</label><input name="password" type="password" minlength="6" required autocomplete="${up ? 'new-password' : 'current-password'}">
    ${up ? '<p class="muted">Au moins 6 caractères.</p>' : '<p class="right"><a href="#" data-act="authMode" data-arg="forgot">Mot de passe oublié ?</a></p>'}
    <button class="block" style="margin-top:14px">${up ? 'Créer mon compte' : 'Me connecter'}</button>
    <p class="center"><a href="#" data-act="toggleAuth">${up ? 'J’ai déjà un compte' : 'Créer un compte'}</a></p>
  </form>`}</div>`;
}
acts.authMode = (el, e) => { e.preventDefault(); S.authMode = el.dataset.arg; renderAuth(); };
forms.forgot = async (form) => {
  const email = String(new FormData(form).get('email')).trim();
  const btn = form.querySelector('button'); btn.disabled = true;
  try { await db.resetPassword(email); S.authEmail = email; S.authMode = 'resetSent'; renderAuth(); }
  catch (e) { toast(e.message); btn.disabled = false; }
};
forms.newPassword = async (form) => {
  const fd = new FormData(form);
  if (fd.get('password') !== fd.get('password2')) return toast('Les deux mots de passe ne sont pas pareils.');
  try {
    await db.updatePassword(String(fd.get('password')));
    S.recovery = false; S.authMode = 'in';
    toast('Mot de passe changé ✅');
    S.me = await db.getUser();
    await refresh('home');
  } catch (e) { toast(e.message); }
};
// ----- Premier accès : conversation avec le coach (ou formulaire classique) -----
// La conversation et le brouillon sont gardés sur l'appareil, pour reprendre là où on en était après un rechargement.
const onbKey = () => `coach_onb_${S.me.id}`;
function onbLoad() { try { return JSON.parse(localStorage.getItem(onbKey()) || 'null'); } catch { return null; } }
function onbSave() { try { localStorage.setItem(onbKey(), JSON.stringify(S.onb)); } catch { /* stockage indisponible */ } }
const onbAvailable = () => canAI() || db.DEMO; // démo : faux coach scripté, pour tester le parcours sans IA
const onbNew = () => ({ hist: [{ r: 'ai', t: FIRST_MESSAGE }], draft: {}, done: false, mode: onbAvailable() ? 'chat' : 'form' });

function renderOnboarding() {
  if (!S.onb) S.onb = onbLoad() || onbNew();
  const o = S.onb;
  if (!onbAvailable()) o.mode = 'form';
  const body = o.mode === 'recap' ? onbRecapHtml(o) : o.mode === 'chat' ? onbChatHtml(o)
    : `<h2>Créons ton plan</h2><p class="muted">Quelques infos pour créer ton plan de départ. Tu pourras tout modifier ensuite.</p>${profileForm({}, 'Créer mon plan', prefs(), { ai: false })}
       ${onbAvailable() ? '<button type="button" class="ghost block" data-act="onbMode" data-arg="chat">Je préfère discuter avec le coach</button>' : ''}`;
  root.innerHTML = `<div class="auth onboard">${brandHtml('Bienvenue 👋')}${body}</div>`;
  if (o.mode === 'chat') { const c = root.querySelector('.chat'); if (c) c.scrollTop = c.scrollHeight; root.querySelector('textarea[name=q]')?.focus(); }
}
function onbChatHtml(o) {
  const total = Object.keys(ESSENTIALS).length, known = total - missing(o.draft).length;
  return `
  <section class="card">
    <div class="row between"><h2>Faisons connaissance</h2><span class="muted">${known} sur ${total} infos</span></div>
    ${bar(known, total)}
    <div class="chat">
      ${o.hist.map((m) => `<div class="bubble ${m.r}">${esc(m.t).replace(/\n/g, '<br>')}</div>`).join('')}
      ${o.busy ? '<div class="bubble ai">…</div>' : ''}
    </div>
    <form data-form="onbChat" class="chatform">
      <textarea name="q" rows="2" placeholder="Ta réponse…" required ${o.busy ? 'disabled' : ''}>${esc(o.retry || '')}</textarea>
      <button class="send" ${o.busy ? 'disabled' : ''} aria-label="Envoyer"><svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
    </form>
    ${db.DEMO ? '<p class="muted" style="margin-top:10px">Mode démo : coach scripté (sans IA), pour tester le parcours.</p>' : ''}
  </section>
  ${o.done ? '<button type="button" class="block" data-act="onbMode" data-arg="recap">Voir mon récapitulatif et créer mon plan</button>' : ''}
  <div class="onb-links">
    ${o.done ? '' : '<button type="button" class="link" data-act="onbMode" data-arg="recap">Passer au récapitulatif</button><span aria-hidden="true">·</span>'}
    <button type="button" class="link" data-act="onbMode" data-arg="form">Remplir un formulaire</button>
    ${o.hist.length > 1 ? '<span aria-hidden="true">·</span><button type="button" class="link" data-act="onbRestart">Recommencer</button>' : ''}
  </div>`;
}
function onbRecapHtml(o) {
  const d = o.draft;
  const unit = d.weight_unit || 'kg';
  const p = {
    name: d.name, sex: d.sex, birth_year: d.birth_year, height_cm: d.height_cm, start_weight: d.weight_kg, goal: d.goal,
    days_per_week: d.days_per_week, equipment: d.equipment, activity: d.activity, limitations: d.limitations, food_prefs: { weight_unit: unit },
  };
  const pr = {
    ...prefs(), weight_unit: unit, goal_weight: d.goal_weight_kg ?? null, goal_date: d.goal_date || '', training_goal_text: d.training_goal_text || '',
    training_style: d.training_style || 'hypertrophy', diet: d.diet || 'aucun', allergies: d.allergies || [], other_allergies: d.other_allergies || [], dislikes: d.dislikes || '',
    meals: d.meals || 4, budget: d.budget || 'normal',
  };
  const minor = d.birth_year && new Date().getFullYear() - d.birth_year < 18;
  const miss = missing(d);
  return `
  <h2>Ton récapitulatif</h2>
  <p class="muted">Voici ce que le coach a compris. Vérifie, corrige au besoin, puis crée ton plan. Tu pourras tout changer plus tard.</p>
  ${d.caution || minor ? `<section class="card warn"><h2>⚠️ À lire avant de commencer</h2>
    ${d.caution ? `<p>${esc(d.caution)}</p>` : ''}
    ${minor ? '<p>Tu as moins de 18 ans : parles-en à un parent et à un professionnel de la santé avant de changer ton alimentation.</p>' : ''}
    <p class="muted">L’application ne remplace pas un avis médical. En cas de doute, consulte un professionnel de la santé.</p></section>` : ''}
  ${miss.length ? `<p class="msg"><span>✏️</span><span>À compléter : ${miss.map((k) => ESSENTIALS[k]).join(', ')}.</span></p>` : ''}
  ${profileForm(p, 'Créer mon plan', pr, { form: 'onboard', ai: false, extra: `<h2 style="margin-top:24px">Alimentation</h2>${foodFields(pr)}` })}
  <button type="button" class="ghost block" data-act="onbMode" data-arg="chat">Revenir à la discussion</button>`;
}
// Recherche d'allergie : filtre les cases, montre les allergies moins courantes qui correspondent, et propose
// d'ajouter le terme tapé s'il ne correspond à aucune case.
function filterAllergies(input) {
  const q = norm(input.value.trim());
  const box = input.form.querySelector('.checks.allergies');
  let found = false;
  box.querySelectorAll('.check').forEach((c) => {
    const hit = !q || c.dataset.name.includes(q);
    if (q && hit) found = true;
    c.hidden = c.classList.contains('extra') ? !(c.querySelector('input').checked || (q && hit)) : !hit;
  });
  const add = input.form.querySelector('[data-act=addAllergy]');
  add.hidden = q.length < 3 || found; // une case correspond déjà : pas de doublon
  add.textContent = `+ Ajouter « ${input.value.trim()} » comme allergie`;
}
acts.addAllergy = (el) => {
  const input = el.form.querySelector('[data-allergy-search]');
  const term = input.value.trim().slice(0, 40);
  if (!term) return;
  el.form.querySelector('.checks.allergies').insertAdjacentHTML('beforeend',
    `<label class="check extra" data-name="${esc(norm(term))}"><input type="checkbox" name="allergy_other" value="${esc(term)}" checked> ${esc(term)}</label>`);
  input.value = '';
  filterAllergies(input);
};
acts.onbMode = (el) => { S.onb.mode = el.dataset.arg; onbSave(); renderOnboarding(); window.scrollTo(0, 0); };
acts.onbRestart = async (el, e) => {
  e.preventDefault();
  if (!(await askConfirm('Recommencer la discussion depuis le début ?', 'Recommencer'))) return;
  S.onb = onbNew(); onbSave(); renderOnboarding();
};
forms.onbChat = async (form) => {
  const o = S.onb;
  const q = String(new FormData(form).get('q') || '').trim();
  if (!q || o.busy) return;
  o.hist.push({ r: 'user', t: q });
  o.busy = true;
  renderOnboarding();
  try {
    const res = db.DEMO
      ? await new Promise((ok) => setTimeout(() => ok(mockTurn(o.hist, o.draft, q)), 500))
      : parseReply(await db.askCoach(onboardPayload(o.hist, o.draft)));
    o.draft = mergeDraft(o.draft, res.draft);
    o.done = res.done;
    o.hist.push({ r: 'ai', t: res.reply, raw: res.raw });
    o.retry = '';
  } catch (e) {
    const why = /quota/i.test(e.message) ? 'le coach a atteint la limite gratuite de Google pour le moment'
      : e instanceof SyntaxError ? 'je me suis mélangé dans ma réponse'
      : /trop de temps|surcharg|high demand|overload/i.test(e.message) ? 'Google est surchargé en ce moment' : e.message.replace(/\.+$/, '');
    // Le message de la personne revient dans la zone de saisie (pas de doublon dans l'historique) ; l'erreur est
    // affichée mais jamais renvoyée à l'IA (err: true), et la précédente est remplacée.
    o.hist.pop();
    if (o.hist[o.hist.length - 1]?.err) o.hist.pop();
    o.retry = q;
    o.hist.push({ r: 'ai', t: `Oups, ${why}. Renvoie ton message dans un instant, ou passe au récapitulatif pour remplir le reste toi-même.`, err: true });
  }
  o.busy = false;
  onbSave();
  renderOnboarding();
};
forms.onboard = async (form) => {
  const fd = new FormData(form);
  const unit = S.onb?.draft?.weight_unit || 'kg';
  const p = readProfile(Object.fromEntries(fd), null, prefs(), unit);
  p.food_prefs = { ...p.food_prefs, ...readFoodFields(fd), weight_unit: unit, done: true };
  const btn = form.querySelector('button:not([type=button])');
  btn.disabled = true; btn.textContent = 'Création de ton plan…';
  try {
    await createStart(p);
    try { localStorage.removeItem(onbKey()); } catch { /* rien à nettoyer */ }
    S.onb = null;
    toast('Ton plan est prêt 🎉');
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Créer mon plan'; }
};
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
  if (S.profile) await loadOthers();
  if (v) location.hash = '#/' + v;
  route();
}

// ================= Actions (clics) =================
acts.startDay = (el) => { S.dayIdx = +el.dataset.arg; location.hash = '#/train'; route(); };
acts.pickDay = (el) => { S.dayIdx = +el.dataset.arg; render(); };
acts.who = (el) => { S.who = el.dataset.arg; render(); };
acts.seeOther = (el) => { S.who = el.dataset.arg; };
acts.slot = (el) => { S.slot = el.dataset.arg; render(); };
acts.toggleAuth = (el, e) => { e.preventDefault(); S.authMode = S.authMode === 'in' ? 'up' : 'in'; render(); };
acts.logout = async () => { await db.signOut(); S.me = null; S.profile = null; S.onb = null; render(); };
acts.resetDemo = () => { db.resetDemo(); location.hash = '#/home'; location.reload(); };
acts.askAI = async (el) => {
  el.disabled = true; el.textContent = 'Le coach réfléchit…';
  try {
    const cur = S.checkins.find((c) => c.week_start === curWeek(S.checkins));
    const prev = S.checkins[S.checkins.length - 2];
    const photos = [...photosOf(cur, 'Cette semaine'), ...photosOf(prev, 'Semaine précédente')];
    const text = await db.askCoach({
      messages: [{ role: 'user', text: 'Commente ma semaine en 4 à 8 phrases : ce qui va bien, ce qui inquiète, et une action concrète pour la semaine à venir. Si des photos sont jointes, commente aussi ce qui est visible dessus (silhouette, posture), en plus des chiffres.' }],
      context: { ...aiContext(), guide_du_coach: COACH_GUIDE, ajustements_du_coach: cur.coach.messages.map((m) => m.text) },
      photos,
    });
    await db.saveCheckin({ ...cur, coach: { ...cur.coach, ai: splitActions(text).text } });
    await refresh();
  } catch (e) { toast('Avis IA indisponible : ' + e.message); el.disabled = false; el.textContent = 'Demander un avis'; }
};
acts.askGoal = async (el) => {
  const text = el.form.training_goal_text.value.trim();
  if (!text) return toast('Écris d’abord ton but dans le champ ci-dessus.');
  el.disabled = true; el.textContent = 'Le coach réfléchit…';
  try {
    const reply = await db.askCoach({
      messages: [{ role: 'user', text: `Voici ce que la personne a écrit sur son but avec l’entraînement, dans ses mots : « ${text} ». En 3 à 6 phrases, dis-lui si son plan actuel (jours, matériel, type d’entraînement, nutrition) correspond bien à ce but, et propose un ou deux réglages concrets à changer dans l’app si besoin (avec le nom exact du bouton).` }],
      context: aiContext(),
    });
    const food_prefs = { ...prefs(), training_goal_text: text, training_goal_ai: splitActions(reply).text };
    await db.saveProfile({ ...S.profile, food_prefs });
    S.profile = { ...S.profile, food_prefs };
    toast('Avis reçu');
    render();
  } catch (e) { toast('Avis IA indisponible : ' + e.message); el.disabled = false; el.textContent = 'Demander l’avis du coach IA sur mon but'; }
};
acts.aiFillDiet = async (el) => {
  const text = document.getElementById('ai-diet-text').value.trim();
  const hist = chatLoad().slice(-16); // la conversation du coach (ex. « Construire mon régime ») compte aussi
  if (!text && !hist.length) return toast('Décris ton régime dans le champ ci-dessus, ou discute-en d’abord avec le coach (onglet Coach).');
  el.disabled = true; el.textContent = 'Le coach réfléchit…';
  try {
    const dietKeys = Object.keys(DIETS).join('", "');
    const allergyKeys = Object.keys(ALLERGENS).join('", "');
    const convo = hist.length ? `Voici notre conversation récente sur son régime :\n${hist.map((m) => `${m.r === 'user' ? 'Personne' : 'Coach'} : ${m.t}`).join('\n')}\n\n` : '';
    const reply = await db.askCoach({
      messages: [{ role: 'user', text: `${convo}${text ? `Elle ajoute maintenant : « ${text} ». ` : ''}Réponds UNIQUEMENT avec un objet JSON, sans texte autour ni bloc de code, exactement sous cette forme : {"diet": "une valeur parmi \\"${dietKeys}\\"", "allergies": ["zéro ou plusieurs valeurs parmi \\"${allergyKeys}\\""], "dislikes": "aliments à éviter séparés par des virgules, en français, ou chaîne vide", "meals": nombre entier 3, 4, 5 ou 6}. Déduis ces valeurs du mieux possible à partir de ce qui précède.` }],
      context: {},
    });
    let json = reply.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(json);
    const form = document.querySelector('form[data-form=food]');
    if (DIETS[parsed.diet]) form.diet.value = parsed.diet;
    const wanted = new Set(Array.isArray(parsed.allergies) ? parsed.allergies.filter((a) => ALLERGENS[a]) : []);
    form.querySelectorAll('input[name=allergy]').forEach((c) => { c.checked = wanted.has(c.value); });
    if (typeof parsed.dislikes === 'string') form.dislikes.value = parsed.dislikes.slice(0, 300);
    if ([3, 4, 5, 6].includes(+parsed.meals)) form.meals.value = String(parsed.meals);
    toast('Préférences remplies par le coach — vérifie puis enregistre.');
    form.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    toast('Le coach n’a pas pu répondre clairement, réessaie ou remplis le formulaire toi-même.');
  } finally {
    el.disabled = false; el.textContent = 'Laisser le coach remplir mes préférences';
  }
};

// ================= Formulaires =================
forms.auth = async (form) => {
  const fd = new FormData(form);
  S.authEmail = String(fd.get('email')).trim();
  try {
    if (S.authMode === 'up') {
      if (await db.signUp(S.authEmail, fd.get('password'))) { S.authMode = 'sent'; return renderAuth(); } // courriel à confirmer
    } else await db.signIn(S.authEmail, fd.get('password'));
    S.me = await db.getUser();
    await refresh('home');
  } catch (e) { toast(e.message); }
};

// Lit le formulaire de profil (Réglages, premier accès ou récapitulatif de l'onboarding). unit = unité des poids tapés.
function readProfile(fd, old, oldPr, unit = wUnit(old)) {
  const p = {
    ...(old || {}),
    id: S.me.id, name: fd.name.trim(), sex: fd.sex, birth_year: +fd.birth_year,
    height_cm: fd.height_unit === 'ft' ? Math.round(((+fd.height_ft || 0) * 12 + (+fd.height_in || 0)) * 2.54) : +fd.height_cm,
    start_weight: toKg(+fd.start_weight, unit), goal: fd.goal, days_per_week: +fd.days_per_week, equipment: fd.equipment,
    activity: fd.activity, limitations: (fd.limitations || '').trim(), share_photos: !!fd.share_photos,
  };
  const goalText = String(fd.training_goal_text || '').trim().slice(0, 600);
  p.food_prefs = {
    ...oldPr, height_unit: fd.height_unit === 'ft' ? 'ft' : 'cm', goal_weight: fd.goal_weight ? toKg(+fd.goal_weight, unit) : null, goal_date: fd.goal_date || '',
    training_goal_text: goalText, training_style: fd.training_style,
    training_goal_ai: goalText === oldPr.training_goal_text ? oldPr.training_goal_ai : '', // texte changé : l'ancien avis n'est plus à jour
  };
  return p;
}
// Nouveau compte : crée le profil et le plan de départ (avec les repas si les préférences alimentaires sont déjà connues).
async function createStart(p) {
  await db.saveProfile(p);
  const plan = {
    user_id: S.me.id, ...calcTargets(p, p.start_weight), program: buildProgram(p.days_per_week, p.equipment, p.food_prefs.training_style),
    deload: false, hold: false, meal_plan: null,
    reasons: [{ icon: '🚀', text: 'Plan de départ créé selon ton profil. Fais ton premier check-in pour lancer le suivi.' }],
  };
  if (p.food_prefs.done) plan.meal_plan = buildChoices(p.food_prefs, Date.now(), plan);
  await db.savePlan(plan);
  await refresh('home');
}

forms.profile = async (form) => {
  const fd = Object.fromEntries(new FormData(form));
  const old = S.profile;
  const oldPr = prefs();
  const p = readProfile(fd, old, oldPr);
  const programChanged = !!old && (old.days_per_week !== p.days_per_week || old.equipment !== p.equipment || oldPr.training_style !== p.food_prefs.training_style);
  if (programChanged && !(await askConfirm('Changer les jours, le matériel ou le type d’entraînement remplace ton programme actuel, y compris tes modifications. Continuer ?', 'Remplacer mon programme'))) return;
  try {
    if (!old) return await createStart(p);
    await db.saveProfile(p);
    S.profile = p;
    const targetsChanged = old.goal !== p.goal || old.activity !== p.activity;
    if (programChanged || targetsChanged) {
      const ch = { reasons: [{ icon: '🛠️', text: 'Plan mis à jour après le changement de ton profil.' }] };
      if (programChanged) ch.program = buildProgram(p.days_per_week, p.equipment, p.food_prefs.training_style);
      if (targetsChanged) Object.assign(ch, calcTargets(p, lastWeight()));
      await savePlan(ch);
    }
    toast('Profil enregistré');
    await refresh();
  } catch (e) { toast(e.message); }
};

forms.food = async (form) => {
  const fd = new FormData(form);
  // On repart des préférences actuelles pour ne pas effacer l'eau, l'unité de poids ou l'objectif chiffré.
  const pr = { ...prefs(), ...readFoodFields(fd), done: true };
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
  const protein = +fd.get('protein'), carbs = +fd.get('carbs'), fat = +fd.get('fat');
  const calories = Math.round(protein * 4 + carbs * 4 + fat * 9);
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
      if (r > 0) sets.push({ w: round1(parseLoadInput(fd.get(`w_${i}_${s}`), ex.id)), r });
    }
    if (sets.length) exercises.push({ id: ex.id, sets });
  });
  if (!exercises.length) return toast('Note au moins une série avant de terminer.');
  try {
    await db.saveWorkout({ user_id: S.me.id, date: today(), day_label: day.label, exercises });
    day.exercises.forEach((ex) => draftClear(ex.id));
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
    const res = weeklyAdjust({ profile: profileWithGoal(), plan: S.plan, checkins: all });
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
    // Recherche d'allergie : Entrée ajoute le terme au lieu d'envoyer tout le formulaire
    if (e.key === 'Enter' && e.target.dataset.allergySearch !== undefined) {
      e.preventDefault();
      const add = e.target.form.querySelector('[data-act=addAllergy]');
      if (!add.hidden) add.click();
    }
    // Discussion : Entrée envoie, Maj+Entrée va à la ligne
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.chatform textarea')) { e.preventDefault(); e.target.form.requestSubmit(); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset.edit && S.draft) return editField(e.target);
    // Photo de check-in choisie : aperçu dans la case
    if (e.target.dataset.photo !== undefined) {
      const f = e.target.files[0], prev = e.target.parentElement.querySelector('.photoprev');
      prev.innerHTML = f ? `<img src="${URL.createObjectURL(f)}" alt="">` : '📷';
      e.target.parentElement.classList.toggle('on', !!f);
      return;
    }
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
    if (e.target.dataset.allergySearch !== undefined) filterAllergies(e.target);
    // Champs qui réagissent en tapant (ex. recherche d'aliment)
    if (e.target.dataset.act && acts[e.target.dataset.act]) acts[e.target.dataset.act](e.target, e);
    // Séance en cours : garde ce qui est tapé même sans avoir appuyé sur « Terminer »
    const m = e.target.dataset.exid && e.target.name?.match(/^([wr])_\d+_(\d+)$/);
    if (m) draftSet(e.target.dataset.exid, +m[2], m[1], e.target.value);
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
    // Arrivée par un lien reçu par courriel : ?nouveau-mdp (mot de passe oublié) ou ?confirme (inscription)
    const q = new URLSearchParams(location.search);
    if (q.has('nouveau-mdp')) { S.recovery = true; S.authMode = 'newpw'; }
    await db.init();
    S.me = await db.getUser(); // attend que Supabase ait lu le jeton du lien (dans l'adresse)
    if (q.has('confirme') && S.me) toast('Courriel confirmé, bienvenue ! 🎉');
    if (q.has('nouveau-mdp') && !S.me) { S.recovery = false; S.authMode = 'forgot'; toast('Ce lien a expiré : demande-en un nouveau.'); }
    if (q.has('nouveau-mdp') || q.has('confirme')) { // on retire nos repères de l'adresse
      q.delete('nouveau-mdp'); q.delete('confirme');
      history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash.includes('access_token') ? '' : location.hash}`);
    }
    if (S.me) { await loadMine(); if (S.profile) await loadOthers(); }
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="auth"><div class="card"><h2>Oups</h2><p>${esc(e.message)}</p><p class="muted">Vérifie js/config.js et ta connexion.</p></div></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
