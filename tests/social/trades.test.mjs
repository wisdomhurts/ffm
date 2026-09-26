// Trade manager + gifting rules (no browser). Run: node --test tests/social/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { createTradeManager, TRADE } from '../../src/social/trades.js';

const profile = (id, name, base) => ({ id, name, base, look: {}, pets: { owned: [], equipped: null } });

function place(p, x, z) {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = 0;
  p.vel.x = p.vel.y = p.vel.z = 0;
}

let uid = 50000;
function plant(game, slot, indexes, speciesId = 'sunflower', mutation = 'normal') {
  for (const i of indexes) {
    const pl = game.gardens[slot].planters[i];
    pl.unlocked = true;
    pl.plant = { uid: uid++, speciesId, mutation, growTotal: 25, growLeft: 0, owner: slot };
  }
}

function setup() {
  bus.clear();
  const game = new Game({
    seed: 3,
    slots: [
      { kind: 'local', profile: profile('p_ann', 'Ann', 'dorian') },
      { kind: 'remote', profile: profile('p_ben', 'Ben', 'esther'), pid: 'ben1' },
      { kind: 'bot' },
      { kind: 'bot' },
    ],
  });
  const app = { game };
  const trades = createTradeManager(app);
  const [A, B, C] = game.players;
  // A and B chat by the fountain; the bots are far away
  place(A, 0, 0);
  place(B, 5, 0);
  place(C, -40, -40);
  place(game.players[3], 40, -40);
  plant(game, 0, [0, 1, 2], 'sunflower');
  plant(game, 1, [0, 1], 'lavalily', 'gold');
  A.cash = 1000;
  B.cash = 500;
  const events = [];
  bus.on('*', ({ name, payload }) => {
    if (name.startsWith('trade:') || name.startsWith('gift')) events.push({ name, ...payload });
  });
  const last = (name) => [...events].reverse().find((e) => e.name === name);
  const act = (p, name, ...args) => trades.handle(p, name, args);
  // advance the clock without moving anyone (nobody has a controller)
  const wait = (s) => {
    game.time += s;
    trades.update();
  };
  return { game, app, trades, A, B, C, events, last, act, wait };
}

function openTrade(t) {
  assert.equal(t.act(t.A, 'tradeRequest', 1), true);
  assert.equal(t.act(t.B, 'tradeAccept', 0), true);
  return t.trades.sessionOf(t.A);
}

test('happy path: request, accept, offers, ready, countdown, atomic swap', () => {
  const t = setup();
  const { game, A, B } = t;
  assert.equal(t.act(A, 'tradeRequest', 1), true);
  const inv = t.last('trade:invite');
  assert.equal(inv.from, A);
  assert.equal(inv.to, B);
  assert.equal(t.act(B, 'tradeAccept', 0), true);
  assert.deepEqual([t.last('trade:open').a, t.last('trade:open').b], [A, B]);
  assert.equal(t.last('trade:update').reason, 'open');

  assert.equal(t.act(A, 'tradeOffer', { planters: [0, 2], cash: 200 }), true);
  assert.equal(t.act(B, 'tradeOffer', { planters: [1], cash: 0 }), true);
  let u = t.last('trade:update');
  assert.deepEqual(u.offerA.planters, [0, 2]);
  assert.equal(u.offerA.cash, 200);
  assert.equal(u.offerB.plants[0].speciesId, 'lavalily');
  assert.equal(u.offerB.plants[0].mutation, 'gold');
  assert.ok(u.lockUntil > game.time, 'a change locks Ready for a moment');

  assert.equal(t.act(A, 'tradeReady', true), false, 'Ready is locked right after a change');
  t.wait(TRADE.readyLock + 0.01);
  assert.equal(t.act(A, 'tradeReady', true), true);
  assert.equal(t.act(B, 'tradeReady', true), true);
  u = t.last('trade:update');
  assert.equal(u.readyA && u.readyB, true);
  assert.ok(Math.abs(u.countdownEndsAt - (game.time + TRADE.countdown)) < 1e-9);

  const lilyUid = game.gardens[1].planters[1].plant.uid;
  const sunUids = [game.gardens[0].planters[0].plant.uid, game.gardens[0].planters[2].plant.uid];
  t.wait(TRADE.countdown - 0.5);
  assert.equal(t.last('trade:done'), undefined, 'no swap before the countdown ends');
  t.wait(0.6);
  const done = t.last('trade:done');
  assert.ok(done, 'trade executed');
  assert.equal(done.a, A);
  assert.equal(A.cash, 800);
  assert.equal(B.cash, 700);
  const mine = (slot) => game.gardens[slot].planters.filter((x) => x.plant).map((x) => x.plant.uid);
  assert.ok(mine(0).includes(lilyUid), 'A got the lily');
  assert.ok(sunUids.every((u2) => mine(1).includes(u2)), 'B got both sunflowers');
  assert.ok(game.gardens[0].planters.every((x) => !x.plant || x.plant.owner === 0));
  assert.ok(game.gardens[1].planters.every((x) => !x.plant || x.plant.owner === 1));
  assert.equal(t.trades.sessionOf(A), null, 'session closed');
});

test('any change un-readies both sides and restarts the countdown', () => {
  const t = setup();
  const { A, B } = t;
  openTrade(t);
  t.act(A, 'tradeOffer', { planters: [0], cash: 0 });
  t.act(B, 'tradeOffer', { planters: [0], cash: 0 });
  t.wait(TRADE.readyLock + 0.01);
  t.act(A, 'tradeReady', true);
  t.act(B, 'tradeReady', true);
  assert.ok(t.trades.sessionOf(A).countdownEndsAt > 0);
  t.wait(1);
  // B quietly swaps the lily for nothing but cash
  t.act(B, 'tradeOffer', { planters: [], cash: 5 });
  const u = t.last('trade:update');
  assert.equal(u.reason, 'offer');
  assert.equal(u.changedBy, B);
  assert.equal(u.readyA, false);
  assert.equal(u.readyB, false);
  assert.equal(u.countdownEndsAt, 0);
  t.wait(5);
  assert.equal(t.last('trade:done'), undefined, 'nothing happens without both Ready again');
  // the same offer twice is not a change
  const rev = t.trades.sessionOf(A).rev;
  t.act(B, 'tradeOffer', { planters: [], cash: 5 });
  assert.equal(t.trades.sessionOf(A).rev, rev);
});

test('offers are sanitized: own plants only, max 4, cash clamped, room checked', () => {
  const t = setup();
  const { game, A, B } = t;
  plant(game, 0, [3, 4, 5, 6], 'daisy');
  openTrade(t);
  t.act(A, 'tradeOffer', { planters: [0, 0, 1, 2, 3, 4, 5, 9, -1, 'x'], cash: 99999 });
  const s = t.trades.sessionOf(A);
  assert.deepEqual(s.offerA.planters, [0, 1, 2, 3]);
  assert.equal(s.offerA.cash, 1000);
  const n = t.events.length;
  t.act(B, 'tradeOffer', { planters: [7, 8], cash: -50 }); // empty planters, negative cash
  assert.deepEqual(t.trades.sessionOf(B).offerB.planters, []);
  assert.equal(t.trades.sessionOf(B).offerB.cash, 0);
  // nothing changed, but B's screen asked for something else: it gets a re-sync (no "changed" alarm)
  const sync = t.events.slice(n).find((e) => e.name === 'trade:update');
  assert.equal(sync?.reason, 'sync');
  assert.equal(sync.changedBy, null);
  // B has 2 plants + 2 free planters (4 unlocked): 4 incoming - 0 outgoing > 2 free: Ready refused
  t.wait(TRADE.readyLock + 0.01);
  assert.equal(t.act(B, 'tradeReady', true), false);
  t.act(A, 'tradeOffer', { planters: [0, 1], cash: 0 });
  t.wait(TRADE.readyLock + 0.01);
  assert.equal(t.act(B, 'tradeReady', true), true);
});

test('a plant stolen mid-countdown drops out; nothing is swapped', () => {
  const t = setup();
  const { game, A, B, C } = t;
  openTrade(t);
  t.act(A, 'tradeOffer', { planters: [1], cash: 0 });
  t.act(B, 'tradeOffer', { planters: [0], cash: 100 });
  t.wait(TRADE.readyLock + 0.01);
  t.act(A, 'tradeReady', true);
  t.act(B, 'tradeReady', true);
  const before = JSON.stringify(game.gardens.map((g) => g.planters.map((x) => x.plant?.uid ?? null)));
  const cashBefore = [A.cash, B.cash];
  // a bot grabs A's offered sunflower 1 s into the countdown
  t.wait(1);
  place(C, game.gardens[0].planters[1].x + 2, game.gardens[0].planters[1].z);
  assert.equal(game.stealPlant(C, game.gardens[0], game.gardens[0].planters[1]), true);
  t.wait(0.01);
  const u = t.last('trade:update');
  assert.equal(u.reason, 'changed');
  assert.equal(u.changedBy, A);
  assert.deepEqual(u.offerA.planters, []);
  assert.equal(u.readyA || u.readyB, false);
  t.wait(TRADE.countdown + 1);
  assert.equal(t.last('trade:done'), undefined);
  assert.deepEqual([A.cash, B.cash], cashBefore);
  // B's garden untouched; A lost only the stolen plant (it's in C's hands)
  const after = game.gardens.map((g) => g.planters.map((x) => x.plant?.uid ?? null));
  assert.deepEqual(after[1], JSON.parse(before)[1]);
  assert.equal(after[0][1], null);
});

test('game.trade is atomic when an offered plant is gone', () => {
  const t = setup();
  const { game, A, B } = t;
  const snapshot = () => JSON.stringify([game.gardens.map((g) => g.planters.map((x) => x.plant?.uid ?? null)), A.cash, B.cash]);
  const before = snapshot();
  game.gardens[1].planters[1].plant = null; // B's lily vanished
  const midway = snapshot();
  assert.equal(game.trade(A, B, { planters: [0], cash: 10 }, { planters: [0, 1], cash: 0 }), false);
  assert.equal(snapshot(), midway, 'nothing moved');
  assert.notEqual(before, midway);
  assert.ok(t.last('trade:fail'));
  // a plant in the middle of being stolen can't be traded either
  game.gardens[0].planters[0].stealer = 2;
  assert.equal(game.trade(A, B, { planters: [0], cash: 0 }, { planters: [], cash: 5 }), false);
});

test('cancel paths: decline, withdraw, expire, walk away, bonk, leave, cancel', () => {
  // decline (+ cooldown before asking again)
  let t = setup();
  t.act(t.A, 'tradeRequest', 1);
  assert.equal(t.act(t.B, 'tradeDecline', 0), true);
  assert.equal(t.last('trade:cancel').reason, 'declined');
  t.wait(TRADE.requestGap + 0.1);
  assert.equal(t.act(t.A, 'tradeRequest', 1), false);
  assert.equal(t.last('trade:cancel').reason, 'wait');
  t.wait(TRADE.declineCooldown);
  assert.equal(t.act(t.A, 'tradeRequest', 1), true);

  // the asker changes their mind
  t = setup();
  t.act(t.A, 'tradeRequest', 1);
  assert.equal(t.act(t.A, 'tradeCancel'), true);
  assert.equal(t.last('trade:cancel').reason, 'withdrawn');
  assert.equal(t.act(t.B, 'tradeAccept', 0), false);

  // nobody answers
  t = setup();
  t.act(t.A, 'tradeRequest', 1);
  t.wait(TRADE.inviteTtl + 0.1);
  assert.equal(t.last('trade:cancel').reason, 'expired');
  assert.equal(t.act(t.B, 'tradeAccept', 0), false);

  // too far to ask; can't trade with a bot
  t = setup();
  place(t.B, 30, 0);
  assert.equal(t.act(t.A, 'tradeRequest', 1), false);
  assert.equal(t.last('trade:cancel').reason, 'far');
  assert.equal(t.act(t.A, 'tradeRequest', 2), false);

  // walking apart
  t = setup();
  openTrade(t);
  place(t.B, TRADE.keepRange + 5, 0);
  t.wait(0.1);
  assert.equal(t.last('trade:cancel').reason, 'distance');
  assert.equal(t.trades.sessionOf(t.A), null);

  // getting bonked
  t = setup();
  openTrade(t);
  t.game.hitPlayer(t.A, t.C, { x: 1, z: 0 }, 1, 'bonk');
  assert.equal(t.last('trade:cancel').reason, 'bonked');
  assert.equal(t.last('trade:cancel').by, t.A);

  // leaving the room (the slot goes back to a bot)
  t = setup();
  openTrade(t);
  t.game.setSlot(1, { kind: 'bot' });
  assert.equal(t.last('trade:cancel').reason, 'left');
  assert.equal(t.trades.sessionOf(t.A), null);

  // either side cancels
  t = setup();
  openTrade(t);
  assert.equal(t.act(t.B, 'tradeCancel'), true);
  const c = t.last('trade:cancel');
  assert.equal(c.reason, 'cancelled');
  assert.equal(c.by, t.B);
});

test('busy players, crossed invites and bots', () => {
  const t = setup();
  const { game, A, B } = t;
  // both ask each other at once: that's a yes
  t.act(A, 'tradeRequest', 1);
  assert.equal(t.act(B, 'tradeRequest', 0), true);
  assert.ok(t.trades.sessionOf(A));
  // a third person asking a busy trader is told so
  game.setSlot(2, { kind: 'remote', profile: profile('p_cy', 'Cy', 'maddie'), pid: 'cy' });
  const Cy = game.players[2];
  place(Cy, 2, 3);
  assert.equal(t.trades.handle(Cy, 'tradeRequest', [0]), false);
  assert.equal(t.last('trade:cancel').reason, 'busy');
  // bots can't act
  assert.equal(t.trades.handle(game.players[3], 'tradeRequest', [0]), false);
});

test('gifts need a free planter on the other side', () => {
  const t = setup();
  const { game, A, B } = t;
  const lily = game.gardens[1].planters[0].plant;
  assert.equal(game.giftPlant(B, A, 0), true);
  const g = t.last('gift');
  assert.equal(g.from, B);
  assert.equal(g.plant, lily);
  assert.equal(lily.owner, 0);
  assert.ok(game.gardens[0].planters.some((x) => x.plant === lily));
  // fill A's garden: every unlocked planter taken
  for (const pl of game.gardens[0].planters) if (pl.unlocked && !pl.plant) pl.plant = { uid: uid++, speciesId: 'daisy', mutation: 'normal', growTotal: 15, growLeft: 0, owner: 0 };
  const before = game.gardens[1].planters[1].plant;
  assert.equal(game.giftPlant(B, A, 1), false);
  assert.equal(t.last('gift:fail').reason, 'full');
  assert.equal(game.gardens[1].planters[1].plant, before, 'the plant stays home');
  // nothing to give / yourself
  assert.equal(game.giftPlant(B, A, 9), false);
  assert.equal(game.giftPlant(A, A, 0), false);
});
