// The rules of Steal A Seed. Pure simulation: no rendering, no DOM.
// Views, UI, audio and AI read this state and listen to the events it emits on `bus`.
import {
  ROAD_END_Z, WORLD, PLAYER, PLANTS, PLANT, RARITIES, RARITY, MUTATIONS, BASE_MUTATION_CHANCE, BIOMES, PODS, ITEMS, ITEM,
  EVENTS, MATCH, DIFFICULTY, CHARACTERS, CHAT, LOCK, PLANTERS, REBIRTH, NAMESAKE_BONUS, speedCost,
} from '../config.js';
import { LAYOUT, gardenContains } from './layout.js';
import { PhysicsWorld } from '../core/physics.js';
import { bus } from '../core/events.js';
import { makeRng } from '../core/rng.js';
import { Player, emptyIntent } from './player.js';
import { petMods } from '../pets/effects.js';
import { PET, EGG } from '../pets/catalog.js';
import { EMOTE, PHRASE } from '../social/catalog.js';

let UID = 1;
const uid = () => UID++;
// keep locally made ids above any id received from an online host (see applyFull)
const bumpUid = (n) => {
  if (Number.isFinite(n) && n >= UID) UID = Math.floor(n) + 1;
};
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Safety net: anyone who ends up outside the island or the road gets sent home.
const inPlayArea = ({ x, z }) =>
  z < WORLD.road.startZ ? Math.abs(x) < 73 && z > -67.5 : Math.abs(x) < WORLD.road.width / 2 + 1 && z < ROAD_END_Z + 1;

export const SELL_SECONDS = 90;
export const NETWORTH_PLANT_SECONDS = 60;

export class Game {
  /**
   * @param {object} o
   * @param {string} o.humanId  character id the human plays ('dorian'|'esther'|'maddie'|'micah'), or null for all-bot demo
   * @param {'endless'|'showdown'} o.mode
   * @param {'chill'|'normal'|'chaos'} o.difficulty
   * @param {number} [o.seed] RNG seed
   * @param {object} [o.save] data from serialize()
   * @param {Array}  [o.extraColliders] decorative colliders from the world art
   * @param {Array}  [o.slots] per slot {kind:'local'|'remote'|'bot', profile?, pid?} (overrides humanId)
   */
  constructor({ humanId = 'dorian', mode = 'endless', difficulty = 'normal', seed, save = null, extraColliders = [], slots = null } = {}) {
    this.time = 0;
    this.mode = mode;
    this.difficultyId = difficulty;
    this.difficulty = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.rng = makeRng(seed);
    this.layout = LAYOUT;
    this.physics = new PhysicsWorld([...LAYOUT.colliders, ...extraColliders]);
    this.paused = false;
    this.over = false;

    this.players = CHARACTERS.map((c, slot) => new Player(slot, c, !slots && c.id === humanId));
    if (slots) slots.forEach((cfg, i) => cfg && this._setIdentity(this.players[i], cfg));
    this.human = this.players.find((p) => p.isHuman) || null;
    this.gardens = this.players.map((p, slot) => this._makeGarden(slot, p));
    this.pods = LAYOUT.pods.map((pl) => ({ ...pl, seed: null, respawnAt: 0 }));
    this.ground = []; // {uid, kind:'seed'|'banana', x,y,z, ...}
    this.projectiles = []; // water balloons
    this.monsters = this._spawnMonsters();
    this.event = null;
    this.nextEventAt = EVENTS.firstDelay;
    this.match = mode === 'showdown' ? { endsAt: MATCH.showdownSeconds } : null;
    this.netWorth = new Map();

    for (const pod of this.pods) pod.seed = this.rollSeed(pod.biome);
    this.players.forEach((p) => this.respawn(p));
    if (save) this.restore(save);
    this._recomputeNetWorth();
  }

  // ------------------------------------------------------------------ setup

  _makeGarden(slot, owner) {
    const L = LAYOUT.gardens[slot];
    return {
      slot,
      L,
      owner,
      planters: L.planters.map((p) => ({
        index: p.index, x: p.x, z: p.z, unlocked: p.index < PLANTERS.startUnlocked, plant: null, stealer: null,
      })),
      cashPile: 0,
      lockedUntil: 0,
      lockReadyAt: 0,
      lockActive: false,
    };
  }

  _spawnMonsters() {
    const list = [];
    BIOMES.forEach((b, bi) => {
      if (!b.monster) return;
      const r = LAYOUT.biomeRanges[bi];
      for (let i = 0; i < b.monster.count; i++) {
        const x = this.rng.range(-12, 12);
        const z = this.rng.range(r.minZ + 20, r.maxZ - 20);
        list.push({
          uid: uid(), biome: bi, type: b.monster.id, def: b.monster, x, y: 0, z, yaw: 0, vx: 0, vz: 0,
          state: 'patrol', target: null, stunUntil: 0, wander: { x, z }, wanderAt: 0, ignore: {}, attackAt: -10,
        });
      }
    });
    return list;
  }

  respawn(p) {
    const g = LAYOUT.gardens[p.slot];
    p.pos.x = g.inside.x;
    p.pos.y = 0;
    p.pos.z = g.inside.z + (p.slot % 2 ? 1 : -1);
    p.vel.x = p.vel.y = p.vel.z = 0;
    p.yaw = g.west ? Math.PI / 2 : -Math.PI / 2;
    p.onGround = true;
  }

  // ------------------------------------------------------------------ helpers

  plantIncome(plant, owner = this.players[plant.owner]) {
    const sp = PLANT[plant.speciesId];
    let v = sp.income * MUTATIONS[plant.mutation].mult * REBIRTH.incomeMult(owner.rebirths) * owner.mods.income;
    if (sp.family && sp.family === owner.id) v *= NAMESAKE_BONUS;
    return v;
  }

  gardenIncome(g) {
    let s = 0;
    for (const pl of g.planters) if (pl.plant && pl.plant.growLeft <= 0) s += this.plantIncome(pl.plant, g.owner);
    return s;
  }

  isLocked(g) {
    return this.time < g.lockedUntil;
  }

  gardenAt(x, z, pad = 0) {
    for (const g of this.gardens) if (gardenContains(g.L, x, z, pad)) return g;
    return null;
  }

  biomeAt(z) {
    const r = LAYOUT.biomeRanges;
    for (const b of r) if (z >= b.minZ && z < b.maxZ) return b.index;
    return -1;
  }

  speciesOfRarity(rarityId) {
    return PLANTS.filter((p) => p.rarity === rarityId);
  }

  rollSeed(biomeIndex) {
    const biome = BIOMES[biomeIndex];
    let tier = RARITY[biome.rarity].tier;
    let rarity = biome.rarity;
    if (biome.id === 'starbloom' && this.rng.chance(PODS.secretChance)) rarity = 'secret';
    else if (tier < 5 && this.rng.chance(PODS.luckyChance)) rarity = RARITIES[tier + 1].id;
    const species = this.rng.pick(this.speciesOfRarity(rarity));
    return { speciesId: species.id, mutation: this.rollMutation(), lucky: rarity !== biome.rarity };
  }

  rollMutation() {
    if (this.event) {
      const t = EVENTS.types.find((e) => e.id === this.event.type);
      if (this.rng.chance(t.chance)) return t.mutation;
    }
    const r = this.rng.next();
    if (r < BASE_MUTATION_CHANCE.rainbow) return 'rainbow';
    if (r < BASE_MUTATION_CHANCE.rainbow + BASE_MUTATION_CHANCE.diamond) return 'diamond';
    if (r < BASE_MUTATION_CHANCE.rainbow + BASE_MUTATION_CHANCE.diamond + BASE_MUTATION_CHANCE.gold) return 'gold';
    return 'normal';
  }

  plantName(speciesId, mutation) {
    const m = MUTATIONS[mutation];
    return (m.name ? m.name + ' ' : '') + PLANT[speciesId].name;
  }

  say(player, category, vars = {}) {
    const lines = CHAT[player.id]?.[category];
    if (!lines) return;
    vars = { ...vars };
    if (vars.plant) vars.a_plant = (/^[aeiou]/i.test(vars.plant) ? 'an ' : 'a ') + vars.plant;
    vars.human = this.human && this.human !== player ? this.human.name : 'everyone';
    // don't repeat any of this bot's recent lines
    const recent = (player._recentLines ||= []);
    const fresh = lines.filter((l) => !recent.includes(l));
    let text = this.rng.pick(fresh.length ? fresh : lines);
    recent.push(text);
    if (recent.length > 6) recent.shift();
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
    bus.emit('chat', { player, text });
  }

  _recomputeNetWorth() {
    for (const p of this.players) {
      const g = this.gardens[p.slot];
      let v = p.cash + g.cashPile + p.upgradeSpend * 0.5;
      for (const pl of g.planters) if (pl.plant) v += this.plantIncome(pl.plant, p) * NETWORTH_PLANT_SECONDS;
      if (p.carrying?.kind === 'plant') v += this.plantIncome(p.carrying.plant, p) * NETWORTH_PLANT_SECONDS;
      this.netWorth.set(p, v);
    }
  }

  ranking() {
    // ties go to the local player (nobody likes starting in last place)
    return [...this.players].sort((a, b) => this.netWorth.get(b) - this.netWorth.get(a) || (b.isHuman ? 1 : 0) - (a.isHuman ? 1 : 0));
  }

  // ------------------------------------------------------------------ main update

  update(dt) {
    if (this.paused || this.over) return;
    dt = Math.min(dt, 0.1);
    // fixed substeps keep physics stable
    const steps = Math.ceil(dt / (1 / 60));
    const h = dt / steps;
    for (let i = 0; i < steps && !this.over && !this.paused; i++) this._step(h);
  }

  _step(dt) {
    this.time += dt;
    const now = this.time;
    for (const p of this.players) {
      p._now = now;
      p.intent = p.controller ? p.controller.getIntent(this, p, dt) || emptyIntent() : emptyIntent();
    }
    for (const p of this.players) this._movePlayer(p, dt);
    this._separatePlayers();
    for (const p of this.players) {
      this._handleItems(p);
      this._handleBonk(p);
      this._handleInteraction(p, dt);
      this._handlePads(p);
      this._handleAutoPlant(p);
    }
    this._updateProjectiles(dt);
    this._updateGround();
    this._updateMonsters(dt);
    this._updatePods();
    this._updateGardens(dt);
    this._updateEvents();
    this._slowTick = (this._slowTick || 0) + dt;
    if (this._slowTick > 0.25) {
      this._slowTick = 0;
      this._recomputeNetWorth();
    }
    if (this.match && now >= this.match.endsAt) this._endMatch();
  }

  // ------------------------------------------------------------------ movement

  _laserBoxesFor(p) {
    let boxes = null;
    for (const g of this.gardens) {
      if (g.owner === p || !this.isLocked(g)) continue;
      if (gardenContains(g.L, p.pos.x, p.pos.z)) continue; // inside when it locked: may walk out
      const gate = g.L.gate;
      (boxes ||= []).push({ minX: gate.x - 0.6, maxX: gate.x + 0.6, minZ: gate.minZ - 0.5, maxZ: gate.maxZ + 0.5, minY: 0, maxY: 40, tag: 'laser' });
    }
    return boxes;
  }

  _movePlayer(p, dt) {
    const it = p.intent;
    const now = this.time;
    const stunned = now < p.stunUntil;
    let mx = stunned ? 0 : it.moveX;
    let mz = stunned ? 0 : it.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const max = p.maxSpeed(now, this.difficulty.botSpeedMult);
    const tx = mx * max;
    const tz = mz * max;
    const a = (p.onGround ? PLAYER.accel : PLAYER.airAccel) * dt * (stunned ? 0.25 : 1);
    const dvx = tx - p.vel.x;
    const dvz = tz - p.vel.z;
    const dl = Math.hypot(dvx, dvz);
    if (dl > 0) {
      const k = Math.min(1, a / dl);
      p.vel.x += dvx * k;
      p.vel.z += dvz * k;
    }
    if (len > 0.1 && !stunned) {
      const target = Math.atan2(mx, mz);
      const d = wrapAngle(target - p.yaw);
      p.yaw = wrapAngle(p.yaw + d * Math.min(1, PLAYER.turnRate * dt));
    } else if (it.aimYaw != null && !stunned) {
      p.yaw = it.aimYaw;
    }
    if (it.emote === 'celebrate' && this.time >= p.celebrateUntil) p.celebrateUntil = this.time + 1.5;
    this._handleSocial(p, len > 0.1, stunned);
    if (it.jump) p._jumpQ = this.time + 0.12; // buffer: a press just before landing still counts
    if (p._jumpQ > this.time && p.onGround && !stunned) {
      p._jumpQ = 0;
      p.vel.y = WORLD.jumpVelocity;
      p.onGround = false;
      bus.emit('player:jump', { player: p });
    }
    this.physics.step(p, dt, this._laserBoxesFor(p));
    if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z) || !Number.isFinite(p.pos.y) || !inPlayArea(p.pos) || p.pos.y > 80) {
      if (p.carrying?.kind === 'plant') {
        const c = p.carrying;
        p.carrying = null;
        this.returnPlant(c.plant, c.fromSlot, c.fromIndex);
      }
      this.respawn(p);
    }
  }

  _separatePlayers() {
    const r = WORLD.playerRadius * 2 * 0.9;
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (Math.abs(a.pos.y - b.pos.y) > 4) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (r - d) / 2;
        a.pos.x -= (dx / d) * push;
        a.pos.z -= (dz / d) * push;
        b.pos.x += (dx / d) * push;
        b.pos.z += (dz / d) * push;
      }
    }
  }

  // ------------------------------------------------------------------ interactions

  /** Returns the thing this player can interact with right now, or null.
   *  {key, verb, label, hold, action(), target} */
  // Carrying a seed into your own garden with no free planter: only offer Sell prompts so you can make room.
  _ownGardenFull(p) {
    const g = this.gardens[p.slot];
    return gardenContains(g.L, p.pos.x, p.pos.z) && !g.planters.some((pl) => pl.unlocked && !pl.plant);
  }

  findInteraction(p) {
    const swapping = p.carrying?.kind === 'seed' && this._ownGardenFull(p);
    if (this.time < p.stunUntil || (p.carrying && !swapping)) return null;
    const pos = p.pos;
    let best = null;
    let bestD = Infinity;
    const consider = (d2, it) => {
      if (d2 < bestD) {
        bestD = d2;
        best = it;
      }
    };
    // dropped seeds
    if (!swapping) for (const gi of this.ground) {
      if (gi.kind !== 'seed') continue;
      const d2 = dist2(pos, gi);
      if (d2 < 4.5 * 4.5) {
        consider(d2 - 4, {
          key: 'g' + gi.uid, verb: 'Grab', label: this.plantName(gi.speciesId, gi.mutation), hold: 0,
          rarity: PLANT[gi.speciesId].rarity, target: gi, action: () => this.grabGroundSeed(p, gi),
        });
      }
    }
    // road pods
    if (!swapping && pos.z > LAYOUT.roadGate.z - 2) {
      for (const pod of this.pods) {
        if (!pod.seed) continue;
        const d2 = dist2(pos, pod);
        if (d2 < PLAYER.interactRange * PLAYER.interactRange) {
          consider(d2, {
            key: 'pod' + pod.id, verb: 'Grab', label: this.plantName(pod.seed.speciesId, pod.seed.mutation) + ' Seed',
            hold: PLAYER.grabHold, rarity: PLANT[pod.seed.speciesId].rarity, target: pod, action: () => this.grabPodSeed(p, pod),
          });
        }
      }
    }
    // gardens
    const g = this.gardenAt(pos.x, pos.z);
    if (g) {
      for (const pl of g.planters) {
        const d2 = dist2(pos, pl);
        if (d2 > 4.8 * 4.8) continue;
        if (g.owner === p) {
          if (!pl.unlocked) {
            const cost = PLANTERS.unlockCost[pl.index];
            consider(d2, { key: 'unlock' + pl.index, verb: 'Unlock', label: `Planter ($${fmt(cost)})`, hold: 0, cost, target: pl,
              action: () => this.unlockPlanter(p, pl.index) });
          } else if (pl.plant && pl.plant.growLeft <= 0) {
            const value = Math.round(this.plantIncome(pl.plant, p) * SELL_SECONDS);
            consider(d2, { key: 'sell' + pl.index, verb: 'Sell', label: `${this.plantName(pl.plant.speciesId, pl.plant.mutation)} (+$${fmt(value)})`,
              hold: PLAYER.sellHold, rarity: PLANT[pl.plant.speciesId].rarity, target: pl, action: () => this.sellPlant(p, pl) });
          }
        } else if (!swapping && pl.plant && pl.plant.growLeft <= 0) {
          consider(d2, { key: 'steal' + g.slot + '_' + pl.index, verb: 'Steal', label: this.plantName(pl.plant.speciesId, pl.plant.mutation),
            hold: PLAYER.stealHold, rarity: PLANT[pl.plant.speciesId].rarity, target: pl, garden: g, action: () => this.stealPlant(p, g, pl) });
        }
      }
    }
    // shops (human-facing prompts; bots call the buy methods directly)
    if (swapping) {
      // nothing to sell or unlock: let them put the seed down instead of carrying it forever
      if (!best) best = { key: 'drop', verb: 'Drop', label: 'Seed (garden full)', hold: 0.4, action: () => this.dropCarried(p, null, 'drop') };
      return best;
    }
    const sh = LAYOUT.shops;
    if (dist2(pos, sh.gear) < sh.gear.r ** 2) consider(dist2(pos, sh.gear) + 1, { key: 'shop:gear', verb: 'Open', label: 'Gear Shop', hold: 0, action: () => bus.emit('shop:open', { player: p, shop: 'gear' }) });
    if (dist2(pos, sh.speed) < sh.speed.r ** 2) {
      const next = p.speedLevel + 1;
      consider(dist2(pos, sh.speed) + 1, { key: 'shop:speed', verb: 'Train', label: next > 25 ? 'Max Speed!' : `Speed +2 ($${fmt(speedCost(next))})`, hold: 0,
        action: () => { if (!this.buySpeed(p)) bus.emit('shop:open', { player: p, shop: 'speed' }); } });
    }
    if (dist2(pos, sh.rebirth) < sh.rebirth.r ** 2) consider(dist2(pos, sh.rebirth) + 1, { key: 'shop:rebirth', verb: 'Open', label: 'Rebirth Altar', hold: 0, action: () => bus.emit('shop:open', { player: p, shop: 'rebirth' }) });
    if (sh.pets && dist2(pos, sh.pets) < sh.pets.r ** 2) consider(dist2(pos, sh.pets) + 1, { key: 'shop:pets', verb: 'Open', label: 'Pet Eggs', hold: 0, action: () => bus.emit('shop:open', { player: p, shop: 'pets' }) });
    if (sh.wardrobe && dist2(pos, sh.wardrobe) < sh.wardrobe.r ** 2) consider(dist2(pos, sh.wardrobe) + 1, { key: 'shop:wardrobe', verb: 'Open', label: 'Wardrobe', hold: 0, action: () => bus.emit('shop:open', { player: p, shop: 'wardrobe' }) });
    return best;
  }

  _handleInteraction(p, dt) {
    const it = this.findInteraction(p);
    const st = p.interact;
    const pressed = !!p.intent.interact;
    if (!pressed) p.holdSpent = false;
    if (!it) {
      if (st.stealPl) this._clearStealer(st.stealPl, p);
      p.interact = { key: null, t: 0, hold: 0, label: '', verb: '', fired: false };
      p.prevInteract = pressed;
      return;
    }
    if (it.key !== st.key) {
      if (st.stealPl) this._clearStealer(st.stealPl, p);
      p.interact = { key: it.key, t: 0, hold: it.hold, label: it.label, verb: it.verb, rarity: it.rarity, fired: false, target: it.target };
    }
    const s = p.interact;
    s.label = it.label;
    if (pressed) {
      if (it.hold <= 0) {
        if (!p.prevInteract) it.action();
      } else if (!s.fired && !p.holdSpent) {
        s.t += dt / p.mods.hold; // pets can speed up grabs and steals
        if (it.verb === 'Steal' && !s.stealPl) {
          s.stealPl = it.target;
          it.target.stealer = p.slot;
          bus.emit('steal:start', { thief: p, victim: it.garden.owner, plant: it.target.plant, garden: it.garden });
        }
        if (s.t >= it.hold) {
          s.fired = true;
          p.holdSpent = true; // one hold = one action; release before the next one charges
          if (s.stealPl) {
            s.stealPl.stealer = null;
            s.stealPl = null;
          }
          it.action();
        }
      }
    } else {
      if (s.stealPl) this._clearStealer(s.stealPl, p);
      s.t = 0;
      s.fired = false;
    }
    p.prevInteract = pressed;
  }

  _clearStealer(pl, p) {
    if (pl.stealer === p.slot) {
      pl.stealer = null;
      bus.emit('steal:cancel', { thief: p });
    }
    p.interact.stealPl = null;
  }

  grabPodSeed(p, pod) {
    if (!pod.seed || p.carrying) return false;
    p.carrying = { kind: 'seed', speciesId: pod.seed.speciesId, mutation: pod.seed.mutation, podId: pod.id, lucky: !!pod.seed.lucky };
    pod.seed = null;
    pod.respawnAt = this.time + this.rng.range(PODS.respawnMin, PODS.respawnMax);
    p.stats.seeds++;
    bus.emit('seed:grabbed', { player: p, speciesId: p.carrying.speciesId, mutation: p.carrying.mutation, rarity: PLANT[p.carrying.speciesId].rarity, pod });
    return true;
  }

  grabGroundSeed(p, gi) {
    const i = this.ground.indexOf(gi);
    if (i < 0 || p.carrying) return false;
    this.ground.splice(i, 1);
    p.carrying = { kind: 'seed', speciesId: gi.speciesId, mutation: gi.mutation, podId: gi.podId, lucky: !!gi.lucky };
    bus.emit('seed:grabbed', { player: p, speciesId: gi.speciesId, mutation: gi.mutation, rarity: PLANT[gi.speciesId].rarity, ground: true });
    return true;
  }

  stealPlant(p, g, pl) {
    if (!pl.plant || p.carrying || g.owner === p) return false;
    const plant = pl.plant;
    pl.plant = null;
    pl.stealer = null;
    p.carrying = { kind: 'plant', plant, fromSlot: g.slot, fromIndex: pl.index };
    bus.emit('steal:grabbed', { thief: p, victim: g.owner, plant, garden: g });
    return true;
  }

  sellPlant(p, pl) {
    if (!pl.plant || pl.plant.growLeft > 0) return false;
    const value = Math.round(this.plantIncome(pl.plant, p) * SELL_SECONDS);
    const plant = pl.plant;
    pl.plant = null;
    p.cash += value;
    bus.emit('plant:sold', { player: p, plant, value, planter: pl });
    return true;
  }

  unlockPlanter(p, index) {
    const g = this.gardens[p.slot];
    const pl = g.planters[index];
    const cost = PLANTERS.unlockCost[index];
    if (!pl || pl.unlocked || p.cash < cost) {
      if (pl && !pl.unlocked) bus.emit('purchase:fail', { player: p, reason: 'cash', cost });
      return false;
    }
    p.cash -= cost;
    p.upgradeSpend += cost;
    pl.unlocked = true;
    bus.emit('planter:unlocked', { player: p, index, cost });
    return true;
  }

  // ------------------------------------------------------------------ pads & planting

  _handlePads(p) {
    const g = this.gardens[p.slot];
    if (Math.abs(p.pos.y) > 2) return;
    const L = g.L;
    if (dist2(p.pos, L.collectPad) < (L.collectPad.r + p.mods.magnet) ** 2 && g.cashPile >= 1 && (g.cashPile >= 25 || this.time - (g.collectedAt ?? -9) > 0.5)) {
      const amount = Math.floor(g.cashPile);
      g.cashPile -= amount;
      g.collectedAt = this.time;
      p.cash += amount;
      p.stats.collected += amount;
      bus.emit('cash:collected', { player: p, amount, x: L.collectPad.x, z: L.collectPad.z });
    }
    if (dist2(p.pos, L.lockPad) < L.lockPad.r ** 2) this.lockGarden(p);
  }

  lockGarden(p) {
    const g = this.gardens[p.slot];
    if (this.time < g.lockReadyAt || this.isLocked(g)) return false;
    g.lockedUntil = this.time + LOCK.duration + LOCK.perRebirth * p.rebirths;
    g.lockReadyAt = g.lockedUntil + LOCK.recharge;
    g.lockActive = true;
    bus.emit('lock:on', { player: p, garden: g, until: g.lockedUntil });
    return true;
  }

  _handleAutoPlant(p) {
    if (!p.carrying) return;
    const g = this.gardens[p.slot];
    if (!gardenContains(g.L, p.pos.x, p.pos.z, 1)) {
      p._fullWarned = false;
      return;
    }
    let best = null;
    let bd = Infinity;
    for (const pl of g.planters) {
      if (!pl.unlocked || pl.plant) continue;
      const d = dist2(p.pos, pl);
      if (d < bd) {
        bd = d;
        best = pl;
      }
    }
    const c = p.carrying;
    if (c.kind === 'seed') {
      if (!best) {
        if (!p._fullWarned) {
          p._fullWarned = true; // once per visit
          bus.emit('garden:full', { player: p });
        }
        return;
      }
      const sp = PLANT[c.speciesId];
      best.plant = { uid: uid(), speciesId: c.speciesId, mutation: c.mutation, growTotal: sp.grow, growLeft: sp.grow, owner: p.slot };
      p.carrying = null;
      p.stats.planted++;
      bus.emit('plant:planted', { player: p, plant: best.plant, planter: best, garden: g });
      return;
    }
    // stolen plant
    const victim = this.players[c.fromSlot];
    const plant = c.plant;
    plant.owner = p.slot;
    p.carrying = null;
    p.stats.steals++;
    victim.stats.robbed++;
    if (best) {
      best.plant = plant;
      bus.emit('steal:success', { thief: p, victim, plant, planter: best, garden: g });
    } else {
      const value = Math.round(this.plantIncome(plant, p) * SELL_SECONDS);
      p.cash += value;
      bus.emit('steal:success', { thief: p, victim, plant, planter: null, garden: g, soldFor: value });
    }
  }

  // ------------------------------------------------------------------ combat

  _handleBonk(p) {
    const it = p.intent;
    const now = this.time;
    if (it.bonk && p.carrying && now >= (p._blockedAt || 0)) {
      p._blockedAt = now + 1.2;
      bus.emit('bonk:blocked', { player: p }); // hands full: the HUD tells you to run
    }
    if (!it.bonk || now < p.stunUntil || now < p.bonkReadyAt || p.carrying) return;
    p.bonkReadyAt = now + PLAYER.bonk.cooldown * p.mods.bonkCd;
    p.swingStart = now;
    bus.emit('bonk:swing', { player: p });
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const cosHalf = Math.cos(((PLAYER.bonk.arcDeg / 2) * Math.PI) / 180);
    const R = PLAYER.bonk.range;
    let hitAny = false;
    for (const q of this.players) {
      if (q === p || now < q.invulnUntil) continue;
      if (Math.abs(q.pos.y - p.pos.y) > 4.5) continue;
      const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      if (d > 1.2 && (dx * fx + dz * fz) / d < cosHalf) continue;
      this.hitPlayer(q, p, { x: dx / (d || 1), z: dz / (d || 1) }, PLAYER.bonk.stun, 'bonk');
      hitAny = true;
    }
    for (const m of this.monsters) {
      const dx = m.x - p.pos.x, dz = m.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R + 1.5) continue;
      if (d > 1.5 && (dx * fx + dz * fz) / d < cosHalf) continue;
      m.stunUntil = now + PLAYER.bonk.monsterStun;
      m.state = 'stunned';
      m.target = null;
      hitAny = true;
      bus.emit('monster:bonked', { monster: m, by: p });
    }
    if (!hitAny) bus.emit('bonk:miss', { player: p });
  }

  /** Stun a player, knock them back and make them drop what they carry. */
  hitPlayer(q, by, dir, stun, cause) {
    const now = this.time;
    q.stunUntil = now + stun;
    q.invulnUntil = now + stun + PLAYER.bonk.invuln;
    q.vel.x = dir.x * PLAYER.bonk.knockback;
    q.vel.z = dir.z * PLAYER.bonk.knockback;
    q.vel.y = 22;
    q.onGround = false;
    q.lastHitBy = by;
    if (q.interact.stealPl) this._clearStealer(q.interact.stealPl, q);
    if (by) by.stats.bonks++;
    const dropped = this.dropCarried(q, by, cause);
    bus.emit('player:hit', { target: q, by, cause, dropped });
  }

  /** Drop whatever q carries. Stolen plants fly home; seeds fall on the ground. */
  dropCarried(q, by, cause) {
    const c = q.carrying;
    if (!c) return null;
    q.carrying = null;
    if (c.kind === 'plant') {
      this.returnPlant(c.plant, c.fromSlot, c.fromIndex);
      bus.emit('steal:foiled', { thief: q, victim: this.players[c.fromSlot], plant: c.plant, by, cause });
      return c;
    }
    const a = this.rng.range(0, Math.PI * 2);
    const gi = {
      uid: uid(), kind: 'seed', speciesId: c.speciesId, mutation: c.mutation, podId: c.podId, lucky: !!c.lucky,
      x: q.pos.x + Math.sin(a) * 2, y: 0, z: q.pos.z + Math.cos(a) * 2, expiresAt: this.time + PODS.groundSeedLifetime, droppedAt: this.time,
    };
    // keep it on the walkable road / plaza
    gi.x = clamp(gi.x, -WORLD.road.width / 2 + 2, WORLD.road.width / 2 - 2);
    if (gi.z < LAYOUT.roadGate.z) gi.x = q.pos.x;
    this.ground.push(gi);
    bus.emit('seed:dropped', { player: q, item: gi, by, cause });
    return c;
  }

  returnPlant(plant, slot, index) {
    const g = this.gardens[slot];
    plant.owner = slot;
    let pl = g.planters[index];
    if (!pl || pl.plant || !pl.unlocked) pl = g.planters.find((x) => x.unlocked && !x.plant);
    if (pl) {
      pl.plant = plant;
      bus.emit('plant:returned', { plant, planter: pl, garden: g });
    } else {
      const value = Math.round(this.plantIncome(plant, g.owner) * SELL_SECONDS);
      g.owner.cash += value;
      bus.emit('plant:returned', { plant, planter: null, garden: g, refund: value });
    }
  }

  // ------------------------------------------------------------------ items

  _handleItems(p) {
    const it = p.intent;
    if (it.selectSlot != null) p.selectedItem = clamp(it.selectSlot, 0, ITEMS.length - 1);
    if (it.useItem == null || this.time < p.stunUntil) return;
    const id = typeof it.useItem === 'number' ? ITEMS[it.useItem]?.id : it.useItem;
    if (id) this.useItem(p, id);
  }

  useItem(p, id) {
    const def = ITEM[id];
    if (!def || (p.items[id] || 0) <= 0) {
      bus.emit('item:empty', { player: p, item: id });
      return false;
    }
    const now = this.time;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    switch (id) {
      case 'banana':
        this.ground.push({ uid: uid(), kind: 'banana', owner: p.slot, x: p.pos.x - fx * 2.8, y: p.pos.y, z: p.pos.z - fz * 2.8, expiresAt: now + def.life, armedAt: now + 0.4 });
        break;
      case 'balloon':
        this.projectiles.push({ uid: uid(), kind: 'balloon', owner: p.slot, x: p.pos.x + fx * 1.5, y: p.pos.y + 4.5, z: p.pos.z + fz * 1.5,
          vx: fx * def.speed + p.vel.x * 0.3, vy: 16, vz: fz * def.speed + p.vel.z * 0.3, born: now });
        break;
      case 'coil':
        p.coilUntil = Math.max(now, p.coilUntil) + def.duration; // stacking extends the timer
        break;
      case 'cloak':
        p.cloakUntil = Math.max(now, p.cloakUntil) + def.duration;
        break;
      case 'bucket': {
        const g = this.gardens[p.slot];
        let best = null, bd = 7 * 7;
        for (const pl of g.planters) {
          if (!pl.plant || pl.plant.growLeft <= 0) continue;
          const d = dist2(p.pos, pl);
          if (d < bd) { bd = d; best = pl; }
        }
        if (!best) {
          bus.emit('item:fail', { player: p, item: id, reason: 'Stand next to one of your growing plants.' });
          return false;
        }
        best.plant.growLeft *= 0.5;
        bus.emit('plant:watered', { player: p, planter: best });
        break;
      }
      default:
        return false;
    }
    p.items[id]--;
    bus.emit('item:used', { player: p, item: id });
    return true;
  }

  _updateProjectiles(dt) {
    const g = WORLD.gravity * 0.35;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i];
      b.vy -= g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      let pop = b.y <= 0.3 || this.time - b.born > 4;
      if (!pop) {
        for (const q of this.players) {
          if (q.slot === b.owner) continue;
          if ((q.pos.x - b.x) ** 2 + (q.pos.z - b.z) ** 2 < 2.4 ** 2 && b.y > q.pos.y - 0.5 && b.y < q.pos.y + WORLD.playerHeight + 2.5) {
            pop = true;
            break;
          }
        }
      }
      if (!pop) continue;
      this.projectiles.splice(i, 1);
      const owner = this.players[b.owner];
      const R = ITEM.balloon.radius;
      for (const q of this.players) {
        if (q.slot === b.owner || this.time < q.invulnUntil) continue;
        const dx = q.pos.x - b.x, dz = q.pos.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < R && Math.abs(q.pos.y - b.y) < 7) this.hitPlayer(q, owner, { x: dx / (d || 1), z: dz / (d || 1) }, ITEM.balloon.stun, 'balloon');
      }
      bus.emit('balloon:splash', { x: b.x, y: Math.max(0, b.y), z: b.z, owner });
    }
  }

  _updateGround() {
    const now = this.time;
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const gi = this.ground[i];
      if (now >= gi.expiresAt) {
        this.ground.splice(i, 1);
        if (gi.kind === 'seed') {
          const pod = this.pods[gi.podId];
          if (pod && !pod.seed) {
            pod.seed = { speciesId: gi.speciesId, mutation: gi.mutation, lucky: !!gi.lucky };
            pod.respawnAt = 0;
          }
          bus.emit('seed:expired', { item: gi });
        } else bus.emit('ground:expired', { item: gi });
        continue;
      }
      if (gi.kind === 'banana' && now >= gi.armedAt) {
        for (const q of this.players) {
          if (q.slot === gi.owner || now < q.invulnUntil || q.pos.y > 1.5) continue;
          if ((q.pos.x - gi.x) ** 2 + (q.pos.z - gi.z) ** 2 < 1.9 ** 2) {
            this.ground.splice(i, 1);
            const s = Math.hypot(q.vel.x, q.vel.z) || 1;
            this.hitPlayer(q, this.players[gi.owner], { x: q.vel.x / s, z: q.vel.z / s }, ITEM.banana.stun, 'banana');
            bus.emit('banana:slip', { target: q, owner: this.players[gi.owner], x: gi.x, z: gi.z });
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ monsters

  _updateMonsters(dt) {
    const now = this.time;
    const halfW = WORLD.road.width / 2 - 2.5;
    for (const m of this.monsters) {
      const r = LAYOUT.biomeRanges[m.biome];
      if (now < m.stunUntil) {
        m.vx *= 0.9;
        m.vz *= 0.9;
        continue;
      }
      if (m.state === 'stunned') m.state = 'patrol';
      // pick / validate target
      let target = m.target != null ? this.players[m.target] : null;
      const valid = (q) => q && q.carrying && !q.invisible(now) && now >= (m.ignore[q.slot] || 0) &&
        q.pos.z > r.minZ - 6 && q.pos.z < r.maxZ + 6 && q.pos.z >= LAYOUT.roadGate.z;
      if (target && (!valid(target) || dist2(target.pos, m) > (m.def.aggro * 1.8) ** 2)) target = null;
      if (!target) {
        const aggro = m.def.aggro * (this.difficulty.monsterAggroMult ?? 1);
        let bd = aggro * aggro;
        for (const q of this.players) {
          if (!valid(q)) continue;
          const d = dist2(q.pos, m);
          if (d < bd) {
            bd = d;
            target = q;
          }
        }
        if (target) bus.emit('monster:aggro', { monster: m, target });
      }
      m.target = target ? target.slot : null;
      m.state = target ? 'chase' : 'patrol';
      let tx, tz, spd;
      if (target) {
        tx = target.pos.x;
        tz = target.pos.z;
        spd = m.def.speed * (this.difficulty.monsterSpeedMult ?? 1);
      } else {
        if (now > m.wanderAt || dist2(m, m.wander) < 4) {
          m.wander = { x: this.rng.range(-halfW, halfW), z: this.rng.range(r.minZ + 12, r.maxZ - 12) };
          m.wanderAt = now + this.rng.range(3, 7);
        }
        tx = m.wander.x;
        tz = m.wander.z;
        spd = m.def.speed * 0.35;
      }
      const dx = tx - m.x, dz = tz - m.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        m.vx += ((dx / d) * spd - m.vx) * Math.min(1, dt * 6);
        m.vz += ((dz / d) * spd - m.vz) * Math.min(1, dt * 6);
        m.yaw = Math.atan2(m.vx, m.vz);
      }
      m.x = clamp(m.x + m.vx * dt, -halfW, halfW);
      m.z = clamp(m.z + m.vz * dt, r.minZ + 3, r.maxZ - 3);
      if (target && d < 3.4 && now >= target.invulnUntil && Math.abs(target.pos.y - m.y) < 5) {
        // caught! the seed goes back where it came from
        const c = target.carrying;
        target.carrying = null;
        if (c.kind === 'seed') {
          const pod = this.pods[c.podId];
          if (pod && !pod.seed) {
            pod.seed = { speciesId: c.speciesId, mutation: c.mutation, lucky: !!c.lucky };
            pod.respawnAt = 0;
          }
        } else if (c.kind === 'plant') {
          this.returnPlant(c.plant, c.fromSlot, c.fromIndex);
          bus.emit('steal:foiled', { thief: target, victim: this.players[c.fromSlot], plant: c.plant, by: null, cause: 'monster' });
        }
        target.stunUntil = now + 0.8;
        target.invulnUntil = now + 2.5;
        target.vel.x = (target.pos.x - m.x) * 3;
        target.vel.z = -24;
        target.vel.y = 26;
        target.onGround = false;
        m.ignore[target.slot] = now + 3;
        m.attackAt = now;
        m.target = null;
        bus.emit('monster:caught', { monster: m, target, lost: c });
      }
    }
  }

  // ------------------------------------------------------------------ pods, gardens, events

  _updatePods() {
    for (const pod of this.pods) {
      if (!pod.seed && pod.respawnAt && this.time >= pod.respawnAt) {
        pod.seed = this.rollSeed(pod.biome);
        pod.respawnAt = 0;
        bus.emit('pod:respawn', { pod });
      }
    }
  }

  _updateGardens(dt) {
    for (const g of this.gardens) {
      for (const pl of g.planters) {
        const pt = pl.plant;
        if (!pt) continue;
        if (pt.growLeft > 0) {
          pt.growLeft -= dt;
          if (pt.growLeft <= 0) {
            pt.growLeft = 0;
            bus.emit('plant:grown', { plant: pt, planter: pl, garden: g });
          }
        } else {
          g.cashPile += this.plantIncome(pt, g.owner) * dt;
        }
      }
      if (g.lockActive && !this.isLocked(g)) {
        g.lockActive = false;
        bus.emit('lock:off', { player: g.owner, garden: g });
      }
    }
  }

  _updateEvents() {
    const now = this.time;
    if (this.event && now >= this.event.endsAt) {
      const old = this.event;
      this.event = null;
      this.nextEventAt = now + this.rng.range(EVENTS.gapMin, EVENTS.gapMax);
      bus.emit('event:end', { event: old });
    }
    if (!this.event && now >= this.nextEventAt) this.startEvent(this.rng.pick(EVENTS.types).id);
  }

  startEvent(typeId) {
    const t = EVENTS.types.find((e) => e.id === typeId);
    if (!t) return;
    this.event = { type: t.id, def: t, startedAt: this.time, endsAt: this.time + EVENTS.duration };
    // give some waiting seeds the event mutation right away
    for (const pod of this.pods) if (pod.seed && pod.seed.mutation === 'normal' && this.rng.chance(t.chance * 0.6)) pod.seed.mutation = t.mutation;
    bus.emit('event:start', { event: this.event });
  }

  // ------------------------------------------------------------------ purchases

  near(p, spot, r = spot.r || 7) {
    return dist2(p.pos, spot) < r * r;
  }

  buyItem(p, id, qty = 1) {
    const def = ITEM[id];
    if (!def || !this.near(p, LAYOUT.shops.gear, 9)) return false;
    const cost = def.price * qty;
    if (p.cash < cost) {
      bus.emit('purchase:fail', { player: p, reason: 'cash', cost });
      return false;
    }
    p.cash -= cost;
    p.items[id] = (p.items[id] || 0) + qty;
    bus.emit('purchase', { player: p, what: id, cost, qty });
    return true;
  }

  buySpeed(p) {
    if (!this.near(p, LAYOUT.shops.speed, 9)) return false;
    const next = p.speedLevel + 1;
    if (next > 25) return false;
    const cost = speedCost(next);
    if (p.cash < cost) {
      bus.emit('purchase:fail', { player: p, reason: 'cash', cost });
      return false;
    }
    p.cash -= cost;
    p.upgradeSpend += cost;
    p.speedLevel = next;
    bus.emit('speed:up', { player: p, level: next, cost });
    return true;
  }

  canRebirth(p) {
    return p.cash >= REBIRTH.threshold(p.rebirths);
  }

  rebirth(p) {
    if (!this.near(p, LAYOUT.shops.rebirth, 9) || !this.canRebirth(p)) return false;
    const g = this.gardens[p.slot];
    p.rebirths++;
    p.cash = PLAYER.startCash;
    p.speedLevel = 0;
    p.upgradeSpend = 0;
    for (const k of Object.keys(p.items)) p.items[k] = 0;
    g.cashPile = 0;
    g.planters.forEach((pl) => {
      pl.plant = null;
      pl.unlocked = pl.index < PLANTERS.startUnlocked;
    });
    p.celebrateUntil = this.time + 3;
    bus.emit('rebirth', { player: p, rebirths: p.rebirths });
    return true;
  }

  // ------------------------------------------------------------------ pets, looks, social

  buyEgg(p, eggId) {
    const egg = EGG[eggId];
    if (!egg || !LAYOUT.shops.pets || !this.near(p, LAYOUT.shops.pets, 9)) return null;
    if (p.cash < egg.price) {
      bus.emit('purchase:fail', { player: p, reason: 'cash', cost: egg.price });
      return null;
    }
    const valid = egg.odds.filter(([id, w]) => PET[id] && w > 0);
    const total = valid.reduce((a, [, w]) => a + w, 0);
    if (!total) return null;
    let r = this.rng.next() * total;
    let pet = valid[valid.length - 1][0];
    for (const [id, w] of valid) {
      if ((r -= w) < 0) {
        pet = id;
        break;
      }
    }
    p.cash -= egg.price;
    bus.emit('purchase', { player: p, what: 'egg:' + eggId, cost: egg.price, qty: 1 });
    bus.emit('pet:hatched', { player: p, egg: eggId, pet });
    return pet;
  }

  setPet(p, petId) {
    p.pet = petId && PET[petId] ? petId : null;
    p.mods = petMods(p.pet);
    bus.emit('pet:equipped', { player: p, pet: p.pet });
  }

  setLook(p, look) {
    if (!look || typeof look !== 'object') return;
    p.look = { ...p.char.look, ...look };
    bus.emit('player:look', { player: p });
  }

  // Emotes (moving, getting hit or carrying ends them) and quick-chat phrases.
  _handleSocial(p, moving, stunned) {
    const it = p.intent;
    const now = this.time;
    if (it.emote && EMOTE[it.emote] && !stunned && !p.carrying) {
      p.emote = { id: it.emote, until: now + EMOTE[it.emote].dur };
      bus.emit('emote', { player: p, id: it.emote });
    } else if (p.emote && (moving || stunned || p.carrying || now >= p.emote.until)) p.emote = null;
    if (it.say && PHRASE[it.say] && now >= (p._sayAt || 0)) {
      p._sayAt = now + 1.2;
      bus.emit('chat', { player: p, text: PHRASE[it.say].text, quick: true, phrase: it.say });
    }
  }

  /** Give one of your planted plants to another player (lands in their first free planter). */
  giftPlant(from, to, index) {
    if (!from || !to || from === to) return false;
    const pl = this.gardens[from.slot].planters[index];
    if (!pl?.plant || pl.stealer != null) return false;
    const dest = this.gardens[to.slot].planters.find((x) => x.unlocked && !x.plant);
    if (!dest) {
      bus.emit('gift:fail', { from, to, reason: 'full' });
      return false;
    }
    const plant = pl.plant;
    pl.plant = null;
    plant.owner = to.slot;
    dest.plant = plant;
    bus.emit('gift', { from, to, plant, planter: dest });
    return true;
  }

  /**
   * Swap plants and cash between two players in one go. offer = {planters: [index...], cash}.
   * Everything is checked first; nothing changes unless the whole trade fits.
   */
  trade(a, b, offerA, offerB) {
    if (!a || !b || a === b) return false;
    const norm = (o) => ({
      planters: [...new Set((Array.isArray(o?.planters) ? o.planters : []).filter((i) => Number.isInteger(i)))].slice(0, 10),
      cash: Math.max(0, Math.floor(Number(o?.cash) || 0)),
    });
    const oa = norm(offerA), ob = norm(offerB);
    const ga = this.gardens[a.slot], gb = this.gardens[b.slot];
    const ok = (p, g, o) => p.cash >= o.cash && o.planters.every((i) => g.planters[i]?.plant && g.planters[i].stealer == null);
    const room = (g, give, get) => g.planters.filter((x) => x.unlocked && !x.plant).length + give >= get;
    if (!ok(a, ga, oa) || !ok(b, gb, ob) || !room(ga, oa.planters.length, ob.planters.length) || !room(gb, ob.planters.length, oa.planters.length)) {
      bus.emit('trade:fail', { a, b });
      return false;
    }
    if (!oa.planters.length && !ob.planters.length && !oa.cash && !ob.cash) return false;
    const take = (g, o) => o.planters.map((i) => {
      const plant = g.planters[i].plant;
      g.planters[i].plant = null;
      return plant;
    });
    const fromA = take(ga, oa), fromB = take(gb, ob);
    const place = (g, slot, plants) => plants.forEach((plant) => {
      plant.owner = slot;
      g.planters.find((x) => x.unlocked && !x.plant).plant = plant;
    });
    place(ga, a.slot, fromB);
    place(gb, b.slot, fromA);
    a.cash += ob.cash - oa.cash;
    b.cash += oa.cash - ob.cash;
    bus.emit('trade:done', { a, b, offerA: oa, offerB: ob, plantsA: fromA, plantsB: fromB });
    return true;
  }

  // ------------------------------------------------------------------ slots (who plays which garden)

  _setIdentity(p, { kind = 'bot', profile = null, pid = null } = {}) {
    p.kind = kind;
    p.isHuman = kind === 'local';
    p.pid = pid;
    if (profile && kind !== 'bot') {
      p.profileId = profile.id;
      p.faceKey = kind === 'remote' ? 'r_' + pid : profile.id;
      p.name = profile.name || p.char.name;
      p.look = { ...p.char.look, ...(profile.look || {}) };
      const eq = profile.pets?.owned?.find((x) => x.uid === profile.pets.equipped);
      p.pet = eq && PET[eq.id] ? eq.id : typeof profile.pet === 'string' && PET[profile.pet] ? profile.pet : null;
    } else {
      p.profileId = p.char.id;
      p.faceKey = p.char.id;
      p.name = p.char.name;
      p.look = p.char.look;
      p.pet = null;
    }
    p.mods = petMods(p.pet);
    p.emote = null;
  }

  /**
   * Hand a garden slot to someone else at runtime (a friend joins, leaves, or a bot takes over).
   * The slot starts fresh, then loads `data` ({player, garden} from serializeSlot) if given.
   */
  setSlot(slot, cfg = {}) {
    const p = this.players[slot];
    if (!p) return null;
    const c = p.carrying;
    p.carrying = null;
    if (c?.kind === 'plant') this.returnPlant(c.plant, c.fromSlot, c.fromIndex);
    else if (c?.kind === 'seed') {
      const pod = this.pods[c.podId];
      if (pod && !pod.seed) {
        pod.seed = { speciesId: c.speciesId, mutation: c.mutation, lucky: !!c.lucky };
        pod.respawnAt = 0;
      }
    }
    for (const g of this.gardens) for (const pl of g.planters) if (pl.stealer === slot) pl.stealer = null;
    for (const m of this.monsters) if (m.target === slot) m.target = null;
    const fresh = new Player(slot, p.char, false);
    for (const k of ['cash', 'speedLevel', 'rebirths', 'upgradeSpend', 'items', 'selectedItem', 'stunUntil', 'invulnUntil', 'bonkReadyAt',
      'swingStart', 'coilUntil', 'cloakUntil', 'celebrateUntil', 'interact', 'prevInteract', 'intent', 'lastHitBy', 'stats']) p[k] = fresh[k];
    p.holdSpent = false;
    p._jumpQ = 0;
    const g = this.gardens[slot];
    const blankG = this._makeGarden(slot, p);
    g.cashPile = 0;
    g.lockedUntil = g.lockReadyAt = 0;
    g.lockActive = false;
    g.planters.forEach((pl, i) => {
      pl.unlocked = blankG.planters[i].unlocked;
      pl.plant = null;
      pl.stealer = null;
    });
    this._setIdentity(p, cfg);
    if (cfg.data) this.loadSlot(slot, cfg.data);
    this.respawn(p);
    this.human = this.players.find((q) => q.isHuman) || null;
    this._recomputeNetWorth();
    bus.emit('slot:changed', { slot, player: p });
    return p;
  }

  /** This slot's progress ({player, garden}) — what a player takes with them when they leave. */
  serializeSlot(slot) {
    const p = this.players[slot];
    const g = this.gardens[slot];
    const plantData = (pt) => ({ speciesId: pt.speciesId, mutation: pt.mutation, growTotal: pt.growTotal, growLeft: pt.growLeft });
    const garden = { cashPile: g.cashPile, planters: g.planters.map((pl) => ({ unlocked: pl.unlocked, plant: pl.plant ? plantData(pl.plant) : null })) };
    // our plants in a thief's hands still count as ours
    for (const q of this.players) {
      const c = q.carrying;
      if (c?.kind !== 'plant' || c.fromSlot !== slot) continue;
      const orig = garden.planters[c.fromIndex];
      const spot = orig && orig.unlocked && !orig.plant ? orig : garden.planters.find((x) => x.unlocked && !x.plant);
      if (spot) spot.plant = plantData(c.plant);
    }
    return { v: 1, player: p.serialize(), garden };
  }

  loadSlot(slot, data) {
    if (!data || typeof data !== 'object') return;
    if (data.player && typeof data.player === 'object') this.players[slot].restore(data.player);
    if (data.garden) this._restoreGarden(slot, data.garden);
  }

  // ------------------------------------------------------------------ full state (online sync)

  /** Everything needed to show this world on another device or keep it running after a host change. */
  serializeFull() {
    const plant = (pt) => pt && { uid: pt.uid, speciesId: pt.speciesId, mutation: pt.mutation, growTotal: pt.growTotal, growLeft: pt.growLeft, owner: pt.owner };
    return {
      v: 1,
      time: this.time,
      over: this.over,
      mode: this.mode,
      difficulty: this.difficultyId,
      uid: UID,
      nextEventAt: this.nextEventAt,
      event: this.event ? { type: this.event.type, startedAt: this.event.startedAt, endsAt: this.event.endsAt } : null,
      match: this.match ? { endsAt: this.match.endsAt } : null,
      players: this.players.map((p) => {
        const c = p.carrying;
        const it = p.interact;
        return {
          kind: p.kind === 'bot' ? 'bot' : 'player', pid: p.pid, profileId: p.profileId, name: p.name, look: p.look, pet: p.pet,
          pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, vel: { x: p.vel.x, y: p.vel.y, z: p.vel.z }, yaw: p.yaw, onGround: p.onGround,
          cash: p.cash, speedLevel: p.speedLevel, rebirths: p.rebirths, upgradeSpend: p.upgradeSpend, items: { ...p.items }, selectedItem: p.selectedItem,
          carrying: c ? (c.kind === 'plant' ? { kind: 'plant', plant: plant(c.plant), fromSlot: c.fromSlot, fromIndex: c.fromIndex } : { ...c }) : null,
          stunUntil: p.stunUntil, invulnUntil: p.invulnUntil, bonkReadyAt: p.bonkReadyAt, swingStart: p.swingStart,
          coilUntil: p.coilUntil, cloakUntil: p.cloakUntil, celebrateUntil: p.celebrateUntil,
          interact: { key: it.key, t: it.t, hold: it.hold, label: it.label, verb: it.verb, rarity: it.rarity },
          emote: p.emote, stats: { ...p.stats },
        };
      }),
      gardens: this.gardens.map((g) => ({
        cashPile: g.cashPile, lockedUntil: g.lockedUntil, lockReadyAt: g.lockReadyAt, lockActive: g.lockActive, collectedAt: g.collectedAt ?? -9,
        planters: g.planters.map((pl) => ({ unlocked: pl.unlocked, stealer: pl.stealer, plant: plant(pl.plant) })),
      })),
      pods: this.pods.map((pod) => ({ seed: pod.seed ? { ...pod.seed } : null, respawnAt: pod.respawnAt })),
      ground: this.ground.map((gi) => ({ ...gi })),
      projectiles: this.projectiles.map((b) => ({ ...b })),
      monsters: this.monsters.map((m) => ({
        uid: m.uid, x: m.x, y: m.y, z: m.z, yaw: m.yaw, vx: m.vx, vz: m.vz, state: m.state, target: m.target,
        stunUntil: m.stunUntil, attackAt: m.attackAt, wander: { ...m.wander }, wanderAt: m.wanderAt, ignore: { ...m.ignore },
      })),
    };
  }

  /**
   * Adopt a full state from serializeFull() (another device). `localSlot` is this device's own player:
   * its motion (pos/vel/yaw/onGround) stays local unless `force` is set. Existing objects are updated in
   * place so views keep their references.
   */
  applyFull(s, { localSlot = null, force = false, faceKeyOf = null } = {}) {
    if (!s || s.v !== 1) return;
    bumpUid(s.uid);
    this.time = s.time;
    this.over = !!s.over;
    this.nextEventAt = s.nextEventAt;
    const evDef = s.event && EVENTS.types.find((e) => e.id === s.event.type);
    this.event = evDef ? { type: evDef.id, def: evDef, startedAt: s.event.startedAt, endsAt: s.event.endsAt } : null;
    this.match = s.match ? { endsAt: s.match.endsAt } : null;
    const known = new Map();
    for (const g of this.gardens) for (const pl of g.planters) if (pl.plant) known.set(pl.plant.uid, pl.plant);
    for (const p of this.players) if (p.carrying?.kind === 'plant') known.set(p.carrying.plant.uid, p.carrying.plant);
    const plant = (d) => {
      if (!d || !PLANT[d.speciesId]) return null;
      const o = known.get(d.uid) || {};
      Object.assign(o, { uid: d.uid, speciesId: d.speciesId, mutation: MUTATIONS[d.mutation] ? d.mutation : 'normal', growTotal: d.growTotal, growLeft: d.growLeft, owner: d.owner });
      return o;
    };
    s.players.forEach((d, i) => {
      const p = this.players[i];
      if (!p || !d) return;
      const mine = i === localSlot;
      p.kind = mine ? 'local' : d.kind === 'bot' ? 'bot' : 'remote';
      p.isHuman = mine;
      p.pid = d.pid ?? null;
      p.profileId = d.profileId;
      p.faceKey = mine ? p.faceKey : p.kind === 'bot' ? p.char.id : faceKeyOf ? faceKeyOf(d) : 'r_' + d.pid;
      p.name = d.name;
      if (d.look && d.look !== p.look) p.look = d.look;
      if (d.pet !== p.pet) {
        p.pet = d.pet && PET[d.pet] ? d.pet : null;
        p.mods = petMods(p.pet);
      }
      if (!mine || force) {
        Object.assign(p.pos, d.pos);
        Object.assign(p.vel, d.vel);
        p.yaw = d.yaw;
        p.onGround = d.onGround;
      }
      for (const k of ['cash', 'speedLevel', 'rebirths', 'upgradeSpend', 'selectedItem', 'stunUntil', 'invulnUntil', 'bonkReadyAt', 'swingStart',
        'coilUntil', 'cloakUntil', 'celebrateUntil']) p[k] = d[k];
      Object.assign(p.items, d.items);
      Object.assign(p.stats, d.stats);
      const c = d.carrying;
      p.carrying = !c ? null : c.kind === 'plant' ? { kind: 'plant', plant: plant(c.plant), fromSlot: c.fromSlot, fromIndex: c.fromIndex } : { ...c };
      if (p.carrying?.kind === 'plant' && !p.carrying.plant) p.carrying = null;
      Object.assign(p.interact, d.interact);
      p.emote = d.emote;
    });
    s.gardens.forEach((d, i) => {
      const g = this.gardens[i];
      if (!g || !d) return;
      g.cashPile = d.cashPile;
      g.lockedUntil = d.lockedUntil;
      g.lockReadyAt = d.lockReadyAt;
      g.lockActive = d.lockActive;
      g.collectedAt = d.collectedAt;
      d.planters.forEach((pd, j) => {
        const pl = g.planters[j];
        if (!pl || !pd) return;
        pl.unlocked = pd.unlocked;
        pl.stealer = pd.stealer;
        pl.plant = plant(pd.plant);
      });
    });
    s.pods.forEach((d, i) => {
      const pod = this.pods[i];
      if (!pod || !d) return;
      pod.seed = d.seed && PLANT[d.seed.speciesId] ? { ...d.seed } : null;
      pod.respawnAt = d.respawnAt;
    });
    this.ground = s.ground.filter((gi) => gi && (gi.kind === 'banana' || PLANT[gi.speciesId])).map((gi) => ({ ...gi }));
    this.projectiles = s.projectiles.map((b) => ({ ...b }));
    s.monsters.forEach((d, i) => {
      const m = this.monsters[i];
      if (!m || !d) return;
      Object.assign(m, d, { wander: { ...d.wander }, ignore: { ...d.ignore } });
    });
    this.human = this.players.find((p) => p.isHuman) || null;
    this._recomputeNetWorth();
  }

  // ------------------------------------------------------------------ match

  _endMatch() {
    if (this.over) return;
    // A steal only counts once the thief gets it home: plants still in someone's arms at the buzzer go
    // back to their owner first, so the ranking always matches the gardens on the podium.
    for (const p of this.players) {
      const c = p.carrying;
      if (c?.kind !== 'plant') continue;
      p.carrying = null;
      this.returnPlant(c.plant, c.fromSlot, c.fromIndex);
    }
    this._recomputeNetWorth();
    this.over = true;
    const ranking = this.ranking().map((p) => ({ player: p, netWorth: this.netWorth.get(p) }));
    ranking[0].player.celebrateUntil = this.time + 999;
    bus.emit('match:end', { ranking });
  }

  timeLeft() {
    return this.match ? Math.max(0, this.match.endsAt - this.time) : null;
  }

  // ------------------------------------------------------------------ save / load

  serialize() {
    const plantData = (pt) => ({ speciesId: pt.speciesId, mutation: pt.mutation, growTotal: pt.growTotal, growLeft: pt.growLeft });
    const gardens = this.gardens.map((g) => ({
      cashPile: g.cashPile,
      planters: g.planters.map((pl) => ({ unlocked: pl.unlocked, plant: pl.plant ? plantData(pl.plant) : null })),
    }));
    // stolen plants still in someone's hands go home in the save (as if the thief had been bonked)
    for (const p of this.players) {
      const c = p.carrying;
      if (c?.kind !== 'plant') continue;
      const gs = gardens[c.fromSlot];
      const orig = gs.planters[c.fromIndex];
      const spot = orig && orig.unlocked && !orig.plant ? orig : gs.planters.find((x) => x.unlocked && !x.plant);
      if (spot) spot.plant = plantData(c.plant);
      else gs.cashPile += Math.round(this.plantIncome(c.plant, this.players[c.fromSlot]) * SELL_SECONDS);
    }
    return { v: 1, humanId: this.human?.id ?? null, difficulty: this.difficultyId, players: this.players.map((p) => p.serialize()), gardens };
  }

  restore(s) {
    if (!s || s.v !== 1) return;
    const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
    if (Array.isArray(s.players)) s.players.forEach((ps, i) => ps && typeof ps === 'object' && this.players[i]?.restore(ps));
    if (!Array.isArray(s.gardens)) return;
    s.gardens.forEach((gs, i) => this._restoreGarden(i, gs));
  }

  _restoreGarden(i, gs) {
    const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
    const g = this.gardens[i];
    if (!g || !gs || typeof gs !== 'object') return;
    {
      g.cashPile = Math.max(0, num(gs.cashPile));
      if (!Array.isArray(gs.planters)) return;
      gs.planters.forEach((ps, j) => {
        const pl = g.planters[j];
        if (!pl || !ps || typeof ps !== 'object') return;
        pl.unlocked = !!ps.unlocked || j < PLANTERS.startUnlocked;
        const d = ps.plant;
        const sp = d && PLANT[d.speciesId];
        if (!sp) {
          pl.plant = null;
          return;
        }
        const growTotal = num(d.growTotal, sp.grow) > 0 ? num(d.growTotal, sp.grow) : sp.grow;
        pl.plant = { uid: uid(), speciesId: d.speciesId, mutation: MUTATIONS[d.mutation] ? d.mutation : 'normal', growTotal,
          growLeft: clamp(num(d.growLeft, 0), 0, growTotal), owner: i };
      });
    }
  }
}

export function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [u, v] of units) {
    if (n >= v * 0.9995) {
      const x = n / v;
      const str = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      // trim trailing zeros after the decimal point only (640K must stay 640K)
      return (str.includes('.') ? str.replace(/0+$/, '').replace(/\.$/, '') : str) + u;
    }
  }
  return String(n);
}
