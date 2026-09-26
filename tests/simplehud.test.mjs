// Simple HUD for small screens (ui/hudLayout.js). Emulates older iPhones in Safari (and from the Home Screen),
// upright and on their side, plus a bigger phone and a computer, and checks:
//   * Auto turns the Simple HUD on for small screens only; Settings > Screen layout forces it on or off
//   * Simple: the family board is a row of faces (a tap shows the full board, which folds away again),
//     the road meter steps aside, the hotbar only shows items you have (none: no hotbar)
//   * nothing on the HUD overlaps anything else, with and without the first-game tutorial card
// Usage: node build.mjs && node tests/simplehud.test.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { DIST, OUT } from './harness.mjs';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(w, hgt, { touch = true, layout = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, userAgent: touch ? IPHONE : undefined });
  if (layout) await ctx.addInitScript((l) => localStorage.setItem('steal-a-seed:v1:settings', JSON.stringify({ hudLayout: l })), layout);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('file://' + path.join(DIST, 'index.html'));
  await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}

async function play(page) {
  await page.evaluate(() => window.__app.startGame({ charId: 'dorian', mode: 'endless', difficulty: 'chill', fresh: true }));
  await page.waitForFunction(() => { const h = document.querySelector('.hud'); return h && !h.classList.contains('intro'); }, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
}

const simpleOn = (page) => page.evaluate(() => document.documentElement.classList.contains('hud-simple'));
const shown = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => {
  const r = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
}), sel);

// every visible HUD piece that must stay clear of the others
const PIECES = ['.hud-btns', '.pg-chip', '.board', '.hud-fs-tr', '.stats', '.nextgoal', '.hotbar', '.tb-jump', '.tb-bonk', '.tb-act.show', '.prompt.show', '.carry.show', '.tut', '.evchip'];
async function overlaps(page) {
  return page.evaluate((sels) => {
    const boxes = [];
    for (const s of sels) for (const e of document.querySelectorAll(s)) {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
      if (e.closest('[hidden]')) continue;
      boxes.push({ s, e, l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    const out = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ox > 2 && oy > 2) out.push(`${a.s} x ${b.s} (${Math.round(ox)}x${Math.round(oy)})`);
    }
    return out;
  }, PIECES);
}

const SMALL = [
  ['iPhone 8, Safari, upright', 375, 553],
  ['iPhone 8, Home Screen, upright', 375, 667],
  ['iPhone 8, Safari, on its side', 667, 331],
  ['iPhone SE (1st), Safari, upright', 320, 460],
  ['iPhone SE (1st), Safari, on its side', 568, 270],
];

try {
  for (const [name, w, hgt] of SMALL) {
    const { ctx, page, errors } = await open(w, hgt);
    await play(page);
    check(await simpleOn(page), `${name}: Simple HUD is on`);
    check(!(await shown(page, '.meter')), `${name}: road meter steps aside`);
    check(await shown(page, '.board-strip') && !(await shown(page, '.board-rows')), `${name}: family board is a row of faces`);
    check(!(await shown(page, '.hotbar')), `${name}: no hotbar before you own an item`);
    let o = await overlaps(page);
    check(o.length === 0, `${name}: nothing overlaps (first-game tutorial up)` + (o.length ? ': ' + o.join(', ') : ''));
    await page.screenshot({ path: path.join(OUT, `simple-${w}x${hgt}-start.png`) });
    // a busier moment: tutorial gone, cash, two items, standing at a seed
    await page.evaluate(() => {
      document.querySelector('.hud .tut-skip')?.click();
      const g = window.__app.game;
      const me = g.human;
      me.cash = 12345;
      me.items.banana = 2;
      me.items.coil = 1;
      const pod = g.pods.find((p) => p.seed && p.biome === 0);
      me.pos.x = pod.x * 0.85;
      me.pos.z = pod.z - 2;
    });
    await page.waitForTimeout(1500);
    const slots = await page.evaluate(() => [...document.querySelectorAll('.hotbar .slot')].filter((s) => s.getBoundingClientRect().width > 0).length);
    check(slots === 2, `${name}: hotbar shows just the 2 items you have (${slots})`);
    o = await overlaps(page);
    check(o.length === 0, `${name}: nothing overlaps (items, prompt)` + (o.length ? ': ' + o.join(', ') : ''));
    await page.screenshot({ path: path.join(OUT, `simple-${w}x${hgt}-play.png`) });
    // tap the faces: the full board unfolds, then folds away by itself
    await page.tap('.board-strip');
    await page.waitForTimeout(400);
    check(await shown(page, '.board.open .board-rows'), `${name}: tapping the faces shows the full board`);
    await page.screenshot({ path: path.join(OUT, `simple-${w}x${hgt}-board.png`) });
    await page.waitForTimeout(5600);
    check(!(await shown(page, '.board-rows')), `${name}: the full board folds away again`);
    check(errors.length === 0, `${name}: no console errors` + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  // bigger screens keep the full HUD
  for (const [name, w, hgt, touch] of [['iPhone 14, Home Screen, upright', 390, 844, true], ['computer', 1280, 720, false], ['iPad, on its side', 1024, 768, true]]) {
    const { ctx, page } = await open(w, hgt, { touch });
    await play(page);
    check(!(await simpleOn(page)), `${name}: full HUD`);
    check(await shown(page, '.board-rows'), `${name}: full family board`);
    await ctx.close();
  }

  // Settings > Screen layout
  {
    const { ctx, page } = await open(1280, 720, { touch: false, layout: 'simple' });
    await play(page);
    check(await simpleOn(page), 'Screen layout "Simple" turns it on for a big screen');
    await page.evaluate(() => window.__app.menus.openSettings());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.settings .set-row')].find((r) => r.querySelector('.set-name')?.textContent === 'Screen layout');
      row.querySelector('.seg-b[data-v="full"]').click();
    });
    await page.waitForTimeout(200);
    check(!(await simpleOn(page)), 'switching to "Full" in Settings takes effect at once');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(375, 553, { layout: 'full' });
    await play(page);
    check(!(await simpleOn(page)), 'Screen layout "Full" keeps the full HUD on a small phone');
    await ctx.close();
  }
} catch (e) {
  console.error(e);
  failed++;
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
