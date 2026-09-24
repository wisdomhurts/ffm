// Dev gallery for the characters module: the four family avatars (with photo faces when the page is
// family.html) and the five road monsters on a studded baseplate.
// URL hash (or window.__gallery.apply({...})) controls what is shown:
//   view=family|lineup|lineup34|monsters|all|close:<id>|close34:<id>|side:<id>|back:<id>|game[:dist]|game34|behind|monster:<type>|faces
//   state=idle|walk|run|sprint|jump|fall|carry|swing|stunned|celebrate|steal|grab|invisible|coil|mix|cycle
//   swing=<0..1> (frozen swing phase)   mstate=patrol|chase|stunned|attack   freeze=1   t=<seconds>
//   settle=<seconds> (animation simulated before the shot, default 1)
// Build: node build.mjs --entry src/characters/dev/gallery.js --out <dir>
import * as THREE from 'three';
import { Engine } from '../../core/engine.js';
import { CHARACTERS } from '../../config.js';
import { createAvatar } from '../avatar.js';
import { createMonster } from '../monsters.js';
import { getFace, composeFaceCanvas, FACE_LAYOUT } from '../faces.js';

const MONSTERS = ['stump', 'crab', 'snapper', 'lavasprout', 'lurker'];

document.body.style.margin = '0';
const container = document.getElementById('app') || document.body.appendChild(document.createElement('div'));
container.style.cssText = 'position:fixed;inset:0';
const engine = new Engine(container);
const { scene, camera } = engine;
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#bfe7ff', 120, 320);

// ---- studded baseplate
function studTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#6cc25a';
  g.fillRect(0, 0, 64, 64);
  const grd = g.createRadialGradient(28, 28, 4, 32, 32, 20);
  grd.addColorStop(0, '#86d873');
  grd.addColorStop(1, '#5fb24e');
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.arc(34, 35, 19, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = grd;
  g.beginPath();
  g.arc(32, 32, 18, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(200, 200);
  t.anisotropy = 8;
  return t;
}
const plate = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: studTexture(), roughness: 0.8 }));
plate.rotation.x = -Math.PI / 2;
plate.receiveShadow = true;
scene.add(plate);

// ---- a stand-in carried item (plant pot with a sprout)
function testCarry() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.65, 1.1, 12), new THREE.MeshStandardMaterial({ color: '#d9784a', roughness: 0.7 }));
  pot.position.y = 0.55;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#5fd35a', roughness: 0.6 }));
  leaf.position.y = 1.5;
  leaf.scale.set(1, 0.7, 1);
  g.add(pot, leaf);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

// ---- actors
const avatars = CHARACTERS.map((c, i) => {
  const av = createAvatar(c, null, c.look.skin);
  av.object3d.position.set((i - 1.5) * 5.5, 0, 0);
  scene.add(av.object3d);
  const carry = testCarry();
  getFace(c.id).then((f) => {
    av.setFace(f.face, f.skin);
    faceInfo[c.id] = f;
  });
  return { av, char: c, carry, carrying: false };
});
const faceInfo = {};
const monsters = MONSTERS.map((type, i) => {
  const m = createMonster(type);
  m.object3d.position.set((i - 2) * 10, 0, -12);
  scene.add(m.object3d);
  return { m, type };
});

// ---- options
const opts = { view: 'all', state: 'cycle', swing: null, mstate: 'cycle', freeze: false, t: 0 };
function parseHash() {
  const o = {};
  for (const kv of location.hash.replace(/^#/, '').split('&')) {
    if (!kv) continue;
    const [k, v = ''] = kv.split('=');
    o[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return o;
}

const STATES = ['idle', 'walk', 'run', 'sprint', 'jump', 'carry', 'swing', 'stunned', 'celebrate', 'steal', 'grab', 'coil', 'invisible'];
const MIX = ['run', 'carry', 'swing', 'stunned'];

function avatarState(name, time, i) {
  const s = { time, speed: 0, onGround: true, vy: 0, carrying: null, stunned: false, swing: -1, celebrating: false, invisible: 1, isLocal: false, coil: false, interacting: null };
  switch (name) {
    case 'walk': s.speed = 7; break;
    case 'run': s.speed = 18; break;
    case 'sprint': s.speed = 60; break;
    case 'jump': s.onGround = false; s.vy = 35; break;
    case 'fall': s.onGround = false; s.vy = -40; break;
    case 'carry': s.carrying = 'plant'; s.speed = 12; break;
    case 'carryidle': s.carrying = 'seed'; break;
    case 'swing': s.swing = opts.swing != null ? opts.swing : (time % 1.1) / 0.35 <= 1 ? (time % 1.1) / 0.35 : -1; break;
    // one swing from the back at t = 2.2 s, then the ready hold and the holster (use settle=<seconds>)
    case 'draw': s.swing = time >= 2.2 && time <= 2.55 ? (time - 2.2) / 0.35 : -1; s.speed = +opts.speed || 0; break;
    case 'stunned': s.stunned = true; break;
    case 'celebrate': s.celebrating = true; break;
    case 'steal': s.interacting = 'Steal'; break;
    case 'grab': s.interacting = 'Grab'; break;
    case 'coil': s.coil = true; s.speed = 30; break;
    case 'invisible': s.invisible = 0.4; s.speed = 14; break;
    default: break;
  }
  return s;
}

function monsterState(name, time) {
  const s = { time, speed: 0, state: 'patrol', attackAge: 10 };
  const n = name === 'cycle' ? ['patrol', 'chase', 'attack', 'stunned'][Math.floor(time / 3) % 4] : name;
  if (n === 'patrol') s.speed = 6;
  if (n === 'chase') s.speed = 24;
  if (n === 'chase' || n === 'attack') s.state = 'chase';
  if (n === 'attack') {
    s.speed = 10;
    s.attackAge = time % 1.2;
  }
  if (n === 'stunned') s.state = 'stunned';
  return s;
}

function setCamera(view) {
  const [kind, arg] = view.split(':');
  const idx = Math.max(0, CHARACTERS.findIndex((c) => c.id === arg));
  const ax = (idx - 1.5) * 5.5;
  const S = avatars[idx].av.scale || 0.87;
  // head centre: just under the head-top anchor (kids have bigger heads on smaller bodies)
  const headY = avatars[idx].av.headTop.position.y - 0.95 * (S / 0.8667);
  switch (kind) {
    case 'family':
      camera.position.set(0, 5, 17);
      camera.lookAt(0, 3, 0);
      break;
    case 'lineup':
      // front-facing family photo at ~12 studs, camera at head height
      camera.position.set(0, 4.3, 12);
      camera.lookAt(0, 3.4, 0);
      break;
    case 'lineup34':
      camera.position.set(8, 4.6, 9);
      camera.lookAt(0, 3.2, 0);
      break;
    case 'close':
      camera.position.set(ax, headY + 0.3, 5.2);
      camera.lookAt(ax, headY, 0);
      break;
    case 'close34':
      camera.position.set(ax + 3.6, headY + 0.4, 3.9);
      camera.lookAt(ax, headY - 0.1, 0);
      break;
    case 'side':
      camera.position.set(ax + 5, headY + 0.6, 5.5);
      camera.lookAt(ax, headY - 0.9, 0);
      break;
    case 'profile':
      camera.position.set(ax - 10, 3.6, 1.5);
      camera.lookAt(ax, 3.4, 1.5);
      break;
    case 'back':
      camera.position.set(ax + 3, 5.5, -8);
      camera.lookAt(ax, 3, 0);
      break;
    case 'backr':
      // behind the right (noodle) shoulder, like the follow camera slightly off to the side
      camera.position.set(ax - 4, 6, -8.5);
      camera.lookAt(ax, 3.3, 0);
      break;
    case 'game': {
      // gameplay follow-camera distance (~20 studs, pitch 0.42) looking at the family from the front
      const d = +(arg || 20);
      camera.position.set(0, 4.2 + Math.sin(0.42) * d, Math.cos(0.42) * d);
      camera.lookAt(0, 4.2, 0);
      break;
    }
    case 'game34': {
      const d = +(arg || 20);
      const a = 0.75;
      camera.position.set(Math.sin(a) * Math.cos(0.42) * d, 4.2 + Math.sin(0.42) * d, Math.cos(a) * Math.cos(0.42) * d);
      camera.lookAt(0, 4.2, 0);
      break;
    }
    case 'behind': {
      // the local player's view: follow camera behind the family
      const d = +(arg || 20);
      camera.position.set(0, 4.2 + Math.sin(0.42) * d, -Math.cos(0.42) * d);
      camera.lookAt(0, 4.2, 0);
      break;
    }
    case 'monsters':
      camera.position.set(0, 8, 16);
      camera.lookAt(0, 2.2, -12);
      break;
    case 'monster': {
      const mi = Math.max(0, MONSTERS.indexOf(arg));
      const mx = (mi - 2) * 10;
      camera.position.set(mx + 3.5, 4.5, -3.5);
      camera.lookAt(mx, 2.4, -12);
      break;
    }
    default:
      camera.position.set(0, 12, 26);
      camera.lookAt(0, 2.5, -4);
  }
  engine.setFocus(camera.position.x * 0.5, 0, -4);
  if (opts.sun === 'front') engine.sunOffset.set(30, 70, 45);
  else engine.sunOffset.set(40, 80, -30);
  engine.setFocus(camera.position.x * 0.5, 0, -4);
}

let faceEl = null;
function showFaces(on) {
  if (!on) {
    faceEl?.remove();
    faceEl = null;
    return;
  }
  if (faceEl) faceEl.remove();
  faceEl = document.createElement('div');
  faceEl.style.cssText = 'position:fixed;inset:0;background:#222;display:flex;flex-wrap:wrap;gap:8px;padding:8px;z-index:5';
  for (const c of CHARACTERS) {
    const f = faceInfo[c.id];
    for (const layout of ['head', 'flat']) {
      const cv = composeFaceCanvas(f?.face || null, f?.skin || c.look.skin, 256, { layout: FACE_LAYOUT[layout] });
      cv.style.cssText = 'width:300px;height:300px';
      faceEl.appendChild(cv);
    }
  }
  document.body.appendChild(faceEl);
}

function apply(o = {}) {
  Object.assign(opts, parseHash(), o);
  opts.freeze = opts.freeze === true || opts.freeze === '1';
  opts.swing = opts.swing == null || opts.swing === '' ? null : +opts.swing;
  opts.t = +opts.t || 0;

  showFaces(opts.view === 'faces');
  // settle poses: simulate a second of animation at 60 fps, then (optionally) freeze
  engine.timeScale = 1;
  simTime = opts.t;
  const n = Math.round((+opts.settle || 1) * 60);
  for (let i = 0; i < n; i++) step(1 / 60);
  setCamera(opts.view);
  engine.timeScale = opts.freeze ? 0 : 1;
  engine.frame(0);
}

let simTime = 0;
function step(dt) {
  simTime += dt;
  const t = simTime;
  avatars.forEach((a, i) => {
    let st = opts.state;
    if (st === 'cycle') st = STATES[Math.floor(t / 2.5) % STATES.length];
    if (st === 'mix') st = MIX[i % MIX.length];
    const s = avatarState(st, t, i);
    const carrying = !!s.carrying;
    if (carrying !== a.carrying) {
      a.carrying = carrying;
      a.av.setCarry(carrying ? a.carry : null);
    }
    a.av.update(dt, s);
    if (/^monster/.test(opts.view) || (opts.solo && opts.solo !== a.char.id)) a.av.object3d.visible = false;
  });
  monsters.forEach(({ m }) => m.update(dt, monsterState(opts.mstate, t)));
}

engine.add((dt) => {
  if (dt > 0) step(dt);
});
window.addEventListener('hashchange', () => apply());
// live face-framing tuning: __gallery.setLayout({scale, eyeY})
function setLayout(o) {
  Object.assign(FACE_LAYOUT.head, o);
  for (const a of avatars) {
    const f = faceInfo[a.char.id];
    if (f) a.av.setFace(f.face, f.skin);
  }
}
window.__gallery = { apply, setLayout, engine, avatars, monsters, THREE, createAvatar, createMonster, composeFaceCanvas, FACE_LAYOUT, ready: Promise.all(CHARACTERS.map((c) => getFace(c.id))).then(() => new Promise((r) => setTimeout(r, 50))) };
apply();
engine.start();
