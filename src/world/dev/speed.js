// Dev page for the Speed Shop and the treadmill tiers: views of the shop from the plaza, close-ups of each
// station, the five treadmill tiers side by side and a home treadmill in Dorian's garden.
// Build: node build.mjs --entry src/world/dev/speed.js --out <dir>
// Keys: 1-9/0 the first ten views, [ and ] (or PageUp/PageDown) step through all of them, B toggle "someone is
// running" on every belt, T next home-treadmill tier, arrow keys orbit, +/- zoom.
// window.__speed exposes {engine, world, go(i|name), VIEWS, setBusy(i, on), setRunning(on), setTier(t), frame(n, dt),
// drawCalls()} for screenshot scripts.
import * as THREE from 'three';
import { Engine } from '../../core/engine.js';
import { LAYOUT } from '../../gameplay/layout.js';
import { CHARACTERS, TREADMILL } from '../../config.js';
import { createAvatar } from '../../characters/avatar.js';
import { buildWorld } from '../world.js';
import { createTreadmill } from '../treadmill.js';
import { Merger } from '../kit.js';
import { studTexture } from '../textures.js';

const ST = LAYOUT.speedStations;
const G0 = LAYOUT.gardens[0].treadmill;
const STUDIO = { x: 0, z: -170 }; // the tier line-up stands on its own plate, out of the way (the world is hidden there)
const VIEWS = [
  { name: 'Shop from the plaza', pos: [0, 17, -24], look: [0, 5, -57] },
  { name: 'Plaza wide', pos: [0, 34, 6], look: [0, 4, -56] },
  { name: 'Player camera', pos: [5, 10, -37], look: [0, 4, -57] },
  { name: 'Boost Lab', pos: [-7, 7.5, -45], look: [-7, 3.8, -58.5] },
  { name: 'Speed', pos: [0, 7.5, -45], look: [0, 3.8, -58.5] },
  { name: 'Warm-Up', pos: [7, 7.5, -45], look: [7, 3.8, -58.5] },
  { name: 'Side view', pos: [21, 10, -46], look: [2, 3.5, -57.5] },
  { name: 'West corner', pos: [-17, 7, -47.5], look: [-9, 2.5, -58] },
  { name: 'East corner', pos: [17, 7, -47.5], look: [9, 3, -59] },
  { name: 'Runner', pos: [1.5, 6.5, -47.5], look: [0, 2.5, -60] },
  { name: 'Tiers', pos: [0, 9, -17], look: [0, 1.8, 1], studio: true },
  { name: 'Tiers 3/4', pos: [17, 8, -14], look: [1, 1.8, 1], studio: true },
  { name: 'Tiers consoles', pos: [-15, 8, 18], look: [0, 2.2, 0], studio: true },
  { name: 'Tiers close', pos: [4, 5.5, -9], look: [5.5, 1.8, 1], studio: true },
  { name: 'Home treadmill', pos: [G0.x + 12, 9, G0.z - 8], look: [G0.x, 1.5, G0.z] },
];

const app = document.getElementById('app') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'app' });
document.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;background:#000';
app.style.cssText = 'position:fixed;inset:0';
const engine = new Engine(app);
const world = buildWorld(engine, LAYOUT, engine.quality);
const shopSpeed = world.speed || world.root.getObjectByName('shops')?.userData.speed;
const hud = document.body.appendChild(document.createElement('div'));
hud.style.cssText = 'position:fixed;left:10px;top:10px;color:#fff;font:600 14px system-ui;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';

// ---- reference avatars (5.2 studs) running on the shop belts, facing south
const runners = [];
function addRunner(charIndex, parent, x, y, z, yaw) {
  const av = createAvatar(CHARACTERS[charIndex % CHARACTERS.length], null);
  av.object3d.position.set(x, y, z);
  av.object3d.rotation.y = yaw;
  parent.add(av.object3d);
  runners.push(av);
  return av;
}
ST.forEach((st, i) => addRunner(i, world.root, st.x, TREADMILL.beltTop, st.z - 0.6, Math.PI));

// ---- studio: the five tiers side by side (console end towards +Z) + one runner
const studio = new THREE.Group();
studio.position.set(STUDIO.x, 0, STUDIO.z);
studio.visible = false;
engine.scene.add(studio);
{
  const plate = new Merger({ uv: 'studs', uvScale: 0.125 });
  plate.block(0, -1, 4, 70, 1, 50, '#8fd07a', { ao: 0 });
  plate.block(0, 0, 0, 34, 0.04, 14, '#d9dee6', { ao: 0 });
  studio.add(plate.build(new THREE.MeshLambertMaterial({ vertexColors: true, map: studTexture() }), { name: 'studio-plate' }));
}
const tiers = TREADMILL.tiers.map((t, k) => {
  const tm = createTreadmill({ tier: k, quality: engine.quality });
  tm.object3d.position.set((2 - k) * 6.2, 0, 0);
  studio.add(tm.object3d);
  return tm;
});
addRunner(3, studio, 2 * 6.2, TREADMILL.beltTop, 0.4, 0); // on the Basic one

// ---- a home treadmill where the garden spot is (placed properly by the base-level code in the game)
const home = createTreadmill({ tier: 2, quality: engine.quality });
home.object3d.position.set(G0.x, 0.04, G0.z);
home.object3d.rotation.y = Math.atan2(G0.dirX, G0.dirZ);
world.root.add(home.object3d);
addRunner(1, world.root, G0.x + G0.dirX * 0.4, 0.04 + TREADMILL.beltTop, G0.z + G0.dirZ * 0.4, Math.atan2(G0.dirX, G0.dirZ));

const cam = engine.camera;
const state = { view: 0, yaw: 0, dist: 1, busy: false, running: true, homeTier: 2 };
const target = new THREE.Vector3();
const off = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function go(i) {
  if (typeof i === 'string') i = Math.max(0, VIEWS.findIndex((v) => v.name === i));
  state.view = (i + VIEWS.length) % VIEWS.length;
  state.yaw = 0;
  state.dist = 1;
}
function place() {
  const v = VIEWS[state.view];
  const sx = v.studio ? STUDIO.x : 0, sz = v.studio ? STUDIO.z : 0;
  target.set(v.look[0] + sx, v.look[1], v.look[2] + sz);
  off.set(v.pos[0] - v.look[0], v.pos[1] - v.look[1], v.pos[2] - v.look[2]).multiplyScalar(state.dist).applyAxisAngle(UP, state.yaw);
  cam.position.copy(target).add(off);
  cam.lookAt(target);
  engine.setFocus(target.x, 0, target.z);
  studio.visible = !!v.studio;
  world.root.visible = !v.studio;
}
function setBusy(i, on) {
  shopSpeed?.setBusy(i, on);
}
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '9') go(+e.key - 1);
  else if (e.key === '0') go(9);
  else if (e.key === ']' || e.key === 'PageDown') go(state.view + 1);
  else if (e.key === '[' || e.key === 'PageUp') go(state.view - 1);
  else if (e.key === 'b' || e.key === 'B') {
    state.busy = !state.busy;
    ST.forEach((s, i) => setBusy(i, state.busy));
  } else if (e.key === 't' || e.key === 'T') home.setTier((state.homeTier = (state.homeTier + 1) % TREADMILL.tiers.length));
  else if (e.key === 'ArrowLeft') state.yaw += 0.15;
  else if (e.key === 'ArrowRight') state.yaw -= 0.15;
  else if (e.key === '+' || e.key === '=') state.dist *= 0.85;
  else if (e.key === '-') state.dist /= 0.85;
});
const runState = { time: 0, speed: 18, onGround: true, vy: 0, carrying: null, stunned: false, swing: -1, celebrating: false, invisible: 1, isLocal: false, coil: false, interacting: null, emote: null, emoteT: 0 };
const tierState = { running: true };
const idleState = { running: false };
engine.add((dt, t) => {
  place();
  runState.time = t;
  for (const r of runners) r.update(dt, runState);
  tiers.forEach((tm, k) => tm.update(dt, t, state.running && k >= 2 ? tierState : idleState));
  home.update(dt, t, tierState);
  world.update(dt, { time: t, camera: cam, focus: target, event: null });
  hud.textContent = `${VIEWS[state.view].name}  |  belts ${state.busy ? 'BUSY' : 'idle'}  |  home tier ${TREADMILL.tiers[state.homeTier].id}  |  calls ${engine.renderer.info.render.calls}  fps ${engine.fps.toFixed(0)}\n1-0 [ ] views  B busy belts  T home tier  arrows orbit  +/- zoom`;
});
engine.start();

/** Draw calls of the Speed Shop's own meshes + the treadmills (for budgets). */
function drawCalls() {
  const count = (o) => {
    let n = 0;
    o.traverse((c) => {
      if (c.isMesh || c.isPoints) n++;
    });
    return n;
  };
  const shops = world.root.getObjectByName('shops');
  const speed = ['speed-signs', 'speed-belts'].filter((n) => shops.getObjectByName(n)).length;
  return { speedShopOwnMeshes: speed, treadmillMeshes: tiers.map((t) => count(t.object3d)), rendererCalls: engine.renderer.info.render.calls };
}

window.__speed = {
  engine,
  world,
  VIEWS,
  go,
  setBusy,
  setRunning(on) {
    state.running = !!on;
  },
  setTier(t) {
    home.setTier((state.homeTier = t));
  },
  tiers,
  home,
  frame(n = 1, dt = 1 / 30) {
    for (let i = 0; i < n; i++) engine.frame(dt);
    const gl = engine.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  },
  drawCalls,
};
