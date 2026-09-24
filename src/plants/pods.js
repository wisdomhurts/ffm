// Road seed stands (one style per biome) and the terracotta pot used for carried plants.
// Built once per biome with the same Builder as the plants (one merged, vertex-coloured mesh each).
import * as THREE from 'three';
import { Builder, P, latheGeo, tubeGeo, cachedGeo, TAU } from './geometry.js';
import { shade } from './materials.js';
import { hash, fm } from './species.js';

const PI = Math.PI;
const cache = new Map();

function rock(b, p, s, c, seed, o = {}) {
  b.add(P.blob(seed, 0.2, 0), { p, s: [s, s * 0.7, s], r: [0, seed, 0], c, c2: shade(c, 0.12), gy: [-1, 1], ...o });
}

function flower(b, p, s, petal, center = '#ffd23f', tilt = 0.5, yaw = 0) {
  b.frame(fm(p, tilt, yaw, 0, s));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    b.add(P.sphere(5, 3), { p: [Math.sin(a) * 0.16, 0, Math.cos(a) * 0.16], s: [0.12, 0.04, 0.12], c: petal });
  }
  b.add(P.sphere(5, 3), { p: [0, 0.02, 0], s: [0.08, 0.05, 0.08], c: center });
  b.frame(null);
}

// Each builder returns {seedY, topY}: where the seed floats and the stand's top surface.
const STANDS = [
  // 0 Sunny Field: wooden crate with a straw nest and daisies
  (b) => {
    const W = 1.9, H = 1.05;
    const wood = '#d39a55', dark = '#9c6431';
    b.add(P.box(), { p: [0, H / 2, 0], s: [W - 0.12, H - 0.08, W - 0.12], c: shade(wood, -0.2) });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.add(P.box(), { p: [(x * (W - 0.16)) / 2, H / 2, (z * (W - 0.16)) / 2], s: [0.2, H, 0.2], c: dark });
    }
    for (let k = 0; k < 2; k++) {
      const y = 0.28 + k * 0.48;
      b.add(P.box(), { p: [0, y, W / 2 - 0.04], s: [W - 0.3, 0.36, 0.08], c: k ? wood : shade(wood, -0.06) });
      b.add(P.box(), { p: [0, y, -W / 2 + 0.04], s: [W - 0.3, 0.36, 0.08], c: k ? wood : shade(wood, -0.06) });
      b.add(P.box(), { p: [W / 2 - 0.04, y, 0], s: [0.08, 0.36, W - 0.3], c: k ? shade(wood, -0.04) : wood });
      b.add(P.box(), { p: [-W / 2 + 0.04, y, 0], s: [0.08, 0.36, W - 0.3], c: k ? shade(wood, -0.04) : wood });
    }
    b.add(P.box(), { p: [0, 0.52, W / 2 + 0.01], r: [0, 0, 0.5], s: [W - 0.25, 0.12, 0.06], c: dark });
    b.add(P.blob(4, 0.3, 1), { p: [0, H + 0.02, 0], s: [0.85, 0.22, 0.85], c: '#e8c060', c2: '#ffe08a', gy: [-1, 1] });
    flower(b, [0.75, H + 0.12, 0.72], 1, '#ffffff', '#ffd23f', 0.4, 0.5);
    flower(b, [-0.72, H + 0.1, -0.7], 0.9, '#ff9ec4', '#ffd23f', 0.4, 2);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      b.add(P.cone(4), { p: [Math.sin(a) * 1.15, 0, Math.cos(a) * 1.15], r: [0.2 * Math.sin(a * 3), 0, 0.2 * Math.cos(a * 2)], s: [0.1, 0.35 + hash(i) * 0.2, 0.1], c: '#5cbf4a', c2: '#8fe070', gy: [0, 1] });
    }
    return { seedY: 2.0, topY: H + 0.1 };
  },
  // 1 Greenhollow: mossy tree stump
  (b) => {
    const bark = '#7a5232';
    const prof = [[1.3, 0], [1.1, 0.12], [0.95, 0.35], [0.9, 0.9], [0.92, 1.1], [0.0, 1.12]];
    const groove = (x, y, z) => (Math.floor(((Math.atan2(x, z) + PI) / TAU) * 16) % 2 ? shade(bark, -0.15) : null);
    b.add(latheGeo('stump', prof.slice(0, 5), 16), { c: shade(bark, -0.1), c2: bark, gy: [0, 1.1], cf: groove });
    b.add(P.disc(16), { p: [0, 1.1, 0], s: 0.92, c: '#e8bf82', cf: (x, y, z) => { const r = Math.hypot(x, z); return Math.floor(r * 6) % 2 ? '#d4a468' : null; } });
    b.add(P.torus(0.15, 4, 16), { p: [0, 1.1, 0], r: [PI / 2, 0, 0], s: [0.92, 0.92, 0.5], c: shade(bark, 0.05) });
    b.add(P.blob(8, 0.25, 1), { p: [0.45, 1.08, -0.35], s: [0.6, 0.18, 0.5], c: '#4f9f3d', c2: '#7ccf5a', gy: [-1, 1] });
    b.add(P.blob(9, 0.25, 1), { p: [-0.6, 0.95, 0.4], r: [0, 0, 0.4], s: [0.4, 0.28, 0.45], c: '#4f9f3d', c2: '#7ccf5a', gy: [-1, 1] });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.4;
      b.add(tubeGeo([[Math.sin(a) * 0.8, 0.45, Math.cos(a) * 0.8], [Math.sin(a) * 1.25, 0.15, Math.cos(a) * 1.25], [Math.sin(a) * 1.6, -0.05, Math.cos(a) * 1.6]], 0.2, 0.08, 5, 4), { c: bark });
    }
    b.add(P.cyl(0.8, 1, 6), { p: [0.95, 0.25, 0.55], s: [0.1, 0.3, 0.1], c: '#fff4e0' });
    b.add(P.dome(8, 3, 0.55), { p: [0.95, 0.52, 0.55], s: [0.24, 0.18, 0.24], c: '#e84a3c' });
    return { seedY: 2.05, topY: 1.13 };
  },
  // 2 Dustbowl: clay urn on a sandstone block
  (b) => {
    const band = (x, y) => (Math.floor(y * 5) % 2 ? '#e3b777' : null);
    b.add(P.box(), { p: [0, 0.3, 0], r: [0, 0.15, 0], s: [1.9, 0.6, 1.9], c: '#d9a868', cf: band });
    b.add(P.box(), { p: [0, 0.65, 0], r: [0, 0.15, 0], s: [1.6, 0.14, 1.6], c: '#c98e55' });
    const clay = '#c8643a';
    const prof = [[0.0, 0.72], [0.45, 0.72], [0.62, 0.9], [0.72, 1.2], [0.6, 1.5], [0.42, 1.62], [0.5, 1.72], [0.44, 1.76]];
    const zig = (x, y) => (y > 1.12 && y < 1.26 ? '#fff1d6' : y > 1.02 && y < 1.1 ? '#6b2e1a' : y > 1.28 && y < 1.34 ? '#6b2e1a' : null);
    b.add(latheGeo('urn', prof, 14), { c: shade(clay, -0.1), c2: shade(clay, 0.1), gy: [0.7, 1.7], cf: zig });
    b.add(P.disc(12), { p: [0, 1.66, 0], s: 0.42, c: '#4a2a18' });
    rock(b, [1.1, 0.1, 0.7], 0.3, '#caa070', 3);
    rock(b, [-1.0, 0.08, -0.8], 0.24, '#b98a58', 6);
    b.add(P.cyl(1, 1, 6), { p: [-1.05, 0, 0.75], s: [0.16, 0.5, 0.16], c: '#3fae5a', cf: null });
    b.add(P.dome(6, 2), { p: [-1.05, 0.5, 0.75], s: [0.16, 0.12, 0.16], c: '#3fae5a' });
    return { seedY: 2.25, topY: 1.76 };
  },
  // 3 Tanglemire: lily pad on twisted bog roots
  (b) => {
    const root = '#4a3526';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.3;
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const r = 1.1 * (1 - t) + 0.25 * t;
        const aa = a + t * 1.6;
        pts.push([Math.sin(aa) * r, t * 1.05 - 0.05, Math.cos(aa) * r]);
      }
      b.add(tubeGeo(pts, 0.2, 0.13, 5, 6), { c: shade(root, -0.1), c2: shade(root, 0.12), gy: [0, 1] });
    }
    b.add(P.blob(6, 0.2, 1), { p: [0, 0.2, 0], s: [0.9, 0.3, 0.9], c: '#3c4f2e', c2: '#5d7a3e', gy: [-1, 1] });
    const pad = cachedGeo('podPad', () => new THREE.CylinderGeometry(1, 1, 0.1, 18, 1, false, 0.3, TAU - 0.6));
    b.add(pad, { p: [0, 1.08, 0], r: [0, 2.6, 0], s: [1.25, 1, 1.25], c: '#3f9e5a', cf: (x, y, z) => (y > 0.04 && Math.hypot(x, z) > 0.75 ? '#5cc47a' : null) });
    b.frame(fm([0.75, 1.16, 0.55], 0.1, 0.8));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.add(P.sphere(5, 3), { p: [Math.sin(a) * 0.14, 0.12, Math.cos(a) * 0.14], r: [Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6], s: [0.1, 0.22, 0.06], c: '#ff9ec4', c2: '#ffffff', gy: [-1, 1] });
    }
    b.add(P.sphere(5, 3), { p: [0, 0.1, 0], s: 0.08, c: '#ffe066' });
    b.frame(null);
    for (const [x, z, h] of [[-1.15, 0.6, 1.9], [-1.3, 0.2, 1.5], [1.2, -0.7, 1.7]]) {
      b.add(P.cyl(1, 1, 4), { p: [x, 0, z], s: [0.04, h, 0.04], c: '#6f8a3a' });
      b.add(P.cyl(1, 1, 6), { p: [x, h - 0.5, z], s: [0.1, 0.45, 0.1], c: '#6b4226' });
    }
    return { seedY: 2.0, topY: 1.14 };
  },
  // 4 Emberroot: obsidian brazier with glowing coals
  (b) => {
    const obs = '#2a2030';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.add(tubeGeo([[Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9], [Math.sin(a) * 0.7, 0.5, Math.cos(a) * 0.7], [Math.sin(a) * 0.55, 0.9, Math.cos(a) * 0.55]], 0.14, 0.1, 5, 4), { c: '#3a2c3a' });
      b.add(P.sphere(5, 3), { p: [Math.sin(a) * 0.92, 0.05, Math.cos(a) * 0.92], s: 0.18, c: '#d9a33a' });
    }
    const prof = [[0.0, 0.8], [0.5, 0.82], [0.85, 1.0], [1.05, 1.3], [1.12, 1.42], [1.0, 1.44], [0.9, 1.3]];
    b.add(latheGeo('brazier', prof, 12), { c: shade(obs, -0.2), c2: shade(obs, 0.25), gy: [0.8, 1.44], cf: (x, y, z, i) => (hash(i * 3.3) > 0.85 && y < 1.3 ? ['#ff5a1f', 0.8] : null) });
    b.add(P.torus(0.12, 4, 14), { p: [0, 1.42, 0], r: [PI / 2, 0, 0], s: [1.08, 1.08, 0.7], c: '#d9a33a' });
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r = i ? 0.5 : 0;
      b.add(P.blob(i + 30, 0.25, 0), { p: [Math.sin(a) * r, 1.22, Math.cos(a) * r], s: [0.32, 0.2, 0.32], r: [0, a, 0], c: '#ff5a1f', c2: '#ffd166', gy: [-1, 1], glow: 0.8, glow2: 1 });
    }
    rock(b, [1.2, 0.1, 0.6], 0.32, '#3a2622', 4, { cf: (x, y, z, i) => (hash(i * 7.1) > 0.7 ? ['#ff5a1f', 0.9] : null) });
    rock(b, [-1.1, 0.1, -0.7], 0.26, '#2e1e1a', 9, { cf: (x, y, z, i) => (hash(i * 7.1) > 0.7 ? ['#ff5a1f', 0.9] : null) });
    return { seedY: 2.15, topY: 1.44, halo: '#ff7a2e' };
  },
  // 5 Starbloom: crystal pedestal with orbiting shards
  (b) => {
    const stone = '#2a2f6b';
    b.add(P.cyl(1.15, 1.3, 6), { p: [0, 0, 0], s: [1, 0.35, 1], c: shade(stone, -0.2) });
    b.add(P.cyl(0.75, 0.85, 6), { p: [0, 0.35, 0], s: [1, 0.85, 1], c: shade(stone, -0.05), c2: shade(stone, 0.15), gy: [0, 1], cf: (x, y) => (y > 0.4 && y < 0.55 ? ['#8fd8ff', 0.9] : null) });
    b.add(P.cyl(1.05, 0.9, 6), { p: [0, 1.2, 0], s: [1, 0.22, 1], c: shade(stone, 0.2) });
    b.add(P.cyl(1, 1, 6), { p: [0, 1.42, 0], s: [0.8, 0.02, 0.8], c: '#c9b8ff', glow: 0.8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      b.add(P.oct(), { p: [Math.sin(a) * 1.25, 0.25, Math.cos(a) * 1.25], r: [0.3, a, 0.2], s: [0.16, 0.4, 0.16], c: i % 2 ? '#8fd8ff' : '#d18fff', glow: 0.6 });
    }
    b.use('crystals', [0, 2.0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.add(P.oct(), { p: [Math.sin(a) * 1.15, 2.0 + (i % 2) * 0.35, Math.cos(a) * 1.15], s: [0.13, 0.32, 0.13], c: i % 2 ? '#8fd8ff' : '#e0a8ff', glow: 0.85 });
    }
    b.use('body');
    return { seedY: 2.2, topY: 1.44, halo: '#9fb8ff' };
  },
];

export function podTemplate(biome) {
  const key = 'pod' + biome;
  if (!cache.has(key)) {
    const b = new Builder();
    const meta = STANDS[biome](b);
    const t = b.finish(meta);
    cache.set(key, t);
  }
  return cache.get(key);
}

export function potTemplate() {
  if (!cache.has('pot')) {
    const b = new Builder();
    const clay = '#d0714a';
    const prof = [[0.0, 0], [0.5, 0], [0.54, 0.05], [0.66, 0.74], [0.8, 0.76], [0.82, 0.98], [0.68, 1.0], [0.64, 0.9], [0.0, 0.9]];
    b.add(latheGeo('pot', prof, 12), { c: shade(clay, -0.12), c2: shade(clay, 0.08), gy: [0, 1], cf: (x, y) => (y > 0.75 && y < 0.99 ? shade(clay, 0.12) : null) });
    b.add(P.dome(10, 2), { p: [0, 0.88, 0], s: [0.64, 0.1, 0.64], c: '#5a3a22', cf: (x, y, z, i) => (hash(i) > 0.7 ? '#7a5232' : null) });
    cache.set('pot', b.finish({ soilY: 0.93 }));
  }
  return cache.get('pot');
}
