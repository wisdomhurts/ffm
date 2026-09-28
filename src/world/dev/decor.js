// Dev page for the base decorations and the Guard Gnome (world/basedecor.js).
// Build: node build.mjs --entry src/world/dev/decor.js --out <dir>
// URL hash (or window.__decor.apply({...})) picks the view:
//   view=lineup (default: all 16 + guard gnomes, labelled) | pair:<id> (one decoration beside a 5.2-stud kid)
//        | turn:<id> (turntable) | gnome (Guard Gnomes: idle, alert, swinging) | yard (a garden's six front-yard
//        spots, seen from the aisle) | far (every decoration in a row, ~50 studs away) | night:<id>
//   color=<hex> owner colour (default: the four family colours in turn), t=<seconds>, freeze=1, yaw=<radians>,
//   spots=0 hides the 5x5 spot / 4x4 collider outlines, labels=0, kid=0 (gnome view: no kid), ids=a,b,c (lineup subset), quality=low|medium|high,
//   cam=x,y,z and look=x,y,z override the camera.
// Keys: [ and ] step through the views, B bounces the trampolines, S swings the gnomes, A toggles alert.
// window.__decor = {apply(o), engine, scene, camera, step(n, dt), stats(), bounce(), swing(), VIEWS, IDS}
import * as THREE from 'three';
import { Engine, QUALITY } from '../../core/engine.js';
import { CHARACTERS, BASE_STYLES } from '../../config.js';
import { LAYOUT } from '../../gameplay/layout.js';
import { createAvatar } from '../../characters/avatar.js';
import { createDecor, createGuardGnome, DECOR_IDS } from '../basedecor.js';
import { studTexture } from '../textures.js';

const IDS = DECOR_IDS;
const SOLID = new Set((BASE_STYLES?.decor || []).filter((d) => d.solid).map((d) => d.id));
const NAMES = Object.fromEntries((BASE_STYLES?.decor || []).map((d) => [d.id, d.name]));
const FAMILY = CHARACTERS.map((c) => c.color);
const VIEWS = ['lineup', 'far', 'yard', 'gnome', ...IDS.map((id) => 'pair:' + id)];

document.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;background:#000';
const container = document.getElementById('app') || document.body.appendChild(document.createElement('div'));
container.style.cssText = 'position:fixed;inset:0';
const engine = new Engine(container);
const { scene, camera } = engine;
const SKY = new THREE.Color('#8fd3ff');
scene.background = SKY.clone();
scene.fog = new THREE.Fog('#bfe7ff', 180, 480);

// studded lawn
const lawnTex = studTexture().clone();
lawnTex.needsUpdate = true;
lawnTex.repeat.set(150, 150);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#6cc25a', map: lawnTex }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const hud = document.body.appendChild(document.createElement('div'));
hud.style.cssText = 'position:fixed;left:10px;top:8px;color:#fff;font:600 14px system-ui;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';

const opts = {};
function parseHash() {
  const o = {};
  for (const kv of location.hash.replace(/^#/, '').split('&')) {
    if (!kv) continue;
    const [k, v = ''] = kv.split('=');
    o[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return o;
}

let items = []; // {id, obj, x, z}
let actors = []; // {update(dt, t), dispose()}
let gnomes = [];
let quality = engine.quality;

function clear() {
  for (const a of actors) a.dispose?.();
  actors = [];
  items = [];
  gnomes = [];
}

function colorFor(i) {
  return opts.color ? (opts.color.startsWith('#') ? opts.color : '#' + opts.color) : FAMILY[i % FAMILY.length];
}

const lineMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
const solidMat = new THREE.LineBasicMaterial({ color: '#ff3b3b' });
function outline(size, mat, y = 0.05) {
  const h = size / 2;
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-h, y, -h), new THREE.Vector3(h, y, -h), new THREE.Vector3(h, y, -h), new THREE.Vector3(h, y, h),
    new THREE.Vector3(h, y, h), new THREE.Vector3(-h, y, h), new THREE.Vector3(-h, y, h), new THREE.Vector3(-h, y, -h),
  ]);
  return new THREE.LineSegments(g, mat);
}

function label(text, y) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.font = '700 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#1b2440';
  g.strokeText(text, 256, 50);
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(5.2, 0.975, 1);
  s.position.y = y;
  s.renderOrder = 10;
  return s;
}

function place(id, x, z, i, yaw = 0, { spots = opts.spots !== '0', labels = false } = {}) {
  const obj = createDecor(id, { color: colorFor(i), quality });
  obj.position.set(x, 0, z);
  obj.rotation.y = yaw;
  scene.add(obj);
  const extra = [];
  if (spots) {
    const o = outline(5, lineMat);
    o.position.set(x, 0, z);
    o.rotation.y = yaw;
    extra.push(o);
    if (SOLID.has(id)) {
      const s = outline(4, solidMat, 0.07);
      s.position.set(x, 0, z);
      s.rotation.y = yaw;
      extra.push(s);
    }
  }
  if (labels) {
    const l = label(NAMES[id] || id, 13);
    l.position.x = x;
    l.position.z = z;
    extra.push(l);
  }
  extra.forEach((e) => scene.add(e));
  const it = { id, obj, x, z };
  items.push(it);
  actors.push({
    update: (dt, t) => obj.userData.update?.(dt, t),
    dispose: () => {
      scene.remove(obj);
      extra.forEach((e) => scene.remove(e));
    },
  });
  return it;
}

const IDLE = { time: 0, speed: 0, onGround: true, vy: 0, carrying: null, stunned: false, swing: -1, celebrating: false, invisible: 1, isLocal: false, coil: false, interacting: null };
function kid(ci, x, z, yaw = 0) {
  const ch = CHARACTERS[ci % CHARACTERS.length];
  const av = createAvatar(ch, null, ch.look?.skin);
  av.object3d.position.set(x, 0, z);
  av.object3d.rotation.y = yaw;
  scene.add(av.object3d);
  actors.push({
    update(dt, t) {
      IDLE.time = t;
      av.update(dt, IDLE);
    },
    dispose() {
      scene.remove(av.object3d);
      av.dispose?.();
    },
  });
  return av;
}

function guard(i, x, z, yaw, mode) {
  const g = createGuardGnome({ color: colorFor(i) });
  g.object3d.position.set(x, 0, z);
  g.object3d.rotation.y = yaw;
  scene.add(g.object3d);
  let next = 0.6;
  const st = { alert: mode === 'alert' };
  gnomes.push({ g, st, mode });
  actors.push({
    update(dt, t) {
      if (mode === 'swing' && t >= next) {
        g.swing();
        next = t + 1.4;
      }
      g.update(dt, t, st);
    },
    dispose: () => scene.remove(g.object3d),
  });
  return g;
}

function setCam(pos, look) {
  const p = opts.cam ? opts.cam.split(',').map(Number) : pos;
  const l = opts.look ? opts.look.split(',').map(Number) : look;
  camera.position.set(...p);
  camera.lookAt(...l);
  engine.setFocus(l[0], 0, l[2]);
}

function setView(view) {
  clear();
  scene.background.copy(SKY);
  engine.hemi.intensity = 1.25;
  engine.sun.intensity = 2.2;
  const [kind, arg] = view.split(':');
  const yaw = +opts.yaw || 0;
  if (kind === 'lineup') {
    const list = opts.ids ? opts.ids.split(',') : IDS;
    const cols = Math.min(6, list.length);
    list.forEach((id, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      place(id, (c - (cols - 1) / 2) * 8.5, -r * 12, i, yaw, { labels: opts.labels !== '0' });
    });
    const rows = Math.ceil(list.length / cols);
    guard(0, -30, 4, 0, 'idle');
    guard(1, -27, 4, 0, 'alert');
    guard(2, -24, 4, 0, 'swing');
    setCam([0, 20 + rows * 4, 26 + rows * 3], [0, 3, -(rows - 1) * 6 - 2]);
  } else if (kind === 'far') {
    IDS.forEach((id, i) => place(id, (i - (IDS.length - 1) / 2) * 7, 0, i, yaw));
    kid(0, -60, 3);
    guard(1, 58, 3, 0, 'alert');
    setCam([0, 22, 52], [0, 3, 0]);
  } else if (kind === 'pair' || kind === 'turn' || kind === 'night') {
    const id = IDS.includes(arg) ? arg : IDS[0];
    const it = place(id, 0, 0, 0, yaw);
    const box = new THREE.Box3().setFromObject(it.obj);
    const h = Math.max(box.max.y, 5.2);
    kid(+opts.char || 0, 4.1, 1.0, -0.35);
    if (kind === 'turn') actors.push({ update: (dt, t) => (it.obj.rotation.y = yaw + t * 0.6) });
    if (kind === 'night') {
      scene.background.set('#141038');
      engine.hemi.intensity = 0.35;
      engine.sun.intensity = 0.25;
    }
    const d = 7 + h * 0.95;
    setCam([1.5 + d * 0.32, h * 0.62 + 1.2, d], [1.3, h * 0.45, 0]);
  } else if (kind === 'gnome') {
    guard(0, -3.2, 0, 0, opts.alert === '1' ? 'alert' : 'idle');
    guard(1, 0, 0, 0, 'alert');
    guard(2, 3.2, 0, 0, opts.swing === '0' ? 'idle' : 'swing');
    if (opts.kid !== '0') kid(3, 6.6, 0.4, -0.3);
    setCam([1.2, 3.4, 10.5], [1.2, 1.6, 0]);
  } else if (kind === 'yard') {
    const L = LAYOUT.gardens[+opts.slot || 0];
    const face = L.inward < 0 ? Math.PI / 2 : -Math.PI / 2; // towards the gate
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(24, 0.06, L.bounds.maxZ - L.bounds.minZ), new THREE.MeshLambertMaterial({ color: '#86d863' }));
    lawn.position.set(L.gate.x + L.inward * 12, 0.03, L.center.z);
    lawn.receiveShadow = true;
    scene.add(lawn);
    actors.push({ dispose: () => scene.remove(lawn) });
    const pick = opts.ids ? opts.ids.split(',') : ['oak', 'windmill', 'fountain', 'rocket', 'trampoline', 'hottub'];
    L.decor.forEach((s, i) => place(pick[i % pick.length], s.x, s.z, L.slot, face));
    guard(L.slot, L.guard.x, L.guard.z, face, 'alert');
    kid(L.slot, L.gate.x + L.inward * 4, L.center.z + 2, face);
    const cx = L.gate.x - L.inward * 30, cz = L.center.z + 26;
    setCam([cx, 24, cz], [L.gate.x + L.inward * 12, 2, L.center.z]);
  }
}

let time = 0;
function apply(o = {}) {
  for (const k of Object.keys(opts)) delete opts[k];
  Object.assign(opts, { view: 'lineup' }, parseHash(), o);
  opts.freeze = opts.freeze === true || opts.freeze === '1';
  quality = QUALITY[opts.quality] || engine.quality;
  time = +opts.t || 0;
  setView(opts.view);
}
window.addEventListener('hashchange', () => apply());
addEventListener('keydown', (e) => {
  if (e.key === ']' || e.key === '[') {
    const i = Math.max(0, VIEWS.indexOf(opts.view));
    location.hash = 'view=' + VIEWS[(i + (e.key === ']' ? 1 : VIEWS.length - 1)) % VIEWS.length];
  } else if (e.key === 'b' || e.key === 'B') bounce();
  else if (e.key === 's' || e.key === 'S') swing();
  else if (e.key === 'a' || e.key === 'A') gnomes.forEach((x) => (x.st.alert = !x.st.alert));
});
function bounce() {
  items.forEach((it) => it.obj.userData.bounce?.());
}
function swing() {
  gnomes.forEach((x) => x.g.swing());
}
function stats() {
  return items.map((it) => {
    let meshes = 0;
    const mats = new Set(), geos = new Set();
    it.obj.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        mats.add(o.material);
        geos.add(o.geometry);
      }
    });
    const box = new THREE.Box3().setFromObject(it.obj);
    return { id: it.id, drawCalls: meshes, animated: !!it.obj.userData.update, size: box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), minY: +box.min.y.toFixed(2) };
  });
}

engine.add((dt) => {
  if (!opts.freeze) time += dt;
  const d = opts.freeze ? 0 : dt;
  for (const a of actors) a.update?.(d, time);
  hud.textContent = `${opts.view}  |  calls ${engine.renderer.info.render.calls}  tris ${engine.renderer.info.render.triangles}  fps ${engine.fps.toFixed(0)}\n[ ] views   B bounce   S swing   A alert`;
});
window.__decor = {
  apply,
  engine,
  scene,
  camera,
  step: (n = 1, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) engine.frame(dt);
    const gl = engine.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  },
  stats,
  bounce,
  swing,
  createDecor,
  createGuardGnome,
  VIEWS,
  IDS,
};
apply();
engine.start();
