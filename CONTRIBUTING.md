# Make an s-verse

s.computer is a multiverse of tiny games that all star the Cool S. Players warp between them through portals, so every s-verse is one stop on a trip: you arrive, play for half a minute, and the portal takes you on. Yours can be anything, as long as the S is the star.

An s-verse is one JavaScript file. The engine hands it three.js and a toolbox (the googly-eyed ball, particles, sound, camera framing, the Cool S's exact geometry), renders whatever scene you build, and handles the portals, the score, and the title card with your name on it.

## The rules

1. **The Cool S is the star.** Make it big, put it in the middle, play on it, in it, around it or with it.
2. **20 to 45 seconds a visit**, then call `ctx.finish({ success: true })` to send the player on. Call `ctx.finish({ success: false })` if they lose: that ends their trip and sends them home.
3. **One finger or a mouse, plus the arrow keys.** Most people play on a phone. Space and Enter work too.
4. **Gold s's are the score.** Give them out with `ctx.addScore(n)`. The engine caps one visit at 12.
5. **One file, no imports, no network.** Everything comes in through `ctx`. Draw with three.js and canvas, and make sounds with `ctx.audio`. No images, no fetching, no storage.
6. **Fit for everyone.** Nothing scary or gross, no ads, no links, no tracking, and nothing pretending to be someone else.
7. **Runs well on an old phone.** Reuse geometries and materials, use `InstancedMesh` for crowds of things, and keep it under 150 KB.

A robot checks the rules it can (`tools/check.mjs`) and plays your s-verse in a real browser for a few seconds (`tools/smoke.mjs`). A human plays it on a phone before merging.

## Step by step

1. Fork the repo and copy `s-verses/_template/` to `s-verses/<your-id>/`. Your id is lowercase letters, numbers and dashes, like `s-pinball`.
2. In your `index.js`, set `id` to the folder name, then set `name`, `verb` and `author` (your GitHub handle, without the @).
3. Serve the repo: `python3 -m http.server` (or `npx serve`), then open `http://localhost:8000/?verse=<your-id>`. Dev mode replays your s-verse every time it finishes. Add `&loop=2` to see what you do with `ctx.loop`.
4. Run `node tools/check.mjs` and fix anything it flags.
5. Add yourself to the end of `s-verses/manifest.json`, which sets your s-verse's number: `{ "id": "<your-id>", "name": "Your Name", "author": "<you>" }`.
6. Open a pull request with a line about your s-verse and a screenshot.

## What your file exports

```js
export default {
  id: 's-pinball',           // same as the folder name
  name: 'S-Pinball',         // big on the title card (32 characters max)
  verb: 'flip!',             // the one-word instruction under it (24 max)
  author: 'your-handle',     // "by @your-handle" on the title card and the game-over note
  theme: {                   // optional: your s-verse's lettering and colors
    font: 'Bungee',          // any Google Fonts family, used for the HUD and your title card
    ink: '#ffffff',          // HUD text
    glow: '#3b1e8f',         // glow around the HUD text
    card: '#3b1e8f',         // title card background
    cardInk: '#ffffff',      // title card text
    accent: '#ffc21a',       // the verb on the title card
    stick: '#ffffff',        // the drag circle
    hudScale: 1,             // shrink or grow the HUD lettering (wide pixel fonts like 0.5)
    crt: false,              // scanlines over everything
  },
  create(ctx) {
    // build your scene, then return the object below
  },
};
```

`create(ctx)` returns an object the engine talks to:

| key | when it's used |
|---|---|
| `scene`, `camera` | required. Rendered every frame. |
| `update(dt)` | required. Called every frame; `dt` is in seconds. |
| `start()` | when the title card has gone and the player can see your s-verse. Start the action here, not in `create`. |
| `resize()` | when the screen changes size. Re-frame your camera. |
| `onPress(e)`, `onRelease(e)` | a finger or mouse goes down or up anywhere. `e.clientX`, `e.clientY` are in pixels. |
| `onKey(e, dir, up)` | a key goes down (`up` is false) or up. `dir` is `'l'`, `'r'`, `'u'`, `'d'` for the arrows and WASD; check `e.code` for `'Space'` or `'Enter'`. |
| `showsStick()`, or `ring: false` | whether to draw the drag circle while the player drags. Turn it off if you draw your own aiming. |
| `dispose()` | when the player leaves. Stop any `ctx.audio.drone()` you started. The engine frees your scene's GPU memory and stops `ctx.audio.startLoop` music. |
| `debug()` | optional. Return your state for poking at in the console with `__s.inst.debug()`. |

If `update` or a handler throws, the engine sends the player home rather than crashing the game, so check the console while you build.

## The toolbox: `ctx`

**The game**

- `ctx.addScore(n = 1)` gives the player gold s's and returns their new total.
- `ctx.finish({ success })` leaves your s-verse. Call it once.
- `ctx.loop` is how many times the player has been round the whole multiverse (0 the first time). Make things a bit harder each time.

**Input**

- `ctx.readStick()` returns `[x, y]`, each -1 to 1: how far the player is dragging from where their finger went down, or the arrow keys. `y` is positive toward the bottom of the screen.
- `ctx.input` is the raw pointer: `active`, `x`, `y` (now), `sx`, `sy` (where it went down) and `R` (the drag circle's radius in pixels).
- `ctx.keys` is `{ l, r, u, d }`, each 1 while held.
- `ctx.coarse` is true on touch screens, for wording hints ("drag" versus "arrow keys").

**Looks**

- `ctx.THREE` is three.js r172.
- `ctx.makeGoogly({ radius, material, faceUp })` makes the googly-eyed ball every s-verse shares. Add `.root` to your scene, position it, and call `.update(dt, [vx, vy, vz], lookAtPoint, { scared, dizzy })` every frame. There's also `.kick(amount)` to squash it and `.happy(seconds)` to make it grin. `faceUp` is the world direction that's "up" on screen. Use `body: false` for just the eyes (great on other things).
- `ctx.miniS(scale, depth, bevel)` makes a Cool S as an extruded `geo` (scale 1 is 4 wide and 10 tall).
- `ctx.makeParticles(scene, count, floorY)` gives you `.burst(x, y, z, n, colors, speed, up, size, life)`, `.spawn(...)` and `.update(dt)` for confetti, sparks and splashes.
- `ctx.fitPerspective(camera, points, { pitch })` frames a set of `Vector3`s on any screen, leaving room for the HUD, and returns `{ target, dir, dist }`. `ctx.sFitPoints(pad, ys)` gives the points around the Cool S.
- `ctx.envTexture()` is a soft studio environment for `scene.environment`, so metal and shiny things look good.
- `ctx.canvasTexture(w, h, (g, w, h) => { ... })` draws a texture with the 2D canvas.
- `ctx.ballTexture(base, band, stripe)` gives a ball skin in your colors.
- `ctx.hud.status(text)` is the line under the score. `ctx.hud.pop(text, x, y, z, camera, cls)` and `ctx.hud.popXY(text, px, py, cls)` pop a word up (`cls`: `'gold'`, `'red'`, `'big'`). `ctx.hud.flash(color, ms)` flashes the screen.
- `ctx.lerp`, `ctx.damp`, `ctx.easeOutCubic`, `ctx.easeOutBack`, `ctx.easeInCubic` and `ctx.pick(array)` are small helpers. `ctx.reduceMotion` is true when the player asked for less motion: skip the shaking.

**Sound** (all synthesized; respects the mute button)

- Ready-made: `collect(total)`, `bonk(strength)`, `hop()`, `boing()`, `whistle()`, `thud(strength)`, `tick()`, `sad()`, `tada()`.
- Make your own: `tone(fromHz, toHz, seconds, { type, vol, delay, vib })`, `noise(seconds, { freq, f1, q, type, vol })`.
- Music: `startLoop(bpm, (step, when) => { ... })` calls you on every 16th note. Pass `{ at: when }` to `tone` and `noise` to stay in time.
- Engines and hums: `const d = drone({ type, freq, cutoff })`, then `d.set(freq, volume, cutoff)` every frame and `d.stop()` in `dispose`. Keep drones quiet (volume around 0.02): players hear them for the whole visit.
- `ctx.haptic(ms)` buzzes phones.

**The Cool S** (`ctx.S`, plain math with no three.js)

- `S.OUTLINE` is the silhouette, 12 `[x, z]` corners. `S.STROKES` are the 14 lines as segments `{ ax, az, bx, bz, len }`. `S.INNER` holds the two lines that make the twist. The S is 4 wide and 10 tall, centered on the origin, with `z` toward the bottom of the screen.
- `S.pointInS(x, z)`, `S.edgeDistance(x, z)` and `S.wallClearance(x, z)` measure against it.
- `S.PATH` is the centerline of the channel the 14 lines make, with `S.pathPoint(s)` and `S.projectToPath(x, z)` for walking along it.
- `S.insetPolygon`, `S.chaikinLoop` and `S.resampleLoop` grow, shrink, round off and walk outlines and paths. The slot-car track is the channel, smoothed and resampled.
- `S.makeBall()` and `S.stepBall(...)` are the notebook's rolling-ball physics, if you want a ball that bounces off the 14 lines (the mini golf uses them).
- `S.mulberry32(seed)` is a seeded random generator, so a layout comes out the same every time.

The three s-verses that came first are worth reading. `race` turns the S's channel into a slot-car loop (its pockets become tunnels under the middle band), with hold-to-go controls, a rival that knows every bend's limit, and custom track meshes. `golf` has pull-back aiming with its own UI and uses the shared ball physics. `invaders` is a 2D arcade game laid flat, with instanced blocks and a CRT theme.

## Ideas up for grabs

S-snake on an S-shaped grid · a tunnel flight down an S · S pinball · S-stacking · a rhythm game on the 14 lines · trace-the-S as fast as you can · an S-shaped ski slalom · Simon S · S dominoes · an S skate park · S-sling (the S is the slingshot) · S limbo
