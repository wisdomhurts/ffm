// Family face images. Real photos are injected at build time as window.__FAMILY_FACES__
// ({dorian:{face:dataURL, avatar:dataURL, skin:'#hex'}, ...}); players can override them in the
// Photo Booth (stored locally). Without photos we draw a classic cartoon face.
//
// Face photos are 512x512 aligned crops: eyes at y~0.42, eye distance ~0.36 of the width,
// mouth ~0.66, chin ~0.9, forehead ~0.1.
import * as THREE from 'three';
import { CHARACTER } from '../config.js';
import { load } from '../core/save.js';

const cache = new Map();

export function familyFaceData(id) {
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
  const res = { face, avatarUrl: data?.avatar || data?.face || null, skin: data?.skin || CHARACTER[id]?.look.skin || '#d9a38a' };
  cache.set(key, res);
  return res;
}

// Where the photo sits on the canvas. `scale` = photo size relative to the canvas,
// `eyeY` = canvas height fraction where the photo's eye line lands.
// FLAT is a straight 1:1 copy (UI previews); HEAD frames the face on an avatar's head front
// (a little bigger so it reads from the gameplay camera, eyes just under the middle).
export const FACE_LAYOUT = {
  flat: { scale: 1, eyeY: 0.42 },
  head: { scale: 1.1, eyeY: 0.38 },
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
  const g = c.getContext('2d');
  g.fillStyle = skin;
  g.fillRect(0, 0, size, size);
  const L = typeof opts.layout === 'object' ? opts.layout : FACE_LAYOUT[opts.layout || 'flat'];
  if (!img) {
    drawCartoonFace(g, size, L);
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

// Classic blocky-game smile, laid out on the same eye line as photo faces.
function drawCartoonFace(g, size, L) {
  const k = L.scale;
  const eyeY = size * L.eyeY;
  const dx = size * 0.15 * k;
  g.fillStyle = '#1b1b1b';
  g.beginPath();
  g.ellipse(size / 2 - dx, eyeY, size * 0.042 * k, size * 0.075 * k, 0, 0, Math.PI * 2);
  g.ellipse(size / 2 + dx, eyeY, size * 0.042 * k, size * 0.075 * k, 0, 0, Math.PI * 2);
  g.fill();
  // eye shine
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(size / 2 - dx + size * 0.012 * k, eyeY - size * 0.03 * k, size * 0.012 * k, size * 0.02 * k, 0, 0, Math.PI * 2);
  g.ellipse(size / 2 + dx + size * 0.012 * k, eyeY - size * 0.03 * k, size * 0.012 * k, size * 0.02 * k, 0, 0, Math.PI * 2);
  g.fill();
  // rosy cheeks
  g.fillStyle = 'rgba(255,110,110,0.22)';
  g.beginPath();
  g.ellipse(size / 2 - dx * 1.55, eyeY + size * 0.12 * k, size * 0.06 * k, size * 0.035 * k, 0, 0, Math.PI * 2);
  g.ellipse(size / 2 + dx * 1.55, eyeY + size * 0.12 * k, size * 0.06 * k, size * 0.035 * k, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = size * 0.034 * k;
  g.lineCap = 'round';
  g.strokeStyle = '#1b1b1b';
  g.beginPath();
  g.arc(size / 2, eyeY + size * 0.03 * k, size * 0.19 * k, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
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

export function faceTexture(img, skin, opts = {}) {
  const t = new THREE.CanvasTexture(composeFaceCanvas(img, skin, opts.size || 512, opts));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
