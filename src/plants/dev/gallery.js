// Dev gallery for the plant module: every species grown, growth stages, mutations, seeds per rarity,
// every biome's pod with a seed, and carried pots. Build:
//   node build.mjs --entry src/plants/dev/gallery.js --out <dir>
// window.__gallery.view(name) jumps the camera to a section: all | grid | grid2 | grid3 | stages | mut | seeds | pods | carry | secret |
// rainbow | tiers | top (the Celestial .. Infinity species: every stage + mutations; topN, topNa, topNb, topN_c close-ups),
// plus close-ups: spN / spNxM (species N of the grid), rowN(L|R), seedsL|M|R|2, podsL|M|R, podN, carryL|R, tiersA-D.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANTS, PLANT, RARITIES, RARITY, BIOMES } from '../../config.js';
import { camPos } from '../materials.js';
import { createPlantView, createSeedView, createCarriedPlantView, createPodView, plantTemplate, seedTemplate, plantScale } from '../plantMeshes.js';
import { podTemplate, potTemplate } from '../pods.js';

const app = document.getElementById('app') || document.body;
app.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#8fd3ff';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0xbfe7ff, 160, 420);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 1000);
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x7a9a5a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(40, 80, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 300 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x7bd35a }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// DOM labels
const labelLayer = document.createElement('div');
labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:700 12px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000,0 0 3px #000';
app.appendChild(labelLayer);
const labels = [];
function label(text, pos, color = '#fff') {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;white-space:nowrap;transform:translate(-50%,-100%);color:${color};text-align:center`;
  el.innerHTML = text;
  labelLayer.appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(pos[0], pos[1], pos[2]) });
}

const planterGeo = new THREE.BoxGeometry(4.8, 1.2, 4.8);
const planterMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
const soilGeo = new THREE.BoxGeometry(4.3, 0.06, 4.3);
const soilMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
function planter(x, z) {
  const m = new THREE.Mesh(planterGeo, planterMat);
  m.position.set(x, 0.6, z);
  m.castShadow = m.receiveShadow = true;
  const s = new THREE.Mesh(soilGeo, soilMat);
  s.position.set(x, 1.2, z);
  s.receiveShadow = true;
  scene.add(m, s);
}

const views = [];
function addPlant(sid, mut, p, x, z, text) {
  planter(x, z);
  const v = createPlantView(sid, mut, { facing: Math.PI });
  v.setGrowth(p);
  v.object3d.position.set(x, 1.2, z);
  scene.add(v.object3d);
  views.push(v);
  if (text) label(text, [x, 6.6, z]);
  return v;
}
const rcol = (r) => (r === 'secret' ? '#ffffff' : RARITY[r].color);

// ?only=grid,stages,mut,seeds,pods,carry,secret builds just those sections (SwiftShader is slow)
const params = new URLSearchParams(location.search);
const ONLY = params.get('only') ? new Set(params.get('only').split(',')) : null;
const want = (k) => !ONLY || ONLY.has(k);

// 1) all species grown: rows of 7, spacing 7
const COLS = 7, SP = 7;
if (want('grid')) PLANTS.forEach((sp, i) => {
  const x = -(i % COLS - (COLS - 1) / 2) * SP;
  const z = Math.floor(i / COLS) * SP;
  addPlant(sp.id, 'normal', 1, x, z, `${sp.name}<br><span style="color:${rcol(sp.rarity)}">${RARITY[sp.rarity].name}</span>`);
});

// 2) growth stages (z = -14)
const stageRow = (sid, z) => [0.1, 0.4, 0.75, 0.95, 1].forEach((p, i) => addPlant(sid, 'normal', p, 10 - i * SP, z, `${Math.round(p * 100)}%`));
if (want('stages')) {
  stageRow('sunflower', -14);
  stageRow('starlotus', -21);
  stageRow('flytrap', -28);
}

// 3) mutations (x = 40..)
if (want('mut')) {
  ['normal', 'gold', 'diamond', 'rainbow'].forEach((m, i) => addPlant('tulip', m, 1, -26 - i * SP, -14, m));
  ['normal', 'gold', 'diamond', 'rainbow'].forEach((m, i) => addPlant('moonmelon', m, 1, -26 - i * SP, -21, m));
  ['normal', 'gold', 'diamond', 'rainbow'].forEach((m, i) => addPlant('glowcap', m, 1, -26 - i * SP, -28, m));
}

// 4) seeds per rarity + mutations (z = -40), and every Celestial .. Infinity seed (z = -34)
const seedViews = [];
function addSeed(sid, m, x, z, text, color) {
  const v = createSeedView(sid, m);
  v.object3d.position.set(x, 1.2, z);
  scene.add(v.object3d);
  seedViews.push(v);
  if (text) label(text, [x, 3.9, z], color);
}
// the first species of each rarity, in rarity order (common .. infinity, secret)
const seedSpecies = RARITIES.map((r) => PLANTS.find((p) => p.rarity === r.id).id);
const TOP_SPECIES = PLANTS.filter((p) => RARITY[p.rarity].tier >= 6 && p.rarity !== 'secret').map((p) => p.id);
if (want('seeds')) {
  seedSpecies.forEach((sid, i) => addSeed(sid, 'normal', 24 - i * 5, -40, RARITIES[i].name, rcol(RARITIES[i].id)));
  // mutations and the other family seeds carry on to the left of the rarity row
  const mx = 24 - RARITIES.length * 5 - 1;
  ['gold', 'diamond', 'rainbow'].forEach((m, i) => addSeed('sunflower', m, mx - i * 5, -40, m));
  ['estherlotus', 'maddiemarigold', 'micahmelon'].forEach((sid, i) => addSeed(sid, 'normal', mx - 18 - i * 5, -40));
  TOP_SPECIES.forEach((sid, i) => addSeed(sid, 'normal', 18 - i * 4.5, -34, PLANT[sid].name, rcol(PLANT[sid].rarity)));
}

// 5) pods, one per biome (z = -56)
const podSeeds = [['tulip', 'normal'], ['clover', 'normal'], ['desertrose', 'gold'], ['bogberry', 'normal'], ['emberpepper', 'normal'], ['galaxyorchid', 'rainbow'],
  ['snowflake', 'normal'], ['gumdrop', 'diamond'], ['halolily', 'normal'], ['prismpetal', 'normal'], ['pearlbloom', 'normal'], ['starfruit', 'rainbow']];
const podX = (i) => 32 - i * 8;
if (want('pods')) BIOMES.forEach((bm, i) => {
  const pod = createPodView(i);
  pod.object3d.position.set(podX(i), 0, -56);
  const [sid, m] = podSeeds[i] || podSeeds[0];
  pod.setSeed(createSeedView(sid, m));
  scene.add(pod.object3d);
  views.push(pod);
  label(bm.name, [podX(i), 5.6, -56]);
});
if (want('pods')) {
  const emptyPod = createPodView(2);
  emptyPod.object3d.position.set(podX(BIOMES.length) - 2, 0, -56);
  scene.add(emptyPod.object3d);
  views.push(emptyPod);
  label('empty', [podX(BIOMES.length) - 2, 4.2, -56]);
}

// 6) carried pots on stand-in avatars (z = -70)
const avatarMat = new THREE.MeshLambertMaterial({ color: 0x2f80ed });
const CARRY = ['sunflower', 'flytrap', 'lavalily', 'starlotus', 'micahmelon', 'icerose', 'gumdrop', 'thunderbloom'];
if (want('carry')) CARRY.forEach((sid, i) => {
  const x = 28 - i * 8;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), avatarMat);
  body.position.set(x, 2, -70);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshLambertMaterial({ color: 0xd19a82 }));
  head.position.set(x, 4.8, -70);
  scene.add(body, head);
  const c = createCarriedPlantView(sid, i === 1 ? 'gold' : 'normal');
  c.object3d.position.set(x, 6, -70);
  scene.add(c.object3d);
  views.push(c);
});
if (want('carry')) {
  const x = 28 - CARRY.length * 8;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), avatarMat);
  body.position.set(x, 2, -70);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshLambertMaterial({ color: 0xd19a82 }));
  head.position.set(x, 4.8, -70);
  scene.add(body, head);
  const s = createSeedView('lavalily', 'normal');
  s.object3d.position.set(x, 6, -70);
  scene.add(s.object3d);
  views.push(s);
}

// Rainbow mutation keeps species identity (z = 56): normal vs rainbow pairs
if (want('rainbow')) ['daisy', 'cactus', 'mushroom'].forEach((sid, i) => {
  ['normal', 'rainbow'].forEach((m, j) => addPlant(sid, m, 1, 16 - i * 13 - j * 6, 56, `${PLANTS.find((p) => p.id === sid).name}<br>${m}`));
});

// Size by rarity (z = 72): one row, commons on the left, secrets on the right; labels show the grown height.
const TIER_ROW = ['daisy', 'sunflower', 'clover', 'tater', 'aloe', 'flytrap', 'glowcap', 'phoenixfern', 'lavalily', 'moonmelon', 'starlotus',
  'snowflake', 'frostbell', 'lollibloom', 'candycane', 'cloudberry', 'thunderbloom', 'prismpetal', 'glimmergrapes', 'coralcrown', 'jellybell',
  'infinityrose', 'starfruit', 'micahmelon', 'dorianfruit'];
const tierX = (i) => ((TIER_ROW.length - 1) / 2 - i) * 5.6;
if (want('tiers')) TIER_ROW.forEach((sid, i) => {
  const sp = PLANT[sid];
  const v = addPlant(sid, 'normal', 1, tierX(i), 72);
  label(`${sp.name}<br><span style="color:${rcol(sp.rarity)}">${RARITY[sp.rarity].name}</span><br>${v.topY.toFixed(2)}`, [tierX(i), 1.2 + v.topY + 1.2, 72]);
});

// Celestial .. Infinity showcase (z = 92, one row per species every 14 studs): seed mound, sprout, bud,
// grown, then grown gold / diamond / rainbow.
const TOP_Z = 92, TOP_DZ = 14, TOP_DX = 6;
const TOP_COLS = [[0.1, 'normal', 'seed'], [0.45, 'normal', 'sprout'], [0.8, 'normal', 'bud'], [1, 'normal', null], [1, 'gold', 'gold'], [1, 'diamond', 'diamond'], [1, 'rainbow', 'rainbow']];
const topX = (c) => ((TOP_COLS.length - 1) / 2 - c) * TOP_DX;
// ?species=snowflake,gumdrop limits the showcase to those rows (they keep their places)
const TOP_ONLY = params.get('species') ? new Set(params.get('species').split(',')) : null;
if (want('top')) TOP_SPECIES.forEach((sid, r) => TOP_COLS.forEach(([p, m, text], c) => {
  if (TOP_ONLY && !TOP_ONLY.has(sid)) return;
  const sp = PLANT[sid];
  addPlant(sid, m, p, topX(c), TOP_Z + r * TOP_DZ, text || `${sp.name}<br><span style="color:${rcol(sp.rarity)}">${RARITY[sp.rarity].name}</span>`);
}));

// Secret showcase (z = 40)
if (want('secret')) ['dorianfruit', 'estherlotus', 'maddiemarigold', 'micahmelon'].forEach((sid, i) => addPlant(sid, 'normal', 1, 12 - i * 8, 40, PLANTS.find((p) => p.id === sid).name));

const v3 = new THREE.Vector3();
let last = performance.now() / 1000;
let time = 0;

// camera presets
const PRESETS = {
  all: [[0, 120, -150], [8, 0, -15]],
  grid: [[0, 24, -30], [0, 2.5, 3]],
  grid2: [[0, 24, -12], [0, 2.5, 18]],
  row0: [[0, 17, -12], [0, 2, 1]],
  row1: [[0, 17, -5], [0, 2, 8]],
  row2: [[0, 17, 2], [0, 2, 15]],
  row3: [[0, 17, 9], [0, 2, 22]],
  row0L: [[11, 9, -9], [11, 2.6, 0]],
  row0R: [[-11, 9, -9], [-11, 2.6, 0]],
  row1L: [[11, 9, -2], [11, 2.6, 7]],
  row1R: [[-11, 9, -2], [-11, 2.6, 7]],
  row2L: [[11, 9, 5], [11, 2.6, 14]],
  row2R: [[-11, 9, 5], [-11, 2.6, 14]],
  row3L: [[11, 9, 12], [11, 2.6, 21]],
  row3R: [[-11, 9, 12], [-11, 2.6, 21]],
  row4: [[0, 17, 16], [0, 2, 29]],
  row4L: [[11, 9, 19], [11, 2.6, 28]],
  row4R: [[-11, 9, 19], [-11, 2.6, 28]],
  grid3: [[0, 24, 2], [0, 2.5, 26]],
  stages: [[-4, 16, -46], [-4, 2, -21]],
  mut: [[-36, 16, -46], [-36, 2, -21]],
  seeds: [[-17, 10, -52], [-17, 2, -37]],
  seedsL: [[14, 5, -52], [14, 2, -40]],
  seedsM: [[-9, 5, -52], [-9, 2, -40]],
  seedsR: [[-42, 5, -52], [-42, 2, -40]],
  seeds2: [[0, 12, -52], [0, 1.5, -34]],
  pods: [[-4, 16, -100], [-4, 2, -56]],
  podsL: [[24, 6.5, -70], [24, 2.2, -56]],
  podsM: [[0, 6.5, -70], [0, 2.2, -56]],
  podsR: [[-24, 6.5, -70], [-24, 2.2, -56]],
  carry: [[-4, 18, -106], [-4, 6, -70]],
  carryL: [[12, 12, -86], [12, 6.5, -70]],
  carryR: [[-20, 12, -86], [-20, 6.5, -70]],
  secret: [[0, 11, 24], [0, 3, 40]],
  rainbow: [[-3, 11, 36], [-3, 2.8, 56]],
  tiers: [[0, 14, 16], [0, 3.6, 72]],
  tiersA: [[36, 6.5, 53], [36, 3.4, 72]],
  tiersB: [[14, 6.5, 53], [14, 3.4, 72]],
  tiersC: [[-8, 7, 52], [-8, 3.8, 72]],
  tiersD: [[-34, 7, 52], [-34, 3.8, 72]],
  top: [[0, 46, 58], [0, 2, 132]],
  far: [[0, 40, -60], [0, 2, 3]],
};
function view(name) {
  let p = PRESETS[name] || PRESETS.all;
  const t = /^top(\d+)(?:([ab])|_(\d))?$/.exec(name);
  if (t) {
    // row N of the top showcase: whole row, a = seed..grown, b = grown..rainbow, _c = one planter
    const z = TOP_Z + +t[1] * TOP_DZ;
    if (t[3] != null) p = [[topX(+t[3]), 8.8, z - 10], [topX(+t[3]), 3.4, z]];
    else if (t[2]) p = t[2] === 'a' ? [[topX(1.5), 10, z - 13], [topX(1.5), 2.8, z]] : [[topX(4.5), 10.5, z - 13], [topX(4.5), 3.4, z]];
    else p = [[0, 16, z - 13.5], [0, 2.5, z + 6]];
  }
  const pm = /^pod(\d+)$/.exec(name);
  if (pm) p = [[podX(+pm[1]), 5, -65], [podX(+pm[1]), 2.3, -56]];
  const m = /^sp(\d+)(?:x(\d+))?$/.exec(name);
  if (m) {
    // close-up of species i (optionally spanning n neighbours)
    const i = +m[1], n = +(m[2] || 1);
    const x = -((i % COLS) + (n - 1) / 2 - (COLS - 1) / 2) * SP, z = Math.floor(i / COLS) * SP;
    const d = 5.5 + n * 3.2;
    p = [[x, 1.2 + d * 0.55, z - d], [x, 3.2, z]];
  }
  camera.position.set(...p[0]);
  controls.target.set(...p[1]);
  controls.update();
  // SwiftShader renders slowly: render once (so plants learn the camera) then let animations settle.
  renderer.render(scene, camera);
  for (let i = 0; i < 30; i++) {
    time += 0.1;
    for (const v of views) v.update(0.1, time);
    for (const v of seedViews) v.update(0.1, time);
  }
}
view(params.get('view') || 'grid');

function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - last);
  last = now;
  time += dt;
  controls.update();
  for (const v of views) v.update(dt, time);
  for (const v of seedViews) v.update(dt, time);
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).add(v3.set(40, 80, -30));
  renderer.render(scene, camera);
  const w = window.innerWidth, h = window.innerHeight;
  for (const l of labels) {
    v3.copy(l.pos).project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 && l.pos.distanceTo(camera.position) < 60;
    l.el.style.display = vis ? '' : 'none';
    if (vis) l.el.style.left = ((v3.x * 0.5 + 0.5) * w).toFixed(0) + 'px', l.el.style.top = ((-v3.y * 0.5 + 0.5) * h).toFixed(0) + 'px';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

window.__gallery = {
  view,
  ready: true,
  stats() {
    const out = {};
    // per species: triangles per stage, then grown template height, radius, and the height it is shown at in a planter
    for (const sp of PLANTS) {
      const t = plantTemplate(sp.id, 'normal', 3);
      out[sp.id] = [0, 1, 2, 3].map((s) => plantTemplate(sp.id, 'normal', s).tris).concat([t.height.toFixed(2), t.radius.toFixed(2), (t.height * plantScale(sp.id)).toFixed(2)]);
    }
    out.seed = seedTemplate('daisy').tris;
    out.pods = BIOMES.map((b, i) => podTemplate(i).tris);
    out.pot = potTemplate().tris;
    return out;
  },
  info() {
    return renderer.info.render;
  },
  views,
  // first-build cost of every template (call on a fresh page with ?only=none)
  perf() {
    const t0 = performance.now();
    for (const sp of PLANTS) plantTemplate(sp.id, 'normal', 3);
    const t1 = performance.now();
    for (const sp of PLANTS) for (let st = 0; st < 3; st++) plantTemplate(sp.id, 'normal', st);
    const t2 = performance.now();
    for (const sp of PLANTS) seedTemplate(sp.id, 'normal');
    const t3 = performance.now();
    for (let i = 0; i < BIOMES.length; i++) podTemplate(i);
    const t4 = performance.now();
    const views = [];
    for (let i = 0; i < 40; i++) views.push(createPlantView(PLANTS[i % PLANTS.length].id, 'normal'));
    const t5 = performance.now();
    for (const v of views) v.setGrowth(1);
    for (let k = 0; k < 100; k++) for (const v of views) v.update(1 / 60, k / 60);
    const t6 = performance.now();
    return { grown: t1 - t0, stages: t2 - t1, seeds: t3 - t2, pods: t4 - t3, create40: t5 - t4, update40x100: t6 - t5 };
  },
  cam() {
    return [camPos.toArray(), camera.position.toArray()];
  },
};
