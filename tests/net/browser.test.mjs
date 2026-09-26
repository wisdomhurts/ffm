// Two real game pages in one browser, talking over BroadcastChannel (?net=local):
// page A makes a private room from the lobby, page B joins with the code typed into the lobby,
// B walks with the keyboard and A sees it; the room chip, members and screenshots are checked.
// Usage: node tests/net/build-patched.mjs --out <dir> && DIST_DIR=<dir> OUT_DIR=<dir> node tests/net/browser.test.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, shot, sleep, DIST } from '../harness.mjs';

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};

// a tiny static server: BroadcastChannel needs a real (same) origin, file:// pages don't share one
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const f = path.join(DIST, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '') || 'index.html');
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html?net=local`;

const { browser, context, page: A, errors } = await launch({ width: 720, height: 450 });
const B = await context.newPage();
B.on('console', (m) => m.type() === 'error' && errors.push('B: ' + m.text()));
B.on('pageerror', (e) => errors.push('B pageerror: ' + e.message));

const frames = (p, n, dt = 1 / 30) => p.evaluate(([n, dt]) => {
  for (let i = 0; i < n; i++) window.__app.engine.frame(dt);
  const gl = window.__app.engine.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}, [n, dt]);
// both devices run their frames in turns so messages flow between them
async function both(sec, batch = 2) {
  const n = Math.round(sec * 30 / batch);
  for (let i = 0; i < n; i++) {
    await frames(A, batch);
    await frames(B, batch);
  }
}
const info = (p) => p.evaluate(() => {
  const a = window.__app;
  const o = a.online;
  const g = a.game;
  return {
    state: a.state, room: o.room && { ...o.room }, isHost: o.isHost, isClient: o.isClient, pid: o.pid, slot: o.mySlot, members: o.members.map((m) => m.name),
    players: g.players.map((p) => ({ kind: p.kind, name: p.name, pid: p.pid, x: p.pos.x, z: p.pos.z })), time: g.time,
  };
});

try {
  await Promise.all([A.goto(base, { timeout: 300000 }), B.goto(base, { timeout: 300000 })]);
  await A.waitForFunction(() => window.__app?.game, null, { timeout: 300000 });
  await B.waitForFunction(() => window.__app?.game, null, { timeout: 300000 });
  for (const p of [A, B]) await p.evaluate(() => window.__app.engine.stop());
  check(await A.evaluate(() => window.__app.online.available && window.__app.online.kind === 'local'), 'online is available with ?net=local');
  await B.evaluate(() => window.__app.setProfile('esther'));

  // ---- A: Play Online -> Private room (through the lobby UI)
  await A.evaluate(() => window.__app.setProfile('dorian'));
  await A.click('.btn-online', { timeout: 60000 });
  await frames(A, 2);
  check(await A.isVisible('.lobby'), 'the Play Online lobby opens');
  await A.click('.lobby .lb-mk.btn-purple');
  await A.waitForFunction(() => window.__app.online.room && window.__app.state === 'playing', null, { timeout: 60000 });
  await frames(A, 4);
  let a = await info(A);
  const code = a.room.code;
  check(a.isHost && a.room.private && /^[A-Z]{5}$/.test(code), `A hosts private room ${code}`);
  check(await A.evaluate(() => !!document.querySelector('.hud-slot-room .room-chip')), 'room chip is on the HUD (under the leaderboard)');
  check((await A.textContent('.room-chip .rc-t b')) === code, 'the chip shows the room code');

  // ---- B: lobby -> type the code -> Join
  await B.click('.btn-online', { timeout: 60000 });
  await frames(B, 2);
  await B.fill('.lobby .lb-code', code.toLowerCase());
  await frames(B, 1);
  await shot(B, 'net-01-lobby');
  await B.click('.lobby .lb-join .btn');
  await B.waitForFunction(() => window.__app.online.isClient && window.__app.state === 'playing', null, { timeout: 60000 });
  await both(1.5);
  let b = await info(B);
  a = await info(A);
  check(b.isClient && b.room.code === code && b.slot === 1, `B joined as Esther's garden (slot ${b.slot})`);
  check(b.room.faceOk === true && b.room.private, 'B typed the code of an unlisted private room: faces may be shared there');
  check(/^k[0-9a-f]{15}$/.test(a.pid) && /^k[0-9a-f]{15}$/.test(b.pid), 'both devices have key-hash ids: ' + a.pid + ' ' + b.pid);
  check(a.players[1].kind === 'remote' && a.players[1].name === 'Esther', 'A sees Esther as a remote player');
  check(b.players[0].kind === 'remote' && b.players[0].name === 'Dorian', 'B sees Dorian as a remote player');
  check(a.members.length === 2 && b.members.length === 2, 'both member lists have 2 people');

  // ---- B walks (keyboard, local movement); A sees it
  const start = b.players[1];
  await B.bringToFront();
  await B.keyboard.down('KeyW');
  await both(1.2);
  await B.keyboard.up('KeyW');
  await both(0.8);
  b = await info(B);
  a = await info(A);
  const moved = Math.hypot(b.players[1].x - start.x, b.players[1].z - start.z);
  const gap = Math.hypot(b.players[1].x - a.players[1].x, b.players[1].z - a.players[1].z);
  check(moved > 4, `B walked ${moved.toFixed(1)} studs on its own device`);
  check(gap < 0.5, `A sees B where B is (${gap.toFixed(2)} studs apart)`);
  check(Math.abs(a.time - b.time) < 0.5, `clocks agree (A ${a.time.toFixed(2)}, B ${b.time.toFixed(2)})`);

  // ---- look at it: A's camera near B, the member list open
  await A.evaluate(() => document.querySelector('.room-chip .rc-bar').click());
  await frames(A, 3);
  await shot(A, 'net-02-host');
  await frames(B, 3);
  await shot(B, 'net-03-client');

  // ---- quick chat from B shows on A (chat lines only stay 9 real seconds: record them as they come)
  await A.evaluate(() => {
    window.__heard = [];
    window.__app.bus.on('chat', (e) => window.__heard.push(e.player.name + ': ' + e.text));
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.chat .cl')) window.__heard.push('hud ' + el.textContent);
    }).observe(document.querySelector('.chat'), { childList: true });
  });
  await B.evaluate(() => window.__app.act('say', 'hi'));
  await both(0.6);
  const heard = await A.evaluate(() => window.__heard.join(' | '));
  check(/^Esther: Hi!/.test(heard) && /hud Esther: Hi!/.test(heard), 'A hears B\'s quick chat (bus + HUD line): ' + heard);
  check(await A.isVisible('.room-chip'), 'the room chip is visible once the intro is over');

  // ---- B leaves: A's slot goes back to a bot
  await B.evaluate(() => window.__app.quitToTitle());
  await both(0.6);
  a = await info(A);
  check(a.players[1].kind === 'bot' && a.members.length === 1, 'B left: slot 1 is a bot again on A');
  b = await info(B);
  check(!b.room && b.state === 'title', 'B is back on the title screen');
} catch (e) {
  console.error(e);
  failed++;
}
const real = errors.filter((e) => !/favicon|net::ERR/.test(e));
check(real.length === 0, 'no console errors' + (real.length ? ': ' + real.slice(0, 5).join(' | ') : ''));
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
