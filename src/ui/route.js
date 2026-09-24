// Guidance routing for the HUD arrows (tutorial, "Bring it HOME", "STOP thief").
// Garden fences only open at their gate and the plaza meets the Seed Road only under the arch, so an
// arrow that points straight at a target can pin a kid against a fence. guidePoint() returns the next
// waypoint of a short route instead (plus the route length, which is what the HUD shows as distance).
//
//   guidePoint(pos, target, boxes?) -> {x, z, dist, direct}
//   route(pos, target, boxes?)      -> [{x, z}, ...] (next waypoint first, target last) or null
//     boxes: physics boxes to route around (default LAYOUT.colliders; pass game.physics.boxes to include
//     the world's props too).
//
// It is a tiny visibility graph: waypoints at every garden gate (inside, then outside), in the road arch,
// down the central aisle and along the plaza corridors; a straight line wins whenever nothing solid is in
// the way. Every obstacle has a hard pad (just under the player radius: a line through it would hit
// something) and a comfort pad: lines through that are allowed but cost extra, so routes keep well clear
// of posts and corners that a kid steering with 8-way keys would clip. Near the player (and the target)
// only the hard pads count, so the arrow never flips back to a detour over a hair's width.
import { LAYOUT } from '../gameplay/layout.js';

const PAD = 3.6; // comfort clearance
const PAD_HARD = 1.3; // a player's centre never gets this close to a box (radius 1.4)
const PAD_HUG = 5.5; // this close to an obstacle, only its hard pad counts
const NEAR_COST = 14; // extra "studs" for a leg that cuts through a comfort pad
const ARCH_HALF = 14; // plaza <-> road trips go through the middle of the arch
const SKIP_NEAR = 2.5; // standing on a waypoint: aim at the one after it

const cache = new WeakMap();
let defaultPrep = null;

// Obstacle = [comfort minX, maxX, minZ, maxZ, hard ..., hug ...]; `zPad` 0 makes a thin virtual line
const pad = (minX, maxX, minZ, maxZ, zPad = 1) => [minX - PAD, maxX + PAD, minZ - PAD * zPad, maxZ + PAD * zPad,
  minX - PAD_HARD, maxX + PAD_HARD, minZ - PAD_HARD * zPad, maxZ + PAD_HARD * zPad, minX - PAD_HUG, maxX + PAD_HUG, minZ - PAD_HUG * zPad, maxZ + PAD_HUG * zPad];

function obstacleOf(b) {
  // walkable ledges, overhead parts, hop-able planters and gate lasers don't block a route
  if (b.maxY <= 0.75 || b.minY >= 4 || b.tag === 'planter' || b.tag === 'laser') return null;
  return pad(b.minX, b.maxX, b.minZ, b.maxZ);
}

const inside = (o, x, z, i = 0) => x > o[i] && x < o[i + 1] && z > o[i + 2] && z < o[i + 3];

// Segment a->b against box o[i..i+3] (slab test, touching doesn't count).
function hits(o, i, ax, az, dx, dz) {
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax <= o[i] || ax >= o[i + 1]) return false;
  } else {
    let u = (o[i] - ax) / dx, v = (o[i + 1] - ax) / dx;
    if (u > v) [u, v] = [v, u];
    if (u > t0) t0 = u;
    if (v < t1) t1 = v;
    if (t0 >= t1) return false;
  }
  if (Math.abs(dz) < 1e-9) return az > o[i + 2] && az < o[i + 3];
  let u = (o[i + 2] - az) / dz, v = (o[i + 3] - az) / dz;
  if (u > v) [u, v] = [v, u];
  if (u > t0) t0 = u;
  if (v < t1) t1 = v;
  return t0 < t1;
}

/**
 * Cost of walking straight from a to b: -1 when something solid is in the way, else the length
 * (+ NEAR_COST if it cuts a comfort pad). Obstacles close to either end (the player's spot, the target,
 * a waypoint) only count with their hard pad, and not at all if that end is inside even that.
 */
function legCost(obs, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
  let near = false;
  for (let k = 0; k < obs.length; k++) {
    const o = obs[k];
    if (o[1] <= minX || o[0] >= maxX || o[3] <= minZ || o[2] >= maxZ) continue;
    if (inside(o, ax, az, 4) || inside(o, bx, bz, 4)) continue;
    if (hits(o, 4, ax, az, dx, dz)) return -1;
    if (!near && !inside(o, ax, az, 8) && !inside(o, bx, bz, 8) && hits(o, 0, ax, az, dx, dz)) near = true;
  }
  return Math.hypot(dx, dz) + (near ? NEAR_COST : 0);
}

function prepare(boxes) {
  const L = LAYOUT;
  const obs = [];
  for (const b of boxes) {
    const o = obstacleOf(b);
    if (o) obs.push(o);
  }
  // The slit between two gardens on the same side is too narrow to run through: treat it as solid.
  for (const a of L.gardens) {
    for (const b of L.gardens) {
      if (a === b || a.west !== b.west || a.bounds.maxZ > b.bounds.minZ || b.bounds.minZ - a.bounds.maxZ > 8) continue;
      obs.push(pad(Math.min(a.bounds.minX, b.bounds.minX), Math.max(a.bounds.maxX, b.bounds.maxX), a.bounds.maxZ, b.bounds.minZ));
    }
  }
  // Funnel plaza <-> road crossings through the middle of the arch (its corners snag): a thin virtual
  // line across the arch's sides, so it only matters to legs that cross z = gz.
  const gz = L.roadGate.z;
  obs.push(pad(ARCH_HALF, 30, gz - 0.05, gz + 0.05, 0), pad(-30, -ARCH_HALF, gz - 0.05, gz + 0.05, 0));

  const cand = [];
  for (const g of L.gardens) cand.push(g.inside, g.outside);
  for (const x of [-9, 0, 9]) cand.push({ x, z: gz });
  for (const x of [-14, 0, 14]) for (const z of [-40, -24, -8, 8, 24, 40]) cand.push({ x, z });
  for (const s of [-1, 1]) for (const x of [24, 36, 48, 60, 69]) cand.push({ x: s * x, z: 52 }, { x: s * x, z: -51.5 });
  // waypoints must stand in the open (a garden's own gate nodes are always kept)
  const nodes = cand.filter((n, i) => i < 8 || !obs.some((o) => inside(o, n.x, n.z, 4))).map((n) => ({ x: n.x, z: n.z }));
  const N = nodes.length;
  const edge = new Float64Array(N * N).fill(-1);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = nodes[i], b = nodes[j];
      edge[i * N + j] = edge[j * N + i] = legCost(obs, a.x, a.z, b.x, b.z);
    }
  }
  return { obs, nodes, edge, N, cost: new Float64Array(N + 2), prev: new Int32Array(N + 2), done: new Uint8Array(N + 2), fromS: new Float64Array(N), toG: new Float64Array(N) };
}

function prepFor(boxes) {
  if (!boxes || boxes === LAYOUT.colliders) return defaultPrep || (defaultPrep = prepare(LAYOUT.colliders));
  let p = cache.get(boxes);
  if (!p || p.count !== boxes.length) {
    // physics boxes can grow (addBoxes): rebuild when the count changes
    p = prepare(boxes);
    p.count = boxes.length;
    cache.set(boxes, p);
  }
  return p;
}

/** Route from pos to target: [next waypoint, ..., target], or null when boxed in. */
export function route(pos, target, boxes) {
  const { obs, nodes, edge, N, cost, prev, done, fromS, toG } = prepFor(boxes);
  const S = { x: pos.x, z: pos.z }, G = { x: target.x, z: target.z };
  const direct = legCost(obs, S.x, S.z, G.x, G.z);
  if (direct >= 0 && direct < Math.hypot(G.x - S.x, G.z - S.z) + 1e-6) return [G]; // clear line
  for (let i = 0; i < N; i++) {
    fromS[i] = legCost(obs, S.x, S.z, nodes[i].x, nodes[i].z);
    toG[i] = legCost(obs, nodes[i].x, nodes[i].z, G.x, G.z);
  }
  // Dijkstra: S = N, G = N + 1
  cost.fill(Infinity);
  prev.fill(-1);
  done.fill(0);
  if (direct >= 0) {
    cost[N + 1] = direct;
    prev[N + 1] = N;
  }
  for (let i = 0; i < N; i++) {
    if (fromS[i] >= 0) {
      cost[i] = fromS[i];
      prev[i] = N;
    }
  }
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i <= N + 1; i++) {
      if (i !== N && !done[i] && cost[i] < best) {
        best = cost[i];
        u = i;
      }
    }
    if (u < 0 || u === N + 1) break;
    done[u] = 1;
    for (let j = 0; j < N; j++) {
      const w = edge[u * N + j];
      if (w >= 0 && !done[j] && best + w < cost[j]) {
        cost[j] = best + w;
        prev[j] = u;
      }
    }
    if (toG[u] >= 0 && best + toG[u] < cost[N + 1]) {
      cost[N + 1] = best + toG[u];
      prev[N + 1] = u;
    }
  }
  if (prev[N + 1] < 0) return null;
  const out = [G];
  for (let u = prev[N + 1]; u !== N && u >= 0; u = prev[u]) out.unshift(nodes[u]);
  return out;
}

/**
 * Where should a guidance arrow point to get from `pos` to `target`?
 * {x, z}: the next waypoint; dist: the walking distance to the REAL target; direct: waypoint === target.
 */
export function guidePoint(pos, target, boxes) {
  const path = route(pos, target, boxes);
  if (!path) return { x: target.x, z: target.z, dist: Math.hypot(target.x - pos.x, target.z - pos.z), direct: true };
  let d = 0;
  let px = pos.x, pz = pos.z;
  for (const p of path) {
    d += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  const i = path.length > 1 && Math.hypot(path[0].x - pos.x, path[0].z - pos.z) < SKIP_NEAR ? 1 : 0;
  return { x: path[i].x, z: path[i].z, dist: d, direct: i === path.length - 1 };
}
