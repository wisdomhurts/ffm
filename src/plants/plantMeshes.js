// PLACEHOLDER plant art (to be replaced by the full procedural plant library).
// Contract:
//   createPlantView(speciesId, mutation) -> { object3d, setGrowth(p 0..1), update(dt, time) }
//      object3d origin = soil surface; fully grown plant roughly 3-5 studs tall.
//   createSeedView(speciesId, mutation)  -> { object3d, update(dt, time) }   // glowing seed (~1.2 studs) for pods, ground and carrying
//   createCarriedPlantView(speciesId, mutation) -> { object3d, update(dt, time) } // potted grown plant held overhead
//   createPodView(biomeIndex) -> { object3d, setSeed(view|null), update(dt,time) } // the stand a road seed sits on
import * as THREE from 'three';
import { PLANT, RARITY, MUTATIONS } from '../config.js';

function colorOf(speciesId, mutation) {
  const m = MUTATIONS[mutation];
  if (m?.color && m.color !== 'rainbow') return new THREE.Color(m.color);
  return new THREE.Color(PLANT[speciesId].colors[0]);
}

export function createPlantView(speciesId, mutation) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.5), new THREE.MeshLambertMaterial({ color: 0x3f9e4d }));
  stem.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshLambertMaterial({ color: colorOf(speciesId, mutation) }));
  head.position.y = 2.8;
  g.add(stem, head);
  g.traverse((o) => (o.castShadow = true));
  return {
    object3d: g,
    setGrowth(p) {
      const s = 0.2 + 0.8 * p;
      g.scale.setScalar(s);
    },
    update(dt, t) {
      head.rotation.y = t;
    },
  };
}

export function createSeedView(speciesId, mutation) {
  const r = RARITY[PLANT[speciesId].rarity];
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshLambertMaterial({ color: colorOf(speciesId, mutation), emissive: r.glow, emissiveIntensity: 0.4 }));
  const g = new THREE.Group();
  g.add(m);
  return { object3d: g, update(dt, t) { m.rotation.y = t * 2; } };
}

export function createCarriedPlantView(speciesId, mutation) {
  const v = createPlantView(speciesId, mutation);
  v.setGrowth(0.7);
  return v;
}

export function createPodView(biomeIndex) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.8, 10), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
  base.position.y = 0.4;
  g.add(base);
  let seed = null;
  return {
    object3d: g,
    setSeed(view) {
      if (seed) g.remove(seed.object3d);
      seed = view;
      if (view) {
        view.object3d.position.y = 2;
        g.add(view.object3d);
      }
    },
    update(dt, t) {
      if (seed) seed.update(dt, t);
    },
  };
}
