# AGENTS.md

You're probably here because a person asked you to help them make an **s-verse**: a tiny game for [s.computer](https://s.computer), a multiverse of browser games that all star the Cool S (the pointy S everyone drew in school). Players roll a googly-eyed ball through wormholes from one s-verse to the next, so each one is a short stop on a trip.

[CONTRIBUTING.md](CONTRIBUTING.md) is the full guide for people, including every tool in `ctx`. This file is the same job written as a checklist for you.

## Before you start

- Ask your person for their **GitHub handle**. It goes in `author` and on the title card. Never put your own name there.
- Agree on the idea in one sentence. The Cool S has to be the star: play on it, in it, around it or with it.
- Pick an **id**: lowercase letters, numbers and dashes, like `s-pinball`. It's the folder name and the `?verse=` name.

## Build it

1. `cp -r s-verses/_template s-verses/<id>`. The template is a small complete game, so read it first. Then read the finished example closest to your idea: `golf` (pull-back aiming, the shared ball physics), `race` (custom track meshes, a rival), `invaders` (a 2D arcade game laid flat, `InstancedMesh`, a CRT theme).
2. In `s-verses/<id>/index.js`, set `id` (same as the folder), `name` (at most 32 characters), `verb` (at most 24), `author`, and optionally `theme`.
3. Build the game inside `create(ctx)`. Return at least `{ scene, camera, update(dt) }`, and start the action in `start()`, not in `create`. Everything comes in through `ctx`: three.js r172 is `ctx.THREE`, the Cool S's geometry is `ctx.S`. CONTRIBUTING.md lists the rest under "What your file exports" and "The toolbox".
4. End every visit with exactly one `ctx.finish({ success: true })` when they win, 20 to 45 seconds in, or `ctx.finish({ success: false })` when they lose (that sends them home).
5. Give out gold s's with `ctx.addScore(n)`. A visit tops out at 12.
6. Add one line to the end of `s-verses/manifest.json`: `{ "id": "<id>", "name": "<Name>", "author": "<handle>" }`.

## Hard rules

`node tools/check.mjs` enforces these, and the pull request fails if any is broken:

- Only `s-verses/<id>/index.js`, plus an optional `README.md`. Don't change anything else apart from your line in the manifest.
- One `export default { ... }`, no other exports, no `import` and no `import()`.
- No network and no storage: no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, WebRTC, workers, `localStorage`, `sessionStorage`, `indexedDB` or cookies.
- No `eval`, `new Function`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `window.open`, `postMessage`, navigating away, the engine's `__s` debug hooks, or the visitor counter.
- No URLs anywhere in the code, not even in strings. Draw everything with three.js or a canvas, and make sounds with `ctx.audio`.
- Under 150 KB.
- `id` matches the folder, and `author` is a GitHub handle without the @ that matches the manifest.
- It calls `ctx.finish(...)`.

These ones a person checks:

- One finger or a mouse, plus the arrow keys. Most people play on a phone.
- Keep your own buttons out of the top corners. The logo, the score and the "enter wormhole" button live there.
- Fit for everyone: nothing scary or gross, no ads, links or tracking, and nothing pretending to be someone else.
- Smooth on an old phone: reuse geometries and materials, use `InstancedMesh` for crowds, and don't create objects every frame.
- If you start a `ctx.audio.drone()`, stop it in `dispose()`.

## Test it

```sh
python3 -m http.server 8000
# open http://localhost:8000/?verse=<id>&replay
```

`&replay` plays your s-verse again instead of moving on. Play it to the end both ways, winning and losing, by dragging and with the arrow keys, and keep the console open: if `update` throws, the engine sends the player home. If you return a `debug()` function, `__s.inst.debug()` in the console shows your state.

```sh
node tools/check.mjs

# optional: play it in a real browser, the way the pull request robot does
npm install --no-save playwright && npx playwright install chromium
node tools/smoke.mjs <id>
```

## Done means

- [ ] `node tools/check.mjs` passes.
- [ ] It plays start to finish at `?verse=<id>&replay` with no console errors, by touch or mouse and by keys.
- [ ] Winning calls `ctx.finish({ success: true })`, losing calls `ctx.finish({ success: false })`.
- [ ] Its line is at the end of `s-verses/manifest.json`.
- [ ] A pull request that fills in the template: the s-verse's name and id, what you do in one line, a screenshot, and the checklist. Sending it shares the s-verse under the MIT license, so check your person is happy with that.

Once the pull request is open, a robot plays it in a real browser and comments a link to play it, and then a person plays it on a phone before merging.

## Changing the engine instead

`index.html` and `src/` are shared by every s-verse. Don't change what `ctx` gives s-verses in a way that breaks the ones already here. After any change, run `node tools/check.mjs` and `node tools/smoke.mjs`, and play the notebook at `/` and each s-verse at `/?verse=<id>&replay`.
