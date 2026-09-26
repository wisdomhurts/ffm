// The pet studio: one small extra WebGL renderer (created on first use) that paints pet/egg thumbnails for
// the UI and drives the hatch stage. It shares the cached pet geometry/materials with the game. If WebGL is
// unavailable here, callers fall back to CSS art.
//   configureStudio({engine})      the game engine: its quality (low/medium/high) and adaptive pixel ratio
//   thumb(kind: 'pet'|'egg', id, size=160) -> dataURL | null   (cached; null while the studio is unavailable)
//   onStudioReady(fn) -> off      fn() when the studio is usable again after a context loss (re-render placeholders)
//   openStage() -> {canvas, root, camera, lost, setSize(cssW, cssH), render(), close()} | null
// Context loss: three.js restores itself on 'webglcontextrestored'; if the browser has not brought the context
// back shortly after it is needed, the studio starts over with a fresh canvas + renderer. Quality: the stage
// caps its pixel ratio (1 on low, 1.25 on medium, 2 on high, never above the game's current ratio), turns
// antialiasing off on low and draws at ~30 fps on low, so it stays light on top of the running game.
import * as THREE from 'three';
import { createPetModel } from './models.js';
import { createEgg } from './eggs.js';

let S = null; // the live studio
let failedAt = -1e9;
let engineRef = null;
const cache = new Map();
const readyFns = new Set();
const RESTORE_GRACE_MS = 1500;
const RETRY_MS = 3000;

export function configureStudio({ engine } = {}) {
  if (engine) engineRef = engine;
}

const qualityId = () => engineRef?.qualityId || (typeof window !== 'undefined' && window.__app?.engine?.qualityId) || 'medium';
const wantAA = () => qualityId() !== 'low';

function notifyReady() {
  for (const fn of [...readyFns]) {
    try {
      fn();
    } catch (e) {
      console.warn('[pets] studio listener failed', e);
    }
  }
}

export function onStudioReady(fn) {
  readyFns.add(fn);
  return () => readyFns.delete(fn);
}

function create() {
  const canvas = document.createElement('canvas');
  canvas.className = 'pet-studio-canvas';
  const aa = wantAA();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: aa, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (renderer.getContext().isContextLost?.()) throw new Error('context lost at creation');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f96c8, 1.7));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.3);
  key.position.set(-3, 6, 7);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.3);
  rim.position.set(4, 3, -6);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  const st = { renderer, canvas, scene, camera, aa, lost: false, lostAt: 0, stage: null };
  // three.js's own listeners (registered first) keep the context restorable and re-initialise it on restore
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    markLost(st);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    st.lost = false;
    if (S === st) notifyReady();
  });
  return st;
}

function drop(st) {
  if (S === st) S = null;
  st.canvas.remove();
  try {
    st.renderer.dispose(); // detaches its context listeners so a late restore can't revive it
  } catch {
    /* a lost context may complain; it is being abandoned anyway */
  }
}

function markLost(st) {
  if (st.lost) return;
  st.lost = true;
  st.lostAt = performance.now();
  scheduleRecover(0);
}

// If nothing asks for the studio after a loss (e.g. the egg shop just sits there with placeholders), come back
// on our own: wait for the browser's restore, then rebuild; keep retrying for a while if WebGL is still down.
let recoverTimer = 0;
function scheduleRecover(tries) {
  clearTimeout(recoverTimer);
  if (tries > 6) return;
  recoverTimer = setTimeout(() => {
    if (S && !S.lost) return;
    if (!studio()) scheduleRecover(tries + 1);
  }, tries ? RETRY_MS : RESTORE_GRACE_MS + 50);
}

/** The usable studio, or null (lost for now / no WebGL). Rebuilds it when it stays lost or quality changed. */
function studio() {
  if (S && !S.lost && S.renderer.getContext().isContextLost?.()) markLost(S);
  if (S && !S.lost) {
    // quality changed (antialias is fixed per context): rebuild when nothing is on stage
    if (S.aa !== wantAA() && !S.stage) drop(S);
    else return S;
  }
  if (S && S.lost) {
    if (performance.now() - S.lostAt < RESTORE_GRACE_MS) return null;
    // not restored in time: start over with a fresh context (a live stage moves across on its next frame)
    const stage = S.stage;
    drop(S);
    if (!make()) return null;
    S.stage = stage;
    notifyReady();
    return S;
  }
  return make() ? S : null;
}

function make() {
  if (performance.now() - failedAt < RETRY_MS) return false;
  try {
    S = create();
    return true;
  } catch (e) {
    console.warn('[pets] studio unavailable', e);
    failedAt = performance.now();
    S = null;
    if (readyFns.size) scheduleRecover(1);
    return false;
  }
}

export const studioOK = () => !!studio();

const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _sz = new THREE.Vector3();

/** Point the camera at an object so it fills the frame (view from the front-right, a little above). */
export function frame(camera, obj, { yaw = 0.42, pitch = 0.22, fill = 1.0, aspect = 1 } = {}) {
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  _box.getCenter(_c);
  _box.getSize(_sz);
  const r = Math.max(_sz.x, _sz.y, _sz.z) * 0.62;
  const fov = (camera.fov * Math.PI) / 180;
  const d = (r / Math.sin(fov / 2)) / (fill * Math.min(1, aspect));
  camera.aspect = aspect;
  camera.position.set(_c.x + Math.sin(yaw) * Math.cos(pitch) * d, _c.y + Math.sin(pitch) * d, _c.z + Math.cos(yaw) * Math.cos(pitch) * d);
  camera.near = Math.max(0.02, d - r * 3);
  camera.far = d + r * 3;
  camera.updateProjectionMatrix();
  camera.lookAt(_c);
}

/** Already-rendered thumbnail or null (never renders). */
export const cachedThumb = (kind, id, size = 160) => cache.get(`${kind}:${id}:${size}`) || null;

/** A cached thumbnail (PNG data URL) of a pet or an egg, transparent background. */
export function thumb(kind, id, size = 160) {
  const k = `${kind}:${id}:${size}`;
  if (cache.has(k)) return cache.get(k);
  const st = studio();
  if (!st) return null;
  let url = null;
  let obj = null;
  let dispose = null;
  const hidden = st.stage?.root;
  try {
    if (kind === 'egg') {
      obj = createEgg(id);
      obj.rotation.y = 0.3;
    } else {
      const m = createPetModel(id, { fx: false, shadow: false });
      obj = m.root;
      obj.rotation.y = 0.5;
      if (m.wings.length) for (const w of m.wings) w.rotation.z = (m.wingBase + m.wingAmp * 0.6) * w.userData.side;
      dispose = () => m.dispose();
    }
    if (hidden) hidden.visible = false;
    st.scene.add(obj);
    frame(st.camera, obj, { yaw: 0.12, pitch: 0.16, fill: kind === 'egg' ? 1.05 : 1.12 });
    st.renderer.setPixelRatio(1);
    st.renderer.setSize(size, size, false);
    st.renderer.render(st.scene, st.camera);
    // a context lost mid-render gives a blank picture: don't cache it
    if (!st.renderer.getContext().isContextLost?.()) url = st.canvas.toDataURL('image/png');
    else markLost(st);
  } catch (e) {
    console.warn('[pets] thumbnail failed', e);
  }
  if (obj) st.scene.remove(obj);
  if (hidden) hidden.visible = true;
  dispose?.();
  // a live hatch stage shares the canvas: put its frame back before the browser shows this one
  st.stage?.render(true);
  if (url) cache.set(k, url);
  return url;
}

/** Stage pixel ratio: capped by quality, and never sharper than the game itself is running right now. */
function stageDpr() {
  const q = qualityId();
  const cap = q === 'low' ? 1 : q === 'medium' ? 1.25 : 2;
  let dpr = Math.min(window.devicePixelRatio || 1, cap);
  const game = engineRef?.pixelRatio;
  if (Number.isFinite(game) && game > 0) dpr = Math.min(dpr, Math.max(0.75, game));
  return dpr;
}

/** Take over the studio canvas for a live scene (the hatch). Only one stage at a time. */
export function openStage() {
  const st0 = studio();
  if (!st0) return null;
  st0.stage?.close();
  const root = new THREE.Group();
  root.name = 'stage';
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  let w = 300, h = 300;
  let lastDraw = -1e9;
  let closed = false;
  const stage = {
    root,
    camera,
    /** The canvas to show (it changes if the studio had to be rebuilt after a context loss). */
    get canvas() {
      return (S && S.stage === stage ? S : st0).canvas;
    },
    /** True while there is nothing to draw with (context lost, not yet restored or rebuilt). */
    get lost() {
      const st = studio();
      if (st && st.stage !== stage && !closed) st.stage = stage;
      return !st || st.lost;
    },
    setSize(cssW, cssH) {
      w = Math.max(16, Math.round(cssW));
      h = Math.max(16, Math.round(cssH));
    },
    render(force = false) {
      if (closed) return;
      const st = S && S.stage === stage ? S : null;
      if (!st || st.lost) return;
      if (st.renderer.getContext().isContextLost?.()) return markLost(st);
      // low quality: ~30 fps is plenty for the hatch and halves its cost on top of the game
      const now = performance.now();
      if (!force && qualityId() === 'low' && now - lastDraw < 30) return;
      lastDraw = now;
      if (root.parent !== st.scene) st.scene.add(root);
      st.renderer.setPixelRatio(stageDpr());
      st.renderer.setSize(w, h, false);
      if (camera.aspect !== w / h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      st.renderer.render(st.scene, camera);
    },
    close() {
      if (closed) return;
      closed = true;
      camera.clearViewOffset();
      root.parent?.remove(root);
      for (const st of [S, st0]) {
        if (st?.stage === stage) {
          st.stage = null;
          st.canvas.remove();
        }
      }
    },
  };
  st0.stage = stage;
  return stage;
}
