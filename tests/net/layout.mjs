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
} catch (e) {
  console.error(e);
  failed++;
}
const real = errors.filter((e) => !/favicon/.test(e));
console.log(real.length ? 'FAIL console errors: ' + real.slice(0, 5).join(' | ') : 'PASS no console errors');
await browser.close();
server.close();
process.exit(failed || real.length ? 1 : 0);
