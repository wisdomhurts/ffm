// Family face images. Real photos are injected at build time as window.__FAMILY_FACES__
// ({dorian:{face:dataURL, avatar:dataURL, skin:'#hex'}, ...}); players can override them in the
// Photo Booth (stored locally). Without photos we draw a classic cartoon face.
//
// Face photos are 512x512 aligned crops: eyes at y~0.42, eye distance ~0.36 of the width,
// mouth ~0.66, chin ~0.9, forehead ~0.1.
import * as THREE from 'three';
import { CHARACTER, CHARACTERS } from '../config.js';
import { load } from '../core/save.js';
import { getProfile } from '../core/profiles.js';
import { bus } from '../core/events.js';

const cache = new Map();

// Faces are looked up by a key: a family id ('dorian'), a friend's profile id on this device ('p_...'),
// or a remote online player ('r_<pid>', registered by the network code with registerFace).
const remote = new Map(); // key -> {name, color, skin, face (dataURL) | null}

/** Tell the game about a face that isn't a local profile (online players). Pass face: null for cartoon. */
export function registerFace(key, info) {
  remote.set(key, { ...(remote.get(key) || {}), ...info });
  for (const k of [...cache.keys()]) if (k.startsWith(key + ':')) cache.delete(k);
  bus.emit('face:changed', { id: key });
}

export function forgetFace(key) {
  remote.delete(key);
}

/** Display info for any face key: {name, color, skin}. */
export function faceInfo(key) {
  const r = remote.get(key);
  if (r) return { name: r.name || 'Player', color: r.color || '#888', skin: r.skin || null };
  const c = CHARACTER[key];
  if (c) return { name: c.name, color: c.color, skin: c.look.skin };
  const p = getProfile(key);
  if (p) {
    const base = CHARACTER[p.base] || CHARACTERS[0];
    return { name: p.name, color: base.color, skin: p.look?.skin || base.look.skin };
  }
  return { name: 'Player', color: '#888', skin: null };
}

export function familyFaceData(id) {
  const r = remote.get(id);
  if (r) return r.face ? { face: r.face, avatar: r.face, skin: r.skin, remote: true } : null;
  const custom = load('face:' + id, null);
  if (custom?.face) return { ...custom, custom: true };
  const inj = (typeof window !== 'undefined' && window.__FAMILY_FACES__) || {};
  return inj[id] || null;
}

export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Resolves {face: HTMLImageElement|null, avatarUrl: string|null, skin: '#hex'} for a character. */
export async function getFace(id) {
  const data = familyFaceData(id);
  const key = id + ':' + (data?.face?.length || 0) + ':' + (data?.custom ? 'c' : 'b');
  if (cache.has(key)) return cache.get(key);
  const face = await loadImage(data?.face);
  const res = { face, avatarUrl: data?.avatar || data?.face || null, skin: data?.skin || faceInfo(id).skin || '#d9a38a' };
  cache.set(key, res);
  return res;
}

// Where the photo sits on the canvas. `scale` = photo size relative to the canvas,
// `eyeY` = canvas height fraction where the photo's eye line lands.
// FLAT is a straight 1:1 copy (UI previews). HEAD frames the face on an avatar's head front: that
// texture wraps over the rounded top/bottom edges, and only v ~0.16..0.84 is the flat front
// (avatar.js HEAD). Brows (~0.26), eyes (0.37) and mouth (~0.65) sit well inside the flat and the
// chin fades out (~0.87) just as the lower edge starts to round, so no feature curls over an edge;
// the forehead runs up under the hair.
export const FACE_LAYOUT = {
  flat: { scale: 1, eyeY: 0.42 },
  head: { scale: 1.18, eyeY: 0.37 },
};

// The feathered face region, in photo coordinates (an egg: narrower at the chin).
const OVAL = { cx: 0.5, cy: 0.5, rx: 0.325, ryTop: 0.41, ryBot: 0.425, chinNarrow: 0.3, solid: 0.64 };

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// '#rrggbb' -> [r, g, b] in sRGB 0..255 (no colour management: canvas pixels are sRGB too)
function hexRgb(hex) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Egg-shaped normalized radius of a photo-space point (0 at the centre, 1 on the outline).
function ovalR(u, v) {
  const dy = v - OVAL.cy;
  const below = Math.max(0, dy / OVAL.ryBot);
  const rx = OVAL.rx * (1 - OVAL.chinNarrow * below * below);
  const ry = dy < 0 ? OVAL.ryTop : OVAL.ryBot;
  const x = (u - OVAL.cx) / rx;
  const y = dy / ry;
  return Math.sqrt(x * x + y * y);
}

// Median colour of a few cheek patches (photo coordinates), in sRGB 0..255.
function sampleCheeks(data, size, toCanvas) {
  const rs = [];
  const gs = [];
  const bs = [];
  const patches = [[0.31, 0.6], [0.69, 0.6], [0.35, 0.53], [0.65, 0.53]];
  for (const [pu, pv] of patches) {
    const [cx, cy] = toCanvas(pu, pv);
    const r = Math.max(2, Math.round(size * 0.035));
    for (let y = cy - r; y <= cy + r; y += 2) {
      for (let x = cx - r; x <= cx + r; x += 2) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = (y * size + x) * 4;
        rs.push(data[i]);
        gs.push(data[i + 1]);
        bs.push(data[i + 2]);
      }
    }
  }
  const med = (a) => {
    if (!a.length) return 128;
    a.sort((p, q) => p - q);
    return a[a.length >> 1];
  };
  return [med(rs), med(gs), med(bs)];
}

// Low-frequency "lighting + tone" of the photo: block averages on a coarse grid, smoothed, then
// sampled bilinearly per pixel. Pure JS on the pixels we already have (canvas smoothing is very
// slow on software renderers).
const GRID = 24;
function lowFreqGrid(px, size) {
  const n = GRID;
  const cell = size / n;
  let g = new Float32Array(n * n * 3);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      let r = 0;
      let gg = 0;
      let b = 0;
      let c = 0;
      const x0 = Math.floor(gx * cell);
      const y0 = Math.floor(gy * cell);
      const x1 = Math.floor((gx + 1) * cell);
      const y1 = Math.floor((gy + 1) * cell);
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * size + x) * 4;
          r += px[i];
          gg += px[i + 1];
          b += px[i + 2];
          c++;
        }
      }
      const o = (gy * n + gx) * 3;
      g[o] = r / c;
      g[o + 1] = gg / c;
      g[o + 2] = b / c;
    }
  }
  // two 3x3 box passes = a soft blur of the grid
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(g.length);
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        let r = 0;
        let gg = 0;
        let b = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.min(n - 1, Math.max(0, gx + dx));
            const y = Math.min(n - 1, Math.max(0, gy + dy));
            const o = (y * n + x) * 3;
            r += g[o];
            gg += g[o + 1];
            b += g[o + 2];
            c++;
          }
        }
        const o = (gy * n + gx) * 3;
        out[o] = r / c;
        out[o + 1] = gg / c;
        out[o + 2] = b / c;
      }
    }
    g = out;
  }
  return g;
}

// bilinear sample of the low-frequency grid at canvas pixel (x, y) into `out`
function sampleGrid(g, size, x, y, out) {
  const n = GRID;
  const fx = Math.min(n - 1.001, Math.max(0, (x / size) * n - 0.5));
  const fy = Math.min(n - 1.001, Math.max(0, (y / size) * n - 0.5));
  const ix = fx | 0;
  const iy = fy | 0;
  const tx = fx - ix;
  const ty = fy - iy;
  const a = (iy * n + ix) * 3;
  const b = a + 3;
  const c = a + n * 3;
  const d = c + 3;
  for (let k = 0; k < 3; k++) {
    const top = g[a + k] + (g[b + k] - g[a + k]) * tx;
    const bot = g[c + k] + (g[d + k] - g[c + k]) * tx;
    out[k] = top + (bot - top) * ty;
  }
}

/**
 * Draws a head-front texture: the skin colour, then the photo face blended in so its edges melt
 * into the skin (tone matched to the skin, low-frequency lighting pulled towards the skin near the
 * outline, soft egg-shaped feather). Without a photo, a classic cartoon smile.
 * @param {HTMLImageElement|null} img aligned 512x512-style face crop
 * @param {string} skin '#hex' head skin (a median cheek sample of the photo)
 * @param {number} size canvas size
 * @param {{layout?: 'flat'|'head'|{scale,eyeY}}} opts
 */
export function composeFaceCanvas(img, skin, size = 512, opts = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d', { willReadFrequently: true }); // CPU-backed: toDataURL for avatars must not stall on the GPU
  g.fillStyle = skin;
  g.fillRect(0, 0, size, size);
  const L = typeof opts.layout === 'object' ? opts.layout : FACE_LAYOUT[opts.layout || 'flat'];
  if (!img) {
    drawCartoonFace(g, size, L, opts.expr);
    return c;
  }
  const k = L.scale;
  const ox = size * (0.5 - k / 2);
  const oy = size * (L.eyeY - 0.42 * k);
  const work = makeCanvas(size);
  const wg = work.getContext('2d', { willReadFrequently: true });
  wg.fillStyle = skin;
  wg.fillRect(0, 0, size, size);
  wg.imageSmoothingQuality = 'high';
  wg.drawImage(img, ox, oy, size * k, size * k);
  let id;
  try {
    id = wg.getImageData(0, 0, size, size);
  } catch {
    // tainted canvas (should not happen with data URLs): plain feathered draw
    g.save();
    g.beginPath();
    g.ellipse(size / 2, size * L.eyeY + size * 0.08 * k, size * OVAL.rx * k, size * OVAL.ryBot * k, 0, 0, Math.PI * 2);
    g.clip();
    g.drawImage(img, ox, oy, size * k, size * k);
    g.restore();
    return c;
  }
  const px = id.data;
  const low = lowFreqGrid(px, size);
  const lf = [0, 0, 0];
  const S = hexRgb(skin);
  const toCanvas = (u, v) => [Math.round(ox + u * size * k), Math.round(oy + v * size * k)];
  const cheek = sampleCheeks(px, size, toCanvas);
  // Tone match: pull the photo's cheek colour most of the way to the head skin.
  const gain = [0, 1, 2].map((i) => {
    const raw = Math.min(1.45, Math.max(0.7, S[i] / Math.max(8, cheek[i])));
    return 1 + (raw - 1) * 0.9;
  });
  const contrast = opts.contrast ?? 1.05;
  const sat = opts.sat ?? 1.06;
  const inv = 1 / (size * k);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5 - oy) * inv;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5 - ox) * inv;
      const i = (y * size + x) * 4;
      const r = ovalR(u, v);
      if (r >= 1) {
        px[i] = S[0];
        px[i + 1] = S[1];
        px[i + 2] = S[2];
        px[i + 3] = 255;
        continue;
      }
      // photo, tone matched
      let cr = px[i] * gain[0];
      let cg = px[i + 1] * gain[1];
      let cb = px[i + 2] * gain[2];
      // gentle pop so the face survives tone mapping at distance
      const lum = cr * 0.299 + cg * 0.587 + cb * 0.114;
      cr = lum + (cr - lum) * sat;
      cg = lum + (cg - lum) * sat;
      cb = lum + (cb - lum) * sat;
      cr = (cr - 128) * contrast + 128;
      cg = (cg - 128) * contrast + 128;
      cb = (cb - 128) * contrast + 128;
      // near the outline, swap the photo's low-frequency tone/lighting for the flat skin
      const w = smooth(0.5, 0.97, r);
      if (w > 0) {
        sampleGrid(low, size, x, y, lf);
        cr += w * (S[0] - lf[0] * gain[0]);
        cg += w * (S[1] - lf[1] * gain[1]);
        cb += w * (S[2] - lf[2] * gain[2]);
      }
      // soft feather to pure skin
      const a = 1 - smooth(OVAL.solid, 1, r);
      px[i] = S[0] + (cr - S[0]) * a;
      px[i + 1] = S[1] + (cg - S[1]) * a;
      px[i + 2] = S[2] + (cb - S[2]) * a;
      px[i + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

// Classic blocky-game faces, laid out on the same eye line as photo faces. `expr` picks the
// expression (characters/cosmetics.js FACES); the default is the classic smile.
const INK = '#1b1b1b';
export const EXPRESSIONS = ['smile', 'grin', 'happy', 'wink', 'cool', 'surprised', 'silly', 'shy', 'determined', 'starry', 'sleepy'];

function drawCartoonFace(g, size, L, expr = 'smile') {
  const u = size * L.scale; // one "face unit"
  const cx = size / 2;
  const ey = size * L.eyeY;
  const dx = 0.15 * u;
  const TAU = Math.PI * 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const ell = (x, y, rx, ry, fill, rot = 0) => {
    g.fillStyle = fill;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, TAU);
    g.fill();
  };
  const stroke = (w, color = INK) => {
    g.lineWidth = w * u;
    g.strokeStyle = color;
    g.stroke();
  };
  const eye = (x, y = ey, sx = 1, sy = 1) => {
    ell(x, y, 0.042 * u * sx, 0.075 * u * sy, INK);
    ell(x + 0.012 * u * sx, y - 0.03 * u * sy, 0.012 * u * sx, 0.02 * u * sy, 'rgba(255,255,255,0.85)');
  };
  const cheeks = (a = 0.22, s = 1) => {
    ell(cx - dx * 1.55, ey + 0.12 * u, 0.06 * u * s, 0.035 * u * s, `rgba(255,110,110,${a})`);
    ell(cx + dx * 1.55, ey + 0.12 * u, 0.06 * u * s, 0.035 * u * s, `rgba(255,110,110,${a})`);
  };
  const smileArc = (r = 0.19, a0 = 0.2, a1 = 0.8, y = 0.03, w = 0.034) => {
    g.beginPath();
    g.arc(cx, ey + y * u, r * u, a0 * Math.PI, a1 * Math.PI);
    stroke(w);
  };
  // open "D" mouth: flat top, round bottom (teeth / tongue optional)
  const openMouth = (w, top, depth, { teeth = false, tongue = true } = {}) => {
    const x0 = cx - w * u;
    const x1 = cx + w * u;
    const y0 = ey + top * u;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(cx, y0 + 0.012 * u, x1, y0);
    g.bezierCurveTo(x1, y0 + depth * 0.9 * u, cx + w * 0.45 * u, y0 + depth * u, cx, y0 + depth * u);
    g.bezierCurveTo(cx - w * 0.45 * u, y0 + depth * u, x0, y0 + depth * 0.9 * u, x0, y0);
    g.closePath();
    g.fillStyle = '#5a1420';
    g.fill();
    g.save();
    g.clip();
    if (teeth) {
      g.fillStyle = '#fff';
      g.fillRect(x0, y0 - 0.01 * u, x1 - x0, depth * 0.3 * u);
    }
    if (tongue) ell(cx, y0 + depth * 0.95 * u, w * 0.55 * u, depth * 0.42 * u, '#ff6f86');
    g.restore();
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(cx, y0 + 0.012 * u, x1, y0);
    g.bezierCurveTo(x1, y0 + depth * 0.9 * u, cx + w * 0.45 * u, y0 + depth * u, cx, y0 + depth * u);
    g.bezierCurveTo(cx - w * 0.45 * u, y0 + depth * u, x0, y0 + depth * 0.9 * u, x0, y0);
    g.closePath();
    stroke(0.022);
  };
  // closed happy eye: an upside-down U
  const happyEye = (x, y = ey) => {
    g.beginPath();
    g.arc(x, y + 0.03 * u, 0.05 * u, 1.1 * Math.PI, 1.9 * Math.PI);
    stroke(0.03);
  };
  const star = (x, y, r) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#ffd23f';
    g.fill();
    stroke(0.016);
    ell(x - r * 0.25, y - r * 0.25, r * 0.16, r * 0.12, 'rgba(255,255,255,0.9)');
  };
  const brow = (x, y, rot, len = 0.07, w = 0.026) => {
    g.beginPath();
    g.moveTo(x - Math.cos(rot) * len * u, y - Math.sin(rot) * len * u);
    g.lineTo(x + Math.cos(rot) * len * u, y + Math.sin(rot) * len * u);
    stroke(w);
  };

  switch (expr) {
    case 'grin':
      eye(cx - dx);
      eye(cx + dx);
      cheeks(0.26);
      openMouth(0.17, 0.12, 0.15, { teeth: true, tongue: true });
      break;
    case 'happy':
      happyEye(cx - dx);
      happyEye(cx + dx);
      cheeks(0.34, 1.15);
      openMouth(0.15, 0.12, 0.13);
      break;
    case 'wink':
      eye(cx - dx);
      // the character's left eye (viewer's right) winks
      g.beginPath();
      g.moveTo(cx + dx - 0.055 * u, ey + 0.005 * u);
      g.quadraticCurveTo(cx + dx, ey - 0.04 * u, cx + dx + 0.055 * u, ey + 0.005 * u);
      stroke(0.03);
      cheeks(0.26);
      smileArc(0.18, 0.12, 0.72);
      ell(cx + 0.07 * u, ey + 0.22 * u, 0.035 * u, 0.03 * u, '#ff6f86');
      break;
    case 'cool': {
      // half-closed, unimpressed eyes, one brow up, a sideways smirk
      for (const s of [-1, 1]) {
        g.save();
        g.beginPath();
        g.rect(cx + s * dx - 0.06 * u, ey - 0.012 * u, 0.12 * u, 0.2 * u);
        g.clip();
        eye(cx + s * dx);
        g.restore();
        g.beginPath();
        g.moveTo(cx + s * dx - 0.052 * u, ey - 0.012 * u);
        g.lineTo(cx + s * dx + 0.052 * u, ey - 0.012 * u);
        stroke(0.026);
      }
      brow(cx - dx, ey - 0.13 * u, 0.12);
      brow(cx + dx, ey - 0.16 * u, -0.18);
      g.beginPath();
      g.moveTo(cx - 0.12 * u, ey + 0.2 * u);
      g.quadraticCurveTo(cx + 0.02 * u, ey + 0.23 * u, cx + 0.14 * u, ey + 0.15 * u);
      stroke(0.032);
      break;
    }
    case 'surprised':
      eye(cx - dx, ey, 1.3, 1.15);
      eye(cx + dx, ey, 1.3, 1.15);
      g.beginPath();
      g.arc(cx - dx, ey - 0.12 * u, 0.06 * u, 1.15 * Math.PI, 1.85 * Math.PI);
      stroke(0.024);
      g.beginPath();
      g.arc(cx + dx, ey - 0.12 * u, 0.06 * u, 1.15 * Math.PI, 1.85 * Math.PI);
      stroke(0.024);
      cheeks(0.2);
      ell(cx, ey + 0.21 * u, 0.055 * u, 0.075 * u, '#5a1420');
      g.beginPath();
      g.ellipse(cx, ey + 0.21 * u, 0.055 * u, 0.075 * u, 0, 0, TAU);
      stroke(0.022);
      break;
    case 'silly':
      // cross-eyed with the tongue out
      ell(cx - dx, ey, 0.05 * u, 0.075 * u, '#fff');
      ell(cx + dx, ey, 0.05 * u, 0.075 * u, '#fff');
      g.beginPath();
      g.ellipse(cx - dx, ey, 0.05 * u, 0.075 * u, 0, 0, TAU);
      g.ellipse(cx + dx, ey, 0.05 * u, 0.075 * u, 0, 0, TAU);
      stroke(0.016);
      ell(cx - dx + 0.022 * u, ey + 0.012 * u, 0.026 * u, 0.04 * u, INK);
      ell(cx + dx - 0.022 * u, ey + 0.012 * u, 0.026 * u, 0.04 * u, INK);
      cheeks(0.24);
      g.fillStyle = '#ff6f86';
      g.beginPath();
      g.moveTo(cx - 0.05 * u, ey + 0.2 * u);
      g.lineTo(cx - 0.05 * u, ey + 0.27 * u);
      g.arc(cx, ey + 0.27 * u, 0.05 * u, Math.PI, 0, true);
      g.lineTo(cx + 0.05 * u, ey + 0.2 * u);
      g.closePath();
      g.fill();
      stroke(0.018);
      g.beginPath();
      g.moveTo(cx, ey + 0.21 * u);
      g.lineTo(cx, ey + 0.265 * u);
      stroke(0.012, '#c8405a');
      smileArc(0.17, 0.18, 0.82, 0.02);
      break;
    case 'shy':
      eye(cx - dx + 0.02 * u, ey + 0.03 * u, 0.85, 0.8);
      eye(cx + dx + 0.02 * u, ey + 0.03 * u, 0.85, 0.8);
      cheeks(0.42, 1.25);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const x = cx + s * dx * 1.55 + (i - 1) * 0.03 * u;
          g.beginPath();
          g.moveTo(x - 0.01 * u, ey + 0.14 * u);
          g.lineTo(x + 0.01 * u, ey + 0.1 * u);
          stroke(0.01, 'rgba(200,60,80,0.6)');
        }
      }
      g.beginPath();
      g.moveTo(cx - 0.07 * u, ey + 0.2 * u);
      g.quadraticCurveTo(cx - 0.035 * u, ey + 0.225 * u, cx, ey + 0.2 * u);
      g.quadraticCurveTo(cx + 0.035 * u, ey + 0.225 * u, cx + 0.07 * u, ey + 0.2 * u);
      stroke(0.026);
      break;
    case 'determined':
      eye(cx - dx, ey + 0.01 * u, 1, 0.85);
      eye(cx + dx, ey + 0.01 * u, 1, 0.85);
      brow(cx - dx + 0.005 * u, ey - 0.1 * u, 0.38, 0.07, 0.032);
      brow(cx + dx - 0.005 * u, ey - 0.1 * u, -0.38, 0.07, 0.032);
      cheeks(0.18);
      g.beginPath();
      g.moveTo(cx - 0.1 * u, ey + 0.2 * u);
      g.quadraticCurveTo(cx, ey + 0.235 * u, cx + 0.1 * u, ey + 0.19 * u);
      stroke(0.034);
      break;
    case 'starry':
      star(cx - dx, ey, 0.085 * u);
      star(cx + dx, ey, 0.085 * u);
      cheeks(0.3);
      openMouth(0.16, 0.12, 0.14);
      break;
    case 'sleepy':
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * dx, ey - 0.01 * u, 0.048 * u, 0.12 * Math.PI, 0.88 * Math.PI);
        stroke(0.028);
      }
      cheeks(0.2);
      ell(cx, ey + 0.2 * u, 0.03 * u, 0.035 * u, '#5a1420');
      g.fillStyle = '#6f7cff';
      g.font = `900 ${Math.round(0.11 * u)}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.fillText('z', cx + 0.28 * u, ey - 0.12 * u);
      g.font = `900 ${Math.round(0.08 * u)}px Arial, sans-serif`;
      g.fillText('z', cx + 0.36 * u, ey - 0.21 * u);
      break;
    default:
      // the classic smile (unchanged)
      eye(cx - dx);
      eye(cx + dx);
      cheeks(0.22);
      smileArc();
  }
}

/** A slightly brighter, warmer version of a photo skin tone so it survives the game's tone mapping. */
export function boostSkin(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l0 = (max + min) / 2;
  const d = max - min;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  // nudge very pink/red casts (sunset photos) a touch towards a warm peach
  if (h < 12 || h > 340) h = h > 340 ? h - 360 + 8 : h + 8 * (1 - h / 12);
  const l = Math.min(0.8, l0 * 1.1 + 0.035);
  const s = Math.min(0.62, s0 * 1.1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((((h % 360) + 360) % 360) / 60) % 2 - 1));
  const m = l - c / 2;
  const hh = ((h % 360) + 360) % 360;
  const [r1, g1, b1] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
  return '#' + to(r1) + to(g1) + to(b1);
}

const cartoonUrls = new Map();
/**
 * A cartoon face picture (data URL, square) for UI avatars of players without a photo, in their
 * look's skin tone and expression (look.face; 'photo' falls back to the classic smile).
 */
export function cartoonFaceUrl(look = {}, size = 128) {
  const skin = boostSkin(look.skin || '#d9a38a');
  const expr = !look.face || look.face === 'photo' ? 'smile' : look.face;
  const key = skin + expr + size;
  if (!cartoonUrls.has(key)) {
    try {
      cartoonUrls.set(key, composeFaceCanvas(null, skin, size, { layout: { scale: 1.3, eyeY: 0.44 }, expr }).toDataURL('image/png'));
    } catch {
      cartoonUrls.set(key, null);
    }
  }
  return cartoonUrls.get(key);
}

export function faceTexture(img, skin, opts = {}) {
  const t = new THREE.CanvasTexture(composeFaceCanvas(img, skin, opts.size || 512, opts));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
