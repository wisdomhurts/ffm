// PLACEHOLDER road monsters (to be replaced by characterful low-poly monsters).
// Contract: createMonster(typeId) -> { object3d, update(dt, s) }
//   s = {time, speed, state:'patrol'|'chase'|'stunned', attackAge (seconds since last catch)}
import * as THREE from 'three';

const COLORS = { stump: 0x7a5230, crab: 0x3fae5a, snapper: 0x6abf3a, lavasprout: 0xff5a1f, lurker: 0x5b4bff };

export function createMonster(type) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ color: COLORS[type] || 0xff00ff }));
  m.position.y = 1.5;
  m.castShadow = true;
  g.add(m);
  return {
    object3d: g,
    update(dt, s) {
      m.position.y = 1.5 + Math.abs(Math.sin(s.time * 8)) * (s.speed > 1 ? 0.6 : 0.1);
    },
  };
}
