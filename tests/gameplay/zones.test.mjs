// The far Seed Road zones (Crystal Caverns, Bubble Reef, Rainbow's End): every plant, monster and rarity has its
// own art, sound and colours, and every table indexed by rarity tier covers Common (0) .. Secret (12). No browser:
// a tiny canvas stand-in lets the plant and monster models build in node.
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : () => ({ addColorStop() {} })), set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeCtx }) };

const { PLANTS, PLANT, BIOMES, RARITIES, RARITY, TOP_TIER } = await import('../../src/config.js');
const { LOOKS } = await import('../../src/plants/species.js');
const { TIER_TABLES, plantTemplate, plantScale } = await import('../../src/plants/plantMeshes.js');
const { STANDS, podTemplate } = await import('../../src/plants/pods.js');
const { MONSTER_TYPES, createMonster } = await import('../../src/characters/monsters.js');
const { GROWLS } = await import('../../src/audio/sfx.js');
const { KIND } = await import('../../src/social/plantIcon.js');
const { BADGE } = await import('../../src/progress/catalog.js');

const NEW_LOOKS = ['prismpetal', 'geodegourd', 'glimmergrape', 'coralcrown', 'pearlclam', 'jellybell', 'infinityrose', 'aurorafern', 'starfruit'];
const SECRET = RARITY.secret.tier;

test('every plant has its own look, and every look its own sticker', () => {
  for (const p of PLANTS) {
    assert.ok(LOOKS[p.look], `${p.id}: look ${p.look}`);
    assert.equal(typeof LOOKS[p.look].build, 'function', p.look);
    assert.ok(KIND[p.look], `${p.look} has a plant icon`);
  }
  const zoneLooks = PLANTS.filter((p) => ['prismatic', 'eternal', 'infinity'].includes(p.rarity)).map((p) => p.look);
  assert.deepEqual([...zoneLooks].sort(), [...NEW_LOOKS].sort());
  for (const id of NEW_LOOKS) {
    const L = LOOKS[id];
    assert.equal(typeof L.leaf, 'function', `${id} seedling leaf`);
    assert.equal(typeof L.anim, 'function', `${id} anim`);
    assert.equal(typeof L.fx, 'function', `${id} fx`);
    assert.ok(L.sproutTop || L.sprout, `${id} sprout`);
  }
  // all the new stickers differ from each other
  assert.equal(new Set(NEW_LOOKS.map((l) => KIND[l])).size, NEW_LOOKS.length);
});

test('the new plants build at every stage and stay as light as the other top plants', () => {
  for (const p of PLANTS.filter((x) => NEW_LOOKS.includes(x.look))) {
    for (const mut of ['normal', 'rainbow']) {
      for (let st = 0; st <= 3; st++) {
        const t = plantTemplate(p.id, mut, st);
        assert.ok(t.tris > 0 && t.tris < 1200, `${p.id} ${mut} stage ${st}: ${t.tris} triangles`);
      }
    }
    const t = plantTemplate(p.id, 'normal', 3);
    const draws = t.skin ? t.skin.meshes.length : t.groups.reduce((a, g) => a + g.meshes.length, 0);
    assert.ok(draws <= 3, `${p.id}: ${draws} draw calls`);
    // grown, it towers over its planter like the other top rarities without spilling far out of it
    const h = t.height * plantScale(p.id);
    assert.ok(h > 6 && h <= 7.15, `${p.id} shown ${h.toFixed(2)} studs tall`);
    assert.ok(t.radius * plantScale(p.id) <= 2.75, `${p.id} fits its planter`);
    // the animation runs on its own parts
    const inst = t.instantiate();
    for (let k = 0; k < 5; k++) t.meta.anim?.(inst.parts, k * 0.3, 1.7);
  }
});

test('tables indexed by rarity tier cover Common .. Secret, and Secret plants look exactly as before', () => {
  assert.equal(RARITIES.length, SECRET + 1);
  const { FIT, TOP_FX, SEED_HALO, SEED_HALO_A } = TIER_TABLES;
  for (const [name, list] of [['FIT', FIT], ['SEED_HALO', SEED_HALO], ['SEED_HALO_A', SEED_HALO_A]]) {
    assert.equal(list.length, RARITIES.length, `${name} has a row per rarity`);
  }
  // one sparkle flavour per road rarity above Mythic (Celestial = tier 6 .. the top road tier)
  assert.equal(TOP_FX.length, TOP_TIER - 6 + 1);
  for (const f of TOP_FX) assert.ok(f.spark && f.rise && ['twinkle', 'orbit', 'rise'].includes(f.mode));
  // the Secret rows did not move when the new rarities slid in under them
  assert.deepEqual(FIT[SECRET], { hmax: 7.1, rmax: 2.6, hmin: 6.5, kmax: 1.9 });
  assert.equal(SEED_HALO[SECRET], 3.8);
  assert.equal(SEED_HALO_A[SECRET], 0.9);
  // rarer road plants never get shorter
  for (let t = 1; t <= TOP_TIER; t++) assert.ok(FIT[t].hmax >= FIT[t - 1].hmax && SEED_HALO[t] >= SEED_HALO[t - 1], `tier ${t}`);
  // one seed stand per biome, and every stand builds
  assert.equal(STANDS.length, BIOMES.length);
  BIOMES.forEach((b, i) => {
    const t = podTemplate(i);
    assert.ok(t.meta.seedY > t.meta.topY && t.tris < 1000, `${b.id} stand`);
  });
});

test('every road monster has its own model and voice', () => {
  for (const b of BIOMES.slice(1)) {
    assert.ok(MONSTER_TYPES.includes(b.monster.id), `${b.monster.id} has a builder`);
    assert.ok(GROWLS[b.monster.id], `${b.monster.id} growls`);
  }
  for (const type of ['golem', 'puffer', 'comet']) {
    const m = createMonster(type);
    for (const state of ['patrol', 'chase', 'stunned']) {
      for (let i = 0; i < 12; i++) m.update(0.05, { time: i * 0.05, speed: state === 'chase' ? 40 : 6, state, attackAge: i * 0.05 });
    }
    let draws = 0;
    m.object3d.traverse((o) => (draws += o.isMesh ? 1 : 0));
    assert.ok(draws > 3 && draws <= 12, `${type}: ${draws} draw calls`);
    m.dispose();
  }
});

test('every rarity has a label colour, and the far zones have badges', () => {
  const css = fs.readFileSync(new URL('../../src/ui/styles.js', import.meta.url), 'utf8');
  for (const r of RARITIES) assert.ok(css.includes(`.rar-${r.id}{`), `.rar-${r.id}`);
  const deepest = BADGE.rainbowend;
  assert.deepEqual(deepest.tiers, [BIOMES.length]);
  assert.equal(deepest.stat({ deepest: 12 }), 12);
  assert.ok(deepest.how().includes(BIOMES[BIOMES.length - 1].name));
  assert.equal(BADGE.infinity.stat({ seed_infinity: 1 }), 1);
  assert.deepEqual(BADGE.skywalker.tiers, [9], 'Sky Walker keeps its goal');
  assert.ok(PLANT.infinityrose && RARITY.infinity.tier === TOP_TIER);
});
