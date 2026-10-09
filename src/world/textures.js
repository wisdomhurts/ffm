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

/**
 * Layered cake for the Candy Canyon cliffs. Coloured (vertex colours tint each terrace's flavour), one tile =
 * 12 studs: box-projected, the sponge, cream, jam, wafer and chocolate layers run level along the whole canyon.
 */
export function cakeDetail() {
  return once('cake', () => drawTexture(256, 256, (g, w, h) => {
    const n = tileNoise(61, 6);
    // layers from the bottom of the tile up, in studs: [top edge, colour, kind]
    const L = [[3.2, [246, 214, 160], 'sponge'], [3.9, [255, 249, 240], 'cream'], [4.5, [236, 76, 122], 'jam'], [5.1, [255, 249, 240], 'cream'],
      [8.6, [255, 176, 206], 'wafer'], [9.3, [122, 70, 42], 'choc'], [9.9, [255, 249, 240], 'cream'], [12, [246, 214, 160], 'sponge']];
    pixels(g, w, h, (x, y) => {
      const v = n(x, y, w, h);
      const hs = ((h - y - 0.5) / h) * 12 + Math.sin((x / w) * Math.PI * 6) * 0.1 + (v - 0.5) * 0.25;
      const hh = ((hs % 12) + 12) % 12;
      let i = 0;
      while (i < L.length - 1 && hh >= L[i][0]) i++;
      const [, c, kind] = L[i];
      let k = 0.94 + (v - 0.5) * 0.12;
      // wafer: a diagonal waffle grid
      if (kind === 'wafer' && (Math.abs(((x + y) % 21) - 10.5) > 9.3 || Math.abs(((x - y + 512) % 21) - 10.5) > 9.3)) k *= 0.86;
      if (kind === 'cream' || kind === 'jam') k = 1 + (v - 0.5) * 0.06;
      return [c[0] * k, c[1] * k, c[2] * k];
    });
    // sponge pores
    const r = makeRand(62);
    for (let i = 0; i < 700; i++) {
      const x = r() * w, y = r() * h;
      const hh = ((h - y) / h) * 12;
      if (!(hh < 3.1 || hh > 10)) continue;
      g.fillStyle = r() < 0.7 ? 'rgba(160,110,50,0.28)' : 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(x, y, 0.8 + r() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }));
}

/** Soft billowy cloud detail (Cloud Kingdom cliffs and cloud floor, Candy Canyon frosting): grey, mean ~0.94. */
export function fluffDetail() {
  return once('fluff', () => drawTexture(256, 256, (g, w, h) => {
    const n = tileNoise(81, 3);
    const n2 = tileNoise(82, 8);
    pixels(g, w, h, (x, y) => {
      const b = n(x, y, w, h, 3);
      const v = 222 + Math.max(0, Math.min(1, (b - 0.35) * 2.4)) * 30 + (n2(x, y, w, h, 2) - 0.5) * 14;
      return [v, v, v];
    });
    const r = makeRand(83);
    blobs(g, w, h, 34, r, { rMin: 10, rMax: 26, colors: ['rgba(255,255,255,0.10)', 'rgba(210,215,235,0.10)'] });
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
  frostfall: { side: ['#e8f2fc', '#d3e3f4', '#f9fcff'], path: 'ice', pathCol: ['#b8e4fa', '#a2d8f4', '#cdeefd'], glow: '#ffffff' },
  candy: { side: ['#ffc6e2', '#ffb2d7', '#ffdcee'], path: 'candy', pathCol: ['#ff8cc6', '#7fe0cc', '#ffe97a', '#c4a4ff', '#86d0ff', '#ffb27a'], sprinkles: ['#ff3b6b', '#ffd23f', '#3fd0ff', '#7ee36b', '#b36bff', '#ffffff'] },
  cloud: { side: ['#f2f6ff', '#e4ebfa', '#ffffff'], path: 'marble', pathCol: ['#fffcf4', '#f5efe2', '#fbf7ee'], glow: '#ffd23f' },
};

/** Returns {map, emissiveMap?} for a biome road: 512px = 40 studs wide, 40 studs long. */
export function roadTexture(biomeId) {
  return once('road:' + biomeId, () => {
    const S = ROAD_STYLE[biomeId] || ROAD_STYLE.cloud;
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
    if (biomeId === 'frostfall') {
      // wind-swept drifts and glinting snow crystals
      blobs(g, W, H, 70, r, { rMin: 6, rMax: 18, colors: ['rgba(140,180,225,0.16)', 'rgba(255,255,255,0.45)'], shape: 'ellipse' });
      for (let i = 0; i < 240; i++) {
        const x = r() * W, y = r() * H, s = 0.8 + r() * 1.4;
        g.fillStyle = '#ffffff';
        g.fillRect(x, y, s, s);
        gg.fillStyle = r() < 0.6 ? '#ffffff' : '#9fe8ff';
        gg.globalAlpha = 0.25 + r() * 0.4;
        gg.fillRect(x - s * 0.5, y - s * 0.5, s * 2, s * 2);
        gg.globalAlpha = 1;
      }
    }
    if (biomeId === 'candy') {
      // pink frosting with sprinkles
      blobs(g, W, H, 50, r, { rMin: 8, rMax: 20, colors: ['rgba(255,255,255,0.22)', 'rgba(255,120,190,0.12)'] });
      for (let i = 0; i < 560; i++) {
        g.save();
        g.translate(r() * W, r() * H);
        g.rotate(r() * Math.PI);
        g.fillStyle = S.sprinkles[Math.floor(r() * S.sprinkles.length)];
        roundRect(g, -3.4, -1.2, 6.8, 2.4, 1.2);
        g.fill();
        g.restore();
      }
    }
    if (biomeId === 'cloud') {
      // cloud fluff with golden glints
      blobs(g, W, H, 90, r, { rMin: 8, rMax: 22, colors: ['rgba(255,255,255,0.6)', 'rgba(196,206,240,0.22)'] });
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H, s = 1 + r() * 1.6;
        g.fillStyle = '#ffe27a';
        g.fillRect(x, y, s, s);
        gg.fillStyle = '#ffd23f';
        gg.globalAlpha = 0.3 + r() * 0.4;
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
    } else if (S.path === 'ice') {
      // packed snow with rows of glassy ice slabs (11 rows per tile so it wraps)
      g.fillStyle = '#e4eef9';
      g.fillRect(0, 0, W, H);
      const RH = H / 11;
      for (let j = 0; j < 11; j++) {
        let x = cx - pathHalf - 30 + r() * 12;
        while (x < cx + pathHalf + 30) {
          const w = 34 + r() * 26;
          const x0 = x + 3, y0 = j * RH + 3, sw = w - 6, sh = RH - 6;
          g.fillStyle = pc[Math.floor(r() * pc.length)];
          roundRect(g, x0, y0, sw, sh, 10);
          g.fill();
          const gr = g.createLinearGradient(x0, y0, x0 + sw, y0 + sh);
          gr.addColorStop(0, 'rgba(255,255,255,0.6)');
          gr.addColorStop(0.35, 'rgba(255,255,255,0)');
          gr.addColorStop(0.62, 'rgba(255,255,255,0.18)');
          gr.addColorStop(0.75, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.lineWidth = 2;
          g.stroke();
          // a crack or two
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 1.2;
          for (let k = r.int(0, 2); k > 0; k--) {
            let px2 = x0 + r() * sw, py2 = y0 + r() * sh;
            g.beginPath();
            g.moveTo(px2, py2);
            for (let q = 0; q < 3; q++) g.lineTo((px2 += (r() - 0.5) * 16), (py2 += (r() - 0.5) * 12));
            g.stroke();
          }
          if (r() < 0.5) {
            gg.fillStyle = '#bff4ff';
            gg.globalAlpha = 0.35;
            gg.fillRect(x0 + 4 + r() * (sw - 10), y0 + 3 + r() * (sh - 8), 3, 3);
            gg.globalAlpha = 1;
          }
          x += w;
        }
      }
    } else if (S.path === 'candy') {
      // glossy candy tiles in a board-game rainbow (16 rows per tile)
      const T = H / 16;
      g.fillStyle = '#fff3fa';
      g.fillRect(0, 0, W, H);
      for (let j = 0; j < 16; j++) {
        for (let i = -9; i <= 9; i++) {
          const x = cx + i * T - T / 2, y = j * T;
          g.fillStyle = pc[(((i + j * 2) % pc.length) + pc.length) % pc.length];
          roundRect(g, x + 2.5, y + 2.5, T - 5, T - 5, 9);
          g.fill();
          g.strokeStyle = 'rgba(120,40,90,0.18)';
          g.lineWidth = 2;
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.5)';
          roundRect(g, x + 7, y + 6, T - 18, 5, 2.5);
          g.fill();
          g.beginPath();
          g.arc(x + T - 9, y + T - 10, 2.2, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fill();
        }
      }
    } else if (S.path === 'marble') {
      // white marble slabs with golden inlay and golden stars down the middle (10 rows per tile)
      const T = H / 10;
      for (let j = 0; j < 10; j++) {
        for (let i = -3; i < 3; i++) {
          const x = cx + i * T, y = j * T;
          g.fillStyle = pc[Math.floor(r() * pc.length)];
          g.fillRect(x, y, T, T);
          g.strokeStyle = 'rgba(170,160,190,0.28)';
          g.lineWidth = 1.2;
          for (let k = 0; k < 2; k++) {
            let px2 = x + r() * T, py2 = y;
            g.beginPath();
            g.moveTo(px2, py2);
            for (let q = 0; q < 4; q++) g.lineTo((px2 += (r() - 0.5) * 22), (py2 += T / 4));
            g.stroke();
          }
        }
      }
      gg.save();
      gg.beginPath();
      gg.moveTo(cx - edge(0), 0);
      for (let y = 0; y <= H; y += 8) gg.lineTo(cx - edge(y), y);
      for (let y = H; y >= 0; y -= 8) gg.lineTo(cx + edge(y + 50), y);
      gg.closePath();
      gg.clip();
      for (const [ctx, colr, a, lw] of [[g, '#e0ac2c', 1, 3.5], [gg, '#ffd23f', 0.45, 3.5]]) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = colr;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let i = -3; i <= 3; i++) {
          ctx.moveTo(cx + i * T, 0);
          ctx.lineTo(cx + i * T, H);
        }
        for (let j = 0; j <= 10; j++) {
          ctx.moveTo(0, j * T);
          ctx.lineTo(W, j * T);
        }
        ctx.stroke();
        // four-point stars on the slab corners down the middle
        ctx.fillStyle = colr;
        for (let j = 0; j <= 10; j++) {
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const aa = (k / 8) * Math.PI * 2, rr = k % 2 ? 3.5 : 11;
            ctx.lineTo(cx + Math.cos(aa) * rr, j * T + Math.sin(aa) * rr);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      gg.restore();
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

// ------------------------------------------------------------------ Base Studio: garden floors and fences

const TAU = Math.PI * 2;
const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mixRgb = (a, b, t, k = 1) => [(a[0] + (b[0] - a[0]) * t) * k, (a[1] + (b[1] - a[1]) * t) * k, (a[2] + (b[2] - a[2]) * t) * k];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Per-pixel painting of smooth (low-frequency) colour at 1/k resolution, scaled up: these floors are painted
// the first time a Base Studio choice shows, so they have to be quick. f gets full-resolution coordinates.
function lowRes(g, w, h, k, f) {
  const c = makeCanvas(w / k, h / k);
  pixels(c.getContext('2d'), w / k, h / k, (x, y) => f(x * k + k / 2, y * k + k / 2));
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(c, 0, 0, w, h);
  g.restore();
}

// Soft tileable light/dark variation over whatever is painted (overlay blend).
function noiseOverlay(g, w, h, seed, period, alpha, k = 4) {
  const n = tileNoise(seed, period);
  const c = makeCanvas(w / k, h / k);
  pixels(c.getContext('2d'), w / k, h / k, (x, y) => {
    const v = 50 + n(x * k, y * k, w, h, 3) * 156;
    return [v, v, v];
  });
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'overlay';
  g.imageSmoothingEnabled = true;
  g.drawImage(c, 0, 0, w, h);
  g.restore();
}

// Bevelled square tile: light top/left edge, dark bottom/right edge.
function bevelTile(g, x0, y0, sw, sh, b, fill, light, dark) {
  g.fillStyle = fill;
  g.fillRect(x0, y0, sw, sh);
  g.fillStyle = light;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x0 + sw, y0);
  g.lineTo(x0 + sw - b, y0 + b);
  g.lineTo(x0 + b, y0 + b);
  g.lineTo(x0 + b, y0 + sh - b);
  g.lineTo(x0, y0 + sh);
  g.closePath();
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(x0 + sw, y0 + sh);
  g.lineTo(x0, y0 + sh);
  g.lineTo(x0 + b, y0 + sh - b);
  g.lineTo(x0 + sw - b, y0 + sh - b);
  g.lineTo(x0 + sw - b, y0 + b);
  g.lineTo(x0 + sw, y0);
  g.closePath();
  g.fill();
}

// Calls fn(x, y) for every copy of a shape of radius r at (x, y) that shows on a wrapping w x h tile.
function wrapped(w, h, x, y, r, fn) {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      const px = x + ox, py = y + oy;
      if (px > -r && px < w + r && py > -r && py < h + r) fn(px, py);
    }
  }
}

// Short grass blade strokes; `lean` tilts them (mowed stripes lean one way, then the other).
function blades(g, w, h, r, n, lean = () => 0) {
  g.lineWidth = 1.3;
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, l = 3 + r() * 4;
    g.strokeStyle = r() < 0.55 ? `rgba(255,255,255,${0.12 + r() * 0.16})` : `rgba(0,40,0,${0.07 + r() * 0.1})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + lean(x, y) + (r() - 0.5) * 2.5, y - l);
    g.stroke();
  }
}

function flower5(g, x, y, rad, petal, centre, rot) {
  for (const [ox, oy, col] of [[1, 1.6, 'rgba(20,70,20,0.28)'], [0, 0, petal]]) {
    g.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = rot + (k / 5) * TAU;
      g.beginPath();
      g.ellipse(x + ox + Math.cos(a) * rad * 0.55, y + oy + Math.sin(a) * rad * 0.55, rad * 0.52, rad * 0.38, a, 0, TAU);
      g.fill();
    }
  }
  g.fillStyle = centre;
  g.beginPath();
  g.arc(x, y, rad * 0.32, 0, TAU);
  g.fill();
}

function starfish(g, x, y, R, rot, col) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const path = (ox, oy) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? R * 0.42 : R;
      g.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
    }
    g.closePath();
  };
  g.lineJoin = 'round';
  g.lineWidth = R * 0.34;
  path(1.2, 2);
  g.fillStyle = g.strokeStyle = 'rgba(140,90,30,0.28)';
  g.stroke();
  g.fill();
  path(0, 0);
  g.fillStyle = g.strokeStyle = col;
  g.stroke();
  g.fill();
  g.fillStyle = 'rgba(255,240,215,0.9)';
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    for (const d of [0.3, 0.62]) {
      g.beginPath();
      g.arc(Math.cos(a) * R * d, Math.sin(a) * R * d, R * 0.08, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

function scallop(g, x, y, R, rot, col, rib) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const cy = R * 0.45;
  const fan = (ox, oy) => {
    g.beginPath();
    g.moveTo(ox, cy + oy);
    g.arc(ox, cy + oy, R, Math.PI * 1.12, Math.PI * 1.88);
    g.closePath();
    g.fill();
    for (let k = 0; k <= 6; k++) {
      const a = Math.PI * (1.12 + (0.76 * k) / 6);
      g.beginPath();
      g.arc(ox + Math.cos(a) * R, cy + oy + Math.sin(a) * R, R * 0.13, 0, TAU);
      g.fill();
    }
  };
  g.fillStyle = 'rgba(140,90,30,0.25)';
  fan(1.2, 2);
  g.fillStyle = col;
  fan(0, 0);
  g.strokeStyle = rib;
  g.lineWidth = Math.max(1, R * 0.08);
  for (let k = 1; k < 6; k++) {
    const a = Math.PI * (1.12 + (0.76 * k) / 6);
    g.beginPath();
    g.moveTo(0, cy);
    g.lineTo(Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
    g.stroke();
  }
  g.fillStyle = rib;
  g.fillRect(-R * 0.26, cy - R * 0.08, R * 0.52, R * 0.2);
  g.restore();
}

function peppermint(g, x, y, R, rot, red) {
  g.fillStyle = 'rgba(160,40,90,0.22)';
  g.beginPath();
  g.arc(x + 1.5, y + 2.5, R, 0, TAU);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x, y, R, 0, TAU);
  g.fill();
  g.fillStyle = red;
  const arms = 6;
  for (let k = 0; k < arms; k++) {
    const a0 = rot + (k / arms) * TAU, a1 = a0 + (0.5 / arms) * TAU;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 1; s <= 8; s++) {
      const rr = (R * s) / 8, a = a0 + (s / 8) * 1.3;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    for (let s = 8; s >= 1; s--) {
      const rr = (R * s) / 8, a = a1 + (s / 8) * 1.3;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(200,40,110,0.55)';
  g.beginPath();
  g.arc(x, y, R, 0, TAU);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(x, y, R * 0.72, Math.PI * 1.1, Math.PI * 1.45);
  g.stroke();
}

// One painter per Base Studio floor (the classic lawn is lawnTexture). Coloured: the floor mesh is white.
// studs = world studs one tile covers.
const FLOOR_PAINTERS = {
  stripes: () => ({
    studs: 8,
    map: drawTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#8ade62';
      g.fillRect(0, 0, w, h / 2);
      g.fillStyle = '#58ad38';
      g.fillRect(0, h / 2, w, h / 2);
      noiseOverlay(g, w, h, 71, 6, 0.35);
      blades(g, w, h, makeRand(72), 1500, (x, y) => (Math.floor((y / h) * 2) % 2 ? 2.2 : -2.2));
    }),
  }),
  checker: () => ({
    studs: 8,
    map: drawTexture(256, 256, (g, w, h) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = (i + (i >> 1)) % 2 ? '#58b43c' : '#98e571';
        g.fillRect((i % 2) * 128, (i >> 1) * 128, 128, 128);
      }
      noiseOverlay(g, w, h, 73, 6, 0.35);
      blades(g, w, h, makeRand(74), 1300);
    }),
  }),
  meadow: () => ({
    studs: 12,
    map: drawTexture(256, 256, (g, w, h) => {
      const n = tileNoise(75, 5);
      const A = hexRgb('#a6e476'), B = hexRgb('#79c654');
      lowRes(g, w, h, 4, (x, y) => {
        const v = n(x, y, w, h);
        return mixRgb(A, B, clamp01((v - 0.35) * 2.2), 0.96 + v * 0.08);
      });
      const r = makeRand(76);
      blades(g, w, h, r, 900);
      const cols = [['#ff8cc6', '#ffe14d'], ['#ffffff', '#ffc23f'], ['#ffe14d', '#ff8a3a'], ['#c9a0ff', '#fff3a0'], ['#ff6b8a', '#ffe8a0'], ['#8fd0ff', '#ffffff']];
      for (let i = 0; i < 44; i++) {
        const x = r() * w, y = r() * h, rad = 5.5 + r() * 3.5, [pc, cc] = r.pick(cols), rot = r() * TAU;
        wrapped(w, h, x, y, rad * 1.4, (px, py) => flower5(g, px, py, rad, pc, cc, rot));
      }
      // little leaf pairs between the flowers
      for (let i = 0; i < 40; i++) {
        const x = r() * w, y = r() * h, a = r() * TAU;
        g.fillStyle = r() < 0.5 ? '#5aa83c' : '#6cc04a';
        wrapped(w, h, x, y, 6, (px, py) => {
          for (const s of [-1, 1]) {
            g.beginPath();
            g.ellipse(px + Math.cos(a) * 3 * s, py + Math.sin(a) * 3 * s, 3.4, 1.6, a, 0, TAU);
            g.fill();
          }
        });
      }
    }),
  }),
  beach: () => ({
    studs: 12,
    map: drawTexture(256, 256, (g, w, h) => {
      const n = tileNoise(77, 5);
      const A = hexRgb('#f7e2a8'), B = hexRgb('#e4c074');
      lowRes(g, w, h, 2, (x, y) => {
        const v = n(x, y, w, h);
        const rip = Math.sin((y / h) * TAU * 6 + (x / w) * TAU + v * 7) * 0.5 + 0.5;
        return mixRgb(A, B, clamp01((v - 0.32) * 1.7), 0.95 + rip * 0.07);
      });
      const r = makeRand(78);
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(120,80,20,0.16)' : 'rgba(255,255,255,0.4)';
        g.fillRect(r() * w, r() * h, 1.6, 1.6);
      }
      for (let i = 0; i < 12; i++) {
        const x = r() * w, y = r() * h, rx = 2 + r() * 3, rot = r() * 3;
        g.fillStyle = r.pick(['#c9c2b6', '#b8b0a4', '#e8e2d8']);
        wrapped(w, h, x, y, rx + 2, (px, py) => {
          g.beginPath();
          g.ellipse(px, py, rx, rx * 0.7, rot, 0, TAU);
          g.fill();
        });
      }
      for (let i = 0; i < 7; i++) {
        const x = r() * w, y = r() * h, R = 8 + r() * 4, rot = r() * TAU;
        const [c, rib] = r.pick([['#ffd6e0', '#e89aae'], ['#fff4e6', '#d9b48a'], ['#ffc8a8', '#e0906a'], ['#f4e0ff', '#c29ad8']]);
        wrapped(w, h, x, y, R + 3, (px, py) => scallop(g, px, py, R, rot, c, rib));
      }
      for (let i = 0; i < 4; i++) {
        const x = r() * w, y = r() * h, R = 10 + r() * 4, rot = r() * TAU, c = r.pick(['#ff8a5c', '#ff6f61', '#ffa63d']);
        wrapped(w, h, x, y, R + 4, (px, py) => starfish(g, px, py, R, rot, c));
      }
    }),
  }),
  stone: () => ({
    studs: 16,
    map: drawTexture(512, 512, (g, w, h) => {
      const r = makeRand(80);
      const tones = [['#d3d6de', '#e4e6ec', '#a9adb8'], ['#bcc0ca', '#d0d3db', '#979ca8'], ['#c7cad3', '#dadce3', '#a2a6b2'], ['#b0b5bf', '#c6cad2', '#8e939f']];
      g.fillStyle = '#80848e';
      g.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const x0 = col * 128 + (row % 2 ? 64 : 0);
          const [f, lt, dk] = r.pick(tones);
          for (const ox of [0, -w]) bevelTile(g, x0 + ox + 4, row * 128 + 4, 120, 120, 9, f, lt, dk);
        }
      }
      noiseOverlay(g, w, h, 79, 8, 0.5);
      g.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        let x = r() * w, y = r() * h;
        g.strokeStyle = 'rgba(70,74,84,0.35)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += (r() - 0.5) * 22;
          y += (r() - 0.5) * 22;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // moss in the grout
      for (let i = 0; i < 90; i++) {
        const row = r.int(0, 3), onRow = r() < 0.5;
        const x = onRow ? r() * w : ((r.int(0, 3) * 128 + (row % 2 ? 64 : 0)) % w) + r.range(-3, 3);
        const y = onRow ? row * 128 + r.range(-3, 3) : row * 128 + r() * 128;
        g.fillStyle = r() < 0.5 ? 'rgba(96,160,70,0.7)' : 'rgba(120,180,80,0.6)';
        g.beginPath();
        g.arc(x, y, 1.5 + r() * 2.5, 0, TAU);
        g.fill();
      }
    }),
  }),
  candy: () => ({
    studs: 12,
    map: drawTexture(256, 256, (g, w, h) => {
      const A = hexRgb('#ffc2e0'), W = [255, 250, 253];
      pixels(g, w, h, (x, y) => {
        const u = x / w, v = y / h;
        const s = Math.sin((u + v) * TAU * 2 + Math.sin((u - v) * TAU * 2) * 1.3);
        const t = clamp01((s - 0.45) * 5);
        return mixRgb(A, W, t, 1 - (1 - t) * (0.04 * Math.sin((u - v) * TAU * 3) + 0.03));
      });
      const r = makeRand(82);
      const reds = ['#ff4f8e', '#ff6fb0', '#ff5a7a'];
      for (let i = 0; i < 3; i++) {
        const x = r() * w, y = r() * h, R = 22 + r() * 12, rot = r() * TAU, c = reds[i % 3];
        wrapped(w, h, x, y, R + 3, (px, py) => peppermint(g, px, py, R, rot, c));
      }
      g.lineWidth = 2.6;
      g.lineCap = 'round';
      for (let i = 0; i < 80; i++) {
        const x = r() * w, y = r() * h, a = r() * TAU;
        g.strokeStyle = r.pick(['#ff3b6b', '#ffd23f', '#3fd0ff', '#7ee36b', '#b36bff', '#ffffff']);
        wrapped(w, h, x, y, 5, (px, py) => {
          g.beginPath();
          g.moveTo(px - Math.cos(a) * 3, py - Math.sin(a) * 3);
          g.lineTo(px + Math.cos(a) * 3, py + Math.sin(a) * 3);
          g.stroke();
        });
      }
    }),
  }),
  cloud: () => ({
    studs: 16,
    map: drawTexture(256, 256, (g, w, h) => {
      const n = tileNoise(83, 4);
      const A = hexRgb('#9ed2ff'), B = hexRgb('#7dbcf6');
      lowRes(g, w, h, 4, (x, y) => mixRgb(A, B, n(x, y, w, h)));
      const r = makeRand(84);
      const puffs = [];
      for (let i = 0; i < 9; i++) {
        const cx = r() * w, cy = r() * h, k = r.int(5, 8);
        for (let j = 0; j < k; j++) puffs.push([cx + r.range(-28, 28), cy + r.range(-14, 14), r.range(12, 25)]);
      }
      for (const [col, ox, oy, s] of [['#b8c8ee', 3, 6, 1.04], ['#e6eefc', 1, 2, 0.97], ['#ffffff', -1, -1, 0.86], ['rgba(255,255,255,0.95)', -4, -5, 0.5]]) {
        g.fillStyle = col;
        for (const [x, y, rr] of puffs) {
          wrapped(w, h, x, y, rr + 5, (px, py) => {
            g.beginPath();
            g.arc(px + ox, py + oy, rr * s, 0, TAU);
            g.fill();
          });
        }
      }
      g.fillStyle = 'rgba(255,236,150,0.95)';
      for (let i = 0; i < 14; i++) {
        const x = r() * w, y = r() * h;
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU, rr = k % 2 ? 1.3 : 4;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }
    }),
  }),
  // Starry night: a dark nebula map plus an emissive star map; each star sits alone in one cell of a
  // cells x cells grid so the floor shader can twinkle every star on its own.
  space: () => {
    const S = 512, cells = 32, cw = S / cells;
    const map = drawTexture(S, S, (g, w, h) => {
      const n = tileNoise(91, 4);
      const n2 = tileNoise(92, 6);
      const A = hexRgb('#1a1446'), B = hexRgb('#2d2468'), P = hexRgb('#5b2d8e'), T = hexRgb('#1d4f86');
      lowRes(g, w, h, 4, (x, y) => {
        const v = n(x, y, w, h), v2 = n2(x, y, w, h, 3);
        let c = mixRgb(A, B, v);
        c = mixRgb(c, P, clamp01((v2 - 0.58) * 3) * 0.7);
        return mixRgb(c, T, clamp01((0.4 - v2) * 3) * 0.6);
      });
      const r = makeRand(93);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.35})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
      // ringed planets and a little moon per tile
      const planet = (x, y, R, body, ring) => {
        wrapped(w, h, x, y, R * 2.2, (px, py) => {
          const gr = g.createRadialGradient(px - R * 0.35, py - R * 0.35, R * 0.1, px, py, R);
          gr.addColorStop(0, '#ffffff');
          gr.addColorStop(0.25, body);
          gr.addColorStop(1, 'rgba(20,10,40,1)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(px, py, R, 0, TAU);
          g.fill();
          if (ring) {
            g.strokeStyle = ring;
            g.lineWidth = 3;
            g.beginPath();
            g.ellipse(px, py, R * 1.9, R * 0.5, -0.4, 0, TAU);
            g.stroke();
          }
        });
      };
      planet(r() * w, r() * h, 22, '#ff9f5a', 'rgba(255,220,160,0.9)');
      planet(r() * w, r() * h, 12, '#8fd8ff', null);
      planet(r() * w, r() * h, 9, '#ff7ad9', 'rgba(255,190,240,0.8)');
    });
    const emissiveMap = drawTexture(S, S, (g) => {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, S, S);
      const r = makeRand(94);
      for (let cy = 0; cy < cells; cy++) {
        for (let cx = 0; cx < cells; cx++) {
          if (r() > 0.42) continue;
          const x = cx * cw + r.range(4, cw - 4), y = cy * cw + r.range(4, cw - 4);
          const col = r.pick(['#ffffff', '#ffffff', '#cfeaff', '#fff0b0', '#ffc6f0']);
          g.fillStyle = col;
          g.strokeStyle = col;
          if (r() < 0.16) {
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(x - 3.6, y);
            g.lineTo(x + 3.6, y);
            g.moveTo(x, y - 3.6);
            g.lineTo(x, y + 3.6);
            g.stroke();
            g.beginPath();
            g.arc(x, y, 1.6, 0, TAU);
            g.fill();
          } else {
            g.beginPath();
            g.arc(x, y, 0.8 + r() * 1.2, 0, TAU);
            g.fill();
          }
        }
      }
    });
    return { studs: 24, map, emissiveMap, cells };
  },
  gold: () => ({
    studs: 8,
    map: drawTexture(256, 256, (g) => {
      g.fillStyle = '#9a6a10';
      g.fillRect(0, 0, 256, 256);
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          const x0 = tx * 128 + 3, y0 = ty * 128 + 3, s = 122, b = 9;
          const gr = g.createLinearGradient(x0, y0, x0 + s, y0 + s);
          gr.addColorStop(0, '#fff2ae');
          gr.addColorStop(0.45, '#ffd23f');
          gr.addColorStop(1, '#eeb127');
          g.fillStyle = gr;
          g.fillRect(x0, y0, s, s);
          g.fillStyle = '#fff8d6';
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x0 + s, y0);
          g.lineTo(x0 + s - b, y0 + b);
          g.lineTo(x0 + b, y0 + b);
          g.lineTo(x0 + b, y0 + s - b);
          g.lineTo(x0, y0 + s);
          g.closePath();
          g.fill();
          g.fillStyle = '#c48612';
          g.beginPath();
          g.moveTo(x0 + s, y0 + s);
          g.lineTo(x0, y0 + s);
          g.lineTo(x0 + b, y0 + s - b);
          g.lineTo(x0 + s - b, y0 + s - b);
          g.lineTo(x0 + s - b, y0 + b);
          g.lineTo(x0 + s, y0);
          g.closePath();
          g.fill();
          // embossed diamond
          const cx = x0 + s / 2, cy = y0 + s / 2, d = 24;
          g.fillStyle = 'rgba(255,250,215,0.6)';
          g.strokeStyle = 'rgba(170,110,10,0.55)';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(cx, cy - d);
          g.lineTo(cx + d, cy);
          g.lineTo(cx, cy + d);
          g.lineTo(cx - d, cy);
          g.closePath();
          g.fill();
          g.stroke();
          // glint
          g.fillStyle = 'rgba(255,255,255,0.95)';
          const gx = x0 + 26, gy = y0 + 26;
          g.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU, rr = k % 2 ? 1.6 : 7;
            g.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr);
          }
          g.closePath();
          g.fill();
        }
      }
    }),
  }),
};

/** A Base Studio floor ('stripes' ... 'gold'): {map, emissiveMap?, cells?, studs}. Painted on first use. */
export function floorTexture(id) {
  return FLOOR_PAINTERS[id] ? once('floor:' + id, FLOOR_PAINTERS[id]) : null;
}

/** Leafy hedge (coloured), box-projected: one tile = 4 studs. */
export function hedgeTexture() {
  return once('hedge', () => drawTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2b7329';
    g.fillRect(0, 0, w, h);
    const r = makeRand(101);
    const greens = ['#3f9e3a', '#4cb043', '#358a32', '#5cc050', '#2f8030', '#66cc5c'];
    for (let i = 0; i < 700; i++) {
      const x = r() * w, y = r() * h, rl = 8 + r() * 7, rot = r() * TAU, c = r.pick(greens), hi = r() < 0.35;
      wrapped(w, h, x, y, rl + 2, (px, py) => {
        g.fillStyle = 'rgba(10,50,10,0.35)';
        g.beginPath();
        g.ellipse(px + 1.2, py + 2, rl, rl * 0.55, rot, 0, TAU);
        g.fill();
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(px, py, rl, rl * 0.55, rot, 0, TAU);
        g.fill();
        if (hi) {
          g.fillStyle = 'rgba(210,255,170,0.35)';
          g.beginPath();
          g.ellipse(px - rl * 0.2, py - rl * 0.15, rl * 0.45, rl * 0.2, rot, 0, TAU);
          g.fill();
        }
      });
    }
  }));
}

/** Castle wall stone blocks (coloured), box-projected: one tile = 4 studs, blocks 2 studs long and 1 tall. */
export function castleTexture() {
  return once('castle', () => drawTexture(256, 256, (g, w, h) => {
    const r = makeRand(112);
    g.fillStyle = '#707480';
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        const x0 = col * 128 + (row % 2 ? 64 : 0), k = 0.86 + r() * 0.2;
        const tone = (m) => { const v = Math.min(255, Math.round(192 * k * m)); return `rgb(${v},${Math.min(255, Math.round(v * 1.01))},${Math.min(255, Math.round(v * 1.07))})`; };
        for (const ox of [0, -w]) bevelTile(g, x0 + ox + 3, row * 64 + 3, 122, 58, 7, tone(1), tone(1.12), tone(0.82));
      }
    }
    noiseOverlay(g, w, h, 111, 6, 0.5);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() < 0.6 ? 'rgba(90,150,70,0.55)' : 'rgba(40,44,56,0.25)';
      g.beginPath();
      g.arc(r() * w, r.int(0, 3) * 64 + r.range(-2, 2), 1.5 + r() * 2.5, 0, TAU);
      g.fill();
    }
  }));
}

/** Red and white candy-cane stripes for cylinders (u around, v along): 2 stripes around, 8 along. */
export function candyStripeTexture() {
  return once('candyStripe', () => drawTexture(64, 256, (g, w, h) => {
    const R = [255, 58, 92], W = [255, 255, 255];
    pixels(g, w, h, (x, y) => {
      const p = ((x + 0.5) / w) * 2 + ((y + 0.5) / h) * 8, f = p - Math.floor(p);
      const s = f < 0.5 ? Math.min(f, 0.5 - f) : -Math.min(f - 0.5, 1 - f);
      return mixRgb(W, R, clamp01(0.5 + s / 0.05));
    });
  }));
}

