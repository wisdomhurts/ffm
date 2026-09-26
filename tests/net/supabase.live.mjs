// Live check of the Supabase Realtime transport (needs the project URL + publishable key and network):
//   SAS_URL=https://<ref>.supabase.co SAS_KEY=sb_publishable_... node tests/net/supabase.live.mjs
// Two sessions in this process make a room and join it over the real service, then trade a few ticks.
import { StubApp, MemoryHub } from './stub.mjs';
import { createTransport } from '../../src/net/transport.js';
import { createOnline } from '../../src/net/session.js';

const url = process.env.SAS_URL, key = process.env.SAS_KEY;
if (!url || !key) {
  console.log('SKIP set SAS_URL and SAS_KEY to run the live Supabase check');
  process.exit(0);
}
let failed = 0;
const check = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) failed++;
};
const mk = (name, base) => {
  const a = new StubApp(name, { hub: new MemoryHub(), base });
  a.transport = createTransport('supabase', { url, key });
  a.online = createOnline(a, { transport: a.transport });
  return a;
};
const A = mk('LiveHost', 'dorian');
const B = mk('LiveGuest', 'esther');
try {
  const code = await A.online.createRoom({ private: true });
  check(!!code, 'host made room ' + code);
  const ok = await B.online.joinRoom(code);
  check(ok, 'guest joined over Supabase');
  for (let i = 0; i < 60; i++) {
    A.frame(1 / 30);
    B.frame(1 / 30);
    await new Promise((r) => setTimeout(r, 33));
  }
  check(B.online.isClient && B.game.players[0].name === 'LiveHost', 'guest mirrors the host world');
  check(Math.abs(A.game.time - B.game.time) < 1, `clocks agree (${A.game.time.toFixed(2)} / ${B.game.time.toFixed(2)})`);
} catch (e) {
  console.error(e);
  failed++;
}
A.online.leave();
B.online.leave();
A.transport.close();
B.transport.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
