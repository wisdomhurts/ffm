// Smoke test: boots the game, starts a match, runs the core loop via the real rules, checks for errors.
import { launch, openGame, shot, startMatch, state, teleport, fastForward, hold, sleep } from './harness.mjs';

const { browser, page, errors } = await launch();
let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};
try {
  await openGame(page);
  await sleep(1500);
  await shot(page, 'smoke-01-title');
  await startMatch(page, 'dorian');
  let s = await state(page);
  check(s.appState === 'playing', 'match starts');
  await hold(page, ['KeyD'], 700);
  await sleep(300);
  await shot(page, 'smoke-02-play');
  // go grab a seed from the first pod
  const pod = await page.evaluate(() => { const p = window.__app.game.pods.find((q) => q.seed && q.biome === 0); return { x: p.x, z: p.z }; });
  await teleport(page, pod.x * 0.85, pod.z - 2);
  await sleep(200);
  s = await state(page);
  check(!!s.human.interact.key, 'grab prompt appears near a pod: ' + s.human.interact.label);
  await hold(page, ['KeyE'], 500);
  s = await state(page);
  check(s.human.carrying?.kind === 'seed', 'picked up a seed');
  await shot(page, 'smoke-03-carry');
  // walk it home
  const home = await page.evaluate(() => window.__app.game.layout.gardens[window.__app.game.human.slot].inside);
  await teleport(page, home.x, home.z);
  await sleep(300);
  s = await state(page);
  check(!s.human.carrying && s.gardens[0].plants >= 1, 'seed auto-planted at home');
  await fastForward(page, 40);
  await sleep(300);
  s = await state(page);
  check(s.gardens[0].pile > 0, 'grown plant produced cash: ' + s.gardens[0].pile);
  await shot(page, 'smoke-04-garden');
  await fastForward(page, 60);
  s = await state(page);
  check(s.players.some((p) => !p.id.includes('dorian') && p.planted > 0), 'bots planted something: ' + JSON.stringify(s.players.map((p) => p.planted)));
  check(s.fps > 5, 'fps ' + s.fps.toFixed(1));
} catch (e) {
  console.error(e);
  failed++;
}
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
process.exit(failed ? 1 : 0);
