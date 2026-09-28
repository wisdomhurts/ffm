// Base levels + Base Studio, pet teams, egg drops, Boost, treadmills (no browser).
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, profileTeam } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { LAYOUT, beltRect } from '../../src/gameplay/layout.js';
import { BASE, BOOST, TREADMILL, DROPS, EVENTS, baseIncomeMult, petSlotsFor, decorSpotsFor, speedCost, speedAt, GEARS } from '../../src/config.js';
import { PETS, PET, EGGS, EGG, SHOP_EGGS } from '../../src/pets/catalog.js';
import { teamMods, petMods } from '../../src/pets/effects.js';
import { effectiveBaseStyle, sanitizeBaseStyle, DECOR } from '../../src/gameplay/basestyle.js';
import { vetSlotData, vetFull, sectionize, mergeSections } from '../../src/net/protocol.js';
import { emptyIntent } from '../../src/gameplay/player.js';

function setup(seed = 5) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed });
  return { game, me: game.human, g: game.gardens[game.human.slot] };
}

const place = (p, x, z, y = 0) => {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = y;
  p.vel.x = p.vel.y = p.vel.z = 0;
};
const inside = (g) => g.L.inside;
/** Drive one player with a fixed intent for `secs` (others idle). */
function run(game, p, secs, intent = {}) {
  p.controller = { getIntent: () => ({ ...emptyIntent(), ...intent }) };
  const steps = Math.round(secs * 60);
  for (let i = 0; i < steps; i++) game.update(1 / 60);
  p.controller = null;
}

test('catalog: 10 eggs (9 sold + the drop-only Rainbow Egg), every pet hatches from one egg', () => {
  assert.equal(EGGS.length, 10);
  assert.equal(SHOP_EGGS.length, 9);
  assert.equal(EGG.rainbow.shop, false);
  assert.deepEqual(SHOP_EGGS.map((e) => e.price), [...SHOP_EGGS.map((e) => e.price)].sort((a, b) => a - b));
  for (const p of PETS) assert.ok(p.egg && EGG[p.egg], `${p.id} has an egg`);
  assert.equal(PETS.length, 37);
  assert.ok(PETS.some((p) => p.rarity === 'divine'));
});

test('pet teams stack with caps; slots open with the base level', () => {
  assert.deepEqual([1, 2, 3, 4, 7, 8, 10].map(petSlotsFor), [1, 1, 1, 2, 2, 3, 3]);
  const t = teamMods(['rainbowdragon', 'sunlion', 'pegasus']);
  assert.ok(t.income <= 2.5 && t.income > 2);
  assert.ok(t.speed <= 1.3);
  assert.equal(teamMods(['bunny']).speed, petMods('bunny').speed);
  const { game, me } = setup();
  game.setPets(me, ['phoenix', 'dragon', 'unicorn']);
  assert.deepEqual(game.activePets(me), ['phoenix'], 'Lv 1: one slot');
  assert.equal(me.pet, 'phoenix');
  me.baseLevel = 4;
  game._refreshMods(me);
  assert.deepEqual(game.activePets(me), ['phoenix', 'dragon']);
  assert.ok(me.mods.income > petMods('phoenix').income);
  // older profiles: one equipped uid; newer: a team of uids
  assert.deepEqual(profileTeam({ pets: { owned: [{ uid: 'a', id: 'fox' }], equipped: 'a' } }), ['fox']);
  assert.deepEqual(profileTeam({ pets: { owned: [{ uid: 'a', id: 'fox' }, { uid: 'b', id: 'owl' }], equipped: 'a', team: ['a', 'b'] } }), ['fox', 'owl']);
  assert.deepEqual(profileTeam({ pets: ['fox', 'nope', 'owl'] }), ['fox', 'owl']);
});

test('base upgrades: in your own garden, in order, income bonus, survive rebirth', () => {
  const { game, me, g } = setup();
  const ev = [];
  bus.on('base:upgraded', (e) => ev.push(e));
  place(me, 0, 0);
  me.cash = 1e12;
  assert.equal(game.upgradeBase(me), false, 'not in the garden');
  place(me, inside(g).x, inside(g).z);
  assert.equal(game.upgradeBase(me), true);
  assert.equal(me.baseLevel, 2);
  assert.equal(me.cash, 1e12 - BASE.cost[2]);
  assert.equal(ev[0].level, 2);
  while (game.upgradeBase(me));
  assert.equal(me.baseLevel, BASE.maxLevel);
  assert.equal(baseIncomeMult(10), 1.18);
  // rebirth keeps the base level
  place(me, LAYOUT.shops.rebirth.x, LAYOUT.shops.rebirth.z);
  me.cash = 1e15;
  assert.equal(game.rebirth(me), true);
  assert.equal(me.baseLevel, BASE.maxLevel);
});

test('Base Studio: locked picks fall back, solid decorations collide, trampolines bounce', () => {
  const { game, me, g } = setup();
  game.setBaseStyle(me, { floor: 'gold', fence: 'hedge', laser: 'rainbow', decor: ['fountain', 'trampoline', 'statue', null, null, null] });
  assert.equal(me.baseStyle.floor, 'gold');
  assert.deepEqual(g.look, effectiveBaseStyle(me.baseStyle, 1));
  assert.equal(g.look.floor, 'lawn');
  assert.deepEqual(g.look.decor, [null, null, null, null, null, null]);
  me.baseLevel = 4;
  game._syncBase(g);
  assert.equal(g.look.fence, 'hedge');
  assert.deepEqual(g.look.decor, ['fountain', 'trampoline', null, null, null, null]);
  assert.equal(game.decorBoxes[g.slot][0].off, false, 'fountain is solid');
  assert.equal(game.decorBoxes[g.slot][1].off, true, 'trampoline is walk-through');
  assert.equal(g.bouncers.length, 1);
  // walk onto the trampoline: boing
  const spot = g.L.decor[1];
  let bounced = 0;
  bus.on('base:bounce', () => bounced++);
  place(me, spot.x, spot.z);
  me.onGround = true;
  run(game, me, 0.1);
  assert.ok(bounced >= 1);
  assert.ok(me.pos.y > 0.5 || me.vel.y > 0);
  // sanitize junk
  assert.deepEqual(sanitizeBaseStyle({ floor: 'lava', decor: 'x' }).decor.length, 6);
  assert.equal(decorSpotsFor(7), 6);
});

test('Guard Gnome (Lv 5) bonks a thief stealing from its garden', () => {
  const { game, me, g } = setup();
  const thief = game.players.find((p) => p !== me);
  me.baseLevel = BASE.guardAt;
  game._syncBase(g);
  const pl = g.planters[0];
  pl.plant = { uid: 999, speciesId: 'daisy', mutation: 'normal', growTotal: 1, growLeft: 0, owner: me.slot };
  place(thief, pl.x - g.L.inward * 3.2, pl.z);
  const hits = [];
  bus.on('guard:bonk', (e) => hits.push(e));
  thief.controller = { getIntent: () => ({ ...emptyIntent(), interact: true }) };
  for (let i = 0; i < 60 && !hits.length; i++) game.update(1 / 60);
  thief.controller = null;
  assert.equal(hits.length, 1, 'bonked');
  assert.equal(hits[0].target, thief);
  assert.equal(pl.plant?.uid, 999, 'plant stays home');
  assert.ok(g.guardReadyAt > game.time);
});

test('egg drops fall, land and hatch for whoever touches them first', () => {
  const { game, me } = setup();
  const got = [];
  bus.on('pet:hatched', (e) => got.push(e));
  const d = game.spawnDrop({ egg: 'farm', x: 5, z: 10 });
  assert.ok(d && game.dropY(d) === DROPS.fallFrom);
  place(me, 5, 10);
  game.update(0.5);
  assert.equal(got.length, 0, 'still in the air');
  while (game.time < d.landAt + 0.1) game.update(0.1);
  assert.equal(got.length, 1);
  assert.equal(got[0].player, me);
  assert.equal(got[0].free, true);
  assert.equal(PET[got[0].pet].egg, 'farm');
  assert.equal(game.drops.length, 0);
  assert.equal(me.stats.eggs, 1);
  // a bot that grabs one keeps its best three pets
  const bot = game.players.find((p) => p.kind === 'bot');
  for (let i = 0; i < 5; i++) game._botAdoptPet(bot, ['bunny', 'dragon', 'phoenix', 'chick', 'axolotl'][i]);
  assert.equal(bot.pets.length, 3);
  assert.ok(bot.pets.includes('axolotl') && bot.pets.includes('phoenix'));
  // random drops keep coming, and the Egg Rain event drops a burst
  const g2 = setup(9).game;
  g2.nextDropAt = 1;
  g2.update(0.1);
  for (let i = 0; i < 20; i++) g2.update(0.1);
  assert.ok(g2.drops.length >= 1);
  g2.startEvent('eggrain');
  for (let t = 0; t < EVENTS.duration; t += 0.1) g2.update(0.1);
  assert.ok(g2.drops.length >= 5, `egg rain dropped ${g2.drops.length}`);
  assert.ok(g2.drops.every((x) => EGG[x.egg]));
  assert.equal(g2.buyEgg(g2.human, 'rainbow'), null, 'rainbow eggs are never sold');
});

test('Boost: a burst of speed with a cooldown; levels make it stronger', () => {
  const { game, me } = setup();
  place(me, 0, 0);
  const base = me.maxSpeed(game.time);
  run(game, me, 0.05, { boost: true });
  assert.ok(me.maxSpeed(game.time) > base * 1.4);
  const until = me.boostUntil;
  run(game, me, 0.05, { boost: true });
  assert.equal(me.boostUntil, until, 'cooldown');
  run(game, me, BOOST.duration(0) + 0.1);
  assert.equal(me.maxSpeed(game.time), base);
  // shop: at the Boost Lab
  me.cash = 1e12;
  assert.equal(game.buyBoost(me), false, 'away from the shop');
  const st = LAYOUT.speedStations.find((s) => s.id === 'boost');
  place(me, st.x, st.z, TREADMILL.beltTop);
  while (game.buyBoost(me));
  assert.equal(me.boostLevel, BOOST.maxLevel);
  assert.ok(BOOST.power(10) > BOOST.power(0) && BOOST.cooldown(10) < BOOST.cooldown(0));
});

test('Speed shop: buy x10 and MAX; stations prompt their own thing', () => {
  const { game, me } = setup();
  const st = (id) => LAYOUT.speedStations.find((s) => s.id === id);
  place(me, st('speed').x, st('speed').z, TREADMILL.beltTop);
  me.cash = speedCost(1) + speedCost(2) + speedCost(3) + 5;
  assert.equal(game.buySpeed(me, 10), true);
  assert.equal(me.speedLevel, 3, 'as many as affordable');
  me.cash = 1e9;
  assert.equal(game.buySpeed(me, 'max'), true);
  assert.ok(me.speedLevel > 20);
  assert.ok(me.cash < speedCost(me.speedLevel + 1));
  assert.equal(game.findInteraction(me).key, 'shop:speed');
  place(me, st('boost').x, st('boost').z, TREADMILL.beltTop);
  assert.equal(game.findInteraction(me).key, 'shop:boost');
  place(me, 0, -46);
  assert.equal(game.findInteraction(me).key, 'shop:speed-open');
});

test('belts carry you back; staying on a warm-up belt gets you Pumped', () => {
  const { game, me } = setup();
  const st = LAYOUT.speedStations.find((s) => s.id === 'warmup');
  const r = beltRect(st);
  // standing still: carried off the open (north) end
  place(me, st.x, st.z, TREADMILL.beltTop);
  me.onGround = true;
  run(game, me, 0.3);
  assert.ok(me.pos.z > st.z + 1, 'carried north');
  // running south against it (towards the console): stay on, warm up, get pumped
  place(me, st.x, st.z, TREADMILL.beltTop);
  me.onGround = true;
  const pumps = [];
  bus.on('pump:start', (e) => pumps.push(e));
  const tier = TREADMILL.tiers[0];
  run(game, me, tier.warmup + 0.5, { moveX: 0, moveZ: -0.62 });
  assert.ok(me.pos.z > r.minZ && me.pos.z < r.maxZ, 'still on the belt');
  assert.equal(pumps.length, 1);
  assert.ok(me.pumpUntil > game.time);
  assert.ok(Math.abs(me.maxSpeed(game.time) - speedAt(0) * (1 + tier.bonus)) < 1e-6);
  // better treadmill tiers
  me.cash = 1e12;
  place(me, st.x, st.z, TREADMILL.beltTop);
  while (game.buyTreadmill(me));
  assert.equal(me.treadmillTier, TREADMILL.tiers.length - 1);
  assert.equal(GEARS.length, 3);
});

test('home treadmill (Base Lv 6): solid, warms you up, and sells speed', () => {
  const { game, me, g } = setup();
  assert.equal(game.treadmillBoxes[g.slot][0].off, true);
  me.baseLevel = BASE.treadmillAt;
  game._syncBase(g);
  assert.equal(game.treadmillBoxes[g.slot][0].off, false);
  const t = g.L.treadmill;
  place(me, t.x, t.z, TREADMILL.beltTop);
  me.cash = 1e6;
  assert.equal(game.nearSpeedShop(me), true);
  assert.equal(game.buySpeed(me), true);
  assert.equal(game.findInteraction(me).key, 'home:speed');
});

test('saves and the network carry base levels, boost, treadmill tier and drops', () => {
  const { game, me, g } = setup();
  me.baseLevel = 7;
  me.boostLevel = 4;
  me.treadmillTier = 2;
  const bot = game.players[1];
  bot.pets = ['dragon'];
  const s = game.serialize();
  const back = new Game({ humanId: 'dorian', seed: 1, save: s });
  assert.equal(back.human.baseLevel, 7);
  assert.equal(back.human.boostLevel, 4);
  assert.equal(back.human.treadmillTier, 2);
  assert.deepEqual(back.players[1].pets, ['dragon']);
  const slot = vetSlotData({ player: { baseLevel: 99, boostLevel: 99, treadmillTier: 99 } });
  assert.equal(slot.player.baseLevel, BASE.maxLevel);
  assert.equal(slot.player.boostLevel, BOOST.maxLevel);
  assert.equal(slot.player.treadmillTier, TREADMILL.tiers.length - 1);
  // full state round trip (what online clients see)
  game.setBaseStyle(me, { floor: 'stone', decor: ['oak', null, null, null, null, null] });
  game.spawnDrop({ egg: 'ocean', x: 1, z: 2 });
  game.setPets(me, ['fox', 'owl']);
  const full = vetFull(JSON.parse(JSON.stringify(game.serializeFull())));
  assert.ok(full);
  const mirror = new Game({ humanId: 'esther', seed: 2 });
  mirror.applyFull(full, { localSlot: 1 });
  assert.equal(mirror.players[0].baseLevel, 7);
  assert.equal(mirror.gardens[0].look.floor, 'stone');
  assert.equal(mirror.gardens[0].look.decor[0], 'oak');
  assert.deepEqual(mirror.players[0].pets, ['fox', 'owl']);
  assert.equal(mirror.drops.length, 1);
  // deltas carry drops too
  const S = sectionize(game.serializeFull());
  const copy = JSON.parse(JSON.stringify(full));
  copy.drops = [];
  mergeSections(copy, { dr: S.dr });
  assert.equal(copy.drops.length, 1);
});
