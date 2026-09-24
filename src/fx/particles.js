// Pooled, allocation-free particles drawn with two instanced draw calls:
//   SolidPool  - chunky lit shapes (coins, cubes, stars, leaves, confetti cards, hearts, puffs, droplets).
//                Every shape lives in one merged geometry; the vertex shader collapses the shapes an
//                instance doesn't use, so all solids share a single draw call.
//   SpritePool - quads from a procedural texture atlas (sparkles, glows, rings, beams, streaks, bursts),
//                camera-facing, ground-flat, axial (beams) or stretched along their velocity.
//                Premultiplied blending lets each sprite be anywhere between normal and additive.
// Simulation runs on the CPU in typed arrays (structure of arrays); dead particles are swap-removed so the
// live ones are always packed at the front and only that range is uploaded.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SHAPE = { cube: 0, coin: 1, star: 2, leaf: 3, card: 4, heart: 5, puff: 6 };
export const CELL = {
  sparkle: 0, glow: 1, ring: 2, streak: 3, beam: 4, swoosh: 5, burst: 6, puff: 7,
  star: 8, heart: 9, dot: 10, shock: 11, spark: 12, dollar: 13, tear: 14, bolt: 15,
};
export const MODE = { billboard: 0, flat: 1, axial: 2, stretch: 3 };
// size curves (solids) / alpha curves (sprites)
export const CURVE = { pop: 0, puff: 1, hold: 2, linear: 3, flash: 4 };
// behaviour flags
export const F = { home: 1, bounce: 2, flutter: 4, align: 8, floorKill: 16, twinkle: 32, grow: 64, velDir: 128 };

const _col = new THREE.Color();
const colorCache = new Map();
/** Any CSS colour / hex int -> packed linear RGB (cached so hot paths never parse strings). */
export function lin(c) {
  let v = colorCache.get(c);
  if (v === undefined) {
    _col.set(c);
    v = [_col.r, _col.g, _col.b];
    colorCache.set(c, v);
  }
  return v;
}

const TAU = Math.PI * 2;
const backOut = (x) => {
  const c1 = 2.2;
  const c3 = c1 + 1;
  const u = x - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
};

function sizeCurve(curve, t, age) {
  switch (curve) {
    case 1: { // puff: fast ease-out grow, long shrink
      const g = t < 0.3 ? 1 - (1 - t / 0.3) ** 3 : 1;
      const s = t > 0.45 ? 1 - ((t - 0.45) / 0.55) ** 1.6 : 1;
      return (0.35 + 0.65 * g) * s;
    }
    case 2: { // hold: quick pop, shrink in the last 15%
      const p = age < 0.1 ? backOut(age / 0.1) : 1;
      return t > 0.85 ? p * (1 - (t - 0.85) / 0.15) : p;
    }
    case 3:
      return 1 - t;
    case 4:
      return 1;
    default: { // pop: overshoot in, shrink out over the last 30%
      const p = age < 0.14 ? backOut(age / 0.14) : 1;
      return t > 0.7 ? p * (1 - ((t - 0.7) / 0.3) ** 1.5) : p;
    }
  }
}

// ------------------------------------------------------------------ shape geometry

function tagShape(geo, id, tint) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const shape = new Float32Array(n).fill(id);
  const t = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = tint ? tint(g.attributes.position, g.attributes.normal, i) : null;
    t[i * 3] = c ? c[0] : 1;
    t[i * 3 + 1] = c ? c[1] : 1;
    t[i * 3 + 2] = c ? c[2] : 1;
  }
  g.setAttribute('shape', new THREE.BufferAttribute(shape, 1));
  g.setAttribute('tint', new THREE.BufferAttribute(t, 3));
  g.deleteAttribute('uv');
  return g;
}

// A "puffy" flat shape: outline in the XY plane with a front and back apex (faceted gem look).
function puffyOutline(pts, depth) {
  const pos = [];
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= n;
  cy /= n;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    pos.push(a[0], a[1], 0, b[0], b[1], 0, cx, cy, depth);
    pos.push(b[0], b[1], 0, a[0], a[1], 0, cx, cy, -depth);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function buildShapes() {
  const list = [];
  // cube (dirt chunks, blocky bits)
  list[SHAPE.cube] = tagShape(new THREE.BoxGeometry(0.8, 0.8, 0.8), SHAPE.cube, (p, nrm, i) => {
    const ny = nrm.getY(i);
    return ny > 0.5 ? [1.08, 1.08, 1.08] : ny < -0.5 ? [0.7, 0.7, 0.7] : [0.92, 0.92, 0.92];
  });
  // coin: octagonal disc facing +-Z with a raised centre
  {
    const outer = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 10, 1).rotateX(Math.PI / 2);
    const inner = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10, 1).rotateX(Math.PI / 2);
    const edge = (_, nrm, i) => (Math.abs(nrm.getZ(i)) < 0.5 ? [0.82, 0.58, 0.3] : null);
    const o = tagShape(outer, SHAPE.coin, (p, nrm, i) => edge(p, nrm, i) || [0.92, 0.86, 0.8]);
    const c = tagShape(inner, SHAPE.coin, (p, nrm, i) => edge(p, nrm, i) || [1.12, 1.1, 1.0]);
    list[SHAPE.coin] = mergeGeometries([o, c]);
  }
  // star: 5-point gem
  {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i / 10) * TAU;
      const r = i % 2 ? 0.24 : 0.56;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    list[SHAPE.star] = tagShape(puffyOutline(pts, 0.22), SHAPE.star);
  }
  // leaf: pointed ellipse with a centre fold
  {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const x = Math.cos(a) * 0.55;
      const y = Math.sin(a) * 0.26 * (1 - Math.abs(Math.cos(a)) * 0.35);
      pts.push([x, y]);
    }
    list[SHAPE.leaf] = tagShape(puffyOutline(pts, 0.07), SHAPE.leaf, (p, nrm, i) => {
      const x = p.getX(i);
      return x < -0.4 ? [0.8, 0.9, 0.7] : null;
    });
  }
  // confetti card / paper bill: a single double-sided quad
  list[SHAPE.card] = tagShape(new THREE.PlaneGeometry(0.9, 0.55), SHAPE.card);
  // heart
  {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([x / 32, y / 32 + 0.05]);
    }
    pts.reverse();
    list[SHAPE.heart] = tagShape(puffyOutline(pts, 0.2), SHAPE.heart);
  }
  // puff: round cartoon cloud ball (also used, stretched, for water droplets)
  list[SHAPE.puff] = tagShape(new THREE.IcosahedronGeometry(0.5, 1), SHAPE.puff, (p, nrm, i) => {
    const ny = nrm.getY(i);
    const k = 0.86 + 0.18 * (ny * 0.5 + 0.5);
    return [k, k, k * 1.02];
  });
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'shape', 'tint'].includes(k)) g.deleteAttribute(k);
  }
  return mergeGeometries(list);
}

// ------------------------------------------------------------------ shaders

const SOLID_VS = /* glsl */ `
attribute float shape;
attribute vec3 tint;
attribute vec4 iPosScale;
attribute vec4 iAxisAngle;
attribute vec4 iColor;
attribute vec4 iShape;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vView;
varying float vEmis;
#include <fog_pars_vertex>
vec3 rotAA(vec3 v, vec3 a, float ang) {
  float c = cos(ang), s = sin(ang);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
void main() {
  if (abs(shape - iShape.x) > 0.5 || iPosScale.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 p = rotAA(position * iShape.yzw * iPosScale.w, iAxisAngle.xyz, iAxisAngle.w);
  vec3 n = rotAA(normal / iShape.yzw, iAxisAngle.xyz, iAxisAngle.w);
  vec3 wp = p + iPosScale.xyz;
  vNormal = normalize(n);
  vColor = iColor.rgb * tint;
  vEmis = iColor.a;
  vView = normalize(cameraPosition - wp);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SOLID_FS = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSky;
uniform vec3 uGround;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vView;
varying float vEmis;
#include <fog_pars_fragment>
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  float ndl = dot(N, uSunDir);
  float diff = 0.55 + 0.45 * smoothstep(-0.25, 0.65, ndl);
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 col = vColor * hemi * diff;
  vec3 H = normalize(uSunDir + vView);
  float spec = pow(max(dot(N, H), 0.0), 30.0) * 0.45;
  float rim = pow(1.0 - clamp(dot(N, vView), 0.0, 1.0), 3.0) * 0.25;
  col += vec3(spec) + vColor * rim;
  col = mix(col, vColor + spec, clamp(vEmis, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SPRITE_VS = /* glsl */ `
attribute vec4 iPosSize;
attribute vec4 iColor;
attribute vec4 iParams;
attribute vec4 iDir;
uniform float uCells;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  if (iColor.a <= 0.002 || iPosSize.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec2 c = position.xy;
  float s = iPosSize.w;
  float asp = iDir.w;
  float cr = cos(iParams.y), sr = sin(iParams.y);
  int mode = int(iParams.w + 0.5);
  vec4 mv;
  if (mode == 1) {
    vec3 n = normalize(iDir.xyz);
    vec3 ref = abs(n.y) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 t = normalize(cross(ref, n));
    vec3 b = cross(n, t);
    vec2 q = vec2(c.x, c.y);
    q = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr);
    mv = viewMatrix * vec4(iPosSize.xyz + (t * q.x + b * q.y) * s, 1.0);
  } else if (mode == 2) {
    vec3 up = normalize(iDir.xyz);
    vec3 side = normalize(cross(up, cameraPosition - iPosSize.xyz));
    mv = viewMatrix * vec4(iPosSize.xyz + side * c.x * s + up * (c.y + 0.5) * s * asp, 1.0);
  } else if (mode == 3) {
    vec3 dv = (viewMatrix * vec4(iDir.xyz, 0.0)).xyz;
    vec2 d2 = dv.xy;
    float l = length(d2);
    d2 = l > 1e-4 ? d2 / l : vec2(1.0, 0.0);
    vec2 perp = vec2(-d2.y, d2.x);
    mv = viewMatrix * vec4(iPosSize.xyz, 1.0);
    mv.xy += (d2 * c.x * asp + perp * c.y) * s;
  } else {
    vec2 q = vec2(c.x * asp, c.y);
    q = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr);
    mv = viewMatrix * vec4(iPosSize.xyz, 1.0);
    mv.xy += q * s;
  }
  gl_Position = projectionMatrix * mv;
  float col = mod(iParams.x, uCells);
  float row = floor(iParams.x / uCells);
  vec2 uv = position.xy + 0.5;
  vUv = vec2((col + uv.x) / uCells, (uCells - row - 1.0 + uv.y) / uCells);
  vColor = iColor;
  // fade sprites that get very close to the camera so they never blow out into huge white stars
  vColor.a *= smoothstep(1.5, 5.0, -mv.z);
  vAdd = iParams.z;
}`;

const SPRITE_FS = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  // convert to the output colour space first, then premultiply (additive when vAdd = 1)
  vec3 c = linearToOutputTexel(vec4(t.rgb * vColor.rgb, 1.0)).rgb;
  gl_FragColor = vec4(c * a, a * (1.0 - vAdd));
}`;

// ------------------------------------------------------------------ atlas

const CELLS = 4;
const CS = 128;

function drawAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CELLS * CS;
  const ctx = cv.getContext('2d');
  const cell = (id, fn) => {
    ctx.save();
    ctx.translate((id % CELLS) * CS, Math.floor(id / CELLS) * CS);
    ctx.beginPath();
    ctx.rect(0, 0, CS, CS);
    ctx.clip();
    fn(ctx, CS / 2);
    ctx.restore();
  };
  const radial = (c, r, stops) => {
    const g = ctx.createRadialGradient(c, c, 0, c, c, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  };
  const pixels = (id, fn) => {
    const img = ctx.createImageData(CS, CS);
    for (let y = 0; y < CS; y++) {
      for (let x = 0; x < CS; x++) {
        const [r, g, b, a] = fn((x + 0.5) / CS, (y + 0.5) / CS);
        const k = (y * CS + x) * 4;
        img.data[k] = r * 255;
        img.data[k + 1] = g * 255;
        img.data[k + 2] = b * 255;
        img.data[k + 3] = Math.max(0, Math.min(1, a)) * 255;
      }
    }
    ctx.putImageData(img, (id % CELLS) * CS, Math.floor(id / CELLS) * CS);
  };
  const starPath = (c, spikes, rOut, rIn, rot = -Math.PI / 2, curve = false) => {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = rot + (i / (spikes * 2)) * TAU;
      const r = i % 2 ? rIn : rOut;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else if (curve && i % 2) ctx.quadraticCurveTo(c + Math.cos(a) * rIn * 0.3, c + Math.sin(a) * rIn * 0.3, x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // 0 sparkle: 4-point twinkle with a soft halo
  cell(CELL.sparkle, (x, c) => {
    x.fillStyle = radial(c, c * 0.85, [[0, 'rgba(255,255,255,0.95)'], [0.22, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, CS, CS);
    x.fillStyle = '#fff';
    const spike = (len, w, rot) => {
      x.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = rot + (i / 4) * TAU;
        const b = a + TAU / 8;
        x.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
        x.lineTo(c + Math.cos(b) * w, c + Math.sin(b) * w);
      }
      x.closePath();
      x.fill();
    };
    spike(c * 0.95, c * 0.19, 0);
    x.globalAlpha = 0.75;
    spike(c * 0.5, c * 0.12, TAU / 8);
  });
  // 1 glow
  cell(CELL.glow, (x, c) => {
    x.fillStyle = radial(c, c * 0.98, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.8)'], [0.5, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, CS, CS);
  });
  // 2 ring (thick, soft)
  cell(CELL.ring, (x, c) => {
    x.fillStyle = radial(c, c * 0.96, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0)'], [0.74, 'rgba(255,255,255,0.95)'], [0.84, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, CS, CS);
  });
  // 3 streak: tapered horizontal line
  pixels(CELL.streak, (u, v) => {
    const dx = Math.abs(u - 0.5) * 2;
    const w = 0.12 * (1 - dx * dx);
    const dy = Math.abs(v - 0.5);
    const a = Math.max(0, 1 - dy / Math.max(0.001, w)) * (1 - dx ** 3);
    return [1, 1, 1, a * 1.3];
  });
  // 4 beam: bright core fading to the top
  pixels(CELL.beam, (u, v) => {
    const dx = Math.abs(u - 0.5) * 2;
    const h = 1 - v; // 0 bottom .. 1 top
    const core = Math.exp(-dx * dx * 5) * 0.9 + Math.exp(-dx * dx * 40) * 0.6;
    const vf = Math.min(1, h * 12) * (1 - h) ** 1.4;
    return [1, 1, 1, core * vf * Math.min(1, (1 - dx) * 8)];
  });
  // 5 swoosh: crescent that thickens towards its leading edge
  pixels(CELL.swoosh, (u, v) => {
    const x = (u - 0.5) * 2, y = (0.5 - v) * 2 + 0.25;
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x); // 0..PI on the upper half
    if (a < 0.1 || a > Math.PI - 0.1) return [1, 1, 1, 0];
    const t = (a - 0.1) / (Math.PI - 0.2); // 0 tail .. 1 head
    const thick = 0.05 + 0.2 * t ** 1.2;
    const mid = 0.72;
    const d = Math.abs(r - mid);
    const edge = Math.max(0, 1 - d / thick);
    return [1, 1, 1, Math.min(1, edge * 2.2) * (0.25 + 0.75 * t) * Math.min(1, (1 - t) * 10)];
  });
  // 6 comic impact burst: white star with a dark rim (rim darkens with the tint)
  cell(CELL.burst, (x, c) => {
    const pts = 11;
    x.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const a = (i / (pts * 2)) * TAU - Math.PI / 2;
      const r = i % 2 ? c * 0.5 : c * (0.84 + ((i * 37) % 7) * 0.02);
      const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
    x.lineJoin = 'round';
    x.lineWidth = 10;
    x.strokeStyle = 'rgba(255,255,255,0.45)';
    x.stroke();
    const g = x.createRadialGradient(c, c, 0, c, c, c * 0.9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#ffffff');
    g.addColorStop(1, 'rgb(225,225,225)');
    x.fillStyle = g;
    x.fill();
  });
  // 7 cartoon puff cloud (normal blend)
  cell(CELL.puff, (x, c) => {
    const blobs = [[0, 0.12, 0.5], [-0.34, 0.2, 0.34], [0.34, 0.18, 0.36], [-0.14, -0.22, 0.38], [0.2, -0.2, 0.34]];
    for (const [bx, by, br] of blobs) {
      const g = x.createRadialGradient(c + bx * c, c + by * c - br * c * 0.3, 0, c + bx * c, c + by * c, br * c);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.75, 'rgba(236,240,248,1)');
      g.addColorStop(1, 'rgba(220,226,238,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(c + bx * c, c + by * c, br * c, 0, TAU);
      x.fill();
    }
  });
  // 8 5-point star with halo
  cell(CELL.star, (x, c) => {
    x.fillStyle = radial(c, c, [[0, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, CS, CS);
    starPath(c, 5, c * 0.8, c * 0.36);
    x.fillStyle = '#fff';
    x.fill();
  });
  // 9 heart
  cell(CELL.heart, (x, c) => {
    x.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * TAU;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      x.lineTo(c + hx * c / 19, c - hy * c / 19 - 4);
    }
    x.fillStyle = '#fff';
    x.fill();
  });
  // 10 dot (crisp disc with soft edge)
  cell(CELL.dot, (x, c) => {
    x.fillStyle = radial(c, c * 0.9, [[0, 'rgba(255,255,255,1)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, CS, CS);
  });
  // 11 thin shock ring
  cell(CELL.shock, (x, c) => {
    x.fillStyle = radial(c, c * 0.96, [[0, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0)'], [0.9, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, CS, CS);
  });
  // 12 spark: hot dot with a small cross glint
  cell(CELL.spark, (x, c) => {
    x.fillStyle = radial(c, c * 0.6, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, CS, CS);
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.fillRect(c - 2, c * 0.2, 4, c * 1.6);
    x.fillRect(c * 0.2, c - 2, c * 1.6, 4);
  });
  // 13 dollar sign
  cell(CELL.dollar, (x, c) => {
    x.font = `900 ${c * 1.5}px "Arial Black", Arial, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 14;
    x.lineJoin = 'round';
    x.strokeStyle = 'rgb(40,90,40)';
    x.strokeText('$', c, c + 6);
    x.fillStyle = '#fff';
    x.fillText('$', c, c + 6);
  });
  // 14 teardrop
  cell(CELL.tear, (x, c) => {
    x.beginPath();
    x.moveTo(c, c * 0.2);
    x.bezierCurveTo(c + c * 0.15, c * 0.6, c + c * 0.55, c * 0.95, c + c * 0.55, c * 1.25);
    x.arc(c, c * 1.25, c * 0.55, 0, Math.PI);
    x.bezierCurveTo(c - c * 0.55, c * 0.95, c - c * 0.15, c * 0.6, c, c * 0.2);
    x.fillStyle = '#fff';
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)';
  });
  // 15 lightning bolt
  cell(CELL.bolt, (x, c) => {
    x.beginPath();
    const p = [[0.1, 0.02], [0.62, 0.02], [0.45, 0.4], [0.8, 0.4], [0.2, 0.98], [0.36, 0.52], [0.02, 0.52]];
    p.forEach(([px, py], i) => (i ? x.lineTo(px * CS, py * CS) : x.moveTo(px * CS, py * CS)));
    x.closePath();
    x.fillStyle = '#fff';
    x.fill();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  return tex;
}

// ------------------------------------------------------------------ pools

function dyn(cap, size) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

// Upload only the live range. Reuses one range object per attribute (addUpdateRange would allocate every frame).
function upload(attr, n) {
  attr.clearUpdateRanges();
  if (n > 0) {
    const r = (attr._fxRange ||= { start: 0, count: 0 });
    r.count = n * attr.itemSize;
    attr.updateRanges.push(r);
    attr.needsUpdate = true;
  }
}

export class SolidPool {
  constructor(scene, cap, immCap = 48) {
    this.cap = cap;
    this.total = cap + immCap;
    this.n = 0;
    this.imm = 0;
    const f = () => new Float32Array(cap);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f(); this.size = f();
    this.grav = f(); this.drag = f();
    this.ax = f(); this.ay = f(); this.az = f(); this.ang = f(); this.spin = f();
    this.r = f(); this.g = f(); this.b = f(); this.emis = f();
    this.sx = f(); this.sy = f(); this.sz = f();
    this.floor = f(); this.homeAt = f(); this.homeOff = f(); this.phase = f();
    this.shape = new Uint8Array(cap);
    this.curve = new Uint8Array(cap);
    this.flags = new Uint16Array(cap);
    this.target = new Array(cap).fill(null);
    this._arrays = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.size, this.grav, this.drag,
      this.ax, this.ay, this.az, this.ang, this.spin, this.r, this.g, this.b, this.emis, this.sx, this.sy, this.sz,
      this.floor, this.homeAt, this.homeOff, this.phase, this.shape, this.curve, this.flags];
    this.onArrive = null; // (x, y, z, r, g, b) when a homing particle reaches its target

    const base = buildShapes();
    const geo = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'shape', 'tint']) geo.setAttribute(k, base.attributes[k]);
    this.aPos = dyn(this.total, 4);
    this.aRot = dyn(this.total, 4);
    this.aCol = dyn(this.total, 4);
    this.aShp = dyn(this.total, 4);
    geo.setAttribute('iPosScale', this.aPos);
    geo.setAttribute('iAxisAngle', this.aRot);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iShape', this.aShp);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uSunDir: { value: new THREE.Vector3(0.45, 0.85, -0.3).normalize() },
          uSky: { value: new THREE.Color(1.02, 1.0, 0.97) },
          uGround: { value: new THREE.Color(0.6, 0.63, 0.72) },
        },
      ]),
      vertexShader: SOLID_VS,
      fragmentShader: SOLID_FS,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false, // juice should pop: keep particle colours saturated
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'fx-solids';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /** Spawn one particle with sensible defaults; returns its index (or -1 when the pool is full). */
  add(shape, x, y, z, vx, vy, vz, size, life, color) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size;
    this.grav[i] = 0; this.drag[i] = 0;
    // random tumble axis
    let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
    const l = Math.hypot(ax, ay, az) || 1;
    this.ax[i] = ax / l; this.ay[i] = ay / l; this.az[i] = az / l;
    this.ang[i] = Math.random() * TAU;
    this.spin[i] = 0;
    const c = lin(color);
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
    this.emis[i] = 0;
    this.sx[i] = 1; this.sy[i] = 1; this.sz[i] = 1;
    this.floor[i] = -1e9;
    this.homeAt[i] = 0; this.homeOff[i] = 0;
    this.phase[i] = Math.random() * TAU;
    this.shape[i] = shape;
    this.curve[i] = 0;
    this.flags[i] = 0;
    this.target[i] = null;
    return i;
  }

  setAxis(i, x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    this.ax[i] = x / l; this.ay[i] = y / l; this.az[i] = z / l;
  }

  _kill(i) {
    const last = --this.n;
    if (i !== last) {
      const A = this._arrays;
      for (let k = 0; k < A.length; k++) A[k][i] = A[k][last];
      this.target[i] = this.target[last];
    }
    this.target[last] = null;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) {
        this._kill(i);
        continue;
      }
      if (age < 0) {
        // delayed spawn: park it invisibly
        this.aPos.array[i * 4 + 3] = 0;
        i++;
        continue;
      }
      const fl = this.flags[i];
      let sizeMul = 1;
      const tgt = this.target[i];
      if (fl & F.home && tgt && age > this.homeAt[i]) {
        const dx = tgt.x - this.px[i], dy = tgt.y + this.homeOff[i] - this.py[i], dz = tgt.z - this.pz[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1.1) {
          if (this.onArrive) this.onArrive(this.px[i], this.py[i], this.pz[i], this.r[i], this.g[i], this.b[i]);
          this._kill(i);
          continue;
        }
        const hs = 30 + (age - this.homeAt[i]) * 110;
        const k = Math.min(1, dt * 9);
        this.vx[i] += ((dx / d) * hs - this.vx[i]) * k;
        this.vy[i] += ((dy / d) * hs - this.vy[i]) * k;
        this.vz[i] += ((dz / d) * hs - this.vz[i]) * k;
        sizeMul = Math.min(1, 0.35 + d / 4);
      } else {
        this.vy[i] -= this.grav[i] * dt;
      }
      const dr = this.drag[i];
      if (dr > 0) {
        const k = 1 / (1 + dr * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
        this.vz[i] *= k;
      }
      if (fl & F.flutter) {
        if (this.vy[i] < -4.5) this.vy[i] += (-4.5 - this.vy[i]) * Math.min(1, dt * 4);
        const ph = this.phase[i];
        this.px[i] += Math.sin(age * 3.1 + ph) * 2.2 * dt;
        this.pz[i] += Math.cos(age * 2.4 + ph * 1.3) * 2.2 * dt;
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floor[i]) {
        if (fl & F.floorKill) {
          this._kill(i);
          continue;
        }
        if (fl & F.bounce) {
          this.py[i] = this.floor[i];
          if (this.vy[i] < 0) this.vy[i] = Math.abs(this.vy[i]) > 3 ? -this.vy[i] * 0.42 : 0;
          this.vx[i] *= 0.6;
          this.vz[i] *= 0.6;
          this.spin[i] *= 0.75;
        } else this.py[i] = this.floor[i];
      }
      this.ang[i] += this.spin[i] * dt;
      this._write(i, sizeCurve(this.curve[i], age / life, age) * sizeMul, fl);
      i++;
    }
    this.imm = 0;
  }

  _write(i, sc, fl) {
    const k = i * 4;
    const P = this.aPos.array, R = this.aRot.array, C = this.aCol.array, S = this.aShp.array;
    P[k] = this.px[i];
    P[k + 1] = this.py[i];
    P[k + 2] = this.pz[i];
    P[k + 3] = this.size[i] * sc;
    let sy = this.sy[i];
    if (fl & F.align) {
      const vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (v > 0.01) {
        const hx = vz / v, hz = -vx / v;
        const hl = Math.sqrt(hx * hx + hz * hz);
        if (hl > 1e-4) {
          R[k] = hx / hl;
          R[k + 1] = 0;
          R[k + 2] = hz / hl;
        } else {
          R[k] = 1;
          R[k + 1] = 0;
          R[k + 2] = 0;
        }
        R[k + 3] = Math.acos(Math.max(-1, Math.min(1, vy / v)));
        sy *= Math.min(2.2, 1 + v * 0.045);
      }
    } else {
      R[k] = this.ax[i];
      R[k + 1] = this.ay[i];
      R[k + 2] = this.az[i];
      R[k + 3] = this.ang[i];
    }
    C[k] = this.r[i];
    C[k + 1] = this.g[i];
    C[k + 2] = this.b[i];
    C[k + 3] = this.emis[i];
    S[k] = this.shape[i];
    S[k + 1] = this.sx[i];
    S[k + 2] = sy;
    S[k + 3] = this.sz[i];
  }

  /** Draw a shape for this frame only (e.g. dizzy stars orbiting a head). */
  immediate(shape, x, y, z, size, ax, ay, az, ang, color, emis = 0) {
    const i = this.n + this.imm;
    if (i >= this.total) return;
    this.imm++;
    const k = i * 4;
    const P = this.aPos.array, R = this.aRot.array, C = this.aCol.array, S = this.aShp.array;
    P[k] = x; P[k + 1] = y; P[k + 2] = z; P[k + 3] = size;
    R[k] = ax; R[k + 1] = ay; R[k + 2] = az; R[k + 3] = ang;
    const c = lin(color);
    C[k] = c[0]; C[k + 1] = c[1]; C[k + 2] = c[2]; C[k + 3] = emis;
    S[k] = shape; S[k + 1] = 1; S[k + 2] = 1; S[k + 3] = 1;
  }

  flush() {
    const n = this.n + this.imm;
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    upload(this.aPos, n);
    upload(this.aRot, n);
    upload(this.aCol, n);
    upload(this.aShp, n);
  }

  clear() {
    for (let i = 0; i < this.n; i++) this.target[i] = null;
    this.n = 0;
    this.imm = 0;
    this.flush();
  }
}

export class SpritePool {
  constructor(scene, cap, immCap = 48) {
    this.cap = cap;
    this.total = cap + immCap;
    this.n = 0;
    this.imm = 0;
    const f = () => new Float32Array(cap);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f();
    this.s0 = f(); this.s1 = f(); this.alpha = f();
    this.r = f(); this.g = f(); this.b = f();
    this.rot = f(); this.rotV = f(); this.add_ = f();
    this.dx = f(); this.dy = f(); this.dz = f(); this.asp = f();
    this.grav = f(); this.drag = f(); this.phase = f(); this.floor = f();
    this.cell = new Uint8Array(cap);
    this.mode = new Uint8Array(cap);
    this.curve = new Uint8Array(cap);
    this.flags = new Uint16Array(cap);
    this._arrays = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.s0, this.s1, this.alpha,
      this.r, this.g, this.b, this.rot, this.rotV, this.add_, this.dx, this.dy, this.dz, this.asp, this.grav, this.drag,
      this.phase, this.floor, this.cell, this.mode, this.curve, this.flags];

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.setIndex(quad.index);
    geo.setAttribute('position', quad.attributes.position);
    this.aPos = dyn(this.total, 4);
    this.aCol = dyn(this.total, 4);
    this.aPar = dyn(this.total, 4);
    this.aDir = dyn(this.total, 4);
    geo.setAttribute('iPosSize', this.aPos);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iParams', this.aPar);
    geo.setAttribute('iDir', this.aDir);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: drawAtlas() }, uCells: { value: CELLS } },
      vertexShader: SPRITE_VS,
      fragmentShader: SPRITE_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'fx-sprites';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
  }

  /** Spawn one sprite; returns its index or -1. additive: 0 = normal blend .. 1 = additive glow. */
  add(cell, x, y, z, vx, vy, vz, size, life, color, additive = 1) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life;
    this.s0[i] = size; this.s1[i] = size; this.alpha[i] = 1;
    const c = lin(color);
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
    this.rot[i] = 0; this.rotV[i] = 0; this.add_[i] = additive;
    this.dx[i] = 0; this.dy[i] = 1; this.dz[i] = 0; this.asp[i] = 1;
    this.grav[i] = 0; this.drag[i] = 0; this.phase[i] = Math.random() * TAU; this.floor[i] = -1e9;
    this.cell[i] = cell; this.mode[i] = MODE.billboard; this.curve[i] = 0; this.flags[i] = 0;
    return i;
  }

  _kill(i) {
    const last = --this.n;
    if (i !== last) {
      const A = this._arrays;
      for (let k = 0; k < A.length; k++) A[k][i] = A[k][last];
    }
  }

  update(dt) {
    let i = 0;
    const P = this.aPos.array, C = this.aCol.array, Q = this.aPar.array, D = this.aDir.array;
    while (i < this.n) {
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) {
        this._kill(i);
        continue;
      }
      const k = i * 4;
      if (age < 0) {
        C[k + 3] = 0;
        P[k + 3] = 0;
        i++;
        continue;
      }
      const t = age / life;
      const fl = this.flags[i];
      this.vy[i] -= this.grav[i] * dt;
      const dr = this.drag[i];
      if (dr > 0) {
        const kk = 1 / (1 + dr * dt);
        this.vx[i] *= kk;
        this.vy[i] *= kk;
        this.vz[i] *= kk;
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floor[i]) {
        this._kill(i);
        continue;
      }
      this.rot[i] += this.rotV[i] * dt;
      // size: ease-out from s0 to s1
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      let size = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      if (fl & F.twinkle) size *= 0.78 + 0.22 * Math.sin(age * 22 + this.phase[i]);
      // alpha curve
      let a;
      const cv = this.curve[i];
      if (cv === CURVE.flash) a = (1 - t) * (1 - t);
      else if (cv === CURVE.linear) a = 1 - t;
      else if (cv === CURVE.hold) a = t > 0.8 ? (1 - t) / 0.2 : 1;
      else a = (age < 0.06 ? age / 0.06 : 1) * (t > 0.45 ? 1 - ((t - 0.45) / 0.55) ** 1.5 : 1);
      a *= this.alpha[i];
      let asp = this.asp[i];
      if (fl & F.grow) asp *= Math.min(1, age / 0.16);
      P[k] = this.px[i];
      P[k + 1] = this.py[i];
      P[k + 2] = this.pz[i];
      P[k + 3] = size;
      C[k] = this.r[i];
      C[k + 1] = this.g[i];
      C[k + 2] = this.b[i];
      C[k + 3] = a;
      Q[k] = this.cell[i];
      Q[k + 1] = this.rot[i];
      Q[k + 2] = this.add_[i];
      Q[k + 3] = this.mode[i];
      if (fl & F.velDir) {
        D[k] = this.vx[i];
        D[k + 1] = this.vy[i];
        D[k + 2] = this.vz[i];
      } else {
        D[k] = this.dx[i];
        D[k + 1] = this.dy[i];
        D[k + 2] = this.dz[i];
      }
      D[k + 3] = asp;
      i++;
    }
    this.imm = 0;
  }

  /** Draw a sprite for this frame only. */
  immediate(cell, x, y, z, size, color, alpha, additive = 1, mode = 0, rot = 0) {
    const i = this.n + this.imm;
    if (i >= this.total) return;
    this.imm++;
    const k = i * 4;
    const P = this.aPos.array, C = this.aCol.array, Q = this.aPar.array, D = this.aDir.array;
    const c = lin(color);
    P[k] = x; P[k + 1] = y; P[k + 2] = z; P[k + 3] = size;
    C[k] = c[0]; C[k + 1] = c[1]; C[k + 2] = c[2]; C[k + 3] = alpha;
    Q[k] = cell; Q[k + 1] = rot; Q[k + 2] = additive; Q[k + 3] = mode;
    D[k] = 0; D[k + 1] = 1; D[k + 2] = 0; D[k + 3] = 1;
  }

  flush() {
    const n = this.n + this.imm;
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    upload(this.aPos, n);
    upload(this.aCol, n);
    upload(this.aPar, n);
    upload(this.aDir, n);
  }

  clear() {
    this.n = 0;
    this.imm = 0;
    this.flush();
  }
}
