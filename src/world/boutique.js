// The Wardrobe boutique: a clothing stand at the east end of the shop row (LAYOUT.shops.wardrobe).
// A shop-window stage with three mannequins modelling hats and outfits, clothes racks, a mirror and a
// hat stand under a striped awning, and a big "WARDROBE" sign. Built in local space facing +Z (north,
// towards the plaza), origin = the shop spot; everything solid stays inside the integrator's counter
// collider (local x -6..6, z -14..-7), only the awning and sign overhang above head height.
// createBoutique({mats?, quality?}) -> THREE.Group with userData.update(dt, t) (mannequins turn, hats bob).
import * as THREE from 'three';
import { Merger, makeRand, drawTexture, chunkyText, roundRect, signMaterial, trs } from './kit.js';
import { studTexture } from './textures.js';
import { hatGeometry } from '../characters/gear.js';

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

// a coat hanger icon for the sign
function hanger(g, x, y, s, color) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const path = () => {
    g.beginPath();
    g.moveTo(-4, -30);
    g.bezierCurveTo(-4, -44, 14, -44, 14, -32);
    g.bezierCurveTo(14, -24, 2, -22, 0, -14);
    g.lineTo(-40, 16);
    g.lineTo(40, 16);
    g.lineTo(0, -14);
  };
  path();
  g.strokeStyle = '#1b2440';
  g.lineWidth = 16;
  g.stroke();
  path();
  g.strokeStyle = color;
  g.lineWidth = 7;
  g.stroke();
  g.restore();
}

// a mannequin (R6 proportions, ~0.9 of a player) in one outfit, standing on a round base at (x, y, z)
function mannequin(m, x, y, z, { shirt, shirt2, pants, skirt = false, scarf = null }) {
  const k = 0.74; // studs per rig unit (player is ~0.85)
  const body = '#f4efe9';
  m.cyl(x, y, z, 1.35, 0.3, '#ffd23f', { seg: 18, ao: 0.1 });
  m.cyl(x, y + 0.3, z, 1.2, 0.08, '#fff3c4', { seg: 18, ao: 0 });
  // legs
  const hip = y + 0.38 + 2 * k;
  for (const s of [-1, 1]) {
    m.block(x + s * 0.5 * k, y + 0.38, z, 0.96 * k, 2 * k, 0.98 * k, skirt ? body : pants, { ao: 0.2 });
    m.block(x + s * 0.5 * k, y + 0.38, z + 0.08, 1.02 * k, 0.3 * k, 1.2 * k, '#2b2f3a', { ao: 0 });
  }
  if (skirt) m.prim('frustum:14', x, hip - 0.55 * k, z, 2.6 * k, 1.2 * k, 1.9 * k, pants, { ao: 0.15 });
  // torso + a contrasting stripe, arms
  m.block(x, hip, z, 2 * k, 2 * k, 1 * k, shirt, { ao: 0.18 });
  m.box(x, hip + 1.1 * k, z + 0.5 * k + 0.01, 2 * k, 0.3 * k, 0.04, shirt2, { ao: 0 });
  for (const s of [-1, 1]) {
    m.box(x + s * 1.5 * k, hip + 1.5 * k, z, 1 * k, 0.9 * k, 1 * k, shirt, { ao: 0 });
    m.box(x + s * 1.5 * k, hip + 0.55 * k, z, 0.94 * k, 1.1 * k, 0.94 * k, body, { ao: 0.2 });
  }
  if (scarf) m.prim('torus:14', x, hip + 2 * k, z, 2.6 * k, 2.6 * k, 1.8 * k, scarf, { rx: Math.PI / 2, ao: 0 });
  // head
  m.add('box', trs(x, hip + 2 * k + 1.06 * k, z, 2.2 * k, 2.1 * k, 1.9 * k), body, { ao: 0.1 });
  return hip + 2 * k + 2.12 * k; // head top
}

export function createBoutique({ mats = null, quality = null } = {}) {
  const group = new THREE.Group();
  group.name = 'boutique';
  const r = makeRand(4242);
  const m = new Merger({ uv: 'studs', uvScale: 0.125 });
  const shadows = quality ? !!quality.shadows : true;
  const pink = '#ff6fb5';
  const lilac = '#b58cff';
  const cream = '#fff4ea';
  const gold = '#ffc93c';
  const x0 = -6;
  const x1 = 6;
  const zB = -13.4; // back wall
  const zf = -7; // front of the window stage (the collider's front edge)

  // ---- floor: pink and cream checker tiles on a low deck
  m.block(0, 0, (zB + zf) / 2 - 0.3, 12.2, 0.22, zf - zB + 0.6, '#c98a5a', { ao: 0.2 });
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 7; j++) m.box(x0 + 0.5 + i, 0.24, zB + 0.5 + j * 0.93, 0.98, 0.04, 0.91, (i + j) % 2 ? '#ffd6ec' : cream, { ao: 0 });
  }

  // ---- back wall: lilac panels with white trim, a big round mirror, shelves of folded clothes
  m.block(0, 0, zB - 0.35, 12.4, 9.2, 0.6, lilac, { ao: 0.25 });
  for (const x of [-4, 0, 4]) m.box(x, 4.6, zB - 0.02, 3.4, 7.2, 0.12, '#c7a6ff', { ao: 0 });
  m.box(0, 0.5, zB - 0.02, 12.4, 1.0, 0.16, '#ffffff', { ao: 0 });
  m.box(0, 8.95, zB - 0.02, 12.4, 0.3, 0.2, '#ffffff', { ao: 0 });
  // mirror: gold ring frame + sky-blue glass with a glint
  m.prim('torus:28', 0, 5.4, zB + 0.12, 5.4, 5.4, 3, gold, { ao: 0 });
  m.prim('cyl:28', 0, 5.4, zB + 0.06, 3.9, 0.1, 3.9, '#bfe6ff', { rx: Math.PI / 2, ao: 0 });
  m.box(-0.7, 6.2, zB + 0.13, 0.25, 1.4, 0.02, '#ffffff', { rz: -0.6, ao: 0 });
  m.box(-0.2, 6.5, zB + 0.13, 0.15, 0.8, 0.02, '#ffffff', { rz: -0.6, ao: 0 });
  // shelves with folded clothes either side of the mirror
  const cloth = ['#e8323c', '#ffd23f', '#2f80ed', '#2fb84f', '#ff8a1a', '#8a5cc8', '#1ec8a5', '#ff4f9a', '#ffffff'];
  for (const sx of [-1, 1]) {
    for (const y of [3.4, 5.6, 7.6]) {
      m.block(sx * 4.3, y - 0.16, zB + 0.45, 2.6, 0.16, 0.9, '#ffffff', { ao: 0 });
      for (let k = 0; k < 3; k++) {
        let h = y;
        const n = 1 + Math.floor(r() * 3);
        for (let q = 0; q < n; q++) {
          m.block(sx * 4.3 + (k - 1) * 0.8, h, zB + 0.45, 0.68, 0.22, 0.62, r.pick(cloth), { ao: 0.1 });
          h += 0.22;
        }
      }
    }
  }

  // ---- clothes racks (left and right), shirts hanging on hangers
  for (const sx of [-1, 1]) {
    const cx = sx * 3.9;
    const cz = -11.3;
    for (const px of [cx - 1.7, cx + 1.7]) {
      m.cyl(px, 0.26, cz, 0.12, 5.4, '#c9ced8', { seg: 8, ao: 0 });
      m.cyl(px, 0.26, cz, 0.5, 0.12, '#8f96a3', { seg: 10, ao: 0 });
    }
    m.beam(cx - 1.8, 5.6, cz, cx + 1.8, 5.6, cz, 0.14, '#c9ced8', { prim: 'cyl:8', ao: 0 });
    for (let i = 0; i < 6; i++) {
      const x = cx - 1.35 + i * 0.54;
      const c = r.pick(cloth);
      const tilt = (r() - 0.5) * 0.12;
      m.beam(x, 5.65, cz, x, 5.35, cz, 0.05, '#8a5a34', { ao: 0 });
      // a shirt seen side on: body + sleeve bump
      m.box(x, 4.45, cz, 0.28, 1.7, 1.2, c, { rz: tilt, ao: 0.25 });
      m.box(x, 5.0, cz, 0.3, 0.5, 1.5, c, { rz: tilt, ao: 0 });
    }
  }

  // ---- the window stage with three mannequins
  const stageH = 1.1;
  m.block(0, 0, -8.6, 12, stageH, 3.2, '#ffffff', { ao: 0.2 });
  m.box(0, stageH * 0.5, zf + 0.02, 12, 0.35, 0.06, pink, { ao: 0 });
  for (let i = 0; i < 12; i++) m.box(x0 + 0.5 + i, stageH + 0.02, -8.6, 0.96, 0.04, 3.1, i % 2 ? '#ffe6f3' : '#fff9f2', { ao: 0 });
  // little bulbs along the stage edge
  const bulbs = new Merger();
  for (let i = 0; i < 13; i++) bulbs.prim('sphere:8', x0 + 0.1 + i * 0.98, stageH + 0.14, zf + 0.12, 0.26, 0.26, 0.26, i % 2 ? '#fff3b0' : '#ffd6f0', { ao: 0 });

  const looks = [
    { x: -3.9, shirt: '#e8323c', shirt2: '#ffffff', pants: '#2b3a55', hat: 'cowboy', hatColor: '#b07a3e', scarf: '#ffd23f' },
    { x: 0, shirt: '#8a5cc8', shirt2: '#ffd23f', pants: '#ff4f9a', skirt: true, hat: 'crown' },
    { x: 3.9, shirt: '#1ec8a5', shirt2: '#1d1d1d', pants: '#c8b48a', hat: 'tophat', hatColor: '#23232b' },
  ];
  const dummies = [];
  const hatMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x141414 });
  for (const L of looks) {
    // each mannequin is its own merged mesh so it can turn slowly on its base
    const mm = new Merger();
    const top = mannequin(mm, 0, 0, 0, L);
    const dummy = new THREE.Group();
    dummy.position.set(L.x, stageH, -8.7);
    const body = mm.build(new THREE.MeshLambertMaterial({ vertexColors: true }), { castShadow: shadows, name: 'mannequin' });
    body.matrixAutoUpdate = true;
    dummy.add(body);
    const hg = hatGeometry(L.hat, L.hatColor);
    if (hg?.main) {
      const hat = new THREE.Mesh(hg.main, hatMat);
      hat.castShadow = shadows;
      // hat space: 2.2-wide head, sat on the mannequin's (0.74-scale) head
      hat.scale.setScalar(0.76);
      hat.position.y = top;
      dummy.add(hat);
      dummy.userData.hat = hat;
      dummy.userData.hatY = top;
    }
    group.add(dummy);
    dummies.push(dummy);
  }

  // ---- hat stand on the stage corner + shoe boxes
  m.cyl(5.3, stageH, -7.9, 0.08, 3.2, '#8a5a34', { seg: 6, ao: 0 });
  m.cyl(5.3, stageH, -7.9, 0.45, 0.1, '#8a5a34', { seg: 10, ao: 0 });
  for (const [bx, bz, c] of [[-5.3, -7.7, pink], [-5.3, -8.6, '#5cc8ff'], [-5.3, -8.15, '#ffd23f']]) {
    m.block(bx, stageH + (c === '#ffd23f' ? 0.5 : 0), bz, 0.9, 0.5, 0.8, c, { ao: 0.15 });
    m.box(bx, stageH + (c === '#ffd23f' ? 1.0 : 0.5) + 0.03, bz, 0.95, 0.06, 0.85, '#ffffff', { ao: 0 });
  }
  const standHat = new THREE.Mesh(hatGeometry('cap', '#2f80ed').main, hatMat);
  standHat.scale.setScalar(0.45);
  standHat.position.set(5.3, stageH + 3.25, -7.9);
  group.add(standHat);

  // ---- corner posts + striped awning (sloped) with a scalloped valance
  for (const px of [x0 + 0.3, x1 - 0.3]) {
    m.block(px, 0, zf - 0.35, 0.5, 9.2, 0.5, '#ffffff', { ao: 0.1 });
    m.block(px, 0, zf - 0.35, 0.62, 0.5, 0.62, gold, { ao: 0 });
  }
  const n = 10;
  const awZ = -8.9;
  const awD = 8.5;
  const tilt = 0.25; // slopes down towards the plaza
  for (let i = 0; i < n; i++) {
    const x = x0 - 0.5 + (i + 0.5) * (13 / n);
    m.box(x, 9.35, awZ, 13 / n, 0.3, awD, i % 2 ? '#ffffff' : pink, { rx: tilt, ao: 0 });
    m.prim('sphere:8', x, 8.14, awZ + awD / 2 - 0.05, 13 / n, 1.0, 0.25, i % 2 ? '#ffffff' : lilac, { ao: 0 });
  }
  m.box(0, 8.42, awZ + awD / 2 - 0.05, 13, 0.4, 0.3, lilac, { ao: 0 });

  // ---- sign
  const tex = signTexture(1024, 256, (g, W, H) => {
    boardBg(g, W, H, '#ff9bd0', '#b56cff');
    chunkyText(g, 'WARDROBE', W / 2, H / 2 + 6, { size: 140, fill: '#ffffff', stroke: '#1b2440', strokeW: 22, maxW: W - 260 });
    hanger(g, 105, H / 2 + 8, 1.35, '#ffd23f');
    hanger(g, W - 105, H / 2 + 8, 1.35, '#ffd23f');
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), signMaterial(tex, 0.3));
  sign.position.set(0, 12.3, zf + 0.95);
  const back = sign.clone();
  back.position.z -= 0.14;
  back.rotation.set(0, Math.PI, 0);
  m.box(0, 12.3, zf + 0.88, 11.1, 2.8, 0.1, '#1b2440', { ao: 0 });
  m.block(-4, 9.4, zf + 0.88, 0.3, 1.6, 0.3, '#ffffff');
  m.block(4, 9.4, zf + 0.88, 0.3, 1.6, 0.3, '#ffffff');
  group.add(sign, back);
  // a sparkly star on top of the sign
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? 0.42 : 0.95;
    if (i) starShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else starShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15), new THREE.MeshBasicMaterial({ color: '#ffe066', toneMapped: false }));
  star.position.set(0, 14.35, zf + 0.9);
  group.add(star);

  const material = mats?.stud || new THREE.MeshLambertMaterial({ vertexColors: true, map: studTexture() });
  group.add(m.build(material, { name: 'boutique', castShadow: shadows }));
  group.add(bulbs.build(new THREE.MeshBasicMaterial({ vertexColors: true }), { name: 'boutique-bulbs', receiveShadow: false }));

  group.userData.update = (dt, t) => {
    dummies.forEach((d, i) => {
      d.rotation.y = Math.sin(t * 0.5 + i * 2.1) * 0.45;
      const hat = d.userData.hat;
      if (hat) hat.position.y = d.userData.hatY + Math.max(0, Math.sin(t * 2 + i * 1.7)) * 0.12;
    });
    standHat.rotation.y = t * 0.8;
    star.rotation.y = t * 1.2;
  };
  return group;
}
