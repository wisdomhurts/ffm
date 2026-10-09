// Gifting + trading UI. OWNER: social agent (docs/ONLINE.md).
// mountSocial(app, hudRoot, {tl, tr, top, bottom}) -> {update(dt, t), dispose()}
//
// Shows up for the other people in the game and for the family bots (offline and in private rooms):
// * a "Trade / Gift" chip when one stands within 10 studs (keys Y = trade, U = gift; gamepad D-pad up / right)
// * an invite card when someone asks you (Y = accept, N = no thanks; gamepad D-pad up / left), with a timer
// * the gift picker: pick one of your planted plants, confirm, it lands in their garden
// * the trade window: both offers side by side (up to 4 plants with rarity colours, mutations and income,
//   growing ones as "Seedling"; a row of up to 3 pets and the seed in your hands; cash), a picker with tabs
//   (your plants + the seed in hand, your pets, and with a bot "Ask <name>": tap its plants and pets to ask
//   for them), Ready toggles, a 3 s countdown, room / pet-bag warnings, and anti-scam cues: every change
//   un-readies both sides, flashes what changed and locks Ready for a moment. Giving a pet to a bot asks
//   twice ("Bye bye, Fluffy! Micah keeps this pet."). Then a "Trade done!" card lists everything both ways.
//   Keys in the window: Y = Ready, Esc = cancel; gamepad: D-pad moves, A presses, B cancels, Y = Ready,
//   LB / RB switch tabs.
// Everything goes through app.act (so it works as an online client) and the trade:* / gift events. Pets you
// offer are locked in My Pets until the trade ends (socialUi.tradePets); traded pets reach the profile as
// pet mail (ui/pets.js attachPetMail).
import { bus } from '../core/events.js';
import { PLANT, MUTATIONS } from '../config.js';
import { PET, petScore } from '../pets/catalog.js';
import { MAX_TEAM } from '../pets/effects.js';
import { petLabel } from '../pets/names.js';
import { injectPetStyles, RARITY_COLOR, PAW_ICON, rarityName } from '../pets/style.js';
import { seedSig } from '../gameplay/game.js';
import { rarityColor } from '../view/gameView.js';
import { h, noFocus, esc, money, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { avatarEl } from './avatars.js';
import { thumbEl, petBag } from './pets.js';
import { SOCIAL_ICONS } from '../social/icons.js';
import { plantIcon } from '../social/plantIcon.js';
import { injectSocialStyles } from '../social/styles.js';
import { injectTradeStyles } from '../social/tradeStyles.js';
import { createTradeManager, TRADE, botPetUid, emptyOffer, offerEmpty } from '../social/trades.js';
import { socialUi } from '../social/uiState.js';

const NEAR = 10; // studs: the Trade / Gift chip shows for people this close
const BOT_SETTLE = 0.6; // s: a family bot shows the chip once it has stayed close this long (they run past a lot)
const CASH_STEPS = [0];
for (let k = 1; k <= 1e15; k *= 10) CASH_STEPS.push(10 * k, 25 * k, 50 * k);
// how each family bot trades (social/botTrade.js BOT_TRADE.want), as a hint in the "Ask" tab
const MOOD = { esther: '{n} is feeling generous!', dorian: '{n} likes a fair deal.', maddie: '{n} wants a little extra.', micah: '{n} drives a hard bargain!' };
// a player's name as a coloured pill (own class: works inside HUD toasts and our panels alike)
const who = (p) => (p ? `<b class="soc-who" style="--c:${p.char.color}">${esc(p.name)}</b>` : 'Someone');
const slotOf = (x) => (typeof x === 'number' ? x : x?.slot ?? -1);
const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
const isBot = (p) => p?.kind === 'bot';
const names = (list) => (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0] || '');

// HUD buttons act on the pointer itself: browsers never synthesise a click for a second finger while the
// thumb is on the joystick (same pattern as ui/hud.js). Keyboard activation still works.
function onTap(el, fn) {
  let armed = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    armed = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointers can't be captured */
    }
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

/** A plant card. d = {speciesId, mutation}; o = {tag, cls, grown, busy} (grown: false = still growing: "Seedling") */
export function plantCard(d, o = {}) {
  const sp = PLANT[d?.speciesId];
  if (!sp) return h('span', { class: 'spc' });
  const mut = MUTATIONS[d.mutation] || MUTATIONS.normal;
  const tag = o.tag || 'div';
  const el = h(tag, {
    class: `spc r-${sp.rarity} ${o.cls || ''}`, style: `--rc:${rarityColor(sp.rarity)}`, type: tag === 'button' ? 'button' : null,
    title: `${mut.name ? mut.name + ' ' : ''}${sp.name}${o.grown === false ? ' (seedling)' : ''}`, 'data-busy': o.busy || null,
  },
  h('span', { class: 'spc-ic', html: plantIcon(d.speciesId, mut.id) }),
  h('span', { class: `spc-mut mut mut-${mut.id}`, text: mut.name || '' }),
  h('span', { class: 'spc-name', text: sp.name }),
  h('span', { class: 'spc-inc', text: money(sp.income * mut.mult) + '/s' }),
  o.grown === false ? h('span', { class: 'spc-grow', text: 'Seedling' }) : null,
  h('span', { class: 'spc-tick', html: ICON.check }));
  if (o.busy) el.classList.add('busy');
  return el;
}

/** The seed in someone's hands as a card (d = {speciesId, mutation}); o = {tag, cls}. */
export function seedCard(d, o = {}) {
  const sp = PLANT[d?.speciesId];
  if (!sp) return h('span', { class: 'spc' });
  const mut = MUTATIONS[d.mutation] || MUTATIONS.normal;
  const tag = o.tag || 'div';
  return h(tag, { class: `spc seedc r-${sp.rarity} ${o.cls || ''}`, style: `--rc:${rarityColor(sp.rarity)}`, type: tag === 'button' ? 'button' : null, title: `${mut.name ? mut.name + ' ' : ''}${sp.name} seed` },
    h('span', { class: 'spc-ic', html: plantIcon(d.speciesId, mut.id) }),
    h('span', { class: `spc-mut mut mut-${mut.id}`, text: mut.name || '' }),
    h('span', { class: 'spc-name', text: sp.name }),
    h('span', { class: 'spc-seed', text: o.label || 'Seed in hand' }),
    h('span', { class: 'spc-tick', html: ICON.check }));
}

/** A pet card. x = {id, name?}; o = {tag, cls, team} */
export function petCard(x, o = {}) {
  const pet = PET[x?.id];
  if (!pet) return h('span', { class: 'ptc' });
  const tag = o.tag || 'div';
  return h(tag, {
    class: `ptc r-${pet.rarity} ${o.cls || ''}`, style: `--rc:${RARITY_COLOR[pet.rarity]}`, type: tag === 'button' ? 'button' : null,
    title: x.name ? `${x.name} the ${pet.name}` : pet.name,
  },
  thumbEl('pet', pet.id, 'ptc-th'),
  h('span', { class: 'ptc-n', text: petLabel(x) }),
  h('span', { class: 'ptc-r', text: x.name ? pet.name : rarityName(pet.rarity) }),
  o.team ? h('span', { class: 'ptc-team', text: 'Team' }) : null,
  h('span', { class: 'spc-tick', html: ICON.check }));
}

export function mountSocial(app, hudRoot, parts = {}) {
  const me = app.human;
  const game = app.game;
  if (!game || !me || !hudRoot) return { update() {}, dispose() {} };
  injectSocialStyles();
  injectTradeStyles();
  injectPetStyles();
  // the host (or an offline game) runs the trades; main.js normally creates this at boot
  const ownManager = !app.trades;
  const trades = app.trades || (app.trades = createTradeManager(app));

  const player = (x) => game.players[slotOf(x)] || null;
  const isMe = (x) => slotOf(x) === me.slot;
  // people, and the family bots (offline and in private rooms; public rooms have none)
  const people = () => game.players.filter((p) => p !== me && (p.isPlayer || isBot(p)));
  const dist = (p) => Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
  const freeIn = (p) => game.gardens[p.slot].planters.filter((x) => x.unlocked && !x.plant).length;
  const toast = (html, kind = 'info', face = null) => app.hud?.alerts?.toast(html, kind, face ? { face, duration: 3400 } : { icon: SOCIAL_ICONS.trade, duration: 3400 });
  const act = (...a) => app.act(...a);
  const pad = () => app.input?.lastDevice === 'gamepad';
  const plantName = (d) => {
    const m = MUTATIONS[d.mutation];
    return `<b class="pn" style="--rc:${rarityColor(PLANT[d.speciesId]?.rarity || 'common')}">${esc((m?.name ? m.name + ' ' : '') + (PLANT[d.speciesId]?.name || 'plant'))}</b>`;
  };

  // ---------------------------------------------------------------- dock: chip + invite
  // The HUD's social slot sits between the proximity prompt and the carry pill; the dock only joins it while
  // it has something to show (an empty slot collapses, and the HUD's squeeze / hush logic watches it)
  const dock = h('div', { class: 'soc-dock' });
  function syncDock() {
    const want = dock.childElementCount > 0;
    if (want === dock.isConnected) return;
    if (!want) dock.remove();
    else if (parts.social) parts.social.appendChild(dock);
    else if (parts.bottom) parts.bottom.prepend(dock);
    else hudRoot.appendChild(dock);
  }

  let near = null; // the person (or bot) the chip is for
  let outgoing = null; // {to, expiresAt} my open ask
  let invite = null; // {from, expiresAt, at}
  let chipKey = null; // what the chip shows now (null = repaint)
  let chipEl = null;
  let inviteEl = null;
  let inviteBar = null;
  let pulseUntil = 0;
  let lastCancelAt = -1e9; // performance.now() of the last trade:cancel about me (its toast says why)
  const botNearSince = new Map(); // bot slot -> game time it came close
  // key hints follow the device in use (gamepad: the D-pad)
  const keyFor = (k) => (pad() ? { Y: '↑', N: '←', U: '→' }[k] || k : k);

  function renderChip() {
    const show = !!near && app.state === 'playing' && !socialUi.sheet && !T && !invite;
    const key = show ? `${near.slot}|${near.name}|${outgoing ? outgoing.to.slot : '-'}|${pad()}` : 'none';
    if (key === chipKey) return;
    chipKey = key;
    chipEl?.remove();
    chipEl = null;
    if (!show) return syncDock();
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
          h('span', { class: 'bi', html: SOCIAL_ICONS.trade }), h('span', { text: 'Trade' }), h('kbd', { text: keyFor('Y') }))), () => requestTrade(p)),
        onTap(noFocus(h('button', { class: 'btn btn-gold btn-sm sc-b', type: 'button' },
          h('span', { class: 'bi', html: SOCIAL_ICONS.gift }), h('span', { text: 'Gift' }), h('kbd', { text: keyFor('U') }))), () => openGift(p)));
    }
    dock.appendChild(chipEl);
    syncDock();
  }

  function renderInvite() {
    inviteEl?.remove();
    inviteEl = inviteBar = null;
    if (!invite) return syncDock();
    const p = invite.from;
    inviteBar = h('i');
    // .urgent: the HUD treats it like the prompt pill (banners squeeze for it; it never waits)
    inviteEl = h('div', { class: 'soc-invite urgent', role: 'alertdialog', 'aria-label': `${p.name} wants to trade` },
      avatarEl(p.faceKey, 'si-ava'),
      h('div', { class: 'si-t', html: `${who(p)} wants to trade!<small>Swap plants, pets and seeds, fair and square.</small>` }),
      h('div', { class: 'si-btns' },
        onTap(noFocus(h('button', { class: 'btn btn-green si-b', type: 'button' }, h('span', { class: 'bi', html: ICON.check }), h('span', { text: 'Accept' }), h('kbd', { text: keyFor('Y') }))), acceptInvite),
        onTap(noFocus(h('button', { class: 'btn btn-grey si-b', type: 'button' }, h('span', { text: 'No thanks' }), h('kbd', { text: keyFor('N') }))), declineInvite)),
      h('div', { class: 'si-bar' }, inviteBar));
    dock.prepend(inviteEl);
    syncDock();
  }

  function requestTrade(p) {
    if (!p || socialUi.sheet) return;
    uiSound(app, 'click');
    const t0 = performance.now();
    const r = act('tradeRequest', p.slot);
    // (offline the manager answers right away: a "too far" / "said no" toast already told them why)
    if (r === false && lastCancelAt < t0) toast(`Couldn't ask ${who(p)} right now.`, 'warn', p.faceKey);
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
  const gardenSig = (slot = me.slot) => game.gardens[slot].planters.map((pl) => (pl.plant ? pl.plant.uid + (pl.stealer != null ? 's' : '') + (pl.plant.growLeft > 0 ? 'g' : '') : '-')).join(',');

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
      if (dist(to) > TRADE.keepRange || !to.present) closeSheet();
    };
    s.escape = () => (chosen != null ? back() : closeSheet());
  }

  // ---------------------------------------------------------------- trade window
  let T = null; // the open trade (see openTrade)

  function openTrade(other) {
    const s = openSheet('trade', other, SOCIAL_ICONS.trade, 'TRADE', `Trade with ${other.name}`);
    const bot = isBot(other);
    T = {
      other, bot, sheet: s, mine: emptyOffer(), theirs: emptyOffer(), readyMine: false, readyTheirs: false, petRoom: [null, null],
      countdownEndsAt: 0, lockUntil: 0, rev: 0, pending: null, sendTimer: 0, askPending: null, askTimer: 0, note: null, changedUntil: 0,
      done: null, sig: '', tab: 'plants', confirmUntil: 0, said: null, sentRoom: null,
    };
    s.x.onclick = () => cancelTrade();
    s.back.onclick = () => {}; // a stray tap outside must not cancel a trade
    s.escape = () => cancelTrade();
    // static layout
    const mySlots = h('div', { class: 'st-slots' });
    const theirSlots = h('div', { class: 'st-slots' });
    const myExtras = h('div', { class: 'stx-row', role: 'list', 'aria-label': 'Pets and seed you give' });
    const theirExtras = h('div', { class: 'stx-row', role: 'list', 'aria-label': `Pets and seed ${other.name} gives` });
    const cashIn = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Cash you give', maxlength: '12' });
    const minus = noFocus(h('button', { class: 'btn btn-grey st-step', type: 'button', 'aria-label': 'Less cash', text: '-' }));
    const plus = noFocus(h('button', { class: 'btn btn-grey st-step', type: 'button', 'aria-label': 'More cash', text: '+' }));
    const readyBtn = noFocus(h('button', { class: 'btn btn-blue st-ready', type: 'button' }));
    const theirCash = h('span', { class: 'st-cashv' });
    const theirState = h('div', { class: 'st-state' });
    const theirChanged = h('span', { class: 'st-changed', text: 'Changed!', hidden: '' });
    const mySide = h('section', { class: 'st-side me' },
      h('div', { class: 'st-h' }, h('span', { text: 'You give' })), mySlots, myExtras,
      h('div', { class: 'st-cash' }, h('span', { class: 'st-coin', html: ICON.coin }), minus, cashIn, plus), readyBtn);
    const theirSide = h('section', { class: 'st-side them' },
      h('div', { class: 'st-h' }, avatarEl(other.faceKey), h('span', { text: `${other.name} gives` }), theirChanged), theirSlots, theirExtras,
      h('div', { class: 'st-cash' }, h('span', { class: 'st-coin', html: ICON.coin }), theirCash), theirState);
    const bar = h('div', { class: 'st-bar', 'aria-live': 'polite' });
    // the picker: your plants (+ the seed in your hands), your pets, and with a bot: what you'd like from it
    const tabBtn = (id, icon, label) => noFocus(h('button', { class: 'stt-tab', type: 'button', role: 'tab', 'data-tab': id, onclick: () => setTab(id) },
      h('span', { class: 'stt-ic', html: icon }), h('span', { class: 'stt-l', text: label })));
    const tabs = h('div', { class: 'stt-tabs', role: 'tablist' },
      tabBtn('plants', ICON.sprout, 'Plants'), tabBtn('pets', PAW_ICON, 'Pets'), bot ? tabBtn('ask', SOCIAL_ICONS.trade, `Ask ${other.name}`) : null);
    const pickHead = h('div', { class: 'st-gh' });
    const plants = h('div', { class: 'st-plants', role: 'tabpanel' });
    const garden = h('div', { class: 'st-garden' }, tabs, pickHead, plants);
    const main = h('div', { class: 'st-main' }, h('div', { class: 'st-offers' }, mySide, h('span', { class: 'st-swap', html: SOCIAL_ICONS.trade }), theirSide), bar, garden);
    s.body.append(main);
    Object.assign(T, { mySlots, theirSlots, myExtras, theirExtras, cashIn, readyBtn, theirCash, theirState, theirChanged, mySide, theirSide, bar, plants, pickHead, tabs, main });

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
    readyBtn.addEventListener('click', pressReady);
    // tell the host how much room our pet bag has before anyone offers a pet
    sendRoom();
    paintTrade();
  }

  const myOffer = () => T.pending || T.mine;
  const theirOffer = () => T.askPending || T.theirs;

  function setTab(id) {
    if (!T || T.done || T.tab === id || (id === 'ask' && !T.bot)) return;
    uiSound(app, 'click');
    T.tab = id;
    T.sig = '';
    paintTrade();
  }

  function pressReady() {
    if (!T || T.done || T.readyBtn.disabled) return;
    uiSound(app, 'click');
    // a pet given to a bot is gone for good: the first press asks "really?"
    if (!T.readyMine && T.bot && myOffer().pets.length && !(game.time < T.confirmUntil)) {
      T.confirmUntil = game.time + 6;
      paintTrade();
      return;
    }
    T.confirmUntil = 0;
    flush();
    act('tradeReady', !T.readyMine, petBag(app).room);
  }

  function sendRoom() {
    const room = petBag(app).room;
    T.sentRoom = room;
    const o = myOffer();
    act('tradeOffer', { ...wireOffer(o), petRoom: room });
  }

  // my offer as the host wants it (plants by planter + uid, pets with their nicknames, the seed by its signature)
  function wireOffer(o) {
    return {
      planters: [...o.planters], cash: o.cash, uids: o.planters.map((i) => game.gardens[me.slot].planters[i]?.plant?.uid ?? null),
      pets: o.pets.map((x) => ({ uid: x.uid, id: x.id, name: x.name || '' })), seed: o.seed ? o.seed.sig : false,
    };
  }

  function send() {
    if (!T?.pending) return;
    clearTimeout(T.sendTimer);
    T.sendTimer = 0;
    const room = petBag(app).room;
    T.sentRoom = room;
    act('tradeOffer', { ...wireOffer(T.pending), petRoom: room });
  }
  const flush = () => {
    if (T?.sendTimer) send();
    if (T?.askTimer) sendAsk();
  };

  // change my offer (a copy of it): sent a moment later, so quick taps go out as one (the host rate-limits actions)
  function editMine(fn, delay = 90) {
    const o = myOffer();
    const next = { planters: [...o.planters], cash: o.cash, plants: [], pets: o.pets.map((x) => ({ ...x })), seed: o.seed };
    fn(next);
    T.pending = next;
    T.pendingAt = performance.now();
    T.confirmUntil = 0;
    clearTimeout(T.sendTimer);
    T.sendTimer = setTimeout(send, delay);
  }

  function editCash(v, delay, typing = false) {
    editMine((o) => (o.cash = v), delay);
    paintTrade(typing);
  }

  const warn = (html) => {
    T.note = { cls: 'warn', html, until: game.time + 2.2 };
    uiSound(app, 'error');
    paintTrade();
  };

  function togglePlant(index) {
    const o = myOffer();
    if (!o.planters.includes(index) && o.planters.length >= TRADE.maxPlants) return warn(`Up to <b>${TRADE.maxPlants}</b> plants per trade.`);
    uiSound(app, 'click');
    editMine((n) => {
      const i = n.planters.indexOf(index);
      if (i >= 0) n.planters.splice(i, 1);
      else n.planters.push(index);
    });
    paintTrade();
  }

  function togglePet(x) {
    const o = myOffer();
    const on = o.pets.some((y) => y.uid === x.uid);
    if (!on && o.pets.length >= TRADE.maxPets) return warn(`Up to <b>${TRADE.maxPets}</b> pets per trade.`);
    uiSound(app, 'click');
    editMine((n) => {
      n.pets = on ? n.pets.filter((y) => y.uid !== x.uid) : [...n.pets, { uid: x.uid, id: x.id, name: x.name || '' }];
    });
    paintTrade();
  }

  function toggleSeed() {
    const c = me.carrying;
    const on = !!myOffer().seed;
    if (!on && c?.kind !== 'seed') return;
    uiSound(app, 'click');
    editMine((n) => (n.seed = on ? null : { speciesId: c.speciesId, mutation: c.mutation, sig: seedSig(c) }));
    paintTrade();
  }

  // ---- asking a bot for its things (its side of the trade)
  const botGarden = () => game.gardens[T.other.slot].planters;
  const botPets = () => T.other.pets.map((id, k) => ({ uid: botPetUid(k, id), id, name: T.other.petNames[k] || '' }));

  function sendAsk() {
    if (!T?.askPending) return;
    clearTimeout(T.askTimer);
    T.askTimer = 0;
    const a = T.askPending;
    act('tradeAsk', { planters: [...a.planters], uids: a.planters.map((i) => botGarden()[i]?.plant?.uid ?? null), pets: a.pets.map((x) => ({ uid: x.uid })), petRoom: petBag(app).room });
  }

  function editAsk(fn) {
    const o = theirOffer();
    const next = { planters: [...o.planters], cash: 0, plants: [], pets: o.pets.map((x) => ({ ...x })), seed: null };
    fn(next);
    T.askPending = next;
    T.askAt = performance.now();
    clearTimeout(T.askTimer);
    T.askTimer = setTimeout(sendAsk, 90);
    paintTrade();
  }

  function askPlant(index) {
    const o = theirOffer();
    if (!o.planters.includes(index) && o.planters.length >= TRADE.maxPlants) return warn(`Up to <b>${TRADE.maxPlants}</b> plants per trade.`);
    uiSound(app, 'click');
    editAsk((n) => {
      const i = n.planters.indexOf(index);
      if (i >= 0) n.planters.splice(i, 1);
      else n.planters.push(index);
    });
  }

  function askPet(x) {
    const o = theirOffer();
    const on = o.pets.some((y) => y.uid === x.uid);
    if (!on && o.pets.length >= TRADE.maxPets) return warn(`Up to <b>${TRADE.maxPets}</b> pets per trade.`);
    uiSound(app, 'click');
    editAsk((n) => (n.pets = on ? n.pets.filter((y) => y.uid !== x.uid) : [...n.pets, { ...x }]));
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
    clearTimeout(T.askTimer);
    T = null;
    lockPets([]);
    closeSheet();
  }

  // pets on offer stay in the bag until the trade is over (My Pets can't release them, a full bag skips them)
  function lockPets(list) {
    const set = socialUi.tradePets;
    if (list.length === set.size && list.every((u) => set.has(u))) return;
    set.clear();
    for (const u of list) set.add(u);
  }

  // one side of the trade window: 4 plant slots, then a row with the seed (if any) and 3 pet places
  function paintSide(slots, extras, o, plantOf, mine) {
    const editable = mine || T.bot; // my side, or a bot's side (I ask it for things)
    const goTab = mine ? (k) => setTab(k) : () => setTab('ask');
    slots.textContent = '';
    for (let k = 0; k < TRADE.maxPlants; k++) {
      const idx = o.planters[k];
      const d = idx == null ? null : plantOf(idx, k);
      if (!d) {
        const empty = h(editable ? 'button' : 'div', { class: 'st-slot empty', type: editable ? 'button' : null, html: editable ? (mine ? '+<span>Add a plant</span>' : '+<span>Ask for a plant</span>') : '' });
        if (editable) empty.addEventListener('click', () => goTab('plants'));
        slots.append(empty);
        continue;
      }
      const c = plantCard(d, { tag: editable ? 'button' : 'div', grown: d.grown !== false && !(d.growLeft > 0) });
      if (editable) c.addEventListener('click', () => (mine ? togglePlant(idx) : askPlant(idx)));
      c.dataset.uid = String(d.uid ?? '');
      slots.append(h('div', { class: 'st-slot' }, c));
    }
    extras.textContent = '';
    if (o.seed) {
      const c = seedCard(o.seed, { tag: mine ? 'button' : 'div', cls: 'mini', label: 'Seed' });
      if (mine) c.addEventListener('click', toggleSeed);
      c.dataset.uid = 'seed:' + o.seed.sig;
      extras.append(h('div', { class: 'stx', role: 'listitem' }, c));
    }
    for (let k = 0; k < TRADE.maxPets; k++) {
      const x = o.pets[k];
      if (!x) {
        const empty = h(editable ? 'button' : 'div', { class: 'stx empty', type: editable ? 'button' : null, role: 'listitem', html: PAW_ICON, 'aria-label': editable ? (mine ? 'Add a pet' : 'Ask for a pet') : 'No pet' });
        if (editable) empty.addEventListener('click', () => goTab('pets'));
        extras.append(empty);
        continue;
      }
      const c = petCard(x, { tag: editable ? 'button' : 'div', cls: 'mini' });
      if (editable) c.addEventListener('click', () => (mine ? togglePet(x) : askPet(x)));
      c.dataset.uid = x.uid;
      extras.append(h('div', { class: 'stx', role: 'listitem' }, c));
    }
  }

  // the picker below the offers: the open tab's cards
  function paintPicker(o, bag) {
    const tab = T.tab;
    const carry = me.carrying?.kind === 'seed' ? me.carrying : null;
    const a = theirOffer();
    const sig = tab === 'plants' ? `p|${gardenSig()}|${seedSig(carry)}|${o.planters.join()}|${o.seed?.sig || ''}`
      : tab === 'pets' ? `q|${bag.owned.map((x) => x.uid + (x.name || '')).join()}|${bag.team.join()}|${o.pets.map((x) => x.uid).join()}`
        : `a|${gardenSig(T.other.slot)}|${T.other.pets.join()}|${T.other.petNames.join()}|${a.planters.join()}|${a.pets.map((x) => x.uid).join()}`;
    if (sig === T.sig) return;
    T.sig = sig;
    for (const b of T.tabs.children) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    const list = T.plants;
    list.textContent = '';
    if (tab === 'plants') {
      T.pickHead.innerHTML = `Your garden <small>tap to add or remove (up to ${TRADE.maxPlants} plants${carry ? ' + the seed in your hands' : ''})</small>`;
      if (carry && PLANT[carry.speciesId]) {
        const c = seedCard(carry, { tag: 'button', cls: o.seed ? 'sel' : '' });
        c.setAttribute('aria-pressed', String(!!o.seed));
        c.addEventListener('click', toggleSeed);
        list.append(c);
      }
      const mine = myPlants();
      if (!mine.length && !carry) list.append(h('div', { class: 'ss-empty', html: '<b>No plants yet!</b>You can still offer pets or cash.' }));
      for (const { index, plant, busy } of mine) {
        const sel = o.planters.includes(index);
        const c = plantCard(plant, { tag: 'button', grown: plant.growLeft <= 0, busy: busy ? 'BEING STOLEN' : null, cls: sel ? 'sel' : '' });
        c.setAttribute('aria-pressed', String(sel));
        c.addEventListener('click', () => !busy && togglePlant(index));
        list.append(c);
      }
    } else if (tab === 'pets') {
      T.pickHead.innerHTML = `Your pets <small>${T.bot ? `${esc(T.other.name)} keeps pets you give for good` : `tap to add or remove (up to ${TRADE.maxPets})`}</small>`;
      if (!bag.owned.length) list.append(h('div', { class: 'ss-empty', html: '<b>No pets yet!</b>Hatch an egg at the PET EGGS stand, or catch a falling egg.' }));
      const rank = (u) => (bag.team.includes(u) ? bag.team.indexOf(u) : 9);
      const sorted = bag.owned.slice().sort((x, y) => rank(x.uid) - rank(y.uid) || petScore(y.id) - petScore(x.id) || (y.t || 0) - (x.t || 0));
      for (const x of sorted) {
        const sel = o.pets.some((y) => y.uid === x.uid);
        const c = petCard(x, { tag: 'button', team: bag.team.includes(x.uid), cls: sel ? 'sel' : '' });
        c.setAttribute('aria-pressed', String(sel));
        c.addEventListener('click', () => togglePet(x));
        list.append(c);
      }
    } else {
      const bot = T.other;
      T.pickHead.innerHTML = `${esc(bot.name)}'s things <small>${esc((MOOD[bot.id] || '{n} trades fair and square.').replace('{n}', bot.name))} Tap what you'd like.</small>`;
      const theirPlants = botGarden().filter((pl) => pl.plant);
      const pets = botPets();
      if (!theirPlants.length && !pets.length) list.append(h('div', { class: 'ss-empty', html: `<b>Nothing yet!</b>${esc(bot.name)} has no plants or pets to trade right now.` }));
      for (const pl of theirPlants) {
        const sel = a.planters.includes(pl.index);
        const busy = pl.stealer != null;
        const c = plantCard(pl.plant, { tag: 'button', grown: pl.plant.growLeft <= 0, busy: busy ? 'BEING STOLEN' : null, cls: sel ? 'sel' : '' });
        c.setAttribute('aria-pressed', String(sel));
        c.addEventListener('click', () => !busy && askPlant(pl.index));
        list.append(c);
      }
      for (const x of pets) {
        const sel = a.pets.some((y) => y.uid === x.uid);
        const c = petCard(x, { tag: 'button', cls: sel ? 'sel' : '' });
        c.setAttribute('aria-pressed', String(sel));
        c.addEventListener('click', () => askPet(x));
        list.append(c);
      }
    }
  }

  function paintTrade(typing = false) {
    if (!T || T.done) return;
    const t = game.time;
    const bag = petBag(app);
    // an offered pet left the bag (released on another screen, a cloud restore...): offer again without it
    const have = new Set(bag.owned.map((x) => x.uid));
    if (myOffer().pets.some((x) => !have.has(x.uid))) {
      editMine((n) => (n.pets = n.pets.filter((x) => have.has(x.uid))));
      return paintTrade(typing);
    }
    // so did the seed in my hands (planted, dropped, bonked away)
    if (T.pending?.seed && T.pending.seed.sig !== seedSig(me.carrying)) {
      editMine((n) => (n.seed = null));
      return paintTrade(typing);
    }
    // our bag changed size: the host checks room with this
    if (bag.room !== T.sentRoom && !T.sendTimer) sendRoom();
    const o = myOffer();
    const a = theirOffer();
    lockPets([...new Set([...o.pets, ...T.mine.pets].map((x) => x.uid))]);
    const garden = game.gardens[me.slot].planters;
    // my side: live plants from my garden; their side: exactly what the host says they offer (or, with a bot,
    // what I'm asking it for while that's on its way). Cards are only rebuilt when the offer changes, so a
    // change-flash keeps playing.
    const mySig = o.planters.map((i) => (garden[i]?.plant ? garden[i].plant.uid + (garden[i].plant.growLeft > 0 ? 'g' : '') : 'x')).join(',') +
      '|' + o.pets.map((x) => x.uid).join() + '|' + (o.seed?.sig || '');
    if (mySig !== T.mySig) {
      T.mySig = mySig;
      paintSide(T.mySlots, T.myExtras, o, (i) => garden[i]?.plant || null, true);
    }
    const live = T.askPending ? botGarden() : null;
    const theirSig = (live ? 'a' + a.planters.join() : a.plants.map((d) => d.uid + (d.grown ? '' : 'g')).join(',')) + '|' + a.pets.map((x) => x.uid).join() + '|' + (a.seed?.sig || '');
    if (theirSig !== T.theirSig) {
      T.theirSig = theirSig;
      paintSide(T.theirSlots, T.theirExtras, a, live ? (i) => live[i]?.plant || null : (i, k) => a.plants[k] || null, false);
    }
    if (!typing && document.activeElement !== T.cashIn) T.cashIn.value = o.cash ? o.cash.toLocaleString('en-US') : '0';
    T.theirCash.textContent = money(a.cash);
    T.theirCash.parentElement.style.opacity = a.cash ? '1' : '.55';
    // ready states
    const locked = t < T.lockUntil;
    const nothing = offerEmpty(o) && offerEmpty(a);
    const plantsIn = (x) => x.planters.length + (x.seed ? 1 : 0);
    const needMe = plantsIn(a) - o.planters.length - freeIn(me);
    const needThem = plantsIn(o) - a.planters.length - freeIn(T.other);
    const theirRoom = T.bot ? Math.max(0, MAX_TEAM - T.other.pets.length) : T.petRoom[1];
    const needPetsMe = a.pets.length - o.pets.length - bag.room;
    const needPetsThem = theirRoom == null ? 0 : o.pets.length - a.pets.length - theirRoom;
    const blocked = nothing || needMe > 0 || needThem > 0 || needPetsMe > 0 || needPetsThem > 0 || !!T.pending || !!T.askPending;
    const confirming = t < T.confirmUntil && !T.readyMine;
    const rb = T.readyBtn;
    rb.classList.toggle('on', T.readyMine);
    rb.classList.toggle('locked', locked && !T.readyMine);
    rb.classList.toggle('ask', confirming);
    rb.style.setProperty('--lock', Math.max(0.05, T.lockUntil - t).toFixed(2) + 's');
    rb.disabled = !T.readyMine && (locked || blocked);
    const kb = pad() ? '' : '<kbd>Y</kbd>';
    const rbHtml = T.readyMine ? `<span class="bi">${ICON.check}</span><span>READY!</span>` : confirming ? '<span>Yes, give!</span>' : `<span>Ready?</span>${kb}`;
    if (rb._h !== rbHtml) rb.innerHTML = rb._h = rbHtml;
    T.mySide.classList.toggle('ready', T.readyMine);
    T.theirSide.classList.toggle('ready', T.readyTheirs);
    T.theirState.classList.toggle('on', T.readyTheirs);
    const tsHtml = T.readyTheirs ? `<span class="bi">${ICON.check}</span><span>READY!</span>` : '<span>Not ready</span>';
    if (T.theirState._h !== tsHtml) T.theirState.innerHTML = T.theirState._h = tsHtml;
    const changedNow = game.time < T.changedUntil;
    T.theirChanged.hidden = !changedNow;
    T.theirSide.classList.toggle('changed', changedNow);
    paintPicker(o, bag);
    // the status bar: countdown > news > problems > the bot's answer > pets to a bot > tips
    const bar = T.bar;
    let cls = '';
    let html = '';
    const note = T.note && t < T.note.until ? T.note : null;
    const said = T.said && t < T.said.until ? T.said : null;
    const name = esc(T.other.name);
    const byeBye = () => {
      const pets = o.pets.map((x) => esc(petLabel(x)));
      return `Bye bye, <b>${names(pets)}</b>! ${name} keeps ${pets.length > 1 ? 'these pets' : 'this pet'}.`;
    };
    if (T.countdownEndsAt > 0) {
      cls = 'count';
      html = `Trading in <b>${Math.max(1, Math.ceil(T.countdownEndsAt - t))}</b>`;
    } else if (confirming) {
      cls = 'warn';
      html = `${byeBye()} Press <b>Yes, give!</b> to say goodbye.`;
    } else if (note) {
      cls = note.cls;
      html = note.html;
    } else if (needMe > 0) {
      cls = 'bad';
      html = `You need <b>${needMe}</b> more free planter${needMe > 1 ? 's' : ''} for this. Offer more plants or unlock a planter.`;
    } else if (needThem > 0) {
      cls = 'bad';
      html = `${name}'s garden has no room for <b>${needThem}</b> more plant${needThem > 1 ? 's' : ''}.`;
    } else if (needPetsMe > 0) {
      cls = 'bad';
      html = 'Your pet bag is full! Release a pet in <b>My Pets</b> first.';
    } else if (needPetsThem > 0) {
      cls = 'bad';
      html = T.bot ? `${name} can only keep <b>${MAX_TEAM}</b> pets. Ask for one of theirs too!` : `${name}'s pet bag is full!`;
    } else if (said) {
      cls = 'say';
      html = `${(T.avaHtml ||= avatarEl(T.other.faceKey, 'sb-ava').outerHTML)}<span><b>${name}:</b> “${esc(said.text)}”</span>`;
    } else if (T.bot && o.pets.length) {
      cls = 'warn';
      html = byeBye();
    } else if (T.readyMine && !T.readyTheirs) {
      html = `Waiting for <b>${name}</b> to press Ready...`;
    } else if (nothing) {
      html = T.bot ? `Pick plants, pets or the seed in your hands, then ask <b>${name}</b> for something!`
        : 'Pick plants, pets, the seed in your hands or cash. Both press <b>Ready</b> to swap.';
    } else {
      html = 'Check both sides, then press <b>Ready</b>. Any change un-readies you both.';
    }
    if (bar.className !== 'st-bar ' + cls) bar.className = 'st-bar ' + cls;
    if (bar._h !== html) bar.innerHTML = `<span class="st-bar-t">${(bar._h = html)}</span>`;
  }

  const samePets = (x, y) => x.pets.length === y.pets.length && x.pets.every((p, i) => p.uid === y.pets[i].uid);

  function onUpdate(e) {
    if (!T || T.done) return;
    const iAmA = isMe(e.a);
    if (!iAmA && !isMe(e.b)) return;
    if (slotOf(iAmA ? e.b : e.a) !== T.other.slot) return;
    const mine = iAmA ? e.offerA : e.offerB;
    const theirs = iAmA ? e.offerB : e.offerA;
    for (const o of [mine, theirs]) {
      o.pets ||= [];
      o.seed ||= null;
    }
    const prev = T.theirs;
    T.mine = mine;
    T.readyMine = iAmA ? e.readyA : e.readyB;
    T.readyTheirs = iAmA ? e.readyB : e.readyA;
    T.countdownEndsAt = e.countdownEndsAt || 0;
    T.lockUntil = e.lockUntil || 0;
    T.rev = e.rev;
    T.petRoom = iAmA ? [e.petRoomA ?? null, e.petRoomB ?? null] : [e.petRoomB ?? null, e.petRoomA ?? null];
    // my edit made it to the host (or the host trimmed it): stop showing the local copy
    const p = T.pending;
    if (p && !T.sendTimer && p.cash === mine.cash && p.planters.join() === mine.planters.join() && samePets(p, mine) && !!p.seed === !!mine.seed) T.pending = null;
    else if (p && !T.sendTimer && performance.now() - T.pendingAt > 1500) T.pending = null;
    const q = T.askPending;
    if (q && !T.askTimer && q.planters.join() === theirs.planters.join() && samePets(q, theirs)) T.askPending = null;
    else if (q && !T.askTimer && performance.now() - T.askAt > 1500) T.askPending = null;
    T.theirs = theirs;
    const byThem = e.changedBy != null && slotOf(e.changedBy) === T.other.slot;
    const byMe = e.changedBy != null && isMe(e.changedBy);
    if (byThem && (e.reason === 'offer' || e.reason === 'changed')) {
      // anti-scam: shout about every change on their side (their very first offer is just news)
      const first = offerEmpty(prev);
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
      T.note = { cls: 'warn', html: 'Something left your offer (a plant was stolen or sold, or the seed was planted).', until: game.time + 4 };
    } else if (e.reason === 'failed') {
      T.note = { cls: 'bad', html: 'The swap didn\'t go through. Check both sides and press Ready again.', until: game.time + 4 };
      uiSound(app, 'error');
    } else if (e.reason === 'ready' && T.readyMine && T.readyTheirs) {
      uiSound(app, 'shopBell');
    }
    paintTrade();
    // flash what is new on their side
    if (byThem) {
      const old = new Set([...prev.plants.map((x) => String(x.uid)), ...prev.pets.map((x) => x.uid), prev.seed ? 'seed:' + prev.seed.sig : '']);
      for (const c of [...T.theirSlots.querySelectorAll('.spc'), ...T.theirExtras.querySelectorAll('.spc,.ptc')]) if (c.dataset.uid && !old.has(c.dataset.uid)) c.classList.add('flash', 'new');
    }
  }

  // "Trade done!": everything that moved, both ways
  function showDone(e) {
    if (!T) return;
    const iAmA = isMe(e.a);
    const [M, O] = iAmA ? ['A', 'B'] : ['B', 'A'];
    const side = (k) => ({
      plants: (e['plants' + k] || []).filter((d) => d && PLANT[d.speciesId]),
      seed: e['seed' + k] && PLANT[e['seed' + k].speciesId] ? e['seed' + k] : null,
      pets: (e['pets' + k] || []).filter((x) => x && PET[x.id]),
      cash: e['offer' + k]?.cash || 0,
    });
    const got = side(O), gave = side(M);
    const cards = (s, cls, sign) => [
      ...s.plants.map((d) => plantCard(d, { grown: !(d.growLeft > 0), cls })),
      s.seed ? seedCard(s.seed, { cls, label: 'Seedling' }) : null,
      ...s.pets.map((x) => petCard(x, { cls })),
      s.cash ? h('div', { class: 'st-done-cash ' + cls, text: sign + money(s.cash) }) : null,
    ].filter(Boolean);
    const gotCards = cards(got, '', '+');
    const gaveCards = cards(gave, 'mini', '');
    T.done = true;
    clearTimeout(T.sendTimer);
    clearTimeout(T.askTimer);
    lockPets([]);
    const body = T.sheet.body;
    body.textContent = '';
    const ok = noFocus(h('button', { class: 'btn btn-green btn-lg', type: 'button', onclick: () => endTrade() }, h('span', { class: 'bi', html: ICON.check }), h('span', { text: 'Awesome!' })));
    const bye = T.bot && gave.pets.length
      ? h('div', { class: 'st-done-bye', html: `Bye bye, <b>${esc(names(gave.pets.map((x) => petLabel(x))))}</b>! ${esc(T.other.name)} keeps ${gave.pets.length > 1 ? 'these pets' : 'this pet'}.` }) : null;
    const newPets = got.pets.length ? h('div', { class: 'st-done-s', text: `${got.pets.length > 1 ? 'Your new pets are' : 'Your new pet is'} in My Pets!` }) : null;
    body.append(h('div', { class: 'st-done' },
      h('div', { class: 'st-done-t', text: 'TRADE DONE!' }),
      gotCards.length ? h('div', { class: 'st-done-s', html: `You got from ${who(T.other)}:` }) : h('div', { class: 'st-done-s', html: `You gave ${who(T.other)} a present!` }),
      gotCards.length ? h('div', { class: 'st-done-got' }, gotCards) : null,
      newPets,
      gaveCards.length && gotCards.length ? h('div', { class: 'st-done-s', text: 'You gave:' }) : null,
      gaveCards.length ? h('div', { class: 'st-done-got gave' }, gaveCards) : null,
      bye,
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
      lastCancelAt = performance.now();
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
      if (e?.quick && e.phrase === 'trade' && e.player && e.player !== me && e.player.isPlayer && dist(e.player) < NEAR * 1.5) {
        pulseUntil = performance.now() + 3000;
        chipKey = null;
      }
      // the bot we're trading with answers in chat: show it in the trade window too
      if (T && !T.done && T.bot && e?.player === T.other && !e.quick && !e.typed && e.text) {
        T.said = { text: e.text, until: game.time + 6 };
        paintTrade();
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
      } else if (e.code === 'KeyY' && T && !T.done && sheet.kind === 'trade' && !isTyping(e) && !e.repeat && app.state === 'playing') {
        pressReady();
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

  // ---------------------------------------------------------------- gamepad
  // Playing: D-pad up = Trade / Accept, left = No thanks, right = Gift (the game only uses D-pad down, for Sell).
  // In a sheet (input is held there): the D-pad moves a focus ring, A presses, B backs out, Y = Ready, LB / RB tabs.
  const PAD_BUTTONS = [0, 1, 3, 4, 5, 12, 13, 14, 15];
  let padNow = PAD_BUTTONS.map(() => false); // this frame / last frame (swapped, never reallocated)
  let padWas = PAD_BUTTONS.map(() => false);
  let padSeen = false;
  let padFocus = null;
  function focusables() {
    if (!sheet) return [];
    return [...sheet.panel.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent && !b.classList.contains('busy'));
  }
  function movePad(dx, dy) {
    const list = focusables();
    if (!list.length) return;
    if (!padFocus || !list.includes(padFocus)) return setPadFocus(T?.readyBtn && list.includes(T.readyBtn) ? T.readyBtn : list[0]);
    const r0 = padFocus.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null;
    let bd = Infinity;
    for (const b of list) {
      if (b === padFocus) continue;
      const r = b.getBoundingClientRect();
      const vx = r.left + r.width / 2 - cx, vy = r.top + r.height / 2 - cy;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const score = along + Math.abs(vx * dy - vy * dx) * 2.5; // prefer straight ahead
      if (score < bd) {
        bd = score;
        best = b;
      }
    }
    if (best) setPadFocus(best);
  }
  function setPadFocus(b) {
    padFocus?.classList.remove('pad-focus');
    padFocus = b;
    if (!b) return;
    b.classList.add('pad-focus');
    b.scrollIntoView?.({ block: 'nearest' });
  }
  function pollPad() {
    const gp = app.input?.gamepad?.();
    if (!gp) {
      padSeen = false;
      return;
    }
    const swap = padWas;
    padWas = padNow;
    padNow = swap;
    for (let j = 0; j < PAD_BUTTONS.length; j++) padNow[j] = !!gp.buttons[PAD_BUTTONS[j]]?.pressed;
    const fresh = !padSeen; // a button already held when the pad shows up is not a press
    padSeen = true;
    if (fresh || app.state !== 'playing') return;
    const edge = (i) => padNow[PAD_BUTTONS.indexOf(i)] && !padWas[PAD_BUTTONS.indexOf(i)];
    if (sheet) {
      if (edge(12)) movePad(0, -1);
      else if (edge(13)) movePad(0, 1);
      else if (edge(14)) movePad(-1, 0);
      else if (edge(15)) movePad(1, 0);
      else if (edge(0) && padFocus?.isConnected && !padFocus.disabled) padFocus.click();
      else if (edge(1)) sheet.escape ? sheet.escape() : closeSheet();
      else if (edge(3) && T && !T.done) pressReady();
      else if ((edge(4) || edge(5)) && T && !T.done) {
        const ids = T.bot ? ['plants', 'pets', 'ask'] : ['plants', 'pets'];
        setTab(ids[(ids.indexOf(T.tab) + (edge(5) ? 1 : ids.length - 1)) % ids.length]);
      }
      return;
    }
    if (socialUi.wheel || app.menus?.isBlocking?.()) return;
    if (edge(12)) {
      if (invite) acceptInvite();
      else if (near && !outgoing) requestTrade(near);
    } else if (edge(14) && invite) declineInvite();
    else if (edge(15) && near) openGift(near);
  }

  // ---------------------------------------------------------------- per frame
  let acc = 1;
  let visible = true;
  let dockClear = -1;
  let scanAcc = 1;
  return {
    update(dt = 0) {
      if (!app.game || app.game !== game) return;
      // the host runs the trades (main.js ticks it too once integrated: update() is idempotent per game time)
      if (!app.online?.isClient) trades.update();
      const playing = app.state === 'playing';
      pollPad();
      // sheets hide under the pause menu and keep the player still while up
      if (sheet) {
        if (playing !== visible) {
          visible = playing;
          sheet.layer.style.display = playing ? '' : 'none';
        }
        if (playing && app.input.enabled) holdInput(true);
        sheet.tick?.();
      } else if (padFocus) setPadFocus(null);
      if (T?.done && game.time - T.doneAt > 8) endTrade(); // the celebration closes itself
      // an edit the host trimmed to what it already had never echoes back: stop waiting for it
      if (T && !T.done) {
        const stale = (copy, timer, at) => copy && !timer && performance.now() - at > 1500;
        const mine = stale(T.pending, T.sendTimer, T.pendingAt), asked = stale(T.askPending, T.askTimer, T.askAt);
        if (mine) T.pending = null;
        if (asked) T.askPending = null;
        if (mine || asked) paintTrade();
      }
      if (T && !T.done) {
        const t = game.time;
        if (T.countdownEndsAt > 0 || (T.note && t < T.note.until + 0.1) || t < T.lockUntil + 0.1 || t < T.changedUntil + 0.1 || t < T.confirmUntil + 0.1) paintTrade();
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
      let bd = Infinity;
      const learning = app.profile?.tutorial?.state === 'active'; // the tutorial has enough going on: no bot chips
      for (const p of people()) {
        if (learning && isBot(p)) continue;
        const d = dist(p);
        // the chip stays a little longer than it takes to show up (no flicker at the edge)
        if (p.invisible(game.time) || d >= (p === near ? NEAR + 2 : NEAR)) {
          botNearSince.delete(p.slot);
          continue;
        }
        if (isBot(p)) {
          // a bot running past (or carrying something, or seeing stars) doesn't count
          if (p.carrying || game.time < p.stunUntil) continue;
          if (!botNearSince.has(p.slot)) botNearSince.set(p.slot, game.time);
          if (p !== near && game.time - botNearSince.get(p.slot) < BOT_SETTLE) continue;
        }
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (outgoing && !best && dist(outgoing.to) < TRADE.requestRange + 4) best = outgoing.to;
      near = best;
      renderChip();
      syncDock();
      // phones: the chat log sits where the dock can be; publish how far up from the bottom of the screen the
      // dock really reaches (it rides higher while the carry pill shows) so the log can lift clear of it
      const clear = dock.isConnected && dock.offsetHeight ? Math.round(window.innerHeight - dock.getBoundingClientRect().top + 8) : 0;
      if (clear !== dockClear) {
        dockClear = clear;
        hudRoot.style.setProperty('--soc-dock-clear', clear + 'px');
        hudRoot.classList.toggle('soc-docked', clear > 0);
      }
    },
    dispose() {
      offs.forEach((off) => off());
      window.removeEventListener('keydown', onKey, true);
      if (T) {
        clearTimeout(T.sendTimer);
        clearTimeout(T.askTimer);
      }
      T = null;
      lockPets([]);
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
    /** tests: switch the trade window's picker tab ('plants' | 'pets' | 'ask') */
    tradeTab: (id) => setTab(id),
  };
}
