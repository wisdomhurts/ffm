// Renderer, scene, lights and the frame loop. One Engine per page.
import * as THREE from 'three';
import { settings } from './settings.js';
import { bus } from './events.js';

export function detectQuality() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch && small) return 'low';
  if (touch || cores <= 4) return 'medium';
  return 'high';
}

export const QUALITY = {
  low: { pixelRatio: 1.25, shadows: false, shadowSize: 0, antialias: false, drawDistance: 260, decorDensity: 0.4 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, antialias: true, drawDistance: 360, decorDensity: 0.7 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, antialias: true, drawDistance: 480, decorDensity: 1 },
};

export class Engine {
  constructor(container) {
    this.container = container;
    this.qualityId = settings.quality === 'auto' ? detectQuality() : settings.quality;
    this.quality = QUALITY[this.qualityId];
    const renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = this.quality.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.id = 'game-canvas';
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      bus.emit('engine:contextlost');
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => bus.emit('engine:contextrestored'));
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.3, 1400);
    this.camera.position.set(0, 20, -30);

    // Lights: sky/ground fill + sun that follows the focus point so shadows stay crisp.
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x7a9a5a, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sun.position.set(40, 80, -30);
    this.sun.castShadow = this.quality.shadows;
    if (this.quality.shadows) {
      this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
      const s = 70;
      Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 260 });
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sunOffset = new THREE.Vector3(40, 80, -30);
    this.focus = new THREE.Vector3();

    this.updaters = new Set(); // fn(dt, time) called every frame before render
    this.time = 0;
    this.running = false;
    this.timeScale = 1;
    this._last = performance.now();
    this.fps = 60;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);
  }

  maxPixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.pixelRatio = Math.min(this.pixelRatio || this.maxPixelRatio(), this.maxPixelRatio());
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    bus.emit('engine:resize', { w, h });
  }

  // Dynamic resolution: drop the pixel ratio when frames are slow, raise it back when there's headroom.
  _adaptResolution(dt) {
    this._arT = (this._arT || 0) + dt;
    this._arN = (this._arN || 0) + 1;
    if (this._arT < 2) return;
    const avg = this._arT / this._arN;
    this._arT = this._arN = 0;
    const max = this.maxPixelRatio();
    const cur = this.pixelRatio || max;
    let next = cur;
    if (avg > 1 / 40) next = Math.max(0.75, cur - 0.25);
    else if (avg < 1 / 55) next = Math.min(max, cur + 0.25);
    if (Math.abs(next - cur) > 0.01) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight);
    }
  }

  setFocus(x, y, z) {
    this.focus.set(x, y, z);
    this.sun.target.position.copy(this.focus);
    this.sun.position.copy(this.focus).add(this.sunOffset);
  }

  add(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  frame(forcedDt) {
    const nowMs = performance.now();
    let dt = forcedDt ?? Math.min((nowMs - this._last) / 1000, 0.1);
    this._last = nowMs;
    dt *= this.timeScale;
    this.time += dt;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    if (forcedDt == null) this._adaptResolution(dt);
    for (const fn of this.updaters) {
      try {
        fn(dt, this.time);
      } catch (e) {
        console.error('[engine] updater failed', e);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
