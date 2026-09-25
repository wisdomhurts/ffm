// In-game HUD. Contract: createHUD(app) -> { update(dt, t), dispose() }
// Reads app.game / app.human every frame (DOM writes are throttled and change-detected) and listens to `bus`.
import { Vector3 } from 'three';
import { ITEMS, BIOMES, RARITY, PLANT, speedAt, WORLD, ROAD_END_Z, biomeIndexAtZ } from '../config.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { load, save } from '../core/save.js';
import { LAYOUT, gardenContains } from '../gameplay/layout.js';
import { rarityColor } from '../view/gameView.js';
import { h, esc, setText, setHTML, setStyle, toggle, money, clock, noFocus, screenAngle, uiSound, setMuted } from './dom.js';
import { avatarEl } from './avatars.js';
import { ICON, ITEM_ICONS, EVENT_ICON } from './icons.js';
import { createAlerts } from './alerts.js';
import { wireNotifications } from './notify.js';
import { createTutorial } from './tutorial.js';
import { createNextGoal } from './goal.js';
import { guidePoint } from './route.js';
import { isTouch, onTouchChange } from './device.js';
import { mountEmotes } from './emotes.js';
import { mountSocial } from './trade.js';
import { mountQuestChip } from './progress.js';
import { mountRoomPanel } from './lobby.js';
import { fullscreenButton } from './fullscreen.js';

// HUD buttons act on the pointer itself, not on `click`: browsers never synthesise a click for a second
// finger while another one is down (thumb on the joystick), so items and pause must not wait for one.
// `when` 'down' fires on press (hotbar), 'up' on release over the button (pause/mute). Keyboard
// activation (Enter/Space, a click with detail 0) still works.
function onPress(el, fn, when = 'down') {
  let armed = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (when === 'down') fn(e);
    else {
      armed = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
    }
  });
  if (when === 'up') {
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== armed) return;
      armed = null;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) fn(e);
    });
    el.addEventListener('pointercancel', () => (armed = null));
  }
  el.addEventListener('click', (e) => {
    if (e.detail === 0) fn(e);
  });
}

export function createHUD(app) {
  const game = app.game;
  const me = app.human;
  const root = h('div', { class: 'hud', 'data-state': app.state || 'playing' });
  app.root.appendChild(root);

  const vignette = h('div', { class: 'vignette' });
  const tl = h('div', { class: 'hud-tl' });
  const tr = h('div', { class: 'hud-tr' });
  const top = h('div', { class: 'hud-top' });
  const bottom = h('div', { class: 'hud-bottom' });
  root.append(vignette, tl, tr, top, bottom);

  // Anchors for the feature widgets (docs/ONLINE.md). Each is an empty flex box in the right spot that
  // collapses while empty; widgets append their chip/button into it and the layout makes room:
  //   quest  - top-left column, under the next-goal chip (daily quest tracker)
  //   room   - top-right column, under the leaderboard (online room chip)
  //   social - bottom centre, just above the proximity prompt (gift / trade chip)
  //   emote  - beside the hotbar on desktop; near the Jump/Bonk/Action buttons on touch screens
  const slot = (name) => h('div', { class: `hud-slot hud-slot-${name}` });
  const anchors = { tl, tr, top, bottom, quest: slot('quest'), room: slot('room'), social: slot('social'), emote: slot('emote') };

  const parts = [];
  parts.push(createMenuButtons(app, tl));
  parts.push(createStats(app, tl, me));
  const tutorial = me ? createTutorial(app, tl) : null;
  if (tutorial) parts.push(tutorial);
  if (me) parts.push(createNextGoal(app, tl, tutorial));
  tl.appendChild(anchors.quest);
  parts.push(createBoard(app, tr, me));
  tr.appendChild(anchors.room);
  parts.push(createEventChip(app, top));
  const alerts = createAlerts(top, root);
  const unwire = me ? wireNotifications(app, alerts) : () => {};
  if (me) {
    parts.push(createRoadMeter(app, root, me));
    bottom.appendChild(anchors.social);
    parts.push(createPrompt(app, bottom, me));
    parts.push(createCarry(app, bottom, me));
    parts.push(createHotbar(app, bottom, me, anchors.emote, root));
  }
  parts.push(createChat(app, root));
  parts.push(createKeyHints(app, root));
  parts.push(createMatchClock(app, alerts));
  // feature widgets (each owns its DOM + styles; see docs/ONLINE.md)
  if (me) for (const mount of [mountQuestChip, mountEmotes, mountSocial, mountRoomPanel]) {
    try {
      const w = mount(app, root, anchors);
      if (w) parts.push(w);
    } catch (e) {
      console.warn('[hud] widget failed', e);
    }
  }

  // Small phones: banners (and the tutorial card) must never cover the prompt / carry pills. While one would,
  // the HUD squeezes: level 1 moves the tutorial card aside (in portrait the banners sit under it, so they
  // move up), level 2 drops the banners' second line, level 3 (tiny screens) hides the banners until the
  // pill is gone (the pills carry the urgent news anyway). It relaxes once the banners (or pills) are gone.
  // Boxes come from offsets, not getBoundingClientRect, so slide-in animations can't hide a clash.
  const tutEl = root.querySelector('.tut');
  let squeeze = 0;
  let tutRect = null; // the card's last box while it was on screen
  const layoutBox = (el, hr) => ({ l: hr.left + el.offsetLeft, t: hr.top + el.offsetTop, r: hr.left + el.offsetLeft + el.offsetWidth, b: hr.top + el.offsetTop + el.offsetHeight });
  const hits = (a, b, pad = 0) => a.l < b.r && a.r > b.l && a.t < b.b + pad && a.b > b.t - pad;
  function unclutter() {
    hushSocial();
    const shown = [...bottom.querySelectorAll('.prompt.show, .carry.show')].filter((p) => p.offsetParent);
    let level = 0;
    if (shown.length) {
      const br = bottom.getBoundingClientRect();
      const pills = shown.map((p) => layoutBox(p, br));
      const c = tutEl?.classList;
      const tutOn = !!c && !c.contains('gone') && !c.contains('hidden') && !c.contains('wait');
      if (tutOn && tutEl.offsetParent) {
        const r = tutEl.getBoundingClientRect();
        tutRect = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
      const tr = top.getBoundingClientRect();
      const banners = [];
      for (const a of top.querySelectorAll('.alert:not(.out)')) if (a.offsetParent) banners.push(layoutBox(a, tr));
      const bannerClash = banners.some((a) => pills.some((p) => hits(a, p, 6)));
      const tutClash = tutOn && !!tutRect && pills.some((p) => hits(tutRect, p));
      // step up one level per check while they clash (level 1 only helps with the card on screen), hold
      // the level while banners stay up
      if (bannerClash) level = Math.min(3, Math.max(squeeze + 1, tutOn ? 1 : 2));
      else if (banners.length && squeeze) level = squeeze;
      else level = tutClash ? 1 : 0;
    }
    if (level !== squeeze) {
      squeeze = level;
      root.classList.toggle('squeeze', level >= 1);
      root.classList.toggle('squeeze2', level >= 2);
      root.classList.toggle('squeeze3', level >= 3);
    }
  }

  // Widgets can hang extra chips under the corner columns (quest tracker, room chip...). Instead of knowing
  // each one, measure: the portrait tutorial card, the banner column and the road meter each start below
  // any column they share screen width with. Pushes are margins, so the tuned CSS positions stay the base.
  const meterEl = root.querySelector('.meter');
  const push = { tut: 0, top: 0, meter: 0 };
  const across = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 12;
  function floors() {
    const tlR = tl.getBoundingClientRect();
    const trR = tr.getBoundingClientRect();
    const cols = [tlR, trR].filter((r) => r.height > 0);
    const below = (r, pad) => cols.reduce((m, c) => (across(r, c) ? Math.max(m, c.bottom + pad) : m), 0);
    const c = tutEl?.classList;
    const tutOn = !!c && !c.contains('gone') && !c.contains('hidden') && !c.contains('wait') && tutEl.offsetWidth > 0;
    let tutR = null;
    let tp = 0;
    if (tutOn) {
      tutR = tutEl.getBoundingClientRect();
      if (getComputedStyle(tutEl).position === 'fixed') {
        const base = tutR.top - push.tut;
        tp = Math.max(0, Math.round(below(tutR, 6) - base));
      }
    }
    if (tp !== push.tut) {
      if (tutR) tutR = { left: tutR.left, right: tutR.right, top: tutR.top + tp - push.tut, bottom: tutR.bottom + tp - push.tut };
      push.tut = tp;
      setStyle(root, '--tut-push', tp + 'px');
    }
    const topR = top.getBoundingClientRect();
    let floor = below(topR, 8);
    if (tutR && getComputedStyle(tutEl).position === 'fixed' && across(topR, tutR)) floor = Math.max(floor, tutR.bottom + 8);
    const tpush = floor ? Math.max(0, Math.round(floor - (topR.top - push.top))) : 0;
    if (tpush !== push.top) {
      push.top = tpush;
      setStyle(root, '--top-push', tpush + 'px');
    }
    if (meterEl) {
      const mR = meterEl.getBoundingClientRect();
      let mf = below(mR, 10);
      if (tutR && getComputedStyle(tutEl).position === 'fixed' && across(mR, tutR)) mf = Math.max(mf, tutR.bottom + 8);
      const mp = mf ? Math.max(0, Math.round(mf - (mR.top - push.meter))) : 0;
      const hgt = mR.height + push.meter - mp; // its height once the new push applies
      if (mp !== push.meter) {
        push.meter = mp;
        setStyle(root, '--meter-push', mp + 'px');
      }
      // too squashed to read: step aside rather than show a stub
      toggle(meterEl, 'tiny', mp > 0 && hgt < 56);
    }
  }

  // The gift / trade chip is the least urgent thing on screen: it waits while it would cover a banner or the
  // tutorial card (it comes back as soon as they're gone).
  let hushed = false;
  function hushSocial() {
    const chips = [...anchors.social.children].filter((c) => c.offsetParent);
    let clash = false;
    if (chips.length) {
      const boxes = [...top.querySelectorAll('.alert:not(.out)')].filter((a) => a.offsetParent).map((a) => a.getBoundingClientRect());
      const c = tutEl?.classList;
      if (c && !c.contains('gone') && !c.contains('hidden') && !c.contains('wait') && tutEl.offsetWidth > 0) boxes.push(tutEl.getBoundingClientRect());
      clash = chips.some((ch) => {
        const r = ch.getBoundingClientRect();
        return boxes.some((b) => r.left < b.right && r.right > b.left && r.top < b.bottom + 4 && r.bottom > b.top - 4);
      });
    }
    if (clash !== hushed) {
      hushed = clash;
      root.classList.toggle('hush-social', clash);
    }
  }

  // Stay hidden while the intro camera swoops down, then fade in as it lands.
  let intro = true;
  root.classList.add('intro');
  let vAcc = 0;
  return {
    alerts,
    anchors,
    update(dt, t) {
      if (!app.game) return;
      if (root.dataset.state !== app.state) root.dataset.state = app.state;
      if (intro && (app.cam?.introT ?? 1) >= 1) {
        intro = false;
        root.classList.remove('intro');
      }
      for (const p of parts) p.update?.(dt, t);
      vAcc += dt;
      if (me && vAcc > 0.15) {
        vAcc = 0;
        // red edge glow while someone is robbing the local player
        let danger = game.gardens[me.slot].planters.some((pl) => pl.stealer != null);
        if (!danger) danger = game.players.some((p) => p !== me && p.carrying?.kind === 'plant' && p.carrying.fromSlot === me.slot);
        toggle(vignette, 'on', danger && app.state === 'playing');
        floors();
        unclutter();
      }
    },
    dispose() {
      unwire();
      for (const p of parts) p.dispose?.();
      alerts.dispose();
      root.remove();
    },
  };
}

// ------------------------------------------------------------------ top-left buttons

function createMenuButtons(app, parent) {
  const pause = noFocus(h('button', { class: 'hbtn', type: 'button', 'aria-label': 'Pause menu', title: 'Menu (Esc)', html: ICON.pause }));
  const mute = noFocus(h('button', { class: 'hbtn', type: 'button', 'aria-label': 'Mute', title: 'Sound on/off' }));
  const paint = () => {
    const m = !!settings.muted;
    mute.innerHTML = m ? ICON.soundOff : ICON.soundOn;
    mute.setAttribute('aria-pressed', String(m));
    mute.classList.toggle('off', m);
  };
  paint();
  onPress(pause, () => {
    uiSound(app, 'click');
    app.pause();
  }, 'up');
  onPress(mute, () => {
    setMuted(app, !settings.muted);
    paint();
  }, 'up');
  const off = bus.on('settings:changed', ({ key }) => (key === 'muted' || key === 'music' || key === 'sfx') && paint());
  // full screen (hidden where the browser can't do it: iPhone Safari, sandboxed frames)
  const fs = fullscreenButton('hbtn', { hud: true, bind: (el, fn) => onPress(el, fn, 'up'), onToggle: () => uiSound(app, 'click') });
  parent.appendChild(h('div', { class: 'hud-btns' }, pause, mute, fs));
  return {
    dispose() {
      off();
      fs?._dispose?.();
    },
  };
}

// ------------------------------------------------------------------ cash / income / speed

function createStats(app, parent, me) {
  const game = app.game;
  const cash = h('span', { class: 'st-val' });
  const inc = h('span', { class: 'st-inc' });
  const speed = h('span', { class: 'chip ch-speed' });
  const stars = h('span', { class: 'chip ch-stars' });
  const fx = h('span', { class: 'chip ch-fx' });
  const pops = h('span', { class: 'st-pops' });
  const cashRow = h('div', { class: 'st-cash' }, h('span', { class: 'st-coin', html: ICON.coin }), cash, pops);
  const el = h('div', { class: 'stats' }, cashRow, h('div', { class: 'st-sub' }, inc, h('div', { class: 'st-chips' }, speed, stars, fx)));
  parent.appendChild(el);
  if (!me) {
    el.hidden = true;
    return {};
  }
  let shown = me.cash;
  let last = me.cash;
  let acc = 1;
  const garden = game.gardens[me.slot];

  function pop(delta) {
    const up = delta > 0;
    const p = h('span', { class: 'st-pop ' + (up ? 'up' : 'down'), text: (up ? '+' : '-') + money(Math.abs(delta)) });
    pops.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
    if (pops.children.length > 4) pops.firstChild.remove();
    if (up) {
      cashRow.classList.remove('bump');
      void cashRow.offsetWidth;
      cashRow.classList.add('bump');
    }
  }

  return {
    update(dt) {
      const c = me.cash;
      const d = c - last;
      if (Math.abs(d) >= 1) {
        pop(d);
        last = c;
      } else if (d < 0) last = c;
      shown += (c - shown) * Math.min(1, dt * 7);
      if (Math.abs(c - shown) < 1) shown = c;
      setText(cash, money(shown));
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      const now = game.time;
      setText(inc, `+${money(game.gardenIncome(garden))}/s`);
      const sp = speedAt(me.speedLevel, me.rebirths) * (now < me.coilUntil ? 1.5 : 1);
      setHTML(speed, `${ICON.bolt}<span>Lv ${me.speedLevel}</span><em>${Math.round(sp)} studs/s</em>`);
      toggle(speed, 'boost', now < me.coilUntil);
      stars.hidden = !me.rebirths;
      if (me.rebirths) setHTML(stars, `${ICON.star}<span>${me.rebirths}</span>`);
      const cloak = now < me.cloakUntil;
      const coil = now < me.coilUntil;
      fx.hidden = !cloak && !coil;
      if (cloak) setHTML(fx, `${ITEM_ICONS.cloak}<span>${Math.ceil(me.cloakUntil - now)}s</span>`);
      else if (coil) setHTML(fx, `${ITEM_ICONS.coil}<span>${Math.ceil(me.coilUntil - now)}s</span>`);
    },
  };
}

// ------------------------------------------------------------------ leaderboard

function createBoard(app, parent, me) {
  const game = app.game;
  const head = h('div', { class: 'board-head' });
  const title = h('span', { class: 'bh-title' });
  const timer = h('span', { class: 'bh-timer' });
  head.append(title, timer);
  const list = h('div', { class: 'board-rows', role: 'list' });
  const el = h('div', { class: 'board' + (game.match ? ' showdown' : '') }, head, list);
  parent.appendChild(el);
  timer.hidden = !game.match;
  let online = null;
  const paintTitle = () => {
    const on = !!app.online?.room;
    if (on === online) return;
    online = on;
    setHTML(title, game.match ? `${ICON.trophy}<span>Showdown</span>` : on ? `${ICON.globe}<span>Players</span>` : `${ICON.family}<span>Family</span>`);
  };
  paintTitle();

  const rows = game.players.map((p) => {
    const rank = h('b', { class: 'br-rank' });
    const val = h('span', { class: 'br-val' });
    const star = h('span', { class: 'br-star' });
    const flag = h('span', { class: 'br-flag', title: 'Carrying a stolen plant' });
    const name = h('span', { class: 'br-name' });
    const dot = h('span', { class: 'br-dot', title: 'Online player' });
    const row = h('div', { class: 'brow' + (p === me ? ' me' : ''), role: 'listitem' }, rank, name, dot, star, flag, val);
    list.appendChild(row);
    return { p, row, rank, val, star, flag, name, dot, ava: null, face: null };
  });
  // who's in a slot can change mid-game online (a friend joins, a bot takes over): keep the row honest
  function identity(r) {
    const p = r.p;
    if (r.face !== p.faceKey) {
      r.face = p.faceKey;
      const a = avatarEl(p.faceKey, 'br-ava');
      if (r.ava) r.ava.replaceWith(a);
      else r.row.insertBefore(a, r.name);
      r.ava = a;
    }
    setText(r.name, p.name);
    setStyle(r.row, '--c', p.char.color);
    toggle(r.row, 'remote', p.kind === 'remote');
    const tip = p.kind === 'remote' ? `${p.name} (online)` : p.kind === 'bot' && app.online?.room ? `${p.name} (computer)` : '';
    if (r.row.title !== tip) r.row.title = tip;
  }
  rows.forEach(identity);

  let acc = 1;
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      paintTitle();
      const order = game.ranking();
      for (const r of rows) {
        identity(r);
        const i = order.indexOf(r.p);
        setStyle(r.row, '--i', String(i));
        setText(r.rank, String(i + 1));
        toggle(r.row, 'first', i === 0);
        setText(r.val, money(game.netWorth.get(r.p) || 0));
        setHTML(r.star, r.p.rebirths ? ICON.star + r.p.rebirths : '');
        toggle(r.flag, 'on', r.p.carrying?.kind === 'plant');
      }
      if (game.match) {
        const left = game.timeLeft();
        setHTML(timer, `${ICON.timer}<span>${clock(left)}</span>`);
        toggle(timer, 'urgent', left <= 30);
      }
    },
  };
}

// Showdown milestones: one-minute warning and a final countdown.
function createMatchClock(app, alerts) {
  const game = app.game;
  if (!game.match) return {};
  let lastSec = Math.ceil(game.timeLeft());
  return {
    update() {
      const s = Math.ceil(game.timeLeft());
      if (s === lastSec) return;
      if (lastSec > 60 && s <= 60) alerts.announce({ title: '1 MINUTE LEFT!', sub: 'Grab, steal and COLLECT!', icon: ICON.timer, cls: 'an-warn', ms: 2600 });
      else if (s <= 10 && s >= 1 && s < lastSec) alerts.announce({ title: String(s), cls: 'an-count', ms: 900 });
      lastSec = s;
    },
  };
}

// ------------------------------------------------------------------ weather event chip

function createEventChip(app, parent) {
  const game = app.game;
  const icon = h('span', { class: 'ev-ic' });
  const name = h('b', { class: 'ev-name' });
  const desc = h('span', { class: 'ev-desc' });
  const time = h('span', { class: 'ev-time' });
  const bar = h('i');
  const el = h('div', { class: 'evchip' }, icon, h('div', { class: 'ev-copy' }, name, desc), time, h('div', { class: 'ev-bar' }, bar));
  el.hidden = true;
  parent.appendChild(el);
  let type = null;
  let acc = 1;
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.2) return;
      acc = 0;
      const ev = game.event;
      if (!ev) {
        if (type) {
          el.hidden = true;
          type = null;
        }
        return;
      }
      if (type !== ev.type) {
        type = ev.type;
        el.hidden = false;
        el.className = 'evchip ev-' + ev.type;
        icon.innerHTML = EVENT_ICON[ev.type] || ICON.sun;
        setText(name, ev.def.name);
        setText(desc, ev.def.desc);
      }
      const left = Math.max(0, ev.endsAt - game.time);
      setText(time, clock(left));
      setStyle(bar, 'transform', `scaleX(${(left / (ev.endsAt - ev.startedAt)).toFixed(3)})`);
    },
  };
}

// ------------------------------------------------------------------ proximity prompt

const RING_C = 2 * Math.PI * 21;

function createPrompt(app, parent, me) {
  const key = h('span', { class: 'pp-k' });
  const ring = h('span', {
    class: 'pp-ring',
    html: `<svg viewBox="0 0 50 50" aria-hidden="true"><circle class="bg" cx="25" cy="25" r="21"/><circle class="fg" cx="25" cy="25" r="21" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${RING_C.toFixed(1)}"/></svg>`,
  });
  const fg = ring.querySelector('.fg');
  const verb = h('span', { class: 'pp-verb' });
  const how = h('span', { class: 'pp-how' });
  const label = h('span', { class: 'pp-label' });
  const el = h('div', { class: 'prompt', 'aria-live': 'polite' },
    h('span', { class: 'pp-key' }, ring, key),
    h('span', { class: 'pp-copy' }, h('span', { class: 'pp-top' }, verb, how), label));
  parent.appendChild(el);
  let lastKey = null;
  let lastF = -1;
  return {
    update() {
      const it = me.interact;
      const show = !!it?.key && app.state === 'playing';
      toggle(el, 'show', show);
      if (!show) {
        lastKey = null;
        return;
      }
      if (it.key !== lastKey) {
        lastKey = it.key;
        el.classList.remove('in');
        void el.offsetWidth;
        el.classList.add('in');
      }
      const dev = app.input.lastDevice;
      setText(key, dev === 'gamepad' ? 'B' : dev === 'touch' || isTouch() ? '' : 'E');
      toggle(el, 'tp', dev === 'touch' || (isTouch() && dev !== 'keyboard' && dev !== 'gamepad'));
      setText(verb, it.verb || 'Use');
      // every hold gets the ring (even the quick 0.25 s grab); only real holds get the HOLD tag
      const hold = it.hold > 0;
      setText(how, it.hold > 0.3 ? 'HOLD' : '');
      setText(label, it.label || '');
      setStyle(el, '--rc', it.rarity ? rarityColor(it.rarity) : '#ffffff');
      toggle(el, 'steal', it.verb === 'Steal');
      toggle(el, 'secret', it.rarity === 'secret');
      const f = hold ? Math.min(1, it.t / it.hold) : 0;
      if (Math.abs(f - lastF) > 0.004) {
        lastF = f;
        fg.style.strokeDashoffset = (RING_C * (1 - f)).toFixed(1);
      }
      toggle(el, 'holding', f > 0);
    },
  };
}

// ------------------------------------------------------------------ carry pill + thief tracker

function createCarry(app, parent, me) {
  const game = app.game;
  const mk = (cls) => {
    const arrow = h('span', { class: 'cp-arrow', html: ICON.arrow });
    const l1 = h('span', { class: 'cp-l1' });
    const l2 = h('span', { class: 'cp-l2' });
    const el = h('div', { class: 'carry ' + cls }, arrow, h('span', { class: 'cp-copy' }, l1, l2));
    parent.appendChild(el);
    return { el, arrow, l1, l2 };
  };
  const carry = mk('mine');
  const track = mk('tracker');
  const L = LAYOUT.gardens[me.slot];
  const garden = game.gardens[me.slot];
  // arrows follow a route around fences (via gates and the road arch); the distance is the walking distance
  const guide = (target) => guidePoint(me.pos, target, game.physics?.boxes);
  const aim = (w, g) => setStyle(w.arrow, 'transform', `rotate(${screenAngle(me.pos, g, app.cam?.yaw || 0).toFixed(2)}rad)`);
  let acc = 1;
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.066) return;
      acc = 0;
      const playing = app.state === 'playing';
      const c = me.carrying;
      toggle(carry.el, 'show', !!c && playing);
      if (c && playing) {
        const sid = c.kind === 'seed' ? c.speciesId : c.plant.speciesId;
        const mut = c.kind === 'seed' ? c.mutation : c.plant.mutation;
        const name = `<b style="--rc:${rarityColor(PLANT[sid].rarity)}">${esc(game.plantName(sid, mut))}</b>`;
        // standing in your own garden with no free planter: say what to do instead of "bring it home"
        const full = c.kind === 'seed' && gardenContains(L, me.pos.x, me.pos.z) && !garden.planters.some((pl) => pl.unlocked && !pl.plant);
        toggle(carry.el, 'stolen', c.kind === 'plant');
        toggle(carry.el, 'full', full);
        setHTML(carry.l1, c.kind === 'plant' ? `STOLEN ${name}` : `Carrying ${name}`);
        if (full) setHTML(carry.l2, 'Garden full! Sell a grown plant or drop the seed');
        else {
          const g = guide(L.inside);
          aim(carry, g);
          setHTML(carry.l2, `Bring it HOME! <em>${Math.round(g.dist)} studs</em>`);
        }
      }
      let thief = null;
      for (const p of game.players) if (p !== me && p.carrying?.kind === 'plant' && p.carrying.fromSlot === me.slot) thief = p;
      toggle(track.el, 'show', !!thief && playing);
      if (thief && playing) {
        const g = guide(thief.pos);
        aim(track, g);
        setStyle(track.el, '--c', thief.char.color);
        setHTML(track.l1, `STOP <b class="who" style="--c:${thief.char.color}">${esc(thief.name.toUpperCase())}</b>!`);
        setHTML(track.l2, `They have your ${esc(game.plantName(thief.carrying.plant.speciesId, thief.carrying.plant.mutation))} <em>${Math.round(g.dist)} studs</em>`);
      }
    },
  };
}

// ------------------------------------------------------------------ hotbar

function createHotbar(app, parent, me, emoteSlot, hudRoot) {
  const game = app.game;
  const tip = h('div', { class: 'hb-tip' });
  const slots = ITEMS.map((it, i) => {
    const count = h('span', { class: 'hb-n' });
    const timer = h('span', { class: 'hb-timer' });
    const b = noFocus(h('button', { class: 'slot', type: 'button', 'aria-label': `${it.name} (key ${it.key})`, title: `${it.name}: ${it.desc}` },
      h('span', { class: 'hb-k', text: it.key }), h('span', { class: 'hb-ic', html: ITEM_ICONS[it.id] }), count, timer));
    onPress(b, () => {
      app.input.tap('item', i);
      b.classList.remove('press');
      void b.offsetWidth;
      b.classList.add('press');
    });
    return { b, count, timer, it, until: 0, total: 1 };
  });
  const bar = h('div', { class: 'hotbar', role: 'toolbar', 'aria-label': 'Items' }, slots.map((s) => s.b));
  const row = h('div', { class: 'hb-row' }, bar);
  parent.append(tip, row);
  // the emote button sits beside the hotbar with a mouse, and by the thumb buttons on touch screens
  const placeEmote = () => {
    if (!emoteSlot) return;
    const target = isTouch() ? hudRoot : row;
    if (emoteSlot.parentNode !== target) target.appendChild(emoteSlot);
  };
  placeEmote();
  const offTouch = onTouchChange(placeEmote);
  let sel = -1;
  let tipTimer = 0;
  let acc = 1;
  return {
    update(dt) {
      if (tipTimer > 0) {
        tipTimer -= dt;
        if (tipTimer <= 0) tip.classList.remove('show');
      }
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      const now = game.time;
      if (me.selectedItem !== sel) {
        if (sel !== -1) {
          const it = ITEMS[me.selectedItem];
          tip.innerHTML = `<b>${esc(it.name)}</b> ${esc(it.desc)}`;
          tip.classList.add('show');
          tipTimer = 2.2;
        }
        sel = me.selectedItem;
      }
      slots.forEach((s, i) => {
        const n = me.items[s.it.id] || 0;
        setText(s.count, n > 99 ? '99+' : String(n));
        toggle(s.b, 'sel', i === sel);
        toggle(s.b, 'empty', n <= 0);
        // timed items: stacking extends the timer, so the bar tracks the whole stack (full on each use)
        let f = 0;
        const until = s.it.id === 'coil' ? me.coilUntil : s.it.id === 'cloak' ? me.cloakUntil : 0;
        if (until > now) {
          if (until !== s.until) {
            s.until = until;
            s.total = Math.max(s.it.duration || 1, until - now);
          }
          f = (until - now) / s.total;
        }
        toggle(s.b, 'active', f > 0);
        setStyle(s.timer, 'transform', `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`);
      });
    },
    dispose: offTouch,
  };
}

// ------------------------------------------------------------------ road meter

function createRoadMeter(app, parent, me) {
  const game = app.game;
  const start = WORLD.road.startZ;
  const len = ROAD_END_Z - start;
  const segs = BIOMES.map((b) => h('div', { class: 'm-seg', style: `--bg:${b.ground};--rc:${RARITY[b.rarity].color}`, title: b.name }));
  const track = h('div', { class: 'm-track' }, [...segs].reverse());
  const where = h('div', { class: 'm-where' });
  const markers = game.players.map((p) => {
    const m = h('div', { class: 'm-mk' + (p === me ? ' me' : ''), style: `--c:${p.char.color}` }, avatarEl(p.faceKey, 'm-ava'));
    return { p, m, face: p.faceKey };
  });
  const mine = markers.find((x) => x.p === me).m;
  mine.appendChild(where);
  const lane = h('div', { class: 'm-lane' }, track, markers.filter((x) => x.p !== me).map((x) => x.m), mine);
  const el = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('div', { class: 'm-top', html: ICON.star }), lane, h('div', { class: 'm-home', html: ICON.home }));
  parent.appendChild(el);
  let acc = 1;
  let lastBiome = -2;
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      for (const mk of markers) {
        const { p, m } = mk;
        if (mk.face !== p.faceKey) {
          mk.face = p.faceKey;
          m.querySelector('.m-ava')?.replaceWith(avatarEl(p.faceKey, 'm-ava'));
        }
        const z = p.pos.z;
        const home = z < start;
        const f = home ? 0 : Math.max(0, Math.min(1, (z - start) / len));
        setStyle(m, '--f', f.toFixed(4));
        toggle(m, 'home', home);
        toggle(m, 'hide', p.invisible(game.time) && p !== me);
        setStyle(m, '--k', String(p.slot));
      }
      const bi = biomeIndexAtZ(me.pos.z);
      if (bi !== lastBiome) {
        lastBiome = bi;
        const b = BIOMES[bi];
        setHTML(where, b ? `${esc(b.name)}<em style="color:${RARITY[b.rarity].color}">${RARITY[b.rarity].name}</em>` : 'Home');
        segs.forEach((s, i) => toggle(s, 'cur', i === bi));
      }
    },
  };
}

// ------------------------------------------------------------------ chat log + speech bubbles

// Speech bubbles are world labels. Family members often stand together, so bubbles are placed
// newest-first in screen space and one that would land on a newer bubble waits its turn (the chat log
// still shows every line). labels.js then nudges them clear of name tags.
const BUBBLE_MS = 4200;
// anchored just above the name tag (labels.js nudges the bubble up onto it); higher when carrying
const BUBBLE_Y = 7.7;
const BUBBLE_Y_CARRY = 11.4;
const _v = new Vector3();

function createChat(app, parent) {
  const game = app.game;
  const el = h('div', { class: 'chat', 'aria-live': 'polite' });
  parent.appendChild(el);
  const bubbles = new Map(); // slot -> {html, until, at, chars}
  const timers = new Set();
  const placed = [];
  const off = bus.on('chat', ({ player, text, quick }) => {
    if (!player || app.online?.isMuted?.(player)) return;
    const line = h('div', { class: 'cl' }, h('b', { style: `--c:${player.char.color}`, text: player.name + ': ' }), h('span', { text }));
    el.appendChild(line);
    while (el.children.length > 5) el.firstChild.remove();
    const id = setTimeout(() => {
      timers.delete(id);
      line.remove();
    }, 9000);
    timers.add(id);
    const now = performance.now();
    if (!player.isHuman || quick) bubbles.set(player.slot, { html: `<div class="bb">${esc(text)}</div>`, at: now, until: now + BUBBLE_MS, chars: String(text).length });
  });
  // rough on-screen box of a bubble (the label scales with distance like labels.js does)
  function box(p, b, cam) {
    _v.set(p.pos.x, p.pos.y + (p.carrying ? BUBBLE_Y_CARRY : BUBBLE_Y), p.pos.z);
    const d = _v.distanceTo(cam.position);
    _v.project(cam);
    if (_v.z >= 1) return null;
    const s = Math.max(0.55, Math.min(1.15, 26 / Math.max(8, d)));
    const w = Math.min(160, b.chars * 7 + 24) * s;
    const lines = Math.ceil((b.chars * 7) / 136);
    const hgt = (lines * 16 + 26) * s;
    const x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
    return [x - w / 2, y - hgt, x + w / 2, y];
  }
  return {
    update() {
      if (!bubbles.size) return;
      const now = performance.now();
      const cam = app.engine?.camera;
      const order = [...bubbles.entries()].sort((a, b) => b[1].at - a[1].at);
      placed.length = 0;
      for (const [slot, b] of order) {
        if (now > b.until) {
          bubbles.delete(slot);
          continue;
        }
        const p = game.players[slot];
        if (p.invisible(game.time)) continue;
        const r = cam ? box(p, b, cam) : null;
        if (r && placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) {
          b.until = Math.max(b.until, now + 2000); // wait for the newer bubble, then get a moment on screen
          if (now - b.at > BUBBLE_MS * 2.2) bubbles.delete(slot);
          continue;
        }
        if (r) placed.push(r);
        app.labels.set('bubble' + slot, { x: p.pos.x, y: p.pos.y + (p.carrying ? BUBBLE_Y_CARRY : BUBBLE_Y), z: p.pos.z }, b.html, { cls: 'bubble', maxDist: 90 });
      }
    },
    dispose() {
      off();
      for (const id of timers) clearTimeout(id);
      el.remove();
    },
  };
}

// ------------------------------------------------------------------ desktop key hints

function createKeyHints(app, parent) {
  if (load('ui:hints-off', false) || settings.tips === false) return {};
  const k = (s) => `<kbd>${s}</kbd>`;
  const kb = [
    [k('W') + k('A') + k('S') + k('D'), 'Move'], [k('Space'), 'Jump'], [k('E'), 'Grab / hold to Steal'],
    [k('Click') + k('F'), 'Bonk'], [k('1') + '-' + k('5'), 'Items'], [k('G'), 'Emotes'], [k('T'), 'Quick chat'], [k('Right-drag'), 'Camera'], [k('Esc'), 'Menu'],
  ];
  const gp = [
    [k('L'), 'Move'], [k('A'), 'Jump'], [k('B'), 'Grab / hold to Steal'], [k('X'), 'Bonk'], [k('Y'), 'Use item'], [k('LB') + k('RB'), 'Pick item'], [k('R'), 'Camera'],
  ];
  const body = h('div', { class: 'kh-body' });
  const close = noFocus(h('button', { class: 'kh-x', type: 'button', 'aria-label': 'Hide key hints', html: ICON.close }));
  const el = h('div', { class: 'keyhints' }, close, body);
  parent.appendChild(el);
  let mode = '';
  const paint = () => {
    const pad = app.input.lastDevice === 'gamepad';
    const m = pad ? 'pad' : 'kb';
    if (m === mode) return;
    mode = m;
    body.innerHTML = (pad ? gp : kb).map(([a, b]) => `<div class="kh-row"><span class="kh-k">${a}</span><span>${b}</span></div>`).join('');
  };
  paint();
  close.addEventListener('click', () => {
    save('ui:hints-off', true);
    el.remove();
  });
  const offTouch = onTouchChange(() => el.remove());
  let acc = 0;
  return {
    update(dt) {
      acc += dt;
      if (acc > 1) {
        acc = 0;
        paint();
      }
    },
    dispose() {
      offTouch();
      el.remove();
    },
  };
}
