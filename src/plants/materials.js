// Shared uniforms, procedural textures and materials for all plant art.
// Every plant/seed/pod shares these (one program per variant), so 100+ plants cost a handful of materials.
import * as THREE from 'three';

// uTime drives every animated shader (rainbow hue, glow pulse, sparkles). bufH = drawing-buffer height for point sizes.
export const U = { time: { value: 0 }, bufH: { value: 900 } };
// Last camera position seen by a plant material (used to turn faces toward the viewer).
export const camPos = new THREE.Vector3(0, 30, -40);

const _buf = new THREE.Vector2();
export function captureCamera(renderer, scene, camera) {
  if (camera && camera.isPerspectiveCamera) {
    const e = camera.matrixWorld.elements;
    camPos.set(e[12], e[13], e[14]);
  }
  if (renderer) U.bufH.value = renderer.getDrawingBufferSize(_buf).y;
}

// ------------------------------------------------------------------ colour helpers

const _c = new THREE.Color();
export const col = (c) => (c && c.isColor ? c.clone() : new THREE.Color(c));
export function lumOf(c) {
  _c.copy(c).convertLinearToSRGB();
  return 0.299 * _c.r + 0.587 * _c.g + 0.114 * _c.b;
}
const RAMPS = {
  gold: ['#3a1d00', '#8a4f04', '#d08a10', '#f5b82a', '#ffe07a'].map((c) => new THREE.Color(c)),
  diamond: ['#0c3f66', '#1f93c8', '#56d2f5', '#9eeeff', '#e2fcff'].map((c) => new THREE.Color(c)),
};
// Maps a species colour onto the mutation palette by brightness, so shapes stay readable.
export function recolor(c, mutation) {
  const ramp = RAMPS[mutation];
  if (!ramp) return c;
  const l = 0.12 + 0.78 * Math.pow(lumOf(c), 0.9);
  const x = Math.min(0.999, l) * (ramp.length - 1);
  const i = Math.floor(x);
  return new THREE.Color().lerpColors(ramp[i], ramp[i + 1], x - i);
}
const _hsl = { h: 0, s: 0, l: 0 };
// Slight saturation boost so plants pop against the world under ACES tone mapping.
export function vivid(c, k = 1.18) {
  c.getHSL(_hsl);
  return c.setHSL(_hsl.h, Math.min(1, _hsl.s * k), _hsl.l);
}
export function mixCol(a, b, t) {
  return col(a).lerp(col(b), t);
}
export function shade(c, k) {
  const o = col(c);
  if (k >= 0) return o.lerp(new THREE.Color(1, 1, 1), k);
  return o.multiplyScalar(1 + k);
}

// ------------------------------------------------------------------ canvas textures

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const texCache = {};
const once = (k, f) => texCache[k] || (texCache[k] = f());

export const FACE = { happy: 0, grin: 1, wink: 2, joy: 3, cool: 4, sleepy: 5, fierce: 6, oh: 7, dad: 8, love: 9, star: 10, sneaky: 11 };
// 4x4 atlas of cute faces (128px cells); row 3 holds the family faces for the secret plants.
export function faceAtlas() {
  return once('face', () => {
    const c = canvas(512, 512);
    const g = c.getContext('2d');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const ink = '#2a1616';
    const eye = (x, y, rx = 11, ry = 14) => {
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x - rx * 0.32, y - ry * 0.38, rx * 0.42, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x + rx * 0.35, y + ry * 0.35, rx * 0.2, 0, Math.PI * 2);
      g.fill();
    };
    const blush = (x, y) => {
      g.fillStyle = 'rgba(255,105,140,0.55)';
      g.beginPath();
      g.ellipse(x - 38, y, 12, 7, 0, 0, Math.PI * 2);
      g.ellipse(x + 38, y, 12, 7, 0, 0, Math.PI * 2);
      g.fill();
    };
    const rr = (x, y, w, h, r) => {
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    const stroke = (w = 5) => {
      g.strokeStyle = ink;
      g.lineWidth = w;
      g.stroke();
    };
    const arcEye = (x, y, up = true) => {
      g.beginPath();
      if (up) g.arc(x, y + 5, 10, Math.PI * 1.15, Math.PI * 1.85);
      else g.arc(x, y - 5, 10, Math.PI * 0.15, Math.PI * 0.85);
      stroke(5.5);
    };
    const smile = (x, y, r = 12) => {
      g.beginPath();
      g.arc(x, y, r, Math.PI * 0.18, Math.PI * 0.82);
      stroke(5);
    };
    const openMouth = (x, y, r = 14, tongue = true) => {
      g.fillStyle = '#7a1f2b';
      g.beginPath();
      g.moveTo(x - r, y);
      g.arc(x, y, r, 0, Math.PI);
      g.closePath();
      g.fill();
      if (tongue) {
        g.fillStyle = '#ff7a93';
        g.beginPath();
        g.ellipse(x, y + r * 0.62, r * 0.55, r * 0.32, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.moveTo(x - r, y);
      g.arc(x, y, r, 0, Math.PI);
      g.closePath();
      stroke(3.5);
    };
    const cells = [
      (x, y) => { eye(x - 22, y - 8); eye(x + 22, y - 8); blush(x, y + 12); smile(x, y + 6); },
      (x, y) => { eye(x - 22, y - 10); eye(x + 22, y - 10); blush(x, y + 10); openMouth(x, y + 8); },
      (x, y) => {
        eye(x - 22, y - 8);
        arcEye(x + 22, y - 6);
        blush(x, y + 12);
        smile(x, y + 6);
        g.fillStyle = '#ff7a93';
        g.beginPath();
        g.ellipse(x + 5, y + 20, 6, 7, 0, 0, Math.PI * 2);
        g.fill();
      },
      (x, y) => { arcEye(x - 22, y - 8); arcEye(x + 22, y - 8); blush(x, y + 10); openMouth(x, y + 6, 13); },
      (x, y) => {
        g.fillStyle = '#141414';
        g.beginPath();
        rr(x - 44, y - 22, 38, 24, 9);
        rr(x + 6, y - 22, 38, 24, 9);
        g.fill();
        g.fillRect(x - 8, y - 18, 16, 5);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.moveTo(x - 36, y - 18); g.lineTo(x - 26, y - 18); g.lineTo(x - 34, y - 6); g.closePath();
        g.moveTo(x + 14, y - 18); g.lineTo(x + 24, y - 18); g.lineTo(x + 16, y - 6); g.closePath();
        g.fill();
        g.beginPath();
        g.moveTo(x - 10, y + 16);
        g.quadraticCurveTo(x + 6, y + 24, x + 16, y + 10);
        stroke(5);
      },
      (x, y) => { arcEye(x - 22, y - 6, false); arcEye(x + 22, y - 6, false); blush(x, y + 12); smile(x, y + 8, 8); },
      (x, y) => {
        g.beginPath(); g.moveTo(x - 36, y - 26); g.lineTo(x - 12, y - 18); stroke(6);
        g.beginPath(); g.moveTo(x + 36, y - 26); g.lineTo(x + 12, y - 18); stroke(6);
        eye(x - 22, y - 6, 9, 11); eye(x + 22, y - 6, 9, 11);
        g.fillStyle = '#fff';
        g.beginPath(); rr(x - 18, y + 8, 36, 14, 5); g.fill();
        g.beginPath(); rr(x - 18, y + 8, 36, 14, 5); stroke(3.5);
        g.beginPath(); g.moveTo(x - 6, y + 8); g.lineTo(x - 6, y + 22); g.moveTo(x + 6, y + 8); g.lineTo(x + 6, y + 22); stroke(2.5);
      },
      (x, y) => {
        eye(x - 22, y - 10, 12, 15); eye(x + 22, y - 10, 12, 15); blush(x, y + 12);
        g.fillStyle = '#7a1f2b'; g.beginPath(); g.ellipse(x, y + 16, 7, 8, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x, y + 16, 7, 8, 0, 0, Math.PI * 2); stroke(3.5);
      },
      // dad: happy eyes + bushy moustache
      (x, y) => {
        eye(x - 22, y - 12); eye(x + 22, y - 12); blush(x, y + 8);
        g.fillStyle = '#3a2a20';
        g.beginPath();
        g.ellipse(x - 13, y + 10, 15, 8, 0.25, 0, Math.PI * 2);
        g.ellipse(x + 13, y + 10, 15, 8, -0.25, 0, Math.PI * 2);
        g.fill();
        smile(x, y + 14, 9);
      },
      // love: heart eyes
      (x, y) => {
        const heart = (hx, hy, s) => {
          g.fillStyle = '#ff2f6d';
          g.beginPath();
          g.moveTo(hx, hy + s * 0.9);
          g.bezierCurveTo(hx - s * 1.4, hy - s * 0.1, hx - s * 0.7, hy - s * 1.2, hx, hy - s * 0.45);
          g.bezierCurveTo(hx + s * 0.7, hy - s * 1.2, hx + s * 1.4, hy - s * 0.1, hx, hy + s * 0.9);
          g.fill();
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(hx - s * 0.45, hy - s * 0.35, s * 0.2, 0, Math.PI * 2);
          g.fill();
        };
        heart(x - 22, y - 8, 14); heart(x + 22, y - 8, 14); blush(x, y + 12); openMouth(x, y + 8, 11);
      },
      // star: sparkly star eyes
      (x, y) => {
        const star = (sx, sy, r) => {
          g.fillStyle = '#ffd23f';
          g.strokeStyle = ink;
          g.lineWidth = 3;
          g.beginPath();
          for (let i = 0; i <= 10; i++) {
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const rr2 = i % 2 ? r * 0.45 : r;
            g.lineTo(sx + Math.cos(a) * rr2, sy + Math.sin(a) * rr2);
          }
          g.fill();
          g.stroke();
        };
        star(x - 22, y - 8, 16); star(x + 22, y - 8, 16); blush(x, y + 12); openMouth(x, y + 8, 12);
      },
      // sneaky: bandit mask
      (x, y) => {
        g.fillStyle = '#1b1b2a';
        g.beginPath();
        rr(x - 52, y - 26, 104, 30, 14);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(x - 22, y - 11, 11, 8, 0, 0, Math.PI * 2); g.ellipse(x + 22, y - 11, 11, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = ink;
        g.beginPath(); g.arc(x - 18, y - 10, 5, 0, Math.PI * 2); g.arc(x + 26, y - 10, 5, 0, Math.PI * 2); g.fill();
        g.beginPath();
        g.moveTo(x - 14, y + 16);
        g.quadraticCurveTo(x + 4, y + 26, x + 18, y + 12);
        stroke(5);
      },
    ];
    cells.forEach((f, i) => f((i % 4) * 128 + 64, Math.floor(i / 4) * 128 + 64));
    return tex(c);
  });
}

// Soft round glow (white; tinted by material colour).
export function radialTex() {
  return once('radial', () => {
    const c = canvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return tex(c, false);
  });
}

// Hollow halo: dim centre so the object inside keeps its colours, bright soft rim.
export function haloTex() {
  return once('halo', () => {
    const c = canvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.25)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return tex(c, false);
  });
}

// Glowing ring with a soft inner fill (for rarity rings on the soil).
export function ringTex() {
  return once('ring', () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.3)');
    gr.addColorStop(0.72, 'rgba(255,255,255,1)');
    gr.addColorStop(0.8, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.9, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return tex(c, false);
  });
}

// Dark radial pool (secret "void" under the plant).
export function voidTex() {
  return once('void', () => {
    const c = canvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(10,4,24,0.95)');
    gr.addColorStop(0.6, 'rgba(20,8,44,0.75)');
    gr.addColorStop(1, 'rgba(20,8,44,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return tex(c);
  });
}

// Galaxy petals: deep space gradient along the petal with nebula clouds and stars.
export function galaxyTex() {
  return once('galaxy', () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    const lin = g.createLinearGradient(0, S, 0, 0);
    lin.addColorStop(0, '#120a3a');
    lin.addColorStop(0.45, '#3a1a86');
    lin.addColorStop(0.8, '#7a2cb8');
    lin.addColorStop(1, '#ff66d9');
    g.fillStyle = lin;
    g.fillRect(0, 0, S, S);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.globalCompositeOperation = 'lighter';
    const blobs = ['rgba(255,102,217,0.35)', 'rgba(90,160,255,0.32)', 'rgba(170,90,255,0.35)', 'rgba(255,160,230,0.25)'];
    for (let i = 0; i < 12; i++) {
      const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, blobs[i % blobs.length]);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    }
    for (let i = 0; i < 140; i++) {
      const x = rnd() * S, y = rnd() * S, r = rnd() < 0.85 ? 0.6 + rnd() * 0.9 : 1.6 + rnd() * 1.2;
      g.fillStyle = `rgba(255,255,255,${0.55 + rnd() * 0.45})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (r > 1.8) {
        g.fillRect(x - r * 3, y - 0.5, r * 6, 1);
        g.fillRect(x - 0.5, y - r * 3, 1, r * 6);
      }
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// Tiny equirect sky used as the reflection for gold / diamond (auto-PMREM'd once by the renderer).
export function envTex() {
  return once('env', () => {
    const W = 256, H = 128;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const lin = g.createLinearGradient(0, 0, 0, H);
    lin.addColorStop(0, '#4f8fd8');
    lin.addColorStop(0.4, '#bfe2ff');
    lin.addColorStop(0.5, '#fff8e8');
    lin.addColorStop(0.56, '#8a7658');
    lin.addColorStop(1, '#2a2018');
    g.fillStyle = lin;
    g.fillRect(0, 0, W, H);
    const spot = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    spot(70, 30, 26, 1);
    spot(190, 44, 18, 0.9);
    spot(130, 20, 12, 0.8);
    const t = tex(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

// ------------------------------------------------------------------ plant materials

const GLSL_HUE = `
vec3 plantHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

// Adds per-vertex glow (aGlow), rainbow hue cycling, and a soft (or rainbow) rim light to a built-in material.
// All variants are expressed through defines (part of three's program key), so the patched programs are shared.
function patch(mat, { rainbow = false, rim = 0, rimRainbow = false, glowPulse = true } = {}) {
  mat.defines = mat.defines || {};
  if (rainbow) mat.defines.PLANT_RAINBOW = '';
  if (rim > 0 || rimRainbow) mat.defines.PLANT_RIM = rim.toFixed(3);
  if (rimRainbow) mat.defines.PLANT_RIM_RAINBOW = '';
  if (glowPulse) mat.defines.PLANT_PULSE = '';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vGlow;\nvarying vec3 vWPos;' + GLSL_HUE)
      .replace('#include <color_fragment>', `#include <color_fragment>
// aGlow >= 10 marks parts that keep their colour under the rainbow mutation (eyes, gems)
float plantKeep = step(9.5, vGlow);
float plantGlow = vGlow - plantKeep * 10.0;
#ifdef PLANT_RAINBOW
if (plantKeep < 0.5) {
  float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 rb = plantHue(fract(uTime * 0.22 + vWPos.y * 0.3 + (vWPos.x + vWPos.z) * 0.021));
  diffuseColor.rgb = rb * rb * (0.4 + 1.1 * sqrt(l));
}
#endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef PLANT_PULSE
totalEmissiveRadiance += diffuseColor.rgb * plantGlow * (0.8 + 0.2 * sin(uTime * 2.6 + vWPos.y * 1.7 + vWPos.x));
#else
totalEmissiveRadiance += diffuseColor.rgb * plantGlow;
#endif
#ifdef PLANT_RIM
{
  float ndv = abs(dot(normal, normalize(vViewPosition)));
  float rim = pow(1.0 - ndv, 3.0);
  #ifdef PLANT_RIM_RAINBOW
  totalEmissiveRadiance += plantHue(fract(uTime * 0.3 + vWPos.y * 0.2 + vWPos.x * 0.05)) * rim * 1.6;
  #else
  totalEmissiveRadiance += (diffuseColor.rgb * 0.7 + vec3(0.05)) * rim * PLANT_RIM;
  #endif
}
#endif`);
  };
  mat.customProgramCacheKey = () => 'plantPatch1';
  mat.onBeforeRender = captureCamera;
  return mat;
}

const matCache = new Map();
function cachedMat(key, make) {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

/**
 * kind: 'base' (vertex-coloured, lit), 'trans' (glassy bubbles), 'face' (decals), 'galaxy' (textured petals)
 * mutation: 'normal' | 'gold' | 'diamond' | 'rainbow'; secret adds a rainbow rim.
 */
export function plantMat(kind, mutation = 'normal', secret = false) {
  const key = kind === 'face' ? 'face' : `${kind}|${mutation}|${secret ? 1 : 0}`;
  return cachedMat(key, () => {
    const rimRainbow = secret;
    if (kind === 'face') {
      return patch(new THREE.MeshLambertMaterial({
        map: faceAtlas(), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      }), { glowPulse: false });
    }
    if (kind === 'galaxy') {
      return patch(new THREE.MeshLambertMaterial({
        map: galaxyTex(), emissiveMap: galaxyTex(), emissive: 0xffffff, emissiveIntensity: 0.75, side: THREE.DoubleSide,
      }), { rim: 0.6, rimRainbow });
    }
    if (kind === 'trans') {
      const m = new THREE.MeshPhongMaterial({
        vertexColors: true, transparent: true, opacity: 0.42, shininess: 140, specular: 0xffffff,
        depthWrite: false, side: THREE.FrontSide,
      });
      if (mutation === 'gold' || mutation === 'diamond') m.opacity = 0.6;
      return patch(m, { rainbow: mutation === 'rainbow', rim: 0, rimRainbow: true });
    }
    // base
    if (mutation === 'gold') {
      return patch(new THREE.MeshStandardMaterial({
        vertexColors: true, metalness: 0.95, roughness: 0.24, envMap: envTex(), envMapIntensity: 1.35,
        side: THREE.DoubleSide, emissive: 0x3a2400, emissiveIntensity: 0.35,
      }), { rim: 0.35, rimRainbow });
    }
    if (mutation === 'diamond') {
      return patch(new THREE.MeshStandardMaterial({
        vertexColors: true, metalness: 0.35, roughness: 0.05, envMap: envTex(), envMapIntensity: 1.4, flatShading: true,
        side: THREE.DoubleSide, emissive: 0x0b3a55, emissiveIntensity: 0.35,
      }), { rim: 0.8, rimRainbow });
    }
    return patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
      rainbow: mutation === 'rainbow', rim: mutation === 'rainbow' ? 0.4 : 0.28, rimRainbow,
    });
  });
}

// Plain unlit additive sprite/disc materials for halos and glows.
export function glowMat(color, { opacity = 1, texture = 'radial', blending = THREE.AdditiveBlending, sprite = false } = {}) {
  const c = col(color);
  const key = `glow|${c.getHexString()}|${opacity}|${texture}|${blending}|${sprite}`;
  return cachedMat(key, () => {
    const map = texture === 'ring' ? ringTex() : texture === 'void' ? voidTex() : texture === 'halo' ? haloTex() : radialTex();
    const o = { map, color: c, transparent: true, opacity, depthWrite: false, blending, toneMapped: false };
    return sprite ? new THREE.SpriteMaterial(o) : new THREE.MeshBasicMaterial({ ...o, side: THREE.DoubleSide });
  });
}
