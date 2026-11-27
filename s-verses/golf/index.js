// s-verse #3: Hole in S. Mini golf on a putting green shaped like the Cool S, floating in a duck pond.
// Pull back anywhere and let go to putt (like a slingshot), or aim with the arrow keys and hit space.
// Its rails are the 14 lines of the S. Mind the windmill in the middle, and don't putt it into the pond.

export default {
  id: 'golf',
  name: 'Hole in S',
  verb: 'putt!',
  author: 'stutxo',
  theme: { font: 'Fredoka', ink: '#0d4a2c', glow: '#ffffff', card: '#ffffff', cardInk: '#0d4a2c', accent: '#2fb36b', stick: '#0d4a2c' },
  create(ctx) { return createGolf(ctx); },
};

const PAR = 5;
const MAX_STROKES = 8;
const MAX_V = 12;          // a full-power putt
const SINK_V = 4.6;        // roll over the cup slower than this and it drops
const CUP = [-1, 1.0];     // the cup, in the bottom-left pocket of the S
const TEE = [1, -1.2];     // the tee, in the top-right pocket
const MILL = [0, 0];       // the windmill straddles the S's middle, where the channel crosses over
const POINTS = [0, 8, 6, 5, 4, 3, 2, 1, 1]; // gold s's for sinking it in this many strokes
const NAMES = ['', 'HOLE IN S!', 'albatross!', 'eagle!', 'birdie!', 'par', 'bogey', 'double bogey', 'phew'];

function createGolf(ctx) {
  const { THREE, S, audio, hud } = ctx;
  const { BALL_R, INK_R, CONTACT, clamp, OUTLINE, STROKES, stepBall, pointInS, projectToPath, pathPoint, nearestOnSeg } = S;
  const { lerp, easeOutCubic, easeOutBack, pick, lowEnd } = ctx;
  const P = { ...S.PHYS, G: 0, DAMP: 0.55, FRICTION: 1.5, REST: 0.62, HOP_V: 9.2, VMAX: 13, HOP_VY: 3.6, BOUNCE_V: 6 };
  const hard = Math.min(ctx.loop, 3);

  /* ---------- scene ---------- */
  const SKY = 0xbfe6f5;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 26, 70);
  scene.environment = ctx.envTexture();
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7fb6c9, 1.0));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-6, 15, -3);
  sun.target.position.set(0, -1, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  { const c = sun.shadow.camera; c.left = -8; c.right = 8; c.top = 9; c.bottom = -9; c.near = 1; c.far = 45; c.updateProjectionMatrix(); }
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  // the duck pond
  const waterTex = ctx.canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4fb8e0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 18;
      g.beginPath(); g.arc(x, y, r, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(14, 14);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.25, metalness: 0.1, envMapIntensity: 0.6 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.42;
  water.receiveShadow = true;
  scene.add(water);

  /* ---------- the green: the S, with its 14 lines as wooden rails ---------- */
  const feltTex = ctx.canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3fae5a'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 16, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = i % 2 ? 'rgba(0,60,20,0.10)' : 'rgba(255,255,255,0.06)'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  });
  feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping;
  feltTex.repeat.set(0.5, 0.5);
  const shape = new THREE.Shape();
  OUTLINE.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const SLAB_D = 0.5, BEV = 0.06;
  const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: SLAB_D, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 2, curveSegments: 1 });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(0, -(SLAB_D + BEV), 0); // the green's surface is at y = 0
  const slab = new THREE.Mesh(slabGeo, [
    new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.85 }),
  ]);
  slab.castShadow = slab.receiveShadow = true;
  scene.add(slab);

  const wood = new THREE.MeshPhysicalMaterial({ color: 0xc8874a, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const railCyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(INK_R, INK_R, 1, 14, 1, true), wood, STROKES.length);
  const railCap = new THREE.InstancedMesh(new THREE.SphereGeometry(INK_R, 14, 10), wood, STROKES.length * 2);
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), Q0 = new THREE.Quaternion();
    STROKES.forEach((w, i) => {
      q.setFromUnitVectors(Y, d.set(w.dx, 0, w.dz).normalize());
      railCyl.setMatrixAt(i, m4.compose(p.set((w.ax + w.bx) / 2, INK_R, (w.az + w.bz) / 2), q, s.set(1, w.len, 1)));
      railCap.setMatrixAt(2 * i, m4.compose(p.set(w.ax, INK_R, w.az), Q0, s.set(1, 1, 1)));
      railCap.setMatrixAt(2 * i + 1, m4.compose(p.set(w.bx, INK_R, w.bz), Q0, s.set(1, 1, 1)));
    });
  }
  for (const m of [railCyl, railCap]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  // tee mat and the cup
  const tee = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  tee.position.set(TEE[0], 0.002, TEE[1]);
  tee.receiveShadow = true;
  scene.add(tee);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b1a10, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  hole.position.set(CUP[0], 0.003, CUP[1]);
  const lip = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  lip.position.set(CUP[0], 0.004, CUP[1]);
  scene.add(hole, lip);

  // the flag: a red pennant with an S on it
  const flag = new THREE.Group();
  flag.position.set(CUP[0], 0, CUP[1]);
  scene.add(flag);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  pole.position.y = 0.8;
  pole.castShadow = true;
  flag.add(pole);
  const drawPennant = (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#e53935';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h / 2); g.lineTo(0, h); g.closePath(); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    // a tiny Cool S, of course
    const k = h * 0.075, ox = w * 0.2, oy = h * 0.5 - 2.5 * k;
    for (const st of STROKES) { g.beginPath(); g.moveTo(ox + (st.ax / 2 + 1) * k, oy + (st.az / 2 + 2.5) * k); g.lineTo(ox + (st.bx / 2 + 1) * k, oy + (st.bz / 2 + 2.5) * k); g.stroke(); }
  };
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.48).translate(0.36, 0, 0),
    new THREE.MeshStandardMaterial({ map: ctx.canvasTexture(192, 128, drawPennant), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
  pennant.position.y = 1.34;
  pennant.castShadow = true;
  flag.add(pennant);

  /* ---------- the windmill ---------- */
  // Its sails turn across the channel; when one points straight down it blocks the tunnel. Time your putt.
  const CH = [Math.SQRT1_2, Math.SQRT1_2];          // direction of the channel through the middle
  const ACROSS = [Math.SQRT1_2, -Math.SQRT1_2];
  const FACE = 0.46;                                 // the sails sit this far up-channel from the mill's center
  const gc = [MILL[0] - CH[0] * FACE, MILL[1] - CH[1] * FACE];
  const GL = 0.9;
  const gate = { ax: gc[0] - ACROSS[0] * GL, az: gc[1] - ACROSS[1] * GL, bx: gc[0] + ACROSS[0] * GL, bz: gc[1] + ACROSS[1] * GL };
  gate.dx = gate.bx - gate.ax; gate.dz = gate.bz - gate.az; gate.len2 = gate.dx * gate.dx + gate.dz * gate.dz;
  const SAIL_SPEED = 1.5 + hard * 0.25, GATE_HALF = 0.24;
  const mill = new THREE.Group();
  mill.position.set(MILL[0], 0, MILL[1]);
  mill.rotation.y = Math.atan2(-CH[0], -CH[1]); // local +z points up-channel, at the sails
  scene.add(mill);
  const brick = new THREE.MeshStandardMaterial({ color: 0xf3e5d0, roughness: 0.8 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.95, 8), brick);
  tower.position.y = 0.475;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xd84315, roughness: 0.6 }));
  roof.position.y = 1.2;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 }));
  door.position.set(0, 0.21, 0.43);
  mill.add(tower, roof, door);
  mill.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  const hub = new THREE.Group();
  hub.position.set(0, 0.76, FACE + 0.02);
  mill.add(hub);
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.7 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.8 });
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.03), armMat);
    spar.position.y = -0.4;
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.015), sailMat);
    sail.position.set(0.12, -0.46, 0);
    arm.add(spar, sail);
    arm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    hub.add(arm);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), armMat);
  hub.add(cap);
  let sailAng = 0.4;
  const gateClosed = () => {
    let m = Infinity;
    for (let k = 0; k < 4; k++) m = Math.min(m, Math.abs(Math.atan2(Math.sin(sailAng + (k * Math.PI) / 2), Math.cos(sailAng + (k * Math.PI) / 2))));
    return m < GATE_HALF;
  };

  /* ---------- gold s's, lily pads and a duck ---------- */
  const GOLD = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 });
  const mini = ctx.miniS(0.085, 0.07, 0.02);
  const tokens = [pathPoint(3.1), pathPoint(11.4)].map((p) => {
    const mesh = new THREE.Mesh(mini.geo, GOLD);
    mesh.castShadow = true;
    scene.add(mesh);
    return { x: p.x, z: p.z, mesh, taken: false, pop: 0 };
  });

  const rnd = S.mulberry32(7);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    let x, z;
    do { x = (rnd() - 0.5) * 12; z = (rnd() - 0.5) * 16; } while (S.edgeDistance(x, z) < 1.1 || pointInS(x, z));
    const lp = new THREE.Mesh(new THREE.CircleGeometry(0.28 + rnd() * 0.2, 20, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2), padMat);
    lp.position.set(x, -0.41, z);
    lp.rotation.y = rnd() * 6.28;
    lp.receiveShadow = true;
    scene.add(lp);
  }
  const duck = new THREE.Group();
  {
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffd600, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 12), yellow);
    body.scale.set(1.3, 0.8, 1);
    body.position.y = 0.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), yellow);
    head.position.set(0.24, 0.34, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xff7043, roughness: 0.5 }));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.44, 0.31, 0);
    duck.add(body, head, beak);
    duck.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  scene.add(duck);
  const duckEyes = ctx.makeGoogly({ radius: 0.15, body: false, faceUp: [0, 0, -1], castShadow: false });
  scene.add(duckEyes.root);

  /* ---------- the ball (you) and the putter ---------- */
  const googly = ctx.makeGoogly({ faceUp: [0, 0, -1] });
  scene.add(googly.root);
  const putter = new THREE.Group();
  {
    const metal = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.9, roughness: 0.25 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.46), metal);
    head.position.y = 0.06;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.4 }));
    shaft.position.set(-0.32, 0.75, 0);
    shaft.rotation.z = 0.44;
    putter.add(head, shaft);
    putter.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  putter.visible = false;
  scene.add(putter);
  const DOTS = 14;
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 8), dotMat, DOTS);
  dots.frustumCulled = false;
  dots.visible = false;
  scene.add(dots);
  const fx = ctx.makeParticles(scene, 300, -0.42);

  /* ---------- camera ---------- */
  const FIT_PTS = ctx.sFitPoints(0.5, [-0.4, 1.4], 1.3);
  let fit = null, shake = 0;
  const _sh = new THREE.Vector3(), camT = new THREE.Vector3();
  function resize() {
    const aspect = innerWidth / innerHeight;
    fit = ctx.fitPerspective(camera, FIT_PTS, { pitch: THREE.MathUtils.degToRad(aspect < 0.7 ? 66 : aspect < 1.1 ? 61 : 55) });
  }
  resize();

  /* ---------- state ---------- */
  let state = 'intro', stateT = 0, strokes = 0, idleT = 0, sent = false, touched = false;
  let ball = S.makeBall(TEE), rest = { x: TEE[0], z: TEE[1] }, restT = 0, aiming = false, anchor = [0, 0];
  let aimAng = -Math.PI / 2, power = 0.6, keyAim = false, lipT = 0, gateHitT = 0;
  const ev = {}, n3 = [0, 0, 0];
  const qRoll = new THREE.Quaternion(), _q = new THREE.Quaternion(), _d = new THREE.Vector3();
  const setState = (s) => { state = s; stateT = 0; };
  const speed = () => Math.hypot(ball.vx, ball.vz);

  function suggestAim() {
    // point the arrow down the channel, toward where the hole is
    const s = projectToPath(ball.x, ball.z).s, p = pathPoint(Math.min(S.PATH.len, s + 1.6));
    aimAng = Math.atan2(p.z - ball.z, p.x - ball.x);
  }

  function shoot(pw) {
    pw = clamp(pw, 0, 1);
    if (state !== 'aim' || pw < 0.05) return;
    strokes++;
    rest = { x: ball.x, z: ball.z };
    const v = 1.2 + pw * (MAX_V - 1.2);
    ball.vx = Math.cos(aimAng) * v;
    ball.vz = Math.sin(aimAng) * v;
    audio.tone(1000, 600, 0.06, { type: 'triangle', vol: 0.12 + pw * 0.12 });
    audio.noise(0.03, { vol: 0.08 + pw * 0.1, freq: 3500, q: 1 });
    ctx.haptic(15);
    googly.kick(-1.5 - pw * 2);
    swing = 0.18;
    aiming = false; keyAim = false;
    dots.visible = false;
    idleT = 0;
    setState('roll');
  }

  /* ---------- physics ---------- */
  const STEP = 1 / 120;
  let acc = 0, swing = 0;
  function physStep(dt) {
    sailAng = (sailAng + SAIL_SPEED * dt) % (Math.PI * 2);
    if (state !== 'roll') return;
    stepBall(ball, 0, 0, dt, ev, P);
    if (ev.fall) { splash(); return; }
    // the windmill's sails
    gateHitT -= dt;
    if (!ball.air && gateClosed()) {
      nearestOnSeg(ball.x, ball.z, gate.ax, gate.az, gate.dx, gate.dz, gate.len2, n3);
      let nx = ball.x - n3[0], nz = ball.z - n3[1];
      const d = Math.hypot(nx, nz);
      if (d < CONTACT) {
        if (d > 1e-6) { nx /= d; nz /= d; } else { nx = -CH[0]; nz = -CH[1]; }
        ball.x = n3[0] + nx * CONTACT; ball.z = n3[1] + nz * CONTACT;
        const vn = ball.vx * nx + ball.vz * nz;
        if (vn < 0.6) { ball.vx -= (1.5 * Math.min(vn, 0) - 0.6) * nx; ball.vz -= (1.5 * Math.min(vn, 0) - 0.6) * nz; }
        if (gateHitT <= 0) { gateHitT = 0.3; audio.bonk(Math.max(2, -vn)); googly.kick(2); hud.pop(pick(['bonk!', 'nope!', 'denied!']), ball.x, 0.9, ball.z, camera); }
      }
    }
    // gold s's
    for (const t of tokens) {
      if (!t.taken && Math.hypot(ball.x - t.x, ball.z - t.z) < P.PICK) {
        t.taken = true; t.pop = 0.001;
        const total = ctx.addScore(1);
        audio.collect(total);
        ctx.haptic(12);
        hud.pop('+1', t.x, 0.9, t.z, camera, 'gold');
        fx.burst(t.x, 0.5, t.z, 16, [0xffc21a, 0xffe27a, 0xffffff], 2.6, 3, 0.08, 0.8, 8);
        googly.happy();
      }
    }
    // the cup (the green dips toward it a little)
    lipT -= dt;
    const dc = Math.hypot(ball.x - CUP[0], ball.z - CUP[1]);
    if (!ball.air && dc < 0.6 && dc > 0.01 && speed() < 3) { ball.vx += ((CUP[0] - ball.x) / dc) * 2.2 * dt; ball.vz += ((CUP[1] - ball.z) / dc) * 2.2 * dt; }
    if (!ball.air && dc < 0.3) {
      if (speed() < SINK_V) { sink(); return; }
      if (lipT <= 0) { // too fast: it rattles over the hole
        lipT = 0.4;
        const a = (Math.random() - 0.5) * 0.7, c = Math.cos(a), s = Math.sin(a);
        const vx = ball.vx * c - ball.vz * s, vz = ball.vx * s + ball.vz * c;
        ball.vx = vx * 0.8; ball.vz = vz * 0.8;
        audio.tone(1800, 1200, 0.08, { type: 'triangle', vol: 0.1 });
        hud.pop(pick(['lip out!', 'so close!', 'too fast!']), CUP[0], 1, CUP[1], camera, 'red');
      }
    }
    if (!ball.air && speed() < 0.1) {
      ball.vx = ball.vz = 0;
      restT += dt;
      if (restT > 0.2) toAim();
    } else restT = 0;
  }

  function toAim() {
    if (strokes >= MAX_STROKES) { done(0, 'picked up'); return; }
    setState('aim');
    suggestAim();
    power = 0.6;
    hud.status(`stroke ${strokes + 1}  ·  par ${PAR}`);
  }

  let sinkAt = null;
  function sink() {
    setState('sunk');
    sinkAt = { x: ball.x, z: ball.z };
    ball.vx = ball.vz = 0;
    audio.tone(520, 260, 0.12, { type: 'sine', vol: 0.2 });
    audio.tone(330, 150, 0.18, { type: 'sine', vol: 0.16, delay: 0.09 });
    setTimeout(() => audio.noise(0.9, { vol: 0.07, freq: 1400, q: 0.4 }), 250); // the crowd goes wild (it's a duck)
    const n = POINTS[Math.min(strokes, POINTS.length - 1)];
    done(n, NAMES[Math.min(strokes, NAMES.length - 1)]);
  }

  function done(points, label) {
    if (state !== 'sunk') setState('sunk');
    if (points) ctx.addScore(points);
    hud.status(strokes === 1 && points ? 'hole in one!' : `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}`);
    hud.popXY(label, innerWidth / 2, innerHeight * 0.36, 'big');
    if (points) setTimeout(() => hud.popXY(`+${points}`, innerWidth / 2, innerHeight * 0.46, 'big gold'), 420);
    if (strokes === 1 && points) {
      audio.tada();
      hud.flash('rgba(255,240,120,0.5)', 400);
      for (let i = 0; i < 120; i++) fx.spawn(CUP[0] + (Math.random() - 0.5) * 6, 4 + Math.random() * 3, CUP[1] + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, pick([0xff4f93, 0xffc21a, 0x2fb36b, 0x5fd3ff, 0xffffff]), 0.12, 3, 3, 0.9);
    } else if (points >= 3) audio.collect(points * 3);
    else if (!points) audio.sad();
    googly.happy(3);
  }

  function splash() {
    setState('splash');
    for (const k in ev) delete ev[k];
    audio.noise(0.5, { vol: 0.22, freq: 900, f1: 200, q: 0.8, type: 'lowpass' });
    audio.tone(300, 90, 0.3, { vol: 0.1 });
    ctx.haptic(30);
    shake = 0.12;
    hud.pop(pick(['splash!', 'sploosh!', 'glug glug']), ball.x, 0.6, ball.z, camera, 'red');
    for (let i = 0; i < 26; i++) fx.spawn(ball.x, -0.4, ball.z, (Math.random() - 0.5) * 2.5, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5, pick([0xffffff, 0xb3e5fc, 0x4fc3f7]), 0.09, 0.7, 12, 0.6);
  }

  /* ---------- input ---------- */
  function onPress(e) {
    if (state === 'aim') { aiming = true; keyAim = false; anchor = [e.clientX, e.clientY]; touched = true; }
  }
  function onRelease() {
    if (state === 'aim' && aiming) shoot(power);
    aiming = false;
  }
  function onKey(e, dir, up) {
    if (up || state !== 'aim') return;
    if (dir) { keyAim = true; touched = true; }
    if (e.code === 'Space' || e.code === 'Enter') shoot(keyAim ? power : 0.6);
  }

  /* ---------- per frame ---------- */
  const dotM = new THREE.Matrix4(), dotP = new THREE.Vector3(), dotS = new THREE.Vector3(), dotQ = new THREE.Quaternion();
  const C_LO = new THREE.Color(0x7cff8a), C_HI = new THREE.Color(0xff3d6e);
  let t = 0;
  function update(dt) {
    t += dt;
    stateT += dt;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 12) { physStep(STEP); acc -= STEP; n++; }
    if (n === 12) acc = 0;
    if (ev.bonk && ev.bonk > 0.8) { audio.bonk(ev.bonk * 0.8); googly.kick(Math.min(3, ev.bonk * 0.3)); if (ev.bonk > 4) ctx.haptic(8); }
    if (ev.hop) { audio.hop(); hud.pop(pick(['hop!', 'boing!', 'yeet!']), ball.x, 1, ball.z, camera); shake = Math.max(shake, 0.06); }
    if (ev.land && ev.land > 1.5) audio.thud(ev.land * 0.5);
    for (const k in ev) delete ev[k];

    if (state === 'aim') {
      idleT += dt;
      if (aiming && ctx.input.active) {
        const px = anchor[0] - ctx.input.x, py = anchor[1] - ctx.input.y, m = Math.hypot(px, py);
        power = clamp(m / (ctx.input.R * 1.9), 0, 1);
        if (m > 4) aimAng = Math.atan2(py, px);
        idleT = 0;
      } else if (keyAim) {
        const k = ctx.keys;
        aimAng += (k.r - k.l) * 1.9 * dt;
        power = clamp(power + (k.u - k.d) * 0.7 * dt, 0.05, 1);
        if (k.r || k.l || k.u || k.d) idleT = 0;
      }
      if (!touched && stateT > 1.2) hud.status(ctx.coarse ? 'pull back, let go to putt' : 'drag back and let go (or arrows + space)');
      if (idleT > 40 && !sent) { done(0, 'the S got bored'); }
    }
    if (state === 'splash' && stateT > 1.1) {
      ball = S.makeBall([rest.x, rest.z]);
      qRoll.identity();
      strokes++; // penalty
      hud.pop('+1 stroke', ball.x, 1, ball.z, camera, 'red');
      googly.root.scale.setScalar(0.001);
      toAim();
    }
    if (state === 'sunk' && stateT > 2.6 && !sent) { sent = true; ctx.finish({ success: true }); }

    // the ball
    if (state === 'splash') {
      const k = clamp(stateT / 0.5, 0, 1);
      googly.root.position.set(ball.x, BALL_R - k * 1.2, ball.z);
      googly.root.scale.setScalar(Math.max(0.001, 1 - k));
    } else if (state === 'sunk' && sinkAt) {
      const k = clamp(stateT / 0.35, 0, 1);
      sinkAt.x = lerp(sinkAt.x, CUP[0], 0.3); sinkAt.z = lerp(sinkAt.z, CUP[1], 0.3);
      googly.root.position.set(sinkAt.x, BALL_R - easeOutCubic(k) * 0.55, sinkAt.z);
    } else {
      googly.root.position.set(ball.x, ball.y, ball.z);
      const s = googly.root.scale.x;
      googly.root.scale.setScalar(s < 1 ? Math.min(1, s + dt * 4) : 1);
      const sp = speed();
      if (sp > 1e-4 && !ball.air) { _d.set(ball.vz / sp, 0, -ball.vx / sp); _q.setFromAxisAngle(_d, (sp / BALL_R) * dt); qRoll.premultiply(_q); }
      googly.body.quaternion.copy(qRoll);
    }
    googly.update(dt, [ball.vx, ball.air ? ball.vy : 0, ball.vz], camera.position, { scared: (state === 'roll' && speed() > 6) || state === 'splash' || ball.air, dizzy: state === 'roll' && speed() < 1.2 && strokes > 4 });

    // aim arrow and putter
    const showAim = state === 'aim' && (aiming || keyAim);
    dots.visible = showAim;
    putter.visible = showAim || swing > 0;
    if (showAim) {
      const cx = Math.cos(aimAng), cz = Math.sin(aimAng), len = 0.5 + power * 2.6;
      dotMat.color.lerpColors(C_LO, C_HI, power);
      for (let i = 0; i < DOTS; i++) {
        const d = BALL_R + 0.15 + (i / (DOTS - 1)) * len, s = 1 - (i / DOTS) * 0.55;
        dots.setMatrixAt(i, dotM.compose(dotP.set(ball.x + cx * d, 0.07, ball.z + cz * d), dotQ, dotS.set(s, s, s)));
      }
      dots.instanceMatrix.needsUpdate = true;
      const back = BALL_R + 0.1 + power * 0.55;
      putter.position.set(ball.x - cx * back, 0, ball.z - cz * back);
      putter.rotation.y = -aimAng;
    } else if (swing > 0) {
      swing -= dt;
      const cx = Math.cos(aimAng), cz = Math.sin(aimAng);
      putter.position.x += cx * dt * 6; putter.position.z += cz * dt * 6;
      putter.position.y = (0.18 - swing) * 3;
    }

    // windmill, flag, gold s's, duck
    hub.rotation.z = sailAng;
    pennant.rotation.y = Math.sin(t * 2.3) * 0.25;
    pennant.scale.x = 1 + Math.sin(t * 5.1) * 0.05;
    flag.position.y = state === 'sunk' ? Math.min(0.5, stateT * 0.6) : 0;
    for (const tk of tokens) {
      if (tk.taken) {
        if (tk.pop > 0) { tk.pop += dt; const s = Math.max(0.001, 1 - tk.pop * 4); tk.mesh.scale.setScalar(s); tk.mesh.position.y += dt * 2; if (s <= 0.001) { tk.mesh.visible = false; tk.pop = 0; } }
        continue;
      }
      tk.mesh.position.set(tk.x, 0.62 + Math.sin(t * 3.2 + tk.x) * 0.06, tk.z);
      tk.mesh.rotation.y = t * 2.6;
    }
    const da = t * 0.16;
    duck.position.set(Math.cos(da) * 4.4, -0.42 + Math.sin(t * 2.1) * 0.02, Math.sin(da) * 6.6);
    duck.rotation.y = Math.atan2(-Math.cos(da) * 6.6, -Math.sin(da) * 4.4); // faces the way it swims
    _d.set(0.24, 0.36, 0).applyQuaternion(duck.quaternion).add(duck.position);
    duckEyes.root.position.copy(_d);
    duckEyes.update(dt, [0, 0, 0], googly.root.position, { lean: 0 }); // the duck watches you

    if (Math.random() < dt * 3) { const a = Math.random() * 6.28, r = 3 + Math.random() * 4; fx.spawn(Math.cos(a) * r, -0.41, Math.sin(a) * r * 1.4, 0, 0.4, 0, 0xffffff, 0.05, 0.6, 0, 1); }
    waterTex.offset.x = (t * 0.01) % 1;
    waterTex.offset.y = (t * 0.006) % 1;
    fx.update(dt);
    audio.roll(state === 'roll' && !ball.air ? speed() * 0.8 : 0);

    // camera: fixed on the whole green, a nudge toward the ball
    camT.copy(fit.target);
    camT.x += ball.x * 0.04;
    camT.z += ball.z * 0.03;
    camera.position.copy(camT).addScaledVector(fit.dir, fit.dist);
    if (shake > 0.002 && !ctx.reduceMotion) camera.position.add(_sh.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake *= Math.exp(-8 * dt);
    camera.lookAt(camT);
  }

  function music(step, when) {
    const bar = Math.floor(step / 16) % 4, s16 = step % 16;
    const chord = [[60, 64, 67, 71], [65, 69, 72, 76], [62, 65, 69, 72], [67, 71, 74, 77]][bar];
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
    if (s16 % 4 === 0) audio.tone(f(chord[0] - 24), f(chord[0] - 24), 0.5, { type: 'sine', vol: 0.07, at: when });
    if ([2, 6, 10, 14, 7].includes(s16)) { const m = chord[(s16 * 3 + bar) % 4]; audio.tone(f(m), f(m), 0.22, { type: 'triangle', vol: 0.035, at: when }); }
    if (s16 % 8 === 4) audio.noise(0.04, { vol: 0.02, freq: 6000, type: 'highpass', at: when });
  }

  googly.root.position.set(ball.x, ball.y, ball.z);
  update(0);

  return {
    scene, camera, update, resize, onPress, onRelease, onKey,
    ring: false, // it draws its own aiming arrow instead of the drag circle
    start() {
      audio.startLoop(96, music);
      toAim();
    },
    dispose() { audio.roll(0); },
    debug: () => ({ state, strokes, ball, aimAng, power, cup: CUP, tee: TEE, gateClosed: gateClosed(), sailAng, tokens, aiming }),
  };
}
