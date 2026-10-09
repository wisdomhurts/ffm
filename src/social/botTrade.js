// The family bots as trade partners: offline, and in private rooms (the host runs them; public rooms have
// no bots). OWNER: trading (docs/DESIGN.md "Trading").
//   createBotTrader(api) -> {update(t), onChat(e), gifted(bot, from), done(session), forget()}   social/trades.js only
//
// What a bot does:
// * Asked to trade: after a moment it says yes or no. Busy bots (carrying something, stunned, defending,
//   stealing, answering a Help! call, fighting Big Chomp) say no; Micah usually does (he'd rather steal).
// * Hears "Trade?" (quick chat, or a typed line about trading): the closest free bot asks back (an invite),
//   or one further away says to come closer. It won't ask the same person again for a while.
// * In a trade it stands still facing you and weighs both sides, once per change:
//   value(what it gets) >= want x value(what it gives) -> Ready (Esther 0.8, Dorian 1.0, Mati 1.2, Micah 1.5),
//   otherwise it asks for a little more. You offer something and haven't asked for anything yet: it proposes
//   one of its own things (or some cash) worth about as much, never the same thing again soon after.
// * Nothing happens for a while: it says bye and walks on. Its garden needs it (someone at one of its planters, one
//   of its plants being carried off): it says bye and runs to defend it (a deal counting down finishes first).
// Values: a plant is worth what selling it pays (plantIncome x SELL_SECONDS; seedlings and seeds a little
// less), a pet what it costs on average to hatch (egg price / its odds), cash is cash.
// Bots only ever hold their egg-drop team (player.pets, 3 at most); a pet given to a bot stays with it.
import { bus } from '../core/events.js';
import { MUTATIONS } from '../config.js';
import { EGGS, PET, PETS } from '../pets/catalog.js';
import { petLabel } from '../pets/names.js';
import { SELL_SECONDS } from '../gameplay/game.js';
import { emptyIntent } from '../gameplay/player.js';
import { getBoard } from '../ai/blackboard.js';
import { makeRng } from '../core/rng.js';
import { REPLIES } from './replies.js';
import { typedIntent, callsBot } from './botReact.js';

export const BOT_TRADE = {
  want: { esther: 0.8, dorian: 1, maddie: 1.2, micah: 1.5 }, // yes when value(get) >= want x value(give)
  yes: { esther: 1, dorian: 0.9, maddie: 0.85, micah: 0.3 }, // chance to say yes to a trade (Micah: usually no)
  think: [0.8, 1.5], // seconds before a bot answers, or reacts to a change in the offers
  lineGap: 3, // seconds between two trade lines from one bot...
  answerGap: 1.5, // ...but its answer to a change in a trade comes quicker
  idle: 45, // an open trade where nothing changes this long: the bot says bye and walks on
  askBack: 25, // seconds before a bot asks the same person to trade again
  repropose: 30, // seconds before a bot proposes the same thing again
  callRange: 45, // "Trade?" from further than requestRange: the closest bot within this says "come over"
  seedling: 0.85, // a growing plant or a seed is worth this much of a grown one
  cashShare: 0.5, // a bot proposes at most this share of its cash
};

// goals a bot doesn't drop for a trade (ai/goals.js)
const BUSY = new Set(['return', 'steal', 'practice', 'defend', 'mug', 'lurk', 'help', 'boss']);
const isPerson = (p) => !!p && (p.kind === 'local' || p.kind === 'remote');
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const empty = (o) => !o.planters.length && !o.cash && !o.pets.length && !o.seed;
const want = (bot) => BOT_TRADE.want[bot.id] ?? 1;

// ------------------------------------------------------------------ values

let PET_VALUE = null;
/** What a pet is worth in cash: the average cost of hatching it from the cheapest egg that has it (egg-drop-only
 *  pets: the middle value of the shop pets of the same rarity). */
export function petValue(id) {
  if (!PET_VALUE) {
    PET_VALUE = Object.create(null);
    for (const e of EGGS) {
      if (!e.shop || !(e.price > 0)) continue;
      const total = e.odds.reduce((s, [pid, w]) => s + (PET[pid] && w > 0 ? w : 0), 0);
      for (const [pid, w] of e.odds) if (PET[pid] && w > 0) PET_VALUE[pid] = Math.min(PET_VALUE[pid] ?? Infinity, (e.price * total) / w);
    }
    const byRarity = {};
    for (const pid in PET_VALUE) (byRarity[PET[pid].rarity] ||= []).push(PET_VALUE[pid]);
    for (const p of PETS) {
      if (PET_VALUE[p.id] != null) continue;
      const list = (byRarity[p.rarity] || [1000]).slice().sort((a, b) => a - b);
      PET_VALUE[p.id] = list[list.length >> 1];
    }
  }
  return PET_VALUE[id] ?? 0;
}

const plantValue = (game, valuer, plant) => (MUTATIONS[plant.mutation] ? game.plantIncome(plant, valuer) * SELL_SECONDS : 0);

/** What one side of a trade (`o`, offered by `owner`) is worth to `valuer`. */
export function offerValue(game, valuer, o, owner) {
  let v = Math.max(0, o.cash || 0);
  const g = game.gardens[owner.slot];
  for (const d of o.plants) {
    const live = g?.planters[d.index]?.plant;
    v += plantValue(game, valuer, live && live.uid === d.uid ? live : d) * (d.grown === false ? BOT_TRADE.seedling : 1);
  }
  if (o.seed) v += plantValue(game, valuer, o.seed) * BOT_TRADE.seedling;
  for (const x of o.pets) v += petValue(x.id);
  return v;
}

/** A bot that should not stop for a trade right now. */
export function botBusy(game, bot) {
  const ctrl = bot.controller;
  if (bot.carrying || game.time < bot.stunUntil || BUSY.has(ctrl?.goal?.type) || ctrl?.practiceCarry) return true;
  if (game.gardens[bot.slot]?.planters.some((pl) => pl.stealer != null)) return true;
  return game.players.some((q) => q.carrying?.kind === 'plant' && q.carrying.fromSlot === bot.slot);
}

// ------------------------------------------------------------------ standing still while trading

const holds = new WeakMap(); // game -> Map(bot slot -> trade partner)
const IDLE = emptyIntent();

/** Who this bot is trading with right now (it stands still facing them), or null. */
export function tradePartner(game, p) {
  return holds.get(game)?.get(p.slot) || null;
}

// wrap a bot controller's getIntent once: while trading it stands still and turns to its partner
function hookHold(ctrl) {
  if (!ctrl || ctrl.__tradeHold || typeof ctrl.getIntent !== 'function') return;
  const think = ctrl.getIntent;
  ctrl.getIntent = function (game, p, dt) {
    const f = tradePartner(game, p);
    if (!f) {
      if (this.__tradeHeld) {
        this.__tradeHeld = false;
        this.motor?._resetStuck?.(); // the pause must not read as "stuck" once it walks on
      }
      return think.call(this, game, p, dt);
    }
    this.__tradeHeld = true;
    const it = this.__tradeIt || (this.__tradeIt = emptyIntent());
    Object.assign(it, IDLE);
    it.aimYaw = p.yaw + wrap(Math.atan2(f.pos.x - p.pos.x, f.pos.z - p.pos.z) - p.yaw) * Math.min(1, (dt || 1 / 60) * 7);
    return it;
  };
  ctrl.__tradeHold = true;
}

// ------------------------------------------------------------------ the trader

export function createBotTrader(api) {
  const C = { ...api.C, ...BOT_TRADE };
  let st = null; // per game: {game, rng, bots: Map(slot -> {lineAt, askAt: Map, proposed: Map}), pending: [], seen: WeakMap}

  function state() {
    const game = api.game;
    if (!game) return null;
    if (st?.game !== game) st = { game, rng: makeRng(0x7ad3), bots: new Map(), pending: [], seen: new WeakMap() };
    return st;
  }
  function botState(bot) {
    let b = st.bots.get(bot.slot);
    if (!b) st.bots.set(bot.slot, (b = { lineAt: -99, askAt: new Map(), proposed: new Map() }));
    return b;
  }
  const think = () => st.rng.range(C.think[0], C.think[1]);

  /** A trade line in the bot's voice (REPLIES[key]): a normal bot chat line everyone sees. */
  function line(bot, key, who, thing = '', gap = C.lineGap) {
    const game = st.game;
    const b = botState(bot);
    const table = REPLIES[key];
    const lines = table?.[bot.id] || table?.dorian;
    if (!lines?.length || game.time - b.lineAt < gap) return false;
    b.lineAt = game.time;
    const text = st.rng.pick(lines).replaceAll('{name}', who?.name || 'friend').replaceAll('{thing}', thing);
    bus.emit('chat', { player: bot, text });
    // the bots' own chatter waits a little after this (ai/blackboard.js rate limits)
    const board = getBoard(game);
    board.chatAt = game.time;
    board.chatBy.set(bot.slot, game.time);
    return true;
  }

  function answerInvite(inv, t) {
    const seen = st.seen.get(inv) || { at: t + think() };
    st.seen.set(inv, seen);
    if (t < seen.at || seen.done) return;
    seen.done = true;
    const bot = inv.to;
    if (botBusy(st.game, bot) || !st.rng.chance(C.yes[bot.id] ?? 0.8)) {
      api.decline(bot, inv.from);
      line(bot, 'tradeNo', inv.from);
    } else if (api.accept(bot, inv.from)) line(bot, 'tradeYes', inv.from);
  }

  // "Trade?" heard a moment ago: ask them back (or not)
  function askBack(q, t) {
    const { bot, to } = q;
    const b = botState(bot);
    if (!to.present || api.sessionOf(bot) || api.sessionOf(to) || t < (b.askAt.get(to.slot) ?? -99)) return;
    if (botBusy(st.game, bot) || !st.rng.chance(C.yes[bot.id] ?? 0.8)) {
      line(bot, 'tradeNo', to);
      return;
    }
    b.askAt.set(to.slot, t + C.askBack);
    if (api.request(bot, to)) line(bot, 'tradeYes', to);
  }

  /** Something of the bot's worth about what it gets (never what it proposed a moment ago), or some cash. */
  function proposal(bot, budget, t) {
    const game = st.game;
    const b = botState(bot);
    let best = null;
    const consider = (key, v, offer, thing) => {
      if (v > 0 && v <= budget && !((b.proposed.get(key) ?? -99) > t) && (!best || v > best.v)) best = { key, v, offer, thing };
    };
    for (const pl of game.gardens[bot.slot].planters) {
      const pt = pl.plant;
      if (!pt || pl.stealer != null) continue;
      const v = plantValue(game, bot, pt) * (pt.growLeft > 0 ? C.seedling : 1);
      consider('plant:' + pt.uid, v, { planters: [pl.index], uids: [pt.uid] }, game.plantName(pt.speciesId, pt.mutation));
    }
    bot.pets.forEach((id, k) => consider(`pet:${k}:${id}`, petValue(id), { pets: [{ uid: `b${k}:${id}` }] }, petLabel({ id, name: bot.petNames[k] })));
    if (!best && !((b.proposed.get('cash') ?? -99) > t)) {
      const v = Math.min(budget, Math.floor(bot.cash * C.cashShare));
      // a round amount: two significant digits
      const e = v >= 100 ? 10 ** (Math.floor(Math.log10(v)) - 1) : 1;
      const cash = Math.floor(v / e) * e;
      if (cash >= 1) best = { key: 'cash', v: cash, offer: { cash }, thing: '' };
    }
    if (best) b.proposed.set(best.key, t + C.repropose);
    return best;
  }

  // one look at an open trade per change (a revision of the session)
  function weigh(s, bot, t) {
    const seen = st.seen.get(s) || {};
    st.seen.set(s, seen);
    if (seen.rev !== s.rev) {
      seen.rev = s.rev;
      seen.changedAt = t;
      seen.at = Math.max(t + think(), s.lockUntil + 0.2);
      seen.done = false;
    }
    const side = api.sideOf(s, bot);
    const partner = side ? s.a : s.b;
    if (s.countdownEndsAt) return;
    if (t - seen.changedAt > C.idle) {
      line(bot, 'tradeBye', partner);
      api.cancel(bot);
      return;
    }
    if (seen.done || t < seen.at) return;
    seen.done = true;
    const give = s.offers[side], get = s.offers[1 - side];
    if (empty(give) && empty(get)) return;
    const game = st.game;
    const vGet = offerValue(game, bot, get, partner);
    let vGive = offerValue(game, bot, give, bot);
    // you're offering and haven't asked for anything: it proposes something in return
    if (empty(give) && !s.asked && vGet > 0) {
      const pick = proposal(bot, vGet / want(bot), t);
      if (pick && api.offer(bot, pick.offer) && !empty(s.offers[side])) {
        line(bot, pick.key === 'cash' ? 'tradeCash' : 'tradeOffer', partner, pick.thing, C.answerGap);
        return; // the change un-readies everyone: it looks again in a moment
      }
    }
    if (!api.room(s).ok) return; // the trade window says what's missing
    vGive = offerValue(game, bot, s.offers[side], bot);
    if (vGet >= want(bot) * vGive) {
      if (!s.ready[side] && api.ready(bot, true)) line(bot, vGive > 0 ? 'tradeYes' : 'tradeGift', partner, '', C.answerGap);
    } else line(bot, 'tradeUnfair', partner, '', C.answerGap);
  }

  return {
    update(t) {
      if (!state()) return;
      const game = st.game;
      for (const inv of [...api.invites()]) if (inv.to.kind === 'bot' && isPerson(inv.from)) answerInvite(inv, t);
      if (st.pending.length) {
        for (const q of [...st.pending]) {
          if (t < q.at) continue;
          st.pending.splice(st.pending.indexOf(q), 1);
          if (q.kind === 'say') line(q.bot, 'trade', q.to);
          else askBack(q, t);
        }
      }
      // trading bots stand still facing their partner
      let held = holds.get(game);
      for (const s of [...api.sessions()]) {
        const bot = s.a.kind === 'bot' ? s.a : s.b.kind === 'bot' ? s.b : null;
        if (!bot) continue;
        // ...unless their garden needs them (a thief at a planter, a plant being carried off): bye, and off they go
        // (a deal that is already counting down finishes first, in a moment)
        if (!s.countdownEndsAt && botBusy(game, bot)) {
          line(bot, 'tradeBye', bot === s.a ? s.b : s.a, '', 0);
          api.cancel(bot);
          continue;
        }
        if (!held) holds.set(game, (held = new Map()));
        held.set(bot.slot, bot === s.a ? s.b : s.a);
        hookHold(bot.controller);
        weigh(s, bot, t);
      }
      if (held) for (const slot of [...held.keys()]) if (!api.sessions().some((s) => s.a.slot === slot || s.b.slot === slot)) held.delete(slot);
    },

    /** A person said something in chat (quick or typed): "Trade?" gets an answer from a bot nearby. */
    onChat(e) {
      if (!state()) return;
      const game = st.game;
      const who = e.player;
      const wants = e.quick ? e.phrase === 'trade' : typedIntent(e.text) === 'trade';
      if (!wants || api.sessionOf(who)) return;
      const t = game.time;
      const bots = game.players.filter((b) => b.kind === 'bot');
      const called = e.typed ? bots.find((b) => callsBot(e.text, b)) || null : null;
      const near = bots.filter((b) => dist(b, who) <= C.requestRange).sort((a, b) => dist(a, who) - dist(b, who));
      const bot = called ? (near.includes(called) ? called : null) : near[0];
      if (bot) {
        if (!st.pending.some((q) => q.bot === bot)) st.pending.push({ at: t + think(), kind: 'ask', bot, to: who });
        return;
      }
      const far = called || bots.filter((b) => dist(b, who) <= C.callRange).sort((a, b) => dist(a, who) - dist(b, who))[0];
      if (far && !st.pending.some((q) => q.bot === far)) st.pending.push({ at: t + think(), kind: 'say', bot: far, to: who });
    },

    /** Someone gave this bot a plant (the Gift button). */
    gifted(bot, from) {
      if (state()) line(bot, 'tradeGift', from);
    },

    /** A trade went through: the bot's happy line. */
    done(s) {
      if (!state()) return;
      const bot = s.a.kind === 'bot' ? s.a : s.b.kind === 'bot' ? s.b : null;
      if (bot) {
        botState(bot).lineAt = -99;
        line(bot, 'tradeDone', bot === s.a ? s.b : s.a);
      }
      holds.get(st.game)?.delete(bot?.slot);
    },

    forget() {
      if (st) holds.delete(st.game);
      st = null;
    },
  };
}
