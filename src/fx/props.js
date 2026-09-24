// PLACEHOLDER small props (to be replaced with polished versions).
// Contract: createBanana() -> Object3D ; createBalloon() -> Object3D ; createNoodle(color) -> Object3D (pool noodle held in the right hand, ~4 studs long, origin at the grip, extends along +Y)
import * as THREE from 'three';

export function createBanana() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.22, 6, 12, Math.PI), new THREE.MeshLambertMaterial({ color: 0xffe135 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.25;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function createBalloon() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshLambertMaterial({ color: 0x3d9bff, transparent: true, opacity: 0.85 }));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function createNoodle(color = '#ff4fa3') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 4.2, 10), new THREE.MeshLambertMaterial({ color }));
  m.position.y = 2.1;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
