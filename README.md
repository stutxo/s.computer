# s.computer

Tilt the S. Grab the gold s's. Don't fly out.

A one-page Three.js game. A pen draws the Cool S on a notebook page, the S peels up into 3D, and a googly-eyed ball drops in. Drag anywhere (or click and drag, or use the arrow keys) to tilt the S and roll into the gold mini s's before their rings run out. The 14 lines of the S are the walls: hit one too fast and you hop it, hop an outer one and you fly off onto the page.

## Files

- `index.html` is the whole game. It loads three.js 0.172.0 from jsDelivr and two Google Fonts. No build step.
- `CNAME` tells GitHub Pages to serve the site at `s.computer`.

## Tweaking

The gameplay numbers sit at the top of the script in `index.html`, between `SIM-START` and `SIM-END`: tilt, gravity, bounciness, how hard a hit has to be to hop a line, time per gold s, and the wobble that kicks in after 6 points.

## Hosting

GitHub Pages, deployed from the `main` branch root.
