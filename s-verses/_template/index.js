// A starter s-verse. Copy this folder to s-verses/<your-id>/, change the id below to match, and make it yours.
// Test it at http://localhost:8000/?verse=<your-id> (see CONTRIBUTING.md). This one is a tiny complete game:
// gold s's rain down around a giant spinning Cool S, and you slide the googly ball to catch them.
//
// The rules, short version: the Cool S is the star. 20-45 seconds. One finger (or mouse), with arrow keys too.
// No imports and no network: everything you need comes in through ctx. Call ctx.finish() when you're done.

export default {
  id: 'my-s-verse',             // must match your folder name: lowercase letters, numbers and dashes
  name: 'S Rain',               // shown big on the title card when players warp in
  verb: 'catch!',               // the one-word instruction under the name
  author: 'your-github-handle', // credited on the title card as "by @your-github-handle"
  // optional: your own lettering and colors. font is any Google Fonts family; colors are hex.
  theme: { font: 'Bungee', ink: '#ffffff', glow: '#3b1e8f', card: '#3b1e8f', cardInk: '#ffffff', accent: '#ffc21a' },
  create(ctx) { return createRain(ctx); },
};

const GOAL = 6;   // catch this many to win
const LIVES = 3;  // miss this many and you're sent home

function createRain(ctx) {
  const { THREE, audio, hud } = ctx;

  // 1. a scene and a camera (the engine renders them for you every frame)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x22114f);
  scene.environment = ctx.envTexture(); // soft studio lighting for shiny things
  scene.add(new THREE.HemisphereLight(0xffffff, 0x442288, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-3, 8, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 100);

  // 2. the star of the show: a giant Cool S (ctx.miniS builds one at any size)
  const big = ctx.miniS(0.55, 0.5, 0.08);
  const bigS = new THREE.Mesh(big.geo, new THREE.MeshStandardMaterial({ color: 0x7c4dff, roughness: 0.3, metalness: 0.2 }));
  bigS.position.set(0, 1, -3);
  scene.add(bigS);

  // 3. you: the googly-eyed ball that every s-verse shares
  const you = ctx.makeGoogly({ radius: 0.42, faceUp: [0, 1, 0] });
  scene.add(you.root);
  const youAt = { x: 0, y: -4.2 };

  // 4. the things to catch: gold s's
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 1, roughness: 0.2 });
  const coin = ctx.miniS(0.07, 0.05, 0.015);
  const drops = [];
  const fx = ctx.makeParticles(scene, 200);

  // frame the play area on any screen size: x from -3 to 3, y from -5 to 6
  const fitPts = [];
  for (const x of [-3.3, 3.3]) for (const y of [-5.2, 6.4]) fitPts.push(new THREE.Vector3(x, y, 0));
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    // move the camera back until every corner fits
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(6.4 / tan, 3.3 / (tan * camera.aspect)) * 1.12;
    camera.position.set(0, 0.6, dist);
    camera.lookAt(0, 0.6, 0);
  }
  resize();

  let state = 'ready', caught = 0, missed = 0, spawnT = 0.5, t = 0, ended = 0;

  function update(dt) {
    t += dt;
    bigS.rotation.y = Math.sin(t * 0.8) * 0.5;
    if (state === 'play') {
      // input: ctx.readStick() gives [x, y] from -1 to 1, from a drag anywhere or the arrow keys
      const [sx] = ctx.readStick();
      youAt.x = Math.max(-2.8, Math.min(2.8, youAt.x + sx * 7 * dt));
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = 0.9 - Math.min(0.4, ctx.loop * 0.1); // ctx.loop: how many times the player has been round the multiverse
        const m = new THREE.Mesh(coin.geo, gold);
        m.position.set((Math.random() - 0.5) * 5.6, 6.4, 0);
        scene.add(m);
        drops.push({ m, v: 2.4 + Math.random() });
      }
      for (const d of drops) {
        d.m.position.y -= d.v * dt;
        d.m.rotation.y += dt * 3;
        if (!d.done && Math.abs(d.m.position.y - youAt.y) < 0.5 && Math.abs(d.m.position.x - youAt.x) < 0.6) {
          d.done = true;
          caught++;
          const total = ctx.addScore(1); // gold s's go on the player's score (up to 12 per visit)
          audio.collect(total);
          hud.pop('+1', d.m.position.x, d.m.position.y, 0, camera, 'gold');
          fx.burst(d.m.position.x, d.m.position.y, 0, 12, [0xffc21a, 0xffffff], 2, 2, 0.08, 0.6, 4);
          you.happy();
        } else if (!d.done && d.m.position.y < -5.5) {
          d.done = true;
          missed++;
          audio.bonk(3);
          hud.flash('rgba(255,80,80,0.3)', 200);
        }
        if (d.done) d.m.visible = false;
      }
      hud.status(`${caught}/${GOAL}   misses ${missed}/${LIVES}`);
      if (caught >= GOAL) { state = 'won'; ended = t; audio.tada(); hud.popXY('nice!', innerWidth / 2, innerHeight * 0.4, 'big'); }
      if (missed >= LIVES) { state = 'lost'; ended = t; audio.sad(); hud.popXY('oops', innerWidth / 2, innerHeight * 0.4, 'big'); }
    }
    // when you're done, call ctx.finish once: success goes on to the next s-verse, failure sends the player home
    if ((state === 'won' || state === 'lost') && t - ended > 1.5) { state = 'done'; ctx.finish({ success: caught >= GOAL }); }
    you.root.position.set(youAt.x, youAt.y, 0);
    you.update(dt, [0, 0, 0], camera.position);
    fx.update(dt);
  }

  // the s-verse object the engine talks to
  return {
    scene, camera, update, resize,
    start() { state = 'play'; hud.status(`catch ${GOAL}!`); }, // called when the title card goes away
    dispose() {},                                                // stop any sounds you started (drones, loops)
    debug: () => ({ state, caught, missed }),                    // handy in the console: __s.inst.debug()
  };
}
