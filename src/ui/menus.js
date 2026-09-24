// Menus. Contract: createMenus(app) -> { showTitle(), showSelect(mode), showPause(), hidePause(), showEnd(ranking),
//   openShop(shop), closeShop(), hideAll(), isBlocking() }  (+ extras: openSettings(), openPhotoBooth(), openHowTo())
import { CHARACTERS, CHARACTER, DIFFICULTY, MATCH } from '../config.js';
import { bus } from '../core/events.js';
import { settings, setSetting } from '../core/settings.js';
import { load, save } from '../core/save.js';
import { h, money, uiSound, reducedMotion } from './dom.js';
import { avatarEl } from './avatars.js';
import { ICON, LOGO_SPROUT } from './icons.js';
import { buildShop } from './shops.js';
import { buildSettings } from './settingsPanel.js';
import { buildPhotoBooth } from './photobooth.js';
import { buildHowTo } from './howto.js';

const DIFF_DESC = {
  chill: 'Relaxed family: they steal less and run a bit slower.',
  normal: 'A fair fight. Guard your garden!',
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
  const openHowTo = () => openModal(buildHowTo(), { cls: 'howto', label: 'How to play' });

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
      }, avatarEl(c.id, 'cc-ava'), h('span', { class: 'cc-name', text: c.name }), h('span', { class: 'cc-title', text: c.title }), h('span', { class: 'cc-tag', text: `"${c.tagline}"` }))));
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
      ['endless', ICON.infinity, 'Endless', 'Farm, steal and grow forever. Saves automatically on this device.'],
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
    const note = g?.match ? 'Quitting ends this Showdown.' : 'Your garden saves automatically on this device.';
    const panel = h('div', { class: 'panel pause-panel' },
      h('h2', { class: 'pp-title', text: 'Paused' }),
      meBox,
      h('div', { class: 'pause-btns' },
        btn(iconLabel(ICON.play, 'Resume'), 'btn-green btn-lg', () => app.resume(), { 'data-autofocus': '' }),
        btn(iconLabel(ICON.gear, 'Settings'), 'btn-blue', openSettings),
        btn(iconLabel(ICON.camera, 'Photo Booth'), 'btn-blue', openPhotoBooth),
        btn(iconLabel(ICON.help, 'How to Play'), 'btn-blue', openHowTo),
        btn(iconLabel(ICON.home, g?.match ? 'Quit to Title' : 'Save & Quit'), 'btn-red', () => app.quitToTitle())),
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

  function showEnd(ranking) {
    closeAllModals(true);
    shopModal = null;
    const g = app.game;
    const me = app.human;
    const list = (ranking || []).map((r) => (r.player ? r : { player: r, netWorth: g?.netWorth?.get(r) || 0 }));
    if (!list.length) return;
    const winner = list[0].player;
    const title = winner === me ? 'YOU WIN!' : `${winner.name.toUpperCase()} WINS!`;
    const place = (r, i) => h('div', { class: `pod pod-${i + 1}${r.player === me ? ' me' : ''}`, style: `--c:${r.player.char.color};--d:${[300, 0, 500][i] ?? 600}ms` },
      i === 0 ? h('span', { class: 'pod-crown', html: ICON.crown }) : null,
      avatarEl(r.player.id, 'pod-ava'),
      h('span', { class: 'pod-name', text: r.player.name }),
      h('span', { class: 'pod-val', text: money(r.netWorth) }),
      h('div', { class: 'pod-block' }, h('span', { text: String(i + 1) })));
    const podium = h('div', { class: 'podium' }, [1, 0, 2].filter((i) => list[i]).map((i) => place(list[i], i)));
    const rest = list.slice(3).map((r, i) => h('div', { class: 'end-rest' + (r.player === me ? ' me' : ''), style: `--c:${r.player.char.color}` },
      h('b', { text: `${i + 4}` }), avatarEl(r.player.id, 'er-ava'), h('span', { text: r.player.name }), h('span', { class: 'cash', text: money(r.netWorth) })));
    const awards = h('div', { class: 'awards' }, computeAwards(list.map((r) => r.player)).map((a, i) =>
      h('div', { class: 'award', style: `--c:${a.player.char.color};--d:${900 + i * 120}ms` },
        h('span', { class: 'aw-pic' }, avatarEl(a.player.id, 'aw-ava'), h('span', { class: 'aw-ic', html: a.icon })),
        h('span', { class: 'aw-copy' },
          h('span', { class: 'aw-title', text: a.title }),
          h('span', { class: 'aw-name', text: a.player.name }),
          h('span', { class: 'aw-stat', text: a.stat })))));
    const confetti = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    if (!reducedMotion()) {
      const colors = ['#ffd23f', '#ff4f9a', '#3d9bff', '#4cd964', '#9b5cff', '#1ec8a5', '#ff7a3d'];
      for (let i = 0; i < 70; i++) {
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
      h('div', { class: 'end-wrap' },
        h('div', { class: 'end-kicker', text: 'Family Showdown results' }),
        h('h1', { class: 'end-title' + (winner === me ? ' win' : ''), text: title }),
        podium,
        rest.length ? h('div', { class: 'end-rests' }, rest) : null,
        awards,
        h('div', { class: 'end-actions' },
          btn(iconLabel(ICON.reset, 'Play Again'), 'btn-green btn-lg', again, { 'data-autofocus': '' }),
          btn(iconLabel(ICON.home, 'Title'), 'btn-blue btn-lg', () => app.quitToTitle()))));
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

function computeAwards(players) {
  const defs = [
    { key: 'steals', title: 'Master Thief', icon: ICON.eye, unit: (n) => `${n} steal${n === 1 ? '' : 's'}` },
    { key: 'planted', title: 'Green Thumb', icon: ICON.sprout, unit: (n) => `${n} planted` },
    { key: 'bonks', title: 'Bonk Champion', icon: ICON.target, unit: (n) => `${n} bonk${n === 1 ? '' : 's'}` },
    { key: 'collected', title: 'Money Bags', icon: ICON.coin, unit: (n) => `${money(n)} collected` },
  ];
  const out = [];
  for (const d of defs) {
    let best = null;
    for (const p of players) if (!best || (p.stats[d.key] || 0) > (best.stats[d.key] || 0)) best = p;
    const n = best?.stats[d.key] || 0;
    if (best && n > 0) out.push({ title: d.title, icon: d.icon, player: best, stat: d.unit(n) });
  }
  return out;
}

