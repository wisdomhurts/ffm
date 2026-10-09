// The guided tutorial's rules (src/ui/tutorialFlow.js): the per-profile state and its transitions, who is
// offered it (players who already played are migrated to 'done'), and the step machine against a real Game,
// solo and as an online client (the in-memory room harness). No browser.
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { LAYOUT } from '../../src/gameplay/layout.js';
import { PLANTS, speedCost } from '../../src/config.js';
import { getProfile, replaceProfile, createProfile } from '../../src/core/profiles.js';
import { FORWARD } from '../../src/net/protocol.js';
import {
  STEPS, STEP_EVENTS, TRANSITIONS as T, hasPlayed, tutorialOf, tutorialRecord, wantsOffer, markOffered, answerOffer, replayTutorial, skipTutorial,
  finishStep, createStepMachine,
} from '../../src/ui/tutorialFlow.js';

const fresh = (id) => replaceProfile(id, { id });

function setup(seed = 7) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed });
  return { game, me: game.human, L: LAYOUT.gardens[game.human.slot] };
}

const grownPlant = (owner, uid = 1) => ({ uid, speciesId: PLANTS[0].id, mutation: 'normal', growTotal: 10, growLeft: 0, owner });

test('transitions: offer, answer, replay, skip and advance', () => {
  const nu = { state: 'new', step: 0 };
  assert.deepEqual(T.offer(nu), { state: 'offered', step: 0 });
  assert.deepEqual(T.answer(T.offer(nu), true), { state: 'active', step: 0 });
  assert.deepEqual(T.answer(nu, false), { state: 'declined', step: 0 });
  const declined = { state: 'declined', step: 0 };
  assert.equal(T.answer(declined, true), declined, 'a no thanks is never asked again');
  assert.equal(T.offer(declined), declined);
  assert.deepEqual(T.replay(declined), { state: 'active', step: 0 }, 'replay always starts from the top');
  assert.deepEqual(T.skip({ state: 'active', step: 3 }), { state: 'done', step: 3 });
  assert.equal(T.skip(declined), declined);
  let t = T.replay();
  for (let i = 0; i < STEPS.length; i++) {
    assert.equal(T.advance(t, i + 1), t, 'only the step on screen can finish');
    t = T.advance(t, i);
  }
  assert.deepEqual(t, { state: 'done', step: STEPS.length });
  assert.deepEqual(STEPS, ['move', 'grab', 'plant', 'grow', 'collect', 'speed', 'lock', 'steal']);
});

test('migration: anyone who has played before is never offered it', () => {
  const nu = { state: 'new', step: 0 };
  assert.deepEqual(T.migrate(nu, true), { state: 'done', step: 0 });
  assert.equal(T.migrate(nu, false), nu);
  const offered = { state: 'offered', step: 0 };
  assert.equal(T.migrate(offered, true), offered, 'asked but unanswered: asked again, even after a game');
  const blank = getProfile('micah');
  assert.equal(hasPlayed(blank), false);
  assert.equal(hasPlayed(blank, true), true, 'a saved garden');
  for (const patch of [{ counters: { games: 1 } }, { counters: { seeds: 4 } }, { stars: 3 }, { badges: { firstSeed: 1 } }, { best: { netWorth: 500 } }]) {
    assert.equal(hasPlayed({ ...blank, counters: {}, best: {}, ...patch }), true, JSON.stringify(patch));
  }
  // a returning player's stored profile (no tutorial field yet: it normalizes to 'new') migrates on first look
  replaceProfile('esther', { id: 'esther', counters: { games: 12, seeds: 80 }, stars: 9 });
  assert.equal(getProfile('esther').tutorial.state, 'new');
  assert.equal(tutorialRecord('esther').state, 'new', 'reading it (mid-game) never migrates');
  assert.equal(wantsOffer('esther'), false);
  assert.equal(getProfile('esther').tutorial.state, 'done', 'saved as done');
  fresh('maddie');
  assert.equal(wantsOffer('maddie', true), false, 'a saved Endless garden counts');
  // a brand-new friend is asked
  const p = createProfile({ name: 'Sam', base: 'micah' });
  assert.equal(wantsOffer(p.id), true);
});

test('profile flow: offered -> yes -> steps -> done; no thanks; replay; skip', () => {
  fresh('micah');
  assert.equal(wantsOffer('micah'), true);
  markOffered('micah');
  assert.equal(getProfile('micah').tutorial.state, 'offered');
  assert.equal(wantsOffer('micah'), true, 'closed without an answer: asked again');
  answerOffer('micah', true);
  assert.deepEqual(getProfile('micah').tutorial, { state: 'active', step: 0 });
  finishStep('micah', 0);
  finishStep('micah', 1);
  finishStep('micah', 1); // a repeat is a no-op
  assert.deepEqual(getProfile('micah').tutorial, { state: 'active', step: 2 }, 'progress is saved per step');
  skipTutorial('micah');
  assert.equal(getProfile('micah').tutorial.state, 'done');
  assert.equal(wantsOffer('micah'), false);
  replayTutorial('micah');
  assert.deepEqual(getProfile('micah').tutorial, { state: 'active', step: 0 });

  fresh('dorian');
  answerOffer('dorian', false);
  assert.equal(getProfile('dorian').tutorial.state, 'declined');
  assert.equal(wantsOffer('dorian'), false, 'never asked again');
  assert.equal(tutorialOf('dorian').state, 'declined');
});

test('every step event is forwarded online (clients tick their tutorial on the host\'s events)', () => {
  for (const ev of STEP_EVENTS) assert.ok(FORWARD.has(ev), ev);
});

test('step machine: the whole tutorial, solo', () => {
  const { game, me, L } = setup();
  const done = [];
  const m = createStepMachine(game, me, { onAdvance: (i, next) => done.push([STEPS[i], next]) });
  assert.equal(m.id, 'move');
  assert.deepEqual(m.target(), L.outside);
  m.tick();
  assert.equal(m.id, 'move', 'standing still');
  me.pos.x += 7; m.tick();
  me.pos.x -= 7; m.tick(); // 14 studs walked
  assert.equal(m.id, 'grab');
  // the beacon points at the nearest seed waiting in a pod
  const t = m.target();
  assert.ok(game.pods.includes(t) && t.seed, 'grab: a pod with a seed');
  // somebody else's grab doesn't count
  bus.emit('seed:grabbed', { player: game.players[1] });
  m.tick();
  assert.equal(m.id, 'grab');
  me.carrying = { kind: 'seed', speciesId: PLANTS[0].id, mutation: 'normal' };
  m.tick();
  assert.equal(m.id, 'plant', 'holding a seed finishes Grab');
  assert.deepEqual(m.target(), L.inside, 'carry it home');
  assert.equal(m.note().kind, 'carry');
  me.carrying = null;
  assert.equal(m.note().kind, 'dropped');
  bus.emit('plant:planted', { player: me, garden: game.gardens[me.slot] });
  m.tick();
  assert.equal(m.id, 'grow');
  const pl = game.gardens[me.slot].planters[0];
  pl.plant = { ...grownPlant(me.slot), growLeft: 6.2 };
  assert.equal(m.target(), pl, 'the beacon sits on the growing plant');
  assert.deepEqual({ ...m.note() }, { kind: 'growing', n: 7, name: '' });
  bus.emit('plant:grown', { garden: game.gardens[me.slot] });
  m.tick();
  assert.equal(m.id, 'collect');
  assert.deepEqual(m.target(), L.collectPad);
  bus.emit('cash:collected', { player: me, amount: 5 });
  m.tick();
  assert.equal(m.id, 'speed');
  me.cash = 0;
  assert.deepEqual(m.target(), L.collectPad, 'not enough cash: collect first');
  assert.equal(m.note().kind, 'need');
  assert.equal(m.note().n, speedCost(1));
  me.cash = 1000;
  const mat = m.target();
  assert.ok(mat.id === 'speed' && Math.abs(mat.z - LAYOUT.shops.speed.z) < 15, 'then the Speed treadmill');
  bus.emit('speed:up', { player: me, level: 1 });
  m.tick();
  assert.equal(m.id, 'lock');
  assert.deepEqual(m.target(), L.lockPad);
  bus.emit('lock:on', { player: me });
  m.tick();
  assert.equal(m.id, 'steal');
  m.dispose();
  assert.deepEqual(done.map((d) => d[0]), ['move', 'grab', 'plant', 'grow', 'collect', 'speed', 'lock']);
});

test('step machine: stealing picks a safe garden, then home; success ends the tutorial', () => {
  const { game, me, L } = setup(3);
  let finished = false;
  const m = createStepMachine(game, me, { step: STEPS.indexOf('steal'), onAdvance: (i, next) => (finished = !next && STEPS[i] === 'steal') });
  assert.equal(m.id, 'steal');
  for (const g of game.gardens) for (const p of g.planters) p.plant = null;
  assert.equal(m.target(), null);
  assert.equal(m.note().kind, 'none', 'nothing grown yet: wait');
  // a grown plant in Esther's garden (locked) and in Mati's (open): only the open one is picked
  const ge = game.gardens[1], gm = game.gardens[2];
  ge.planters[0].plant = grownPlant(1, 11);
  gm.planters[0].plant = grownPlant(2, 12);
  ge.lockedUntil = game.time + 30;
  assert.equal(m.target(), gm.planters[0]);
  assert.equal(m.note().name, gm.owner.name);
  gm.lockedUntil = game.time + 30;
  assert.equal(m.target(), null, 'locked gardens are off limits');
  me.carrying = { kind: 'plant', plant: grownPlant(2, 12), fromSlot: 2 };
  assert.deepEqual(m.target(), L.inside, 'carrying it: run home');
  assert.equal(m.note().kind, 'home');
  bus.emit('steal:success', { thief: game.players[1], victim: me });
  m.tick();
  assert.equal(m.id, 'steal', "someone else's steal doesn't count");
  bus.emit('steal:success', { thief: me, victim: gm.owner });
  m.tick();
  assert.equal(m.id, null);
  assert.ok(finished, 'the last step reports the end');
  m.dispose();
});

test('step machine: steps done ahead of time are remembered; polls catch what is already true', () => {
  const { game, me } = setup(5);
  const m = createStepMachine(game, me, { step: 0 });
  // a kid runs ahead: steps on LOCK and collects before walking far
  bus.emit('lock:on', { player: me });
  bus.emit('cash:collected', { player: me, amount: 3 });
  assert.equal(m.id, 'move');
  m.step = STEPS.indexOf('collect');
  m.tick();
  assert.equal(m.id, 'speed', 'collect was already done');
  bus.emit('speed:up', { player: me, level: 1 });
  m.tick();
  m.tick();
  assert.equal(m.id, 'steal', 'speed, then lock (remembered) in two ticks');
  m.dispose();

  // resume mid-tutorial (after a reload): the garden already has a grown plant, the gate is locked
  const g = game.gardens[me.slot];
  g.planters[2].plant = grownPlant(me.slot, 21);
  const r = createStepMachine(game, me, { step: STEPS.indexOf('grow') });
  r.tick();
  assert.equal(r.id, 'collect', 'a grown plant at home finishes Grow');
  r.dispose();
  g.lockedUntil = game.time + 20;
  const k = createStepMachine(game, me, { step: STEPS.indexOf('lock') });
  k.tick();
  assert.equal(k.id, 'steal', 'already locked');
  k.dispose();
  // the lock pad is recharging: the card says so
  g.lockedUntil = 0;
  g.lockReadyAt = game.time + 12;
  const w = createStepMachine(game, me, { step: STEPS.indexOf('lock') });
  w.target();
  assert.equal(w.note().kind, 'recharge');
  assert.equal(w.note().n, 12);
  w.dispose();
});

test('online: a client\'s tutorial ticks on the host\'s forwarded events', async () => {
  bus.clear();
  const { StubApp, MemoryHub } = await import('../net/stub.mjs');
  const hub = new MemoryHub();
  const A = new StubApp('Alice', { hub, base: 'dorian' });
  const B = new StubApp('Bob', { hub, base: 'esther' });
  const apps = [A, B];
  const step = async (sec, dt = 1 / 30) => {
    for (let i = 0; i < Math.round(sec / dt); i++) {
      for (const a of apps) a.frame(dt);
      hub.advance(dt);
      await new Promise((r) => setImmediate(r));
    }
  };
  try {
    const code = await A.online.createRoom({ private: true });
    await step(0.1);
    assert.ok(await B.online.joinRoom(code), 'Bob joined');
    await step(0.6);
    const slot = B.online.mySlot;
    const me = B.game.players[slot];
    const host = A.game.players[slot];
    const tp = (x, z) => {
      me.pos.x = x;
      me.pos.z = z;
      me.vel.x = me.vel.z = 0;
      const mm = A.online.role.members?.get(B.online.pid);
      if (mm) {
        Object.assign(mm.base, { x, y: 0, z, vx: 0, vy: 0, vz: 0, t: A.online.clock, c: null });
        Object.assign(mm.show, { x, y: 0, z });
      }
    };
    const m = createStepMachine(B.game, me, { step: STEPS.indexOf('plant') });
    // Bob carries a seed home: the HOST plants it and forwards plant:planted to Bob's device
    host.carrying = { kind: 'seed', uid: 5001, speciesId: PLANTS[0].id, mutation: 'normal' };
    await step(0.4);
    const L = LAYOUT.gardens[slot];
    tp(L.inside.x, L.inside.z);
    await step(0.8);
    m.tick();
    assert.equal(m.id, 'grow', 'plant:planted reached the client: ' + m.id);
    // the steal: a grown plant in Alice's garden, Bob holds Steal, then runs home
    m.step = STEPS.indexOf('steal');
    const ga = A.game.gardens[0];
    ga.planters[0].plant = grownPlant(0, 99002);
    await step(0.5);
    assert.equal(m.target(), B.game.gardens[0].planters[0], 'the client picks the host\'s grown plant');
    const p0 = LAYOUT.gardens[0].planters[0];
    tp(p0.x - LAYOUT.gardens[0].inward * 2.5, p0.z);
    await step(0.3);
    B.pad.hold = true;
    await step(2.2);
    B.pad.hold = false;
    await step(0.3);
    assert.equal(me.carrying?.kind, 'plant', 'Bob is carrying Alice\'s plant');
    assert.deepEqual(m.target(), L.inside);
    tp(L.inside.x, L.inside.z);
    await step(0.6);
    m.tick();
    assert.equal(m.id, null, 'steal:success reached the client: the tutorial is done');
    m.dispose();
  } finally {
    B.online.leave();
    A.online.leave();
    await step(0.2);
  }
});
