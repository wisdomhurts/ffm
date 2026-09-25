// Menus. Contract: createMenus(app) -> { showTitle(), showSelect(), showMode(), showPause(), hidePause(), showEnd(ranking),
//   openShop(shop), closeShop(), hideAll(), isBlocking() }  (+ extras: openSettings(), openPhotoBooth(), openHowTo(),
//   openPlayerEditor(profile?), and the shared building blocks listed at the bottom; see docs/ONLINE.md)
//
// The title is a "Who's playing?" screen: the family and friends' profiles on this device (app.profile is the
// selected one), PLAY (solo) / PLAY ONLINE, Continue, and the feature tiles (Wardrobe, Pets, Quests, Scores).
import { CHARACTERS, CHARACTER, DIFFICULTY, MATCH, PLANT } from '../config.js';
import { bus } from '../core/events.js';
import { settings, setSetting } from '../core/settings.js';
import { load, storageOK } from '../core/save.js';
import { listProfiles, createProfile, updateProfile, deleteProfile, isFamilyId, profileColor, defaultLook } from '../core/profiles.js';
import { sanitizeName, randomName } from '../core/names.js';
import { h, esc, money, uiSound, reducedMotion } from './dom.js';
import { avatarEl, lookFigure } from './avatars.js';
import { ICON, TILE_ICONS, LOGO_SPROUT } from './icons.js';
import { buildShop } from './shops.js';
import { buildSettings } from './settingsPanel.js';
import { buildPhotoBooth } from './photobooth.js';
import { buildHowTo } from './howto.js';
import { buildPetShop, openPets } from './pets.js';
import { buildWardrobe, openWardrobe } from './wardrobe.js';
import { openLobby } from './lobby.js';
import { openProgress } from './progress.js';
import { openLeaderboard } from './leaderboard.js';
import { fullscreenButton } from './fullscreen.js';
import { rarityColor } from '../view/gameView.js';

const DIFF_DESC = {
  chill: 'Best for your first game: the family goes easy on you.',
  normal: 'A real contest. Guard your garden!',
  chaos: 'Fast, sneaky and bonk-happy. Good luck!',
};

// friends' profiles get a title + tagline like the family's
const FRIEND_TITLE = 'The New Challenger';
const FRIEND_TAGS = ['Here to steal the show!', 'Fast hands. Big dreams.', 'Your garden looks tasty.', 'New in town. Watch out!'];

/** Display info for a profile: family members keep their character's title/tagline. */
export function profileInfo(p) {
  const fam = CHARACTER[p?.id];
  let n = 0;
  for (const ch of String(p?.id || '')) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    name: p?.name || 'Player',
    color: profileColor(p),
    family: !!fam,
    title: fam ? fam.title : FRIEND_TITLE,
    // short chip for the compact cards: "Tycoon", "Sneaky Thief", "Challenger"
    chip: fam ? fam.title.replace(/^the /i, '') : 'Challenger',
    tagline: fam ? fam.tagline : FRIEND_TAGS[n % FRIEND_TAGS.length],
  };
}

// "Esther, Maddie and Micah": the family bots you'll face when playing from this profile's garden
function rivalsOf(p) {
  const names = CHARACTERS.filter((c) => c.id !== p.base).map((c) => c.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
}

export function createMenus(app) {
  const layer = h('div', { class: 'menus' });
  app.root.appendChild(layer);
  let screen = null; // {name, el, dispose?}
  const modals = []; // {wrap, close, kind}
  let shopModal = null;
  const sel = { mode: 'endless', difficulty: settings.difficulty || 'normal' };

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

  // Feature panels come from other modules; one failing must never take the menus down with it.
  const feature = (fn, name) => {
    try {
      fn(app);
    } catch (e) {
      console.warn(`[menus] ${name} failed to open`, e);
    }
  };

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
    return screen;
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
      if (screen?.back) screen.back();
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
    return h('div', { class: 'logo', role: 'img', 'aria-label': 'Steal A Seed!', html:
      `<div class="logo-row r1">${word('STEAL')}${word('A', 'lw-a')}</div>` +
      `<div class="logo-row r2">${word('SEED')}<span class="logo-bang">${word('!', 'lw-bang')}${LOGO_SPROUT}</span></div>` });
  }

  function startGame(o) {
    document.activeElement?.blur?.();
    app.startGame(o);
  }

  function continueGame(p) {
    const s = load(`save:endless:${p.id}`, null);
    startGame({ charId: p.id, mode: 'endless', difficulty: s?.difficulty || settings.difficulty });
  }

  // one feature tile: a sticker icon, a label and an optional badge (stars, pets, quests ready)
  const TILES = [
    { id: 'wardrobe', label: 'Wardrobe', short: 'Wardrobe', open: openWardrobe, name: 'Wardrobe' },
    { id: 'pets', label: 'Pets', short: 'Pets', open: openPets, name: 'Pets' },
    { id: 'quests', label: 'Quests & Badges', short: 'Quests', open: openProgress, name: 'Quests & Badges' },
    { id: 'scores', label: 'High Scores', short: 'Scores', open: openLeaderboard, name: 'High Scores' },
  ];
  function tileBadge(id, p) {
    if (id === 'wardrobe' && p.stars > 0) return { html: `${ICON.star}<span>${p.stars > 999 ? '999+' : p.stars}</span>`, cls: 'tb-stars', label: `${p.stars} stars` };
    if (id === 'pets' && p.pets?.owned?.length) return { html: `<span>${p.pets.owned.length}</span>`, cls: 'tb-count', label: `${p.pets.owned.length} pets` };
    if (id === 'quests') {
      const list = Array.isArray(p.quests?.list) ? p.quests.list : [];
      const ready = list.filter((q) => q && !q.claimed && q.progress >= q.target).length;
      if (ready) return { html: `<span>${ready}</span>`, cls: 'tb-ready', label: `${ready} ready to claim` };
    }
    return null;
  }
  function featureTile(t, i) {
    const badge = h('span', { class: 'tile-badge', hidden: true });
    const b = btn([h('span', { class: 'tile-ic', html: TILE_ICONS[t.id] }), h('span', { class: 'tile-l' }, h('span', { class: 'tl-long', text: t.label }), h('span', { class: 'tl-short', text: t.short })), badge],
      `tile tile-${t.id}`, () => feature(t.open, t.name), { style: `--d:${200 + i * 60}ms`, 'aria-label': t.label });
    b._badge = badge;
    b._id = t.id;
    return b;
  }

  function castCard(p, i, on, saved) {
    const info = profileInfo(p);
    const card = h('button', {
      class: 'cast-card' + (on ? ' on' : '') + (info.family ? '' : ' friend'), type: 'button', role: 'radio', 'aria-checked': String(on),
      style: `--c:${info.color};--d:${i * 60}ms`, 'data-id': p.id,
      'aria-label': `${info.name}${info.family ? ', ' + info.title : ''}${saved ? ', saved garden' : ''}${on ? ', selected. Press again to play' : ''}`,
      onclick: () => pickProfile(p.id),
    },
    avatarEl(p.id, 'cc-ava'),
    h('span', { class: 'cc-name', text: info.name, title: info.name }),
    h('span', { class: 'cc-title', text: info.chip }),
    on ? h('span', { class: 'cc-check', html: ICON.check }) : null);
    const wrap = h('div', { class: 'cc-wrap' + (on ? ' on' : ''), style: `--c:${info.color}` }, card);
    if (!info.family && on) {
      wrap.appendChild(h('button', {
        class: 'cc-edit', type: 'button', 'aria-label': `Edit ${info.name}`, title: 'Rename or delete', html: ICON.pencil,
        onclick: () => {
          click();
          openPlayerEditor(p);
        },
      }));
    }
    return wrap;
  }

  function pickProfile(id) {
    click();
    if (id === app.profileId && screen?.name === 'title') {
      // a second tap on the selected player goes straight to the play flow
      showMode(showTitle);
      return;
    }
    app.setProfile(id);
    paintTitle();
    const card = screen?.el.querySelector(`.cast-card[data-id="${id}"]`);
    if (card) {
      card.classList.add('picked');
      if (keyboardNav) card.focus({ preventScroll: true });
    }
  }

  let title = null; // live parts of the title screen
  function showTitle() {
    closeAllModals();
    const cast = h('div', { class: 'cast', role: 'radiogroup', 'aria-label': "Who's playing?" });
    const who = h('div', { class: 'title-who' }, h('div', { class: 'title-who-h' }, h('span', { text: "Who's playing?" })), h('div', { class: 'cast-scroll' }, cast));
    const main = h('div', { class: 'title-main' });
    const tiles = h('div', { class: 'title-tiles' }, TILES.map(featureTile));
    const small = h('div', { class: 'title-small' },
      btn(iconLabel(ICON.gear, 'Settings'), 'btn-ghost', openSettings),
      btn(iconLabel(ICON.camera, 'Photo Booth'), 'btn-ghost', openPhotoBooth),
      btn(iconLabel(ICON.help, 'How to Play'), 'btn-ghost', openHowTo));
    const fs = fullscreenButton('btn btn-ghost btn-round title-fs');
    const s = setScreen('title',
      fs ? h('div', { class: 'title-corner' }, fs) : null,
      h('div', { class: 'title-hero' }, logo(), h('div', { class: 'edition' }, h('span', { text: 'Family Edition' }))),
      who, h('div', { class: 'title-actions' }, main), h('div', { class: 'title-more' }, tiles, small),
      h('div', { class: 'title-foot', text: 'Starring Dorian, Esther, Maddie & Micah (and you!)' }));
    title = { cast, main, tiles, el: s.el };
    paintTitle(true);
    // profiles change under the title (new player, rename, cloud restore, stars from the Wardrobe)
    let raf = 0;
    const repaint = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (screen === s) paintTitle();
      });
    };
    const offs = ['profile:changed', 'profile:active', 'profile:deleted'].map((ev) => bus.on(ev, repaint));
    const scroller = cast.parentElement;
    const onResize = () => scroller.classList.toggle('over', scroller.scrollWidth > scroller.clientWidth + 2);
    window.addEventListener('resize', onResize);
    s.dispose = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      offs.forEach((f) => f());
      fs?._dispose?.();
      title = null;
    };
  }

  function paintTitle(first = false) {
    if (!title) return;
    const p = app.profile;
    const profiles = listProfiles();
    const saves = new Map(profiles.map((q) => [q.id, app.hasSave(q.id)]));
    // skip identical repaints (a pick repaints at once, then again when 'profile:active' arrives)
    const sig = JSON.stringify([p.id, [...saves], profiles.map((q) => [q.id, q.name, q.base, q.stars, q.pets?.owned?.length, tileBadge('quests', q)?.html])]);
    if (!first && sig === title.sig) return;
    title.sig = sig;
    const focusedId = document.activeElement?.closest?.('.cast-card')?.dataset.id;
    const scroller = title.cast.parentElement;
    const keep = scroller.scrollLeft;
    title.cast.classList.toggle('static', !first);
    title.cast.replaceChildren(
      ...profiles.map((q, i) => castCard(q, i, q.id === p.id, saves.get(q.id))),
      h('div', { class: 'cc-wrap' }, h('button', {
        class: 'cast-card cast-new', type: 'button', style: `--d:${profiles.length * 60}ms`, 'aria-label': 'Make a new player',
        onclick: () => {
          click();
          openPlayerEditor(null);
        },
      }, h('span', { class: 'cc-plus', html: ICON.userPlus }), h('span', { class: 'cc-name' }, h('span', { class: 'tl-long', text: 'New Player' }), h('span', { class: 'tl-short', text: 'New' })),
      h('span', { class: 'cc-title', text: 'Friends!' }))));
    title.cast.classList.toggle('many', profiles.length > 4);
    scroller.scrollLeft = keep;
    // soft fade on the edges only when the strip really scrolls
    scroller.classList.toggle('over', scroller.scrollWidth > scroller.clientWidth + 2);
    // keep the selected player in view in the side-scrolling strip
    const cur = title.cast.querySelector('.cc-wrap.on');
    if (cur) {
      const l = cur.offsetLeft, r = l + cur.offsetWidth;
      if (l < scroller.scrollLeft) scroller.scrollLeft = l - 12;
      else if (r > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = r - scroller.clientWidth + 12;
    }
    if (focusedId) title.cast.querySelector(`.cast-card[data-id="${focusedId}"]`)?.focus({ preventScroll: true });

    const saved = saves.get(p.id);
    const info = profileInfo(p);
    title.main.classList.toggle('has-cont', saved);
    title.main.replaceChildren(...[
      saved ? btn([avatarEl(p.id, 'btn-ava'), h('span', { class: 'bl' }, h('small', { text: 'Continue as' }), h('span', { class: 'bl-name', text: info.name }))],
        'btn-blue btn-xl btn-cont', () => continueGame(p), { 'data-autofocus': '', 'aria-label': `Continue as ${info.name}` }) : null,
      btn(iconLabel(ICON.play, 'PLAY'), 'btn-green btn-xl btn-play', () => showMode(showTitle), saved ? { 'aria-label': `Play as ${info.name}` } : { 'data-autofocus': '', 'aria-label': `Play as ${info.name}` }),
      btn(iconLabel(ICON.globe, 'PLAY ONLINE'), 'btn-purple btn-xl btn-online', () => feature(openLobby, 'Play Online'), { 'aria-label': 'Play online with friends' }),
    ].filter(Boolean));
    for (const b of title.tiles.children) {
      const bd = tileBadge(b._id, p);
      b._badge.hidden = !bd;
      if (bd) {
        b._badge.className = 'tile-badge ' + bd.cls;
        b._badge.innerHTML = bd.html;
        b._badge.setAttribute('aria-label', bd.label);
      }
    }
  }

  // ------------------------------------------------------------------ new player / edit player

  /** New Player (profile = null) or edit a friend's profile: name, starting look (new only), delete. */
  function openPlayerEditor(profile = null) {
    const isNew = !profile;
    if (profile && isFamilyId(profile.id)) return null;
    // start from a family look nobody on this device has picked yet (variety), else Dorian's
    const used = new Set(listProfiles().filter((q) => !isFamilyId(q.id)).map((q) => q.base));
    let base = profile?.base || (CHARACTERS.find((c) => !used.has(c.id)) || CHARACTERS[0]).id;
    const input = h('input', {
      class: 'np-input', type: 'text', maxlength: '14', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done',
      placeholder: 'Your name', 'aria-label': 'Player name', 'aria-describedby': 'np-msg',
    });
    input.value = profile?.name || '';
    const msg = h('div', { class: 'np-msg', id: 'np-msg', 'aria-live': 'polite' });
    const tag = h('span', { class: 'np-tag' });
    const fig = h('span', { class: 'np-fig' });
    const preview = h('div', { class: 'np-preview', 'aria-hidden': 'true' }, tag, fig);
    const looks = isNew ? h('div', { class: 'np-looks', role: 'radiogroup', 'aria-label': 'Starting look' }, CHARACTERS.map((c) =>
      h('button', {
        class: 'np-look', type: 'button', role: 'radio', 'data-base': c.id, style: `--c:${c.color}`, 'aria-label': `${c.name}'s look`,
        onclick: () => {
          click();
          base = c.id;
          paint();
        },
      }, h('span', { class: 'nl-fig', html: lookFigure(defaultLook(c.id, false)) }), h('span', { class: 'nl-name', text: c.name })))) : null;
    const note = h('p', { class: 'np-note' });
    let touched = !isNew;

    function check() {
      const raw = input.value.replace(/\s+/g, ' ').trim();
      if (!raw) return { ok: false, soft: true, text: 'Type a name, or tap Surprise me!' };
      const name = sanitizeName(raw);
      if (!name) return { ok: false, text: "Oops! That name isn't allowed. Try a different one." };
      const clash = listProfiles().find((q) => q.id !== profile?.id && q.name.toLowerCase() === name.toLowerCase());
      if (clash) return { ok: false, text: `Someone here is already called ${clash.name}. Add a number or a nickname!` };
      if (name !== raw) return { ok: true, name, text: `You'll show up as “${name}”.` };
      return { ok: true, name, text: '' };
    }
    function paint() {
      const r = check();
      const c = CHARACTER[base] || CHARACTERS[0];
      tag.textContent = r.name || (input.value.trim() ? '???' : 'Your name');
      preview.style.setProperty('--c', profile ? profileColor(profile) : c.color);
      fig.innerHTML = lookFigure(profile ? profile.look : defaultLook(base, false));
      looks?.querySelectorAll('.np-look').forEach((b) => {
        const on = b.dataset.base === base;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      const show = touched || !r.soft;
      msg.textContent = show ? r.text || 'Up to 14 letters. Keep it friendly!' : 'Up to 14 letters. Keep it friendly!';
      msg.classList.toggle('err', show && !r.ok);
      msg.classList.toggle('ok', show && r.ok && !!r.text);
      input.classList.toggle('bad', show && !r.ok);
      note.innerHTML = (isNew
        ? `You get <b style="--c:${c.color}">${esc(c.name)}'s</b> garden and colours. Change your outfit any time in the Wardrobe!`
        : 'Change your outfit in the Wardrobe.') + (storageOK ? '' : " <b>This browser can't save, so new players only last until you close the page.</b>");
      return r;
    }
    input.addEventListener('input', () => {
      touched = true;
      paint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    const surprise = btn(iconLabel(ICON.dice, 'Surprise me!'), 'btn-gold np-dice', () => {
      // a fresh random name that nobody here has yet
      for (let i = 0; i < 12; i++) {
        input.value = randomName();
        if (check().ok) break;
      }
      touched = true;
      paint();
      fig.classList.remove('boing');
      void fig.offsetWidth;
      fig.classList.add('boing');
    });
    const go = btn(iconLabel(ICON.check, isNew ? "Let's go!" : 'Save'), 'btn-green btn-lg np-go', submit);

    function submit() {
      touched = true;
      const r = paint();
      if (!r.ok) {
        input.classList.remove('nope');
        void input.offsetWidth;
        input.classList.add('nope');
        uiSound(app, 'error');
        if (!('ontouchstart' in window)) input.focus();
        return;
      }
      if (isNew) {
        const p = createProfile({ name: r.name, base });
        app.setProfile(p.id);
        uiSound(app, 'confetti');
        m.close(true);
        if (screen?.name === 'select') showSelect(screen.backTo);
        else if (screen?.name === 'title') paintTitle();
        const card = screen?.el.querySelector(`[data-id="${p.id}"]`);
        card?.classList.add('fresh');
      } else {
        updateProfile(profile.id, { name: r.name });
        m.close(true);
        if (screen?.name === 'select') showSelect(screen.backTo);
      }
    }

    let danger = null;
    if (!isNew) {
      const confirm = h('div', { class: 'confirm np-confirm', hidden: true });
      const del = btn(iconLabel(ICON.trash, 'Delete player'), 'btn-grey btn-sm np-del', () => {
        confirm.hidden = false;
        del.hidden = true;
        confirm.querySelector('.btn-grey')?.focus();
      });
      confirm.append(
        h('span', { text: `Delete ${profile.name}? Their garden, pets, stars and badges on this device are gone for good.` }),
        h('div', { class: 'row' },
          btn('Keep', 'btn-grey btn-sm', () => {
            confirm.hidden = true;
            del.hidden = false;
          }),
          btn(iconLabel(ICON.trash, 'Delete'), 'btn-red btn-sm', () => {
            const wasActive = app.profileId === profile.id;
            deleteProfile(profile.id);
            if (wasActive) app.setProfile(profile.base);
            m.close(true);
            if (screen?.name === 'select') showSelect(screen.backTo);
            else paintTitle();
          })));
      danger = h('div', { class: 'np-danger' },
        btn(iconLabel(ICON.shirt, 'Wardrobe'), 'btn-blue btn-sm', () => {
          app.setProfile(profile.id);
          m.close(true);
          feature(openWardrobe, 'Wardrobe');
        }),
        del, confirm);
    }

    const body = h('div', { class: 'np-body' + (isNew ? ' is-new' : ' is-edit') },
      h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: isNew ? ICON.userPlus : ICON.pencil }), h('h2', { text: isNew ? 'New Player' : 'Edit Player' })),
      preview,
      h('div', { class: 'np-form' },
        h('label', { class: 'np-l', text: isNew ? "What's your name?" : 'Name' }),
        h('div', { class: 'np-row' }, input, surprise),
        msg,
        looks ? h('div', { class: 'np-l', text: 'Pick a starting look' }) : null,
        looks,
        note,
        h('div', { class: 'np-actions' }, go),
        danger));
    const m = openModal(body, { cls: 'newplayer', label: isNew ? 'New Player' : `Edit ${profile.name}` });
    paint();
    // desktop: straight into typing (phones would pop the keyboard over the looks)
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => input.isConnected && input.focus({ preventScroll: true }), 60);
    return m;
  }

  // ------------------------------------------------------------------ play flow (solo)

  function head(title, onBack) {
    return h('div', { class: 'scr-head' },
      h('button', { class: 'btn btn-round btn-ghost', type: 'button', 'aria-label': 'Back', html: ICON.back, onclick: () => { click(); onBack(); } }),
      h('h2', { text: title }),
      h('div', { class: 'scr-head-sp' }));
  }

  function showSelect(back = showTitle) {
    const profiles = listProfiles();
    const cur = app.profileId;
    const cards = profiles.map((p, i) => {
      const info = profileInfo(p);
      const saved = app.hasSave(p.id);
      return h('button', {
        class: 'pick' + (cur === p.id ? ' last' : '') + (info.family ? '' : ' friend'), type: 'button', style: `--c:${info.color};--d:${i * 60}ms`, 'data-id': p.id,
        'aria-label': `${info.name}, ${info.title}${saved ? ', saved progress' : ''}`,
        onclick: () => {
          click();
          app.setProfile(p.id);
          showMode(() => showSelect(back));
        },
      },
      saved ? h('span', { class: 'saved', html: `${ICON.check}<span>Saved</span>` }) : null,
      avatarEl(p.id, 'pk-ava'), h('span', { class: 'pk-name', text: info.name }), h('span', { class: 'pk-title', text: info.title }), h('span', { class: 'pk-tag', text: `"${info.tagline}"` }));
    });
    cards.push(h('button', {
      class: 'pick pick-new', type: 'button', style: `--d:${profiles.length * 60}ms`, 'aria-label': 'Make a new player',
      onclick: () => {
        click();
        openPlayerEditor(null);
      },
    }, h('span', { class: 'pk-plus', html: ICON.userPlus }), h('span', { class: 'pk-name', text: 'New Player' }), h('span', { class: 'pk-tag', text: 'Friends can make their own!' })));
    const s = setScreen('select', h('div', { class: 'flow' }, head("Who's playing?", back),
      h('div', { class: 'pick-grid' + (profiles.length > 4 ? ' many' : '') }, cards),
      h('p', { class: 'flow-hint', text: 'You play in your own garden. The rest of the family become sneaky rivals with their own personalities.' })));
    s.back = back;
    s.backTo = back;
  }

  function showMode(back = showTitle) {
    const p = app.profile;
    const info = profileInfo(p);
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
      const saved = sel.mode === 'endless' && app.hasSave(p.id);
      if (saved) {
        const s = load(`save:endless:${p.id}`, null);
        // saves hold the whole 4-garden world; this profile plays its base family member's slot
        const cash = s?.players?.find((pl) => pl?.id === p.base)?.cash;
        startRow.append(
          btn('Start fresh', 'btn-grey', () => {
            confirm.hidden = false;
            confirm.querySelector('button')?.focus();
          }),
          btn([h('span', { class: 'bi', html: ICON.play }), h('span', { text: 'Continue' }), Number.isFinite(cash) ? h('small', { text: money(cash) }) : null], 'btn-green btn-lg', () =>
            startGame({ charId: p.id, mode: 'endless', difficulty: sel.difficulty }), { 'data-autofocus': '' }));
      } else {
        startRow.append(btn(iconLabel(ICON.play, sel.mode === 'showdown' ? 'Start Showdown' : 'Start'), 'btn-green btn-lg', () =>
          startGame({ charId: p.id, mode: sel.mode, difficulty: sel.difficulty, fresh: true }), { 'data-autofocus': '' }));
      }
    }

    confirm.append(
      h('span', { text: `This erases ${info.name}'s saved garden. Sure?` }),
      btn('Yes, start fresh', 'btn-red btn-sm', () => startGame({ charId: p.id, mode: 'endless', difficulty: sel.difficulty, fresh: true })),
      btn('Cancel', 'btn-grey btn-sm', () => {
        confirm.hidden = true;
      }));

    body.append(
      head('Pick a mode', back),
      h('div', { class: 'who-chip', style: `--c:${info.color}` }, avatarEl(p.id, 'wc-ava'),
        h('span', { class: 'wc-copy' }, h('span', {}, 'Playing as ', h('b', { text: info.name })), h('small', { text: `vs ${rivalsOf(p)}` })),
        h('button', { class: 'link', type: 'button', text: 'Change', onclick: () => { click(); showSelect(() => showMode(back)); } })),
      h('div', { class: 'mode-grid', role: 'radiogroup', 'aria-label': 'Game mode' }, modeCards),
      h('div', { class: 'diff' }, h('div', { class: 'diff-label', text: 'Difficulty' }), h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Difficulty' }, segs), diffDesc),
      startRow, confirm);
    paint();
    const s = setScreen('mode', body);
    s.back = back;
  }

  // ------------------------------------------------------------------ pause

  function showPause() {
    closeAllModals();
    const g = app.game;
    const me = app.human;
    const room = app.online?.room;
    const online = !!room;
    const code = typeof room === 'string' ? room : room?.code;
    let meBox = null;
    if (g && me) {
      const rank = g.ranking().indexOf(me) + 1;
      meBox = h('div', { class: 'pause-me', style: `--c:${me.char.color}` }, avatarEl(me.faceKey, 'pm-ava'),
        h('div', {}, h('b', { text: me.name }), h('span', { class: 'cash', text: money(me.cash) }), h('span', { class: 'pm-rank', text: `#${rank} of ${g.players.length} in net worth` })));
    }
    const quick = (id, label, open, name) => btn([h('span', { class: 'pq-ic', html: TILE_ICONS[id] }), h('span', { class: 'pq-l', text: label })], `pq pq-${id}`, () => feature(open, name));
    const note = online
      ? 'Online games never pause: your garden keeps growing (and can be robbed!) while you are here.'
      : g?.match ? 'Quitting ends this Showdown.' : storageOK ? 'Your garden saves automatically on this device.' : "This browser can't save progress.";
    const quit = online
      ? btn(iconLabel(ICON.exit, 'Leave Room'), 'btn-red pb-quit', () => {
        try {
          app.online.leave();
        } catch (e) {
          console.warn('[menus] leave failed', e);
        }
        app.quitToTitle();
      })
      : btn(iconLabel(ICON.home, g?.match || !storageOK ? 'Quit to Title' : 'Save & Quit'), 'btn-red pb-quit', () => app.quitToTitle());
    const fs = fullscreenButton('btn btn-ghost btn-round pp-fs');
    const panel = h('div', { class: 'panel pause-panel' + (online ? ' online' : '') },
      fs,
      online ? h('div', { class: 'pp-live' }, h('i'), h('span', { text: code ? `Live in room ${code}` : 'Live online game' })) : null,
      h('h2', { class: 'pp-title', text: online ? 'Menu' : 'Paused' }),
      online ? h('p', { class: 'pp-sub', text: 'The world keeps running!' }) : null,
      meBox,
      h('div', { class: 'pause-btns' },
        btn(iconLabel(ICON.play, online ? 'Back to the game' : 'Resume'), 'btn-green btn-lg pb-resume', () => app.resume(), { 'data-autofocus': '' }),
        quit,
        h('div', { class: 'pause-quick' },
          quick('wardrobe', 'Wardrobe', openWardrobe, 'Wardrobe'),
          quick('pets', 'Pets', openPets, 'Pets'),
          quick('quests', 'Quests', openProgress, 'Quests & Badges')),
        h('div', { class: 'pause-util' },
          btn(iconLabel(ICON.gear, 'Settings'), 'btn-blue', openSettings),
          btn(iconLabel(ICON.camera, 'Photo Booth'), 'btn-blue', openPhotoBooth),
          btn(iconLabel(ICON.help, 'How to Play'), 'btn-blue', openHowTo))),
      h('p', { class: 'pause-note', text: note }));
    const sc = setScreen('pause', panel);
    if (fs) sc.dispose = () => fs._dispose?.();
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
    // feature stands build their own panel ({el, title, dispose}); see docs/ONLINE.md
    const custom = { pets: buildPetShop, wardrobe: buildWardrobe }[kind];
    const shop = (custom || ((a, close) => buildShop(a, kind, close)))(app, () => shopModal?.close());
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
        avatarEl(r.player.faceKey, 'ec-ava'),
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
        h('span', { class: 'aw-pic' }, avatarEl(a.player.faceKey, 'aw-ava'), h('span', { class: 'aw-ic', html: a.icon })),
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
      // me.id is the garden slot's family character; the profile is who actually played
      startGame({ charId: me.profileId || me.id, mode: g?.mode || 'showdown', difficulty: g?.difficultyId || settings.difficulty, fresh: true });
    };
    setScreen('end', confetti,
      h('div', { class: 'end-top' + (won ? ' win' : '') },
        h('div', { class: 'end-kicker', html: `${ICON.trophy}<span>Family Showdown</span>` }),
        h('h1', { class: 'end-title', text: title }),
        h('div', { class: 'end-sub' }, won ? null : avatarEl(winner.faceKey, 'es-ava'), h('span', { text: sub }))),
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
    openPlayerEditor,
    // shared building blocks for feature panels (docs/ONLINE.md): openModal(content, {cls, label, onClose, kind})
    // -> {wrap, close(silent), dispose}; btn(label, cls, onclick, attrs); iconLabel(svg, text); doneRow(onDone); click()
    openModal,
    btn,
    iconLabel,
    doneRow,
    click,
    closeAllModals,
    isBlocking: () => !!screen || modals.length > 0,
    get screen() {
      return screen?.name || null;
    },
  };
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
