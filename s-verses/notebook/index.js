// s-verse #1, HOME: the notebook. A pen draws the Cool S, it peels off the page, and you tilt it to roll into gold s's.
// After 5 of them a portal opens to the other s-verses; after that, every 3 more.
// This one is special (every run starts and ends here) so it uses ctx.home. Every other s-verse is a normal one.

export default {
  id: 'notebook',
  name: 'the notebook',
  verb: 'tilt!',
  author: 'stutxo',
  home: true,
  create(ctx) { return createNotebook(ctx); },
};

function createNotebook(ctx) {
  const { THREE, S, audio, hud, home } = ctx;
  const { SU, BALL_R, INK_R, PAPER_Y, MAX_TILT, clamp, uv, OUTLINE, STROKES, INNER, PATH, projectToPath, l2w, makeBall, stepBall,
    toFall, stepFall, makeGame, tokenTime, spawnToken, spawnSpot, stepGame, wobble, flickBall } = S;
  const { lerp, easeOutCubic, easeOutBack, pick, reduceMotion, lowEnd } = ctx;

  /* ---------- scene, camera, light ---------- */
  const DESK = 0xe8ece7;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DESK);
  scene.fog = new THREE.Fog(DESK, 16, 58);
  scene.environment = ctx.envTexture();
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc3cddc, 0.9));
  const sun = new THREE.DirectionalLight(0xfff3e3, 2.3);
  sun.position.set(-6, 16, -2.5);
  sun.target.position.set(0, -3, 1);
  sun.castShadow = true;
  const SHADOW = lowEnd ? 1024 : 2048;
  sun.shadow.mapSize.set(SHADOW, SHADOW);
  const sc = sun.shadow.camera;
  sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 50;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  /* ---------- textures & materials ---------- */
  const RULE = 0.75;
  const topTex = ctx.canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#fcfdfa'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(118,163,222,0.5)'; g.fillRect(0, h - 4, w, 4);
  });
  topTex.wrapS = topTex.wrapT = THREE.RepeatWrapping;
  topTex.repeat.set(1 / RULE, 1 / RULE);
  const sideTex = ctx.canvasTexture(8, 32, (g, w, h) => {
    g.fillStyle = '#eceee8'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(140,146,138,0.55)'; g.fillRect(0, h - 3, w, 3);
  });
  sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
  sideTex.repeat.set(1, 1 / 0.055);

  const INK_C = new THREE.Color(0x2335a8), RED_C = new THREE.Color(0xd7263d);
  const M = {
    top: new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.9, envMapIntensity: 0.4 }),
    side: new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.95, envMapIntensity: 0.3 }),
    ink: new THREE.MeshPhysicalMaterial({ color: 0x2335a8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9 }),
    ball: new THREE.MeshPhysicalMaterial({ map: ctx.ballTexture(), roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15, envMapIntensity: 0.8, emissive: 0xff2200, emissiveIntensity: 0 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 }),
    goldDark: new THREE.MeshStandardMaterial({ color: 0x8a5a00, metalness: 0.7, roughness: 0.45 }),
    hi: new THREE.MeshBasicMaterial({ color: 0xfff04a, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    track: new THREE.MeshBasicMaterial({ color: 0x2335a8, transparent: true, opacity: 0.14, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    ring: new THREE.MeshBasicMaterial({ color: 0x2335a8, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  };
  M.corpse = M.ball.clone();

  /* ---------- the notebook page ---------- */
  const PAGE = 64;
  const pageCv = document.createElement('canvas');
  pageCv.width = pageCv.height = lowEnd ? 1536 : 2048;
  const pageTex = new THREE.CanvasTexture(pageCv);
  pageTex.colorSpace = THREE.SRGBColorSpace;
  pageTex.anisotropy = ctx.ANISO;
  drawPage(pageCv, PAGE, RULE, STROKES, SU, ctx.HAND);
  const page = new THREE.Mesh(new THREE.PlaneGeometry(PAGE, PAGE), new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.95, envMapIntensity: 0.3 }));
  page.rotation.x = -Math.PI / 2;
  page.position.y = PAPER_Y;
  page.receiveShadow = true;
  scene.add(page);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px "Gochi Hand"').then(() => { drawPage(pageCv, PAGE, RULE, STROKES, SU, ctx.HAND); pageTex.needsUpdate = true; }).catch(() => {});
  }

  /* ---------- the S ---------- */
  const board = new THREE.Group();
  scene.add(board);
  const sShape = new THREE.Shape();
  OUTLINE.forEach(([x, z], i) => (i ? sShape.lineTo(x, -z) : sShape.moveTo(x, -z)));
  const SLAB_D = 0.48, BEV = 0.07;
  const slabGeo = new THREE.ExtrudeGeometry(sShape, { depth: SLAB_D, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 3, curveSegments: 1 });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(0, -(SLAB_D + BEV), 0); // top face at y = 0
  const slab = new THREE.Mesh(slabGeo, [M.top, M.side]);
  slab.castShadow = true;
  slab.receiveShadow = true;
  slab.visible = false;
  board.add(slab);

  // the 14 inked strokes: a cylinder + two round caps each, instanced so they can "draw" themselves
  const inkCyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(INK_R, INK_R, 1, 16, 1, true), M.ink, STROKES.length);
  const inkCap = new THREE.InstancedMesh(new THREE.SphereGeometry(INK_R, 16, 12), M.ink, STROKES.length * 2);
  for (const m of [inkCyl, inkCap]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; board.add(m); }

  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
  const Y_UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1), Q_ID = new THREE.Quaternion();
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  function setStroke(i, prog) {
    const w = STROKES[i];
    if (prog <= 0) {
      inkCyl.setMatrixAt(i, ZERO_M); inkCap.setMatrixAt(2 * i, ZERO_M); inkCap.setMatrixAt(2 * i + 1, ZERO_M);
    } else {
      const ex = w.ax + w.dx * prog, ez = w.az + w.dz * prog;
      _d.set(w.dx, 0, w.dz).normalize();
      _q.setFromUnitVectors(Y_UP, _d);
      _p.set((w.ax + ex) / 2, INK_R, (w.az + ez) / 2);
      _s.set(1, Math.max(w.len * prog, 1e-4), 1);
      inkCyl.setMatrixAt(i, _m4.compose(_p, _q, _s));
      inkCap.setMatrixAt(2 * i, _m4.compose(_p.set(w.ax, INK_R, w.az), Q_ID, ONE));
      inkCap.setMatrixAt(2 * i + 1, _m4.compose(_p.set(ex, INK_R, ez), Q_ID, ONE));
    }
    inkCyl.instanceMatrix.needsUpdate = true;
    inkCap.instanceMatrix.needsUpdate = true;
  }
  for (let i = 0; i < STROKES.length; i++) setStroke(i, 0);

  /* ---------- gold s token ---------- */
  const tokenRoot = new THREE.Group();
  tokenRoot.visible = false;
  board.add(tokenRoot);
  const tokenSpin = new THREE.Group();
  tokenRoot.add(tokenSpin);
  const mini = ctx.miniS(0.095, 0.08, 0.02);
  const miniMesh = new THREE.Mesh(mini.geo, M.gold);
  miniMesh.castShadow = true;
  tokenSpin.add(miniMesh);
  for (const b of mini.bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(b.len + 0.02, 0.024, mini.thickness + 0.01), M.goldDark);
    bar.position.set(b.x, b.y, 0);
    bar.rotation.z = b.ang;
    tokenSpin.add(bar);
  }
  const hiDot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2), M.hi);
  hiDot.position.y = 0.004; hiDot.renderOrder = 1;
  const RING_SEG = 64;
  const track = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.66, RING_SEG, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2), M.track);
  track.position.y = 0.008; track.renderOrder = 2;
  const ringGeo = new THREE.RingGeometry(0.56, 0.66, RING_SEG, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, M.ring);
  ring.position.y = 0.01; ring.renderOrder = 3;
  tokenRoot.add(hiDot, track, ring);

  /* ---------- the portal ---------- */
  const portalTex = ctx.canvasTexture(256, 256, (g, w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2;
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, '#0a0018'); bg.addColorStop(0.55, '#2a0a5e'); bg.addColorStop(1, 'rgba(60,20,140,0)');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cols = ['#ff4f93', '#fff04a', '#5fd3ff', '#7dff8a', '#b98cff'];
    g.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      g.strokeStyle = cols[arm]; g.lineWidth = 7;
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = i / 60, a = arm * (Math.PI * 2 / 5) + t * 5.2, r = R * (0.08 + t * 0.86);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.globalAlpha = 0.85; g.stroke(); g.globalAlpha = 1;
    }
  });
  const portalRoot = new THREE.Group();
  portalRoot.visible = false;
  board.add(portalRoot);
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.74, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: portalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  swirl.position.y = 0.012; swirl.renderOrder = 4;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.07, 12, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9b5cff, emissive: 0x7a2cff, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.2 }));
  rim.position.y = 0.05;
  const orbiters = [];
  const orbCols = [0xff4f93, 0xfff04a, 0x5fd3ff, 0x7dff8a, 0xb98cff, 0xffffff];
  for (let i = 0; i < 6; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: orbCols[i] }));
    portalRoot.add(o);
    orbiters.push(o);
  }
  portalRoot.add(swirl, rim);

  /* ---------- the ball ---------- */
  const googly = ctx.makeGoogly({ material: M.ball, faceUp: [0, 0, -1] });
  const ballRoot = googly.root;
  ballRoot.visible = false;
  scene.add(ballRoot);

  /* ---------- props: the pen that draws the S, a pencil on the page ---------- */
  const penMetal = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, metalness: 1, roughness: 0.25 });
  const pen = new THREE.Group();
  {
    const clearPlastic = new THREE.MeshPhysicalMaterial({ color: 0xe9f1ff, roughness: 0.08, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false });
    const bic = new THREE.MeshStandardMaterial({ color: 0x1f3fbf, roughness: 0.4 });
    const tilted = new THREE.Group();
    tilted.rotation.set(0.42, 0, -0.38);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 12), penMetal);
    tip.rotation.x = Math.PI; tip.position.y = 0.06;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 6), clearPlastic);
    cone.rotation.x = Math.PI; cone.position.y = 0.29;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.5, 6), clearPlastic);
    barrel.position.y = 1.71;
    const refill = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.55, 8), bic);
    refill.position.y = 1.475;
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 12), bic);
    plug.position.y = 3.0;
    tilted.add(tip, refill, cone, barrel, plug);
    pen.add(tilted);
    pen.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  pen.visible = false;
  scene.add(pen);
  {
    const pencil = new THREE.Group();
    const len = 4.2, r = 0.16;
    const parts = [
      [new THREE.CylinderGeometry(r, r, len, 6), 0xf6c21c, 0],
      [new THREE.ConeGeometry(r, 0.55, 6), 0xe7c49a, len / 2 + 0.275],
      [new THREE.ConeGeometry(0.055, 0.18, 10), 0x3b3d44, len / 2 + 0.46],
      [new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.32, 16), 0xcfd4dc, -len / 2 - 0.16],
      [new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.36, 16), 0xf29bb0, -len / 2 - 0.5],
    ];
    for (const [geo, color, y] of parts) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: color === 0xcfd4dc ? 1 : 0 }));
      m.position.y = y; m.castShadow = true; m.receiveShadow = true;
      pencil.add(m);
    }
    pencil.rotation.set(0, 0.55, Math.PI / 2);
    pencil.position.set(-6.6, PAPER_Y + r * 0.87, 4.6);
    scene.add(pencil);
  }

  const fx = ctx.makeParticles(scene, 320, PAPER_Y + 0.02);
  const GOLDS = [0xffc21a, 0xffe27a, 0xfff04a, 0xffffff];
  const CONFETTI = [0xff4f93, 0xfff04a, 0x5fd3ff, 0x7dff8a, 0xffc21a, 0xb98cff, 0x2335a8];
  const PRAISE = ['rad!', 'sick!', 'tubular!', 'nice!', 'whoa!', 'clean!', 'S-tier!'];

  /* ---------- camera framing ---------- */
  const FIT_PTS = ctx.sFitPoints(0.45, [-0.75, 0.6], 1.3);
  let fit = { target: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), dist: 20 };
  function resize() {
    const aspect = innerWidth / innerHeight;
    fit = ctx.fitPerspective(camera, FIT_PTS, { pitch: THREE.MathUtils.degToRad(aspect < 0.7 ? 66 : aspect < 1.1 ? 61 : 55) });
  }
  resize();

  /* ---------- state ---------- */
  let state = 'intro', stateT = 0, introT = 0, dropThen = 'title', fallReason = 'fly', active = true;
  let ball = makeBall(), game = makeGame(), fall = null, portal = null, portalT = 0, suck = null;
  const tilt = { a: 0, c: 0, va: 0, vc: 0 };
  let boardA = 0, boardC = 0, boardY = PAPER_Y + 0.004, camLift = PAPER_Y;
  const bump = { y: 0, v: 0 }, follow = { x: 0, z: 0 };
  let bob = 0, shake = 0, tickT = 0, tokT = 0, tokPop = 1, trailT = 0, simT = 0, acc = 0, fallSpinRate = 0;
  const qRoll = new THREE.Quaternion(), qBoard = new THREE.Quaternion(), qWorld = new THREE.Quaternion(), euler = new THREE.Euler();
  const fallSpin = new THREE.Vector3(1, 0, 0);
  const wob = [0, 0], w3 = [0, 0, 0], wv = [0, 0, 0];
  const ev = {};
  const STEP = 1 / 120;
  const corpses = [];
  const setState = (s) => { state = s; stateT = 0; };

  // intro: a pen draws the 14 strokes on the page, then the S peels up off the paper
  const T0 = 0.35, DRAW = 0.1, GAP = 0.055, PER = DRAW + GAP;
  const DRAW_END = T0 + STROKES.length * PER + 0.12, LIFT = 1.05, INTRO_END = DRAW_END + LIFT;
  const strokeProg = (i, t) => clamp((t - T0 - i * PER) / DRAW, 0, 1);

  function updateIntro(dt) {
    introT += dt;
    for (let i = 0; i < STROKES.length; i++) setStroke(i, strokeProg(i, introT));
    placePen(introT);
    const lp = clamp((introT - DRAW_END) / LIFT, 0, 1);
    boardY = lerp(PAPER_Y + 0.004, 0, easeOutBack(lp));
    slab.visible = lp > 0.001;
    slab.scale.y = Math.max(0.02, easeOutCubic(Math.min(1, lp * 1.4)));
    camLift = PAPER_Y * (1 - easeOutCubic(lp));
    if (introT >= INTRO_END) finishIntro();
  }
  function placePen(t) {
    let x, z, h;
    const k = Math.floor((t - T0) / PER), local = t - T0 - k * PER;
    if (t < T0) {
      const s = STROKES[0], q = easeOutCubic(t / T0);
      x = lerp(s.ax + 1.5, s.ax, q); z = lerp(s.az - 1, s.az, q); h = 1.6 * (1 - q);
    } else if (k >= STROKES.length) {
      const s = STROKES[STROKES.length - 1], q = clamp((t - T0 - STROKES.length * PER) / 0.7, 0, 1);
      x = s.bx + q * 5; z = s.bz - q * 6; h = q * q * 9;
    } else if (local < DRAW) {
      const s = STROKES[k], p = local / DRAW;
      x = s.ax + s.dx * p; z = s.az + s.dz * p; h = 0;
    } else {
      const s = STROKES[k], n = STROKES[Math.min(k + 1, STROKES.length - 1)], q = (local - DRAW) / GAP;
      x = lerp(s.bx, n.ax, q); z = lerp(s.bz, n.az, q); h = Math.sin(q * Math.PI) * 0.45;
    }
    pen.position.set(x, boardY + INK_R * 1.7 + h, z);
    pen.visible = t < T0 + STROKES.length * PER + 0.7;
  }
  function settle() {
    for (let i = 0; i < STROKES.length; i++) setStroke(i, 1);
    slab.visible = true; slab.scale.y = 1;
    boardY = 0; camLift = 0; pen.visible = false;
  }
  function finishIntro() {
    settle();
    if (reduceMotion) { ball = makeBall(); qRoll.identity(); ballRoot.visible = true; enterTitle(); } else startDrop('title');
  }
  function skipIntro() { introT = INTRO_END; updateIntro(0); }

  function startDrop(then) {
    ball = makeBall();
    ball.air = true; ball.y = 5.2; ball.vy = 0;
    qRoll.identity();
    fall = null; suck = null;
    ballRoot.visible = true;
    ballRoot.scale.setScalar(1);
    dropThen = then;
    setState('drop');
  }
  function enterTitle() {
    setState('title');
    game = makeGame();
    spawnToken(game, ball);
    showToken();
    home.showTitle();
  }
  function startPlay() {
    home.hideTitle();
    if (!game.token && !portal) spawnNext();
    else if (game.token) {
      const tk = game.token;
      tk.T = tk.t = tokenTime(Math.abs(tk.s - projectToPath(ball.x, ball.z).s), game.level);
      showToken();
    }
    setState('play');
  }
  // next thing on the board: a gold s, or a portal once you've earned one
  function spawnNext() {
    if (home.portalReady()) openPortal();
    else { spawnToken(game, ball); showToken(); }
  }
  function showToken() {
    const tk = game.token;
    if (!tk) { tokenRoot.visible = false; return; }
    tokenRoot.position.set(tk.x, 0, tk.z);
    tokenRoot.visible = true;
    tokPop = 0; tickT = 0;
  }
  function openPortal() {
    const p = spawnSpot(ball, Math.random, 4, 0.2);
    portal = { x: p.x, z: p.z };
    portalRoot.position.set(p.x, 0, p.z);
    portalRoot.visible = true;
    portalRoot.scale.setScalar(0.001);
    portalT = 0;
    game.token = null;
    tokenRoot.visible = false;
    audio.portalOpen();
    ctx.haptic(20);
    l2w(boardA, boardC, p.x, 0.9, p.z, w3);
    hud.pop('a portal!', w3[0], w3[1] + boardY, w3[2], camera, 'big portal');
  }

  function startFall(reason) {
    fallReason = reason;
    fall = toFall(ball, boardA, boardC, boardY + bump.y + bob);
    euler.set(boardA, 0, boardC);
    qWorld.setFromEuler(euler).multiply(qRoll);
    fallSpin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    fallSpinRate = 7 + Math.random() * 5;
    tokenRoot.visible = false;
    ctx.releaseStick();
    setState('fall');
    audio.whistle();
    ctx.haptic(35);
    shake = Math.max(shake, 0.12);
    hud.pop(reason === 'slow' ? 'too slow!' : pick(['nooo!', 'aaaa!', 'whoops!', 'bye!']), fall.x, fall.y + 0.7, fall.z, camera, 'red');
  }
  function doFlick() {
    const [dx, dz] = flickBall(ball);
    game.token = null;
    tokenRoot.visible = false;
    tilt.vc += -dx * 3.2; tilt.va += dz * 3.2; // the S flicks you off
    setState('flick');
    audio.boing();
    shake = Math.max(shake, 0.18);
  }
  // leave the last ball lying on the notebook page, like evidence
  function addCorpse() {
    if (!fall || !fall.floor) return;
    const c = ballRoot.clone(true);
    c.traverse((o) => { if (o.material === M.ball) o.material = M.corpse; });
    scene.add(c);
    corpses.push(c);
    if (corpses.length > 12) scene.remove(corpses.shift());
  }

  /* ---------- simulation ---------- */
  function physStep(dt) {
    const live = state === 'play' || state === 'drop';
    const [ix, iy] = live ? ctx.readStick() : ctx.ZERO2;
    const W = 13; // tilt spring stiffness (critically damped)
    tilt.va += (W * W * (iy * MAX_TILT - tilt.a) - 2 * W * tilt.va) * dt; tilt.a += tilt.va * dt;
    tilt.vc += (W * W * (-ix * MAX_TILT - tilt.c) - 2 * W * tilt.vc) * dt; tilt.c += tilt.vc * dt;
    if (state === 'play') wobble(game, simT, wob); else { wob[0] *= 0.98; wob[1] *= 0.98; }
    boardA = tilt.a + wob[0]; boardC = tilt.c + wob[1];
    simT += dt;

    if (state === 'title' || state === 'drop' || state === 'play' || state === 'flick') {
      const wasAir = ball.air;
      stepBall(ball, boardA, boardC, dt, ev);
      if (ev.fall) { startFall(state === 'flick' ? 'slow' : 'fly'); return; }
      if (state === 'play') {
        if (portal) {
          if (Math.hypot(ball.x - portal.x, ball.z - portal.z) < 0.62 && ball.y < BALL_R + 0.8) enterPortal();
        } else {
          stepGame(game, ball, dt, ev);
          if (ev.collect) { const c = ev.collect; ev.collect = null; onCollect(c); spawnNext(); }
          if (ev.timeout) { ev.timeout = false; doFlick(); return; }
        }
      }
      if (wasAir && !ball.air) {
        if (state === 'drop') { if (dropThen === 'play') startPlay(); else enterTitle(); } else if (state === 'flick') doFlick();
      }
    } else if (fall) stepFall(fall, dt, ev);
  }

  function enterPortal() {
    setState('portal');
    suck = { x: ball.x, z: ball.z, y: ball.y, t: 0 };
    ctx.releaseStick();
    audio.warp();
    ctx.haptic(30);
  }

  function handleEvents() {
    if (ev.bonk && ev.bonk > 1) onBonk(ev.bonk, ev.bnx, ev.bnz);
    if (ev.hop) {
      audio.hop();
      googly.kick(-2.5);
      shake = Math.max(shake, 0.06);
      if (state === 'play') hud.pop('boing!', ballRoot.position.x, ballRoot.position.y + 0.7, ballRoot.position.z, camera);
    }
    if (ev.land && ev.land > 1.5) { audio.thud(ev.land * 0.6); googly.kick(Math.min(5, ev.land * 0.35)); }
    if (ev.thud) { audio.thud(ev.thud); googly.kick(Math.min(6, ev.thud * 0.4)); }
  }
  function onCollect(c) {
    const total = ctx.addScore(1);
    home.collected();
    audio.collect(total);
    ctx.haptic(12);
    l2w(boardA, boardC, c.x, 0.66, c.z, w3);
    w3[1] += boardY + bump.y + bob;
    fx.burst(w3[0], w3[1], w3[2], 18, GOLDS, 3.2, 3.8, 0.11, 0.9, 9);
    const label = total % 10 === 0 ? `${total}!` : total % 5 === 0 ? pick(PRAISE) : '+1';
    hud.pop(label, w3[0], w3[1] + 0.4, w3[2], camera, total % 10 === 0 ? 'big gold' : 'gold');
    bump.v -= 1.1;
    googly.happy();
    if (total % 10 === 0) {
      audio.tada();
      for (let i = 0; i < 80; i++) {
        fx.spawn((Math.random() - 0.5) * 7, 6 + Math.random() * 3, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, (Math.random() - 0.5) * 2,
          pick(CONFETTI), 0.14 + Math.random() * 0.08, 2.6, 3.5, 0.9);
      }
    }
  }
  function onBonk(s, nx, nz) {
    audio.bonk(s);
    googly.kick(Math.min(4, s * 0.45));
    if (s > 3) {
      l2w(boardA, boardC, ball.x - nx * BALL_R, INK_R * 1.5, ball.z - nz * BALL_R, w3);
      w3[1] += boardY + bump.y + bob;
      for (let i = 0; i < Math.min(8, s | 0); i++) {
        fx.spawn(w3[0], w3[1], w3[2], (Math.random() - 0.5) * 2.5, 1 + Math.random() * 2, (Math.random() - 0.5) * 2.5, 0x2335a8, 0.05 + Math.random() * 0.04, 0.45, 9, 1.5);
      }
    }
    if (s > 4.5) shake = Math.max(shake, s * 0.012);
    if (s > 2) ctx.haptic(8);
  }

  /* ---------- per-frame visuals ---------- */
  const _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  function rollQuat(q, vx, vz, dt) {
    const sp = Math.hypot(vx, vz);
    if (sp < 1e-4) return;
    _d.set(vz / sp, 0, -vx / sp);
    _q.setFromAxisAngle(_d, (sp / BALL_R) * dt);
    q.premultiply(_q);
  }

  function updateVisuals(dt) {
    bump.v += (-bump.y * 150 - bump.v * 15) * dt; bump.y += bump.v * dt;
    bob = lerp(bob, state === 'title' ? Math.sin(stateT * 1.7) * 0.09 : 0, 1 - Math.exp(-4 * dt));
    const by = boardY + bump.y + bob;
    board.position.set(0, by, 0);
    board.rotation.set(boardA, 0, boardC);
    euler.set(boardA, 0, boardC);
    qBoard.setFromEuler(euler);

    if (ballRoot.visible) {
      if (fall) {
        ballRoot.position.set(fall.x, fall.y, fall.z);
        if (fall.floor) rollQuat(qWorld, fall.vx, fall.vz, dt);
        else { _q.setFromAxisAngle(fallSpin, fallSpinRate * dt); qWorld.premultiply(_q); }
        googly.body.quaternion.copy(qWorld);
        wv[0] = fall.vx; wv[1] = fall.vy; wv[2] = fall.vz;
      } else if (suck) {
        // spiral down into the portal
        suck.t += dt;
        const k = clamp(suck.t / 0.85, 0, 1), e = easeOutCubic(k), ang = k * 9;
        const r = (1 - e) * Math.hypot(suck.x - portal.x, suck.z - portal.z);
        const x = portal.x + Math.cos(ang) * r, z = portal.z + Math.sin(ang) * r;
        l2w(boardA, boardC, x, BALL_R * (1 - e) + 0.05, z, w3);
        ballRoot.position.set(w3[0], w3[1] + by, w3[2]);
        ballRoot.scale.setScalar(Math.max(0.001, 1 - e));
        _q.setFromAxisAngle(Y_UP, dt * 14);
        qRoll.premultiply(_q);
        googly.body.quaternion.copy(qBoard).multiply(qRoll);
        wv[0] = wv[1] = wv[2] = 0;
        if (k >= 1 && state === 'portal') {
          setState('away');
          _v3.set(portal.x, 0, portal.z);
          board.localToWorld(_v3);
          _v3.project(camera);
          home.enterPortal((_v3.x * 0.5 + 0.5) * innerWidth, (-_v3.y * 0.5 + 0.5) * innerHeight);
        }
      } else {
        l2w(boardA, boardC, ball.x, ball.y, ball.z, w3);
        ballRoot.position.set(w3[0], w3[1] + by, w3[2]);
        if (!ball.air) rollQuat(qRoll, ball.vx, ball.vz, dt);
        googly.body.quaternion.copy(qBoard).multiply(qRoll);
        l2w(boardA, boardC, ball.vx, ball.air ? ball.vy : 0, ball.vz, wv);
      }
      const speed = Math.hypot(ball.vx, ball.vz);
      const scared = (fall && !fall.floor) || state === 'flick' || state === 'portal' || (!fall && speed > 6.2) || (!fall && ball.air && state === 'play');
      googly.update(dt, wv, camera.position, { scared, dizzy: !!(fall && fall.floor) });
      const heat = !fall && speed > 5 ? clamp((speed - 5) / 3, 0, 1) * 0.35 : 0;
      M.ball.emissiveIntensity = lerp(M.ball.emissiveIntensity, heat, 1 - Math.exp(-10 * dt));
    }

    if (tokenRoot.visible) {
      tokT += dt; tokPop += dt;
      const tk = game.token;
      const f = tk && state === 'play' ? clamp(tk.t / tk.T, 0, 1) : 1;
      const urgent = state === 'play' && f < 0.3;
      tokenSpin.position.y = 0.66 + Math.sin(tokT * 3.2) * 0.07 + (urgent ? Math.sin(tokT * 40) * 0.025 : 0);
      tokenSpin.rotation.y = tokT * 2.6;
      tokenRoot.scale.setScalar(tokPop < 0.4 ? Math.max(0.001, easeOutBack(tokPop / 0.4)) : 1);
      ring.visible = track.visible = state === 'play';
      ringGeo.setDrawRange(0, Math.ceil(f * RING_SEG) * 6);
      M.ring.color.lerpColors(INK_C, RED_C, clamp((0.35 - f) / 0.25, 0, 1));
      if (urgent) {
        tickT -= dt;
        if (tickT <= 0) { audio.tick(); tickT = f < 0.12 ? 0.16 : 0.32; }
      }
    }

    if (portalRoot.visible) {
      portalT += dt;
      portalRoot.scale.setScalar(portalT < 0.6 ? Math.max(0.001, easeOutBack(portalT / 0.6)) : 1 + Math.sin(portalT * 4) * 0.03);
      swirl.rotation.y = -portalT * 2.4;
      for (let i = 0; i < orbiters.length; i++) {
        const a = portalT * 2.2 + (i / orbiters.length) * Math.PI * 2;
        orbiters[i].position.set(Math.cos(a) * 0.95, 0.25 + Math.sin(portalT * 3 + i) * 0.18, Math.sin(a) * 0.95);
      }
      if (Math.random() < dt * 12 && state !== 'away') {
        l2w(boardA, boardC, portal.x + (Math.random() - 0.5) * 1.4, 0.1, portal.z + (Math.random() - 0.5) * 1.4, w3);
        fx.spawn(w3[0], w3[1] + by, w3[2], 0, 1.5 + Math.random(), 0, pick(orbCols), 0.07, 0.8, -0.5, 0.5);
      }
    }

    trailT -= dt;
    if (!fall && ballRoot.visible && state === 'play' && !ball.air) {
      const sp = Math.hypot(ball.vx, ball.vz);
      if (sp > 4.6 && trailT <= 0) {
        trailT = 0.028;
        const bp = ballRoot.position;
        fx.spawn(bp.x + (Math.random() - 0.5) * 0.2, bp.y - 0.15 + (Math.random() - 0.5) * 0.2, bp.z + (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, sp > 6.2 ? 0xff2d6f : 0xff8cbc, 0.07 + Math.random() * 0.05, 0.35, 0, 2);
      }
    }
    fx.update(dt);

    const rolling = (state === 'play' || state === 'title' || state === 'drop') && !ball.air ? Math.hypot(ball.vx, ball.vz) : fall && fall.floor ? Math.hypot(fall.vx, fall.vz) * 0.5 : 0;
    audio.roll(document.hidden ? 0 : rolling);

    // camera: fixed framing, a little drift toward the ball, shake on big moments
    const T = _v3.copy(fit.target);
    T.y += camLift;
    const kf = 1 - Math.exp(-2.5 * dt);
    follow.x = lerp(follow.x, !fall && ballRoot.visible ? ball.x * 0.05 : 0, kf);
    follow.z = lerp(follow.z, !fall && ballRoot.visible ? ball.z * 0.035 : 0, kf);
    camera.position.copy(T).addScaledVector(fit.dir, fit.dist);
    camera.position.x += follow.x;
    camera.position.z += follow.z;
    if (shake > 0.002 && !reduceMotion) camera.position.add(_v2.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake *= Math.exp(-7 * dt);
    camera.lookAt(T.x + follow.x * 1.6, T.y, T.z + follow.z * 1.6);

    if (state === 'fall' && fall && ((fall.floor && fall.still > 0.35) || stateT > 3.4)) {
      setState('over');
      home.gameOver(fallReason);
    }
  }

  function update(dt) {
    stateT += dt;
    if (state === 'intro') updateIntro(dt);
    else if (state !== 'away') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 12) { physStep(STEP); acc -= STEP; n++; }
      if (n === 12) acc = 0;
    }
    handleEvents();
    for (const k in ev) delete ev[k];
    updateVisuals(dt);
  }

  if (reduceMotion) finishIntro();

  return {
    scene, camera, update, resize,
    get state() { return state; },
    onPress() {
      if (state === 'intro') skipIntro();
      else if (state === 'title') startPlay();
    },
    showsStick: () => state === 'play' || state === 'drop',
    // back from another s-verse: drop in and keep going
    begin() {
      if (state === 'intro') settle();
      home.hideTitle();
      portal = null;
      portalRoot.visible = false;
      game.token = null;
      tokenRoot.visible = false;
      tilt.a = tilt.c = tilt.va = tilt.vc = 0;
      startDrop('play');
    },
    // brand new run after a game over
    reset() {
      addCorpse();
      game = makeGame();
      portal = null;
      portalRoot.visible = false;
      tokenRoot.visible = false;
      startDrop('play');
    },
    // for tests and the console
    debug: () => ({ state, ball, token: game.token, portal, fall, game }),
  };
}

function drawPage(pageCv, PAGE, RULE, STROKES, SU, HAND) {
  const g = pageCv.getContext('2d');
  const W = pageCv.width, u = W / PAGE;
  const X = (x) => (x + PAGE / 2) * u, Z = (z) => (z + PAGE / 2) * u;
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#f5f7f2'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(90,100,120,${(0.012 + rnd() * 0.025).toFixed(3)})`;
    g.fillRect(rnd() * W, rnd() * W, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
  }
  const lw = Math.max(1.5, u * 0.05);
  g.fillStyle = 'rgba(118,163,222,0.72)';
  for (let z = -PAGE / 2 + RULE * 2; z < PAGE / 2; z += RULE) g.fillRect(0, Z(z) - lw / 2, W, lw);
  const mw = Math.max(2, u * 0.065);
  g.fillStyle = 'rgba(234,104,118,0.82)';
  g.fillRect(X(-7.4) - mw / 2, 0, mw, W);
  for (const hz of [-12, 0, 12]) {
    g.beginPath(); g.arc(X(-9.7), Z(hz), 0.42 * u, 0, Math.PI * 2);
    g.fillStyle = '#d3d8d1'; g.fill();
    g.lineWidth = u * 0.05; g.strokeStyle = 'rgba(60,70,80,0.12)'; g.stroke();
  }

  // ballpoint doodles
  const INKS = 'rgba(35,53,168,0.85)';
  g.strokeStyle = INKS; g.fillStyle = INKS;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = Math.max(1.6, u * 0.06);
  const J = u * 0.05;
  const L = (pts, j = 1) => {
    g.beginPath();
    pts.forEach(([x, z], i) => {
      const px = X(x) + (rnd() - 0.5) * J * j, py = Z(z) + (rnd() - 0.5) * J * j;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    });
    g.stroke();
  };
  const arc = (x, z, r, a0, a1, n = 36) => {
    const p = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    L(p, 0.4);
  };
  const star = (x, z, r) => {
    const p = [];
    for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5; p.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    L(p);
  };
  const heart = (x, z, r) => {
    const p = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      p.push([x + (16 * Math.sin(t) ** 3 * r) / 17, z - ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * r) / 17]);
    }
    L(p, 0.3);
  };
  const spiral = (x, z, r) => {
    const p = [];
    for (let i = 0; i <= 160; i++) { const t = i / 160, a = t * Math.PI * 7; p.push([x + Math.cos(a) * r * t, z + Math.sin(a) * r * t]); }
    L(p, 0.2);
  };
  const smiley = (x, z, r) => {
    arc(x, z, r, 0, Math.PI * 2.06, 44);
    L([[x - r * 0.33, z - r * 0.38], [x - r * 0.33, z - r * 0.12]]);
    L([[x + r * 0.33, z - r * 0.38], [x + r * 0.33, z - r * 0.12]]);
    arc(x, z + r * 0.02, r * 0.55, Math.PI * 0.18, Math.PI * 0.82, 16);
  };
  const cube = (x, z, s) => {
    const o = s * 0.45;
    L([[x, z], [x + s, z], [x + s, z + s], [x, z + s], [x, z]]);
    L([[x + o, z - o], [x + s + o, z - o], [x + s + o, z + s - o], [x + o, z + s - o], [x + o, z - o]]);
    L([[x, z], [x + o, z - o]]); L([[x + s, z], [x + s + o, z - o]]);
    L([[x + s, z + s], [x + s + o, z + s - o]]); L([[x, z + s], [x + o, z + s - o]]);
  };
  const bolt = (x, z, s) => L([[x + s * 0.3, z - s], [x - s * 0.35, z + s * 0.08], [x + s * 0.12, z + s * 0.08], [x - s * 0.3, z + s],
    [x + s * 0.55, z - s * 0.22], [x + s * 0.02, z - s * 0.22], [x + s * 0.3, z - s]]);
  const ttt = (x, z, s) => {
    const a = s / 6, b = s / 2;
    L([[x - a, z - b], [x - a, z + b]]); L([[x + a, z - b], [x + a, z + b]]);
    L([[x - b, z - a], [x + b, z - a]]); L([[x - b, z + a], [x + b, z + a]]);
    const cross = (cx, cz) => { L([[cx - a * 0.6, cz - a * 0.6], [cx + a * 0.6, cz + a * 0.6]]); L([[cx + a * 0.6, cz - a * 0.6], [cx - a * 0.6, cz + a * 0.6]]); };
    cross(x - 2 * a, z - 2 * a); cross(x, z); cross(x + 2 * a, z + 2 * a);
    arc(x + 2 * a, z - 2 * a, a * 0.62, 0, Math.PI * 2.1, 20);
    arc(x - 2 * a, z + 2 * a, a * 0.62, 0, Math.PI * 2.1, 20);
    L([[x - b - 0.2, z - b - 0.2], [x + b + 0.2, z + b + 0.2]], 0.5);
  };
  const coolS = (x, z, k) => {
    for (const w of STROKES) L([[x + (w.ax / SU) * k, z + (w.az / SU) * k], [x + (w.bx / SU) * k, z + (w.bz / SU) * k]], 0.3);
  };
  const flower = (x, z, r) => {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; arc(x + Math.cos(a) * r * 0.55, z + Math.sin(a) * r * 0.55, r * 0.36, 0, Math.PI * 2, 18); }
    arc(x, z, r * 0.22, 0, Math.PI * 2, 14);
    L([[x, z + r * 0.9], [x + r * 0.15, z + r * 1.8], [x - r * 0.1, z + r * 2.6]], 0.3);
  };
  const cloud = (x, z, r) => {
    arc(x - r * 0.6, z, r * 0.45, Math.PI * 0.5, Math.PI * 1.55, 16);
    arc(x - r * 0.1, z - r * 0.35, r * 0.55, Math.PI * 1.05, Math.PI * 1.95, 18);
    arc(x + r * 0.55, z - r * 0.05, r * 0.45, Math.PI * 1.3, Math.PI * 2.45, 16);
    L([[x - r * 0.6, z + r * 0.45], [x + r * 0.62, z + r * 0.42]], 0.5);
  };
  const text = (str, x, z, size, rot = 0) => {
    g.save(); g.translate(X(x), Z(z)); g.rotate(rot);
    g.font = `${Math.round(size * u)}px ${HAND}`;
    g.fillText(str, 0, 0);
    g.restore();
  };
  const arrow = (x1, z1, x2, z2) => {
    const mx = (x1 + x2) / 2 + 0.25, mz = (z1 + z2) / 2 - 0.3;
    L([[x1, z1], [mx, mz], [x2, z2]], 0.3);
    const a = Math.atan2(z2 - mz, x2 - mx), h = 0.5;
    L([[x2 - Math.cos(a - 0.5) * h, z2 - Math.sin(a - 0.5) * h], [x2, z2], [x2 - Math.cos(a + 0.5) * h, z2 - Math.sin(a + 0.5) * h]]);
  };
  const highlight = (x, z, w, h, col) => {
    g.save(); g.fillStyle = col; g.translate(X(x), Z(z)); g.rotate(-0.03);
    g.fillRect(0, -h * u * 0.75, w * u, h * u);
    g.restore();
  };

  star(-8.8, -7.5, 1.0); heart(8.8, -7.2, 0.9); spiral(-10.5, 3.2, 1.05); smiley(10, 3.6, 1.0);
  cube(-6.9, 8.6, 1.1); bolt(6.6, 10.6, 0.9); ttt(12.2, -2.2, 1.5); coolS(-12.8, -3.6, 0.55);
  flower(12.4, 9.0, 0.9); cloud(-5.4, -12.4, 1.2); star(7.2, -13, 0.6); heart(-12.6, 8.8, 0.6);
  highlight(-13.5, 14.7, 4.7, 0.78, 'rgba(255,240,74,0.55)');
  g.fillStyle = INKS;
  text('lol', 5.6, -10.4, 0.95, -0.2);
  text('math is hard', -13.3, 14.7, 0.78, -0.03);
  text('s + s 4ever', 8.4, 14.4, 0.72, -0.07);
  text("it's alive!!", 5.3, -0.8, 0.66, -0.1);
  arrow(5.0, -1.5, 3.2, -2.9);
  // little ones that peek out beside the S on phones
  star(3.75, -7.4, 0.32); heart(-3.8, -5.4, 0.3); star(-3.7, -0.9, 0.28); spiral(3.85, 1.2, 0.32); heart(3.7, -4.2, 0.22);
  // pencil scribble
  g.strokeStyle = 'rgba(70,74,84,0.32)'; g.lineWidth = Math.max(1.2, u * 0.045);
  const zz = [];
  for (let i = 0; i < 22; i++) zz.push([-14.6 + i * 0.12, -8.4 + (i % 2 ? 0.9 : 0)]);
  L(zz, 0.4);
}
