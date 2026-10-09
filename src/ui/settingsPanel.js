// Settings modal content. Everything persists through core/settings.js (setSetting).
import { DIFFICULTY } from '../config.js';
import { bus } from '../core/events.js';
import { settings, setSetting } from '../core/settings.js';
import { save } from '../core/save.js';
import { h, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { resetTutorial } from './tutorial.js';
import { fsMode, isFullscreen, toggleFullscreen, onFullscreenChange, autoFullscreenApplies } from './fullscreen.js';
import { openCloudSave } from './cloudsave.js';
import { onlineConfigured } from '../online/config.js';
import { buildSoundControls } from './soundControls.js';

export function buildSettings(app) {
  const rows = [];
  const sliders = [];
  const toggles = [];
  const row = (label, control, note) => {
    const r = h('div', { class: 'set-row' }, h('div', { class: 'set-l' }, h('span', { class: 'set-name', text: label }), note ? h('span', { class: 'set-note', text: note }) : null), control);
    rows.push(r);
    return r;
  };

  const slider = (key, min, max, step, fmtv) => {
    const out = h('output', { class: 'set-v' });
    const input = h('input', { type: 'range', min, max, step, value: settings[key], 'aria-label': key });
    const paint = () => {
      out.textContent = fmtv(+input.value);
      const f = (input.value - min) / (max - min);
      input.style.setProperty('--f', (f * 100).toFixed(1) + '%');
    };
    input.addEventListener('input', () => {
      setSetting(key, +input.value);
      paint();
    });
    paint();
    sliders.push(() => {
      input.value = settings[key];
      paint();
    });
    return h('div', { class: 'set-slider' }, input, out);
  };

  const seg = (key, options, onPick) => {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    const paint = () => wrap.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.v === String(settings[key]);
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    for (const [v, label] of options) {
      wrap.appendChild(h('button', {
        class: 'seg-b', type: 'button', role: 'radio', 'data-v': v, text: label,
        onclick: () => {
          uiSound(app, 'click');
          setSetting(key, v);
          onPick?.(v);
          paint();
        },
      }));
    }
    paint();
    return wrap;
  };

  const toggleCtl = (key, label) => {
    const b = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label }, h('i'));
    const paint = () => {
      b.classList.toggle('on', !!settings[key]);
      b.setAttribute('aria-checked', String(!!settings[key]));
    };
    toggles.push(paint);
    b.addEventListener('click', () => {
      uiSound(app, 'click');
      setSetting(key, !settings[key]);
      paint();
    });
    paint();
    return b;
  };

  // Cloud Save (save codes) lives here; the panel itself comes from the backend module. Until a backend
  // is configured it is a quiet "coming soon" row (the panel then shows a coming-soon card).
  const cloudOn = onlineConfigured();
  const cloudBtn = h('button', { class: `btn ${cloudOn ? 'btn-blue' : 'btn-grey'} btn-sm set-cloud`, type: 'button', html: `<span class="bi">${ICON.cloud}</span><span>${cloudOn ? 'Cloud Save' : 'Coming soon'}</span>` });
  cloudBtn.addEventListener('click', () => {
    uiSound(app, 'click');
    try {
      openCloudSave(app);
    } catch (e) {
      console.warn('[settings] cloud save failed to open', e);
    }
  });
  const who = app.profile?.name;
  if (cloudOn) row('Cloud Save', cloudBtn, `Get a save code to keep ${who ? who + "'s" : 'your'} progress safe, or load it on another device.`).classList.add('set-hi');
  const cloudRow = cloudOn ? null : row('Cloud Save', cloudBtn, 'Save codes to take your garden to another phone or computer.');
  const qualityNote = h('span', { class: 'set-note warn', text: 'Applies after you reload the page.', hidden: true });

  // Music and sound effects: an on/off switch and a volume each (ui/soundControls.js)
  const sound = buildSoundControls(app, { rowClass: 'set-row' });
  rows.push(sound.el);

  // Full screen: a live switch where the browser allows it (plus "go full screen by yourself" on phones and
  // tablets); iPhones get a button that opens the Add to Home Screen guide instead
  let offFs = () => {};
  const fsKind = fsMode();
  if (fsKind === 'api') {
    const fs = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': 'Full screen' }, h('i'));
    const paintFs = (on) => {
      fs.classList.toggle('on', on);
      fs.setAttribute('aria-checked', String(on));
    };
    paintFs(isFullscreen());
    fs.addEventListener('click', () => {
      uiSound(app, 'click');
      toggleFullscreen();
    });
    offFs = onFullscreenChange(paintFs);
    row('Full screen', fs, 'Hides the browser bars');
    if (autoFullscreenApplies()) row('Full screen when playing', toggleCtl('autoFullscreen', 'Full screen when playing'), 'Goes full screen as a game starts');
  } else if (fsKind === 'home') {
    const how = h('button', { class: 'btn btn-blue btn-sm', type: 'button', html: `<span class="bi">${ICON.expand}</span><span>Show me how</span>` });
    how.addEventListener('click', () => {
      uiSound(app, 'click');
      app.menus?.openFullscreenHelp?.();
    });
    row('Full screen', how, 'On iPhone: add the game to your Home Screen');
  }
  row('Screen layout', seg('hudLayout', [['auto', 'Auto'], ['simple', 'Simple'], ['full', 'Full']]), 'Simple keeps small screens tidy (Auto: on phones)');
  const q = row('Graphics', seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']], () => { qualityNote.hidden = false; }), 'Lower = smoother on phones');
  q.querySelector('.set-l').appendChild(qualityNote);
  row('Difficulty', seg('difficulty', Object.entries(DIFFICULTY).map(([id, d]) => [id, d.name])), 'For new games');
  row('Camera speed', slider('camSensitivity', 0.3, 2, 0.1, (v) => v.toFixed(1) + '×'));
  row('Invert camera Y', toggleCtl('invertY', 'Invert Y'));
  row('Auto-rotate camera', toggleCtl('autoRotate', 'Auto-rotate camera'), 'Swings behind you as you run');
  row('Tips and tutorial', toggleCtl('tips', 'Tips'));

  // the guided tutorial, from the first step (ui/tutorial.js): in a game it starts as you go back to it
  const resetBtn = h('button', { class: 'btn btn-green btn-sm set-tut', type: 'button', html: `<span class="bi">${ICON.play}</span><span>Play tutorial</span>` });
  resetBtn.addEventListener('click', () => {
    uiSound(app, 'click');
    resetTutorial(app);
    if (!settings.tips) setSetting('tips', true);
    resetBtn.innerHTML = `<span class="bi">${ICON.check}</span><span>${app.game && app.human ? 'Starts when you play' : 'Starts next game'}</span>`;
    resetBtn.disabled = true;
  });
  row('Tutorial', resetBtn, 'A quick guided tour: grab, grow, cash in, steal');

  // Chat (social/chat.js): typed chat on this device, and a parents' switch for typed chat in public rooms
  rows.push(h('div', { class: 'set-sec', role: 'heading', 'aria-level': '3', text: 'Chat' }));
  row('Typed chat', toggleCtl('chatOn', 'Typed chat'), 'Type messages in solo games and private rooms. Quick chat always works.');
  row('Typed chat in public rooms', toggleCtl('chatPublic', 'Typed chat in public rooms'),
    'For parents: off = public rooms use quick chat only. On = your child can type there too (bad words, links and numbers are blocked).');

  const el = h('div', { class: 'set-body' },
    h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: ICON.gear }), h('h2', { text: 'Settings' })),
    // a feature that isn't switched on yet goes last
    h('div', { class: 'set-rows' }, cloudRow ? [...rows.filter((r) => r !== cloudRow), cloudRow] : rows));
  // keep controls in sync when mute flips the volumes
  const off = bus.on('settings:changed', () => {
    sliders.forEach((f) => f());
    toggles.forEach((f) => f());
  });
  return {
    el,
    dispose() {
      off();
      offFs();
      sound.dispose();
    },
  };
}
