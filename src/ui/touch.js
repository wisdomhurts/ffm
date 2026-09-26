// Touch controls. Contract: createTouchControls(app) -> { setVisible(bool), update(dt), dispose() }
// Floating joystick (left), camera drag + pinch (right), Jump / Bonk / contextual Action buttons.
// Writes into app.input.virtual and uses app.input.tap(); visible only on touch devices while playing.
import { rarityColor } from '../view/gameView.js';
import { h, setText, setStyle, toggle } from './dom.js';
import { ICON, NOODLE } from './icons.js';
import { isTouch, onTouchChange } from './device.js';

const RING_C = 2 * Math.PI * 44;

export function createTouchControls(app) {
  const v = () => app.input.virtual;
  const root = h('div', { class: 'touch', 'aria-hidden': 'true' });
  const camZone = h('div', { class: 'tz tz-cam' });
  const moveZone = h('div', { class: 'tz tz-move' });
  const knob = h('div', { class: 'knob' });
  const stick = h('div', { class: 'stick' }, knob);
  const idle = h('div', { class: 'stick-idle' }, h('span'));
  const jump = h('button', { class: 'tb tb-jump', type: 'button', 'aria-label': 'Jump', html: ICON.jump });
  const bonk = h('button', { class: 'tb tb-bonk', type: 'button', 'aria-label': 'Bonk', html: NOODLE });
  const actVerb = h('span', { class: 'ta-verb' });
  const act = h('button', { class: 'tb tb-act', type: 'button', 'aria-label': 'Action' },
    h('span', { class: 'ta-ring', html: `<svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${RING_C.toFixed(1)}"/></svg>` }),
    actVerb);
  const actFg = act.querySelector('.fg');
  root.append(camZone, moveZone, idle, stick, bonk, jump, act);
  app.root.appendChild(root);

  let wanted = false;
  let on = false;
  const R = 58; // joystick radius in px

  // ---------------------------------------------------------------- joystick
  let stickId = null;
  let ox = 0, oy = 0;
  function stickStart(e) {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    moveZone.setPointerCapture?.(e.pointerId);
    ox = e.clientX;
    oy = e.clientY;
    stick.style.transform = `translate(${ox}px,${oy}px)`;
    knob.style.transform = 'translate(0px,0px)';
    stick.classList.add('show');
    idle.classList.add('away');
  }
  function stickMove(e) {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    let len = Math.hypot(dx, dy);
    // let the base follow a thumb that drifts too far
    if (len > R * 1.35) {
      const k = (len - R * 1.35) / len;
      ox += dx * k;
      oy += dy * k;
      stick.style.transform = `translate(${ox}px,${oy}px)`;
      dx = e.clientX - ox;
      dy = e.clientY - oy;
      len = Math.hypot(dx, dy);
    }
    const cl = Math.min(len, R);
    const nx = len > 0 ? (dx / len) * cl : 0;
    const ny = len > 0 ? (dy / len) * cl : 0;
    knob.style.transform = `translate(${nx.toFixed(1)}px,${ny.toFixed(1)}px)`;
    let mx = nx / R;
    let my = -ny / R;
    const m = Math.hypot(mx, my);
    if (m < 0.12) mx = my = 0;
    const iv = v();
    iv.moveX = mx;
    iv.moveY = my;
    iv.active = true;
  }
  function stickEnd(e) {
    if (e && e.pointerId !== stickId) return;
    stickId = null;
    const iv = v();
    iv.moveX = iv.moveY = 0;
    iv.active = false;
    stick.classList.remove('show');
    idle.classList.remove('away');
  }
  moveZone.addEventListener('pointerdown', stickStart);
  moveZone.addEventListener('pointermove', stickMove);
  moveZone.addEventListener('pointerup', stickEnd);
  moveZone.addEventListener('pointercancel', stickEnd);

  // ---------------------------------------------------------------- camera drag + pinch
  const cams = new Map();
  let pinchD = 0;
  const pinchDist = () => {
    const [a, b] = [...cams.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  camZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    camZone.setPointerCapture?.(e.pointerId);
    cams.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cams.size === 2) pinchD = pinchDist();
  });
  camZone.addEventListener('pointermove', (e) => {
    const p = cams.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const iv = v();
    if (cams.size === 1) {
      iv.camDX += dx * 1.25;
      iv.camDY += dy * 1.0;
    } else if (cams.size === 2) {
      const d = pinchDist();
      iv.pinch += (pinchD - d) * 0.03;
      pinchD = d;
    }
  });
  const camEnd = (e) => {
    cams.delete(e.pointerId);
    if (cams.size === 2) pinchD = pinchDist();
  };
  camZone.addEventListener('pointerup', camEnd);
  camZone.addEventListener('pointercancel', camEnd);

  // ---------------------------------------------------------------- buttons
  const press = (el, down, upFn) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('down');
      down();
    });
    const up = () => {
      el.classList.remove('down');
      upFn?.();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  press(jump, () => app.input.tap('jump'));
  press(bonk, () => app.input.tap('bonk'));
  press(act, () => {
    v().interact = true;
    app.input.tap('interact');
  }, () => {
    v().interact = false;
  });

  function releaseAll() {
    stickEnd();
    cams.clear();
    const iv = app.input?.virtual;
    if (iv) {
      iv.interact = false;
      iv.moveX = iv.moveY = 0;
      iv.active = false;
    }
    [jump, bonk, act].forEach((b) => b.classList.remove('down'));
  }

  function apply() {
    const next = wanted && isTouch();
    if (next === on) return;
    on = next;
    root.classList.toggle('on', on);
    if (!on) releaseAll();
  }
  const offTouch = onTouchChange(apply);

  let lastKey = null;
  return {
    setVisible(b) {
      wanted = !!b;
      apply();
    },
    update() {
      if (!on) return;
      const me = app.human;
      if (!me) return;
      const it = me.interact;
      const has = !!it?.key && app.state === 'playing';
      toggle(act, 'show', has);
      if (has) {
        if (it.key !== lastKey) {
          lastKey = it.key;
          act.classList.remove('pop');
          void act.offsetWidth;
          act.classList.add('pop');
        }
        setText(actVerb, it.verb || 'Use');
        setStyle(act, '--rc', it.rarity ? rarityColor(it.rarity) : '#ffffff');
        const f = it.hold > 0 ? Math.min(1, it.t / it.hold) : 0;
        setStyle(actFg, 'strokeDashoffset', (RING_C * (1 - f)).toFixed(1));
      } else lastKey = null;
      toggle(bonk, 'dim', !!me.carrying);
    },
    dispose() {
      offTouch();
      releaseAll();
      root.remove();
    },
  };
}
