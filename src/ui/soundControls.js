// Sound controls: music and sound effects each get an on/off switch and a volume slider, fully independent
// (the rules live in audio/levels.js). One widget, three places:
//   buildSoundControls(app, {compact, pad, rowClass}) -> {el, rows, focus(), dispose()}   Settings, pause menu
//   mountSoundButton(app, btn, hudRoot) -> {isOpen(), open(), close(), dispose()}   the HUD speaker: tap = a
//     pop-up with both rows and "Mute all", hold = mute / unmute everything; M = music on/off
// Changes apply live and are saved with the settings. Styles are injected once (<style id="sas-sound">).
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { CHANNELS, SOUND_KEYS, isOn, isSilent, setChannelOn, setVolume, toggleChannel } from '../audio/levels.js';
import { h, uiSound, setMuted } from './dom.js';
import { ICON } from './icons.js';
import { isTouch } from './device.js';

const svg = (body) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const NOTE = svg('<path d="M8.6 18.2V7.4l11-2.6v10.9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M8.6 7.6l11-2.6v3l-11 2.6z" fill="currentColor"/><ellipse cx="6.1" cy="18.3" rx="3.1" ry="2.5" fill="currentColor"/><ellipse cx="17.1" cy="15.8" rx="3.1" ry="2.5" fill="currentColor"/>');
const SPARK = svg('<path d="M10 2.8l1.9 5.6 5.6 1.9-5.6 1.9L10 17.8l-1.9-5.6-5.6-1.9 5.6-1.9z" fill="currentColor"/><path d="M18.4 13.4l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor"/><circle cx="18.6" cy="5.2" r="1.6" fill="currentColor"/>');

const ROWS = {
  music: { name: 'Music', short: 'Music', icon: NOTE, color: '#b36bff' },
  sfx: { name: 'Sound effects', short: 'Effects', icon: SPARK, color: '#ff9d1a' },
};
const STEP = 0.05;
const HOLD_MS = 550; // press the speaker this long to mute / unmute everything

const pct = (v) => Math.round(v * 100) + '%';
// a tap or click never leaves focus on these (keyboard focus still works, and stays put after Enter)
const noMouseFocus = (el) => {
  el.addEventListener('mousedown', (e) => e.preventDefault());
  return el;
};
const typing = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

/**
 * The two rows. compact: one line per row (pause menu); pad: the D-pad picks a row, left/right change its
 * volume, A switches it (gamepads have no pointer); rowClass: extra class per row ('set-row' in Settings).
 */
export function buildSoundControls(app, { compact = false, pad = false, rowClass = '' } = {}) {
  injectSoundStyles();
  const rows = CHANNELS.map((kind) => soundRow(app, kind, rowClass));
  const el = h('div', { class: 'snd' + (compact ? ' compact' : ''), role: 'group', 'aria-label': 'Sound' }, rows.map((r) => r.el));
  const paint = () => rows.forEach((r) => r.paint());
  const off = bus.on('settings:changed', ({ key }) => SOUND_KEYS.has(key) && paint());
  const stopPad = pad ? padNav(app, el, rows) : () => {};
  return {
    el,
    rows,
    /** Keyboard users land on the first switch. */
    focus: () => rows[0].sw.focus({ preventScroll: true }),
    dispose() {
      off();
      stopPad();
    },
  };
}

function soundRow(app, kind, rowClass) {
  const R = ROWS[kind];
  const sw = h('button', { class: 'switch snd-sw', type: 'button', role: 'switch', 'aria-label': `${R.name} on or off` }, h('i'));
  const input = h('input', { type: 'range', min: 0, max: 1, step: STEP, value: settings[kind], 'aria-label': `${R.name} volume` });
  const out = h('output', { class: 'snd-v' });
  const el = h('div', { class: `snd-row snd-${kind}${rowClass ? ' ' + rowClass : ''}`, style: `--c:${R.color}` },
    h('span', { class: 'snd-ic', html: R.icon }),
    h('span', { class: 'snd-name', 'data-short': R.short }, h('span', { text: R.name })),
    sw,
    h('div', { class: 'snd-sl' }, input, out));
  const paint = () => {
    const on = isOn(kind);
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', String(on));
    el.classList.toggle('off', !on);
    if (+input.value !== settings[kind]) input.value = settings[kind];
    input.style.setProperty('--f', (settings[kind] * 100).toFixed(1) + '%');
    out.textContent = on ? pct(settings[kind]) : 'Off';
  };
  sw.addEventListener('click', () => {
    toggleChannel(kind);
    uiSound(app, 'click'); // silent when effects just went off
  });
  input.addEventListener('input', () => setVolume(kind, +input.value));
  // effects: a blip at the new level once the slider lets go (music is its own preview)
  input.addEventListener('change', () => kind === 'sfx' && uiSound(app, 'click'));
  paint();
  return { kind, el, sw, input, paint };
}

// Gamepad: D-pad up/down picks a row, left/right turn it down/up, A switches it. Polls once a frame while
// the widget is on screen (pause menu only).
function padNav(app, el, rows) {
  let raf = 0;
  let row = -1;
  const prev = [];
  const mark = () => rows.forEach((r, i) => r.el.classList.toggle('pad', i === row));
  const poll = () => {
    raf = requestAnimationFrame(poll);
    if (!el.isConnected) return;
    const gp = app.input?.gamepad?.();
    if (!gp) return;
    const b = (i) => !!gp.buttons[i]?.pressed;
    const edge = (i) => b(i) && !prev[i];
    if (edge(12) || edge(13)) {
      row = row < 0 ? 0 : (row + (edge(13) ? 1 : rows.length - 1)) % rows.length;
      mark();
      rows[row].el.scrollIntoView?.({ block: 'nearest' });
    } else if (row >= 0) {
      const kind = rows[row].kind;
      if ((edge(14) || edge(15)) && rows[row].input.offsetParent) { // (small phones: no slider, just the switch)
        setVolume(kind, Math.round((settings[kind] + (edge(15) ? 0.1 : -0.1)) * 100) / 100);
        if (kind === 'sfx') uiSound(app, 'click');
      } else if (edge(0)) {
        toggleChannel(kind);
        uiSound(app, 'click');
      }
    }
    for (const i of [0, 12, 13, 14, 15]) prev[i] = b(i);
  };
  raf = requestAnimationFrame(poll);
  return () => cancelAnimationFrame(raf);
}

/** The HUD speaker button: paints itself, opens the pop-up, holds to mute everything, M toggles the music. */
export function mountSoundButton(app, btn, hudRoot) {
  injectSoundStyles();
  btn.classList.add('snd-btn');
  btn.setAttribute('aria-label', 'Sound');
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.title = 'Sound (hold: mute all · M: music)';
  let pop = null;
  let toastEl = null;
  let toastTimer = 0;

  const paint = () => {
    const off = isSilent();
    const html = off ? ICON.soundOff : ICON.soundOn;
    if (btn._snd !== html) btn.innerHTML = btn._snd = html;
    btn.classList.toggle('off', off);
    btn.setAttribute('aria-expanded', String(!!pop));
  };

  function toast(text) {
    if (!toastEl) {
      toastEl = h('div', { class: 'snd-toast', role: 'status' });
      hudRoot.appendChild(toastEl);
    }
    const hr = hudRoot.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    toastEl.style.left = Math.max(8, br.left - hr.left) + 'px';
    toastEl.style.top = br.bottom - hr.top + 8 + 'px';
    toastEl.innerHTML = `<span class="bi">${isSilent() ? ICON.soundOff : ICON.soundOn}</span><span></span>`;
    toastEl.lastChild.textContent = text;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth; // restart the pop-in
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl?.classList.remove('show'), 1400);
  }

  function muteAll() {
    setMuted(app, !settings.muted);
    uiSound(app, 'click');
    if (!pop) toast(settings.muted ? 'All sound off' : 'Sound on');
  }

  // ---------------------------------------------------------------- the pop-up
  function place() {
    if (!pop) return;
    const hr = hudRoot.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const w = pop.el.offsetWidth;
    const left = Math.max(8, Math.min(hr.width - w - 8, br.left - hr.left - 10));
    const top = br.bottom - hr.top + 12;
    pop.el.style.left = left + 'px';
    pop.el.style.top = top + 'px';
    pop.inner.style.maxHeight = Math.max(120, hr.height - top - 14) + 'px';
    pop.el.style.setProperty('--ax', Math.round(br.left - hr.left + br.width / 2 - left) + 'px');
  }

  function open(fromKeyboard) {
    if (pop || app.state !== 'playing') return;
    const ctl = buildSoundControls(app);
    const all = noMouseFocus(h('button', { class: 'btn btn-sm snd-all', type: 'button' }));
    const x = noMouseFocus(h('button', { class: 'snd-x', type: 'button', 'aria-label': 'Close', html: ICON.close }));
    const tip = h('p', { class: 'snd-tip', text: isTouch() ? 'Tip: hold the speaker button to mute everything.' : 'Tip: M turns the music on and off.' });
    const inner = h('div', { class: 'snd-pop-in' }, h('div', { class: 'snd-pop-h' }, h('span', { class: 'snd-pop-t', text: 'Sound' }), all, x), ctl.el, tip);
    const el = h('div', { class: 'snd-pop', role: 'dialog', 'aria-label': 'Sound' }, inner);
    const paintAll = () => {
      const m = !!settings.muted;
      all.className = `btn btn-sm snd-all ${m ? 'btn-green' : 'btn-red'}`;
      all.innerHTML = `<span class="bi">${m ? ICON.soundOn : ICON.soundOff}</span><span>${m ? 'Sound on' : 'Mute all'}</span>`;
    };
    paintAll();
    all.addEventListener('click', muteAll);
    x.addEventListener('click', () => close());
    // keys typed in here stay here (Space on a switch must not also jump); the switches never keep focus
    // from a click, and the sliders let go of it after a drag so WASD goes straight back to the game
    el.addEventListener('keydown', (e) => e.stopPropagation());
    for (const r of ctl.rows) {
      noMouseFocus(r.sw);
      r.input.addEventListener('pointerup', () => setTimeout(() => r.input.blur(), 0));
    }
    const offAll = bus.on('settings:changed', ({ key }) => key === 'muted' && paintAll());
    hudRoot.appendChild(el);
    pop = { el, inner, ctl, offAll };
    place();
    paint();
    if (fromKeyboard) ctl.focus();
  }

  function close(refocus = false) {
    if (!pop) return;
    const { el, ctl, offAll } = pop;
    pop = null;
    if (el.contains(document.activeElement)) document.activeElement.blur();
    ctl.dispose();
    offAll();
    el.remove();
    paint();
    if (refocus) btn.focus({ preventScroll: true });
  }

  const toggle = (kb) => (pop ? close(kb) : open(kb));

  // ---------------------------------------------------------------- the button: tap / hold / keyboard
  // Acts on the pointer itself (a second finger never gets a click while a thumb is on the joystick).
  let armed = null;
  let holdTimer = 0;
  let held = false;
  let firedAt = -1e9;
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    armed = e.pointerId;
    held = false;
    btn.setPointerCapture?.(e.pointerId);
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (armed == null) return;
      held = true;
      muteAll();
    }, HOLD_MS);
  });
  btn.addEventListener('pointerup', (e) => {
    if (e.pointerId !== armed) return;
    armed = null;
    clearTimeout(holdTimer);
    if (held) return;
    const r = btn.getBoundingClientRect();
    if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) {
      firedAt = performance.now();
      uiSound(app, 'click');
      toggle(false);
    }
  });
  btn.addEventListener('pointercancel', () => {
    armed = null;
    clearTimeout(holdTimer);
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // Enter / Space on the focused button (a click with detail 0); the click trailing a tap is ignored
  btn.addEventListener('click', (e) => {
    if (e.detail === 0 && performance.now() - firedAt > 600) toggle(true);
  });

  // outside taps, Esc and M
  const onDown = (e) => {
    if (pop && !pop.el.contains(e.target) && !btn.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.code === 'Escape' && pop) {
      e.preventDefault();
      e.stopImmediatePropagation();
      close(btn === document.activeElement || pop.el.contains(document.activeElement));
      return;
    }
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    if (app.state !== 'playing' && app.state !== 'paused') return;
    toggleChannel('music');
    if (!pop && app.state === 'playing') toast(isOn('music') ? 'Music on' : 'Music off');
  };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  const offs = [
    bus.on('settings:changed', ({ key }) => SOUND_KEYS.has(key) && paint()),
    bus.on('app:state', ({ state }) => state !== 'playing' && close()),
  ];
  paint();
  return {
    isOpen: () => !!pop,
    open: () => open(false),
    close: () => close(),
    dispose() {
      close();
      clearTimeout(holdTimer);
      clearTimeout(toastTimer);
      toastEl?.remove();
      toastEl = null;
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      offs.forEach((off) => off());
    },
  };
}

// ------------------------------------------------------------------ styles

const css = `
.snd{display:flex;flex-direction:column;gap:8px}
.snd .snd-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;grid-template-areas:"ic nm sw" "sl sl sl";align-items:center;gap:6px 12px}
.snd-ic{grid-area:ic;width:44px;height:44px;display:grid;place-items:center;border-radius:14px;border:3px solid var(--ink);background:var(--c);color:#fff;
  box-shadow:inset 0 -4px 0 rgba(0,0,0,.18),inset 0 3px 0 rgba(255,255,255,.3);transition:background .2s,filter .2s}
.snd-ic svg{width:24px;height:24px;filter:drop-shadow(0 1.5px 0 rgba(10,14,40,.55))}
.snd-name{grid-area:nm;min-width:0;font:var(--fdw) 18px/1.05 var(--fd);letter-spacing:.02em}
.snd .snd-sw{grid-area:sw;justify-self:end}
.snd-sw::after{content:'';position:absolute;inset:-7px -5px}
.snd-sl{grid-area:sl;display:flex;align-items:center;gap:10px;min-width:0;transition:opacity .2s}
#ui .snd-sl input[type=range]{flex:1;width:auto;min-width:0;height:44px}
.snd-v{min-width:44px;text-align:right;font:900 14px/1 var(--fb)}
.snd-row.off .snd-ic{background:#5b6390;filter:saturate(.4)}
.snd-row.off .snd-sl{opacity:.55}
.snd-row.off .snd-v{color:var(--txt3)}
.snd-row.pad{box-shadow:0 0 0 3px #fff,0 0 0 6px var(--ink)}
/* one line per row (pause menu): icon over its short name | slider + % | switch */
.snd.compact{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.snd.compact .snd-row{grid-template-columns:52px minmax(0,1fr) auto;grid-template-areas:"ic sl sw" "nm sl sw";gap:0 10px;padding:5px 10px 5px 4px;border-radius:15px;background:rgba(10,15,40,.32)}
.snd.compact .snd-ic{justify-self:center;width:38px;height:38px;border-radius:12px}
.snd.compact .snd-ic svg{width:21px;height:21px}
.snd.compact .snd-name{justify-self:center;margin-top:2px;font:800 11.5px/1 var(--fb);letter-spacing:0;color:var(--txt2)}
.snd.compact .snd-name>span{display:none}
.snd.compact .snd-name::after{content:attr(data-short)}
.pause-btns .snd{width:100%;grid-column:1/-1}
@media (max-width:360px){.snd.compact .snd-v{display:none}}
@media (orientation:landscape) and (max-height:500px){
  .pause-btns .snd.compact{grid-template-columns:1fr 1fr}
  .pause-btns .snd.compact .snd-v{display:none}
}
/* short portrait phones: the pause menu keeps just the two switches, side by side, so it fits down to Save & Quit
   (the volumes are in Settings and the speaker pop-up) */
@media (max-width:640px) and (max-height:760px) and (orientation:portrait){
  .pause-btns .snd.compact{grid-template-columns:1fr 1fr}
  .pause-btns .snd.compact .snd-row{grid-template-columns:40px minmax(0,1fr) auto;gap:0 4px;padding:4px 8px 4px 4px}
  .pause-btns .snd.compact .snd-sl{display:none}
  .pause-btns .snd.compact .snd-ic{width:32px;height:32px;border-radius:10px}
  .pause-btns .snd.compact .snd-ic svg{width:18px;height:18px}
}
/* a vertical swipe over a volume slider scrolls the menu; a sideways drag still sets the volume */
#ui .snd input[type=range]{touch-action:pan-y}

/* HUD speaker: the pop-up, its arrow, and a little status toast */
.snd-btn{-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.snd-pop{position:absolute;z-index:6;width:min(340px,calc(100% - 16px));border-radius:20px;border:3px solid var(--ink);background:linear-gradient(180deg,#34428c,#1f2961);
  box-shadow:var(--panel-sh);pointer-events:auto;touch-action:manipulation;transform-origin:var(--ax,30px) 0;animation:sndPop .22s var(--spring) both}
.snd-pop::before{content:'';position:absolute;top:-10px;left:calc(var(--ax,30px) - 10px);width:14px;height:14px;background:#34428c;border-left:3px solid var(--ink);border-top:3px solid var(--ink);transform:rotate(45deg);border-radius:4px 0 0 0}
.snd-pop-in{overflow-y:auto;overscroll-behavior:contain;padding:10px 12px 10px}
.snd-pop-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.snd-pop-t{flex:1;min-width:0;font:var(--fdw) 22px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
#ui .snd-all{min-height:44px;padding:6px 12px 8px;font-size:15px}
.snd-all .bi{width:18px;height:18px}
.snd-x{flex:none;width:44px;height:44px;padding:10px;border-radius:50%;border:3px solid var(--ink);color:#fff;cursor:pointer;background:linear-gradient(180deg,#6e78a8,#4a5383);box-shadow:0 3px 0 var(--ink)}
.snd-x svg{width:100%;height:100%}
.snd-pop .snd-row{padding:8px 10px;border-radius:15px;background:rgba(10,15,40,.32)}
.snd-tip{margin:9px 2px 0;font:700 12px/1.25 var(--fb);color:var(--txt3)}
.snd-pop .snd-sw:focus-visible,.snd-x:focus-visible{outline:4px solid #fff;outline-offset:3px}
/* short screens (phones on their side): the compact one-line rows */
@media (max-height:500px){
  .snd-pop .snd .snd-row{grid-template-columns:44px minmax(0,1fr) auto;grid-template-areas:"ic sl sw";padding:4px 10px 4px 4px}
  .snd-pop .snd-name{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .snd-pop .snd-tip{display:none}
  .snd-pop-h{margin-bottom:6px}
}
.snd-toast{position:absolute;z-index:6;display:flex;align-items:center;gap:7px;padding:6px 13px 7px 9px;border-radius:999px;border:3px solid var(--ink);background:var(--panel);
  font:var(--fdw) 16px/1 var(--fd);letter-spacing:.02em;white-space:nowrap;pointer-events:none;opacity:0;transform:translateY(-6px) scale(.9);transition:opacity .2s,transform .25s var(--spring)}
.snd-toast.show{opacity:1;transform:none}
.snd-toast .bi{width:20px;height:20px}
@keyframes sndPop{from{opacity:0;transform:scale(.85) translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.snd-pop{animation:none}.snd-toast{transition:none}}
`;

export function injectSoundStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-sound')) return;
  const s = document.createElement('style');
  s.id = 'sas-sound';
  s.textContent = css;
  document.head.appendChild(s);
}
