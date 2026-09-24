// The four family gardens: lawn floors with owner-colour trim, bamboo fences, gate posts with laser
// beams, planter boxes (crated when locked), COLLECT / LOCK pads, a growing cash pile, owner billboard.
import * as THREE from 'three';
import { CHARACTERS, PLANTERS } from '../config.js';
import { Merger, makeRand, makeCanvas, canvasTexture, drawTexture, chunkyText, roundRect, uTime, withColors, signMaterial, mergedGeometry } from './kit.js';
import { lawnTexture, soilTexture, collectTexture, lockTexture } from './textures.js';
import { bush, flower } from './props.js';

const FENCE_H = 6.3;
const MAX_BRICKS = 34;
const MAX_COINS = 18;
const BEAMS = [0.9, 2.0, 3.1, 4.2, 5.3, 6.4];

function bambooTexture() {
  return drawTexture(32, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#cfd9a0');
    gr.addColorStop(0.5, '#f4f0c4');
    gr.addColorStop(1, '#cfd9a0');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (const y of [20, 62, 104]) {
      g.fillStyle = 'rgba(90,70,20,0.55)';
      g.fillRect(0, y, w, 4);
      g.fillStyle = 'rgba(255,255,230,0.6)';
      g.fillRect(0, y + 4, w, 2);
    }
    g.fillStyle = 'rgba(120,110,40,0.12)';
    for (let x = 2; x < w; x += 5) g.fillRect(x, 0, 1, h);
  });
}

function laserMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uGrow: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: `
      attribute float aBeam;
      varying vec2 vUv; varying float vBeam;
      void main(){ vUv = uv; vBeam = aBeam; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uGrow, uAlpha;
      varying vec2 vUv; varying float vBeam;
      void main(){
        float along = vUv.x;
        if (along > uGrow) discard;
        float d = abs(vUv.y - 0.5) * 2.0;
        float core = exp(-d * d * 90.0);
        float halo = exp(-d * d * 7.0) * 0.6;
        float shimmer = 0.72 + 0.28 * sin(along * 70.0 - uTime * 24.0 + vBeam * 1.7) * sin(along * 19.0 + uTime * 7.0 + vBeam);
        float flick = 0.88 + 0.12 * sin(uTime * 37.0 + vBeam * 3.0);
        float tip = smoothstep(uGrow, uGrow - 0.03, along);
        vec3 col = vec3(1.0, 0.1, 0.12) * halo * shimmer + vec3(1.0, 0.78, 0.72) * core * 1.4;
        gl_FragColor = vec4(col * flick * tip * uAlpha, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

// Beam planes (crossed) spanning the gate; uv.x along the beam, uv.y across.
function laserGeometry(L) {
  const pos = [], uv = [], beam = [], idx = [];
  const x = L.gate.x, z0 = L.gate.minZ, z1 = L.gate.maxZ;
  const w = 0.55;
  BEAMS.forEach((y, b) => {
    for (const vertical of [true, false]) {
      const base = pos.length / 3;
      const o = vertical ? [0, w, 0] : [w, 0, 0];
      pos.push(x - o[0], y - o[1], z0, x - o[0], y - o[1], z1, x + o[0], y + o[1], z1, x + o[0], y + o[1], z0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      beam.push(b, b, b, b);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aBeam', new THREE.Float32BufferAttribute(beam, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function crateGeometry() {
  const m = new Merger();
  const W = 5.0, H = 1.5;
  m.block(0, 0, 0, W, H, W, '#c89456', { ao: 0.25 });
  // top planks
  for (let i = -2; i <= 2; i++) m.box(i * 1.0, H + 0.02, 0, 0.9, 0.08, W - 0.1, i % 2 ? '#d6a466' : '#c08a4a', { ao: 0 });
  // corner trims + X braces on each side
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.block(sx * (W / 2 - 0.15), 0, sz * (W / 2 - 0.15), 0.42, H + 0.08, 0.42, '#8a5a2a', { ao: 0.1 });
  for (let s = 0; s < 4; s++) {
    const ry = (s * Math.PI) / 2;
    const nx = Math.sin(ry) * (W / 2 + 0.03), nz = Math.cos(ry) * (W / 2 + 0.03);
    for (const dir of [-1, 1]) {
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(nx, H / 2, nz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, dir * 0.29, 'YXZ')), new THREE.Vector3(W - 0.5, 0.26, 0.1));
      m.add('box', m4, '#9a6a36', { ao: 0 });
    }
    m.add('box', new THREE.Matrix4().compose(new THREE.Vector3(nx, H - 0.14, nz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(W - 0.4, 0.24, 0.1)), '#8a5a2a', { ao: 0 });
  }
  return m.buildGeometry();
}

function padlockGeometry() {
  const m = new Merger();
  m.box(0, 0, 0, 1.3, 1.05, 0.5, '#ffc93c', { ao: 0.15 });
  m.box(0, 0.05, 0.26, 1.1, 0.8, 0.06, '#ffdf7a', { ao: 0 });
  m.add('halftorus', new THREE.Matrix4().compose(new THREE.Vector3(0, 0.5, 0), new THREE.Quaternion(), new THREE.Vector3(1.25, 1.35, 1.6)), '#c9ced6', { ao: 0 });
  m.prim('sphere:8', 0, 0.08, 0.3, 0.26, 0.26, 0.1, '#5a4010', { ao: 0 });
  m.box(0, -0.18, 0.3, 0.1, 0.3, 0.1, '#5a4010', { ao: 0 });
  return m.buildGeometry();
}

function cashSlots(r) {
  const slots = [];
  const layers = [[3, 4], [3, 3], [2, 3], [2, 2], [1, 2], [1, 1], [1, 1]];
  layers.forEach(([cx, cz], li) => {
    for (let ix = 0; ix < cx; ix++) {
      for (let iz = 0; iz < cz; iz++) {
        slots.push({
          x: (ix - (cx - 1) / 2) * 1.02 + r.range(-0.06, 0.06),
          y: 0.35 + li * 0.44,
          z: (iz - (cz - 1) / 2) * 0.58 + r.range(-0.05, 0.05),
          ry: r.range(-0.12, 0.12) + (li === 6 ? 0.6 : 0),
        });
      }
    }
  });
  return slots.slice(0, MAX_BRICKS);
}

export function buildGardens(ctx) {
  const { root, layout, mats, quality } = ctx;
  const r = makeRand(4242);
  const group = new THREE.Group();
  group.name = 'gardens';
  root.add(group);
  const wood = new Merger({ uv: 'studs', uvScale: 0.125 });
  const lawn = new Merger({ uv: 'studs', uvScale: 1 / 16 });
  const soil = new Merger({ uv: 'studs', uvScale: 0.22 });
  const bambooXf = [];
  const flags = [];

  const lawnMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: lawnTexture() });
  const soilMat = new THREE.MeshLambertMaterial({ map: soilTexture(), vertexColors: true });
  const collectMat = new THREE.MeshBasicMaterial({ map: collectTexture() });
  const padGeo = (rad) => new THREE.CircleGeometry(rad, 28).rotateX(-Math.PI / 2);

  const crateMesh = new THREE.InstancedMesh(crateGeometry(), mats.flat, layout.gardens.length * 10);
  const lockMesh = new THREE.InstancedMesh(padlockGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2800 }), layout.gardens.length * 10);
  crateMesh.castShadow = quality.shadows;
  crateMesh.receiveShadow = true;
  crateMesh.name = 'crates';
  lockMesh.name = 'padlocks';
  group.add(crateMesh, lockMesh);

  const brickGeo = mergedGeometry((m) => {
    m.box(0, 0, 0, 1.0, 0.42, 0.55, '#4fb34a', { topFace: '#8fe07f', ao: 0.25 });
    m.box(0, 0, 0, 0.18, 0.44, 0.57, '#fff6d6', { ao: 0 });
    m.box(0.3, 0.215, 0, 0.22, 0.01, 0.3, '#2f8a2c', { ao: 0 });
    m.box(-0.3, 0.215, 0, 0.22, 0.01, 0.3, '#2f8a2c', { ao: 0 });
  });
  const brickMesh = new THREE.InstancedMesh(brickGeo, mats.flat, layout.gardens.length * MAX_BRICKS);
  const coinGeo = mergedGeometry((m) => m.cyl(0, -0.05, 0, 0.34, 0.1, '#ffb81c', { seg: 12, topFace: '#ffe066', ao: 0 }));
  const coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a3a00 }), layout.gardens.length * MAX_COINS);
  brickMesh.name = 'cash';
  crateMesh.frustumCulled = lockMesh.frustumCulled = brickMesh.frustumCulled = coinMesh.frustumCulled = false;
  brickMesh.castShadow = coinMesh.castShadow = quality.shadows;
  group.add(brickMesh, coinMesh);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < brickMesh.count; i++) brickMesh.setMatrixAt(i, zero);
  for (let i = 0; i < coinMesh.count; i++) coinMesh.setMatrixAt(i, zero);
  const slots = cashSlots(r);
  const coinSlots = Array.from({ length: MAX_COINS }, (_, i) => {
    const a = i * 2.4;
    const rad = 1.9 + (i % 3) * 0.25;
    return { x: Math.cos(a) * rad, z: Math.sin(a) * rad * 0.85, y: 0.08 + (i % 4 === 3 ? 0.1 : 0), rx: r.range(-0.3, 0.3), rz: r.range(-0.3, 0.3) };
  });

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const apis = [];
  const animating = new Set();

  layout.gardens.forEach((L, slot) => {
    const char = CHARACTERS[slot];
    const b = L.bounds;
    const c = L.center;
    const inw = L.inward;
    const acc = new Merger({ uv: 'studs', uvScale: 0.125 });
    const WH = '#ffffff';

    // ---------------------------------------------------------- floor + trim
    const tint = new THREE.Color('#86d863').lerp(new THREE.Color(char.color), 0.1);
    lawn.box(c.x, 0.02, c.z, b.maxX - b.minX, 0.04, b.maxZ - b.minZ, tint, { ao: 0 });
    const T = 1.5;
    acc.box(c.x, 0.05, b.minZ + T / 2 + 0.3, b.maxX - b.minX - 0.6, 0.06, T, WH, { ao: 0 });
    acc.box(c.x, 0.05, b.maxZ - T / 2 - 0.3, b.maxX - b.minX - 0.6, 0.06, T, WH, { ao: 0 });
    const outerX = L.west ? b.minX : b.maxX;
    acc.box(outerX + inw * (T / 2 + 0.3), 0.05, c.z, T, 0.06, b.maxZ - b.minZ - 0.6, WH, { ao: 0 });
    for (const [z0, z1] of [[b.minZ + 0.3, L.gate.minZ], [L.gate.maxZ, b.maxZ - 0.3]]) acc.box(L.gate.x + inw * (T / 2 + 0.3), 0.05, (z0 + z1) / 2, T, 0.06, z1 - z0, WH, { ao: 0 });
    // welcome mat in the gate + stepping stones towards the planters
    acc.box(L.gate.x + inw * 1.6, 0.06, c.z, 3.2, 0.08, 11, WH, { ao: 0 });
    for (let i = 0; i < 4; i++) wood.cyl(L.gate.x + inw * (5 + i * 3.2), 0.0, c.z + (i % 2 ? 0.8 : -0.8), 1.1, 0.1, '#e7e1d2', { seg: 10, ao: 0 });

    // ---------------------------------------------------------- fences (instanced bamboo + rails)
    const fenceSeg = (ax, az, bx, bz, outward) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 0.6));
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const h = FENCE_H - r.range(0, 0.25);
        bambooXf.push({ x: ax + (bx - ax) * t + outward[0] * r.range(-0.04, 0.04), z: az + (bz - az) * t + outward[1] * r.range(-0.04, 0.04), h, r: 0.28, c: r() });
      }
      // lashing rails on both faces
      for (const y of [1.5, 4.5]) {
        for (const s of [-1, 1]) {
          wood.box((ax + bx) / 2 + outward[0] * s * 0.33, y, (az + bz) / 2 + outward[1] * s * 0.33, Math.abs(dx) * len + Math.abs(outward[0]) * 0.14, 0.32, Math.abs(dz) * len + Math.abs(outward[1]) * 0.14, '#7a5230', { ao: 0 });
        }
      }
      // owner-colour top rail
      acc.box((ax + bx) / 2, FENCE_H + 0.12, (az + bz) / 2, Math.abs(dx) * len + Math.abs(outward[0]) * 0.8, 0.3, Math.abs(dz) * len + Math.abs(outward[1]) * 0.8, WH, { ao: 0.15 });
      // thick posts every ~6 studs
      const np = Math.max(1, Math.round(len / 6));
      for (let i = 0; i <= np; i++) {
        const t = i / np;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        bambooXf.push({ x: px, z: pz, h: FENCE_H + 0.9, r: 0.46, c: 0.2 });
        acc.prim('sphere:7', px, FENCE_H + 1.0, pz, 1.15, 0.9, 1.15, WH, { ao: 0.1 });
      }
    };
    fenceSeg(outerX, b.minZ, outerX, b.maxZ, [1, 0]);
    fenceSeg(b.minX, b.minZ, b.maxX, b.minZ, [0, 1]);
    fenceSeg(b.minX, b.maxZ, b.maxX, b.maxZ, [0, 1]);
    const gpS = L.gate.minZ - 0.75, gpN = L.gate.maxZ + 0.75;
    fenceSeg(L.gate.x, b.minZ, L.gate.x, gpS - 0.7, [1, 0]);
    fenceSeg(L.gate.x, gpN + 0.7, L.gate.x, b.maxZ, [1, 0]);

    // ---------------------------------------------------------- gate posts with laser emitters
    const GX = L.gate.x;
    for (const pz of [gpS, gpN]) {
      const tall = pz === gpN ? 8.4 : 9.2;
      wood.block(GX, 0, pz, 1.5, tall, 1.5, '#8a5a34', { ao: 0.3 });
      wood.block(GX, tall, pz, 1.9, 0.5, 1.9, '#6b4424', { ao: 0 });
      acc.block(GX, 0.6, pz, 1.62, 0.5, 1.62, WH, { ao: 0 });
      acc.block(GX, tall - 1.4, pz, 1.62, 0.5, 1.62, WH, { ao: 0 });
      // tiki face carving on the aisle side
      const fx = GX - inw * 0.78;
      wood.box(fx, 5.6, pz, 0.12, 0.9, 1.1, '#5a3a1e', { ao: 0 });
      wood.box(fx, 6.6, pz - 0.32, 0.12, 0.35, 0.35, '#f4e8c8', { ao: 0 });
      wood.box(fx, 6.6, pz + 0.32, 0.12, 0.35, 0.35, '#f4e8c8', { ao: 0 });
      // emitters facing the gap
      const face = pz === gpS ? 0.8 : -0.8;
      for (const y of BEAMS) {
        wood.box(GX, y, pz + face, 0.7, 0.42, 0.3, '#3a3f4a', { ao: 0 });
        ctx.glow.box(GX, y, pz + face * 1.22, 0.36, 0.22, 0.06, '#ff3a3a', { ao: 0 });
      }
      ctx.colliders.push({ minX: GX - 0.75, maxX: GX + 0.75, minY: 0, maxY: 9, minZ: pz - 0.75, maxZ: pz + 0.75, tag: 'fence' });
    }

    // ---------------------------------------------------------- planters
    const planterApis = L.planters.map((P, i) => {
      const x = P.x, z = P.z;
      // frame boards
      const bw = 4.8, bh = 1.2, t = 0.34;
      for (const s of [-1, 1]) {
        wood.block(x + s * (bw / 2 - t / 2), 0, z, t, bh, bw, '#b0743e', { ao: 0.35 });
        wood.block(x, 0, z + s * (bw / 2 - t / 2), bw - 2 * t, bh, t, '#b0743e', { ao: 0.35 });
        // rim
        wood.block(x + s * (bw / 2 - 0.2), bh, z, 0.5, 0.18, bw + 0.2, '#d09058', { ao: 0 });
        wood.block(x, bh, z + s * (bw / 2 - 0.2), bw - 0.6, 0.18, 0.5, '#d09058', { ao: 0 });
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.block(x + sx * 2.3, 0, z + sz * 2.3, 0.5, 1.5, 0.5, '#8a5a2a', { ao: 0.2 });
      // owner band on the aisle-facing board + a little number tag
      acc.box(x - inw * (bw / 2 + 0.02), 0.62, z, 0.06, 0.34, bw - 0.9, WH, { ao: 0 });
      soil.box(x, 1.1, z, bw - 2 * t, 0.2, bw - 2 * t, '#ffffff', { ao: 0 });
      // soil lumps
      for (let k = 0; k < 3; k++) soil.prim('sphere:6', x + r.range(-1.4, 1.4), 1.18, z + r.range(-1.4, 1.4), r.range(0.5, 0.9), 0.22, r.range(0.5, 0.9), '#ffffff', { ao: 0 });
      const idx = slot * 10 + i;
      const st = { unlocked: i < PLANTERS.startUnlocked, synced: false, anim: 1, idx, x, z, yaw: inw < 0 ? Math.PI / 2 : -Math.PI / 2 };
      placeCrate(st, st.unlocked ? 1 : 0);
      return {
        setUnlocked(v) {
          v = !!v;
          if (st.synced && v === st.unlocked) return;
          const wasSynced = st.synced;
          st.synced = true;
          if (v === st.unlocked && wasSynced) return;
          st.unlocked = v;
          if (v && wasSynced) {
            st.anim = 0;
            animating.add(st);
          } else {
            st.anim = v ? 1 : 0;
            placeCrate(st, st.anim);
            animating.delete(st);
          }
        },
      };
    });

    // ---------------------------------------------------------- pads
    const cp = L.collectPad, lp = L.lockPad;
    for (const [p, rim] of [[cp, '#2c3440'], [lp, '#2c3440']]) {
      wood.cyl(p.x, 0, p.z, p.r + 0.45, 0.18, rim, { seg: 28, ao: 0 });
      acc.cyl(p.x, 0.02, p.z, p.r + 0.2, 0.2, WH, { seg: 28, ao: 0 });
    }
    const cTop = new THREE.Mesh(padGeo(cp.r - 0.05), collectMat);
    cTop.position.set(cp.x, 0.24, cp.z);
    cTop.rotation.y = -inw * Math.PI / 2;
    group.add(cTop);
    const lockMat = new THREE.MeshBasicMaterial({ map: lockTexture(), color: 0xdddddd });
    const lTop = new THREE.Mesh(padGeo(lp.r - 0.05), lockMat);
    lTop.position.set(lp.x, 0.24, lp.z);
    lTop.rotation.y = -inw * Math.PI / 2;
    group.add(lTop);
    // cash pallet beside the collect pad
    const pile = { x: cp.x + inw * 4.4, z: cp.z };
    wood.block(pile.x, 0, pile.z, 3.6, 0.3, 2.8, '#b0743e', { ao: 0.2 });
    for (const s of [-1, 0, 1]) wood.block(pile.x, 0, pile.z + s * 1.1, 3.6, 0.12, 0.5, '#8a5a2a', { ao: 0 });

    // ---------------------------------------------------------- owner billboard (on the north gate post)
    const S = L.sign;
    const boardW = 6.6, boardH = 5.6, boardY = 8.6;
    const legZ2 = S.z + 2.6;
    wood.block(GX, 0, legZ2, 0.7, boardY + 0.4, 0.7, '#8a5a34', { ao: 0.3 });
    wood.block(GX, 8.4, gpN, 0.9, 1.0, 0.9, '#8a5a34', { ao: 0 });
    acc.box(GX, boardY + boardH / 2, S.z + 0.2, 0.5, boardH + 0.5, boardW + 0.5, WH, { ao: 0.12 });
    const signCanvas = makeCanvas(512, 440);
    const signTex = canvasTexture(signCanvas, { clamp: true });
    const signMat = signMaterial(signTex, 0.25);
    const signGeo = new THREE.PlaneGeometry(boardW, boardH);
    const front = new THREE.Mesh(signGeo, signMat);
    front.position.set(GX - inw * 0.27, boardY + boardH / 2, S.z + 0.2);
    front.rotation.y = -inw * Math.PI / 2;
    const back = new THREE.Mesh(signGeo, signMat);
    back.position.set(GX + inw * 0.27, boardY + boardH / 2, S.z + 0.2);
    back.rotation.y = inw * Math.PI / 2;
    group.add(front, back);

    // countdown display on the south gate post
    const cdCanvas = makeCanvas(160, 80);
    const cdTex = canvasTexture(cdCanvas, { clamp: true, mips: false });
    const cdMat = new THREE.MeshBasicMaterial({ map: cdTex });
    const cdGeo = new THREE.PlaneGeometry(2.4, 1.2);
    const cdGroup = new THREE.Group();
    const cdF = new THREE.Mesh(cdGeo, cdMat);
    cdF.position.set(GX - inw * 0.13, 0, 0);
    cdF.rotation.y = -inw * Math.PI / 2;
    const cdB = new THREE.Mesh(cdGeo, cdMat);
    cdB.position.set(GX + inw * 0.13, 0, 0);
    cdB.rotation.y = inw * Math.PI / 2;
    const cdBox = new THREE.Mesh(mergedGeometry((m) => m.box(0, 0, 0, 0.2, 1.5, 2.7, '#2c3440', { ao: 0 })), mats.flat);
    cdBox.position.set(GX, 0, 0);
    cdGroup.add(cdBox, cdF, cdB);
    cdGroup.position.set(0, 10.6, gpS);
    cdGroup.visible = false;
    group.add(cdGroup);
    let cdShown = -1;
    const drawCountdown = (sec) => {
      const g = cdCanvas.getContext('2d');
      g.fillStyle = '#1a0608';
      g.fillRect(0, 0, 160, 80);
      g.strokeStyle = '#ff3a3a';
      g.lineWidth = 5;
      g.strokeRect(4, 4, 152, 72);
      chunkyText(g, `🔒 ${sec}`, 80, 43, { size: 44, fill: '#ff5050', stroke: '#3a0008', strokeW: 6, shadow: false, maxW: 140 });
      cdTex.needsUpdate = true;
    };

    // lasers
    const laserMat = laserMaterial();
    const laser = new THREE.Mesh(laserGeometry(L), laserMat);
    laser.visible = false;
    laser.frustumCulled = false;
    laser.renderOrder = 5;
    group.add(laser);

    // owner flags on the outer corners
    for (const fz of [b.minZ + 0.6, b.maxZ - 0.6]) {
      const fx = outerX + inw * 0.6;
      wood.cyl(fx, 0, fz, 0.16, 11, '#dddddd', { seg: 6 });
      wood.prim('sphere:8', fx, 11.1, fz, 0.5, 0.5, 0.5, '#ffd23f');
      flags.push({ x: fx, z: fz, slot });
    }

    // tropical planting in the far corners (low, non-solid)
    for (const fz of [b.minZ + 2.4, b.maxZ - 2.4]) {
      bush(wood, outerX + inw * 2.2, 0, fz, 1.3, r);
      for (let k = 0; k < 3; k++) flower(wood, outerX + inw * r.range(1.2, 3.5), 0, fz + r.range(-2, 2), r.pick(['#ff4f7a', '#ffd23f', '#ff8a3a', '#ffffff']), 1.4);
    }

    // accent mesh coloured by the owner
    const accMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: mats.stud.map, color: new THREE.Color(char.color) });
    const accMesh = acc.build(accMat, { name: 'garden-accent-' + slot, castShadow: quality.shadows });
    group.add(accMesh);

    // ---------------------------------------------------------- API
    let owner = char;
    let avatarImg = null;
    let avatarKey = null;
    const redrawSign = () => drawSign(signCanvas, owner, avatarImg, signTex);
    redrawSign();
    const lock = { on: false, grow: 0, secs: 0 };
    const cash = { n: -1, coins: -1, bounce: 0 };
    const api = {
      slot,
      planters: planterApis,
      setOwner(ch, avatarUrl) {
        if (ch) owner = ch;
        accMat.color.set(owner.color);
        const key = avatarUrl || null;
        if (key === avatarKey) return redrawSign();
        avatarKey = key;
        avatarImg = null;
        redrawSign();
        if (key) {
          const img = new Image();
          img.onload = () => {
            if (avatarKey !== key) return;
            avatarImg = img;
            redrawSign();
          };
          img.src = key;
        }
      },
      setLocked(locked, secondsLeft = 0) {
        lock.on = !!locked;
        lock.secs = secondsLeft;
      },
      setCashPile(amount) {
        const a = Math.max(0, amount || 0);
        const n = a < 1 ? 0 : Math.min(MAX_BRICKS, Math.max(1, Math.round(4.3 * Math.log10(1 + a) - 1)));
        const nc = a < 1 ? 0 : Math.min(MAX_COINS, Math.round(2.6 * Math.log10(1 + a)));
        if (n === cash.n && nc === cash.coins) return;
        if (n > cash.n && cash.n >= 0) cash.bounce = 1;
        cash.n = n;
        cash.coins = nc;
        layoutCash();
      },
      _update(dt, t) {
        // lasers
        const goal = lock.on ? 1 : 0;
        lock.grow += (goal - lock.grow) * Math.min(1, dt * (lock.on ? 5 : 8));
        if (Math.abs(goal - lock.grow) < 0.004) lock.grow = goal;
        laser.visible = lock.grow > 0.004;
        laserMat.uniforms.uGrow.value = lock.grow * 1.03;
        laserMat.uniforms.uAlpha.value = lock.on ? 1 : lock.grow;
        cdGroup.visible = lock.on;
        if (lock.on) {
          const s = Math.max(0, Math.ceil(lock.secs));
          if (s !== cdShown) {
            cdShown = s;
            drawCountdown(s);
          }
        } else cdShown = -1;
        // pads
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + slot);
        lockMat.color.setScalar(lock.on ? 1.0 + 0.35 * pulse : 0.82);
        if (cash.bounce > 0) {
          cash.bounce = Math.max(0, cash.bounce - dt * 3);
          layoutCash();
        }
      },
    };
    function layoutCash() {
      const k = cash.bounce;
      const sq = 1 + Math.sin(k * Math.PI) * 0.18;
      for (let i = 0; i < MAX_BRICKS; i++) {
        const id = slot * MAX_BRICKS + i;
        if (i >= cash.n) {
          brickMesh.setMatrixAt(id, zero);
          continue;
        }
        const s = slots[i];
        const top = i === cash.n - 1 ? sq : 1;
        _e.set(0, s.ry + (inw < 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        _q.setFromEuler(_e);
        const cx = Math.cos(_e.y), sx = Math.sin(_e.y);
        _p.set(pile.x + s.x * cx + s.z * sx, s.y * (i === cash.n - 1 ? 1 + k * 0.4 : 1), pile.z - s.x * sx + s.z * cx);
        _s.set(top, top, top);
        _m.compose(_p, _q, _s);
        brickMesh.setMatrixAt(id, _m);
      }
      brickMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < MAX_COINS; i++) {
        const id = slot * MAX_COINS + i;
        if (i >= cash.coins) {
          coinMesh.setMatrixAt(id, zero);
          continue;
        }
        const s = coinSlots[i];
        _e.set(s.rx, 0, s.rz);
        _q.setFromEuler(_e);
        _p.set(pile.x + s.x, s.y + 0.3, pile.z + s.z);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        coinMesh.setMatrixAt(id, _m);
      }
      coinMesh.instanceMatrix.needsUpdate = true;
    }
    apis.push(api);
  });

  function placeCrate(st, a) {
    // a: 0 = crated, 1 = open (crate gone). Animates as a pop + fly away.
    if (a >= 1) {
      crateMesh.setMatrixAt(st.idx, zero);
      lockMesh.setMatrixAt(st.idx, zero);
    } else {
      const up = a < 0.5 ? a * 2 : 1;
      const s = a < 0.25 ? 1 + a * 0.8 : Math.max(0, 1.2 - (a - 0.25) * 1.6);
      _e.set(0, st.yaw + a * 2.5, 0);
      _q.setFromEuler(_e);
      _p.set(st.x, 1.05 + up * 2.5, st.z);
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      crateMesh.setMatrixAt(st.idx, _m);
      // padlock on the aisle-facing side, above the crate
      const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
      _e.set(0, st.yaw, a * 6);
      _q.setFromEuler(_e);
      _p.set(st.x + fx * 2.55 * s, 1.95 + up * 4, st.z + fz * 2.55 * s);
      _s.set(1.1 * s, 1.1 * s, 1.1 * s);
      _m.compose(_p, _q, _s);
      lockMesh.setMatrixAt(st.idx, _m);
    }
    crateMesh.instanceMatrix.needsUpdate = true;
    lockMesh.instanceMatrix.needsUpdate = true;
  }

  // bamboo instances
  const bambooGeo = withColors(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0));
  const bambooMat = new THREE.MeshLambertMaterial({ map: bambooTexture(), vertexColors: true });
  const bamboo = new THREE.InstancedMesh(bambooGeo, bambooMat, bambooXf.length);
  const bc = new THREE.Color();
  bambooXf.forEach((p, i) => {
    _m.compose(_p.set(p.x, 0, p.z), _q.identity(), _s.set(p.r, p.h, p.r));
    bamboo.setMatrixAt(i, _m);
    bc.set(p.r > 0.4 ? '#c8a860' : p.c < 0.33 ? '#d8d488' : p.c < 0.66 ? '#e6dc98' : '#c9cf7c');
    bamboo.setColorAt(i, bc);
  });
  bamboo.castShadow = quality.shadows;
  bamboo.receiveShadow = true;
  bamboo.name = 'bamboo';
  group.add(bamboo);

  // owner flags (one instanced mesh, gently waving)
  const flagGeo = mergedGeometry((m) => {
    m.box(1.6, 0, 0, 3.2, 2.0, 0.08, '#ffffff', { ao: 0 });
    m.box(1.6, 0, 0, 1.2, 1.2, 0.1, '#ffffff', { ao: 0, rz: Math.PI / 4 });
  });
  const flagMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: mats.stud.map });
  const flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, flags.length);
  flags.forEach((f, i) => flagMesh.setColorAt(i, bc.set(CHARACTERS[f.slot].color)));
  flagMesh.name = 'flags';
  flagMesh.frustumCulled = false;
  group.add(flagMesh);

  const add = (m) => m && group.add(m);
  const lawnMesh = lawn.build(lawnMat, { name: 'garden-lawn' });
  lawnMesh.renderOrder = 1;
  add(lawnMesh);
  add(soil.build(soilMat, { name: 'garden-soil' }));
  add(wood.build(mats.flat, { name: 'garden-wood', castShadow: quality.shadows }));

  return {
    gardens: apis,
    update(dt, t) {
      for (const a of apis) a._update(dt, t);
      for (const st of animating) {
        st.anim = Math.min(1, st.anim + dt * 1.8);
        placeCrate(st, st.anim);
        if (st.anim >= 1) animating.delete(st);
      }
      for (let i = 0; i < flags.length; i++) {
        const f = flags[i];
        _e.set(0, Math.sin(t * 1.3 + i) * 0.35 + (f.x < 0 ? Math.PI : 0), Math.sin(t * 2.1 + i * 2) * 0.05);
        _q.setFromEuler(_e);
        _m.compose(_p.set(f.x, 9.8, f.z), _q, _s.set(1, 1, 1));
        flagMesh.setMatrixAt(i, _m);
      }
      flagMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ billboard

function drawSign(canvas, char, img, tex) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const col = char.color;
  g.fillStyle = '#1b2440';
  g.fillRect(0, 0, W, H);
  // board
  roundRect(g, 6, 6, W - 12, H - 12, 46);
  g.fillStyle = col;
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#1b2440';
  g.stroke();
  roundRect(g, 28, 28, W - 56, H - 56, 30);
  const bg = g.createLinearGradient(0, 28, 0, H - 28);
  bg.addColorStop(0, '#fffdf6');
  bg.addColorStop(1, '#fff1d6');
  g.fillStyle = bg;
  g.fill();
  // sunburst behind the avatar
  const cx = W / 2, cy = 168, R = 118;
  g.save();
  roundRect(g, 28, 28, W - 56, H - 56, 30);
  g.clip();
  g.globalAlpha = 0.16;
  g.fillStyle = col;
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = a0 + Math.PI / 16;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * 500, cy + Math.sin(a0) * 500);
    g.lineTo(cx + Math.cos(a1) * 500, cy + Math.sin(a1) * 500);
    g.closePath();
    g.fill();
  }
  g.restore();
  // avatar ring
  g.beginPath();
  g.arc(cx, cy + 4, R + 14, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fill();
  g.beginPath();
  g.arc(cx, cy, R + 14, 0, Math.PI * 2);
  g.fillStyle = col;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#1b2440';
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, R + 2, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();
  g.save();
  g.beginPath();
  g.arc(cx, cy, R - 4, 0, Math.PI * 2);
  g.clip();
  if (img && img.width) {
    const s = Math.max((2 * R) / img.width, (2 * R) / img.height);
    const w = img.width * s, h = img.height * s;
    g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    const gr = g.createLinearGradient(0, cy - R, 0, cy + R);
    gr.addColorStop(0, col);
    gr.addColorStop(1, '#1b2440');
    g.fillStyle = gr;
    g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const initials = char.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    chunkyText(g, initials, cx, cy + 6, { size: 120, fill: '#ffffff', stroke: '#1b2440', strokeW: 16 });
  }
  g.restore();
  // name + subtitle
  chunkyText(g, char.name.toUpperCase(), cx, 346, { size: 78, fill: col, stroke: '#1b2440', strokeW: 15, maxW: W - 90 });
  chunkyText(g, "'S GARDEN", cx, 398, { size: 34, fill: '#1b2440', stroke: '#ffffff', strokeW: 6, shadow: false });
  tex.needsUpdate = true;
}

