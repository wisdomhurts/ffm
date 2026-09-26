// Browser screenshots of the progress UI: HUD quest chip, a badge toast, a quest toast, the Quests and Badges
// tabs, at 390x844 (phone), 667x375 (landscape phone) and 1280x720. Also checks the chip and toasts don't
// overlap other HUD elements and that the panel fits the screen.
// Run: DIST_DIR=<dist> OUT_DIR=<dir> [SIZES=390x844m,667x375m,1280x720] node tests/progress/shots.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { DIST, OUT } from '../harness.mjs';

const sizes = (process.env.SIZES || '390x844m,667x375m,1280x720').split(',');
const DPR = Number(process.env.DPR || 1);
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

// Boxes of the visible HUD elements the chip/toasts must not cover.
const overlaps = (page, sel) => page.evaluate((sel) => {
  const vis = (el) => el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0';
  const box = (el) => el.getBoundingClientRect();
  const mine = [...document.querySelectorAll(sel)].filter(vis);
  const others = ['.hud-btns', '.stats', '.nextgoal', '.tut:not(.gone):not(.hidden):not(.wait)', '.board', '.prompt.show', '.carry.show', '.hotbar', '.meter', '.evchip', '.alert', '.keyhints', '.tb-jump', '.tb-bonk', '.tb-act.show', '.stick-idle']
    .flatMap((s) => [...document.querySelectorAll(s)].filter(vis).map((el) => [s, el]));
  const out = [];
  for (const m of mine) {
    const a = box(m);
    if (a.left < -1 || a.top < -1 || a.right > innerWidth + 1 || a.bottom > innerHeight + 1) out.push(`${sel} off screen ${JSON.stringify([a.left, a.top, a.right, a.bottom].map(Math.round))}`);
    for (const [s, o] of others) {
      if (o.contains(m) || m.contains(o)) continue;
      const b = box(o);
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2) out.push(`${sel} overlaps ${s} (${Math.round(w)}x${Math.round(h)})`);
    }
  }
  return out;
}, sel);

for (const s of sizes) {
  // size suffixes: m = phone (touch), t = first session (tutorial card on screen)
  const mobile = /m/.test(s.replace(/^\d+x\d+/, ''));
  const tut = /t/.test(s.replace(/^\d+x\d+/, ''));
  const [w, h] = s.match(/^(\d+)x(\d+)/).slice(1).map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: DPR, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript((tut) => {
    if (!tut) localStorage.setItem('steal-a-seed:v1:tutorial:done', 'true');
    window.__UI_HOLD_ALERTS__ = true;
  }, tut);
  await page.goto('file://' + path.join(DIST, 'index.html'), { timeout: 300000 });
  await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
  await page.evaluate(() => window.__app.engine.stop());
  const frames = (n) => page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__app.engine.frame(1 / 30);
    const gl = window.__app.engine.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }, n);
  // a returning player: some lifetime progress, a few badges already earned
  await page.evaluate(() => {
    const app = window.__app;
    app.setProfile('maddie');
    const p = app.profile;
    Object.assign(p.counters, { seeds: 140, planted: 118, steals: 37, foils: 12, bonks: 60, monsters: 9, sold: 30, cash: 250000, deepest: 4, hatches: 1, streak: 2, streakBest: 4, streakDay: 0, questsDone: 7, lastSpeed: 5 });
    p.best.netWorth = 420000;
    p.best.showdownWins = 2;
    p.quests = { day: '', list: [] };
    app.progress.checkBadges();
    app.progress.toasts.clear();
  });
  await page.evaluate(() => window.__app.startGame({ charId: 'maddie', mode: 'endless', difficulty: 'normal', fresh: true }));
  await page.evaluate(() => window.__app.engine.stop());
  await page.evaluate(() => {
    const app = window.__app;
    app.cam.introT = 0.999;
    app.progress.toasts.clear();
    // stand at the first seed pod so the Grab prompt shows under everything
    const pod = app.game.pods.find((q) => q.seed && q.biome === 0);
    const me = app.human;
    me.pos.x = pod.x * 0.85;
    me.pos.z = pod.z - 2;
    me.yaw = 0;
    app.cam.snapBehind?.(0);
    // today's quests: some progress on the first one
    const list = app.profile.quests.list;
    list[0].progress = Math.max(1, Math.floor(list[0].target * 0.6));
    if (list[0].progress >= list[0].target) list[0].progress = list[0].target - 1 || 0;
  });
  await frames(tut ? 45 : 8); // the tutorial card appears a second after the camera lands
  await sleep(700);
  await page.evaluate(() => window.__app.progress.tick());
  await frames(6);

  // A: the chip + a badge toast: the 100th steal (a real bus event for the local player) earns Master Thief II
  await page.evaluate(() => {
    const app = window.__app;
    app.profile.counters.steals = 99;
    app.progress.toasts.clear();
    const me = app.human;
    const victim = app.game.players.find((p) => p !== me);
    app.bus.emit('steal:success', { thief: me, victim, plant: { speciesId: 'daisy', mutation: 'normal' }, planter: null, garden: app.game.gardens[me.slot] });
  });
  await frames(4);
  await sleep(900);
  const shotA = path.join(OUT, `pg-${s}-a-hud-badge.png`);
  await page.screenshot({ path: shotA, timeout: 180000 });
  let bad = await overlaps(page, '.pg-chip');
  check(bad.length === 0, `${s}: chip overlaps nothing ${bad.join('; ')}`);
  // in the HUD column a toast may push banners but must clear everything else; lifted to the top overlay (tiny
  // screens) it may briefly cover the top bar, never the prompt, pills or controls
  const lifted = await page.evaluate(() => !!document.querySelector('.pg-toasts.global .pg-toast'));
  bad = (await overlaps(page, '.pg-toast')).filter((x) => !/\.alert\b/.test(x) && (!lifted || !/hud-btns|stats|board|nextgoal|tut|evchip/.test(x)));
  check(bad.length === 0, `${s}: badge toast clear of the HUD${lifted ? ' (lifted to the top)' : ''} ${bad.join('; ')}`);
  const toastA = await page.evaluate(() => document.querySelector('.pg-toast')?.textContent || '');
  check(/Badge earned/i.test(toastA), `${s}: badge toast shows: ${toastA}`);

  // B: finish a quest -> chip turns gold + quest toast
  await page.evaluate(() => {
    const app = window.__app;
    app.progress.toasts.clear();
    const q = app.profile.quests.list[0];
    q.progress = q.target;
    q.done = true;
    app.bus.emit('quest:done', { quest: app.progress.quests()[0], profile: app.profile });
    app.bus.emit('progress:changed', { profile: app.profile });
  });
  await frames(3);
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, `pg-${s}-b-hud-quest.png`), timeout: 180000 });
  bad = await overlaps(page, '.pg-chip');
  check(bad.length === 0, `${s}: gold chip overlaps nothing ${bad.join('; ')}`);
  const chipB = await page.evaluate(() => document.querySelector('.pg-chip')?.className || '');
  check(/claim/.test(chipB), `${s}: chip in claim state (${chipB})`);

  // C: the Quests tab (one claimed, one claimable, one in progress)
  await page.evaluate(() => {
    const app = window.__app;
    app.progress.toasts.clear();
    const list = app.profile.quests.list;
    app.progress.claim(0);
    app.progress.toasts.clear();
    list[1].progress = list[1].target;
    list[2].progress = Math.floor(list[2].target * 0.4);
    document.querySelector('.pg-chip-main').click();
  });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, `pg-${s}-c-quests.png`), timeout: 180000 });
  const fit = await page.evaluate(() => {
    const p = document.querySelector('.modal-panel.pg-modal');
    const r = p.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, sw: p.scrollWidth, cw: p.clientWidth, cards: document.querySelectorAll('.pg-q').length, claim: !!document.querySelector('.pg-q .btn-green') };
  });
  check(fit.l >= 0 && fit.t >= 0 && fit.r <= w + 0.5 && fit.b <= h + 0.5, `${s}: panel fits the screen ${JSON.stringify(fit)}`);
  check(fit.sw <= fit.cw + 1, `${s}: no sideways scrolling in the panel`);
  check(fit.cards === 3 && fit.claim, `${s}: three quest cards with a Claim button`);

  // D: the Badges tab
  await page.evaluate(() => document.querySelector('.pg-tabs [data-tab=badges]').click());
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, `pg-${s}-d-badges.png`), timeout: 180000 });
  const nb = await page.evaluate(() => ({ cards: document.querySelectorAll('.pg-b').length, earned: document.querySelectorAll('.pg-b.earned').length, sw: document.querySelector('.modal-panel.pg-modal').scrollWidth, cw: document.querySelector('.modal-panel.pg-modal').clientWidth }));
  check(nb.cards >= 30 && nb.earned >= 3, `${s}: badge grid ${nb.cards} cards, ${nb.earned} earned`);
  check(nb.sw <= nb.cw + 1, `${s}: badge grid fits the width`);
  // E: claim from the panel, then close it: input comes back
  await page.evaluate(() => document.querySelector('.pg-tabs [data-tab=quests]').click());
  await sleep(300);
  const claimed = await page.evaluate(() => {
    const app = window.__app;
    const s0 = app.profile.stars;
    document.querySelector('.pg-q .btn-green')?.click();
    return app.profile.stars - s0;
  });
  check(claimed > 0, `${s}: Claim button pays stars (+${claimed})`);
  const after = await page.evaluate(() => {
    const app = window.__app;
    const wasOff = app.input.enabled === false;
    app.menus.closeAllModals(false);
    return { wasOff, on: app.input.enabled, state: app.state };
  });
  check(after.wasOff && after.on && after.state === 'playing', `${s}: input paused while open and back after closing ${JSON.stringify(after)}`);
  // F: back in the game after claiming: the chip tracks the last quest (desktop: collapsed to its icon)
  await page.evaluate(() => {
    const app = window.__app;
    app.progress.toasts.clear();
    app.bus.emit('progress:changed', { profile: app.profile });
  });
  await frames(2);
  await sleep(500);
  const collapse = !mobile;
  if (collapse) await page.evaluate(() => document.querySelector('.pg-chip-tg').click());
  await frames(2);
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, `pg-${s}-e-hud-after.png`), timeout: 180000 });
  const chipF = await page.evaluate(() => ({ cls: document.querySelector('.pg-chip').className, text: document.querySelector('.pg-chip').textContent }));
  check(/active|alldone|badge/.test(chipF.cls) && (!collapse || /collapsed/.test(chipF.cls)), `${s}: chip after claiming ${JSON.stringify(chipF)}`);
  if (collapse) await page.evaluate(() => document.querySelector('.pg-chip-tg').click());
  check(errors.length === 0, `${s}: no console errors ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
