// Pets moving through trades: pet mail in the shared game state (Game.trade -> player.petMail), applied once per
// device (ui/pets.js applyPetMail / attachPetMail) and acked; online through lost events and a host change; and
// pets on offer are locked. Run: node --test tests/social/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StubApp, MemoryHub } from '../net/stub.mjs';
import { bus } from '../../src/core/events.js';
import { settings } from '../../src/core/settings.js';
import { createProfile, getProfile, updateProfile } from '../../src/core/profiles.js';
import { PET_CAPACITY } from '../../src/pets/catalog.js';
import { applyPetMail, attachPetMail, releasePet, petBag } from '../../src/ui/pets.js';
import { socialUi } from '../../src/social/uiState.js';
import { createTradeManager, TRADE } from '../../src/social/trades.js';
import { vetPetMail, vetPlayer } from '../../src/net/protocol.js';

function bag(pid, owned, team = []) {
  updateProfile(pid, (p) => {
    p.pets.owned = owned;
    p.pets.team = team;
    p.pets.equipped = team[0] || null;
    p.pets.mailDone = [];
  });
}
const owned = (pid) => getProfile(pid).pets.owned;

test('pet mail is applied once per device, then acked (again if the ack got lost)', () => {
  const prof = createProfile({ name: 'Mo', base: 'esther' });
  bag(prof.id, [{ uid: 'pa', id: 'dragon', t: 1, name: 'Smokey' }, { uid: 'pb', id: 'bunny', t: 2 }], ['pa', 'pb']);
  const mail = { tid: 'mX1', give: ['pa'], get: [{ id: 'phoenix', name: 'Blaze' }] };
  const traded = [];
  const off = bus.on('pets:traded', (e) => traded.push(e));
  const got = applyPetMail(prof.id, mail);
  off();
  assert.equal(got.length, 1);
  const list = owned(prof.id);
  assert.ok(!list.some((x) => x.uid === 'pa'), 'Smokey left the bag');
  const blaze = list.find((x) => x.id === 'phoenix');
  assert.ok(blaze && blaze.name === 'Blaze' && blaze.uid !== 'pa', 'Blaze arrived with a new uid and her name');
  assert.deepEqual(getProfile(prof.id).pets.team, ['pb', blaze.uid], 'the team lost Smokey and Blaze took the free slot');
  assert.ok(getProfile(prof.id).pets.mailDone.includes('mX1'));
  assert.deepEqual(traded[0].gave.map((x) => x.name), ['Smokey']);
  assert.equal(applyPetMail(prof.id, mail), null, 'the same mail again does nothing');
  assert.equal(owned(prof.id).length, 2);

  // the mailbox: reads this device's player, applies new mail once, acks it; a lost ack is sent again later
  const game = { time: 10 };
  const human = { profileId: prof.id, petMail: [{ tid: 'mX2', give: [], get: [{ id: 'owl', name: '' }] }, mail] };
  const acks = [];
  const app = { game, human, profileId: prof.id, act: (name, tid) => acks.push([name, tid]) };
  const box = attachPetMail(app);
  assert.equal(attachPetMail(app), box, 'one mailbox per app');
  box.update();
  assert.equal(owned(prof.id).filter((x) => x.id === 'owl').length, 1, 'the owl arrived');
  assert.deepEqual(acks, [['petMailAck', 'mX2'], ['petMailAck', 'mX1']], 'both acked (mX1 was applied before: just acked)');
  box.update();
  assert.equal(acks.length, 2, 'not every frame');
  game.time += 2.5; // the host still lists them: the acks were lost
  box.update();
  assert.equal(acks.length, 4, 'acked again');
  assert.equal(owned(prof.id).filter((x) => x.id === 'owl').length, 1, 'never applied twice');
});

test('a full bag makes room for a traded pet, but never with a pet on offer; offered pets can\'t be released', () => {
  const prof = createProfile({ name: 'Lu', base: 'micah' });
  const list = [];
  for (let i = 0; i < PET_CAPACITY; i++) list.push({ uid: 'q' + i, id: i < 3 ? 'dragon' : 'bunny', t: i });
  bag(prof.id, list, ['q0', 'q1', 'q2']);
  socialUi.tradePets.add('q3'); // the weakest, oldest spare is on offer in a trade
  try {
    applyPetMail(prof.id, { tid: 'mFull', give: [], get: [{ id: 'unicorn', name: 'Glitter' }] });
    const now = owned(prof.id);
    assert.equal(now.length, PET_CAPACITY);
    assert.ok(now.some((x) => x.uid === 'q3'), 'the pet on offer stayed');
    assert.ok(!now.some((x) => x.uid === 'q4'), 'the next weakest spare went home instead');
    assert.ok(now.some((x) => x.name === 'Glitter'));
    assert.equal(releasePet(prof.id, 'q3'), false, "My Pets can't release a pet on offer");
    assert.ok(owned(prof.id).some((x) => x.uid === 'q3'));
  } finally {
    socialUi.tradePets.clear();
  }
  assert.equal(releasePet(prof.id, 'q3'), true, 'after the trade it can go');
  assert.equal(releasePet(prof.id, 'nope'), false);
});

test('pet mail from the network is vetted', () => {
  const clean = vetPetMail([
    { tid: 'm1', give: ['pa', 'pa', 'bad uid!', 7], get: [{ id: 'dragon', name: 'fuck' }, { id: 'toString' }, { id: 'owl', name: 'Hoot' }] },
    { tid: 'not an id!', give: [], get: [] },
    'junk',
  ]);
  assert.deepEqual(clean, [{ tid: 'm1', give: ['pa'], get: [{ id: 'dragon', name: '' }, { id: 'owl', name: 'Hoot' }] }]);
  assert.deepEqual(vetPetMail(null), []);
  assert.equal(vetPetMail(Array.from({ length: 30 }, (_, i) => ({ tid: 't' + i, give: [], get: [] }))).length, 8);
  const d = { pos: {}, vel: {}, items: {}, stats: {}, interact: {}, petMail: { tid: 'x' } };
  assert.ok(vetPlayer(d, 0));
  assert.deepEqual(d.petMail, []);
});

// ------------------------------------------------------------------ online

function room() {
  const hub = new MemoryHub();
  const apps = [];
  const add = (name, base) => {
    const a = new StubApp(name, { hub, base });
    a.trades = createTradeManager(a); // main.js makes one on every device; only the host's runs
    a.mailbox = attachPetMail(a);
    apps.push(a);
    return a;
  };
  const step = async (sec, dt = 1 / 30) => {
    for (let i = 0, n = Math.max(1, Math.round(sec / dt)); i < n; i++) {
      for (const a of apps) {
        a.frame(dt);
        if (a.online.room && !a.online.isClient) a.trades.update();
        if (!a.noMail) a.mailbox.update();
      }
      hub.advance(dt);
      await new Promise((r) => setImmediate(r));
    }
  };
  const done = () => apps.forEach((a) => a.online.leave());
  return { hub, apps, add, step, done };
}
const slotOf = (a) => a.online.mySlot;
const me = (a) => a.game.players[slotOf(a)];
// teleport a player the way their own device would (and tell the host's sanity check it's legit)
function tp(H, a, x, z) {
  const p = me(a);
  Object.assign(p.pos, { x, y: 0, z });
  Object.assign(p.vel, { x: 0, y: 0, z: 0 });
  const m = H.online.role.members?.get(a.online.pid);
  if (m) {
    Object.assign(m.base, { x, y: 0, z, vx: 0, vy: 0, vz: 0, t: H.online.clock, c: null });
    Object.assign(m.show, { x, y: 0, z });
  }
}
const keep = { ...settings };

test('online: pets swap between friends through mail, even when every trade event is lost on the way', async () => {
  bus.clear();
  Object.assign(settings, { onlineBots: 0 });
  const r = room();
  try {
    const H = r.add('Hana', 'dorian');
    const J = r.add('Jo', 'esther');
    bag(H.profileId, [{ uid: 'hd', id: 'dragon', t: 1, name: 'Smokey' }], ['hd']);
    bag(J.profileId, [{ uid: 'jb', id: 'bunny', t: 1, name: 'Hops' }, { uid: 'jk', id: 'kitty', t: 2 }], ['jb', 'jk']);
    const code = await H.online.createRoom({ private: true });
    assert.ok(await J.online.joinRoom(code));
    r.hub.latency = 0.04;
    await r.step(1);
    // Jo's device never hears a single trade:* event (lost ticks): only the state gets through
    const events = J.online.role._events.bind(J.online.role);
    J.online.role._events = (E) => events(E.filter((ev) => !String(ev?.[0]).startsWith('trade:')));
    tp(H, H, 0, 0);
    tp(H, J, 4, 0);
    await r.step(0.3);
    const hp = H.game.players;
    const jSlot = slotOf(J);
    assert.equal(H.act('tradeRequest', jSlot), true, 'asked (the host applies its own actions)');
    await r.step(0.3);
    J.act('tradeAccept', slotOf(H));
    await r.step(0.5);
    const s = H.trades.sessionOf(hp[0]);
    assert.ok(s, 'the host opened the trade');
    H.act('tradeOffer', { planters: [], cash: 0, pets: [{ uid: 'hd', id: 'dragon', name: 'Smokey' }], petRoom: petBag(H).room });
    J.act('tradeOffer', { planters: [], cash: 0, pets: [{ uid: 'jb', id: 'bunny', name: 'Hops' }, { uid: 'jk', id: 'kitty', name: '' }], petRoom: petBag(J).room });
    await r.step(TRADE.readyLock + 0.5);
    assert.equal(H.trades.sessionOf(hp[0]).offerB.pets.length, 2, "Jo's offer reached the host");
    H.act('tradeReady', true, petBag(H).room);
    J.act('tradeReady', true, petBag(J).room);
    await r.step(TRADE.countdown + 1.5);
    assert.equal(H.trades.sessionOf(hp[0]), null, 'traded');
    const names = (a) => owned(a.profileId).map((x) => `${x.id}:${x.name || ''}`).sort();
    assert.deepEqual(names(H), ['bunny:Hops', 'kitty:'], "Hana's bag: Jo's two pets");
    assert.deepEqual(names(J), ['dragon:Smokey'], "Jo's bag: Smokey (no event needed)");
    assert.equal(getProfile(J.profileId).pets.team.length, 1, "Jo's team: the old pets left it, the new one joined");
    assert.ok(hp.every((p) => !p.petMail.length), 'the host dropped the acked mail');
    // (main.js then turns the team change into setPets for the host; the stub app has no profile:changed hook)
    await r.step(0.5);
    assert.ok(!J.game.players[jSlot].petMail.length, "Jo's copy of the state has no mail left either");
  } finally {
    r.done();
    Object.assign(settings, keep);
  }
});

test('online: a new host keeps pet mail nobody acked yet; the device applies it once', async () => {
  bus.clear();
  Object.assign(settings, { onlineBots: 0 });
  const r = room();
  try {
    const H = r.add('Hana', 'dorian');
    const B = r.add('Bo', 'esther');
    const C = r.add('Cy', 'maddie');
    bag(B.profileId, [], []);
    B.noMail = true; // Bo's device is busy: it doesn't open its mail yet
    const code = await H.online.createRoom({ private: true });
    assert.ok(await B.online.joinRoom(code) && await C.online.joinRoom(code));
    r.hub.latency = 0.04;
    await r.step(1);
    // the host gives Bo a pet (straight through the rules, as the trade manager would)
    const hb = H.game.players[slotOf(B)];
    assert.ok(H.game.trade(H.game.players[0], hb, { pets: [{ uid: 'hx', id: 'unicorn', name: 'Glitter' }], petRoom: 10 }, { petRoom: 10 }));
    const tid = hb.petMail[0].tid;
    await r.step(1);
    assert.equal(me(B).petMail[0]?.tid, tid, "Bo's device sees the mail in the state");
    assert.equal(C.game.players[slotOf(B)].petMail[0]?.tid, tid, 'and so does everyone (a future host)');
    // the host leaves before Bo acked
    H.online.leave();
    r.apps.splice(r.apps.indexOf(H), 1);
    await r.step(4);
    const host = [B, C].find((a) => a.online.isHost);
    assert.ok(host, 'someone took over');
    assert.equal(host.game.players[slotOf(B)].petMail[0]?.tid, tid, 'the new host still has the mail');
    // Bo opens the mail now: once, and the new host forgets it
    B.noMail = false;
    await r.step(1.5);
    assert.deepEqual(owned(B.profileId).map((x) => `${x.id}:${x.name}`), ['unicorn:Glitter']);
    assert.ok(!host.game.players[slotOf(B)].petMail.length, 'acked to the new host');
    await r.step(2.5);
    assert.equal(owned(B.profileId).length, 1, 'never twice');
  } finally {
    r.done();
    Object.assign(settings, keep);
  }
});

// ------------------------------------------------------------------ a device drops out in the middle of a pet trade

const bagOf = (a) => owned(a.profileId).map((x) => `${x.id}:${x.name || ''}`).sort();
// a stand-in for a phone that locks or walks out of Wi-Fi: nothing in or out, its presence vanishes
const down = (r, a, on = true) => r.hub.setDown(a.transport, on);

// Hana hosts, Bo is a client. One of them offers a pet and Bo's phone drops a second into the 3 s countdown,
// for longer than the host keeps a garden (memberGrace). The swap must not happen: it would take the pet from
// one bag while Bo's device never hears about the other half.
for (const giver of ['host', 'client']) {
  test(`online: a friend's device that drops during the countdown calls the trade off (the ${giver} gives a pet)`, async () => {
    bus.clear();
    Object.assign(settings, { onlineBots: 0 });
    const r = room();
    const seen = [];
    const off = bus.on('*', ({ name, payload }) => name.startsWith('trade:') && seen.push({ name, ...payload }));
    try {
      const H = r.add('Hana', 'dorian');
      const B = r.add('Bo', 'esther');
      const [G, R] = giver === 'host' ? [H, B] : [B, H];
      bag(G.profileId, [{ uid: 'gd', id: 'dragon', t: 1, name: 'Smokey' }], ['gd']);
      bag(R.profileId, [], []);
      const code = await H.online.createRoom({ private: true });
      assert.ok(await B.online.joinRoom(code));
      r.hub.latency = 0.04;
      await r.step(1);
      tp(H, H, 0, 0);
      tp(H, B, 4, 0);
      await r.step(0.3);
      const hp = H.game.players;
      assert.equal(H.act('tradeRequest', slotOf(B)), true);
      await r.step(0.3);
      B.act('tradeAccept', slotOf(H));
      await r.step(0.5);
      G.act('tradeOffer', { planters: [], cash: 0, pets: [{ uid: 'gd', id: 'dragon', name: 'Smokey' }], petRoom: petBag(G).room });
      R.act('tradeOffer', { planters: [], cash: 0, pets: [], petRoom: petBag(R).room });
      await r.step(TRADE.readyLock + 0.5);
      H.act('tradeReady', true, petBag(H).room);
      B.act('tradeReady', true, petBag(B).room);
      await r.step(1);
      const s = H.trades.sessionOf(hp[0]);
      assert.ok(s && s.readyA && s.readyB && s.countdownEndsAt > H.game.time, 'both Ready, counting down');
      down(r, B);
      await r.step(TRADE.countdown);
      assert.equal(H.trades.sessionOf(hp[0]), null, 'the trade is over');
      assert.ok(!seen.some((e) => e.name === 'trade:done'), 'and nothing was swapped');
      const cancel = seen.find((e) => e.name === 'trade:cancel');
      assert.equal(cancel?.reason, 'left', 'Bo went quiet: he "left" the trade');
      assert.equal(cancel.by, hp[slotOf(B)]);
      assert.ok(hp.every((p) => !p.petMail.length), 'no pet mail for anyone');
      // Bo's phone stays off long enough to lose his garden, then comes back
      await r.step(10);
      down(r, B, false);
      await r.step(12);
      assert.ok([H, B].some((a) => a.online.isHost) && [H, B].every((a) => a.online.room), 'one room again');
      assert.deepEqual(bagOf(G), ['dragon:Smokey'], 'the giver still has the dragon');
      assert.deepEqual(bagOf(R), [], 'and nobody got a copy');
    } finally {
      off();
      r.done();
      Object.assign(settings, keep);
    }
  });
}

// The swap went through just as Bo's phone dropped (inside the moment the host can't tell yet). Bo is gone longer
// than the host keeps his garden, so it goes to a computer player; when Bo comes back his pet mail is still there.
test('online: pet mail waits for a friend who dropped out and comes back (nothing lost, nothing copied)', async () => {
  bus.clear();
  Object.assign(settings, { onlineBots: 0 });
  const r = room();
  try {
    const H = r.add('Hana', 'dorian');
    const C = r.add('Cy', 'maddie');
    const B = r.add('Bo', 'esther');
    bag(H.profileId, [{ uid: 'hd', id: 'dragon', t: 1, name: 'Smokey' }], ['hd']);
    bag(B.profileId, [{ uid: 'bb', id: 'bunny', t: 1, name: 'Hops' }], ['bb']);
    bag(C.profileId, [], []);
    const code = await H.online.createRoom({ private: true });
    assert.ok(await C.online.joinRoom(code));
    assert.ok(await B.online.joinRoom(code));
    r.hub.latency = 0.04;
    await r.step(1);
    const bPid = B.online.pid;
    down(r, B);
    await r.step(0.2);
    assert.ok(H.game.trade(H.game.players[0], H.game.players[slotOf(B)],
      { pets: [{ uid: 'hd', id: 'dragon', name: 'Smokey' }], petRoom: 10 }, { pets: [{ uid: 'bb', id: 'bunny', name: 'Hops' }], petRoom: 10 }));
    await r.step(1);
    assert.deepEqual(bagOf(H), ['bunny:Hops'], "Hana's own device applied her half right away");
    await r.step(10); // longer than memberGrace: the host gives Bo's garden away
    assert.ok(!H.game.players.some((p) => p.pid === bPid), 'Bo lost his garden');
    down(r, B, false);
    await r.step(15);
    assert.ok(H.online.isHost && B.online.isClient, "Bo is back in Hana's room");
    const back = H.game.players.find((p) => p.pid === bPid);
    assert.ok(back, 'with a garden again');
    assert.deepEqual(bagOf(B), ['dragon:Smokey'], 'Bo got Smokey and Hops left his bag');
    assert.ok(!back.petMail.length, 'acked: the host forgot it');
    await r.step(2.5);
    assert.deepEqual(bagOf(B), ['dragon:Smokey'], 'applied once');
    assert.deepEqual(bagOf(H), ['bunny:Hops']);
  } finally {
    r.done();
    Object.assign(settings, keep);
  }
});

// Same, but the host leaves while Bo is away: the device that takes over finds Bo gone, hands his garden to a
// computer player and keeps his mail for when he's back.
test('online: a new host keeps the mail of a friend who was away during the host change', async () => {
  bus.clear();
  Object.assign(settings, { onlineBots: 0 });
  const r = room();
  try {
    const H = r.add('Hana', 'dorian');
    const C = r.add('Cy', 'maddie');
    const B = r.add('Bo', 'esther');
    bag(H.profileId, [{ uid: 'hd', id: 'dragon', t: 1, name: 'Smokey' }], ['hd']);
    bag(B.profileId, [{ uid: 'bb', id: 'bunny', t: 1, name: 'Hops' }], ['bb']);
    bag(C.profileId, [], []);
    const code = await H.online.createRoom({ private: true });
    assert.ok(await C.online.joinRoom(code)); // Cy is next in line to host
    assert.ok(await B.online.joinRoom(code));
    r.hub.latency = 0.04;
    await r.step(1);
    const bPid = B.online.pid;
    down(r, B);
    await r.step(0.2);
    assert.ok(H.game.trade(H.game.players[0], H.game.players[slotOf(B)],
      { pets: [{ uid: 'hd', id: 'dragon', name: 'Smokey' }], petRoom: 10 }, { pets: [{ uid: 'bb', id: 'bunny', name: 'Hops' }], petRoom: 10 }));
    await r.step(1);
    assert.deepEqual(bagOf(H), ['bunny:Hops']);
    assert.equal(C.game.players[slotOf(B)].petMail.length, 1, "Cy's copy of the world has Bo's mail");
    H.online.leave();
    r.apps.splice(r.apps.indexOf(H), 1);
    await r.step(1);
    assert.ok(C.online.isHost, 'Cy took over');
    assert.ok(!C.game.players.some((p) => p.pid === bPid), "Bo wasn't there: his garden went to a computer player");
    down(r, B, false);
    await r.step(12);
    assert.ok(B.online.isClient && B.online.role.hostPid === C.online.pid, 'Bo follows Cy now');
    const back = C.game.players.find((p) => p.pid === bPid);
    assert.ok(back, 'with a garden again');
    assert.deepEqual(bagOf(B), ['dragon:Smokey'], 'Bo got Smokey and Hops left his bag');
    assert.ok(!back.petMail.length, 'acked to the new host');
  } finally {
    r.done();
    Object.assign(settings, keep);
  }
});
