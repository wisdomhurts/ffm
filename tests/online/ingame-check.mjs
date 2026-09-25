// The real game (SwiftShader) with the cloud sync attached, against the fake backend: link a profile,
// play, open the panels over the 3D scene, and check that Save & Quit uploads the garden.
//   node build.mjs --entry src/online/dev/ingame.js --out <dir>
//   INGAME_DIR=<dir> OUT_DIR=<shots> node tests/online/ingame-check.mjs
import path from 'node:path';
import { launch, shot, sleep, manualFrames, stepFrames, fastForward } from '../harness.mjs';
import { createFakeSupabase, FAKE_URL, FAKE_KEY } from './fake-supabase.mjs';

const DIR = path.resolve(process.env.INGAME_DIR || 'dist-ingame');
let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};
const fake = createFakeSupabase({ rateMs: 0 });
for (const [name, base, v] of [['Zippy Melon', 'micah', 4.2e6], ['Captain Kale', 'dorian', 2.1e6], ['Luna Petal', 'maddie', 9.8e5]]) {
  const call = (fn, args) => JSON.parse(fake.handle(`${FAKE_URL}/rest/v1/rpc/${fn}`, { headers: { apikey: FAKE_KEY, Authorization: 'Bearer ' + FAKE_KEY }, body: JSON.stringify(args) }).body);
  const r = call('sas_register', { p_name: name, p_base: base });
  call('sas_submit', { p_id: r.id, p_secret: r.secret, p_board: 'networth', p_value: v });
}

const { browser, page, errors } = await launch({ width: 1280, height: 720 });
try {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
  await page.route(FAKE_URL + '/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const r = fake.handle(req.url(), { headers: req.headers(), body: req.postData() });
    return route.fulfill({ status: r.status, contentType: 'application/json', headers: cors, body: r.body });
  });
  await page.addInitScript(([url, key]) => {
    window.__SAS_ONLINE__ = { url, key };
  }, [FAKE_URL, FAKE_KEY]);
  await page.goto('file://' + path.join(DIR, 'index.html'), { timeout: 300000 });
  await page.waitForFunction(() => window.__sas && window.__app.game, null, { timeout: 300000 });
  await manualFrames(page);
  // Maddie gets a save code, then plays a little Endless
  const code = await page.evaluate(async () => {
    const { api, profiles } = window.__sas;
    profiles.updateProfile('maddie', (p) => (p.best.netWorth = 750000));
    return (await api.cloudLink(profiles.getProfile('maddie'))).code;
  });
  check(/^SEED-/.test(code), 'linked Maddie: ' + code);
  await page.evaluate(() => window.__app.startGame({ charId: 'maddie', mode: 'endless', difficulty: 'normal', fresh: true }));
  await stepFrames(page, 3);
  await fastForward(page, 30);
  await page.evaluate(() => {
    window.__app.human.cash += 12345;
    window.__app.saveNow();
  });
  await stepFrames(page, 2);
  // scores reach the board in the background
  await page.waitForFunction(() => (window.__sas.api.cloudMeta('maddie').sent.networth || 0) === 750000, null, { timeout: 20000 });
  check(true, 'sync submitted Maddie\'s best in the background');
  // panels over the paused game
  await page.evaluate(() => window.__app.pause());
  await stepFrames(page, 1);
  await page.evaluate(() => window.__sas.openLeaderboard(window.__app, { scope: 'global', board: 'networth' }));
  await page.waitForSelector('.lb-row.me', { timeout: 20000 });
  await stepFrames(page, 1);
  await sleep(700);
  console.log('  shot', await shot(page, 'ingame-leaderboard'));
  await page.evaluate(() => window.__app.menus.closeAllModals());
  await page.evaluate(() => window.__sas.openCloudSave(window.__app));
  await page.waitForSelector('.cs-code');
  await stepFrames(page, 1);
  await sleep(700);
  console.log('  shot', await shot(page, 'ingame-cloudsave'));
  // loading a code into the player you're playing asks you to quit first
  await page.locator('.cs-input').fill(code);
  await page.locator('.cs-input-row .btn').click();
  await page.waitForSelector('.cs-prev');
  check(await page.getByText('Save & quit to title').isVisible(), 'restoring into the player in the running game asks to quit first');
  await page.evaluate(() => window.__app.menus.closeAllModals());
  // Save & Quit uploads the garden right away
  const id = await page.evaluate(() => window.__sas.profiles.getProfile('maddie').cloud.id);
  const before = fake.players.get(id).saves;
  await page.evaluate(() => window.__app.quitToTitle());
  const t0 = Date.now();
  while (fake.players.get(id).saves === before && Date.now() - t0 < 20000) await sleep(100);
  const saved = fake.stored(id);
  check(fake.players.get(id).saves > before && saved?.endless?.players?.[2]?.cash >= 12345, `Save & Quit uploaded the Endless garden (cash ${Math.floor(saved?.endless?.players?.[2]?.cash || 0)})`);
} catch (e) {
  console.error(e);
  failed++;
}
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
process.exit(failed ? 1 : 0);
