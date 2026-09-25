// The pet studio: one small extra WebGL renderer (created on first use, kept for the page's life) that
// paints pet/egg thumbnails for the UI and drives the full-screen hatch stage. It shares the cached pet
// geometry/materials with the game. If WebGL is unavailable here, callers fall back to CSS art.
//   thumb(kind: 'pet'|'egg', id, size=160) -> dataURL | null   (cached)
//   openStage() -> {canvas, scene, camera, render(cssW, cssH), close()} | null
import * as THREE from 'three';
import { createPetModel } from './models.js';
import { createEgg } from './eggs.js';

let S = null;
const cache = new Map();

function init() {
  if (S) return S.dead ? null : S;
  try {
    const canvas = document.createElement('canvas');
    canvas.className = 'pet-studio-canvas';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
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
    S = { renderer, canvas, scene, camera, dead: false, stage: null };
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      S.dead = true;
    });
  } catch (e) {
    console.warn('[pets] studio unavailable', e);
    S = { dead: true };
    return null;
  }
  return S;
}

export const studioOK = () => !!init();

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
  const st = init();
  if (!st) return null;
  let url = null;
  let obj = null;
  let dispose = null;
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
    const hidden = st.stage?.root;
    if (hidden) hidden.visible = false;
    st.scene.add(obj);
    frame(st.camera, obj, { yaw: 0.12, pitch: 0.16, fill: kind === 'egg' ? 1.05 : 1.12 });
    st.renderer.setPixelRatio(1);
    st.renderer.setSize(size, size, false);
    st.renderer.render(st.scene, st.camera);
    url = st.canvas.toDataURL('image/png');
    st.scene.remove(obj);
    if (hidden) hidden.visible = true;
    // a live hatch stage shares the canvas: put its frame back before the browser shows this one
    st.stage?.render();
  } catch (e) {
    console.warn('[pets] thumbnail failed', e);
  }
  dispose?.();
  if (url) cache.set(k, url);
  return url;
}

/** Take over the studio canvas for a live scene (the hatch). Only one stage at a time. */
export function openStage() {
  const st = init();
  if (!st) return null;
  st.stage?.close();
  const root = new THREE.Group();
  root.name = 'stage';
  st.scene.add(root);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  let w = 300, h = 300;
  const stage = {
    canvas: st.canvas,
    root,
    camera,
    get dead() {
      return st.dead;
    },
    setSize(cssW, cssH) {
      w = Math.max(16, Math.round(cssW));
      h = Math.max(16, Math.round(cssH));
    },
    render() {
      if (st.dead) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      st.renderer.setPixelRatio(dpr);
      st.renderer.setSize(w, h, false);
      if (camera.aspect !== w / h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      st.renderer.render(st.scene, camera);
    },
    close() {
      if (st.stage !== stage) return;
      camera.clearViewOffset();
      st.stage = null;
      st.scene.remove(root);
      st.canvas.remove();
    },
  };
  st.stage = stage;
  return stage;
}
