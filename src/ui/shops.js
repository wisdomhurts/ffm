// Shop panels (Gear, Speed, Rebirth). Built by menus.openShop(); the game keeps running underneath.
import { ITEMS, BIOMES, PLAYER, REBIRTH, LOCK, BOOST, TREADMILL, speedAt, speedCost, speedCostN } from '../config.js';
import { bus } from '../core/events.js';
import { h, money, setText } from './dom.js';
import { ICON, ITEM_ICONS } from './icons.js';
import { monsterSpeed, levelToOutrun, outruns, fmtSpeed } from './goal.js';

/** Relative luminance of a '#rrggbb' colour, 0 (black) .. 1 (white). */
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

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
  const offs = ['purchase', 'purchase:fail', 'speed:up', 'boost:up', 'treadmill:up', 'pump:start', 'rebirth', 'cash:collected'].map((n) => bus.on(n, refresh));
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
      const r = app.act('buyItem', it.id, qty); // undefined = sent to the online host
      if (r === false) bump(b, 'nope');
      else if (r) bump(card, 'bought');
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
  injectSpeedCSS();
  const lvl = h('span', { class: 'sp-lvl' });
  const now = h('span', { class: 'sp-now' });
  const next = h('span', { class: 'sp-next' });
  const pumped = h('span', { class: 'sp-pump' });
  const buy = (n, btn) => {
    const r = app.act('buySpeed', n); // undefined = sent to the online host
    if (r === false) bump(btn, 'nope');
    else if (r) bump(lvl, 'bump');
  };
  const train = h('button', { class: 'btn btn-green btn-xl sp-train', type: 'button', 'data-autofocus': '' });
  const x10 = h('button', { class: 'btn btn-blue sp-bulk', type: 'button' });
  const xmax = h('button', { class: 'btn btn-gold sp-bulk', type: 'button' });
  train.addEventListener('click', () => buy(1, train));
  x10.addEventListener('click', () => buy(10, x10));
  xmax.addEventListener('click', () => buy('max', xmax));
  // Boost Lab + treadmill tier
  const bLvl = h('b');
  const bStats = h('span', { class: 'sx-stats' });
  const bBtn = h('button', { class: 'btn btn-purple sx-btn', type: 'button' });
  bBtn.addEventListener('click', () => {
    const r = app.act('buyBoost');
    if (r === false) bump(bBtn, 'nope');
  });
  const tName = h('b');
  const tStats = h('span', { class: 'sx-stats' });
  const tBtn = h('button', { class: 'btn btn-blue sx-btn', type: 'button' });
  tBtn.addEventListener('click', () => {
    const r = app.act('buyTreadmill');
    if (r === false) bump(tBtn, 'nope');
  });
  const keyName = app.input?.lastDevice === 'touch' ? 'the boost button' : app.input?.lastDevice === 'gamepad' ? 'RT' : 'Shift';
  // monster speeds as they really are in this match (difficulty scales them)
  const monsters = BIOMES.map((b, i) => ({ b, i, ms: monsterSpeed(game, b) })).filter((x) => x.b.monster);
  const maxScale = Math.max(...monsters.map((m) => m.ms)) + 8;
  // a world's colour dot: its ground, or its walls where the ground is snow-white (Frostfall, Cloud Kingdom...)
  const dot = (b) => (lum(b.ground) > 0.82 ? b.wall : b.ground);
  const you = h('span', { class: 'sr-you' }, h('span', { text: 'YOU' }));
  const track = h('div', { class: 'sr-track' },
    monsters.map(({ b, ms }) => h('span', { class: 'sr-tick', style: `left:${(ms / maxScale) * 100}%;--c:${dot(b)}` })), you);
  const rows = monsters.map(({ b, ms }) => {
    const status = h('span', { class: 'sr-st' });
    const row = h('div', { class: 'sr-row', style: `--c:${dot(b)}` },
      h('span', { class: 'sr-dot' }), h('span', { class: 'sr-biome', text: b.name }), h('span', { class: 'sr-mon', text: b.monster.name }),
      h('span', { class: 'sr-spd', text: fmtSpeed(ms) }), status);
    return { b, ms, row, status };
  });
  const el = h('div', { class: 'speed-body' },
    h('div', { class: 'sp-card' },
      h('span', { class: 'sp-bolt', html: ICON.bolt }),
      h('div', { class: 'sp-copy' }, lvl, now, next, pumped)),
    train,
    h('div', { class: 'sp-bulks' }, x10, xmax),
    h('div', { class: 'sx-row' },
      h('div', { class: 'sx-card sx-boost' },
        h('div', { class: 'sx-head' }, h('span', { class: 'sx-ic', html: ICON.boost }), h('div', null, h('span', { class: 'sx-t', text: 'Boost Lab' }), bLvl)),
        bStats, h('span', { class: 'sx-tip', text: `Press ${keyName} for a burst of speed. Great for escaping monsters!` }), bBtn),
      h('div', { class: 'sx-card sx-tread' },
        h('div', { class: 'sx-head' }, h('span', { class: 'sx-ic', html: ICON.treadmill }), h('div', null, h('span', { class: 'sx-t', text: 'Treadmill' }), tName)),
        tStats, h('span', { class: 'sx-tip', text: 'Run on the Warm-Up treadmill (the right one) without falling off to get Pumped!' }), tBtn)),
    h('div', { class: 'sr' },
      h('div', { class: 'sr-title' }, h('b', { text: 'Can you outrun the road monsters?' }), h('span', { text: ` Carrying a seed slows you to ${Math.round(PLAYER.carrySeedMult * 100)}%.` })),
      track,
      h('div', { class: 'sr-rows' }, rows.map((r) => r.row))));
  const setBtn = (b, html) => {
    if (b._h !== html) b.innerHTML = b._h = html;
  };
  return {
    el,
    refresh() {
      const s = speedAt(me.speedLevel, me.rebirths);
      const carry = s * PLAYER.carrySeedMult;
      const t = game.time;
      setText(lvl, `Speed Lv ${me.speedLevel}`);
      setText(now, `${s} studs/s (${carry.toFixed(1)} with a seed)`);
      // no top level: there is always a next one
      const n = me.speedLevel + 1;
      const cost = speedCost(n);
      setText(next, `Next: Lv ${n} = ${speedAt(n, me.rebirths)} studs/s (+${PLAYER.speedPerLevel})`);
      setText(pumped, t < me.pumpUntil ? `PUMPED! +${Math.round((me.pumpMult - 1) * 100)}% for ${Math.ceil(me.pumpUntil - t)} s` : '');
      setBtn(train, `<span class="bi">${ICON.bolt}</span><span>TRAIN</span><small>${money(cost)}</small>`);
      train.disabled = me.cash < cost;
      // x10: the next ten levels; MAX: as many as the cash buys
      const c10 = speedCostN(me.speedLevel, 10);
      setBtn(x10, `<span>x10</span><small>${money(c10)}</small>`);
      x10.disabled = me.cash < cost;
      let nMax = 0, cMax = 0;
      while (nMax < 1000 && cMax + speedCost(me.speedLevel + nMax + 1) <= me.cash) cMax += speedCost(me.speedLevel + ++nMax);
      setBtn(xmax, `<span>MAX${nMax ? ' +' + nMax : ''}</span><small>${nMax ? money(cMax) : '—'}</small>`);
      xmax.disabled = nMax < 1;
      // Boost Lab
      const B = me.boostLevel;
      setText(bLvl, `Lv ${B} / ${BOOST.maxLevel}`);
      setText(bStats, `+${Math.round((BOOST.power(B) - 1) * 100)}% speed for ${BOOST.duration(B).toFixed(1)} s, every ${BOOST.cooldown(B).toFixed(1)} s`);
      if (B >= BOOST.maxLevel) {
        setBtn(bBtn, '<span>MAXED!</span>');
        bBtn.disabled = true;
      } else {
        const bc = BOOST.cost(B + 1);
        setBtn(bBtn, `<span>Lv ${B + 1}: +${Math.round((BOOST.power(B + 1) - 1) * 100)}%</span><small>${money(bc)}</small>`);
        bBtn.disabled = me.cash < bc;
      }
      // treadmill tier
      const T = TREADMILL.tiers[me.treadmillTier] || TREADMILL.tiers[0];
      setText(tName, T.name);
      setText(tStats, `Warm up ${T.warmup} s: +${Math.round(T.bonus * 100)}% speed for ${T.duration} s`);
      const NT = TREADMILL.tiers[me.treadmillTier + 1];
      if (!NT) {
        setBtn(tBtn, '<span>BEST TREADMILL!</span>');
        tBtn.disabled = true;
      } else {
        setBtn(tBtn, `<span>${NT.name.replace(' Treadmill', '')}: +${Math.round(NT.bonus * 100)}%</span><small>${money(NT.cost)}</small>`);
        tBtn.disabled = me.cash < NT.cost;
      }
      you.style.left = `${Math.min(100, (carry / maxScale) * 100)}%`;
      for (const r of rows) {
        const ok = outruns(s, r.ms);
        r.row.classList.toggle('ok', ok);
        const html = ok ? `${ICON.check}<span>Faster!</span>` : `<span>Need Lv ${levelToOutrun(r.ms, me.rebirths)}</span>`;
        if (r.status._h !== html) r.status.innerHTML = r.status._h = html;
      }
    },
  };
}

let speedCSS = false;
function injectSpeedCSS() {
  if (speedCSS || typeof document === 'undefined') return;
  speedCSS = true;
  const el = document.createElement('style');
  el.id = 'sas-speedshop';
  el.textContent = `
.sp-pump{font:900 13px/1.2 var(--fb);color:#ff9ad8;text-shadow:0 0 8px rgba(255,79,216,.6)}
.sp-pump:empty{display:none}
.sp-bulks{display:flex;gap:10px;margin-top:-4px}
.sp-bulk{min-width:128px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 14px 10px}
.sp-bulk span{font:var(--fdw) 20px/1 var(--fd)}
.sp-bulk small{font:900 13px/1 var(--fb)}
.btn-gold{--b1:#ffe36b;--b2:#f0a515;color:var(--ink)}
.btn-purple{--b1:#c08bff;--b2:#7a3fe0}
.sx-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}
.sx-card{display:flex;flex-direction:column;gap:7px;padding:12px;border-radius:18px;border:3px solid var(--ink);background:rgba(10,15,40,.4)}
.sx-boost{box-shadow:inset 0 0 0 2px rgba(179,107,255,.35)}
.sx-tread{box-shadow:inset 0 0 0 2px rgba(63,240,255,.3)}
.sx-head{display:flex;align-items:center;gap:10px}
.sx-head b{display:block;font:var(--fdw) 20px/1.05 var(--fd)}
.sx-t{font:900 12px/1 var(--fb);letter-spacing:.06em;text-transform:uppercase;color:var(--txt2)}
.sx-ic{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#2a1b5c;border:2.5px solid var(--ink);color:#d7b8ff;flex:none}
.sx-tread .sx-ic{background:#10324a;color:#7ff4ff}
.sx-ic svg{width:26px;height:26px}
.sx-stats{font:800 13.5px/1.3 var(--fb)}
.sx-tip{font:700 12px/1.3 var(--fb);color:var(--txt2)}
.sx-btn{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px 10px}
.sx-btn span{font:var(--fdw) 17px/1.05 var(--fd)}
.sx-btn small{font:900 13px/1 var(--fb)}
@media (max-width:600px){.sx-row{grid-template-columns:1fr}.sp-bulks{width:100%}.sp-bulk{flex:1;min-width:0}}
`;
  document.head.appendChild(el);
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
    if (app.act('rebirth') !== false) {
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

