// s-verse #4: S-Invaders. Rows of little Cool S's march back and forth and down, the way they did in 1978.
// Your cannon fires by itself; drag left and right (or hold the arrow keys) to aim and dodge their s-bombs.
// Hide behind the bunkers (Cool S's lying on their side). Shoot the gold mothership for a bonus.
// Clear the wave and a wormhole opens at the right end of your lane: drive into it to go on, or take on the next wave.
// Lose all 3 lives (or let them land) and you start again.

export default {
  id: 'invaders',
  name: 'S-Invaders',
  verb: 'defend the S!',
  author: 'stutxo',
  theme: { font: 'Press Start 2P', ink: '#7dff6b', glow: '#1fbf0f', card: '#050805', cardInk: '#7dff6b', accent: '#ff4fd8', stick: '#7dff6b', hudScale: 0.5, crt: true },
  create(ctx) { return createInvaders(ctx); },
};

const COLS = 5, ROWS = 3, TOTAL = COLS * ROWS;
const HALF = 4.3;                 // how far left and right things can go
const PLAYER_Z = 6.1, BUNKER_Z = 4.35, LAND_Z = 5.3;
const COL_GAP = 1.1, ROW_GAP = 1.2, STEP_X = 0.24, DROP = 0.42;
const ROW_COLORS = [0xff4fd8, 0x4ff3ff, 0xfff04a];
const KILLS_PER_S = 3;            // a gold s for every 3 invaders
const BEAT = [98, 92.5, 87.3, 82.4]; // the heartbeat that speeds up as they thin out
const WORM_X = HALF - 0.1;       // the wormhole: at the right end of your lane, just past where you can normally go

function createInvaders(ctx) {
  const { THREE, S, audio, hud } = ctx;
  const { clamp } = S;
  const { lerp, pick, easeOutBack } = ctx;
  const hard = Math.min(ctx.loop, 3);

  /* ---------- scene ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020403);
  scene.fog = new THREE.Fog(0x020403, 18, 42);
  scene.environment = ctx.envTexture();
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0x9effa0, 0x101010, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 10, 6);
  scene.add(key);

  const gridTex = ctx.canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#020403'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,255,90,0.22)';
    g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  });
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(30, 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: gridTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  scene.add(floor);

  // a giant neon Cool S on the floor, behind everything
  const BIG = 1.22;
  const tube = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const core = new THREE.InstancedMesh(tube, new THREE.MeshBasicMaterial({ color: 0xffc4f4, toneMapped: false }), S.STROKES.length);
  const glow = new THREE.InstancedMesh(tube, new THREE.MeshBasicMaterial({ color: 0xff2fd0, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }), S.STROKES.length);
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    S.STROKES.forEach((w, i) => {
      q.setFromUnitVectors(Y, d.set(w.dx, 0, w.dz).normalize());
      p.set(((w.ax + w.bx) / 2) * BIG, -0.02, ((w.az + w.bz) / 2) * BIG);
      core.setMatrixAt(i, m4.compose(p, q, s.set(0.035, w.len * BIG + 0.07, 0.035)));
      glow.setMatrixAt(i, m4.compose(p, q, s.set(0.16, w.len * BIG + 0.3, 0.16)));
    });
  }
  scene.add(core, glow);

  /* ---------- the invaders ---------- */
  const mini = ctx.miniS(0.095, 0.12, 0.03);
  const geo = mini.geo.rotateX(-Math.PI / 2); // lying flat, its top toward the top of the screen
  // toneMapped: false lets the neon go properly bright instead of getting squashed to pastel
  const rowMats = ROW_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.75, roughness: 0.35, metalness: 0.1, toneMapped: false }));
  const form = { x: 0, z: -5.6, dir: 1, frame: 0 };
  const inv = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const mesh = new THREE.Mesh(geo, rowMats[r]);
    scene.add(mesh);
    inv.push({ r, c, mesh, alive: true, x: 0, z: 0, die: 0, spin: 0 });
  }
  const placeInv = (v) => { v.x = form.x + (v.c - (COLS - 1) / 2) * COL_GAP; v.z = form.z + v.r * ROW_GAP; };
  inv.forEach(placeInv);

  /* ---------- bunkers: Cool S's lying on their side, made of blocks you can shoot through ---------- */
  const CELL = 0.12, BK = 0.17, BUNKERS = [-2.85, 0, 2.85];
  const cells = [];
  for (const bx of BUNKERS) {
    for (let i = 0; i < 15; i++) for (let j = 0; j < 7; j++) {
      const u = (i - 7) * CELL, v = (j - 3) * CELL;
      if (S.pointInS(v / BK, u / BK)) cells.push({ x: bx + u, z: BUNKER_Z + v, alive: true });
    }
  }
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.92, 0.2, CELL * 0.92), new THREE.MeshStandardMaterial({ color: 0x7dff6b, emissive: 0x2bd12b, emissiveIntensity: 0.6, roughness: 0.6, toneMapped: false }), cells.length);
  const m4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _q = new THREE.Quaternion(), ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  cells.forEach((c, k) => blocks.setMatrixAt(k, m4.compose(_p.set(c.x, 0.1, c.z), _q, _s)));
  scene.add(blocks);
  function cellAt(x, z) {
    for (let b = 0; b < BUNKERS.length; b++) {
      if (Math.abs(x - BUNKERS[b]) > 1.0 || Math.abs(z - BUNKER_Z) > 0.42) continue;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        if (c.alive && Math.abs(c.x - x) < CELL * 0.6 && Math.abs(c.z - z) < CELL * 0.6) return k;
      }
    }
    return -1;
  }
  function chip(k, n = 2) {
    const c = cells[k];
    const kill = (j) => { cells[j].alive = false; blocks.setMatrixAt(j, ZERO_M); };
    kill(k);
    // knock out a couple of neighbors too, so it erodes like the real thing
    for (let t = 0; t < n; t++) {
      const j = cells.findIndex((o) => o.alive && Math.hypot(o.x - c.x, o.z - c.z) < CELL * 1.6 && Math.random() < 0.6);
      if (j >= 0) kill(j);
    }
    blocks.instanceMatrix.needsUpdate = true;
    fx.burst(c.x, 0.2, c.z, 5, [0x7dff6b, 0xb9ffb0], 1.6, 1.4, 0.05, 0.35, 6);
  }

  /* ---------- you: the googly ball in a cannon ---------- */
  const cannon = new THREE.Group();
  {
    const green = new THREE.MeshStandardMaterial({ color: 0x2bd12b, emissive: 0x1a8f1a, emissiveIntensity: 0.4, roughness: 0.4 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.5), green);
    base.position.y = 0.11;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 12).rotateX(Math.PI / 2), green);
    barrel.position.set(0, 0.3, -0.42);
    cannon.add(base, barrel);
  }
  scene.add(cannon);
  const googly = ctx.makeGoogly({ radius: 0.3, faceUp: [0, 0, -1], castShadow: false });
  scene.add(googly.root);

  /* ---------- the mothership: a big gold Cool S with googly eyes ---------- */
  const shipGeo = ctx.miniS(0.16, 0.16, 0.04).geo.rotateX(-Math.PI / 2);
  const ship = new THREE.Mesh(shipGeo, new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.6, roughness: 0.25, emissive: 0xffa000, emissiveIntensity: 0.7, envMapIntensity: 1.6, toneMapped: false }));
  ship.visible = false;
  scene.add(ship);
  const shipEyes = ctx.makeGoogly({ radius: 0.34, body: false, faceUp: [0, 0, -1], castShadow: false });
  shipEyes.root.visible = false;
  scene.add(shipEyes.root);
  const UFO = { on: false, x: 0, dir: 1, t: 9 + Math.random() * 4, z: -7.05 };

  /* ---------- projectiles ---------- */
  const shotGeo = new THREE.BoxGeometry(0.07, 0.07, 0.42);
  const shotMat = new THREE.MeshBasicMaterial({ color: 0xeaffea, toneMapped: false });
  const shots = [0, 1].map(() => { const m = new THREE.Mesh(shotGeo, shotMat); m.visible = false; scene.add(m); return { m, on: false, x: 0, z: 0 }; });
  const bombGeo = ctx.miniS(0.035, 0.04, 0.01).geo.rotateX(-Math.PI / 2);
  const bombMat = new THREE.MeshBasicMaterial({ color: 0xff4f4f, toneMapped: false });
  const bombs = [0, 1, 2, 3, 4, 5].map(() => { const m = new THREE.Mesh(bombGeo, bombMat); m.visible = false; scene.add(m); return { m, on: false, x: 0, z: 0, v: 0 }; });
  const fx = ctx.makeParticles(scene, 360, -0.04);

  // the wormhole: it opens at the end of your lane when you clear a wave (or time's up), and stays open
  const portal = ctx.makeWormhole({ radius: 0.5 });
  scene.add(portal.root);

  /* ---------- camera ---------- */
  const FIT = [];
  for (const x of [-HALF - 0.3, HALF + 0.3]) for (const z of [-7.6, 6.7]) for (const y of [0, 0.7]) FIT.push(new THREE.Vector3(x, y, z));
  let fit = null, pxPerUnit = 60, shake = 0;
  const camT = new THREE.Vector3(), _sh = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
  function resize() {
    fit = ctx.fitPerspective(camera, FIT, { pitch: THREE.MathUtils.degToRad(72), fovTall: 38, fovWide: 32 });
    camera.position.copy(fit.target).addScaledVector(fit.dir, fit.dist);
    camera.lookAt(fit.target);
    camera.updateMatrixWorld();
    pa.set(-1, 0, PLAYER_Z).project(camera); pb.set(1, 0, PLAYER_Z).project(camera);
    pxPerUnit = Math.max(10, ((pb.x - pa.x) / 2) * innerWidth * 0.5);
  }
  resize();

  /* ---------- state ---------- */
  let state = 'intro', stateT = 0, lives = 3, kills = 0, alive = TOTAL, stepT = 0.6, beat = 0;
  let px = 0, targetX = 0, drag = null, fireT = 0.4, bombT = 1.6, invuln = 0, ended = '', wave = 0;
  const setState = (s) => { state = s; stateT = 0; };
  const interval = () => (0.085 + 0.47 * Math.pow(alive / TOTAL, 1.25)) / (1 + hard * 0.15 + Math.min(wave, 4) * 0.08);
  function status() { hud.status(`LIVES ${lives}   ${alive} LEFT`); }

  function march() {
    let lo = Infinity, hi = -Infinity;
    for (const v of inv) if (v.alive) { lo = Math.min(lo, v.x); hi = Math.max(hi, v.x); }
    if ((form.dir > 0 && hi + STEP_X > HALF - 0.25) || (form.dir < 0 && lo - STEP_X < -HALF + 0.25)) { form.z += DROP; form.dir = -form.dir; } else form.x += form.dir * STEP_X;
    form.frame ^= 1;
    const f = BEAT[beat++ % 4];
    audio.tone(f, f * 0.98, 0.09, { type: 'square', vol: 0.11 });
    audio.tone(f * 2, f * 1.96, 0.07, { type: 'square', vol: 0.045 }); // so phone speakers can play it too
    glowPulse = 1;
  }
  let glowPulse = 0;

  function fire() {
    const s = shots.find((o) => !o.on);
    if (!s) return;
    s.on = true; s.x = px; s.z = PLAYER_Z - 0.7;
    s.m.visible = true;
    audio.tone(1400, 320, 0.09, { type: 'square', vol: 0.045 });
    googly.kick(-0.8);
  }

  function dropBomb() {
    const b = bombs.find((o) => !o.on);
    if (!b) return;
    // a bottom invader in a random column (often the one above you)
    const bottoms = [];
    for (let c = 0; c < COLS; c++) { let low = null; for (const v of inv) if (v.alive && v.c === c && (!low || v.r > low.r)) low = v; if (low) bottoms.push(low); }
    if (!bottoms.length) return;
    let src = pick(bottoms);
    if (Math.random() < 0.45) src = bottoms.reduce((a, v) => (Math.abs(v.x - px) < Math.abs(a.x - px) ? v : a), bottoms[0]);
    b.on = true; b.x = src.x; b.z = src.z + 0.5; b.v = 3.6 + hard * 0.5 + (1 - alive / TOTAL) * 1.4;
    b.m.visible = true;
  }

  function killInvader(v) {
    v.alive = false; v.die = 0.001;
    alive--;
    kills++;
    if (kills % KILLS_PER_S === 0) {
      const total = ctx.addScore(1);
      audio.collect(total);
      hud.pop('+1', v.x, 0.6, v.z, camera, 'gold');
    } else hud.pop(pick(['zap', 'pew', 'boom', 'bye']), v.x, 0.6, v.z, camera);
    audio.noise(0.2, { vol: 0.12, freq: 1500, f1: 200, q: 0.8 });
    audio.tone(520, 70, 0.16, { type: 'square', vol: 0.06 });
    ctx.haptic(8);
    fx.burst(v.x, 0.3, v.z, 18, [ROW_COLORS[v.r], 0xffffff], 3, 2, 0.08, 0.5, 6);
    shake = Math.max(shake, 0.04);
    status();
    if (alive === 0) win();
  }

  function hitPlayer() {
    if (invuln > 0 || state !== 'play') return;
    lives--;
    invuln = 1.8;
    status();
    audio.noise(0.6, { vol: 0.2, freq: 700, f1: 120, q: 0.6 });
    audio.tone(300, 60, 0.5, { type: 'sawtooth', vol: 0.08 });
    ctx.haptic(40);
    shake = 0.25;
    hud.flash('rgba(255,60,60,0.35)', 260);
    fx.burst(px, 0.4, PLAYER_Z, 30, [0xff4f93, 0xffffff, 0xff9800], 4, 3, 0.09, 0.7, 6);
    googly.kick(4);
    hud.pop(lives > 0 ? pick(['ouch!', 'oof!', 'hey!']) : 'nooo!', px, 0.9, PLAYER_Z, camera, 'red');
    if (lives <= 0) lose('out of lives');
  }

  function win() {
    setState('won');
    endUFO();
    ctx.addScore(2);
    audio.tada();
    hud.popXY('S-CLEARED!', innerWidth / 2, innerHeight * 0.38, 'big');
    setTimeout(() => hud.popXY('+2', innerWidth / 2, innerHeight * 0.48, 'big gold'), 420);
    hud.flash('rgba(125,255,107,0.3)', 400);
    for (let i = 0; i < 100; i++) fx.spawn((Math.random() - 0.5) * 9, 3 + Math.random() * 3, (Math.random() - 0.5) * 13, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, pick(ROW_COLORS), 0.1, 2.6, 3, 0.9);
    googly.happy(3);
    hud.status('WAVE CLEARED');
  }

  function lose(why) {
    ended = why;
    setState('lost');
    endUFO();
    audio.sad();
    hud.popXY('GAME OVER', innerWidth / 2, innerHeight * 0.4, 'big');
    hud.status(why === 'landed' ? 'THEY LANDED' : 'NO LIVES LEFT');
  }

  // the next wave (after a win) or a fresh start (after a loss); clearing a wave opens the wormhole
  function again() {
    const won = state === 'won';
    if (won) wave++; else { lives = 3; kills = 0; }
    form.x = 0; form.z = -5.6; form.dir = 1; form.frame = 0;
    for (const v of inv) { v.alive = true; v.die = 0; v.mesh.visible = true; v.mesh.scale.setScalar(1); placeInv(v); }
    alive = TOTAL; stepT = 0.6; beat = 0; fireT = 0.4; bombT = 1.6; invuln = 1;
    for (const o of [...shots, ...bombs]) { o.on = false; o.m.visible = false; }
    cells.forEach((c, k) => { c.alive = true; blocks.setMatrixAt(k, m4.compose(_p.set(c.x, 0.1, c.z), _q, _s)); }); // fresh bunkers
    blocks.instanceMatrix.needsUpdate = true;
    endUFO();
    setState('ready');
    hud.status('GET READY');
    hud.popXY(won ? 'NEXT WAVE!' : 'TRY AGAIN!', innerWidth / 2, innerHeight * 0.45, 'big');
    if (won) openWormhole('won');
  }
  function openWormhole(why) {
    if (portal.isOpen) return;
    portal.open(WORM_X, -0.03, PLAYER_Z);
    hud.pop(why === 'time' ? "TIME'S UP! A WORMHOLE!" : 'A WORMHOLE!', WORM_X - 0.6, 0.8, PLAYER_Z - 0.9, camera, 'big');
    setTimeout(() => hud.pop('DRIVE INTO IT TO GO', WORM_X - 0.9, 0.6, PLAYER_Z - 0.4, camera), 1000);
  }
  function enterWormhole() {
    setState('warp');
    endUFO();
    for (const o of [...shots, ...bombs]) { o.on = false; o.m.visible = false; }
    cannon.attach(googly.root); // you go too
    portal.take(cannon); // spirals the cannon in, then sends you on
  }

  /* ---------- simulation ---------- */
  const STEP = 1 / 120;
  let acc = 0;
  function physStep(dt) {
    if (state !== 'play') return;
    // the march
    stepT -= dt;
    if (stepT <= 0) { stepT += interval(); march(); }
    for (const v of inv) if (v.alive) placeInv(v);
    // you
    const k = ctx.keys;
    if (ctx.input.active && drag) targetX = drag.px0 + (ctx.input.x - drag.x0) / pxPerUnit * 1.15;
    else if (k.l || k.r) targetX = px + (k.r - k.l) * 0.6;
    targetX = clamp(targetX, -HALF + 0.4, portal.isOpen ? WORM_X : HALF - 0.4);
    const prev = px;
    px = lerp(px, targetX, 1 - Math.exp(-(ctx.input.active ? 22 : 9) * dt));
    pvx = (px - prev) / dt;
    if (portal.isOpen && px > WORM_X - 0.15) { enterWormhole(); return; }
    fireT -= dt;
    if (fireT <= 0) { fireT = 0.26; fire(); }
    // your shots
    for (const s of shots) {
      if (!s.on) continue;
      s.z -= 16 * dt;
      if (s.z < -8) { s.on = false; continue; }
      const ci = cellAt(s.x, s.z);
      if (ci >= 0) { chip(ci, 1); s.on = false; continue; }
      for (const v of inv) {
        if (v.alive && Math.abs(v.x - s.x) < 0.31 && Math.abs(v.z - s.z) < 0.55) { killInvader(v); s.on = false; break; }
      }
      if (s.on && UFO.on && Math.abs(UFO.x - s.x) < 0.5 && Math.abs(UFO.z - s.z) < 0.85) { s.on = false; shootUFO(); }
      if (s.on) for (const b of bombs) if (b.on && Math.abs(b.x - s.x) < 0.14 && Math.abs(b.z - s.z) < 0.3) { b.on = false; s.on = false; fx.burst(b.x, 0.2, b.z, 6, [0xffffff, 0xff4f4f], 1.5, 1, 0.05, 0.3, 4); break; }
    }
    // their bombs
    bombT -= dt;
    if (bombT <= 0) { bombT = Math.max(0.42, 1.25 - (1 - alive / TOTAL) * 0.55 - hard * 0.12) * (0.7 + Math.random() * 0.6); dropBomb(); }
    for (const b of bombs) {
      if (!b.on) continue;
      b.z += b.v * dt;
      if (b.z > 7.4) { b.on = false; continue; }
      const ci = cellAt(b.x, b.z);
      if (ci >= 0) { chip(ci, 2); b.on = false; continue; }
      if (Math.abs(b.x - px) < 0.42 && Math.abs(b.z - PLAYER_Z) < 0.32) { b.on = false; hitPlayer(); }
    }
    // invaders that reach the bunkers chew through them; reaching the ground is game over
    for (const v of inv) {
      if (!v.alive) continue;
      if (v.z + 0.5 > BUNKER_Z - 0.35) { const ci = cellAt(v.x + (Math.random() - 0.5) * 0.4, v.z + 0.4); if (ci >= 0) chip(ci, 0); }
      if (v.z + 0.45 > LAND_Z) { lose('landed'); return; }
    }
    // the mothership
    UFO.t -= dt;
    if (!UFO.on && UFO.t <= 0 && alive > 3) { UFO.on = true; UFO.dir = Math.random() < 0.5 ? 1 : -1; UFO.x = -UFO.dir * (HALF + 1.2); siren = audio.drone({ type: 'square', freq: 520, cutoff: 1800 }); }
    if (UFO.on) {
      UFO.x += UFO.dir * 2.3 * dt;
      if (Math.abs(UFO.x) > HALF + 1.3) endUFO();
    }
  }
  let pvx = 0, siren = null;
  function endUFO() { UFO.on = false; UFO.t = 10 + Math.random() * 6; if (siren) siren.stop(); siren = null; }
  function shootUFO() {
    const total = ctx.addScore(2);
    audio.collect(total);
    audio.tone(880, 1760, 0.3, { type: 'square', vol: 0.06 });
    hud.pop('+2', UFO.x, 0.8, UFO.z, camera, 'big gold');
    fx.burst(UFO.x, 0.4, UFO.z, 40, [0xffc21a, 0xffe27a, 0xffffff], 4, 3, 0.1, 0.8, 6);
    shake = 0.12;
    endUFO();
  }

  /* ---------- per frame ---------- */
  let t = 0;
  const look = new THREE.Vector3();
  function update(dt) {
    t += dt;
    stateT += dt;
    if (state === 'ready' && stateT > 1.0) { setState('play'); status(); }
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 10) { physStep(STEP); acc -= STEP; n++; }
    if (n === 10) acc = 0;
    invuln = Math.max(0, invuln - dt);
    if ((state === 'won' || state === 'lost') && stateT > 2.4) again();
    portal.update(dt);

    // invaders wiggle on every step, and pop when they die
    for (const v of inv) {
      if (v.alive) {
        v.mesh.visible = true;
        v.mesh.position.set(v.x, 0.32 + Math.sin(t * 3 + v.c) * 0.04, v.z);
        v.mesh.rotation.set(0.35, (form.frame ? 0.22 : -0.22), 0);
        v.mesh.scale.setScalar(1);
      } else if (v.die > 0) {
        v.die += dt;
        v.mesh.scale.setScalar(Math.max(0.001, 1 + v.die * 3));
        v.mesh.rotation.y += dt * 20;
        if (v.die > 0.12) { v.mesh.visible = false; v.die = 0; }
      }
    }
    glowPulse = Math.max(0, glowPulse - dt * 4);
    glow.material.opacity = 0.16 + glowPulse * 0.14 + (state === 'won' ? 0.2 + Math.sin(t * 12) * 0.15 : 0);

    if (state !== 'warp') {
      cannon.position.set(px, 0, PLAYER_Z);
      cannon.visible = state !== 'lost' || Math.sin(t * 30) > 0;
      const blink = invuln > 0 && Math.sin(t * 40) > 0;
      googly.root.visible = !blink;
      googly.root.position.set(px, 0.55, PLAYER_Z + 0.05);
      look.copy(camera.position);
      googly.update(dt, [pvx, 0, 0], look, { scared: bombs.some((b) => b.on && Math.abs(b.x - px) < 0.8 && b.z > 3.5) || state === 'lost', dizzy: invuln > 0.6, lean: 0.05 });
    }

    for (const s of shots) { s.m.visible = s.on; if (s.on) s.m.position.set(s.x, 0.3, s.z); }
    for (const b of bombs) { b.m.visible = b.on; if (b.on) { b.m.position.set(b.x, 0.3, b.z); b.m.rotation.y = t * 9; } }

    ship.visible = shipEyes.root.visible = UFO.on;
    if (UFO.on) {
      ship.position.set(UFO.x, 0.45 + Math.sin(t * 5) * 0.06, UFO.z);
      ship.rotation.set(0.35, 0, Math.sin(t * 3) * 0.15);
      shipEyes.root.position.set(UFO.x, 0.75, UFO.z + 0.1);
      shipEyes.update(dt, [UFO.dir * 2.3, 0, 0], camera.position, { scared: true, lean: 0.2 });
      if (siren) siren.set(520 + Math.sin(t * 18) * 140, document.hidden ? 0 : 0.03, 1800);
    }
    fx.update(dt);

    camT.copy(fit.target);
    camera.position.copy(camT).addScaledVector(fit.dir, fit.dist);
    if (shake > 0.002 && !ctx.reduceMotion) camera.position.add(_sh.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake *= Math.exp(-9 * dt);
    camera.lookAt(camT);
  }

  update(0);

  return {
    scene, camera, update, resize,
    start() {
      setState('ready');
      hud.status('GET READY');
      hud.popXY('READY?', innerWidth / 2, innerHeight * 0.45, 'big');
    },
    onPress(e) { drag = { x0: e.clientX, px0: px }; },
    onRelease() { drag = null; targetX = px; },
    showsStick: () => false, // you steer by sliding your finger; the cannon follows it
    dispose() { if (siren) siren.stop(); siren = null; },
    // the engine's time limit: open the wormhole even if the wave isn't cleared
    openWormhole(why) { openWormhole(why); },
    debug: () => ({ state, lives, alive, kills, px, inv, bombs, shots, cells: cells.filter((c) => c.alive).length, ufo: UFO, form, wave, wormhole: portal.isOpen ? { x: WORM_X, z: PLAYER_Z } : null }),
  };
}
