// The guided tutorial in a real browser (src/ui/tutorial.js):
//   computer: a new player presses Start -> "Want a quick tutorial?" -> Y (yes) -> the first two steps tick off
//             with real play (walk out of the gate, grab a seed) -> Skip; then Settings > Play tutorial runs all
//             eight steps for real and ends in the celebration
//   phone (375x667, touch, Simple HUD): Start -> No thanks (never asked again, the Next goal chip shows) ->
//             "Play the tutorial" on the mode screen -> touch glyphs, nothing over the thumb controls -> the finish
// Screenshots: tut-*.png in OUT_DIR. Frames are stepped by hand once the game runs (slow machines are fine).
//   DIST_DIR=<build> OUT_DIR=<dir> node tests/tutorial.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { DIST, OUT, shot, sleep } from './harness.mjs';

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function open({ phone = false } = {}) {
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE }
    : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.join(DIST, 'index.html'), { timeout: 300000 });
  await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
  return { ctx, page, errors };
}

const frames = (page, n, dt = 1 / 30) => page.evaluate(([n, dt]) => {
  for (let i = 0; i < n; i++) window.__app.engine.frame(dt);
  const gl = window.__app.engine.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}, [n, dt]);
const tutState = (page) => page.evaluate(() => ({ ...window.__app.profile.tutorial }));
const card = (page) => page.evaluate(() => {
  const el = document.querySelector('.hud .tut');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    on: !/\b(gone|hidden|wait)\b/.test(el.className) && r.width > 0, cls: el.className,
    title: el.querySelector('.tut-copy b')?.textContent || '', text: el.querySelector('.tut-text')?.innerHTML || '',
    count: el.querySelector('.tut-count')?.textContent || '', box: [r.left, r.top, r.right, r.bottom],
  };
});
const beacon = (page) => page.evaluate(() => {
  const g = window.__app.engine.scene.getObjectByName('tutorial-guide');
  return g ? { on: g.visible, x: g.children[0].position.x, z: g.children[0].position.z } : null;
});
const visible = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => {
  const r = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
}), sel);

// PLAY -> Start on the mode screen (the way a player gets into their first game)
async function pressStart(page, tap) {
  const go = (sel) => (tap ? page.tap(sel) : page.click(sel));
  await go('.btn-play');
  await page.waitForSelector('.start-row .btn-green', { timeout: 30000 });
  await sleep(400);
  await go('.start-row .btn-green');
}

// let the offer modal finish fading in (CSS animations crawl while software WebGL renders the title)
const offerIn = (page) => page.waitForFunction(() => {
  const m = document.querySelector('.modal:has(.tut-offer)');
  return !!m && [m, m.querySelector('.modal-panel')].every((e) => getComputedStyle(e).opacity === '1');
}, null, { timeout: 20000 }).catch(() => {});

// the game is running: stop the clock, skip the intro camera and let the tutorial card slide in
async function land(page) {
  await page.waitForFunction(() => window.__app.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__app.engine.stop();
    window.__app.cam.introT = 1;
  });
  for (let i = 0; i < 6; i++) {
    await frames(page, 4, 0.1);
    const c = await card(page);
    if (c?.on) break;
  }
}

// Plays the tutorial's current step for real (teleports stand in for the walking), until it ticks off.
async function playStep(page, { touch = false } = {}) {
  const id = await page.evaluate(() => ['move', 'grab', 'plant', 'grow', 'collect', 'speed', 'lock', 'steal'][window.__app.profile.tutorial.step]);
  const holdOn = async (on) => {
    if (touch) await page.evaluate((on) => (window.__app.input.virtual.interact = on), on);
    else if (on) await page.keyboard.down('KeyE');
    else await page.keyboard.up('KeyE');
  };
  const setup = () => page.evaluate((id) => {
    const a = window.__app, g = a.game, me = a.human, L = g.layout.gardens[me.slot];
    const put = (x, z) => {
      me.pos.x = x;
      me.pos.z = z;
      me.pos.y = 0;
      me.vel.x = me.vel.y = me.vel.z = 0;
    };
    me.invulnUntil = 1e9; // no bonks while we test
    if (id === 'move') put(L.outside.x, L.outside.z);
    if (id === 'grab') {
      const pod = g.pods.find((q) => q.seed && q.biome === 0);
      put(pod.x * 0.85, pod.z - 2);
    }
    if (id === 'plant') put(L.inside.x, L.inside.z);
    if (id === 'grow') for (const pl of g.gardens[me.slot].planters) if (pl.plant && pl.plant.growLeft > 0) pl.plant.growLeft = 0.05;
    if (id === 'collect') {
      g.gardens[me.slot].cashPile = Math.max(40, g.gardens[me.slot].cashPile);
      put(L.collectPad.x, L.collectPad.z);
    }
    if (id === 'speed') {
      // on the Speed treadmill: E / the Action button trains (Speed +2)
      me.cash = Math.max(me.cash, 5000);
      const st = g.layout.speedStations.find((s) => s.id === 'speed');
      put(st.x, st.z);
    }
    if (id === 'lock') put(L.lockPad.x, L.lockPad.z);
    if (id === 'steal') {
      if (me.carrying?.kind === 'plant') put(L.inside.x, L.inside.z);
      else {
        const v = g.gardens[(me.slot + 1) % 4];
        v.lockedUntil = 0;
        const pl = v.planters[0];
        pl.plant = { uid: 777001, speciesId: 'daisy', mutation: 'normal', growTotal: 10, growLeft: 0, owner: v.slot };
        put(pl.x - v.L.inward * 2.5, pl.z);
      }
    }
  }, id);
  await setup();
  const hold = id === 'grab' || id === 'steal' || id === 'speed';
  if (hold) await holdOn(true);
  let moved = false;
  for (let i = 0; i < 40; i++) {
    await frames(page, 2, 0.1);
    const s = await tutState(page);
    if (s.state !== 'active' || ['move', 'grab', 'plant', 'grow', 'collect', 'speed', 'lock', 'steal'][s.step] !== id) {
      moved = true;
      break;
    }
    if (id === 'steal' && (await page.evaluate(() => window.__app.human.carrying?.kind === 'plant'))) {
      await holdOn(false);
      await setup(); // got it: run home
    }
  }
  if (hold) await holdOn(false);
  check(moved, `step "${id}" ticks off with real play`);
  return id;
}

// open Settings (from the pause menu) and press Play tutorial, then back to the game
async function replayFromSettings(page) {
  await page.evaluate(() => {
    window.__app.pause();
    window.__app.menus.openSettings();
  });
  await sleep(300);
  await page.click('.settings .set-tut');
  const label = await page.evaluate(() => document.querySelector('.settings .set-tut')?.textContent);
  check(/Starts when you play/.test(label || ''), 'Settings: Play tutorial says when it starts: ' + label);
  await page.evaluate(() => {
    window.__app.menus.closeAllModals();
    window.__app.resume();
  });
}

try {
  // ------------------------------------------------------------------ computer: Yes -> two steps -> Skip
  {
    const { ctx, page, errors } = await open();
    await pressStart(page, false);
    await page.waitForSelector('.tut-offer .tof-yes', { timeout: 30000 });
    await offerIn(page);
    check(await visible(page, '.tut-offer .tof-yes') && await visible(page, '.tut-offer .tof-no'), 'computer: Start asks "Want a quick tutorial?" with Yes / No thanks');
    check((await page.textContent('.tut-offer .tof-hint')).includes('yes'), 'computer: the offer shows its keys (Y / N)');
    check(await page.evaluate(() => window.__app.state) === 'title', 'the game waits for the answer');
    await shot(page, 'tut-01-offer-desktop');
    await page.keyboard.press('KeyY');
    await land(page);
    check((await tutState(page)).state === 'active', 'Y = yes: the tutorial is on');
    let c = await card(page);
    check(c?.on && c.title === "Let's go!" && c.count === '1/8' && /<kbd>W<\/kbd>/.test(c.text), 'step 1 card: walk with WASD: ' + JSON.stringify(c && [c.title, c.count]));
    let b = await beacon(page);
    const out = await page.evaluate(() => { const L = window.__app.game.layout.gardens[window.__app.human.slot]; return L.outside; });
    check(b?.on && Math.hypot(b.x - out.x, b.z - out.z) < 0.1, 'the beacon bounces over the spot just outside the gate');
    await frames(page, 2);
    await shot(page, 'tut-02-step-move-desktop');
    check(await playStep(page) === 'move', 'walked out of the gate');
    c = await card(page);
    check(c.title === 'Grab a seed' && /<kbd>E<\/kbd>/.test(c.text) && c.count === '2/8', 'step 2: grab a seed with E');
    // turn away from the Seed Road: the beacon is off screen, an arrow on the screen edge points at it
    await page.evaluate(() => {
      const a = window.__app, L = a.game.layout.gardens[a.human.slot];
      Object.assign(a.human.pos, { x: L.outside.x, y: 0, z: L.outside.z });
      a.human.yaw = Math.PI;
      a.cam.snapBehind(Math.PI);
      a.cam.yaw = Math.PI;
    });
    await frames(page, 3);
    check(await visible(page, '.tut-edge.show'), 'facing away: the screen-edge arrow shows');
    // face the road: the beacon is on screen over a seed, the edge arrow goes
    await page.evaluate(() => {
      const a = window.__app, h = a.human;
      Object.assign(h.pos, { x: 0, y: 0, z: a.game.layout.roadGate.z - 14 });
      h.yaw = 0;
      a.cam.snapBehind(0);
      a.cam.yaw = 0;
    });
    await frames(page, 3);
    b = await beacon(page);
    check(b?.on && b.z > 0, 'the beacon moved up the Seed Road to a seed');
    check(!(await visible(page, '.tut-edge.show')), 'facing the seed: no edge arrow');
    await shot(page, 'tut-03-step-grab-desktop');
    check(await playStep(page) === 'grab', 'grabbed a seed');
    c = await card(page);
    check(c.title === 'Plant it' && c.count === '3/8', 'step 3: plant it');
    await page.click('.hud .tut-skip');
    await frames(page, 2);
    check((await tutState(page)).state === 'done', 'Skip: the tutorial is done');
    check(!(await card(page)).on && !(await beacon(page))?.on, 'Skip: the card and the beacon go away');
    // replay from Settings and play it all the way through
    await replayFromSettings(page);
    await frames(page, 3, 0.1);
    c = await card(page);
    check(c?.on && c.count === '1/8', 'replayed from Settings: back at step 1');
    for (let i = 0; i < 8; i++) {
      const id = await playStep(page);
      if (id === 'steal') break;
    }
    check((await tutState(page)).state === 'done', 'all eight steps: done');
    c = await card(page);
    check(/complete/.test(c.cls) && c.title === 'You did it!', 'the card celebrates');
    await sleep(400);
    await frames(page, 4);
    check(await visible(page, '.announce'), 'a big "Tutorial complete!" moment');
    await shot(page, 'tut-04-finish-desktop');
    check(errors.length === 0, 'computer: no console errors' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
    await ctx.close();
  }

  // ------------------------------------------------------------------ phone: No thanks -> replay from the mode screen
  {
    const { ctx, page, errors } = await open({ phone: true });
    await pressStart(page, true);
    await page.waitForSelector('.tut-offer .tof-no', { timeout: 30000 });
    await offerIn(page);
    await shot(page, 'tut-05-offer-phone');
    const btns = await page.evaluate(() => ['.tof-yes', '.tof-no'].map((s) => document.querySelector('.tut-offer ' + s).getBoundingClientRect().height));
    check(btns.every((hgt) => hgt >= 44), 'phone: big buttons (' + btns.map(Math.round).join(', ') + ' px)');
    await page.tap('.tut-offer .tof-no');
    await land(page);
    check((await tutState(page)).state === 'declined', 'No thanks: declined');
    await frames(page, 4, 0.1);
    check(!(await card(page))?.on && !(await beacon(page))?.on, 'no card, no beacon');
    check(await visible(page, '.nextgoal'), 'the Next goal chip shows straight away');
    // back to the title and in again: never asked twice
    await page.evaluate(() => {
      window.__app.quitToTitle();
      window.__app.engine.start();
    });
    await pressStart(page, true);
    await sleep(800);
    check(!(await visible(page, '.tut-offer')), 'a no thanks is never asked again');
    await land(page);
    await page.evaluate(() => {
      window.__app.quitToTitle();
      window.__app.engine.start();
    });
    // "Play the tutorial" on the mode screen
    await page.tap('.btn-play');
    await page.waitForSelector('.tut-replay', { timeout: 30000 });
    await sleep(400);
    await page.tap('.tut-replay');
    await land(page);
    check(await page.evaluate(() => document.documentElement.classList.contains('hud-simple')), 'phone: Simple HUD');
    const c = await card(page);
    check(c?.on && c.count === '1/8' && /tg-joy/.test(c.text), 'phone: step 1 shows the joystick: ' + JSON.stringify(c && [c.title, c.text.replace(/<[^>]+>/g, '')]));
    // the card and the edge arrow never sit on the thumb controls
    const clash = await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect();
      const mine = [...document.querySelectorAll('.hud .tut, .tut-edge.show')].filter((e) => e.offsetParent && getComputedStyle(e).display !== 'none').map(box);
      const thumbs = [...document.querySelectorAll('.tb-jump, .tb-bonk, .tb-act.show, .stick-idle')].filter((e) => getComputedStyle(e).display !== 'none').map(box);
      return mine.some((a) => thumbs.some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
    });
    check(!clash, 'phone: the card stays clear of the joystick and buttons');
    await frames(page, 2);
    await shot(page, 'tut-06-step-move-phone');
    await playStep(page, { touch: true });
    const c2 = await card(page);
    check(/tg-tap/.test(c2.text) && /Grab/.test(c2.text), 'phone: step 2 says to tap Grab');
    for (let i = 0; i < 8; i++) {
      const id = await playStep(page, { touch: true });
      if (id === 'steal') break;
    }
    check((await tutState(page)).state === 'done', 'phone: all eight steps done');
    await sleep(400);
    await frames(page, 4);
    await shot(page, 'tut-07-finish-phone');
    check(errors.length === 0, 'phone: no console errors' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));

    // ---- a new player whose first game is online: the offer is a card in the game (online games never pause)
    await page.evaluate(() => {
      const a = window.__app;
      a.quitToTitle();
      // a stand-in for a joined room (there is no server here): the session steps nothing
      Object.assign(a.online, { room: { code: 'TESTS' }, update: () => {}, leave: () => {} });
      a.setProfile('micah');
      a.startOnline({ slots: [0, 1, 2, 3].map((i) => (i === 3 ? { kind: 'local', profile: a.profile } : { kind: 'bot' })) });
    });
    await land(page);
    await frames(page, 4, 0.1);
    check(await visible(page, '.hud .tof-game .tof-yes'), 'online: the offer shows as a card in the game');
    check((await tutState(page)).state === 'offered', 'online: marked as offered');
    const over = await page.evaluate(() => {
      const r = document.querySelector('.tof-game').getBoundingClientRect();
      return [...document.querySelectorAll('.tb-jump, .tb-bonk, .tb-act.show, .stick-idle')].filter((e) => getComputedStyle(e).display !== 'none')
        .some((e) => { const b = e.getBoundingClientRect(); return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; });
    });
    check(!over, 'online: the offer card stays clear of the thumb controls');
    await frames(page, 1);
    await shot(page, 'tut-08-offer-online-phone');
    await page.tap('.hud .tof-game .tof-yes');
    await frames(page, 12, 0.1);
    check((await tutState(page)).state === 'active' && !(await visible(page, '.tof-game')), 'online: Yes starts it and the card goes');
    check((await card(page))?.on, 'online: the step card is up');
    await ctx.close();
  }
} catch (e) {
  console.error(e);
  failed++;
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
