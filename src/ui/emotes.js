// Emote wheel + quick chat. OWNER: social agent (docs/ONLINE.md).
// mountEmotes(app, hudRoot, {tl, tr, top, bottom}) -> {update(dt, t), dispose()}
//
// One radial wheel with three pages: Emotes (G), Chat and Game phrases (T, T again flips the page).
// 8 big slices per page, picked by pointing (mouse / finger, or drag from the touch button and let go),
// keys 1-8, or Enter on the highlighted slice. Closes on a pick, Esc, G or a click outside. Movement keys
// keep working while it is open. Picking calls app.act('emote', id) / app.act('say', phraseId).
// Also draws: a little emote sticker that pops over a player's head when they emote, and the local
// player's own quick-chat bubble (if the HUD's chat bubbles don't already cover the local player).
import { bus } from '../core/events.js';
import { h, noFocus, esc, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { WHEEL_TABS, EMOTE, SAY_COOLDOWN } from '../social/catalog.js';
import { SOCIAL_ICONS } from '../social/icons.js';
import { injectSocialStyles } from '../social/styles.js';
import { socialUi } from '../social/uiState.js';

const N = 8;
const TAU = Math.PI * 2;
const INNER = 0.36; // hub radius / wheel radius
const POP_S = 1.8; // seconds an emote sticker stays over a head
const BUBBLE_S = 4.2; // same as the HUD's chat bubbles

function wedgePath(i, R = 98, r = INNER * 100, gapDeg = 1.4) {
  const step = 360 / N;
  const a0 = ((i * step - step / 2 + gapDeg / 2) * Math.PI) / 180;
  const a1 = ((i * step + step / 2 - gapDeg / 2) * Math.PI) / 180;
  const P = (a, rad) => `${(Math.sin(a) * rad).toFixed(2)} ${(-Math.cos(a) * rad).toFixed(2)}`;
  return `M${P(a0, R)} A${R} ${R} 0 0 1 ${P(a1, R)} L${P(a1, r)} A${r} ${r} 0 0 0 ${P(a0, r)} Z`;
}

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

export function mountEmotes(app, hudRoot, parts = {}) {
  const me = app.human;
  if (!app.game || !me || !hudRoot) return { update() {}, dispose() {} };
  injectSocialStyles();
  const game = app.game;

  // ---------------------------------------------------------------- triggers
  const cool = h('span', { class: 'soc-cool' });
  const hbtn = noFocus(h('button', { class: 'hbtn soc-emo-hbtn', type: 'button', 'aria-label': 'Emotes and quick chat', title: 'Emotes (G) · Quick chat (T)', html: SOCIAL_ICONS.smile }));
  const tbtn = h('button', { class: 'soc-emobtn', type: 'button', 'aria-label': 'Emotes and quick chat', html: SOCIAL_ICONS.smile }, cool);
  (parts.tl?.querySelector('.hud-btns') || parts.tl || hudRoot).appendChild(hbtn);
  hudRoot.appendChild(tbtn);

  // ---------------------------------------------------------------- wheel DOM
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'sw-ring');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs>
    <radialGradient id="swFill" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse"><stop offset=".3" stop-color="#1f2861"/><stop offset="1" stop-color="#3b4b9e"/></radialGradient>
    <radialGradient id="swHot" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse"><stop offset=".3" stop-color="#ffe98a"/><stop offset="1" stop-color="#ffffff"/></radialGradient></defs>`;
  const wedges = [];
  for (let i = 0; i < N; i++) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', wedgePath(i));
    svg.appendChild(p);
    wedges.push(p);
  }
  const items = [];
  const nums = [];
  for (let i = 0; i < N; i++) {
    const ic = h('span', { class: 'sw-ic' });
    const lb = h('span', { class: 'sw-lb' });
    const el = h('div', { class: 'sw-item', style: `--a:${i * (360 / N)}deg`, 'aria-hidden': 'true' }, ic, lb);
    items.push({ el, ic, lb });
    nums.push(h('b', { class: 'sw-n', style: `--a:${i * (360 / N)}deg`, text: String(i + 1) }));
  }
  const hubT = h('span', { class: 'sw-hub-t' });
  const hubS = h('span', { class: 'sw-hub-s' });
  const hub = h('div', { class: 'sw-hub' }, hubT, hubS);
  const xBtn = noFocus(h('button', { class: 'sw-x', type: 'button', 'aria-label': 'Close', html: ICON.close }));
  const wheel = h('div', { class: 'sw-wheel' }, svg, ...items.map((x) => x.el), ...nums, hub, xBtn);
  const tabs = WHEEL_TABS.map((t, i) =>
    noFocus(h('button', { class: 'sw-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-i': String(i) },
      h('span', { text: t.name }), i < 2 ? h('kbd', { text: t.key }) : null)));
  const tabBar = h('div', { class: 'sw-tabs', role: 'tablist' }, tabs);
  const hint = h('div', { class: 'sw-hint', html: 'Pick with <kbd>1</kbd>-<kbd>8</kbd> · <kbd>Tab</kbd> next page · <kbd>Esc</kbd> close' });
  const box = h('div', { class: 'sw-box' }, tabBar, wheel, hint);
  const layer = h('div', { class: 'sw-layer', role: 'dialog', 'aria-label': 'Emotes and quick chat' }, h('div', { class: 'sw-back' }), box);

  let open = false;
  let tab = 0;
  let chatTab = 1; // the chat page T opens on (remembers Chat vs Game)
  let hot = -1;
  let lastSayAt = -1e9;
  let closeTimer = 0;
  let drag = null; // {id, x, y, moved} while dragging out of the touch button

  const emoteOk = () => !me.carrying && game.time >= me.stunUntil;
  const cooling = () => performance.now() - lastSayAt < SAY_COOLDOWN * 1000;
  const canOpen = () => app.state === 'playing' && app.game === game && !socialUi.sheet && !app.menus?.isBlocking?.() && (app.cam?.introT ?? 1) >= 1;

  function paintTab() {
    const t = WHEEL_TABS[tab];
    tabs.forEach((b, i) => {
      b.classList.toggle('on', i === tab);
      b.setAttribute('aria-selected', String(i === tab));
    });
    const off = (t.kind === 'emote' && !emoteOk()) || (t.kind === 'say' && cooling());
    items.forEach((it, i) => {
      const item = t.items[i];
      it.ic.innerHTML = item?.icon || '';
      it.lb.textContent = item ? item.name || item.text : '';
      it.el.classList.toggle('say', t.kind === 'say');
      it.el.classList.toggle('off', off);
      wedges[i].classList.toggle('off', off);
    });
    paintHub();
  }

  function paintHub() {
    const t = WHEEL_TABS[tab];
    const item = hot >= 0 ? t.items[hot] : null;
    items.forEach((it, i) => it.el.classList.toggle('hot', i === hot));
    wedges.forEach((w, i) => w.classList.toggle('hot', i === hot));
    if (item) {
      hubT.textContent = item.name || item.text;
      hubS.textContent = t.kind === 'emote' ? (emoteOk() ? 'Emote' : 'Hands full!') : 'Say it!';
    } else {
      hubT.textContent = t.name;
      hubS.textContent = t.kind === 'emote' ? (me.carrying ? 'Hands full! Drop it first' : 'Strike a pose!') : cooling() ? 'One sec...' : 'Say something nice!';
    }
  }

  function setTab(i) {
    tab = ((i % WHEEL_TABS.length) + WHEEL_TABS.length) % WHEEL_TABS.length;
    if (WHEEL_TABS[tab].kind === 'say') chatTab = tab;
    hot = -1;
    paintTab();
  }

  function setHot(i) {
    if (i === hot) return;
    hot = i;
    paintHub();
    if (i >= 0) uiSound(app, 'hover');
  }

  function size() {
    const w = window.innerWidth, ht = window.innerHeight;
    const side = ht <= 500 && w > ht; // short landscape: tabs go beside the wheel
    const availW = w - 28 - (side ? 120 : 0);
    const availH = ht - 24 - (side ? 0 : 60 + (document.documentElement.classList.contains('is-touch') ? 0 : 26));
    const R = Math.max(104, Math.min(172, availW / 2, availH / 2));
    wheel.style.setProperty('--R', R.toFixed(0) + 'px');
  }

  function openWheel(i) {
    if (!canOpen()) return false;
    clearTimeout(closeTimer);
    size();
    setTab(i);
    layer.classList.remove('out');
    if (!layer.isConnected) hudRoot.appendChild(layer);
    open = true;
    socialUi.wheel = true;
    hudRoot.classList.add('soc-wheel-open');
    uiSound(app, 'click');
    return true;
  }

  function close(instant = false) {
    if (!open) return;
    open = false;
    socialUi.wheel = false;
    hudRoot.classList.remove('soc-wheel-open');
    hot = -1;
    drag = null;
    layer.classList.add('out');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => layer.remove(), instant ? 0 : 170);
  }

  function nope() {
    wheel.classList.remove('nope');
    void wheel.offsetWidth;
    wheel.classList.add('nope');
    uiSound(app, 'error');
  }

  function pick(i) {
    const t = WHEEL_TABS[tab];
    const item = t.items[i];
    if (!open || !item) return;
    if ((t.kind === 'emote' && !emoteOk()) || (t.kind === 'say' && cooling())) {
      setHot(i);
      nope();
      return;
    }
    app.act(t.kind, item.id);
    if (t.kind === 'say') lastSayAt = performance.now();
    uiSound(app, 'click');
    items[i].el.classList.add('pick');
    setTimeout(() => items[i].el.classList.remove('pick'), 400);
    close();
  }

  // slice under a screen point: 0..7, -1 = hub, -2 = outside the wheel
  function sliceAt(x, y) {
    const r = wheel.getBoundingClientRect();
    const R = r.width / 2;
    const dx = x - (r.left + R), dy = y - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d < R * INNER) return -1;
    if (d > R * 1.22) return -2;
    let a = Math.atan2(dx, -dy);
    if (a < 0) a += TAU;
    return Math.round(a / (TAU / N)) % N;
  }

  // ---------------------------------------------------------------- pointer
  let downOnWheel = false;
  // while the wheel fades out it still catches the tap's trailing click, which would otherwise land on
  // whatever is under the finger (a badge toast, a HUD button...)
  layer.addEventListener('click', (e) => {
    if (!open) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  layer.addEventListener('pointerdown', (e) => {
    if (!open || e.target.closest('.sw-tab, .sw-x')) return;
    e.preventDefault();
    downOnWheel = true;
    const s = sliceAt(e.clientX, e.clientY);
    setHot(s >= 0 ? s : -1);
  });
  layer.addEventListener('pointermove', (e) => {
    if (!open || drag) return;
    if (e.pointerType !== 'mouse' && !downOnWheel) return;
    const s = sliceAt(e.clientX, e.clientY);
    setHot(s >= 0 ? s : -1);
  });
  layer.addEventListener('pointerup', (e) => {
    if (!open || !downOnWheel || e.target.closest('.sw-tab, .sw-x')) return;
    downOnWheel = false;
    const s = sliceAt(e.clientX, e.clientY);
    if (s >= 0) pick(s);
    else if (s === -2) close();
  });
  layer.addEventListener('pointercancel', () => (downOnWheel = false));
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  tabs.forEach((b, i) => b.addEventListener('click', () => {
    setTab(i);
    uiSound(app, 'click');
  }));
  xBtn.addEventListener('click', () => close());

  // touch button: tap = open (tap again to close); press and drag onto a slice, let go = pick
  tbtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tbtn.classList.add('down');
    try {
      tbtn.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointers can't be captured */
    }
    if (open) {
      close();
      return;
    }
    if (openWheel(tab === 0 ? 0 : chatTab)) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  tbtn.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 26) drag.moved = true;
    if (drag.moved) {
      const s = sliceAt(e.clientX, e.clientY);
      setHot(s >= 0 ? s : -1);
    }
  });
  const tUp = (e) => {
    tbtn.classList.remove('down');
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) return; // a tap: the wheel stays open
    const s = sliceAt(e.clientX, e.clientY);
    if (s >= 0) pick(s);
  };
  tbtn.addEventListener('pointerup', tUp);
  tbtn.addEventListener('pointercancel', tUp);
  tbtn.addEventListener('contextmenu', (e) => e.preventDefault());
  hbtn.addEventListener('click', () => (open ? close() : openWheel(0)));

  // ---------------------------------------------------------------- keyboard (capture: runs before the game's keys)
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    const c = e.code;
    if (!open) {
      if (e.repeat || (c !== 'KeyG' && c !== 'KeyT')) return;
      if (openWheel(c === 'KeyG' ? 0 : chatTab)) stop(e);
      return;
    }
    if (c === 'Escape') {
      close();
      stop(e);
    } else if (c === 'KeyG') {
      if (!e.repeat) tab === 0 ? close() : setTab(0);
      stop(e);
    } else if (c === 'KeyT') {
      if (!e.repeat) setTab(WHEEL_TABS[tab].kind === 'emote' ? chatTab : tab === 1 ? 2 : 1);
      stop(e);
    } else if (c === 'Tab') {
      setTab(tab + (e.shiftKey ? -1 : 1));
      stop(e);
    } else if (/^(Digit|Numpad)[1-8]$/.test(c)) {
      if (!e.repeat) pick(Number(c.slice(-1)) - 1);
      stop(e); // never also use an item
    } else if ((c === 'Enter' || c === 'NumpadEnter') && hot >= 0) {
      pick(hot);
      stop(e);
    }
    // everything else (WASD, arrows, Space, E, F...) still reaches the game
  };
  window.addEventListener('keydown', onKey, true);
  const onResize = () => open && size();
  window.addEventListener('resize', onResize);

  // ---------------------------------------------------------------- stickers + own bubble
  const pops = new Map(); // slot -> {key, at}
  let mine = null; // {text, at, frame, hud}: my latest quick-chat line (hud: the HUD draws it itself)
  const offChat = bus.on('chat', ({ player, text, quick } = {}) => {
    if (player === me && quick && text) mine = { text: String(text), at: game.time, frame: app.labels?.frame ?? 0 };
  });

  function drawBubble() {
    if (!mine || !app.labels) return;
    const L = app.labels;
    if (game.time - mine.at > BUBBLE_S || game.time < mine.at) {
      mine = null;
      return;
    }
    // The HUD's chat widget updates after us each frame. Give it one whole frame: if it drew this line
    // over our head, it handles the local player too and we stay out of its way.
    if (mine.hud == null) {
      if (L.frame < mine.frame + 2) return;
      mine.hud = L.items?.get?.('bubble' + me.slot)?.seen === L.frame - 1;
    }
    if (mine.hud || me.invisible(game.time)) return;
    // no name tag over the local player: the bubble sits just above the head
    const y = me.pos.y + (me.carrying ? 10.2 : 6.3);
    L.set('bubble' + me.slot, { x: me.pos.x, y, z: me.pos.z }, `<div class="bb">${esc(mine.text)}</div>`, { cls: 'bubble', maxDist: 90 });
  }

  function drawPops() {
    if (!app.labels) return;
    const now = game.time;
    for (const p of game.players) {
      const e = p.emote;
      if (!e || !EMOTE[e.id]) {
        pops.delete(p.slot);
        continue;
      }
      const key = e.id + ':' + e.until;
      let s = pops.get(p.slot);
      if (!s || s.key !== key) pops.set(p.slot, (s = { key, at: now }));
      if (now - s.at > POP_S || now < s.at || p.invisible(now)) continue;
      // just above the head (kids are shorter), and above the name tag others have
      const av = app.view?.avatars?.[p.slot];
      const top = av?.headTop ? av.headTop.position.y * av.object3d.scale.y : 5.3;
      const y = p.carrying ? top + 6.4 : p === me ? top + 1.1 : top + 3.4;
      app.labels.set('emo' + p.slot, { x: p.pos.x, y: p.pos.y + y, z: p.pos.z },
        `<div class="emo-pop">${EMOTE[e.id].icon}</div>`, { cls: 'emolbl', maxDist: 90, priority: 4, noDeclutter: true });
    }
  }

  let lastOff = null;
  return {
    update() {
      if (open && (!canOpen() || app.game !== game)) close(true);
      // the touch button steps aside while a sheet is up; its ring shows the chat cooldown
      const offNow = socialUi.sheet;
      if (offNow !== lastOff) {
        lastOff = offNow;
        tbtn.classList.toggle('off', offNow);
      }
      const f = Math.max(0, 1 - (performance.now() - lastSayAt) / (SAY_COOLDOWN * 1000));
      cool.style.setProperty('--f', f.toFixed(3));
      if (open) {
        const t = WHEEL_TABS[tab];
        const off = (t.kind === 'emote' && !emoteOk()) || (t.kind === 'say' && cooling());
        if (off !== items[0].el.classList.contains('off')) paintTab();
      }
      drawPops();
      drawBubble();
    },
    dispose() {
      close(true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      offChat();
      clearTimeout(closeTimer);
      layer.remove();
      hbtn.remove();
      tbtn.remove();
      socialUi.wheel = false;
    },
    /** tests / other widgets */
    open: (page = 0) => openWheel(page),
    close: () => close(true),
    get isOpen() {
      return open;
    },
  };
}
