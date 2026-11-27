// The robot that checks every s-verse before a human looks at it. No dependencies: `node tools/check.mjs`.
// It checks the manifest, each s-verse's folder and code, and the rules in CONTRIBUTING.md that a script can check.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 's-verses');
const ID_OK = /^[a-z0-9][a-z0-9-]{0,40}$/;
const HANDLE_OK = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const FONT_OK = /^[A-Za-z0-9 ]{1,40}$/;
const COLOR_OK = /^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\))$/i;
const MAX_BYTES = 150 * 1024;
const ALLOWED_FILES = new Set(['index.js', 'README.md']);

// things an s-verse may not do (the page's Content-Security-Policy blocks most of them anyway)
const FORBIDDEN = [
  [/\bimport\s*\(/, 'dynamic import()'],
  [/^\s*import\s[^(]/m, 'import statements (everything you need comes in through ctx)'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bRTCPeerConnection\b/, 'WebRTC'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\b/, 'new Function()'],
  [/\b(?:Shared)?Worker\s*\(/, 'workers'],
  [/\bimportScripts\b/, 'importScripts'],
  [/document\.cookie/, 'cookies'],
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, 'storage (the engine keeps scores; ask in your PR if you need more)'],
  [/\bwindow\.open\s*\(/, 'window.open()'],
  [/\blocation\s*(?:\.href\s*)?=(?!=)/, 'navigating away'],
  [/document\.write/, 'document.write'],
  [/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/, 'writing HTML (draw with three.js or a canvas instead)'],
  [/\bpostMessage\s*\(/, 'postMessage()'],
  [/\b__s\b|__sReady|__sFallback/, "the engine's debug hooks"],
  [/\bgoatcounter\b/i, 'the visitor counter'],
  [/https?:\/\//, 'URLs (no network: draw everything yourself)'],
];

let failures = 0, warnings = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const warn = (msg) => { warnings++; console.log(`  ! ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

/* ---------- the manifest ---------- */
console.log('s-verses/manifest.json');
let manifest = [];
try {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  manifest = m.sverses;
  if (!Array.isArray(manifest)) throw new Error('"sverses" should be a list');
  ok(`${manifest.length} s-verses listed`);
} catch (err) { fail(`can't read it: ${err.message}`); }
const seen = new Set();
for (const v of manifest) {
  if (!v || !ID_OK.test(v.id)) { fail(`bad id ${JSON.stringify(v && v.id)} (lowercase letters, numbers and dashes)`); continue; }
  if (seen.has(v.id)) fail(`"${v.id}" is listed twice`);
  seen.add(v.id);
  if (!fs.existsSync(path.join(DIR, v.id, 'index.js'))) fail(`"${v.id}" is listed but s-verses/${v.id}/index.js doesn't exist`);
  if (!v.author || !HANDLE_OK.test(v.author)) fail(`"${v.id}" needs an author: your GitHub handle, without the @`);
  for (const k of Object.keys(v)) if (!['id', 'home', 'name', 'author', 'hidden'].includes(k)) warn(`"${v.id}" has an unknown key "${k}"`);
}
const homes = manifest.filter((v) => v && v.home);
if (homes.length !== 1) fail(`exactly one s-verse should be home (found ${homes.length})`);
else if (manifest[0] !== homes[0]) fail('the home s-verse should be first in the list');

/* ---------- each s-verse ---------- */
const folders = fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const name of folders) {
  const isTemplate = name === '_template';
  console.log(`\ns-verses/${name}/`);
  if (!isTemplate && !ID_OK.test(name)) { fail('folder name must be lowercase letters, numbers and dashes'); continue; }
  if (!isTemplate && !seen.has(name)) warn("not in manifest.json yet, so players won't find it (add it when it's ready)");
  for (const f of fs.readdirSync(path.join(DIR, name))) if (!ALLOWED_FILES.has(f)) fail(`unexpected file "${f}" (an s-verse is one index.js, plus an optional README.md)`);
  const file = path.join(DIR, name, 'index.js');
  if (!fs.existsSync(file)) { fail('no index.js'); continue; }
  const src = fs.readFileSync(file, 'utf8');
  const bytes = Buffer.byteLength(src);
  if (bytes > MAX_BYTES) fail(`index.js is ${(bytes / 1024).toFixed(0)} KB (keep it under ${MAX_BYTES / 1024} KB)`); else ok(`${(bytes / 1024).toFixed(1)} KB`);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1'); // ignore comments
  let clean = true;
  for (const [re, what] of FORBIDDEN) if (re.test(code)) { fail(`uses ${what}`); clean = false; }
  if (clean) ok('no network, storage, eval or imports');
  else continue; // don't run code that breaks the rules
  if (!/export\s+default\s*\{/.test(code)) { fail('needs `export default { id, name, verb, author, create(ctx) { ... } }`'); continue; }
  const exports = code.match(/^\s*export\s/gm) || [];
  if (exports.length !== 1) fail('only one export allowed: export default { ... }');

  let def;
  try { def = (await import(pathToFileURL(file).href)).default; } catch (err) { fail(`doesn't load: ${err.message}`); continue; }
  if (!def || typeof def !== 'object') { fail('export default should be an object'); continue; }
  if (isTemplate) { ok('template loads'); continue; }
  if (def.id !== name) fail(`id is "${def.id}" but the folder is "${name}" (they must match)`);
  if (typeof def.create !== 'function') fail('needs a create(ctx) function');
  if (!def.name || typeof def.name !== 'string' || def.name.length > 32) fail('name: a string, at most 32 characters');
  if (def.verb !== undefined && (typeof def.verb !== 'string' || def.verb.length > 24)) fail('verb: a string, at most 24 characters');
  if (!def.author || !HANDLE_OK.test(def.author)) fail('author: your GitHub handle, without the @');
  const entry = manifest.find((v) => v && v.id === name);
  if (entry && entry.author && def.author && entry.author.toLowerCase() !== def.author.toLowerCase()) fail(`author in index.js (@${def.author}) and manifest.json (@${entry.author}) don't match`);
  if (def.home && !(entry && entry.home)) fail('only the notebook is home');
  const t = def.theme;
  if (t !== undefined) {
    if (typeof t !== 'object') fail('theme should be an object');
    else {
      for (const k of Object.keys(t)) if (!['font', 'ink', 'glow', 'card', 'cardInk', 'accent', 'stick', 'hudScale', 'crt'].includes(k)) warn(`theme has an unknown key "${k}"`);
      if (t.font !== undefined && !FONT_OK.test(t.font)) fail('theme.font: a Google Fonts family name, letters, numbers and spaces only');
      for (const k of ['ink', 'glow', 'card', 'cardInk', 'accent', 'stick']) if (t[k] !== undefined && !COLOR_OK.test(t[k])) fail(`theme.${k}: a hex color like #ff4f93`);
      if (t.hudScale !== undefined && !(t.hudScale >= 0.3 && t.hudScale <= 2)) fail('theme.hudScale: between 0.3 and 2');
    }
  }
  const isHome = !!(entry && entry.home);
  if (!isHome && !/ctx\.makeWormhole\s*\(/.test(code)) fail('needs a wormhole: open one with ctx.makeWormhole() when the player wins, so they can go on');
  if (!isHome && !/\bopenWormhole\b/.test(code)) warn("has no openWormhole(): the engine calls it when time's up, so open your wormhole there too");
  if (!/ctx\.addScore\s*\(/.test(code)) warn("never calls ctx.addScore(): players can't earn gold s's here");
  ok(`"${def.name}" by @${def.author}`);
}

console.log(failures ? `\n${failures} problem${failures === 1 ? '' : 's'} to fix${warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}.` : `\nall good${warnings ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : ''}.`);
process.exit(failures ? 1 : 0);
