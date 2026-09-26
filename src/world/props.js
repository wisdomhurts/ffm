// Reusable low-poly prop builders that append parts to a Merger (one draw call per area).
import * as THREE from 'three';

const TAU = Math.PI * 2;

/** Leaf/blade: flattened octahedron from (x,y,z) along yaw/pitch (pitch > 0 droops). */
export function leaf(m, x, y, z, yaw, pitch, len, width, color, thick = 0.16, o = {}) {
  const dx = Math.sin(yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
  m.prim('octa', x + dx * len * 0.5, y + dy * len * 0.5, z + dz * len * 0.5, width, thick, len, color, { rx: pitch, ry: yaw, ao: 0.1, ...o });
  return [x + dx * len, y + dy * len, z + dz * len];
}

/** Curvy palm tree. Returns the top position. */
export function palm(m, x, z, r, { y = 0, h = r.range(9, 13), lean = r.range(0.05, 0.3), yaw = r() * TAU, fronds = 8, coconuts = true } = {}) {
  const segs = 5;
  let px = x, py = y, pz = z;
  const lx = Math.sin(yaw), lz = Math.cos(yaw);
  const trunkA = '#a8784c', trunkB = '#8a6038';
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const off0 = lean * h * t0 * t0, off1 = lean * h * t1 * t1;
    const ax = x + lx * off0, az = z + lz * off0, ay = y + h * t0;
    const bx = x + lx * off1, bz = z + lz * off1, by = y + h * t1;
    const rad = 0.62 - 0.26 * t0;
    m.beam(ax, ay, az, bx, by + 0.08, bz, rad * 2, i % 2 ? trunkA : trunkB, { prim: 'cylo:6', ao: 0.12 });
    m.beam(ax, ay - 0.06, az, ax + (bx - ax) * 0.12, ay + (by - ay) * 0.12, az + (bz - az) * 0.12, rad * 2.25, trunkB, { prim: 'cylo:6', ao: 0 });
    px = bx; py = by; pz = bz;
  }
  // crown
  m.prim('sphere:6', px, py + 0.2, pz, 1.4, 1.0, 1.4, '#6f8f2f', { ao: 0.2 });
  const greens = ['#3fae3f', '#52c24a', '#2f9a3c', '#5fcf55'];
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + r.range(-0.2, 0.2);
    const c = greens[i % greens.length];
    const len1 = r.range(3.2, 4.2), len2 = r.range(3.0, 4.0);
    const [ex, ey, ez] = leaf(m, px, py + 0.3, pz, a, r.range(-0.5, -0.25), len1, 1.7, c);
    const [fx, fy, fz] = leaf(m, ex, ey, ez, a + r.range(-0.1, 0.1), r.range(0.35, 0.6), len2, 1.5, c);
    leaf(m, fx, fy, fz, a, r.range(0.9, 1.2), 1.8, 1.0, c);
  }
  if (coconuts) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      m.prim('sphere:5', px + Math.sin(a) * 0.7, py - 0.5, pz + Math.cos(a) * 0.7, 0.75, 0.8, 0.75, '#6b4423', { ao: 0.1 });
    }
  }
  return [px, py, pz];
}

/** Round lollipop tree (Sunny Field). */
export function roundTree(m, x, z, r, { y = 0, h = r.range(5, 8), size = r.range(3.5, 5), colors = ['#4cc24a', '#5fd354', '#3fb043'] } = {}) {
  m.cyl(x, y, z, 0.45, h, '#8a5a34', { seg: 7 });
  const c = r.pick(colors);
  m.prim('sphere:10', x, y + h + size * 0.35, z, size * 2, size * 1.8, size * 2, c, { ao: 0.35 });
  m.prim('sphere:8', x + size * 0.5, y + h + size * 0.9, z - size * 0.2, size * 1.2, size * 1.1, size * 1.2, c, { ao: 0.25 });
}

/** Chunky pine (stacked cones). */
export function pine(m, x, z, r, { y = 0, h = r.range(9, 14), color = r.pick(['#2f8a4a', '#3a9a52', '#2a7a44']) } = {}) {
  m.cyl(x, y, z, 0.5, h * 0.3, '#6e4a2c', { seg: 6 });
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const w = (1 - t * 0.55) * h * 0.42;
    m.prim('cone:8', x, y + h * 0.25 + t * h * 0.55 + h * 0.18, z, w, h * 0.36, w, color, { ao: 0.3, ry: i });
  }
}

/** Rock: irregular low-poly lump. */
export function rock(m, x, y, z, s, r, color = '#9aa0a8', o = {}) {
  m.prim(r() < 0.5 ? 'dodeca' : 'ico:0', x, y, z, s * r.range(0.8, 1.3), s * r.range(0.5, 0.9), s * r.range(0.8, 1.3), color, { rx: r.range(-0.3, 0.3), ry: r() * TAU, rz: r.range(-0.3, 0.3), ao: 0.3, ...o });
}

/** Street lamp. glow: Merger for the bulb. */
export function lamp(m, glow, x, z, { y = 0, h = 7, pole = '#2d3a4a', light = '#fff2b0' } = {}) {
  m.block(x, y, z, 1.1, 0.6, 1.1, pole);
  m.cyl(x, y + 0.6, z, 0.2, h - 0.6, pole, { seg: 8 });
  m.cyl(x, y + h - 0.2, z, 0.55, 0.3, pole, { seg: 8 });
  m.cyl(x, y + h + 1.2, z, 0.62, 0.25, pole, { seg: 8 });
  m.prim('cone:8', x, y + h + 1.75, z, 1.4, 0.8, 1.4, pole);
  glow.prim('sphere:10', x, y + h + 0.6, z, 1.05, 1.2, 1.05, light, { ao: 0 });
}

/** Tiki torch: bamboo pole + basket; returns flame position. */
export function tikiTorch(m, x, z, { y = 0, h = 4.6 } = {}) {
  m.add('bamboo', new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(0.36, h, 0.36)), '#c9a25a', { ao: 0.2 });
  m.cyl(x, y + h * 0.35, z, 0.26, 0.2, '#6b4a2a');
  m.cyl(x, y + h * 0.7, z, 0.26, 0.2, '#6b4a2a');
  m.prim('frustum:8', x, y + h + 0.35, z, 0.9, 0.8, 0.9, '#7a5230', { rx: Math.PI, ao: 0.2 });
  return [x, y + h + 0.8, z];
}

/** Thatched palapa umbrella. */
export function palapa(m, x, z, r, { y = 0, h = 5.2, radius = 3.6 } = {}) {
  m.cyl(x, y, z, 0.22, h, '#8a6a44', { seg: 6 });
  m.prim('cone:10', x, y + h + 0.6, z, radius * 2, 2.2, radius * 2, '#d9a95a', { ao: 0.35, ry: r() });
  m.prim('cone:10', x, y + h + 1.3, z, radius * 1.1, 1.4, radius * 1.1, '#c8964c', { ao: 0.2, ry: r() });
  m.cyl(x, y + h - 0.1, z, radius * 1.02, 0.25, '#b88444', { seg: 10, open: true });
}

/** Lounge chair facing yaw. */
export function lounger(m, x, z, yaw, color, { y = 0 } = {}) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const P = (u, v) => [x + s * v + c * u, z + c * v - s * u];
  const [ax, az] = P(0, 0);
  m.box(ax, y + 0.55, az, 1.4, 0.18, 3.2, color, { ry: yaw });
  const [bx, bz] = P(0, -1.6);
  m.box(bx, y + 1.1, bz, 1.4, 0.18, 1.4, color, { ry: yaw, rx: -0.9 });
  for (const [u, v] of [[-0.6, 1.3], [0.6, 1.3], [-0.6, -1.3], [0.6, -1.3]]) {
    const [lx, lz] = P(u, v);
    m.block(lx, y, lz, 0.16, 0.5, 0.16, '#ffffff', { ao: 0 });
  }
}

/** Sagging rope between two posts (4 segments). */
export function rope(m, ax, az, bx, bz, y, sag, color = '#c9a86a', thick = 0.16) {
  const N = 4;
  let px = ax, py = y, pz = az;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const nx = ax + (bx - ax) * t, nz = az + (bz - az) * t;
    const ny = y - sag * 4 * t * (1 - t);
    m.beam(px, py, pz, nx, ny, nz, thick, color, { ao: 0 });
    px = nx; py = ny; pz = nz;
  }
}

/** Flower cluster (instanced-free: tiny boxes). */
export function flower(m, x, y, z, color, s = 1) {
  m.block(x, y, z, 0.1 * s, 0.7 * s, 0.1 * s, '#3f9a3c', { ao: 0 });
  m.prim('octa', x, y + 0.75 * s, z, 0.6 * s, 0.3 * s, 0.6 * s, color, { ao: 0 });
  m.prim('octa', x, y + 0.8 * s, z, 0.26 * s, 0.26 * s, 0.26 * s, '#ffd23f', { ao: 0 });
}

/** Bush: a few squashed spheres. */
export function bush(m, x, y, z, s, r, colors = ['#3fae3f', '#4cc24a', '#2f9a3c']) {
  for (let i = 0; i < 3; i++) {
    m.prim('sphere:8', x + r.range(-0.6, 0.6) * s, y + s * 0.45 + r() * 0.2 * s, z + r.range(-0.6, 0.6) * s, s * r.range(1.1, 1.5), s * r.range(0.8, 1.1), s * r.range(1.1, 1.5), r.pick(colors), { ao: 0.35 });
  }
}
