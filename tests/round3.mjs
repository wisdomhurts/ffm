// Browser checks for the bases / pets / speed round: Speed Shop stations and panel, Boost, the Warm-Up
// treadmill, My Base (upgrade + Base Studio), pet teams, egg drops and Egg Rain, and the touch layout.
// Run: DIST_DIR=<build> OUT_DIR=<dir> node tests/round3.mjs
import { launch, openGame, startMatch, manualFrames, stepFrames, shot, sleep } from './harness.mjs';

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

const { browser, page, errors } = await launch({ width: 1280, height: 720 });
try {
  await openGame(page, 'index.html');
  await startMatch(page, 'dorian', 'endless', 'normal');
  await manualFrames(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // test-only: drive the local player with a fixed intent for a while (null = back to the keyboard)
  await ev(() => {
    const a = window.__app;
    a.__drive = (intent) => {
      const h = a.game.human;
      if (!a.__humanCtrl) a.__humanCtrl = h.controller;
      h.controller = intent ? { getIntent: () => ({ moveX: 0, moveZ: 0, jump: false, interact: false, bonk: false, useItem: null, selectSlot: null, aimYaw: null, emote: null, say: null, boost: false, ...intent }) } : a.__humanCtrl;
    };
    a.__put = (x, z, y = 0) => {
      const h = a.game.human;
      Object.assign(h.pos, { x, y, z });
      h.vel.x = h.vel.y = h.vel.z = 0;
      h.onGround = true;
    };
  });

  // ---------------------------------------------------------------- Speed Shop stations
  await ev(() => {
    const a = window.__app;
    const st = a.game.layout.speedStations.find((s) => s.id === 'speed');
    a.game.human.cash = 1e6;
    a.__put(st.x, st.z, 0.55);
  });
  await stepFrames(page, 4);
  const prompt = await ev(() => window.__app.game.human.interact?.key);
  check(prompt === 'shop:speed', `standing on the Speed treadmill offers Speed (${prompt})`);
  const lv0 = await ev(() => window.__app.game.human.speedLevel);
  await ev(() => window.__app.act('buySpeed', 10));
  const lv1 = await ev(() => window.__app.game.human.speedLevel);
  check(lv1 === lv0 + 10, `x10 bought ten levels (${lv0} -> ${lv1})`);
  await ev(() => window.__app.menus.openShop('speed'));
  await stepFrames(page, 3);
  const panel = await ev(() => ({ boost: !!document.querySelector('.sx-boost .sx-btn'), tread: !!document.querySelector('.sx-tread .sx-btn'), bulk: document.querySelectorAll('.sp-bulk').length }));
  check(panel.boost && panel.tread && panel.bulk === 2, 'Speed Shop panel: x10 / MAX, Boost Lab and Treadmill cards');
  await shot(page, 'r3-speedshop');
  await ev(() => document.querySelector('.sx-boost .sx-btn')?.click());
  check((await ev(() => window.__app.game.human.boostLevel)) === 1, 'Boost Lab button buys Boost Lv 1');
  await ev(() => window.__app.menus.closeShop());
  await stepFrames(page, 2);

  // ---------------------------------------------------------------- Boost (Shift)
  await ev(() => window.__app.__put(0, 0));
  await page.keyboard.down('ShiftLeft');
  await stepFrames(page, 2);
  await page.keyboard.up('ShiftLeft');
  const boosting = await ev(() => window.__app.game.time < window.__app.game.human.boostUntil);
  check(boosting, 'Shift starts a Boost');
  await shot(page, 'r3-boost-hud');
  const speedo = await ev(() => !!document.querySelector('.speedo') && getComputedStyle(document.querySelector('.speedo')).display !== 'none');
  check(speedo, 'the speedometer shows on desktop');

  // ---------------------------------------------------------------- Warm-Up treadmill
  await ev(() => {
    const a = window.__app;
    const st = a.game.layout.speedStations.find((s) => s.id === 'warmup');
    a.__put(st.x, st.z, 0.55);
    a.__drive({ moveZ: -0.62 });
  });
  await stepFrames(page, 30 * 7);
  const pumped = await ev(() => {
    const a = window.__app;
    a.__drive(null);
    return a.game.time < a.game.human.pumpUntil;
  });
  check(pumped, 'running on the Warm-Up treadmill gets you Pumped');

  // ---------------------------------------------------------------- My Base: upgrade + studio
  await ev(() => {
    const a = window.__app;
    const g = a.game.gardens[a.game.human.slot];
    a.game.human.cash = 1e13;
    a.__put(g.L.console.x - g.L.inward * -1.5, g.L.console.z - 2);
  });
  await stepFrames(page, 3);
  const basePrompt = await ev(() => window.__app.game.human.interact?.key);
  check(basePrompt === 'base', `the BASE console prompt (${basePrompt})`);
  await ev(() => window.__app.menus.openShop('base'));
  await stepFrames(page, 2);
  for (let i = 0; i < 7; i++) {
    await ev(() => document.querySelector('.bs-up')?.click());
    await stepFrames(page, 1);
  }
  const lvl = await ev(() => window.__app.game.human.baseLevel);
  check(lvl === 8, `Upgrade button levels the base (Lv ${lvl})`);
  // pick a floor, a fence and a trampoline in spot 1
  await ev(() => {
    const pick = (tab, name) => {
      document.querySelector(`.bs-tab[data-tab="${tab}"]`)?.click();
      [...document.querySelectorAll('.bs-opt')].find((b) => b.textContent.includes(name))?.click();
    };
    pick('floor', 'Candy Swirl');
    pick('fence', 'Candy Cane');
    pick('laser', 'Rainbow');
    document.querySelector('.bs-tab[data-tab="decor"]')?.click();
    document.querySelectorAll('.bs-spot')[0]?.click();
    [...document.querySelectorAll('.bs-opt')].find((b) => b.textContent.includes('Trampoline'))?.click();
    document.querySelectorAll('.bs-spot')[1]?.click();
    [...document.querySelectorAll('.bs-opt')].find((b) => b.textContent.includes('Fountain'))?.click();
  });
  await stepFrames(page, 3);
  const look = await ev(() => window.__app.game.gardens[window.__app.game.human.slot].look);
  check(look.floor === 'candy' && look.fence === 'candy' && look.laser === 'rainbow', `Base Studio picks show (${look.floor}/${look.fence}/${look.laser})`);
  check(look.decor[0] === 'trampoline' && look.decor[1] === 'fountain', `decorations placed (${look.decor.join(',')})`);
  await shot(page, 'r3-base-panel');
  await ev(() => window.__app.menus.closeShop());
  // look at the garden from above the gate
  await ev(() => {
    const a = window.__app;
    const g = a.game.gardens[a.game.human.slot];
    a.__put(g.L.inside.x, g.L.inside.z);
    a.game.human.yaw = g.L.west ? -Math.PI / 2 : Math.PI / 2;
  });
  await stepFrames(page, 20);
  await shot(page, 'r3-base-garden');
  // trampoline: step on it and fly
  await ev(() => {
    const a = window.__app;
    const s = a.game.gardens[a.game.human.slot].L.decor[0];
    a.__put(s.x, s.z);
  });
  await stepFrames(page, 3);
  const up = await ev(() => window.__app.game.human.pos.y);
  check(up > 1, `the trampoline launches you (y ${up.toFixed(1)})`);

  // ---------------------------------------------------------------- pet team (3 slots at Base Lv 8)
  await ev(() => window.__app.act('setPets', ['dragon', 'phoenix', 'unicorn']));
  await ev(() => window.__app.__put(0, 10));
  await stepFrames(page, 20);
  const team = await ev(() => (window.__app.view.petViews[window.__app.game.human.slot] || []).filter(Boolean).map((r) => r.id));
  check(team.length === 3, `three pets follow you (${team.join(', ')})`);
  await shot(page, 'r3-pet-team');

  // ---------------------------------------------------------------- egg drops
  const before = await ev(() => window.__app.profile?.pets?.owned?.length || 0);
  await ev(() => {
    const a = window.__app;
    const h = a.game.human;
    a.__drop = a.game.spawnDrop({ egg: 'rainbow', x: h.pos.x + 6, z: h.pos.z + 6 });
  });
  await stepFrames(page, 30 * 4);
  await shot(page, 'r3-drop-falling');
  await ev(() => {
    const a = window.__app;
    const d = a.__drop;
    while (a.game.time < d.landAt + 0.2) a.game.update(1 / 30);
    a.__put(d.x, d.z);
  });
  await stepFrames(page, 10);
  const after = await ev(() => window.__app.profile?.pets?.owned?.length || 0);
  check(after === before + 1, `touching a landed drop hatches it (pets ${before} -> ${after})`);
  await stepFrames(page, 30);
  await shot(page, 'r3-drop-hatch');
  await ev(() => document.querySelector('.ph-skip, .hatch-skip, [data-hatch-close]')?.click());
  await ev(() => window.__app.game.startEvent('eggrain'));
  await ev(() => {
    const g = window.__app.game;
    for (let t = 0; t < 30; t += 1 / 30) g.update(1 / 30);
  });
  await ev(() => window.__app.__put(0, 30));
  await stepFrames(page, 30);
  const drops = await ev(() => window.__app.game.drops.length);
  check(drops >= 4, `Egg Rain drops eggs (${drops})`);
  await shot(page, 'r3-eggrain');
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- touch layout: Boost + gear by the thumb buttons
{
  const { browser: b2, page: p2, errors: e2 } = await launch({ mobile: true });
  try {
    await openGame(p2, 'index.html');
    await startMatch(p2, 'esther', 'endless', 'normal');
    await manualFrames(p2);
    await p2.evaluate(() => {
      document.documentElement.classList.add('is-touch');
      window.__app.touch?.setVisible(true);
    });
    await stepFrames(p2, 5);
    const rects = await p2.evaluate(() => {
      const r = (sel) => {
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) return null;
        const b = el.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom };
      };
      return { boost: r('.tb-boost'), gear: r('.tb-gear'), jump: r('.tb-jump'), bonk: r('.tb-bonk'), hotbar: r('.hotbar'), emote: r('.hud > .hud-slot-emote') };
    });
    const hit = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    check(!!rects.boost && !!rects.gear, 'touch: Boost button and gear chip are shown');
    check(!hit(rects.boost, rects.jump) && !hit(rects.boost, rects.bonk) && !hit(rects.boost, rects.hotbar) && !hit(rects.gear, rects.hotbar), `touch: they don't cover Jump / Bonk / the hotbar ${JSON.stringify(rects)}`);
    await shot(p2, 'r3-touch');
    check(e2.length === 0, `touch: no console errors${e2.length ? ': ' + e2.slice(0, 3).join(' | ') : ''}`);
  } finally {
    await b2.close();
  }
}

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
