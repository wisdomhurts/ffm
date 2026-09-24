// The home island: studded baseplate, Cabo-style plaza (mosaic, spawn, paths), palms, lamps, fountain,
// beach with rope fence and palapas, animated ocean, a pier with a panga and El Arco out at sea.
import * as THREE from 'three';
import { Merger, makeRand, withColors } from './kit.js';
import { mosaicTexture, spawnTexture, sandDetail } from './textures.js';
import { oceanMaterial, liquidMaterial } from './water.js';
import { palm, lamp, tikiTorch, palapa, lounger, rope, rock, bush, flower } from './props.js';

export const ISLAND = { minX: -72.5, maxX: 72.5, minZ: -66.5, maxZ: 60 };
const WATER_Y = -1.2;
const SHORE_D = 9; // distance from the island rect to the water line

export function buildPlaza(ctx) {
  const { root, layout, mats, quality } = ctx;
  const dens = quality.decorDensity;
  const r = makeRand(2024);
  const group = new THREE.Group();
  group.name = 'plaza';
  root.add(group);

  const floor = new Merger({ uv: 'studs', uvScale: 0.125 });
  const props = new Merger({ uv: 'studs', uvScale: 0.125 });
  const glow = new Merger();
  const beach = new Merger();
  const solid = (x, z, hw, hd, maxY, tag = 'deco') => ctx.colliders.push({ minX: x - hw, maxX: x + hw, minY: 0, maxY, minZ: z - hd, maxZ: z + hd, tag });
  const flames = [];

  // ---------------------------------------------------------------- baseplate + paths
  const I = ISLAND;
  const GREEN = '#5ec24a';
  const SAND = '#f4dea6', CURB = '#d9b877';
  const path = (x0, x1, z0, z1) => {
    floor.box((x0 + x1) / 2, 0.02, (z0 + z1) / 2, x1 - x0 + 1.2, 0.06, z1 - z0 + 1.2, CURB, { ao: 0 });
    floor.box((x0 + x1) / 2, 0.04, (z0 + z1) / 2, x1 - x0, 0.08, z1 - z0, SAND, { ao: 0 });
  };
  path(-10, 10, -45, 60);
  for (const g of layout.gardens) {
    const x0 = g.west ? g.gate.x : 10, x1 = g.west ? -10 : g.gate.x;
    path(x0, x1, g.gate.minZ - 0.5, g.gate.maxZ + 0.5);
  }
  path(-44, 44, -57, -44);
  // terracotta tiles framing the path into the road
  for (let i = 0; i < 6; i++) floor.box(0, 0.05, 44 + i * 2.6, 20, 0.1, 1.2, i % 2 ? '#e8793a' : '#f2b640', { ao: 0 });
  // the baseplate itself goes last so the layers above it win the depth test first (less overdraw)
  floor.box((I.minX + I.maxX) / 2, -0.8, (I.minZ + I.maxZ) / 2, I.maxX - I.minX, 1.6, I.maxZ - I.minZ, GREEN, { ao: 0.45 });

  // spawn location
  const sp = layout.spawn;
  props.block(sp.x, 0, sp.z, 11, 0.3, 11, '#6f7a86', { ao: 0.2 });
  ctx.colliders.push({ minX: sp.x - 5.5, maxX: sp.x + 5.5, minY: 0, maxY: 0.3, minZ: sp.z - 5.5, maxZ: sp.z + 5.5, tag: 'deco' });
  const spawnTop = new THREE.Mesh(withColors(new THREE.PlaneGeometry(10.4, 10.4).rotateX(-Math.PI / 2)), new THREE.MeshLambertMaterial({ map: spawnTexture(), vertexColors: true }));
  spawnTop.position.set(sp.x, 0.31, sp.z);
  spawnTop.receiveShadow = true;
  group.add(spawnTop);
  const ringGeo = new THREE.RingGeometry(17 * 302 / 512, 17 * 503 / 512, 72, 1);
  for (let i = 0, P = ringGeo.attributes.position, U = ringGeo.attributes.uv; i < P.count; i++) U.setXY(i, 0.5 + P.getX(i) / 34, 0.5 + P.getY(i) / 34);
  const mosaic = new THREE.Mesh(withColors(ringGeo.rotateX(-Math.PI / 2)), new THREE.MeshLambertMaterial({ map: mosaicTexture(), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mosaic.position.set(sp.x, 0.1, sp.z);
  mosaic.receiveShadow = true;
  group.add(mosaic);

  // ---------------------------------------------------------------- props inside the island (with colliders)
  const inPalms = [
    [-31, 54], [-43, 56], [-58, 52], [-69, 57.5], [31, 54], [43, 56], [58, 52], [69, 57.5],
    [-69.4, -38], [-69.4, -12], [-69.4, 12], [-69.4, 38], [69.4, -38], [69.4, -12], [69.4, 12], [69.4, 38],
    [-68, -62.5], [-66, -48.5], [-45, -63], [68, -48.5], [46, -63], [69, -62.5],
  ];
  for (const [x, z] of inPalms) {
    const lean = r.range(0.12, 0.3);
    // lean away from the aisle so fronds frame the plaza
    const yaw = Math.atan2(x < 0 ? -1 : 1, z > 30 ? 0.6 : z < -40 ? -0.6 : r.range(-0.4, 0.4));
    palm(props, x, z, r, { h: r.range(10, 13.5), lean, yaw });
    solid(x, z, 0.75, 0.75, 14);
  }
  // lamps along the garden corridors and the shop promenade
  for (const [x, z] of [[-27, 0], [27, 0], [-27, 42], [27, 42], [-27, -42], [27, -42], [-45, -45], [45, -45]]) {
    lamp(props, glow, x, z, { light: '#fff0b8' });
    solid(x, z, 0.55, 0.55, 9);
  }
  // tiki torches on each garden's fence line, beside the gate (inside the fence collider)
  for (const g of layout.gardens) flames.push(tikiTorch(props, g.gate.x, g.center.z - 9.2));
  for (const [x, z] of [[-24.8, 58], [24.8, 58]]) {
    flames.push(tikiTorch(props, x, z, { h: 5.4 }));
    solid(x, z, 0.35, 0.35, 6);
  }

  // fountain (north-west strip) with a golden seed statue
  const F = { x: -46, z: 53 };
  props.cyl(F.x, 0, F.z, 4.6, 1.2, '#efe6d2', { seg: 20, ao: 0.3 });
  props.cyl(F.x, 1.15, F.z, 4.75, 0.25, '#e8793a', { seg: 20, ao: 0 });
  props.cyl(F.x, 0, F.z, 0.9, 3.4, '#efe6d2', { seg: 10 });
  props.cyl(F.x, 3.2, F.z, 2.2, 0.5, '#e8793a', { seg: 14, ao: 0.1 });
  props.cyl(F.x, 3.6, F.z, 0.5, 1.2, '#efe6d2', { seg: 8 });
  props.prim('sphere:12', F.x, 5.6, F.z, 1.7, 2.4, 1.7, '#ffcf33', { ao: 0.15 });
  props.prim('cone:8', F.x, 7.05, F.z, 0.5, 0.9, 0.5, '#4cc24a', { ao: 0 });
  solid(F.x, F.z, 4.6, 4.6, 1.4);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.3, 24).rotateX(-Math.PI / 2), liquidMaterial({ c1: '#1aa7d8', c2: '#4fd9e8', c3: '#e8ffff', scale: 0.5, flow: [0.3, 0.2], glow: 1.0, ripple: 1 }));
  pool.position.set(F.x, 1.0, F.z);
  group.add(pool);
  const bowl = new THREE.Mesh(new THREE.CircleGeometry(2.0, 16).rotateX(-Math.PI / 2), pool.material);
  bowl.position.set(F.x, 3.72, F.z);
  group.add(bowl);
  // falling water curtain
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.6, 2.7, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.45, depthWrite: false }));
  curtain.position.set(F.x, 2.35, F.z);
  group.add(curtain);

  // palapas & loungers (north-east strip and south-east)
  for (const [x, z] of [[40, 52], [54, 52]]) {
    palapa(props, x, z, r);
    lounger(props, x - 1.6, z - 0.5, 0, '#ffffff');
    lounger(props, x + 1.6, z - 0.5, 0, '#3fb6ff');
    solid(x, z, 0.4, 0.4, 7);
  }
  for (const [x, z] of [[54, -57], [63, -57]]) {
    palapa(props, x, z, r);
    lounger(props, x - 1.6, z + 0.5, Math.PI, '#ff7eb6');
    lounger(props, x + 1.6, z + 0.5, Math.PI, '#ffd23f');
    solid(x, z, 0.4, 0.4, 7);
  }
  // tiki bar hut (south-west)
  {
    const x = -57, z = -57.5;
    for (const [dx, dz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
      props.cyl(x + dx, 0, z + dz, 0.35, 5.2, '#8a6038', { seg: 7 });
      solid(x + dx, z + dz, 0.45, 0.45, 6);
    }
    props.prim('cone:4', x, 6.6, z, 13.5, 3.4, 11.5, '#d9a95a', { ry: Math.PI / 4, ao: 0.35 });
    props.block(x, 5.1, z, 9.4, 0.4, 7.4, '#b88444');
    // counter
    props.block(x, 0, z + 2.2, 7.6, 2.4, 1.4, '#8a6038', { ao: 0.3 });
    props.block(x, 2.4, z + 2.2, 8.0, 0.3, 1.8, '#e8793a', { ao: 0 });
    solid(x, z + 2.2, 3.9, 0.8, 2.7);
    // stools and coconut drinks
    for (let i = -1; i <= 1; i++) {
      props.cyl(x + i * 2.6, 0, z + 4.4, 0.18, 1.5, '#6b4a2a', { seg: 6 });
      props.cyl(x + i * 2.6, 1.5, z + 4.4, 0.65, 0.25, '#e84a5f', { seg: 10 });
      props.prim('sphere:8', x + i * 2.4 + 0.4, 2.95, z + 2.2, 0.7, 0.65, 0.7, '#7a4a24', { ao: 0 });
      props.beam(x + i * 2.4 + 0.4, 3.1, z + 2.2, x + i * 2.4 + 0.6, 3.9, z + 2.4, 0.08, '#ff5a8a', { ao: 0 });
    }
    // hanging sign board facing north
    props.block(x, 3.6, z + 3.7, 5.2, 1.4, 0.2, '#f2b640', { ao: 0.1 });
  }
  // surfboard rack (north-east corner)
  for (let i = 0; i < 4; i++) {
    const c = ['#ff5a8a', '#3fb6ff', '#ffd23f', '#1ec8a5'][i];
    props.prim('sphere:10', 66 + i * 1.3 - 2, 3.2, 47.5, 0.3, 6.4, 1.3, c, { rz: 0.05 * (i - 1.5), ao: 0.1 });
  }
  props.block(64, 0, 47.5, 6, 0.4, 1.4, '#8a6038');
  solid(64, 47.5, 3, 0.9, 5);
  // flower beds along the mainland cliff foot (north edge)
  for (let x = 26; x < 72; x += 4.5) {
    for (const s of [-1, 1]) {
      if (s * x > 0 && Math.abs(s * x - F.x) < 7) continue;
      bush(props, s * x + r.range(-0.6, 0.6), 0, 59.2, 1.1, r);
      if (r() < 0.8) flower(props, s * x + r.range(-1, 1), 0, 58.2, r.pick(['#ff5a8a', '#ffd23f', '#ff8a3a', '#ffffff']), 1.3);
    }
  }

  // ---------------------------------------------------------------- island edge: slab side + rope fence
  const postC = '#9a6a3c';
  const fenceLine = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 5.6));
    let px = ax, pz = az;
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      props.block(x, 0, z, 0.42, 2.3, 0.42, postC, { ao: 0.3 });
      props.prim('sphere:6', x, 2.35, z, 0.55, 0.4, 0.55, '#7a5230', { ao: 0 });
      if (i) {
        rope(props, px, pz, x, z, 1.95, 0.35);
        rope(props, px, pz, x, z, 1.05, 0.2);
      }
      px = x;
      pz = z;
    }
  };
  const e = 0.25;
  fenceLine(I.minX + e, 57.5, I.minX + e, I.minZ + e);
  fenceLine(I.minX + e, I.minZ + e, I.maxX - e, I.minZ + e);
  fenceLine(I.maxX - e, I.minZ + e, I.maxX - e, 57.5);

  // ---------------------------------------------------------------- beach ring
  const beachGeo = buildBeachGeometry(r);
  const beachMesh = new THREE.Mesh(beachGeo, new THREE.MeshLambertMaterial({ vertexColors: true, map: sandDetail() }));
  beachMesh.receiveShadow = true;
  beachMesh.name = 'beach';
  beachMesh.renderOrder = 3;
  group.add(beachMesh);
  // beach palms & rocks around the island
  const perim = perimeterSamples(3.2);
  perim.forEach(([px, pz, nx, nz], i) => {
    if (pz > 52) return;
    if (r() < 0.12 * dens + 0.08) {
      const d = r.range(2.5, 6.5);
      palm(beach, px + nx * d, pz + nz * d, r, { y: -1.0, h: r.range(9, 14), lean: r.range(0.2, 0.45), yaw: Math.atan2(nx, nz) + r.range(-0.5, 0.5) });
    }
    if (r() < 0.3 * dens) rock(beach, px + nx * r.range(8, 12), WATER_Y - 0.2, pz + nz * r.range(8, 12), r.range(1.2, 3), r, r.pick(['#8e8a86', '#a39a90', '#7d7a78']));
    if (r() < 0.18 * dens) bush(beach, px + nx * r.range(1.2, 3), -1.0, pz + nz * r.range(1.2, 3), 0.9, r);
  });
  // south beach life: palapas, loungers, towels, a sand castle and a lifeguard tower
  for (const [x, z] of [[-48, -71.5], [-28, -72], [30, -71.5], [52, -72]]) {
    palapa(beach, x, z, r, { y: -1 });
    lounger(beach, x - 1.8, z - 1.5, Math.PI, r.pick(['#ffffff', '#3fb6ff', '#ff7eb6']), { y: -1 });
    lounger(beach, x + 1.8, z - 1.5, Math.PI, r.pick(['#ffd23f', '#1ec8a5', '#ffffff']), { y: -1 });
  }
  for (const [x, z, c] of [[-38, -72.5, '#ff5a8a'], [-35, -73, '#ffd23f'], [40, -72.5, '#3fb6ff']]) beach.box(x, -0.98, z, 2.2, 0.06, 3.8, c, { ao: 0, ry: r.range(-0.3, 0.3) });
  // sand castle
  {
    const x = -16, z = -71.5, s = '#e8cf92';
    beach.block(x, -1, z, 3, 1.2, 3, s);
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      beach.cyl(x + dx, -1, z + dz, 0.6, 2, s, { seg: 8 });
      beach.prim('cone:8', x + dx, 1.4, z + dz, 1.3, 0.9, 1.3, s);
    }
    beach.cyl(x, 0.2, z, 0.9, 1.6, s, { seg: 8 });
    beach.beam(x, 1.8, z, x, 3.4, z, 0.08, '#8a6038');
    beach.box(x + 0.5, 3.1, z, 0.9, 0.5, 0.05, '#ff5a8a', { ao: 0 });
  }
  // lifeguard tower (west beach)
  {
    const x = -79, z = -20;
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) beach.beam(x + dx * 1.3, -1, z + dz * 1.3, x + dx, 4, z + dz, 0.3, '#ffffff');
    beach.block(x, 4, z, 4.4, 0.35, 4.4, '#e84a4a');
    beach.block(x, 4.35, z, 3.6, 2.6, 3.6, '#ffffff', { ao: 0.15 });
    beach.box(x + 1.82, 5.8, z, 0.1, 1.2, 2.4, '#3fb6ff', { ao: 0 });
    beach.prim('cone:4', x, 7.9, z, 6, 1.8, 6, '#e84a4a', { ry: Math.PI / 4, ao: 0.1 });
    beach.beam(x + 2.2, 4.1, z + 3.5, x + 2.2, -1, z + 7, 1.2, '#ffffff', { ao: 0.1 });
  }

  // pier + panga boat (south)
  {
    const x = 10, z0 = -67, z1 = -112;
    for (let z = z0; z > z1; z -= 1.1) beach.box(x, -0.35, z, 5, 0.25, 1.0, r() < 0.5 ? '#b8875a' : '#a8784c', { ao: 0 });
    for (let z = z0 - 3; z > z1; z -= 6) {
      for (const s of [-1, 1]) {
        beach.cyl(x + s * 2.7, -4, z, 0.35, 5.2, '#7a5230', { seg: 7 });
      }
    }
    // boat
    const bx = x + 6.5, bz = -104;
    beach.box(bx, -0.9, bz, 3.2, 1.3, 11, '#ffffff', { ao: 0.2 });
    beach.box(bx, -0.55, bz + 5.8, 2.2, 1.0, 1.4, '#ffffff', { rx: -0.5, ao: 0.2 });
    beach.box(bx, -0.55, bz, 3.3, 0.35, 11.1, '#1f8fe0', { ao: 0 });
    beach.box(bx, -0.1, bz - 1, 2.8, 0.15, 1.2, '#b8875a', { ao: 0 });
    beach.box(bx, -0.1, bz + 2, 2.8, 0.15, 1.2, '#b8875a', { ao: 0 });
    beach.block(bx, -0.5, bz - 5.3, 0.8, 1.6, 0.9, '#3a3a3a');
  }

  // El Arco (Land's End, Cabo) out at sea + scattered sea stacks
  {
    const ar = makeRand(77);
    const ax = 64, az = -178;
    const stone = ['#c9a882', '#b8966e', '#d6b88f', '#a88a6a'];
    const lump = (x, y, z, sx, sy, sz, ry = 0) => beach.prim('dodeca', x, y, z, sx, sy, sz, ar.pick(stone), { ry, rx: ar.range(-0.15, 0.15), ao: 0.25 });
    // two legs that lean into each other + the bridge on top
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      lump(ax - 13 + t * 3, -2 + t * 26, az + ar.range(-1, 1), 13 - t * 3, 10, 12 - t * 2, ar() * 3);
      lump(ax + 12 - t * 2.5, -2 + t * 22, az + 2 + ar.range(-1, 1), 11 - t * 3, 9, 10 - t * 2, ar() * 3);
    }
    for (let i = 0; i < 4; i++) lump(ax - 8 + i * 5.2, 29 + Math.sin((i / 3) * Math.PI) * 2.5, az + 1, 10, 7.5, 9, ar() * 3);
    lump(ax - 11, 36, az, 9, 12, 9, 1);
    // the pointy "Friar" stacks beside it
    for (let i = 0; i < 4; i++) lump(ax + 34, i * 8, az - 10, 12 - i * 2.4, 11, 11 - i * 2.2, ar() * 3);
    beach.prim('cone:6', ax + 34, 36, az - 10, 5, 9, 5, '#b8966e', { ao: 0.1 });
    for (const [x, z, sz] of [[-60, -150, 7], [-90, -120, 5], [120, -60, 6], [-130, 30, 8], [140, -140, 9], [30, -160, 4]]) {
      for (let i = 0; i < 3; i++) lump(x + ar.range(-2, 2), -1 + i * sz * 0.8, z + ar.range(-2, 2), sz * (1.6 - i * 0.35), sz * 1.1, sz * (1.5 - i * 0.35), ar() * 3);
    }
  }

  // ---------------------------------------------------------------- ocean
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200, 1, 1).rotateX(-Math.PI / 2), oceanMaterial({ cx: (I.minX + I.maxX) / 2, cz: (I.minZ + I.maxZ) / 2, hx: (I.maxX - I.minX) / 2, hz: (I.maxZ - I.minZ) / 2, shoreD: SHORE_D, mainlandZ: 60 }));
  ocean.position.set(0, WATER_Y, -400);
  ocean.name = 'ocean';
  ocean.renderOrder = 8; // after everything opaque that covers it
  group.add(ocean);

  // ---------------------------------------------------------------- bake
  const add = (mesh) => mesh && group.add(mesh);
  const floorMesh = floor.build(mats.stud, { name: 'plaza-floor' });
  floorMesh.renderOrder = 2;
  add(floorMesh);
  add(props.build(mats.flat, { name: 'plaza-props', castShadow: quality.shadows }));
  add(glow.build(mats.glow, { name: 'plaza-glow', receiveShadow: false }));
  add(beach.build(mats.flat, { name: 'beach-props' }));

  // flickering torch flames (instanced)
  const flameGeo = new THREE.ConeGeometry(0.42, 1.5, 7).translate(0, 0.6, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa630 });
  const flameMesh = new THREE.InstancedMesh(flameGeo, flameMat, flames.length);
  const innerMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.24, 0.9, 6).translate(0, 0.4, 0), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), flames.length);
  flameMesh.name = 'flames';
  group.add(flameMesh, innerMesh);
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fp = new THREE.Vector3(), fs = new THREE.Vector3(), fe = new THREE.Euler();

  return {
    group,
    update(dt, t) {
      for (let i = 0; i < flames.length; i++) {
        const [x, y, z] = flames[i];
        const k = 1 + Math.sin(t * 13 + i * 1.7) * 0.12 + Math.sin(t * 23 + i) * 0.08;
        fe.set(Math.sin(t * 5 + i) * 0.12, t * 2 + i, Math.cos(t * 6 + i) * 0.12);
        fq.setFromEuler(fe);
        fp.set(x, y, z);
        fs.set(1, k, 1);
        fm.compose(fp, fq, fs);
        flameMesh.setMatrixAt(i, fm);
        fs.set(1, k * 1.1, 1);
        fm.compose(fp, fq, fs);
        innerMesh.setMatrixAt(i, fm);
      }
      flameMesh.instanceMatrix.needsUpdate = true;
      innerMesh.instanceMatrix.needsUpdate = true;
      curtain.material.opacity = 0.38 + Math.sin(t * 6) * 0.06;
    },
  };
}

// Perimeter of the island rect with outward normals; corners get quarter-circle fans.
function perimeterSamples(step) {
  const I = ISLAND;
  const out = [];
  const side = (ax, az, bx, bz, nx, nz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) out.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, nx, nz]);
  };
  // counter-clockwise seen from above: east side north->south, south side, west side south->north
  side(I.maxX, I.maxZ + 30, I.maxX, I.minZ, 1, 0);
  for (let i = 0; i < 6; i++) {
    const a = -(i / 6) * (Math.PI / 2);
    out.push([I.maxX, I.minZ, Math.cos(a), Math.sin(a)]);
  }
  side(I.maxX, I.minZ, I.minX, I.minZ, 0, -1);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 - (i / 6) * (Math.PI / 2);
    out.push([I.minX, I.minZ, Math.cos(a), Math.sin(a)]);
  }
  side(I.minX, I.minZ, I.minX, I.maxZ + 30, -1, 0);
  return out;
}

function buildBeachGeometry(r) {
  const P = perimeterSamples(2.5);
  const D = [0, 2, 4, 6, 8, 9, 10.5, 13, 18, 26, 40];
  const H = (d) => {
    if (d <= 8) return -0.95 - (d / 8) * 0.17;
    if (d <= 9) return -1.12 - (d - 8) * 0.1;
    if (d <= 13) return -1.22 - ((d - 9) / 4) * 0.5;
    return -1.72 - ((d - 13) / 27) * 4.5;
  };
  const dry = new THREE.Color('#f7e3b0'), wet = new THREE.Color('#d7bc86'), under = new THREE.Color('#9fc9b0');
  const pos = [], colr = [], uv = [], idx = [];
  const c = new THREE.Color();
  P.forEach(([px, pz, nx, nz]) => {
    D.forEach((d) => {
      const x = px + nx * d, z = pz + nz * d;
      const bump = d > 0 && d < 8 ? (r() - 0.5) * 0.08 : 0;
      pos.push(x, H(d) + bump, z);
      if (d < 7.5) c.copy(dry);
      else if (d < 10) c.copy(wet);
      else c.copy(wet).lerp(under, Math.min(1, (d - 10) / 12));
      colr.push(c.r, c.g, c.b);
      uv.push(x * 0.08, z * 0.08);
    });
  });
  const nd = D.length;
  for (let i = 0; i < P.length - 1; i++) {
    for (let j = 0; j < nd - 1; j++) {
      const a = i * nd + j, b = (i + 1) * nd + j, c2 = a + 1, d2 = b + 1;
      idx.push(a, c2, b, b, c2, d2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // winding may be flipped depending on traversal; make normals point up
  const n = g.attributes.normal;
  let flip = false;
  if (n.getY(0 + 3) < 0) flip = true;
  if (flip) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}
