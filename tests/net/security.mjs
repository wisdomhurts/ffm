// Security + regression scenarios for online rooms (run from room.test.mjs). A fresh room: Alice hosts,
// Bob is a normal member, Mallory is a member with a modified client who hand-writes messages (sealed with
// her own keys, raw, or replays of other people's messages) on every channel she can reach.
import nodeCrypto from 'node:crypto';
import { StubApp, MemoryHub } from './stub.mjs';
import { bus } from '../../src/core/events.js';
import { LAYOUT } from '../../src/gameplay/layout.js';
import { PLANTS } from '../../src/config.js';
import { roomTopic, upTopic, vetFull, vetSlotData, isBotLine, sanitizePet, sanitizeLook } from '../../src/net/protocol.js';
import { sha256, hmac, hkdf, b64 } from '../../src/net/crypto.js';
import { familyFaceData } from '../../src/characters/faces.js';

export async function securitySuite(check) {
  // ---------------------------------------------------------------- crypto building blocks
  let ok = true;
  for (const n of [0, 3, 55, 56, 64, 65, 1000, 20000]) {
    const buf = nodeCrypto.randomBytes(n), key = nodeCrypto.randomBytes((n % 90) + 1);
    ok &&= Buffer.from(sha256(buf)).toString('hex') === nodeCrypto.createHash('sha256').update(buf).digest('hex');
    ok &&= Buffer.from(hmac(key, buf)).toString('hex') === nodeCrypto.createHmac('sha256', key).update(buf).digest('hex');
    ok &&= b64(buf) === buf.toString('base64url');
  }
  const ikm = nodeCrypto.randomBytes(32);
  ok &&= Buffer.from(hkdf(ikm, Buffer.from('s'), Buffer.from('i'))).equals(Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, 's', 'i', 32)));
  check(ok, 'SHA-256 / HMAC / HKDF / base64url match node:crypto');
  let t0 = performance.now();
  const key = nodeCrypto.randomBytes(32);
  const kb = new Uint8Array(1000);
  for (let i = 0; i < 1000; i++) hmac(key, sha256(kb));
  console.log(`INFO sealing a 1 KB message: ${((performance.now() - t0) * 1000 / 1000).toFixed(0)} us (desktop Node)`);

  // ---------------------------------------------------------------- a room with an attacker in it
  const hub = new MemoryHub();
  const A = new StubApp('Alice', { hub, base: 'dorian' });
  const B = new StubApp('Bob', { hub, base: 'esther' });
  const M = new StubApp('Mallory', { hub, base: 'maddie' });
  const apps = [A, B, M];
  const live = new Set(apps);
  const step = async (sec, dt = 1 / 30) => {
    for (let i = 0, n = Math.max(1, Math.round(sec / dt)); i < n; i++) {
      for (const a of apps) if (live.has(a)) a.frame(dt);
      hub.advance(dt);
      await new Promise((r) => setImmediate(r));
    }
  };
  const code = await A.online.createRoom({ private: false });
  await B.online.joinRoom(code);
  await M.online.joinRoom(code);
  hub.latency = 0.04;
  await step(1);
  const sB = B.online.mySlot, sM = M.online.mySlot;
  const bob = () => A.game.players[sB];
  const bobDev = () => B.game.players[sB];
  const hostPid = A.online.pid;
  // everything Mallory can do from her browser console: any topic, any event, raw or sealed with her keys
  const chans = new Map();
  async function raw(topic, event, payload) {
    let ch = chans.get(topic);
    if (!ch) {
      ch = M.transport.channel(topic, { presence: false });
      chans.set(topic, ch);
      await ch.subscribe();
    }
    ch.send(event, payload);
  }
  const sealed = (event, payload, to) => M.online.seal(event, payload, to);
  // capture Bob's genuine sealed inputs (to replay them later)
  const captured = [];
  hub.log = (event, payload, topic) => {
    if (topic === upTopic(code, B.online.pid) && event === 'in' && payload?.f === B.online.pid) captured.push(JSON.parse(JSON.stringify(payload)));
  };

  // host-only messages, in every form
  const bobPos0 = { ...bobDev().pos };
  for (const [event, payload] of [
    ['kicked', { to: B.online.pid }],
    ['reject', { to: B.online.pid, reason: 'closed' }],
    ['kick', { to: B.online.pid, k: 2e9, p: [0, 25, 690], v: [0, 0, 0], su: 2e9, iu: 0 }],
    ['welcome', { to: B.online.pid, slot: sB, ep: 999, order: [M.online.pid], priv: false, st: M.game.serializeFull() }],
    ['bye', { next: M.online.pid, ep: 1 }],
  ]) {
    await raw(roomTopic(code), event, payload); // raw on the room channel
    await raw(upTopic(code, B.online.pid), event, payload); // raw on Bob's uplink
    await raw(roomTopic(code), event, sealed(event, payload, B.online.pid)); // sealed by Mallory
    await raw(upTopic(code, B.online.pid), event, sealed(event, payload, B.online.pid));
    await raw(roomTopic(code), event, { ...sealed(event, payload, B.online.pid), f: hostPid }); // claims to be the host
  }
  // a whole fake world ("tick") from Mallory, with a higher epoch
  const fake = { ep: 999, s: 1, tm: 5, P: [], M: [], B: [], A: [0, 0, 0, 0], D: { g1: { planters: [] } } };
  await raw(roomTopic(code), 'tick', sealed('tick', fake, [B.online.pid, A.online.pid]));
  await step(0.8);
  check(!!B.online.room && B.online.room.hostPid === hostPid && B.online.isClient, 'forged host messages (kicked/reject/kick/welcome/bye/tick) do nothing to Bob');
  check(Math.hypot(bobDev().pos.x - bobPos0.x, bobDev().pos.z - bobPos0.z) < 2 && bobDev().stunUntil < 1e6, 'Bob was not teleported or frozen');
  check(A.online.isHost && A.game.players[sB].kind === 'remote', 'the host still has Bob');
  // a real knockback still works afterwards (forged kick counters didn't poison anything)
  const hp = A.human;
  Object.assign(hp.pos, { x: bob().pos.x, y: 0, z: bob().pos.z - 1.5 });
  hp.vel.x = hp.vel.z = 0;
  hp.yaw = 0;
  hp.bonkReadyAt = 0;
  await step(0.3);
  A.pad.press('bonk');
  await step(0.25);
  check(Math.hypot(bobDev().vel.x, bobDev().vel.z) > 5 || B.game.time < bobDev().stunUntil, 'a real bonk still reaches Bob');
  await step(1.5);

  // puppeting Bob through his uplink
  A.game.gardens[sB].planters[1].plant = { uid: 42042, speciesId: PLANTS[0].id, mutation: 'gold', growTotal: 10, growLeft: 0, owner: sB };
  await step(0.4);
  const cash0 = bob().cash;
  const target = LAYOUT.gardens[sM].inside;
  const actions = [[900001, 'a', ['addCash', [1e12]]], [900002, 'a', ['gift', [sM, 1]]], [900003, 'u', 0]];
  for (let i = 0; i < 6; i++) {
    const msg = { c: A.online.clock, p: [target.x, 0, target.z, 0, 0, 0, 0, 1], i: 1, ip: 99, sel: 2, e: actions, ka: 0 };
    await raw(upTopic(code, B.online.pid), 'in', msg); // raw
    await raw(upTopic(code, B.online.pid), 'in', sealed('in', msg, hostPid)); // sealed by Mallory
    await raw(upTopic(code, B.online.pid), 'in', { ...sealed('in', msg, hostPid), f: B.online.pid }); // claims to be Bob
    await step(0.1);
  }
  // replay Bob's own genuine messages
  for (const env of captured.slice(-10)) await raw(upTopic(code, B.online.pid), 'in', env);
  // tamper with one of them
  if (captured.length) {
    const t = captured[captured.length - 1];
    await raw(upTopic(code, B.online.pid), 'in', { ...t, d: t.d.replace(/"e":\[/, '"e":[[900009,"a",["gift",[' + sM + ',1]]],') });
  }
  await step(0.6);
  check(captured.length > 0, `captured ${captured.length} of Bob's real inputs to replay`);
  check(bob().cash <= cash0, 'nobody can spend or print money as Bob');
  check(A.game.gardens[sB].planters[1].plant?.uid === 42042 && !A.game.gardens[sM].planters.some((pl) => pl.plant?.uid === 42042), "nobody can gift Bob's plants away");
  check(Math.hypot(bob().pos.x - target.x, bob().pos.z - target.z) > 6, 'nobody can drive Bob around');
  check(bob().items.banana === 0, "nobody can use Bob's items");

  // addCash from members is refused by the host (quest cash is banked on the device)
  const mc0 = A.game.players[sM].cash;
  for (let i = 0; i < 5; i++) {
    M.act('addCash', 1e9);
    M.online.role._edge('a', ['addCash', [1e9]]); // even hand-queued
    await step(0.1);
  }
  await step(0.4);
  check(A.game.players[sM].cash === mc0, `addCash from a member is refused (${mc0} -> ${A.game.players[sM].cash})`);
  check(M.act('addCash', 5) === false, 'app.act addCash on a client says no right away');

  // bad catalog ids and poisoned gardens
  const st = A.game.serializeFull();
  st.gardens[0].planters[0].plant = { uid: 1, speciesId: 'toString', mutation: '__proto__', growTotal: 5, growLeft: 0, owner: 0 };
  st.pods[0].seed = { speciesId: 'constructor', mutation: 'normal' };
  st.ground.push({ uid: 5, kind: 'seed', speciesId: 'hasOwnProperty', x: 0, y: 0, z: 0 });
  st.players[1].carrying = { kind: 'plant', plant: { speciesId: 'valueOf' }, fromSlot: 0, fromIndex: 0 };
  st.players[2].pet = 'constructor';
  st.players[3].look = { hat: 'toString', hair: '__proto__' };
  const v = vetFull(JSON.parse(JSON.stringify(st)));
  check(v && !v.gardens[0].planters[0].plant && !v.pods[0].seed && !v.ground.some((g) => g.speciesId === 'hasOwnProperty') && !v.players[1].carrying &&
    v.players[2].pet === null && v.players[3].look.hat === null, 'prototype ids never pass as plants, seeds, pets or looks');
  const data = vetSlotData({ player: { cash: 1e30, speedLevel: 99, items: { banana: -5, balloon: 1e9 } }, garden: { cashPile: 'x', planters: [{ unlocked: true, plant: { speciesId: 'toString' } }, { unlocked: true, plant: { speciesId: PLANTS[0].id, growLeft: -9 } }] } });
  check(data.player.cash <= 1e13 && data.player.speedLevel === 25 && data.player.items.banana === 0 && data.player.items.balloon === 999 &&
    data.garden.planters[0].plant === null && data.garden.planters[1].plant?.growLeft === 0, "a joiner's garden is vetted before the host loads it");
  check(sanitizePet('toString') === null && sanitizeLook({ hat: 'constructor' }, 'maddie').hat === null, 'pets and looks: own catalog ids only');
  const lookKeys = Object.keys(sanitizeLook({ skin: '#ffffff', build: 'kid' }, 'esther')).join();
  check(lookKeys.startsWith('build,skin,hair'), 'remote looks come out in the Wardrobe key order: ' + lookKeys);

  // bot lines: the game's own lines (with player/plant names in them) get through, junk doesn't
  check(isBotLine('Hey there, Cool_Kid!') && isBotLine("I'll take that Rainbow Galaxy Orchid, Maddie.") &&
    isBotLine('Dad joke incoming: this garden is un-BE-LEAF-able.') && !isBotLine('you are stupid') && !isBotLine('<b>hi</b>'), 'bot lines: templates and names with _ pass, junk does not');

  // ---------------------------------------------------------------- faces only where the joiner KNOWS it's private
  const P = new StubApp('Gran', { hub, base: 'esther' });
  const K = new StubApp('Kiddo', { hub, base: 'micah' });
  apps.push(P, K);
  live.add(P);
  live.add(K);
  hub.latency = 0;
  const pcode = await P.online.createRoom({ private: true });
  check(await K.online.joinRoom(pcode, { typed: true }), 'Kiddo typed the private code');
  check(K.online.room.faceOk === true && P.online.room.faceOk === true, 'typed code of an unlisted private room: faces may be shared');
  // a new photo / removing it reaches the others (who cards are re-sent)
  const FACE1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ1=', FACE2 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ2=';
  const keyK = 'r_' + K.online.pid;
  await step(0.3);
  K.online.sendRoom('who', { ...K.online._who(null), face: FACE1 });
  await step(0.3);
  const f1 = familyFaceData(keyK)?.face;
  K.online.sendRoom('who', { ...K.online._who(null), face: FACE2 });
  await step(0.3);
  const f2 = familyFaceData(keyK)?.face;
  K.online.sendRoom('who', K.online._who(null));
  await step(1.5);
  check(f1 === FACE1 && f2 === FACE2 && !familyFaceData(keyK)?.face, 'a new photo replaces the old one, and taking it away removes it: ' + [f1 === FACE1, f2 === FACE2, familyFaceData(keyK)?.face?.slice(-6)]);
  K.online.leave();
  check(await K.online.joinRoom(pcode), 'joining the same room without typing (e.g. a link)');
  check(K.online.room.faceOk === false, '...never shares a face');
  K.online.leave();
  // a public room whose host claims "private" in its welcome
  const L = new StubApp('Liar', { hub, base: 'dorian' });
  apps.push(L);
  live.add(L);
  const lcode = await L.online.createRoom({ private: false });
  const orig = L.online.role._toMember.bind(L.online.role);
  L.online.role._toMember = (m, ev, pl) => orig(m, ev, ev === 'welcome' ? { ...pl, priv: true } : pl);
  await step(0.3);
  check(await K.online.joinRoom(lcode, { typed: true }), 'Kiddo typed the code of a listed public room');
  check(K.online.room.faceOk === false, "a publicly listed room never gets faces, whatever its host claims");
  K.online.leave();
  L.online.leave();
  live.delete(L);

  // ---------------------------------------------------------------- kicks survive a host change
  hub.latency = 0.04;
  const E = new StubApp('Eve', { hub, base: 'micah' });
  apps.push(E);
  live.add(E);
  hub.latency = 0;
  check(await E.online.joinRoom(code), 'Eve joins the first room');
  hub.latency = 0.04;
  await step(0.5);
  A.online.kick(E.online.pid);
  await step(0.5);
  check(!E.online.room, 'host removed Eve');
  A.online.leave(); // the host goes: Bob (next in line) takes over
  live.delete(A);
  await step(1.5);
  check(B.online.isHost, 'Bob hosts now');
  hub.latency = 0;
  const back = await E.online.joinRoom(code);
  check(!back, 'Eve still cannot come back after the host changed');

  // ---------------------------------------------------------------- Quick Play at the same moment
  const Q1 = new StubApp('Quin', { hub, base: 'dorian' });
  const Q2 = new StubApp('Quade', { hub, base: 'esther' });
  apps.push(Q1, Q2);
  live.add(Q1);
  live.add(Q2);
  B.online.leave(); // no other public rooms around
  M.online.leave();
  live.delete(B);
  live.delete(M);
  await step(0.3);
  const [q1, q2] = await Promise.all([Q1.online.quickPlay(), Q2.online.quickPlay()]);
  check(q1 && q2, 'both friends pressed Quick Play');
  for (let i = 0; i < 40 && Q1.online.room?.code !== Q2.online.room?.code; i++) await step(0.25);
  check(Q1.online.room && Q1.online.room.code === Q2.online.room?.code, `they end up in the same room (${Q1.online.room?.code} / ${Q2.online.room?.code})`);

  // ---------------------------------------------------------------- traffic of a busy room
  hub.latency = 0.04;
  const T = [0, 1, 2, 3].map((i) => new StubApp('Walker' + i, { hub, base: ['dorian', 'esther', 'maddie', 'micah'][i] }));
  const tapps = T;
  const tstep = async (sec, dt = 1 / 30) => {
    for (let i = 0, n = Math.round(sec / dt); i < n; i++) {
      for (const a of tapps) a.frame(dt);
      hub.advance(dt);
      await new Promise((r) => setImmediate(r));
    }
  };
  for (const a of apps) a.online.leave();
  hub.latency = 0;
  const tcode = await T[0].online.createRoom({ private: true });
  for (const a of T.slice(1)) await a.online.joinRoom(tcode);
  hub.latency = 0.04;
  await tstep(1.5);
  // three of them zig-zag around like kids do (new direction every ~0.6 s), the host stands still
  let t = 0;
  const lag = [];
  const s0 = hub.sent + hub.delivered, h0 = hub.now;
  while (t < 6) {
    for (const [i, a] of T.slice(1).entries()) {
      const ang = Math.floor((t + i * 0.2) / 0.6) * 2.1 + i;
      a.pad.moveX = Math.sin(ang);
      a.pad.moveZ = Math.cos(ang);
    }
    await tstep(0.2);
    t += 0.2;
    for (const a of T.slice(1)) {
      const p = a.game.players[a.online.mySlot], q = T[0].game.players[a.online.mySlot];
      lag.push(Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z));
    }
  }
  lag.sort((x, y) => x - y);
  console.log(`INFO while zig-zagging the host sees members ${(lag.reduce((x, y) => x + y, 0) / lag.length).toFixed(2)} studs from where they are (median ${lag[lag.length >> 1].toFixed(2)}, 90% ${lag[Math.floor(lag.length * 0.9)].toFixed(2)}; 40 ms network each way)`);
  const rate = (hub.sent + hub.delivered - s0) / (hub.now - h0);
  console.log(`INFO busy full room (4 people, 3 zig-zagging): ${rate.toFixed(0)} messages/s sent+delivered (was ~70)`);
  check(rate < 45, 'a busy full room costs about half the messages it used to');
  for (const a of T) a.pad.moveX = a.pad.moveZ = 0;
  await tstep(0.8);
  const gap = Math.max(...T.slice(1).map((a) => {
    const p = a.game.players[a.online.mySlot], q = T[0].game.players[a.online.mySlot];
    return Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z);
  }));
  check(gap < 0.6, `after they stop, the host has everyone where they really are (max ${gap.toFixed(2)} studs)`);
  // on the host's screen a friend starting and stopping glides: no lurch ahead, no snap back
  const W = T[1], ws = W.online.mySlot, hv = () => T[0].game.players[ws].pos;
  const maxSp = T[0].game.players[ws].maxSpeed(T[0].game.time);
  let prev = { ...hv() }, fastest = 0, snap = 0;
  const x0 = prev.x;
  W.pad.moveX = 1;
  W.pad.moveZ = 0;
  for (let i = 0; i < 36; i++) {
    if (i === 24) W.pad.moveX = 0;
    await tstep(1 / 30);
    const q = hv();
    fastest = Math.max(fastest, Math.hypot(q.x - prev.x, q.z - prev.z) * 30);
    if (process.env.NET_DEBUG) console.log('   ', i, (Math.hypot(q.x - prev.x, q.z - prev.z) * 30).toFixed(1), q.x.toFixed(2), q.z.toFixed(2), 'dev', W.game.players[ws].pos.x.toFixed(2), W.game.players[ws].pos.z.toFixed(2));
    prev = { ...q };
  }
  const dir = Math.sign(prev.x - x0) || 1;
  let furthest = prev.x;
  for (let i = 0; i < 20; i++) {
    await tstep(1 / 30);
    const q = hv();
    if ((q.x - furthest) * dir > 0) furthest = q.x;
    snap = Math.max(snap, (furthest - q.x) * dir);
  }
  const final = W.game.players[ws].pos.x;
  check(fastest < maxSp * 1.35 && snap < 0.35 && Math.abs(hv().x - final) < 0.3,
    `host view of a friend: top speed ${fastest.toFixed(1)} (their max ${maxSp.toFixed(0)}), snap-back ${snap.toFixed(2)} studs, ends ${Math.abs(hv().x - final).toFixed(2)} from them`);
  for (const a of T) a.online.leave();
  hub.log = null;
}
