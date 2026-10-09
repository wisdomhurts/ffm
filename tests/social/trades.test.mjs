// Trade manager + gifting rules (no browser). Run: node --test tests/social/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SELL_SECONDS, seedSig } from '../../src/gameplay/game.js';
import { PLANT } from '../../src/config.js';
import { bus } from '../../src/core/events.js';
import { createTradeManager, TRADE } from '../../src/social/trades.js';
import { BOT_TRADE, tradePartner, botBusy } from '../../src/social/botTrade.js';
import { BotController } from '../../src/ai/bot.js';
import { emptyIntent } from '../../src/gameplay/player.js';
import { REPLIES } from '../../src/social/replies.js';
import { EventCodec, isBotLine } from '../../src/net/protocol.js';
import { StubApp, MemoryHub } from '../net/stub.mjs';

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

  // too far to ask (a family bot that far away can't be asked either)
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

// ------------------------------------------------------------------ Trading 2.0: pets, seeds, family bots

test('pet offers are sanitized: known pets, id-like uids, no repeats, at most 3, clean names', () => {
  const t = setup();
  const { A, B } = t;
  openTrade(t);
  t.act(A, 'tradeOffer', {
    planters: [], cash: 0, petRoom: 10, pets: [
      { uid: 'pt1', id: 'dragon', name: 'Sparky' },
      { uid: 'pt1', id: 'bunny' }, // the same pet twice
      { uid: 'bad uid!', id: 'bunny' }, // not an id
      { uid: 'pt2', id: 'toString' }, // not a pet
      null,
      { uid: 'pt3', id: 'bunny', name: 'fuck' }, // the name filter says no: no nickname
      { uid: 'pt4', id: 'kitty', name: 'x'.repeat(40) },
      { uid: 'pt5', id: 'puppy' }, // a fourth pet
    ],
  });
  const o = t.trades.sessionOf(A).offerA;
  assert.deepEqual(o.pets.map((x) => x.uid), ['pt1', 'pt3', 'pt4']);
  assert.deepEqual(o.pets.map((x) => x.name), ['Sparky', '', 'x'.repeat(14)]);
  // a person's pets come from their own device (the host can't see the bag)
  t.act(B, 'tradeOffer', { planters: [], cash: 0, pets: [{ uid: 'b0:dragon', id: 'dragon' }], petRoom: 3 });
  assert.equal(t.trades.sessionOf(B).offerB.pets.length, 1);
  // a bot that isn't trading can't offer anything
  const bot = t.game.players[2];
  bot.pets = ['owl'];
  bot.petNames = ['Hoot'];
  assert.equal(t.trades.botAct(bot, 'tradeOffer', [{ pets: [{ uid: 'b0:owl' }] }]), false);
});

test('pets between people: bags are checked, both devices get mail, names never ride at the top of an event', () => {
  const t = setup();
  const { game, A, B } = t;
  openTrade(t);
  t.act(A, 'tradeOffer', { planters: [], cash: 0, pets: [{ uid: 'ptA1', id: 'dragon', name: 'Sir Fluff' }], petRoom: 4 });
  t.act(B, 'tradeOffer', { planters: [0], cash: 0, petRoom: 0 });
  const s = t.trades.sessionOf(A);
  assert.equal(s.petRoomB, 0);
  assert.deepEqual(s.room.pets, [-5, 1], "B's pet bag is full (A has 4 free spots and gives one)");
  t.wait(TRADE.readyLock + 0.01);
  assert.equal(t.act(A, 'tradeReady', true), false, 'no room in the other bag: Ready refused');
  assert.equal(t.act(B, 'tradeReady', true, 2), true, 'B released a pet (2 free spots now)');
  assert.equal(t.act(A, 'tradeReady', true), true);
  // the update carries the nickname nested in the offer: it survives the event filter on a client
  const u = t.last('trade:update');
  const codec = new EventCodec(game);
  const other = new Game({ seed: 3, slots: [{ kind: 'remote', profile: profile('p_ann', 'Ann', 'dorian'), pid: 'a' }, { kind: 'local', profile: profile('p_ben', 'Ben', 'esther') }, { kind: 'bot' }, { kind: 'bot' }] });
  const back = EventCodec.vet('trade:update', new EventCodec(other).decode(JSON.parse(JSON.stringify(codec.encode(u)))));
  assert.ok(back, 'a trade:update with a nicknamed pet passes the client filter');
  assert.equal(back.offerA.pets[0].name, 'Sir Fluff');
  const lily = game.gardens[1].planters[0].plant;
  t.wait(TRADE.countdown + 0.1);
  const done = t.last('trade:done');
  assert.ok(done, 'swapped');
  assert.ok(game.gardens[0].planters.some((pl) => pl.plant === lily), 'A got the lily');
  assert.deepEqual(done.petsA, [{ id: 'dragon', name: 'Sir Fluff' }]);
  assert.ok(EventCodec.vet('trade:done', new EventCodec(other).decode(JSON.parse(JSON.stringify(codec.encode(done))))), 'trade:done passes too');
  // the pets themselves travel as mail in the shared state, one per device, same trade id
  assert.equal(A.petMail.length, 1);
  assert.equal(B.petMail.length, 1);
  assert.equal(A.petMail[0].tid, B.petMail[0].tid);
  assert.deepEqual(A.petMail[0].give, ['ptA1']);
  assert.deepEqual(A.petMail[0].get, []);
  assert.deepEqual(B.petMail[0].get, [{ id: 'dragon', name: 'Sir Fluff' }]);
  const tid = B.petMail[0].tid;
  assert.equal(game.serializeFull().players[1].petMail[0].tid, tid, 'mail is part of the full state');
  assert.equal(game.petMailAck(B, tid), true);
  assert.equal(game.petMailAck(B, tid), false, 'acked once');
  assert.equal(B.petMail.length, 0);
  // a new player in that garden never sees the last one's mail
  game.setSlot(0, { kind: 'bot' });
  assert.equal(game.players[0].petMail.length, 0);
});

test('pets nested in trade events are vetted on clients: known pets, id-like uids, nicknames through the filter', () => {
  const t = setup();
  const { game, A, B } = t;
  // what a modified host could forward (a normal host already cleans all of this: petsOf, Game.trade)
  const pets = () => [
    { uid: 'p1', id: 'bunny', name: 'shit head stupid idiot' },
    { uid: 'b1:dragon', id: 'dragon', name: 'Smokey', k: 1, extra: 'junk words here' },
    { uid: 'p3', id: 'toString', name: 'Ghost' },
    { uid: 'bad uid!', id: 'owl', name: 'Hoot' },
    { uid: 'p5', id: 'kitty', name: 'f u c k' },
  ];
  const offer = () => ({ planters: [], cash: 0, plants: [], pets: pets(), seed: null });
  const other = new Game({ seed: 3, slots: [{ kind: 'remote', profile: profile('p_ann', 'Ann', 'dorian'), pid: 'a' }, { kind: 'local', profile: profile('p_ben', 'Ben', 'esther') }, { kind: 'bot' }, { kind: 'bot' }] });
  const wire = (name, e) => EventCodec.vet(name, new EventCodec(other).decode(JSON.parse(JSON.stringify(new EventCodec(game).encode(e)))));
  const clean = [
    { id: 'bunny', name: '', uid: 'p1' },
    { id: 'dragon', name: 'Smokey', uid: 'b1:dragon', k: 1 },
    { id: 'kitty', name: '', uid: 'p5' },
  ];
  const u = wire('trade:update', { a: A, b: B, offerA: offer(), offerB: offer(), readyA: false, readyB: false, countdownEndsAt: 0, lockUntil: 0, rev: 2, reason: 'offer', changedBy: A, petRoomA: 3, petRoomB: 3 });
  assert.ok(u, 'the update still gets through');
  assert.deepEqual(u.offerA.pets, clean, 'unknown pets and odd uids dropped, unkind nicknames emptied');
  assert.deepEqual(u.offerB.pets, clean);
  const d = wire('trade:done', { a: A, b: B, offerA: { planters: [], cash: 0, pets: pets(), seed: false }, offerB: { planters: [], cash: 5, pets: [], seed: false },
    plantsA: [], plantsB: [], seedA: null, seedB: null, petsA: pets(), petsB: [{ id: 'owl', name: 'shithead' }], tid: 'm1' });
  assert.ok(d);
  assert.deepEqual(d.petsA, clean);
  assert.deepEqual(d.petsB, [{ id: 'owl', name: '' }]);
  assert.deepEqual(d.offerA.pets.map((x) => x.name), ['', 'Smokey', '']);
  assert.deepEqual(d.offerB.pets, []);
});

test('the seed in your hands: planted straight into their garden; dropped from the offer when it changes', () => {
  const t = setup();
  const { game, A, B } = t;
  A.carrying = { kind: 'seed', speciesId: 'cactus', mutation: 'gold', podId: 7, lucky: false };
  openTrade(t);
  t.act(A, 'tradeOffer', { planters: [], cash: 0, seed: true, petRoom: 5 });
  assert.equal(t.trades.sessionOf(A).offerA.seed.speciesId, 'cactus');
  // dropped it, grabbed another one: the first one leaves the offer (and both sides are told)
  A.carrying = { kind: 'seed', speciesId: 'daisy', mutation: 'normal', podId: 9, lucky: false };
  t.wait(0.01);
  assert.equal(t.last('trade:update').reason, 'changed');
  assert.equal(t.trades.sessionOf(A).offerA.seed, null);
  // a screen that still means the old seed doesn't get the new one by accident
  t.act(A, 'tradeOffer', { planters: [], cash: 0, seed: 'cactus|gold|7' });
  assert.equal(t.trades.sessionOf(A).offerA.seed, null);
  t.act(A, 'tradeOffer', { planters: [], cash: 0, seed: seedSig(A.carrying) });
  assert.equal(t.trades.sessionOf(A).offerA.seed.speciesId, 'daisy');
  t.act(B, 'tradeOffer', { planters: [], cash: 50 });
  // B's garden is full: the seed needs a planter
  const free = game.gardens[1].planters.filter((pl) => pl.unlocked && !pl.plant);
  for (const pl of free) pl.plant = { uid: uid++, speciesId: 'tulip', mutation: 'normal', growTotal: 10, growLeft: 0, owner: 1 };
  t.wait(TRADE.readyLock + 0.01);
  assert.equal(t.trades.sessionOf(A).room.plants[1], 1, 'B is one planter short');
  assert.equal(t.act(B, 'tradeReady', true), false, 'no room for the seed');
  free[0].plant = null;
  assert.equal(t.act(B, 'tradeReady', true), true);
  assert.equal(t.act(A, 'tradeReady', true), true);
  t.wait(TRADE.countdown + 0.1);
  const done = t.last('trade:done');
  assert.deepEqual(done.seedA, { speciesId: 'daisy', mutation: 'normal' });
  assert.equal(A.carrying, null, "the seed left A's hands");
  assert.equal(B.cash, 450);
  const sprout = free[0].plant;
  assert.ok(sprout && sprout.speciesId === 'daisy' && sprout.owner === 1, "it grows in B's garden now");
  assert.equal(sprout.growLeft, PLANT.daisy.grow, 'from the very start, like a gift');
  const uids = game.gardens.flatMap((g) => g.planters.filter((pl) => pl.plant).map((pl) => pl.plant.uid));
  assert.equal(uids.filter((u2) => u2 === sprout.uid).length, 1, 'with a new uid');
});

// A solo game: the human (slot `me`) and the family bots, far from each other until a test calls one over.
function botSetup(me = 0) {
  bus.clear();
  const slots = [0, 1, 2, 3].map((i) => (i === me ? { kind: 'local', profile: profile('p_kid', 'Kid', 'dorian') } : { kind: 'bot' }));
  const game = new Game({ seed: 5, slots });
  const app = { game };
  const trades = createTradeManager(app);
  const H = game.players[me];
  game.players.forEach((p, i) => place(p, 60 + i * 40, 60));
  place(H, 0, 0);
  H.cash = 1e9;
  const events = [];
  bus.on('*', ({ name, payload }) => {
    if (name.startsWith('trade:') || name === 'chat') events.push({ name, ...payload });
  });
  const last = (name) => [...events].reverse().find((e) => e.name === name);
  const said = (bot) => events.filter((e) => e.name === 'chat' && e.player === bot).map((e) => e.text);
  const act = (p, name, ...args) => trades.handle(p, name, args);
  const run = (s) => {
    for (let k = 0; k < Math.round(s * 10); k++) {
      game.time += 0.1;
      trades.update();
    }
  };
  const bot = (id) => {
    const b = game.players.find((p) => p.id === id);
    place(b, 4, 0);
    return b;
  };
  return { game, app, trades, H, events, last, said, act, run, bot };
}
const yesWas = { ...BOT_TRADE.yes };
const restoreYes = () => Object.assign(BOT_TRADE.yes, yesWas);
const line = (table, id, text) => table[id].some((l) => l.replaceAll('{name}', 'Kid') === text);

test('family bots answer invites by personality (Micah usually says no, busy bots say no)', () => {
  try {
    let t = botSetup(0);
    const E = t.bot('esther');
    assert.equal(t.act(t.H, 'tradeRequest', E.slot), true, 'you can ask a family bot');
    assert.equal(t.trades.sessionOf(t.H), null, 'it thinks for a moment');
    t.run(2);
    const s = t.trades.sessionOf(t.H);
    assert.ok(s && s.a === t.H && s.b === E, 'Esther said yes');
    assert.ok(line(REPLIES.tradeYes, 'esther', t.said(E).at(-1)), 'with a line in her voice: ' + t.said(E));
    assert.equal(tradePartner(t.game, E), t.H, 'she stands still for the trade');

    BOT_TRADE.yes.micah = 0;
    t = botSetup(0);
    const M = t.bot('micah');
    t.act(t.H, 'tradeRequest', M.slot);
    t.run(2);
    assert.equal(t.trades.sessionOf(t.H), null);
    assert.equal(t.last('trade:cancel').reason, 'declined');
    assert.ok(line(REPLIES.tradeNo, 'micah', t.said(M).at(-1)), 'Micah: ' + t.said(M));
    assert.ok(t.said(M).every(isBotLine), 'bot lines pass the online filter');

    // busy (carrying a seed home): even Esther says no
    t = botSetup(0);
    const E2 = t.bot('esther');
    E2.carrying = { kind: 'seed', speciesId: 'daisy', mutation: 'normal', podId: 1 };
    t.act(t.H, 'tradeRequest', E2.slot);
    t.run(2);
    assert.equal(t.last('trade:cancel')?.reason, 'declined');
    // bots never act through handle() (people only)
    assert.equal(t.trades.handle(E2, 'tradeRequest', [0]), false);
  } finally {
    restoreYes();
  }
});

test('family bots weigh both sides: Esther 0.8, Dorian 1.0, Mati 1.2, Micah 1.5', () => {
  try {
    for (const [id, me] of [['esther', 0], ['dorian', 3], ['maddie', 0], ['micah', 0]]) {
      BOT_TRADE.yes[id] = 1;
      const t = botSetup(me);
      const b = t.bot(id);
      const pl = t.game.gardens[b.slot].planters[0];
      pl.unlocked = true;
      pl.plant = { uid: uid++, speciesId: 'starlotus', mutation: 'gold', growTotal: 60, growLeft: 0, owner: b.slot };
      t.act(t.H, 'tradeRequest', b.slot);
      t.run(2);
      assert.ok(t.trades.sessionOf(t.H), id + ' trades');
      // ask for its plant, then offer cash just under / just over what it wants
      t.act(t.H, 'tradeAsk', { planters: [0], uids: [pl.plant.uid], pets: [], petRoom: 10 });
      const V = t.game.plantIncome(pl.plant, b) * SELL_SECONDS;
      const k = BOT_TRADE.want[id];
      t.act(t.H, 'tradeOffer', { planters: [], cash: Math.floor(k * V * 0.95), petRoom: 10 });
      t.run(4);
      const side = t.trades.sessionOf(t.H).a === b ? 'readyA' : 'readyB';
      assert.equal(t.trades.sessionOf(t.H)[side], false, `${id} wants more than ${Math.floor(k * V * 0.95)} for ${Math.round(V)}`);
      assert.ok(line(REPLIES.tradeUnfair, id, t.said(b).at(-1)), `${id} asks for more: ${t.said(b).at(-1)}`);
      t.act(t.H, 'tradeOffer', { planters: [], cash: Math.ceil(k * V * 1.05), petRoom: 10 });
      t.run(4);
      assert.equal(t.trades.sessionOf(t.H)[side], true, `${id} is Ready at ${k} x the value`);
      assert.ok(line(REPLIES.tradeYes, id, t.said(b).at(-1)), `${id} says yes: ${t.said(b).at(-1)}`);
      t.act(t.H, 'tradeReady', true, 10);
      t.run(TRADE.countdown + 0.5);
      assert.ok(t.last('trade:done'), id + ': swapped');
      assert.ok(t.game.gardens[t.H.slot].planters.some((x) => x.plant?.speciesId === 'starlotus'), 'the lotus is ours');
      assert.ok(t.said(b).every(isBotLine), 'every trade line passes isBotLine: ' + t.said(b).join(' | '));
    }
  } finally {
    restoreYes();
  }
});

test('a bot offers something back for your offer, and not the same thing again right away', () => {
  const t = botSetup(0);
  const E = t.bot('esther');
  const g = t.game.gardens[E.slot].planters;
  g[0].unlocked = g[1].unlocked = true;
  g[0].plant = { uid: uid++, speciesId: 'sunflower', mutation: 'normal', growTotal: 20, growLeft: 0, owner: E.slot };
  g[1].plant = { uid: uid++, speciesId: 'sunflower', mutation: 'gold', growTotal: 20, growLeft: 0, owner: E.slot };
  t.act(t.H, 'tradeRequest', E.slot);
  t.run(2);
  const goldV = t.game.plantIncome(g[1].plant, E) * SELL_SECONDS;
  // enough for the gold one (Esther is generous), not for anything more
  t.act(t.H, 'tradeOffer', { planters: [], cash: Math.ceil(goldV * 0.8) + 1, petRoom: 10 });
  t.run(3);
  let s = t.trades.sessionOf(t.H);
  assert.deepEqual(s.offerB.planters, [1], 'she offers her best plant worth about as much');
  assert.equal(t.events.filter((e) => e.name === 'trade:update' && e.reason === 'offer' && e.changedBy === E).length, 1, 'as an offer of her own (the anti-scam flash shows it)');
  t.run(3);
  assert.equal(t.trades.sessionOf(t.H).readyB, true, 'and is Ready for it');
  // you'd rather not: ask for nothing. She doesn't push the same plant again
  t.act(t.H, 'tradeAsk', { planters: [], pets: [], petRoom: 10 });
  t.run(4);
  s = t.trades.sessionOf(t.H);
  assert.deepEqual(s.offerB.planters, []);
  assert.equal(s.readyB, true, 'a present is fine by her');
  t.act(t.H, 'tradeCancel');
  t.run(TRADE.declineCooldown);
  // a new trade a moment later: something else (or some cash), not the gold sunflower again
  t.act(t.H, 'tradeRequest', E.slot);
  t.run(2);
  t.act(t.H, 'tradeOffer', { planters: [], cash: Math.ceil(goldV * 0.8) + 1, petRoom: 10 });
  t.run(3);
  s = t.trades.sessionOf(t.H);
  assert.ok(!s.offerB.planters.includes(1), 'not the same plant within ' + BOT_TRADE.repropose + ' s');
  assert.ok(s.offerB.planters.length || s.offerB.cash > 0, 'but something');
});

test('pets with bots: a bot keeps a pet you give it (and its name); a pet you ask for comes as mail', () => {
  const t = botSetup(0);
  const E = t.bot('esther');
  E.pets = ['dragon'];
  E.petNames = ['Smokey'];
  t.game._refreshMods(E);
  t.act(t.H, 'tradeRequest', E.slot);
  t.run(2);
  t.act(t.H, 'tradeAsk', { planters: [], pets: [{ uid: 'b0:dragon' }], petRoom: 10 });
  t.act(t.H, 'tradeOffer', { planters: [], cash: 0, pets: [{ uid: 'ptFluffy', id: 'phoenix', name: 'Fluffy' }], petRoom: 10 });
  t.run(4);
  const s = t.trades.sessionOf(t.H);
  assert.equal(s.offerB.pets[0].name, 'Smokey');
  assert.equal(s.readyB, true, 'a phoenix for a dragon: deal');
  t.act(t.H, 'tradeReady', true, 10);
  t.run(TRADE.countdown + 0.5);
  assert.ok(t.last('trade:done'));
  assert.deepEqual([E.pets, E.petNames], [['phoenix'], ['Fluffy']], 'Esther keeps Fluffy');
  assert.equal(t.H.petMail.length, 1);
  assert.deepEqual(t.H.petMail[0].give, ['ptFluffy']);
  assert.deepEqual(t.H.petMail[0].get, [{ id: 'dragon', name: 'Smokey' }]);
  // a bot holds three pets: a fourth needs one of hers to go
  E.pets = ['bunny', 'chick', 'frog'];
  E.petNames = ['', '', ''];
  t.run(TRADE.declineCooldown);
  t.act(t.H, 'tradeRequest', E.slot);
  t.run(2);
  t.act(t.H, 'tradeOffer', { planters: [], cash: 0, pets: [{ uid: 'ptX', id: 'unicorn' }], petRoom: 10 });
  t.run(0.2);
  assert.deepEqual(t.trades.sessionOf(t.H).room.pets, [-11, 1]);
  t.run(TRADE.readyLock);
  assert.equal(t.act(t.H, 'tradeReady', true, 10), false, 'no room in her team');
  t.act(t.H, 'tradeAsk', { planters: [], pets: [{ uid: 'b2:frog' }], petRoom: 10 });
  t.run(TRADE.readyLock + 0.1);
  assert.equal(t.act(t.H, 'tradeReady', true, 10), true, 'a pet for a pet fits');
});

test('a trading bot drops the trade when its garden needs it (a deal counting down finishes first)', () => {
  const t = botSetup(0);
  const E = t.bot('esther');
  const M = t.game.players.find((p) => p.id === 'micah');
  const g = t.game.gardens[E.slot].planters;
  g[0].unlocked = g[1].unlocked = true;
  g[0].plant = { uid: uid++, speciesId: 'sunflower', mutation: 'normal', growTotal: 20, growLeft: 0, owner: E.slot };
  g[1].plant = { uid: uid++, speciesId: 'sunflower', mutation: 'gold', growTotal: 20, growLeft: 0, owner: E.slot };
  t.act(t.H, 'tradeRequest', E.slot);
  t.run(2);
  assert.ok(t.trades.sessionOf(t.H) && tradePartner(t.game, E) === t.H, 'Esther trades');
  // someone starts stealing from her garden: she says bye and stops standing still
  g[0].stealer = M.slot;
  t.run(0.3);
  assert.equal(t.trades.sessionOf(t.H), null, 'the trade is off');
  const c = t.last('trade:cancel');
  assert.deepEqual([c.reason, c.by], ['cancelled', E]);
  assert.ok(line(REPLIES.tradeBye, 'esther', t.said(E).at(-1)), 'bye: ' + t.said(E).at(-1));
  assert.equal(tradePartner(t.game, E), null, 'free to run');
  g[0].stealer = null;
  // a deal already counting down goes through first (it's a moment away)
  t.run(TRADE.declineCooldown);
  t.act(t.H, 'tradeRequest', E.slot);
  t.run(2);
  t.act(t.H, 'tradeAsk', { planters: [], pets: [], petRoom: 10 }); // a present: no need for anything back
  t.act(t.H, 'tradeOffer', { planters: [], cash: 1, petRoom: 10 });
  t.run(4);
  t.act(t.H, 'tradeReady', true, 10);
  const s = t.trades.sessionOf(t.H);
  assert.ok(s.readyA && s.readyB && s.countdownEndsAt, 'counting down');
  g[1].stealer = M.slot;
  t.run(TRADE.countdown + 0.2);
  assert.ok(t.last('trade:done'), 'swapped');
  assert.equal(t.trades.sessionOf(t.H), null);
  // and a bot running to a Help! call or at Big Chomp is busy too
  g[1].stealer = null;
  for (const type of ['help', 'boss']) {
    E.controller = { goal: { type }, getIntent: () => null };
    assert.equal(botBusy(t.game, E), true, type);
  }
});

test('a trading bot still defends its garden from a thief (online a second kid could steal while you trade)', () => {
  for (const seed of [1, 2, 3]) {
    bus.clear();
    const game = new Game({ humanId: 'dorian', seed });
    const trades = createTradeManager({ game });
    const [D, E, , M] = game.players;
    for (const p of game.players) p.controller = null;
    E.controller = new BotController(E.char.personality, 'normal', { seed: seed * 7 + 1 });
    const pl = game.gardens[E.slot].planters[0];
    pl.unlocked = true;
    pl.plant = { uid: uid++, speciesId: 'sunflower', mutation: 'normal', growTotal: 10, growLeft: 0, owner: E.slot };
    place(E, pl.x + 3, pl.z);
    place(D, pl.x + 6, pl.z + 2);
    let swings = 0;
    const off = bus.on('bonk:swing', ({ player }) => player === E && swings++);
    const frame = () => {
      game.update(1 / 60);
      trades.update();
    };
    trades.handle(D, 'tradeRequest', [E.slot]);
    for (let i = 0; i < 120; i++) frame();
    assert.ok(trades.sessionOf(E), 'Esther said yes');
    // Micah walks up and holds E on her plant, then runs home with it
    place(M, pl.x, pl.z + 1);
    const home = game.gardens[M.slot].planters[0];
    M.controller = {
      getIntent(g, p) {
        const it = emptyIntent();
        if (!p.carrying) it.interact = true;
        else {
          const dx = home.x - p.pos.x, dz = home.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
          it.moveX = dx / d;
          it.moveZ = dz / d;
        }
        return it;
      },
    };
    const mine = pl.plant.uid;
    let got = false;
    for (let i = 0; i < 60 * 20; i++) {
      frame();
      if (M.carrying) got = true;
      else if (got) break; // grabbed and lost again
    }
    off();
    assert.equal(trades.sessionOf(E), null, `seed ${seed}: the trade is off`);
    assert.ok(pl.plant?.uid === mine && !M.carrying, `seed ${seed}: her plant stays home (swings: ${swings}, goal: ${E.controller.goal?.type})`);
  }
});

test('a pet traded to a bot keeps its nickname through a save and Continue (and back to you in a later trade)', () => {
  const t = setup();
  const { game, A } = t;
  const E = game.players[2];
  E.pets = ['dragon', 'bunny'];
  E.petNames = ['', ''];
  assert.ok(game.trade(A, E, { pets: [{ uid: 'ptFluffy', id: 'phoenix', name: 'Fluffy' }], petRoom: 10 }, { pets: [{ k: 1, id: 'bunny' }] }));
  const names = (p) => p.pets.map((id, k) => `${id}:${p.petNames[k]}`).sort();
  assert.deepEqual(names(E), ['dragon:', 'phoenix:Fluffy']);
  // quit and Continue (a solo Endless save): a fresh game from the save
  const save = JSON.parse(JSON.stringify(game.serialize()));
  const again = new Game({ seed: 3, save, slots: [{ kind: 'local', profile: profile('p_ann', 'Ann', 'dorian') }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }] });
  const E2 = again.players[2];
  assert.deepEqual(names(E2), ['dragon:', 'phoenix:Fluffy'], 'Esther still calls her phoenix Fluffy');
  // trading Fluffy back: the nickname comes with her
  const k = E2.pets.indexOf('phoenix');
  assert.ok(again.trade(E2, again.players[0], { pets: [{ k, id: 'phoenix' }] }, { petRoom: 10 }));
  assert.deepEqual(again.players[0].petMail[0].get, [{ id: 'phoenix', name: 'Fluffy' }]);
  // an older save (pets, no nicknames) or junk in it: names line up with the team, unkind ones dropped
  const p = again.players[3];
  p.restore({ pets: ['owl', 7, 'kitty'], petNames: ['Hoot', 'x', 'shithead'] });
  assert.deepEqual([p.pets, p.petNames], [['owl', 'kitty'], ['Hoot', '']]);
  p.restore({ pets: ['owl'] });
  assert.deepEqual([p.pets, p.petNames], [['owl'], ['']]);
});

test('"Trade?" in chat: a bot nearby asks you back; a trading bot walks on if nothing happens', () => {
  const t = botSetup(0);
  const E = t.bot('esther');
  bus.emit('chat', { player: t.H, text: 'Trade?', quick: true, phrase: 'trade' });
  t.run(2);
  const inv = t.last('trade:invite');
  assert.ok(inv && inv.from === E && inv.to === t.H, 'Esther asks back');
  assert.equal(t.act(t.H, 'tradeAccept', E.slot), true);
  t.run(0.1);
  assert.equal(tradePartner(t.game, E), t.H);
  t.run(BOT_TRADE.idle + 3);
  assert.equal(t.trades.sessionOf(t.H), null, 'nothing happened: she moved on');
  assert.equal(t.last('trade:cancel').reason, 'cancelled');
  assert.ok(line(REPLIES.tradeBye, 'esther', t.said(E).at(-1)), 'bye: ' + t.said(E).at(-1));
  assert.equal(tradePartner(t.game, E), null);
  // typed, from too far: the nearest bot says to come closer (no invite)
  place(E, 30, 0);
  const n = t.events.filter((e) => e.name === 'trade:invite').length;
  t.run(BOT_TRADE.lineGap);
  bus.emit('chat', { player: t.H, text: 'anyone want to trade?', typed: true });
  t.run(2);
  assert.equal(t.events.filter((e) => e.name === 'trade:invite').length, n);
  assert.ok(line(REPLIES.trade, 'esther', t.said(E).at(-1)), 'come closer: ' + t.said(E).at(-1));
});

test('offline, App.act routes trade actions to the trade manager (and pet mail acks to the game)', () => {
  bus.clear();
  const app = new StubApp('Solo', { hub: new MemoryHub(), base: 'dorian' });
  const game = app.startOnline({ seed: 2, humanId: 'dorian' });
  app.trades = createTradeManager(app);
  const E = game.players[1];
  place(app.human, 0, 0);
  place(E, 3, 0);
  assert.equal(app.act('tradeRequest', E.slot), true);
  assert.equal(app.trades.invitesFor(app.human).length, 1, 'no room: the manager on this device took it');
  app.human.petMail.push({ tid: 'mTest1', give: [], get: [] });
  assert.equal(app.act('petMailAck', 'mTest1'), true);
  assert.equal(app.human.petMail.length, 0);
});
