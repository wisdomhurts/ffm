// The tutorial's rules, with no DOM (ui/tutorial.js draws them; tests/gameplay/tutorial.test.mjs runs them in node).
//
// profile.tutorial = {state, step}:
//   'new'      never asked (players who already know the game become 'done' instead: TRANSITIONS.migrate)
//   'offered'  asked, no answer yet (asked again next time)
//   'active'   said yes; `step` is the step on screen (saved, so a reload carries on from there)
//   'declined' said no thanks: never asked again (Settings / the mode screen replay it)
//   'done'     finished or skipped
// The step machine ticks steps off on gameplay bus events (all forwarded online, so it works as a client too)
// plus a few polls for things that are already true (holding a seed, a grown plant, a locked gate). An event
// that happens before its step is remembered: a kid who runs ahead never has to do a step twice.
import { bus } from '../core/events.js';
import { getProfile, updateProfile } from '../core/profiles.js';
import { LAYOUT, gardenContains } from '../gameplay/layout.js';
import { speedCost } from '../config.js';

export const STEPS = ['move', 'grab', 'plant', 'grow', 'collect', 'speed', 'lock', 'steal'];
const STATES = ['new', 'offered', 'declined', 'active', 'done'];

// Which event ticks off which step (each test gets the event payload and the local player).
const EVENTS = [
  ['seed:grabbed', 'grab', (e, me) => e.player === me],
  ['plant:planted', 'plant', (e, me) => e.player === me],
  ['plant:grown', 'grow', (e, me) => e.garden?.owner === me],
  ['cash:collected', 'collect', (e, me) => e.player === me],
  ['speed:up', 'speed', (e, me) => e.player === me],
  ['lock:on', 'lock', (e, me) => e.player === me],
  ['steal:success', 'steal', (e, me) => e.thief === me],
];
export const STEP_EVENTS = EVENTS.map(([ev]) => ev);

const MOVE_DIST = 12; // studs walked to finish "move" (or reach its spot)
const ARRIVE_MOVE = 4;
const ROAD = { x: 0, z: LAYOUT.roadGate.z + 8 }; // just inside the Sunny Field
const SPEED_MAT = LAYOUT.speedStations.find((s) => s.id === 'speed') || LAYOUT.shops.speed;
// An owner only counts as "away" when they really are: up the Seed Road, or far from home and not on their
// way back. Anything closer can be home to BONK you within seconds.
const AWAY_Z = LAYOUT.roadGate.z + 10;
const AWAY_DIST = 70;

// ------------------------------------------------------------------ the profile record

const record = (p) => (p?.tutorial && STATES.includes(p.tutorial.state) ? p.tutorial : { state: 'new', step: 0 });

/** Has this player played before (so they are never offered the tutorial)? Any lifetime progress counts. */
export function hasPlayed(p, hasSave = false) {
  if (!p) return false;
  const c = p.counters || {};
  return !!hasSave || c.games > 0 || c.seeds > 0 || c.planted > 0 || c.cash > 0 || p.stars > 0 ||
    Object.keys(p.badges || {}).length > 0 || p.best?.netWorth > 0 || !!p.online || p.pets?.owned?.length > 0;
}

/** Pure transitions on a {state, step} record (each returns the same object when nothing changes). */
export const TRANSITIONS = {
  migrate: (t, played) => (t.state === 'new' && played ? { state: 'done', step: 0 } : t),
  offer: (t) => (t.state === 'new' ? { state: 'offered', step: 0 } : t),
  answer: (t, yes) => (t.state === 'new' || t.state === 'offered' ? { state: yes ? 'active' : 'declined', step: 0 } : t),
  replay: () => ({ state: 'active', step: 0 }),
  skip: (t) => (t.state === 'active' ? { state: 'done', step: t.step } : t),
  // step i is finished: on to the next one (or done after the last)
  advance: (t, i) => (t.state !== 'active' || i !== t.step ? t : i + 1 >= STEPS.length ? { state: 'done', step: STEPS.length } : { state: 'active', step: i + 1 }),
};

function apply(id, fn, ...args) {
  const p = getProfile(id);
  if (!p) return null;
  const cur = record(p);
  const next = fn(cur, ...args);
  if (next.state !== cur.state || next.step !== cur.step || p.tutorial !== cur) {
    updateProfile(id, (q) => {
      q.tutorial = { state: next.state, step: Math.max(0, Math.min(STEPS.length, next.step | 0)) };
    });
  }
  return getProfile(id).tutorial;
}

/** The profile's tutorial record ({state, step}) as saved. */
export const tutorialRecord = (id) => record(getProfile(id));
/**
 * The record after the migration: a player who already played skips the offer ('done'). Only before a game
 * starts (this game's own progress would count as having played).
 */
export const tutorialOf = (id, hasSave = false) => apply(id, TRANSITIONS.migrate, hasPlayed(getProfile(id), hasSave));
/** Should this player be asked "Want a quick tutorial?" before (or as) their game starts? */
export function wantsOffer(id, hasSave = false) {
  const t = tutorialOf(id, hasSave);
  return !!t && (t.state === 'new' || t.state === 'offered');
}
export const markOffered = (id) => apply(id, TRANSITIONS.offer);
export const answerOffer = (id, yes) => apply(id, TRANSITIONS.answer, !!yes);
export const replayTutorial = (id) => apply(id, TRANSITIONS.replay);
export const skipTutorial = (id) => apply(id, TRANSITIONS.skip);
export const finishStep = (id, i) => apply(id, TRANSITIONS.advance, i);

// ------------------------------------------------------------------ the step machine

/**
 * The live tutorial for the local player `me` in `game`, starting at step index `step`.
 *   tick()     polls and advances (at most one step per tick); onAdvance(i, nextId) fires for each finished step
 *   target()   world point the player should head for next ({x, z} or null), sets `arrive`
 *   note()     what the current step's card should say right now: {kind, n, name}
 *   step / id  the current step (id null once all are done), seen (step ids already done ahead of time)
 */
export function createStepMachine(game, me, { step = 0, onAdvance } = {}) {
  const L = LAYOUT.gardens[me.slot];
  const garden = () => game.gardens[me.slot];
  const seen = new Set();
  const offs = EVENTS.map(([ev, id, test]) => bus.on(ev, (e) => {
    if (e && test(e, me)) seen.add(id);
  }));
  let moved = 0;
  const last = { x: me.pos.x, z: me.pos.z };
  let stealPick = null; // {g, pl, away, home}: sticky so the target doesn't flip between gardens every tick
  const note = { kind: '', n: 0, name: '' };

  const m = {
    step: Math.max(0, Math.min(STEPS.length, step | 0)),
    seen,
    arrive: 6, // how close counts as "there" for the current target (the HUD arrow hides)
    get id() {
      return STEPS[m.step] || null;
    },
    tick() {
      const id = m.id;
      if (!id) return false;
      const d = Math.hypot(me.pos.x - last.x, me.pos.z - last.z);
      if (d < 8) moved += d; // a respawn or a teleport is not a walk
      last.x = me.pos.x;
      last.z = me.pos.z;
      if (!satisfied(id)) return false;
      const i = m.step;
      m.step++;
      stealPick = null;
      onAdvance?.(i, m.id);
      return true;
    },
    target,
    note: () => describe(note),
    dispose() {
      offs.forEach((f) => f());
    },
  };

  function grownAtHome() {
    for (const pl of garden().planters) if (pl.plant && pl.plant.growLeft <= 0) return true;
    return false;
  }
  function satisfied(id) {
    if (seen.has(id)) return true;
    switch (id) {
      case 'move':
        return moved >= MOVE_DIST || Math.hypot(me.pos.x - L.outside.x, me.pos.z - L.outside.z) < ARRIVE_MOVE;
      case 'grab':
        return me.carrying?.kind === 'seed';
      case 'grow':
        return grownAtHome();
      case 'lock':
        return game.isLocked(garden());
      default:
        return false;
    }
  }

  // Is this garden's owner really away (so a first steal won't be bonked seconds later)?
  function ownerAway(g) {
    const o = g.owner;
    const dx = g.L.center.x - o.pos.x, dz = g.L.center.z - o.pos.z;
    const dist = Math.hypot(dx, dz);
    if (o.pos.z <= AWAY_Z && dist <= AWAY_DIST) return false;
    if (o.carrying) return false; // loot goes straight home
    const v = Math.hypot(o.vel.x, o.vel.z);
    return !(v > 2 && (o.vel.x * dx + o.vel.z * dz) / (v * Math.max(dist, 1e-6)) > 0.5);
  }

  // The best plant to practise stealing on: never in a locked garden, preferably while its owner is really
  // away, preferably in the column nearest the gate.
  function pickSteal() {
    let best = null;
    let bs = Infinity;
    for (const g of game.gardens) {
      if (g.owner === me || !g.owner || g.owner.kind === 'empty' || game.isLocked(g)) continue;
      const o = g.owner.pos;
      const away = ownerAway(g);
      const home = !away && gardenContains(g.L, o.x, o.z, -12);
      for (const pl of g.planters) {
        if (!pl.plant || pl.plant.growLeft > 0) continue;
        const back = pl.index % 2 === 1; // far column: you have to hop a planter
        const s = Math.hypot(pl.x - me.pos.x, pl.z - me.pos.z) + (away ? 0 : home ? 120 : 70) + (back ? 25 : 0) + (stealPick?.pl === pl ? -30 : 0);
        if (s < bs) {
          bs = s;
          best = { g, pl, away, home };
        }
      }
    }
    return best;
  }

  // The nearest seed waiting in a pod (the route helper steers around the arch); up the road if all are empty.
  function nearestSeed() {
    let best = null;
    let bd = Infinity;
    for (const pod of game.pods) {
      if (!pod.seed) continue;
      const dd = (pod.x - me.pos.x) ** 2 + (pod.z - me.pos.z) ** 2;
      if (dd < bd) {
        bd = dd;
        best = pod;
      }
    }
    m.arrive = 4.5; // the Grab prompt shows from here
    return best || ROAD;
  }

  function growing() {
    let best = null;
    for (const pl of garden().planters) if (pl.plant && pl.plant.growLeft > 0 && (!best || pl.plant.growLeft < best.plant.growLeft)) best = pl;
    return best;
  }

  function target() {
    const c = me.carrying?.kind;
    switch (m.id) {
      case 'move':
        m.arrive = ARRIVE_MOVE;
        return L.outside;
      case 'grab':
        return c ? null : nearestSeed();
      case 'plant':
        m.arrive = 6;
        return c === 'seed' ? L.inside : c ? null : nearestSeed();
      case 'grow': {
        const pl = growing();
        m.arrive = 7;
        if (pl) return pl;
        return c === 'seed' ? L.inside : c ? null : nearestSeed(); // nothing growing (stolen?): plant another
      }
      case 'collect':
        m.arrive = 1.6; // you have to stand ON the pad
        return L.collectPad;
      case 'speed':
        if (me.cash < speedCost(me.speedLevel + 1)) {
          m.arrive = 1.6;
          return L.collectPad;
        }
        m.arrive = 2.5;
        return SPEED_MAT;
      case 'lock':
        m.arrive = 1.4;
        return L.lockPad;
      case 'steal': {
        if (c === 'plant') {
          m.arrive = 6;
          return L.inside;
        }
        if (c) return null;
        stealPick = pickSteal();
        m.arrive = 4;
        return stealPick?.pl || null;
      }
      default:
        return null;
    }
  }

  // The card's live line: kind picks the sentence, n / name fill it in.
  function describe(o) {
    const c = me.carrying?.kind;
    o.n = 0;
    o.name = '';
    switch (m.id) {
      case 'plant':
        o.kind = c === 'seed' ? 'carry' : 'dropped';
        break;
      case 'grow': {
        const pl = growing();
        o.kind = pl ? 'growing' : 'none';
        o.n = pl ? Math.max(1, Math.ceil(pl.plant.growLeft)) : 0;
        break;
      }
      case 'speed': {
        const cost = speedCost(me.speedLevel + 1);
        o.kind = me.cash < cost ? 'need' : 'go';
        o.n = Math.ceil(cost - me.cash);
        break;
      }
      case 'lock': {
        // locked a moment ago (before this step)? The pad needs to recharge first
        const wait = (garden().lockReadyAt ?? 0) - game.time;
        o.kind = wait > 0.5 && !game.isLocked(garden()) ? 'recharge' : 'go';
        o.n = Math.ceil(wait);
        break;
      }
      case 'steal':
        if (c === 'plant') o.kind = 'home';
        else if (!stealPick) o.kind = 'none';
        else {
          o.kind = stealPick.away ? 'away' : stealPick.home ? 'home-owner' : 'near';
          o.name = stealPick.g.owner.name || '';
        }
        break;
      default:
        o.kind = 'go';
    }
    return o;
  }

  return m;
}
