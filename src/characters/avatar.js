// R6-style family avatar: blocky plastic body, oversized rounded head with the family member's
// photo face, hair accessory, Cabo-sunset outfit, pool noodle, and procedural animation.
// Contract: createAvatar(charDef, faceImage, skinHex) -> Avatar
//   avatar.object3d      THREE.Group, origin at the feet, facing +Z
//   avatar.headTop       THREE.Object3D positioned just above the head (name tags, carried items)
//   avatar.update(dt, s) s = {time, speed, onGround, vy, carrying:null|'seed'|'plant', stunned, swing (0..1 or -1),
//                              celebrating, invisible (0..1 alpha), isLocal, coil, interacting (verb|null)}
//   avatar.setCarry(object3d|null)  attach an item above the head
//   avatar.setFace(image, skin)
//   avatar.dispose()
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD } from '../config.js';
import { composeFaceCanvas, FACE_LAYOUT, boostSkin } from './faces.js';
import { drawOutfit, drawHeadAtlas, headRects, atlasRects, TORSO_ATLAS, LIMB_ATLAS, shoeColors, loadFacePrint, facePrintReady, makeCanvas } from './outfits.js';

// R6 proportions in studs (before the whole rig is scaled to WORLD.playerHeight).
const LEG_H = 2;
const TORSO_H = 2;
const ARM_TOP = 0.15; // shoulder pivot sits this far below the top of the arm
const SHOULDER_Y = TORSO_H - ARM_TOP;
const HEAD = { w: 2.2, h: 2.12, d: 1.95, r: 0.52, bulge: 0.08 };
const ADULT_SCALE = WORLD.playerHeight / (LEG_H + TORSO_H + HEAD.h);
const KID = { scale: 0.82, head: 1.08 };
const NOODLE_SEG = 1.5; // the noodle is 3 segments = 4.5 studs
const GLOW = 0.2; // soft self-illumination so characters pop against the world
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ shared geometry

function remapSides(geo, rects) {
  const uv = geo.attributes.uv;
  const per = uv.count / 6;
  for (let i = 0; i < uv.count; i++) {
    const r = rects[Math.floor(i / per)];
    uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  }
  uv.needsUpdate = true;
  return geo;
}

function box(w, h, d, seg, r, rects) {
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  g.clearGroups();
  return rects ? remapSides(g, rects) : g;
}

// A part for mergeParts(): geometry + transform + uv rect [u0,v0,u1,v1] it is squeezed into.
function part(geo, pos, rot = [0, 0, 0], uvRect = null) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.clearGroups();
  if (uvRect) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uvRect[0] + uv.getX(i) * (uvRect[2] - uvRect[0]), uvRect[1] + uv.getY(i) * (uvRect[3] - uvRect[1]));
  }
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function mergeParts(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

const STRANDS = [0, 0, 0.5, 1];

// A shell slightly larger than the head, keeping only the triangles above hairline(x, z).
function scalpShell(offset, hairline) {
  const g = new RoundedBoxGeometry(HEAD.w + offset * 2, HEAD.h + offset * 2, HEAD.d + offset * 2, 4, HEAD.r + offset);
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

// Hair accessories, built around the head centre (head is HEAD.w x HEAD.h x HEAD.d).
function buildHair(style, longLen) {
  const W = HEAD.w;
  const D = HEAD.d;
  const hw = W / 2;
  const hh = HEAD.h / 2;
  const hd = D / 2;
  const P = [];
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
    // long fall down the back, slightly tucked towards the shoulders
    P.push(part(box(W + 0.16, longLen, 0.5, 2, 0.22), [0, hh + 0.1 - longLen / 2, -hd - 0.06], [-0.06, 0, 0], STRANDS));
  } else if (style === 'short-thick') {
    P.push(part(box(W + 0.26, 0.88, D + 0.3, 3, 0.4), [0, hh - 0.02, -0.05], [0, 0, 0], STRANDS));
    // chunky bangs that stop above the eyebrows
    const xs = [-0.88, -0.44, 0, 0.44, 0.88];
    const drop = [0.3, 0.37, 0.34, 0.38, 0.28];
    xs.forEach((x, i) => P.push(part(box(0.54, 0.64, 0.34, 1, 0.14), [x, hh - drop[i], hd + 0.05], [-0.18, 0, (i - 2) * -0.07], STRANDS)));
    for (const s of [-1, 1]) P.push(part(box(0.34, 1.1, D - 0.15, 2, 0.15), [s * (hw + 0.1), hh - 0.57, -0.12], [0, 0, 0], STRANDS));
    P.push(part(box(W + 0.24, 1.35, 0.42, 2, 0.17), [0, hh - 0.62, -hd - 0.1], [0, 0, 0], STRANDS));
  }
  return P.length ? mergeParts(P) : null;
}

// Geometry shared by every avatar (and reused across matches) is tagged so views can skip it on dispose.
function markShared(o) {
  if (o?.isBufferGeometry) o.userData.shared = true;
  else if (o && typeof o === 'object') Object.values(o).forEach(markShared);
  return o;
}

let GEO = null;
function sharedGeometry() {
  if (GEO) return GEO;
  const head = box(HEAD.w, HEAD.h, HEAD.d, 3, HEAD.r, headRects());
  // gently domed face so the photo reads at 3/4 angles
  const pos = head.attributes.position;
  const nrm = head.attributes.normal;
  const hw = HEAD.w / 2;
  const hh = HEAD.h / 2;
  const hd = HEAD.d / 2;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z <= 0) continue;
    const x = pos.getX(i) / hw;
    const y = pos.getY(i) / hh;
    const wz = z / hd;
    const fx = Math.max(0, 1 - x * x);
    const fy = Math.max(0, 1 - y * y);
    pos.setZ(i, z + HEAD.bulge * fx * fy * wz);
    const nz = nrm.getZ(i);
    const n = new THREE.Vector3(nrm.getX(i) + ((2 * HEAD.bulge * x) / hw) * fy * nz * wz, nrm.getY(i) + ((2 * HEAD.bulge * y) / hh) * fx * nz * wz, nz).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  const limbRects = atlasRects(LIMB_ATLAS);
  // noodle: three foam tube segments chained so it can flex (uv: side = left half, caps = right half)
  const segGeo = (withCap) => {
    const c = new THREE.CylinderGeometry(0.3, 0.3, NOODLE_SEG + 0.03, 10, 1, true).translate(0, NOODLE_SEG / 2, 0);
    const uv = c.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.5, uv.getX(i)); // ridges run along the tube
    const parts = [part(c, [0, 0, 0])];
    if (withCap === 'tip') parts.push(part(new THREE.CircleGeometry(0.3, 10), [0, NOODLE_SEG, 0], [-Math.PI / 2, 0, 0], [0.5, 0, 1, 1]));
    if (withCap === 'base') parts.push(part(new THREE.CircleGeometry(0.3, 10), [0, 0, 0], [Math.PI / 2, 0, 0], [0.5, 0, 1, 1]));
    c.dispose();
    return mergeParts(parts);
  };
  const noodle = { base: segGeo('base'), mid: segGeo(null), tip: segGeo('tip') };
  // cartoon star for the dizzy halo
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const r = i % 2 ? 0.15 : 0.36;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false });
  star.translate(0, 0, -0.06);
  // four stars in a tilted ring, one mesh
  const halo = mergeParts([0, 1, 2, 3].map((i) => {
    const a = (i / 4) * TAU;
    return part(star, [Math.cos(a) * 1.25, Math.sin(i * 2.1) * 0.12, Math.sin(a) * 1.25], [0.3, a + 0.4, 0.25 * i]);
  }));
  star.dispose();
  // skirt: a flared bell (lathe), squashed front-to-back
  const prof = [[1.04, 0.02], [1.08, -0.2], [1.22, -0.6], [1.42, -1.05], [1.5, -1.25], [1.46, -1.29]].map(([r, y]) => new THREE.Vector2(r, y));
  const outer = new THREE.LatheGeometry(prof, 16);
  const inner = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x - 0.04, p.y)).reverse(), 16);
  const skirt = mergeParts([part(outer, [0, 0, 0]), part(inner, [0, 0, 0])]);
  outer.dispose();
  inner.dispose();
  skirt.scale(1, 1, 0.66);
  // speed-coil streak: a horizontal + a vertical ribbon crossing along -Z (length 1, scaled at runtime)
  const ribH = new THREE.PlaneGeometry(0.8, 1).translate(0, -0.5, 0).rotateX(Math.PI / 2);
  const ribV = new THREE.PlaneGeometry(1, 0.8).translate(-0.5, 0, 0).rotateY(-Math.PI / 2);
  const trail = mergeParts([part(ribH, [0, 0, 0]), part(ribV, [0, 0, 0])]);
  ribH.dispose();
  ribV.dispose();
  const tp = trail.attributes.position;
  const tuv = trail.attributes.uv;
  for (let i = 0; i < tp.count; i++) tuv.setXY(i, 0.5 + (tp.getX(i) + tp.getY(i)) / 0.8, 1 + tp.getZ(i));
  GEO = {
    head,
    trail,
    torso: box(2, TORSO_H, 1, 1, 0.1, atlasRects(TORSO_ATLAS)),
    arm: box(1, 2, 1, 1, 0.12, limbRects),
    leg: box(0.98, LEG_H, 1, 1, 0.1, limbRects),
    noodle,
    halo,
    ring: new THREE.TorusGeometry(0.72, 0.075, 6, 20).rotateX(Math.PI / 2),
    skirt,
    hair: {},
  };
  markShared(GEO);
  return GEO;
}

// Chunky sneaker (upper + white sole) or a flat sandal sole, vertex-coloured, cached per colours.
function shoeGeometry(look) {
  const G = sharedGeometry();
  const sandal = look.shirt === 'dress';
  const [upper, sole] = shoeColors(look);
  const key = 'shoe:' + upper + sole + sandal;
  if (G[key]) return G[key];
  const colored = (geo, hex) => {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.deleteAttribute('uv');
    return geo;
  };
  const parts = sandal
    ? [colored(part(box(1.04, 0.14, 1.26, 1, 0.06), [0, 0.07, 0]), sole)]
    : [colored(part(box(1.08, 0.16, 1.36, 1, 0.07), [0, 0.08, 0]), sole), colored(part(box(1.02, 0.34, 1.26, 1, 0.14), [0, 0.3, -0.02]), upper)];
  G[key] = markShared(mergeParts(parts));
  return G[key];
}

function hairGeometry(style, len) {
  const G = sharedGeometry();
  const key = style + ':' + len;
  if (!(key in G.hair)) G.hair[key] = markShared(buildHair(style, len));
  return G.hair[key];
}

// ------------------------------------------------------------------ helpers

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Noodle whack keyframes (u = 0..1 over the 0.35 s swing): wind up overhead, snap forward, follow through.
// Noodle "equipped" stance (Roblox tool hold): right arm raised forward, noodle angled up.
const TOOL = { armRx: -0.9, armRz: -0.08, wrist: 1.8 };
const SW_T = [0, 0.3, 0.5, 0.68, 1];
const SW_EASE = [(t) => 1 - (1 - t) * (1 - t), (t) => t * t * t, (t) => 1 - (1 - t) * (1 - t), (t) => t * t * (3 - 2 * t)];
const SW = {
  armRx: [TOOL.armRx, -3.3, -1.55, -0.95, TOOL.armRx],
  armRz: [TOOL.armRz, -0.25, 0.05, 0.1, TOOL.armRz],
  wrist: [TOOL.wrist, 1.5, 3.1, 2.85, TOOL.wrist],
  torsoY: [0, 0.38, -0.36, -0.26, 0],
  torsoX: [0, -0.14, 0.2, 0.15, 0],
  armLx: [0, -0.35, 0.45, 0.35, 0],
  armLz: [0.1, 0.5, 0.35, 0.25, 0.1],
  rigY: [0, 0.05, -0.12, -0.08, 0],
};
function swingKey(arr, u) {
  let i = 0;
  while (i < SW_T.length - 2 && u > SW_T[i + 1]) i++;
  const t = clamp01((u - SW_T[i]) / (SW_T[i + 1] - SW_T[i]));
  return lerp(arr[i], arr[i + 1], SW_EASE[i](t));
}

function streakTexture() {
  const c = makeCanvas(32, 64);
  const g = c.getContext('2d');
  const v = g.createLinearGradient(0, 0, 0, 64);
  v.addColorStop(0, 'rgba(255,255,255,1)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 32, 64);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 32, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, 32, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Composed head-front faces, cached per photo + skin (avatars are rebuilt every match).
const faceCache = new WeakMap();
const noPhoto = {};
function cachedFace(img, skin) {
  const k = img || noPhoto;
  let m = faceCache.get(k);
  if (!m) faceCache.set(k, (m = new Map()));
  if (!m.has(skin)) {
    if (m.size > 4) m.clear();
    m.set(skin, composeFaceCanvas(img, skin, 512, { layout: FACE_LAYOUT.head }));
  }
  return m.get(skin);
}

function canvasTexture(c, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// ------------------------------------------------------------------ avatar

export function createAvatar(char, faceImage, skinHex) {
  const G = sharedGeometry();
  const look = char.look;
  const kid = look.build === 'kid';
  const S = ADULT_SCALE * (kid ? KID.scale : 1);
  const hs = kid ? KID.head : 1;
  let skin = boostSkin(skinHex || look.skin);
  let faceImg = faceImage || null;

  // ---- textures (owned by this avatar)
  let outfit = drawOutfit(char, skin);
  const headCanvas = makeCanvas(1024, 512);
  const faceCanvas = () => cachedFace(faceImg, skin);
  drawHeadAtlas(faceCanvas(), look, skin, headCanvas);
  const tex = {
    head: canvasTexture(headCanvas, 8),
    torso: canvasTexture(outfit.torso),
    arm: canvasTexture(outfit.arm),
    leg: canvasTexture(outfit.leg),
    hair: canvasTexture(outfit.hair),
    noodle: canvasTexture(outfit.noodle, 1),
    skirt: outfit.skirt ? canvasTexture(outfit.skirt) : null,
  };

  // ---- materials (owned by this avatar so opacity can change per player)
  const mats = [];
  const std = (o) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, ...o });
    mats.push(m);
    return m;
  };
  const texMat = (t, o = {}) => std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: GLOW, ...o });
  const M = {
    head: texMat(tex.head, { roughness: 0.66 }),
    torso: texMat(tex.torso, { roughness: look.shirt === 'dress' ? 0.42 : 0.6 }),
    arm: texMat(tex.arm, { roughness: 0.58 }),
    leg: texMat(tex.leg, { roughness: 0.62 }),
    // vertex-coloured: shares its shader with the monsters, so that program compiles with the family
    shoe: std({ vertexColors: true, roughness: 0.4, emissive: 0x000000 }),
    hair: texMat(tex.hair, { roughness: 0.42, emissiveIntensity: GLOW * 0.6 }),
    noodle: texMat(tex.noodle, { roughness: 0.75, emissiveIntensity: GLOW * 1.4 }),
    skirt: tex.skirt ? texMat(tex.skirt, { roughness: 0.42 }) : null,
  };
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, toneMapped: false });
  const trailMat = new THREE.MeshBasicMaterial({ color: 0x5ff2ff, map: streakTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x6ff7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  mats.push(starMat);

  const shadowed = [];
  // While see-through (cloak), each body part first writes depth only so the ghost shows just its
  // outer surface instead of every overlapping box.
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, side: THREE.DoubleSide });
  const ghosts = [];
  const mesh = (geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    if (cast) shadowed.push(m);
    const d = new THREE.Mesh(geo, depthMat);
    d.visible = false;
    d.renderOrder = 20;
    m.add(d);
    ghosts.push(m);
    return m;
  };

  // ---- rig
  const root = new THREE.Group();
  root.name = 'avatar-' + char.id;
  const rig = new THREE.Group();
  rig.scale.setScalar(S);
  root.add(rig);
  const body = new THREE.Group(); // bob / dizzy wobble / dance
  rig.add(body);
  const hips = new THREE.Group();
  hips.position.y = LEG_H;
  body.add(hips);
  const torso = new THREE.Group(); // lean + twist pivot at the hips
  hips.add(torso);
  const torsoMesh = mesh(G.torso, M.torso);
  torsoMesh.position.y = TORSO_H / 2;
  torso.add(torsoMesh);
  const neck = new THREE.Group();
  neck.position.y = TORSO_H;
  torso.add(neck);
  const head = new THREE.Group();
  head.scale.setScalar(hs);
  neck.add(head);
  const headMesh = mesh(G.head, M.head);
  headMesh.position.y = HEAD.h / 2;
  head.add(headMesh);
  const hairGeo = hairGeometry(look.hair, char.id === 'maddie' ? 3.0 : 3.4);
  if (hairGeo) {
    const hair = mesh(hairGeo, M.hair, false); // no self-shadow across the face
    hair.position.y = HEAD.h / 2;
    head.add(hair);
  }

  const makeArm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 1.5, SHOULDER_Y, 0);
    torso.add(sh);
    const a = mesh(G.arm, M.arm);
    a.position.y = ARM_TOP - 1;
    sh.add(a);
    return sh;
  };
  const armR = makeArm(-1); // character's right is -X
  const armL = makeArm(1);

  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.5, 0, 0);
    hips.add(hip);
    const l = mesh(G.leg, M.leg);
    l.position.y = -LEG_H / 2;
    hip.add(l);
    const sandal = look.shirt === 'dress';
    const s = mesh(shoeGeometry(look), M.shoe);
    s.position.set(0, -LEG_H, sandal ? 0.12 : 0.15);
    hip.add(s);
    const ring = new THREE.Mesh(G.ring, ringMat);
    ring.position.y = -LEG_H + 0.62;
    ring.visible = false;
    hip.add(ring);
    return { hip, ring };
  };
  const legR = makeLeg(-1);
  const legL = makeLeg(1);
  const trails = [-1, 1].map((side) => {
    const m = new THREE.Mesh(G.trail, trailMat);
    m.position.set(side * 0.5, 0.35, -0.35);
    m.visible = false;
    body.add(m);
    return m;
  });

  let skirt = null;
  if (M.skirt) {
    skirt = mesh(G.skirt, M.skirt);
    skirt.position.y = 0.02;
    torso.add(skirt);
  }

  // pool noodle in the right fist
  const hand = new THREE.Group();
  hand.position.set(0, ARM_TOP - 1.72, 0.02);
  armR.add(hand);
  const wrist = new THREE.Group();
  hand.add(wrist);
  // three chained segments: a gentle permanent curve plus a springy flex when swung
  const noodle = new THREE.Group();
  noodle.position.y = -0.4;
  wrist.add(noodle);
  const NOODLE_CURVE = [0.07, -0.07, -0.07];
  const NOODLE_FLEX = [0.1, 0.15, 0.2];
  const joints = [];
  let parent = noodle;
  [G.noodle.base, G.noodle.mid, G.noodle.tip].forEach((geo, i) => {
    const j = new THREE.Group();
    if (i) j.position.y = NOODLE_SEG;
    j.rotation.x = NOODLE_CURVE[i];
    parent.add(j);
    const m = new THREE.Mesh(geo, M.noodle);
    j.add(m);
    joints.push(j);
    parent = j;
  });

  // things that live in unscaled avatar space
  const headTop = new THREE.Object3D();
  headTop.name = 'headTop';
  root.add(headTop);
  const stars = new THREE.Mesh(G.halo, starMat);
  stars.visible = false;
  root.add(stars);

  const HEAD_TOP_Y = TORSO_H + HEAD.h * hs; // above the hips
  // raise the shoulders when carrying so the hands reach the item above the head
  const CARRY_LIFT = Math.max(0, HEAD_TOP_Y - (SHOULDER_Y + 2 - ARM_TOP) + 0.05);

  // ---- animation state
  const W = { move: 0, air: 0, carry: 0, stun: 0, celeb: 0, steal: 0, reach: 0, coil: 0, noodle: 1 };
  const P = { rigY: 0, rigRX: 0, rigRZ: 0, rigYaw: 0, torsoX: 0, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, headZ: 0, armRx: 0, armRz: 0, armLx: 0, armLz: 0, legRx: 0, legLx: 0, wrist: TOOL.wrist, lift: 0 };
  let clock = Math.random() * 10;
  let phase = Math.random() * TAU;
  let prevArm = TOOL.armRx;
  let bend = 0;
  let bendV = 0;
  let alpha = 1;
  let transparent = false;
  let castOn = true;
  let carry = null;

  function setOpacity(a) {
    if (a === alpha) return;
    alpha = a;
    const tr = a < 0.999;
    for (const m of mats) {
      m.opacity = a;
      if (tr !== transparent) {
        m.transparent = tr;
        m.needsUpdate = true;
      }
    }
    if (tr !== transparent) {
      for (const m of ghosts) {
        m.children[0].visible = tr;
        m.renderOrder = tr ? 21 : 0;
      }
    }
    transparent = tr;
    const cast = !tr;
    if (cast !== castOn) {
      castOn = cast;
      for (const m of shadowed) m.castShadow = cast;
    }
  }

  function redrawOutfit() {
    outfit = drawOutfit(char, skin);
    for (const k of ['torso', 'arm', 'leg', 'hair']) {
      tex[k].image = outfit[k];
      tex[k].needsUpdate = true;
    }
  }

  let disposed = false;
  if (look.shirt === 'faceprint') {
    if (facePrintReady()) redrawOutfit();
    else loadFacePrint().then(() => !disposed && redrawOutfit());
  }

  function update(dt, s) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    clock += dt;
    const t = clock;
    const speed = s.speed || 0;
    const ground = s.onGround !== false;
    W.move = damp(W.move, clamp01(speed / 5) * (ground ? 1 : 0), 9, dt);
    W.air = damp(W.air, ground ? 0 : 1, 14, dt);
    W.carry = damp(W.carry, s.carrying ? 1 : 0, 10, dt);
    W.stun = damp(W.stun, s.stunned ? 1 : 0, 12, dt);
    W.celeb = damp(W.celeb, s.celebrating ? 1 : 0, 6, dt);
    W.steal = damp(W.steal, s.interacting === 'Steal' ? 1 : 0, 9, dt);
    W.reach = damp(W.reach, s.interacting && s.interacting !== 'Steal' ? 1 : 0, 10, dt);
    W.coil = damp(W.coil, s.coil ? 1 : 0, 6, dt);
    const wantNoodle = !s.carrying && !s.interacting && !s.celebrating ? 1 : 0;
    W.noodle = damp(W.noodle, wantNoodle, wantNoodle ? 16 : 22, dt);

    const sp = Math.min(speed, 70);
    if (speed > 0.2) phase += dt * Math.min(5, 1.15 + sp * 0.085) * TAU;
    phase %= TAU * 1000;

    // --- idle
    const br = Math.sin(t * 2.2);
    P.rigY = br * 0.025;
    P.rigRX = 0;
    P.rigRZ = 0;
    P.rigYaw = 0;
    P.torsoX = 0;
    P.torsoY = 0;
    P.torsoZ = 0;
    const still = 1 - W.move;
    P.headX = Math.sin(t * 0.9) * 0.03;
    P.headY = Math.sin(t * 0.43) * 0.16 * still;
    P.headZ = Math.sin(t * 0.61) * 0.035 * still;
    P.armRx = Math.sin(t * 1.1) * 0.035;
    P.armLx = -P.armRx;
    P.armRz = -0.07 - br * 0.025;
    P.armLz = 0.07 + br * 0.025;
    P.legRx = 0;
    P.legLx = 0;
    P.wrist = TOOL.wrist;
    P.lift = 0;

    // --- walk / run
    const wm = W.move * (1 - W.air);
    if (wm > 0.001) {
      const amp = Math.min(1.1, 0.5 + sp * 0.02);
      const sw = Math.sin(phase);
      const cw = Math.cos(phase);
      P.legRx += sw * amp * wm;
      P.legLx -= sw * amp * wm;
      P.armRx -= sw * amp * 0.85 * wm;
      P.armLx += sw * amp * 0.85 * wm;
      P.armRz -= 0.05 * wm;
      P.armLz += 0.05 * wm;
      P.rigY += Math.abs(cw) * 0.13 * amp * wm;
      const lean = Math.min(0.3, sp * 0.0065) * wm * (1 - 0.7 * W.carry);
      P.torsoX += lean;
      P.headX -= lean * 0.6;
      P.torsoY += sw * 0.1 * wm;
      P.headY -= sw * 0.07 * wm;
      P.rigRZ += sw * 0.025 * wm;
    }

    // --- jump / fall
    const wa = W.air;
    if (wa > 0.001) {
      const up = (clamp01((s.vy || 0) / 25 * 0.5 + 0.5));
      const dn = 1 - up;
      P.legRx = lerp(P.legRx, -0.55 * up + 0.3 * dn, wa);
      P.legLx = lerp(P.legLx, 0.35 * up - 0.22 * dn, wa);
      P.armRx = lerp(P.armRx, -0.45 - 0.7 * dn, wa);
      P.armLx = lerp(P.armLx, -0.45 - 0.7 * dn, wa);
      P.armRz = lerp(P.armRz, -0.45 - 0.55 * dn, wa);
      P.armLz = lerp(P.armLz, 0.45 + 0.55 * dn, wa);
      P.torsoX = lerp(P.torsoX, 0.1 * up - 0.08 * dn, wa);
      P.headX = lerp(P.headX, -0.1 * up + 0.12 * dn, wa);
    }

    // --- noodle at the ready
    const wn = W.noodle * (1 - W.stun) * (1 - W.celeb);
    if (wn > 0.001) {
      P.armRx = lerp(P.armRx, TOOL.armRx + Math.sin(phase) * 0.12 * wm - 0.3 * wa, wn);
      P.armRz = lerp(P.armRz, TOOL.armRz - 0.2 * wa, wn);
    }

    // --- reach (Grab / Sell / Unlock...)
    const wr = W.reach;
    if (wr > 0.001) {
      P.armRx = lerp(P.armRx, -1.3 + Math.sin(t * 11) * 0.09, wr);
      P.armRz = lerp(P.armRz, 0.14, wr);
      P.armLx = lerp(P.armLx, -0.35, wr);
      P.torsoX += 0.22 * wr;
      P.headX += 0.12 * wr;
    }
    // --- sneaky steal: crouched lunge, both hands reaching, looking around
    const ws = W.steal;
    if (ws > 0.001) {
      const wig = Math.sin(t * 15) * 0.12;
      P.rigY -= 0.3 * ws;
      P.legRx = lerp(P.legRx, -0.55, ws);
      P.legLx = lerp(P.legLx, 0.5, ws);
      P.torsoX = lerp(P.torsoX, 0.48, ws);
      P.armRx = lerp(P.armRx, -1.4 + wig, ws);
      P.armLx = lerp(P.armLx, -1.4 - wig, ws);
      P.armRz = lerp(P.armRz, 0.26, ws);
      P.armLz = lerp(P.armLz, -0.26, ws);
      P.headX = lerp(P.headX, -0.32, ws);
      P.headY = lerp(P.headY, Math.sin(t * 2.4) * 0.55, ws);
    }

    // --- carry: both arms up holding the item over the head
    const wc = W.carry;
    if (wc > 0.001) {
      const cb = Math.sin(phase * 2) * 0.05 * wm;
      P.armRx = lerp(P.armRx, -3.06 + cb, wc);
      P.armLx = lerp(P.armLx, -3.06 - cb, wc);
      P.armRz = lerp(P.armRz, -0.1, wc);
      P.armLz = lerp(P.armLz, 0.1, wc);
      P.lift = CARRY_LIFT * wc;
      P.torsoX -= 0.04 * wc;
    }

    // --- celebrate: hop with arms up and waving
    const we = W.celeb;
    if (we > 0.001) {
      const hop = Math.abs(Math.sin(t * 6.5));
      const wave = Math.sin(t * 13);
      P.rigY = lerp(P.rigY, hop * 0.85, we);
      P.armRx = lerp(P.armRx, -2.75 + wave * 0.22, we);
      P.armLx = lerp(P.armLx, -2.75 - wave * 0.22, we);
      P.armRz = lerp(P.armRz, -0.55, we);
      P.armLz = lerp(P.armLz, 0.55, we);
      P.legRx = lerp(P.legRx, -0.3 * hop, we);
      P.legLx = lerp(P.legLx, 0.18 * hop, we);
      P.headZ = lerp(P.headZ, Math.sin(t * 6.5) * 0.16, we);
      P.headX = lerp(P.headX, -0.12, we);
      P.torsoZ += Math.sin(t * 6.5) * 0.07 * we;
      P.rigYaw += Math.sin(t * 1.7) * 0.4 * we;
    }

    // --- stunned: dizzy wobble
    const wt = W.stun;
    if (wt > 0.001) {
      P.rigRX += Math.cos(t * 7) * 0.13 * wt;
      P.rigRZ += Math.sin(t * 7) * 0.13 * wt;
      P.rigYaw += Math.sin(t * 3.3) * 0.75 * wt;
      P.armRx = lerp(P.armRx, Math.sin(t * 6) * 0.4, wt);
      P.armLx = lerp(P.armLx, -Math.sin(t * 6) * 0.4, wt);
      P.armRz = lerp(P.armRz, -1.05 + Math.sin(t * 9) * 0.28, wt);
      P.armLz = lerp(P.armLz, 1.05 + Math.sin(t * 9 + 1) * 0.28, wt);
      P.legRx = lerp(P.legRx, Math.sin(t * 7) * 0.18, wt);
      P.legLx = lerp(P.legLx, -Math.sin(t * 7) * 0.18, wt);
      P.headZ += Math.sin(t * 5) * 0.28 * wt;
      P.headX += Math.cos(t * 5) * 0.14 * wt;
    }

    // --- noodle whack overlay
    const u = s.swing;
    if (u != null && u >= 0) {
      const w = smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u));
      P.armRx = lerp(P.armRx, swingKey(SW.armRx, u), w);
      P.armRz = lerp(P.armRz, swingKey(SW.armRz, u), w);
      P.wrist = lerp(P.wrist, swingKey(SW.wrist, u), w);
      P.torsoY = lerp(P.torsoY, swingKey(SW.torsoY, u), w);
      P.torsoX = lerp(P.torsoX, swingKey(SW.torsoX, u), w);
      P.armLx = lerp(P.armLx, swingKey(SW.armLx, u), w);
      P.armLz = lerp(P.armLz, swingKey(SW.armLz, u), w);
      P.rigY += swingKey(SW.rigY, u) * w;
    }

    // --- apply
    body.position.y = P.rigY;
    body.rotation.set(P.rigRX, P.rigYaw, P.rigRZ);
    torso.rotation.set(P.torsoX, P.torsoY, P.torsoZ);
    head.rotation.set(P.headX, P.headY, P.headZ);
    armR.position.y = SHOULDER_Y + P.lift;
    armL.position.y = SHOULDER_Y + P.lift;
    armR.rotation.set(P.armRx, 0, P.armRz);
    armL.rotation.set(P.armLx, 0, P.armLz);
    legR.hip.rotation.x = P.legRx;
    legL.hip.rotation.x = P.legLx;
    wrist.rotation.x = P.wrist;
    if (skirt) {
      skirt.rotation.x = -P.torsoX * 0.6 + Math.sin(phase * 2) * 0.035 * wm;
      const flare = 1 + Math.abs(Math.sin(phase)) * 0.06 * wm + wa * 0.08;
      skirt.scale.set(flare, 1, flare);
    }

    // foam noodle: tip lags behind the arm like a spring
    if (dt > 0) {
      const armVel = (P.armRx - prevArm) / dt;
      prevArm = P.armRx;
      const target = Math.max(-0.7, Math.min(0.7, armVel * 0.03));
      bendV += ((target - bend) * 320 - bendV * 15) * dt;
      bend += bendV * dt;
      bend = Math.max(-0.9, Math.min(0.9, bend));
    }
    for (let i = 0; i < 3; i++) joints[i].rotation.x = NOODLE_CURVE[i] + bend * NOODLE_FLEX[i];
    const ns = W.noodle;
    noodle.visible = ns > 0.02;
    noodle.scale.setScalar(Math.max(0.001, ns));

    // carried items / name anchor follow the head over the (leaning) torso
    const top = HEAD_TOP_Y + 0.08;
    headTop.position.set(0, S * (LEG_H + P.rigY + Math.cos(P.torsoX) * top), S * Math.sin(P.torsoX) * top);

    // dizzy stars
    stars.visible = wt > 0.03;
    if (stars.visible) {
      stars.position.set(0, S * (LEG_H + TORSO_H + HEAD.h * hs + 0.35) + P.rigY * S, 0);
      stars.rotation.y = t * 4.5;
      stars.scale.setScalar(Math.max(0.001, S * (0.6 + 0.4 * wt) * hs));
    }

    // speed coil: glowing spinning rings round the ankles + shoe glow
    const wco = W.coil;
    const coilOn = wco > 0.02;
    legR.ring.visible = legL.ring.visible = coilOn;
    if (coilOn) {
      const pulse = 0.75 + Math.sin(t * 14) * 0.25;
      ringMat.opacity = wco * pulse * alpha;
      legR.ring.rotation.y = t * 9;
      legL.ring.rotation.y = -t * 9;
      const rs = 1 + Math.sin(t * 20) * 0.08;
      legR.ring.scale.setScalar(rs);
      legL.ring.scale.setScalar(rs);
      M.shoe.emissive.setRGB(0.2, 0.85, 1).multiplyScalar(wco * pulse * 0.8);
      const len = Math.min(4.5, speed * 0.09);
      trailMat.opacity = wco * clamp01(speed / 8) * alpha * (0.55 + 0.2 * pulse);
      for (const tr of trails) {
        tr.visible = len > 0.2;
        tr.scale.set(1, 1, len);
      }
    } else if (M.shoe.emissive.g !== 0) {
      M.shoe.emissive.setRGB(0, 0, 0);
      trails[0].visible = trails[1].visible = false;
    }

    // invisibility cloak
    const inv = s.invisible == null ? 1 : s.invisible;
    root.visible = inv > 0.02;
    setOpacity(inv > 0.02 ? Math.min(1, inv) : 1);
  }

  return {
    object3d: root,
    headTop,
    update,
    setCarry(obj) {
      if (carry === obj) return;
      if (carry) headTop.remove(carry);
      carry = obj || null;
      if (carry) headTop.add(carry);
    },
    setFace(img, sk) {
      const newSkin = sk ? boostSkin(sk) : skin;
      faceImg = img || null;
      if (newSkin !== skin) {
        skin = newSkin;
        redrawOutfit();
      }
      drawHeadAtlas(faceCanvas(), look, skin, headCanvas);
      tex.head.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      if (carry) headTop.remove(carry);
      mats.forEach((m) => m.dispose());
      ringMat.dispose();
      depthMat.dispose();
      trailMat.map?.dispose();
      trailMat.dispose();
      Object.values(tex).forEach((t) => t?.dispose());
    },
    // extras for galleries / menus
    char,
    scale: S,
  };
}

/** Pre-builds the shared geometry (optional; avoids a hitch on the first avatar). */
export function warmAvatars() {
  sharedGeometry();
  loadFacePrint();
}
