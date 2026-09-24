// Low-poly geometry helpers and the Builder that bakes plant parts into a few merged, vertex-coloured meshes.
// A species builder places parts in "plant space" (origin = soil surface, +Y up, +Z = the plant's front).
// Parts are grouped by animation pivot (e.g. 'body', 'head', 'jaw'); within a group all parts that share a
// material are merged into ONE geometry, so a whole plant is typically 1-4 draw calls.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { col, recolor, vivid, plantMat, plantQuality, FACE } from './materials.js';

const TAU = Math.PI * 2;
const geoCache = new Map();
export function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true; // cached for the whole session: owners must not dispose it
    geoCache.set(key, g);
  }
  return g;
}

// ------------------------------------------------------------------ primitives (unit sized, cached)

export const P = {
  sphere: (w = 8, h = 6) => cachedGeo(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h)),
  // upper half sphere, flat side at y=0
  dome: (w = 8, h = 4, cut = 0.5) => cachedGeo(`dome${w}_${h}_${cut}`, () => new THREE.SphereGeometry(1, w, h, 0, TAU, 0, Math.PI * cut)),
  // cylinder from y=0 to y=1
  cyl: (rt = 1, rb = 1, seg = 8, open = false) => cachedGeo(`cyl${rt}_${rb}_${seg}_${open}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg, 1, open).translate(0, 0.5, 0)),
  cone: (seg = 8) => cachedGeo(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1).translate(0, 0.5, 0)),
  box: () => cachedGeo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  ico: (d = 0) => cachedGeo(`ico${d}`, () => new THREE.IcosahedronGeometry(1, d)),
  oct: () => cachedGeo('oct', () => new THREE.OctahedronGeometry(1, 0)),
  dodeca: () => cachedGeo('dod', () => new THREE.DodecahedronGeometry(1, 0)),
  torus: (tube = 0.25, rs = 5, ts = 10, arc = TAU) => cachedGeo(`tor${tube}_${rs}_${ts}_${arc}`, () => new THREE.TorusGeometry(1, tube, rs, ts, arc)),
  disc: (seg = 12) => cachedGeo(`disc${seg}`, () => new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2)),
  ring: (inner = 0.8, seg = 16) => cachedGeo(`ring${inner}_${seg}`, () => new THREE.RingGeometry(inner, 1, seg, 1).rotateX(-Math.PI / 2)),
  // radius 1 blob with a gentle random wobble (rocks, potatoes, bushes)
  blob: (seed = 1, amt = 0.18, d = 1) => cachedGeo(`blob${seed}_${amt}_${d}`, () => {
    let g = new THREE.IcosahedronGeometry(1, d);
    if (d > 0) {
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      g = mergeVertices(g);
    }
    const p = g.attributes.position;
    const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    const offs = new Map();
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < p.count; i++) {
      const k = key(p.getX(i), p.getY(i), p.getZ(i));
      if (!offs.has(k)) offs.set(k, 1 + (rnd() - 0.5) * 2 * amt);
      const f = offs.get(k);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  }),
};

// Width profiles for leafGeo (t = 0 at base .. 1 at tip), returning 0..1.
const PROFILES = {
  leaf: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9),
  petal: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.6),
  round: (t) => Math.pow(Math.sin(Math.PI * t), 0.55),
  point: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 1.1),
  blade: (t) => Math.min(1, t * 5) * Math.pow(1 - t, 0.75),
  feather: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 1.25)), 0.8),
  spoon: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.45)), 0.5),
  flame: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.7) * (1 - 0.15 * t),
};

/**
 * A single-surface leaf/petal lying along +Y (length 1, max width 1) facing +Z.
 * bend curls the tip toward +Z (negative = away), cup raises the edges toward +Z, twist rotates along the length.
 */
export function leafGeo({ shape = 'leaf', segL = 4, segW = 2, bend = 0.25, cup = 0.15, twist = 0, notch = 0, serrate = 0 } = {}) {
  return cachedGeo(`leaf${shape}_${segL}_${segW}_${bend}_${cup}_${twist}_${notch}_${serrate}`, () => {
    const prof = PROFILES[shape] || PROFILES.leaf;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segL; i++) {
      const t = i / segL;
      const w = Math.max(0.0005, prof(t)) * 0.5 * (serrate && i % 2 && i < segL ? 1 - serrate : 1);
      const ang = twist * t;
      for (let j = 0; j <= segW; j++) {
        const u = (j / segW) * 2 - 1;
        let x = u * w;
        let y = t - notch * (1 - Math.abs(u)) * Math.pow(t, 6);
        let z = bend * t * t + cup * u * u * w * 2;
        const cx = Math.cos(ang), sx = Math.sin(ang);
        const rx = x * cx - z * sx;
        const rz = x * sx + z * cx;
        pos.push(rx, y, rz);
        uv.push(j / segW, t);
      }
    }
    const row = segW + 1;
    for (let i = 0; i < segL; i++) {
      for (let j = 0; j < segW; j++) {
        const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** Tapered tube along a Catmull-Rom curve through `pts` ([[x,y,z],...]) in plant space. Not cached. */
export function tubeGeo(pts, r0, r1 = r0, radial = 6, segs = 6, capEnd = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P0 = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P0);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(P0.x + N.x * r, P0.y + N.y * r, P0.z + N.z * r);
      nor.push(N.x, N.y, N.z);
      uv.push(j / radial, t);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (capEnd) {
    curve.getPointAt(1, P0);
    const tip = pos.length / 3;
    const T = frames.tangents[segs];
    pos.push(P0.x + T.x * r1 * 0.6, P0.y + T.y * r1 * 0.6, P0.z + T.z * r1 * 0.6);
    nor.push(T.x, T.y, T.z);
    uv.push(0.5, 1);
    const base = segs * row;
    for (let j = 0; j < radial; j++) idx.push(base + j, base + j + 1, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Lathe from [[r,y],...] profile. Cached by key. */
export function latheGeo(key, profile, segs = 10) {
  return cachedGeo('lathe' + key, () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs));
}

/** Flat shape (heart, star) in XY, facing +Z, optional extrusion depth. */
export function shapeGeo(key, makeShape, depth = 0, curveSegs = 4) {
  return cachedGeo('shape' + key + depth, () => {
    const s = makeShape();
    const g = depth > 0
      ? new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: curveSegs }).translate(0, 0, -depth / 2)
      : new THREE.ShapeGeometry(s, curveSegs);
    g.computeVertexNormals();
    return g;
  });
}
export function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-0.15, 0.25, -0.62, 0.45, -0.52, 0.8);
  s.bezierCurveTo(-0.44, 1.05, -0.1, 1.05, 0, 0.84);
  s.bezierCurveTo(0.1, 1.05, 0.44, 1.05, 0.52, 0.8);
  s.bezierCurveTo(0.62, 0.45, 0.15, 0.25, 0, 0);
  return s;
}
export function starShape(points = 5, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * TAU + Math.PI / 2;
    const r = i % 2 ? inner : 1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

// Face decal: a small grid bent onto a sphere of radius `bend` (0 = flat), facing +Z, centred on origin.
function faceGeo(bend) {
  return cachedGeo(`face${bend}`, () => {
    const g = new THREE.PlaneGeometry(1, 1, 3, 3);
    if (bend > 0) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const d2 = x * x + y * y;
        p.setZ(i, Math.sqrt(Math.max(0, bend * bend - d2)) - bend);
      }
      g.computeVertexNormals();
    }
    return g;
  });
}

// ------------------------------------------------------------------ builder

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _up = new THREE.Vector3(0, 1, 0);

/** Quaternion that turns +Y toward direction d ([x,y,z]) then spins `roll` around it. */
export function aim(d, roll = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(_up, _v.set(d[0], d[1], d[2]).normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, roll));
  return q;
}

function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export class Builder {
  /** opts: {mutation, secret} */
  constructor({ mutation = 'normal', secret = false } = {}) {
    this.mutation = mutation;
    this.secret = secret;
    this.groups = [];
    this.byName = {};
    this.use('body');
  }

  /** Switch to (or create) an animation group with its pivot in plant space. */
  use(name, pivot = [0, 0, 0], opts = {}) {
    let g = this.byName[name];
    if (!g) {
      g = { name, pivot: new THREE.Vector3(pivot[0], pivot[1], pivot[2]), parts: {}, look: false, shadow: true };
      this.groups.push(g);
      this.byName[name] = g;
    }
    if (opts.look != null) g.look = !!opts.look;
    if (opts.yaw != null) g.yaw = opts.yaw;
    if (opts.shadow != null) g.shadow = !!opts.shadow;
    this.cur = g;
    return this;
  }

  /** Parent transform for subsequent parts (Matrix4 in plant space), or null. */
  frame(m) {
    this.F = m || null;
    return this;
  }

  _matrix(o) {
    this._local(o);
    if (this.F) _m.premultiply(this.F);
    return _m;
  }

  _local(o) {
    if (o.m) return _m.copy(o.m);
    const p = o.p || [0, 0, 0];
    _p.set(p[0], p[1], p[2]);
    if (o.q) _q.copy(o.q);
    else if (o.r) _q.setFromEuler(_e.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0, o.order || 'YXZ'));
    else _q.identity();
    const s = o.s ?? 1;
    if (typeof s === 'number') _s.set(s, s, s);
    else _s.set(s[0], s[1], s[2]);
    return _m.compose(_p, _q, _s);
  }

  /**
   * Add a part. o: {p:[x,y,z], r:[rx,ry,rz] (YXZ order) | q: Quaternion | m: Matrix4, s: number|[sx,sy,sz],
   *   c: colour, c2: tip colour (gradient along local y from gy[0] to gy[1]), cf(x,y,z)->colour per triangle (local),
   *   glow: 0..1 emissive, glow2: tip glow, ch: 'base'|'trans'|'galaxy', keep: skip mutation recolour, group: name}
   */
  add(geo, o = {}) {
    const g = prep(geo);
    const n = g.attributes.position.count;
    const pos = g.attributes.position;
    const colors = new Float32Array(n * 3);
    const glows = new Float32Array(n);
    let ch = o.ch || 'base';
    if (ch === 'galaxy' && this.mutation !== 'normal') ch = 'base';
    const keep = o.keep || ch === 'face';
    const mut = keep ? 'normal' : this.mutation;
    const c1 = recolor(vivid(col(o.c ?? '#ffffff')), mut);
    const c2 = o.c2 != null ? recolor(vivid(col(o.c2)), mut) : null;
    const gy = o.gy || [0, 1];
    const glow = o.glow || 0;
    const glow2 = o.glow2 ?? glow;
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (pos.getY(i) - gy[0]) / (gy[1] - gy[0] || 1)));
      if (c2) tmp.lerpColors(c1, c2, t);
      else tmp.copy(c1);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
      glows[i] = glow + (glow2 - glow) * t;
    }
    if (o.cf) {
      // per-triangle override: cf(x, y, z, triIndex) -> colour | [colour, glow] | null (keep gradient)
      for (let i = 0; i < n; i += 3) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        let r = o.cf(cx, cy, cz, i / 3);
        if (r == null) continue;
        let gl = -1;
        if (Array.isArray(r)) {
          gl = r[1];
          r = r[0];
        }
        const cc = r == null ? null : recolor(vivid(col(r)), mut);
        for (let k = 0; k < 3; k++) {
          if (cc) {
            colors[(i + k) * 3] = cc.r;
            colors[(i + k) * 3 + 1] = cc.g;
            colors[(i + k) * 3 + 2] = cc.b;
          }
          if (gl >= 0) glows[i + k] = gl;
        }
      }
    }
    if (o.keep && this.mutation === 'rainbow') for (let i = 0; i < n; i++) glows[i] += 10;
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glows, 1));
    const m = this._matrix(o);
    g.applyMatrix4(m);
    const grp = o.group ? this.byName[o.group] : this.cur;
    if (grp.pivot.lengthSq()) g.translate(-grp.pivot.x, -grp.pivot.y, -grp.pivot.z);
    (grp.parts[ch] ||= []).push(g);
    return this;
  }

  /** A face decal. expr = FACE key. o: {p, r, s, bend} (s = width in studs). */
  face(expr, o = {}) {
    const scale = o.s ?? 0.8;
    // bend = radius (world units) of the surface the face sits on; the decal is built at unit size
    const g = prep(faceGeo(o.bend ? Math.max(0.72, Math.round((o.bend / scale) * 20) / 20) : 0));
    const cell = FACE[expr] ?? 0;
    const u0 = (cell % 4) / 4, v0 = 1 - (Math.floor(cell / 4) + 1) / 4;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.25, v0 + uv.getY(i) * 0.25);
    return this.add(g, { ...o, s: [scale, scale, scale], ch: 'face', keep: true, c: '#ffffff' });
  }

  /** Transform a local point by the same p/r/s convention (useful to place things on parts). */
  point(local, o) {
    const m = this._matrix(o);
    return _v.set(local[0], local[1], local[2]).applyMatrix4(m).toArray();
  }

  finish(meta = {}) {
    const groups = [];
    const box = new THREE.Box3();
    let empty = true;
    for (const g of this.groups) {
      const meshes = [];
      for (const [ch, list] of Object.entries(g.parts)) {
        if (!list.length) continue;
        const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
        geo.userData.shared = true;
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        const bb = geo.boundingBox.clone().translate(g.pivot);
        box.union(bb);
        empty = false;
        meshes.push({
          geometry: geo,
          material: plantMat(ch, this.mutation, this.secret),
          shadow: g.shadow && ch !== 'face' && ch !== 'trans',
          renderOrder: ch === 'face' ? 3 : ch === 'trans' ? 2 : 0,
        });
      }
      groups.push({ name: g.name, pivot: g.pivot.clone(), look: g.look, yaw: g.yaw || 0, meshes });
    }
    if (empty) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    return new Template(groups, box, meta);
  }
}

const _bind = new THREE.Matrix4();
const IDENTITY = new THREE.Matrix4();

export class Template {
  constructor(groups, box, meta) {
    this.groups = groups;
    this.box = box;
    this.height = box.max.y;
    this.radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
    this.meta = meta;
    this.tris = 0;
    for (const g of groups) for (const m of g.meshes) this.tris += m.geometry.attributes.position.count / 3;
    this.skin = groups.length > 1 ? this._buildSkin() : null;
  }

  /**
   * Multi-part templates are drawn as ONE skinned mesh per material: each animation group becomes a bone
   * (the same part node the animations already move), so a plant with a nodding head, snapping jaws or
   * flapping wings costs 1-2 draw calls (and 1 shadow draw) instead of one per part and material.
   */
  _buildSkin() {
    const channels = new Map(); // material -> {lists, info}
    const boneInverses = [];
    this.groups.forEach((g, gi) => {
      _bind.makeRotationY(g.yaw).setPosition(g.pivot);
      boneInverses.push(_bind.clone().invert());
      for (const m of g.meshes) {
        const geo = m.geometry.clone().applyMatrix4(_bind);
        const n = geo.attributes.position.count;
        const si = new Uint16Array(n * 4);
        const sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          si[i * 4] = gi;
          sw[i * 4] = 1;
        }
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        let c = channels.get(m.material);
        if (!c) channels.set(m.material, (c = { list: [], mesh: m }));
        c.list.push(geo);
      }
    });
    const meshes = [];
    for (const { list, mesh } of channels.values()) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      geo.userData.shared = true;
      meshes.push({ geometry: geo, material: mesh.material, shadow: mesh.shadow, renderOrder: mesh.renderOrder });
    }
    // Culling sphere with room for the animated parts (skinned meshes would otherwise compute it per instance).
    const sphere = this.box.getBoundingSphere(new THREE.Sphere());
    sphere.radius *= 1.25;
    return { meshes, boneInverses, sphere };
  }

  /** Cheap instance: new Object3Ds, shared geometry + materials. Returns {root, parts:{name:Object3D}, dispose()} */
  instantiate() {
    const root = new THREE.Group();
    const parts = {};
    // Only plant bodies cast shadows, and only when the renderer draws shadows at all.
    const shadows = plantQuality() !== 'low';
    const skin = this.skin;
    const bones = [];
    for (const g of this.groups) {
      const node = new THREE.Group();
      node.name = g.name;
      node.position.copy(g.pivot);
      node.rotation.order = 'YXZ';
      node.rotation.y = g.yaw;
      node.userData.base = g.pivot;
      node.userData.yaw = g.yaw;
      if (!skin) {
        for (const m of g.meshes) {
          const mesh = new THREE.Mesh(m.geometry, m.material);
          mesh.castShadow = m.shadow && shadows;
          mesh.receiveShadow = false;
          mesh.renderOrder = m.renderOrder;
          mesh.matrixAutoUpdate = false;
          node.add(mesh);
        }
      }
      root.add(node);
      parts[g.name] = node;
      bones.push(node);
    }
    if (!skin) return { root, parts, dispose() {} };
    const skeleton = new THREE.Skeleton(bones, skin.boneInverses);
    for (const m of skin.meshes) {
      const mesh = new THREE.SkinnedMesh(m.geometry, m.material);
      mesh.bind(skeleton, IDENTITY);
      mesh.boundingSphere = skin.sphere;
      mesh.castShadow = m.shadow && shadows;
      mesh.receiveShadow = false;
      mesh.renderOrder = m.renderOrder;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
    return {
      root,
      parts,
      // Frees the per-instance bone texture (the view calls this when it leaves the scene; it is rebuilt if re-used).
      dispose() {
        skeleton.dispose();
      },
    };
  }
}

export { TAU };
