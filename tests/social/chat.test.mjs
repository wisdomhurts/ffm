// Typed chat: the kid-safe filter, rate limits, the network vet and the family bots answering (no browser).
// Run: node --test tests/social/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXT_CHAT } from '../../src/config.js';
import { Game } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { settings } from '../../src/core/settings.js';
import { BotController } from '../../src/ai/bot.js';
import { emptyIntent } from '../../src/gameplay/player.js';
import { EventCodec, isBotLine } from '../../src/net/protocol.js';
import { reactToSocial, typedIntent, callsBot } from '../../src/social/botReact.js';
import { REPLIES, TYPED_REPLIES } from '../../src/social/replies.js';
import {
  checkChat, cleanChat, isTypedLine, ChatLimiter, postTyped, sendTyped, typedChatAllowed, typedChatBlock, roomIsPrivate, CHAT_NOTES,
} from '../../src/social/chat.js';

const why = (s) => checkChat(s).why;

test('friendly messages go through exactly as typed (tidied up)', () => {
  for (const s of ['hi', 'Hello everyone!', 'gg', 'race you to the end', 'I have 455 coins', 'is it ok if i go', 'Nice garden Esther 🌻',
    'lol that was funny', 'I love my dragon pet ❤️', "don't steal my plants!", 'I got 1,000,000 cash', 'my score is 12345', 'see you at 5:30',
    'Scunthorpe and Essex', 'Killian is here', 'Hi! I am Zoë', 'how do i get the rainbow seed', 'the class was great', 'Привет друг']) {
    const r = checkChat(s);
    assert.ok(r.ok, `"${s}" should pass (${r.why})`);
    assert.ok(isTypedLine(r.text), `"${r.text}" passes again unchanged`);
  }
  assert.equal(cleanChat('  hello\n\n  there  '), 'hello there');
  assert.equal(cleanChat('<b>hi</b>'), 'bhi/b', 'markup characters are dropped');
  assert.equal(cleanChat('he​llo‮'), 'hello', 'invisible and direction marks are dropped');
  assert.ok([...cleanChat('z̷̢̛̛a̵̡l̴̢g̶o̸̢̢̢')].length <= 5 * 3, 'no piles of accent marks');
  assert.equal([...cleanChat('x'.repeat(200))].length, TEXT_CHAT.maxLen, 'cut to the maximum length');
});

test('bad and unkind words are refused, also when disguised', () => {
  for (const s of ['fuck', 'f u c k', 'f.u.c.k', 'sh!t', 'a$$', 'fuuuuck you', 'f😀ck', 'b1tch', 'ｆｕｃｋ', '𝐟𝐮𝐜𝐤', 'fυck', 'f​uck',
    'k i l l', 'kill you', 'you are stupid', 'shut up', 'loser', 'ur so dumb', 'idiot', 'wtf', 'go die', 'sexy']) {
    assert.equal(why(s), 'words', `"${s}" is refused`);
  }
});

test('links, emails, @names, phone numbers and long digit runs are refused', () => {
  for (const s of ['www.google.com', 'go to google.com', 'google dot com', 'discord.gg/abc', 'http://x', 'site(dot)net']) assert.equal(why(s), 'link', s);
  for (const s of ['email me at kid@gmail.com', 'kid (at) gmail', 'follow @kid123']) assert.equal(why(s), 'email', s);
  for (const s of ['call 555 123 4567', 'my number is 5551234', 'five five five one two three four', '555-123-4567', '(555) 123-4567', '1234567890']) {
    assert.equal(why(s), 'number', s);
  }
  assert.ok(checkChat('my score is 123456').ok, `up to ${TEXT_CHAT.maxDigits} digits in a row are fine`);
  for (const k of ['words', 'link', 'email', 'number', 'slow', 'off', 'public']) assert.ok(CHAT_NOTES[k], 'a friendly note for ' + k);
});

test('rate limit: a burst, then one message per gap', () => {
  const lim = new ChatLimiter(TEXT_CHAT.burst, TEXT_CHAT.gap);
  let t = 100;
  for (let i = 0; i < TEXT_CHAT.burst; i++) assert.ok(lim.allow('a', t), 'burst ' + i);
  assert.ok(!lim.allow('a', t), 'over the burst');
  assert.ok(lim.allow('b', t), 'someone else is not affected');
  assert.ok(lim.wait('a', t) > 0);
  t += TEXT_CHAT.gap * 0.5;
  assert.ok(!lim.allow('a', t), 'not yet');
  t += TEXT_CHAT.gap * 0.55;
  assert.ok(lim.allow('a', t), 'after the gap');
  assert.ok(!lim.allow('a', t));
});

test('who may type where: solo, private rooms, public rooms (parents), off', () => {
  const s = { chatOn: true, chatPublic: false };
  const priv = { room: { private: true, faceOk: true } };
  const pub = { room: { private: false, faceOk: false } };
  const liar = { room: { private: true, faceOk: false } }; // joined from the public list, the host claims "private"
  assert.ok(typedChatAllowed(null, s) && typedChatAllowed({ room: null }, s), 'solo');
  assert.ok(typedChatAllowed(priv, s) && roomIsPrivate(priv.room), 'private room');
  assert.ok(!typedChatAllowed(pub, s) && typedChatBlock(pub, s) === 'public', 'public room: quick chat only');
  assert.ok(!typedChatAllowed(liar, s) && !roomIsPrivate(liar.room), 'a room we only know from the public list counts as public');
  assert.ok(typedChatAllowed(pub, { chatOn: true, chatPublic: true }), 'a parent allowed typing in public rooms');
  assert.ok(!typedChatAllowed(priv, { chatOn: false, chatPublic: true }) && typedChatBlock(null, { chatOn: false }) === 'off', 'chat off = no typing anywhere');
});

test('postTyped / sendTyped: filter, settings and rate limits before anything is said', () => {
  bus.clear();
  const game = new Game({ humanId: 'maddie', seed: 3 });
  const said = [];
  bus.on('chat', (e) => said.push(e));
  const me = game.human;
  assert.ok(postTyped(game, me, 'hello family', 0));
  assert.deepEqual(said.map((e) => [e.player, e.text, e.typed]), [[me, 'hello family', true]]);
  assert.ok(!postTyped(game, me, 'you are stupid', 0), 'dirty: dropped');
  assert.ok(!postTyped(game, me, '  hello  ', 0), 'not what the filter would send: dropped');
  assert.ok(!postTyped(game, me, 'x'.repeat(TEXT_CHAT.maxLen + 1), 0), 'too long: dropped');
  assert.ok(!postTyped(game, game.players.find((p) => p.kind === 'bot'), 'hi', 0), 'bots never "type"');
  let n = 0;
  for (let i = 0; i < 10; i++) n += postTyped(game, me, 'spam ' + i, 1) ? 1 : 0;
  assert.equal(n, TEXT_CHAT.burst + TEXT_CHAT.hostSlack - 1, 'the game rate limits each player');
  // the sender's side
  const acts = [];
  const app = { online: null, act: (name, text) => acts.push([name, text]) };
  const keep = { ...settings };
  try {
    settings.chatOn = true;
    assert.equal(sendTyped(app, '  nice   one ', 500).ok, true);
    assert.deepEqual(acts, [['chat', 'nice one']], 'what goes out is the cleaned line');
    assert.equal(sendTyped(app, 'call me 5551234567', 600).why, 'number');
    for (let i = 0; i < 6; i++) sendTyped(app, 'hey ' + i, 700);
    assert.equal(sendTyped(app, 'one more', 700).why, 'slow', 'the sender waits too');
    app.online = { room: { private: false, faceOk: false } };
    settings.chatPublic = false;
    assert.equal(sendTyped(app, 'hi', 900).why, 'public', 'no typing in a public room without a parent saying so');
    settings.chatOn = false;
    app.online = null;
    assert.equal(sendTyped(app, 'hi', 950).why, 'off');
    assert.equal(acts.length, 1 + TEXT_CHAT.burst, 'nothing else was sent (the first line, then one burst)');
  } finally {
    Object.assign(settings, keep);
  }
});

test('the network vet takes clean typed lines only where typed chat is allowed', () => {
  const game = new Game({ humanId: 'maddie', seed: 4 });
  const human = game.human;
  const bot = game.players.find((p) => p.kind === 'bot');
  const ev = (o) => ({ player: human, ...o });
  const ok = { typed: true };
  assert.ok(EventCodec.vet('chat', ev({ text: 'see you at the fountain', typed: true }), ok), 'clean typed line, typed chat allowed here');
  assert.equal(EventCodec.vet('chat', ev({ text: 'see you at the fountain', typed: true })), null, 'default: no typed chat');
  assert.equal(EventCodec.vet('chat', ev({ text: 'see you at the fountain', typed: true }), { typed: false }), null, 'public room without chatPublic: dropped');
  assert.equal(EventCodec.vet('chat', ev({ text: 'you are stupid', typed: true }), ok), null, 'dirty: dropped');
  assert.equal(EventCodec.vet('chat', ev({ text: 'call 555 123 4567', typed: true }), ok), null, 'phone number: dropped');
  assert.equal(EventCodec.vet('chat', ev({ text: 'hi  there', typed: true }), ok), null, 'not exactly what the filter sends: dropped');
  assert.equal(EventCodec.vet('chat', ev({ text: 'a'.repeat(TEXT_CHAT.maxLen + 1), typed: true }), ok), null, 'too long: dropped');
  assert.equal(EventCodec.vet('chat', { player: bot, text: 'hi', typed: true }, ok), null, 'a bot does not type');
  assert.equal(EventCodec.vet('chat', ev({ text: 'hello there' }), ok), null, 'free text without the typed flag: dropped as before');
  const q = EventCodec.vet('chat', ev({ text: 'whatever', quick: true, phrase: 'gg', typed: true }), ok);
  assert.ok(q && q.text === 'GG!' && !('typed' in q), 'quick chat is still looked up locally');
  const b = EventCodec.vet('chat', { player: bot, text: 'Love you too, sweetie!', typed: 'x' }, ok);
  assert.ok(b && !('typed' in b), 'bot lines lose a stray typed flag');
  for (const t of Object.values(TYPED_REPLIES)) for (const lines of Object.values(t)) for (const l of lines) assert.ok(isBotLine(l.replaceAll('{name}', 'Zoë')), 'bot line passes: ' + l);
});

// A family game like main.js runs it: main.js hands every person's typed line to reactToSocial for each bot.
function family(seed) {
  bus.clear();
  const game = new Game({ humanId: 'maddie', seed, difficulty: 'normal' });
  const human = game.human;
  human.controller = { getIntent: () => emptyIntent() };
  for (const p of game.players) if (p !== human) p.controller = new BotController(p.char.personality, 'normal', { seed: seed * 7 + p.slot });
  const log = [];
  bus.on('chat', (e) => {
    log.push({ t: game.time, ...e });
    if (!e?.player || e.player.kind === 'bot' || (!e.quick && !e.typed)) return;
    for (const b of game.players) if (b.kind === 'bot') reactToSocial(game, b, { type: 'chat', ...e });
  });
  const run = (s) => {
    for (let t = 0; t < s; t += 1 / 30) game.update(1 / 30);
  };
  run(1);
  human.pos.x = 0;
  human.pos.z = 0;
  game.players.filter((p) => p !== human).forEach((b, i) => {
    b.pos.x = -6 + i * 6;
    b.pos.z = 8;
  });
  return { game, human, log, run, bots: game.players.filter((p) => p !== human) };
}

test('typed lines: what they are about, and who is called', () => {
  assert.equal(typedIntent('Hello everyone!'), 'hi');
  assert.equal(typedIntent('good game guys'), 'gg');
  assert.equal(typedIntent('tell me a joke dad'), 'joke');
  assert.equal(typedIntent('hahaha'), 'funny');
  assert.equal(typedIntent('I ❤️ this game'), 'love');
  assert.equal(typedIntent('how do I get more cash'), 'howto');
  assert.equal(typedIntent('who stole my sunflower'), 'steal');
  assert.equal(typedIntent('race me'), 'race');
  assert.equal(typedIntent('the weather is blue'), null);
  const g = new Game({ humanId: 'maddie', seed: 1 });
  const [dad, mom] = [g.players[0], g.players[1]];
  assert.ok(callsBot('hi dad', dad) && !callsBot('hi dad', mom) && callsBot('Mom, help!', mom) && callsBot('ESTHER', mom));
});

test('the family answers some typed lines in their own voices, rate limited', () => {
  let answered = 0;
  let called = 0;
  const all = (id) => Object.values(TYPED_REPLIES[id] || REPLIES[id]).flat();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = family(seed);
    postTyped(s.game, s.human, 'hi everyone', s.game.time);
    s.run(3);
    const replies = s.log.filter((x) => x.player.kind === 'bot' && !x.typed);
    if (replies.some((x) => all('hi').some((l) => l.replaceAll('{name}', s.human.name) === x.text))) answered++;
    // called by name about something it doesn't understand: that bot answers
    s.run(8);
    const t0 = s.game.time;
    postTyped(s.game, s.human, 'Micah what is up with the clouds', s.game.time + 10);
    s.run(3);
    const micah = s.game.players.find((p) => p.id === 'micah');
    if (s.log.some((x) => x.t >= t0 && x.player === micah && all('huh').includes(x.text))) called++;
  }
  assert.ok(answered >= 4, `a typed hello gets a hello back most of the time (${answered}/6)`);
  assert.ok(called >= 5, `a bot called by name answers (${called}/6)`);
  // a stream of typed lines doesn't get a stream of answers
  const s = family(9);
  for (let i = 0; i < 6; i++) {
    postTyped(s.game, s.human, ['lol', 'nice', 'wow', 'race me', 'gg', 'hi'][i], 1000 + i * 2);
    s.run(1);
  }
  s.run(3);
  const n = s.log.filter((x) => x.player.kind === 'bot').length;
  assert.ok(n >= 1 && n <= 4, `rate limited answers (${n} for 6 lines)`);
});
