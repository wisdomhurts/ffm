// Treadmill models shared by the Speed Shop and the home treadmill (Base Lv 6). OWNER: speed-shop agent.
// Contract:
//   createTreadmill({tier, len, w, quality}) -> {object3d, setTier(tier), update(dt, t, {running}), dispose()}
//       Built along +Z: the console end at +Z*len/2 (where you run to), the belt's open end at -Z*len/2.
//       The belt covers exactly w x len (x within +-w/2) with its top at y = TREADMILL.beltTop. Around it: foot
//       rails and deck sides out to x = +-(w/2 + 0.3) (the Rocket's boosters out to +-(w/2 + 0.95)), the console
//       (motor hood + uprights + screen) from z = len/2 to len/2 + 1.1, at most 4.6 tall.
//       tier = index into TREADMILL.tiers (basic, turbo, rocket, hyper, galaxy): fancier per tier.
//       update(): scrolls the belt towards -Z (always slowly; at TREADMILL.beltSpeed and glowing while running).
//       Two draw calls per treadmill: the body (one material shared by every treadmill) and the belt + neon.
// Also used by world/shops.js for the Speed Shop stations: beltFxMaterial, FxBuilder, beltSurface, BELT_STRIP.
import * as THREE from 'three';
import { Merger, drawTexture, chunkyText, trs } from './kit.js';
import { TREADMILL } from '../config.js';

// ------------------------------------------------------------------ belt atlas
// One 2048x256 canvas: eight belt designs side by side (240 px each, one tile = 256 px along the belt), then a
// white column the neon parts sample (their colour comes from the vertex colours).
const STRIP_W = 240;
const ATLAS_W = 2048;
const ATLAS_H = 256;
/** Strip index of each belt design in the atlas. */
export const BELT_STRIP = { basic: 0, turbo: 1, rocket: 2, hyper: 3, galaxy: 4, boost: 5, speed: 6, warmup: 7 };
/** Studs of belt per texture tile (the strip's width maps onto a 2.9-stud belt). */
export const BELT_TILE = (ATLAS_H / STRIP_W) * 2.9;
const WHITE_U = (8 * STRIP_W + (ATLAS_W - 8 * STRIP_W) / 2) / ATLAS_W;

// Canvas y grows down; the top of the canvas faces the console (the way you run).
function chevron(g, cx, cy, s, fill, stroke, lw = 6) {
  g.beginPath();
  g.moveTo(cx, cy - s * 0.55);
  g.lineTo(cx + s, cy + s * 0.45);
  g.lineTo(cx + s * 0.55, cy + s * 0.45);
  g.lineTo(cx, cy - s * 0.02);
  g.lineTo(cx - s * 0.55, cy + s * 0.45);
  g.lineTo(cx - s, cy + s * 0.45);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.strokeStyle = stroke;
    g.stroke();
  }
}

export function lightning(g, cx, cy, s, fill, stroke) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(8, -40);
  g.lineTo(-20, 6);
  g.lineTo(-2, 6);
  g.lineTo(-10, 40);
  g.lineTo(20, -10);
  g.lineTo(2, -10);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 5 / s;
  g.lineJoin = 'round';
  g.strokeStyle = stroke;
  g.stroke();
  g.restore();
}

export function heart(g, cx, cy, s, fill, stroke) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 14);
  g.bezierCurveTo(-26, -4, -20, -26, -8, -26);
  g.bezierCurveTo(-2, -26, 0, -20, 0, -16);
  g.bezierCurveTo(0, -20, 2, -26, 8, -26);
  g.bezierCurveTo(20, -26, 26, -4, 0, 14);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = 4 / s;
    g.strokeStyle = stroke;
    g.stroke();
  }
  g.restore();
}

function star(g, cx, cy, r, fill) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function paintStrip(g, id, rand) {
  const W = STRIP_W, H = ATLAS_H;
  const base = { basic: '#30343d', turbo: '#24272d', rocket: '#2e2622', hyper: '#1f1128', galaxy: '#1a1242', boost: '#1d1936', speed: '#2c2721', warmup: '#261a2c' }[id];
  const slat = { basic: '#3c414c', turbo: '#2f333a', rocket: '#3a302a', hyper: '#2b1838', galaxy: '#221850', boost: '#282248', speed: '#38322a', warmup: '#33233a' }[id];
  const edge = { basic: '#3ff0ff', turbo: '#4cd964', rocket: '#ffb020', hyper: '#ff4fd8', galaxy: '#ffd23f', boost: '#7fb8ff', speed: '#ffcf33', warmup: '#3ff0ff' }[id];
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  if (id === 'galaxy') {
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#140c34');
    gr.addColorStop(0.5, '#2a1a66');
    gr.addColorStop(1, '#140c34');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // nebula puffs (wrapped so the tile repeats)
    for (let i = 0; i < 9; i++) {
      const x = 30 + rand() * (W - 60), y = rand() * H, r = 30 + rand() * 40;
      const col = ['rgba(255,79,216,0.20)', 'rgba(90,160,255,0.20)', 'rgba(179,107,255,0.24)'][i % 3];
      for (const oy of [-H, 0, H]) {
        const rg = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
        rg.addColorStop(0, col);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(x - r, y + oy - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 70; i++) {
      const x = 14 + rand() * (W - 28), y = rand() * H, s = rand();
      g.fillStyle = s > 0.85 ? '#ffe98a' : s > 0.6 ? '#bfe0ff' : '#ffffff';
      for (const oy of [-H, 0, H]) g.fillRect(x, y + oy, s > 0.8 ? 3 : 2, s > 0.8 ? 3 : 2);
    }
    for (let i = 0; i < 4; i++) {
      const x = 40 + rand() * (W - 80), y = 20 + i * 64 + rand() * 20;
      star(g, x, y, 11, i % 2 ? '#ffe98a' : '#ffffff');
    }
  } else {
    // rubber treads: they are what you see moving
    g.fillStyle = slat;
    for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 5);
  }
  // side bands + a bright edge line
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 12, H);
  g.fillRect(W - 12, 0, 12, H);
  g.fillStyle = edge;
  g.fillRect(12, 0, 5, H);
  g.fillRect(W - 17, 0, 5, H);
  const cx = W / 2;
  switch (id) {
    case 'basic':
      chevron(g, cx, 70, 46, '#e9edf3', null);
      chevron(g, cx, 196, 46, '#e9edf3', null);
      break;
    case 'turbo':
      for (const sx of [cx - 50, cx + 50]) {
        g.fillStyle = '#4cd964';
        g.fillRect(sx - 14, 0, 28, H);
        g.fillStyle = '#ffffff';
        g.fillRect(sx - 20, 0, 4, H);
        g.fillRect(sx + 16, 0, 4, H);
      }
      chevron(g, cx, 128, 30, '#ffffff', null);
      break;
    case 'rocket':
      for (const y of [64, 192]) {
        chevron(g, cx, y + 8, 60, '#ff5a1a', null);
        chevron(g, cx, y + 2, 40, '#ffd23f', null);
      }
      break;
    case 'hyper':
      for (const y of [40, 104, 168, 232]) chevron(g, cx, y, 40, 'rgba(0,0,0,0)', '#ff4fd8', 9);
      for (const y of [40, 104, 168, 232]) chevron(g, cx, y, 40, 'rgba(0,0,0,0)', '#ffd6f6', 3);
      break;
    case 'galaxy':
      chevron(g, cx, 128, 36, 'rgba(255,233,138,0.9)', null);
      break;
    case 'boost':
      chevron(g, cx, 44, 56, '#8a5bff', '#c9b3ff', 4);
      lightning(g, cx, 160, 1.45, '#5fd0ff', '#ffffff');
      break;
    case 'speed':
      for (const y of [30, 94, 158, 222]) chevron(g, cx, y, 48, y % 128 < 64 ? '#ffcf33' : '#ff8a1a', null);
      break;
    case 'warmup':
      chevron(g, cx, 52, 58, '#3ff0ff', '#ffffff', 5);
      chunkyText(g, 'RUN!', cx, 170, { size: 92, fill: '#ff4fd8', stroke: '#ffffff', strokeW: 12, maxW: W - 50, shadow: false });
      break;
  }
}

let atlas = null;
function beltAtlas() {
  if (atlas) return atlas;
  atlas = drawTexture(ATLAS_W, ATLAS_H, (g) => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, ATLAS_W, ATLAS_H);
    for (const [id, k] of Object.entries(BELT_STRIP)) {
      g.save();
      g.translate(k * STRIP_W, 0);
      g.beginPath();
      g.rect(0, 0, STRIP_W, ATLAS_H);
      g.clip();
      paintStrip(g, id, rand);
      g.restore();
    }
  });
  return atlas;
}

// ------------------------------------------------------------------ belt + neon material
// Vertex attributes: aBelt = which belt (uniform slot), aFx = 0 belt (scrolls, its paint glows while running),
// 1 neon (always glows, brighter while running), 2 flame (neon that flickers; uv.y = 0 at the base, 1 at the tip).
const MAX_BELTS = 4;
/** Lit material for belts and neon trims. n (<= 4) = number of independently driven belts. All share one program. */
export function beltFxMaterial(n = 1) {
  if (n > MAX_BELTS) throw new Error('beltFxMaterial: at most ' + MAX_BELTS + ' belts');
  const mat = new THREE.MeshLambertMaterial({ map: beltAtlas(), vertexColors: true });
  const uniforms = {
    uOff: { value: new Float32Array(MAX_BELTS) },
    uGlow: { value: new Float32Array(MAX_BELTS).fill(0.1) },
    uT: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aBelt; attribute float aFx;
        uniform float uOff[${MAX_BELTS}]; uniform float uGlow[${MAX_BELTS}]; uniform float uT;
        varying float vEmit;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          int bi = int(aBelt + 0.5);
          float g = uGlow[bi];
          if (aFx < 0.5) {
            vMapUv.y += uOff[bi];
            vEmit = 0.06 + 1.05 * g;
          } else {
            vMapUv = vec2(${WHITE_U.toFixed(6)}, 0.5);
            vEmit = 0.3 + 0.9 * g;
            if (aFx > 1.5) {
              float f = 0.78 + 0.16 * sin(uT * 31.0 + aBelt * 2.1 + position.x * 4.0) + 0.1 * sin(uT * 17.0 + position.y * 5.0);
              transformed.z -= uv.y * (f * (0.75 + 0.5 * g) - 1.0) * 0.9;
              vEmit = 0.6;
            }
          }
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * vEmit;');
  };
  mat.customProgramCacheKey = () => 'belt-fx';
  return mat;
}

// ------------------------------------------------------------------ geometry helpers

/**
 * Collects geometry for one belt+neon mesh: belt surfaces (fx 0), neon parts (fx 1), flames (fx 2), each tagged
 * with the belt slot that drives it. merger(belt, fx) returns a Merger whose parts join the mesh.
 */
export class FxBuilder {
  constructor() {
    this.groups = [];
  }
  merger(belt = 0, fx = 1) {
    const m = new Merger(fx === 2 ? { uv: 'geo' } : { uv: 'flat', flatUV: [WHITE_U, 0.5] });
    this.groups.push({ m, belt, fx });
    return m;
  }
  geometry(geo, belt = 0, fx = 0) {
    this.groups.push({ geo, belt, fx });
    return this;
  }
  buildGeometry() {
    const geos = [];
    for (const gr of this.groups) {
      const geo = gr.geo || (gr.m.count ? gr.m.buildGeometry() : null);
      if (geo) geos.push({ geo, belt: gr.belt, fx: gr.fx });
    }
    let nv = 0, ni = 0;
    for (const { geo } of geos) {
      nv += geo.attributes.position.count;
      ni += geo.index.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const aBelt = new Float32Array(nv), aFx = new Float32Array(nv);
    const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, i = 0;
    for (const { geo, belt, fx } of geos) {
      const n = geo.attributes.position.count;
      pos.set(geo.attributes.position.array, v * 3);
      nor.set(geo.attributes.normal.array, v * 3);
      uv.set(geo.attributes.uv.array, v * 2);
      if (geo.attributes.color) col.set(geo.attributes.color.array, v * 3);
      else col.fill(1, v * 3, (v + n) * 3);
      aBelt.fill(belt, v, v + n);
      aFx.fill(fx, v, v + n);
      const I = geo.index.array;
      for (let k = 0; k < I.length; k++) index[i + k] = I[k] + v;
      v += n;
      i += I.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aBelt', new THREE.BufferAttribute(aBelt, 1));
    g.setAttribute('aFx', new THREE.BufferAttribute(aFx, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * A belt surface in treadmill space: flat top at y from the console end (z = +len/2) to the open end, where it
 * wraps down around a roller. Painted with atlas strip `strip`. Pass `matrix` to place it (e.g. in the shop).
 */
export function beltSurface({ len = 6.4, w = 2.9, y = TREADMILL.beltTop + 0.01, strip = 0, r = 0.26, matrix = null } = {}) {
  const u0 = (strip * STRIP_W + 3) / ATLAS_W, u1 = ((strip + 1) * STRIP_W - 3) / ATLAS_W;
  const zA = -len / 2 + r; // where the top meets the roller
  const rows = [[len / 2, y, 0, 1, 0, len / 2]]; // z, y, normal y/z, v-distance
  const SEG = 5;
  for (let k = 1; k <= SEG; k++) {
    const a = (k / SEG) * Math.PI * 0.8;
    rows.unshift([zA - r * Math.sin(a), y - r + r * Math.cos(a), 0, Math.cos(a), -Math.sin(a), zA - r * a]);
  }
  rows.splice(SEG, 0, [zA, y, 0, 1, 0, zA]);
  const n = rows.length;
  const pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  rows.forEach(([z, yy, , ny, nz, s], k) => {
    for (let side = 0; side < 2; side++) {
      const j = k * 2 + side;
      pos.set([side ? w / 2 : -w / 2, yy, z], j * 3);
      nor.set([0, ny, nz], j * 3);
      uv.set([side ? u0 : u1, s / BELT_TILE], j * 2);
    }
  });
  const idx = [];
  for (let k = 0; k < n - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  if (matrix) g.applyMatrix4(matrix);
  return g;
}

/** Scroll state for one belt slot of a beltFxMaterial: call step(dt) every frame. */
export function beltDriver(mat, slot = 0) {
  const U = mat.userData.uniforms;
  let speed = TREADMILL.beltSpeed * 0.25, glow = 0.1;
  return {
    running: false,
    step(dt) {
      const k = Math.min(1, dt * 5);
      speed += ((this.running ? TREADMILL.beltSpeed : TREADMILL.beltSpeed * 0.25) - speed) * k;
      glow += ((this.running ? 1 : 0.1) - glow) * k;
      U.uOff.value[slot] = (U.uOff.value[slot] + (dt * speed) / BELT_TILE) % 1;
      U.uGlow.value[slot] = glow;
    },
  };
}

// ------------------------------------------------------------------ the five tiers

const LOOKS = [
  { id: 'basic', body: '#aab3c2', dark: '#4a5260', rail: '#e6eaf0', trim: '#3ff0ff', screen: '#3ff0ff', screenBg: '#123a48' },
  { id: 'turbo', body: '#2fbf57', dark: '#1d2621', rail: '#f4f4f4', trim: '#ffffff', screen: '#9dff5c', screenBg: '#123a1c' },
  { id: 'rocket', body: '#ff8a1a', dark: '#5a2c16', rail: '#f4f4f4', trim: '#ff3a3a', screen: '#ffd23f', screenBg: '#4a2410' },
  { id: 'hyper', body: '#34204e', dark: '#170b26', rail: '#ff7ae0', trim: '#ff4fd8', screen: '#ff7ae0', screenBg: '#3a0f38' },
  { id: 'galaxy', body: '#5a34b8', dark: '#26145a', rail: '#ffd23f', trim: '#ffd23f', screen: '#c79bff', screenBg: '#221048' },
];

// ------------------------------------------------------------------ extruded icons (lightning bolt, heart)

/** A chunky lightning bolt, about 1.33 tall, centred, extruded `depth` along Z. */
export function boltGeometry(depth = 0.3) {
  const sh = new THREE.Shape();
  const P = [[8, -40], [-20, 6], [-2, 6], [-10, 40], [20, -10], [2, -10]];
  P.forEach(([x, y], i) => (i ? sh.lineTo(x / 60, -y / 60) : sh.moveTo(x / 60, -y / 60)));
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

/** A chunky heart, about 1.35 wide, centred, extruded `depth` along Z. */
export function heartGeometry(depth = 0.3) {
  const k = 1 / 30;
  const sh = new THREE.Shape();
  sh.moveTo(0, -14 * k);
  sh.bezierCurveTo(-26 * k, 4 * k, -20 * k, 26 * k, -8 * k, 26 * k);
  sh.bezierCurveTo(-2 * k, 26 * k, 0, 20 * k, 0, 16 * k);
  sh.bezierCurveTo(0, 20 * k, 2 * k, 26 * k, 8 * k, 26 * k);
  sh.bezierCurveTo(20 * k, 26 * k, 26 * k, 4 * k, 0, -14 * k);
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 8 }).translate(0, -6 * k, -depth / 2);
}

const GEO = new Map();
let bodyMat = null;

function buildTier(tier, len, w) {
  const L = LOOKS[tier];
  const T = TREADMILL.beltTop;
  const hw = w / 2, L2 = len / 2, dw = hw + 0.3; // belt half width, half length, deck half width
  const body = new Merger();
  const fx = new FxBuilder();
  const neon = fx.merger(0, 1);
  // ---- deck: plinth, body, chunky foot rails with rounded ends at the open end
  body.block(0, 0, 0.1, dw * 2, T - 0.04, len - 0.2, L.body, { ao: 0.35 });
  body.block(0, 0, 0.55, dw * 2 + 0.1, 0.14, len + 1.2, L.dark, { ao: 0 });
  for (const s of [-1, 1]) {
    body.block(s * (hw + 0.15), T - 0.08, 0.05, 0.32, 0.24, len - 0.1, L.rail, { ao: 0.1 });
    body.prim('cyl:12', s * (hw + 0.15), T - 0.25, -L2 + 0.26, 0.52, 0.34, 0.52, L.trim, { rz: Math.PI / 2, ao: 0 });
  }
  // ---- motor hood + console
  const zc = L2 + 0.55;
  body.block(0, 0, zc, dw * 2, 1.0, 1.1, L.body, { ao: 0.3 });
  body.box(0, 1.0, zc + 0.05, dw * 2 - 0.3, 0.1, 0.8, L.dark, { ao: 0 });
  for (const s of [-1, 1]) body.beam(s * (hw + 0.02), 0.95, L2 + 0.5, s * (hw - 0.12), 3.4, L2 + 0.7, 0.44, L.body, { ao: 0.15 });
  const hy = 3.55, hz = L2 + 0.72, headRx = 0.55; // head: its -Z face (the screen) tilts up towards the runner
  const tilt = (dy, dz) => [hy + dy * Math.cos(headRx) - dz * Math.sin(headRx), hz + dy * Math.sin(headRx) + dz * Math.cos(headRx)];
  body.box(0, hy, hz, w + 0.55, 0.98, 0.72, L.body, { rx: headRx, ao: 0.05 });
  {
    const [iy, iz] = tilt(0, -0.06); // dark bezel, only on the screen side
    body.box(0, iy, iz, w + 0.25, 0.72, 0.7, L.dark, { rx: headRx, ao: 0 });
    const [by, bz] = tilt(0.05, 0.365); // trim stripe on the back
    body.box(0, by, bz, w + 0.1, 0.16, 0.02, L.trim, { rx: headRx, ao: 0 });
  }
  const scr = (dx, dy, ww, hh, color, d = 0.4) => {
    const [yy, zz] = tilt(dy, -d);
    neon.box(dx, yy, zz, ww, hh, 0.02, color, { rx: headRx, ao: 0 });
  };
  // screen: speed bars and a pulse line
  scr(0, 0, w - 0.1, 0.56, L.screenBg, 0.395);
  for (let k = 0; k < 5; k++) scr(-0.95 + k * 0.24, -0.2 + (0.05 + k * 0.05), 0.15, 0.1 + k * 0.1, L.screen);
  scr(0.6, 0.08, 0.8, 0.09, L.screen);
  scr(0.6, -0.12, 0.55, 0.07, L.trim === '#ffffff' ? L.screen : L.trim);
  // low side rails (under a runner's arms) with foam grips, and a power light on the hood
  for (const s of [-1, 1]) {
    const rx = s * (hw + 0.17);
    body.beam(rx, 1.95, L2 + 0.55, rx, 1.95, L2 - 2.2, 0.2, L.rail, { prim: 'cyl:8', ao: 0 });
    body.beam(rx, 0.6, L2 - 2.15, rx, 1.95, L2 - 2.15, 0.16, L.rail, { prim: 'cyl:8', ao: 0 });
    body.beam(rx, 1.95, L2 - 0.6, rx, 1.95, L2 - 1.9, 0.3, L.trim === '#ffffff' ? L.dark : L.trim, { prim: 'cyl:8', ao: 0 });
  }
  neon.prim('sphere:8', 0, 1.02, L2 + 0.95, 0.26, 0.14, 0.26, L.screen, { ao: 0 });

  switch (L.id) {
    case 'basic':
      for (const s of [-1, 1]) neon.box(s * (dw + 0.005), 0.3, 0.1, 0.02, 0.08, len - 0.6, '#3ff0ff', { ao: 0 });
      break;
    case 'turbo':
      // racing stripes over the deck sides, the hood and the head, a rear wing on the console
      for (const s of [-1, 1]) {
        body.box(s * (dw + 0.01), 0.32, 0.4, 0.02, 0.1, len - 0.8, '#ffffff', { ao: 0 });
        body.box(s * (dw + 0.01), 0.17, 0.4, 0.02, 0.06, len - 0.8, '#ffffff', { ao: 0 });
        body.box(s * 0.3, 1.02, zc + 0.05, 0.2, 0.04, 1.1, '#ffffff', { ao: 0 });
        body.block(s * 0.95, 3.95, hz + 0.25, 0.14, 0.4, 0.14, L.dark);
        neon.box(s * (dw + 0.005), 0.245, 0.4, 0.015, 0.035, len - 0.8, '#9dff5c', { ao: 0 });
      }
      body.box(0, 4.42, hz + 0.3, w + 0.5, 0.12, 0.6, L.body, { rx: 0.12, ao: 0 });
      body.box(0, 4.43, hz + 0.3, 0.5, 0.13, 0.62, '#ffffff', { rx: 0.12, ao: 0 });
      for (const s of [-1, 1]) body.box(s * (w / 2 + 0.28), 4.35, hz + 0.3, 0.08, 0.38, 0.66, '#ffffff', { ao: 0 });
      break;
    case 'rocket': {
      // twin side boosters, nose cones towards the console, flames out of the open end
      const bx = dw + 0.45, by = 0.62, br = 0.42, z0 = -L2 - 0.1, z1 = 0.9;
      const flame = fx.merger(0, 2);
      const fcone = new THREE.ConeGeometry(0.5, 1, 10, 1, true);
      for (const s of [-1, 1]) {
        body.beam(s * bx, by, z0, s * bx, by, z1, br * 2, '#f4f4f4', { prim: 'cyl:12', ao: 0.15 });
        body.beam(s * bx, by, z0 + 0.5, s * bx, by, z0 + 0.95, br * 2 + 0.06, '#ff5a1a', { prim: 'cyl:12', ao: 0 });
        body.beam(s * bx, by, z1 - 0.9, s * bx, by, z1 - 0.6, br * 2 + 0.06, '#ff5a1a', { prim: 'cyl:12', ao: 0 });
        body.add('cone:12', trs(s * bx, by, z1 + 0.55, br * 2, 1.1, br * 2, Math.PI / 2, 0, 0), '#ff3a3a', { ao: 0 });
        body.add('frustum:10', trs(s * bx, by, z0 - 0.18, br * 1.7, 0.4, br * 1.7, Math.PI / 2, 0, 0), '#3a3f4a', { ao: 0 });
        body.box(s * (bx + 0.5), by, z0 + 0.35, 0.4, 0.08, 0.8, '#ff3a3a', { ao: 0 }); // fins
        body.box(s * bx, by + 0.52, z0 + 0.35, 0.08, 0.4, 0.8, '#ff3a3a', { ao: 0 });
        neon.prim('sphere:8', s * (bx + 0.001), by + 0.1, z1 - 1.6, 0.3, 0.3, 0.3, '#7fe8ff', { ao: 0 }); // porthole
        body.block(s * (dw + 0.15), 0.15, z0 + 1.6, 0.3, 0.35, 0.5, L.dark, { ao: 0 });
        body.block(s * (dw + 0.15), 0.15, z1 - 0.5, 0.3, 0.35, 0.5, L.dark, { ao: 0 });
        // flames: a bright puff at the nozzle, a yellow-to-red cone and three petals, pointing -Z (the tips
        // flicker in the shader)
        const fz = z0 - 0.38;
        neon.prim('sphere:10', s * bx, by, fz - 0.05, br * 1.5, br * 1.5, 0.5, '#ffd65a', { ao: 0 });
        flame.add(fcone, trs(s * bx, by, fz - 0.55, br * 1.45, 1.3, br * 1.45, -Math.PI / 2, 0, 0), '#ffc02a', { top: '#ff3a10', ao: 0 });
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.5;
          const ox = Math.cos(a) * 0.2, oy = Math.sin(a) * 0.2;
          flame.add(fcone, trs(s * bx + ox, by + oy, fz - 0.38 - k * 0.06, 0.34, 0.7 + k * 0.12, 0.34, -Math.PI / 2 + oy * 0.8, -ox * 0.8, 0), '#ffb020', { top: '#ff4a10', ao: 0 });
        }
      }
      body.box(0, 1.02, zc + 0.05, 0.7, 0.04, 1.1, '#ffffff', { ao: 0 });
      body.add('cone:10', trs(0, 4.32, hz + 0.1, 0.36, 0.5, 0.36), '#ff3a3a', { ao: 0 });
      break;
    }
    case 'hyper':
      for (const s of [-1, 1]) {
        neon.box(s * (dw + 0.01), T - 0.12, 0.1, 0.05, 0.08, len - 0.2, '#ff4fd8', { ao: 0 });
        neon.box(s * (dw + 0.06), 0.1, 0.55, 0.05, 0.1, len + 1.2, '#ff4fd8', { ao: 0 });
        neon.beam(s * (hw + 0.17), 1.95, L2 + 0.55, s * (hw + 0.17), 1.95, L2 - 2.2, 0.22, '#ff7ae0', { prim: 'cyl:8', ao: 0 });
        neon.beam(s * (hw + 0.26), 1.0, L2 + 0.52, s * (hw + 0.12), 3.3, L2 + 0.72, 0.07, '#ff4fd8', { ao: 0 });
        // a neon lightning bolt on each deck side
        neon.add(boltGeometry(0.04), trs(s * (dw + 0.02), 0.27, 0.1, 0.34, 0.34, 0.34, 0, (s * Math.PI) / 2, 0), '#ffd6f6', { ao: 0 });
      }
      neon.box(0, 0.1, -L2 - 0.05, dw * 2 + 0.12, 0.1, 0.05, '#ff4fd8', { ao: 0 });
      neon.box(0, 0.1, L2 + 1.15, dw * 2 + 0.12, 0.1, 0.05, '#ff4fd8', { ao: 0 });
      neon.box(0, 1.02, zc - 0.5, dw * 2 - 0.2, 0.05, 0.08, '#ff4fd8', { ao: 0 });
      {
        const [yy, zz] = tilt(0.5, 0);
        neon.box(0, yy, zz, w + 0.6, 0.06, 0.76, '#ff4fd8', { rx: headRx, ao: 0 });
      }
      neon.add(heartGeometry(0.1), trs(0, 4.3, hz + 0.15, 0.36, 0.36, 0.36), '#ff4fd8', { ao: 0 });
      break;
    case 'galaxy': {
      for (const s of [-1, 1]) {
        body.box(s * (dw + 0.01), 0.25, 0.1, 0.02, 0.08, len - 0.2, '#ffd23f', { ao: 0 });
        for (let k = 0; k < 4; k++) neon.prim('octa', s * (dw + 0.02), 0.28, -L2 + 0.9 + k * 1.5, 0.05, 0.28, 0.28, k % 2 ? '#ffe98a' : '#ffffff', { rx: Math.PI / 4, ao: 0 });
      }
      // a ringed planet on top of the console and two little stars
      body.prim('sphere:16', 0, 4.28, hz + 0.08, 0.6, 0.6, 0.6, '#ff7ad9', { top: '#ffd0f0', ao: 0.2 });
      neon.add('torus:24', trs(0, 4.28, hz + 0.08, 1.4, 1.4, 0.5, Math.PI / 2 - 0.3, 0, 0.35), '#ffd23f', { ao: 0 });
      for (const s of [-1, 1]) neon.prim('octa', s * 1.25, 4.25, hz + 0.1, 0.24, 0.4, 0.24, '#ffe98a', { ry: 0.6, ao: 0 });
      break;
    }
  }
  // the belt surface itself
  fx.geometry(beltSurface({ len, w, strip: BELT_STRIP[L.id] }), 0, 0);
  return { body: body.buildGeometry(), fx: fx.buildGeometry() };
}

function tierGeometry(tier, len, w) {
  const key = `${tier}:${len}:${w}`;
  let g = GEO.get(key);
  if (!g) GEO.set(key, (g = buildTier(tier, len, w)));
  return g;
}

const clampTier = (t) => Math.max(0, Math.min(LOOKS.length - 1, t | 0));

export function createTreadmill({ tier = 0, len = 6.4, w = 2.9, quality = null } = {}) {
  bodyMat ||= new THREE.MeshLambertMaterial({ vertexColors: true });
  const fxMat = beltFxMaterial(1);
  const object3d = new THREE.Group();
  object3d.name = 'treadmill';
  let cur = clampTier(tier);
  const g = tierGeometry(cur, len, w);
  const body = new THREE.Mesh(g.body, bodyMat);
  body.castShadow = quality ? !!quality.shadows : true;
  body.receiveShadow = true;
  const fx = new THREE.Mesh(g.fx, fxMat);
  fx.receiveShadow = true;
  object3d.add(body, fx);
  const drive = beltDriver(fxMat, 0);
  return {
    object3d,
    get tier() {
      return cur;
    },
    setTier(t) {
      t = clampTier(t);
      if (t === cur) return;
      cur = t;
      const geo = tierGeometry(t, len, w);
      body.geometry = geo.body;
      fx.geometry = geo.fx;
    },
    update(dt, t, s) {
      drive.running = !!(s && s.running);
      drive.step(dt);
      fxMat.userData.uniforms.uT.value = t;
    },
    dispose() {
      fxMat.dispose();
    },
  };
}
