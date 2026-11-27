// The s-verse runner: loads every s-verse listed in s-verses/manifest.json, opens portals between them, keeps score.
import * as core from './core.js';
import * as S from './shared.js';
import { createWormhole } from './wormhole.js';

const { THREE, el, audio, hud, input, renderer, store } = core;
const params = new URLSearchParams(location.search);
const START = params.get('verse');                 // ?verse=golf starts you in that s-verse (the list links use this)
let replay = !!START && params.has('replay');      // ?verse=my-idea&replay plays it again every time it ends (for testing your own)
const ID_OK = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MAX_PER_VISIT = 12;        // one visit to an s-verse can't award more gold s's than this

const run = {
  score: 0, homeCount: 0, portalFrom: 0, portalAt: 3, trips: 0, loop: Math.max(0, parseInt(params.get('loop') || '0', 10) || 0),
  stops: 0, deck: [], dealt: 0, visited: [], best: parseInt(store.get('s.best', '0'), 10) || 0,
};
let manifest = [];
let home = null;         // the notebook (kept alive between trips)
let cur = null;          // { def, inst, ctx, visit }
let warping = false, leaving = false, overShown = false, overAt = 0, lastGrade = 'F';
const wormhole = createWormhole(THREE);
let tunnel = false; // flying down the wormhole (it's drawn instead of any s-verse)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function anim(node, frames, opts) {
  if (node.animate) return node.animate(frames, { fill: 'forwards', ...opts }).finished.catch(() => {});
  Object.assign(node.style, frames[frames.length - 1]);
  return sleep(opts.duration || 0);
}
/* ---------- the quiet hints that there's more in here ---------- */

// which s-verses this player has ever been to (kept between visits)
const found = (() => { try { return new Set(JSON.parse(store.get('s.found', '[]'))); } catch (_) { return new Set(); } })();
function markFound(id) {
  if (found.has(id)) return;
  found.add(id);
  store.set('s.found', JSON.stringify([...found]));
}
function hintLine() {
  const all = manifest.filter((v) => !v.home && !v.hidden), k = all.filter((v) => found.has(v.id)).length;
  if (!all.length) return '';
  if (!k) return "psst. 3 s's opens a wormhole";
  return k < all.length ? `s-verses found: ${k} of ${all.length}` : `s-verses found: all ${all.length}!`;
}
// the meter under the score at home: a dot for each gold s until the next wormhole, then a little spiral
const $meter = document.getElementById('meter');
const SPIRAL = (() => {
  let d = 'M0 0';
  for (let i = 1; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 5, r = t * 8.5; d += `L${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`; }
  return d;
})();
function updateMeter(bump) {
  const show = !!(cur && cur.def.home && !overShown && manifest.some((v) => !v.home && !v.hidden));
  $meter.classList.toggle('on', show);
  if (!show) return;
  const need = run.portalAt - run.portalFrom, have = clamp(run.homeCount - run.portalFrom, 0, need);
  if ($meter.querySelectorAll('i').length !== need) {
    $meter.textContent = '';
    for (let i = 0; i < need; i++) $meter.appendChild(document.createElement('i'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.setAttribute('viewBox', '-10 -10 20 20');
    path.setAttribute('d', SPIRAL);
    svg.appendChild(path);
    $meter.appendChild(svg);
  }
  const dots = $meter.querySelectorAll('i');
  dots.forEach((dot, i) => dot.classList.toggle('on', i < have));
  if (bump && have > 0) { const dot = dots[have - 1]; dot.classList.remove('bump'); void dot.offsetWidth; dot.classList.add('bump'); }
  $meter.classList.toggle('open', have >= need);
  $meter.setAttribute('aria-label', have >= need ? 'a wormhole is open' : `${need - have} more gold s's to the next wormhole`);
}
const clamp = S.clamp;

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const away = () => manifest.filter((v) => !v.home && !v.hidden);

/* ---------- the toolbox every s-verse gets (see CONTRIBUTING.md) ---------- */

const base = {
  version: 1,
  THREE,
  S,
  envTexture: core.envTexture, canvasTexture: core.canvasTexture, makeParticles: core.makeParticles, makeGoogly: core.makeGoogly,
  ballTexture: core.ballTexture, fitPerspective: core.fitPerspective,
  miniS: (scale, depth, bevel) => core.miniSGeometry(S.OUTLINE, S.INNER, scale, depth, bevel),
  sFitPoints: (pad, ys, extra) => core.sFitPoints(S.OUTLINE, pad, ys, extra),
  readStick: core.readStick, releaseStick: core.releaseStick, input: core.input, keys: core.keys, ZERO2: core.ZERO2,
  audio, haptic: core.haptic,
  hud: { status: hud.status, pop: hud.pop, popXY: hud.popXY, flash: hud.flash },
  lerp: core.lerp, damp: core.damp, easeOutCubic: core.easeOutCubic, easeOutBack: core.easeOutBack, easeInCubic: core.easeInCubic, pick: core.pick,
  coarse: core.coarse, reduceMotion: core.reduceMotion, lowEnd: core.lowEnd, HAND: core.HAND, ANISO: core.ANISO,
};

function makeCtx(def) {
  const visit = { earned: 0 };
  const ctx = Object.create(base);
  ctx.loop = run.loop;
  ctx.addScore = (n = 1) => {
    n = Math.max(0, Math.floor(n));
    if (!def.home) n = Math.min(n, MAX_PER_VISIT - visit.earned);
    if (n <= 0) return run.score;
    visit.earned += n;
    run.score += n;
    hud.score(run.score, true);
    return run.score;
  };
  ctx.finish = (result = {}) => finishVerse(def, result);
  if (def.home) {
    ctx.home = {
      collected() { run.homeCount++; updateMeter(true); },
      portalReady: () => run.homeCount >= run.portalAt && away().length > 0,
      enterPortal: (x, y) => takePortal(x, y),
      gameOver: (reason) => showOver(reason),
      ready() { hud.best(run.best); },      // the ball has landed and waits for the first touch
      started() { hud.score(run.score); },  // play has begun: show the score
    };
  }
  return { ctx, visit };
}

/* ---------- looks: every s-verse can bring its own lettering and colors ---------- */

const FONT_OK = /^[A-Za-z0-9 ]{1,40}$/;
const COLOR_OK = /^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\))$/i;
const fonts = new Set(['Gochi Hand', 'Rock Salt']);
const color = (c) => (typeof c === 'string' && COLOR_OK.test(c) ? c : '');
const fontStack = (t) => (t.font && FONT_OK.test(t.font) ? `"${t.font}", ${core.HAND}` : '');
const scaleOf = (t) => (t.hudScale >= 0.3 && t.hudScale <= 2 ? String(t.hudScale) : '');
function loadFont(t) {
  if (!t || !t.font || fonts.has(t.font) || !FONT_OK.test(t.font)) return;
  fonts.add(t.font);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${t.font.trim().replace(/ +/g, '+')}&display=swap`;
  document.head.appendChild(link);
}
function applyTheme(def) {
  const t = def.theme || {}, b = document.body, st = b.style;
  hud.theme(def.id);
  b.classList.toggle('away', !def.home);
  b.classList.toggle('scanlines', !!t.crt);
  st.setProperty('--hud-font', fontStack(t));
  st.setProperty('--hud-ink', color(t.ink));
  st.setProperty('--hud-glow', color(t.glow));
  st.setProperty('--hud-scale', scaleOf(t));
  st.setProperty('--stick', color(t.stick || t.ink));
}
const $by = document.getElementById('cardBy');
// whichever of two colors reads better on the dark wormhole
function brighter(a, b) {
  const lum = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return -1; const n = parseInt(m[1], 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  return lum(a) >= lum(b) ? a : b;
}
function showCard(def, label) {
  const t = def.theme || {}, cs = el.card.style;
  cs.setProperty('--card-accent', brighter(color(t.accent), color(t.card)));
  cs.setProperty('--card-glow', color(t.glow || t.accent));
  cs.setProperty('--card-font', fontStack(t));
  cs.setProperty('--card-scale', scaleOf(t));
  el.cardNum.textContent = label;
  el.cardName.textContent = def.name || def.id;
  el.cardVerb.textContent = def.verb || '';
  $by.textContent = def.author ? `by @${def.author}` : '';
  el.card.classList.add('show');
}
// s-verses are numbered by their place in the manifest: the notebook is #1, the next one added is #2, and so on
const numberOf = (id) => manifest.findIndex((v) => v.id === id) + 1;

/* ---------- loading s-verses ---------- */

const mods = new Map();
function loadVerse(id) {
  if (!ID_OK.test(id)) return Promise.reject(new Error(`bad s-verse id "${id}"`));
  if (!mods.has(id)) {
    mods.set(id, import(`../s-verses/${id}/index.js`).then((m) => {
      const def = m.default;
      if (!def || typeof def.create !== 'function') throw new Error(`s-verse "${id}" has no create()`);
      if (def.id !== id) throw new Error(`s-verse in folder "${id}" says its id is "${def.id}"`);
      loadFont(def.theme);
      return def;
    }));
  }
  return mods.get(id);
}

// where the next wormhole goes: a random s-verse (never the one you're in), dealt from a shuffled deck so you see
// all of them before any comes round again. Each time the deck runs out the multiverse gets a little harder.
function pickNext(notId) {
  const ids = away().map((v) => v.id).filter((id) => id !== notId);
  if (!ids.length) return null;
  for (let tries = 0; tries < 3; tries++) {
    if (!run.deck.length) { if (run.dealt++) run.loop++; run.deck = shuffle(away().map((v) => v.id)); }
    const id = run.deck.pop();
    if (id !== notId && ids.includes(id)) return id;
  }
  return ids[(Math.random() * ids.length) | 0];
}

/* ---------- warps ---------- */

// portal → dark circle opens → fly down the wormhole of S's → through the big S at the end → the next s-verse
async function warp(from, def, label, swap) {
  warping = true;
  setMenu(false);
  core.releaseStick();
  audio.warp();
  const [x, y] = from;
  const R = Math.ceil(Math.hypot(innerWidth, innerHeight)) + 40;
  const fly = !core.reduceMotion;
  for (const a of el.warp.getAnimations()) a.cancel();
  el.warp.classList.add('on');
  await anim(el.warp, [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }],
    { duration: fly ? 420 : 150, easing: 'cubic-bezier(.55,0,.85,.35)' });
  try { await swap(); } catch (err) { console.error(err); }
  // draw the new s-verse and the wormhole once while the screen is dark, so nothing stutters later
  try { if (cur) renderer.render(cur.inst.scene, cur.inst.camera); } catch (err) { console.error(err); }
  if (fly) {
    wormhole.begin(def.theme);
    wormhole.update(0);
    renderer.render(wormhole.scene, wormhole.camera);
    tunnel = true;
    await anim(el.warp, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease-out' });
  }
  showCard(def, label);
  await sleep(fly ? 1350 : 900);
  el.card.classList.remove('show');
  if (fly) {
    wormhole.arrive();
    await sleep(380);
    await anim(el.warp, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
    tunnel = false;
  }
  audio.arrive();
  await anim(el.warp, [{ clipPath: `circle(${R}px at 50% 50%)`, opacity: 1 }, { clipPath: 'circle(0px at 50% 50%)', opacity: 1 }],
    { duration: fly ? 440 : 150, easing: 'cubic-bezier(.3,.6,.4,1)' });
  el.warp.classList.remove('on');
  for (const a of el.warp.getAnimations()) a.cancel();
  warping = false;
}

function leaveCurrent() {
  if (!cur || cur.inst === home) return;
  audio.stopLoop();
  try { if (cur.inst.dispose) cur.inst.dispose(); } catch (err) { console.error(err); }
  core.disposeScene(cur.inst.scene);
}

function setCurrent(def, inst, ctx, visit) {
  cur = { def, inst, ctx, visit };
  applyTheme(def);
  hud.status('');
  if (inst.resize) inst.resize();
  updateMeter();
}

async function enterVerse(id, from) {
  let def;
  try { def = await loadVerse(id); } catch (err) { console.error(err); return goHome(from, true); }
  leaving = true;
  await warp(from, def, `s-verse #${numberOf(id)}`, () => {
    leaveCurrent();
    const { ctx, visit } = makeCtx(def);
    let inst;
    try { inst = def.create(ctx); } catch (err) { console.error(err); inst = null; }
    if (!inst || !inst.scene || !inst.camera || typeof inst.update !== 'function') { cur = null; return; }
    setCurrent(def, inst, ctx, visit);
    run.visited.push(id);
    markFound(id);
    if (!replay) count(`s-verse/${id}`, def.name);
  });
  leaving = false;
  if (!cur) return goHome(from, true);
  try { if (cur.inst.start) cur.inst.start(); } catch (err) { onCrash(err); }
}

function takePortal(x, y) {
  run.trips++;
  run.stops = 0;
  const next = pickNext(null);
  if (!next) { home.begin(); return; }
  enterVerse(next, [x, y]);
}

function finishVerse(def, result) {
  if (!cur || cur.def !== def || leaving || warping) return;
  leaving = true;
  const center = [innerWidth / 2, innerHeight / 2];
  if (replay && def.id === START) { // testing one s-verse: just run it again
    hud.popXY(result.success === false ? 'failed! again:' : `done! +${cur.visit.earned}`, center[0], center[1] * 0.6, 'big');
    setTimeout(() => { leaving = false; enterVerse(START, center); }, 1100);
    return;
  }
  if (result.success === false) { goHome(center, true); return; }
  // on to another random s-verse, or (more likely the longer you've been away) back home to the notebook
  run.stops++;
  const next = pickNext(def.id);
  if (next && Math.random() > Math.min(0.8, 0.15 + 0.22 * (run.stops - 1))) { leaving = false; enterVerse(next, center); } else goHome(center, false);
}

// the "enter wormhole" button: straight down a wormhole to another random s-verse, from wherever you are
const $next = document.getElementById('next');
function nextGame() {
  if (!cur || warping || leaving || !away().length) return;
  if (cur.def.home && home.state === 'intro') return;
  replay = false;
  if (overShown) resetRun();
  if (cur.def.home) { run.trips++; run.stops = 0; }
  const r = $next.getBoundingClientRect();
  enterVerse(pickNext(cur.def.id), [r.left + r.width / 2, r.top + r.height / 2]);
}
$next.addEventListener('click', (e) => { e.stopPropagation(); audio.init(); nextGame(); });
window.addEventListener('keydown', (e) => { if (e.code === 'KeyN' && !e.metaKey && !e.ctrlKey && !e.altKey) nextGame(); });
let nextShown = false;
function updateNext() {
  const show = !!(cur && !warping && away().length && !(cur.def.home && home && home.state === 'intro'));
  if (show !== nextShown) { nextShown = show; $next.classList.toggle('on', show); }
}

async function goHome(from, failed) {
  leaving = true;
  run.stops = 0;
  run.portalFrom = run.homeCount;
  run.portalAt = run.homeCount + 3;
  await warp(from, homeDef, failed ? 'kicked back to' : 'back to', () => {
    leaveCurrent();
    setCurrent(homeDef, home, homeCtx.ctx, homeCtx.visit);
  });
  leaving = false;
  home.begin();
}

function onCrash(err) {
  console.error('s-verse crashed:', err);
  if (!cur || cur.inst === home) throw err;
  finishVerse(cur.def, { success: false });
}

/* ---------- game over & retry ---------- */

function credits() {
  const ids = [...new Set(run.visited)];
  if (!ids.length) return '';
  const who = [...new Set(ids.map((id) => (manifest.find((v) => v.id === id) || {}).author).filter(Boolean))];
  const n = ids.length;
  let line = `visited ${n} ${n === 1 ? 's-verse' : 's-verses'}`;
  if (who.length) line += ` by ${who.slice(0, 2).map((a) => `@${a}`).join(' & ')}${who.length > 2 ? ` +${who.length - 2}` : ''}`;
  return line;
}

function showOver(reason) {
  const s = run.score, isBest = s > run.best;
  if (isBest) { run.best = s; store.set('s.best', s); }
  const [, g, remark] = S.gradeFor(s);
  lastGrade = g;
  el.grade.textContent = g;
  el.remark.textContent = remark;
  el.reason.textContent = reason === 'slow' ? 'too slow. the S got bored.' : core.pick(['flew out!', 'yeeted.', 'wheeeee', 'launched!']);
  el.tally.textContent = `you got ${s} ${s === 1 ? 's' : "s's"}`;
  el.trip.textContent = credits();
  document.getElementById('found').textContent = hintLine();
  el.bestline.textContent = isBest && s > 0 ? 'new best!' : `best: ${run.best}`;
  el.again.textContent = core.coarse ? 'tap to try again' : 'click to try again';
  el.over.classList.add('show');
  hud.best(run.best);
  overShown = true;
  overAt = performance.now();
  updateMeter();
  if (s >= 20) audio.tada(); else if (s < 7) audio.sad();
}

function resetRun() {
  overShown = false;
  el.over.classList.remove('show');
  Object.assign(run, { score: 0, homeCount: 0, portalFrom: 0, portalAt: 3, trips: 0, stops: 0, deck: [], dealt: 0, visited: [], loop: 0 });
  hud.score(0);
  updateMeter();
  home.reset();
}

el.share.addEventListener('pointerdown', (e) => e.stopPropagation());
el.share.addEventListener('click', async (e) => {
  e.stopPropagation();
  const n = new Set(run.visited).size;
  const text = `i got ${/^[AFS]/.test(lastGrade) ? 'an' : 'a'} ${lastGrade} on s.computer (${run.score} ${run.score === 1 ? 's' : "s's"}${n ? `, ${n} ${n === 1 ? 's-verse' : 's-verses'}` : ''})`;
  const url = 'https://s.computer';
  if (navigator.share) {
    try { await navigator.share({ title: 's.computer', text, url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    el.share.textContent = 'copied!';
    setTimeout(() => { el.share.textContent = 'share'; }, 1400);
  } catch (_) { /* no clipboard either */ }
});

/* ---------- the list of every s-verse (the "4 games" button, or the logo) ---------- */

const $logo = document.getElementById('logo'), $games = document.getElementById('games'), $menu = document.getElementById('menu'), $list = document.getElementById('menuList');
const $add = document.getElementById('addyours');
function buildMenu() {
  const n = manifest.filter((v) => !v.hidden).length;
  document.getElementById('gamesN').textContent = `${n} ${n === 1 ? 'game' : 'games'}`;
  $list.textContent = '';
  manifest.forEach((v, i) => {
    if (v.hidden) return;
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = v.home ? './' : `./?verse=${v.id}`;
    if (cur && v.id === cur.def.id) a.setAttribute('aria-current', 'page');
    const n = document.createElement('span'), name = document.createElement('span'), by = document.createElement('span');
    n.className = 'n'; n.textContent = `#${i + 1}`;
    name.className = 'name'; name.textContent = v.name || v.id;
    by.className = 'by'; by.textContent = v.author ? `@${v.author}` : '';
    a.append(n, name, by);
    li.appendChild(a);
    $list.appendChild(li);
  });
}
function setMenu(open) {
  $menu.hidden = !open;
  for (const b of [$logo, $games]) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
for (const b of [$logo, $games]) b.addEventListener('click', (e) => { e.stopPropagation(); audio.init(); if ($menu.hidden) buildMenu(); setMenu($menu.hidden); });
window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !$menu.hidden) { setMenu(false); $games.focus(); } });
// the "add your own" note shows on the notebook whenever you're not mid-game
let addShown = false;
function updateAdd() {
  const show = !!(cur && cur.def.home && !warping && (overShown || ['intro', 'title'].includes(home && home.state)));
  if (show !== addShown) { addShown = show; $add.classList.toggle('on', show); }
}

/* ---------- counting players (GoatCounter, loaded by index.html on s.computer only) ---------- */

function count(path, title) {
  try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path, title, event: true }); } catch (_) { /* counting never breaks the game */ }
}
let played = false;
function countPlay() { if (!played) { played = true; count('play', 'started playing'); } }

/* ---------- input routing ---------- */

const START_KEYS = new Set(['Space', 'Enter']);
input.onPress = (e) => {
  if (!$menu.hidden) { setMenu(false); return; } // a tap outside the list just closes it
  if (warping || !cur) return;
  countPlay();
  if (overShown) { if (performance.now() - overAt > 450) resetRun(); return; }
  if (cur.inst.onPress) try { cur.inst.onPress(e); } catch (err) { onCrash(err); }
};
input.onRelease = (e) => { if (!warping && cur && cur.inst.onRelease) try { cur.inst.onRelease(e); } catch (err) { onCrash(err); } };
input.onKey = (e, dir, up) => {
  if (!cur) return;
  if (up) { if (cur.inst.onKey) try { cur.inst.onKey(e, dir, true); } catch (err) { onCrash(err); } return; }
  if (warping) return;
  if (dir || START_KEYS.has(e.code)) countPlay();
  if (overShown) { if ((dir || START_KEYS.has(e.code)) && performance.now() - overAt > 450) resetRun(); return; }
  if (cur.inst === home) { if (dir || START_KEYS.has(e.code)) home.onPress(e); return; }
  if (cur.inst.onKey) try { cur.inst.onKey(e, dir, false); } catch (err) { onCrash(err); }
};

function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  input.R = Math.max(56, Math.min(96, Math.min(innerWidth, innerHeight) * 0.17));
  wormhole.resize();
  if (home && home.resize) home.resize();
  if (cur && cur.inst !== home && cur.inst.resize) try { cur.inst.resize(); } catch (err) { onCrash(err); }
}
window.addEventListener('resize', onResize);
el.c.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); // lets the browser hand the picture back
  const fb = document.getElementById('fallback');
  fb.querySelector('.why').textContent = 'the S got lost.\nreload to bring it back.';
  fb.hidden = false;
});
el.c.addEventListener('webglcontextrestored', () => { document.getElementById('fallback').hidden = true; });

/* ---------- boot ---------- */

let homeDef = null, homeCtx = null;
async function boot() {
  try {
    const r = await fetch('./s-verses/manifest.json', { cache: 'no-cache' });
    manifest = ((await r.json()).sverses || []).filter((v) => v && ID_OK.test(v.id));
  } catch (err) { console.error('no manifest', err); manifest = [{ id: 'notebook', home: true }]; }
  const homeEntry = manifest.find((v) => v.home) || { id: 'notebook', home: true };
  if (!manifest.includes(homeEntry)) manifest.unshift(homeEntry);
  buildMenu();
  homeDef = await loadVerse(homeEntry.id);
  hud.best(run.best);
  onResize();
  homeCtx = makeCtx(homeDef);
  home = homeDef.create(homeCtx.ctx);
  if (START && START !== homeEntry.id) {
    if (!manifest.some((v) => v.id === START)) manifest.push({ id: START, hidden: true }); // testing one that isn't listed yet
    hud.score(0);
    await enterVerse(START, [innerWidth / 2, innerHeight / 2]);
  } else setCurrent(homeDef, home, homeCtx.ctx, homeCtx.visit);
  // load the rest in the background so portals open instantly
  setTimeout(() => away().forEach((v) => loadVerse(v.id).catch((err) => console.error(err))), 1500);
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  updateAdd();
  updateNext();
  if (tunnel) { wormhole.update(dt); renderer.render(wormhole.scene, wormhole.camera); return; }
  if (!cur) return;
  if (cur.inst.showsStick) input.ring = !warping && cur.inst.showsStick();
  else input.ring = !warping && cur.inst.ring !== false;
  if (!input.ring && el.stick.classList.contains('on')) core.hideStick();
  else if (input.ring && input.active && !el.stick.classList.contains('on')) core.showStick();
  try { cur.inst.update(dt); } catch (err) { onCrash(err); return; }
  renderer.render(cur.inst.scene, cur.inst.camera);
  if (!window.__sReady) {
    window.__sReady = true;
    const fb = document.getElementById('fallback');
    if (fb) fb.hidden = true;
  }
});

boot().catch((err) => { console.error(err); window.__sFallback("the S couldn't load.\ntry reloading?"); });

// handy for poking at it from the console (and for the tests)
window.__s = {
  run,
  get verse() { return cur ? cur.def.id : null; },
  get warping() { return warping; },
  get replay() { return replay; },
  get tunnel() { return tunnel; },
  get over() { return overShown; },
  get home() { return home && home.debug ? home.debug() : null; },
  get inst() { return cur ? cur.inst : null; },
  get manifest() { return manifest; },
  go: (id) => enterVerse(id, [innerWidth / 2, innerHeight / 2]),
  _finish: (result) => { if (cur && !cur.def.home) cur.ctx.finish(result); },
};
