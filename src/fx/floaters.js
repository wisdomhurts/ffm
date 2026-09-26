// Juicy world-anchored popup text ("+$1.2K", "BONK!", "STOLEN!", "MYTHIC!").
// A fixed pool of DOM elements positioned each frame by projecting their 3D anchor, like view/labels.js.
// Each popup: pop-in with overshoot, drifts up, then fades. Popups sharing a `key` merge (the text updates and
// re-pops) so fast repeated events such as cash ticks read as one growing number.
import * as THREE from 'three';

const CSS = `
.fx-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:strict;z-index:1}
.fxf{position:absolute;left:0;top:0;display:none;white-space:nowrap;will-change:transform,opacity;
  font-family:var(--fd,'Lilita One','Fredoka','Baloo 2','Arial Rounded MT Bold','Arial Black',system-ui,sans-serif);
  font-weight:900;font-synthesis:none;letter-spacing:.02em;line-height:1;isolation:isolate;--c:#fff;--c2:#dfe6ff;--o:#1b2440}
.fxf .o,.fxf .t{display:block;padding:.08em .12em}
.fxf .o{color:var(--o);-webkit-text-stroke:.2em var(--o);text-shadow:0 .1em 0 var(--o),0 .16em .22em rgba(0,0,0,.35)}
.fxf .t{position:absolute;left:0;top:0;color:var(--c);
  background:linear-gradient(180deg,#fff 0%,var(--c) 38%,var(--c2) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.fxf.money{--c:#7dff5a;--c2:#1fbf3a;--o:#08451a}
.fxf.bad{--c:#ff5b5b;--c2:#d2102a;--o:#3d0008}
.fxf.good{--c:#6dfbd8;--c2:#14b8a6;--o:#063d3a}
.fxf.info{--c:#ffffff;--c2:#cfd9ff;--o:#1b2440}
.fxf.speed{--c:#8ff0ff;--c2:#2a9dff;--o:#06245a;font-style:italic}
.fxf.gold{--c:#ffe36b;--c2:#ff9f1a;--o:#4a2400}
.fxf.rarity{--o:#160c2a}
.fxf.rainbow .t{background:linear-gradient(90deg,#ff4d6d,#ffb627,#fff04d,#4cd964,#3d9bff,#b36bff,#ff4d6d);background-size:200% 100%;
  -webkit-background-clip:text;background-clip:text;animation:fxf-rb 1s linear infinite}
@keyframes fxf-rb{to{background-position:200% 0}}
.fxf.comic{--c:#fff45c;--c2:#ffae00;--o:#3a0d00}
.fxf.comic::before,.fxf.comic::after{content:'';position:absolute;z-index:-1;left:50%;top:50%;
  clip-path:polygon(50% 0%,59% 24%,79% 7%,74% 33%,100% 28%,80% 48%,98% 66%,72% 64%,78% 92%,57% 74%,45% 100%,38% 73%,14% 90%,24% 63%,0% 58%,21% 43%,4% 18%,31% 27%,34% 3%)}
.fxf.comic::before{width:142%;height:232%;transform:translate(-50%,-52%);background:#3a0d00}
.fxf.comic::after{width:129%;height:206%;transform:translate(-50%,-52%);background:var(--burst,#ff3d2e)}
.fxf.s{font-size:18px}.fxf.m{font-size:25px}.fxf.l{font-size:34px}.fxf.xl{font-size:46px}
`;

let styled = false;
function injectCSS() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'fx-floaters-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const v = new THREE.Vector3();
const SIZE_PX = { s: 18, m: 25, l: 34, xl: 46 };
const backOut = (x, c1) => {
  const u = x - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
};

export class Floaters {
  constructor(container, camera, max = 28) {
    injectCSS();
    this.camera = camera;
    this.root = document.createElement('div');
    this.root.className = 'fx-layer';
    // above the world labels (z-index 1, earlier in the DOM), below the HUD/menus (#ui, z-index 2)
    const ui = container.querySelector?.('#ui');
    if (ui && ui.parentNode === container) container.insertBefore(this.root, ui);
    else container.appendChild(this.root);
    this.items = [];
    for (let i = 0; i < max; i++) {
      const el = document.createElement('div');
      el.className = 'fxf';
      const o = document.createElement('span');
      o.className = 'o';
      const t = document.createElement('span');
      t.className = 't';
      el.append(o, t);
      this.root.appendChild(el);
      this.items.push({
        el, o, t, active: false, text: '', cls: '', key: null, age: 0, dur: 1, x: 0, y: 0, z: 0, follow: null, fy: 0,
        rise: 2.5, rot: 0, stack: 0, pop: 1.7, maxDist: 90, visible: false, born: 0,
      });
    }
    this.clock = 0;
    this.w = 1;
    this.h = 1;
  }

  /**
   * @param {string} text
   * @param {{x,y,z}} pos world anchor
   * @param {object} o {style:'money'|'bad'|'good'|'info'|'speed'|'gold'|'comic'|'rarity', color, color2, size:'s'|'m'|'l'|'xl',
   *                    duration, key, follow:{x,y,z} (anchor tracks this object, pos.y used as offset), rise, maxDist, rainbow, burst}
   */
  add(text, pos, o = {}) {
    const now = this.clock;
    let it = null;
    if (o.key) {
      for (const f of this.items) {
        if (f.active && f.key === o.key && f.age < (o.mergeWindow ?? 1.1)) {
          it = f;
          break;
        }
      }
      if (it) {
        if (it.text !== text) {
          it.text = text;
          it.o.textContent = text;
          it.t.textContent = text;
        }
        it.age = Math.min(it.age, 0.06);
        it.pop = 1.25;
        if (!o.follow) {
          it.x = pos.x;
          it.y = pos.y;
          it.z = pos.z;
        }
        return it;
      }
    }
    // free slot, else recycle the oldest
    let oldest = null;
    for (const f of this.items) {
      if (!f.active) {
        it = f;
        break;
      }
      if (!oldest || f.born < oldest.born) oldest = f;
    }
    it ||= oldest;
    it.active = true;
    it.born = now;
    it.key = o.key || null;
    it.age = 0;
    it.dur = o.duration ?? 1.3;
    it.follow = o.follow || null;
    it.x = pos.x;
    it.y = pos.y;
    it.z = pos.z;
    it.rise = o.rise ?? 2.6;
    it.maxDist = o.maxDist ?? 95;
    it.pop = o.style === 'comic' ? 2.4 : 1.8;
    it.rot = o.style === 'comic' ? (Math.random() - 0.5) * 16 : (Math.random() - 0.5) * 5;
    // stack above recent popups at the same spot
    let stack = 0;
    for (const f of this.items) {
      if (f === it || !f.active || f.age > 1) continue;
      const fx = f.follow ? f.follow.x : f.x, fz = f.follow ? f.follow.z : f.z;
      const px = o.follow ? o.follow.x : pos.x, pz = o.follow ? o.follow.z : pos.z;
      if ((fx - px) ** 2 + (fz - pz) ** 2 < 9) stack++;
    }
    it.stack = Math.min(stack, 3) * (SIZE_PX[o.size] || SIZE_PX.m) * 1.2;
    const cls = `fxf ${o.style || 'info'} ${o.size || 'm'}${o.rainbow ? ' rainbow' : ''}`;
    if (cls !== it.cls) {
      it.el.className = cls;
      it.cls = cls;
    }
    // per-popup colour overrides (CSS custom properties); unset ones fall back to the style class
    const st = it.el.style;
    const prop = (name, val) => (val ? st.setProperty(name, val) : st.removeProperty(name));
    prop('--c', o.color);
    prop('--c2', o.color2);
    prop('--o', o.outline);
    prop('--burst', o.burst);
    if (it.text !== text) {
      it.text = text;
      it.o.textContent = text;
      it.t.textContent = text;
    }
    it.el.style.opacity = '0';
    return it;
  }

  update(dt) {
    this.clock += dt;
    // the layer is full-viewport: read the window size (no forced layout mid-frame)
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const vmin = Math.min(this.w, this.h);
    const viewScale = Math.max(0.62, Math.min(1.15, vmin / 720));
    const cam = this.camera;
    for (const f of this.items) {
      if (!f.active) continue;
      f.age += dt;
      const t = f.age / f.dur;
      if (t >= 1) {
        f.active = false;
        f.key = null;
        f.follow = null;
        if (f.visible) {
          f.el.style.display = 'none';
          f.visible = false;
        }
        continue;
      }
      const ax = f.follow ? f.follow.x : f.x;
      const ay = (f.follow ? f.follow.y + f.y : f.y) + f.rise * (1 - (1 - t) ** 3);
      const az = f.follow ? f.follow.z : f.z;
      v.set(ax, ay, az);
      const dist = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || dist > f.maxDist || v.x < -1.3 || v.x > 1.3 || v.y < -1.3 || v.y > 1.3) {
        if (f.visible) {
          f.el.style.display = 'none';
          f.visible = false;
        }
        continue;
      }
      const ds = Math.max(0.5, Math.min(1.25, 30 / Math.max(8, dist)));
      const sx = (v.x * 0.5 + 0.5) * this.w;
      const sy = (-v.y * 0.5 + 0.5) * this.h - f.stack * ds * viewScale;
      const pin = Math.min(1, f.age / 0.24);
      let s = pin < 1 ? Math.max(0.05, backOut(pin, f.pop)) : 1;
      let alpha = Math.min(1, f.age / 0.05);
      if (t > 0.72) {
        const k = (t - 0.72) / 0.28;
        alpha *= 1 - k * k;
        s *= 1 + k * 0.18;
      }
      s *= ds * viewScale;
      const wob = f.age < 0.35 ? Math.sin(f.age * 38) * (0.35 - f.age) * 10 : 0;
      f.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)}) rotate(${(f.rot + wob).toFixed(1)}deg)`;
      f.el.style.opacity = alpha.toFixed(2);
      f.el.style.zIndex = String(10000 - Math.round(dist * 10));
      if (!f.visible) {
        f.el.style.display = 'block';
        f.visible = true;
      }
    }
  }

  clear() {
    for (const f of this.items) {
      f.active = false;
      f.key = null;
      f.follow = null;
      if (f.visible) {
        f.el.style.display = 'none';
        f.visible = false;
      }
    }
  }

  dispose() {
    this.clear();
    this.root.remove();
  }
}
