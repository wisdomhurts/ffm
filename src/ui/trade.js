// Gifting + trading UI. OWNER: social agent (docs/ONLINE.md).
// mountSocial(app, hudRoot, {tl, tr, top, bottom}) -> {update(dt, t), dispose()}
//
// Only shows up when another person (not a bot) is in the game:
// * a "Trade / Gift" chip when one stands within 10 studs (keys Y = trade, U = gift)
// * an invite card when someone asks you (Y = accept, N = no thanks), with a timer
// * the gift picker: pick one of your planted plants, confirm, it lands in their garden
// * the trade window: both offers side by side (plants with rarity colours, mutations and income, plus
//   cash), Ready toggles, a 3 s countdown, and anti-scam cues: every change un-readies both sides,
//   flashes what changed and locks Ready for a moment.
// Everything goes through app.act (so it works as an online client) and the trade:* / gift events.
import { bus } from '../core/events.js';
import { PLANT, MUTATIONS } from '../config.js';
import { rarityColor } from '../view/gameView.js';
import { h, noFocus, esc, money, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { avatarEl } from './avatars.js';
import { SOCIAL_ICONS } from '../social/icons.js';
import { plantIcon } from '../social/plantIcon.js';
import { injectSocialStyles } from '../social/styles.js';
import { createTradeManager, TRADE } from '../social/trades.js';
import { socialUi } from '../social/uiState.js';

const NEAR = 10; // studs: the Trade / Gift chip shows for people this close
const CASH_STEPS = [0];
for (let k = 1; k <= 1e15; k *= 10) CASH_STEPS.push(10 * k, 25 * k, 50 * k);
// a player's name as a coloured pill (own class: works inside HUD toasts and our panels alike)
const who = (p) => (p ? `<b class="soc-who" style="--c:${p.char.color}">${esc(p.name)}</b>` : 'Someone');
const slotOf = (x) => (typeof x === 'number' ? x : x?.slot ?? -1);
const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

// HUD buttons act on the pointer itself: browsers never synthesise a click for a second finger while the
// thumb is on the joystick (same pattern as ui/hud.js). Keyboard activation still works.
function onTap(el, fn) {
  let armed = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    armed = e.pointerId;
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== armed) return;
    armed = null;
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) fn(e);
  });
  el.addEventListener('pointercancel', () => (armed = null));
  el.addEventListener('click', (e) => e.detail === 0 && fn(e));
  return el;
}

/** A plant card. d = {speciesId, mutation}; o = {tag, cls, grown, busy} */
export function plantCard(d, o = {}) {
  const sp = PLANT[d?.speciesId];
  if (!sp) return h('span', { class: 'spc' });
  const mut = MUTATIONS[d.mutation] || MUTATIONS.normal;
  const tag = o.tag || 'div';
  const el = h(tag, {
    class: `spc r-${sp.rarity} ${o.cls || ''}`, style: `--rc:${rarityColor(sp.rarity)}`, type: tag === 'button' ? 'button' : null,
    title: `${mut.name ? mut.name + ' ' : ''}${sp.name}`, 'data-busy': o.busy || null,
  },
  h('span', { class: 'spc-ic', html: plantIcon(d.speciesId, mut.id) }),
  h('span', { class: `spc-mut mut mut-${mut.id}`, text: mut.name || '' }),
  h('span', { class: 'spc-name', text: sp.name }),
  h('span', { class: 'spc-inc', text: money(sp.income * mut.mult) + '/s' }),
  o.grown === false ? h('span', { class: 'spc-grow', text: 'Still growing' }) : null,
  h('span', { class: 'spc-tick', html: ICON.check }));
  if (o.busy) el.classList.add('busy');
  return el;
}

export function mountSocial(app, hudRoot, parts = {}) {
  const me = app.human;
  const game = app.game;
  if (!game || !me || !hudRoot) return { update() {}, dispose() {} };
  injectSocialStyles();
  // the host (or an offline game) runs the trades; main.js normally creates this at boot
  const ownManager = !app.trades;
  const trades = app.trades || (app.trades = createTradeManager(app));

  const player = (x) => game.players[slotOf(x)] || null;
  const isMe = (x) => slotOf(x) === me.slot;
  const people = () => game.players.filter((p) => p !== me && p.kind !== 'bot');
  const dist = (p) => Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
  const freeIn = (p) => game.gardens[p.slot].planters.filter((x) => x.unlocked && !x.plant).length;
  const toast = (html, kind = 'info', face = null) => app.hud?.alerts?.toast(html, kind, face ? { face, duration: 3400 } : { icon: SOCIAL_ICONS.trade, duration: 3400 });
  const act = (...a) => app.act(...a);
  const plantName = (d) => {
    const m = MUTATIONS[d.mutation];
    return `<b class="pn" style="--rc:${rarityColor(PLANT[d.speciesId]?.rarity || 'common')}">${esc((m?.name ? m.name + ' ' : '') + (PLANT[d.speciesId]?.name || 'plant'))}</b>`;
  };

  // ---------------------------------------------------------------- dock: chip + invite
  const dock = h('div', { class: 'soc-dock' });
  if (parts.bottom) parts.bottom.prepend(dock);
  else hudRoot.appendChild(dock);

  let near = null; // the person the chip is for
  let outgoing = null; // {to, expiresAt} my open ask
  let invite = null; // {from, expiresAt, at}
  let chipKey = null; // what the chip shows now (null = repaint)
  let chipEl = null;
  let inviteEl = null;
  let inviteBar = null;
  let pulseUntil = 0;

  function renderChip() {
    const show = !!near && app.state === 'playing' && !socialUi.sheet && !T && !invite;
    const key = show ? `${near.slot}|${near.name}|${outgoing ? outgoing.to.slot : '-'}` : 'none';
    if (key === chipKey) return;
    chipKey = key;
    chipEl?.remove();
    chipEl = null;
    if (!show) return;
    const p = near;
    if (outgoing && outgoing.to === p) {
      chipEl = h('div', { class: 'soc-chip', role: 'status' }, avatarEl(p.faceKey, 'sc-ava'),
        h('span', { class: 'sc-wait', html: `Waiting for ${who(p)}...` }),
        onTap(noFocus(h('button', { class: 'btn btn-grey btn-sm sc-b', type: 'button' }, h('span', { text: 'Cancel' }))), () => {
          uiSound(app, 'click');
          act('tradeCancel');
          outgoing = null;
          chipKey = null;
          renderChip();
        }));
    } else {
      chipEl = h('div', { class: 'soc-chip' + (performance.now() < pulseUntil ? ' pulse' : ''), role: 'group', 'aria-label': `Trade or gift with ${p.name}` },
        avatarEl(p.faceKey, 'sc-ava'),
        h('span', { class: 'sc-name', style: `color:color-mix(in srgb,${p.char.color} 55%,#fff)` }, p.name, h('small', { text: 'is here!' })),
        onTap(noFocus(h('button', { class: 'btn btn-blue btn-sm sc-b', type: 'button' },
          h('span', { class: 'bi', html: SOCIAL_ICONS.trade }), h('span', { text: 'Trade' }), h('kbd', { text: 'Y' }))), () => requestTrade(p)),
        onTap(noFocus(h('button', { class: 'btn btn-gold btn-sm sc-b', type: 'button' },
          h('span', { class: 'bi', html: SOCIAL_ICONS.gift }), h('span', { text: 'Gift' }), h('kbd', { text: 'U' }))), () => openGift(p)));
    }
    dock.appendChild(chipEl);
  }

  function renderInvite() {
    inviteEl?.remove();
    inviteEl = inviteBar = null;
    if (!invite) return;
    const p = invite.from;
    inviteBar = h('i');
    inviteEl = h('div', { class: 'soc-invite', role: 'alertdialog', 'aria-label': `${p.name} wants to trade` },
      avatarEl(p.faceKey, 'si-ava'),
      h('div', { class: 'si-t', html: `${who(p)} wants to trade!<small>Swap plants and cash, fair and square.</small>` }),
      h('div', { class: 'si-btns' },
        onTap(noFocus(h('button', { class: 'btn btn-green si-b', type: 'button' }, h('span', { class: 'bi', html: ICON.check }), h('span', { text: 'Accept' }), h('kbd', { text: 'Y' }))), acceptInvite),
        onTap(noFocus(h('button', { class: 'btn btn-grey si-b', type: 'button' }, h('span', { text: 'No thanks' }), h('kbd', { text: 'N' }))), declineInvite)),
      h('div', { class: 'si-bar' }, inviteBar));
    dock.prepend(inviteEl);
  }

  function requestTrade(p) {
    if (!p || socialUi.sheet) return;
    uiSound(app, 'click');
    const r = act('tradeRequest', p.slot);
    if (r === false) toast(`Couldn't ask ${who(p)} right now.`, 'warn', p.faceKey);
  }

  function acceptInvite() {
    if (!invite) return;
    uiSound(app, 'click');
    act('tradeAccept', invite.from.slot);
    invite = null;
    renderInvite();
  }

  function declineInvite() {
    if (!invite) return;
    uiSound(app, 'click');
    act('tradeDecline', invite.from.slot);
    invite = null;
    renderInvite();
  }

  // ---------------------------------------------------------------- sheets
  let sheet = null; // {kind, layer, panel, other, dispose?}

  function openSheet(kind, other, icon, title, label) {
    closeSheet(true);
    const x = noFocus(h('button', { class: 'ss-x', type: 'button', 'aria-label': 'Close', html: ICON.close }));
    const head = h('div', { class: 'ss-head' },
      h('span', { class: 'ss-ic', html: icon }), h('span', { class: 'ss-title', text: title }),
      h('span', { class: 'ss-with' }, h('span', { text: kind === 'gift' ? 'to' : 'with' }), avatarEl(other.faceKey), h('b', { text: other.name })));
    const body = h('div', { class: 'ss-body' });
    const panel = h('div', { class: `ss-panel soc-${kind}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, x, head, body);
    const back = h('div', { class: 'ss-back' });
    const layer = h('div', { class: 'soc-sheet' }, back, panel);
    // the tap that opened this sheet ends with a click that would land on whatever is now under the
    // finger (a plant card!): swallow clicks for a moment
    const openedAt = Date.now();
    layer.addEventListener('click', (e) => {
      if (Date.now() - openedAt < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    hudRoot.appendChild(layer);
    sheet = { kind, layer, panel, body, other, x, back };
    socialUi.sheet = true;
    holdInput(true);
    setTimeout(() => panel.isConnected && panel.focus({ preventScroll: true }), 30);
    return sheet;
  }

  function closeSheet(silent = false) {
    if (!sheet) return;
    const s = sheet;
    sheet = null;
    socialUi.sheet = false;
    s.dispose?.();
    s.layer.classList.add('out');
    setTimeout(() => s.layer.remove(), silent ? 0 : 200);
    holdInput(false);
    chipKey = null;
  }

  // the player stays put while a sheet is open (like a shop); movement comes back when it closes
  function holdInput(on) {
    if (on) {
      app.input.enabled = false;
      app.input.reset();
      app.touch?.setVisible?.(false);
    } else if (app.state === 'playing') {
      app.input.enabled = true;
      app.input.reset();
      app.touch?.setVisible?.(true);
    }
  }

  // ---------------------------------------------------------------- gift picker
  function myPlants() {
    return game.gardens[me.slot].planters.filter((pl) => pl.plant).map((pl) => ({ index: pl.index, plant: pl.plant, busy: pl.stealer != null }));
  }
  const gardenSig = () => game.gardens[me.slot].planters.map((pl) => (pl.plant ? pl.plant.uid + (pl.stealer != null ? 's' : '') + (pl.plant.growLeft > 0 ? 'g' : '') : '-')).join(',');

  function openGift(to) {
    if (!to || T) return;
    uiSound(app, 'click');
    const s = openSheet('gift', to, SOCIAL_ICONS.gift, 'GIFT', `Give a plant to ${to.name}`);
    let chosen = null;
    let sig = '';
    s.x.onclick = () => (chosen != null ? back() : closeSheet());
    s.back.onclick = () => closeSheet();
    const back = () => {
      chosen = null;
      render();
    };
    const giftSig = () => gardenSig() + '|' + freeIn(to);
    function render() {
      sig = giftSig();
      s.body.textContent = '';
      const full = freeIn(to) === 0;
      if (chosen != null) {
        const pl = game.gardens[me.slot].planters[chosen];
        if (!pl?.plant) {
          chosen = null;
          return render();
        }
        const d = pl.plant;
        const give = h('button', { class: 'btn btn-green btn-lg', type: 'button', disabled: full || pl.stealer != null, onclick: () => {
          uiSound(app, 'click');
          const r = act('gift', to.slot, chosen);
          if (r === false) {
            toast(full ? `${who(to)}'s garden is full!` : 'That gift didn\'t work. Try again!', 'warn', to.faceKey);
            return;
          }
          closeSheet();
        } }, h('span', { class: 'bi', html: SOCIAL_ICONS.gift }), h('span', { text: 'Give it!' }));
        s.body.append(
          h('div', { class: 'sg-confirm' },
            plantCard(d, { grown: d.growLeft <= 0 }),
            h('div', null,
              h('div', { class: 'sg-q', html: `Give ${plantName(d)} to ${esc(to.name)}?` }),
              h('div', { class: 'sg-note' + (full ? ' bad' : ''), text: full ? `${to.name}'s garden is full! They need a free planter first.` : 'It moves to their garden right away. Gifts can\'t be taken back!' }))),
          h('div', { class: 'ss-actions' }, give, h('button', { class: 'btn btn-grey btn-lg', type: 'button', onclick: () => {
            uiSound(app, 'click');
            back();
          } }, h('span', { class: 'bi', html: ICON.back }), h('span', { text: 'Back' }))));
        return;
      }
      const list = myPlants();
      s.body.append(h('p', { class: 'ss-sub', html: full ? `<b>${esc(to.name)}'s garden is full!</b> They need a free planter before you can give them a plant.` : `Pick a plant to give <b>${esc(to.name)}</b>. It goes straight into their garden.` }));
      if (!list.length) {
        s.body.append(h('div', { class: 'ss-empty', html: '<b>No plants yet!</b>Grab a seed from the Seed Road and plant it first.' }));
        return;
      }
      s.body.append(h('div', { class: 'ss-grid' }, list.map(({ index, plant, busy }) => {
        const c = plantCard(plant, { tag: 'button', grown: plant.growLeft <= 0, busy: busy ? 'BEING STOLEN' : null });
        c.addEventListener('click', () => {
          if (busy) return;
          uiSound(app, 'click');
          chosen = index;
          render();
        });
        return c;
      })));
    }
    render();
    s.tick = () => {
      if (giftSig() !== sig) render();
      if (dist(to) > TRADE.keepRange || to.kind === 'bot') closeSheet();
    };
    s.escape = () => (chosen != null ? back() : closeSheet());
  }

  // ---------------------------------------------------------------- trade window
  let T = null; // the open trade (see openTrade)

  function openTrade(other) {
    const s = openSheet('trade', other, SOCIAL_ICONS.trade, 'TRADE', `Trade with ${other.name}`);
    T = {
      other, sheet: s, mine: { planters: [], cash: 0, plants: [] }, theirs: { planters: [], cash: 0, plants: [] }, readyMine: false, readyTheirs: false,
      countdownEndsAt: 0, lockUntil: 0, rev: 0, pending: null, sendTimer: 0, note: null, changedUntil: 0, done: null, sig: '',
    };
    s.x.onclick = () => cancelTrade();
    s.back.onclick = () => {}; // a stray tap outside must not cancel a trade
    s.escape = () => cancelTrade();
    // static layout
    const mySlots = h('div', { class: 'st-slots' });
    const theirSlots = h('div', { class: 'st-slots' });
    const cashIn = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Cash you give', maxlength: '12' });
    const minus = noFocus(h('button', { class: 'btn btn-grey st-step', type: 'button', 'aria-label': 'Less cash', text: '-' }));
    const plus = noFocus(h('button', { class: 'btn btn-grey st-step', type: 'button', 'aria-label': 'More cash', text: '+' }));
    const readyBtn = noFocus(h('button', { class: 'btn btn-blue st-ready', type: 'button' }));
    const theirCash = h('span', { class: 'st-cashv' });
    const theirState = h('div', { class: 'st-state' });
    const theirChanged = h('span', { class: 'st-changed', text: 'Changed!', hidden: '' });
    const mySide = h('section', { class: 'st-side me' },
      h('div', { class: 'st-h' }, h('span', { text: 'You give' })), mySlots,
      h('div', { class: 'st-cash' }, h('span', { class: 'st-coin', html: ICON.coin }), minus, cashIn, plus), readyBtn);
    const theirSide = h('section', { class: 'st-side them' },
      h('div', { class: 'st-h' }, avatarEl(other.faceKey), h('span', { text: `${other.name} gives` }), theirChanged), theirSlots,
      h('div', { class: 'st-cash' }, h('span', { class: 'st-coin', html: ICON.coin }), theirCash), theirState);
    const bar = h('div', { class: 'st-bar' });
    const plants = h('div', { class: 'st-plants' });
    const garden = h('div', { class: 'st-garden' }, h('div', { class: 'st-gh', html: `Your garden <small>tap a plant to add or remove it (up to ${TRADE.maxPlants})</small>` }), plants);
    const main = h('div', { class: 'st-main' }, h('div', { class: 'st-offers' }, mySide, h('span', { class: 'st-swap', html: SOCIAL_ICONS.trade }), theirSide), bar, garden);
    s.body.append(main);
    Object.assign(T, { mySlots, theirSlots, cashIn, readyBtn, theirCash, theirState, theirChanged, mySide, theirSide, bar, plants, main });

    // - / + walk a ladder of round amounts: 10, 25, 50, 100, 250, 500, 1K, 2.5K ...
    const step = (dir) => {
      const cur = myOffer().cash;
      const max = Math.floor(me.cash);
      let next = dir > 0 ? CASH_STEPS.find((v) => v > cur) ?? max : [...CASH_STEPS].reverse().find((v) => v < cur) ?? 0;
      next = Math.max(0, Math.min(max, next));
      if (next === cur) return uiSound(app, 'error');
      uiSound(app, 'click');
      editCash(next, 150);
    };
    minus.addEventListener('click', () => step(-1));
    plus.addEventListener('click', () => step(1));
    cashIn.addEventListener('input', () => {
      const v = Math.floor(Number(cashIn.value.replace(/[^0-9]/g, '')) || 0);
      editCash(Math.min(v, Math.floor(me.cash)), 450, true);
    });
    cashIn.addEventListener('blur', () => paintTrade());
    cashIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cashIn.blur();
    });
    readyBtn.addEventListener('click', () => {
      if (readyBtn.disabled) return;
      uiSound(app, 'click');
      flush();
      act('tradeReady', !T.readyMine);
    });
    paintTrade();
  }

  const myOffer = () => T.pending || T.mine;

  function send() {
    if (!T?.pending) return;
    clearTimeout(T.sendTimer);
    T.sendTimer = 0;
    const o = T.pending;
    act('tradeOffer', { planters: [...o.planters], cash: o.cash, uids: o.planters.map((i) => game.gardens[me.slot].planters[i]?.plant?.uid ?? null) });
  }
  const flush = () => T?.sendTimer && send();

  function edit(planters, cash) {
    T.pending = { planters, cash, plants: [] };
    T.pendingAt = performance.now();
  }

  function editCash(v, delay, typing = false) {
    const o = myOffer();
    edit([...o.planters], v);
    clearTimeout(T.sendTimer);
    T.sendTimer = setTimeout(send, delay);
    paintTrade(typing);
  }

  function togglePlant(index) {
    const o = myOffer();
    const list = [...o.planters];
    const i = list.indexOf(index);
    if (i >= 0) list.splice(i, 1);
    else if (list.length >= TRADE.maxPlants) {
      T.note = { cls: 'warn', html: `Up to <b>${TRADE.maxPlants}</b> plants per trade.`, until: game.time + 2.2 };
      uiSound(app, 'error');
      paintTrade();
      return;
    } else list.push(index);
    uiSound(app, 'click');
    edit(list, o.cash);
    clearTimeout(T.sendTimer);
    T.sendTimer = setTimeout(send, 90); // quick taps go out as one offer (the host rate-limits actions)
    paintTrade();
  }

  function cancelTrade() {
    if (!T) return;
    uiSound(app, 'click');
    flush();
    act('tradeCancel');
    endTrade();
  }

  function endTrade() {
    if (!T) return;
    clearTimeout(T.sendTimer);
    T = null;
    closeSheet();
  }

  function slotCards(container, offer, planterData, mine) {
    container.textContent = '';
    for (let k = 0; k < TRADE.maxPlants; k++) {
      const idx = offer.planters[k];
      const d = idx == null ? null : planterData(idx, k);
      if (!d) {
        container.append(h('div', { class: 'st-slot empty', html: mine ? '+<span>Add a plant</span>' : '' }));
        continue;
      }
      const c = plantCard(d, { tag: mine ? 'button' : 'div', grown: d.grown !== false && !(d.growLeft > 0) });
      if (mine) c.addEventListener('click', () => togglePlant(idx));
      c.dataset.uid = String(d.uid ?? '');
      container.append(h('div', { class: 'st-slot' }, c));
    }
  }

  function paintTrade(typing = false) {
    if (!T || T.done) return;
    const t = game.time;
    const o = myOffer();
    const garden = game.gardens[me.slot].planters;
    // my side: live plants from my garden; their side: exactly what the host says they offer
    // (cards are only rebuilt when the offer changes, so a change-flash keeps playing)
    const mySig = o.planters.map((i) => (garden[i]?.plant ? garden[i].plant.uid + (garden[i].plant.growLeft > 0 ? 'g' : '') : 'x')).join(',');
    if (mySig !== T.mySig) {
      T.mySig = mySig;
      slotCards(T.mySlots, o, (i) => garden[i]?.plant || null, true);
    }
    const theirSig = T.theirs.plants.map((d) => d.uid + (d.grown ? '' : 'g')).join(',');
    if (theirSig !== T.theirSig) {
      T.theirSig = theirSig;
      slotCards(T.theirSlots, T.theirs, (i, k) => T.theirs.plants[k] || null, false);
    }
    if (!typing && document.activeElement !== T.cashIn) T.cashIn.value = o.cash ? o.cash.toLocaleString('en-US') : '0';
    T.theirCash.textContent = money(T.theirs.cash);
    T.theirCash.parentElement.style.opacity = T.theirs.cash ? '1' : '.55';
    // ready states
    const locked = t < T.lockUntil;
    const nothing = !o.planters.length && !o.cash && !T.theirs.planters.length && !T.theirs.cash;
    const needMe = T.theirs.planters.length - o.planters.length - freeIn(me);
    const needThem = o.planters.length - T.theirs.planters.length - freeIn(T.other);
    const blocked = nothing || needMe > 0 || needThem > 0 || !!T.pending;
    const rb = T.readyBtn;
    rb.classList.toggle('on', T.readyMine);
    rb.classList.toggle('locked', locked && !T.readyMine);
    rb.style.setProperty('--lock', Math.max(0.05, T.lockUntil - t).toFixed(2) + 's');
    rb.disabled = !T.readyMine && (locked || blocked);
    const rbHtml = T.readyMine ? `<span class="bi">${ICON.check}</span><span>READY!</span>` : '<span>Ready?</span>';
    if (rb._h !== rbHtml) rb.innerHTML = rb._h = rbHtml;
    T.mySide.classList.toggle('ready', T.readyMine);
    T.theirSide.classList.toggle('ready', T.readyTheirs);
    T.theirState.classList.toggle('on', T.readyTheirs);
    const tsHtml = T.readyTheirs ? `<span class="bi">${ICON.check}</span><span>READY!</span>` : '<span>Not ready</span>';
    if (T.theirState._h !== tsHtml) T.theirState.innerHTML = T.theirState._h = tsHtml;
    const changedNow = game.time < T.changedUntil;
    T.theirChanged.hidden = !changedNow;
    T.theirSide.classList.toggle('changed', changedNow);
    // garden picker
    const sig = gardenSig() + '|' + o.planters.join(',');
    if (sig !== T.sig) {
      T.sig = sig;
      T.plants.textContent = '';
      const list = myPlants();
      if (!list.length) T.plants.append(h('div', { class: 'ss-empty', html: '<b>No plants yet!</b>You can still offer cash.' }));
      for (const { index, plant, busy } of list) {
        const c = plantCard(plant, { tag: 'button', grown: plant.growLeft <= 0, busy: busy ? 'BEING STOLEN' : null, cls: o.planters.includes(index) ? 'sel' : '' });
        c.setAttribute('aria-pressed', String(o.planters.includes(index)));
        c.addEventListener('click', () => !busy && togglePlant(index));
        T.plants.append(c);
      }
    }
    // the status bar: countdown > problems > news > tip
    const bar = T.bar;
    let cls = '';
    let html = '';
    const note = T.note && t < T.note.until ? T.note : null;
    if (T.countdownEndsAt > 0) {
      cls = 'count';
      html = `Trading in <b>${Math.max(1, Math.ceil(T.countdownEndsAt - t))}</b>`;
    } else if (note) {
      cls = note.cls;
      html = note.html;
    } else if (needMe > 0) {
      cls = 'bad';
      html = `You need <b>${needMe}</b> more free planter${needMe > 1 ? 's' : ''} for this. Offer more plants or unlock a planter.`;
    } else if (needThem > 0) {
      cls = 'bad';
      html = `${esc(T.other.name)}'s garden has no room for <b>${needThem}</b> more plant${needThem > 1 ? 's' : ''}.`;
    } else if (T.readyMine && !T.readyTheirs) {
      html = `Waiting for <b>${esc(T.other.name)}</b> to press Ready...`;
    } else if (nothing) {
      html = 'Pick plants from your garden or add cash. Both press <b>Ready</b> to swap.';
    } else {
      html = 'Check both sides, then press <b>Ready</b>. Any change un-readies you both.';
    }
    if (bar.className !== 'st-bar ' + cls) bar.className = 'st-bar ' + cls;
    if (bar._h !== html) bar.innerHTML = `<span class="st-bar-t">${(bar._h = html)}</span>`;
  }

  function onUpdate(e) {
    if (!T || T.done) return;
    const iAmA = isMe(e.a);
    if (!iAmA && !isMe(e.b)) return;
    if (slotOf(iAmA ? e.b : e.a) !== T.other.slot) return;
    const mine = iAmA ? e.offerA : e.offerB;
    const theirs = iAmA ? e.offerB : e.offerA;
    const prev = T.theirs;
    T.mine = mine;
    T.readyMine = iAmA ? e.readyA : e.readyB;
    T.readyTheirs = iAmA ? e.readyB : e.readyA;
    T.countdownEndsAt = e.countdownEndsAt || 0;
    T.lockUntil = e.lockUntil || 0;
    T.rev = e.rev;
    // my edit made it to the host (or the host trimmed it): stop showing the local copy
    if (T.pending && !T.sendTimer && T.pending.cash === mine.cash && T.pending.planters.join() === mine.planters.join()) T.pending = null;
    else if (T.pending && !T.sendTimer && performance.now() - T.pendingAt > 1500) T.pending = null;
    T.theirs = theirs;
    const byThem = e.changedBy != null && slotOf(e.changedBy) === T.other.slot;
    const byMe = e.changedBy != null && isMe(e.changedBy);
    if (byThem && (e.reason === 'offer' || e.reason === 'changed')) {
      // anti-scam: shout about every change on their side (their very first offer is just news)
      const first = !prev.planters.length && !prev.cash;
      T.changedUntil = game.time + 3;
      T.theirChanged.textContent = first ? 'New!' : 'Changed!';
      T.note = first
        ? { cls: 'warn', html: `<b>${esc(T.other.name)} made an offer!</b> Take a good look.`, until: game.time + 3 }
        : { cls: 'warn', html: `<b>${esc(T.other.name)} changed their offer!</b> Check it again before you press Ready.`, until: game.time + 4 };
      T.theirSide.classList.remove('flash');
      void T.theirSide.offsetWidth;
      T.theirSide.classList.add('flash');
      uiSound(app, 'error');
    } else if (byMe && e.reason === 'changed') {
      T.note = { cls: 'warn', html: 'One of your plants left the trade (stolen or sold).', until: game.time + 4 };
    } else if (e.reason === 'failed') {
      T.note = { cls: 'bad', html: 'The swap didn\'t go through. Check both sides and press Ready again.', until: game.time + 4 };
      uiSound(app, 'error');
    } else if (e.reason === 'ready' && T.readyMine && T.readyTheirs) {
      uiSound(app, 'shopBell');
    }
    paintTrade();
    // flash the plants that are new on their side
    if (byThem) {
      const old = new Set(prev.plants.map((x) => x.uid));
      for (const c of T.theirSlots.querySelectorAll('.spc')) if (!old.has(Number(c.dataset.uid))) c.classList.add('flash', 'new');
    }
  }

  function showDone(e) {
    if (!T) return;
    const iAmA = isMe(e.a);
    const got = iAmA ? e.offerB : e.offerA;
    const gave = iAmA ? e.offerA : e.offerB;
    const gotPlants = (T.theirs.plants.length ? T.theirs.plants : (iAmA ? e.plantsB : e.plantsA) || []).filter((d) => d && PLANT[d.speciesId]);
    T.done = true;
    clearTimeout(T.sendTimer);
    const body = T.sheet.body;
    body.textContent = '';
    const ok = noFocus(h('button', { class: 'btn btn-green btn-lg', type: 'button', onclick: () => endTrade() }, h('span', { class: 'bi', html: ICON.check }), h('span', { text: 'Awesome!' })));
    body.append(h('div', { class: 'st-done' },
      h('div', { class: 'st-done-t', text: 'TRADE COMPLETE!' }),
      h('div', { class: 'st-done-s', html: gotPlants.length || got?.cash ? `You got from ${who(T.other)}:` : `You gave ${who(T.other)} a present!` }),
      gotPlants.length ? h('div', { class: 'st-done-got' }, gotPlants.map((d) => plantCard(d))) : null,
      got?.cash ? h('div', { class: 'st-done-cash', text: '+' + money(got.cash) }) : null,
      gave && (gave.planters?.length || gave.cash) ? h('div', { class: 'st-done-s', text: `(You gave ${gave.planters.length ? gave.planters.length + ' plant' + (gave.planters.length > 1 ? 's' : '') : ''}${gave.planters.length && gave.cash ? ' and ' : ''}${gave.cash ? money(gave.cash) : ''}.)` }) : null,
      h('div', { class: 'ss-actions' }, ok)));
    T.sheet.x.onclick = () => endTrade();
    T.sheet.escape = () => endTrade();
    uiSound(app, 'confetti');
    T.doneAt = game.time;
  }

  // ---------------------------------------------------------------- events
  const REASON = {
    declined: (e, o) => (isMe(e.a) ? `${who(o)} said no thanks.` : null),
    cancelled: (e, o) => (isMe(e.by) ? null : `${who(o)} cancelled the trade.`),
    withdrawn: (e, o) => (isMe(e.b) ? `${who(o)} changed their mind.` : null),
    expired: (e, o) => (isMe(e.a) ? `${who(o)} didn't answer.` : null),
    busy: (e, o) => (isMe(e.a) ? `${who(o)} is busy right now.` : null),
    far: (e, o) => `Get closer to ${who(o)} to trade!`,
    distance: () => 'Trade cancelled: you walked too far apart.',
    bonked: (e, o) => (isMe(e.by) ? 'BONK! Trade cancelled.' : `${who(o)} got bonked! Trade cancelled.`),
    left: (e, o) => `${who(o)} left, so the trade is off.`,
    wait: (e, o) => `${who(o)} said no. Try again in a bit!`,
  };

  const offs = [
    bus.on('trade:invite', (e) => {
      if (isMe(e.to)) {
        const from = player(e.from);
        if (!from || from === me) return;
        invite = { from, expiresAt: e.expiresAt, at: game.time };
        renderInvite();
        chipKey = null;
        uiSound(app, 'shopBell');
      } else if (isMe(e.from)) {
        outgoing = { to: player(e.to), expiresAt: e.expiresAt };
        chipKey = null;
      }
    }),
    bus.on('trade:open', (e) => {
      if (!isMe(e.a) && !isMe(e.b)) return;
      const other = player(isMe(e.a) ? e.b : e.a);
      if (!other) return;
      invite = null;
      outgoing = null;
      renderInvite();
      closeSheet(true);
      T = null;
      openTrade(other);
      uiSound(app, 'shopBell');
    }),
    bus.on('trade:update', onUpdate),
    bus.on('trade:cancel', (e) => {
      if (!isMe(e.a) && !isMe(e.b)) return;
      const other = player(isMe(e.a) ? e.b : e.a);
      if (invite && slotOf(invite.from) === slotOf(other) && isMe(e.b)) {
        invite = null;
        renderInvite();
      }
      if (outgoing && isMe(e.a) && slotOf(outgoing.to) === slotOf(other)) outgoing = null;
      chipKey = null;
      const wasOpen = !!T && T.other === other && !T.done;
      if (wasOpen) endTrade();
      const msg = other && REASON[e.reason]?.(e, other);
      if (msg && (wasOpen || !['distance', 'bonked'].includes(e.reason))) toast(msg, e.reason === 'bonked' || e.reason === 'distance' ? 'warn' : 'info', other.faceKey);
    }),
    bus.on('trade:done', (e) => {
      if (!isMe(e.a) && !isMe(e.b)) return;
      if (T && !T.done) showDone(e);
      else toast('Trade complete!', 'good');
    }),
    bus.on('gift', (e) => {
      const d = e.plant;
      if (!d) return;
      if (isMe(e.to)) {
        const from = player(e.from);
        toast(`${who(from)} gave you ${plantName(d)}!<small>It's growing in your garden now.</small>`, 'good', from?.faceKey);
        uiSound(app, 'confetti');
      } else if (isMe(e.from)) {
        const to = player(e.to);
        toast(`You gave ${who(to)} ${plantName(d)}. So kind!`, 'good', to?.faceKey);
        uiSound(app, 'purchase');
      }
    }),
    bus.on('gift:fail', (e) => {
      if (!isMe(e.from)) return;
      const to = player(e.to);
      toast(e.reason === 'full' ? `${who(to)}'s garden is full!` : 'That gift didn\'t work.', 'warn', to?.faceKey);
    }),
    bus.on('chat', (e) => {
      // someone nearby says "Trade?": make the chip wiggle
      if (e?.quick && e.phrase === 'trade' && e.player && e.player !== me && e.player.kind !== 'bot' && dist(e.player) < NEAR * 1.5) {
        pulseUntil = performance.now() + 3000;
        chipKey = null;
      }
    }),
    bus.on('player:hit', ({ target } = {}) => {
      // bonked while picking a gift: the picker gets out of the way (trades cancel on the host)
      if (target === me && sheet?.kind === 'gift') closeSheet();
    }),
    bus.on('net:host', () => {
      if (T && !T.done) {
        toast('Trade cancelled: the room changed hosts.', 'warn');
        endTrade();
      }
      invite = outgoing = null;
      renderInvite();
      chipKey = null;
    }),
  ];

  // ---------------------------------------------------------------- keys (capture, before the game's)
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || socialUi.wheel) return;
    if (sheet) {
      if (e.code === 'Escape' && app.state === 'playing') {
        if (isTyping(e)) e.target.blur();
        sheet.escape ? sheet.escape() : closeSheet();
        stop(e);
      }
      return;
    }
    if (isTyping(e) || e.repeat || app.state !== 'playing' || app.menus?.isBlocking?.()) return;
    if (e.code === 'KeyY') {
      if (invite) acceptInvite();
      else if (near && !outgoing) requestTrade(near);
      else return;
      stop(e);
    } else if (e.code === 'KeyN' && invite) {
      declineInvite();
      stop(e);
    } else if (e.code === 'KeyU' && near) {
      openGift(near);
      stop(e);
    }
  };
  window.addEventListener('keydown', onKey, true);

  // ---------------------------------------------------------------- per frame
  let acc = 1;
  let visible = true;
  let dockH = 0;
  let scanAcc = 1;
  return {
    update(dt = 0) {
      if (!app.game || app.game !== game) return;
      // the host runs the trades (main.js ticks it too once integrated: update() is idempotent per game time)
      if (!app.online?.isClient) trades.update();
      const playing = app.state === 'playing';
      // sheets hide under the pause menu and keep the player still while up
      if (sheet) {
        if (playing !== visible) {
          visible = playing;
          sheet.layer.style.display = playing ? '' : 'none';
        }
        if (playing && app.input.enabled) holdInput(true);
        sheet.tick?.();
      }
      if (T?.done && game.time - T.doneAt > 6) endTrade(); // the celebration closes itself
      // an edit the host trimmed to what it already had never echoes back: stop waiting for it
      if (T?.pending && !T.sendTimer && performance.now() - T.pendingAt > 1500) {
        T.pending = null;
        paintTrade();
      }
      if (T && !T.done) {
        const t = game.time;
        if (T.countdownEndsAt > 0 || (T.note && t < T.note.until + 0.1) || t < T.lockUntil + 0.1 || t < T.changedUntil + 0.1) paintTrade();
        else {
          acc += dt;
          if (acc > 0.25) {
            acc = 0;
            paintTrade();
          }
        }
      }
      if (invite) {
        const left = invite.expiresAt - game.time;
        if (left <= 0) {
          invite = null;
          renderInvite();
          chipKey = null;
        } else if (inviteBar) inviteBar.style.setProperty('--f', Math.max(0, Math.min(1, left / TRADE.inviteTtl)).toFixed(3));
      }
      if (outgoing && game.time > outgoing.expiresAt + 1) {
        outgoing = null;
        chipKey = null;
      }
      // who's close enough for the chip (cloaked players stay secret); 10 checks a second is plenty
      scanAcc += dt;
      if (scanAcc < 0.09 && chipKey !== null) return;
      scanAcc = 0;
      let best = null;
      let bd = NEAR;
      for (const p of people()) {
        if (p.invisible(game.time)) continue;
        const d = dist(p);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (outgoing && !best && dist(outgoing.to) < TRADE.requestRange + 4) best = outgoing.to;
      near = best;
      renderChip();
      // phones: the chat log sits right where the dock goes; tell the CSS how tall the dock is
      const dh = dock.childElementCount ? dock.offsetHeight : 0;
      if (dh !== dockH) {
        dockH = dh;
        hudRoot.style.setProperty('--soc-dock-h', dh + 'px');
        hudRoot.classList.toggle('soc-docked', dh > 0);
      }
    },
    dispose() {
      offs.forEach((off) => off());
      window.removeEventListener('keydown', onKey, true);
      if (T) clearTimeout(T.sendTimer);
      T = null;
      closeSheet(true);
      dock.remove();
      hudRoot.classList.remove('soc-docked');
      if (ownManager) {
        trades.dispose();
        if (app.trades === trades) app.trades = null;
      }
    },
    /** tests: open the gift picker for a slot */
    openGift: (slot) => openGift(game.players[slot]),
  };
}
