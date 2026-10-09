// Graphics upgrade rules: quality look flags (phones = 'low' stay free), wind sway baked by the Merger, the shared
// rim light patch, height fog, the sky feeding the shared look uniforms, and the contact-shadow batch.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { QUALITY } from '../../src/core/engine.js';
import { LOOK, rimLit, rimLitTree, installHeightFog } from '../../src/core/shaderfx.js';
import { Merger, SWAY } from '../../src/world/kit.js';
import { createAmbience } from '../../src/world/sky.js';
import { createBlobShadows } from '../../src/fx/blobShadows.js';
import { LAYOUT } from '../../src/gameplay/layout.js';

const FLAGS = ['env', 'fill', 'shadowRadius', 'swayAmp', 'oceanHQ', 'heightFog', 'groundVar', 'bloom'];

test('every quality tier has the look flags, and low (every phone) switches all the extras off', () => {
  for (const [id, q] of Object.entries(QUALITY)) for (const k of FLAGS) assert.ok(k in q, `${id}.${k}`);
  const low = QUALITY.low;
  assert.equal(low.shadows, false);
  for (const k of FLAGS) assert.ok(!low[k], `low.${k} must be off`);
  // softer shadows only where there are shadows; bloom stays off everywhere (see engine.js)
  for (const id of ['medium', 'high']) {
    assert.ok(QUALITY[id].shadowRadius > 1 && QUALITY[id].env && QUALITY[id].fill && QUALITY[id].swayAmp > 0, id);
    assert.equal(QUALITY[id].bloom, false);
  }
});

test('the Merger bakes sway weights only when sway is switched on, and swaps in the swaying material', () => {
  const flat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const build = () => {
    const m = new Merger();
    m.box(0, 0.5, 0, 1, 1, 1, '#888'); // static
    m.box(4, 0.5, 0, 1, 1, 1, '#4c4', { sway: [0, 1] }); // bends: 0 at the bottom, 1 at the top
    m.box(8, 0.5, 0, 1, 1, 1, '#4c4', { sway: 0.5 }); // rigid
    return m;
  };
  SWAY.from = SWAY.material = SWAY.depth = null;
  assert.equal(build().buildGeometry().attributes.aSway, undefined, 'low: no attribute at all');
  assert.equal(build().build(flat).material, flat);

  const sway = new THREE.MeshLambertMaterial({ vertexColors: true });
  const depth = new THREE.MeshDepthMaterial();
  Object.assign(SWAY, { from: flat, material: sway, depth });
  try {
    const geo = build().buildGeometry();
    const a = geo.attributes.aSway;
    assert.ok(a && a.normalized && a.array instanceof Uint8Array, 'normalized byte weights');
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), w = a.array[i] / 255;
      if (x < 2) assert.equal(w, 0, 'static part');
      else if (x < 6) assert.ok(Math.abs(w - y) < 0.01, `bending part follows its height (${w} at y ${y})`);
      else assert.ok(Math.abs(w - 0.5) < 0.01, 'rigid part');
    }
    const cast = build().build(flat, { castShadow: true });
    assert.equal(cast.material, sway, 'swaps to the swaying material');
    assert.equal(cast.customDepthMaterial, depth, 'its shadow sways too');
    // other materials (textured, glowing) keep theirs even with sway weights
    const glow = new THREE.MeshBasicMaterial();
    assert.equal(build().build(glow).material, glow);
    // merges without any swaying part don't change
    const plain = new Merger();
    plain.box(0, 0, 0, 1, 1, 1, '#888');
    assert.equal(plain.build(flat).material, flat);
  } finally {
    SWAY.from = SWAY.material = SWAY.depth = null;
  }
});

test('rimLit shares one program per material kind, keeps earlier patches and only touches lit materials', () => {
  const a = rimLit(new THREE.MeshStandardMaterial({ vertexColors: true }), 0.7);
  const b = rimLit(new THREE.MeshStandardMaterial({ vertexColors: true }), 0.4);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey(), 'strength is a uniform, not a program');
  assert.equal(a.userData.rimK.value, 0.7);
  assert.equal(rimLit(a, 0.1), a);
  assert.equal(a.userData.rimK.value, 0.7, 'patching twice is a no-op');

  const pet = new THREE.MeshStandardMaterial();
  let ran = 0;
  pet.onBeforeCompile = () => ran++;
  pet.customProgramCacheKey = () => 'sas-pet';
  rimLit(pet);
  assert.equal(pet.customProgramCacheKey(), 'rim|sas-pet');
  const sh = { uniforms: {}, vertexShader: '#include <common>', fragmentShader: '#include <common>\n#include <envmap_common_pars_fragment>\n#include <emissivemap_fragment>' };
  pet.onBeforeCompile(sh);
  assert.equal(ran, 1, 'the earlier patch still runs');
  assert.equal(sh.uniforms.uRimColor, LOOK.rimColor, 'shared, sky-fed uniforms');
  assert.equal(sh.uniforms.uRimSun, LOOK.sunDir);
  assert.match(sh.fragmentShader, /totalEmissiveRadiance \+= uRimColor/);

  const basic = new THREE.MeshBasicMaterial();
  rimLit(basic);
  assert.ok(!basic.userData.rimLit, 'unlit materials are left alone');
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial()), new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshPhongMaterial(), basic]));
  rimLitTree(g, 0.5);
  assert.ok(g.children[0].material.userData.rimLit && g.children[1].material[0].userData.rimLit && !basic.userData.rimLit);
});

test('height fog patches three\'s fog chunks once and only thins the middle of the fog range', () => {
  const before = THREE.ShaderChunk.fog_fragment;
  installHeightFog(0.22);
  const after = THREE.ShaderChunk.fog_fragment;
  installHeightFog(0.22);
  assert.equal(THREE.ShaderChunk.fog_fragment, after, 'idempotent');
  if (before !== after) {
    assert.match(after, /fogFactor -= 0\.220 \* smoothstep\( 4\.0, 60\.0, vFogH \) \* 4\.0 \* fogFactor \* \( 1\.0 - fogFactor \)/);
    assert.match(THREE.ShaderChunk.fog_vertex, /vFogH = /);
    assert.match(THREE.ShaderChunk.fog_pars_fragment, /varying float vFogH;/);
  }
  // f - k*4f(1-f) keeps 0 -> 0 and 1 -> 1 and stays monotonic for k < 0.25 (nothing pops at the fog's far end)
  const k = 0.22;
  let prev = -1;
  for (let f = 0; f <= 1.0001; f += 0.01) {
    const g = f - k * 4 * f * (1 - f);
    assert.ok(g >= prev - 1e-9);
    prev = g;
  }
});

test('the sky feeds the shared look uniforms: sun, rim (stronger in dim zones), sky colour and cloud tint', () => {
  const engine = {
    scene: new THREE.Scene(),
    sunOffset: new THREE.Vector3(40, 80, -30),
    renderer: { domElement: { height: 720 }, toneMappingExposure: 1 },
    hemi: new THREE.HemisphereLight(),
    sun: new THREE.DirectionalLight(),
    fill: new THREE.DirectionalLight(),
  };
  const amb = createAmbience(engine, { decorDensity: 0.4, drawDistance: 260 }, LAYOUT);
  const cam = new THREE.PerspectiveCamera();
  const at = (z) => {
    cam.position.set(0, 12, z);
    amb.update(1 / 30, cam);
    return { rim: LOOK.rimColor.value.clone(), sun: LOOK.sunDir.value.clone(), env: LOOK.envScale.value, fill: engine.fill.intensity };
  };
  const plaza = at(0);
  const R = LAYOUT.biomeRanges.find((b) => b.id === 'caverns');
  const caverns = at((R.minZ + R.maxZ) / 2);
  assert.ok(Math.abs(plaza.sun.length() - 1) < 1e-6 && plaza.sun.y > 0, 'unit sun direction above the horizon');
  assert.ok(caverns.sun.x < 0, 'the caverns moon sits on the other side');
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  assert.ok(lum(caverns.rim) > 0.3, 'the caverns rim stays bright enough to outline the Gem Golem');
  assert.ok(caverns.env < plaza.env, 'sky reflections dim in a dark zone');
  assert.ok(plaza.fill > 0 && plaza.fill < engine.hemi.intensity, 'a gentle bounce light');
  const clouds = amb.root.getObjectByName('clouds');
  assert.ok(clouds.material.isShaderMaterial && clouds.material.uniforms.uSunDir === LOOK.sunDir, 'lit clouds share the sun');
});

test('contact shadows: one batch, refilled every frame, capped and skipping invisible casters', () => {
  const parent = new THREE.Group();
  const b = createBlobShadows(parent, { strong: true, cap: 3 });
  assert.equal(parent.children[0], b.mesh);
  assert.ok(b.mesh.visible, 'visible before the first frame so the warm-up compiles it');
  b.begin();
  b.add(1, 0, 2, 1.5, 1);
  b.add(5, 1.2, 2, 1.5, 0); // invisible (cloaked)
  b.end();
  assert.equal(b.mesh.count, 1);
  const m = new THREE.Matrix4();
  b.mesh.getMatrixAt(0, m);
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(p.x === 1 && p.z === 2 && p.y > 0 && p.y < 0.3, 'just above the ground under the caster');
  const a0 = b.mesh.geometry.attributes.aAlpha.array[0];
  b.strong = false; // real shadows on: a fainter contact disc
  b.begin();
  b.add(1, 0, 2, 1.5, 1);
  b.end();
  assert.ok(b.mesh.geometry.attributes.aAlpha.array[0] < a0);
  b.begin();
  for (let i = 0; i < 5; i++) b.add(i, 0, 0, 1, 1);
  b.end();
  assert.equal(b.mesh.count, 3, 'capped');
  b.begin();
  b.end();
  assert.equal(b.mesh.visible, false, 'nothing to draw: no draw call');
  b.dispose();
  assert.equal(parent.children.length, 0);
});
