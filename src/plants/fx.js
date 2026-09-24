// Rarity / mutation effects, batched. Every sparkle cloud, aura column, loot beam, soil glow, halo and crown in a
// scene is drawn by ONE shared instanced object per effect type (7 draw calls in total, however many plants,
// seeds and pods are on screen). Nothing here casts shadows.
//
// Views describe their effects once, as items on an FxRig anchored to their own (mesh-less) Object3Ds. A manager
// hooked into scene.onBeforeRender (three calls it after updating world matrices and before culling/uploading)
// walks every live rig, skips hidden ones, and writes each item's world transform + parameters into the shared
// instance buffers. So effects follow carried items, growth pops and sway with no lag, and vanish as soon as a
// view is hidden or removed (no dispose call needed). All animation runs in shaders from one time uniform.
import * as THREE from 'three';
import { U, camPos, captureCamera, plantQuality } from './materials.js';
import { Builder, P, cachedGeo } from './geometry.js';

const HUE = 'vec3 fxHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }';
const XFORM = `
attribute vec4 iM0;
attribute vec4 iM1;
attribute vec4 iM2;
vec3 fxWorld(vec3 p) { vec4 q = vec4(p, 1.0); return vec3(dot(iM0, q), dot(iM1, q), dot(iM2, q)); }`;

// ------------------------------------------------------------------ quality / LOD

// At 'low' quality, the finest sparkles (small motes) are skipped beyond this distance from the camera.
const LOD_FINE_DIST = 40;

// ------------------------------------------------------------------ shaders

const SPARK_VERT = `
uniform float uTime;
uniform float uBufH;
attribute float aIdx;
attribute vec4 aSeed;
attribute vec4 iCol; // rgb, flags (1 = rainbow, 2 = star)
attribute vec4 iA;   // mode (0 twinkle, 1 orbit, 2 rise), count, size, intensity
attribute vec4 iB;   // rx, h, y0, seed
varying float vA;
varying vec3 vCol;
varying float vStar;
varying float vInt;
${XFORM}
${HUE}
void main() {
  float count = iA.y;
  vA = 0.0;
  vCol = vec3(0.0);
  vStar = 0.0;
  vInt = 0.0;
  if (aIdx >= count) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float rx = iB.x, h = iB.y, y0 = iB.z, sd = iB.w;
  // position holds the per-point layout randoms; a per-emitter seed reshuffles them so emitters differ
  vec3 lay = fract(position + sd * vec3(0.618034, 0.414214, 0.732051));
  vec4 s = fract(aSeed + sd * vec4(0.236068, 0.0, 0.316625, 0.645751));
  s.y = fract((aIdx + aSeed.y * 0.8) / count + sd * 0.371);
  float a = 1.0;
  float sz = iA.z * (0.6 + s.w * 0.8);
  vec3 p;
  if (iA.x < 0.5) {
    float ang = lay.x * 6.2831853, r = sqrt(lay.y) * rx;
    p = vec3(cos(ang) * r, y0 + lay.z * h, sin(ang) * r);
    float w = sin(uTime * (1.3 + s.x * 1.7) + s.y * 6.2831);
    a = pow(max(w, 0.0), 4.0);
    sz *= 0.25 + 0.75 * a;
  } else if (iA.x < 1.5) {
    float r = rx * (0.75 + lay.x * 0.45);
    float dir = s.z > 0.5 ? 1.0 : -1.0;
    float ang = s.y * 6.2831 + uTime * (0.45 + s.x * 0.55) * dir;
    p = vec3(cos(ang) * r, y0 + lay.z * h + sin(uTime * 1.4 + s.y * 6.2831) * 0.3, sin(ang) * r);
    a = 0.6 + 0.4 * sin(uTime * 4.0 + s.y * 20.0);
  } else {
    float ang = lay.x * 6.2831853, r = (0.3 + 0.7 * sqrt(lay.y)) * rx;
    float y = mod(s.z * h + uTime * (0.25 + s.x * 0.35) * h * 0.35, h);
    float k = y / h;
    p = vec3(cos(ang) * r * (1.0 + 0.4 * k) + sin(uTime * 1.7 + s.y * 6.28) * 0.18, y,
      sin(ang) * r * (1.0 + 0.4 * k) + cos(uTime * 1.3 + s.y * 6.28) * 0.18);
    a = sin(3.14159 * k);
  }
  vCol = mod(iCol.w, 2.0) > 0.5 ? mix(fxHue(fract(s.y + uTime * 0.25)), vec3(1.0), 0.2) : iCol.rgb;
  vStar = step(1.5, iCol.w);
  vInt = iA.w;
  vA = a;
  vec4 mv = viewMatrix * vec4(fxWorld(p), 1.0);
  gl_Position = projectionMatrix * mv;
  float scale = length(vec3(iM0.x, iM1.x, iM2.x));
  gl_PointSize = a < 0.02 ? 0.0 : min(64.0, sz * scale * uBufH * 0.5 * projectionMatrix[1][1] / max(0.5, -mv.z));
}`;
const SPARK_FRAG = `
varying float vA;
varying vec3 vCol;
varying float vStar;
varying float vInt;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  float i;
  if (vStar > 0.5) {
    float core = exp(-d * d * 10.0);
    float cr = max(0.0, 1.0 - abs(q.x) * 6.0) * max(0.0, 1.0 - abs(q.y)) + max(0.0, 1.0 - abs(q.y) * 6.0) * max(0.0, 1.0 - abs(q.x));
    i = core + cr * 0.9;
  } else {
    i = exp(-d * d * 4.5) * (1.0 - smoothstep(0.85, 1.0, d));
  }
  float alpha = min(1.0, i * vA * vInt);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vCol, alpha);
  #include <colorspace_fragment>
}`;

// Aura columns (flared, streaky) and loot beams (straight, tall) share one cylinder.
const COLUMN_VERT = `
attribute vec4 iCol; // rgb, alpha
attribute vec4 iP;   // beam, rainbow
varying vec2 vUv;
varying float vFres;
varying vec4 vCol;
varying vec2 vFlags;
${XFORM}
void main() {
  vec3 p = position;
  vec3 n = normal;
  if (iP.x < 0.5) {
    p.xz *= 1.0 + 0.25 * p.y;
    n = normalize(vec3(n.x, -0.25, n.z));
  }
  vec3 c0 = vec3(iM0.x, iM1.x, iM2.x), c1 = vec3(iM0.y, iM1.y, iM2.y), c2 = vec3(iM0.z, iM1.z, iM2.z);
  vec3 wn = c0 * (n.x / dot(c0, c0)) + c1 * (n.y / dot(c1, c1)) + c2 * (n.z / dot(c2, c2));
  vec4 mv = viewMatrix * vec4(fxWorld(p), 1.0);
  vec3 vn = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  vFres = abs(dot(vn, normalize(-mv.xyz)));
  vUv = uv;
  vCol = iCol;
  vFlags = iP.xy;
  gl_Position = projectionMatrix * mv;
}`;
const COLUMN_FRAG = `
uniform float uTime;
varying vec2 vUv;
varying float vFres;
varying vec4 vCol;
varying vec2 vFlags;
${HUE}
void main() {
  float v = vUv.y;
  float fade, streak, edge;
  if (vFlags.x > 0.5) {
    fade = pow(1.0 - v, 1.3) * smoothstep(0.0, 0.03, v);
    streak = 0.8 + 0.2 * sin(v * 18.0 - uTime * 4.0);
    edge = pow(vFres, 2.2);
  } else {
    fade = pow(1.0 - v, 1.5) * smoothstep(0.0, 0.1, v);
    streak = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 4.0 + uTime * 1.6 - v * 7.0);
    edge = pow(vFres, 1.4);
  }
  vec3 c = vFlags.y > 0.5 ? mix(fxHue(fract(vUv.x * 2.0 + uTime * 0.2 + v * 0.6)), vec3(1.0), 0.15) : vCol.rgb;
  float a = fade * streak * edge * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

// Soft alpha ramps matching the old canvas gradients (radial glow, rarity ring, secret void pool, seed halo).
const RAMPS = `
float rampRadial(float d) {
  if (d < 0.25) return mix(1.0, 0.7, d / 0.25);
  if (d < 0.6) return mix(0.7, 0.18, (d - 0.25) / 0.35);
  return mix(0.18, 0.0, clamp((d - 0.6) / 0.4, 0.0, 1.0));
}
float rampRing(float d) {
  if (d < 0.55) return mix(0.22, 0.3, d / 0.55);
  if (d < 0.72) return mix(0.3, 1.0, (d - 0.55) / 0.17);
  if (d < 0.8) return mix(1.0, 0.8, (d - 0.72) / 0.08);
  if (d < 0.9) return mix(0.8, 0.15, (d - 0.8) / 0.1);
  return mix(0.15, 0.0, clamp((d - 0.9) / 0.1, 0.0, 1.0));
}
float rampVoid(float d) {
  if (d < 0.6) return mix(0.95, 0.75, d / 0.6);
  return mix(0.75, 0.0, clamp((d - 0.6) / 0.4, 0.0, 1.0));
}
float rampHalo(float d) {
  if (d < 0.3) return mix(0.25, 0.45, d / 0.3);
  if (d < 0.5) return mix(0.45, 0.4, (d - 0.3) / 0.2);
  if (d < 0.75) return mix(0.4, 0.12, (d - 0.5) / 0.25);
  return mix(0.12, 0.0, clamp((d - 0.75) / 0.25, 0.0, 1.0));
}`;
const FOG_APPLY = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
  float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF * vFogOn);
#endif`;

// Flat soil glows: 0 radial, 1 ring, 2 rainbow ring, 3 void pool (dark, normal blending).
const GROUND_VERT = `
uniform float uTime;
attribute vec4 iCol; // rgb, opacity
attribute vec4 iP;   // kind, pulse amount, pulse phase, fog
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vFogOn;
#include <fog_pars_vertex>
${XFORM}
void main() {
  vec3 p = position;
  p.xz *= 1.0 + sin(uTime * 2.2 + iP.z) * iP.y;
  vec4 mvPosition = viewMatrix * vec4(fxWorld(p), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vCol = iCol;
  vKind = iP.x;
  vFogOn = iP.w;
  #include <fog_vertex>
}`;
const GROUND_FRAG = `
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vFogOn;
#include <fog_pars_fragment>
${HUE}
${RAMPS}
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  vec3 c = vCol.rgb;
  float a;
  if (vKind < 0.5) a = rampRadial(r);
  else if (vKind < 1.5) a = rampRing(r);
  else if (vKind < 2.5) {
    float ang = atan(q.y, q.x) / 6.2831;
    float ring = exp(-pow((r - 0.8) / 0.07, 2.0));
    float fill = 0.18 * (1.0 - smoothstep(0.0, 0.85, r));
    c = mix(fxHue(fract(ang + uTime * 0.15)), vec3(1.0), 0.15);
    a = (ring + fill) * (0.85 + 0.15 * sin(uTime * 3.0 + ang * 25.0));
  } else {
    a = rampVoid(r);
    c = mix(vec3(0.0030, 0.0012, 0.0090), vec3(0.0070, 0.0024, 0.0252), smoothstep(0.0, 0.6, r));
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
  ${FOG_APPLY}
}`;

// Camera-facing halos (replace THREE.Sprite): 0 radial glow, 1 hollow halo.
const HALO_VERT = `
attribute vec4 iCol; // rgb, opacity
attribute vec4 iP;   // texture kind
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vFogOn;
#include <fog_pars_vertex>
${XFORM}
void main() {
  vec4 mvPosition = viewMatrix * vec4(iM0.w, iM1.w, iM2.w, 1.0);
  vec2 scale = vec2(length(vec3(iM0.x, iM1.x, iM2.x)), length(vec3(iM0.y, iM1.y, iM2.y)));
  mvPosition.xy += position.xy * scale;
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vCol = iCol;
  vKind = iP.x;
  vFogOn = 1.0;
  #include <fog_vertex>
}`;
const HALO_FRAG = `
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vFogOn;
#include <fog_pars_fragment>
${RAMPS}
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float a = (vKind < 0.5 ? rampRadial(r) : rampHalo(r)) * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  #include <colorspace_fragment>
  ${FOG_APPLY}
}`;

// ------------------------------------------------------------------ batch objects

const matCache = new Map();
const cached = (k, f) => matCache.get(k) || (matCache.set(k, f()), matCache.get(k));
const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

function fxMaterial(key, { vert, frag, blending = THREE.AdditiveBlending, fog = false, side = THREE.FrontSide }) {
  return cached(key, () => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...(fog ? fogUniforms() : {}), uTime: U.time, uBufH: U.bufH },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending,
      side,
      fog,
    });
    m.onBeforeRender = captureCamera;
    return m;
  });
}

const SPARK_MAX = 16; // points per emitter
function sparkBaseGeo() {
  return cachedGeo('fxSparkBase', () => {
    let s = 7919;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const lay = new Float32Array(SPARK_MAX * 3);
    const seed = new Float32Array(SPARK_MAX * 4);
    const idx = new Float32Array(SPARK_MAX);
    for (let i = 0; i < SPARK_MAX; i++) {
      lay.set([rnd(), rnd(), rnd()], i * 3);
      seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
      idx[i] = i;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(lay, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
    return g;
  });
}
const columnBaseGeo = () => cachedGeo('fxColumnBase', () => new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0));
const flatBaseGeo = () => cachedGeo('fxFlatBase', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
const quadBaseGeo = () => cachedGeo('fxQuadBase', () => new THREE.PlaneGeometry(1, 1));

// Batch kinds. stride = floats per instance: 12 (3x4 world matrix rows) + extras.
const KINDS = {
  spark: { stride: 24, attrs: [['iCol', 12], ['iA', 16], ['iB', 20]], points: true, geo: sparkBaseGeo, order: 4.4,
    mat: () => fxMaterial('spark', { vert: SPARK_VERT, frag: SPARK_FRAG }) },
  sparkDark: { stride: 24, attrs: [['iCol', 12], ['iA', 16], ['iB', 20]], points: true, geo: sparkBaseGeo, order: 4.2,
    mat: () => fxMaterial('sparkDark', { vert: SPARK_VERT, frag: SPARK_FRAG, blending: THREE.NormalBlending }) },
  column: { stride: 20, attrs: [['iCol', 12], ['iP', 16]], geo: columnBaseGeo, order: 5,
    mat: () => fxMaterial('column', { vert: COLUMN_VERT, frag: COLUMN_FRAG, side: THREE.DoubleSide }) },
  groundDark: { stride: 20, attrs: [['iCol', 12], ['iP', 16]], geo: flatBaseGeo, order: 1,
    mat: () => fxMaterial('groundDark', { vert: GROUND_VERT, frag: GROUND_FRAG, blending: THREE.NormalBlending, fog: true, side: THREE.DoubleSide }) },
  ground: { stride: 20, attrs: [['iCol', 12], ['iP', 16]], geo: flatBaseGeo, order: 1.5,
    mat: () => fxMaterial('ground', { vert: GROUND_VERT, frag: GROUND_FRAG, fog: true, side: THREE.DoubleSide }) },
  halo: { stride: 20, attrs: [['iCol', 12], ['iP', 16]], geo: quadBaseGeo, order: 4,
    mat: () => fxMaterial('halo', { vert: HALO_VERT, frag: HALO_FRAG, fog: true }) },
  crown: { instancedMesh: true, order: 0 },
};
const KIND_NAMES = Object.keys(KINDS);

class Batch {
  constructor(kind, group) {
    this.kind = kind;
    this.spec = KINDS[kind];
    this.group = group;
    this.n = 0;
    this.object = null;
    this._alloc(64);
  }

  _alloc(cap) {
    const spec = this.spec;
    const old = this.object;
    const oldArr = this.arr;
    this.cap = cap;
    let obj;
    if (spec.instancedMesh) {
      obj = new THREE.InstancedMesh(crownTemplate().groups[0].meshes[0].geometry, crownTemplate().groups[0].meshes[0].material, cap);
      obj.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.arr = obj.instanceMatrix.array;
      this.stride = 16;
      this.buf = obj.instanceMatrix;
    } else {
      const geo = new THREE.InstancedBufferGeometry().copy(spec.geo());
      geo.userData.fxBatch = true;
      this.stride = spec.stride;
      this.arr = new Float32Array(cap * spec.stride);
      const buf = new THREE.InstancedInterleavedBuffer(this.arr, spec.stride, 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iM0', new THREE.InterleavedBufferAttribute(buf, 4, 0));
      geo.setAttribute('iM1', new THREE.InterleavedBufferAttribute(buf, 4, 4));
      geo.setAttribute('iM2', new THREE.InterleavedBufferAttribute(buf, 4, 8));
      for (const [name, off] of spec.attrs) geo.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, 4, off));
      geo.instanceCount = 0;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      this.buf = buf;
      obj = spec.points ? new THREE.Points(geo, spec.mat()) : new THREE.Mesh(geo, spec.mat());
    }
    obj.name = 'plant-fx:' + this.kind;
    obj.frustumCulled = false;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.renderOrder = spec.order;
    obj.matrixAutoUpdate = false;
    obj.visible = false;
    if (oldArr) this.arr.set(oldArr.subarray(0, Math.min(oldArr.length, this.arr.length)));
    if (old) {
      this.group.remove(old);
      if (old.isInstancedMesh) old.dispose();
      else old.geometry.dispose();
    }
    this.group.add(obj);
    this.object = obj;
  }

  /** Reserve the next instance; returns its float offset in this.arr. */
  next() {
    if (this.n >= this.cap) this._alloc(this.cap * 2);
    return this.n++ * this.stride;
  }

  commit() {
    const o = this.object;
    const n = this.n;
    if (this.spec.instancedMesh) o.count = n;
    else o.geometry.instanceCount = n;
    o.visible = n > 0;
    if (n > 0) {
      this.buf.clearUpdateRanges();
      this.buf.addUpdateRange(0, n * this.stride);
      this.buf.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ manager

const rigs = new Set();
const scenes = new Map(); // scene -> SceneFx
const _m = new THREE.Matrix4();
const _l = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

class SceneFx {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'plant-fx';
    this.group.matrixAutoUpdate = false;
    this.batches = {};
    for (const k of KIND_NAMES) this.batches[k] = new Batch(k, this.group);
    this.hook = null;
    this.install();
  }

  // (Re)attach our group and wrap scene.onBeforeRender, keeping whatever hook was there before.
  install() {
    const scene = this.scene;
    if (this.group.parent !== scene) scene.add(this.group);
    if (scene.onBeforeRender === this.hook) return;
    const prev = scene.onBeforeRender;
    const self = this;
    this.hook = function (renderer, sc, camera, target) {
      prev.call(this, renderer, sc, camera, target);
      self.sync(renderer, camera);
    };
    scene.onBeforeRender = this.hook;
  }

  sync(renderer, camera) {
    if (renderer) captureCamera(renderer, this.scene, camera);
    const low = plantQuality() === 'low';
    const B = this.batches;
    for (const k of KIND_NAMES) B[k].n = 0;
    const t = U.time.value;
    for (const rig of rigs) {
      // Walk up once: visible all the way, and which scene (if any) the view hangs in.
      let o = rig.root;
      let vis = true;
      let top = o;
      while (o) {
        if (!o.visible) vis = false;
        top = o;
        o = o.parent;
      }
      if (top !== this.scene) {
        if (top.isScene) continue; // lives in another scene: that scene's hook draws it
        if (rig.state === 1 || ++rig.age > 600) rig.drop(); // detached (removed / dropped) or never used
        continue;
      }
      rig.state = 1;
      if (!vis) continue;
      const items = rig.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.on) continue;
        const anchor = it.anchor;
        if (it.kind === 'crown') {
          _p.set(0, it.y + Math.sin(t * it.bobSpeed + it.phase) * it.bob, 0);
          _q.setFromAxisAngle(_yAxis, t * it.spin);
          _s.setScalar(it.scale);
          _m.multiplyMatrices(anchor.matrixWorld, _l.compose(_p, _q, _s));
        } else {
          _m.multiplyMatrices(anchor.matrixWorld, it.m);
        }
        const e = _m.elements;
        if (it.fine && low) {
          const dx = e[12] - camPos.x, dy = e[13] - camPos.y, dz = e[14] - camPos.z;
          if (dx * dx + dy * dy + dz * dz > LOD_FINE_DIST * LOD_FINE_DIST) continue;
        }
        const b = B[it.batch];
        const off = b.next();
        const a = b.arr;
        if (it.kind === 'crown') {
          for (let j = 0; j < 16; j++) a[off + j] = e[j];
          continue;
        }
        a[off] = e[0]; a[off + 1] = e[4]; a[off + 2] = e[8]; a[off + 3] = e[12];
        a[off + 4] = e[1]; a[off + 5] = e[5]; a[off + 6] = e[9]; a[off + 7] = e[13];
        a[off + 8] = e[2]; a[off + 9] = e[6]; a[off + 10] = e[10]; a[off + 11] = e[14];
        const d = it.data;
        for (let j = 0; j < d.length; j++) a[off + 12 + j] = d[j];
      }
    }
    for (const k of KIND_NAMES) B[k].commit();
  }
}

function ensureScene(scene) {
  let s = scenes.get(scene);
  if (!s) scenes.set(scene, (s = new SceneFx(scene)));
  else s.install();
  return s;
}

/** Make sure the scene an object hangs in has the shared effect batches (e.g. before a shader warm-up compile). */
export function attachFxTo(obj) {
  let o = obj;
  while (o.parent) o = o.parent;
  if (o.isScene) ensureScene(o);
}

/** Debug / QA (also window.__plantFxStats): live rigs and effect instances drawn per batch, summed over scenes. */
export function fxStats() {
  const out = { rigs: rigs.size };
  for (const [, s] of scenes) for (const k of KIND_NAMES) out[k] = (out[k] || 0) + s.batches[k].n;
  return out;
}
if (typeof window !== 'undefined') window.__plantFxStats = fxStats;

// ------------------------------------------------------------------ rigs (one per view)

const _c = new THREE.Color();
function colorOf(c) {
  return c === 'rainbow' ? _c.set('#ffffff') : _c.set(c);
}

/**
 * The effects of one view. Items are anchored to Object3Ds inside the view (their world matrix is sampled every
 * render), so no effect meshes live in the view itself. onDrop runs when the view leaves the scene.
 */
export class FxRig {
  constructor(root, onDrop = null) {
    this.root = root;
    this.items = [];
    this.state = 0; // 0 = waiting to be seen in a scene, 1 = live
    this.age = 0;
    this.onDrop = onDrop;
    root.addEventListener('added', () => this.wake());
    root.addEventListener('removed', () => this.drop());
    this.wake();
  }

  /** Register with the manager (cheap to call every frame). */
  wake() {
    if (!rigs.has(this)) {
      rigs.add(this);
      this.state = 0;
      this.age = 0;
    }
    attachFxTo(this.root);
  }

  drop() {
    if (!rigs.delete(this)) return;
    this.state = 0;
    this.onDrop?.();
  }

  clear() {
    this.items.length = 0;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  _add(it) {
    it.on = true;
    this.items.push(it);
    return it;
  }

  /** mode: 'twinkle' | 'orbit' | 'rise'. color hex or 'rainbow'. dark = normal blending (dark motes). */
  sparkles(anchor, mode, color, count, rx, h, y0 = 0, { size = 0.35, star = true, intensity = 1, dark = false, seed = 1, p = null, fine = size < 0.3 } = {}) {
    const c = colorOf(color);
    const flags = (color === 'rainbow' ? 1 : 0) + (star ? 2 : 0);
    const m = new THREE.Matrix4();
    if (p) m.setPosition(p[0], p[1], p[2]);
    return this._add({
      kind: 'spark', batch: dark ? 'sparkDark' : 'spark', anchor, m, fine,
      data: new Float32Array([c.r, c.g, c.b, flags, mode === 'twinkle' ? 0 : mode === 'orbit' ? 1 : 2, Math.min(SPARK_MAX, count), size, intensity, rx, h, y0, (seed * 0.1373 + Math.random()) % 1]),
    });
  }

  /** Aura column (flared, streaky) or loot beam. Base at the anchor + y. */
  column(anchor, color, radius, height, alpha = 0.5, { beam = false, y = 0 } = {}) {
    const c = colorOf(color);
    const m = new THREE.Matrix4().makeScale(radius, height, radius).setPosition(0, y, 0);
    return this._add({ kind: 'column', batch: 'column', anchor, m, data: new Float32Array([c.r, c.g, c.b, alpha, beam ? 1 : 0, color === 'rainbow' ? 1 : 0, 0, 0]) });
  }

  /** Flat soil glow. kind: 'radial' | 'ring' | 'rainbow' | 'void'. pulse = scale wobble amount. */
  ground(anchor, kind, color, size, opacity = 0.6, { y = 0, pulse = 0, phase = 0 } = {}) {
    const k = { radial: 0, ring: 1, rainbow: 2, void: 3 }[kind] ?? 0;
    const it = this._add({ kind: 'ground', batch: k === 3 ? 'groundDark' : 'ground', anchor, m: new THREE.Matrix4(), data: new Float32Array(8) });
    it.data.set([0, 0, 0, 0, k, pulse, phase, k === 2 ? 0 : 1], 0);
    this.setGround(it, color, size, opacity, y);
    return it;
  }

  setGround(it, color, size, opacity, y = it.m.elements[13]) {
    const c = colorOf(color);
    it.data[0] = c.r;
    it.data[1] = c.g;
    it.data[2] = c.b;
    it.data[3] = opacity;
    it.m.makeScale(size, 1, size).setPosition(0, y, 0);
  }

  /** Camera-facing glow. tex: 'radial' | 'halo' (hollow centre). */
  halo(anchor, color, size, opacity = 0.8, tex = 'radial', p = [0, 0, 0]) {
    const c = colorOf(color);
    const m = new THREE.Matrix4().makeScale(size, size, size).setPosition(p[0], p[1], p[2]);
    return this._add({ kind: 'halo', batch: 'halo', anchor, m, data: new Float32Array([c.r, c.g, c.b, opacity, tex === 'halo' ? 1 : 0, 0, 0, 0]) });
  }

  /** The secret-rarity golden crown, bobbing and spinning above the anchor. */
  crown(anchor, y, scale, { bob = 0.12, bobSpeed = 1.6, spin = 0.9, phase = 0 } = {}) {
    return this._add({ kind: 'crown', batch: 'crown', anchor, y, scale, bob, bobSpeed, spin, phase });
  }
}

// ------------------------------------------------------------------ crown

let crownT = null;
export function crownTemplate() {
  if (crownT) return crownT;
  const b = new Builder({ mutation: 'gold' });
  const gold = '#ffd84a';
  b.add(P.cyl(1, 0.92, 10, true), { p: [0, 0, 0], s: [0.34, 0.2, 0.34], c: gold });
  b.add(P.torus(0.22, 4, 12), { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0], s: 0.33, c: gold });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.sin(a) * 0.3, z = Math.cos(a) * 0.3;
    b.add(P.cone(5), { p: [x, 0.16, z], s: [0.1, 0.26, 0.1], c: gold });
    b.add(P.oct(), { p: [x, 0.45, z], s: 0.065, c: '#ffffff', keep: true, glow: 0.6 });
    b.add(P.oct(), { p: [Math.sin(a + 0.63) * 0.35, 0.09, Math.cos(a + 0.63) * 0.35], s: [0.05, 0.065, 0.05], c: i % 2 ? '#ff3f6e' : '#3fa9ff', keep: true, glow: 0.5 });
  }
  crownT = b.finish();
  return crownT;
}

