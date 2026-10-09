// The whole map's art: tropical island plaza (studded baseplate, beach, ocean), the four family
// gardens, the shops, the Seed Road's twelve biomes, sky, ambience and weather.
// Contract: buildWorld(engine, layout, quality) -> {
//   extraColliders: Box[]            // decorative solid props (trees, rocks) in physics box format
//   update(dt, ctx)                  // ctx = {time, camera, focus:{x,y,z}, event: game.event}
//   setWeather(eventId|null)         // 'golden' | 'diamond' | 'rainbow' | null
//   gardens: [{                       // one per garden slot (index = player slot)
//     setOwner(char, avatarUrl),      // paint the owner's sign / floor accent (avatarUrl may be null)
//     setLocked(locked, secondsLeft), // laser gate on/off
//     setCashPile(amount),            // grow the cash pile model on the COLLECT pad
//     planters: [{ setUnlocked(bool) }],
//     setBase({level, style}), setTreadmillTier(tier), guard, treadmill, decor, base   // see gardens.js
//   }]
//   speedShop: { setBusy(stationIndex, running) }   // Boost Lab / Speed / Warm-Up belts run and glow
// }
// Extras: root (THREE.Group), ambience (sky/weather controller), weather (current id),
//   redrawSigns() (repaints canvas signs once the display font has loaded; called automatically).
import * as THREE from 'three';
import { Merger, setTextureQuality, uTime, redrawSigns, SWAY } from './kit.js';
import { fontsReady } from '../ui/fonts.js';
import { studTexture, rockDetail, grassDetail, sandDetail, noiseTexture } from './textures.js';
import { createAmbience } from './sky.js';
import { buildPlaza } from './plaza.js';
import { buildGardens } from './gardens.js';
import { buildShops } from './shops.js';
import { createPetShop } from './petshop.js';
import { createBoutique } from './boutique.js';
import { buildRoad } from './road.js';
import { createGnomes } from './gnomes.js';
import { createGazetteBoard } from './gazetteBoard.js';

const _dir = new THREE.Vector3();

// Wind: baked foliage (kit.js SWAY weights) wobbles on a slow travelling gust; the phase follows world position.
const SWAY_GLSL = `#include <begin_vertex>
{
  vec3 swP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float swPh = dot(swP.xz, vec2(0.071, 0.053));
  float sw = aSway * SWAY_AMP;
  transformed.x += sw * (sin(uTime * 1.7 + swPh) * 0.7 + sin(uTime * 3.1 + swPh * 2.3) * 0.3);
  transformed.z += sw * 0.6 * sin(uTime * 1.3 + swPh * 1.4 + 1.3);
}`;
function swaying(mat, amp, key) {
  mat.defines = { ...(mat.defines || {}), SWAY_AMP: (0.3 * amp).toFixed(3) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;').replace('#include <begin_vertex>', SWAY_GLSL);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// Ground variety: big soft world-space patches (a little sunnier here, deeper there) break up texture tiling.
function groundVariety(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGroundNoise = { value: noiseTexture() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uGroundNoise;\nvarying vec2 vGroundXZ;')
      .replace('#include <color_fragment>', `#include <color_fragment>
float gVar = texture2D(uGroundNoise, vGroundXZ * 0.0065).r;
diffuseColor.rgb *= mix(vec3(0.86, 0.92, 0.96), vec3(1.1, 1.08, 0.93), smoothstep(0.25, 0.75, gVar));`);
  };
  mat.customProgramCacheKey = () => 'world-ground';
  return mat;
}

function createMaterials(quality = {}) {
  const stud = new THREE.MeshLambertMaterial({ vertexColors: true, map: studTexture() });
  const rock = new THREE.MeshLambertMaterial({ vertexColors: true, map: rockDetail() });
  const grass = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassDetail() });
  const sand = new THREE.MeshLambertMaterial({ vertexColors: true, map: sandDetail() });
  const flat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  // Lit, but also self-illuminated by its own vertex colour (crystals, glowing mushrooms, ember rocks).
  const glowLit = new THREE.MeshLambertMaterial({ vertexColors: true });
  glowLit.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.7;');
  };
  glowLit.customProgramCacheKey = () => 'world-glowlit';
  if (quality.groundVar) {
    groundVariety(grass);
    groundVariety(sand);
  }
  // medium/high: merges with swaying parts draw with this instead of `flat` (kit.js Merger.build)
  SWAY.from = SWAY.material = SWAY.depth = null;
  if (quality.swayAmp > 0) {
    SWAY.from = flat;
    SWAY.material = swaying(new THREE.MeshLambertMaterial({ vertexColors: true }), quality.swayAmp, 'world-sway');
    SWAY.depth = swaying(new THREE.MeshDepthMaterial(), quality.swayAmp, 'world-sway-depth');
  }
  return { stud, flat, rock, rockTop: rock, grass, sand, glow, glowLit };
}

export function buildWorld(engine, layout, quality = engine.quality) {
  quality = quality || engine.quality;
  setTextureQuality(engine.renderer, quality);
  const scene = engine.scene;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const mats = createMaterials(quality);
  const colliders = [];

  const ambience = createAmbience(engine, quality, layout);

  // Home area (plaza + gardens + shops) in its own group so it can be culled deep on the road.
  const home = new THREE.Group();
  home.name = 'home';
  root.add(home);
  const homeCtx = { engine, layout, quality, mats, root: home, colliders, glow: new Merger() };
  const plaza = buildPlaza(homeCtx);
  const gardens = buildGardens(homeCtx);
  const shops = buildShops(homeCtx);
  const petShop = createPetShop({ layout, quality, mats });
  home.add(petShop);
  const boutique = createBoutique({ mats, quality });
  boutique.position.set(layout.shops.wardrobe.x, 0, layout.shops.wardrobe.z);
  home.add(boutique);
  const homeGlow = homeCtx.glow.build(mats.glow, { name: 'home-glow', receiveShadow: false });
  if (homeGlow) home.add(homeGlow);

  const road = buildRoad({ engine, layout, quality, mats, root, colliders });

  let lastEvent;
  const api = {
    root,
    ambience,
    extraColliders: colliders,
    gardens: gardens.gardens,
    speedShop: shops.speed,
    gnomes: createGnomes({ root, quality, mats }), // Golden Gnome Hunt (world/gnomes.js)
    gazette: createGazetteBoard(homeCtx), // The Seed Gazette's plaza billboard (world/gazetteBoard.js)
    get weather() {
      return ambience.weatherId;
    },
    setWeather(id) {
      ambience.setWeather(id || null);
    },
    redrawSigns,
    update(dt, c = {}) {
      const t = c.time ?? uTime.value + dt;
      uTime.value = t;
      const cam = c.camera || engine.camera;
      const ev = c.event ? c.event.type : null;
      if (ev !== lastEvent) {
        lastEvent = ev;
        ambience.setWeather(ev);
      }
      ambience.update(dt, cam);
      // cull whole areas once they are past the fog, and the ones behind the camera: the road's merged meshes
      // (cliff backing reaching out to the horizon) always overlap the view frustum, so three.js can't skip them
      const dd = Math.min(quality.drawDistance, engine.scene.fog.far + 30);
      const cz = cam.position.z;
      const fz = cam.getWorldDirection(_dir).z;
      const ahead = fz < -0.7 ? 40 : dd; // looking home (south) / otherwise
      const behind = fz > 0.7 ? 40 : dd; // looking up the road (north) / otherwise
      home.visible = cz < 66 + behind;
      if (home.visible) {
        plaza.update(dt, t, Math.max(ambience.weather.diamond, ambience.zoneW[6]));
        gardens.update(dt, t);
        shops.update(dt, t);
        petShop.update(dt, t);
        boutique.userData.update(dt, t);
      }
      road.update(dt, t, cz, ahead, behind);
      api.gnomes.update(dt, t, cam);
    },
  };
  // Signs are painted synchronously above; repaint them with "Lilita One" as soon as it has loaded.
  fontsReady(4000).then(() => {
    if (redrawSigns()) return;
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    if (!fonts?.addEventListener) return;
    const retry = () => {
      if (redrawSigns()) fonts.removeEventListener('loadingdone', retry);
    };
    fonts.addEventListener('loadingdone', retry);
  });
  return api;
}
