// Settings modal content. Everything persists through core/settings.js (setSetting).
import { DIFFICULTY } from '../config.js';
import { bus } from '../core/events.js';
import { settings, setSetting } from '../core/settings.js';
import { save } from '../core/save.js';
import { h, uiSound, setMuted } from './dom.js';
import { ICON } from './icons.js';
import { resetTutorial } from './tutorial.js';

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
      // turning a volume up un-mutes
      if (settings.muted && +input.value > 0) setSetting('muted', false);
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
      if (key === 'muted') setMuted(app, !settings.muted);
      else setSetting(key, !settings[key]);
      paint();
    });
    paint();
    return b;
  };

  const pct = (v) => Math.round(v * 100) + '%';
  const qualityNote = h('span', { class: 'set-note warn', text: 'Applies after you reload the page.', hidden: true });

  row('Music', slider('music', 0, 1, 0.05, pct));
  row('Sound effects', slider('sfx', 0, 1, 0.05, pct));
  row('Mute everything', toggleCtl('muted', 'Mute'));
  const q = row('Graphics', seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']], () => { qualityNote.hidden = false; }), 'Lower = smoother on phones');
  q.querySelector('.set-l').appendChild(qualityNote);
  row('Difficulty', seg('difficulty', Object.entries(DIFFICULTY).map(([id, d]) => [id, d.name])), 'For new games');
  row('Camera speed', slider('camSensitivity', 0.3, 2, 0.1, (v) => v.toFixed(1) + '×'));
  row('Invert camera Y', toggleCtl('invertY', 'Invert Y'));
  row('Auto-rotate camera', toggleCtl('autoRotate', 'Auto-rotate camera'), 'Swings behind you as you run');
  row('Tips and tutorial', toggleCtl('tips', 'Tips'));

  const resetBtn = h('button', { class: 'btn btn-grey btn-sm', type: 'button', html: `<span class="bi">${ICON.reset}</span><span>Replay tutorial</span>` });
  resetBtn.addEventListener('click', () => {
    resetTutorial();
    save('ui:hints-off', false);
    if (!settings.tips) setSetting('tips', true);
    resetBtn.innerHTML = `<span class="bi">${ICON.check}</span><span>Starts next game</span>`;
    resetBtn.disabled = true;
  });
  row('Tutorial', resetBtn, 'Shows the checklist and key hints again');

  const el = h('div', { class: 'set-body' },
    h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: ICON.gear }), h('h2', { text: 'Settings' })),
    h('div', { class: 'set-rows' }, rows));
  // keep controls in sync when mute flips the volumes
  const off = bus.on('settings:changed', () => {
    sliders.forEach((f) => f());
    toggles.forEach((f) => f());
  });
  return { el, dispose: off };
}
