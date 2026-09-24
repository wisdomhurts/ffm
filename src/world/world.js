// PLACEHOLDER world art (to be replaced by the full Roblox-style map).
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
import * as THREE from 'three';
import { BIOMES, WORLD } from '../config.js';

export function buildWorld(engine, layout) {
  const scene = engine.scene;
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0xbfe7ff, 120, 420);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 140), new THREE.MeshLambertMaterial({ color: 0x9aa4b2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -3);
  ground.receiveShadow = true;
  scene.add(ground);
  BIOMES.forEach((b, i) => {
    const r = layout.biomeRanges[i];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.road.width, r.maxZ - r.minZ), new THREE.MeshLambertMaterial({ color: b.ground }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.01, (r.minZ + r.maxZ) / 2);
    m.receiveShadow = true;
    scene.add(m);
  });
  const mat = new THREE.MeshLambertMaterial({ color: 0x6b4f3a });
  for (const b of layout.colliders) {
    if (b.tag === 'wall') continue;
    const h = Math.min(b.maxY - b.minY, b.tag === 'cliff' ? 20 : b.tag === 'fence' ? 6 : b.maxY);
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, h, b.maxZ - b.minZ), mat);
    m.position.set((b.minX + b.maxX) / 2, h / 2, (b.minZ + b.maxZ) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  return {
    extraColliders: [],
    update() {},
    setWeather() {},
    gardens: [0, 1, 2, 3].map(() => ({ setOwner() {}, setLocked() {}, setCashPile() {}, planters: Array.from({ length: 10 }, () => ({ setUnlocked() {} })) })),
  };
}
