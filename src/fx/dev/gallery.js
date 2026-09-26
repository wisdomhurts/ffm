// FX gallery: a standalone page that fires every effect on a loop over a studded baseplate.
// Build: node build.mjs --entry src/fx/dev/gallery.js --out <dir>
// Hooks: window.__fire(kind, opts), window.__float(text, opts), window.__emit(event, payload), window.__loop(on),
//        window.__cam(x, y, z, tx, ty, tz), window.__fx, window.__engine, window.__fake (fake game for continuous fx)
import * as THREE from 'three';
import { Engine } from '../../core/engine.js';
import { bus } from '../../core/events.js';
import { CHARACTERS } from '../../config.js';
import { createEffects } from '../effects.js';
import { createBanana, createBalloon, createNoodle } from '../props.js';

const app = document.getElementById('app') || document.body.appendChild(document.createElement('div'));
app.id = 'app';
app.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#8fd3ff';

const engine = new Engine(app);
const scene = engine.scene;
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#bfe7ff', 120, 320);

// studded baseplate
function studTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#6fc25a';
  x.fillRect(0, 0, 64, 64);
  const g = x.createRadialGradient(28, 28, 2, 32, 32, 18);
  g.addColorStop(0, '#8fdc76');
  g.addColorStop(1, '#5aa84a');
  x.fillStyle = g;
  x.beginPath();
  x.arc(32, 32, 17, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.12)';
  x.lineWidth = 2;
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(100, 100);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ map: studTexture() }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// a planter box and a collect pad for context
const planter = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 4), new THREE.MeshLambertMaterial({ color: '#9b6a3c' }));
planter.position.set(-6, 0.6, 9);
planter.castShadow = planter.receiveShadow = true;
scene.add(planter);
const soil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 3.4), new THREE.MeshLambertMaterial({ color: '#5a3a22' }));
soil.position.set(-6, 1.21, 9);
scene.add(soil);
const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.3, 24), new THREE.MeshLambertMaterial({ color: '#35c85a' }));
pad.position.set(7, 0.15, 7);
scene.add(pad);

// props on display
const banana = createBanana();
banana.position.set(-3, 0, -1);
scene.add(banana);
const balloon = createBalloon();
balloon.position.set(0, 1.4, -2);
scene.add(balloon);
const noodle = createNoodle('#ff4fa3');
noodle.position.set(3.5, 0, -1.5);
noodle.rotation.z = -0.4;
scene.add(noodle);

// blocky stand-in players (a fake game drives the continuous effects)
function dummy(char) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), mat(char.look.pants));
  legs.position.y = 1;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), mat(char.look.shirtColor));
  torso.position.y = 3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mat(char.look.skin));
  head.position.y = 4.7;
  for (const m of [legs, torso, head]) m.castShadow = true;
  g.add(legs, torso, head);
  scene.add(g);
  return g;
}
const players = CHARACTERS.map((char, slot) => ({
  slot, id: char.id, name: char.name, char, isHuman: slot === 0,
  pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, onGround: true,
  coilUntil: 0, cloakUntil: 0, stunUntil: 0, carrying: null, run: slot > 0, mesh: dummy(char),
  invisible(now) {
    return now < this.cloakUntil;
  },
}));
players[0].pos.x = -12;
players[0].pos.z = 9;
const fake = { time: 0, paused: false, players, human: players[0], monsters: [], gardens: [], event: null };

const fx = createEffects(engine, app);
fx.attach(fake);

// HUD caption
const cap = document.createElement('div');
cap.style.cssText = 'position:absolute;left:12px;top:10px;font:800 18px system-ui;color:#fff;text-shadow:0 2px 0 #0008;pointer-events:none;z-index:99';
app.appendChild(cap);

const CENTER = { x: 0, y: 1, z: 6 };
const FLOATS = [
  ['+$1.2K', { style: 'money', size: 'l' }],
  ['STOLEN!', { style: 'bad', size: 'xl' }],
  ['BONK!', { style: 'comic', size: 'xl', burst: '#ff3d2e' }],
  ['SPLASH!', { style: 'comic', size: 'l', burst: '#2f8bff' }],
  ['+2 SPEED!', { style: 'speed', size: 'xl' }],
  ['GOT IT BACK!', { style: 'good', size: 'l' }],
  ['MYTHIC!', { style: 'rarity', color: '#ff4d6d', size: 'xl' }],
  ['SECRET!!', { style: 'rarity', color: '#ffffff', size: 'xl', rainbow: true }],
];

function fire(kind, opts = {}) {
  const h = players[0];
  const at = opts.at || CENTER;
  cap.textContent = kind;
  switch (kind) {
    case 'coins':
      fx.burst('coins', { x: 7, y: 0.4, z: 7 }, { count: 14, target: h.pos, targetY: 3.2, bills: 3, ...opts });
      fx.floatText('+$1.2K', { x: 0, y: 6.4, z: 0 }, { style: 'money', size: 'l', follow: h.pos });
      return;
    case 'rarity':
      fx.burst('rarity', { x: at.x, y: 0, z: at.z }, { color: '#ffb627', ...opts });
      fx.floatText('LEGENDARY!', { x: at.x, y: 5.2, z: at.z }, { style: 'rarity', color: '#ffb627', size: 'l' });
      return;
    case 'secret':
      fx.burst('rarity', { x: at.x, y: 0, z: at.z }, { color: '#ffffff', rainbow: true, scale: 1.25 });
      fx.floatText('SECRET!!', { x: at.x, y: 5.2, z: at.z }, { style: 'rarity', color: '#ffffff', size: 'xl', rainbow: true });
      return;
    case 'whoosh':
      fx.burst('whoosh', h.pos, { yaw: h.yaw, color: h.char.color });
      return;
    case 'dirt':
    case 'plant':
      fx.burst('dirt', { x: -6, y: 1.2, z: 9 });
      fx.burst('leaves', { x: -6, y: 1.4, z: 9 });
      fx.floatText('PLANTED!', { x: -6, y: 4.5, z: 9 }, { style: 'good', size: 'm' });
      return;
    case 'splash':
      bus.emit('balloon:splash', { x: at.x, y: 0, z: at.z, owner: h });
      return;
    case 'hit':
      bus.emit('player:hit', { target: players[1], by: h, cause: opts.cause || 'bonk', dropped: null });
      players[1].stunUntil = fake.time + 1.2;
      return;
    case 'lock':
      fx.burst('sparks', { x: 0, y: 0.4, z: 10 }, { color: '#ff2a2a', count: 40, spanX: 6, spanY: 5, hot: true });
      fx.burst('beams', { x: 0, y: 0, z: 10 }, { color: '#ff3b3b', spanX: 6 });
      fx.floatText('LOCKED!', { x: 0, y: 7.5, z: 10 }, { style: 'bad', size: 'l' });
      return;
    case 'speed':
      bus.emit('speed:up', { player: h, level: 3, cost: 100 });
      return;
    case 'coil':
      h.coilUntil = fake.time + 3;
      bus.emit('item:used', { player: h, item: 'coil' });
      return;
    case 'cloak':
      h.cloakUntil = fake.time + 3;
      bus.emit('item:used', { player: h, item: 'cloak' });
      return;
    case 'loot':
      players[1].carrying = { kind: 'seed', speciesId: 'starlotus', mutation: 'rainbow', podId: 0 };
      return;
    case 'storm':
      fx.storm(CENTER, 3, { rate: 70 });
      return;
    case 'float':
      FLOATS.forEach(([t, o], i) => fx.floatText(t, { x: 11 - (i % 4) * 7.3, y: i < 4 ? 9.5 : 4.5, z: i < 4 ? 14 : 8 }, { ...o, size: 'l', duration: 2.5, rise: 0.5 }));
      return;
    default:
      fx.burst(kind, { x: at.x, y: at.y, z: at.z }, opts);
  }
}

const LOOP = ['coins', 'sparkle', 'poof', 'splash', 'stars', 'confetti', 'dust', 'leaves', 'rarity', 'hearts', 'impact', 'hit', 'speedlines',
  'whoosh', 'lock', 'plant', 'electric', 'cloak', 'sad', 'secret', 'float'];
let loopOn = !/noloop/.test(location.search);
let loopT = 0;
let loopI = 0;

window.__fire = fire;
window.__float = (text, opts = {}) => fx.floatText(text, opts.at || { x: 0, y: 6, z: 4 }, opts);
window.__emit = (name, payload) => bus.emit(name, payload);
window.__loop = (on) => (loopOn = on);
window.__fx = fx;
window.__engine = engine;
window.__fake = fake;
window.__players = players;
window.__cam = (x, y, z, tx = 0, ty = 2, tz = 4) => {
  camPos.set(x, y, z);
  camTarget.set(tx, ty, tz);
};

const camPos = new THREE.Vector3(0, 9, -11);
const camTarget = new THREE.Vector3(0, 3, 5);
engine.add((dt, t) => {
  fake.time += dt;
  // players: the human stands (or runs when coiled); bots jog in circles and hop
  players.forEach((p, i) => {
    const running = p.run || p.coilUntil > fake.time;
    if (running) {
      const r = i === 0 ? 6 : 4 + i * 2.5;
      const w = (p.coilUntil > fake.time ? 2.4 : 1.2) * (i % 2 ? 1 : -1) * (14 / r);
      const a = t * w * 0.2 + i * 2;
      const nx = Math.cos(a) * r, nz = (i === 0 ? 8 : 24) + Math.sin(a) * r;
      p.vel.x = (nx - p.pos.x) / Math.max(dt, 1e-3);
      p.vel.z = (nz - p.pos.z) / Math.max(dt, 1e-3);
      p.pos.x = nx;
      p.pos.z = nz;
      p.yaw = Math.atan2(p.vel.x, p.vel.z);
    } else {
      p.vel.x = p.vel.z = 0;
    }
    // hop every few seconds
    if (p.onGround && i > 0 && Math.random() < dt * 0.4) {
      p.vel.y = 52;
      p.onGround = false;
    }
    if (!p.onGround) {
      p.vel.y -= 196.2 * dt;
      p.pos.y += p.vel.y * dt;
      if (p.pos.y <= 0) {
        p.pos.y = 0;
        p.vel.y = 0;
        p.onGround = true;
      }
    }
    p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    p.mesh.rotation.y = p.yaw;
    p.mesh.visible = !(p.invisible(fake.time) && !p.isHuman);
    p.mesh.traverse((o) => {
      if (o.material) {
        o.material.transparent = p.invisible(fake.time);
        o.material.opacity = p.invisible(fake.time) ? 0.35 : 1;
      }
    });
  });
  balloon.rotation.y += dt * 0.8;
  if (loopOn) {
    loopT -= dt;
    if (loopT <= 0) {
      loopT = 1.6;
      fire(LOOP[loopI++ % LOOP.length]);
    }
  }
  engine.camera.position.copy(camPos);
  engine.camera.lookAt(camTarget);
  fx.update(dt, t);
});
engine.start();
