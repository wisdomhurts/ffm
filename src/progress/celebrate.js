// The collection finale (Family Four 4/4): a full-screen moment modelled on the pet hatch. The four family
// faces with their Secret plants spin in a ring and slow down, then the Family Crown pops up in the middle with
// rays, confetti and the rewards (stars, cash, the crown). "Wear it!" puts the crown on and opens the Wardrobe.
// Tap or press a key to hurry it along; reduced motion shows the end straight away.
//   celebrateCollection(app, {collection, stars, cash, banked}) -> void
// Celebrations queue, and wait for a calm moment in a game: not while you carry a seed or plant (you may be
// running from a monster), not over a shop, menu or gift/trade window, not over a pet hatch. A solo game pauses
// underneath.
import { h, esc, reducedMotion } from '../ui/dom.js';
import { avatarEl } from '../ui/avatars.js';
import { plantIcon } from '../social/plantIcon.js';
import { getProfile, updateProfile } from '../core/profiles.js';
import { sanitizeLook, HAT_BY_ID } from '../characters/cosmetics.js';
import { openWardrobe } from '../ui/wardrobe.js';
import { CHARACTER } from '../config.js';
import { socialUi } from '../social/uiState.js';
import { glyph } from './art.js';
import { cashText } from './catalog.js';

const queue = [];
let current = null;
let waitTimer = 0;

// timeline (seconds): the ring spins in, slows, the crown appears, then the card and buttons
const T_CROWN = 2.2, T_CARD = 2.7;
const CONFETTI = ['#2f80ed', '#ff4f9a', '#9b5cff', '#1ec8a5', '#ffd23f', '#ffffff', '#ffc93c'];

const play = (app, name, opts) => {
  try {
    app.audio?.play?.(name, opts);
  } catch {
    /* sound is optional */
  }
};

export function celebrateCollection(app, info) {
  if (!info?.collection || typeof document === 'undefined') return;
  queue.push(info);
  pump(app);
}

/** True while a celebration is on screen. */
export const isCelebrating = () => !!current;

function busy(app) {
  if (document.querySelector('.pet-hatch')) return true;
  if (app.state !== 'playing') return false;
  return !!app.human?.carrying || socialUi.sheet || !!app.menus?.isBlocking?.();
}

function pump(app) {
  if (current || !queue.length) return;
  clearTimeout(waitTimer);
  if (busy(app)) {
    waitTimer = setTimeout(() => pump(app), 400);
    return;
  }
  current = run(app, queue.shift(), () => {
    current = null;
    pump(app);
  });
}

// A big golden crown with a gem per family member (their colours, in the collection's order).
function crownSvg(gems) {
  const g = gems.slice(0, 4);
  while (g.length < 4) g.push('#ff4d6d');
  const gem = (x, y, c, r = 7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#10163a" stroke-width="3"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff" opacity=".75"/>`;
  return `<svg viewBox="0 0 160 124" aria-hidden="true" focusable="false">
    <defs><linearGradient id="pgcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#ffc93c"/><stop offset="1" stop-color="#e58f00"/></linearGradient></defs>
    <path d="M14 42 L42 66 L58 22 L80 58 L102 22 L118 66 L146 42 L134 110 H26 Z" fill="url(#pgcg)" stroke="#10163a" stroke-width="5" stroke-linejoin="round"/>
    <path d="M28 92 H132" stroke="#c97800" stroke-width="4"/><path d="M27 102 H133" stroke="#fff3a0" stroke-width="3" opacity=".7"/>
    <path d="M40 74 L46 50" stroke="#fffbe0" stroke-width="5" stroke-linecap="round" opacity=".8"/>
    ${gem(44, 98, g[0])}${gem(68, 98, g[1])}${gem(92, 98, g[2])}${gem(116, 98, g[3])}
    ${gem(14, 42, '#ffffff', 6)}${gem(58, 22, '#ffffff', 6)}${gem(102, 22, '#ffffff', 6)}${gem(146, 42, '#ffffff', 6)}
    ${gem(80, 58, '#ffd23f', 6)}
  </svg>`;
}

function spawnConfetti(host) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;background:${CONFETTI[i % CONFETTI.length]};--r:${(Math.random() * 720 - 360).toFixed(0)}deg;` +
      `--x:${(Math.random() * 140 - 70).toFixed(0)}px;animation-delay:${(Math.random() * 0.9).toFixed(2)}s;animation-duration:${(2.4 + Math.random() * 1.8).toFixed(2)}s;` +
      `width:${6 + Math.round(Math.random() * 6)}px;height:${10 + Math.round(Math.random() * 8)}px`;
    frag.appendChild(c);
  }
  host.appendChild(frag);
}

function run(app, info, done) {
  const col = info.collection;
  const quick = reducedMotion();
  const items = col.items.slice(0, 8);
  const gems = items.map((it) => CHARACTER[it.family]?.color || '#ffd23f');
  const hat = HAT_BY_ID[col.hat] || null;

  // ---------------------------------------------------------------- DOM
  const ring = h('div', { class: 'pgc-ring' });
  items.forEach((it, i) => {
    const a = (i / items.length) * 360;
    const slot = h('div', { class: 'pgc-slot', style: `--a:${a}deg;--c:${CHARACTER[it.family]?.color || '#ffd23f'};--i:${i}` },
      h('div', { class: 'pgc-up' },
        h('span', { class: 'pgc-plant', html: plantIcon(it.id) }),
        it.family ? avatarEl(it.family, 'pgc-ava') : null,
        h('span', { class: 'pgc-who', text: CHARACTER[it.family]?.name || it.name })));
    ring.appendChild(slot);
  });
  const crown = h('div', { class: 'pgc-crown', html: crownSvg(gems) });
  const center = h('div', { class: 'pgc-center' }, h('div', { class: 'pgc-halo' }), ring, crown);
  const chips = [];
  if (info.stars) chips.push(`<span class="pg-chipv">${glyph('star')}+${info.stars | 0}</span>`);
  if (info.cash) chips.push(`<span class="pg-chipv cash">+${esc(cashText(info.cash))}</span>`);
  if (hat) chips.push(`<span class="pg-chipv hat">${glyph('crown4')}${esc(hat.name)}</span>`);
  const note = info.cash && info.banked ? 'The cash is waiting for your next Endless game.' : 'Find it in the Wardrobe under Hats.';
  const wearBtn = hat ? h('button', { class: 'btn btn-gold btn-lg pgc-wear', type: 'button', html: `<span class="bi">${glyph('crown4')}</span><span>Wear it!</span>` }) : null;
  const okBtn = h('button', { class: 'btn btn-green btn-lg pgc-ok', type: 'button', text: 'Awesome!' });
  const card = h('div', { class: 'pgc-card', 'aria-live': 'polite' },
    h('div', { class: 'pgc-title', text: `${col.name}!` }),
    h('div', { class: 'pgc-sub', text: hat ? `You collected all ${items.length}! The ${hat.name} is yours.` : `You collected all ${items.length}!` }),
    h('div', { class: 'pgc-chips', html: chips.join('') }),
    h('div', { class: 'pgc-note', text: note }),
    h('div', { class: 'pgc-btns' }, wearBtn, okBtn));
  const confetti = h('div', { class: 'pgc-confetti' });
  const wrap = h('div', { class: 'pg-cel', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${col.name} complete`, tabindex: '-1' },
    h('div', { class: 'pgc-bg' }), h('div', { class: 'pgc-rays' }),
    h('div', { class: 'pgc-top' }, h('span', { class: 'pgc-kicker', text: `${col.name} ${items.length}/${items.length}` })),
    center, card, confetti, h('div', { class: 'pgc-hint', text: 'Tap to skip' }));
  const host = app.root || document.body;
  host.appendChild(wrap);
  host.classList.add('pg-celebrating'); // toasts wait underneath (styles.js hides them)
  requestAnimationFrame(() => wrap.classList.add('pgc-in'));
  wrap.focus({ preventScroll: true });

  // the player stands still (a solo game waits) while this is up
  const inGame = app.state === 'playing';
  let pausedGame = false;
  if (inGame) {
    if (app.input) {
      app.input.enabled = false;
      app.input.reset?.();
    }
    app.touch?.setVisible?.(false);
    if (app.game && !app.online?.room && !app.game.paused) {
      app.game.paused = true;
      pausedGame = true;
    }
  }

  // ---------------------------------------------------------------- timeline
  let closed = false;
  const timers = [];
  const at = (s, fn) => timers.push(setTimeout(fn, quick ? 0 : s * 1000));
  let revealed = false;
  function reveal() {
    if (revealed || closed) return;
    revealed = true;
    wrap.classList.add('pgc-reveal');
    play(app, 'confetti', { important: true });
    play(app, 'secret', { important: true });
    if (!quick) spawnConfetti(confetti);
  }
  let carded = false;
  function showCard() {
    if (carded || closed) return;
    carded = true;
    wrap.classList.add('pgc-done');
    (wearBtn || okBtn).focus({ preventScroll: true });
  }
  if (quick) wrap.classList.add('pgc-still');
  play(app, 'whoosh', { vol: 0.8 });
  at(T_CROWN, reveal);
  at(T_CARD, showCard);
  const skip = () => {
    reveal();
    showCard();
  };

  // ---------------------------------------------------------------- input
  function close(then) {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', onKey, true);
    wrap.classList.add('pgc-out');
    host.classList.remove('pg-celebrating');
    if (inGame) {
      // back to whatever holds the player now (a pause menu or a gift/trade window opened meanwhile keeps them still)
      if (app.input) app.input.enabled = app.state === 'playing' && !socialUi.sheet;
      if (app.state === 'playing' && !socialUi.sheet) app.touch?.setVisible?.(true);
      if (pausedGame && app.game && app.state === 'playing') app.game.paused = false; // (resume() unpauses a menu)
    }
    setTimeout(() => {
      wrap.remove();
      then?.();
      done();
    }, quick ? 0 : 220);
  }
  function wear() {
    play(app, 'unlock', { important: true });
    const p = app.profile && getProfile(app.profile.id);
    if (p && hat) updateProfile(p.id, (x) => (x.look = sanitizeLook({ ...x.look, hat: hat.id }, x.base)));
    close(() => {
      try {
        if (app.state === 'playing') app.pause?.();
        openWardrobe(app, { tab: 'hats' });
      } catch (e) {
        console.warn('[progress] wardrobe failed to open', e);
      }
    });
  }
  function onKey(e) {
    if (closed) return;
    const k = e.key;
    if (k === 'Escape' || k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      e.stopPropagation();
      if (!carded) skip();
      else if (k === 'Escape') {
        play(app, 'click');
        close();
      } else if (document.activeElement?.closest?.('.pgc-btns')) document.activeElement.click();
      else close();
    } else if (k === 'Tab' && carded) {
      e.preventDefault();
      const f = [wearBtn, okBtn].filter(Boolean);
      f[(f.indexOf(document.activeElement) + 1) % f.length]?.focus();
    }
  }
  window.addEventListener('keydown', onKey, true);
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    skip();
  });
  wearBtn?.addEventListener('click', wear);
  okBtn.addEventListener('click', () => {
    play(app, 'click');
    close();
  });
  return { close };
}
