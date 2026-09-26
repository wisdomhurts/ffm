// Pet eggs: a smooth lathe egg with a painted pattern per egg type (spots, jungle zigzag, lava cracks,
// galaxy stars), glowing crack lines revealed in three stages for the hatch, and the two shell halves that
// burst apart. Geometry and materials are cached and shared (stand in the plaza, hatch stage, icons).
//   createEgg(eggId) -> THREE.Group (1 unit tall, standing on y=0)
//   eggParts(eggId)  -> {whole, cracks, top, bottom, teeth, shardGeo, mat}   (for the hatch)
import * as THREE from 'three';
import { EGG } from './catalog.js';

const H = 1; // egg height (units)
const R = 0.39; // max radius
const SEAM = 0.54; // where the shell splits (fraction of the profile)

function profile(t0, t1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const th = Math.PI * (t0 + (t1 - t0) * (i / n));
    const r = Math.max(0.0005, R * Math.sin(th) * (1 + 0.13 * Math.cos(th)));
    pts.push(new THREE.Vector2(r, ((1 - Math.cos(th)) / 2) * H));
  }
  return pts;
}

const GEO = {};
function geo(kind) {
  if (GEO[kind]) return GEO[kind];
  let g;
  if (kind === 'whole') g = new THREE.LatheGeometry(profile(0, 1, 22), 28);
  else if (kind === 'bottom') g = new THREE.LatheGeometry(profile(0, SEAM, 12), 28);
  else if (kind === 'top') g = new THREE.LatheGeometry(profile(SEAM, 1, 11), 28);
  else if (kind === 'shard') g = new THREE.TetrahedronGeometry(0.07, 0);
  // lathe UVs run 0..1 over each piece: remap the halves onto the whole egg's texture
  if (kind === 'bottom' || kind === 'top') {
    const uv = g.attributes.uv;
    const [a, b] = kind === 'bottom' ? [0, SEAM] : [SEAM, 1];
    for (let i = 0; i < uv.count; i++) uv.setY(i, a + (b - a) * uv.getY(i));
  }
  g.userData.shared = true;
  GEO[kind] = g;
  return g;
}

// ------------------------------------------------------------------ painted patterns

const TW = 512, TH = 256;
function canvas() {
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  return c;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
// draw with horizontal wrap-around (u = 0 and u = 1 are the same meridian: the egg's front)
function wrapDraw(g, x, fn) {
  for (const dx of [-TW, 0, TW]) fn(x + dx);
}
function vgrad(g, c1, c2) {
  const gr = g.createLinearGradient(0, 0, 0, TH);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fillRect(0, 0, TW, TH);
}

const PAINT = {
  garden(g, e, r) {
    vgrad(g, '#fffaf0', '#ffeec8');
    for (let i = 0; i < 16; i++) {
      const x = r() * TW, y = 36 + r() * (TH - 72), rad = 14 + r() * 20;
      wrapDraw(g, x, (xx) => {
        g.fillStyle = '#4fae3c';
        g.beginPath();
        g.ellipse(xx, y + 2, rad, rad * 1.25, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = i % 3 ? '#7bd35a' : '#9be26f';
        g.beginPath();
        g.ellipse(xx, y, rad * 0.86, rad * 1.1, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
    return null;
  },
  jungle(g, e, r) {
    vgrad(g, '#5fd66a', '#2a9443');
    // leafy blotches
    for (let i = 0; i < 22; i++) {
      const x = r() * TW, y = 20 + r() * (TH - 40), l = 22 + r() * 18, a = r() * Math.PI;
      wrapDraw(g, x, (xx) => {
        g.fillStyle = i % 2 ? 'rgba(20,110,50,0.55)' : 'rgba(170,240,120,0.45)';
        g.beginPath();
        g.ellipse(xx, y, l, l * 0.42, a, 0, Math.PI * 2);
        g.fill();
      });
    }
    // bold yellow zigzag band round the middle
    const y0 = TH * 0.44;
    g.lineJoin = 'round';
    for (const [w, c] of [[30, '#1e5a2a'], [20, '#ffd23f']]) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      for (let i = 0; i <= 16; i++) g.lineTo((i / 16) * TW, y0 + (i % 2 ? -18 : 18));
      g.stroke();
    }
    return null;
  },
  volcano(g, e, r) {
    vgrad(g, '#4a2620', '#1e0e0c');
    // rocky speckles
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,140,90,0.08)';
      g.fillRect(r() * TW, r() * TH, 3 + r() * 6, 3 + r() * 6);
    }
    // glowing lava veins (drawn on the emissive map too)
    const glow = canvas();
    const gg = glow.getContext('2d');
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, TW, TH);
    const veins = [];
    for (let i = 0; i < 9; i++) {
      let x = r() * TW, y = 20 + r() * (TH - 40);
      const pts = [[x, y]];
      for (let k = 0; k < 7; k++) {
        x += 18 + r() * 26;
        y += (r() - 0.5) * 42;
        pts.push([x, Math.max(14, Math.min(TH - 14, y))]);
      }
      veins.push(pts);
    }
    const stroke = (ctx, w, c) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineJoin = ctx.lineCap = 'round';
      for (const pts of veins) {
        for (const dx of [-TW, 0, TW]) {
          ctx.beginPath();
          pts.forEach(([x, y]) => ctx.lineTo(x + dx, y));
          ctx.stroke();
        }
      }
    };
    stroke(g, 11, '#ff5a1a');
    stroke(g, 4, '#ffd166');
    stroke(gg, 12, '#ff5a1a');
    stroke(gg, 5, '#ffe08a');
    return glow;
  },
  galaxy(g, e, r) {
    vgrad(g, '#3a2480', '#110b2e');
    const glow = canvas();
    const gg = glow.getContext('2d');
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, TW, TH);
    // nebula clouds
    for (let i = 0; i < 10; i++) {
      const x = r() * TW, y = r() * TH, rad = 40 + r() * 70;
      const c = ['255,102,217', '110,160,255', '180,110,255'][i % 3];
      wrapDraw(g, x, (xx) => {
        for (const ctx of [g, gg]) {
          const gr = ctx.createRadialGradient(xx, y, 0, xx, y, rad);
          gr.addColorStop(0, `rgba(${c},${ctx === g ? 0.55 : 0.28})`);
          gr.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = gr;
          ctx.fillRect(xx - rad, y - rad, rad * 2, rad * 2);
        }
      });
    }
    // stars (+ a few four-point sparkles)
    for (let i = 0; i < 120; i++) {
      const x = r() * TW, y = 10 + r() * (TH - 20), s = r() < 0.12 ? 3.2 : 1 + r() * 1.4;
      for (const ctx of [g, gg]) {
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        if (s > 3) {
          ctx.fillRect(x - s * 3, y - 0.8, s * 6, 1.6);
          ctx.fillRect(x - 0.8, y - s * 3, 1.6, s * 6);
        }
      }
    }
    return glow;
  },
};

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const MATS = {};
/** Shared material for an egg type (map + optional glowing emissive map). */
export function eggMaterial(eggId) {
  const id = PAINT[eggId] ? eggId : 'garden';
  if (MATS[id]) return MATS[id];
  const c = canvas();
  const glow = PAINT[id](c.getContext('2d'), EGG[id], rng(id.length * 7919 + 13));
  const map = tex(c);
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.38, metalness: 0 });
  if (glow) {
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = tex(glow);
    m.emissiveIntensity = id === 'volcano' ? 1.4 : 1.0;
  } else {
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = map;
    m.emissiveIntensity = 0.08;
  }
  MATS[id] = m;
  return m;
}

// ------------------------------------------------------------------ cracks (three stages via alphaTest)

let crackMat = null;
/** Crack overlay: stage 1 shows at alphaTest 0.9, stages 1-2 at 0.55, all three at 0.2. */
export function crackMaterial() {
  if (crackMat) return crackMat;
  const c = canvas();
  const g = c.getContext('2d');
  const r = rng(4242);
  const seamY = (1 - SEAM) * TH;
  // a zigzag walk around the seam, split into three arcs spreading from the front (u = 0)
  const stages = [
    { a: 255, from: -0.1, to: 0.1 },
    { a: 170, from: -0.3, to: 0.3 },
    { a: 85, from: -0.5, to: 0.5 },
  ];
  // each stage is drawn opaque on its own canvas, then laid down at its stage alpha (no alpha build-up)
  const drawZig = (ctx, from, to) => {
    const pts = [];
    const n = Math.max(2, Math.round((to - from) * 40));
    for (let i = 0; i <= n; i++) pts.push([(from + (to - from) * (i / n)) * TW, seamY + (i % 2 ? -9 : 9) + (r() - 0.5) * 6]);
    const br = [];
    for (let i = 1; i < pts.length - 1; i += 3) {
      const [x, y] = pts[i];
      const up = r() < 0.5 ? -1 : 1;
      br.push([[x, y], [x + (r() - 0.5) * 20, y + up * (14 + r() * 16)], [x + (r() - 0.5) * 30, y + up * (28 + r() * 18)]]);
    }
    for (const [w, col] of [[9, '#3c1e0a'], [3.5, '#fff8c8']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = ctx.lineCap = 'round';
      for (const dx of [0, TW]) {
        ctx.beginPath();
        pts.forEach(([x, y]) => ctx.lineTo(x + dx, y));
        ctx.stroke();
        for (const b2 of br) {
          ctx.beginPath();
          b2.forEach(([x, y]) => ctx.lineTo(x + dx, y));
          ctx.stroke();
        }
      }
    }
  };
  stages.forEach((st, i) => {
    const sc = canvas();
    const sg = sc.getContext('2d');
    if (i === 0) drawZig(sg, st.from, st.to);
    else {
      drawZig(sg, st.from, stages[i - 1].from);
      drawZig(sg, stages[i - 1].to, st.to);
    }
    g.globalAlpha = st.a / 255;
    g.drawImage(sc, 0, 0);
  });
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  crackMat = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.99, transparent: false, toneMapped: false });
  return crackMat;
}

// ------------------------------------------------------------------ public

/** A standing egg (1 unit tall). */
export function createEgg(eggId) {
  const g = new THREE.Group();
  g.name = 'egg:' + eggId;
  const m = new THREE.Mesh(geo('whole'), eggMaterial(eggId));
  g.add(m);
  g.userData.mesh = m;
  return g;
}

/** Everything the hatch sequence animates. */
export function eggParts(eggId) {
  return {
    whole: geo('whole'),
    top: geo('top'),
    bottom: geo('bottom'),
    shard: geo('shard'),
    seamY: (1 - Math.cos(Math.PI * SEAM)) / 2 * H,
    seamR: R * Math.sin(Math.PI * SEAM) * (1 + 0.13 * Math.cos(Math.PI * SEAM)),
    mat: eggMaterial(eggId),
    crack: crackMaterial(),
  };
}

/** Jagged "teeth" around the rim of the bottom half (baked into one geometry per egg type colour). */
export function rimTeeth(seamY, seamR) {
  const key = 'teeth';
  if (GEO[key]) return GEO[key];
  const parts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const t = new THREE.ConeGeometry(0.06, 0.1 + (i % 2) * 0.05, 3);
    t.translate(0, 0.05, 0);
    t.rotateY(a);
    t.translate(Math.sin(a) * seamR * 0.97, seamY, Math.cos(a) * seamR * 0.97);
    parts.push(t);
  }
  // merge by hand (tiny)
  const pos = [];
  const nor = [];
  const uv = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    pos.push(...p.attributes.position.array);
    nor.push(...p.attributes.normal.array);
    const u = p.attributes.uv.array;
    for (let i = 0; i < u.length; i += 2) uv.push(u[i] * 0.05, SEAM);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.userData.shared = true;
  GEO[key] = g;
  return g;
}
