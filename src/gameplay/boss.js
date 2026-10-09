// Big Chomp the Garden Gobbler: a world boss. A giant goofy caterpillar crawls out of the road gate to the
// richest garden, parks outside its gate and slurps its cash pile until everyone (bots too) bonks it into a
// burst of mutated seeds, a pot of cash split by hits and a crown for the top bonker. Ignored, it burps and
// crawls away with what it slurped. Rules only (no rendering); Game owns `game.boss` and calls these from
// its step, bonk and water balloon code (host-authoritative online: clients only mirror the 'bs' section).
//
// game.boss = {uid, x, z, yaw, hp, max, target (garden slot), slurped, hits [per slot], state, born, until}
//   state 'crawl' (heading for the target's gate) -> 'munch' (parked, slurping) -> gone (burst) or
//   'leave' (crawling back up the road after BOSS.life; it can't be hurt any more)
// Events (numbers and players only, no boss object: see net/protocol.js EventCodec):
//   boss:spawn {x, z, hp, max, victim} · boss:hit {by, n, hp, max, cause, x, z}
//   boss:defeated {x, z, by, top, pot, shares [per slot], seeds, refund, victim} · boss:leave {x, z, slurped, victim}
import { BOSS, PLAYER, ITEM, WORLD, ROAD_END_Z, biomeIndexAtZ } from '../config.js';
import { LAYOUT } from './layout.js';
import { bus } from '../core/events.js';
import { makeRng } from '../core/rng.js';

export const BOSS_STATES = Object.freeze(['crawl', 'munch', 'leave']);
export const BOSS_NEVER = 1e9; // "no boss coming" (stays a number on the wire, unlike Infinity)
// where it comes from and crawls back to: just up the Seed Road
export const BOSS_DEN = Object.freeze({ x: LAYOUT.roadGate.x, z: LAYOUT.roadGate.z + 10 });
const TURN = 2.2; // radians per second
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Where Big Chomp parks to munch garden `slot`'s cash pile: lying along the fence just outside its gate (clear of
 *  the laser), its head in front of the gate and its face to the plaza, where everyone comes running from.
 *  {x, z} is its centre, `yaw` its heading. */
export function bossPark(slot) {
  const L = LAYOUT.gardens[slot];
  const fz = L.gate.z < 0 ? 1 : -1;
  return { x: L.gate.x - L.inward * BOSS.park, z: L.gate.z - fz * BOSS.body.front, yaw: fz > 0 ? 0 : Math.PI };
}

/** The point of its body (the middle line, BOSS.body) nearest to (x, z): what bonks, balloons and bots aim at. */
export function bossNearest(b, x, z, out = {}) {
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  const t = clamp((x - b.x) * fx + (z - b.z) * fz, -BOSS.body.back, BOSS.body.front);
  out.x = b.x + fx * t;
  out.z = b.z + fz * t;
  return out;
}
const NEAR = { x: 0, z: 0 };
const bodyDist = (b, x, z) => {
  bossNearest(b, x, z, NEAR);
  return Math.hypot(NEAR.x - x, NEAR.z - z);
};

/** Fresh match: no boss yet. Endless: the first one comes at BOSS.firstAt; Showdown: once, somewhere in its window.
 *  Its dice are its own (the rules' random stream stays untouched until it shows up). */
export function initBoss(game, seed) {
  game.boss = null;
  game._bossRng = makeRng(Number.isFinite(seed) ? (seed * 31 + 0xb055) >>> 0 : undefined);
  game._bossDeep = [-1, -1, -1, -1]; // deepest biome each garden's player has reached (its seeds come from there)
  const [a, b] = BOSS.showdown;
  game.nextBossAt = game.mode === 'showdown' ? a + game._bossRng.next() * (b - a) : BOSS.firstAt;
}

function scheduleNext(game) {
  game.nextBossAt = game.mode === 'showdown' ? BOSS_NEVER : game.time + game._bossRng.range(BOSS.gapMin, BOSS.gapMax);
}

/** The garden it goes for: the richest one somebody plays (net worth). */
function richest(game) {
  return game.ranking()[0]?.slot ?? null;
}

/**
 * Bring Big Chomp in now (also the debug hook: __app.game.spawnBoss()). opts {target: slot, x, z} pick its
 * victim and where it appears (default: the road gate). Returns the boss, or null (one is already here, or
 * nobody is playing).
 */
export function spawnBoss(game, { target = null, x = null, z = null } = {}) {
  if (game.boss || game.over) return null;
  const present = game.players.filter((p) => p.present);
  if (!present.length) return null;
  const slot = Number.isInteger(target) && game.players[target]?.present ? target : richest(game);
  if (slot == null) return null;
  const hp = BOSS.hp + BOSS.hpPerPlayer * present.length;
  const now = game.time;
  const b = {
    uid: game.newUid(), x: x ?? BOSS_DEN.x, z: z ?? BOSS_DEN.z, yaw: Math.PI, hp, max: hp, target: slot, slurped: 0,
    hits: game.players.map(() => 0), state: 'crawl', born: now, until: now + BOSS.life,
  };
  game.boss = b;
  game.nextBossAt = BOSS_NEVER; // the next one is planned when this one is gone
  bus.emit('boss:spawn', { x: b.x, z: b.z, hp, max: hp, victim: game.players[slot] });
  return b;
}

/** Every step (host / solo): the schedule, the crawl, the slurp and the timeout. */
export function updateBoss(game, dt) {
  const now = game.time;
  const deep = game._bossDeep;
  for (const p of game.players) {
    if (!p.present) continue;
    const bi = biomeIndexAtZ(p.pos.z);
    if (bi > deep[p.slot]) deep[p.slot] = bi;
  }
  const b = game.boss;
  if (!b) {
    if (now < game.nextBossAt) return;
    // a Showdown boss must be gone well before the buzzer
    if (game.match && game.match.endsAt - now < BOSS.life + BOSS.lastSecs) game.nextBossAt = BOSS_NEVER;
    else if (!spawnBoss(game)) game.nextBossAt = now + 30; // nobody to visit: look again later
    return;
  }
  if (b.state !== 'leave') {
    if (now >= b.until) {
      leave(game, b);
    } else if (!game.players[b.target]?.present) {
      // its victim left the room: go for the next richest garden instead
      const slot = richest(game);
      if (slot == null) leave(game, b);
      else {
        b.target = slot;
        b.state = 'crawl';
      }
    }
  }
  const to = b.state === 'leave' ? BOSS_DEN : bossPark(b.target);
  const dx = to.x - b.x, dz = to.z - b.z;
  const d = Math.hypot(dx, dz);
  if (b.state !== 'munch' && d > 0.05) {
    const k = Math.min(1, (BOSS.speed * (b.state === 'leave' ? BOSS.leaveSpeed : 1) * dt) / d);
    b.x += dx * k;
    b.z += dz * k;
    turn(b, Math.atan2(dx, dz), dt);
  }
  if (b.state === 'crawl' && d < 0.5) b.state = 'munch';
  if (b.state === 'munch') {
    // settle down along the fence and slurp the cash pile behind the gate (never banked cash, never plants;
    // nothing at all on Chill)
    turn(b, to.yaw, dt);
    const g = game.gardens[b.target];
    const rate = game.difficultyId === 'chill' ? 0 : BOSS.slurpRate;
    const room = BOSS.slurpCap * (g.cashPile + b.slurped) - b.slurped;
    const take = Math.min(g.cashPile * rate * dt, room, g.cashPile);
    if (take > 0) {
      g.cashPile -= take;
      b.slurped += take;
    }
  }
  if (b.state === 'leave' && (d < 0.5 || now >= b.until)) {
    game.boss = null; // back up the road with its tummy full
    scheduleNext(game);
  }
}

function turn(b, target, dt) {
  const d = wrapAngle(target - b.yaw);
  b.yaw = wrapAngle(b.yaw + clamp(d, -TURN * dt, TURN * dt));
}

// Time's up: a big burp, then it crawls back up the road with the cash it slurped.
function leave(game, b) {
  b.state = 'leave';
  b.until = game.time + 25; // gone by then, wherever it got to
  bus.emit('boss:leave', { x: b.x, z: b.z, slurped: b.slurped, victim: game.players[b.target] });
}

/**
 * `p` hit Big Chomp `n` times ('bonk' 1, a water balloon splash BOSS.splashHits). On Chill a bot's hit counts
 * BOSS.botHitChill, both on its hit points and on the bot's share. Returns the hits that counted (0: none).
 */
export function hitBoss(game, p, n, cause) {
  const b = game.boss;
  if (!b || b.state === 'leave' || !p?.present || !(n > 0)) return 0;
  const w = n * (p.kind === 'bot' && game.difficultyId === 'chill' ? BOSS.botHitChill : 1);
  b.hp = Math.max(0, b.hp - w);
  b.hits[p.slot] += w;
  bus.emit('boss:hit', { by: p, n: w, hp: b.hp, max: b.max, cause, x: b.x, z: b.z });
  if (b.hp <= 1e-6) defeat(game, b, p);
  return w;
}

/** Would p's noodle swing (facing fx, fz; Game._handleBonk) land on it? Its body must be within reach and in front
 *  of p. (The swing then counts as one hit, and it doesn't bonk empty-handed teammates standing by.) */
export function bonkBoss(game, p, fx, fz, cosHalf) {
  const b = game.boss;
  if (!b || b.state === 'leave' || !p.present || p.pos.y > 9) return false;
  bossNearest(b, p.pos.x, p.pos.z, NEAR);
  const dx = NEAR.x - p.pos.x, dz = NEAR.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > PLAYER.bonk.range + BOSS.reach) return false;
  return d <= BOSS.body.radius || (dx * fx + dz * fz) / d >= cosHalf;
}

/** A water balloon flying into its body pops there. */
export function balloonOnBoss(game, ball) {
  const b = game.boss;
  return !!b && b.state !== 'leave' && ball.y < BOSS.body.radius * 2.6 && bodyDist(b, ball.x, ball.z) < BOSS.body.radius + 1;
}

/** Is p standing by its body, in noodle reach? A balloon flying at it passes empty-handed teammates there by
 *  (Game._updateProjectiles), so it reaches the body instead of popping on the family bonking it. */
export function besideBoss(game, p) {
  const b = game.boss;
  return !!b && b.state !== 'leave' && p.pos.y <= 9 && bodyDist(b, p.pos.x, p.pos.z) <= PLAYER.bonk.range + BOSS.reach;
}

/** Would a balloon popping at `ball` splash its body? Then, like a swing at it, it spares empty-handed teammates. */
export function splashOnBoss(game, ball) {
  const b = game.boss;
  return !!b && b.state !== 'leave' && bodyDist(b, ball.x, ball.z) <= ITEM.balloon.radius + BOSS.body.radius * 0.5;
}

/** A balloon popped at `ball` (from Game._updateProjectiles): a splash on its body is BOSS.splashHits hits. */
export function splashBoss(game, ball, owner) {
  if (!owner || !splashOnBoss(game, ball)) return false;
  return hitBoss(game, owner, BOSS.splashHits, 'balloon') > 0;
}

// POP! Refund the slurp, a burst of mutated seeds, the pot split by hits and a crown for the top bonker.
function defeat(game, b, last) {
  const now = game.time;
  game.boss = null;
  scheduleNext(game);
  const victim = game.players[b.target];
  game.gardens[b.target].cashPile += b.slurped;
  // seeds from the deepest biome any player in the world has reached, all of them Gold, Diamond or Rainbow
  const rng = game.rng;
  let deep = 0;
  for (const p of game.players) if (p.present) deep = Math.max(deep, game._bossDeep[p.slot]);
  const n = rng.int(BOSS.seeds[0], BOSS.seeds[1]);
  for (let i = 0; i < n; i++) {
    const seed = game.rollSeed(deep);
    let r = rng.next();
    let mutation = 'gold';
    for (const [id, w] of Object.entries(BOSS.seedMutations)) {
      mutation = id;
      if ((r -= w) < 0) break;
    }
    const at = scatter(game, b, i, n);
    game.ground.push({
      uid: game.newUid(), kind: 'seed', speciesId: seed.speciesId, mutation, podId: null, lucky: seed.lucky,
      x: at.x, y: 0, z: at.z, expiresAt: now + BOSS.seedLife, droppedAt: now,
    });
  }
  // the pot: BOSS.potSecs of everyone's income, shared out by hits (the remainder goes to the top bonker)
  let income = 0;
  for (const p of game.players) if (p.present) income += game.gardenIncome(game.gardens[p.slot]);
  const pot = Math.round(BOSS.potSecs * income);
  const shares = game.players.map(() => 0);
  let top = null;
  const total = game.players.reduce((s, p) => s + (p.present ? b.hits[p.slot] : 0), 0);
  if (total > 0) {
    for (const p of game.players) {
      const h = p.present ? b.hits[p.slot] : 0;
      if (!(h > 0)) continue;
      shares[p.slot] = Math.floor((pot * h) / total);
      // ties go to a person over a computer player
      if (!top || h > b.hits[top.slot] || (h === b.hits[top.slot] && p.isPlayer && !top.isPlayer)) top = p;
    }
    shares[top.slot] += pot - shares.reduce((s, v) => s + v, 0);
    for (const p of game.players) p.cash += shares[p.slot];
    top.crownUntil = now + BOSS.crown;
  }
  bus.emit('boss:defeated', { x: b.x, z: b.z, by: last, top, pot, shares, seeds: n, refund: b.slurped, victim });
}

// Seed i of n: a ring round where it burst, kept on the walkable aisle / road and off solid props.
function scatter(game, b, i, n) {
  const rng = game.rng;
  const onRoad = b.z > LAYOUT.roadGate.z;
  const halfX = onRoad ? WORLD.road.width / 2 - 2 : 26;
  // spread out from a little way into the aisle (it bursts by a fence)
  const cx = clamp(b.x, 8 - halfX, halfX - 8);
  let x = cx, z = b.z;
  for (let tries = 0; tries < 6; tries++) {
    const a = ((i + rng.next() * 0.8) / n) * Math.PI * 2;
    const r = rng.range(3, 9);
    x = clamp(cx + Math.sin(a) * r, -halfX, halfX);
    z = clamp(b.z + Math.cos(a) * r, onRoad ? LAYOUT.roadGate.z + 2 : WORLD.homeMinZ + 8, onRoad ? ROAD_END_Z - 4 : LAYOUT.roadGate.z - 2);
    if (!game.physics.query(x - 1, x + 1, z - 1, z + 1).some((c) => !c.off && c.maxY > 0.8)) break;
  }
  return { x, z };
}

/** A garden changes hands (Game.setSlot): its hits and crown stay with whoever left (their garden took the slurp
 *  along, see serializeSlot). */
export function bossSlot(game, slot) {
  game.players[slot].crownUntil = 0;
  game._bossDeep[slot] = -1;
  const b = game.boss;
  if (!b) return;
  b.hits[slot] = 0;
  if (b.target === slot) b.slurped = 0;
}

/** What the boss looks like in Game.serializeFull (null: none). */
export const bossState = (b) => (b ? { ...b, hits: [...b.hits] } : null);

/** Adopt the boss from a full state (Game.applyFull). Keeps the same object while it's the same boss (views hold it). */
export function applyBoss(game, s) {
  if (Number.isFinite(s.nextBossAt)) game.nextBossAt = s.nextBossAt;
  const d = s.boss;
  if (!d || typeof d !== 'object' || !BOSS_STATES.includes(d.state)) {
    game.boss = null;
    return;
  }
  const b = game.boss && game.boss.uid === d.uid ? game.boss : {};
  Object.assign(b, d, { hits: game.players.map((_, i) => (Array.isArray(d.hits) && Number.isFinite(d.hits[i]) ? d.hits[i] : 0)) });
  game.boss = b;
}
