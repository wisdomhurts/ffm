// Shared helpers for drawing pet species (faces, smiles, mirrored parts). models.js and the species
// files in ./species/ use them inside build({body, head, tail, wing}); each part is a Parts collector with
// box / ball / cone / cyl / beam / slab (see models.js).
export const EYE = '#1d1a2f';
export const WHITE = '#ffffff';
export const BLUSH = '#ff9fbf';
export const sym = (fn) => {
  fn(1);
  fn(-1);
};

/** Big glossy Roblox-style eyes (+ optional iris, lashes) and rosy cheeks on a front face at depth z. */
export function face(m, { x = 0, y, z, sep, w = 0.16, h = 0.23, blush = true, iris = null, lashes = false, cheekY = null }) {
  sym((s) => {
    const ex = x + s * sep;
    if (iris) {
      m.box(ex, y, z + 0.015, w * 1.1, h, 0.06, iris, { r: w * 0.45, ao: 0, glow: 0.1 });
      m.box(ex, y - h * 0.05, z + 0.04, w * 0.55, h * 0.72, 0.04, EYE, { r: w * 0.25, ao: 0 });
    } else m.box(ex, y, z + 0.015, w, h, 0.06, EYE, { r: w * 0.45, ao: 0 });
    m.box(ex - w * 0.18, y + h * 0.2, z + 0.055, w * 0.4, h * 0.32, 0.03, WHITE, { r: w * 0.15, ao: 0, glow: 0.45 });
    m.box(ex + w * 0.2, y - h * 0.24, z + 0.052, w * 0.2, h * 0.14, 0.02, WHITE, { r: w * 0.08, ao: 0, glow: 0.45 });
    if (lashes) m.box(ex + s * w * 0.55, y + h * 0.45, z + 0.02, w * 0.5, 0.035, 0.03, EYE, { rz: s * 0.5, r: 0.012, ao: 0 });
    if (blush) m.box(ex + s * w * 1.05, cheekY ?? y - h * 0.62, z - 0.005, w * 0.95, h * 0.34, 0.03, BLUSH, { r: h * 0.15, ao: 0 });
  });
}

/** Little smile made of two tilted strokes. */
export function smile(m, x, y, z, w = 0.14, color = '#6b2a3c') {
  sym((s) => m.box(x + s * w * 0.42, y, z, w * 0.62, 0.035, 0.03, color, { rz: s * 0.45, r: 0.015, ao: 0 }));
}

