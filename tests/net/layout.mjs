// Phone layout check for the online UI: lobby, then a private room with the room chip open.
// Usage: DIST_DIR=<patched build> OUT_DIR=<dir> node tests/net/layout.mjs   (screenshots only; look at them)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, shot, DIST } from '../harness.mjs';

const server = http.createServer((req, res) => {
  const f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { browser, page, errors } = await launch({ mobile: true });
let failed = 0;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?net=local`, { timeout: 300000 });
  await page.waitForFunction(() => window.__app?.game, null, { timeout: 300000 });
  await page.evaluate(() => window.__app.engine.stop());
  await page.evaluate(() => window.__app.setProfile('maddie'));
  await page.evaluate(() => document.querySelector('.btn-online').click());
  await page.evaluate(() => window.__app.engine.frame(1 / 30));
  await shot(page, 'net-10-lobby-phone');
  await page.evaluate(() => document.querySelector('.lobby .lb-mk.btn-purple').click());
  await page.waitForFunction(() => window.__app.online.room && window.__app.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    for (let i = 0; i < 75; i++) window.__app.engine.frame(1 / 30);
    document.querySelector('.room-chip .rc-bar').click();
    window.__app.engine.frame(1 / 30);
  });
  await shot(page, 'net-11-room-phone');
  // an unreachable server: the lobby says so (no "LIVE"), offers Try again, and stops dialing when closed
  const dead = await browser.newContext({ viewport: { width: 720, height: 450 } });
  await dead.addInitScript(() => {
    window.__SAS_ONLINE__ = { url: 'http://127.0.0.1:9', key: 'x' };
    window.__ws = 0;
    const W = window.WebSocket;
    window.WebSocket = function (...a) {
      window.__ws++;
      return new W(...a);
    };
    window.WebSocket.prototype = W.prototype;
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  const D = await dead.newPage();
  await D.goto(`http://127.0.0.1:${server.address().port}/index.html`, { timeout: 300000 });
  await D.waitForFunction(() => window.__app?.game, null, { timeout: 300000 });
  await D.evaluate(() => window.__app.engine.stop());
  await D.evaluate(() => document.querySelector('.btn-online').click());
  await D.waitForFunction(() => /server|offline/i.test(document.querySelector('.lobby .lb-rooms')?.textContent || ''), null, { timeout: 60000 });
  const txt = await D.evaluate(() => document.querySelector('.lobby .lb-sec .live').textContent + ' | ' + document.querySelector('.lobby .lb-rooms').textContent);
  console.log((/no connection/.test(txt) && /Try again/.test(txt) ? 'PASS' : 'FAIL') + ' dead server: the lobby says so: ' + txt);
  if (!/no connection/.test(txt)) failed++;
  await D.bringToFront();
  await new Promise((r) => setTimeout(r, 800)); // let the modal's fade-in finish
  await D.evaluate(() => window.__app.engine.frame(1 / 30));
  await shot(D, 'net-12-lobby-noserver');
  await D.evaluate(() => document.querySelector('.modal-x').click());
  const n0 = await D.evaluate(() => window.__ws);
  await new Promise((r) => setTimeout(r, 8000));
  const n1 = await D.evaluate(() => window.__ws);
  console.log((n1 === n0 ? 'PASS' : 'FAIL') + ` lobby closed: no more connection attempts (${n0} -> ${n1} in 8 s)`);
  if (n1 !== n0) failed++;
  await dead.close();
} catch (e) {
  console.error(e);
  failed++;
}
const real = errors.filter((e) => !/favicon/.test(e));
console.log(real.length ? 'FAIL console errors: ' + real.slice(0, 5).join(' | ') : 'PASS no console errors');
await browser.close();
server.close();
process.exit(failed || real.length ? 1 : 0);
