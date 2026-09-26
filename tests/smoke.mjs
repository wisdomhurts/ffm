// Smoke test: boots the game, starts a match, runs the core loop through the real rules, checks for errors.
// Frames are stepped by hand (see manualFrames/stepFrames) so results don't depend on machine speed.
import { launch, openGame, shot, startMatch, state, teleport, fastForward, manualFrames, stepFrames } from './harness.mjs';

const { browser, page, errors } = await launch();
let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};
try {
  await openGame(page);
  await manualFrames(page);
  await stepFrames(page, 20);
  await shot(page, 'smoke-01-title');
  await startMatch(page, 'dorian');
  await manualFrames(page);
  let s = await state(page);
  check(s.appState === 'playing', 'match starts');
  await page.keyboard.down('KeyD');
  await stepFrames(page, 20);
  await page.keyboard.up('KeyD');
  await stepFrames(page, 60);
  await shot(page, 'smoke-02-play');
  // go grab a seed from the first pod
  const pod = await page.evaluate(() => { const p = window.__app.game.pods.find((q) => q.seed && q.biome === 0); return { x: p.x, z: p.z }; });
  await teleport(page, pod.x * 0.85, pod.z - 2);
  await stepFrames(page, 3);
  s = await state(page);
  check(!!s.human.interact.key, 'grab prompt appears near a pod: ' + s.human.interact.label);
  await page.keyboard.down('KeyE');
  await stepFrames(page, 12);
  await page.keyboard.up('KeyE');
  await stepFrames(page, 1);
  s = await state(page);
  check(s.human.carrying?.kind === 'seed', 'picked up a seed');
  await shot(page, 'smoke-03-carry');
  // walk it home
  const home = await page.evaluate(() => window.__app.game.layout.gardens[window.__app.game.human.slot].inside);
  await teleport(page, home.x, home.z);
  await stepFrames(page, 4);
  s = await state(page);
  check(!s.human.carrying && s.gardens[0].plants >= 1, 'seed auto-planted at home');
  await fastForward(page, 40);
  await stepFrames(page, 3);
  s = await state(page);
  check(s.gardens[0].pile > 0, 'grown plant produced cash: ' + s.gardens[0].pile);
  await shot(page, 'smoke-04-garden');
  await fastForward(page, 60);
  await stepFrames(page, 3);
  s = await state(page);
  check(s.players.some((p) => p.id !== 'dorian' && p.planted > 0), 'bots planted something: ' + JSON.stringify(s.players.map((p) => p.planted)));
  const t0 = Date.now();
  await stepFrames(page, 10);
  const ms = (Date.now() - t0) / 10;
  console.log(`INFO frame time under SwiftShader: ${ms.toFixed(0)} ms`);
} catch (e) {
  console.error(e);
  failed++;
}
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
process.exit(failed ? 1 : 0);
