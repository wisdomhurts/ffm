// Dev gallery for the pets module. URL hash (or window.__gallery.apply({...})) picks the view:
//   view=lineup | front | close:<petId> | follow | eggs | stand | thumbs | hatch
//   t=<seconds> (time), freeze=1, speed=<owner studs/s for follow>
// Build: node build.mjs --entry src/pets/dev/gallery.js --out <dir>
import * as THREE from 'three';
import { Engine } from '../../core/engine.js';
import { CHARACTERS } from '../../config.js';
import { createAvatar } from '../../characters/avatar.js';
import { PETS } from '../catalog.js';
import { createPetModel } from '../models.js';
import { createPetView } from '../view.js';
import { createEgg } from '../eggs.js';
import { EGGS } from '../catalog.js';
import { createPetShop } from '../../world/petshop.js';

document.body.style.margin = '0';
const container = document.getElementById('app') || document.body.appendChild(document.createElement('div'));
container.style.cssText = 'position:fixed;inset:0';
const engine = new Engine(container);
const { scene, camera } = engine;
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#bfe7ff', 160, 420);

function studTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#6cc25a';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.arc(34, 35, 19, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7ccf69';
  g.beginPath();
  g.arc(32, 32, 18, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(300, 300);
  t.anisotropy = 8;
  return t;
}
const plate = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: studTexture(), roughness: 0.8 }));
plate.rotation.x = -Math.PI / 2;
plate.receiveShadow = true;
scene.add(plate);

const opts = { view: 'lineup', t: 0, freeze: false, speed: 18 };
function parseHash() {
  const o = {};
  for (const kv of location.hash.replace(/^#/, '').split('&')) {
    if (!kv) continue;
    const [k, v = ''] = kv.split('=');
    o[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return o;
}

let actors = [];
let cleanup = [];
function clear() {
  for (const a of actors) a.dispose?.();
  actors = [];
  cleanup.forEach((f) => f());
  cleanup = [];
}

// ---- lineup: every pet in two rows, posed with a slow idle
function lineup(only = null, rows = 2) {
  const list = only ? PETS.filter((p) => p.id === only) : PETS;
  const n = list.length;
  const perRow = Math.ceil(n / rows);
  list.forEach((p, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const m = createPetModel(p.id);
    m.root.position.set((col - (perRow - 1) / 2) * 3.2 + (row % 2) * 0.8, 0, row * -3.6);
    m.root.rotation.y = +opts.yaw || 0;
    if (m.fly) m.lift.position.y = 1.2;
    scene.add(m.root);
    actors.push({ m, i, update(dt, t) {
      if (m.headPivot) m.headPivot.rotation.y = Math.sin(t * 0.8 + i) * 0.25;
      for (const w of m.wings) w.rotation.z = (m.wingBase + Math.sin(t * m.wingSpeed + i) * m.wingAmp) * w.userData.side;
      if (m.tailPivot) m.tailPivot.rotation[m.tailAxis] = Math.sin(t * 7 + i) * 0.3;
    }, dispose: () => m.dispose() });
  });
}

// ---- follow: an avatar runs a loop with pets at its heels
function follow() {
  const av = createAvatar(CHARACTERS[2], null, CHARACTERS[2].look.skin);
  scene.add(av.object3d);
  const owner = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, onGround: true };
  const ids = (parseHash().pets || 'puppy,dragon,unicorn,axolotl').split(',');
  const views = ids.map((id, i) => {
    const v = createPetView(id, { side: i % 2 ? -1 : 1 });
    scene.add(v.object3d);
    return v;
  });
  let ang = 0;
  actors.push({
    update(dt, t) {
      const R = 16;
      const sp = +opts.speed;
      // run for 5 s, stand for 3 s
      const cyc = t % 8;
      const v = cyc < 5 ? sp : 0;
      ang += (v / R) * dt;
      const x = Math.cos(ang) * R, z = Math.sin(ang) * R;
      owner.vel.x = (x - owner.pos.x) / Math.max(dt, 1e-3);
      owner.vel.z = (z - owner.pos.z) / Math.max(dt, 1e-3);
      if (v === 0) owner.vel.x = owner.vel.z = 0;
      owner.pos.x = x;
      owner.pos.z = z;
      owner.yaw = Math.atan2(-Math.sin(ang), Math.cos(ang));
      av.object3d.position.set(x, 0, z);
      av.object3d.rotation.y = owner.yaw;
      av.update(dt, { time: t, speed: v, onGround: true, vy: 0, carrying: null, stunned: false, swing: -1, celebrating: false, invisible: 1, isLocal: false, coil: false, interacting: null });
      views.forEach((pv, i) => pv.update(dt, owner, t, null));
      const cam = opts.cam || 'orbit';
      if (cam === 'chase') {
        camera.position.set(x - Math.sin(owner.yaw) * 9 + Math.cos(owner.yaw) * 5, 5.5, z - Math.cos(owner.yaw) * 9 - Math.sin(owner.yaw) * 5);
        camera.lookAt(x, 2, z);
      } else {
        camera.position.set(0, 26, 34);
        camera.lookAt(0, 0, 0);
      }
    },
    dispose() {
      scene.remove(av.object3d);
      av.dispose?.();
      views.forEach((v) => v.dispose());
    },
  });
}

function setView(view) {
  clear();
  const [kind, arg] = view.split(':');
  if (kind === 'solo') {
    lineup(arg);
    const a = actors[0].m;
    const cy = a.fly ? 1.2 + a.size.h * 0.1 : a.size.h * 0.5;
    const d = Math.max(a.size.h, a.size.w) * 1.25 + 1.6;
    camera.position.set(d * 0.55, cy + d * 0.28, d * 0.85);
    camera.lookAt(0, cy, 0);
  } else if (kind === 'grid') {
    lineup(null, 3);
    camera.position.set(0, 7.5, 13.5);
    camera.lookAt(0, 1.0, -3.4);
  } else if (kind === 'lineup' || kind === 'front' || kind === 'close') {
    lineup();
    if (kind === 'front') {
      camera.position.set(0, 3.2, 16);
      camera.lookAt(0, 1.4, -2);
    } else if (kind === 'close') {
      const i = Math.max(0, PETS.findIndex((p) => p.id === arg));
      const a = actors[i].m;
      const p = a.root.position;
      camera.position.set(p.x + 2.6, 2.6 + (a.fly ? 1 : 0), p.z + 4.2);
      camera.lookAt(p.x, 1.0 + (a.fly ? 1.1 : 0), p.z);
    } else {
      camera.position.set(9, 6.5, 17);
      camera.lookAt(0, 1.2, -2.2);
    }
  } else if (kind === 'follow') follow();
  else if (kind === 'eggs') {
    EGGS.forEach((e, i) => {
      const egg = createEgg(e.id);
      egg.scale.setScalar(2);
      egg.position.set((i - 1.5) * 2.6, 0, 0);
      scene.add(egg);
      actors.push({ update(dt, t) { egg.rotation.y = t * 0.5 + i; }, dispose: () => scene.remove(egg) });
    });
    camera.position.set(0, 2.6, 9);
    camera.lookAt(0, 1, 0);
  } else if (kind === 'stand') {
    const st = createPetShop();
    st.position.set(0, 0, 0);
    scene.add(st);
    actors.push({ update: (dt, t) => st.update(dt, t), dispose: () => scene.remove(st) });
    const [cx, cy, cz] = (opts.camp || '10,9,14').split(',').map(Number);
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, 5, -9);
  }
}

let time = 0;
function apply(o = {}) {
  Object.assign(opts, parseHash(), o);
  opts.freeze = opts.freeze === true || opts.freeze === '1';
  time = +opts.t || 0;
  setView(opts.view);
  // settle the simulation for a moment so followers are in place
  const settle = +opts.settle || 0;
  for (let i = 0; i < settle * 30; i++) {
    time += 1 / 30;
    for (const a of actors) a.update?.(1 / 30, time);
  }
}
window.addEventListener('hashchange', () => apply());
engine.add((dt) => {
  if (!opts.freeze) time += dt;
  for (const a of actors) a.update?.(opts.freeze ? 0 : dt, time);
  engine.setFocus(camera.position.x * 0.5, 0, camera.position.z * 0.5);
});
window.__gallery = { apply, engine, scene, camera, step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) engine.frame(dt); } };
apply();
engine.start();
