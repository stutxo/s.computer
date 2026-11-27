// The engine every s-verse shares: renderer, input, sound, HUD, particles, the googly-eyed ball, camera framing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BALL_R, clamp } from './shared.js';

export { THREE };
export const $ = (id) => document.getElementById(id);
export const coarse = matchMedia('(pointer: coarse)').matches;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const lowEnd = Math.min(screen.width, screen.height) < 500 || (navigator.hardwareConcurrency || 8) <= 4;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
export const ZERO2 = [0, 0];
export const HAND = '"Gochi Hand", "Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';

export const el = {};
for (const id of ['c', 'score', 'status', 'best', 'title', 'cta', 'keys', 'over', 'grade', 'remark', 'reason', 'tally',
  'bestline', 'trip', 'again', 'share', 'stick', 'knob', 'mute', 'pops', 'warp', 'card', 'cardNum', 'cardName', 'cardVerb', 'flash']) el[id] = $(id);

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { /* private mode */ } },
};

/* ---------- renderer ---------- */

export const renderer = new THREE.WebGLRenderer({ canvas: el.c, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.02;
export const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

let envTex = null;
export function envTexture() {
  if (!envTex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envTex;
}

export function canvasTexture(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

// free an s-verse's GPU memory when you leave it (the shared environment map and googly-eye materials stay)
export function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData.keep) continue;
      for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k] && m[k] !== envTex) m[k].dispose();
      m.dispose();
    }
  });
}

/* ---------- sound: everything is synthesized ---------- */

export const audio = (() => {
  let ctx = null, master = null, rollGain = null, rollFilter = null, noiseBuf = null;
  let muted = store.get('s.muted') === '1';
  let loopTimer = null, loopFn = null, loopNext = 0, loopStep = 0, loopDt = 0.125;
  const VOL = 0.7;
  const live = () => ctx && !muted && ctx.state === 'running';
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      rollFilter = ctx.createBiquadFilter(); rollFilter.type = 'lowpass'; rollFilter.frequency.value = 300; rollFilter.Q.value = 0.7;
      rollGain = ctx.createGain(); rollGain.gain.value = 0;
      src.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(master);
      src.start();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (_) { ctx = null; }
  }
  function tone(f0, f1, dur, { type = 'sine', vol = 0.25, delay = 0, at = 0, attack = 0.004, vib = 0, vibRate = 7 } = {}) {
    if (!live()) return;
    const t0 = at || ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    if (vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = vibRate; lg.gain.value = vib;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, { vol = 0.2, freq = 1200, f1 = 0, q = 1, type = 'bandpass', delay = 0, at = 0 } = {}) {
    if (!live()) return;
    const t0 = at || ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }
  // a held note you can steer (the kart engine)
  function drone({ type = 'sawtooth', freq = 60, cutoff = 500 } = {}) {
    if (!ctx) return { set() {}, stop() {} };
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(master);
    o.start();
    return {
      set(fr, vol, cut) {
        const t = ctx.currentTime;
        o.frequency.setTargetAtTime(fr, t, 0.05);
        g.gain.setTargetAtTime(muted ? 0 : vol, t, 0.06);
        if (cut) f.frequency.setTargetAtTime(cut, t, 0.05);
      },
      stop() { const t = ctx.currentTime; g.gain.setTargetAtTime(0, t, 0.04); o.stop(t + 0.4); },
    };
  }
  // tiny step sequencer: fn(step, when) is called for every 16th note
  function startLoop(bpm, fn) {
    stopLoop();
    if (!ctx) return;
    loopFn = fn; loopDt = 60 / bpm / 4; loopStep = 0; loopNext = ctx.currentTime + 0.06;
    loopTimer = setInterval(() => {
      if (!ctx || !loopFn) return;
      if (loopNext < ctx.currentTime - 0.5) loopNext = ctx.currentTime + 0.05; // tab was asleep
      while (loopNext < ctx.currentTime + 0.12) { if (live()) loopFn(loopStep, loopNext); loopStep++; loopNext += loopDt; }
    }, 25);
  }
  function stopLoop() { if (loopTimer) clearInterval(loopTimer); loopTimer = null; loopFn = null; }
  return {
    init, tone, noise, drone, startLoop, stopLoop,
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      store.set('s.muted', m ? '1' : '0');
      if (master) master.gain.setTargetAtTime(m ? 0 : VOL, ctx.currentTime, 0.02);
    },
    roll(speed) {
      if (!ctx || !rollGain) return;
      const t = ctx.currentTime;
      rollGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.09, speed * 0.011), t, 0.05);
      rollFilter.frequency.setTargetAtTime(180 + speed * 70, t, 0.05);
    },
    collect(n) {
      const f = 660 * Math.pow(2, Math.min(n, 24) / 24);
      tone(f, f, 0.12, { type: 'triangle', vol: 0.22 });
      tone(f * 1.5, f * 1.5, 0.2, { type: 'triangle', vol: 0.2, delay: 0.07 });
      tone(f * 3, f * 3, 0.12, { vol: 0.05, delay: 0.07 });
    },
    bonk(s) {
      const v = Math.min(1, s / 7);
      tone(210 + v * 70, 70, 0.12, { vol: 0.07 + v * 0.22 });
      noise(0.03, { vol: 0.04 + v * 0.1, freq: 1800, q: 0.8 });
    },
    hop() { tone(260, 820, 0.22, { type: 'triangle', vol: 0.2, vib: 40, vibRate: 18 }); },
    boing() { tone(180, 520, 0.3, { type: 'triangle', vol: 0.22, vib: 60, vibRate: 22 }); },
    whistle() { tone(1500, 240, 1.3, { vol: 0.15, vib: 22, vibRate: 7 }); },
    thud(s) {
      const v = Math.min(1, s / 12);
      tone(140, 55, 0.16, { vol: 0.1 + v * 0.25 });
      noise(0.05, { vol: 0.05 + v * 0.1, freq: 600, q: 0.7 });
    },
    tick() { tone(1900, 1900, 0.025, { type: 'square', vol: 0.03 }); },
    sad() { [392, 370, 349, 330].forEach((f, i) => tone(f, f * 0.97, i === 3 ? 0.8 : 0.28, { type: 'sawtooth', vol: 0.055, delay: 0.15 + i * 0.3, vib: i === 3 ? 7 : 0, vibRate: 5 })); },
    tada() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.24, { type: 'triangle', vol: 0.15, delay: i * 0.08 })); },
    portalOpen() { [330, 415, 494, 659, 831].forEach((f, i) => tone(f, f * 1.01, 0.5, { type: 'sine', vol: 0.09, delay: i * 0.06, vib: 9, vibRate: 6 })); },
    warp() {
      noise(1.1, { vol: 0.25, freq: 200, f1: 5000, q: 2 });
      tone(110, 880, 1.0, { type: 'sawtooth', vol: 0.06, vib: 30, vibRate: 11 });
      tone(165, 1320, 1.0, { type: 'triangle', vol: 0.07, vib: 20, vibRate: 7, delay: 0.05 });
    },
    arrive() { noise(0.6, { vol: 0.15, freq: 4000, f1: 300, q: 1.5 }); tone(880, 220, 0.5, { type: 'triangle', vol: 0.08 }); },
  };
})();

export const haptic = (ms) => { if (navigator.vibrate && !audio.muted) { try { navigator.vibrate(ms); } catch (_) { /* ignore */ } } };

/* ---------- input: drag anywhere (a floating joystick), or arrow keys ---------- */

// sx/sy: where the finger went down; ox/oy: the joystick's center (it gets dragged along); nx/ny: -1..1
export const input = {
  active: false, id: -1, sx: 0, sy: 0, ox: 0, oy: 0, x: 0, y: 0, nx: 0, ny: 0, R: 70,
  ring: true,                   // show the drag circle (s-verses with their own aiming UI turn this off)
  onPress: null, onRelease: null, onKey: null,
};
export const keys = { l: 0, r: 0, u: 0, d: 0 };

export function readStick() {
  let x = input.nx, y = input.ny;
  if (!input.active) { x = keys.r - keys.l; y = keys.d - keys.u; }
  let m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; m = 1; }
  if (m < 0.05) return ZERO2;
  const k = (m - 0.05) / 0.95 / m;
  return [x * k, y * k];
}
export function showStick() {
  if (!input.ring || !input.active) return;
  el.stick.style.setProperty('--r2', `${input.R * 2}px`);
  el.stick.classList.add('on');
  moveStick();
}
function moveStick() {
  el.stick.style.transform = `translate(${input.ox}px, ${input.oy}px)`;
  el.knob.style.transform = `translate(${input.nx * input.R}px, ${input.ny * input.R}px)`;
}
export function hideStick() { el.stick.classList.remove('on'); }
export function releaseStick(e) {
  if (e && e.pointerId !== undefined && e.pointerId !== input.id) return;
  const was = input.active;
  input.active = false; input.nx = input.ny = 0; input.id = -1;
  hideStick();
  if (was && e && input.onRelease) input.onRelease(e);
}

window.addEventListener('pointerdown', (e) => {
  if (e.target && e.target.closest && e.target.closest('button, a')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  audio.init();
  if (input.active) return;
  input.active = true; input.id = e.pointerId;
  input.sx = input.ox = input.x = e.clientX; input.sy = input.oy = input.y = e.clientY;
  input.nx = input.ny = 0;
  try { el.c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  if (input.onPress) input.onPress(e);
  showStick();
}, { passive: false });

window.addEventListener('pointermove', (e) => {
  if (!input.active || e.pointerId !== input.id) return;
  input.x = e.clientX; input.y = e.clientY;
  let dx = e.clientX - input.ox, dy = e.clientY - input.oy;
  const d = Math.hypot(dx, dy);
  if (d > input.R) { // drag the circle along so reversing direction is instant
    const k = 1 - input.R / d;
    input.ox += dx * k; input.oy += dy * k;
    dx = e.clientX - input.ox; dy = e.clientY - input.oy;
  }
  input.nx = dx / input.R; input.ny = dy / input.R;
  if (el.stick.classList.contains('on')) moveStick();
});
window.addEventListener('pointerup', (e) => { audio.init(); releaseStick(e); });
window.addEventListener('pointercancel', releaseStick);
el.c.addEventListener('lostpointercapture', releaseStick);
window.addEventListener('blur', () => { releaseStick(); keys.l = keys.r = keys.u = keys.d = 0; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = KEYMAP[e.code];
  if (k) { e.preventDefault(); keys[k] = 1; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if ((e.code === 'Space' || e.code === 'Enter') && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
  if (k || e.code === 'Space' || e.code === 'Enter') {
    if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight' && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') e.preventDefault();
    audio.init();
    if (input.onKey) input.onKey(e, k);
  }
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = 0; if (input.onKey) input.onKey(e, k, true); });

export function toggleMute() {
  audio.init();
  audio.setMuted(!audio.muted);
  syncMute();
}
function syncMute() {
  el.mute.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  el.mute.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
}
el.mute.addEventListener('pointerdown', (e) => e.stopPropagation());
el.mute.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
syncMute();

/* ---------- HUD ---------- */

const _pv = new THREE.Vector3();
let flashAnim = null;
export const hud = {
  score(n, bump) {
    el.score.textContent = String(n);
    el.score.classList.add('on');
    if (bump) { el.score.classList.remove('bump'); void el.score.offsetWidth; el.score.classList.add('bump'); }
  },
  hideScore() { el.score.classList.remove('on'); },
  status(text) { el.status.textContent = text || ''; },
  best(n) { el.best.textContent = n > 0 ? `best ${n}` : ''; },
  theme(id) { document.body.dataset.verse = id; },
  // pop a little word at a 3D point
  pop(text, x, y, z, camera, cls) {
    _pv.set(x, y, z).project(camera);
    if (_pv.z > 1) return;
    hud.popXY(text, (_pv.x * 0.5 + 0.5) * innerWidth, (-_pv.y * 0.5 + 0.5) * innerHeight, cls);
  },
  popXY(text, px, py, cls) {
    const d = document.createElement('div');
    d.className = cls ? `pop ${cls}` : 'pop';
    d.textContent = text;
    d.style.left = `${px.toFixed(1)}px`;
    d.style.top = `${py.toFixed(1)}px`;
    el.pops.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  },
  flash(color = 'rgba(255,255,255,0.8)', ms = 220) {
    if (reduceMotion) return;
    el.flash.style.background = color;
    if (flashAnim) flashAnim.cancel();
    flashAnim = el.flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  },
};

/* ---------- confetti / sparks (one pool per scene) ---------- */

const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
export function makeParticles(scene, PN = 320, floorY = -1e9) {
  const P = {
    life: new Float32Array(PN), max: new Float32Array(PN), pos: new Float32Array(PN * 3), vel: new Float32Array(PN * 3),
    axis: new Float32Array(PN * 3), ang: new Float32Array(PN), spin: new Float32Array(PN), size: new Float32Array(PN),
    grav: new Float32Array(PN), drag: new Float32Array(PN), next: 0, colorDirty: false, live: 0,
  };
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }), PN);
  mesh.frustumCulled = false;
  const c = new THREE.Color(0xffffff), q = new THREE.Quaternion(), a = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3(), m = new THREE.Matrix4();
  for (let i = 0; i < PN; i++) { mesh.setMatrixAt(i, ZERO_M); mesh.setColorAt(i, c); }
  scene.add(mesh);
  function spawn(x, y, z, vx, vy, vz, color, size, life, grav = 9, drag = 1.2) {
    const i = P.next;
    P.next = (P.next + 1) % PN;
    const j = i * 3;
    P.pos[j] = x; P.pos[j + 1] = y; P.pos[j + 2] = z;
    P.vel[j] = vx; P.vel[j + 1] = vy; P.vel[j + 2] = vz;
    a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    P.axis[j] = a.x; P.axis[j + 1] = a.y; P.axis[j + 2] = a.z;
    P.ang[i] = Math.random() * 6.28; P.spin[i] = 4 + Math.random() * 10;
    P.size[i] = size; P.life[i] = P.max[i] = life; P.grav[i] = grav; P.drag[i] = drag;
    mesh.setColorAt(i, c.set(color));
    P.colorDirty = true;
  }
  function burst(x, y, z, n, colors, speed, up, size, life, grav = 9) {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.6);
      spawn(x, y, z, Math.cos(ang) * sp, up * (0.5 + Math.random() * 0.7), Math.sin(ang) * sp, pick(colors), size * (0.7 + Math.random() * 0.6), life * (0.7 + Math.random() * 0.5), grav, 1.2);
    }
  }
  function update(dt) {
    let alive = 0;
    for (let i = 0; i < PN; i++) {
      if (P.life[i] <= 0) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) { mesh.setMatrixAt(i, ZERO_M); continue; }
      alive++;
      const j = i * 3, k = Math.exp(-P.drag[i] * dt);
      P.vel[j + 1] -= P.grav[i] * dt;
      P.vel[j] *= k; P.vel[j + 1] *= k; P.vel[j + 2] *= k;
      P.pos[j] += P.vel[j] * dt; P.pos[j + 1] += P.vel[j + 1] * dt; P.pos[j + 2] += P.vel[j + 2] * dt;
      if (P.pos[j + 1] < floorY) { P.pos[j + 1] = floorY; P.vel[j] = P.vel[j + 1] = P.vel[j + 2] = 0; P.spin[i] = 0; }
      P.ang[i] += P.spin[i] * dt;
      const sz = P.size[i] * Math.min(1, (P.life[i] / P.max[i]) * 4);
      a.set(P.axis[j], P.axis[j + 1], P.axis[j + 2]);
      q.setFromAxisAngle(a, P.ang[i]);
      mesh.setMatrixAt(i, m.compose(p.set(P.pos[j], P.pos[j + 1], P.pos[j + 2]), q, s.set(sz, sz, sz)));
    }
    if (alive || P.live) mesh.instanceMatrix.needsUpdate = true;
    P.live = alive;
    if (P.colorDirty) { mesh.instanceColor.needsUpdate = true; P.colorDirty = false; }
  }
  return { spawn, burst, update, mesh };
}

/* ---------- the googly-eyed ball ---------- */

const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x15151f, roughness: 0.3 });
const mouthMat = new THREE.MeshStandardMaterial({ color: 0x4d0a2b, roughness: 0.5 });
eyeMat.userData.keep = pupilMat.userData.keep = mouthMat.userData.keep = true; // shared by every googly
const Z_FWD = new THREE.Vector3(0, 0, 1);

export function ballTexture(base = '#ff4f93', band = '#ff86b8', stripe = '#ffe0ec') {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = band; g.fillRect(0, h * 0.43, w, h * 0.14);
    g.fillStyle = stripe; g.fillRect(0, h * 0.485, w, h * 0.03);
  });
}

// faceUp: which world direction is "up" on screen for this s-verse's camera
export function makeGoogly({ radius = BALL_R, material, faceUp = [0, 0, -1], castShadow = true, body = true } = {}) {
  const k = radius / BALL_R;
  const root = new THREE.Group(), squash = new THREE.Group(), face = new THREE.Group();
  root.add(squash);
  let bodyMesh = null;
  if (body) {
    bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), material || new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15, envMapIntensity: 0.8, emissive: 0xff2200, emissiveIntensity: 0 }));
    bodyMesh.castShadow = castShadow;
    squash.add(bodyMesh);
  }
  face.up.set(faceUp[0], faceUp[1], faceUp[2]);
  squash.add(face);
  const EYE_R = 0.115 * k, PUPIL_R = 0.058 * k, PUPIL_MAX = EYE_R - PUPIL_R - 0.005 * k;
  const eyeGeo = new THREE.SphereGeometry(EYE_R, 24, 16), pupilGeo = new THREE.SphereGeometry(PUPIL_R, 16, 12);
  const eyes = [-1, 1].map((side) => {
    const dir = new THREE.Vector3(0.37 * side, 0.26, 1).normalize();
    const g = new THREE.Group();
    g.position.copy(dir).multiplyScalar(radius * 0.97);
    g.quaternion.setFromUnitVectors(Z_FWD, dir);
    const white = new THREE.Mesh(eyeGeo, eyeMat);
    white.scale.set(1, 1, 0.55);
    white.castShadow = castShadow;
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.scale.set(1, 1, 0.35);
    pupil.position.z = EYE_R * 0.55;
    g.add(white, pupil);
    face.add(g);
    return { g, pupil, side, px: 0, py: -0.02 * k, vx: 0, vy: 0 };
  });
  const mouthDir = new THREE.Vector3(0, -0.34, 1).normalize();
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075 * k, 0.021 * k, 8, 24, Math.PI), mouthMat);
  smile.position.copy(mouthDir).multiplyScalar(radius * 0.99);
  smile.quaternion.setFromUnitVectors(Z_FWD, mouthDir);
  smile.rotateZ(Math.PI);
  const ooh = new THREE.Mesh(new THREE.TorusGeometry(0.05 * k, 0.022 * k, 8, 24), mouthMat);
  ooh.position.copy(smile.position);
  ooh.quaternion.copy(smile.quaternion);
  ooh.visible = false;
  face.add(smile, ooh);

  const prev = [0, 0, 0], sq = { y: 0, v: 0 };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), qi = new THREE.Quaternion(), f = new THREE.Vector3();
  let happyT = 0, blinkT = 1 + Math.random() * 2, dizzyT = 0;
  const g = {
    root, squash, body: bodyMesh, face, eyes, smile, ooh, radius,
    kick(amount) { sq.v += amount; },
    happy(t = 0.45) { happyT = t; },
    // vel: world velocity [x,y,z]; look: point the face looks toward (usually the camera)
    update(dt, vel, look, { scared = false, dizzy = false, lean = 0.13, squashFloor = true } = {}) {
      sq.v += (-sq.y * 280 - sq.v * 17) * dt;
      sq.y = clamp(sq.y + sq.v * dt, -0.35, 0.45);
      squash.scale.set(1 + sq.y * 0.5, 1 - sq.y, 1 + sq.y * 0.5);
      squash.position.y = squashFloor ? -sq.y * radius : 0;

      v1.copy(look).sub(root.position).normalize();
      const hs = Math.hypot(vel[0], vel[2]);
      if (hs > 0.05 && lean > 0) { v2.set(vel[0] / hs, 0, vel[2] / hs); v1.addScaledVector(v2, Math.min(0.65, hs * lean)).normalize(); }
      face.lookAt(v3.copy(root.position).add(v1));

      const inv = 1 / Math.max(dt, 1e-3);
      let ax = (vel[0] - prev[0]) * inv, ay = (vel[1] - prev[1]) * inv, az = (vel[2] - prev[2]) * inv;
      prev[0] = vel[0]; prev[1] = vel[1]; prev[2] = vel[2];
      const am = Math.hypot(ax, ay, az);
      if (am > 500) { const kk = 500 / am; ax *= kk; ay *= kk; az *= kk; }

      happyT -= dt; blinkT -= dt;
      if (blinkT < -0.12) blinkT = 2 + Math.random() * 3.5;
      dizzyT = dizzy ? dizzyT + dt : 0;
      const happy = happyT > 0 && !scared;
      const open = happy ? 0.22 : blinkT < 0 ? 0.1 : scared ? 1.18 : 1;
      smile.visible = !scared && !dizzy;
      ooh.visible = !smile.visible;
      ooh.scale.setScalar(dizzy ? 0.7 : 1);
      for (const e of eyes) {
        const s = e.g.scale;
        s.y = lerp(s.y, open, 1 - Math.exp(-25 * dt));
        s.x = lerp(s.x, scared ? 1.12 : 1, 1 - Math.exp(-12 * dt));
        e.pupil.visible = s.y > 0.4;
        if (dizzy) {
          const ang = dizzyT * 9 * e.side;
          e.px = Math.cos(ang) * PUPIL_MAX * 0.8; e.py = Math.sin(ang) * PUPIL_MAX * 0.8;
        } else {
          // googly physics: the pupil is a loose weight inside the eye, pushed by gravity and the ball's acceleration
          e.g.getWorldQuaternion(qi).invert();
          f.set(-ax, -9.8 - ay, -az).applyQuaternion(qi);
          e.vx += f.x * dt; e.vy += f.y * dt;
          const kk = Math.exp(-3 * dt);
          e.vx *= kk; e.vy *= kk;
          e.px += e.vx * dt; e.py += e.vy * dt;
          const r = Math.hypot(e.px, e.py);
          if (r > PUPIL_MAX) {
            const nx = e.px / r, ny = e.py / r;
            e.px = nx * PUPIL_MAX; e.py = ny * PUPIL_MAX;
            const vn = e.vx * nx + e.vy * ny;
            if (vn > 0) { e.vx -= 1.55 * vn * nx; e.vy -= 1.55 * vn * ny; }
          }
        }
        const rr = Math.min(1, Math.hypot(e.px, e.py) / EYE_R);
        e.pupil.position.set(e.px, e.py, EYE_R * 0.55 * Math.sqrt(1 - rr * rr) - 0.004 * k);
      }
    },
  };
  return g;
}

/* ---------- camera framing: fit a set of points on any screen ---------- */

const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;height:env(safe-area-inset-top,0px);width:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
document.body.appendChild(probe);
export function safeInsets() { const r = probe.getBoundingClientRect(); return { top: r.height, bottom: r.width }; }

const _fv = new THREE.Vector3();
// Finds the camera distance (and a small vertical shift) that fits `pts` between the HUD and the bottom edge.
export function fitPerspective(camera, pts, { pitch, topPx = 86, botPx = 16, sidePx = 12, fovTall = 40, fovWide = 34, center = [0, 0, 0] } = {}) {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  camera.aspect = aspect;
  camera.fov = aspect < 0.8 ? fovTall : fovWide;
  camera.updateProjectionMatrix();
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const camUp = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch));
  const ins = safeInsets();
  const yTop = 1 - (2 * ((w >= 900 ? topPx + 10 : topPx) + ins.top)) / h, yBot = -1 + (2 * (botPx + ins.bottom)) / h, xLim = 1 - (2 * sidePx) / w;
  const target = new THREE.Vector3(center[0], center[1], center[2]);
  const place = (d) => { camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld(); };
  const bounds = () => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      _fv.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (_fv.z > -camera.near) return null;
      _fv.copy(p).project(camera);
      x0 = Math.min(x0, _fv.x); x1 = Math.max(x1, _fv.x); y0 = Math.min(y0, _fv.y); y1 = Math.max(y1, _fv.y);
    }
    return { x0, x1, y0, y1 };
  };
  let dist = 20;
  for (let it = 0; it < 4; it++) {
    let lo = 3, hi = 200;
    for (let k = 0; k < 32; k++) {
      const mid = (lo + hi) / 2;
      place(mid);
      const b = bounds();
      if (b && b.x1 - b.x0 <= 2 * xLim && b.y1 - b.y0 <= yTop - yBot) hi = mid; else lo = mid;
    }
    dist = hi;
    place(dist);
    const b = bounds();
    if (!b) break;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    target.addScaledVector(camUp, ((b.y0 + b.y1) / 2 - (yTop + yBot) / 2) * halfH);
  }
  return { target, dir, dist };
}

// outline points of the S (padded, at a couple of heights) for framing anything S-shaped
export function sFitPoints(OUTLINE, pad = 0.45, ys = [-0.75, 0.6], extra = 1.3) {
  const pts = [];
  for (const [x, z] of OUTLINE) {
    const l = Math.hypot(x, z) || 1, kk = (l + pad) / l;
    for (const y of ys) pts.push(new THREE.Vector3(x * kk, y, z * kk));
  }
  if (extra) for (const z of [-5.5, 5.5]) for (const y of [-extra, extra]) pts.push(new THREE.Vector3(0, y, z));
  return pts;
}

// a little Cool S, extruded (gold tokens, invaders, decorations)
export function miniSGeometry(OUTLINE, INNER, scale, depth = 0.08, bevel = 0.022) {
  const shape = new THREE.Shape();
  OUTLINE.forEach(([x, z], i) => (i ? shape.lineTo(x * scale, -z * scale) : shape.moveTo(x * scale, -z * scale)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel * 1.2, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  geo.center();
  const bars = INNER.map((w) => {
    const x0 = w.ax * scale, y0 = -w.az * scale, x1 = w.bx * scale, y1 = -w.bz * scale;
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, len: Math.hypot(x1 - x0, y1 - y0), ang: Math.atan2(y1 - y0, x1 - x0) };
  });
  return { geo, bars, thickness: depth + bevel * 2.4 };
}
