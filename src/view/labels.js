// World-anchored DOM labels (like Roblox BillboardGuis): name tags, plant info, prices, timers.
// Each label is keyed; call set(key, worldPos, html, opts) every frame you want it shown.
// Labels not touched during a frame are hidden. Styling lives in ui/styles (classes below).
import * as THREE from 'three';

const v = new THREE.Vector3();

export class Labels {
  constructor(container, camera) {
    this.root = document.createElement('div');
    this.root.className = 'labels-layer';
    container.appendChild(this.root);
    this.camera = camera;
    this.items = new Map();
    this.frame = 0;
    this.w = 1;
    this.h = 1;
  }

  begin() {
    this.frame++;
    this.w = this.root.clientWidth || window.innerWidth;
    this.h = this.root.clientHeight || window.innerHeight;
  }

  /**
   * @param {string} key
   * @param {{x,y,z}} pos world position
   * @param {string} html inner HTML (only re-rendered when it changes)
   * @param {object} [o] {cls, maxDist, minDist, scaleWithDistance}
   */
  set(key, pos, html, o = {}) {
    let it = this.items.get(key);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'lbl ' + (o.cls || '');
      this.root.appendChild(el);
      it = { el, html: null, cls: o.cls || '', seen: 0, visible: false };
      this.items.set(key, it);
    }
    if (o.cls != null && o.cls !== it.cls) {
      it.el.className = 'lbl ' + o.cls;
      it.cls = o.cls;
    }
    it.seen = this.frame;
    v.set(pos.x, pos.y, pos.z);
    const dist = v.distanceTo(this.camera.position);
    const maxDist = o.maxDist ?? 70;
    v.project(this.camera);
    const onScreen = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2 && dist < maxDist;
    if (!onScreen) {
      if (it.visible) {
        it.el.style.display = 'none';
        it.visible = false;
      }
      return;
    }
    if (it.html !== html) {
      it.el.innerHTML = html;
      it.html = html;
    }
    const x = (v.x * 0.5 + 0.5) * this.w;
    const y = (-v.y * 0.5 + 0.5) * this.h;
    const s = o.scaleWithDistance === false ? 1 : Math.max(0.55, Math.min(1.15, 26 / Math.max(8, dist)));
    const fade = dist > maxDist * 0.75 ? 1 - (dist - maxDist * 0.75) / (maxDist * 0.25) : 1;
    it.el.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    it.el.style.opacity = fade.toFixed(2);
    it.el.style.zIndex = String(10000 - Math.round(dist * 10));
    if (!it.visible) {
      it.el.style.display = '';
      it.visible = true;
    }
  }

  end() {
    for (const [k, it] of this.items) {
      if (it.seen !== this.frame) {
        if (it.visible) {
          it.el.style.display = 'none';
          it.visible = false;
        }
        if (this.frame - it.seen > 600) {
          it.el.remove();
          this.items.delete(k);
        }
      }
    }
  }

  clear() {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
  }

  dispose() {
    this.clear();
    this.root.remove();
  }
}
