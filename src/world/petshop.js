// The PET EGGS stand at the west end of the shop row (LAYOUT.shops.pets). OWNER: pets agent.
// A long candy-striped counter in three bays: the nine eggs sold here (SHOP_EGGS, cheapest on the left as
// seen from the plaza) stand on a "price ladder" of pedestals that climbs from left to right, each over a
// price plate. Up top: the "PET EGGS" sign, a giant egg rocking in a straw nest (the landmark, right above
// the shop spot) and the showcase of the drop-only Rainbow Egg, floating inside a glowing rainbow ring on
// an "EGG DROPS ONLY!" plaque. Two resident pets sit at the ends of the counter, marquee bulbs line the awning.
// Everything sits inside the stand's collider (world x -72..-48, z -66..-59; local x -18..6, z -14..-7),
// front facing north. Draw calls: stand 1, bulbs 1, signs 1, rainbow halo 1, 11 eggs, 2 pets.
//   createPetShop({layout?, quality?, mats?}) -> THREE.Group (already positioned) with .update(dt, t)
import * as THREE from 'three';
import { Merger, drawTexture, chunkyText, roundRect, signMaterial, makeRand } from './kit.js';
import { studTexture } from './textures.js';
import { LAYOUT } from '../gameplay/layout.js';
import { createEgg } from '../pets/eggs.js';
import { createPetModel } from '../pets/models.js';
import { EGG, EGGS, SHOP_EGGS, PET } from '../pets/catalog.js';

// ---- local layout (origin at the shop spot, +Z towards the plaza)
const XL = -18, XR = 6; // footprint
const CX = (XL + XR) / 2;
const ZF = -7.2, ZBK = -10.4, ZC = (ZF + ZBK) / 2; // counter front / back / middle
const ZW = -13.2; // back wall
const TOP = 3.58; // counter top surface
const EGG_S = 1.55; // egg scale on the counter
const eggX = (i, n) => -15 + (i * 18) / Math.max(1, n - 1); // nine eggs from x -15 to 3 (2.25 apart)
const pedH = (i) => 0.3 + i * 0.13; // the price ladder: each pricier egg stands a step higher
const SIGN_Y = 11.55; // the awning's front edge is at y 10.2: signs stand clear above it
const RX = -14, RY = 13.95, RZ = -8.4; // rainbow showcase (ring centre)
const NEST = { x: 1.9, y: 11.7, z: -11.6 }; // giant egg nest

function paw(g, x, y, s, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y + s * 0.35, s * 0.62, s * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  for (const [dx, dy] of [[-0.62, -0.25], [-0.24, -0.62], [0.24, -0.62], [0.62, -0.25]]) {
    g.beginPath();
    g.ellipse(x + dx * s, y + dy * s, s * 0.22, s * 0.28, dx * 0.5, 0, Math.PI * 2);
    g.fill();
  }
}

/** "$1K", "$150K", "$5M" */
function price(n) {
  for (const [u, v] of [['B', 1e9], ['M', 1e6], ['K', 1e3]]) {
    if (n >= v) {
      const x = n / v;
      return '$' + (x >= 10 || Number.isInteger(x) ? Math.round(x) : x.toFixed(1)) + u;
    }
  }
  return '$' + n;
}

// ------------------------------------------------------------------ one texture for every sign on the stand

const AW = 2048, AH = 768;
const R_SIGN = [0, 0, 1024, 288];
const R_PLAQUE = [1024, 0, 1024, 288];
const PLATE_W = 320, PLATE_H = 200;
const rPlate = (i) => [(i % 6) * (PLATE_W + 16) + 8, 304 + Math.floor(i / 6) * (PLATE_H + 16), PLATE_W, PLATE_H];
/** canvas rect -> [u0, v0, u1, v1] (the texture is flipped: v = 1 at the canvas top) */
const uvOf = ([x, y, w, h]) => [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH];

function drawSign(g, X, Y, W, H) {
  g.save();
  g.translate(X, Y);
  g.fillStyle = '#1b2440';
  g.fillRect(0, 0, W, H);
  roundRect(g, 6, 6, W - 12, H - 12, 44);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#ff8cc6');
  gr.addColorStop(1, '#e0479a');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = '#1b2440';
  g.stroke();
  const r = makeRand(5);
  g.save();
  roundRect(g, 18, 18, W - 36, H - 36, 32);
  g.clip();
  for (let i = 0; i < 46; i++) {
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.beginPath();
    g.arc(r() * W, r() * H, 8 + r() * 14, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  roundRect(g, 22, 22, W - 44, H - 44, 30);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.stroke();
  paw(g, 104, 150, 44, '#ffffff');
  paw(g, W - 104, 150, 44, '#ffffff');
  chunkyText(g, 'PET EGGS', W / 2, H / 2 + 8, { size: 150, fill: '#ffffff', stroke: '#1b2440', strokeW: 22, maxW: W - 300 });
  g.restore();
}

const RAINBOW = ['#ff3b5c', '#ff8a1c', '#ffd21c', '#3fcf5a', '#1fb2ff', '#5a64ff', '#b44dff'];

function drawPlaque(g, X, Y, W, H) {
  g.save();
  g.translate(X, Y);
  g.fillStyle = '#1b2440';
  g.fillRect(0, 0, W, H);
  // rainbow frame
  roundRect(g, 6, 6, W - 12, H - 12, 44);
  const rb = g.createLinearGradient(0, 0, W, 0);
  RAINBOW.forEach((c, i) => rb.addColorStop(i / (RAINBOW.length - 1), c));
  g.fillStyle = rb;
  g.fill();
  roundRect(g, 26, 26, W - 52, H - 52, 28);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a2f8a');
  bg.addColorStop(1, '#1f1850');
  g.fillStyle = bg;
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#1b2440';
  g.stroke();
  // twinkles
  const r = makeRand(11);
  for (let i = 0; i < 26; i++) {
    const x = 40 + r() * (W - 80), y = 40 + r() * (H - 80), s = 2 + r() * 4;
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`;
    g.fillRect(x - s * 2, y - 1, s * 4, 2);
    g.fillRect(x - 1, y - s * 2, 2, s * 4);
  }
  chunkyText(g, 'RAINBOW EGG', W / 2, 104, { size: 96, gradient: ['#ff8fb1', '#ffe14d', '#7ff09a', '#7fd6ff'], stroke: '#1b2440', strokeW: 18, maxW: W - 120 });
  chunkyText(g, 'EGG DROPS ONLY!', W / 2, 206, { size: 62, fill: '#ffffff', stroke: '#1b2440', strokeW: 14, maxW: W - 160 });
  g.restore();
}

function drawPlate(g, egg, [X, Y, W, H]) {
  const [c1, c2] = egg.colors;
  g.save();
  g.translate(X, Y);
  roundRect(g, 0, 0, W, H, 34);
  g.fillStyle = '#1b2440';
  g.fill();
  roundRect(g, 10, 10, W - 20, H - 20, 26);
  g.fillStyle = '#fffaf0';
  g.fill();
  // name band in the egg's colours
  g.save();
  roundRect(g, 10, 10, W - 20, H - 20, 26);
  g.clip();
  const band = g.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, c2);
  band.addColorStop(1, c1 === '#ffffff' || c1 === '#fff3d6' || c1 === '#fff6df' ? c2 : c1);
  g.fillStyle = band;
  g.fillRect(0, 0, W, 86);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(0, 10, W, 14);
  g.fillStyle = '#1b2440';
  g.fillRect(0, 84, W, 7);
  g.restore();
  chunkyText(g, egg.name.replace(/ egg$/i, '').toUpperCase(), W / 2, 52, { size: 50, fill: '#ffffff', stroke: '#1b2440', strokeW: 12, maxW: W - 44 });
  chunkyText(g, price(egg.price), W / 2, 146, { size: 76, fill: '#3fd65a', stroke: '#1b2440', strokeW: 15, maxW: W - 40 });
  g.restore();
}

function signAtlas(eggs) {
  return drawTexture(AW, AH, (g) => {
    g.clearRect(0, 0, AW, AH);
    drawSign(g, ...R_SIGN);
    drawPlaque(g, ...R_PLAQUE);
    eggs.forEach((e, i) => drawPlate(g, e, rPlate(i)));
  }, { clamp: true });
}

/** Flat textured quads (front or back facing) baked into one geometry. */
function quadGeometry(list) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const q of list) {
    const n = pos.length / 3;
    const s = q.back ? -1 : 1;
    const hw = q.w / 2, hh = q.h / 2;
    const xs = [q.x - s * hw, q.x + s * hw, q.x + s * hw, q.x - s * hw];
    const ys = [q.y - hh, q.y - hh, q.y + hh, q.y + hh];
    const [u0, v0, u1, v1] = q.uv;
    const us = [u0, u1, u1, u0], vs = [v0, v0, v1, v1];
    for (let k = 0; k < 4; k++) {
      pos.push(xs[k], ys[k], q.z);
      nor.push(0, 0, s);
      uv.push(us[k], vs[k]);
    }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

let glowMat = null;
const glowMaterial = () => (glowMat ||= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));

// ------------------------------------------------------------------ the stand

export function createPetShop({ layout = LAYOUT, quality = { shadows: true }, mats = null } = {}) {
  const S = layout.shops.pets;
  const group = new THREE.Group();
  group.name = 'pet-shop';
  group.position.set(S.x, 0, S.z);
  const m = new Merger({ uv: 'studs', uvScale: 0.125 });
  const glow = new Merger();
  const mat = mats?.stud || new THREE.MeshLambertMaterial({ vertexColors: true, map: studTexture() });
  const PINK = '#ff7ab8', WHITE = '#ffffff', MINT = '#6fe0c4', WOOD = '#c98a4f', WOODD = '#8a5a34', CREAM = '#fff4dc', NAVY = '#1b2440';
  const eggs = SHOP_EGGS;
  const n = eggs.length;
  const W = XR - XL - 0.8; // counter length

  // ---- welcome mat with a trail of paw prints
  m.box(CX, 0.06, -4.6, W + 0.4, 0.12, 5.2, '#ffd9ec', { ao: 0 });
  m.box(CX, 0.08, -4.6, W - 0.8, 0.12, 4.0, '#ffc2df', { ao: 0 });
  const pawAt = (x, z, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    const [px, pz] = P(0, 0.12);
    m.cyl(px, 0.1, pz, 0.34, 0.06, '#ff8cc6', { seg: 10, ao: 0 });
    for (const [dx, dz] of [[-0.34, -0.26], [-0.12, -0.44], [0.12, -0.44], [0.34, -0.26]]) {
      const [tx, tz] = P(dx, dz);
      m.cyl(tx, 0.1, tz, 0.12, 0.06, '#ff8cc6', { seg: 8, ao: 0 });
    }
  };
  for (let i = 0; i < 13; i++) pawAt(-16.2 + i * 1.72, i % 2 ? -3.3 : -5.0, 1.4 + (i % 3) * 0.1);

  // ---- counter: mint body, candy-striped front, cream top
  m.block(CX, 0, ZC, W, 3.2, ZF - ZBK, MINT, { ao: 0.3 });
  const stripes = 23;
  for (let i = 0; i < stripes; i++) m.box(XL + 0.4 + (i + 0.5) * (W / stripes), 1.65, ZF - 0.02, (W / stripes) * 0.92, 2.7, 0.14, i % 2 ? WHITE : PINK, { ao: 0.2 });
  m.block(CX, 3.2, ZC + 0.1, W + 0.6, 0.38, 3.6, CREAM, { ao: 0 });
  m.block(CX, 0, ZC, W + 0.4, 0.35, 3.6, '#4fc3a8', { ao: 0 });

  // ---- the price ladder: a pedestal per egg in its accent colour, gold rim, cushion; a price plate below
  const spots = eggs.map((e, i) => {
    const x = eggX(i, n), h = pedH(i), z = ZC + 0.1;
    const accent = e.colors[1];
    m.cyl(x, TOP - 0.02, z, 0.66, h, accent, { seg: 16, ao: 0.25 });
    m.cyl(x, TOP - 0.02, z, 0.78, 0.18, '#ffffff', { seg: 16, ao: 0 });
    m.cyl(x, TOP + h - 0.14, z, 0.8, 0.14, '#ffc83d', { seg: 16, ao: 0 });
    m.cyl(x, TOP + h, z, 0.72, 0.2, '#ffe36e', { seg: 16, ao: 0 });
    // plate backing on the counter front
    m.box(x, 1.75, ZF + 0.02, 2.14, 1.42, 0.12, NAVY, { ao: 0 });
    return { x, y: TOP + h + 0.12, z };
  });
  // little stools for the resident pets at both ends
  const petX = [XL + 1.1, XR - 1.1];
  for (const x of petX) {
    m.cyl(x, TOP - 0.02, ZC + 0.2, 0.55, 0.3, '#b98cff', { seg: 14, ao: 0.15 });
    m.cyl(x, TOP + 0.26, ZC + 0.2, 0.6, 0.1, '#ffffff', { seg: 14, ao: 0 });
  }

  // ---- back wall with shelves of tiny eggs in every egg's colours
  m.block(CX, 0, ZW - 0.3, XR - XL, 8.8, 0.6, '#ffd6ea', { ao: 0.3 });
  for (let x = XL + 1; x < XR - 0.5; x += 2) m.block(x, 0, ZW + 0.02, 0.9, 8.8, 0.06, '#ffc2df', { ao: 0 });
  for (const y of [4.3, 6.5]) m.block(CX, y, ZW + 0.5, W - 0.4, 0.25, 1.1, WOOD, { ao: 0 });
  const r = makeRand(77);
  for (const [k, y] of [[0, 4.55], [1, 6.75]]) {
    for (let i = 0; i < 20; i++) {
      const x = XL + 1.3 + i * 1.12 + (r() - 0.5) * 0.2;
      const [c1, c2] = EGGS[(i + k * 3) % EGGS.length].colors;
      m.prim('sphere:10', x, y + 0.45, ZW + 0.5, 0.62, 0.86, 0.62, c1, { top: c2, ao: 0.05 });
    }
  }

  // ---- posts (the counter's three bays) and the striped awning with a scalloped valance + marquee bulbs
  const bayPosts = [(eggX(2, n) + eggX(3, n)) / 2, (eggX(5, n) + eggX(6, n)) / 2];
  for (const px of [XL + 0.3, XR - 0.3]) {
    m.block(px, 3.4, ZF - 0.25, 0.5, 5.8, 0.5, WOODD);
    m.block(px, 0, ZW, 0.6, 10.2, 0.6, WOODD);
  }
  for (const px of bayPosts) {
    m.block(px, TOP, ZF - 0.3, 0.36, 5.6, 0.36, WOODD);
    m.prim('sphere:8', px, TOP + 0.1, ZF - 0.3, 0.6, 0.3, 0.6, WOODD, { ao: 0 });
  }
  const AL = XL - 0.5, AR = XR + 0.5, stripeN = 20, sw = (AR - AL) / stripeN;
  for (let i = 0; i < stripeN; i++) {
    const x = AL + (i + 0.5) * sw;
    m.box(x, 9.35, (ZF + ZW) / 2 + 1.1, sw, 0.3, 8.6, i % 2 ? WHITE : PINK, { rx: -0.2, ao: 0 });
    m.prim('sphere:8', x, 8.3, ZF + 1.45, sw, 1.0, 0.25, i % 2 ? WHITE : PINK, { ao: 0 });
    if (i) glow.prim('sphere:6', AL + i * sw, 8.25, ZF + 1.62, 0.26, 0.26, 0.26, i % 2 ? '#fff3b0' : '#ffd23f');
  }
  m.box(CX, 8.6, ZF + 1.45, AR - AL, 0.4, 0.3, PINK, { ao: 0 });

  // ---- roof: sign legs, the giant egg's straw nest (above the shop spot) and the rainbow showcase
  for (const sx of [-3.4, 3.4]) m.block(CX + sx, 9.3, ZF + 1.59, 0.3, SIGN_Y - 10.5, 0.3, WOODD);
  m.box(CX, SIGN_Y, ZF + 1.59, 9.7, 2.8, 0.1, NAVY, { ao: 0 });
  m.cyl(NEST.x, NEST.y - 0.5, NEST.z, 1.6, 0.7, '#c98a3a', { seg: 16, ao: 0.2 });
  const rr = makeRand(9);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const x = NEST.x + Math.cos(a) * 1.75, z = NEST.z + Math.sin(a) * 1.75;
    m.beam(x - Math.sin(a) * 0.6, NEST.y + 0.05 + rr() * 0.3, z + Math.cos(a) * 0.6, x + Math.sin(a) * 0.6, NEST.y + 0.15 + rr() * 0.3, z - Math.cos(a) * 0.6, 0.22, i % 3 ? '#e8b64a' : '#d49a2e', { prim: 'cyl:5', ao: 0 });
  }
  m.block(NEST.x, 8.9, NEST.z, 2.4, 2.4, 2.4, WOODD, { ao: 0.2 });
  for (const sx of [-1, 1]) m.beam(NEST.x + sx * 1.1, 8.9, NEST.z + 1.1, NEST.x + sx * 0.6, NEST.y - 0.6, NEST.z + 0.6, 0.35, WOODD, { ao: 0 });
  // rainbow showcase: plaque on legs, a white-and-gold cradle holding the ring
  const plaqueY = SIGN_Y - 0.4, plaqueW = 5.3, plaqueH = 1.49;
  for (const sx of [-1.7, 1.7]) m.block(RX + sx, 9.3, ZF + 1.59, 0.3, plaqueY - 9.8, 0.3, WOODD);
  m.box(RX, plaqueY, ZF + 1.59, plaqueW + 0.1, plaqueH + 0.1, 0.1, NAVY, { ao: 0 });
  m.block(RX, 9.0, RZ - 0.9, 1.6, plaqueY - 9.0 + 0.2, 1.2, WOODD, { ao: 0.2 });
  m.cyl(RX, plaqueY + 0.2, RZ - 0.35, 1.25, 0.35, '#ffffff', { seg: 18, ao: 0 });
  m.cyl(RX, plaqueY + 0.55, RZ - 0.35, 1.05, 0.18, '#ffc83d', { seg: 18, ao: 0 });
  for (const sx of [-1, 1]) m.beam(RX + sx * 0.55, plaqueY + 0.7, RZ - 0.35, RX + sx * 1.15, RY - 1.95, RZ, 0.2, '#ffc83d', { prim: 'cyl:6', ao: 0 });

  const base = m.build(mat, { name: 'pet-shop', castShadow: !!quality.shadows });
  group.add(base);
  const bulbs = glow.build(glowMaterial(), { name: 'pet-shop-bulbs', receiveShadow: false });
  group.add(bulbs);

  // ---- all the signs: one atlas texture, one mesh
  const atlas = signAtlas(eggs);
  const q = [
    { x: CX, y: SIGN_Y, z: ZF + 1.66, w: 9.6, h: 2.7, uv: uvOf(R_SIGN) },
    { x: CX, y: SIGN_Y, z: ZF + 1.52, w: 9.6, h: 2.7, uv: uvOf(R_SIGN), back: true },
    { x: RX, y: plaqueY, z: ZF + 1.66, w: plaqueW, h: plaqueH, uv: uvOf(R_PLAQUE) },
    { x: RX, y: plaqueY, z: ZF + 1.52, w: plaqueW, h: plaqueH, uv: uvOf(R_PLAQUE), back: true },
  ];
  spots.forEach((s, i) => q.push({ x: s.x, y: 1.75, z: ZF + 0.09, w: 2.06, h: 1.29, uv: uvOf(rPlate(i)) }));
  const signs = new THREE.Mesh(quadGeometry(q), signMaterial(atlas, 0.3));
  signs.name = 'pet-shop-signs';
  group.add(signs);

  // ---- the rainbow halo: six glowing rainbow bands + twinkling stars round it (spins slowly)
  const halo = new Merger();
  const torus = new THREE.TorusGeometry(1, 0.036, 6, 44);
  torus.deleteAttribute('uv1');
  RAINBOW.slice(0, 6).forEach((c, i) => {
    const rad = 2.42 - i * 0.13;
    halo.add(torus, new THREE.Matrix4().makeScale(rad, rad, rad * 1.6), c);
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rad = i % 2 ? 2.85 : 2.7;
    const s = i % 2 ? 0.2 : 0.3;
    halo.prim('octa', Math.cos(a) * rad, Math.sin(a) * rad, 0, s, s * 1.9, s, i % 2 ? '#ffffff' : '#fff3a0', { rz: -a + Math.PI / 2 });
  }
  const haloMesh = halo.build(glowMaterial(), { name: 'pet-shop-rainbow', receiveShadow: false });
  haloMesh.matrixAutoUpdate = true;
  haloMesh.position.set(RX, RY, RZ);
  group.add(haloMesh);
  torus.dispose();

  // ---- animated bits: the nine eggs, the giant egg, the rainbow egg, two resident pets
  const spinners = [];
  eggs.forEach((e, i) => {
    const egg = createEgg(e.id);
    egg.scale.setScalar(EGG_S);
    const s = spots[i];
    egg.position.set(s.x, s.y, s.z);
    egg.traverse((o) => (o.castShadow = !!quality.shadows));
    group.add(egg);
    spinners.push({ o: egg, y: s.y, phase: i * 1.3 });
  });
  const giant = createEgg('garden');
  giant.scale.setScalar(4.6);
  giant.position.set(NEST.x, NEST.y - 0.1, NEST.z);
  giant.traverse((o) => (o.castShadow = !!quality.shadows));
  group.add(giant);
  const rainbowId = EGG.rainbow ? 'rainbow' : EGGS.find((e) => !e.shop)?.id || 'galaxy';
  const rainbow = createEgg(rainbowId);
  rainbow.scale.setScalar(2.3);
  rainbow.position.set(RX, RY - 1.15, RZ);
  group.add(rainbow);
  const residents = [
    { id: PET.piglet ? 'piglet' : 'bunny', x: petX[0], yaw: 0.55 },
    { id: PET.penguin ? 'penguin' : 'chick', x: petX[1], yaw: -0.55 },
  ].map((p, i) => {
    const pm = createPetModel(p.id, { fx: false, shadow: false });
    pm.root.position.set(p.x, TOP + 0.3, ZC + 0.2);
    pm.root.rotation.y = p.yaw;
    const k = Math.min(0.95, 1.45 / Math.max(0.5, pm.size.h));
    pm.root.scale.setScalar(k);
    group.add(pm.root);
    return { pm, yaw: p.yaw, phase: i * 2.1 };
  });

  group.update = (dt, t) => {
    for (const s of spinners) {
      s.o.rotation.y = Math.sin(t * 0.7 + s.phase) * 0.5;
      s.o.rotation.z = Math.sin(t * 2.2 + s.phase) * 0.05;
      s.o.position.y = s.y + Math.abs(Math.sin(t * 1.6 + s.phase)) * 0.12;
    }
    // the giant egg rocks as if something inside wants out
    const k = t % 6;
    const wob = k > 4.6 ? Math.sin((k - 4.6) * 18) * 0.08 * Math.sin(((k - 4.6) / 1.4) * Math.PI) : Math.sin(t * 0.8) * 0.02;
    giant.rotation.z = wob;
    giant.rotation.x = wob * 0.4;
    // the rainbow egg turns and floats in its ring
    rainbow.rotation.y = t * 0.9;
    rainbow.rotation.z = Math.sin(t * 1.3) * 0.08;
    rainbow.position.y = RY - 1.15 + Math.sin(t * 1.7) * 0.14;
    haloMesh.rotation.z = -t * 0.35;
    for (const rp of residents) {
      const u = (t + rp.phase) % 5;
      const hop = u < 0.5 ? Math.sin((u / 0.5) * Math.PI) * 0.35 : 0;
      rp.pm.lift.position.y = hop;
      rp.pm.root.rotation.y = rp.yaw + Math.sin(t * 0.6 + rp.phase) * 0.35;
      if (rp.pm.headPivot) rp.pm.headPivot.rotation.set(0, Math.sin(t * 1.1 + rp.phase) * 0.4, Math.sin(t * 0.7 + rp.phase) * 0.12);
    }
  };
  group.userData.update = group.update;
  return group;
}
