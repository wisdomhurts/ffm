// Trading: people with people (online) and with the family bots (offline and in private rooms).
// OWNER: social agent (docs/ONLINE.md "Social").
//
// Host-authoritative state machine. The host (or an offline game) owns one manager:
//   app.trades = createTradeManager(app)
//   app.trades.handle(player, name, args)   a person's actions from app.act / the net layer (args is an array):
//     tradeRequest(toSlot) · tradeAccept(fromSlot) · tradeDecline(fromSlot?) · tradeReady(bool, petRoom?) · tradeCancel()
//     tradeOffer({planters, uids, cash, pets: [{uid, id, name}], seed, petRoom})
//         seed: true or the carried seed's seedSig = "the seed in my hands"; petRoom: free spots in my pet bag
//     tradeAsk({planters, uids, pets: [{uid}], petRoom})   trading with a bot: what I ask it for (its side)
//   app.trades.botAct(bot, name, args)       the same actions for a family bot (social/botTrade.js, tests)
//   app.trades.update()                      once per frame on the host (idempotent: it reads game.time)
// Flow: request -> invite -> accept -> both edit offers (up to 4 plants, grown or still growing, up to 3 pets,
// the seed in your hands, cash) -> both Ready -> 3 s countdown -> game.trade(a, b, offerA, offerB) swaps
// everything atomically -> 'trade:done'. Any change to either offer un-readies both sides and locks Ready for
// a second (anti-scam), and the countdown restarts. Walking apart (> 40 studs), leaving, getting hit or
// cancelling ends the trade. Both gardens need room for the plants and seeds coming in, both pet bags for the
// pets (a bot holds 3). Bots answer invites, weigh offers and say yes or ask for more (social/botTrade.js).
//
// Bus events (payloads hold Players + plain data only, so the net layer can map players to slots):
//   'trade:invite' {from, to, expiresAt}
//   'trade:open'   {a, b}
//   'trade:update' {a, b, offerA, offerB, readyA, readyB, countdownEndsAt, lockUntil, rev, reason, changedBy, petRoomA, petRoomB}
//        offer = {planters: [index...], cash, plants: [{index, uid, speciesId, mutation, grown}],
//                 pets: [{uid, id, name, k?}], seed: null | {speciesId, mutation, sig}}
//        (a bot's pets: uid = botPetUid(k, id), k = index in its team; nicknames only ever nested, never top level)
//        reason: 'open' | 'offer' | 'ask' | 'ready' | 'changed' (something in a garden changed) | 'failed' | 'sync'
//   'trade:cancel' {a, b, reason, by}   reason: 'declined' | 'cancelled' | 'withdrawn' | 'expired' | 'busy' |
//        'far' | 'distance' | 'bonked' | 'left' | 'wait'   (for invites a = the one who asked, b = the one asked)
//   'trade:done'   is emitted by game.trade itself.
import { bus } from '../core/events.js';
import { PLANT } from '../config.js';
import { PET, PET_CAPACITY } from '../pets/catalog.js';
import { MAX_TEAM } from '../pets/effects.js';
import { sanitizePetName } from '../pets/names.js';
import { seedSig } from '../gameplay/game.js';
import { createBotTrader } from './botTrade.js';

export const TRADE = {
  requestRange: 12, // studs: how close you must be to ask (the HUD chip shows within 10)
  keepRange: 40, // an open trade ends when the two walk further apart than this
  countdown: 3, // seconds between both Ready and the swap
  inviteTtl: 15, // seconds an invite waits for an answer
  maxPlants: 4, // plants per side
  maxPets: 3, // pets per side
  readyLock: 1, // seconds Ready stays locked after any change
  requestGap: 1.5, // seconds between two requests from one player
  declineCooldown: 8, // seconds before you may ask the same person again after a "no"
};

const isPerson = (p) => !!p && (p.kind === 'local' || p.kind === 'remote');
// people trade with people and with the family bots (public rooms have no bots)
const isTrader = (p) => isPerson(p) || p?.kind === 'bot';
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const toSlot = (v) => (Number.isInteger(v) ? v : typeof v === 'object' && v ? v.slot : Number.isFinite(Number(v)) ? Math.floor(Number(v)) : -1);
const ID = /^[a-zA-Z0-9_:-]{1,32}$/; // same as protocol.js isId: pet uids travel inside events
const petRoomNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(PET_CAPACITY, Math.floor(v))) : null);

/** The uid a bot's pet goes by in offers: its place in the bot's team + its species. */
export const botPetUid = (k, id) => `b${k}:${id}`;

export const emptyOffer = () => ({ planters: [], cash: 0, plants: [], pets: [], seed: null });
const copyOffer = (o) => ({ planters: [...o.planters], cash: o.cash, plants: o.plants.map((x) => ({ ...x })), pets: o.pets.map((x) => ({ ...x })), seed: o.seed ? { ...o.seed } : null });
/** Nothing at all on this side. */
export const offerEmpty = (o) => !o.planters.length && !o.cash && !o.pets.length && !o.seed;

function sameOffer(a, b) {
  if (a.cash !== b.cash || a.planters.length !== b.planters.length || a.pets.length !== b.pets.length || (a.seed?.sig ?? '') !== (b.seed?.sig ?? '')) return false;
  for (let i = 0; i < a.planters.length; i++) if (a.planters[i] !== b.planters[i] || a.plants[i]?.uid !== b.plants[i]?.uid) return false;
  for (let i = 0; i < a.pets.length; i++) if (a.pets[i].uid !== b.pets[i].uid) return false;
  return true;
}

export function createTradeManager(app, opts = {}) {
  const C = { ...TRADE, ...opts };
  let invites = []; // {from, to, at, expiresAt}
  let sessions = []; // {a, b, offers: [A, B], ready: [bool, bool], countdownEndsAt, lockUntil, rev, petRoom: [n, n], asked}
  const lastAsk = new Map(); // slot -> time of the last request
  const cooldown = new Map(); // 'from>to' -> game time before which from may not ask to again
  let game = null;

  // everything belongs to one match: a new game starts clean
  function sync() {
    const g = app.game || null;
    if (g !== game) {
      game = g;
      invites = [];
      sessions = [];
      lastAsk.clear();
      cooldown.clear();
    }
    return g;
  }
  const now = () => game?.time ?? 0;
  const sessionOf = (p) => sessions.find((s) => s.a === p || s.b === p) || null;
  const sideOf = (s, p) => (s.a === p ? 0 : 1);
  const emitCancel = (a, b, reason, by = null) => bus.emit('trade:cancel', { a, b, reason, by });

  function emitUpdate(s, reason, changedBy = null) {
    bus.emit('trade:update', {
      a: s.a, b: s.b, offerA: copyOffer(s.offers[0]), offerB: copyOffer(s.offers[1]), readyA: s.ready[0], readyB: s.ready[1],
      countdownEndsAt: s.countdownEndsAt, lockUntil: s.lockUntil, rev: s.rev, reason, changedBy, petRoomA: petRoomOf(s, 0), petRoomB: petRoomOf(s, 1),
    });
  }

  // free spots in a side's pet bag: a person's device tells us (we can't see the bag; null until it has), a
  // bot holds MAX_TEAM
  function petRoomOf(s, side) {
    const p = side ? s.b : s.a;
    return p.kind === 'bot' ? Math.max(0, MAX_TEAM - p.pets.length) : s.petRoom[side];
  }
  function setPetRoom(s, side, v) {
    const n = petRoomNum(v);
    if (n == null || n === s.petRoom[side]) return false;
    s.petRoom[side] = n;
    return true;
  }

  /**
   * The pets `p` offers. A person's come from their device (the host can't see a pet bag): known species, ids
   * that look like ids, clean nicknames, no repeats. A bot's are its egg-drop team, by botPetUid, and each must
   * still be in that place in its team. At most maxPets.
   */
  function petsOf(p, list) {
    const out = [];
    for (const x of Array.isArray(list) ? list.slice(0, 8) : []) {
      if (out.length >= C.maxPets || !x || typeof x !== 'object' || typeof x.uid !== 'string' || out.some((y) => y.uid === x.uid)) continue;
      if (p.kind === 'bot') {
        const m = /^b(\d):(.+)$/.exec(x.uid);
        const k = m ? Number(m[1]) : -1;
        if (k < 0 || p.pets[k] !== m[2]) continue;
        out.push({ uid: x.uid, id: m[2], name: p.petNames[k] || '', k });
      } else if (ID.test(x.uid) && typeof x.id === 'string' && PET[x.id]) out.push({ uid: x.uid, id: x.id, name: sanitizePetName(x.name) });
    }
    return out;
  }

  /** The seed in `p`'s hands, if offered (o.seed: true or its seedSig) and, with `prev`, still the same one. */
  function seedOf(p, o, prev) {
    const c = p.carrying;
    const sig = seedSig(c);
    if (!sig || !PLANT[c.speciesId]) return null;
    if (prev) return prev.seed && prev.seed.sig === sig ? prev.seed : null;
    if (!o?.seed || (typeof o.seed === 'string' && o.seed !== sig)) return null;
    return { speciesId: c.speciesId, mutation: c.mutation, sig };
  }

  /**
   * What `p` can really offer: their own planted plants, grown or growing (unique planters, at most maxPlants),
   * pets (petsOf), the seed in their hands and at most the cash they have. With `prev` (an offer made earlier)
   * a planter only stays if it still holds the very same plant (same uid): a plant that was stolen, sold or
   * swapped drops out; so does a seed that was planted or dropped.
   */
  function sanitize(p, o, prev = null) {
    const garden = game.gardens[p.slot];
    const want = Array.isArray(o?.planters) ? o.planters : [];
    const uids = Array.isArray(o?.uids) ? o.uids : null;
    const planters = [];
    const plants = [];
    want.forEach((raw, k) => {
      const i = Number(raw);
      if (!Number.isInteger(i) || planters.includes(i) || planters.length >= C.maxPlants) return;
      const pl = garden?.planters[i];
      if (!pl?.plant) return;
      const was = prev ? prev.plants[prev.planters.indexOf(i)]?.uid : uids ? uids[k] : null;
      if (was != null && was !== pl.plant.uid) return;
      planters.push(i);
      plants.push({ index: i, uid: pl.plant.uid, speciesId: pl.plant.speciesId, mutation: pl.plant.mutation, grown: pl.plant.growLeft <= 0 });
    });
    const cash = Math.max(0, Math.min(Math.floor(Number(o?.cash) || 0), Math.floor(p.cash)));
    return { planters, cash, plants, pets: petsOf(p, prev ? prev.pets : o?.pets), seed: seedOf(p, o, prev) };
  }

  function changed(s, reason, by) {
    s.ready = [false, false];
    s.countdownEndsAt = 0;
    s.lockUntil = now() + C.readyLock;
    s.rev++;
    emitUpdate(s, reason, by);
  }

  function dropInvite(inv) {
    invites = invites.filter((x) => x !== inv);
  }

  function open(a, b) {
    // anyone else waiting on these two is told they're busy now; their own outgoing asks are withdrawn
    for (const inv of [...invites]) {
      if (inv.from === a || inv.from === b || inv.to === a || inv.to === b) {
        dropInvite(inv);
        if (!((inv.from === a && inv.to === b) || (inv.from === b && inv.to === a))) {
          emitCancel(inv.from, inv.to, inv.to === a || inv.to === b ? 'busy' : 'withdrawn', inv.from === a || inv.from === b ? inv.from : inv.to);
        }
      }
    }
    const s = { a, b, offers: [emptyOffer(), emptyOffer()], ready: [false, false], countdownEndsAt: 0, lockUntil: 0, rev: 1, petRoom: [null, null], asked: false };
    sessions.push(s);
    bus.emit('trade:open', { a, b });
    emitUpdate(s, 'open');
    return true;
  }

  function close(s, reason, by = null) {
    sessions = sessions.filter((x) => x !== s);
    emitCancel(s.a, s.b, reason, by);
  }

  // ---------------------------------------------------------------- actions

  function request(from, to) {
    if (!isTrader(to) || to === from || sessionOf(from)) return false;
    const t = now();
    if (t - (lastAsk.get(from.slot) ?? -99) < C.requestGap) return false;
    lastAsk.set(from.slot, t);
    if (sessionOf(to)) {
      emitCancel(from, to, 'busy', to);
      return false;
    }
    if (dist(from, to) > C.requestRange) {
      emitCancel(from, to, 'far', from);
      return false;
    }
    if ((cooldown.get(from.slot + '>' + to.slot) ?? -99) > t) {
      emitCancel(from, to, 'wait', to);
      return false;
    }
    // they already asked us: that's a yes
    const back = invites.find((x) => x.from === to && x.to === from);
    if (back) return open(to, from);
    // one open ask per person
    for (const inv of invites.filter((x) => x.from === from)) {
      dropInvite(inv);
      if (inv.to !== to) emitCancel(from, inv.to, 'withdrawn', from);
    }
    const inv = { from, to, at: t, expiresAt: t + C.inviteTtl };
    invites.push(inv);
    bus.emit('trade:invite', { from, to, expiresAt: inv.expiresAt });
    return true;
  }

  function accept(me, from) {
    const inv = invites.find((x) => x.from === from && x.to === me);
    if (!inv) return false;
    dropInvite(inv);
    if (now() >= inv.expiresAt) {
      emitCancel(from, me, 'expired', from);
      return false;
    }
    if (sessionOf(me) || sessionOf(from) || !isTrader(from)) {
      emitCancel(from, me, 'busy', from);
      return false;
    }
    if (dist(from, me) > C.keepRange) {
      emitCancel(from, me, 'far', me);
      return false;
    }
    return open(from, me);
  }

  function decline(me, from) {
    const mine = invites.filter((x) => x.to === me && (!from || x.from === from));
    for (const inv of mine) {
      dropInvite(inv);
      cooldown.set(inv.from.slot + '>' + me.slot, now() + C.declineCooldown);
      emitCancel(inv.from, me, 'declined', me);
    }
    return mine.length > 0;
  }

  // `side`'s offer becomes `clean` (a person's own edit, or what they asked a bot for); `by` sent `o`
  function setOffer(s, side, clean, o, reason, by) {
    const roomMoved = setPetRoom(s, sideOf(s, by), o.petRoom);
    if (sameOffer(clean, s.offers[side])) {
      // nothing changed, but if we had to trim what they asked for (or their pet bag changed), re-sync that screen
      const asked = Array.isArray(o.planters) ? o.planters.join() : '';
      const askedPets = Array.isArray(o.pets) ? o.pets.length : 0;
      const trimmed = asked !== clean.planters.join() || askedPets !== clean.pets.length ||
        (reason === 'offer' && (Math.floor(Number(o.cash) || 0) !== clean.cash || !!o.seed !== !!clean.seed));
      if (trimmed || roomMoved) emitUpdate(s, 'sync', null);
      return true;
    }
    s.offers[side] = clean;
    changed(s, reason, by);
    return true;
  }

  function offer(p, o) {
    const s = sessionOf(p);
    if (!s || !o || typeof o !== 'object') return false;
    return setOffer(s, sideOf(s, p), sanitize(p, o), o, 'offer', p);
  }

  // trading with a bot: you pick what you'd like from its garden and team (its side of the trade)
  function ask(p, o) {
    const s = sessionOf(p);
    if (!s || !o || typeof o !== 'object') return false;
    const side = 1 - sideOf(s, p);
    const bot = side ? s.b : s.a;
    if (bot.kind !== 'bot') return false; // people make their own offers
    s.asked = true;
    return setOffer(s, side, sanitize(bot, { planters: o.planters, uids: o.uids, pets: o.pets, cash: 0 }), o, 'ask', p);
  }

  /** Is there room for everything coming in? {ok, plants: [shortA, shortB], pets: [shortA, shortB]} (missing spots). */
  function room(s) {
    const free = (p) => game.gardens[p.slot].planters.filter((x) => x.unlocked && !x.plant).length;
    const [oa, ob] = s.offers;
    // plants given away free their planters; a seed coming in needs one too
    const plants = [ob.planters.length + (ob.seed ? 1 : 0) - oa.planters.length - free(s.a), oa.planters.length + (oa.seed ? 1 : 0) - ob.planters.length - free(s.b)];
    const pets = [ob.pets.length - oa.pets.length - (petRoomOf(s, 0) ?? 0), oa.pets.length - ob.pets.length - (petRoomOf(s, 1) ?? 0)];
    return { ok: plants[0] <= 0 && plants[1] <= 0 && pets[0] <= 0 && pets[1] <= 0, plants, pets };
  }
  const roomOk = (s) => room(s).ok;

  function ready(p, on, petRoom) {
    const s = sessionOf(p);
    if (!s) return false;
    const side = sideOf(s, p);
    setPetRoom(s, side, petRoom);
    const nothing = offerEmpty(s.offers[0]) && offerEmpty(s.offers[1]);
    if (on && (now() < s.lockUntil || nothing || !roomOk(s))) {
      emitUpdate(s, 'ready', p); // tell that screen it didn't take
      return false;
    }
    if (s.ready[side] === on) return true;
    s.ready[side] = on;
    s.countdownEndsAt = s.ready[0] && s.ready[1] ? now() + C.countdown : 0;
    s.rev++;
    emitUpdate(s, 'ready', p);
    return true;
  }

  function cancel(p) {
    const s = sessionOf(p);
    if (s) {
      close(s, 'cancelled', p);
      return true;
    }
    const mine = invites.filter((x) => x.from === p);
    for (const inv of mine) {
      dropInvite(inv);
      emitCancel(p, inv.to, 'withdrawn', p);
    }
    return mine.length > 0;
  }

  function execute(s) {
    const [oa, ob] = s.offers;
    const pass = (o, side) => ({ planters: o.planters, cash: o.cash, pets: o.pets.map((x) => ({ ...x })), seed: o.seed ? o.seed.sig : false, petRoom: petRoomOf(s, side) ?? 0 });
    const ok = game.trade(s.a, s.b, pass(oa, 0), pass(ob, 1));
    if (ok) {
      sessions = sessions.filter((x) => x !== s);
      bots.done(s);
      return true;
    }
    // something moved at the last moment (a plant is being stolen, a garden filled up): try again
    s.offers = [sanitize(s.a, oa, oa), sanitize(s.b, ob, ob)];
    changed(s, 'failed', null);
    return false;
  }

  // ---------------------------------------------------------------- per frame + game events

  function update() {
    const g = sync();
    if (!g) return;
    const t = g.time;
    for (const inv of [...invites]) {
      if (!isTrader(inv.from) || !isTrader(inv.to)) {
        dropInvite(inv);
        emitCancel(inv.from, inv.to, 'left', isTrader(inv.from) ? inv.to : inv.from);
      } else if (t >= inv.expiresAt) {
        dropInvite(inv);
        emitCancel(inv.from, inv.to, 'expired', inv.to);
      }
    }
    for (const s of [...sessions]) {
      if (!isTrader(s.a) || !isTrader(s.b)) {
        close(s, 'left', isTrader(s.a) ? s.b : s.a);
        continue;
      }
      if (dist(s.a, s.b) > C.keepRange) {
        close(s, 'distance', null);
        continue;
      }
      // still the same plants and enough cash? (a plant can be stolen or sold mid-trade)
      const fresh = [sanitize(s.a, s.offers[0], s.offers[0]), sanitize(s.b, s.offers[1], s.offers[1])];
      const who = [0, 1].filter((i) => !sameOffer(fresh[i], s.offers[i]));
      if (who.length) {
        s.offers = fresh;
        changed(s, 'changed', who.length === 1 ? (who[0] ? s.b : s.a) : null);
        continue;
      }
      if (s.countdownEndsAt && t >= s.countdownEndsAt) execute(s);
    }
    bots.update(t);
  }

  // the family bots' side of things (social/botTrade.js): they use the very same actions
  const bots = createBotTrader({
    get game() {
      return game;
    },
    C,
    invites: () => invites,
    sessions: () => sessions,
    sessionOf,
    sideOf,
    room,
    request,
    accept,
    decline,
    offer,
    ready,
    cancel,
  });

  const offs = [
    bus.on('player:hit', ({ target } = {}) => {
      const s = target && sessionOf(target);
      if (s) close(s, 'bonked', target);
    }),
    bus.on('slot:changed', ({ player } = {}) => {
      if (!player) return;
      const s = sessionOf(player);
      if (s) close(s, 'left', player);
      for (const inv of invites.filter((x) => x.from === player || x.to === player)) {
        dropInvite(inv);
        emitCancel(inv.from, inv.to, 'left', player);
      }
    }),
    bus.on('game:dispose', () => {
      invites = [];
      sessions = [];
      game = null;
    }),
    // "Trade?" in quick chat or typed chat: a family bot nearby may ask back (the host's bots; clients only watch)
    bus.on('chat', (e) => {
      if (app.online?.isClient || !e?.player || !isPerson(e.player) || (!e.quick && !e.typed)) return;
      const g = sync();
      if (g && g.players[e.player.slot] === e.player) bots.onChat(e);
    }),
    // a present for a family bot gets a thank you
    bus.on('gift', ({ from, to } = {}) => {
      if (!app.online?.isClient && to?.kind === 'bot' && isPerson(from) && sync()?.players[to.slot] === to) bots.gifted(to, from);
    }),
  ];

  function run(player, name, args) {
    const g = game;
    const a = Array.isArray(args) ? args : [args];
    const other = () => g.players[toSlot(a[0])] || null;
    switch (name) {
      case 'tradeRequest': return request(player, other());
      case 'tradeAccept': return accept(player, other());
      case 'tradeDecline': return decline(player, a[0] == null ? null : other());
      case 'tradeOffer': return offer(player, a[0]);
      case 'tradeAsk': return ask(player, a[0]);
      case 'tradeReady': return ready(player, !!a[0], a[1]);
      case 'tradeCancel': return cancel(player);
      default: return false;
    }
  }

  return {
    /** Apply an action for `player` (the host calls this for local and remote players alike). */
    handle(player, name, args = []) {
      const g = sync();
      if (!g || !player || !g.players.includes(player) || !isPerson(player)) return false;
      return run(player, name, args);
    },
    /** The same actions for a family bot (social/botTrade.js plays them; tests drive them directly). */
    botAct(bot, name, args = []) {
      const g = sync();
      if (!g || !bot || !g.players.includes(bot) || bot.kind !== 'bot' || name === 'tradeAsk') return false;
      return run(bot, name, args);
    },
    update,
    /** Read-only views (tests, debugging, host UI). */
    sessionOf(p) {
      sync();
      const s = sessionOf(p);
      return s && { a: s.a, b: s.b, offerA: copyOffer(s.offers[0]), offerB: copyOffer(s.offers[1]), readyA: s.ready[0], readyB: s.ready[1], countdownEndsAt: s.countdownEndsAt, lockUntil: s.lockUntil, rev: s.rev,
        petRoomA: petRoomOf(s, 0), petRoomB: petRoomOf(s, 1), room: room(s) };
    },
    invitesFor(p) {
      sync();
      return invites.filter((x) => x.to === p || x.from === p).map((x) => ({ ...x }));
    },
    get busy() {
      return sessions.length > 0 || invites.length > 0;
    },
    dispose() {
      offs.forEach((off) => off());
      invites = [];
      sessions = [];
      bots.forget();
    },
  };
}
