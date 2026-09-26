// Celebration toasts: badge earned, quest complete, quest cash delivered, yesterday's rewards collected.
// One at a time from a short queue. In a game they sit in the HUD's top column (above the alert banners, so the
// HUD's own layout rules keep them clear of the prompt/carry pills); otherwise, or while a menu is open, in a
// layer of their own at the top of the screen. Tapping one opens the Quests & Badges panel.
import { bus } from '../core/events.js';
import { h, esc } from '../ui/dom.js';
import { glyph, medal, metalFor } from './art.js';
import { cashText } from './catalog.js';

const MS = { badge: 3600, quest: 3200, cash: 3000, settled: 3600, many: 3600 };
const SPARK_COLORS = ['#ffd23f', '#ff7cbc', '#5cb8ff', '#6fe07a', '#ffffff', '#b36bff'];

const starChip = (n) => `<span class="pg-chipv">${glyph('star')}+${n | 0}</span>`;
const cashChip = (n) => `<span class="pg-chipv cash">+${esc(cashText(n))}</span>`;

export function createToasts(app, { open } = {}) {
  const globalLayer = h('div', { class: 'pg-toasts global', role: 'status', 'aria-live': 'polite' });
  (app.root || document.body).appendChild(globalLayer);
  let hudLayer = null;
  const queue = [];
  let current = null;
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const hold = () => typeof window !== 'undefined' && !!window.__UI_HOLD_ALERTS__;

  let preferTop = false; // the HUD column would put toasts on the prompt/carry pills (tiny screens)
  function host() {
    const blocking = app.menus?.isBlocking?.();
    if (hudLayer?.isConnected && app.state === 'playing' && !blocking && !preferTop) return hudLayer;
    return globalLayer;
  }

  function sparks() {
    const box = h('span', { class: 'pg-sparks', 'aria-hidden': 'true' });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const r = 34 + Math.random() * 22;
      box.appendChild(h('i', { style: `--x:${(Math.cos(a) * r).toFixed(0)}px;--y:${(Math.sin(a) * r).toFixed(0)}px;--c:${SPARK_COLORS[i % SPARK_COLORS.length]};--d:${(0.15 + Math.random() * 0.2).toFixed(2)}s` }));
    }
    return box;
  }

  function build(t) {
    let ic = '';
    let kicker = '';
    let name = '';
    let sub = '';
    let cls = t.kind;
    if (t.kind === 'badge') {
      const b = t.badge;
      ic = medal(b.icon, metalFor(b.tier, b.tiers));
      kicker = 'Badge earned!';
      name = b.name;
      sub = `${starChip(b.stars)}<span>${esc(b.how)}</span>`;
    } else if (t.kind === 'many') {
      ic = medal('star', 'gold');
      cls = 'badge';
      kicker = `${t.count} badges earned!`;
      name = t.names.slice(0, 2).join(', ') + (t.count > 2 ? '…' : '');
      sub = starChip(t.stars);
    } else if (t.kind === 'quest') {
      const q = t.quest;
      ic = `<span class="pg-t-disc">${glyph(q.icon)}</span>`;
      kicker = 'Quest complete!';
      name = q.text;
      sub = `${starChip(q.stars)}${q.cash ? cashChip(q.cash) : ''}<span>Tap to claim</span>`;
    } else if (t.kind === 'cash') {
      ic = `<span class="pg-t-disc">${glyph('coin')}</span>`;
      kicker = 'Quest cash delivered';
      name = '+' + cashText(t.amount);
      sub = '<span>Saved from your quests</span>';
    } else if (t.kind === 'settled') {
      ic = `<span class="pg-t-disc">${glyph('chest')}</span>`;
      cls = 'quest';
      kicker = 'New day, new quests!';
      name = "Yesterday's rewards collected";
      sub = `${t.stars ? starChip(t.stars) : ''}${t.cash ? cashChip(t.cash) : ''}`;
    }
    const icEl = h('span', { class: 'pg-t-ic', html: ic });
    if (t.kind === 'badge' || t.kind === 'many' || t.kind === 'quest') icEl.appendChild(sparks());
    const el = h('div', { class: `pg-toast ${cls}`, role: 'button', tabindex: '-1', 'aria-label': `${kicker} ${name}` },
      icEl,
      h('span', { class: 'pg-t-copy' },
        h('span', { class: 'pg-t-k', text: kicker }),
        h('span', { class: 'pg-t-name', text: name }),
        sub ? h('span', { class: 'pg-t-sub', html: sub }) : null));
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      hide(true);
      open?.(t.kind === 'badge' || t.kind === 'many' ? 'badges' : 'quests');
    });
    return el;
  }

  function sound(t) {
    try {
      if (t.kind === 'badge' || t.kind === 'many') app.audio?.play?.('confetti', { important: true, vol: 0.7 });
      else if (t.kind === 'quest') app.audio?.play?.('unlock', { important: true });
      else app.audio?.play?.('coins', { amount: t.amount || 100, important: true });
    } catch {
      /* sound is optional */
    }
  }

  function show(t) {
    const el = build(t);
    host().appendChild(el);
    current = { el, t, timer: 0 };
    sound(t);
    if (!hold()) current.timer = later(() => hide(), MS[t.kind] || 3000);
  }

  function hide(now = false) {
    if (!current) return;
    const c = current;
    current = null;
    clearTimeout(c.timer);
    timers.delete(c.timer);
    c.el.classList.add('out');
    later(() => {
      c.el.remove();
      pump();
    }, now ? 180 : 330);
  }

  function pump() {
    if (current || !queue.length) return;
    show(queue.shift());
  }

  function push(t) {
    // a burst of badges (e.g. a returning player's first game) becomes one summary toast
    const badges = queue.filter((x) => x.kind === 'badge' || x.kind === 'many');
    if (t.kind === 'badge' && badges.length >= 2) {
      const many = queue.find((x) => x.kind === 'many');
      if (many) {
        many.count++;
        many.stars += t.badge.stars;
        many.names.push(t.badge.name);
      } else {
        const merged = badges.slice(1);
        for (const m of merged) queue.splice(queue.indexOf(m), 1);
        const all = [...merged.map((m) => m.badge), t.badge];
        queue.push({ kind: 'many', count: all.length, stars: all.reduce((a, b) => a + b.stars, 0), names: all.map((b) => b.name) });
      }
    } else queue.push(t);
    pump();
  }

  const offs = [
    bus.on('badge:earned', ({ badge }) => badge && push({ kind: 'badge', badge })),
    bus.on('quest:done', ({ quest }) => quest && push({ kind: 'quest', quest })),
    bus.on('progress:delivered', ({ amount }) => amount > 0 && push({ kind: 'cash', amount })),
    bus.on('progress:settled', ({ stars, cash }) => (stars || cash) && push({ kind: 'settled', stars, cash })),
    // a claimed quest's "tap to claim" toast is stale: drop it
    bus.on('quest:claimed', ({ quest }) => {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'quest' && queue[i].quest.index === quest.index) queue.splice(i, 1);
      if (current?.t.kind === 'quest' && current.t.quest.index === quest.index) hide(true);
    }),
    bus.on('game:dispose', () => {
      // a toast inside the old HUD goes with it; keep the queue for the next screen
      if (current && current.el.parentNode === hudLayer) hide(true);
      hudLayer = null;
    }),
  ];

  return {
    /** The HUD registers its top column here while a game is on screen (null to unregister). */
    setHudLayer(el) {
      hudLayer = el || null;
      preferTop = false;
    },
    /** While true, toasts use the top overlay instead of the HUD column (the one on screen moves now). */
    setPreferTop(v) {
      preferTop = !!v;
      if (preferTop && current && current.el.parentNode === hudLayer) globalLayer.appendChild(current.el);
    },
    push,
    /** Drop everything on screen and queued (tests, screenshots). */
    clear() {
      queue.length = 0;
      if (!current) return;
      const c = current;
      current = null;
      clearTimeout(c.timer);
      c.el.remove();
    },
    get showing() {
      return current?.t || null;
    },
    dispose() {
      offs.forEach((f) => f());
      for (const id of timers) clearTimeout(id);
      timers.clear();
      globalLayer.remove();
    },
  };
}
