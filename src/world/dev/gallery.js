// Dev page for the world art: fly between viewpoints and weather without running the game.
// Build: node build.mjs --entry src/world/dev/gallery.js --out <dir>
// Keys: 1-9/0 viewpoints, W cycle weather, L toggle garden lasers, C grow cash piles, U toggle planter crates,
// arrow keys orbit, +/- zoom. window.__gallery exposes {engine, world, go(i), setWeather(id)} for tests.
import * as THREE from 'three';
import { Engine } from '../../core/engine.js';
import { LAYOUT } from '../../gameplay/layout.js';
import { CHARACTERS } from '../../config.js';
import { getFace } from '../../characters/faces.js';
import { buildWorld } from '../world.js';

const VIEWS = [
  { name: 'Plaza overview', pos: [0, 110, -150], look: [0, 0, 10] },
  { name: 'Spawn', pos: [0, 14, -30], look: [0, 4, 20] },
  { name: 'Garden (Dorian)', pos: [-16, 9, -20], look: [-30, 3, -24] },
  { name: 'Shops', pos: [0, 16, -26], look: [0, 4, -56] },
  { name: 'Sunny Field', pos: [0, 13, 105], look: [0, 6, 200] },
  { name: 'Greenhollow', pos: [0, 13, 250], look: [0, 6, 360] },
  { name: 'Dustbowl', pos: [0, 13, 400], look: [0, 6, 510] },
  { name: 'Tanglemire', pos: [0, 13, 550], look: [0, 6, 660] },
  { name: 'Emberroot', pos: [0, 13, 700], look: [0, 6, 810] },
  { name: 'Starbloom', pos: [0, 13, 850], look: [0, 9, 960] },
];
const WEATHER = [null, 'golden', 'diamond', 'rainbow'];

const app = document.getElementById('app') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'app' });
document.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;background:#000';
app.style.cssText = 'position:fixed;inset:0';
const engine = new Engine(app);
const world = buildWorld(engine, LAYOUT, engine.quality);
const hud = document.body.appendChild(document.createElement('div'));
hud.style.cssText = 'position:fixed;left:10px;top:10px;color:#fff;font:600 14px system-ui;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';

CHARACTERS.forEach((c, i) => getFace(c.id).then((f) => world.gardens[i].setOwner(c, f.avatarUrl)));
world.gardens.forEach((g) => g.planters.forEach((p, i) => p.setUnlocked(i < 4)));

const cam = engine.camera;
const state = { view: 0, weather: 0, lasers: false, cash: 0, crates: true, yaw: 0, dist: 1 };
const target = new THREE.Vector3();
function go(i) {
  state.view = (i + VIEWS.length) % VIEWS.length;
  state.yaw = 0;
  state.dist = 1;
}
function place() {
  const v = VIEWS[state.view];
  target.set(...v.look);
  const off = new THREE.Vector3(v.pos[0] - v.look[0], v.pos[1] - v.look[1], v.pos[2] - v.look[2]).multiplyScalar(state.dist);
  off.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
  cam.position.copy(target).add(off);
  cam.lookAt(target);
  engine.setFocus(target.x, 0, target.z);
}
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '9') go(+e.key - 1);
  else if (e.key === '0') go(9);
  else if (e.key === 'w' || e.key === 'W') state.weather = (state.weather + 1) % WEATHER.length;
  else if (e.key === 'l' || e.key === 'L') state.lasers = !state.lasers;
  else if (e.key === 'c' || e.key === 'C') state.cash = state.cash ? state.cash * 12 : 10;
  else if (e.key === 'u' || e.key === 'U') state.crates = !state.crates;
  else if (e.key === 'ArrowLeft') state.yaw += 0.15;
  else if (e.key === 'ArrowRight') state.yaw -= 0.15;
  else if (e.key === '+' || e.key === '=') state.dist *= 0.85;
  else if (e.key === '-') state.dist /= 0.85;
  world.setWeather(WEATHER[state.weather]);
});
let lockT = 40;
engine.add((dt, t) => {
  place();
  lockT = state.lasers ? Math.max(0, lockT - dt) : 40;
  world.gardens.forEach((g) => {
    g.setLocked(state.lasers, lockT);
    g.setCashPile(state.cash);
    g.planters.forEach((p, i) => p.setUnlocked(!state.crates || i < 4));
  });
  world.update(dt, { time: t, camera: cam, focus: target, event: null });
  hud.textContent = `${VIEWS[state.view].name}  |  weather: ${WEATHER[state.weather] || 'clear'}  |  calls ${engine.renderer.info.render.calls}  fps ${engine.fps.toFixed(0)}\n1-0 views  W weather  L lasers  C cash  U crates  arrows orbit  +/- zoom`;
});
engine.start();
window.__gallery = { engine, world, go, setWeather: (id) => world.setWeather(id), VIEWS };
