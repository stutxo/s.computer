```
⠀⠀⠀⢀⠔⢄
⠀⢀⠔⠁⠀⠀⠑⢄
⢰⠁⠀⠀⢰⠀⠀⠀⢱
⢸⠀⠀⠀⢸⠀⠀⠀⢸
⠘⢄⠀⠀⠘⢄⠀⢀⠜
⠀⢀⠕⢄⠀⠀⠑⢅
⢰⠁⠀⠀⢱⠀⠀⠀⢱
⢸⠀⠀⠀⢸⠀⠀⠀⢸
⠘⢄⠀⠀⠘⠀⠀⢀⠜
⠀⠀⠑⢄⠀⢀⠔⠁
⠀⠀⠀⠀⠑⠁
s.computer
```

Tilt the S. Grab the gold s's. Don't fly out.

A pen draws the Cool S on a notebook page, the S peels up into 3D, and a googly-eyed ball drops in. Drag anywhere (or use the arrow keys) to tilt the S and roll into the gold s's before their rings run out.

Grab 3 and a wormhole opens. Roll into it and you fly down a tunnel of Cool S's into the **s-verses**: little games that all star the Cool S, made by different people. Every wormhole lands you somewhere random. Finish a game and the next wormhole takes you to another, or sometimes home to the notebook, where every 3 more gold s's opens another. Or tap **next game** at the top to jump to a new one whenever you like. Your gold s's add up across every s-verse, and the teacher grades the lot when you fly off the page.

## The s-verses

| # | s-verse | what you do | by |
|---|---|---|---|
| 1 | the notebook | tilt the S, roll into gold s's (home) | [@stutxo](https://github.com/stutxo) |
| 2 | S Grand Prix | slot-car race through the S, under the middle band and out the other pocket | [@stutxo](https://github.com/stutxo) |
| 3 | Hole in S | mini golf on an S-shaped green, with a windmill and a duck | [@stutxo](https://github.com/stutxo) |
| 4 | S-Invaders | defend the S from rows of marching Cool S's | [@stutxo](https://github.com/stutxo) |

Jump straight into one with `?verse=`, like [s.computer/?verse=golf](https://s.computer/?verse=golf).

## Make your own s-verse

Anyone can add one. An s-verse is a single JavaScript file that gets three.js and a toolbox of game helpers handed to it, so there's nothing to install and no build step.

1. Fork this repo and copy `s-verses/_template/` to `s-verses/your-idea/`.
2. Make it yours. The template is a tiny complete game you can play straight away.
3. Run `python3 -m http.server` in the repo and open `http://localhost:8000/?verse=your-idea&replay`.
4. Add it to `s-verses/manifest.json` with your GitHub handle and open a pull request.

A robot plays every pull request in a real browser and checks the rules before a human looks at it. Your handle goes on your s-verse's title card, on the game-over note of everyone who visits it, and in the table above.

[CONTRIBUTING.md](CONTRIBUTING.md) has the rules, the full toolbox, and tips. If you're building with an AI agent, point it at [s.computer/join.txt](https://s.computer/join.txt).

## How it's built

- `index.html` is the page: the HUD, the notes, the warp, and the import map for three.js 0.172.0 (from jsDelivr).
- `src/core.js` is the engine every s-verse shares: renderer, input, synthesized sound, particles, the googly-eyed ball, camera framing.
- `src/shared.js` is the Cool S itself (its outline, its 14 lines, the channel they make) and the notebook's ball physics.
- `src/main.js` runs the multiverse: wormholes, trips, score, the s-verse list, game over.
- `src/wormhole.js` is the tunnel of Cool S's you fly down between s-verses.
- `s-verses/<id>/index.js` is one s-verse each. `s-verses/manifest.json` lists them in order; the order is their number.
- `tools/check.mjs` and `tools/smoke.mjs` are the robot that checks pull requests.

Hosted on GitHub Pages from the `main` branch root. `CNAME` points it at `s.computer`.

MIT licensed: see [LICENSE](LICENSE). Every s-verse is shared under the same terms.
