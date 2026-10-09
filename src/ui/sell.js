// The Sell control. Selling a grown plant has its own button, so E / gamepad B / the touch Action button (grab,
// steal, unlock...) never sells by accident: keyboard V, gamepad D-pad down, and on touch a gold Sell coin that
// only shows while there's something to sell. Both are holds (PLAYER.sellHold), with a filling ring.
//   createSellPrompt(app, parent, me) -> {update()}   the gold "V Sell +$X" pill next to the E prompt (HUD)
//   createSellButton(app) -> {el, update(me)}          the touch coin (ui/touch.js presses it; the CSS here places it)
//   sellKeyName(app) -> 'V' | 'D-pad down' | 'Sell'   what to call the control in hints and tips (sellHow: 'hold V')
// Styles are injected once as <style id="sas-sell"> (full HUD, small phones and the Simple HUD).
import { rarityColor } from '../view/gameView.js';
import { h, setText, setStyle, toggle, money } from './dom.js';
import { isTouch } from './device.js';

const touchy = (app) => {
  const dev = app.input.lastDevice;
  return dev === 'touch' || (isTouch() && dev !== 'keyboard' && dev !== 'gamepad');
};

export function sellKeyName(app) {
  if (app?.input?.lastDevice === 'gamepad') return 'D-pad down';
  return (app?.input ? touchy(app) : isTouch()) ? 'Sell' : 'V';
}
/** 'hold V' / 'hold Sell' / 'hold D-pad down' (for short hints like the "garden full" pill). */
export const sellHow = (app) => 'hold ' + sellKeyName(app);

const ring = (r, cls) => {
  const c = (2 * Math.PI * r).toFixed(1);
  return h('span', { class: cls, html: `<svg viewBox="0 0 ${2 * r + 8} ${2 * r + 8}" aria-hidden="true"><circle class="bg" cx="${r + 4}" cy="${r + 4}" r="${r}"/><circle class="fg" cx="${r + 4}" cy="${r + 4}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg>` });
};

// ------------------------------------------------------------------ HUD pill

const PILL_C = 2 * Math.PI * 21;

export function createSellPrompt(app, parent, me) {
  injectSellStyles();
  const key = h('span', { class: 'pp-k' });
  const rg = ring(21, 'pp-ring');
  const fg = rg.querySelector('.fg');
  const verb = h('span', { class: 'pp-verb', text: 'Sell' });
  const cash = h('span', { class: 'ps-cash' });
  const how = h('span', { class: 'pp-how', text: 'HOLD' });
  const label = h('span', { class: 'pp-label' });
  const el = h('div', { class: 'prompt sell', 'aria-live': 'polite' },
    h('span', { class: 'pp-key' }, rg, key),
    h('span', { class: 'pp-copy' }, h('span', { class: 'pp-top' }, verb, cash, how), label));
  parent.appendChild(el);
  let lastKey = null;
  let lastF = -1;
  let lastV = -1;
  let pressedE = false;
  let nudgeUntil = 0;
  return {
    update() {
      const it = me.sell;
      const show = !!it?.key && app.state === 'playing';
      toggle(el, 'show', show);
      if (!show) {
        lastKey = null;
        pressedE = false;
        return;
      }
      if (it.key !== lastKey) {
        lastKey = it.key;
        el.classList.remove('in');
        void el.offsetWidth;
        el.classList.add('in');
      }
      const dev = app.input.lastDevice;
      const tp = touchy(app);
      setText(key, dev === 'gamepad' ? '↓' : tp ? '' : 'V');
      toggle(el, 'tp', tp);
      if (it.value !== lastV) setText(cash, '+' + money((lastV = it.value) || 0));
      setText(label, it.label || '');
      setStyle(el, '--rc', it.rarity ? rarityColor(it.rarity) : '#ffffff');
      toggle(el, 'secret', it.rarity === 'secret');
      const f = it.hold > 0 ? Math.min(1, it.t / it.hold) : 0;
      if (Math.abs(f - lastF) > 0.004) {
        lastF = f;
        fg.style.strokeDashoffset = (PILL_C * (1 - f)).toFixed(1);
      }
      toggle(el, 'holding', f > 0);
      // old habit: E pressed here with nothing else to do -> the Sell pill wiggles ("that's this one!")
      const e = !!me.intent?.interact && !me.interact?.key;
      const now = performance.now();
      if (e && !pressedE) nudgeUntil = now + 700;
      pressedE = e;
      toggle(el, 'nudge', now < nudgeUntil);
    },
  };
}

// ------------------------------------------------------------------ touch button

const BTN_C = 2 * Math.PI * 44;

export function createSellButton(app) {
  injectSellStyles();
  const cash = h('span', { class: 'ts-cash' });
  const el = h('button', { class: 'tb tb-sell', type: 'button', 'aria-label': 'Sell' },
    ring(44, 'ta-ring'),
    h('span', { class: 'ts-copy' }, h('span', { class: 'ts-verb', text: 'Sell' }), cash));
  const fg = el.querySelector('.fg');
  let lastKey = null;
  let lastV = -1;
  let lastF = -1;
  return {
    el,
    update(me) {
      const it = me?.sell;
      const has = !!it?.key && app.state === 'playing';
      toggle(el, 'show', has);
      if (!has) {
        lastKey = null;
        return;
      }
      if (it.key !== lastKey) {
        lastKey = it.key;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
      if (it.value !== lastV) setText(cash, money((lastV = it.value) || 0));
      const f = it.hold > 0 ? Math.min(1, it.t / it.hold) : 0;
      if (Math.abs(f - lastF) > 0.004) {
        lastF = f;
        fg.style.strokeDashoffset = (BTN_C * (1 - f)).toFixed(1);
      }
    },
  };
}

// ------------------------------------------------------------------ styles

let injected = false;

export function injectSellStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'sas-sell';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
/* the gold Sell pill (stacks under the E prompt in .hud-bottom; unlike the E prompt it takes no room while hidden,
   so the rest of the HUD sits exactly where it did) */
.prompt.sell:not(.show){display:none}
.prompt.sell{background:linear-gradient(180deg,rgba(86,58,8,.94),rgba(52,34,6,.94));box-shadow:0 4px 0 rgba(10,14,40,.6),inset 0 0 0 2.5px rgba(255,210,63,.75)}
.prompt.sell .pp-k{background:linear-gradient(180deg,#ffe98a,#f2b320);color:var(--ink)}
.prompt.sell .pp-ring .fg{stroke:#ffd23f}
.prompt.sell .pp-verb{color:#ffd23f}
.prompt.sell.holding .pp-how{background:#ffd23f;color:var(--ink)}
.ps-cash{font:var(--fdw) 21px/1 var(--fd);color:#fff6c9;letter-spacing:.01em;text-shadow:0 2px 0 rgba(0,0,0,.45);white-space:nowrap}
.prompt.sell.nudge{animation:sellNudge .6s ease-in-out}
@keyframes sellNudge{0%,100%{transform:none}15%{transform:translateX(-7px) rotate(-2deg)}35%{transform:translateX(7px) rotate(2deg)}55%{transform:translateX(-5px)}75%{transform:translateX(4px)}}

/* the touch Sell coin: its own spot in the thumb cluster, clear of Jump, Bonk, Action, the emote button, Boost and
   the gear chip (and of the pills above the cluster on phones); a thinner ring than Action's so it never reaches them */
.tb-sell{right:calc(var(--sr) + 104px);bottom:calc(var(--sb) + 264px);width:70px;height:70px;color:var(--ink);
  background:radial-gradient(circle at 40% 28%,#fff6b8,#ffd23f 45%,#e09a0e);opacity:0;transform:scale(.5);pointer-events:none;transition:opacity .15s,transform .22s var(--spring)}
.tb-sell.show{opacity:1;transform:none;pointer-events:auto}
.tb-sell.show.down{transform:scale(.92)}
.tb-sell.pop{animation:actPop .35s var(--spring)}
.tb-sell .ta-ring{inset:-6px}
.tb-sell .ta-ring circle{stroke-width:6}
.tb-sell .ta-ring .fg{stroke:#fff3a8}
.tb-sell .ta-ring .bg{stroke:rgba(10,14,40,.3)}
.ts-copy{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:2px}
.ts-verb{font:var(--fdw) 18px/1 var(--fd);letter-spacing:.02em;color:#fff;text-shadow:var(--o1)}
.ts-cash{font:900 10.5px/1 var(--fb);color:var(--ink);background:rgba(255,255,255,.7);padding:2px 5px;border-radius:7px;white-space:nowrap}
/* tablets: above the emote button */
@media (min-width:761px) and (min-height:501px){
  .tb-sell{right:calc(var(--sr) + 112px);bottom:calc(var(--sb) + 268px)}
}
/* phones standing up: the pills sit right above the cluster, so it goes left of the emote button, over the gear chip */
@media (max-width:640px){
  .tb-sell{right:calc(var(--sr) + 164px);bottom:calc(var(--sb) + 208px);width:54px;height:54px}
  .ts-verb{font-size:15px}
  .ts-cash{font-size:9px;padding:1px 4px}
}
/* phones on their side: above the emote button, left of Action */
@media (max-height:500px) and (orientation:landscape){
  .tb-sell{right:calc(var(--sr) + 82px);bottom:calc(var(--sb) + 150px);width:56px;height:56px}
  .ts-verb{font-size:15px}
  .ts-cash{font-size:9px;padding:1px 4px}
}
/* Simple HUD: the emote button lives up top, so Sell takes its place beside Action */
html.hud-simple .tb-sell{width:54px;height:54px}
html.hud-simple .ts-verb{font-size:14px}
html.hud-simple .ts-cash{font-size:9px;padding:1px 4px}
html.hud-simple .ps-cash{font-size:16px}
/* small screens on touch: the gold coin already says "Sell $X" and fills its ring, so no second pill */
html.hud-simple .prompt.sell.tp{display:none}
@media (orientation:portrait){
  html.hud-simple .tb-sell{right:calc(var(--sr) + 80px);bottom:calc(var(--sb) + 152px)}
  /* no items = no hotbar (and no margin above it): the pills (E, Sell, carry) still wait above the thumb buttons */
  html.hud-simple.is-touch .hud-bottom:has(.hotbar.none){padding-bottom:200px}
}
@media (orientation:landscape){
  html.hud-simple .tb-sell{right:calc(var(--sr) + 76px);bottom:calc(var(--sb) + 86px)}
}
@media (prefers-reduced-motion:reduce){.prompt.sell.nudge{animation:none;box-shadow:0 4px 0 rgba(10,14,40,.6),inset 0 0 0 3px #fff3a8}}
`;
