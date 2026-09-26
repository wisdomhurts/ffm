// Blocky low-poly pet models (Roblox style): rounded blocks, big shiny eyes, rosy cheeks.
// Every pet shares ONE vertex-coloured material; each species' geometry is baked once (4 small parts:
// body, head, tail, wing) and cached, so a pet costs 2-5 draw calls and no per-pet GPU memory.
// Legendary and mythic pets get a soft aura and orbiting sparkles (shared shader materials).
//
// createPetModel(petId) -> {root, lift, model, body, headPivot, tailPivot, wings[], fx, def}
//   root: place at the pet's ground point, rotation.y = facing (built facing +Z)
//   lift: hop/fly offset + squash; headPivot/tailPivot/wings: animate rotations (see view.js)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PET } from './catalog.js';

// ------------------------------------------------------------------ geometry baking

const PRIMS = new Map();
function primGeo(key, make) {
  let g = PRIMS.get(key);
  if (!g) {
    g = make();
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    g.computeBoundingBox();
    PRIMS.set(key, g);
  }
  return g;
}
const q3 = (v) => Math.round(v * 1000);
const rbox = (w, h, d, r) => primGeo(`rb:${q3(w)}:${q3(h)}:${q3(d)}:${q3(r)}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const sphere = (seg) => primGeo('sp:' + seg, () => new THREE.SphereGeometry(0.5, seg, Math.max(5, Math.round(seg * 0.7))));
const cone = (seg) => primGeo('co:' + seg, () => new THREE.ConeGeometry(0.5, 1, seg));
const cylG = (seg) => primGeo('cy:' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg));

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _n3 = new THREE.Matrix3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Collects transformed primitives for one pet part and bakes them into a single geometry. */
class Parts {
  constructor() {
    this.list = [];
  }

  add(geo, x, y, z, sx, sy, sz, color, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'XYZ');
    _q.setFromEuler(_e);
    this.list.push({ geo, matrix: new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)), color, o });
    return this;
  }

  /** Rounded block centred at (x,y,z). o.r corner radius (default: chunky). */
  box(x, y, z, w, h, d, color, o = {}) {
    const r = o.r ?? Math.min(w, h, d) * 0.3;
    return this.add(rbox(w, h, d, r), x, y, z, 1, 1, 1, color, o);
  }

  /** Ellipsoid centred at (x,y,z) with diameters sx, sy, sz. */
  ball(x, y, z, sx, sy, sz, color, o = {}) {
    return this.add(sphere(o.seg || 12), x, y, z, sx, sy, sz, color, o);
  }

  /** Cone centred at (x,y,z), tip along +Y before rotation. */
  cone(x, y, z, r, h, color, o = {}) {
    return this.add(cone(o.seg || 8), x, y, z, r * 2, h, r * 2, color, o);
  }

  /** Cylinder centred at (x,y,z), axis along +Y before rotation; o.r2 for an elliptic section (along z). */
  cyl(x, y, z, r, h, color, o = {}) {
    return this.add(cylG(o.seg || 10), x, y, z, r * 2, h, (o.r2 ?? r) * 2, color, o);
  }

  /** Round stick from a to b. */
  beam(ax, ay, az, bx, by, bz, thick, color, o = {}) {
    _v.set(bx - ax, by - ay, bz - az);
    const len = _v.length();
    _q.setFromUnitVectors(UP, _v.normalize());
    this.list.push({ geo: cylG(o.seg || 6), matrix: new THREE.Matrix4().compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(thick, len, thick)), color, o });
    return this;
  }

  /** Flat slab from a 2D outline [[x, z], ...] in the horizontal plane at height y (for wings, feathers). */
  slab(pts, y, thick, color, o = {}) {
    const key = 'sl:' + pts.flat().map(q3).join(',') + ':' + q3(thick);
    const geo = primGeo(key, () => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -thick / 2, 0);
      return g;
    });
    return this.add(geo, 0, y, 0, 1, 1, 1, color, o);
  }

  get count() {
    return this.list.length;
  }

  bake() {
    let nv = 0;
    let ni = 0;
    for (const p of this.list) {
      nv += p.geo.attributes.position.count;
      ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const glow = new Float32Array(nv);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let k = 0;
    let ii = 0;
    for (const { geo, matrix, color, o } of this.list) {
      const P = geo.attributes.position;
      const N = geo.attributes.normal;
      const bb = geo.boundingBox;
      const y0 = bb.min.y;
      const yh = Math.max(1e-6, bb.max.y - bb.min.y);
      _n3.getNormalMatrix(matrix);
      _c.set(color);
      const top = o.top ? _c2.set(o.top) : null;
      const ao = o.ao ?? 0.1;
      const gl = o.glow || 0;
      const flip = matrix.determinant() < 0;
      const base = k;
      const I = geo.index;
      const ic = I ? I.count : P.count;
      for (let t = 0; t < ic; t += 3) {
        const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
        idx[ii++] = base + a;
        idx[ii++] = base + (flip ? c : b);
        idx[ii++] = base + (flip ? b : c);
      }
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i);
        const ty = (_v.y - y0) / yh;
        _v.applyMatrix4(matrix);
        _n.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
        pos.set([_v.x, _v.y, _v.z], k * 3);
        nor.set([_n.x, _n.y, _n.z], k * 3);
        const f = 1 - ao * (1 - ty);
        if (top) {
          col[k * 3] = (_c.r + (top.r - _c.r) * ty) * f;
          col[k * 3 + 1] = (_c.g + (top.g - _c.g) * ty) * f;
          col[k * 3 + 2] = (_c.b + (top.b - _c.b) * ty) * f;
        } else {
          col[k * 3] = _c.r * f;
          col[k * 3 + 1] = _c.g * f;
          col[k * 3 + 2] = _c.b * f;
        }
        glow[k] = gl;
        k++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.shared = true; // GameView.dispose must not free it (cached for every match)
    return g;
  }
}

// ------------------------------------------------------------------ shared materials

let MAT = null;
/** The one material every pet uses: vertex colours, a gentle self-light so pets pop, and per-part glow. */
export function petMaterial() {
  if (MAT) return MAT;
  MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0 });
  MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * (0.14 + vGlow);');
  };
  MAT.customProgramCacheKey = () => 'sas-pet';
  return MAT;
}

let softTex = null;
function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}

let SHADOW = null;
/** Soft round blob shadow (cheaper than real shadows, and shows a flying pet's height). */
function shadowParts() {
  if (SHADOW) return SHADOW;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  geo.userData.shared = true;
  const mat = new THREE.MeshBasicMaterial({ map: softTexture(), color: 0x0b1030, transparent: true, opacity: 0.3, depthWrite: false, fog: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  SHADOW = { geo, mat };
  return SHADOW;
}

// Aura: a camera-facing soft glow (billboarded in the vertex shader). Sparkles: twinkling points that orbit
// and rise around the pet. Both additive; one material per rarity.
const FX_COLORS = { legendary: ['#ffc23a', '#fff1a8'], mythic: ['#ff4fa0', '#ffe07a'] };
const FX = {};
let fxQuad = null;
let fxPts = null;
const fxTime = { value: 0 };
const fxPx = { value: 900 };
const _buf = new THREE.Vector2();

function fxParts(rarity) {
  if (FX[rarity]) return FX[rarity];
  const [c1, c2] = FX_COLORS[rarity] || FX_COLORS.legendary;
  if (!fxQuad) {
    fxQuad = new THREE.PlaneGeometry(1, 1);
    fxQuad.userData.shared = true;
    const N = 16;
    const seed = new Float32Array(N * 3);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N * 3; i++) seed[i] = rnd();
    fxPts = new THREE.BufferGeometry();
    fxPts.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    fxPts.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    fxPts.userData.shared = true;
  }
  const aura = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: softTexture() }, uColor: { value: new THREE.Color(c1) }, uTime: fxTime },
    vertexShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(modelMatrix[0].xyz) * (1.0 + 0.08 * sin(uTime * 3.0));
        mv.xy += position.xy * s; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){ float a = texture2D(uMap, vUv).a; gl_FragColor = vec4(uColor * a * (0.42 + 0.12 * sin(uTime * 3.0)), 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rainbow = rarity === 'mythic' ? 1 : 0;
  const sparkle = new THREE.ShaderMaterial({
    uniforms: { uTime: fxTime, uPx: fxPx, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) } },
    vertexShader: `uniform float uTime; uniform float uPx; varying float vA; varying float vH;
      void main(){
        float a = position.x * 6.2831 + uTime * (0.7 + position.z * 0.8);
        float h = fract(position.y + uTime * (0.22 + position.z * 0.12));
        float r = 0.55 + position.z * 0.55;
        vec3 p = vec3(cos(a) * r, (h - 0.35) * 1.9, sin(a) * r);
        vA = sin(h * 3.14159) * (0.55 + 0.45 * sin(uTime * 9.0 + position.x * 40.0));
        vH = position.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uPx * 0.045 * length(modelMatrix[0].xyz) / -mv.z, 2.0, 28.0);
      }`,
    fragmentShader: `uniform vec3 uC1; uniform vec3 uC2; varying float vA; varying float vH;
      vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){ vec2 d = gl_PointCoord - 0.5; float l = length(d);
        float star = max(0.0, 1.0 - l * 2.2) + max(0.0, 0.07 - abs(d.x * d.y) * 3.0) * 6.0 * max(0.0, 1.0 - l * 2.0);
        vec3 c = ${rainbow ? 'mix(hue(vH), uC2, 0.35)' : 'mix(uC1, uC2, vH)'};
        gl_FragColor = vec4(c * star * vA * 1.4, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  FX[rarity] = { aura, sparkle };
  return FX[rarity];
}

// keep the sparkle clock and point scale right for whichever renderer draws it (game or pet studio)
function fxBeforeRender(renderer) {
  fxTime.value = performance.now() / 1000;
  fxPx.value = renderer.getDrawingBufferSize(_buf).y;
}

function addFx(parent, rarity, size, cy) {
  const f = fxParts(rarity);
  const group = new THREE.Group();
  group.name = 'pet-fx';
  group.position.y = cy;
  const aura = new THREE.Mesh(fxQuad, f.aura);
  aura.scale.setScalar(size * (rarity === 'mythic' ? 3.1 : 2.6));
  aura.renderOrder = -1;
  aura.frustumCulled = false;
  const pts = new THREE.Points(fxPts, f.sparkle);
  pts.scale.setScalar(size * 1.05);
  pts.frustumCulled = false;
  pts.onBeforeRender = aura.onBeforeRender = fxBeforeRender;
  group.add(aura, pts);
  parent.add(group);
  return { group, aura, pts };
}

// ------------------------------------------------------------------ species

const EYE = '#1d1a2f';
const WHITE = '#ffffff';
const BLUSH = '#ff9fbf';
const sym = (fn) => {
  fn(1);
  fn(-1);
};

/** Big glossy Roblox-style eyes (+ optional iris, lashes) and rosy cheeks on a front face at depth z. */
function face(m, { x = 0, y, z, sep, w = 0.16, h = 0.23, blush = true, iris = null, lashes = false, cheekY = null }) {
  sym((s) => {
    const ex = x + s * sep;
    if (iris) {
      m.box(ex, y, z + 0.015, w * 1.1, h, 0.06, iris, { r: w * 0.45, ao: 0, glow: 0.1 });
      m.box(ex, y - h * 0.05, z + 0.04, w * 0.55, h * 0.72, 0.04, EYE, { r: w * 0.25, ao: 0 });
    } else m.box(ex, y, z + 0.015, w, h, 0.06, EYE, { r: w * 0.45, ao: 0 });
    m.box(ex - w * 0.18, y + h * 0.2, z + 0.055, w * 0.4, h * 0.32, 0.03, WHITE, { r: w * 0.15, ao: 0, glow: 0.45 });
    m.box(ex + w * 0.2, y - h * 0.24, z + 0.052, w * 0.2, h * 0.14, 0.02, WHITE, { r: w * 0.08, ao: 0, glow: 0.45 });
    if (lashes) m.box(ex + s * w * 0.55, y + h * 0.45, z + 0.02, w * 0.5, 0.035, 0.03, EYE, { rz: s * 0.5, r: 0.012, ao: 0 });
    if (blush) m.box(ex + s * w * 1.05, cheekY ?? y - h * 0.62, z - 0.005, w * 0.95, h * 0.34, 0.03, BLUSH, { r: h * 0.15, ao: 0 });
  });
}

/** Little smile made of two tilted strokes. */
function smile(m, x, y, z, w = 0.14, color = '#6b2a3c') {
  sym((s) => m.box(x + s * w * 0.42, y, z, w * 0.62, 0.035, 0.03, color, { rz: s * 0.45, r: 0.015, ao: 0 }));
}

// Each species: scale (studs per unit), fly (hover height in studs, or 0), pivots of the animated parts, and a
// build({body, head, tail, wing}) that draws each part relative to its own pivot. The model faces +Z.
const SPECIES = {
  bunny: {
    scale: 1.0,
    head: [0, 0.9, 0.18],
    build({ body: b, head: h }) {
      const W = '#f6f2ec';
      b.box(0, 0.55, -0.08, 0.92, 0.78, 0.98, W);
      b.ball(0, 0.5, 0.4, 0.56, 0.52, 0.1, WHITE, { ao: 0 });
      sym((s) => {
        b.box(s * 0.3, 0.13, -0.16, 0.3, 0.26, 0.64, W, { r: 0.12 });
        b.box(s * 0.19, 0.12, 0.34, 0.22, 0.24, 0.24, W, { r: 0.1 });
      });
      b.ball(0, 0.62, -0.62, 0.42, 0.42, 0.42, WHITE, { ao: 0 });
      h.box(0, 0.45, 0.08, 1.12, 0.92, 0.9, W, { r: 0.34 });
      sym((s) => {
        h.box(s * 0.25, 1.2, -0.08, 0.27, 0.84, 0.16, W, { rz: -s * 0.14, r: 0.08 });
        h.box(s * 0.255, 1.19, 0.005, 0.14, 0.6, 0.04, '#ffb3c7', { rz: -s * 0.14, r: 0.02, ao: 0 });
      });
      face(h, { y: 0.52, z: 0.53, sep: 0.26 });
      h.box(0, 0.35, 0.55, 0.15, 0.1, 0.06, '#ff7aa2', { r: 0.04, ao: 0 });
      h.box(0, 0.25, 0.525, 0.13, 0.1, 0.04, WHITE, { r: 0.02, ao: 0, glow: 0.1 });
    },
  },

  chick: {
    scale: 0.95,
    head: [0, 0.84, 0.04],
    build({ body: b, head: h }) {
      const Y = '#ffd93d', Y2 = '#ffc21f', O = '#ff9f1c';
      b.box(0, 0.5, -0.05, 1.08, 0.86, 1.06, Y, { r: 0.36 });
      sym((s) => {
        b.box(s * 0.55, 0.52, -0.08, 0.14, 0.46, 0.58, Y2, { rz: s * 0.3, r: 0.06 });
        b.box(s * 0.22, 0.05, 0.14, 0.26, 0.1, 0.38, O, { r: 0.04 });
      });
      b.box(0, 0.74, -0.58, 0.38, 0.22, 0.22, Y2, { rx: -0.6, r: 0.08 });
      h.box(0, 0.4, 0.02, 1.0, 0.82, 0.92, Y, { r: 0.34 });
      h.box(0, 0.88, 0, 0.08, 0.28, 0.08, Y2, { r: 0.03 });
      sym((s) => h.box(s * 0.08, 0.84, 0, 0.07, 0.22, 0.07, Y2, { rz: -s * 0.55, r: 0.03 }));
      h.cone(0, 0.31, 0.56, 0.13, 0.24, O, { rx: Math.PI / 2, seg: 6, ao: 0 });
      face(h, { y: 0.52, z: 0.48, sep: 0.24, w: 0.14, h: 0.2 });
    },
  },

  hamster: {
    scale: 1.0,
    head: [0, 0.88, 0.18],
    build({ body: b, head: h }) {
      const C = '#f0a868', CR = '#fff3e0', PK = '#ffb3b3';
      b.box(0, 0.5, -0.05, 1.14, 0.9, 1.16, C, { r: 0.4 });
      b.ball(0, 0.45, 0.52, 0.76, 0.64, 0.1, CR, { ao: 0 });
      sym((s) => {
        b.box(s * 0.28, 0.07, 0.38, 0.22, 0.14, 0.22, PK, { r: 0.06 });
        b.box(s * 0.17, 0.56, 0.56, 0.16, 0.14, 0.1, PK, { r: 0.05, ao: 0 });
      });
      b.ball(0, 0.35, -0.64, 0.16, 0.16, 0.16, PK);
      h.box(0, 0.36, 0.06, 1.06, 0.8, 0.86, C, { r: 0.35 });
      h.ball(0, 0.25, 0.47, 0.8, 0.48, 0.08, CR, { ao: 0 });
      sym((s) => {
        h.ball(s * 0.4, 0.19, 0.36, 0.34, 0.3, 0.3, '#ffe1c4');
        h.ball(s * 0.34, 0.78, 0.0, 0.32, 0.32, 0.14, C);
        h.ball(s * 0.34, 0.78, 0.05, 0.18, 0.18, 0.06, PK, { ao: 0 });
      });
      face(h, { y: 0.46, z: 0.49, sep: 0.24, w: 0.15, h: 0.2, blush: false });
      h.box(0, 0.33, 0.51, 0.11, 0.07, 0.05, '#ff7aa2', { r: 0.03, ao: 0 });
      smile(h, 0, 0.25, 0.5, 0.12);
    },
  },

  frog: {
    scale: 1.05,
    head: [0, 0.72, 0.18],
    build({ body: b, head: h }) {
      const G = '#5cd65c', GD = '#44b44a', L = '#c8f7a0';
      b.box(0, 0.42, -0.1, 1.16, 0.74, 1.06, G, { r: 0.3 });
      b.ball(0, 0.38, 0.42, 0.86, 0.52, 0.1, L, { ao: 0 });
      sym((s) => {
        b.box(s * 0.56, 0.24, -0.28, 0.36, 0.46, 0.66, G, { r: 0.16 });
        b.box(s * 0.64, 0.05, 0.1, 0.36, 0.1, 0.32, GD, { r: 0.04 });
        b.box(s * 0.34, 0.05, 0.38, 0.28, 0.1, 0.26, GD, { r: 0.04 });
      });
      b.ball(0.22, 0.79, -0.22, 0.24, 0.06, 0.24, GD, { ao: 0 });
      b.ball(-0.26, 0.78, -0.4, 0.18, 0.06, 0.18, GD, { ao: 0 });
      h.box(0, 0.26, 0.06, 1.34, 0.56, 0.96, G, { r: 0.26 });
      sym((s) => {
        h.ball(s * 0.34, 0.6, 0.12, 0.48, 0.46, 0.46, G);
        h.ball(s * 0.34, 0.66, 0.3, 0.36, 0.36, 0.14, WHITE, { ao: 0, glow: 0.05 });
        h.box(s * 0.34, 0.64, 0.37, 0.16, 0.22, 0.05, EYE, { r: 0.07, ao: 0 });
        h.box(s * 0.34 - 0.03, 0.69, 0.4, 0.06, 0.07, 0.02, WHITE, { r: 0.02, ao: 0, glow: 0.45 });
        h.box(s * 0.5, 0.27, 0.51, 0.18, 0.08, 0.03, BLUSH, { r: 0.03, ao: 0 });
        h.box(s * 0.39, 0.185, 0.535, 0.1, 0.045, 0.04, '#2d6b35', { rz: s * 0.6, r: 0.015, ao: 0 });
      });
      h.box(0, 0.16, 0.545, 0.7, 0.045, 0.04, '#2d6b35', { r: 0.02, ao: 0 });
    },
  },

  kitty: {
    scale: 1.0,
    head: [0, 0.92, 0.36],
    tail: [0, 0.82, -0.7],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const K = '#a3acbf', KD = '#6f7890';
      b.box(0, 0.6, -0.12, 0.84, 0.72, 1.18, K, { r: 0.26 });
      b.ball(0, 0.55, 0.46, 0.5, 0.5, 0.1, WHITE, { ao: 0 });
      for (const z of [-0.12, -0.36, -0.6]) b.box(0, 0.955, z, 0.72, 0.04, 0.12, KD, { r: 0.015, ao: 0 });
      sym((s) => {
        for (const zz of [0.28, -0.52]) {
          b.box(s * 0.24, 0.2, zz, 0.22, 0.4, 0.24, K, { r: 0.08 });
          b.box(s * 0.24, 0.05, zz + 0.02, 0.24, 0.1, 0.28, WHITE, { r: 0.04 });
        }
      });
      h.box(0, 0.4, 0.06, 1.04, 0.86, 0.86, K, { r: 0.3 });
      sym((s) => {
        h.cone(s * 0.3, 0.92, 0.0, 0.22, 0.42, K, { seg: 4, ry: Math.PI / 4 });
        h.cone(s * 0.3, 0.9, 0.07, 0.12, 0.26, '#ffb3c7', { seg: 4, ry: Math.PI / 4, ao: 0 });
        h.box(s * 0.12, 0.72, 0.475, 0.05, 0.12, 0.04, KD, { r: 0.015, ao: 0 });
        for (const k of [0, 1]) h.box(s * 0.44, 0.27 - k * 0.07, 0.5, 0.3, 0.022, 0.022, WHITE, { rz: s * (0.14 - k * 0.24), r: 0.01, ao: 0, glow: 0.2 });
      });
      h.box(0, 0.75, 0.48, 0.05, 0.16, 0.04, KD, { r: 0.015, ao: 0 });
      h.box(0, 0.26, 0.49, 0.42, 0.26, 0.08, WHITE, { r: 0.1, ao: 0 });
      h.box(0, 0.34, 0.54, 0.1, 0.07, 0.05, '#ff7aa2', { r: 0.03, ao: 0 });
      face(h, { y: 0.49, z: 0.49, sep: 0.25, w: 0.16, h: 0.24, iris: '#5ad17c' });
      t.box(0, 0.22, -0.1, 0.16, 0.5, 0.16, K, { rx: -0.5, r: 0.07 });
      t.box(0, 0.6, -0.26, 0.17, 0.34, 0.17, KD, { rx: -0.15, r: 0.07 });
    },
  },

  puppy: {
    scale: 1.0,
    head: [0, 0.95, 0.36],
    tail: [0, 0.86, -0.66],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const P = '#d39556', PD = '#8a5530', CR = '#fff4e2';
      b.box(0, 0.6, -0.1, 0.9, 0.74, 1.18, P, { r: 0.26 });
      b.ball(0, 0.54, 0.48, 0.52, 0.5, 0.1, CR, { ao: 0 });
      b.box(0.16, 0.955, -0.3, 0.42, 0.04, 0.42, PD, { r: 0.02, ao: 0 });
      sym((s) => {
        for (const zz of [0.3, -0.52]) {
          b.box(s * 0.26, 0.2, zz, 0.24, 0.4, 0.26, P, { r: 0.08 });
          b.box(s * 0.26, 0.05, zz + 0.02, 0.26, 0.1, 0.3, CR, { r: 0.04 });
        }
      });
      b.box(0, 0.94, 0.3, 0.72, 0.16, 0.46, '#ff3b5c', { r: 0.07 });
      b.ball(0, 0.8, 0.54, 0.17, 0.17, 0.07, '#ffd23f', { glow: 0.3 });
      h.box(0, 0.4, 0.06, 1.06, 0.86, 0.9, P, { r: 0.3 });
      h.box(0.26, 0.52, 0.5, 0.34, 0.36, 0.03, PD, { r: 0.12, ao: 0 });
      h.box(0, 0.22, 0.5, 0.56, 0.36, 0.3, CR, { r: 0.13 });
      h.ball(0, 0.34, 0.66, 0.2, 0.14, 0.12, '#2b2230', { ao: 0 });
      h.box(0, 0.07, 0.6, 0.16, 0.14, 0.06, '#ff7aa2', { r: 0.05, ao: 0 });
      sym((s) => h.box(s * 0.58, 0.42, 0.0, 0.18, 0.62, 0.42, PD, { rz: s * 0.28, r: 0.08 }));
      face(h, { y: 0.53, z: 0.51, sep: 0.26 });
      t.box(0, 0.22, -0.08, 0.16, 0.48, 0.16, P, { rx: -0.4, r: 0.07 });
      t.box(0, 0.46, -0.18, 0.17, 0.14, 0.17, CR, { rx: -0.4, r: 0.07 });
    },
  },

  bee: {
    scale: 1.05,
    fly: 3.2,
    head: [0, 0.08, 0.34],
    wing: [0.2, 0.34, -0.1],
    wingBase: 0.35,
    wingAmp: 0.55,
    wingSpeed: 30,
    build({ body: b, head: h, wing: w }) {
      const Y = '#ffd23f', BK = '#2b2530';
      b.ball(0, 0, -0.12, 1.0, 0.92, 1.16, Y, { seg: 16 });
      // stripes follow the ellipsoid's cross-section
      for (const dz of [-0.1, -0.36]) {
        const k = Math.sqrt(1 - (dz / 0.58) ** 2);
        b.cyl(0, 0, -0.12 + dz, 0.5 * k + 0.018, 0.16, BK, { rx: Math.PI / 2, r2: 0.46 * k + 0.018, seg: 16, ao: 0 });
      }
      b.cone(0, -0.02, -0.78, 0.09, 0.22, BK, { rx: -Math.PI / 2, ao: 0 });
      sym((s) => b.box(s * 0.2, -0.46, 0.12, 0.08, 0.16, 0.08, BK, { r: 0.03 }));
      h.ball(0, 0.02, 0.2, 0.86, 0.8, 0.66, Y, { seg: 14 });
      face(h, { y: 0.08, z: 0.5, sep: 0.2, w: 0.14, h: 0.2 });
      smile(h, 0, -0.1, 0.52, 0.12);
      sym((s) => {
        h.beam(s * 0.13, 0.32, 0.26, s * 0.28, 0.72, 0.38, 0.05, BK);
        h.ball(s * 0.28, 0.74, 0.38, 0.14, 0.14, 0.14, BK);
      });
      const wingC = '#e2f5ff';
      w.slab([[0, 0.08], [0.34, 0.2], [0.66, 0.12], [0.78, -0.06], [0.6, -0.2], [0.24, -0.14], [0, -0.06]], 0, 0.04, wingC, { glow: 0.35, ao: 0 });
      w.slab([[0, -0.08], [0.26, -0.18], [0.5, -0.34], [0.36, -0.46], [0.12, -0.34], [0, -0.2]], -0.03, 0.04, wingC, { glow: 0.35, ao: 0 });
    },
  },

  fox: {
    scale: 1.0,
    head: [0, 0.92, 0.38],
    tail: [0, 0.8, -0.7],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const F = '#ff7a2f', FW = '#fff7ee', FD = '#3a2a2a';
      b.box(0, 0.6, -0.12, 0.84, 0.7, 1.22, F, { r: 0.26 });
      b.ball(0, 0.54, 0.48, 0.48, 0.46, 0.1, FW, { ao: 0 });
      sym((s) => {
        for (const zz of [0.3, -0.54]) {
          b.box(s * 0.24, 0.2, zz, 0.22, 0.4, 0.24, F, { r: 0.08 });
          b.box(s * 0.24, 0.07, zz + 0.01, 0.235, 0.14, 0.26, FD, { r: 0.05 });
        }
      });
      h.box(0, 0.38, 0.04, 1.02, 0.8, 0.84, F, { r: 0.28 });
      sym((s) => {
        h.ball(s * 0.27, 0.2, 0.4, 0.4, 0.3, 0.16, FW, { ao: 0 });
        h.cone(s * 0.3, 0.92, -0.02, 0.24, 0.5, F, { seg: 4, ry: Math.PI / 4 });
        h.cone(s * 0.3, 0.88, 0.05, 0.14, 0.3, FW, { seg: 4, ry: Math.PI / 4, ao: 0 });
        h.cone(s * 0.3, 1.1, -0.02, 0.11, 0.15, FD, { seg: 4, ry: Math.PI / 4, ao: 0 });
      });
      h.box(0, 0.23, 0.56, 0.34, 0.26, 0.3, FW, { r: 0.1 });
      h.ball(0, 0.3, 0.71, 0.15, 0.11, 0.1, FD, { ao: 0 });
      face(h, { y: 0.49, z: 0.46, sep: 0.25, w: 0.15, h: 0.22, cheekY: 0.3 });
      t.box(0, 0.22, -0.36, 0.44, 0.44, 0.86, F, { rx: 0.55, r: 0.2 });
      t.box(0, 0.47, -0.76, 0.42, 0.42, 0.3, FW, { rx: 0.55, r: 0.18 });
    },
  },

  panda: {
    scale: 1.05,
    head: [0, 1.0, 0.12],
    build({ body: b, head: h }) {
      const PW = '#f7f7f2', PK = '#2a2a36';
      b.box(0, 0.58, -0.05, 1.14, 0.92, 1.08, PW, { r: 0.4 });
      sym((s) => {
        b.box(s * 0.5, 0.64, 0.24, 0.3, 0.56, 0.36, PK, { r: 0.14, rx: -0.55 });
        b.box(s * 0.3, 0.15, 0.1, 0.36, 0.3, 0.46, PK, { r: 0.14 });
      });
      b.box(0, 0.93, -0.05, 1.16, 0.2, 0.7, PK, { r: 0.1 });
      b.beam(-0.55, 0.44, 0.58, 0.52, 0.94, 0.58, 0.13, '#7bc043', { seg: 8 });
      for (const f of [0.3, 0.68]) b.beam(-0.55 + 1.07 * f - 0.025, 0.44 + 0.5 * f - 0.012, 0.58, -0.55 + 1.07 * f + 0.025, 0.44 + 0.5 * f + 0.012, 0.58, 0.16, '#5fa032', { seg: 8 });
      b.box(0.6, 1.0, 0.58, 0.32, 0.05, 0.13, '#5aa832', { rz: 0.6, r: 0.02 });
      h.box(0, 0.42, 0.04, 1.2, 0.94, 0.98, PW, { r: 0.42 });
      sym((s) => {
        h.ball(s * 0.42, 0.9, -0.02, 0.36, 0.36, 0.2, PK);
        h.box(s * 0.27, 0.45, 0.515, 0.34, 0.42, 0.04, PK, { rz: -s * 0.4, r: 0.15, ao: 0 });
        h.box(s * 0.26, 0.48, 0.545, 0.14, 0.17, 0.03, WHITE, { r: 0.06, ao: 0, glow: 0.2 });
        h.box(s * 0.26, 0.47, 0.565, 0.08, 0.1, 0.02, PK, { r: 0.035, ao: 0 });
        h.box(s * 0.44, 0.22, 0.5, 0.16, 0.07, 0.03, BLUSH, { r: 0.03, ao: 0 });
      });
      h.box(0, 0.25, 0.53, 0.44, 0.28, 0.12, WHITE, { r: 0.1, ao: 0 });
      h.ball(0, 0.32, 0.6, 0.17, 0.1, 0.08, PK, { ao: 0 });
      smile(h, 0, 0.22, 0.595, 0.11);
    },
  },

  owl: {
    scale: 1.0,
    fly: 3.0,
    head: [0, 0.5, 0],
    wing: [0.5, 0.22, -0.04],
    wingBase: 0.05,
    wingAmp: 0.7,
    wingSpeed: 9,
    build({ body: b, head: h, wing: w }) {
      const O = '#5a67d8', OD = '#4453b8', OB = '#c7d2fe', OF = '#e0e7ff', GOLD = '#ffb000';
      b.box(0, 0, -0.02, 1.02, 1.1, 0.9, O, { r: 0.38 });
      b.ball(0, -0.08, 0.41, 0.72, 0.82, 0.12, OB, { ao: 0 });
      for (let k = 0; k < 3; k++) sym((s) => b.box(s * 0.07, 0.12 - k * 0.22, 0.465, 0.14, 0.04, 0.02, O, { rz: s * 0.5, r: 0.01, ao: 0 }));
      sym((s) => b.box(s * 0.2, -0.58, 0.22, 0.18, 0.1, 0.24, GOLD, { r: 0.04 }));
      b.box(0, -0.44, -0.46, 0.5, 0.12, 0.3, OD, { rx: 0.5, r: 0.05 });
      h.box(0, 0.32, 0, 1.12, 0.74, 0.92, O, { r: 0.34 });
      h.box(0, 0.3, 0.45, 0.96, 0.58, 0.05, OF, { r: 0.2, ao: 0 });
      sym((s) => {
        h.cone(s * 0.38, 0.8, -0.05, 0.14, 0.36, OD, { rz: -s * 0.35, seg: 4 });
        h.ball(s * 0.24, 0.34, 0.48, 0.38, 0.38, 0.08, '#ffd23f', { ao: 0, glow: 0.35 });
        h.ball(s * 0.24, 0.34, 0.52, 0.22, 0.22, 0.05, EYE, { ao: 0 });
        h.ball(s * 0.24 - 0.05, 0.4, 0.545, 0.08, 0.08, 0.02, WHITE, { ao: 0, glow: 0.5 });
      });
      h.cone(0, 0.17, 0.5, 0.09, 0.2, GOLD, { rx: Math.PI, seg: 4, ao: 0 });
      w.box(0.08, -0.3, 0, 0.14, 0.76, 0.66, OD, { r: 0.06, rz: 0.12 });
      w.box(0.12, -0.52, -0.02, 0.12, 0.34, 0.56, O, { r: 0.05, rz: 0.12 });
    },
  },

  unicorn: {
    scale: 1.08,
    head: [0, 1.12, 0.46],
    tail: [0, 1.08, -0.78],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const U = '#fbf7ff', UP = '#ffb3d9', GOLD = '#ffd23f';
      const MANE = ['#ff8fc0', '#ffc36b', '#fff07a', '#8ee88a', '#7cc8ff', '#b98cff'];
      b.box(0, 0.82, -0.12, 0.82, 0.7, 1.32, U, { r: 0.26 });
      sym((s) => {
        for (const zz of [0.34, -0.56]) {
          b.box(s * 0.24, 0.3, zz, 0.22, 0.56, 0.24, U, { r: 0.08 });
          b.box(s * 0.24, 0.06, zz, 0.25, 0.12, 0.27, UP, { r: 0.04 });
        }
        b.ball(s * 0.415, 0.86, -0.44, 0.03, 0.2, 0.2, GOLD, { glow: 0.35, ao: 0 });
      });
      h.box(0, 0.08, -0.1, 0.46, 0.5, 0.44, U, { rx: 0.35, r: 0.14 });
      h.box(0, 0.5, 0.06, 0.86, 0.8, 0.86, U, { r: 0.3 });
      h.box(0, 0.32, 0.52, 0.62, 0.42, 0.34, '#fff0f7', { r: 0.15 });
      sym((s) => {
        h.box(s * 0.12, 0.36, 0.69, 0.06, 0.08, 0.02, '#e89cc0', { r: 0.02, ao: 0 });
        h.cone(s * 0.24, 1.0, -0.12, 0.13, 0.3, U, { seg: 4, ry: Math.PI / 4 });
      });
      h.cone(0, 1.14, 0.18, 0.12, 0.62, GOLD, { rx: 0.25, glow: 0.45, seg: 8 });
      h.cyl(0, 0.985, 0.14, 0.1, 0.045, '#fff3b0', { rx: 0.25, glow: 0.5, seg: 10, ao: 0 });
      h.cyl(0, 1.16, 0.185, 0.065, 0.045, '#fff3b0', { rx: 0.25, glow: 0.5, seg: 10, ao: 0 });
      h.box(0, 0.92, -0.14, 0.24, 0.24, 0.3, MANE[0], { r: 0.1 });
      h.box(0, 0.76, -0.36, 0.24, 0.26, 0.3, MANE[1], { r: 0.1 });
      h.box(0, 0.5, -0.46, 0.24, 0.3, 0.28, MANE[2], { r: 0.1 });
      h.box(0, 0.2, -0.44, 0.24, 0.3, 0.26, MANE[3], { r: 0.1 });
      h.box(0, -0.08, -0.36, 0.22, 0.26, 0.24, MANE[4], { r: 0.1 });
      h.box(0.1, 0.86, 0.32, 0.2, 0.2, 0.2, MANE[5], { rz: -0.4, r: 0.08 });
      face(h, { y: 0.58, z: 0.49, sep: 0.24, w: 0.15, h: 0.22, lashes: true, cheekY: 0.36 });
      t.box(0, -0.02, -0.1, 0.22, 0.24, 0.3, MANE[0], { rx: 0.6, r: 0.1 });
      t.box(0, -0.22, -0.24, 0.24, 0.28, 0.28, MANE[2], { rx: 0.3, r: 0.1 });
      t.box(0, -0.46, -0.3, 0.24, 0.3, 0.26, MANE[4], { rx: 0.1, r: 0.1 });
      t.box(0, -0.7, -0.28, 0.2, 0.26, 0.22, MANE[5], { r: 0.09 });
    },
  },

  dragon: {
    scale: 1.1,
    fly: 3.4,
    head: [0, 0.42, 0.4],
    tail: [0, -0.12, -0.66],
    tailAxis: 'y',
    wing: [0.38, 0.3, -0.12],
    wingBase: 0.3,
    wingAmp: 0.6,
    wingSpeed: 7,
    build({ body: b, head: h, tail: t, wing: w }) {
      const D = '#34c46d', DD = '#1f9e57', DB = '#ffe08a', DS = '#ff8a3d', DH = '#fff4d6', DM = '#8af0ae';
      b.box(0, 0, -0.08, 0.96, 0.92, 1.2, D, { r: 0.36 });
      b.ball(0, -0.08, 0.5, 0.66, 0.72, 0.1, DB, { ao: 0 });
      for (let k = 0; k < 3; k++) b.box(0, 0.12 - k * 0.2, 0.545, 0.5, 0.03, 0.02, '#f0c860', { r: 0.01, ao: 0 });
      for (const [z, y] of [[0.2, 0.46], [-0.15, 0.47], [-0.5, 0.4]]) b.cone(0, y + 0.08, z, 0.1, 0.24, DS, { seg: 4, ao: 0 });
      sym((s) => {
        b.box(s * 0.3, -0.5, 0.18, 0.26, 0.26, 0.3, D, { r: 0.1 });
        b.box(s * 0.3, -0.62, 0.33, 0.24, 0.06, 0.06, DH, { r: 0.02, ao: 0 });
      });
      h.box(0, 0.32, 0.08, 0.96, 0.8, 0.86, D, { r: 0.3 });
      h.box(0, 0.2, 0.58, 0.64, 0.4, 0.4, D, { r: 0.16 });
      sym((s) => {
        h.box(s * 0.13, 0.3, 0.78, 0.06, 0.06, 0.02, DD, { r: 0.02, ao: 0 });
        h.cone(s * 0.15, 0.0, 0.72, 0.04, 0.1, WHITE, { rx: Math.PI, ao: 0 });
        h.cone(s * 0.28, 0.82, -0.14, 0.1, 0.42, DH, { rx: -0.6, seg: 6 });
        h.cone(s * 0.52, 0.5, -0.04, 0.1, 0.3, DS, { rz: -s * 1.2, seg: 4, ao: 0 });
      });
      face(h, { y: 0.46, z: 0.51, sep: 0.24, cheekY: 0.3 });
      t.box(0, 0, -0.26, 0.36, 0.34, 0.56, D, { r: 0.14, rx: -0.2 });
      t.box(0, 0.1, -0.68, 0.24, 0.22, 0.46, D, { r: 0.1, rx: -0.35 });
      t.cone(0, 0.2, -0.98, 0.16, 0.28, DS, { rx: -Math.PI / 2 - 0.35, seg: 4, ao: 0 });
      w.slab([[0, 0.06], [0.7, 0.14], [1.1, -0.28], [0.86, -0.3], [0.74, -0.58], [0.46, -0.4], [0.2, -0.36], [0, -0.26]], 0, 0.05, DM, { glow: 0.12, ao: 0 });
      w.beam(0, 0, 0.02, 0.7, 0.03, 0.14, 0.11, DD);
      w.beam(0.7, 0.03, 0.14, 1.1, 0.02, -0.28, 0.07, DD);
      w.beam(0.7, 0.03, 0.14, 0.74, 0.02, -0.58, 0.07, DD);
    },
  },

  phoenix: {
    scale: 1.05,
    fly: 3.4,
    head: [0, 0.46, 0.3],
    tail: [0, -0.2, -0.48],
    tailAxis: 'y',
    wing: [0.4, 0.18, -0.05],
    wingBase: 0.25,
    wingAmp: 0.65,
    wingSpeed: 7.5,
    build({ body: b, head: h, tail: t, wing: w }) {
      const R = '#ff4a1c', O2 = '#ff9a1c', Yl = '#ffd23f';
      b.box(0, 0, -0.05, 0.86, 0.96, 1.02, R, { r: 0.36, top: O2 });
      b.ball(0, -0.1, 0.45, 0.58, 0.68, 0.1, '#ffc15a', { ao: 0, glow: 0.15 });
      sym((s) => b.box(s * 0.18, -0.54, 0.16, 0.14, 0.1, 0.22, Yl, { r: 0.04 }));
      h.box(0, 0.3, 0.06, 0.82, 0.72, 0.76, R, { r: 0.3, top: O2 });
      h.cone(0, 0.25, 0.53, 0.1, 0.24, Yl, { rx: Math.PI / 2, seg: 4, ao: 0 });
      h.cone(0, 0.88, -0.04, 0.1, 0.46, Yl, { rx: -0.35, glow: 0.6, ao: 0 });
      sym((s) => {
        h.cone(s * 0.13, 0.8, -0.12, 0.08, 0.36, O2, { rx: -0.6, rz: -s * 0.35, glow: 0.5, ao: 0 });
        h.box(s * 0.34, 0.46, 0.4, 0.14, 0.05, 0.04, Yl, { rz: s * 0.4, r: 0.015, glow: 0.4, ao: 0 });
      });
      face(h, { y: 0.38, z: 0.44, sep: 0.22, w: 0.14, h: 0.2 });
      w.slab([[0, 0.12], [0.5, 0.18], [0.98, 0.04], [1.22, -0.2], [0.92, -0.18], [1.02, -0.42], [0.66, -0.34], [0.62, -0.6], [0.3, -0.4], [0, -0.28]], 0, 0.06, O2, { glow: 0.35, ao: 0 });
      w.slab([[0.02, 0.06], [0.46, 0.1], [0.78, -0.02], [0.56, -0.2], [0.28, -0.24], [0.02, -0.2]], 0.045, 0.04, R, { glow: 0.2, ao: 0 });
      t.box(0, -0.22, -0.4, 0.16, 0.05, 0.9, O2, { rx: -0.5, glow: 0.35, r: 0.02 });
      sym((s) => t.box(s * 0.2, -0.16, -0.36, 0.14, 0.05, 0.78, R, { rx: -0.42, ry: s * 0.35, glow: 0.3, r: 0.02 }));
      t.ball(0, -0.45, -0.82, 0.26, 0.08, 0.32, Yl, { glow: 0.7, ao: 0 });
      sym((s) => t.ball(s * 0.33, -0.34, -0.66, 0.2, 0.07, 0.26, Yl, { glow: 0.7, ao: 0 }));
    },
  },

  axolotl: {
    scale: 1.05,
    fly: 2.9,
    head: [0, 0.04, 0.46],
    tail: [0, 0.02, -0.76],
    tailAxis: 'y',
    build({ body: b, head: h, tail: t }) {
      const AG = '#ffb21f', AL = '#ffd65a', AP = '#ff6fa0', APL = '#ffa8c6';
      b.box(0, 0, -0.12, 0.9, 0.62, 1.3, AG, { r: 0.28, top: AL });
      b.box(0, -0.24, 0.0, 0.7, 0.16, 0.9, AL, { r: 0.07, ao: 0 });
      b.box(0, 0.36, -0.32, 0.06, 0.16, 0.72, APL, { r: 0.03, glow: 0.2, ao: 0 });
      sym((s) => {
        for (const zz of [0.28, -0.52]) {
          b.box(s * 0.47, -0.28, zz, 0.18, 0.26, 0.18, AG, { rz: s * 0.5, r: 0.07 });
          b.box(s * 0.55, -0.42, zz + 0.04, 0.14, 0.06, 0.16, AP, { r: 0.03, ao: 0 });
        }
        b.ball(s * 0.28, 0.3, -0.2, 0.1, 0.03, 0.1, '#fff6c8', { glow: 0.7, ao: 0 });
        b.ball(s * 0.18, 0.3, -0.62, 0.08, 0.03, 0.08, '#fff6c8', { glow: 0.7, ao: 0 });
      });
      h.box(0, 0.08, 0.18, 1.24, 0.72, 0.8, AG, { r: 0.3, top: AL });
      sym((s) => {
        [0.9, 0.35, -0.2].forEach((a, k) => {
          const cx = s * 0.72, cy = 0.34 - k * 0.2, cz = -0.04 - k * 0.02;
          h.box(cx, cy, cz, 0.36, 0.09, 0.12, AP, { rz: s * a, r: 0.04, glow: 0.25 });
          h.ball(cx + 0.19 * s * Math.cos(a), cy + 0.19 * Math.sin(a), cz, 0.18, 0.16, 0.16, APL, { glow: 0.3, ao: 0 });
        });
        h.box(s * 0.36, 0.2, 0.585, 0.12, 0.13, 0.04, EYE, { r: 0.05, ao: 0 });
        h.box(s * 0.36 - 0.02, 0.23, 0.61, 0.045, 0.045, 0.02, WHITE, { r: 0.015, ao: 0, glow: 0.5 });
        h.box(s * 0.48, 0.05, 0.56, 0.16, 0.07, 0.03, APL, { r: 0.03, ao: 0 });
        h.box(s * 0.25, 0.03, 0.583, 0.1, 0.04, 0.03, '#b8621a', { rz: s * 0.55, r: 0.015, ao: 0 });
      });
      h.box(0, 0.0, 0.585, 0.36, 0.04, 0.03, '#b8621a', { r: 0.015, ao: 0 });
      t.box(0, 0, -0.32, 0.12, 0.44, 0.72, AG, { r: 0.05, top: AL });
      t.box(0, 0.25, -0.34, 0.06, 0.1, 0.66, APL, { r: 0.03, glow: 0.2, ao: 0 });
      t.box(0, -0.25, -0.34, 0.06, 0.1, 0.66, APL, { r: 0.03, glow: 0.2, ao: 0 });
    },
  },
};

// ------------------------------------------------------------------ assembly

const GEO = new Map();
function species(petId) {
  return SPECIES[petId] || SPECIES.bunny;
}

function geometries(petId) {
  const key = SPECIES[petId] ? petId : 'bunny';
  let g = GEO.get(key);
  if (g) return g;
  const parts = { body: new Parts(), head: new Parts(), tail: new Parts(), wing: new Parts() };
  species(key).build(parts);
  g = {};
  for (const k of Object.keys(parts)) if (parts[k].count) g[k] = parts[k].bake();
  // overall size (all parts at rest) for framing, shadows and effects
  const box = new THREE.Box3();
  for (const k of ['body', 'head', 'tail']) {
    if (!g[k]) continue;
    const bb = g[k].boundingBox.clone();
    const pv = species(key)[k];
    if (pv) bb.translate(new THREE.Vector3(...pv));
    box.union(bb);
  }
  g.box = box;
  GEO.set(key, g);
  return g;
}

/** Height of a pet in studs, from the ground (flying pets: of the body itself). */
export function petSize(petId) {
  const d = species(petId);
  const b = geometries(petId).box;
  return { h: (b.max.y - b.min.y) * d.scale, w: (b.max.x - b.min.x) * d.scale, d: (b.max.z - b.min.z) * d.scale, minY: b.min.y * d.scale };
}

export function createPetModel(petId, { fx = true, shadow = true, scale = 1 } = {}) {
  const def = species(petId);
  const pet = PET[petId];
  const g = geometries(petId);
  const mat = petMaterial();
  const root = new THREE.Group();
  root.name = 'pet:' + petId;
  const lift = new THREE.Group();
  root.add(lift);
  const model = new THREE.Group();
  model.scale.setScalar(def.scale * scale);
  lift.add(model);
  const mesh = (geo) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  };
  const body = mesh(g.body);
  model.add(body);
  let headPivot = null;
  if (g.head) {
    headPivot = new THREE.Group();
    headPivot.position.set(...(def.head || [0, 0, 0]));
    headPivot.add(mesh(g.head));
    model.add(headPivot);
  }
  let tailPivot = null;
  if (g.tail) {
    tailPivot = new THREE.Group();
    tailPivot.position.set(...(def.tail || [0, 0, 0]));
    tailPivot.add(mesh(g.tail));
    model.add(tailPivot);
  }
  const wings = [];
  if (g.wing) {
    const [wx, wy, wz] = def.wing || [0.4, 0.2, 0];
    for (const s of [1, -1]) {
      const p = new THREE.Group();
      p.position.set(wx * s, wy, wz);
      p.scale.x = s;
      p.userData.side = s;
      p.add(mesh(g.wing));
      model.add(p);
      wings.push(p);
    }
  }
  const s0 = petSize(petId);
  const size = { h: s0.h * scale, w: s0.w * scale, d: s0.d * scale, minY: s0.minY * scale };
  let shadowMesh = null;
  if (shadow) {
    const S = shadowParts();
    shadowMesh = new THREE.Mesh(S.geo, S.mat);
    shadowMesh.position.y = 0.04;
    shadowMesh.scale.setScalar(Math.max(size.w, size.d) * 1.05);
    shadowMesh.renderOrder = -2;
    root.add(shadowMesh);
  }
  let fxObj = null;
  if (fx && pet && (pet.rarity === 'legendary' || pet.rarity === 'mythic')) {
    const cy = (size.minY + size.h * 0.5);
    fxObj = addFx(lift, pet.rarity, Math.max(size.h, size.w) * 0.62, cy);
  }
  return {
    root, lift, model, body, headPivot, tailPivot, wings, shadow: shadowMesh, fx: fxObj, def, size,
    shadowSize: Math.max(size.w, size.d) * 1.05,
    fly: def.fly || 0,
    tailAxis: def.tailAxis || 'z',
    wingBase: def.wingBase ?? 0.2,
    wingAmp: def.wingAmp ?? 0.6,
    wingSpeed: def.wingSpeed ?? 8,
    dispose() {
      root.parent?.remove(root);
    },
  };
}

/** Species ids that have a hand-made model (all of PETS). */
export const MODELLED = Object.keys(SPECIES);
