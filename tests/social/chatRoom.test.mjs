// Typed chat and "no bots in public rooms" end to end through online rooms (in-memory transport, real
// sessions, hosts and clients). Run: node --test tests/social/*.test.mjs
// (settings is one object per process here, so every "device" shares chatOn / chatPublic / onlineBots.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StubApp, MemoryHub } from '../net/stub.mjs';
import { TEXT_CHAT } from '../../src/config.js';
import { bus } from '../../src/core/events.js';
import { settings } from '../../src/core/settings.js';
import { typedChatAllowed } from '../../src/social/chat.js';
import { reactToSocial } from '../../src/social/botReact.js';

function room() {
  const hub = new MemoryHub();
  const apps = [];
  const add = (name, base) => {
    const a = new StubApp(name, { hub, base });
    apps.push(a);
    return a;
  };
  const step = async (sec, dt = 1 / 30) => {
    for (let i = 0, n = Math.max(1, Math.round(sec / dt)); i < n; i++) {
      for (const a of apps) a.frame(dt);
      hub.advance(dt);
      await new Promise((r) => setImmediate(r));
    }
  };
  // typed lines from `from` as `a`'s own world shows them
  const heard = (a, from) => {
    const seen = [];
    bus.on('chat', (e) => {
      if (a.game && e.typed && e.player === a.game.players[from.online.mySlot] && e.player === a.game.players[e.player.slot]) seen.push(e.text);
    });
    return seen;
  };
  const done = () => apps.forEach((a) => a.online.leave());
  return { hub, add, step, heard, done };
}

const keep = { ...settings };
const restore = () => Object.assign(settings, keep);

test('private room: typed chat goes through, filtered and rate limited by the host; bots answer; mute works', async () => {
  bus.clear();
  Object.assign(settings, { chatOn: true, chatPublic: false, onlineBots: 3 });
  const r = room();
  try {
    const H = r.add('Hana', 'dorian');
    const J = r.add('Jo', 'esther');
    const K = r.add('Kit', 'maddie');
    // the host's bots answer people (main.js does this on the host)
    bus.on('chat', (e) => {
      const g = H.game;
      if (!g || !e?.player || e.player !== g.players[e.player.slot] || e.player.kind === 'bot' || (!e.quick && !e.typed)) return;
      for (const b of g.players) if (b.kind === 'bot') reactToSocial(g, b, { type: 'chat', ...e });
    });
    const code = await H.online.createRoom({ private: true });
    assert.ok(await J.online.joinRoom(code, { typed: true }) && await K.online.joinRoom(code, { typed: true }), 'friends typed the code');
    r.hub.latency = 0.04;
    await r.step(1);
    assert.equal(H.game.players.map((p) => p.kind).join(), 'local,remote,remote,bot', 'a private room keeps its computer player');
    assert.ok(typedChatAllowed(J.online) && typedChatAllowed(H.online), 'typed chat is on in a private room');

    const atH = r.heard(H, J), atK = r.heard(K, J), atJ = r.heard(J, J);
    J.act('chat', 'hello from Jo!');
    await r.step(0.8);
    assert.deepEqual([atH, atK, atJ].map((l) => l.join('|')), ['hello from Jo!', 'hello from Jo!', 'hello from Jo!'], 'host, friend and sender see it');

    // a tampered client sends what the filter would refuse: the host drops it
    J.online.role.act('chat', ['you are stupid']);
    J.online.role.act('chat', ['call me 555 123 4567']);
    J.online.role.act('chat', ['x'.repeat(TEXT_CHAT.maxLen + 1)]);
    J.online.role.act('chat', ['  spaced   out  ']);
    await r.step(0.8);
    assert.equal(atK.length, 1, 'dirty, private or over-long lines never reach anyone: ' + atK.join('|'));
    assert.equal(atH.length, 1, '...not even the host');

    // a flood: the host lets a burst through, then one per gap
    await r.step(TEXT_CHAT.gap * (TEXT_CHAT.burst + 2));
    for (let i = 0; i < 9; i++) J.online.role.act('chat', ['line ' + i]);
    await r.step(0.8);
    const flood = atK.length - 1;
    assert.ok(flood >= 1 && flood <= TEXT_CHAT.burst + TEXT_CHAT.hostSlack, `host rate limit: ${flood} of 9 got through`);

    // a bot called by name answers (its line reaches the members' devices too; after the flood has been
    // forgotten: the bots ignore someone who keeps talking, botReact.js REACT.spamWindow)
    await r.step(16);
    const bot = H.game.players.find((p) => p.kind === 'bot');
    const botLines = [];
    bus.on('chat', (e) => {
      if (K.game && e.player === K.game.players[bot.slot] && !e.typed) botLines.push(e.text);
    });
    J.act('chat', `hi ${bot.name}!`);
    await r.step(3.5);
    assert.ok(botLines.length >= 1, `${bot.name} answered on Kit's device: ${botLines.join(' | ')}`);

    // Kit mutes Jo: Jo's typed lines stop reaching Kit's screen (the host still has them)
    await r.step(2);
    K.online.mute(J.online.pid);
    await r.step(0.5);
    const n = atK.length, nh = atH.length;
    J.act('chat', 'can you see me?');
    await r.step(0.8);
    assert.ok(atK.length === n && atH.length === nh + 1, `muted on Kit's device only (Kit ${atK.length - n}, host ${atH.length - nh})`);

    // typed chat switched off on this "device": receivers drop typed lines (quick chat stays)
    K.online.mute(J.online.pid, false);
    settings.chatOn = false;
    const quick = [];
    bus.on('chat', (e) => K.game && e.quick && e.player === K.game.players[J.online.mySlot] && quick.push(e.text));
    const m = atK.length;
    J.act('chat', 'anyone there?');
    J.act('say', 'gg');
    await r.step(0.8);
    assert.ok(atK.length === m && quick.length === 1, 'chat off: no typed lines, quick chat still arrives');
  } finally {
    r.done();
    restore();
  }
});

test('public rooms: people only (no bots), and typed chat only for devices whose parents allowed it', async () => {
  bus.clear();
  Object.assign(settings, { chatOn: true, chatPublic: false, onlineBots: 3 });
  const r = room();
  try {
    const P = r.add('Pia', 'dorian');
    const Q = r.add('Quinn', 'esther');
    const R = r.add('Remy', 'maddie');
    const code = await P.online.createRoom({ private: false });
    assert.equal(P.game.players.map((p) => p.kind).join(), 'local,empty,empty,empty', 'no computer players in a public room, whatever Settings says');
    assert.equal(P.game.maxBots, 0);
    assert.ok(await Q.online.joinRoom(code) && await R.online.joinRoom(code, { typed: true }), 'joined');
    r.hub.latency = 0.04;
    await r.step(1);
    assert.ok(!P.online.setBots(2), 'the host cannot add computer players to a public room');
    await r.step(0.5);
    assert.equal(P.game.players.map((p) => p.kind).join(), 'local,remote,remote,empty', 'still people only: ' + P.game.players.map((p) => p.kind));
    assert.ok(!R.game.players.some((p) => p.kind === 'bot'), 'members see no bots either');
    assert.ok(!typedChatAllowed(P.online) && !typedChatAllowed(Q.online) && !typedChatAllowed(R.online), 'typing is off here (chatPublic off)');
    assert.ok(R.online.room.private === false && !R.online.room.faceOk, 'even a typed code of a public room counts as public');

    // a sender whose parents allowed it types (the act path itself does not ask): devices without it drop the line
    const atR = r.heard(R, Q);
    const quick = [];
    bus.on('chat', (e) => R.game && e.quick && e.player === R.game.players[Q.online.mySlot] && quick.push(e.text));
    Q.act('chat', 'hello public room');
    Q.act('say', 'hi');
    await r.step(0.8);
    assert.equal(atR.length, 0, 'dropped on a device without chatPublic');
    assert.deepEqual(quick, ['Hi!'], 'quick chat works in public rooms');
    // a parent turns typed chat on for public rooms
    settings.chatPublic = true;
    await r.step(TEXT_CHAT.gap * 2);
    Q.act('chat', 'hello again');
    await r.step(0.8);
    assert.deepEqual(atR, ['hello again'], 'shown where chatPublic is on');

    // host migration keeps the room people-only
    P.online.leave();
    await r.step(3);
    const host = [Q, R].find((a) => a.online.isHost);
    assert.ok(host, 'someone took over');
    assert.ok(!host.game.players.some((p) => p.kind === 'bot') && host.game.maxBots === 0, 'the new host adds no bots: ' + host.game.players.map((p) => p.kind));
  } finally {
    r.done();
    restore();
  }
});

test('Quick Play opens a people-only room', async () => {
  bus.clear();
  Object.assign(settings, { onlineBots: 3 });
  const r = room();
  try {
    const A = r.add('Ava', 'micah');
    assert.ok(await A.online.quickPlay(), 'quick play made a room');
    assert.ok(A.online.isHost && A.online.room.private === false);
    assert.ok(!A.game.players.some((p) => p.kind === 'bot') && A.game.maxBots === 0, 'no computer players: ' + A.game.players.map((p) => p.kind));
  } finally {
    r.done();
    restore();
  }
});
