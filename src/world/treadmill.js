// Treadmill models shared by the Speed Shop and the home treadmill (Base Lv 6). OWNER: speed-shop agent.
// Contract (placeholder until the art lands):
//   createTreadmill({tier, len, w, quality}) -> {object3d, setTier(tier), update(dt, t, {running})}
//       Built along +Z: the console end at +Z*len/2 (where you run to), the belt's open end at -Z*len/2.
//       Deck top at y = TREADMILL.beltTop. tier = index into TREADMILL.tiers (looks fancier per tier).
//       update(): scroll the belt (always slowly; faster while someone runs on it).
import * as THREE from 'three';

export function createTreadmill({ len = 6.4, w = 2.9 } = {}) {
  const object3d = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, len).translate(0, 0.275, 0), new THREE.MeshLambertMaterial({ color: 0x2c3440 }));
  return { object3d, setTier() {}, update() {} };
}
