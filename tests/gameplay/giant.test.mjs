// Giant Harvests: a plant rolls Big / GIANT / TITAN when it finishes growing (no browser).
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SELL_SECONDS, NETWORTH_PLANT_SECONDS } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { makeRng } from '../../src/core/rng.js';
import { PLANTS, SIZES, SIZE_ODDS } from '../../src/config.js';
import { EventCodec, vetFull, vetPlantData, vetSlotData, signature, sectionize, isBotLine } from '../../src/net/protocol.js';
import { cheerGiant } from '../../src/ai/family.js';
import { shownSize, markReveal, sizeChip, REVEAL } from '../../src/view/sizes.js';
import { StubApp, MemoryHub } from '../net/stub.mjs';

const SP = PLANTS[3].id;
function setup(seed = 5) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed });
  for (const q of game.players) if (q.kind === 'bot') q.controller = null;
  return { game, me: game.human, g: game.gardens[game.human.slot] };
}
const growing = (pl, slot, left = 0.01) => {
  pl.unlocked = true;
  pl.plant = { uid: 8000 + pl.index, speciesId: SP, mutation: 'normal', growTotal: 10, growLeft: left, owner: slot };
  return pl.plant;
};
// the next roll of the rules' dice lands on `r` (giant: just past the TITAN band)
const nextRoll = (game, r) => {
  const real = game.rng.next;
  game.rng.next = () => {
    game.rng.next = real;
    return r;
  };
};
const GIANT_R = SIZES.titan.p + SIZES.giant.p / 2;

test('a plant finishing GIANT: plant:grown {size}, plant:giant with ids, and 3x the income', () => {
  const { game, me, g } = setup();
  const pl = g.planters[0];
  const plant = growing(pl, me.slot);
  const normalInc = game.plantIncome({ ...plant, size: 'normal' }, me);
  const grown = [], giant = [];
  bus.on('plant:grown', (e) => grown.push(e));
  bus.on('plant:giant', (e) => giant.push(e));
  nextRoll(game, GIANT_R);
  game.update(1 / 30);
  assert.equal(plant.growLeft, 0);
  assert.equal(plant.size, 'giant');
  assert.equal(grown.length, 1);
  assert.equal(grown[0].size, 'giant');
  assert.equal(giant.length, 1);
  assert.equal(giant[0].player, me);
  assert.deepEqual(giant[0].plant, { speciesId: SP, mutation: 'normal', size: 'giant' });
  assert.equal(giant[0].planter, pl);
  assert.ok(Math.abs(game.plantIncome(plant, me) - normalInc * 3) < 1e-9, 'income x3');
  // sell value and net worth follow the income
  game._recomputeNetWorth();
  const nw = game.netWorth.get(me);
  assert.ok(nw >= normalInc * 3 * NETWORTH_PLANT_SECONDS, 'net worth counts the giant');
  const cash = me.cash;
  assert.ok(game.sellPlant(me, pl));
  assert.equal(me.cash - cash, Math.round(normalInc * 3 * SELL_SECONDS), 'sells for 3x');
  // a normal finish says size 'normal' and no plant:giant
  const pl2 = g.planters[1];
  growing(pl2, me.slot);
  nextRoll(game, 0.999);
  game.update(1 / 30);
  assert.equal(pl2.plant.size, 'normal');
  assert.equal(grown.at(-1).size, 'normal');
  assert.equal(giant.length, 1);
});

test('a stolen GIANT stays GIANT: the thief gets 3x, and it flies home GIANT', () => {
  const { game, me, g } = setup();
  const thief = game.players[3];
  const pl = g.planters[0];
  const plant = growing(pl, me.slot, 0);
  plant.size = 'giant';
  assert.ok(game.stealPlant(thief, g, pl));
  assert.equal(thief.carrying.plant.size, 'giant');
  assert.ok(Math.abs(game.plantIncome(plant, thief) / game.plantIncome({ ...plant, size: 'normal' }, thief) - 3) < 1e-9);
  game.dropCarried(thief, me, 'bonk');
  assert.equal(pl.plant, plant);
  assert.equal(pl.plant.size, 'giant');
  // gifts move the object too
  assert.ok(game.giftPlant(me, game.players[1], 0));
  assert.equal(game.gardens[1].planters.find((x) => x.plant === plant)?.plant.size, 'giant');
});

test('sizes survive every copy: save/restore, serializeSlot/loadSlot, serializeFull -> vetFull -> applyFull, events', () => {
  const { game, me, g } = setup();
  const sizes = ['big', 'giant', 'titan'];
  sizes.forEach((s, i) => {
    growing(g.planters[i], me.slot, 0).size = s;
  });
  growing(g.planters[3], me.slot, 4); // still growing: no size yet
  // save -> a new game
  const save = JSON.parse(JSON.stringify(game.serialize()));
  bus.clear();
  const g2 = new Game({ humanId: 'dorian', seed: 9, save });
  assert.deepEqual(g2.gardens[me.slot].planters.slice(0, 4).map((pl) => pl.plant.size), [...sizes, 'normal']);
  // a junk size in a save is just normal
  save.gardens[me.slot].planters[0].plant.size = 'constructor';
  const g3 = new Game({ humanId: 'dorian', seed: 9, save });
  assert.equal(g3.gardens[me.slot].planters[0].plant.size, 'normal');
  assert.equal(g3.plantIncome(g3.gardens[me.slot].planters[0].plant, g3.human), g3.plantIncome({ ...g3.gardens[me.slot].planters[0].plant, size: undefined }, g3.human));
  // a slot's garden (online gardens travel like this), vetted like a joiner's
  const slot = vetSlotData(JSON.parse(JSON.stringify(game.serializeSlot(me.slot))));
  assert.deepEqual(slot.garden.planters.slice(0, 3).map((pl) => pl.plant.size), sizes);
  g2.loadSlot(2, slot);
  assert.deepEqual(g2.gardens[2].planters.slice(0, 3).map((pl) => pl.plant.size), sizes);
  // the full world state
  const full = vetFull(JSON.parse(JSON.stringify(game.serializeFull())));
  assert.ok(full);
  assert.deepEqual(full.gardens[me.slot].planters.slice(0, 3).map((pl) => pl.plant.size), sizes);
  g2.applyFull(full, { localSlot: 1 });
  assert.deepEqual(g2.gardens[me.slot].planters.slice(0, 4).map((pl) => pl.plant.size), [...sizes, 'normal']);
  // the network can't invent sizes
  assert.equal(vetPlantData({ speciesId: SP, mutation: 'normal', growTotal: 5, growLeft: 0, size: '__proto__' }).size, 'normal');
  assert.equal(vetPlantData({ speciesId: SP, mutation: 'normal', growTotal: 5, growLeft: 0, size: 'titan' }).size, 'titan');
  // a size change is a change the clients must hear about right away
  const sig = signature('g' + me.slot, sectionize(game.serializeFull())['g' + me.slot]);
  g.planters[0].plant.size = 'giant';
  assert.notEqual(signature('g' + me.slot, sectionize(game.serializeFull())['g' + me.slot]), sig);
  // events carry the size (a plant in an event, and plant:giant's plain ids)
  const codec = new EventCodec(game), codec2 = new EventCodec(g2);
  const e = codec2.decode(codec.encode({ plant: { ...g.planters[2].plant, uid: 424242 } }));
  assert.equal(e.plant.size, 'titan');
  const ev = EventCodec.vet('plant:giant', codec2.decode(codec.encode({ player: me, plant: { speciesId: SP, mutation: 'gold', size: 'giant' }, planter: g.planters[2], garden: g })));
  assert.equal(ev.plant.size, 'giant');
  assert.equal(EventCodec.vet('plant:giant', { player: g2.players[0], plant: { speciesId: SP, mutation: 'normal', size: 'huge' } }), null);
  assert.equal(EventCodec.vet('plant:grown', { size: 'mega' }), null);
});

test('10k rolls land within the odds (and a grow pet / watering raise them)', () => {
  const { game, g } = setup();
  const pt = { watered: false };
  const count = (n, seed) => {
    game.rng = makeRng(seed);
    const c = { normal: 0, big: 0, giant: 0, titan: 0 };
    for (let i = 0; i < n; i++) c[game.rollSize(g, pt)]++;
    return c;
  };
  const N = 10000;
  const within = (c, k) => {
    for (const s of ['big', 'giant', 'titan']) {
      const p = SIZES[s].p * k;
      const sd = Math.sqrt(N * p * (1 - p));
      assert.ok(Math.abs(c[s] - N * p) <= 4 * sd + 2, `${s}: ${c[s]} vs ${(N * p).toFixed(0)} expected (k ${k})`);
    }
  };
  within(count(N, 1), 1);
  pt.watered = true;
  within(count(N, 2), SIZE_ODDS.watered);
  pt.watered = false;
  g.owner.mods = { ...g.owner.mods, grow: 1.2 };
  within(count(N, 3), SIZE_ODDS.growPet);
});

test('economy guard: sizes add less than +8% to a garden at the base odds', () => {
  // exact: E[income multiplier] = 1 + sum of p x (mult - 1)
  const extra = (k) => Object.values(SIZES).reduce((a, s) => a + s.p * k * (s.mult - 1), 0);
  assert.ok(extra(1) < 0.08, `base odds add ${(extra(1) * 100).toFixed(1)}% (must stay under 8%)`);
  assert.ok(extra(SIZE_ODDS.growPet) < 0.1, `with a grow pet: +${(extra(SIZE_ODDS.growPet) * 100).toFixed(1)}%`);
  for (const s of Object.values(SIZES)) assert.ok(s.scale <= 1.8, 'planters are 8 studs apart: ' + s.id);
  // and the real rules agree: thousands of plants finishing in a garden earn what the odds say
  const { game, me, g } = setup(11);
  game.rng = makeRng(77);
  const pl = g.planters[0];
  let sum = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const pt = growing(pl, me.slot, 1);
    game._finishGrowth(g, pl, pt, true);
    sum += SIZES[pt.size].mult;
  }
  const pace = sum / N - 1;
  assert.ok(Math.abs(pace - extra(1)) < 0.012, `measured +${(pace * 100).toFixed(1)}% vs +${(extra(1) * 100).toFixed(1)}% expected`);
  assert.ok(pace < 0.08, `measured pace +${(pace * 100).toFixed(1)}%`);
});

test('a bot near a fresh GIANT shouts WHOA (a clean game line)', () => {
  const { game, me, g } = setup();
  const lines = [];
  bus.on('chat', (e) => lines.push(e));
  const pl = g.planters[0];
  growing(pl, me.slot, 0).size = 'giant';
  const esther = game.players[1];
  esther.pos.x = pl.x + 5;
  esther.pos.z = pl.z;
  const ok = [];
  for (let i = 0; i < 6 && !ok.length; i++) {
    game.time += 20; // past the chat gaps
    if (cheerGiant(game, { player: me, plant: { speciesId: SP, mutation: 'normal', size: 'giant' }, planter: pl, garden: g })) ok.push(true);
  }
  assert.ok(ok.length, 'someone said something');
  const line = lines.at(-1);
  assert.equal(line.player, esther, 'the nearest bot');
  assert.ok(isBotLine(line.text), line.text);
  assert.ok(!cheerGiant(game, { player: me, plant: { speciesId: SP, mutation: 'normal', size: 'big' }, planter: pl, garden: g }), 'Big is nice, not WHOA');
});

test('view: a fresh size waits for its drumroll, then shows; the size chip', () => {
  const plant = { uid: 991, size: 'titan' };
  assert.equal(shownSize(plant, 10), 'titan');
  markReveal(991, 10 + REVEAL);
  assert.equal(shownSize(plant, 10.5), 'normal', 'drumroll: still normal');
  assert.equal(shownSize(plant, 10 + REVEAL), 'titan');
  assert.equal(shownSize(plant, 10.5), 'titan', 'revealed once, for good');
  assert.equal(shownSize({ uid: 1 }, 0), 'normal');
  assert.match(sizeChip('giant'), /GIANT/);
  assert.equal(sizeChip('normal'), '');
  assert.equal(sizeChip('constructor'), '');
});

// ------------------------------------------------------------------ online (in-memory room)

test('online: the host rolls the size, a friend sees the GIANT (state + one plant:giant)', async () => {
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
  try {
    const A = new StubApp('Alice', { hub, base: 'dorian' });
    const B = new StubApp('Bob', { hub, base: 'esther' });
    apps.push(A, B);
    const code = await A.online.createRoom({ private: true });
    await new Promise((r) => setTimeout(r, 0));
    await step(0.1);
    assert.ok(await B.online.joinRoom(code));
    await step(0.6);
    hub.latency = 0.04;
    for (const q of A.game.players) if (q.kind === 'bot') q.controller = null;
    const sA = A.online.mySlot;
    const pl = A.game.gardens[sA].planters[0];
    growing(pl, sA, 30);
    await step(0.6);
    const seen = [];
    bus.on('plant:giant', (e) => {
      if (B.game.players.includes(e.player)) seen.push(e);
    });
    pl.plant.growLeft = 0.01;
    nextRoll(A.game, GIANT_R);
    await step(1.2);
    assert.equal(pl.plant.size, 'giant', 'the host rolled it');
    const mirror = B.game.gardens[sA].planters[0].plant;
    assert.equal(mirror?.size, 'giant', 'Bob sees a GIANT');
    assert.equal(seen.length, 1, 'and hears about it once');
    assert.equal(seen[0].player, B.game.players[sA]);
    assert.equal(seen[0].plant.size, 'giant');
    assert.ok(Math.abs(B.game.plantIncome(mirror, B.game.players[sA]) - A.game.plantIncome(pl.plant, A.game.players[sA])) < 1e-6, 'same income on both devices');
  } finally {
    for (const a of apps) a.online.leave();
  }
});
