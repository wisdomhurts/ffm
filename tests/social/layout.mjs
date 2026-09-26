// Layout check for the social HUD on real screen sizes (headless Chromium):
// 1) a friend stands next to you while you carry a seed, with the tutorial card, the "Got a seed" banner,
//    the "First Seed" badge toast and chat lines all up: the Trade / Gift chip may never overlap any of them
//    (the tutorial card steps aside, banners squeeze, or the chip waits);
// 2) the emote wheel opened on top of the proximity prompt / carry pill: its hint line must not sit on them.
//   DIST_DIR=<build> OUT_DIR=<dir> node tests/social/layout.mjs [portrait|small|landscape|desktop ...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');
const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, 'tests', 'output');
fs.mkdirSync(OUT, { recursive: true });

const SIZES = {
  portrait: { width: 390, height: 844, touch: true },
  small: { width: 375, height: 667, touch: true },
  landscape: { width: 667, height: 375, touch: true },
  desktop: { width: 1280, height: 720, touch: false },
};
const which = process.argv.slice(2).filter((a) => SIZES[a]);
const runs = which.length ? which : Object.keys(SIZES);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const check = (ok, msg) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) failed++;
};

// everything the chip must stay clear of (visible boxes only)
const OTHERS = '.tut, .board, .carry.show, .prompt.show, .hud-top .alert:not(.out), .pg-toast:not(.out), .chat > .cl, .hud-btns, .stats, .hotbar';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
for (const name of runs) {
  const S = SIZES[name];
  const ctx = await browser.newContext(S.touch
    ? { viewport: { width: S.width, height: S.height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
    : { viewport: { width: S.width, height: S.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const E = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 1) => E((n) => {
    for (let i = 0; i < n; i++) window.__app.engine.frame(1 / 30);
  }, n);
  // with the engine stopped the page only paints (and runs CSS animations) when asked: let pop-ins finish
  const settle = async () => {
    await frames(1);
    await page.screenshot({ path: path.join(OUT, '.settle.png') });
    await sleep(450);
    await frames(1);
  };
  const shot = async (n) => {
    await settle();
    await page.screenshot({ path: path.join(OUT, `social-layout-${name}-${n}.png`), timeout: 180000 });
  };
  const overlaps = () => E((OTHERS) => {
    const vis = (e) => {
      const cs = getComputedStyle(e);
      return e.getClientRects().length && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && cs.display !== 'none';
    };
    const chip = [...document.querySelectorAll('.soc-chip, .soc-invite')].filter(vis);
    const out = [];
    for (const c of chip) {
      const a = c.getBoundingClientRect();
      for (const o of document.querySelectorAll(OTHERS)) {
        if (!vis(o) || o.closest('.soc-dock')) continue;
        const b = o.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) out.push(`${String(o.className).split(' ').slice(0, 2).join('.')} ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    return { chips: chip.length, out, hud: document.querySelector('.hud').className };
  }, OTHERS);

  try {
    await page.goto('file://' + path.join(DIST, 'index.html'), { timeout: 300000 });
    await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
    await E(() => window.__app.engine.stop());
    await E(() => window.__app.startGame({ charId: 'dorian', mode: 'endless', difficulty: 'normal', fresh: true }));
    await E(() => {
      const a = window.__app;
      const g = a.game;
      a.cam.introT = 1;
      window.__UI_HOLD_ALERTS__ = true;
      const friend = g.setSlot(1, { kind: 'remote', pid: 'sam1', profile: { id: 'p_sam', name: 'Samantha Lee', base: 'esther', look: {}, pets: { owned: [], equipped: null } } });
      friend.controller = null;
      const pod = g.pods.find((q) => q.seed && q.biome === 0);
      const h = a.human;
      Object.assign(h.pos, { x: pod.x * 0.85, y: 0, z: pod.z - 2 });
      h.vel.x = h.vel.z = 0;
      Object.assign(friend.pos, { x: h.pos.x + 2, y: 0, z: h.pos.z + 1 });
      h.invulnUntil = friend.invulnUntil = 1e9;
    });
    await frames(6);
    await settle();

    // ---- 1: chip + prompt
    let o = await overlaps();
    check(o.chips === 1 && !o.out.length, `${name}: chip beside the prompt pill clear of everything ${JSON.stringify(o.out)}`);
    await shot('01-prompt');
    // grab the seed: carry pill, "Got a seed" banner, "First Seed" badge toast, tutorial step 2
    await page.keyboard.down('KeyE');
    await frames(14);
    await page.keyboard.up('KeyE');
    await E(() => {
      const a = window.__app;
      const f = a.game.players[1];
      Object.assign(f.pos, { x: a.human.pos.x + 2, z: a.human.pos.z + 1 });
    });
    await frames(6);
    check(await E(() => !!window.__app.human.carrying), `${name}: carrying a seed`);
    for (let i = 0; i < 3; i++) {
      await frames(3); // the HUD re-checks its layout a few times a second
      await settle();
      o = await overlaps();
      check(!o.out.length, `${name}: carry + banners: chip overlaps nothing ${JSON.stringify(o.out)} (${o.hud})`);
      if (i === 0) await shot('02-carry-busy');
      await sleep(900);
    }
    // chat lines (they live 9 s of real time and software-rendered frames are slow: say them, then shoot fast)
    await E(() => {
      const a = window.__app;
      a.bus.emit('chat', { player: a.game.players[1], text: 'Trade?', quick: true, phrase: 'trade' });
      a.bus.emit('chat', { player: a.game.players[2], text: 'Race you!', quick: true, phrase: 'race' });
    });
    await frames(1);
    await page.screenshot({ path: path.join(OUT, '.settle.png') });
    await sleep(350);
    const chat = await E(() => {
      const c = document.querySelector('.chat');
      const d = document.querySelector('.soc-dock');
      if (!c || getComputedStyle(c).display === 'none' || !d) return { shown: false };
      // the log's own box (lines stack up from its bottom edge) and each line against the dock
      const b = d.getBoundingClientRect();
      const boxes = [c.getBoundingClientRect(), ...[...c.querySelectorAll('.cl')].map((l) => l.getBoundingClientRect())];
      const hit = boxes.some((r) => r.width > 0 && r.left < b.right - 2 && r.right > b.left + 2 && r.top < b.bottom - 2 && r.bottom > b.top + 2);
      return { shown: true, lines: boxes.length - 1, chatBottom: Math.round(boxes[0].bottom), dock: [b.left, b.top, b.right, b.bottom].map(Math.round), hit };
    });
    if (chat.shown) check(chat.lines >= 2 && !chat.hit, `${name}: chat log clear of the Trade / Gift chip ${JSON.stringify(chat)}`);
    else console.log(`  ${name}: no chat log at this size`);
    await page.screenshot({ path: path.join(OUT, `social-layout-${name}-02b-chat.png`), timeout: 180000 });
    // a trade invite never waits: the tutorial card and the banners make room for it instead
    await E(() => {
      const a = window.__app;
      // (alerts are held on screen for this test, so drop the seed's big centre reveal card first)
      document.querySelectorAll('.center-moment > *').forEach((m) => m.remove());
      a.trades.handle(a.game.players[1], 'tradeRequest', [0]);
    });
    await frames(6);
    await settle();
    o = await overlaps();
    const inv = await E(() => {
      const e = document.querySelector('.soc-invite');
      return !!e && getComputedStyle(e).visibility !== 'hidden' && !document.querySelector('.hud').classList.contains('hush-social');
    });
    check(inv && !o.out.length, `${name}: trade invite shows and overlaps nothing ${JSON.stringify(o.out)} (${o.hud})`);
    await shot('02c-invite');
    await E(() => {
      const a = window.__app;
      a.trades.handle(a.human, 'tradeDecline', [1]);
    });
    await frames(3);

    // later: banners gone, only the tutorial card and the chip
    await E(() => {
      window.__UI_HOLD_ALERTS__ = false;
      document.querySelectorAll('.hud-top .alert').forEach((a) => a.remove());
    });
    await sleep(3500);
    await frames(8);
    await settle();
    o = await overlaps();
    check(o.chips === 1 && !o.out.length, `${name}: later, chip back and clear ${JSON.stringify(o.out)} (${o.hud})`);
    await shot('03-carry-later');

    // ---- 2: the wheel over the carry pill
    if (S.touch) {
      const b = await page.locator('.soc-emobtn').boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    } else await page.keyboard.press('KeyG');
    await frames(2);
    await settle();
    const w = await E(() => {
      const box = (s) => {
        const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom];
      };
      const hint = box('.sw-hint');
      const pills = ['.prompt.show', '.carry.show', '.soc-chip'].map(box).filter(Boolean);
      const hit = hint && pills.some((p) => hint[0] < p[2] && hint[2] > p[0] && hint[1] < p[3] && hint[3] > p[1]);
      return { open: !!document.querySelector('.sw-layer:not(.out)'), hint: !!hint, visiblePills: pills.length, hit };
    });
    check(w.open && !w.hit && w.visiblePills === 0, `${name}: wheel open, bottom pills step aside ${JSON.stringify(w)}`);
    await shot('04-wheel');
    await page.keyboard.press('Escape');
    await frames(2);
    check(await E(() => document.querySelector('.carry.show') && getComputedStyle(document.querySelector('.carry.show')).visibility === 'visible'), `${name}: carry pill back after the wheel closes`);
  } catch (e) {
    console.error(e);
    failed++;
  }
  check(errors.length === 0, `${name}: no console errors` + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await ctx.close();
}
fs.rmSync(path.join(OUT, '.settle.png'), { force: true });
await browser.close();
process.exit(failed ? 1 : 0);
