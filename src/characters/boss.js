// Big Chomp the Garden Gobbler: the world boss's caterpillar (the rules live in gameplay/boss.js). Goofy and cute:
// big googly eyes, buck teeth that munch, pom-pom antennae, a squash-and-stretch crawl, a flinch on every hit,
// a big burp when it gives up and a pop when it bursts. Cheap on phones: its body segments are ONE instanced
// mesh and the head a few merged vertex-coloured meshes on the monsters' shader program; bossWarmup() hands
// main.js's shader warm-up the one new variant (instanced, with instance colours).
// Contract: createBoss() -> {object3d, head, update(dt, s), hit(mine), pop(), burp(), done, dispose()}
//   s = {x, z, yaw, state: 'crawl'|'munch'|'leave', hp01, gone}: x/z/yaw are game.boss's centre and heading; the
//   head sits BOSS.body.front ahead of it and the body chains behind the head in world space (object3d stays at
//   the origin). `gone`: the boss left the world (it shrinks away). `done` turns true once it has popped or shrunk.
// createCrown() -> {object3d, dispose()}: the gold crown the top bonker wears.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOSS } from '../config.js';

const SEGS = 7; // + the head = 8 segments
const HEAD_R = 2.9; // the head is modelled at this radius...
const HS = 1.42; // ...and drawn this much bigger (it's GIANT: its head alone is taller than Dad)
const R0 = 3.4, R1 = 2.0; // body segment radii, neck to tail
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------ geometry (built once, shared)

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A vertex-coloured, transformed, non-indexed copy of `geo` (uv dropped). */
function vc(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...(typeof scl === 'number' ? [scl, scl, scl] : scl)));
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r;
    arr[i + 1] = c.g;
    arr[i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merge(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  g.userData.shared = true; // views skip shared geometry on dispose
  return g;
}

const sph = (w = 14, h = 10) => new THREE.SphereGeometry(1, w, h);

/** Recolour vertices by height: `top` above, `belly` below (unit sphere space, before scaling). */
function belly(g, top, low, y0 = -0.45, y1 = 0.15) {
  const p = g.attributes.position;
  const c = g.attributes.color;
  const A = new THREE.Color(top), B = new THREE.Color(low), T = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = clamp01((p.getY(i) - y0) / (y1 - y0));
    T.copy(B).lerp(A, k * k * (3 - 2 * k));
    c.setXYZ(i, T.r, T.g, T.b);
  }
  return g;
}

let GEO = null;
function geo() {
  if (GEO) return GEO;
  const LIME = '#86dc45', BELLY = '#f6e46b', FOOT = '#ffa23a';
  // a body segment (unit radius): lime back fading into a yellow belly, polka dots, a little tuft and two stubby feet
  const seg = [belly(vc(sph(16, 12), LIME), LIME, BELLY)];
  const DOTS = [[0.35, 0.82, 0.32, '#ff6fb5'], [-0.55, 0.7, -0.25, '#b36bff'], [0.62, 0.45, -0.5, '#5cc8ff'], [-0.2, 0.6, 0.7, '#ffd23f']];
  for (const [x, y, z, col] of DOTS) {
    const n = new THREE.Vector3(x, y, z).normalize();
    const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    seg.push(vc(sph(10, 6), col, [n.x * 0.97, n.y * 0.97, n.z * 0.97], [rot.x, rot.y, rot.z], [0.24, 0.06, 0.24]));
  }
  seg.push(vc(new THREE.ConeGeometry(0.09, 0.42, 5), '#4f9d2f', [0.12, 1.12, 0], [0, 0, -0.35]));
  seg.push(vc(new THREE.ConeGeometry(0.09, 0.36, 5), '#4f9d2f', [-0.12, 1.1, 0.05], [0, 0, 0.4]));
  for (const s of [-1, 1]) seg.push(vc(sph(10, 7), FOOT, [s * 0.62, -0.82, 0.1], [0, 0, 0], [0.26, 0.2, 0.32]));

  // the head (real size): lime ball, cream muzzle, rosy cheeks, brows, two big buck teeth
  const head = [belly(vc(sph(20, 14), LIME, [0, 0, 0], [0, 0, 0], [HEAD_R * 1.04, HEAD_R * 0.96, HEAD_R]), LIME, '#c9ec6a', -3, 1)];
  head.push(vc(sph(16, 10), '#fff2b8', [0, -0.75, 1.55], [0, 0, 0], [1.95, 1.35, 1.45]));
  for (const s of [-1, 1]) {
    head.push(vc(sph(12, 8), '#ff8fb4', [s * 1.78, -0.42, 2.3], [0, s * 0.62, 0], [0.62, 0.42, 0.14]));
    head.push(vc(new THREE.BoxGeometry(0.95, 0.2, 0.25), '#2f5a1f', [s * 1.15, 2.75, 1.9], [0.35, 0, s * -0.32]));
    head.push(vc(new THREE.BoxGeometry(0.5, 0.62, 0.22), '#ffffff', [s * 0.29, -0.52, 3.0], [-0.12, 0, 0]));
  }
  // a googly eye white (unit size: each eye scales round its own middle)
  const white = merge([vc(sph(16, 12), '#ffffff')]);
  // a pupil: black, flat, with a shine (it slides round inside its white)
  const pupil = merge([vc(sph(12, 8), '#141018', [0, 0, 0], [0, 0, 0], [0.5, 0.5, 0.22]), vc(sph(8, 6), '#ffffff', [0.16, 0.18, 0.18], [0, 0, 0], 0.13)]);
  // the mouth: a dark oval with a tongue (it opens by scaling y)
  const mouth = merge([vc(sph(14, 10), '#5a0f2a', [0, 0, 0], [0, 0, 0], [1.05, 1, 0.3]), vc(sph(10, 6), '#ff6f91', [0, -0.45, 0.12], [0, 0, 0], [0.62, 0.4, 0.22])]);
  // pom-pom antennae (pivot at the top of the head)
  const ant = [];
  for (const s of [-1, 1]) {
    const tip = [s * 1.0, 2.4, -0.25];
    const d = new THREE.Vector3(...tip);
    const len = d.length();
    const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    ant.push(vc(new THREE.CylinderGeometry(0.1, 0.14, len, 6).translate(0, len / 2, 0), '#3d7a2a', [0, 0, 0], [rot.x, rot.y, rot.z]));
    ant.push(vc(sph(12, 8), '#ffe14d', tip, [0, 0, 0], 0.5));
  }
  GEO = { seg: merge(seg), head: merge(head), white, pupil, mouth, ant: merge(ant) };
  return GEO;
}
const EYE = { x: 1.2, y: 1.45, z: 2.0, r: 1.12 };

// ------------------------------------------------------------------ the caterpillar

export function createBoss() {
  const G = geo();
  const root = new THREE.Group();
  root.name = 'boss-big-chomp';
  // one material for body and head (same program as the monsters' vertex-coloured plastic); it flashes on hits
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, emissive: 0x000000 });
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0 });
  const body = new THREE.InstancedMesh(G.seg, mat, SEGS);
  body.castShadow = body.receiveShadow = true;
  body.frustumCulled = false; // instances live anywhere in the world; the binding hides it when far away
  const tint = new THREE.Color();
  for (let i = 0; i < SEGS; i++) body.setColorAt(i, i % 2 ? tint.setRGB(0.9, 1, 0.78) : tint.setRGB(1, 1, 1));
  body.instanceColor.needsUpdate = true;
  root.add(body);

  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  root.add(head);
  const add = (g, m, parent, cast = false) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = cast;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  add(G.head, mat, head, true);
  const whites = [-1, 1].map((s) => {
    const w = add(G.white, eyeMat, head);
    w.position.set(s * EYE.x, EYE.y, EYE.z);
    return w;
  });
  const pupils = [-1, 1].map(() => add(G.pupil, mat, head));
  const mouth = add(G.mouth, mat, head);
  mouth.position.set(0, -0.95, 2.78);
  const ant = add(G.ant, mat, head);
  ant.position.set(0, HEAD_R * 0.82, -0.1);

  // segment radii and the gaps between neighbours (straight, the tail is BOSS.body.front + back behind the head)
  const rad = [], gap = [];
  let sum = 0;
  for (let i = 0; i < SEGS; i++) {
    rad.push(lerp(R0, R1, i / (SEGS - 1)));
    gap.push((i ? rad[i - 1] : HEAD_R * HS * 0.8) + rad[i]);
    sum += gap[i];
  }
  const LEN = BOSS.body.front + BOSS.body.back;
  for (let i = 0; i < SEGS; i++) gap[i] *= LEN / sum;
  const sx = new Float32Array(SEGS), sz = new Float32Array(SEGS), syaw = new Float32Array(SEGS);
  // googly pupils: offset + velocity in the eye's face plane
  const eyes = [0, 1].map(() => ({ x: 0, y: -0.15, vx: 0, vy: 0 }));

  let ready = false;
  let hx = 0, hz = 0, hvx = 0, hvz = 0, yaw = 0;
  let t = Math.random() * 10, phase = 0, move = 0, munch = 0;
  let grow = 0; // 0 -> 1 as it squeezes out of the road gate
  let hitT = 0, burpT = 0, popT = -1, goneT = 0, flash = 0;
  let antW = 0, antV = 0;

  const api = {
    object3d: root,
    head,
    done: false,
    /** Ow! A squash, wide eyes and a white flash (a big one for your own hits: `mine`). */
    hit(mine = false) {
      hitT = 1;
      flash = Math.max(flash, mine ? 1 : 0.3);
      antV += 6;
      for (const e of eyes) {
        e.vx += (Math.random() - 0.5) * 9;
        e.vy += 3 + Math.random() * 3;
      }
    },
    /** Burst! It puffs up for a moment and is gone (the binding throws the confetti and seeds). */
    pop() {
      if (popT < 0) popT = 0;
    },
    /** BUUURP (time's up: it crawls away). */
    burp() {
      burpT = 1.4;
      antV -= 5;
    },
    update(dt, s) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      t += dt;
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      const tx = s.x + fx * BOSS.body.front, tz = s.z + fz * BOSS.body.front;
      if (!ready || (tx - hx) ** 2 + (tz - hz) ** 2 > 20 * 20) {
        ready = true;
        hx = tx;
        hz = tz;
        yaw = s.yaw;
        let px = hx, pz = hz;
        for (let i = 0; i < SEGS; i++) {
          px -= fx * gap[i];
          pz -= fz * gap[i];
          sx[i] = px;
          sz[i] = pz;
          syaw[i] = s.yaw;
        }
      }
      // the head glides after the rules' position (online it arrives in steps); the body follows the head
      const ox = hx, oz = hz;
      hx = damp(hx, tx, 5, dt);
      hz = damp(hz, tz, 5, dt);
      const vx = dt > 0 ? (hx - ox) / dt : 0, vz = dt > 0 ? (hz - oz) / dt : 0;
      const ax = dt > 0 ? (vx - hvx) / dt : 0, az = dt > 0 ? (vz - hvz) / dt : 0;
      hvx = vx;
      hvz = vz;
      yaw += wrap(s.yaw - yaw) * (1 - Math.exp(-5 * dt));
      move = damp(move, clamp01(Math.hypot(vx, vz) / 4), 6, dt);
      munch = damp(munch, s.state === 'munch' ? 1 : 0, 4, dt);
      if (!s.gone) grow = Math.min(1, grow + dt / 0.9);
      else if (popT < 0) goneT = Math.min(1, goneT + dt / 0.7);
      if (popT >= 0) popT += dt;
      hitT = Math.max(0, hitT - dt * 4);
      burpT = Math.max(0, burpT - dt);
      flash = Math.max(0, flash - dt * 9);
      // squeeze out with a springy overshoot, shrink away when gone, puff up when popping
      const gx = grow - 1;
      const g0 = 1 + 2.70158 * gx * gx * gx + 1.70158 * gx * gx; // ease out with a little overshoot
      const gs = Math.max(0.02, g0 * (1 - goneT) * (popT >= 0 ? 1 + Math.min(popT, 0.2) * 2.2 : 1));
      if (popT > 0.2 || goneT >= 1) {
        root.visible = false;
        api.done = true;
        return;
      }
      root.visible = true;

      // body: chain each segment after the one in front, then relax it a little towards a straight line
      phase += dt * (1.4 + move * 7 + munch * 1.6);
      let px = hx, pz = hz, pyaw = yaw;
      const relax = 1 - Math.exp(-(0.4 + munch) * dt);
      for (let i = 0; i < SEGS; i++) {
        const gi = gap[i] * gs;
        let dx = sx[i] - px, dz = sz[i] - pz;
        const sxi = px - Math.sin(pyaw) * gi, szi = pz - Math.cos(pyaw) * gi;
        dx += (sxi - sx[i]) * relax;
        dz += (szi - sz[i]) * relax;
        const d = Math.hypot(dx, dz) || 1;
        sx[i] = px + (dx / d) * gi;
        sz[i] = pz + (dz / d) * gi;
        syaw[i] = Math.atan2(px - sx[i], pz - sz[i]);
        px = sx[i];
        pz = sz[i];
        pyaw = syaw[i];
      }
      for (let i = 0; i < SEGS; i++) {
        const w = Math.sin(phase - i * 0.9);
        const amp = 0.35 + move * 0.65;
        const k = Math.max(0, hitT - i * 0.07);
        const sy = (1 + 0.15 * w * amp) * (1 - 0.2 * k);
        const sxz = (1 - 0.07 * w * amp) * (1 + 0.14 * k);
        const r = rad[i] * gs;
        const lift = Math.max(0, w) * 0.8 * move * gs;
        _m.compose(_v.set(sx[i], r * 0.9 * sy + lift, sz[i]), _q.setFromAxisAngle(_s.set(0, 1, 0), syaw[i]), _s.set(r * sxz, r * sy, r * sxz));
        body.setMatrixAt(i, _m);
      }
      body.instanceMatrix.needsUpdate = true;

      // head: bob along with the crawl, nod as it chomps, rear back on a hit, look up for a burp
      const chomp = munch * Math.max(0, Math.sin(t * 7.5));
      const burp = burpT > 0 ? Math.sin(Math.min(1, (1.4 - burpT) / 0.5) * Math.PI * 0.5) * clamp01(burpT / 0.4) : 0;
      const bob = Math.max(0, Math.sin(phase + 0.9)) * 0.55 * move;
      const back = hitT * 0.9;
      head.position.set(hx - Math.sin(yaw) * back, (HEAD_R * HS * 0.98 + bob + hitT * 0.5 + burp * 0.8) * gs, hz - Math.cos(yaw) * back);
      head.rotation.set(-0.14 * chomp - 0.28 * hitT - 0.55 * burp, yaw, Math.sin(t * 1.7) * 0.05);
      const hs = gs * HS;
      head.scale.set(hs * (1 + 0.1 * hitT), hs * (1 - 0.1 * hitT + 0.08 * burp), hs * (1 + 0.1 * hitT));
      // mouth: a happy little gap crawling, big munches, an "O" when hit, wide open to burp
      let open = 0.22 + chomp * 0.85;
      open = Math.max(open, hitT * 0.9, burp * 1.3);
      mouth.scale.set(1 + burp * 0.25, open, 1);
      // eyes pop wider on a hit
      const ew = 1 + hitT * 0.25 + burp * 0.1;
      for (const w of whites) w.scale.setScalar(EYE.r * ew);

      // googly pupils: pushed by the head's moves, they sag, spring back and bounce off the rim; dizzy when low
      const cy = Math.cos(yaw), sy0 = Math.sin(yaw);
      const side = (ax * cy - az * sy0) * 0.012;
      const dizzy = s.hp01 < 0.25 ? 1 : 0;
      for (let k = 0; k < 2; k++) {
        const e = eyes[k];
        let fxp = -side - e.x * 28 - e.vx * 2.6;
        let fyp = -(e.y + 0.12) * 28 - e.vy * 2.6; // rests a little low (they sag)
        if (dizzy) {
          const a = t * 9 + k * Math.PI;
          fxp += Math.cos(a) * 30;
          fyp += Math.sin(a) * 30;
        }
        e.vx += fxp * dt;
        e.vy += fyp * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const L = 0.55;
        const l = Math.hypot(e.x, e.y);
        if (l > L) {
          e.x *= L / l;
          e.y *= L / l;
          const dn = (e.vx * e.x + e.vy * e.y) / (L * L);
          if (dn > 0) {
            e.vx -= 1.5 * dn * e.x;
            e.vy -= 1.5 * dn * e.y;
          }
        }
        const s1 = k ? 1 : -1;
        const zr = EYE.r * ew * 0.93;
        const z = Math.sqrt(Math.max(0.05, zr * zr - e.x * e.x - e.y * e.y));
        const p = pupils[k];
        p.position.set(s1 * EYE.x + e.x * ew, EYE.y + e.y * ew, EYE.z + z);
        p.rotation.set(-Math.atan2(e.y, z), Math.atan2(e.x, z), 0);
        p.scale.setScalar(1 - hitT * 0.25);
      }
      // antennae wobble (a damped spring kicked by the crawl and by hits)
      antV += (-60 * antW - 4 * antV - (ax * sy0 + az * cy) * 0.01) * dt;
      antW += antV * dt;
      ant.rotation.set(antW * 0.35 - 0.05 + Math.sin(t * 2.3) * 0.06, 0, Math.sin(t * 3.1) * 0.08);
      // hit flash
      mat.emissive.setScalar(flash * 0.24);
    },
    dispose() {
      mat.dispose();
      eyeMat.dispose();
      body.dispose();
    },
  };
  return api;
}

// ------------------------------------------------------------------ the champ's crown

let CROWN = null;
function crownGeo() {
  if (CROWN) return CROWN;
  const GOLD = '#ffc82e';
  const parts = [vc(new THREE.CylinderGeometry(0.78, 0.72, 0.5, 14, 1, true), GOLD, [0, 0.25, 0])];
  parts.push(vc(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 14), '#e8a91c', [0, 0.02, 0]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(vc(new THREE.ConeGeometry(0.2, 0.55, 5), GOLD, [Math.sin(a) * 0.72, 0.75, Math.cos(a) * 0.72]));
    parts.push(vc(sph(8, 6), '#fff4c2', [Math.sin(a) * 0.72, 1.05, Math.cos(a) * 0.72], [0, 0, 0], 0.1));
    parts.push(vc(sph(8, 6), i % 2 ? '#ff3d6e' : '#3dc9ff', [Math.sin(a + 0.63) * 0.8, 0.27, Math.cos(a + 0.63) * 0.8], [0, 0, 0], [0.14, 0.14, 0.08]));
  }
  CROWN = merge(parts);
  return CROWN;
}

export function createCrown() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.55, emissive: 0x3a2600 });
  const mesh = new THREE.Mesh(crownGeo(), mat);
  mesh.name = 'boss-crown';
  mesh.castShadow = true;
  return {
    object3d: mesh,
    dispose() {
      mat.dispose();
    },
  };
}

/** Big Chomp and a crown, for main.js's shader warm-up (the instanced body is a new shader variant). */
export function bossWarmup() {
  const g = new THREE.Group();
  g.name = 'boss-warmup';
  const b = createBoss();
  b.update(0.016, { x: 0, z: 0, yaw: 0, state: 'munch', hp01: 1, gone: false });
  g.add(b.object3d, createCrown().object3d);
  return g;
}
