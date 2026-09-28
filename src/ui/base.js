// My Base: your garden's level, its perks and the Upgrade button, plus the Base Studio (floor, fence, gate
// laser colour and decorations). Built by menus.openShop('base') (the BASE console in your garden, or the
// pause menu); the game keeps running underneath so you can watch your garden change.
//   buildBase(app, close) -> {el, title, dispose}
// Studio picks live on the profile (profile.baseStyle, like your outfit) and follow you into every game;
// what your garden shows depends on its level there (anything above it waits until you get there).
import { BASE, BASE_STYLES, baseIncomeMult, petSlotsFor, decorSpotsFor } from '../config.js';
import { bus } from '../core/events.js';
import { getProfile, updateProfile } from '../core/profiles.js';
import { gardenContains } from '../gameplay/layout.js';
import { sanitizeBaseStyle, DECOR_SPOTS } from '../gameplay/basestyle.js';
import { thumbOf, onStudioReady } from '../pets/studio.js';
import { createDecor } from '../world/basedecor.js';
import { h, money, setText, uiSound } from './dom.js';
import { ICON } from './icons.js';

const HOUSE = '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>';
const ORD = ['', '1st', '2nd', '3rd'];

/** What each level adds (derived from BASE so the list never drifts from the rules). */
export function levelPerks(L) {
  const out = [];
  if (L === BASE.studioAt) out.push('Base Studio: floors and fences');
  const slots = petSlotsFor(L);
  if (slots > petSlotsFor(L - 1)) out.push(`${ORD[slots] || slots + 'th'} pet slot`);
  const spots = decorSpotsFor(L);
  if (spots > decorSpotsFor(L - 1)) out.push(`${spots} decoration spots`);
  const lasers = BASE_STYLES.lasers.filter((x) => x.min === L && x.min > 1);
  if (lasers.length) out.push(`Laser colours: ${lasers.map((x) => x.name).join(', ')}`);
  if (L === BASE.guardAt) out.push('Guard Gnome bonks thieves');
  if (L === BASE.treadmillAt) out.push('Home treadmill: warm up and shop at home');
  if (L === BASE.sprinklersAt) out.push(`Sprinklers: plants grow ${Math.round((BASE.sprinklerGrow - 1) * 100)}% faster`);
  if (L === BASE.lockAt) out.push(`Lock lasts ${BASE.lockBonus} s longer`);
  if (L === BASE.goldenAt) out.push('Golden base + Golden Statue');
  if (L > 1) out.push(`+${Math.round(BASE.incomePerLevel * 100)}% income`);
  return out;
}

// CSS previews of floors / fences / lasers (the real thing is in the garden behind the panel)
const FLOOR_CSS = {
  lawn: (c) => `linear-gradient(135deg,${c[0]},${c[1]})`,
  stripes: (c) => `repeating-linear-gradient(90deg,${c[0]} 0 12px,${c[1]} 12px 24px)`,
  checker: (c) => `conic-gradient(${c[0]} 25%,${c[1]} 0 50%,${c[0]} 0 75%,${c[1]} 0) 0 0/24px 24px`,
  meadow: (c) => `radial-gradient(circle at 30% 35%,#fff 0 3px,transparent 4px),radial-gradient(circle at 70% 60%,${c[1]} 0 4px,transparent 5px),radial-gradient(circle at 45% 80%,#ffd23f 0 3px,transparent 4px),${c[0]}`,
  beach: (c) => `radial-gradient(circle at 70% 30%,#fff5 0 5px,transparent 6px),linear-gradient(160deg,${c[0]},${c[1]})`,
  stone: (c) => `linear-gradient(${c[1]} 2px,transparent 2px) 0 0/20px 20px,linear-gradient(90deg,${c[1]} 2px,transparent 2px) 0 0/20px 20px,${c[0]}`,
  candy: (c) => `repeating-conic-gradient(from 0deg at 50% 50%,${c[0]} 0 20deg,${c[1]} 20deg 40deg)`,
  cloud: (c) => `radial-gradient(circle at 30% 40%,#fff 0 10px,transparent 11px),radial-gradient(circle at 65% 60%,#fff 0 12px,transparent 13px),linear-gradient(${c[0]},${c[1]})`,
  space: (c) => `radial-gradient(circle at 20% 30%,#fff 0 1.5px,transparent 2px),radial-gradient(circle at 70% 20%,#fff 0 1px,transparent 2px),radial-gradient(circle at 55% 75%,#ffe75e 0 1.5px,transparent 2px),linear-gradient(${c[0]},${c[1]})`,
  gold: (c) => `linear-gradient(${c[1]} 2px,transparent 2px) 0 0/18px 18px,linear-gradient(90deg,${c[1]} 2px,transparent 2px) 0 0/18px 18px,linear-gradient(135deg,#fff3a8,${c[0]})`,
};
const RAINBOW = 'linear-gradient(90deg,#ff3a5a,#ffb627,#ffe75e,#4cd964,#3d9bff,#b36bff)';

let styled = false;
function injectCSS() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const css = `
.shop-base .modal-panel{width:min(820px,100%)}
.bs-top{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;padding:14px 16px;border-radius:20px;background:rgba(10,15,40,.4);border:3px solid var(--ink)}
.bs-lv{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;align-content:center;background:radial-gradient(circle at 35% 30%,#fff6c2,var(--gold) 55%,#d98a12);border:4px solid var(--ink);box-shadow:inset 0 -5px 0 rgba(0,0,0,.18),0 5px 0 var(--ink);color:var(--ink)}
.bs-lv small{font:900 13px/1 var(--fb);letter-spacing:.08em}
.bs-lv b{font:var(--fdw) 44px/1 var(--fd)}
.bs-lv.max{background:radial-gradient(circle at 35% 30%,#fff,#ffe75e 45%,#ff9f1c);animation:bsGlow 1.6s ease-in-out infinite alternate}
@keyframes bsGlow{to{box-shadow:inset 0 -5px 0 rgba(0,0,0,.18),0 5px 0 var(--ink),0 0 26px #ffe75e}}
.bs-pips{display:flex;gap:5px;margin:4px 0 8px}
.bs-pips i{flex:1;height:12px;border-radius:6px;background:rgba(255,255,255,.14);border:2px solid var(--ink)}
.bs-pips i.on{background:linear-gradient(180deg,#ffe75e,#ff9f1c)}
.bs-now{font:800 14px/1.3 var(--fb);color:var(--txt2)}
.bs-now b{color:#7dffa0}
.bs-next{margin-top:10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.bs-next ul{flex:1 1 220px;margin:0;padding:0;list-style:none;display:grid;gap:3px}
.bs-next li{display:flex;gap:6px;align-items:center;font:800 13.5px/1.25 var(--fb)}
.bs-next li:before{content:'';width:9px;height:9px;border-radius:3px;background:var(--gold);border:2px solid var(--ink);flex:none}
.bs-up{min-width:210px}
.bs-up small{font-size:14px}
.bs-hint{flex-basis:100%;font:800 12.5px/1.3 var(--fb);color:#ffcf6b}
.bs-tabs{display:flex;gap:6px;margin:16px 0 10px;flex-wrap:wrap}
.bs-tab{flex:1 1 0;min-width:90px;padding:9px 10px;border-radius:14px;border:3px solid var(--ink);background:rgba(255,255,255,.08);color:#fff;font:var(--fdw) 17px/1 var(--fd);cursor:pointer;box-shadow:0 4px 0 var(--ink)}
.bs-tab.on{background:linear-gradient(180deg,#63f27f,#1fb043);color:var(--ink)}
.bs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:9px}
.bs-opt{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 6px 9px;border-radius:16px;border:3px solid var(--ink);background:rgba(255,255,255,.07);color:#fff;cursor:pointer;box-shadow:0 4px 0 var(--ink);transition:transform .12s var(--spring)}
.bs-opt:hover:not(:disabled){transform:translateY(-2px)}
.bs-opt.on{background:rgba(99,242,127,.22);box-shadow:0 0 0 3px #63f27f,0 4px 0 var(--ink)}
.bs-opt:disabled{cursor:not-allowed;filter:saturate(.35) brightness(.8)}
.bs-sw{width:100%;height:58px;border-radius:11px;border:2.5px solid var(--ink);background-size:cover}
.bs-sw.fence{display:flex;align-items:flex-end;justify-content:space-around;padding:0 6px;background:linear-gradient(#8fd6ff,#d7f2ff)}
.bs-sw.fence i{width:8px;height:70%;border-radius:3px 3px 0 0;background:var(--c);border:2px solid var(--ink);border-bottom:0}
.bs-sw.laser{display:grid;align-content:center;gap:7px;padding:0 8px;background:#1b2440}
.bs-sw.laser i{height:4px;border-radius:2px;background:var(--c);box-shadow:0 0 8px var(--c)}
.bs-sw.decor{height:84px;background:radial-gradient(ellipse at 50% 90%,#6cc24a 0 45%,transparent 46%),linear-gradient(#bfe6ff,#e8f6ff);background-size:100% 100%;display:grid;place-items:center}
.bs-sw.decor img{width:84px;height:84px;object-fit:contain}
.bs-sw.none{display:grid;place-items:center;font:900 26px/1 var(--fb);color:rgba(255,255,255,.5);background:rgba(0,0,0,.25)}
.bs-name{font:800 12.5px/1.15 var(--fb);text-align:center}
.bs-lock{position:absolute;top:6px;right:6px;display:flex;align-items:center;gap:3px;padding:3px 7px 3px 5px;border-radius:9px;background:var(--ink);font:900 11px/1 var(--fb);color:#ffcf6b}
.bs-lock svg{width:12px;height:12px}
.bs-spots{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-bottom:10px}
.bs-spot{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px;border-radius:14px;border:3px solid var(--ink);background:rgba(255,255,255,.07);color:#fff;cursor:pointer;font:800 11.5px/1.1 var(--fb);box-shadow:0 3px 0 var(--ink)}
.bs-spot.on{background:rgba(255,210,63,.25);box-shadow:0 0 0 3px var(--gold),0 3px 0 var(--ink)}
.bs-spot:disabled{cursor:not-allowed;opacity:.6}
.bs-spot img{width:46px;height:46px;object-fit:contain}
.bs-spot .bs-dot{width:46px;height:46px;border-radius:50%;border:2.5px dashed rgba(255,255,255,.45)}
.bs-note{margin:8px 2px 0;font:700 12.5px/1.35 var(--fb);color:var(--txt2)}
@media (max-width:600px){.bs-top{grid-template-columns:1fr;justify-items:center;text-align:center}.bs-lv{width:78px;height:78px}.bs-lv b{font-size:36px}
  .bs-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}.bs-spots{grid-template-columns:repeat(3,minmax(0,1fr))}.bs-up{width:100%}}
`;
  const el = document.createElement('style');
  el.id = 'sas-base';
  el.textContent = css;
  document.head.appendChild(el);
}

const TABS = [
  { id: 'floor', label: 'Floor', list: BASE_STYLES.floors },
  { id: 'fence', label: 'Fence', list: BASE_STYLES.fences },
  { id: 'laser', label: 'Laser', list: BASE_STYLES.lasers },
  { id: 'decor', label: 'Decor', list: BASE_STYLES.decor },
];

function lockTag(min) {
  return h('span', { class: 'bs-lock', html: `${ICON.lock}<span>Lv ${min}</span>` });
}

function decorThumb(id, color) {
  return thumbOf(`decor:${id}:${color}`, () => createDecor(id, { color, quality: { shadows: false } }), { size: 128 });
}

export function buildBase(app, close) {
  injectCSS();
  const game = app.game;
  const me = app.human;
  const pid = me.profileId && getProfile(me.profileId) ? me.profileId : app.profileId;
  const color = me.char.color;
  let tab = 'floor';
  let spot = 0;

  const cash = h('span', { class: 'sh-cash-v' });
  const lvNum = h('b');
  const lvBadge = h('div', { class: 'bs-lv' }, h('small', { text: 'BASE' }), lvNum);
  const pips = h('div', { class: 'bs-pips' }, Array.from({ length: BASE.maxLevel }, () => h('i')));
  const now = h('div', { class: 'bs-now' });
  const perks = h('ul');
  const up = h('button', { class: 'btn btn-green btn-lg bs-up', type: 'button' });
  const hint = h('div', { class: 'bs-hint' });
  up.addEventListener('click', () => {
    const r = app.act('upgradeBase');
    if (r === false) {
      uiSound(app, 'error');
      up.classList.remove('nope');
      void up.offsetWidth;
      up.classList.add('nope');
    }
  });
  const tabs = h('div', { class: 'bs-tabs', role: 'tablist' });
  const spots = h('div', { class: 'bs-spots' });
  const grid = h('div', { class: 'bs-grid' });
  const note = h('p', { class: 'bs-note' });

  const el = h('div', { class: 'shop-body base-body' },
    h('div', { class: 'shop-head' },
      h('span', { class: 'sh-ic', html: HOUSE }),
      h('div', { class: 'sh-titles' }, h('h2', { text: 'My Base' }), h('span', { class: 'sh-sub', text: 'Level up your garden and make it yours!' })),
      h('div', { class: 'sh-cash' }, h('span', { html: ICON.coin }), cash)),
    h('div', { class: 'bs-top' }, lvBadge,
      h('div', null, pips, now, h('div', { class: 'bs-next' }, perks, up, hint))),
    tabs, spots, grid, note);

  const style = () => sanitizeBaseStyle(getProfile(pid)?.baseStyle);
  const setStyle = (patch) => {
    updateProfile(pid, (p) => {
      p.baseStyle = sanitizeBaseStyle({ ...sanitizeBaseStyle(p.baseStyle), ...patch });
    });
    uiSound(app, 'click');
    draw();
  };

  for (const t of TABS) {
    const b = h('button', { class: 'bs-tab', type: 'button', role: 'tab', text: t.label });
    b.addEventListener('click', () => {
      tab = t.id;
      uiSound(app, 'click');
      draw();
    });
    b.dataset.tab = t.id;
    tabs.appendChild(b);
  }

  function option(item, selected, locked, swatch, onPick) {
    const b = h('button', { class: 'bs-opt' + (selected ? ' on' : ''), type: 'button', 'aria-pressed': selected ? 'true' : 'false', title: locked ? `Reach Base Lv ${item.min}` : item.name },
      swatch, h('span', { class: 'bs-name', text: item.name }), locked ? lockTag(item.min) : null);
    b.disabled = locked;
    b.addEventListener('click', onPick);
    return b;
  }

  function drawGrid() {
    const L = me.baseLevel;
    const s = style();
    grid.replaceChildren();
    spots.replaceChildren();
    spots.hidden = tab !== 'decor';
    if (tab === 'floor') {
      for (const f of BASE_STYLES.floors) {
        const sw = h('div', { class: 'bs-sw', style: `background:${(FLOOR_CSS[f.id] || FLOOR_CSS.lawn)(f.colors)}` });
        grid.appendChild(option(f, s.floor === f.id, f.min > L, sw, () => setStyle({ floor: f.id })));
      }
      setText(note, 'Floors cover your whole garden. Unlock more by levelling up your base.');
    } else if (tab === 'fence') {
      for (const f of BASE_STYLES.fences) {
        const sw = h('div', { class: 'bs-sw fence', style: `--c:${f.color}` }, h('i'), h('i'), h('i'), h('i'));
        grid.appendChild(option(f, s.fence === f.id, f.min > L, sw, () => setStyle({ fence: f.id })));
      }
      setText(note, 'Fences look different, but keep thieves out just the same (use your LOCK pad!).');
    } else if (tab === 'laser') {
      for (const f of BASE_STYLES.lasers) {
        const c = f.color === 'rainbow' ? RAINBOW : f.color;
        const sw = h('div', { class: 'bs-sw laser', style: `--c:${f.color === 'rainbow' ? '#fff' : f.color}` },
          ...[0, 1, 2].map(() => h('i', { style: f.color === 'rainbow' ? `background:${c}` : '' })));
        grid.appendChild(option(f, s.laser === f.id, f.min > L, sw, () => setStyle({ laser: f.id })));
      }
      setText(note, 'The colour of your gate lasers when you lock your garden.');
    } else {
      const open = decorSpotsFor(L);
      if (spot >= Math.max(1, open)) spot = 0;
      for (let i = 0; i < DECOR_SPOTS; i++) {
        const id = s.decor[i];
        const locked = i >= open;
        const url = id ? decorThumb(id, color) : null;
        const b = h('button', { class: 'bs-spot' + (i === spot && !locked ? ' on' : ''), type: 'button', title: locked ? `Reach Base Lv ${BASE.decorAt[i]}` : `Spot ${i + 1}` },
          url ? h('img', { src: url, alt: '' }) : h('span', { class: 'bs-dot' }),
          h('span', { text: id ? DECOR_NAME[id] : `Spot ${i + 1}` }),
          locked ? lockTag(BASE.decorAt[i]) : null);
        b.disabled = locked;
        b.addEventListener('click', () => {
          spot = i;
          uiSound(app, 'click');
          draw();
        });
        spots.appendChild(b);
      }
      if (!open) {
        setText(note, `Decorations unlock at Base Lv ${BASE.decorAt[0]}.`);
        return;
      }
      const none = h('div', { class: 'bs-sw decor none', text: '×' });
      grid.appendChild(option({ id: null, name: 'Empty', min: 1 }, !s.decor[spot], false, none, () => {
        const d = [...s.decor];
        d[spot] = null;
        setStyle({ decor: d });
      }));
      for (const f of BASE_STYLES.decor) {
        const url = decorThumb(f.id, color);
        const sw = h('div', { class: 'bs-sw decor' }, url ? h('img', { src: url, alt: '' }) : null);
        grid.appendChild(option(f, s.decor[spot] === f.id, f.min > L, sw, () => {
          const d = [...s.decor];
          d[spot] = f.id;
          setStyle({ decor: d });
        }));
      }
      setText(note, `Pick a spot, then what goes there. ${f(BASE_STYLES.decor.find((x) => x.bounce))}`);
    }
  }
  const f = (tramp) => (tramp ? `The ${tramp.name} really bounces!` : '');

  function draw() {
    const L = me.baseLevel;
    const max = L >= BASE.maxLevel;
    setText(cash, money(me.cash));
    setText(lvNum, String(L));
    lvBadge.classList.toggle('max', max);
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < L));
    now.innerHTML = `Your base gives <b>+${Math.round((baseIncomeMult(L) - 1) * 100)}% income</b> · ${petSlotsFor(L)} pet slot${petSlotsFor(L) > 1 ? 's' : ''} · ${decorSpotsFor(L)} decoration spot${decorSpotsFor(L) === 1 ? '' : 's'}`;
    perks.replaceChildren(...(max ? [h('li', { text: 'Your base is MAXED. Legendary!' })] : levelPerks(L + 1).map((t) => h('li', { text: t }))));
    const cost = BASE.cost[L + 1];
    const home = game.gardens[me.slot];
    const inside = gardenContains(home.L, me.pos.x, me.pos.z, 2);
    const html = max ? `<span>MAX LEVEL</span>` : `<span class="bi">${HOUSE}</span><span>Lv ${L + 1}</span><small>${money(cost)}</small>`;
    if (up._h !== html) up.innerHTML = up._h = html;
    up.disabled = max || !inside || me.cash < cost;
    setText(hint, max ? '' : !inside ? 'Go to your garden to upgrade.' : me.cash < cost ? `Save up ${money(cost - me.cash)} more.` : '');
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    drawGrid();
  }

  draw();
  let lastCash = me.cash;
  const offs = [
    bus.on('base:upgraded', ({ player }) => player === me && draw()),
    bus.on('base:style', ({ player }) => player === me && draw()),
    onStudioReady(() => draw()),
  ];
  const timer = setInterval(() => {
    // cash changes all the time: only the header and the button need it
    if (me.cash !== lastCash) {
      lastCash = me.cash;
      setText(cash, money(me.cash));
      const L = me.baseLevel;
      const cost = BASE.cost[L + 1];
      const inside = gardenContains(game.gardens[me.slot].L, me.pos.x, me.pos.z, 2);
      if (cost) {
        up.disabled = !inside || me.cash < cost;
        setText(hint, !inside ? 'Go to your garden to upgrade.' : me.cash < cost ? `Save up ${money(cost - me.cash)} more.` : '');
      }
    }
  }, 300);
  return {
    el,
    title: 'My Base',
    dispose() {
      clearInterval(timer);
      offs.forEach((o) => o());
    },
  };
}

const DECOR_NAME = Object.fromEntries(BASE_STYLES.decor.map((d) => [d.id, d.name]));
