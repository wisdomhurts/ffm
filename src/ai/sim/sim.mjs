// Headless match simulator for tuning the bots (no browser, no three.js).
//   node src/ai/sim/sim.mjs [--minutes 15] [--difficulty normal] [--human none|dorian|esther|maddie|micah]
//                           [--seed 7] [--decor] [--colliders world.json] [--mode endless|showdown] [--chat] [--trace name|stuck]
// Prints a per-minute timeline and a summary of steals, bonks, locks, biomes, stuck time and chat.
import fs from 'node:fs';
import { Game } from '../../gameplay/game.js';
import { emptyIntent } from '../../gameplay/player.js';
import { bus } from '../../core/events.js';
import { makeRng } from '../../core/rng.js';
import { PLANT, RARITY, PLANTS, BIOMES } from '../../config.js';
import { BotController } from '../bot.js';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d;
};

export function runSim({ minutes = 15, difficulty = 'normal', human = 'none', seed = 7, decor = false, colliders = null, mode = 'endless', step = 1 / 30, timeline = true, trace = null, log = console.log, onStart = null } = {}) {
  bus.clear();
  // --colliders <file.json>: the world's real decorative colliders (dump window.__app.world.extraColliders)
  const extra = [...(decor ? makeDecor(seed) : []), ...(colliders ? JSON.parse(fs.readFileSync(colliders, 'utf8')) : [])];
  const game = new Game({ humanId: human === 'none' ? null : human, mode, difficulty, seed, extraColliders: extra });
  const rng = makeRng(seed * 7 + 1);
  for (const p of game.players) {
    p.controller = p.isHuman ? new DummyHuman(game, p, rng) : new BotController(p.char.personality, difficulty, { seed: seed * 31 + p.slot });
  }
  onStart?.(game);
  const S = new Map(game.players.map((p) => [p, {
    grabs: 0, maxBiome: -1, bestTier: -1, bestPlant: '', stealStart: 0, stealOk: 0, stealFoiled: 0, stolenFrom: 0,
    bonkHits: 0, balloonHits: 0, peelHits: 0, swings: 0, locks: 0, caught: 0, chat: 0, stuck: 0, goals: {}, planted: 0,
    items: 0, sold: 0, unlocks: 0, rebirths: 0, speedAt: [], monsterBonks: 0, targeted: 0, firstBiome: [], hitsTaken: 0,
  }]));
  const on = (e, f) => bus.on(e, f);
  on('seed:grabbed', ({ player, pod }) => {
    const s = S.get(player);
    s.grabs++;
    if (pod) {
      s.maxBiome = Math.max(s.maxBiome, pod.biome);
      if (s.firstBiome[pod.biome] == null) s.firstBiome[pod.biome] = game.time;
    }
  });
  on('plant:planted', ({ player, plant }) => {
    const s = S.get(player);
    s.planted++;
    const t = RARITY[PLANT[plant.speciesId].rarity].tier;
    if (t > s.bestTier) {
      s.bestTier = t;
      s.bestPlant = game.plantName(plant.speciesId, plant.mutation);
    }
  });
  on('steal:start', ({ thief, victim }) => {
    S.get(thief).stealStart++;
    S.get(victim).targeted++;
  });
  on('steal:success', ({ thief, victim }) => {
    S.get(thief).stealOk++;
    S.get(victim).stolenFrom++;
  });
  on('steal:foiled', ({ thief }) => S.get(thief).stealFoiled++);
  on('player:hit', ({ target, by, cause }) => {
    if (!by) return;
    S.get(target).hitsTaken++;
    const s = S.get(by);
    if (cause === 'bonk') s.bonkHits++;
    else if (cause === 'balloon') s.balloonHits++;
    else if (cause === 'banana') s.peelHits++;
  });
  on('bonk:swing', ({ player }) => S.get(player).swings++);
  on('lock:on', ({ player }) => S.get(player).locks++);
  on('monster:caught', ({ target }) => S.get(target).caught++);
  if (trace && trace !== 'stuck') {
    bus.on('*', ({ name, payload: e }) => {
      if (!e || ['bonk:swing', 'player:jump', 'pod:respawn', 'plant:grown', 'seed:expired', 'ground:expired'].includes(name)) return;
      const actors = [e.player, e.thief, e.victim, e.target, e.by, e.owner].filter(Boolean);
      if (!actors.some((a) => a.name?.toLowerCase() === trace)) return;
      const bits = [];
      for (const [k, v] of Object.entries(e)) {
        if (v && typeof v === 'object' && v.name) bits.push(`${k}=${v.name}`);
        else if (typeof v === 'number') bits.push(`${k}=${Math.round(v)}`);
        else if (typeof v === 'string') bits.push(`${k}=${v}`);
        else if (v && v.speciesId) bits.push(`${k}=${v.speciesId}`);
        else if (k === 'pod' && v) bits.push(`biome=${v.biome}`);
      }
      const tp = game.players.find((q) => q.name.toLowerCase() === trace);
      const dbg = tp.controller.debugState;
      log(`   [${fmtT(game.time)}] ${name} ${bits.join(' ')}  | ${tp.name} cash ${Math.round(tp.cash)} pile ${Math.round(game.gardens[tp.slot].cashPile)} goal ${dbg?.goal}/${dbg?.phase} @(${tp.pos.x.toFixed(0)},${tp.pos.z.toFixed(0)})`);
    });
  }
  on('monster:bonked', ({ by }) => S.get(by).monsterBonks++);
  on('chat', ({ player, text }) => {
    S.get(player).chat++;
    if (timeline === 'chat') log(`   [${fmtT(game.time)}] ${player.name}: ${text}`);
  });
  on('item:used', ({ player }) => S.get(player).items++);
  on('plant:sold', ({ player }) => S.get(player).sold++);
  on('planter:unlocked', ({ player }) => S.get(player).unlocks++);
  on('rebirth', ({ player }) => S.get(player).rebirths++);
  on('speed:up', ({ player, level }) => S.get(player).speedAt.push([Math.round(game.time), level]));

  const total = minutes * 60;
  const t0 = Date.now();
  const lastPos = new Map(game.players.map((p) => [p, { x: p.pos.x, z: p.pos.z, t: 0 }]));
  let nextSample = 0.5, nextRow = 60;
  let chatLines = 0;
  bus.on('chat', () => chatLines++);
  if (timeline) log(`t     | ${game.players.map((p) => p.name.padEnd(34)).join(' | ')}`);
  while (game.time < total) {
    game.update(step);
    if (game.time >= nextSample) {
      nextSample += 0.5;
      for (const p of game.players) {
        const s = S.get(p);
        const dbg = p.controller.debugState;
        if (dbg) s.goals[dbg.goal || 'none'] = (s.goals[dbg.goal || 'none'] || 0) + 0.5;
        const lp = lastPos.get(p);
        const moved = Math.hypot(p.pos.x - lp.x, p.pos.z - lp.z);
        // standing still on purpose restarts the clock: only "trying to move but not moving" counts
        if (moved > 0.6 || !dbg?.moving) {
          lp.x = p.pos.x;
          lp.z = p.pos.z;
          lp.t = game.time;
        } else if (dbg?.moving && game.time - lp.t > 3) {
          s.stuck += 0.5;
          if (trace === 'stuck') log(`   stuck? [${fmtT(game.time)}] ${p.name} @(${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)},${p.pos.y.toFixed(1)}) ${dbg.goal}/${dbg.phase} int(${p.intent.moveX.toFixed(2)},${p.intent.moveZ.toFixed(2)}) vel ${Math.hypot(p.vel.x, p.vel.z).toFixed(1)}`);
        }
      }
    }
    if (timeline && game.time >= nextRow) {
      nextRow += 60;
      log(`${fmtT(game.time)} | ${game.players.map((p) => row(game, p, S.get(p)).padEnd(34)).join(' | ')}`);
    }
    if (game.over) break;
  }
  const ms = Date.now() - t0;
  const summary = game.players.map((p) => {
    const s = S.get(p);
    return {
      name: p.name, human: p.isHuman, speed: p.speedLevel, rebirths: p.rebirths, net: Math.round(game.netWorth.get(p)),
      income: Math.round(game.gardenIncome(game.gardens[p.slot])), maxBiome: s.maxBiome, best: s.bestPlant,
      grabs: s.grabs, planted: s.planted, caught: s.caught,
      steals: `${s.stealOk}/${s.stealStart} (foiled ${s.stealFoiled})`, robbed: `${s.stolenFrom} (attempts on me ${s.targeted}, hit ${s.hitsTaken}x)`,
      hits: `bonk ${s.bonkHits}+${s.monsterBonks}m/${s.swings} balloon ${s.balloonHits} peel ${s.peelHits}`,
      locks: s.locks, items: s.items, sold: s.sold, unlocks: s.unlocks, chat: s.chat, stuck: s.stuck,
      stuckEvents: p.controller.debugState?.stuck ?? 0,
      goals: Object.entries(s.goals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round((v / game.time) * 100)}%`).join(' '),
      speedAt: s.speedAt,
      firstBiome: s.firstBiome,
    };
  });
  return { game, summary, ms, chatLines, simSeconds: game.time };
}

function row(game, p, s) {
  const g = game.gardens[p.slot];
  const inc = game.gardenIncome(g);
  const plants = g.planters.filter((x) => x.plant).length;
  const unl = g.planters.filter((x) => x.unlocked).length;
  return `L${p.speedLevel} b${s.maxBiome} $${short(game.netWorth.get(p))} ${short(inc)}/s ${plants}/${unl} ${p.controller.debugState?.goal ?? 'human'}`;
}

const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n) + '');
const fmtT = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Random trees/rocks like the world art might add: plaza corners and road margins. */
function makeDecor(seed) {
  const r = makeRng(seed + 99);
  const boxes = [];
  const add = (x, z, s, h = 8) => boxes.push({ minX: x - s, maxX: x + s, minZ: z - s, maxZ: z + s, minY: 0, maxY: h, tag: 'decor' });
  for (let i = 0; i < 10; i++) add(r.range(-24, 24), r.range(-40, 40), r.range(0.8, 2.2)); // plaza props
  add(0, 0, 3, 3); // a fountain at spawn
  for (let i = 0; i < 24; i++) add((r.next() < 0.5 ? -1 : 1) * r.range(8, 12), r.range(80, 950), r.range(0.8, 1.8)); // road rocks
  return boxes;
}

/**
 * A stand-in human: wanders between home, the plaza and the first biomes (away ~70% of the time).
 * Its garden is restocked with plants whose rarity climbs over time, like a player progressing.
 */
class DummyHuman {
  constructor(game, p, rng) {
    this.rng = rng;
    this.t = 0;
    this.target = null;
    const g = game.gardens[p.slot];
    const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    this.refill = () => {
      const tier = tiers[Math.min(5, Math.floor(game.time / 150))];
      const pool = PLANTS.filter((x) => x.rarity === tier);
      // fill an empty planter, else replace the weakest plant (like a player upgrading)
      let pl = g.planters.find((x) => x.unlocked && !x.plant);
      if (!pl) pl = g.planters.filter((x) => x.unlocked).sort((a, b) => PLANT[a.plant.speciesId].income - PLANT[b.plant.speciesId].income)[0];
      const sp = rng.pick(pool);
      if (PLANT[pl.plant?.speciesId]?.income >= sp.income) return;
      pl.plant = { uid: 900000 + Math.floor(rng.next() * 1e6), speciesId: sp.id, mutation: 'normal', growTotal: sp.grow, growLeft: 5, owner: p.slot };
    };
    for (let i = 0; i < 4; i++) this.refill();
  }

  getIntent(game, p, dt) {
    const it = emptyIntent();
    this.t -= dt;
    if (this.t <= 0) {
      this.t = this.rng.range(15, 45);
      const home = game.layout.gardens[p.slot].inside;
      const r = this.rng.next();
      this.target = r < 0.3 ? { x: home.x, z: home.z } : r < 0.5 ? { x: this.rng.range(-15, 15), z: this.rng.range(-30, 30) } : { x: this.rng.range(-12, 12), z: this.rng.range(80, 330) };
      this.refill();
    }
    const dx = this.target.x - p.pos.x, dz = this.target.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.5) {
      // crude routing: leave the garden through the gate, enter the road through its gate
      const L = game.layout.gardens[p.slot];
      let tx = this.target.x, tz = this.target.z;
      const inG = Math.abs(p.pos.x - L.center.x) < 18 && Math.abs(p.pos.z - L.center.z) < 22;
      const tIn = Math.abs(tx - L.center.x) < 18 && Math.abs(tz - L.center.z) < 22;
      if (inG !== tIn) { tx = inG ? L.outside.x : L.outside.x; tz = L.outside.z; if (Math.hypot(p.pos.x - L.outside.x, p.pos.z - L.outside.z) < 2) { tx = inG ? L.outside.x : L.inside.x; tz = L.center.z; } }
      else if ((p.pos.z < 58) !== (tz < 58)) { tx = 0; tz = p.pos.z < 58 ? 64 : 50; }
      const ex = tx - p.pos.x, ez = tz - p.pos.z, el = Math.hypot(ex, ez) || 1;
      it.moveX = ex / el;
      it.moveZ = ez / el;
    }
    return it;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = runSim({
    minutes: +arg('minutes', 15), difficulty: arg('difficulty', 'normal'), human: arg('human', 'none'), seed: +arg('seed', 7),
    decor: !!arg('decor', false), mode: arg('mode', 'endless'), step: +arg('step', 1 / 30), timeline: arg('chat', false) ? 'chat' : arg('timeline', true) !== 'off',
    trace: arg('trace', null), colliders: arg('colliders', null),
  });
  console.log(`\nsimulated ${fmtT(res.simSeconds)} in ${(res.ms / 1000).toFixed(1)}s (${(res.ms / (res.simSeconds / 60)).toFixed(0)} ms per sim-minute); chat lines ${res.chatLines}`);
  for (const s of res.summary) {
    console.log(`\n${s.name}${s.human ? ' (human dummy)' : ''}: L${s.speed} rb${s.rebirths} net $${short(s.net)} income ${short(s.income)}/s, deepest biome ${s.maxBiome} (${BIOMES[s.maxBiome]?.name ?? '-'}), best ${s.best}`);
    console.log(`  grabs ${s.grabs} planted ${s.planted} caught-by-monster ${s.caught} | steals ${s.steals} | robbed ${s.robbed} | ${s.hits}`);
    console.log(`  locks ${s.locks} items ${s.items} sold ${s.sold} unlocks ${s.unlocks} chat ${s.chat} | stuck ${s.stuck}s (${s.stuckEvents} unstick events)`);
    console.log(`  goals: ${s.goals}`);
    console.log(`  speed: ${s.speedAt.map(([t, l]) => `L${l}@${fmtT(t)}`).join(' ')}`);
    console.log(`  first seed per biome: ${s.firstBiome.map((t, b) => `b${b}@${t == null ? '-' : fmtT(t)}`).join(' ')}`);
  }
}
