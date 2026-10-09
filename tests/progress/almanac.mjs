// Browser check of the Family Four card, its 4/4 celebration and the Seed Almanac tab: screenshots at 1280x720
// (card at 2/4, the celebration, the Almanac tab, "Wear it!" -> the crown in the Wardrobe) and a 360px phone
// (Almanac tab, card). Also checks the panel never scrolls sideways and the page tabs scroll on phones.
// Run: DIST_DIR=<dist> OUT_DIR=<dir> node tests/progress/almanac.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { DIST, OUT } from '../harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open(w, h, mobile) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem('steal-a-seed:v1:profile:maddie', JSON.stringify({ id: 'maddie', tutorial: { state: 'done', step: 0 } }));
    window.__UI_HOLD_ALERTS__ = true;
  });
  await page.goto('file://' + path.join(DIST, 'index.html'), { timeout: 300000 });
  await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
  await page.evaluate(() => window.__app.startGame({ charId: 'maddie', mode: 'endless', difficulty: 'normal', fresh: true }));
  await page.evaluate(() => window.__app.engine.stop());
  const frames = (n) => page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__app.engine.frame(1 / 30);
    const gl = window.__app.engine.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }, n);
  await frames(2);
  return { ctx, page, errors, frames };
}

const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000, ...opts });
const noSideScroll = (page) => page.evaluate(() => {
  const m = document.querySelector('.pg-modal');
  return m ? m.scrollWidth <= m.clientWidth + 1 : false;
});

// ------------------------------------------------------------------ desktop
{
  const { ctx, page, errors, frames } = await open(1280, 720, false);
  // two of the four, plus a few stickers on the first pages (one plant Mastered)
  const view = await page.evaluate(() => {
    const tr = window.__app.progress;
    tr.stamp('maddiemarigold', 'normal');
    tr.stamp('estherlotus', 'gold');
    for (const f of ['normal', 'gold', 'diamond', 'rainbow']) tr.stamp('daisy', f);
    tr.stamp('tulip', 'gold');
    tr.stamp('sunflower', 'normal', 'giant');
    return tr.collections()[0];
  });
  check(view.count === 2 && !view.done, 'Family Four at 2/4');
  await sleep(400);
  const toast = await page.evaluate(() => [...document.querySelectorAll('.pg-toast')].map((t) => t.getAttribute('aria-label')).join(' | '));
  check(/Family Four 1\/4|Seed Almanac|Mastered/.test(toast), 'a toast is up: ' + toast);
  await page.evaluate(() => window.__app.progress.toasts.clear());
  await page.evaluate(() => document.querySelector('.pg-chip-main').click());
  await page.waitForSelector('.pg-modal');
  await page.evaluate(() => document.querySelector('.pg-tabs [data-tab=badges]').click());
  await sleep(300);
  const card = await page.evaluate(() => {
    const c = document.querySelector('.pg-col[data-col=familyfour]');
    return c && { n: c.querySelector('.pg-col-n4').textContent, has: c.querySelectorAll('.pg-col-slot.has').length, q: c.querySelectorAll('.pg-col-slot:not(.has) .pg-col-pl b').length, faces: c.querySelectorAll('.ava').length };
  });
  check(card && card.n === '2/4' && card.has === 2 && card.q === 2 && card.faces === 4, 'Family Four card: 2/4, two "?" silhouettes, four faces ' + JSON.stringify(card));
  await shot(page, 'ff-card-2of4', { clip: await page.evaluate(() => {
    const r = document.querySelector('.pg-modal').getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 720 - r.top) };
  }) });
  // the Almanac tab
  await page.evaluate(() => document.querySelector('.pg-tabs [data-tab=almanac]').click());
  await sleep(400);
  const alm = await page.evaluate(() => ({
    tabs: document.querySelectorAll('.pg-alm-tab').length,
    on: document.querySelector('.pg-alm-tab.on')?.dataset.page,
    cards: document.querySelectorAll('.pg-pl').length,
    mastered: document.querySelectorAll('.pg-pl.mastered').length,
    off: document.querySelectorAll('.pg-stk.off').length,
    sizes: document.querySelector('.pg-pl-sz')?.textContent || '',
  }));
  check(alm.tabs === 13 && alm.on === 'field' && alm.cards === 4 && alm.mastered === 1 && alm.off === 16 - 6 && /Giant/.test(alm.sizes), 'Almanac: 13 pages, Sunny Field open, Daisy Doo mastered, silhouettes, giant stamp ' + JSON.stringify(alm));
  check(await noSideScroll(page), 'panel has no sideways scroll (desktop)');
  await shot(page, 'alm-desktop');
  // another page renders on demand
  await page.evaluate(() => document.querySelector('.pg-alm-tab[data-page=secret]').click());
  await sleep(300);
  const sec = await page.evaluate(() => ({ cards: document.querySelectorAll('.pg-pl').length, col: !!document.querySelector('.pg-alm-page .pg-col') }));
  check(sec.cards === 4 && sec.col, 'Secret page: four plants and the Family Four card');
  await page.evaluate(() => window.__app.menus.closeAllModals?.(false) || document.querySelector('.modal-x')?.click());
  await sleep(300);

  // 4/4: the celebration (waits for a calm moment; the player is home and empty-handed here)
  await page.evaluate(() => {
    const tr = window.__app.progress;
    tr.stamp('dorianfruit', 'normal');
    tr.stamp('micahmelon', 'rainbow');
  });
  await page.waitForSelector('.pg-cel', { timeout: 5000 });
  await sleep(3200);
  const cel = await page.evaluate(() => {
    const el = document.querySelector('.pg-cel');
    return {
      reveal: el.classList.contains('pgc-reveal'), card: el.classList.contains('pgc-done'),
      slots: el.querySelectorAll('.pgc-slot').length, faces: el.querySelectorAll('.pgc-slot .ava').length,
      chips: el.querySelector('.pgc-chips').textContent, wear: !!el.querySelector('.pgc-wear'),
      paused: window.__app.game.paused, input: window.__app.input.enabled,
    };
  });
  check(cel.reveal && cel.card && cel.slots === 4 && cel.faces === 4 && cel.wear && /200/.test(cel.chips) && /Family Crown/.test(cel.chips), 'celebration: ring of four, crown, rewards, Wear it! ' + JSON.stringify(cel));
  check(cel.paused === true && cel.input === false, 'the solo game waits and the player stands still while it is up');
  const prof = await page.evaluate(() => ({ badge: !!window.__app.profile.badges.familyfour, stars: window.__app.profile.stars }));
  check(prof.badge, 'familyfour badge earned');
  await shot(page, 'ff-celebration');
  // Wear it! -> the crown goes on and the Wardrobe opens on Hats
  await page.evaluate(() => document.querySelector('.pgc-wear').click());
  await page.waitForSelector('.modal-panel.wardrobe', { timeout: 10000 });
  await sleep(2500);
  const ward = await page.evaluate(() => ({
    hat: window.__app.profile.look.hat, human: window.__app.game.human.look.hat, tab: document.querySelector('.wardrobe [aria-selected=true]')?.textContent || '',
    crownTile: !![...document.querySelectorAll('.wd-tile')].find((t) => /Family Crown/.test(t.getAttribute('aria-label')) && !t.classList.contains('locked')),
    state: window.__app.state, paused: window.__app.game.paused,
  }));
  check(ward.hat === 'familycrown' && ward.human === 'familycrown' && ward.crownTile && /Hats/.test(ward.tab), 'Wear it!: crown on, Wardrobe on Hats, crown tile unlocked ' + JSON.stringify(ward));
  check(ward.state === 'paused', 'the game is paused under the Wardrobe');
  await shot(page, 'ff-wardrobe-crown');
  check(!errors.length, 'no page errors (desktop): ' + errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone, 360 px
{
  const { ctx, page, errors } = await open(360, 740, true);
  await page.evaluate(() => {
    const tr = window.__app.progress;
    tr.stamp('micahmelon', 'normal');
    tr.stamp('dorianfruit', 'diamond');
    for (const f of ['normal', 'gold']) tr.stamp('mushroom', f);
    tr.stamp('fern', 'rainbow');
    tr.toasts.clear();
  });
  await page.evaluate(() => document.querySelector('.pg-chip-main').click());
  await page.waitForSelector('.pg-modal');
  await page.evaluate(() => document.querySelector('.pg-tabs [data-tab=almanac]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.pg-alm-tab[data-page=greenhollow]').click());
  await sleep(300);
  const ph = await page.evaluate(() => {
    const s = document.querySelector('.pg-alm-tabs');
    const tabs = document.querySelector('.pg-tabs').getBoundingClientRect();
    const panel = document.querySelector('.pg-modal').getBoundingClientRect();
    return { scrolls: s.scrollWidth > s.clientWidth, tabsFit: tabs.right <= panel.right + 1, cards: document.querySelectorAll('.pg-pl').length };
  });
  check(ph.scrolls && ph.tabsFit && ph.cards === 4, 'phone: page tabs scroll sideways, the three panel tabs fit ' + JSON.stringify(ph));
  check(await noSideScroll(page), 'panel has no sideways scroll (360 px)');
  await shot(page, 'alm-phone');
  await page.evaluate(() => document.querySelector('.pg-tabs [data-tab=badges]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.pg-col').scrollIntoView({ block: 'start' }));
  check(await noSideScroll(page), 'Badges tab has no sideways scroll (360 px)');
  await shot(page, 'ff-card-phone');
  // the celebration fits a small phone
  await page.evaluate(() => document.querySelector('.modal-x')?.click());
  await sleep(300);
  await page.evaluate(() => {
    const tr = window.__app.progress;
    tr.stamp('estherlotus', 'normal');
    tr.stamp('maddiemarigold', 'normal');
  });
  await page.waitForSelector('.pg-cel', { timeout: 5000 });
  await sleep(3200);
  const fit = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const card = r('.pgc-card');
    const ring = r('.pgc-center');
    return { card: card.top >= 0 && card.bottom <= innerHeight && card.left >= 0 && card.right <= innerWidth, apart: ring.bottom <= card.top + 1, top: Math.round(card.top), bottom: Math.round(card.bottom) };
  });
  check(fit.card && fit.apart, 'phone celebration: the card fits and sits under the ring ' + JSON.stringify(fit));
  await shot(page, 'ff-celebration-phone');
  await page.evaluate(() => document.querySelector('.pgc-ok').click());
  await sleep(500);
  check(await page.evaluate(() => !document.querySelector('.pg-cel') && window.__app.input.enabled && !window.__app.game.paused), 'Awesome! closes it and the game goes on');
  check(!errors.length, 'no page errors (phone): ' + errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
