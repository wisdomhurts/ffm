// Hair meshes, built around the head centre (head is HEAD.w x HEAD.h x HEAD.d), textured with the
// hair atlas (outfits.js drawHair: left half strands, right half a fade to the scalp).
// Styles: characters/cosmetics.js HAIR. Parts that poke up (buns, spikes, crests) are "tall": under a
// covering hat the capped variant leaves them out. Geometry is cached and shared by every avatar.
import * as THREE from 'three';
import { HEAD, box, part, mergeParts, scalpShell, markShared } from './rig.js';

const STRANDS = [0, 0, 0.5, 1];
const FUZZ = [0.5, 0.62, 1, 1]; // the top of the fade: hair colour with a little scalp showing (buzz cuts)
export const LONG_TUCK = 0.12; // long hair leans in towards the back by this angle (radians)

// Extra half-width the hair adds at the sides of the head (arms reaching up clear it).
export const HAIR_SIDE = { short: 0.07, 'short-thick': 0.27, long: 0.19, buzz: 0.04, bald: 0, ponytail: 0.12, bob: 0.25, pigtails: 0.45, bun: 0.1, spiky: 0.25, curly: 0.45, mohawk: 0 };

function buildHair(style, longLen, capped) {
  const W = HEAD.w;
  const D = HEAD.d;
  const hw = W / 2;
  const hh = HEAD.h / 2;
  const hd = D / 2;
  const P = [];
  const T = []; // tall parts (left out under covering hats)
  if (style === 'short') {
    // a close-cropped shell that follows the head, cut along a hairline (fade painted on the head)
    P.push(part(scalpShell(0.07, (x, z) => {
      const a = Math.abs(Math.atan2(x, z)) / Math.PI; // 0 = front, 1 = back
      return hh - (a < 0.25 ? 0.36 : a < 0.6 ? 0.36 + (a - 0.25) * 0.9 : 0.68);
    }), [0, 0, 0], [0, 0, 0], STRANDS));
    // a little textured lift at the front of the crop
    [-0.5, 0, 0.5].forEach((x, i) => P.push(part(box(0.62, 0.2, 0.62, 2, 0.09), [x, hh + 0.05 + (i === 1 ? 0.02 : 0), hd - 0.42], [-0.22, 0, x * -0.3], STRANDS)));
  } else if (style === 'long') {
    P.push(part(box(W + 0.12, 0.6, D + 0.16, 3, 0.28), [0, hh - 0.1, -0.04], [0, 0, 0], STRANDS));
    // middle part sweeping down to each side of the forehead
    for (const s of [-1, 1]) P.push(part(box(hw + 0.08, 0.3, 0.3, 2, 0.14), [s * 0.52, hh - 0.21, hd - 0.04], [0, 0, s * -0.26], STRANDS));
    // long strands framing the face, falling over the front of the shoulders
    for (const s of [-1, 1]) P.push(part(box(0.44, 2.55, 0.36, 2, 0.16), [s * (hw - 0.15), hh - 1.22, hd - 0.13], [0, 0, 0], STRANDS));
    // sides over the ears
    for (const s of [-1, 1]) P.push(part(box(0.3, 2.35, D - 0.3, 2, 0.13), [s * (hw + 0.04), hh - 1.12, -0.2], [0, 0, 0], STRANDS));
    // long fall down the back, hinged at the crown and tucked in to lie along the back (the slung
    // noodle rests across it)
    const c = new THREE.Vector3(0, -longLen / 2, -0.25).applyAxisAngle(new THREE.Vector3(1, 0, 0), -LONG_TUCK);
    P.push(part(box(W + 0.16, longLen, 0.5, 2, 0.22), [0, hh + 0.1 + c.y, -hd + 0.19 + c.z], [-LONG_TUCK, 0, 0], STRANDS));
  } else if (style === 'short-thick') {
    P.push(part(box(W + 0.26, 0.88, D + 0.3, 3, 0.4), [0, hh - 0.02, -0.05], [0, 0, 0], STRANDS));
    // chunky bangs that stop just above the eyebrows
    const xs = [-0.88, -0.44, 0, 0.44, 0.88];
    const drop = [0.2, 0.27, 0.24, 0.28, 0.18];
    xs.forEach((x, i) => P.push(part(box(0.54, 0.6, 0.34, 1, 0.14), [x, hh - drop[i], hd + 0.05], [-0.18, 0, (i - 2) * -0.07], STRANDS)));
    for (const s of [-1, 1]) P.push(part(box(0.34, 1.1, D - 0.15, 2, 0.15), [s * (hw + 0.1), hh - 0.57, -0.12], [0, 0, 0], STRANDS));
    P.push(part(box(W + 0.24, 1.35, 0.42, 2, 0.17), [0, hh - 0.62, -hd - 0.1], [0, 0, 0], STRANDS));
  } else if (style === 'buzz') {
    P.push(part(scalpShell(0.035, (x, z) => {
      const a = Math.abs(Math.atan2(x, z)) / Math.PI;
      return hh - (a < 0.25 ? 0.3 : a < 0.6 ? 0.3 + (a - 0.25) * 0.8 : 0.58);
    }), [0, 0, 0], [0, 0, 0], FUZZ));
  } else if (style === 'mohawk') {
    // a strip of short hair front to back, and a spiky crest standing on it
    P.push(part(box(0.7, 0.16, D + 0.06, 2, 0.07), [0, hh + 0.01, -0.03], [0, 0, 0], STRANDS));
    P.push(part(box(0.7, 0.9, 0.16, 2, 0.07), [0, hh - 0.42, -hd - 0.01], [0, 0, 0], STRANDS));
    const fins = [[hh + 0.3, 0.74, 0.62, -0.2], [hh + 0.42, 0.28, 0.86, -0.35], [hh + 0.4, -0.2, 0.9, -0.6], [hh + 0.22, -0.66, 0.82, -0.95], [hh - 0.28, -hd - 0.12, 0.66, -1.35]];
    for (const [y, z, h, rx] of fins) T.push(part(box(0.34, h, 0.52, 2, 0.14), [0, y, z], [rx, 0, 0], STRANDS));
  } else if (style === 'ponytail' || style === 'bun') {
    // pulled back smooth: cap, a neat front, sides tucked over the ears, the back of the head
    P.push(part(box(W + 0.12, 0.58, D + 0.14, 3, 0.27), [0, hh - 0.1, -0.03], [0, 0, 0], STRANDS));
    P.push(part(box(W + 0.02, 0.3, 0.3, 2, 0.13), [0, hh - 0.2, hd - 0.05], [0.12, 0, 0], STRANDS));
    for (const s of [-1, 1]) P.push(part(box(0.26, 1.0, D - 0.45, 2, 0.12), [s * (hw + 0.03), hh - 0.55, -0.22], [0, 0, 0], STRANDS));
    P.push(part(box(W + 0.1, 1.25, 0.3, 2, 0.14), [0, hh - 0.6, -hd - 0.02], [0, 0, 0], STRANDS));
    if (style === 'ponytail') {
      // hair tie and a tapered tail falling down the back of the neck
      P.push(part(new THREE.TorusGeometry(0.2, 0.09, 6, 12), [0, hh - 0.32, -hd - 0.24], [0.25, 0, 0], STRANDS));
      P.push(part(box(0.66, 0.8, 0.56, 2, 0.26), [0, hh - 0.72, -hd - 0.4], [0.18, 0, 0], STRANDS));
      P.push(part(box(0.56, 0.8, 0.48, 2, 0.22), [0, hh - 1.4, -hd - 0.44], [0.02, 0, 0], STRANDS));
      P.push(part(box(0.4, 0.62, 0.36, 2, 0.16), [0, hh - 1.98, -hd - 0.34], [-0.2, 0, 0], STRANDS));
    } else {
      // a big round bun on top (tall: tucked away under covering hats)
      T.push(part(new THREE.IcosahedronGeometry(0.5, 1), [0, hh + 0.52, -0.22], [0, 0, 0], STRANDS, [1.02, 0.86, 1.02]));
      T.push(part(new THREE.TorusGeometry(0.34, 0.08, 6, 14), [0, hh + 0.2, -0.2], [Math.PI / 2, 0, 0], STRANDS));
    }
  } else if (style === 'bob') {
    P.push(part(box(W + 0.2, 0.62, D + 0.22, 3, 0.3), [0, hh - 0.08, -0.03], [0, 0, 0], STRANDS));
    for (const s of [-1, 1]) P.push(part(box(0.34, 1.72, D - 0.12, 2, 0.15), [s * (hw + 0.08), hh - 0.92, -0.08], [0, 0, s * -0.03], STRANDS));
    P.push(part(box(W + 0.26, 1.52, 0.42, 2, 0.18), [0, hh - 0.82, -hd - 0.1], [0, 0, 0], STRANDS));
    // a straight fringe just above the brows
    P.push(part(box(W - 0.14, 0.42, 0.3, 2, 0.13), [0, hh - 0.27, hd + 0.02], [-0.08, 0, 0], STRANDS));
    // turned-under ends
    for (const s of [-1, 1]) P.push(part(box(0.44, 0.3, D - 0.2, 2, 0.14), [s * (hw + 0.1), hh - 1.72, -0.08], [0, 0, 0], STRANDS));
  } else if (style === 'pigtails') {
    P.push(part(box(W + 0.12, 0.58, D + 0.14, 3, 0.27), [0, hh - 0.1, -0.03], [0, 0, 0], STRANDS));
    for (const s of [-1, 1]) P.push(part(box(hw + 0.08, 0.3, 0.3, 2, 0.14), [s * 0.52, hh - 0.21, hd - 0.04], [0, 0, s * -0.26], STRANDS));
    for (const s of [-1, 1]) P.push(part(box(0.26, 1.05, D - 0.4, 2, 0.12), [s * (hw + 0.03), hh - 0.58, -0.2], [0, 0, 0], STRANDS));
    P.push(part(box(W + 0.1, 1.3, 0.32, 2, 0.14), [0, hh - 0.62, -hd - 0.03], [0, 0, 0], STRANDS));
    for (const s of [-1, 1]) {
      // a bunch tied high at each side, hanging down past the chin
      P.push(part(new THREE.IcosahedronGeometry(0.34, 1), [s * (hw + 0.24), hh - 0.42, -0.3], [0, 0, 0], STRANDS));
      P.push(part(box(0.56, 1.25, 0.52, 2, 0.24), [s * (hw + 0.4), hh - 1.2, -0.34], [0, 0, s * 0.2], STRANDS));
      P.push(part(box(0.4, 0.55, 0.38, 2, 0.17), [s * (hw + 0.56), hh - 1.95, -0.34], [0, 0, s * 0.1], STRANDS));
    }
  } else if (style === 'spiky') {
    P.push(part(box(W + 0.2, 0.7, D + 0.24, 3, 0.34), [0, hh - 0.02, -0.04], [0, 0, 0], STRANDS));
    for (const s of [-1, 1]) P.push(part(box(0.3, 0.95, D - 0.2, 2, 0.13), [s * (hw + 0.08), hh - 0.5, -0.1], [0, 0, 0], STRANDS));
    P.push(part(box(W + 0.2, 1.1, 0.36, 2, 0.15), [0, hh - 0.55, -hd - 0.08], [0, 0, 0], STRANDS));
    // pointy fringe
    [-0.72, -0.24, 0.24, 0.72].forEach((x, i) => P.push(part(new THREE.ConeGeometry(0.26, 0.6, 5), [x, hh - 0.3, hd + 0.06], [Math.PI - 0.2, 0, (i - 1.5) * 0.25], STRANDS)));
    // spikes all over the top (tall)
    const spikes = [[0, 0.5], [-0.55, 0.25], [0.55, 0.25], [-0.3, -0.25], [0.3, -0.25], [0, -0.7], [-0.8, -0.45], [0.8, -0.45], [-0.85, 0.3], [0.85, 0.3]];
    for (const [x, z] of spikes) T.push(part(new THREE.ConeGeometry(0.3, 1.0, 5), [x, hh + 0.42, z], [-0.35 - z * 0.6, 0, -x * 0.7], STRANDS));
  } else if (style === 'curly') {
    // big curls: a cloud of chunky puffs over the top, sides and back (never over the face)
    P.push(part(box(W + 0.3, 0.9, D + 0.3, 3, 0.4), [0, hh - 0.05, -0.05], [0, 0, 0], STRANDS));
    const ico = new THREE.IcosahedronGeometry(1, 1);
    const puffs = [];
    // the lowest ring stays under hats (a puffy ring round the brim); the crown of curls is "tall"
    for (const [el, n, rr] of [[0.15, 9, 0.6], [0.65, 8, 0.62], [1.2, 5, 0.6], [1.57, 1, 0.62]]) {
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + el;
        const x = Math.sin(az) * Math.cos(el) * (hw + 0.28);
        const z = Math.cos(az) * Math.cos(el) * (hd + 0.25) - 0.12;
        const y = hh - 0.1 + Math.sin(el) * 0.62;
        if (z > 0.35 && y < hh + 0.05) continue; // keep the face clear
        puffs.push([x, y, z, rr, el > 0.5]);
      }
    }
    // a row of small curls along the hairline
    for (const x of [-0.72, -0.24, 0.24, 0.72]) puffs.push([x, hh - 0.05, hd - 0.02, 0.32, false]);
    for (const [x, y, z, r, tall] of puffs) (tall ? T : P).push(part(ico, [x, y, z], [x, y * 2, z], STRANDS, [r, r * 0.92, r]));
    ico.dispose();
  }
  const all = capped ? P : P.concat(T);
  if (capped) T.forEach((g) => g.dispose());
  return all.length ? mergeParts(all) : null;
}

const cache = {};
/** Shared hair geometry for a style (long hair length in studs; `capped` = under a covering hat). */
export function hairGeometry(style, len, capped = false) {
  const key = style + ':' + len + (capped ? ':c' : '');
  if (!(key in cache)) cache[key] = markShared(buildHair(style, len, capped));
  return cache[key];
}

/** Does this style have parts a covering hat hides? */
export const hasTallHair = (style) => style === 'bun' || style === 'spiky' || style === 'mohawk' || style === 'curly';
