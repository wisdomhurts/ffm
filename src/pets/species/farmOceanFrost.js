// Pet species for the newer eggs (piglet, lamb, calf, pony, turtle, octopus, dolphin, narwhal, penguin, polarbear, yeticub, icedragon).
// Same contract as SPECIES in ../models.js: each entry {scale, fly?, head, tail?, tailAxis?, wing?, wingBase?,
// wingAmp?, wingSpeed?, build({body, head, tail, wing})}. Species without an entry fall back to the bunny.
import { EYE, WHITE, BLUSH, sym, face, smile } from '../kit.js';

const PI = Math.PI;

// ------------------------------------------------------------------ local helpers

/** Euler (rx, rz) that turn +Y towards the direction (dx, dy, dz). */
function upTo(dx, dy, dz) {
  const l = Math.hypot(dx, dy, dz) || 1;
  return { rz: -Math.asin(Math.max(-1, Math.min(1, dx / l))), rx: Math.atan2(dz / l, dy / l) };
}

/** Rounded stick from a to b (a box with capsule-like ends): tentacles, curly tails, arms. */
function stick(m, a, b, t, color, o = {}) {
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(dx, dy, dz);
  m.box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, t, len + t * 0.9, t, color, { r: t * 0.46, ...upTo(dx, dy, dz), ...o });
}

/** A chain of sticks through points [[x, y, z, thick?], ...] (a missing thickness keeps the previous one). */
function chain(m, pts, color, o = {}) {
  let t = pts[0][3];
  for (let i = 0; i < pts.length - 1; i++) {
    t = pts[i + 1][3] ?? t;
    stick(m, pts[i], pts[i + 1], t, color, o);
  }
}

// rotate a local offset by Euler XYZ with rz = 0 (first ry, then rx)
function rot(dx, dy, dz, rx, ry) {
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = dx * cy + dz * sy, z1 = -dx * sy + dz * cy;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  return [x1, dy * cx - z1 * sx, dy * sx + z1 * cx];
}

/** The kit's glossy eye, turned (rx, ry) so it sits flat on a curved head. */
function eyeAt(m, x, y, z, rx, ry, w, h) {
  const at = (dx, dy, dz) => {
    const [a, b, c] = rot(dx, dy, dz, rx, ry);
    return [x + a, y + b, z + c];
  };
  m.box(...at(0, 0, 0.015), w, h, 0.06, EYE, { r: w * 0.45, ao: 0, rx, ry });
  m.box(...at(-w * 0.18, h * 0.2, 0.055), w * 0.4, h * 0.32, 0.03, WHITE, { r: w * 0.15, ao: 0, glow: 0.45, rx, ry });
  m.box(...at(w * 0.2, -h * 0.24, 0.052), w * 0.2, h * 0.14, 0.02, WHITE, { r: w * 0.08, ao: 0, glow: 0.45, rx, ry });
}

/** Point on the front of an ellipsoid (centre c, radii r) at (x, y), with the Euler angles of its surface. */
function onFront(c, r, x, y) {
  const u = (x - c[0]) / r[0], v = (y - c[1]) / r[1];
  const w = Math.sqrt(Math.max(0.03, 1 - u * u - v * v));
  const n = [u / r[0], v / r[1], w / r[2]];
  const l = Math.hypot(...n);
  return { z: c[2] + w * r[2], rx: Math.atan2(-n[1] / l, n[2] / l), ry: Math.asin(n[0] / l) };
}

/** face() for a round (ellipsoid) head: eyes and cheeks follow the surface. */
function roundFace(m, c, r, { y, sep, w = 0.16, h = 0.23, blush = true, cheekY = null, cheekX = null }) {
  sym((s) => {
    const ex = c[0] + s * sep;
    const e = onFront(c, r, ex, y);
    eyeAt(m, ex, y, e.z - 0.012, e.rx, e.ry, w, h);
    if (blush) {
      const bx = c[0] + s * (cheekX ?? sep + w * 0.9), by = cheekY ?? y - h * 0.62;
      const k = onFront(c, r, bx, by);
      m.box(bx, by, k.z - 0.008, w * 0.9, h * 0.32, 0.03, BLUSH, { r: h * 0.14, ao: 0, rx: k.rx, ry: k.ry });
    }
  });
}

/** A mouth line that follows an ellipsoid's front. */
function roundSmile(m, c, r, y, w = 0.12, color = '#6b2a3c') {
  sym((s) => {
    const x = c[0] + s * w * 0.42;
    const k = onFront(c, r, x, y);
    m.box(x, y, k.z - 0.004, w * 0.62, 0.035, 0.03, color, { rz: s * 0.45, rx: k.rx, ry: k.ry, r: 0.015, ao: 0 });
  });
}

/** Happy closed eyes (^ ^). */
function sleepyEyes(m, x, y, z, sep, w, color) {
  sym((s) => {
    for (const k of [1, -1]) m.box(x + s * sep + k * w * 0.3, y, z, w * 0.62, w * 0.24, 0.03, color, { rz: -k * 0.55, r: w * 0.1, ao: 0, glow: 0.15 });
  });
}

/** Flat diamond flap (half sunk into the head, so a triangle shows) turned by ry and tipped by rx, with an inner colour. */
function flap(m, x, y, z, size, color, inner, rx, ry) {
  m.box(x, y, z, size, size, 0.07, color, { rz: PI / 4, ry, rx, r: 0.035 });
  if (!inner) return;
  const [a, b, c] = rot(0, size * 0.12, 0.03, rx, ry);
  m.box(x + a, y + b, z + c, size * 0.58, size * 0.58, 0.03, inner, { rz: PI / 4, ry, rx, r: 0.02, ao: 0 });
}

/** Flat snowflake facing +Z: three crossed bars and a dot. */
function snowflake(m, x, y, z, size, color, glow = 0.5) {
  for (let k = 0; k < 3; k++) m.box(x, y, z, size, size * 0.16, 0.025, color, { rz: (k * PI) / 3, r: size * 0.06, ao: 0, glow });
  m.ball(x, y, z + 0.01, size * 0.3, size * 0.3, 0.04, color, { ao: 0, glow });
}

// ------------------------------------------------------------------ species

export const FARM_OCEAN_FROST = {
  // ---------------------------------------------------------------- Farm
  piglet: {
    scale: 1.05,
    head: [0, 0.84, 0.3],
    tail: [0, 0.74, -0.64],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const P = '#ffadc6', PD = '#ff8db0', SN = '#ff86aa', HOOF = '#c95f80', NOS = '#b8436a';
      b.box(0, 0.54, -0.1, 0.98, 0.76, 1.12, P, { r: 0.34 });
      sym((s) => {
        for (const zz of [0.26, -0.44]) {
          b.box(s * 0.28, 0.16, zz, 0.24, 0.32, 0.26, P, { r: 0.09 });
          b.box(s * 0.28, 0.05, zz + 0.01, 0.26, 0.1, 0.28, HOOF, { r: 0.04 });
        }
      });
      b.ball(0.22, 0.915, -0.32, 0.34, 0.04, 0.3, PD, { ao: 0 });
      h.box(0, 0.36, 0.06, 1.04, 0.84, 0.88, P, { r: 0.34 });
      h.cyl(0, 0.24, 0.53, 0.2, 0.16, SN, { rx: PI / 2, r2: 0.15, seg: 16 });
      sym((s) => {
        h.box(s * 0.075, 0.24, 0.615, 0.065, 0.11, 0.03, NOS, { r: 0.03, ao: 0 });
        flap(h, s * 0.3, 0.72, 0.08, 0.36, P, PD, 1.0, -s * 0.35);
      });
      face(h, { y: 0.52, z: 0.49, sep: 0.26, w: 0.15, h: 0.21, blush: false });
      sym((s) => h.box(s * 0.35, 0.3, 0.475, 0.15, 0.07, 0.03, BLUSH, { ry: s * 0.35, r: 0.03, ao: 0 }));
      smile(h, 0, 0.06, 0.44, 0.1);
      chain(t, [[0, 0, 0.04, 0.1], [0, 0.05, -0.12], [0.1, 0.16, -0.18], [0.01, 0.28, -0.2], [-0.09, 0.18, -0.2], [-0.02, 0.12, -0.19, 0.085]], P);
    },
  },

  lamb: {
    scale: 1.1,
    head: [0, 0.9, 0.4],
    tail: [0, 0.8, -0.6],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const W = '#fff7e6', W2 = '#f1e2c6', D = '#5a4652', DH = '#3a2c35', PK = '#ffb3c7', LINE = '#ffe9f0';
      b.box(0, 0.62, -0.08, 0.86, 0.62, 1.0, W2, { r: 0.28 });
      for (const x of [-0.26, 0, 0.26]) for (const z of [0.2, -0.12, -0.44]) b.ball(x, 0.9 + (x === 0 ? 0.03 : 0), z, 0.42, 0.36, 0.42, W, { ao: 0.14 });
      sym((s) => {
        for (const z of [0.18, -0.16, -0.48]) b.ball(s * 0.42, 0.62, z, 0.36, 0.42, 0.4, W, { ao: 0.14 });
        for (const zz of [0.26, -0.44]) {
          b.box(s * 0.23, 0.18, zz, 0.15, 0.36, 0.15, D, { r: 0.06 });
          b.box(s * 0.23, 0.05, zz, 0.17, 0.1, 0.17, DH, { r: 0.04 });
        }
      });
      b.ball(0, 0.6, 0.38, 0.62, 0.52, 0.34, W, { ao: 0.12 });
      b.ball(0, 0.66, -0.6, 0.48, 0.44, 0.3, W, { ao: 0.12 });
      h.box(0, 0.22, 0.1, 0.7, 0.62, 0.6, D, { r: 0.22 });
      h.ball(0, 0.52, 0.06, 0.52, 0.38, 0.46, W, { ao: 0.1 });
      sym((s) => {
        h.ball(s * 0.22, 0.47, 0.02, 0.36, 0.32, 0.4, W, { ao: 0.1 });
        h.box(s * 0.46, 0.3, 0.0, 0.3, 0.12, 0.18, D, { rz: -s * 0.4, r: 0.05 });
        h.box(s * 0.47, 0.29, 0.07, 0.2, 0.06, 0.05, PK, { rz: -s * 0.4, r: 0.02, ao: 0 });
        h.box(s * 0.26, 0.15, 0.405, 0.12, 0.06, 0.03, BLUSH, { r: 0.025, ao: 0 });
      });
      sleepyEyes(h, 0, 0.27, 0.41, 0.16, 0.14, LINE);
      h.box(0, 0.16, 0.412, 0.1, 0.065, 0.03, PK, { r: 0.028, ao: 0 });
      smile(h, 0, 0.08, 0.405, 0.1, LINE);
      t.ball(0, 0, -0.04, 0.28, 0.28, 0.26, W);
    },
  },

  calf: {
    scale: 1.02,
    head: [0, 0.96, 0.4],
    tail: [0, 0.9, -0.68],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const W = '#fdfcf7', BK = '#2d2a33', PK = '#ffb3c4', PKD = '#d9607f', HORN = '#fff0c2', RED = '#ff4d5e', GOLD = '#ffd23f', HOOF = '#5a4a48';
      b.box(0, 0.62, -0.12, 0.9, 0.74, 1.2, W, { r: 0.22 });
      b.ball(0.455, 0.64, -0.28, 0.03, 0.36, 0.46, BK, { ao: 0 });
      b.ball(-0.455, 0.7, -0.02, 0.03, 0.3, 0.3, BK, { ao: 0 });
      b.ball(-0.455, 0.54, -0.48, 0.03, 0.2, 0.22, BK, { ao: 0 });
      b.ball(-0.12, 0.995, -0.42, 0.42, 0.03, 0.34, BK, { ao: 0 });
      sym((s) => {
        for (const zz of [0.3, -0.54]) {
          b.box(s * 0.25, 0.2, zz, 0.23, 0.4, 0.25, W, { r: 0.08 });
          b.box(s * 0.25, 0.05, zz + 0.01, 0.25, 0.1, 0.27, HOOF, { r: 0.04 });
        }
      });
      b.box(0, 0.88, 0.3, 0.94, 0.12, 0.44, RED, { r: 0.05 });
      b.box(0, 0.8, 0.53, 0.06, 0.12, 0.04, RED, { r: 0.02 });
      b.ball(0, 0.7, 0.58, 0.22, 0.2, 0.2, GOLD, { glow: 0.15 });
      b.cyl(0, 0.63, 0.58, 0.12, 0.08, GOLD, { seg: 14, glow: 0.15 });
      b.ball(0, 0.58, 0.58, 0.08, 0.08, 0.08, '#c98a12');
      h.box(0, 0.38, 0.06, 0.98, 0.8, 0.84, W, { r: 0.3 });
      h.ball(0.24, 0.57, 0.475, 0.4, 0.4, 0.04, BK, { ao: 0 });
      h.box(0, 0.17, 0.52, 0.68, 0.34, 0.28, PK, { r: 0.13 });
      sym((s) => {
        h.box(s * 0.13, 0.2, 0.665, 0.07, 0.09, 0.02, PKD, { r: 0.03, ao: 0 });
        h.cone(s * 0.24, 0.86, 0.02, 0.08, 0.16, HORN, { rz: -s * 0.25 });
        h.box(s * 0.58, 0.58, 0.0, 0.34, 0.14, 0.2, s > 0 ? W : BK, { rz: -s * 0.2, r: 0.06 });
        h.box(s * 0.6, 0.575, 0.07, 0.22, 0.08, 0.08, PK, { rz: -s * 0.2, r: 0.03, ao: 0 });
      });
      face(h, { y: 0.55, z: 0.49, sep: 0.25, w: 0.15, h: 0.22, cheekY: 0.4 });
      smile(h, 0, 0.08, 0.665, 0.12, '#b2405f');
      t.box(0, -0.22, -0.04, 0.08, 0.46, 0.08, W, { rx: 0.15, r: 0.03 });
      t.ball(0, -0.47, -0.08, 0.15, 0.2, 0.15, BK);
    },
  },

  pony: {
    scale: 1.05,
    head: [0, 1.06, 0.46],
    tail: [0, 1.0, -0.78],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const C = '#f4a65c', MZ = '#ffc98f', CL = '#fff1dc', HOOF = '#6b4a3a', NOS = '#c9825e';
      const PK = '#ff5fa2', PU = '#b36bff', AQ = '#4fc8ff';
      b.box(0, 0.8, -0.12, 0.88, 0.7, 1.28, C, { r: 0.28 });
      sym((s) => {
        for (const zz of [0.34, -0.56]) {
          b.box(s * 0.25, 0.32, zz, 0.25, 0.56, 0.27, C, { r: 0.09 });
          b.box(s * 0.25, 0.15, zz, 0.27, 0.14, 0.29, CL, { r: 0.06 });
          b.box(s * 0.25, 0.05, zz, 0.28, 0.1, 0.3, HOOF, { r: 0.04 });
        }
      });
      h.box(0, 0.06, -0.12, 0.48, 0.54, 0.46, C, { rx: 0.35, r: 0.15 });
      h.box(0, 0.5, 0.06, 0.9, 0.82, 0.86, C, { r: 0.3 });
      h.box(0, 0.28, 0.5, 0.52, 0.34, 0.28, MZ, { r: 0.14 });
      sym((s) => {
        h.box(s * 0.11, 0.33, 0.645, 0.06, 0.07, 0.02, NOS, { r: 0.025, ao: 0 });
        h.cone(s * 0.25, 1.0, -0.1, 0.13, 0.3, C, { seg: 4, ry: PI / 4 });
        h.cone(s * 0.25, 0.98, -0.05, 0.07, 0.18, '#ffc9a8', { seg: 4, ry: PI / 4, ao: 0 });
      });
      smile(h, 0, 0.19, 0.645, 0.12, '#9a4a3a');
      // mane: a crest over the head and down the neck, falling to one side
      h.box(0.12, 0.88, 0.38, 0.24, 0.22, 0.2, PK, { rz: -0.6, r: 0.09, top: PU });
      h.box(0.04, 0.95, 0.08, 0.24, 0.2, 0.44, PU, { r: 0.09, top: PK });
      h.box(0.06, 0.8, -0.3, 0.34, 0.32, 0.36, AQ, { rx: 0.5, r: 0.12, top: PU });
      h.box(0.1, 0.46, -0.44, 0.34, 0.44, 0.3, PK, { rx: 0.15, r: 0.12, top: AQ });
      h.box(0.12, 0.1, -0.4, 0.32, 0.36, 0.28, PU, { rx: -0.1, r: 0.12, top: PK });
      h.box(0.3, 0.62, -0.36, 0.14, 0.3, 0.26, PU, { rz: 0.15, r: 0.06, top: PK });
      face(h, { y: 0.6, z: 0.49, sep: 0.24, w: 0.15, h: 0.22, cheekY: 0.4 });
      t.box(0, -0.02, -0.1, 0.24, 0.26, 0.32, PK, { rx: 0.6, r: 0.1, top: PU });
      t.box(0, -0.26, -0.24, 0.3, 0.32, 0.3, PU, { rx: 0.3, r: 0.12, top: PK });
      t.box(0, -0.52, -0.3, 0.32, 0.32, 0.28, AQ, { rx: 0.1, r: 0.12, top: PU });
      t.box(0, -0.76, -0.28, 0.26, 0.26, 0.24, PK, { r: 0.1, top: AQ });
    },
  },

  // ---------------------------------------------------------------- Ocean
  turtle: {
    scale: 1.2,
    head: [0, 0.46, 0.62],
    tail: [0, 0.34, -0.74],
    tailAxis: 'y',
    build({ body: b, head: h, tail: t }) {
      const SH = '#1f8a55', PL = '#7fd65c', RIM = '#d8f27a', SK = '#78d8c2', SKD = '#4db3a0', BEL = '#fff1c2';
      const C = [0, 0.52, -0.08], R = [0.62, 0.46, 0.68];
      b.ball(C[0], C[1], C[2], R[0] * 2, R[1] * 2, R[2] * 2, SH, { seg: 18 });
      b.ball(0, 0.38, -0.08, 1.34, 0.22, 1.46, RIM, { seg: 18 });
      b.box(0, 0.26, -0.06, 0.86, 0.2, 1.0, BEL, { r: 0.09 });
      // hexagon plates on the shell
      const plate = (phi, th, size) => {
        const p = [R[0] * Math.sin(phi) * Math.sin(th), R[1] * Math.cos(phi), R[2] * Math.sin(phi) * Math.cos(th)];
        const n = [p[0] / R[0] ** 2, p[1] / R[1] ** 2, p[2] / R[2] ** 2];
        b.cyl(C[0] + p[0], C[1] + p[1], C[2] + p[2], size, 0.07, PL, { seg: 6, ...upTo(...n) });
      };
      plate(0, 0, 0.21);
      for (let k = 0; k < 6; k++) plate(0.95, (k * PI) / 3 + PI / 6, 0.19);
      sym((s) => {
        b.box(s * 0.66, 0.24, 0.28, 0.56, 0.1, 0.26, SK, { ry: -s * 0.55, r: 0.05 });
        b.box(s * 0.5, 0.22, -0.6, 0.36, 0.08, 0.22, SK, { ry: s * 0.6, r: 0.04 });
        b.ball(s * 0.78, 0.29, 0.36, 0.1, 0.03, 0.08, SKD, { ao: 0 });
      });
      h.box(0, 0.0, -0.1, 0.36, 0.3, 0.34, SK, { r: 0.12 });
      h.box(0, 0.2, 0.12, 0.68, 0.56, 0.58, SK, { r: 0.22 });
      h.ball(0.18, 0.475, 0.12, 0.14, 0.04, 0.14, SKD, { ao: 0 });
      h.ball(-0.1, 0.48, -0.02, 0.1, 0.04, 0.1, SKD, { ao: 0 });
      face(h, { y: 0.26, z: 0.41, sep: 0.17, w: 0.14, h: 0.2, blush: false });
      sym((s) => h.box(s * 0.25, 0.12, 0.405, 0.12, 0.06, 0.03, BLUSH, { r: 0.025, ao: 0 }));
      smile(h, 0, 0.1, 0.415, 0.11, '#2d6b5c');
      t.cone(0, 0, -0.08, 0.08, 0.22, SK, { rx: -PI / 2 });
    },
  },

  octopus: {
    scale: 1.08,
    head: [0, 0.42, 0.0],
    tail: [0, 0.3, -0.22],
    tailAxis: 'y',
    wing: [0.24, 0.3, 0.0],
    wingBase: 0,
    wingAmp: 0.3,
    wingSpeed: 5,
    build({ body: b, head: h, tail: t, wing: w }) {
      const O = '#ff6b9d', OT = '#ff8fb8', SP = '#ffbfd6', SU = '#ffd6e6';
      // three tentacles wiggle as the tail, one per side rides the wing pivots (walkers keep wings at rest in
      // the game; the hatch and the gallery wave them), the front three are body.
      // one tentacle along direction th (0 = front), relative to a pivot; the tip curls up
      const tent = (m, th, [px, py, pz], len = 1, curl = 1) => {
        const sx = Math.sin(th), cz = Math.cos(th);
        const P = (r, y, k) => [sx * r - px, y - py, cz * r - pz, k];
        chain(m, [P(0.22, 0.36, 0.22), P(0.46 * len, 0.12, 0.2), P(0.7 * len, 0.09, 0.16), P(0.8 * len, 0.1 + 0.16 * curl, 0.12)], O);
        const tip = P(0.82 * len, 0.1 + 0.2 * curl);
        m.ball(tip[0], tip[1] + 0.02, tip[2], 0.1, 0.1, 0.1, SU, { ao: 0 });
      };
      b.ball(0, 0.38, 0, 0.84, 0.36, 0.8, O, { seg: 16 });
      tent(b, 0, [0, 0, 0], 0.92, 1.1);
      sym((s) => tent(b, s * 0.8, [0, 0, 0], 1, 0.9));
      tent(w, PI / 2, [0.24, 0.3, 0], 1.02, 1);
      tent(t, PI, [0, 0.3, -0.22], 1, 1.2);
      sym((s) => tent(t, s * 2.35, [0, 0.3, -0.22], 0.98, 0.8));
      const C = [0, 0.52, -0.04], R = [0.56, 0.53, 0.5];
      h.ball(C[0], C[1], C[2], R[0] * 2, R[1] * 2, R[2] * 2, O, { top: OT, seg: 18 });
      h.ball(0.26, 0.88, -0.1, 0.16, 0.05, 0.16, SP, { ao: 0, rz: -0.6, rx: -0.2 });
      h.ball(-0.18, 0.95, 0.06, 0.12, 0.04, 0.12, SP, { ao: 0, rz: 0.4 });
      h.ball(0.02, 0.9, -0.32, 0.14, 0.05, 0.14, SP, { ao: 0, rx: -0.6 });
      h.ball(-0.4, 0.62, -0.2, 0.05, 0.13, 0.13, SP, { ao: 0, ry: 0.5 });
      roundFace(h, C, R, { y: 0.5, sep: 0.21, w: 0.19, h: 0.27, cheekY: 0.36, cheekX: 0.33 });
      roundSmile(h, C, R, 0.31, 0.12);
    },
  },

  dolphin: {
    scale: 1.22,
    fly: 3.0,
    head: [0, 0.06, 0.12],
    tail: [0, 0.0, -0.88],
    tailAxis: 'y',
    wing: [0.36, -0.2, -0.04],
    wingBase: -0.35,
    wingAmp: 0.3,
    wingSpeed: 4,
    build({ body: b, head: h, tail: t, wing: w }) {
      const B = '#46a8ff', BT = '#2f84e6', BL = '#e3f4ff', BD = '#1d5fb8';
      b.ball(0, 0.0, -0.3, 0.76, 0.7, 1.3, B, { top: BT, seg: 18 });
      b.ball(0, -0.13, -0.24, 0.56, 0.44, 1.02, BL, { seg: 16, ao: 0 });
      b.slab([[0, -0.2], [0.2, -0.32], [0.34, -0.54], [0.14, -0.5], [0, -0.58]], 0.26, 0.08, BT, { rz: PI / 2 });
      // the head is a ball around its own pivot, so looking around only slides the face over it
      const C = [0, 0, 0], R = [0.46, 0.42, 0.44];
      h.ball(0, 0, 0, R[0] * 2, R[1] * 2, R[2] * 2, B, { top: BT, seg: 18 });
      h.ball(0, -0.14, 0.06, 0.64, 0.46, 0.68, BL, { seg: 14, ao: 0 });
      h.ball(0, -0.07, 0.45, 0.28, 0.19, 0.4, B, { seg: 14 });
      h.ball(0, -0.13, 0.43, 0.24, 0.11, 0.36, BL, { seg: 12, ao: 0 });
      h.ball(0, 0.38, -0.08, 0.1, 0.03, 0.08, BD, { ao: 0 });
      roundFace(h, C, R, { y: 0.1, sep: 0.17, w: 0.14, h: 0.2, cheekY: -0.04, cheekX: 0.27 });
      sym((s) => h.box(s * 0.12, -0.075, 0.4, 0.14, 0.03, 0.03, BD, { rz: s * 0.3, ry: s * 0.5, r: 0.012, ao: 0 }));
      w.slab([[0, 0.12], [0.26, 0.08], [0.42, -0.06], [0.38, -0.14], [0.14, -0.12], [0, -0.06]], 0, 0.06, BT, { ao: 0 });
      t.ball(0, 0.02, -0.1, 0.34, 0.3, 0.44, B, { top: BT });
      t.slab([[0, -0.2], [0.18, -0.26], [0.4, -0.36], [0.42, -0.46], [0.2, -0.44], [0, -0.38], [-0.2, -0.44], [-0.42, -0.46], [-0.4, -0.36], [-0.18, -0.26]], 0.04, 0.07, BT, { ao: 0 });
    },
  },

  narwhal: {
    scale: 1.18,
    fly: 3.0,
    head: [0, 0.06, 0.12],
    tail: [0, 0.0, -0.94],
    tailAxis: 'y',
    wing: [0.38, -0.2, -0.06],
    wingBase: -0.3,
    wingAmp: 0.35,
    wingSpeed: 4.5,
    build({ body: b, head: h, tail: t, wing: w }) {
      const N = '#a9b7ff', NT = '#b99cff', NB = '#eef1ff', SPOT = '#7f86e0', HORN = '#fff4c8', HR = '#ffd6f2';
      const BC = [0, 0.0, -0.32], BR = [0.41, 0.38, 0.68];
      b.ball(BC[0], BC[1], BC[2], BR[0] * 2, BR[1] * 2, BR[2] * 2, N, { top: NT, seg: 18 });
      b.ball(0, -0.14, -0.26, 0.62, 0.46, 1.08, NB, { seg: 16, ao: 0 });
      for (const [x, z, s] of [[0.18, -0.4, 0.15], [-0.14, -0.54, 0.13], [0.08, -0.72, 0.1], [-0.2, -0.3, 0.1], [0.26, -0.62, 0.08]]) {
        const u = x / BR[0], v = (z - BC[2]) / BR[2];
        const y = BC[1] + BR[1] * Math.sqrt(Math.max(0, 1 - u * u - v * v));
        b.ball(x, y - 0.012, z, s, 0.04, s, SPOT, { ao: 0, ...upTo(u / BR[0], (y - BC[1]) / BR[1] ** 2, v / BR[2]) });
      }
      const C = [0, 0, 0], R = [0.5, 0.46, 0.46];
      h.ball(0, 0, 0, R[0] * 2, R[1] * 2, R[2] * 2, N, { top: NT, seg: 18 });
      h.ball(0, -0.17, 0.08, 0.66, 0.42, 0.66, NB, { seg: 14, ao: 0 });
      // spiral horn
      const a = 1.15, L = 0.72, base = [0, 0.3, 0.3];
      const d = [0, Math.cos(a), Math.sin(a)];
      h.cone(0, base[1] + d[1] * L * 0.5, base[2] + d[2] * L * 0.5, 0.085, L, HORN, { rx: a, glow: 0.55, seg: 10 });
      for (let k = 0; k < 4; k++) {
        const u = 0.1 + k * 0.15;
        h.cyl(0, base[1] + d[1] * u, base[2] + d[2] * u, 0.085 * (1 - u / L) + 0.012, 0.03, HR, { rx: a + 0.35, glow: 0.6, seg: 10, ao: 0 });
      }
      roundFace(h, C, R, { y: 0.08, sep: 0.19, w: 0.15, h: 0.21, cheekY: -0.06, cheekX: 0.3 });
      roundSmile(h, C, R, -0.1, 0.12);
      w.slab([[0, 0.1], [0.24, 0.1], [0.36, -0.02], [0.3, -0.14], [0.1, -0.12], [0, -0.06]], 0, 0.07, NT, { ao: 0 });
      t.ball(0, 0.02, -0.1, 0.36, 0.32, 0.44, N, { top: NT });
      t.slab([[0, -0.22], [0.16, -0.24], [0.34, -0.3], [0.4, -0.42], [0.26, -0.48], [0.1, -0.42], [0, -0.36], [-0.1, -0.42], [-0.26, -0.48], [-0.4, -0.42], [-0.34, -0.3], [-0.16, -0.24]], 0.04, 0.08, NT, { ao: 0 });
    },
  },

  // ---------------------------------------------------------------- Frost
  penguin: {
    scale: 1.1,
    head: [0, 0.96, 0.04],
    wing: [0.44, 0.8, -0.02],
    wingBase: 0,
    wingAmp: 0.5,
    wingSpeed: 10,
    build({ body: b, head: h, wing: w }) {
      const N = '#2b3a67', ND = '#1c2748', OR = '#ffa51f', SC = '#ff4d6d', SCW = '#fff4f6';
      b.box(0, 0.52, -0.02, 0.9, 0.9, 0.82, N, { r: 0.36 });
      b.ball(0, 0.48, 0.34, 0.66, 0.74, 0.18, WHITE, { ao: 0 });
      sym((s) => b.box(s * 0.2, 0.05, 0.22, 0.28, 0.1, 0.36, OR, { r: 0.04 }));
      b.box(0, 0.16, -0.44, 0.3, 0.12, 0.2, N, { rx: 0.5, r: 0.05 });
      b.box(0, 0.95, 0.0, 0.94, 0.15, 0.86, SC, { r: 0.07 });
      b.box(0.24, 0.75, 0.42, 0.17, 0.32, 0.06, SC, { rz: 0.12, r: 0.04 });
      for (const y of [0.7, 0.8]) b.box(0.243, y, 0.452, 0.18, 0.04, 0.02, SCW, { rz: 0.12, r: 0.01, ao: 0 });
      h.box(0, 0.36, 0, 0.94, 0.78, 0.84, N, { r: 0.34 });
      sym((s) => h.ball(s * 0.19, 0.32, 0.36, 0.42, 0.52, 0.14, WHITE, { ao: 0 }));
      h.cone(0, 0.2, 0.52, 0.09, 0.2, OR, { rx: PI / 2, seg: 6, ao: 0 });
      face(h, { y: 0.36, z: 0.43, sep: 0.19, w: 0.14, h: 0.2, cheekY: 0.18 });
      w.box(0.06, -0.23, 0, 0.1, 0.5, 0.32, ND, { rz: 0.42, r: 0.05 });
    },
  },

  polarbear: {
    scale: 1.22,
    head: [0, 0.96, 0.52],
    tail: [0, 0.76, -0.74],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const W = '#f6faff', NOSE = '#1d1a2f', IN = '#f2c9d6', BLUE = '#4fb4ff';
      b.box(0, 0.6, -0.1, 1.1, 0.88, 1.3, W, { r: 0.4 });
      b.ball(0, 0.96, 0.18, 0.76, 0.3, 0.56, W, { ao: 0.05 });
      b.ball(0, 0.62, 0.5, 0.74, 0.64, 0.24, W, { ao: 0.05 });
      sym((s) => {
        for (const zz of [0.32, -0.5]) b.box(s * 0.31, 0.2, zz, 0.36, 0.4, 0.38, W, { r: 0.15 });
      });
      b.cyl(0, 0.58, 0.61, 0.15, 0.05, BLUE, { rx: PI / 2, seg: 16 });
      snowflake(b, 0, 0.58, 0.64, 0.22, WHITE, 0.5);
      h.box(0, 0.36, 0.06, 1.06, 0.86, 0.9, W, { r: 0.38 });
      sym((s) => {
        h.ball(s * 0.38, 0.8, 0.0, 0.3, 0.3, 0.18, W);
        h.ball(s * 0.38, 0.8, 0.07, 0.17, 0.17, 0.06, IN, { ao: 0 });
      });
      h.ball(0, 0.8, 0.14, 0.2, 0.14, 0.18, W);
      h.ball(0.1, 0.78, 0.2, 0.14, 0.12, 0.14, W);
      h.box(0, 0.2, 0.5, 0.46, 0.32, 0.24, '#fff3e3', { r: 0.12 });
      h.ball(0, 0.3, 0.63, 0.2, 0.13, 0.1, NOSE, { ao: 0 });
      smile(h, 0, 0.14, 0.625, 0.12, '#4a3a4a');
      face(h, { y: 0.52, z: 0.5, sep: 0.26, w: 0.14, h: 0.2, cheekY: 0.3 });
      t.ball(0, 0, -0.04, 0.24, 0.24, 0.22, W);
    },
  },

  yeticub: {
    scale: 1.12,
    head: [0, 0.98, 0.04],
    build({ body: b, head: h }) {
      const F = '#f4f9ff', FB = '#c4e4ff', SK = '#86c5ff', HORN = '#fff1c9', SNOW = '#ffffff', MOUTH = '#2e3f7a';
      b.box(0, 0.54, 0, 0.94, 0.86, 0.8, F, { r: 0.38 });
      b.ball(0, 0.4, 0.34, 0.56, 0.5, 0.14, FB, { ao: 0 });
      // shaggy tufts around the hips and shoulders
      for (const [x, y, z, s, c] of [[0.36, 0.2, 0.2, 0.3, F], [-0.36, 0.2, 0.2, 0.3, F], [0.44, 0.26, -0.2, 0.3, FB], [-0.44, 0.26, -0.2, 0.3, F], [0, 0.22, -0.36, 0.32, FB], [0.46, 0.84, -0.02, 0.3, F], [-0.46, 0.84, -0.02, 0.3, FB]]) {
        b.ball(x, y, z, s, s * 0.9, s, c);
      }
      sym((s) => {
        b.box(s * 0.24, 0.07, 0.14, 0.32, 0.14, 0.42, SK, { r: 0.06 });
        stick(b, [s * 0.44, 0.74, 0.14], [s * 0.3, 0.6, 0.4], 0.26, F);
        b.ball(s * 0.26, 0.58, 0.48, 0.2, 0.2, 0.2, SK);
      });
      b.ball(0, 0.6, 0.57, 0.38, 0.36, 0.36, '#d9eeff', { glow: 0.15, seg: 14, top: SNOW });
      h.box(0, 0.36, 0, 1.0, 0.82, 0.88, F, { r: 0.38 });
      h.ball(0, 0.3, 0.38, 0.72, 0.56, 0.18, SK, { ao: 0 });
      sym((s) => {
        h.cone(s * 0.34, 0.84, -0.04, 0.09, 0.26, HORN, { rz: -s * 0.5, seg: 8 });
        h.ball(s * 0.52, 0.2, 0.06, 0.24, 0.28, 0.26, F);
        h.box(s * 0.26, 0.19, 0.44, 0.12, 0.055, 0.03, BLUSH, { r: 0.025, ao: 0 });
      });
      h.ball(0, 0.8, 0.12, 0.3, 0.2, 0.26, FB);
      h.ball(0.08, 0.86, 0.2, 0.18, 0.14, 0.16, F);
      face(h, { y: 0.36, z: 0.44, sep: 0.18, w: 0.15, h: 0.21, blush: false });
      h.box(0, 0.16, 0.462, 0.15, 0.07, 0.02, MOUTH, { r: 0.03, ao: 0 });
      h.box(0.035, 0.18, 0.474, 0.04, 0.035, 0.02, WHITE, { r: 0.01, ao: 0 });
    },
  },

  icedragon: {
    scale: 1.1,
    fly: 3.4,
    head: [0, 0.42, 0.4],
    tail: [0, -0.12, -0.66],
    tailAxis: 'y',
    wing: [0.38, 0.3, -0.12],
    wingBase: 0.3,
    wingAmp: 0.6,
    wingSpeed: 6.5,
    build({ body: b, head: h, tail: t, wing: w }) {
      const I = '#6cbfff', IT = '#c6eeff', ID = '#3f8fe0', IB = '#b9f3ff', CR = '#d9f7ff', CR2 = '#9fe6ff', WG = '#8fdcff', WG2 = '#dcf7ff';
      b.box(0, 0, -0.08, 0.94, 0.9, 1.16, I, { r: 0.36, top: IT });
      b.ball(0, -0.08, 0.49, 0.64, 0.7, 0.1, IB, { ao: 0, glow: 0.3 });
      for (let k = 0; k < 3; k++) b.box(0, 0.12 - k * 0.2, 0.545, 0.5, 0.03, 0.02, '#7fd0f0', { r: 0.01, ao: 0, glow: 0.2 });
      for (const [z, y, hh] of [[0.2, 0.46, 0.3], [-0.14, 0.47, 0.36], [-0.48, 0.4, 0.28]]) b.cone(0, y + 0.1, z, 0.09, hh, CR, { seg: 5, rx: -0.25, glow: 0.5, ao: 0 });
      sym((s) => {
        b.box(s * 0.3, -0.5, 0.18, 0.26, 0.26, 0.3, I, { r: 0.1 });
        b.box(s * 0.3, -0.62, 0.33, 0.24, 0.06, 0.06, IB, { r: 0.02, ao: 0 });
      });
      h.box(0, 0.32, 0.06, 0.94, 0.8, 0.84, I, { r: 0.3, top: IT });
      h.box(0, 0.18, 0.56, 0.62, 0.38, 0.4, I, { r: 0.16 });
      h.cone(0, 0.92, -0.06, 0.1, 0.44, CR, { seg: 5, rx: -0.3, glow: 0.55, ao: 0 });
      sym((s) => {
        h.box(s * 0.13, 0.28, 0.765, 0.06, 0.06, 0.02, ID, { r: 0.02, ao: 0 });
        h.cone(s * 0.15, -0.02, 0.7, 0.04, 0.1, WHITE, { rx: PI, ao: 0 });
        h.cone(s * 0.27, 0.84, -0.1, 0.08, 0.34, CR2, { seg: 5, rx: -0.45, rz: -s * 0.35, glow: 0.5, ao: 0 });
        h.cone(s * 0.52, 0.48, -0.04, 0.1, 0.3, CR2, { rz: -s * 1.2, seg: 5, glow: 0.35, ao: 0 });
      });
      face(h, { y: 0.46, z: 0.49, sep: 0.24, cheekY: 0.3, iris: '#3fb8ff' });
      snowflake(h, 0, 0.66, 0.475, 0.15, WHITE, 0.6);
      t.box(0, 0, -0.26, 0.36, 0.34, 0.56, I, { r: 0.14, rx: -0.2, top: IT });
      t.box(0, 0.1, -0.68, 0.24, 0.22, 0.46, I, { r: 0.1, rx: -0.35 });
      t.cone(0, 0.22, -0.98, 0.12, 0.34, CR, { rx: -PI / 2 - 0.35, seg: 5, glow: 0.55, ao: 0 });
      sym((s) => t.cone(s * 0.1, 0.2, -0.9, 0.07, 0.24, CR2, { rx: -PI / 2 - 0.35, rz: -s * 0.6, seg: 5, glow: 0.5, ao: 0 }));
      w.slab([[0, 0.06], [0.7, 0.14], [1.12, -0.26], [0.92, -0.3], [0.9, -0.5], [0.72, -0.4], [0.6, -0.62], [0.46, -0.42], [0.3, -0.52], [0.2, -0.36], [0, -0.26]], 0, 0.05, WG, { glow: 0.3, ao: 0 });
      w.slab([[0.04, 0.04], [0.62, 0.1], [0.86, -0.14], [0.56, -0.28], [0.26, -0.3], [0.04, -0.2]], 0.035, 0.04, WG2, { glow: 0.35, ao: 0 });
      w.beam(0, 0, 0.02, 0.7, 0.03, 0.14, 0.11, ID);
      w.beam(0.7, 0.03, 0.14, 1.12, 0.02, -0.26, 0.07, ID);
      w.beam(0.7, 0.03, 0.14, 0.6, 0.02, -0.62, 0.07, ID);
    },
  },
};
