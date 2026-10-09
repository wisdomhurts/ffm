// Golden Gnome Hunt art: a tiny gold Guard Gnome (basedecor.js goldenGnome) at every GNOMES spot
// (gameplay/layout.js), bobbing and turning on the spot inside a ring of glints. Mounted from world.js;
// progress/gnomes.js tells it which gnomes the active profile has found already (those stay hidden) and pops
// the one just found.
// Contract: createGnomes({root, quality, mats}) -> {
//   setFound(ids)          hide these gnomes (any iterable of ids), show the rest
//   pop(id)                the found animation: a hop and a spin, then it shrinks away
//   update(dt, t, camera)  animation + culling (only gnomes within VIEW studs of the camera are drawn)
//   spots                  GNOMES (world positions)
// }
// Budget: 3 draw calls per gnome in view (the gold body; glints and a coin heap in the world's glow material),
// shown on every quality level; nothing allocates per frame. The gold material is a shader of its own:
// gnomeWarmup() goes into main.js's shader warm-up.
import * as THREE from 'three';
import { GNOMES } from '../gameplay/layout.js';
import { goldenGnome } from './basedecor.js';
import { Merger } from './kit.js';

const SCALE = 0.6; // ~1.8 studs (2.6 with the noodle held up): waist-high next to a 5.2-stud kid
const VIEW = 170; // drawn within this many studs of the camera (the road fog hides more than that)
const POP = 0.7; // seconds of the found animation

// four little diamonds round the gnome's middle (spun and pulsed as one mesh)
let glintGeo = null;
function glints() {
  if (glintGeo) return glintGeo;
  const m = new Merger();
  const cols = ['#ffffff', '#fff3a0', '#ffffff', '#ffe066'];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = i % 2 ? 0.26 : 0.36;
    m.prim('octa', Math.cos(a) * 1.25, 0.7 + (i % 2) * 0.75, Math.sin(a) * 1.25, s, s * 1.7, s, cols[i], { ao: 0 });
  }
  glintGeo = m.buildGeometry();
  return glintGeo;
}

// a little heap of gold coins at its feet, in the unlit glow material so it shines even in the shade
let coinGeo = null;
function coins() {
  if (coinGeo) return coinGeo;
  const m = new Merger();
  const cols = ['#ffe14d', '#ffd23f', '#fff0a0', '#ffc21f'];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, d = i < 3 ? 0.35 : 0.95 + (i % 3) * 0.18;
    m.cyl(Math.cos(a) * d, i < 3 ? 0.12 : 0, Math.sin(a) * d, 0.32, 0.11, cols[i % 4], { seg: 10, rx: (i % 2 ? 0.25 : -0.2), ao: 0 });
  }
  coinGeo = m.buildGeometry();
  return coinGeo;
}

/** A hidden gold gnome for the shader warm-up (main.js buildWarmupGroup). */
export function gnomeWarmup() {
  const { geometry, material } = goldenGnome();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function createGnomes({ root, quality, mats }) {
  const { geometry, material } = goldenGnome();
  const group = new THREE.Group();
  group.name = 'golden-gnomes';
  root.add(group);
  const list = GNOMES.map((s, i) => {
    const holder = new THREE.Group();
    holder.position.set(s.x, s.y, s.z);
    // face whoever comes looking: the plaza for the island ones, home (south) on the road
    holder.rotation.y = s.biome < 0 ? Math.atan2(-s.x, -s.z) : Math.PI;
    const body = new THREE.Mesh(geometry, material);
    body.scale.setScalar(SCALE);
    body.castShadow = !!quality?.shadows;
    body.receiveShadow = false;
    const sparks = new THREE.Mesh(glints(), mats.glow);
    sparks.scale.setScalar(SCALE);
    const heap = new THREE.Mesh(coins(), mats.glow);
    heap.scale.setScalar(SCALE);
    holder.add(body, sparks, heap);
    group.add(holder);
    return { s, holder, body, sparks, heap, ph: i * 1.7, found: false, popT: -1 };
  });
  const byId = new Map(list.map((g) => [g.s.id, g]));

  function setFound(ids) {
    const set = new Set(ids || []);
    for (const g of list) {
      const was = g.found;
      g.found = set.has(g.s.id);
      // one being popped keeps its animation; anything else snaps to the new state
      if (g.popT < 0 || !g.found || !was) g.popT = -1;
    }
  }

  function pop(id) {
    const g = byId.get(id);
    if (!g || g.popT >= 0) return;
    g.found = true;
    g.popT = 0;
  }

  function update(dt, t, camera) {
    const cx = camera.position.x, cz = camera.position.z;
    for (const g of list) {
      const { holder, body, sparks, heap, s } = g;
      let k = 1; // scale of the whole gnome (shrinks away when popped)
      let hop = 0;
      if (g.popT >= 0) {
        g.popT += dt;
        const u = g.popT / POP;
        if (u >= 1) g.popT = -1;
        else {
          hop = Math.sin(Math.min(1, u * 1.6) * Math.PI) * 1.6;
          k = u < 0.55 ? 1 + 0.35 * Math.sin((u / 0.55) * Math.PI) : 1 - (u - 0.55) / 0.45;
        }
      }
      const show = (!g.found || g.popT >= 0) && Math.abs(s.x - cx) < VIEW && Math.abs(s.z - cz) < VIEW;
      holder.visible = show;
      if (!show) continue;
      const tt = t + g.ph;
      body.position.y = 0.12 + Math.abs(Math.sin(tt * 2.2)) * 0.32 + hop;
      body.rotation.y = Math.sin(tt * 0.9) * 0.55 + (g.popT >= 0 ? g.popT * 14 : 0);
      body.scale.setScalar(SCALE * k);
      sparks.position.y = body.position.y;
      sparks.rotation.y = tt * 1.6;
      sparks.scale.setScalar(SCALE * k * (0.85 + 0.2 * Math.sin(tt * 5.3)));
      heap.scale.setScalar(SCALE * k);
    }
  }

  return { setFound, pop, update, spots: GNOMES, group };
}
