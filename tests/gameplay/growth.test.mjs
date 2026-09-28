// Garden lots, the open-ended Speed shop and the far biomes (no browser). Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { LAYOUT } from '../../src/gameplay/layout.js';
import { WORLD, PLANTERS, LOTS, BIOMES, RARITY, PLANT, TOP_TIER, speedCost, speedAt, accelFor, planterCost } from '../../src/config.js';
import { vetSlotData, vetFull, predict } from '../../src/net/protocol.js';
import { UnlockGoal } from '../../src/ai/goals.js';

function setup() {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed: 5 });
  return { game, me: game.human, g: game.gardens[game.human.slot] };
}

const place = (p, x, z) => {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = 0;
};

test('every garden has 10 planters plus 3 lots of 5, inside its fence', () => {
  for (const L of LAYOUT.gardens) {
    assert.equal(L.planters.length, WORLD.planterCount);
    assert.equal(L.planters.filter((p) => p.lot < 0).length, PLANTERS.base);
    for (let k = 0; k < LOTS.count; k++) assert.equal(L.planters.filter((p) => p.lot === k).length, LOTS.planters);
    for (const p of L.planters) {
      assert.ok(p.x - 2.4 > L.bounds.minX + 1 && p.x + 2.4 < L.bounds.maxX - 1 && p.z - 2.4 > L.bounds.minZ + 1 && p.z + 2.4 < L.bounds.maxZ - 1, `planter ${p.index} inside`);
    }
    // the garden's own planters are where they always were (saves and muscle memory)
    assert.equal(Math.abs(L.planters[0].x - L.gate.x), 22.5);
    assert.equal(Math.abs(L.planters[1].x - L.gate.x), 30.5);
    assert.ok(Math.abs(L.bounds.minX) <= WORLD.homeHalfW && Math.abs(L.bounds.maxX) <= WORLD.homeHalfW);
  }
});

test('lots are bought in order, all 5 planters at once', () => {
  const { game, me, g } = setup();
  const events = [];
  bus.on('garden:expanded', (e) => events.push(e));
  bus.on('purchase:fail', (e) => events.push({ fail: e }));
  assert.equal(game.lotsOwned(g), 0);
  assert.equal(game.buyLot(me, 0), false, 'too poor');
  assert.equal(events[0].fail.cost, LOTS.cost[0]);
  me.cash = 1e9;
  assert.equal(game.buyLot(me, 1), false, 'lot 2 before lot 1');
  assert.equal(game.buyLot(me, 0), true);
  assert.equal(me.cash, 1e9 - LOTS.cost[0]);
  assert.equal(me.upgradeSpend, LOTS.cost[0]);
  assert.equal(game.lotsOwned(g), 1);
  assert.deepEqual(g.planters.filter((p) => p.lot === 0 && p.unlocked).map((p) => p.index), [10, 11, 12, 13, 14]);
  assert.equal(g.planters.filter((p) => p.lot === 1 && p.unlocked).length, 0);
  const ev = events.find((e) => e.lot === 0);
  assert.deepEqual(ev.planters, [10, 11, 12, 13, 14]);
  assert.equal(game.buyLot(me, 0), false, 'already bought');
  // unlockPlanter on any lot planter buys that lot (the bots' path)
  assert.equal(game.unlockPlanter(me, 17), true);
  assert.equal(game.lotsOwned(g), 2);
  assert.equal(planterCost(22), LOTS.cost[2]);
  assert.equal(planterCost(5), PLANTERS.unlockCost[5]);
});

test('the lot prompt only shows for the next lot, and only to the owner', () => {
  const { game, me, g } = setup();
  me.cash = 1e9;
  const lot0 = g.planters[12], lot1 = g.planters[17];
  place(me, lot0.x + 3.2 * g.L.inward * -1, lot0.z);
  let it = game.findInteraction(me);
  assert.equal(it?.verb, 'Expand');
  assert.equal(it.key, 'lot0');
  it.action();
  assert.equal(game.lotsOwned(g), 1);
  place(me, lot1.x - 3.2 * g.L.inward, lot1.z);
  it = game.findInteraction(me);
  assert.equal(it?.key, 'lot1');
  // lot 3 is not for sale yet
  const lot2 = g.planters[22];
  place(me, lot2.x + 3.2 * g.L.inward, lot2.z);
  it = game.findInteraction(me);
  assert.ok(!it || it.key !== 'lot2');
  // someone else's garden: never an Expand prompt
  const other = game.players[1];
  const og = game.gardens[1];
  place(other, g.planters[17].x - 3.2 * g.L.inward, g.planters[17].z);
  it = game.findInteraction(other);
  assert.ok(!it || it.verb !== 'Expand');
  assert.equal(game.lotsOwned(og), 0);
});

test('seeds planted in a lot grow and pay like any other planter', () => {
  const { game, me, g } = setup();
  me.cash = 1e9;
  game.buyLot(me, 0);
  for (const pl of g.planters) if (pl.unlocked) pl.plant = { uid: 1000 + pl.index, speciesId: 'daisy', mutation: 'normal', growTotal: 1, growLeft: 0, owner: me.slot };
  assert.equal(g.planters.filter((pl) => pl.plant).length, PLANTERS.startUnlocked + LOTS.planters);
  assert.ok(game.gardenIncome(g) > 0);
});

test('rebirth sells the lots back; saves keep them; old 10-planter saves still load', () => {
  const { game, me, g } = setup();
  me.cash = 1e9;
  game.buyLot(me, 0);
  game.buyLot(me, 1);
  g.planters[15].plant = { uid: 77, speciesId: 'snowflake', mutation: 'gold', growTotal: 260, growLeft: 10, owner: me.slot };
  const save = game.serialize();
  assert.equal(save.gardens[me.slot].planters.length, WORLD.planterCount);
  const g2 = new Game({ humanId: 'dorian', save });
  const gg = g2.gardens[me.slot];
  assert.equal(g2.lotsOwned(gg), 2);
  assert.equal(gg.planters[15].plant?.speciesId, 'snowflake');
  // an old save (10 planters) and a tampered one (a lot planter open out of order) load sanely
  const old = JSON.parse(JSON.stringify(save));
  old.gardens[me.slot].planters = old.gardens[me.slot].planters.slice(0, 10);
  const g3 = new Game({ humanId: 'dorian', save: old });
  assert.equal(g3.lotsOwned(g3.gardens[me.slot]), 0);
  const odd = JSON.parse(JSON.stringify(save));
  odd.gardens[me.slot].planters[10].unlocked = false; // lot 1 closed, lot 2 open
  odd.gardens[me.slot].planters[15].unlocked = true;
  const g4 = new Game({ humanId: 'dorian', save: odd });
  assert.equal(g4.lotsOwned(g4.gardens[me.slot]), 0);
  assert.ok(g4.gardens[me.slot].planters.every((pl) => pl.lot < 0 || !pl.unlocked));
  // rebirth
  place(me, LAYOUT.shops.rebirth.x, LAYOUT.shops.rebirth.z);
  me.cash = 1e12;
  assert.equal(game.rebirth(me), true);
  assert.equal(game.lotsOwned(g), 0);
  assert.equal(g.planters.filter((pl) => pl.unlocked).length, PLANTERS.startUnlocked);
});

test('online: joiners bring their lots; full states carry 25 planters', () => {
  const { game, me } = setup();
  me.cash = 1e9;
  game.buyLot(me, 0);
  const slot = game.serializeSlot(me.slot);
  const v = vetSlotData(JSON.parse(JSON.stringify(slot)));
  assert.equal(v.garden.planters.length, WORLD.planterCount);
  assert.equal(v.garden.planters.filter((p) => p.unlocked).length, PLANTERS.startUnlocked + LOTS.planters);
  const full = vetFull(JSON.parse(JSON.stringify(game.serializeFull())));
  assert.ok(full, 'a 25-planter state passes the network filter');
  const game2 = new Game({ humanId: 'esther', seed: 9 });
  game2.applyFull(full, { localSlot: 1 });
  assert.equal(game2.lotsOwned(game2.gardens[me.slot]), 1);
  // a plant stolen from a lot planter keeps its planter index over the network
  const st = game.serializeFull();
  st.players[2].carrying = { kind: 'plant', plant: { uid: 5, speciesId: 'daisy', mutation: 'normal', growTotal: 1, growLeft: 0, owner: 0 }, fromSlot: 0, fromIndex: 24 };
  assert.equal(vetFull(JSON.parse(JSON.stringify(st))).players[2].carrying.fromIndex, 24);
});

test('bots walk to a lot and press its prompt', () => {
  const goal = new UnlockGoal(12, 1);
  assert.equal(goal.index, 12);
  // the prompt key a bot waits for is the lot's
  const { game, me, g } = setup();
  me.cash = 1e9;
  const pl = g.planters[12];
  place(me, pl.x - 3.2 * g.L.inward, pl.z);
  assert.equal(game.findInteraction(me)?.key, 'lot' + pl.lot);
});

test('Speed has no top level', () => {
  const { game, me } = setup();
  // the Speed treadmill (middle station) offers the next level
  const st = LAYOUT.speedStations.find((s) => s.id === 'speed');
  place(me, st.x, st.z);
  me.pos.y = 0.55;
  me.cash = 1e30;
  for (let i = 0; i < 40; i++) assert.equal(game.buySpeed(me), true);
  assert.equal(me.speedLevel, 40);
  assert.equal(speedAt(40), 96);
  assert.ok(speedCost(41) > speedCost(40));
  assert.match(game.findInteraction(me)?.label || '', /^Speed \+2/);
  // saves keep high levels
  const g2 = new Game({ humanId: 'dorian', save: game.serialize() });
  assert.equal(g2.human.speedLevel, 40);
  assert.equal(vetSlotData({ player: { speedLevel: 60 } }).player.speedLevel, 60);
});

test('fast players get more grip; normal speeds are unchanged', () => {
  assert.equal(accelFor(16), 90);
  assert.equal(accelFor(50), 90);
  assert.equal(accelFor(100), 180);
  assert.equal(accelFor(100, false), 70);
  // a speed-40 runner (96 studs/s) reaches top speed about as fast as a speed-17 runner does
  const { game, me } = setup();
  me.speedLevel = 40;
  place(me, 0, 20);
  me.controller = { getIntent: () => ({ moveX: 0, moveZ: 1, jump: false, interact: false, bonk: false, useItem: null, selectSlot: null, aimYaw: null, emote: null, say: null }) };
  for (let i = 0; i < 60; i++) game._step(1 / 60);
  assert.ok(me.vel.z > 90, `fast runner up to speed in a second (${me.vel.z.toFixed(1)})`);
  // the network's dead reckoning uses the same grip
  const out = { x: 0, y: 0, z: 0 };
  predict({ x: 0, y: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 96, og: true }, 1, out);
  const a = accelFor(96);
  const T = 96 / a; // under a second to top speed, then cruising
  assert.ok(T < 1 && Math.abs(out.z - (0.5 * a * T * T + 96 * (1 - T))) < 1e-6);
});

test('the far biomes: new rarities, monsters, secrets, lucky seeds stop at Divine', () => {
  assert.equal(BIOMES.length, 9);
  assert.deepEqual(BIOMES.slice(6).map((b) => b.rarity), ['celestial', 'cosmic', 'divine']);
  for (const b of BIOMES.slice(1)) assert.ok(b.monster && b.monster.speed > 0);
  for (let i = 2; i < BIOMES.length; i++) assert.ok(BIOMES[i].monster.speed > BIOMES[i - 1].monster.speed, 'monsters get faster');
  assert.equal(RARITY.secret.tier, 9);
  assert.equal(TOP_TIER, RARITY.divine.tier);
  const { game } = setup();
  const counts = {};
  for (let bi = 0; bi < BIOMES.length; bi++) {
    for (let i = 0; i < 4000; i++) {
      const s = game.rollSeed(bi);
      const r = PLANT[s.speciesId].rarity;
      counts[bi] ||= {};
      counts[bi][r] = (counts[bi][r] || 0) + 1;
      assert.ok(r === 'secret' || RARITY[r].tier <= TOP_TIER);
      assert.ok(r === 'secret' || RARITY[r].tier - RARITY[BIOMES[bi].rarity].tier <= 1, 'lucky is one tier at most');
    }
  }
  for (let bi = 0; bi < 5; bi++) assert.ok(!counts[bi].secret, `no secrets in ${BIOMES[bi].name}`);
  for (let bi = 5; bi < BIOMES.length; bi++) assert.ok(counts[bi].secret > 0, `secrets in ${BIOMES[bi].name}`);
  assert.ok(!counts[8].secret || counts[8].secret > counts[5].secret * 0.9, 'the deepest biome has the best secret odds');
  // incomes climb with rarity; Secret stays on top
  const avg = (r) => {
    const l = Object.values(PLANT).filter((p) => p.rarity === r);
    return l.reduce((a, p) => a + p.income, 0) / l.length;
  };
  const order = ['mythic', 'celestial', 'cosmic', 'divine', 'secret'];
  for (let i = 1; i < order.length; i++) assert.ok(avg(order[i]) > avg(order[i - 1]), `${order[i]} pays more than ${order[i - 1]}`);
  // monsters patrol every biome, the road ends after Cloud Kingdom
  assert.ok(game.monsters.some((m) => m.type === 'storm'));
  assert.equal(LAYOUT.roadEndZ, WORLD.road.startZ + BIOMES.length * WORLD.road.biomeLength);
});
