// Dev page for the world art: fly between viewpoints and weather without running the game.
// Build: node build.mjs --entry src/world/dev/gallery.js --out <dir>
// Keys: 1-9/0 the first ten viewpoints, [ and ] (or PageUp/PageDown) step through all of them, W cycle weather,
// L toggle garden lasers, C grow cash piles, U toggle planter crates, arrow keys orbit, +/- zoom.
// Base levels / Base Studio (on the garden nearest the view): B floor, N fence, M laser colour, V level,
// D fill / clear the decoration spots, T treadmill tier, G guard swing, K showcase (the four gardens with the
// bots' looks at levels 1, 5, 8 and 10), X a maxed-out golden Lv10 garden, R reset every garden to Lv1.
// window.__gallery exposes {engine, world, go(i), setWeather(id), setBase(slot, level, style), showcase(),
// maxOut(slot), VIEWS} for tests (go also takes a view name).
import * as THREE from 'three';
import { Engine } from '../../core/engine.js';
import { LAYOUT } from '../../gameplay/layout.js';
import { CHARACTERS, BASE, BASE_STYLES, DEFAULT_BASE_STYLE, TREADMILL } from '../../config.js';
import { effectiveBaseStyle, BOT_STYLES } from '../../gameplay/basestyle.js';
import { getFace } from '../../characters/faces.js';
import { buildWorld } from '../world.js';

// garden views: from the aisle through the gate, a 3/4 aerial and straight down
const gardenViews = LAYOUT.gardens.flatMap((L) => {
  const who = CHARACTERS[L.slot].name;
  const gx = L.gate.x, cz = L.center.z, inw = L.inward;
  // the BASE console faces the gate opening: look at it from there
  const C = L.console, fx = gx - inw * 4 - C.x, fz = cz - C.z, fl = Math.hypot(fx, fz);
  return [
    { name: `Console (${who})`, pos: [C.x + (fx / fl) * 7, 4.5, C.z + (fz / fl) * 7], look: [C.x, 2.4, C.z] },
    { name: `Sign (${who})`, pos: [gx - inw * 10, 9.5, L.sign.z + 0.2], look: [gx, 12, L.sign.z + 0.2] },
    { name: `Garden (${who})`, pos: [gx - inw * 14, 9, cz + (cz < 0 ? 4 : -4)], look: [gx, 3, cz] },
    { name: `Garden aerial (${who})`, pos: [gx - inw * 16, 34, cz + (cz < 0 ? -30 : 30)], look: [gx + inw * 20, 0, cz] },
    { name: `Garden top (${who})`, pos: [L.center.x, 78, cz - 0.5], look: [L.center.x, 0, cz] },
    { name: `Front yard (${who})`, pos: [gx - inw * 9, 11, cz - 9], look: [gx + inw * 9, 1.5, cz + 5] },
  ];
});

const VIEWS = [
  { name: 'Plaza overview', pos: [0, 110, -150], look: [0, 0, 10] },
  { name: 'Spawn', pos: [0, 14, -30], look: [0, 4, 20] },
  gardenViews.find((v) => v.name === `Garden (${CHARACTERS[0].name})`),
  { name: 'Shops', pos: [0, 16, -26], look: [0, 4, -56] },
  { name: 'Sunny Field', pos: [0, 13, 105], look: [0, 6, 200] },
  { name: 'Greenhollow', pos: [0, 13, 250], look: [0, 6, 360] },
  { name: 'Dustbowl', pos: [0, 13, 400], look: [0, 6, 510] },
  { name: 'Tanglemire', pos: [0, 13, 550], look: [0, 6, 660] },
  { name: 'Emberroot', pos: [0, 13, 700], look: [0, 6, 810] },
  { name: 'Starbloom', pos: [0, 13, 850], look: [0, 9, 960] },
  { name: 'Frostfall', pos: [0, 13, 1000], look: [0, 6, 1110] },
  { name: 'Candy Canyon', pos: [0, 13, 1150], look: [0, 6, 1260] },
  { name: 'Cloud Kingdom', pos: [0, 13, 1300], look: [0, 9, 1410] },
  { name: 'End of the road', pos: [0, 12, 1362], look: [0, 17, 1410] },
  { name: 'Base showcase', pos: [0, 92, -112], look: [0, 0, 2] },
  { name: 'Gardens west', pos: [-8, 40, -62], look: [-58, 0, 0] },
  { name: 'Gardens east', pos: [8, 40, -62], look: [58, 0, 0] },
  ...gardenViews.filter((v) => v.name !== `Garden (${CHARACTERS[0].name})`),
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

// ---------------------------------------------------------------- base levels + styles
const base = LAYOUT.gardens.map(() => ({ level: 1, style: { ...DEFAULT_BASE_STYLE, decor: [...DEFAULT_BASE_STYLE.decor] }, tier: 0 }));
function setBase(slot, level, style) {
  const b = base[slot];
  b.level = Math.max(1, Math.min(BASE.maxLevel, level | 0 || 1));
  if (style) b.style = { ...DEFAULT_BASE_STYLE, ...style, decor: [...(style.decor || DEFAULT_BASE_STYLE.decor)] };
  world.gardens[slot].setBase?.({ level: b.level, style: effectiveBaseStyle(b.style, b.level) });
  return { level: b.level, style: effectiveBaseStyle(b.style, b.level) };
}
const cycle = (list, id, d = 1) => list[(list.findIndex((x) => x.id === id) + d + list.length) % list.length];
// pick the next choice and raise the level to its unlock level so it shows
function nextStyle(slot, what) {
  const b = base[slot];
  const item = cycle(BASE_STYLES[what + 's'], b.style[what]);
  b.style[what] = item.id;
  setBase(slot, Math.max(b.level, item.min));
}
const DECOR_SETS = [
  ['fountain', 'oak', 'lamp', 'statue', 'windmill', 'rocket'],
  ['flowerbed', 'pethouse', 'hottub', 'gnome', 'rainbowarch', 'candytree'],
  ['palm', 'trampoline', 'campfire', 'snowman', 'palm', 'gnome'],
  [null, null, null, null, null, null],
];
function nextDecor(slot) {
  const b = base[slot];
  b.decorSet = ((b.decorSet ?? -1) + 1) % DECOR_SETS.length;
  b.style.decor = [...DECOR_SETS[b.decorSet]];
  setBase(slot, b.decorSet < 3 ? BASE.maxLevel : b.level);
}
function showcase() {
  const ids = ['dorian', 'esther', 'maddie', 'micah'];
  [1, 5, 8, 10].forEach((lv, slot) => setBase(slot, lv, BOT_STYLES[CHARACTERS[slot]?.id] || BOT_STYLES[ids[slot]]));
}
function maxOut(slot) {
  return setBase(slot, BASE.maxLevel, { floor: 'gold', fence: 'gold', laser: 'gold', decor: DECOR_SETS[0] });
}
function reset() {
  base.forEach((_, slot) => setBase(slot, 1, DEFAULT_BASE_STYLE));
}

const cam = engine.camera;
const state = { view: 0, weather: 0, lasers: false, cash: 0, crates: true, yaw: 0, dist: 1 };
const target = new THREE.Vector3();
function go(i) {
  if (typeof i === 'string') i = Math.max(0, VIEWS.findIndex((v) => v.name === i));
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
// the garden nearest the view's target (Dorian's when the view is elsewhere)
function viewedSlot() {
  const v = VIEWS[state.view];
  let best = 0, bd = Infinity;
  for (const L of LAYOUT.gardens) {
    const d = Math.hypot(v.look[0] - L.center.x, v.look[2] - L.center.z);
    if (d < bd) (bd = d), (best = L.slot);
  }
  return bd < 70 ? best : 0;
}
addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const slot = viewedSlot();
  if (k >= '1' && k <= '9') go(+k - 1);
  else if (k === '0') go(9);
  else if (k === ']' || k === 'PageDown') go(state.view + 1);
  else if (k === '[' || k === 'PageUp') go(state.view - 1);
  else if (k === 'w') state.weather = (state.weather + 1) % WEATHER.length;
  else if (k === 'l') state.lasers = !state.lasers;
  else if (k === 'c') state.cash = state.cash ? state.cash * 12 : 10;
  else if (k === 'u') state.crates = !state.crates;
  else if (k === 'b') nextStyle(slot, 'floor');
  else if (k === 'n') nextStyle(slot, 'fence');
  else if (k === 'm') nextStyle(slot, 'laser');
  else if (k === 'v') setBase(slot, (base[slot].level % BASE.maxLevel) + 1);
  else if (k === 'd') nextDecor(slot);
  else if (k === 't') {
    base[slot].tier = (base[slot].tier + 1) % TREADMILL.tiers.length;
    world.gardens[slot].setTreadmillTier?.(base[slot].tier);
  } else if (k === 'g') world.gardens[slot].guard?.swing?.();
  else if (k === 'k') {
    showcase();
    go('Base showcase');
  } else if (k === 'x') maxOut(slot);
  else if (k === 'r') reset();
  else if (k === 'ArrowLeft') state.yaw += 0.15;
  else if (k === 'ArrowRight') state.yaw -= 0.15;
  else if (k === '+' || k === '=') state.dist *= 0.85;
  else if (k === '-') state.dist /= 0.85;
  world.setWeather(WEATHER[state.weather]);
});
let lockT = 40;
const animOpts = { alert: false, running: false };
engine.add((dt, t) => {
  place();
  lockT = state.lasers ? Math.max(0, lockT - dt) : 40;
  world.gardens.forEach((g) => {
    g.setLocked(state.lasers, lockT);
    g.setCashPile(state.cash);
    g.planters.forEach((p, i) => p.setUnlocked(!state.crates || i < 4));
    // the game view animates these; here the gallery does
    g.guard?.update?.(dt, t, animOpts);
    g.treadmill?.update?.(dt, t, animOpts);
  });
  world.update(dt, { time: t, camera: cam, focus: target, event: null });
  const s = viewedSlot(), b = base[s], st = effectiveBaseStyle(b.style, b.level);
  hud.textContent = `${VIEWS[state.view].name}  |  weather: ${WEATHER[state.weather] || 'clear'}  |  calls ${engine.renderer.info.render.calls}  fps ${engine.fps.toFixed(0)}\n` +
    `${CHARACTERS[s].name}: Lv ${b.level}  floor ${st.floor}  fence ${st.fence}  laser ${st.laser}  decor ${st.decor.filter(Boolean).length}\n` +
    `1-0 [ ] views  W weather  L lasers  C cash  U crates  arrows orbit  +/- zoom\nB floor  N fence  M laser  V level  D decor  T treadmill  G guard  K showcase  X max  R reset`;
});
engine.start();
window.__gallery = { engine, world, go, setWeather: (id) => world.setWeather(id), setBase, showcase, maxOut, reset, VIEWS };
