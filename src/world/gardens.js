// The four family gardens: floors with owner-colour trim, fences, gate posts with laser beams, planter boxes
// (crated when locked), COLLECT / LOCK pads, a growing cash pile, owner billboard, the BASE console, and the FOR
// SALE lots at the far end (unmown grass, a dashed boundary, fence signs) until they are bought.
//
// Base levels and the Base Studio (config BASE / BASE_STYLES). Each garden api also has:
//   setBase({level, style})   style = effectiveBaseStyle(...) for that level: {floor, fence, laser, decor[6]}.
//                             Rebuilds that garden's styled parts (floor, fence, gate posts, laser colour, level
//                             badge, console screen, decorations, build-here markers, guard, treadmill,
//                             sprinklers, golden trim). Cheap enough to call on load, upgrades and studio edits.
//   guard                     the Guard Gnome ({object3d, swing(), update(dt, t, {alert})}) or null below
//                             BASE.guardAt. The view animates it. Read it each frame: setBase / setOwner can replace it.
//   treadmill                 the home treadmill ({object3d, setTier, update(dt, t, {running})}) or null below
//                             BASE.treadmillAt. The view animates it (same caveat as guard).
//   setTreadmillTier(tier)    index into TREADMILL.tiers.
//   base                      {level, style} as last applied (read only).
//   decor                     the decoration objects by spot (null where empty); the trampoline's userData.bounce().
// Styled parts of all four gardens share one mesh per material (rebuilt on the next update after a change), so
// a default Lv1 garden costs what it did before plus a few shared draw calls.
import * as THREE from 'three';
import { CHARACTERS, PLANTERS, LOTS, BASE, BASE_STYLES, DEFAULT_BASE_STYLE, decorSpotsFor } from '../config.js';
import { effectiveBaseStyle, sameBaseStyle, LASER } from '../gameplay/basestyle.js';
import { bus } from '../core/events.js';
import { Merger, makeRand, makeCanvas, canvasTexture, drawTexture, chunkyText, roundRect, uTime, signMaterial, mergedGeometry, onDisplayFont, trs } from './kit.js';
import { lawnTexture, soilTexture, collectTexture, lockTexture, floorTexture, hedgeTexture, castleTexture, candyStripeTexture } from './textures.js';
import { bush, flower } from './props.js';
import { createDecor, createGuardGnome } from './basedecor.js';
import { createTreadmill } from './treadmill.js';

const FENCE_H = 6.3;
const MAX_BRICKS = 34;
const MAX_COINS = 18;
const BEAMS = [0.9, 2.0, 3.1, 4.2, 5.3, 6.4];
const TAU = Math.PI * 2;
const WH = '#ffffff';
const GOLD = '#ffd23f';
const NEON = { a: '#ff4fd8', b: '#3ff0ff' };
// Stepping-stone colour per floor, so the path to the planters reads on every floor (space: glowing stones).
const STONES = { lawn: '#e7e1d2', stripes: '#ece6d6', checker: '#f2eee4', meadow: '#ece6d6', beach: '#aeb9c4', stone: '#f6efdc', candy: '#9ff0d0', cloud: '#ffd98a', space: '#a898ff', gold: '#fff4d2' };
// Height of each fence's top, for the golden base's sparkles.
const FENCE_TOP = { bamboo: 6.5, picket: 6.0, hedge: 6.2, castle: 6.6, candy: 6.0, ice: 6.3, neon: 6.3, gold: 6.0 };

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

// uColor = beam colour (sRGB 0..1); uMode 0 = solid, 1 = rainbow (hues run along the beams), 2 = gold glitter.
function laserMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uGrow: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: new THREE.Vector3(1, 0.06, 0.1) }, uMode: { value: 0 } },
    vertexShader: `
      attribute float aBeam;
      varying vec2 vUv; varying float vBeam;
      void main(){ vUv = uv; vBeam = aBeam; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uGrow, uAlpha, uMode;
      uniform vec3 uColor;
      varying vec2 vUv; varying float vBeam;
      vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){
        float along = vUv.x;
        if (along > uGrow) discard;
        float d = abs(vUv.y - 0.5) * 2.0;
        float floorGlow = step(vBeam, -0.5);
        float core = exp(-d * d * 90.0) * (1.0 - floorGlow);
        float halo = exp(-d * d * 7.0) * (0.75 - floorGlow * 0.45);
        float shimmer = 0.72 + 0.28 * sin(along * 70.0 - uTime * 24.0 + vBeam * 1.7) * sin(along * 19.0 + uTime * 7.0 + vBeam);
        float flick = 0.88 + 0.12 * sin(uTime * 37.0 + vBeam * 3.0);
        float tip = smoothstep(uGrow, uGrow - 0.03, along);
        vec3 base = uColor;
        if (uMode > 0.5 && uMode < 1.5) base = hue(fract(along * 1.3 - uTime * 0.4 + vBeam * 0.11));
        vec3 col = base * halo * shimmer * 1.3 + mix(base, vec3(1.0), 0.42) * core * 1.25;
        if (uMode > 1.5) {
          float cell = floor(along * 80.0);
          float gl = step(0.9, fract(sin(cell * 91.7 + vBeam * 13.1 + floor(uTime * 9.0) * 7.3) * 43758.5453));
          col += vec3(1.0, 0.95, 0.75) * gl * (halo + core) * 1.4;
        }
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
  // soft glow on the ground under the beams
  const base = pos.length / 3;
  const fw = 1.6;
  pos.push(x - fw, 0.09, z0, x - fw, 0.09, z1, x + fw, 0.09, z1, x + fw, 0.09, z0);
  uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  beam.push(-1, -1, -1, -1);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

// Coins scattered around the cash pallet, in pallet space: u points away from the COLLECT pad, z along the
// fence. [u, z, stacked on an earlier coin]. Spots on the pallet (|u| < 1.8, |z| < 1.62) rest on its deck;
// the rest lie flat on the lawn, clear of the pad.
const COIN_SPOTS = [
  [1.55, 0.35], [2.35, -0.55], [-1.55, -0.85], [0.55, 2.1], [1.55, -0.95], [2.25, 1.2], [-0.35, -2.1], [1.55, 0.35, 1], [2.8, 0.35],
  [-1.55, 0.45], [1.25, -2.15], [1.55, 1.2], [-0.9, 2.05], [2.55, -1.75], [1.55, -0.95, 1], [1.95, 2.2], [-1.55, -0.85, 1], [0.2, -2.5],
];
const PALLET = { hx: 1.8, hz: 1.62, top: 0.3 };

function coinSlots(r) {
  return COIN_SPOTS.slice(0, MAX_COINS).map(([u, z, stacked]) => {
    const onPallet = Math.abs(u) < PALLET.hx && Math.abs(z) < PALLET.hz;
    if (!onPallet) return { u, z, y: 0.095, rx: 0, rz: 0 };
    const rx = r.range(-0.1, 0.1), rz = r.range(-0.1, 0.1);
    // a tilted disc (radius 0.34, half-thickness 0.05) resting on the deck
    const y = PALLET.top + 0.34 * Math.sin(Math.hypot(rx, rz)) + 0.05 + (stacked ? 0.1 : 0);
    return { u, z, y, rx, rz };
  });
}

function cashSlots(r) {
  const slots = [];
  const layers = [[3, 4], [3, 3], [2, 3], [2, 2], [1, 2], [1, 1], [1, 1]];
  layers.forEach(([cx, cz], li) => {
    for (let ix = 0; ix < cx; ix++) {
      for (let iz = 0; iz < cz; iz++) {
        slots.push({
          x: (ix - (cx - 1) / 2) * 1.02 + r.range(-0.06, 0.06),
          y: 0.52 + li * 0.44,
          z: (iz - (cz - 1) / 2) * 0.58 + r.range(-0.05, 0.05),
          ry: r.range(-0.12, 0.12) + (li === 6 ? 0.6 : 0),
        });
      }
    }
  });
  return slots.slice(0, MAX_BRICKS);
}

// ------------------------------------------------------------------ Base Studio materials

// Shimmering gold: shiny, with a slow glint sweeping across every gold surface.
function goldMaterial(map = null) {
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, map, specular: 0xfff0b8, shininess: 55, emissive: map ? 0x3a2600 : 0x5a3a00 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGoldW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGoldW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vGoldW;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float glint = sin((vGoldW.x + vGoldW.z) * 0.2 + vGoldW.y * 0.35 - uTime * 1.6);
        totalEmissiveRadiance += vec3(1.0, 0.85, 0.5) * pow(max(glint, 0.0), 24.0) * 0.6;`);
  };
  m.customProgramCacheKey = () => 'garden-gold';
  return m;
}

// Ice crystal: see-through blue with bright, more opaque rims (fresnel) and sharp highlights.
function iceMaterial() {
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.62, specular: 0xffffff, shininess: 110, emissive: 0x0e3f63 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float iceRim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.2);
      outgoingLight += vec3(0.55, 0.85, 1.0) * iceRim * 0.7;
      diffuseColor.a = mix(diffuseColor.a, 1.0, iceRim * 0.8);
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'garden-ice';
  return m;
}

// Unlit neon / lights with a gentle travelling pulse (not tone mapped, so the colours stay vivid).
function glowMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGlowW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vGlowW;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.86 + 0.14 * sin(uTime * 3.0 - (vGlowW.x + vGlowW.z) * 0.4);');
  };
  m.customProgramCacheKey = () => 'garden-glow';
  return m;
}

// Starry floor: the emissive star map twinkles star by star (one star per cell of the map's grid).
function spaceMaterial(t) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: t.map, emissive: 0xffffff, emissiveMap: t.emissiveMap });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 starCell = floor(vEmissiveMapUv * ${t.cells.toFixed(1)});
        float starH = fract(sin(dot(starCell, vec2(12.9898, 78.233))) * 43758.5453);
        float tw = 0.5 + 0.5 * sin(uTime * (1.2 + starH * 2.6) + starH * 40.0);
        totalEmissiveRadiance *= 0.2 + 1.3 * tw * tw;`);
  };
  m.customProgramCacheKey = () => 'garden-space';
  return m;
}

// Sprinkler water arcs: droplets run along each arc; arcs sway around their sprinkler head (aHead = x, z, phase).
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      uniform float uTime;
      attribute vec3 aHead;
      varying vec2 vUv; varying float vPh;
      void main(){
        vUv = uv; vPh = aHead.z;
        vec3 p = position;
        float a = sin(uTime * 0.9 + aHead.z * 6.2831) * 0.3;
        vec2 d = p.xz - aHead.xy;
        float c = cos(a), s = sin(a);
        p.xz = aHead.xy + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv; varying float vPh;
      void main(){
        float t = vUv.x;
        float drops = fract(t * 5.0 - uTime * 2.2 + vPh * 3.0);
        float a = (0.3 + 0.6 * smoothstep(0.35, 0.8, drops)) * smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.82, t);
        vec3 col = mix(vec3(0.55, 0.86, 1.0), vec3(1.0), smoothstep(0.6, 0.95, drops));
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

// Golden-base sparkles: four-point stars that blink on and off (aPhase), drifting up and down a little.
function sparkleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      uniform float uTime;
      attribute float aPhase;
      varying float vA;
      void main(){
        vec3 p = position;
        p.y += sin(uTime * 0.8 + aPhase * 6.2831) * 0.35;
        float tw = pow(max(0.0, sin(uTime * (1.0 + fract(aPhase * 7.3) * 1.5) + aPhase * 18.85)), 4.0);
        vA = tw;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(tw * 380.0 / -mv.z, 0.0, 34.0);
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        float cr = max(smoothstep(0.07, 0.0, abs(q.x)) * smoothstep(0.5, 0.0, abs(q.y)), smoothstep(0.07, 0.0, abs(q.y)) * smoothstep(0.5, 0.0, abs(q.x)));
        float a = (cr + smoothstep(0.2, 0.0, length(q))) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.5) * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Candy-cane hook (half torus in the XY plane, from +x over the top to -x) and the console's star.
let _hook = null;
function hookGeo() {
  if (!_hook) {
    _hook = new THREE.TorusGeometry(0.42, 0.2, 6, 10, Math.PI);
    _hook.computeBoundingBox();
  }
  return _hook;
}
let _star = null;
function starGeo() {
  if (!_star) {
    const s = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 0.2 : 0.46;
      if (k) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    _star = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }).translate(0, 0, -0.08);
    _star.computeBoundingBox();
  }
  return _star;
}

// ------------------------------------------------------------------ fence helpers

// A straight fence run from a to b. n = [nx, nz] its (unsigned) normal; out = which way along n is outside the garden.
function mkSeg(ax, az, bx, bz, n, out) {
  const len = Math.hypot(bx - ax, bz - az);
  return { ax, az, bx, bz, len, dx: (bx - ax) / len, dz: (bz - az) / len, nx: n[0], nz: n[1], out, x: (t) => ax + (bx - ax) * t, z: (t) => az + (bz - az) * t };
}

// Box along a run from t0 to t1 (+ext studs), centred at height y, `thick` across and shifted `off` across it.
function runBox(m, s, t0, t1, y, h, thick, off, color, o = {}, ext = 0) {
  const tm = (t0 + t1) / 2, L = s.len * (t1 - t0) + ext;
  m.box(s.x(tm) + s.nx * off, y, s.z(tm) + s.nz * off, Math.abs(s.dx) * L + Math.abs(s.nx) * thick, h, Math.abs(s.dz) * L + Math.abs(s.nz) * thick, color, o);
}

// Box of size (along, h, across) at (x, y, z), turned to the run.
function segBox(m, s, x, y, z, along, h, across, color, o) {
  m.box(x, y, z, Math.abs(s.dx) * along + Math.abs(s.nx) * across, h, Math.abs(s.dz) * along + Math.abs(s.nz) * across, color, o);
}

// A diamond (square turned 45 degrees in the run's plane): picket tips, banner points.
function segDiamond(m, s, x, y, z, size, across, color, o = {}) {
  if (s.nx) m.box(x, y, z, across, size, size, color, { ...o, rx: Math.PI / 4 });
  else m.box(x, y, z, size, size, across, color, { ...o, rz: Math.PI / 4 });
}

// Posts every ~`spacing` studs including both ends: fn(x, z, i, n).
function posts(s, spacing, fn) {
  const n = Math.max(1, Math.round(s.len / spacing));
  for (let i = 0; i <= n; i++) fn(s.x(i / n), s.z(i / n), i, n);
}

// Neon tube with a soft additive halo above and below it.
function neonTube(F, s, y, off, color) {
  runBox(F.P('glow'), s, 0, 1, y, 0.16, 0.16, off, color, { ao: 0 });
  const H = F.P('halo');
  const c = new THREE.Color(color).multiplyScalar(0.55);
  runBox(H, s, 0, 1, y + 0.26, 0.36, 0.03, off, c, { ao: 0, top: '#000000' });
  runBox(H, s, 0, 1, y - 0.26, 0.36, 0.03, off, '#000000', { ao: 0, top: c });
}

const brighten = (hex, k = 0.25) => new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k);

// ------------------------------------------------------------------ fences: one builder per BASE_STYLES fence
// F = {P(key) -> Merger, acc (owner colour), r (seeded rand), golden, color, inw}. Everything stays within
// +-0.55 of the fence line (the FOR SALE signs hang 0.54 inside the side fences) and below ~8.5.

const FENCES = {
  bamboo(F, s) {
    const B = F.P('bamboo'), W = F.P('flat'), r = F.r;
    const n = Math.max(1, Math.round(s.len / 0.6));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, h = FENCE_H - r.range(0, 0.25), c = r();
      const x = s.x(t) + s.nx * r.range(-0.04, 0.04), z = s.z(t) + s.nz * r.range(-0.04, 0.04);
      B.add('cylo:6', trs(x, h / 2, z, 0.56, h, 0.56), c < 0.33 ? '#d8d488' : c < 0.66 ? '#e6dc98' : '#c9cf7c', { ao: 0 });
    }
    // lashing rails on both faces, owner-colour top rail
    for (const y of [1.55, 4.5]) for (const sd of [-1, 1]) runBox(W, s, 0, 1, y, 0.32, 0.14, sd * 0.33, '#7a5230', { ao: 0 });
    runBox(F.golden ? F.P('gold') : F.acc, s, 0, 1, FENCE_H + 0.12, 0.3, 0.8, 0, F.golden ? GOLD : WH, { ao: 0.15 });
    posts(s, 6, (x, z) => {
      B.add('cylo:6', trs(x, (FENCE_H + 0.9) / 2, z, 0.92, FENCE_H + 0.9, 0.92), '#c8a860', { ao: 0 });
      F.acc.prim('sphere:7', x, FENCE_H + 1.0, z, 1.15, 0.9, 1.15, WH, { ao: 0.1 });
    });
  },

  picket(F, s) {
    const W = F.P('flat');
    const n = Math.max(1, Math.round(s.len / 0.74));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = s.x(t), z = s.z(t), c = i % 2 ? '#f6f4ee' : WH;
      segBox(W, s, x, 0.15 + 2.7, z, 0.52, 5.4, 0.14, c, { ao: 0.3 });
      segDiamond(W, s, x, 5.55, z, 0.37, 0.14, c, { ao: 0 });
    }
    for (const sd of [-1, 1]) {
      runBox(W, s, 0, 1, 1.3, 0.36, 0.12, sd * 0.13, '#efece3', { ao: 0 });
      runBox(F.golden ? F.P('gold') : W, s, 0, 1, 4.3, 0.36, 0.12, sd * 0.13, F.golden ? GOLD : '#efece3', { ao: 0 });
    }
    posts(s, 6, (x, z) => {
      W.block(x, 0, z, 0.66, 5.9, 0.66, WH, { ao: 0.3 });
      W.block(x, 5.9, z, 0.86, 0.16, 0.86, '#e6e2d6', { ao: 0 });
      F.acc.prim('sphere:9', x, 6.36, z, 0.72, 0.72, 0.72, WH, { ao: 0 });
    });
  },

  hedge(F, s) {
    const H = F.P('hedge'), r = F.r;
    runBox(H, s, 0, 1, 2.8, 5.6, 1.0, 0, '#e2f2dc', { ao: 0.4 });
    const n = Math.max(1, Math.round(s.len / 1.3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const along = (s.len / n) * 1.35;
      H.prim('sphere:8', s.x(t), 5.62, s.z(t), Math.abs(s.dx) * along + Math.abs(s.nx) * 1.12, 1.05, Math.abs(s.dz) * along + Math.abs(s.nz) * 1.12, WH, { ao: 0.12 });
    }
    if (F.golden) runBox(F.P('gold'), s, 0, 1, 5.2, 0.22, 1.08, 0, GOLD, { ao: 0 });
    // little flowers in the owner's colour dotted over both faces
    const W = F.P('flat');
    const nf = Math.round(s.len / 1.7);
    for (const sd of [-1, 1]) {
      for (let i = 0; i < nf; i++) {
        const t = r(), y = r.range(0.9, 4.9), x = s.x(t) + s.nx * sd * 0.5, z = s.z(t) + s.nz * sd * 0.5;
        F.acc.prim('sphere:6', x, y, z, 0.44, 0.44, 0.44, WH, { ao: 0 });
        W.prim('sphere:5', x + s.nx * sd * 0.17, y, z + s.nz * sd * 0.17, 0.18, 0.18, 0.18, '#ffe14d', { ao: 0 });
      }
    }
    posts(s, 6, (x, z) => {
      H.block(x, 0, z, 1.3, 5.9, 1.3, '#e2f2dc', { ao: 0.4 });
      H.prim('sphere:10', x, 6.35, z, 1.6, 1.5, 1.6, WH, { ao: 0.12 });
      F.acc.block(x, 5.0, z, 1.36, 0.34, 1.36, WH, { ao: 0 });
    });
  },

  castle(F, s) {
    const C = F.P('castle'), W = F.P('flat');
    runBox(C, s, 0, 1, 2.6, 5.2, 1.0, 0, WH, { ao: 0.3 });
    runBox(F.golden ? F.P('gold') : C, s, 0, 1, 5.35, 0.3, 1.2, 0, F.golden ? GOLD : '#e6e8ee', { ao: 0 });
    const n = Math.max(1, Math.round(s.len / 2.0));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      segBox(C, s, s.x(t), 6.0, s.z(t), 1.1, 1.0, 1.0, WH, { ao: 0.1 });
    }
    posts(s, 12, (x, z) => {
      C.block(x, 0, z, 1.7, 6.3, 1.7, '#f2f3f6', { ao: 0.3 });
      C.block(x, 6.3, z, 2.0, 0.35, 2.0, '#e6e8ee', { ao: 0 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) C.block(x + sx * 0.72, 6.65, z + sz * 0.72, 0.56, 0.6, 0.56, WH, { ao: 0.1 });
    });
    // owner banners on the outside face (and inside the gate wall, where the owner sees them)
    const nb = Math.max(1, Math.round(s.len / 12));
    const faces = s.gate ? [s.out, -s.out] : [s.out];
    for (let i = 0; i < nb; i++) {
      const t = (i + 0.5) / nb;
      for (const f of faces) {
        const x = s.x(t) + s.nx * f * 0.55, z = s.z(t) + s.nz * f * 0.55;
        segBox(F.acc, s, x, 3.95, z, 1.3, 2.3, 0.08, WH, { ao: 0 });
        segDiamond(F.acc, s, x, 2.8, z, 0.92, 0.08, WH, { ao: 0 });
        segDiamond(W, s, x + s.nx * f * 0.05, 4.1, z + s.nz * f * 0.05, 0.5, 0.06, '#fff6d0', { ao: 0 });
        segBox(W, s, x + s.nx * f * 0.05, 5.12, z + s.nz * f * 0.05, 1.6, 0.14, 0.14, '#6b4424', { ao: 0 });
      }
    }
  },

  candy(F, s) {
    const Cn = F.P('candy'), W = F.P('flat');
    const n = Math.max(1, Math.round(s.len / 1.5));
    const hook = hookGeo();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = s.x(t), z = s.z(t);
      Cn.add('cyl:8', trs(x, 2.5, z, 0.44, 5.0, 0.44), WH, { ao: 0.15 });
      Cn.add(hook, s.nx ? trs(x, 5.0, z + 0.42, 1, 1, 1, 0, Math.PI / 2, 0) : trs(x - 0.42, 5.0, z, 1, 1, 1), WH, { ao: 0 });
    }
    for (const sd of [-1, 1]) {
      runBox(W, s, 0, 1, 1.5, 0.3, 0.12, sd * 0.28, '#ffb3d9', { ao: 0 });
      runBox(F.golden ? F.P('gold') : W, s, 0, 1, 3.9, 0.3, 0.12, sd * 0.28, F.golden ? GOLD : '#ffffff', { ao: 0 });
    }
    posts(s, 6, (x, z) => {
      Cn.cyl(x, 0, z, 0.42, 6.0, WH, { seg: 10, ao: 0.15 });
      W.cyl(x, 5.92, z, 0.5, 0.16, '#fff4fa', { seg: 10, ao: 0 });
      F.acc.prim('hemi', x, 6.05, z, 1.2, 1.1, 1.2, WH, { ao: 0 });
    });
  },

  ice(F, s) {
    const I = F.P('ice'), W = F.P('flat'), r = F.r;
    runBox(W, s, 0, 1, 0.25, 0.5, 1.1, 0, '#e8f5ff', { ao: 0.15 });
    const nl = Math.max(1, Math.round(s.len / 1.5));
    for (let i = 0; i < nl; i++) {
      const t = (i + 0.5) / nl;
      const along = (s.len / nl) * 1.3;
      W.prim('sphere:7', s.x(t), 0.45, s.z(t), Math.abs(s.dx) * along + Math.abs(s.nx) * 1.2, 0.7, Math.abs(s.dz) * along + Math.abs(s.nz) * 1.2, WH, { ao: 0.1 });
    }
    if (F.golden) runBox(F.P('gold'), s, 0, 1, 0.62, 0.18, 1.16, 0, GOLD, { ao: 0 });
    const crystal = (x, z, h, d, rx, rz, ry = r() * TAU) => {
      const M = trs(x, 0, z, 1, 1, 1, rx, ry, rz);
      I.add('cyl:6', M.clone().multiply(trs(0, h / 2, 0, d, h, d)), '#45bdfa', { ao: 0.1, top: '#c4f0ff' });
      I.add('cone:6', M.clone().multiply(trs(0, h + d * 0.45, 0, d, d * 0.9, d)), '#c4f0ff', { ao: 0 });
    };
    const n = Math.max(1, Math.round(s.len / 0.78));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + r.range(-0.15, 0.15)) / n;
      crystal(s.x(t), s.z(t), r.range(4.2, 5.9), r.range(0.62, 0.95), r.range(-0.07, 0.07), r.range(-0.07, 0.07));
    }
    posts(s, 6, (x, z) => {
      crystal(x, z, 6.6, 1.05, 0, 0);
      // two shorter ones leaning away along the fence (tilting +y towards (dx, dz): rx = dz, rz = -dx)
      const lean = 0.3;
      crystal(x - s.dx * 0.4, z - s.dz * 0.4, 4.9, 0.8, -s.dz * lean, s.dx * lean, 0);
      crystal(x + s.dx * 0.4, z + s.dz * 0.4, 4.9, 0.8, s.dz * lean, -s.dx * lean, 0);
      F.acc.prim('octa', x, 7.75, z, 0.7, 1.0, 0.7, WH, { ao: 0 });
    });
  },

  neon(F, s) {
    const W = F.P('flat'), N = F.P('glow');
    runBox(W, s, 0, 1, 3.1, 5.8, 0.3, 0, '#2a2e48', { ao: 0.25 });
    runBox(W, s, 0, 1, 0.2, 0.4, 0.46, 0, '#161a2e', { ao: 0 });
    runBox(F.golden ? F.P('gold') : W, s, 0, 1, 6.12, 0.26, 0.5, 0, F.golden ? GOLD : '#161a2e', { ao: 0 });
    const own = brighten(F.color, 0.2);
    for (const sd of [-1, 1]) {
      const off = sd * 0.2;
      neonTube(F, s, 5.55, off, own);
      neonTube(F, s, 0.8, off, NEON.b);
      const nz = Math.max(2, Math.round(s.len / 2.2));
      for (let i = 0; i < nz; i++) {
        const t0 = i / nz, t1 = (i + 1) / nz, up = i % 2 === 0;
        N.beam(s.x(t0) + s.nx * off, up ? 1.2 : 5.15, s.z(t0) + s.nz * off, s.x(t1) + s.nx * off, up ? 5.15 : 1.2, s.z(t1) + s.nz * off, 0.13, NEON.a, { ao: 0 });
      }
    }
    posts(s, 6, (x, z) => {
      W.block(x, 0, z, 0.56, 6.5, 0.56, '#161a2e', { ao: 0.2 });
      N.block(x, 6.5, z, 0.44, 0.44, 0.44, own, { ao: 0 });
    });
  },

  gold(F, s) {
    const Gd = F.P('gold');
    runBox(Gd, s, 0, 1, 0.45, 0.9, 0.5, 0, '#f4c430', { ao: 0.25 });
    for (const y of [3.0, 5.25]) runBox(Gd, s, 0, 1, y, 0.24, 0.24, 0, '#f4c430', { ao: 0 });
    const n = Math.max(1, Math.round(s.len / 0.7));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = s.x(t), z = s.z(t);
      Gd.add('cylo:6', trs(x, 3.2, z, 0.2, 4.6, 0.2), GOLD, { ao: 0 });
      Gd.prim('cone:6', x, 5.8, z, 0.34, 0.6, 0.34, '#ffe27a', { ao: 0 });
    }
    posts(s, 6, (x, z) => {
      Gd.block(x, 0, z, 0.72, 6.2, 0.72, GOLD, { ao: 0.2 });
      Gd.prim('sphere:10', x, 6.6, z, 0.9, 0.9, 0.9, '#ffe27a', { ao: 0 });
      F.acc.block(x, 4.4, z, 0.78, 0.36, 0.78, WH, { ao: 0 });
    });
  },
};

// Gate posts per fence (x, z = post centre, tall = post height, cap = how far above it the top may reach: the
// north post carries the owner sign). Returns nothing; the emitters, owner bands and golden trim are shared.
const GATES = {
  bamboo(F, x, z, tall) {
    const W = F.P('flat');
    W.block(x, 0, z, 1.5, tall, 1.5, '#8a5a34', { ao: 0.3 });
    W.block(x, tall, z, 1.9, 0.5, 1.9, '#6b4424', { ao: 0 });
    // tiki face carving on the aisle side
    const fx = x - F.inw * 0.78;
    W.box(fx, 5.6, z, 0.12, 0.9, 1.1, '#5a3a1e', { ao: 0 });
    W.box(fx, 6.6, z - 0.32, 0.12, 0.35, 0.35, '#f4e8c8', { ao: 0 });
    W.box(fx, 6.6, z + 0.32, 0.12, 0.35, 0.35, '#f4e8c8', { ao: 0 });
  },
  picket(F, x, z, tall, cap) {
    const W = F.P('flat');
    W.block(x, 0, z, 1.5, tall, 1.5, WH, { ao: 0.3 });
    W.block(x, tall, z, 1.9, 0.28, 1.9, '#e9e5da', { ao: 0 });
    W.prim('cone:4', x, tall + 0.28 + (cap - 0.28) / 2, z, 2.1, cap - 0.28, 2.1, WH, { ry: Math.PI / 4, ao: 0 });
  },
  hedge(F, x, z, tall, cap) {
    const H = F.P('hedge');
    H.block(x, 0, z, 1.62, tall - 0.4, 1.62, '#e2f2dc', { ao: 0.4 });
    const d = Math.min(1.9, cap + 0.5);
    H.prim('sphere:10', x, tall + cap - d / 2, z, d, d, d, WH, { ao: 0.12 });
  },
  castle(F, x, z, tall) {
    const C = F.P('castle');
    C.block(x, 0, z, 1.6, tall - 0.6, 1.6, '#f2f3f6', { ao: 0.3 });
    C.block(x, tall - 0.6, z, 2.0, 0.5, 2.0, '#e6e8ee', { ao: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) C.block(x + sx * 0.7, tall - 0.1, z + sz * 0.7, 0.6, 0.55, 0.6, WH, { ao: 0.1 });
  },
  candy(F, x, z, tall, cap) {
    F.P('candy').cyl(x, 0, z, 0.8, tall, WH, { seg: 12, ao: 0.15 });
    F.P('flat').cyl(x, tall - 0.12, z, 0.95, 0.3, '#fff4fa', { seg: 12, ao: 0 });
    F.acc.prim('hemi', x, tall + 0.1, z, 1.9, Math.min(1.6, (cap - 0.1) * 2), 1.9, WH, { ao: 0 });
  },
  ice(F, x, z, tall, cap) {
    const I = F.P('ice');
    I.cyl(x, 0, z, 0.86, tall - 0.3, '#45bdfa', { seg: 6, top: '#c4f0ff', ao: 0.1 });
    const h = cap + 0.3;
    I.prim('cone:6', x, tall - 0.3 + h / 2, z, 1.72, h, 1.72, '#c4f0ff', { ao: 0 });
  },
  neon(F, x, z, tall) {
    const W = F.P('flat'), N = F.P('glow');
    W.block(x, 0, z, 1.5, tall, 1.5, '#23263a', { ao: 0.3 });
    W.block(x, tall, z, 1.8, 0.32, 1.8, '#15172a', { ao: 0 });
    for (const [y, c] of [[1.45, NEON.b], [3.65, NEON.a], [5.85, NEON.b], [tall - 0.55, NEON.a]]) N.block(x, y, z, 1.58, 0.2, 1.58, c, { ao: 0 });
    N.block(x, tall + 0.32, z, 0.8, 0.46, 0.8, brighten(F.color, 0.2), { ao: 0 });
  },
  gold(F, x, z, tall, cap) {
    const Gd = F.P('gold');
    Gd.block(x, 0, z, 1.5, tall, 1.5, GOLD, { ao: 0.25 });
    Gd.block(x, tall, z, 1.9, 0.36, 1.9, '#f0b828', { ao: 0 });
    const d = Math.min(1.0, cap - 0.36);
    Gd.prim('sphere:12', x, tall + 0.36 + d / 2, z, d, d, d, '#ffe27a', { ao: 0 });
  },
};

// ------------------------------------------------------------------ gardens

export function buildGardens(ctx) {
  const { root, layout, mats, quality } = ctx;
  const r = makeRand(4242);
  const group = new THREE.Group();
  group.name = 'gardens';
  root.add(group);
  const wood = new Merger({ uv: 'studs', uvScale: 0.125 });
  const soil = new Merger({ uv: 'studs', uvScale: 0.22 });
  const flags = [];

  const lawnMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: lawnTexture() });
  const soilMat = new THREE.MeshLambertMaterial({ map: soilTexture(), vertexColors: true });
  const collectMat = new THREE.MeshBasicMaterial({ map: collectTexture() });
  const padGeo = (rad) => new THREE.CircleGeometry(rad, 28).rotateX(-Math.PI / 2);

  // crates + padlocks on the garden's own 10 planters (instance = slot * 10 + index); lots have FOR SALE signs instead
  const crateMesh = new THREE.InstancedMesh(crateGeometry(), mats.flat, layout.gardens.length * PLANTERS.base);
  const lockMesh = new THREE.InstancedMesh(padlockGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2800 }), layout.gardens.length * PLANTERS.base);
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
  const coins = coinSlots(r);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const apis = [];
  const animating = new Set();
  // Planters just bought through the game ("slot:index"): only these pop their crate off with an animation.
  // Any other change of state (first sync, save restore, test setups) snaps the crate on/off instantly.
  const liveUnlocks = new Set();
  bus.on('planter:unlocked', (e) => {
    if (e?.player) liveUnlocks.add(e.player.slot + ':' + e.index);
  });
  // FOR SALE dressing of every garden's unbought lots, in two meshes shared by all gardens: unmown grass with a
  // dashed boundary, and boards with a sign on each side fence. Rebuilt when a lot opens or closes (rare), so the
  // lots cost no extra draw calls. The signs are one atlas: one row per lot (the price is the same everywhere).
  const SIGN_W = 384, SIGN_H = 240;
  const saleCanvas = makeCanvas(SIGN_W, SIGN_H * LOTS.count);
  const saleTex = canvasTexture(saleCanvas, { clamp: true });
  const drawSale = () => {
    for (let k = 0; k < LOTS.count; k++) drawSaleSign(saleCanvas, k, k * SIGN_H, SIGN_H);
    saleTex.needsUpdate = true;
  };
  drawSale();
  onDisplayFont(drawSale);
  const saleGeo = Array.from({ length: LOTS.count }, (_, k) => {
    const g = new THREE.PlaneGeometry(4.0, 2.5);
    const U = g.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setY(i, 1 - (k + 1 - U.getY(i)) / LOTS.count);
    return g;
  });
  const forSale = layout.gardens.map((L) => L.lots.map(() => true));
  const ownerColor = CHARACTERS.map((c) => c.color);
  const lotGrass = new THREE.Mesh(new THREE.BufferGeometry(), lawnMat);
  const lotSigns = new THREE.Mesh(new THREE.BufferGeometry(), signMaterial(saleTex, 0.28));
  const lotWood = new THREE.Mesh(new THREE.BufferGeometry(), mats.flat);
  const lotSoil = new THREE.Mesh(new THREE.BufferGeometry(), soilMat);
  lotGrass.name = 'lot-grass';
  lotSigns.name = 'lot-signs';
  lotWood.name = 'lot-planters';
  lotSoil.name = 'lot-soil';
  lotWood.castShadow = quality.shadows;
  for (const m of [lotGrass, lotSigns, lotWood, lotSoil]) {
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    group.add(m);
  }
  let lotsDirty = true;
  function buildLots() {
    const grass = new Merger({ uv: 'studs', uvScale: 1 / 16 });
    const signs = new Merger(); // boards sample the sign atlas' brown corner (flat uv)
    const planters = new Merger({ uv: 'studs', uvScale: 0.125 });
    const dirt = new Merger({ uv: 'studs', uvScale: 0.22 });
    layout.gardens.forEach((L, slot) => {
      const b = L.bounds, T = 1.5;
      const outerX = L.west ? b.minX : b.maxX;
      for (const lot of L.lots) {
        if (!forSale[slot][lot.index]) {
          // bought: its 5 planters (the owner band baked in the owner's colour)
          const lr = makeRand(900 + slot * 10 + lot.index);
          for (const P of L.planters) if (P.lot === lot.index) planterBox(planters, dirt, planters, P.x, P.z, L.inward, ownerColor[slot], 3, lr);
          continue;
        }
        const last = lot.index === LOTS.count - 1;
        const xa = lot.edgeX, xb = last ? outerX + L.inward * (T + 0.3) : lot.farX;
        const z0 = b.minZ + T + 0.3, z1 = b.maxZ - T - 0.3;
        grass.box((xa + xb) / 2, 0.05, L.center.z, Math.abs(xb - xa), 0.03, z1 - z0, '#cfc873', { ao: 0 });
        for (let z = z0 + 1; z < z1 - 0.5; z += 3.2) grass.box(xa, 0.075, z + 0.9, 0.45, 0.03, 1.8, '#ffffff', { ao: 0 });
        for (const [fz, face] of [[b.minZ, 1], [b.maxZ, -1]]) {
          signs.box(lot.x, 3.7, fz + face * 0.62, 4.4, 2.9, 0.16, '#ffffff', { ao: 0 });
          signs.add(saleGeo[lot.index], trs(lot.x, 3.7, fz + face * 0.71, 1, 1, 1, 0, face > 0 ? 0 : Math.PI), '#ffffff', { ao: 0, uv: 'geo' });
        }
      }
    });
    for (const [mesh, m] of [[lotGrass, grass], [lotSigns, signs], [lotWood, planters], [lotSoil, dirt]]) {
      mesh.geometry.dispose();
      mesh.geometry = m.count ? m.buildGeometry() : new THREE.BufferGeometry();
      mesh.visible = m.count > 0;
    }
  }

  // ---------------------------------------------------------- Base Studio: shared styled meshes
  // One mesh per material key holds the styled parts of every garden that uses it (so four gardens with the same
  // look cost one draw call); gardens rebuild their own parts and the keys they touched are rebuilt on update.
  const bambooMat = new THREE.MeshLambertMaterial({ map: bambooTexture(), vertexColors: true });
  const KEYS = {
    flat: { opts: {}, mat: () => mats.flat, cast: true },
    glow: { opts: {}, mat: glowMaterial, cast: false },
    halo: {
      opts: {},
      mat: () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      cast: false,
      order: 6,
    },
    bamboo: { opts: { uv: 'geo' }, mat: () => bambooMat, cast: true },
    hedge: { opts: { uv: 'box', uvScale: 0.25 }, mat: () => new THREE.MeshLambertMaterial({ vertexColors: true, map: hedgeTexture() }), cast: true },
    castle: { opts: { uv: 'box', uvScale: 0.25 }, mat: () => new THREE.MeshLambertMaterial({ vertexColors: true, map: castleTexture() }), cast: true },
    candy: { opts: { uv: 'geo' }, mat: () => new THREE.MeshLambertMaterial({ vertexColors: true, map: candyStripeTexture() }), cast: true },
    ice: { opts: {}, mat: iceMaterial, cast: true, order: 2 },
    gold: { opts: {}, mat: () => goldMaterial(), cast: true },
  };
  for (const f of BASE_STYLES.floors) {
    KEYS['floor:' + f.id] = {
      get opts() {
        return { uv: 'studs', uvScale: f.id === 'lawn' ? 1 / 16 : 1 / floorTexture(f.id).studs };
      },
      mat: () => {
        if (f.id === 'lawn') return lawnMat;
        const t = floorTexture(f.id);
        if (f.id === 'gold') return goldMaterial(t.map);
        if (t.emissiveMap) return spaceMaterial(t);
        return new THREE.MeshLambertMaterial({ vertexColors: true, map: t.map });
      },
      cast: false,
      order: 1,
    };
  }
  const shared = new Map(); // key -> Mesh
  const matCache = new Map();
  const dirtyKeys = new Set();
  const G = []; // per-garden styled state

  function flushStyles() {
    for (const key of dirtyKeys) {
      const K = KEYS[key];
      const geos = [];
      for (const g of G) {
        const geo = g.geos.get(key);
        if (geo) geos.push(geo);
      }
      let mesh = shared.get(key);
      if (!geos.length) {
        if (mesh) {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.BufferGeometry();
          mesh.visible = false;
        }
        continue;
      }
      if (!mesh) {
        let mat = matCache.get(key);
        if (!mat) matCache.set(key, (mat = K.mat()));
        mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        mesh.name = 'garden-style-' + key;
        mesh.castShadow = K.cast && quality.shadows;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = K.order || 0;
        group.add(mesh);
        shared.set(key, mesh);
      }
      mesh.geometry.dispose();
      mesh.geometry = concatGeometries(geos);
      mesh.visible = true;
    }
    dirtyKeys.clear();
    if (waterDirty) {
      waterDirty = false;
      water.geometry.dispose();
      water.geometry = waterGeometry(G.flatMap((g) => g.water));
      water.visible = water.geometry.attributes.position?.count > 0;
    }
    if (sparkDirty) {
      sparkDirty = false;
      sparks.geometry.dispose();
      sparks.geometry = sparkleGeometry(G.flatMap((g) => g.sparks));
      sparks.visible = sparks.geometry.attributes.position?.count > 0;
    }
  }

  // sprinkler water arcs and golden sparkles (shared by all gardens, only drawn when some garden has them)
  const water = new THREE.Mesh(new THREE.BufferGeometry(), waterMaterial());
  water.name = 'garden-sprinkler-water';
  water.visible = false;
  water.frustumCulled = false;
  water.renderOrder = 4;
  const sparks = new THREE.Points(new THREE.BufferGeometry(), sparkleMaterial());
  sparks.name = 'garden-sparkles';
  sparks.visible = false;
  sparks.frustumCulled = false;
  sparks.renderOrder = 5;
  group.add(water, sparks);
  let waterDirty = false, sparkDirty = false;

  // BASE console screens: one canvas row per garden, one mesh for all four.
  const SCR_W = 256, SCR_H = 128;
  const screenCanvas = makeCanvas(SCR_W, SCR_H * layout.gardens.length);
  const screenTex = canvasTexture(screenCanvas, { clamp: true });
  const screenMerger = new Merger({ uv: 'geo' });

  layout.gardens.forEach((L, slot) => {
    const char = CHARACTERS[slot];
    const b = L.bounds;
    const c = L.center;
    const inw = L.inward;
    const acc = new Merger({ uv: 'studs', uvScale: 0.125 });

    // ---------------------------------------------------------- trim (the floor itself is styled: applyBase)
    const T = 1.5;
    acc.box(c.x, 0.05, b.minZ + T / 2 + 0.3, b.maxX - b.minX - 0.6, 0.06, T, WH, { ao: 0 });
    acc.box(c.x, 0.05, b.maxZ - T / 2 - 0.3, b.maxX - b.minX - 0.6, 0.06, T, WH, { ao: 0 });
    const outerX = L.west ? b.minX : b.maxX;
    acc.box(outerX + inw * (T / 2 + 0.3), 0.05, c.z, T, 0.06, b.maxZ - b.minZ - 0.6, WH, { ao: 0 });
    for (const [z0, z1] of [[b.minZ + 0.3, L.gate.minZ], [L.gate.maxZ, b.maxZ - 0.3]]) acc.box(L.gate.x + inw * (T / 2 + 0.3), 0.05, (z0 + z1) / 2, T, 0.06, z1 - z0, WH, { ao: 0 });
    // welcome mat in the gate (the stepping stones towards the planters are styled)
    acc.box(L.gate.x + inw * 1.6, 0.06, c.z, 3.2, 0.08, 11, WH, { ao: 0 });

    const GX = L.gate.x;
    const gpS = L.gate.minZ - 0.75, gpN = L.gate.maxZ + 0.75;
    for (const pz of [gpS, gpN]) {
      const tall = pz === gpN ? 8.4 : 9.2;
      // 30 tall so nobody hops over; the camera only collides with the visible post (camMaxY)
      ctx.colliders.push({ minX: GX - 0.75, maxX: GX + 0.75, minY: 0, maxY: 30, camMaxY: tall + 0.5, minZ: pz - 0.75, maxZ: pz + 0.75, tag: 'fence' });
    }

    // ---------------------------------------------------------- planters
    // (a lot's planters are built into the shared lot meshes once it is bought: see buildLots)
    const planterApis = L.planters.map((P, i) => {
      const x = P.x, z = P.z;
      if (P.lot >= 0) {
        // the first planter of a lot stands for the whole lot
        const first = i === PLANTERS.base + P.lot * LOTS.planters;
        return {
          setUnlocked(v) {
            if (first && forSale[slot][P.lot] !== !v) {
              forSale[slot][P.lot] = !v;
              lotsDirty = true;
            }
          },
        };
      }
      planterBox(wood, soil, acc, x, z, inw, WH, 3, r);
      const idx = slot * PLANTERS.base + i;
      const st = { unlocked: i < PLANTERS.startUnlocked, synced: false, anim: 1, idx, x, z, yaw: inw < 0 ? Math.PI / 2 : -Math.PI / 2 };
      placeCrate(st, st.unlocked ? 1 : 0);
      return {
        setUnlocked(v) {
          v = !!v;
          if (st.synced && v === st.unlocked) return;
          const live = liveUnlocks.delete(slot + ':' + i) && v && st.synced;
          st.synced = true;
          st.unlocked = v;
          if (live) {
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
    for (const s of [-1, 0, 1]) wood.block(pile.x, 0, pile.z + s * 1.3, 2 * PALLET.hx, 0.14, 0.45, '#8a5a2a', { ao: 0 });
    for (let k = -2; k <= 2; k++) wood.block(pile.x, 0.14, pile.z + k * 0.655, 2 * PALLET.hx, PALLET.top - 0.14, 0.6, k % 2 ? '#b0743e' : '#c08450', { ao: 0.15 });

    // ---------------------------------------------------------- owner billboard (on the north gate post)
    // The board sits clear above the north gate post's cap (top 8.9); its legs stay inside the 0.5 frame.
    const S = L.sign;
    const boardW = 6.6, boardH = 5.6, boardY = 9.6;
    const legZ2 = S.z + 2.6;
    wood.block(GX, 0, legZ2, 0.46, boardY + 0.4, 0.46, '#8a5a34', { ao: 0.3 });
    wood.block(GX, 8.9, gpN, 0.46, boardY - 8.5, 0.46, '#8a5a34', { ao: 0 });
    // camera blocker for the board: above head height and over the fence line, so it never touches a player
    ctx.colliders.push({ minX: GX - 0.3, maxX: GX + 0.3, minY: boardY - 0.25, maxY: boardY + boardH + 0.25, minZ: L.gate.maxZ, maxZ: S.z + 0.2 + boardW / 2 + 0.25, tag: 'sign' });
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

    // countdown display above the south gate post (clear of every fence style's post cap)
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
    cdGroup.position.set(0, 11.2, gpS);
    cdGroup.visible = false;
    group.add(cdGroup);
    let cdShown = -1;
    let cdColor = '#ff5050';
    const drawCountdown = (sec) => {
      const g = cdCanvas.getContext('2d');
      g.fillStyle = '#1a0608';
      g.fillRect(0, 0, 160, 80);
      g.strokeStyle = cdColor;
      g.lineWidth = 5;
      g.strokeRect(4, 4, 152, 72);
      chunkyText(g, `🔒 ${sec}`, 80, 43, { size: 44, fill: cdColor, stroke: '#1a0608', strokeW: 6, shadow: false, maxW: 140 });
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
      for (let k = 0; k < 3; k++) flower(wood, outerX + inw * r.range(1.2, 2.6), 0, fz + r.range(-2, 2), r.pick(['#ff4f7a', '#ffd23f', '#ff8a3a', '#ffffff']), 1.4);
    }

    // accent mesh coloured by the owner (static trim + the styled parts; rebuilt by applyBase)
    const accMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: mats.stud.map, color: new THREE.Color(char.color) });
    const accMesh = new THREE.Mesh(new THREE.BufferGeometry(), accMat);
    accMesh.name = 'garden-accent-' + slot;
    accMesh.castShadow = quality.shadows;
    accMesh.receiveShadow = true;
    accMesh.matrixAutoUpdate = false;
    group.add(accMesh);

    // ---------------------------------------------------------- BASE console (all levels), screen in the atlas
    const CON = L.console;
    const conYaw = Math.atan2(GX - inw * 4 - CON.x, c.z - CON.z); // faces the gate opening and the aisle beyond it
    const conM = trs(CON.x, 0, CON.z, 1, 1, 1, 0, conYaw, 0);
    const conHead = conM.clone().multiply(trs(0, 3.0, 0.05, 1, 1, 1, -0.34, 0, 0));
    const scrGeo = new THREE.PlaneGeometry(1.8, 0.9);
    {
      const U = scrGeo.attributes.uv;
      const n = layout.gardens.length;
      for (let i = 0; i < U.count; i++) U.setY(i, 1 - (slot + 1 - U.getY(i)) / n);
    }
    screenMerger.add(scrGeo, conHead.clone().multiply(trs(0, 0, 0.47, 1, 1, 1)), WH, { ao: 0 });
    // a smaller copy on the back, for people already inside the yard
    screenMerger.add(scrGeo, conHead.clone().multiply(trs(0, 0, -0.47, 0.82, 0.82, 1, 0, Math.PI, 0)), WH, { ao: 0 });

    // fence runs: the outer wall, the two side walls and the gate wall either side of the gate posts
    const segs = [
      mkSeg(outerX, b.minZ, outerX, b.maxZ, [1, 0], inw),
      mkSeg(b.minX, b.minZ, b.maxX, b.minZ, [0, 1], -1),
      mkSeg(b.minX, b.maxZ, b.maxX, b.maxZ, [0, 1], 1),
      Object.assign(mkSeg(GX, b.minZ, GX, gpS - 0.7, [1, 0], -inw), { gate: true }),
      Object.assign(mkSeg(GX, gpN + 0.7, GX, b.maxZ, [1, 0], -inw), { gate: true }),
    ];

    const g = {
      slot, L, inw, segs, acc, accMesh, accMat,
      level: 0, style: null, color: char.color, tier: 0,
      geos: new Map(), water: [], sparks: [],
      decor: [null, null, null, null, null, null], guard: null, guardColor: null, treadmill: null,
      laserMat, conM, conHead, GX, gpS, gpN, boardW, boardH, boardY,
    };
    G.push(g);

    // ---------------------------------------------------------- API
    let owner = char;
    let avatarImg = null;
    let avatarKey = null;
    const redrawSign = () => drawSign(signCanvas, owner, avatarImg, signTex, g.level || 1);
    g.redrawSign = redrawSign;
    g.setCountdownColor = (col) => {
      if (col !== cdColor) {
        cdColor = col;
        cdShown = -1;
      }
    };
    onDisplayFont(() => {
      redrawSign();
      cdShown = -1;
    });
    const lock = { on: false, grow: 0, secs: 0 };
    const cash = { n: -1, coins: -1, bounce: 0 };
    const api = {
      slot,
      planters: planterApis,
      get guard() {
        return g.guard;
      },
      get treadmill() {
        return g.treadmill;
      },
      get base() {
        return { level: g.level, style: g.style };
      },
      get decor() {
        return g.decor.map((d) => d?.obj || null);
      },
      setBase({ level = 1, style = DEFAULT_BASE_STYLE } = {}) {
        const lv = Math.max(1, Math.min(BASE.maxLevel, level | 0 || 1));
        const st = effectiveBaseStyle(style, lv);
        if (lv === g.level && sameBaseStyle(st, g.style)) return;
        applyBase(g, lv, st);
      },
      setTreadmillTier(tier) {
        g.tier = Math.max(0, tier | 0);
        g.treadmill?.setTier?.(g.tier);
      },
      setOwner(ch, avatarUrl) {
        if (ch) owner = ch;
        const col = owner.vacant ? VACANT : owner.color;
        accMat.color.set(col);
        if (ownerColor[slot] !== col) {
          ownerColor[slot] = col;
          lotsDirty = true;
        }
        if (g.color !== col) {
          g.color = col;
          applyBase(g, g.level, g.style);
        }
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
        // decorations
        for (let i = 0; i < g.decor.length; i++) {
          const d = g.decor[i];
          if (d && d.anim) d.obj.userData.update(dt, t);
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
        const s = coins[i];
        _e.set(s.rx, 0, s.rz);
        _q.setFromEuler(_e);
        _p.set(pile.x + s.u * inw, s.y, pile.z + s.z);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        coinMesh.setMatrixAt(id, _m);
      }
      coinMesh.instanceMatrix.needsUpdate = true;
    }
    apis.push(api);
  });

  // ---------------------------------------------------------- applying a base level + style to one garden

  function applyBase(g, level, style) {
    const oldKeys = [...g.geos.keys()];
    g.level = level;
    g.style = style;
    const parts = new Map();
    const P = (key) => {
      let m = parts.get(key);
      if (!m) parts.set(key, (m = new Merger(KEYS[key].opts)));
      return m;
    };
    const acc = new Merger({ uv: 'studs', uvScale: 0.125 });
    const golden = level >= BASE.goldenAt;
    const F = { P, acc, r: makeRand(700 + g.slot * 31), golden, color: g.color, inw: g.inw };
    const { L, inw, GX, gpS, gpN } = g;
    const b = L.bounds, c = L.center;

    // floor (+ the stepping stones from the gate towards the planters)
    const floorTint = style.floor === 'lawn' ? new THREE.Color('#86d863').lerp(new THREE.Color(g.color), 0.1) : WH;
    P('floor:' + style.floor).box(c.x, 0.02, c.z, b.maxX - b.minX, 0.04, b.maxZ - b.minZ, floorTint, { ao: 0 });
    const stoneM = style.floor === 'space' ? P('glow') : P('flat');
    for (let i = 0; i < 4; i++) stoneM.cyl(GX + inw * (5 + i * 3.2), 0.0, c.z + (i % 2 ? 0.8 : -0.8), 1.1, 0.1, STONES[style.floor] || STONES.lawn, { seg: 10, ao: 0 });

    // fence runs + gate posts (with their laser emitters, owner bands and, at the golden level, gold bands)
    const fence = FENCES[style.fence] ? style.fence : 'bamboo';
    for (const s of g.segs) FENCES[fence](F, s);
    const lensCol = laserLensColors(style.laser);
    for (const pz of [gpS, gpN]) {
      const tall = pz === gpN ? 8.4 : 9.2;
      GATES[fence](F, GX, pz, tall, pz === gpN ? 0.85 : 1.2);
      const bandM = golden ? P('gold') : acc;
      const bandC = golden ? GOLD : WH;
      bandM.block(GX, 0.6, pz, 1.66, 0.5, 1.66, bandC, { ao: 0 });
      bandM.block(GX, tall - 1.4, pz, 1.66, 0.5, 1.66, bandC, { ao: 0 });
      if (golden) P('gold').block(GX, 3.55, pz, 1.66, 0.22, 1.66, GOLD, { ao: 0 });
      const face = pz === gpS ? 0.8 : -0.8;
      for (let k = 0; k < BEAMS.length; k++) {
        const y = BEAMS[k];
        P('flat').box(GX, y, pz + face, 0.7, 0.42, 0.3, '#3a3f4a', { ao: 0 });
        P('glow').box(GX, y, pz + face * 1.22, 0.36, 0.22, 0.06, lensCol[k], { ao: 0 });
      }
    }
    // owner sign frame (gold at the golden level)
    (golden ? P('gold') : acc).box(GX, g.boardY + g.boardH / 2, L.sign.z + 0.2, 0.5, g.boardH + 0.5, g.boardW + 0.5, golden ? GOLD : WH, { ao: 0.12 });

    // BASE console
    buildConsole(F, g);

    // decoration spots: open and empty -> a "build here" marker
    const spots = decorSpotsFor(level);
    for (let i = 0; i < L.decor.length; i++) if (i < spots && !style.decor[i]) buildMarker(F, L.decor[i].x, L.decor[i].z);

    // sprinklers
    g.water = [];
    if (level >= BASE.sprinklersAt) buildSprinklers(F, g);
    waterDirty = true;

    // golden sparkles along the fence tops, around the gate posts and over the sign
    g.sparks = [];
    if (golden) {
      const top = FENCE_TOP[fence] || 6.3;
      const density = Math.max(0.4, quality.decorDensity ?? 1);
      for (const s of g.segs) {
        const n = Math.max(1, Math.round((s.len / 2.6) * density));
        for (let i = 0; i < n; i++) {
          const t = (i + F.r()) / n;
          g.sparks.push(s.x(t) + s.nx * F.r.range(-0.6, 0.6), top + F.r.range(0.1, 1.5), s.z(t) + s.nz * F.r.range(-0.6, 0.6), F.r());
        }
      }
      for (const pz of [gpS, gpN]) for (let i = 0; i < 6; i++) g.sparks.push(GX + F.r.range(-1.2, 1.2), F.r.range(1, 9.5), pz + F.r.range(-1.2, 1.2), F.r());
      for (let i = 0; i < 8; i++) g.sparks.push(GX + F.r.range(-0.6, 0.6), g.boardY + F.r.range(-0.3, g.boardH + 0.6), L.sign.z + 0.2 + F.r.range(-3.6, 3.6), F.r());
    }
    sparkDirty = true;

    // bake this garden's part of every shared mesh now (update() only concatenates the gardens' arrays) and mark
    // every key it used before or uses now
    g.geos = new Map();
    for (const [k, m] of parts) if (m.count) g.geos.set(k, m.buildGeometry());
    for (const k of oldKeys) dirtyKeys.add(k);
    for (const k of g.geos.keys()) dirtyKeys.add(k);

    // the owner-colour accent mesh (static trim + styled accents) is this garden's own: rebuild it now
    if (!g.accStatic) g.accStatic = g.acc.buildGeometry();
    g.accMesh.geometry.dispose();
    g.accMesh.geometry = acc.count ? concatGeometries([g.accStatic, acc.buildGeometry()]) : concatGeometries([g.accStatic]);

    // laser colour + countdown
    const lz = LASER[style.laser] || LASER.red;
    const lm = g.laserMat.uniforms;
    lm.uMode.value = style.laser === 'rainbow' ? 1 : style.laser === 'gold' ? 2 : 0;
    const lc = lz.color === 'rainbow' ? '#ffffff' : lz.color;
    lm.uColor.value.set(parseInt(lc.slice(1, 3), 16) / 255, parseInt(lc.slice(3, 5), 16) / 255, parseInt(lc.slice(5, 7), 16) / 255);
    g.setCountdownColor(style.laser === 'red' ? '#ff5050' : style.laser === 'rainbow' ? '#7df9ff' : lc);

    syncObjects(g);
    g.redrawSign();
    drawScreen(g);
  }

  function laserLensColors(id) {
    const def = LASER[id] || LASER.red;
    return BEAMS.map((_, k) => (def.color === 'rainbow' ? new THREE.Color().setHSL(k / BEAMS.length, 1, 0.6) : id === 'red' ? '#ff3a3a' : def.color));
  }

  // A chunky kiosk facing the gate: owner-colour body, a tilted screen (BASE + level), three buttons and a star.
  function buildConsole(F, g) {
    const W = F.P('flat'), N = F.P('glow'), A = F.acc;
    const at = (m, geo, M, lx, ly, lz, sx, sy, sz, color, o = {}) => m.add(geo, M.clone().multiply(trs(lx, ly, lz, sx, sy, sz, o.rx || 0, o.ry || 0, o.rz || 0)), color, o);
    const K = g.conM, H = g.conHead;
    at(W, 'box', K, 0, 0.15, 0, 2.5, 0.3, 1.9, '#2c3440', { ao: 0 });
    at(A, 'box', K, 0, 1.35, -0.05, 1.9, 2.1, 1.2, WH, { ao: 0.3 });
    at(W, 'box', K, 0, 0.62, -0.05, 1.96, 0.2, 1.26, WH, { ao: 0 });
    at(W, 'box', K, 0, 2.28, 0.66, 1.8, 0.14, 0.42, '#e8ecf4', { ao: 0 });
    ['#ff4f6a', '#ffd23f', '#4cd964'].forEach((col, i) => at(N, 'hemi', K, (i - 1) * 0.5, 2.34, 0.7, 0.32, 0.24, 0.32, col, { ao: 0 }));
    at(A, 'box', H, 0, 0, -0.02, 2.2, 1.3, 0.8, WH, { ao: 0.1 });
    at(W, 'box', H, 0, 0, 0.38, 2.02, 1.08, 0.12, '#1b2440', { ao: 0 });
    at(W, 'box', H, 0, 0, -0.42, 1.66, 0.9, 0.08, '#1b2440', { ao: 0 });
    at(W, 'box', H, 0, 0.72, -0.02, 2.3, 0.16, 0.9, WH, { ao: 0 });
    // star on a little post
    at(W, 'cyl:6', K, 0, 4.0, -0.1, 0.14, 0.7, 0.14, '#c9ced6', { ao: 0 });
    at(F.golden ? F.P('gold') : N, starGeo(), K, 0, 4.72, -0.1, 1.25, 1.25, 1.25, GOLD, { ao: 0 });
  }

  // A subtle round "build here" stone with a plus in the owner's colour and corner pegs of the 5x5 spot.
  function buildMarker(F, x, z) {
    const W = F.P('flat');
    W.cyl(x, 0, z, 1.45, 0.08, '#cbc5b6', { seg: 20, ao: 0 });
    W.cyl(x, 0.02, z, 1.2, 0.08, '#ebe6d9', { seg: 20, ao: 0 });
    F.acc.box(x, 0.11, z, 1.0, 0.04, 0.28, WH, { ao: 0 });
    F.acc.box(x, 0.11, z, 0.28, 0.04, 1.0, WH, { ao: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) W.cyl(x + sx * 2.2, 0, z + sz * 2.2, 0.15, 0.32, '#cbc5b6', { seg: 6, ao: 0.2 });
  }

  // Sprinkler heads between the two planter columns, each watering its four neighbouring planters.
  function buildSprinklers(F, g) {
    const W = F.P('flat');
    const Ps = g.L.planters.filter((p) => p.lot < 0);
    const xA = Ps[0].x, xB = Ps[1].x, hx = (xA + xB) / 2;
    const rows = [...new Set(Ps.map((p) => p.z))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < rows.length; i++) {
      const hz = (rows[i] + rows[i + 1]) / 2;
      W.cyl(hx, 0, hz, 0.36, 0.08, '#2f6a3a', { seg: 10, ao: 0 });
      W.cyl(hx, 0.08, hz, 0.12, 0.56, '#9aa3b0', { seg: 8, ao: 0.1 });
      W.cyl(hx, 0.62, hz, 0.2, 0.16, '#e0b040', { seg: 8, ao: 0 });
      const phase = F.r();
      for (const tx of [xA, xB]) {
        for (const tz of [rows[i], rows[i + 1]]) g.water.push({ x0: hx, y0: 0.8, z0: hz, x1: tx, y1: 1.35, z1: tz, apex: 2.3, ph: phase + F.r() * 0.3 });
      }
    }
  }

  // Decorations, the Guard Gnome and the home treadmill: real objects from their modules, kept while unchanged.
  function syncObjects(g) {
    const { L, inw, level, style, color } = g;
    const yaw = -inw * Math.PI / 2; // front (+Z) towards the gate
    for (let i = 0; i < g.decor.length; i++) {
      const id = style.decor[i] || null;
      const key = id ? id + '|' + color : null;
      const cur = g.decor[i];
      if (cur && cur.key === key) continue;
      if (cur) group.remove(cur.obj);
      g.decor[i] = null;
      if (!id || !L.decor[i]) continue;
      let obj = null;
      try {
        obj = createDecor(id, { color, quality });
      } catch (e) {
        console.error('[gardens] decor failed', id, e);
      }
      if (!obj) continue;
      obj.position.set(L.decor[i].x, 0, L.decor[i].z);
      obj.rotation.y = yaw;
      group.add(obj);
      g.decor[i] = { key, obj, anim: typeof obj.userData?.update === 'function' };
    }
    const wantGuard = level >= BASE.guardAt;
    if (g.guard && (!wantGuard || g.guardColor !== color)) {
      group.remove(g.guard.object3d);
      g.guard = null;
    }
    if (wantGuard && !g.guard) {
      try {
        g.guard = createGuardGnome({ color });
        g.guardColor = color;
        g.guard.object3d.position.set(L.guard.x, 0, L.guard.z);
        g.guard.object3d.rotation.y = yaw;
        group.add(g.guard.object3d);
      } catch (e) {
        console.error('[gardens] guard failed', e);
        g.guard = null;
      }
    }
    const wantMill = level >= BASE.treadmillAt;
    if (g.treadmill && !wantMill) {
      group.remove(g.treadmill.object3d);
      g.treadmill = null;
    }
    if (wantMill && !g.treadmill) {
      const T = L.treadmill;
      try {
        g.treadmill = createTreadmill({ tier: g.tier, len: T.len, w: T.w, quality });
        g.treadmill.object3d.position.set(T.x, 0, T.z);
        g.treadmill.object3d.rotation.y = Math.atan2(T.dirX, T.dirZ);
        group.add(g.treadmill.object3d);
      } catch (e) {
        console.error('[gardens] treadmill failed', e);
        g.treadmill = null;
      }
    }
  }

  function drawScreen(g) {
    const cv = screenCanvas.getContext('2d');
    const oy = g.slot * SCR_H;
    const col = g.color;
    cv.save();
    cv.translate(0, oy);
    cv.fillStyle = '#10162c';
    cv.fillRect(0, 0, SCR_W, SCR_H);
    const sheen = cv.createLinearGradient(0, 0, 0, SCR_H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.1)');
    cv.fillStyle = sheen;
    cv.fillRect(0, 0, SCR_W, SCR_H);
    roundRect(cv, 6, 6, SCR_W - 12, SCR_H - 12, 16);
    cv.lineWidth = 8;
    cv.strokeStyle = col;
    cv.stroke();
    const max = g.level >= BASE.maxLevel;
    chunkyText(cv, 'BASE', SCR_W / 2, 38, { size: 42, fill: col, stroke: '#ffffff', strokeW: 7, shadow: false, maxW: SCR_W - 40 });
    chunkyText(cv, max ? 'LEVEL MAX' : 'LEVEL ' + (g.level || 1), SCR_W / 2, 88, { size: 38, fill: max ? '#ffe066' : '#ffd23f', stroke: '#1b2440', strokeW: 7, maxW: SCR_W - 34 });
    cv.restore();
    screenTex.needsUpdate = true;
  }

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

  // owner flags (one instanced mesh, gently waving)
  const bc = new THREE.Color();
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
  add(soil.build(soilMat, { name: 'garden-soil' }));
  add(wood.build(mats.flat, { name: 'garden-wood', castShadow: quality.shadows }));
  const screens = screenMerger.build(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), { name: 'garden-console-screens' });
  screens.receiveShadow = false;
  add(screens);

  // every garden starts at level 1 with the default look, fully built
  for (const g of G) applyBase(g, 1, effectiveBaseStyle(DEFAULT_BASE_STYLE, 1));
  flushStyles();
  onDisplayFont(() => G.forEach(drawScreen));

  return {
    gardens: apis,
    update(dt, t) {
      if (lotsDirty) {
        lotsDirty = false;
        buildLots();
      }
      if (dirtyKeys.size || waterDirty || sparkDirty) flushStyles();
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

// ------------------------------------------------------------------ geometry concat

// Joins Merger-built geometries (position, normal, uv, color + index) into one.
function concatGeometries(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) {
    nv += g.attributes.position.count;
    ni += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(nv * size);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let io = 0, vo = 0;
  for (const g of geos) {
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    io += src.length;
    vo += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ------------------------------------------------------------------ sprinkler water + sparkle geometry

// Each arc a thin tube along a parabola from the nozzle to a planter; uv.x runs along it.
function waterGeometry(arcs) {
  const SEG = 14, RAD = 4, R0 = 0.11;
  const n = arcs.length * (SEG + 1) * (RAD + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), head = new Float32Array(n * 3);
  const idx = [];
  const p = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (const a of arcs) {
    const base = k;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      p.set(a.x0 + (a.x1 - a.x0) * t, a.y0 + (a.y1 - a.y0) * t + 4 * a.apex * t * (1 - t), a.z0 + (a.z1 - a.z0) * t);
      tan.set(a.x1 - a.x0, a.y1 - a.y0 + 4 * a.apex * (1 - 2 * t), a.z1 - a.z0).normalize();
      side.crossVectors(tan, Y).normalize();
      up.crossVectors(side, tan).normalize();
      const rad = R0 * (1 + t * 0.8);
      for (let j = 0; j <= RAD; j++) {
        const ang = (j / RAD) * TAU;
        const cx = Math.cos(ang) * rad, cy = Math.sin(ang) * rad;
        pos[k * 3] = p.x + side.x * cx + up.x * cy;
        pos[k * 3 + 1] = p.y + side.y * cx + up.y * cy;
        pos[k * 3 + 2] = p.z + side.z * cx + up.z * cy;
        uv[k * 2] = t;
        uv[k * 2 + 1] = j / RAD;
        head[k * 3] = a.x0;
        head[k * 3 + 1] = a.z0;
        head[k * 3 + 2] = a.ph;
        k++;
      }
    }
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < RAD; j++) {
        const a0 = base + i * (RAD + 1) + j, a1 = a0 + RAD + 1;
        idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  if (!n) return g;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aHead', new THREE.BufferAttribute(head, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// flat [x, y, z, phase, x, y, z, phase, ...]
function sparkleGeometry(list) {
  const g = new THREE.BufferGeometry();
  const n = list.length / 4;
  if (!n) return g;
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = list[i * 4];
    pos[i * 3 + 1] = list[i * 4 + 1];
    pos[i * 3 + 2] = list[i * 4 + 2];
    ph[i] = list[i * 4 + 3];
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ billboard

// An online room's garden nobody plays (fewer computer players): grey trim and a FREE GARDEN sign.
const VACANT = '#9aa3b2';

function drawSign(canvas, char, img, tex, level = 1) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const col = char.vacant ? VACANT : char.color;
  const golden = level >= BASE.goldenAt;
  g.fillStyle = '#1b2440';
  g.fillRect(0, 0, W, H);
  // board (a gold frame at the golden base level)
  roundRect(g, 6, 6, W - 12, H - 12, 46);
  if (golden) {
    const gg = g.createLinearGradient(0, 0, W, H);
    gg.addColorStop(0, '#fff3a8');
    gg.addColorStop(0.35, '#ffd23f');
    gg.addColorStop(0.65, '#f0a818');
    gg.addColorStop(1, '#ffe27a');
    g.fillStyle = gg;
  } else g.fillStyle = col;
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
  if (golden) {
    g.lineWidth = 5;
    g.strokeStyle = col;
    g.stroke();
  }
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
    const initials = char.vacant ? '?' : char.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    chunkyText(g, initials, cx, cy + 6, { size: 120, fill: '#ffffff', stroke: '#1b2440', strokeW: 16 });
  }
  g.restore();
  // "DORIAN'S" / "GARDEN"
  chunkyText(g, char.vacant ? 'FREE' : char.name.toUpperCase() + "'S", cx, 344, { size: 76, fill: col, stroke: '#1b2440', strokeW: 15, maxW: W - 80 });
  chunkyText(g, 'GARDEN', cx, 400, { size: 40, fill: '#1b2440', stroke: '#ffffff', strokeW: 8, shadow: false });
  if (!char.vacant) drawLevelBadge(g, W - 84, 86, 72, level);
  tex.needsUpdate = true;
}

// Star badge "LV 7" in the sign's top-right corner.
function drawLevelBadge(g, x, y, R, level) {
  const star = (ox, oy) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? R * 0.58 : R;
      g.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
    }
    g.closePath();
  };
  g.save();
  g.lineJoin = 'round';
  star(x, y + 6);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fill();
  star(x, y);
  const gr = g.createLinearGradient(0, y - R, 0, y + R);
  gr.addColorStop(0, '#fff6b0');
  gr.addColorStop(0.5, '#ffd23f');
  gr.addColorStop(1, '#ff9a1a');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#1b2440';
  g.stroke();
  chunkyText(g, 'LV', x, y - R * 0.13, { size: R * 0.3, fill: '#1b2440', stroke: '#fff6c8', strokeW: 4, shadow: false });
  chunkyText(g, String(level), x, y + R * 0.27, { size: R * 0.52, fill: '#ffffff', stroke: '#1b2440', strokeW: 9, shadow: false, maxW: R * 0.95 });
  g.restore();
}

// ------------------------------------------------------------------ FOR SALE sign

function drawSaleSign(canvas, lot, oy, H) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  g.save();
  g.translate(0, oy);
  g.fillStyle = '#6b4424';
  g.fillRect(0, 0, W, H);
  roundRect(g, 8, 8, W - 16, H - 16, 26);
  g.fillStyle = '#e8364a';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#1b2440';
  g.stroke();
  roundRect(g, 24, 118, W - 48, 98, 18);
  g.fillStyle = '#fffdf6';
  g.fill();
  chunkyText(g, 'FOR SALE', W / 2, 66, { size: 70, fill: '#ffffff', stroke: '#1b2440', strokeW: 13, maxW: W - 50 });
  chunkyText(g, `LOT ${lot + 1}: +${LOTS.planters} PLANTERS`, W / 2, 146, { size: 30, fill: '#1b2440', stroke: '#fffdf6', strokeW: 4, shadow: false, maxW: W - 70 });
  chunkyText(g, '$' + short(LOTS.cost[lot]), W / 2, 188, { size: 42, fill: '#1f9c46', stroke: '#fffdf6', strokeW: 5, shadow: false, maxW: W - 70 });
  g.restore();
}

// 500000 -> 500K, 3000000 -> 3M (the sign only needs round prices)
const short = (n) => (n >= 1e9 ? n / 1e9 + 'B' : n >= 1e6 ? n / 1e6 + 'M' : n >= 1e3 ? n / 1e3 + 'K' : String(n));

// ------------------------------------------------------------------ planter box

// One planter at (x, z): frame boards, rim, corner posts (into `woodM`), the owner band on the aisle-facing board
// (into `bandM`, colour `band`) and the soil with `lumps` little mounds (into `soilM`).
function planterBox(woodM, soilM, bandM, x, z, inw, band, lumps, r) {
  const bw = 4.8, bh = 1.2, t = 0.34;
  for (const s of [-1, 1]) {
    woodM.block(x + s * (bw / 2 - t / 2), 0, z, t, bh, bw, '#b0743e', { ao: 0.35 });
    woodM.block(x, 0, z + s * (bw / 2 - t / 2), bw - 2 * t, bh, t, '#b0743e', { ao: 0.35 });
    // rim
    woodM.block(x + s * (bw / 2 - 0.2), bh, z, 0.5, 0.18, bw + 0.2, '#d09058', { ao: 0 });
    woodM.block(x, bh, z + s * (bw / 2 - 0.2), bw - 0.6, 0.18, 0.5, '#d09058', { ao: 0 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) woodM.block(x + sx * 2.3, 0, z + sz * 2.3, 0.5, 1.5, 0.5, '#8a5a2a', { ao: 0.2 });
  bandM.box(x - inw * (bw / 2 + 0.02), 0.62, z, 0.06, 0.34, bw - 0.9, band, { ao: 0 });
  soilM.box(x, 1.1, z, bw - 2 * t, 0.2, bw - 2 * t, '#ffffff', { ao: 0 });
  for (let k = 0; k < lumps; k++) soilM.prim('sphere:6', x + r.range(-1.4, 1.4), 1.18, z + r.range(-1.4, 1.4), r.range(0.5, 0.9), 0.22, r.range(0.5, 0.9), '#ffffff', { ao: 0 });
}
