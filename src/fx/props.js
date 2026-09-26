// Small gameplay props: banana peel (ground trap), water balloon (thrown), pool noodle (legacy; the character
// module draws the real noodle). Geometry and materials are built once and shared by every instance.
// Contract: createBanana() -> Object3D ; createBalloon() -> Object3D ; createNoodle(color) -> Object3D (pool noodle held in the right hand, ~4 studs long, origin at the grip, extends along +Y)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const cache = {};
const _c = new THREE.Color();

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    fn(_c, pos.getX(i), pos.getY(i), pos.getZ(i), i);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

// ---------------------------------------------------------------- banana peel

const PEEL_OUT = new THREE.Color('#ffd81a');
const PEEL_SHADE = new THREE.Color('#f0a810');
const PEEL_IN = new THREE.Color('#fff3c4');
const PEEL_TIP = new THREE.Color('#7a4d1c');

// One drooping peel petal pointing along +X: a tapered, domed strip from the top of the peel down to the ground.
function petalGeometry(len, width, lift) {
  const SEG = 9, ACROSS = 5, TH = 0.08;
  const p0 = new THREE.Vector2(0.06, 0.6 * lift), p1 = new THREE.Vector2(0.52 * len, 0.66 * lift), p2 = new THREE.Vector2(len, 0.04);
  const pos = [], col = [], idx = [];
  const ring = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const u = 1 - t;
    let x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
    let y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
    if (t > 0.82) y += (t - 0.82) * 0.55; // tips curl up off the floor
    let w = width * (1 - 0.45 * t);
    if (t > 0.85) w *= Math.sqrt(Math.max(0.05, 1 - ((t - 0.85) / 0.15) ** 2));
    const tip = Math.max(0, (t - 0.8) / 0.2);
    const row = [];
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j < ACROSS; j++) {
        const s = (j / (ACROSS - 1)) * 2 - 1;
        const dy = -s * s * 0.13 - (side ? TH : 0);
        pos.push(x, y + dy, s * w * 0.5);
        const c = side ? PEEL_IN.clone() : PEEL_OUT.clone().lerp(PEEL_SHADE, Math.abs(s) * 0.6);
        c.lerp(PEEL_TIP, tip ** 1.5);
        col.push(c.r, c.g, c.b);
        row.push(pos.length / 3 - 1);
      }
    }
    ring.push(row);
  }
  for (let i = 0; i < SEG; i++) {
    const a = ring[i], b = ring[i + 1];
    for (let j = 0; j < ACROSS - 1; j++) {
      // outer (top) surface
      idx.push(a[j], b[j], a[j + 1], a[j + 1], b[j], b[j + 1]);
      // inner (bottom) surface, reversed
      const k = ACROSS + j;
      idx.push(a[k], a[k + 1], b[k], a[k + 1], b[k + 1], b[k]);
    }
    // side walls
    const e0 = 0, e1 = ACROSS - 1;
    idx.push(a[e0], a[ACROSS + e0], b[e0], b[e0], a[ACROSS + e0], b[ACROSS + e0]);
    idx.push(a[e1], b[e1], a[ACROSS + e1], b[e1], b[ACROSS + e1], a[ACROSS + e1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function bananaGeometry() {
  const parts = [];
  const petals = [
    [0.1, 0.84, 0.5, 1],
    [1.62, 0.76, 0.46, 0.96],
    [3.2, 0.82, 0.48, 1.02],
    [4.75, 0.72, 0.44, 0.94],
  ];
  for (const [a, len, w, lift] of petals) parts.push(petalGeometry(len, w, lift).rotateY(a));
  // crown where the petals meet
  parts.push(paint(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(0, 0.5, 0), (c) => c.copy(PEEL_OUT)));
  // stem stub with a dark tip, leaning a little
  const stem = new THREE.CylinderGeometry(0.06, 0.1, 0.42, 7, 2).translate(0, 0.21, 0);
  paint(stem, (c, x, y) => c.copy(PEEL_SHADE).lerp(PEEL_TIP, Math.max(0, (y - 0.24) / 0.18)));
  stem.rotateZ(0.22).rotateY(0.6).translate(0, 0.56, 0);
  parts.push(stem);
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

export function createBanana() {
  if (!cache.banana) {
    cache.banana = {
      geo: bananaGeometry(),
      mat: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#3d2c00', emissiveIntensity: 0.6 }),
    };
  }
  const m = new THREE.Mesh(cache.banana.geo, cache.banana.mat);
  m.castShadow = true;
  m.name = 'banana-peel';
  m.rotation.y = Math.random() * Math.PI * 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// ---------------------------------------------------------------- water balloon

function balloonParts() {
  // lathe profile: round bottom, soft shoulders, pinched neck at the top
  const prof = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = -Math.PI / 2 + t * Math.PI;
    let r = Math.cos(a) * 0.56;
    let y = Math.sin(a) * 0.52;
    if (t > 0.5) {
      const k = (t - 0.5) / 0.5;
      r *= 1 - 0.78 * k ** 2.2;
      y += k * k * 0.12;
    }
    prof.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  prof.push(new THREE.Vector2(0.07, 0.66));
  const body = new THREE.LatheGeometry(prof, 18);
  body.deleteAttribute('uv');
  const knot = new THREE.TorusGeometry(0.075, 0.04, 6, 10).rotateX(Math.PI / 2).translate(0, 0.68, 0);
  const lip = new THREE.CylinderGeometry(0.1, 0.05, 0.1, 8).translate(0, 0.76, 0);
  const tie = mergeGeometries([knot, lip].map((g) => (g.deleteAttribute('uv'), g.index ? g.toNonIndexed() : g)));
  const shine = new THREE.SphereGeometry(0.13, 8, 6).scale(1, 0.62, 0.35).rotateZ(0.7);
  return { body, tie, shine };
}

export function createBalloon() {
  if (!cache.balloon) {
    cache.balloon = {
      ...balloonParts(),
      bodyMat: new THREE.MeshPhongMaterial({ color: '#3fa6ff', emissive: '#0b3b80', emissiveIntensity: 0.35, specular: '#ffffff', shininess: 90, transparent: true, opacity: 0.86 }),
      tieMat: new THREE.MeshLambertMaterial({ color: '#1f6fd6' }),
      shineMat: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
    };
  }
  const c = cache.balloon;
  const g = new THREE.Group();
  g.name = 'water-balloon';
  const body = new THREE.Mesh(c.body, c.bodyMat);
  body.castShadow = true;
  const tie = new THREE.Mesh(c.tie, c.tieMat);
  const shine = new THREE.Mesh(c.shine, c.shineMat);
  shine.position.set(-0.26, 0.2, 0.4);
  g.add(body, tie, shine);
  return g;
}

// ---------------------------------------------------------------- pool noodle (legacy)

export function createNoodle(color = '#ff4fa3') {
  if (!cache.noodle) {
    const foam = new THREE.CylinderGeometry(0.3, 0.3, 4.2, 8, 1, true).translate(0, 2.1, 0);
    const cap = new THREE.RingGeometry(0.1, 0.3, 8).rotateX(-Math.PI / 2);
    const hole = new THREE.CircleGeometry(0.1, 8).rotateX(-Math.PI / 2);
    cache.noodle = {
      foam,
      caps: mergeGeometries([cap.clone().translate(0, 4.2, 0), cap.clone().rotateX(Math.PI).translate(0, 0, 0)]),
      holes: mergeGeometries([hole.clone().translate(0, 4.19, 0), hole.clone().rotateX(Math.PI).translate(0, 0.01, 0)]),
      holeMat: new THREE.MeshBasicMaterial({ color: '#1b1b24' }),
      mats: new Map(),
    };
  }
  const c = cache.noodle;
  let mat = c.mats.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
    c.mats.set(color, mat);
  }
  const g = new THREE.Group();
  const foam = new THREE.Mesh(c.foam, mat);
  foam.castShadow = true;
  g.add(foam, new THREE.Mesh(c.caps, mat), new THREE.Mesh(c.holes, c.holeMat));
  return g;
}
