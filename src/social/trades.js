// Trading between people (online). OWNER: social agent (docs/ONLINE.md "Social").
//
// Host-authoritative state machine. The host (or an offline game) owns one manager:
//   app.trades = createTradeManager(app)
//   app.trades.handle(player, name, args)   actions from app.act / the net layer (args is an array):
//     tradeRequest(toSlot) · tradeAccept(fromSlot) · tradeDecline(fromSlot?) · tradeOffer({planters, cash})
//     tradeReady(bool) · tradeCancel()
//   app.trades.update()                      once per frame on the host (idempotent: it reads game.time)
// Flow: request -> invite -> accept -> both edit offers (up to 4 planted plants + cash) -> both Ready ->
// 3 s countdown -> game.trade(a, b, offerA, offerB) swaps everything atomically -> 'trade:done'.
// Any change to either offer un-readies both sides and locks Ready for a second (anti-scam), and the
// countdown restarts. Walking apart (> 40 studs), leaving, getting hit or cancelling ends the trade.
//
// Bus events (payloads hold Players + plain data only, so the net layer can map players to slots):
//   'trade:invite' {from, to, expiresAt}
//   'trade:open'   {a, b}
//   'trade:update' {a, b, offerA, offerB, readyA, readyB, countdownEndsAt, lockUntil, rev, reason, changedBy}
//        offer = {planters: [index...], cash, plants: [{index, uid, speciesId, mutation, grown}]}
//        reason: 'open' | 'offer' | 'ready' | 'changed' (something in a garden changed) | 'failed' | 'sync'
//   'trade:cancel' {a, b, reason, by}   reason: 'declined' | 'cancelled' | 'withdrawn' | 'expired' | 'busy' |
//        'far' | 'distance' | 'bonked' | 'left' | 'wait'   (for invites a = the one who asked, b = the one asked)
//   'trade:done'   is emitted by game.trade itself.
import { bus } from '../core/events.js';

export const TRADE = {
  requestRange: 12, // studs: how close you must be to ask (the HUD chip shows within 10)
  keepRange: 40, // an open trade ends when the two walk further apart than this
  countdown: 3, // seconds between both Ready and the swap
  inviteTtl: 15, // seconds an invite waits for an answer
  maxPlants: 4, // plants per side
  readyLock: 1, // seconds Ready stays locked after any change
  requestGap: 1.5, // seconds between two requests from one player
  declineCooldown: 8, // seconds before you may ask the same person again after a "no"
};

const isPerson = (p) => !!p && p.kind !== 'bot';
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const toSlot = (v) => (Number.isInteger(v) ? v : typeof v === 'object' && v ? v.slot : Number.isFinite(Number(v)) ? Math.floor(Number(v)) : -1);

export const emptyOffer = () => ({ planters: [], cash: 0, plants: [] });
const copyOffer = (o) => ({ planters: [...o.planters], cash: o.cash, plants: o.plants.map((x) => ({ ...x })) });

function sameOffer(a, b) {
  if (a.cash !== b.cash || a.planters.length !== b.planters.length) return false;
  for (let i = 0; i < a.planters.length; i++) if (a.planters[i] !== b.planters[i] || a.plants[i]?.uid !== b.plants[i]?.uid) return false;
  return true;
}

export function createTradeManager(app, opts = {}) {
  const C = { ...TRADE, ...opts };
  let invites = []; // {from, to, at, expiresAt}
  let sessions = []; // {a, b, offers: [A, B], ready: [bool, bool], countdownEndsAt, lockUntil, rev}
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
      countdownEndsAt: s.countdownEndsAt, lockUntil: s.lockUntil, rev: s.rev, reason, changedBy,
    });
  }

  /**
   * What `p` can really offer: their own planted plants (unique planters, at most maxPlants) and at most
   * the cash they have. With `prev` (an offer made earlier) a planter only stays if it still holds the
   * very same plant (same uid): a plant that was stolen, sold or swapped drops out.
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
    return { planters, cash, plants };
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
    const s = { a, b, offers: [emptyOffer(), emptyOffer()], ready: [false, false], countdownEndsAt: 0, lockUntil: 0, rev: 1 };
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
    if (!isPerson(to) || to === from || sessionOf(from)) return false;
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
    if (sessionOf(me) || sessionOf(from) || !isPerson(from)) {
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

  function offer(p, o) {
    const s = sessionOf(p);
    if (!s || !o || typeof o !== 'object') return false;
    const side = sideOf(s, p);
    const clean = sanitize(p, o);
    if (sameOffer(clean, s.offers[side])) {
      // nothing changed, but if we had to trim what they asked for, re-sync that screen
      const asked = Array.isArray(o.planters) ? o.planters.join() : '';
      if (asked !== clean.planters.join() || Math.floor(Number(o.cash) || 0) !== clean.cash) emitUpdate(s, 'sync', null);
      return true;
    }
    s.offers[side] = clean;
    changed(s, 'offer', p);
    return true;
  }

  // both gardens must have room for what comes in (planters given away free up space)
  function roomOk(s) {
    const free = (p) => game.gardens[p.slot].planters.filter((x) => x.unlocked && !x.plant).length;
    const [oa, ob] = s.offers;
    return free(s.a) + oa.planters.length >= ob.planters.length && free(s.b) + ob.planters.length >= oa.planters.length;
  }

  function ready(p, on) {
    const s = sessionOf(p);
    if (!s) return false;
    const side = sideOf(s, p);
    const nothing = !s.offers[0].planters.length && !s.offers[1].planters.length && !s.offers[0].cash && !s.offers[1].cash;
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
    const ok = game.trade(s.a, s.b, { planters: oa.planters, cash: oa.cash }, { planters: ob.planters, cash: ob.cash });
    if (ok) {
      sessions = sessions.filter((x) => x !== s);
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
      if (!isPerson(inv.from) || !isPerson(inv.to)) {
        dropInvite(inv);
        emitCancel(inv.from, inv.to, 'left', isPerson(inv.from) ? inv.to : inv.from);
      } else if (t >= inv.expiresAt) {
        dropInvite(inv);
        emitCancel(inv.from, inv.to, 'expired', inv.to);
      }
    }
    for (const s of [...sessions]) {
      if (!isPerson(s.a) || !isPerson(s.b)) {
        close(s, 'left', isPerson(s.a) ? s.b : s.a);
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
  }

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
  ];

  return {
    /** Apply an action for `player` (the host calls this for local and remote players alike). */
    handle(player, name, args = []) {
      const g = sync();
      if (!g || !player || !g.players.includes(player) || !isPerson(player)) return false;
      const a = Array.isArray(args) ? args : [args];
      const other = () => g.players[toSlot(a[0])] || null;
      switch (name) {
        case 'tradeRequest': return request(player, other());
        case 'tradeAccept': return accept(player, other());
        case 'tradeDecline': return decline(player, a[0] == null ? null : other());
        case 'tradeOffer': return offer(player, a[0]);
        case 'tradeReady': return ready(player, !!a[0]);
        case 'tradeCancel': return cancel(player);
        default: return false;
      }
    },
    update,
    /** Read-only views (tests, debugging, host UI). */
    sessionOf(p) {
      sync();
      const s = sessionOf(p);
      return s && { a: s.a, b: s.b, offerA: copyOffer(s.offers[0]), offerB: copyOffer(s.offers[1]), readyA: s.ready[0], readyB: s.ready[1], countdownEndsAt: s.countdownEndsAt, lockUntil: s.lockUntil, rev: s.rev };
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
    },
  };
}
