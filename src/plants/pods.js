// Road seed stands (one style per biome, indexed like BIOMES: STANDS needs an entry for every biome) and the
// terracotta pot used for carried plants.
// Built once per biome with the same Builder as the plants (one merged, vertex-coloured mesh each).
import * as THREE from 'three';
import { Builder, P, latheGeo, tubeGeo, leafGeo, shapeGeo, starShape, cachedGeo, aim, TAU } from './geometry.js';
import { shade } from './materials.js';
import { hash, fm, crystalGeo, scallopGeo } from './species.js';

const PI = Math.PI;
const cache = new Map();
const CANDY = ['#ff5ca8', '#ffd84a', '#ff8a3d', '#b77bff', '#4fc3ff', '#ff4d5e'];

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
export const STANDS = [
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
  // 6 Frostfall: hexagonal ice pillar in a snow drift, with icicles, ice crystals and a tiny snowman
  (b) => {
    const ice = '#9fe3ff', deep = '#4fa8e0';
    b.add(P.blob(12, 0.12, 1), { p: [0, 0.02, 0], s: [1.5, 0.42, 1.4], c: '#d2e8f8', c2: '#f4fbff', gy: [-1, 1] });
    b.add(P.cyl(0.74, 0.9, 6), { p: [0, 0.15, 0], s: [1, 1.08, 1], c: deep, c2: ice, gy: [0, 1], glow: 0.15, glow2: 0.45, cf: (x, y, z, i) => (i % 4 === 1 ? ['#e8fbff', 0.6] : null) });
    b.add(P.cyl(1.02, 0.96, 6), { p: [0, 1.2, 0], s: [1, 0.16, 1], c: '#dff3ff', glow: 0.2 });
    b.add(P.blob(13, 0.1, 1), { p: [0, 1.36, 0], s: [0.98, 0.14, 0.98], c: '#eef8ff', c2: '#ffffff', gy: [-1, 1] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + PI / 6;
      b.add(P.cone(5), { p: [Math.sin(a) * 0.86, 1.22, Math.cos(a) * 0.86], r: [PI, 0, 0], s: [0.08, 0.28 + hash(i + 3) * 0.3, 0.08], c: '#ffffff', c2: ice, gy: [0, 1], glow: 0.5 });
    }
    [[1.25, 0.55, 0.4], [-1.2, -0.6, -0.35], [-0.95, 0.95, 0.25]].forEach(([x, z, lean], i) => {
      b.add(P.oct(), { p: [x, 0.3, z], r: [lean, i, -lean], s: [0.16, 0.45, 0.16], c: deep, c2: '#e8fbff', gy: [-1, 1], glow: 0.5, glow2: 0.8 });
      b.add(P.oct(), { p: [x + 0.2, 0.18, z - 0.1], r: [0.3, i, 0.6], s: [0.09, 0.24, 0.09], c: ice, glow: 0.6 });
    });
    const sx = 1.2, sz = -0.7;
    b.add(P.sphere(8, 6), { p: [sx, 0.3, sz], s: 0.32, c: '#ffffff' });
    b.add(P.sphere(8, 6), { p: [sx, 0.72, sz], s: 0.22, c: '#ffffff' });
    b.add(P.cone(5), { p: [sx, 0.72, sz + 0.2], r: [PI / 2, 0, 0], s: [0.05, 0.22, 0.05], c: '#ff8a2a' });
    for (const ex of [-0.08, 0.08]) b.add(P.sphere(4, 3), { p: [sx + ex, 0.79, sz + 0.19], s: 0.03, c: '#1a1a24', keep: true });
    b.add(P.cyl(1, 1, 6), { p: [sx, 0.9, sz], s: [0.2, 0.03, 0.2], c: '#2a2a3a' });
    b.add(P.cyl(1, 1, 6), { p: [sx, 0.92, sz], s: [0.13, 0.2, 0.13], c: '#2a2a3a' });
    b.use('crystals', [0, 2.0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const p = [Math.sin(a) * 1.15, 2.0 + (i % 2) * 0.35, Math.cos(a) * 1.15];
      for (let k = 0; k < 3; k++) b.add(P.oct(), { p, r: [0, a, (k * PI) / 3], s: [0.045, 0.2, 0.04], c: '#e8fbff', glow: 0.9 });
    }
    b.use('body');
    return { seedY: 2.25, topY: 1.5, halo: '#9fe8ff' };
  },
  // 7 Candy Canyon: a giant frosted cupcake with sprinkles, a candy cane and a lollipop
  (b) => {
    const pink = '#ff7eb8';
    const liner = [[0, 0], [0.78, 0], [0.82, 0.04], [1.02, 0.86], [1.06, 0.9]];
    b.add(latheGeo('cupLiner', liner, 14), { c: pink, c2: shade(pink, 0.15), gy: [0, 0.9], cf: (x, y, z) => (Math.floor(((Math.atan2(x, z) + PI) / TAU) * 14) % 2 ? '#ffd1ea' : null) });
    b.add(P.cyl(1.0, 1.04, 14, true), { p: [0, 0.86, 0], s: [1, 0.16, 1], c: '#c8844a' });
    b.add(P.torus(0.4, 4, 14), { p: [0, 1.08, 0], r: [PI / 2, 0, 0], s: [0.8, 0.8, 0.75], c: '#ff8fc8', c2: '#ffd6ea', gy: [-1, 1] });
    b.add(P.torus(0.42, 4, 12), { p: [0, 1.36, 0], r: [PI / 2, 0, 0.4], s: [0.55, 0.55, 0.55], c: '#ffb0d8', c2: '#fff0f6', gy: [-1, 1] });
    b.add(P.dome(12, 3), { p: [0, 1.36, 0], s: [0.55, 0.26, 0.55], c: '#fff6fa' });
    for (let i = 0; i < 10; i++) {
      const a = hash(i + 7) * TAU, top = i % 2;
      const r = top ? 0.5 : 0.82, y = top ? 1.56 : 1.32;
      b.add(P.box(), { p: [Math.sin(a) * r, y, Math.cos(a) * r], r: [hash(i) * 2, a * 3, 0.3], s: [0.07, 0.07, 0.22], c: CANDY[i % CANDY.length], keep: true });
    }
    const cane = [[1.3, 0, 0.45], [1.3, 0.8, 0.45], [1.3, 1.35, 0.45], [1.36, 1.6, 0.45], [1.54, 1.66, 0.45], [1.68, 1.5, 0.45], [1.68, 1.32, 0.45]];
    b.add(tubeGeo(cane, 0.1, 0.1, 5, 10), { c: '#ffffff', cf: (x, y, z, k) => ((Math.floor(k / 10) + (Math.floor(k / 2) % 5)) % 4 < 2 ? '#ff3b4f' : null) });
    b.add(P.cyl(1, 1, 4), { p: [-1.3, 0, -0.35], s: [0.04, 1.1, 0.04], c: '#ffffff' });
    b.add(P.cyl(1, 1, 12), { p: [-1.3, 1.35, -0.43], r: [PI / 2, 0, 0], s: [0.34, 0.14, 0.34], c: '#6ff0c0', cf: (x, y, z) => (Math.floor(((Math.atan2(x, z) + PI) / TAU) * 6 + Math.hypot(x, z) * 2) % 2 ? '#ffffff' : null) });
    b.use('crystals', [0, 2.0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU, c = CANDY[i * 2];
      const p = [Math.sin(a) * 1.15, 2.0 + (i % 2) * 0.35, Math.cos(a) * 1.15];
      b.add(P.sphere(5, 3), { p, s: [0.13, 0.11, 0.11], c, glow: 0.3 });
      for (const s of [-1, 1]) b.add(P.cone(4), { p: [p[0] + Math.cos(a) * s * 0.1, p[1], p[2] - Math.sin(a) * s * 0.1], r: [0, a, (s * PI) / 2], s: [0.08, 0.14, 0.08], c, glow: 0.3 });
    }
    b.use('body');
    return { seedY: 2.35, topY: 1.62, halo: '#ff9fd8' };
  },
  // 8 Cloud Kingdom: a golden column on a fluffy cloud, with little angel wings
  (b) => {
    [[0, 0.2, 0, 1.0], [0.95, 0.16, 0.35, 0.62], [-0.9, 0.18, 0.4, 0.64], [0.1, 0.15, -0.95, 0.66]].forEach(([x, y, z, s], i) =>
      b.add(P.blob(i + 20, 0.08, 1), { p: [x, y, z], s: [s, s * 0.6, s], c: '#dfe8ff', c2: '#ffffff', gy: [-1, 1], glow: 0.25 }));
    b.add(P.cyl(0.62, 0.7, 10), { p: [0, 0.2, 0], s: [1, 0.16, 1], c: '#d9a020' });
    b.add(P.cyl(0.5, 0.58, 10), { p: [0, 0.34, 0], s: [1, 0.8, 1], c: '#e0a820', c2: '#ffd84a', gy: [0, 1], glow: 0.1, cf: (x, y, z, i) => (i < 20 && Math.floor(i / 2) % 2 ? '#ffe68a' : null) });
    b.add(P.cyl(0.95, 0.66, 10), { p: [0, 1.12, 0], s: [1, 0.2, 1], c: '#ffc933', c2: '#ffe27a', gy: [0, 1], glow: 0.1 });
    b.add(P.cyl(1, 1, 10), { p: [0, 1.32, 0], s: [0.92, 0.07, 0.92], c: '#fff6c8', glow: 0.7 });
    b.add(P.torus(0.1, 4, 16), { p: [0, 1.36, 0], r: [PI / 2, 0, 0], s: 0.93, c: '#ffd23f', glow: 0.3 });
    const feather = leafGeo({ shape: 'feather', segL: 4, segW: 2, bend: 0.15, cup: 0.1 });
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        b.add(feather, { p: [side * 0.82, 1.12, 0.05], r: [0, 0, -side * (0.7 + k * 0.4)], s: [0.34, 0.95 - k * 0.17, 0.6], c: '#ffffff', c2: '#fff2c0', glow: 0.3 });
      }
    }
    b.use('crystals', [0, 2.0, 0]);
    const star = shapeGeo('podStar', () => starShape(5, 0.45), 0.12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.add(star, { p: [Math.sin(a) * 1.15, 2.0 + (i % 2) * 0.35, Math.cos(a) * 1.15], r: [0, a, 0], s: 0.2, c: '#ffd23f', c2: '#fff4b0', gy: [-1, 1], glow: 0.7 });
    }
    b.use('body');
    return { seedY: 2.3, topY: 1.42, halo: '#fff2a8' };
  },
  // 9 Crystal Caverns: a geode cracked open on a cave rock, lined with glowing crystals
  (b) => {
    const stone = '#6c6386', mint = '#3dffb4', violet = '#b48cff';
    const crystal = (p, d, len, r, c) => b.add(crystalGeo(), { p, q: aim(d), s: [r, len, r], c: shade(c, -0.3), c2: shade(c, 0.2), gy: [0.2, 1], glow: 0.25, glow2: 0.6 });
    rock(b, [0, 0.22, 0], 1.35, '#4b3d72', 14, { cf: (x, y, z, i) => (hash(i * 2.3) > 0.85 ? '#6a5a96' : null) });
    const shell = [[0, 0.62], [0.72, 0.66], [1.02, 0.86], [1.12, 1.12], [1.02, 1.32]];
    b.add(latheGeo('podGeode', shell, 12), { c: shade(stone, -0.12), c2: shade(stone, 0.12), gy: [0.6, 1.3], cf: (x, y, z, i) => (hash(i * 1.7) > 0.85 ? shade(stone, 0.35) : null) });
    b.add(P.torus(0.12, 3, 14), { p: [0, 1.32, 0], r: [PI / 2, 0, 0], s: 1.0, c: '#efe6ff', glow: 0.35 });
    b.add(P.disc(12), { p: [0, 1.18, 0], s: 0.98, c: '#2a1a4a', glow: 0.2 });
    // crystals lining the bowl, leaning in
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.2;
      crystal([Math.sin(a) * 0.82, 1.08, Math.cos(a) * 0.82], [-Math.sin(a) * 0.5, 1, -Math.cos(a) * 0.5], 0.42 + hash(i + 2) * 0.22, 0.13, i % 2 ? violet : mint);
    }
    // clusters on the cave floor
    [[1.2, 0.6, mint], [-1.15, -0.65, violet], [-0.95, 0.9, mint]].forEach(([x, z, c], i) => {
      crystal([x, 0.1, z], [x * 0.5, 1, z * 0.5], 0.75, 0.17, c);
      crystal([x + 0.18, 0.08, z - 0.1], [x + 0.6, 1, z * 0.3], 0.45, 0.11, i % 2 ? mint : violet);
    });
    b.use('crystals', [0, 2.0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.add(crystalGeo(), { p: [Math.sin(a) * 1.15, 1.82 + (i % 2) * 0.35, Math.cos(a) * 1.15], s: [0.12, 0.45, 0.12], c: i % 2 ? violet : mint, c2: shade(i % 2 ? violet : mint, 0.4), gy: [0, 1], glow: 0.6 });
    }
    b.use('body');
    return { seedY: 2.3, topY: 1.34, halo: '#3dffb4' };
  },
  // 10 Bubble Reef: an open scallop on a coral rock, with kelp, a starfish and bubbles
  (b) => {
    const sand = '#f2dcb0', coral = '#ff8a7a', pink = '#ff9ec4';
    b.add(P.blob(15, 0.1, 1), { p: [0, 0.05, 0], s: [1.45, 0.36, 1.35], c: shade(sand, -0.1), c2: sand, gy: [-1, 1], cf: (x, y, z, i) => (hash(i * 4.3) > 0.82 ? shade(sand, -0.25) : null) });
    b.add(P.cyl(0.62, 0.8, 9), { p: [0, 0.15, 0], s: [1, 0.62, 1], c: shade(coral, -0.15), c2: coral, gy: [0, 1], cf: (x, y, z, i) => (hash(i * 3.1) > 0.75 ? '#ffd1c4' : null) });
    // the scallop: bottom shell as a dish, top shell propped open (hinged at +Z: it opens toward players coming up the road)
    const ribs = (x, y, z) => (Math.floor((Math.atan2(x, z) / 1.25 + 1) * 7 + 0.5) % 2 ? pink : null);
    const hinge = [0, 1.12, 0.82];
    b.add(scallopGeo(), { p: hinge, r: [0, PI, 0], s: [1.15, 0.9, 1.15], c: '#ffd2e2', c2: shade(pink, 0.3), gy: [-0.36, 0], cf: ribs });
    b.add(scallopGeo(), { p: hinge, r: [-1.15, PI, 0], s: [1.15, -0.9, 1.15], c: '#ffd2e2', c2: shade(pink, 0.3), gy: [-0.36, 0], cf: ribs });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      b.add(P.sphere(5, 3), { p: [Math.sin(a) * 0.32, 1.06, 0.25 + Math.cos(a) * 0.32], s: [0.2, 0.08, 0.2], c: pink, c2: '#ffd8ec', gy: [-1, 1] });
    }
    // kelp ribbons at the sides, a starfish on the sand
    const kelp = leafGeo({ shape: 'blade', segL: 6, segW: 1, bend: -0.2, cup: 0.1, twist: 1.6 });
    for (const [x, z, h, yaw] of [[-1.15, 0.45, 2.0, 0.4], [1.2, 0.35, 1.6, -0.5], [-0.9, -0.85, 1.3, 2.4]]) {
      b.add(kelp, { p: [x, 0, z], r: [0.1, yaw, 0], s: [0.34, h, 0.5], c: '#2f8f6a', c2: '#8fe0b0' });
    }
    b.add(shapeGeo('starfish', () => starShape(5, 0.42), 0.3), { p: [0.9, 0.3, -0.85], r: [-PI / 2 + 0.3, 0.5, 0], s: 0.32, c: '#ff8a3d', c2: '#ffc08a', gy: [-1, 1] });
    b.use('crystals', [0, 2.0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const p = [Math.sin(a) * 1.15, 1.85 + (i % 2) * 0.4, Math.cos(a) * 1.15];
      b.add(P.sphere(7, 5), { p, s: 0.16 + i * 0.03, ch: 'trans', c: '#dff8ff', c2: '#ffffff', gy: [-1, 1], glow: 0.2 });
      b.add(P.oct(), { p: [p[0] - 0.05, p[1] + 0.07, p[2] + 0.1], s: [0.04, 0.025, 0.015], c: '#ffffff', glow: 1 });
    }
    b.use('body');
    return { seedY: 2.3, topY: 1.15, halo: '#7fe8ff' };
  },
  // 11 Rainbow's End: a pot of gold under a little rainbow
  (b) => {
    const gold = '#ffd23f';
    [[0, 0.15, 0, 1.05], [0.95, 0.12, 0.4, 0.6], [-0.9, 0.12, 0.45, 0.62], [0.1, 0.1, -0.95, 0.66]].forEach(([x, y, z, s], i) =>
      b.add(P.blob(i + 24, 0.08, i ? 0 : 1), { p: [x, y, z], s: [s, s * 0.45, s], c: '#e8defa', c2: '#ffffff', gy: [-1, 1], glow: 0.15 }));
    // the rainbow arches behind the pot (as seen by players coming up the road, toward +Z)
    const arch = cachedGeo('podArch', () => new THREE.RingGeometry(0.62, 1, 12, 7, 0, PI));
    const bands = ['#ff3d5e', '#ff8f1f', '#ffd91f', '#3ae36a', '#1fb8ff', '#4f63ff', '#a640ff'];
    b.add(arch, { p: [0, 0.15, 0.75], s: [1.7, 1.55, 1], c: bands[0], glow: 0.35, cf: (x, y) => bands[Math.max(0, Math.min(6, Math.floor((1 - Math.hypot(x, y)) / 0.38 * 7)))] });
    // the cauldron on three stubby feet, heaped with coins
    const pot = [[0, 0.2], [0.62, 0.22], [0.92, 0.45], [1.0, 0.78], [0.86, 1.05], [0.95, 1.12], [0.88, 1.18]];
    b.add(latheGeo('podPot', pot, 14), { c: '#1f1a33', c2: '#3a3260', gy: [0.2, 1.2] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      b.add(P.sphere(5, 3), { p: [Math.sin(a) * 0.6, 0.14, Math.cos(a) * 0.6], s: [0.16, 0.14, 0.16], c: '#2a2444' });
    }
    b.add(P.dome(12, 3), { p: [0, 1.05, 0], s: [0.86, 0.36, 0.86], c: shade(gold, -0.3), c2: gold, gy: [0, 1], glow: 0.12, cf: (x, y, z, i) => (hash(i * 2.9) > 0.75 ? '#fff1a0' : null) });
    const coin = (p, r, s = 0.17) => b.add(P.cyl(1, 1, 8), { p, r, s: [s, 0.05, s], c: '#e8a810', c2: gold, gy: [0, 1], glow: 0.15 });
    [[0.3, 1.32, 0.15, 0.5], [-0.32, 1.28, 0.25, -0.6], [0.05, 1.4, -0.25, 0.3], [-0.12, 1.36, 0.42, 0.9]].forEach(([x, y, z, t]) => coin([x, y, z], [t, 0, t * 0.7]));
    [[0.95, 0.1, 0.75, 0.2], [-0.85, 0.1, 0.85, -0.3]].forEach(([x, y, z, t]) => coin([x, y, z], [t, 0, 0.2]));
    b.use('crystals', [0, 2.0, 0]);
    const star = shapeGeo('podStar', () => starShape(5, 0.45), 0.12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.add(star, { p: [Math.sin(a) * 1.15, 2.0 + (i % 2) * 0.35, Math.cos(a) * 1.15], r: [0, a, 0], s: 0.2, c: bands[i * 2 + 1], c2: '#ffffff', gy: [-1, 1], glow: 0.7 });
    }
    b.use('body');
    return { seedY: 2.35, topY: 1.42, halo: '#c4bcff' };
  },
];

export function podTemplate(biome) {
  const i = Math.max(0, Math.min(STANDS.length - 1, biome | 0));
  const key = 'pod' + i;
  if (!cache.has(key)) {
    const b = new Builder();
    const meta = STANDS[i](b);
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
