// World-art toolkit: a vertex-coloured geometry merger (so whole areas draw in one call),
// seeded RNG, canvas textures, chunky sign text and a few shared shader helpers.
import * as THREE from 'three';

// ------------------------------------------------------------------ rng

export function makeRand(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

// ------------------------------------------------------------------ renderer-dependent settings

const ctx = { anisotropy: 4 };
export function setTextureQuality(renderer, quality) {
  const max = renderer.capabilities.getMaxAnisotropy?.() || 1;
  ctx.anisotropy = Math.min(max, quality.decorDensity >= 1 ? 8 : quality.decorDensity >= 0.7 ? 2 : 1);
}

// ------------------------------------------------------------------ colours

const _col = new THREE.Color();
export function col(hex) {
  return new THREE.Color(hex);
}
export function shade(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k);
}
export function mix(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

// ------------------------------------------------------------------ primitives

// Unit primitives (indexed where three builds them indexed). Box: 1x1x1 centred.
// Cylinders/cones: radius 0.5, height 1, centred.
const PRIMS = new Map();
export function prim(name) {
  let g = PRIMS.get(name);
  if (g) return g;
  const [kind, a] = name.split(':');
  const n = a ? +a : 0;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, n || 8); break;
    case 'cylo': g = new THREE.CylinderGeometry(0.5, 0.5, 1, n || 8, 1, true); break;
    case 'bamboo': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 3, false); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, n || 8); break;
    case 'frustum': g = new THREE.CylinderGeometry(0.35, 0.5, 1, n || 8); break;
    case 'sphere': g = new THREE.SphereGeometry(0.5, n || 12, Math.max(4, Math.round((n || 12) * 0.66))); break;
    case 'hemi': g = new THREE.SphereGeometry(0.5, n || 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'ico': g = new THREE.IcosahedronGeometry(0.5, n || 0); break;
    case 'dodeca': g = new THREE.DodecahedronGeometry(0.5, 0); break;
    case 'octa': g = new THREE.OctahedronGeometry(0.5, 0); break;
    case 'torus': g = new THREE.TorusGeometry(0.4, 0.1, 6, n || 12); break;
    case 'halftorus': g = new THREE.TorusGeometry(0.4, 0.1, 5, n || 8, Math.PI); break;
    case 'plane': g = new THREE.PlaneGeometry(1, 1); break;
    case 'planeup': g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); break;
    case 'wedge': {
      // triangular prism: ramp rising towards +z
      const s = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(-0.5, 0.5)]);
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5).rotateY(-Math.PI / 2);
      break;
    }
    default: throw new Error('unknown prim ' + name);
  }
  g.deleteAttribute('uv1');
  g.computeBoundingBox();
  PRIMS.set(name, g);
  return g;
}

// ------------------------------------------------------------------ merger

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

/** Build a transform matrix from {x,y,z, sx,sy,sz, rx,ry,rz}. */
export function trs(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, order = 'YXZ') {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

/**
 * Collects many small transformed primitives and bakes them into one BufferGeometry with
 * per-vertex colours (and a cheap fake-AO gradient), so a whole area renders in one draw call.
 * UV modes: 'geo' keep primitive UVs, 'flat' pin to a flat texel, 'studs' world-XZ studs on
 * upward faces (flat elsewhere), 'box' world-space box projection (for rock/cliff textures).
 */
export class Merger {
  constructor({ uv = 'flat', uvScale = 0.5, flatUV = [0.012, 0.012] } = {}) {
    this.parts = [];
    this.count = 0;
    this.icount = 0;
    this.uvMode = uv;
    this.uvScale = uvScale;
    this.flatUV = flatUV;
  }

  /**
   * @param {THREE.BufferGeometry|string} geo primitive name or non-indexed geometry
   * @param {THREE.Matrix4} matrix
   * @param {*} color hex/Color: base colour
   * @param {object} [o] {ao: 0..1 darken towards the bottom, top: colour at the top (gradient),
   *   topFace: colour for upward faces, uv: override uv mode, uvScale, emissive (for glow meshes)}
   */
  add(geo, matrix, color, o = {}) {
    if (typeof geo === 'string') geo = prim(geo);
    if (!geo.boundingBox) geo.computeBoundingBox();
    this.parts.push({ geo, matrix: matrix.clone(), color: new THREE.Color(color), o });
    this.count += geo.attributes.position.count;
    this.icount += geo.index ? geo.index.count : geo.attributes.position.count;
    return this;
  }

  /** Box centred at (x,y,z). o.rx/ry/rz rotate it. */
  box(x, y, z, w, h, d, color, o = {}) {
    return this.add('box', trs(x, y, z, w, h, d, o.rx || 0, o.ry || 0, o.rz || 0), color, o);
  }

  /** Box standing on y (base at y). */
  block(x, y, z, w, h, d, color, o = {}) {
    return this.box(x, y + h / 2, z, w, h, d, color, o);
  }

  /** Cylinder standing on y. seg: radial segments. */
  cyl(x, y, z, r, h, color, o = {}) {
    const name = (o.open ? 'cylo:' : 'cyl:') + (o.seg || 8);
    return this.add(name, trs(x, y + h / 2, z, r * 2 * (o.sx || 1), h, r * 2 * (o.sz || 1), o.rx || 0, o.ry || 0, o.rz || 0), color, o);
  }

  /** Generic primitive with centre position & scale. */
  prim(name, x, y, z, sx, sy, sz, color, o = {}) {
    return this.add(name, trs(x, y, z, sx, sy, sz, o.rx || 0, o.ry || 0, o.rz || 0), color, o);
  }

  /** Oriented "stick" from point a to point b with thickness (box or cylinder). */
  beam(ax, ay, az, bx, by, bz, thick, color, o = {}) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    const m = new THREE.Matrix4();
    _v.set(dx, dy, dz).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
    m.compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, new THREE.Vector3(thick * (o.sx || 1), len, thick * (o.sz || 1)));
    return this.add(o.prim || 'box', m, color, o);
  }

  build(material, { castShadow = false, receiveShadow = true, name = '' } = {}) {
    if (!this.count) return null;
    const geo = this.buildGeometry();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  buildGeometry() {
    const N = this.count;
    const pos = new Float32Array(N * 3);
    const nor = new Float32Array(N * 3);
    const uv = new Float32Array(N * 2);
    const colr = new Float32Array(N * 3);
    const index = N > 65535 ? new Uint32Array(this.icount) : new Uint16Array(this.icount);
    let k = 0;
    let ii = 0;
    for (const part of this.parts) {
      const { geo, matrix, color, o } = part;
      const P = geo.attributes.position;
      const Nn = geo.attributes.normal;
      const U = geo.attributes.uv;
      const bb = geo.boundingBox;
      const y0 = bb.min.y;
      const yh = Math.max(1e-6, bb.max.y - bb.min.y);
      _n3.getNormalMatrix(matrix);
      const ao = o.ao ?? 0.22;
      const top = o.top != null ? _c2.set(o.top) : null;
      const topFace = o.topFace != null ? new THREE.Color(o.topFace) : null;
      const mode = o.uv || this.uvMode;
      const us = o.uvScale ?? this.uvScale;
      const flip = matrix.determinant() < 0;
      const base = k;
      // indices (winding reversed when the transform mirrors)
      const I = geo.index;
      const ic = I ? I.count : P.count;
      for (let t = 0; t < ic; t += 3) {
        const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
        index[ii++] = base + a;
        index[ii++] = base + (flip ? c : b);
        index[ii++] = base + (flip ? b : c);
      }
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i);
        const ty = (_v.y - y0) / yh;
        _v.applyMatrix4(matrix);
        _n.fromBufferAttribute(Nn, i).applyMatrix3(_n3).normalize();
        pos[k * 3] = _v.x;
        pos[k * 3 + 1] = _v.y;
        pos[k * 3 + 2] = _v.z;
        nor[k * 3] = _n.x;
        nor[k * 3 + 1] = _n.y;
        nor[k * 3 + 2] = _n.z;
        if (topFace && _n.y > 0.6) _c1.copy(topFace);
        else if (top) _c1.copy(color).lerp(top, ty);
        else _c1.copy(color);
        const f = 1 - ao * (1 - ty);
        colr[k * 3] = _c1.r * f;
        colr[k * 3 + 1] = _c1.g * f;
        colr[k * 3 + 2] = _c1.b * f;
        let u, w;
        if (mode === 'geo' && U) {
          u = U.getX(i);
          w = U.getY(i);
        } else if (mode === 'studs') {
          if (_n.y > 0.6) {
            u = _v.x * us;
            w = _v.z * us;
          } else {
            u = this.flatUV[0];
            w = this.flatUV[1];
          }
        } else if (mode === 'box') {
          const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
          if (ay >= ax && ay >= az) {
            u = _v.x * us;
            w = _v.z * us;
          } else if (ax >= az) {
            u = _v.z * us;
            w = _v.y * us;
          } else {
            u = _v.x * us;
            w = _v.y * us;
          }
        } else {
          u = this.flatUV[0];
          w = this.flatUV[1];
        }
        uv[k * 2] = u;
        uv[k * 2 + 1] = w;
        k++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Bake a Merger into a plain geometry (for InstancedMesh sources). */
export function mergedGeometry(fn, opts) {
  const m = new Merger(opts);
  fn(m);
  return m.buildGeometry();
}

/** Adds an all-white vertex colour attribute so plain geometries can share vertex-coloured materials. */
export function withColors(geo, color = 0xffffff) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Opaque, gently self-lit sign board material (all signs share one shader program). */
export function signMaterial(tex, emissive = 0.3) {
  return new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive });
}

// ------------------------------------------------------------------ canvas textures

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // CPU-backed 2D context: we paint thousands of tiny shapes once, which GPU canvases handle badly.
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

export function canvasTexture(canvas, { repeat = null, srgb = true, mips = true, clamp = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = ctx.anisotropy;
  if (!mips) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  t.needsUpdate = true;
  return t;
}

export function drawTexture(w, h, draw, opts) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  return canvasTexture(c, opts);
}

// Value noise for canvas painting.
export function noise2(seed = 1) {
  const r = makeRand(seed);
  const P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[(y & 255) * 256 + (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// Sprinkle soft blobs (tileable when wrap=true).
export function blobs(g, w, h, n, rand, { rMin = 4, rMax = 12, colors = ['rgba(0,0,0,0.1)'], wrap = true, shape = 'circle' } = {}) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    const pts = wrap ? [[x, y], [x - w, y], [x + w, y], [x, y - h], [x, y + h]] : [[x, y]];
    for (const [px, py] of pts) {
      g.beginPath();
      if (shape === 'ellipse') g.ellipse(px, py, r, r * 0.55, rand() * Math.PI, 0, Math.PI * 2);
      else g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// ------------------------------------------------------------------ sign text

export const SIGN_FONT = '"Fredoka", "Fredoka One", "Lilita One", "Luckiest Guy", "Baloo 2", "Arial Rounded MT Bold", "Arial Black", "Helvetica Neue", Arial, sans-serif';

/** Chunky outlined game text. */
export function chunkyText(g, text, x, y, { size = 64, fill = '#fff', stroke = '#1b2440', strokeW = size * 0.18, align = 'center', baseline = 'middle', weight = 900, maxW = 0, shadow = true, gradient = null } = {}) {
  g.save();
  let s = size;
  g.font = `${weight} ${s}px ${SIGN_FONT}`;
  if (maxW) {
    const w = g.measureText(text).width;
    if (w > maxW) {
      s = Math.floor(s * maxW / w);
      g.font = `${weight} ${s}px ${SIGN_FONT}`;
      strokeW *= s / size;
    }
  }
  g.textAlign = align;
  g.textBaseline = baseline;
  g.lineJoin = 'round';
  g.miterLimit = 2;
  if (shadow) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = strokeW;
    g.strokeText(text, x, y + s * 0.09);
    g.fillText(text, x, y + s * 0.09);
  }
  if (strokeW > 0) {
    g.strokeStyle = stroke;
    g.lineWidth = strokeW;
    g.strokeText(text, x, y);
  }
  if (gradient) {
    const gr = g.createLinearGradient(0, y - s / 2, 0, y + s / 2);
    gradient.forEach((c, i) => gr.addColorStop(i / (gradient.length - 1), c));
    g.fillStyle = gr;
  } else g.fillStyle = fill;
  g.fillText(text, x, y);
  g.restore();
  return s;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ------------------------------------------------------------------ shader helpers

// Shared animation clock for every world shader.
export const uTime = { value: 0 };

/** ShaderMaterial wired for scene fog + tone mapping like the built-in materials. */
export function fogShader({ uniforms = {}, vertex, fragment, transparent = false, side = THREE.FrontSide, blending = THREE.NormalBlending, depthWrite = true, fog = true, defines = {} }) {
  const u = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  Object.assign(u, uniforms);
  u.uTime = uTime;
  return new THREE.ShaderMaterial({
    uniforms: u,
    defines,
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime;
      ${vertex}`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      ${fragment}`,
    transparent,
    side,
    blending,
    depthWrite,
    fog,
  });
}

// GLSL snippet: value noise + fbm
export const GLSL_NOISE = `
  float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
`;

export { _col };
