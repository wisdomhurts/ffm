// World-anchored DOM labels (like Roblox BillboardGuis): name tags, plant info, prices, timers.
// Each label is keyed; call set(key, worldPos, html, opts) every frame you want it shown.
// Labels not touched during a frame are hidden. Styling lives in ui/styles (classes below).
// end() runs a small declutter pass: labels are placed by priority (then nearest first); one that
// overlaps an already-placed label is nudged up a little, and low-priority ones hide if still overlapping.
import * as THREE from 'three';

const v = new THREE.Vector3();

// default priority by class (higher wins the spot)
function priorityOf(cls) {
  if (cls.includes('monlbl') || cls.includes('thief')) return 6;
  if (cls.includes('nametag')) return 5;
  if (cls.includes('bubble')) return 4;
  if (cls.includes('compact')) return 1;
  if (cls.includes('plantlbl') || cls.includes('podlbl')) return 3;
  if (cls.includes('padlbl')) return 2;
  return 3;
}

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
    this._vis = [];
    this._placed = [];
  }

  begin() {
    this.frame++;
    // the layer is full-viewport: read the window size (no forced layout mid-frame)
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    // Measure labels whose content changed last frame. The browser has laid them out since,
    // so reading sizes here is cheap (no forced synchronous layout).
    for (const it of this.items.values()) {
      if (it.dirty && it.visible) {
        it.bw = it.el.offsetWidth || it.bw;
        it.bh = it.el.offsetHeight || it.bh;
        it.dirty = false;
      }
    }
  }

  /**
   * @param {string} key
   * @param {{x,y,z}} pos world position
   * @param {string} html inner HTML (only re-rendered when it changes)
   * @param {object} [o] {cls, maxDist, scaleWithDistance, priority, noDeclutter}
   */
  set(key, pos, html, o = {}) {
    let it = this.items.get(key);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'lbl ' + (o.cls || '');
      el.style.display = 'none'; // shown by end() once placed
      this.root.appendChild(el);
      it = { el, html: null, cls: o.cls || '', seen: 0, visible: false, bw: 80, bh: 28, dirty: true, pri: priorityOf(o.cls || '') };
      this.items.set(key, it);
    }
    if (o.cls != null && o.cls !== it.cls) {
      it.el.className = 'lbl ' + o.cls;
      it.cls = o.cls;
      it.pri = priorityOf(o.cls);
      it.dirty = true;
    }
    if (o.priority != null) it.pri = o.priority;
    it.noDeclutter = !!o.noDeclutter;
    it.seen = this.frame;
    v.set(pos.x, pos.y, pos.z);
    const dist = v.distanceTo(this.camera.position);
    const maxDist = o.maxDist ?? 70;
    v.project(this.camera);
    const onScreen = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2 && dist < maxDist;
    it.want = onScreen;
    if (!onScreen) return;
    if (it.html !== html) {
      it.dirty = true; // re-measured next frame (cheap: layout is clean by then)
      it.el.innerHTML = html;
      it.html = html;
    }
    it.sx = (v.x * 0.5 + 0.5) * this.w;
    it.sy = (-v.y * 0.5 + 0.5) * this.h;
    it.s = o.scaleWithDistance === false ? 1 : Math.max(0.55, Math.min(1.15, 26 / Math.max(8, dist)));
    it.fade = dist > maxDist * 0.75 ? 1 - (dist - maxDist * 0.75) / (maxDist * 0.25) : 1;
    it.dist = dist;
  }

  _show(it, dy, alpha, dx = 0) {
    const tf = `translate(-50%,-100%) translate(${(Math.round((it.sx + dx) * 2) / 2).toFixed(1)}px,${(Math.round((it.sy + dy) * 2) / 2).toFixed(1)}px) scale(${it.s.toFixed(2)})`;
    if (tf !== it.tf) it.el.style.transform = it.tf = tf;
    const op = alpha.toFixed(2);
    if (op !== it.op) it.el.style.opacity = it.op = op;
    const z = 10000 - Math.round(it.dist) + it.pri * 1000;
    if (z !== it.z) it.el.style.zIndex = String((it.z = z));
    if (!it.visible) {
      it.el.style.display = '';
      it.visible = true;
    }
  }

  _hide(it) {
    if (it.visible) {
      it.el.style.display = 'none';
      it.visible = false;
    }
  }

  end() {
    const vis = this._vis;
    vis.length = 0;
    for (const [k, it] of this.items) {
      if (it.seen !== this.frame || !it.want) {
        this._hide(it);
        if (this.frame - it.seen > 600) {
          it.el.remove();
          this.items.delete(k);
        }
        continue;
      }
      vis.push(it);
    }
    vis.sort((a, b) => b.pri - a.pri || a.dist - b.dist);
    const placed = this._placed;
    placed.length = 0;
    const hitAt = (x0, y0, x1, y1) => {
      for (const r of placed) if (x0 < r[2] - 2 && x1 > r[0] + 2 && y0 < r[3] - 2 && y1 > r[1] + 2) return r;
      return null;
    };
    for (const it of vis) {
      const w = it.bw * it.s, h = it.bh * it.s;
      let dx = 0;
      let dy = 0;
      let ok = it.noDeclutter;
      const important = it.pri >= 4;
      const maxShift = (important ? 160 : 46) * it.s;
      for (let tries = 0; !ok && tries < 6; tries++) {
        const y1 = it.sy + dy;
        const hit = hitAt(it.sx - w / 2, y1 - h, it.sx + w / 2, y1);
        if (!hit) {
          ok = true;
          break;
        }
        const shift = y1 - hit[1] + 2; // move up so our bottom sits on top of the other label
        if (-dy + shift > maxShift) break;
        dy -= shift;
      }
      if (!ok && important) {
        // no room above: step sideways at the original height, just clear of whatever is in the way
        dy = 0;
        let best = Infinity;
        for (const r of placed) {
          for (const cx of [r[0] - 2 - (it.sx + w / 2), r[2] + 2 - (it.sx - w / 2)]) {
            if (Math.abs(cx) >= best || Math.abs(cx) > w * 1.1) continue;
            if (!hitAt(it.sx + cx - w / 2, it.sy - h, it.sx + cx + w / 2, it.sy)) {
              best = Math.abs(cx);
              dx = cx;
              ok = true;
            }
          }
        }
      }
      if (!ok && it.pri <= 3) {
        this._hide(it);
        continue;
      }
      if (!ok) dx = dy = 0; // important labels stay put even if they overlap
      placed.push([it.sx + dx - w / 2, it.sy + dy - h, it.sx + dx + w / 2, it.sy + dy]);
      this._show(it, dy, it.fade, dx);
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
