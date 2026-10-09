// Seed Road art coverage: every biome has its own road and cliff style, decorator, road texture and sky ambience,
// and the deepest zones switch on their own ambient fields (cavern glints, reef bubbles, prism motes, aurora).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BIOMES, ROAD_END_Z, WORLD } from '../../src/config.js';
import { LAYOUT } from '../../src/gameplay/layout.js';
import { STYLE, CHANNEL, POOL, DECOR } from '../../src/world/road.js';
import { ROAD_STYLE } from '../../src/world/textures.js';
import { ZONE, createAmbience } from '../../src/world/sky.js';

test('every biome has a road style, decorator, road texture style and sky palette', () => {
  for (const b of BIOMES) {
    assert.ok(STYLE[b.id], `STYLE.${b.id}`);
    assert.equal(typeof DECOR[b.id], 'function', `DECOR.${b.id}`);
    assert.ok(ROAD_STYLE[b.id], `ROAD_STYLE.${b.id}`);
    assert.ok(ZONE[b.id], `ZONE.${b.id}`);
  }
});

test('road styles are complete and only name liquids that exist', () => {
  for (const b of BIOMES) {
    const st = STYLE[b.id];
    assert.ok(st.H > 0 && st.rock.length >= 3, b.id);
    for (const k of ['top', 'ledge', 'ground', 'frame', 'frame2']) assert.equal(typeof st[k], 'string', `${b.id}.${k}`);
    if (st.channel) assert.ok(CHANNEL[st.channel], `${b.id} channel ${st.channel}`);
    if (st.pool) assert.ok(POOL[st.pool], `${b.id} pool ${st.pool}`);
    const rs = ROAD_STYLE[b.id];
    assert.equal(rs.side.length, 3, `${b.id} road side colours`);
    assert.ok(rs.pathCol.length >= 3 && typeof rs.path === 'string', `${b.id} road path`);
  }
  // each zone paints its own path
  const paths = BIOMES.map((b) => ROAD_STYLE[b.id].path);
  assert.equal(new Set(paths).size, paths.length);
});

test('the road ends after the last zone', () => {
  assert.equal(BIOMES[BIOMES.length - 1].id, 'rainbowend');
  assert.equal(ROAD_END_Z, WORLD.road.startZ + BIOMES.length * WORLD.road.biomeLength);
  assert.equal(LAYOUT.roadEndZ, ROAD_END_Z);
});

test('the new zones switch on their own sky and ambient fields', () => {
  const engine = {
    scene: new THREE.Scene(),
    sunOffset: new THREE.Vector3(40, 80, -30),
    renderer: { domElement: { height: 720 }, toneMappingExposure: 1 },
    hemi: new THREE.HemisphereLight(),
    sun: new THREE.DirectionalLight(),
  };
  const amb = createAmbience(engine, { decorDensity: 0.4, drawDistance: 260 }, LAYOUT);
  const cam = new THREE.PerspectiveCamera();
  const sky = amb.root.getObjectByName('sky');
  const at = (id) => {
    const R = LAYOUT.biomeRanges.find((x) => x.id === id);
    cam.position.set(0, 12, (R.minZ + R.maxZ) / 2);
    amb.update(1 / 30, cam);
    return amb.root.children.filter((o) => o.isPoints && o.visible).map((o) => o.name);
  };
  assert.deepEqual(at('caverns'), ['fx-glints']);
  assert.equal(sky.material.uniforms.uAurora.value, 0);
  assert.deepEqual(at('reef'), ['fx-bubbles']);
  assert.deepEqual(at('rainbowend'), ['fx-prisms']);
  assert.ok(sky.material.uniforms.uAurora.value > 0.99, 'aurora over Rainbow\'s End');
  assert.ok(sky.material.uniforms.uStars.value > 0.99, 'stars over Rainbow\'s End');
  // the older zones keep theirs
  assert.deepEqual(at('cloud'), ['fx-heaven']);
  assert.deepEqual(at('frostfall'), ['fx-snow']);
});
