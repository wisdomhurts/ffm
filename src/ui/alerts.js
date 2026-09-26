// Banners, toasts and big centre-screen moments (rarity reveals, weather, rebirth).
import { h, esc } from './dom.js';
import { avatarEl, hydrateAvatars } from './avatars.js';

const MAX_STACK = 3;

export function createAlerts(host, centerHost = host) {
  const stack = h('div', { class: 'alerts', role: 'status', 'aria-live': 'polite' });
  const center = h('div', { class: 'center-moment' });
  host.appendChild(stack);
  centerHost.appendChild(center);
  const items = new Map(); // key -> {el, timer}
  const timers = new Set();
  let seq = 0;
  let moment = null;

  // Tests can set window.__UI_HOLD_ALERTS__ = true to keep alerts on screen while screenshotting slowly.
  const later = (fn, ms) => {
    if (window.__UI_HOLD_ALERTS__ && ms > 1000) return 0;
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const cancel = (id) => {
    clearTimeout(id);
    timers.delete(id);
  };

  function removeItem(key) {
    const it = items.get(key);
    if (!it) return;
    items.delete(key);
    cancel(it.timer);
    it.el.classList.add('out');
    later(() => it.el.remove(), 320);
  }

  /**
   * show({key, kind:'danger'|'warn'|'good'|'info'|'gold', html, face:charId, icon:svg, duration, sticky, cls})
   * Re-showing the same key updates it in place and restarts its timer.
   */
  function show(o) {
    const key = o.key || 'a' + seq++;
    const duration = o.duration ?? 3200;
    let it = items.get(key);
    if (it) {
      it.body.innerHTML = o.html;
      hydrateAvatars(it.body);
      it.el.className = `alert a-${o.kind || 'info'} ${o.cls || ''}`;
      it.el.classList.remove('bump');
      void it.el.offsetWidth;
      it.el.classList.add('bump');
      cancel(it.timer);
    } else {
      const el = h('div', { class: `alert a-${o.kind || 'info'} ${o.cls || ''}` });
      if (o.face) el.appendChild(avatarEl(o.face, 'a-ava'));
      else if (o.icon) el.appendChild(h('span', { class: 'a-ic', html: o.icon }));
      const body = h('div', { class: 'a-body', html: o.html });
      hydrateAvatars(body);
      el.appendChild(body);
      stack.prepend(el);
      it = { el, body, sticky: !!o.sticky, timer: 0 };
      items.set(key, it);
      // keep the stack short: drop the oldest non-sticky banners
      const keys = [...items.keys()];
      let extra = items.size - MAX_STACK;
      for (const k of keys) {
        if (extra <= 0) break;
        if (k !== key && !items.get(k).sticky) {
          removeItem(k);
          extra--;
        }
      }
    }
    it.sticky = !!o.sticky;
    it.timer = o.sticky ? 0 : later(() => removeItem(key), duration);
    return key;
  }

  function toast(html, kind = 'info', o = {}) {
    return show({ kind, html, duration: 2400, cls: 'toast', ...o });
  }

  function setMoment(el, ms) {
    if (moment) {
      const old = moment;
      cancel(old.timer);
      old.el.classList.add('out');
      later(() => old.el.remove(), 350);
    }
    center.appendChild(el);
    const m = { el, timer: 0 };
    m.timer = later(() => {
      el.classList.add('out');
      later(() => el.remove(), 400);
      if (moment === m) moment = null;
    }, ms);
    moment = m;
  }

  /** Big rarity reveal card for a freshly grabbed seed. */
  function reveal({ rarity, rarityName, name, mutation, mutationName, sub }) {
    const kicker = rarity === 'secret' ? 'SECRET SEED!!!' : `${rarityName.toUpperCase()} SEED!`;
    const el = h('div', { class: `reveal r-${rarity}${mutation !== 'normal' ? ' m-' + mutation : ''}` },
      h('div', { class: 'rv-rays' }),
      h('div', { class: 'rv-card' },
        h('div', { class: 'rv-kicker', text: kicker }),
        mutationName ? h('div', { class: `rv-mut mut mut-${mutation}`, text: mutationName.toUpperCase() }) : null,
        h('div', { class: 'rv-name', text: name }),
        sub ? h('div', { class: 'rv-sub', html: sub }) : null));
    setMoment(el, rarity === 'secret' ? 3400 : 2400);
  }

  /** Big announcement (weather events, rebirth, match milestones). */
  function announce({ title, sub, icon, cls = '', ms = 3000 }) {
    const el = h('div', { class: 'announce ' + cls },
      icon ? h('div', { class: 'an-ic', html: icon }) : null,
      h('div', { class: 'an-title', text: title }),
      sub ? h('div', { class: 'an-sub', html: sub }) : null);
    setMoment(el, ms);
  }

  function clear() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    items.clear();
    stack.textContent = '';
    center.textContent = '';
    moment = null;
  }

  return {
    show,
    toast,
    remove: removeItem,
    has: (key) => items.has(key),
    reveal,
    announce,
    dispose() {
      clear();
      stack.remove();
      center.remove();
    },
  };
}

export const who = (p, loud = false) => `<b class="who" style="--c:${p.char.color}">${esc(loud ? p.name.toUpperCase() : p.name)}</b>`;
