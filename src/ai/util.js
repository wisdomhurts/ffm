// Small helpers shared by the bot brain and its goals (distances, speeds, garden summaries, spots).
import { PLANT, RARITY, MUTATIONS, BIOMES, PLAYER, REBIRTH, NAMESAKE_BONUS, speedAt } from '../config.js';
import { LAYOUT, gardenContains } from '../gameplay/layout.js';
import { FREE, getNav } from './nav.js';

export const hyp = Math.hypot;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const ROAD_Z = LAYOUT.roadGate.z;
const SPOT_D = 3.85; // stand this far from a planter centre (box half 2.4 + body radius 1.4 + a hair)

export function tierOf(speciesId) {
  return RARITY[PLANT[speciesId].rarity].tier;
}

/** Income per second a plant/seed would make for player p. */
export function seedIncome(p, speciesId, mutation) {
  const sp = PLANT[speciesId];
  let v = sp.income * MUTATIONS[mutation].mult * REBIRTH.incomeMult(p.rebirths);
  if (sp.family && sp.family === p.id) v *= NAMESAKE_BONUS;
  return v;
}

export function runSpeed(game, p) {
  return speedAt(p.speedLevel, p.rebirths) * (p.isHuman ? 1 : game.difficulty.botSpeedMult);
}

export function carrySeedSpeed(game, p) {
  return runSpeed(game, p) * PLAYER.carrySeedMult;
}

export function carryPlantSpeed(game, p) {
  return runSpeed(game, p) * PLAYER.carryPlantMult;
}

/** Which garden slot contains (x,z), or -1. */
export function gardenSlotAt(x, z, pad = 0) {
  for (const g of LAYOUT.gardens) if (gardenContains(g, x, z, pad)) return g.slot;
  return -1;
}

/** Rough walking distance between two points, going through garden gates and the road gate. */
export function approxDist(ax, az, bx, bz) {
  const ga = gardenSlotAt(ax, az), gb = gardenSlotAt(bx, bz);
  let d = 0;
  let x = ax, z = az;
  let ex = bx, ez = bz, tail = 0;
  if (ga >= 0 && ga !== gb) {
    const o = LAYOUT.gardens[ga].outside;
    d += hyp(o.x - x, o.z - z);
    x = o.x;
    z = o.z;
  }
  if (gb >= 0 && ga !== gb) {
    const o = LAYOUT.gardens[gb].outside;
    tail = hyp(o.x - bx, o.z - bz);
    ex = o.x;
    ez = o.z;
  }
  const ra = z >= ROAD_Z, rb = ez >= ROAD_Z;
  if (ra !== rb) d += hyp(x, z - ROAD_Z) + hyp(ex, ez - ROAD_Z);
  else d += hyp(ex - x, ez - z);
  return d + tail;
}

/**
 * Summary of a garden from the point of view of its owner.
 * free: empty unlocked planters; weakest: lowest-income grown plant (sellable); nextLocked: index or -1.
 */
export function gardenInfo(game, slot) {
  const g = game.gardens[slot];
  const owner = g.owner;
  const info = { g, free: 0, planted: 0, grown: 0, income: 0, weakest: null, weakestInc: Infinity, best: null, bestInc: 0, growing: null, nextLocked: -1, unlocked: 0 };
  for (const pl of g.planters) {
    if (!pl.unlocked) {
      if (info.nextLocked < 0) info.nextLocked = pl.index;
      continue;
    }
    info.unlocked++;
    if (!pl.plant) {
      info.free++;
      continue;
    }
    info.planted++;
    const inc = game.plantIncome(pl.plant, owner);
    if (pl.plant.growLeft <= 0) {
      info.grown++;
      info.income += inc;
      if (inc < info.weakestInc) {
        info.weakestInc = inc;
        info.weakest = pl;
      }
    } else if (!info.growing || inc * pl.plant.growLeft > info.growingScore) {
      info.growing = pl;
      info.growingScore = inc * pl.plant.growLeft;
    }
    if (inc > info.bestInc) {
      info.bestInc = inc;
      info.best = pl;
    }
  }
  if (!info.weakest) info.weakestInc = 0;
  return info;
}

/**
 * Where to stand to interact with a planter: one of its four sides, on free ground, where no other
 * interactable planter is as close. Returns {x, z, cx, cz} (cx/cz = planter centre) or null.
 */
export function planterSpot(game, g, pl, fromX, fromZ, isInteractable) {
  const nav = getNav(game);
  let best = null, bs = Infinity;
  const sides = [[SPOT_D, 0], [-SPOT_D, 0], [0, SPOT_D], [0, -SPOT_D]];
  for (const [ox, oz] of sides) {
    const x = pl.x + ox, z = pl.z + oz;
    if (nav.cellAt(x, z) !== FREE) continue;
    if (!gardenContains(g.L, x, z, 1.2)) continue;
    let clash = false;
    // standing pressed against the box puts us 3.8 from its centre; neighbours are >= 4.2 away
    const sx = pl.x + ox * (3.8 / SPOT_D), sz = pl.z + oz * (3.8 / SPOT_D);
    for (const q of g.planters) {
      if (q === pl || !isInteractable(q)) continue;
      if (hyp(q.x - sx, q.z - sz) < 4.1) clash = true;
    }
    const s = hyp(x - fromX, z - fromZ) + (clash ? 40 : 0) + hyp(x - g.L.inside.x, z - g.L.inside.z) * 0.5;
    if (s < bs) {
      bs = s;
      best = { x, z, cx: pl.x, cz: pl.z };
    }
  }
  return best;
}

/** Where to stand to grab a road pod (a little towards the road centre). */
export function podSpot(pod) {
  return { x: pod.x - Math.sign(pod.x) * 2.4, z: pod.z };
}

/**
 * Probability a seed run in `biome` ends with the seed at home, from our carry speed vs the biome's
 * monster speed. Above the personality's comfort ratio it is near-certain; below it drops fast.
 */
export function runSafety(game, p, biome, riskNeed, withCoil = false) {
  const m = BIOMES[biome]?.monster;
  if (!m) return 1;
  // a coil lasts 15 s: it covers the dangerous first stretch of the run, not the whole way home
  const s = carrySeedSpeed(game, p) * (withCoil ? 1.15 : 1);
  const ratio = s / m.speed;
  if (ratio >= riskNeed) return Math.min(0.98, 0.85 + (ratio - riskNeed) * 1.5);
  return 0.85 * Math.exp(-(riskNeed - ratio) * 9);
}

/** Monsters of the pod's biome, near the pod, that a seed carrier could not simply outrun. */
export function podGuards(game, p, pod, carrySpeed) {
  let n = 0;
  const now = game.time;
  for (const m of game.monsters) {
    if (m.biome !== pod.biome || now < m.stunUntil - 0.5) continue;
    if (m.def.speed < carrySpeed * 0.9) continue;
    if (hyp(m.x - pod.x, m.z - pod.z) < m.def.aggro + 10) n++;
  }
  return n;
}

export function yawTo(fx, fz, tx, tz) {
  return Math.atan2(tx - fx, tz - fz);
}

/** Yaw that makes a thrown water balloon (speed 55, inherits 30% of our velocity) land on q. */
export function balloonYaw(p, q, speed = 55) {
  let tx = q.pos.x, tz = q.pos.z;
  for (let i = 0; i < 2; i++) {
    const t = hyp(tx - p.pos.x, tz - p.pos.z) / speed;
    tx = q.pos.x + q.vel.x * t;
    tz = q.pos.z + q.vel.z * t;
  }
  let ax = tx - p.pos.x, az = tz - p.pos.z;
  const d = hyp(ax, az) || 1;
  ax = (ax / d) * speed - p.vel.x * 0.3;
  az = (az / d) * speed - p.vel.z * 0.3;
  return Math.atan2(ax, az);
}

export function inGarden(p, slot) {
  return gardenContains(LAYOUT.gardens[slot], p.pos.x, p.pos.z);
}
