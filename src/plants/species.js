// Procedural low-poly models for every plant `look` (see PLANTS in config.js), plus the shared
// seed shape and the seedling stages. Builders place parts in plant space: origin = soil surface,
// +Y up, +Z = the plant's front (the side with the face). Units are studs.
//
// Each LOOKS entry: {
//   build(b, o)        o = {c0, c1, bud, secret, sid, mutation}; o.bud=true draws the closed-bud stage
//   sprout             seedling style for stage 1 ('leafy' | 'cactus' | 'shroom' | 'bubble' | 'rosette' | 'curl' | 'ember' | 'vine')
//   leaf(o)            leaf colour for seedlings; glowy: seedlings glow too
//   anim(parts, t, ph) cheap per-frame animation of named groups (optional)
//   lookAll            whole plant turns to face the camera (instead of just 'look' groups); lookClamp limits the turn
//   fx(o)              extra species effects: halos / sparkles (optional)
// }
import * as THREE from 'three';
import { P, leafGeo, tubeGeo, latheGeo, shapeGeo, heartShape, starShape, cachedGeo, aim, TAU } from './geometry.js';
import { shade, mixCol } from './materials.js';

const PI = Math.PI;
const GREEN = '#63c94f';
const GREEN_D = '#3b9a3a';
const STEM = '#4caf45';
const SOIL = '#5a3519';
export const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function fm(p, rx = 0, ry = 0, rz = 0, s = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p[0], p[1], p[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(s, s, s),
  );
}

// ------------------------------------------------------------------ part helpers

/**
 * A leaf / petal from base point p, pointing toward horizontal angle a (0 = +Z front), raised `up` radians
 * above horizontal (PI/2 = straight up). Its front face points up (or inward when near vertical).
 */
function blade(b, o) {
  const g = leafGeo({
    shape: o.shape || 'leaf', segL: o.segL ?? 4, segW: o.segW ?? 2, bend: o.bend ?? 0.2, cup: o.cup ?? 0.15,
    twist: o.twist ?? 0, serrate: o.serrate ?? 0, notch: o.notch ?? 0,
  });
  const len = o.len ?? 1, wid = o.wid ?? 0.5;
  b.add(g, {
    p: o.p || [0, 0, 0], r: [-(PI / 2 - (o.up ?? 0.5)), (o.a ?? 0) + PI, o.roll ?? 0], s: [wid, len, (len + wid) * 0.5],
    c: o.c ?? GREEN, c2: o.c2, glow: o.glow, glow2: o.glow2, ch: o.ch, cf: o.cf, keep: o.keep,
  });
}

// A flat blade in the local XY plane (front +Z), rotated by `ang` around Z (0 = pointing up). For front-facing blooms.
function flatBlade(b, o) {
  const g = leafGeo({ shape: o.shape || 'petal', segL: o.segL ?? 4, segW: o.segW ?? 2, bend: o.bend ?? 0.15, cup: o.cup ?? 0.2, serrate: o.serrate ?? 0 });
  const len = o.len ?? 1, wid = o.wid ?? 0.5;
  b.add(g, { p: o.p || [0, 0, 0], r: [o.tilt ?? 0, 0, o.ang ?? 0], order: 'ZXY', s: [wid, len, (len + wid) * 0.5], c: o.c, c2: o.c2, glow: o.glow, glow2: o.glow2, ch: o.ch, cf: o.cf });
}

// n blades around the local Y axis
function ring(b, n, o) {
  const r0 = o.r0 ?? 0.1, y = o.y ?? 0, off = o.off ?? 0, c = o.center || [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU + (o.jit ? (hash(i + n) - 0.5) * o.jit : 0);
    const len = o.len * (o.lenVar ? 1 + (hash(i * 3 + 7) - 0.5) * o.lenVar : 1);
    blade(b, { ...o, a, len, p: [c[0] + Math.sin(a) * r0, c[1] + y, c[2] + Math.cos(a) * r0] });
  }
}

function stem(b, pts, r0, r1, c = STEM, o = {}) {
  b.add(tubeGeo(pts, r0, r1, o.radial ?? 5, o.segs ?? 5, o.cap), { c, c2: o.c2, gy: o.gy, glow: o.glow, glow2: o.glow2, cf: o.cf });
}

// Closed bud with a sleepy face, in its own 'head' group.
function bud(b, p, size, color, o = {}) {
  b.use('head', p, { look: true });
  const tip = o.tip ?? shade(color, 0.25);
  b.add(P.sphere(10, 7), { p: [p[0], p[1] + size * 0.95, p[2]], s: [size * 0.66, size, size * 0.66], c: color, c2: tip, gy: [-1, 1], glow: o.glow });
  b.add(P.cone(8), { p: [p[0], p[1] + size * 1.72, p[2]], s: [size * 0.3, size * 0.5, size * 0.3], c: tip, glow: o.glow });
  for (let i = 0; i < 5; i++) {
    blade(b, { p: [p[0], p[1] + size * 0.12, p[2]], a: (i / 5) * TAU + PI / 5, up: 1.05, len: size * 0.8, wid: size * 0.55, shape: 'point', c: o.sepal || GREEN_D, c2: GREEN, bend: 0.3, cup: 0.25 });
  }
  sphereFace(b, 'sleepy', [p[0], p[1] + size * 0.95, p[2]], size * 0.66, size * 0.95, 0.2);
  b.use('body');
}

function smallFlower(b, p, size, petal, center = '#ffd23f', n = 5, tilt = 0.9, yaw = 0) {
  const save = b.F;
  b.frame(fm(p, tilt, yaw));
  ring(b, n, { r0: size * 0.12, up: 0.2, len: size, wid: size * 0.75, shape: 'round', segL: 2, c: petal, c2: shade(petal, 0.15), bend: 0.1, cup: 0.25 });
  b.add(P.sphere(6, 4), { p: [0, 0.05, 0], s: [size * 0.32, size * 0.2, size * 0.32], c: center });
  b.frame(save);
}

function crownParts(b, p, s, gold = '#ffd23f', gems = ['#ff3f6e', '#3fa9ff']) {
  b.add(P.cyl(1, 0.9, 10, true), { p, s: [0.34 * s, 0.2 * s, 0.34 * s], c: gold });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const x = p[0] + Math.sin(a) * 0.3 * s, z = p[2] + Math.cos(a) * 0.3 * s;
    b.add(P.cone(5), { p: [x, p[1] + 0.16 * s, z], s: [0.1 * s, 0.24 * s, 0.1 * s], c: gold });
    b.add(P.oct(), { p: [x, p[1] + 0.43 * s, z], s: 0.06 * s, c: '#ffffff', glow: 0.5 });
    b.add(P.oct(), { p: [p[0] + Math.sin(a + 0.63) * 0.35 * s, p[1] + 0.09 * s, p[2] + Math.cos(a + 0.63) * 0.35 * s], s: [0.05 * s, 0.065 * s, 0.05 * s], c: gems[i % 2], glow: 0.4 });
  }
}

function rock(b, p, s, c = '#8d8a86', seed = 1, o = {}) {
  b.add(P.blob(seed, 0.22, 0), { p, s: [s, s * 0.7, s], c, c2: shade(c, 0.15), gy: [-1, 1], r: [0, seed, 0], cf: o.cf });
}

// ------------------------------------------------------------------ seed shape (seed views + stage 0)

const SEED_PROFILE = [[0, 0], [0.28, 0.05], [0.44, 0.24], [0.47, 0.5], [0.38, 0.8], [0.2, 1.02], [0, 1.12]];
export function seedBody(b, c0, c1, p = [0, 0, 0], s = 1, r = [0, 0, 0], o = {}) {
  const stripe = (x, y, z) => {
    const k = Math.floor(((Math.atan2(x, z) + PI) / TAU) * 10) % 10;
    return k % 2 ? c1 : null;
  };
  b.add(latheGeo('seed', SEED_PROFILE, 10), { p, r, s, c: shade(c0, -0.05), c2: shade(c0, 0.2), gy: [0, 1.1], cf: stripe, glow: o.glow });
}

// ------------------------------------------------------------------ seedlings (stages 0 and 1)

export function buildSeedling(b, look, stage, o) {
  const leaf = look.leaf ? look.leaf(o) : GREEN;
  const crumbs = (x, y, z, i) => (hash(i) > 0.86 ? shade(SOIL, 0.12) : null);
  if (stage === 0) {
    b.add(P.dome(12, 3), { s: [1.25, 0.4, 1.25], c: shade(SOIL, -0.1), c2: shade(SOIL, 0.1), cf: crumbs });
    seedBody(b, o.c0, o.c1, [0.22, 0.14, 0.28], 0.55, [0.5, 0.4, -0.9]);
    b.use('head', [0, 0.35, 0.05]);
    stem(b, [[-0.02, 0.33, 0.02], [0.0, 0.7, 0.05], [0.08, 1.02, 0.06]], 0.07, 0.055, leaf);
    blade(b, { p: [0.08, 1.0, 0.06], a: 1.2, up: 0.55, len: 0.45, wid: 0.4, shape: 'round', segL: 3, c: leaf, c2: shade(leaf, 0.2) });
    blade(b, { p: [0.08, 1.0, 0.06], a: -1.9, up: 0.55, len: 0.42, wid: 0.37, shape: 'round', segL: 3, c: leaf, c2: shade(leaf, 0.2) });
    return;
  }
  // stage 1: sprout with leaves (built small, scaled up so every sprout style grows to ~2 studs)
  b.add(P.dome(10, 3), { s: [1.1, 0.24, 1.1], c: SOIL, c2: shade(SOIL, 0.1), cf: crumbs });
  b.frame(fm([0, 0, 0], 0, 0, 0, 1.45));
  const style = look.sprout || 'leafy';
  if (style === 'cactus') {
    b.use('body', [0, 0, 0]);
    b.add(latheGeo('cactusSprout', [[0, 0], [0.34, 0.02], [0.4, 0.3], [0.38, 0.8], [0.25, 1.05], [0, 1.12]], 10), { c: leaf, cf: (x, y, z) => (Math.floor(((Math.atan2(x, z) + PI) / TAU) * 10) % 2 ? shade(leaf, -0.12) : null) });
    b.face('happy', { p: [0, 0.6, 0.415], s: 0.44, bend: 0.4 });
    stem(b, [[0.32, 0.45, 0], [0.55, 0.5, 0], [0.6, 0.72, 0]], 0.12, 0.11, leaf, { cap: true });
    b.add(P.sphere(6, 4), { p: [0.02, 1.12, 0.02], s: 0.12, c: o.c1 });
    b.frame(null);
    return;
  }
  if (style === 'shroom') {
    const cap = o.c0, glow = look.glowy ? 0.8 : 0;
    const btn = (x, z, s) => {
      b.add(P.cyl(0.85, 1, 8), { p: [x, 0, z], s: [0.2 * s, 0.55 * s, 0.2 * s], c: look.glowy ? '#d8ccf5' : o.c1 });
      b.add(P.dome(10, 3, 0.55), { p: [x, 0.5 * s, z], s: [0.42 * s, 0.4 * s, 0.42 * s], c: cap, c2: shade(cap, 0.2), glow, glow2: glow });
    };
    btn(0, 0.05, 1.5);
    btn(0.55, -0.25, 1.0);
    btn(-0.45, -0.3, 0.8);
    b.face('sleepy', { p: [0, 0.42, 0.37], s: 0.36, bend: 0.3 });
    b.frame(null);
    return;
  }
  if (style === 'rosette') {
    ring(b, 5, { r0: 0.05, up: 0.75, len: 0.75, wid: 0.3, shape: 'point', c: shade(leaf, -0.15), c2: leaf, cup: 0.4, bend: -0.2 });
    ring(b, 3, { r0: 0.03, up: 1.2, len: 0.6, wid: 0.25, shape: 'point', c: shade(leaf, -0.1), c2: shade(leaf, 0.15), cup: 0.4, off: 0.5 });
    b.frame(null);
    return;
  }
  if (style === 'curl') {
    for (let i = 0; i < 4; i++) blade(b, { p: [0, 0.05, 0], a: i * 1.6 + 0.3, up: 0.8, len: 0.9, wid: 0.32, shape: 'feather', serrate: 0.5, segL: 8, bend: -0.4, c: shade(leaf, -0.2), c2: leaf, glow: look.glowy ? 0.2 : 0, glow2: look.glowy ? 0.7 : 0 });
    b.use('head', [0, 0.9, 0.05]);
    stem(b, [[0, 0.05, 0], [0.02, 0.5, 0.02], [0, 0.85, 0.05]], 0.06, 0.05, leaf);
    b.add(P.torus(0.35, 5, 10, TAU * 0.85), { p: [0, 0.98, 0.07], r: [0, 0, -0.8], s: 0.2, c: shade(leaf, 0.1), glow: look.glowy ? 0.6 : 0 });
    b.frame(null);
    return;
  }
  // leafy / bubble / ember / vine
  b.use('head', [0, 0.2, 0]);
  const H = 1.15;
  stem(b, [[0, 0.02, 0], [0.04, 0.45, 0.02], [-0.02, 0.85, 0.04], [0.02, H, 0.06]], 0.07, 0.055, shade(leaf, -0.1));
  blade(b, { p: [0.01, 0.5, 0.03], a: 1.3, up: 0.55, len: 0.6, wid: 0.36, shape: 'leaf', c: shade(leaf, -0.15), c2: leaf, bend: -0.15 });
  blade(b, { p: [0.01, 0.62, 0.03], a: -1.8, up: 0.6, len: 0.55, wid: 0.34, shape: 'leaf', c: shade(leaf, -0.15), c2: leaf, bend: -0.15 });
  blade(b, { p: [0.02, H, 0.06], a: 0.9, up: 0.75, len: 0.48, wid: 0.4, shape: 'round', c: leaf, c2: shade(leaf, 0.2), bend: 0.1, cup: 0.3 });
  blade(b, { p: [0.02, H, 0.06], a: -2.2, up: 0.75, len: 0.46, wid: 0.38, shape: 'round', c: leaf, c2: shade(leaf, 0.2), bend: 0.1, cup: 0.3 });
  if (style === 'bubble') {
    b.add(P.sphere(8, 6), { p: [0.02, H + 0.3, 0.06], s: 0.24, ch: 'trans', c: o.c0, c2: o.c1, gy: [-1, 1] });
  } else if (style === 'ember') {
    b.add(P.sphere(6, 5), { p: [0.02, H + 0.12, 0.06], s: [0.14, 0.2, 0.14], c: o.c0, glow: 1 });
  } else if (style === 'vine') {
    b.add(P.torus(0.12, 3, 8, 4.5), { p: [0.2, 0.85, 0.08], r: [0, 0.4, 0.5], s: 0.14, c: leaf });
  } else {
    // the seed coat still stuck on its head, like a little hat
    seedBody(b, o.c0, o.c1, [0.1, H + 0.12, 0.1], 0.3, [0.2, 0.3, -0.5]);
  }
  b.frame(null);
}

// ------------------------------------------------------------------ species

const face = (b, expr, p, s, bend, r) => b.face(expr, { p, s, bend, r });
// Face on a sphere (centre c, radius r), tilted up by `tilt` so it reads from a raised camera.
function sphereFace(b, expr, c, r, size, tilt = 0.25, yaw = 0) {
  const d = [Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt)];
  const k = r + 0.015;
  b.face(expr, { p: [c[0] + d[0] * k, c[1] + d[1] * k, c[2] + d[2] * k], r: [-tilt, yaw, 0], s: size, bend: r });
}

export const LOOKS = {
  daisy: {
    build(b, o) {
      const H = 2.55;
      stem(b, [[0, 0, 0], [0.06, 0.85, 0.02], [-0.04, 1.75, 0.06], [0, H, 0.12]], 0.1, 0.075);
      for (let i = 0; i < 5; i++) blade(b, { p: [0, 0.04, 0], a: i * 1.26 + 0.3, up: 0.35, len: 0.95, wid: 0.46, shape: 'spoon', c: GREEN_D, c2: GREEN, bend: -0.1, cup: 0.2 });
      blade(b, { p: [0.02, 1.05, 0.03], a: 1.9, up: 0.75, len: 0.85, wid: 0.36, c: GREEN_D, c2: GREEN, bend: -0.2 });
      if (o.bud) return bud(b, [0, H, 0.12], 0.42, shade(o.c0, -0.05), { tip: o.c1 });
      b.use('head', [0, H, 0.12], { look: true });
      b.frame(fm([0, H + 0.08, 0.14], 1.2));
      b.add(P.dome(8, 3), { p: [0, -0.06, 0], r: [PI, 0, 0], s: [0.36, 0.2, 0.36], c: GREEN });
      ring(b, 14, { r0: 0.25, y: -0.04, up: 0.02, len: 0.92, wid: 0.36, shape: 'petal', off: PI / 14, c: shade(o.c0, -0.1), c2: shade(o.c0, -0.03), bend: 0.08, cup: 0.2 });
      ring(b, 14, { r0: 0.3, y: 0.02, up: 0.16, len: 1.0, wid: 0.38, shape: 'petal', c: mixCol(o.c0, o.c1, 0.15), c2: o.c0, bend: 0.12, cup: 0.22 });
      b.add(P.dome(12, 4), { s: [0.52, 0.28, 0.52], c: shade(o.c1, -0.12), c2: shade(o.c1, 0.1), gy: [0, 1] });
      face(b, 'happy', [0, 0.29, 0.0], 0.7, 1.0, [-PI / 2, 0, 0]);
      b.frame(null);
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 1.3 + ph) * 0.07;
    },
  },

  pea: {
    sprout: 'vine',
    lookClamp: 0.75,
    leaf: (o) => o.c1,
    build(b, o) {
      const vine = o.c1, pod = o.c0;
      const sx = -0.55, sz = -0.4;
      b.add(P.cyl(1, 1, 5), { p: [sx, 0, sz], s: [0.07, 3.2, 0.07], c: '#c49a52', c2: '#e2c07a', gy: [0, 1] });
      b.add(P.sphere(5, 3), { p: [sx, 3.2, sz], s: 0.09, c: '#c49a52' });
      const pts = [];
      for (let k = 0; k <= 9; k++) {
        const a = k * 1.3;
        pts.push([sx + Math.cos(a) * 0.17, 0.02 + k * 0.33, sz + Math.sin(a) * 0.17]);
      }
      stem(b, pts, 0.075, 0.05, vine, { segs: 12, radial: 4 });
      [[0.55, 0.3], [1.25, 2.3], [1.95, 4.0], [2.65, 5.6]].forEach(([y, a], i) => {
        blade(b, { p: [sx, y, sz], a, up: 0.45, len: 0.78, wid: 0.62, shape: 'round', segL: 3, c: shade(vine, -0.12), c2: shade(vine, 0.12), bend: -0.15, cup: 0.25 });
        blade(b, { p: [sx, y + 0.08, sz], a: a + 2.5, up: 0.5, len: 0.66, wid: 0.54, shape: 'round', segL: 3, c: shade(vine, -0.12), c2: shade(vine, 0.12), bend: -0.15, cup: 0.25 });
        if (i % 2) b.add(P.torus(0.12, 3, 8, 4.4), { p: [sx + Math.sin(a + 1.2) * 0.4, y + 0.25, sz + Math.cos(a + 1.2) * 0.4], r: [0.3, a, 0.9], s: 0.16, c: vine });
      });
      stem(b, [[sx + 0.05, 2.75, sz + 0.05], [-0.25, 2.85, -0.1], [0.02, 2.65, 0.15]], 0.05, 0.04, vine);
      if (o.bud) {
        smallFlower(b, [sx + 0.35, 1.7, sz + 0.25], 0.28, '#ffffff', '#b8f0a0', 5, 1.1, 0.4);
        smallFlower(b, [sx - 0.3, 2.3, sz + 0.2], 0.24, '#f7d9ff', '#b8f0a0', 5, 1.1, -0.4);
        b.use('head', [0.02, 2.6, 0.15], { look: true });
        b.add(P.sphere(10, 6), { p: [0.02, 2.3, 0.18], r: [0, 0, 0.25], s: [0.7, 0.26, 0.26], c: pod, c2: shade(pod, 0.15), gy: [-1, 1] });
        sphereFace(b, 'sleepy', [0.02, 2.3, 0.18], 0.26, 0.34, 0.3);
        return;
      }
      b.use('head', [0.02, 2.65, 0.15], { look: true });
      const cy = 2.05, cz = 0.22;
      b.add(P.dome(10, 3), { p: [0, cy, cz], r: [PI, 0, 0], s: [1.2, 0.42, 0.5], c: shade(vine, -0.25), c2: vine, gy: [-1, 0] });
      b.add(P.dome(10, 3), { p: [0, cy + 0.04, cz - 0.36], r: [-1.25, 0, 0], s: [1.2, 0.42, 0.5], c: shade(vine, -0.2), c2: vine });
      b.add(P.cone(6), { p: [1.12, cy + 0.02, cz], r: [0, 0, -PI / 2 - 0.35], s: [0.13, 0.4, 0.13], c: shade(pod, -0.15) });
      b.add(P.cone(6), { p: [-1.12, cy + 0.02, cz], r: [0, 0, PI / 2 + 0.35], s: [0.13, 0.4, 0.13], c: shade(pod, -0.15) });
      stem(b, [[0.02, 2.65, 0.15], [0.0, 2.35, 0.0], [0.0, cy + 0.2, cz - 0.3]], 0.05, 0.05, vine);
      ['happy', 'grin', 'wink'].forEach((f, i) => {
        const x = (i - 1) * 0.72;
        b.add(P.sphere(8, 6), { p: [x, cy + 0.13, cz + 0.02], s: 0.38, c: shade(pod, -0.08), c2: shade(pod, 0.18), gy: [-1, 1] });
        sphereFace(b, f, [x, cy + 0.13, cz + 0.02], 0.38, 0.54, 0.4);
      });
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 1.6 + ph) * 0.06;
    },
  },

  tulip: {
    build(b, o) {
      const H = 2.35;
      stem(b, [[0, 0, 0], [0.05, 0.8, 0], [0.02, 1.6, 0.04], [0, H, 0.05]], 0.1, 0.085);
      blade(b, { p: [0.05, 0.02, 0], a: 1.3, up: 1.05, len: 2.0, wid: 0.66, shape: 'blade', segL: 6, bend: -0.45, cup: 0.35, c: GREEN_D, c2: GREEN });
      blade(b, { p: [-0.05, 0.02, 0], a: -1.9, up: 1.15, len: 1.7, wid: 0.6, shape: 'blade', segL: 6, bend: -0.4, cup: 0.35, c: GREEN_D, c2: GREEN });
      if (o.bud) return bud(b, [0, H, 0.05], 0.46, o.c0, { tip: o.c1 });
      b.use('head', [0, H, 0.05], { look: true });
      const y = H - 0.05, c = [0, y, 0.05];
      // smooth egg-shaped cup with three pointed petals wrapped around it
      const cup = [[0.0, 0], [0.3, 0.04], [0.5, 0.24], [0.58, 0.55], [0.54, 0.86], [0.44, 1.02], [0.38, 0.98]];
      b.add(latheGeo('tulipCup', cup, 14), { p: c, c: shade(o.c0, -0.12), c2: o.c0, gy: [0, 1] });
      ring(b, 3, { center: c, r0: 0.34, y: 0.05, off: PI / 3, up: 1.42, len: 1.2, wid: 0.9, shape: 'point', segL: 4, segW: 2, c: o.c0, c2: shade(o.c1, 0.05), bend: 0.14, cup: 0.3 });
      ring(b, 3, { center: c, r0: 0.4, y: 0.04, off: 0, up: 1.36, len: 1.28, wid: 0.96, shape: 'point', segL: 4, segW: 2, c: shade(o.c0, 0.04), c2: shade(o.c1, 0.12), bend: 0.14, cup: 0.3 });
      face(b, 'joy', [0, y + 0.58, 0.05 + 0.58], 0.66, 0.9, [0.12, 0, 0]);
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 1.1 + ph) * 0.06;
    },
  },

  sunflower: {
    build(b, o) {
      const H = 3.15;
      stem(b, [[0, 0, 0], [0.08, 1.0, 0], [-0.05, 2.1, 0.05], [0, H, 0.16]], 0.15, 0.1);
      [[0.75, 0.5, 1.15], [1.35, 3.5, 1.05], [2.0, 1.3, 0.9], [2.55, 4.4, 0.75]].forEach(([y, a, l]) =>
        blade(b, { p: [0, y, 0.02], a, up: 0.5, len: l, wid: l * 0.82, shape: 'leaf', bend: -0.35, cup: 0.25, c: GREEN_D, c2: GREEN, serrate: 0.1, segL: 5 }));
      if (o.bud) return bud(b, [0, H, 0.16], 0.55, GREEN, { tip: o.c0, sepal: GREEN_D });
      b.use('head', [0, H, 0.16], { look: true });
      b.frame(fm([0, H + 0.1, 0.22], 1.28));
      b.add(P.dome(12, 3), { p: [0, -0.06, 0], r: [PI, 0, 0], s: [0.8, 0.26, 0.8], c: GREEN_D });
      ring(b, 15, { r0: 0.55, y: -0.05, up: 0.04, len: 0.95, wid: 0.44, shape: 'point', segL: 3, c: shade(o.c0, -0.08), c2: shade(o.c0, 0.05), bend: 0.1, cup: 0.2, off: PI / 15 });
      ring(b, 15, { r0: 0.55, y: 0.0, up: 0.16, len: 0.9, wid: 0.42, shape: 'point', segL: 3, c: shade(o.c0, 0.05), c2: shade(o.c0, 0.35), bend: 0.12, cup: 0.22 });
      const disc = shade(o.c1, 0.22);
      b.add(P.dome(14, 3), { s: [0.74, 0.2, 0.74], c: disc, cf: (x, y, z, i) => (y < 0.45 ? shade(o.c1, -0.1) : i % 3 === 0 ? shade(disc, -0.2) : null) });
      face(b, 'grin', [0, 0.212, 0.03], 0.98, 2.7, [-PI / 2, 0, 0]);
      b.frame(null);
    },
    anim(p, t, ph) {
      p.head.rotation.x = Math.sin(t * 0.9 + ph) * 0.05;
      p.head.rotation.z = Math.sin(t * 0.7 + ph * 2) * 0.04;
    },
  },

  mushroom: {
    sprout: 'shroom',
    lookAll: true,
    build(b, o) {
      const cap = o.c0, stalk = o.c1;
      const prof = [[0.5, 0], [0.56, 0.12], [0.5, 0.5], [0.42, 1.0], [0.38, 1.4], [0.42, 1.62], [0.0, 1.66]];
      b.add(latheGeo('mushStalk', prof, 12), { c: shade(stalk, -0.08), c2: stalk, gy: [0, 1.6] });
      face(b, 'happy', [0, 0.82, 0.465], 0.64, 0.55);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + 0.9;
        b.add(P.blob(i + 2, 0.25, 0), { p: [Math.sin(a) * 0.55, 0.04, Math.cos(a) * 0.55], s: [0.34, 0.18, 0.34], c: '#4f9f3d', c2: '#7ccf5a', gy: [-1, 1] });
      }
      const baby = (x, z, s) => {
        b.add(P.cyl(0.8, 1, 8), { p: [x, 0, z], s: [0.28 * s, 0.7 * s, 0.28 * s], c: stalk });
        b.add(P.dome(10, 3, 0.55), { p: [x, 0.62 * s, z], s: [0.6 * s, 0.45 * s, 0.6 * s], c: cap, c2: shade(cap, 0.15) });
        b.add(P.sphere(5, 3), { p: [x + 0.1 * s, 0.98 * s, z + 0.2 * s], s: [0.12 * s, 0.05 * s, 0.12 * s], c: '#ffffff' });
      };
      baby(1.0, 0.3, 0.85);
      baby(-0.9, -0.25, 0.65);
      const cy = 1.55;
      if (o.bud) {
        b.add(P.sphere(12, 7), { p: [0, cy + 0.15, 0], s: [0.85, 0.7, 0.85], c: cap, c2: shade(cap, 0.15), gy: [-1, 1] });
        return;
      }
      b.add(P.dome(14, 5, 0.53), { p: [0, cy, 0], s: [1.55, 1.12, 1.55], c: shade(cap, -0.08), c2: shade(cap, 0.14), gy: [0, 1] });
      b.add(P.disc(14), { p: [0, cy - 0.08, 0], r: [PI, 0, 0], s: 1.5, c: shade(stalk, -0.22) });
      [[0, 0.18], [0.3, 0.78], [1.5, 0.66], [2.6, 0.8], [3.8, 0.68], [5.0, 0.76], [0.9, 1.22], [2.2, 1.28], [3.3, 1.2], [4.5, 1.25], [5.7, 1.2]].forEach(([th, ph], i) => {
        const n = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
        const s = i === 0 ? 0.3 : 0.22 + hash(i) * 0.1;
        b.add(P.sphere(7, 2), { p: [n[0] * 1.53, cy + n[1] * 1.1, n[2] * 1.53], q: aim([n[0] / 1.55, n[1] / 1.12, n[2] / 1.55]), s: [s, 0.07, s], c: '#fffaf0' });
      });
    },
    anim(p, t, ph) {
      const k = Math.sin(t * 2.1 + ph) * 0.025;
      p.body.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
    },
  },

  fern: {
    sprout: 'curl',
    leaf: (o) => o.c0,
    build(b, o) {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.35;
        blade(b, { p: [0, 0.05, 0], a, up: 1.0 + hash(i + 3) * 0.35, len: 2.2 + hash(i) * 0.7, wid: 0.78, shape: 'feather', serrate: 0.55, segL: 10, bend: -0.55, cup: -0.05, c: shade(o.c1, -0.1), c2: shade(o.c0, 0.12) });
      }
      const H = o.bud ? 1.6 : 2.15;
      stem(b, [[0, 0, 0], [0.05, H * 0.45, 0.05], [0, H - 0.3, 0.15]], 0.1, 0.09, o.c1);
      b.use('head', [0, H - 0.3, 0.15], { look: true });
      const hz = 0.2;
      b.add(P.torus(0.42, 5, 10, TAU * 0.82), { p: [0, H, hz], r: [0, 0, -0.9], s: 0.44, c: shade(o.c1, 0.05), c2: o.c0, gy: [-1, 1] });
      b.add(P.sphere(8, 6), { p: [0, H, hz], s: [0.38, 0.38, 0.3], c: o.c0, c2: shade(o.c0, 0.2), gy: [-1, 1] });
      if (o.bud) {
        sphereFace(b, 'sleepy', [0, H, hz], 0.31, 0.5, 0.2);
        return;
      }
      sphereFace(b, 'grin', [0, H, hz], 0.31, 0.56, 0.2);
      const stripes = ['#ff4f9a', '#ffd23f', '#3d9bff'];
      b.add(P.cone(10), { p: [0.08, H + 0.3, hz - 0.05], r: [-0.1, 0, -0.28], s: [0.26, 0.72, 0.26], c: '#ff4f9a', cf: (x, y) => stripes[Math.min(2, Math.floor(y * 3))] });
      b.add(P.sphere(6, 4), { p: [0.27, H + 0.98, hz - 0.12], s: 0.12, c: '#ffffff' });
      b.use('body');
      const conf = ['#ff4f9a', '#ffd23f', '#3d9bff', '#b36bff', '#4cd964'];
      for (let i = 0; i < 12; i++) {
        const a = hash(i + 40) * TAU, r = 0.5 + hash(i + 60) * 1.3;
        b.add(P.disc(4), { p: [Math.sin(a) * r, 0.04, Math.cos(a) * r], r: [0, a * 3, 0], s: [0.1, 1, 0.07], c: conf[i % 5], keep: true });
      }
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 1.8 + ph) * 0.08;
      p.head.rotation.x = Math.sin(t * 1.2 + ph) * 0.05;
    },
  },

  bubble: {
    sprout: 'bubble',
    lookAll: true,
    leaf: () => '#3fb8a0',
    build(b, o) {
      for (let i = 0; i < 5; i++) blade(b, { p: [0, 0.04, 0], a: i * 1.26 + 0.2, up: 0.3, len: 0.9, wid: 0.62, shape: 'round', c: '#2f9f8a', c2: '#6ee0c0', bend: 0.05, cup: 0.3 });
      const sc = o.bud ? 0.55 : 1;
      const bubbles = [[0.0, 2.95, 0.15, 0.72, 'b1'], [-0.95, 2.05, -0.1, 0.46, 'b2'], [0.98, 2.3, -0.05, 0.5, 'b3'], [0.5, 3.75, -0.4, 0.34, 'b2'], [-0.55, 3.5, -0.35, 0.3, 'b3']];
      bubbles.forEach(([x, y, z, r, g], i) => {
        if (o.bud) {
          y *= 0.72;
          x *= 0.8;
        }
        r *= sc;
        stem(b, [[0, 0.05, 0], [x * 0.3 + 0.15 * Math.sin(i * 2), y * 0.4, z * 0.3], [x * 0.85, y * 0.72, z * 0.8], [x, y - r * 0.95, z]], 0.05, 0.035, '#3aa987', { segs: 5, radial: 3 });
        b.add(P.cone(5), { p: [x, y - r * 1.02, z], s: [r * 0.3, r * 0.25, r * 0.3], c: '#3aa987' });
        b.use(g, [x, y, z]);
        b.add(P.sphere(10, 7), { p: [x, y, z], s: r, ch: 'trans', c: o.c0, c2: o.c1, gy: [-1, 1] });
        b.add(P.oct(), { p: [x - r * 0.38, y + r * 0.45, z + r * 0.68], r: [0.3, 0, 0.6], s: [r * 0.2, r * 0.11, r * 0.06], c: '#ffffff', glow: 0.9, keep: true });
        if (i === 0) sphereFace(b, o.bud ? 'sleepy' : 'oh', [x, y, z], r, r * 0.98, 0.15);
        b.use('body');
      });
    },
    anim(p, t, ph) {
      p.b1.position.y = p.b1.userData.base.y + Math.sin(t * 1.6 + ph) * 0.08;
      p.b2.position.y = p.b2.userData.base.y + Math.sin(t * 1.9 + ph + 2) * 0.07;
      p.b3.position.y = p.b3.userData.base.y + Math.sin(t * 1.4 + ph + 4) * 0.07;
    },
  },

  clover: {
    leaf: (o) => o.c0,
    build(b, o) {
      const H = 2.25;
      const lf = o.c0;
      stem(b, [[0, 0, 0], [0.06, 0.9, 0], [-0.03, 1.6, 0.05], [0, H, 0.1]], 0.1, 0.08, shade(lf, -0.25));
      const mini = (x, z, s, rot) => {
        stem(b, [[x, 0, z], [x, 0.45 * s, z]], 0.04, 0.04, shade(lf, -0.25));
        for (let k = 0; k < 3; k++) b.add(shapeGeo('heart', heartShape), { p: [x, 0.45 * s, z], r: [-PI / 2 + 0.3, rot + (k * TAU) / 3, 0], s: 0.45 * s, c: shade(lf, -0.15), c2: lf, gy: [0, 1] });
      };
      mini(0.95, 0.35, 1, 0.3);
      mini(-0.85, -0.2, 0.8, 1.2);
      if (o.bud) return bud(b, [0, H, 0.1], 0.42, lf, { tip: shade(lf, 0.2) });
      b.use('head', [0, H, 0.1], { look: true });
      b.frame(fm([0, H + 0.05, 0.12], 1.05));
      for (let k = 0; k < 4; k++) {
        const a = PI / 4 + (k * PI) / 2;
        b.add(shapeGeo('heart', heartShape), { p: [0, 0.02, 0], r: [-PI / 2 + 0.28, a, 0], s: 1.0, c: shade(lf, -0.2), c2: shade(lf, 0.12), gy: [0, 1] });
      }
      b.add(P.sphere(10, 6), { p: [0, 0.08, 0], s: [0.3, 0.16, 0.3], c: shade(lf, 0.1) });
      face(b, 'happy', [0, 0.25, 0], 0.52, 0.56, [-PI / 2, 0, 0]);
      b.frame(null);
      crownParts(b, [0, H + 0.62, 0.02], 0.95, o.c1);
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 1.4 + ph) * 0.07;
    },
  },

  cactus: {
    sprout: 'cactus',
    lookAll: true,
    leaf: (o) => o.c0,
    build(b, o) {
      const g = o.c0;
      const ribs = (x, y, z) => (Math.floor(((Math.atan2(x, z) + PI) / TAU) * 14) % 2 ? shade(g, -0.12) : null);
      const H = o.bud ? 2.0 : 2.6;
      const prof = [[0.0, 0], [0.55, 0.02], [0.68, 0.3], [0.7, H - 0.62], [0.6, H - 0.25], [0.38, H - 0.04], [0.0, H + 0.03]];
      b.add(latheGeo('cactus' + H, prof, 14), { c: g, c2: shade(g, 0.1), gy: [0, H], cf: ribs });
      stem(b, [[0.55, 1.0, 0], [0.98, 1.05, 0], [1.12, 1.35, 0], [1.12, 1.95, 0]], 0.27, 0.25, g, { cap: true, radial: 8, c2: shade(g, 0.1), gy: [1, 2] });
      stem(b, [[-0.55, 1.3, 0], [-0.92, 1.36, 0], [-1.02, 1.66, 0], [-1.02, 2.1, 0]], 0.23, 0.21, g, { cap: true, radial: 8, c2: shade(g, 0.1), gy: [1.3, 2.1] });
      [[0.9, 0.45], [2.1, 0.8], [3.3, 1.8], [4.3, 0.6], [5.4, 1.5], [0.4, 2.1], [2.8, 2.2], [1.6, 1.2], [4.9, 2.0], [-0.5, 1.9]].forEach(([a, y]) => {
        if (Math.abs(Math.sin(a / 2)) < 0.25 && y > 1) return;
        const n = [Math.sin(a), 0.2, Math.cos(a)];
        b.add(P.cone(3), { p: [n[0] * 0.66, y, n[2] * 0.66], q: aim(n), s: [0.035, 0.2, 0.035], c: '#fffbe6' });
      });
      face(b, 'happy', [0, 1.45, 0.72], 0.82, 0.72, [-0.05, 0, 0]);
      for (let i = 0; i < 4; i++) rock(b, [Math.sin(i * 1.9 + 1) * 1.0, 0.04, Math.cos(i * 1.9 + 1) * 0.9], 0.14 + hash(i) * 0.08, '#d9b27a', i + 3);
      if (o.bud) {
        b.add(P.sphere(8, 5), { p: [0.05, H + 0.1, 0.05], s: [0.2, 0.26, 0.2], c: o.c1, c2: shade(o.c1, 0.2), gy: [-1, 1] });
        return;
      }
      b.use('head', [0.05, H, 0.05]);
      b.frame(fm([0.05, H + 0.02, 0.08], 0.35));
      ring(b, 6, { r0: 0.06, up: 0.45, len: 0.52, wid: 0.36, shape: 'round', segL: 3, c: shade(o.c1, -0.05), c2: shade(o.c1, 0.2), cup: 0.35, bend: 0.1 });
      ring(b, 5, { r0: 0.04, up: 0.95, len: 0.4, wid: 0.3, shape: 'round', segL: 2, off: 0.5, c: o.c1, c2: shade(o.c1, 0.3), cup: 0.35 });
      b.add(P.sphere(6, 4), { p: [0, 0.12, 0], s: 0.1, c: '#ffe066' });
      b.frame(null);
      b.use('body');
      smallFlower(b, [1.12, 2.05, 0.05], 0.26, o.c1, '#ffe066', 5, 0.4, 0.3);
    },
    anim(p, t, ph) {
      const k = Math.sin(t * 1.7 + ph) * 0.02;
      p.body.scale.set(1 + k, 1 - k, 1 + k);
      if (p.head) p.head.rotation.z = Math.sin(t * 1.3 + ph) * 0.1;
    },
  },

  rose: {
    leaf: () => '#3f8f3a',
    build(b, o) {
      const H = 2.75;
      const sg = '#3a8a36';
      b.add(P.blob(7, 0.15, 1), { p: [0, -0.1, 0], s: [1.2, 0.3, 1.1], c: '#e2b979', c2: '#f0cf95', gy: [-1, 1] });
      rock(b, [0.9, 0.08, 0.5], 0.22, '#c98e5a', 2);
      rock(b, [-0.85, 0.08, -0.35], 0.18, '#d9a36a', 5);
      stem(b, [[0, 0, 0], [0.08, 1.0, 0.02], [-0.05, 2.0, 0.05], [0, H, 0.12]], 0.09, 0.07, sg);
      [[0.5, 0.4], [0.95, 2.8], [1.45, 1.1], [1.9, 4.0], [2.3, 5.5]].forEach(([y, a]) =>
        b.add(P.cone(4), { p: [Math.sin(a) * 0.08, y, Math.cos(a) * 0.08], q: aim([Math.sin(a), 0.4, Math.cos(a)]), s: [0.05, 0.16, 0.05], c: '#6b3a2a' }));
      [[0.85, 0.6, 0.85], [1.35, 3.6, 0.8], [1.95, 1.8, 0.7]].forEach(([y, a, l]) => {
        stem(b, [[0, y, 0], [Math.sin(a) * 0.3, y + 0.12, Math.cos(a) * 0.3]], 0.035, 0.03, sg);
        blade(b, { p: [Math.sin(a) * 0.3, y + 0.12, Math.cos(a) * 0.3], a, up: 0.35, len: l, wid: l * 0.6, serrate: 0.12, segL: 5, c: '#2f7a32', c2: '#55a84a', bend: -0.2, cup: 0.25 });
        blade(b, { p: [Math.sin(a) * 0.2, y + 0.08, Math.cos(a) * 0.2], a: a + 0.9, up: 0.4, len: l * 0.7, wid: l * 0.45, serrate: 0.12, segL: 5, c: '#2f7a32', c2: '#55a84a', bend: -0.2, cup: 0.25 });
      });
      if (o.bud) return bud(b, [0, H, 0.12], 0.4, shade(o.c0, -0.1), { tip: o.c0 });
      b.use('head', [0, H, 0.12], { look: true });
      b.frame(fm([0, H + 0.02, 0.14], 0.8));
      const dark = shade(o.c0, -0.3);
      ring(b, 5, { r0: 0.1, up: -0.35, len: 0.5, wid: 0.2, shape: 'point', c: sg, c2: shade(sg, 0.2) });
      ring(b, 6, { r0: 0.26, y: 0.02, up: 0.5, len: 0.88, wid: 0.95, shape: 'round', c: shade(o.c0, -0.1), c2: shade(o.c0, 0.15), bend: -0.3, cup: 0.4, off: 0.3 });
      ring(b, 5, { r0: 0.17, y: 0.1, up: 1.0, len: 0.82, wid: 0.88, shape: 'round', c: dark, c2: o.c0, bend: 0.05, cup: 0.55, off: 0.9 });
      ring(b, 4, { r0: 0.09, y: 0.16, up: 1.3, len: 0.68, wid: 0.72, shape: 'round', c: shade(o.c0, -0.35), c2: shade(o.c0, -0.1), bend: 0.3, cup: 0.7, off: 0.2 });
      b.add(P.sphere(6, 4), { p: [0, 0.42, 0], s: [0.2, 0.3, 0.2], c: shade(o.c0, -0.4), c2: shade(o.c0, -0.2), gy: [-1, 1] });
      b.frame(null);
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 1.0 + ph) * 0.05;
    },
  },

  tater: {
    leaf: (o) => o.c1,
    build(b, o) {
      const lf = mixCol(o.c1, '#4fc23a', 0.7), spud = o.c0;
      const sc = o.bud ? 0.75 : 1;
      // bushy potato top: round leaves in clusters on short stems, behind the spud
      const clusters = [[0, 2.1, -0.4], [-0.8, 1.6, -0.3], [0.8, 1.7, -0.35], [-0.5, 1.35, 0.25], [0.5, 1.3, 0.2], [0, 1.5, -0.9]];
      clusters.forEach(([x, y, z], i) => {
        y *= sc;
        stem(b, [[x * 0.15, 0.05, z * 0.3 - 0.2], [x * 0.6, y * 0.55, z * 0.7 - 0.1], [x, y, z]], 0.07, 0.05, shade(lf, -0.25), { segs: 3, radial: 4 });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + i * 0.7;
          blade(b, { p: [x, y - 0.05, z], a, up: 0.05 + hash(i * 5 + k) * 0.45, len: 0.85 * sc, wid: 0.72 * sc, shape: 'round', segL: 3, c: shade(lf, -0.25), c2: lf, bend: -0.3, cup: 0.3 });
        }
        b.add(P.sphere(6, 4), { p: [x, y + 0.02, z], s: [0.5 * sc, 0.3 * sc, 0.5 * sc], c: shade(lf, -0.15), c2: lf, gy: [-1, 1] });
      });
      if (!o.bud) {
        smallFlower(b, [0, 2.36, -0.4], 0.28, '#f1e3ff', '#ffd23f', 5, 0.3);
        smallFlower(b, [-0.8, 1.86, -0.3], 0.26, '#ffffff', '#ffd23f', 5, 0.5, -0.5);
        smallFlower(b, [0.82, 1.96, -0.35], 0.26, '#e6d0ff', '#ffd23f', 5, 0.5, 0.6);
        smallFlower(b, [0.05, 1.75, -1.1], 0.24, '#ffffff', '#ffd23f', 5, -0.3, PI);
      }
      const spots = (x, y, z, i) => (hash(i * 1.7) > 0.84 ? shade(spud, -0.3) : null);
      b.add(P.blob(9, 0.1, 1), { p: [-0.95, 0.12, 0.5], r: [0.3, 0.5, 0.4], s: [0.34, 0.26, 0.3], c: spud, cf: spots });
      b.add(P.dome(10, 2), { p: [0, 0, 0.45], s: [1.2, 0.2, 1.0], c: '#6e4a2c', c2: '#8f6440' });
      b.use('tater', [0, 0.1, 0.55], { look: true });
      const s2 = o.bud ? 0.72 : 1;
      b.add(P.blob(3, 0.1, 1), { p: [0, 0.62 * s2, 0.55], s: [0.8 * s2, 0.7 * s2, 0.66 * s2], c: shade(spud, -0.05), c2: shade(spud, 0.15), gy: [-1, 1], cf: spots });
      sphereFace(b, o.bud ? 'sleepy' : 'grin', [0, 0.62 * s2, 0.55], 0.68 * s2, 0.74 * s2, 0.25);
      blade(b, { p: [0.05, 1.3 * s2, 0.5], a: 0.6, up: 0.9, len: 0.38, wid: 0.3, shape: 'round', segL: 3, c: lf, c2: shade(lf, 0.2) });
      blade(b, { p: [0.05, 1.3 * s2, 0.5], a: -2.4, up: 0.9, len: 0.32, wid: 0.26, shape: 'round', segL: 3, c: lf, c2: shade(lf, 0.2) });
    },
    anim(p, t, ph) {
      // pops up out of the soil to peek, then settles back down
      const k = Math.max(0, Math.sin(t * 0.8 + ph));
      p.tater.position.y = p.tater.userData.base.y + k * k * 0.35 - 0.15;
      p.tater.rotation.z = Math.sin(t * 6 + ph) * 0.08 * k;
    },
  },

  aloe: {
    sprout: 'rosette',
    leaf: (o) => o.c0,
    build(b, o) {
      const base = mixCol(o.c1, '#2f9a3f', 0.45), tip = mixCol(o.c0, '#86e07a', 0.45);
      const speck = (x, y, z, i) => (hash(i * 3.1) > 0.82 ? shade(tip, 0.45) : null);
      const sc = o.bud ? 0.8 : 1;
      ring(b, 7, { r0: 0.12, up: 0.5, len: 1.75 * sc, wid: 0.6, shape: 'point', cup: 0.5, bend: -0.35, serrate: 0.12, segL: 6, c: base, c2: tip, cf: speck, off: 0.2 });
      ring(b, 6, { r0: 0.1, up: 0.95, len: 1.6 * sc, wid: 0.54, shape: 'point', cup: 0.5, bend: -0.25, serrate: 0.12, segL: 6, c: base, c2: shade(tip, 0.1), cf: speck, off: PI / 6 });
      ring(b, 4, { r0: 0.06, up: 1.25, len: 1.25 * sc, wid: 0.46, shape: 'point', cup: 0.55, bend: -0.1, segL: 5, c: base, c2: shade(tip, 0.15), off: PI / 4 });
      b.use('head', [0, 0.1, 0.1], { look: true });
      const hc = [0, 0.78 * sc, 0.18];
      b.add(P.sphere(9, 7), { p: hc, s: [0.46, 0.55 * sc, 0.42], c: shade(tip, -0.05), c2: shade(tip, 0.25), gy: [-1, 1] });
      b.add(P.cone(6), { p: [0, hc[1] + 0.45 * sc, 0.16], s: [0.2, 0.45, 0.2], c: shade(tip, 0.2) });
      sphereFace(b, o.bud ? 'sleepy' : 'cool', hc, 0.43, 0.66, 0.3);
      b.use('body');
      if (o.bud) return;
      stem(b, [[0, 0.3, -0.1], [0.08, 2.0, -0.15], [0.02, 3.5, -0.1]], 0.07, 0.05, '#7a9a4a');
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4, y = 3.0 + i * 0.07, r = 0.12 + (1 - i / 12) * 0.12;
        b.add(P.cyl(1, 0.35, 6), { p: [0.02 + Math.sin(a) * r, y, -0.1 + Math.cos(a) * r], q: aim([Math.sin(a) * 0.9, -1, Math.cos(a) * 0.9]), s: [0.07, 0.34, 0.07], c: '#ff5a1a', c2: '#ffb020', gy: [0, 1] });
      }
    },
    anim(p, t, ph) {
      p.head.rotation.x = Math.sin(t * 1.5 + ph) * 0.05;
    },
  },

  flytrap: {
    lookAll: true,
    leaf: (o) => o.c0,
    build(b, o) {
      const g = o.c0, red = o.c1;
      for (let i = 0; i < 6; i++) blade(b, { p: [0, 0.04, 0], a: (i / 6) * TAU + 0.3, up: 0.22, len: 1.05, wid: 0.55, shape: 'spoon', segL: 3, c: shade(g, -0.25), c2: g, cup: 0.3, bend: 0.1 });
      const trap = (name, stemPts, hinge, s, yaw, eyes) => {
        stem(b, stemPts, 0.1 * s + 0.02, 0.07, shade(g, -0.15));
        const lower = fm(hinge, 0, yaw);
        b.frame(lower);
        b.add(P.dome(9, 3), { p: [0, 0, 0.55 * s], r: [PI, 0, 0], s: [0.62 * s, 0.3 * s, 0.55 * s], c: shade(g, -0.1), c2: g, gy: [-1, 0] });
        b.add(P.dome(9, 2), { p: [0, 0.02, 0.55 * s], r: [PI, 0, 0], s: [0.56 * s, 0.25 * s, 0.49 * s], c: shade(red, -0.15), c2: red, gy: [-1, 0] });
        const nt = s > 0.9 ? 7 : 5;
        for (let k = 0; k < nt; k++) {
          const a = -1.35 + (k / (nt - 1)) * 2.7;
          b.add(P.cone(3), { p: [Math.sin(a) * 0.6 * s, 0.03, 0.55 * s + Math.cos(a) * 0.53 * s], s: [0.05 * s, 0.2 * s, 0.05 * s], c: '#fffbe6', keep: true });
        }
        b.frame(null);
        if (o.bud) return;
        b.use(name, hinge, { yaw });
        b.frame(fm(hinge));
        b.add(P.dome(9, 3), { p: [0, 0, 0.55 * s], s: [0.62 * s, 0.32 * s, 0.55 * s], c: g, c2: shade(g, 0.15), gy: [0, 1] });
        b.add(P.dome(9, 2), { p: [0, -0.02, 0.55 * s], s: [0.56 * s, 0.26 * s, 0.49 * s], c: red, c2: shade(red, -0.15), gy: [0, 1] });
        for (let k = 0; k < nt; k++) {
          const a = -1.35 + (k / (nt - 1)) * 2.7;
          b.add(P.cone(3), { p: [Math.sin(a) * 0.6 * s, -0.03, 0.55 * s + Math.cos(a) * 0.53 * s], r: [PI, 0, 0], s: [0.05 * s, 0.2 * s, 0.05 * s], c: '#fffbe6', keep: true });
        }
        if (eyes) {
          for (const ex of [-0.22, 0.22]) {
            b.add(P.sphere(7, 5), { p: [ex * s, 0.34 * s, 0.42 * s], s: 0.17 * s, c: '#ffffff', keep: true });
            b.add(P.oct(), { p: [ex * s * 1.05, 0.36 * s, 0.57 * s], s: [0.08 * s, 0.09 * s, 0.04 * s], c: '#1e1418', keep: true });
          }
        }
        b.frame(null);
        b.use('body');
      };
      const mainY = o.bud ? 2.0 : 2.55;
      trap('jaw', [[0, 0, 0], [0.05, mainY * 0.5, -0.05], [0, mainY, -0.35]], [0, mainY, -0.35], 1.1, 0, true);
      trap('jaw2', [[0, 0, 0], [-0.4, 0.9, 0], [-0.95, 1.55, 0.05]], [-0.95, 1.55, 0.05], 0.72, -0.9, false);
      trap('jaw3', [[0, 0, 0], [0.4, 0.7, -0.05], [0.9, 1.2, -0.1]], [0.9, 1.2, -0.1], 0.62, 1.0, false);
      if (o.bud) {
        b.frame(fm([0, mainY, -0.35]));
        b.add(P.dome(10, 3), { p: [0, 0.0, 0.6], s: [0.66, 0.2, 0.58], c: g });
        b.frame(null);
      }
    },
    anim(p, t, ph) {
      const snap = (tt, open) => {
        const c = (tt % 1 + 1) % 1;
        if (c < 0.05) return -open * (1 - Math.sin((c / 0.05) * PI * 0.5));
        if (c < 0.25) return -open * ((c - 0.05) / 0.2);
        return -open + Math.sin(tt * 9) * 0.04;
      };
      if (p.jaw) p.jaw.rotation.x = snap(t * 0.22 + ph, 0.75);
      if (p.jaw2) p.jaw2.rotation.x = snap(t * 0.27 + ph + 0.4, 0.65);
      if (p.jaw3) p.jaw3.rotation.x = snap(t * 0.31 + ph + 0.7, 0.6);
    },
  },

  berry: {
    leaf: (o) => o.c1,
    build(b, o) {
      const lf = mixCol(o.c1, '#52c84a', 0.55), berry = o.c0;
      stem(b, [[0, 0, 0], [0.1, 0.45, 0], [0, 0.85, 0]], 0.2, 0.14, '#6b4a2f');
      const sc = o.bud ? 0.8 : 1;
      const blobs = [[0, 1.55, -0.2, 1.12], [-0.88, 1.1, 0.05, 0.76], [0.9, 1.12, 0.0, 0.78], [0.05, 2.35, -0.3, 0.74]];
      blobs.forEach(([x, y, z, r], i) => b.add(P.blob(i + 11, 0.16, 1), { p: [x * sc, y * sc, z * sc], s: r * sc, c: shade(lf, -0.18 + 0.08 * (i % 3)), c2: shade(lf, 0.22), gy: [-1, 1] }));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + 0.4;
        blade(b, { p: [Math.sin(a) * 0.9 * sc, 0.95 * sc, Math.cos(a) * 0.7 * sc], a, up: -0.9, len: 0.6, wid: 0.2, shape: 'blade', segL: 3, segW: 1, c: '#5f7f3a', c2: '#8fae5a', bend: 0.1 });
      }
      if (o.bud) {
        for (let i = 0; i < 5; i++) smallFlower(b, [Math.sin(i * 1.3) * 0.8, 1.2 + (i % 3) * 0.4, 0.6 + Math.cos(i * 1.3) * 0.2], 0.22, '#ffffff', '#ffe066', 5, 0.9, Math.sin(i * 1.3) * 0.6);
        return;
      }
      const hi = mixCol(berry, '#d78bff', 0.5);
      const cluster = (x, y, z, n) => {
        for (let k = 0; k < n; k++) {
          const a = k * 2.1 + x;
          const px = x + Math.sin(a) * 0.2, py = y + (k === 2 ? -0.2 : 0), pz = z + Math.cos(a) * 0.1;
          b.add(P.sphere(6, 4), { p: [px, py, pz], s: 0.24, c: berry, c2: hi, gy: [-1, 1], glow: 0.08 });
          if (k === 0) b.add(P.oct(), { p: [px - 0.07, py + 0.1, pz + 0.17], s: 0.045, c: '#ffffff', glow: 0.7, keep: true });
        }
      };
      cluster(-0.72, 1.75, 0.72, 3);
      cluster(0.72, 1.8, 0.66, 3);
      cluster(0.1, 2.72, 0.35, 2);
      cluster(-1.3, 1.05, 0.3, 2);
      cluster(1.32, 1.15, 0.2, 2);
      cluster(-0.6, 1.9, -0.95, 3);
      cluster(0.7, 1.4, -0.95, 2);
      b.use('head', [0, 1.3, 1.05], { look: true });
      b.add(P.sphere(10, 7), { p: [0, 1.3, 1.05], s: 0.46, c: shade(berry, 0.0), c2: hi, gy: [-1, 1] });
      b.add(P.oct(), { p: [-0.2, 1.52, 1.43], s: 0.08, c: '#ffffff', glow: 0.7, keep: true });
      sphereFace(b, 'happy', [0, 1.3, 1.05], 0.46, 0.6, 0.25);
      blade(b, { p: [0, 1.73, 1.02], a: 0.8, up: 0.6, len: 0.38, wid: 0.26, shape: 'round', segL: 3, c: lf, c2: shade(lf, 0.2) });
      blade(b, { p: [0, 1.73, 1.02], a: -1.4, up: 0.6, len: 0.34, wid: 0.24, shape: 'round', segL: 3, c: lf, c2: shade(lf, 0.2) });
    },
    anim(p, t, ph) {
      if (p.head) p.head.position.y = p.head.userData.base.y + Math.abs(Math.sin(t * 2.2 + ph)) * 0.08;
    },
  },

  glowcap: {
    sprout: 'shroom',
    glowy: true,
    lookAll: true,
    leaf: () => '#8f7fd0',
    fx: (o) => [
      { kind: 'halo', p: [0, 2.2, 0], size: 4.2, color: o.c0, opacity: 0.35 },
      { kind: 'sparkle', mode: 'rise', color: o.c0, count: 10, rx: 1.3, h: 3.6, y0: 0, size: 0.16, star: false },
    ],
    build(b, o) {
      const glow = o.c0, dark = o.c1;
      rock(b, [0.3, 0.05, -0.4], 0.45, shade(dark, 0.15), 3);
      rock(b, [-0.6, 0.05, 0.3], 0.32, shade(dark, 0.25), 6);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1;
        b.add(P.blob(i + 20, 0.25, 0), { p: [Math.sin(a) * 0.7, 0.03, Math.cos(a) * 0.6], s: [0.3, 0.12, 0.3], c: '#3f7f6a', c2: shade(glow, -0.2), glow: 0.1, glow2: 0.3, gy: [-1, 1] });
      }
      const sc = o.bud ? 0.7 : 1;
      const shroom = (x, z, h, r, fx, lean) => {
        h *= sc;
        const big = r > 0.5;
        r *= sc;
        const prof = [[0.3, 0], [0.34, 0.1], [0.27, 0.5], [0.22, 0.9], [0.25, 1.0], [0.0, 1.02]];
        b.add(latheGeo(big ? 'glowStalk' : 'glowStalkS', prof, big ? 8 : 6), { p: [x, 0, z], r: [lean, 0, -lean * 0.5], s: [r * 1.1, h, r * 1.1], c: '#cfc2f0', c2: '#efe8ff', glow: 0.1, glow2: 0.25 });
        const top = [x + Math.sin(lean * 0.5) * h, h * Math.cos(lean), z + Math.sin(lean) * h];
        b.add(P.dome(big ? 11 : 8, 3, 0.55), { p: [top[0], top[1] - 0.05, top[2]], r: [lean, 0, -lean * 0.5], s: [r, r * 0.66, r], c: shade(glow, -0.15), c2: shade(glow, 0.3), glow: 0.6, glow2: 1.0 });
        b.add(P.disc(big ? 12 : 8), { p: [top[0], top[1] - 0.08, top[2]], r: [PI + lean, 0, -lean * 0.5], s: r * 0.95, c: shade(glow, -0.4), glow: 0.35 });
        for (let k = 0; k < (big ? 4 : 2); k++) {
          const a = k * 1.7 + x, ph = 0.6 + (k % 2) * 0.45;
          const n = [Math.sin(ph) * Math.sin(a), Math.cos(ph), Math.sin(ph) * Math.cos(a)];
          b.add(P.sphere(5, 2), { p: [top[0] + n[0] * r, top[1] - 0.05 + n[1] * r * 0.66, top[2] + n[2] * r], q: aim(n), s: [r * 0.15, r * 0.05, r * 0.15], c: '#ffffff', glow: 1 });
        }
        if (fx) face(b, fx, [x + Math.sin(lean * 0.5) * h * 0.45, h * 0.45, z + r * 0.35 + Math.sin(lean) * h * 0.45], r * 0.7, r * 0.5);
      };
      shroom(0, 0, 2.4, 1.05, o.bud ? 'sleepy' : 'happy', 0);
      shroom(-1.0, 0.3, 1.5, 0.62, 'sleepy', -0.25);
      shroom(0.95, 0.4, 1.15, 0.52, 'joy', 0.3);
      shroom(0.45, -0.85, 0.7, 0.32, null, 0.2);
      shroom(-0.5, -0.75, 0.55, 0.26, null, -0.2);
    },
    anim(p, t, ph) {
      const k = Math.sin(t * 1.6 + ph) * 0.02;
      p.body.scale.set(1 + k, 1 - k, 1 + k);
    },
  },

  lily: {
    sprout: 'ember',
    leaf: () => '#3a4a2a',
    fx: (o) => [
      { kind: 'halo', p: [0, 3.2, 0.2], size: 3.8, color: o.c0, opacity: 0.4 },
      { kind: 'sparkle', mode: 'rise', color: o.c1, count: 12, rx: 1.2, h: 4.6, y0: 0, size: 0.16, star: false },
    ],
    build(b, o) {
      const lava = o.c0, hot = o.c1;
      const cracks = (x, y, z, i) => (hash(i * 2.3) > 0.72 ? [lava, 0.9] : null);
      rock(b, [0.8, 0.1, 0.4], 0.42, '#3a2622', 4, { cf: cracks });
      rock(b, [-0.75, 0.1, -0.35], 0.36, '#2e1e1a', 8, { cf: cracks });
      rock(b, [-0.3, 0.06, 0.8], 0.24, '#3a2622', 12, { cf: cracks });
      const H = 2.9;
      stem(b, [[0, 0, 0], [0.08, 1.2, 0], [-0.05, 2.2, 0.05], [0, H, 0.12]], 0.1, 0.075, '#34402a');
      [[0.05, 1.0, 2.0], [0.05, 3.3, 1.7], [0.6, 5.2, 1.4]].forEach(([y, a, l]) =>
        blade(b, { p: [0, y, 0], a, up: 1.0, len: l, wid: 0.42, shape: 'blade', segL: 6, bend: -0.5, cup: 0.3, c: '#2c3522', c2: lava, glow: 0, glow2: 0.7 }));
      if (o.bud) return bud(b, [0, H, 0.12], 0.46, shade(lava, -0.1), { tip: hot, glow: 0.5, sepal: '#34402a' });
      b.use('head', [0, H, 0.12], { look: true });
      b.frame(fm([0, H + 0.05, 0.16], 0.55));
      const vein = (x, y, z) => (Math.abs(x) < 0.06 && y > 0.15 ? ['#fff0a0', 0.9] : null);
      ring(b, 3, { r0: 0.12, up: 0.75, len: 1.45, wid: 0.62, shape: 'point', bend: -0.6, cup: 0.3, c: '#ff9a1f', c2: shade(lava, -0.1), glow: 0.55, glow2: 0.2, cf: vein, segL: 5 });
      ring(b, 3, { r0: 0.1, up: 0.95, len: 1.3, wid: 0.55, shape: 'point', bend: -0.55, cup: 0.3, off: PI / 3, c: '#ffb020', c2: lava, glow: 0.55, glow2: 0.2, cf: vein, segL: 5 });
      b.add(P.dome(10, 3), { p: [0, 0.02, 0], s: [0.3, 0.35, 0.3], c: '#fff1a8', glow: 1 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + 0.3;
        const tip = [Math.sin(a) * 0.45, 0.95, Math.cos(a) * 0.45];
        stem(b, [[0, 0.1, 0], [Math.sin(a) * 0.2, 0.6, Math.cos(a) * 0.2], tip], 0.025, 0.02, '#ffd166', { glow: 0.7, radial: 3, segs: 3 });
        b.add(P.sphere(5, 3), { p: tip, s: [0.07, 0.12, 0.07], c: '#ff3d00', glow: 1 });
      }
      b.frame(null);
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 0.9 + ph) * 0.05;
    },
  },

  pepper: {
    sprout: 'ember',
    leaf: (o) => o.c1,
    fx: () => [{ kind: 'sparkle', mode: 'rise', color: '#ff8a1a', count: 10, rx: 0.5, h: 2.2, y0: 3.2, size: 0.15, star: false }],
    build(b, o) {
      const red = o.c0, lf = o.c1;
      const wood = shade(lf, -0.25);
      stem(b, [[0, 0, 0], [0.05, 0.9, 0], [0, 1.6, 0.05]], 0.13, 0.1, wood);
      stem(b, [[0, 1.1, 0], [-0.5, 1.5, 0.05], [-0.8, 2.0, 0.1]], 0.08, 0.06, wood);
      stem(b, [[0, 1.2, 0], [0.5, 1.55, 0.0], [0.8, 2.1, 0.05]], 0.08, 0.06, wood);
      [[0.7, 0.4], [1.0, 2.6], [1.45, 1.4], [1.7, 4.2], [1.95, 5.6], [2.1, 0.8], [1.3, 3.5], [2.25, 3.0], [0.9, 5.0]].forEach(([y, a], i) =>
        blade(b, { p: [Math.sin(a) * 0.25, y, Math.cos(a) * 0.15], a, up: 0.4, len: 1.05, wid: 0.58, segL: 3, c: shade(lf, -0.1), c2: shade(lf, 0.2), bend: -0.25, cup: 0.25 }));
      const hang = (x, y, z, l, r, yaw) => {
        b.add(P.cyl(1, 1, 6), { p: [x, y - 0.05, z], s: [r * 0.7, 0.14, r * 0.7], c: '#3f8a3a' });
        stem(b, [[x, y, z], [x + Math.sin(yaw) * 0.12, y - l * 0.45, z + Math.cos(yaw) * 0.12], [x + Math.sin(yaw) * 0.3, y - l, z + Math.cos(yaw) * 0.3]], r, 0.03, '#ff6a2e', { cap: true, radial: 6, segs: 5, c2: shade(red, -0.1), gy: [y - l, y], glow: 0.35, glow2: 0.05 });
      };
      if (!o.bud) {
        hang(-0.8, 2.0, 0.12, 1.15, 0.2, 0.5);
        hang(0.8, 2.1, 0.08, 1.05, 0.19, -0.3);
        hang(-0.35, 1.6, 0.45, 0.8, 0.14, 0.2);
      }
      const H = o.bud ? 1.9 : 2.2;
      b.use('head', [0, H - 0.5, 0.1], { look: true });
      stem(b, [[0, 1.5, 0.05], [0, H - 0.35, 0.1]], 0.06, 0.06, wood);
      const s = o.bud ? 0.6 : 1.2;
      const prof = [[0.0, 0], [0.16, 0.05], [0.32, 0.35], [0.36, 0.75], [0.3, 1.05], [0.12, 1.25], [0, 1.3]];
      b.add(latheGeo('pepperHero', prof, 10), { p: [0, H - 0.35, 0.1], s: [s, s, s * 0.9], c: shade(red, -0.12), c2: shade(red, 0.12), gy: [0, 1.3], glow: 0.05, glow2: 0.25 });
      b.add(P.cyl(1, 0.8, 7), { p: [0, H - 0.4, 0.1], s: [0.2 * s, 0.12, 0.2 * s], c: '#3f8a3a' });
      face(b, o.bud ? 'sleepy' : 'fierce', [0, H + 0.2 * s, 0.1 + 0.33 * s], 0.56 * s, 0.36 * s, [-0.1, 0, 0]);
      if (o.bud) return;
      const FY = H - 0.35 + 1.25 * s;
      b.use('flame', [0, FY, 0.1]);
      const fl = (a, s2, c, c2) => blade(b, { p: [0, FY - 0.05, 0.1], a, up: PI / 2, len: 0.95 * s2, wid: 0.7 * s2, shape: 'flame', cup: 0.35, bend: 0.1, c, c2, glow: 1, glow2: 1 });
      fl(0, 1, '#ff3d00', '#ffb020');
      fl(PI / 2, 0.95, '#ff5a00', '#ffc830');
      fl(PI / 4, 0.62, '#ffb020', '#fff3a0');
      fl(-PI / 4, 0.62, '#ffb020', '#fff3a0');
    },
    anim(p, t, ph) {
      if (p.flame) {
        const k = Math.sin(t * 13 + ph) * 0.1 + Math.sin(t * 7.3 + ph * 2) * 0.08;
        p.flame.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
        p.flame.rotation.z = Math.sin(t * 5.1 + ph) * 0.08;
      }
      p.head.rotation.z = Math.sin(t * 1.4 + ph) * 0.05;
    },
  },

  phoenix: {
    sprout: 'curl',
    glowy: true,
    leaf: (o) => o.c0,
    fx: (o) => [
      { kind: 'halo', p: [0, 2.2, 0], size: 4.8, color: o.c0, opacity: 0.35 },
      { kind: 'sparkle', mode: 'rise', color: o.c1, count: 14, rx: 1.5, h: 4.6, y0: 0.3, size: 0.18, star: false },
    ],
    build(b, o) {
      const fire = o.c0, gold = o.c1;
      rock(b, [0, 0.05, 0], 0.5, '#3a2622', 3, { cf: (x, y, z, i) => (hash(i * 2.9) > 0.6 ? [fire, 0.9] : null) });
      const sc = o.bud ? 0.65 : 1;
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.1;
        blade(b, { p: [Math.sin(a) * 0.2, 0.15, Math.cos(a) * 0.2], a, up: 1.05 + hash(i + 11) * 0.3, len: (2.3 + hash(i + 2) * 0.6) * sc, wid: 0.82 * sc, shape: 'feather', serrate: 0.4, segL: 8, bend: -0.5, cup: 0.15, c: '#b3180e', c2: fire, glow: 0.3, glow2: 0.75, cf: (x, y, z, i2) => (y > 0.8 ? [gold, 0.9] : null) });
      }
      b.use('crest', [0, 0.3, 0]);
      const H = o.bud ? 1.8 : 3.0;
      for (let k = 0; k < 3; k++) {
        blade(b, { p: [0, 0.3, 0], a: (k / 3) * PI, up: PI / 2, len: H * (k === 0 ? 1 : 0.85), wid: 0.75, shape: 'flame', cup: 0.35, bend: 0.12, c: '#e0341a', c2: gold, glow: 0.6, glow2: 1 });
      }
      b.add(P.sphere(8, 6), { p: [0, 0.5, 0], s: [0.3, 0.4, 0.3], c: '#fff1a8', glow: 1 });
      if (!o.bud) {
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + 0.5;
          b.add(P.sphere(5, 4), { p: [Math.sin(a) * 0.35, H + 0.25 + k * 0.15, Math.cos(a) * 0.25], s: [0.08, 0.14, 0.08], c: gold, glow: 1 });
        }
      }
    },
    anim(p, t, ph) {
      const k = Math.sin(t * 9 + ph) * 0.06 + Math.sin(t * 5.3 + ph * 2) * 0.05;
      p.crest.scale.set(1 - k * 0.4, 1 + k, 1 - k * 0.4);
      p.crest.rotation.y = t * 0.4;
    },
  },

  lotus: {
    leaf: () => '#2f9e6a',
    fx: (o) => [{ kind: 'halo', p: [0, 2.2, 0], size: 4.2, color: o.c0, opacity: 0.3 }],
    build(b, o) {
      const p0 = o.c0, p1 = o.c1;
      const esther = o.sid === 'estherlotus';
      const pad = cachedGeo('lilyPad', () => new THREE.CylinderGeometry(1, 1, 0.08, 20, 1, false, 0.35, TAU - 0.7));
      b.add(pad, { p: [0, 0.05, 0], r: [0, 0.4, 0], s: [1.9, 1, 1.9], c: '#2f8e5a', cf: (x, y, z) => (y > 0.03 ? (Math.hypot(x, z) > 0.7 ? '#4fc48a' : '#3fae72') : null) });
      b.add(pad, { p: [1.2, 0.12, -1.0], r: [0, 2.4, 0], s: [0.9, 1, 0.9], c: '#3fae72' });
      const sc = o.bud ? 0.75 : 1;
      const B = 1.35 * sc;
      stem(b, [[0, 0, 0], [0.05, B * 0.5, 0], [0, B, 0]], 0.13, 0.11, '#3f9e5a');
      if (o.bud) return bud(b, [0, B, 0], 0.62, p1, { tip: p0, glow: 0.2 });
      b.use('bloom', [0, B, 0]);
      const cy = B;
      ring(b, 9, { center: [0, cy, 0], r0: 0.28, up: 0.3, len: 1.45, wid: 0.66, shape: 'point', cup: 0.45, bend: 0.3, c: p1, c2: shade(p0, 0.05), glow: 0.12, glow2: 0.35 });
      ring(b, 8, { center: [0, cy + 0.08, 0], r0: 0.22, up: 0.75, len: 1.3, wid: 0.62, shape: 'point', cup: 0.45, bend: 0.25, off: PI / 8, c: mixCol(p1, p0, 0.4), c2: shade(p0, 0.1), glow: 0.2, glow2: 0.45 });
      ring(b, 6, { center: [0, cy + 0.14, 0], r0: 0.14, up: 1.15, len: 1.05, wid: 0.56, shape: 'point', cup: 0.5, bend: 0.2, c: mixCol(p1, p0, 0.7), c2: shade(p0, 0.3), glow: 0.3, glow2: 0.55 });
      if (esther || o.secret) ring(b, 5, { center: [0, cy + 0.18, 0], r0: 0.08, up: 1.35, len: 0.8, wid: 0.45, shape: 'point', cup: 0.5, bend: 0.2, off: 0.3, c: shade(p0, 0.2), c2: '#ffffff', glow: 0.4, glow2: 0.7 });
      b.add(P.cyl(1, 0.8, 10), { p: [0, cy + 0.1, 0], s: [0.3, 0.25, 0.3], c: '#ffe066', glow: 0.6 });
      const T = cy + 2.05;
      b.use('star', [0, T, 0], { look: true });
      if (esther) {
        b.add(shapeGeo('heartEx', heartShape, 0.22), { p: [0, T - 0.5, 0], s: 1.0, c: '#ff3f7f', c2: '#ff8fbf', gy: [0, 1], glow: 0.25, glow2: 0.4 });
        face(b, 'love', [0, T + 0.02, 0.12], 0.5, 0);
      } else {
        b.add(shapeGeo('star5', () => starShape(5, 0.48), 0.2), { s: 0.62, p: [0, T, 0], c: '#ffc933', c2: '#ffe680', gy: [-1, 1], glow: 0.35, glow2: 0.5 });
        face(b, 'happy', [0, T - 0.04, 0.075], 0.46, 0);
      }
    },
    anim(p, t, ph) {
      if (p.bloom) p.bloom.rotation.y = t * 0.15 + ph;
      if (p.star) {
        p.star.position.y = p.star.userData.base.y + Math.sin(t * 1.6 + ph) * 0.14;
        p.star.rotation.z = Math.sin(t * 1.1 + ph) * 0.12;
      }
    },
  },

  melon: {
    sprout: 'vine',
    leaf: (o) => (o.sid === 'micahmelon' ? '#3f8f4a' : '#4a9f86'),
    fx: (o) => (o.sid === 'micahmelon' ? [] : [
      { kind: 'halo', p: [0, 1.3, 0.1], size: 4.0, color: o.c0, opacity: 0.35 },
      { kind: 'sparkle', mode: 'orbit', color: '#fff6c0', count: 6, rx: 1.7, h: 1.0, y0: 1.0, size: 0.32, star: true },
    ]),
    build(b, o) {
      const micah = o.sid === 'micahmelon';
      const lf = micah ? '#3f8f4a' : '#4a9f86';
      const vine = [[-1.4, 0.1, -0.4], [-0.9, 0.16, -0.95], [0.0, 0.12, -1.05], [0.9, 0.16, -0.7], [1.45, 0.12, 0.1]];
      stem(b, vine, 0.08, 0.06, shade(lf, -0.15), { segs: 8, radial: 4 });
      [[-1.2, -0.7, 2.6], [-0.3, -1.05, 3.3], [0.6, -0.9, 3.9], [1.35, -0.25, 4.9], [-1.4, 0.0, 1.8]].forEach(([x, z, a]) =>
        blade(b, { p: [x, 0.14, z], a, up: 0.35, len: 0.95, wid: 0.9, shape: 'round', notch: 0.2, c: shade(lf, -0.15), c2: shade(lf, 0.15), bend: -0.1, cup: 0.3 }));
      b.add(P.torus(0.1, 3, 10, 4.6), { p: [1.4, 0.3, 0.45], r: [0.5, 0.3, 0], s: 0.22, c: lf });
      b.add(P.torus(0.1, 3, 10, 4.6), { p: [-1.5, 0.35, 0.2], r: [0.3, -0.6, 0.5], s: 0.2, c: lf });
      const R = (o.bud ? 0.55 : micah ? 1.2 : 1.12);
      const cy = R * 0.95 + 0.05;
      b.use('moon', [0, cy, 0.1], { look: true });
      if (micah) {
        const dark = shade(o.c0, -0.55);
        const stripes = (x, y, z) => {
          const a = Math.atan2(x, z) + Math.sin(y * 3) * 0.12;
          return Math.floor(((a + PI) / TAU) * 16) % 2 ? dark : null;
        };
        b.add(P.sphere(16, 10), { p: [0, cy, 0.1], s: [R * 1.08, R, R], c: shade(o.c0, -0.15), c2: shade(o.c0, 0.1), gy: [-1, 1], cf: stripes });
      } else {
        b.add(P.sphere(14, 10), { p: [0, cy, 0.1], s: R, c: mixCol(o.c0, o.c1, 0.4), c2: mixCol(o.c0, o.c1, 0.12), gy: [-1, 1], glow: 0.1, glow2: 0.22 });
        const craters = [[0.8, 1.95, 0.3], [-0.85, 2.25, 0.24], [2.1, 1.15, 0.34], [-2.2, 1.35, 0.28], [2.9, 1.95, 0.36], [-1.35, 0.75, 0.2], [0.55, 0.42, 0.2], [-0.35, 0.3, 0.14]];
        craters.forEach(([th, ph, cr]) => {
          if (o.bud && cr > 0.25) return;
          const n = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
          const q = aim(n);
          const p = [n[0] * R * 0.985, cy + n[1] * R * 0.985, 0.1 + n[2] * R * 0.985];
          b.add(P.sphere(8, 2), { p, q, s: [cr * R * 1.25, 0.03, cr * R * 1.25], c: shade(o.c0, 0.25), glow: 0.25 });
          b.add(P.disc(8), { p: [p[0] + n[0] * 0.035, p[1] + n[1] * 0.035, p[2] + n[2] * 0.035], q, s: cr * R, c: mixCol(o.c0, o.c1, 0.7), glow: 0.1 });
        });
      }
      stem(b, [[0, cy + R * 0.95, 0.05], [0.05, cy + R + 0.25, 0.0], [0.25, cy + R + 0.35, -0.05]], 0.07, 0.05, shade(lf, -0.2));
      blade(b, { p: [0.05, cy + R + 0.22, 0.0], a: 1.4, up: 0.6, len: 0.5, wid: 0.42, shape: 'round', c: lf, c2: shade(lf, 0.2) });
      sphereFace(b, o.bud ? 'sleepy' : micah ? 'sneaky' : 'sleepy', [0, cy, 0.1], R, R * 0.92, 0.18);
      if (micah && !o.bud) {
        b.use('body');
        const wedge = cachedGeo('melonWedge', () => new THREE.CylinderGeometry(1, 1, 0.26, 7, 1, false, -0.6, 1.2).rotateZ(PI / 2));
        const flesh = (x, y, z, i) => {
          const r = Math.hypot(y, z);
          if (r > 0.86) return '#2f9e4a';
          if (r > 0.76) return '#e8ffd8';
          return hash(i) > 0.8 && r > 0.3 && Math.abs(x) > 0.1 ? '#221111' : '#ff4f5e';
        };
        b.add(wedge, { p: [1.25, 0.12, 1.0], r: [0, -0.9, -0.1], s: 0.85, c: o.c1, cf: flesh });
      }
    },
    anim(p, t, ph) {
      p.moon.position.y = p.moon.userData.base.y + Math.sin(t * 1.2 + ph) * 0.07;
      p.moon.rotation.z = Math.sin(t * 0.8 + ph) * 0.06;
    },
  },

  orchid: {
    lookAll: true,
    leaf: () => '#2e6e4c',
    fx: () => [{ kind: 'sparkle', mode: 'twinkle', color: '#ffffff', count: 10, rx: 1.3, h: 2.2, y0: 2.2, size: 0.3, star: true }],
    build(b, o) {
      for (let i = 0; i < 4; i++) blade(b, { p: [0, 0.06, 0], a: i * 1.6 + 0.4, up: 0.28, len: 1.45, wid: 0.78, shape: 'round', c: '#245c3e', c2: '#4a9a6a', bend: -0.15, cup: 0.3 });
      const arch = [[0, 0.1, -0.2], [0.05, 1.6, -0.35], [0.08, 2.9, -0.15], [0.04, 3.55, 0.35], [0, 3.6, 0.85]];
      stem(b, arch, 0.07, 0.045, '#3f6e3a', { segs: 12 });
      const galaxy = mixCol(o.c0, o.c1, 0.45);
      const bloom = (c, s, tilt) => {
        const save = b.F;
        b.frame(fm(c, tilt));
        [[0, 0.8], [2.1, 0.72], [-2.1, 0.72]].forEach(([ang, l]) => flatBlade(b, { ang, len: l * s, wid: 0.36 * s, shape: 'point', cup: 0.3, bend: 0.12, c: galaxy, ch: 'galaxy' }));
        [[1.15, 0.7], [-1.15, 0.7]].forEach(([ang, l]) => flatBlade(b, { ang, len: l * s, wid: 0.62 * s, shape: 'round', cup: 0.25, bend: 0.1, c: galaxy, ch: 'galaxy' }));
        flatBlade(b, { p: [0, -0.05 * s, 0.06 * s], ang: PI, tilt: 0.25, len: 0.55 * s, wid: 0.56 * s, shape: 'spoon', cup: 0.6, bend: 0.45, c: o.c1, c2: shade(o.c1, 0.25), glow: 0.15, glow2: 0.35 });
        b.add(P.sphere(6, 4), { p: [0, 0.06 * s, 0.1 * s], s: [0.1 * s, 0.14 * s, 0.1 * s], c: '#fff4c0', glow: 0.6 });
        b.frame(save);
      };
      if (o.bud) {
        [[0.08, 2.9, -0.15], [0.04, 3.5, 0.35], [0, 3.6, 0.85]].forEach((c, i) => b.add(P.sphere(8, 6), { p: [c[0], c[1] - 0.2, c[2] + 0.1], s: [0.2, 0.25, 0.2], c: galaxy, c2: o.c1, gy: [-1, 1] }));
        return;
      }
      bloom([0.1, 2.72, 0.05], 1.05, -0.1);
      bloom([0.03, 3.28, 0.6], 0.9, 0.1);
      bloom([-0.1, 2.05, -0.05], 0.8, -0.05);
      b.add(P.sphere(8, 6), { p: [0, 3.45, 1.02], s: [0.16, 0.2, 0.16], c: galaxy, c2: o.c1, gy: [-1, 1] });
    },
    anim(p, t, ph) {
      p.body.rotation.z = Math.sin(t * 0.9 + ph) * 0.03;
    },
  },

  dragonfruit: {
    lookAll: true,
    leaf: (o) => o.c1,
    build(b, o) {
      const pink = o.c0, green = o.c1;
      const cg = shade(green, -0.3);
      const tri = { radial: 3, segs: 7, c2: shade(green, 0.05), gy: [0, 2.5] };
      stem(b, [[0, 0, 0], [-0.25, 0.8, 0], [-0.85, 1.45, 0.1], [-1.35, 1.25, 0.35]], 0.24, 0.17, cg, tri);
      stem(b, [[0, 0, 0], [0.3, 0.7, -0.1], [0.95, 1.25, -0.15], [1.4, 1.05, 0.2]], 0.24, 0.17, cg, tri);
      stem(b, [[0, 0, 0], [0.05, 0.8, -0.1], [0, 1.4, 0.0]], 0.28, 0.24, cg, tri);
      if (!o.bud) {
        b.frame(fm([-1.35, 1.3, 0.4], 1.0, -0.6));
        ring(b, 8, { r0: 0.1, up: 0.55, len: 0.7, wid: 0.34, shape: 'point', segL: 3, c: '#fff6e8', c2: '#ffffff', cup: 0.3, bend: -0.2, glow: 0.15 });
        ring(b, 6, { r0: 0.06, up: 1.0, len: 0.5, wid: 0.3, shape: 'point', segL: 2, c: '#fffbd0', c2: '#ffffff', cup: 0.3, off: 0.4, glow: 0.2 });
        b.add(P.sphere(5, 3), { p: [0, 0.12, 0], s: 0.1, c: '#ffe066', glow: 0.5 });
        b.frame(null);
      }
      const R = o.bud ? 0.55 : 0.92;
      const cy = 1.3 + R * 1.05;
      b.use('fruit', [0, 1.4, 0.05]);
      b.add(P.sphere(12, 9), { p: [0, cy, 0.05], s: [R, R * 1.18, R], c: shade(pink, -0.1), c2: shade(pink, 0.12), gy: [-1, 1] });
      const rows = [[0.55, 7, 0.5], [1.1, 8, 0.0], [1.75, 7, 0.3], [2.35, 6, 0.1]];
      rows.forEach(([ph, n, off]) => {
        for (let k = 0; k < n; k++) {
          const th = off + (k / n) * TAU;
          if (Math.abs(Math.sin(th / 2)) < 0.3 && ph > 0.8 && ph < 2.0) continue;
          const nx = Math.sin(ph) * Math.sin(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.cos(th);
          blade(b, { p: [nx * R * 0.92, cy + ny * R * 1.1, 0.05 + nz * R * 0.92], a: th, up: 0.7 + ny * 0.8, len: 0.55 * (R / 0.92), wid: 0.36 * (R / 0.92), shape: 'flame', segL: 3, cup: 0.3, bend: 0.2, c: shade(pink, 0.05), c2: green });
        }
      });
      for (let k = 0; k < 5; k++) blade(b, { p: [0, cy + R * 1.1, 0.05], a: (k / 5) * TAU, up: 1.1, len: 0.5, wid: 0.3, shape: 'flame', segL: 3, cup: 0.3, c: pink, c2: green });
      sphereFace(b, o.bud ? 'sleepy' : o.secret ? 'dad' : 'grin', [0, cy, 0.05], R, R * 0.92, 0.15);
    },
    anim(p, t, ph) {
      p.fruit.rotation.z = Math.sin(t * 1.2 + ph) * 0.05;
      p.fruit.position.y = p.fruit.userData.base.y + Math.abs(Math.sin(t * 1.8 + ph)) * 0.06;
    },
  },

  marigold: {
    leaf: () => '#2f7a32',
    fx: (o) => [{ kind: 'sparkle', mode: 'orbit', color: o.c1, count: 8, rx: 1.5, h: 1.6, y0: 2.2, size: 0.3, star: true }],
    build(b, o) {
      const orange = o.c0, magic = o.c1;
      const H = 2.55;
      stem(b, [[0, 0, 0], [0.06, 0.9, 0.0], [-0.04, 1.8, 0.05], [0, H, 0.12]], 0.1, 0.08, '#3a8a36');
      [[0.4, 0.4, 1.1], [0.7, 2.6, 1.0], [1.2, 1.3, 0.85], [1.6, 4.1, 0.8], [2.0, 5.5, 0.6]].forEach(([y, a, l]) =>
        blade(b, { p: [0, y, 0], a, up: 0.5, len: l, wid: 0.42, shape: 'feather', serrate: 0.5, segL: 6, c: '#2f7a32', c2: '#5aa84a', bend: -0.3, cup: 0.1 }));
      if (o.bud) return bud(b, [0, H, 0.12], 0.5, orange, { tip: magic });
      b.use('head', [0, H, 0.12], { look: true });
      b.frame(fm([0, H + 0.05, 0.14], 1.0));
      b.add(P.dome(10, 3), { p: [0, -0.05, 0], r: [PI, 0, 0], s: [0.5, 0.25, 0.5], c: '#3a8a36' });
      const rings = [[16, 0.62, 0.05, 0.8, 0.5], [14, 0.5, 0.45, 0.72, 0.48], [12, 0.38, 0.85, 0.6, 0.44]];
      rings.forEach(([n, r0, up, len, wid], i) => {
        const c = i === 0 ? shade(magic, -0.1) : i === 1 ? orange : shade(orange, 0.1);
        ring(b, n, { r0, y: i * 0.1, up, len, wid, shape: 'spoon', segL: 3, cup: 0.55, bend: 0.25, off: i * 0.3, c, c2: i === 0 ? shade(magic, 0.35) : shade(c, 0.3) });
      });
      b.add(P.dome(10, 4), { p: [0, 0.12, 0], s: [0.5, 0.42, 0.5], c: shade(orange, 0.05), c2: '#ffe066', gy: [0, 1] });
      face(b, 'star', [0, 0.545, 0.0], 0.72, 0.62, [-PI / 2, 0, 0]);
      b.frame(null);
      if (o.secret) {
        for (const side of [-1, 1]) {
          const name = side < 0 ? 'wingL' : 'wingR';
          const piv = [side * 0.85, H + 0.3, 0.0];
          b.use(name, piv);
          for (let k = 0; k < 3; k++) {
            blade(b, { p: piv, a: side * (PI / 2 + 0.3) + side * k * -0.35, up: 0.45 + k * 0.35, len: 1.1 - k * 0.2, wid: 0.36, shape: 'feather', serrate: 0.25, segL: 6, bend: 0.25, cup: 0.1, c: '#ffffff', c2: shade(magic, 0.45), glow: 0.25, glow2: 0.5 });
          }
        }
        b.use('body');
      }
    },
    anim(p, t, ph) {
      p.head.rotation.z = Math.sin(t * 1.2 + ph) * 0.07;
      if (p.wingL) {
        const f = Math.sin(t * 7 + ph) * 0.35;
        p.wingL.rotation.z = f;
        p.wingR.rotation.z = -f;
      }
    },
  },
};
