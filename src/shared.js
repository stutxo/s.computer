// The Cool S itself, plus the notebook game's physics. Plain math: no three.js, no DOM.
// Coordinates: x right, z toward the viewer (down the screen), y up. The S is 4 wide and 10 tall.

export const SU = 2;                                 // world units per grid square (the S is 2 x 5 squares)
export const BALL_R = 0.36;                          // ball radius
export const INK_R = 0.12;                           // radius of the inked lines (the walls)
export const CONTACT = 2 * Math.sqrt(BALL_R * INK_R); // ball-center distance from a line's center when touching it
export const PAPER_Y = -8;                           // height of the notebook page below the S
export const MAX_TILT = 0.24;                        // radians (~14°)
export const PHYS = {
  G: 40,          // tilt gravity: acceleration = G * sin(tilt)
  DAMP: 0.42,     // rolling resistance, per second
  FRICTION: 0,    // constant slow-down, units/s² (mini golf uses this)
  REST: 0.5,      // bounciness off the lines
  HOP_V: 6.3,     // hit a line harder than this and you hop right over it
  VMAX: 15,
  HOP_VY: 5.2,    // hop launch speed
  HOP_G: 30,      // gravity while hopping / dropping in
  BOUNCE_V: 6,    // landings harder than this bounce
  FALL_G: 24,     // gravity on the way down to the page
  PICK: 0.62,     // how close you need to get to grab a gold s
};

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// grid coords (u right, v down; the S spans u 0..2, v 0..5) -> board coords
export const uv = (u, v) => [(u - 1) * SU, (v - 2.5) * SU];

// Outer silhouette of the Cool S.
export const OUTLINE = [[1, 0], [2, 1], [2, 2], [1.5, 2.5], [2, 3], [2, 4], [1, 5], [0, 4], [0, 3], [0.5, 2.5], [0, 2], [0, 1]]
  .map(([u, v]) => uv(u, v));

const seg = ([a, b]) => {
  const [ax, az] = uv(a[0], a[1]), [bx, bz] = uv(b[0], b[1]);
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  return { ax, az, bx, bz, dx, dz, len2, len: Math.sqrt(len2) };
};

// The 14 strokes, in the order everyone draws them: six verticals, two diagonals, two connectors, two tips.
export const STROKES = [
  [[0, 1], [0, 2]], [[1, 1], [1, 2]], [[2, 1], [2, 2]],
  [[0, 3], [0, 4]], [[1, 3], [1, 4]], [[2, 3], [2, 4]],
  [[0, 2], [1, 3]], [[1, 2], [2, 3]],
  [[2, 2], [1.5, 2.5]], [[0, 3], [0.5, 2.5]],
  [[0, 1], [1, 0]], [[1, 0], [2, 1]],
  [[0, 4], [1, 5]], [[1, 5], [2, 4]],
].map(seg);

// The two inner lines (the ones that make it look like a twisted ribbon).
export const INNER = [[[1, 1], [1, 2]], [[1, 2], [1.5, 2.5]], [[0.5, 2.5], [1, 3]], [[1, 3], [1, 4]]].map(seg);

function polyline(pts) {
  const segs = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len: l, s0: len });
    len += l;
  }
  return { pts, segs, len };
}

// Centerline of the one long channel the strokes make: up the right, over the top, down and across, around the bottom.
export const PATH = polyline([[1.5, 2.0], [1.5, 1.0], [1.25, 0.75], [1.0, 0.586], [0.75, 0.75], [0.5, 1.0], [0.5, 2.0], [1.5, 3.0],
  [1.5, 4.0], [1.25, 4.25], [1.0, 4.414], [0.75, 4.25], [0.5, 4.0], [0.5, 2.85]].map(([u, v]) => uv(u, v)));

export const START = uv(0.5, 1.45);
const _n = [0, 0, 0];

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export const pointInS = (x, z) => pointInPoly(x, z, OUTLINE);

export function nearestOnSeg(px, pz, ax, az, dx, dz, len2, out) {
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  out[0] = ax + dx * t; out[1] = az + dz * t; out[2] = t;
  return out;
}

export function wallClearance(x, z, walls = STROKES) {
  let m = Infinity;
  for (const w of walls) {
    nearestOnSeg(x, z, w.ax, w.az, w.dx, w.dz, w.len2, _n);
    m = Math.min(m, Math.hypot(x - _n[0], z - _n[1]));
  }
  return m;
}

// distance from a point to the nearest edge of a closed polygon
export function edgeDistance(x, z, poly = OUTLINE) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dz = bz - az;
    nearestOnSeg(x, z, ax, az, dx, dz, dx * dx + dz * dz, _n);
    m = Math.min(m, Math.hypot(x - _n[0], z - _n[1]));
  }
  return m;
}

export function pathPoint(s, path = PATH) {
  s = clamp(s, 0, path.len);
  let g = path.segs[path.segs.length - 1];
  for (const sg of path.segs) if (s <= sg.s0 + sg.len) { g = sg; break; }
  const t = clamp((s - g.s0) / g.len, 0, 1);
  return { x: g.ax + (g.bx - g.ax) * t, z: g.az + (g.bz - g.az) * t, tx: (g.bx - g.ax) / g.len, tz: (g.bz - g.az) / g.len };
}

export function projectToPath(x, z, path = PATH) {
  let bestD = Infinity, bestS = 0;
  for (const g of path.segs) {
    const dx = g.bx - g.ax, dz = g.bz - g.az;
    nearestOnSeg(x, z, g.ax, g.az, dx, dz, g.len * g.len, _n);
    const d = Math.hypot(x - _n[0], z - _n[1]);
    if (d < bestD) { bestD = d; bestS = g.s0 + g.len * _n[2]; }
  }
  return { s: bestS, d: bestD };
}

// board-local -> world for a board rotated by Euler(a, 0, c) in three.js 'XYZ' order, i.e. Rx(a)·Rz(c)
export function l2w(a, c, x, y, z, out) {
  const ca = Math.cos(a), sa = Math.sin(a), cc = Math.cos(c), sc = Math.sin(c);
  const x1 = x * cc - y * sc, y1 = x * sc + y * cc;
  out[0] = x1; out[1] = y1 * ca - z * sa; out[2] = y1 * sa + z * ca;
  return out;
}

export function makeBall(at = START) {
  return { x: at[0], z: at[1], y: BALL_R, vx: 0, vz: 0, vy: 0, air: false };
}

// One physics step for the ball on the tilted S. Events go into `ev`.
export function stepBall(b, a, c, dt, ev, P = PHYS, walls = STROKES, inside = pointInS) {
  if (b.air) {
    b.vy -= P.HOP_G * dt;
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
    if (!inside(b.x, b.z)) { ev.fall = true; return; }
    if (b.y > BALL_R) return;
    const impact = -b.vy;
    b.y = BALL_R;
    ev.land = Math.max(ev.land || 0, impact);
    if (impact > P.BOUNCE_V) { b.vy = impact * 0.38; return; }
    b.vy = 0; b.air = false;
  }
  // gravity along the tilted board (exact for Rx(a)·Rz(c))
  b.vx += -P.G * Math.cos(a) * Math.sin(c) * dt;
  b.vz += P.G * Math.sin(a) * dt;
  const k = Math.exp(-P.DAMP * dt);
  b.vx *= k; b.vz *= k;
  let sp = Math.hypot(b.vx, b.vz);
  if (P.FRICTION && sp > 0) { const ns = Math.max(0, sp - P.FRICTION * dt); b.vx *= ns / sp; b.vz *= ns / sp; sp = ns; }
  if (sp > P.VMAX) { b.vx *= P.VMAX / sp; b.vz *= P.VMAX / sp; }
  b.x += b.vx * dt; b.z += b.vz * dt;

  for (let pass = 0; pass < 2; pass++) {
    for (const w of walls) {
      nearestOnSeg(b.x, b.z, w.ax, w.az, w.dx, w.dz, w.len2, _n);
      let nx = b.x - _n[0], nz = b.z - _n[1];
      const d = Math.hypot(nx, nz);
      if (d >= CONTACT) continue;
      if (d > 1e-7) { nx /= d; nz /= d; } else { nx = -w.dz / w.len; nz = w.dx / w.len; }
      const vn = b.vx * nx + b.vz * nz;
      if (vn < -P.HOP_V) {
        // too fast: ride up and over the line
        b.air = true; b.vy = P.HOP_VY; b.y = BALL_R + 1e-3;
        b.vx *= 0.82; b.vz *= 0.82;
        ev.hop = -vn;
        return;
      }
      b.x = _n[0] + nx * CONTACT; b.z = _n[1] + nz * CONTACT;
      if (vn < 0) {
        const tx = b.vx - vn * nx, tz = b.vz - vn * nz;
        b.vx = tx * 0.985 - vn * P.REST * nx;
        b.vz = tz * 0.985 - vn * P.REST * nz;
        if (-vn > (ev.bonk || 0)) { ev.bonk = -vn; ev.bnx = nx; ev.bnz = nz; }
      }
    }
  }
  if (!inside(b.x, b.z)) ev.fall = true;
}

// Ball left the S: switch to world-space free fall toward the notebook page.
export function toFall(b, a, c, by) {
  const p = l2w(a, c, b.x, b.y, b.z, [0, 0, 0]);
  const v = l2w(a, c, b.vx, b.air ? b.vy : 0, b.vz, [0, 0, 0]);
  return { x: p[0], y: p[1] + by, z: p[2], vx: v[0], vy: v[1], vz: v[2], floor: false, bounces: 0, still: 0 };
}

export function stepFall(f, dt, ev) {
  f.vy -= PHYS.FALL_G * dt;
  f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
  const fy = PAPER_Y + BALL_R;
  if (f.y <= fy) {
    f.y = fy;
    if (f.vy < -1.5) {
      ev.thud = Math.max(ev.thud || 0, -f.vy);
      f.vy = -f.vy * 0.42; f.vx *= 0.72; f.vz *= 0.72; f.bounces++;
    } else { f.vy = 0; f.floor = true; }
  }
  if (f.floor) {
    const k = Math.exp(-1.8 * dt);
    f.vx *= k; f.vz *= k;
    f.still = Math.hypot(f.vx, f.vz) < 0.25 ? f.still + dt : 0;
  }
}

// `level` = gold s's grabbed on the notebook so far; it drives the difficulty there
export function makeGame(rnd = Math.random) {
  return { level: 0, token: null, time: 0, wob: [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3, rnd() * 6.3] };
}

// seconds you get to reach a gold s that is `dist` away along the channel
export function tokenTime(dist, level) {
  const t = 2.4 + dist * (0.66 - 0.28 * clamp(level / 30, 0, 1));
  return level < 2 ? t * 1.4 : t; // the first couple are a freebie while you figure out the controls
}

// pick a spot along the channel, at least `minD` away from the ball (gold s's and portals both use this)
export function spawnSpot(b, rnd = Math.random, minD = Math.min(5, PATH.len * 0.3), margin = 0.08) {
  const sb = projectToPath(b.x, b.z).s;
  for (let tries = 0; tries < 80; tries++) {
    const s = rnd() * PATH.len;
    const dist = Math.abs(s - sb);
    if (dist < minD) continue;
    const p = pathPoint(s);
    const off = (rnd() * 2 - 1) * 0.3;
    const x = p.x - p.tz * off, z = p.z + p.tx * off;
    if (!pointInS(x, z) || wallClearance(x, z) < CONTACT + margin) continue;
    return { x, z, s, dist };
  }
  const s = sb > PATH.len / 2 ? 0.2 : PATH.len - 0.2, p = pathPoint(s);
  return { x: p.x, z: p.z, s, dist: Math.abs(s - sb) };
}

export function spawnToken(game, b, rnd = Math.random) {
  const p = spawnSpot(b, rnd);
  const T = tokenTime(p.dist, game.level);
  return (game.token = { x: p.x, z: p.z, s: p.s, t: T, T, age: 0 });
}

export function stepGame(game, b, dt, ev, rnd = Math.random) {
  game.time += dt;
  const tk = game.token;
  if (!tk) return;
  tk.age += dt; tk.t -= dt;
  const lift = b.air ? Math.max(0, b.y - BALL_R - 0.5) : 0;
  if (Math.hypot(b.x - tk.x, b.z - tk.z, lift) < PHYS.PICK) {
    game.level++;
    ev.collect = { x: tk.x, z: tk.z, level: game.level };
    game.token = null;
    return;
  }
  if (tk.t <= 0) { tk.t = 0; ev.timeout = true; }
}

// After a few points the S starts to wobble on its own.
export function wobble(game, t, out) {
  const amp = clamp((game.level - 6) * 0.0055, 0, 0.085), p = game.wob;
  out[0] = amp * (Math.sin(t * 1.9 + p[0]) * 0.6 + Math.sin(t * 3.1 + p[1]) * 0.4);
  out[1] = amp * (Math.sin(t * 2.3 + p[2]) * 0.6 + Math.sin(t * 3.7 + p[3]) * 0.4);
  return out;
}

// Out of time: the S gets bored and flicks the ball off the nearest edge.
export function flickBall(b) {
  let bd = Infinity, px = 0, pz = 0;
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, az] = OUTLINE[i], [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length];
    const dx = bx - ax, dz = bz - az;
    nearestOnSeg(b.x, b.z, ax, az, dx, dz, dx * dx + dz * dz, _n);
    const d = Math.hypot(b.x - _n[0], b.z - _n[1]);
    if (d < bd) { bd = d; px = _n[0]; pz = _n[1]; }
  }
  let dx = px - b.x, dz = pz - b.z;
  const L = Math.hypot(dx, dz) || 1;
  dx /= L; dz /= L;
  b.air = true; b.vy = 7.5; b.y = Math.max(b.y, BALL_R + 1e-3);
  b.vx = dx * 6.5; b.vz = dz * 6.5;
  return [dx, dz];
}

// The teacher's grade for a whole run (gold s's from every s-verse count).
export const GRADES = [
  [0, 'F', 'see me after class'], [3, 'D', 'needs work'], [7, 'C', 'average. very average.'],
  [12, 'B', 'solid. keep going.'], [20, 'A', 'show-off'], [32, 'A+', 'who taught you this?'], [50, 'S', 'you are the S'],
];
export function gradeFor(score) {
  let g = GRADES[0];
  for (const r of GRADES) if (score >= r[0]) g = r;
  return g;
}

/* ---------- polygon helpers ---------- */

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; a += x1 * z2 - x2 * z1; }
  return a / 2;
}

// move every edge of a simple polygon inward by d (mitred corners)
export function insetPolygon(poly, d) {
  const n = poly.length, out = [], s = Math.sign(polyArea(poly)) || 1;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    let e1x = p1[0] - p0[0], e1z = p1[1] - p0[1];
    const l1 = Math.hypot(e1x, e1z); e1x /= l1; e1z /= l1;
    let e2x = p2[0] - p1[0], e2z = p2[1] - p1[1];
    const l2 = Math.hypot(e2x, e2z); e2x /= l2; e2z /= l2;
    const n1x = -e1z * s, n1z = e1x * s, n2x = -e2z * s, n2z = e2x * s;
    const a1x = p0[0] + n1x * d, a1z = p0[1] + n1z * d, a2x = p1[0] + n2x * d, a2z = p1[1] + n2z * d;
    const den = e1x * e2z - e1z * e2x;
    if (Math.abs(den) < 1e-9) { out.push([p1[0] + n1x * d, p1[1] + n1z * d]); continue; }
    const t = ((a2x - a1x) * e2z - (a2z - a1z) * e2x) / den;
    out.push([a1x + e1x * t, a1z + e1z * t]);
  }
  return out;
}

// round off the corners of a closed loop (Chaikin corner cutting)
export function chaikinLoop(pts, iters = 3) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

// evenly spaced points around a closed loop, with tangents and arc length
export function resampleLoop(pts, n) {
  const cum = [0];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = cum[pts.length], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * len;
    while (cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % pts.length], t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s });
  }
  for (let k = 0; k < n; k++) {
    const p = out[(k - 1 + n) % n], q = out[(k + 1) % n], l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    out[k].tx = (q.x - p.x) / l; out[k].tz = (q.z - p.z) / l;
  }
  return { pts: out, len };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
