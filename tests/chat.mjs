// Browser checks for typed chat: Enter opens the panel with the cursor in the box, typing never moves the
// player, Enter sends (the family answers, bubbles over the speakers), a rude line is refused with a note,
// Esc closes without pausing; on a phone the chat button opens it at the top, and it still fits once the
// on-screen keyboard takes half the screen.
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
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- phone: chat button, panel at the top
{
  const { browser: b2, page: p2, errors: e2 } = await launch({ mobile: true });
  try {
    await setup(p2, 'esther');
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
    check(e2.length === 0, `phone: no console errors${e2.length ? ': ' + e2.slice(0, 3).join(' | ') : ''}`);
  } finally {
    await b2.close();
  }
}

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
