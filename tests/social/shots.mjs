// Social features in the real game (headless Chromium): emote wheel, quick chat bubbles, a bot waving
// back, the Trade / Gift chip, gift picker, invite card and the trade window with a scripted friend.
//   DIST_DIR=<build> OUT_DIR=<dir> node tests/social/shots.mjs [portrait|landscape|desktop ...]
// Slot 1 becomes a 'remote' friend ("Sam") that the script drives through app.trades.handle, the way
// the host applies a client's actions. The local player's trade actions go through app.act, patched here
// the way main.js routes them (see the social agent's sharedChangesRequested).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');
const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, 'tests', 'output');
fs.mkdirSync(OUT, { recursive: true });

const SIZES = {
  portrait: { width: 390, height: 844, touch: true },
  landscape: { width: 667, height: 375, touch: true },
  desktop: { width: 1280, height: 720, touch: false },
};
const which = process.argv.slice(2).filter((a) => SIZES[a]);
const runs = which.length ? which : Object.keys(SIZES);

let failed = 0;
const check = (ok, msg) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) failed++;
};

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
  const shot = async (n) => {
    await frames(2);
    await page.screenshot({ path: path.join(OUT, `social-${name}-${n}.png`), timeout: 180000 });
  };
  // UI timers that read performance.now() (chat bubbles) follow the stepped frames, not the slow
  // software-rendering wall clock (see the fake clock installed after startGame)
  const frames = (n = 1) => page.evaluate((n) => {
    for (let i = 0; i < n; i++) {
      window.__clock?.(1000 / 30);
      window.__app.engine.frame(1 / 30);
    }
    const gl = window.__app.engine.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }, n);
  const sim = (s) => page.evaluate((s) => {
    const g = window.__app.game;
    for (let t = 0; t < s; t += 1 / 30) {
      window.__clock?.(1000 / 30);
      g.update(1 / 30);
    }
  }, s);
  const E = (fn, arg) => page.evaluate(fn, arg);
  const tap = async (sel) => {
    const b = await page.locator(sel).first().boundingBox({ timeout: 5000 });
    const hit = await E(([s, x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el && (el.closest(s) ? null : el.tagName + '.' + [...el.classList].join('.') + ' < ' + (el.parentElement?.className || ''));
    }, [sel, b.x + b.width / 2, b.y + b.height / 2]);
    if (hit) console.log(`  note: ${sel} is covered by ${hit}`);
    if (S.touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  // centre of wheel slice i (0 = top, clockwise)
  const slicePoint = async (i) => {
    const b = await page.locator('.sw-wheel').boundingBox();
    const R = b.width / 2;
    const a = (i * Math.PI) / 4;
    return { x: b.x + R + Math.sin(a) * R * 0.66, y: b.y + R - Math.cos(a) * R * 0.66 };
  };

  try {
    await page.goto('file://' + path.join(DIST, 'index.html'), { timeout: 300000 });
    await page.waitForFunction(() => window.__app && window.__app.game, null, { timeout: 300000 });
    await E(() => window.__app.engine.stop());
    await E(() => window.__app.startGame({ charId: 'dorian', mode: 'endless', difficulty: 'normal', fresh: true }));
    await E(() => {
      let now = performance.now();
      performance.now = () => now;
      window.__clock = (ms) => (now += ms);
    });
    // the scene: Dorian by the fountain, the family around him, a friend (Sam) joins in slot 1
    await E(() => {
      const a = window.__app;
      const g = a.game;
      a.cam.introT = 1;
      window.__UI_HOLD_ALERTS__ = true;
      const at = (p, x, z, yaw = 0) => {
        Object.assign(p.pos, { x, y: 0, z });
        Object.assign(p.vel, { x: 0, y: 0, z: 0 });
        p.yaw = yaw;
      };
      const friend = g.setSlot(1, { kind: 'remote', pid: 'sam1', profile: { id: 'p_sam', name: 'Sam', base: 'esther', look: {}, pets: { owned: [], equipped: null } } });
      friend.controller = null;
      friend.faceKey = 'esther'; // no network face registry in this test: borrow a cartoon face
      let uid = 700000;
      const fill = (slot, list) => list.forEach(([sp, mut, grown], i) => {
        const pl = g.gardens[slot].planters[i];
        pl.unlocked = true;
        pl.plant = { uid: uid++, speciesId: sp, mutation: mut, growTotal: 60, growLeft: grown === false ? 30 : 0, owner: slot };
      });
      fill(0, [['sunflower', 'normal'], ['lavalily', 'gold'], ['cactus', 'normal'], ['starlotus', 'rainbow'], ['bubble', 'diamond', false], ['glowcap', 'normal']]);
      fill(1, [['flytrap', 'normal'], ['moonmelon', 'gold'], ['tulip', 'normal']]);
      g.gardens[1].planters.forEach((pl) => (pl.unlocked = true)); // Sam has room to trade
      g.players[0].cash = 12500;
      friend.cash = 4000;
      // live bots may bonk or splash us mid-test (a stunned player can't emote): not in this test
      g.players[0].invulnUntil = friend.invulnUntil = 1e9;
      at(g.players[0], 0, -6, 0);
      at(friend, 30, -30);
      // bots hang out in front of Dorian (bots with a job to do walk on, as they should)
      at(g.players[2], -3.5, 1.5, Math.PI);
      at(g.players[3], 3.5, 2.5, Math.PI);
      a.cam.yaw = 0;
      a.cam.pitch = 0.32;
      a.cam.distance = 17;
      // main.js routes trade actions to app.trades once integrated; emulate that here
      const act = a.act.bind(a);
      a.act = (n, ...args) => (/^trade/.test(n) ? a.trades.handle(a.human, n, args) : act(n, ...args));
    });
    await frames(3);

    // ---- emote wheel
    if (S.touch) await tap('.soc-emobtn');
    else await page.keyboard.press('g');
    await frames(2);
    await page.waitForTimeout(350); // the wheel pops in
    check(await E(() => !!document.querySelector('.sw-layer:not(.out)')), `${name}: wheel opens`);
    if (!S.touch) {
      const p = await slicePoint(0);
      await page.mouse.move(p.x, p.y);
    }
    await shot('01-wheel-emotes');
    // quick chat page
    if (S.touch) await tap('.sw-tab:nth-child(2)');
    else await page.keyboard.press('t');
    if (!S.touch) {
      const p = await slicePoint(1);
      await page.mouse.move(p.x, p.y);
    }
    await shot('02-wheel-chat');
    check(await E(() => document.querySelector('.sw-tab.on')?.textContent.startsWith('Chat')), `${name}: chat page`);

    // ---- say GG! and get a family reply
    if (S.touch) {
      const p = await slicePoint(1);
      await page.touchscreen.tap(p.x, p.y);
    } else await page.keyboard.press('2');
    await frames(3);
    check(await E(() => !document.querySelector('.sw-layer:not(.out)')), `${name}: wheel closes on pick`);
    const saidGG = await E(() => [...document.querySelectorAll('.lbl.bubble .bb')].some((b) => b.textContent === 'GG!' && b.closest('.lbl').style.display !== 'none'));
    check(saidGG, `${name}: my quick chat shows as a bubble over my head`);
    await sim(1.4);
    await shot('03-chat-bubble');
    const replies = await E(() => [...document.querySelectorAll('.cl')].map((c) => c.textContent));
    console.log(`  chat log: ${JSON.stringify(replies.slice(-3))}`);

    // ---- wave: the family waves back
    // emulate the requested view/gameView.js change (pass p.emote to avatar.update) so the avatars'
    // emote animations show; without it only the emote sticker over the head appears
    await E(() => {
      const a = window.__app;
      const g = a.game;
      a.view.avatars.forEach((av, i) => {
        if (!av || av.__emotePatched) return;
        const up = av.update.bind(av);
        av.update = (dt, s) => {
          const p = g.players[i];
          const e = p.emote && g.time < p.emote.until ? p.emote : null;
          const dur = { wave: 2.2, cheer: 2, laugh: 2, point: 1.6, sit: 30 }[e?.id] ?? 6;
          return up(dt, { ...s, emote: e ? e.id : null, emoteT: e ? g.time - (e.until - dur) : 0 });
        };
        av.__emotePatched = true;
      });
    });
    let waved = false;
    for (let tries = 0; tries < 3 && !waved; tries++) {
      await E(() => {
        const g = window.__app.game;
        const at = (p, x, z) => {
          Object.assign(p.pos, { x, y: 0, z });
          Object.assign(p.vel, { x: 0, y: 0, z: 0 });
          p.yaw = Math.PI;
        };
        at(g.players[2], -3.2, 3);
        at(g.players[3], 3.2, 3.5);
        // between errands (a bot on a steal, a chase or guarding its garden rightly ignores emotes)
        for (const b of [g.players[2], g.players[3]]) {
          const c = b.controller;
          if (!c) continue;
          c.goal = null;
          c.threat = null;
          c.nextDecideAt = g.time + 3;
          c.motor?.stop?.();
        }
        // pull the camera back a little so the family is in view on narrow phones too
        const cam = window.__app.cam;
        cam.distance = cam._dist = window.innerWidth < 500 ? 26 : 19;
        window.__waves = [];
        if (!window.__waveHook) {
          window.__waveHook = true;
          window.__app.bus.on('emote', (e) => e.player.kind === 'bot' && window.__waves.push(e.player.name + ':' + e.id));
        }
      });
      if (S.touch) {
        await tap('.soc-emobtn');
        await page.waitForTimeout(350); // the wheel pops in
        await tap('.sw-tab:nth-child(1)');
        const p = await slicePoint(0);
        await page.touchscreen.tap(p.x, p.y);
      } else {
        await page.keyboard.press('g');
        await page.keyboard.press('1');
      }
      await frames(1);
      const mine = await E(() => {
        const a = window.__app;
        const h = a.human;
        return { emote: h.emote?.id || null, state: a.state, blocking: !!a.menus?.isBlocking?.(), carrying: !!h.carrying, stunned: a.game.time < h.stunUntil, wheel: !!document.querySelector('.sw-layer:not(.out)') };
      });
      if (mine.emote !== 'wave') console.log('  wave attempt: ' + JSON.stringify(mine));
      await sim(1.3);
      waved = await E(() => window.__waves.some((w) => /wave/.test(w)));
      if (!waved) await sim(10);
    }
    check(waved, `${name}: a family bot waves back`);
    await shot('04-wave-back');
    await E(() => (window.__app.cam.distance = window.__app.cam._dist = 17));
    console.log('  bot emotes: ' + JSON.stringify(await E(() => window.__waves)));

    // ---- the friend walks up: Trade / Gift chip
    await E(() => {
      const g = window.__app.game;
      const f = g.players[1];
      Object.assign(f.pos, { x: 2.5, y: 0, z: -1 });
      f.yaw = Math.PI;
      Object.assign(g.players[2].pos, { x: -40, z: -40 });
      Object.assign(g.players[3].pos, { x: 40, z: -40 });
    });
    await frames(3);
    check(await E(() => !!document.querySelector('.soc-chip')), `${name}: Trade / Gift chip near a friend`);
    await shot('05-chip');

    // ---- gift picker
    if (S.touch) await tap('.soc-chip .btn-gold');
    else await page.keyboard.press('u');
    await frames(2);
    await page.waitForTimeout(400); // let the sheet finish popping in before tapping inside it
    check(await E(() => document.querySelectorAll('.soc-gift .ss-grid .spc').length === 6), `${name}: gift picker lists my 6 plants`);
    await shot('06-gift-pick');
    await tap('.soc-gift .ss-grid .spc:nth-child(2)');
    await frames(2);
    await page.waitForTimeout(100);
    await shot('07-gift-confirm');
    await tap('.soc-gift .ss-actions .btn-green');
    await frames(3);
    const gifted = await E(() => window.__app.game.gardens[1].planters.some((pl) => pl.plant?.speciesId === 'lavalily'));
    check(gifted, `${name}: the Gold Lava Lily moved to Sam's garden`);
    await shot('08-gift-done');

    // ---- Sam asks to trade: invite card
    await E(() => {
      const a = window.__app;
      a.trades.handle(a.game.players[1], 'tradeRequest', [0]);
    });
    await frames(2);
    check(await E(() => !!document.querySelector('.soc-invite')), `${name}: invite card`);
    await shot('09-invite');
    if (S.touch) await tap('.soc-invite .btn-green');
    else await page.keyboard.press('y');
    await frames(2);
    check(await E(() => !!document.querySelector('.soc-trade')), `${name}: trade window opens`);
    await page.waitForTimeout(400);
    // I offer two plants and some cash; Sam offers the Gold Moon Melon + cash
    await tap('.soc-trade .st-plants .spc:nth-child(1)');
    await tap('.soc-trade .st-plants .spc:nth-child(3)');
    await E(() => {
      const a = window.__app;
      a.trades.handle(a.game.players[1], 'tradeOffer', [{ planters: [1], cash: 250 }]);
    });
    await frames(2);
    await shot('10-trade');
    // the anti-scam moment: Sam swaps the melon for the flytrap
    await sim(1.2);
    await E(() => {
      const a = window.__app;
      a.trades.handle(a.game.players[1], 'tradeOffer', [{ planters: [0], cash: 50 }]);
    });
    await frames(2);
    check(await E(() => !!document.querySelector('.soc-trade .st-side.them.flash') && /changed their offer/.test(document.querySelector('.st-bar')?.textContent || '')),
      `${name}: their change flashes and warns`);
    await shot('11-trade-changed');
    // both press Ready: countdown
    await sim(1.2);
    await frames(1);
    await tap('.soc-trade .st-ready');
    await E(() => {
      const a = window.__app;
      a.trades.handle(a.game.players[1], 'tradeReady', [true]);
    });
    await frames(2);
    check(await E(() => /Trading in/.test(document.querySelector('.st-bar')?.textContent || '')), `${name}: countdown`);
    await shot('12-trade-countdown');
    await sim(3.2);
    await frames(2);
    check(await E(() => !!document.querySelector('.st-done')), `${name}: trade complete`);
    const after = await E(() => ({
      mine: window.__app.game.gardens[0].planters.filter((p) => p.plant).map((p) => p.plant.speciesId),
      cash: [window.__app.game.players[0].cash, window.__app.game.players[1].cash],
    }));
    console.log('  after trade: ' + JSON.stringify(after));
    check(after.mine.includes('flytrap'), `${name}: I got the flytrap`);
    await shot('13-trade-done');
  } catch (e) {
    console.error(e);
    failed++;
    await page.screenshot({ path: path.join(OUT, `social-${name}-error.png`) }).catch(() => {});
  }
  check(errors.length === 0, `${name}: no console errors` + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
