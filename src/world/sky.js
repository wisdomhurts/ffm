// Sky dome (gradient, sun/moon, stars, galaxy), blocky clouds, per-biome ambience blending and
// weather (Golden Hour, Diamond Night, Rainbow Rain) with camera-following particle fields.
import * as THREE from 'three';
import { Merger, makeRand, uTime } from './kit.js';

// ------------------------------------------------------------------ palettes

const C = (h) => new THREE.Color(h);
function palette(p) {
  return {
    skyTop: C(p.skyTop), skyHorizon: C(p.skyHorizon), fog: C(p.fog), fogNear: p.fogNear, fogFar: p.fogFar,
    hemiSky: C(p.hemiSky), hemiGround: C(p.hemiGround), hemi: p.hemi, sun: C(p.sun), sunI: p.sunI,
    sunDir: new THREE.Vector3(...(p.sunDir || [40, 80, -30])).normalize(), sunGlow: C(p.sunGlow || p.sun),
    stars: p.stars || 0, galaxy: p.galaxy || 0, night: p.night || 0,
    cloud: C(p.cloud || '#ffffff'), cloudEm: C(p.cloudEm || '#8595a8'), exposure: p.exposure ?? 1.05,
  };
}

// 0 = plaza, 1..6 = biomes in road order.
const ZONES = [
  palette({ skyTop: '#2f8fff', skyHorizon: '#bfe9ff', fog: '#c4ebff', fogNear: 140, fogFar: 560, hemiSky: '#e3f3ff', hemiGround: '#9cc37a', hemi: 1.3, sun: '#fff0d4', sunI: 2.35, sunGlow: '#fff4d6' }),
  palette({ skyTop: '#3f9dff', skyHorizon: '#c6ecff', fog: '#cdeeff', fogNear: 110, fogFar: 460, hemiSky: '#e3f3ff', hemiGround: '#8fc46a', hemi: 1.3, sun: '#fff0d4', sunI: 2.3 }),
  palette({ skyTop: '#4aa9cf', skyHorizon: '#cdeedb', fog: '#b9e0c6', fogNear: 60, fogFar: 330, hemiSky: '#d8f6e2', hemiGround: '#3f7a45', hemi: 1.2, sun: '#fff1c8', sunI: 2.0 }),
  palette({ skyTop: '#4f9be0', skyHorizon: '#ffe0ae', fog: '#f1d6a8', fogNear: 80, fogFar: 380, hemiSky: '#fff0d8', hemiGround: '#c9955a', hemi: 1.25, sun: '#ffe6b0', sunI: 2.5, sunGlow: '#ffd98a' }),
  palette({ skyTop: '#4b3a86', skyHorizon: '#a893cc', fog: '#8c80a8', fogNear: 30, fogFar: 240, hemiSky: '#cbb8f2', hemiGround: '#3d4a2c', hemi: 1.05, sun: '#e9d6ff', sunI: 1.35, cloud: '#c9b8e8', cloudEm: '#4a3d6a' }),
  palette({ skyTop: '#3a1210', skyHorizon: '#ff7440', fog: '#a3442c', fogNear: 40, fogFar: 270, hemiSky: '#ffb08a', hemiGround: '#4a1a12', hemi: 1.05, sun: '#ffb070', sunI: 1.9, sunGlow: '#ff6a2a', cloud: '#7a4a44', cloudEm: '#3a1410', exposure: 1.1 }),
  palette({ skyTop: '#05051c', skyHorizon: '#3b2b7c', fog: '#2a2362', fogNear: 60, fogFar: 320, hemiSky: '#8f90ff', hemiGround: '#2a1f5a', hemi: 1.0, sun: '#b8c4ff', sunI: 0.95, stars: 1, galaxy: 1, night: 1, sunDir: [-30, 70, -40], cloud: '#3a3478', cloudEm: '#161238', exposure: 1.15 }),
];

const WEATHER = {
  golden: palette({ skyTop: '#f07a5a', skyHorizon: '#ffd38a', fog: '#ffcf98', fogNear: 110, fogFar: 460, hemiSky: '#ffd9a8', hemiGround: '#a8703a', hemi: 1.25, sun: '#ffb25a', sunI: 2.7, sunDir: [70, 26, -60], sunGlow: '#ff9a3a', cloud: '#ffd0a8', cloudEm: '#a0583a' }),
  diamond: palette({ skyTop: '#040828', skyHorizon: '#26357a', fog: '#1d2858', fogNear: 90, fogFar: 420, hemiSky: '#98b4ff', hemiGround: '#1f2a55', hemi: 1.0, sun: '#d2e2ff', sunI: 1.0, stars: 1, night: 1, sunDir: [-35, 60, -45], cloud: '#34406e', cloudEm: '#10163a', exposure: 1.15 }),
  rainbow: palette({ skyTop: '#76a8d8', skyHorizon: '#dbe8f2', fog: '#c6d6e2', fogNear: 80, fogFar: 380, hemiSky: '#e6f0ff', hemiGround: '#7d9a80', hemi: 1.25, sun: '#fff7e8', sunI: 1.7, cloud: '#e8eef5', cloudEm: '#6a7888' }),
};

function lerpPalette(out, a, b, t) {
  for (const k in out) {
    const va = a[k];
    if (va.isColor) out[k].copy(va).lerp(b[k], t);
    else if (va.isVector3) out[k].copy(va).lerp(b[k], t).normalize();
    else out[k] = va + (b[k] - va) * t;
  }
  return out;
}

// ------------------------------------------------------------------ sky dome

function createSkyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSun: { value: new THREE.Color() },
      uStars: { value: 0 },
      uGalaxy: { value: 0 },
      uNight: { value: 0 },
      uTime,
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uSun;
      uniform vec3 uSunDir;
      uniform float uStars, uGalaxy, uNight, uTime;
      varying vec3 vDir;
      float h31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
      float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
                   mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z); }
      float starLayer(vec3 d, float scale, float thresh, float seed){
        vec3 p = d*scale + seed; vec3 c = floor(p); vec3 f = fract(p);
        float h = h31(c);
        if (h < thresh) return 0.0;
        vec3 o = vec3(h31(c+1.7), h31(c+3.1), h31(c+5.3))*0.5+0.25;
        float dd = length(f-o);
        float tw = 0.55 + 0.45*sin(uTime*(1.5+h*4.0) + h*80.0);
        return smoothstep(0.30, 0.0, dd) * tw * (0.5 + 0.5*(h-thresh)/(1.0-thresh));
      }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float up = clamp(h, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.85, up), 0.55));
        // soft lighter band just above the horizon
        col = mix(col, uHorizon, (1.0 - smoothstep(0.0, 0.08, up)) * 0.5);
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSun * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.35) * (1.0 - 0.5*uNight);
        // disc: sun by day, pale moon at night
        float disc = smoothstep(0.9975, 0.9982, sd);
        vec3 discCol = mix(uSun * 1.6 + 0.4, vec3(0.92, 0.95, 1.0), uNight);
        col = mix(col, discCol, disc * step(0.0, h));
        if (uGalaxy > 0.01) {
          vec3 n = normalize(vec3(0.35, 0.55, 0.75));
          float b = dot(d, n);
          float band = exp(-b*b/0.035);
          float cl = vn3(d*6.0) * 0.6 + vn3(d*13.0) * 0.3 + vn3(d*27.0) * 0.15;
          vec3 gcol = mix(vec3(0.35, 0.15, 0.6), vec3(0.95, 0.45, 0.85), vn3(d*4.0+7.0));
          gcol = mix(gcol, vec3(0.4, 0.75, 1.0), smoothstep(0.55, 0.8, vn3(d*5.0+2.0)));
          col += gcol * band * smoothstep(0.35, 0.95, cl) * 0.9 * uGalaxy * smoothstep(-0.05, 0.2, h);
        }
        if (uStars > 0.01) {
          float s = starLayer(d, 150.0, 0.92, 0.0) + starLayer(d, 320.0, 0.94, 17.0) * 0.7;
          col += vec3(1.0, 0.97, 0.9) * s * uStars * smoothstep(-0.02, 0.25, h);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

// ------------------------------------------------------------------ clouds

function createClouds(count) {
  const r = makeRand(99);
  const g = new Merger();
  // One chunky stacked cluster (Roblox-style blocks); instances vary by scale and rotation.
  const puffs = [
    [0, 0, 0, 26, 5, 16], [-10, 0.5, 3, 12, 5, 11], [11, 0.3, -2, 13, 5, 12],
    [-3, 4.2, 0, 16, 5, 11], [6, 4.4, 2, 10, 4.5, 8], [-9, 3.6, -2, 8, 4, 7],
    [1, 8, 0.5, 9, 4, 7], [15, 2.6, 3, 7, 4, 6],
  ];
  for (const [x, y, z, w, h, d] of puffs) g.box(x, y, z, w, h, d, '#d6e2ee', { top: '#ffffff', ao: 0 });
  const geo = g.buildGeometry();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.name = 'clouds';
  const items = [];
  for (let i = 0; i < count; i++) {
    const k = r.range(0.9, 2.1);
    items.push({
      x: r.range(-600, 600), y: r.range(140, 210), z: r.range(-600, 600),
      sx: k * r.range(0.9, 1.3), sy: k * r.range(0.9, 1.2), sz: k * r.range(0.9, 1.3), ry: r.range(-0.5, 0.5),
      speed: r.range(2, 5),
    });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const wrap = (v, span) => ((((v + span) % (2 * span)) + 2 * span) % (2 * span)) - span;
  return {
    mesh,
    mat,
    update(t, camX, camZ) {
      for (let i = 0; i < count; i++) {
        const c = items[i];
        p.set(camX + wrap(c.x + t * c.speed - camX, 600), c.y, camZ + wrap(c.z - camZ, 600));
        q.setFromAxisAngle(up, c.ry);
        s.set(c.sx, c.sy, c.sz);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ particle fields

/**
 * Camera-following point sprites computed entirely on the GPU (no per-frame CPU work).
 * anchor: 'world' keeps y in [y0, y0+box.y] in world space (fireflies, embers); 'camera' centres on the camera.
 */
function particleField({ count, box, size, color, color2, vel = [0, 0, 0], twinkle = 0.5, wobble = 1, anchor = 'camera', y0 = 0, seed = 1, blending = THREE.AdditiveBlending }) {
  const r = makeRand(seed);
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    rnd[i * 4] = r();
    rnd[i * 4 + 1] = r();
    rnd[i * 4 + 2] = r();
    rnd[i * 4 + 3] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uCam: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(...box) },
      uVel: { value: new THREE.Vector3(...vel) },
      uSize: { value: size },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color2 || color) },
      uTwinkle: { value: twinkle },
      uWobble: { value: wobble },
      uWorld: { value: anchor === 'world' ? 1 : 0 },
      uY0: { value: y0 },
      uScale: { value: 400 },
    },
    vertexShader: `
      attribute vec4 aRand;
      uniform float uTime, uSize, uTwinkle, uWobble, uWorld, uY0, uScale;
      uniform vec3 uCam, uBox, uVel;
      varying float vA; varying float vMix;
      void main(){
        float ph = aRand.w * 6.2831;
        vec3 p = aRand.xyz * uBox + uVel * uTime;
        p += uWobble * vec3(sin(uTime*0.9 + ph*3.0), sin(uTime*1.3 + ph*5.0)*0.6, cos(uTime*0.7 + ph*2.0));
        vec3 rel = mod(p - uCam + uBox*0.5, uBox) - uBox*0.5;
        vec3 wp = uCam + rel;
        if (uWorld > 0.5) wp.y = uY0 + mod(p.y, uBox.y);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        float edge = 1.0 - smoothstep(0.32, 0.5, max(abs(rel.x)/uBox.x, abs(rel.z)/uBox.z));
        float tw = mix(1.0, 0.5 + 0.5*sin(uTime*(2.0 + aRand.y*4.0) + ph*7.0), uTwinkle);
        float near = smoothstep(2.0, 6.0, -mv.z);
        vA = edge * max(tw, 0.0) * near;
        vMix = aRand.x;
        gl_PointSize = min(uSize * (0.6 + aRand.z*0.8) * uScale / max(1.0, -mv.z), 40.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor, uColor2; uniform float uOpacity;
      varying float vA; varying float vMix;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float core = smoothstep(0.5, 0.0, d);
        float a = core*core * vA * uOpacity;
        if (a < 0.01) discard;
        vec3 col = mix(uColor, uColor2, vMix) * (0.8 + core);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  return pts;
}

function createRain(count) {
  const r = makeRand(5);
  const pos = new Float32Array(count * 2 * 3);
  const rnd = new Float32Array(count * 2 * 4);
  for (let i = 0; i < count; i++) {
    const a = [r(), r(), r(), r()];
    for (let e = 0; e < 2; e++) {
      rnd.set([a[0], a[1], a[2], e], (i * 2 + e) * 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uCam: { value: new THREE.Vector3() }, uOpacity: { value: 0 } },
    vertexShader: `
      attribute vec4 aRand;
      uniform float uTime; uniform vec3 uCam;
      varying float vA;
      void main(){
        vec3 box = vec3(70.0, 44.0, 70.0);
        vec3 vel = vec3(-6.0, -70.0, 4.0);
        vec3 p = aRand.xyz * box + vel * uTime * (0.8 + aRand.x*0.4);
        vec3 rel = mod(p - uCam + box*0.5, box) - box*0.5;
        vec3 wp = uCam + rel;
        wp -= normalize(vel) * aRand.w * 2.6;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = (1.0 - smoothstep(0.3, 0.5, max(abs(rel.x)/box.x, abs(rel.z)/box.z))) * (0.35 + 0.65*aRand.w);
      }`,
    fragmentShader: `
      uniform float uOpacity; varying float vA;
      void main(){ gl_FragColor = vec4(0.82, 0.9, 1.0, vA * uOpacity * 0.55); }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}

function createRainbow() {
  const geo = new THREE.RingGeometry(190, 240, 72, 1, 0, Math.PI);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vP;
      void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uOpacity; varying vec2 vP;
      vec3 hue(float h){ return clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){
        float r = (length(vP) - 190.0) / 50.0;
        vec3 c = hue(0.78 * (1.0 - r));
        float a = smoothstep(0.0, 0.12, r) * smoothstep(1.0, 0.85, r);
        a *= smoothstep(0.0, 70.0, vP.y);
        gl_FragColor = vec4(c, a * uOpacity * 0.55);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -5;
  m.visible = false;
  return m;
}

// ------------------------------------------------------------------ controller

export function createAmbience(engine, quality, layout) {
  const scene = engine.scene;
  const root = new THREE.Group();
  root.name = 'ambience';
  scene.add(root);
  const dens = quality.decorDensity;

  const sky = createSkyDome();
  root.add(sky);
  const clouds = createClouds(Math.round(18 + 16 * dens));
  root.add(clouds.mesh);

  scene.fog = new THREE.Fog(0xc4ebff, 140, 560);
  scene.background = new THREE.Color(0xc4ebff);

  const fx = {
    fireflies: particleField({ count: Math.round(160 * dens + 40), box: [90, 9, 90], size: 0.9, color: '#e8ff7a', color2: '#9dffb0', vel: [0.3, 0.2, 0.4], twinkle: 1, wobble: 1.6, anchor: 'world', y0: 0.6, seed: 11 }),
    embers: particleField({ count: Math.round(220 * dens + 60), box: [90, 40, 90], size: 0.7, color: '#ffb347', color2: '#ff4a1a', vel: [0.6, 3.2, 0.3], twinkle: 0.6, wobble: 1.2, anchor: 'world', y0: 0, seed: 12 }),
    stardust: particleField({ count: Math.round(200 * dens + 60), box: [100, 34, 100], size: 0.8, color: '#bff4ff', color2: '#ffb8f0', vel: [0, 0.5, 0], twinkle: 1, wobble: 0.8, anchor: 'world', y0: 0.5, seed: 13 }),
    pollen: particleField({ count: Math.round(120 * dens + 30), box: [80, 12, 80], size: 0.5, color: '#fffbe0', color2: '#fff2a0', vel: [0.8, 0.1, 0.5], twinkle: 0.3, wobble: 1.5, anchor: 'world', y0: 0.8, seed: 14, blending: THREE.NormalBlending }),
    sparkles: particleField({ count: Math.round(260 * dens + 60), box: [90, 40, 90], size: 1.0, color: '#ffffff', color2: '#8ff0ff', vel: [0, -0.3, 0], twinkle: 1, wobble: 0.4, anchor: 'camera', seed: 15 }),
    goldmotes: particleField({ count: Math.round(160 * dens + 40), box: [80, 30, 80], size: 0.8, color: '#ffe08a', color2: '#ffb347', vel: [0.5, 0.6, 0.2], twinkle: 0.7, wobble: 1.2, anchor: 'camera', seed: 16 }),
  };
  for (const k in fx) root.add(fx[k]);
  const rain = createRain(Math.round(900 * dens + 300));
  root.add(rain);
  const rainbow = createRainbow();
  root.add(rainbow);

  const cur = palette({ skyTop: '#000', skyHorizon: '#000', fog: '#000', fogNear: 0, fogFar: 0, hemiSky: '#000', hemiGround: '#000', hemi: 0, sun: '#000', sunI: 0 });
  const tmp = palette({ skyTop: '#000', skyHorizon: '#000', fog: '#000', fogNear: 0, fogFar: 0, hemiSky: '#000', hemiGround: '#000', hemi: 0, sun: '#000', sunI: 0 });
  const weather = { golden: 0, diamond: 0, rainbow: 0 };
  let target = null;
  const zoneW = new Float32Array(7);
  const ranges = layout.biomeRanges;
  const B0 = ranges[0].minZ;
  const BL = ranges[0].maxZ - ranges[0].minZ;
  const T = 32;
  const baseSunLen = engine.sunOffset.length();
  const sunDir = new THREE.Vector3();
  let first = true;

  function zoneBlend(z) {
    zoneW.fill(0);
    // boundaries between zone k-1 and k at B0 + (k-1)*BL
    let idx = z < B0 ? 0 : Math.min(6, 1 + Math.floor((z - B0) / BL));
    for (let k = 1; k <= 6; k++) {
      const b = B0 + (k - 1) * BL;
      if (Math.abs(z - b) < T) {
        const t = THREE.MathUtils.smoothstep(z, b - T, b + T);
        zoneW[k - 1] = 1 - t;
        zoneW[k] = t;
        return lerpPalette(tmp, ZONES[k - 1], ZONES[k], t);
      }
    }
    zoneW[idx] = 1;
    return lerpPalette(tmp, ZONES[idx], ZONES[idx], 0);
  }

  const api = {
    root,
    zoneW,
    weather,
    setWeather(id) {
      target = id && WEATHER[id] ? id : null;
    },
    get weatherId() {
      return target;
    },
    update(dt, camera) {
      const t = uTime.value;
      const cp = camera.position;
      // weather weights (smooth ~2.5 s transitions)
      for (const k in weather) {
        const goal = k === target ? 1 : 0;
        weather[k] += (goal - weather[k]) * Math.min(1, dt * (first ? 100 : 0.9));
        if (Math.abs(goal - weather[k]) < 0.002) weather[k] = goal;
      }
      const zp = zoneBlend(cp.z);
      cur.skyTop.copy(zp.skyTop);
      lerpPalette(cur, zp, zp, 0);
      const deep = Math.max(zoneW[5], zoneW[6]); // strong biome moods resist weather a little
      for (const k in weather) {
        const w = weather[k];
        if (w <= 0) continue;
        const s = w * (1 - deep * 0.35);
        const W = WEATHER[k];
        for (const key in cur) {
          const a = cur[key];
          if (key === 'fogNear' || key === 'fogFar') cur[key] = a + (W[key] - a) * s * 0.4;
          else if (a.isColor) a.lerp(W[key], s);
          else if (a.isVector3) a.lerp(W[key], s).normalize();
          else cur[key] = a + (W[key] - a) * s;
        }
      }
      // apply
      const far = Math.min(cur.fogFar, quality.drawDistance * 0.95);
      scene.fog.color.copy(cur.fog);
      scene.fog.near = Math.min(cur.fogNear, far * 0.5);
      scene.fog.far = far;
      scene.background.copy(cur.fog);
      const su = sky.material.uniforms;
      su.uTop.value.copy(cur.skyTop);
      su.uHorizon.value.copy(cur.fog).lerp(cur.skyHorizon, 0.35);
      su.uSun.value.copy(cur.sunGlow);
      su.uSunDir.value.copy(cur.sunDir);
      su.uStars.value = cur.stars;
      su.uGalaxy.value = cur.galaxy;
      su.uNight.value = cur.night;
      sky.position.copy(cp);
      engine.hemi.color.copy(cur.hemiSky);
      engine.hemi.groundColor.copy(cur.hemiGround);
      engine.hemi.intensity = cur.hemi;
      engine.sun.color.copy(cur.sun);
      engine.sun.intensity = cur.sunI;
      sunDir.copy(cur.sunDir).multiplyScalar(baseSunLen);
      engine.sunOffset.copy(sunDir);
      engine.renderer.toneMappingExposure = cur.exposure;
      clouds.mat.color.copy(cur.cloud);
      clouds.update(t, cp.x, cp.z);

      // particles
      const setFx = (p, o) => {
        p.material.uniforms.uOpacity.value = o;
        p.visible = o > 0.01;
        if (p.visible) p.material.uniforms.uCam.value.copy(cp);
      };
      const scale = engine.renderer.domElement.height * 0.83;
      for (const k in fx) fx[k].material.uniforms.uScale.value = scale;
      setFx(fx.pollen, (zoneW[0] * 0.5 + zoneW[1]) * (1 - weather.rainbow));
      setFx(fx.fireflies, zoneW[4] + weather.diamond * 0.3 * zoneW[2]);
      setFx(fx.embers, zoneW[5]);
      setFx(fx.stardust, zoneW[6]);
      setFx(fx.sparkles, weather.diamond);
      setFx(fx.goldmotes, weather.golden * 0.8);
      rain.material.uniforms.uOpacity.value = weather.rainbow;
      rain.visible = weather.rainbow > 0.01;
      if (rain.visible) rain.material.uniforms.uCam.value.copy(cp);
      rainbow.material.uniforms.uOpacity.value = weather.rainbow * (1 - zoneW[6] * 0.5);
      rainbow.visible = weather.rainbow > 0.01;
      if (rainbow.visible) rainbow.position.set(cp.x, -110, cp.z + 620);
      first = false;
    },
  };
  return api;
}
