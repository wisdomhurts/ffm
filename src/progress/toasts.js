// Celebration toasts: badge earned, quest complete, quest cash delivered, yesterday's rewards collected, a new
// Seed Almanac sticker ("NEW! Gold Desert Rose"; a burst becomes one "5 new stickers!" toast) and a collection
// step ("Family Four 2/4"; the last step is the full-screen celebration in celebrate.js, not a toast).
// One at a time from a short queue. In a game they sit in the HUD's top column (above the alert banners, so the
// HUD's own layout rules keep them clear of the prompt/carry pills); otherwise, or while a menu is open, in a
// layer of their own at the top of the screen. Tapping one opens the Quests & Badges panel.
import { bus } from '../core/events.js';
import { h, esc } from '../ui/dom.js';
import { avatarEl } from '../ui/avatars.js';
import { plantIcon } from '../social/plantIcon.js';
import { glyph, medal, metalFor } from './art.js';
import { cashText, stickerName, collectionOfBadge, COLLECTIONS } from './catalog.js';

const MS = { badge: 3600, quest: 3200, cash: 3000, settled: 3600, many: 3600, sticker: 2600, stickers: 3200, collection: 3800 };
// which panel tab a tapped toast opens
const TAB = { badge: 'badges', many: 'badges', collection: 'badges', sticker: 'almanac', stickers: 'almanac' };
const inCollection = (speciesId) => COLLECTIONS.some((c) => c.items.some((it) => it.id === speciesId));
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
    } else if (t.kind === 'sticker') {
      ic = `<span class="pg-t-disc stk">${plantIcon(t.speciesId, t.mutation || 'normal')}</span>`;
      kicker = t.mastered ? 'Mastered!' : 'Seed Almanac';
      name = 'NEW! ' + stickerName(t.speciesId, t.mutation || 'normal', t.mutation ? null : t.size);
      sub = `${t.stars ? starChip(t.stars) : ''}<span>${t.mastered ? 'All 4 finishes!' : t.first ? 'New plant sticker' : 'New sticker'}</span>`;
    } else if (t.kind === 'stickers') {
      ic = `<span class="pg-t-disc stk">${plantIcon(t.last.speciesId, t.last.mutation || 'normal')}</span>`;
      cls = 'sticker';
      kicker = 'Seed Almanac';
      name = `${t.count} new stickers!`;
      sub = `${t.stars ? starChip(t.stars) : ''}<span>${esc(t.names.slice(0, 2).join(', ') + (t.count > 2 ? '…' : ''))}</span>`;
    } else if (t.kind === 'collection') {
      ic = `<span class="pg-t-disc stk">${plantIcon(t.item.id)}</span>`;
      kicker = `${t.collection.name} ${t.count}/${t.total}`;
      name = t.item.name + '!';
      sub = `<span class="pg-t-pips">${t.collection.items.map((_, i) => `<i class="${i < t.count ? 'on' : ''}"></i>`).join('')}</span><span>${t.total - t.count} to go</span>`;
    }
    const icEl = h('span', { class: 'pg-t-ic', html: ic });
    if (t.kind === 'collection' && t.item.family) icEl.appendChild(avatarEl(t.item.family, 'pg-t-ava'));
    if (t.kind === 'badge' || t.kind === 'many' || t.kind === 'quest' || t.kind === 'collection' || t.mastered) icEl.appendChild(sparks());
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
      open?.(TAB[t.kind] || 'quests');
    });
    return el;
  }

  function sound(t) {
    try {
      if (t.kind === 'badge' || t.kind === 'many' || t.kind === 'collection') app.audio?.play?.('confetti', { important: true, vol: 0.7 });
      else if (t.kind === 'quest' || t.kind === 'sticker' || t.kind === 'stickers') app.audio?.play?.('unlock', { important: true, vol: t.kind === 'quest' ? 1 : 0.6 });
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
    } else if (t.kind === 'sticker' && queue.some((x) => x.kind === 'sticker' || x.kind === 'stickers')) {
      // a burst of new stickers (a returning player's garden, a lucky run) becomes one summary toast
      let sum = queue.find((x) => x.kind === 'stickers');
      if (!sum) {
        const one = queue.find((x) => x.kind === 'sticker');
        sum = { kind: 'stickers', count: 1, stars: one.stars || 0, names: [stickerName(one.speciesId, one.mutation || 'normal')], last: one };
        queue.splice(queue.indexOf(one), 1, sum);
      }
      sum.count++;
      sum.stars += t.stars || 0;
      sum.names.push(stickerName(t.speciesId, t.mutation || 'normal'));
      sum.last = t;
    } else queue.push(t);
    pump();
  }

  const offs = [
    // a collection's badge has its own full-screen celebration (celebrate.js)
    bus.on('badge:earned', ({ badge }) => badge && !collectionOfBadge(badge.id) && push({ kind: 'badge', badge })),
    // a plant's first sticker in a collection is told by the collection toast instead
    bus.on('almanac:sticker', ({ speciesId, mutation, size, first, mastered, stars }) => speciesId && !(first && inCollection(speciesId)) &&
      push({ kind: 'sticker', speciesId, mutation, size, first, mastered, stars })),
    bus.on('collection:progress', ({ collection, item, count, total }) => collection && item && count < total && push({ kind: 'collection', collection, item, count, total })),
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
