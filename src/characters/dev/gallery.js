// Dev gallery for the characters module: the four family avatars (with photo faces when the page is
// family.html) and the five road monsters on a studded baseplate, plus contact sheets of every
// Wardrobe look, hat, accessory, hair style, face, trail and emote.
// URL hash (or window.__gallery.apply({...})) controls what is shown:
//   view=family|lineup|lineup34|monsters|all|close:<id>|close34:<id>|side:<id>|back:<id>|backr:<id>|back34:<id>|rside:<id>|lside:<id>|game[:dist]|game34|behind|monster:<type>|faces
//   state=idle|walk|run|sprint|jump|fall|carry|swing|stunned|celebrate|steal|grab|invisible|coil|mix|cycle|emote:<id>
//   swing=<0..1> (frozen swing phase)   mstate=patrol|chase|stunned|attack   freeze=1   t=<seconds>
//   settle=<seconds> (animation simulated before the shot, default 1)
// Contact sheets (view=sheet): sheet=hats|accs|hair|shirts|looks|emotes|trails|expressions  page=<n>
//   angle=front|back|34  state=... (as above)   e.g. #view=sheet&sheet=hats&page=0
//   view=clip (runs the emote clipping check; results in window.__clip and the console)
// Build: node build.mjs --entry src/characters/dev/gallery.js --out <dir>
import * as THREE from 'three';
import { Engine } from '../../core/engine.js';
import { CHARACTERS, CHARACTER } from '../../config.js';
import { createAvatar } from '../avatar.js';
import { createMonster } from '../monsters.js';
import { getFace, composeFaceCanvas, FACE_LAYOUT } from '../faces.js';
import { HATS, ACCS, HAIR, SHIRTS, FACES, TRAILS, randomLook, baseLook } from '../cosmetics.js';
import { EMOTE_ANIM } from '../emotes.js';
import { createBoutique } from '../../world/boutique.js';

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
    // ...and a second swing at 4.05 s that interrupts the holster
    case 'redraw': s.swing = time >= 2.2 && time <= 2.55 ? (time - 2.2) / 0.35 : time >= 4.05 && time <= 4.4 ? (time - 4.05) / 0.35 : -1; break;
    case 'stunned': s.stunned = true; break;
    case 'celebrate': s.celebrating = true; break;
    case 'steal': s.interacting = 'Steal'; break;
    case 'grab': s.interacting = 'Grab'; break;
    case 'coil': s.coil = true; s.speed = 30; break;
    case 'invisible': s.invisible = 0.4; s.speed = 14; break;
    default:
      if (name.startsWith('emote:')) {
        s.emote = name.slice(6);
        s.emoteT = time;
      }
      break;
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
    case 'rside':
    case 'lside': {
      // straight side-on (right or left profile), close: how the noodle sits on the back (use solo=<id>)
      const sx = kind === 'rside' ? -1 : 1;
      camera.position.set(ax + sx * 6.5, headY - 0.9, -0.6);
      camera.lookAt(ax, headY - 1.6, -0.6);
      break;
    }
    case 'back34': {
      // over the right shoulder from behind and above, close (use solo=<id>)
      camera.position.set(ax - 3.3, headY + 1.3, -4.4);
      camera.lookAt(ax, headY - 1.4, 0);
      break;
    }
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

// ------------------------------------------------------------------ contact sheets

const sheetRoot = new THREE.Group();
scene.add(sheetRoot);
let sheet = null; // {cells: [{av, look, state, t, label}], key}
let labelsEl = null;
let boutique = null;

const FAM = (id) => baseLook(id);
const COMBOS = [
  ['adult, short', { ...FAM('dorian') }],
  ['adult, long', { ...FAM('esther'), shirt: 'tee', shirtColor: '#5cc8ff', shirtColor2: '#ffffff', legs: 'jeans', pants: '#2b3a55', shoes: '#ffffff' }],
  ['kid, short', { ...FAM('micah') }],
  ['kid, long', { ...FAM('maddie') }],
];

function sheetSpec(name, page) {
  const cells = [];
  const combos = opts.combo != null && opts.combo !== '' ? [COMBOS[+opts.combo]] : COMBOS;
  const per = (list, n) => list.slice(page * n, page * n + n);
  if (name === 'hats') {
    // every hat on adult + kid builds with short and long hair
    const hats = per(HATS, 7);
    for (const [label, base] of combos) for (const hat of hats) cells.push({ look: { ...base, hat: hat.id, face: 'smile' }, label: hat.name + ' / ' + label });
    return { cells, cols: hats.length };
  }
  if (name === 'hathair') {
    // one hat per column across every hair style
    const hats = ['cap', 'beanie', 'tophat', 'crown', 'headphones', 'cowboy'];
    for (const hair of per(HAIR, 6)) for (const hat of hats) cells.push({ look: { ...FAM('dorian'), hair: hair.id, hat, face: 'grin' }, label: hair.name + ' + ' + hat });
    return { cells, cols: hats.length };
  }
  if (name === 'accs') {
    const accs = per(ACCS, 5);
    for (const [label, base] of combos) for (const acc of accs) cells.push({ look: { ...base, acc: acc.id, face: 'smile' }, label: acc.name + ' / ' + label });
    return { cells, cols: accs.length };
  }
  if (name === 'hair') {
    const rows = [['adult', { ...FAM('dorian'), face: 'smile', hairColor: '#5a3b28' }], ['kid', { ...FAM('maddie'), face: 'happy', hairColor: '#e2b85c' }]];
    const pick = opts.combo !== '' && opts.combo != null ? [rows[+opts.combo]] : rows;
    const list = per(HAIR, 6);
    for (const [label, base] of pick) for (const hair of list) cells.push({ look: { ...base, hair: hair.id }, label: hair.name + ' / ' + label });
    return { cells, cols: list.length };
  }
  if (name === 'shirts') {
    const cols = [['#e8323c', '#ffffff'], ['#2f80ed', '#ffd23f'], ['#2fb84f', '#1d1d1d'], ['#8a5cc8', '#ffb3d1']];
    const legs = ['jeans', 'pants', 'shorts', 'skirt'];
    SHIRTS.forEach((sh, i) => {
      const [c1, c2] = cols[i % cols.length];
      cells.push({ look: { ...FAM(i % 2 ? 'maddie' : 'dorian'), shirt: sh.id, shirtColor: c1, shirtColor2: c2, legs: legs[i % 4], pants: ['#2b3a55', '#c8b48a', '#1d1d1d', '#ff4f9a'][i % 4], face: 'smile', num: 7 + i }, label: sh.name + ' + ' + legs[i % 4] });
    });
    return { cells, cols: 6 };
  }
  if (name === 'looks') {
    let seed = 7 + page * 101;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const all = { unlocks: [...HATS.map((x) => 'hat:' + x.id), ...ACCS.map((x) => 'acc:' + x.id), ...HAIR.map((x) => 'hair:' + x.id), ...SHIRTS.map((x) => 'shirt:' + x.id), ...FACES.map((x) => 'face:' + x.id), ...TRAILS.map((x) => 'trail:' + x.id)] };
    for (let i = 0; i < 12; i++) {
      const base = CHARACTERS[i % 4].id;
      const l = randomLook({ ...all, base }, { ...FAM(base), face: 'smile' }, r);
      l.build = r() < 0.5 ? 'kid' : 'adult';
      cells.push({ look: l, label: `#${i}` });
    }
    return { cells, cols: 6 };
  }
  if (name === 'expressions') {
    for (const f of FACES.filter((x) => x.id !== 'photo')) cells.push({ look: { ...FAM(cells.length % 2 ? 'micah' : 'dorian'), face: f.id }, label: f.name });
    return { cells, cols: 6, close: true };
  }
  if (name === 'emotes') {
    // frames of each emote (rows) over time (columns); page 0 = adult short hair, 1 = kid long hair
    const ids = opts.emotes ? String(opts.emotes).split(',') : Object.keys(EMOTE_ANIM);
    const base = page % 2 ? { ...FAM('maddie'), face: 'happy' } : { ...FAM('dorian'), face: 'grin' };
    const times = { wave: [0.2, 0.5, 0.8, 1.1, 1.6], cheer: [0.2, 0.45, 0.65, 1.0, 1.7], laugh: [0.3, 0.6, 1.0, 1.3, 1.7], point: [0.1, 0.3, 0.42, 0.8, 1.4], dance1: [0.5, 1.1, 2.25, 3.1, 3.75], dance2: [0.2, 0.7, 1.2, 2.2, 3.7], dance3: [0.1, 0.28, 0.46, 0.64, 1.0], sit: [0.1, 0.25, 0.4, 1.0, 3.0] };
    for (const id of ids) for (const t of times[id]) cells.push({ look: base, state: 'emote:' + id, t, label: `${id} ${t}s` });
    return { cells, cols: 5 };
  }
  if (name === 'trails') {
    TRAILS.forEach((tr, i) => cells.push({ look: { ...FAM(CHARACTERS[i % 4].id), trail: tr.id, face: 'happy' }, state: 'runplace', label: tr.name }));
    return { cells, cols: 3 };
  }
  return { cells, cols: 4 };
}

function clearSheet() {
  if (!sheet) return;
  for (const c of sheet.cells) {
    sheetRoot.remove(c.av.object3d);
    c.av.dispose();
  }
  sheet = null;
  labelsEl?.remove();
  labelsEl = null;
}

function buildSheet(name, page) {
  const key = name + ':' + page + ':' + (opts.combo ?? '') + ':' + (opts.emotes || '');
  if (sheet?.key === key) return sheet;
  clearSheet();
  const spec = sheetSpec(name, page);
  const cols = spec.cols;
  const dx = spec.close ? 4.2 : name === 'trails' ? 8 : 5.2;
  const dy = spec.close ? 3.4 : 8;
  const rows = Math.ceil(spec.cells.length / cols);
  spec.cells.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const base = CHARACTER[c.look.base || 'dorian'] || CHARACTERS[0];
    c.av = createAvatar(base, null, c.look.skin, c.look);
    c.pos = new THREE.Vector3((col - (cols - 1) / 2) * dx, (rows - 1 - row) * dy, 0);
    c.av.object3d.position.copy(c.pos);
    sheetRoot.add(c.av.object3d);
  });
  sheet = { key, cells: spec.cells, cols, rows, dx, dy, close: spec.close, name };
  return sheet;
}

function sheetCamera() {
  const s = sheet;
  const w = s.cols * s.dx;
  const hgt = s.rows * s.dy;
  // angles turn the avatars (the camera stays straight on, so every cell is framed alike)
  const turn = { back: Math.PI, 34: 0.62, side: Math.PI / 2, back34: Math.PI - 0.7 }[opts.angle] || 0;
  const back = false;
  const a34 = false;
  const heads = opts.zoom === 'head';
  const cy = heads ? ((s.rows - 1) * s.dy) / 2 + 4.6 : ((s.rows - 1) * s.dy) / 2 + (s.close ? 4.3 : 2.9);
  const fov = camera.fov * (Math.PI / 180);
  const dist = heads
    ? Math.max((hgt - s.dy + 3.8) / 2 / Math.tan(fov / 2), w / 2 / Math.tan(fov / 2) / camera.aspect) * 1.02 + 2
    : Math.max(hgt / 2 / Math.tan(fov / 2), w / 2 / Math.tan(fov / 2) / camera.aspect) * 1.08 + 4;
  const dir = back ? -1 : 1;
  camera.position.set(a34 ? dist * 0.35 : 0, cy + (heads ? 0.3 : 1), dir * dist * (a34 ? 0.94 : 1));
  camera.lookAt(0, cy, 0);
  engine.setFocus(0, cy, 0);
  // face every cell the same way relative to the camera (no perspective skew along the row)
  for (const c of s.cells) c.av.object3d.rotation.y = turn + Math.atan2(camera.position.x - c.pos.x, camera.position.z - c.pos.z);
}

function sheetLabels() {
  labelsEl?.remove();
  labelsEl = document.createElement('div');
  labelsEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:700 11px/1.1 system-ui,sans-serif;color:#10163a;z-index:4';
  camera.updateMatrixWorld();
  const W = innerWidth;
  const H = innerHeight;
  for (const c of sheet.cells) {
    const p = c.pos.clone();
    p.y -= opts.zoom === 'head' ? -2.6 : sheet.close ? -2.2 : 0.35;
    p.project(camera);
    const el = document.createElement('div');
    el.textContent = c.label;
    el.style.cssText = `position:absolute;left:${((p.x + 1) / 2) * W}px;top:${((1 - p.y) / 2) * H}px;transform:translateX(-50%);background:rgba(255,255,255,.8);padding:1px 4px;border-radius:4px;white-space:nowrap`;
    labelsEl.appendChild(el);
  }
  document.body.appendChild(labelsEl);
}

function stepSheet(dt) {
  if (!sheet) return;
  for (const c of sheet.cells) {
    const st = c.state || opts.state;
    const t = c.t != null ? c.t : simTime;
    let s;
    if (st === 'runplace') s = { time: t, speed: 24, onGround: true, inPlace: true };
    else s = avatarState(st === 'cycle' ? 'idle' : st, t, 0);
    c.av.update(dt, s);
  }
}

// Emote clipping check: samples each emote over time for adult/kid builds and measures how deep arm
// boxes sink into the torso and head (in rig studs, ignoring the rounded corners' 0.1).
function clipCheck() {
  const out = {};
  const probe = (av, names) => {
    const found = {};
    av.object3d.traverse((o) => {
      if (o.isMesh && names.includes(o.name)) (found[o.name] ||= []).push(o);
    });
    return found;
  };
  const pts = (() => {
    const a = [];
    for (let x = -0.45; x <= 0.451; x += 0.15) for (let y = -0.95; y <= 0.951; y += 0.19) for (let z = -0.45; z <= 0.451; z += 0.15) a.push(new THREE.Vector3(x, y, z));
    return a;
  })();
  const inv = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (const [label, look] of [['adult', FAM('dorian')], ['kid', FAM('maddie')]]) {
    const av = createAvatar(CHARACTER[label === 'kid' ? 'maddie' : 'dorian'], null, look.skin, look);
    scene.add(av.object3d);
    for (const id of Object.keys(EMOTE_ANIM)) {
      let worst = 0;
      let worstT = 0;
      let worstWhat = '';
      for (let t = 0; t < 4; t += 0.05) {
        for (let k = 0; k < 3; k++) av.update(1 / 60, { time: t, speed: 0, onGround: true, emote: id, emoteT: t });
        av.object3d.updateMatrixWorld(true);
        const f = probe(av, ['arm', 'torso', 'head']);
        // rounded boxes (half extents, corner radius) as signed distance fields
        const body = [[f.torso[0], [1, 1, 0.5], 0.1], [f.head[0], [1.1, 1.06, 0.975], 0.4]];
        for (const arm of f.arm) {
          for (const [b, half, rr] of body) {
            inv.copy(b.matrixWorld).invert();
            for (const p of pts) {
              v.copy(p).applyMatrix4(arm.matrixWorld).applyMatrix4(inv);
              const qx = Math.abs(v.x) - (half[0] - rr);
              const qy = Math.abs(v.y) - (half[1] - rr);
              const qz = Math.abs(v.z) - (half[2] - rr);
              const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
              const sd = outside + Math.min(Math.max(qx, qy, qz), 0) - rr;
              const d = -sd;
              if (d > worst) {
                worst = d;
                worstT = t;
                worstWhat = b.name + (arm.parent.position.x < 0 ? ' (R arm)' : ' (L arm)');
              }
            }
          }
        }
      }
      out[label + ':' + id] = { depth: +worst.toFixed(2), t: +worstT.toFixed(2), into: worstWhat };
    }
    scene.remove(av.object3d);
    av.dispose();
  }
  window.__clip = out;
  console.log('[clip]', JSON.stringify(out));
  return out;
}

function apply(o = {}) {
  Object.assign(opts, { combo: '', zoom: '', angle: '', page: 0, solo: '', emotes: '' }, parseHash(), o);
  opts.freeze = opts.freeze === true || opts.freeze === '1';
  opts.swing = opts.swing == null || opts.swing === '' ? null : +opts.swing;
  opts.t = +opts.t || 0;

  const sheetView = opts.view === 'sheet';
  const boutiqueView = opts.view === 'boutique';
  if (sheetView) buildSheet(opts.sheet || 'hats', +opts.page || 0);
  else clearSheet();
  for (const a of avatars) a.av.object3d.visible = !sheetView && !boutiqueView;
  for (const m of monsters) m.m.object3d.visible = !sheetView && !boutiqueView;
  plate.visible = !sheetView;
  scene.background = new THREE.Color(sheetView ? '#dfe9ff' : '#8fd3ff');
  engine.sun.castShadow = !sheetView && engine.quality.shadows;
  if (boutiqueView && !boutique) {
    boutique = createBoutique();
    scene.add(boutique);
  }
  if (boutique) boutique.visible = boutiqueView;
  if (opts.view === 'clip') clipCheck();

  showFaces(opts.view === 'faces');
  // settle poses: simulate a second of animation at 60 fps, then (optionally) freeze
  engine.timeScale = 1;
  simTime = opts.t;
  const n = Math.round((+opts.settle || 1) * 60);
  for (let i = 0; i < n; i++) step(1 / 60);
  if (sheetView) sheetCamera();
  else if (boutiqueView) {
    const a = opts.angle === 'side' ? 0.9 : opts.angle === 'far' ? 0.25 : 0.3;
    const d = opts.angle === 'far' ? 30 : 17;
    camera.position.set(Math.sin(a) * d, opts.angle === 'low' ? 5 : 11, -6 + Math.cos(a) * d);
    camera.lookAt(0, 5.5, -9);
    engine.setFocus(0, 0, 0);
  } else setCamera(opts.view);
  engine.timeScale = opts.freeze ? 0 : 1;
  engine.frame(0);
  if (sheetView) sheetLabels();
}

let simTime = 0;
function step(dt) {
  simTime += dt;
  const t = simTime;
  const hideFamily = opts.view === 'sheet' || opts.view === 'boutique';
  avatars.forEach((a, i) => {
    if (hideFamily) {
      a.av.object3d.visible = false;
      return;
    }
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
  stepSheet(dt);
  boutique?.userData.update?.(dt, t);
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
window.__gallery = { apply, setLayout, clipCheck, get sheet() { return sheet; }, engine, avatars, monsters, THREE, createAvatar, createMonster, composeFaceCanvas, FACE_LAYOUT, ready: Promise.all(CHARACTERS.map((c) => getFace(c.id))).then(() => new Promise((r) => setTimeout(r, 50))) };
apply();
engine.start();
