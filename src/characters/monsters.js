// Road monsters: five characterful low-poly critters that guard the biomes.
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
  return {
    headY: 4.3,
    animate(W, t, ph) {
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
      const rate = lerp(3, 16, W.chase);
      const snap = 0.5 + 0.5 * Math.sin(t * rate);
      for (let i = 0; i < 2; i++) {
        const c = claws[i];
        const s = i ? 1 : -1;
        let open = lerp(0.12 + snap * 0.25, 0.2 + snap * 0.75, W.chase);
        const br = W.biteRaw;
        if (br > 0) open = br < 0.25 ? lerp(open, 1.0, br / 0.25) : br < 0.35 ? 1 - (br - 0.25) / 0.1 : 0;
        c.hinge.rotation.x = -open;
        c.p.rotation.x = -0.25 * W.chase - W.bite * 0.7 + Math.sin(t * rate + i) * 0.1 * W.chase;
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
      const pulse = Math.sin(t * lerp(2.2, 6, W.chase));
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

const BUILDERS = { stump: buildStump, crab: buildCrab, snapper: buildSnapper, lavasprout: buildLava, lurker: buildLurker };
const ANGRY_EYES = { stump: '#ff3b1f', crab: '#ff3b1f', snapper: '#ff2d55' };

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
