// First-time player checklist, driven by gameplay events. Persists progress via core/save.js.
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { load, save } from '../core/save.js';
import { LAYOUT } from '../gameplay/layout.js';
import { h, setText, setHTML, setStyle, toggle, screenAngle } from './dom.js';
import { ICON } from './icons.js';
import { isTouch } from './device.js';

const act = () => (isTouch() ? 'Action' : 'E');

const STEPS = [
  { id: 'grab', title: 'Grab a seed', text: () => `Run up the Seed Road. Press ${act()} at a seed.`, ev: 'seed:grabbed', test: (p, me) => p.player === me },
  { id: 'plant', title: 'Plant it', text: () => 'Run it into your garden. It plants itself!', ev: 'plant:planted', test: (p, me) => p.player === me },
  { id: 'collect', title: 'Collect cash', text: () => 'When it grows, step on COLLECT.', ev: 'cash:collected', test: (p, me) => p.player === me },
  { id: 'speed', title: 'Get faster', text: () => 'Buy Speed at the Speed Shop.', ev: 'speed:up', test: (p, me) => p.player === me },
  { id: 'steal', title: 'Steal from family', text: () => `Hold ${act()} on their grown plants.`, ev: 'steal:grabbed', test: (p, me) => p.thief === me },
  { id: 'lock', title: 'Lock your garden', text: () => 'Step on LOCK to keep thieves out.', ev: 'lock:on', test: (p, me) => p.player === me },
];

export function createTutorial(app, parent) {
  const game = app.game;
  const me = app.human;
  const offs = [];
  const progress = new Set(load('tutorial:progress', []) || []);
  let finished = !!load('tutorial:done', false);
  let skipped = false;
  if (finished) return { update() {}, dispose() {} };

  const rows = STEPS.map((s, i) => h('li', { class: 'tut-step' }, h('span', { class: 'tut-box', html: ICON.check }), h('span', { class: 'tut-n', text: String(i + 1) }), h('span', { text: s.title })));
  const arrow = h('span', { class: 'tut-arrow', html: ICON.arrow });
  const nowTitle = h('b');
  const nowText = h('span', { class: 'tut-text' });
  const dist = h('span', { class: 'tut-dist' });
  const count = h('span', { class: 'tut-count' });
  const skip = h('button', { class: 'tut-skip', type: 'button', 'aria-label': 'Skip tutorial', html: 'Skip' });
  const el = h('div', { class: 'tut', role: 'region', 'aria-label': 'Tutorial' },
    h('div', { class: 'tut-head' }, h('span', { class: 'tut-kicker', html: ICON.sprout + 'Getting started' }), count, skip),
    h('div', { class: 'tut-now' }, h('div', { class: 'tut-nav' }, arrow, dist), h('div', { class: 'tut-copy' }, nowTitle, nowText)),
    h('ol', { class: 'tut-list' }, rows));
  parent.appendChild(el);

  skip.addEventListener('mousedown', (e) => e.preventDefault());
  skip.addEventListener('click', () => {
    skipped = true;
    finished = true;
    save('tutorial:done', true);
    el.classList.add('gone');
  });

  let current = -1;
  const visible = () => settings.tips !== false && !finished;

  function render(celebrate) {
    const idx = STEPS.findIndex((s) => !progress.has(s.id));
    rows.forEach((r, i) => {
      toggle(r, 'done', progress.has(STEPS[i].id));
      toggle(r, 'cur', i === idx);
    });
    setText(count, `${progress.size}/${STEPS.length}`);
    if (idx < 0) {
      finished = true;
      save('tutorial:done', true);
      setText(nowTitle, 'You did it!');
      setText(nowText, 'You know everything. Now go get rich!');
      el.classList.add('complete');
      setTimeout(() => el.classList.add('gone'), 4200);
      return;
    }
    if (idx !== current) {
      current = idx;
      setHTML(nowTitle, `<span class="tut-num">${idx + 1}.</span> ${STEPS[idx].title}`);
      setText(nowText, STEPS[idx].text());
      if (celebrate) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }
  }

  for (const s of STEPS) {
    offs.push(bus.on(s.ev, (p) => {
      if (finished || progress.has(s.id) || !s.test(p, me)) return;
      progress.add(s.id);
      save('tutorial:progress', [...progress]);
      render(true);
    }));
  }
  offs.push(bus.on('settings:changed', ({ key }) => {
    if (key === 'tips') el.classList.toggle('hidden', !visible());
  }));

  render(false);
  el.classList.toggle('hidden', !visible());

  // Where should the arrow point for the current step? (null = no arrow)
  const target = () => {
    const step = STEPS[current];
    if (!step) return null;
    const L = LAYOUT.gardens[me.slot];
    switch (step.id) {
      case 'grab': {
        if (me.carrying) return null;
        if (me.pos.z < LAYOUT.roadGate.z) return { x: 0, z: LAYOUT.roadGate.z + 8 };
        let best = null;
        let bd = Infinity;
        for (const pod of game.pods) {
          if (!pod.seed) continue;
          const d = (pod.x - me.pos.x) ** 2 + (pod.z - me.pos.z) ** 2;
          if (d < bd) {
            bd = d;
            best = pod;
          }
        }
        return best;
      }
      case 'plant':
        return me.carrying ? null : { x: 0, z: LAYOUT.roadGate.z + 8 };
      case 'collect':
        return game.gardenIncome(game.gardens[me.slot]) > 0 ? L.collectPad : null;
      case 'speed':
        return LAYOUT.shops.speed;
      case 'steal': {
        if (me.carrying) return null;
        let best = null;
        let bd = Infinity;
        for (const g of game.gardens) {
          if (g.owner === me) continue;
          for (const pl of g.planters) {
            if (!pl.plant || pl.plant.growLeft > 0) continue;
            const d = (pl.x - me.pos.x) ** 2 + (pl.z - me.pos.z) ** 2;
            if (d < bd) {
              bd = d;
              best = pl;
            }
          }
        }
        return best;
      }
      case 'lock':
        return L.lockPad;
      default:
        return null;
    }
  };

  let acc = 0;
  return {
    update(dt) {
      if (!visible() || skipped) return;
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      const t = target();
      const d = t ? Math.hypot(t.x - me.pos.x, t.z - me.pos.z) : 0;
      const show = !!t && d > 7;
      toggle(el, 'has-arrow', show);
      if (show) {
        const a = screenAngle(me.pos, t, app.cam.yaw);
        setStyle(arrow, 'transform', `rotate(${a.toFixed(2)}rad)`);
        setText(dist, `${Math.round(d)} studs`);
      }
    },
    dispose() {
      offs.forEach((f) => f());
      el.remove();
    },
  };
}

export function resetTutorial() {
  save('tutorial:done', false);
  save('tutorial:progress', []);
}
