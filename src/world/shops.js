// Shops along the south edge of the plaza: Gear Shop stall, Speed Shop (a neon gym with three treadmill
// stations), Rebirth Altar.
// buildShops(ctx) -> {group, update(dt, t), speed: {setBusy(stationIndex, running)}}
import * as THREE from 'three';
import { Merger, makeRand, drawTexture, chunkyText, roundRect, mergedGeometry, uTime, signMaterial, trs } from './kit.js';
import { FxBuilder, beltSurface, beltFxMaterial, beltDriver, BELT_STRIP, lightning, heart, boltGeometry, heartGeometry } from './treadmill.js';
import { TREADMILL } from '../config.js';

function signTexture(w, h, draw) {
  return drawTexture(w, h, draw, { clamp: true });
}

function boardBg(g, W, H, c1, c2, border = '#1b2440') {
  g.fillStyle = border;
  g.fillRect(0, 0, W, H);
  roundRect(g, 6, 6, W - 12, H - 12, 40);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = border;
  g.stroke();
  roundRect(g, 22, 22, W - 44, H - 44, 28);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.stroke();
}

function bolt(g, x, y, s, fill) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(10, -40);
  g.lineTo(-18, 6);
  g.lineTo(0, 6);
  g.lineTo(-10, 40);
  g.lineTo(20, -8);
  g.lineTo(2, -8);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#1b2440';
  g.stroke();
  g.restore();
}

function signMesh(tex, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(tex, 0.3));
}

// ---------------------------------------------------------------- speed shop: themes + sign atlas

// The three stations, west to east (LAYOUT.speedStations order).
const SPEED_THEMES = [
  { id: 'boost', name: 'BOOST LAB', c1: '#a27bff', c2: '#4a5cff', main: '#7b4dff', accent: '#3fb0ff', neon: '#a98bff', neon2: '#5fd0ff', dark: '#241a52', wall: '#34246e' },
  { id: 'speed', name: 'SPEED', c1: '#ffe04a', c2: '#ff8a1a', main: '#ffc21a', accent: '#ff7a1a', neon: '#ffd23f', neon2: '#ff8a1a', dark: '#4a2e12', wall: '#6e3f16' },
  { id: 'warmup', name: 'WARM-UP', c1: '#ff7ad0', c2: '#d8309a', main: '#ff4fb8', accent: '#3ff0ff', neon: '#ff5fd0', neon2: '#3ff0ff', dark: '#44143e', wall: '#5e1f5a' },
];

// Regions [x, y, w, h] of the Speed Shop's 1024x1024 sign atlas (one draw call for every sign and screen).
const SPEED_ATLAS = {
  bill: [0, 0, 1024, 400],
  top: [[0, 400, 340, 160], [342, 400, 340, 160], [684, 400, 340, 160]],
  screen: [[0, 560, 340, 160], [342, 560, 340, 160], [684, 560, 340, 160]],
  board: [0, 720, 300, 304],
  poster: [[304, 720, 358, 304], [666, 720, 358, 304]],
};

function region(g, [x, y, w, h], draw) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  draw(g, w, h);
  g.restore();
}

function pill(g, x, y, w, h, fill, text, size) {
  roundRect(g, x - w / 2, y - h / 2, w, h, h / 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = '#1b2440';
  g.stroke();
  chunkyText(g, text, x, y + 3, { size, fill: '#ffffff', stroke: '#1b2440', strokeW: 9, maxW: w - 30 });
}

function stationIcon(g, id, x, y, s, fill = '#ffffff') {
  if (id === 'boost') lightning(g, x, y, 0.95 * s, fill, '#1b2440');
  else if (id === 'speed') bolt(g, x, y, 0.9 * s, fill);
  else heart(g, x, y + 6 * s, 1.75 * s, fill, '#1b2440');
}

function screenBg(g, W, H, glowCol) {
  g.fillStyle = '#1b2440';
  g.fillRect(0, 0, W, H);
  roundRect(g, 8, 8, W - 16, H - 16, 22);
  const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6);
  gr.addColorStop(0, '#1d2a5c');
  gr.addColorStop(1, '#0a0f26');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = glowCol;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 14; y < H - 14; y += 6) g.fillRect(14, y, W - 28, 2);
}

function paintSpeedAtlas(g) {
  g.fillStyle = '#1b2440';
  g.fillRect(0, 0, 1024, 1024);
  // the big billboard: SPEED SHOP + the three stations
  region(g, SPEED_ATLAS.bill, (g, W, H) => {
    boardBg(g, W, H, '#ffd84a', '#ff8a1a');
    g.save();
    g.globalAlpha = 0.18;
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      g.moveTo(-80 + k * 170, H);
      g.lineTo(-20 + k * 170, H);
      g.lineTo(100 + k * 170, 0);
      g.lineTo(40 + k * 170, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
    chunkyText(g, 'SPEED SHOP', W / 2, 142, { size: 150, fill: '#ffffff', stroke: '#1b2440', strokeW: 22, maxW: W - 260 });
    SPEED_THEMES.forEach((t, i) => pill(g, W / 2 + (i - 1) * 262, 296, 236, 84, t.c2, t.name, 50));
    bolt(g, 90, 200, 2.3, '#ffffff');
    bolt(g, W - 90, 200, 2.3, '#ffffff');
  });
  // station toppers
  SPEED_THEMES.forEach((t, i) => region(g, SPEED_ATLAS.top[i], (g, W, H) => {
    boardBg(g, W, H, t.c1, t.c2);
    stationIcon(g, t.id, 58, H / 2 + 2, 1.05);
    chunkyText(g, t.name, W / 2 + 34, H / 2 + 4, { size: 64, fill: '#ffffff', stroke: '#1b2440', strokeW: 13, maxW: W - 130 });
  }));
  // console screens
  region(g, SPEED_ATLAS.screen[0], (g, W, H) => {
    const t = SPEED_THEMES[0];
    screenBg(g, W, H, t.neon2);
    lightning(g, 62, H / 2, 1.3, t.neon2, '#ffffff');
    chunkyText(g, 'BOOST', 208, 62, { size: 58, fill: t.neon, stroke: '#ffffff', strokeW: 5, shadow: false, maxW: 220 });
    chunkyText(g, 'SPEED BURST!', 208, 116, { size: 30, fill: '#ffffff', stroke: t.c2, strokeW: 5, shadow: false, maxW: 220 });
  });
  region(g, SPEED_ATLAS.screen[1], (g, W, H) => {
    const t = SPEED_THEMES[1];
    screenBg(g, W, H, t.neon);
    // speedometer
    const cx = 80, cy = 108, r = 58;
    const cols = ['#4cd964', '#ffd23f', '#ff8a1a', '#ff4d6d'];
    g.lineWidth = 16;
    cols.forEach((c, k) => {
      g.beginPath();
      g.arc(cx, cy, r, Math.PI + (k * Math.PI) / 4 + 0.04, Math.PI + ((k + 1) * Math.PI) / 4 - 0.04);
      g.strokeStyle = c;
      g.stroke();
    });
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(-0.55) * (r - 8), cy + Math.sin(-0.55) * (r - 8));
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.fill();
    chunkyText(g, 'SPEED', 232, 62, { size: 58, fill: t.neon, stroke: '#ffffff', strokeW: 5, shadow: false, maxW: 190 });
    chunkyText(g, 'LEVEL UP!', 232, 116, { size: 32, fill: '#ffffff', stroke: t.c2, strokeW: 5, shadow: false, maxW: 190 });
  });
  region(g, SPEED_ATLAS.screen[2], (g, W, H) => {
    const t = SPEED_THEMES[2];
    screenBg(g, W, H, t.neon2);
    heart(g, 70, H / 2 + 12, 2.1, t.neon, '#ffffff');
    // heartbeat line
    g.strokeStyle = t.neon2;
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(130, 120);
    for (const [x, y] of [[160, 120], [172, 98], [186, 136], [198, 110], [212, 120], [320, 120]]) g.lineTo(x, y);
    g.stroke();
    chunkyText(g, 'KEEP', 232, 42, { size: 40, fill: '#ffffff', stroke: t.c2, strokeW: 5, shadow: false, maxW: 190 });
    chunkyText(g, 'RUNNING!', 232, 84, { size: 42, fill: t.neon2, stroke: '#ffffff', strokeW: 4, shadow: false, maxW: 190 });
  });
  // leaderboard of treadmill tiers
  region(g, SPEED_ATLAS.board, (g, W, H) => {
    g.fillStyle = '#1b2440';
    g.fillRect(0, 0, W, H);
    roundRect(g, 8, 8, W - 16, H - 16, 20);
    g.fillStyle = '#10183a';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#ffd23f';
    g.stroke();
    chunkyText(g, 'TREADMILLS', W / 2, 44, { size: 40, gradient: ['#fff6c8', '#ffc93c'], stroke: '#1b2440', strokeW: 8, maxW: W - 40 });
    const tiers = TREADMILL.tiers.slice().reverse();
    tiers.forEach((t, k) => {
      const y = 94 + k * 44;
      roundRect(g, 18, y - 19, W - 36, 38, 12);
      g.fillStyle = k % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)';
      g.fill();
      g.fillStyle = t.color;
      g.beginPath();
      g.arc(40, y, 15, 0, Math.PI * 2);
      g.fill();
      chunkyText(g, String(k + 1), 40, y + 2, { size: 22, fill: '#1b2440', stroke: '#ffffff', strokeW: 0, shadow: false });
      chunkyText(g, t.name.replace(' Treadmill', '').toUpperCase(), 64, y + 2, { size: 26, fill: t.color, stroke: '#1b2440', strokeW: 5, align: 'left', shadow: false, maxW: 140 });
      chunkyText(g, `+${Math.round(t.bonus * 100)}%`, W - 28, y + 2, { size: 26, fill: '#ffffff', stroke: '#1b2440', strokeW: 5, align: 'right', shadow: false });
    });
  });
  // posters
  region(g, SPEED_ATLAS.poster[0], (g, W, H) => {
    boardBg(g, W, H, '#5fd0ff', '#3a6bff');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let k = 0; k < 4; k++) g.fillRect(40, 70 + k * 30, 70 - k * 12, 10);
    star(g, 250, 96, 52, '#ffe45a');
    chunkyText(g, 'GO FAST!', W / 2, 222, { size: 68, fill: '#ffffff', stroke: '#1b2440', strokeW: 13, maxW: W - 60 });
  });
  region(g, SPEED_ATLAS.poster[1], (g, W, H) => {
    boardBg(g, W, H, '#ff9ad6', '#ff4f9a');
    heart(g, W / 2, 112, 3.0, '#ffffff', '#1b2440');
    star(g, 70, 70, 22, '#ffe45a');
    star(g, W - 70, 88, 18, '#ffe45a');
    chunkyText(g, 'HAVE FUN!', W / 2, 222, { size: 68, fill: '#ffffff', stroke: '#1b2440', strokeW: 13, maxW: W - 60 });
  });
}

function star(g, cx, cy, r, fill) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#1b2440';
  g.stroke();
}

/** Quads textured from a region of a square atlas: add(matrix, w, h, [x, y, w, h]) then build(). */
function atlasQuads(size) {
  const pos = [], nor = [], uv = [], idx = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  return {
    add(matrix, w, h, [rx, ry, rw, rh]) {
      nm.getNormalMatrix(matrix);
      n.set(0, 0, 1).applyMatrix3(nm).normalize();
      const u0 = (rx + 1) / size, u1 = (rx + rw - 1) / size, v1 = 1 - (ry + 1) / size, v0 = 1 - (ry + rh - 1) / size;
      const b = pos.length / 3;
      for (const [x, y, u, vv] of [[-w / 2, -h / 2, u0, v0], [w / 2, -h / 2, u1, v0], [w / 2, h / 2, u1, v1], [-w / 2, h / 2, u0, v1]]) {
        v.set(x, y, 0).applyMatrix4(matrix);
        pos.push(v.x, v.y, v.z);
        nor.push(n.x, n.y, n.z);
        uv.push(u, vv);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
  };
}

/** A flat V painted on the floor, pointing -Z. */
function floorChevron(m, x, z, s, color, y = 0.15) {
  const len = Math.hypot(s, s * 0.8);
  for (const k of [-1, 1]) m.box(x + (k * s) / 2, y, z + s * 0.4, len + 0.3, 0.04, 0.42, color, { ry: Math.atan2(-0.8 * s, k * s), ao: 0 });
}

function dumbbell(m, x, y, z, len, r, color) {
  m.beam(x - len / 2, y, z, x + len / 2, y, z, 0.16, '#c9ced6', { prim: 'cyl:8', ao: 0 });
  for (const s of [-1, 1]) m.beam(x + s * (len / 2 - 0.02), y, z, x + s * (len / 2 - 0.34), y, z, r * 2, color, { prim: 'cyl:6', ao: 0.1 });
}

// ---------------------------------------------------------------- gear items (each its own spinning mesh)

function itemGeometries() {
  const banana = mergedGeometry((m) => {
    const pts = [[-0.9, 0.9], [-0.55, 0.35], [0, 0.1], [0.55, 0.35], [0.9, 0.9]];
    for (let i = 0; i < pts.length - 1; i++) m.beam(pts[i][0], pts[i][1], 0, pts[i + 1][0], pts[i + 1][1], 0, 0.55 - Math.abs(i - 1.5) * 0.08, '#ffd93a', { prim: 'cyl:8', ao: 0.1 });
    m.beam(-0.9, 0.9, 0, -1.0, 1.15, 0, 0.18, '#6b4a2a', { prim: 'cyl:6' });
    m.prim('sphere:6', 0.92, 0.92, 0, 0.3, 0.3, 0.3, '#5a3a1a');
  });
  const balloon = mergedGeometry((m) => {
    m.prim('sphere:14', 0, 0.9, 0, 1.5, 1.7, 1.5, '#3fb6ff', { ao: 0.2 });
    m.prim('sphere:8', -0.35, 1.25, 0.55, 0.35, 0.45, 0.2, '#d8f3ff', { ao: 0 });
    m.prim('cone:6', 0, 0.02, 0, 0.36, 0.3, 0.36, '#1f7fd0', { rx: Math.PI });
  });
  const coil = mergedGeometry((m) => {
    for (let i = 0; i < 6; i++) m.add('torus:14', new THREE.Matrix4().compose(new THREE.Vector3(0, 0.3 + i * 0.28, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.12, 0, 0)), new THREE.Vector3(1.6, 1.6, 1.6)), i % 2 ? '#62e36b' : '#3fcf5a', { ao: 0 });
    m.cyl(0, 0, 0, 0.75, 0.2, '#2e3440', { seg: 12 });
    m.cyl(0, 1.95, 0, 0.75, 0.2, '#2e3440', { seg: 12 });
  });
  const cloak = mergedGeometry((m) => {
    m.prim('cone:10', 0, 1.0, 0, 1.9, 2.0, 1.9, '#7a3fe0', { ao: 0.25 });
    m.prim('sphere:10', 0, 2.05, 0, 1.0, 1.0, 1.0, '#8f55f0', { ao: 0.15 });
    m.prim('sphere:8', 0, 1.95, 0.32, 0.7, 0.75, 0.5, '#1b1030', { ao: 0 });
    m.prim('sphere:6', 0, 1.45, 0.52, 0.3, 0.3, 0.2, '#ffd23f', { ao: 0 });
  });
  const bucket = mergedGeometry((m) => {
    m.prim('frustum:12', 0, 0.75, 0, 1.6, 1.5, 1.6, '#8fb3d9', { rx: Math.PI, ao: 0.25 });
    m.cyl(0, 1.42, 0, 0.78, 0.1, '#3fb6ff', { seg: 12, ao: 0 });
    m.add('halftorus:10', new THREE.Matrix4().compose(new THREE.Vector3(0, 1.5, 0), new THREE.Quaternion(), new THREE.Vector3(2.0, 2.0, 1.2)), '#5a6878', { ao: 0 });
  });
  return [banana, balloon, coil, cloak, bucket];
}

export function buildShops(ctx) {
  const { root, layout, mats, quality } = ctx;
  const r = makeRand(31337);
  const group = new THREE.Group();
  group.name = 'shops';
  root.add(group);
  const m = new Merger({ uv: 'studs', uvScale: 0.125 });
  const glow = ctx.glow;
  const solid = (minX, maxX, minZ, maxZ, maxY, tag = 'shop') => ctx.colliders.push({ minX, maxX, minY: 0, maxY, minZ, maxZ, tag });
  const spinners = [];

  // ================================================================ GEAR SHOP
  {
    const S = layout.shops.gear;
    const x0 = S.x - 6, x1 = S.x + 6; // -36..-24
    const zf = -57, zb = -60;
    // counter
    m.block(S.x, 0, (zf + zb) / 2, 12, 3.6, 3, '#8a5a34', { ao: 0.35 });
    for (let i = 0; i < 10; i++) m.box(x0 + 0.6 + i * 1.2, 1.8, zf + 0.05, 1.05, 3.2, 0.12, i % 2 ? '#1ec8c8' : '#ffffff', { ao: 0.25 });
    m.block(S.x, 3.6, (zf + zb) / 2 + 0.15, 12.6, 0.4, 3.5, '#e8793a', { ao: 0 });
    // posts, back wall with shelves
    const zB = -64;
    for (const px of [x0 + 0.4, x1 - 0.4]) {
      m.block(px, 4, zf - 0.2, 0.6, 5.6, 0.6, '#6b4424');
      m.block(px, 0, zB, 0.7, 10.2, 0.7, '#6b4424');
    }
    m.block(S.x, 0, zB - 0.3, 12, 8.5, 0.6, '#c08a4a', { ao: 0.3 });
    for (const y of [2.6, 5.2]) m.block(S.x, y, zB + 0.4, 11.2, 0.25, 1.2, '#8a5a34', { ao: 0 });
    // shelf goods: balloons, bananas, coils in rows
    for (let i = 0; i < 9; i++) {
      const x = x0 + 1.4 + i * 1.15;
      const kind = i % 3;
      if (kind === 0) m.prim('sphere:8', x, 3.35, zB + 0.4, 0.8, 0.9, 0.8, r.pick(['#3fb6ff', '#ff5a8a', '#7ee36b']));
      else if (kind === 1) m.beam(x - 0.3, 3.0, zB + 0.4, x + 0.3, 3.5, zB + 0.4, 0.3, '#ffd93a', { prim: 'cyl:6' });
      else m.cyl(x, 2.75, zB + 0.4, 0.35, 0.8, '#3fcf5a', { seg: 8 });
      m.prim('frustum:8', x, 5.85, zB + 0.4, 0.8, 0.9, 0.8, '#8fb3d9', { rx: Math.PI });
    }
    solid(x0, x1, zB - 0.7, zB + 0.5, 10);
    // striped awning (sloped)
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x = x0 - 0.5 + (i + 0.5) * (13 / n);
      m.box(x, 9.35, (zf + zB) / 2 + 1.2, 13 / n, 0.3, 11.4, i % 2 ? '#ffffff' : '#ff4f7a', { rx: -0.2, ao: 0 });
      // scalloped valance
      m.prim('sphere:8', x, 8.1, zf + 2.95, 13 / n, 1.0, 0.25, i % 2 ? '#ffffff' : '#ff4f7a', { ao: 0 });
    }
    m.box(S.x, 8.4, zf + 2.95, 13, 0.4, 0.3, '#ff4f7a', { ao: 0 });
    // item stands on the counter
    const geos = itemGeometries();
    const itemMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x181818 });
    geos.forEach((geo, i) => {
      const x = x0 + 1.6 + i * 2.2;
      m.cyl(x, 4.0, -58.4, 0.9, 0.25, '#ffffff', { seg: 14, ao: 0 });
      m.cyl(x, 4.0, -58.4, 0.95, 0.12, '#1ec8c8', { seg: 14, ao: 0 });
      const mesh = new THREE.Mesh(geo, itemMat);
      mesh.position.set(x, 4.3, -58.4);
      mesh.scale.setScalar(0.95);
      mesh.castShadow = quality.shadows;
      group.add(mesh);
      spinners.push({ mesh, y: 4.3, phase: i });
    });
    // sign
    const tex = signTexture(1024, 256, (g, W, H) => {
      boardBg(g, W, H, '#2fd0d0', '#1791b8');
      chunkyText(g, 'GEAR SHOP', W / 2, H / 2 + 6, { size: 140, fill: '#ffffff', stroke: '#1b2440', strokeW: 22, maxW: W - 120 });
    });
    const sign = signMesh(tex, 11, 2.75);
    sign.position.set(S.x, 12.3, zf + 1.7);
    const back = sign.clone();
    back.position.z -= 0.14;
    back.rotation.set(0, Math.PI, 0);
    m.box(S.x, 12.3, zf + 1.63, 11.1, 2.8, 0.1, '#1b2440', { ao: 0 });
    group.add(sign, back);
    m.block(S.x - 4, 9.4, zf + 1.63, 0.3, 1.6, 0.3, '#6b4424');
    m.block(S.x + 4, 9.4, zf + 1.63, 0.3, 1.6, 0.3, '#6b4424');
  }

  // ================================================================ SPEED SHOP
  // A neon gym: three treadmill stations (west to east, LAYOUT.speedStations) BOOST LAB, SPEED and WARM-UP under the
  // big billboard. The belts scroll north (you run south, towards the consoles); speed.setBusy(i, on) makes one run
  // at full belt speed and glow. Two draw calls of its own: the signs (one atlas) and the belts + station neon.
  const speedDrivers = [];
  let speedFxMat;
  {
    const S = layout.shops.speed;
    const ST = layout.speedStations || [-1, 0, 1].map((i) => ({ x: S.x + i * 7, z: -56.4, len: 6.4, w: 2.9 }));
    const zFront = -53.2, zBack = -60.2; // deck (belt runs from zBack + 0.6 to zFront)
    const zWall = -63.6;
    const fx = new FxBuilder();
    const signs = atlasQuads(1024);
    const tilt = (y0, z0, a, dy, dz) => [y0 + dy * Math.cos(a) - dz * Math.sin(a), z0 + dy * Math.sin(a) + dz * Math.cos(a)];

    // rubber gym mat with a start apron in front of the belts
    m.box(S.x, 0.09, -57.1, 23.6, 0.1, 13.4, '#3a4252', { ao: 0 });
    m.box(S.x, 0.1, -50.55, 23.6, 0.12, 0.3, '#1b2440', { ao: 0 });
    for (const sx of [-1, 1]) m.box(S.x + sx * 11.65, 0.1, -57.1, 0.3, 0.12, 13.4, '#1b2440', { ao: 0 });

    ST.forEach((st, i) => {
      const T = SPEED_THEMES[i];
      const x = st.x;
      const neon = fx.merger(i, 1);
      // ---- deck, foot rails, roller caps, the moving belt
      m.block(x, 0, (zBack + zFront - 0.15) / 2, 3.6, 0.5, zFront - 0.15 - zBack, '#2c3440', { ao: 0.25 });
      for (const s of [-1, 1]) {
        m.block(x + s * 1.63, 0.46, (zBack + zFront) / 2, 0.34, 0.22, zFront - zBack, T.main, { ao: 0 });
        m.prim('cyl:12', x + s * 1.63, 0.3, zFront - 0.26, 0.6, 0.36, 0.6, '#e9edf3', { rz: Math.PI / 2, ao: 0 });
        neon.box(x + s * 1.815, 0.24, (zBack + zFront) / 2, 0.04, 0.1, zFront - zBack - 0.2, T.neon, { ao: 0 });
      }
      fx.geometry(beltSurface({ len: st.len, w: st.w, strip: BELT_STRIP[T.id], matrix: trs(x, 0, st.z, 1, 1, 1, 0, Math.PI, 0) }), i, 0);
      // start apron: chevrons pointing onto the belt
      floorChevron(m, x, -52.75, 1.0, T.main);
      floorChevron(m, x, -51.55, 1.0, T.accent);
      // ---- console tower: motor hood, body, tilted screen head
      m.block(x, 0, -60.4, 3.6, 1.05, 1.2, T.dark, { ao: 0.3 });
      m.box(x, 1.06, -60.4, 3.2, 0.05, 1.0, T.main, { ao: 0 });
      m.block(x, 1.0, -60.62, 2.3, 2.6, 0.76, '#2c3440', { ao: 0.2 });
      for (const s of [-1, 1]) m.block(x + s * 1.3, 1.0, -60.62, 0.34, 2.6, 0.84, T.main, { ao: 0.1 });
      const hy = 4.0, hz = -60.4, hrx = -0.42;
      m.box(x, hy, hz, 3.5, 1.62, 0.7, '#2c3440', { rx: hrx, ao: 0.1 });
      {
        const [by, bz] = tilt(hy, hz, hrx, 0, 0.36);
        neon.box(x, by, bz, 3.32, 1.46, 0.03, T.neon2, { rx: hrx, ao: 0 });
        const [sy, sz] = tilt(hy, hz, hrx, 0, 0.385);
        signs.add(trs(x, sy, sz, 1, 1, 1, hrx, 0, 0), 3.06, 1.44, SPEED_ATLAS.screen[i]);
      }
      // uprights and low side rails (below the arms of a running avatar)
      for (const s of [-1, 1]) {
        m.beam(x + s * 1.66, 0.5, -59.85, x + s * 1.55, 3.5, -60.15, 0.28, '#c9ced6', { ao: 0.1 });
        m.beam(x + s * 1.7, 2.0, -59.95, x + s * 1.7, 2.0, -57.3, 0.2, '#c9ced6', { prim: 'cyl:8', ao: 0 });
        m.beam(x + s * 1.7, 2.0, -58.1, x + s * 1.7, 2.0, -57.15, 0.3, T.main, { prim: 'cyl:8', ao: 0 });
        m.beam(x + s * 1.7, 0.6, -57.35, x + s * 1.7, 2.0, -57.35, 0.14, '#c9ced6', { prim: 'cyl:8', ao: 0 });
      }
      // ---- station sign on two posts above the console
      for (const s of [-1, 1]) m.block(x + s * 1.72, 1.05, -61.0, 0.24, 6.4, 0.24, '#2c3440', { ao: 0.1 });
      m.box(x, 6.3, -61.0, 4.5, 2.24, 0.2, T.dark, { ao: 0 });
      neon.box(x, 6.3, -61.07, 4.74, 2.48, 0.08, T.neon, { ao: 0 });
      signs.add(trs(x, 6.3, -60.885), 4.25, 2.0, SPEED_ATLAS.top[i]);
      // ---- a themed prop on top of the sign
      if (T.id === 'boost') {
        // tesla orbs and a little bolt
        for (const s of [-1, 1]) {
          m.cyl(x + s * 1.9, 7.42, -61.0, 0.1, 0.6, '#c9ced6', { seg: 6, ao: 0 });
          m.cyl(x + s * 1.9, 7.42, -61.0, 0.22, 0.12, '#2c3440', { seg: 8, ao: 0 });
          neon.prim('sphere:10', x + s * 1.9, 8.2, -61.0, 0.62, 0.62, 0.62, T.neon2, { ao: 0 });
        }
        neon.add(boltGeometry(0.24), trs(x, 7.95, -61.0, 0.75, 0.75, 1), T.neon2, { ao: 0 });
      } else if (T.id === 'speed') {
        neon.add(boltGeometry(0.3), trs(x, 8.05, -61.0, 1.05, 1.05, 1, 0, 0, -0.12), T.neon, { ao: 0 });
      } else {
        neon.add(heartGeometry(0.3), trs(x, 8.05, -61.0, 0.95, 0.95, 1), T.neon, { ao: 0 });
      }
      // ---- the wall panel behind the station with slanted speed stripes
      m.box(x, 4.0, zWall + 0.32, 6.6, 7.6, 0.06, T.wall, { ao: 0 });
      for (let k = 0; k < 3; k++) glow.box(x - 2.2 + k * 0.55, 2.2 + k * 0.1, zWall + 0.36, 0.22, 3.2 - k * 0.5, 0.04, [T.neon, T.neon2, '#ffffff'][k], { rz: -0.5, ao: 0 });
      for (let k = 0; k < 3; k++) glow.box(x + 2.2 - k * 0.55, 2.2 + k * 0.1, zWall + 0.36, 0.22, 3.2 - k * 0.5, 0.04, [T.neon, T.neon2, '#ffffff'][k], { rz: 0.5, ao: 0 });
      glow.box(x, 0.16, -50.55, 6.8, 0.05, 0.12, T.neon, { ao: 0 });
      // physics: the deck you step onto from the north, the console + sign behind it
      solid(x - 1.8, x + 1.8, zBack, zFront, 0.55, 'deco');
      solid(x - 1.8, x + 1.8, zBack - 0.8, zBack + 0.5, 7.4);
    });

    // ---- back wall + big billboard
    for (const px of [-8.5, 8.5]) {
      m.block(S.x + px, 0, zWall, 0.8, 14.7, 0.8, '#2c3440');
      m.block(S.x + px, 14.7, zWall, 1.0, 0.25, 1.0, '#ffcf33', { ao: 0 });
      solid(S.x + px - 0.5, S.x + px + 0.5, -64, -63, 14.7);
    }
    m.block(S.x, 0, zWall, 16.2, 7.9, 0.6, '#1b2440', { ao: 0.2 });
    m.block(S.x, 7.8, zWall, 16.8, 6.9, 0.4, '#1b2440', { ao: 0 });
    solid(S.x - 8.1, S.x + 8.1, -64, -63.2, 7.9);
    signs.add(trs(S.x, 11.2, zWall + 0.21), 16, 6.25, SPEED_ATLAS.bill);
    signs.add(trs(S.x, 11.2, zWall - 0.21, 1, 1, 1, 0, Math.PI, 0), 16, 6.25, SPEED_ATLAS.bill);
    for (const [y, h] of [[14.42, 0.16], [7.98, 0.16]]) glow.box(S.x, y, zWall + 0.24, 16.3, h, 0.06, '#fff1a8', { ao: 0 });
    // posters between the stations
    for (const [k, px] of [[0, -3.5], [1, 3.5]]) {
      m.box(S.x + px, 4.4, zWall + 0.36, 2.5, 2.15, 0.06, '#1b2440', { ao: 0 });
      signs.add(trs(S.x + px, 4.4, zWall + 0.4), 2.35, 2.0, SPEED_ATLAS.poster[k]);
    }

    // ---- west: water cooler, a giant dumbbell, the dumbbell rack
    const wx = S.x - 10.4;
    m.block(wx, 0.14, -54.9, 1.2, 2.2, 1.1, '#eef2f7', { ao: 0.3 });
    m.box(wx, 1.62, -54.34, 0.84, 0.56, 0.04, '#c9d4e0', { ao: 0 });
    m.box(wx - 0.2, 1.7, -54.3, 0.16, 0.16, 0.14, '#3fa0ff', { ao: 0 });
    m.box(wx + 0.2, 1.7, -54.3, 0.16, 0.16, 0.14, '#ff4f5a', { ao: 0 });
    m.box(wx, 1.4, -54.3, 0.6, 0.06, 0.2, '#9aa3b2', { ao: 0 });
    m.cyl(wx, 2.34, -54.9, 0.2, 0.2, '#dfe6ee', { seg: 8 });
    m.cyl(wx, 2.52, -54.9, 0.54, 1.15, '#6cc8ff', { seg: 14, ao: 0.15, top: '#b8ecff' });
    m.prim('hemi:14', wx, 3.66, -54.9, 1.08, 0.5, 1.08, '#b8ecff', { ao: 0 });
    glow.box(wx - 0.22, 3.1, -54.37, 0.1, 0.8, 0.04, '#eafaff', { ao: 0 });
    m.cyl(wx + 0.76, 1.3, -54.9, 0.16, 0.95, '#ffffff', { seg: 8, ao: 0 });
    solid(wx - 0.7, wx + 0.9, -55.5, -54.3, 3.9, 'deco');
    m.beam(wx, 0.72, -58.9, wx, 0.72, -56.3, 0.3, '#c9ced6', { prim: 'cyl:10', ao: 0 });
    for (const z of [-58.55, -56.65]) {
      m.beam(wx, 0.72, z - 0.26, wx, 0.72, z + 0.26, 1.44, '#ff4f7a', { prim: 'cyl:14', ao: 0.1 });
      m.beam(wx, 0.72, z - 0.29, wx, 0.72, z + 0.29, 1.0, '#ffffff', { prim: 'cyl:14', ao: 0 });
    }
    solid(wx - 0.75, wx + 0.75, -59.0, -56.2, 1.45, 'deco');
    for (const s of [-1, 1]) m.block(wx + s * 1.05, 0.14, -60.9, 0.18, 2.2, 1.1, '#2c3440', { ao: 0.2 });
    for (const [y, z] of [[0.9, -60.6], [1.8, -61.05]]) {
      m.box(wx, y, z, 2.2, 0.12, 0.7, '#5a6270', { ao: 0 });
      dumbbell(m, wx - 0.5, y + 0.3, z, 0.9, 0.24, y < 1 ? '#3fa0ff' : '#ffcf33');
      dumbbell(m, wx + 0.5, y + 0.3, z, 0.9, 0.24, y < 1 ? '#ff4f7a' : '#4cd964');
    }
    solid(wx - 1.2, wx + 1.2, -61.5, -60.2, 2.4, 'deco');

    // ---- east: tier leaderboard, exercise ball, kettlebells
    const ex = S.x + 10.6;
    for (const s of [-1, 1]) m.block(ex + s * 1.15, 0.14, -61.4, 0.26, 6.1, 0.26, '#2c3440');
    m.box(ex, 4.6, -61.45, 2.66, 2.72, 0.24, '#1b2440', { ao: 0 });
    glow.box(ex, 4.6, -61.58, 2.76, 2.84, 0.04, '#ffd23f', { ao: 0 });
    glow.box(ex, 6.2, -61.4, 1.8, 0.2, 0.2, '#ffd23f', { ao: 0 });
    signs.add(trs(ex, 4.6, -61.32), 2.5, 2.53, SPEED_ATLAS.board);
    solid(ex - 1.35, ex + 1.35, -61.6, -61.2, 6.3);
    m.prim('sphere:16', ex - 0.4, 1.0, -58.2, 1.7, 1.7, 1.7, '#ff5fb0', { top: '#ffa6d6', ao: 0.25 });
    solid(ex - 1.2, ex + 0.4, -59.0, -57.4, 1.8, 'deco');
    for (const [kx, kz, c] of [[0.4, -55.3, '#ff8a1a'], [-0.6, -54.6, '#7b4dff']]) {
      m.prim('sphere:12', ex + kx, 0.5, kz, 0.9, 0.78, 0.9, c, { ao: 0.2 });
      m.add('halftorus:10', trs(ex + kx, 0.8, kz, 0.72, 0.95, 1.3), c, { ao: 0.1 });
      solid(ex + kx - 0.45, ex + kx + 0.45, kz - 0.45, kz + 0.45, 1.3, 'deco');
    }

    // ---- the two meshes of the shop's own
    const speedSigns = new THREE.Mesh(signs.build(), signMaterial(drawTexture(1024, 1024, paintSpeedAtlas, { clamp: true }), 0.35));
    speedSigns.name = 'speed-signs';
    group.add(speedSigns);
    speedFxMat = beltFxMaterial(ST.length);
    const fxMesh = new THREE.Mesh(fx.buildGeometry(), speedFxMat);
    fxMesh.name = 'speed-belts';
    fxMesh.receiveShadow = true;
    group.add(fxMesh);
    ST.forEach((st, i) => speedDrivers.push(beltDriver(speedFxMat, i)));
  }

  // ================================================================ REBIRTH ALTAR
  let crown, halo, beam, sparks;
  {
    const S = layout.shops.rebirth;
    const zf = -57, zb = -60, zc = (zf + zb) / 2;
    const marble = '#f4f0ff', gold = '#ffc93c', purple = '#7a3fe0';
    m.block(S.x, 0, zc, 12, 4, 3, marble, { ao: 0.3 });
    m.block(S.x, 0, zc, 12.4, 0.5, 3.4, gold, { ao: 0 });
    m.block(S.x, 3.6, zc, 12.4, 0.4, 3.4, gold, { ao: 0 });
    for (let i = -2; i <= 2; i++) {
      m.box(S.x + i * 2.3, 2.05, zf + 0.04, 1.6, 2.4, 0.1, purple, { ao: 0 });
      glow.prim('octa', S.x + i * 2.3, 2.05, zf + 0.12, 0.8, 1.3, 0.1, '#e0b8ff', { ao: 0 });
    }
    // pedestal + pillars on top
    m.cyl(S.x, 4, zc, 1.3, 0.6, gold, { seg: 14, ao: 0 });
    m.cyl(S.x, 4.6, zc, 0.9, 2.6, marble, { seg: 12 });
    m.cyl(S.x, 7.2, zc, 1.35, 0.45, gold, { seg: 14, ao: 0 });
    ctx.colliders.push({ minX: S.x - 1.4, maxX: S.x + 1.4, minY: 0, maxY: 7.7, minZ: zc - 1.4, maxZ: zc + 1.4, tag: 'shop' });
    for (const px of [S.x - 5.4, S.x + 5.4]) {
      m.cyl(px, 4, zc, 0.8, 7.2, marble, { seg: 10 });
      m.cyl(px, 4, zc, 1.0, 0.5, gold, { seg: 10, ao: 0 });
      m.cyl(px, 10.9, zc, 1.05, 0.5, gold, { seg: 10, ao: 0 });
      glow.prim('sphere:10', px, 11.9, zc, 1.3, 1.3, 1.3, '#d9a8ff', { ao: 0 });
      ctx.colliders.push({ minX: px - 0.9, maxX: px + 0.9, minY: 0, maxY: 11.5, minZ: zc - 0.9, maxZ: zc + 0.9, tag: 'shop' });
    }
    // floor star in front
    m.box(S.x, 0.1, -52.5, 9, 0.1, 6.5, '#e8dcff', { ao: 0 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      m.prim('octa', S.x + Math.cos(a) * 1.4, 0.16, -52.5 + Math.sin(a) * 1.4, 1.0, 0.06, 2.4, k % 2 ? gold : purple, { ry: -a + Math.PI / 2, ao: 0 });
    }
    // floating crown
    const crownGeo = mergedGeometry((c) => {
      c.cyl(0, 0, 0, 1.25, 0.9, gold, { seg: 16, ao: 0.1 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        c.prim('cone:6', Math.cos(a) * 1.1, 1.25, Math.sin(a) * 1.1, 0.7, 1.0, 0.7, gold, { ao: 0 });
        c.prim('sphere:6', Math.cos(a) * 1.1, 1.85, Math.sin(a) * 1.1, 0.35, 0.35, 0.35, '#ffffff', { ao: 0 });
        c.prim('octa', Math.cos(a + 0.52) * 1.26, 0.45, Math.sin(a + 0.52) * 1.26, 0.45, 0.55, 0.45, ['#ff3a5a', '#3a8bff', '#3fdc6a'][k % 3], { ao: 0 });
      }
      c.cyl(0, -0.05, 0, 1.32, 0.22, '#ffe08a', { seg: 16, ao: 0 });
    });
    crown = new THREE.Mesh(crownGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a3a00 }));
    crown.position.set(S.x, 9.2, zc);
    crown.castShadow = quality.shadows;
    group.add(crown);
    halo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xd8a8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.copy(crown.position);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.0, 14, 16, 1, true).translate(0, 7, 0), new THREE.ShaderMaterial({
      uniforms: { uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.45 * sin(vUv.x * 37.7 + uTime * 3.0 + vUv.y * 8.0));
          gl_FragColor = vec4(vec3(0.8, 0.55, 1.0) * a * 0.55, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    beam.position.set(S.x, 7.6, zc);
    group.add(beam);
    // orbiting sparkles
    const N = 40;
    const sp = new Float32Array(N * 3);
    const rr = makeRand(3);
    for (let i = 0; i < N; i++) sp.set([rr(), rr(), rr()], i * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { uTime },
      vertexShader: `uniform float uTime; varying float vA;
        void main(){ float a = position.x * 6.2831 + uTime * (0.6 + position.z); float h = fract(position.y + uTime * 0.18);
          vec3 p = vec3(cos(a) * (1.6 + position.z * 1.2), h * 9.0 - 1.0, sin(a) * (1.6 + position.z * 1.2));
          vA = sin(h * 3.14159);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(260.0 / -mv.z, 24.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vec3(1.0, 0.85, 1.0) * a, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sparks.position.set(S.x, 5, zc);
    sparks.frustumCulled = false;
    group.add(sparks);
    // REBIRTH sign arch between the pillars
    const tex = signTexture(1024, 256, (g, W, H) => {
      boardBg(g, W, H, '#a86bff', '#5a2ec0', '#1b0f3a');
      chunkyText(g, 'REBIRTH', W / 2, H / 2 + 6, { size: 150, gradient: ['#fff6c8', '#ffc93c'], stroke: '#2a1060', strokeW: 22 });
      for (const sx of [110, W - 110]) {
        g.fillStyle = '#ffe07a';
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr2 = k % 2 ? 22 : 50;
          g.lineTo(sx + Math.cos(a) * rr2, H / 2 + Math.sin(a) * rr2);
        }
        g.closePath();
        g.fill();
      }
    });
    const sign = signMesh(tex, 12, 3);
    sign.position.set(S.x, 14.4, zc + 0.6);
    const back = sign.clone();
    back.position.z = zc - 0.2;
    back.rotation.y = Math.PI;
    group.add(sign, back);
    m.block(S.x, 12.85, zc + 0.2, 12.2, 3.1, 0.5, '#2a1060', { ao: 0 });
  }

  group.add(m.build(mats.stud, { name: 'shops', castShadow: quality.shadows }));

  const speed = {
    /** A Speed Shop belt runs at full TREADMILL.beltSpeed and glows while someone is on it. */
    setBusy(stationIndex, running) {
      const d = speedDrivers[stationIndex];
      if (d) d.running = !!running;
    },
  };
  group.userData.speed = speed;
  return {
    group,
    speed,
    update(dt, t) {
      for (const s of spinners) {
        s.mesh.rotation.y = t * 0.9 + s.phase;
        s.mesh.position.y = s.y + Math.sin(t * 2 + s.phase) * 0.12;
      }
      for (const d of speedDrivers) d.step(dt);
      speedFxMat.userData.uniforms.uT.value = t;
      crown.rotation.y = t * 0.8;
      crown.position.y = 9.2 + Math.sin(t * 1.7) * 0.35;
      halo.position.y = crown.position.y + 0.4;
      halo.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
      halo.rotation.z = t * 0.5;
    },
  };
}
