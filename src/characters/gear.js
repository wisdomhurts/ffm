// Hats and accessories: low-poly, vertex-coloured meshes (one draw call each, plus an unlit "glow"
// mesh for halos and fairy wings). Geometry is built once per item + colour and shared by every avatar.
//   hats: built in "hat space": origin at the centre of the (bald) head's top, +Z = face, head below y 0
//         (2.2 wide, 1.95 deep). The avatar lifts/scales them to sit on each hair style (cosmetics HAIR.fit).
//   face accessories: head space (origin = head centre, face front at z ~1.05).
//   neck / back accessories: torso space (origin at the hips, torso 2 x 2 x 1, neck at y 2).
// Animated sub-parts (propeller, halo, cape, wings) come back separately with a pivot and an anim id.
import * as THREE from 'three';
import { Merger, trs } from '../world/kit.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HEAD, EYE_Y, markShared } from './rig.js';
import { HAT_BY_ID, ACC_BY_ID } from './cosmetics.js';

const hw = HEAD.w / 2;
const hd = HEAD.d / 2;

function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f < 0) c.multiplyScalar(1 + f);
  else c.lerp(new THREE.Color(1, 1, 1), f);
  return c;
}
const luma = (hex) => {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
};

const merged = (fn) => {
  const m = new Merger();
  fn(m);
  return m.count ? m.buildGeometry() : null;
};

// ------------------------------------------------------------------ reusable shapes

const RB = new Map();
function rbox(w, h, d, r) {
  const k = [w, h, d, r].join(',');
  if (!RB.has(k)) RB.set(k, new RoundedBoxGeometry(w, h, d, 2, r));
  return RB.get(k);
}

const TORI = new Map();
function torus(R, tube, radial, tubular, arc = Math.PI * 2) {
  const k = [R, tube, radial, tubular, arc].join(',');
  if (!TORI.has(k)) TORI.set(k, new THREE.TorusGeometry(R, tube, radial, tubular, arc));
  return TORI.get(k);
}

const STARS = new Map();
function star(depth = 0.1, inner = 0.45) {
  const k = depth + ':' + inner;
  if (STARS.has(k)) return STARS.get(k);
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? inner * 0.5 : 0.5;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  STARS.set(k, g);
  return g;
}

// a five-petal flower facing +Z, centred at (x, y, z), turned by ry
function flower(m, x, y, z, s, petal, ry = 0, center = '#ffd23f') {
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    const lx = Math.cos(a) * s * 0.55;
    const ly = Math.sin(a) * s * 0.55;
    m.prim('sphere:6', x + lx * c, y + ly, z - lx * sn, s * 0.62, s * 0.62, s * 0.26, petal, { ry, ao: 0 });
  }
  m.prim('sphere:6', x + sn * s * 0.12, y, z + c * s * 0.12, s * 0.42, s * 0.42, s * 0.3, center, { ry, ao: 0 });
}

// ------------------------------------------------------------------ hats

function buildHat(id, col) {
  const out = { main: null, glow: null, anim: [] };
  switch (id) {
    case 'cap':
      out.main = merged((m) => {
        m.add('hemi:16', trs(0, -0.36, 0.0, 2.42, 1.32, 2.2), col, { ao: 0.12 });
        m.prim('cyl:18', 0, -0.37, 1.02, 2.0, 0.09, 1.4, shade(col, -0.25), { rx: 0.1, ao: 0 });
        m.prim('sphere:8', 0, 0.29, 0, 0.24, 0.16, 0.24, shade(col, -0.2), { ao: 0 });
        m.prim('sphere:10', 0, -0.03, 0.92, 0.5, 0.5, 0.1, '#ffffff', { rx: -0.62, ao: 0 });
        m.prim('sphere:8', 0, -0.03, 0.95, 0.26, 0.26, 0.06, col, { rx: -0.62, ao: 0 });
      });
      break;
    case 'beanie':
      out.main = merged((m) => {
        m.add('hemi:16', trs(0, -0.4, 0, 2.44, 1.6, 2.22), col, { ao: 0.12 });
        m.prim('cyl:18', 0, -0.3, 0, 2.54, 0.36, 2.32, shade(col, -0.16), { ao: 0 });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          m.prim('box', Math.sin(a) * 1.27, -0.3, Math.cos(a) * 1.16, 0.05, 0.34, 0.05, shade(col, -0.3), { ry: a, ao: 0 });
        }
        m.prim('sphere:10', 0, 0.48, 0, 0.56, 0.52, 0.56, shade(col, 0.55), { ao: 0.1 });
      });
      break;
    case 'party': {
      const g = merged((m) => {
        m.prim('cone:16', 0, 0.62, 0, 1.2, 1.46, 1.2, col, { ao: 0.08 });
        m.prim('cyl:16', 0, -0.08, 0, 1.24, 0.14, 1.24, '#ffd23f', { ao: 0 });
        const dots = [[0.18, 0], [0.18, 2.1], [0.18, 4.2], [0.55, 1.05], [0.55, 3.15], [0.55, 5.25], [0.9, 0.5], [0.9, 2.6], [0.9, 4.7]];
        for (const [y, a] of dots) {
          const r = 0.6 * (1 - (y + 0.11) / 1.46) + 0.03;
          m.prim('sphere:6', Math.sin(a) * r, y, Math.cos(a) * r, 0.18, 0.18, 0.18, ['#ffd23f', '#5cc8ff', '#ffffff'][Math.round(y * 3) % 3], { ao: 0 });
        }
        m.prim('sphere:8', 0, 1.38, 0, 0.36, 0.36, 0.36, '#ffd23f', { ao: 0 });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          m.prim('sphere:5', Math.sin(a) * 0.14, 1.42 + Math.cos(a * 2) * 0.05, Math.cos(a) * 0.14, 0.2, 0.2, 0.2, i % 2 ? '#ff6b5a' : '#ffffff', { ao: 0 });
        }
      });
      g.rotateZ(0.16).translate(-0.12, -0.02, 0);
      out.main = g;
      break;
    }
    case 'flowers':
      out.main = merged((m) => {
        m.add(torus(1, 0.07, 5, 36), trs(0, -0.12, 0, 1.2, 1.06, 1.2, Math.PI / 2, 0, 0), '#3f9f4a', { ao: 0 });
        const cols = ['#ff6fb5', '#ffffff', '#ffd23f', '#c9a6ff', '#ff8a5a', '#ffb3d1'];
        const n = 12;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = Math.sin(a) * 1.2;
          const z = Math.cos(a) * 1.06;
          const s = i % 2 ? 0.34 : 0.42;
          flower(m, x, -0.08 + Math.sin(a * 3) * 0.04, z, s, cols[i % cols.length], a);
          const la = a + Math.PI / n;
          m.prim('sphere:5', Math.sin(la) * 1.24, -0.16, Math.cos(la) * 1.1, 0.34, 0.12, 0.18, i % 2 ? '#4cbf5a' : '#2f9a45', { ry: la + 0.6, ao: 0 });
        }
      });
      break;
    case 'headphones':
      out.main = merged((m) => {
        const band = shade(col, -0.35);
        m.add(torus(1, 0.1, 6, 20, Math.PI), trs(0, -0.98, -0.05, 1.3, 1.12, 1), band, { ao: 0 });
        m.prim('box', 0, 0.12, -0.05, 0.9, 0.14, 0.34, col, { ao: 0 });
        for (const s of [-1, 1]) {
          m.prim('cyl:16', s * 1.3, -0.98, -0.05, 0.86, 0.36, 0.86, col, { rz: Math.PI / 2, ao: 0.1 });
          m.prim('cyl:14', s * 1.14, -0.98, -0.05, 0.72, 0.1, 0.72, '#2b2f3a', { rz: Math.PI / 2, ao: 0 });
          m.prim('cyl:14', s * 1.49, -0.98, -0.05, 0.54, 0.06, 0.54, shade(col, 0.4), { rz: Math.PI / 2, ao: 0 });
        }
      });
      break;
    case 'bunny':
      out.main = merged((m) => {
        m.add(torus(1, 0.07, 5, 20, Math.PI), trs(0, -0.95, 0.05, 1.2, 1.02, 1), '#f4f4f4', { ao: 0 });
        for (const s of [-1, 1]) {
          const rz = s * -0.2;
          const x = s * 0.45;
          m.prim('sphere:12', x, 0.88, 0.02, 0.52, 1.72, 0.24, '#ffffff', { rz, ao: 0.15 });
          m.prim('sphere:10', x - s * 0.02, 0.84, 0.1, 0.3, 1.3, 0.12, '#ffb3d1', { rz, ao: 0 });
        }
      });
      break;
    case 'cowboy': {
      const brimG = cowboyBrim();
      out.main = merged((m) => {
        m.prim('cyl:18', 0, 0.28, -0.02, 2.0, 0.96, 1.76, col, { ao: 0.12 });
        m.prim('sphere:14', 0, 0.74, -0.02, 1.98, 0.36, 1.72, col, { ao: 0 });
        m.prim('box', 0, 0.84, 0.0, 0.18, 0.2, 1.3, shade(col, -0.18), { ao: 0 });
        m.prim('cyl:18', 0, -0.07, -0.02, 2.04, 0.22, 1.8, shade(col, -0.5), { ao: 0 });
        m.add(brimG, trs(0, -0.2, -0.02, 1, 1, 0.88), col, { ao: 0 });
        m.prim('octa', 0, -0.07, 0.9, 0.2, 0.26, 0.08, '#ffd23f', { ao: 0 });
      });
      brimG.dispose();
      break;
    }
    case 'propeller':
      out.main = merged((m) => {
        const cols = ['#e8323c', '#ffd23f', '#2f80ed', '#2fb84f'];
        for (let q = 0; q < 4; q++) {
          const g = new THREE.SphereGeometry(0.5, 6, 6, (q * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2);
          m.add(g, trs(0, -0.38, 0, 2.42, 1.32, 2.2), cols[q], { ao: 0.12 });
        }
        m.prim('cyl:16', 0, -0.39, 1.0, 1.8, 0.08, 1.3, '#2f80ed', { rx: 0.1, ao: 0 });
        m.prim('cyl:8', 0, 0.38, 0, 0.12, 0.3, 0.12, '#c9ced8', { ao: 0 });
      });
      out.anim.push({
        anim: 'spin', pos: [0, 0.54, 0],
        geo: merged((m) => {
          for (const s of [-1, 1]) m.prim('box', s * 0.46, 0, 0, 0.84, 0.05, 0.22, s < 0 ? '#e8323c' : '#ffd23f', { rx: s * 0.3, ao: 0 });
          m.prim('sphere:8', 0, 0.02, 0, 0.18, 0.14, 0.18, '#ffffff', { ao: 0 });
        }),
      });
      break;
    case 'tophat': {
      const band = luma(col) < 0.25 ? '#e8323c' : shade(col, -0.5);
      const g = merged((m) => {
        m.prim('cyl:18', 0, 0.6, 0, 1.56, 1.36, 1.46, col, { ao: 0.1 });
        m.prim('cyl:18', 0, 1.29, 0, 1.6, 0.04, 1.5, shade(col, 0.12), { ao: 0 });
        m.prim('cyl:18', 0, 0.1, 0, 1.6, 0.3, 1.5, band, { ao: 0 });
        m.prim('cyl:20', 0, -0.08, 0, 2.5, 0.09, 2.3, col, { ao: 0 });
      });
      g.rotateZ(-0.07);
      out.main = g;
      break;
    }
    case 'wizard': {
      const g = merged((m) => {
        m.prim('cyl:20', 0, -0.2, 0, 2.95, 0.08, 2.75, col, { ao: 0 });
        m.add('frustum:16', trs(0, 0.36, -0.02, 1.9, 1.16, 1.8), col, { ao: 0.1 });
        m.prim('cone:14', 0, 1.36, -0.14, 1.32, 1.0, 1.26, col, { rx: -0.35, ao: 0 });
        m.prim('cone:10', 0, 2.0, -0.55, 0.5, 0.55, 0.5, col, { rx: -1.1, ao: 0 });
        m.prim('cyl:16', 0, -0.08, -0.02, 1.92, 0.16, 1.82, '#ffd23f', { ao: 0 });
        for (const [x, y, z, s] of [[0.35, 0.45, 0.82, 0.3], [-0.45, 0.85, 0.62, 0.24], [0.15, 1.3, 0.4, 0.2], [-0.72, 0.3, 0.6, 0.18]]) m.add(star(0.08), trs(x, y, z, s * 1.4, s * 1.4, 1, -0.2, Math.atan2(x, z), 0), '#ffd23f', { ao: 0 });
      });
      out.main = g;
      break;
    }
    case 'viking':
      out.main = merged((m) => {
        m.add('hemi:16', trs(0, -0.4, 0, 2.46, 1.52, 2.24), '#a4acbd', { ao: 0.15 });
        m.prim('cyl:18', 0, -0.32, 0, 2.54, 0.32, 2.32, '#c08a4a', { ao: 0 });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          m.prim('sphere:5', Math.sin(a) * 1.28, -0.32, Math.cos(a) * 1.17, 0.1, 0.1, 0.1, '#ffd98a', { ao: 0 });
        }
        m.add(torus(1, 0.09, 5, 16, Math.PI), trs(0, -0.4, 0, 1.12, 0.78, 1.12, 0, Math.PI / 2, 0), '#c08a4a', { ao: 0 });
        for (const s of [-1, 1]) {
          m.prim('frustum:10', s * 1.3, 0.02, 0, 0.5, 0.62, 0.5, '#f3e8c8', { rz: s * -1.05, ao: 0 });
          m.prim('frustum:10', s * 1.62, 0.42, 0, 0.36, 0.56, 0.36, '#f3e8c8', { rz: s * -0.45, ao: 0 });
          m.prim('cone:10', s * 1.74, 0.86, 0, 0.26, 0.5, 0.26, '#fff8e6', { rz: s * -0.08, ao: 0 });
          m.prim('cyl:10', s * 1.16, -0.1, 0, 0.56, 0.12, 0.56, '#c08a4a', { rz: s * -1.05, ao: 0 });
        }
      });
      break;
    case 'crown':
      out.main = merged((m) => {
        const gold = '#ffc93c';
        m.add('hemi:14', trs(0, 0.12, 0, 1.7, 0.95, 1.56), '#c8283c', { ao: 0.1 });
        m.prim('cyl:18', 0, 0.06, 0, 1.94, 0.52, 1.8, gold, { ao: 0.12 });
        m.prim('cyl:18', 0, -0.2, 0, 2.02, 0.1, 1.88, '#fff0b0', { ao: 0 });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const x = Math.sin(a) * 0.94;
          const z = Math.cos(a) * 0.87;
          m.prim('cone:4', x, 0.55, z, 0.44, 0.55, 0.3, gold, { ry: a, ao: 0 });
          m.prim('sphere:6', x * 1.02, 0.86, z * 1.02, 0.18, 0.18, 0.18, '#ffffff', { ao: 0 });
          m.prim('octa', Math.sin(a + 0.52) * 0.98, 0.07, Math.cos(a + 0.52) * 0.91, 0.26, 0.3, 0.14, ['#ff3a5a', '#3a8bff', '#3fdc6a'][k % 3], { ry: a + 0.52, ao: 0 });
        }
        m.prim('sphere:8', 0, 0.62, 0, 0.26, 0.26, 0.26, gold, { ao: 0 });
        m.prim('box', 0, 0.86, 0, 0.1, 0.36, 0.1, gold, { ao: 0 });
        m.prim('box', 0, 0.9, 0, 0.28, 0.09, 0.1, gold, { ao: 0 });
      });
      break;
    case 'halo':
      out.anim.push({ anim: 'halo', pos: [0, 0.62, 0], glow: true, geo: merged((m) => m.add(torus(0.78, 0.11, 8, 30), trs(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0), '#ffe27a', { ao: 0 })) });
      break;
    default:
      break;
  }
  return out;
}

// cowboy brim: a flat ring whose sides curl up
function cowboyBrim() {
  const prof = [[0.9, 0.02], [1.25, 0.0], [1.55, 0.02], [1.8, 0.1], [1.95, 0.2], [1.97, 0.24]];
  const top = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y + 0.05)).reverse(), 28);
  const bot = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - 0.03)), 28);
  const parts = [top, bot].map((g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      const side = r > 0 ? (x / r) ** 2 : 0;
      p.setY(i, p.getY(i) + side * Math.max(0, r - 1.2) * 0.42);
    }
    g.computeVertexNormals();
    return g.toNonIndexed();
  });
  const m = new Merger();
  parts.forEach((g) => m.add(g, new THREE.Matrix4(), '#ffffff', { ao: 0 }));
  const out = m.buildGeometry();
  top.dispose();
  bot.dispose();
  parts.forEach((g) => g.dispose());
  return out;
}

/**
 * Shared hat geometry: { main, glow, anim: [{geo, glow?, pos, anim}] } (null main/glow when unused).
 * `color` only matters for tintable hats.
 */
export function hatGeometry(id, color) {
  const def = HAT_BY_ID[id];
  if (!def) return null;
  const col = def.tint ? color || def.tint : '';
  return cacheParts('hat:' + id + ':' + col, () => buildHat(id, col));
}

// ------------------------------------------------------------------ accessories

const glassesArms = (m, col, y = EYE_Y + 0.08) => {
  for (const s of [-1, 1]) {
    m.prim('box', s * (hw + 0.03), y, 0.55, 0.06, 0.07, 1.0, col, { ao: 0 });
    m.prim('box', s * (hw - 0.06), y, 1.02, 0.16, 0.09, 0.08, col, { ry: s * 0.45, ao: 0 });
  }
};

function buildAcc(id, col, hairColor) {
  const out = { main: null, glow: null, anim: [] };
  const z = hd + 0.1; // just in front of the face
  switch (id) {
    case 'sunglasses':
      out.main = merged((m) => {
        for (const s of [-1, 1]) {
          m.add(rbox(0.7, 0.46, 0.08, 0.12), trs(s * 0.45, EYE_Y, z, 1, 1, 1, 0, s * 0.1, 0), '#1a2033', { ao: 0 });
          m.prim('box', s * 0.45 - 0.14, EYE_Y + 0.1, z + 0.045, 0.16, 0.06, 0.01, '#8fb2ff', { rz: -0.5, ao: 0 });
        }
        m.prim('box', 0, EYE_Y + 0.2, z + 0.01, 1.72, 0.09, 0.09, '#111111', { ao: 0 });
        m.prim('box', 0, EYE_Y + 0.08, z + 0.02, 0.28, 0.07, 0.07, '#111111', { ao: 0 });
        glassesArms(m, '#111111', EYE_Y + 0.18);
      });
      break;
    case 'roundglasses':
      out.main = merged((m) => {
        for (const s of [-1, 1]) m.add(torus(0.26, 0.045, 6, 22), trs(s * 0.45, EYE_Y, z, 1, 1, 1, 0, s * 0.1, 0), '#3a2a20', { ao: 0 });
        m.add(torus(0.12, 0.035, 5, 10, Math.PI), trs(0, EYE_Y + 0.02, z + 0.02, 1, 1, 1), '#3a2a20', { ao: 0 });
        glassesArms(m, '#3a2a20', EYE_Y + 0.06);
      });
      break;
    case 'starglasses':
      out.main = merged((m) => {
        for (const s of [-1, 1]) {
          m.add(star(0.08), trs(s * 0.46, EYE_Y + 0.02, z, 0.9, 0.9, 1, 0, s * 0.1, s * 0.1), '#ff4f9a', { ao: 0 });
          m.add(star(0.04), trs(s * 0.46, EYE_Y + 0.02, z + 0.05, 0.62, 0.62, 1, 0, s * 0.1, s * 0.1), '#ffe066', { ao: 0 });
        }
        m.prim('box', 0, EYE_Y + 0.08, z + 0.02, 0.3, 0.08, 0.07, '#ff4f9a', { ao: 0 });
        glassesArms(m, '#ff4f9a', EYE_Y + 0.08);
      });
      break;
    case 'mustache':
      out.main = merged((m) => {
        const y = EYE_Y - 0.44;
        const c = hairColor || '#3a2a20';
        for (const s of [-1, 1]) {
          m.prim('sphere:10', s * 0.2, y, z + 0.02, 0.46, 0.22, 0.16, c, { rz: s * -0.25, ry: s * 0.15, ao: 0 });
          m.prim('sphere:8', s * 0.44, y + 0.06, z - 0.01, 0.2, 0.16, 0.12, c, { rz: s * -0.9, ao: 0 });
          m.prim('sphere:6', s * 0.52, y + 0.15, z - 0.03, 0.12, 0.12, 0.1, c, { ao: 0 });
        }
      });
      break;
    case 'bowtie':
      out.main = merged((m) => {
        for (const s of [-1, 1]) m.prim('cone:4', s * 0.34, 1.7, 0.57, 0.62, 0.62, 0.2, col, { rz: s * (Math.PI / 2), ry: Math.PI / 4, ao: 0 });
        m.add(rbox(0.24, 0.26, 0.2, 0.06), trs(0, 1.7, 0.62), shade(col, -0.2), { ao: 0 });
      });
      break;
    case 'scarf':
      out.main = merged((m) => {
        const c2 = luma(col) > 0.75 ? '#e8323c' : '#ffffff';
        m.add(torus(1, 0.22, 8, 22), trs(0, 1.96, 0, 0.98, 0.64, 1.1, Math.PI / 2, 0, 0), col, { ao: 0.1 });
        m.add(torus(1, 0.1, 6, 22), trs(0, 2.02, 0, 1.02, 0.68, 1.4, Math.PI / 2, 0, 0), c2, { ao: 0 });
        const tail = (x, y, zz, len, rz) => {
          m.add(rbox(0.4, len, 0.12, 0.05), trs(x, y, zz, 1, 1, 1, 0.05, 0, rz), col, { ao: 0 });
          m.prim('box', x - Math.sin(rz) * len * 0.12, y - len * 0.12, zz + 0.01, 0.42, 0.1, 0.12, c2, { rz, ao: 0 });
          m.prim('box', x - Math.sin(rz) * len * 0.3, y - len * 0.3, zz + 0.01, 0.42, 0.1, 0.12, c2, { rz, ao: 0 });
          for (let i = 0; i < 4; i++) m.prim('box', x - Math.sin(rz) * len * 0.5 - 0.15 + i * 0.1, y - len * 0.5 - 0.08, zz, 0.05, 0.16, 0.05, col, { rz, ao: 0 });
        };
        tail(0.42, 1.35, 0.66, 1.0, 0.08);
        tail(0.6, 1.5, 0.6, 0.7, -0.12);
      });
      break;
    case 'lei':
      out.main = merged((m) => {
        const cols = ['#ff6fb5', '#ffd23f', '#ffffff', '#c9a6ff', '#ff8a5a'];
        const n = 11;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1); // 0..1 across the chest, a U shape
          const x = (t - 0.5) * 1.8;
          const y = 1.98 - Math.sin(t * Math.PI) * 0.62;
          flower(m, x, y, 0.58, 0.3, cols[i % cols.length], 0, i % 2 ? '#ffe066' : '#ffffff');
        }
        for (const s of [-1, 1]) flower(m, s * 1.03, 1.95, 0.2, 0.28, cols[s > 0 ? 1 : 3], s * Math.PI / 2);
      });
      break;
    case 'backpack':
      out.main = merged((m) => {
        m.add(rbox(1.5, 1.62, 0.62, 0.18), trs(0, 1.08, -0.82), col, { ao: 0.12 });
        m.add(rbox(1.52, 0.42, 0.66, 0.14), trs(0, 1.74, -0.82), shade(col, 0.12), { ao: 0 });
        m.add(rbox(1.06, 0.7, 0.22, 0.1), trs(0, 0.7, -1.18), shade(col, -0.14), { ao: 0 });
        m.prim('box', 0, 0.86, -1.3, 0.8, 0.05, 0.03, '#2b2f3a', { ao: 0 });
        m.prim('box', 0, 1.56, -1.16, 0.16, 0.2, 0.05, '#ffd23f', { ao: 0 });
        for (const s of [-1, 1]) {
          m.prim('box', s * 0.52, 1.38, 0.52, 0.22, 1.26, 0.06, '#2b2f3a', { ao: 0 });
          m.prim('box', s * 0.52, 2.0, -0.08, 0.22, 0.06, 1.1, '#2b2f3a', { ao: 0 });
          m.prim('box', s * 0.52, 1.0, 0.54, 0.26, 0.14, 0.06, '#c9ced8', { ao: 0 });
        }
      });
      break;
    case 'cape': {
      out.main = merged((m) => {
        for (const s of [-1, 1]) m.prim('sphere:8', s * 0.62, 1.84, 0.54, 0.22, 0.22, 0.08, '#ffd23f', { ao: 0 });
        m.add(torus(1, 0.08, 5, 16, Math.PI), trs(0, 1.9, 0.02, 0.98, 0.56, 1, Math.PI / 2, 0, 0), shade(col, -0.2), { ao: 0 });
      });
      // the top of the cape lies flat on the back (the slung noodle rests on it); the bottom flap is
      // hinged below the hips and streams out behind when running
      out.anim.push({ anim: 'capeTop', pos: [0, 1.96, -0.56], geo: capeGeometry(col, 1.8, 2.02, 1.8, 0.02) });
      out.anim.push({ anim: 'cape', parent: 0, pos: [0, -1.78, -0.03], geo: capeGeometry(col, 2.02, 2.4, 0.8, 0.12) });
      break;
    }
    case 'wings':
      for (const s of [-1, 1]) {
        out.anim.push({
          anim: s < 0 ? 'wingR' : 'wingL', glow: true, pos: [s * 0.25, 1.45, -0.6],
          geo: merged((m) => {
            m.prim('sphere:12', s * 0.86, 0.5, -0.02, 1.7, 1.2, 0.06, '#ff9ee0', { rz: s * 0.5, ao: 0 });
            m.prim('sphere:12', s * 0.84, 0.5, 0.0, 1.46, 0.98, 0.07, '#d9f4ff', { rz: s * 0.5, ao: 0 });
            m.prim('sphere:10', s * 0.62, -0.42, -0.02, 1.06, 0.78, 0.06, '#ff9ee0', { rz: s * -0.5, ao: 0 });
            m.prim('sphere:10', s * 0.6, -0.41, 0.0, 0.86, 0.6, 0.07, '#fff3c0', { rz: s * -0.5, ao: 0 });
            m.prim('sphere:8', s * 0.1, 0, -0.02, 0.3, 0.4, 0.2, '#ffe066', { ao: 0 });
          }),
        });
      }
      break;
    default:
      break;
  }
  return out;
}

// cape panel: a tapered slab hanging from its top edge (pivot at y 0), widths w0 -> w1 over len, bowing
// back by `bow`; outside colour + a darker lining
function capeGeometry(col, w0, w1, len, bow) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 4, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 0.5 - p.getY(i); // 0 at the top, 1 at the bottom
    const w = w0 + t * (w1 - w0);
    p.setXYZ(i, p.getX(i) * w, -t * len, p.getZ(i) * 0.07 - t * t * bow);
  }
  g.computeVertexNormals();
  const m = new Merger();
  m.add(g, new THREE.Matrix4(), col, { ao: 0.12 });
  m.add(g, trs(0, -0.01, 0.035, 0.97, 0.99, 1), shade(col, -0.35), { ao: 0 });
  const out = m.buildGeometry();
  g.dispose();
  return out;
}

const PARTS = new Map();
function cacheParts(key, make) {
  if (!PARTS.has(key)) {
    const p = make();
    markShared(p);
    PARTS.set(key, p);
  }
  return PARTS.get(key);
}

/** Shared accessory geometry: { at, main, glow, anim: [{geo, glow?, pos, anim}] }. */
export function accGeometry(id, color, hairColor) {
  const def = ACC_BY_ID[id];
  if (!def) return null;
  const col = def.tint ? color || def.tint : '';
  const hc = id === 'mustache' ? hairColor || '' : '';
  const p = cacheParts('acc:' + id + ':' + col + ':' + hc, () => buildAcc(id, col, hairColor));
  return { at: def.at, ...p };
}
