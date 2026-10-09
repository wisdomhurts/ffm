// Big Chomp the Garden Gobbler (the world boss): spawning, bonks and balloons, the burst (seeds, pot, crown,
// refund), the slurp (never on Chill), the timeout, the bots swarming it, the full-state round trip and a room
// where a friend's device sees its hit points drop exactly once per hit. No browser.
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { BOSS, PLANTS, PLAYER, ITEM, MATCH } from '../../src/config.js';
import { emptyIntent } from '../../src/gameplay/player.js';
import { BotController } from '../../src/ai/bot.js';
import { bossPark, BOSS_NEVER } from '../../src/gameplay/boss.js';
import { vetFull, vetBoss, vetPlayer, sectionize, signature, mergeSections, EventCodec } from '../../src/net/protocol.js';
import { StubApp, MemoryHub } from '../net/stub.mjs';

function setup({ seed = 5, difficulty = 'normal', mode = 'endless' } = {}) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed, difficulty, mode });
  for (const q of game.players) if (q.kind === 'bot') q.controller = null;
  return { game, me: game.human };
}
const place = (p, x, z) => {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = 0;
  p.vel.x = p.vel.y = p.vel.z = 0;
};
/** Drive one player with a fixed intent for `secs` (the others idle). */
function run(game, p, secs, intent = {}) {
  if (p) p.controller = { getIntent: () => ({ ...emptyIntent(), ...intent }) };
  for (let i = 0, n = Math.round(secs * 60); i < n; i++) game.update(1 / 60);
  if (p) p.controller = null;
}
/** A boss parked (munching) at garden `slot`'s gate. */
function parked(game, slot = 0) {
  const at = bossPark(slot);
  const b = game.spawnBoss({ target: slot, x: at.x, z: at.z });
  b.yaw = at.yaw;
  run(game, null, 0.1);
  assert.equal(b.state, 'munch', 'it parks right away');
  return b;
}
const seen = (name) => {
  const list = [];
  bus.on(name, (e) => list.push(e));
  return list;
};

test('it comes once per Showdown and every 9-12 min in Endless (first at 5 min); spawnBoss is the debug hook', () => {
  const { game } = setup();
  assert.equal(game.nextBossAt, BOSS.firstAt);
  assert.equal(game.boss, null);
  for (let s = 1; s <= 20; s++) {
    const sd = new Game({ humanId: 'dorian', seed: s, mode: 'showdown' });
    assert.ok(sd.nextBossAt >= BOSS.showdown[0] && sd.nextBossAt <= BOSS.showdown[1], 'Showdown window: ' + sd.nextBossAt);
    assert.ok(MATCH.showdownSeconds - sd.nextBossAt >= BOSS.life + BOSS.lastSecs, 'gone before the last 90 s');
  }
  const spawned = seen('boss:spawn');
  game.time = BOSS.firstAt - 0.05;
  run(game, null, 0.2);
  const b = game.boss;
  assert.ok(b, 'it shows up on time');
  assert.equal(spawned.length, 1);
  assert.equal(b.max, BOSS.hp + BOSS.hpPerPlayer * 4, '40 + 20 per player');
  assert.equal(b.hp, b.max);
  assert.equal(b.state, 'crawl');
  assert.equal(spawned[0].victim, game.players[b.target]);
  assert.equal(game.spawnBoss(), null, 'one at a time');
  assert.equal(game.nextBossAt, BOSS_NEVER, 'the next one is planned when this one is gone');
  // it crawls to the richest garden's gate at BOSS.speed and parks there
  const to = bossPark(b.target);
  const d0 = Math.hypot(to.x - b.x, to.z - b.z);
  run(game, null, 2);
  const d1 = Math.hypot(to.x - b.x, to.z - b.z);
  assert.ok(Math.abs(d0 - d1 - BOSS.speed * 2) < 0.6, `crawls at ${BOSS.speed} studs/s (${(d0 - d1).toFixed(2)} in 2 s)`);
  run(game, null, d1 / BOSS.speed + 1);
  assert.equal(b.state, 'munch');
  assert.ok(Math.hypot(to.x - b.x, to.z - b.z) < 0.6, 'parked outside the gate');
  const gate = game.gardens[b.target].L.gate;
  assert.ok(Math.abs(b.x - gate.x) >= BOSS.park - 0.6, 'clear of the laser');
});

test('bonks bring it to 0: a burst of 12-20 mutated seeds, a pot split by hits, a crown for the top bonker', () => {
  const { game, me } = setup();
  const bot = game.players[1];
  // some income so the pot is worth something
  const g1 = game.gardens[1];
  g1.planters[0].plant = { uid: 9001, speciesId: PLANTS[5].id, mutation: 'normal', growTotal: 10, growLeft: 0, owner: 1 };
  const b = parked(game, 0);
  b.hp = b.max = 7;
  const hits = seen('boss:hit'), done = seen('boss:defeated'), misses = seen('bonk:miss');
  // the bot gets two in first (we stay out of its noodle's way)
  place(me, 0, -40);
  place(bot, b.x, b.z);
  run(game, bot, 1, { bonk: true });
  assert.equal(b.hits[1], 2, 'a held bonk swings every cooldown: 2 hits in 1 s');
  place(bot, 0, 40);
  place(me, b.x, b.z);
  const ground0 = game.ground.length;
  const cash0 = game.players.map((p) => p.cash);
  const income = game.players.reduce((s, p) => s + game.gardenIncome(game.gardens[p.slot]), 0);
  for (let i = 0; i < 600 && game.boss; i++) run(game, me, 1 / 60, { bonk: true });
  assert.equal(game.boss, null, 'burst');
  assert.equal(done.length, 1);
  assert.equal(misses.length, 0, 'every swing landed');
  assert.equal(hits.length, 7, 'one boss:hit per hit');
  assert.deepEqual(hits.map((e) => e.hp), [6, 5, 4, 3, 2, 1, 0]);
  const e = done[0];
  assert.equal(e.top, me, '5 hits beat 2');
  // seeds
  const seeds = game.ground.slice(ground0);
  assert.ok(seeds.length >= BOSS.seeds[0] && seeds.length <= BOSS.seeds[1], 'seeds: ' + seeds.length);
  assert.equal(seeds.length, e.seeds);
  for (const s of seeds) {
    assert.equal(s.kind, 'seed');
    assert.equal(s.podId, null, 'no pod to go back to');
    assert.ok(['gold', 'diamond', 'rainbow'].includes(s.mutation), s.mutation);
    assert.ok(Math.abs(s.expiresAt - game.time - BOSS.seedLife) < 6);
    assert.ok(Math.abs(s.x) <= 27, 'on the aisle: ' + s.x.toFixed(1));
  }
  // the pot: 60 s of everyone's income, split 5:2 by hits, the shares add up to it exactly
  assert.ok(income > 0);
  assert.equal(e.pot, Math.round(BOSS.potSecs * income));
  assert.equal(e.shares.reduce((s, v) => s + v, 0), e.pot);
  assert.ok(Math.abs(e.shares[0] - (e.pot * 5) / 7) <= 1 && Math.abs(e.shares[1] - (e.pot * 2) / 7) <= 1, 'shares: ' + e.shares);
  game.players.forEach((p, i) => assert.equal(Math.round(p.cash - cash0[i]), e.shares[i], p.name + ' got paid'));
  assert.ok(Math.abs(me.crownUntil - game.time - BOSS.crown) < 0.1, 'the crown for 60 s');
  assert.equal(bot.crownUntil, 0);
  // the seeds can be grabbed (no pod: they never go back anywhere)
  const s0 = seeds[0];
  place(me, s0.x, s0.z);
  game.findInteraction(me).action();
  assert.equal(me.carrying?.speciesId, s0.speciesId);
  assert.equal(me.carrying.podId, null);
  // the next one is 9-12 min away
  assert.ok(game.nextBossAt - game.time >= BOSS.gapMin - 0.01 && game.nextBossAt - game.time <= BOSS.gapMax + 0.01);
  // a ground seed that expires just goes away
  me.carrying = null;
  run(game, null, BOSS.seedLife + 1);
  assert.equal(game.ground.filter((x) => x.podId === null).length, 0, 'unclaimed burst seeds fade away');
});

test('a swing at Big Chomp spares empty-handed teammates (a thief with a plant still gets bonked)', () => {
  const { game, me } = setup();
  const b = parked(game, 0);
  const pal = game.players[1], thief = game.players[3];
  place(me, b.x, b.z);
  me.yaw = 0;
  place(pal, b.x, b.z + 2); // right in front of the noodle
  place(thief, 0, -40);
  run(game, me, 1 / 60, { bonk: true });
  assert.equal(b.hits[me.slot], 1);
  assert.ok(game.time >= pal.stunUntil, 'the teammate is not bonked');
  run(game, null, 1);
  const plant = { uid: 9100, speciesId: PLANTS[2].id, mutation: 'normal', growTotal: 10, growLeft: 0, owner: 1 };
  game.gardens[1].planters[0].unlocked = true;
  thief.carrying = { kind: 'plant', plant, fromSlot: 1, fromIndex: 0 };
  place(me, b.x, b.z);
  me.yaw = 0;
  place(pal, 0, -40);
  place(thief, b.x, b.z + 2);
  const foiled = seen('steal:foiled');
  run(game, me, 1 / 60, { bonk: true });
  assert.equal(b.hits[me.slot], 2);
  assert.equal(foiled.length, 1, 'the thief dropped it');
  assert.equal(game.gardens[1].planters[0].plant, plant, 'and it flew home');
});

test('a water balloon splash on its body is 3 hits', () => {
  const { game, me } = setup();
  const b = parked(game, 1);
  me.items.balloon = 2;
  // stand 15 studs off its head and throw at it
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  const hx = b.x + fx * BOSS.body.front, hz = b.z + fz * BOSS.body.front;
  place(me, hx - fz * 15, hz + fx * 15);
  me.yaw = Math.atan2(hx - me.pos.x, hz - me.pos.z);
  const splash = seen('balloon:splash');
  run(game, me, 1 / 60, { useItem: 'balloon' });
  run(game, null, 2);
  assert.equal(splash.length, 1);
  assert.equal(b.hp, b.max - BOSS.splashHits, 'splash = 3 hits');
  assert.equal(b.hits[me.slot], BOSS.splashHits);
});

test('it slurps 2%/s of the cash pile up to 25%, never banked cash; a burst refunds it', () => {
  const { game, me } = setup();
  const g = game.gardens[0];
  g.cashPile = 1000;
  const cash = me.cash;
  const b = parked(game, 0);
  run(game, null, 5);
  const expect = 1000 * (1 - Math.exp(-BOSS.slurpRate * 5.1));
  assert.ok(Math.abs(b.slurped - expect) < 5, `slurped ${b.slurped.toFixed(1)} ~ ${expect.toFixed(1)}`);
  assert.ok(Math.abs(g.cashPile + b.slurped - 1000) < 1e-6, 'it comes out of the pile');
  run(game, null, 40);
  assert.ok(Math.abs(b.slurped - 250) < 0.5, 'capped at a quarter: ' + b.slurped.toFixed(1));
  assert.equal(me.cash, cash, 'banked cash is never touched');
  // a save keeps the slurp in the garden (only its burp takes it for good)
  assert.ok(Math.abs(game.serialize().gardens[0].cashPile - 1000) < 1e-6);
  // POP: the cash comes back
  b.hp = 1;
  place(me, b.x, b.z);
  const done = seen('boss:defeated');
  run(game, me, 0.1, { bonk: true });
  assert.equal(done.length, 1);
  assert.ok(Math.abs(done[0].refund - 250) < 0.5);
  assert.ok(Math.abs(g.cashPile - 1000) < 1e-6, 'refunded: ' + g.cashPile);
});

test('Chill: it slurps nothing and a bot\'s hit counts half', () => {
  const { game } = setup({ difficulty: 'chill' });
  const g = game.gardens[0];
  g.cashPile = 1000;
  const b = parked(game, 0);
  run(game, null, 20);
  assert.equal(b.slurped, 0);
  assert.equal(g.cashPile, 1000);
  const bot = game.players[2];
  place(bot, b.x, b.z);
  run(game, bot, 0.1, { bonk: true });
  assert.equal(b.hp, b.max - BOSS.botHitChill);
  assert.equal(b.hits[2], BOSS.botHitChill);
});

test('time out: it burps and crawls away with the slurp; then the next one is planned', () => {
  const { game } = setup();
  const g = game.gardens[0];
  g.cashPile = 1000;
  const b = parked(game, 0);
  const left = seen('boss:leave');
  run(game, null, BOSS.life + 0.5);
  assert.equal(left.length, 1);
  assert.equal(b.state, 'leave');
  const slurped = left[0].slurped;
  assert.ok(slurped > 200, 'slurped ' + slurped);
  // it can't be hurt any more
  const me = game.human;
  place(me, b.x, b.z);
  const hp = b.hp;
  run(game, me, 0.1, { bonk: true });
  assert.equal(b.hp, hp);
  run(game, null, 30);
  assert.equal(game.boss, null, 'gone up the road');
  assert.ok(Math.abs(g.cashPile + slurped - 1000) < 1e-6, 'it kept what it ate');
  assert.ok(game.nextBossAt > game.time + BOSS.gapMin - 31 && game.nextBossAt < BOSS_NEVER);
});

test('the family bots swarm it and bonk it to bits (they still have their own lives otherwise)', () => {
  bus.clear();
  const game = new Game({ humanId: null, seed: 11, difficulty: 'normal' });
  for (const p of game.players) p.controller = new BotController(p.char.personality, 'normal', { seed: 3 + p.slot });
  run(game, null, 40);
  const b = game.spawnBoss();
  const hit = seen('boss:hit');
  const done = seen('boss:defeated');
  let swarm = 0;
  for (let t = 0; t < 80 && !done.length; t += 0.5) {
    run(game, null, 0.5);
    swarm = Math.max(swarm, game.players.filter((p) => p.controller.goal?.type === 'boss').length);
  }
  assert.ok(swarm >= 3, 'bots go for it: ' + swarm);
  assert.equal(done.length, 1, 'they burst it before it gives up (hp left ' + b.hp + ')');
  assert.ok(new Set(hit.map((e) => e.by.slot)).size >= 3, 'lots of them hit it');
  assert.ok(done[0].top && !done[0].top.isHuman);
  run(game, null, 3);
  assert.ok(game.players.every((p) => p.controller.goal?.type !== 'boss'), 'and go back to farming and stealing');
});

test('full state round trip (serializeFull -> sectionize -> vetFull -> applyFull) and the bs delta', () => {
  const { game, me } = setup();
  game.gardens[2].cashPile = 500;
  const b = parked(game, 2);
  run(game, null, 3);
  place(me, b.x, b.z);
  run(game, me, 0.05, { bonk: true });
  me.crownUntil = game.time + 30;
  const S = sectionize(game.serializeFull());
  assert.ok(S.bs && S.bs.boss && S.bs.boss.uid === b.uid);
  const full = vetFull(JSON.parse(JSON.stringify(game.serializeFull())));
  assert.ok(full);
  bus.clear();
  const mirror = new Game({ humanId: 'esther', seed: 9 });
  mirror.applyFull(full, { localSlot: 1 });
  const m = mirror.boss;
  for (const k of ['uid', 'hp', 'max', 'target', 'state', 'until']) assert.equal(m[k], b[k], k);
  assert.ok(Math.abs(m.slurped - b.slurped) < 1e-3 && Math.abs(m.x - b.x) < 1e-3);
  assert.deepEqual(m.hits, b.hits);
  assert.equal(mirror.players[0].crownUntil, me.crownUntil);
  assert.equal(mirror.nextBossAt, game.nextBossAt);
  // later states update the same object (views hold on to it), a burst clears it
  const keep = mirror.boss;
  b.hp -= 2;
  mirror.applyFull(vetFull(JSON.parse(JSON.stringify(game.serializeFull()))), { localSlot: 1 });
  assert.equal(mirror.boss, keep);
  assert.equal(keep.hp, b.hp);
  // the 'bs' section: hit points and state go out right away, its crawl rides the periodic refresh
  const sig = signature('bs', S.bs);
  assert.equal(signature('bs', { ...S.bs, boss: { ...S.bs.boss, x: S.bs.boss.x + 3, slurped: 99 } }), sig);
  assert.notEqual(signature('bs', { ...S.bs, boss: { ...S.bs.boss, hp: S.bs.boss.hp - 1 } }), sig);
  assert.notEqual(signature('bs', { ...S.bs, boss: null }), sig);
  const copy = JSON.parse(JSON.stringify(full));
  copy.boss = null;
  mergeSections(copy, { bs: { next: 123, boss: S.bs.boss } });
  assert.equal(copy.boss.uid, b.uid);
  assert.equal(copy.nextBossAt, 123);
  // an older state without a boss still loads; junk is cleaned up
  const old = JSON.parse(JSON.stringify(game.serializeFull()));
  delete old.boss;
  delete old.nextBossAt;
  const v = vetFull(old);
  assert.ok(v && v.boss === null && v.nextBossAt === BOSS_NEVER);
  assert.equal(vetBoss({ ...S.bs.boss, state: 'dance' }), null);
  assert.equal(vetBoss('boss'), null);
  const j = vetBoss({ ...S.bs.boss, hp: 1e9, max: 50, target: 9, x: 1e9, hits: ['x', -5, 1e12], slurped: -3, until: NaN });
  assert.deepEqual([j.hp, j.max, j.target, j.x, j.hits, j.slurped, j.until], [50, 50, 0, 96, [0, 0, 1e5, 0], 0, 0]);
  const pd = JSON.parse(JSON.stringify(game.serializeFull().players[0]));
  pd.crownUntil = 'forever';
  assert.ok(vetPlayer(pd, 0) && pd.crownUntil === 0);
  // its events carry numbers and players, never the boss object
  const codec = new EventCodec(game);
  const ev = codec.encode({ by: me, n: 1, hp: 3, max: 120, cause: 'bonk', x: 1.23456, z: 2 });
  assert.deepEqual(ev, { by: { $p: me.slot }, n: 1, hp: 3, max: 120, cause: 'bonk', x: 1.235, z: 2 });
  const back = EventCodec.vet('boss:hit', new EventCodec(mirror).decode(ev));
  assert.equal(back.by, mirror.players[me.slot]);
});

test('a garden changes hands mid-fight: its hits and crown go, the slurp leaves with its owner', () => {
  const { game } = setup();
  game.gardens[3].cashPile = 800;
  const b = parked(game, 3);
  run(game, null, 4);
  const slurped = b.slurped;
  assert.ok(slurped > 0);
  b.hits[3] = 9;
  game.players[3].crownUntil = game.time + 50;
  const data = game.serializeSlot(3);
  assert.ok(Math.abs(data.garden.cashPile - 800) < 1e-6, 'their saved garden keeps the slurp');
  game.setSlot(3, { kind: 'empty' });
  assert.equal(b.hits[3], 0);
  assert.equal(b.slurped, 0);
  assert.equal(game.players[3].crownUntil, 0);
  run(game, null, 0.1);
  assert.notEqual(b.target, 3, 'it goes for someone who is still here');
  assert.equal(b.state, 'crawl');
});

// ------------------------------------------------------------------ online (in-memory room)

test('online: a friend\'s device sees its hit points drop exactly once per hit (host-authoritative)', async () => {
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
  try {
    const A = new StubApp('Alice', { hub, base: 'dorian' });
    const B = new StubApp('Bob', { hub, base: 'esther' });
    apps.push(A, B);
    const code = await A.online.createRoom({ private: false }); // public: people only, no bots bonking
    await new Promise((r) => setTimeout(r, 0));
    await step(0.1);
    assert.ok(await B.online.joinRoom(code));
    await step(0.6);
    hub.latency = 0.04;
    const sB = slotOf(B);
    const p = B.game.players[sB];
    const at = bossPark(sB);
    const boss = A.game.spawnBoss({ target: sB, x: at.x, z: at.z });
    assert.equal(boss.max, BOSS.hp + BOSS.hpPerPlayer * 2, 'two people in the room');
    // Bob stands in it (no aiming needed) and his device tells the host so
    p.pos.x = at.x;
    p.pos.z = at.z;
    p.pos.y = 0;
    const m = A.online.role.members.get(B.online.pid);
    Object.assign(m.base, { x: at.x, y: 0, z: at.z, vx: 0, vy: 0, vz: 0, t: A.online.clock, c: null });
    await step(0.6);
    assert.equal(B.game.boss?.uid, boss.uid, 'it shows up on his device');
    assert.equal(B.game.boss.state, 'munch');
    // record every hit point value his device ever shows
    const shown = [B.game.boss.hp];
    const onB = [];
    bus.on('boss:hit', (e) => {
      if (e.by === B.game.players[e.by.slot] && B.game.boss) onB.push(e.hp);
    });
    const watch = () => {
      const hp = B.game.boss?.hp;
      if (hp != null && hp !== shown[shown.length - 1]) shown.push(hp);
    };
    for (let i = 0; i < 5; i++) {
      B.pad.press('bonk');
      for (let k = 0; k < 30; k++) {
        await step(1 / 30);
        watch();
      }
    }
    // and one from the host
    A.game.players[slotOf(A)].pos.x = at.x;
    A.game.players[slotOf(A)].pos.z = at.z;
    A.pad.press('bonk');
    for (let k = 0; k < 30; k++) {
      await step(1 / 30);
      watch();
    }
    const max = boss.max;
    assert.equal(boss.hp, max - 6, 'the host counted 6 hits: ' + boss.hp);
    assert.equal(boss.hits[sB], 5);
    assert.deepEqual(shown, [max, max - 1, max - 2, max - 3, max - 4, max - 5, max - 6], 'his device: one step down per hit, never twice, never back up');
    assert.deepEqual(onB, [max - 1, max - 2, max - 3, max - 4, max - 5, max - 6], 'and one boss:hit each');
    // the burst reaches him: gone, the seeds on the ground, his share of the pot
    const cash = B.game.players[sB].cash;
    const pops = [];
    bus.on('boss:defeated', (e) => {
      if (e.top === B.game.players[e.top.slot]) pops.push(e);
    });
    boss.hp = 1;
    B.pad.press('bonk');
    await step(1);
    assert.equal(A.game.boss, null);
    assert.equal(B.game.boss, null, 'gone on his device too');
    assert.equal(pops.length, 1, 'he saw it pop once');
    assert.equal(pops[0].top, B.game.players[sB], 'he is the Chomp Champ');
    assert.ok(B.game.players[sB].crownUntil > B.game.time + BOSS.crown - 3, 'crown on his device');
    assert.ok(B.game.ground.filter((x) => x.podId === null).length >= BOSS.seeds[0], 'the seeds show up for him');
    assert.ok(B.game.players[sB].cash >= cash, 'his share arrives');
  } finally {
    for (const a of apps) a.online.leave();
  }
});
