// Tutorial beacon (ui/tutorial.js): a bouncing arrow over the next thing to do and a ring pulsing out on the
// ground under it. Three tiny meshes with unlit materials, built once and reused by every game; the arrow draws
// over the world (no depth test) so it still shows behind fences and shops. Nothing is allocated per frame, so
// it costs next to nothing on phones. main.js adds guideWarmup() to its shader warm-up: the first beacon never
// compiles a shader program mid-game.
//   createGuide(scene) -> {
//     set(target|null)                    world point {x, z, y?} (null hides it)
//     update(dt, camera, under?)          bob + pulse; keeps the arrow readable from far away. under: a screen
//                                         height (NDC y) the arrow should stay below when it can (a card across the top)
//     offscreen(camera, w, h, box, out)   is the beacon off screen? out = {show, x, y, angle}: where on the
//                                         screen edge (box = {l, t, r, b} in px) to point at it, angle clockwise from up
//     dispose()
//   }
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const GOLD = 0xffd23f;
const INK = 0x10163a;
const HOVER = 6.4; // arrow centre over the target
const HOVER_TALL = 4.2; // portrait phones: lower, so it shows under the tutorial card (a strip across the top)
const BOB = 0.8;
const PULSE = 1.3; // seconds per ring pulse

let shared = null;
function assets() {
  if (shared) return shared;
  // a chunky arrow pointing down (cone head + shaft), centred on its middle so the outline scales evenly
  const head = new THREE.ConeGeometry(1.25, 1.7, 18).rotateX(Math.PI).translate(0, -0.75, 0);
  const shaft = new THREE.CylinderGeometry(0.52, 0.52, 1.7, 14).translate(0, 0.85, 0);
  const arrow = mergeGeometries([head, shaft], false);
  head.dispose();
  shaft.dispose();
  const ring = new THREE.RingGeometry(1.45, 2.05, 40).rotateX(-Math.PI / 2);
  const over = { toneMapped: false, fog: false, depthTest: false, depthWrite: false, transparent: true };
  shared = {
    arrow,
    ring,
    body: new THREE.MeshBasicMaterial({ color: GOLD, ...over }),
    edge: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, ...over }),
    glow: new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }),
  };
  return shared;
}

function build() {
  const a = assets();
  const group = new THREE.Group();
  group.name = 'tutorial-guide';
  const edge = new THREE.Mesh(a.arrow, a.edge);
  edge.scale.setScalar(1.16);
  edge.renderOrder = 998;
  const body = new THREE.Mesh(a.arrow, a.body);
  body.renderOrder = 999;
  const arrow = new THREE.Group();
  arrow.add(edge, body);
  const ring = new THREE.Mesh(a.ring, a.glow.clone()); // its own opacity (the pulse)
  ring.renderOrder = 2;
  group.add(arrow, ring);
  group.traverse((o) => {
    o.castShadow = o.receiveShadow = false;
    o.frustumCulled = false; // tiny and almost always on screen; saves the bounds checks
  });
  return { group, arrow, ring };
}

/** The beacon's meshes for the shader warm-up (shrunk to nothing: only the programs matter). */
export function guideWarmup() {
  const { group } = build();
  group.name = 'tutorial-guide-warmup';
  group.scale.setScalar(1e-3);
  return group;
}

const V = new THREE.Vector3();

export function createGuide(scene) {
  const { group, arrow, ring } = build();
  group.visible = false;
  scene.add(group);
  let tx = 0, ty = 0, tz = 0;
  let has = false;
  let t = 0;

  return {
    set(target) {
      has = !!target;
      group.visible = has;
      if (!has) return;
      tx = target.x;
      ty = target.y || 0;
      tz = target.z;
    },
    update(dt, camera, under = 2) {
      if (!has) return;
      t += dt;
      // a ball-like bounce: quick at the bottom, floating at the top
      const b = Math.abs(Math.sin(t * 3.1));
      const far = camera ? Math.hypot(camera.position.x - tx, camera.position.z - tz) : 0;
      const s = Math.min(2.6, Math.max(1, far / 28)); // stays readable from across the map
      // (the tip stays clear of the target as the arrow grows)
      let hover = camera && camera.aspect < 0.8 ? Math.max(HOVER_TALL, 2 + 1.7 * s) : HOVER * Math.min(1.5, s);
      if (under < 1 && camera) {
        // hidden behind a card? Lower it until it shows under the card (a vertical line projects about linearly)
        const yg = V.set(tx, ty, tz).project(camera).y;
        const front = V.z < 1;
        const yh = V.set(tx, ty + hover, tz).project(camera).y;
        if (front && yh > under && yg < under) hover = Math.max(1.6 * s + 0.6, (hover * (under - yg)) / (yh - yg));
      }
      arrow.position.set(tx, ty + hover + b * BOB * s, tz);
      arrow.scale.set(s, s * (0.92 + b * 0.1), s);
      const k = (t % PULSE) / PULSE;
      ring.position.set(tx, ty + 0.12, tz);
      ring.scale.setScalar(0.8 + k * 1.1);
      ring.material.opacity = 0.85 * (1 - k);
    },
    offscreen(camera, w, h, box, out) {
      out.show = false;
      if (!has || !camera) return out;
      V.set(tx, ty + HOVER * 0.6, tz).project(camera);
      let x = V.x, y = V.y;
      const behind = V.z > 1;
      if (behind) {
        // behind the camera the projection mirrors through the centre
        x = -x;
        y = -y;
      }
      if (!behind && x > -0.94 && x < 0.94 && y > -0.92 && y < 0.92) return out;
      const cx = w / 2, cy = h / 2;
      let px = (x * w) / 2, py = (-y * h) / 2;
      if (behind && Math.abs(px) < 1 && Math.abs(py) < 1) py = 1; // straight behind: point down
      // walk from the screen centre towards the beacon until the ray leaves the box
      let k = Infinity;
      if (px > 0) k = Math.min(k, (box.r - cx) / px);
      if (px < 0) k = Math.min(k, (box.l - cx) / px);
      if (py > 0) k = Math.min(k, (box.b - cy) / py);
      if (py < 0) k = Math.min(k, (box.t - cy) / py);
      if (!Number.isFinite(k) || k < 0) k = 0;
      out.show = true;
      out.x = cx + px * k;
      out.y = cy + py * k;
      out.angle = Math.atan2(px, -py);
      return out;
    },
    dispose() {
      scene.remove(group);
      ring.material.dispose(); // the shared geometry and materials stay for the next game
    },
  };
}
