// Quests + badges UI. OWNER: progress agent (docs/ONLINE.md "Progress").
//   openProgress(app, {tab: 'quests'|'badges'|'almanac'}) -> modal with Quests | Badges | Almanac tabs (the Badges
//   tab opens with the collections, e.g. the Family Four card; the Almanac is the Seed Almanac sticker book)
//   mountQuestChip(app, hudRoot, {tl, tr, top, bottom}) -> {update(dt), dispose()}: compact HUD quest tracker
//   installProgressUI(app) -> {toasts, dispose()}: styles + celebration toasts + the collection finale
//   (celebrate.js; called once by attachProgress)
// The data comes from app.progress (src/progress/tracker.js). Stars are spent in the Wardrobe.
import { bus } from '../core/events.js';
import { load, save } from '../core/save.js';
import { h, esc, money, noFocus, reducedMotion } from './dom.js';
import { avatarEl } from './avatars.js';
import { CHARACTER, RARITY, BIOMES } from '../config.js';
import { TIERS, TIER_ORDER, cashText, ALMANAC } from '../progress/catalog.js';
import { glyph, glyphSvg, glyphTint, medal, metalFor } from '../progress/art.js';
import { injectProgressStyles } from '../progress/styles.js';
import { createToasts } from '../progress/toasts.js';
import { celebrateCollection } from '../progress/celebrate.js';
import { plantIcon } from '../social/plantIcon.js';
import { HAT_BY_ID } from '../characters/cosmetics.js';

let toasts = null; // created by installProgressUI; the HUD chip lends it the HUD's top column
let openPanel = null; // {modal, setTab}

const RING_C = 2 * Math.PI * 15;
const starChip = (n) => `<span class="pg-chipv">${glyph('star')}+${n | 0}</span>`;
const cashChip = (n) => `<span class="pg-chipv cash">+${esc(cashText(n))}</span>`;
const fmtNum = (v, isMoney) => (isMoney ? cashText(v) : String(Math.floor(v)));
const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));

function hoursLeft(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  const hh = Math.floor(m / 60);
  return hh ? `${hh}h ${m % 60}m` : `${m}m`;
}

function dateText(ms) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// HUD buttons act on the pointer (a second finger never gets a synthetic click while the thumb is on the
// joystick); keyboard activation still works through click with detail 0. Same pattern as ui/hud.js.
function onPress(el, fn) {
  let armed = null;
  let firedAt = -1e9; // the click that trails a press can also report detail 0: it must not fire again
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    armed = e.pointerId;
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== armed) return;
    armed = null;
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) {
      firedAt = performance.now();
      fn(e);
    }
  });
  el.addEventListener('pointercancel', () => (armed = null));
  el.addEventListener('click', (e) => {
    if (e.detail === 0 && performance.now() - firedAt > 600) fn(e);
  });
}

const sound = (app, name, opts) => {
  try {
    app.audio?.play?.(name, opts);
  } catch {
    /* optional */
  }
};

// ------------------------------------------------------------------ install (toasts)

export function installProgressUI(app) {
  injectProgressStyles();
  toasts = createToasts(app, { open: (tab) => openProgress(app, { tab }) });
  const offCel = bus.on('collection:complete', (e) => celebrateCollection(app, e));
  return {
    toasts,
    dispose() {
      offCel();
      toasts?.dispose();
      toasts = null;
    },
  };
}

// ------------------------------------------------------------------ the panel

export function openProgress(app, { tab = 'quests' } = {}) {
  injectProgressStyles();
  const tr = app.progress;
  if (!tr?.quests || !app.menus?.openModal) return null;
  if (openPanel) {
    openPanel.setTab(tab);
    return openPanel.modal;
  }
  const inGame = app.state === 'playing';
  const hadInput = app.input?.enabled;
  if (inGame) {
    // the game keeps running (it may be online), but the player stands still while the panel is open
    if (app.input) {
      app.input.enabled = false;
      app.input.reset?.();
    }
    app.touch?.setVisible?.(false);
  }
  almStripX = -1;
  const panel = buildPanel(app, tr, tab);
  let modal = null;
  panel.el.appendChild(app.menus.doneRow(() => modal?.close()));
  modal = app.menus.openModal(panel.el, { cls: 'pg-modal', label: 'Quests and badges' });
  modal.dispose = () => {
    panel.dispose();
    openPanel = null;
    if (inGame) {
      if (app.input) app.input.enabled = hadInput !== false;
      if (app.state === 'playing') app.touch?.setVisible?.(true);
    }
  };
  openPanel = { modal, setTab: panel.setTab };
  return modal;
}

const TABS = ['quests', 'badges', 'almanac'];
const tabOf = (t) => (TABS.includes(t) ? t : 'quests');
const FINISH_NAME = { normal: 'Normal', gold: 'Gold', diamond: 'Diamond', rainbow: 'Rainbow' };
const SIZE_NAME = { big: 'Big', giant: 'Giant', titan: 'Titan' };
let almPage = null; // the Almanac page last looked at (this session)
let almStripX = -1; // how far the page strip is scrolled while the panel is open (-1: show the open page)

function buildPanel(app, tr, startTab) {
  let tab = tabOf(startTab);
  const starsV = h('span');
  const starsEl = h('div', { class: 'pg-stars', title: 'Stars: spend them in the Wardrobe', html: glyph('star') }, starsV);
  const head = h('div', { class: 'pg-head' },
    h('span', { class: 'pg-hic', html: glyph('trophy') }),
    h('div', { class: 'pg-titles' }, h('h2', { text: 'Quests & Badges' }), h('span', { class: 'pg-sub', text: 'Earn stars, then spend them in the Wardrobe!' })),
    starsEl);
  const qDot = h('span', { class: 'pg-dot', hidden: true });
  const bCount = h('em');
  const mkTab = (id, icon, label, extra) => h('button', {
    class: 'seg-b', type: 'button', role: 'tab', 'data-tab': id,
    onclick: () => {
      app.menus?.click?.();
      setTab(id);
    },
  }, h('span', { html: glyph(icon) }), h('span', { text: label }), extra);
  const aCount = h('em');
  const tabQ = mkTab('quests', 'scroll', 'Quests', qDot);
  const tabB = mkTab('badges', 'trophy', 'Badges', bCount);
  const tabA = mkTab('almanac', 'almanac', 'Almanac', aCount);
  const tabs = h('div', { class: 'seg pg-tabs', role: 'tablist', 'aria-label': 'Quests, badges or the Seed Almanac' }, tabQ, tabB, tabA);
  const pane = h('div', { class: 'pg-pane', role: 'tabpanel' });
  const el = h('div', { class: 'pg' }, head, tabs, pane);
  let shownStars = tr.stars;
  let resetEl = null;

  function paintHead() {
    starsV.textContent = String(shownStars);
    const qs = tr.quests();
    const claimable = qs.filter((q) => q.done && !q.claimed).length + (tr.bonus().ready ? 1 : 0);
    qDot.hidden = !claimable;
    qDot.textContent = String(claimable);
    const st = tr.bests();
    bCount.textContent = `${st.badges}/${st.totalBadges}`;
    const alm = tr.almanac?.() || [];
    aCount.textContent = `${alm.reduce((n, pg) => n + pg.stickers, 0)}/${alm.reduce((n, pg) => n + pg.total, 0)}`;
    for (const b of [tabQ, tabB, tabA]) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
  }

  // stars count up when they arrive
  let countT = 0;
  function countTo(v) {
    clearInterval(countT);
    if (reducedMotion() || v <= shownStars) {
      shownStars = v;
      starsV.textContent = String(v);
      return;
    }
    const from = shownStars;
    const t0 = performance.now();
    countT = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 700);
      shownStars = Math.round(from + (v - from) * k);
      starsV.textContent = String(shownStars);
      if (k >= 1) clearInterval(countT);
    }, 30);
    starsEl.classList.remove('bump');
    void starsEl.offsetWidth;
    starsEl.classList.add('bump');
  }

  // little stars fly from the button to the balance
  function fly(fromEl, n = 6) {
    if (reducedMotion() || !fromEl?.getBoundingClientRect) return;
    const a = fromEl.getBoundingClientRect();
    const b = starsEl.getBoundingClientRect();
    const host = app.root || document.body;
    for (let i = 0; i < n; i++) {
      const s = h('span', { class: 'pg-fly', html: glyph('star') });
      const x0 = a.left + a.width / 2 - 11 + (Math.random() - 0.5) * a.width * 0.6;
      const y0 = a.top + a.height / 2 - 11;
      s.style.left = x0 + 'px';
      s.style.top = y0 + 'px';
      s.style.transitionDelay = (i * 0.05).toFixed(2) + 's';
      host.appendChild(s);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        s.style.transform = `translate(${(b.left + 14 - x0).toFixed(0)}px,${(b.top + b.height / 2 - 11 - y0).toFixed(0)}px) scale(.8)`;
        s.style.opacity = '.4';
      }));
      setTimeout(() => s.remove(), 950 + i * 50);
    }
  }

  function bar(progress, target, isMoney) {
    return h('div', { class: 'pg-bar' },
      h('i', { style: `transform:scaleX(${clamp01(progress / target).toFixed(3)})` }),
      h('b', { text: `${fmtNum(progress, isMoney)} / ${fmtNum(target, isMoney)}` }));
  }

  function questCard(q) {
    const icon = h('span', { class: 'pg-qic', html: glyph(q.icon) });
    if (typeof q.p === 'string' && CHARACTER[q.p]) icon.appendChild(avatarEl(q.p, 'pg-ava'));
    let act;
    if (q.claimed) act = h('span', { class: 'pg-claimed', html: `${glyph('check')}<span>Claimed</span>` });
    else if (q.done) {
      act = app.menus.btn(app.menus.iconLabel(glyph('star'), 'Claim'), 'btn-green btn-sm', (e) => {
        const r = tr.claim(q.index);
        if (!r) return;
        sound(app, 'coins', { amount: Math.max(50, r.cash), important: true });
        fly(e.currentTarget || act);
        countTo(tr.stars);
      }, { 'data-autofocus': '' });
    } else act = null;
    const swap = !q.done && tr.canSwap(q.index)
      ? h('button', { class: 'pg-swap', type: 'button', text: 'Swap quest', title: 'Swap this quest for another one (once a day)', onclick: () => {
        app.menus?.click?.();
        tr.swap(q.index);
      } })
      : null;
    return h('div', { class: `pg-q t-${q.tier}${q.done ? ' done' : ''}${q.claimed ? ' claimed' : ''}` },
      h('span', { class: 'pg-tier', text: TIERS[q.tier]?.name || 'Quest' }),
      icon,
      h('div', { class: 'pg-qmid' },
        h('div', { class: 'pg-qtext', text: q.text }),
        bar(q.progress, q.target, q.money),
        h('div', { class: 'pg-rew', html: starChip(q.stars) + (q.cash ? cashChip(q.cash) : '') })),
      act || swap ? h('div', { class: 'pg-qact' }, act, swap) : null);
  }

  function chestCard() {
    const b = tr.bonus();
    const pips = h('span', { class: 'pg-pips', 'aria-label': `${b.count} of 3 quests claimed` }, [0, 1, 2].map((i) => h('i', { class: i < b.count ? 'on' : '' })));
    const right = b.ready
      ? app.menus.btn(app.menus.iconLabel(glyph('chest'), 'Open'), 'btn-gold btn-sm', (e) => {
        const r = tr.claimBonus();
        if (!r) return;
        sound(app, 'confetti', { important: true, vol: 0.8 });
        fly(e.currentTarget, 10);
        countTo(tr.stars);
      })
      : h('span', { class: 'pg-rew', html: b.claimed ? glyph('check') : starChip(b.stars) + cashChip(b.cash) });
    if (b.claimed) right.style.width = '28px';
    return h('div', { class: `pg-chest${b.ready ? ' ready' : ''}${b.claimed ? ' opened' : ''}` },
      h('span', { class: 'pg-chest-ic', html: glyph('chest') }),
      h('div', { class: 'pg-chest-copy' },
        h('b', { text: b.claimed ? 'Daily Chest opened!' : 'Daily Chest' }),
        h('span', { text: b.claimed ? 'New quests tomorrow. See you then!' : b.ready ? 'All three quests done. Open it!' : 'Claim all three quests to open it.' }),
        b.claimed ? null : pips),
      right);
  }

  function questsPane() {
    const qs = tr.quests();
    const st = tr.bests();
    resetEl = h('span', { class: 'pg-pill', html: `${glyph('timer')}<span>New quests in ${hoursLeft(tr.resetsIn())}</span>` });
    const meta = h('div', { class: 'pg-meta' },
      st.streak > 0 ? h('span', { class: 'pg-pill hot', html: `${glyph('flame')}<span>${st.streak}-day streak</span>` }) : null,
      resetEl);
    const note = st.bank > 0
      ? h('p', { class: 'pg-note', html: `<b>${esc(cashText(st.bank))}</b> of quest cash is waiting for your next Endless game.` })
      : h('p', { class: 'pg-note', text: 'Quest cash goes into your Endless garden. Spend stars in the Wardrobe.' });
    return [h('div', { class: 'pg-qtop' }, h('h3', { text: 'Daily Quests' }), meta),
      h('div', { class: 'pg-qlist' }, qs.map(questCard)), chestCard(), note];
  }

  function badgeCard(f, now) {
    const earned = f.earned >= 0;
    const cur = f.current;
    const next = f.next;
    const metal = earned ? metalFor(f.earned, f.tiers.length) : 'locked';
    const name = earned ? cur.name : f.tiers[0].name;
    const med = h('span', { html: medal(f.icon, metal) }).firstChild;
    if (!earned) med.appendChild(h('span', { class: 'pg-blk', html: glyph('lock') }));
    const pips = f.tiers.length > 1 ? h('span', { class: 'pg-tpips', 'aria-hidden': 'true' }, f.tiers.map((t) => h('i', { class: t.earnedAt ? 'on' : '' }))) : null;
    const fresh = earned && now - cur.earnedAt < 90000;
    return h('div', { class: `pg-b${earned ? ' earned' : ' locked'}${f.maxed ? ' maxed' : ''}${fresh ? ' fresh' : ''}`, role: 'listitem', 'aria-label': `${name}${earned ? ', earned' : ', locked'}` },
      med,
      h('span', { class: 'pg-bname', text: name }),
      h('span', { class: 'pg-bhow', text: next ? (earned ? 'Next: ' : '') + next.how : 'Complete!' }),
      next ? bar(Math.min(f.value, next.goal), next.goal, f.money) : null,
      h('span', { class: 'pg-bfoot', html: (next ? starChip(next.stars) : '') + (earned ? `<span class="pg-date">Earned ${esc(dateText(cur.earnedAt))}</span>` : '') }, pips));
  }

  // ---------------------------------------------------------------- collections (Family Four)

  // Four slots (plant + the family member's face; a dark "?" until you've had it), n/4 and the rewards.
  function collectionCard(c) {
    const hat = HAT_BY_ID[c.hat];
    const slots = c.items.map((it) => {
      const who = CHARACTER[it.family];
      return h('div', { class: `pg-col-slot${it.has ? ' has' : ''}`, style: `--c:${who?.color || '#ffd23f'}`, title: it.has ? it.name : `${it.name}: not yet!`, role: 'listitem', 'aria-label': `${it.name}${it.has ? ', collected' : ', not collected yet'}` },
        h('span', { class: 'pg-col-pl', html: plantIcon(it.id) }, it.has ? null : h('b', { text: '?' })),
        it.family ? avatarEl(it.family, 'pg-col-ava') : null,
        h('span', { class: 'pg-col-n', text: who?.name || it.name }));
    });
    const rew = c.done
      ? `<span class="pg-chipv done">${glyph('check')}Complete!</span>${c.earnedAt ? `<span class="pg-date">${esc(dateText(c.earnedAt))}</span>` : ''}`
      : starChip(c.stars) + (c.cash ? cashChip(c.cash) : '') + (hat ? `<span class="pg-chipv hat">${glyph('crown4')}${esc(hat.name)}</span>` : '');
    return h('div', { class: `pg-col${c.done ? ' done' : ''}`, 'data-col': c.id },
      h('div', { class: 'pg-col-head' },
        h('span', { class: 'pg-col-ic', html: glyph(c.icon) }),
        h('div', { class: 'pg-col-t' }, h('b', { text: c.name }), h('span', { text: c.done ? `You have them all! The ${hat?.name || 'reward'} is yours.` : `${c.how} (grab, plant, steal or get one as a gift).` })),
        h('span', { class: 'pg-pill pg-col-n4', text: `${c.count}/${c.total}` })),
      h('div', { class: 'pg-col-list', role: 'list' }, slots),
      h('div', { class: 'pg-rew pg-col-rew', html: rew }));
  }

  function badgesPane() {
    const st = tr.bests();
    const best = (label, value, cls = '') => h('div', { class: 'pg-best' }, h('b', { class: cls, text: value }), h('span', { text: label }));
    const bests = h('div', { class: 'pg-bests' },
      best('Badges', `${st.badges}/${st.totalBadges}`),
      best('Best net worth', money(st.netWorth), 'cash'),
      best('Showdown wins', String(st.showdownWins)),
      best('Plants stolen', String(st.steals)),
      best('Best Showdown', money(st.showdownBest), 'cash'),
      best('Best streak', `${st.streakBest} day${st.streakBest === 1 ? '' : 's'}`));
    const now = Date.now();
    const list = tr.badges();
    const cols = (tr.collections?.() || []).map(collectionCard);
    return [bests, ...cols, h('div', { class: 'pg-grid', role: 'list' }, list.map((f) => badgeCard(f, now)))];
  }

  // ---------------------------------------------------------------- the Seed Almanac

  // Page tabs (they scroll sideways on phones) and the open page; only the open page is built.
  function almanacPane() {
    const pages = tr.almanac();
    if (!pages.find((pg) => pg.id === almPage)) almPage = (pages.find((pg) => pg.stickers < pg.total) || pages[0])?.id || null;
    const stickers = pages.reduce((n, pg) => n + pg.stickers, 0);
    const total = pages.reduce((n, pg) => n + pg.total, 0);
    const mastered = pages.reduce((n, pg) => n + pg.mastered, 0);
    const top = h('div', { class: 'pg-qtop' }, h('h3', { text: 'Seed Almanac' }),
      h('div', { class: 'pg-meta' },
        h('span', { class: 'pg-pill', html: `${glyph('almanac')}<span>${stickers}/${total} stickers</span>` }),
        mastered ? h('span', { class: 'pg-pill hot', html: `${glyph('star')}<span>${mastered} mastered</span>` }) : null));
    const body = h('div', { class: 'pg-alm-page' });
    const strip = h('div', { class: 'pg-alm-tabs', role: 'tablist', 'aria-label': 'Almanac pages' }, pages.map((pg) => {
      const b = h('button', {
        class: `pg-alm-tab${pg.id === almPage ? ' on' : ''}${pg.full ? ' full' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(pg.id === almPage),
        style: `--rc:${rarityColor(pg.rarity)}`, 'data-page': pg.id,
        onclick: () => {
          if (almPage === pg.id) return;
          app.menus?.click?.();
          almPage = pg.id;
          for (const x of strip.children) {
            const on = x.dataset.page === pg.id;
            x.classList.toggle('on', on);
            x.setAttribute('aria-selected', String(on));
          }
          fillPage(body, tr.almanac().find((x) => x.id === pg.id));
        },
      }, h('i'), h('span', { text: pg.name }), h('em', { text: pg.full ? '' : `${pg.stickers}/${pg.total}`, html: pg.full ? glyph('check') : null }));
      return b;
    }));
    fillPage(body, pages.find((pg) => pg.id === almPage));
    // a repaint keeps the strip where it was; the first time it shows the open page
    strip.addEventListener('scroll', () => (almStripX = strip.scrollLeft), { passive: true });
    requestAnimationFrame(() => {
      if (almStripX >= 0) strip.scrollLeft = almStripX;
      else {
        const on = strip.querySelector('.on');
        if (on) strip.scrollLeft = Math.max(0, on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
      }
    });
    const note = h('p', { class: 'pg-note', text: `Grab, plant or steal a plant to get its sticker. New plant: +${ALMANAC.firstStars} star. All 4 finishes: +${ALMANAC.masterStars} stars!` });
    return [top, strip, body, note];
  }

  function rarityColor(r) {
    const c = RARITY[r]?.color || '#ffd23f';
    return r === 'secret' ? '#ff66d9' : c;
  }

  function fillPage(body, pg) {
    body.textContent = '';
    if (!pg) return;
    body.style.setProperty('--rc', rarityColor(pg.rarity));
    const status = pg.badge
      ? pg.earnedAt
        ? `<span class="pg-chipv done">${glyph('check')}Page complete!</span><span class="pg-date">${esc(dateText(pg.earnedAt))}</span>`
        : `${starChip(pg.stars)}<span>Fill the page: every plant in all 4 finishes</span>`
      : `<span>Secret seeds hide on the Seed Road from ${esc(BIOMES.find((b) => b.secret)?.name || 'the far worlds')} on.</span>`;
    body.append(h('div', { class: 'pg-alm-head' },
      h('div', { class: 'pg-alm-ht' }, h('b', { text: pg.name }), h('span', { text: `${RARITY[pg.rarity]?.name || ''} plants · ${pg.mastered}/${pg.plants.length} mastered` })),
      bar(pg.stickers, pg.total),
      h('div', { class: 'pg-rew pg-alm-rew', html: status })));
    if (!pg.badge) for (const c of tr.collections?.() || []) if (c.items.some((it) => pg.plants.some((x) => x.id === it.id))) body.append(collectionCard(c));
    body.append(h('div', { class: 'pg-alm-grid', role: 'list' }, pg.plants.map(plantCard)));
  }

  function plantCard(pl) {
    const stickers = pl.finishes.map((f) => h('span', { class: `pg-stk f-${f.id}${f.has ? '' : ' off'}`, title: `${FINISH_NAME[f.id]}${f.has ? '' : ': not yet'}` },
      h('span', { class: 'pg-stk-art', html: plantIcon(pl.id, f.id) }, f.has ? null : h('b', { text: '?' })),
      h('span', { class: 'pg-stk-l', text: FINISH_NAME[f.id] })));
    const got = pl.finishes.filter((f) => f.has).length;
    return h('div', { class: `pg-pl${pl.mastered ? ' mastered' : ''}${pl.bits ? '' : ' unknown'}`, role: 'listitem', 'aria-label': `${pl.name}: ${got} of 4 finishes${pl.mastered ? ', mastered' : ''}` },
      h('div', { class: 'pg-pl-top' },
        h('b', { class: 'pg-pl-n', text: pl.name }),
        pl.mastered ? h('span', { class: 'pg-pl-m', html: `${glyph('star')}<span>Mastered</span>` }) : h('span', { class: 'pg-pl-c', text: `${got}/4` })),
      h('div', { class: 'pg-stks' }, stickers),
      pl.sizes.length ? h('div', { class: 'pg-pl-sz' }, pl.sizes.map((z) => h('span', { class: 'sz-' + z, text: SIZE_NAME[z] || z }))) : null);
  }

  function render() {
    paintHead();
    pane.textContent = '';
    pane.append(...(tab === 'badges' ? badgesPane() : tab === 'almanac' ? almanacPane() : questsPane()));
  }

  function setTab(t) {
    const next = tabOf(t);
    if (next === tab && pane.childNodes.length) return;
    tab = next;
    pane.classList.remove('pg-pane');
    void pane.offsetWidth;
    pane.classList.add('pg-pane');
    render();
  }

  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = 0;
      render();
    }, 60);
  };
  const offs = ['progress:changed', 'badge:earned', 'quest:claimed', 'quest:bonus', 'almanac:sticker'].map((n) => bus.on(n, schedule));
  offs.push(bus.on('stars:changed', ({ stars }) => countTo(stars)));
  const timer = setInterval(() => {
    if (resetEl?.isConnected) resetEl.lastChild.textContent = `New quests in ${hoursLeft(tr.resetsIn())}`;
  }, 15000);
  render();

  return {
    el,
    setTab,
    dispose() {
      offs.forEach((f) => f());
      clearInterval(timer);
      clearInterval(countT);
      clearTimeout(pending);
    },
  };
}

// ------------------------------------------------------------------ HUD chip

const TIER_RANK = Object.fromEntries(TIER_ORDER.map((t, i) => [t, i]));

export function mountQuestChip(app, hudRoot, slots = {}) {
  injectProgressStyles();
  const tr = app.progress;
  if (!tr?.quests || !app.human) return { update() {}, dispose() {} };
  // celebration toasts use the HUD's top column while this HUD is up
  const layer = h('div', { class: 'pg-toasts', role: 'status', 'aria-live': 'polite' });
  (slots.top || hudRoot).appendChild(layer);
  toasts?.setHudLayer(layer);

  const ring = h('span', { html: `<svg class="pg-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${RING_C.toFixed(1)}"/></svg>` }).firstChild;
  const fg = ring.querySelector('.fg');
  const icon = h('span', { class: 'pg-g' });
  const dot = h('span', { class: 'pg-chip-dot' });
  const k = h('span', { class: 'pg-chip-k' });
  const t = h('span', { class: 'pg-chip-t' });
  const n = h('span', { class: 'pg-chip-n' });
  const barI = h('i');
  const icWrap = h('span', { class: 'pg-chip-ic' }, ring, icon, dot);
  const main = noFocus(h('button', { class: 'pg-chip-main', type: 'button', 'aria-label': 'Daily quests' },
    icWrap, h('span', { class: 'pg-chip-copy' }, k, t), n));
  const tg = noFocus(h('button', { class: 'pg-chip-tg', type: 'button', 'aria-label': load('ui:questChip:collapsed', false) ? 'Show quest details' : 'Hide quest details', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
  const el = h('div', { class: 'pg-chip' }, main, tg, h('span', { class: 'pg-chip-bar' }, barI));
  const parent = slots.tl || hudRoot;
  parent.appendChild(el);

  let collapsed = !!load('ui:questChip:collapsed', false);
  let mode = 'active';
  let lay = null; // '' desktop, 'h' landscape phone, 't' portrait phone (see place())
  const chipClass = () => `pg-chip ${mode === 'badge' ? 'alldone' : mode}${collapsed && !lay ? ' collapsed' : ''}${lay ? ' lay-' + lay : ''}`;
  onPress(main, () => {
    sound(app, 'click');
    openProgress(app, { tab: mode === 'badge' ? 'badges' : 'quests' });
  });
  onPress(tg, () => {
    sound(app, 'click');
    collapsed = !collapsed;
    save('ui:questChip:collapsed', collapsed);
    el.className = chipClass();
    tg.setAttribute('aria-label', collapsed ? 'Show quest details' : 'Hide quest details');
  });

  let key = '';
  let lastIcon = '';
  function paint() {
    const qs = tr.quests();
    const claimable = qs.filter((q) => q.done && !q.claimed);
    const active = qs.filter((q) => !q.done).sort((a, b) => b.frac - a.frac || TIER_RANK[a.tier] - TIER_RANK[b.tier]);
    const doneN = qs.filter((q) => q.done).length;
    const bonus = tr.bonus();
    let ic, kick, text, num, frac;
    if (claimable.length) {
      const q = claimable[0];
      mode = 'claim';
      ic = q.icon;
      kick = claimable.length > 1 ? `${claimable.length} quests complete!` : 'Quest complete!';
      text = q.text;
      num = 'Claim!';
      frac = 1;
    } else if (bonus.ready) {
      mode = 'chest';
      ic = 'chest';
      kick = 'Daily chest ready!';
      text = 'Open it for bonus stars';
      num = 'Open!';
      frac = 1;
    } else if (active.length) {
      const q = active[0];
      mode = 'active';
      ic = q.icon;
      kick = `Daily quests · ${doneN}/3`;
      text = q.text;
      num = q.money ? `${Math.floor(q.frac * 100)}%` : `${q.progress}/${q.target}`;
      frac = q.frac;
    } else {
      // all done for today: point at the closest badge instead
      const next = tr.badges().filter((b) => b.next && b.value > 0).sort((a, b) => b.value / b.next.goal - a.value / a.next.goal)[0];
      if (next) {
        mode = 'badge';
        ic = next.icon;
        kick = 'Next badge';
        text = `${next.next.name}: ${next.next.how}`;
        frac = clamp01(next.value / next.next.goal);
        num = next.money ? `${Math.floor(frac * 100)}%` : `${Math.floor(next.value)}/${next.next.goal}`;
      } else {
        mode = 'alldone';
        ic = 'check';
        kick = 'All quests done!';
        text = `New quests in ${hoursLeft(tr.resetsIn())}`;
        num = '';
        frac = 1;
      }
    }
    const nk = [mode, ic, kick, text, num, frac.toFixed(3)].join('|');
    if (nk === key) return;
    key = nk;
    el.className = chipClass();
    if (ic !== lastIcon) {
      icon.innerHTML = glyphSvg(ic);
      icon.style.color = glyphTint(ic);
      lastIcon = ic;
    }
    k.textContent = kick;
    t.textContent = text;
    n.textContent = num;
    n.hidden = !num;
    dot.textContent = mode === 'claim' ? String(claimable.length) : '!';
    fg.style.strokeDashoffset = (RING_C * (1 - clamp01(frac))).toFixed(1);
    barI.style.transform = `scaleX(${clamp01(frac).toFixed(3)})`;
    main.setAttribute('aria-label', `${kick} ${text} ${num}`.trim());
    fitRow();
  }

  // Where the chip lives depends on the screen (the HUD's `quest` anchor is the home on big screens):
  //   ''  desktop/tablet: the quest slot, in the left column under the next-goal chip
  //   'h' landscape phones: a compact pill in the Pause/Mute row (the column below is full: stats, goal, meter)
  //   't' portrait phones: a compact pill in the top row beside Pause/Mute, measured so it never runs under the
  //       family board (the HUD keeps that row for "Pause + Mute + the daily quest tracker")
  // It only moves when the layout changes; the top-row measurements refresh twice a second.
  const mq = (q) => {
    try {
      return matchMedia(q);
    } catch {
      return null;
    }
  };
  const mqT = mq('(max-width:640px) and (orientation:portrait)');
  const mqH = mq('(max-height:500px) and (orientation:landscape)');
  const home = slots.quest || parent;
  const btnRow = () => slots.tl?.querySelector(':scope > .hud-btns') || null;
  function place() {
    const next = mqT?.matches && slots.tl ? 't' : mqH?.matches && btnRow() ? 'h' : '';
    if (next !== lay || !el.isConnected) {
      lay = next;
      if (lay === 't') slots.tl.appendChild(el);
      else if (lay === 'h') btnRow().after(el);
      else home.appendChild(el);
      el.className = chipClass();
    }
    measure();
  }
  // compact layouts: stay in the row; when the number doesn't fit, the ring (and the ready dot) tell the story
  function measure() {
    if (lay === 't') {
      const btns = btnRow();
      const left = btns ? btns.offsetLeft + btns.offsetWidth + 8 : 96;
      const tlBox = slots.tl.getBoundingClientRect();
      const board = slots.tr?.getBoundingClientRect();
      const right = board && board.width ? board.left - 8 : innerWidth - 180;
      el.style.setProperty('--pg-left', left + 'px');
      el.style.setProperty('--pg-max', Math.max(40, Math.floor(right - (tlBox.left + left))) + 'px');
    } else {
      el.style.removeProperty('--pg-left');
      el.style.removeProperty('--pg-max');
    }
    fitRow();
  }
  function fitRow() {
    el.classList.remove('icon-only');
    if (lay === 't') {
      const max = parseFloat(el.style.getPropertyValue('--pg-max')) || 999;
      if (el.scrollWidth > max + 0.5) el.classList.add('icon-only');
    } else if (lay === 'h') {
      const prev = el.previousElementSibling;
      const avail = slots.tl.clientWidth - (prev ? prev.offsetLeft + prev.offsetWidth + 7 : 0);
      if (el.offsetWidth > avail + 0.5) el.classList.add('icon-only');
    }
  }

  let dirty = true;
  // transient animations live on the icon, so repaints (which rewrite the chip's classes) never cut them short
  const pulse = (cls) => {
    icWrap.classList.remove('bump', 'pop');
    void icWrap.offsetWidth;
    icWrap.classList.add(cls);
  };
  const offs = [
    bus.on('progress:changed', () => (dirty = true)),
    bus.on('quest:progress', () => {
      dirty = true;
      pulse('bump');
    }),
    bus.on('quest:done', () => {
      dirty = true;
      pulse('pop');
    }),
    bus.on('badge:earned', () => (dirty = true)),
  ];

  // Tiny screens: a toast pushed down by the alert banners must never sit on the prompt/carry pills (the
  // HUD's squeeze logic only knows its own banners). Checked in the same frame a toast appears; on a clash the
  // toast moves to the top overlay until the pills are gone.
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom + 4 && a.bottom > b.top - 4;
  let topMode = false;
  function unclutter() {
    const pills = slots.bottom ? [...slots.bottom.querySelectorAll('.prompt.show, .carry.show')].filter((p) => p.offsetParent) : [];
    if (!pills.length) {
      if (topMode) toasts?.setPreferTop((topMode = false));
      return;
    }
    if (topMode || !layer.firstChild) return;
    const tb = layer.getBoundingClientRect();
    if (pills.some((p) => hit(tb, p.getBoundingClientRect()))) toasts?.setPreferTop((topMode = true));
  }

  let acc = 1;
  let placeAcc = 0;
  let clashAcc = 0;
  place();
  paint();
  return {
    update(dt = 0.016) {
      acc += dt;
      placeAcc += dt;
      clashAcc += dt;
      if (layer.firstChild || (topMode && clashAcc > 0.25)) {
        clashAcc = 0;
        unclutter();
      }
      if ((dirty && acc > 0.15) || acc > 5) {
        acc = 0;
        dirty = false;
        paint();
      }
      if (placeAcc > 0.5) {
        placeAcc = 0;
        place();
      }
    },
    dispose() {
      offs.forEach((f) => f());
      if (toasts) toasts.setHudLayer(null);
      el.remove();
      layer.remove();
    },
  };
}
