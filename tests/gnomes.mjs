// Browser checks for the Golden Gnome Hunt and The Seed Gazette: every gnome spot is clear of the world's
// real colliders (props included) and a kid walking there with the game's own physics gets within reach (the
// pot of gold with a jump); a gnome shows in the world and is found (banner, GNOME 1/16!); the Gnome Map and
// the Seed Gazette open from the pause menu; the plaza billboard shows the news; Save front page downloads a
// PNG; the Showdown end screen has the Gazette strip.
// Run: DIST_DIR=<build> OUT_DIR=<dir> node tests/gnomes.mjs
import { launch, openGame, startMatch, manualFrames, stepFrames, shot, sleep } from './harness.mjs';

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

// put the player at (x, z) facing yaw (0 = up the road) with the camera right behind
async function stand(page, x, z, yaw) {
  await page.evaluate(([x, z, yaw]) => {
    const a = window.__app;
    const h = a.game.human;
    Object.assign(h.pos, { x, y: 0, z });
    Object.assign(h.vel, { x: 0, y: 0, z: 0 });
    h.yaw = yaw;
    a.cam.snapBehind(yaw);
    a.cam.yaw = yaw;
    a.cam.smoothTarget.set(x, 4.2, z); // no lag from wherever the camera was
    a.cam._dist = null;
  }, [x, z, yaw]);
}

const { browser, page, errors } = await launch({ width: 1280, height: 720 });
try {
  await openGame(page, 'index.html');
  await page.evaluate(() => window.__app.setProfile('micah'));
  await page.evaluate(() => window.__app.profile.gnomes.splice(0));
  await startMatch(page, 'micah', 'endless', 'normal');
  await manualFrames(page);
  await page.evaluate(() => {
    const a = window.__app;
    if (a.cam) {
      a.cam.introDur = 0;
      a.cam.introT = 1;
    }
    a.game.players.filter((p) => p !== a.game.human).forEach((b) => Object.assign(b.pos, { x: 70, y: 0, z: -30 }));
  });

  // ---- every spot: clear of the real colliders, and walkable to with the game's physics
  const spots = await page.evaluate(() => {
    const a = window.__app;
    const P = a.game.physics;
    const R = 1.4;
    const boxes = P.boxes.filter((b) => !b.off && b.minY < 1e3);
    const out = [];
    // walk a body along waypoints at 16 studs/s (a last {jump: true} waypoint jumps towards it)
    const walk = (from, path) => {
      const body = { pos: { x: from[0], y: 0, z: from[1] }, vel: { x: 0, y: 0, z: 0 }, onGround: true };
      for (const wp of path) {
        if (wp.jump) {
          const dx = wp.x - body.pos.x, dz = wp.z - body.pos.z, d = Math.hypot(dx, dz) || 1;
          body.vel.y = 52;
          body.onGround = false;
          for (let t = 0; t < 1.2; t += 1 / 60) {
            const left = Math.hypot(wp.x - body.pos.x, wp.z - body.pos.z);
            const v = left > 0.5 ? 16 : 0;
            body.vel.x = (dx / d) * v;
            body.vel.z = (dz / d) * v;
            P.step(body, 1 / 60);
          }
          continue;
        }
        for (let t = 0; t < 12; t += 1 / 60) {
          const dx = wp.x - body.pos.x, dz = wp.z - body.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.4) break;
          body.vel.x = (dx / d) * 16;
          body.vel.z = (dz / d) * 16;
          P.step(body, 1 / 60);
        }
      }
      return body.pos;
    };
    for (const g of a.world.gnomes.spots) {
      // solid between its feet and a kid's head (a top within a step above them is what it sits on: the pot of gold)
      const blockers = boxes.filter((b) => b.minY < g.y + 5.2 && b.maxY > g.y + 0.7 && g.x + R > b.minX && g.x - R < b.maxX && g.z + R > b.minZ && g.z - R < b.maxZ).map((b) => b.tag);
      let from;
      let path;
      if (g.biome >= 0) {
        from = [0, g.z - 30];
        path = g.y > 0 ? [{ x: g.x, z: g.z - 7 }, { x: g.x, z: g.z, jump: true }] : [{ x: g.x, z: g.z }];
      } else if (g.id === 'surfer') {
        from = [20, 53];
        path = [{ x: g.x, z: 55 }, { x: g.x, z: g.z }];
      } else if (g.id === 'shopper') {
        from = [20, -50];
        path = [{ x: g.x, z: -50 }, { x: g.x, z: g.z }];
      } else if (g.id === 'peeky') {
        from = [-45, -53];
        path = [{ x: g.x, z: -53 }, { x: g.x, z: g.z }];
      } else if (g.id === 'splashy') {
        from = [-25, g.z];
        path = [{ x: g.x, z: g.z }];
      } else {
        from = [g.x, g.z - 10];
        path = [{ x: g.x, z: g.z }];
      }
      const p = walk(from, path);
      const d = Math.hypot(p.x - g.x, p.z - g.z), up = g.y - p.y;
      out.push({ id: g.id, blockers, reach: d <= 3.5 && up <= 4 && up >= -3, d: +d.toFixed(2), up: +up.toFixed(2) });
    }
    return out;
  });
  for (const s of spots) check(!s.blockers.length && s.reach, `${s.id}: clear (${s.blockers.join(',') || 'no colliders'}) and reachable on foot (${s.d} studs away, ${s.up} up)`);

  // ---- a gnome in the world: Splashy on the fountain's rim (as you see it, then up close)
  await stand(page, -34, 52, -Math.PI / 2 + 0.12);
  await stepFrames(page, 3);
  await shot(page, 'gnome-world');
  await page.evaluate(() => (window.__app.cam.distance = 8));
  await stand(page, -36.5, 52.4, -Math.PI / 2 + 0.1);
  await stepFrames(page, 3);
  await shot(page, 'gnome-closeup');
  await page.evaluate(() => (window.__app.cam.distance = 22));
  // walk up to it: found
  await page.evaluate(() => {
    const h = window.__app.game.human;
    Object.assign(h.pos, { x: -39.6, y: 0, z: 53 });
  });
  await stepFrames(page, 1);
  const found = await page.evaluate(() => {
    const a = window.__app;
    a.gnomes.check();
    return { gnomes: a.profile.gnomes.slice(), banner: document.querySelector('.alert.a-gold')?.textContent || '' };
  });
  check(found.gnomes.includes('splashy'), 'walking up to Splashy finds it (profile.gnomes)');
  check(/Golden Gnome 1 of/.test(found.banner), 'a gold banner says so: ' + found.banner);
  await stand(page, -33, 51.5, -Math.PI / 2 + 0.2);
  await stepFrames(page, 4);
  await shot(page, 'gnome-found');

  // ---- the news: a few stories, then the plaza billboard
  await page.evaluate(() => {
    const a = window.__app;
    const g = a.game;
    const [dad, mom, mati, me] = [0, 1, 2, 3].map((i) => g.players[i]);
    const bus = a.bus;
    bus.emit('steal:success', { thief: me, victim: dad, plant: { speciesId: 'cactus', mutation: 'rainbow' } });
    bus.emit('banana:slip', { target: mati, owner: me });
    bus.emit('seed:grabbed', { player: me, speciesId: 'starlotus', mutation: 'gold', rarity: 'mythic' });
    bus.emit('steal:foiled', { thief: mom, victim: me, plant: { speciesId: 'daisy', mutation: 'gold' }, by: me, cause: 'bonk' });
    for (let i = 0; i < 4; i++) bus.emit('player:hit', { target: dad, by: me, cause: 'bonk' });
  });
  const news = await page.evaluate(() => window.__app.gazette.stories().map((s) => s.head));
  check(news.length >= 4, 'the Gazette wrote the news: ' + news.join(' | '));
  await sleep(5200); // the billboard repaints at most every 5 s
  await page.evaluate(() => window.__app.fx.clear());
  await stand(page, 7, 0, Math.PI / 2);
  await stepFrames(page, 3);
  await shot(page, 'gazette-billboard');

  // ---- the pause menu: the Gnome Map and the Seed Gazette
  await page.evaluate(() => window.__app.pause());
  await stepFrames(page, 1);
  const btns = await page.evaluate(() => [...document.querySelectorAll('.pause-fun .btn')].map((b) => b.textContent.trim()));
  check(btns.join('|') === 'Gnome Map|Seed Gazette', 'the pause menu has Gnome Map and Seed Gazette: ' + btns.join('|'));
  await shot(page, 'pause-menu');
  await page.click('.pause-fun .btn-gold');
  await sleep(500);
  const map = await page.evaluate(() => ({
    cards: document.querySelectorAll('.gm-card').length, found: document.querySelectorAll('.gm-card.found').length, count: document.querySelector('.gm-count b')?.textContent,
  }));
  check(map.cards >= 12 && map.found === 1, `the Gnome Map: ${map.cards} cards, ${map.found} found (${map.count})`);
  await shot(page, 'gnome-map');
  await page.evaluate(() => window.__app.menus.closeAllModals(true));
  await page.click('.pause-fun .btn-blue');
  await sleep(600);
  const paper = await page.evaluate(() => {
    const c = document.querySelector('.gz-paper');
    return { ok: !!c && c.width === 1080, label: c?.getAttribute('aria-label') || '' };
  });
  check(paper.ok && /pinches|sneaks|heist/i.test(paper.label), 'the front page shows the news: ' + paper.label.slice(0, 120));
  await shot(page, 'gazette-front');
  const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await page.click('.gz-acts .btn-gold');
  const d = await dl;
  check(!!d && /^seed-gazette-.*\.png$/.test(d.suggestedFilename()), 'Save front page downloads a PNG: ' + (d ? d.suggestedFilename() : 'none'));
  if (d) await d.saveAs((process.env.OUT_DIR || 'tests/output') + '/gazette-saved.png');
  await page.evaluate(() => window.__app.menus.closeAllModals(true));

  // ---- the rewards in the Wardrobe: the Gnome Hat and the Golden Gnome Noodle, once their badges are earned
  await page.evaluate(() => {
    const p = window.__app.profile;
    p.badges.gnomes2 = p.badges.gnomes3 = Date.now();
  });
  await page.click('.pq-wardrobe');
  await sleep(800);
  await page.click('.wd-tab[data-tab="noodle"]');
  await sleep(300);
  await page.click('.wd-tile[title="Golden Gnome Noodle"]');
  await sleep(300);
  await stepFrames(page, 2);
  const wd = await page.evaluate(() => {
    const t = document.querySelector('.wd-tile[title="Golden Gnome Noodle"]');
    return { tile: !!t, locked: t?.classList.contains('locked'), on: t?.classList.contains('on') };
  });
  check(wd.tile && !wd.locked && wd.on, 'the Golden Gnome Noodle is in the Wardrobe, unlocked, and can be worn');
  await shot(page, 'wardrobe-noodle');
  await page.click('.wd-tab[data-tab="hats"]');
  await sleep(1500);
  await stepFrames(page, 2);
  const hat = await page.evaluate(() => {
    const t = document.querySelector('.wd-tile[title="Gnome Hat"]');
    return { tile: !!t, locked: t?.classList.contains('locked') };
  });
  check(hat.tile && !hat.locked, 'the Gnome Hat is in the Wardrobe, unlocked');
  await page.click('.wd-tile[title="Gnome Hat"]');
  await sleep(600);
  await stepFrames(page, 2);
  await shot(page, 'wardrobe-hat');
  await page.evaluate(() => window.__app.menus.closeAllModals(true));

  // ---- the Showdown end screen strip
  await page.evaluate(() => {
    const a = window.__app;
    a.menus.hideAll();
    a.bus.emit('match:end', { ranking: a.game.ranking().map((p) => ({ player: p, netWorth: a.game.netWorth.get(p) })) });
  });
  await sleep(300);
  await stepFrames(page, 2);
  const strip = await page.evaluate(() => document.querySelector('.gz-end-h')?.textContent || '');
  check(/wins the Family Showdown/.test(strip), 'the end screen leads with the Gazette headline: ' + strip);
  await shot(page, 'gazette-endscreen');

  check(!errors.length, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
