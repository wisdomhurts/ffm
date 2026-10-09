// Base decorations, the Guard Gnome and the golden statue. OWNER: base-decor agent.
// Contract:
//   createDecor(id, {color, quality}) -> THREE.Object3D   one BASE_STYLES.decor item, centred on its 5x5 spot,
//       standing on y = 0, front facing +Z (the caller rotates it to face the garden's gate). Optional
//       object.userData.update(dt, t) for animation (water, flames, windmill blades...).
//       The trampoline also has object.userData.bounce(): one squash-and-stretch (call it when someone bounces).
//       color = the owner's family colour (accents: pet house roof, trampoline pad, rocket fins...).
//       quality = engine.quality ({shadows, decorDensity}); low density halves the particles.
//   createGuardGnome({color}) -> {object3d, swing(), update(dt, t, {alert})}  the Base Lv 5 guard at L.guard:
//       swing() plays one noodle bonk (~0.5 s); alert = a thief is in the garden (it hops and looks around).
// Extras: DECOR_IDS (every id createDecor draws).
//
// Budget: every decoration is 1-3 draw calls (static parts merged per material, animated parts apart).
// Geometries are built once per (id, colour, particle tier) and materials once per page, so any number of
// instances share them (geometries are tagged userData.shared: never dispose them). Particles, flames,
// steam and water droplets animate in the vertex shader (no per-frame CPU work); only the windmill sails,
// the oak's tire swing, the trampoline and the gnome move objects, without allocating. The Guard Gnome is 3 draw
// calls (+1 for its "!" while a thief is in the garden).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Merger, trs, prim, fogShader, drawTexture, makeRand } from './kit.js';
import { studTexture } from './textures.js';
import { liquidMaterial } from './water.js';
import { leaf } from './props.js';

const TAU = Math.PI * 2;
const PI = Math.PI;

export const DECOR_IDS = ['flowerbed', 'oak', 'palm', 'lamp', 'gnome', 'fountain', 'trampoline', 'pethouse', 'hottub', 'windmill', 'campfire', 'snowman', 'candytree', 'rainbowarch', 'rocket', 'statue'];

// Animation clock of every decoration shader (particles, flames, water). Each animated decoration's update(dt, t)
// sets it, so the effects run on the caller's time and need nothing else.
const clock = { value: 0 };
function tick(dt, t) {
  clock.value = t != null ? t : performance.now() / 1000;
}

// ------------------------------------------------------------------ colours

const WHITE_C = new THREE.Color('#ffffff');
const BLACK_C = new THREE.Color('#000000');
/** Colour lightened (k > 0, towards white) or darkened (k < 0, towards black). */
function shade(c, k) {
  const o = new THREE.Color(c);
  return k >= 0 ? o.lerp(WHITE_C, k) : o.lerp(BLACK_C, -k);
}
/** Colour scaled past white (k > 1) so white things (snow, clouds, marble) stay white once lit. */
function bright(c, k) {
  return new THREE.Color(c).multiplyScalar(k);
}
function hex(c) {
  return '#' + new THREE.Color(c ?? '#2f80ed').getHexString();
}
function hueOf(c) {
  const hsl = {};
  new THREE.Color(c).getHSL(hsl);
  return hsl;
}

const WOOD = '#c98a4f', WOOD_D = '#8a5a34', WOOD_L = '#e0aa6a';
const STONE = '#d6d8de', STONE_D = '#a9aeb8';
const GRASS = '#5ec24a';
const SOIL = '#6b4423';
const SKIN = '#ffd2b0';
const COAL = '#2b2f3a';
const GOLD = '#ffc83a';
const KID = ['#ff4a6a', '#ff8a3a', '#ffd23f', '#4cd964', '#3fb6ff', '#9b5cff', '#ff7eb6'];

// ------------------------------------------------------------------ materials (one set per page)

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const map = studTexture();
  // Lambert + a little self-illumination by the vertex colour, so decorations pop like the avatars do
  // (snow: white even in the shade; glowLit: the rainbow)
  const stud = selfLit(map, 0.12, 'decor-stud');
  const snow = selfLit(map, 0.42, 'decor-snow');
  const glowLit = selfLit(map, 0.55, 'decor-glowlit');
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const fx = fxMaterial({});
  const fxSoft = fxMaterial({ soft: true, opacity: 0.72 });
  const fxAdd = fxMaterial({ add: true, opacity: 0.75 });
  const water = liquidMaterial({ c1: '#1aa7d8', c2: '#4fd9e8', c3: '#e8ffff', scale: 0.7, flow: [0.3, 0.2], glow: 1.0, ripple: 1 });
  const tub = liquidMaterial({ c1: '#12b3c8', c2: '#58e6dc', c3: '#ffffff', scale: 0.9, flow: [0.45, 0.35], glow: 1.08, bubbles: 1 });
  water.uniforms.uTime = clock;
  tub.uniforms.uTime = clock;
  MATS = { stud, snow, glowLit, glow, fx, fxSoft, fxAdd, water, tub, gold: goldMaterial() };
  return MATS;
}

function selfLit(map, k, key) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * ${k.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// Shiny gold: metal reflecting a painted warm panorama (bright sky, dark tree line) plus the sun highlight.
function goldMaterial() {
  const env = drawTexture(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fffaf0');
    gr.addColorStop(0.3, '#ffe6b0');
    gr.addColorStop(0.45, '#ffffff');
    gr.addColorStop(0.5, '#ffe7a8');
    gr.addColorStop(0.62, '#d8b060');
    gr.addColorStop(1, '#8a6a2a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // dark tree line and bright windows of sky: crisp streaks in the reflection
    const r = makeRand(3);
    g.fillStyle = 'rgba(40,24,8,0.85)';
    for (let i = 0; i < 14; i++) {
      const x = r() * w, bw = 6 + r() * 16;
      g.fillRect(x, h * (0.3 + r() * 0.1), bw, h * 0.2);
    }
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.ellipse(r() * w, h * (0.08 + r() * 0.2), 10 + r() * 18, 4 + r() * 5, 0, 0, TAU);
      g.fill();
    }
  }, { clamp: false });
  env.mapping = THREE.EquirectangularReflectionMapping;
  return new THREE.MeshStandardMaterial({ color: '#ffcc3a', vertexColors: true, metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.5, emissive: '#7a5200', emissiveIntensity: 0.22 });
}

// ------------------------------------------------------------------ shader particles

// Every fx vertex knows its particle's centre (aCenter), animation (aAnim = mode, phase, speed, amp; mode + 10 =
// shaded instead of glowing) and a velocity (aVel). The whole effect of a decoration is one mesh.
const FX_MODE = { still: 0, flame: 1, puff: 2, drop: 3, twinkle: 4, spark: 5, bob: 6, flutter: 7, pulse: 8 };
const FX_VERT = `
  uniform float uClock;
  attribute vec3 aCenter;
  attribute vec4 aAnim;
  attribute vec3 aVel;
  varying vec3 vCol;
  varying float vA;
  vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x + s * v.y, -s * v.x + c * v.y); }
  void main() {
    float lit = step(9.5, aAnim.x);
    float mode = aAnim.x - lit * 10.0;
    vec3 local = position - aCenter;
    vec3 c = aCenter;
    float s = 1.0;
    float a = 1.0;
    float t = uClock * aAnim.z + aAnim.y;
    if (mode > 0.5 && mode < 1.5) {
      // flame: flicker from the base, licking sideways more towards the tip
      float h = max(local.y, 0.0);
      local.y *= 1.0 + 0.2 * sin(t * 13.0) + 0.12 * sin(t * 21.0 + 1.3);
      local.x += sin(t * 7.0 + h * 2.6) * 0.22 * h * aAnim.w;
      local.z += cos(t * 6.0 + h * 2.2) * 0.22 * h * aAnim.w;
    } else if (mode > 1.5 && mode < 2.5) {
      // puff (steam, smoke): rises along aVel, sways, grows and fades
      float life = fract(t);
      c += aVel * life + vec3(sin(t * 3.1 + aAnim.y * 5.0), 0.0, cos(t * 2.7 + aAnim.y * 3.0)) * aAnim.w * life;
      s = (0.35 + 0.9 * life) * smoothstep(0.0, 0.12, life);
      a = 1.0 - smoothstep(0.3, 1.0, life);
    } else if (mode > 2.5 && mode < 3.5) {
      // water droplet thrown from aCenter at aVel (studs/s); amp = seconds of flight
      float life = fract(t);
      float tt = life * aAnim.w;
      c += aVel * tt;
      c.y -= 8.0 * tt * tt;
      s = smoothstep(0.0, 0.1, life) * (1.0 - 0.35 * life);
      a = 1.0 - smoothstep(0.8, 1.0, life);
    } else if (mode > 3.5 && mode < 4.5) {
      // twinkle: pops in and out, spinning
      float k = max(0.0, sin(t * 6.2831853));
      s = k * k;
      local.xz = rot2(local.xz, t * 2.0);
    } else if (mode > 4.5 && mode < 5.5) {
      // spark / snowflake / bubble: drifts along aVel, wobbles, shrinks away
      float life = fract(t);
      c += aVel * life + vec3(sin(t * 5.0 + aAnim.y * 7.0), 0.0, cos(t * 4.3 + aAnim.y * 5.0)) * aAnim.w;
      s = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.6, 1.0, life));
      local.xz = rot2(local.xz, t * 4.0);
    } else if (mode > 5.5 && mode < 6.5) {
      // bob: floats up and down, turning a little
      c.y += sin(t) * aAnim.w;
      local.xz = rot2(local.xz, sin(t * 0.7) * 0.4);
    } else if (mode > 6.5 && mode < 7.5) {
      // flutter (butterfly): lazy loops around aCenter (radii aVel), wings flapping along local x
      float ang = t;
      c += vec3(cos(ang) * aVel.x, sin(ang * 2.3) * aVel.y, sin(ang) * aVel.z);
      local.x *= 0.2 + 0.8 * abs(sin(uClock * 13.0 + aAnim.y * 9.0));
      local.xz = rot2(local.xz, -atan(-sin(ang) * aVel.x, cos(ang) * aVel.z));
    } else if (mode > 7.5 && mode < 8.5) {
      // pulse (firelight): breathes in size and brightness
      float f = 0.86 + 0.09 * sin(t * 11.0) + 0.05 * sin(t * 23.0 + 0.7);
      s = 0.92 + 0.08 * f;
      a = f;
    }
    vec3 p = c + local * s;
    vec3 n = normalize(normal);
    float light = 0.58 + 0.42 * max(dot(n, vec3(0.37, 0.8, 0.47)), 0.0) + 0.08 * n.y;
    vCol = color * mix(1.0, light, lit);
    vA = a;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FX_FRAG = `
  uniform float uOpacity;
  varying vec3 vCol;
  varying float vA;
  void main() {
    #ifdef FX_ALPHA
      gl_FragColor = vec4(vCol, vA * uOpacity);
    #else
      gl_FragColor = vec4(vCol, 1.0);
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

function fxMaterial({ soft = false, add = false, opacity = 1 }) {
  const alpha = soft || add;
  const mat = fogShader({
    uniforms: { uClock: clock, uOpacity: { value: opacity } },
    vertex: FX_VERT,
    fragment: FX_FRAG,
    transparent: alpha,
    depthWrite: !alpha,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    defines: alpha ? { FX_ALPHA: 1 } : {},
  });
  mat.vertexColors = true;
  if (add) mat.side = THREE.DoubleSide;
  return mat;
}

/** Collects particles (small primitives with an animation each) into one shader-animated geometry. */
class Fx {
  constructor() {
    this.parts = [];
    this.nv = 0;
    this.ni = 0;
  }

  /** anim: {mode, phase, speed (cycles or rad per s), amp, vel:[x,y,z], lit}. o: {rx, ry, rz, top, center}. */
  p(name, x, y, z, sx, sy, sz, color, anim = {}, o = {}) {
    const geo = typeof name === 'string' ? prim(name) : name;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const mode = typeof anim.mode === 'string' ? FX_MODE[anim.mode] : anim.mode || 0;
    this.parts.push({
      geo,
      matrix: trs(x, y, z, sx, sy, sz, o.rx || 0, o.ry || 0, o.rz || 0),
      color: new THREE.Color(color),
      top: o.top != null ? new THREE.Color(o.top) : null,
      c: o.center || [x, y, z],
      a: [mode + (anim.lit ? 10 : 0), anim.phase || 0, anim.speed ?? 1, anim.amp || 0],
      v: anim.vel || [0, 0, 0],
    });
    this.nv += geo.attributes.position.count;
    this.ni += geo.index ? geo.index.count : geo.attributes.position.count;
    return this;
  }

  /** pad: extra bounding radius for particles that travel away from where they were placed. */
  geometry(pad = 0) {
    if (!this.nv) return null;
    const N = this.nv;
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const cen = new Float32Array(N * 3), anim = new Float32Array(N * 4), vel = new Float32Array(N * 3);
    const index = N > 65535 ? new Uint32Array(this.ni) : new Uint16Array(this.ni);
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3(), c = new THREE.Color();
    let k = 0, ii = 0;
    for (const p of this.parts) {
      const P = p.geo.attributes.position, Nn = p.geo.attributes.normal, I = p.geo.index;
      const vc = p.geo.userData.vcol ? p.geo.attributes.color : null;
      const bb = p.geo.boundingBox, y0 = bb.min.y, yh = Math.max(1e-6, bb.max.y - bb.min.y);
      nm.getNormalMatrix(p.matrix);
      const base = k;
      const ic = I ? I.count : P.count;
      for (let t = 0; t < ic; t++) index[ii++] = base + (I ? I.getX(t) : t);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const ty = (v.y - y0) / yh;
        v.applyMatrix4(p.matrix);
        n.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize();
        v.toArray(pos, k * 3);
        n.toArray(nor, k * 3);
        c.copy(p.color);
        if (p.top) c.lerp(p.top, ty);
        if (vc) c.setRGB(c.r * vc.getX(i), c.g * vc.getY(i), c.b * vc.getZ(i));
        c.toArray(col, k * 3);
        cen[k * 3] = p.c[0];
        cen[k * 3 + 1] = p.c[1];
        cen[k * 3 + 2] = p.c[2];
        anim.set(p.a, k * 4);
        vel.set(p.v, k * 3);
        k++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3));
    g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 4));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += pad;
    return shared(g);
  }
}

// ------------------------------------------------------------------ geometry helpers

function shared(g) {
  if (g) g.userData.shared = true;
  return g;
}
function geoOf(m) {
  return m.count ? shared(m.buildGeometry()) : null;
}
const _up = new THREE.Vector3(0, 1, 0);
/** Matrix for a unit primitive (axis +Y) centred at (x,y,z) pointing along dir, scaled (sx, len, sz). */
function along(x, y, z, dir, sx, len, sz) {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, len, sz));
}
/** Cylinder centred on (x,y,z) (Merger.cyl stands on y, which shifts rotated cylinders). */
function rod(m, x, y, z, r, len, color, o = {}) {
  return m.prim('cyl:' + (o.seg || 8), x, y, z, r * 2, len, r * 2, color, o);
}
/** A flat ring (torus lying in XZ): radius R, tube r, squashed vertically by sy. */
function ring(m, x, y, z, R, r, color, { sy = 1, seg = 24, o = {} } = {}) {
  const g = new THREE.TorusGeometry(R, r, 6, seg).rotateX(PI / 2);
  return m.add(g, trs(x, y, z, 1, sy, 1), color, { ao: 0, ...o });
}
/** Solid of revolution from [r, y] profile points (bottom to top). */
function latheGeo(pts, seg = 16) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
/** Five-point star shape (radius R, inner r). */
function starShape(R, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = PI / 2 + (i * PI) / 5;
    const rr = i % 2 ? r : R;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}
function extrude(shape, depth, bevel = 0.04) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A Merger stand-in that adds every part through `pre` (to place a sub-model moved/scaled). */
function placed(m, pre) {
  const w = Object.create(Merger.prototype);
  w.add = (geo, matrix, color, o) => {
    m.add(geo, pre.clone().multiply(matrix), color, o);
    return w;
  };
  return w;
}

// A decoration recipe: the shared pieces every instance is made of (+ how to animate an instance).
function piece(name, geo, mat, o = {}) {
  return geo ? { name, geo, mat, shadow: o.shadow ?? true, receive: o.receive ?? true, pos: o.pos || null, animated: !!o.animated } : null;
}

// ------------------------------------------------------------------ small shared props

function tulip(m, x, y, z, h, color, r) {
  m.block(x, y, z, 0.12, h, 0.12, '#3f9a3c', { ao: 0 });
  leaf(m, x, y + 0.1, z, r() * TAU, -0.9, 0.7, 0.34, '#4cb944', 0.1);
  const hy = y + h + 0.18;
  m.prim('sphere:8', x, hy, z, 0.56, 0.64, 0.56, color, { ao: 0.25 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    m.prim('cone:4', x + Math.sin(a) * 0.14, hy + 0.3, z + Math.cos(a) * 0.14, 0.22, 0.3, 0.22, color, { ao: 0, ry: a });
  }
}
function daisy(m, x, y, z, h, petal, r) {
  m.block(x, y, z, 0.1, h, 0.1, '#3f9a3c', { ao: 0 });
  leaf(m, x, y + 0.05, z, r() * TAU, -0.7, 0.55, 0.3, '#4cb944', 0.1);
  const hy = y + h;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    m.prim('octa', x + Math.sin(a) * 0.22, hy, z + Math.cos(a) * 0.22, 0.26, 0.1, 0.44, petal, { ry: a, rx: -0.15, ao: 0 });
  }
  m.prim('sphere:6', x, hy + 0.05, z, 0.26, 0.18, 0.26, '#ffd23f', { ao: 0 });
}
function mushroom(m, x, z, s, cap = '#ff4a4a') {
  m.cyl(x, 0, z, 0.16 * s, 0.55 * s, '#fff4dc', { seg: 8, ao: 0.1 });
  m.prim('hemi:10', x, 0.5 * s, z, 0.9 * s, 0.7 * s, 0.9 * s, cap, { ao: 0.15 });
  for (const [dx, dz, dy] of [[0.18, 0.2, 0.2], [-0.22, 0.05, 0.18], [0.02, -0.25, 0.2], [0.0, 0.0, 0.33]]) m.prim('sphere:5', x + dx * s, (0.5 + dy) * s, z + dz * s, 0.14 * s, 0.07 * s, 0.14 * s, '#ffffff', { ao: 0 });
}
function tuft(m, x, z, s = 1, color = '#4cb944') {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + x;
    m.prim('cone:4', x + Math.sin(a) * 0.12 * s, 0.25 * s, z + Math.cos(a) * 0.12 * s, 0.16 * s, 0.55 * s, 0.16 * s, color, { rx: Math.cos(a) * 0.35, rz: -Math.sin(a) * 0.35, ao: 0.2 });
  }
}
function coal(m, x, y, z, s = 0.2) {
  m.prim('sphere:6', x, y, z, s, s, s * 0.8, COAL, { ao: 0 });
}

// ------------------------------------------------------------------ the gnome (statue and guard share it)

// Gnome space: feet at y = 0, facing +Z, ~2.95 studs to the hat tip. The head is built around the neck pivot and
// the guard's noodle arm around its right shoulder, so they can turn on their own.
const GNOME = { neck: [0, 1.36, 0.02], shoulder: [-0.47, 1.2, 0.02] };

function gnomeBody(m, { tunic, arms = 'belly' }) {
  const boot = '#6b4226';
  for (const s of [-1, 1]) m.prim('sphere:10', s * 0.26, 0.14, 0.1, 0.46, 0.32, 0.68, boot, { ao: 0.2 });
  m.cyl(0, 0.22, 0, 0.66, 0.12, shade(tunic, -0.35), { seg: 14, ao: 0 });
  m.add('frustum:14', trs(0, 0.82, 0, 1.28, 1.02, 1.18), tunic, { top: shade(tunic, 0.15), ao: 0.15 });
  m.prim('sphere:12', 0, 1.3, 0, 0.94, 0.42, 0.86, tunic, { ao: 0 });
  m.cyl(0, 0.66, 0, 0.575, 0.15, '#4a3222', { seg: 14, ao: 0 });
  m.box(0, 0.735, 0.56, 0.26, 0.2, 0.08, GOLD, { ao: 0 });
  m.box(0, 0.735, 0.6, 0.12, 0.08, 0.04, '#4a3222', { ao: 0 });
  // arms: 'belly' = both hands resting on the tummy (the statue); 'guard' = left hand on the belt only
  const sides = arms === 'belly' ? [-1, 1] : [1];
  for (const s of sides) {
    m.beam(s * 0.47, 1.22, 0.02, s * 0.36, 0.9, 0.44, 0.27, tunic, { prim: 'cyl:8', ao: 0 });
    m.prim('sphere:8', s * 0.3, 0.88, 0.5, 0.28, 0.26, 0.26, SKIN, { ao: 0 });
  }
}
function gnomeHead(m, { hat }, [ox, oy, oz] = [0, 0, 0]) {
  const P = (x, y, z) => [ox + x, oy + y, oz + z];
  m.prim('sphere:12', ...P(0, 0.29, 0.05), 0.76, 0.72, 0.72, SKIN, { ao: 0.1 });
  for (const s of [-1, 1]) {
    m.prim('sphere:6', ...P(s * 0.2, 0.2, 0.33), 0.2, 0.16, 0.12, '#ff9f9f', { ao: 0 });
    m.prim('sphere:6', ...P(s * 0.15, 0.37, 0.37), 0.11, 0.14, 0.06, COAL, { ao: 0 });
    m.box(...P(s * 0.17, 0.5, 0.35), 0.22, 0.07, 0.08, '#ffffff', { rz: s * 0.2, ao: 0 });
  }
  m.prim('sphere:8', ...P(0, 0.25, 0.43), 0.3, 0.26, 0.28, '#ffab94', { ao: 0 });
  // beard + moustache
  m.prim('sphere:10', ...P(0, 0.08, 0.18), 0.8, 0.46, 0.5, '#ffffff', { ao: 0.1 });
  m.prim('cone:10', ...P(0, -0.2, 0.3), 0.86, 0.9, 0.56, '#ffffff', { rx: PI + 0.18, ao: 0.1 });
  for (const s of [-1, 1]) m.prim('sphere:8', ...P(s * 0.14, 0.14, 0.44), 0.28, 0.13, 0.14, '#ffffff', { rz: s * 0.35, ao: 0 });
  // pointy hat with a brim
  m.cyl(...P(0, 0.5, 0.02), 0.46, 0.1, shade(hat, -0.2), { seg: 14, ao: 0 });
  m.prim('cone:14', ...P(0, 1.08, -0.08), 0.9, 1.15, 0.9, hat, { rx: -0.16, ao: 0.15 });
}
// The guard's right arm hanging from the shoulder pivot, holding a pool noodle pointing forward (+Z).
function gnomeArm(m, { tunic, noodle }) {
  m.beam(0, 0, 0, -0.04, -0.42, 0.06, 0.28, tunic, { prim: 'cyl:8', ao: 0 });
  m.prim('sphere:8', -0.04, -0.47, 0.08, 0.3, 0.3, 0.3, SKIN, { ao: 0 });
  // the noodle: grip in the fist, reaching 3 studs forward and a little up
  const d = new THREE.Vector3(0, 0.2, 1).normalize();
  const L = 3.0, gx = -0.04, gy = -0.47 - d.y * 0.3, gz = 0.08 - d.z * 0.3;
  m.add('cyl:10', along(gx + d.x * L / 2, gy + d.y * L / 2, gz + d.z * L / 2, d.toArray(), 0.42, L, 0.42), noodle, { ao: 0 });
  m.add('cyl:10', along(gx + d.x * (L + 0.01), gy + d.y * (L + 0.01), gz + d.z * (L + 0.01), d.toArray(), 0.2, 0.02, 0.2), shade(noodle, -0.55), { ao: 0 });
}
function gnomeTunic(owner) {
  const { h } = hueOf(owner);
  // contrast with the hat: blue tunic for green/teal owners, leafy green otherwise
  return h > 0.22 && h < 0.55 ? '#3a6fd8' : '#3f9e5a';
}

// ------------------------------------------------------------------ decorations

const B = {};

// Flower bed: a wooden planter full of tulips and daisies, a sunflower, a watering can, two butterflies.
B.flowerbed = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const r = makeRand(11);
  const W = 4.5, H = 0.55, T = 0.32;
  m.block(0, 0, 0, W - 0.2, H - 0.08, W - 0.2, SOIL, { topFace: '#7a4f2a', uv: 'studs', ao: 0 });
  for (const s of [-1, 1]) {
    m.block(s * (W / 2 - T / 2), 0, 0, T, H, W, WOOD, { topFace: WOOD_L });
    m.block(0, 0, s * (W / 2 - T / 2), W - 2 * T, H, T, WOOD, { topFace: WOOD_L });
    for (const u of [-1, 1]) m.block(s * (W / 2 - 0.2), 0, u * (W / 2 - 0.2), 0.46, H + 0.2, 0.46, WOOD_D, { topFace: WOOD });
  }
  const pal = ['#ff4a6a', '#ffd23f', '#ff8cc6', '#ff8a3a', '#b47cff', color, color, '#ffffff'];
  const top = H - 0.08;
  for (let ix = 0; ix < 4; ix++) {
    for (let iz = 0; iz < 4; iz++) {
      const x = -1.5 + ix + r.range(-0.18, 0.18), z = -1.5 + iz + r.range(-0.18, 0.18);
      if (ix >= 1 && ix <= 2 && iz === 0) continue; // the sunflower's spot
      if ((ix + iz) % 3 === 1) daisy(m, x, top, z, r.range(0.55, 0.8), r.pick(['#ffffff', '#ffffff', '#ffe0f0']), r);
      else tulip(m, x, top, z, r.range(0.7, 1.15) - iz * 0.05, pal[(ix * 5 + iz * 3) % pal.length], r);
    }
  }
  // a big sunflower at the back, facing the front
  {
    const x = 0, z = -1.3, h = 2.0;
    m.block(x, top, z, 0.16, h, 0.16, '#3f9a3c', { ao: 0 });
    leaf(m, x, top + 0.7, z, PI / 2, -0.3, 0.8, 0.45, '#4cb944', 0.1);
    leaf(m, x, top + 1.1, z, -PI / 2, -0.3, 0.8, 0.45, '#4cb944', 0.1);
    const hy = top + h + 0.2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      m.prim('octa', x + Math.cos(a) * 0.48, hy + Math.sin(a) * 0.48, z + 0.02, 0.42, 0.34, 0.08, '#ffd23f', { rz: a + PI / 2, ao: 0 });
    }
    rod(m, x, hy, z + 0.02, 0.36, 0.16, '#7a4a1f', { rx: PI / 2, seg: 12, ao: 0 });
    rod(m, x, hy, z + 0.1, 0.26, 0.06, '#5a3414', { rx: PI / 2, seg: 12, ao: 0 });
  }
  // watering can in the owner's colour on the front-right corner post
  {
    const x = 1.95, y = H + 0.2, z = 1.95;
    m.cyl(x, y, z, 0.3, 0.46, color, { seg: 10, ao: 0.15 });
    m.cyl(x, y + 0.46, z, 0.18, 0.08, shade(color, -0.2), { seg: 10, ao: 0 });
    m.beam(x - 0.2, y + 0.12, z + 0.1, x - 0.62, y + 0.62, z + 0.32, 0.1, color, { prim: 'cyl:6', ao: 0 });
    m.prim('frustum:8', x - 0.66, y + 0.68, z + 0.34, 0.2, 0.12, 0.2, shade(color, -0.2), { ao: 0 });
    m.add(new THREE.TorusGeometry(0.2, 0.05, 5, 10, PI), trs(x + 0.12, y + 0.46, z - 0.06, 1, 1, 1, 0, PI / 2 + 0.6, 0), shade(color, -0.2), { ao: 0 });
  }
  // butterflies: wings along local x flap, bodies along z
  const fx = new Fx();
  const flies = lo ? 1 : 2;
  for (let i = 0; i < flies; i++) {
    const c = i ? '#ffd23f' : color;
    const cy = 1.9 + i * 0.4;
    const anim = { mode: 'flutter', phase: i * 3.1, speed: 0.55 + i * 0.12, vel: [1.5 - i * 0.3, 0.35, 1.3], lit: true };
    for (const s of [-1, 1]) {
      fx.p('octa', s * 0.22, cy + 0.03, 0.05, 0.42, 0.05, 0.36, c, anim, { center: [0, cy, 0], ry: s * 0.25 });
      fx.p('octa', s * 0.16, cy, -0.14, 0.26, 0.05, 0.24, shade(c, -0.25), anim, { center: [0, cy, 0], ry: -s * 0.4 });
    }
    fx.p('box', 0, cy + 0.02, 0, 0.07, 0.07, 0.38, COAL, anim, { center: [0, cy, 0] });
  }
  return { parts: [piece('bed', geoOf(m), M.stud), piece('butterflies', fx.geometry(2.4), M.fx, { shadow: false })], rig: fxRig };
};

// Big round oak with an owner-coloured tire swing, a birdhouse and apples.
B.oak = (color) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const r = makeRand(21);
  const BARK = '#8a5a34', BARK_D = '#6e4526';
  m.prim('hemi:16', 0, 0, 0, 4.4, 1.0, 4.4, GRASS, { ao: 0.25, top: '#72d35a' });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    m.beam(Math.sin(a) * 0.4, 0.55, Math.cos(a) * 0.4, Math.sin(a) * 1.55, 0.18, Math.cos(a) * 1.55, 0.42, BARK_D, { prim: 'cyl:6', ao: 0.1 });
  }
  m.add('frustum:10', trs(0, 3.0, 0, 1.6, 6.0, 1.6), BARK, { ao: 0.3, top: '#9a6a40' });
  m.beam(0, 4.4, 0, 1.3, 6.2, 0.5, 0.52, BARK, { prim: 'cyl:7', ao: 0 });
  m.beam(0, 4.8, 0, -1.2, 6.5, -0.6, 0.5, BARK, { prim: 'cyl:7', ao: 0 });
  m.beam(0, 4.5, 0, 0.95, 5.3, 1.35, 0.36, BARK, { prim: 'cyl:7', ao: 0 }); // the swing's branch
  const greens = ['#3fae3f', '#4cc24a', '#5fcf55', '#43b646'];
  const lobes = [
    [0, 8.2, 0, 5.0, 4.2, 4.8],
    [-1.35, 7.3, 0.7, 2.9, 2.6, 2.9],
    [1.45, 7.5, -0.4, 3.0, 2.7, 3.0],
    [0.3, 7.1, 1.45, 2.7, 2.4, 2.6],
    [-0.4, 7.4, -1.5, 2.7, 2.5, 2.6],
    [0.25, 10.0, 0.1, 2.9, 2.4, 2.8],
    [-1.0, 9.4, -0.3, 2.2, 2.0, 2.2],
    [1.1, 9.3, 0.6, 2.2, 2.0, 2.2],
  ];
  lobes.forEach(([x, y, z, sx, sy, sz], i) => m.prim('ico:1', x, y, z, sx, sy, sz, greens[i % greens.length], { ao: 0.35, ry: i }));
  // apples on the canopy
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, e = r.range(-0.3, 0.7);
    const x = Math.cos(a) * Math.cos(e) * 2.45, y = 8.2 + Math.sin(e) * 2.0, z = Math.sin(a) * Math.cos(e) * 2.35;
    m.prim('sphere:7', x, y, z, 0.42, 0.4, 0.42, '#ff3b3b', { ao: 0.1 });
    m.block(x, y + 0.18, z, 0.05, 0.14, 0.05, '#6b4226', { ao: 0 });
  }
  // birdhouse on the trunk, roof in the owner's colour
  {
    const y = 3.3, z = 0.72;
    m.block(0, y, z + 0.28, 0.72, 0.8, 0.6, WOOD_L, { ao: 0.1 });
    for (const s of [-1, 1]) m.box(s * 0.25, y + 0.95, z + 0.28, 0.6, 0.1, 0.78, color, { rz: -s * 0.72, ao: 0 });
    rod(m, 0, y + 0.45, z + 0.59, 0.14, 0.04, COAL, { rx: PI / 2, seg: 10, ao: 0 });
    m.beam(0, y + 0.22, z + 0.58, 0, y + 0.22, z + 0.82, 0.06, WOOD_D, { prim: 'cyl:5', ao: 0 });
  }
  // tire swing (its own mesh): hangs from the branch tip at the pivot, sways
  const sw = new Merger();
  sw.beam(0, 0, 0, 0, -3.35, 0, 0.1, '#e8d6a8', { prim: 'cyl:5', ao: 0 });
  sw.add(new THREE.TorusGeometry(0.5, 0.22, 8, 16), trs(0, -3.78, 0, 1, 1, 1.25), color, { ao: 0.1 });
  return {
    parts: [piece('tree', geoOf(m), M.stud), piece('swing', geoOf(sw), M.stud, { pos: [0.95, 5.3, 1.35], animated: true })],
    rig(root, p) {
      const s = p.swing, ph = Math.random() * TAU;
      root.userData.update = (dt, t) => {
        s.rotation.x = Math.sin(t * 1.3 + ph) * 0.16;
        s.rotation.z = Math.sin(t * 0.9 + ph) * 0.05;
      };
    },
  };
};

// Palm tree on a sandy mound with a starfish, rocks and an owner-coloured bucket and spade.
B.palm = (color) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const r = makeRand(5);
  m.prim('hemi:16', 0, 0, 0, 4.4, 0.9, 4.4, '#f4dea6', { ao: 0.15, top: '#fbe8b8' });
  m.prim('dodeca', -1.35, 0.3, 0.9, 0.9, 0.6, 0.8, '#a39a90', { ry: 0.4, ao: 0.3 });
  m.prim('ico:0', -1.0, 0.25, 1.4, 0.55, 0.4, 0.55, '#8e8a86', { ry: 1.2, ao: 0.3 });
  // starfish
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    m.prim('octa', 0.4 + Math.sin(a) * 0.22, 0.43, 1.55 + Math.cos(a) * 0.22, 0.2, 0.1, 0.55, '#ff7a5a', { ry: a, rx: -0.3, ao: 0 });
  }
  // bucket + spade
  m.add('frustum:10', trs(1.35, 0.55, 1.1, 0.7, 0.62, 0.7, PI), color, { ao: 0.15 });
  m.add(new THREE.TorusGeometry(0.3, 0.03, 4, 12, PI), trs(1.35, 0.86, 1.1), shade(color, -0.3), { ao: 0 });
  m.beam(1.75, 0.3, 0.7, 2.0, 1.4, 0.55, 0.08, '#ffd23f', { prim: 'cyl:5', ao: 0 });
  m.box(1.72, 0.32, 0.72, 0.36, 0.44, 0.06, '#ffd23f', { ry: 0.6, rz: -0.2, ao: 0 });
  // trunk: ringed segments curving gently back-left
  const h = 8.3, lean = 0.13, yaw = -2.4, segs = 7;
  const lx = Math.sin(yaw), lz = Math.cos(yaw);
  let px = 0, py = 0.3, pz = 0;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const o0 = lean * h * t0 * t0, o1 = lean * h * t1 * t1;
    const ax = lx * o0, az = lz * o0, ay = 0.3 + h * t0;
    const bx = lx * o1, bz = lz * o1, by = 0.3 + h * t1;
    const rad = 0.55 - 0.2 * t0;
    m.beam(ax, ay, az, bx, by + 0.06, bz, rad * 2, i % 2 ? '#a8784c' : '#8f643c', { prim: 'cyl:7', ao: 0.1 });
    m.beam(ax, ay - 0.04, az, ax + (bx - ax) * 0.14, ay + (by - ay) * 0.14, az + (bz - az) * 0.14, rad * 2.2, '#7a5230', { prim: 'cyl:7', ao: 0 });
    px = bx; py = by; pz = bz;
  }
  m.prim('sphere:8', px, py + 0.1, pz, 1.2, 0.9, 1.2, '#6f8f2f', { ao: 0.2 });
  const greens = ['#3fae3f', '#52c24a', '#2f9a3c', '#5fcf55'];
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + r.range(-0.15, 0.15);
    const c = greens[i % greens.length];
    const [ex, ey, ez] = leaf(m, px, py + 0.3, pz, a, r.range(-0.45, -0.2), 2.0, 1.9, c, 0.2);
    const [fx, fy, fz] = leaf(m, ex, ey, ez, a, r.range(0.45, 0.65), 1.8, 1.65, c, 0.18);
    leaf(m, fx, fy, fz, a, r.range(1.0, 1.25), 1.1, 1.0, c, 0.16);
  }
  // a short upright tuft in the middle
  for (let i = 0; i < 4; i++) leaf(m, px, py + 0.4, pz, (i / 4) * TAU + 0.4, -1.1, 1.3, 0.9, greens[(i + 1) % 4], 0.16);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    m.prim('sphere:7', px + Math.sin(a) * 0.5, py - 0.35, pz + Math.cos(a) * 0.5, 0.6, 0.65, 0.6, '#6b4423', { ao: 0.1 });
  }
  return { parts: [piece('palm', geoOf(m), M.stud)] };
};

// A pair of park lanterns (owner-coloured roofs) with a string of fairy lights between them.
B.lamp = (color) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const g = new Merger();
  const POLE = '#2d3a4a', POLE_L = '#4a5a70', LIGHT = '#fff2b0';
  const X = 1.65, top = 5.0;
  for (const s of [-1, 1]) {
    const x = s * X;
    m.block(x, 0, 0, 0.95, 0.3, 0.95, POLE, { uv: 'studs' });
    m.add('frustum:8', trs(x, 0.55, 0, 0.8, 0.5, 0.8), POLE_L, { ao: 0.1 });
    m.cyl(x, 0.8, 0, 0.15, top - 0.8, POLE, { seg: 8 });
    for (const y of [1.3, 3.2]) m.cyl(x, y, 0, 0.23, 0.16, POLE_L, { seg: 8, ao: 0 });
    // lantern
    m.block(x, top - 0.05, 0, 0.95, 0.14, 0.95, POLE, { ao: 0 });
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.block(x + u * 0.4, top + 0.09, v * 0.4, 0.1, 1.0, 0.1, POLE, { ao: 0 });
    g.block(x, top + 0.09, 0, 0.7, 1.0, 0.7, LIGHT, { ao: 0 });
    m.block(x, top + 1.09, 0, 1.0, 0.1, 1.0, POLE, { ao: 0 });
    m.prim('cone:4', x, top + 1.47, 0, 1.55, 0.72, 1.55, color, { ry: PI / 4, ao: 0.2 });
    m.prim('sphere:8', x, top + 1.93, 0, 0.26, 0.26, 0.26, GOLD, { ao: 0 });
    // hanging flower basket on a side arm
    m.beam(x, top - 0.9, 0, x + s * 0.62, top - 0.9, 0, 0.09, POLE, { ao: 0 });
    m.beam(x + s * 0.6, top - 0.9, 0, x + s * 0.6, top - 1.35, 0, 0.04, POLE, { ao: 0 });
  }
  // fairy lights: a sagging wire with coloured bulbs
  const N = 9, sag = 0.75, y0 = top - 0.25;
  let pxx = -X, pyy = y0;
  const bulbs = [color, '#ffd23f', '#ff5a8a', '#6fe0c4', '#ffffff'];
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const x = -X + 2 * X * t, y = y0 - sag * 4 * t * (1 - t);
    m.beam(pxx, pyy, 0, x, y, 0, 0.05, COAL, { ao: 0 });
    if (i < N) g.prim('sphere:6', x, y - 0.17, 0, 0.3, 0.38, 0.3, bulbs[i % bulbs.length], { ao: 0 });
    pxx = x;
    pyy = y;
  }
  // flower baskets (on the side arms, facing away from the string)
  for (const s of [-1, 1]) {
    const x = s * X + s * 0.6;
    m.prim('hemi:8', x, top - 1.35, 0, 0.62, -0.5, 0.62, '#8a5a34', { ao: 0 });
    m.prim('sphere:8', x, top - 1.3, 0, 0.66, 0.4, 0.66, '#4cc24a', { ao: 0.2 });
    for (let k = 0; k < 3; k++) m.prim('sphere:5', x + Math.cos(k * 2.1) * 0.22, top - 1.12, Math.sin(k * 2.1) * 0.22, 0.18, 0.14, 0.18, ['#ff5a8a', '#ffd23f', '#ffffff'][k], { ao: 0 });
  }
  return { parts: [piece('posts', geoOf(m), M.stud), piece('lights', geoOf(g), M.glow, { shadow: false, receive: false })] };
};

// A plain garden gnome statue on a stepping stone, with toadstools and grass tufts.
B.gnome = (color) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  m.cyl(0, 0, 0, 1.05, 0.22, STONE_D, { seg: 12, topFace: STONE, uv: 'studs' });
  const s = 1.12;
  const g = placed(m, trs(0, 0.22, 0.05, s, s, s));
  gnomeBody(g, { tunic: color, arms: 'belly' });
  gnomeHead(g, { hat: '#ff3b3b' }, GNOME.neck);
  mushroom(m, 1.45, 0.8, 1.2);
  mushroom(m, 1.05, 1.55, 0.8, '#ff8a3a');
  mushroom(m, -1.5, -0.7, 1.0);
  tuft(m, -1.3, 1.2, 1.1);
  tuft(m, 1.5, -1.2, 1.0, '#5fcf55');
  tuft(m, -0.4, -1.55, 0.9);
  daisy(m, -1.65, 0, 0.3, 0.6, '#ffffff', makeRand(2));
  daisy(m, 0.9, 0, -1.5, 0.5, '#ffe0f0', makeRand(3));
  return { parts: [piece('gnome', geoOf(m), M.stud)] };
};

// Two-tier stone fountain: owner-coloured tiles, animated water, a jet and a dripping curtain.
B.fountain = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const R = 2.2, WY = 0.82;
  m.cyl(0, 0, 0, R + 0.08, 0.16, STONE_D, { seg: 20, ao: 0 });
  m.cyl(0, 0.16, 0, R, WY - 0.16, STONE, { seg: 20, ao: 0.3 });
  m.cyl(0, 0.32, 0, R + 0.03, 0.26, color, { seg: 20, ao: 0 }); // tile band
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    m.box(Math.sin(a) * (R + 0.05), 0.45, Math.cos(a) * (R + 0.05), 0.08, 0.3, 0.1, shade(color, 0.55), { ry: a, ao: 0 });
  }
  ring(m, 0, WY + 0.06, 0, R - 0.08, 0.22, '#eceae4', { sy: 0.8, seg: 28 });
  // column + upper bowl
  m.cyl(0, WY, 0, 0.44, 1.7, STONE, { seg: 12, ao: 0.25 });
  m.prim('sphere:10', 0, WY + 0.9, 0, 1.05, 0.5, 1.05, STONE_D, { ao: 0 });
  const BY = 2.95;
  m.add('frustum:16', trs(0, BY - 0.3, 0, 2.5, 0.6, 2.5, PI), STONE, { ao: 0.25 });
  ring(m, 0, BY, 0, 1.18, 0.12, '#eceae4', { seg: 20 });
  m.cyl(0, BY, 0, 0.2, 0.55, STONE, { seg: 8 });
  m.prim('sphere:10', 0, BY + 0.72, 0, 0.55, 0.55, 0.55, color, { ao: 0.1 });
  m.prim('cone:8', 0, BY + 1.05, 0, 0.26, 0.3, 0.26, shade(color, 0.4), { ao: 0 });
  // water surfaces (one mesh)
  const w = new Merger();
  w.add(new THREE.CircleGeometry(R - 0.12, 28).rotateX(-PI / 2), trs(0, WY + 0.03, 0), '#ffffff', { ao: 0 });
  w.add(new THREE.CircleGeometry(1.14, 20).rotateX(-PI / 2), trs(0, BY + 0.03, 0), '#ffffff', { ao: 0 });
  // droplets: a jet from the top and a curtain over the upper rim
  const fx = new Fx();
  const r = makeRand(9);
  const jets = lo ? 14 : 26;
  for (let i = 0; i < jets; i++) {
    const a = r() * TAU, sp = r.range(0.1, 0.75);
    fx.p('sphere:6', 0, BY + 1.15, 0, 0.26, 0.42, 0.26, i % 3 ? '#cdf6ff' : '#ffffff', { mode: 'drop', phase: i / jets, speed: 1 / 0.8, amp: 0.8, vel: [Math.cos(a) * sp, r.range(7.5, 8.6), Math.sin(a) * sp] });
  }
  const drips = lo ? 14 : 28;
  for (let i = 0; i < drips; i++) {
    const a = (i / drips) * TAU;
    fx.p('sphere:6', Math.cos(a) * 1.22, BY + 0.05, Math.sin(a) * 1.22, 0.22, 0.4, 0.22, i % 2 ? '#cdf6ff' : '#ffffff', { mode: 'drop', phase: r(), speed: 1 / 0.56, amp: 0.56, vel: [Math.cos(a) * 0.85, 0.4, Math.sin(a) * 0.85] });
  }
  return {
    parts: [piece('basin', geoOf(m), M.stud), piece('water', shared(w.buildGeometry()), M.water, { shadow: false }), piece('spray', fx.geometry(2.5), M.fxSoft, { shadow: false, receive: false })],
    rig: fxRig,
  };
};

// Round trampoline: springs, an owner-coloured pad, a little ladder. bounce() = squash and stretch.
B.trampoline = (color) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const Y = 1.05, RM = 1.62, RF = 2.12;
  const STEEL = '#b8c0cc';
  ring(m, 0, Y, 0, RF, 0.08, STEEL, { seg: 32 });
  // padding over the frame in the owner's colour, with white piping
  ring(m, 0, Y + 0.08, 0, RF + 0.02, 0.2, color, { sy: 0.7, seg: 32 });
  ring(m, 0, Y + 0.2, 0, RF + 0.02, 0.05, '#ffffff', { seg: 32 });
  // springs between frame and mat
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    m.beam(c * (RM - 0.05), Y - 0.02, s * (RM - 0.05), c * (RF - 0.12), Y + 0.02, s * (RF - 0.12), 0.08, i % 2 ? '#d8dee8' : '#9aa3b0', { prim: 'cyl:5', ao: 0 });
  }
  // legs: six bent legs with feet
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + PI / 6;
    const c = Math.cos(a), s = Math.sin(a);
    m.beam(c * RF, Y, s * RF, c * (RF + 0.12), 0.45, s * (RF + 0.12), 0.13, STEEL, { prim: 'cyl:6', ao: 0 });
    m.beam(c * (RF + 0.12), 0.45, s * (RF + 0.12), c * (RF - 0.05), 0.05, s * (RF - 0.05), 0.13, STEEL, { prim: 'cyl:6', ao: 0 });
    m.cyl(c * (RF - 0.05), 0, s * (RF - 0.05), 0.16, 0.08, '#5a606c', { seg: 6, ao: 0 });
  }
  // ladder at the front
  for (const s of [-1, 1]) m.beam(s * 0.34, 0, 2.48, s * 0.34, Y + 0.1, 2.0, 0.09, STEEL, { prim: 'cyl:6', ao: 0 });
  for (const [y, z] of [[0.35, 2.33], [0.72, 2.17]]) m.box(0, y, z, 0.72, 0.08, 0.26, '#5a606c', { ao: 0 });
  // the pad: a shallow cone (scaled in y to dip), owner-coloured bullseye on a dark mat
  const pts = [[0, -1], [0.42, -1 + 0.42 / RM], [0.47, -1 + 0.47 / RM], [1.22, -1 + 1.22 / RM], [1.26, -1 + 1.26 / RM], [1.38, -1 + 1.38 / RM], [1.42, -1 + 1.42 / RM], [RM, 0]];
  const cols = [color, color, '#2a3050', '#2a3050', color, color, '#2a3050', '#2a3050'];
  pts.reverse();
  cols.reverse();
  const pad = latheGeo(pts, 28);
  {
    const n = pts.length, P = pad.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      c.set(cols[i % n]);
      c.toArray(col, i * 3);
    }
    pad.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = pad.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.012, 0.012);
    pad.computeVertexNormals();
  }
  return {
    parts: [piece('frame', geoOf(m), M.stud), piece('pad', shared(pad), M.stud, { pos: [0, Y + 0.02, 0], animated: true, shadow: false })],
    rig(root, p) {
      const body = new THREE.Group();
      body.name = 'trampoline-body';
      body.add(p.frame, p.pad);
      root.add(body);
      const REST = 0.07;
      p.pad.scale.set(1, REST, 1);
      let k = 99;
      root.userData.bounce = () => {
        k = 0;
      };
      root.userData.update = (dt) => {
        if (k > 2.5) return;
        k += dt;
        const s = k > 2.5 ? 0 : Math.exp(-4.2 * k) * Math.sin(k * 14);
        body.scale.set(1 + 0.08 * s, 1 - 0.24 * s, 1 + 0.08 * s);
        p.pad.scale.y = REST + 0.9 * s;
      };
    },
  };
};

// Doghouse with a roof in the owner's colour, a bone sign, a paw print, a food bowl and a ball.
B.pethouse = (color) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const PLANK = '#e0a868', PLANK_D = '#c98a4f', TRIM = '#fff4dc';
  m.block(0, 0, 0, 4.1, 0.24, 4.1, STONE_D, { topFace: STONE, uv: 'studs' });
  const y0 = 0.24, Wd = 3.1, Dp = 3.0, Hw = 2.15, zc = -0.35;
  m.block(0, y0, zc, Wd, Hw, Dp, PLANK, { ao: 0.2 });
  // plank grooves on the side walls and the front
  for (let i = 1; i < 5; i++) {
    const y = y0 + (i * Hw) / 5;
    for (const s of [-1, 1]) m.box(s * (Wd / 2 + 0.01), y, zc, 0.04, 0.05, Dp - 0.1, PLANK_D, { ao: 0 });
    for (const s of [-1, 1]) m.box(s * 1.05, y, zc + Dp / 2 + 0.01, 0.9, 0.05, 0.04, PLANK_D, { ao: 0 });
  }
  for (const s of [-1, 1]) for (const u of [-1, 1]) m.block(s * (Wd / 2), y0, zc + u * (Dp / 2), 0.22, Hw, 0.22, TRIM, { ao: 0.1 });
  // gable ends (front and back) + the roof
  const rise = 1.35, half = Wd / 2 + 0.05;
  const tri = new THREE.Shape();
  tri.moveTo(-half, 0);
  tri.lineTo(half, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  const gable = extrude(tri, Dp, 0);
  m.add(gable, trs(0, y0 + Hw, zc), PLANK, { ao: 0 });
  const ov = 0.45, slant = Math.hypot(half + ov, rise + ov * (rise / half)), ang = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    const cx = s * (half + ov) / 2, cy = y0 + Hw + rise - (rise + ov * (rise / half)) / 2 + 0.1;
    m.box(cx, cy, zc, slant, 0.24, Dp + 0.8, color, { rz: -s * ang, ao: 0.1 });
    // shingle rows
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const x = s * (half + ov) * t, y = y0 + Hw + rise + 0.1 - (rise + ov * (rise / half)) * t + 0.13;
      m.box(x, y, zc, 0.1, 0.06, Dp + 0.82, shade(color, -0.25), { rz: -s * ang, ao: 0 });
    }
  }
  m.box(0, y0 + Hw + rise + 0.2, zc, 0.36, 0.3, Dp + 0.9, shade(color, -0.3), { ao: 0 });
  // arched door
  const zf = zc + Dp / 2;
  m.block(0, y0, zf + 0.02, 1.5, 1.2, 0.08, TRIM, { ao: 0 });
  rod(m, 0, y0 + 1.2, zf + 0.02, 0.75, 0.08, TRIM, { rx: PI / 2, seg: 16, ao: 0 });
  m.block(0, y0, zf + 0.07, 1.18, 1.2, 0.06, '#3a2a22', { ao: 0 });
  rod(m, 0, y0 + 1.2, zf + 0.07, 0.59, 0.06, '#3a2a22', { rx: PI / 2, seg: 16, ao: 0 });
  // bone sign on the gable
  {
    const y = y0 + Hw + 0.42, z = zf + 0.08;
    m.box(0, y, z, 0.9, 0.2, 0.1, '#ffffff', { ao: 0 });
    for (const s of [-1, 1]) for (const u of [-1, 1]) m.prim('sphere:8', s * 0.48, y + u * 0.1, z, 0.26, 0.26, 0.14, '#ffffff', { ao: 0 });
  }
  // food bowl with kibble, a ball
  m.add('frustum:12', trs(1.25, y0 + 0.14, 1.6, 0.9, 0.28, 0.9, PI), color, { ao: 0.1 });
  m.prim('hemi:8', 1.25, y0 + 0.2, 1.6, 0.66, 0.26, 0.66, '#9a6a40', { ao: 0 });
  m.prim('sphere:10', -1.35, y0 + 0.3, 1.55, 0.6, 0.6, 0.6, '#ffd23f', { ao: 0.2 });
  m.box(-1.35, y0 + 0.3, 1.55, 0.62, 0.1, 0.62, '#ff4a6a', { ry: 0.5, rz: 0.3, ao: 0 });
  return { parts: [piece('house', geoOf(m), M.stud)] };
};

// Wooden hot tub with bubbling water, rising steam, a rubber duck and an owner-coloured towel.
B.hottub = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  // deck
  for (let i = 0; i < 9; i++) m.block(0, 0, -2.0 + i * 0.5, 4.3, 0.22, 0.46, i % 2 ? '#b87a44' : '#c98a4f', { ao: 0 });
  const R = 2.0, y0 = 0.22, H = 1.25, WY = y0 + H - 0.12;
  m.cyl(0, y0, 0, R, H - 0.18, '#b0703c', { seg: 24, top: '#c98a4f', ao: 0.2 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU + PI / 24;
    m.box(Math.sin(a) * (R + 0.01), y0 + (H - 0.1) / 2, Math.cos(a) * (R + 0.01), 0.05, H - 0.14, 0.05, '#8a5530', { ry: a, ao: 0 });
  }
  for (const y of [y0 + 0.3, y0 + 0.9]) ring(m, 0, y, 0, R + 0.03, 0.06, '#5a5f6a', { seg: 28 });
  ring(m, 0, y0 + H - 0.05, 0, R - 0.1, 0.2, '#d9a066', { sy: 0.7, seg: 28 });
  // steps
  m.block(0, y0, R + 0.1, 1.5, 0.45, 0.55, '#c98a4f', { topFace: '#d9a066' });
  m.block(0, y0, R - 0.1, 1.5, 0.85, 0.4, '#b87a44', { topFace: '#d9a066' });
  // towel roll on the rim + towel stack on the deck
  rod(m, -1.3, y0 + H + 0.22, -1.3, 0.22, 1.0, color, { rx: PI / 2, ry: -PI / 4, seg: 10, ao: 0 });
  rod(m, -1.3, y0 + H + 0.22, -1.3, 0.1, 1.02, shade(color, 0.5), { rx: PI / 2, ry: -PI / 4, seg: 8, ao: 0 });
  m.block(1.7, y0, 1.72, 0.7, 0.18, 0.55, color, { ao: 0 });
  m.block(1.7, y0 + 0.18, 1.72, 0.66, 0.16, 0.52, '#ffffff', { ao: 0 });
  m.block(1.7, y0 + 0.34, 1.72, 0.62, 0.16, 0.5, shade(color, 0.3), { ao: 0 });
  // water
  const w = new Merger();
  w.add(new THREE.CircleGeometry(R - 0.1, 28).rotateX(-PI / 2), trs(0, WY, 0), '#ffffff', { ao: 0 });
  // steam puffs, bubbles and a bobbing rubber duck
  const fx = new Fx();
  const r = makeRand(4);
  const puffs = lo ? 6 : 11;
  for (let i = 0; i < puffs; i++) {
    const a = r() * TAU, d = r.range(0.2, 1.4);
    fx.p('sphere:8', Math.cos(a) * d, WY + 0.25, Math.sin(a) * d, 0.8, 0.7, 0.8, '#ffffff', { mode: 'puff', phase: i / puffs, speed: 0.3, amp: 0.35, vel: [0, 3.4, 0] });
  }
  const bubbles = lo ? 5 : 10;
  for (let i = 0; i < bubbles; i++) {
    const a = r() * TAU, d = r.range(0.2, 1.6);
    fx.p('sphere:6', Math.cos(a) * d, WY + 0.02, Math.sin(a) * d, 0.2, 0.2, 0.2, '#f0ffff', { mode: 'spark', phase: r(), speed: r.range(0.9, 1.4), amp: 0.04, vel: [0, 0.35, 0] });
  }
  const duck = { mode: 'bob', phase: 0, speed: 2.2, amp: 0.05, lit: true };
  const dc = [0.55, WY, 0.35];
  const D = (x, y, z) => [dc[0] + x, dc[1] + y, dc[2] + z];
  fx.p('sphere:10', ...D(0, 0.08, 0), 0.62, 0.42, 0.72, '#ffd23f', duck, { center: dc });
  fx.p('sphere:10', ...D(0, 0.4, 0.2), 0.4, 0.4, 0.4, '#ffd23f', duck, { center: dc });
  fx.p('sphere:6', ...D(0, 0.24, -0.34), 0.2, 0.2, 0.2, '#ffd23f', duck, { center: dc });
  fx.p('box', ...D(0, 0.37, 0.44), 0.2, 0.08, 0.2, '#ff8a2a', duck, { center: dc });
  for (const s of [-1, 1]) fx.p('sphere:5', ...D(s * 0.13, 0.48, 0.36), 0.07, 0.08, 0.05, COAL, duck, { center: dc });
  return {
    parts: [piece('tub', geoOf(m), M.stud), piece('water', shared(w.buildGeometry()), M.tub, { shadow: false }), piece('steam', fx.geometry(3.6), M.fxSoft, { shadow: false, receive: false })],
    rig: fxRig,
  };
};

// Windmill: a white tower with owner-coloured cap and shutters; the sails turn.
B.windmill = (color) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  m.block(0, 0, 0, 4.1, 0.5, 4.1, STONE_D, { topFace: STONE, uv: 'studs' });
  const y0 = 0.5, H = 6.4, RB = 1.85, RT = 1.3;
  const rot = PI / 8; // a flat face towards the front
  m.add(latheGeo([[RB, 0], [RT, H]], 8), trs(0, y0, 0, 1, 1, 1, 0, rot), '#fff4dc', { ao: 0.25, top: '#ffffff' });
  m.add(latheGeo([[RB + 0.06, 0], [RB + 0.01, 0.5]], 8), trs(0, y0, 0, 1, 1, 1, 0, rot), WOOD_D, { ao: 0 });
  const rAt = (y) => (RB + (RT - RB) * ((y - y0) / H)) * Math.cos(PI / 8);
  const tilt = Math.atan2(RB - RT, H);
  // balcony ring halfway up
  m.cyl(0, 4.2, 0, rAt(4.2) / Math.cos(PI / 8) + 0.3, 0.16, WOOD, { seg: 8, ry: rot, ao: 0 });
  // door + windows with shutters on the front and the sides
  {
    const z = rAt(1.3);
    m.block(0, y0, z - 0.02, 1.0, 1.45, 0.14, '#6e4526', { rx: -tilt, ao: 0 });
    rod(m, 0, y0 + 1.45, z - 0.07, 0.5, 0.14, '#6e4526', { rx: PI / 2, seg: 12, ao: 0 });
    m.block(0, y0, z + 0.04, 0.08, 1.5, 0.06, '#5a3820', { rx: -tilt, ao: 0 });
  }
  for (const [a, y] of [[0, 3.1], [PI / 2, 3.6], [-PI / 2, 3.6], [0, 5.4]]) {
    const d = rAt(y) + 0.02;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    const o = { ry: a, rx: -tilt, ao: 0 };
    m.box(x, y, z, 0.8, 0.9, 0.1, '#ffffff', o);
    m.box(x + Math.sin(a) * 0.04, y, z + Math.cos(a) * 0.04, 0.6, 0.7, 0.08, '#6fc8ff', o);
    m.box(x + Math.sin(a) * 0.07, y, z + Math.cos(a) * 0.07, 0.06, 0.7, 0.04, '#ffffff', o);
    m.box(x + Math.sin(a) * 0.07, y, z + Math.cos(a) * 0.07, 0.6, 0.06, 0.04, '#ffffff', o);
    for (const s of [-1, 1]) m.box(x + Math.cos(a) * s * 0.58, y, z - Math.sin(a) * s * 0.58, 0.36, 0.9, 0.08, color, o);
  }
  // cap
  const yc = y0 + H;
  m.cyl(0, yc - 0.05, 0, RT + 0.2, 0.25, WOOD_D, { seg: 12, ao: 0 });
  m.prim('sphere:14', 0, yc + 0.2, 0, 2.9, 2.6, 2.9, color, { ao: 0.25 });
  m.prim('cone:12', 0, yc + 1.55, 0, 1.2, 1.2, 1.2, color, { ao: 0.1 });
  m.prim('sphere:8', 0, yc + 2.25, 0, 0.36, 0.36, 0.36, GOLD, { ao: 0 });
  m.beam(0, yc + 2.3, 0, 0, yc + 3.1, 0, 0.07, COAL, { ao: 0 });
  m.box(0.34, yc + 2.86, 0, 0.6, 0.38, 0.05, shade(color, -0.25), { ao: 0 });
  // axle
  const HY = yc + 0.6, HZ = 1.55;
  m.beam(0, HY, 0.8, 0, HY, HZ + 0.25, 0.42, WOOD_D, { prim: 'cyl:8', ao: 0 });
  // flowers around the foot
  const r = makeRand(8);
  for (const [x, z] of [[-1.7, 1.65], [1.7, 1.65], [-1.75, -1.2], [1.75, -1.3]]) {
    m.prim('sphere:8', x, 0.75, z, 0.8, 0.6, 0.8, '#4cc24a', { ao: 0.2 });
    for (let k = 0; k < 3; k++) m.prim('sphere:5', x + r.range(-0.25, 0.25), 1.02, z + r.range(-0.25, 0.25), 0.2, 0.16, 0.2, r.pick(['#ff5a8a', '#ffd23f', '#ffffff', '#b47cff']), { ao: 0 });
  }
  // sails (their own mesh around the hub): four lattice arms
  const s = new Merger();
  rod(s, 0, 0, -0.1, 0.42, 0.4, WOOD_D, { rx: PI / 2, seg: 10, ao: 0 });
  s.prim('sphere:8', 0, 0, 0.22, 0.4, 0.4, 0.3, GOLD, { ao: 0 });
  const LEN = 3.45;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + PI / 4;
    const dx = Math.sin(a), dy = Math.cos(a);
    const px = -dy, py = dx; // perpendicular (sail side)
    s.beam(dx * 0.2, dy * 0.2, 0.06, dx * LEN, dy * LEN, 0.06, 0.18, WOOD_D, { ao: 0 });
    const r0 = 0.85, r1 = LEN - 0.1, w = 0.95;
    const cx = dx * (r0 + r1) / 2 + px * (w / 2 + 0.05), cy = dy * (r0 + r1) / 2 + py * (w / 2 + 0.05);
    s.box(cx, cy, 0, w, r1 - r0, 0.05, bright('#fffaf0', 1.15), { rz: -a, ao: 0 });
    for (let k = 0; k <= 3; k++) {
      const rr = r0 + ((r1 - r0) * k) / 3;
      s.box(dx * rr + px * (w / 2 + 0.05), dy * rr + py * (w / 2 + 0.05), 0.05, w + 0.1, 0.08, 0.06, WOOD_L, { rz: -a, ao: 0 });
    }
    s.beam(dx * r0 + px * (w + 0.1), dy * r0 + py * (w + 0.1), 0.05, dx * r1 + px * (w + 0.1), dy * r1 + py * (w + 0.1), 0.05, 0.08, WOOD_L, { ao: 0 });
  }
  return {
    parts: [piece('mill', geoOf(m), M.stud), piece('sails', geoOf(s), M.stud, { pos: [0, HY, HZ + 0.3], animated: true })],
    rig(root, p) {
      const ph = Math.random() * TAU;
      root.userData.update = (dt, t) => {
        p.sails.rotation.z = -(t * 0.9 + ph);
      };
    },
  };
};

// Campfire: stone ring, teepee logs, flickering flames with rising embers, a warm glow, log benches.
B.campfire = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const r = makeRand(13);
  m.cyl(0, 0, 0, 1.3, 0.08, '#5a4a40', { seg: 16, ao: 0 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    m.prim(i % 2 ? 'dodeca' : 'ico:0', Math.sin(a) * 1.35, 0.18, Math.cos(a) * 1.35, 0.62, 0.46, 0.52, r.pick(['#9aa0a8', '#8a8f98', '#b0b4bc']), { ry: a, ao: 0.3 });
  }
  const LOG = '#8a5a34', LOG_L = '#a8703e', CUT = '#f0c890';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    m.beam(Math.sin(a) * 0.95, 0.1, Math.cos(a) * 0.95, Math.sin(a) * 0.1, 1.3, Math.cos(a) * 0.1, 0.28, i % 2 ? LOG : LOG_L, { prim: 'cyl:7', ao: 0.1 });
    m.beam(Math.sin(a) * 0.98, 0.07, Math.cos(a) * 0.98, Math.sin(a) * 1.02, 0.02, Math.cos(a) * 1.02, 0.29, CUT, { prim: 'cyl:7', ao: 0 });
  }
  m.prim('sphere:8', 0, 0.2, 0, 1.0, 0.3, 1.0, '#ff7a1a', { ao: 0 }); // hot coals
  // log benches
  for (const s of [-1, 1]) {
    const x = s * 2.05;
    rod(m, x, 0.34, 0, 0.34, 2.4, LOG, { rx: PI / 2, seg: 9, ao: 0.1 });
    for (const u of [-1, 1]) rod(m, x, 0.34, u * 1.21, 0.3, 0.02, CUT, { rx: PI / 2, seg: 9, ao: 0 });
    for (const u of [-0.6, 0.6]) m.block(x, 0, u, 0.2, 0.12, 0.2, WOOD_D, { ao: 0 });
  }
  // blanket on one bench (owner colour, white stripes)
  m.box(2.05, 0.7, -0.3, 0.8, 0.1, 1.2, color, { ao: 0 });
  for (const u of [-0.55, 0.05]) m.box(2.05, 0.71, u, 0.82, 0.1, 0.12, '#ffffff', { ao: 0 });
  m.box(2.47, 0.45, -0.3, 0.08, 0.5, 1.2, color, { ao: 0 });
  // marshmallow stick
  m.beam(-2.05, 0.75, 0.6, -0.75, 1.35, 0.35, 0.06, '#c9a25a', { prim: 'cyl:5', ao: 0 });
  rod(m, -0.72, 1.36, 0.35, 0.13, 0.26, '#fff4e0', { rz: PI / 2 - 0.4, seg: 8, top: '#e8b070', ao: 0 });
  // flames + embers (glowing), firelight (additive)
  const fx = new Fx();
  const F = [
    [0, 0, 0.78, 2.3, '#ff9a1a', '#ff3a10', 0.0, 1.0],
    [0.3, 0.12, 0.45, 1.6, '#ffd23f', '#ff7a1a', 1.3, 1.2],
    [-0.28, -0.05, 0.45, 1.5, '#ffd23f', '#ff7a1a', 2.1, 1.1],
    [0.02, -0.3, 0.42, 1.35, '#ffd23f', '#ff7a1a', 3.4, 1.3],
    [0, 0.05, 0.38, 1.0, '#fff8c8', '#ffd23f', 0.7, 0.9],
  ];
  for (const [x, z, rad, h, c0, c1, ph, sp] of F) fx.p('cone:8', x, 0.3 + h / 2, z, rad * 2, h, rad * 2, c0, { mode: 'flame', phase: ph, speed: sp, amp: 1 }, { top: c1, center: [x, 0.3, z] });
  const embers = lo ? 5 : 10;
  for (let i = 0; i < embers; i++) {
    fx.p('octa', r.range(-0.3, 0.3), 1.0, r.range(-0.3, 0.3), 0.14, 0.14, 0.14, r.pick(['#ffd23f', '#ff9a1a', '#fff2a0']), { mode: 'spark', phase: r(), speed: r.range(0.45, 0.75), amp: 0.25, vel: [r.range(-0.3, 0.3), 3.4, r.range(-0.3, 0.3)] });
  }
  const glow = new Fx();
  glowDisc(glow, new THREE.CircleGeometry(2.5, 24).rotateX(-PI / 2), 0, 0.1, 0, '#ff9a3a');
  return {
    parts: [piece('camp', geoOf(m), M.stud), piece('fire', fx.geometry(3.6), M.fx, { shadow: false, receive: false }), piece('firelight', glow.geometry(0.5), M.fxAdd, { shadow: false, receive: false })],
    rig: fxRig,
  };
};
// Firelight disc: bright in the middle, fading to nothing at the rim (additive), pulsing.
function glowDisc(fx, disc, x, y, z, color) {
  const P = disc.attributes.position;
  const R = Math.sqrt(P.getX(1) ** 2 + P.getZ(1) ** 2);
  // bake the radial fade into a per-vertex copy: centre full colour, rim black
  const g = disc.clone();
  const col = new Float32Array(P.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < P.count; i++) {
    const d = Math.sqrt(P.getX(i) ** 2 + P.getZ(i) ** 2) / R;
    const k = (1 - d) ** 1.15;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.vcol = true;
  fx.p(g, x, y, z, 1, 1, 1, '#ffffff', { mode: 'pulse', speed: 1 });
}

// Snowman with a top hat, carrot nose, owner-coloured scarf and a little snow flurry.
B.snowman = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const SNOW = bright('#f4faff', 1.1), SNOW_B = bright('#dcefff', 1.05);
  m.prim('hemi:16', 0, 0, 0, 4.4, 0.9, 4.4, SNOW_B, { ao: 0, top: SNOW });
  for (const [x, z, s] of [[-1.5, 1.2, 0.7], [1.6, 0.9, 0.55], [1.3, -1.5, 0.6], [-1.4, -1.3, 0.5]]) m.prim('sphere:8', x, 0.25, z, s * 1.2, s * 0.8, s * 1.2, SNOW, { ao: 0.2 });
  const balls = [[1.6, 3.3], [3.8, 2.5], [5.6, 1.9]];
  for (const [y, d] of balls) m.prim('sphere:16', 0, y, 0, d, d * 0.96, d, SNOW, { ao: 0.1 });
  // face
  const hy = 5.6;
  for (const s of [-1, 1]) coal(m, s * 0.3, hy + 0.2, 0.8, 0.2);
  m.prim('cone:8', 0, hy, 1.4, 0.36, 1.2, 0.36, '#ff8a2a', { rx: PI / 2, ao: 0.1 });
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + (i / 4) * 1.2;
    coal(m, Math.sin(a) * 0.45, hy - 0.4 + Math.cos(a * 1.2) * -0.12 + 0.1, 0.78 - Math.abs(a) * 0.1, 0.13);
  }
  for (const y of [3.4, 3.95, 4.5]) coal(m, 0, y, 1.2 - Math.abs(y - 3.9) * 0.25, 0.24);
  for (const y of [1.3, 2.0]) coal(m, 0, y, 1.62 - Math.abs(y - 1.6) * 0.1, 0.26);
  // top hat with an owner-coloured band
  m.cyl(0, 6.35, 0, 0.95, 0.12, COAL, { seg: 16, ao: 0 });
  m.cyl(0, 6.45, 0, 0.62, 1.05, COAL, { seg: 16, ao: 0 });
  m.cyl(0, 6.5, 0, 0.64, 0.24, color, { seg: 16, ao: 0 });
  m.prim('sphere:6', 0.45, 6.62, 0.42, 0.28, 0.28, 0.12, '#ff4a6a', { ry: 0.8, ao: 0 });
  // scarf
  ring(m, 0, 4.92, 0, 0.9, 0.22, color, { sy: 0.9, seg: 20 });
  m.box(0.5, 4.3, 0.92, 0.42, 1.2, 0.14, color, { rz: 0.15, rx: -0.2, ao: 0 });
  for (const y of [4.0, 4.35]) m.box(0.49 + (4.3 - y) * 0.15, y, 0.95 - (4.3 - y) * 0.2, 0.44, 0.1, 0.16, '#ffffff', { rz: 0.15, rx: -0.2, ao: 0 });
  // stick arms: left down-out, right waving
  const STICK = '#6b4226';
  m.beam(-1.0, 3.9, 0, -2.1, 4.5, 0.1, 0.13, STICK, { prim: 'cyl:5', ao: 0 });
  m.beam(-1.75, 4.3, 0.05, -2.0, 4.8, 0.1, 0.08, STICK, { prim: 'cyl:5', ao: 0 });
  m.beam(1.0, 4.0, 0, 1.85, 5.25, 0.25, 0.13, STICK, { prim: 'cyl:5', ao: 0 });
  m.beam(1.6, 4.9, 0.2, 2.1, 5.1, 0.25, 0.08, STICK, { prim: 'cyl:5', ao: 0 });
  // mittens
  m.prim('sphere:8', -2.12, 4.52, 0.1, 0.34, 0.3, 0.3, color, { ao: 0 });
  m.prim('sphere:8', 1.9, 5.32, 0.25, 0.34, 0.3, 0.3, color, { ao: 0 });
  // snow flurry
  const fx = new Fx();
  const r = makeRand(17);
  const flakes = lo ? 8 : 16;
  for (let i = 0; i < flakes; i++) {
    const a = r() * TAU, d = r.range(1.3, 2.5);
    fx.p('octa', Math.cos(a) * d, 8.2, Math.sin(a) * d, 0.3, 0.3, 0.3, '#ffffff', { mode: 'spark', phase: r(), speed: r.range(0.2, 0.3), amp: 0.3, vel: [0, -8.0, 0] });
  }
  return { parts: [piece('snowman', geoOf(m), M.snow), piece('flurry', fx.geometry(4.5), M.fx, { shadow: false, receive: false })], rig: fxRig };
};

// Candy tree: candy-cane trunk, cotton-candy canopy with lollipops and gumballs, gumdrops at its feet.
B.candytree = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const r = makeRand(31);
  m.prim('hemi:16', 0, 0, 0, 4.4, 0.9, 4.4, '#ffc2e0', { ao: 0.1, top: '#ffd9ec' });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.2;
    m.prim('sphere:8', Math.sin(a) * 1.8, 0.2, Math.cos(a) * 1.8, 0.55, 0.62, 0.55, KID[i % KID.length], { ao: 0.1 });
  }
  // twisted candy-cane trunk (stripes as alternating rings)
  const TH = 4.8;
  for (let i = 0; i < 12; i++) {
    const y = 0.35 + (i * TH) / 12;
    const rad = 0.5 - (0.14 * i) / 12;
    m.cyl(Math.sin(i * 0.5) * 0.05, y, 0, rad, TH / 12 + 0.01, i % 2 ? '#ff3b5c' : '#ffffff', { seg: 10, ao: 0 });
  }
  // cotton-candy canopy
  const puffs = [
    [0, 6.4, 0, 4.4, 3.4, 4.2, '#ff7ec8'],
    [-1.45, 5.9, 0.5, 2.6, 2.4, 2.6, '#b98cff'],
    [1.5, 6.0, -0.3, 2.7, 2.4, 2.7, '#6fe8c4'],
    [0.2, 5.8, 1.4, 2.4, 2.2, 2.3, '#ff9ed8'],
    [-0.3, 6.1, -1.45, 2.4, 2.2, 2.3, '#ffc27a'],
    [0.2, 8.0, 0.1, 2.9, 2.3, 2.8, '#ff9ed8'],
  ];
  for (const [x, y, z, sx, sy, sz, c] of puffs) m.prim('ico:2', x, y, z, sx, sy, sz, bright(c, 1.12), { ao: 0.12 });
  // lollipops sticking out of the canopy: concentric rings read as a swirl
  const lolli = [
    [-2.05, 7.0, 0.9, [-1, 0.2, 0.55], ['#ffffff', color]],
    [2.05, 7.1, 0.8, [1, 0.25, 0.5], ['#ffffff', '#ff3b5c']],
    [0.1, 9.3, 0.8, [0, 1, 0.45], ['#ffd23f', '#ff8a3a']],
    [0.9, 5.4, 2.0, [0.3, -0.2, 1], ['#ffffff', '#3fb6ff']],
    [-1.1, 8.5, -0.9, [-0.5, 0.8, -0.4], ['#ffffff', color]],
  ];
  for (const [x, y, z, dir, [c0, c1]] of lolli) {
    const d = new THREE.Vector3(...dir).normalize();
    const bx = x - d.x * 1.0, by = y - d.y * 1.0, bz = z - d.z * 1.0;
    m.beam(bx, by, bz, x, y, z, 0.1, '#ffffff', { prim: 'cyl:5', ao: 0 });
    // disc faces along dir: cylinder axis = dir
    const radii = [0.62, 0.47, 0.32, 0.17];
    radii.forEach((rr, k) => {
      const off = 0.02 * k;
      m.add('cyl:14', along(x + d.x * (0.12 + off), y + d.y * (0.12 + off), z + d.z * (0.12 + off), dir, rr * 2, 0.16, rr * 2), k % 2 ? c1 : c0, { ao: 0 });
    });
  }
  // gumballs + wrapped sweets on the canopy
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU, e = r.range(-0.2, 0.8);
    const x = Math.cos(a) * Math.cos(e) * 2.2, y = 6.5 + Math.sin(e) * 1.9, z = Math.sin(a) * Math.cos(e) * 2.1;
    m.prim('sphere:7', x, y, z, 0.38, 0.38, 0.38, KID[i % KID.length], { ao: 0 });
  }
  for (const [x, y, z, c] of [[-1.3, 5.0, 1.3, '#ffd23f'], [1.6, 5.1, 1.0, color], [0.2, 4.9, -1.7, '#4cd964']]) {
    m.prim('sphere:8', x, y, z, 0.5, 0.38, 0.38, c, { ao: 0 });
    for (const s of [-1, 1]) m.prim('cone:6', x + s * 0.36, y, z, 0.34, 0.3, 0.34, shade(c, 0.3), { rz: -s * PI / 2, ao: 0 });
  }
  // a candy cane stuck in the frosting
  {
    const x = 1.5, z = 1.35;
    for (let i = 0; i < 5; i++) m.cyl(x, 0.3 + i * 0.3, z, 0.13, 0.31, i % 2 ? '#ff3b5c' : '#ffffff', { seg: 8, ao: 0 });
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * PI, a1 = ((i + 1) / 5) * PI;
      m.beam(x + 0.3 - Math.cos(a0) * 0.3, 1.8 + Math.sin(a0) * 0.3, z, x + 0.3 - Math.cos(a1) * 0.3, 1.8 + Math.sin(a1) * 0.3, z, 0.26, i % 2 ? '#ff3b5c' : '#ffffff', { prim: 'cyl:8', ao: 0 });
    }
  }
  const fx = new Fx();
  const n = lo ? 5 : 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, e = r.range(-0.3, 0.9);
    fx.p('octa', Math.cos(a) * 2.5, 6.6 + Math.sin(e) * 2.2, Math.sin(a) * 2.4, 0.34, 0.34, 0.34, i % 2 ? '#ffffff' : '#fff2a0', { mode: 'twinkle', phase: r(), speed: r.range(0.35, 0.6) });
  }
  return { parts: [piece('tree', geoOf(m), M.stud), piece('sparkles', fx.geometry(0.5), M.fx, { shadow: false, receive: false })], rig: fxRig };
};

// Rainbow arch you can walk under, on two clouds, with a pot of gold and sparkles.
B.rainbowarch = (color, lo) => {
  const M = mats();
  const bands = new Merger({ uvScale: 0.25 });
  const m = new Merger({ uvScale: 0.25 });
  const RO = 2.45, W = 0.17, HL = 4.3, DEPTH = 0.9;
  const cols = ['#ff3b3b', '#ff8a1a', '#ffd21a', '#3ed45a', '#2fa8ff', '#5a5cff', '#b45cff'];
  cols.forEach((c, i) => {
    const ro = RO - i * W, ri = ro - W;
    const s = new THREE.Shape();
    s.moveTo(-ro, 0);
    s.lineTo(-ro, HL);
    s.absarc(0, HL, ro, PI, 0, true);
    s.lineTo(ro, 0);
    s.lineTo(ri, 0);
    s.lineTo(ri, HL);
    s.absarc(0, HL, ri, 0, PI, false);
    s.lineTo(-ri, 0);
    s.closePath();
    bands.add(extrude(s, DEPTH - i * 0.02, 0.03), trs(0, 0, 0), c, { ao: 0.12 });
  });
  // clouds at its feet (lightly tinted with the owner's colour underneath)
  const under = shade(color, 0.78);
  for (const sx of [-1, 1]) {
    const x = sx * (RO - 0.7);
    for (const [dx, dy, dz, s] of [[0, 0.55, 0, 1.5], [sx * 0.4, 0.4, 0.5, 1.05], [-sx * 0.5, 0.45, -0.5, 1.2], [sx * 0.2, 1.0, 0.1, 1.2], [sx * 0.35, 0.35, -0.55, 0.95]]) {
      m.prim('sphere:10', x + dx, dy, dz, s * 1.2, s, s * 1.1, bright('#ffffff', 1.1), { ao: 0.15 });
    }
    m.prim('sphere:10', x, 0.25, 0, 1.9, 0.5, 1.8, under, { ao: 0 });
  }
  // pot of gold at the right foot
  {
    const x = 1.25, z = 1.55;
    m.prim('sphere:12', x, 0.42, z, 1.0, 0.8, 1.0, COAL, { ao: 0.2 });
    ring(m, x, 0.78, z, 0.42, 0.07, '#4a4f5a', { seg: 16 });
    m.prim('hemi:10', x, 0.78, z, 0.84, 0.36, 0.84, GOLD, { ao: 0 });
    for (const [dx, dz, a] of [[0.55, 0.2, 0.4], [-0.45, 0.4, -0.3], [0.2, 0.55, 0.9]]) m.cyl(x + dx, 0, z + dz, 0.16, 0.06, GOLD, { seg: 10, rx: a * 0.2, ao: 0 });
  }
  const fx = new Fx();
  const r = makeRand(12);
  const n = lo ? 6 : 12;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let x, y;
    if (t < 0.2) {
      x = -RO - 0.25;
      y = 1.6 + (t / 0.2) * (HL - 1.6);
    } else if (t > 0.8) {
      x = RO + 0.25;
      y = 1.6 + ((1 - t) / 0.2) * (HL - 1.6);
    } else {
      const a = PI - ((t - 0.2) / 0.6) * PI;
      x = Math.cos(a) * (RO + 0.3);
      y = HL + Math.sin(a) * (RO + 0.3);
    }
    fx.p('octa', x, y, r.range(-0.3, 0.5), 0.34, 0.34, 0.34, i % 2 ? '#ffffff' : '#fff2a0', { mode: 'twinkle', phase: r(), speed: r.range(0.4, 0.7) });
  }
  fx.p('octa', 1.25, 1.35, 1.55, 0.36, 0.36, 0.36, '#fff8c8', { mode: 'twinkle', phase: 0.3, speed: 0.8 });
  return {
    parts: [piece('rainbow', geoOf(bands), M.glowLit), piece('clouds', geoOf(m), M.snow), piece('sparkles', fx.geometry(0.5), M.fx, { shadow: false, receive: false })],
    rig: fxRig,
  };
};

// Toy rocket on a launch pad: owner-coloured nose, stripes and fins, a glowing porthole, blinking lights and
// idle vapour puffs.
B.rocket = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  // pad with hazard stripes
  m.block(0, 0, 0, 4.1, 0.36, 4.1, '#4a505c', { topFace: '#5a606c', uv: 'studs' });
  for (let i = 0; i < 8; i++) {
    const t = -1.8 + i * 0.52;
    for (const [x, z, ry] of [[t, 1.95, 0], [t, -1.95, 0], [1.95, t, PI / 2], [-1.95, t, PI / 2]]) m.box(x, 0.37, z, 0.3, 0.04, 0.18, i % 2 ? COAL : '#ffd23f', { ry, ao: 0 });
  }
  m.cyl(0, 0.36, 0, 1.45, 0.08, '#8a909c', { seg: 20, ao: 0 });
  // gantry tower at the back-left
  const GX = -1.55, GZ = -1.55, GTOP = 5.2;
  for (const [u, v] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) m.block(GX + u, 0.36, GZ + v, 0.12, GTOP - 0.36, 0.12, '#ff4a4a', { ao: 0 });
  for (let y = 1.0; y < GTOP; y += 1.0) {
    for (const s of [-1, 1]) {
      m.box(GX, y, GZ + s * 0.3, 0.6, 0.08, 0.08, '#ffffff', { ao: 0 });
      m.box(GX + s * 0.3, y, GZ, 0.08, 0.08, 0.6, '#ffffff', { ao: 0 });
    }
  }
  m.block(GX, GTOP, GZ, 0.8, 0.12, 0.8, '#ff4a4a', { ao: 0 });
  m.beam(GX + 0.3, 4.2, GZ + 0.3, -0.55, 4.2, -0.55, 0.14, '#ffffff', { ao: 0 });
  // rocket body: lathe bands (white body, owner stripes and nose)
  const WHITE = '#f6f7fb';
  const prof = (a, b) => {
    const P = [[0.62, 1.2], [0.92, 1.55], [1.05, 2.3], [1.08, 3.4], [1.05, 4.6], [0.96, 5.5], [0.78, 6.4], [0.5, 7.2], [0.2, 7.75], [0.0, 7.95]];
    // resample the outline between heights a..b
    const pts = [];
    const rAt = (y) => {
      for (let i = 0; i < P.length - 1; i++) {
        const [r0, y0] = P[i], [r1, y1] = P[i + 1];
        if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
      return 0;
    };
    pts.push([rAt(a), a]);
    for (const [r0, y0] of P) if (y0 > a && y0 < b) pts.push([r0, y0]);
    pts.push([rAt(b), b]);
    return pts;
  };
  const bandsDef = [[1.2, 2.2, WHITE], [2.2, 2.55, color], [2.55, 4.7, WHITE], [4.7, 4.95, color], [4.95, 5.5, WHITE], [5.5, 7.95, color]];
  for (const [a, b, c] of bandsDef) m.add(latheGeo(prof(a, b), 20), trs(0, 0, 0), c, { ao: 0.1 });
  m.add('frustum:14', trs(0, 0.85, 0, 1.3, 0.75, 1.3, PI), '#5a606c', { ao: 0.2 });
  // fins
  const fin = new THREE.Shape();
  fin.moveTo(0, 0.2);
  fin.lineTo(1.05, -1.22);
  fin.lineTo(1.12, -0.1);
  fin.lineTo(0, 2.1);
  fin.closePath();
  const finGeo = extrude(fin, 0.18, 0.05);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + PI / 4;
    const x = Math.sin(a) * 0.95, z = Math.cos(a) * 0.95;
    m.add(finGeo, trs(x, 1.6, z, 1, 1, 1, 0, a - PI / 2), color, { ao: 0.15 });
  }
  // porthole rim
  const PY = 4.0;
  m.add(new THREE.TorusGeometry(0.42, 0.1, 6, 18), trs(0, PY, 1.1), '#8a909c', { ao: 0 });
  // lights (glow) + vapour
  const fx = new Fx();
  fx.p('cyl:16', 0, PY, 1.08, 0.72, 0.1, 0.72, '#8fe6ff', { mode: 'still' }, { rx: PI / 2 });
  fx.p('sphere:6', 0.16, PY + 0.14, 1.14, 0.16, 0.16, 0.06, '#ffffff', { mode: 'still' });
  fx.p('sphere:8', 0, 8.05, 0, 0.3, 0.3, 0.3, '#ff3b3b', { mode: 'twinkle', phase: 0, speed: 0.8 });
  const lights = [[1.8, 1.8, '#3fff6a'], [-1.8, 1.8, '#ff3b3b'], [1.8, -1.8, '#ff3b3b'], [-1.1, -1.8, '#3fff6a']];
  lights.forEach(([x, z, c], i) => fx.p('sphere:6', x, 0.5, z, 0.24, 0.24, 0.24, c, { mode: 'twinkle', phase: i * 0.25, speed: 0.9 }));
  const soft = new Fx();
  const puffs = lo ? 4 : 8;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * TAU + 0.3;
    soft.p('sphere:8', Math.sin(a) * 0.5, 0.55, Math.cos(a) * 0.5, 0.75, 0.6, 0.75, '#ffffff', { mode: 'puff', phase: i / puffs + (i % 2) * 0.37, speed: 0.4, amp: 0.1, vel: [Math.sin(a) * 1.9, 0.5, Math.cos(a) * 1.9] });
  }
  return {
    parts: [piece('rocket', geoOf(m), M.stud), piece('lights', fx.geometry(0.5), M.fx, { shadow: false, receive: false }), piece('vapour', soft.geometry(2.6), M.fxSoft, { shadow: false, receive: false })],
    rig: fxRig,
  };
};

// Golden statue of a blocky R6 kid on a marble pedestal: seed held high, pool noodle slung on the back.
B.statue = (color, lo) => {
  const M = mats();
  const m = new Merger({ uvScale: 0.25 });
  const gold = new Merger();
  const MARBLE = '#f6f2ea', MARBLE_D = '#ddd6c8';
  m.block(0, 0, 0, 4.1, 0.4, 4.1, MARBLE_D, { topFace: MARBLE, uv: 'studs' });
  m.block(0, 0.4, 0, 3.3, 1.3, 3.3, MARBLE, { ao: 0.2 });
  m.block(0, 1.7, 0, 3.65, 0.32, 3.65, MARBLE_D, { topFace: MARBLE });
  // plaque in the owner's colour with a gold star
  m.box(0, 1.05, 1.66, 1.9, 0.9, 0.06, color, { ao: 0 });
  gold.add(extrude(starShape(0.34, 0.15), 0.08, 0.02), trs(0, 1.05, 1.71), '#ffffff', { ao: 0 });
  // gold trims
  for (const [y, w] of [[0.4, 3.36], [1.66, 3.36], [2.02, 3.7]]) gold.box(0, y, 0, w, 0.08, w, '#ffffff', { ao: 0 });
  // the figure (R6 units, feet on the pedestal)
  const Y = 2.02, G = '#ffffff', ENG = '#5a3c10';
  const P = (x, y, z) => [x, Y + y, z];
  // legs, a little apart
  for (const s of [-1, 1]) gold.add(new RoundedBoxGeometry(0.96, 2, 1, 2, 0.08), trs(...P(s * 0.52, 1.0, 0), 1, 1, 1, 0, 0, s * 0.06), G, { ao: 0.15 });
  gold.add(new RoundedBoxGeometry(2, 2, 1, 2, 0.1), trs(...P(0, 3.0, 0)), G, { ao: 0.1 });
  // arms: left on the hip, right raised high holding a seed
  gold.add(new RoundedBoxGeometry(0.96, 2, 0.96, 2, 0.08), trs(...P(1.62, 2.95, 0.05), 1, 1, 1, 0, 0, 0.45), G, { ao: 0.1 });
  const sh = P(-1.0, 3.85, 0);
  const ang = -2.78;
  const ax = sh[0] + Math.sin(ang) * 1.0 - 0.5, ay = sh[1] - Math.cos(ang) * 1.0;
  gold.add(new RoundedBoxGeometry(0.96, 2, 0.96, 2, 0.08), trs(ax, ay, 0.05, 1, 1, 1, 0, 0, ang), G, { ao: 0 });
  const hx = sh[0] + Math.sin(ang) * 2.1 - 0.5, hy = sh[1] - Math.cos(ang) * 2.1;
  gold.prim('sphere:12', hx - 0.08, hy + 0.55, 0.05, 0.85, 1.25, 0.85, G, { ao: 0, rz: 0.4 });
  // head with an engraved smile, and hair
  const HY = 4.05 + 1.17;
  gold.add(new RoundedBoxGeometry(2.42, 2.34, 2.14, 3, 0.45), trs(...P(0, HY, 0)), G, { ao: 0.1 });
  for (const s of [-1, 1]) gold.add(new RoundedBoxGeometry(0.26, 0.46, 0.1, 1, 0.06), trs(...P(s * 0.46, HY + 0.12, 1.06)), ENG, { ao: 0 });
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    gold.box(...P(Math.sin(a) * 0.5, HY - 0.42 + (1 - Math.cos(a)) * 0.3, 1.07), 0.16, 0.1, 0.06, ENG, { rz: a * 0.8, ao: 0 });
  }
  gold.add(new RoundedBoxGeometry(2.6, 0.7, 2.34, 2, 0.3), trs(...P(0, HY + 1.0, -0.06)), G, { ao: 0 });
  gold.add(new RoundedBoxGeometry(2.56, 1.7, 0.52, 2, 0.22), trs(...P(0, HY + 0.25, -0.96)), G, { ao: 0 });
  gold.add(new RoundedBoxGeometry(1.7, 0.55, 0.62, 2, 0.24), trs(...P(0.42, HY + 0.86, 0.92), 1, 1, 1, 0.15, 0, -0.22), G, { ao: 0 });
  for (const s of [-1, 1]) gold.add(new RoundedBoxGeometry(0.34, 1.0, 1.6, 1, 0.14), trs(...P(s * 1.18, HY + 0.45, -0.25)), G, { ao: 0 });
  // pool noodle slung across the back
  gold.add('cyl:10', along(...P(0.05, 2.9, -0.78), [0.72, 1, 0], 0.55, 4.0, 0.55), G, { ao: 0 });
  const fx = new Fx();
  const r = makeRand(22);
  const n = lo ? 4 : 7;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    fx.p('octa', Math.cos(a) * r.range(1.1, 1.8), Y + r.range(1.0, 6.8), Math.sin(a) * 1.2 + 0.5, 0.32, 0.32, 0.32, i % 2 ? '#ffffff' : '#fff2a0', { mode: 'twinkle', phase: r(), speed: r.range(0.35, 0.6) });
  }
  return {
    parts: [piece('pedestal', geoOf(m), M.snow), piece('gold', geoOf(gold), M.gold), piece('glints', fx.geometry(0.5), M.fx, { shadow: false, receive: false })],
    rig: fxRig,
  };
};

// Decorations whose only animation lives in their shaders just keep the clock running.
function fxRig(root) {
  root.userData.update = tick;
}

// ------------------------------------------------------------------ public API

const RECIPES = new Map();
function recipe(id, color, lo) {
  const key = id + '|' + color + '|' + (lo ? 'lo' : 'hi');
  let r = RECIPES.get(key);
  if (!r) {
    r = B[id](color, lo);
    r.parts = r.parts.filter(Boolean);
    RECIPES.set(key, r);
  }
  return r;
}

export function createDecor(id, { color = '#2f80ed', quality = null } = {}) {
  const root = new THREE.Group();
  root.name = 'decor:' + id;
  if (!B[id]) return root;
  const lo = !!quality && quality.decorDensity != null && quality.decorDensity < 0.5;
  const shadows = !quality || quality.shadows !== false;
  const rec = recipe(id, hex(color), lo);
  const meshes = {};
  for (const p of rec.parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat);
    mesh.name = p.name;
    mesh.castShadow = shadows && p.shadow;
    mesh.receiveShadow = p.receive;
    if (p.pos) mesh.position.fromArray(p.pos);
    if (!p.animated) {
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
    }
    root.add(mesh);
    meshes[p.name] = mesh;
  }
  if (rec.rig) rec.rig(root, meshes);
  return root;
}

// ------------------------------------------------------------------ the Guard Gnome

const GNOMES = new Map();
function gnomeRecipe(color) {
  let r = GNOMES.get(color);
  if (r) return r;
  const tunic = gnomeTunic(color);
  const body = new Merger();
  gnomeBody(body, { tunic, arms: 'guard' });
  const head = new Merger();
  gnomeHead(head, { hat: color });
  const arm = new Merger();
  gnomeArm(arm, { tunic, noodle: color });
  // "!" shown above the hat while a thief is in the garden
  const mark = new Merger();
  mark.box(0, 0.42, 0, 0.3, 0.66, 0.3, '#ff2a1a', { ao: 0, top: '#ff5a2a' });
  mark.box(0, -0.12, 0, 0.3, 0.26, 0.3, '#ff2a1a', { ao: 0 });
  r = { body: geoOf(body), head: geoOf(head), arm: geoOf(arm), mark: geoOf(mark) };
  GNOMES.set(color, r);
  return r;
}

// The Golden Gnome Hunt's gnome (world/gnomes.js): the guard cast in shiny gold, one merged geometry (feet at
// y = 0, facing +Z, its noodle held up high) and the gold material. Pale vertex colours read as gold, dark ones
// as engraving. Shared: never dispose them.
let golden = null;
export function goldenGnome() {
  if (golden) return golden;
  const m = new Merger();
  gnomeBody(m, { tunic: '#fff1cc', arms: 'guard' });
  gnomeHead(m, { hat: '#ffffff' }, GNOME.neck);
  gnomeArm(placed(m, trs(...GNOME.shoulder, 1, 1, 1, -2.05, 0, 0.42, 'ZXY')), { tunic: '#fff1cc', noodle: '#ffffff' });
  golden = { geometry: geoOf(m), material: mats().gold };
  return golden;
}

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createGuardGnome({ color = '#2f80ed' } = {}) {
  const M = mats();
  const R = gnomeRecipe(hex(color));
  const object3d = new THREE.Group();
  object3d.name = 'guard-gnome';
  const rig = new THREE.Group();
  object3d.add(rig);
  const body = new THREE.Mesh(R.body, M.stud);
  const head = new THREE.Group();
  head.position.fromArray(GNOME.neck);
  const headMesh = new THREE.Mesh(R.head, M.stud);
  head.add(headMesh);
  const arm = new THREE.Group();
  arm.position.fromArray(GNOME.shoulder);
  const armMesh = new THREE.Mesh(R.arm, M.stud);
  arm.add(armMesh);
  const mark = new THREE.Mesh(R.mark, M.glow);
  mark.position.set(0, 3.55, 0);
  mark.visible = false;
  rig.add(body, head, arm, mark);
  for (const o of [body, headMesh, armMesh]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }

  const IDLE_ARM = -0.95, ALERT_ARM = -1.55, WIND = -2.75, HIT = -0.3;
  let alertW = 0;
  let swingT = -1;
  const ph = Math.random() * 10;

  function swing() {
    swingT = 0;
  }

  function update(dt, t, s) {
    const alert = !!(s && s.alert);
    alertW += ((alert ? 1 : 0) - alertW) * Math.min(1, dt * 6);
    const tt = t + ph;
    // idle: breathe and look around; alert: hop on the spot and glance about quickly
    const breathe = Math.sin(tt * 2.2);
    const hopS = Math.abs(Math.sin(tt * 7.5));
    const hop = hopS * 0.42 * alertW;
    const land = (1 - hopS) ** 6 * alertW; // squash when touching down
    rig.position.y = hop;
    rig.scale.set(1 - 0.012 * breathe + 0.1 * land, 1 + 0.022 * breathe - 0.14 * land, 1 - 0.012 * breathe + 0.1 * land);
    const lookIdle = Math.sin(tt * 0.45) * 0.6 + Math.sin(tt * 1.3) * 0.12;
    const lookAlert = Math.sin(tt * 3.1) * 0.75;
    let yaw = lookIdle + (lookAlert - lookIdle) * alertW;
    head.rotation.x = Math.sin(tt * 0.5) * 0.05 - 0.06 * alertW;
    let a = IDLE_ARM + (ALERT_ARM - IDLE_ARM) * alertW + Math.sin(tt * 2.2) * 0.03;
    let lean = 0.06 * alertW;
    if (swingT >= 0) {
      swingT += dt;
      const k = swingT / 0.5;
      const base = a;
      if (k < 0.3) a = base + (WIND - base) * smooth(k / 0.3);
      else if (k < 0.5) a = WIND + (HIT - WIND) * ((k - 0.3) / 0.2) ** 2;
      else if (k < 0.66) a = HIT + Math.sin(((k - 0.5) / 0.16) * PI) * 0.12;
      else if (k < 1) a = HIT + (base - HIT) * smooth((k - 0.66) / 0.34);
      else {
        a = base;
        swingT = -1;
      }
      const hitW = k < 1 ? Math.sin(clamp01((k - 0.3) / 0.6) * PI) : 0;
      lean += 0.3 * hitW - 0.12 * Math.sin(clamp01(k / 0.3) * PI);
      yaw *= 1 - Math.sin(clamp01(k) * PI);
      rig.position.y += 0.12 * Math.sin(clamp01(k / 0.5) * PI);
    }
    head.rotation.y = yaw;
    arm.rotation.x = a;
    arm.rotation.z = -0.12 - 0.1 * alertW;
    rig.rotation.x = lean;
    mark.visible = alertW > 0.5;
    if (mark.visible) {
      mark.position.y = 3.55 + Math.sin(tt * 6) * 0.12;
      mark.rotation.y = tt * 2.5;
      const sc = 0.6 + 0.4 * Math.min(1, (alertW - 0.5) * 4);
      mark.scale.setScalar(sc);
    }
  }

  update(0, 0, null);
  return { object3d, swing, update };
}
