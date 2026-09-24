// "Next goal" chip (shown once the tutorial is done) + the speed maths the Speed Shop shares.
// The goal is always the next biome: how much Speed you need to outrun its monster while carrying a
// seed, what that costs, and how much more its seeds pay. Once every monster is beaten: Rebirth.
import { BIOMES, PLANTS, PLAYER, RARITY, REBIRTH, speedAt, speedCost } from '../config.js';
import { settings } from '../core/settings.js';
import { h, esc, setHTML, setStyle, toggle, money } from './dom.js';
import { ICON } from './icons.js';

/** A biome monster's real speed in this match (difficulty scales it). */
export const monsterSpeed = (game, biome) => (biome.monster ? biome.monster.speed * (game?.difficulty?.monsterSpeedMult ?? 1) : 0);

/** Can you outrun a monster of speed `ms` while carrying a seed? (strictly faster; float-safe) */
export const outruns = (speed, ms) => speed * PLAYER.carrySeedMult > ms + 1e-6;

/** Lowest Speed level whose carrying speed beats `ms` (may exceed the max level). */
export function levelToOutrun(ms, rebirths = 0) {
  let L = 0;
  while (L < 99 && !outruns(speedAt(L, rebirths), ms)) L++;
  return L;
}

/** Pretty monster speed: 17 / 22.1 */
export const fmtSpeed = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

const avgIncome = {};
for (const p of PLANTS) {
  if (p.family) continue;
  (avgIncome[p.rarity] ||= []).push(p.income);
}
for (const k of Object.keys(avgIncome)) avgIncome[k] = avgIncome[k].reduce((a, b) => a + b, 0) / avgIncome[k].length;

export function nextGoal(game, me) {
  const speed = speedAt(me.speedLevel, me.rebirths);
  let reach = 0; // deepest biome you can farm without its monster catching you
  for (let i = 1; i < BIOMES.length; i++) {
    if (outruns(speed, monsterSpeed(game, BIOMES[i]))) reach = i;
    else break;
  }
  const next = BIOMES[reach + 1];
  if (next) {
    const level = levelToOutrun(monsterSpeed(game, next), me.rebirths);
    if (level <= PLAYER.maxSpeedLevel) {
      let cost = 0;
      for (let L = me.speedLevel + 1; L <= level; L++) cost += speedCost(L);
      const ratio = (avgIncome[next.rarity] || 1) / (avgIncome[BIOMES[reach].rarity] || 1);
      return { kind: 'speed', level, cost, biome: next, ratio };
    }
  }
  return { kind: 'rebirth', cost: REBIRTH.threshold(me.rebirths), mult: REBIRTH.incomeMult(me.rebirths + 1) };
}

const times = (r) => (r >= 2 ? `${Math.round(r)}×` : `${r.toFixed(1)}×`);

export function createNextGoal(app, parent, tutorial) {
  const game = app.game;
  const me = app.human;
  const line1 = h('span', { class: 'ng-l1' });
  const line2 = h('span', { class: 'ng-l2' });
  const bar = h('i');
  const el = h('div', { class: 'nextgoal', role: 'status', 'aria-label': 'Next goal' },
    h('span', { class: 'ng-ic', html: ICON.target }),
    h('span', { class: 'ng-copy' }, h('span', { class: 'ng-k', text: 'Next goal' }), line1, line2),
    h('span', { class: 'ng-bar' }, bar));
  el.hidden = true;
  parent.appendChild(el);
  let acc = 1;
  let key = '';
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.3) return;
      acc = 0;
      const show = settings.tips !== false && (!tutorial || tutorial.done);
      if (el.hidden === show) {
        el.hidden = !show;
        if (show) {
          el.classList.remove('in');
          void el.offsetWidth;
          el.classList.add('in');
        }
      }
      if (!show) return;
      const g = nextGoal(game, me);
      const k = g.kind === 'speed' ? `s${g.level}|${g.cost}|${g.biome.id}` : `r${g.cost}`;
      if (k !== key) {
        key = k;
        if (g.kind === 'speed') {
          const r = RARITY[g.biome.rarity];
          // the copy shrinks with the screen: "Rare seeds pay 3× more" / ": 3× the cash" / just the biome
          setHTML(line1, `${ICON.bolt}<span><span class="ng-word">Speed </span>Lv ${g.level} <b class="cash">${money(g.cost)}</b></span>`);
          setHTML(line2, `<span class="ng-arrow">→</span> <b style="--rc:${r.color}">${esc(g.biome.name)}</b><span class="ng-more">: <span class="ng-long">${esc(r.name)} seeds<br>pay </span><b class="x">${times(g.ratio)}</b><span class="ng-long"> more</span><span class="ng-short"> the cash</span></span>`);
        } else {
          setHTML(line1, `${ICON.crown}<span>Rebirth <b class="cash">${money(g.cost)}</b></span>`);
          setHTML(line2, `<span class="ng-arrow">→</span> <b class="x">×${g.mult}</b><span class="ng-more"> income forever</span>`);
        }
      }
      const f = Math.max(0, Math.min(1, me.cash / Math.max(1, g.cost)));
      setStyle(bar, 'transform', `scaleX(${f.toFixed(3)})`);
      toggle(el, 'ready', f >= 1);
    },
    dispose() {
      el.remove();
    },
  };
}
