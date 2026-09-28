// Base decorations, the Guard Gnome and the golden statue. OWNER: base-decor agent.
// Contract (placeholder until the art lands):
//   createDecor(id, {color, quality}) -> THREE.Object3D   one BASE_STYLES.decor item, centred on its 5x5 spot,
//       standing on y = 0, front facing +Z (the caller rotates it to face the garden's gate). Optional
//       object.userData.update(dt, t) for animation (water, flames, windmill blades...).
//   createGuardGnome({color}) -> {object3d, swing(), update(dt, t, {alert})}  the Base Lv 5 guard at L.guard:
//       swing() plays one noodle bonk; alert = a thief is in the garden (it hops and looks around).
import * as THREE from 'three';

const PLACEHOLDER = new THREE.MeshLambertMaterial({ color: 0xff66cc });

export function createDecor(id) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3).translate(0, 1.5, 0), PLACEHOLDER);
  m.name = 'decor:' + id;
  return m;
}

export function createGuardGnome() {
  const object3d = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 8).translate(0, 1.2, 0), PLACEHOLDER);
  return { object3d, swing() {}, update() {} };
}
