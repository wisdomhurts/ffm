// Unified input: keyboard, mouse, touch (via ui/touch.js writing into `virtual`) and gamepads.
// Edge-triggered actions are latched until consumed once, so fixed-step simulation never misses a tap.

const KEY_ITEMS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.latched = { jump: false, bonk: false, item: null, select: null, pause: false, interactTap: false };
    this.mouse = { right: false, left: false, dx: 0, dy: 0, wheel: 0, x: 0, y: 0 };
    // Touch UI writes here (see ui/touch.js).
    this.virtual = { moveX: 0, moveY: 0, active: false, interact: false, camDX: 0, camDY: 0, pinch: 0 };
    this.enabled = true;
    this.lastDevice = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    this._gpPrev = {};

    this._kd = (e) => {
      if (isTyping(e)) return;
      this.lastDevice = 'keyboard';
      if (!this.keys.has(e.code)) this._edge(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._ku = (e) => this.keys.delete(e.code);
    this._blur = () => {
      this.keys.clear();
      this.mouse.right = this.mouse.left = false;
    };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Browsers synthesize mouse events after touches; ignore them so a camera drag never bonks.
    this._lastTouch = -1e9;
    window.addEventListener('touchstart', () => {
      this._lastTouch = performance.now();
      this.lastDevice = 'touch';
    }, { passive: true, capture: true });
    const fromTouch = () => performance.now() - this._lastTouch < 900;
    canvas.addEventListener('mousedown', (e) => {
      if (fromTouch()) return;
      this.lastDevice = 'keyboard';
      if (e.button === 2) this.mouse.right = true;
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftDownAt = performance.now();
        this.mouse.leftMoved = 0;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (fromTouch()) return;
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 0) {
        // quick left click (no drag) = bonk; left drag = orbit camera
        if (this.mouse.left && this.mouse.leftMoved < 6 && performance.now() - (this.mouse.leftDownAt || 0) < 350 && this.enabled) this.latched.bonk = true;
        this.mouse.left = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (fromTouch()) return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.mouse.right || this.mouse.left || document.pointerLockElement === canvas) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
        if (this.mouse.left) this.mouse.leftMoved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      }
    });
    canvas.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  _edge(code) {
    if (!this.enabled && code !== 'Escape') return;
    if (code === 'Space') this.latched.jump = true;
    if (code === 'KeyF') this.latched.bonk = true;
    if (code === 'KeyE') this.latched.interactTap = true;
    if (code === 'Escape' || code === 'KeyP') this.latched.pause = true;
    const i = KEY_ITEMS.indexOf(code);
    if (i >= 0) this.latched.item = i;
    if (code === 'KeyQ') this.latched.select = -1;
    if (code === 'KeyR') this.latched.select = 1;
  }

  // Call from UI buttons.
  tap(action, value) {
    if (action === 'jump') this.latched.jump = true;
    else if (action === 'bonk') this.latched.bonk = true;
    else if (action === 'item') this.latched.item = value;
    else if (action === 'pause') this.latched.pause = true;
    else if (action === 'interact') this.latched.interactTap = true;
  }

  // Movement in camera space: x = right, y = forward. Length <= 1.
  axis() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.virtual.active) {
      x += this.virtual.moveX;
      y += this.virtual.moveY;
    }
    const gp = this.gamepad();
    if (gp) {
      const ax = dead(gp.axes[0]), ay = dead(gp.axes[1]);
      if (ax || ay) {
        x += ax;
        y -= ay;
        this.lastDevice = 'gamepad';
      }
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  interactHeld() {
    const gp = this.gamepad();
    return this.enabled && (this.keys.has('KeyE') || this.virtual.interact || !!(gp && gp.buttons[1]?.pressed));
  }

  // Camera orbit delta in pixels since last call.
  takeCameraDelta() {
    let dx = this.mouse.dx + this.virtual.camDX;
    let dy = this.mouse.dy + this.virtual.camDY;
    this.mouse.dx = this.mouse.dy = 0;
    this.virtual.camDX = this.virtual.camDY = 0;
    const gp = this.gamepad();
    if (gp) {
      dx += dead(gp.axes[2]) * 14;
      dy += dead(gp.axes[3]) * 10;
    }
    if (this.keys.has('KeyZ') || this.keys.has('Comma')) dx -= 6;
    if (this.keys.has('KeyC') || this.keys.has('Period')) dx += 6;
    return { dx, dy };
  }

  takeZoom() {
    const z = this.mouse.wheel + this.virtual.pinch;
    this.mouse.wheel = 0;
    this.virtual.pinch = 0;
    let zz = z;
    if (this.keys.has('KeyI') || this.keys.has('Equal')) zz -= 0.2;
    if (this.keys.has('KeyO') || this.keys.has('Minus')) zz += 0.2;
    return zz;
  }

  // Latched edges, consumed once per frame by the human controller.
  take(name) {
    const v = this.latched[name];
    this.latched[name] = name === 'item' || name === 'select' ? null : false;
    return v;
  }

  pollGamepad() {
    const gp = this.gamepad();
    if (!gp) return;
    const b = (i) => !!gp.buttons[i]?.pressed;
    const prev = this._gpPrev;
    const edge = (i) => b(i) && !prev[i];
    if (edge(0)) this.latched.jump = true;
    if (edge(2)) this.latched.bonk = true;
    if (edge(1)) this.latched.interactTap = true;
    if (edge(3)) this.latched.item = 'selected';
    if (edge(4)) this.latched.select = -1;
    if (edge(5)) this.latched.select = 1;
    if (edge(9)) this.latched.pause = true;
    for (let i = 0; i < gp.buttons.length; i++) prev[i] = b(i);
    if (gp.buttons.some((x) => x.pressed)) this.lastDevice = 'gamepad';
  }

  gamepad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) return p;
    } catch {
      /* ignore */
    }
    return null;
  }

  reset() {
    this.keys.clear();
    for (const k of Object.keys(this.latched)) this.latched[k] = k === 'item' || k === 'select' ? null : false;
    this.virtual.moveX = this.virtual.moveY = 0;
    this.virtual.interact = false;
  }
}

function dead(v, d = 0.18) {
  if (!v || Math.abs(v) < d) return 0;
  return (v - Math.sign(v) * d) / (1 - d);
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
