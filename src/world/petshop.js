// The PET EGGS stand at the west end of the shop row (LAYOUT.shops.pets). OWNER: pets agent.
// Candy-striped awning, a counter with the four eggs on cushions and two resident pets, a "PET EGGS" sign
// and a giant egg rocking in a straw nest on the roof (a landmark you can spot from across the plaza).
// Everything sits inside the stand's counter collider (x -60..-48, z -66..-59), front facing north.
//   createPetShop({layout?, quality?, mats?}) -> THREE.Group (already positioned) with .update(dt, t)
import * as THREE from 'three';
import { Merger, drawTexture, chunkyText, roundRect, signMaterial, makeRand } from './kit.js';
import { studTexture } from './textures.js';
import { LAYOUT } from '../gameplay/layout.js';
import { createEgg } from '../pets/eggs.js';
import { createPetModel } from '../pets/models.js';
import { EGGS } from '../pets/catalog.js';

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

function signTexture() {
  return drawTexture(1024, 288, (g, W, H) => {
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
    // polka dots
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
  }, { clamp: true });
}

export function createPetShop({ layout = LAYOUT, quality = { shadows: true }, mats = null } = {}) {
  const S = layout.shops.pets;
  const group = new THREE.Group();
  group.name = 'pet-shop';
  group.position.set(S.x, 0, S.z);
  // local frame: origin at the shop spot, +Z towards the plaza; the counter collider is x -6..6, z -14..-7
  const m = new Merger({ uv: 'studs', uvScale: 0.125 });
  const mat = mats?.stud || new THREE.MeshLambertMaterial({ vertexColors: true, map: studTexture() });
  const PINK = '#ff7ab8', WHITE = '#ffffff', MINT = '#6fe0c4', WOOD = '#c98a4f', WOODD = '#8a5a34', CREAM = '#fff4dc';

  // ---- welcome mat with paw prints
  m.box(0, 0.06, -4.6, 12.6, 0.12, 5.2, '#ffd9ec', { ao: 0 });
  m.box(0, 0.08, -4.6, 11.4, 0.12, 4.0, '#ffc2df', { ao: 0 });
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
  [[-4.2, -2.9, 0.4], [-2.8, -4.6, 0.1], [-1.2, -3.3, -0.2], [0.6, -5.1, 0.2], [2.2, -3.4, -0.1], [3.9, -5.0, 0.3], [4.6, -3.2, -0.3]].forEach(([x, z, r]) => pawAt(x, z, r));

  // ---- counter (front face at z -7.2), candy-striped front panel
  const zf = -7.2, zb = -10.4, zc = (zf + zb) / 2;
  m.block(0, 0, zc, 12, 3.2, zf - zb, MINT, { ao: 0.3 });
  for (let i = 0; i < 12; i++) m.box(-5.5 + i, 1.65, zf - 0.02, 0.92, 2.7, 0.14, i % 2 ? WHITE : PINK, { ao: 0.2 });
  m.block(0, 3.2, zc + 0.1, 12.6, 0.38, 3.6, CREAM, { ao: 0 });
  m.block(0, 0, zc, 12.4, 0.35, 3.6, '#4fc3a8', { ao: 0 });
  // cushions for the four eggs
  const eggX = [-3.3, -1.1, 1.1, 3.3];
  for (const x of eggX) {
    m.cyl(x, 3.58, zc + 0.1, 0.78, 0.26, '#ffe36e', { seg: 16, ao: 0 });
    m.cyl(x, 3.58, zc + 0.1, 0.84, 0.1, '#ff9f1c', { seg: 16, ao: 0 });
  }
  // little stools for the resident pets
  for (const x of [-5.25, 5.25]) m.cyl(x, 3.58, zc + 0.2, 0.62, 0.2, '#b98cff', { seg: 14, ao: 0 });

  // ---- back wall with shelves of tiny eggs
  const zB = -13.2;
  m.block(0, 0, zB - 0.3, 12, 8.8, 0.6, '#ffd6ea', { ao: 0.3 });
  for (let i = 0; i < 6; i++) m.block(-5 + i * 2, 0, zB + 0.02, 0.9, 8.8, 0.06, '#ffc2df', { ao: 0 });
  for (const y of [4.0, 6.2]) m.block(0, y, zB + 0.5, 11.2, 0.25, 1.1, WOOD, { ao: 0 });
  const r = makeRand(77);
  const EGGC = [['#fff6df', '#7bd35a'], ['#3fbf5a', '#ffd23f'], ['#4a2620', '#ff7a1a'], ['#2a1b5c', '#ff66d9']];
  for (const y of [4.25, 6.45]) {
    for (let i = 0; i < 9; i++) {
      const x = -4.6 + i * 1.15 + (r() - 0.5) * 0.2;
      const [c1, c2] = EGGC[(i + (y > 5 ? 1 : 0)) % 4];
      m.prim('sphere:10', x, y + 0.5, zB + 0.5, 0.66, 0.9, 0.66, c1, { top: c2, ao: 0.05 });
    }
  }
  // ---- posts + striped sloped awning with a scalloped valance
  for (const px of [-5.7, 5.7]) {
    m.block(px, 3.4, zf - 0.25, 0.5, 5.8, 0.5, WOODD);
    m.block(px, 0, zB, 0.6, 10.2, 0.6, WOODD);
  }
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x = -6.5 + (i + 0.5) * (13 / n);
    m.box(x, 9.35, (zf + zB) / 2 + 1.1, 13 / n, 0.3, 8.6, i % 2 ? WHITE : PINK, { rx: -0.2, ao: 0 });
    m.prim('sphere:8', x, 8.3, zf + 1.45, 13 / n, 1.0, 0.25, i % 2 ? WHITE : PINK, { ao: 0 });
  }
  m.box(0, 8.6, zf + 1.45, 13, 0.4, 0.3, PINK, { ao: 0 });
  // straw nest on the roof for the giant egg
  const nestY = 11.7, nestZ = -11.6;
  m.cyl(0, nestY - 0.5, nestZ, 1.6, 0.7, '#c98a3a', { seg: 16, ao: 0.2 });
  const rr = makeRand(9);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const x = Math.cos(a) * 1.75, z = nestZ + Math.sin(a) * 1.75;
    m.beam(x - Math.sin(a) * 0.6, nestY + 0.05 + rr() * 0.3, z + Math.cos(a) * 0.6, x + Math.sin(a) * 0.6, nestY + 0.15 + rr() * 0.3, z - Math.cos(a) * 0.6, 0.22, i % 3 ? '#e8b64a' : '#d49a2e', { prim: 'cyl:5', ao: 0 });
  }
  m.block(0, 8.9, nestZ, 2.4, 2.4, 2.4, WOODD, { ao: 0.2 });
  for (const sx of [-1, 1]) m.beam(sx * 1.1, 8.9, nestZ + 1.1, sx * 0.6, nestY - 0.6, nestZ + 0.6, 0.35, WOODD, { ao: 0 });

  // ---- sign board in front of the nest
  const tex = signTexture();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.7), signMaterial(tex, 0.3));
  sign.position.set(0, 11.1, zf + 1.66);
  const back = sign.clone();
  back.position.z -= 0.14;
  back.rotation.y = Math.PI;
  m.box(0, 11.1, zf + 1.59, 9.7, 2.8, 0.1, '#1b2440', { ao: 0 });
  for (const sx of [-3.4, 3.4]) m.block(sx, 9.3, zf + 1.59, 0.3, 0.8, 0.3, WOODD);
  group.add(sign, back);

  const base = m.build(mat, { name: 'pet-shop', castShadow: !!quality.shadows });
  group.add(base);

  // ---- animated bits: the four eggs, the giant egg, two resident pets
  const spinners = [];
  EGGS.forEach((e, i) => {
    const egg = createEgg(e.id);
    egg.scale.setScalar(1.55);
    egg.position.set(eggX[i], 3.72, zc + 0.1);
    egg.traverse((o) => (o.castShadow = !!quality.shadows));
    group.add(egg);
    spinners.push({ o: egg, y: 3.72, phase: i * 1.3, kind: 'egg' });
  });
  const giant = createEgg('garden');
  giant.scale.setScalar(4.6);
  giant.position.set(0, nestY - 0.1, nestZ);
  giant.traverse((o) => (o.castShadow = !!quality.shadows));
  group.add(giant);
  const residents = [
    { id: 'bunny', x: -5.25, yaw: 0.5 },
    { id: 'chick', x: 5.25, yaw: -0.5 },
  ].map((p, i) => {
    const pm = createPetModel(p.id, { fx: false, shadow: false });
    pm.root.position.set(p.x, 3.78, zc + 0.2);
    pm.root.rotation.y = p.yaw;
    pm.root.scale.setScalar(0.95);
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
