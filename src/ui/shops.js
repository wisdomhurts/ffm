// Shop panels (Gear, Speed, Rebirth). Built by menus.openShop(); the game keeps running underneath.
import { ITEMS, BIOMES, PLAYER, REBIRTH, LOCK, speedAt, speedCost } from '../config.js';
import { bus } from '../core/events.js';
import { h, money, setText } from './dom.js';
import { ICON, ITEM_ICONS } from './icons.js';

const TITLES = { gear: 'Gear Shop', speed: 'Speed Shop', rebirth: 'Rebirth Altar' };
const SUBS = {
  gear: 'Tricks and tools for sneaky gardeners.',
  speed: 'Faster legs = rarer seeds. Train here!',
  rebirth: 'Start over stronger. Forever.',
};
const HEAD_ICON = { gear: ICON.shop, speed: ICON.bolt, rebirth: ICON.crown };

export function buildShop(app, kind, close) {
  const game = app.game;
  const me = app.human;
  const cash = h('span', { class: 'sh-cash-v' });
  const el = h('div', { class: 'shop-body' },
    h('div', { class: 'shop-head' },
      h('span', { class: 'sh-ic', html: HEAD_ICON[kind] || ICON.shop }),
      h('div', { class: 'sh-titles' }, h('h2', { text: TITLES[kind] || 'Shop' }), h('span', { class: 'sh-sub', text: SUBS[kind] || '' })),
      h('div', { class: 'sh-cash' }, h('span', { html: ICON.coin }), cash)));
  const builders = { gear: gearShop, speed: speedShop, rebirth: rebirthShop };
  const part = (builders[kind] || gearShop)(app, game, me, close);
  el.appendChild(part.el);

  const refresh = () => {
    setText(cash, money(me.cash));
    part.refresh();
  };
  refresh();
  const offs = ['purchase', 'purchase:fail', 'speed:up', 'rebirth', 'cash:collected'].map((n) => bus.on(n, refresh));
  const timer = setInterval(refresh, 300);
  return {
    el,
    title: TITLES[kind],
    dispose() {
      clearInterval(timer);
      offs.forEach((f) => f());
    },
  };
}

const bump = (el, cls = 'bump') => {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
};

// ------------------------------------------------------------------ gear

function gearShop(app, game, me) {
  const cards = ITEMS.map((it) => {
    const own = h('span', { class: 'gc-own' });
    const buy1 = h('button', { class: 'btn btn-green btn-sm', type: 'button' }, h('span', { text: 'Buy' }), h('small', { text: money(it.price) }));
    const buy5 = h('button', { class: 'btn btn-blue btn-sm', type: 'button' }, h('span', { text: 'Buy 5' }), h('small', { text: money(it.price * 5) }));
    const card = h('div', { class: 'gear-card' },
      h('span', { class: 'gc-key', text: it.key }),
      h('span', { class: 'gc-ic', html: ITEM_ICONS[it.id] }),
      h('div', { class: 'gc-copy' }, h('span', { class: 'gc-name', text: it.name }), h('span', { class: 'gc-desc', text: it.desc }), own),
      h('div', { class: 'gc-buy' }, buy1, buy5));
    const buy = (qty, b) => {
      if (game.buyItem(me, it.id, qty)) bump(card, 'bought');
      else bump(b, 'nope');
    };
    buy1.addEventListener('click', () => buy(1, buy1));
    buy5.addEventListener('click', () => buy(5, buy5));
    return { it, own, buy1, buy5, card };
  });
  return {
    el: h('div', { class: 'gear-grid' }, cards.map((c) => c.card)),
    refresh() {
      for (const c of cards) {
        setText(c.own, `Owned: ${me.items[c.it.id] || 0}`);
        c.buy1.disabled = me.cash < c.it.price;
        c.buy5.disabled = me.cash < c.it.price * 5;
      }
    },
  };
}

// ------------------------------------------------------------------ speed

function speedShop(app, game, me) {
  const lvl = h('span', { class: 'sp-lvl' });
  const now = h('span', { class: 'sp-now' });
  const next = h('span', { class: 'sp-next' });
  const train = h('button', { class: 'btn btn-green btn-xl sp-train', type: 'button', 'data-autofocus': '' });
  const monsters = BIOMES.map((b, i) => ({ b, i })).filter((x) => x.b.monster);
  const maxScale = Math.max(...monsters.map((m) => m.b.monster.speed)) + 8;
  const you = h('span', { class: 'sr-you' }, h('span', { text: 'YOU' }));
  const track = h('div', { class: 'sr-track' },
    monsters.map(({ b }) => h('span', { class: 'sr-tick', style: `left:${(b.monster.speed / maxScale) * 100}%;--c:${b.ground}` })), you);
  const rows = monsters.map(({ b }) => {
    const status = h('span', { class: 'sr-st' });
    const row = h('div', { class: 'sr-row', style: `--c:${b.ground}` },
      h('span', { class: 'sr-dot' }), h('span', { class: 'sr-biome', text: b.name }), h('span', { class: 'sr-mon', text: b.monster.name }),
      h('span', { class: 'sr-spd', text: `${b.monster.speed}` }), status);
    return { b, row, status };
  });
  train.addEventListener('click', () => {
    if (game.buySpeed(me)) bump(lvl, 'bump');
    else bump(train, 'nope');
  });
  const el = h('div', { class: 'speed-body' },
    h('div', { class: 'sp-card' },
      h('span', { class: 'sp-bolt', html: ICON.bolt }),
      h('div', { class: 'sp-copy' }, lvl, now, next)),
    train,
    h('div', { class: 'sr' },
      h('div', { class: 'sr-title' }, h('b', { text: 'Can you outrun the road monsters?' }), h('span', { text: ` Carrying a seed slows you to ${Math.round(PLAYER.carrySeedMult * 100)}%.` })),
      track,
      h('div', { class: 'sr-rows' }, rows.map((r) => r.row))));
  return {
    el,
    refresh() {
      const s = speedAt(me.speedLevel, me.rebirths);
      const carry = s * PLAYER.carrySeedMult;
      setText(lvl, `Speed Lv ${me.speedLevel}`);
      setText(now, `${s} studs/s (${carry.toFixed(1)} with a seed)`);
      const n = me.speedLevel + 1;
      if (n > PLAYER.maxSpeedLevel) {
        setText(next, 'MAX SPEED! You are a legend.');
        train.innerHTML = '<span>MAXED</span>';
        train.disabled = true;
      } else {
        const cost = speedCost(n);
        setText(next, `Next: Lv ${n} = ${speedAt(n, me.rebirths)} studs/s (+${PLAYER.speedPerLevel})`);
        train.innerHTML = `<span class="bi">${ICON.bolt}</span><span>TRAIN</span><small>${money(cost)}</small>`;
        train.disabled = me.cash < cost;
      }
      you.style.left = `${Math.min(100, (carry / maxScale) * 100)}%`;
      for (const r of rows) {
        const ms = r.b.monster.speed;
        const ok = carry > ms;
        r.row.classList.toggle('ok', ok);
        if (ok) r.status.innerHTML = `${ICON.check}<span>Faster!</span>`;
        else {
          const need = Math.ceil((ms / PLAYER.carrySeedMult + 0.01 - PLAYER.baseSpeed - me.rebirths * 2) / PLAYER.speedPerLevel);
          r.status.innerHTML = `<span>Need Lv ${Math.min(PLAYER.maxSpeedLevel, need)}</span>`;
        }
      }
    },
  };
}

// ------------------------------------------------------------------ rebirth

function rebirthShop(app, game, me, close) {
  const bar = h('i');
  const have = h('span', { class: 'rb-have' });
  const need = h('span', { class: 'rb-need' });
  const go = h('button', { class: 'btn btn-gold btn-xl', type: 'button' });
  const confirm = h('div', { class: 'confirm rb-confirm', hidden: true });
  const gainList = h('ul', { class: 'rb-list gain' });
  const stars = h('div', { class: 'rb-stars' });
  const el = h('div', { class: 'rebirth-body' },
    h('div', { class: 'rb-req' }, h('div', { class: 'rb-req-top' }, need, have), h('div', { class: 'rb-bar' }, bar)),
    h('div', { class: 'rb-cols' },
      h('div', { class: 'rb-col lose' }, h('h4', { text: 'Resets' }), h('ul', { class: 'rb-list' },
        h('li', { text: `Cash (back to ${money(PLAYER.startCash)})` }), h('li', { text: 'Speed levels' }), h('li', { text: 'Items' }), h('li', { text: 'Plants and planters' }))),
      h('div', { class: 'rb-col win' }, h('h4', { text: 'Yours forever' }), gainList)),
    stars, go, confirm);
  go.addEventListener('click', () => {
    if (!game.canRebirth(me)) return bump(go, 'nope');
    confirm.hidden = false;
    go.hidden = true;
    confirm.querySelector('.btn-gold')?.focus();
  });
  const yes = h('button', { class: 'btn btn-gold', type: 'button', text: 'Yes, REBIRTH!' });
  const no = h('button', { class: 'btn btn-grey', type: 'button', text: 'Not yet' });
  yes.addEventListener('click', () => {
    if (game.rebirth(me)) {
      close();
    } else {
      confirm.hidden = true;
      go.hidden = false;
    }
  });
  no.addEventListener('click', () => {
    confirm.hidden = true;
    go.hidden = false;
  });
  confirm.append(h('span', { text: 'Your garden, cash and speed reset. Ready?' }), h('div', { class: 'row' }, no, yes));
  return {
    el,
    refresh() {
      const n = me.rebirths;
      const th = REBIRTH.threshold(n);
      const f = Math.min(1, me.cash / th);
      bar.style.transform = `scaleX(${f.toFixed(3)})`;
      setText(need, `Rebirth ${n + 1} needs ${money(th)} cash`);
      setText(have, `You have ${money(me.cash)}`);
      const ready = game.canRebirth(me);
      go.disabled = !ready;
      go.innerHTML = ready ? `<span class="bi">${ICON.crown}</span><span>REBIRTH</span>` : `<span>${Math.floor(f * 100)}% there</span>`;
      const html = [
        `Income <b>×${REBIRTH.incomeMult(n + 1)}</b> on every plant`,
        '<b>+2</b> base speed',
        `Garden lock lasts <b>${LOCK.duration + LOCK.perRebirth * (n + 1)}s</b>`,
        `A shiny crown star (<b>${n + 1}</b>)`,
      ].map((t) => `<li>${t}</li>`).join('');
      if (gainList._h !== html) {
        gainList._h = html;
        gainList.innerHTML = html;
      }
      const starsHtml = n ? `<span>Your stars:</span>${ICON.star.repeat(Math.min(n, 10))}` : '';
      if (stars._h !== starsHtml) {
        stars._h = starsHtml;
        stars.innerHTML = starsHtml;
      }
    },
  };
}

