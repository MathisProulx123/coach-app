import * as db from './db.js';
import { CONFIG } from './config.js';
import { esc, today, mondayOf, addDays, fmtDate, round1, avg, resizeImage } from './util.js';
import { EXERCISES, buildProgram } from './data.js';
import { calcTargets, weeklyAdjust, nextTarget } from './rules.js';

const S = {
  me: null, profile: null, plan: null, workouts: [], daily: [], checkins: [], other: null,
  view: 'home', dayIdx: null, who: 'me', slot: 'front', authMode: 'in',
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

// ================= Petits helpers d'affichage =================
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
const bar = (v, t) => `<div class="bar"><i style="width:${Math.min(100, t ? (v / t) * 100 : 0)}%"></i></div>`;
const GOALS = { lose: 'Perdre du gras', maintain: 'Maintenir', gain: 'Prendre du muscle' };
const LEVEL5 = ['1 · Très bas', '2 · Bas', '3 · Correct', '4 · Bon', '5 · Excellent'];

function lineChart(points) {
  if (points.length < 2) return '<p class="muted">Pas encore assez de données (2 check-ins minimum).</p>';
  const W = 320, H = 150, P = 26;
  const ys = points.map((p) => p.y);
  const lo = Math.min(...ys) - 0.5, hi = Math.max(...ys) + 0.5;
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids">
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}
    <text x="${P}" y="${H - 6}" font-size="10" fill="var(--muted)">${fmtDate(points[0].d)}</text>
    <text x="${W - P}" y="${H - 6}" font-size="10" fill="var(--muted)" text-anchor="end">${fmtDate(points[points.length - 1].d)}</text>
    <text x="${P}" y="14" font-size="11" fill="var(--muted)">${round1(hi - 0.5)} kg</text>
    <text x="${P}" y="${H - 16}" font-size="11" fill="var(--muted)">${round1(lo + 0.5)} kg</text></svg>`;
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
function statsOf(d) {
  const first = d.checkins[0]?.weight ?? d.profile.start_weight;
  const last = d.checkins[d.checkins.length - 1]?.weight ?? first;
  const wk = mondayOf();
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

// ================= Écrans =================
function vHome() {
  const p = S.profile, plan = S.plan, wk = mondayOf();
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
    <p><b>${esc(day.label)}</b><br><span class="muted">${day.exercises.map((e) => esc(EXERCISES[e.id].name)).join(' · ')}</span></p>
    <button class="block" data-act="startDay" data-arg="${idx}">Commencer</button>
  </section>
  <section class="card">
    <h2>Nutrition aujourd’hui</h2>
    <div class="row between"><span>Calories</span><span>${log.calories || 0} / ${plan.calories} kcal</span></div>${bar(log.calories || 0, plan.calories)}
    <div class="row between"><span>Protéines</span><span>${log.protein || 0} / ${plan.protein} g</span></div>${bar(log.protein || 0, plan.protein)}
    <a class="btn ghost block" href="#/food">Noter ma journée</a>
  </section>
  ${msgs.length ? `<section class="card"><h2>Le coach</h2>${msgs.map((m) => `<div class="msg"><span>${m.icon}</span><span>${esc(m.text)}</span></div>`).join('')}</section>` : ''}
  <section class="card">
    <h2>${o ? esc(o.profile.name) : 'Ton ami'}</h2>
    ${o
      ? `<div class="grid4"><div class="stat"><b>${os.week}</b><span>séances / sem.</span></div>
         <div class="stat"><b>${os.change > 0 ? '+' : ''}${os.change}</b><span>kg</span></div>
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
  <form data-form="workout" data-day="${idx}" class="card">
    <h2>${esc(day.label)}</h2>
    ${day.exercises.map((ex, i) => {
      const def = EXERCISES[ex.id];
      const last = lastSets(ex.id);
      const t = nextTarget(def, ex, last, { deload: S.plan.deload, hold: S.plan.hold });
      const unit = def.time ? 's' : 'reps';
      return `<div class="ex">
        <h3>${esc(def.name)}</h3>
        <div class="muted">${t.sets} × ${ex.lo}–${ex.hi} ${unit}${t.w !== null ? ` · objectif ${t.w} kg` : ''}</div>
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

function vFood() {
  const pl = S.plan;
  const log = S.daily.find((d) => d.date === today()) || {};
  const meals = +(localStorage.getItem('meals') || 4);
  const week = S.daily.filter((d) => d.date >= addDays(today(), -6));
  const wAvg = avg(week.filter((d) => d.calories).map((d) => d.calories));
  return `
  <section class="card">
    <h2>Tes cibles du jour</h2>
    <div class="grid4">
      <div class="stat"><b>${pl.calories}</b><span>kcal</span></div><div class="stat"><b>${pl.protein}</b><span>protéines g</span></div>
      <div class="stat"><b>${pl.carbs}</b><span>glucides g</span></div><div class="stat"><b>${pl.fat}</b><span>lipides g</span></div>
    </div>
    <p class="muted">Ces cibles s’ajustent chaque semaine selon ton check-in.</p>
    <h3>Répartition</h3>
    <label>Nombre de repas par jour</label>
    <select data-act="setMeals">${[3, 4, 5, 6].map((n) => `<option ${n === meals ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <p>≈ <b>${Math.round(pl.calories / meals)} kcal</b> et <b>${Math.round(pl.protein / meals)} g de protéines</b> par repas.</p>
  </section>
  <form data-form="daily" class="card">
    <h2>Journal du jour</h2>
    <label>Poids du matin (kg) — optionnel</label><input name="weight" type="number" step="0.1" inputmode="decimal" value="${log.weight ?? ''}">
    <label>Calories mangées</label><input name="calories" type="number" inputmode="numeric" value="${log.calories ?? ''}">
    <label>Protéines (g)</label><input name="protein" type="number" inputmode="numeric" value="${log.protein ?? ''}">
    <button class="block" style="margin-top:12px">Enregistrer</button>
    ${wAvg ? `<p class="muted">Moyenne des 7 derniers jours : ${Math.round(wAvg)} kcal (cible ${pl.calories}).</p>` : ''}
  </form>
  <section class="card">
    <h2>Idées simples</h2>
    <p><b>Assiette type :</b> une source de protéines (grosseur de la paume), un féculent, 1–2 légumes, un pouce de gras.</p>
    <p class="muted">Protéines : œufs, yogourt grec, fromage cottage, poulet, dinde, poisson, thon, tofu, poudre de protéines.<br>
    Féculents : riz, pommes de terre, pâtes, avoine, pain, fruits.</p>
  </section>`;
}

function vCheckin() {
  const wk = mondayOf();
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
    ${CONFIG.AI_ENABLED ? `<section class="card"><h2>Avis du coach IA</h2>${cur.coach?.ai ? `<p>${esc(cur.coach.ai)}</p>` : '<p class="muted">Un commentaire personnalisé sur ta semaine.</p><button class="block" data-act="askAI">Demander un avis</button>'}</section>`
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
    <label>Poids moyen de la semaine (kg)</label><input name="weight" type="number" step="0.1" inputmode="decimal" required value="${w0}">
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
      <div class="stat"><b>${st.change > 0 ? '+' : ''}${st.change}</b><span>kg depuis le début</span></div>
      <div class="stat"><b>${st.total}</b><span>séances</span></div>
      <div class="stat"><b>${st.streak}</b><span>sem. d’affilée</span></div>
      <div class="stat"><b>${st.adh ?? '–'}${st.adh === null ? '' : '%'}</b><span>régularité</span></div>
    </div>
  </section>
  <section class="card"><h2>Poids</h2>${lineChart(pts)}</section>
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
    ${[...d.checkins].reverse().map((c) => `<div class="row between"><span>${fmtDate(c.week_start)}</span><span class="muted">${c.weight} kg · séances ${c.adherence_training}% · nutrition ${c.adherence_nutrition}%</span></div>`).join('') || '<p class="muted">Aucun check-in.</p>'}
  </section>`;
}

function profileForm(p = {}, label = 'Enregistrer') {
  const opt = (v, t, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`;
  return `
  <form data-form="profile" class="card">
    <label>Prénom</label><input name="name" required value="${esc(p.name ?? '')}">
    <div class="grid2">
      <div><label>Sexe</label><select name="sex">${opt('homme', 'Homme', p.sex)}${opt('femme', 'Femme', p.sex)}</select></div>
      <div><label>Année de naissance</label><input name="birth_year" type="number" min="1940" max="2015" required value="${p.birth_year ?? ''}"></div>
      <div><label>Taille (cm)</label><input name="height_cm" type="number" min="120" max="230" required value="${p.height_cm ?? ''}"></div>
      <div><label>Poids actuel (kg)</label><input name="start_weight" type="number" step="0.1" min="30" max="250" required value="${p.start_weight ?? ''}"></div>
    </div>
    <label>Objectif</label><select name="goal">${Object.entries(GOALS).map(([k, v]) => opt(k, v, p.goal)).join('')}</select>
    <div class="grid2">
      <div><label>Jours d’entraînement / semaine</label><select name="days_per_week">${[2, 3, 4, 5, 6].map((n) => opt(String(n), n, String(p.days_per_week ?? 4))).join('')}</select></div>
      <div><label>Matériel</label><select name="equipment">${opt('gym', 'Salle de sport', p.equipment)}${opt('home', 'Maison (haltères)', p.equipment)}</select></div>
    </div>
    <label>Activité hors entraînement</label>
    <select name="activity">${opt('low', 'Surtout assis', p.activity)}${opt('medium', 'Assez actif', p.activity ?? 'medium')}${opt('high', 'Très actif / travail physique', p.activity)}</select>
    <label><input type="checkbox" name="share_photos" ${p.share_photos === false ? '' : 'checked'}> Partager mes photos avec mon ami</label>
    <button class="block" style="margin-top:14px">${label}</button>
  </form>`;
}

function vSettings() {
  return `
  ${profileForm(S.profile)}
  <section class="card">
    <p class="muted">Connecté : ${esc(S.me.email)}</p>
    ${db.DEMO ? '<button class="ghost block" data-act="resetDemo">Réinitialiser la démo</button>' : '<button class="ghost block" data-act="logout">Se déconnecter</button>'}
  </section>`;
}

const routes = { home: vHome, train: vTrain, food: vFood, checkin: vCheckin, progress: vProgress, settings: vSettings };
const TITLES = { home: 'Accueil', train: 'Entraînement', food: 'Nutrition', checkin: 'Check-in', progress: 'Progrès', settings: 'Réglages' };
const TABS = [['home', '🏠', 'Accueil'], ['train', '🏋️', 'Séance'], ['food', '🍽️', 'Nutrition'], ['checkin', '📝', 'Check-in'], ['progress', '📈', 'Progrès']];

// ================= Rendu =================
function render() {
  if (!S.me) return renderAuth();
  if (!S.profile) return renderOnboarding();
  root.innerHTML = `${db.DEMO ? '<div class="demo">Mode démo : les données restent sur cet appareil</div>' : ''}
    <header><h1>${TITLES[S.view]}</h1><a href="#/settings" aria-label="Réglages">⚙️</a></header>
    <main>${routes[S.view]()}</main>
    <nav>${TABS.map(([k, i, t]) => `<a href="#/${k}" class="${S.view === k ? 'on' : ''}"><b>${i}</b>${t}</a>`).join('')}</nav>`;
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
acts.setMeals = (el) => { localStorage.setItem('meals', el.value); render(); };
acts.toggleAuth = (el, e) => { e.preventDefault(); S.authMode = S.authMode === 'in' ? 'up' : 'in'; render(); };
acts.logout = async () => { await db.signOut(); S.me = null; S.profile = null; render(); };
acts.resetDemo = () => { db.resetDemo(); location.hash = '#/home'; location.reload(); };
acts.askAI = async (el) => {
  el.disabled = true; el.textContent = 'Le coach réfléchit…';
  try {
    const cur = S.checkins.find((c) => c.week_start === mondayOf());
    const text = await db.askCoach({
      profile: { goal: S.profile.goal, sex: S.profile.sex, height_cm: S.profile.height_cm },
      plan: { calories: S.plan.calories, protein: S.plan.protein, deload: S.plan.deload },
      checkins: S.checkins.slice(-6).map(({ week_start, weight, sleep, energy, soreness, stress, adherence_training, adherence_nutrition, notes }) => ({ week_start, weight, sleep, energy, soreness, stress, adherence_training, adherence_nutrition, notes })),
      rules_said: cur.coach.messages.map((m) => m.text),
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
  const p = {
    id: S.me.id, name: fd.name.trim(), sex: fd.sex, birth_year: +fd.birth_year, height_cm: +fd.height_cm,
    start_weight: +fd.start_weight, goal: fd.goal, days_per_week: +fd.days_per_week, equipment: fd.equipment,
    activity: fd.activity, share_photos: !!fd.share_photos,
  };
  const old = S.profile;
  try {
    await db.saveProfile(p);
    if (!old) {
      await db.savePlan({
        user_id: S.me.id, ...calcTargets(p, p.start_weight), program: buildProgram(p.days_per_week, p.equipment),
        deload: false, hold: false, reasons: [{ icon: '🚀', text: 'Plan de départ créé selon ton profil. Fais ton premier check-in pour lancer le suivi.' }],
      });
      await refresh('home');
      return;
    }
    const programChanged = old.days_per_week !== p.days_per_week || old.equipment !== p.equipment;
    const targetsChanged = old.goal !== p.goal || old.activity !== p.activity;
    if (programChanged || targetsChanged) {
      const t = targetsChanged ? calcTargets(p, lastWeight()) : { calories: S.plan.calories, protein: S.plan.protein, carbs: S.plan.carbs, fat: S.plan.fat };
      await db.savePlan({
        user_id: S.me.id, ...t, program: programChanged ? buildProgram(p.days_per_week, p.equipment) : S.plan.program,
        deload: S.plan.deload, hold: S.plan.hold, reasons: [{ icon: '🛠️', text: 'Plan mis à jour après le changement de ton profil.' }],
      });
    }
    toast('Profil enregistré');
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
  try {
    await db.saveDaily({ user_id: S.me.id, date: today(), weight: num('weight'), calories: num('calories'), protein: num('protein') });
    toast('Journal enregistré');
    await refresh();
  } catch (e) { toast(e.message); }
};

forms.checkin = async (form) => {
  const fd = new FormData(form);
  const wk = mondayOf();
  const btn = form.querySelector('button');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const photos = {};
    for (const slot of ['front', 'side', 'back']) {
      const f = fd.get('photo_' + slot);
      if (f && f.size) photos[slot] = await db.uploadPhoto(S.me.id, wk, slot, await resizeImage(f));
    }
    const c = {
      user_id: S.me.id, week_start: wk, weight: +fd.get('weight'), waist: +fd.get('waist') || null,
      sleep: +fd.get('sleep'), energy: +fd.get('energy'), soreness: +fd.get('soreness'), stress: +fd.get('stress'),
      adherence_training: +fd.get('adherence_training'), adherence_nutrition: +fd.get('adherence_nutrition'),
      notes: fd.get('notes') || '', photos,
    };
    const all = [...S.checkins.filter((x) => x.week_start !== wk), c].sort((a, b) => (a.week_start > b.week_start ? 1 : -1));
    const res = weeklyAdjust({ profile: S.profile, plan: S.plan, checkins: all });
    c.coach = { messages: res.messages, deload: res.deload };
    await db.saveCheckin(c);
    await db.savePlan({
      user_id: S.me.id, calories: res.calories, protein: res.protein, carbs: res.carbs, fat: res.fat,
      program: S.plan.program, deload: res.deload, hold: res.hold, reasons: res.messages,
    });
    await refresh('checkin');
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Envoyer mon check-in'; }
};

// ================= Événements globaux =================
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && el.tagName !== 'SELECT' && acts[el.dataset.act]) acts[el.dataset.act](el, e);
});
root.addEventListener('change', (e) => {
  const el = e.target.closest('select[data-act]');
  if (el && acts[el.dataset.act]) acts[el.dataset.act](el, e);
});
root.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (f && forms[f.dataset.form]) { e.preventDefault(); forms[f.dataset.form](f, e); }
});
root.addEventListener('input', (e) => {
  if (e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value + '%';
});

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
