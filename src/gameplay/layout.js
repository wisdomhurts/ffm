// The single source of truth for where everything is. Pure data derived from config.
// Gameplay, AI, physics and the world art all read positions from here.
import { WORLD, BIOMES, PODS, ROAD_END_Z, PLANTERS, LOTS } from '../config.js';

const G = WORLD.garden;
const ROAD = WORLD.road;

// Planter columns, measured from the gate into the garden: the garden's own two columns, then one column
// per lot (LOTS). Rows run along z, 8 studs apart; each planter box is 4.8 x 4.8.
const COL_D = [22.5, 30.5];
for (let k = 0; k < LOTS.count; k++) COL_D.push(38.5 + k * 8);
const ROWS = 5;

function gardenLayout(slot) {
  const c = WORLD.gardenCenters[slot];
  const west = c.x < 0;
  const minX = c.x - G.w / 2;
  const maxX = c.x + G.w / 2;
  const minZ = c.z - G.d / 2;
  const maxZ = c.z + G.d / 2;
  // Gate is on the wall facing the aisle (x = 0).
  const gateX = west ? maxX : minX;
  const gateHalf = 6;
  const inward = west ? -1 : 1; // direction from gate into the garden along x
  const at = (d) => gateX + inward * d; // x of a point d studs in from the gate
  // Planters 0-9: 2 columns x 5 rows (index = row * 2 + column). Then each lot: one column of 5 (lot k = planters
  // 10 + 5k .. 14 + 5k).
  const planters = [];
  for (let i = 0; i < PLANTERS.base; i++) planters.push({ index: i, x: at(COL_D[i % 2]), z: c.z - 16 + Math.floor(i / 2) * 8, lot: -1 });
  for (let k = 0; k < LOTS.count; k++) {
    for (let r = 0; r < ROWS; r++) planters.push({ index: planters.length, x: at(COL_D[2 + k]), z: c.z - 16 + r * 8, lot: k });
  }
  // The FOR SALE lots: x span (edge = the side facing the gate, where its rope line runs) and its middle row.
  const lots = [];
  for (let k = 0; k < LOTS.count; k++) {
    const d0 = COL_D[2 + k] - 4, d1 = k === LOTS.count - 1 ? G.w : COL_D[3 + k] - 4;
    lots.push({ index: k, edgeX: at(d0), farX: at(d1), x: at(COL_D[2 + k]), z: c.z, minZ: minZ + 1.5, maxZ: maxZ - 1.5 });
  }
  return {
    slot,
    center: { x: c.x, z: c.z },
    bounds: { minX, maxX, minZ, maxZ },
    west,
    inward,
    gate: { x: gateX, z: c.z, half: gateHalf, minZ: c.z - gateHalf, maxZ: c.z + gateHalf },
    // laser span across the gate opening
    laser: { x1: gateX, z1: c.z - gateHalf, x2: gateX, z2: c.z + gateHalf },
    planters,
    lots,
    collectPad: { x: gateX + inward * 4, z: c.z + (c.z < 0 ? 12 : -12), r: 2.6 },
    lockPad: { x: gateX + inward * 4, z: c.z + (c.z < 0 ? -12 : 12), r: 2.2 },
    sign: { x: gateX, z: c.z + gateHalf + 2.5 },
    // A point just outside the gate on the aisle side (useful for AI).
    outside: { x: gateX - inward * 6, z: c.z },
    inside: { x: gateX + inward * 5, z: c.z },
    // ---- the front yard (between the gate and the first planter column), used by base levels (BASE):
    // the BASE console (upgrade + Base Studio), the Guard Gnome's post, the home treadmill (run along
    // `dir`, the belt carries you back towards the gate) and six decoration spots (5x5 each, opened in
    // order by BASE.decorAt). dz is measured from the garden's centre line.
    console: { x: at(3.2), z: c.z + 7.6, r: 2.6 },
    guard: { x: at(16.5), z: c.z - 8.5 },
    treadmill: { x: at(15.5), z: c.z + 8.5, dirX: inward, dirZ: 0, len: 6.4, w: 2.9 },
    decor: [
      { index: 0, x: at(9.5), z: c.z - 16.5 },
      { index: 1, x: at(9.5), z: c.z + 16.5 },
      { index: 2, x: at(16), z: c.z - 16.5 },
      { index: 3, x: at(16), z: c.z + 16.5 },
      { index: 4, x: at(9.5), z: c.z - 8 },
      { index: 5, x: at(9.5), z: c.z + 8 },
    ],
  };
}

/** A treadmill's belt as a box ({minX, maxX, minZ, maxZ}) plus the unit direction you run (dir) and the
 *  console end. `t` = {x, z, dirX, dirZ, len, w}. The belt carries you along -dir. */
export function beltRect(t) {
  const hx = Math.abs(t.dirX) * t.len / 2 + Math.abs(t.dirZ) * t.w / 2;
  const hz = Math.abs(t.dirZ) * t.len / 2 + Math.abs(t.dirX) * t.w / 2;
  return { minX: t.x - hx, maxX: t.x + hx, minZ: t.z - hz, maxZ: t.z + hz, dirX: t.dirX, dirZ: t.dirZ };
}

function podLayout() {
  const pods = [];
  let id = 0;
  BIOMES.forEach((b, bi) => {
    const z0 = ROAD.startZ + bi * ROAD.biomeLength;
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? -ROAD.width / 2 + 3.2 : ROAD.width / 2 - 3.2;
      for (let k = 0; k < PODS.perSide; k++) {
        const spacing = ROAD.biomeLength / PODS.perSide;
        const z = z0 + spacing * (k + 0.5) + (side === 0 ? -spacing * 0.25 : spacing * 0.25);
        pods.push({ id: id++, biome: bi, side, x, z });
      }
    }
  });
  return pods;
}

// Static colliders: axis-aligned boxes {minX,maxX,minY,maxY,minZ,maxZ, tag}
function staticColliders(gardens) {
  const boxes = [];
  const box = (minX, maxX, minZ, maxZ, maxY = 8, minY = 0, tag = 'wall') =>
    boxes.push({ minX, maxX, minY, maxY, minZ, maxZ, tag });
  const T = 1; // wall thickness
  // Home area boundary: x in [-96,96], z in [-66,60], open to the road at x in [-20,20].
  const H = { minX: -WORLD.homeHalfW, maxX: WORLD.homeHalfW, minZ: WORLD.homeMinZ, maxZ: ROAD.startZ };
  const WALL_H = 60; // invisible; no prop + jump may clear it
  box(H.minX - T, H.minX, H.minZ, H.maxZ, WALL_H);
  box(H.maxX, H.maxX + T, H.minZ, H.maxZ, WALL_H);
  box(H.minX, H.maxX, H.minZ - T, H.minZ, WALL_H);
  box(H.minX, -ROAD.width / 2, H.maxZ, H.maxZ + T, WALL_H);
  box(ROAD.width / 2, H.maxX, H.maxZ, H.maxZ + T, WALL_H);
  // Road walls and end cap.
  box(-ROAD.width / 2 - 4, -ROAD.width / 2, ROAD.startZ, ROAD_END_Z, 30, 0, 'cliff');
  box(ROAD.width / 2, ROAD.width / 2 + 4, ROAD.startZ, ROAD_END_Z, 30, 0, 'cliff');
  box(-ROAD.width / 2, ROAD.width / 2, ROAD_END_Z, ROAD_END_Z + 4, 30, 0, 'cliff');
  // Garden fences (with gate gap) — fences you cannot jump over.
  for (const g of gardens) {
    const b = g.bounds;
    const F = 0.6;
    const fenceH = 30; // collider only (the art is ~6-9 tall): props beside fences must never let you hop over
    // outer (non-gate) x wall
    const outerX = g.west ? b.minX : b.maxX;
    box(outerX - F / 2, outerX + F / 2, b.minZ, b.maxZ, fenceH, 0, 'fence');
    // z walls
    box(b.minX, b.maxX, b.minZ - F / 2, b.minZ + F / 2, fenceH, 0, 'fence');
    box(b.minX, b.maxX, b.maxZ - F / 2, b.maxZ + F / 2, fenceH, 0, 'fence');
    // gate wall with gap
    box(g.gate.x - F / 2, g.gate.x + F / 2, b.minZ, g.gate.minZ, fenceH, 0, 'fence');
    box(g.gate.x - F / 2, g.gate.x + F / 2, g.gate.maxZ, b.maxZ, fenceH, 0, 'fence');
    // planter boxes: low (you can hop onto them). A lot's planters only exist once it is bought (Game.lotBoxes).
    for (const p of g.planters) if (p.lot < 0) box(p.x - 2.4, p.x + 2.4, p.z - 2.4, p.z + 2.4, 1.2, 0, 'planter');
  }
  // the follow camera collides with fences only up to their visual height
  for (const b of boxes) if (b.tag === 'fence') b.camMaxY = 6.6;
  // Shop counters
  // counters are solid up to the awning so nobody hops behind them
  box(-36, -24, -66, -57, 9, 0, 'shop');
  box(24, 36, -66, -57, 9, 0, 'shop');
  // pet egg stand (west end of the shop row) and the wardrobe boutique (east end)
  box(-72, -48, -66, -59, 9, 0, 'shop');
  box(48, 60, -66, -59, 9, 0, 'shop');
  for (const b of boxes) if (b.tag === 'shop') b.camMaxY = 4.2;
  // the Speed Shop's three treadmills: decks you step onto (belt top 0.55) and the consoles at their south end
  for (let i = -1; i <= 1; i++) {
    const x = WORLD.shops.speed.x + i * 7;
    box(x - 1.8, x + 1.8, -60.2, -53.2, 0.55, 0, 'deco');
    box(x - 1.8, x + 1.8, -61.0, -59.7, 7.4, 0, 'deco');
  }
  return boxes;
}

export function buildLayout() {
  const gardens = [0, 1, 2, 3].map(gardenLayout);
  const pods = podLayout();
  return {
    gardens,
    pods,
    colliders: staticColliders(gardens),
    shops: {
      gear: { x: WORLD.shops.gear.x, z: WORLD.shops.gear.z, r: 7 },
      speed: { x: WORLD.shops.speed.x, z: WORLD.shops.speed.z, r: 7 },
      rebirth: { x: WORLD.shops.rebirth.x, z: WORLD.shops.rebirth.z, r: 7 },
      pets: { x: WORLD.shops.pets.x, z: WORLD.shops.pets.z, r: 7 },
      wardrobe: { x: WORLD.shops.wardrobe.x, z: WORLD.shops.wardrobe.z, r: 7 },
    },
    // The Speed Shop's three treadmills (west to east): Boost Lab, Speed, Warm-Up. You run south (towards
    // the consoles); the belts carry you north. Belt area x +-1.45 around each x, z from -59.6 to -53.2.
    speedStations: ['boost', 'speed', 'warmup'].map((id, i) => ({
      id, x: WORLD.shops.speed.x + (i - 1) * 7, z: -56.4, dirX: 0, dirZ: -1, len: 6.4, w: 2.9,
    })),
    spawn: { x: WORLD.spawn.x, z: WORLD.spawn.z },
    roadGate: { x: 0, z: ROAD.startZ },
    roadEndZ: ROAD_END_Z,
    biomeRanges: BIOMES.map((b, i) => ({
      index: i,
      id: b.id,
      minZ: ROAD.startZ + i * ROAD.biomeLength,
      maxZ: ROAD.startZ + (i + 1) * ROAD.biomeLength,
    })),
  };
}

export const LAYOUT = buildLayout();

/** Collider boxes of garden `L`'s lot `k` planters (fresh objects: each Game switches its own on and off). */
export function lotPlanterBoxes(L, k) {
  return L.planters.filter((p) => p.lot === k).map((p) => ({ minX: p.x - 2.4, maxX: p.x + 2.4, minY: 0, maxY: 1.2, minZ: p.z - 2.4, maxZ: p.z + 2.4, tag: 'planter', off: true }));
}

export function gardenContains(g, x, z, pad = 0) {
  const b = g.bounds;
  return x > b.minX + pad && x < b.maxX - pad && z > b.minZ + pad && z < b.maxZ - pad;
}
