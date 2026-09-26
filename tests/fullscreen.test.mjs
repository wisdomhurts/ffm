// Full screen on phones, tablets and computers (ui/fullscreen.js). Emulates:
//   Android phone (Fullscreen API): buttons on the title, in the HUD (portrait: under the board) and in the
//     pause menu toggle full screen; tapping Start goes full screen by itself (unless turned off in Settings)
//   iPhone (no Fullscreen API): the buttons open the "Add to Home Screen" guide; nothing in the HUD
//   iPhone Home Screen web app / claude.ai-style frame: no buttons at all
//   computer: the button works, but starting a game never goes full screen by itself
//   the web app manifest + icons that make the Home Screen / installed game open full screen
// Usage: node build.mjs && node tests/fullscreen.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DIST, OUT } from './harness.mjs';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};

// serve dist over http (manifests and frames behave like the real site)
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/frame.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><body style="margin:0"><iframe src="/index.html" style="border:0;width:100vw;height:100vh"></iframe>');
    return;
  }
  const f = path.join(DIST, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^([/\\])+/, ''));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open({ ua, w = 390, hgt = 844, touch = true, iphone = false, standalone = false, file = '/index.html', clean = true }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, userAgent: ua });
  if (iphone) await ctx.addInitScript((sa) => {
    // iPhone Safari: no Fullscreen API for pages
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false });
    Element.prototype.requestFullscreen = undefined;
    if (sa) Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
  }, standalone);
  if (clean) await ctx.addInitScript(() => {
    // no first-game tutorial (it hides the portrait full screen button while it's up)
    try {
      if (!sessionStorage.getItem('fs-test')) {
        localStorage.clear();
        sessionStorage.setItem('fs-test', '1');
      }
    } catch {
      /* ignore */
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + file);
  if (file === '/index.html') await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
  await page.waitForTimeout(900);
  return { ctx, page, errors };
}

const isFs = (page) => page.evaluate(() => !!document.fullscreenElement);
const visible = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'), sel);
const waitFs = async (page, want) => {
  for (let i = 0; i < 40 && (await isFs(page)) !== want; i++) await page.waitForTimeout(50);
  return isFs(page);
};
const rect = (page, sel) => page.evaluate((s) => {
  const e = [...document.querySelectorAll(s)].find((x) => x.offsetParent !== null);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom };
}, sel);
const overlap = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

async function startByTapping(page) {
  await page.tap('.btn-play');
  await page.waitForTimeout(500);
  await page.tap('.start-row .btn-green');
  await page.waitForFunction(() => window.__app.state === 'playing', null, { timeout: 60000 });
}

async function skipIntro(page) {
  await page.evaluate(() => {
    const t = document.querySelector('.hud .tut-skip');
    t?.click();
  });
  // the camera intro hides the HUD for a moment (slow under SwiftShader)
  await page.waitForFunction(() => { const h = document.querySelector('.hud'); return h && !h.classList.contains('intro'); }, null, { timeout: 60000 });
  await page.waitForTimeout(600);
}

try {
  // ---------------------------------------------------------------- Android phone, portrait
  {
    const { ctx, page, errors } = await open({ ua: ANDROID });
    check(await visible(page, '.title-fs'), 'android: full screen button on the title');
    await page.tap('.title-fs');
    check(await waitFs(page, true), 'android: title button enters full screen');
    await page.tap('.title-fs');
    check(!(await waitFs(page, false)), 'android: title button leaves full screen');
    await startByTapping(page);
    check(await waitFs(page, true), 'android: tapping Start goes full screen by itself');
    await skipIntro(page);
    await page.evaluate(() => document.exitFullscreen());
    await waitFs(page, false);
    await page.waitForTimeout(400);
    check(!(await visible(page, '.hud-btns .fs-btn')), 'android portrait: no full screen button in the crowded top-left row');
    const btn = await rect(page, '.hud-fs-tr');
    const board = await rect(page, '.hud-tr .board');
    check(!!btn && !!board && btn.t >= board.b - 1 && btn.r <= board.r + 1, 'android portrait: full screen button sits under the family board ' + JSON.stringify(btn));
    check(!overlap(btn, await rect(page, '.meter')), 'android portrait: it stays clear of the road meter');
    check(!overlap(btn, await rect(page, '.pg-chip')), 'android portrait: it stays clear of the quest tracker');
    await page.screenshot({ path: path.join(OUT, 'fs-android-portrait-hud.png') });
    await page.tap('.hud-fs-tr');
    check(await waitFs(page, true), 'android portrait: HUD button enters full screen');
    await page.waitForTimeout(300);
    await page.tap('.hud-fs-tr');
    check(!(await waitFs(page, false)), 'android portrait: HUD button leaves full screen');
    // the pause menu has one too
    await page.tap('.hud-btns .hbtn');
    await page.waitForTimeout(500);
    check(await visible(page, '.pp-fs'), 'android: full screen button in the pause menu');
    // Settings: the live switch and "Full screen when playing"
    await page.evaluate(() => window.__app.menus.openSettings());
    await page.waitForTimeout(400);
    const names = await page.evaluate(() => [...document.querySelectorAll('.settings .set-name')].map((e) => e.textContent));
    check(names.includes('Full screen') && names.includes('Full screen when playing'), 'android: Settings has "Full screen" and "Full screen when playing"');
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.settings .set-row')].find((r) => r.querySelector('.set-name')?.textContent === 'Full screen when playing');
      row.querySelector('.switch').click();
    });
    check(await page.evaluate(() => JSON.parse(localStorage.getItem('steal-a-seed:v1:settings') || '{}').autoFullscreen === false), 'android: the setting switches off (and is saved)');
    await page.evaluate(() => {
      window.__app.menus.closeAllModals?.();
      window.__app.quitToTitle();
    });
    await page.waitForTimeout(600);
    await startByTapping(page);
    await page.waitForTimeout(600);
    check(!(await isFs(page)), 'android: with the setting off, starting a game stays in the browser');
    check(errors.length === 0, 'android: no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  // ---------------------------------------------------------------- Android phone, landscape
  {
    const { ctx, page, errors } = await open({ ua: ANDROID, w: 844, hgt: 390 });
    await startByTapping(page);
    await skipIntro(page);
    check(await visible(page, '.hud-btns .fs-btn'), 'android landscape: full screen button in the top-left row');
    check(!(await visible(page, '.hud-fs-tr')), 'android landscape: only one full screen button');
    await page.screenshot({ path: path.join(OUT, 'fs-android-landscape-hud.png') });
    check(errors.length === 0, 'android landscape: no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  // ---------------------------------------------------------------- iPhone Safari
  {
    const { ctx, page, errors } = await open({ ua: IPHONE, iphone: true });
    check(await visible(page, '.title-fs'), 'iphone: full screen button on the title');
    await page.tap('.title-fs');
    await page.waitForTimeout(500);
    check(await visible(page, '.fs-help'), 'iphone: it opens the Add to Home Screen guide');
    const steps = await page.evaluate(() => [...document.querySelectorAll('.fs-help .fsh-step b')].map((b) => b.textContent));
    check(steps.length === 3 && /Share/.test(steps[0]) && /Home Screen/.test(steps[1]), 'iphone: guide has the three steps: ' + steps.join(' / '));
    await page.screenshot({ path: path.join(OUT, 'fs-iphone-guide.png') });
    await page.tap('.fs-help .modal-done .btn');
    // the guide fades out, then leaves the page (timers run late while SwiftShader draws a frame)
    const closed = await page.waitForFunction(() => !document.querySelector('.modal:not(.out) .fs-help'), null, { timeout: 8000 }).then(() => true, () => false);
    check(closed, 'iphone: Done closes the guide');
    await page.evaluate(() => window.__app.menus.openSettings());
    await page.waitForTimeout(400);
    const how = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.settings .set-row button')].find((x) => /Show me how/.test(x.textContent));
      b?.click();
      return !!b;
    });
    await page.waitForTimeout(400);
    check(how && (await visible(page, '.fs-help')), 'iphone: Settings "Show me how" opens the guide');
    await page.evaluate(() => window.__app.menus.closeAllModals());
    await page.waitForTimeout(300);
    await startByTapping(page);
    await skipIntro(page);
    check(!(await visible(page, '.hud .fs-btn')), 'iphone: no full screen button in the HUD');
    check(errors.length === 0, 'iphone: no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  // ---------------------------------------------------------------- iPhone, opened from the Home Screen
  {
    const { ctx, page } = await open({ ua: IPHONE, iphone: true, standalone: true });
    check(!(await visible(page, '.title-fs')), 'iphone home screen app: no full screen button (already full screen)');
    await ctx.close();
  }

  // ---------------------------------------------------------------- iPhone, inside a frame (claude.ai viewer)
  {
    const { ctx, page } = await open({ ua: IPHONE, iphone: true, file: '/frame.html' });
    const f = page.frames().find((x) => x.url().endsWith('/index.html'));
    await f.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
    await page.waitForTimeout(600);
    check(!(await f.evaluate(() => [...document.querySelectorAll('.title-fs')].some((e) => e.offsetParent))), 'iphone in a frame: no Home Screen guide button');
    await ctx.close();
  }

  // ---------------------------------------------------------------- computer
  {
    const { ctx, page, errors } = await open({ ua: undefined, w: 1280, hgt: 720, touch: false });
    check(await visible(page, '.title-fs'), 'computer: full screen button on the title');
    await page.click('.btn-play');
    await page.waitForTimeout(500);
    await page.click('.start-row .btn-green');
    await page.waitForFunction(() => window.__app.state === 'playing', null, { timeout: 60000 });
    await page.waitForTimeout(500);
    check(!(await isFs(page)), 'computer: starting a game never goes full screen by itself');
    await page.evaluate(() => window.__app.menus.openSettings());
    await page.waitForTimeout(300);
    const names = await page.evaluate(() => [...document.querySelectorAll('.settings .set-name')].map((e) => e.textContent));
    check(names.includes('Full screen') && !names.includes('Full screen when playing'), 'computer: Settings has only the Full screen switch');
    check(errors.length === 0, 'computer: no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  // ---------------------------------------------------------------- manifest + icons
  {
    const ctx = await browser.newContext({ userAgent: ANDROID, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html');
    const cdp = await ctx.newCDPSession(page);
    const m = await cdp.send('Page.getAppManifest');
    const data = JSON.parse(m.data || '{}');
    check(m.errors.length === 0, 'manifest parses without errors' + (m.errors.length ? ': ' + JSON.stringify(m.errors) : ''));
    check(data.display === 'fullscreen' && data.start_url === './', 'manifest: display fullscreen, start_url ./');
    for (const ic of ['apple-touch-icon.png', ...data.icons.map((i) => i.src)]) {
      const r = await page.request.get(BASE + '/' + ic);
      check(r.ok() && r.headers()['content-type'] === 'image/png', 'icon served: ' + ic);
    }
    await ctx.close();
  }
} catch (e) {
  console.error(e);
  failed++;
}
await browser.close();
server.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
