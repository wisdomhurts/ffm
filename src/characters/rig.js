// Shared R6 rig constants and small geometry helpers for the avatar, its hair and its cosmetics.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD } from '../config.js';

// R6 proportions in studs (before the whole rig is scaled to WORLD.playerHeight).
export const LEG_H = 2;
export const TORSO_H = 2;
export const ARM_TOP = 0.15; // shoulder pivot sits this far below the top of the arm
export const SHOULDER_Y = TORSO_H - ARM_TOP;
export const HEAD = { w: 2.2, h: 2.12, d: 1.95, r: 0.4, bulge: 0.08 };
export const ADULT_SCALE = WORLD.playerHeight / (LEG_H + TORSO_H + HEAD.h);
export const KID = { scale: 0.82, head: 1.14 }; // big heads on small bodies: kids' faces read as well as adults'
export const TAU = Math.PI * 2;
// Where the face's eye line sits on the head front (characters/faces.js FACE_LAYOUT.head.eyeY = 0.37),
// in head space (origin = head centre).
export const EYE_Y = HEAD.h / 2 - 0.37 * HEAD.h;

export function remapSides(geo, rects) {
  const uv = geo.attributes.uv;
  const per = uv.count / 6;
  for (let i = 0; i < uv.count; i++) {
    const r = rects[Math.floor(i / per)];
    uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  }
  uv.needsUpdate = true;
  return geo;
}

export function box(w, h, d, seg, r, rects) {
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  g.clearGroups();
  return rects ? remapSides(g, rects) : g;
}

// A part for mergeParts(): geometry + transform + uv rect [u0,v0,u1,v1] it is squeezed into.
export function part(geo, pos, rot = [0, 0, 0], uvRect = null, scale = null) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.clearGroups();
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  if (uvRect && g.attributes.uv) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uvRect[0] + uv.getX(i) * (uvRect[2] - uvRect[0]), uvRect[1] + uv.getY(i) * (uvRect[3] - uvRect[1]));
  }
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), scale ? new THREE.Vector3(...scale) : new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

export function mergeParts(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

// Geometry shared by every avatar (and reused across matches) is tagged so views can skip it on dispose.
export function markShared(o) {
  if (o?.isBufferGeometry) o.userData.shared = true;
  else if (o && typeof o === 'object') Object.values(o).forEach(markShared);
  return o;
}

// A shell slightly larger than the head, keeping only the triangles above hairline(x, z).
export function scalpShell(offset, hairline) {
  // fine segments so the cut along the hairline doesn't leave a saw-tooth edge on the rounded corners
  const g = new RoundedBoxGeometry(HEAD.w + offset * 2, HEAD.h + offset * 2, HEAD.d + offset * 2, 8, HEAD.r + offset);
  const src = { position: g.attributes.position, normal: g.attributes.normal, uv: g.attributes.uv };
  const keep = [];
  const p = src.position;
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (cy > hairline(cx, cz)) keep.push(i, i + 1, i + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src)) {
    const n = attr.itemSize;
    const arr = new Float32Array(keep.length * n);
    keep.forEach((vi, k) => {
      for (let c = 0; c < n; c++) arr[k * n + c] = attr.array[vi * n + c];
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  g.dispose();
  return out;
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
