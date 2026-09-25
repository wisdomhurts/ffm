// Browser check of the High Scores + Cloud Save panels against the in-memory fake backend.
//   node build.mjs --entry src/online/dev/gallery.js --out <gallery>
//   GALLERY_DIR=<gallery> OUT_DIR=<shots> node tests/online/ui-check.mjs
// Screenshots at 390x844 (phone) and 1280x720 (laptop): lb-*, cs-* in OUT_DIR.
import path from 'node:path';
import { launch, shot, sleep } from '../harness.mjs';
import { createFakeSupabase, FAKE_URL, FAKE_KEY } from './fake-supabase.mjs';

const GALLERY = path.resolve(process.env.GALLERY_DIR || 'dist-gallery');
let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};

// ------------------------------------------------------------------ a lively fake world
function seed(fake) {
  const call = (fn, args) => JSON.parse(fake.handle(`${FAKE_URL}/rest/v1/rpc/${fn}`, { headers: { apikey: FAKE_KEY, Authorization: 'Bearer ' + FAKE_KEY }, body: JSON.stringify(args) }).body);
  const people = [
    ['Zippy Melon', 'micah', { networth: 48_500_000, showdown: 2_900_000, steals: 812, rebirths: 9 }],
    ['Captain Kale', 'dorian', { networth: 21_000_000, showdown: 3_400_000, steals: 455, rebirths: 7 }],
    ['Luna Petal', 'maddie', { networth: 9_870_000, showdown: 1_250_000, steals: 390, rebirths: 5 }],
    ['Sneaky Bean', 'micah', { networth: 6_400_000, showdown: 980_000, steals: 1204, rebirths: 4 }],
    ['Grandma Rose', 'esther', { networth: 5_150_000, showdown: 2_100_000, steals: 64, rebirths: 4 }],
    ['Sunny Sprout', 'maddie', { networth: 2_300_000, showdown: 640_000, steals: 211, rebirths: 2 }],
    ['Bouncy Mango', 'dorian', { networth: 1_720_000, showdown: 505_000, steals: 150, rebirths: 2 }],
    ['Jolly Clover', 'esther', { networth: 940_000, showdown: 410_000, steals: 98, rebirths: 1 }],
    ['Cosmic Daisy', 'maddie', { networth: 610_000, showdown: 380_000, steals: 77, rebirths: 1 }],
    ['Brave Pepper', 'micah', { networth: 330_000, showdown: 150_000, steals: 41, rebirths: 0 }],
    ['Mighty Lotus', 'dorian', { networth: 120_000, showdown: 90_000, steals: 12, rebirths: 0 }],
  ];
  for (const [name, base, v] of people) {
    const r = call('sas_register', { p_name: name, p_base: base, p_look: {} });
    for (const [b, val] of Object.entries(v)) if (val > 0) call('sas_submit', { p_id: r.id, p_secret: r.secret, p_board: b, p_value: val });
  }
  // "Dorian on the laptop": a family save to load on this device
  const d = call('sas_register', { p_name: 'Dorian', p_base: 'dorian', p_look: {} });
  call('sas_save', {
    p_id: d.id, p_secret: d.secret, p_save: {
      v: 1, kind: 'steal-a-seed', listed: true,
      profile: { v: 1, id: 'dorian', base: 'dorian', name: 'Dorian', stars: 42, unlocks: [], pets: { owned: [{ uid: 'a', id: 'bunny' }, { uid: 'b', id: 'fox' }], equipped: 'a' }, badges: { firstSteal: 1, rebirth1: 1 }, counters: { steals: 230 }, best: { netWorth: 3_600_000, showdownWins: 3, showdownBest: 1_900_000 } },
      endless: { v: 1, humanId: 'dorian', players: [{ id: 'dorian', cash: 820_000, rebirths: 3 }, {}, {}, {}], gardens: [{ planters: Array.from({ length: 10 }, (_, i) => ({ unlocked: true, plant: i < 8 ? { speciesId: 'daisy' } : null })) }, {}, {}, {}] },
      summary: { netWorth: 3_600_000, showdownBest: 1_900_000, steals: 230, rebirths: 3, stars: 42, badges: 2, pets: 2, cash: 820_000, plants: 8, garden: true, pid: 'dorian', family: true },
      savedAt: Date.now() - 3 * 3600e3,
    },
  });
  fake.clearRateLimits();
  return d.code;
}

async function runViewport(label, opts) {
  const fake = createFakeSupabase({ rateMs: 0 });
  const dorianCode = seed(fake);
  const { browser, page, errors } = await launch(opts);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route(FAKE_URL + '/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const r = fake.handle(req.url(), { headers: req.headers(), body: req.postData() });
      await sleep(120); // a little latency so loading states are real
      return route.fulfill({ status: r.status, contentType: 'application/json', headers: cors, body: r.body });
    } catch {
      return route.abort('internetdisconnected');
    }
  });
  await page.addInitScript(([url, key]) => {
    window.__SAS_ONLINE__ = { url, key };
  }, [FAKE_URL, FAKE_KEY]);
  await page.goto('file://' + path.join(GALLERY, 'index.html'));
  await page.waitForFunction(() => window.__sas);
  // this device: the family has played a bit; Maddie is the active player
  await page.evaluate(() => {
    const { profiles, app } = window.__sas;
    const set = (id, f) => profiles.updateProfile(id, f);
    set('maddie', (p) => { p.best.netWorth = 1_340_000; p.best.showdownBest = 455_000; p.counters.steals = 128; p.stars = 17; });
    set('dorian', (p) => { p.best.netWorth = 2_050_000; p.best.showdownBest = 610_000; p.counters.steals = 96; p.stars = 9; });
    set('esther', (p) => { p.best.netWorth = 880_000; p.best.showdownBest = 720_000; p.counters.steals = 12; });
    set('micah', (p) => { p.best.netWorth = 64_000; p.counters.steals = 301; });
    app.setProfile('maddie');
  });
  const W = (sel, t = 8000) => page.waitForSelector(sel, { timeout: t });
  const snap = async (name) => {
    // let entrance animations finish (infinite ones like the loading shimmer don't count)
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
    await sleep(150);
    const p = await shot(page, `${name}-${label}`);
    console.log('  shot', p);
  };

  // --- High Scores: global, not on the board yet
  await page.evaluate(() => window.__sas.openLeaderboard(window.__sas.app, { scope: 'global', board: 'networth' }));
  await W('.lb-row:not(.sk)');
  check(await page.locator('.lb-row:not(.sk)').count() === 11, `${label}: global board lists the 11 seeded players`);
  check(await page.locator('.lb-join').isVisible(), `${label}: join bar invites Maddie`);
  await snap('lb-global-join');
  // join -> Maddie gets a code, her bests are submitted, her row is highlighted
  await page.locator('.lb-join .btn').click();
  await W('.lb-row.me', 10000);
  const meRow = await page.locator('.lb-row.me').innerText();
  check(/Maddie/.test(meRow) && /1\.34M/.test(meRow), `${label}: after joining Maddie's row is highlighted: ${meRow.replace(/\s+/g, ' ')}`);
  await snap('lb-global-me');
  // week + another board
  await page.locator('.lb-tab[data-v=steals]').click();
  await page.locator('.lb-period .seg-b[data-v=week]').click();
  await W('.lb-row.me');
  check(/Sneaky Bean/.test(await page.locator('.lb-row').first().innerText()), `${label}: Master Thief this week is led by Sneaky Bean`);
  await snap('lb-thief-week');
  // family board (offline-capable)
  await page.locator('.lb-scope .seg-b[data-v=family]').click();
  await W('.lb-row.me');
  const fam = await page.locator('.lb-row .lb-nm').allInnerTexts();
  check(fam.join(',') === 'Micah,Maddie,Dorian,Esther', `${label}: family thief board order: ${fam.join(',')}`);
  await snap('lb-family');
  // server down -> friendly error with retry
  fake.state.mode = 'down';
  await page.locator('.lb-scope .seg-b[data-v=global]').click();
  await page.locator('.lb-tab[data-v=rebirths]').click();
  await W('.lb-msg');
  check(/Couldn't load/.test(await page.locator('.lb-msg').innerText()), `${label}: server down shows a friendly message`);
  await snap('lb-error');
  fake.state.mode = 'up';
  await page.evaluate(() => window.__sas.rpc.resetBackoff());
  await page.locator('.lb-msg .btn-green').click();
  await W('.lb-row:not(.sk)');
  check(true, `${label}: retry recovers`);
  await page.evaluate(() => window.__app.menus.closeAllModals());

  // --- Cloud Save
  await page.evaluate(() => window.__sas.app.setProfile('micah'));
  await page.evaluate(() => window.__sas.openCloudSave(window.__sas.app));
  await W('.cs-card');
  check(await page.getByText('Get my save code').isVisible(), `${label}: unlinked profile offers a code`);
  await snap('cs-off');
  await page.getByText('Get my save code').click();
  await W('.cs-code');
  const code = (await page.locator('.cs-code').innerText()).trim();
  check(/^SEED-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code), `${label}: shows the code ${code}`);
  await page.waitForFunction(() => /Saved to the cloud/.test(document.querySelector('.cs-status')?.textContent || ''), null, { timeout: 8000 });
  check(true, `${label}: status says saved`);
  await snap('cs-linked');
  // load Dorian's laptop save on this device (Dorian here has progress -> side-by-side + choices)
  await page.locator('.cs-input').fill(dorianCode.toLowerCase().replace(/-/g, ''));
  await page.locator('.cs-input-row .btn').click();
  await W('.cs-prev');
  check(await page.locator('.cs-vs').isVisible(), `${label}: preview compares this device's Dorian with the code's`);
  await page.locator('.cs-prev').scrollIntoViewIfNeeded();
  await snap('cs-preview');
  await page.getByText('Replace Dorian').click();
  await W('.cs-done');
  const after = await page.evaluate(() => window.__sas.profiles.getProfile('dorian'));
  check(after.stars === 42 && after.best.netWorth === 3_600_000 && after.cloud?.code === 'SEED-' + dorianCode.slice(5), `${label}: Dorian restored from the cloud (stars ${after.stars})`);
  await page.locator('.cs-done').scrollIntoViewIfNeeded();
  await snap('cs-done');
  await page.getByText('Undo').click();
  const undone = await page.evaluate(() => window.__sas.profiles.getProfile('dorian'));
  check(undone.stars === 9, `${label}: Undo brings this device's Dorian back (stars ${undone.stars})`);
  // a bad code
  await page.locator('.cs-input').fill('SEED-0O1I-AAAA');
  check(/never use/.test(await page.locator('.cs-card .sas-err').last().innerText()), `${label}: impossible letters are explained while typing`);

  const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  check(real.length === 0, `${label}: no console errors` + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
  await browser.close();
}

await runViewport('phone', { mobile: true });
await runViewport('laptop', { width: 1280, height: 720 });
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
