// Procedural canvas textures for the outfits: the family's (what they wore in the Cabo sunset photo)
// and every Wardrobe style (characters/cosmetics.js).
// Body parts are boxes whose six sides are packed into one atlas per part:
//   torso atlas: 6 x 3 studs  (front 2x2, back 2x2, +x side 1x2, -x side 1x2, top 2x1, bottom 2x1)
//   limb atlas:  5 x 2 studs  (front, back, +x, -x: 1x2 each; top 1x1 and bottom 1x1 stacked)
// In every side region the canvas top is the top of the part. On the front, canvas-left is the
// character's right hand side (-x). Characters face +Z; their right is -X.
import { familyFaceData, loadImage } from './faces.js';
import { SHIRT_BY_ID, legsOf } from './cosmetics.js';

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

// soft cotton: a faint speckle so flat colours don't look like bare plastic
function patternCotton(g, w, h, look, seed) {
  const r = rng(seed);
  patternSolid(g, w, h, look);
  for (let i = 0; i < (w * h) / 90; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

function patternStripes(g, w, h, look) {
  patternSolid(g, w, h, look);
  const step = px(0.36);
  g.fillStyle = look.shirtColor2;
  for (let y = step * 0.5; y < h; y += step) g.fillRect(0, y, w, step * 0.48);
}

// cable knit: ribbed columns with little V stitches
function patternKnit(g, w, h, look) {
  patternSolid(g, w, h, look);
  const col = px(0.14);
  for (let x = 0; x < w; x += col) {
    g.fillStyle = 'rgba(0,0,0,0.07)';
    g.fillRect(x, 0, 2, h);
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += col * 0.7) {
      g.beginPath();
      g.moveTo(x + col * 0.2, y);
      g.lineTo(x + col * 0.5, y + col * 0.35);
      g.lineTo(x + col * 0.8, y);
      g.stroke();
    }
  }
}

function patternMesh(g, w, h, look) {
  patternSolid(g, w, h, look);
  g.fillStyle = 'rgba(0,0,0,0.1)';
  const s = 7;
  for (let y = 0; y < h; y += s) for (let x = (y / s) % 2 ? s / 2 : 0; x < w; x += s) g.fillRect(x, y, 2.5, 2.5);
}

const PATTERNS = {
  faceprint: patternFacePrint, hawaiian: patternHawaiian, floral: patternFloral, dress: patternDress,
  stripes: patternStripes, sweater: patternKnit, jersey: patternMesh, tee: patternCotton, tank: patternCotton,
  hoodie: patternCotton, overalls: patternCotton, suit: patternCotton,
};

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

// Short / long sleeves etc. per outfit (studs from the top of the arm): characters/cosmetics.js SHIRTS.
const sleeveOf = (look) => SHIRT_BY_ID[look.shirt]?.sleeve ?? 0.9;

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
  } else {
    drawTorsoStyle(g, look, skin, { fx, fy, fw, fh, bx, by, bw, cx, tx, ty, tw, th });
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

function starPath(g, x, y, r, inner = 0.45, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function crewNeck(g, cx, fy, bx, bw, by, skin, trim) {
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(cx, fy, px(0.3), px(0.15), 0, 0, Math.PI);
  g.fill();
  g.strokeStyle = trim;
  g.lineWidth = px(0.06);
  g.beginPath();
  g.ellipse(cx, fy, px(0.3) + px(0.03), px(0.15) + px(0.03), 0, 0, Math.PI);
  g.stroke();
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(bx + bw / 2, by, px(0.28), px(0.07), 0, 0, Math.PI);
  g.fill();
}

// Big sports number, drawn with a chunky outline.
function jerseyNumber(g, x, y, size, num, fill, line) {
  g.save();
  g.font = `900 ${Math.round(size)}px "Arial Black", "Lilita One", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = line;
  g.strokeText(String(num), x, y);
  g.fillStyle = fill;
  g.fillText(String(num), x, y);
  g.restore();
}

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
};

// Torso details for the Wardrobe styles (the family's four outfits are drawn in drawTorso itself).
function drawTorsoStyle(g, look, skin, R) {
  const { fx, fy, fw, fh, bx, by, bw, cx, tx, ty, tw, th } = R;
  const W = px(TORSO_ATLAS.size[0]);
  const s = look.shirt;
  const c1 = look.shirtColor;
  const c2 = look.shirtColor2;
  const dark = shade(c1, -0.22);
  if (s === 'tee' || s === 'stripes') {
    crewNeck(g, cx, fy, bx, bw, by, skin, s === 'tee' ? c2 : shade(c1, -0.15));
    if (s === 'tee') {
      // a little star on the chest (the character's left: canvas right)
      starPath(g, cx + px(0.45), fy + px(0.6), px(0.17));
      g.fillStyle = c2;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = shade(c2, -0.3);
      g.stroke();
    }
    hem(g, 0, fy + fh - px(0.07), W, px(0.07), 'rgba(0,0,0,0.16)');
  } else if (s === 'tank') {
    // skin shoulders with two straps, scooped neck and armholes
    g.fillStyle = skin;
    g.fillRect(tx, ty, tw, th);
    g.fillStyle = c1;
    for (const k of [-1, 1]) g.fillRect(tx + tw / 2 + k * px(0.55) - px(0.2), ty, px(0.4), th);
    for (const [x0, w0] of [[fx, fw], [bx, bw]]) {
      const mx = x0 + w0 / 2;
      g.fillStyle = skin;
      g.beginPath();
      g.moveTo(x0, fy);
      g.lineTo(mx - px(0.75), fy);
      g.bezierCurveTo(mx - px(0.72), fy + px(0.2), mx - px(0.9), fy + px(0.42), x0, fy + px(0.46));
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(x0 + w0, fy);
      g.lineTo(mx + px(0.75), fy);
      g.bezierCurveTo(mx + px(0.72), fy + px(0.2), mx + px(0.9), fy + px(0.42), x0 + w0, fy + px(0.46));
      g.closePath();
      g.fill();
      g.beginPath();
      g.ellipse(mx, fy, px(0.36), px(x0 === fx ? 0.42 : 0.25), 0, 0, Math.PI);
      g.fill();
      g.strokeStyle = c2;
      g.lineWidth = px(0.05);
      g.beginPath();
      g.ellipse(mx, fy, px(0.38), px(x0 === fx ? 0.44 : 0.27), 0, 0, Math.PI);
      g.stroke();
    }
    for (const side of ['px', 'nx']) {
      const [sx, sy, sw] = rect(TORSO_ATLAS, side);
      g.fillStyle = skin;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + sw, sy);
      g.lineTo(sx + sw, sy + px(0.46));
      g.quadraticCurveTo(sx + sw / 2, sy + px(0.75), sx, sy + px(0.46));
      g.closePath();
      g.fill();
    }
    hem(g, 0, fy + fh - px(0.07), W, px(0.07), 'rgba(0,0,0,0.16)');
  } else if (s === 'hoodie') {
    // hood lying on the back, kangaroo pocket, drawstrings, ribbed hem
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(bx + bw / 2, by, px(0.74), px(0.68), 0, 0, Math.PI);
    g.fill();
    g.strokeStyle = shade(c1, -0.38);
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(bx + bw / 2, by, px(0.5), px(0.42), 0, 0, Math.PI);
    g.stroke();
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(cx, fy, px(0.42), px(0.2), 0, 0, Math.PI);
    g.fill();
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(cx - px(0.24), fy);
    g.lineTo(cx + px(0.24), fy);
    g.lineTo(cx, fy + px(0.22));
    g.closePath();
    g.fill();
    for (const k of [-1, 1]) {
      g.strokeStyle = c2;
      g.lineWidth = px(0.045);
      g.beginPath();
      g.moveTo(cx + k * px(0.14), fy + px(0.14));
      g.quadraticCurveTo(cx + k * px(0.18), fy + px(0.5), cx + k * px(0.15), fy + px(0.72));
      g.stroke();
      g.fillStyle = '#e8e8e8';
      g.fillRect(cx + k * px(0.15) - px(0.03), fy + px(0.7), px(0.06), px(0.1));
    }
    const py0 = fy + px(1.12);
    g.fillStyle = shade(c1, -0.08);
    g.beginPath();
    g.moveTo(cx - px(0.52), py0);
    g.lineTo(cx + px(0.52), py0);
    g.lineTo(cx + px(0.7), fy + fh - px(0.18));
    g.lineTo(cx - px(0.7), fy + fh - px(0.18));
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 3;
    g.setLineDash([6, 5]);
    g.stroke();
    g.setLineDash([]);
    hem(g, 0, fy + fh - px(0.16), W, px(0.16), dark);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < W; x += 8) g.fillRect(x, fy + fh - px(0.16), 2, px(0.16));
  } else if (s === 'sweater') {
    // zigzag band across the chest, ribbed collar and hem
    const y0 = fy + px(0.62);
    const bh = px(0.34);
    g.fillStyle = c2;
    g.fillRect(0, y0, W, bh);
    g.fillStyle = c1;
    const zz = px(0.2);
    g.beginPath();
    for (let x = 0; x <= W + zz; x += zz) {
      g.moveTo(x - zz / 2, y0 + bh * 0.5);
      g.lineTo(x, y0 + bh * 0.2);
      g.lineTo(x + zz / 2, y0 + bh * 0.5);
      g.lineTo(x, y0 + bh * 0.8);
      g.closePath();
    }
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let x = zz / 2; x < W; x += zz) g.fillRect(x - 3, y0 + 4, 6, 6);
    crewNeck(g, cx, fy, bx, bw, by, skin, dark);
    hem(g, 0, fy + fh - px(0.18), W, px(0.18), dark);
    g.fillStyle = 'rgba(0,0,0,0.14)';
    for (let x = 0; x < W; x += 7) g.fillRect(x, fy + fh - px(0.18), 2, px(0.18));
  } else if (s === 'jersey') {
    // V-neck with trim, side panels, a big number front and back
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(cx - px(0.3), fy);
    g.lineTo(cx + px(0.3), fy);
    g.lineTo(cx, fy + px(0.38));
    g.closePath();
    g.fill();
    g.strokeStyle = c2;
    g.lineWidth = px(0.08);
    g.beginPath();
    g.moveTo(cx - px(0.36), fy);
    g.lineTo(cx, fy + px(0.44));
    g.lineTo(cx + px(0.36), fy);
    g.stroke();
    for (const side of ['px', 'nx']) {
      const [sx, sy, sw, sh] = rect(TORSO_ATLAS, side);
      g.fillStyle = c2;
      g.fillRect(sx + sw / 2 - px(0.14), sy + px(0.3), px(0.28), sh);
    }
    const num = Number.isFinite(look.num) ? look.num : 10;
    const light = lum(c1) > 0.6;
    jerseyNumber(g, cx, fy + px(0.95), px(0.62), num, c2, light ? '#1b2440' : '#ffffff');
    jerseyNumber(g, bx + bw / 2, by + px(0.95), px(1.05), num, c2, light ? '#1b2440' : '#ffffff');
    hem(g, 0, fy + fh - px(0.1), W, px(0.1), c2);
  } else if (s === 'overalls') {
    // denim bib + straps over a tee (shirtColor); the bib is the legs' colour
    const d = look.pants;
    crewNeck(g, cx, fy, bx, bw, by, skin, shade(c1, -0.18));
    const r = rng(11);
    const bibTop = fy + px(0.72);
    denim(g, cx - px(0.62), bibTop, px(1.24), fh - (bibTop - fy), d, r);
    denim(g, 0, fy + fh - px(0.34), W, px(0.34), d, r);
    g.strokeStyle = 'rgba(255,210,140,0.5)';
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.strokeRect(cx - px(0.56), bibTop + px(0.06), px(1.12), fh - (bibTop - fy) - px(0.08));
    g.strokeRect(cx - px(0.28), bibTop + px(0.2), px(0.56), px(0.36));
    g.setLineDash([]);
    for (const k of [-1, 1]) {
      g.fillStyle = shade(d, -0.08);
      g.fillRect(cx + k * px(0.5) - px(0.13), fy, px(0.26), bibTop - fy + px(0.05));
      g.fillRect(tx + tw / 2 + k * px(0.5) - px(0.13), ty, px(0.26), th);
      // back straps cross into an X
      g.save();
      g.beginPath();
      g.moveTo(bx + bw / 2 + k * px(0.5) - px(0.13), by);
      g.lineTo(bx + bw / 2 + k * px(0.5) + px(0.13), by);
      g.lineTo(bx + bw / 2 - k * px(0.4) + px(0.13), by + fh - px(0.34));
      g.lineTo(bx + bw / 2 - k * px(0.4) - px(0.13), by + fh - px(0.34));
      g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(cx + k * px(0.5), bibTop + px(0.08), px(0.075), 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8a6a10';
      g.lineWidth = 2;
      g.stroke();
    }
  } else if (s === 'suit') {
    // white shirt, tie, lapels, two buttons and a pocket square
    g.fillStyle = '#fbfbfb';
    g.beginPath();
    g.moveTo(cx - px(0.42), fy);
    g.lineTo(cx + px(0.42), fy);
    g.lineTo(cx, fy + px(1.05));
    g.closePath();
    g.fill();
    g.fillStyle = c2;
    g.beginPath();
    g.moveTo(cx - px(0.1), fy + px(0.02));
    g.lineTo(cx + px(0.1), fy + px(0.02));
    g.lineTo(cx + px(0.06), fy + px(0.16));
    g.lineTo(cx + px(0.13), fy + px(0.82));
    g.lineTo(cx, fy + px(0.98));
    g.lineTo(cx - px(0.13), fy + px(0.82));
    g.lineTo(cx - px(0.06), fy + px(0.16));
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(cx - px(0.07), fy + px(0.14), px(0.14), px(0.03));
    for (const k of [-1, 1]) {
      g.fillStyle = dark;
      g.beginPath();
      g.moveTo(cx + k * px(0.42), fy);
      g.lineTo(cx + k * px(0.6), fy);
      g.lineTo(cx + k * px(0.42), fy + px(0.55));
      g.lineTo(cx + k * px(0.04), fy + px(1.08));
      g.closePath();
      g.fill();
    }
    buttons(g, cx, fy + px(1.12), fy + fh - px(0.12), 2, shade(c1, -0.45), px(0.05));
    g.fillStyle = shade(c1, -0.3);
    g.fillRect(cx + px(0.45), fy + px(0.62), px(0.36), px(0.04));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(cx + px(0.5), fy + px(0.62));
    g.lineTo(cx + px(0.58), fy + px(0.5));
    g.lineTo(cx + px(0.66), fy + px(0.62));
    g.closePath();
    g.fill();
    stitch(g, bx + bw / 2, by + px(0.3), bx + bw / 2, by + fh, 'rgba(0,0,0,0.3)');
    hem(g, 0, fy + fh - px(0.05), W, px(0.05), 'rgba(0,0,0,0.25)');
  }
}

// ------------------------------------------------------------------ arms and legs

function drawArm(look, skin, seed) {
  const [W, H] = LIMB_ATLAS.size;
  const c = canvas(px(W), px(H));
  const g = c.getContext('2d');
  g.fillStyle = skin;
  g.fillRect(0, 0, c.width, c.height);
  const sleeve = sleeveOf(look);
  if (sleeve > 0) {
    const pc = pattern(look, c.width, px(sleeve), seed + 7);
    const cuff = { floral: shade(look.shirtColor2, -0.15), jersey: look.shirtColor2, hoodie: shade(look.shirtColor, -0.22), sweater: shade(look.shirtColor, -0.22), suit: '#fbfbfb' }[look.shirt] || 'rgba(0,0,0,0.22)';
    const cuffH = { hoodie: 0.14, sweater: 0.14, jersey: 0.1, suit: 0.1 }[look.shirt] || 0.07;
    for (const side of ['px', 'nx', 'pz', 'nz']) {
      const [x, y, w] = rect(LIMB_ATLAS, side);
      g.drawImage(pc, x, 0, w, pc.height, x, y, w, pc.height);
      // cuff
      g.fillStyle = cuff;
      g.fillRect(x, y + px(sleeve) - px(cuffH), w, px(cuffH));
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
  // 'dress' = the dress's own skirt + sandals; 'skirt' = a skirt with any top (bare legs, socks)
  const kind = legsOf(look);
  const pantsLen = kind === 'dress' || kind === 'skirt' ? 0.5 : kind === 'shorts' ? 0.95 : 2;
  const jeans = kind === 'jeans';
  for (const side of ['px', 'nx', 'pz', 'nz']) {
    const [x, y, w] = rect(LIMB_ATLAS, side);
    const ph = px(pantsLen);
    if (jeans) denim(g, x, y, w, ph, look.pants, r);
    else {
      g.fillStyle = look.pants;
      g.fillRect(x, y, w, ph);
    }
    if (kind === 'pants') {
      // plain trousers: soft twill, a pressed crease and a turn-up
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < w; i += 5) g.fillRect(x + i, y, 1.5, ph);
      if (side === 'pz' || side === 'nz') {
        g.fillStyle = 'rgba(0,0,0,0.1)';
        g.fillRect(x + w / 2 - 1, y + px(0.2), 2, ph - px(0.3));
      }
      g.fillStyle = shade(look.pants, -0.2);
      g.fillRect(x, y + ph - px(0.14), w, px(0.14));
    }
    if (kind === 'skirt') {
      // ankle socks above the shoes
      g.fillStyle = '#f4f4f4';
      g.fillRect(x, y + px(1.5), w, px(0.2));
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(x, y + px(1.5), w, 3);
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
  // hem (the dress's accent colour; a plain skirt gets a darker band)
  g.fillStyle = look.shirt === 'dress' ? look.shirtColor2 : shade(look.pants, -0.22);
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

// How each hair style paints the head's sides and back: share of the head height in solid hair colour,
// where the fade to skin ends, and a stubbly fade ('shaved': mix = how much skin shows through).
const HEAD_PAINT = {
  short: { solid: 0.3, fade: 0.72, shaved: 0.6 },
  'short-thick': { solid: 0.62 },
  long: { solid: 0.8 },
  buzz: { solid: 0.16, fade: 0.62, shaved: 0.62, top: 0.25 },
  bald: { solid: 0, bald: true },
  ponytail: { solid: 0.5 },
  bob: { solid: 0.72 },
  pigtails: { solid: 0.58 },
  bun: { solid: 0.5 },
  spiky: { solid: 0.5 },
  curly: { solid: 0.62 },
  mohawk: { solid: 0.08, fade: 0.55, shaved: 0.72, top: 0.62, stripe: true },
};

/** Paints the head atlas around an already composed face canvas (512x512). */
export function drawHeadAtlas(faceCanvas, look, skin, target) {
  const c = target || canvas(1024, 512);
  const g = c.getContext('2d');
  g.drawImage(faceCanvas, 0, 0, 512, 512);
  const hc = look.hairColor;
  const r = rng(99);
  // how far down the sides/back the hair colour reaches (0..1 of the head height)
  const P = HEAD_PAINT[look.hair] || HEAD_PAINT.long;
  const solid = P.solid;
  const fadeTo = P.fade ?? solid + 0.14;
  for (const k of ['px', 'nz']) {
    const [x, y, w, h] = HEAD_ATLAS[k];
    if (P.bald) {
      g.fillStyle = skin;
      g.fillRect(x, y, w, h);
      continue;
    }
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, P.top != null ? mix(hc, skin, P.top) : hc);
    grd.addColorStop(solid, P.top != null ? mix(hc, skin, P.top) : hc);
    grd.addColorStop(fadeTo, P.shaved ? mix(hc, skin, P.shaved) : skin);
    grd.addColorStop(Math.min(1, fadeTo + 0.08), skin);
    grd.addColorStop(1, skin);
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    if (P.shaved) {
      // stubble speckle in the fade
      g.fillStyle = 'rgba(0,0,0,0.13)';
      for (let i = 0; i < 700; i++) g.fillRect(x + r() * w, y + (0.2 + r() * 0.55) * h, 1.5, 1.5);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 40; i++) g.fillRect(x + r() * w, y, 1 + r() * 2, h * solid);
    }
  }
  const [tx, ty, tw, th] = HEAD_ATLAS.py;
  g.fillStyle = P.bald ? skin : P.top != null ? mix(hc, skin, P.top) : hc;
  g.fillRect(tx, ty, tw, th);
  if (P.stripe) {
    // the mohawk's strip of hair runs front to back over the crown
    g.fillStyle = hc;
    g.fillRect(tx + tw * 0.34, ty, tw * 0.32, th);
  }
  const [bx, by, bw, bh] = HEAD_ATLAS.ny;
  g.fillStyle = skin;
  g.fillRect(bx, by, bw, bh);
  return c;
}

/** All outfit canvases for a character. `seed` keeps patterns stable between redraws. */
export function drawOutfit(char, skin, look = char.look) {
  const seed = [...char.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const legs = legsOf(look);
  return {
    torso: drawTorso(look, skin, seed),
    arm: drawArm(look, skin, seed),
    leg: drawLeg(look, skin, seed),
    hair: drawHair(look, skin, seed),
    skirt: legs === 'dress' || legs === 'skirt' ? drawSkirt(look) : null,
    noodle: drawNoodle(look.noodle || char.color),
  };
}

// ------------------------------------------------------------------ Wardrobe icons (flat, 2D)

// shirt silhouettes in a 100x100 box: [body path, sleeve length 0..1]
function shirtShape(g, style, s) {
  const sl = style === 'tank' || style === 'dress' ? 0 : (SHIRT_BY_ID[style]?.sleeve ?? 0.9) / 1.85;
  g.beginPath();
  // shoulders -> sleeves -> body
  g.moveTo(35 * s, 14 * s);
  g.quadraticCurveTo(50 * s, 24 * s, 65 * s, 14 * s);
  if (sl > 0) {
    const len = 12 + sl * 28;
    g.lineTo(80 * s, 18 * s);
    g.lineTo((80 + len * 0.45) * s, (18 + len) * s);
    g.lineTo((68 + len * 0.1) * s, (24 + len * 0.95) * s);
    g.lineTo(69 * s, 40 * s);
  } else {
    g.lineTo(70 * s, 16 * s);
    g.quadraticCurveTo(66 * s, 34 * s, 72 * s, 40 * s);
  }
  if (style === 'dress') {
    g.lineTo(88 * s, 90 * s);
    g.lineTo(12 * s, 90 * s);
  } else {
    g.lineTo(71 * s, 88 * s);
    g.lineTo(29 * s, 88 * s);
  }
  if (sl > 0) {
    const len = 12 + sl * 28;
    g.lineTo(31 * s, 40 * s);
    g.lineTo((32 - len * 0.1) * s, (24 + len * 0.95) * s);
    g.lineTo((20 - len * 0.45) * s, (18 + len) * s);
    g.lineTo(20 * s, 18 * s);
  } else {
    g.lineTo(28 * s, 40 * s);
    g.quadraticCurveTo(34 * s, 34 * s, 30 * s, 16 * s);
  }
  g.closePath();
}

/** Draws a flat shirt icon (the style's silhouette filled with its real fabric) into a square canvas. */
export function drawShirtIcon(c, look) {
  const g = c.getContext('2d');
  const s = c.width / 100;
  g.clearRect(0, 0, c.width, c.height);
  g.save();
  shirtShape(g, look.shirt, s);
  g.save();
  g.clip();
  // the torso atlas front, so every detail (collars, numbers, bibs) shows as it does in 3D
  const torso = drawTorso(look, look.skin || '#e0ac8a', 7);
  const [fx, fy, fw, fh] = rect(TORSO_ATLAS, 'pz');
  g.drawImage(pattern(look, c.width, c.height, 7), 0, 0);
  g.drawImage(torso, fx, fy, fw, fh, 26 * s, 14 * s, 48 * s, 76 * s);
  if (look.shirt === 'dress') {
    g.fillStyle = look.pants;
    g.fillRect(0, 62 * s, c.width, 30 * s);
    g.fillStyle = look.shirtColor2;
    g.fillRect(0, 84 * s, c.width, 6 * s);
  }
  g.restore();
  g.lineWidth = 3.2 * s;
  g.strokeStyle = '#10163a';
  g.lineJoin = 'round';
  g.stroke();
  g.restore();
  return c;
}

/** Flat legwear icon: jeans, trousers, shorts or a skirt in the pants colour. */
export function drawLegsIcon(c, look, legs) {
  const g = c.getContext('2d');
  const s = c.width / 100;
  g.clearRect(0, 0, c.width, c.height);
  const col = look.pants;
  g.beginPath();
  if (legs === 'skirt') {
    g.moveTo(32 * s, 22 * s);
    g.lineTo(68 * s, 22 * s);
    g.lineTo(86 * s, 74 * s);
    g.quadraticCurveTo(50 * s, 82 * s, 14 * s, 74 * s);
  } else {
    const bottom = legs === 'shorts' ? 58 : 90;
    g.moveTo(28 * s, 14 * s);
    g.lineTo(72 * s, 14 * s);
    g.lineTo(76 * s, bottom * s);
    g.lineTo(53 * s, bottom * s);
    g.lineTo(50 * s, 38 * s);
    g.lineTo(47 * s, bottom * s);
    g.lineTo(24 * s, bottom * s);
  }
  g.closePath();
  g.save();
  g.clip();
  if (legs === 'jeans') denim(g, 0, 0, c.width, c.height, col, rng(3));
  else {
    g.fillStyle = col;
    g.fillRect(0, 0, c.width, c.height);
  }
  if (legs === 'skirt') {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
      g.beginPath();
      g.moveTo((34 + i * 6) * s, 22 * s);
      g.lineTo((40 + i * 6) * s, 22 * s);
      g.lineTo((26 + i * 12) * s, 80 * s);
      g.lineTo((14 + i * 12) * s, 80 * s);
      g.fill();
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 14 * s, c.width, (legs === 'skirt' ? 14 : 6) * s);
  g.restore();
  g.lineWidth = 3.2 * s;
  g.strokeStyle = '#10163a';
  g.lineJoin = 'round';
  g.stroke();
  return c;
}

/** The hair strands/fade atlas on its own (Wardrobe hair thumbnails). */
export const drawHairTexture = (look, skin) => drawHair(look, skin, 7);

export { canvas as makeCanvas, rng, shade };
