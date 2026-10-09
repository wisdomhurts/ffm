// Sell has its own button (V / touch Sell / D-pad down; E never sells) and pet tricks (click a pet). No browser.
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SELL_SECONDS } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { PLANTS, PLANT, PLAYER, PET_TRICKS } from '../../src/config.js';
import { PET } from '../../src/pets/catalog.js';
import { emptyIntent } from '../../src/gameplay/player.js';
import { BotController } from '../../src/ai/bot.js';
import { EventCodec, vetFull, vetPlayer, signature, sectionize } from '../../src/net/protocol.js';
import { StubApp, MemoryHub } from '../net/stub.mjs';

function setup(seed = 5) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed });
  return { game, me: game.human, g: game.gardens[game.human.slot] };
}
const place = (p, x, z) => {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = 0;
  p.vel.x = p.vel.y = p.vel.z = 0;
};
const grown = (game, pl, slot, speciesId = PLANTS[3].id) => {
  pl.unlocked = true;
  pl.plant = { uid: 7000 + pl.index, speciesId, mutation: 'normal', growTotal: 10, growLeft: 0, owner: slot };
  return pl.plant;
};
/** Stand on the inward side of planter `pl` (where its prompt is the closest). */
const standAt = (p, g, pl) => place(p, pl.x - g.L.inward * 2.5, pl.z);
/** Drive one player with a fixed intent for `secs` (others idle). */
function run(game, p, secs, intent = {}) {
  p.controller = { getIntent: () => ({ ...emptyIntent(), ...intent }) };
  const steps = Math.round(secs * 60);
  for (let i = 0; i < steps; i++) game.update(1 / 60);
  p.controller = null;
}
const noBots = (game) => {
  for (const q of game.players) if (q.kind === 'bot') q.controller = null;
};

test('E never sells: holding it at your own grown plant does nothing (no Sell on the E prompt)', () => {
  const { game, me, g } = setup();
  noBots(game);
  const pl = g.planters[0];
  const plant = grown(game, pl, me.slot);
  standAt(me, g, pl);
  const cash = me.cash;
  const sold = [];
  bus.on('plant:sold', (e) => sold.push(e));
  run(game, me, 3, { interact: true });
  assert.equal(pl.plant, plant, 'still planted');
  assert.equal(me.cash, cash);
  assert.equal(sold.length, 0);
  assert.ok(!me.interact.key?.startsWith('sell'), 'the E prompt never offers Sell: ' + me.interact.key);
  const f = game.findInteraction(me);
  assert.ok(!f || f.verb !== 'Sell');
});

test('V sells with a 1 s hold: its own prompt, one hold = one sale', () => {
  const { game, me, g } = setup();
  noBots(game);
  const [a, b] = [g.planters[0], g.planters[1]];
  grown(game, a, me.slot);
  grown(game, b, me.slot);
  standAt(me, g, a);
  const f = game.findSell(me);
  const value = Math.round(game.plantIncome(a.plant, me) * SELL_SECONDS);
  assert.equal(f.key, 'sell' + a.index);
  assert.equal(f.verb, 'Sell');
  assert.equal(f.label, game.plantName(a.plant.speciesId, a.plant.mutation));
  assert.equal(f.value, value);
  assert.equal(f.hold, PLAYER.sellHold);
  const cash = me.cash;
  const sold = [];
  bus.on('plant:sold', (e) => sold.push(e));
  run(game, me, 0.6, { sell: true });
  assert.ok(a.plant, 'not yet: still holding');
  assert.equal(me.sell.key, 'sell' + a.index);
  assert.ok(me.sell.t > 0.4 && me.sell.t < PLAYER.sellHold, 'the ring fills: ' + me.sell.t.toFixed(2));
  // let go: the hold starts over
  run(game, me, 0.1, {});
  assert.equal(me.sell.t, 0);
  run(game, me, PLAYER.sellHold + 0.4, { sell: true });
  assert.equal(a.plant, null, 'sold');
  assert.equal(sold.length, 1);
  assert.equal(sold[0].player, me);
  assert.equal(me.cash, cash + value);
  // still holding (walking over to the next one): it waits for a fresh press
  standAt(me, g, b);
  run(game, me, PLAYER.sellHold + 0.5, { sell: true });
  assert.equal(me.sell.key, 'sell' + b.index);
  assert.ok(b.plant && sold.length === 1, 'one hold = one sale');
  run(game, me, 0.1, {});
  run(game, me, PLAYER.sellHold + 0.4, { sell: true });
  assert.equal(b.plant, null);
  assert.equal(sold.length, 2);
  assert.equal(me.sell.key, null, 'nothing left to sell: no prompt');
});

test('no Sell prompt: growing plants, other gardens, stunned, carrying a stolen plant', () => {
  const { game, me, g } = setup();
  noBots(game);
  const pl = g.planters[0];
  grown(game, pl, me.slot).growLeft = 5;
  standAt(me, g, pl);
  assert.equal(game.findSell(me), null, 'still growing');
  pl.plant.growLeft = 0;
  assert.ok(game.findSell(me));
  me.stunUntil = game.time + 2;
  assert.equal(game.findSell(me), null, 'stunned');
  me.stunUntil = 0;
  me.carrying = { kind: 'plant', plant: { uid: 1, speciesId: PLANTS[0].id, mutation: 'normal', growTotal: 1, growLeft: 0, owner: 1 }, fromSlot: 1, fromIndex: 0 };
  assert.equal(game.findSell(me), null, 'hands full');
  me.carrying = null;
  const other = game.gardens[1];
  grown(game, other.planters[0], 1);
  standAt(me, other, other.planters[0]);
  assert.equal(game.findSell(me), null, 'not your garden');
  assert.equal(game.findInteraction(me)?.verb, 'Steal', 'E still steals');
});

test('full garden + a seed: E offers Drop, the Sell button makes room and the seed plants itself', () => {
  const { game, me, g } = setup();
  noBots(game);
  me.cash = 0;
  const open = g.planters.filter((pl) => pl.unlocked);
  for (const pl of open) grown(game, pl, me.slot);
  const pl = open[0];
  standAt(me, g, pl);
  me.carrying = { kind: 'seed', speciesId: PLANTS[0].id, mutation: 'normal', podId: 0 };
  const f = game.findInteraction(me);
  assert.equal(f?.verb, 'Drop', 'E: drop the seed (never sell): ' + f?.verb);
  assert.equal(game.findSell(me)?.key, 'sell' + pl.index);
  run(game, me, PLAYER.sellHold + 0.3, { sell: true });
  assert.equal(me.carrying, null, 'the seed went into the freed planter');
  assert.equal(pl.plant?.speciesId, PLANTS[0].id);
  assert.equal(pl.plant.growLeft > 0, true);
});

test('bots still sell to make room (their own Sell intent)', () => {
  bus.clear();
  const game = new Game({ humanId: null, difficulty: 'normal', seed: 21 });
  for (const p of game.players) p.controller = new BotController(p.char.personality, 'normal', { seed: 5 + p.slot });
  // every bot's garden is full of cheap grown plants: room only comes from selling
  for (const g of game.gardens) for (const pl of g.planters) if (pl.unlocked) grown(game, pl, g.slot, PLANTS[0].id);
  const sold = [];
  const held = new Set();
  bus.on('plant:sold', (e) => sold.push(e.player.slot));
  for (let t = 0; t < 120 && sold.length < 2; t += 1 / 30) {
    game.update(1 / 30);
    for (const p of game.players) if (p.intent?.sell) held.add(p.slot);
  }
  assert.ok(sold.length >= 1, 'a bot sold a plant: ' + sold.join());
  assert.ok(sold.every((s) => held.has(s)), 'by holding Sell (not interact)');
});

test('the Sell prompt crosses the wire like the E prompt (serialized, vetted, applied)', () => {
  const { game, me, g } = setup();
  noBots(game);
  const pl = g.planters[0];
  grown(game, pl, me.slot);
  standAt(me, g, pl);
  run(game, me, 0.5, { sell: true });
  const full = game.serializeFull();
  const d = full.players[me.slot];
  assert.equal(d.sell.key, 'sell' + pl.index);
  assert.ok(d.sell.t > 0.3 && d.sell.value > 0);
  const json = JSON.parse(JSON.stringify(full));
  assert.ok(vetFull(json));
  bus.clear();
  const mirror = new Game({ humanId: 'esther', seed: 9 });
  mirror.applyFull(json, { localSlot: 1, force: true });
  assert.equal(mirror.players[me.slot].sell.key, 'sell' + pl.index);
  assert.equal(mirror.players[me.slot].sell.value, d.sell.value);
  // a new Sell prompt counts as a change worth sending right away; the filling ring alone doesn't
  const s0 = signature('p0', sectionize(full).p0);
  const moved = JSON.parse(JSON.stringify(full.players[0]));
  moved.sell.t += 0.2;
  assert.equal(signature('p0', moved), s0);
  moved.sell.key = null;
  assert.notEqual(signature('p0', moved), s0);
  // junk from the network is cleaned up
  const bad = JSON.parse(JSON.stringify(full.players[0]));
  bad.sell = { key: { x: 1 }, label: 'x'.repeat(300), rarity: '__proto__', value: 'lots', t: NaN };
  assert.ok(vetPlayer(bad, 0));
  assert.deepEqual([bad.sell.key, bad.sell.label, bad.sell.rarity, bad.sell.value, bad.sell.t], [null, '', undefined, 0, 0]);
  const none = JSON.parse(JSON.stringify(full.players[0]));
  delete none.sell;
  assert.ok(vetPlayer(none, 0) && none.sell.key === null, 'an older state without it still loads');
});

test('pet tricks: walkers and flyers, per-pet cooldown, one event for everyone', () => {
  const { game, me } = setup();
  noBots(game);
  me.baseLevel = 10;
  game.setPets(me, ['bunny', 'dragon']);
  assert.ok(!PET.bunny.flies && PET.dragon.flies);
  const seen = [];
  bus.on('pet:trick', (e) => seen.push(e));
  const bot = game.players[1];
  const t1 = game.petTrick(bot, me.slot, 0);
  assert.ok(PET_TRICKS.walk.includes(t1), 'a walker trick: ' + t1);
  assert.equal(seen.length, 1);
  assert.deepEqual({ ...seen[0], player: seen[0].player.slot }, { player: 1, owner: me.slot, k: 0, trick: t1, pet: 'bunny' });
  assert.equal(game.petTrick(me, me.slot, 0), null, 'cooling down');
  const t2 = game.petTrick(me, me.slot, 1);
  assert.ok(PET_TRICKS.fly.includes(t2), 'the other pet has its own cooldown, and flies: ' + t2);
  run(game, me, PET_TRICKS.cooldown + 0.05);
  const t3 = game.petTrick(me, me.slot, 0);
  assert.ok(t3 && t3 !== t1, 'never the same trick twice in a row');
  run(game, me, PET_TRICKS.cooldown + 0.05);
  assert.equal(game.petTrick(me, me.slot, 0, 'spin'), 'spin', 'a trick the clicker already started is kept');
  run(game, me, PET_TRICKS.cooldown + 0.05);
  assert.ok(PET_TRICKS.walk.includes(game.petTrick(me, me.slot, 0, 'loop')), "a walker can't loop: it picks its own");
  // nothing there
  assert.equal(game.petTrick(me, me.slot, 2), null, 'no third pet');
  assert.equal(game.petTrick(me, 2, 0), null, 'Mati has no pets');
  assert.equal(game.petTrick(me, 9, 0), null);
  assert.equal(game.petTrick(me, me.slot, 'x'), null);
  me.baseLevel = 1;
  game._refreshMods(me);
  run(game, me, PET_TRICKS.cooldown + 0.05);
  assert.equal(game.petTrick(me, me.slot, 1), null, 'only active pets do tricks');
  // the network only lets known tricks through
  assert.ok(EventCodec.vet('pet:trick', { owner: 0, k: 1, trick: 'loop', pet: 'dragon' }));
  assert.equal(EventCodec.vet('pet:trick', { owner: 0, k: 1, trick: 'moonwalk' }), null);
  assert.equal(EventCodec.vet('pet:trick', { owner: '__proto__', k: 1, trick: 'loop' }), null);
  assert.equal(EventCodec.vet('pet:trick', { owner: 0, k: 7, trick: 'loop' }), null);
});

// ------------------------------------------------------------------ online (in-memory room)

test('online: a friend sells with the Sell hold (E does nothing) and pet tricks reach everyone', async () => {
  bus.clear();
  const hub = new MemoryHub();
  const apps = [];
  const step = async (sec, dt = 1 / 30) => {
    for (let i = 0; i < Math.max(1, Math.round(sec / dt)); i++) {
      for (const a of apps) a.frame(dt);
      hub.advance(dt);
      await new Promise((r) => setImmediate(r));
    }
  };
  const slotOf = (a) => a.online.mySlot;
  const me = (a) => a.game.players[slotOf(a)];
  try {
    const A = new StubApp('Alice', { hub, base: 'dorian' });
    const B = new StubApp('Bob', { hub, base: 'esther' });
    const C = new StubApp('Cleo', { hub, base: 'maddie' });
    apps.push(A, B, C);
    const code = await A.online.createRoom({ private: true });
    await new Promise((r) => setTimeout(r, 0));
    await step(0.1);
    assert.ok(await B.online.joinRoom(code));
    assert.ok(await C.online.joinRoom(code));
    await step(0.6);
    hub.latency = 0.04;
    const sB = slotOf(B);
    const hostB = () => A.game.players[sB];
    for (const q of A.game.players) if (q.kind === 'bot') q.controller = null;
    // a grown plant in Bob's garden, Bob next to it
    const gB = A.game.gardens[sB];
    const pl = gB.planters[0];
    grown(A.game, pl, sB);
    await step(0.5);
    assert.ok(B.game.gardens[sB].planters[0].plant, 'the plant shows up on his device');
    const x = pl.x - gB.L.inward * 2.5, z = pl.z;
    const p = me(B);
    place(p, x, z);
    const m = A.online.role.members.get(B.online.pid);
    Object.assign(m.base, { x, y: 0, z, vx: 0, vy: 0, vz: 0, t: A.online.clock, c: null });
    await step(0.4);
    assert.equal(me(B).sell.key, 'sell0', 'his Sell prompt is local (no waiting for the host)');
    assert.ok(me(B).sell.value > 0);
    // E: nothing
    B.pad.hold = true;
    await step(1.6);
    B.pad.hold = false;
    await step(0.3);
    assert.ok(pl.plant, 'holding E never sells');
    // the Sell hold: fills on his device, the host sells
    const cash = hostB().cash;
    B.pad.sell = true;
    await step(0.5);
    assert.ok(me(B).sell.t > 0.2 && pl.plant, 'the ring fills on his device: ' + me(B).sell.t.toFixed(2));
    assert.ok(hostB().sell.t > 0, 'and on the host');
    await step(1.0);
    B.pad.sell = false;
    await step(0.4);
    assert.equal(pl.plant, null, 'the host sold it');
    assert.ok(hostB().cash > cash && Math.floor(me(B).cash) === Math.floor(hostB().cash), 'his cash went up everywhere');
    assert.equal(B.game.gardens[sB].planters[0].plant, null);
    // a lost connection lets go of Sell
    grown(A.game, pl, sB);
    await step(0.4);
    B.pad.sell = true;
    await step(0.2);
    assert.ok(m.ctrl.sellHeld);
    m.lastIn = A.online.clock - 5;
    A.online.role.update(0);
    assert.equal(m.ctrl.sellHeld, false, 'lost contact: Sell released');
    B.pad.sell = false;
    await step(0.3);

    // pet tricks: Bob clicks Alice's pet; Alice and Cleo see it (Bob already did)
    A.act('setPets', ['bunny']);
    await step(0.5);
    const sA = slotOf(A);
    const seenBy = (a) => {
      const list = [];
      bus.on('pet:trick', (e) => {
        if (a.game.players.includes(e.player)) list.push(e);
      });
      return list;
    };
    const onA = seenBy(A), onB = seenBy(B), onC = seenBy(C);
    const r = B.act('petTrick', sA, 0);
    assert.equal(r, true, 'his click starts the trick right away');
    assert.equal(onB.length, 1);
    for (let i = 0; i < 4; i++) B.act('petTrick', sA, 0); // spam: cooling down
    await step(0.6);
    assert.equal(onA.length, 1, 'the host played it once');
    assert.equal(onA[0].player, hostB(), 'clicked by Bob');
    assert.equal(onA[0].trick, onB[0].trick, 'the same trick everywhere');
    assert.ok(PET_TRICKS.walk.includes(onA[0].trick));
    assert.equal(onC.length, 1, 'Cleo sees it too');
    assert.equal(onC[0].owner, sA);
    assert.equal(onB.length, 1, "Bob doesn't play the host's echo again");
    // a forged trick id is ignored by the host
    await step(1.2);
    B.online.role._edge('a', ['petTrick', [sA, 0, 'moonwalk']]);
    await step(0.6);
    assert.equal(onA.length, 2);
    assert.ok(PET_TRICKS.walk.includes(onA[1].trick), 'unknown trick: the host picks one: ' + onA[1].trick);
  } finally {
    for (const a of apps) a.online.leave();
  }
});
