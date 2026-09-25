// Family bots answering emotes and quick chat (no browser). Run: node --test tests/social/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { BotController } from '../../src/ai/bot.js';
import { emptyIntent } from '../../src/gameplay/player.js';
import { reactToSocial, socialDebug, REACT } from '../../src/social/botReact.js';
import { REPLIES, EMOTE_LINES } from '../../src/social/replies.js';

function place(p, x, z) {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = 0;
  p.vel.x = p.vel.y = p.vel.z = 0;
}

// A local game like main.js builds it: the human is Maddie, the family bots think for themselves, and
// main.js's listener hands every person's emote / quick-chat line to reactToSocial for each bot.
function setup(seed = 11) {
  bus.clear();
  const game = new Game({ humanId: 'maddie', seed, difficulty: 'normal' });
  const human = game.human;
  // stands still; emote / say requests go out with the next tick (like HumanController.queue)
  human.controller = {
    q: {},
    getIntent() {
      const it = Object.assign(emptyIntent(), this.q);
      this.q = {};
      return it;
    },
  };
  for (const p of game.players) if (p !== human) p.controller = new BotController(p.char.personality, 'normal', { seed: seed * 7 + p.slot });
  const log = [];
  for (const ev of ['emote', 'chat']) {
    bus.on(ev, (e) => {
      log.push({ ev, t: game.time, ...e });
      if (!e?.player || e.player.kind === 'bot' || (ev === 'chat' && !e.quick)) return;
      for (const b of game.players) if (b.kind === 'bot') reactToSocial(game, b, { type: ev, ...e });
    });
  }
  const run = (s) => {
    for (let t = 0; t < s; t += 1 / 30) game.update(1 / 30);
  };
  // let the bots settle into their first errands, then gather the family by the fountain
  run(1);
  const gather = () => {
    place(human, 0, 0);
    human.yaw = 0;
    game.players.filter((p) => p !== human).forEach((b, i) => place(b, -6 + i * 6, 8));
  };
  gather();
  const act = (field, value) => {
    human.controller.q[field] = value;
    run(1 / 30);
  };
  return { game, human, bots: game.players.filter((p) => p !== human), log, run, act, gather };
}

const botLines = (log, since = 0) => log.filter((x) => x.ev === 'chat' && x.player.kind === 'bot' && x.t >= since);
const botEmotes = (log, since = 0) => log.filter((x) => x.ev === 'emote' && x.player.kind === 'bot' && x.t >= since);

test('a wave near the family gets waved back (stopping and facing you)', () => {
  let waved = 0;
  let faced = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = setup(seed);
    const t0 = s.game.time;
    s.act('emote', 'wave');
    // sample while reacting: a waving bot holds still and turns to face the human
    for (let i = 0; i < 60; i++) {
      s.run(1 / 30);
      for (const b of s.bots) {
        if (b.emote?.id === 'wave') {
          const want = Math.atan2(s.human.pos.x - b.pos.x, s.human.pos.z - b.pos.z);
          if (Math.abs(Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw))) < 0.35) faced++;
          assert.ok(Math.hypot(b.vel.x, b.vel.z) < 2, 'stands still while waving');
        }
      }
    }
    const e = botEmotes(s.log, t0);
    assert.ok(e.length <= 2, 'at most two bots answer one wave');
    if (e.some((x) => x.id === 'wave')) waved++;
  }
  assert.ok(waved >= 4, `bots usually wave back (${waved}/6)`);
  assert.ok(faced > 0, 'a waving bot faces the person');
});

test('quick chat gets one fitting reply in the family voice, after a natural pause', () => {
  let replied = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = setup(seed);
    const t0 = s.game.time;
    s.act('say', 'gg');
    s.run(3);
    const lines = botLines(s.log, t0);
    if (!lines.length) continue;
    replied++;
    const first = lines[0];
    assert.ok(first.t - t0 >= 0.5, 'not instant');
    const pool = REPLIES.gg[first.player.id].map((l) => l.replaceAll('{name}', s.human.name));
    assert.ok(pool.includes(first.text), `"${first.text}" is ${first.player.id}'s GG line`);
    assert.ok(lines.length <= 2, 'one reply (sometimes a second voice)');
    if (lines.length === 2) assert.ok(lines[1].t - lines[0].t >= REACT.gap - 1e-6, 'replies take turns');
  }
  assert.ok(replied >= 4, `GG usually gets an answer (${replied}/5)`);
});

test('Race you! gets a race-ready reply, e.g. Maddie is ON', () => {
  // the human is Micah this time so Maddie is a bot next to them
  bus.clear();
  const game = new Game({ humanId: 'micah', seed: 9 });
  for (const p of game.players) if (!p.isHuman) p.controller = new BotController(p.char.personality, 'normal', { seed: p.slot });
  const maddie = game.players.find((p) => p.id === 'maddie');
  place(game.human, 0, 0);
  game.players.filter((p) => !p.isHuman).forEach((b) => place(b, 60, 60));
  place(maddie, 3, 3);
  const said = [];
  bus.on('chat', (e) => said.push(e));
  reactToSocial(game, maddie, { type: 'chat', player: game.human, text: 'Race you!', quick: true, phrase: 'race' });
  for (let t = 0; t < 2.5; t += 1 / 30) game.update(1 / 30);
  const line = said.find((x) => x.player === maddie);
  assert.ok(line, 'Maddie answers');
  assert.ok(REPLIES.race.maddie.includes(line.text), line.text);
});

test('dancing near bots gets someone dancing along; cooldowns stop an instant repeat', () => {
  let danced = 0;
  for (const seed of [1, 2, 3, 4]) {
    const s = setup(seed);
    const t0 = s.game.time;
    s.act('emote', 'dance2');
    s.run(2.5);
    const e = botEmotes(s.log, t0).filter((x) => x.id.startsWith('dance'));
    if (e.length) danced++;
    // the same bots won't dance again right away
    s.gather();
    const t1 = s.game.time;
    s.act('emote', 'dance1');
    s.run(2);
    const again = botEmotes(s.log, t1).filter((x) => e.some((y) => y.player === x.player));
    assert.equal(again.length, 0, 'emote cooldown');
  }
  assert.ok(danced >= 3, `dance parties happen (${danced}/4)`);
});

test('spam gets one "I heard you!" and then silence', () => {
  const s = setup(2);
  const t0 = s.game.time;
  for (let i = 0; i < 12; i++) {
    s.act('say', 'hi');
    s.run(1.3);
  }
  const lines = botLines(s.log, t0);
  const spamLines = Object.values(EMOTE_LINES.spam).flat();
  assert.ok(lines.length <= 6, `not a reply per message (${lines.length} replies to 12)`);
  assert.ok(lines.filter((x) => spamLines.includes(x.text)).length <= 1);
});

test('bots never stop to wave while carrying, guarding or when far away', () => {
  const s = setup(1);
  // everyone far away: no emote replies (a far "hi" may still get a chat line)
  s.bots.forEach((b, i) => place(b, 55, -30 + i * 20));
  const t0 = s.game.time;
  s.act('emote', 'wave');
  s.run(2);
  assert.equal(botEmotes(s.log, t0).length, 0);
  // close, but carrying a seed
  s.run(REACT.emoteCooldown);
  s.gather();
  for (const b of s.bots) b.carrying = { kind: 'seed', speciesId: 'daisy', mutation: 'normal', podId: 0 };
  const t1 = s.game.time;
  s.act('emote', 'wave');
  s.run(2);
  assert.equal(botEmotes(s.log, t1).length, 0);
  for (const b of s.bots) assert.equal(socialDebug(s.game, b.slot)?.hold ?? null, null);
});
