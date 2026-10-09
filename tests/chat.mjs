// Browser checks for typed chat: Enter opens the panel with the cursor in the box, typing never moves the
// player, Enter sends (the family answers, bubbles over the speakers), a rude line is refused with a note,
// Esc closes without pausing; switching typed chat off hides typed lines already in the log; Enter over a pet
// hatch or the Family Four celebration is theirs; Settings asks a grown-up question before typed chat in public
// rooms goes on. On a phone the chat button opens it at the top (also as a second finger while the thumb is
// on the joystick), it still fits once the on-screen keyboard takes half the screen, and it steps clear of the
// Simple HUD's Sell coin.
// Run: DIST_DIR=<build> OUT_DIR=<dir> node tests/chat.mjs
import { launch, openGame, startMatch, manualFrames, stepFrames, fastForward, shot, sleep } from './harness.mjs';

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

// skip the intro swoop and gather the family in front of the camera
async function setup(page, charId) {
  await openGame(page, 'index.html');
  await startMatch(page, charId, 'endless', 'normal');
  await manualFrames(page);
  await page.evaluate(() => {
    const a = window.__app;
    if (a.cam) {
      a.cam.introDur = 0;
      a.cam.introT = 1;
    }
    const g = a.game;
    Object.assign(g.human.pos, { x: 0, y: 0, z: 10 });
    g.human.yaw = 0;
    g.players.filter((p) => p !== g.human).forEach((b, i) => {
      Object.assign(b.pos, { x: -6 + i * 6, y: 0, z: 1 });
      b.yaw = 0;
    });
  });
  await stepFrames(page, 3);
}

const { browser, page, errors } = await launch({ width: 1280, height: 720 });
try {
  await setup(page, 'maddie');
  await page.keyboard.press('Enter');
  await stepFrames(page, 1);
  let st = await page.evaluate(() => ({ open: !!document.querySelector('.chat-panel:not(.out)'), focus: document.activeElement?.classList.contains('cp-in'), state: window.__app.state }));
  check(st.open && st.focus, 'Enter opens the chat panel with the cursor in the box');
  const pos0 = await page.evaluate(() => ({ ...window.__app.game.human.pos }));
  await page.keyboard.type('hi mom, wow so fast!', { delay: 5 });
  await stepFrames(page, 4);
  const pos1 = await page.evaluate(() => ({ ...window.__app.game.human.pos }));
  check(Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z) < 0.01 && pos1.y < 0.01, 'typing W, A, S and Space never moves the player');
  await page.keyboard.press('Enter');
  await stepFrames(page, 1);
  st = await page.evaluate(() => {
    const a = window.__app;
    return { open: !!document.querySelector('.chat-panel:not(.out)'), bubble: [...a.labels.items.keys()].includes('bubble' + a.game.human.slot), state: a.state };
  });
  check(!st.open && st.bubble && st.state === 'playing', 'Enter sends, closes the panel and shows a bubble over me');
  // the family answers (game time only, then a couple of drawn frames)
  await fastForward(page, 2.5);
  // (they walk on after answering: bring them back into the picture for the screenshot)
  await page.evaluate(() => {
    const g = window.__app.game;
    g.players.filter((p) => p !== g.human).forEach((b, i) => Object.assign(b.pos, { x: -8 + i * 8, y: 0, z: 3 }));
  });
  await stepFrames(page, 2);
  await shot(page, 'chat-bubbles');
  // a rude line is refused, with a note
  await page.keyboard.press('Enter');
  await stepFrames(page, 1);
  await page.keyboard.type('you are stupid');
  await page.keyboard.press('Enter');
  await stepFrames(page, 1);
  st = await page.evaluate(() => ({
    open: !!document.querySelector('.chat-panel:not(.out)'), note: document.querySelector('.cp-note')?.textContent, left: document.querySelector('.cp-in')?.value,
    log: [...document.querySelectorAll('.cp-l')].map((l) => l.textContent),
  }));
  check(st.open && /friendly/i.test(st.note) && st.left === 'you are stupid', `a rude line is refused with a friendly note ("${st.note}")`);
  check(st.log.some((l) => /hi mom/.test(l)) && st.log.some((l) => /^Esther/.test(l)), 'the log has my line and Mom\'s answer: ' + st.log.join(' / '));
  await page.fill('.cp-in', 'Race you to the end!');
  await shot(page, 'chat-desktop');
  await page.keyboard.press('Escape');
  await stepFrames(page, 1);
  st = await page.evaluate(() => ({ open: !!document.querySelector('.chat-panel:not(.out)'), state: window.__app.state }));
  check(!st.open && st.state === 'playing', `Esc closes the panel and does not pause the game (${JSON.stringify(st)})`);

  // switching typed chat off hides typed lines already in the log (the family's answers stay); on brings them back
  const isOpen = () => page.evaluate(() => !!document.querySelector('.chat-panel:not(.out)'));
  const logLines = () => page.evaluate(() => [...document.querySelectorAll('.cp-l')].map((l) => l.textContent));
  const chatOn = (on) => page.evaluate((on) => {
    const a = window.__app;
    a.settings.chatOn = on;
    a.bus.emit('settings:changed', { key: 'chatOn', value: on });
  }, on);
  await page.keyboard.press('Enter');
  await stepFrames(page, 1);
  await chatOn(false);
  let lines = await logLines();
  check(!lines.some((l) => /hi mom/.test(l)) && lines.some((l) => /^Esther/.test(l)), 'typed chat off: my typed line leaves the log, answers stay: ' + lines.join(' / '));
  await chatOn(true);
  lines = await logLines();
  check(lines.some((l) => /hi mom/.test(l)), 'typed chat back on: the line is back');
  await page.keyboard.press('Escape');
  await stepFrames(page, 1);

  // Enter over a pet hatch or the Family Four celebration belongs to their buttons, not to the chat
  await page.evaluate(() => document.body.appendChild(Object.assign(document.createElement('div'), { className: 'pet-hatch test-hatch' })));
  await page.keyboard.press('Enter');
  await stepFrames(page, 1);
  check(!(await isOpen()), 'Enter during a pet hatch does not open the chat');
  await page.evaluate(() => document.querySelector('.test-hatch').remove());
  await page.evaluate(() => {
    for (const id of ['maddiemarigold', 'estherlotus', 'dorianfruit', 'micahmelon']) window.__app.progress.stamp(id, 'normal');
  });
  await page.waitForSelector('.pg-cel', { timeout: 8000 });
  await sleep(300);
  await page.keyboard.press('Enter'); // hurries the celebration along to its card
  await sleep(500);
  st = await page.evaluate(() => ({ cel: !!document.querySelector('.pg-cel'), card: !!document.querySelector('.pg-cel.pgc-done') }));
  check(!(await isOpen()) && st.cel, `Enter during the celebration goes to it, not to the chat ${JSON.stringify(st)}`);
  await sleep(400);
  await page.evaluate(() => document.querySelector('.pgc-ok')?.focus());
  await page.keyboard.press('Enter');
  await sleep(500);
  st = await page.evaluate(() => ({ cel: !!document.querySelector('.pg-cel'), state: window.__app.state }));
  check(!(await isOpen()) && !st.cel && st.state === 'playing', `Enter presses Awesome! and the chat stays shut ${JSON.stringify(st)}`);

  // Settings > Chat: typed chat in public rooms goes ON only after a grown-up question; OFF needs none
  await page.evaluate(() => window.__app.menus.openSettings());
  await sleep(300);
  const sw = '.switch[aria-label="Typed chat in public rooms"]';
  const gate = () => page.evaluate((sw) => ({
    up: !!document.querySelector('.modal-panel.grown-up'), q: document.querySelector('.gu-q span')?.textContent || '',
    pub: window.__app.settings.chatPublic, on: document.querySelector(sw).classList.contains('on'),
  }), sw);
  await page.click(sw);
  await sleep(300);
  let gu = await gate();
  check(gu.up && /^\d+ [×+] \d+ =$/.test(gu.q) && !gu.pub, `switching it on asks a grown-up question first ("${gu.q}")`);
  await shot(page, 'chat-grownup');
  await page.fill('.gu-in', '7');
  await page.click('.gu-btns .btn-green');
  await sleep(300);
  gu = await gate();
  check(!gu.up && !gu.pub && !gu.on, 'a wrong answer leaves it off');
  await page.click(sw);
  await sleep(300);
  await page.click('.gu-btns .btn-grey');
  await sleep(300);
  gu = await gate();
  check(!gu.up && !gu.pub && !gu.on, 'Cancel leaves it off');
  await page.click(sw);
  await sleep(300);
  gu = await gate();
  const [qa, op, qb] = gu.q.split(' ');
  await page.fill('.gu-in', String(op === '×' ? qa * qb : +qa + +qb));
  await page.keyboard.press('Enter');
  await sleep(300);
  gu = await gate();
  check(!gu.up && gu.pub && gu.on, 'the right answer (Enter) switches it on');
  await page.click(sw);
  await sleep(300);
  gu = await gate();
  check(!gu.up && !gu.pub && !gu.on, 'switching it off needs no question');
  await page.keyboard.press('Escape');
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- phone: chat button, panel at the top
{
  const { browser: b2, page: p2, errors: e2 } = await launch({ mobile: true });
  try {
    await setup(p2, 'esther');
    // a second finger on the chat button while the thumb holds the joystick (no click comes for a second finger)
    const c = await p2.evaluate(() => {
      const r = document.querySelector('.chat-tbtn').getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    const cdp = await p2.context().newCDPSession(p2);
    const thumb = { x: 80, y: 700, id: 1 };
    const moved = { ...thumb, x: 104 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moved, { x: c.x, y: c.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); // (CDP lifts both together)
    await stepFrames(p2, 1);
    const twoFinger = await p2.evaluate(() => !!document.querySelector('.chat-panel:not(.out)'));
    check(twoFinger, 'phone: a second finger on the chat button opens it while the thumb is on the joystick');
    await p2.evaluate(() => document.querySelector('.cp-x')?.click());
    await stepFrames(p2, 1);
    await p2.tap('.chat-tbtn');
    await stepFrames(p2, 1);
    await p2.evaluate(() => window.__app.act('chat', 'Hi Mom! Love this garden'));
    await p2.evaluate(() => window.__app.game.update(1 / 30));
    await fastForward(p2, 2.5);
    await stepFrames(p2, 2);
    const box = () => p2.evaluate(() => {
      const r = (s) => {
        const b = document.querySelector(s)?.getBoundingClientRect();
        return b && { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) };
      };
      return { panel: r('.chat-panel'), input: r('.cp-in'), quick: r('.cp-quick'), w: innerWidth, h: innerHeight, vh: window.visualViewport?.height };
    });
    let r = await box();
    check(!!r.panel && r.input.t < 160 && r.panel.l >= 0 && r.panel.r <= r.w, `phone: the panel opens at the top, input first ${JSON.stringify(r.input)}`);
    await shot(p2, 'chat-phone');
    // the on-screen keyboard leaves ~half the screen (visual viewport): everything still fits above it
    await p2.setViewportSize({ width: 390, height: 430 });
    await sleep(100);
    await stepFrames(p2, 2);
    r = await box();
    check(r.input.b <= r.h && r.quick.b <= r.h && r.panel.b <= r.h, `phone + keyboard: input and quick chat stay visible ${JSON.stringify(r)}`);
    await shot(p2, 'chat-phone-keyboard');

    // Simple HUD (a small portrait phone): by a grown plant the gold Sell coin comes out right under the chat
    // button, and the button steps up clear of it
    await p2.setViewportSize({ width: 375, height: 667 });
    await p2.evaluate(() => document.querySelector('.cp-x')?.click());
    await p2.evaluate(() => {
      const a = window.__app;
      a.settings.hudLayout = 'simple';
      a.bus.emit('settings:changed', { key: 'hudLayout', value: 'simple' });
      const g = a.game;
      const me = g.human;
      const pl = g.gardens[me.slot].planters[0];
      pl.unlocked = true;
      pl.plant = { uid: 778001, speciesId: 'daisy', mutation: 'normal', growTotal: 10, growLeft: 0, owner: me.slot };
      Object.assign(me.pos, { x: pl.x + 1.5, y: 0, z: pl.z });
    });
    await stepFrames(p2, 2);
    await sleep(250);
    await stepFrames(p2, 2);
    const ov = await p2.evaluate(() => {
      const r = (s) => {
        const b = document.querySelector(s)?.getBoundingClientRect();
        return b && [b.left, b.top, b.right, b.bottom].map(Math.round);
      };
      const coin = r('.tb-sell.show');
      const chat = r('.chat-tbtn');
      const hit = !!coin && !!chat && coin[0] < chat[2] && chat[0] < coin[2] && coin[1] < chat[3] && chat[1] < coin[3];
      return { simple: document.documentElement.classList.contains('hud-simple'), coin, chat, hit };
    });
    check(ov.simple && !!ov.coin && !ov.hit && ov.chat[1] >= 0, `Simple HUD: the chat button clears the Sell coin ${JSON.stringify(ov)}`);
    await shot(p2, 'chat-phone-sell');
    check(e2.length === 0, `phone: no console errors${e2.length ? ': ' + e2.slice(0, 3).join(' | ') : ''}`);
  } finally {
    await b2.close();
  }
}

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
