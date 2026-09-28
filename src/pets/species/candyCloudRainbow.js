// Pet species for the newer eggs (donutpup, cupcakecat, cottonsheep, gummydragon, cloudbunny, angelcat, pegasus, sunlion, rainbowjelly, prismfox, rainbowdragon).
// Same contract as SPECIES in ../models.js: each entry {scale, fly?, head, tail?, tailAxis?, wing?, wingBase?,
// wingAmp?, wingSpeed?, build({body, head, tail, wing})}. Species without an entry fall back to the bunny.
import { WHITE, sym, face, smile } from '../kit.js';

const TAU = Math.PI * 2;
const RAINBOW = ['#ff4d6d', '#ff9a2e', '#ffe03a', '#5fe07a', '#4fb8ff', '#a77bff'];
const PASTEL = ['#ff9ec0', '#ffc58f', '#fff08a', '#a8f0a0', '#9fd8ff', '#cfaaff'];
const GOLD = '#ffd23f';

/** n pieces around a vertical ring: fn(x, z, angle, k) with the angle measured from +Z towards +X. */
function around(n, r, fn, a0 = 0) {
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * TAU;
    fn(Math.sin(a) * r, Math.cos(a) * r, a, k);
  }
}

/** A ring of short blocks (a halo) around (x, y, z), tipped back by `tilt` so it reads from the front. */
function ring(p, n, r, x, y, z, thick, color, tilt = 0, o = {}) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  around(n, r, (dx, dz, a) => p.box(x + dx, y - dz * s, z + dz * c, (TAU * r) / n * 1.12, thick, thick, color, { r: thick * 0.45, rx: tilt, ry: a, ao: 0, ...o }));
}

/** Cone spikes fanned out in the XY plane around (cx, cy, cz), like the rays of a sun. */
function rays(p, n, cx, cy, cz, r0, len, rad, colors, o = {}, a0 = 0) {
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * TAU;
    const dx = Math.sin(a), dy = Math.cos(a);
    const d = r0 + len / 2;
    p.cone(cx + dx * d, cy + dy * d, cz, rad, len, colors[k % colors.length], { rz: -a, seg: 6, ao: 0, ...o });
  }
}

/** One long feather (a flat slab) from base (bx, bz) to tip (tx, tz) in a wing's plane. */
function feather(p, bx, bz, tx, tz, w, y, thick, color, o = {}) {
  const dx = tx - bx, dz = tz - bz;
  const L = Math.hypot(dx, dz) || 1;
  const nx = (-dz / L) * w, nz = (dx / L) * w;
  const mx = bx + dx * 0.72, mz = bz + dz * 0.72;
  p.slab([[bx + nx * 0.7, bz + nz * 0.7], [mx + nx, mz + nz], [tx, tz], [mx - nx, mz - nz], [bx - nx * 0.7, bz - nz * 0.7]], y, thick, color, o);
}

/** Scale a 2D outline towards (ox, oz). */
const shrink = (pts, f, ox = 0, oz = 0) => pts.map(([x, z]) => [ox + (x - ox) * f, oz + (z - oz) * f]);

export const CANDY_CLOUD_RAINBOW = {
  // ---------------------------------------------------------------- Candy Egg
  donutpup: {
    scale: 1.0,
    head: [0, 0.74, 0.5],
    tail: [0, 0.6, -0.86],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const F = '#f7d8ab', FD = '#7a4a2e', CR = '#fff6e6';
      const DOUGH = '#eba24e', HOLE = '#a8652e', ICE = '#ff7fc0', ICEL = '#ffb6dd';
      const SPR = ['#ffffff', '#ffe23a', '#4fc8ff', '#6fe07a', '#b98cff', '#ff5c6c'];
      // the donut is the body: golden dough, a pink frosting cap with drips, the hole and sprinkles
      const DZ = -0.22;
      b.ball(0, 0.55, DZ, 1.34, 0.62, 1.34, DOUGH, { seg: 18 });
      b.ball(0, 0.66, DZ, 1.26, 0.46, 1.26, ICE, { seg: 18, top: ICEL, ao: 0 });
      around(7, 0.62, (x, z) => b.ball(x, 0.58, DZ + z, 0.17, 0.22, 0.17, ICE, { ao: 0 }), 0.9);
      b.cyl(0, 0.865, DZ, 0.17, 0.08, HOLE, { seg: 14, ao: 0 });
      b.cyl(0, 0.855, DZ, 0.25, 0.07, '#f2b870', { seg: 14, ao: 0 });
      [[0.3, -0.28, 0.4], [-0.32, -0.22, -0.7], [0.42, 0.1, 1.2], [-0.44, 0.04, 0.2], [0.1, -0.44, -1.1], [-0.12, -0.46, 0.9], [0.46, -0.18, -0.3], [-0.48, -0.18, 1.4], [0.26, 0.26, 2.1], [-0.28, 0.28, -0.2]].forEach(([x, dz, a], k) => {
        const r = Math.hypot(x, dz);
        const y = 0.66 + 0.23 * Math.sqrt(Math.max(0, 1 - (r / 0.63) ** 2)) + 0.012;
        b.box(x, y, DZ + dz, 0.14, 0.045, 0.05, SPR[k % SPR.length], { ry: a, r: 0.02, ao: 0, glow: 0.12 });
      });
      sym((s) => {
        for (const zz of [0.22, -0.62]) {
          b.box(s * 0.3, 0.17, zz, 0.24, 0.34, 0.26, F, { r: 0.09 });
          b.box(s * 0.3, 0.05, zz + 0.02, 0.26, 0.1, 0.3, CR, { r: 0.04 });
        }
      });
      h.box(0, 0.4, 0.08, 0.96, 0.8, 0.82, F, { r: 0.3 });
      h.box(0, 0.22, 0.48, 0.52, 0.34, 0.28, CR, { r: 0.12 });
      h.ball(0, 0.34, 0.63, 0.19, 0.13, 0.12, '#3a2430', { ao: 0 });
      h.box(0, 0.08, 0.57, 0.15, 0.13, 0.06, '#ff7aa2', { r: 0.05, ao: 0 });
      sym((s) => {
        // chocolate-glazed floppy ears with a pink frosting tip
        h.box(s * 0.54, 0.44, 0.02, 0.17, 0.56, 0.4, FD, { rz: s * 0.28, r: 0.08 });
        h.box(s * 0.615, 0.2, 0.02, 0.18, 0.15, 0.41, ICE, { rz: s * 0.28, r: 0.07, ao: 0 });
      });
      // a tiny donut hair-clip
      h.cyl(0.22, 0.8, 0.14, 0.12, 0.08, ICE, { rx: 0.3, rz: -0.3, seg: 12, ao: 0 });
      h.cyl(0.22, 0.815, 0.145, 0.05, 0.08, '#f2b870', { rx: 0.3, rz: -0.3, seg: 10, ao: 0 });
      face(h, { y: 0.52, z: 0.49, sep: 0.25 });
      t.box(0, 0.18, -0.08, 0.16, 0.42, 0.16, F, { rx: -0.45, r: 0.07 });
      t.ball(0, 0.42, -0.2, 0.22, 0.22, 0.22, ICE, { ao: 0 });
    },
  },

  cupcakecat: {
    scale: 1.0,
    head: [0, 0.94, 0.08],
    tail: [0, 0.6, -0.46],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const K = '#fff3e4', KD = '#f6b36a', W1 = '#8fd8ff', W2 = '#62bdf2', CAKE = '#e8a65a';
      const ICE = '#ff9fd0', ICEL = '#ffd3ec', CHERRY = '#ff2d55';
      // pleated wrapper, leaning out at the top
      b.cyl(0, 0.26, 0, 0.4, 0.5, W2, { seg: 12 });
      around(10, 0.42, (x, z, a, k) => b.box(x, 0.27, z, 0.08, 0.52, 0.28, k % 2 ? W2 : W1, { rz: -0.13, ry: a - Math.PI / 2, r: 0.03 }));
      // cake top with the kitty popping out of it
      b.ball(0, 0.56, 0, 1.08, 0.3, 1.08, CAKE, { seg: 16 });
      b.box(0, 0.74, 0.0, 0.72, 0.5, 0.64, K, { r: 0.24 });
      sym((s) => {
        b.ball(s * 0.2, 0.67, 0.42, 0.22, 0.17, 0.26, K);
        b.box(s * 0.2, 0.7, 0.54, 0.1, 0.03, 0.03, KD, { r: 0.01, ao: 0 });
      });
      h.box(0, 0.38, 0.04, 1.04, 0.84, 0.86, K, { r: 0.3 });
      for (const x of [-0.1, 0.1]) h.box(x, 0.7, 0.47, 0.05, 0.12, 0.04, KD, { r: 0.015, ao: 0 });
      sym((s) => {
        h.cone(s * 0.36, 0.86, 0.02, 0.2, 0.4, K, { seg: 4, ry: Math.PI / 4, rz: -s * 0.25 });
        h.cone(s * 0.35, 0.84, 0.08, 0.11, 0.24, '#ffb3c7', { seg: 4, ry: Math.PI / 4, rz: -s * 0.25, ao: 0 });
        for (const k of [0, 1]) h.box(s * 0.44, 0.25 - k * 0.07, 0.5, 0.3, 0.022, 0.022, '#ffffff', { rz: s * (0.14 - k * 0.24), r: 0.01, ao: 0, glow: 0.2 });
      });
      h.box(0, 0.24, 0.49, 0.42, 0.26, 0.08, WHITE, { r: 0.1, ao: 0 });
      h.box(0, 0.32, 0.54, 0.1, 0.07, 0.05, '#ff7aa2', { r: 0.03, ao: 0 });
      face(h, { y: 0.48, z: 0.47, sep: 0.25, w: 0.16, h: 0.24, iris: '#4fb8ff' });
      // frosting swirl hat + cherry
      h.ball(0, 0.84, -0.02, 0.7, 0.24, 0.66, ICE, { ao: 0 });
      h.ball(0, 0.98, -0.02, 0.52, 0.22, 0.5, ICEL, { ao: 0 });
      h.ball(0, 1.1, -0.02, 0.34, 0.2, 0.34, ICE, { ao: 0 });
      h.cone(0, 1.2, -0.02, 0.12, 0.16, ICEL, { ao: 0 });
      h.ball(0, 1.34, 0.0, 0.22, 0.21, 0.22, CHERRY, { glow: 0.15 });
      h.ball(-0.04, 1.38, 0.08, 0.06, 0.05, 0.04, WHITE, { glow: 0.6, ao: 0 });
      h.beam(0, 1.42, 0, 0.08, 1.56, -0.06, 0.035, '#3fae4a');
      [[0.22, 0.86, 0.26, '#ffe23a'], [-0.26, 0.88, 0.2, '#4fc8ff'], [0.12, 1.02, 0.2, '#6fe07a'], [-0.1, 1.0, 0.22, '#ffffff'], [0.3, 0.9, -0.1, '#b98cff']].forEach(([x, y, z, c], k) =>
        h.box(x, y, z, 0.1, 0.035, 0.04, c, { ry: k * 1.3, r: 0.015, ao: 0, glow: 0.12 }));
      t.box(0, 0.22, -0.1, 0.16, 0.5, 0.16, K, { rx: -0.5, r: 0.07 });
      t.box(0, 0.56, -0.26, 0.17, 0.3, 0.17, KD, { rx: -0.15, r: 0.07 });
    },
  },

  cottonsheep: {
    scale: 1.1,
    fly: 2.6,
    head: [0, 0.12, 0.5],
    tail: [0, 0.12, -0.6],
    tailAxis: 'y',
    build({ body: b, head: h, tail: t }) {
      const PK = '#ffb3da', BL = '#a6d8ff', LV = '#d8b8ff', FACE = '#fff4f8', HOOF = '#b98ad8';
      const puff = (p, x, y, z, d, c) => p.ball(x, y, z, d, d * 0.9, d, c, { seg: 10, glow: 0.08 });
      b.ball(0, 0, -0.06, 1.0, 0.82, 1.1, PK, { seg: 14, glow: 0.06 });
      [
        [0.02, 0.38, 0.14, 0.62, BL], [-0.04, 0.36, -0.32, 0.6, LV], [0.4, 0.14, 0.22, 0.54, LV], [-0.4, 0.12, 0.2, 0.54, BL],
        [0.44, 0.1, -0.3, 0.56, BL], [-0.44, 0.06, -0.32, 0.56, PK], [0.22, -0.26, 0.08, 0.5, BL], [-0.22, -0.26, -0.1, 0.5, LV],
        [0.04, 0.1, -0.58, 0.52, PK], [0.3, 0.36, -0.1, 0.42, PK], [-0.32, 0.34, 0.0, 0.42, PK],
      ].forEach(([x, y, z, d, c]) => puff(b, x, y, z, d, c));
      sym((s) => {
        for (const zz of [0.24, -0.28]) {
          b.box(s * 0.22, -0.42, zz, 0.14, 0.28, 0.14, FACE, { r: 0.06 });
          b.box(s * 0.22, -0.56, zz, 0.16, 0.1, 0.16, HOOF, { r: 0.05, ao: 0 });
        }
      });
      h.box(0, 0.0, 0.08, 0.64, 0.58, 0.5, FACE, { r: 0.22 });
      sym((s) => {
        h.box(s * 0.4, 0.06, 0.0, 0.3, 0.13, 0.16, FACE, { rz: -s * 0.35, r: 0.06 });
        h.box(s * 0.41, 0.055, 0.03, 0.2, 0.07, 0.12, '#ffc2dc', { rz: -s * 0.35, r: 0.03, ao: 0 });
      });
      puff(h, 0, 0.32, 0.02, 0.44, PK);
      puff(h, 0.2, 0.26, -0.04, 0.34, BL);
      puff(h, -0.2, 0.27, -0.03, 0.34, LV);
      face(h, { y: 0.02, z: 0.33, sep: 0.16, w: 0.13, h: 0.19, cheekY: -0.1 });
      smile(h, 0, -0.16, 0.335, 0.1);
      puff(t, 0, 0, -0.06, 0.32, BL);
    },
  },

  gummydragon: {
    scale: 1.1,
    fly: 3.2,
    head: [0, 0.42, 0.4],
    tail: [0, -0.12, -0.66],
    tailAxis: 'y',
    wing: [0.38, 0.3, -0.12],
    wingBase: 0.3,
    wingAmp: 0.6,
    wingSpeed: 7,
    build({ body: b, head: h, tail: t, wing: w }) {
      const G = '#3fdc34', GL = '#a8ff4a', GD = '#1f8a2a', RED = '#ff2f62', REDL = '#ff7fa6', OR = '#ff9a1e', YL = '#ffe01a';
      const JELLY = { glow: 0.2 };
      b.box(0, 0, -0.08, 0.98, 0.94, 1.18, G, { r: 0.42, top: GL, ...JELLY });
      b.ball(0, -0.08, 0.5, 0.66, 0.72, 0.12, RED, { top: REDL, ao: 0, glow: 0.25 });
      b.ball(0.24, 0.3, 0.22, 0.2, 0.1, 0.34, WHITE, { rx: 0.5, glow: 0.5, ao: 0 });
      [[0.3, 0.48, RED], [-0.06, 0.5, OR], [-0.42, 0.44, YL]].forEach(([z, y, c]) => b.ball(0, y + 0.06, z, 0.2, 0.3, 0.22, c, { glow: 0.3, ao: 0 }));
      [[0.36, 0.18, 0.3], [-0.4, 0.1, 0.1], [0.44, -0.2, -0.3], [-0.3, 0.3, -0.5], [0.2, 0.36, -0.36], [-0.44, -0.18, 0.2]].forEach(([x, y, z], k) => {
        const sx = Math.sign(x);
        b.box(x + sx * 0.04, y, z, 0.05, 0.05, 0.05, WHITE, { ry: k, rx: k * 0.7, r: 0.01, glow: 0.4, ao: 0 });
      });
      sym((s) => {
        b.box(s * 0.3, -0.5, 0.18, 0.26, 0.26, 0.3, G, { r: 0.12, ...JELLY });
        b.box(s * 0.3, -0.62, 0.33, 0.24, 0.06, 0.06, WHITE, { r: 0.02, ao: 0 });
      });
      h.box(0, 0.32, 0.08, 0.96, 0.82, 0.86, G, { r: 0.34, top: GL, ...JELLY });
      h.box(0, 0.19, 0.56, 0.62, 0.4, 0.42, G, { r: 0.18, top: GL, ...JELLY });
      h.ball(-0.22, 0.66, 0.2, 0.26, 0.1, 0.2, WHITE, { rx: 0.4, glow: 0.5, ao: 0 });
      sym((s) => {
        h.box(s * 0.13, 0.3, 0.775, 0.06, 0.06, 0.02, GD, { r: 0.02, ao: 0 });
        h.cone(s * 0.27, 0.84, -0.12, 0.11, 0.3, YL, { rx: -0.5, glow: 0.3, seg: 8 });
        h.ball(s * 0.27, 0.72, -0.06, 0.2, 0.12, 0.2, OR, { glow: 0.3, ao: 0 });
        h.ball(s * 0.53, 0.52, -0.02, 0.26, 0.14, 0.14, RED, { rz: s * 0.5, glow: 0.3, ao: 0 });
      });
      face(h, { y: 0.47, z: 0.51, sep: 0.24, cheekY: 0.3 });
      smile(h, 0, 0.1, 0.775, 0.12);
      t.box(0, 0, -0.26, 0.38, 0.36, 0.56, G, { r: 0.16, rx: -0.2, top: GL, ...JELLY });
      t.box(0, 0.1, -0.66, 0.26, 0.24, 0.44, G, { r: 0.11, rx: -0.35, top: GL, ...JELLY });
      t.ball(0, 0.2, -0.96, 0.3, 0.26, 0.3, RED, { glow: 0.3, top: REDL });
      const WING = [[0, 0.06], [0.7, 0.14], [1.1, -0.28], [0.86, -0.3], [0.74, -0.58], [0.46, -0.4], [0.2, -0.36], [0, -0.26]];
      w.slab(WING, 0, 0.08, RED, { glow: 0.3, ao: 0 });
      w.slab(shrink(WING, 0.62, 0.1, -0.08), 0.03, 0.06, REDL, { glow: 0.35, ao: 0 });
      w.beam(0, 0.02, 0.02, 0.7, 0.05, 0.14, 0.12, G, { glow: 0.2 });
      w.beam(0.7, 0.05, 0.14, 1.1, 0.04, -0.28, 0.08, G, { glow: 0.2 });
      w.beam(0.7, 0.05, 0.14, 0.74, 0.04, -0.58, 0.08, G, { glow: 0.2 });
    },
  },

  // ---------------------------------------------------------------- Cloud Egg
  cloudbunny: {
    scale: 1.0,
    fly: 2.8,
    head: [0, 0.3, 0.22],
    tail: [0, 0.06, -0.5],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const CW = '#ffffff', CB = '#cfe4ff';
      const puff = (p, x, y, z, sx, sy, sz) => p.ball(x, y, z, sx, sy, sz, CB, { top: CW, ao: 0, seg: 12, glow: 0.12 });
      puff(b, 0, 0, -0.06, 0.96, 0.8, 1.0);
      sym((s) => {
        puff(b, s * 0.36, -0.08, 0.14, 0.52, 0.48, 0.52);
        puff(b, s * 0.32, -0.04, -0.32, 0.54, 0.5, 0.54);
        puff(b, s * 0.2, -0.36, 0.2, 0.36, 0.28, 0.4);
        puff(b, s * 0.22, -0.32, -0.3, 0.38, 0.3, 0.42);
      });
      puff(b, 0, 0.3, -0.28, 0.56, 0.46, 0.56);
      puff(h, 0, 0.34, 0.06, 1.04, 0.86, 0.9);
      sym((s) => {
        puff(h, s * 0.34, 0.14, 0.26, 0.42, 0.36, 0.34);
        puff(h, s * 0.3, 0.66, -0.06, 0.34, 0.3, 0.3);
        h.box(s * 0.24, 1.08, -0.08, 0.28, 0.8, 0.2, CB, { top: CW, rz: -s * 0.14, r: 0.12, ao: 0, glow: 0.06 });
        h.box(s * 0.245, 1.07, 0.02, 0.14, 0.56, 0.04, '#ffc6da', { rz: -s * 0.14, r: 0.02, ao: 0 });
      });
      face(h, { y: 0.4, z: 0.5, sep: 0.24 });
      h.box(0, 0.25, 0.53, 0.14, 0.09, 0.06, '#ff8fb0', { r: 0.04, ao: 0 });
      smile(h, 0, 0.16, 0.52, 0.12);
      // a tiny rainbow tail rising out of a cloud puff
      [...RAINBOW.slice(0, 5), '#ffffff'].forEach((c, k) =>
        t.cyl(0, 0.08, -0.08 - k * 0.018, 0.3 - k * 0.045, 0.06, c, { rx: Math.PI / 2, seg: 18, ao: 0, glow: 0.15 }));
      puff(t, 0, -0.08, -0.12, 0.74, 0.34, 0.36);
    },
  },

  angelcat: {
    scale: 1.0,
    fly: 3.0,
    head: [0, 0.3, 0.42],
    tail: [0, 0.14, -0.62],
    tailAxis: 'z',
    wing: [0.28, 0.3, -0.18],
    wingBase: 0.5,
    wingAmp: 0.45,
    wingSpeed: 6,
    build({ body: b, head: h, tail: t, wing: w }) {
      const K = '#fbfbff', KS = '#e4e9ff', PK = '#ffb3c7', HALO = '#ffe066', FEA = '#fff6d6';
      b.box(0, 0, -0.12, 0.8, 0.66, 1.1, K, { r: 0.26, glow: 0.08 });
      b.ball(0, -0.06, 0.42, 0.5, 0.5, 0.1, WHITE, { ao: 0 });
      sym((s) => {
        for (const zz of [0.26, -0.5]) {
          b.box(s * 0.23, -0.34, zz, 0.2, 0.34, 0.22, K, { r: 0.08 });
          b.box(s * 0.23, -0.49, zz + 0.02, 0.22, 0.08, 0.24, KS, { r: 0.035 });
        }
      });
      b.box(0, 0.24, 0.38, 0.64, 0.12, 0.2, '#9fd8ff', { r: 0.05 });
      b.ball(0, 0.12, 0.5, 0.15, 0.15, 0.15, GOLD, { glow: 0.45 });
      h.box(0, 0.4, 0.06, 1.04, 0.86, 0.86, K, { r: 0.3, glow: 0.08 });
      sym((s) => {
        h.cone(s * 0.3, 0.92, 0.0, 0.22, 0.42, K, { seg: 4, ry: Math.PI / 4 });
        h.cone(s * 0.3, 0.9, 0.07, 0.12, 0.26, PK, { seg: 4, ry: Math.PI / 4, ao: 0 });
        for (const k of [0, 1]) h.box(s * 0.44, 0.27 - k * 0.07, 0.5, 0.3, 0.022, 0.022, '#d6dcf0', { rz: s * (0.14 - k * 0.24), r: 0.01, ao: 0 });
      });
      h.box(0, 0.26, 0.49, 0.42, 0.26, 0.08, WHITE, { r: 0.1, ao: 0 });
      h.box(0, 0.34, 0.54, 0.1, 0.07, 0.05, '#ff7aa2', { r: 0.03, ao: 0 });
      face(h, { y: 0.49, z: 0.49, sep: 0.25, w: 0.16, h: 0.24, iris: '#6ec6ff', lashes: true });
      // glowing golden halo floating above the ears
      ring(h, 12, 0.3, 0, 1.24, -0.02, 0.075, HALO, -0.45, { glow: 0.9 });
      // small feathered wings: rounded coverts over four long feathers
      [[0.08, 0.0, 0.5, -0.5], [0.16, 0.04, 0.8, -0.36], [0.24, 0.08, 1.0, -0.12], [0.3, 0.12, 1.06, 0.14]].forEach(([bx, bz, tx, tz], k) =>
        feather(w, bx, bz, tx, tz, 0.12, -0.012 + k * 0.004, 0.045, K, { glow: 0.3, ao: 0 }));
      w.slab([[0, 0.16], [0.32, 0.24], [0.6, 0.18], [0.62, 0.0], [0.4, -0.12], [0.14, -0.14], [0, -0.06]], 0.02, 0.06, FEA, { glow: 0.35, ao: 0 });
      t.box(0, 0.2, -0.1, 0.16, 0.48, 0.16, K, { rx: -0.6, r: 0.07 });
      t.box(0, 0.54, -0.28, 0.17, 0.3, 0.17, HALO, { rx: -0.2, r: 0.07, glow: 0.35 });
    },
  },

  pegasus: {
    scale: 1.1,
    fly: 3.4,
    head: [0, 0.34, 0.54],
    tail: [0, 0.22, -0.74],
    tailAxis: 'y',
    wing: [0.28, 0.3, 0.04],
    wingBase: 0.5,
    wingAmp: 0.5,
    wingSpeed: 4.5,
    build({ body: b, head: h, tail: t, wing: w }) {
      const H = '#fdfbff', HP = '#fff0f7', HOOF = '#ffe27a';
      const MANE = ['#ffd84a', '#ffc2e0', '#dcb8ff', '#aee0ff', '#ffe89a'];
      const SHINE = { glow: 0.1 };
      b.box(0, 0, -0.1, 0.8, 0.68, 1.32, H, { r: 0.26, ...SHINE });
      b.ball(0, 0.02, 0.5, 0.56, 0.56, 0.2, H, SHINE);
      sym((s) => {
        // front legs tucked forward, hind legs trailing: galloping through the sky
        b.box(s * 0.23, -0.4, 0.4, 0.2, 0.46, 0.22, H, { rx: -0.55, r: 0.08, ...SHINE });
        b.box(s * 0.23, -0.58, 0.54, 0.23, 0.12, 0.25, HOOF, { rx: -0.55, r: 0.04, glow: 0.6, ao: 0 });
        b.box(s * 0.23, -0.4, -0.6, 0.2, 0.46, 0.22, H, { rx: 0.55, r: 0.08, ...SHINE });
        b.box(s * 0.23, -0.58, -0.74, 0.23, 0.12, 0.25, HOOF, { rx: 0.55, r: 0.04, glow: 0.6, ao: 0 });
      });
      b.box(0, 0.33, -0.02, 0.5, 0.05, 0.5, GOLD, { r: 0.02, glow: 0.35, ao: 0 });
      h.box(0, 0.06, -0.12, 0.44, 0.54, 0.44, H, { rx: 0.4, r: 0.14, ...SHINE });
      h.box(0, 0.5, 0.06, 0.84, 0.78, 0.84, H, { r: 0.3, ...SHINE });
      h.box(0, 0.32, 0.5, 0.6, 0.42, 0.34, HP, { r: 0.15 });
      sym((s) => {
        h.box(s * 0.12, 0.36, 0.67, 0.06, 0.08, 0.02, '#e89cc0', { r: 0.02, ao: 0 });
        h.cone(s * 0.24, 1.0, -0.1, 0.13, 0.3, H, { seg: 4, ry: Math.PI / 4 });
        h.cone(s * 0.24, 0.98, -0.06, 0.07, 0.18, '#ffc2e0', { seg: 4, ry: Math.PI / 4, ao: 0 });
      });
      // golden star on the forehead
      rays(h, 5, 0, 0.84, 0.47, 0.02, 0.09, 0.05, [GOLD], { glow: 0.8, seg: 4 });
      // flowing golden-pastel mane, swept a little to one side
      h.box(0.02, 0.92, -0.12, 0.28, 0.26, 0.36, MANE[0], { r: 0.12, glow: 0.3 });
      h.box(0.05, 0.72, -0.38, 0.28, 0.32, 0.36, MANE[1], { r: 0.12, glow: 0.2 });
      h.box(0.07, 0.44, -0.48, 0.28, 0.36, 0.32, MANE[2], { r: 0.12, glow: 0.2 });
      h.box(0.06, 0.14, -0.44, 0.26, 0.34, 0.3, MANE[3], { r: 0.12, glow: 0.2 });
      h.box(0.03, -0.12, -0.36, 0.24, 0.26, 0.26, MANE[4], { r: 0.1, glow: 0.3 });
      h.box(0.12, 0.9, 0.3, 0.22, 0.24, 0.22, MANE[0], { rz: -0.45, r: 0.09, glow: 0.3 });
      face(h, { y: 0.58, z: 0.49, sep: 0.24, w: 0.15, h: 0.22, lashes: true, iris: '#7a6cff', cheekY: 0.36 });
      // long tail streaming out behind, fading from gold to pastel
      t.box(0, 0.06, -0.2, 0.26, 0.28, 0.5, MANE[0], { rx: 0.35, r: 0.12, glow: 0.3 });
      t.box(0, 0.12, -0.54, 0.3, 0.3, 0.46, MANE[1], { r: 0.13, glow: 0.2, top: MANE[0] });
      t.box(0, 0.02, -0.86, 0.28, 0.28, 0.44, MANE[2], { rx: -0.4, r: 0.12, glow: 0.2, top: MANE[1] });
      t.box(0, -0.18, -1.08, 0.22, 0.24, 0.34, MANE[3], { rx: -0.85, r: 0.1, glow: 0.25, top: MANE[2] });
      // big feathered wing: soft coverts + a fan of long feathers, the outer ones gold-tipped
      const COV = [[0, 0.16], [0.4, 0.26], [0.8, 0.2], [1.02, 0.04], [0.84, -0.12], [0.5, -0.18], [0.2, -0.2], [0, -0.1]];
      [[0.12, -0.04, 0.3, -0.66], [0.34, 0.0, 0.72, -0.7], [0.56, 0.04, 1.1, -0.6], [0.74, 0.08, 1.42, -0.38], [0.9, 0.1, 1.62, -0.08]].forEach(([bx, bz, tx, tz], k) => {
        feather(w, bx, bz, tx, tz, 0.15, -0.012 + k * 0.004, 0.045, H, { glow: 0.22, ao: 0 });
        if (k > 1) feather(w, bx + (tx - bx) * 0.7, bz + (tz - bz) * 0.7, tx, tz, 0.11, 0.014 + k * 0.004, 0.04, k === 3 ? '#ffd0ea' : '#ffe27a', { glow: 0.55, ao: 0 });
      });
      w.slab(COV, 0.03, 0.07, H, { glow: 0.2, ao: 0 });
      w.beam(0, 0.07, 0.13, 1.0, 0.07, 0.06, 0.07, GOLD, { glow: 0.55, ao: 0 });
    },
  },

  sunlion: {
    scale: 1.05,
    head: [0, 0.98, 0.42],
    tail: [0, 0.82, -0.72],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      const L = '#ffb22e', LT = '#ffd45a', CR = '#fff2cc', OR = '#ff8a1c', YL = '#ffe23a', FL = '#ff5a1c';
      b.box(0, 0.6, -0.12, 0.88, 0.74, 1.2, L, { r: 0.28, top: LT });
      b.ball(0, 0.54, 0.48, 0.52, 0.5, 0.1, CR, { ao: 0 });
      sym((s) => {
        for (const zz of [0.3, -0.54]) {
          b.box(s * 0.25, 0.2, zz, 0.25, 0.42, 0.27, L, { r: 0.09 });
          b.box(s * 0.25, 0.07, zz + 0.04, 0.29, 0.14, 0.31, CR, { r: 0.06 });
        }
      });
      // sun medallion collar
      b.ball(0, 0.78, 0.54, 0.2, 0.2, 0.08, GOLD, { glow: 0.7, ao: 0 });
      // sun-ray mane: a glowing disc ringed with alternating rays
      h.cyl(0, 0.36, -0.2, 0.64, 0.22, OR, { rx: Math.PI / 2, seg: 18, glow: 0.35 });
      h.cyl(0, 0.36, -0.34, 0.46, 0.1, YL, { rx: Math.PI / 2, seg: 18, glow: 0.5, ao: 0 });
      rays(h, 14, 0, 0.36, -0.2, 0.56, 0.36, 0.13, [YL, OR], { glow: 0.6 }, TAU / 28);
      h.box(0, 0.34, 0.08, 0.94, 0.8, 0.82, L, { r: 0.32, top: LT });
      sym((s) => {
        h.ball(s * 0.36, 0.78, 0.02, 0.28, 0.28, 0.16, L);
        h.ball(s * 0.36, 0.78, 0.07, 0.16, 0.16, 0.08, '#ff9f6a', { ao: 0 });
      });
      h.box(0, 0.2, 0.5, 0.5, 0.32, 0.2, CR, { r: 0.12 });
      h.box(0, 0.3, 0.61, 0.16, 0.1, 0.06, '#d0603a', { r: 0.04, ao: 0 });
      smile(h, 0, 0.16, 0.605, 0.12, '#8a3a24');
      face(h, { y: 0.47, z: 0.49, sep: 0.24, w: 0.16, h: 0.23, iris: '#ff9f1c', cheekY: 0.26 });
      t.box(0, 0.22, -0.08, 0.14, 0.5, 0.14, L, { rx: -0.55, r: 0.06 });
      t.ball(0, 0.46, -0.24, 0.26, 0.26, 0.26, OR, { glow: 0.6 });
      t.cone(0, 0.66, -0.3, 0.14, 0.4, FL, { rx: -0.2, glow: 0.7, ao: 0 });
      t.cone(0, 0.62, -0.28, 0.08, 0.26, YL, { rx: -0.2, glow: 0.9, ao: 0 });
      sym((s) => t.cone(s * 0.1, 0.58, -0.28, 0.08, 0.26, OR, { rx: -0.2, rz: -s * 0.5, glow: 0.7, ao: 0 }));
    },
  },

  // ---------------------------------------------------------------- Rainbow Egg
  rainbowjelly: {
    scale: 1.2,
    fly: 2.8,
    head: [0, 0.02, 0],
    tail: [0, -0.18, 0],
    tailAxis: 'y',
    build({ body: b, head: h, tail: t }) {
      const UNDER = '#ffe0f2';
      // a frilly skirt round the rim (the bell is the head, so it wobbles and looks around)
      around(14, 0.6, (x, z, a, k) => b.ball(x, -0.03, z, 0.26, 0.16, 0.26, k % 2 ? '#ffffff' : '#ffc6e6', { glow: 0.3, ao: 0 }));
      // rainbow bell: shells sharing one centre, each narrower but taller, so every colour shows as a band
      RAINBOW.forEach((c, k) => {
        const a = [1.28, 1.2, 1.08, 0.92, 0.72, 0.46][k];
        const hh = [0.56, 0.76, 0.87, 0.95, 0.99, 1.02][k];
        h.ball(0, 0, 0, a, hh, a, c, { glow: 0.2, ao: 0, seg: 20 });
      });
      h.ball(0, -0.1, 0, 1.2, 0.72, 1.2, UNDER, { glow: 0.3, ao: 0, seg: 20 });
      h.ball(-0.22, 0.4, 0.16, 0.2, 0.08, 0.14, WHITE, { rz: 0.5, rx: 0.3, glow: 0.8, ao: 0 });
      face(h, { y: 0.12, z: 0.6, sep: 0.2, w: 0.14, h: 0.2, cheekY: 0.0 });
      smile(h, 0, -0.01, 0.62, 0.1);
      // wavy ribbon tentacles in pastel rainbow + two frilly middle ribbons
      around(7, 0.36, (x, z, a, k) => {
        const c = PASTEL[k % 6];
        const L = k % 2 ? 1 : 0.82;
        const tx = Math.cos(a) * 0.12, tz = -Math.sin(a) * 0.12;
        const ix = -x * 0.15, iz = -z * 0.15;
        t.beam(x, 0.02, z, x + tx, -0.28 * L, z + tz, 0.1, c, { glow: 0.3 });
        t.beam(x + tx, -0.28 * L, z + tz, x - tx + ix, -0.56 * L, z - tz + iz, 0.085, c, { glow: 0.3 });
        t.beam(x - tx + ix, -0.56 * L, z - tz + iz, x + tx * 0.7 + ix, -0.82 * L, z + tz * 0.7 + iz, 0.07, c, { glow: 0.3 });
      }, TAU / 14);
      sym((s) => {
        t.box(s * 0.09, -0.26, 0.0, 0.1, 0.46, 0.18, '#ff9ed2', { rz: s * 0.25, r: 0.05, glow: 0.35 });
        t.box(s * 0.12, -0.62, 0.0, 0.1, 0.36, 0.16, '#ffc6e6', { rz: -s * 0.3, r: 0.05, glow: 0.35 });
      });
    },
  },

  prismfox: {
    scale: 1.0,
    head: [0, 0.92, 0.38],
    tail: [0, 0.8, -0.7],
    tailAxis: 'z',
    build({ body: b, head: h, tail: t }) {
      // pearly fur that shimmers pink to sky blue, with rainbow crystal shards growing out of it
      const PW = '#fbf8ff', BODY = '#f3c6ff', BODYT = '#bfe9ff', HEAD = '#ffd0ef', HEADT = '#d9ccff', PAW = '#8fd8ff';
      b.box(0, 0.6, -0.12, 0.84, 0.7, 1.22, BODY, { r: 0.24, top: BODYT });
      b.ball(0, 0.56, 0.46, 0.52, 0.5, 0.16, PW, { seg: 5, ao: 0, glow: 0.12 });
      b.ball(0, 0.8, 0.52, 0.16, 0.22, 0.12, '#ffffff', { seg: 4, glow: 0.7, ao: 0 });
      // crest of crystal shards down the back
      [[0.22, 0], [0.0, 1], [-0.22, 2], [-0.42, 3], [-0.6, 4]].forEach(([z, c], k) =>
        b.cone(k % 2 ? 0.08 : -0.08, 1.06 - k * 0.01, z, 0.13, 0.42 - k * 0.03, RAINBOW[c], { seg: 4, rz: k % 2 ? -0.32 : 0.32, rx: -0.2, glow: 0.4, ao: 0 }));
      sym((s) => {
        b.cone(s * 0.45, 0.72, -0.1, 0.1, 0.28, s > 0 ? RAINBOW[5] : RAINBOW[3], { seg: 4, rz: -s * 1.1, glow: 0.4, ao: 0 });
        b.cone(s * 0.44, 0.62, -0.42, 0.08, 0.22, s > 0 ? RAINBOW[4] : RAINBOW[1], { seg: 4, rz: -s * 1.3, glow: 0.4, ao: 0 });
        for (const zz of [0.3, -0.54]) {
          b.box(s * 0.24, 0.2, zz, 0.22, 0.4, 0.24, BODY, { r: 0.08 });
          b.box(s * 0.24, 0.07, zz + 0.01, 0.235, 0.14, 0.26, PAW, { r: 0.05, glow: 0.25 });
        }
      });
      h.box(0, 0.38, 0.04, 1.02, 0.8, 0.84, HEAD, { r: 0.28, top: HEADT });
      sym((s) => {
        h.ball(s * 0.27, 0.2, 0.4, 0.4, 0.3, 0.16, PW, { ao: 0 });
        h.cone(s * 0.3, 0.92, -0.02, 0.24, 0.5, s > 0 ? '#c58cff' : '#8fb8ff', { seg: 4, ry: Math.PI / 4, top: '#ff9ed6', glow: 0.15 });
        h.cone(s * 0.3, 0.88, 0.05, 0.14, 0.3, PW, { seg: 4, ry: Math.PI / 4, ao: 0 });
        h.cone(s * 0.3, 1.1, -0.02, 0.11, 0.15, '#ffffff', { seg: 4, ry: Math.PI / 4, glow: 0.8, ao: 0 });
      });
      h.box(0, 0.23, 0.56, 0.34, 0.26, 0.3, PW, { r: 0.1 });
      h.ball(0, 0.3, 0.71, 0.15, 0.11, 0.1, '#5b3fa8', { ao: 0 });
      // little crystal crown between the ears
      h.cone(0, 0.9, 0.12, 0.09, 0.3, RAINBOW[4], { seg: 4, rx: 0.2, glow: 0.6, ao: 0 });
      sym((s) => h.cone(s * 0.12, 0.84, 0.16, 0.07, 0.2, s > 0 ? RAINBOW[0] : RAINBOW[2], { seg: 4, rx: 0.2, rz: -s * 0.35, glow: 0.6, ao: 0 }));
      face(h, { y: 0.49, z: 0.46, sep: 0.25, w: 0.15, h: 0.22, cheekY: 0.3, iris: '#a77bff' });
      // tail of faceted rainbow gems with a glowing tip
      t.ball(0, 0.16, -0.2, 0.46, 0.46, 0.56, RAINBOW[5], { seg: 6, rx: 0.55, top: RAINBOW[4], glow: 0.2 });
      t.ball(0, 0.36, -0.5, 0.52, 0.52, 0.5, RAINBOW[3], { seg: 6, rx: 0.55, top: RAINBOW[2], glow: 0.2 });
      t.ball(0, 0.53, -0.76, 0.44, 0.44, 0.42, RAINBOW[1], { seg: 6, rx: 0.55, top: RAINBOW[0], glow: 0.2 });
      t.ball(0, 0.68, -0.96, 0.3, 0.42, 0.3, '#fff4fb', { seg: 4, rx: 0.55, glow: 0.95, ao: 0 });
    },
  },

  rainbowdragon: {
    scale: 1.15,
    fly: 3.4,
    head: [0, 0.44, 0.42],
    tail: [0, -0.1, -0.7],
    tailAxis: 'y',
    wing: [0.38, 0.32, -0.12],
    wingBase: 0.3,
    wingAmp: 0.55,
    wingSpeed: 5.5,
    build({ body: b, head: h, tail: t, wing: w }) {
      const [R, O, Y, G, B, P] = RAINBOW;
      const BELLY = '#fff0a8', HORN = '#ffd23f';
      // rainbow body, red at the nose to violet at the tail tip
      b.box(0, 0.02, 0.1, 0.98, 0.94, 0.78, O, { r: 0.36, top: Y });
      b.box(0, -0.02, -0.34, 0.94, 0.88, 0.8, G, { r: 0.34, top: '#9df07a' });
      b.ball(0, -0.08, 0.52, 0.66, 0.72, 0.12, BELLY, { glow: 0.55, ao: 0 });
      for (let k = 0; k < 3; k++) b.box(0, 0.12 - k * 0.2, 0.585, 0.46, 0.03, 0.02, '#ffc94a', { r: 0.01, glow: 0.4, ao: 0 });
      [[0.26, 0.5, R], [-0.04, 0.5, O], [-0.32, 0.47, Y], [-0.58, 0.4, G]].forEach(([z, y, c]) => b.cone(0, y + 0.08, z, 0.11, 0.26, c, { seg: 4, glow: 0.3, ao: 0 }));
      sym((s) => {
        b.box(s * 0.3, -0.5, 0.18, 0.26, 0.26, 0.3, O, { r: 0.1 });
        b.box(s * 0.3, -0.5, -0.46, 0.26, 0.26, 0.3, G, { r: 0.1 });
        b.box(s * 0.3, -0.62, 0.33, 0.24, 0.06, 0.06, GOLD, { r: 0.02, glow: 0.4, ao: 0 });
      });
      h.box(0, 0.32, 0.08, 0.96, 0.8, 0.86, '#ff6a86', { r: 0.3, top: '#ffa0b2', glow: 0.1 });
      h.box(0, 0.2, 0.58, 0.64, 0.4, 0.4, '#ff6a86', { r: 0.16, top: '#ffa0b2', glow: 0.1 });
      sym((s) => {
        h.box(s * 0.13, 0.3, 0.78, 0.06, 0.06, 0.02, '#b8203f', { r: 0.02, ao: 0 });
        h.cone(s * 0.28, 0.86, -0.14, 0.11, 0.48, HORN, { rx: -0.6, seg: 6, glow: 0.45 });
        h.cyl(s * 0.28, 0.74, -0.06, 0.12, 0.05, '#fff3b0', { rx: -0.6, seg: 8, glow: 0.6, ao: 0 });
        h.cone(s * 0.53, 0.5, -0.04, 0.1, 0.3, s > 0 ? B : P, { rz: -s * 1.2, seg: 4, glow: 0.3, ao: 0 });
      });
      face(h, { y: 0.47, z: 0.51, sep: 0.24, cheekY: 0.3, iris: '#4fb8ff' });
      smile(h, 0, 0.1, 0.785, 0.12);
      t.box(0, 0, -0.26, 0.38, 0.36, 0.56, B, { r: 0.14, rx: -0.2, top: '#8fd0ff' });
      t.box(0, 0.1, -0.68, 0.26, 0.24, 0.46, P, { r: 0.1, rx: -0.35, top: '#c9a8ff' });
      t.cone(0, 0.2, -0.98, 0.17, 0.3, GOLD, { rx: -Math.PI / 2 - 0.35, seg: 4, glow: 0.6, ao: 0 });
      // big wings with rainbow bands (nested, thicker towards the arm so the bands show on both sides)
      const WING = [[0, 0.08], [0.76, 0.16], [1.26, -0.3], [0.98, -0.34], [0.84, -0.66], [0.52, -0.46], [0.24, -0.42], [0, -0.3]];
      [P, B, G, Y, O, R].forEach((c, k) => w.slab(shrink(WING, 1 - k * 0.13, 0.02, -0.06), 0, 0.04 + k * 0.014, c, { glow: 0.22, ao: 0 }));
      w.beam(0, 0.02, 0.02, 0.76, 0.05, 0.16, 0.12, HORN, { glow: 0.45 });
      w.beam(0.76, 0.05, 0.16, 1.26, 0.04, -0.3, 0.08, HORN, { glow: 0.45 });
      w.beam(0.76, 0.05, 0.16, 0.84, 0.04, -0.66, 0.08, HORN, { glow: 0.45 });
    },
  },
};
