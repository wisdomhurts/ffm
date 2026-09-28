// Egg drops: an egg floating down under a bunch of balloons, a light beam + ground ring marking where it
// will land (visible from far away), then a glowing egg that wobbles on the ground and blinks before it
// floats away. OWNER: eggs agent. Contract (placeholder until the art lands):
//   createDropView(eggId) -> {object3d, update(dt, t, {y, landed, expiring}), dispose()}
//     object3d: place at the drop's ground point (x, 0, z); y = the egg's current height above the ground.
//     expiring: 0..1 during the last seconds on the ground (blink faster), 0 otherwise.
import * as THREE from 'three';
import { createEgg } from './eggs.js';

export function createDropView(eggId) {
  const object3d = new THREE.Group();
  const egg = createEgg(eggId);
  egg.scale.setScalar(2);
  object3d.add(egg);
  return {
    object3d,
    update(dt, t, { y = 0 } = {}) {
      egg.position.y = y;
    },
    dispose() {
      object3d.parent?.remove(object3d);
    },
  };
}
