// Menus. Contract: createMenus(app) -> { showTitle(), showSelect(mode), showPause(), hidePause(), showEnd(ranking),
//   openShop(shop), closeShop(), hideAll(), isBlocking() }  (+ extras: openSettings(), openPhotoBooth(), openHowTo())
import { CHARACTERS, CHARACTER, DIFFICULTY, MATCH, PLANT } from '../config.js';
import { bus } from '../core/events.js';
import { settings, setSetting } from '../core/settings.js';
import { load, save, storageOK } from '../core/save.js';
import { h, esc, money, uiSound, reducedMotion } from './dom.js';
import { avatarEl } from './avatars.js';
import { ICON, LOGO_SPROUT } from './icons.js';
import { buildShop } from './shops.js';
import { buildSettings } from './settingsPanel.js';
import { buildPhotoBooth } from './photobooth.js';
import { buildHowTo } from './howto.js';
import { rarityColor } from '../view/gameView.js';

const DIFF_DESC = {
  chill: 'Best for your first game: the family goes easy on you.',
  normal: 'A real contest. Guard your garden!',
  chaos: 'Fast, sneaky and bonk-happy. Good luck!',
};

export function createMenus(app) {
  const layer = h('div', { class: 'menus' });
  app.root.appendChild(layer);
  let screen = null; // {name, el}
  const modals = []; // {wrap, close, kind}
  let shopModal = null;
  const sel = { charId: load('ui:lastChar', null), mode: 'endless', difficulty: settings.difficulty || 'normal' };

  // first gesture unlocks audio (browsers require it)
  const unlock = () => {
    try {
      app.audio?.unlock?.();
    } catch {
      /* optional */
    }
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });

  const click = () => uiSound(app, 'click');
  const btn = (label, cls, onclick, extra = {}) =>
    h('button', { class: 'btn ' + cls, type: 'button', ...extra, onclick: (e) => { click(); onclick(e); } }, ...(Array.isArray(label) ? label : [label]));
  const iconLabel = (icon, text) => [h('span', { class: 'bi', html: icon }), h('span', { text })];

  // Keyboard users get focus on the primary button; pointer users just get focus moved into the panel.
  let keyboardNav = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key.startsWith('Arrow')) keyboardNav = true;
  }, true);
  window.addEventListener('pointerdown', () => {
    keyboardNav = false;
  }, true);

  function focusFirst(el) {
    setTimeout(() => {
      if (!el.isConnected) return;
      const f = keyboardNav && (el.querySelector('[data-autofocus]') || el.querySelector('button:not([disabled]), input, [tabindex="0"]'));
      (f || el).focus?.({ preventScroll: true });
    }, 40);
  }

  function setScreen(name, ...children) {
    clearScreen();
    const el = h('div', { class: `scr scr-${name}`, tabindex: '-1' }, ...children);
    layer.appendChild(el);
    screen = { name, el };
    layer.classList.add('on');
    // world labels would show through the translucent screens and clutter them
    document.documentElement.classList.toggle('menu-screen', name !== 'title');
    focusFirst(el);
  }

  function clearScreen() {
    if (!screen) return;
    const old = screen.el;
    screen.dispose?.();
    screen = null;
    document.documentElement.classList.remove('menu-screen');
    old.classList.add('out');
    setTimeout(() => old.remove(), reducedMotion() ? 0 : 220);
    if (!modals.length) layer.classList.remove('on');
  }

  // ------------------------------------------------------------------ modals

  function openModal(content, { cls = '', label = '', onClose, kind } = {}) {
    const closeBtn = h('button', { class: 'modal-x', type: 'button', 'aria-label': 'Close', html: ICON.close });
    const panel = h('div', { class: 'modal-panel ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, closeBtn, content);
    const back = h('div', { class: 'modal-back' });
    const wrap = h('div', { class: 'modal' }, back, panel);
    layer.appendChild(wrap);
    layer.classList.add('on');
    const m = { wrap, kind, close: null, dispose: null };
    m.close = (silent) => {
      const i = modals.indexOf(m);
      if (i < 0) return;
      modals.splice(i, 1);
      m.dispose?.();
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), reducedMotion() ? 0 : 200);
      if (!modals.length && !screen) layer.classList.remove('on');
      if (!silent) onClose?.();
      const top = modals[modals.length - 1];
      focusFirst(top ? top.wrap : screen?.el || layer);
    };
    closeBtn.addEventListener('click', () => {
      click();
      m.close();
    });
    back.addEventListener('click', () => m.close());
    modals.push(m);
    focusFirst(panel);
    return m;
  }

  // Esc closes the top modal (and must not also resume/pause the game underneath)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modals.length) {
      // Esc steps back through the play flow
      if (screen?.name === 'select') showTitle();
      else if (screen?.name === 'mode') showSelect();
      return;
    }
    const top = modals[modals.length - 1];
    if (top.kind === 'shop') return; // main.js resumes the game, which closes the shop
    e.preventDefault();
    app.input?.take?.('pause');
    top.close();
  });

  const openSettings = () => {
    const s = buildSettings(app);
    const m = openModal(s.el, { cls: 'settings', label: 'Settings' });
    m.dispose = s.dispose;
  };
  const openPhotoBooth = () => {
    const pb = buildPhotoBooth(app);
    const m = openModal(pb.el, { cls: 'booth', label: 'Photo Booth' });
    m.dispose = pb.dispose;
  };
  // a big Done button at the bottom of long panels (the X is at the top, a long scroll away)
  const doneRow = (onDone) => h('div', { class: 'modal-done' }, btn(iconLabel(ICON.check, 'Done'), 'btn-green btn-lg', onDone));
  const openHowTo = () => {
    const body = buildHowTo();
    const m = openModal(body, { cls: 'howto', label: 'How to play' });
    body.appendChild(doneRow(() => m.close()));
  };

  // ------------------------------------------------------------------ title

  function logo() {
    const word = (t, cls = '') => `<span class="lw ${cls}" data-t="${t}"><i>${t}</i></span>`;
    return h('div', { class: 'logo', role: 'img', 'aria-label': 'Steal A Seed!' , html:
      `<div class="logo-row r1">${word('STEAL')}${word('A', 'lw-a')}</div>` +
      `<div class="logo-row r2">${word('SEED')}<span class="logo-bang">${word('!', 'lw-bang')}${LOGO_SPROUT}</span></div>` });
  }

  function continueTarget() {
    const saved = CHARACTERS.filter((c) => app.hasSave(c.id));
    if (!saved.length) return null;
    return saved.find((c) => c.id === sel.charId) || saved[0];
  }

  function startGame(o) {
    save('ui:lastChar', o.charId);
    sel.charId = o.charId;
    document.activeElement?.blur?.();
    app.startGame(o);
  }

  function showTitle() {
    closeAllModals();
    const cast = h('div', { class: 'cast' }, CHARACTERS.map((c, i) =>
      h('button', {
        class: 'cast-card', type: 'button', style: `--c:${c.color};--d:${i * 70}ms`, 'aria-label': `Play as ${c.name}, ${c.title}`,
        onclick: () => {
          click();
          sel.charId = c.id;
          showMode();
        },
      }, avatarEl(c.id, 'cc-ava'), h('span', { class: 'cc-name', text: c.name }), castTitle(c.title), h('span', { class: 'cc-tag', text: `"${c.tagline}"` }))));
    const cont = continueTarget();
    const actions = h('div', { class: 'title-actions' },
      h('div', { class: 'title-main' },
        btn(iconLabel(ICON.play, 'PLAY'), 'btn-green btn-xl', () => showSelect(), { 'data-autofocus': '' }),
        cont ? btn([avatarEl(cont.id, 'btn-ava'), h('span', { class: 'bl' }, h('small', { text: 'Continue as' }), h('span', { text: cont.name }))], 'btn-blue btn-xl btn-cont', () => {
          const s = load(`save:endless:${cont.id}`, null);
          startGame({ charId: cont.id, mode: 'endless', difficulty: s?.difficulty || settings.difficulty });
        }) : null),
      h('div', { class: 'title-small' },
        btn(iconLabel(ICON.gear, 'Settings'), 'btn-ghost', openSettings),
        btn(iconLabel(ICON.camera, 'Photo Booth'), 'btn-ghost', openPhotoBooth),
        btn(iconLabel(ICON.help, 'How to Play'), 'btn-ghost', openHowTo)));
    setScreen('title',
      h('div', { class: 'title-hero' }, logo(), h('div', { class: 'edition' }, h('span', { text: 'Family Edition' }))),
      cast, actions,
      h('div', { class: 'title-foot', text: 'Starring Dorian, Esther, Maddie & Micah' }));
  }

  // ------------------------------------------------------------------ play flow

  function head(title, step, onBack) {
    return h('div', { class: 'scr-head' },
      h('button', { class: 'btn btn-round btn-ghost', type: 'button', 'aria-label': 'Back', html: ICON.back, onclick: () => { click(); onBack(); } }),
      h('h2', { text: title }),
      h('div', { class: 'steps', 'aria-label': `Step ${step} of 2` }, h('i', { class: step >= 1 ? 'on' : '' }), h('i', { class: step >= 2 ? 'on' : '' })));
  }

  function showSelect(mode) {
    if (mode === 'endless' || mode === 'showdown') sel.mode = mode;
    const grid = h('div', { class: 'pick-grid' }, CHARACTERS.map((c, i) => {
      const saved = app.hasSave(c.id);
      return h('button', {
        class: 'pick' + (sel.charId === c.id ? ' last' : ''), type: 'button', style: `--c:${c.color};--d:${i * 60}ms`,
        'aria-label': `${c.name}, ${c.title}${saved ? ', saved progress' : ''}`,
        onclick: () => {
          click();
          sel.charId = c.id;
          showMode();
        },
      },
      saved ? h('span', { class: 'saved', html: `${ICON.check}<span>Saved progress</span>` }) : null,
      avatarEl(c.id, 'pk-ava'), h('span', { class: 'pk-name', text: c.name }), h('span', { class: 'pk-title', text: c.title }), h('span', { class: 'pk-tag', text: `"${c.tagline}"` }));
    }));
    setScreen('select', h('div', { class: 'flow' }, head('Who are you?', 1, showTitle), grid,
      h('p', { class: 'flow-hint', text: 'The other three become sneaky rivals with their own personalities.' })));
  }

  function showMode() {
    const c = CHARACTER[sel.charId] || CHARACTERS[0];
    sel.charId = c.id;
    const body = h('div', { class: 'flow' });
    const confirm = h('div', { class: 'confirm', hidden: true });
    const startRow = h('div', { class: 'start-row' });
    const diffDesc = h('div', { class: 'diff-desc' });
    const modeCards = [
      ['endless', ICON.infinity, 'Endless', `Farm, steal and grow forever. ${storageOK ? 'Saves automatically on this device.' : "This browser can't save progress."}`],
      ['showdown', ICON.trophy, 'Family Showdown', `${Math.round(MATCH.showdownSeconds / 60)}-minute race. Highest net worth wins the crown!`],
    ].map(([id, icon, name, desc]) => h('button', {
      class: 'mode-card', type: 'button', role: 'radio', 'data-mode': id,
      onclick: () => {
        click();
        sel.mode = id;
        paint();
      },
    }, h('span', { class: 'mc-ic', html: icon }), h('span', { class: 'mc-name', text: name }), h('span', { class: 'mc-desc', text: desc })));
    const segs = Object.entries(DIFFICULTY).map(([id, d]) => h('button', {
      class: 'seg-b', type: 'button', role: 'radio', 'data-diff': id,
      onclick: () => {
        click();
        sel.difficulty = id;
        setSetting('difficulty', id);
        paint();
      },
    }, d.name));

    function paint() {
      modeCards.forEach((b) => {
        const on = b.dataset.mode === sel.mode;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      segs.forEach((b) => {
        const on = b.dataset.diff === sel.difficulty;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      diffDesc.textContent = DIFF_DESC[sel.difficulty] || '';
      confirm.hidden = true;
      startRow.textContent = '';
      const saved = sel.mode === 'endless' && app.hasSave(c.id);
      if (saved) {
        const s = load(`save:endless:${c.id}`, null);
        const cash = s?.players?.find((p) => p.id === c.id)?.cash;
        startRow.append(
          btn('Start fresh', 'btn-grey', () => {
            confirm.hidden = false;
            confirm.querySelector('button')?.focus();
          }),
          btn([h('span', { class: 'bi', html: ICON.play }), h('span', { text: 'Continue' }), cash != null ? h('small', { text: money(cash) }) : null], 'btn-green btn-lg', () =>
            startGame({ charId: c.id, mode: 'endless', difficulty: sel.difficulty }), { 'data-autofocus': '' }));
      } else {
        startRow.append(btn(iconLabel(ICON.play, sel.mode === 'showdown' ? 'Start Showdown' : 'Start'), 'btn-green btn-lg', () =>
          startGame({ charId: c.id, mode: sel.mode, difficulty: sel.difficulty, fresh: true }), { 'data-autofocus': '' }));
      }
    }

    confirm.append(
      h('span', { text: `This erases ${c.name}'s saved garden. Sure?` }),
      btn('Yes, start fresh', 'btn-red btn-sm', () => startGame({ charId: c.id, mode: 'endless', difficulty: sel.difficulty, fresh: true })),
      btn('Cancel', 'btn-grey btn-sm', () => {
        confirm.hidden = true;
      }));

    body.append(
      head('Pick a mode', 2, showSelect),
      h('div', { class: 'who-chip', style: `--c:${c.color}` }, avatarEl(c.id, 'wc-ava'), h('span', {}, 'Playing as ', h('b', { text: c.name })),
        h('button', { class: 'link', type: 'button', text: 'Change', onclick: () => { click(); showSelect(); } })),
      h('div', { class: 'mode-grid', role: 'radiogroup', 'aria-label': 'Game mode' }, modeCards),
      h('div', { class: 'diff' }, h('div', { class: 'diff-label', text: 'Difficulty' }), h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Difficulty' }, segs), diffDesc),
      startRow, confirm);
    paint();
    setScreen('mode', body);
  }

  // ------------------------------------------------------------------ pause

  function showPause() {
    closeAllModals();
    const g = app.game;
    const me = app.human;
    let meBox = null;
    if (g && me) {
      const rank = g.ranking().indexOf(me) + 1;
      meBox = h('div', { class: 'pause-me', style: `--c:${me.char.color}` }, avatarEl(me.id, 'pm-ava'),
        h('div', {}, h('b', { text: me.name }), h('span', { class: 'cash', text: money(me.cash) }), h('span', { class: 'pm-rank', text: `#${rank} of ${g.players.length} in net worth` })));
    }
    const note = g?.match ? 'Quitting ends this Showdown.' : storageOK ? 'Your garden saves automatically on this device.' : "This browser can't save progress.";
    const panel = h('div', { class: 'panel pause-panel' },
      h('h2', { class: 'pp-title', text: 'Paused' }),
      meBox,
      h('div', { class: 'pause-btns' },
        btn(iconLabel(ICON.play, 'Resume'), 'btn-green btn-lg', () => app.resume(), { 'data-autofocus': '' }),
        btn(iconLabel(ICON.gear, 'Settings'), 'btn-blue', openSettings),
        btn(iconLabel(ICON.camera, 'Photo Booth'), 'btn-blue', openPhotoBooth),
        btn(iconLabel(ICON.help, 'How to Play'), 'btn-blue', openHowTo),
        btn(iconLabel(ICON.home, g?.match || !storageOK ? 'Quit to Title' : 'Save & Quit'), 'btn-red', () => app.quitToTitle())),
      h('p', { class: 'pause-note', text: note }));
    setScreen('pause', panel);
  }

  function hidePause() {
    if (screen?.name === 'pause') {
      closeAllModals(true);
      clearScreen();
    }
  }

  // ------------------------------------------------------------------ shops

  function openShop(kind) {
    if (!app.game || !app.human) return;
    if (shopModal) shopModal.close(true);
    app.state = 'shop';
    app.input.enabled = false;
    app.input.reset();
    app.touch?.setVisible(false);
    bus.emit('app:state', { state: 'shop' });
    const shop = buildShop(app, kind, () => shopModal?.close());
    shop.el.appendChild(doneRow(() => shopModal?.close()));
    const m = openModal(shop.el, {
      cls: 'shop shop-' + kind, label: shop.title, kind: 'shop',
      onClose: () => {
        shopModal = null;
        app.input.enabled = true;
        if (app.state === 'shop') app.resume();
      },
    });
    m.dispose = shop.dispose;
    shopModal = m;
  }

  function closeShop() {
    const m = shopModal;
    shopModal = null;
    if (m) m.close(true);
    if (app.input) app.input.enabled = true;
  }

  // ------------------------------------------------------------------ end of a Showdown
  // main.js stages the real 3D podium (top three on gold/silver/bronze blocks, the winner dancing) at the
  // spawn pad, so this screen keeps the middle clear: a title banner up top and a lower-third results card.

  function showEnd(ranking) {
    closeAllModals(true);
    shopModal = null;
    const g = app.game;
    const me = app.human;
    const list = (ranking || []).map((r) => (r.player ? r : { player: r, netWorth: g?.netWorth?.get(r) || 0 }));
    if (!list.length) return;
    const winner = list[0].player;
    const myRank = me ? list.findIndex((r) => r.player === me) + 1 : 0;
    const won = winner === me;
    const title = won ? 'YOU WIN!' : myRank ? `${ordinal(myRank)} place!` : `${winner.name.toUpperCase()} WINS!`;
    const sub = won ? 'The crown is yours!' : `${winner.name} takes the crown!`;
    const MEDAL = ['gold', 'silver', 'bronze'];
    const chips = h('div', { class: 'end-chips', role: 'list' }, list.map((r, i) =>
      h('div', { class: `end-chip ${MEDAL[i] || 'plain'}${r.player === me ? ' me' : ''}`, role: 'listitem', style: `--c:${r.player.char.color};--d:${250 + i * 90}ms` },
        h('b', { class: 'ec-rank', text: String(i + 1) }),
        avatarEl(r.player.id, 'ec-ava'),
        h('span', { class: 'ec-copy' }, h('span', { class: 'ec-name', text: r.player.name }), h('span', { class: 'ec-val', text: money(r.netWorth) })),
        i === 0 ? h('span', { class: 'ec-crown', html: ICON.crown }) : null)));
    let you = null;
    if (me && myRank) {
      const best = bestPlant(g, me);
      you = h('div', { class: 'end-you', style: `--c:${me.char.color}` },
        h('span', { class: 'ey-k', text: 'Your result' }),
        h('span', { class: 'ey-v' }, h('b', { text: `#${myRank}` }), ' of ', String(list.length)),
        h('span', { class: 'ey-v ey-net' }, 'Net worth ', h('b', { class: 'cash', text: money(list[myRank - 1].netWorth) })),
        h('span', { class: 'ey-v ey-best', html: best
          ? `<span class="ey-bl">Best plant </span><b class="${best.secret ? 'secret' : ''}" style="--rc:${best.color}">${esc(best.name)}</b> <em>${money(best.income)}/s</em>`
          : 'No plants yet' }));
    }
    const awardList = computeAwards(list.map((r) => r.player));
    const awards = awardList.length ? h('div', { class: 'awards' }, awardList.map((a, i) =>
      h('div', { class: 'award', style: `--c:${a.player.char.color};--d:${700 + i * 120}ms` },
        h('span', { class: 'aw-pic' }, avatarEl(a.player.id, 'aw-ava'), h('span', { class: 'aw-ic', html: a.icon })),
        h('span', { class: 'aw-copy' },
          h('span', { class: 'aw-title', text: a.title }),
          h('span', { class: 'aw-name' }, h('b', { text: a.player.name }), h('span', { class: 'aw-stat', text: ` · ${a.stat}` })))))) : null;
    // Short phones show the awards as a one-line ticker (CSS shows only the .on award); tap to skip ahead.
    let spin = 0;
    if (awards && awardList.length > 1) {
      const els = [...awards.children];
      let k = 0;
      els[0].classList.add('on');
      const next = () => {
        els[k].classList.remove('on');
        k = (k + 1) % els.length;
        els[k].classList.add('on');
      };
      spin = setInterval(next, 2600);
      awards.addEventListener('click', () => {
        clearInterval(spin);
        next();
        spin = setInterval(next, 2600);
      });
    } else if (awards) awards.firstChild.classList.add('on');
    const confetti = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    if (!reducedMotion()) {
      const colors = ['#ffd23f', '#ff4f9a', '#3d9bff', '#4cd964', '#9b5cff', '#1ec8a5', '#ff7a3d'];
      for (let i = 0; i < (won ? 70 : 36); i++) {
        confetti.appendChild(h('i', {
          style: `left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};--r:${(Math.random() * 720 - 360).toFixed(0)}deg;` +
            `--x:${(Math.random() * 120 - 60).toFixed(0)}px;animation-delay:${(Math.random() * 2.5).toFixed(2)}s;animation-duration:${(2.6 + Math.random() * 2.2).toFixed(2)}s;` +
            `width:${6 + Math.round(Math.random() * 6)}px;height:${10 + Math.round(Math.random() * 8)}px`,
        }));
      }
    }
    const again = () => {
      if (!me) return app.quitToTitle();
      startGame({ charId: me.id, mode: g?.mode || 'showdown', difficulty: g?.difficultyId || settings.difficulty, fresh: true });
    };
    setScreen('end', confetti,
      h('div', { class: 'end-top' + (won ? ' win' : '') },
        h('div', { class: 'end-kicker', html: `${ICON.trophy}<span>Family Showdown</span>` }),
        h('h1', { class: 'end-title', text: title }),
        h('div', { class: 'end-sub' }, won ? null : avatarEl(winner.id, 'es-ava'), h('span', { text: sub }))),
      h('div', { class: 'end-card' },
        chips,
        you,
        awards,
        h('div', { class: 'end-actions' },
          btn(iconLabel(ICON.reset, 'Play Again'), 'btn-green btn-lg', again, { 'data-autofocus': '' }),
          btn(iconLabel(ICON.home, 'Title'), 'btn-blue btn-lg', () => app.quitToTitle()))));
    if (spin) screen.dispose = () => clearInterval(spin);
  }

  function closeAllModals(silent = true) {
    while (modals.length) modals[modals.length - 1].close(silent);
    shopModal = null;
  }

  function hideAll() {
    closeAllModals(true);
    clearScreen();
    layer.classList.remove('on');
    document.activeElement?.blur?.();
  }

  return {
    showTitle,
    showSelect,
    showMode,
    showPause,
    hidePause,
    showEnd,
    openShop,
    closeShop,
    hideAll,
    openSettings,
    openPhotoBooth,
    openHowTo,
    isBlocking: () => !!screen || modals.length > 0,
    get screen() {
      return screen?.name || null;
    },
  };
}

// "The Sneaky Thief": the compact phone cards drop the "The " (CSS hides .cc-the) to keep the chip on one line.
function castTitle(title) {
  const m = /^(the )(.+)$/i.exec(title);
  return h('span', { class: 'cc-title' }, m ? [h('span', { class: 'cc-the', text: m[1] }), m[2]] : title);
}

const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

// The best-paying plant in a player's garden at the final whistle.
function bestPlant(game, p) {
  let best = null;
  for (const pl of game?.gardens?.[p.slot]?.planters || []) {
    if (!pl.plant) continue;
    const income = game.plantIncome(pl.plant, p);
    const rarity = PLANT[pl.plant.speciesId].rarity;
    if (!best || income > best.income) best = { income, name: game.plantName(pl.plant.speciesId, pl.plant.mutation), color: rarityColor(rarity), secret: rarity === 'secret' };
  }
  return best;
}

// Up to four fun awards. Someone without an award yet gets the next one if they did at least a
// quarter as well as the leader, so one runaway leader can't sweep the lot (two awards at most).
function computeAwards(players) {
  const defs = [
    { key: 'steals', title: 'Master Thief', icon: ICON.eye, unit: (n) => `${n} steal${n === 1 ? '' : 's'}` },
    { key: 'planted', title: 'Green Thumb', icon: ICON.sprout, unit: (n) => `${n} planted` },
    { key: 'bonks', title: 'Bonk Champion', icon: ICON.target, unit: (n) => `${n} bonk${n === 1 ? '' : 's'}` },
    { key: 'collected', title: 'Money Bags', icon: ICON.coin, unit: (n) => `${money(n)} collected` },
  ];
  const count = new Map(players.map((p) => [p, 0]));
  const out = [];
  for (const d of defs) {
    const ranked = players.filter((p) => (p.stats[d.key] || 0) > 0).sort((a, b) => (b.stats[d.key] || 0) - (a.stats[d.key] || 0));
    const top = ranked[0]?.stats[d.key] || 0;
    const pick = ranked.find((p) => count.get(p) === 0 && p.stats[d.key] >= top * 0.25) || ranked.find((p) => count.get(p) < 2);
    if (!pick) continue;
    count.set(pick, count.get(pick) + 1);
    out.push({ title: d.title, icon: d.icon, player: pick, stat: d.unit(pick.stats[d.key]) });
  }
  return out;
}
