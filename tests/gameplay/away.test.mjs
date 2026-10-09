// Welcome-Back Garden: time away keeps the gardens growing (solo Endless, closed form). No browser.
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { PLANTS, AWAY, BASE } from '../../src/config.js';
import { isCleanLine } from '../../src/net/protocol.js';
import { awayLines, awayTime } from '../../src/ui/away.js';

const SP = PLANTS[5].id;
function setup(seed = 3) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed });
  for (const q of game.players) if (q.kind === 'bot') q.controller = null;
  // never roll a size here unless a test asks (the dice land on 'normal')
  game.rng.next = () => 0.999;
  return { game, me: game.human, g: game.gardens[game.human.slot] };
}
const put = (pl, slot, growLeft, growTotal = 60) => {
  pl.unlocked = true;
  pl.plant = { uid: 9100 + slot * 30 + pl.index, speciesId: SP, mutation: 'normal', growTotal, growLeft, owner: slot };
  return pl.plant;
};

test('applyAway(2 h): grown plants pay into the COLLECT pile, growing ones grow, in closed form', () => {
  const { game, me, g } = setup();
  const a = put(g.planters[0], me.slot, 0); // grown
  const b = put(g.planters[1], me.slot, 1000, 2000); // finishes after 1000 s of credit
  const c = put(g.planters[2], me.slot, 1e6, 1e6); // won't finish
  const inc = game.plantIncome(a, me);
  const rate = game.growRate(g);
  const cash = me.cash, pile = g.cashPile;
  const events = [];
  bus.on('plant:grown', (e) => events.push(e));
  const r = game.applyAway(7200);
  const credit = AWAY.rate * Math.min(7200, AWAY.cap(me.baseLevel));
  assert.equal(r.credit, credit);
  assert.equal(r.seconds, 7200);
  assert.equal(b.growLeft, 0, 'b finished');
  assert.equal(b.size, 'normal', 'and rolled its size');
  assert.equal(r.grown, 1);
  const expected = inc * credit + game.plantIncome(b, me) * (credit - 1000 / rate);
  assert.ok(Math.abs(g.cashPile - pile - expected) < 1e-6, `pile +${(g.cashPile - pile).toFixed(2)} vs ${expected.toFixed(2)}`);
  assert.ok(Math.abs(r.cash - expected) < 1e-6);
  assert.equal(me.cash, cash, 'cash waits on the pad (COLLECT teaches the loop)');
  assert.ok(Math.abs(c.growLeft - (1e6 - credit * rate)) < 1e-6, 'growLeft drops by credit x growRate');
  assert.equal(events.length, 0, 'quiet: the card reports it');
});

test('the cap follows the base level; gaps over 30 days count as the cap', () => {
  for (const [lv, hours] of [[1, 2], [5, 2], [6, 4], [9, 4], [10, 8]]) {
    const { game, me } = setup();
    me.baseLevel = lv;
    const r = game.applyAway(30 * 3600);
    assert.equal(r.credit, AWAY.rate * hours * 3600, `Lv ${lv}: ${hours} h`);
  }
  const { game } = setup();
  assert.equal(game.applyAway(90 * 86400).credit, AWAY.rate * AWAY.cap(1));
  assert.equal(setup().game.applyAway(Infinity).credit, AWAY.rate * AWAY.cap(1));
  // a short break is credited in full (under the cap)
  assert.equal(setup().game.applyAway(1200).credit, AWAY.rate * 1200);
});

test('short breaks, negative gaps and junk do nothing', () => {
  for (const sec of [0, 60, AWAY.minGap - 1, -5000, NaN, undefined, null, '7200x']) {
    const { game, me, g } = setup();
    put(g.planters[0], me.slot, 0);
    const p = put(g.planters[1], me.slot, 30);
    assert.equal(game.applyAway(sec), null, String(sec));
    assert.equal(g.cashPile, 0);
    assert.equal(p.growLeft, 30);
  }
});

test('the bots keep pace: every garden grows while you are away', () => {
  const { game, me } = setup();
  const bots = game.players.filter((p) => p !== me);
  for (const b of bots) put(game.gardens[b.slot].planters[0], b.slot, 0);
  const r = game.applyAway(3600);
  for (const b of bots) {
    const g = game.gardens[b.slot];
    const want = game.plantIncome(g.planters[0].plant, b) * AWAY.rate * 3600;
    assert.ok(Math.abs(g.cashPile - want) < 1e-6, b.name);
  }
  assert.equal(r.bots.length, 3);
});

test('plants finishing while away roll their sizes (and the report lists the giants)', () => {
  const { game, me, g } = setup();
  for (let i = 0; i < 4; i++) put(g.planters[i], me.slot, 10);
  const rolls = [0.001, 0.01, 0.05, 0.999]; // titan, giant, big, normal
  game.rng.next = () => rolls.shift() ?? 0.999;
  const r = game.applyAway(3600);
  assert.equal(r.grown, 4);
  assert.deepEqual(g.planters.slice(0, 4).map((pl) => pl.plant.size), ['titan', 'giant', 'big', 'normal']);
  assert.deepEqual(r.sizes, { big: 1, giant: 1, titan: 1 });
  assert.deepEqual(r.giants.map((x) => x.size), ['titan', 'giant', 'big']);
});

test('saves remember when (savedAt), and a fresh game has nothing to report', () => {
  const { game } = setup();
  const t = Date.now();
  const s = game.serialize();
  assert.ok(s.savedAt >= t && s.savedAt <= Date.now() + 5);
  assert.equal(JSON.parse(JSON.stringify(s)).savedAt, s.savedAt);
  const fresh = new Game({ humanId: 'dorian', seed: 1 });
  const r = fresh.applyAway(4 * 3600);
  assert.equal(r.grown, 0);
  assert.equal(r.cash, 0);
});

test('the card: kind family stories, Guard Gnome at Base Lv 5, friendly times', () => {
  const { game, me } = setup();
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 30; i++) {
    const lines = awayLines(game, { bots: [{ slot: 1, grown: 3 }] }, rand);
    assert.ok(lines.length >= 1 && lines.length <= 3);
    assert.ok(lines.some((l) => l.includes('Micah')), 'Micah always gets a line');
    for (const l of lines) assert.ok(isCleanLine(l) && !l.includes('{'), l);
    assert.ok(!lines.some((l) => /Gnome/.test(l)), 'no gnome below Base Lv 5');
  }
  me.baseLevel = BASE.guardAt;
  assert.ok(awayLines(game, {}, rand).some((l) => /Guard Gnome shooed Micah/.test(l)));
  assert.equal(awayTime(400), '7 minutes');
  assert.equal(awayTime(3 * 3600 + 100), '3 hours');
  assert.equal(awayTime(3600), '1 hour');
  assert.equal(awayTime(5 * 86400), '5 days');
});
