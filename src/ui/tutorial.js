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

const ROAD = { x: 0, z: LAYOUT.roadGate.z + 8 }; // just inside the Sunny Field

// Touch copy is shorter: on phones the card is a slim strip with room for two short lines.
const STEPS = [
  { id: 'grab', title: 'Grab a seed', text: () => (isTouch() ? 'Run up the road. Tap Grab on a seed.' : 'Run up the Seed Road. Press E at a seed.'), ev: 'seed:grabbed', test: (p, me) => p.player === me },
  { id: 'plant', title: 'Plant it', text: () => 'Run it into your garden. It plants itself!', ev: 'plant:planted', test: (p, me) => p.player === me },
  { id: 'collect', title: 'Collect cash', text: () => 'When it grows, step on COLLECT.', ev: 'cash:collected', test: (p, me) => p.player === me },
  { id: 'speed', title: 'Get faster', text: () => 'Buy Speed at the Speed Shop.', ev: 'speed:up', test: (p, me) => p.player === me },
  { id: 'steal', title: 'Steal from family', text: () => (isTouch() ? 'Hold Steal on a grown plant.' : 'Hold E on their grown plants.'), ev: 'steal:grabbed', test: (p, me) => p.thief === me },
  { id: 'lock', title: 'Lock your garden', text: () => 'Step on LOCK to keep thieves out.', ev: 'lock:on', test: (p, me) => p.player === me },
];

// The steal step's live line, by how safe the chosen garden is right now.
const STEAL_NOTE = {
  none: () => (isTouch() ? 'Wait for a family plant to grow.' : 'Wait for a family plant to grow (locked gardens are off limits).'),
  away: (n) => `${isTouch() ? 'Hold Steal on a grown plant.' : 'Hold E on their grown plants.'} ${n} is away!`,
  near: (n) => `${isTouch() ? 'Hold Steal on a plant.' : 'Hold E on their grown plants.'} Watch out, ${n} is nearby!`,
  home: (n) => `${isTouch() ? 'Hold Steal on a plant.' : 'Hold E on their grown plants.'} Watch out, ${n} is home!`,
};
const growingText = (s) => (isTouch() ? `Growing… ${s}s. Grab another seed!` : `Growing… ${s}s. Grab another seed while you wait!`);

const REVEAL_DELAY = 1.0; // seconds after the intro camera lands
// How close counts as "there" (the arrow hides): pads need you ON them, prompts appear from further away.
const ARRIVE = { grab: 4.5, plant: 6, collect: 1.6, speed: 5, steal: 4, lock: 1.4 };
const ARRIVE_SEED = 4.5; // any step that points at a seed pod: the Grab prompt shows from here
// An owner only counts as "away" when they really are: up the Seed Road, or far from home and not
// on their way back. Anything closer can be home to BONK you within seconds.
const AWAY_Z = LAYOUT.roadGate.z + 10;
const AWAY_DIST = 70;

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
  let liveText = ''; // the instruction line on show (steps rewrite it live)
  const say = (t) => {
    if (t === liveText) return;
    liveText = t;
    setText(nowText, t);
  };
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
      say('You know everything. Now go get rich!');
      toggle(el, 'has-arrow', false);
      el.classList.add('complete');
      leave(4200);
      return;
    }
    if (idx !== current) {
      current = idx;
      stealPick = null;
      setHTML(nowTitle, `<span class="tut-num">${idx + 1}.</span> ${STEPS[idx].title}`);
      say(STEPS[idx].text());
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
  let arrive = 7; // how close counts as "there" for the current target (set by target())

  // Is this garden's owner really away (so a first steal won't be bonked seconds later)?
  function ownerAway(g) {
    const o = g.owner;
    const dx = g.L.center.x - o.pos.x, dz = g.L.center.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    if (o.pos.z <= AWAY_Z && d <= AWAY_DIST) return false;
    if (o.carrying) return false; // loot goes straight home
    const v = Math.hypot(o.vel.x, o.vel.z);
    return !(v > 2 && (o.vel.x * dx + o.vel.z * dz) / (v * Math.max(d, 1e-6)) > 0.5);
  }

  // The best plant to practise stealing on: never in a locked garden, preferably while its owner is
  // really away, preferably in the column nearest the gate.
  function pickSteal() {
    let best = null;
    let bs = Infinity;
    for (const g of game.gardens) {
      if (g.owner === me || game.isLocked(g)) continue;
      const o = g.owner.pos;
      const away = ownerAway(g);
      const home = !away && gardenContains(g.L, o.x, o.z, -12);
      for (const pl of g.planters) {
        if (!pl.plant || pl.plant.growLeft > 0) continue;
        const back = pl.index % 2 === 1; // far column: you have to hop a planter
        const s = Math.hypot(pl.x - me.pos.x, pl.z - me.pos.z) + (away ? 0 : home ? 120 : 70) + (back ? 25 : 0) + (stealPick?.pl === pl ? -30 : 0);
        if (s < bs) {
          bs = s;
          best = { g, pl, away, home };
        }
      }
    }
    return best;
  }

  // The nearest seed waiting in a pod (the route helper steers the arrow through the arch).
  function nearestSeed() {
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
  // point at a seed ("there" = close enough for the Grab prompt); up the road if every pod is empty
  const toSeed = () => {
    arrive = ARRIVE_SEED;
    return nearestSeed() || ROAD;
  };

  // What the current step wants the player to walk to (null = no arrow), plus live text tweaks.
  function target() {
    const step = STEPS[current];
    if (!step) return null;
    arrive = ARRIVE[step.id] ?? 7;
    const L = LAYOUT.gardens[me.slot];
    switch (step.id) {
      case 'grab':
        return me.carrying ? null : toSeed();
      case 'plant':
        return me.carrying ? null : toSeed(); // dropped it: go get another one
      case 'collect': {
        const garden = game.gardens[me.slot];
        if (game.gardenIncome(garden) > 0 || garden.cashPile >= 1) {
          say('It grew! Step on COLLECT for your cash.');
          return L.collectPad;
        }
        let left = Infinity;
        for (const pl of garden.planters) if (pl.plant && pl.plant.growLeft > 0) left = Math.min(left, pl.plant.growLeft);
        if (left < Infinity) say(growingText(Math.ceil(left)));
        else say(isTouch() ? 'Plant a seed, then step on COLLECT.' : 'Plant a seed, then step on COLLECT when it grows.');
        // while it grows: off to fetch another seed
        return me.carrying ? null : toSeed();
      }
      case 'speed':
        return LAYOUT.shops.speed;
      case 'steal': {
        if (me.carrying) return null;
        stealPick = pickSteal();
        const note = !stealPick ? 'none' : stealPick.away ? 'away' : stealPick.home ? 'home' : 'near';
        say(STEAL_NOTE[note](stealPick?.g.owner.name));
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
      const show = !!g && g.dist > arrive;
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
