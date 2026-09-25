// Online rooms end to end in Node: a host and friends as separate Game instances talking through the
// in-memory transport (40 ms one-way latency). Run: node tests/net/room.test.mjs
import { StubApp, MemoryHub } from './stub.mjs';
import { bus } from '../../src/core/events.js';
import { LAYOUT } from '../../src/gameplay/layout.js';
import { PLANTS, ITEM } from '../../src/config.js';
import { familyFaceData, faceInfo } from '../../src/characters/faces.js';
import { createTransport } from '../../src/net/transport.js';
import { roomTopic, VERSION, normalizeCode, makeCode, isCode, isCleanLine } from '../../src/net/protocol.js';
import { securitySuite } from './security.mjs';

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed++;
};
const errors = [];
bus.on('net:error', (e) => errors.push(e));
const origWarn = console.warn;
const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(' '));
  origWarn(...a);
};

const hub = new MemoryHub();
const apps = [];
const live = new Set();
const add = (app) => {
  apps.push(app);
  live.add(app);
  return app;
};
// Run every device's frame loop for `sec` of game time (yielding to the event loop like a browser does).
async function step(sec, dt = 1 / 30) {
  const n = Math.max(1, Math.round(sec / dt));
  for (let i = 0; i < n; i++) {
    for (const a of apps) if (live.has(a)) a.frame(dt);
    hub.advance(dt);
    await new Promise((r) => setImmediate(r));
  }
}
const flushAsync = () => new Promise((r) => setTimeout(r, 0));
const slotOf = (a) => a.online.mySlot;
const me = (a) => a.game.players[slotOf(a)];
const d2 = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
let H = null; // the current host app
const hostView = (a) => H.game.players[slotOf(a)];

// Teleport a player the way their own device would (and tell the host's sanity check it's legit).
function tp(a, x, z) {
  const p = me(a);
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = 0;
  p.vel.x = p.vel.y = p.vel.z = 0;
  const m = H.online.role.members?.get(a.online.pid);
  if (m) {
    Object.assign(m.base, { x, y: 0, z, vx: 0, vy: 0, vz: 0, t: H.online.clock, c: null });
    Object.assign(m.show, { x, y: 0, z });
  }
}

// Events a given app's bus listeners would see about ITS OWN world (identity-checked).
function watch(a, name, pick) {
  const seen = [];
  bus.on(name, (e) => {
    if (a.game && pick(e, a)) seen.push(e);
  });
  return seen;
}

try {
  // ---------------------------------------------------------------- protocol basics
  check([...Array(200)].every(() => isCode(makeCode())), 'room codes are 5 letters from the safe alphabet');
  check(normalizeCode(' bg-dk t9x ') === 'BGDKT', 'typed codes are cleaned up: ' + normalizeCode(' bg-dk t9x '));
  check(isCleanLine("Dad tax! Thanks for the Gold Sunflower.") && !isCleanLine('you are stupid') && !isCleanLine('x'.repeat(200)), 'bot lines are vetted');

  // ---------------------------------------------------------------- 1. create + join
  const A = add(new StubApp('Alice', { hub, base: 'dorian' }));
  const B = add(new StubApp('Bob', { hub, base: 'esther' }));
  const C = add(new StubApp('Cleo', { hub, base: 'maddie' }));
  const code = await A.online.createRoom({ private: false });
  H = A;
  check(isCode(code) && A.online.isHost && A.online.room.code === code, 'host made a public room ' + code);
  const lobbySeen = [];
  const stopLobby = B.online.listRooms((rooms) => lobbySeen.push(rooms));
  await flushAsync();
  await step(0.1);
  check(lobbySeen.some((l) => l.some((r) => r.code === code && r.n === 1 && r.ok)), 'the public room shows up in the lobby');
  stopLobby();
  check(await B.online.joinRoom(code), 'Bob joined by code');
  check(await C.online.joinRoom(code.toLowerCase()), 'Cleo joined by code (lower case)');
  await step(0.5);
  hub.latency = 0.04;
  check(B.online.isClient && C.online.isClient && slotOf(B) === 1 && slotOf(C) === 2, `friends got their family slots (Bob ${slotOf(B)}, Cleo ${slotOf(C)})`);
  check(A.game.players.map((p) => p.kind).join() === 'local,remote,remote,bot', 'host sees two remote players and a bot: ' + A.game.players.map((p) => p.kind));
  check(B.game.players.map((p) => p.name).join() === 'Alice,Bob,Cleo,Micah', 'names reach everyone: ' + B.game.players.map((p) => p.name));
  check(B.game.players[0].faceKey === 'r_' + A.online.pid && faceInfo('r_' + A.online.pid).name === 'Alice', 'remote players use r_<pid> face keys');
  check(C.online.members.length === 3 && C.online.members.find((m) => m.isHost)?.name === 'Alice', 'member list has the host');

  // ---------------------------------------------------------------- 2. state converges
  await step(3);
  const podsSame = (g) => g.pods.every((p, i) => (p.seed?.speciesId || null) === (A.game.pods[i].seed?.speciesId || null));
  const plantsSame = (g) => g.gardens.every((gd, i) => gd.planters.every((pl, j) => (pl.plant?.speciesId || null) === (A.game.gardens[i].planters[j].plant?.speciesId || null)));
  check(podsSame(B.game) && podsSame(C.game), 'seed pods match the host');
  check(plantsSame(B.game) && plantsSame(C.game), 'gardens match the host');
  check(B.game.players.every((p, i) => Math.floor(p.cash) === Math.floor(A.game.players[i].cash)), 'cash matches the host');
  const monErr = Math.max(...A.game.monsters.map((m, i) => Math.hypot(m.x - B.game.monsters[i].x, m.z - B.game.monsters[i].z)));
  check(monErr < 8, `monsters follow the host (max ${monErr.toFixed(2)} studs apart, drawn 150 ms behind)`);
  check(Math.abs(B.game.time - A.game.time) < 0.3, `clocks agree (host ${A.game.time.toFixed(2)}, client ${B.game.time.toFixed(2)})`);
  const bot = 3;
  const botErr = Math.hypot(A.game.players[bot].pos.x - B.game.players[bot].pos.x, A.game.players[bot].pos.z - B.game.players[bot].pos.z);
  check(botErr < 6, `bots glide on clients (${botErr.toFixed(2)} studs behind)`);

  // ---------------------------------------------------------------- 3. client movement is accepted
  const b0 = { ...me(B).pos };
  B.pad.moveZ = 1;
  await step(0.6);
  B.pad.moveZ = 0;
  await step(0.6);
  const bl = me(B).pos, bh = hostView(B).pos, bc = C.game.players[slotOf(B)].pos;
  check(d2(bl, b0) > 5, `Bob walked on his own device (${d2(bl, b0).toFixed(1)} studs)`);
  check(d2(bl, bh) < 0.3, `host has Bob where Bob is (${d2(bl, bh).toFixed(2)})`);
  check(d2(bl, bc) < 0.6, `Cleo sees Bob there too (${d2(bl, bc).toFixed(2)})`);
  // jumping: local physics, others hear about it
  const jumps = watch(C, 'player:jump', (e, a) => e.player === a.game.players[slotOf(B)]);
  B.pad.press('jump');
  await step(0.15);
  check(me(B).pos.y > 0.5, 'Bob jumps instantly on his device');
  await step(0.5);
  check(jumps.length === 1, 'Cleo hears Bob jump once: ' + jumps.length);

  // ---------------------------------------------------------------- 4. impossible moves are refused
  me(B).pos.z = 600; // "teleport" without the host knowing
  await step(0.5);
  check(hostView(B).pos.z < 120, `host refused Bob's teleport (host z ${hostView(B).pos.z.toFixed(1)})`);
  check(me(B).pos.z < 120 && d2(me(B).pos, hostView(B).pos) < 3, `Bob's device was put back (z ${me(B).pos.z.toFixed(1)})`);
  // through a fence: standing at his garden's back fence, his device claims to be on the other side
  const gB = LAYOUT.gardens[slotOf(B)];
  const back = gB.west ? gB.bounds.minX : gB.bounds.maxX, out = gB.west ? -1 : 1;
  tp(B, back - out * 2.2, gB.center.z + 6);
  await step(0.3);
  me(B).pos.x = back + out * 2.2; // 4.4 studs: fine for the speed check, but there's a fence in the way
  await step(0.4);
  const inside = (x) => gB.bounds.minX < x && x < gB.bounds.maxX;
  check(inside(hostView(B).pos.x) && inside(me(B).pos.x), `no walking through fences (host x ${hostView(B).pos.x.toFixed(1)}, device x ${me(B).pos.x.toFixed(1)}, fence at ${back})`);
  await step(0.4);

  // ---------------------------------------------------------------- 5. a steal between two humans
  const sB = slotOf(B), sC = slotOf(C);
  const sp = PLANTS.find((p) => p.rarity === 'rare') || PLANTS[0];
  A.game.gardens[sB].planters[0].plant = { uid: 99001, speciesId: sp.id, mutation: 'gold', growTotal: 10, growLeft: 0, owner: sB };
  await step(0.6);
  check(B.game.gardens[sB].planters[0].plant?.uid === 99001 && C.game.gardens[sB].planters[0].plant?.uid === 99001, 'a grown plant appears in Bob\'s garden everywhere');
  const robbedB = watch(B, 'steal:grabbed', (e, a) => e.victim === me(a));
  const grabbedC = watch(C, 'steal:grabbed', (e, a) => e.thief === me(a));
  const pl0 = LAYOUT.gardens[sB].planters[0];
  tp(C, pl0.x - LAYOUT.gardens[sB].inward * 2.5, pl0.z);
  await step(0.3);
  check(me(C).interact.verb === 'Steal', 'Cleo sees the Steal prompt right away (local): ' + me(C).interact.verb);
  C.pad.hold = true;
  await step(0.8);
  check(me(C).interact.t > 0.5 && !me(C).carrying, `the hold bar fills locally (${me(C).interact.t.toFixed(2)})`);
  await step(1.2);
  C.pad.hold = false;
  await step(0.3);
  check(hostView(C).carrying?.kind === 'plant' && me(C).carrying?.kind === 'plant', 'Cleo is carrying Bob\'s plant (host and her device)');
  check(robbedB.length === 1 && grabbedC.length === 1, `Bob gets the "robbed" event, Cleo the "grabbed" one (${robbedB.length}, ${grabbedC.length})`);
  const home = LAYOUT.gardens[sC].inside;
  const wins = watch(C, 'steal:success', (e, a) => e.thief === me(a));
  tp(C, home.x, home.z);
  await step(0.5);
  const cPlants = (g) => g.gardens[sC].planters.filter((pl) => pl.plant?.uid === 99001).length;
  check(cPlants(A.game) === 1 && cPlants(B.game) === 1 && cPlants(C.game) === 1, 'the stolen plant is in Cleo\'s garden on every device');
  check(!A.game.gardens[sB].planters[0].plant && !B.game.gardens[sB].planters[0].plant, 'and gone from Bob\'s');
  check(wins.length === 1, 'Cleo gets steal:success once: ' + wins.length);

  // ---------------------------------------------------------------- 6. knockback reaches the victim's device
  tp(B, 0, -8);
  const hp = A.human;
  hp.pos.x = 0;
  hp.pos.z = -11;
  hp.pos.y = 0;
  hp.vel.x = hp.vel.z = 0;
  hp.yaw = 0;
  hp.bonkReadyAt = 0;
  await step(0.3);
  const hits = watch(B, 'player:hit', (e, a) => e.target === me(a));
  A.pad.press('bonk');
  await step(0.1);
  check(A.game.time < hostView(B).stunUntil, 'host: Bob is bonked and stunned');
  await step(0.15);
  check(B.game.time < me(B).stunUntil && Math.hypot(me(B).vel.x, me(B).vel.z) > 5, `Bob's device got the knockback (speed ${Math.hypot(me(B).vel.x, me(B).vel.z).toFixed(1)})`);
  check(hits.length === 1, 'Bob\'s HUD hears player:hit once: ' + hits.length);
  await step(1.5);
  check(d2(me(B).pos, hostView(B).pos) < 1.5 && me(B).pos.z > -7, `after the knockback host and Bob agree (${d2(me(B).pos, hostView(B).pos).toFixed(2)} apart, z ${me(B).pos.z.toFixed(1)})`);

  // ---------------------------------------------------------------- 7. actions go to the host
  const gear = LAYOUT.shops.gear;
  tp(B, gear.x, gear.z + 3);
  hostView(B).cash = 1000;
  await step(0.4);
  check(Math.floor(me(B).cash) === 1000, 'cash change reaches Bob');
  const buys = watch(B, 'purchase', (e, a) => e.player === me(a));
  const r = B.act('buyItem', 'banana', 2);
  check(r === undefined, 'app.act on a client is async (undefined)');
  await step(0.4);
  check(hostView(B).items.banana === 2 && hostView(B).cash === 1000 - ITEM.banana.price * 2, `host sold Bob 2 bananas (cash ${hostView(B).cash})`);
  check(me(B).items.banana === 2 && buys.length === 1, 'Bob sees his bananas and the purchase event');
  // shop prompt: E at the Gear Shop opens the shop on Bob's device
  const shops = watch(B, 'shop:open', (e, a) => e.player === me(a));
  B.pad.hold = true;
  await step(0.3);
  B.pad.hold = false;
  await step(0.3);
  check(shops.length === 1 && shops[0].shop === 'gear', 'shop:open for Bob reaches Bob only: ' + shops.map((s) => s.shop));
  // items: throw a banana (one-shot edge)
  B.pad.press('useItem', 0);
  await step(0.4);
  check(hostView(B).items.banana === 1 && A.game.ground.some((gi) => gi.kind === 'banana' && gi.owner === sB), 'Bob dropped a banana peel (host)');
  check(B.game.ground.some((gi) => gi.kind === 'banana') && C.game.ground.some((gi) => gi.kind === 'banana'), 'everyone sees the peel');
  // emotes + quick chat
  const emC = watch(C, 'emote', (e, a) => e.player === a.game.players[sB] && e.id === 'wave');
  B.act('emote', 'wave');
  await step(0.3);
  check(hostView(B).emote?.id === 'wave' && emC.length === 1, 'Bob waves: host runs it, Cleo sees it');
  const chatC = watch(C, 'chat', (e, a) => e.player === a.game.players[sB]);
  const chatA = watch(A, 'chat', (e, a) => e.player === a.game.players[sB]);
  B.act('say', 'hi');
  await step(0.3);
  check(chatC.length === 1 && chatC[0].text === 'Hi!' && chatC[0].quick, 'quick chat arrives as the phrase text: ' + chatC[0]?.text);
  C.online.mute(B.online.pid);
  await step(1.5);
  B.act('say', 'gg');
  await step(0.3);
  check(chatC.length === 1 && chatA.length === 2, `muted: Cleo no longer sees Bob's chat (Cleo ${chatC.length}, host ${chatA.length})`);
  C.online.mute(B.online.pid, false);
  // gifts between humans
  hostView(B).cash = 0;
  A.game.gardens[sB].planters[1].plant = { uid: 99002, speciesId: PLANTS[0].id, mutation: 'normal', growTotal: 10, growLeft: 0, owner: sB };
  await step(0.3);
  const gifts = watch(C, 'gift', (e, a) => e.to === me(a));
  B.act('gift', sC, 1);
  await step(0.4);
  check(A.game.gardens[sC].planters.some((pl) => pl.plant?.uid === 99002) && gifts.length === 1, 'Bob gifted Cleo a plant');

  // ---------------------------------------------------------------- 8. leaving: the slot goes back to a bot
  await step(0.5);
  C.quitToTitle();
  live.delete(C);
  await step(0.5);
  check(A.game.players[sC].kind === 'bot' && B.game.players[sC].kind === 'bot', 'Cleo left: her garden is a bot again (host + Bob)');
  check(A.game.gardens[sC].planters.every((pl) => !pl.plant), 'the bot starts with a fresh garden');
  const saved = C.profile.online;
  check(saved?.garden?.planters?.some((pl) => pl?.plant?.speciesId === sp.id), 'Cleo\'s online garden (with the stolen plant) was saved to her profile');
  live.add(C);
  hub.latency = 0;
  check(await C.online.joinRoom(code), 'Cleo came back');
  hub.latency = 0.04;
  await step(0.5);
  check(slotOf(C) === sC && A.game.gardens[sC].planters.filter((pl) => pl.plant?.speciesId === sp.id).length >= 1, 'her garden came back with her');

  // ---------------------------------------------------------------- 9a. a member's own connection drops
  // Cleo's wifi dies for a while: her device thinks the host is gone and even promotes itself, but when
  // she's back the real room (the one people follow) wins and she's seated there again.
  hub.setDown(C.transport);
  await step(13);
  check(C.online.isHost, 'offline, Cleo\'s device carried on alone (it hosts its own copy)');
  check(A.game.players[sC].kind === 'bot', 'the real host freed her garden after she vanished');
  hub.setDown(C.transport, false);
  await step(3);
  check(A.online.isHost && B.online.isClient && B.online.room.hostPid === A.online.pid, 'back online: the real host stays host, Bob never switched');
  check(C.online.isClient && C.online.room.hostPid === A.online.pid && slotOf(C) === sC, 'Cleo rejoined the real room in her own garden');
  check(A.game.gardens[sC].planters.filter((pl) => pl.plant?.speciesId === sp.id).length >= 1, 'with her plants');

  // ---------------------------------------------------------------- 9a'. a member goes quiet for a long time
  // (its page stops running frames but still hears the room): the host frees the garden after a while,
  // and the member's device notices, keeps its own garden data and asks to be seated again
  let drops = 0;
  const od = C.online.onDropped.bind(C.online);
  C.online.onDropped = () => {
    drops++;
    return od();
  };
  live.delete(C);
  const seenCPlants = A.game.gardens[sC].planters.filter((pl) => pl.plant).length;
  await step(50);
  live.add(C);
  await step(2);
  check(C.online.isClient && slotOf(C) === sC && A.game.players[sC].pid === C.online.pid, `the quiet member was seated again in her own garden (dropped ${drops}x)`);
  check(A.game.gardens[sC].planters.filter((pl) => pl.plant).length === seenCPlants && C.profile.online.garden.planters.filter((pl) => pl?.plant).length === seenCPlants,
    `and nothing was lost (${seenCPlants} plants on the host and in her saved garden)`);

  // ---------------------------------------------------------------- 9b. hand-off (host's tab hidden)
  const aPlants = A.game.gardens[A.human.slot].planters.map((pl) => pl.plant?.speciesId || null).join();
  A.game.gardens[A.human.slot].planters[2].plant = { uid: 99003, speciesId: PLANTS[1].id, mutation: 'diamond', growTotal: 10, growLeft: 0, owner: A.human.slot };
  check(A.online.handoff(), 'the host hands the room over');
  await step(1.5);
  H = B;
  check(B.online.isHost && A.online.isClient && C.online.room.hostPid === B.online.pid, 'Bob hosts now; Alice and Cleo are members');
  check(slotOf(A) === 0 && B.game.gardens[0].planters[2].plant?.uid !== undefined && B.game.gardens[0].planters[2].plant?.speciesId === PLANTS[1].id, 'Alice kept her garden (and her plants) through the hand-off');
  const a0 = { ...me(A).pos };
  A.pad.moveZ = 1;
  await step(0.5);
  A.pad.moveZ = 0;
  await step(0.6);
  check(d2(me(A).pos, a0) > 3 && d2(me(A).pos, hostView(A).pos) < 0.4, 'Alice plays on as a member');
  // hosting goes round in join order: Bob -> Cleo -> Alice (so the rest starts from the same place)
  check(B.online.handoff(), 'Bob hands on');
  await step(1.5);
  H = C;
  check(C.online.isHost && A.online.room.hostPid === C.online.pid && B.online.room.hostPid === C.online.pid, 'Cleo hosts (next in join order)');
  check(C.online.handoff(), 'Cleo hands on');
  await step(1.5);
  H = A;
  check(A.online.isHost && B.online.room.hostPid === A.online.pid && C.online.room.hostPid === A.online.pid, 'Alice hosts again');
  check(A.game.players.map((p) => p.kind).join() === 'local,remote,remote,bot', 'everyone kept their gardens: ' + A.game.players.map((p) => p.kind));
  check(A.game.gardens[sC].planters.some((pl) => pl.plant?.speciesId === sp.id), 'Cleo still has the plant she stole');
  void aPlants;

  // ---------------------------------------------------------------- 9. host migration
  const bPlants = A.game.gardens[sB].planters.map((pl) => pl.plant?.speciesId || null).join();
  const cPlantsBefore = A.game.gardens[sC].planters.map((pl) => pl.plant?.speciesId || null).join();
  const aSlot = A.human.slot;
  hub.setDown(A.transport); // the host's wifi dies: no goodbye
  live.delete(A);
  let t = 0;
  while (!B.online.isHost && t < 8) {
    await step(0.25);
    t += 0.25;
  }
  H = B;
  check(B.online.isHost, `Bob took over as host after ${t.toFixed(2)} s`);
  await step(1);
  check(C.online.isClient && C.online.room.hostPid === B.online.pid, 'Cleo follows the new host');
  check(B.game.players[aSlot].kind === 'bot', 'the old host\'s garden went to a bot');
  check(B.game.gardens[sB].planters.map((pl) => pl.plant?.speciesId || null).join() === bPlants, 'Bob\'s garden survived the host change');
  check(B.game.gardens[sC].planters.map((pl) => pl.plant?.speciesId || null).join() === cPlantsBefore, 'Cleo\'s garden survived the host change');
  const tBefore = B.game.time;
  const c0 = { ...me(C).pos };
  C.pad.moveX = -1;
  await step(0.5);
  C.pad.moveX = 0;
  await step(0.6);
  check(B.game.time > tBefore + 1, 'the new host keeps the world running');
  check(d2(me(C).pos, c0) > 3 && d2(me(C).pos, hostView(C).pos) < 0.4, `the new host takes Cleo's moves (${d2(me(C).pos, hostView(C).pos).toFixed(2)})`);
  check(C.game.players.every((p, i) => Math.floor(p.cash) === Math.floor(B.game.players[i].cash)), 'Cleo\'s mirror matches the new host');

  // ---------------------------------------------------------------- 10. errors: version, full, not found, bad payloads
  hub.latency = 0;
  const D = add(new StubApp('Dan', { hub, base: 'micah' }));
  D.online.version = '0.old';
  const okD = await D.online.joinRoom(code);
  check(!okD && errors.at(-1)?.code === 'version', 'a different game version gets a friendly refusal: ' + errors.at(-1)?.message);
  D.online.version = VERSION;
  check(await D.online.joinRoom(code), 'Dan joins with the right version');
  const E = add(new StubApp('Eve', { hub, base: 'dorian' }));
  check(await E.online.joinRoom(code), 'Eve joins (4 humans)');
  // message budget of a full room (Supabase counts every message sent AND delivered)
  hub.latency = 0.04;
  await step(1);
  for (const x of [C, D, E]) x.pad.moveX = 1;
  const s0 = hub.sent + hub.delivered, t0 = hub.now;
  await step(4);
  for (const x of [C, D, E]) x.pad.moveX = 0;
  const rate = (hub.sent + hub.delivered - s0) / (hub.now - t0);
  console.log(`INFO full room (4 people, 3 walking): ${rate.toFixed(0)} messages/s sent+delivered`);
  check(rate < 85, 'a full room stays well under the free plan\'s 100 messages/s');
  hub.latency = 0;
  const F = add(new StubApp('Finn', { hub, base: 'dorian' }));
  const okF = await F.online.joinRoom(code);
  check(!okF && errors.at(-1)?.code === 'full', 'the 5th person is told the room is full');
  const okG = await F.online.joinRoom('ZZZZZ');
  check(!okG && errors.at(-1)?.code === 'not_found', 'unknown code: not found');
  // garbage from a rogue connection must not break anyone
  const rogue = createTransport('memory', { hub }).channel(roomTopic(code), { presenceKey: 'rogue1' });
  await rogue.subscribe();
  const nWarn = warnings.length;
  rogue.send('tick', { h: 'zz', ep: 99, s: 1, tm: 'x', P: [1, 2], D: { p0: 'bad' }, E: [['chat', { player: { $p: 0 }, text: 'you are stupid' }]] });
  rogue.send('tick', null);
  rogue.send('hello', { pid: 'rogue1', v: VERSION, who: { name: 'fuck face', base: 'nope' } });
  rogue.send('who', { pid: 'rogue1', name: '<script>', face: 'javascript:alert(1)' });
  rogue.send('kick', { to: C.online.pid, k: 'x' });
  hub.latency = 0.04;
  await step(0.5);
  check(B.online.isHost && C.online.isClient && D.online.isClient, 'rogue messages ignored; room still healthy');
  check(!B.game.players.some((p) => /fuck/i.test(p.name)), 'names are cleaned on arrival');
  rogue.leave();
  // chat with free text from a person is never shown
  const bad = watch(C, 'chat', (e) => /stupid/.test(e.text));
  await step(0.3);
  check(bad.length === 0, 'free-text chat is dropped');

  // ---------------------------------------------------------------- 11. private rooms: faces only there
  hub.latency = 0;
  const P1 = add(new StubApp('Gran', { hub, base: 'esther' }));
  const P2 = add(new StubApp('Kid', { hub, base: 'micah' }));
  const pcode = await P1.online.createRoom({ private: true });
  const lobbyNow = [];
  const stop2 = P2.online.listRooms((rooms) => lobbyNow.push(rooms));
  await flushAsync();
  await step(0.1);
  stop2();
  check(!lobbyNow.flat().some((r) => r.code === pcode), 'private rooms are not listed in the lobby');
  check(await P2.online.joinRoom(pcode), 'joined the private room by code');
  await step(0.3);
  const FACE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  P2.online.sendRoom('who', { ...P2.online._who(null), face: FACE });
  B.online.sendRoom('who', { ...B.online._who(null), face: FACE }); // a face sent into a PUBLIC room
  await step(0.3);
  check(familyFaceData('r_' + P2.online.pid)?.face === FACE, 'private room: the shared face shows for the others');
  check(!familyFaceData('r_' + B.online.pid)?.face, 'public room: faces are never shown');
  check(P1.online.room.private && P2.online.room.private, 'both know the room is private');

  // ---------------------------------------------------------------- 12. host kick + leaving host hands over
  check(B.online.kick(E.online.pid), 'host kicks Eve');
  await step(0.5);
  check(!E.online.room && errors.some((e) => e.code === 'kicked'), 'Eve is out with a friendly note');
  check(B.game.players.filter((p) => p.kind !== 'bot').length === 3, 'her slot is a bot again');
  B.quitToTitle(); // polite goodbye names the next host
  live.delete(B);
  await step(1.5);
  H = C;
  check(C.online.isHost && D.online.room?.hostPid === C.online.pid, 'a leaving host hands the room to the next member right away');
  check(B.profile.online?.garden, 'the old host saved its online garden');

  const perSec = hub.sent / (hub.now || 1);
  console.log(`INFO ${hub.sent} messages sent (${perSec.toFixed(1)}/s over the run), ${(hub.bytes / 1024).toFixed(0)} KB`);
  for (const a of apps) a.online.leave();

  // ---------------------------------------------------------------- 13. security (forged/replayed messages, faces, bans, traffic)
  await securitySuite(check);
  check(!warnings.slice(0).some((w) => /failed|TypeError|undefined/.test(w)), 'no handler failures: ' + warnings.filter((w) => /failed|TypeError|undefined/.test(w)).slice(0, 3).join(' | '));
} catch (e) {
  console.error(e);
  failed++;
}
for (const a of apps) a.online.leave();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
