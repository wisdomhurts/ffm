// Browser check for Giant Harvests, Family Hero and the Welcome-Back Garden: a forced TITAN (drumroll, beam,
// label chip), a rescue (HERO ribbon, thank-you line), and the "While you were away" card from a 3-hour-old save.
// SwiftShader is slow: frames are stepped by hand and kept few.
// Run: DIST_DIR=<dist> OUT_DIR=<out> node tests/giants.mjs
import { launch, openGame, shot, startMatch, manualFrames, stepFrames } from './harness.mjs';

const { browser, page, errors } = await launch();
let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};
try {
  await openGame(page, 'index.html');
  await page.evaluate(() => (window.__UI_HOLD_ALERTS__ = true)); // stepping frames by hand is slow: keep banners up
  await manualFrames(page);
  await startMatch(page, 'dorian');
  await manualFrames(page);
  await stepFrames(page, 4);

  // ---- a TITAN: the dice are loaded for one roll (the rules roll with game.rng)
  const before = await page.evaluate(() => {
    const app = window.__app;
    const g = app.game;
    for (const q of g.players) if (q.kind === 'bot') q.controller = null;
    const me = g.human;
    const gd = g.gardens[me.slot];
    const pl = gd.planters[1];
    pl.unlocked = true;
    pl.plant = { uid: 777001, speciesId: 'sunflower', mutation: 'gold', growTotal: 20, growLeft: 0.01, owner: me.slot };
    const real = g.rng.next;
    g.rng.next = () => ((g.rng.next = real), 0.0005);
    // stand back from it, looking at it
    me.pos.x = pl.x + (gd.L.west ? 14 : -14);
    me.pos.z = pl.z + 6;
    const yaw = Math.atan2(pl.x - me.pos.x, pl.z - me.pos.z);
    me.yaw = yaw;
    app.cam.snapBehind(yaw + 0.4); // a little to the side, so we don't stand in front of it
    app.cam.yaw = yaw + 0.4;
    app.cam.introT = 1;
    return { slot: me.slot };
  });
  await stepFrames(page, 3);
  let v = await page.evaluate(() => {
    const app = window.__app;
    const pl = app.game.gardens[app.game.human.slot].planters[1];
    return { size: pl.plant.size, key: app.view.plantViews.get(app.game.human.slot + ':1')?.key };
  });
  check(v.size === 'titan', 'the plant rolled TITAN: ' + v.size);
  check(/:normal$/.test(v.key || ''), 'drumroll: it still shows normal size: ' + v.key);
  await stepFrames(page, 40);
  v = await page.evaluate(() => {
    const app = window.__app;
    const rec = app.view.plantViews.get(app.game.human.slot + ':1');
    let beam = false;
    rec?.view.object3d.traverse((o) => (beam ||= o.name === 'glow-beam'));
    const lbl = [...document.querySelectorAll('.plantlbl')].map((e) => e.textContent).join(' | ');
    return { key: rec?.key, scale: rec?.view.object3d.scale.x, beam, lbl };
  });
  check(/:titan$/.test(v.key || '') && Math.abs(v.scale - 1.8) < 1e-6, `then it pops up to TITAN size (x${v.scale})`);
  check(v.beam, 'a TITAN gets its light beam');
  check(/TITAN/.test(v.lbl), 'the label has the TITAN chip: ' + v.lbl.slice(0, 80));
  await shot(page, 'giants-01-titan');
  void before;

  // ---- Micah robs us: the HELP! button (H calls the family)
  v = await page.evaluate(() => {
    const app = window.__app;
    const g = app.game;
    const me = g.human;
    const micah = g.players[3];
    const gd = g.gardens[me.slot];
    const pl = gd.planters[2];
    pl.unlocked = true;
    pl.plant = { uid: 777003, speciesId: 'daisy', mutation: 'normal', growTotal: 10, growLeft: 0, owner: me.slot };
    g.stealPlant(micah, gd, pl);
    micah.pos.x = me.pos.x + 30;
    return { robbed: true };
  });
  await stepFrames(page, 3);
  v = await page.evaluate(() => {
    const said = [];
    const off = window.__app.bus.on('chat', (e) => said.push(e));
    const btn = document.querySelector('.help-btn.show');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h' }));
    window.__app.engine.frame(1 / 30);
    off();
    return { btn: !!btn, said: said.map((e) => e.text) };
  });
  check(v.btn, 'while Micah runs off with our plant, the HELP! button shows');
  check(v.said.includes('Help!'), 'H calls the family: ' + v.said.join(' / '));
  await page.evaluate(() => {
    const g = window.__app.game;
    g.dropCarried(g.players[3], null, 'monster'); // (a monster knocks it loose: it flies home)
  });

  // ---- Micah runs off with Esther's plant close to us: "Esther needs help!", then we bonk him
  v = await page.evaluate(() => {
    const app = window.__app;
    const g = app.game;
    const me = g.human;
    const [, esther, , micah] = g.players;
    const ge = g.gardens[esther.slot];
    const pl = ge.planters[0];
    pl.unlocked = true;
    pl.plant = { uid: 777002, speciesId: 'tulip', mutation: 'normal', growTotal: 10, growLeft: 0, owner: esther.slot };
    micah.pos.x = me.pos.x + Math.sin(me.yaw + 0.5) * 9;
    micah.pos.z = me.pos.z + Math.cos(me.yaw + 0.5) * 9;
    micah.yaw = me.yaw;
    g.stealPlant(micah, ge, pl);
    return {};
  });
  await stepFrames(page, 4);
  v = await page.evaluate(() => ({
    pill: document.querySelector('.carry.helpme.show')?.textContent || '',
    alert: [...document.querySelectorAll('.alert')].map((e) => e.textContent).find((t) => /needs help/.test(t)) || '',
  }));
  check(/HELP ESTHER/.test(v.pill), 'an arrow to the thief: ' + v.pill);
  check(/Esther needs help/.test(v.alert), 'and a banner: ' + v.alert);
  await shot(page, 'giants-02-help');
  v = await page.evaluate(() => {
    const app = window.__app;
    const g = app.game;
    const me = g.human;
    const micah = g.players[3];
    micah.invulnUntil = 0;
    const lines = [];
    const off = app.bus.on('chat', (e) => lines.push(e.player.name + ': ' + e.text));
    window.__heroLines = lines;
    window.__offHero = off;
    const cash = me.cash;
    g.hitPlayer(micah, me, { x: 0, z: 1 }, 1, 'bonk');
    return { tip: me.cash - cash, hero: me.heroUntil - g.time };
  });
  check(v.tip > 0 && v.hero > 50, `HERO: +$${v.tip}, ribbon for ${v.hero.toFixed(0)} s`);
  await stepFrames(page, 14);
  v = await page.evaluate(() => {
    window.__offHero();
    return { lines: window.__heroLines, ribbon: !!document.querySelector('.nametag .nt-hero'), moment: document.querySelector('.announce')?.textContent || '' };
  });
  check(v.ribbon, 'the gold HERO ribbon shows');
  check(v.lines.some((l) => l.startsWith('Esther:')), 'Esther says thank you: ' + v.lines.join(' / '));
  check(/HERO/.test(v.moment), 'a HERO! moment: ' + v.moment);
  await shot(page, 'giants-03-hero');

  // ---- Welcome back: the save says we left 3 hours ago
  v = await page.evaluate(() => {
    const app = window.__app;
    app.saveNow();
    const key = 'steal-a-seed:v1:' + app.game.saveKey;
    const s = JSON.parse(localStorage.getItem(key));
    s.savedAt -= 3 * 3600 * 1000;
    localStorage.setItem(key, JSON.stringify(s));
    app.startGame({ charId: app.profileId, mode: 'endless' });
    return { card: !!document.querySelector('.away-card'), text: document.querySelector('.away-card')?.textContent || '', paused: app.game.paused, pile: app.game.gardens[app.game.human.slot].cashPile };
  });
  check(v.card && /While you were away/.test(v.text) && /COLLECT/.test(v.text), 'the welcome-back card: ' + v.text.slice(0, 160));
  check(v.paused && v.pile > 0, `the game waits; $${Math.floor(v.pile)} is on the COLLECT pad`);
  await stepFrames(page, 8);
  await shot(page, 'giants-04-away');
  v = await page.evaluate(() => {
    document.querySelector('.away-card .wb-go').click();
    return { paused: window.__app.game.paused };
  });
  await stepFrames(page, 4);
  v = await page.evaluate(() => ({ pill: !!document.querySelector('.carry.away-go.show'), paused: window.__app.game.paused, card: !!document.querySelector('.modal:not(.out) .away-card') }));
  check(!v.card && !v.paused && v.pill, 'Run to COLLECT!: the card closes and an arrow points at the pad');
  v = await page.evaluate(() => {
    const app = window.__app;
    const g = app.game;
    const pad = g.layout.gardens[g.human.slot].collectPad;
    const cash = g.human.cash;
    g.human.pos.x = pad.x;
    g.human.pos.z = pad.z;
    g.update(1 / 30);
    return { got: g.human.cash - cash };
  });
  await stepFrames(page, 3);
  const pillGone = await page.evaluate(() => !document.querySelector('.carry.away-go'));
  check(v.got > 0 && pillGone, `collected $${Math.floor(v.got)}, the arrow is gone`);
  check(!errors.length, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
