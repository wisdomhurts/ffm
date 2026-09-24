// First-time player checklist, driven by gameplay events. Persists progress via core/save.js.
// Its arrow follows a route (ui/route.js) around fences, and the distance shown is the walking distance.
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { load, save } from '../core/save.js';
import { LAYOUT, gardenContains } from '../gameplay/layout.js';
import { h, setText, setHTML, setStyle, toggle, screenAngle } from './dom.js';
import { ICON } from './icons.js';
import { isTouch } from './device.js';
import { guidePoint } from './route.js';

const act = () => (isTouch() ? 'Action' : 'E');
const ROAD = { x: 0, z: LAYOUT.roadGate.z + 8 }; // just inside the Sunny Field

const STEPS = [
  { id: 'grab', title: 'Grab a seed', text: () => (isTouch() ? 'Run up the road. Tap Grab on a seed.' : 'Run up the Seed Road. Press E at a seed.'), ev: 'seed:grabbed', test: (p, me) => p.player === me },
  { id: 'plant', title: 'Plant it', text: () => 'Run it into your garden. It plants itself!', ev: 'plant:planted', test: (p, me) => p.player === me },
  { id: 'collect', title: 'Collect cash', text: () => 'When it grows, step on COLLECT.', ev: 'cash:collected', test: (p, me) => p.player === me },
  { id: 'speed', title: 'Get faster', text: () => 'Buy Speed at the Speed Shop.', ev: 'speed:up', test: (p, me) => p.player === me },
  { id: 'steal', title: 'Steal from family', text: () => (isTouch() ? 'Hold Steal on their grown plants.' : 'Hold E on their grown plants.'), ev: 'steal:grabbed', test: (p, me) => p.thief === me },
  { id: 'lock', title: 'Lock your garden', text: () => 'Step on LOCK to keep thieves out.', ev: 'lock:on', test: (p, me) => p.player === me },
];

const REVEAL_DELAY = 1.0; // seconds after the intro camera lands

export function createTutorial(app, parent) {
  const game = app.game;
  const me = app.human;
  const offs = [];
  const progress = new Set(load('tutorial:progress', []) || []);
  let finished = !!load('tutorial:done', false);
  let skipped = false;
  let gone = finished;
  if (finished) return { update() {}, dispose() {}, get done() { return true; } };

  const rows = STEPS.map((s, i) => h('li', { class: 'tut-step' }, h('span', { class: 'tut-box', html: ICON.check }), h('span', { class: 'tut-n', text: String(i + 1) }), h('span', { text: s.title })));
  const arrow = h('span', { class: 'tut-arrow', html: ICON.arrow });
  const nowTitle = h('b');
  const nowText = h('span', { class: 'tut-text' });
  const dist = h('span', { class: 'tut-dist' });
  const count = h('span', { class: 'tut-count' });
  const skip = h('button', { class: 'tut-skip', type: 'button', 'aria-label': 'Skip tutorial', html: 'Skip' });
  const el = h('div', { class: 'tut wait', role: 'region', 'aria-label': 'Tutorial' },
    h('div', { class: 'tut-head' }, h('span', { class: 'tut-kicker', html: ICON.sprout + 'Getting started' }), count, skip),
    h('div', { class: 'tut-now' }, h('div', { class: 'tut-nav' }, arrow, dist), h('div', { class: 'tut-copy' }, nowTitle, nowText)),
    h('ol', { class: 'tut-list' }, rows));
  parent.appendChild(el);

  const leave = (ms) => setTimeout(() => {
    el.classList.add('gone');
    gone = true;
  }, ms);

  skip.addEventListener('mousedown', (e) => e.preventDefault());
  skip.addEventListener('click', () => {
    skipped = true;
    finished = true;
    save('tutorial:done', true);
    el.classList.add('gone');
    gone = true;
  });

  let current = -1;
  const visible = () => settings.tips !== false && !finished;

  function pop() {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

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
      toggle(el, 'has-arrow', false);
      el.classList.add('complete');
      leave(4200);
      return;
    }
    if (idx !== current) {
      current = idx;
      stealPick = null;
      setHTML(nowTitle, `<span class="tut-num">${idx + 1}.</span> ${STEPS[idx].title}`);
      setText(nowText, STEPS[idx].text());
      if (celebrate) pop();
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
  // "Collect cash" waits for a plant to grow: celebrate the moment it does and point at COLLECT
  offs.push(bus.on('plant:grown', ({ garden }) => {
    if (garden.owner !== me || STEPS[current]?.id !== 'collect') return;
    acc = 1;
    pop();
  }));
  offs.push(bus.on('settings:changed', ({ key }) => {
    if (key === 'tips') el.classList.toggle('hidden', !visible());
  }));

  let stealPick = null; // {g, pl}: sticky so the arrow doesn't flip between gardens every tick
  let stealNote = '';

  // The best plant to practise stealing on: never in a locked garden, preferably while its owner is
  // away from home, preferably in the column nearest the gate.
  function pickSteal() {
    let best = null;
    let bs = Infinity;
    for (const g of game.gardens) {
      if (g.owner === me || game.isLocked(g)) continue;
      const o = g.owner.pos;
      const home = gardenContains(g.L, o.x, o.z, -12);
      for (const pl of g.planters) {
        if (!pl.plant || pl.plant.growLeft > 0) continue;
        const back = pl.index % 2 === 1; // far column: you have to hop a planter
        const s = Math.hypot(pl.x - me.pos.x, pl.z - me.pos.z) + (home ? 90 : 0) + (back ? 25 : 0) + (stealPick?.pl === pl ? -30 : 0);
        if (s < bs) {
          bs = s;
          best = { g, pl, home };
        }
      }
    }
    return best;
  }

  // What the current step wants the player to walk to (null = no arrow), plus live text tweaks.
  function target() {
    const step = STEPS[current];
    if (!step) return null;
    const L = LAYOUT.gardens[me.slot];
    switch (step.id) {
      case 'grab': {
        if (me.carrying) return null;
        if (me.pos.z < LAYOUT.roadGate.z) return ROAD;
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
        return me.carrying ? null : ROAD;
      case 'collect': {
        const garden = game.gardens[me.slot];
        if (game.gardenIncome(garden) > 0 || garden.cashPile >= 1) {
          setText(nowText, 'It grew! Step on COLLECT for your cash.');
          return L.collectPad;
        }
        let left = Infinity;
        for (const pl of garden.planters) if (pl.plant && pl.plant.growLeft > 0) left = Math.min(left, pl.plant.growLeft);
        if (left < Infinity) setText(nowText, `Growing… ${Math.ceil(left)}s. Grab another seed while you wait!`);
        else setText(nowText, 'Plant a seed, then step on COLLECT when it grows.');
        return me.carrying ? null : ROAD;
      }
      case 'speed':
        return LAYOUT.shops.speed;
      case 'steal': {
        if (me.carrying) return null;
        stealPick = pickSteal();
        const note = !stealPick ? 'none' : stealPick.home ? 'home' : 'go';
        if (note !== stealNote) {
          stealNote = note;
          if (note === 'none') setText(nowText, 'Wait for a family plant to grow (locked gardens are off limits).');
          else if (note === 'home') setText(nowText, `${STEPS[current].text()} Watch out, ${stealPick.g.owner.name} is home!`);
          else setText(nowText, `${STEPS[current].text()} ${stealPick.g.owner.name} is away!`);
        }
        return stealPick?.pl || null;
      }
      case 'lock':
        return L.lockPad;
      default:
        return null;
    }
  }

  render(false);
  el.classList.toggle('hidden', !visible());

  let acc = 0;
  let revealIn = REVEAL_DELAY;
  return {
    get done() {
      return gone || skipped || settings.tips === false;
    },
    update(dt) {
      if (!visible() || skipped) return;
      // stay out of the way while the intro camera swoops in, then slide in a beat after the HUD
      if (revealIn > 0) {
        if ((app.cam?.introT ?? 1) >= 1) revealIn -= dt;
        if (revealIn > 0) return;
        el.classList.remove('wait');
        pop();
      }
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      const t = target();
      const g = t ? guidePoint(me.pos, t, game.physics?.boxes) : null;
      const show = !!g && g.dist > 7;
      toggle(el, 'has-arrow', show);
      if (show) {
        const a = screenAngle(me.pos, g, app.cam.yaw);
        setStyle(arrow, 'transform', `rotate(${a.toFixed(2)}rad)`);
        setText(dist, `${Math.round(g.dist)} studs`);
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
