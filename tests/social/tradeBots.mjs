// Trading 2.0 in the real game (headless Chromium): an offline trade with Esther (a family bot). You ask her
// to trade (Y), offer Fluffy the bunny from the Pets tab, ask for her gold plant, she says yes, you confirm
// the goodbye and press Ready; Esther keeps Fluffy, the plant lands in your garden and Fluffy leaves your
// profile through pet mail. Screenshots: the Pets tab, the offer, the done card (desktop + phone), and the
// trade window at 320 px.
//   DIST_DIR=<build> OUT_DIR=<dir> node tests/social/tradeBots.mjs [desktop|phone ...]
import { chromium } from 'playwright';
import { openGame, manualFrames, stepFrames, shot } from '../harness.mjs';

const RUNS = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 375, height: 700, mobile: true },
};
const which = process.argv.slice(2).filter((a) => RUNS[a]);
let failed = 0;
const check = (ok, msg) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) failed++;
};

for (const name of which.length ? which : Object.keys(RUNS)) {
  const R = RUNS[name];
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  // a small touch phone (1x pixels: software GL is slow enough)
  const ctx = await browser.newContext(R.mobile
    ? { viewport: { width: R.width, height: R.height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
    : { viewport: { width: R.width, height: R.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  try {
    await openGame(page, 'index.html');
    await manualFrames(page);
    await page.evaluate(() => window.__app.startGame({ charId: 'dorian', mode: 'endless', difficulty: 'normal', fresh: true }));
    // game time without drawing (every updater: game, trades, HUD, pet mail), then a real frame for the picture
    const sim = (s) => page.evaluate((s) => {
      const e = window.__app.engine;
      for (let t = 0; t < s; t += 1 / 30) {
        e.time += 1 / 30;
        for (const fn of e.updaters) fn(1 / 30, e.time);
      }
    }, s);
    const tap = async (sel) => {
      // (scrolls the trade window to it first; pet pictures render slowly in software GL)
      if (R.mobile) await page.locator(sel).first().tap({ timeout: 90000 });
      else await page.locator(sel).first().click({ timeout: 90000 });
      await sim(0.15);
    };
    // a new sheet swallows clicks for 400 ms (the tap that opened it must not land on a card)
    const settle = () => new Promise((r) => setTimeout(r, 450));
    // the scene: Dorian at the fountain with three pets, Esther right next to him, the others far away
    await page.evaluate(() => {
      const a = window.__app;
      const g = a.game;
      a.cam.introT = 1;
      window.__UI_HOLD_ALERTS__ = true;
      const at = (p, x, z, yaw = 0) => {
        Object.assign(p.pos, { x, y: 0, z });
        Object.assign(p.vel, { x: 0, y: 0, z: 0 });
        p.yaw = yaw;
      };
      const [me, esther] = g.players;
      at(me, 0, 4, Math.PI);
      at(esther, 0, -1, 0);
      g.players.slice(2).forEach((p, i) => {
        at(p, -60 + i * 120, 60);
        p.controller = null;
      });
      for (const p of g.players) p.invulnUntil = 1e9;
      // Esther keeps still and stays home-free until the trade (her brain wanders off otherwise)
      esther._brain = esther.controller;
      esther.controller = null;
      let uid = 800000;
      const fill = (slot, list) => list.forEach(([sp, mut, grown], i) => {
        const pl = g.gardens[slot].planters[i];
        pl.unlocked = true;
        pl.plant = { uid: uid++, speciesId: sp, mutation: mut, growTotal: 60, growLeft: grown === false ? 30 : 0, owner: slot };
      });
      fill(0, [['sunflower', 'normal'], ['lavalily', 'gold'], ['cactus', 'normal', false]]);
      fill(1, [['tulip', 'gold'], ['daisy', 'normal']]);
      g.gardens[0].planters.forEach((pl) => (pl.unlocked = true));
      esther.pets = ['owl'];
      esther.petNames = ['Hoot'];
      g._refreshMods(esther);
      me.carrying = { kind: 'seed', speciesId: 'moonmelon', mutation: 'diamond', podId: 3, lucky: false };
    });
    // the human's pets live on the profile (the cached object every module reads)
    await page.evaluate(() => {
      const a = window.__app;
      const prof = a.profile;
      prof.pets.owned = [
        { uid: 'tpFluffy', id: 'bunny', t: 3, name: 'Fluffy' },
        { uid: 'tpSparky', id: 'dragon', t: 2, name: 'Sparky' },
        { uid: 'tpKit', id: 'kitty', t: 1 },
        { uid: 'tpPig', id: 'piglet', t: 4 },
      ];
      prof.pets.team = ['tpSparky', 'tpFluffy'];
      prof.pets.equipped = 'tpSparky';
      a.bus.emit('profile:changed', { profile: prof });
    });
    await sim(1);
    // Esther's real brain is back: she'll stand still for the trade (botTrade hold) once it opens
    await page.evaluate(() => {
      const e = window.__app.game.players[1];
      e.controller = e._brain;
    });
    check(await page.locator('.soc-chip').count() > 0, 'the Trade / Gift chip shows for Esther');
    if (R.mobile) await tap('.soc-chip .btn-blue'); // the Trade button on the chip
    else await page.keyboard.press('y');
    await sim(2.5);
    check(await page.locator('.soc-trade').count() === 1, 'Esther said yes: the trade window is open');
    await settle();
    await tap('.stt-tab[data-tab=pets]');
    await stepFrames(page, 2);
    await shot(page, `trade-${name}-1-pets-tab`);
    check(await page.locator('.st-plants .ptc').count() === 4, 'the Pets tab lists my four pets');
    // ask for her Gold Tulip first (she'd propose something of her own for an offer nobody asked anything for)
    await tap('.stt-tab[data-tab=ask]');
    await tap('.st-plants .spc[title*="Tulip"]');
    await tap('.stt-tab[data-tab=pets]');
    await tap('.st-plants .ptc[title^="Fluffy"]');
    // she thinks it over (game time; the engine only moves when we say so)
    for (let i = 0; i < 20; i++) {
      await sim(0.5);
      const ok = await page.evaluate(() => {
        const a = window.__app;
        const t = a.trades.sessionOf(a.human);
        return !!t && t.readyB && a.game.time > t.lockUntil;
      });
      if (ok) break;
    }
    const s = await page.evaluate(() => {
      const a = window.__app;
      const t = a.trades.sessionOf(a.human);
      return t && { give: t.offerA.pets.map((x) => x.name), ask: t.offerB.plants.map((x) => x.speciesId + ':' + x.mutation), readyB: t.readyB };
    });
    check(s && s.give.join() === 'Fluffy' && s.ask.join() === 'tulip:gold', 'offer: Fluffy for the Gold Tulip ' + JSON.stringify(s));
    check(s?.readyB, 'Esther is Ready (a bunny for a tulip is a good deal for her)');
    const rb = await page.evaluate(() => {
      const b = document.querySelector('.st-ready');
      return { disabled: b.disabled, cls: b.className, time: window.__app.game.time };
    });
    check(!rb.disabled, 'my Ready button is on: ' + JSON.stringify(rb));
    await stepFrames(page, 2);
    await shot(page, `trade-${name}-2-offer`);
    // Ready asks first: Fluffy stays with Esther for good
    await tap('.st-ready');
    const bar = await page.locator('.st-bar').innerText();
    check(/Bye bye, Fluffy! Esther keeps this pet/.test(bar), 'the goodbye warning: ' + bar.replace(/\s+/g, ' '));
    await stepFrames(page, 2);
    await shot(page, `trade-${name}-3-bye`);
    await tap('.st-ready');
    await sim(4);
    check(await page.locator('.st-done').count() === 1, 'TRADE DONE! card');
    await stepFrames(page, 2);
    await shot(page, `trade-${name}-4-done`);
    const after = await page.evaluate(() => {
      const a = window.__app;
      const g = a.game;
      return {
        mine: g.gardens[0].planters.filter((pl) => pl.plant).map((pl) => pl.plant.speciesId + ':' + pl.plant.mutation),
        esther: g.players[1].pets.map((id, i) => id + ':' + g.players[1].petNames[i]),
        bag: a.profile.pets.owned.map((x) => x.uid),
        team: a.profile.pets.team,
        mail: g.human.petMail.length,
      };
    });
    check(after.mine.includes('tulip:gold'), 'the Gold Tulip grows in my garden');
    check(after.esther.includes('bunny:Fluffy'), 'Esther keeps Fluffy: ' + after.esther);
    check(!after.bag.includes('tpFluffy') && after.bag.length === 3 && !after.team.includes('tpFluffy'), 'Fluffy left my bag and team (pet mail): ' + after.bag);
    check(after.mail === 0, 'the mail was acked');
    if (!R.mobile) {
      // a gamepad: B closes the done card (the trade window reads raw buttons while it holds the game's input)
      await page.evaluate(() => {
        const pad = { id: 'test pad', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
        window.__pad = pad;
        window.__app.input.gamepad = () => pad;
      });
      await sim(0.1);
      await page.evaluate(() => (window.__pad.buttons[1].pressed = true));
      await sim(0.1);
      await page.evaluate(() => (window.__pad.buttons[1].pressed = false));
      await sim(0.5);
      await new Promise((r) => setTimeout(r, 300)); // (the sheet fades out for 200 ms)
      check(await page.locator('.soc-trade').count() === 0, 'gamepad B closed the trade window');
    }
    if (R.mobile) {
      // the smallest phones: open a trade again and check nothing spills sideways at 320 px
      await page.evaluate(() => document.querySelector('.st-done .btn')?.click());
      await sim(0.5);
      await page.setViewportSize({ width: 320, height: 640 });
      await page.evaluate(() => {
        // Esther walked off after the trade: call her back and keep her there
        const e = window.__app.game.players[1];
        Object.assign(e.pos, { x: 0, y: 0, z: -1 });
        e.controller = null;
        e.carrying = null;
      });
      await sim(1);
      await page.keyboard.press('y');
      await sim(2.5);
      await settle();
      await tap('.stt-tab[data-tab=pets]');
      await tap('.st-plants .ptc');
      const spill = await page.evaluate(() => {
        const p = document.querySelector('.ss-panel');
        return p ? { over: p.scrollWidth - p.clientWidth, w: p.getBoundingClientRect().width } : null;
      });
      check(spill && spill.over <= 1, '320 px: the trade window fits ' + JSON.stringify(spill));
      await stepFrames(page, 2);
      await shot(page, `trade-${name}-5-320px`);
    }
    check(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  } catch (e) {
    console.log('FAIL ' + name + ': ' + (e?.stack || e));
    failed++;
    const info = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('.stt-tab')].map((b) => b.dataset.tab + (b.classList.contains('on') ? '*' : '')),
      cards: [...document.querySelectorAll('.st-plants > *')].map((c) => c.title || c.className),
      bar: document.querySelector('.st-bar')?.innerText,
    })).catch(() => null);
    console.log('  ' + JSON.stringify(info));
    await shot(page, `trade-${name}-fail`).catch(() => {});
  } finally {
    await browser.close();
  }
}
process.exit(failed ? 1 : 0);
