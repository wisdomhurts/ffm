// Procedural canvas textures for the family outfits (what they wore in the Cabo sunset photo).
// Body parts are boxes whose six sides are packed into one atlas per part:
//   torso atlas: 6 x 3 studs  (front 2x2, back 2x2, +x side 1x2, -x side 1x2, top 2x1, bottom 2x1)
//   limb atlas:  5 x 2 studs  (front, back, +x, -x: 1x2 each; top 1x1 and bottom 1x1 stacked)
// In every side region the canvas top is the top of the part. On the front, canvas-left is the
// character's right hand side (-x). Characters face +Z; their right is -X.
import { familyFaceData, loadImage } from './faces.js';

export const PPU = 112; // canvas pixels per stud

// [x, y, w, h] in studs, canvas coordinates (y down)
export const TORSO_ATLAS = {
  size: [6, 3],
  px: [4, 0, 1, 2], nx: [5, 0, 1, 2], py: [0, 2, 2, 1], ny: [2, 2, 2, 1], pz: [0, 0, 2, 2], nz: [2, 0, 2, 2],
};
export const LIMB_ATLAS = {
  size: [5, 2],
  px: [2, 0, 1, 2], nx: [3, 0, 1, 2], py: [4, 0, 1, 1], ny: [4, 1, 1, 1], pz: [0, 0, 1, 2], nz: [1, 0, 1, 2],
};
const SIDES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

/** UV rects [u0, v0, u1, v1] in the geometry's side order (px, nx, py, ny, pz, nz). */
export function atlasRects(atlas) {
  const [W, H] = atlas.size;
  return SIDES.map((k) => {
    const [x, y, w, h] = atlas[k];
    return [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];
  });
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const px = (studs) => studs * PPU;
const rect = (atlas, side) => atlas[side].map(px);

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f < 0) {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  } else {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16);
  const b = parseInt(h2.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// ------------------------------------------------------------------ family face print

let printImgs = null;
let printPromise = null;
/** Loads the four family avatar photos used by Dorian's face-print shirt (cached). */
export function loadFacePrint() {
  if (printPromise) return printPromise;
  printPromise = Promise.all(['dorian', 'esther', 'maddie', 'micah'].map((id) => {
    const d = familyFaceData(id);
    return loadImage(d?.avatar || d?.face || null);
  })).then((imgs) => {
    printImgs = imgs.filter(Boolean);
    return printImgs;
  });
  return printPromise;
}
export const facePrintReady = () => printImgs;

function drawFaceDot(g, x, y, r, img, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(0, 0, r + Math.max(2, r * 0.13), 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.clip();
  if (img) {
    // photos are face crops: zoom a little so the face fills the dot
    const z = 1.3;
    const s = r * 2 * z;
    g.drawImage(img, -s / 2, -s * 0.46, s, s);
  } else {
    g.fillStyle = '#ffd23f';
    g.fillRect(-r, -r, r * 2, r * 2);
    g.fillStyle = '#111';
    g.beginPath();
    g.ellipse(-r * 0.33, -r * 0.2, r * 0.11, r * 0.19, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.33, -r * 0.2, r * 0.11, r * 0.19, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = r * 0.14;
    g.strokeStyle = '#111';
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, r * 0.02, r * 0.5, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
  g.restore();
}

function patternFacePrint(g, w, h, look, seed) {
  const r = rng(seed);
  g.fillStyle = look.shirtColor;
  g.fillRect(0, 0, w, h);
  const imgs = printImgs && printImgs.length ? printImgs : [null];
  const step = px(0.6);
  const rad = px(0.19);
  let k = 0;
  let row = 0;
  for (let y = step * 0.35; y < h + step; y += step * 0.87, row++) {
    for (let x = (row % 2 ? step * 0.5 : 0) + step * 0.3; x < w + step; x += step) {
      drawFaceDot(g, x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, rad, imgs[(k + row) % imgs.length], (r() - 0.5) * 0.7);
      k++;
    }
  }
  // party confetti between the faces
  g.fillStyle = look.shirtColor2;
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.arc(x, y, 1.6 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
}

// ------------------------------------------------------------------ other prints

function palmLeaf(g, x, y, len, rot, color) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = Math.max(1.5, len * 0.05);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * 0.12, len, 0);
  g.stroke();
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const bx = len * t;
    const by = -len * 0.12 * 4 * t * (1 - t) * 0.5;
    const l = len * 0.42 * Math.sin(Math.PI * (0.15 + 0.85 * t)) + len * 0.06;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(bx - len * 0.03, by);
      g.quadraticCurveTo(bx + l * 0.35, by + side * l * 0.55, bx + l * 0.62, by + side * l * 0.95);
      g.quadraticCurveTo(bx + l * 0.2, by + side * l * 0.35, bx + len * 0.05, by);
      g.fill();
    }
  }
  g.restore();
}

function patternHawaiian(g, w, h, look, seed) {
  const r = rng(seed);
  g.fillStyle = look.shirtColor;
  g.fillRect(0, 0, w, h);
  const step = px(0.8);
  for (let y = -step * 0.5; y < h + step; y += step * 0.8) {
    for (let x = -step * 0.5; x < w + step; x += step) {
      const len = px(0.5 + r() * 0.3);
      const c = r() < 0.72 ? look.shirtColor2 : shade(look.shirtColor2, -0.25);
      palmLeaf(g, x + r() * step, y + r() * step * 0.8, len, r() * Math.PI * 2, c);
    }
  }
  // a few pale hibiscus accents
  for (let i = 0; i < (w * h) / (px(1) * px(1)) * 1.3; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = px(0.07 + r() * 0.05);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s, s * 0.65, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(x, y, s * 0.45, 0, Math.PI * 2);
    g.fill();
  }
}

function flower(g, x, y, s, petal, center) {
  g.fillStyle = petal;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.62, s * 0.55, s * 0.4, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = center;
  g.beginPath();
  g.arc(x, y, s * 0.3, 0, Math.PI * 2);
  g.fill();
}

const FLORAL_BASE = '#fbf1ea';
function patternFloral(g, w, h, look, seed) {
  const r = rng(seed);
  g.fillStyle = FLORAL_BASE;
  g.fillRect(0, 0, w, h);
  const step = px(0.5);
  const leaf = ['#4caf6a', '#2e8b57', '#7bcf7b'];
  const petals = [look.shirtColor2, '#ff4f9a', '#ffb3d1', look.shirtColor2];
  for (let y = -step * 0.3; y < h + step; y += step * 0.75) {
    for (let x = -step * 0.3; x < w + step; x += step * 0.9) {
      const fx = x + r() * step * 0.6;
      const fy = y + r() * step * 0.6;
      const s = px(0.1 + r() * 0.07);
      g.fillStyle = leaf[(r() * 3) | 0];
      for (let l = 0; l < 2; l++) {
        const a = r() * Math.PI * 2;
        g.beginPath();
        g.ellipse(fx + Math.cos(a) * s * 1.2, fy + Math.sin(a) * s * 1.2, s * 0.7, s * 0.3, a, 0, Math.PI * 2);
        g.fill();
      }
      flower(g, fx, fy, s, petals[(r() * petals.length) | 0], r() < 0.5 ? '#ffe066' : '#ffffff');
    }
  }
}

function patternDress(g, w, h, look) {
  g.fillStyle = look.shirtColor;
  g.fillRect(0, 0, w, h);
  // soft satin sheen streaks
  const grd = g.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 12; i++) grd.addColorStop(i / 12, i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(120,0,50,0.05)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
}

function patternSolid(g, w, h, look) {
  g.fillStyle = look.shirtColor;
  g.fillRect(0, 0, w, h);
}

const PATTERNS = { faceprint: patternFacePrint, hawaiian: patternHawaiian, floral: patternFloral, dress: patternDress };

// Fabric prints don't depend on skin tone, so they're drawn once per outfit and reused
// (avatars are rebuilt every match and redrawn when the photo skin arrives).
const patternCache = new Map();
function pattern(look, w, h, seed) {
  const key = [look.shirt, look.shirtColor, look.shirtColor2, w, h, seed, look.shirt === 'faceprint' ? printImgs?.length || 0 : 0].join(':');
  let c = patternCache.get(key);
  if (!c) {
    c = canvas(w, h);
    (PATTERNS[look.shirt] || patternSolid)(c.getContext('2d'), c.width, c.height, look, seed);
    patternCache.set(key, c);
  }
  return c;
}

// Short / long sleeves etc. per outfit (studs from the top of the arm).
const SLEEVE = { faceprint: 0.85, hawaiian: 0.8, floral: 1.72, dress: 0, default: 0.9 };

// ------------------------------------------------------------------ torso

function stitch(g, x1, y1, x2, y2, color, width = 2) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash([6, 5]);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.restore();
}

function buttons(g, x, y0, y1, n, color, r) {
  for (let i = 0; i < n; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / n;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.arc(x + 1, y + 1.5, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

function drawTorso(look, skin, seed) {
  const [W, H] = TORSO_ATLAS.size;
  const c = canvas(px(W), px(H));
  const g = c.getContext('2d');
  g.drawImage(pattern(look, c.width, c.height, seed), 0, 0);
  const [fx, fy, fw, fh] = rect(TORSO_ATLAS, 'pz');
  const [bx, by, bw] = rect(TORSO_ATLAS, 'nz');
  const cx = fx + fw / 2;
  const [tx, ty, tw, th] = rect(TORSO_ATLAS, 'py');
  if (look.shirt === 'faceprint') {
    // button placket + spread collar
    g.fillStyle = look.shirtColor;
    g.fillRect(cx - px(0.07), fy, px(0.14), fh);
    stitch(g, cx - px(0.07), fy, cx - px(0.07), fy + fh, 'rgba(0,0,0,0.35)');
    stitch(g, cx + px(0.07), fy, cx + px(0.07), fy + fh, 'rgba(0,0,0,0.35)');
    buttons(g, cx, fy + px(0.35), fy + fh - px(0.1), 5, '#111', px(0.035));
    // skin V at the neck
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(cx - px(0.28), fy);
    g.lineTo(cx + px(0.28), fy);
    g.lineTo(cx, fy + px(0.32));
    g.closePath();
    g.fill();
    collar(g, cx, fy, px(0.3), px(0.36), look.shirtColor, look.shirtColor2);
    hem(g, fx, fy + fh - px(0.06), fw, px(0.06), 'rgba(0,0,0,0.25)');
  } else if (look.shirt === 'hawaiian') {
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(cx - px(0.34), fy);
    g.lineTo(cx + px(0.34), fy);
    g.lineTo(cx, fy + px(0.46));
    g.closePath();
    g.fill();
    collar(g, cx, fy, px(0.36), px(0.44), look.shirtColor, shade(look.shirtColor2, -0.2));
    stitch(g, cx, fy + px(0.46), cx, fy + fh, 'rgba(0,60,40,0.4)');
    buttons(g, cx + px(0.06), fy + px(0.6), fy + fh - px(0.1), 4, '#fffaf0', px(0.035));
    hem(g, fx, fy + fh - px(0.05), fw, px(0.05), 'rgba(0,60,40,0.25)');
  } else if (look.shirt === 'floral') {
    // purple top under an open floral jacket: top shows in the middle of the front
    const topW = px(0.8);
    g.fillStyle = look.shirtColor;
    g.fillRect(cx - topW / 2, fy, topW, fh);
    // ribbed texture on the top
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = cx - topW / 2; x < cx + topW / 2; x += 8) g.fillRect(x, fy, 3, fh);
    // scoop neckline
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(cx, fy, px(0.3), px(0.2), 0, 0, Math.PI);
    g.fill();
    // jacket lapel edges with a shadow onto the top
    for (const s of [-1, 1]) {
      const ex = cx + (s * topW) / 2;
      g.fillStyle = 'rgba(40,0,60,0.3)';
      g.fillRect(s < 0 ? ex : ex - px(0.05), fy, px(0.05), fh);
      g.strokeStyle = shade(look.shirtColor2, -0.2);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ex - s * 1.5, fy);
      g.lineTo(ex - s * 1.5, fy + fh);
      g.stroke();
    }
    hem(g, fx, fy + fh - px(0.06), fw, px(0.06), 'rgba(0,0,0,0.12)');
  } else if (look.shirt === 'dress') {
    // scoop neckline and thin straps; sleeveless shoulders
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(fx + fw, fy);
    g.lineTo(fx + fw, fy + px(0.12));
    g.bezierCurveTo(cx + px(0.55), fy + px(0.14), cx + px(0.45), fy + px(0.62), cx, fy + px(0.62));
    g.bezierCurveTo(cx - px(0.45), fy + px(0.62), cx - px(0.55), fy + px(0.14), fx, fy + px(0.12));
    g.closePath();
    g.fill();
    // straps
    g.strokeStyle = look.shirtColor;
    g.lineWidth = px(0.13);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * px(0.58), fy);
      g.lineTo(cx + s * px(0.52), fy + px(0.25));
      g.stroke();
    }
    // back neckline
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + bw, by);
    g.lineTo(bx + bw, by + px(0.1));
    g.quadraticCurveTo(bx + bw / 2, by + px(0.55), bx, by + px(0.1));
    g.closePath();
    g.fill();
    // shoulders (top face) are skin with the straps crossing them
    g.fillStyle = skin;
    g.fillRect(tx, ty, tw, th);
    g.fillStyle = look.shirtColor;
    for (const s of [-1, 1]) g.fillRect(tx + tw / 2 + s * px(0.55) - px(0.065), ty, px(0.13), th);
    // waist sash
    g.fillStyle = look.shirtColor2;
    const wy = fy + fh - px(0.26);
    g.fillRect(fx, wy, px(6), px(0.12));
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(fx, wy + px(0.12), px(6), px(0.03));
    // sash bow at the back
    g.fillStyle = look.shirtColor2;
    const bcx = bx + bw / 2;
    g.beginPath();
    g.ellipse(bcx - px(0.14), wy + px(0.06), px(0.16), px(0.1), 0.3, 0, Math.PI * 2);
    g.ellipse(bcx + px(0.14), wy + px(0.06), px(0.16), px(0.1), -0.3, 0, Math.PI * 2);
    g.fill();
  }
  // soft ambient-occlusion under the arms and at the bottom edge (reads well on plastic)
  for (const side of ['px', 'nx']) {
    const [sx, sy, sw, sh] = rect(TORSO_ATLAS, side);
    const grd = g.createLinearGradient(0, sy, 0, sy + sh);
    grd.addColorStop(0, 'rgba(0,0,0,0.12)');
    grd.addColorStop(0.3, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = grd;
    g.fillRect(sx, sy, sw, sh);
  }
  return c;
}

function collar(g, cx, y, halfW, len, fill, line) {
  g.lineWidth = 3;
  g.strokeStyle = line;
  g.fillStyle = fill;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * halfW * 1.25, y);
    g.lineTo(cx + s * halfW * 0.08, y + len * 0.9);
    g.lineTo(cx + s * halfW * 1.45, y + len * 0.62);
    g.closePath();
    g.fill();
    g.stroke();
  }
}

function hem(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

// ------------------------------------------------------------------ arms and legs

function drawArm(look, skin, seed) {
  const [W, H] = LIMB_ATLAS.size;
  const c = canvas(px(W), px(H));
  const g = c.getContext('2d');
  g.fillStyle = skin;
  g.fillRect(0, 0, c.width, c.height);
  const sleeve = SLEEVE[look.shirt] ?? SLEEVE.default;
  if (sleeve > 0) {
    const pc = pattern(look, c.width, px(sleeve), seed + 7);
    for (const side of ['px', 'nx', 'pz', 'nz']) {
      const [x, y, w] = rect(LIMB_ATLAS, side);
      g.drawImage(pc, x, 0, w, pc.height, x, y, w, pc.height);
      // cuff
      g.fillStyle = look.shirt === 'floral' ? shade(look.shirtColor2, -0.15) : 'rgba(0,0,0,0.22)';
      g.fillRect(x, y + px(sleeve) - px(0.07), w, px(0.07));
      // a soft shadow the sleeve casts on the skin
      const grd = g.createLinearGradient(0, y + px(sleeve), 0, y + px(sleeve) + px(0.12));
      grd.addColorStop(0, 'rgba(0,0,0,0.15)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x, y + px(sleeve), w, px(0.12));
    }
    const [x, y, w, h] = rect(LIMB_ATLAS, 'py');
    g.drawImage(pc, x, 0, w, Math.min(h, pc.height), x, y, w, Math.min(h, pc.height));
  }
  return c;
}

function denim(g, x, y, w, h, base, r) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let i = -h; i < w; i += 5) {
    g.beginPath();
    g.moveTo(x + i, y);
    g.lineTo(x + i + h, y + h);
    g.stroke();
  }
  for (let i = 0; i < (w * h) / 60; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x + r() * w, y + r() * h, 2, 2);
  }
  g.restore();
}

function drawLeg(look, skin, seed) {
  const [W, H] = LIMB_ATLAS.size;
  const c = canvas(px(W), px(H));
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = skin;
  g.fillRect(0, 0, c.width, c.height);
  const kind = look.shirt === 'dress' ? 'dress' : look.shirt === 'hawaiian' ? 'shorts' : 'pants';
  const pantsLen = kind === 'dress' ? 0.5 : kind === 'shorts' ? 0.95 : 2;
  const jeans = kind === 'pants';
  for (const side of ['px', 'nx', 'pz', 'nz']) {
    const [x, y, w] = rect(LIMB_ATLAS, side);
    const ph = px(pantsLen);
    if (jeans) denim(g, x, y, w, ph, look.pants, r);
    else {
      g.fillStyle = look.pants;
      g.fillRect(x, y, w, ph);
    }
    if (kind === 'shorts') {
      // twill texture + cuff
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < w; i += 6) g.fillRect(x + i, y, 2, ph);
      g.fillStyle = shade(look.pants, -0.18);
      g.fillRect(x, y + ph - px(0.12), w, px(0.12));
      // white socks above the shoes
      g.fillStyle = '#f4f4f4';
      g.fillRect(x, y + px(1.42), w, px(0.2));
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 3; i++) g.fillRect(x, y + px(1.45 + i * 0.05), w, 2);
    }
    if (jeans) {
      if (side === 'px' || side === 'nx') stitch(g, x + w / 2, y, x + w / 2, y + ph, 'rgba(255,210,140,0.35)');
      // slightly faded knee
      const kg = g.createRadialGradient(x + w / 2, y + px(1.05), 2, x + w / 2, y + px(1.05), w * 0.5);
      kg.addColorStop(0, 'rgba(255,255,255,0.08)');
      kg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = kg;
      g.fillRect(x, y, w, ph);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(x, y + ph - px(0.1), w, px(0.1));
    }
    if (kind === 'dress') {
      // sandal straps over the foot
      g.fillStyle = look.shoes;
      g.fillRect(x, y + px(1.72), w, px(0.07));
      g.fillStyle = shade(look.shoes, -0.25);
      g.fillRect(x, y + px(1.79), w, px(0.02));
    }
  }
  // top face (hip) in the pants colour, bottom face in the shoe colour
  const [tx, ty, tw, th] = rect(LIMB_ATLAS, 'py');
  g.fillStyle = look.pants;
  g.fillRect(tx, ty, tw, th);
  const [bx, by, bw, bh] = rect(LIMB_ATLAS, 'ny');
  g.fillStyle = look.shoes;
  g.fillRect(bx, by, bw, bh);
  return c;
}

/** Shoe colours: [upper, sole]. */
export function shoeColors(look) {
  const sandal = look.shirt === 'dress';
  return [look.shoes, sandal ? shade(look.shoes, -0.35) : look.shoes === '#ffffff' ? '#cfd6e2' : '#f4f4f4'];
}

// Hair: left half = strands (with a sheen band), right half = short fade (hair -> scalp).
function drawHair(look, skin, seed) {
  const r = rng(seed);
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const hc = look.hairColor;
  g.fillStyle = hc;
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) {
    const x = r() * 128;
    const w = 1 + r() * 3;
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,' + (0.03 + r() * 0.07) + ')' : 'rgba(0,0,0,' + (0.1 + r() * 0.15) + ')';
    g.fillRect(x, 0, w, 256);
  }
  const sheen = g.createLinearGradient(0, 0, 0, 256);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.22, 'rgba(255,255,255,0.13)');
  sheen.addColorStop(0.34, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, 128, 256);
  const fade = g.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, hc);
  fade.addColorStop(0.45, mix(hc, skin, 0.25));
  fade.addColorStop(1, mix(hc, skin, 0.55));
  g.fillStyle = fade;
  g.fillRect(128, 0, 128, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(128 + r() * 128, r() * 256, 1.5, 1.5);
  }
  return c;
}

function drawSkirt(look) {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = look.pants;
  g.fillRect(0, 0, 256, 64);
  // pleats
  for (let i = 0; i < 16; i++) {
    const grd = g.createLinearGradient(i * 16, 0, i * 16 + 16, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0.1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(90,0,40,0.12)');
    g.fillStyle = grd;
    g.fillRect(i * 16, 0, 16, 64);
  }
  // hem
  g.fillStyle = look.shirtColor2;
  g.fillRect(0, 54, 256, 6);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 60, 256, 4);
  return c;
}

// Noodle atlas: left half = foam side (ridges run along the tube; v goes around it),
// right half = the end cap with the hole.
function drawNoodle(color) {
  const c = canvas(128, 64);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    const grd = g.createLinearGradient(0, i * 8, 0, i * 8 + 8);
    grd.addColorStop(0, 'rgba(255,255,255,0.2)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.16)');
    g.fillStyle = grd;
    g.fillRect(0, i * 8, 64, 8);
  }
  g.fillStyle = shade(color, 0.1);
  g.fillRect(64, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(96, 32);
    g.arc(96, 32, 32, (i / 8) * Math.PI * 2, (i / 8) * Math.PI * 2 + 0.25);
    g.fill();
  }
  g.fillStyle = shade(color, -0.5);
  g.beginPath();
  g.arc(96, 32, 11, 0, Math.PI * 2);
  g.fill();
  return c;
}

// Head atlas (1024x512): the photo face on the front, painted scalp/hair on the other sides.
export const HEAD_ATLAS = {
  size: [1024, 512],
  pz: [0, 0, 512, 512], px: [512, 0, 192, 512], nx: [512, 0, 192, 512], nz: [704, 0, 192, 512],
  py: [896, 0, 128, 256], ny: [896, 256, 128, 256],
};
export function headRects() {
  const [W, H] = HEAD_ATLAS.size;
  return SIDES.map((k) => {
    const [x, y, w, h] = HEAD_ATLAS[k];
    return [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];
  });
}

/** Paints the head atlas around an already composed face canvas (512x512). */
export function drawHeadAtlas(faceCanvas, look, skin, target) {
  const c = target || canvas(1024, 512);
  const g = c.getContext('2d');
  g.drawImage(faceCanvas, 0, 0, 512, 512);
  const hc = look.hairColor;
  const r = rng(99);
  // how far down the sides/back the hair colour reaches (0..1 of the head height)
  const style = look.hair;
  const solid = style === 'short' ? 0.3 : style === 'short-thick' ? 0.62 : 0.8;
  const fadeTo = style === 'short' ? 0.72 : solid + 0.14;
  for (const k of ['px', 'nz']) {
    const [x, y, w, h] = HEAD_ATLAS[k];
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, hc);
    grd.addColorStop(solid, hc);
    grd.addColorStop(fadeTo, style === 'short' ? mix(hc, skin, 0.6) : skin);
    grd.addColorStop(Math.min(1, fadeTo + 0.08), skin);
    grd.addColorStop(1, skin);
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    if (style === 'short') {
      // stubble speckle in the fade
      g.fillStyle = 'rgba(0,0,0,0.13)';
      for (let i = 0; i < 700; i++) g.fillRect(x + r() * w, y + (0.2 + r() * 0.55) * h, 1.5, 1.5);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 40; i++) g.fillRect(x + r() * w, y, 1 + r() * 2, h * solid);
    }
  }
  const [tx, ty, tw, th] = HEAD_ATLAS.py;
  g.fillStyle = hc;
  g.fillRect(tx, ty, tw, th);
  const [bx, by, bw, bh] = HEAD_ATLAS.ny;
  g.fillStyle = skin;
  g.fillRect(bx, by, bw, bh);
  return c;
}

/** All outfit canvases for a character. `seed` keeps patterns stable between redraws. */
export function drawOutfit(char, skin) {
  const look = char.look;
  const seed = [...char.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  return {
    torso: drawTorso(look, skin, seed),
    arm: drawArm(look, skin, seed),
    leg: drawLeg(look, skin, seed),
    hair: drawHair(look, skin, seed),
    skirt: look.shirt === 'dress' ? drawSkirt(look) : null,
    noodle: drawNoodle(char.color),
  };
}

export { canvas as makeCanvas, rng, shade };
