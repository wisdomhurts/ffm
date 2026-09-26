// Cosmetic speed trails (characters/cosmetics.js TRAILS): shown while running fast.
// One draw call per avatar: a small pool of point sprites simulated in world space (sparkles, hearts,
// bubbles, leaves, fire) or a ribbon that follows the path (rainbow). Sprite textures and materials
// are shared by every avatar. The object is parented to the avatar root, but its matrix cancels the
// root's so its vertices are world positions (the trail stays where you ran).
// createTrail(id) -> { object3d, update(dt, root, speed, opts), dispose() }
//   opts: { scale (avatar rig scale), visible (false while cloaked), inPlace (turntables: the ground
//   "moves" backwards under the avatar instead) }
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _inv = new THREE.Matrix4();

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ------------------------------------------------------------------ sprite textures (white-ish glyphs)

function sprite(draw) {
  const c = canvas(64);
  const g = c.getContext('2d');
  draw(g, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPRITES = {
  sparkles: (g, S) => {
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? S * 0.09 : S * 0.46;
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(160,110,0,0.55)';
    g.stroke();
  },
  hearts: (g, S) => {
    g.translate(S / 2, S / 2 + 3);
    const heart = () => {
      g.beginPath();
      g.moveTo(0, S * 0.3);
      g.bezierCurveTo(-S * 0.55, -S * 0.08, -S * 0.25, -S * 0.46, 0, -S * 0.18);
      g.bezierCurveTo(S * 0.25, -S * 0.46, S * 0.55, -S * 0.08, 0, S * 0.3);
    };
    heart();
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(120,0,40,0.55)';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(-S * 0.15, -S * 0.12, S * 0.06, S * 0.04, -0.6, 0, Math.PI * 2);
    g.fill();
  },
  bubbles: (g, S) => {
    const grd = g.createRadialGradient(S * 0.5, S * 0.5, S * 0.2, S * 0.5, S * 0.5, S * 0.46);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0.95)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.ellipse(S * 0.36, S * 0.34, S * 0.1, S * 0.06, -0.7, 0, Math.PI * 2);
    g.fill();
  },
  leaves: (g, S) => {
    g.translate(S / 2, S / 2);
    g.rotate(-0.6);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-S * 0.42, 0);
    g.quadraticCurveTo(0, -S * 0.32, S * 0.42, 0);
    g.quadraticCurveTo(0, S * 0.32, -S * 0.42, 0);
    g.fill();
    g.strokeStyle = 'rgba(0,60,0,0.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-S * 0.42, 0);
    g.lineTo(S * 0.36, 0);
    g.stroke();
  },
  fire: (g, S) => {
    // tinted per particle: a hot yellow-white core fading out to the flame colour
    const grd = g.createRadialGradient(S / 2, S * 0.66, 0, S / 2, S * 0.58, S * 0.46);
    grd.addColorStop(0, 'rgba(255,255,230,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(S / 2, S * 0.04);
    g.bezierCurveTo(S * 0.72, S * 0.34, S * 0.95, S * 0.62, S / 2, S * 0.97);
    g.bezierCurveTo(S * 0.05, S * 0.62, S * 0.28, S * 0.34, S / 2, S * 0.04);
    g.fill();
  },
};

// per trail: sprite, blending, palette, lifetime, size, motion
const KINDS = {
  sparkles: { add: false, colors: ['#ffe066', '#ffd23f', '#7fe8ff', '#ffffff', '#ff9ee0'], life: [0.5, 0.9], size: [0.55, 1.0], rate: 30, rise: 0.8, spread: 0.9, twinkle: true },
  hearts: { add: false, colors: ['#ff4f9a', '#ff7eb6', '#ff3d6b', '#ffb3d1'], life: [0.8, 1.2], size: [0.6, 0.95], rate: 14, rise: 2.4, spread: 0.7, sway: 1.2 },
  bubbles: { add: false, colors: ['#bdefff', '#d9f7ff', '#c9d9ff', '#e6fff8'], life: [0.8, 1.3], size: [0.45, 1.05], rate: 16, rise: 2.0, spread: 0.9, sway: 1.6, pop: true },
  leaves: { add: false, colors: ['#63d45a', '#2fb84f', '#9be34a', '#ffc93c', '#ff8a1a'], life: [0.9, 1.4], size: [0.55, 0.85], rate: 15, rise: -0.6, spread: 0.9, sway: 2.0, spin: 4 },
  fire: { add: false, colors: ['#ffb627', '#ff7a1a', '#ff4d2e', '#ffd23f'], life: [0.35, 0.6], size: [0.8, 1.35], rate: 40, rise: 3.2, spread: 0.55, feet: true, shrink: true },
};

const SHARED = {};
function pointsMaterial(id) {
  if (SHARED[id]) return SHARED[id];
  const K = KINDS[id];
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: sprite(SPRITES[id]) }, uScale: { value: 400 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aColor;
      uniform float uScale; varying float vA; varying float vR; varying vec3 vC;
      void main(){ vA = aAlpha; vR = aRot; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / -mv.z, 0.0, 96.0); }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying float vR; varying vec3 vC;
      void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR);
        p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
        vec4 t = texture2D(map, p); float a = t.a * vA; if (a < 0.01) discard;
        gl_FragColor = vec4(vC * t.rgb, a); }`,
    transparent: true,
    depthWrite: false,
    blending: K.add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  SHARED[id] = mat;
  return mat;
}

function rainbowMaterial() {
  if (SHARED.rainbow) return SHARED.rainbow;
  const c = canvas(4, 64);
  const g = c.getContext('2d');
  const cols = ['#ff4d6d', '#ffb627', '#fff04d', '#4cd964', '#3dd6ff', '#8f7bff'];
  cols.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, (i * 64) / cols.length, 4, 64 / cols.length + 1);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  SHARED.rainbow = new THREE.MeshBasicMaterial({ map: t, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return SHARED.rainbow;
}

const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ particles

function particleTrail(id) {
  const K = KINDS[id];
  const N = 44;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
  const rot = new Float32Array(N);
  const color = new Float32Array(N * 3);
  const P = Array.from({ length: N }, () => ({ age: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, r: 0, vr: 0, ph: 0 }));
  const geo = new THREE.BufferGeometry();
  const attr = (name, arr, n) => {
    const a = new THREE.BufferAttribute(arr, n);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const aPos = attr('position', pos, 3);
  const aSize = attr('aSize', size, 1);
  const aAlpha = attr('aAlpha', alpha, 1);
  const aRot = attr('aRot', rot, 1);
  attr('aColor', color, 3);
  const cols = K.colors.map((h) => new THREE.Color(h));
  for (let i = 0; i < N; i++) {
    const c = cols[i % cols.length];
    color.set([c.r, c.g, c.b], i * 3);
  }
  geo.attributes.aColor.needsUpdate = true;
  const mat = pointsMaterial(id);
  const obj = new THREE.Points(geo, mat);
  obj.name = 'trail-' + id;
  obj.frustumCulled = false;
  obj.matrixAutoUpdate = false;
  obj.renderOrder = 5;
  obj.onBeforeRender = (renderer, scene, camera) => {
    renderer.getDrawingBufferSize(_v);
    mat.uniforms.uScale.value = _v.y * 0.5 * camera.projectionMatrix.elements[5];
  };
  let acc = 0;
  let next = 0;
  let live = false;

  return {
    object3d: obj,
    update(dt, root, speed, o = {}) {
      root.updateWorldMatrix(true, false);
      root.matrixWorld.decompose(_v, _q, _s);
      _fwd.set(0, 0, 1).applyQuaternion(_q);
      obj.matrix.copy(_inv.copy(root.matrixWorld).invert());
      obj.matrixWorldNeedsUpdate = true;
      const S = (o.scale || 0.8) * _s.y;
      const on = o.visible !== false;
      const k = on ? Math.max(0, Math.min(1, (speed - 7) / 14)) : 0;
      acc += dt * K.rate * (0.35 + k) * (k > 0 ? 1 : 0);
      // emit
      while (acc >= 1) {
        acc -= 1;
        const p = P[next];
        next = (next + 1) % N;
        p.age = 0;
        p.life = rand(K.life[0], K.life[1]);
        const side = rand(-1, 1) * K.spread * S * 1.4;
        const h = K.feet ? rand(0.1, 0.9) * S : rand(0.5, 5.2) * S;
        // across the body: world right = fwd x up
        p.x = _v.x - _fwd.z * side - _fwd.x * rand(0.3, 1.2) * S;
        p.z = _v.z + _fwd.x * side - _fwd.z * rand(0.3, 1.2) * S;
        p.y = _v.y + h;
        const back = o.inPlace ? -speed * 0.85 : -speed * 0.08;
        p.vx = _fwd.x * back + rand(-0.6, 0.6);
        p.vz = _fwd.z * back + rand(-0.6, 0.6);
        p.vy = K.rise * rand(0.6, 1.2);
        p.s = rand(K.size[0], K.size[1]) * S * 1.3;
        p.r = rand(-0.5, 0.5);
        p.vr = K.spin ? rand(-K.spin, K.spin) : 0;
        p.ph = rand(0, 6.28);
        live = true;
      }
      if (!live) {
        obj.visible = false;
        return;
      }
      obj.visible = true;
      let any = false;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.age >= p.life) {
          alpha[i] = 0;
          continue;
        }
        any = true;
        p.age += dt;
        const u = Math.min(1, p.age / p.life);
        const lat = K.sway ? Math.sin(p.age * 5 + p.ph) * K.sway : 0;
        p.x += (p.vx - _fwd.z * lat) * dt;
        p.z += (p.vz + _fwd.x * lat) * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 1.5;
        p.vz *= 1 - dt * 1.5;
        p.r += p.vr * dt;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        let a = Math.min(1, u * 8) * (1 - u * u);
        if (K.twinkle) a *= 0.55 + 0.45 * Math.sin(p.age * 30 + p.ph);
        let sz = p.s;
        if (K.shrink) sz *= 1 - u * 0.7;
        if (K.pop) sz *= 1 + Math.max(0, u - 0.85) * 3;
        size[i] = sz;
        alpha[i] = a;
        rot[i] = p.r;
      }
      if (!any) live = false;
      aPos.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = aRot.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}

// ------------------------------------------------------------------ rainbow ribbon

function ribbonTrail() {
  const N = 22; // path samples
  const pts = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, age: 9 }));
  const pos = new Float32Array(N * 2 * 3);
  const col = new Float32Array(N * 2 * 4);
  const uv = new Float32Array(N * 2 * 2);
  const idx = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let i = 0; i < N; i++) {
    uv.set([i / (N - 1), 0, i / (N - 1), 1], i * 4);
    col.set([1, 1, 1, 0, 1, 1, 1, 0], i * 8);
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('color', aCol);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const obj = new THREE.Mesh(geo, rainbowMaterial());
  obj.name = 'trail-rainbow';
  obj.frustumCulled = false;
  obj.matrixAutoUpdate = false;
  obj.renderOrder = 5;
  const LIFE = 0.55;
  let head = 0; // index of the newest sample
  let shift = 0;
  return {
    object3d: obj,
    update(dt, root, speed, o = {}) {
      root.updateWorldMatrix(true, false);
      root.matrixWorld.decompose(_v, _q, _s);
      _fwd.set(0, 0, 1).applyQuaternion(_q);
      obj.matrix.copy(_inv.copy(root.matrixWorld).invert());
      obj.matrixWorldNeedsUpdate = true;
      const S = (o.scale || 0.8) * _s.y;
      const on = o.visible !== false && speed > 7;
      for (const p of pts) {
        p.age += dt;
        if (o.inPlace) {
          p.x -= _fwd.x * speed * dt;
          p.z -= _fwd.z * speed * dt;
        }
      }
      // a new sample every ~0.03 s while running; the newest one always sits at the avatar
      shift += dt;
      const cur = pts[head];
      if (on && (shift > 0.03 || cur.age > LIFE)) {
        shift = 0;
        head = (head + 1) % N;
      }
      if (on) {
        const p = pts[head];
        p.x = _v.x - _fwd.x * 0.9 * S;
        p.y = _v.y;
        p.z = _v.z - _fwd.z * 0.9 * S;
        p.age = 0;
      }
      let any = false;
      const y0 = 1.6 * S;
      const y1 = 3.4 * S;
      for (let i = 0; i < N; i++) {
        const p = pts[(head - i + N) % N];
        const a = Math.max(0, 1 - p.age / LIFE) * (1 - i / (N - 1)) * 0.9;
        if (a > 0) any = true;
        const k = i * 6;
        pos[k] = p.x;
        pos[k + 1] = p.y + y0;
        pos[k + 2] = p.z;
        pos[k + 3] = p.x;
        pos[k + 4] = p.y + y1;
        pos[k + 5] = p.z;
        col[i * 8 + 3] = a;
        col[i * 8 + 7] = a;
      }
      obj.visible = any;
      aPos.needsUpdate = aCol.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}

export function createTrail(id) {
  if (id === 'rainbow') return ribbonTrail();
  if (KINDS[id]) return particleTrail(id);
  return null;
}

/** Trail sprite for UI icons (a canvas with the glyph in the trail's colours). */
export function trailIcon(id, size = 96) {
  const c = canvas(size);
  const g = c.getContext('2d');
  if (id === 'rainbow') {
    const cols = ['#ff4d6d', '#ffb627', '#fff04d', '#4cd964', '#3dd6ff', '#8f7bff'];
    g.lineCap = 'round';
    cols.forEach((col, i) => {
      g.strokeStyle = col;
      g.lineWidth = size * 0.07;
      g.beginPath();
      g.arc(size * 0.5, size * 0.85, size * (0.46 - i * 0.065), Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
    });
    return c;
  }
  const K = KINDS[id];
  if (!K) return c;
  const src = canvas(64);
  SPRITES[id](src.getContext('2d'), 64);
  const spots = [[0.3, 0.68, 0.42], [0.62, 0.42, 0.5], [0.78, 0.76, 0.3], [0.36, 0.28, 0.26]];
  spots.forEach(([x, y, s], i) => {
    const tint = canvas(64);
    const tg = tint.getContext('2d');
    tg.drawImage(src, 0, 0);
    tg.globalCompositeOperation = 'source-atop';
    tg.fillStyle = K.colors[i % K.colors.length];
    tg.globalAlpha = K.add ? 0.6 : 0.85;
    tg.fillRect(0, 0, 64, 64);
    const d = size * s;
    g.drawImage(tint, size * x - d / 2, size * y - d / 2, d, d);
  });
  return c;
}
