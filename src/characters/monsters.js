// Road monsters: eleven characterful low-poly critters that guard the biomes.
// Contract: createMonster(typeId) -> { object3d, update(dt, s) }
//   s = {time, speed, state:'patrol'|'chase'|'stunned', attackAge (seconds since last catch)}
// Built facing +Z with the origin on the ground. Static details are merged into vertex-coloured
// geometry (shared per type) so each monster is only a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// ------------------------------------------------------------------ geometry helpers

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A vertex-coloured, transformed, non-indexed copy of `geo` (uv dropped). */
function vc(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  g.clearGroups();
  _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...(typeof scl === 'number' ? [scl, scl, scl] : scl)));
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** A transformed, non-indexed copy keeping uvs (for textured merged parts). */
function tx(geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.clearGroups();
  _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...(typeof scl === 'number' ? [scl, scl, scl] : scl)));
  g.applyMatrix4(_m);
  return g;
}

function merge(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

const sph = (w = 12, h = 8) => new THREE.SphereGeometry(1, w, h);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);

/** A vertex-coloured tapered cylinder from point a to point b. */
function limb(a, b, ra, rb, color) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, 6).translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const out = vc(g, color, a, [e.x, e.y, e.z]);
  g.dispose();
  return out;
}

// Textured parts use map + emissiveMap (same shader program as the avatars' plastic).
function texMat(map, o = {}) {
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.12, roughness: 0.8, ...o });
}

// Faceted look without a flatShading shader variant: bake per-face normals.
function faceted(g) {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Darken vertex colours towards `tint` below y0, fading out by y1 (baked shading: fluffy undersides, dark storm bellies). */
function shadeY(g, y0, y1, tint) {
  const p = g.attributes.position;
  const c = g.attributes.color;
  const T = new THREE.Color(tint);
  for (let i = 0; i < p.count; i++) {
    const k = clamp01((p.getY(i) - y0) / (y1 - y0));
    const s = k * k * (3 - 2 * k);
    c.setXYZ(i, c.getX(i) * lerp(T.r, 1, s), c.getY(i) * lerp(T.g, 1, s), c.getZ(i) * lerp(T.b, 1, s));
  }
  return g;
}

/** Euler turning the unit vector `from` onto the unit vector `to`, as an [x, y, z] rotation for vc(). */
function aim(from, to) {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(from, to));
  return [e.x, e.y, e.z];
}

/** Where direction `d` from the centre meets an ellipsoid (centre c, radii r), pushed out by `lift` along the surface
 *  normal `n`, plus the rotation turning `axis` to that normal (to stick tufts and highlights onto a body). */
function onShell(c, r, d, lift = 0, axis = [0, 0, 1]) {
  const u = new THREE.Vector3(...d).normalize();
  const n = new THREE.Vector3(u.x / r[0], u.y / r[1], u.z / r[2]).normalize();
  const p = new THREE.Vector3(c[0] + u.x * r[0], c[1] + u.y * r[1], c[2] + u.z * r[2]).addScaledVector(n, lift);
  return { pos: [p.x, p.y, p.z], rot: aim(new THREE.Vector3(...axis), n), n };
}

// Little particles (breath puffs, rain drops): `n` copies of one small vertex-coloured blob merged into a single
// geometry per type; each monster moves its own copy's vertices on the CPU (one draw call for the lot).
function blobGeo(unit, n) {
  const g = merge(Array.from({ length: n }, () => unit.clone()));
  unit.dispose();
  g.userData.blobs = n;
  return g;
}

/** Per-instance mesh of a blobGeo: place(k, x, y, z, s) puts blob k at (x, y, z) scaled by s (0 hides it). */
function blobMesh(src, mat, center, radius) {
  const geo = src.clone();
  geo.userData = {}; // per-instance: not shared
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(...center), radius);
  const pos = geo.attributes.position;
  const arr = pos.array;
  const rest = src.attributes.position.array;
  const per = (pos.count / src.userData.blobs) * 3;
  const mesh = new THREE.Mesh(geo, mat);
  // only move the blobs while they are actually drawn (onBeforeRender runs after frustum culling)
  let drawn = 2;
  mesh.onBeforeRender = () => {
    drawn = 2;
  };
  return {
    mesh,
    geo,
    /** true while the blobs are on screen (call once per frame, before place/commit) */
    live() {
      if (drawn > 0) drawn--;
      return drawn > 0;
    },
    place(k, x, y, z, s) {
      for (let i = k * per, e = i + per; i < e; i += 3) {
        arr[i] = x + rest[i] * s;
        arr[i + 1] = y + rest[i + 1] * s;
        arr[i + 2] = z + rest[i + 2] * s;
      }
    },
    commit() {
      pos.needsUpdate = true;
    },
  };
}

/** Stable per-instance noise in [0, 1) for integer ticks (lightning flicker, drop scatter). */
const hash01 = (n, seed) => {
  const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------------ shared bits

// Geometry shared by every monster of a type is tagged so views can skip it on dispose.
function markShared(o) {
  if (o?.isBufferGeometry) o.userData.shared = true;
  else if (o && typeof o === 'object' && !o.isMaterial && !o.isTexture) Object.values(o).forEach(markShared);
  return o;
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  // dizzy halo: four cartoon stars merged in a ring
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const r = i % 2 ? 0.17 : 0.4;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }).translate(0, 0, -0.07);
  const halo = merge([0, 1, 2, 3].map((i) => {
    const a = (i / 4) * TAU;
    return tx(star, [Math.cos(a) * 1.5, Math.sin(i * 2.3) * 0.15, Math.sin(a) * 1.5], [0.3, a, 0.2 * i]);
  }));
  star.dispose();
  SHARED = {
    vcMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }),
    starMat: new THREE.MeshBasicMaterial({ color: 0xffe14d, toneMapped: false }),
    halo,
    eye: sph(14, 10),
  };
  markShared(SHARED.halo);
  return SHARED;
}

// per-instance (eyes glow when angry); vertex-coloured white geometry so it shares the vcMat program
function eyeMaterial(base = 0xffffff) {
  return new THREE.MeshStandardMaterial({ color: base, vertexColors: true, roughness: 0.25, metalness: 0, emissive: 0x000000 });
}

// pair of eyeballs + pupils (with a highlight). Returns {whites, pupils} geometries.
function eyePair(x, y, z, r, pupilScale = 0.5, whiteCol = null) {
  const S = shared();
  const whites = [];
  const pupils = [];
  for (const s of [-1, 1]) {
    whites.push(vc(S.eye, whiteCol || '#ffffff', [s * x, y, z], [0, 0, 0], r));
    pupils.push(vc(S.eye, '#15110f', [s * x * 0.94, y - r * 0.05, z + r * 0.72], [0, 0, 0], [r * pupilScale, r * pupilScale * 1.1, r * 0.4]));
    pupils.push(vc(S.eye, '#ffffff', [s * x * 0.94 + r * 0.15, y + r * 0.18, z + r * 0.92], [0, 0, 0], r * 0.12));
  }
  return { whites, pupils };
}

// ------------------------------------------------------------------ monster types
// Each builder returns {root parts..., animate(W, t, dt, s)} after adding meshes to `body`.

const TYPE_CACHE = {};

// ---------------------------------------------------------------- Grumpy Stump
function stumpGeo() {
  if (TYPE_CACHE.stump) return TYPE_CACHE.stump;
  const bark = canvasTex(256, 128, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = '#8a5a34';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = r() * w;
      g.fillStyle = r() < 0.6 ? 'rgba(60,34,16,0.55)' : 'rgba(170,120,70,0.35)';
      g.fillRect(x, 0, 2 + r() * 5, h);
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(50,28,12,0.5)';
      g.beginPath();
      g.ellipse(r() * w, r() * h, 3 + r() * 5, 8 + r() * 10, 0, 0, TAU);
      g.fill();
    }
  });
  const rings = canvasTex(128, 128, (g) => {
    g.fillStyle = '#e8c48a';
    g.fillRect(0, 0, 128, 128);
    for (let i = 10; i > 0; i--) {
      g.strokeStyle = i % 2 ? 'rgba(150,95,45,0.7)' : 'rgba(190,130,70,0.5)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.ellipse(64 + (i % 3) - 1, 64, i * 6, i * 5.8, 0, 0, TAU);
      g.stroke();
    }
    g.strokeStyle = '#6b4424';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 60, 0, TAU);
    g.stroke();
  });
  const trunk = new THREE.CylinderGeometry(1.45, 1.7, 3.0, 16, 1);
  const barkMat = texMat(bark, { roughness: 0.9 });
  const ringMat = texMat(rings, { roughness: 0.85 });
  const S = shared();
  const statics = [];
  // root flare around the base
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    statics.push(vc(cone(0.45, 1.1, 5), '#7a4d2b', [Math.sin(a) * 1.55, 1.05, Math.cos(a) * 1.55], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]));
  }
  // moss tufts on the rim and a proud little sprout on top
  statics.push(vc(sph(8, 6), '#5fbf4a', [-0.9, 3.78, -0.5], [0, 0, 0], [0.55, 0.18, 0.45]));
  statics.push(vc(sph(8, 6), '#4fae3e', [1.0, 3.76, 0.3], [0, 0, 0], [0.4, 0.14, 0.35]));
  statics.push(vc(cyl(0.07, 0.09, 0.7, 5), '#4c9a38', [0.35, 4.12, 0.1], [0, 0, -0.15]));
  statics.push(vc(sph(8, 6), '#7ddc5a', [0.62, 4.45, 0.1], [0, 0, -0.5], [0.34, 0.1, 0.2]));
  statics.push(vc(sph(8, 6), '#6ccf4d', [0.18, 4.4, 0.1], [0, 0, 0.6], [0.28, 0.09, 0.17]));
  // teeth under the frown
  statics.push(vc(new THREE.BoxGeometry(0.2, 0.2, 0.1), '#fff6dc', [-0.17, 1.98, 1.67]));
  statics.push(vc(new THREE.BoxGeometry(0.2, 0.18, 0.1), '#fff6dc', [0.19, 1.99, 1.67]));
  const eyes = eyePair(0.55, 2.78, 1.4, 0.36, 0.55);
  statics.push(...eyes.pupils);
  // brows (one mesh, animated as a unit), mouth, arms, legs
  const brows = merge([-1, 1].map((s) => vc(new THREE.BoxGeometry(0.85, 0.22, 0.3), '#3b2412', [s * 0.52, 0, 0], [0, 0, s * 0.38])));
  const mouth = vc(sph(12, 6), '#3a120a', [0, 0, 0], [0, 0, 0], [0.62, 1, 0.3]);
  const arm = merge([
    vc(cyl(0.09, 0.14, 1.7, 6), '#7a4d2b', [0, -0.85, 0]),
    vc(cyl(0.05, 0.07, 0.6, 5), '#7a4d2b', [0.18, -1.45, 0], [0, 0, 0.7]),
    vc(sph(8, 6), '#6ccf4d', [0.1, -1.85, 0.05], [0.4, 0, 0.3], [0.28, 0.12, 0.18]),
    vc(sph(8, 6), '#5fbf4a', [0.42, -1.62, 0], [0, 0, 1], [0.24, 0.1, 0.15]),
  ]);
  const leg = merge([
    vc(cyl(0.42, 0.48, 0.85, 8), '#7a4d2b', [0, -0.42, 0]),
    vc(sph(8, 6), '#6b4224', [0, -0.85, 0.15], [0, 0, 0], [0.55, 0.22, 0.7]),
    ...[-0.35, 0, 0.35].map((x) => vc(cone(0.12, 0.45, 5), '#6b4224', [x, -0.95, 0.72], [Math.PI / 2 + 0.2, 0, 0])),
  ]);
  TYPE_CACHE.stump = {
    trunk, barkMat, ringMat,
    statics: merge(statics),
    whites: merge(eyes.whites),
    brows, mouth, arm, leg,
  };
  return markShared(TYPE_CACHE.stump);
}

function buildStump(body, eyeMat) {
  const G = stumpGeo();
  const S = shared();
  const add = (geo, mat, parent = body, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const torso = new THREE.Group();
  body.add(torso);
  const trunk = add(G.trunk, [G.barkMat, G.ringMat, G.barkMat], torso);
  trunk.position.y = 2.3;
  add(G.statics, S.vcMat, torso);
  add(G.whites, eyeMat, torso, false);
  const brows = add(G.brows, S.vcMat, torso, false);
  brows.position.set(0, 3.25, 1.5);
  const mouth = add(G.mouth, S.vcMat, torso, false);
  mouth.position.set(0, 1.95, 1.52);
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 1.55, 2.55, 0);
    torso.add(p);
    const a = add(G.arm, S.vcMat, p);
    a.scale.x = s;
    return p;
  });
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.72, 0.9, 0);
    body.add(p);
    add(G.leg, S.vcMat, p);
    return p;
  });
  return {
    headY: 4.6,
    animate(W, t, ph) {
      const sw = Math.sin(ph);
      const wk = W.move;
      // waddle: roll side to side, legs lift alternately
      torso.rotation.z = sw * 0.12 * wk;
      torso.position.y = Math.abs(Math.cos(ph)) * 0.18 * wk;
      torso.rotation.x = 0.12 * W.chase + W.bite * 0.25;
      legs[0].rotation.x = sw * 0.5 * wk;
      legs[1].rotation.x = -sw * 0.5 * wk;
      legs[0].position.y = 0.9 + Math.max(0, sw) * 0.25 * wk;
      legs[1].position.y = 0.9 + Math.max(0, -sw) * 0.25 * wk;
      // twig arms flail when angry
      const flail = W.chase * Math.sin(t * 14) * 0.35;
      arms[0].rotation.z = -0.35 - W.chase * 1.1 + flail - W.bite * 0.8;
      arms[1].rotation.z = 0.35 + W.chase * 1.1 + flail + W.bite * 0.8;
      arms[0].rotation.x = -sw * 0.4 * wk;
      arms[1].rotation.x = sw * 0.4 * wk;
      // grumpy brows drop and pinch when chasing
      brows.position.y = 3.25 - W.chase * 0.16 + Math.sin(t * 1.3) * 0.03;
      brows.scale.set(1 - W.chase * 0.1, 1 + W.chase * 0.3, 1);
      mouth.scale.y = 0.2 + W.chase * 0.18 + W.bite * 0.75;
    },
  };
}

// ---------------------------------------------------------------- Cactus Crab
function crabGeo() {
  if (TYPE_CACHE.crab) return TYPE_CACHE.crab;
  const ribs = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#3fae5a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      const grd = g.createLinearGradient((i * w) / 12, 0, ((i + 1) * w) / 12, 0);
      grd.addColorStop(0, '#2c8a45');
      grd.addColorStop(0.5, '#5cc873');
      grd.addColorStop(1, '#2c8a45');
      g.fillStyle = grd;
      g.fillRect((i * w) / 12, 0, w / 12, h);
    }
  });
  const cactusMat = texMat(ribs, { roughness: 0.6 });
  const dome = new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, Math.PI / 2);
  const shell = merge([
    tx(dome, [0, 1.75, -0.1], [0, 0, 0], [1.45, 1.05, 1.25]),
    tx(new THREE.CylinderGeometry(0.55, 0.6, 1.2, 12, 1, true), [0.25, 3.0, -0.25]),
    tx(dome, [0.25, 3.58, -0.25], [0, 0, 0], [0.55, 0.45, 0.55]),
    tx(new THREE.CylinderGeometry(0.3, 0.32, 0.8, 10, 1, true), [-0.75, 2.6, -0.1], [0, 0, 0.5]),
    tx(dome, [-0.95, 2.92, -0.1], [0, 0, 0.5], [0.3, 0.25, 0.3]),
  ]);
  dome.dispose();
  const r = rng(7);
  const statics = [];
  // shell spines
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU;
    const el = 0.2 + r() * 1.1;
    const n = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const p = [n.x * 1.45, 1.75 + n.y * 1.05, -0.1 + n.z * 1.25];
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const e = new THREE.Euler().setFromQuaternion(q);
    statics.push(vc(cone(0.05, 0.32, 4), '#fff8d8', p, [e.x, e.y, e.z]));
  }
  // flower on the barrel
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    statics.push(vc(sph(6, 5), '#ff7eb6', [0.25 + Math.cos(a) * 0.22, 4.05, -0.25 + Math.sin(a) * 0.22], [0, -a, 0.4], [0.2, 0.08, 0.12]));
  }
  statics.push(vc(sph(6, 5), '#ffd23f', [0.25, 4.08, -0.25], [0, 0, 0], 0.1));
  // crab body + pale belly
  statics.push(vc(sph(16, 10), '#e8663a', [0, 1.4, 0], [0, 0, 0], [1.75, 0.72, 1.4]));
  statics.push(vc(sph(14, 8), '#f6b27c', [0, 1.1, 0.15], [0, 0, 0], [1.5, 0.45, 1.2]));
  // eye stalks
  for (const s of [-1, 1]) statics.push(vc(cyl(0.1, 0.13, 1.0, 6), '#e8663a', [s * 0.45, 2.3, 1.05], [0.25, 0, -s * 0.2]));
  const eyes = eyePair(0.55, 2.85, 1.2, 0.3, 0.55);
  statics.push(...eyes.pupils);
  // mouth: a grumpy little line with fangs
  statics.push(vc(new THREE.BoxGeometry(0.7, 0.08, 0.1), '#5a1a0a', [0, 1.45, 1.38], [0, 0, 0]));
  statics.push(vc(cone(0.07, 0.18, 4), '#ffffff', [-0.2, 1.37, 1.38], [Math.PI, 0, 0]));
  statics.push(vc(cone(0.07, 0.18, 4), '#ffffff', [0.2, 1.37, 1.38], [Math.PI, 0, 0]));
  // claw: arm + palm + fixed lower pincer (built for the right claw, mirrored at runtime)
  const claw = merge([
    vc(cyl(0.18, 0.22, 1.2, 6), '#e8663a', [0, 0, 0.55], [Math.PI / 2, 0, 0]),
    vc(sph(12, 8), '#ef7442', [0, 0.05, 1.35], [0, 0, 0], [0.55, 0.48, 0.6]),
    vc(sph(10, 6), '#f28b52', [0, -0.12, 1.95], [0.15, 0, 0], [0.32, 0.18, 0.62]),
    vc(cone(0.1, 0.3, 4), '#fff1e0', [0, -0.05, 2.5], [Math.PI / 2, 0, 0]),
  ]);
  const pincer = merge([
    vc(sph(10, 6), '#f28b52', [0, 0.1, 0.55], [-0.1, 0, 0], [0.34, 0.2, 0.66]),
    vc(cone(0.1, 0.3, 4), '#fff1e0', [0, 0.02, 1.13], [Math.PI / 2, 0, 0]),
  ]);
  // three jointed legs per side (right side, mirrored for the left)
  const legParts = [];
  for (let i = 0; i < 3; i++) {
    const z = 0.6 - i * 0.62;
    const hip = [1.35, 1.35, z];
    const knee = [2.35, 2.05, z + (1 - i) * 0.25];
    const foot = [2.85, 0.02, z + (1 - i) * 0.45];
    legParts.push(limb(hip, knee, 0.13, 0.11, '#d95a30'));
    legParts.push(vc(sph(6, 5), '#e8663a', knee, [0, 0, 0], 0.14));
    legParts.push(limb(knee, foot, 0.11, 0.04, '#d95a30'));
  }
  TYPE_CACHE.crab = {
    cactusMat, shell,
    statics: merge(statics),
    whites: merge(eyes.whites),
    claw, pincer,
    legs: merge(legParts),
  };
  return markShared(TYPE_CACHE.crab);
}

function buildCrab(body, eyeMat) {
  const G = crabGeo();
  const S = shared();
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const torso = new THREE.Group();
  body.add(torso);
  add(G.shell, G.cactusMat, torso);
  add(G.statics, S.vcMat, torso);
  add(G.whites, eyeMat, torso, false);
  const claws = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 1.3, 1.4, 0.7);
    p.rotation.y = s * 0.35;
    torso.add(p);
    p.scale.setScalar(1.35);
    const c = add(G.claw, S.vcMat, p);
    c.scale.x = s;
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.12, 1.45);
    p.add(hinge);
    const pin = add(G.pincer, S.vcMat, hinge);
    pin.scale.x = s;
    return { p, hinge };
  });
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    body.add(p);
    const l = add(G.legs, S.vcMat, p);
    l.scale.x = s;
    return p;
  });
  // claw phase, accumulated so the snapping speeds up smoothly when it starts chasing
  let clack = 0;
  return {
    headY: 4.3,
    animate(W, t, ph, dt) {
      const wk = W.move;
      const sw = Math.sin(ph * 1.6);
      torso.position.y = Math.abs(Math.sin(ph * 1.6)) * 0.12 * wk + Math.sin(t * 2) * 0.04;
      torso.rotation.z = sw * 0.06 * wk;
      torso.rotation.x = W.bite * 0.2;
      legs[0].rotation.z = sw * 0.14 * wk;
      legs[1].rotation.z = sw * 0.14 * wk;
      legs[0].position.y = Math.max(0, sw) * 0.2 * wk;
      legs[1].position.y = Math.max(0, -sw) * 0.2 * wk;
      // claws: lazy clack on patrol, frantic snapping when chasing, a big lunge-snap on attack
      clack = (clack + (dt || 0) * lerp(3, 16, W.chase)) % TAU;
      const snap = 0.5 + 0.5 * Math.sin(clack);
      for (let i = 0; i < 2; i++) {
        const c = claws[i];
        const s = i ? 1 : -1;
        let open = lerp(0.12 + snap * 0.25, 0.2 + snap * 0.75, W.chase);
        const br = W.biteRaw;
        if (br > 0) open = br < 0.25 ? lerp(open, 1.0, br / 0.25) : br < 0.35 ? 1 - (br - 0.25) / 0.1 : 0;
        c.hinge.rotation.x = -open;
        c.p.rotation.x = -0.25 * W.chase - W.bite * 0.7 + Math.sin(clack + i) * 0.1 * W.chase;
        c.p.rotation.y = s * (0.35 - W.chase * 0.2);
      }
    },
  };
}

// ---------------------------------------------------------------- Swamp Snapper
function snapperGeo() {
  if (TYPE_CACHE.snapper) return TYPE_CACHE.snapper;
  const statics = [];
  // frog body, belly and spots
  statics.push(vc(sph(16, 10), '#4f9a33', [0, 1.35, -0.1], [0, 0, 0], [1.3, 0.95, 1.4]));
  statics.push(vc(sph(14, 8), '#d6e68a', [0, 1.15, 0.5], [0.3, 0, 0], [0.95, 0.72, 0.8]));
  const r = rng(11);
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU;
    statics.push(vc(sph(6, 4), '#3a7a24', [Math.cos(a) * 0.9, 1.75 + r() * 0.35, -0.3 + Math.sin(a) * 0.8], [0, 0, 0], [0.22, 0.08, 0.22]));
  }
  // front legs + feet
  for (const s of [-1, 1]) {
    statics.push(vc(cyl(0.16, 0.2, 0.9, 6), '#4f9a33', [s * 0.8, 0.55, 0.8], [0.25, 0, s * 0.25]));
    statics.push(vc(sph(8, 5), '#5fae3f', [s * 0.92, 0.1, 1.05], [0, 0, 0], [0.4, 0.1, 0.35]));
  }
  // stem neck
  const neckCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 1.9, 0.1), new THREE.Vector3(0, 3.0, -0.2), new THREE.Vector3(0, 3.6, 0.35));
  statics.push(vc(new THREE.TubeGeometry(neckCurve, 8, 0.26, 7), '#5aa63a'));
  // leafy collar where the head meets the stem
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    statics.push(vc(sph(6, 4), '#4d9a2e', [Math.cos(a) * 0.4, 3.4, 0.3 + Math.sin(a) * 0.4], [0, -a, 0.6], [0.45, 0.08, 0.2]));
  }
  // back leg (right; mirrored)
  const leg = merge([
    vc(sph(10, 8), '#4f9a33', [0.1, 0, 0], [0, 0, 0], [0.5, 0.55, 0.85]),
    vc(cyl(0.14, 0.18, 0.9, 6), '#4f9a33', [0.25, -0.45, 0.3], [1.0, 0, 0]),
    vc(new THREE.BoxGeometry(0.7, 0.1, 0.9), '#5fae3f', [0.25, -0.88, 0.62]),
    ...[-0.22, 0, 0.22].map((x) => vc(sph(5, 4), '#6cbf48', [0.25 + x, -0.88, 1.08], [0, 0, 0], [0.1, 0.07, 0.14])),
  ]);
  // jaws: green shells with a red mouth and pale teeth; hinge at the back (z = -1)
  const bowlLow = new THREE.SphereGeometry(1, 16, 6, 0, TAU, Math.PI / 2, Math.PI / 2);
  const bowlUp = new THREE.SphereGeometry(1, 16, 6, 0, TAU, 0, Math.PI / 2);
  const disc = new THREE.CircleGeometry(1, 16);
  const teeth = (up) => {
    const out = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.12 + (i / 8) * 0.76); // front half of the rim
      const x = Math.cos(a) * 1.02;
      const z = Math.sin(a) * 0.98 + 1;
      out.push(vc(cone(0.075, 0.42, 4), '#eef7c8', [x, up ? -0.18 : 0.18, z], [up ? Math.PI : 0, 0, 0]));
    }
    return out;
  };
  const lowJaw = merge([
    vc(bowlLow, '#6abf3a', [0, 0, 1], [0, 0, 0], [1.05, 0.5, 1]),
    vc(disc, '#d6334f', [0, -0.02, 1], [-Math.PI / 2, 0, 0], [1.02, 0.98, 1]),
    vc(sph(8, 6), '#ff6f8a', [0, 0.0, 1.2], [0, 0, 0], [0.4, 0.06, 0.5]),
    ...teeth(false),
  ]);
  const upJaw = merge([
    vc(bowlUp, '#6abf3a', [0, 0, 1], [0, 0, 0], [1.05, 0.58, 1]),
    vc(disc, '#c42a45', [0, 0.02, 1], [Math.PI / 2, 0, 0], [1.02, 0.98, 1]),
    ...teeth(true),
    // red rim blush on top
    vc(sph(10, 6), '#9fdc5a', [0, 0.42, 0.95], [0, 0, 0], [0.7, 0.2, 0.62]),
  ]);
  bowlLow.dispose();
  bowlUp.dispose();
  disc.dispose();
  const eyes = eyePair(0.42, 0.62, 0.95, 0.26, 0.6);
  const upPupils = merge(eyes.pupils);
  TYPE_CACHE.snapper = {
    statics: merge(statics),
    leg, lowJaw, upJaw,
    whites: merge(eyes.whites),
    pupils: upPupils,
  };
  return markShared(TYPE_CACHE.snapper);
}

function buildSnapper(body, eyeMat) {
  const G = snapperGeo();
  const S = shared();
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const torso = new THREE.Group();
  body.add(torso);
  add(G.statics, S.vcMat, torso);
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 1.0, 1.0, -0.6);
    torso.add(p);
    const l = add(G.leg, S.vcMat, p);
    l.scale.x = s;
    return p;
  });
  const head = new THREE.Group();
  head.position.set(0, 3.75, -0.35);
  torso.add(head);
  add(G.lowJaw, S.vcMat, head);
  const upper = new THREE.Group();
  head.add(upper);
  add(G.upJaw, S.vcMat, upper);
  add(G.whites, eyeMat, upper, false);
  add(G.pupils, S.vcMat, upper, false);
  return {
    headY: 5.2,
    animate(W, t, ph) {
      const wk = W.move;
      // frog hops
      const hop = Math.abs(Math.sin(ph * 0.8));
      torso.position.y = hop * lerp(0.35, 0.8, W.chase) * wk;
      torso.rotation.x = (hop - 0.5) * 0.15 * wk + W.bite * 0.35;
      legs[0].rotation.x = legs[1].rotation.x = hop * 0.9 * wk;
      head.rotation.x = -Math.sin(ph * 0.8 * 2) * 0.1 * wk + W.bite * 0.3;
      head.rotation.z = Math.sin(t * 1.3) * 0.08;
      // jaws: slow breathing gape, eager chomping when chasing, a big CHOMP on attack
      const breathe = 0.12 + 0.08 * Math.sin(t * 2);
      const chomp = 0.35 + 0.45 * Math.max(0, Math.sin(t * 9));
      let open = lerp(breathe, chomp, W.chase);
      if (W.biteRaw > 0) open = W.biteRaw < 0.3 ? lerp(open, 1.15, W.biteRaw / 0.3) : Math.max(0, 1.15 * (1 - (W.biteRaw - 0.3) / 0.12));
      upper.rotation.x = -open;
    },
  };
}

// ---------------------------------------------------------------- Lava Sprout
function lavaGeo() {
  if (TYPE_CACHE.lavasprout) return TYPE_CACHE.lavasprout;
  const cracks = (g, w, h, glowOnly) => {
    const r = rng(21);
    g.fillStyle = glowOnly ? '#000000' : '#3a2320';
    g.fillRect(0, 0, w, h);
    if (!glowOnly) {
      for (let i = 0; i < 60; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(90,60,55,0.5)' : 'rgba(20,10,10,0.4)';
        g.beginPath();
        g.arc(r() * w, r() * h, 3 + r() * 10, 0, TAU);
        g.fill();
      }
    }
    for (let k = 0; k < 16; k++) {
      let x = r() * w;
      let y = r() * h;
      g.strokeStyle = glowOnly ? '#ffffff' : '#ff8a2a';
      g.lineWidth = 1.5 + r() * 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.3) * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  const rockMap = canvasTex(256, 128, (g, w, h) => cracks(g, w, h, false));
  const glowMap = canvasTex(256, 128, (g, w, h) => cracks(g, w, h, true));
  const rock = faceted(new THREE.IcosahedronGeometry(1.5, 1).scale(1.08, 1.0, 0.98));
  const statics = [];
  // rocky shoulders / chunks
  statics.push(vc(new THREE.DodecahedronGeometry(0.5, 0), '#4a302b', [-1.2, 2.5, -0.3], [0.3, 0.4, 0]));
  statics.push(vc(new THREE.DodecahedronGeometry(0.42, 0), '#40302b', [1.15, 2.7, -0.2], [0.5, 0.2, 0.3]));
  // brow ridge (animated)
  const brows = merge([-1, 1].map((s) => vc(new THREE.BoxGeometry(0.75, 0.22, 0.3), '#2a1a17', [s * 0.45, 0, 0], [0, 0, s * 0.42])));
  const eyeGeo = merge([-1, 1].map((s) => vc(sph(10, 6), '#ffffff', [s * 0.5, 0, 0], [0, 0, s * -0.2], [0.3, 0.2, 0.15])));
  const mouth = vc(new THREE.BoxGeometry(0.9, 0.3, 0.1), '#ffffff');
  const teeth = merge([-0.3, -0.1, 0.1, 0.3].map((x, i) => vc(cone(0.08, 0.2, 3), '#2a1a17', [x, i % 2 ? -0.1 : 0.1, 0.03], [i % 2 ? 0 : Math.PI, 0, 0])));
  const leg = merge([
    vc(new THREE.CylinderGeometry(0.38, 0.45, 0.8, 6), '#3a2522', [0, -0.4, 0]),
    vc(new THREE.DodecahedronGeometry(0.42, 0), '#2e1e1b', [0, -0.8, 0.15], [0, 0, 0], [1.1, 0.5, 1.3]),
  ]);
  // flames: gradient cones (orange base -> yellow tip)
  const flame = (r, h) => {
    const g = new THREE.ConeGeometry(r, h, 7, 3).translate(0, h / 2, 0).toNonIndexed();
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const a = new THREE.Color('#ff3a0a');
    const b = new THREE.Color('#ffe45c');
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      c.copy(a).lerp(b, clamp01(p.getY(i) / h));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  };
  TYPE_CACHE.lavasprout = {
    rock, rockMap, glowMap,
    statics: faceted(merge(statics)),
    brows: faceted(brows), eyeGeo, mouth, teeth, leg: faceted(leg),
    flameBig: flame(0.5, 2.0),
    flameSide: flame(0.36, 1.35),
    flameMat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return markShared(TYPE_CACHE.lavasprout);
}

function buildLava(body, eyeMat) {
  const G = lavaGeo();
  const S = shared();
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  eyeMat.color.set('#ffd34d');
  eyeMat.emissive.set('#ffb020');
  eyeMat.emissiveIntensity = 1.4;
  const rockMat = new THREE.MeshStandardMaterial({ map: G.rockMap, emissive: '#ff5a1a', emissiveMap: G.glowMap, emissiveIntensity: 1.6, roughness: 0.85 });
  const torso = new THREE.Group();
  body.add(torso);
  const rock = add(G.rock, rockMat, torso);
  rock.position.y = 2.05;
  add(G.statics, S.vcMat, torso);
  const face = new THREE.Group();
  face.position.set(0, 2.2, 1.35);
  torso.add(face);
  const brows = add(G.brows, S.vcMat, face, false);
  brows.position.set(0, 0.45, 0.08);
  const eyes = add(G.eyeGeo, eyeMat, face, false);
  eyes.position.set(0, 0.18, 0.06);
  const mouth = add(G.mouth, eyeMat, face, false);
  mouth.position.set(0, -0.45, 0.02);
  const teeth = add(G.teeth, S.vcMat, mouth, false);
  teeth.position.z = 0.02;
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.72, 0.85, 0);
    body.add(p);
    add(G.leg, S.vcMat, p);
    return p;
  });
  const flames = [
    { geo: G.flameBig, pos: [0, 3.3, -0.1], rot: [0, 0, 0] },
    { geo: G.flameSide, pos: [-0.55, 3.15, 0], rot: [0.1, 0, 0.75] },
    { geo: G.flameSide, pos: [0.55, 3.15, 0], rot: [-0.1, 0, -0.75] },
  ].map((f, i) => {
    const m = new THREE.Mesh(f.geo, G.flameMat);
    m.position.set(...f.pos);
    m.rotation.set(...f.rot);
    m.userData.ph = i * 2.1;
    torso.add(m);
    return m;
  });
  return {
    headY: 5.4,
    materials: [rockMat],
    animate(W, t, ph) {
      const wk = W.move;
      const sw = Math.sin(ph);
      torso.position.y = Math.abs(Math.cos(ph)) * 0.2 * wk;
      torso.rotation.z = sw * 0.1 * wk;
      torso.rotation.x = 0.1 * W.chase + W.bite * 0.3;
      legs[0].rotation.x = sw * 0.55 * wk;
      legs[1].rotation.x = -sw * 0.55 * wk;
      // flames flicker, and flare when angry
      const heat = 1 + W.chase * 0.45 + W.bite * 0.6;
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const k = f.userData.ph;
        const fl = 1 + Math.sin(t * 13 + k) * 0.08 + Math.sin(t * 23 + k * 1.7) * 0.05;
        f.scale.set(heat * (1 - (fl - 1) * 0.6), heat * fl, heat * (1 - (fl - 1) * 0.6));
      }
      rockMat.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.25 + W.chase * 0.9 + W.bite;
      eyeMat.emissiveIntensity = 1.2 + W.chase * 1.4;
      brows.position.y = 0.45 - W.chase * 0.12;
      brows.rotation.z = 0;
      mouth.scale.set(1, 0.6 + W.chase * 0.5 + W.bite * 1.6, 1);
    },
  };
}

// ---------------------------------------------------------------- Star Lurker
function lurkerGeo() {
  if (TYPE_CACHE.lurker) return TYPE_CACHE.lurker;
  const starTex = canvasTex(256, 128, (g, w, h) => {
    const r = rng(5);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#6a4cff');
    grd.addColorStop(1, '#2a1a7a');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = r() < 0.12 ? 2.4 : 1 + r();
      g.fillStyle = r() < 0.2 ? '#ffd6f5' : '#ffffff';
      g.beginPath();
      g.arc(x, y, s, 0, TAU);
      g.fill();
    }
  });
  const glowTex = canvasTex(256, 128, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = '#1a0f40';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = r() < 0.12 ? 2.4 : 1 + r();
      g.fillStyle = r() < 0.2 ? '#ffd6f5' : '#ffffff';
      g.beginPath();
      g.arc(x, y, s, 0, TAU);
      g.fill();
    }
  });
  const bell = new THREE.SphereGeometry(1.7, 22, 12, 0, TAU, 0, Math.PI * 0.56);
  bell.scale(1, 1.1, 1);
  const statics = [];
  // scalloped rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    statics.push(vc(sph(8, 5), '#9d7bff', [Math.cos(a) * 1.62, -0.35, Math.sin(a) * 1.62], [0, -a, 0], [0.42, 0.2, 0.3]));
  }
  // underside of the bell
  statics.push(vc(new THREE.CircleGeometry(1.66, 22), '#2a1a7a', [0, -0.68, 0], [Math.PI / 2, 0, 0]));
  // little "o" mouth
  statics.push(vc(new THREE.TorusGeometry(0.16, 0.06, 6, 12), '#1a0f40', [0, 0.25, 1.62], [0.25, 0, 0], [1, 1.25, 1]));
  const eyes = merge([-1, 1].map((s) => vc(sph(12, 8), '#ffffff', [s * 0.55, 0.85, 1.4], [0, 0, 0], [0.3, 0.38, 0.2])));
  // tentacles: tapered tubes hanging from the rim (waved in the vertex shader)
  const tent = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const rr = i % 2 ? 1.05 : 1.3;
    const len = i % 2 ? 2.6 : 3.2;
    const g = new THREE.CylinderGeometry(0.2, 0.05, len, 6, 6).translate(0, -len / 2, 0);
    tent.push(vc(g, i % 2 ? '#c86bff' : '#7b5cff', [Math.cos(a) * rr, -0.3, Math.sin(a) * rr]));
    g.dispose();
  }
  const tentacles = merge(tent);
  // gradient tips: brighten towards the ends
  const tp = tentacles.attributes.position;
  const tc = tentacles.attributes.color;
  for (let i = 0; i < tp.count; i++) {
    const k = clamp01((-tp.getY(i) - 0.3) / 3.2);
    tc.setXYZ(i, lerp(tc.getX(i), 1.0, k * 0.6), lerp(tc.getY(i), 0.55, k * 0.6), lerp(tc.getZ(i), 0.95, k * 0.5));
  }
  const tentK = new Float32Array(tp.count);
  const tentAng = new Float32Array(tp.count);
  const perTent = tp.count / 8;
  for (let i = 0; i < tp.count; i++) {
    tentK[i] = clamp01((-tp.getY(i) - 0.3) / 3.2);
    const a = (Math.floor(i / perTent) / 8) * TAU + 0.2; // the tentacle's root angle
    tentAng[i] = Math.atan2(Math.sin(a), Math.cos(a));
  }
  TYPE_CACHE.lurker = {
    bell, starTex, glowTex,
    statics: merge(statics),
    eyes, tentacles, tentK, tentAng,
    core: new THREE.SphereGeometry(0.9, 12, 8),
    coreMat: new THREE.MeshBasicMaterial({ color: '#ff7ae0', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  return markShared(TYPE_CACHE.lurker);
}

function buildLurker(body, eyeMat) {
  const G = lurkerGeo();
  const S = shared();
  eyeMat.color.set('#dffcff');
  eyeMat.emissive.set('#7ff4ff');
  eyeMat.emissiveIntensity = 1.2;
  const bellMat = new THREE.MeshStandardMaterial({ map: G.starTex, emissive: '#ffffff', emissiveMap: G.glowTex, emissiveIntensity: 0.9, roughness: 0.3 });
  // tentacles wave on the CPU (per-instance copy of the geometry) so they share the vcMat shader
  const tentGeo = G.tentacles.clone();
  tentGeo.userData = {}; // per-instance: not shared
  tentGeo.boundingSphere = G.tentacles.boundingSphere.clone();
  tentGeo.boundingSphere.radius += 1.5;
  const tPos = tentGeo.attributes.position;
  const base = G.tentacles.attributes.position.array;
  const tk = G.tentK;
  const ta = G.tentAng;
  const float = new THREE.Group();
  body.add(float);
  const torso = new THREE.Group();
  torso.position.y = 3.2;
  float.add(torso);
  const bell = new THREE.Mesh(G.bell, bellMat);
  bell.castShadow = true;
  bell.position.y = -0.35;
  torso.add(bell);
  const core = new THREE.Mesh(G.core, G.coreMat);
  core.position.y = 0.4;
  torso.add(core);
  const st = new THREE.Mesh(G.statics, S.vcMat);
  torso.add(st);
  const eyes = new THREE.Mesh(G.eyes, eyeMat);
  torso.add(eyes);
  const tent = new THREE.Mesh(tentGeo, S.vcMat);
  // only wave the tentacles while they are actually drawn (onBeforeRender runs after frustum culling)
  let drawn = 2;
  tent.onBeforeRender = () => {
    drawn = 2;
  };
  tent.castShadow = true;
  torso.add(tent);
  // bell pulse phase, accumulated so the pulsing speeds up smoothly when it starts chasing
  let pulsePh = 0;
  return {
    headY: 5.6,
    materials: [bellMat],
    geometries: [tentGeo],
    animate(W, t, ph, dt) {
      const amp = 1 + W.chase * 0.5;
      const reach = W.move * 0.35 + W.chase * 0.3 - W.bite * 1.6;
      const arr = tPos.array;
      if (drawn > 0) drawn--;
      for (let i = 0, n = drawn > 0 ? tPos.count : 0; i < n; i++) {
        const k = tk[i];
        if (k <= 0) continue;
        const a = ta[i];
        const o = i * 3;
        arr[o] = base[o] + Math.sin(t * 2.3 + k * 3.2 + a * 2.0) * 0.5 * k * amp;
        arr[o + 1] = base[o + 1] + reach * k * k * 0.5;
        arr[o + 2] = base[o + 2] + Math.cos(t * 1.9 + k * 2.7 + a * 3.0) * 0.4 * k * amp - reach * k * k * 1.6;
      }
      if (drawn > 0) tPos.needsUpdate = true;
      pulsePh = (pulsePh + (dt || 0) * lerp(2.2, 6, W.chase)) % TAU;
      const pulse = Math.sin(pulsePh);
      float.position.y = 0.2 + Math.sin(t * 1.7) * 0.3;
      torso.scale.set(1 + pulse * 0.05 - W.bite * 0.1, 1 - pulse * 0.06 + W.bite * 0.15, 1 + pulse * 0.05 - W.bite * 0.1);
      torso.rotation.x = W.move * 0.15 + W.chase * 0.12 + W.bite * 0.35;
      torso.rotation.z = Math.sin(t * 1.1) * 0.06;
      eyes.scale.set(1, 1 - W.chase * 0.35, 1);
      eyeMat.emissive.setRGB(lerp(0.5, 1.0, W.chase), lerp(0.95, 0.35, W.chase), lerp(1.0, 0.85, W.chase));
      eyeMat.emissiveIntensity = 1.1 + W.chase * 1.2;
      bellMat.emissiveIntensity = 0.8 + 0.25 * Math.sin(t * 2.5) + W.chase * 0.4;
      G.coreMat.opacity = 0.45 + 0.2 * Math.sin(t * 3);
    },
  };
}

// ---------------------------------------------------------------- Snowball Yeti
function yetiGeo() {
  if (TYPE_CACHE.yeti) return TYPE_CACHE.yeti;
  const FUR = '#ffffff';
  const FACE = '#7ea6e2';
  const NAVY = '#27365e';
  const SHADE = '#c3d6f2'; // bluish shadow in the fur's underside
  const BODY_C = [0, 3.0, 0];
  const BODY_R = [1.8, 2.2, 1.6];
  const UP = new THREE.Vector3(0, 1, 0);
  const fur = [];
  // a big egg of fur covered in shaggy locks: blunt tufts hanging down along the body, tips flicked slightly
  // outwards (spread evenly with a jittered Fibonacci spiral; the face and belly stay clean)
  fur.push(vc(sph(18, 12), FUR, BODY_C, [0, 0, 0], BODY_R));
  const r = rng(31);
  const N = 64;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const rad = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const d = [Math.cos(a) * rad + (r() - 0.5) * 0.25, y + (r() - 0.5) * 0.2, Math.sin(a) * rad + (r() - 0.5) * 0.25];
    if (y < -0.75 || (d[2] > 0.3 && y > -0.62 && Math.abs(d[0]) < 0.8)) continue;
    const s = onShell(BODY_C, BODY_R, d, -0.16);
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(s.n, s.n.y);
    if (down.lengthSq() < 0.04) down.set(0, 0, -1);
    const tip = down.normalize().multiplyScalar(0.9).addScaledVector(s.n, 0.35).normalize();
    const k = 0.85 + r() * 0.35;
    const p = new THREE.Vector3(...s.pos).addScaledVector(tip, 0.36 * k);
    fur.push(vc(cyl(0.12 * k, 0.46 * k, 0.72 * k, 6), r() < 0.5 ? FUR : '#eaf2fc', [p.x, p.y, p.z], aim(UP, tip)));
  }
  // a shaggy mane framing the face (short tufts pointing out sideways), and a cowlick on top
  for (let i = 0; i <= 8; i++) {
    const a = -0.55 + (i / 8) * (Math.PI + 1.1);
    const p = onShell(BODY_C, BODY_R, [Math.cos(a) * 1.1, 0.85 + Math.sin(a) * 1.0, 1.15], -0.02).pos;
    fur.push(vc(cone(0.34, 0.6, 6), FUR, p, aim(UP, new THREE.Vector3(Math.cos(a), Math.sin(a), 0.6).normalize())));
  }
  fur.push(vc(cone(0.4, 1.1, 6), FUR, [0.05, 5.25, 0.15], [0.35, 0, -0.2]));
  fur.push(vc(cone(0.32, 0.85, 6), FUR, [-0.4, 5.1, -0.05], [-0.2, 0, 0.55]));
  fur.push(vc(cone(0.32, 0.85, 6), FUR, [0.45, 5.08, -0.1], [-0.2, 0, -0.6]));
  // pale belly patch
  fur.push(vc(sph(14, 8), '#dde9f8', [0, 1.85, 1.02], [0.12, 0, 0], [1.05, 0.95, 0.5]));
  const statics = [shadeY(merge(fur), 0.5, 3.8, SHADE)];
  // blue face and muzzle, button nose, two little fangs under the lip
  statics.push(vc(sph(16, 10), FACE, [0, 3.85, 1.1], [0, 0, 0], [1.05, 0.95, 0.52]));
  statics.push(vc(sph(12, 8), '#8cb0e8', [0, 3.3, 1.45], [0, 0, 0], [0.78, 0.46, 0.36]));
  statics.push(vc(sph(10, 6), NAVY, [0, 3.62, 1.74], [0, 0, 0], [0.22, 0.14, 0.12]));
  for (const s of [-1, 1]) statics.push(vc(cone(0.1, 0.3, 5), '#ffffff', [s * 0.27, 3.33, 1.8], [Math.PI + 0.15, 0, 0]));
  // icy horns: two faceted segments each, pale at the tips
  for (const s of [-1, 1]) {
    statics.push(faceted(limb([s * 0.75, 4.6, 0.05], [s * 1.3, 5.35, -0.05], 0.32, 0.24, '#8fd8ff')));
    statics.push(faceted(limb([s * 1.3, 5.35, -0.05], [s * 1.38, 6.1, -0.3], 0.24, 0.05, '#d8f6ff')));
  }
  const eyes = eyePair(0.43, 4.12, 1.42, 0.34, 0.55);
  statics.push(...eyes.pupils);
  // bushy navy brows (animated as one), a mouth hinged at its top lip (scale.y opens it) with a pink tongue
  const brows = merge([-1, 1].map((s) => vc(new THREE.BoxGeometry(0.82, 0.24, 0.3), NAVY, [s * 0.46, 0, 0], [0, 0, s * 0.36])));
  const mouth = merge([
    vc(sph(12, 8), '#1d1a33', [0, -1, 0], [0, 0, 0], [0.62, 1, 0.25]),
    vc(sph(10, 6), '#ff6f91', [0, -1.55, 0.1], [0, 0, 0], [0.4, 0.42, 0.2]),
  ]);
  // long knuckle-dragging arm (right; the left mirrors it) with navy claws; the right one carries the snowball
  const armParts = () => [
    vc(sph(10, 8), FUR, [0.05, -0.05, 0], [0, 0, 0], [0.62, 0.6, 0.6]),
    limb([0.05, -0.1, 0], [0.3, -1.3, 0.1], 0.5, 0.42, FUR),
    limb([0.3, -1.3, 0.1], [0.36, -2.2, 0.25], 0.42, 0.42, FUR),
    vc(sph(7, 5), FUR, [0.58, -1.25, -0.12], [0, 0, 0], [0.32, 0.4, 0.32]),
    vc(sph(10, 8), FUR, [0.36, -2.45, 0.3], [0, 0, 0], [0.56, 0.5, 0.56]),
    ...[-0.2, 0, 0.2].map((x) => vc(cone(0.08, 0.26, 4), NAVY, [0.36 + x, -2.72, 0.62], [Math.PI / 2 + 0.6, 0, 0])),
  ];
  const armL = shadeY(merge(armParts()), -2.9, -0.4, SHADE);
  const snowball = shadeY(faceted(vc(new THREE.IcosahedronGeometry(0.62, 1), '#ffffff', [0.4, -2.62, 0.95])), -3.2, -2.2, '#c4dbf5');
  const armR = merge([shadeY(merge(armParts()), -2.9, -0.4, SHADE), snowball]);
  // stubby legs on big fluffy feet
  const leg = shadeY(merge([
    vc(cyl(0.5, 0.56, 0.9, 10), FUR, [0, -0.45, 0]),
    vc(sph(12, 8), FUR, [0, -0.82, 0.25], [0, 0, 0], [0.64, 0.32, 0.82]),
    ...[-0.28, 0, 0.28].map((x) => vc(cone(0.1, 0.3, 4), NAVY, [x, -0.9, 1.02], [Math.PI / 2, 0, 0])),
  ]), -1.1, 0, SHADE);
  TYPE_CACHE.yeti = {
    statics: merge(statics),
    whites: merge(eyes.whites),
    brows, mouth, armL, armR, leg,
    breath: blobGeo(vc(sph(8, 6), '#eef8ff', [0, 0, 0], [0, 0, 0], 0.34), 4),
  };
  return markShared(TYPE_CACHE.yeti);
}

function buildYeti(body, eyeMat) {
  const G = yetiGeo();
  const S = shared();
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const torso = new THREE.Group();
  body.add(torso);
  add(G.statics, S.vcMat, torso);
  add(G.whites, eyeMat, torso, false);
  const brows = add(G.brows, S.vcMat, torso, false);
  brows.position.set(0, 4.55, 1.55);
  const mouth = add(G.mouth, S.vcMat, torso, false);
  mouth.position.set(0, 3.42, 1.6);
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 1.6, 3.75, 0.1);
    torso.add(p);
    const a = add(s > 0 ? G.armR : G.armL, S.vcMat, p);
    a.scale.x = s;
    return p;
  });
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.78, 1.05, 0.05);
    body.add(p);
    add(G.leg, S.vcMat, p);
    return p;
  });
  // frosty breath: puffs huffed out of the nostrils, off to both sides
  const breath = blobMesh(G.breath, S.vcMat, [0, 3.4, 2.4], 2.6);
  torso.add(breath.mesh);
  // breathing phase, accumulated so the huffing speeds up smoothly as the yeti gets angry
  let huff = Math.random();
  return {
    headY: 6.2,
    geometries: [breath.geo],
    animate(W, t, ph, dt) {
      const wk = W.move;
      const sw = Math.sin(ph);
      // heavy stomp: a bounce on every step, a side-to-side roll and a lean into the chase
      torso.position.y = Math.abs(Math.cos(ph)) * 0.22 * wk;
      torso.rotation.z = sw * 0.08 * wk;
      torso.rotation.x = 0.06 * wk + 0.16 * W.chase + W.bite * 0.3;
      legs[0].rotation.x = sw * 0.6 * wk;
      legs[1].rotation.x = -sw * 0.6 * wk;
      legs[0].position.y = 1.05 + Math.max(0, sw) * 0.3 * wk;
      legs[1].position.y = 1.05 + Math.max(0, -sw) * 0.3 * wk;
      // arms swing against the legs; chasing, the right one hoists the snowball overhead and shakes it
      const swing = -sw * lerp(0.4, 0.75, W.chase) * wk;
      const droop = W.stun * 0.5;
      arms[0].rotation.x = swing;
      arms[1].rotation.x = lerp(-swing, -2.7 + Math.sin(t * 11) * 0.12, W.chase);
      arms[0].rotation.z = -0.12 - W.chase * 0.3 - droop;
      arms[1].rotation.z = 0.12 + W.chase * 0.1 + droop;
      // catch: both fists up high... then SLAM
      const br = W.biteRaw;
      if (br > 0) {
        const up = br < 0.3 ? lerp(-0.4, -2.9, br / 0.3) : br < 0.42 ? lerp(-2.9, -0.35, (br - 0.3) / 0.12) : -0.35;
        const k = clamp01(br / 0.08) * clamp01((1 - br) / 0.35);
        arms[0].rotation.x = lerp(arms[0].rotation.x, up, k);
        arms[1].rotation.x = lerp(arms[1].rotation.x, up, k);
      }
      // brows drop and pinch when angry; the mouth roars open
      brows.position.y = 4.55 - W.chase * 0.16 + Math.sin(t * 1.3) * 0.03;
      brows.scale.set(1 - W.chase * 0.1, 1 + W.chase * 0.3, 1);
      mouth.scale.y = 0.15 + W.chase * 0.12 + W.bite * 0.4 + W.stun * 0.12 + Math.sin(t * 2.2) * 0.015;
      // frosty breath: slow snorts on patrol, fast angry huffs while chasing, a big blast on a catch
      huff = (huff + dt * lerp(0.6, 1.8, W.chase)) % 1;
      if (breath.live()) {
        const size = lerp(0.8, 1.2, W.chase) + W.bite * 0.4;
        for (let k = 0; k < 4; k++) {
          const s = k & 1 ? 1 : -1;
          const L = (huff + (k >> 1) * 0.5) % 1;
          const grow = Math.pow(Math.sin(Math.PI * L), 0.5) * (0.15 + L * 1.1) * size * (1 - W.stun);
          breath.place(k, s * (0.35 + L * 1.6), 3.5 - L * 0.3 + L * L * 0.7, 1.9 + L * 0.7, grow);
        }
        breath.commit();
      }
    },
  };
}

// ---------------------------------------------------------------- Gummy Bear
function gummyGeo() {
  if (TYPE_CACHE.gummy) return TYPE_CACHE.gummy;
  // Molded bear shapes, built twice: a see-through candy shell and a darker core inside it (fakes the depth of
  // translucent gummy: thin edges glow, the thick middle is deep red).
  const SHELL = '#ff3550';
  const CORE = '#b30f2c';
  const HEAD_C = [0, 1.0, 0];
  const HEAD_R = [1.2, 1.05, 1.0];
  const bodyParts = (c, k) => [
    vc(sph(16, 10), c, [0, 1.9, 0], [0, 0, 0], [1.3 * k, 1.4 * k, 1.05 * k]),
    vc(sph(12, 8), c, [0, 1.7, 0.42], [0, 0, 0], [0.95 * k, 1.0 * k, 0.72 * k]),
    ...[-1, 1].map((s) => vc(sph(12, 8), c, [s * 0.7, 0.55, 0.25], [0, 0, 0], [0.56 * k, 0.55 * k, 0.72 * k])),
  ];
  // head parts around the neck pivot (the head jiggles on its own)
  const headParts = (c, k) => [
    vc(sph(16, 10), c, HEAD_C, [0, 0, 0], HEAD_R.map((x) => x * k)),
    ...[-1, 1].map((s) => vc(sph(10, 8), c, [s * 0.92, 1.85, -0.05], [0, 0, 0], [0.44 * k, 0.44 * k, 0.3 * k])),
    vc(sph(12, 8), c, [0, 0.68, 0.85], [0, 0, 0], [0.56 * k, 0.42 * k, 0.4 * k]),
  ];
  // candy shine on a lobe (centre c, radii r): a slanted streak at direction d and a dot up and right of it
  const shine = (c, r, d, len) => {
    const spot = (dd, sc, roll) => {
      const h = onShell(c, r, dd, 0.02);
      return vc(sph(8, 5), '#fff3f5', h.pos, [h.rot[0], h.rot[1], h.rot[2] + roll], sc);
    };
    return [spot(d, [0.1 * len, 0.3 * len, 0.03], -0.75), spot([d[0] + 0.3, d[1] + 0.25, d[2]], [0.07, 0.07, 0.03], 0)];
  };
  const face = [];
  // nose, shine, little sugar fangs
  face.push(vc(sph(10, 6), '#6e0418', [0, 0.84, 1.2], [0, 0, 0], [0.2, 0.14, 0.12]));
  face.push(...shine(HEAD_C, HEAD_R, [-0.62, 0.62, 0.5], 1));
  for (const s of [-1, 1]) face.push(vc(cone(0.06, 0.2, 4), '#ffffff', [s * 0.14, 0.44, 1.24], [Math.PI, 0, 0]));
  const eyes = eyePair(0.44, 1.28, 0.8, 0.27, 0.58);
  face.push(...eyes.pupils);
  // stubby arm (right; mirrored for the left), pivot at the shoulder: small enough to be solid candy
  const arm = vc(sph(10, 8), '#e81c38', [0.22, -0.42, 0.28], [0.7, 0, 0.45], [0.34, 0.62, 0.36]);
  TYPE_CACHE.gummy = {
    bodyShell: merge(bodyParts(SHELL, 1)),
    bodyCore: merge([...bodyParts(CORE, 0.84), ...shine([0, 1.7, 0.42], [0.95, 1.0, 0.72], [-0.6, 0.4, 0.7], 1.1)]),
    headShell: merge(headParts(SHELL, 1)),
    headCore: merge(headParts(CORE, 0.84)),
    face: merge(face),
    whites: merge(eyes.whites),
    brows: merge([-1, 1].map((s) => vc(new THREE.BoxGeometry(0.5, 0.14, 0.2), '#7a0a1e', [s * 0.36, 0, 0], [0, 0, s * 0.42]))),
    mouth: vc(sph(12, 8), '#4a0010', [0, -1, 0], [0, 0, 0], [0.36, 1, 0.16]),
    arm,
    glossMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0, emissive: '#ff1a3c', emissiveIntensity: 0.12 }),
  };
  return markShared(TYPE_CACHE.gummy);
}

function buildGummy(body, eyeMat) {
  const G = gummyGeo();
  const S = shared();
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // candy shell: glossy, see-through (no depth write, so overlapping lobes blend alike in any order)
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.66, depthWrite: false, roughness: 0.14, metalness: 0, emissive: '#ff1a3c', emissiveIntensity: 0.12 });
  // jelly: everything squashes and stretches about the feet
  const jelly = new THREE.Group();
  body.add(jelly);
  add(G.bodyCore, S.vcMat, jelly, false);
  add(G.bodyShell, shellMat, jelly);
  const head = new THREE.Group();
  head.position.set(0, 2.95, 0.05);
  jelly.add(head);
  add(G.headCore, S.vcMat, head, false);
  add(G.headShell, shellMat, head);
  add(G.face, S.vcMat, head, false);
  add(G.whites, eyeMat, head, false);
  const brows = add(G.brows, S.vcMat, head, false);
  brows.position.set(0, 1.62, 0.86);
  const mouth = add(G.mouth, S.vcMat, head, false);
  mouth.position.set(0, 0.5, 1.12);
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 1.08, 2.62, 0.2);
    jelly.add(p);
    const a = add(G.arm, G.glossMat, p);
    a.scale.x = s;
    return p;
  });
  // two damped springs: body squash (+ = tall) and the head's wobble lagging behind it
  let sq = 0;
  let sqv = 0;
  let wob = 0;
  let wobv = 0;
  return {
    headY: 5.6,
    materials: [shellMat],
    animate(W, t, ph, dt) {
      const wk = W.move;
      // boing boing: hops, higher and quicker when chasing
      const hp = ph * 0.5;
      const hop = Math.abs(Math.sin(hp));
      const amp = lerp(0.5, 1.3, W.chase) * wk;
      jelly.position.y = hop * amp;
      // squash at touchdown, stretch in the air; a melted puddle when dizzy; a tall stretch before a chomp
      let target = (hop < 0.28 ? -0.26 * (1 - hop / 0.28) : 0.12 * hop) * amp;
      target += Math.sin(t * 2.4) * 0.03 - W.stun * 0.2 + W.bite * 0.12;
      for (let left = dt; left > 1e-5; left -= 1 / 90) {
        const h = Math.min(left, 1 / 90);
        sqv += (-700 * (sq - target) - 20 * sqv) * h;
        sq = Math.min(0.3, Math.max(-0.3, sq + sqv * h));
        wobv += (-150 * (wob + sqv * 0.025) - 5 * wobv) * h;
        wob += wobv * h;
      }
      jelly.scale.set(1 - sq * 0.55, 1 + sq, 1 - sq * 0.55);
      jelly.rotation.z = Math.sin(hp) * 0.06 * wk + Math.sin(t * 5.3) * 0.08 * W.stun;
      jelly.rotation.x = 0.12 * W.chase * wk + W.bite * 0.15;
      // head wobbles on its jelly neck
      head.rotation.x = wob * 0.9 + W.bite * 0.35 - W.chase * 0.05;
      head.rotation.z = Math.sin(t * 3.1) * 0.05 + wob * 0.35;
      head.scale.set(1 + wob * 0.12, 1 - wob * 0.15, 1 + wob * 0.12);
      // arms: little paddles on patrol, raised claws wiggling when chasing ("rawr!")
      const wig = Math.sin(t * 13) * 0.3 * W.chase;
      arms[0].rotation.x = -Math.sin(hp * 2) * 0.35 * wk - W.chase * 1.3 + wig;
      arms[1].rotation.x = Math.sin(hp * 2) * 0.35 * wk - W.chase * 1.3 - wig;
      arms[0].rotation.z = -0.25 - W.chase * 0.35 - W.bite * 0.5;
      arms[1].rotation.z = 0.25 + W.chase * 0.35 + W.bite * 0.5;
      // grumpy molded brows, a mouth that opens into a big gummy CHOMP
      brows.position.y = 1.62 - W.chase * 0.1;
      brows.scale.set(1, 1 + W.chase * 0.4, 1);
      let open = 0.1 + W.chase * 0.12;
      const br = W.biteRaw;
      if (br > 0) open = br < 0.3 ? lerp(open, 0.4, br / 0.3) : br < 0.4 ? lerp(0.4, 0.05, (br - 0.3) / 0.1) : lerp(0.05, open, (br - 0.4) / 0.6);
      mouth.scale.y = open;
      shellMat.emissiveIntensity = 0.12 + W.chase * 0.18 + W.bite * 0.3;
    },
  };
}

// ---------------------------------------------------------------- Storm Puff
function stormGeo() {
  if (TYPE_CACHE.storm) return TYPE_CACHE.storm;
  const GREY = '#a7afc2';
  // a heap of puffs around the face puff (x, y, z, radii), flat dark belly underneath
  const puffs = [
    [0, 0.15, 0.05, 1.45, 1.25, 1.3],
    [-1.35, -0.1, 0.1, 1.0, 0.9, 1.0],
    [1.4, -0.05, 0.0, 1.05, 0.95, 1.0],
    [-0.62, 0.98, -0.1, 0.95, 0.9, 0.95],
    [0.68, 1.08, -0.2, 0.9, 0.85, 0.9],
    [0, 0.3, -0.95, 1.1, 1.0, 0.9],
    [-2.15, -0.35, -0.1, 0.62, 0.55, 0.62],
    [2.2, -0.3, -0.15, 0.6, 0.55, 0.6],
    [-0.85, -0.52, 0.72, 0.68, 0.52, 0.6],
    [0.85, -0.52, 0.7, 0.68, 0.52, 0.6],
  ];
  const parts = puffs.map(([x, y, z, a, b, c]) => vc(sph(14, 10), GREY, [x, y, z], [0, 0, 0], [a, b, c]));
  parts.push(vc(sph(16, 8), GREY, [0, -0.55, 0], [0, 0, 0], [2.3, 0.5, 1.35]));
  const statics = [shadeY(merge(parts), -1.05, 1.5, '#434a66')];
  const eyes = eyePair(0.5, 0.45, 1.12, 0.32, 0.55);
  statics.push(...eyes.pupils);
  // jagged little teeth hanging from the top lip
  for (const x of [-0.27, -0.09, 0.09, 0.27]) statics.push(vc(cone(0.07, 0.3, 4), '#ffffff', [x, -0.24, 1.36], [Math.PI, 0, 0]));
  // zig-zag lightning bolt (tip down), extruded thin
  const sh = new THREE.Shape();
  [[-0.12, 0], [0.3, 0], [0.06, -0.45], [0.3, -0.45], [-0.2, -1.2], [-0.02, -0.62], [-0.26, -0.62]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const bolt = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06);
  // crackle: little bolts poking out of the cloud (flickered together, spun for variety)
  const sparks = merge([
    tx(bolt, [-1.75, -0.55, 0.55], [0, 0.3, -0.35], 1.2),
    tx(bolt, [1.8, -0.5, 0.35], [0, -0.3, 0.4], 1.1),
    tx(bolt, [0.35, -0.8, -0.75], [0, 1.2, 0.15], 1.0),
    tx(bolt, [-2.55, 0.35, -0.3], [0, 1.4, -1.9], 0.7),
    tx(bolt, [2.65, 0.45, -0.2], [0, -1.4, 1.8], 0.7),
  ]);
  // the big strike on a catch: from the belly down to the ground in front
  const strike = tx(bolt, [0.1, -0.75, 1.7], [0, 0, 0], [1.5, 2.85, 1.5]);
  bolt.dispose();
  TYPE_CACHE.storm = {
    statics: merge(statics),
    whites: merge(eyes.whites),
    brows: merge([-1, 1].map((s) => vc(new THREE.BoxGeometry(0.78, 0.22, 0.3), '#262a3a', [s * 0.46, 0, 0], [0, 0, s * 0.5]))),
    mouth: vc(sph(12, 8), '#1c1d2c', [0, -1, 0], [0, 0, 0], [0.52, 1, 0.2]),
    sparks, strike,
    rain: blobGeo(vc(new THREE.OctahedronGeometry(1, 0), '#9ad8ff', [0, 0, 0], [0, 0, 0], [0.1, 0.24, 0.1]), 12),
  };
  return markShared(TYPE_CACHE.storm);
}

function buildStorm(body, eyeMat) {
  const G = stormGeo();
  const S = shared();
  eyeMat.emissive.set('#ffd23f');
  // per instance: the cloud glows a little while its big bolt strikes (once per catch: the small sparks never
  // light the cloud, so nothing large strobes on screen)
  const cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, emissive: '#e6eeff', emissiveIntensity: 0 });
  const float = new THREE.Group();
  body.add(float);
  const torso = new THREE.Group();
  torso.position.y = 3.75;
  float.add(torso);
  const cloud = new THREE.Mesh(G.statics, cloudMat);
  cloud.castShadow = true;
  torso.add(cloud);
  const face = new THREE.Group();
  torso.add(face);
  face.add(new THREE.Mesh(G.whites, eyeMat));
  const brows = new THREE.Mesh(G.brows, S.vcMat);
  brows.position.set(0, 0.88, 1.18);
  face.add(brows);
  const mouth = new THREE.Mesh(G.mouth, S.vcMat);
  mouth.position.set(0, -0.12, 1.2);
  face.add(mouth);
  const sparks = new THREE.Mesh(G.sparks, S.starMat);
  torso.add(sparks);
  const strike = new THREE.Mesh(G.strike, S.starMat);
  torso.add(strike);
  const rain = blobMesh(G.rain, S.vcMat, [0, -2, 0], 3.2);
  torso.add(rain.mesh);
  // each drop: where it falls from (under the cloud), its phase and speed
  const seed = Math.random() * 100;
  const drops = Array.from({ length: 12 }, (_, i) => {
    const a = hash01(i, seed) * TAU;
    const rr = Math.sqrt(hash01(i + 40, seed));
    return { x: Math.cos(a) * rr * 1.9, z: Math.sin(a) * rr * 0.95, ph: hash01(i + 80, seed), sp: 0.8 + hash01(i + 120, seed) * 0.4 };
  });
  // boil and rain phases, accumulated so they speed up smoothly as the storm gets angry
  let boilPh = seed;
  let rainPh = 0;
  return {
    headY: 5.9,
    materials: [cloudMat],
    geometries: [rain.geo],
    animate(W, t, ph, dt) {
      // float and bob, leaning into the chase
      float.position.y = Math.sin(t * 1.8) * 0.28 + Math.sin(ph * 0.5) * 0.08 * W.move;
      torso.rotation.x = W.move * 0.1 + W.chase * 0.12 + W.bite * 0.3;
      torso.rotation.z = Math.sin(t * 1.3) * 0.05;
      // the cloud boils: slow breathing on patrol, angry churning when chasing
      boilPh = (boilPh + dt * lerp(2, 8, W.chase)) % TAU;
      rainPh += dt * lerp(0.9, 1.9, W.chase);
      const boil = Math.sin(boilPh);
      cloud.scale.set(1 + boil * 0.035 + W.chase * 0.05, 1 - boil * 0.03 + W.bite * 0.08, 1 + boil * 0.035);
      // crackle: a rare spark on patrol, lots of sparking when chasing (stunned: fizzled out)
      const tick = Math.floor(t * 9);
      const on = hash01(tick, seed) < lerp(0.08, 0.6, W.chase) * (1 - W.stun);
      sparks.visible = on;
      if (on) sparks.rotation.y = (hash01(tick + 7, seed) - 0.5) * 1.2;
      // catch: KA-ZAP straight down in front
      const br = W.biteRaw;
      strike.visible = br > 0.1 && br < 0.6;
      cloudMat.emissiveIntensity = strike.visible ? 0.22 : 0;
      // grumpy face: brows pinch, the mouth grumbles, eyes glow electric yellow when angry
      brows.position.y = 0.88 - W.chase * 0.1;
      brows.position.z = 1.18 + W.chase * 0.04;
      brows.scale.set(1 - W.chase * 0.08, 1 + W.chase * 0.3, 1);
      mouth.scale.y = 0.12 + W.chase * 0.13 + W.bite * 0.4 + Math.max(0, Math.sin(t * 9)) * 0.05 * W.chase;
      eyeMat.color.setRGB(1, 1, lerp(1, 0.6, W.chase));
      eyeMat.emissiveIntensity = W.chase * 1.3 + (strike.visible ? 1 : 0);
      // rain: drizzle on patrol, a downpour when chasing, stops while dizzy
      if (rain.live()) {
        const size = 1 - W.stun;
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          const L = (rainPh * d.sp + d.ph) % 1;
          const s = size * clamp01(L * 10) * clamp01((1 - L) * 6);
          rain.place(i, d.x, -0.75 - L * 3.2, d.z, s);
        }
        rain.commit();
      }
    },
  };
}

// ---------------------------------------------------------------- shared by the gem-lit monsters below

/** Bake facet shading into vertex colours (for unlit glowing parts): every triangle a little brighter or darker. */
function glint(g) {
  const p = g.attributes.position;
  const c = g.attributes.color;
  const L = new THREE.Vector3(0.45, 0.75, 0.5).normalize();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    d.fromBufferAttribute(p, i + 2).sub(a);
    const n = b.cross(d).normalize();
    const k = 0.62 + 0.5 * Math.abs(n.dot(L)) + 0.12 * n.y;
    for (let j = i; j < i + 3; j++) c.setXYZ(j, c.getX(j) * k, c.getY(j) * k, c.getZ(j) * k);
  }
  return g;
}

/** A hexagonal crystal from a to b (radius r), its tip paler: two vertex-coloured, faceted parts. */
function crystalSpike(a, b, r, color, tip = '#ffffff') {
  const mid = new THREE.Vector3(...a).lerp(new THREE.Vector3(...b), 0.68).toArray();
  return [faceted(limb(a, mid, r, r * 0.9, color)), faceted(limb(mid, b, r * 0.9, 0.001, '#' + new THREE.Color(color).lerp(new THREE.Color(tip), 0.5).getHexString()))];
}

// ---------------------------------------------------------------- Gem Golem
function golemGeo() {
  if (TYPE_CACHE.golem) return TYPE_CACHE.golem;
  const STONE = '#8a80ab';
  const DARK = '#5f5582';
  const MINT = '#3dffb4';
  const VIOLET = '#b48cff';
  const PINK = '#ff8ae6';
  const r = rng(77);
  // mottled boulders: faceted, every facet a slightly different shade of stone
  const boulder = (pos, scl, color = STONE, detail = 1) => {
    const g = faceted(vc(new THREE.IcosahedronGeometry(1, detail), color, pos, [r() * 3, r() * 3, r() * 3], scl));
    const c = g.attributes.color;
    for (let i = 0; i < c.count; i += 3) {
      const k = 0.84 + r() * 0.28;
      for (let j = i; j < i + 3; j++) c.setXYZ(j, c.getX(j) * k, c.getY(j) * k, c.getZ(j) * k);
    }
    return g;
  };
  const statics = [];
  // a hulking boulder body with broad shoulders, a small head sunk between them and a pale belly stone
  statics.push(boulder([0, 3.2, 0], [1.7, 1.6, 1.35]));
  statics.push(boulder([0, 2.05, 0.05], [1.2, 0.8, 1.0], DARK));
  for (const s of [-1, 1]) statics.push(boulder([s * 1.45, 4.05, -0.05], [0.95, 0.85, 0.9]));
  statics.push(boulder([0, 4.65, 0.55], [0.85, 0.72, 0.78], '#9a90bd'));
  statics.push(boulder([0, 3.0, 0.95], [0.95, 0.85, 0.45], '#b1a8cc', 0));
  // two square teeth under the lip
  for (const x of [-0.16, 0.16]) statics.push(faceted(vc(new THREE.BoxGeometry(0.15, 0.17, 0.12), '#ece6ff', [x, 4.3, 1.3])));
  const eyes = eyePair(0.32, 4.78, 1.2, 0.22, 0.6);
  statics.push(...eyes.pupils);
  // glowing gems: a crystal ridge down the back, clusters on the shoulders, one on the head, and gem freckles
  const gems = [];
  const spike = (a, b, rr, col) => gems.push(...crystalSpike(a, b, rr, col));
  spike([0, 4.3, -0.9], [0, 6.0, -1.65], 0.28, MINT);
  spike([-0.55, 4.0, -1.0], [-1.05, 5.35, -1.85], 0.21, VIOLET);
  spike([0.55, 3.9, -1.05], [1.05, 5.2, -1.85], 0.21, MINT);
  spike([0.05, 3.15, -1.25], [0.15, 4.2, -2.3], 0.19, PINK);
  spike([-0.4, 2.65, -1.15], [-0.8, 3.3, -2.0], 0.15, MINT);
  for (const s of [-1, 1]) {
    spike([s * 1.6, 4.55, -0.1], [s * 2.1, 5.75, -0.3], 0.22, VIOLET);
    spike([s * 1.25, 4.7, 0.1], [s * 1.45, 5.5, 0.25], 0.14, MINT);
    spike([s * 1.95, 4.3, 0.2], [s * 2.55, 4.95, 0.45], 0.13, PINK);
  }
  spike([0.22, 5.2, 0.4], [0.42, 5.85, 0.3], 0.11, MINT);
  [[-0.55, 3.62, 1.22, MINT], [0.62, 2.9, 1.24, VIOLET], [-0.25, 2.55, 1.28, PINK], [1.62, 3.7, 0.72, MINT], [-1.68, 3.85, 0.68, VIOLET]].forEach(([x, y, z, col], i) =>
    gems.push(vc(new THREE.OctahedronGeometry(1, 0), col, [x, y, z], [0.3, i, 0.5], 0.13)));
  // boulder arm (right; the left mirrors it), pivot at the shoulder, ending in a huge knuckly fist
  const arm = merge([
    boulder([0.15, -0.55, 0], [0.5, 0.6, 0.5], STONE, 0),
    boulder([0.25, -1.45, 0.05], [0.55, 0.6, 0.55], STONE, 0),
    boulder([0.3, -2.4, 0.2], [0.8, 0.72, 0.78]),
    ...[-0.28, 0, 0.28].map((x) => boulder([0.3 + x, -2.3, 0.92], [0.19, 0.17, 0.17], '#a79ec6', 0)),
  ]);
  // stumpy pillar legs on flat stone feet
  const leg = merge([
    boulder([0, -0.4, 0], [0.62, 0.6, 0.62], STONE, 0),
    boulder([0, -0.95, 0.18], [0.72, 0.32, 0.88], DARK, 0),
  ]);
  TYPE_CACHE.golem = {
    statics: merge(statics),
    whites: merge(eyes.whites),
    brows: merge([-1, 1].map((s) => faceted(vc(new THREE.BoxGeometry(0.62, 0.2, 0.32), DARK, [s * 0.34, 0, 0], [0, 0, s * 0.3])))),
    mouth: vc(sph(12, 6), '#1c1530', [0, -1, 0], [0, 0, 0], [0.42, 1, 0.22]),
    gems: glint(merge(gems)),
    arm, leg,
  };
  return markShared(TYPE_CACHE.golem);
}

function buildGolem(body, eyeMat) {
  const G = golemGeo();
  const S = shared();
  // per instance: the gems are unlit (they glow) and pulse brighter as it gets angry
  const gemMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const torso = new THREE.Group();
  body.add(torso);
  add(G.statics, S.vcMat, torso);
  add(G.gems, gemMat, torso);
  add(G.whites, eyeMat, torso, false);
  const brows = add(G.brows, S.vcMat, torso, false);
  brows.position.set(0, 5.02, 1.24);
  const mouth = add(G.mouth, S.vcMat, torso, false);
  mouth.position.set(0, 4.4, 1.27);
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 1.75, 4.15, 0.05);
    torso.add(p);
    const a = add(G.arm, S.vcMat, p);
    a.scale.x = s;
    return p;
  });
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.8, 1.3, 0.05);
    body.add(p);
    add(G.leg, S.vcMat, p);
    return p;
  });
  // shimmer phase, accumulated so the gems pulse faster smoothly as it gets angry
  let glowPh = Math.random() * TAU;
  return {
    headY: 6.0,
    materials: [gemMat],
    animate(W, t, ph, dt) {
      const wk = W.move;
      const sw = Math.sin(ph);
      // heavy, rumbling stomp: a bounce on every step and a sway, leaning in when it chases
      torso.position.y = Math.abs(Math.cos(ph)) * 0.2 * wk - W.stun * 0.15;
      torso.rotation.z = sw * 0.07 * wk;
      torso.rotation.x = 0.05 * wk + 0.18 * W.chase + W.bite * 0.3;
      legs[0].rotation.x = sw * 0.55 * wk;
      legs[1].rotation.x = -sw * 0.55 * wk;
      legs[0].position.y = 1.3 + Math.max(0, sw) * 0.28 * wk;
      legs[1].position.y = 1.3 + Math.max(0, -sw) * 0.28 * wk;
      // fists swing against the legs; chasing, they come up and pound the air
      const swing = -sw * 0.45 * wk;
      const pump = Math.sin(t * 9) * 0.3 * W.chase;
      arms[0].rotation.x = lerp(swing, -1.3 + pump, W.chase);
      arms[1].rotation.x = lerp(-swing, -1.3 - pump, W.chase);
      arms[0].rotation.z = -0.12 - W.chase * 0.25 - W.stun * 0.4;
      arms[1].rotation.z = 0.12 + W.chase * 0.25 + W.stun * 0.4;
      // catch: both fists up high... then SMASH
      const br = W.biteRaw;
      if (br > 0) {
        const up = br < 0.3 ? lerp(-0.4, -2.9, br / 0.3) : br < 0.42 ? lerp(-2.9, -0.3, (br - 0.3) / 0.12) : -0.3;
        const k = clamp01(br / 0.08) * clamp01((1 - br) / 0.35);
        arms[0].rotation.x = lerp(arms[0].rotation.x, up, k);
        arms[1].rotation.x = lerp(arms[1].rotation.x, up, k);
      }
      // stony brows crunch down, the jaw grinds open
      brows.position.y = 5.02 - W.chase * 0.13;
      brows.scale.set(1 - W.chase * 0.1, 1 + W.chase * 0.35, 1);
      mouth.scale.y = 0.12 + W.chase * 0.1 + W.bite * 0.45 + W.stun * 0.1 + Math.sin(t * 1.7) * 0.01;
      // gems: a slow shimmer, brighter and quicker when angry, flaring on a catch, dim when dizzy
      glowPh = (glowPh + dt * lerp(1.5, 6, W.chase)) % TAU;
      gemMat.color.setScalar((0.85 + Math.sin(glowPh) * lerp(0.06, 0.16, W.chase) + W.chase * 0.2 + W.bite * 0.45) * (1 - W.stun * 0.4));
    },
  };
}

// ---------------------------------------------------------------- Puffer Pop
function pufferGeo() {
  if (TYPE_CACHE.puffer) return TYPE_CACHE.puffer;
  const CORAL = '#ff7a59';
  const BELLY = '#ffe7c4';
  const FIN = '#ffb08a';
  const R = [1.25, 1.2, 1.31];
  // a round body: coral back fading into a cream belly, with darker spots on top
  const ball = vc(sph(18, 12), CORAL, [0, 0, 0], [0, 0, 0], R);
  {
    const p = ball.attributes.position;
    const c = ball.attributes.color;
    const A = new THREE.Color(CORAL), B = new THREE.Color(BELLY), T = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const k = clamp01((-p.getY(i) / R[1]) * 1.6 + 0.35);
      T.copy(A).lerp(B, k * k * (3 - 2 * k));
      c.setXYZ(i, T.r, T.g, T.b);
    }
  }
  const statics = [ball];
  const rr = rng(12);
  for (let i = 0; i < 14; i++) {
    const d = [rr() * 2 - 1, 0.3 + rr() * 0.7, rr() * 1.6 - 1.1];
    if (d[2] > 0.25 && Math.abs(d[0]) < 0.7) continue; // keep the face clean
    const h = onShell([0, 0, 0], R, d, 0, [0, 1, 0]);
    const s = 0.15 + rr() * 0.08;
    statics.push(vc(sph(8, 5), '#e0502f', h.pos, h.rot, [s, 0.04, s]));
  }
  // a little dorsal fin
  statics.push(vc(sph(8, 5), FIN, [0, 1.12, -0.45], [0.5, 0, 0], [0.05, 0.38, 0.5]));
  const eyes = eyePair(0.55, 0.32, 0.95, 0.38, 0.5);
  statics.push(...eyes.pupils);
  // spikes all over (not on the face): cream with coral tips; they pop out as it inflates
  const spikes = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const rad = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const d = [Math.cos(a) * rad, y, Math.sin(a) * rad];
    if (d[2] > 0.4 && Math.abs(d[0]) < 0.75 && y > -0.6) continue;
    const h = onShell([0, 0, 0], R, d, 0);
    spikes.push(vc(cone(0.1, 0.5, 4), '#fff1dc', [h.pos[0] + h.n.x * 0.2, h.pos[1] + h.n.y * 0.2, h.pos[2] + h.n.z * 0.2], aim(new THREE.Vector3(0, 1, 0), h.n)));
  }
  const spikeGeo = merge(spikes);
  {
    const p = spikeGeo.attributes.position;
    const c = spikeGeo.attributes.color;
    const tip = new THREE.Color('#ff5c3a');
    for (let i = 0; i < p.count; i++) {
      const k = clamp01((Math.hypot(p.getX(i) / R[0], p.getY(i) / R[1], p.getZ(i) / R[2]) - 1.12) / 0.25);
      c.setXYZ(i, lerp(c.getX(i), tip.r, k), lerp(c.getY(i), tip.g, k), lerp(c.getZ(i), tip.b, k));
    }
  }
  // puckered lips around a dark little "o"
  const lips = merge([
    vc(new THREE.TorusGeometry(0.2, 0.1, 6, 14), '#ff5c7a'),
    vc(new THREE.CircleGeometry(0.2, 12), '#3a0d1a', [0, 0, -0.03]),
  ]);
  // a pectoral fin (right; mirrored for the left): a fan of soft rays, pivot at its root
  const fin = merge([-0.45, 0, 0.45].map((a) => vc(sph(8, 5), FIN, [0.32 * Math.cos(a), 0.32 * Math.sin(a), 0], [0, 0, a], [0.38, 0.13, 0.05])));
  // tail: a stubby stalk and two lobes, pivot where it joins the body
  const tail = merge([
    vc(sph(10, 6), CORAL, [0, 0, -0.1], [0, 0, 0], [0.24, 0.26, 0.3]),
    ...[-1, 1].map((s) => vc(sph(8, 5), FIN, [0, s * 0.26, -0.42], [s * 0.65, 0, 0], [0.05, 0.42, 0.3])),
  ]);
  TYPE_CACHE.puffer = {
    statics: merge(statics),
    spikes: spikeGeo,
    whites: merge(eyes.whites),
    brows: merge([-1, 1].map((s) => vc(new THREE.BoxGeometry(0.46, 0.13, 0.2), '#a32a12', [s * 0.5, 0, 0], [0, 0, s * 0.42]))),
    lips, fin, tail,
    bubbles: blobGeo(vc(sph(8, 6), '#d8f6ff', [0, 0, 0], [0, 0, 0], 0.16), 5),
  };
  return markShared(TYPE_CACHE.puffer);
}

function buildPuffer(body, eyeMat) {
  const G = pufferGeo();
  const S = shared();
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // swims through the air: swim = bob and tilt, puff = the inflating ball (everything on it scales with it)
  const swim = new THREE.Group();
  body.add(swim);
  const puff = new THREE.Group();
  puff.position.y = 2.75;
  swim.add(puff);
  add(G.statics, S.vcMat, puff);
  const spikes = add(G.spikes, S.vcMat, puff);
  add(G.whites, eyeMat, puff, false);
  const brows = add(G.brows, S.vcMat, puff, false);
  brows.position.set(0, 0.86, 1.02);
  const lips = add(G.lips, S.vcMat, puff, false);
  lips.position.set(0, -0.28, 1.28);
  const fins = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 1.12, -0.15, 0.2);
    puff.add(p);
    const f = add(G.fin, S.vcMat, p, false);
    f.scale.x = s;
    return p;
  });
  const tail = new THREE.Group();
  tail.position.set(0, 0.05, -1.25);
  puff.add(tail);
  add(G.tail, S.vcMat, tail);
  const bubbles = blobMesh(G.bubbles, S.vcMat, [0, 3.6, 1.8], 3);
  swim.add(bubbles.mesh);
  // inflation spring (overshoots for a springy POP), fin stroke and bubble phases
  let infl = 0;
  let inflV = 0;
  let finPh = Math.random() * 10;
  let bub = Math.random();
  return {
    headY: 4.75,
    geometries: [bubbles.geo],
    animate(W, t, ph, dt) {
      // bob and swish, pitching into the chase
      swim.position.y = Math.sin(t * 2.1) * 0.22 + Math.sin(ph * 0.5) * 0.06 * W.move;
      swim.rotation.x = W.move * 0.08 + W.chase * 0.1 + W.bite * 0.2;
      swim.rotation.z = Math.sin(t * 1.4) * 0.06;
      // PUFF! it blows up when it spots you, and goes flat when dizzy
      const target = clamp01(W.chase * 1.1 + W.bite * 0.35) * (1 - W.stun);
      for (let left = dt; left > 1e-5; left -= 1 / 90) {
        const h = Math.min(left, 1 / 90);
        inflV += (-260 * (infl - target) - 11 * inflV) * h;
        infl += inflV * h;
      }
      const s = 1.12 * (1 + 0.4 * infl);
      puff.scale.set(s * (1 + Math.sin(t * 3) * 0.015), s * (1 - W.stun * 0.12), s);
      spikes.scale.setScalar(0.82 + 0.18 * clamp01(infl));
      // fins paddle and the tail beats, faster when it chases
      finPh += dt * lerp(5, 14, Math.max(W.move, W.chase));
      const f = 0.45 + Math.sin(finPh) * 0.5;
      fins[0].rotation.y = -f;
      fins[1].rotation.y = f;
      tail.rotation.y = Math.sin(finPh * 0.8 + 1) * lerp(0.35, 0.6, W.chase);
      // angry brows show up when it puffs; the lips pucker... and gape on a catch
      brows.scale.set(1, 0.15 + W.chase * 1.1, 1);
      brows.position.y = 0.86 - W.chase * 0.06;
      lips.scale.setScalar(lerp(1, 0.75, W.chase) + W.bite * 1.0 + W.stun * 0.3);
      // bubbles blub out of the mouth and float up (more of them when it is angry)
      bub = (bub + dt * lerp(0.35, 0.9, W.chase)) % 1;
      if (bubbles.live()) {
        const z = 1.35 * s;
        for (let k = 0; k < 5; k++) {
          const L = (bub + k / 5) % 1;
          const g = (0.4 + L * 0.9) * Math.sqrt(1 - L) * clamp01(L * 8) * (1 - W.stun);
          bubbles.place(k, Math.sin(k * 2.3 + L * 4) * 0.3 * L, 2.75 - 0.25 * s + L * 2.2, z + L * 0.6, g);
        }
        bubbles.commit();
      }
    },
  };
}

// ---------------------------------------------------------------- Comet Dragon
const COMET_LEN = 4.4; // the noodle body trails this far behind the neck (before the 1.5x scale)
function cometGeo() {
  if (TYPE_CACHE.comet) return TYPE_CACHE.comet;
  const BODY = '#8a7dff';
  const BELLY = '#e2dcff';
  const GOLD = '#ffd23f';
  const RAINBOW = ['#ff4d6d', '#ff9f1a', '#ffe94d', '#4cd964', '#3dc9ff', '#6b7bff', '#c86bff'];
  // the head (origin = where it meets the neck), looking along +Z
  const head = [];
  head.push(vc(sph(16, 12), BODY, [0, 0.15, 0.25], [0, 0, 0], [0.82, 0.74, 0.9]));
  head.push(vc(sph(14, 10), '#a89eff', [0, -0.06, 0.95], [0, 0, 0], [0.56, 0.42, 0.55]));
  head.push(vc(sph(12, 8), BELLY, [0, -0.3, 0.7], [0, 0, 0], [0.6, 0.24, 0.62]));
  for (const s of [-1, 1]) {
    head.push(vc(sph(6, 4), '#3a2a7a', [s * 0.17, 0.08, 1.45], [0, 0, 0], [0.06, 0.05, 0.04]));
    // golden horns sweeping back, ear fins and long whiskers
    head.push(limb([s * 0.3, 0.72, 0.1], [s * 0.42, 1.1, -0.2], 0.13, 0.09, GOLD), limb([s * 0.42, 1.1, -0.2], [s * 0.36, 1.32, -0.62], 0.09, 0.02, '#fff1a0'));
    head.push(vc(sph(8, 5), '#c8bfff', [s * 0.74, 0.38, -0.05], [0, s * 0.6, s * 0.5], [0.07, 0.3, 0.42]));
    head.push(limb([s * 0.38, -0.08, 1.25], [s * 0.85, 0.02, 1.15], 0.045, 0.035, GOLD), limb([s * 0.85, 0.02, 1.15], [s * 1.2, 0.28, 0.65], 0.035, 0.025, GOLD), limb([s * 1.2, 0.28, 0.65], [s * 1.3, 0.55, 0.15], 0.025, 0.012, GOLD));
    head.push(vc(cone(0.06, 0.2, 4), '#ffffff', [s * 0.2, -0.24, 1.32], [Math.PI, 0, 0]));
  }
  const eyes = eyePair(0.36, 0.42, 0.75, 0.25, 0.55);
  head.push(...eyes.pupils);
  // the mane: rainbow comet flames streaming back from the head (unlit, they glow)
  const mane = [];
  for (let i = 0; i < 7; i++) {
    const a = -1.25 + (i / 6) * 2.5;
    const base = [Math.sin(a) * 0.45, 0.5 + Math.cos(a) * 0.25, -0.3];
    const tip = [Math.sin(a) * 1.0, 0.75 + Math.cos(a) * 0.55, -1.35 - Math.cos(a) * 0.3];
    mane.push(faceted(limb(base, tip, 0.2, 0.001, RAINBOW[i])));
  }
  // the noodle body: a tapering tube along -Z, periwinkle above and pale below, built ring by ring so each
  // vertex knows how far down the body it is (bodyU: 0 at the neck .. 1 at the tail) for the wave
  const NS = 26, NR = 8;
  const radius = (u) => lerp(0.56, 0.1, Math.pow(u, 1.1)) * (1 + 0.12 * Math.sin(u * Math.PI));
  const tube = new THREE.BufferGeometry();
  {
    const pos = [], col = [], idx = [];
    const A = new THREE.Color(BODY), B = new THREE.Color(BELLY), T = new THREE.Color();
    for (let i = 0; i <= NS; i++) {
      const u = i / NS;
      const z = -0.2 - u * COMET_LEN;
      const rr = radius(u);
      for (let j = 0; j <= NR; j++) {
        const a = (j / NR) * TAU;
        const y = Math.sin(a);
        pos.push(Math.cos(a) * rr, y * rr * 0.9, z);
        T.copy(A).lerp(B, clamp01(-y * 1.4 - 0.1));
        col.push(T.r, T.g, T.b);
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NR; j++) {
        const a = i * (NR + 1) + j, c = a + NR + 1;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tube.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    tube.setIndex(idx);
    tube.computeVertexNormals();
  }
  const bodyParts = [tube.toNonIndexed()];
  tube.dispose();
  // rainbow spines along the back, little legs with golden claws, and a tail fin
  for (let j = 0; j < 9; j++) {
    const u = 0.06 + j * 0.1;
    const z = -0.2 - u * COMET_LEN, rr = radius(u);
    bodyParts.push(faceted(limb([0, rr * 0.8, z], [0, rr * 0.8 + 0.42 * (1 - u * 0.6), z - 0.28], 0.12 * (1 - u * 0.5), 0.001, RAINBOW[j % 7])));
  }
  for (const u of [0.1, 0.48]) {
    const z = -0.2 - u * COMET_LEN, rr = radius(u);
    for (const s of [-1, 1]) {
      const hip = [s * rr * 0.75, -rr * 0.4, z];
      const foot = [s * (rr * 0.75 + 0.22), -rr - 0.42, z + 0.18];
      bodyParts.push(limb(hip, foot, 0.14, 0.11, BODY), vc(sph(6, 4), '#a89eff', foot, [0, 0, 0], [0.15, 0.11, 0.19]));
      for (const x of [-0.07, 0.07]) bodyParts.push(vc(cone(0.04, 0.14, 4), GOLD, [foot[0] + x, foot[1] - 0.02, foot[2] + 0.17], [Math.PI / 2, 0, 0]));
    }
  }
  bodyParts.push(vc(sph(8, 5), '#c8bfff', [0, 0.15, -0.2 - COMET_LEN - 0.1], [0.5, 0, 0], [0.05, 0.4, 0.35]));
  const bodyGeo = merge(bodyParts);
  const bp = bodyGeo.attributes.position;
  const bodyU = new Float32Array(bp.count);
  for (let i = 0; i < bp.count; i++) bodyU[i] = clamp01((-bp.getZ(i) - 0.2) / COMET_LEN);
  // a glowing star at the tip of the tail, and its trail of sparks
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const r = i % 2 ? 0.24 : 0.55;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starShape = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false }).translate(0, 0, -0.08);
  const star = glint(vc(starShape, '#fff3a0'));
  starShape.dispose();
  TYPE_CACHE.comet = {
    head: merge(head),
    whites: merge(eyes.whites),
    brows: merge([-1, 1].map((s) => vc(new THREE.BoxGeometry(0.42, 0.12, 0.2), '#3a2a7a', [s * 0.36, 0, 0], [0, 0, s * 0.4]))),
    mouth: vc(sph(12, 6), '#2a1a5a', [0, -1, 0], [0, 0, 0], [0.3, 1, 0.14]),
    mane: glint(merge(mane)),
    body: bodyGeo,
    bodyU,
    star,
    trail: blobGeo(glint(vc(new THREE.OctahedronGeometry(1, 0), '#fff3a0', [0, 0, 0], [0, 0, 0], 0.15)), 10),
    glowMat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return markShared(TYPE_CACHE.comet);
}

function buildComet(body, eyeMat) {
  const G = cometGeo();
  const S = shared();
  const add = (geo, mat, parent, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // built small and scaled up: it glides above the road, its long body trailing behind
  const fly = new THREE.Group();
  fly.position.y = 2.3;
  fly.scale.setScalar(1.5);
  body.add(fly);
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0.5);
  fly.add(head);
  add(G.head, S.vcMat, head);
  add(G.whites, eyeMat, head, false);
  const brows = add(G.brows, S.vcMat, head, false);
  brows.position.set(0, 0.74, 0.92);
  const mouth = add(G.mouth, S.vcMat, head, false);
  mouth.position.set(0, -0.2, 1.4);
  const mane = add(G.mane, G.glowMat, head, false);
  // the noodle body waves on the CPU (per-instance copy of the geometry), only while it is drawn
  const geo = G.body.clone();
  geo.userData = {}; // per-instance: not shared
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -0.2 - COMET_LEN / 2), COMET_LEN / 2 + 1.6);
  const pos = geo.attributes.position;
  const rest = G.body.attributes.position.array;
  const U = G.bodyU;
  const noodle = add(geo, S.vcMat, fly);
  let drawn = 2;
  noodle.onBeforeRender = () => {
    drawn = 2;
  };
  const star = add(G.star, G.glowMat, fly, false);
  const trail = blobMesh(G.trail, G.glowMat, [0, 0, -COMET_LEN - 1.5], 3);
  fly.add(trail.mesh);
  // wave phase, accumulated so the body swims faster smoothly when it chases
  let wave = Math.random() * TAU;
  let amp = 0.4;
  const wx = (u) => amp * (0.12 + u) * Math.sin(u * 5.5 - wave);
  const wy = (u) => amp * 0.5 * (0.1 + u) * Math.sin(u * 4.2 - wave * 0.8 + 1);
  return {
    headY: 4.9,
    geometries: [geo, trail.geo],
    animate(W, t, ph, dt) {
      wave = (wave + dt * lerp(2.2, 6, Math.max(W.move * 0.6, W.chase))) % (TAU * 10);
      amp = lerp(0.35, 0.6, W.chase) * (1 - W.stun * 0.6);
      // glide, swooping a little lower and leaning in when it chases
      fly.position.y = 2.3 + Math.sin(t * 1.7) * 0.3 - W.chase * 0.25;
      fly.rotation.x = W.chase * 0.08 + W.bite * 0.15;
      // the body ripples like a ribbon in the wind
      if (drawn > 0) drawn--;
      if (drawn > 0) {
        const arr = pos.array;
        for (let i = 0, n = pos.count; i < n; i++) {
          const u = U[i];
          arr[i * 3] = rest[i * 3] + wx(u);
          arr[i * 3 + 1] = rest[i * 3 + 1] + wy(u);
        }
        pos.needsUpdate = true;
      }
      // the head rides the front of the wave and looks where it is going
      head.position.x = wx(0);
      head.position.y = 0.25 + wy(0);
      head.rotation.y = -amp * (Math.sin(-wave) + 0.66 * Math.cos(-wave)) * 0.35;
      head.rotation.x = -W.chase * 0.1 + W.bite * 0.2;
      head.rotation.z = Math.sin(t * 1.3) * 0.06;
      // the tail star spins; sparks stream off behind it
      const tz = -0.2 - COMET_LEN - 0.25;
      star.position.set(wx(1), 0.15 + wy(1), tz);
      star.rotation.z = t * 3;
      star.rotation.y = Math.sin(t * 1.1) * 0.5;
      star.scale.setScalar(1 + W.chase * 0.2 + W.bite * 0.4);
      if (trail.live()) {
        for (let k = 0; k < 10; k++) {
          const L = (t * lerp(0.8, 1.6, W.chase) + k / 10) % 1;
          const u = 1 + L * 0.45;
          trail.place(k, wx(u) * (1 - L * 0.5) + Math.sin(k * 3.1) * 0.25 * L, 0.15 + wy(u) + Math.cos(k * 2.3) * 0.2 * L, tz - L * 2.4, (1 - L) * (0.6 + 0.4 * W.chase) * (1 - W.stun * 0.7));
        }
        trail.commit();
      }
      // mane flickers like comet fire
      mane.scale.set(1 + Math.sin(t * 11) * 0.06, 1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9) * 0.1 + W.chase * 0.25);
      // face: brows pinch, the jaw drops for a roar
      brows.position.y = 0.74 - W.chase * 0.08;
      brows.scale.set(1, 1 + W.chase * 0.4, 1);
      mouth.scale.y = 0.08 + W.chase * 0.08 + W.bite * 0.3 + W.stun * 0.06;
    },
  };
}

// Every road monster type with art (tests check every biome's monster is here).
const BUILDERS = { stump: buildStump, crab: buildCrab, snapper: buildSnapper, lavasprout: buildLava, lurker: buildLurker, yeti: buildYeti, gummy: buildGummy, storm: buildStorm, golem: buildGolem, puffer: buildPuffer, comet: buildComet };
const ANGRY_EYES = { stump: '#ff3b1f', crab: '#ff3b1f', snapper: '#ff2d55', yeti: '#ff3b1f', gummy: '#ffd23f', golem: '#3dffb4', puffer: '#ff3b1f', comet: '#ffd23f' };
export const MONSTER_TYPES = Object.freeze(Object.keys(BUILDERS));

// ------------------------------------------------------------------ public

export function createMonster(type) {
  const S = shared();
  const root = new THREE.Group();
  root.name = 'monster-' + type;
  const body = new THREE.Group(); // stun wobble / lunge
  root.add(body);
  const eyeMat = eyeMaterial();
  const build = BUILDERS[type] || buildStump;
  const M = build(body, eyeMat);
  const angry = new THREE.Color(ANGRY_EYES[type] || '#ff3b1f');
  const halo = new THREE.Mesh(S.halo, S.starMat);
  halo.visible = false;
  halo.position.y = M.headY + 0.5;
  root.add(halo);

  const W = { move: 0, chase: 0, stun: 0, bite: 0, biteRaw: 0 };
  let phase = Math.random() * 10;
  let clock = Math.random() * 10;

  return {
    object3d: root,
    update(dt, s) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      clock += dt;
      const t = clock;
      const stunned = s.state === 'stunned';
      const speed = stunned ? 0 : s.speed || 0;
      W.move = damp(W.move, clamp01(speed / 6), 8, dt);
      W.chase = damp(W.chase, s.state === 'chase' ? 1 : 0, 6, dt);
      W.stun = damp(W.stun, stunned ? 1 : 0, 10, dt);
      const age = s.attackAge == null ? 99 : s.attackAge;
      W.biteRaw = age >= 0 && age < 0.6 ? age / 0.6 : 0;
      W.bite = W.biteRaw > 0 ? Math.sin(W.biteRaw * Math.PI) : 0;
      phase += dt * Math.min(18, 2.5 + speed * 0.42);

      M.animate(W, t, phase, dt);

      // lunge forward on a catch
      body.position.z = W.bite * 0.9;
      // dizzy wobble
      const ws = W.stun;
      body.rotation.set(Math.cos(t * 6) * 0.14 * ws, Math.sin(t * 2.8) * 0.5 * ws, Math.sin(t * 6) * 0.14 * ws);
      halo.visible = ws > 0.05;
      if (halo.visible) {
        halo.rotation.y = t * 4;
        halo.scale.setScalar(0.5 + 0.5 * ws);
      }
      // eyes burn when chasing (lava/lurker handle their own glow)
      if (ANGRY_EYES[type]) {
        eyeMat.emissive.copy(angry).multiplyScalar(W.chase * 0.9);
        eyeMat.color.setRGB(1, lerp(1, 0.75, W.chase), lerp(1, 0.7, W.chase));
      }
    },
    dispose() {
      eyeMat.dispose();
      M.materials?.forEach((m) => m.dispose());
      M.geometries?.forEach((g) => g.dispose());
    },
  };
}
