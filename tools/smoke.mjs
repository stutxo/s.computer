// Plays each s-verse for a few seconds in a real browser (real three.js, software WebGL) and fails on any error.
// `node tools/smoke.mjs` checks everything in the manifest; `node tools/smoke.mjs my-s-verse` checks just yours.
// Needs Playwright: `npm install --no-save playwright && npx playwright install chromium`.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools', 'out');
const PLAY_MS = 10000;
const ALLOWED_HOSTS = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/plain' };
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 's-verses', 'manifest.json'), 'utf8')).sverses;
const home = manifest.find((v) => v.home);
const ids = process.argv.length > 2 ? process.argv.slice(2) : manifest.map((v) => v.id);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;

for (const id of ids) {
  const isHome = home && id === home.id;
  console.log(`\n${id}${isHome ? ' (home)' : ''}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  if (process.env.THREE_MOCK) { // offline testing only: stand a local file in for the three.js CDN
    await ctx.route('https://cdn.jsdelivr.net/**', (route) => {
      const u = route.request().url();
      const f = u.endsWith('three.module.min.js') ? process.env.THREE_MOCK : u.includes('RoomEnvironment') ? process.env.THREE_MOCK.replace(/three\.module\.js$/, 'addons/environments/RoomEnvironment.js') : null;
      return f ? route.fulfill({ status: 200, headers: { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : route.abort();
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' }, body: '' }));
  }
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.host !== new URL(BASE).host && !ALLOWED_HOSTS.has(u.hostname)) problems.push(`tried to contact ${u.hostname}`);
  });
  await page.goto(isHome ? BASE : `${BASE}?verse=${id}`);
  const t0 = Date.now();
  let arrived = false;
  while (Date.now() - t0 < 40000) {
    arrived = await page.evaluate((id) => !!(window.__sReady && window.__s && window.__s.verse === id && !window.__s.warping), id).catch(() => false);
    if (arrived) break;
    await sleep(250);
  }
  if (!arrived) problems.push("didn't start within 40 seconds");
  else {
    // play like a distracted human: drags in random directions, taps, and arrow keys
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    const tEnd = Date.now() + PLAY_MS;
    while (Date.now() < tEnd) {
      const x = 60 + Math.random() * 270, y = 200 + Math.random() * 500;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let k = 0; k < 6; k++) { await page.mouse.move(x + (Math.random() - 0.5) * 220, y + (Math.random() - 0.5) * 220, { steps: 3 }); await sleep(80); }
      await page.mouse.up();
      const key = keys[(Math.random() * keys.length) | 0];
      await page.keyboard.down(key); await sleep(150); await page.keyboard.up(key);
    }
    const still = await page.evaluate(() => ({ verse: window.__s.verse, score: window.__s.run.score }));
    console.log(`  played ${PLAY_MS / 1000}s, score ${still.score}`);
  }
  await page.screenshot({ path: path.join(OUT, `${id}.png`) });
  if (problems.length) { failed++; for (const p of [...new Set(problems)].slice(0, 12)) console.log(`  ✗ ${p}`); } else console.log('  ✓ no errors');
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} s-verse${failed === 1 ? '' : 's'} had problems.` : '\nall s-verses ran cleanly.');
process.exit(failed ? 1 : 0);
