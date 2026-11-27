// s-verse #2: S Grand Prix. A slot-car race through the inside of the Cool S.
// Every Cool S has two dead-end pockets in the middle. Here they're tunnel mouths: the cars dive under the middle band
// and pop out of the other pocket, which turns the S into what it always looked like, a twisted ribbon. That makes a
// loop with a bridge over a tunnel. One finger: hold to go, let go to slow down. Too fast round a bend and you fly off.
// Win and a wormhole opens in your lane on the left straight: stop in it to go on, or race again.

export default {
  id: 'race',
  name: 'S Grand Prix',
  verb: 'hold to go!',
  author: 'stutxo',
  theme: { font: 'Racing Sans One', ink: '#ffffff', glow: '#b0124f', card: '#ffd21f', cardInk: '#151515', accent: '#d81b60', stick: '#ffffff' },
  create(ctx) { return createRace(ctx); },
};

const LAPS = 3;
const N = 600;                 // samples around each lane
const LANE = 0.27;             // each slot sits this far either side of the channel's middle
const VMAX = 6.2;              // flat out on a straight
const ACC = 9, BRAKE = 11;     // the motor pulls toward VMAX; letting go brakes hard
const GRIP = 15;               // corner speed limit: sqrt(GRIP * radius)
const SLIP_OK = 1.12, SLIP_T = 0.14; // go this much over the limit for this long and you're off
const BONUS = [3, 1];          // gold s's for finishing 1st, 2nd (plus 1 for every clean lap)

// The S's channel, closed into a loop: up the right, round the top, down the left, over the bridge (the middle band),
// down the right, round the bottom, up the left into the pocket, then under the bridge and out of the other pocket.
const CTRL = [[1, -0.8], [1, -2.9], [0.62, -3.45], [0, -3.85], [-0.62, -3.45], [-1, -2.9], [-1, -1.05], [1, 1.05],
  [1, 2.9], [0.62, 3.45], [0, 3.85], [-0.62, 3.45], [-1, 2.9], [-1, 0.8], [-1, 0.2], [1, -0.2]];
const MOUTH_IN = [-1, 0.75], MOUTH_OUT = [1, -0.75], START = [1, -1.75];
const WORM = [-1, -1.95];      // the wormhole: halfway down the left straight
const WORM_V = 1.2;            // be going slower than this over its middle and it takes you

function createRace(ctx) {
  const { THREE, S, audio, hud } = ctx;
  const { clamp } = S;
  const { lerp, pick, lowEnd } = ctx;
  const hard = Math.min(ctx.loop, 3);

  /* ---------- the track ---------- */
  const C = S.resampleLoop(S.chaikinLoop(CTRL, 3), N);
  const nearIn = (pts, x, z) => { let b = 0, bd = Infinity; pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  const cIn = nearIn(C.pts, ...MOUTH_IN), cOut = nearIn(C.pts, ...MOUTH_OUT);
  const tunnelLen = (cOut - cIn + N) % N;
  const inTunnel = (i) => (i - cIn + N) % N <= tunnelLen;

  function makeLane(off) {
    const L = S.resampleLoop(C.pts.map((p) => [p.x - p.tz * off, p.z + p.tx * off]), N);
    const ds = L.len / N, pts = L.pts;
    const tunnel = new Uint8Array(N), vmax = new Float32Array(N), vsafe = new Float32Array(N), curv = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      tunnel[k] = inTunnel(nearIn(C.pts, pts[k].x, pts[k].z)) ? 1 : 0;
      const a = pts[(k - 3 + N) % N], b = pts[(k + 3) % N];
      curv[k] = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz) / (6 * ds);
      vmax[k] = tunnel[k] ? VMAX : Math.min(VMAX, Math.sqrt(GRIP / Math.max(Math.abs(curv[k]), 1e-4)));
    }
    // the fastest you can be going at each point and still brake in time for what's ahead
    for (let k = 0; k < N; k++) vsafe[k] = vmax[k];
    for (let pass = 0; pass < 2; pass++) {
      for (let k = N - 1; k >= 0; k--) vsafe[k] = Math.min(vmax[k], Math.sqrt(vsafe[(k + 1) % N] ** 2 + 2 * BRAKE * ds));
    }
    let tunnelN = 0, mouth = 0;
    for (let k = 0; k < N; k++) { tunnelN += tunnel[k]; if (tunnel[k] && !tunnel[(k - 1 + N) % N]) mouth = k; }
    return { off, pts, ds, len: L.len, tunnel, vmax, vsafe, curv, start: nearIn(pts, ...START), mouth, tunnelN };
  }
  const lanes = [makeLane(LANE), makeLane(-LANE)];

  /* ---------- scene ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9c7a8);
  scene.fog = new THREE.Fog(0xd9c7a8, 26, 70);
  scene.environment = ctx.envTexture();
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb89b74, 1.0));
  const sun = new THREE.DirectionalLight(0xfff3e3, 2.3);
  sun.position.set(-6, 16, -2.5);
  sun.target.position.set(0, -1, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  { const c = sun.shadow.camera; c.left = -9; c.right = 9; c.top = 10; c.bottom = -10; c.near = 1; c.far = 45; c.updateProjectionMatrix(); }
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  // a wooden desk
  const woodTex = ctx.canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c99a63'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) { g.fillStyle = y % 128 ? '#c2925a' : '#cfa16a'; g.fillRect(0, y, w, 62); g.fillStyle = 'rgba(80,45,15,0.35)'; g.fillRect(0, y + 62, w, 2); }
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(110,65,25,${(0.06 + Math.random() * 0.08).toFixed(3)})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 10, w * 0.7, y + (Math.random() - 0.5) * 10, w, y + (Math.random() - 0.5) * 6); g.stroke(); }
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(8, 8);
  const DESK_Y = -0.55;
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 }));
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = DESK_Y;
  desk.receiveShadow = true;
  scene.add(desk);

  // the Cool S, the notebook's own: ruled paper with its 14 lines in blue ink
  const paper = ctx.canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#fcfdfa'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(118,163,222,0.5)'; g.fillRect(0, h - 4, w, 4);
  });
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  paper.repeat.set(1 / 0.75, 1 / 0.75);
  const shape = new THREE.Shape();
  S.OUTLINE.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const SLAB = -DESK_Y - 0.06;
  const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 1 });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(0, DESK_Y, 0);
  const slab = new THREE.Mesh(slabGeo, [new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xeceee8, roughness: 0.95 })]);
  slab.castShadow = slab.receiveShadow = true;
  scene.add(slab);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), YUP = new THREE.Vector3(0, 1, 0), Q0 = new THREE.Quaternion();
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x2335a8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const inkCyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(S.INK_R, S.INK_R, 1, 14, 1, true), ink, S.STROKES.length);
  const inkCap = new THREE.InstancedMesh(new THREE.SphereGeometry(S.INK_R, 14, 10), ink, S.STROKES.length * 2);
  S.STROKES.forEach((w, i) => {
    q.setFromUnitVectors(YUP, v3.set(w.dx, 0, w.dz).normalize());
    inkCyl.setMatrixAt(i, m4.compose(v3.set((w.ax + w.bx) / 2, S.INK_R, (w.az + w.bz) / 2), q, sc.set(1, w.len, 1)));
    inkCap.setMatrixAt(2 * i, m4.compose(v3.set(w.ax, S.INK_R, w.az), Q0, sc.set(1, 1, 1)));
    inkCap.setMatrixAt(2 * i + 1, m4.compose(v3.set(w.bx, S.INK_R, w.bz), Q0, sc.set(1, 1, 1)));
  });
  for (const m of [inkCyl, inkCap]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  // the road through the channel: grey track, two slots with steel rails, red and white kerbs on the bends
  function ribbon(lane, o0, o1, y) {
    const pos = [], uv = [], ind = [], nor = [];
    const L = lane || { pts: C.pts, len: C.len };
    let prev = -1;
    for (let k = 0; k <= N; k++) {
      const i = k % N, p = L.pts[i];
      if (lane ? lane.tunnel[i] : inTunnel(i)) { prev = -1; continue; } // nothing to draw under the bridge
      const nx = -p.tz, nz = p.tx, idx = pos.length / 3;
      pos.push(p.x + nx * o0, y, p.z + nz * o0, p.x + nx * o1, y, p.z + nz * o1);
      nor.push(0, 1, 0, 0, 1, 0);
      uv.push(0, k * (L.len / N), 1, k * (L.len / N));
      if (prev >= 0) ind.push(prev, prev + 1, idx, prev + 1, idx + 1, idx);
      prev = idx;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind);
    return geo;
  }
  const flat = (color, f) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  const road = new THREE.Mesh(ribbon(null, -0.5, 0.5, 0.002), flat(0x55596a, -1));
  road.receiveShadow = true;
  scene.add(road);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (const lane of lanes) {
    scene.add(new THREE.Mesh(ribbon(lane, -0.018, 0.018, 0.004), flat(0x111318, -3)));
    for (const o of [-0.05, 0.05]) scene.add(new THREE.Mesh(ribbon(lane, o - 0.012, o + 0.012, 0.004), steel));
  }
  const kerbSpots = [];
  for (let i = 0; i < N; i += 3) {
    if (inTunnel(i)) continue;
    const a = C.pts[(i - 4 + N) % N], b = C.pts[(i + 4) % N];
    const k = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz) / (8 * C.len / N);
    if (Math.abs(k) > 0.6) kerbSpots.push([i, -Math.sign(k)]); // on the outside of the bend
  }
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), Math.max(1, kerbSpots.length));
  const RED = new THREE.Color(0xe53935), WHITE = new THREE.Color(0xffffff);
  kerbSpots.forEach(([i, side], k) => {
    const p = C.pts[i], off = side * 0.52;
    q.setFromAxisAngle(YUP, -Math.atan2(p.tz, p.tx));
    kerbs.setMatrixAt(k, m4.compose(v3.set(p.x - p.tz * off, 0.006, p.z + p.tx * off), q, sc.set((C.len / N) * 3.1, 0.012, 0.08)));
    kerbs.setColorAt(k, ((i / 3) | 0) % 2 ? RED : WHITE);
  });
  scene.add(kerbs);

  // the tunnel mouths: the dark tips of the two pockets, where the cars dive under the middle band
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x141a33, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const deepMat = new THREE.MeshBasicMaterial({ color: 0x05060d, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  for (const sg of [1, -1]) { // the two pockets mirror each other through the S's middle
    for (const [mat, k] of [[holeMat, 1], [deepMat, 0.55]]) {
      const tri = new THREE.Shape(); // shape coordinates are (x, -z)
      tri.moveTo(-1 * sg, -0.17 * sg);
      tri.lineTo((-1 + 0.73 * k) * sg, -(0.17 + 0.73 * k) * sg);
      tri.lineTo((-1 - 0.73 * k) * sg, -(0.17 + 0.73 * k) * sg);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), mat);
      m.position.y = 0.003;
      scene.add(m);
    }
  }
  // someone drew where the tunnel goes, in pencil
  const dashes = [];
  for (let i = cIn + 6; i < cIn + tunnelLen - 6; i += 7) dashes.push(C.pts[i % N]);
  const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 1, transparent: true, opacity: 0.7 }), Math.max(1, dashes.length));
  dashes.forEach((p, k) => {
    q.setFromAxisAngle(YUP, -Math.atan2(p.tz, p.tx));
    dashMesh.setMatrixAt(k, m4.compose(v3.set(p.x, 0.005, p.z), q, sc.set(0.13, 0.004, 0.035)));
  });
  scene.add(dashMesh);

  // start / finish
  const checker = ctx.canvasTexture(160, 32, (g) => { for (let x = 0; x < 10; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#141414' : '#ffffff'; g.fillRect(x * 16, y * 16, 16, 16); } });
  const sp = C.pts[nearIn(C.pts, ...START)];
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.16).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  startLine.position.set(sp.x, 0.006, sp.z);
  startLine.rotation.y = Math.atan2(sp.tx, sp.tz); // its width runs across the track
  scene.add(startLine);

  // a pencil on the desk, for scale
  {
    const pencil = new THREE.Group();
    const parts = [[new THREE.CylinderGeometry(0.16, 0.16, 4.2, 6), 0xf6c21c, 0], [new THREE.ConeGeometry(0.16, 0.55, 6), 0xe7c49a, 2.375], [new THREE.ConeGeometry(0.055, 0.18, 10), 0x3b3d44, 2.56], [new THREE.CylinderGeometry(0.165, 0.165, 0.32, 16), 0xcfd4dc, -2.26], [new THREE.CylinderGeometry(0.157, 0.157, 0.36, 16), 0xf29bb0, -2.6]];
    for (const [geo, color, y] of parts) { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 })); m.position.y = y; m.castShadow = true; pencil.add(m); }
    pencil.rotation.set(0, 0.5, Math.PI / 2);
    pencil.position.set(-4.4, DESK_Y + 0.14, 4.2);
    scene.add(pencil);
  }

  /* ---------- the cars ---------- */
  const tyre = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.8 });
  const wheelGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12).rotateX(Math.PI / 2);
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.08, 0.24), noseGeo = new THREE.BoxGeometry(0.14, 0.05, 0.2), wingGeo = new THREE.BoxGeometry(0.05, 0.03, 0.27);
  function makeCar(color, ball, lane, name, player) {
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.5), roughness: 0.5 });
    const b = new THREE.Mesh(bodyGeo, paint); b.position.y = 0.08;
    const nose = new THREE.Mesh(noseGeo, dark); nose.position.set(0.3, 0.065, 0);
    const wing = new THREE.Mesh(wingGeo, dark); wing.position.set(-0.24, 0.16, 0);
    body.add(b, nose, wing);
    for (const [wx, wz] of [[0.16, 0.13], [0.16, -0.13], [-0.16, 0.13], [-0.16, -0.13]]) { const w = new THREE.Mesh(wheelGeo, tyre); w.position.set(wx, 0.055, wz); body.add(w); }
    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    const googly = ctx.makeGoogly({ radius: 0.13, faceUp: [0, 0, -1], material: new THREE.MeshPhysicalMaterial({ map: ctx.ballTexture(...ball), roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }) });
    scene.add(googly.root);
    const L = lanes[lane];
    return { g, body, googly, lane: L, name, player, d: L.start * L.ds - 0.55, v: 0, slip: 0, drift: 0, air: null, laps: 0, clean: true, done: false, place: 0, throttle: 0, x: 0, z: 0, y: 0, h: 0, i: 0, greedy: 0 };
  }
  const you = makeCar(0xff4f93, ['#ff4f93', '#ff86b8', '#ffe0ec'], 0, 'you', true);
  const rival = makeCar(0x2fa8ff, ['#2fa8ff', '#86ccff', '#e0f2ff'], 1, 'blu', false);
  const cars = [you, rival];
  const fx = ctx.makeParticles(scene, 300, DESK_Y);

  // the wormhole: it opens in your lane when you win (or time's up) and stays open while you race on
  const portal = ctx.makeWormhole({ radius: 0.36 });
  scene.add(portal.root);
  const wormD = nearIn(you.lane.pts, ...WORM) * you.lane.ds; // how far round your lane it sits

  function place(c) {
    const L = c.lane, dd = ((c.d % L.len) + L.len) % L.len, f = dd / L.ds, i = Math.floor(f) % N, j = (i + 1) % N, t = f - Math.floor(f);
    const a = L.pts[i], b = L.pts[j];
    c.i = i;
    c.x = a.x + (b.x - a.x) * t; c.z = a.z + (b.z - a.z) * t;
    c.h = Math.atan2(a.tz + (b.tz - a.tz) * t, a.tx + (b.tx - a.tx) * t);
    // dive under the bridge: sink into the S at one mouth, rise out of the other
    const into = (i - L.mouth + N) % N;
    c.y = L.tunnel[i] ? -0.55 * clamp(Math.min(into + 1, L.tunnelN - into) / 9, 0, 1) : 0;
  }
  // how far through the race a car is, in laps (each lane is a slightly different length)
  const progress = (c) => (c.d - c.lane.start * c.lane.ds) / c.lane.len;

  /* ---------- camera ---------- */
  const FIT_PTS = ctx.sFitPoints(0.5, [-0.4, 0.9], 1.3);
  let fit = null, shake = 0;
  const camT = new THREE.Vector3(), _sh = new THREE.Vector3();
  function resize() {
    const aspect = innerWidth / innerHeight;
    fit = ctx.fitPerspective(camera, FIT_PTS, { pitch: THREE.MathUtils.degToRad(aspect < 0.7 ? 66 : aspect < 1.1 ? 61 : 55) });
  }
  resize();

  /* ---------- race ---------- */
  let state = 'grid', stateT = 0, raceT = 0, lampsLit = 0, held = false, keyHeld = false, touched = false, finished = 0, squealT = 0, lastPlace = 2, wins = 0;
  let motor = null;
  const setState = (s) => { state = s; stateT = 0; };
  const STEP = 1 / 120;
  let acc = 0;

  function crash(c) {
    const L = c.lane, side = Math.sign(L.curv[c.i]) || 1, p = L.pts[c.i];
    // off the outside of the bend, still going the way it was
    const vx = Math.cos(c.h) * c.v + p.tz * side * 1.2, vz = Math.sin(c.h) * c.v - p.tx * side * 1.2;
    c.air = { x: c.x, y: 0.05, z: c.z, vx, vy: 2.8, vz, t: 0, rx: (Math.random() - 0.5) * 18, rz: (Math.random() - 0.5) * 14, landed: false };
    c.v = 0; c.slip = 0; c.clean = false;
    if (c.player) {
      audio.boing();
      ctx.haptic(35);
      shake = 0.14;
      hud.pop(pick(['too fast!', 'whoaaa', 'deslotted!', 'nooo!']), c.x, 0.9, c.z, camera, 'red');
    } else hud.pop(pick(['ha!', 'blu crashed!', 'oops, blu']), c.x, 0.9, c.z, camera);
  }
  function stepAir(c, dt) {
    const a = c.air;
    a.t += dt;
    a.vy -= 20 * dt;
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    const floor = S.pointInS(a.x, a.z) ? 0 : DESK_Y;
    if (a.y < floor) {
      a.y = floor;
      if (a.vy < -2) { if (!a.landed && c.player) audio.thud(-a.vy); a.landed = true; a.vy *= -0.35; a.vx *= 0.6; a.vz *= 0.6; a.rx *= 0.5; a.rz *= 0.5; } else { a.vy = 0; a.vx *= 0.9; a.vz *= 0.9; }
    }
    if (a.t > 1.15) { // the marshal puts you back in the slot
      c.air = null;
      place(c);
      fx.burst(c.x, 0.15, c.z, 14, [0xffffff, 0xdddddd], 1.5, 1.5, 0.08, 0.5, 4);
      if (c.player) audio.tone(500, 900, 0.12, { type: 'triangle', vol: 0.1 });
    }
  }

  function drive(c, dt) {
    if (c.player && state === 'warp') return;
    if (c.air) { stepAir(c, dt); return; }
    const L = c.lane;
    place(c);
    let gas;
    if (state !== 'race') gas = false;
    else if (c.player && !c.done) gas = held || keyHeld || ctx.input.active || !!(ctx.keys.u || ctx.keys.r || ctx.keys.l || ctx.keys.d);
    else {
      // the rival knows exactly how fast each bend can go, and drives a touch under it (most of the time)
      let skill = 0.78 + hard * 0.03;
      if (!c.player && !you.done) { const gap = progress(c) - progress(you); skill *= gap > 0.06 ? 0.8 : gap < -0.15 ? 1.03 : 1; } // stays close, but one crash won't cost you the race
      if (c.greedy > 0) skill = 1.2;
      gas = c.v < skill * L.vsafe[c.i];
    }
    if (c.player) c.throttle = gas ? 1 : 0;
    c.v = clamp(c.v + (gas ? ACC * (1 - c.v / VMAX) : -BRAKE) * dt, 0, VMAX);
    const r = c.v / L.vmax[c.i];
    c.slip = r > SLIP_OK ? c.slip + dt : Math.max(0, c.slip - dt * 2);
    c.drift = lerp(c.drift, clamp((r - 0.85) * 1.4, 0, 0.55) * Math.sign(L.curv[c.i]), 1 - Math.exp(-10 * dt)); // nose in, tail out
    if (c.slip > SLIP_T) { crash(c); return; }
    const before = progress(c);
    c.d += c.v * dt;
    const after = progress(c);
    if (Math.floor(after) > Math.floor(before) && after >= 1) lapDone(c, Math.floor(after));
    if (c.player && !c.done && state === 'race' && portal.isOpen && c.v < WORM_V && overWormhole(c)) { enterWormhole(); return; }
    if (c.greedy > 0) c.greedy -= dt;
  }

  function lapDone(c, n) {
    c.laps = n;
    if (c.player) {
      if (c.clean && n <= LAPS) { const total = ctx.addScore(1); audio.collect(total); hud.pop('clean lap +1', c.x, 0.9, c.z, camera, 'gold'); }
      if (n < LAPS) {
        hud.popXY(n === LAPS - 1 ? 'final lap!' : `lap ${n + 1}`, innerWidth / 2, innerHeight * 0.3, 'big');
        audio.tone(880, 880, 0.1, { type: 'triangle', vol: 0.11 }); audio.tone(1320, 1320, 0.16, { type: 'triangle', vol: 0.09, delay: 0.1 });
      }
      c.clean = true;
    } else if (Math.random() < 0.18 + hard * 0.04) c.greedy = 2.5; // at the next bend, blu gets greedy
    if (n >= LAPS && !c.done) {
      c.done = true;
      finished++;
      c.place = finished;
      if (c.player) finishYou();
    }
  }

  function finishYou() {
    const bonus = BONUS[you.place - 1] || 0;
    if (bonus) ctx.addScore(bonus);
    hud.popXY(you.place === 1 ? 'you win!' : '2nd!', innerWidth / 2, innerHeight * 0.38, 'big');
    if (bonus) setTimeout(() => hud.popXY(`+${bonus}`, innerWidth / 2, innerHeight * 0.48, 'big gold'), 380);
    hud.status(you.place === 1 ? 'winner!' : '2nd place');
    if (you.place === 1) {
      audio.tada();
      for (let n = 0; n < 90; n++) fx.spawn((Math.random() - 0.5) * 5, 3 + Math.random() * 2, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, pick([0xff4f93, 0xffc21a, 0x2fa8ff, 0x34c759, 0xffffff]), 0.1, 2.6, 3, 0.9);
    } else audio.collect(2);
    you.googly.happy(3);
    stateT = 0;
  }

  // another race from the grid; if you just won it, the wormhole opens
  function again() {
    const won = you.place === 1;
    if (won) wins++;
    for (const c of cars) {
      Object.assign(c, { d: c.lane.start * c.lane.ds - 0.55, v: 0, slip: 0, drift: 0, air: null, laps: 0, clean: true, done: false, place: 0, greedy: 0 });
      place(c);
    }
    finished = 0; raceT = 0; lampsLit = 0; lastPlace = 2;
    audio.stopLoop();
    setState('count');
    hud.popXY(won ? 'again!' : 'one more go!', innerWidth / 2, innerHeight * 0.3, 'big');
    if (won) openWormhole('won');
    hud.status(portal.isOpen ? 'stop in the wormhole to go on' : ctx.coarse ? 'hold anywhere to go' : 'hold space to go');
  }
  // is car c (in your lane) over the wormhole's middle?
  function overWormhole(c) {
    const L = c.lane, dd = (((c.d - wormD) % L.len) + L.len) % L.len;
    return Math.min(dd, L.len - dd) < 0.28;
  }
  function openWormhole(why) {
    if (portal.isOpen) return;
    const w = { lane: you.lane, d: wormD };
    place(w);
    portal.open(w.x, 0.004, w.z);
    hud.pop(why === 'time' ? "time's up! a wormhole!" : 'a wormhole!', w.x, 0.9, w.z, camera, 'big');
    setTimeout(() => hud.pop('stop in it to go through', w.x, 0.5, w.z, camera), 1000);
  }
  function enterWormhole() {
    setState('warp');
    you.v = 0;
    you.g.attach(you.googly.root); // the driver goes too
    portal.take(you.g); // spirals the car in, then sends you on
  }

  function countdown() {
    let n = 0;
    for (const b of [0.6, 1.2, 1.8]) if (stateT >= b) n++;
    if (n > lampsLit) { lampsLit = n; audio.tone(440, 440, 0.2, { type: 'square', vol: 0.07 }); hud.popXY(String(4 - n), innerWidth / 2, innerHeight * 0.42, 'big'); }
    if (stateT >= 2.4) {
      audio.tone(880, 880, 0.45, { type: 'square', vol: 0.08 });
      hud.popXY('GO!', innerWidth / 2, innerHeight * 0.42, 'big');
      hud.flash('rgba(255,255,255,0.3)', 240);
      audio.startLoop(152, music);
      setState('race');
    }
  }
  function music(step, when) {
    const bar = Math.floor(step / 16) % 4, s16 = step % 16, root = 110 * Math.pow(2, [0, 0, 5, 7][bar] / 12);
    if (s16 % 2 === 0) { const f = root * Math.pow(2, [0, 0, 12, 0, 7, 0, 10, 12][s16 / 2] / 12); audio.tone(f, f, 0.1, { type: 'square', vol: 0.025, at: when }); }
    if (s16 === 0 || s16 === 8 || s16 === 10) audio.tone(140, 45, 0.14, { vol: 0.09, at: when });
    if (s16 === 4 || s16 === 12) audio.noise(0.09, { vol: 0.035, freq: 2000, q: 0.7, at: when });
    if (s16 % 2 === 1) audio.noise(0.025, { vol: 0.014, freq: 8000, type: 'highpass', at: when });
  }

  function update(dt) {
    stateT += dt;
    if (state === 'count') countdown();
    if (state === 'race') raceT += dt;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 10) { for (const c of cars) drive(c, STEP); acc -= STEP; n++; }
    if (n === 10) acc = 0;

    if (state === 'race') {
      const place = you.done ? you.place : rival.done ? 2 : progress(you) >= progress(rival) ? 1 : 2;
      if (!you.done) {
        if (place < lastPlace && raceT > 1.5) { hud.pop(pick(['overtake!', 'see ya!', 'passed!']), you.x, 0.9, you.z, camera); audio.tone(660, 990, 0.15, { type: 'triangle', vol: 0.09 }); }
        lastPlace = place;
        const lap = clamp(Math.floor(Math.max(0, progress(you))) + 1, 1, LAPS);
        hud.status(!touched && raceT > 0.8 ? (ctx.coarse ? 'hold anywhere to go!' : 'hold space to go!') : `lap ${lap}/${LAPS}  ·  ${place === 1 ? '1st' : '2nd'}`);
      }
      if (you.done && stateT > 2.6) again();
      if (!you.done && raceT > 60) { you.done = true; finished++; you.place = finished; finishYou(); } // somebody fell asleep
    }
    portal.update(dt);
    visuals(dt);
  }

  /* ---------- looks ---------- */
  function visuals(dt) {
    for (const c of cars) {
      if (c.player && state === 'warp') continue; // the wormhole has it
      if (c.air) {
        const a = c.air;
        c.g.position.set(a.x, a.y, a.z);
        c.body.rotation.x += a.rx * dt; c.body.rotation.z += a.rz * dt;
        c.googly.root.visible = true;
        c.googly.root.position.set(a.x, a.y + 0.24, a.z);
        c.googly.update(dt, [a.vx, a.vy, a.vz], camera.position, { scared: true, lean: 0.1 });
        continue;
      }
      if (state === 'grid' || state === 'count') place(c);
      c.body.rotation.x = lerp(c.body.rotation.x, 0, 1 - Math.exp(-12 * dt));
      c.body.rotation.z = lerp(c.body.rotation.z, 0, 1 - Math.exp(-12 * dt));
      c.g.position.set(c.x, c.y, c.z);
      c.g.rotation.y = -(c.h + c.drift);
      const cx = Math.cos(c.h), cz = Math.sin(c.h);
      c.googly.root.position.set(c.x - cx * 0.04, c.y + 0.25, c.z - cz * 0.04);
      c.googly.root.visible = c.y > -0.3; // hidden while it's under the bridge
      const nearLimit = c.v / c.lane.vmax[c.i] > 0.95;
      c.googly.update(dt, [cx * c.v, 0, cz * c.v], camera.position, { scared: nearLimit || c.slip > 0, lean: 0.08 });
      // tyre smoke when you're right on the limit
      if (state === 'race' && nearLimit && c.y > -0.1 && Math.random() < dt * 30) fx.spawn(c.x - cx * 0.2, 0.05, c.z - cz * 0.2, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, 0xeeeeee, 0.09, 0.45, -0.6, 2.5);
    }
    squealT -= dt;
    if (state === 'race' && !you.air && you.y > -0.1 && you.v / you.lane.vmax[you.i] > 0.97 && squealT <= 0) { squealT = 0.12; audio.noise(0.1, { vol: 0.03, freq: 2600, q: 6 }); }
    fx.update(dt);
    if (motor) motor.set(70 + you.v * 26, document.hidden || you.air ? 0 : 0.01 + you.throttle * 0.012, 400 + you.v * 90);
    const fxz = you.air ? you.air : you;
    camT.copy(fit.target);
    camT.x += fxz.x * 0.04;
    camT.z += fxz.z * 0.03;
    camera.position.copy(camT).addScaledVector(fit.dir, fit.dist);
    if (shake > 0.002 && !ctx.reduceMotion) camera.position.add(_sh.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake *= Math.exp(-8 * dt);
    camera.lookAt(camT);
  }

  for (const c of cars) place(c);
  visuals(0);

  return {
    scene, camera, update, resize,
    ring: false, // no drag circle: you just hold
    start() {
      setState('count');
      motor = audio.drone({ type: 'triangle', freq: 70, cutoff: 400 });
      hud.status(ctx.coarse ? 'hold anywhere to go' : 'hold space to go');
    },
    onPress() { held = true; touched = true; },
    onRelease() { held = false; },
    onKey(e, dir, up) {
      if (e.code === 'Space' || e.code === 'Enter' || dir) { keyHeld = !up; if (!up) touched = true; }
    },
    dispose() { if (motor) motor.stop(); motor = null; },
    // the engine's time limit: open the wormhole even if you haven't won
    openWormhole(why) { openWormhole(why); },
    debug: () => ({ state, raceT, you, rival, lanes, progress: [progress(you), progress(rival)], wormhole: portal.isOpen ? { d: wormD } : null, wins }),
  };
}
