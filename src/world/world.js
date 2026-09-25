// The whole map's art: tropical island plaza (studded baseplate, beach, ocean), the four family
// gardens, the shops, the Seed Road's six biomes, sky, ambience and weather.
// Contract: buildWorld(engine, layout, quality) -> {
//   extraColliders: Box[]            // decorative solid props (trees, rocks) in physics box format
//   update(dt, ctx)                  // ctx = {time, camera, focus:{x,y,z}, event: game.event}
//   setWeather(eventId|null)         // 'golden' | 'diamond' | 'rainbow' | null
//   gardens: [{                       // one per garden slot (index = player slot)
//     setOwner(char, avatarUrl),      // paint the owner's sign / floor accent (avatarUrl may be null)
//     setLocked(locked, secondsLeft), // laser gate on/off
//     setCashPile(amount),            // grow the cash pile model on the COLLECT pad
//     planters: [{ setUnlocked(bool) }],
//   }]
// }
// Extras: root (THREE.Group), ambience (sky/weather controller), weather (current id),
//   redrawSigns() (repaints canvas signs once the display font has loaded; called automatically).
import * as THREE from 'three';
import { Merger, setTextureQuality, uTime, redrawSigns } from './kit.js';
import { fontsReady } from '../ui/fonts.js';
import { studTexture, rockDetail, grassDetail, sandDetail } from './textures.js';
import { createAmbience } from './sky.js';
import { buildPlaza } from './plaza.js';
import { buildGardens } from './gardens.js';
import { buildShops } from './shops.js';
import { createPetShop } from './petshop.js';
import { buildRoad } from './road.js';

function createMaterials() {
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
  return { stud, flat, rock, rockTop: rock, grass, sand, glow, glowLit };
}

export function buildWorld(engine, layout, quality = engine.quality) {
  quality = quality || engine.quality;
  setTextureQuality(engine.renderer, quality);
  const scene = engine.scene;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const mats = createMaterials();
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
  const homeGlow = homeCtx.glow.build(mats.glow, { name: 'home-glow', receiveShadow: false });
  if (homeGlow) home.add(homeGlow);

  const road = buildRoad({ engine, layout, quality, mats, root, colliders });

  let lastEvent;
  const api = {
    root,
    ambience,
    extraColliders: colliders,
    gardens: gardens.gardens,
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
      // cull whole areas once they are past the fog
      const dd = Math.min(quality.drawDistance, engine.scene.fog.far + 30);
      const cz = cam.position.z;
      home.visible = cz < 66 + dd;
      if (home.visible) {
        plaza.update(dt, t, Math.max(ambience.weather.diamond, ambience.zoneW[6]));
        gardens.update(dt, t);
        shops.update(dt, t);
        petShop.update(dt, t);
      }
      road.update(dt, t, cz, dd);
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
