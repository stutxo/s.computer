// The wormhole between s-verses: you fly down a twisting tunnel of Cool S's, through a big one at the end.
import { STROKES } from './shared.js';

export function createWormhole(THREE) {
  const BG = 0x0b0f2e;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 5, 30);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 60);
  camera.position.set(0, 0, 1);

  // one Cool S, drawn as its 14 lines: flat strips, 0.4 wide and 1 tall, facing +z
  const K = 0.1, W = 0.032;
  const pos = [], idx = [];
  for (const s of STROKES) {
    const ax = s.ax * K, ay = -s.az * K, bx = s.bx * K, by = -s.bz * K;
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    const nx = (-dy / l) * W, ny = (dx / l) * W, ex = (dx / l) * W, ey = (dy / l) * W; // stick out past the ends so corners meet
    const i = pos.length / 3;
    pos.push(ax - ex + nx, ay - ey + ny, 0, ax - ex - nx, ay - ey - ny, 0, bx + ex + nx, by + ey + ny, 0, bx + ex - nx, by + ey - ny, 0);
    idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sGeo.setIndex(idx);

  // the tunnel: rings of S's that stream toward you, wrap round to the far end, and twist as they go
  const RING = 14, RINGS = 26, COUNT = RING * RINGS, DEPTH = 34, R = 2.3;
  const tiles = new THREE.InstancedMesh(sGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), COUNT);
  tiles.frustumCulled = false;
  scene.add(tiles);
  const PALETTE = [0x8e9bff, 0xff8ec0, 0xffd66b, 0x86ecff, 0xffffff, 0xb9a4ff];
  const col = new THREE.Color();
  const items = [];
  for (let n = 0; n < COUNT; n++) {
    const ring = Math.floor(n / RING), j = n % RING;
    items.push({ a: (j / RING) * Math.PI * 2 + ring * 0.41, z0: -(ring / RINGS) * DEPTH, r: R * (0.85 + ((n * 37) % 11) / 30), rot: n * 2.4, spin: (((n * 53) % 9) - 4) * 0.35, s: 0.8 + ((n * 29) % 7) / 10 });
    tiles.setColorAt(n, col.setHex(PALETTE[n % PALETTE.length]));
  }

  // the light at the end, and the big S you fly through to arrive
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(200,210,255,0.6)'); gr.addColorStop(1, 'rgba(120,130,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  glow.position.z = -DEPTH * 0.95;
  glow.scale.setScalar(14);
  scene.add(glow);
  const bigMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, transparent: true });
  const big = new THREE.Mesh(sGeo, bigMat);
  scene.add(big);

  let t = 0, travel = 0, arriveT = -1;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const accent = new THREE.Color();

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 0.8 ? 80 : 68;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    scene, camera, resize,
    // tint some of the S's with the colors of where you're headed
    begin(theme) {
      t = 0; travel = 0; arriveT = -1;
      const tint = [theme && theme.accent, theme && theme.card, theme && theme.ink].filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
      for (let n = 0; n < COUNT; n++) {
        if (tint.length && n % 3 === 0) tiles.setColorAt(n, accent.set(tint[(n / 3) % tint.length | 0]));
        else tiles.setColorAt(n, col.setHex(PALETTE[n % PALETTE.length]));
      }
      tiles.instanceColor.needsUpdate = true;
    },
    arrive() { arriveT = 0; },
    update(dt) {
      t += dt;
      const speed = 16 + Math.min(t, 1.5) * 6 + (arriveT >= 0 ? arriveT * 40 : 0);
      travel += speed * dt;
      const twist = t * 0.5;
      for (let n = 0; n < COUNT; n++) {
        const it = items[n];
        const z = ((((it.z0 + travel) % DEPTH) + DEPTH) % DEPTH) - DEPTH + 0.5; // from far away, past you, round again
        const a = it.a + twist + z * 0.045;
        p.set(Math.cos(a) * it.r, Math.sin(a) * it.r, z);
        e.set(0, 0, it.rot + t * it.spin);
        q.setFromEuler(e);
        const s = it.s * (z > -1.5 ? Math.max(0.001, (0.5 - z) / 2) : 1); // shrink away instead of popping off at the camera
        tiles.setMatrixAt(n, m4.compose(p, q, sc.set(s, s, s)));
      }
      tiles.instanceMatrix.needsUpdate = true;
      // the big S waits far off, then rushes up and you fly through its middle
      const k = arriveT >= 0 ? Math.min(1, (arriveT += dt) / 0.45) : 0;
      big.position.set(0, 0, -26 + k * k * 26.6);
      big.rotation.z = Math.sin(t * 0.8) * 0.15 + k * 0.6;
      big.scale.setScalar(5);
      bigMat.opacity = Math.min(1, t * 2);
      glow.material.opacity = 0.75 + Math.sin(t * 6) * 0.1;
      camera.rotation.z = Math.sin(t * 0.9) * 0.12;
    },
  };
}
