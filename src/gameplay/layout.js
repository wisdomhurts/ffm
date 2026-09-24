// The single source of truth for where everything is. Pure data derived from config.
// Gameplay, AI, physics and the world art all read positions from here.
import { WORLD, BIOMES, PODS, ROAD_END_Z } from '../config.js';

const G = WORLD.garden;
const ROAD = WORLD.road;

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
  // Planters: 2 columns x 5 rows, columns parallel to z.
  const planters = [];
  const colX = [c.x + inward * 4.5, c.x + inward * 12.5];
  for (let i = 0; i < WORLD.planterCount; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    planters.push({ index: i, x: colX[col], z: c.z - 16 + row * 8 });
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
    collectPad: { x: gateX + inward * 4, z: c.z + (c.z < 0 ? 12 : -12), r: 2.6 },
    lockPad: { x: gateX + inward * 4, z: c.z + (c.z < 0 ? -12 : 12), r: 2.2 },
    sign: { x: gateX, z: c.z + gateHalf + 2.5 },
    // A point just outside the gate on the aisle side (useful for AI).
    outside: { x: gateX - inward * 6, z: c.z },
    inside: { x: gateX + inward * 5, z: c.z },
  };
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
  // Home area boundary: x in [-72,72], z in [-66,60], open to the road at x in [-20,20].
  const H = { minX: -72, maxX: 72, minZ: -66, maxZ: 60 };
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
    // planter boxes: low (you can hop onto them)
    for (const p of g.planters) box(p.x - 2.4, p.x + 2.4, p.z - 2.4, p.z + 2.4, 1.2, 0, 'planter');
  }
  // Shop counters
  box(-36, -24, -60, -57, 4, 0, 'shop');
  box(24, 36, -60, -57, 4, 0, 'shop');
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
    },
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

export function gardenContains(g, x, z, pad = 0) {
  const b = g.bounds;
  return x > b.minX + pad && x < b.maxX - pad && z > b.minZ + pad && z < b.maxZ - pad;
}
