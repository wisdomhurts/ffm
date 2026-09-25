// Family bots react to people's emotes and quick chat. OWNER: social agent (docs/ONLINE.md).
//
// reactToSocial(game, bot, event) is called (by main.js, on the host / offline only) for every bot when
// a person emotes ({type:'emote', player, id}) or says a quick-chat phrase ({type:'chat', player, text,
// quick:true, phrase}). The first call for an event plans the reactions of all bots at once, so they
// take turns instead of all answering together; each call then hands that bot its part.
// Reactions play out over the next seconds through socialIntent(): a bot that waves back or dances
// along stops for a moment and turns to face the person; replies are ordinary 'chat' events.
// Cooldowns and a spam guard keep it charming rather than noisy. All randomness uses game.rng.
//
// Bot hook: socialIntent(game, p, dt, controller) returns an Intent while the bot is busy reacting
// (standing still, facing someone, emoting) and null otherwise. reactToSocial installs it on the
// bot's controller by wrapping getIntent once; ai/bot.js may call it itself instead (see hook()).
import { bus } from '../core/events.js';
import { emptyIntent } from '../gameplay/player.js';
import { getBoard } from '../ai/blackboard.js';
import { EMOTE, DANCES } from './catalog.js';
import { REPLIES, EMOTE_LINES, SIGNATURE_DANCE } from './replies.js';

export const REACT = {
  emoteRange: 25, // studs: bots this close notice an emote
  chatRange: 45, // quick chat carries further
  emoteCooldown: 9, // seconds between two emote reactions of one bot
  chatCooldown: 7, // seconds between two replies of one bot
  gap: 1.6, // seconds between any two social replies (all bots together)
  spamWindow: 15, // more than spamCount emotes/phrases from one person in this window = spam
  spamCount: 4,
  holdMax: 4, // longest a bot stands still for someone (seconds)
  leaveRange: 32, // a dancing bot stops when its partner wanders further than this
};

const TURN = 0.3; // seconds a reacting bot spends stopping and turning before it emotes
// goals a bot never interrupts to be social
const BUSY = new Set(['return', 'steal', 'practice', 'defend', 'mug', 'lurk']);
// phrases a bot may answer from anywhere on the map (everyone sees the chat log)
const FAR_OK = new Set(['hi', 'bye', 'gg']);
// phrases that only make sense as an answer to something: replied to less often
const SHY = new Set(['yes', 'no']);

const states = new WeakMap(); // game -> social state

function stateOf(game) {
  let s = states.get(game);
  if (!s) {
    s = { bots: new Map(), lastKey: null, plan: null, nextSayAt: -99, heard: new Map(), spamAt: new Map() };
    states.set(game, s);
  }
  return s;
}

function botState(s, slot) {
  let b = s.bots.get(slot);
  if (!b) {
    b = { emoteAt: -99, chatAt: -99, hold: null, queue: [], it: null };
    s.bots.set(slot, b);
  }
  return b;
}

const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function gardenUnderAttack(game, p) {
  if (game.gardens[p.slot]?.planters.some((pl) => pl.stealer != null)) return true;
  return game.players.some((q) => q.carrying?.kind === 'plant' && q.carrying.fromSlot === p.slot);
}

/** Free to stop and emote right now (not carrying, stunned, busy with a steal/chase, or guarding). */
function canEmote(game, p, ctrl) {
  const now = game.time;
  if (p.carrying || now < p.stunUntil || p.interact?.t > 0) return false;
  if (BUSY.has(ctrl?.goal?.type) || ctrl?.threat || ctrl?.practiceCarry) return false;
  return !gardenUnderAttack(game, p);
}

function pickLine(game, table, bot, who) {
  const lines = table?.[bot.id] || table?.dorian;
  if (!lines?.length) return null;
  return game.rng.pick(lines).replaceAll('{name}', who.name || 'friend');
}

/**
 * Called for each bot when a person emotes or uses quick chat. Safe to call with any event: bots,
 * free-typed chat and unknown ids are ignored.
 */
export function reactToSocial(game, bot, e) {
  if (!game || !bot || bot.kind !== 'bot' || !e?.player || e.player.kind === 'bot' || e.player === bot) return;
  if (e.type === 'chat' && !e.quick) return;
  const s = stateOf(game);
  const key = `${e.type}|${e.player.slot}|${e.id || e.phrase || ''}|${game.time}`;
  if (s.lastKey !== key) {
    s.lastKey = key;
    s.plan = plan(game, s, e);
  }
  const items = s.plan.get(bot.slot);
  if (!items) return;
  s.plan.delete(bot.slot);
  hook(bot.controller);
  botState(s, bot.slot).queue.push(...items);
}

function plan(game, s, e) {
  const out = new Map();
  const now = game.time;
  const rng = game.rng;
  const who = e.player;
  const add = (b, item) => {
    if (!out.has(b.slot)) out.set(b.slot, []);
    out.get(b.slot).push(item);
  };
  // a reply line: respects the per-bot cooldown and the shared gap, and reserves its moment
  const say = (b, table, delay, chance = 1) => {
    const bs = botState(s, b.slot);
    if (now - bs.chatAt < REACT.chatCooldown || !rng.chance(chance)) return false;
    const text = pickLine(game, table, b, who);
    if (!text) return false;
    const at = Math.max(now + delay, s.nextSayAt);
    s.nextSayAt = at + REACT.gap;
    bs.chatAt = at;
    add(b, { at, kind: 'say', text });
    return true;
  };
  const emote = (b, id, delay, hold) => {
    const bs = botState(s, b.slot);
    bs.emoteAt = now + delay;
    add(b, { at: now + delay, kind: 'emote', id, face: who.slot, hold: Math.min(REACT.holdMax, hold) });
  };

  // spam guard: lots of the same from one person gets one "I heard you!" now and then, then silence
  const hist = (s.heard.get(who.slot) || []).filter((t) => now - t < REACT.spamWindow);
  hist.push(now);
  s.heard.set(who.slot, hist);
  const bots = game.players.filter((b) => b.kind === 'bot' && b.controller && typeof b.controller.getIntent === 'function');
  const range = e.type === 'chat' ? REACT.chatRange : REACT.emoteRange;
  const near = bots.map((b) => ({ b, d: dist(b, who) })).filter((x) => x.d <= range).sort((x, y) => x.d - y.d).map((x) => x.b);
  const talkers = near.filter((b) => b.controller.goal?.type !== 'practice');
  if (hist.length > REACT.spamCount) {
    if (talkers.length && now - (s.spamAt.get(who.slot) ?? -99) > 30) {
      s.spamAt.set(who.slot, now);
      say(talkers[0], EMOTE_LINES.spam, 0.8);
    }
    return out;
  }
  const free = near.filter((b) => canEmote(game, b, b.controller) && now - botState(s, b.slot).emoteAt >= REACT.emoteCooldown && !botState(s, b.slot).hold);

  if (e.type === 'emote') {
    const id = e.id;
    if (!EMOTE[id]) return out;
    if (id === 'wave' || id === 'cheer') {
      free.slice(0, 2).forEach((b, i) => {
        if (!rng.chance(i ? 0.35 : 0.8)) return;
        const delay = rng.range(0.35, 0.9) + i * 0.55;
        emote(b, id, delay, EMOTE[id].dur + 0.3);
        if (i === 0) say(b, EMOTE_LINES[id], delay + 0.3, 0.55);
      });
    } else if (id === 'laugh') {
      const b = free[0];
      if (b && rng.chance(0.6)) {
        const delay = rng.range(0.3, 0.8);
        emote(b, 'laugh', delay, EMOTE.laugh.dur + 0.2);
        say(b, EMOTE_LINES.laugh, delay + 0.4, 0.35);
      }
    } else if (id === 'point') {
      // the bot being pointed at (in front of the person, within ~25 degrees) answers
      const fx = Math.sin(who.yaw), fz = Math.cos(who.yaw);
      let target = null;
      let best = Math.cos((25 * Math.PI) / 180);
      for (const b of near) {
        const d = dist(b, who) || 1;
        const c = ((b.pos.x - who.pos.x) * fx + (b.pos.z - who.pos.z) * fz) / d;
        if (c > best) {
          best = c;
          target = b;
        }
      }
      if (target && rng.chance(0.85)) {
        const delay = rng.range(0.4, 0.9);
        say(target, EMOTE_LINES.point, delay);
        if (free.includes(target)) emote(target, rng.chance(0.5) ? 'point' : 'laugh', delay, 2);
      }
    } else if (DANCES.includes(id)) {
      free.slice(0, 2).forEach((b, i) => {
        if (!rng.chance(i ? 0.45 : 0.75)) return;
        const delay = rng.range(0.5, 1.1) + i * 0.6;
        emote(b, rng.chance(0.4) ? id : SIGNATURE_DANCE[b.id] || 'dance1', delay, REACT.holdMax);
        if (i === 0) say(b, EMOTE_LINES.dance, delay + 0.5, 0.45);
      });
    } else if (id === 'sit') {
      const b = talkers[0];
      if (b && rng.chance(0.4)) {
        const delay = rng.range(0.6, 1.2);
        say(b, EMOTE_LINES.sit, delay);
        if (free.includes(b) && rng.chance(0.4)) emote(b, 'sit', delay, REACT.holdMax);
      }
    }
    return out;
  }

  // quick chat
  const id = e.phrase;
  const table = REPLIES[id];
  if (!table) return out;
  let order = talkers;
  if (!order.length && FAR_OK.has(id)) {
    const any = bots.filter((b) => b.controller.goal?.type !== 'practice');
    if (any.length && rng.chance(0.6)) order = [rng.pick(any)];
  }
  const first = order[0];
  if (!first) return out;
  const delay = rng.range(0.7, 1.3);
  if (!say(first, table, delay, SHY.has(id) ? 0.4 : 0.92)) return out;
  // a gesture to go with some replies, when the bot is close enough to be seen
  const gesture = { hi: 'wave', bye: 'wave', gg: 'cheer', oops: 'laugh', nicesteal: 'laugh', wow: 'cheer' }[id];
  if (gesture && free.includes(first) && dist(first, who) <= REACT.emoteRange && rng.chance(0.6)) {
    emote(first, gesture, delay - 0.2, EMOTE[gesture].dur + 0.3);
  }
  // greetings and GGs get a second voice now and then
  const second = order[1];
  if (second && (id === 'gg' || id === 'hi' || id === 'bye') && rng.chance(0.35)) say(second, table, delay + 1.4);
  return out;
}

/**
 * Per-tick bot hook: plays out scheduled reactions. Returns the bot's Intent for this tick while it is
 * standing still for someone (the brain is skipped for that moment), or null to let the bot think.
 */
export function socialIntent(game, p, dt, ctrl) {
  const s = states.get(game);
  const b = s?.bots.get(p.slot);
  if (!b || (!b.queue.length && !b.hold)) return null;
  const now = game.time;
  let emote = null;
  for (let i = 0; i < b.queue.length;) {
    const q = b.queue[i];
    if (q.at > now) {
      i++;
      continue;
    }
    b.queue.splice(i, 1);
    if (q.kind === 'say') speak(game, p, q.text);
    else if (q.kind === 'emote' && canEmote(game, p, ctrl)) {
      // stop and turn first, then the gesture (an emote only plays standing still)
      b.hold = { until: now + TURN + q.hold, face: q.face, emote: q.id, emoteAt: now + TURN };
    }
  }
  const h = b.hold;
  if (!h) return null;
  const f = game.players[h.face];
  if (now >= h.until || !canEmote(game, p, ctrl) || !f || dist(p, f) > REACT.leaveRange) {
    b.hold = null;
    ctrl?.motor?._resetStuck?.(); // the pause must not read as "stuck" once it walks on
    return null;
  }
  if (h.emote && now >= h.emoteAt) {
    emote = h.emote;
    h.emote = null;
  }
  const it = b.it || (b.it = emptyIntent());
  it.moveX = it.moveZ = 0;
  it.jump = it.interact = it.bonk = false;
  it.useItem = it.selectSlot = it.say = null;
  it.emote = emote;
  // turn to face them (smoothly)
  const want = Math.atan2(f.pos.x - p.pos.x, f.pos.z - p.pos.z);
  it.aimYaw = p.yaw + wrap(want - p.yaw) * Math.min(1, (dt || 1 / 60) * 7);
  return it;
}

function speak(game, p, text) {
  bus.emit('chat', { player: p, text });
  // the bots' own chatter waits a little after a reply (ai/blackboard.js rate limits)
  const board = getBoard(game);
  board.chatAt = game.time;
  board.chatBy.set(p.slot, game.time);
}

/** Wrap a bot controller's getIntent once so socialIntent runs first each tick. */
export function hook(ctrl) {
  if (!ctrl || ctrl.__social || typeof ctrl.getIntent !== 'function') return;
  const think = ctrl.getIntent;
  ctrl.getIntent = function (game, p, dt) {
    return socialIntent(game, p, dt, this) || think.call(this, game, p, dt);
  };
  ctrl.__social = true;
}

/** Debug/test view of a bot's pending social reactions. */
export function socialDebug(game, slot) {
  const b = states.get(game)?.bots.get(slot);
  return b ? { queue: b.queue.map((q) => ({ ...q })), hold: b.hold && { ...b.hold } } : null;
}
