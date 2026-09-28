// Egg drops: an egg floating down under a bunch of balloons, a light beam + ground ring marking where it
// will land (visible from far away), then a glowing egg that wobbles on the ground and blinks before it
// floats away. OWNER: eggs agent. Contract:
//   createDropView(eggId) -> {object3d, update(dt, t, {y, landed, expiring}), dispose()}
//     object3d: place at the drop's ground point (x, 0, z); y = the egg's current height above the ground.
//     expiring: 0..1 during the last seconds on the ground (blink faster), 0 otherwise.
//
// Look: the egg hangs under 4 balloons (6 rainbow ones for the Rainbow Egg) and sways as it falls, inside a
// tall additive light beam in the egg's colour; a ground ring the size of the pickup circle pulses where
// it will land. On touchdown the egg squashes, a shockwave ring runs out and the balloons float off and pop.
// On the ground it hovers in its glowing ring, bobs, spins, wobbles now and then (something wants out!)
// with sparkles orbiting it. `expiring` blinks it faster and fades the glow. The Rainbow Egg gets a
// wider rainbow beam, a rainbow ring and sparkles spiralling up the beam.
//
// Cost: at most 4 draw calls per drop (egg, balloons, glow fx, shadow). Every geometry and material is
// shared by all drops: the glow fx is one additive shader for every egg type whose per-drop values
// (colour, time, height, fade) are set in onBeforeRender. No allocations per frame.
import * as THREE from 'three';
import { EGG } from './catalog.js';
import { createEgg } from './eggs.js';
import { Merger } from '../world/kit.js';

const EGG_SCALE = 2.4; // studs tall
const PIVOT = 1.4; // the fall sways around a point this far above the egg's top (in the strings)
const BEAM_H = 140;
const BEAM_R = 2.1;
const RING_R = 5.4; // ground disc radius; its bright ring sits at ~2.8 = the pickup circle
const TAU = Math.PI * 2;

// beam colour (A) and highlight (B) per egg; unknown eggs use their catalog accent colour
const GLOW = {
  garden: ['#6fe04a', '#eaffd0'],
  farm: ['#ff6a5a', '#fff0d0'],
  jungle: ['#ffd23f', '#b8ff8a'],
  ocean: ['#3fc8ff', '#d8f8ff'],
  volcano: ['#ff6a1a', '#ffe08a'],
  galaxy: ['#d45cff', '#ffc8f4'],
  frost: ['#6fd8ff', '#ffffff'],
  candy: ['#ff7ac8', '#b8f0ff'],
  cloud: ['#ffe75e', '#ffffff'],
  rainbow: ['#ff5c8a', '#ffffff'],
};

// ------------------------------------------------------------------ shared glow fx (beam + ground + sparkles)

const K_BEAM = 0, K_GROUND = 1, K_SPARK = 2, K_HALO = 3, K_SPIRAL = 4;

function fxGeometry(rainbow) {
  const pos = [], nor = [], uv = [], data = [], idx = [];
  const push = (p, n, u, d) => {
    pos.push(...p);
    nor.push(...n);
    uv.push(...u);
    data.push(...d);
  };
  // beam: two open cylinders (soft outer glow + a bright core); data.z = 1 for the core
  for (const [r, core] of [[BEAM_R, 0], [BEAM_R * 0.34, 1]]) {
    const seg = 16, base = pos.length / 3;
    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU;
        push([Math.sin(a) * r, j * BEAM_H, Math.cos(a) * r], [Math.sin(a), 0, Math.cos(a)], [i / seg, j], [K_BEAM, 0, core, 0]);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  // ground disc (the shader draws the rings from the radius)
  {
    const seg = 48, base = pos.length / 3;
    push([0, 0.15, 0], [0, 1, 0], [0.5, 0.5], [K_GROUND, 0, 0, 0]);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      push([Math.sin(a) * RING_R, 0.15, Math.cos(a) * RING_R], [0, 1, 0], [i / seg, 1], [K_GROUND, 0, 0, 0]);
    }
    for (let i = 0; i < seg; i++) idx.push(base, base + 1 + i, base + 2 + i);
  }
  // camera-facing quads: the corner comes from uv, the centre is computed in the vertex shader
  const quad = (d) => {
    const base = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) push([0, 0, 0], [0, 0, 1], [u, v], d);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const nSpark = rainbow ? 16 : 12;
  for (let i = 0; i < nSpark; i++) quad([K_SPARK, (i * 0.618) % 1, (i / nSpark) * TAU, 1.7 + (i % 3) * 0.35]);
  quad([K_HALO, 0, 0, 0]);
  if (rainbow) for (let i = 0; i < 28; i++) quad([K_SPIRAL, (i * 0.37) % 1, i / 28, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aData', new THREE.Float32BufferAttribute(data, 4));
  g.setIndex(idx);
  // billboards move with the egg: make sure the whole beam column counts for culling
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, BEAM_H / 2, 0), BEAM_H / 2 + RING_R);
  g.userData.shared = true;
  return g;
}

const VERT = /* glsl */ `
attribute vec4 aData;
uniform float uTime, uEggY, uLand, uRainbow;
varying vec2 vUv;
varying vec4 vData;
varying vec3 vN;
varying vec3 vV;
varying float vR;
void main() {
  vUv = uv;
  vData = aData;
  vN = vec3(0.0);
  vV = vec3(0.0, 0.0, 1.0);
  vR = 0.0;
  float kind = aData.x;
  vec4 mv;
  if (kind < 0.5) {
    vec3 p = position;
    p.xz *= 1.0 + uRainbow * 0.4 * (1.0 - aData.z);
    mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
  } else if (kind < 1.5) {
    vUv = position.xz / ${RING_R.toFixed(2)};
    vR = length(vUv);
    mv = modelViewMatrix * vec4(position, 1.0);
  } else {
    float eggC = uEggY + ${(EGG_SCALE * 0.5).toFixed(2)};
    vec3 c;
    float size;
    if (kind < 2.5) {
      float a = aData.z + uTime * (0.7 + aData.y * 0.8);
      float r = aData.w * (0.85 + 0.15 * uLand);
      c = vec3(cos(a) * r, eggC + sin(uTime * 1.7 + aData.y * 9.0) * 1.1, sin(a) * r);
      size = (0.35 + 0.35 * uLand) * (0.7 + 0.6 * fract(aData.y * 7.3));
    } else if (kind < 3.5) {
      c = vec3(0.0, eggC, 0.0);
      size = 5.2 + uLand * 1.2;
    } else {
      float h = fract(aData.z + uTime * 0.07);
      float a = h * 26.0 + aData.y * 6.2832;
      c = vec3(cos(a) * 2.6, h * ${(BEAM_H * 0.55).toFixed(1)}, sin(a) * 2.6);
      size = 0.9 * (1.0 - h * 0.6);
      vR = h;
    }
    mv = modelViewMatrix * vec4(c, 1.0);
    mv.xy += (uv - 0.5) * size;
  }
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uTime, uLand, uFade, uPulse, uRainbow, uEggY;
uniform vec3 uColA, uColB;
varying vec2 vUv;
varying vec4 vData;
varying vec3 vN;
varying vec3 vV;
varying float vR;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
float star(vec2 p) {
  p = abs(p);
  float arms = max(0.0, 1.0 - p.x * 9.0) * max(0.0, 1.0 - p.y * 2.1) + max(0.0, 1.0 - p.y * 9.0) * max(0.0, 1.0 - p.x * 2.1);
  return clamp(arms + max(0.0, 1.0 - length(p) * 4.5), 0.0, 1.0);
}
void main() {
  float kind = vData.x;
  vec3 col;
  float a;
  float occ; // how much of what is behind it this glow covers (0 = purely additive)
  if (kind < 0.5) {
    float h = vUv.y;
    float edge = abs(dot(normalize(vN), normalize(vV)));
    float core = vData.z;
    float vert = (1.0 - smoothstep(0.25, 1.0, h)) * (0.55 + 0.45 * smoothstep(0.0, 0.03, h));
    float flow = 0.75 + 0.25 * sin(h * 110.0 - uTime * 5.0 + vUv.x * 12.566);
    a = pow(edge, core > 0.5 ? 1.3 : 2.0) * vert * flow * (core > 0.5 ? 0.7 : 0.6) * (1.0 - 0.3 * uLand);
    col = mix(uColA, uColB, core * 0.4);
    if (uRainbow > 0.5) col = mix(hue(h * 4.0 - uTime * 0.3 + vUv.x), vec3(1.0), core * 0.3);
    occ = 0.75;
    // thin out round the egg (and its balloons while it falls) so they are not washed over
    float y = h * ${BEAM_H.toFixed(1)};
    float lo = uEggY - 0.6, hi = uEggY + ${(EGG_SCALE + 0.4).toFixed(2)} + (1.0 - uLand) * 5.2;
    a *= 1.0 - 0.7 * smoothstep(lo - 1.5, lo, y) * (1.0 - smoothstep(hi, hi + 1.5, y));
  } else if (kind < 1.5) {
    float r = vR;
    float ang = atan(vUv.y, vUv.x) / 6.2832 + 0.5;
    // the pickup ring (~2.8 studs), thin while the egg falls, bold once it sits in it
    float ring = smoothstep(0.045 + 0.03 * uLand, 0.0, abs(r - 0.52)) * (0.75 + 0.35 * uLand);
    // falling: a dashed target ring turning round the spot + ripples running in towards it
    float dash = step(0.45, fract(ang * 18.0 + uTime * 0.35));
    float target = smoothstep(0.03, 0.0, abs(r - 0.82)) * dash * (1.0 - uLand) * 0.9;
    float rip = fract(r * 2.2 + uTime * (0.9 - 1.5 * uLand));
    float ripples = smoothstep(0.75, 1.0, rip) * (1.0 - smoothstep(0.55, 1.0, r)) * (0.35 + 0.15 * uLand);
    float inner = (1.0 - smoothstep(0.0, 0.52, r)) * (0.18 + 0.32 * uLand);
    // touchdown shockwave
    float shock = smoothstep(0.06, 0.0, abs(r - (0.3 + uPulse * 0.75))) * (1.0 - uPulse) * step(0.0, uPulse) * step(uPulse, 1.0) * 1.3;
    a = (ring + target + ripples + inner + shock) * (1.0 - smoothstep(0.9, 1.0, r));
    occ = 0.45;
    col = mix(uColA, uColB, clamp(ring * 0.5 + shock, 0.0, 1.0));
    if (uRainbow > 0.5) col = mix(hue(r * 1.6 - uTime * 0.4 + ang), vec3(1.0), clamp(shock, 0.0, 1.0) * 0.6);
  } else if (kind < 2.5) {
    float tw = 0.55 + 0.45 * sin(uTime * 7.0 + vData.y * 40.0);
    a = star(vUv - 0.5) * tw;
    col = mix(uColB, vec3(1.0), 0.5);
    occ = 0.2;
    if (uRainbow > 0.5) col = mix(hue(vData.y + uTime * 0.2), vec3(1.0), 0.35);
  } else if (kind < 3.5) {
    float d = length(vUv - 0.5) * 2.0;
    a = pow(max(0.0, 1.0 - d), 2.2) * (0.38 + 0.3 * uLand);
    col = mix(uColA, uColB, 0.35);
    occ = 0.25;
    if (uRainbow > 0.5) col = mix(hue(uTime * 0.25), vec3(1.0), 0.45);
  } else {
    float tw = 0.6 + 0.4 * sin(uTime * 9.0 + vData.y * 30.0);
    a = star(vUv - 0.5) * tw * (1.0 - vR) * 1.2;
    col = mix(hue(vR * 2.0 + vData.y), vec3(1.0), 0.3);
    occ = 0.2;
  }
  // premultiplied output: the glow adds its colour and dims the background by occ (reads on a bright sky too)
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  float k = clamp(a * uFade, 0.0, 1.0);
  gl_FragColor = vec4(gl_FragColor.rgb * k, k * occ);
}`;

let FX = null;
function fxShared() {
  if (FX) return FX;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEggY: { value: 0 },
      uLand: { value: 0 },
      uFade: { value: 1 },
      uPulse: { value: -1 },
      uRainbow: { value: 0 },
      uColA: { value: new THREE.Color() },
      uColB: { value: new THREE.Color() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.FrontSide,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  FX = { mat, geo: fxGeometry(false), geoRainbow: fxGeometry(true) };
  return FX;
}

// ------------------------------------------------------------------ shared balloons + shadow

const BALLOONS = {
  normal: ['#ff4f6d', '#ffd23f', '#3db8ff', '#5ee07a'],
  rainbow: ['#ff3b5c', '#ff8a1c', '#ffd21c', '#3fcf5a', '#1fb2ff', '#b44dff'],
};
const BAL = {};
let balloonMat = null;

/** A bunch of balloons whose strings meet at y = 0 (tied to the egg's top). */
function balloonGeometry(kind) {
  if (BAL[kind]) return BAL[kind];
  const cols = BALLOONS[kind];
  const m = new Merger();
  const n = cols.length;
  cols.forEach((c, i) => {
    const a = (i / n) * TAU + 0.4;
    const spread = n > 4 ? 1.35 : 1.1;
    const x = Math.sin(a) * spread, z = Math.cos(a) * spread * 0.75;
    const y = 4.3 + (i % 2) * 0.55;
    m.prim('sphere:14', x, y, z, 1.45, 1.7, 1.45, c, { ao: 0.25 });
    m.prim('sphere:8', x - 0.32, y + 0.42, z + 0.42, 0.34, 0.46, 0.2, '#ffffff', { ao: 0, ry: -a * 0.2 });
    m.prim('cone:6', x, y - 0.93, z, 0.3, 0.26, 0.3, c, { rx: Math.PI, ao: 0 });
    m.beam(x, y - 1.05, z, 0, 0.05, 0, 0.05, '#fdfdfd', { ao: 0 });
  });
  // a little bow where the strings are tied
  m.prim('sphere:8', 0, 0.06, 0, 0.26, 0.2, 0.26, '#ff5ab4', { ao: 0 });
  for (const s of [-1, 1]) m.prim('sphere:6', s * 0.2, 0.1, 0, 0.26, 0.16, 0.12, '#ff5ab4', { rz: s * 0.5, ao: 0 });
  const g = m.buildGeometry();
  g.userData.shared = true;
  BAL[kind] = g;
  return g;
}

let SHADOW = null;
function shadowShared() {
  return (SHADOW ||= {
    geo: new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
    mat: new THREE.MeshBasicMaterial({ color: 0x0a1030, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  });
}

// ------------------------------------------------------------------ the view

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createDropView(eggId) {
  const id = EGG[eggId] ? eggId : 'garden';
  const rainbow = id === 'rainbow';
  const fx = fxShared();
  const object3d = new THREE.Group();
  object3d.name = 'egg-drop:' + id;

  // glow fx: beam, ground ring, sparkles, halo (one draw call)
  const glow = new THREE.Mesh(rainbow ? fx.geoRainbow : fx.geo, fx.mat);
  glow.renderOrder = 5;
  glow.frustumCulled = true;
  object3d.add(glow);
  const [ca, cb] = GLOW[id] || [EGG[id].colors?.[1] || '#ffffff', '#ffffff'];
  const colA = new THREE.Color(ca), colB = new THREE.Color(cb);

  const sh = shadowShared();
  const shadow = new THREE.Mesh(sh.geo, sh.mat);
  shadow.position.y = 0.12;
  shadow.renderOrder = 4;
  object3d.add(shadow);

  // the swing hangs from a point in the strings; the egg hangs below it, the balloons float above
  const swing = new THREE.Group();
  object3d.add(swing);
  const egg = createEgg(id);
  egg.scale.setScalar(EGG_SCALE);
  egg.position.y = -(EGG_SCALE + PIVOT);
  egg.traverse((o) => (o.castShadow = false));
  swing.add(egg);
  balloonMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.02 });
  const balloons = new THREE.Mesh(balloonGeometry(rainbow ? 'rainbow' : 'normal'), balloonMat);
  balloons.position.y = -PIVOT;
  swing.add(balloons);

  // per-drop state (numbers only: read by onBeforeRender)
  const st = { t: 0, eggY: 0, land: 0, fade: 1, pulse: -1, seen: false, landT: -1, gone: false, blink: 0, phase: Math.random() * 10 };
  glow.onBeforeRender = () => {
    const u = fx.mat.uniforms;
    u.uTime.value = st.t;
    u.uEggY.value = st.eggY;
    u.uLand.value = st.land;
    u.uFade.value = st.fade;
    u.uPulse.value = st.pulse;
    u.uRainbow.value = rainbow ? 1 : 0;
    u.uColA.value.copy(colA);
    u.uColB.value.copy(colB);
    fx.mat.uniformsNeedUpdate = true;
  };

  return {
    object3d,
    update(dt, t, { y = 0, landed = false, expiring = 0 } = {}) {
      const tt = t + st.phase;
      st.t = tt;
      if (landed && st.landT < 0) {
        st.landT = t;
        if (!st.seen) st.gone = true; // arrived already on the ground: no balloons to let go of
      }
      if (!landed && st.landT >= 0 && y > 0.5) st.landT = -1; // lifted off again (floating away)
      st.seen = true;
      const since = st.landT >= 0 ? t - st.landT : -1;
      const onGround = since >= 0;
      st.land += ((onGround ? 1 : 0) - st.land) * clamp01(dt * 4);
      if (!dt) st.land = onGround ? 1 : 0;
      st.pulse = onGround && since < 1 ? since : -1;

      // ---- egg
      let ey = y, sy = 1, sxz = 1;
      if (!onGround) {
        swing.rotation.z = Math.sin(tt * 1.25) * 0.13;
        swing.rotation.x = Math.sin(tt * 0.95 + 1) * 0.08;
        egg.rotation.set(0, tt * 0.5, 0);
      } else {
        swing.rotation.z *= 1 - clamp01(dt * 8);
        swing.rotation.x *= 1 - clamp01(dt * 8);
        if (!dt) swing.rotation.set(0, 0, 0);
        const hover = clamp01(since / 0.6);
        ey = y + hover * (0.35 + Math.sin(tt * 2.1) * 0.18);
        if (since < 0.4) {
          const k = Math.sin((since / 0.4) * Math.PI);
          sy = 1 - 0.24 * k;
          sxz = 1 + 0.12 * k;
        }
        // now and then a wobble, as if something inside wants out
        const w = (tt % 2.8) / 0.7;
        const wob = w < 1 ? Math.sin(w * Math.PI * 5) * 0.2 * Math.sin(w * Math.PI) : 0;
        egg.rotation.set(wob * 0.4, tt * 0.8, wob);
      }
      egg.position.y = -(EGG_SCALE + PIVOT) + (ey - y);
      egg.scale.set(EGG_SCALE * sxz, EGG_SCALE * sy, EGG_SCALE * sxz);
      swing.position.y = y + EGG_SCALE + PIVOT;
      st.eggY = ey;

      // ---- balloons: ride along while falling; on touchdown they float off, drift and pop
      if (st.gone) balloons.visible = false;
      else if (onGround) {
        const u = since / 2.6;
        if (u >= 1) {
          st.gone = true;
          balloons.visible = false;
        } else {
          balloons.visible = true;
          balloons.position.set(Math.sin(u * 3) * 1.2 * u, -PIVOT + u * u * 16 + u * 4, u * 1.5);
          balloons.rotation.set(0, u * 2.4, Math.sin(u * 7) * 0.12);
          const pop = u > 0.9 ? 1 + (u - 0.9) * 4 : 1; // puff up just before they pop
          balloons.scale.setScalar(pop);
        }
      } else {
        balloons.visible = true;
        balloons.position.set(0, -PIVOT, 0);
        balloons.rotation.set(0, Math.sin(tt * 0.6) * 0.3, 0);
        balloons.scale.setScalar(1);
      }

      // ---- shadow: small and faint high up, full size near the ground
      const near = clamp01(1 - ey / 45);
      shadow.scale.setScalar(0.5 + near * 0.9 + (onGround ? Math.sin(tt * 2.1) * -0.06 : 0));
      shadow.visible = near > 0.05;

      // ---- expiring: blink faster and fade
      let fade = 1;
      if (expiring > 0) {
        st.blink += dt * (2 + expiring * 9);
        const on = st.blink % 1 < 0.78 - expiring * 0.38;
        egg.visible = on;
        fade = (1 - expiring * 0.7) * (on ? 1 : 0.4);
      } else {
        st.blink = 0;
        egg.visible = true;
      }
      st.fade = fade;
    },
    dispose() {
      object3d.parent?.remove(object3d);
      glow.onBeforeRender = () => {};
    },
  };
}
