// The Seed Road: gate arch, six themed biomes walled by cliffs (props kept out of the lane),
// biome entrance banners, distance markers and the Starbloom end cap. One group per biome for culling.
import * as THREE from 'three';
import { BIOMES, RARITY } from '../config.js';
import { Merger, makeRand, drawTexture, chunkyText, roundRect, signMaterial } from './kit.js';
import { roadTexture } from './textures.js';
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
};

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
  g.font = `900 ${size}px ${'"Fredoka", "Lilita One", "Arial Black", Arial, sans-serif'}`;
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
  const st = STYLE[b.id];
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
    const rarityText = (b.rarity === 'mythic' ? 'MYTHIC + SECRET' : rar.name.toUpperCase()) + ' SEEDS';
    const monster = b.monster ? `${b.monster.name.toUpperCase()}S AHEAD!` : 'SAFE ZONE - NO MONSTERS';
    g.font = `900 40px "Fredoka", "Lilita One", "Arial Black", Arial, sans-serif`;
    const w1 = g.measureText(rarityText).width + 48;
    const w2 = g.measureText(monster).width + 48 + (b.monster ? 50 : 0);
    const gap = 26;
    const x0 = W / 2 - (w1 + w2 + gap) / 2;
    pill(g, x0 + w1 / 2, 175, rarityText, rar.color === '#111111' ? '#222' : rar.color, '#ffffff', 40);
    const mx = x0 + w1 + gap + w2 / 2;
    if (b.monster) {
      pill(g, mx + 25, 175, monster, '#e8323c', '#ffffff', 40);
      warnTriangle(g, x0 + w1 + gap + 40, 172, 28);
    } else pill(g, mx, 175, monster, '#3fbf5a', '#ffffff', 40);
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

function markerAtlas(values) {
  const cols = 4, rows = Math.ceil(values.length / cols);
  const cw = 256, ch = 160;
  const tex = drawTexture(cols * cw, rows * ch, (g, W, H) => {
    g.fillStyle = '#1b2440';
    g.fillRect(0, 0, W, H);
    values.forEach((v, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      roundRect(g, x + 8, y + 8, cw - 16, ch - 16, 24);
      g.fillStyle = '#fdf6e3';
      g.fill();
      g.lineWidth = 10;
      g.strokeStyle = '#1b2440';
      g.stroke();
      chunkyText(g, String(v), x + cw / 2, y + 68, { size: 78, fill: '#1b2440', stroke: '#ffffff', strokeW: 6, shadow: false });
      chunkyText(g, 'STUDS', x + cw / 2, y + 126, { size: 30, fill: '#e8793a', stroke: '#ffffff', strokeW: 4, shadow: false });
    });
  }, { clamp: true });
  return { tex, cols, rows };
}

// ---------------------------------------------------------------- cliffs

function cliffs(rockM, topM, s, z0, z1, st, r, face, inset = 0) {
  const H = st.H;
  const back = face + 3.2;
  // backing mass reaching out to the horizon
  const zb = z0 + inset;
  rockM.box(s * (back + 320) / 2, (H - 10) / 2, (zb + z1) / 2, 320 - back, H + 10, z1 - zb, st.rock[0], { topFace: st.top, ao: 0.3 });
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
    const mesh = blades.build(ctx.mats.stud, { castShadow: false });
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
  // glowing cracks zig-zagging up the lower face
  for (let z = z0 + 4; z < z1; z += r.range(5, 9)) {
    let y = r.range(0.3, 1.2), zz = z;
    for (let k = 0; k < 4 && y < H * 0.22; k++) {
      const len = r.range(1.0, 1.8), a = r.range(-0.8, 0.8);
      glow.box(s * 23.74, y + Math.cos(a) * len / 2, zz + Math.sin(a) * len / 2, 0.06, len, 0.16, k % 2 ? '#ffb347' : '#ff6a1a', { rx: -a, ao: 0 });
      y += Math.cos(a) * len;
      zz += Math.sin(a) * len;
    }
  }
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

const DECOR = { field: decorateField, greenhollow: decorateGreenhollow, dustbowl: decorateDustbowl, tanglemire: decorateTanglemire, emberroot: decorateEmberroot, starbloom: decorateStarbloom };

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
    const st = STYLE[b.id];
    const r = makeRand(1000 + bi * 77);
    const group = new THREE.Group();
    group.name = 'biome-' + b.id;
    root.add(group);
    const B = {
      group, z0: R.minZ, z1: R.maxZ, st, dens,
      rockM: new Merger({ uv: 'box', uvScale: 1 / 12 }),
      topM: new Merger({ uv: 'studs', uvScale: 1 / 14 }),
      props: new Merger(),
      glow: new Merger(),
      glowLit: new Merger(),
      pools: [], lavaDiscs: [], lavaFalls: [], spin: [], bob: [],
    };
    const face = st.channel ? 23.8 : 20;
    for (const s of [-1, 1]) cliffs(B.rockM, B.topM, s, R.minZ, R.maxZ, st, r, face, bi === 0 ? 5 : 0);
    if (bi === 0) southFace(B, r);
    for (const s of [-1, 1]) DECOR[b.id](ctx, B, s, r);
    if (b.id === 'starbloom') floatingIslands(ctx, B, r);

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
    road.name = 'road-' + b.id;
    group.add(road);
    // threshold strip at the biome start
    for (let x = -19; x <= 19; x += 2) B.props.box(x, 0.06, R.minZ + 0.6, 1.8, 0.12, 1.2, x % 4 === 1 || x % 4 === -3 ? '#e8e0d0' : shadeHex(st.frame, 1), { ao: 0 });

    // channel liquid (swamp water / lava) between the curb and the cliff face
    if (st.channel) {
      const liq = st.channel === 'lava'
        ? liquidMaterial({ c1: '#b3200a', c2: '#ff6a1a', c3: '#ffe07a', scale: 0.18, flow: [0.02, 0.25], glow: 1.35 })
        : liquidMaterial({ c1: '#2a3a24', c2: '#4a5a34', c3: '#9ab86a', scale: 0.2, flow: [0.05, 0.08], glow: 1.0, bubbles: 1 });
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
      const poolMat = liquidMaterial({ c1: '#2a3a24', c2: '#4a4a5a', c3: '#9ab86a', scale: 0.15, flow: [0.04, 0.06], bubbles: 1 });
      for (const p of B.pools) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2), poolMat);
        m.position.set(p.x, p.y, p.z);
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
    add(B.rockM.build(mats.rock, { name: 'cliffs-' + b.id, castShadow: quality.shadows }));
    add(B.topM.build(st.ground === 'sand' ? mats.sand : st.ground === 'grass' ? mats.grass : mats.rockTop, { name: 'plateau-' + b.id }));
    add(B.props.build(mats.stud, { name: 'props-' + b.id, castShadow: quality.shadows }));
    add(B.glowLit.build(mats.glowLit, { name: 'glowlit-' + b.id }));
    add(B.glow.build(mats.glow, { name: 'glow-' + b.id, receiveShadow: false }));
    biomes.push({ group, minZ: R.minZ, maxZ: R.maxZ, spin: B.spin, bob: B.bob });
  });

  // distance markers (one mesh, atlas texture) on posts at the wall base
  {
    const posts = new Merger();
    const pos = [], uv = [], idx = [];
    markerPos.forEach((z, i) => {
      const cu = i % atlas.cols, cv = Math.floor(i / atlas.cols);
      const u0 = cu / atlas.cols, u1 = (cu + 1) / atlas.cols;
      const v1 = 1 - cv / atlas.rows, v0 = 1 - (cv + 1) / atlas.rows;
      for (const s of [-1, 1]) {
        const x = s * 19.55;
        posts.block(x, 0, z, 0.35, 5.2, 0.35, '#6b4424', { ao: 0.2 });
        // plaque angled towards travellers heading north
        const ang = s * 0.5;
        const w = 2.6, h = 1.62, cx = x - s * 0.1, cy = 5.9, cz = z;
        const dx = Math.cos(ang) * w / 2, dz = -Math.sin(ang) * w / 2;
        // facing -z (towards arrivals) rotated slightly towards the road centre
        const base = pos.length / 3;
        pos.push(cx + dx, cy - h / 2, cz + dz, cx - dx, cy - h / 2, cz - dz, cx - dx, cy + h / 2, cz - dz, cx + dx, cy + h / 2, cz + dz);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        posts.box(cx + Math.sin(ang) * 0.08, cy, cz + Math.cos(ang) * 0.08, w + 0.3, h + 0.3, 0.14, '#1b2440', { ry: ang, ao: 0 });
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
    root.add(posts.build(mats.stud, { name: 'marker-posts' }));
  }

  return {
    biomes,
    update(dt, t, camZ, viewDist) {
      for (const b of biomes) {
        const vis = camZ > b.minZ - viewDist && camZ < b.maxZ + viewDist;
        b.group.visible = vis;
        if (!vis) continue;
        for (const s of b.spin) s.obj.rotation[s.axis] = t * s.speed;
        for (const o of b.bob) o.obj.position.y = o.base + Math.sin(t * o.speed) * o.amp;
      }
    },
  };
}

function buildEndCap(ctx, B, zEnd, r) {
  const { props, glowLit, glow } = B;
  const cols = ['#6fd8ff', '#b36bff', '#ff7ae0', '#9ff0ff'];
  B.rockM.block(0, -1, zEnd + 5, 64, 32, 10, '#3a3f8c', { topFace: '#4a52b8', top: '#5a4ab0', ao: 0.4 });
  for (const s of [-1, 1]) {
    B.rockM.block(s * 17, 31, zEnd + 6, 14, 6, 8, '#454ba0', { topFace: '#4a52b8', ao: 0.2 });
    B.rockM.block(s * 11, 37, zEnd + 7, 6, 5, 6, '#5258b4', { topFace: '#4a52b8', ao: 0.2 });
  }
  // star gate: a glowing ring with a swirling portal
  glowLit.add('torus:28', new THREE.Matrix4().compose(new THREE.Vector3(0, 17, zEnd - 0.6), new THREE.Quaternion(), new THREE.Vector3(21, 21, 14)), '#9ff0ff', { ao: 0 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    crystal(glowLit, Math.cos(a) * 10.6, 17 + Math.sin(a) * 10.6 - 1.5, zEnd - 0.8, 3.2, 1.6, k % 2 ? '#ff9ae8' : '#d38bff', r);
  }
  const portal = new THREE.Mesh(new THREE.CircleGeometry(7.6, 36), liquidMaterial({ c1: '#1b0f4a', c2: '#6b3fd0', c3: '#ff9ae8', scale: 0.22, flow: [0.15, 0.35], glow: 1.3, vertical: true }));
  portal.position.set(0, 17, zEnd - 0.3);
  portal.rotation.y = Math.PI;
  B.group.add(portal);
  for (let i = 0; i < 26; i++) {
    const x = r.range(-22, 22);
    crystal(glowLit, x, 0, zEnd + r.range(0.5, 2.5), r.range(3, 12), r.range(1.5, 3.5), r.pick(cols), r);
  }
  for (const s of [-1, 1]) crystal(glowLit, s * 13, 0, zEnd + 2, 30, 6, s < 0 ? '#6fd8ff' : '#ff7ae0', r);
  // big glowing star
  const star = new Merger();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    star.prim('octa', Math.sin(a) * 2.8, Math.cos(a) * 2.8, 0, 2.6, 5.6, 1.2, '#fff4a0', { rz: -a, ao: 0 });
  }
  star.prim('sphere:12', 0, 0, 0, 4, 4, 1.6, '#ffffff', { ao: 0 });
  const sm = star.build(ctx.mats.glow, { receiveShadow: false });
  sm.matrixAutoUpdate = true;
  sm.position.set(0, 31, zEnd - 0.5);
  B.group.add(sm);
  B.spin.push({ obj: sm, axis: 'z', speed: 0.4 });
  const tex = drawTexture(1024, 256, (g, W, H) => {
    g.fillStyle = '#15173d';
    g.fillRect(0, 0, W, H);
    roundRect(g, 6, 6, W - 12, H - 12, 44);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#8f6bff');
    gr.addColorStop(1, '#3a2a9a');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = '#15173d';
    g.stroke();
    chunkyText(g, 'END OF THE SEED ROAD', W / 2, 100, { size: 84, fill: '#ffffff', stroke: '#15173d', strokeW: 16, maxW: W - 100 });
    chunkyText(g, 'YOU MADE IT, EXPLORER!', W / 2, 190, { size: 50, fill: '#ffe07a', stroke: '#15173d', strokeW: 10 });
  }, { clamp: true });
  const sign = signBoard(tex, 20, 5, 0.5);
  sign.position.set(0, 5.2, zEnd - 0.2);
  sign.rotation.y = Math.PI;
  B.group.add(sign);
  glow.box(0, 0.05, zEnd - 3, 36, 0.06, 1.2, '#9ff0ff', { ao: 0 });
}
