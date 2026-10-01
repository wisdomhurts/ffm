// Browser checks for pet nicknames: naming a pet on the hatch card (a rude name is refused, Enter saves),
// renaming it in My Pets (Esc only closes the name box), the name tag over the pet in the world, and the
// hatch card's name box on a phone.
// Run: DIST_DIR=<build> OUT_DIR=<dir> node tests/petnames.mjs
import { launch, openGame, startMatch, manualFrames, stepFrames, shot, sleep } from './harness.mjs';

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

/** Buy an egg at the stand and wait for the hatch card's buttons + name box. */
async function hatchOne(page, egg = 'garden') {
  await page.evaluate((egg) => {
    const a = window.__app;
    const h = a.game.human;
    const s = a.game.layout.shops.pets;
    h.cash = 1e9;
    Object.assign(h.pos, { x: s.x, y: 0, z: s.z });
    a.act('buyEgg', egg);
  }, egg);
  await page.waitForSelector('.pet-hatch', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.pet-hatch').__hatch.seek(3.4));
  await page.waitForSelector('.pet-hatch.btns', { timeout: 20000 });
  await sleep(500); // let the card finish popping in
}

const { browser, page, errors } = await launch({ width: 1280, height: 720 });
try {
  await openGame(page, 'index.html');
  await startMatch(page, 'dorian', 'endless', 'normal');
  await manualFrames(page);
  const prof = () => page.evaluate(() => {
    const a = window.__app;
    const p = a.profile;
    return { owned: p.pets.owned.map((x) => ({ uid: x.uid, id: x.id, name: x.name || '' })), team: p.pets.team, petNames: [...a.game.human.petNames] };
  });
  const before = (await prof()).owned.length;

  // ---------------------------------------------------------------- hatch card: name your pet
  await hatchOne(page);
  check(await page.isVisible('.ph-name-input'), 'the hatch card has a "Name your pet" box');
  await page.fill('.ph-name-input', 'shit');
  await page.click('.ph-ok');
  await sleep(300);
  const refused = await page.evaluate(() => ({ open: !!document.querySelector('.pet-hatch'), bad: !!document.querySelector('.ph-name-msg.bad'), msg: document.querySelector('.ph-name-msg')?.textContent }));
  check(refused.open && refused.bad, `a rude name is refused and the card stays open ("${refused.msg}")`);
  await page.fill('.ph-name-input', 'Biscuit');
  const live = await page.evaluate(() => ({ big: document.querySelector('.ph-name')?.textContent, sp: document.querySelector('.ph-species')?.textContent, spHidden: document.querySelector('.ph-species')?.hidden }));
  check(live.big === 'Biscuit' && !live.spHidden && /^the /.test(live.sp), `the big name shows the nickname as it's typed (${live.big}, ${live.sp})`);
  await shot(page, 'pn-hatch-name');
  await page.press('.ph-name-input', 'Enter');
  await page.waitForSelector('.pet-hatch', { state: 'detached', timeout: 10000 });
  let st = await prof();
  const mine = st.owned[st.owned.length - 1];
  check(st.owned.length === before + 1 && mine.name === 'Biscuit', `Enter saves the name and closes the card (${mine.id} "${mine.name}")`);
  check(st.petNames[st.team.indexOf(mine.uid)] === 'Biscuit', `the game knows the team's nicknames (${st.petNames.join(',')})`);

  // a second hatch, no name typed: keeps its species name
  await hatchOne(page);
  await page.click('.ph-ok');
  await page.waitForSelector('.pet-hatch', { state: 'detached', timeout: 10000 });
  st = await prof();
  check(st.owned.length === before + 2 && st.owned[st.owned.length - 1].name === '', 'no name typed: the pet keeps its species name');

  // ---------------------------------------------------------------- the name tag in the world
  await page.evaluate(() => {
    const a = window.__app;
    a.menus.closeShop?.();
    a.resume?.();
    Object.assign(a.game.human.pos, { x: 0, y: 0, z: 10 });
    a.game.human.yaw = 0;
    if (a.cam) a.cam.introDur = 0;
  });
  await stepFrames(page, 30);
  const tag = await page.evaluate(() => [...document.querySelectorAll('.pt-tag')].filter((e) => e.offsetParent !== null || e.closest('.lbl')?.style.display !== 'none').map((e) => e.textContent));
  check(tag.includes('Biscuit'), `a name tag floats over Biscuit in the world (${tag.join(',')})`);
  await shot(page, 'pn-world-tag');

  // ---------------------------------------------------------------- My Pets: rename
  await page.evaluate(() => window.__app.menus.openShop('pets'));
  await stepFrames(page, 2);
  await page.click('.ps-bar .btn-blue');
  await page.waitForSelector('.pets-inv .pi-sel');
  // select Biscuit
  await page.evaluate(() => [...document.querySelectorAll('.pcard')].find((c) => c.querySelector('.pc-n')?.textContent === 'Biscuit')?.click());
  await sleep(100);
  const card = await page.evaluate(() => ({ n: document.querySelector('.pi-name b')?.textContent, sp: document.querySelector('.pi-species')?.textContent, btn: document.querySelector('.pi-rename-btn')?.textContent }));
  check(card.n === 'Biscuit' && !!card.sp && card.btn === 'Rename', `My Pets shows the nickname, the species and a Rename button (${card.n} / ${card.sp})`);
  await page.click('.pi-rename-btn');
  await page.waitForSelector('.pi-name-input');
  check(await page.evaluate(() => document.activeElement?.classList.contains('pi-name-input')), 'the name box opens with the cursor in it');
  await page.fill('.pi-name-input', 'Sir Biscuit');
  await shot(page, 'pn-mypets-rename');
  await page.keyboard.press('Escape');
  await sleep(150);
  const esc = await page.evaluate(() => ({ modal: !!document.querySelector('.pets-inv'), box: !!document.querySelector('.pi-name-input'), n: document.querySelector('.pi-name b')?.textContent }));
  check(esc.modal && !esc.box && esc.n === 'Biscuit', 'Esc closes only the name box (My Pets stays open, the name is unchanged)');
  await page.click('.pi-rename-btn');
  await page.fill('.pi-name-input', 'Sir Biscuit');
  await page.click('.pi-rename .btn-green');
  await sleep(150);
  st = await prof();
  const renamed = st.owned.find((x) => x.uid === mine.uid);
  const slotTxt = await page.evaluate(() => [...document.querySelectorAll('.pt-slot .pt-n')].map((e) => e.textContent));
  check(renamed.name === 'Sir Biscuit' && slotTxt.includes('Sir Biscuit'), `Save renames it, team slot too (${renamed.name}; ${slotTxt.join(',')})`);
  check(st.petNames.includes('Sir Biscuit'), 'the new name reaches the game right away');
  // the dice + clearing the name
  await page.click('.pi-rename-btn');
  await page.click('.pet-dice');
  const rolled = await page.inputValue('.pi-name-input');
  check(rolled.length > 0 && rolled !== 'Sir Biscuit', `the dice suggests a name ("${rolled}")`);
  await page.fill('.pi-name-input', '');
  await page.press('.pi-name-input', 'Enter');
  await sleep(150);
  st = await prof();
  const cleared = st.owned.find((x) => x.uid === mine.uid);
  const label = await page.evaluate(() => document.querySelector('.pi-name b')?.textContent);
  check(cleared.name === '' && label !== 'Sir Biscuit', `an empty name goes back to the species name (${label})`);
  // rude names are refused here too
  await page.click('.pi-rename-btn');
  await page.fill('.pi-name-input', 'p0rn');
  await page.press('.pi-name-input', 'Enter');
  await sleep(150);
  st = await prof();
  check(st.owned.find((x) => x.uid === mine.uid).name === '' && (await page.isVisible('.pi-name-msg.bad')), 'a rude name is refused in My Pets');
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- phone: the name box fits the hatch card
{
  const { browser: b2, page: p2, errors: e2 } = await launch({ mobile: true });
  try {
    await openGame(p2, 'index.html');
    await startMatch(p2, 'esther', 'endless', 'normal');
    await manualFrames(p2);
    await hatchOne(p2);
    const r = await p2.evaluate(() => {
      const box = (s) => document.querySelector(s)?.getBoundingClientRect();
      const i = box('.ph-name-input'), ok = box('.ph-ok');
      return { i: i && { t: i.top, b: i.bottom, l: i.left, r: i.right }, ok: ok && { t: ok.top, b: ok.bottom }, w: innerWidth, h: innerHeight };
    });
    check(!!r.i && r.i.l >= 0 && r.i.r <= r.w && r.i.b <= r.h && r.ok.b <= r.h && r.i.b <= r.ok.t, `phone: the name box and the OK button are on screen, box above the button ${JSON.stringify(r)}`);
    await shot(p2, 'pn-phone-hatch');
    // turned sideways: the card sits beside the pet
    await p2.click('.ph-ok');
    await p2.waitForSelector('.pet-hatch', { state: 'detached', timeout: 10000 });
    await p2.setViewportSize({ width: 844, height: 390 });
    await stepFrames(p2, 2);
    await hatchOne(p2);
    const l = await p2.evaluate(() => {
      const box = (s) => document.querySelector(s)?.getBoundingClientRect();
      const i = box('.ph-name-input'), ok = box('.ph-ok');
      return { i: i && { t: i.top, b: i.bottom, l: i.left, r: i.right }, ok: ok && { t: ok.top, b: ok.bottom }, w: innerWidth, h: innerHeight };
    });
    check(!!l.i && l.i.l >= 0 && l.i.r <= l.w && l.i.t >= 0 && l.ok.b <= l.h && l.i.b <= l.ok.t, `phone sideways: the name box and OK fit ${JSON.stringify(l)}`);
    await shot(p2, 'pn-phone-landscape');
    check(e2.length === 0, `phone: no console errors${e2.length ? ': ' + e2.slice(0, 3).join(' | ') : ''}`);
  } finally {
    await b2.close();
  }
}

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
