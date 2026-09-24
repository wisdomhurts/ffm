// Plant art: planted plants (4 growth stages), seeds, carried pots and the road seed stands.
// Contract:
//   createPlantView(speciesId, mutation) -> { object3d, setGrowth(p 0..1), update(dt, time) }
//      object3d origin = soil surface; fully grown plant roughly 3-5 studs tall.
//   createSeedView(speciesId, mutation)  -> { object3d, update(dt, time) }   // glowing seed (~1.5 studs) for pods, ground and carrying
//      origin = bottom of the seed (so it sits above a head / floats above the ground)
//   createCarriedPlantView(speciesId, mutation) -> { object3d, update(dt, time) } // potted grown plant held overhead (origin = pot bottom, ~3 studs)
//   createPodView(biomeIndex) -> { object3d, setSeed(view|null), update(dt,time) } // the stand a road seed sits on
// Extras: views also expose {speciesId, rarity, tier, mutation}; createPlantView takes an optional {facing} yaw;
// plantTemplate()/seedTemplate()/plantScale() are exported for tools and the dev gallery (src/plants/dev/gallery.js).
//
// Performance: every species/mutation/stage is baked once into a Template (merged, vertex-coloured geometry
// per animation group + shared materials). Views are cheap Object3D trees pointing at shared data; all glow,
// rainbow and sparkle animation runs in shaders from one shared time uniform, so update() is O(1).
import * as THREE from 'three';
import { PLANT, PLANTS, RARITY, MUTATIONS, BIOMES } from '../config.js';
import { Builder, P } from './geometry.js';
import { LOOKS, buildSeedling, seedBody } from './species.js';
import { U, camPos, glowMat } from './materials.js';
import { sparkles, aura, beam, groundGlow, rainbowRing, halo, crownTemplate } from './fx.js';
import { podTemplate, potTemplate } from './pods.js';

const TAU = Math.PI * 2;
const speciesOf = (id) => PLANT[id] || PLANTS[0];
const mutOf = (m) => (MUTATIONS[m] ? m : 'normal');
const tierOf = (sp) => RARITY[sp.rarity]?.tier ?? 0;
const lookOf = (sp) => LOOKS[sp.look] || LOOKS.daisy;

const SEED_SIZE = 1.34; // seeds are ~1.5 studs tall
const MUT_FX = { gold: '#ffe27a', diamond: '#dffcff', rainbow: 'rainbow' };
const MUT_BEAM = { gold: '#ffd23f', diamond: '#7ee8ff', rainbow: 'rainbow' };
function rarityColor(sp) {
  return sp.rarity === 'secret' ? 'rainbow' : RARITY[sp.rarity].color;
}
// Colour for species FX under a mutation (halos can't be rainbow, sparkles can).
function fxColor(c, mut, sprite) {
  if (mut === 'gold') return '#ffd84a';
  if (mut === 'diamond') return '#9ff0ff';
  if (mut === 'rainbow') return sprite ? '#ffffff' : 'rainbow';
  return c;
}

// ------------------------------------------------------------------ templates

const templates = new Map();

/** stage: 0 seed mound, 1 sprout, 2 bud, 3 grown */
export function plantTemplate(speciesId, mutation = 'normal', stage = 3) {
  const sp = speciesOf(speciesId);
  const mut = mutOf(mutation);
  const key = `${sp.id}|${mut}|${stage}`;
  let t = templates.get(key);
  if (t) return t;
  const look = lookOf(sp);
  const secret = sp.rarity === 'secret';
  const b = new Builder({ mutation: mut, secret });
  const o = { c0: sp.colors[0], c1: sp.colors[1], bud: stage === 2, secret, sid: sp.id, mutation: mut };
  if (stage < 2) buildSeedling(b, look, stage, o);
  else look.build(b, o);
  t = b.finish({
    lookAll: stage >= 2 && !!look.lookAll,
    lookClamp: look.lookClamp || 0,
    anim: stage >= 2 ? look.anim || null : null,
    fx: stage === 3 && look.fx ? look.fx(o) : [],
  });
  templates.set(key, t);
  return t;
}

export function seedTemplate(speciesId, mutation = 'normal') {
  const sp = speciesOf(speciesId);
  const mut = mutOf(mutation);
  const key = `seed|${sp.id}|${mut}`;
  let t = templates.get(key);
  if (t) return t;
  const secret = sp.rarity === 'secret';
  const b = new Builder({ mutation: mut, secret });
  const c0 = secret ? '#1d1330' : sp.colors[0];
  const c1 = secret ? sp.colors[0] : sp.colors[1];
  const S = SEED_SIZE;
  seedBody(b, c0, c1, [0, 0, 0], S, [0, 0, 0], { glow: secret ? 0.1 : 0 });
  for (const x of [-0.13, 0.13]) b.add(P.sphere(5, 3), { p: [x * S, 0.56 * S, 0.415 * S], s: [0.065 * S, 0.085 * S, 0.045 * S], c: secret ? '#ffffff' : '#2a1616', keep: true, glow: secret ? 0.8 : 0 });
  b.add(P.cyl(1, 0.8, 4, true), { p: [0, 1.06 * S, 0], s: [0.05 * S, 0.17 * S, 0.05 * S], c: '#4caf45' });
  b.add(new THREE.PlaneGeometry(0.29, 0.17).translate(0.145, 0, 0), { p: [0.02, 1.2 * S, 0], r: [0.25, 0, 0.35], s: S, c: '#63c94f' });
  b.add(new THREE.PlaneGeometry(0.26, 0.15).translate(-0.13, 0, 0), { p: [-0.02, 1.19 * S, 0], r: [-0.25, 0, -0.3], s: S, c: '#4fae45' });
  t = b.finish();
  templates.set(key, t);
  return t;
}

// Display scale so every grown plant fills its 4.8-stud planter nicely: taller/wider rarities get more room.
const FIT = [[4.9, 2.2], [4.9, 2.2], [4.9, 2.2], [5.0, 2.2], [5.1, 2.25], [5.5, 2.35], [5.9, 2.45]];
const fitCache = new Map();
export function plantScale(speciesId) {
  const sp = speciesOf(speciesId);
  let k = fitCache.get(sp.id);
  if (k == null) {
    const t = plantTemplate(sp.id, 'normal', 3);
    const [hmax, rmax] = FIT[tierOf(sp)];
    k = Math.max(1.05, Math.min(1.45, hmax / t.height, rmax / t.radius));
    fitCache.set(sp.id, k);
  }
  return k;
}

// ------------------------------------------------------------------ shared helpers

const _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
function lerpAngle(a, b, k) {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * k;
}
// Yaw (in `frame`'s local space) that points +Z at the camera.
function yawToCamera(frame) {
  _v.copy(camPos).applyMatrix4(_m4.copy(frame.matrixWorld).invert());
  if (_v.x * _v.x + _v.z * _v.z < 0.01) return null;
  return Math.atan2(_v.x, _v.z);
}
// Turn a set of nodes toward the camera (yaw only), smoothly. clamp limits the turn (radians).
function faceCamera(frame, nodes, dt, offset, rate = 2.4, clamp = 0) {
  if (!nodes.length) return;
  let target = yawToCamera(frame);
  if (target == null) return;
  target += offset;
  if (clamp) target = Math.max(-clamp, Math.min(clamp, target));
  const k = Math.min(1, dt * rate);
  for (let i = 0; i < nodes.length; i++) nodes[i].rotation.y = lerpAngle(nodes[i].rotation.y, target, k);
}

// Growth pops: quick squash & stretch overshoot that settles to 1.
const POPS = {
  appear: { from: 0.25, w: 12, d: 7 },
  stage: { from: 0.7, w: 14, d: 7 },
  bloom: { from: 0.45, w: 13, d: 6 },
};
function popAt(kind, t) {
  const p = POPS[kind];
  if (!p || t > 1.4) return 1;
  return 1 - (1 - p.from) * Math.cos(t * p.w) * Math.exp(-t * p.d);
}

/** Rarity + mutation + species effects for one plant stage. Returns {ring, crown} for animation. */
function addPlantFx(sp, mut, tpl, stage, groundNode, fxNode) {
  const tier = tierOf(sp);
  const rc = rarityColor(sp);
  const grown = stage === 3;
  const h = Math.max(1, tpl.height);
  const rx = Math.min(1.9, Math.max(0.8, tpl.radius * 0.85));
  const out = { ring: null, ringSize: 0, crown: null, crownY: 0 };
  if (tier >= 1 && tier <= 2) {
    groundNode.add(groundGlow(rc, tier === 1 ? 3.4 : 3.9, { opacity: tier === 1 ? 0.3 : 0.45 }));
  }
  if (tier >= 3 && tier <= 5) {
    groundNode.add(groundGlow(rc, 3.4, { opacity: 0.22 }));
    out.ringSize = tier >= 4 ? 4.5 : 4.2;
    out.ring = groundGlow(rc, out.ringSize, { texture: 'ring', opacity: grown ? 0.85 : 0.5 });
    groundNode.add(out.ring);
  }
  if (tier >= 6) {
    groundNode.add(groundGlow('#ffffff', 4.4, { texture: 'void', opacity: 0.85, dark: true }));
    out.ringSize = 4.6;
    out.ring = rainbowRing(out.ringSize, grown ? 1 : 0.6);
    groundNode.add(out.ring);
  }
  if (!grown) return out;
  if (tier === 4) {
    fxNode.add(sparkles('twinkle', '#fff0a0', 10, rx * 1.1, h * 0.9, h * 0.2, { size: 0.45, seed: 3 }));
    fxNode.add(sparkles('rise', rc, 6, rx, h * 1.2, 0, { size: 0.16, star: false, seed: 4 }));
  }
  if (tier === 5) {
    fxNode.add(aura(rc, Math.min(1.9, rx * 1.1), h + 1.6, 0.3));
    fxNode.add(sparkles('rise', '#ffb3c6', 16, rx * 1.1, h * 1.3, 0, { size: 0.2, star: false, seed: 5 }));
    fxNode.add(sparkles('twinkle', '#ffffff', 6, rx, h * 0.9, h * 0.2, { size: 0.4, seed: 6 }));
  }
  if (tier >= 6) {
    fxNode.add(aura('rainbow', Math.min(2.0, rx * 1.15), h + 2, 0.35));
    fxNode.add(sparkles('orbit', 'rainbow', 14, rx * 1.15, h * 0.9, h * 0.15, { size: 0.36, seed: 7 }));
    fxNode.add(sparkles('rise', '#1a0b2e', 12, rx * 1.1, h * 1.2, 0, { size: 0.3, star: false, dark: true, intensity: 1.3, seed: 8 }));
    const crown = crownTemplate().instantiate().root;
    crown.scale.setScalar(1.3);
    out.crownY = h + 0.55;
    crown.position.y = out.crownY;
    fxNode.add(crown);
    out.crown = crown;
  }
  if (MUT_FX[mut]) {
    if (mut === 'rainbow') fxNode.add(sparkles('orbit', 'rainbow', 9, rx * 1.05, h * 0.8, h * 0.15, { size: 0.26, star: false, seed: 9 }));
    else fxNode.add(sparkles('twinkle', MUT_FX[mut], 9, rx * 0.9, h * 0.85, h * 0.12, { size: 0.55, seed: mut === 'gold' ? 10 : 11 }));
  }
  for (const f of tpl.meta.fx || []) {
    if (f.kind === 'halo') {
      const s = halo(fxColor(f.color, mut, true), f.size, f.opacity);
      s.position.set(f.p[0], f.p[1], f.p[2]);
      fxNode.add(s);
    } else if (f.kind === 'sparkle') {
      fxNode.add(sparkles(f.mode, fxColor(f.color, mut, false), f.count, f.rx, f.h, f.y0 || 0, { size: f.size, star: f.star, seed: 20 }));
    }
  }
  return out;
}

// ------------------------------------------------------------------ planted plant

/**
 * opts.facing: yaw for the plant's front (its face side). By default a plant in a garden faces the
 * central aisle (where visitors come from); anywhere else it faces the camera it first sees.
 */
export function createPlantView(speciesId, mutation = 'normal', opts = {}) {
  const sp = speciesOf(speciesId);
  const mut = mutOf(mutation);
  const tier = tierOf(sp);
  const baseScale = plantScale(sp.id);
  const root = new THREE.Group();
  root.name = 'plant:' + sp.id;
  const orient = new THREE.Group();
  const sway = new THREE.Group();
  const body = new THREE.Group();
  const fxNode = new THREE.Group();
  const groundNode = new THREE.Group();
  groundNode.position.y = 0.07;
  root.add(groundNode, orient);
  orient.add(sway);
  sway.add(body);
  body.add(fxNode);
  let oriented = opts.facing != null;
  if (oriented) orient.rotation.y = opts.facing;

  const ph = Math.random() * 100;
  const lookOffset = (Math.random() - 0.5) * 0.5;
  let stage = -1;
  let tpl = null;
  let inst = null;
  let looks = [];
  let fx = null;
  let growScale = 1;
  let popKind = null;
  let popT = 99;

  function build(st) {
    if (inst) body.remove(inst.root);
    tpl = plantTemplate(sp.id, mut, st);
    inst = tpl.instantiate();
    body.add(inst.root);
    looks = tpl.meta.lookAll ? [inst.root] : tpl.groups.filter((g) => g.look).map((g) => inst.parts[g.name]);
    for (const n of looks) n.rotation.y = Math.random() - 0.5;
    fxNode.clear();
    groundNode.clear();
    fx = addPlantFx(sp, mut, tpl, st, groundNode, fxNode);
  }

  return {
    object3d: root,
    speciesId: sp.id,
    rarity: sp.rarity,
    tier,
    mutation: mut,
    setGrowth(p) {
      p = Math.max(0, Math.min(1, p || 0));
      const st = p >= 1 ? 3 : p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0;
      if (st !== stage) {
        const first = stage < 0;
        build(st);
        popKind = first ? 'appear' : st === 3 ? 'bloom' : 'stage';
        popT = 0;
        stage = st;
      }
      const k = st === 0 ? p / 0.33 : st === 1 ? (p - 0.33) / 0.33 : st === 2 ? (p - 0.66) / 0.34 : 1;
      growScale = st === 3 ? 1 : st === 2 ? 0.8 + 0.2 * k : 0.72 + 0.28 * k;
    },
    update(dt, t) {
      if (stage < 0) this.setGrowth(1);
      U.time.value = t;
      if (!oriented) {
        oriented = true;
        root.updateWorldMatrix(true, false);
        const x = root.matrixWorld.elements[12];
        const y = Math.abs(x) > 28 ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : yawToCamera(root);
        orient.rotation.y = (y || 0) + (Math.random() - 0.5) * 0.3;
      }
      popT += dt;
      const m = popAt(popKind, popT);
      const s = baseScale * growScale;
      body.scale.set(s * m, s * (m + (1 - m) * 0.35), s * m);
      sway.rotation.z = Math.sin(t * 1.15 + ph) * 0.035;
      sway.rotation.x = Math.sin(t * 0.9 + ph * 1.7) * 0.025;
      faceCamera(orient, looks, dt, lookOffset, 2.4, tpl.meta.lookClamp);
      if (tpl.meta.anim) tpl.meta.anim(inst.parts, t, ph);
      else if (inst.parts.head) inst.parts.head.rotation.z = Math.sin(t * 2 + ph) * 0.08;
      if (fx.ring) fx.ring.scale.set(fx.ringSize * (1 + Math.sin(t * 2.2 + ph) * 0.05), 1, fx.ringSize * (1 + Math.sin(t * 2.2 + ph) * 0.05));
      if (fx.crown) {
        fx.crown.position.y = fx.crownY + Math.sin(t * 1.6 + ph) * 0.12;
        fx.crown.rotation.y = t * 0.9;
      }
    },
  };
}

// ------------------------------------------------------------------ seeds

const SEED_HALO = [2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.8];
const SEED_HALO_A = [0.45, 0.6, 0.7, 0.8, 0.9, 0.95, 0.9];

export function createSeedView(speciesId, mutation = 'normal') {
  const sp = speciesOf(speciesId);
  const mut = mutOf(mutation);
  const tier = tierOf(sp);
  const rc = rarityColor(sp);
  const root = new THREE.Group();
  root.name = 'seed:' + sp.id;
  const spin = new THREE.Group();
  root.add(spin);
  const tpl = seedTemplate(sp.id, mut);
  const inst = tpl.instantiate();
  spin.add(inst.root);
  const cy = 0.56 * SEED_SIZE;
  const h = halo(rc === 'rainbow' ? '#ffffff' : rc, SEED_HALO[tier], SEED_HALO_A[tier], 'halo');
  h.position.y = cy;
  root.add(h);
  if (tier >= 4) root.add(sparkles('twinkle', tier >= 6 ? '#ffffff' : '#fff0a0', 6, 0.85, 1.5, 0.05, { size: 0.4, seed: 31 }));
  if (tier === 5) root.add(sparkles('rise', '#ff9fb4', 7, 0.6, 2.2, 0, { size: 0.16, star: false, seed: 32 }));
  if (tier >= 6) {
    root.add(sparkles('orbit', 'rainbow', 10, 0.9, 0.9, 0.2, { size: 0.28, seed: 33 }));
    root.add(sparkles('rise', '#1a0b2e', 7, 0.6, 2.0, 0, { size: 0.26, star: false, dark: true, intensity: 1.3, seed: 34 }));
  }
  if (MUT_FX[mut]) {
    if (mut === 'rainbow') root.add(sparkles('orbit', 'rainbow', 7, 0.85, 0.8, 0.25, { size: 0.22, star: false, seed: 35 }));
    else root.add(sparkles('twinkle', MUT_FX[mut], 6, 0.55, 1.2, 0.1, { size: 0.42, seed: 36 }));
  }
  const ph = Math.random() * 100;
  const offset = (Math.random() - 0.5) * 0.4;
  const looks = [spin];
  return {
    object3d: root,
    speciesId: sp.id,
    rarity: sp.rarity,
    tier,
    mutation: mut,
    update(dt, t) {
      U.time.value = t;
      // face the viewer, with a playful twirl every few seconds
      const c = ((t * 0.18 + ph) % 1 + 1) % 1;
      const twirl = c < 0.12 ? (1 - Math.cos((c / 0.12) * Math.PI)) * Math.PI : 0;
      faceCamera(root, looks, dt, offset + twirl, c < 0.12 ? 30 : 3);
      inst.root.rotation.z = Math.sin(t * 2.3 + ph) * 0.12;
      inst.root.position.y = Math.abs(Math.sin(t * 2.3 + ph)) * 0.05;
    },
  };
}

// ------------------------------------------------------------------ carried potted plant

export function createCarriedPlantView(speciesId, mutation = 'normal') {
  const sp = speciesOf(speciesId);
  const mut = mutOf(mutation);
  const tier = tierOf(sp);
  const root = new THREE.Group();
  root.name = 'carried:' + sp.id;
  const wob = new THREE.Group();
  root.add(wob);
  const pot = potTemplate().instantiate();
  wob.add(pot.root);
  const tpl = plantTemplate(sp.id, mut, 3);
  const inst = tpl.instantiate();
  const plantNode = new THREE.Group();
  const S = Math.min(0.58, 2.3 / Math.max(2.5, tpl.height)) * (sp.rarity === 'secret' ? 1.08 : 1);
  plantNode.scale.setScalar(S);
  plantNode.position.y = potTemplate().meta.soilY - 0.02;
  plantNode.add(inst.root);
  wob.add(plantNode);
  // small rarity / mutation flourishes
  const fxNode = new THREE.Group();
  plantNode.add(fxNode);
  const h = tpl.height;
  let crown = null;
  if (tier >= 4) fxNode.add(sparkles('twinkle', '#fff0a0', 7, 1.4, h, h * 0.2, { size: 0.5, seed: 41 }));
  if (tier === 5) fxNode.add(sparkles('rise', '#ffb3c6', 8, 1.2, h * 1.2, 0, { size: 0.26, star: false, seed: 42 }));
  if (tier >= 6) {
    fxNode.add(sparkles('orbit', 'rainbow', 10, 1.8, h * 0.8, h * 0.2, { size: 0.5, seed: 43 }));
    crown = crownTemplate().instantiate().root;
    crown.scale.setScalar(1.6);
    crown.position.y = h + 0.6;
    fxNode.add(crown);
  }
  if (MUT_FX[mut]) {
    if (mut === 'rainbow') fxNode.add(sparkles('orbit', 'rainbow', 8, 1.5, h * 0.8, h * 0.15, { size: 0.4, star: false, seed: 44 }));
    else fxNode.add(sparkles('twinkle', MUT_FX[mut], 8, 1.3, h * 0.85, h * 0.1, { size: 0.7, seed: 45 }));
  }
  const looks = tpl.meta.lookAll ? [inst.root] : tpl.groups.filter((g) => g.look).map((g) => inst.parts[g.name]);
  const ph = Math.random() * 100;
  let popT = 0;
  return {
    object3d: root,
    speciesId: sp.id,
    rarity: sp.rarity,
    tier,
    mutation: mut,
    update(dt, t) {
      U.time.value = t;
      popT += dt;
      const m = popAt('stage', popT);
      wob.scale.set(m, m, m);
      wob.rotation.z = Math.sin(t * 5.5 + ph) * 0.06;
      wob.rotation.x = Math.sin(t * 4.1 + ph) * 0.04;
      faceCamera(root, looks, dt, 0, 4, tpl.meta.lookClamp);
      if (tpl.meta.anim) tpl.meta.anim(inst.parts, t, ph);
      if (crown) {
        crown.position.y = h + 0.6 + Math.sin(t * 2 + ph) * 0.15;
        crown.rotation.y = t;
      }
    },
  };
}

// ------------------------------------------------------------------ road seed stand

export function createPodView(biomeIndex = 0) {
  const bi = Math.max(0, Math.min(BIOMES.length - 1, biomeIndex | 0));
  const biomeTier = RARITY[BIOMES[bi].rarity]?.tier ?? 0;
  const tpl = podTemplate(bi);
  const inst = tpl.instantiate();
  const root = new THREE.Group();
  root.name = 'pod:' + bi;
  root.add(inst.root);
  const anchor = new THREE.Group();
  anchor.position.y = tpl.meta.seedY;
  root.add(anchor);
  const top = groundGlow('#ffffff', 2.4, { opacity: 0.5 });
  top.position.y = tpl.meta.topY + 0.03;
  top.visible = false;
  root.add(top);
  if (tpl.meta.halo) {
    const hl = halo(tpl.meta.halo, 3.2, 0.35);
    hl.position.y = tpl.meta.topY;
    root.add(hl);
  }
  const ph = Math.random() * 100;
  let seed = null;
  let bm = null;
  return {
    object3d: root,
    setSeed(view) {
      if (seed) anchor.remove(seed.object3d);
      if (bm) {
        root.remove(bm);
        bm = null;
      }
      seed = view || null;
      if (!seed) {
        top.visible = false;
        return;
      }
      seed.object3d.position.set(0, 0, 0);
      anchor.add(seed.object3d);
      const sp = speciesOf(seed.speciesId);
      const tier = seed.tier ?? tierOf(sp);
      const mut = seed.mutation || 'normal';
      const rc = rarityColor(sp);
      top.material = glowMat(rc === 'rainbow' ? '#ffffff' : rc, { opacity: 0.35 + tier * 0.08 });
      top.visible = true;
      // Loot beam for anything special: lucky (above this biome), mutated, mythic or secret.
      if (tier > biomeTier || tier >= 5 || mut !== 'normal') {
        const col = MUT_BEAM[mut] || rc;
        bm = beam(col, tier >= 6 ? 1.0 : 0.8, tier >= 5 ? 22 : 16, tier >= 6 ? 0.7 : 0.55);
        bm.position.y = tpl.meta.topY;
        root.add(bm);
      }
    },
    update(dt, t) {
      U.time.value = t;
      anchor.position.y = tpl.meta.seedY + Math.sin(t * 2.2 + ph) * 0.18;
      if (seed) seed.update(dt, t);
      if (inst.parts.crystals) inst.parts.crystals.rotation.y = t * 0.5 + ph;
      if (top.visible) {
        const k = 2.4 * (1 + Math.sin(t * 2.2 + ph) * 0.08);
        top.scale.set(k, 1, k);
      }
    },
  };
}
