// Cheap rarity / mutation effects: GPU-animated sparkles (THREE.Points), aura columns, loot beams, soil glows,
// and the secret crown. Everything is animated in shaders from one shared time uniform, so updates cost nothing.
import * as THREE from 'three';
import { U, col, glowMat, captureCamera } from './materials.js';
import { Builder, P, cachedGeo } from './geometry.js';

const HUE = 'vec3 fxHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }';
const matCache = new Map();
const cached = (k, f) => matCache.get(k) || (matCache.set(k, f()), matCache.get(k));

// ------------------------------------------------------------------ sparkles

const SPARK_VERT = `
uniform float uTime;
uniform float uBufH;
uniform float uSize;
uniform vec3 uColor;
attribute vec4 aSeed;
varying float vA;
varying vec3 vCol;
${HUE}
void main() {
  vec3 p = position;
  float a = 1.0;
  float sz = uSize * (0.6 + aSeed.w * 0.8);
#if defined(MODE_TWINKLE)
  float s = sin(uTime * (1.3 + aSeed.x * 1.7) + aSeed.y * 6.2831);
  a = pow(max(s, 0.0), 4.0);
  sz *= 0.25 + 0.75 * a;
#elif defined(MODE_ORBIT)
  float dir = aSeed.z > 0.5 ? 1.0 : -1.0;
  float ang = aSeed.y * 6.2831 + uTime * (0.45 + aSeed.x * 0.55) * dir;
  float r = p.x;
  p = vec3(cos(ang) * r, p.y + sin(uTime * 1.4 + aSeed.y * 6.2831) * 0.3, sin(ang) * r);
  a = 0.6 + 0.4 * sin(uTime * 4.0 + aSeed.y * 20.0);
#elif defined(MODE_RISE)
  float h = p.y;
  float y = mod(aSeed.z * h + uTime * (0.25 + aSeed.x * 0.35) * h * 0.35, h);
  float k = y / h;
  p = vec3(p.x * (1.0 + 0.4 * k) + sin(uTime * 1.7 + aSeed.y * 6.28) * 0.18, y, p.z * (1.0 + 0.4 * k) + cos(uTime * 1.3 + aSeed.y * 6.28) * 0.18);
  a = sin(3.14159 * k);
#endif
  vCol = uColor;
#ifdef RAINBOW
  vCol = mix(fxHue(fract(aSeed.y + uTime * 0.25)), vec3(1.0), 0.2);
#endif
  vA = a;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float scale = length(modelMatrix[0].xyz);
  gl_PointSize = a < 0.02 ? 0.0 : min(64.0, sz * scale * uBufH * 0.5 * projectionMatrix[1][1] / max(0.5, -mv.z));
}`;
const SPARK_FRAG = `
uniform float uIntensity;
varying float vA;
varying vec3 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
#ifdef STAR
  float core = exp(-d * d * 10.0);
  float cr = max(0.0, 1.0 - abs(q.x) * 6.0) * max(0.0, 1.0 - abs(q.y)) + max(0.0, 1.0 - abs(q.y) * 6.0) * max(0.0, 1.0 - abs(q.x));
  float i = core + cr * 0.9;
#else
  float i = exp(-d * d * 4.5) * (1.0 - smoothstep(0.85, 1.0, d));
#endif
  float alpha = min(1.0, i * vA * uIntensity);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vCol, alpha);
  #include <colorspace_fragment>
}`;

/** mode: 'twinkle' | 'orbit' | 'rise'. color hex or 'rainbow'. dark = normal blending (dark motes). */
export function sparkleMat(mode, color, { size = 0.35, star = true, intensity = 1, dark = false } = {}) {
  const rainbow = color === 'rainbow';
  const key = `spk|${mode}|${color}|${size}|${star}|${intensity}|${dark}`;
  return cached(key, () => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: U.time, uBufH: U.bufH, uSize: { value: size }, uColor: { value: col(rainbow ? '#ffffff' : color) }, uIntensity: { value: intensity } },
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      defines: { ['MODE_' + mode.toUpperCase()]: '', ...(star ? { STAR: '' } : {}), ...(rainbow ? { RAINBOW: '' } : {}) },
      transparent: true,
      depthWrite: false,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    m.onBeforeRender = captureCamera;
    return m;
  });
}

/**
 * Points layout (cached). For 'twinkle' points fill an ellipsoid (rx, h around y0..y0+h);
 * 'orbit' stores radius in x and height in y; 'rise' stores the start x/z and the max height in y.
 */
export function sparkleGeo(mode, count, rx, h, y0 = 0, seed = 1) {
  const key = `spg|${mode}|${count}|${rx.toFixed(2)}|${h.toFixed(2)}|${y0.toFixed(2)}|${seed}`;
  return cachedGeo(key, () => {
    let s = seed * 7919 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pos = new Float32Array(count * 3);
    const sd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      if (mode === 'twinkle') {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * rx;
        pos.set([Math.cos(a) * r, y0 + rnd() * h, Math.sin(a) * r], i * 3);
      } else if (mode === 'orbit') {
        pos.set([rx * (0.75 + rnd() * 0.45), y0 + rnd() * h, 0], i * 3);
      } else {
        const a = rnd() * Math.PI * 2, r = (0.3 + 0.7 * Math.sqrt(rnd())) * rx;
        pos.set([Math.cos(a) * r, h, Math.sin(a) * r], i * 3);
      }
      sd.set([rnd(), (i + rnd() * 0.8) / count, rnd(), rnd()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    const R = Math.max(rx * 1.4, h + y0) + 0.5;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, y0 + h / 2, 0), R);
    return g;
  });
}

export function sparkles(mode, color, count, rx, h, y0 = 0, opts = {}) {
  const pts = new THREE.Points(sparkleGeo(mode, count, rx, h, y0, opts.seed || 1), sparkleMat(mode, color, opts));
  pts.renderOrder = 4;
  return pts;
}

// ------------------------------------------------------------------ aura columns / loot beams

const AURA_VERT = `
varying vec2 vUv;
varying float vFres;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFres = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const AURA_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
varying float vFres;
${HUE}
void main() {
  float v = vUv.y;
#ifdef BEAM
  float fade = pow(1.0 - v, 1.3) * smoothstep(0.0, 0.03, v);
  float streak = 0.8 + 0.2 * sin(v * 18.0 - uTime * 4.0);
  float edge = pow(vFres, 2.2);
#else
  float fade = pow(1.0 - v, 1.5) * smoothstep(0.0, 0.1, v);
  float streak = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 4.0 + uTime * 1.6 - v * 7.0);
  float edge = pow(vFres, 1.4);
#endif
  vec3 c = uColor;
#ifdef RAINBOW
  c = mix(fxHue(fract(vUv.x * 2.0 + uTime * 0.2 + v * 0.6)), vec3(1.0), 0.15);
#endif
  float a = fade * streak * edge * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

export function auraMat(color, { beam = false, alpha = 0.5 } = {}) {
  const rainbow = color === 'rainbow';
  return cached(`aura|${color}|${beam}|${alpha}`, () => new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uAlpha: { value: alpha }, uColor: { value: col(rainbow ? '#ffffff' : color) } },
    vertexShader: AURA_VERT,
    fragmentShader: AURA_FRAG,
    defines: { ...(beam ? { BEAM: '' } : {}), ...(rainbow ? { RAINBOW: '' } : {}) },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }));
}

// Open cylinder, base at y=0, height 1, radius 1 (top slightly wider for auras).
function auraGeo(beam) {
  return cachedGeo(`auraGeo${beam}`, () => new THREE.CylinderGeometry(beam ? 1 : 1.25, 1, 1, 14, 1, true).translate(0, 0.5, 0));
}

export function aura(color, radius, height, alpha = 0.5) {
  const m = new THREE.Mesh(auraGeo(false), auraMat(color, { alpha }));
  m.scale.set(radius, height, radius);
  m.renderOrder = 5;
  return m;
}

export function beam(color, radius, height, alpha = 0.6) {
  const m = new THREE.Mesh(auraGeo(true), auraMat(color, { beam: true, alpha }));
  m.scale.set(radius, height, radius);
  m.renderOrder = 5;
  return m;
}

// ------------------------------------------------------------------ soil glows

const flatPlane = () => cachedGeo('flatPlane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

/** texture: 'radial' | 'ring' | 'void' */
export function groundGlow(color, size, { texture = 'radial', opacity = 0.6, dark = false } = {}) {
  const m = new THREE.Mesh(flatPlane(), glowMat(color, { texture, opacity, blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending }));
  m.scale.set(size, 1, size);
  m.renderOrder = 1;
  return m;
}

const RING_FRAG = `
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
${HUE}
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  float ang = atan(q.y, q.x) / 6.2831;
  float ring = exp(-pow((r - 0.8) / 0.07, 2.0));
  float fill = 0.18 * (1.0 - smoothstep(0.0, 0.85, r));
  vec3 c = mix(fxHue(fract(ang + uTime * 0.15)), vec3(1.0), 0.15);
  float a = (ring + fill) * uAlpha * (0.85 + 0.15 * sin(uTime * 3.0 + ang * 25.0));
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;
export function rainbowRing(size, alpha = 0.9) {
  const mat = cached(`rbring|${alpha}`, () => new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uAlpha: { value: alpha } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }));
  const m = new THREE.Mesh(flatPlane(), mat);
  m.scale.set(size, 1, size);
  m.renderOrder = 1;
  return m;
}

export function halo(color, size, opacity = 0.8, texture = 'radial') {
  const s = new THREE.Sprite(glowMat(color, { opacity, sprite: true, texture }));
  s.scale.set(size, size, 1);
  s.renderOrder = 4;
  return s;
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
