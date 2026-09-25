// R6-style avatar: blocky plastic body, oversized rounded head with a photo (or cartoon) face, hair,
// outfit, hat and accessory (characters/cosmetics.js), pool noodle (slung on the back, drawn to swing),
// speed trail and procedural animation incl. emotes and dances. Nothing is ever posed in front of the face.
// Contract: createAvatar(charDef, faceImage, skinHex, look?) -> Avatar
//   look                 any Look (defaults to charDef.look); sanitized, so unknown ids are safe
//   avatar.object3d      THREE.Group, origin at the feet, facing +Z
//   avatar.headTop       THREE.Object3D positioned just above the head (name tags, carried items)
//   avatar.update(dt, s) s = {time, speed, onGround, vy, carrying:null|'seed'|'plant', stunned, swing (0..1 or -1),
//                              celebrating, invisible (0..1 alpha), isLocal, coil, interacting (verb|null),
//                              emote: id|null (social/catalog.js EMOTES), emoteT (seconds since it started),
//                              inPlace (turntables: the speed trail streams back as if running)}
//   avatar.setCarry(object3d|null)  attach an item above the head
//   avatar.setFace(image, skin)     photo (or null) + its skin tone; look.face picks photo vs cartoon
//   avatar.setLook(look)            rebuilds the outfit in place (same object3d / headTop)
//   avatar.dispose()
import * as THREE from 'three';
import { composeFaceCanvas, FACE_LAYOUT, boostSkin } from './faces.js';
import { drawOutfit, drawHeadAtlas, drawHairTexture, headRects, atlasRects, TORSO_ATLAS, LIMB_ATLAS, shoeColors, loadFacePrint, facePrintReady, makeCanvas } from './outfits.js';
import { LEG_H, TORSO_H, ARM_TOP, SHOULDER_Y, HEAD, ADULT_SCALE, KID, TAU, box, part, mergeParts, markShared, clamp01, lerp, damp, smooth } from './rig.js';
import { hairGeometry, hasTallHair, HAIR_SIDE } from './hair.js';
import { hatGeometry, accGeometry } from './gear.js';
import { EMOTE_ANIM } from './emotes.js';
import { createTrail } from './trails.js';
import { sanitizeLook, sameLook, HAIR_BY_ID, HAT_BY_ID } from './cosmetics.js';

const NOODLE_SEG = 1.5; // the noodle is 3 segments = 4.5 studs
const NOODLE_CURVE = [0.07, -0.07, -0.07]; // gentle permanent bend per segment
const NOODLE_FLEX = [0.1, 0.15, 0.2]; // how much each segment flexes when swung
// Slung across the back (torso space): grip end up over the right shoulder, tip down at the left hip,
// a little off the back so the swinging arms don't cut through it. Long hair falls down the back, so
// there it lies over the hair instead: further back (more for big kid heads), a little lower, and leaning
// in with the hair (pitch) so the tip still sits by the hip. As long hair swings with the head, the sneaky
// steal then looks round more with the shoulders (twist: share of the look-around) and keeps the chin
// lower (chin: head tilt against the crouch). A backpack pushes it further off the back too.
const SLING = { tilt: Math.PI / 4, y: 1.25, z: -0.95, pitch: 0, twist: 0, chin: -0.32 };
const SLING_LONG = { y: 1.05, z: -1.55, pitch: -0.08, twist: 0.75, chin: -0.1 };
const PACK_Z = -1.5;
const GLOW = 0.2; // soft self-illumination so characters pop against the world
// the noodle's grip frame inside the baked sling mesh (the hand noodle's frame maps onto it)
const SLING_BASE = new THREE.Matrix4()
  .makeTranslation(-Math.sin(SLING.tilt) * NOODLE_SEG * 1.5, Math.cos(SLING.tilt) * NOODLE_SEG * 1.5, 0)
  .multiply(new THREE.Matrix4().makeRotationZ(Math.PI + SLING.tilt));
const SLING_BASE_INV = SLING_BASE.clone().invert();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ shared geometry

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
  // the same noodle baked into one static mesh (centred, so it pops in place), slung diagonally
  const slingParts = [];
  {
    const m = SLING_BASE.clone();
    [noodle.base, noodle.mid, noodle.tip].forEach((geo, i) => {
      if (i) m.multiply(new THREE.Matrix4().makeTranslation(0, NOODLE_SEG, 0));
      m.multiply(new THREE.Matrix4().makeRotationX(NOODLE_CURVE[i]));
      slingParts.push(geo.clone().applyMatrix4(m));
    });
  }
  const sling = mergeParts(slingParts);
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
    sling,
    halo,
    ring: new THREE.TorusGeometry(0.72, 0.075, 6, 20).rotateX(Math.PI / 2),
    skirt,
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

// ------------------------------------------------------------------ helpers

// The noodle lives on the back so it never hides a face. A swing draws it over the right shoulder
// (the wind-up reaches right where it hangs), whacks, and ends "at the ready": fist at the hip, noodle
// pointing forward and a little down. After READY_HOLD without swinging it goes back over the shoulder.
// wrist = noodle angle relative to the arm (pi = straight on from the fist).
const READY = { armRx: -0.55, armRz: -0.12, wrist: 2.3 };
const DRAW_U = 0.2; // swing phase where the noodle leaves the back and lands in the fist
const READY_HOLD = 1.4; // seconds it stays in hand after the last swing
// Holster (h = 0..1 over `time` seconds; six keys spread evenly, Catmull-Rom through them): the fist
// swings the noodle out to the side and up over the right shoulder (well clear of the face and hair) and
// lays it down behind the back; at `swap` (key 3) the hand lets go and the noodle settles into its slung
// pose over `slide` seconds, on a small `arc` (y, z) away from the back, while the arm carries on round,
// down behind and back to the side. wristZ tilts the noodle sideways in the fist. One key set per sling
// (short / long hair), fitted offline so the noodle keeps clear of the head, hair and body all the way.
const HOLSTER = {
  time: 0.45,
  swap: 0.6,
  slide: 0.14,
  short: {
    arc: [-0.2, -0.3],
    armRx: [READY.armRx, -1.81, -4.23, -4.7, -5.71, -TAU],
    armRz: [READY.armRz, -0.92, -0.95, -0.8, -1.36, -0.07],
    wrist: [READY.wrist, 2.27, 1.67, 1.56, 1.67, READY.wrist],
    wristZ: [0, -0.01, -0.71, -0.89, -0.06, 0],
  },
  long: {
    arc: [0.25, -0.45],
    armRx: [READY.armRx, -0.55, -3.42, -4.81, -5.37, -TAU],
    armRz: [READY.armRz, -0.31, -1.51, -0.74, -1.08, -0.07],
    wrist: [READY.wrist, 2.1, 2.06, 1.53, 2.2, READY.wrist],
    wristZ: [0, -0.01, -0.09, -0.96, -0.47, 0],
  },
};
// the equivalent of angle a nearest to ref (so blends take the short way round)
const near = (a, ref) => a + TAU * Math.round((ref - a) / TAU);
// Catmull-Rom through evenly spaced keys, e = 0..1
function holsterKey(arr, e) {
  const n = arr.length - 1;
  const x = clamp01(e) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const t = x - i;
  const p0 = arr[Math.max(0, i - 1)];
  const p1 = arr[i];
  const p2 = arr[i + 1];
  const p3 = arr[Math.min(n, i + 2)];
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
// Noodle whack keyframes (u = 0..1 over the 0.35 s swing): wind up overhead, snap forward, follow through.
const SW_T = [0, 0.3, 0.5, 0.68, 1];
const SW_EASE = [(t) => 1 - (1 - t) * (1 - t), (t) => t * t * t, (t) => 1 - (1 - t) * (1 - t), (t) => t * t * (3 - 2 * t)];
const SW = {
  armRx: [READY.armRx, -3.3, -1.55, -0.95, READY.armRx],
  armRz: [READY.armRz, -0.45, 0.05, 0.1, READY.armRz], // wind up out to the side, clear of the face
  wrist: [READY.wrist, 1.5, 3.1, 2.85, READY.wrist],
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

let streakTex = null;
function streakTexture() {
  if (streakTex) return streakTex;
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
  streakTex = new THREE.CanvasTexture(c);
  streakTex.colorSpace = THREE.SRGBColorSpace;
  return streakTex;
}

// Composed head-front faces, cached per photo + skin + expression (avatars are rebuilt every match).
const faceCache = new WeakMap();
const noPhoto = {};
function cachedFace(img, skin, expr) {
  const k = img || noPhoto;
  let m = faceCache.get(k);
  if (!m) faceCache.set(k, (m = new Map()));
  const L = FACE_LAYOUT.head;
  const key = skin + '|' + L.scale + '|' + L.eyeY + '|' + (img ? '' : expr);
  if (!m.has(key)) {
    if (m.size > (img ? 4 : 24)) m.clear();
    m.set(key, composeFaceCanvas(img, skin, 512, { layout: L, expr }));
  }
  return m.get(key);
}

function canvasTexture(c, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Hats, glasses etc. are vertex-coloured; they get the same soft self-illumination as the textured
// body parts (one shader program shared by every avatar).
function cosmeticMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * ${GLOW.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => 'avatar-cosmetic';
  return m;
}

// Which emote poses need the hands (the noodle goes onto the back and is tucked away)
const POSE_KEYS = ['rigY', 'rigX', 'rigRX', 'rigRZ', 'rigYaw', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'headZ', 'armRx', 'armRz', 'armLx', 'armLz', 'legRx', 'legLx', 'legRz', 'legLz', 'sit'];

// ------------------------------------------------------------------ avatar

export function createAvatar(char, faceImage, skinHex, lookArg) {
  const G = sharedGeometry();
  let look = sanitizeLook(lookArg || char.look, char.id);
  let faceImg = faceImage || null;
  let faceSkin = skinHex || null;

  const root = new THREE.Group();
  root.name = 'avatar-' + char.id;
  const headTop = new THREE.Object3D();
  headTop.name = 'headTop';
  root.add(headTop);
  let carry = null;

  // ---- animation state (kept across setLook)
  const W = { move: 0, air: 0, carry: 0, stun: 0, celeb: 0, steal: 0, reach: 0, coil: 0, ready: 0, emote: 0, hat: 1 };
  const P = { rigY: 0, rigX: 0, rigRX: 0, rigRZ: 0, rigYaw: 0, torsoX: 0, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, headZ: 0, armRx: 0, armRz: 0, armLx: 0, armLz: 0, legRx: 0, legLx: 0, legRz: 0, legLz: 0, wrist: READY.wrist, wristZ: 0, lift: 0, sit: 0 };
  const E = { ...P };
  const emo = { id: null, t: 0 };
  let clock = Math.random() * 10;
  let phase = Math.random() * TAU;
  let prevArm = 0;
  // noodle: in the fist or on the back; scales pop it when it has to be put away mid-pose
  let inHand = false;
  let lastSwing = -10;
  let holster = -1; // 0..1 while putting it back over the shoulder
  let holsterArm = 0; // holster pose weight (fades out if a swing or a pickup interrupts it)
  let holsterAt = 0; // 0..1 along the holster keys
  let slide = 2; // 0..1 while the let-go noodle settles onto the back (2 = at rest)
  let handScale = 0;
  let slingScale = 1;
  let bend = 0;
  let bendV = 0;
  let alpha = 1;
  let transparent = false;
  let castOn = true;

  const usePhoto = () => look.face === 'photo' && !!faceImg;
  const skinNow = () => boostSkin(usePhoto() ? faceSkin || look.skin : look.skin);
  const exprNow = () => (look.face === 'photo' ? 'smile' : look.face);

  // ---- everything the look decides (rebuilt by setLook)
  let R = null;
  let buildId = 0;

  function build() {
    const id = ++buildId;
    const kid = look.build === 'kid';
    const S = ADULT_SCALE * (kid ? KID.scale : 1);
    const hs = kid ? KID.head : 1;
    const hairDef = HAIR_BY_ID[look.hair];
    const hatDef = look.hat ? HAT_BY_ID[look.hat] : null;
    const longHair = hairDef.sling === 'long';
    const pack = look.acc === 'backpack';
    const slung = longHair ? { ...SLING_LONG, z: SLING_LONG.z - (hs - 1) - (pack ? 0.25 : 0) } : pack ? { ...SLING, z: PACK_Z } : SLING;
    const skin = skinNow();

    // ---- textures (owned by this avatar)
    let outfit = drawOutfit(char, skin, look);
    const headCanvas = makeCanvas(1024, 512);
    drawHeadAtlas(cachedFace(usePhoto() ? faceImg : null, skin, exprNow()), look, skin, headCanvas);
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
      cos: null,
      glow: null,
    };
    const cosMat = () => {
      if (!M.cos) mats.push((M.cos = cosmeticMaterial()));
      return M.cos;
    };
    const glowMat = () => {
      if (!M.glow) mats.push((M.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
      return M.glow;
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
    torsoMesh.name = 'torso';
    torsoMesh.position.y = TORSO_H / 2;
    torso.add(torsoMesh);
    const neck = new THREE.Group();
    neck.position.y = TORSO_H;
    torso.add(neck);
    const head = new THREE.Group();
    head.scale.setScalar(hs);
    neck.add(head);
    const headMesh = mesh(G.head, M.head);
    headMesh.name = 'head';
    headMesh.position.y = HEAD.h / 2;
    head.add(headMesh);
    const capped = !!(hatDef?.covers && hasTallHair(look.hair));
    const hairGeo = hairGeometry(look.hair, kid ? 3.0 : 3.4, capped);
    if (hairGeo) {
      const hair = mesh(hairGeo, M.hair, false); // no self-shadow across the face
      hair.name = 'hair';
      hair.position.y = HEAD.h / 2;
      head.add(hair);
    }

    const makeArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 1.5, SHOULDER_Y, 0);
      torso.add(sh);
      const a = mesh(G.arm, M.arm);
      a.name = 'arm';
      a.position.y = ARM_TOP - 1;
      sh.add(a);
      return sh;
    };
    const armR = makeArm(-1); // character's right is -X
    const armL = makeArm(1);

    const sandal = look.shirt === 'dress';
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.5, 0, 0);
      hips.add(hip);
      const l = mesh(G.leg, M.leg);
      l.name = 'leg';
      l.position.y = -LEG_H / 2;
      hip.add(l);
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
    const coilTrails = [-1, 1].map((side) => {
      const m = new THREE.Mesh(G.trail, trailMat);
      m.position.set(side * 0.5, 0.35, -0.35);
      m.visible = false;
      body.add(m);
      return m;
    });

    let skirt = null;
    if (M.skirt) {
      skirt = mesh(G.skirt, M.skirt);
      skirt.name = 'skirt';
      skirt.position.y = 0.02;
      torso.add(skirt);
    }

    // pool noodle: slung across the back, or in the right fist while swinging
    const sling = new THREE.Mesh(G.sling, M.noodle);
    sling.name = 'sling';
    sling.position.set(0, slung.y, slung.z);
    sling.rotation.x = slung.pitch;
    torso.add(sling);
    const slingRest = { p: sling.position.clone(), q: sling.quaternion.clone() };
    const slideFrom = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    const hand = new THREE.Group();
    hand.position.set(0, ARM_TOP - 1.72, 0.02);
    armR.add(hand);
    const wrist = new THREE.Group();
    hand.add(wrist);
    // three chained segments: a gentle permanent curve plus a springy flex when swung
    const noodle = new THREE.Group();
    noodle.position.y = -0.4;
    wrist.add(noodle);
    const joints = [];
    let parent = noodle;
    [G.noodle.base, G.noodle.mid, G.noodle.tip].forEach((geo, i) => {
      const j = new THREE.Group();
      if (i) j.position.y = NOODLE_SEG;
      j.rotation.x = NOODLE_CURVE[i];
      parent.add(j);
      const m = new THREE.Mesh(geo, M.noodle);
      m.name = 'noodle';
      j.add(m);
      joints.push(j);
      parent = j;
    });

    // ---- hat and accessory
    const anims = [];
    const addParts = (parts, into) => {
      if (parts.main) into.add(mesh(parts.main, cosMat()));
      if (parts.glow) into.add(mesh(parts.glow, glowMat(), false));
      const groups = [];
      for (const a of parts.anim || []) {
        const g = new THREE.Group();
        g.position.set(...a.pos);
        (a.parent != null ? groups[a.parent] : into).add(g);
        g.add(mesh(a.geo, a.glow ? glowMat() : cosMat(), !a.glow));
        groups.push(g);
        anims.push({ obj: g, anim: a.anim, y: a.pos[1] });
      }
    };
    const fit = hairDef.fit;
    // hats sit on the hair's base; tall parts (bun, spikes, crest) are hidden under covering hats and
    // poke through open ones (crowns, flower crowns)
    const lift = fit.capLift ?? fit.lift;
    let hat = null;
    if (hatDef) {
      hat = new THREE.Group();
      hat.name = 'hat';
      hat.position.y = HEAD.h + lift;
      hat.scale.setScalar(fit.s);
      head.add(hat);
      addParts(hatGeometry(look.hat, look.hatColor), hat);
    }
    let acc = null;
    if (look.acc) {
      const ag = accGeometry(look.acc, look.accColor, look.hairColor);
      if (ag) {
        acc = new THREE.Group();
        acc.name = 'acc';
        if (ag.at === 'face') {
          acc.position.y = HEAD.h / 2;
          head.add(acc);
        } else {
          // wings sit over long hair that falls down the back
          if (look.acc === 'wings' && longHair) acc.position.z = -0.95 * hs;
          torso.add(acc);
        }
        addParts(ag, acc);
      }
    }
    // how high the top of the hair / hat reaches above the head (name tags sit above it)
    const hatTop = hatDef ? (lift + hatDef.h * fit.s) * hs : 0;
    const tallHat = !!hatDef && hatDef.h > 0.6;

    // ---- speed trail
    const trail = look.trail ? createTrail(look.trail) : null;
    if (trail) root.add(trail.object3d);

    // things that live in unscaled avatar space
    const stars = new THREE.Mesh(G.halo, starMat);
    stars.visible = false;
    root.add(stars);

    const HEAD_TOP_Y = TORSO_H + HEAD.h * hs; // above the hips
    // raise the shoulders when carrying so the hands reach the item above the head
    const CARRY_LIFT = Math.max(0, HEAD_TOP_Y - (SHOULDER_Y + 2 - ARM_TOP) + 0.05);
    // ...and splay them into a V around bigger (kid) heads instead of through the face
    const CARRY_SPLAY = 0.1 + (hs - 1) * 1.4;

    R = {
      id, S, hs, kid, slung, longHair, skin, outfit, headCanvas, tex, mats, M, starMat, trailMat, ringMat, depthMat, shadowed, ghosts,
      rig, body, hips, torso, neck, head, armR, armL, legR, legL, coilTrails, skirt, sling, slingRest, slideFrom, hand, wrist, noodle, joints,
      hat, acc, anims, hatTop, tallHat, trail, stars, HEAD_TOP_Y, CARRY_LIFT, CARRY_SPLAY,
      HK: HOLSTER[longHair ? 'long' : 'short'],
      // how far arms must splay out to go up past the head and hair
      ctx: { up: 0.12 + (hs - 1) * 1.4 + (HAIR_SIDE[look.hair] || 0) * 1.1 * hs, kid },
      redrawOutfit() {
        R.outfit = drawOutfit(char, R.skin, look);
        for (const k of ['torso', 'arm', 'leg', 'hair']) {
          tex[k].image = R.outfit[k];
          tex[k].needsUpdate = true;
        }
        if (tex.skirt && R.outfit.skirt) {
          tex.skirt.image = R.outfit.skirt;
          tex.skirt.needsUpdate = true;
        }
      },
    };
    // re-apply the cloak to the new materials on the next update
    alpha = 1;
    transparent = false;
    castOn = true;
    // the slung noodle rests on the (new) back
    slide = 2;
    if (look.shirt === 'faceprint') {
      if (facePrintReady()) R.redrawOutfit();
      else loadFacePrint().then(() => R && R.id === id && R.redrawOutfit());
    }
  }

  function teardown() {
    if (!R) return;
    root.remove(R.rig);
    root.remove(R.stars);
    if (R.trail) {
      root.remove(R.trail.object3d);
      R.trail.dispose();
    }
    R.mats.forEach((m) => m.dispose());
    R.ringMat.dispose();
    R.depthMat.dispose();
    R.trailMat.dispose();
    Object.values(R.tex).forEach((t) => t?.dispose());
    R = null;
  }

  function setOpacity(a) {
    if (a === alpha) return;
    alpha = a;
    const tr = a < 0.999;
    for (const m of R.mats) {
      m.opacity = a;
      if (tr !== transparent) {
        m.transparent = tr;
        m.needsUpdate = true;
      }
    }
    if (tr !== transparent) {
      for (const m of R.ghosts) {
        m.children[0].visible = tr;
        m.renderOrder = tr ? 21 : 0;
      }
    }
    transparent = tr;
    const cast = !tr;
    if (cast !== castOn) {
      castOn = cast;
      for (const m of R.shadowed) m.castShadow = cast;
    }
  }

  function repaintHead() {
    drawHeadAtlas(cachedFace(usePhoto() ? faceImg : null, R.skin, exprNow()), look, R.skin, R.headCanvas);
    R.tex.head.needsUpdate = true;
  }

  build();

  function update(dt, s) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    clock += dt;
    const t = clock;
    const { body, torso, head, armR, armL, legR, legL, hand, wrist, noodle, sling, slingRest, slideFrom, skirt, joints, HK, slung, S, hs } = R;
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

    // emotes: blend out the old one before a new one blends in; moving, carrying or a hit cancels them
    const want = s.emote && EMOTE_ANIM[s.emote] ? s.emote : null;
    if (want !== emo.id && (W.emote < 0.04 || !emo.id)) {
      emo.id = want;
      emo.t = 0;
    }
    const emoting = !!emo.id && want === emo.id && !s.carrying && !s.stunned && !(s.swing >= 0) && speed < 2.5 && ground;
    // emoteT (time since it started, from the game) keeps everyone's dances in step; without it the
    // avatar keeps its own clock
    if (emoting && Number.isFinite(s.emoteT)) emo.t = s.emoteT;
    else emo.t += dt;
    W.emote = damp(W.emote, emoting ? 1 : 0, emoting ? 9 : 12, dt);
    if (!emoting && W.emote < 0.002) {
      W.emote = 0;
      if (!want) emo.id = null;
    }
    const hands = W.emote > 0.05;

    // noodle: drawn by a swing, held at the ready for a moment, then holstered
    const u = s.swing;
    const swinging = u != null && u >= 0;
    let snap = false; // swapped mid-motion (hand hidden by the swing): no scale pop
    if (swinging) {
      lastSwing = clock;
      holster = -1;
      if (!inHand && u >= DRAW_U) inHand = snap = true;
    } else if (s.carrying || s.interacting || s.celebrating || s.stunned || hands) {
      inHand = false; // hands needed: pop it back onto the back (or cut the holster's follow-through)
      holster = -1;
    } else if (inHand && holster < 0 && clock - lastSwing > READY_HOLD) holster = 0;
    let letting = false;
    if (holster >= 0) {
      holster += dt / HOLSTER.time;
      if (inHand && holster >= HOLSTER.swap) {
        inHand = false;
        snap = letting = true;
      }
      if (holster >= 1) {
        holster = -1;
        holsterArm = 0;
      }
    }
    if (holster >= 0) {
      holsterArm = smooth(0, 0.08, holster) * (1 - smooth(0.8, 1, holster));
      holsterAt = holster;
    } else {
      holsterArm = damp(holsterArm, 0, 22, dt);
    }
    if (inHand && slide <= 1) {
      slide = 2;
      sling.position.copy(slingRest.p);
      sling.quaternion.copy(slingRest.q);
    }
    if (snap) {
      handScale = inHand ? 1 : 0;
      slingScale = 1 - handScale;
    } else {
      handScale = damp(handScale, inHand ? 1 : 0, 24, dt);
      // dances and emotes tuck the slung noodle away (arms swing behind the back)
      slingScale = damp(slingScale, inHand || W.emote > 0.3 ? 0 : 1, 18, dt);
    }
    W.ready = damp(W.ready, inHand ? 1 : 0, 16, dt);

    const sp = Math.min(speed, 70);
    if (speed > 0.2) phase += dt * Math.min(5, 1.15 + sp * 0.085) * TAU;
    phase %= TAU * 1000;

    // --- idle
    const br = Math.sin(t * 2.2);
    P.rigY = br * 0.025;
    P.rigX = 0;
    P.rigRX = 0;
    P.rigRZ = 0;
    P.rigYaw = 0;
    P.torsoX = 0;
    P.torsoY = 0;
    P.torsoZ = 0;
    const still = 1 - W.move;
    P.headX = Math.sin(t * 0.9) * 0.03;
    // keep the idle look-around small: a flat photo face turned away stops reading as a face
    P.headY = Math.sin(t * 0.43) * 0.07 * still;
    P.headZ = Math.sin(t * 0.61) * 0.025 * still;
    P.armRx = Math.sin(t * 1.1) * 0.035;
    P.armLx = -P.armRx;
    P.armRz = -0.07 - br * 0.025;
    P.armLz = 0.07 + br * 0.025;
    P.legRx = 0;
    P.legLx = 0;
    P.legRz = 0;
    P.legLz = 0;
    P.wrist = READY.wrist;
    P.lift = 0;
    P.sit = 0;

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

    // --- noodle at the ready (fist by the hip, noodle pointing forward)
    const wn = W.ready * (1 - W.stun) * (1 - W.celeb);
    if (wn > 0.001) {
      P.armRx = lerp(P.armRx, READY.armRx + Math.sin(phase) * 0.1 * wm - 0.3 * wa, wn);
      P.armRz = lerp(P.armRz, READY.armRz - 0.2 * wa, wn);
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
      const peek = Math.sin(t * 2.4) * 0.55;
      P.torsoY = lerp(P.torsoY, peek * slung.twist, ws);
      P.headX = lerp(P.headX, slung.chin, ws);
      P.headY = lerp(P.headY, peek * (1 - slung.twist), ws);
    }

    // --- carry: both arms up holding the item over the head
    const wc = W.carry;
    if (wc > 0.001) {
      const cb = Math.sin(phase * 2) * 0.05 * wm;
      P.armRx = lerp(P.armRx, -3.06 + cb, wc);
      P.armLx = lerp(P.armLx, -3.06 - cb, wc);
      P.armRz = lerp(P.armRz, -R.CARRY_SPLAY, wc);
      P.armLz = lerp(P.armLz, R.CARRY_SPLAY, wc);
      P.lift = R.CARRY_LIFT * wc;
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

    // --- emotes and dances
    const wem = W.emote;
    if (wem > 0.001 && emo.id) {
      for (const k of POSE_KEYS) E[k] = P[k];
      EMOTE_ANIM[emo.id].pose(E, emo.t, R.ctx);
      for (const k of POSE_KEYS) P[k] = lerp(P[k], E[k], wem);
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

    // --- put the noodle back: up out to the side, over the top and down behind the shoulder
    P.wristZ = 0;
    if (holsterArm > 0.001) {
      const rx = holsterKey(HK.armRx, holsterAt);
      P.armRx = lerp(near(P.armRx, rx), rx, holsterArm);
      P.armRz = lerp(P.armRz, holsterKey(HK.armRz, holsterAt), holsterArm);
      P.wrist = lerp(P.wrist, holsterKey(HK.wrist, holsterAt), holsterArm);
      P.wristZ = holsterKey(HK.wristZ, holsterAt) * holsterArm;
    }

    // --- noodle whack overlay
    if (swinging) {
      const w = smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u));
      const rx = swingKey(SW.armRx, u);
      P.armRx = lerp(near(P.armRx, rx), rx, w);
      P.armRz = lerp(P.armRz, swingKey(SW.armRz, u), w);
      P.wrist = lerp(P.wrist, swingKey(SW.wrist, u), w);
      P.torsoY = lerp(P.torsoY, swingKey(SW.torsoY, u), w);
      P.torsoX = lerp(P.torsoX, swingKey(SW.torsoX, u), w);
      P.armLx = lerp(P.armLx, swingKey(SW.armLx, u), w);
      P.armLz = lerp(P.armLz, swingKey(SW.armLz, u), w);
      P.rigY += swingKey(SW.rigY, u) * w;
    }

    // --- apply
    body.position.set(P.rigX, P.rigY, 0);
    body.rotation.set(P.rigRX, P.rigYaw, P.rigRZ);
    torso.rotation.set(P.torsoX, P.torsoY, P.torsoZ);
    head.rotation.set(P.headX, P.headY, P.headZ);
    armR.position.y = SHOULDER_Y + P.lift;
    armL.position.y = SHOULDER_Y + P.lift;
    armR.rotation.set(P.armRx, 0, P.armRz);
    armL.rotation.set(P.armLx, 0, P.armLz);
    legR.hip.rotation.set(P.legRx, 0, P.legRz);
    legL.hip.rotation.set(P.legLx, 0, P.legLz);
    wrist.rotation.set(P.wrist, 0, P.wristZ);
    if (skirt) {
      // sitting drapes the skirt forward over the legs
      skirt.rotation.x = -P.torsoX * 0.6 + Math.sin(phase * 2) * 0.035 * wm - 1.2 * P.sit;
      const flare = 1 + Math.abs(Math.sin(phase)) * 0.06 * wm + wa * 0.08;
      skirt.scale.set(flare, 1 - 0.3 * P.sit, flare);
    }

    // foam noodle: tip lags behind the arm like a spring
    if (dt > 0) {
      const armVel = (P.armRx - near(prevArm, P.armRx)) / dt;
      prevArm = P.armRx;
      const target = Math.max(-0.7, Math.min(0.7, armVel * 0.03));
      bendV += ((target - bend) * 320 - bendV * 15) * dt;
      bend += bendV * dt;
      bend = Math.max(-0.9, Math.min(0.9, bend));
    }
    for (let i = 0; i < 3; i++) joints[i].rotation.x = NOODLE_CURVE[i] + bend * NOODLE_FLEX[i];
    // let go: the slung noodle takes over exactly where the hand noodle is, then settles onto the back
    if (letting) {
      armR.updateMatrix();
      hand.updateMatrix();
      wrist.updateMatrix();
      _m.multiplyMatrices(armR.matrix, hand.matrix).multiply(wrist.matrix);
      _m.multiply(_m2.makeTranslation(noodle.position)).multiply(SLING_BASE_INV);
      _m.decompose(slideFrom.p, slideFrom.q, _v);
      slide = 0;
    }
    if (slide <= 1) {
      const e = smooth(0, 1, slide);
      // ...on a little arc away from the back, clear of the hair and the swinging legs
      sling.position.lerpVectors(slideFrom.p, slingRest.p, e);
      sling.position.y += Math.sin(Math.PI * e) * HK.arc[0];
      sling.position.z += Math.sin(Math.PI * e) * HK.arc[1];
      sling.quaternion.slerpQuaternions(slideFrom.q, slingRest.q, e);
      slide = slide >= 1 ? 2 : Math.min(1, slide + dt / HOLSTER.slide);
    }
    noodle.visible = handScale > 0.02;
    noodle.scale.setScalar(Math.max(0.001, handScale));
    sling.visible = slingScale > 0.02;
    sling.scale.setScalar(Math.max(0.001, slingScale));

    // hats that stand tall tuck away while a pot is carried over the head
    if (R.hat) {
      W.hat = damp(W.hat, R.tallHat && s.carrying ? 0 : 1, 16, dt);
      const hsz = Math.max(0.001, W.hat);
      R.hat.visible = hsz > 0.02;
      R.hat.scale.setScalar(HAIR_BY_ID[look.hair].fit.s * hsz);
    }
    // cosmetic motion: propeller, halo, cape, wings
    for (const a of R.anims) {
      const o = a.obj;
      if (a.anim === 'spin') o.rotation.y += dt * (5 + Math.min(speed, 60) * 0.7);
      else if (a.anim === 'halo') {
        o.position.y = a.y + Math.sin(t * 2.1) * 0.06;
        o.rotation.y = t * 0.7;
      } else if (a.anim === 'capeTop') {
        o.rotation.x = 0.04 + P.sit * 0.3;
      } else if (a.anim === 'cape') {
        // the cape streams out behind as you run, flutters, and lifts when falling
        const flare = Math.min(1.2, 0.08 + speed * 0.032) * (1 - W.emote * 0.7) + wa * 0.35 * clamp01(-(s.vy || 0) / 20);
        o.rotation.x = damp(o.rotation.x, flare + Math.sin(t * (6 + speed * 0.3)) * 0.05 * clamp01(speed / 10) - P.torsoX * 0.5, 10, dt);
      } else if (a.anim === 'wingL' || a.anim === 'wingR') {
        const f = Math.sin(t * (7 + Math.min(speed, 40) * 0.25)) * (0.18 + clamp01(speed / 20) * 0.18);
        o.rotation.y = (a.anim === 'wingL' ? 1 : -1) * (0.35 + f);
      }
    }

    // carried items / name anchor follow the head over the (leaning) torso; name tags clear the hat
    const top = R.HEAD_TOP_Y + 0.08 + R.hatTop * W.hat * (1 - W.carry);
    headTop.position.set(S * P.rigX, S * (LEG_H + P.rigY + Math.cos(P.torsoX) * top), S * Math.sin(P.torsoX) * top);

    // dizzy stars
    const stars = R.stars;
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
    const M = R.M;
    if (coilOn) {
      const pulse = 0.75 + Math.sin(t * 14) * 0.25;
      R.ringMat.opacity = wco * pulse * alpha;
      legR.ring.rotation.y = t * 9;
      legL.ring.rotation.y = -t * 9;
      const rs = 1 + Math.sin(t * 20) * 0.08;
      legR.ring.scale.setScalar(rs);
      legL.ring.scale.setScalar(rs);
      M.shoe.emissive.setRGB(0.2, 0.85, 1).multiplyScalar(wco * pulse * 0.8);
      const len = Math.min(4.5, speed * 0.09);
      R.trailMat.opacity = wco * clamp01(speed / 8) * alpha * (0.55 + 0.2 * pulse);
      for (const tr of R.coilTrails) {
        tr.visible = len > 0.2;
        tr.scale.set(1, 1, len);
      }
    } else if (M.shoe.emissive.g !== 0) {
      M.shoe.emissive.setRGB(0, 0, 0);
      R.coilTrails[0].visible = R.coilTrails[1].visible = false;
    }

    // invisibility cloak
    const inv = s.invisible == null ? 1 : s.invisible;
    root.visible = inv > 0.02;
    setOpacity(inv > 0.02 ? Math.min(1, inv) : 1);

    // cosmetic speed trail (never while cloaked: no giveaway sparkles)
    if (R.trail) R.trail.update(dt, root, ground ? speed : speed * 0.6, { scale: S, visible: inv >= 0.999, inPlace: !!s.inPlace });
  }

  const api = {
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
      faceImg = img || null;
      if (sk) faceSkin = sk;
      const newSkin = skinNow();
      if (newSkin !== R.skin) {
        R.skin = newSkin;
        R.redrawOutfit();
      }
      repaintHead();
    },
    setLook(l) {
      const nl = sanitizeLook(l, char.id);
      if (sameLook(nl, look)) return;
      look = nl;
      teardown();
      build();
      api.scale = R.S;
    },
    get look() {
      return look;
    },
    dispose() {
      if (carry) headTop.remove(carry);
      carry = null;
      teardown();
    },
    // extras for galleries / menus
    char,
    scale: R.S,
  };
  return api;
}

/**
 * Just a head with its hair (and hat), for Wardrobe thumbnails. Origin at the head centre, facing +Z.
 * Returns {object3d, dispose}.
 */
export function createHeadBust(lookArg, base = 'dorian') {
  const G = sharedGeometry();
  const look = sanitizeLook(lookArg, base);
  const skin = boostSkin(look.skin);
  const expr = look.face === 'photo' ? 'smile' : look.face;
  const headCanvas = drawHeadAtlas(cachedFace(null, skin, expr), look, skin, makeCanvas(1024, 512));
  const tex = [canvasTexture(headCanvas), canvasTexture(drawHairTexture(look, skin))];
  const mats = [
    new THREE.MeshStandardMaterial({ map: tex[0], emissive: 0xffffff, emissiveMap: tex[0], emissiveIntensity: GLOW, roughness: 0.66 }),
    new THREE.MeshStandardMaterial({ map: tex[1], emissive: 0xffffff, emissiveMap: tex[1], emissiveIntensity: GLOW * 0.6, roughness: 0.42 }),
  ];
  const root = new THREE.Group();
  root.add(new THREE.Mesh(G.head, mats[0]));
  const hatDef = look.hat ? HAT_BY_ID[look.hat] : null;
  const capped = !!(hatDef?.covers && hasTallHair(look.hair));
  const hg = hairGeometry(look.hair, 3.4, capped);
  if (hg) root.add(new THREE.Mesh(hg, mats[1]));
  return {
    object3d: root,
    dispose() {
      mats.forEach((m) => m.dispose());
      tex.forEach((t) => t.dispose());
    },
  };
}

/** Pre-builds the shared geometry (optional; avoids a hitch on the first avatar). */
export function warmAvatars() {
  sharedGeometry();
  loadFacePrint();
}
