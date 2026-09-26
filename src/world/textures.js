// Procedural canvas textures for the world (no image files). Cached: each is painted once.
import { drawTexture, makeCanvas, canvasTexture, makeRand, blobs, roundRect, chunkyText } from './kit.js';

const cache = new Map();
const once = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

// Per-pixel painter: f(x, y) -> [r,g,b] 0..255
function pixels(g, w, h, f) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const c = f(x, y, d[i], d[i + 1], d[i + 2]);
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// Tileable fbm: value noise on a lattice that wraps every `period` cells (per octave), 1 sample/octave.
function tileNoise(seed, period) {
  const r = makeRand(seed);
  const N = 256;
  const T = new Float32Array(N * N);
  for (let i = 0; i < T.length; i++) T[i] = r();
  return (x, y, w, h, oct = 4) => {
    let s = 0, a = 0.5, norm = 0;
    let P = period;
    for (let o = 0; o < oct; o++) {
      const fx = (x / w) * P, fy = (y / h) * P;
      const xi = Math.floor(fx), yi = Math.floor(fy);
      const tx = fx - xi, ty = fy - yi;
      const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
      const x0 = xi % P, x1 = (xi + 1) % P, y0 = (yi % P) * N, y1 = ((yi + 1) % P) * N;
      const off = o * 37;
      const A = T[(y0 + x0 + off) & 65535], B = T[(y0 + x1 + off) & 65535], C = T[(y1 + x0 + off) & 65535], D = T[(y1 + x1 + off) & 65535];
      s += (A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v) * a;
      norm += a;
      a *= 0.5;
      P *= 2;
    }
    return s / norm;
  };
}

/** Tileable grey value-noise (linear data, not colour) for the water/lava shaders. */
export function noiseTexture() {
  return once('noise', () => {
    const n = tileNoise(97, 8);
    const n2 = tileNoise(98, 16);
    return drawTexture(256, 256, (g, w, h) => {
      pixels(g, w, h, (x, y) => [n(x, y, w, h, 4) * 255, n2(x, y, w, h, 3) * 255, 0]);
    }, { srgb: false });
  });
}

// ------------------------------------------------------------------ studs

/** Classic Roblox studs, 4x4 per tile, near-white so vertex colours tint it. Texel (0..3,0..3) is flat. */
export function studTexture() {
  return once('studs', () => drawTexture(256, 256, (g) => {
    g.fillStyle = 'rgb(236,236,236)';
    g.fillRect(0, 0, 256, 256);
    // faint plate grain
    const r = makeRand(7);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
      g.fillRect(r() * 256, r() * 256, 2, 2);
    }
    for (let iy = 0; iy < 4; iy++) {
      for (let ix = 0; ix < 4; ix++) {
        const cx = ix * 64 + 32, cy = iy * 64 + 32;
        // contact shadow
        const sh = g.createRadialGradient(cx + 3, cy + 5, 12, cx + 3, cy + 5, 25);
        sh.addColorStop(0, 'rgba(0,0,0,0.30)');
        sh.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sh;
        g.beginPath();
        g.arc(cx + 3, cy + 5, 25, 0, Math.PI * 2);
        g.fill();
        // stud wall
        g.fillStyle = 'rgb(200,200,200)';
        g.beginPath();
        g.arc(cx + 1, cy + 2.5, 19, 0, Math.PI * 2);
        g.fill();
        // stud top
        const tg = g.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, 19);
        tg.addColorStop(0, 'rgb(255,255,255)');
        tg.addColorStop(0.7, 'rgb(242,242,242)');
        tg.addColorStop(1, 'rgb(225,225,225)');
        g.fillStyle = tg;
        g.beginPath();
        g.arc(cx, cy, 17.5, 0, Math.PI * 2);
        g.fill();
        // rim highlight
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 2.2;
        g.beginPath();
        g.arc(cx, cy, 16.5, Math.PI * 0.95, Math.PI * 1.75);
        g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.13)';
        g.beginPath();
        g.arc(cx, cy, 17.5, Math.PI * 0.05, Math.PI * 0.85);
        g.stroke();
      }
    }
  }));
}

// ------------------------------------------------------------------ detail maps (grey, tinted by vertex colour)

/** Grass detail: soft clumps and blades, mean ~0.9. */
export function grassDetail() {
  return once('grass', () => drawTexture(256, 256, (g, w, h) => {
    const n = tileNoise(11, 6);
    pixels(g, w, h, (x, y) => {
      const v = 212 + (n(x, y, w, h) - 0.5) * 70;
      return [v, v, v];
    });
    const r = makeRand(3);
    for (let i = 0; i < 1400; i++) {
      const x = r() * w, y = r() * h;
      const l = 3 + r() * 5;
      g.strokeStyle = r() < 0.55 ? `rgba(255,255,255,${0.18 + r() * 0.2})` : `rgba(0,0,0,${0.08 + r() * 0.1})`;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - l);
      g.stroke();
    }
  }));
}

/** Rock/cliff detail: blotches, cracks and faint strata, for box-projected cliffs. */
export function rockDetail() {
  return once('rock', () => drawTexture(256, 256, (g, w, h) => {
    const n = tileNoise(21, 4);
    const n2 = tileNoise(22, 12);
    pixels(g, w, h, (x, y) => {
      const strata = Math.sin((y / h) * Math.PI * 2 * 4 + n(x, y, w, h) * 3) * 0.5 + 0.5;
      const v = 200 + (n(x, y, w, h) - 0.5) * 60 + (n2(x, y, w, h, 2) - 0.5) * 40 - strata * 18;
      return [v, v, v];
    });
    const r = makeRand(5);
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = r() * w, y = r() * h;
      g.strokeStyle = `rgba(0,0,0,${0.18 + r() * 0.15})`;
      g.lineWidth = 1 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.5) * 26;
        y += r() * 16;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    blobs(g, w, h, 60, r, { rMin: 2, rMax: 6, colors: ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.08)'] });
  }));
}

/** Sand detail: ripples + speckles. */
export function sandDetail() {
  return once('sand', () => drawTexture(256, 256, (g, w, h) => {
    const n = tileNoise(31, 5);
    pixels(g, w, h, (x, y) => {
      const rip = Math.sin((y / h) * Math.PI * 2 * 10 + n(x, y, w, h) * 9) * 0.5 + 0.5;
      const v = 222 + (n(x, y, w, h) - 0.5) * 40 + rip * 16;
      return [v, v, v];
    });
    const r = makeRand(8);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.3)';
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  }));
}

/** Soil for planters. Coloured. */
export function soilTexture() {
  return once('soil', () => drawTexture(128, 128, (g, w, h) => {
    const n = tileNoise(41, 4);
    pixels(g, w, h, (x, y) => {
      const v = n(x, y, w, h);
      return [70 + v * 40, 44 + v * 26, 28 + v * 16];
    });
    const r = makeRand(4);
    blobs(g, w, h, 70, r, { rMin: 1.5, rMax: 4, colors: ['rgba(30,18,10,0.5)', 'rgba(140,100,70,0.35)'] });
    // furrows
    g.strokeStyle = 'rgba(25,15,8,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, 16 + i * 32);
      g.lineTo(w, 16 + i * 32);
      g.stroke();
    }
  }));
}

/** Lawn with mowing stripes for garden floors (grey detail, tinted by vertex colour). */
export function lawnTexture() {
  return once('lawn', () => drawTexture(256, 256, (g, w, h) => {
    const n = tileNoise(51, 5);
    pixels(g, w, h, (x, y) => {
      const stripe = Math.floor(x / 64) % 2 ? 1 : 0;
      const v = 214 + stripe * 22 + (n(x, y, w, h) - 0.5) * 36;
      return [v, v, v];
    });
    const r = makeRand(12);
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h;
      g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 2, y - 3 - r() * 3);
      g.stroke();
    }
    // tiny clover flowers
    blobs(g, w, h, 16, r, { rMin: 1.4, rMax: 2.2, colors: ['rgba(255,255,255,0.75)'] });
  }));
}


// ------------------------------------------------------------------ road surfaces (coloured, with a path)

const ROAD_STYLE = {
  field: { side: ['#79cf52', '#5fb944', '#93dd66'], path: 'cobble', pathCol: ['#d9b27a', '#c99a62', '#e8c894'], flowers: ['#ffffff', '#ffe14d', '#ff7eb6', '#7ec8ff'] },
  greenhollow: { side: ['#3f9e4d', '#2f8a3f', '#56b25f'], path: 'slabs', pathCol: ['#9aa39a', '#7f8a80', '#b3bcb2'], moss: '#4caf50', leaves: ['#8b5a2b', '#c9a14a', '#6b8e23'] },
  dustbowl: { side: ['#ecc47d', '#dcae68', '#f4d596'], path: 'ruts', pathCol: ['#c98e55', '#b67b45', '#d9a26a'] },
  tanglemire: { side: ['#4d5e3a', '#3e4d31', '#5d6f45'], path: 'boards', pathCol: ['#7a5a3a', '#6a4c30', '#8c6a46'], moss: '#7a8f3a' },
  emberroot: { side: ['#4a2520', '#3a1c18', '#5c2e26'], path: 'hex', pathCol: ['#2e2a2e', '#3a3438', '#252226'], glow: '#ff7a1a' },
  starbloom: { side: ['#262a66', '#1e2256', '#30357a'], path: 'crystal', pathCol: ['#3b3f8f', '#4a4fa8', '#2f3378'], glow: '#9fe8ff' },
};

/** Returns {map, emissiveMap?} for a biome road: 512px = 40 studs wide, 40 studs long. */
export function roadTexture(biomeId) {
  return once('road:' + biomeId, () => {
    const S = ROAD_STYLE[biomeId];
    const W = 512, H = 512;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const n = tileNoise(biomeId.length * 13 + 5, 6);
    const r = makeRand(biomeId.length * 7 + 1);
    const hex = (s) => ({ r: parseInt(s.slice(1, 3), 16) / 255, g: parseInt(s.slice(3, 5), 16) / 255, b: parseInt(s.slice(5, 7), 16) / 255 });
    const s0 = hex(S.side[0]), s1 = hex(S.side[1]), s2 = hex(S.side[2]);
    // side ground (in sRGB bytes)
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const toB = (v) => Math.max(0, Math.min(255, v * 255));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = n(x, y, W, H);
        const t = Math.max(0, Math.min(1, (v - 0.3) * 2.2));
        const a = t < 0.5 ? s1 : s0, b = t < 0.5 ? s0 : s2;
        const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        const i = (y * W + x) * 4;
        d[i] = toB(a.r + (b.r - a.r) * k);
        d[i + 1] = toB(a.g + (b.g - a.g) * k);
        d[i + 2] = toB(a.b + (b.b - a.b) * k);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const px = W / 40; // pixels per stud
    const pathHalf = 9 * px;
    const cx = W / 2;
    let glow = null;
    if (S.glow) {
      glow = makeCanvas(W, H);
      const gg = glow.getContext('2d');
      gg.fillStyle = '#000';
      gg.fillRect(0, 0, W, H);
    }
    const gg = glow?.getContext('2d');
    // side decoration
    if (biomeId === 'field' || biomeId === 'greenhollow') {
      for (let i = 0; i < 2600; i++) {
        const x = r() * W, y = r() * H;
        g.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.16)' : 'rgba(0,40,0,0.14)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4);
        g.stroke();
      }
    }
    if (biomeId === 'field') {
      for (let i = 0; i < 170; i++) {
        const x = r() < 0.5 ? r() * (cx - pathHalf - 14) : cx + pathHalf + 14 + r() * (cx - pathHalf - 14);
        const y = r() * H;
        const colr = S.flowers[Math.floor(r() * S.flowers.length)];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.fillStyle = colr;
          g.beginPath();
          g.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.2, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#ffcf33';
        g.beginPath();
        g.arc(x, y, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (biomeId === 'greenhollow') {
      blobs(g, W, H, 140, r, { rMin: 2, rMax: 4.5, colors: ['rgba(139,90,43,0.55)', 'rgba(201,161,74,0.5)', 'rgba(107,142,35,0.5)'], shape: 'ellipse' });
    }
    if (biomeId === 'dustbowl') {
      for (let i = 0; i < 40; i++) {
        const y = r() * H;
        g.strokeStyle = 'rgba(160,110,50,0.18)';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 6);
        g.stroke();
      }
      blobs(g, W, H, 60, r, { rMin: 1.5, rMax: 4, colors: ['rgba(120,80,40,0.35)', 'rgba(255,240,210,0.5)'] });
    }
    if (biomeId === 'tanglemire') {
      blobs(g, W, H, 50, r, { rMin: 8, rMax: 22, colors: ['rgba(40,60,30,0.35)', 'rgba(110,130,50,0.25)', 'rgba(60,40,80,0.25)'] });
    }
    if (biomeId === 'emberroot') {
      // glowing cracks in the ash
      for (let i = 0; i < 34; i++) {
        let x = r() * W, y = r() * H;
        const pts = [[x, y]];
        for (let k = 0; k < 6; k++) {
          x += (r() - 0.5) * 50;
          y += (r() - 0.5) * 50;
          pts.push([x, y]);
        }
        for (const [ctx, w, colr] of [[g, 4, '#1a0a08'], [g, 1.6, '#ff8a2a'], [gg, 5, '#ff5a10'], [gg, 2, '#ffd080']]) {
          ctx.strokeStyle = colr;
          ctx.lineWidth = w;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          pts.forEach(([a, b], j) => (j ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
          ctx.stroke();
        }
      }
    }
    if (biomeId === 'starbloom') {
      for (let i = 0; i < 260; i++) {
        const x = r() * W, y = r() * H, s = 0.8 + r() * 1.8;
        const colr = r() < 0.5 ? '#bff4ff' : r() < 0.5 ? '#ffc4f2' : '#ffffff';
        g.fillStyle = colr;
        g.fillRect(x, y, s, s);
        gg.fillStyle = colr;
        gg.globalAlpha = 0.5 + r() * 0.5;
        gg.fillRect(x - s * 0.5, y - s * 0.5, s * 2, s * 2);
        gg.globalAlpha = 1;
      }
    }
    // the path
    const edge = (y) => pathHalf + Math.sin(y * 0.045) * 6 + Math.sin(y * 0.11 + 2) * 3;
    g.save();
    g.beginPath();
    g.moveTo(cx - edge(0), 0);
    for (let y = 0; y <= H; y += 8) g.lineTo(cx - edge(y), y);
    for (let y = H; y >= 0; y -= 8) g.lineTo(cx + edge(y + 50), y);
    g.closePath();
    // border shadow
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.stroke();
    g.clip();
    const pc = S.pathCol;
    g.fillStyle = pc[0];
    g.fillRect(0, 0, W, H);
    if (S.path === 'cobble') {
      for (let y = -10; y < H + 10; y += 17) {
        for (let x = cx - pathHalf - 20 + ((y / 17) % 2) * 8; x < cx + pathHalf + 20; x += 18) {
          const w = 13 + r() * 5, h = 12 + r() * 3;
          g.fillStyle = pc[Math.floor(r() * pc.length)];
          roundRect(g, x, y, w, h, 5);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.18)';
          roundRect(g, x + 2, y + 1.5, w - 5, 4, 2);
          g.fill();
          g.strokeStyle = 'rgba(80,50,20,0.35)';
          g.lineWidth = 1.5;
          roundRect(g, x, y, w, h, 5);
          g.stroke();
        }
      }
    } else if (S.path === 'slabs') {
      for (let y = 0; y < H; y += 40) {
        for (let x = cx - pathHalf - 30 + ((y / 40) % 2) * 20; x < cx + pathHalf + 30; x += 42) {
          g.fillStyle = pc[Math.floor(r() * pc.length)];
          roundRect(g, x + 2, y + 2, 38, 36, 6);
          g.fill();
          g.fillStyle = 'rgba(76,175,80,0.55)';
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            g.arc(x + 4 + r() * 34, y + 4 + r() * 32, 2 + r() * 5, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    } else if (S.path === 'ruts') {
      // packed dirt: per-pixel smooth blend of three tones (no hard thresholds, no sub-pixel rects), painted
      // into a strip on integer pixels and composited through the path clip
      const nn = tileNoise(71, 8);
      const x0 = Math.floor(cx - pathHalf - 20), x1 = Math.ceil(cx + pathHalf + 20);
      const sw = x1 - x0;
      const strip = makeCanvas(sw, H);
      const sg = strip.getContext('2d');
      const sd = sg.createImageData(sw, H);
      const [c0, c1, c2] = pc.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
      const sm = (e0, e1, v) => {
        const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
      };
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < sw; x++) {
          const v = nn(x0 + x, y, W, H);
          const dark = sm(0.45, 0.35, v), light = sm(0.5, 0.62, v);
          const i = (y * sw + x) * 4;
          for (let k = 0; k < 3; k++) sd.data[i + k] = c0[k] + (c1[k] - c0[k]) * dark + (c2[k] - c0[k]) * light;
          sd.data[i + 3] = 255;
        }
      }
      sg.putImageData(sd, 0, 0);
      g.drawImage(strip, x0, 0);
      g.strokeStyle = 'rgba(110,70,30,0.45)';
      g.lineWidth = 9;
      for (const off of [-4.2, 4.2]) {
        g.beginPath();
        g.moveTo(cx + off * px, 0);
        g.lineTo(cx + off * px, H);
        g.stroke();
      }
      blobs(g, W, H, 40, r, { rMin: 1.5, rMax: 3.2, colors: ['rgba(90,60,30,0.5)', 'rgba(255,230,190,0.5)'], wrap: false });
    } else if (S.path === 'boards') {
      const bw = 1.1 * px;
      for (let y = 0; y < H; y += bw) {
        g.fillStyle = pc[Math.floor(r() * pc.length)];
        g.fillRect(0, y, W, bw - 2);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, y + bw - 2, W, 2);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(0, y + 2, W, 2);
        // nails at the stringers
        g.fillStyle = 'rgba(40,40,40,0.8)';
        for (const sx of [-7, 0, 7]) {
          g.fillRect(cx + sx * px - 1.5, y + 3, 3, 3);
          g.fillRect(cx + sx * px - 1.5, y + bw - 7, 3, 3);
        }
      }
      // rails of moss
      g.fillStyle = 'rgba(122,143,58,0.35)';
      g.fillRect(cx - pathHalf - 30, 0, 26, H);
      g.fillRect(cx + pathHalf + 4, 0, 26, H);
    } else if (S.path === 'hex') {
      const R = 16;
      for (let row = -1; row < H / (R * 1.5) + 1; row++) {
        for (let col = -1; col < W / (R * 1.732) + 1; col++) {
          const hx = col * R * 1.732 + (row % 2) * R * 0.866;
          const hy = row * R * 1.5;
          g.fillStyle = pc[Math.floor(r() * pc.length)];
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            g.lineTo(hx + Math.cos(a) * (R - 1.5), hy + Math.sin(a) * (R - 1.5));
          }
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fill();
        }
      }
      // lava in the gaps (glow map)
      gg.save();
      gg.beginPath();
      gg.moveTo(cx - edge(0), 0);
      for (let y = 0; y <= H; y += 8) gg.lineTo(cx - edge(y), y);
      for (let y = H; y >= 0; y -= 8) gg.lineTo(cx + edge(y + 50), y);
      gg.closePath();
      gg.clip();
      gg.strokeStyle = '#ff5a10';
      gg.lineWidth = 2.5;
      for (let row = -1; row < H / (R * 1.5) + 1; row++) {
        for (let col = -1; col < W / (R * 1.732) + 1; col++) {
          if (r() > 0.3) continue;
          const hx = col * R * 1.732 + (row % 2) * R * 0.866;
          const hy = row * R * 1.5;
          gg.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            gg.lineTo(hx + Math.cos(a) * R, hy + Math.sin(a) * R);
          }
          gg.closePath();
          gg.stroke();
        }
      }
      gg.restore();
    } else if (S.path === 'crystal') {
      const T = 2.2 * px;
      for (let y = 0; y < H; y += T) {
        for (let x = cx - pathHalf - T * 2; x < cx + pathHalf + T * 2; x += T) {
          const k = Math.floor(r() * pc.length);
          g.fillStyle = pc[k];
          g.fillRect(x + 1, y + 1, T - 2, T - 2);
          const gr = g.createLinearGradient(x, y, x + T, y + T);
          gr.addColorStop(0, 'rgba(255,255,255,0.25)');
          gr.addColorStop(0.5, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(x + 1, y + 1, T - 2, T - 2);
          g.strokeStyle = 'rgba(160,230,255,0.55)';
          g.lineWidth = 1.2;
          g.strokeRect(x + 1, y + 1, T - 2, T - 2);
          if (r() < 0.25) {
            gg.fillStyle = r() < 0.5 ? '#6fd8ff' : '#d38bff';
            gg.globalAlpha = 0.55;
            gg.fillRect(x + 1, y + 1, T - 2, T - 2);
            gg.globalAlpha = 1;
          }
        }
      }
    }
    g.restore();
    const map = canvasTexture(c);
    const emissiveMap = glow ? canvasTexture(glow) : null;
    return { map, emissiveMap };
  });
}

// ------------------------------------------------------------------ icons & decals

/** Talavera-style mosaic ring around the spawn (Cabo plaza vibe). RGBA with transparent centre. */
export function mosaicTexture() {
  return once('mosaic', () => drawTexture(1024, 1024, (g, W) => {
    const c = W / 2;
    const ring = (r0, r1, n, colors, star) => {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        g.fillStyle = colors[i % colors.length];
        g.beginPath();
        g.arc(c, c, r1, a0, a1);
        g.arc(c, c, r0, a1, a0, true);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 3;
        g.stroke();
        if (star) {
          const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
          const x = c + Math.cos(am) * rm, y = c + Math.sin(am) * rm;
          g.fillStyle = star;
          g.beginPath();
          for (let k = 0; k < 8; k++) {
            const aa = (k / 8) * Math.PI * 2 + am;
            const rr = k % 2 ? (r1 - r0) * 0.16 : (r1 - r0) * 0.36;
            g.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
          }
          g.closePath();
          g.fill();
        }
      }
    };
    g.clearRect(0, 0, W, W);
    ring(420, 505, 36, ['#e8793a', '#d86a2c'], null); // terracotta border
    ring(330, 420, 24, ['#1f5fbf', '#f4f1e6', '#1ea6a0', '#f4f1e6'], '#ffcc33');
    ring(300, 330, 48, ['#f2b640', '#e8793a'], null);
  }));
}

/** Roblox SpawnLocation decal. */
export function spawnTexture() {
  return once('spawn', () => drawTexture(512, 512, (g, W) => {
    const c = W / 2;
    g.fillStyle = '#8f9aa6';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#b8c2cc';
    roundRect(g, 18, 18, W - 36, W - 36, 30);
    g.fill();
    // ring
    g.lineWidth = 26;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(c, c, 170, 0, Math.PI * 2);
    g.stroke();
    // four arrows/star
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(c, c);
      g.rotate((k * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -118);
      g.lineTo(46, -40);
      g.lineTo(-46, -40);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(c, c, 50, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffcf33';
    g.beginPath();
    g.arc(c, c, 30, 0, Math.PI * 2);
    g.fill();
  }));
}

/** COLLECT pad top: green glowing button with a big $ */
export function collectTexture() {
  return once('collect', () => drawTexture(256, 256, (g, W) => {
    const c = W / 2;
    const gr = g.createRadialGradient(c, c * 0.9, 10, c, c, c);
    gr.addColorStop(0, '#b8ffb0');
    gr.addColorStop(0.55, '#4be05a');
    gr.addColorStop(1, '#1f9e36');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, W);
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(c, c, c - 22, 0, Math.PI * 2);
    g.stroke();
    chunkyText(g, '$', c, c + 6, { size: 170, fill: '#ffffff', stroke: '#137a2a', strokeW: 22, shadow: false });
  }, { clamp: true }));
}

/** LOCK pad top: red button with a padlock. */
export function lockTexture() {
  return once('lock', () => drawTexture(256, 256, (g, W) => {
    const c = W / 2;
    const gr = g.createRadialGradient(c, c * 0.9, 10, c, c, c);
    gr.addColorStop(0, '#ffb3b3');
    gr.addColorStop(0.55, '#ff4b4b');
    gr.addColorStop(1, '#b3141e');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, W);
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(c, c, c - 22, 0, Math.PI * 2);
    g.stroke();
    // padlock
    g.lineWidth = 20;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(c, c - 18, 36, Math.PI, 0);
    g.lineTo(c + 36, c + 4);
    g.moveTo(c - 36, c - 18);
    g.lineTo(c - 36, c + 4);
    g.stroke();
    g.fillStyle = '#ffffff';
    roundRect(g, c - 58, c - 4, 116, 84, 16);
    g.fill();
    g.fillStyle = '#c71f2b';
    g.beginPath();
    g.arc(c, c + 28, 12, 0, Math.PI * 2);
    g.fill();
    g.fillRect(c - 5, c + 30, 10, 26);
  }, { clamp: true }));
}

