// s-verse #2: S Grand Prix. Three laps around the outside of a giant Cool S, against three rival karts.
// Point where you want to go: drag (the kart heads the way you drag) or hold the arrow keys.
// Gold s's on the track are worth 1 each, and you get a bonus for where you finish.

export default {
  id: 'race',
  name: 'S Grand Prix',
  verb: 'race!',
  author: 'stutxo',
  theme: { font: 'Racing Sans One', ink: '#ffffff', glow: '#b0124f', card: '#ffd21f', cardInk: '#151515', accent: '#d81b60', stick: '#ffffff' },
  create(ctx) { return createRace(ctx); },
};

const LAPS = 3;
const N = 420;                // samples around the track's centerline
const HALF_W = 0.6;           // half the track's width
const OFF = HALF_W + 0.17;    // the track's centerline runs this far outside the S
const S_TOP = 0.26;           // the S stands this tall in the middle of the circuit
const KART_R = 0.17;          // karts bump each other like circles this big
const TOP = 4.7;              // top speed, units per second
const ACCEL = 5.2, COAST = 1.8, TURN = 4.4, GRIP = 7, SCRUB = 1.1;
const GRASS = 0.45;           // top speed on the grass, as a fraction
const BOOST = 1.55;           // top speed on a boost arrow, as a multiple
const ZOOM = 0.64;            // how close the camera gets while you race
const BONUS = [3, 2, 1, 0];   // gold s's for finishing 1st, 2nd, 3rd, 4th
const DRIVERS = [
  { name: 'you', body: 0xff4f93, ball: ['#ff4f93', '#ff86b8', '#ffe0ec'], player: true, skill: 1, slot: 2 },
  { name: 'zippy', body: 0xffc21a, ball: ['#ffc21a', '#ffe27a', '#fff6d6'], skill: 0.955, slot: 0 },
  { name: 'blu', body: 0x2fa8ff, ball: ['#2fa8ff', '#86ccff', '#e0f2ff'], skill: 0.975, slot: 1 },
  { name: 'verde', body: 0x34c759, ball: ['#34c759', '#86e3a0', '#e2fae8'], skill: 0.935, slot: 3 },
];
const SLOTS = [{ back: 8, lat: -0.25 }, { back: 8, lat: 0.25 }, { back: 18, lat: -0.25 }, { back: 18, lat: 0.25 }];

// round each corner of a closed polygon with an arc of radius r; straight edges stay straight
function fillet(poly, r, seg) {
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    let ax = p0[0] - p1[0], az = p0[1] - p1[1], bx = p2[0] - p1[0], bz = p2[1] - p1[1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const ang = Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz)));
    if (ang > Math.PI - 1e-3) { out.push(p1); continue; }
    const t = Math.min(r / Math.tan(ang / 2), la * 0.45, lb * 0.45), rr = t * Math.tan(ang / 2);
    let mx = ax + bx, mz = az + bz;
    const ml = Math.hypot(mx, mz);
    mx /= ml; mz /= ml;
    const cd = rr / Math.sin(ang / 2), cx = p1[0] + mx * cd, cz = p1[1] + mz * cd;
    const a0 = Math.atan2(p1[1] + az * t - cz, p1[0] + ax * t - cx), a1 = Math.atan2(p1[1] + bz * t - cz, p1[0] + bx * t - cx);
    const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    for (let k = 0; k <= seg; k++) out.push([cx + Math.cos(a0 + (da * k) / seg) * rr, cz + Math.sin(a0 + (da * k) / seg) * rr]);
  }
  return out;
}

function createRace(ctx) {
  const { THREE, S, audio, hud } = ctx;
  const { clamp } = S;
  const { lerp, easeOutCubic, pick, lowEnd } = ctx;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const hard = Math.min(ctx.loop, 3); // each time around the multiverse the rivals get a bit quicker

  /* ---------- the track: the Cool S's outline, pushed outward, with its corners rounded just enough to drive ---------- */
  const T = S.resampleLoop(fillet(S.insetPolygon(S.OUTLINE, -OFF), 0.7, 10), N);
  let i0 = 0;
  { let best = Infinity; T.pts.forEach((p, i) => { const d = Math.hypot(p.x + 1.38, p.z + 4.7); if (d < best) { best = d; i0 = i; } }); }
  const P = T.pts.slice(i0).concat(T.pts.slice(0, i0)); // lap starts halfway up the top-left diagonal
  const LEN = T.len, DS = LEN / N;
  P.forEach((p, i) => { p.s = i * DS; });
  const at = (i) => P[((Math.round(i) % N) + N) % N];
  const nearest = (x, z) => { let bi = 0, bd = Infinity; P.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const distToTrack = (x, z) => { let bd = Infinity; for (const p of P) bd = Math.min(bd, (p.x - x) ** 2 + (p.z - z) ** 2); return Math.sqrt(bd); };
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = at(i - 4), b = at(i + 4);
    curv[i] = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz) / (8 * DS);
  }

  /* ---------- scene ---------- */
  const SKY = 0xa9dc8f;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 30, 70);
  scene.environment = ctx.envTexture();
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5d8a46, 1.05));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
  sun.position.set(-5, 14, -3);
  sun.target.position.set(0, 0, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  { const c = sun.shadow.camera; c.left = -8; c.right = 8; c.top = 9; c.bottom = -9; c.near = 1; c.far = 40; c.updateProjectionMatrix(); }
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const grassTex = ctx.canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#76bf5d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#84ca6a'; g.fillRect(0, 0, w, h / 2);
    for (let i = 0; i < 900; i++) { g.fillStyle = i % 2 ? 'rgba(40,90,30,0.10)' : 'rgba(255,255,255,0.06)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(16, 16);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  // a strip that follows the track between two sideways offsets
  function ribbon(o0, o1, y) {
    const a = Math.min(o0, o1), b = Math.max(o0, o1), pos = [], uv = [], ind = [];
    for (let k = 0; k <= N; k++) {
      const p = at(k), nx = -p.tz, nz = p.tx, v = k * DS;
      pos.push(p.x + nx * a, y, p.z + nz * a, p.x + nx * b, y, p.z + nz * b);
      uv.push(0, v, 1, v);
      if (k < N) { const j = 2 * k; ind.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind);
    // flat ground: every normal points straight up (where a tight bend folds the inside edge over, this keeps it seamless)
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    return geo;
  }
  const asphalt = ctx.canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#4a4e58'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  const road = new THREE.Mesh(ribbon(-HALF_W, HALF_W, 0), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, side: THREE.DoubleSide }));
  road.receiveShadow = true;
  scene.add(road);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const sg of [-1, 1]) {
    const m = new THREE.Mesh(ribbon(sg * (HALF_W - 0.075), sg * (HALF_W - 0.035), 0.002), lineMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // red and white kerbs on the bends
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), YUP = new THREE.Vector3(0, 1, 0);
  const kerbSpots = [];
  for (let i = 0; i < N; i += 2) if (Math.abs(curv[i]) > 0.42) for (const sg of [-1, 1]) kerbSpots.push([i, sg]);
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), Math.max(1, kerbSpots.length));
  const RED = new THREE.Color(0xe53935), WHITE = new THREE.Color(0xffffff);
  kerbSpots.forEach(([i, sg], k) => {
    const p = at(i), off = sg * (HALF_W + 0.05);
    q.setFromAxisAngle(YUP, -Math.atan2(p.tz, p.tx));
    kerbs.setMatrixAt(k, m4.compose(v3.set(p.x - p.tz * off, 0.012, p.z + p.tx * off), q, sc.set(DS * 2.05, 0.024, 0.1)));
    kerbs.setColorAt(k, (i >> 1) % 2 ? RED : WHITE);
  });
  kerbs.receiveShadow = true;
  scene.add(kerbs);

  // the classic Cool S itself, standing in the middle: the notebook's S, all 14 lines inked on
  const paper = ctx.canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#fcfdfa'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(118,163,222,0.5)'; g.fillRect(0, h - 4, w, 4);
  });
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  paper.repeat.set(1 / 0.75, 1 / 0.75);
  const sShape = new THREE.Shape();
  S.OUTLINE.forEach(([x, z], i) => (i ? sShape.lineTo(x, -z) : sShape.moveTo(x, -z)));
  const sGeo = new THREE.ExtrudeGeometry(sShape, { depth: S_TOP, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 1 });
  sGeo.rotateX(-Math.PI / 2);
  sGeo.translate(0, -0.04, 0);
  const bigS = new THREE.Mesh(sGeo, [new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xe9ece6, roughness: 0.95 })]);
  bigS.castShadow = bigS.receiveShadow = true;
  scene.add(bigS);
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x2335a8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const inkCyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(S.INK_R, S.INK_R, 1, 14, 1, true), ink, S.STROKES.length);
  const inkCap = new THREE.InstancedMesh(new THREE.SphereGeometry(S.INK_R, 14, 10), ink, S.STROKES.length * 2);
  {
    const d = new THREE.Vector3(), Q0 = new THREE.Quaternion(), y = S_TOP + S.INK_R * 0.6;
    S.STROKES.forEach((w, i) => {
      q.setFromUnitVectors(YUP, d.set(w.dx, 0, w.dz).normalize());
      inkCyl.setMatrixAt(i, m4.compose(v3.set((w.ax + w.bx) / 2, y, (w.az + w.bz) / 2), q, sc.set(1, w.len, 1)));
      inkCap.setMatrixAt(2 * i, m4.compose(v3.set(w.ax, y, w.az), Q0, sc.set(1, 1, 1)));
      inkCap.setMatrixAt(2 * i + 1, m4.compose(v3.set(w.bx, y, w.bz), Q0, sc.set(1, 1, 1)));
    });
  }
  for (const m of [inkCyl, inkCap]) { m.castShadow = true; scene.add(m); }

  /* ---------- start line, gantry and its lights ---------- */
  const p0 = at(0), n0x = -p0.tz, n0z = p0.tx, yaw0 = Math.atan2(-n0z, n0x);
  const checker = ctx.canvasTexture(176, 32, (g) => { for (let x = 0; x < 11; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#141414' : '#ffffff'; g.fillRect(x * 16, y * 16, 16, 16); } });
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 0.22).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  startLine.position.set(p0.x, 0.003, p0.z);
  startLine.rotation.y = yaw0;
  startLine.receiveShadow = true;
  scene.add(startLine);
  const gantry = new THREE.Group(); // local x runs across the track, local +z faces the karts coming up to the line
  gantry.position.set(p0.x, 0, p0.z);
  gantry.rotation.y = yaw0;
  scene.add(gantry);
  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.4, metalness: 0.6 });
  const POST_IN = HALF_W + 0.09, POST_OUT = -(HALF_W + 0.24), GW = (POST_IN - POST_OUT) / 2, GX = (POST_IN + POST_OUT) / 2;
  for (const sx of [POST_OUT, POST_IN]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 10), metal);
    post.position.set(sx, 0.525, 0);
    post.castShadow = true;
    gantry.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(GW * 2 + 0.12, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xd81b60, roughness: 0.5 }));
  beam.position.set(GX, 1.05, 0);
  beam.castShadow = true;
  gantry.add(beam);
  const drawSign = (g, w, h) => {
    g.fillStyle = '#d81b60'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '34px "Racing Sans One", Impact, "Arial Black", sans-serif';
    g.fillText('S GRAND PRIX', w / 2, h / 2 + 2);
  };
  const signTex = ctx.canvasTexture(320, 56, drawSign);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2 - 0.1, 0.18), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(GX, 1.05, 0.052);
  gantry.add(sign);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('34px "Racing Sans One"').then(() => { drawSign(signTex.image.getContext('2d'), 320, 56); signTex.needsUpdate = true; }).catch(() => {});
  }
  const lamps = [0, 1, 2].map((k) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a0707, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.3 });
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), mat);
    l.position.set(GX + (k - 1) * 0.24, 1.21, 0);
    gantry.add(l);
    return mat;
  });
  function setLamps(n, green) {
    lamps.forEach((m, k) => {
      m.emissive.setHex(green ? 0x22ff55 : 0xff2020);
      m.color.setHex(green ? 0x0a3312 : 0x2a0707);
      m.emissiveIntensity = green || k < n ? 2.2 : 0;
    });
  }

  /* ---------- boost arrows and gold s's ---------- */
  const chevrons = ctx.canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#ff9800'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff176';
    for (let k = 0; k < 2; k++) {
      const x = k * 64;
      g.beginPath(); g.moveTo(x + 10, 6); g.lineTo(x + 34, 6); g.lineTo(x + 58, h / 2); g.lineTo(x + 34, h - 6); g.lineTo(x + 10, h - 6); g.lineTo(x + 34, h / 2); g.closePath(); g.fill();
    }
  });
  chevrons.wrapS = THREE.RepeatWrapping;
  const padMat = new THREE.MeshStandardMaterial({ map: chevrons, emissive: 0xff8f00, emissiveMap: chevrons, emissiveIntensity: 0.55, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pads = [[1.38, -4.7, 0.22], [2.77, 1.95, -0.2], [-1.38, 4.7, -0.22]].map(([x, z, lat]) => {
    const i = nearest(x, z), p = at(i);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42).rotateX(-Math.PI / 2), padMat);
    m.position.set(p.x - p.tz * lat, 0.004, p.z + p.tx * lat);
    m.rotation.y = Math.atan2(-p.tz, p.tx);
    m.receiveShadow = true;
    scene.add(m);
    return { i, lat };
  });

  const GOLD = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 });
  const mini = ctx.miniS(0.068, 0.06, 0.016);
  const tokens = [[2.77, -2.0], [-2.77, 2.0]].map(([x, z]) => {
    const mesh = new THREE.Mesh(mini.geo, GOLD);
    mesh.castShadow = true;
    scene.add(mesh);
    return { i: nearest(x, z), lat: 0, x: 0, z: 0, mesh, taken: false, pop: 0 };
  });
  function placeTokens(lap) {
    tokens.forEach((t, k) => {
      t.lat = ((lap + k) % 2 ? 1 : -1) * 0.38; // off the racing line: steer for them
      const p = at(t.i);
      t.x = p.x - p.tz * t.lat; t.z = p.z + p.tx * t.lat;
      t.taken = false; t.pop = 0;
      t.mesh.visible = true;
    });
  }
  placeTokens(1);

  /* ---------- scenery: grandstands, trees, tyre walls ---------- */
  const rnd = S.mulberry32(20260611);
  const CROWD = [0xff4f93, 0xffc21a, 0x2fa8ff, 0x34c759, 0xffffff, 0xb98cff, 0xff7043, 0x263238];
  const stands = [];
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 96);
  heads.castShadow = true;
  const standMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd81b60, roughness: 0.6 });
  const fans = [];
  for (const [x, z, face] of [[4.0, -2, -1], [-4.0, 2, 1]]) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = face > 0 ? Math.PI : 0; // local -x points at the track
    scene.add(grp);
    for (let row = 0; row < 3; row++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14 * (row + 1), 1.9), standMat);
      step.position.set(row * 0.26, 0.07 * (row + 1), 0);
      step.castShadow = step.receiveShadow = true;
      grp.add(step);
      for (let k = 0; k < 16; k++) fans.push({ grp, x: row * 0.26, y: 0.14 * (row + 1) + 0.07, z: -0.88 + k * 0.117 + (rnd() - 0.5) * 0.03, ph: rnd() * 6.3, c: CROWD[(rnd() * CROWD.length) | 0] });
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 2.0), roofMat);
    roof.position.set(0.3, 0.86, 0);
    roof.castShadow = true;
    grp.add(roof);
    stands.push(grp);
  }
  heads.count = fans.length;
  const _c = new THREE.Color(), _wp = new THREE.Vector3();
  fans.forEach((f, k) => heads.setColorAt(k, _c.setHex(f.c)));
  scene.add(heads);
  let cheer = 0;
  function updateFans(t) {
    for (let k = 0; k < fans.length; k++) {
      const f = fans[k], jump = Math.max(0, Math.sin(t * (cheer > 0 ? 14 : 3) + f.ph)) * (cheer > 0 ? 0.12 : 0.025);
      _wp.set(f.x, f.y + jump, f.z);
      f.grp.localToWorld(_wp);
      heads.setMatrixAt(k, m4.compose(_wp, q.identity(), sc.set(1, 1, 1)));
    }
    heads.instanceMatrix.needsUpdate = true;
  }

  const treeSpots = [];
  for (let tries = 0; tries < 900 && treeSpots.length < 70; tries++) {
    const x = (rnd() - 0.5) * 15, z = (rnd() - 0.5) * 21;
    if (S.pointInS(x, z) || S.edgeDistance(x, z) < 0.5) continue;
    if (distToTrack(x, z) < HALF_W + 0.75) continue;
    if (Math.abs(Math.abs(x) - 4.2) < 0.8 && Math.abs(z - (x > 0 ? -2 : 2)) < 1.4) continue; // the grandstands
    if (treeSpots.some(([a, b]) => Math.hypot(a - x, b - z) < 0.55)) continue;
    treeSpots.push([x, z, 0.75 + rnd() * 0.6]);
  }
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 }), treeSpots.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.9 }), treeSpots.length);
  treeSpots.forEach(([x, z, s], k) => {
    leaves.setMatrixAt(k, m4.compose(v3.set(x, 0.2 + 0.35 * s, z), q.identity(), sc.set(s, s, s)));
    leaves.setColorAt(k, _c.setHex([0x2e7d32, 0x388e3c, 0x1b5e20, 0x43a047][k % 4]));
    trunks.setMatrixAt(k, m4.compose(v3.set(x, 0.11, z), q.identity(), sc.set(s, 1, s)));
  });
  leaves.castShadow = trunks.castShadow = true;
  scene.add(leaves, trunks);

  const tyreSpots = [];
  for (const sg of [-1, 1]) {
    let tip = P[0];
    for (const p of P) if (p.z * sg > tip.z * sg) tip = p;
    for (let k = -3; k <= 3; k++) {
      const out = HALF_W + 0.5 - Math.abs(k) * 0.05; // the outside is the -normal side
      tyreSpots.push([tip.x + tip.tz * out + tip.tx * k * 0.21, tip.z - tip.tx * out + tip.tz * k * 0.21]);
    }
  }
  const tyres = new THREE.InstancedMesh(new THREE.TorusGeometry(0.085, 0.04, 8, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.85 }), tyreSpots.length * 2);
  tyreSpots.forEach(([x, z], k) => {
    for (let h = 0; h < 2; h++) tyres.setMatrixAt(k * 2 + h, m4.compose(v3.set(x, 0.04 + h * 0.075, z), q.identity(), sc.set(1, 1, 1)));
  });
  tyres.castShadow = true;
  scene.add(tyres);

  /* ---------- karts ---------- */
  const wheelGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.055, 14).rotateX(Math.PI / 2);
  const bodyGeo = new THREE.BoxGeometry(0.44, 0.09, 0.27), noseGeo = new THREE.BoxGeometry(0.14, 0.06, 0.21), wingGeo = new THREE.BoxGeometry(0.06, 0.035, 0.32);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.8 });
  const karts = DRIVERS.map((d) => {
    const g = new THREE.Group(), lean = new THREE.Group();
    g.add(lean);
    const paint = new THREE.MeshPhysicalMaterial({ color: d.body, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.body).multiplyScalar(0.55), roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, paint); body.position.y = 0.1;
    const nose = new THREE.Mesh(noseGeo, dark); nose.position.set(0.27, 0.085, 0);
    const wing = new THREE.Mesh(wingGeo, dark); wing.position.set(-0.23, 0.2, 0);
    lean.add(body, nose, wing);
    for (const [wx, wz] of [[0.14, 0.15], [0.14, -0.15], [-0.15, 0.15], [-0.15, -0.15]]) {
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.position.set(wx, 0.062, wz);
      lean.add(w);
    }
    lean.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    const googly = ctx.makeGoogly({
      radius: 0.12, faceUp: [0, 0, -1],
      material: new THREE.MeshPhysicalMaterial({ map: ctx.ballTexture(...d.ball), roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    });
    scene.add(googly.root);
    const slot = SLOTS[d.slot], p = at(-slot.back);
    return {
      ...d, g, lean, googly, skill: d.player ? 1 : d.skill + hard * 0.02,
      x: p.x - p.tz * slot.lat, z: p.z + p.tx * slot.lat, h: Math.atan2(p.tz, p.tx), v: 0, vx: 0, vz: 0,
      i: (N - slot.back) % N, prog: -slot.back * DS, lat: slot.lat, along: 0, off: 0,
      lane: slot.lat, laneT: 1 + rnd() * 2, boost: 0, lost: 0, hop: 0, bumpT: 0, turn: 0, grass: false,
      done: false, place: 0, finishT: 0, throttle: 0,
    };
  });
  const player = karts[0];
  const fx = ctx.makeParticles(scene, 360, 0);

  /* ---------- camera ---------- */
  const FIT_PTS = ctx.sFitPoints(1.7, [0, 0.5], 0);
  let fit = null, blend = 0, shake = 0;
  const camT = new THREE.Vector3(), follow = { x: player.x, z: player.z }, _sh = new THREE.Vector3();
  function resize() {
    const aspect = innerWidth / innerHeight;
    fit = ctx.fitPerspective(camera, FIT_PTS, { pitch: THREE.MathUtils.degToRad(aspect < 0.7 ? 62 : aspect < 1.1 ? 57 : 52) });
  }
  resize();
  function updateCamera(dt) {
    const want = state === 'race' || (state === 'count' && stateT > 0.6) ? 1 : 0;
    blend = lerp(blend, want, 1 - Math.exp(-(want ? 1.5 : 1.1) * dt));
    const kf = 1 - Math.exp(-4.5 * dt);
    follow.x = lerp(follow.x, player.x + player.vx * 0.3, kf);
    follow.z = lerp(follow.z, player.z + player.vz * 0.3, kf);
    const e = easeOutCubic(clamp(blend, 0, 1));
    camT.set(lerp(fit.target.x, follow.x, e), lerp(fit.target.y, 0, e), lerp(fit.target.z, follow.z, e));
    camera.position.copy(camT).addScaledVector(fit.dir, lerp(fit.dist, fit.dist * ZOOM, e));
    if (shake > 0.002 && !ctx.reduceMotion) camera.position.add(_sh.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake *= Math.exp(-8 * dt);
    camera.lookAt(camT);
  }

  /* ---------- driving ---------- */
  function locate(k) {
    // only look near where the kart was, so cutting across the infield doesn't count as progress
    let bd = Infinity, bi = 0;
    for (let d = -14; d <= 14; d++) {
      const p = at(k.i + d), dd = (p.x - k.x) ** 2 + (p.z - k.z) ** 2;
      if (dd < bd) { bd = dd; bi = d; }
    }
    if (bi) { k.i = (k.i + bi + N) % N; k.prog += bi * DS; }
    const p = P[k.i];
    k.lat = (k.x - p.x) * -p.tz + (k.z - p.z) * p.tx;
    k.along = (k.x - p.x) * p.tx + (k.z - p.z) * p.tz;
    k.off = Math.sqrt(bd);
  }

  function stepKart(k, wantH, throttle, dt) {
    if (wantH !== null) {
      const dh = wrap(wantH - k.h), rate = TURN * (0.55 + 0.45 * Math.min(1, Math.abs(k.v) / 2.5));
      const turn = clamp(dh, -rate * dt, rate * dt);
      k.h = wrap(k.h + turn);
      k.turn = turn / dt;
      k.v *= Math.exp(-SCRUB * (Math.abs(k.turn) / TURN) * dt); // hard turns scrub off speed
    } else k.turn *= 0.8;
    k.grass = k.off > HALF_W + 0.04;
    const top = TOP * k.skill * (k.grass ? GRASS : 1) * (k.boost > 0 ? BOOST : 1), target = top * throttle;
    if (throttle > 0.01 || k.v > target) k.v += clamp(target - k.v, -(k.grass ? 9 : 6) * dt, ACCEL * (k.boost > 0 ? 2 : 1) * dt);
    else k.v = Math.max(0, k.v - COAST * dt);
    const cx = Math.cos(k.h), cz = Math.sin(k.h), gr = 1 - Math.exp(-(k.grass ? GRIP * 0.6 : GRIP) * dt);
    k.vx += (cx * k.v - k.vx) * gr;
    k.vz += (cz * k.v - k.vz) * gr;
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    if (Math.abs(k.x) > 6.6) { k.x = Math.sign(k.x) * 6.6; k.vx = 0; }
    if (Math.abs(k.z) > 9) { k.z = Math.sign(k.z) * 9; k.vz = 0; }
    keepOffS(k);
    k.boost = Math.max(0, k.boost - dt);
    locate(k);
  }

  // the S is solid: karts bump off it like a wall
  const wallP = [0, 0, 0];
  function keepOffS(k) {
    const inside = S.pointInS(k.x, k.z);
    let bd = Infinity, px = 0, pz = 0;
    const O = S.OUTLINE;
    for (let i = 0; i < O.length; i++) {
      const [ax, az] = O[i], [bx, bz] = O[(i + 1) % O.length], dx = bx - ax, dz = bz - az;
      S.nearestOnSeg(k.x, k.z, ax, az, dx, dz, dx * dx + dz * dz, wallP);
      const d = Math.hypot(k.x - wallP[0], k.z - wallP[1]);
      if (d < bd) { bd = d; px = wallP[0]; pz = wallP[1]; }
    }
    if (!inside && bd >= KART_R) return;
    let nx = k.x - px, nz = k.z - pz;
    const l = Math.hypot(nx, nz) || 1;
    nx = (inside ? -nx : nx) / l; nz = (inside ? -nz : nz) / l;
    k.x = px + nx * KART_R; k.z = pz + nz * KART_R;
    const vn = k.vx * nx + k.vz * nz;
    if (vn < 0) {
      k.vx -= 1.35 * vn * nx; k.vz -= 1.35 * vn * nz;
      k.v = Math.max(0, k.vx * Math.cos(k.h) + k.vz * Math.sin(k.h));
      if (k.player && -vn > 1.2 && k.bumpT <= 0) { audio.bonk(-vn * 1.6); k.bumpT = 0.4; k.googly.kick(2); shake = Math.max(shake, 0.04); }
    }
  }

  function aiControl(k) {
    if (k.laneT <= 0) { k.lane = (rnd() * 2 - 1) * 0.32; k.laneT = 1.5 + rnd() * 2.5; }
    // don't drive up someone's exhaust pipe
    for (const o of karts) {
      if (o === k) continue;
      const ahead = o.prog + o.along - (k.prog + k.along);
      if (ahead > 0 && ahead < 0.75 && Math.abs(o.lat - k.lane) < 0.3) { k.lane = clamp(o.lat + (o.lat > 0 ? -0.42 : 0.42), -0.38, 0.38); k.laneT = 1.2; }
    }
    const p = at(k.i + (0.7 + Math.abs(k.v) * 0.16) / DS);
    const wantH = Math.atan2(p.z + p.tx * k.lane - k.z, p.x - p.tz * k.lane - k.x);
    let bend = 0;
    for (let d = 3; d <= 33; d += 3) bend = Math.max(bend, Math.abs(curv[(k.i + d) % N]));
    let throttle = clamp(1.04 - Math.max(0, bend - 1.1) * 0.3, 0.75, 1);
    if (!k.player && state === 'race' && !player.done) {
      const gap = k.prog - player.prog; // rubber band: keep it close
      throttle *= gap > 2.5 ? 0.9 : gap < -2 ? 1.1 : 1;
    }
    return { wantH, throttle };
  }

  let touched = false, wrongT = 0;
  function playerControl() {
    if (player.done) return aiControl(player); // victory lap on autopilot
    const [sx, sy] = ctx.readStick(), m = Math.hypot(sx, sy);
    if (m < 0.12) return { wantH: null, throttle: 0 };
    touched = true;
    return { wantH: Math.atan2(sy, sx), throttle: Math.min(1, m * 1.35) };
  }

  function bumpKarts() {
    for (let a = 0; a < karts.length; a++) for (let b = a + 1; b < karts.length; b++) {
      const A = karts[a], B = karts[b];
      let dx = B.x - A.x, dz = B.z - A.z;
      const d = Math.hypot(dx, dz);
      if (d >= KART_R * 2 || d < 1e-6) continue;
      dx /= d; dz /= d;
      const push = (KART_R * 2 - d) / 2;
      A.x -= dx * push; A.z -= dz * push; B.x += dx * push; B.z += dz * push;
      const rel = (B.vx - A.vx) * dx + (B.vz - A.vz) * dz;
      if (rel >= 0) continue;
      const j = -rel * 0.75;
      A.vx -= dx * j; A.vz -= dz * j; B.vx += dx * j; B.vz += dz * j;
      for (const K of [A, B]) K.v = Math.max(-1, K.vx * Math.cos(K.h) + K.vz * Math.sin(K.h));
      if ((A.player || B.player) && -rel > 0.8) {
        audio.bonk(-rel * 2.2);
        ctx.haptic(10);
        A.bumpT = B.bumpT = 0.5;
        A.googly.kick(2); B.googly.kick(2);
        shake = Math.max(shake, 0.05);
        for (let n = 0; n < 6; n++) fx.spawn((A.x + B.x) / 2, 0.15, (A.z + B.z) / 2, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0xfff176, 0.04, 0.35, 9, 1.5);
      }
    }
  }

  function respawn(k) {
    const p = P[k.i];
    k.x = p.x; k.z = p.z; k.h = Math.atan2(p.tz, p.tx);
    k.v = 0.8; k.vx = p.tx * 0.8; k.vz = p.tz * 0.8;
    k.lost = 0; k.hop = 0.9; k.boost = 0;
    locate(k);
    if (k.player) { hud.pop('oops!', k.x, 0.8, k.z, camera, 'red'); audio.boing(); }
  }

  /* ---------- race state ---------- */
  let state = 'grid', stateT = 0, raceT = 0, finished = 0, place = 3, lastPlace = 3, overtakeT = 0, lapShown = 1, done = false, sent = false;
  let engine = null;
  const setState = (s) => { state = s; stateT = 0; };
  const lapOf = (k) => clamp(Math.floor(k.prog / LEN) + 1, 1, LAPS);
  const STEP = 1 / 120;
  let acc = 0;

  function music(step, when) {
    const bar = Math.floor(step / 16) % 4, s16 = step % 16, root = 110 * Math.pow(2, [0, 0, 5, 7][bar] / 12);
    if (s16 % 2 === 0) { const f = root * Math.pow(2, [0, 0, 12, 0, 7, 0, 10, 12][s16 / 2] / 12); audio.tone(f, f, 0.1, { type: 'square', vol: 0.035, at: when }); }
    if (s16 === 0 || s16 === 8 || s16 === 10) audio.tone(140, 45, 0.14, { vol: 0.11, at: when });
    if (s16 === 4 || s16 === 12) audio.noise(0.09, { vol: 0.045, freq: 2000, q: 0.7, at: when });
    if (s16 % 2 === 1) audio.noise(0.025, { vol: 0.018, freq: 8000, type: 'highpass', at: when });
  }

  function countdown() {
    const t = stateT, beats = [0.6, 1.2, 1.8];
    let n = 0;
    for (const b of beats) if (t >= b) n++;
    if (n > lampsLit) {
      lampsLit = n;
      setLamps(n, false);
      audio.tone(440, 440, 0.2, { type: 'square', vol: 0.08 });
      hud.popXY(String(4 - n), innerWidth / 2, innerHeight * 0.42, 'big');
    }
    if (t >= 2.4) {
      setLamps(3, true);
      audio.tone(880, 880, 0.45, { type: 'square', vol: 0.09 });
      hud.popXY('GO!', innerWidth / 2, innerHeight * 0.42, 'big');
      hud.flash('rgba(255,255,255,0.35)', 260);
      audio.startLoop(152, music);
      setState('race');
    }
  }
  let lampsLit = 0;

  function onToken(t) {
    t.taken = true;
    t.pop = 0.001;
    const total = ctx.addScore(1);
    audio.collect(total);
    ctx.haptic(12);
    hud.pop('+1', t.x, 0.7, t.z, camera, 'gold');
    fx.burst(t.x, 0.3, t.z, 14, [0xffc21a, 0xffe27a, 0xffffff], 2.4, 2.6, 0.07, 0.7, 7);
    player.googly.happy();
  }

  function finishPlayer() {
    player.done = true;
    finished++;
    player.place = finished;
    const bonus = BONUS[finished - 1] || 0;
    if (bonus) ctx.addScore(bonus);
    const label = S.ordinal(finished) + '!';
    hud.popXY(label, innerWidth / 2, innerHeight * 0.38, 'big');
    if (bonus) setTimeout(() => hud.popXY(`+${bonus}`, innerWidth / 2, innerHeight * 0.48, 'big gold'), 380);
    if (finished === 1) {
      audio.tada();
      for (let n = 0; n < 90; n++) fx.spawn(player.x + (Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, player.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, pick([0xff4f93, 0xffc21a, 0x2fa8ff, 0x34c759, 0xffffff]), 0.07, 2.4, 3, 0.9);
    } else audio.collect(4 - finished);
    cheer = 3;
    player.googly.happy(2);
    hud.status(`${S.ordinal(finished)} place`);
    done = true;
    stateT = 0;
  }

  function physics(dt) {
    const racing = state === 'race';
    for (const k of karts) {
      if (!racing) { k.throttle = 0; continue; }
      const c = k.player ? playerControl() : aiControl(k);
      k.throttle = c.throttle;
      k.laneT -= dt;
      stepKart(k, c.wantH, c.throttle, dt);
      for (const pd of pads) {
        const ds = Math.abs(((k.i - pd.i + N + N / 2) % N) - N / 2) * DS;
        if (ds < 0.3 && Math.abs(k.lat - pd.lat) < 0.24 && k.boost < 0.6) {
          k.boost = 0.95;
          if (k.player) { audio.tone(260, 1100, 0.35, { type: 'sawtooth', vol: 0.06 }); audio.noise(0.4, { vol: 0.08, freq: 600, f1: 3000, q: 1.2 }); hud.pop(pick(['boost!', 'zoom!', 'nyoom!']), k.x, 0.8, k.z, camera); shake = Math.max(shake, 0.04); }
        }
      }
      if (k.off > HALF_W + 1.2) k.lost += dt; else k.lost = Math.max(0, k.lost - dt * 2);
      if (k.lost > 0.9) respawn(k);
      if (!k.done && k.prog >= LAPS * LEN) {
        if (k.player) finishPlayer();
        else { k.done = true; finished++; k.place = finished; }
      }
    }
    if (racing) bumpKarts();
    // gold s's: yours to grab
    if (racing && !player.done) for (const t of tokens) if (!t.taken && Math.hypot(player.x - t.x, player.z - t.z) < 0.3) onToken(t);
  }

  function update(dt) {
    stateT += dt;
    if (state === 'count') countdown();
    if (state === 'race') raceT += dt;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 10) { physics(STEP); acc -= STEP; n++; }
    if (n === 10) acc = 0;

    if (state === 'race') {
      const order = karts.slice().sort((a, b) => (b.done - a.done) || (a.done ? a.place - b.place : (b.prog + b.along) - (a.prog + a.along)));
      place = order.indexOf(player) + 1;
      overtakeT -= dt;
      if (!player.done) {
        if (place < lastPlace && overtakeT <= 0 && raceT > 2) { hud.pop(pick(['overtake!', 'see ya!', 'passed!']), player.x, 0.8, player.z, camera); overtakeT = 1.4; audio.tone(660, 990, 0.15, { type: 'triangle', vol: 0.1 }); }
        lastPlace = place;
        const lap = lapOf(player);
        if (lap > lapShown) {
          lapShown = lap;
          placeTokens(lap);
          hud.popXY(lap === LAPS ? 'final lap!' : `lap ${lap}`, innerWidth / 2, innerHeight * 0.3, 'big');
          audio.tone(880, 880, 0.1, { type: 'triangle', vol: 0.12 }); audio.tone(1320, 1320, 0.16, { type: 'triangle', vol: 0.1, delay: 0.1 });
        }
        const p = P[player.i];
        wrongT = player.v > 1 && Math.cos(player.h) * p.tx + Math.sin(player.h) * p.tz < -0.35 ? wrongT + dt : 0;
        hud.status(wrongT > 0.8 ? 'wrong way!' : !touched && raceT > 1.5 ? (ctx.coarse ? 'drag to drive!' : 'arrow keys to drive!') : `lap ${lap}/${LAPS}  ·  ${S.ordinal(place)}`);
      }
      if (done && stateT > 2.6 && !sent) { sent = true; ctx.finish({ success: true }); }
      if (!done && raceT > 80) { finished = Math.max(finished, place - 1); finishPlayer(); } // somebody fell asleep at the wheel
    }
    visuals(dt);
  }

  /* ---------- per-frame looks ---------- */
  const look = new THREE.Vector3();
  let t = 0;
  function visuals(dt) {
    t += dt;
    cheer = Math.max(0, cheer - dt);
    chevrons.offset.x = -(t * 1.6) % 1;
    for (const k of karts) {
      k.hop = Math.max(0, k.hop - dt * 1.6);
      k.bumpT = Math.max(0, k.bumpT - dt);
      const y = k.hop * k.hop * 1.4; // dropping back onto the track after a respawn
      k.g.position.set(k.x, y, k.z);
      k.g.rotation.y = -k.h;
      k.lean.rotation.x = clamp(-k.turn * 0.035, -0.16, 0.16);
      const cx = Math.cos(k.h), cz = Math.sin(k.h);
      k.googly.root.position.set(k.x - cx * 0.03, y + 0.27, k.z - cz * 0.03);
      look.copy(camera.position);
      k.googly.update(dt, [k.vx, 0, k.vz], look, { scared: k.boost > 0 || k.bumpT > 0 || k.lost > 0.3 || k.hop > 0, lean: 0.1 });
      // tyre smoke in hard corners, grass bits off the track, flames when boosting
      const sp = Math.hypot(k.vx, k.vz);
      if (state === 'race' && sp > 2.2 && Math.abs(k.turn) > TURN * 0.7 && Math.random() < dt * 30) fx.spawn(k.x - cx * 0.2, 0.06, k.z - cz * 0.2, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, 0xe8e8e8, 0.1, 0.5, -0.6, 2.5);
      if (state === 'race' && k.grass && sp > 1 && Math.random() < dt * 25) fx.spawn(k.x - cx * 0.2, 0.08, k.z - cz * 0.2, (Math.random() - 0.5) * 1.2, 1 + Math.random(), (Math.random() - 0.5) * 1.2, 0x4caf50, 0.05, 0.45, 8, 1);
      if (k.boost > 0 && Math.random() < dt * 40) fx.spawn(k.x - cx * 0.28, 0.12, k.z - cz * 0.28, -cx * 1.5 + (Math.random() - 0.5) * 0.5, 0.3, -cz * 1.5 + (Math.random() - 0.5) * 0.5, pick([0xff9800, 0xffeb3b, 0xff5722]), 0.07, 0.3, 0, 3);
    }
    for (const tk of tokens) {
      if (tk.taken) {
        if (tk.pop > 0) { tk.pop += dt; const s = Math.max(0.001, 1 - tk.pop * 4); tk.mesh.scale.setScalar(s); tk.mesh.position.y += dt * 2; if (s <= 0.001) { tk.mesh.visible = false; tk.pop = 0; } }
        continue;
      }
      tk.mesh.visible = true;
      tk.mesh.scale.setScalar(1);
      tk.mesh.position.set(tk.x, 0.32 + Math.sin(t * 3.2 + tk.i) * 0.05, tk.z);
      tk.mesh.rotation.set(0, t * 2.6, 0);
    }
    updateFans(t);
    fx.update(dt);
    if (engine) {
      const v = Math.abs(player.v);
      engine.set(40 + v * 13 + (player.boost > 0 ? 14 : 0), document.hidden ? 0 : 0.012 + player.throttle * 0.016, 260 + v * 70);
    }
    audio.roll(state === 'race' && player.grass ? Math.abs(player.v) * 2.5 : 0);
    updateCamera(dt);
  }

  setLamps(0, false);
  for (const k of karts) { k.g.position.set(k.x, 0, k.z); k.g.rotation.y = -k.h; }
  visuals(0);

  return {
    scene, camera, update, resize,
    start() {
      setState('count');
      engine = audio.drone({ type: 'triangle', freq: 40, cutoff: 260 });
      hud.status(`lap 1/${LAPS}`);
    },
    showsStick: () => state === 'race' && !player.done,
    dispose() { if (engine) engine.stop(); engine = null; audio.roll(0); },
    debug: () => ({ state, raceT, place, player, karts, track: P, LEN, N, HALF_W, tokens }),
  };
}
