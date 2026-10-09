// The Seed Road: gate arch, nine themed biomes walled by cliffs (props kept out of the lane),
// biome entrance banners, distance markers and the Cloud Kingdom end cap. One group per biome for culling.
import * as THREE from 'three';
import { BIOMES, RARITY } from '../config.js';
import { Merger, makeRand, drawTexture, chunkyText, roundRect, signMaterial, signFont, trs } from './kit.js';
import { roadTexture, cakeDetail, fluffDetail } from './textures.js';
import { liquidMaterial } from './water.js';
import { roundTree, pine, rock, bush, flower, leaf, palm } from './props.js';

const TAU = Math.PI * 2;
const ROAD_HALF = 20;

const STYLE = {
  field: { H: 10, base: '#a57a52', rock: ['#5cb847', '#52aa3f', '#66c24f'], top: '#6fcc4c', ledge: '#7ad658', ground: 'grass', frame: '#ffcf33', frame2: '#3fae3f', text: '#1b2440' },
  greenhollow: { H: 17, rock: ['#7a8a70', '#6a7a62', '#88987c'], top: '#43a54c', ledge: '#4cb454', ground: 'grass', frame: '#2f9a44', frame2: '#8a5a34', text: '#ffffff' },
  dustbowl: { H: 24, rock: ['#d9843f', '#e8a560', '#c96a35', '#f2cf98', '#b85a30'], top: '#ecc47d', ledge: '#f0cf8e', ground: 'sand', frame: '#e8793a', frame2: '#ffd9a0', text: '#ffffff' },
  tanglemire: { H: 13, rock: ['#51465e', '#433a50', '#5d5070'], top: '#56703a', ledge: '#648040', ground: 'grass', frame: '#6b3fa0', frame2: '#7a8f3a', text: '#ffffff', channel: 'swamp' },
  emberroot: { H: 22, rock: ['#4a3a3c', '#3c2e30', '#574446'], top: '#3a2622', ledge: '#4a2c24', ground: 'rock', frame: '#ff5a1f', frame2: '#2b1210', text: '#ffffff', channel: 'lava' },
  starbloom: { H: 18, rock: ['#454ba0', '#3a3f8c', '#5258b4'], topTint: '#8a6ae0', top: '#2e3478', ledge: '#3c44a8', ground: 'rock', frame: '#8f6bff', frame2: '#15173d', text: '#ffffff' },
  frostfall: { H: 20, rock: ['#b2c5e2', '#a0b5d8', '#c3d2ea'], top: '#f2f8ff', ledge: '#ffffff', ground: 'snow', frame: '#38b4ef', frame2: '#e8f6ff', text: '#ffffff', pool: 'ice' },
  candy: { H: 18, rock: ['#ffffff', '#ffd6ea', '#ffeed6'], cliff: 'cake', top: '#ffcfe6', ledge: '#fff7fb', ground: 'frosting', frame: '#ff5cb8', frame2: '#fff4fa', text: '#ffffff', channel: 'chocolate', pool: 'chocolate' },
  cloud: { H: 16, rock: ['#eaeeff', '#dfe6fb', '#ede7fb'], topTint: '#fff1c8', cliff: 'cloud', top: '#ffffff', ledge: '#ffffff', ground: 'cloud', frame: '#ffc53a', frame2: '#fffbef', text: '#ffffff' },
};

// Liquids by style key: the channel between the curb and the cliff face, and plateau pools.
const CHANNEL = {
  lava: { c1: '#b3200a', c2: '#ff6a1a', c3: '#ffe07a', scale: 0.18, flow: [0.02, 0.25], glow: 1.35 },
  swamp: { c1: '#2a3a24', c2: '#4a5a34', c3: '#9ab86a', scale: 0.2, flow: [0.05, 0.08], glow: 1.0, bubbles: 1 },
  chocolate: { c1: '#3e1c0c', c2: '#6e3a1c', c3: '#b0703e', scale: 0.2, flow: [0.03, 0.3], glow: 1.0, ripple: 1 },
};
const POOL = {
  swamp: { c1: '#2a3a24', c2: '#4a4a5a', c3: '#9ab86a', scale: 0.15, flow: [0.04, 0.06], bubbles: 1 },
  ice: { c1: '#8ecff5', c2: '#bfe8ff', c3: '#ffffff', scale: 0.08, flow: [0.01, 0.01], glow: 1.05 },
  chocolate: { c1: '#3e1c0c', c2: '#6e3a1c', c3: '#b0703e', scale: 0.15, flow: [0.03, 0.05], ripple: 1 },
};

// Cliff and plateau materials by style key: the shared world ones, or a biome's own detail map (vertex colour x map).
const ownMats = {};
function surfaceMat(kind, mats) {
  if (kind === 'sand' || kind === 'snow') return mats.sand;
  if (kind === 'grass') return mats.grass;
  if (kind === 'cake') return (ownMats.cake ||= new THREE.MeshLambertMaterial({ vertexColors: true, map: cakeDetail() }));
  if (kind === 'frosting') return (ownMats.fluff ||= new THREE.MeshLambertMaterial({ vertexColors: true, map: fluffDetail() }));
  // clouds glow softly from within so their shady sides stay a pale lavender-white instead of turning grey
  if (kind === 'cloud') return (ownMats.cloud ||= new THREE.MeshLambertMaterial({ vertexColors: true, map: fluffDetail(), emissive: 0xc6d0ec, emissiveMap: fluffDetail(), emissiveIntensity: 0.5 }));
  return kind === 'rock' ? mats.rock : mats.rockTop;
}

// ---------------------------------------------------------------- canvas signs

function warnTriangle(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s * 1.1, y + s * 0.8);
  g.lineTo(x - s * 1.1, y + s * 0.8);
  g.closePath();
  g.fillStyle = '#ffcf33';
  g.fill();
  g.lineWidth = s * 0.18;
  g.strokeStyle = '#1b2440';
  g.lineJoin = 'round';
  g.stroke();
  g.fillStyle = '#1b2440';
  g.fillRect(x - s * 0.1, y - s * 0.45, s * 0.2, s * 0.7);
  g.beginPath();
  g.arc(x, y + s * 0.47, s * 0.12, 0, TAU);
  g.fill();
}

function pill(g, x, y, text, bg, fg, size, stroke = '#1b2440') {
  g.font = signFont(size);
  const w = g.measureText(text).width + size * 1.2;
  roundRect(g, x - w / 2, y - size * 0.72, w, size * 1.44, size * 0.72);
  g.fillStyle = bg;
  g.fill();
  g.lineWidth = size * 0.14;
  g.strokeStyle = stroke;
  g.stroke();
  chunkyText(g, text, x, y + size * 0.04, { size, fill: fg, stroke, strokeW: size * 0.16, shadow: false });
  return w;
}

function bannerTextures(bi) {
  const b = BIOMES[bi];
  const st = STYLE[b.id] || STYLE.cloud;
  const rar = RARITY[b.rarity];
  const W = 1024, H = 240;
  const bg = (g, c1, c2) => {
    g.fillStyle = '#1b2440';
    g.fillRect(0, 0, W, H);
    roundRect(g, 6, 6, W - 12, H - 12, 44);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = '#1b2440';
    g.stroke();
    roundRect(g, 22, 22, W - 44, H - 44, 30);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.stroke();
  };
  const front = drawTexture(W, H, (g) => {
    bg(g, st.frame, shadeHex(st.frame, 0.6));
    chunkyText(g, b.name.toUpperCase(), W / 2, 84, { size: 96, fill: '#ffffff', stroke: '#1b2440', strokeW: 18, maxW: W - 100 });
    const rarityText = rar.name.toUpperCase() + (b.secret ? ' + SECRET' : '') + ' SEEDS';
    const monster = b.monster ? `${b.monster.name.toUpperCase()}S AHEAD!` : 'SAFE ZONE - NO MONSTERS';
    // both pills on one line: shrink the text when long names would not fit the board
    g.font = signFont(40);
    const need = g.measureText(rarityText).width + g.measureText(monster).width + 96 + (b.monster ? 50 : 0) + 26;
    const fs = Math.min(40, Math.floor((40 * (W - 96)) / need));
    g.font = signFont(fs);
    const w1 = g.measureText(rarityText).width + fs * 1.2;
    const w2 = g.measureText(monster).width + fs * 1.2 + (b.monster ? fs * 1.25 : 0);
    const gap = fs * 0.65;
    const x0 = W / 2 - (w1 + w2 + gap) / 2;
    pill(g, x0 + w1 / 2, 175, rarityText, rar.color === '#111111' ? '#222' : rar.color, '#ffffff', fs);
    const mx = x0 + w1 + gap + w2 / 2;
    if (b.monster) {
      pill(g, mx + fs * 0.625, 175, monster, '#e8323c', '#ffffff', fs);
      warnTriangle(g, x0 + w1 + gap + fs, 172, fs * 0.7);
    } else pill(g, mx, 175, monster, '#3fbf5a', '#ffffff', fs);
  }, { clamp: true });
  const prev = bi > 0 ? BIOMES[bi - 1].name.toUpperCase() : 'THE GARDENS';
  const back = drawTexture(W, H, (g) => {
    bg(g, '#5a6c86', '#34425a');
    chunkyText(g, prev, W / 2, 90, { size: 88, fill: '#ffffff', stroke: '#1b2440', strokeW: 16, maxW: W - 120 });
    chunkyText(g, 'HOME THIS WAY', W / 2, 180, { size: 50, fill: '#ffe07a', stroke: '#1b2440', strokeW: 10 });
  }, { clamp: true });
  return { front, back };
}

function shadeHex(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return '#' + c.getHexString();
}

function houseIcon(g, x, y, s, fill) {
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s, y - s * 0.05);
  g.lineTo(x + s * 0.72, y - s * 0.05);
  g.lineTo(x + s * 0.72, y + s * 0.8);
  g.lineTo(x - s * 0.72, y + s * 0.8);
  g.lineTo(x - s * 0.72, y - s * 0.05);
  g.lineTo(x - s, y - s * 0.05);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = s * 0.34;
  g.strokeStyle = '#1b2440';
  g.stroke();
  g.fillStyle = fill;
  g.fill();
  g.fillStyle = '#1b2440';
  g.fillRect(x - s * 0.2, y + s * 0.25, s * 0.4, s * 0.55);
}

// Two cells per marker: the front (distance from home, read heading out) and the back (read heading home).
function markerAtlas(values) {
  const cols = 4, rows = Math.ceil((values.length * 2) / cols);
  const cw = 256, ch = 160;
  const cell = (i) => [(i % cols) * cw, Math.floor(i / cols) * ch];
  const tex = drawTexture(cols * cw, rows * ch, (g, W, H) => {
    g.fillStyle = '#1b2440';
    g.fillRect(0, 0, W, H);
    values.forEach((v, i) => {
      let [x, y] = cell(i * 2);
      roundRect(g, x + 8, y + 8, cw - 16, ch - 16, 24);
      g.fillStyle = '#fdf6e3';
      g.fill();
      g.lineWidth = 10;
      g.strokeStyle = '#1b2440';
      g.stroke();
      chunkyText(g, String(v), x + cw / 2, y + 68, { size: 78, fill: '#1b2440', stroke: '#ffffff', strokeW: 6, shadow: false });
      chunkyText(g, 'STUDS', x + cw / 2, y + 126, { size: 30, fill: '#e8793a', stroke: '#ffffff', strokeW: 4, shadow: false });
      // back: "HOME" + house, with the distance still to go
      [x, y] = cell(i * 2 + 1);
      roundRect(g, x + 8, y + 8, cw - 16, ch - 16, 24);
      const gr = g.createLinearGradient(0, y, 0, y + ch);
      gr.addColorStop(0, '#3fdcc8');
      gr.addColorStop(1, '#16a9a0');
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 10;
      g.strokeStyle = '#1b2440';
      g.stroke();
      houseIcon(g, x + 50, y + 56, 24, '#ffe07a');
      chunkyText(g, 'HOME', x + 158, y + 58, { size: 52, fill: '#ffffff', stroke: '#1b2440', strokeW: 10, shadow: false, maxW: 136 });
      chunkyText(g, `${v} STUDS`, x + cw / 2, y + 118, { size: 38, fill: '#1b2440', stroke: '#ffffff', strokeW: 6, shadow: false, maxW: cw - 44 });
    });
  }, { clamp: true });
  const uvRect = (i) => {
    const cu = i % cols, cv = Math.floor(i / cols);
    return [cu / cols, 1 - (cv + 1) / rows, (cu + 1) / cols, 1 - cv / rows];
  };
  return { tex, uvRect };
}

// ---------------------------------------------------------------- cliffs

// Records every terrace block's lane-facing top edge in `ledges` ({s, x, top, zc, len, k, tiers}) for decor.
function cliffs(rockM, topM, s, z0, z1, st, r, face, inset = 0, backM = rockM, ledges = null) {
  const H = st.H;
  const back = face + 3.2;
  // backing mass reaching out to the horizon (does not cast shadows: only the face blocks do)
  const zb = z0 + inset;
  backM.box(s * (back + 320) / 2, (H - 10) / 2, (zb + z1) / 2, 320 - back, H + 10, z1 - zb, st.rock[0], { topFace: st.top, ao: 0.3 });
  topM.box(s * (face + 320) / 2, H + 0.02, (zb + z1) / 2, 320 - face, 0.04, z1 - zb, st.top, { ao: 0 });
  // terraced blocks along the face
  let z = z0;
  let tierIdx = 0;
  while (z < z1 - 0.5) {
    const len = Math.min(z1 - z, r.range(4.5, 9.5));
    const zc = z + len / 2;
    const tiers = r.int(2, 3);
    let x = face;
    for (let k = 0; k < tiers; k++) {
      const top = k === tiers - 1 ? H * r.range(0.98, 1.16) : H * ((k + 1) / (tiers + 0.4)) * r.range(0.85, 1.1);
      const depth = back + 2 - x;
      const col = k === 0 && st.base ? st.base : st.rock[(tierIdx + k) % st.rock.length];
      const topCol = st.topTint ? new THREE.Color(col).lerp(new THREE.Color(st.topTint), 0.45) : new THREE.Color(col).multiplyScalar(1.12);
      rockM.box(s * (x + depth / 2), (top - 2) / 2, zc, depth, top + 2, len + r.range(-0.2, 0.4), col, { topFace: st.ledge, top: topCol, ao: 0.35 });
      if (ledges) ledges.push({ s, x, top, zc, len, k, tiers });
      x += r.range(0.7, 1.5);
    }
    tierIdx += r.int(0, 1);
    z += len;
  }
}

// Terraced grassy cliff facing the plaza/ocean along the mainland's southern edge (field only).
function southFace(B, r) {
  const { rockM, props, st } = B;
  const H = st.H;
  const z0 = B.z0 + 0.05;
  for (const s of [-1, 1]) {
    let x = 20;
    let idx = 0;
    while (x < 320) {
      const len = r.range(5, 10);
      const xc = s * (x + len / 2);
      const tiers = r.int(2, 3);
      let z = z0;
      for (let k = 0; k < tiers; k++) {
        const top = k === tiers - 1 ? H * r.range(0.98, 1.16) : H * ((k + 1) / (tiers + 0.4)) * r.range(0.85, 1.1);
        const depth = z0 + 5.5 - z;
        const col = k === 0 ? st.base : st.rock[(idx + k) % st.rock.length];
        rockM.box(xc, (top - 6) / 2, z + depth / 2, len + r.range(-0.2, 0.4), top + 6, depth, col, { topFace: st.ledge, top: new THREE.Color(col).multiplyScalar(1.12), ao: 0.35 });
        z += r.range(0.7, 1.4);
      }
      idx += r.int(0, 1);
      x += len;
    }
    // palms, bushes and flowers along the southern rim
    for (let x2 = 28; x2 < 150; x2 += r.range(9, 15)) {
      palm(props, s * x2, z0 + r.range(6, 11), r, { y: H, h: r.range(9, 13), lean: r.range(0.15, 0.35), yaw: Math.PI + r.range(-0.6, 0.6) });
      bush(props, s * (x2 + r.range(3, 6)), H, z0 + r.range(6, 8), 1.3, r);
    }
  }
}

// ---------------------------------------------------------------- biome decorators

function decorateField(ctx, B, s, r) {
  const { props, topM, glow, z0, z1, st, dens } = B;
  const H = st.H;
  // rolling hills
  for (let i = 0; i < 5; i++) {
    const x = s * r.range(50, 190), z = r.range(z0 + 10, z1 - 10);
    topM.prim('sphere:16', x, H - 3, z, r.range(40, 80), r.range(14, 26), r.range(40, 70), r.pick(['#7ad658', '#62c045', '#86dd62']), { ao: 0.15 });
  }
  // picket fence along the rim
  for (let z = z0 + 1; z < z1; z += 2.2) {
    props.block(s * 25, H, z, 0.28, 1.8, 0.28, '#ffffff', { ao: 0.1 });
    props.prim('cone:4', s * 25, H + 1.95, z, 0.36, 0.3, 0.36, '#ffffff', { ao: 0, ry: Math.PI / 4 });
  }
  for (const y of [0.6, 1.3]) props.box(s * 25, H + y, (z0 + z1) / 2, 0.16, 0.22, z1 - z0, '#ffffff', { ao: 0 });
  // trees along the rim and beyond
  for (let z = z0 + 6; z < z1; z += r.range(9, 16) / dens) {
    const x = s * r.range(28, 44);
    if (r() < 0.6) roundTree(props, x, z, r, { y: H, h: r.range(5, 7), size: r.range(3.5, 5) });
    else pine(props, x, z, r, { y: H, h: r.range(10, 15) });
  }
  for (let i = 0; i < 16 * dens; i++) roundTree(props, s * r.range(50, 150), r.range(z0, z1), r, { y: H, h: r.range(5, 8), size: r.range(4, 6) });
  // flowers on the ledges / wall base
  for (let z = z0 + 2; z < z1; z += r.range(3, 6) / dens) {
    flower(props, s * r.range(19.3, 19.9), 0, z, r.pick(['#ff5a8a', '#ffd23f', '#ffffff', '#7ec8ff', '#ff8a3a']), 1.1);
  }
  // barn + hay + windmill (the windmill turns)
  if (s < 0) {
    const bx = -58, bz = z0 + 55;
    props.block(bx, H, bz, 14, 8, 10, '#d83a3a', { ao: 0.25 });
    props.box(bx, H + 9.4, bz, 14.6, 1.2, 8.2, '#5a3a2a', { rx: 0, ao: 0 });
    props.prim('cone:4', bx, H + 11.3, bz, 16, 5, 12.5, '#6b4424', { ry: Math.PI / 4, ao: 0.2 });
    props.box(bx + 7.05, H + 3, bz, 0.2, 5.5, 4.4, '#ffffff', { ao: 0 });
    props.box(bx + 7.1, H + 3, bz, 0.2, 5.5, 0.4, '#d83a3a', { ao: 0 });
    for (let i = 0; i < 5; i++) props.prim('cyl:10', bx + 10 + (i % 3) * 3, H + 1.25 + (i >= 3 ? 2.4 : 0), bz - 8 + (i % 3) * 0.3 + (i >= 3 ? 1.2 : 0), 2.6, 2.4, 2.6, '#f2cf6a', { rz: Math.PI / 2, ao: 0.2 });
  } else {
    const wx = 46, wz = z0 + 95;
    props.prim('frustum:8', wx, H + 8, wz, 7, 16, 7, '#fff4e0', { ao: 0.3 });
    props.prim('cone:8', wx, H + 17.5, wz, 6.6, 3.5, 6.6, '#d83a3a', { ao: 0.2 });
    props.block(wx - 3.2, H, wz, 0.4, 3.6, 2.2, '#8a5a34', { ao: 0 });
    const blades = new Merger();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 5, Math.sin(a) * 5, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)), new THREE.Vector3(9.5, 1.8, 0.2));
      blades.add('box', m4, k % 2 ? '#ffffff' : '#ff8a8a', { ao: 0.1 });
    }
    blades.prim('cyl:10', 0, 0, -0.4, 1.8, 1.2, 1.8, '#6b4424', { rx: Math.PI / 2 });
    const mesh = blades.build(ctx.mats.flat, { castShadow: false });
    mesh.matrixAutoUpdate = true;
    mesh.position.set(wx - 3.9, H + 14, wz);
    mesh.rotation.y = -Math.PI / 2;
    B.group.add(mesh);
    B.spin.push({ obj: mesh, axis: 'z', speed: 0.9 });
  }
}

function giantMushroom(m, x, y, z, h, capR, r, cap = '#e84a3c') {
  m.cyl(x, y, z, capR * 0.22, h, '#f4ead2', { seg: 10, ao: 0.25 });
  m.cyl(x, y + h * 0.6, z, capR * 0.3, capR * 0.12, '#fff6e0', { seg: 10, ao: 0 });
  m.prim('hemi:14', x, y + h - capR * 0.1, z, capR * 2, capR * 1.2, capR * 2, cap, { ao: 0 });
  m.cyl(x, y + h - capR * 0.12, z, capR * 0.98, capR * 0.14, '#f7e6c4', { seg: 14, ao: 0 });
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU, d = r.range(0.2, 0.75) * capR;
    const hy = Math.sqrt(Math.max(0, 1 - (d / capR) ** 2)) * capR * 0.6;
    m.prim('sphere:6', x + Math.cos(a) * d, y + h - capR * 0.1 + hy, z + Math.sin(a) * d, capR * 0.35, capR * 0.12, capR * 0.35, '#ffffff', { ao: 0 });
  }
}

function decorateGreenhollow(ctx, B, s, r) {
  const { props, z0, z1, st, dens } = B;
  const H = st.H;
  for (let z = z0 + 3; z < z1; z += r.range(6, 10) / dens) {
    const x = s * r.range(26, 34);
    if (r() < 0.5) roundTree(props, x, z, r, { y: H, h: r.range(6, 10), size: r.range(5, 7), colors: ['#2f9a3c', '#3fae3f', '#258a36', '#4cc24a'] });
    else pine(props, x, z, r, { y: H, h: r.range(14, 22), color: r.pick(['#1f7a3a', '#2a8a44', '#2f6e3a']) });
  }
  for (let i = 0; i < 26 * dens; i++) {
    const x = s * r.range(40, 160), z = r.range(z0, z1);
    if (r() < 0.5) roundTree(props, x, z, r, { y: H, h: r.range(7, 11), size: r.range(5, 8), colors: ['#2f9a3c', '#3fae3f', '#258a36'] });
    else pine(props, x, z, r, { y: H, h: r.range(14, 24), color: '#1f7a3a' });
  }
  // giant mushrooms overhanging the rim
  for (let z = z0 + 18; z < z1 - 8; z += r.range(24, 36)) {
    giantMushroom(props, s * r.range(24, 30), H, z, r.range(8, 15), r.range(5, 8), r, r.pick(['#e84a3c', '#e84a3c', '#ff8a3a', '#b35ae0']));
  }
  // shelf mushrooms and vines on the face
  for (let z = z0 + 4; z < z1; z += r.range(5, 9)) {
    const y = r.range(6, H - 2);
    props.prim('hemi:10', s * 21.4, y, z, 3.2, 0.9, 2.4, r.pick(['#e8a54a', '#f4d27a', '#d9843f']), { rz: s * Math.PI / 2 * 0, ao: 0.2 });
    if (r() < 0.7) {
      const len = r.range(4, H - 3);
      props.box(s * 20.35, H - len / 2, z + 1.8, 0.3, len, 0.3, r.pick(['#2f9a3c', '#3fae3f']), { ao: 0 });
      for (let k = 0; k < len; k += 1.6) leaf(props, s * 20.3, H - k, z + 1.8, s < 0 ? Math.PI / 2 : -Math.PI / 2, 0.6, 0.9, 0.7, '#4cc24a', 0.08);
    }
  }
  // small mushrooms at the wall base (non-solid)
  for (let z = z0 + 3; z < z1; z += r.range(4, 8) / dens) {
    const x = s * r.range(19.3, 19.9);
    props.cyl(x, 0, z, 0.18, 0.7, '#fff6e0', { seg: 6, ao: 0 });
    props.prim('hemi:8', x, 0.66, z, 0.9, 0.55, 0.9, r.pick(['#e84a3c', '#ff8a3a', '#b35ae0']), { ao: 0 });
  }
}

function saguaro(m, x, y, z, h, r) {
  const g = '#3f9a4a';
  m.cyl(x, y, z, 0.75, h, g, { seg: 8, ao: 0.2 });
  m.prim('sphere:8', x, y + h, z, 1.5, 1.2, 1.5, g, { ao: 0 });
  const arms = r.int(1, 2);
  for (let i = 0; i < arms; i++) {
    const side = i === 0 ? 1 : -1;
    const ay = y + h * r.range(0.35, 0.6);
    const ax = x + side * 1.9;
    m.beam(x, ay, z, ax, ay, z, 1.1, g, { prim: 'cyl:8', ao: 0 });
    const top = ay + h * r.range(0.25, 0.4);
    m.cyl(ax, ay - 0.3, z, 0.55, top - ay + 0.3, g, { seg: 8, ao: 0.1 });
    m.prim('sphere:8', ax, top, z, 1.1, 0.9, 1.1, g, { ao: 0 });
  }
  m.prim('sphere:6', x, y + h + 0.6, z, 0.7, 0.5, 0.7, '#ff7eb6', { ao: 0 });
}

function decorateDustbowl(ctx, B, s, r) {
  const { props, topM, z0, z1, st, dens } = B;
  const H = st.H;
  // rugged layered mesas out on the plateau
  const { rockM } = B;
  for (let i = 0; i < 6; i++) {
    const x = s * r.range(80, 220), z = r.range(z0 - 20, z1 + 20);
    let w = r.range(22, 46), d = r.range(20, 40);
    const top = r.range(14, 34);
    let y = H - 1;
    let k = 0;
    let ox = 0, oz = 0;
    while (y < H + top) {
      const hh = r.range(3, 6);
      rockM.block(x + ox, y, z + oz, w, hh, d, st.rock[(k + i) % st.rock.length], { ao: 0.25, topFace: '#f0cf8e' });
      y += hh;
      k++;
      ox += r.range(-1.5, 1.5);
      oz += r.range(-1.5, 1.5);
      w *= r.range(0.9, 1.02);
      d *= r.range(0.9, 1.02);
    }
    // a lone butte beside it
    const bx = x + s * r.range(-30, 30), bz = z + r.range(-30, 30);
    let by = H - 1, bw = r.range(6, 10);
    for (let k2 = 0; by < H + top * 0.8; k2++) {
      const hh = r.range(3, 5);
      rockM.block(bx, by, bz, bw, hh, bw * r.range(0.8, 1.2), st.rock[(k2 + 2) % st.rock.length], { ao: 0.2, topFace: '#f0cf8e' });
      by += hh;
      bw *= 0.93;
    }
  }
  // hoodoos (stacked rock spires) on the lower ledges
  for (let z = z0 + 9; z < z1; z += r.range(16, 26)) {
    const x = s * r.range(26, 30);
    let y = H - 0.3, w = r.range(2.2, 3.2);
    const n = r.int(3, 5);
    for (let k = 0; k < n; k++) {
      const hh = r.range(1.2, 2.0);
      props.block(x, y, z, w, hh, w, st.rock[(k + 1) % st.rock.length], { ao: 0.2, ry: r.range(-0.3, 0.3) });
      y += hh;
      w *= k === n - 2 ? 1.5 : 0.85;
    }
  }
  // dunes
  for (let i = 0; i < 6; i++) topM.prim('sphere:14', s * r.range(34, 120), H - 2, r.range(z0, z1), r.range(20, 40), r.range(6, 10), r.range(14, 30), '#f2d196', { ao: 0.1 });
  // saguaros on the rim
  for (let z = z0 + 8; z < z1; z += r.range(12, 20) / dens) saguaro(props, s * r.range(25.5, 34), H, z, r.range(6, 10), r);
  for (let i = 0; i < 10 * dens; i++) saguaro(props, s * r.range(45, 120), H, r.range(z0, z1), r.range(6, 11), r);
  // barrel cacti + pebbles at the wall base
  for (let z = z0 + 5; z < z1; z += r.range(6, 11) / dens) {
    const x = s * r.range(19.3, 19.8);
    props.prim('sphere:8', x, 0.45, z, 0.9, 1.0, 0.9, '#4caf50', { ao: 0.2 });
    props.prim('sphere:5', x, 1.0, z, 0.3, 0.25, 0.3, '#ff5a8a', { ao: 0 });
  }
  // a cow skull on a ledge (friendly!)
  const sz = z0 + 70, sx = s * 25, sy = H + 0.6;
  props.box(sx, sy, sz, 1.4, 1.2, 1.6, '#f4efe4', { ao: 0.1 });
  props.beam(sx, sy + 0.5, sz - 0.7, sx, sy + 1.4, sz - 1.8, 0.3, '#f4efe4');
  props.beam(sx, sy + 0.5, sz + 0.7, sx, sy + 1.4, sz + 1.8, 0.3, '#f4efe4');
}

function deadTree(m, x, y, z, h, r, col = '#3a3030', moss = '#8a9a6a') {
  let px = x, py = y, pz = z;
  for (let i = 0; i < 4; i++) {
    const nx = px + r.range(-0.8, 0.8), nz = pz + r.range(-0.8, 0.8), ny = py + h / 4;
    m.beam(px, py, pz, nx, ny, nz, 1.1 - i * 0.18, col, { prim: 'cyl:6', ao: 0.1 });
    if (i >= 1) {
      const a = r() * TAU, L = r.range(2, 4);
      const bx = nx + Math.cos(a) * L, bz = nz + Math.sin(a) * L, by = ny + r.range(0.5, 2);
      m.beam(nx, ny - 0.4, nz, bx, by, bz, 0.4, col, { prim: 'cyl:5', ao: 0 });
      for (let k = 0; k < 2; k++) m.box(bx - (bx - nx) * k * 0.4, by - 1.2, bz - (bz - nz) * k * 0.4, 0.2, r.range(1.5, 2.6), 0.5, moss, { ao: 0 });
    }
    px = nx; py = ny; pz = nz;
  }
}

function decorateTanglemire(ctx, B, s, r) {
  const { props, glowLit, z0, z1, st, dens } = B;
  const H = st.H;
  // mossy log curb (channel edge), lily pads and cattails in the channel
  props.prim('cyl:8', s * 20.3, 0.45, (z0 + z1) / 2, 1.0, z1 - z0, 1.0, '#5a4630', { rx: Math.PI / 2, ao: 0.1 });
  props.box(s * 20.3, 0.95, (z0 + z1) / 2, 0.8, 0.14, z1 - z0, '#6f8a3a', { ao: 0 });
  for (let z = z0 + 2; z < z1; z += r.range(2.5, 5) / dens) {
    const x = s * r.range(21.2, 23.2);
    if (r() < 0.55) props.cyl(x, 0.33, z, r.range(0.6, 1.0), 0.06, '#4c9a3a', { seg: 10, ao: 0 });
    else {
      for (let k = 0; k < 3; k++) {
        const cx = x + r.range(-0.4, 0.4), cz = z + r.range(-0.4, 0.4), hh = r.range(2, 3.4);
        props.block(cx, 0, cz, 0.1, hh, 0.1, '#6f8a3a', { ao: 0 });
        props.cyl(cx, hh - 0.2, cz, 0.18, 0.8, '#6b4424', { seg: 6, ao: 0 });
      }
    }
  }
  // hanging vines and glowing mushrooms on the face
  for (let z = z0 + 3; z < z1; z += r.range(3, 6)) {
    const len = r.range(3, H - 2);
    props.box(s * 23.65, H - len / 2, z, 0.25, len, 0.25, r.pick(['#3f6a2a', '#56703a', '#2f5a2a']), { ao: 0 });
    for (let k = 1; k < len; k += 2) leaf(props, s * 23.6, H - k, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, 0.8, 0.9, 0.6, '#6f8a3a', 0.08);
    if (r() < 0.4) {
      const y = r.range(2, H - 3);
      glowLit.cyl(s * 23.4, y, z + 1.5, 0.12, 0.5, '#d8c8ff', { seg: 5, ao: 0 });
      glowLit.prim('hemi:8', s * 23.4, y + 0.45, z + 1.5, 1.2, 0.7, 1.2, r.pick(['#6cf2c2', '#b36bff', '#7ec8ff']), { ao: 0 });
    }
  }
  // twisted trees along the rim + beyond
  for (let z = z0 + 5; z < z1; z += r.range(10, 16) / dens) deadTree(props, s * r.range(27, 36), H, z, r.range(9, 15), r);
  for (let i = 0; i < 14 * dens; i++) deadTree(props, s * r.range(40, 130), H, r.range(z0, z1), r.range(10, 18), r);
  // willow-ish purple canopies
  for (let i = 0; i < 8 * dens; i++) {
    const x = s * r.range(30, 90), z = r.range(z0, z1);
    props.cyl(x, H, z, 0.9, 8, '#3a3030', { seg: 6 });
    props.prim('sphere:10', x, H + 10, z, 12, 7, 12, r.pick(['#6b3fa0', '#7a4ab0', '#5a3a8a']), { ao: 0.3 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      props.box(x + Math.cos(a) * 5, H + 5.5, z + Math.sin(a) * 5, 0.4, 5, 0.4, '#8a6ac8', { ao: 0 });
    }
  }
  // swamp pools on the plateau
  for (let i = 0; i < 5; i++) B.pools.push({ x: s * r.range(40, 110), z: r.range(z0 + 10, z1 - 10), w: r.range(14, 30), d: r.range(10, 24), y: H + 0.08 });
}

function decorateEmberroot(ctx, B, s, r) {
  const { props, glowLit, glow, z0, z1, st, dens } = B;
  const H = st.H;
  // basalt curb with glowing seams
  for (let z = z0; z < z1; z += 2.2) {
    props.prim('cyl:6', s * 20.35, 0.45, z + 1.1, 1.3, 0.9 + r.range(0, 0.3), 2.2, r.pick(st.rock), { ao: 0.1 });
    if (r() < 0.4) glow.box(s * 19.95, 0.5, z + 1.1, 0.06, 0.12, r.range(0.8, 1.8), '#ff7a1a', { ao: 0 });
  }
  // basalt columns on the plateau rim (hex prisms of varying height)
  for (let z = z0 + 1; z < z1; z += 2.4) {
    for (let k = 0; k < 3; k++) {
      const x = s * (25.5 + k * 2.1 + (Math.floor(z / 2.4) % 2) * 1.0);
      const h = H * r.range(0.7, 1.15) + k * 1.2;
      props.cyl(x, -1, z + (k % 2) * 1.2, 1.25, h + 1, r.pick(st.rock), { seg: 6, ao: 0.4 });
    }
  }
  // volcanoes
  for (let i = 0; i < 4; i++) {
    const x = s * r.range(60, 150), z = r.range(z0, z1);
    const h = r.range(28, 50), w = h * 1.6;
    props.prim('frustum:10', x, H + h / 2 - 1, z, w, h, w, '#2a2022', { ao: 0.35 });
    props.prim('frustum:10', x, H + h - 1.4, z, w * 0.4, 1.2, w * 0.4, '#3a2224', { ao: 0 });
    B.lavaDiscs.push({ x, z, r: w * 0.3 * 0.5, y: H + h - 0.7 });
    // lava streak down one side
    glow.beam(x + w * 0.12, H + h - 1, z, x + w * 0.42, H + 1, z + r.range(-3, 3), 1.4, '#ff6a1a', { ao: 0 });
  }
  // charred trees and glowing ember rocks
  for (let z = z0 + 6; z < z1; z += r.range(12, 20) / dens) deadTree(props, s * r.range(31, 40), H, z, r.range(8, 13), r, '#1f1818', '#3a2a24');
  for (let i = 0; i < 18 * dens; i++) {
    const x = s * r.range(30, 120), z = r.range(z0, z1);
    rock(glowLit, x, H + 0.5, z, r.range(1.5, 3.5), r, '#ff5a1a');
  }
  // lava falls down the face into the channel
  for (let z = z0 + 18; z < z1 - 10; z += r.range(30, 45)) B.lavaFalls.push({ x: s * 23.7, z, w: r.range(2.5, 4), h: H + 1 });
}

function crystal(m, x, y, z, h, w, col, r) {
  m.prim('octa', x, y + h * 0.35, z, w, h, w, col, { rx: r.range(-0.25, 0.25), rz: r.range(-0.25, 0.25), ry: r() * TAU, ao: 0.25 });
}

function decorateStarbloom(ctx, B, s, r) {
  const { props, glowLit, z0, z1, st, dens } = B;
  const H = st.H;
  const cols = ['#6fd8ff', '#b36bff', '#ff7ae0', '#9ff0ff', '#8f8bff'];
  // crystal clusters on ledges and at the wall base
  for (let z = z0 + 2; z < z1; z += r.range(3, 6) / dens) {
    const c = r.pick(cols);
    const x = s * r.range(19.4, 19.9);
    for (let k = 0; k < 3; k++) crystal(glowLit, x + s * r.range(0, 0.3), 0, z + r.range(-0.6, 0.6), r.range(0.8, 1.8), r.range(0.4, 0.6), c, r);
    if (r() < 0.6) {
      const y = r.range(3, H - 2);
      for (let k = 0; k < 4; k++) crystal(glowLit, s * r.range(20.8, 21.6), y, z + r.range(-1, 1), r.range(1.5, 3), r.range(0.6, 1), r.pick(cols), r);
    }
  }
  // glowing veins on the cliff face
  for (let z = z0 + 3; z < z1; z += r.range(4, 8)) {
    let y = r.range(0.3, 1.0), zz = z;
    const c = r.pick(['#6fd8ff', '#d38bff', '#ff9ae8']);
    for (let k = 0; k < 5 && y < H * 0.22; k++) {
      const len = r.range(0.8, 1.6), a = r.range(-0.9, 0.9);
      B.glow.box(s * 19.96, y + Math.cos(a) * len / 2, zz + Math.sin(a) * len / 2, 0.06, len, 0.14, c, { rx: -a, ao: 0 });
      y += Math.cos(a) * len;
      zz += Math.sin(a) * len;
    }
  }
  // spires along the rim
  for (let z = z0 + 5; z < z1; z += r.range(10, 18) / dens) {
    const c = r.pick(cols);
    const x = s * r.range(26, 40);
    crystal(glowLit, x, H - 1, z, r.range(14, 28), r.range(3, 5), c, r);
    for (let k = 0; k < 3; k++) crystal(glowLit, x + r.range(-3, 3), H - 0.5, z + r.range(-3, 3), r.range(4, 9), r.range(1.5, 2.5), c, r);
  }
  for (let i = 0; i < 16 * dens; i++) crystal(glowLit, s * r.range(45, 150), H - 1, r.range(z0, z1), r.range(10, 30), r.range(3, 6), r.pick(cols), r);
  // glowing star flowers on the plateau edge
  for (let z = z0 + 2; z < z1; z += r.range(4, 8)) {
    const x = s * r.range(24, 30);
    B.glow.prim('octa', x, H + 0.8, z, 1.0, 1.0, 1.0, r.pick(['#fff4a0', '#bff4ff', '#ffc4f2']), { ao: 0 });
  }
}

function floatingIslands(ctx, B, r) {
  const { z0, z1 } = B;
  const isl = new Merger();
  const cols = ['#6fd8ff', '#b36bff', '#ff7ae0'];
  for (let i = 0; i < 9; i++) {
    const s = i % 2 ? 1 : -1;
    const x = i === 4 ? 0 : s * r.range(35, 110), z = r.range(z0 + 10, z1 - 5), y = i === 4 ? 58 : r.range(34, 62);
    const w = r.range(8, 16);
    isl.prim('cone:7', x, y - w * 0.5, z, w, w * 1.1, w, '#2a2d66', { rx: Math.PI, ao: 0.4 });
    isl.cyl(x, y - 0.4, z, w * 0.52, 0.9, '#4a58c8', { seg: 7, ao: 0 });
    crystal(isl, x + r.range(-2, 2), y, z + r.range(-2, 2), r.range(4, 8), r.range(1.5, 2.5), r.pick(cols), r);
    crystal(isl, x + r.range(-3, 3), y, z + r.range(-3, 3), r.range(2, 4), r.range(1, 1.5), r.pick(cols), r);
  }
  const mesh = isl.build(ctx.mats.glowLit, { receiveShadow: false });
  mesh.matrixAutoUpdate = true;
  B.group.add(mesh);
  B.bob.push({ obj: mesh, amp: 1.6, speed: 0.5, base: 0 });
}

const ICE = ['#bff4ff', '#8fe3ff', '#dff9ff', '#a8dcff'];

// An oval plateau pool (frozen pond, chocolate lake) ringed by a soft bank (a squashed torus).
function roundPool(B, x, y, z, w, d, rim) {
  B.pools.push({ x, z, w, d, y: y + 0.08, round: true });
  B.props.add('torus:20', trs(x, y + 0.05, z, (w + 0.4) / 0.8, (d + 0.4) / 0.8, 4, Math.PI / 2), rim, { ao: 0.1 });
}

function snowyPine(m, x, y, z, h, r) {
  const col = r.pick(['#2f7a5c', '#2a6c54', '#378466']);
  m.cyl(x, y, z, 0.5, h * 0.3, '#6e4a2c', { seg: 6 });
  for (let i = 0; i < 3; i++) {
    const w = (1 - (i / 3) * 0.55) * h * 0.42;
    const cy = y + h * 0.43 + (i / 3) * h * 0.55;
    m.prim('cone:8', x, cy, z, w, h * 0.36, w, col, { ao: 0.3, ry: i });
    // snow cap, turned a little so its corners poke out like drifts
    m.prim('cone:8', x, cy + h * 0.075, z, w * 0.68, h * 0.22, w * 0.68, '#ffffff', { ao: 0, ry: i + 0.2 });
  }
}

// face: +1/-1 looks along +x/-x (towards the lane from the left/right plateau)
function snowman(m, x, y, z, s, face, r) {
  m.prim('sphere:10', x, y + 1.25 * s, z, 3 * s, 2.7 * s, 3 * s, '#ffffff', { ao: 0.3 });
  m.prim('sphere:10', x, y + 3.3 * s, z, 2.2 * s, 2.1 * s, 2.2 * s, '#ffffff', { ao: 0.15 });
  m.prim('sphere:10', x, y + 4.9 * s, z, 1.6 * s, 1.55 * s, 1.6 * s, '#ffffff', { ao: 0.05 });
  const scarf = r.pick(['#e8323c', '#3f7bff', '#2fbf5a', '#ff8a1a', '#b36bff']);
  m.cyl(x, y + 4.05 * s, z, 0.85 * s, 0.4 * s, scarf, { seg: 10, ao: 0 });
  m.box(x + face * 0.6 * s, y + 3.6 * s, z + 0.45 * s, 0.3 * s, 1.1 * s, 0.45 * s, scarf, { rx: 0.25, ao: 0 });
  // carrot nose, coal eyes and buttons, stick arms, top hat
  m.beam(x + face * 0.7 * s, y + 4.9 * s, z, x + face * 1.7 * s, y + 4.85 * s, z, 0.36 * s, '#ff8a1a', { prim: 'cone:6', ao: 0 });
  for (const e of [-1, 1]) m.prim('sphere:6', x + face * 0.66 * s, y + 5.25 * s, z + e * 0.3 * s, 0.22 * s, 0.26 * s, 0.22 * s, '#1b2440', { ao: 0 });
  for (let k = 0; k < 3; k++) m.prim('sphere:6', x + face * 1.05 * s, y + (2.8 + k * 0.5) * s, z, 0.26 * s, 0.26 * s, 0.26 * s, '#1b2440', { ao: 0 });
  for (const e of [-1, 1]) m.beam(x, y + 3.5 * s, z + e * 0.9 * s, x + face * 0.2 * s, y + 4.7 * s, z + e * 2.5 * s, 0.18 * s, '#6b4424', { ao: 0 });
  m.cyl(x, y + 5.55 * s, z, 1.0 * s, 0.14 * s, '#1b2440', { seg: 10, ao: 0 });
  m.cyl(x, y + 5.6 * s, z, 0.62 * s, 1.1 * s, '#1b2440', { seg: 10, ao: 0 });
  m.cyl(x, y + 5.72 * s, z, 0.64 * s, 0.22 * s, scarf, { seg: 10, ao: 0 });
}

function penguin(m, x, y, z, s, face) {
  m.prim('sphere:8', x, y + 0.8 * s, z, 1.2 * s, 1.6 * s, 1.1 * s, '#1f2a44', { ao: 0.2 });
  m.prim('sphere:8', x + face * 0.22 * s, y + 0.75 * s, z, 0.8 * s, 1.25 * s, 0.85 * s, '#ffffff', { ao: 0 });
  m.prim('sphere:8', x, y + 1.75 * s, z, 0.9 * s, 0.85 * s, 0.9 * s, '#1f2a44', { ao: 0 });
  for (const e of [-1, 1]) {
    m.prim('sphere:6', x + face * 0.34 * s, y + 1.85 * s, z + e * 0.2 * s, 0.24 * s, 0.28 * s, 0.24 * s, '#ffffff', { ao: 0 });
    m.prim('sphere:6', x + face * 0.43 * s, y + 1.85 * s, z + e * 0.2 * s, 0.12 * s, 0.16 * s, 0.12 * s, '#1b2440', { ao: 0 });
    m.box(x + face * 0.25 * s, y + 0.06 * s, z + e * 0.25 * s, 0.6 * s, 0.12 * s, 0.35 * s, '#ff9a1a', { ao: 0 });
    leaf(m, x, y + 1.2 * s, z + e * 0.5 * s, e > 0 ? 0.3 : Math.PI - 0.3, 1.1, 0.8 * s, 0.35 * s, '#1f2a44', 0.12 * s);
  }
  m.beam(x + face * 0.38 * s, y + 1.68 * s, z, x + face * 0.8 * s, y + 1.64 * s, z, 0.26 * s, '#ff9a1a', { prim: 'cone:4', ao: 0 });
}

function igloo(m, x, y, z, R, face) {
  m.prim('hemi:14', x, y, z, R * 2, R * 1.7, R * 2, '#f4faff', { ao: 0.25 });
  // block rows and an entrance tunnel with a dark doorway facing the lane
  for (const f of [0.3, 0.58, 0.82]) m.cyl(x, y + f * 0.85 * R - 0.06, z, R * Math.sqrt(1 - f * f) * 1.01, 0.12, '#cfe2f4', { seg: 14, open: true, ao: 0 });
  m.prim('cyl:12', x + face * R * 0.95, y, z, R * 0.9, R * 0.9, R * 0.9, '#f4faff', { rz: Math.PI / 2, ao: 0.1 });
  m.prim('cyl:12', x + face * R * 1.4, y, z, R * 0.62, 0.1, R * 0.62, '#2a3a5c', { rz: Math.PI / 2, ao: 0 });
}

// A waterfall frozen solid down the cliff face: glassy strands, a snow cap and icicles at the bottom.
function frozenFall(B, s, z, w, r) {
  const { glowLit, props, st } = B;
  const H = st.H;
  const n = Math.max(3, Math.round(w / 1.1));
  for (let i = 0; i < n; i++) {
    const zz = z - w / 2 + (i + 0.5) * (w / n);
    const x = 20.1 + r.range(0, 0.4);
    const bottom = i % 2 ? r.range(0.8, 2.6) : 0;
    glowLit.box(s * (x + 1.7), (H + 0.6 + bottom) / 2, zz, 3.4, H + 0.6 - bottom, w / n + 0.08, r.pick(['#7fd4f5', '#62c4ee', '#9ee0fa']), { top: '#d8f6ff', ao: 0.2 });
    if (bottom) glowLit.prim('cone:5', s * (x + 0.3), bottom - 0.5, zz, 0.7, 1.0, 0.7, '#dff9ff', { rx: Math.PI, ao: 0 });
  }
  props.box(s * 21.6, H + 0.8, z, 3.4, 0.9, w + 1.2, '#ffffff', { ao: 0.1 });
  for (let k = 0; k < 6; k++) crystal(glowLit, s * r.range(19.4, 20.2), 0, z + r.range(-w / 2, w / 2), r.range(0.8, 1.8), r.range(0.5, 0.8), r.pick(ICE), r);
}

function decorateFrostfall(ctx, B, s, r) {
  const { props, glowLit, topM, rockM, z0, z1, st, dens } = B;
  const H = st.H;
  // snow lips on every terrace, icicles hanging from the upper ones and penguins on a few ledges
  for (const L of B.ledges) {
    if (L.s !== s) continue;
    props.box(s * (L.x + 0.6), L.top + 0.12, L.zc, 1.9, 0.5, L.len + 0.1, '#ffffff', { ao: 0.12 });
    if (L.k === 0) continue;
    for (let i = r.int(1, 3); i > 0; i--) {
      const len = r.range(0.8, 2.6);
      glowLit.prim('cone:5', s * (L.x - 0.15), L.top - 0.13 - len / 2, L.zc + r.range(-0.45, 0.45) * L.len, r.range(0.35, 0.6), len, r.range(0.35, 0.6), '#dff8ff', { rx: Math.PI, ao: 0 });
    }
    if (L.k < L.tiers - 1 && r() < 0.12) penguin(props, s * (L.x + 0.45), L.top + 0.37, L.zc, 1.1, -s);
  }
  // snowdrifts and little ice crystals at the wall base (non-solid)
  for (let z = z0 + 2; z < z1; z += r.range(3, 6) / dens) {
    props.prim('hemi:8', s * r.range(19.9, 20.3), 0, z, r.range(1.4, 2.2), r.range(0.6, 1.1), r.range(2, 4), '#ffffff', { ao: 0.1 });
    if (r() < 0.4) for (let k = 0; k < 3; k++) crystal(glowLit, s * r.range(19.4, 19.9), 0, z + r.range(-0.6, 0.6), r.range(0.8, 1.6), r.range(0.35, 0.55), r.pick(ICE), r);
  }
  // frozen waterfalls down the face
  for (let z = z0 + 22; z < z1 - 12; z += r.range(34, 48)) frozenFall(B, s, z, r.range(4, 6), r);
  // snowy pines on the rim and beyond, snowmen watching the road
  for (let z = z0 + 4; z < z1; z += r.range(8, 13) / dens) snowyPine(props, s * r.range(27, 40), H, z, r.range(10, 17), r);
  for (let i = 0; i < 18 * dens; i++) snowyPine(props, s * r.range(45, 150), H, r.range(z0, z1), r.range(12, 22), r);
  for (let z = z0 + 14 + (s > 0 ? 20 : 0); z < z1 - 10; z += r.range(40, 55)) snowman(props, s * r.range(26.5, 29), H, z, r.range(1.5, 1.9), -s, r);
  // ice spires out on the snowfield
  for (let z = z0 + 10; z < z1; z += r.range(18, 30) / dens) {
    const x = s * r.range(30, 44);
    crystal(glowLit, x, H - 1, z, r.range(10, 18), r.range(2.5, 4), r.pick(ICE), r);
    for (let k = 0; k < 2; k++) crystal(glowLit, x + r.range(-3, 3), H - 0.5, z + r.range(-3, 3), r.range(3, 7), r.range(1.2, 2), r.pick(ICE), r);
  }
  // soft snow hills and snow-capped mountains on the skyline
  for (let i = 0; i < 5; i++) topM.prim('sphere:16', s * r.range(50, 190), H - 3, r.range(z0 + 10, z1 - 10), r.range(40, 80), r.range(12, 22), r.range(40, 70), '#f6faff', { ao: 0.12 });
  for (let i = 0; i < 5; i++) {
    const x = s * r.range(95, 230), z = r.range(z0 - 30, z1 + 30);
    const h = r.range(55, 100), w = h * r.range(1.1, 1.45), ry = r() * TAU;
    for (const [dx, dz, k] of [[0, 0, 1], [r.range(-0.5, 0.5) * w, r.range(0.3, 0.6) * w, r.range(0.5, 0.7)]]) {
      rockM.prim('cone:7', x + dx, H - 2 + (h * k) / 2, z + dz, w * k, h * k, w * k, r.pick(st.rock), { ry, ao: 0.35 });
      rockM.prim('cone:7', x + dx, H - 2 + h * k * 0.8, z + dz, w * k * 0.43, h * k * 0.4, w * k * 0.43, '#ffffff', { ry, ao: 0 });
    }
  }
  // frozen ponds, an igloo with a snowman friend / a snowman family
  for (let i = 0; i < 3; i++) roundPool(B, s * r.range(45, 110), H, r.range(z0 + 15, z1 - 15), r.range(14, 26), r.range(10, 20), '#ffffff');
  if (s < 0) {
    igloo(props, -40, H, z0 + 62, 6.5, 1);
    snowman(props, -32, H, z0 + 52, 1.2, 1, r);
  } else {
    for (const [dz, k] of [[0, 1.9], [5.5, 1.45], [9.8, 0.95]]) snowman(props, 30 + dz * 0.3, H, z0 + 96 + dz, k, -1, r);
  }
}

// ---------------------------------------------------------------- candy canyon

const CANDY = ['#ff4f9a', '#ffcf33', '#7ee36b', '#b36bff', '#4fc3ff', '#ff7a3a'];
const FROSTING = ['#fff6fb', '#ffc2de', '#c8f5e4', '#fff1a8', '#e2d4ff'];

// swirl disc facing the lane (bullseye rings, the inner ones stand proud)
function lollipop(m, x, y, z, h, R, r) {
  const [a, b] = r.pick([['#ff4f9a', '#ffffff'], ['#ffcf33', '#ff7a3a'], ['#7ee36b', '#ffffff'], ['#b36bff', '#7fe0ff'], ['#ff3b4f', '#ffe14d']]);
  m.cyl(x, y, z, 0.3, h, '#ffffff', { seg: 6, ao: 0.1 });
  const ry = r.range(-0.4, 0.4);
  for (let k = 0; k < 3; k++) m.prim('cyl:12', x, y + h + R * 0.8, z, R * 2 * (1 - k * 0.3), 0.8 + k * 0.14, R * 2 * (1 - k * 0.3), k % 2 ? b : a, { rz: Math.PI / 2, ry, ao: 0 });
}

function candyCane(m, x, y, z, h, yaw, r) {
  const R = 0.6;
  const c = r.pick(['#ff3b4f', '#ff3b4f', '#2fbf5a', '#ff4f9a']);
  m.cyl(x, y, z, R, h, '#ffffff', { seg: 8, ao: 0 });
  for (let t = 0.6; t < h - 0.6; t += 2.4) m.cyl(x, y + t, z, R * 1.06, 1.2, c, { seg: 8, open: true, ao: 0 });
  // the hook: a striped half circle of open tubes, each a little long so the bends close up
  const dx = Math.sin(yaw), dz = Math.cos(yaw), rho = 1.5, N = 6;
  let px = x, py = y + h, pz = z;
  for (let i = 1; i <= N; i++) {
    const a = Math.PI - (i / N) * Math.PI;
    const nx = x + dx * rho * (1 + Math.cos(a)), ny = y + h + Math.sin(a) * rho, nz = z + dz * rho * (1 + Math.cos(a));
    const ex = (nx - px) * 0.2, ey = (ny - py) * 0.2, ez = (nz - pz) * 0.2;
    m.beam(px - ex, py - ey, pz - ez, nx + ex, ny + ey, nz + ez, R * 2, i % 2 ? c : '#ffffff', { prim: 'cylo:8', ao: 0 });
    px = nx; py = ny; pz = nz;
  }
  m.cyl(px, py - 0.8, pz, R, 0.9, c, { seg: 8, ao: 0 });
}

function cupcake(m, x, y, z, s, r) {
  const icing = r.pick(FROSTING);
  m.prim('frustum:12', x, y + 1.1 * s, z, 3.2 * s, 2.2 * s, 3.2 * s, r.pick(['#ff7eb6', '#7fd8ff', '#b8f28a', '#ffd45a', '#c9a8ff']), { rx: Math.PI, ao: 0.25 });
  m.prim('sphere:10', x, y + 2.6 * s, z, 3.7 * s, 1.7 * s, 3.7 * s, icing, { ao: 0.1 });
  m.prim('sphere:10', x, y + 3.35 * s, z, 2.7 * s, 1.4 * s, 2.7 * s, icing, { ao: 0.05 });
  m.prim('sphere:8', x, y + 4.0 * s, z, 1.6 * s, 1.1 * s, 1.6 * s, icing, { ao: 0 });
  m.prim('sphere:6', x, y + 4.75 * s, z, 0.95 * s, 0.95 * s, 0.95 * s, '#e8233a', { ao: 0 });
  m.beam(x, y + 5.1 * s, z, x + 0.35 * s, y + 5.9 * s, z, 0.12 * s, '#3f9a3c', { ao: 0 });
  // sprinkles on the lower swirl
  for (let k = 0; k < 7; k++) {
    const a = r() * TAU, d = r.range(1.4, 1.75);
    const hy = 0.85 * Math.sqrt(Math.max(0, 1 - (d / 1.85) ** 2));
    m.box(x + Math.cos(a) * d * s, y + (2.6 + hy) * s, z + Math.sin(a) * d * s, 0.12 * s, 0.12 * s, 0.4 * s, r.pick(CANDY), { ry: r() * TAU, rx: 0.4, ao: 0 });
  }
}

function iceCream(m, x, y, z, s, r) {
  m.prim('cone:10', x, y + 2.5 * s, z, 2.4 * s, 5 * s, 2.4 * s, '#e3a55e', { rx: Math.PI, ao: 0.25 });
  m.cyl(x, y + 4.85 * s, z, 1.3 * s, 0.45 * s, '#d18f48', { seg: 10, ao: 0 });
  let yy = y + 5.9 * s;
  const n = r.int(1, 3);
  for (let k = 0; k < n; k++) {
    const q = 1 - k * 0.1;
    m.prim('sphere:10', x, yy, z, 2.8 * s * q, 2.4 * s * q, 2.8 * s * q, r.pick(['#ffb3cf', '#fff3d6', '#9ff0c8', '#8a5230', '#c9a8ff', '#ffe27a']), { ao: 0.1 });
    yy += 1.9 * s * q;
  }
  m.prim('sphere:6', x, yy - 0.5 * s, z, 0.8 * s, 0.8 * s, 0.8 * s, '#e8233a', { ao: 0 });
}

function cottonCandy(m, x, y, z, h, r) {
  const c = r.pick(['#ffb3de', '#b3e5ff', '#e0c3ff', '#ffd1e8']);
  m.cyl(x, y, z, 0.3, h, '#fff4e0', { seg: 6 });
  m.prim('sphere:8', x, y + h + 2.2, z, 5.4, 4.8, 5.4, c, { ao: 0.3 });
  m.prim('sphere:6', x + 1.3, y + h + 3.7, z - 0.6, 3.4, 3.0, 3.4, c, { ao: 0.2 });
  m.prim('sphere:6', x - 1.3, y + h + 3.3, z + 0.9, 3.0, 2.6, 3.0, c, { ao: 0.2 });
}

// A frosting drip hanging len below y: one stretched sphere whose top tucks into the frosting above.
function drip(m, x, y, z, len, w, col) {
  m.prim('sphere:6', x, y + 0.15 - len / 2, z, w, len + 0.3, w, col, { ao: 0 });
}

function decorateCandy(ctx, B, s, r) {
  const { props, glowLit, rockM, z0, z1, st, dens } = B;
  const H = st.H;
  // candy cane rail (channel curb) with marshmallows and gumdrops bobbing in the chocolate
  props.prim('cyl:10', s * 20.3, 0.5, (z0 + z1) / 2, 1.0, z1 - z0, 1.0, '#ffffff', { rx: Math.PI / 2, ao: 0.1 });
  for (let z = z0 + 0.8; z < z1; z += 1.8) props.prim('cylo:8', s * 20.3, 0.5, z, 1.07, 0.8, 1.07, '#ff3b5c', { rx: Math.PI / 2, ao: 0 });
  for (let z = z0 + 2; z < z1; z += r.range(3, 6) / dens) {
    const x = s * r.range(21.4, 23.2);
    if (r() < 0.6) props.cyl(x, 0.05, z, r.range(0.5, 0.75), r.range(0.6, 0.9), r.pick(['#ffffff', '#ffd6ea', '#d8f5ff']), { seg: 8, ao: 0.1, ry: r() });
    else glowLit.prim('hemi:8', x, 0.1, z, 1.2, 1.5, 1.2, r.pick(CANDY), { ao: 0.1 });
  }
  // frosting on every terrace with drips down the cake, and stretches drenched in chocolate glaze
  const glazed = [];
  for (let z = z0 + 14; z < z1 - 8; z += r.range(26, 40)) glazed.push([z - r.range(5, 9), z + r.range(5, 9)]);
  for (const L of B.ledges) {
    if (L.s !== s) continue;
    const choc = glazed.some(([a, b]) => L.zc > a && L.zc < b);
    const c = choc ? r.pick(['#6b3a1e', '#7a4424', '#5a2e16']) : r.pick(FROSTING);
    props.box(s * (L.x + 0.55), L.top + 0.12, L.zc, 1.8, 0.5, L.len + 0.05, c, { ao: 0.08 });
    for (let i = choc ? r.int(2, 4) : r.int(1, 2); i > 0; i--) {
      drip(props, s * (L.x - 0.1), L.top, L.zc + r.range(-0.44, 0.44) * L.len, r.range(0.8, L.k ? (choc ? 5 : 2.8) : 1.6), choc ? 0.9 : 0.75, c);
    }
  }
  // lollipops, candy canes, ice cream cones and cupcakes along the rim
  for (let z = z0 + 5; z < z1; z += r.range(8, 13) / dens) {
    const x = s * r.range(27, 36), k = r();
    if (k < 0.4) lollipop(props, x, H, z, r.range(6, 11), r.range(2.6, 4.2), r);
    else if (k < 0.6) candyCane(props, x, H, z, r.range(8, 13), s < 0 ? Math.PI / 2 : -Math.PI / 2, r);
    else if (k < 0.8) iceCream(props, x, H, z, r.range(1.3, 1.8), r);
    else cupcake(props, x, H, z, r.range(1.6, 2.3), r);
  }
  // cotton candy trees, gumdrop hills and lollipops out on the frosting
  for (let i = 0; i < 12 * dens; i++) cottonCandy(props, s * r.range(40, 150), H, r.range(z0, z1), r.range(6, 11), r);
  for (let i = 0; i < 10 * dens; i++) glowLit.prim('hemi:12', s * r.range(38, 140), H - 0.5, r.range(z0, z1), r.range(8, 16), r.range(10, 18), r.range(8, 16), r.pick(CANDY), { ao: 0.25 });
  for (let i = 0; i < 8 * dens; i++) lollipop(props, s * r.range(45, 130), H, r.range(z0, z1), r.range(12, 20), r.range(4, 7), r);
  // giant layered cakes on the skyline (the cake texture on the tiers), frosted, with a cherry on top
  for (let i = 0; i < 4; i++) {
    const x = s * r.range(85, 220), z = r.range(z0 - 20, z1 + 20);
    let rad = r.range(16, 28), y = H - 1;
    for (let k = r.int(2, 3); k > 0; k--) {
      const hh = r.range(9, 14), c = r.pick(FROSTING);
      rockM.cyl(x, y, z, rad, hh, r.pick(st.rock), { seg: 16, ao: 0.2 });
      props.cyl(x, y + hh, z, rad * 1.03, 0.9, c, { seg: 16, ao: 0 });
      for (let n = Math.round(rad * 0.28), i = 0; i < n; i++) {
        const a = (i / n) * TAU + r.range(-0.2, 0.2);
        drip(props, x + Math.cos(a) * rad * 1.02, y + hh + 0.3, z + Math.sin(a) * rad * 1.02, r.range(1, 2.8), 1.1, c);
      }
      y += hh + 0.9;
      rad *= r.range(0.6, 0.72);
    }
    props.prim('sphere:10', x, y + rad * 0.3, z, rad * 0.9, rad * 0.9, rad * 0.9, '#e8233a', { ao: 0.1 });
  }
  // chocolate pools on the frosting
  for (let i = 0; i < 3; i++) roundPool(B, s * r.range(40, 110), H, r.range(z0 + 15, z1 - 15), r.range(12, 24), r.range(10, 18), '#ffb8da');
}

// ---------------------------------------------------------------- cloud kingdom

const GOLD = '#ffc93c';
const MARBLE = '#fffaf0';
const RAINBOW = ['#ff4f5e', '#ff9f3a', '#ffe14d', '#5cd65c', '#4fa8ff', '#9a6bff'];

function cloudPuff(m, x, y, z, w, r) {
  m.prim('sphere:10', x, y, z, w, w * 0.45, w * 0.8, '#e6ecff', { top: '#ffffff', ao: 0.2 });
  for (let k = 0; k < 3; k++) {
    const a = r() * TAU, d = r.range(0.15, 0.3) * w, q = r.range(0.35, 0.55) * w;
    m.prim('sphere:8', x + Math.cos(a) * d, y + w * 0.12, z + Math.sin(a) * d, q, q * 0.85, q, '#eef2ff', { top: '#ffffff', ao: 0.15 });
  }
}

function goldColumn(m, x, y, z, h, rad) {
  m.block(x, y, z, rad * 2.8, 0.6, rad * 2.8, MARBLE, { ao: 0.2 });
  m.cyl(x, y + 0.6, z, rad * 1.2, 0.4, GOLD, { seg: 8, ao: 0 });
  m.cyl(x, y + 1, z, rad, h - 2, GOLD, { seg: 8, ao: 0.15, top: '#ffe38a' });
  m.cyl(x, y + h - 1, z, rad * 1.25, 0.4, GOLD, { seg: 8, ao: 0 });
  m.block(x, y + h - 0.6, z, rad * 2.8, 0.6, rad * 2.8, MARBLE, { ao: 0 });
}

// Little marble temple on golden columns, its gable end facing the lane.
function skyTemple(m, glow, x, y, z) {
  const W = 11, D = 13, h = 9;
  m.block(x, y - 0.5, z, D + 3, 1.2, W + 3, MARBLE, { ao: 0.25 });
  m.block(x, y + 0.7, z, D + 1.6, 0.6, W + 1.6, MARBLE, { ao: 0.1 });
  for (const dx of [-1, 1]) for (const dz of [-1, -1 / 3, 1 / 3, 1]) goldColumn(m, x + dx * D * 0.4, y + 1.3, z + dz * W * 0.42, h, 0.6);
  m.block(x, y + 1.3 + h, z, D + 1, 1.3, W + 1, MARBLE, { ao: 0 });
  m.box(x, y + 1.9 + h, z, D + 1.1, 0.4, W + 1.1, GOLD, { ao: 0 });
  // pediment: a triangular prism, gold behind marble so its outline shines
  const hp = 3.6;
  m.prim('cyl:3', x, y + 2.6 + h + hp / 3, z, W / 0.866, D + 1, hp / 0.75, MARBLE, { rx: -Math.PI / 2, ry: Math.PI / 2, ao: 0 });
  m.prim('cyl:3', x, y + 2.45 + h + hp / 3, z, (W + 1.2) / 0.866, D + 0.6, (hp + 0.9) / 0.75, GOLD, { rx: -Math.PI / 2, ry: Math.PI / 2, ao: 0 });
  glow.prim('sphere:10', x, y + 3.2 + h + hp, z, 1.6, 1.6, 1.6, '#fff1a8', { ao: 0 });
  glow.prim('sphere:10', x, y + 5, z, 3, 3, 3, '#fff6d0', { ao: 0 });
}

// Rainbow in the XY plane at z, centred on (cx, cy), outer radius R, band width bw, depth along z.
function rainbowArc(m, cx, cy, z, R, bw, depth, N = 14) {
  RAINBOW.forEach((c, i) => {
    const rr = R - (i + 0.5) * bw;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI - 0.012, a1 = ((k + 1) / N) * Math.PI + 0.012;
      m.beam(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, z, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, z, bw, c, { sz: depth / bw, ao: 0 });
    }
  });
}

function decorateCloud(ctx, B, s, r) {
  const { props, glow, glowLit, topM, z0, z1, st, dens } = B;
  const H = st.H;
  // soft glowing puffs along every terrace edge (self-lit, so their shady sides stay cloud-white)
  for (const L of B.ledges) {
    if (L.s !== s) continue;
    const rim = L.k === L.tiers - 1;
    const n = Math.max(1, Math.round((L.len * (0.6 + 0.4 * dens)) / 5.5));
    for (let i = 0; i < n; i++) {
      if (!rim && r() < 0.4) continue;
      const q = r.range(1.7, 2.6) * (rim ? 1.25 : L.k ? 1 : 0.75);
      glowLit.prim('sphere:10', s * (L.x + q * 0.55), L.top - q * 0.2, L.zc + ((i + 0.5) / n - 0.5) * L.len + r.range(-0.5, 0.5), q * 2, q * 1.5, q * 2, '#c8d2ea', { ao: 0.3 });
    }
  }
  // cloud tufts and halo lilies at the wall base (non-solid)
  for (let z = z0 + 2; z < z1; z += r.range(6, 10) / dens) {
    glowLit.prim('hemi:6', s * r.range(19.9, 20.3), 0, z, r.range(1.4, 2.2), r.range(0.9, 1.4), r.range(2, 3.5), '#c8d2ea', { ao: 0.2 });
    if (r() < 0.5) {
      const x = s * r.range(19.3, 19.6);
      flower(props, x, 0, z + 1.4, '#ffffff', 1.2);
      glow.cyl(x, 1.25, z + 1.4, 0.42, 0.06, '#ffe27a', { seg: 8, open: true, ao: 0 });
    }
  }
  // golden colonnades along the rim with temples between them
  const templeZ = s < 0 ? z0 + 42 : z0 + 108;
  for (let z = z0 + 8; z < z1 - 6; z += 10) {
    if (Math.abs(z - templeZ) < 14) continue;
    const h = 11;
    goldColumn(props, s * 26.5, H, z, h, 0.75);
    glow.prim('sphere:6', s * 26.5, H + h + 0.8, z, 1.2, 1.2, 1.2, '#fff1a8', { ao: 0 });
    if (Math.abs(z + 10 - templeZ) >= 14 && z + 10 < z1 - 6) props.box(s * 26.5, H + h + 0.1, z + 5, 1.4, 0.8, 10.4, GOLD, { ao: 0 });
  }
  skyTemple(props, glow, s * 32, H, templeZ);
  // golden trees and cloud bushes on the plateau, palace towers on the skyline
  for (let z = z0 + 5; z < z1; z += r.range(16, 22) / dens) {
    if (Math.abs(z - templeZ) > 12) roundTree(props, s * r.range(33, 42), z, r, { y: H, h: r.range(5, 8), size: r.range(3.5, 5), colors: ['#ffd23f', '#ffe27a', '#f5c030'] });
  }
  for (let i = 0; i < 6 * dens; i++) cloudPuff(glowLit, s * r.range(40, 150), H + 1, r.range(z0, z1), r.range(8, 16), r);
  for (let i = 0; i < 5; i++) topM.prim('sphere:16', s * r.range(50, 190), H - 3, r.range(z0 + 10, z1 - 10), r.range(40, 80), r.range(14, 26), r.range(40, 70), '#ffffff', { ao: 0.12 });
  for (let i = 0; i < 4; i++) {
    const x = s * r.range(110, 220), z = r.range(z0, z1), h = r.range(34, 64), rad = r.range(4, 7);
    props.cyl(x, H - 1, z, rad, h, MARBLE, { seg: 12, ao: 0.25 });
    for (const f of [0.35, 0.7]) props.cyl(x, H - 1 + h * f, z, rad * 1.05, 1, GOLD, { seg: 12, ao: 0 });
    props.cyl(x, H - 1 + h, z, rad * 1.25, 1.2, GOLD, { seg: 12, ao: 0 });
    props.prim('cone:12', x, H + h + rad * 1.1, z, rad * 2.6, rad * 2.6, rad * 2.6, GOLD, { ao: 0.1 });
    glow.prim('sphere:8', x, H + h + rad * 2.5, z, 1.8, 1.8, 1.8, '#fff1a8', { ao: 0 });
  }
  // a rainbow over the road (camera-only canopies so the follow camera never sits inside the bands)
  if (s > 0) {
    const z = z0 + 78, R = 36, cy = 3, bw = 1.3, depth = 2.4, ri = R - RAINBOW.length * bw;
    rainbowArc(glow, 0, cy, z, R, bw, depth);
    for (let x = -24; x < 24; x += 8) {
      const far = Math.max(Math.abs(x), Math.abs(x + 8)), near = Math.min(Math.abs(x), Math.abs(x + 8));
      ctx.colliders.push({ minX: x, maxX: x + 8, minY: 1e4, maxY: 1e4, camMinY: cy + Math.sqrt(ri * ri - far * far) - 0.5, camMaxY: cy + Math.sqrt(R * R - near * near) + 0.5, minZ: z - depth / 2 - 0.3, maxZ: z + depth / 2 + 0.3, tag: 'canopy' });
    }
  }
}

function cloudIslands(ctx, B, r) {
  const { z0, z1 } = B;
  const isl = new Merger();
  for (let i = 0; i < 7; i++) {
    const s = i % 2 ? 1 : -1;
    const x = s * r.range(36, 90), z = r.range(z0 + 10, z1 - 5), y = r.range(36, 62);
    const w = r.range(10, 16);
    cloudPuff(isl, x, y, z, w, r);
    if (i % 2 === 0) {
      // a golden gazebo
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        isl.cyl(x + Math.cos(a) * 2.2, y + w * 0.15, z + Math.sin(a) * 2.2, 0.35, 4.2, GOLD, { seg: 6, ao: 0 });
      }
      isl.cyl(x, y + w * 0.15 + 4.2, z, 3, 0.5, MARBLE, { seg: 10, ao: 0 });
      isl.prim('hemi:10', x, y + w * 0.15 + 4.7, z, 5, 3.4, 5, GOLD, { ao: 0.1 });
    } else roundTree(isl, x, z, r, { y: y + w * 0.12, h: r.range(3, 4.5), size: r.range(2.6, 3.4), colors: ['#ffd23f', '#ffe27a'] });
  }
  const mesh = isl.build(ctx.mats.glowLit, { receiveShadow: false });
  mesh.matrixAutoUpdate = true;
  B.group.add(mesh);
  B.bob.push({ obj: mesh, amp: 1.4, speed: 0.45, base: 0 });
}

const DECOR = {
  field: decorateField, greenhollow: decorateGreenhollow, dustbowl: decorateDustbowl, tanglemire: decorateTanglemire, emberroot: decorateEmberroot,
  starbloom: decorateStarbloom, frostfall: decorateFrostfall, candy: decorateCandy, cloud: decorateCloud,
};

// ---------------------------------------------------------------- arches

function tikiPillar(m, x, z, h, w, cols) {
  let y = 0;
  let k = 0;
  while (y < h) {
    const hh = Math.min(h - y, 3.2);
    m.block(x, y, z, w, hh, w, cols[k % cols.length], { ao: 0.3 });
    // carved face on the road side
    if (k % 2 === 1) {
      for (const sz of [-1, 1]) {
        m.box(x, y + hh * 0.62, z + sz * (w / 2 + 0.05), w * 0.28, hh * 0.22, 0.12, '#fff4d6', { ao: 0 });
        m.box(x, y + hh * 0.62, z + sz * (w / 2 + 0.1), w * 0.12, hh * 0.12, 0.1, '#1b2440', { ao: 0 });
        m.box(x, y + hh * 0.25, z + sz * (w / 2 + 0.05), w * 0.6, hh * 0.14, 0.12, '#1b2440', { ao: 0 });
      }
    }
    m.block(x, y + hh - 0.25, z, w + 0.3, 0.25, w + 0.3, '#5a3a1e', { ao: 0 });
    y += hh;
    k++;
  }
}

function signBoard(tex, w, h, emissive = 0.28) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(tex, emissive));
}

let blackTex = null;
function black() {
  return (blackTex ||= drawTexture(4, 4, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 4, 4);
  }));
}

function buildGateArch(ctx, group, props, glow, z) {
  const cols = ['#8a5a34', '#b5763f', '#e8793a', '#1ec8c8'];
  for (const s of [-1, 1]) {
    tikiPillar(props, s * 23, z + 1.5, 24, 3.2, cols);
    glow.prim('sphere:10', s * 23, 25.2, z + 1.5, 2.2, 2.2, 2.2, '#ffcf6a', { ao: 0 });
    for (let k = 0; k < 6; k++) leaf(props, s * 23, 24.2, z + 1.5, (k / 6) * TAU, -0.2 + (k % 2) * 0.5, 4.2, 1.6, '#3fae3f');
  }
  props.block(0, 20.6, z + 1.5, 50, 1.6, 2.4, '#8a5a34', { ao: 0.2 });
  for (let i = -12; i <= 12; i++) props.box(i * 2, 22.6, z + 1.5, 2.1, 0.8, 3.2, i % 2 ? '#d9a95a' : '#c8964c', { rz: 0.15 * (i % 2 ? 1 : -1), ao: 0.15 });
  const front = drawTexture(1024, 300, (g, W, H) => {
    g.fillStyle = '#1b2440';
    g.fillRect(0, 0, W, H);
    roundRect(g, 6, 6, W - 12, H - 12, 50);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#ffcf33');
    gr.addColorStop(1, '#ff8a1a');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 14;
    g.strokeStyle = '#1b2440';
    g.stroke();
    chunkyText(g, 'THE SEED ROAD', W / 2, 118, { size: 126, fill: '#ffffff', stroke: '#1b2440', strokeW: 22, maxW: W - 100 });
    pill(g, W / 2, 232, 'SUNNY FIELD  -  COMMON SEEDS  -  SAFE', '#3fbf5a', '#ffffff', 40);
  }, { clamp: true });
  const back = drawTexture(1024, 300, (g, W, H) => {
    g.fillStyle = '#1b2440';
    g.fillRect(0, 0, W, H);
    roundRect(g, 6, 6, W - 12, H - 12, 50);
    g.fillStyle = '#1ec8c8';
    g.fill();
    g.lineWidth = 14;
    g.strokeStyle = '#1b2440';
    g.stroke();
    chunkyText(g, 'THE GARDENS', W / 2, 120, { size: 120, fill: '#ffffff', stroke: '#1b2440', strokeW: 20, maxW: W - 100 });
    chunkyText(g, 'HOME SWEET HOME', W / 2, 232, { size: 54, fill: '#ffe07a', stroke: '#1b2440', strokeW: 10 });
  }, { clamp: true });
  const f = signBoard(front, 30, 8.8);
  f.position.set(0, 16.2, z + 0.2);
  f.rotation.y = Math.PI;
  const b = signBoard(back, 30, 8.8);
  b.position.set(0, 16.2, z + 2.8);
  props.block(0, 11.7, z + 1.5, 31, 8.9, 2.4, '#1b2440', { ao: 0 });
  group.add(f, b);
  // Camera-solid colliders: the pillars (outside the lane, |x| > 21.4) and the sign board. The board's box
  // starts above the highest jump (feet 6.9 + height 5.2) so it never touches a player.
  for (const s of [-1, 1]) ctx.colliders.push({ minX: s * 23 - 1.6, maxX: s * 23 + 1.6, minY: 0, maxY: 26.4, minZ: z - 0.1, maxZ: z + 3.1, tag: 'arch' });
  ctx.colliders.push({ minX: -21.4, maxX: 21.4, minY: 12.2, maxY: 23, minZ: z + 0.3, maxZ: z + 2.7, tag: 'arch' });
}

function buildBanner(ctx, group, props, z, bi, st) {
  const { front, back } = bannerTextures(bi);
  const H = 23;
  for (const s of [-1, 1]) {
    props.block(s * 22.5, 0, z, 3, H, 3, st.frame2, { ao: 0.3 });
    props.block(s * 22.5, H, z, 3.8, 1.0, 3.8, st.frame, { ao: 0 });
    props.prim('octa', s * 22.5, H + 2.2, z, 2.2, 2.6, 2.2, st.frame, { ao: 0 });
  }
  props.block(0, 19.4, z, 48, 1.2, 1.6, st.frame2, { ao: 0.2 });
  props.block(0, 12.7, z, 30.6, 7.2, 0.5, '#1b2440', { ao: 0 });
  const f = signBoard(front, 30, 7.0);
  f.position.set(0, 16.3, z - 0.3);
  f.rotation.y = Math.PI;
  const b = signBoard(back, 30, 7.0);
  b.position.set(0, 16.3, z + 0.3);
  group.add(f, b);
  // chains
  for (const x of [-12, 12]) props.box(x, 19.1, z, 0.3, 0.8, 0.3, '#5a6270', { ao: 0 });
}

// ---------------------------------------------------------------- main

export function buildRoad(ctx) {
  const { root, layout, mats, quality } = ctx;
  const dens = quality.decorDensity;
  const biomes = [];
  const markerValues = [];
  const markerPos = [];
  for (let z = 100; z < layout.roadEndZ; z += 50) {
    markerValues.push(z);
    markerPos.push(z);
  }
  const atlas = markerAtlas(markerValues);

  layout.biomeRanges.forEach((R, bi) => {
    const b = BIOMES[bi];
    const st = STYLE[b.id] || STYLE.cloud;
    const r = makeRand(1000 + bi * 77);
    const group = new THREE.Group();
    group.name = 'biome-' + b.id;
    root.add(group);
    const B = {
      group, z0: R.minZ, z1: R.maxZ, st, dens,
      rockM: new Merger({ uv: 'box', uvScale: 1 / 12 }),
      backM: new Merger({ uv: 'box', uvScale: 1 / 12 }),
      topM: new Merger({ uv: 'studs', uvScale: 1 / 14 }),
      props: new Merger(),
      glow: new Merger(),
      glowLit: new Merger(),
      pools: [], lavaDiscs: [], lavaFalls: [], ledges: [], spin: [], bob: [],
    };
    const face = st.channel ? 23.8 : 20;
    for (const s of [-1, 1]) cliffs(B.rockM, B.topM, s, R.minZ, R.maxZ, st, r, face, bi === 0 ? 5 : 0, B.backM, B.ledges);
    if (bi === 0) southFace(B, r);
    for (const s of [-1, 1]) (DECOR[b.id] || DECOR.cloud)(ctx, B, s, r);
    if (b.id === 'starbloom') floatingIslands(ctx, B, r);
    if (b.id === 'cloud') cloudIslands(ctx, B, r);

    // road surface
    const { map, emissiveMap } = roadTexture(b.id);
    const len = R.maxZ - R.minZ;
    const geo = new THREE.PlaneGeometry(48, len).rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + 20) / 40, (pos.getZ(i) + len / 2 + R.minZ) / 40);
    const roadMat = new THREE.MeshLambertMaterial({ map, emissiveMap: emissiveMap || black(), emissive: 0xffffff, emissiveIntensity: emissiveMap ? 1.2 : 0 });
    const road = new THREE.Mesh(geo, roadMat);
    road.position.set(0, 0, (R.minZ + R.maxZ) / 2);
    road.receiveShadow = true;
    road.renderOrder = 2;
    road.name = 'road-' + b.id;
    group.add(road);
    // threshold strip at the biome start
    for (let x = -19; x <= 19; x += 2) B.props.box(x, 0.06, R.minZ + 0.6, 1.8, 0.12, 1.2, x % 4 === 1 || x % 4 === -3 ? '#e8e0d0' : shadeHex(st.frame, 1), { ao: 0 });

    // channel liquid (swamp water / lava / chocolate) between the curb and the cliff face
    if (st.channel) {
      const liq = liquidMaterial(CHANNEL[st.channel]);
      const cg = new THREE.PlaneGeometry(4, len).rotateX(-Math.PI / 2);
      for (const s of [-1, 1]) {
        const cm = new THREE.Mesh(cg, liq);
        cm.position.set(s * 22.4, st.channel === 'lava' ? 0.25 : 0.3, (R.minZ + R.maxZ) / 2);
        group.add(cm);
      }
      for (const lf of B.lavaFalls) {
        const fall = new THREE.Mesh(new THREE.PlaneGeometry(lf.w, lf.h), liquidMaterial({ c1: '#c42a0a', c2: '#ff7a1a', c3: '#ffe9a0', scale: 0.3, flow: [0.0, 1.2], glow: 1.4, vertical: true }));
        fall.position.set(lf.x, lf.h / 2 - 0.5, lf.z);
        fall.rotation.y = lf.x < 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(fall);
      }
    }
    if (B.lavaDiscs.length) {
      const lavaTop = liquidMaterial({ c1: '#c42a0a', c2: '#ff7a1a', c3: '#ffe9a0', scale: 0.2, flow: [0.1, 0.1], glow: 1.4 });
      for (const d of B.lavaDiscs) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(d.r, 12).rotateX(-Math.PI / 2), lavaTop);
        m.position.set(d.x, d.y, d.z);
        group.add(m);
      }
    }
    if (B.pools.length) {
      const poolMat = liquidMaterial(POOL[st.pool || 'swamp']);
      const oval = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
      for (const p of B.pools) {
        const m = new THREE.Mesh(p.round ? oval : new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2), poolMat);
        m.position.set(p.x, p.y, p.z);
        if (p.round) m.scale.set(p.w, 1, p.d);
        group.add(m);
      }
    }

    // entrance: gate arch for the first biome, banners for the rest
    if (bi === 0) buildGateArch(ctx, group, B.props, B.glow, R.minZ);
    else buildBanner(ctx, group, B.props, R.minZ, bi, st);

    // end cap
    if (bi === BIOMES.length - 1) buildEndCap(ctx, B, layout.roadEndZ, r);

    // bake
    const add = (m) => m && group.add(m);
    const cliffMat = surfaceMat(st.cliff || 'rock', mats);
    add(B.rockM.build(cliffMat, { name: 'cliffs-' + b.id, castShadow: quality.shadows }));
    const back = B.backM.build(cliffMat, { name: 'cliffback-' + b.id });
    if (back) back.renderOrder = 3;
    add(back);
    const top = B.topM.build(surfaceMat(st.ground, mats), { name: 'plateau-' + b.id });
    if (top) top.renderOrder = 2;
    add(top);
    add(B.props.build(mats.flat, { name: 'props-' + b.id }));
    add(B.glowLit.build(mats.glowLit, { name: 'glowlit-' + b.id }));
    add(B.glow.build(mats.glow, { name: 'glow-' + b.id, receiveShadow: false }));
    biomes.push({ group, minZ: R.minZ, maxZ: R.maxZ, spin: B.spin, bob: B.bob });
  });

  // distance markers (one mesh, atlas texture) on posts at the wall base
  {
    const posts = new Merger();
    const pos = [], uv = [], idx = [];
    // quad of size w x h centred at (cx, cy, cz) facing the horizontal normal (nx, nz), texture upright
    const face = (cx, cy, cz, nx, nz, w, h, [u0, v0, u1, v1]) => {
      const rx = (nz * w) / 2, rz = (-nx * w) / 2; // the viewer's right
      const base = pos.length / 3;
      pos.push(cx - rx, cy - h / 2, cz - rz, cx + rx, cy - h / 2, cz + rz, cx + rx, cy + h / 2, cz + rz, cx - rx, cy + h / 2, cz - rz);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    markerPos.forEach((z, i) => {
      for (const s of [-1, 1]) {
        const x = s * 19.55;
        posts.block(x, 0, z, 0.35, 5.2, 0.35, '#6b4424', { ao: 0.2 });
        // plaque turned a little towards the road centre: front read heading out (north), back heading home
        const ang = s * 0.15;
        const w = 2.6, h = 1.62, cx = x - s * 0.1, cy = 5.9, cz = z;
        const nx = Math.sin(ang), nz = Math.cos(ang); // the back's normal (the front faces -n)
        face(cx, cy, cz, -nx, -nz, w, h, atlas.uvRect(i * 2));
        face(cx + nx * 0.17, cy, cz + nz * 0.17, nx, nz, w, h, atlas.uvRect(i * 2 + 1));
        posts.box(cx + nx * 0.085, cy, cz + nz * 0.085, w + 0.3, h + 0.3, 0.14, '#1b2440', { ry: ang, ao: 0 });
        // camera-only box so the follow camera never ends up inside a plaque near the pods
        ctx.colliders.push({ minX: cx - 1.6, maxX: cx + 1.6, minY: 1e4, maxY: 1e4, camMinY: cy - h / 2 - 0.3, camMaxY: cy + h / 2 + 0.3, minZ: cz - 0.5, maxZ: cz + 0.5, tag: 'canopy' });
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mk = new THREE.Mesh(g, signMaterial(atlas.tex, 0.35));
    mk.name = 'distance-markers';
    root.add(mk);
    root.add(posts.build(mats.flat, { name: 'marker-posts' }));
  }

  return {
    biomes,
    // visible: the biomes overlapping [camZ - behind, camZ + ahead]
    update(dt, t, camZ, ahead, behind = ahead) {
      for (const b of biomes) {
        const vis = b.minZ < camZ + ahead && b.maxZ > camZ - behind;
        b.group.visible = vis;
        if (!vis) continue;
        for (const s of b.spin) s.obj.rotation[s.axis] = t * s.speed;
        for (const o of b.bob) o.obj.position.y = o.base + Math.sin(t * o.speed) * o.amp;
      }
    },
  };
}

// The end of the road: a golden cloud-palace gate with a glowing portal between two towers, a smiling sun
// and a rainbow over the cloud bank. Everything in the lane sits behind the end wall's reach (z >= zEnd - 1.2).
function buildEndCap(ctx, B, zEnd, r) {
  const { props, glowLit, glow } = B;
  B.rockM.block(0, -1, zEnd + 5, 64, 30, 10, '#f2f5ff', { topFace: '#ffffff', ao: 0.25 });
  for (let i = 0; i < 16; i++) props.prim('sphere:10', r.range(-34, 34), r.range(26, 31), zEnd + r.range(3, 8), r.range(10, 18), r.range(7, 11), r.range(8, 12), '#ffffff', { ao: 0.25 });
  rainbowArc(glow, 0, 0, zEnd + 14, 46, 1.8, 3, 18);
  // golden arch on marble-footed columns
  const zg = zEnd + 1.2;
  for (const s of [-1, 1]) {
    props.block(s * 12, 0, zg, 7, 1.2, 3.6, MARBLE, { ao: 0.2 });
    props.cyl(s * 12, 1.2, zg, 2.4, 10.2, GOLD, { seg: 12, ao: 0.2, top: '#ffe38a' });
    props.block(s * 12, 11.4, zg, 6.6, 0.8, 3.4, MARBLE, { ao: 0 });
  }
  glowLit.add('halftorus:20', trs(0, 12.2, zg, 30, 30, 26), GOLD, { ao: 0 });
  for (let k = 1; k < 8; k++) {
    const a = (k / 8) * Math.PI;
    glow.prim('sphere:8', Math.cos(a) * 12, 12.2 + Math.sin(a) * 12, zg - 1.35, 1, 1, 0.6, '#fff6c8', { ao: 0 });
  }
  glowLit.prim('octa', 0, 12.2 + 15.4, zg - 0.4, 3, 3.6, 1.6, '#7fe0ff', { ao: 0 });
  // the portal fills the doorway (its edges tuck behind the columns and the arch)
  const door = new THREE.Shape();
  door.moveTo(-10, 0.05);
  door.lineTo(10, 0.05);
  door.lineTo(10, 12.2);
  door.absarc(0, 12.2, 10, 0, Math.PI, false);
  door.lineTo(-10, 0.05);
  const portal = new THREE.Mesh(new THREE.ShapeGeometry(door, 16), liquidMaterial({ c1: '#8fd4ff', c2: '#fff4d0', c3: '#ffffff', scale: 0.2, flow: [0.12, 0.4], glow: 1.25, vertical: true }));
  portal.position.set(0, 0, zEnd - 0.05);
  portal.rotation.y = Math.PI;
  B.group.add(portal);
  // pearly gates swung open against the wall
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const x = s * (15 + k * 0.95), h = 9 + Math.sin((k / 5) * Math.PI) * 1.4;
      props.cyl(x, 0, zEnd - 0.4, 0.16, h, GOLD, { seg: 6, ao: 0 });
      props.prim('cone:6', x, h + 0.3, zEnd - 0.4, 0.5, 0.7, 0.5, GOLD, { ao: 0 });
    }
    for (const y of [1.2, 5, 8.6]) props.box(s * 17.4, y, zEnd - 0.4, 5.3, 0.3, 0.3, GOLD, { ao: 0 });
    props.add('torus:12', trs(s * 17.4, 6.8, zEnd - 0.4, 3.2, 3.2, 3.2), GOLD, { ao: 0 });
  }
  // palace towers at the ends of the cloud cliffs (solid, outside the lane: the camera stays out of them)
  for (const s of [-1, 1]) {
    const tx = s * 25.5, tz = zEnd - 1;
    props.cyl(tx, 0, tz, 3.4, 30, MARBLE, { seg: 12, ao: 0.3 });
    for (const y of [18, 24, 29.4]) props.cyl(tx, y, tz, 3.6, 0.8, GOLD, { seg: 12, ao: 0 });
    for (const y of [20.2, 25.8]) props.box(tx - s * 3.2, y + 0.8, tz, 0.4, 2.2, 1.2, '#3a5a9a', { ao: 0 });
    props.prim('cone:12', tx, 34.6, tz, 8.6, 9.2, 8.6, GOLD, { ao: 0.1 });
    glow.prim('sphere:10', tx, 39.6, tz, 1.8, 1.8, 1.8, '#fff1a8', { ao: 0 });
    ctx.colliders.push({ minX: tx - 3.4, maxX: tx + 3.4, minY: 0, maxY: 39, minZ: tz - 3.4, maxZ: tz + 3.4, tag: 'deco' });
  }
  // cloud tufts at the foot of the wall
  for (let i = 0; i < 14; i++) {
    const x = (i % 2 ? 1 : -1) * r.range(14.5, 21);
    props.prim('sphere:8', x, 0.3, zEnd + r.range(0.3, 1.5), r.range(2.4, 3.6), r.range(1.6, 2.4), r.range(2, 3), '#ffffff', { ao: 0.2 });
  }
  // smiling sun (the rays turn) above the gate, with a camera-only canopy so the lens never ends up inside it
  const zs = zEnd - 0.4, ys = 37;
  glow.prim('cyl:24', 0, ys, zs, 9, 1, 9, '#ffe14d', { rx: Math.PI / 2, ao: 0 });
  glow.prim('cyl:24', 0, ys, zs - 0.1, 7.6, 1, 7.6, '#fff3a0', { rx: Math.PI / 2, ao: 0 });
  for (const e of [-1, 1]) {
    glow.prim('sphere:8', e * 1.5, ys + 0.9, zs - 0.65, 0.8, 1.2, 0.4, '#1b2440', { ao: 0 });
    glow.prim('sphere:8', e * 2.5, ys - 0.6, zs - 0.62, 1.2, 0.7, 0.3, '#ff9ab8', { ao: 0 });
  }
  glow.add('halftorus:12', trs(0, ys - 0.6, zs - 0.6, 5, 5, 3, 0, 0, Math.PI), '#b0461a', { ao: 0 });
  const rays = new Merger();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, L = k % 2 ? 2.4 : 3.6;
    rays.prim('octa', Math.sin(a) * (4.7 + L / 2), Math.cos(a) * (4.7 + L / 2), 0, 1.5, L * 1.6, 0.8, k % 2 ? '#ffe14d' : '#ffb627', { rz: -a, ao: 0 });
  }
  const rm = rays.build(ctx.mats.glow, { receiveShadow: false });
  rm.matrixAutoUpdate = true;
  rm.position.set(0, ys, zs + 0.2);
  B.group.add(rm);
  B.spin.push({ obj: rm, axis: 'z', speed: 0.3 });
  ctx.colliders.push({ minX: -9, maxX: 9, minY: 1e4, maxY: 1e4, camMinY: ys - 9, camMaxY: ys + 9, minZ: zs - 1, maxZ: zs + 1, tag: 'canopy' });
  const tex = drawTexture(1024, 256, (g, W, H) => {
    g.fillStyle = '#6b3f10';
    g.fillRect(0, 0, W, H);
    roundRect(g, 6, 6, W - 12, H - 12, 44);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#ffe27a');
    gr.addColorStop(1, '#f2a41f');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = '#6b3f10';
    g.stroke();
    roundRect(g, 22, 22, W - 44, H - 44, 30);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.stroke();
    chunkyText(g, 'END OF THE SEED ROAD', W / 2, 100, { size: 84, fill: '#ffffff', stroke: '#6b3f10', strokeW: 16, maxW: W - 100 });
    chunkyText(g, 'YOU MADE IT, EXPLORER!', W / 2, 190, { size: 50, fill: '#fff8d8', stroke: '#6b3f10', strokeW: 10 });
  }, { clamp: true });
  const sign = signBoard(tex, 17, 4.25, 0.5);
  sign.position.set(0, 5.2, zEnd - 0.2);
  sign.rotation.y = Math.PI;
  B.group.add(sign);
  for (const s of [-1, 1]) props.block(s * 6.5, 0, zEnd - 0.05, 0.5, 3.2, 0.3, GOLD, { ao: 0 });
  glow.box(0, 0.05, zEnd - 3, 36, 0.06, 1.2, '#ffe27a', { ao: 0 });
}
