// Help! Family Hero: bonk a thief running off with SOMEONE ELSE's plant and the game tips you (no browser).
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { PLANTS, HERO, PLAYER, BASE } from '../../src/config.js';
import { emptyIntent } from '../../src/gameplay/player.js';
import { BotController } from '../../src/ai/bot.js';
import { chooseGoal } from '../../src/ai/brain.js';
import { callForHelp, helpTarget, owesHero, thankHero, robberOf } from '../../src/ai/family.js';
import { reactToSocial } from '../../src/social/botReact.js';
import { EventCodec, vetFull, vetPlayer, isBotLine } from '../../src/net/protocol.js';
import { StubApp, MemoryHub } from '../net/stub.mjs';

const SP = PLANTS[6].id;
const place = (p, x, z) => {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = 0;
  p.vel.x = p.vel.y = p.vel.z = 0;
};
function setup(seed = 4) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed });
  for (const q of game.players) if (q.kind === 'bot') q.controller = null;
  const [dorian, esther, mati, micah] = game.players;
  return { game, dorian, esther, mati, micah };
}
/** `thief` runs off with a grown plant from `victim`'s garden (planter i). */
function robbed(game, thief, victim, i = 0) {
  const pl = game.gardens[victim.slot].planters[i];
  pl.unlocked = true;
  pl.plant = { uid: 9500 + victim.slot * 30 + i, speciesId: SP, mutation: 'normal', growTotal: 10, growLeft: 0, owner: victim.slot };
  assert.ok(game.stealPlant(thief, game.gardens[victim.slot], pl));
  return { pl, plant: pl.plant ?? thief.carrying.plant };
}
const bonk = (game, by, q, cause = 'bonk') => {
  q.invulnUntil = 0;
  game.hitPlayer(q, by, { x: 1, z: 0 }, PLAYER.bonk.stun, cause);
};

test('a third player bonks the thief: a tip, the HERO ribbon and steal:rescued', () => {
  const { game, dorian, esther, micah } = setup();
  const { pl } = robbed(game, micah, esther);
  const plant = micah.carrying.plant;
  const seen = [];
  bus.on('steal:rescued', (e) => seen.push(e));
  const cash = dorian.cash;
  const want = Math.round(Math.min(HERO.tipSecs * game.plantIncome(plant, esther), HERO.sellCapSecs * game.plantIncome(plant, dorian)));
  bonk(game, dorian, micah);
  assert.equal(pl.plant, plant, 'the plant flew home');
  assert.equal(seen.length, 1);
  const e = seen[0];
  assert.equal(e.hero, dorian);
  assert.equal(e.victim, esther);
  assert.equal(e.thief, micah);
  assert.equal(e.plant, plant);
  assert.equal(e.tip, want);
  assert.ok(want > 0);
  assert.equal(e.sneaky, false);
  assert.equal(dorian.cash - cash, want, 'minted into the hero\'s cash');
  assert.equal(dorian.heroUntil, game.time + HERO.ribbon);
  assert.equal(dorian.stats.rescues, 1);
});

test('the caps: one tip per hero/thief pair per 90 s, five per hero per 10 minutes', () => {
  const { game, dorian, esther, mati, micah } = setup();
  const seen = [];
  bus.on('steal:rescued', (e) => seen.push(e));
  robbed(game, micah, esther, 0);
  bonk(game, dorian, micah);
  assert.equal(seen.length, 1);
  game.time += 30;
  robbed(game, micah, esther, 1);
  const cash = dorian.cash;
  bonk(game, dorian, micah);
  assert.equal(seen.length, 1, 'same pair inside 90 s: just a good bonk');
  assert.equal(dorian.cash, cash);
  // another thief is fine
  robbed(game, mati, esther, 2);
  bonk(game, dorian, mati);
  assert.equal(seen.length, 2);
  game.time += HERO.pairGap;
  robbed(game, micah, esther, 3);
  bonk(game, dorian, micah);
  assert.equal(seen.length, 3, 'after 90 s the pair counts again');
  // five per hero per 10 minutes
  for (let i = 0; i < 4; i++) {
    game.time += HERO.pairGap + 1;
    robbed(game, micah, esther, 4 + i);
    bonk(game, dorian, micah);
  }
  assert.equal(seen.filter((e) => e.hero === dorian).length, HERO.maxPer10Min);
  game.time += 600;
  robbed(game, micah, esther, 0);
  bonk(game, dorian, micah);
  assert.equal(seen.filter((e) => e.hero === dorian).length, HERO.maxPer10Min + 1, 'a new 10 minutes');
});

test('no hero: the owner bonking their own thief, the Guard Gnome, a banana peel', () => {
  const { game, dorian, esther, micah } = setup();
  const seen = [];
  bus.on('steal:rescued', (e) => seen.push(e));
  robbed(game, micah, esther);
  bonk(game, esther, micah);
  assert.equal(seen.length, 0, 'saving your own plant is just a good bonk');
  robbed(game, micah, esther, 1);
  game.hitPlayer(micah, null, { x: 1, z: 0 }, BASE.guard.stun, 'guard');
  assert.equal(seen.length, 0, 'the Guard Gnome never makes a hero');
  robbed(game, micah, esther, 2);
  bonk(game, dorian, micah, 'banana');
  assert.equal(seen.length, 0, 'a peel left lying around is luck, not a rescue');
  robbed(game, micah, esther, 3);
  bonk(game, dorian, micah, 'balloon');
  assert.equal(seen.length, 1, 'a water balloon is a rescue');
});

test('a SNEAKY thief (3 grabs in 2 minutes) doubles the tip, capped at what the hero could sell it for', () => {
  const { game, dorian, esther, micah } = setup();
  const seen = [];
  bus.on('steal:rescued', (e) => seen.push(e));
  for (let i = 0; i < 2; i++) {
    robbed(game, micah, esther, i);
    game.returnPlant(micah.carrying.plant, esther.slot, i);
    micah.carrying = null;
    game.time += 20;
  }
  robbed(game, micah, esther, 2);
  const plant = micah.carrying.plant;
  bonk(game, dorian, micah);
  assert.equal(seen[0].sneaky, true);
  const want = Math.round(Math.min(2 * HERO.tipSecs * game.plantIncome(plant, esther), HERO.sellCapSecs * game.plantIncome(plant, dorian)));
  assert.equal(seen[0].tip, want);
  assert.ok(seen[0].tip > HERO.tipSecs * game.plantIncome(plant, esther) * 1.5, 'about double');
});

test('rescued bots owe their hero (no stealing from them for a while) and say thank you', () => {
  const { game, dorian, esther, micah } = setup();
  const lines = [];
  bus.on('chat', (e) => lines.push(e));
  robbed(game, micah, esther);
  bonk(game, dorian, micah);
  assert.ok(owesHero(game, esther, dorian), 'Esther owes Dorian');
  assert.ok(!owesHero(game, micah, dorian) && !owesHero(game, esther, micah));
  esther.controller = new BotController('guardian', 'normal', { seed: 3 });
  game.time += 5;
  const said = thankHero(game, { hero: dorian, victim: esther, plant: game.gardens[1].planters[0].plant });
  assert.ok(said);
  assert.equal(lines.at(-1).player, esther);
  assert.match(lines.at(-1).text, /Dorian/);
  assert.ok(isBotLine(lines.at(-1).text), lines.at(-1).text);
  game.time += HERO.owes;
  assert.ok(!owesHero(game, esther, dorian), 'all square after HERO.owes s');
});

test('"Help!" while being robbed: Esther always comes (HelpGoal), Micah sits it out', () => {
  bus.clear();
  const game = new Game({ humanId: 'maddie', seed: 21 });
  const [dorian, esther, mati, micah] = game.players;
  for (const b of [dorian, esther, micah]) b.controller = new BotController(b.char.personality, 'normal', { seed: 5 + b.slot });
  mati.controller = {
    q: {},
    getIntent() {
      const it = Object.assign(emptyIntent(), this.q);
      this.q = {};
      return it;
    },
  };
  // the family listens like main.js wires it
  const lines = [];
  bus.on('chat', (e) => {
    lines.push({ ...e, t: game.time });
    if (!e?.player || e.player.kind === 'bot' || !e.quick) return;
    for (const b of game.players) if (b.kind === 'bot') reactToSocial(game, b, { type: 'chat', ...e });
  });
  for (let t = 0; t < 1; t += 1 / 30) game.update(1 / 30);
  robbed(game, micah, mati);
  const gM = game.gardens[mati.slot];
  place(micah, gM.L.outside.x, gM.L.outside.z);
  place(esther, gM.L.outside.x + 30, gM.L.outside.z + 20);
  place(dorian, 0, 300); // far up the road: Tycoons only come from close by
  assert.equal(robberOf(game, mati), micah);
  const t0 = game.time;
  mati.controller.q.say = 'help';
  for (let t = 0; t < 2; t += 1 / 30) {
    game.update(1 / 30);
    if (esther.controller.goal?.type === 'help') break;
  }
  assert.equal(esther.controller.goal?.type, 'help', 'Esther runs to help: ' + esther.controller.goal?.type);
  assert.equal(esther.controller.goal.q, micah);
  assert.deepEqual(helpTarget(game, esther), { thief: micah, victim: mati });
  assert.equal(helpTarget(game, dorian), null, 'Dad is too far away');
  for (let t = 0; t < 1.5; t += 1 / 30) game.update(1 / 30);
  const said = lines.filter((l) => l.player === esther && l.t > t0);
  assert.ok(said.length >= 1 && isBotLine(said[0].text), 'Esther says she is coming: ' + said.map((l) => l.text));
  // the thief never helps against himself; once the plant is home the help is over
  assert.ok(!callForHelp(game, mati).some((a) => a.bot === micah));
  game.dropCarried(micah, null, 'monster');
  assert.equal(helpTarget(game, esther), null);
  // nobody robbing you: "Help!" is just a chat line (no helpers)
  assert.deepEqual(callForHelp(game, mati), []);
});

test('Esther answers every call, Micah only now and then (personality odds)', () => {
  let estherYes = 0, micahYes = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const { game, dorian, esther, mati, micah } = setup(100 + i);
    for (const b of [esther, mati, micah]) b.controller = new BotController(b.char.personality, 'normal', { seed: i });
    robbed(game, mati, dorian);
    place(esther, mati.pos.x + 10, mati.pos.z);
    place(micah, mati.pos.x + 10, mati.pos.z);
    const a = callForHelp(game, dorian);
    if (a.find((x) => x.bot === esther)?.yes) estherYes++;
    if (a.find((x) => x.bot === micah)?.yes) micahYes++;
    assert.ok(!a.some((x) => x.bot === mati), 'the thief is not asked');
  }
  assert.equal(estherYes, N);
  assert.ok(micahYes > N * 0.12 && micahYes < N * 0.4, 'Micah: ' + micahYes);
});

test('the network: heroUntil is vetted, steal:rescued only with three different players and a real tip', () => {
  const { game, dorian, esther, micah } = setup();
  robbed(game, micah, esther);
  bonk(game, dorian, micah);
  const full = vetFull(JSON.parse(JSON.stringify(game.serializeFull())));
  assert.equal(full.players[0].heroUntil, dorian.heroUntil);
  const d = JSON.parse(JSON.stringify(game.serializeFull().players[0]));
  d.heroUntil = 'forever';
  assert.ok(vetPlayer(d, 0));
  assert.equal(d.heroUntil, 0);
  bus.clear();
  const g2 = new Game({ humanId: 'esther', seed: 2 });
  g2.applyFull(full, { localSlot: 1 });
  assert.equal(g2.players[0].heroUntil, dorian.heroUntil, 'the ribbon reaches other devices');
  const codec = new EventCodec(game), codec2 = new EventCodec(g2);
  const e = EventCodec.vet('steal:rescued', codec2.decode(codec.encode({ hero: dorian, victim: esther, thief: micah, plant: game.gardens[1].planters[0].plant, tip: 120, sneaky: false })));
  assert.equal(e.hero, g2.players[0]);
  assert.equal(e.tip, 120);
  const P = g2.players;
  assert.equal(EventCodec.vet('steal:rescued', { hero: P[0], victim: P[1], thief: P[0], tip: 5 }), null, 'nobody bonks themselves');
  assert.equal(EventCodec.vet('steal:rescued', { hero: P[1], victim: P[1], thief: P[3], tip: 5 }), null);
  assert.equal(EventCodec.vet('steal:rescued', { hero: P[0], victim: P[1], thief: P[3], tip: -5 }), null);
  assert.equal(EventCodec.vet('steal:rescued', { hero: P[0], victim: P[1], thief: P[3], tip: 'lots' }), null);
});

// ------------------------------------------------------------------ online (in-memory room)

test('online: the host tips the hero; a friend sees steal:rescued once and the HERO ribbon', async () => {
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
    const sA = A.online.mySlot, sB = B.online.mySlot;
    const hero = A.game.players[sA], victim = A.game.players[sB];
    const thief = A.game.players.find((q) => q.kind === 'bot');
    const onB = [];
    bus.on('steal:rescued', (e) => {
      if (B.game.players.includes(e.hero)) onB.push(e);
    });
    robbed(A.game, thief, victim);
    await step(0.4);
    const cashB = B.game.players[sA].cash;
    bonk(A.game, hero, thief);
    await step(0.8);
    assert.equal(onB.length, 1, 'Bob hears about it once');
    assert.equal(onB[0].hero, B.game.players[sA]);
    assert.equal(onB[0].victim, B.game.players[sB], "it was Bob's plant");
    assert.equal(onB[0].thief, B.game.players[thief.slot]);
    assert.ok(onB[0].tip > 0);
    assert.ok(B.game.players[sA].heroUntil > B.game.time, 'the HERO ribbon shows on his device');
    assert.ok(Math.floor(B.game.players[sA].cash) >= Math.floor(cashB + onB[0].tip - 1), 'the tip came from the host');
    // a client can't print a tip: addCash is refused online
    assert.equal(A.online.role.act(B.game.players[sB], 'addCash', [1e6]), false);
  } finally {
    for (const a of apps) a.online.leave();
  }
});
