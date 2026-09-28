// Speedometer + Boost + speed gears. A HUD widget (docs/ONLINE.md "HUD widgets"):
//   mountSpeedo(app, hudRoot, anchors) -> {update(dt, t), dispose()}
// Mouse/keyboard: a round gauge left of the hotbar: needle = how fast you're going, the number = studs/s,
// the gear chip (click or X) = how much of your top speed the keys ask for, the outer ring = Boost charge
// (Shift), and a pink glow while you're Pumped (warm-up treadmill). While you warm up, the ring shows it.
// Touch: a Boost button (with its charge ring) by the thumb buttons, and a small gear chip above it.
import { GEARS, BOOST, TREADMILL } from '../config.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { h, setText, toggle, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { isTouch, onTouchChange } from './device.js';

const R = 40; // dial radius (viewBox 100)
const ARC = Math.PI * 1.5; // 270 degree dial
const ARC_LEN = R * ARC;
const RING = 2 * Math.PI * 46;
const GEAR_ICON = ['<b>1</b>', '<b>2</b>', '<b>3</b>'];

let styled = false;
function injectCSS() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const el = document.createElement('style');
  el.id = 'sas-speedo';
  el.textContent = `
.speedo{position:absolute;right:calc(100% + 12px);bottom:-4px;width:96px;height:96px;pointer-events:auto;user-select:none}
.speedo svg{width:100%;height:100%;overflow:visible}
.speedo .sd-bg{fill:rgba(16,22,58,.72);stroke:rgba(10,14,40,.7);stroke-width:4}
.speedo .sd-track{fill:none;stroke:rgba(255,255,255,.16);stroke-width:7;stroke-linecap:round}
.speedo .sd-fill{fill:none;stroke:url(#sdGrad);stroke-width:7;stroke-linecap:round;transition:stroke-dashoffset .12s linear}
.speedo .sd-ring{fill:none;stroke:#b36bff;stroke-width:4;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50px 50px;opacity:.9}
.speedo.ready .sd-ring{stroke:#d7b8ff;filter:drop-shadow(0 0 4px #b36bff)}
.speedo.warm .sd-ring{stroke:#3ff0ff}
.speedo .sd-needle{stroke:#fff;stroke-width:3.2;stroke-linecap:round;transform-origin:50px 54px;transition:transform .12s linear}
.speedo .sd-hub{fill:#fff;stroke:#10163a;stroke-width:2}
.sd-num{position:absolute;left:0;right:0;top:57%;text-align:center;font:var(--fdw) 19px/1 var(--fd);color:#fff;text-shadow:var(--o1)}
.sd-unit{position:absolute;left:0;right:0;top:78%;text-align:center;font:900 8.5px/1 var(--fb);letter-spacing:.08em;color:var(--txt2)}
.sd-gear{position:absolute;left:-8px;top:-6px;min-width:30px;height:28px;padding:0 7px;display:flex;align-items:center;justify-content:center;gap:3px;border-radius:14px;border:2.5px solid var(--ink);
  background:linear-gradient(180deg,#ffe36b,#f0a515);color:var(--ink);font:900 11px/1 var(--fb);cursor:pointer;box-shadow:0 3px 0 var(--ink);pointer-events:auto}
.sd-gear b{font:var(--fdw) 15px/1 var(--fd)}
.sd-gear.g0{background:linear-gradient(180deg,#9ee8ff,#3d9bff)}
.sd-gear.g1{background:linear-gradient(180deg,#b9f5a0,#4cd964)}
.sd-boost{position:absolute;right:-10px;top:-8px;padding:3px 6px;border-radius:9px;border:2px solid var(--ink);background:#2a1b5c;color:#d7b8ff;font:900 9.5px/1 var(--fb);letter-spacing:.04em;opacity:.55}
.speedo.ready .sd-boost{opacity:1;background:#7a3fe0;color:#fff}
.speedo.boosting{animation:sdShake .12s linear infinite}
.speedo.pumped .sd-bg{stroke:#ff4fd8;filter:drop-shadow(0 0 7px #ff4fd8)}
@keyframes sdShake{50%{transform:translate(1px,-1px)}}
.is-touch .speedo{display:none}
.tb-boost{position:absolute;z-index:3;right:calc(var(--sr) + 176px);bottom:calc(var(--sb) + 100px);width:62px;height:62px;padding:0;display:none;place-items:center;border-radius:50%;
  border:3.5px solid var(--ink);color:#fff;pointer-events:auto;touch-action:none;cursor:pointer;background:radial-gradient(circle at 42% 30%,#d7b8ff,#7a3fe0);
  box-shadow:inset 0 3px 0 rgba(255,255,255,.3),0 5px 0 var(--ink)}
.is-touch .touch.on ~ .hud .tb-boost,.is-touch .hud .tb-boost.on{display:grid}
.tb-boost .bi{display:grid;place-items:center;color:#fff;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35))}
.tb-boost .bi svg{width:34px;height:34px}
.tb-boost .tbb-ring{position:absolute;inset:-7px;width:calc(100% + 14px);height:calc(100% + 14px);transform:rotate(-90deg);pointer-events:none}
.tb-boost .tbb-ring circle{fill:none;stroke-width:6;stroke-linecap:round}
.tb-boost .tbb-ring .bg{stroke:rgba(10,14,40,.45)}
.tb-boost .tbb-ring .fg{stroke:#e5ccff}
.tb-boost.cool{filter:saturate(.45) brightness(.85)}
.tb-boost.down{transform:scale(.92)}
.tb-boost.boosting{box-shadow:inset 0 3px 0 rgba(255,255,255,.3),0 5px 0 var(--ink),0 0 18px #b36bff}
.tb-gear{position:absolute;z-index:3;right:calc(var(--sr) + 190px);bottom:calc(var(--sb) + 172px);display:none;min-width:36px;height:30px;padding:0 8px;align-items:center;justify-content:center;gap:4px;
  border-radius:15px;border:3px solid var(--ink);background:linear-gradient(180deg,#ffe36b,#f0a515);color:var(--ink);font:900 11px/1 var(--fb);pointer-events:auto;touch-action:none;box-shadow:0 3px 0 var(--ink)}
.tb-gear b{font:var(--fdw) 15px/1 var(--fd)}
.tb-gear.g0{background:linear-gradient(180deg,#9ee8ff,#3d9bff)}
.tb-gear.g1{background:linear-gradient(180deg,#b9f5a0,#4cd964)}
.is-touch .hud .tb-gear.on{display:flex}
`;
  document.head.appendChild(el);
}

export function mountSpeedo(app, hudRoot, anchors) {
  const me = app.human;
  const game = app.game;
  if (!me || !game) return null;
  injectCSS();
  const start = Math.PI * 0.75; // dial from 135 degrees (bottom left) round to 45 degrees (bottom right)
  const arcPath = (r) => {
    const a0 = start, a1 = start + ARC;
    const x0 = 50 + Math.cos(a0) * r, y0 = 54 + Math.sin(a0) * r, x1 = 50 + Math.cos(a1) * r, y1 = 54 + Math.sin(a1) * r;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const gauge = h('div', { class: 'speedo', title: 'Speed (X changes gear, Shift = Boost)' });
  gauge.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="sdGrad" x1="0" x2="1"><stop offset="0" stop-color="#4cd964"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff4d6d"/></linearGradient></defs>
    <circle class="sd-bg" cx="50" cy="50" r="48"/>
    <circle class="sd-ring" cx="50" cy="50" r="46" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="0"/>
    <path class="sd-track" d="${arcPath(R)}"/>
    <path class="sd-fill" d="${arcPath(R)}" stroke-dasharray="${ARC_LEN.toFixed(1)}" stroke-dashoffset="${ARC_LEN.toFixed(1)}"/>
    <line class="sd-needle" x1="50" y1="54" x2="50" y2="${54 - R + 8}"/>
    <circle class="sd-hub" cx="50" cy="54" r="4.5"/></svg>`;
  const num = h('span', { class: 'sd-num' });
  const unit = h('span', { class: 'sd-unit', text: 'STUDS/S' });
  const gearChip = h('button', { class: 'sd-gear', type: 'button', 'aria-label': 'Change speed gear' });
  const boostTag = h('span', { class: 'sd-boost', text: 'SHIFT' });
  gauge.append(num, unit, gearChip, boostTag);
  const fill = gauge.querySelector('.sd-fill');
  const needle = gauge.querySelector('.sd-needle');
  const ring = gauge.querySelector('.sd-ring');
  const row = anchors?.bottom?.querySelector('.hb-row');
  (row || hudRoot).appendChild(gauge);

  // touch: boost button + gear chip by the thumb buttons
  const tBoost = h('button', { class: 'tb-boost', type: 'button', 'aria-label': 'Boost' });
  tBoost.innerHTML = `<svg class="tbb-ring" viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" stroke-dasharray="${(2 * Math.PI * 44).toFixed(1)}" stroke-dashoffset="0"/></svg><span class="bi">${ICON.boost}</span>`;
  const tRing = tBoost.querySelector('.fg');
  const tGear = h('button', { class: 'tb-gear', type: 'button', 'aria-label': 'Change speed gear' });
  hudRoot.append(tBoost, tGear);

  const cycle = () => {
    app.humanCtrl?.cycleGear?.();
    uiSound(app, 'click');
  };
  gearChip.addEventListener('click', cycle);
  const press = (el, fn) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('down');
      fn();
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  press(tBoost, () => app.input.tap('boost'));
  press(tGear, cycle);
  const placeTouch = () => {
    const t = isTouch();
    toggle(tBoost, 'on', t);
    toggle(tGear, 'on', t);
  };
  placeTouch();
  const offTouch = onTouchChange(placeTouch);

  let shown = 0;
  let acc = 1;
  let gearShown = -1;
  const offGear = bus.on('gear:changed', () => (gearShown = -1));
  const TR = 2 * Math.PI * 44;
  return {
    update(dt) {
      const now = game.time;
      const v = Math.hypot(me.vel.x, me.vel.z);
      shown += (v - shown) * Math.min(1, dt * 10);
      acc += dt;
      if (acc < 1 / 20) return;
      acc = 0;
      const top = Math.max(1, me.maxSpeed(now));
      // the dial's full scale: your top speed with a boost, so the needle has room to jump
      const scale = top * (now < me.boostUntil ? 1.05 : BOOST.power(me.boostLevel));
      const f = Math.max(0, Math.min(1, shown / scale));
      fill.setAttribute('stroke-dashoffset', (ARC_LEN * (1 - f)).toFixed(1));
      needle.style.transform = `rotate(${(-135 + 270 * f).toFixed(1)}deg)`;
      setText(num, String(Math.round(shown)));
      const charge = me.boostCharge(now);
      const boosting = now < me.boostUntil;
      const tier = TREADMILL.tiers[me.treadmillTier] || TREADMILL.tiers[0];
      const warming = me.trainT > 0.05;
      const ringF = warming ? Math.min(1, me.trainT / tier.warmup) : boosting ? (me.boostUntil - now) / BOOST.duration(me.boostLevel) : charge;
      ring.setAttribute('stroke-dashoffset', (RING * (1 - ringF)).toFixed(1));
      toggle(gauge, 'ready', charge >= 1 && !warming);
      toggle(gauge, 'warm', warming);
      toggle(gauge, 'boosting', boosting);
      toggle(gauge, 'pumped', now < me.pumpUntil);
      setText(boostTag, warming ? 'WARM UP' : boosting ? 'BOOST!' : charge >= 1 ? 'SHIFT' : `${Math.ceil((1 - charge) * BOOST.cooldown(me.boostLevel))}s`);
      tRing.setAttribute('stroke-dashoffset', (TR * (1 - (boosting ? 1 : charge))).toFixed(1));
      toggle(tBoost, 'cool', charge < 1 && !boosting);
      toggle(tBoost, 'boosting', boosting);
      const gi = settings.speedGear ?? GEARS.length - 1;
      if (gi !== gearShown) {
        gearShown = gi;
        const g = GEARS[gi] || GEARS[GEARS.length - 1];
        for (const el of [gearChip, tGear]) {
          el.innerHTML = `${GEAR_ICON[gi] || ''}<span>${g.name.toUpperCase()}</span>`;
          el.className = el.className.replace(/\bg\d\b/g, '').trim() + ' g' + gi;
          el.title = `Gear: ${g.name} (${Math.round(g.mult * 100)}% of your top speed)`;
        }
      }
    },
    dispose() {
      offTouch();
      offGear();
      gauge.remove();
      tBoost.remove();
      tGear.remove();
    },
  };
}
