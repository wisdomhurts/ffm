// Bot goals: small state machines the brain picks between. Each update() fills the Intent and
// returns 'running' | 'done' | 'failed'. Movement goes through bot.motor; shared helpers live on the bot.
import { PLAYER, PLANTERS, ITEM } from '../config.js';
import { gardenContains } from '../gameplay/layout.js';
import { hyp, gardenInfo, planterSpot, podSpot, podGuards, yawTo, seedIncome, runSpeed, carrySeedSpeed, wrapAngle } from './util.js';
import { getBoard, claimPod, releaseClaims } from './blackboard.js';
import { practiceEvent } from './practice.js';

export class Goal {
  constructor(type, u = 0) {
    this.type = type;
    this.u = u;
    this.sig = type;
    this.phase = '';
    this.t0 = 0;
    this.phaseAt = 0;
    this.pre = []; // errands before the main job: {kind:'lock'|'collect'|'sell'}
  }

  get interruptible() {
    return true;
  }

  begin(bot, game) {
    this.t0 = game.time;
    this.phaseAt = game.time;
  }

  setPhase(ph, game) {
    if (this.phase !== ph) {
      this.phase = ph;
      this.phaseAt = game.time;
    }
  }

  inPhase(game) {
    return game.time - this.phaseAt;
  }

  age(game) {
    return game.time - this.t0;
  }

  end() {}

  update() {
    return 'done';
  }
}

// ------------------------------------------------------------------ shared behaviours

/**
 * Walk to a side of planter `pl`, lean into it so its prompt is the closest, then face it.
 * `key` is the expected prompt key (null when carrying, as prompts are disabled then).
 * Returns 'moving' | 'ready' | 'fail'. The chosen side is cached on `holder`.
 */
export function goToPlanter(bot, game, p, it, dt, g, pl, key, interactable, holder) {
  if (!holder.spot || holder.spotFor !== pl) {
    holder.spot = planterSpot(game, g, pl, p.pos.x, p.pos.z, interactable);
    holder.spotFor = pl;
    holder.spotOpts = { arrive: 0.45, key: 'spot' + pl.index };
  }
  const spot = holder.spot;
  if (!spot) return 'fail';
  const px = p.pos.x, pz = p.pos.z;
  const dc = hyp(pl.x - px, pl.z - pz);
  if ((key && p.interact.key === key) || (!key && dc < 3.98)) {
    bot.motor.stop();
    it.moveX = 0;
    it.moveZ = 0;
    it.aimYaw = yawTo(px, pz, pl.x, pl.z);
    return 'ready';
  }
  const ds = hyp(spot.x - px, spot.z - pz);
  if (ds > 1.0 && dc > 4.4) {
    bot.motor.goTo(spot.x, spot.z, holder.spotOpts);
    bot.motor.update(game, p, dt, it);
    if (bot.motor.failed) return 'fail';
    return 'moving';
  }
  bot.motor.stop();
  it.moveX = ((pl.x - px) / dc) * 0.3;
  it.moveZ = ((pl.z - pz) / dc) * 0.3;
  return 'moving';
}

const grownPlant = (q) => !!q.plant && q.plant.growLeft <= 0;
const LOCK_OPTS = { arrive: 0.7, key: 'lockpad' };
const LURK_OPTS = { arrive: 1.5, key: 'lurk', speed: 0.7 };
const PATROL_OPTS = { arrive: 1.2, key: 'patrol', speed: 0.55 };
const COLLECT_OPTS = { arrive: 0.8, key: 'collectpad' };

function stepLock(bot, game, p, it, dt) {
  const g = game.gardens[p.slot];
  if (game.isLocked(g) || game.time < g.lockReadyAt) return true;
  const pad = bot.home.lockPad;
  bot.motor.goTo(pad.x, pad.z, LOCK_OPTS);
  bot.motor.update(game, p, dt, it);
  return bot.motor.failed;
}

// Done once the pad paid out (the pile refills every tick when income is high, so don't wait for 0).
function stepCollect(bot, game, p, it, dt, s) {
  const g = game.gardens[p.slot];
  if (s.base == null) s.base = p.stats.collected;
  if (p.stats.collected > s.base || g.cashPile < 1) return true;
  const pad = bot.home.collectPad;
  bot.motor.goTo(pad.x, pad.z, COLLECT_OPTS);
  bot.motor.update(game, p, dt, it);
  return bot.motor.failed;
}

function stepSell(bot, game, p, it, dt, s) {
  const info = gardenInfo(game, p.slot);
  if (info.free > 0 || !info.weakest) return true;
  if (!s.pl || !s.pl.plant) s.pl = info.weakest;
  const r = goToPlanter(bot, game, p, it, dt, info.g, s.pl, 'sell' + s.pl.index, grownPlant, s);
  if (r === 'ready') it.interact = true;
  return r === 'fail';
}

/** Runs the goal's errands. Returns true while an errand is in progress. */
function runPre(goal, bot, game, p, it, dt) {
  const now = game.time;
  while (goal.pre.length) {
    const s = goal.pre[0];
    if (s.at == null) s.at = now;
    let done = now - s.at > 12;
    if (!done) {
      if (s.kind === 'lock') done = stepLock(bot, game, p, it, dt);
      else if (s.kind === 'collect') done = stepCollect(bot, game, p, it, dt, s);
      else if (s.kind === 'sell') done = stepSell(bot, game, p, it, dt, s);
      else done = true;
    }
    if (!done) return true;
    goal.pre.shift();
    bot.motor.stop();
  }
  return false;
}

// ------------------------------------------------------------------ carrying something home

export class ReturnGoal extends Goal {
  /** `practice`: the practice thief strolls home at ~70% so the owner can catch up, no tricks. */
  constructor(practice = false) {
    super('return', 1e9);
    this.sellT = 0;
    this.waitT = 0;
    this.practice = practice;
    this.opts = { arrive: 0.8, key: 'home', lane: 0, speed: practice ? 0.7 : 1 };
  }

  get interruptible() {
    return false;
  }

  update(bot, game, p, it, dt) {
    if (!p.carrying) return 'done';
    const home = bot.home;
    if (p.carrying.kind === 'seed' && gardenContains(home, p.pos.x, p.pos.z, 1)) {
      const info = gardenInfo(game, p.slot);
      if (info.free === 0) return this._makeRoom(bot, game, p, it, dt, info);
    }
    this.opts.lane = bot.lane;
    bot.motor.goTo(home.inside.x, home.inside.z, this.opts);
    bot.motor.update(game, p, dt, it);
    if (!this.practice || p.carrying.kind !== 'plant') bot.escapeKit(game, p, it);
    return 'running';
  }

  // Carrying a seed into a full garden (rare: plans reserve a free planter). Prompts are disabled
  // while carrying, so this uses the game actions directly after standing at the planter.
  _makeRoom(bot, game, p, it, dt, info) {
    const g = info.g;
    this.waitT += dt;
    if (info.nextLocked >= 0 && p.cash >= PLANTERS.unlockCost[info.nextLocked]) {
      const pl = g.planters[info.nextLocked];
      if (goToPlanter(bot, game, p, it, dt, g, pl, null, () => false, this) === 'ready') game.unlockPlanter(p, pl.index);
      return 'running';
    }
    const inc = seedIncome(p, p.carrying.speciesId, p.carrying.mutation);
    if (info.weakest && (inc > info.weakestInc || this.waitT > 6)) {
      const pl = info.weakest;
      const r = goToPlanter(bot, game, p, it, dt, g, pl, 'sell' + pl.index, grownPlant, this);
      if (r === 'ready') {
        if (p.interact.key === 'sell' + pl.index) it.interact = true;
        else if ((this.sellT += dt) >= PLAYER.sellHold) {
          this.sellT = 0;
          game.sellPlant(p, pl);
        }
      }
      return 'running';
    }
    // everything is still growing: wait by the gate
    const L = bot.home;
    bot.motor.goTo(L.inside.x, L.inside.z, { arrive: 1.5, key: 'wait' });
    bot.motor.update(game, p, dt, it);
    return 'running';
  }
}

// ------------------------------------------------------------------ farming the Seed Road

export class FarmGoal extends Goal {
  constructor(pod, u, needRoom) {
    super('farm', u);
    this.pod = pod;
    this.sig = 'farm:' + pod.id;
    this.seedKey = pod.seed ? pod.seed.speciesId + ':' + pod.seed.mutation : '';
    this.needRoom = needRoom;
    this.bonked = false;
    this.key = 'pod' + pod.id;
    this.spot = podSpot(pod);
    this.goOpts = { arrive: 1.0, key: this.key, lane: 0 };
    this.spotOpts = { arrive: 0.5, key: 'podspot' };
    this.chaseOpts = { chase: true, arrive: 3.2, key: 'monster' };
  }

  begin(bot, game, p) {
    super.begin(bot, game, p);
    this.pre = bot.departureErrands(game, p, { room: this.needRoom });
    this.setPhase('go', game);
  }

  end(bot, game, p) {
    releaseClaims(game, p.slot);
  }

  update(bot, game, p, it, dt) {
    if (p.carrying) return 'done';
    const pod = this.pod;
    const seed = pod.seed;
    if (!seed || seed.speciesId + ':' + seed.mutation !== this.seedKey) return 'failed';
    if (runPre(this, bot, game, p, it, dt)) return 'running';
    const now = game.time;
    const spot = this.spot;
    const d = hyp(spot.x - p.pos.x, spot.z - p.pos.z);
    const key = this.key;

    if (this.phase === 'go') {
      claimPod(game, p.slot, pod.id, d / runSpeed(game, p));
      if (d < 48 && !this.bonked) {
        // two fast guards by the pod: not worth it (unless coiled up)
        if (now > p.coilUntil && podGuards(game, p, pod, carrySeedSpeed(game, p)) >= 2 && bot.rng.next() < 0.9) return 'failed';
        const m = bot.guardMonster(game, p, pod);
        if (m) {
          this.monster = m;
          this.setPhase('guard', game);
          return 'running';
        }
      }
      if (p.interact.key === key || d < 1.4) {
        this.setPhase('grab', game);
      } else {
        // travel up the middle of the road (room to dodge), then cut across to the pod
        this.goOpts.lane = bot.lane;
        this.goOpts.via = p.pos.z < pod.z - 30 ? (this.via || (this.via = [{ x: bot.lane, z: pod.z - 16 }])) : null;
        bot.motor.goTo(spot.x, spot.z, this.goOpts);
        bot.motor.update(game, p, dt, it);
        if (bot.motor.failed) return 'failed';
        if (d > 200) bot.maybeCoil(game, p, it, 'trip');
        return 'running';
      }
    }

    if (this.phase === 'guard') {
      const m = this.monster;
      if (now < m.stunUntil - 0.2) {
        this.bonked = true;
        this.setPhase('go', game);
        return 'running';
      }
      if (this.inPhase(game) > 7 || m.biome !== pod.biome) {
        this.bonked = true;
        this.setPhase('go', game);
        return 'running';
      }
      bot.motor.goTo(m.x, m.z, this.chaseOpts);
      bot.motor.update(game, p, dt, it);
      bot.tryBonk(game, p, m, it);
      return 'running';
    }

    // grab: hold E on the pod
    const k = p.interact.key;
    if (k === key) {
      bot.motor.stop();
      it.moveX = 0;
      it.moveZ = 0;
      it.interact = true;
      it.aimYaw = yawTo(p.pos.x, p.pos.z, pod.x, pod.z);
    } else if (k && k[0] === 'g') {
      bot.press(it, p); // a dropped seed right here: take that one
    } else {
      if (this.inPhase(game) > 4) return 'failed';
      bot.motor.goTo(spot.x, spot.z, this.spotOpts);
      bot.motor.update(game, p, dt, it);
    }
    return 'running';
  }
}

// ------------------------------------------------------------------ stealing

export class StealGoal extends Goal {
  constructor(vslot, index, u) {
    super('steal', u);
    this.vslot = vslot;
    this.index = index;
    this.sig = 'steal:' + vslot + ':' + index;
  }

  get interruptible() {
    return this.phase !== 'steal';
  }

  begin(bot, game, p) {
    super.begin(bot, game, p);
    this.pre = bot.departureErrands(game, p, {});
    getBoard(game).stealClaims.set(p.slot, this.vslot);
    this.setPhase('approach', game);
  }

  end(bot, game, p) {
    getBoard(game).stealClaims.delete(p.slot);
  }

  update(bot, game, p, it, dt) {
    if (p.carrying) return 'done';
    const now = game.time;
    const g = game.gardens[this.vslot];
    const pl = g.planters[this.index];
    if (!grownPlant(pl) || (pl.stealer != null && pl.stealer !== p.slot)) return 'failed';
    const inside = gardenContains(g.L, p.pos.x, p.pos.z);
    if (game.isLocked(g) && !inside) return 'failed';
    if (runPre(this, bot, game, p, it, dt)) return 'running';
    const owner = g.owner;
    const key = 'steal' + g.slot + '_' + pl.index;

    // the owner is about to bonk us: bail out (unless the plant is nearly ours)
    if (bot.ownerCloseIn(game, p, owner) && !(this.phase === 'steal' && p.interact.t > PLAYER.stealHold - 0.4)) {
      bot.stealAbortedAt = now;
      return 'failed';
    }

    if (this.phase === 'approach') {
      const o = g.L.outside;
      const d = hyp(o.x - p.pos.x, o.z - p.pos.z);
      if (!inside && d > 2.5) {
        if (d < 14) bot.maybeCloak(game, p, it, g, pl);
        bot.motor.goTo(o.x, o.z, this.gateOpts || (this.gateOpts = { arrive: 2.2, key: 'vgate' + g.slot }));
        bot.motor.update(game, p, dt, it);
        return bot.motor.failed ? 'failed' : 'running';
      }
      this.setPhase('enter', game);
    }

    if (this.phase === 'enter') {
      const r = goToPlanter(bot, game, p, it, dt, g, pl, key, grownPlant, this);
      if (r === 'ready') this.setPhase('steal', game);
      else if (r === 'fail' || this.inPhase(game) > 12) return 'failed';
      return 'running';
    }

    // steal: hold E for stealHold seconds
    if (p.interact.key !== key) {
      if (this.inPhase(game) > 0.5) this.setPhase('enter', game);
      return 'running';
    }
    bot.motor.stop();
    it.moveX = 0;
    it.moveZ = 0;
    it.interact = true;
    it.aimYaw = yawTo(p.pos.x, p.pos.z, pl.x, pl.z);
    if (!this.announced) {
      this.announced = true;
      bot.onStealStart(game, p, owner);
    }
    return 'running';
  }
}

/**
 * The practice steal (Chill, or Normal if nobody robbed the human yet): walk over in plain sight,
 * look around at the gate and at the planter, hold the steal, then stroll home (ReturnGoal in
 * practice mode). Never bails out when the owner comes: getting bonked is the whole point.
 */
export class PracticeStealGoal extends Goal {
  constructor(vslot, index) {
    super('practice', 1e5);
    this.vslot = vslot;
    this.index = index;
    this.sig = 'practice';
    this.walkOpts = { arrive: 2.2, key: 'pgate', speed: 0.8 };
  }

  get interruptible() {
    return false;
  }

  begin(bot, game, p) {
    super.begin(bot, game, p);
    const b = getBoard(game);
    b.practice.state = 'active';
    b.practice.slot = p.slot;
    // nobody else robs the human around the lesson
    b.humanStealUntil = Math.max(b.humanStealUntil, game.time + 60);
    b.stealClaims.set(p.slot, this.vslot);
    this.setPhase('approach', game);
  }

  end(bot, game, p) {
    const b = getBoard(game);
    b.stealClaims.delete(p.slot);
    const pr = b.practice;
    if (pr.state !== 'active' || pr.slot !== p.slot || p.carrying) return; // carrying: the return trip owns it now
    if (this.bonked) {
      pr.state = 'done';
      bot.sayPractice(game, p, 'caught', { victim: game.players[this.vslot].name });
      practiceEvent('caught', p, game.players[this.vslot], game.gardens[this.vslot].planters[this.index].plant);
    } else {
      pr.state = 'idle';
      pr.checkAt = game.time + 12;
    }
  }

  update(bot, game, p, it, dt) {
    if (p.carrying) return 'done';
    const now = game.time;
    const g = game.gardens[this.vslot];
    const pl = g.planters[this.index];
    const owner = g.owner;
    if (now < p.stunUntil) {
      // bonked before we even got the pot: lesson learned early
      if (p.lastHitBy === owner) this.bonked = true;
      return 'failed';
    }
    if (!grownPlant(pl) || (pl.stealer != null && pl.stealer !== p.slot)) return 'failed';
    const inside = gardenContains(g.L, p.pos.x, p.pos.z);
    if (game.isLocked(g) && !inside) return 'failed';
    if (this.age(game) > 60) return 'failed';
    const key = 'steal' + g.slot + '_' + pl.index;
    const look = () => yawTo(p.pos.x, p.pos.z, owner.pos.x, owner.pos.z);
    // only a lesson if the owner is around to see it
    const ownerD = hyp(owner.pos.x - g.L.center.x, owner.pos.z - g.L.center.z);
    const ownerHere = ownerD < 45 || (ownerD < 90 && owner.carrying?.kind === 'seed' && owner.pos.z < 60);

    if (this.phase === 'approach') {
      const o = g.L.outside;
      const d = hyp(o.x - p.pos.x, o.z - p.pos.z);
      if (!inside && d > 2.5) {
        // hurry over, then walk the last bit in plain sight
        this.walkOpts.speed = d > 30 ? 1 : 0.75;
        bot.motor.goTo(o.x, o.z, this.walkOpts);
        bot.motor.update(game, p, dt, it);
        return bot.motor.failed ? 'failed' : 'running';
      }
      this.setPhase('peek', game);
      bot.hop(1);
    }

    if (this.phase === 'peek') {
      // a sneaky look around at the gate (plenty of warning); wait a little for the owner to come home
      bot.motor.stop();
      it.aimYaw = look() + Math.sin(this.inPhase(game) * 5) * 0.6;
      if (!ownerHere) {
        this.waited = (this.waited || 0) + dt;
        return this.waited > 15 ? 'failed' : 'running';
      }
      if (this.inPhase(game) < 1.2) return 'running';
      this.setPhase('enter', game);
    }

    // they left again before we started: try another time
    if (this.phase !== 'steal' && ownerD > 60) return 'failed';

    if (this.phase === 'enter') {
      const r = goToPlanter(bot, game, p, it, dt, g, pl, key, grownPlant, this);
      if (r === 'ready') this.setPhase('windup', game);
      else if (r === 'fail' || this.inPhase(game) > 12) return 'failed';
      return 'running';
    }

    if (this.phase === 'windup') {
      bot.motor.stop();
      it.aimYaw = this.inPhase(game) < 0.5 ? look() : yawTo(p.pos.x, p.pos.z, pl.x, pl.z);
      if (this.inPhase(game) < 0.9) return 'running';
      this.setPhase('steal', game);
    }

    // steal: hold E for the full stealHold
    if (p.interact.key !== key) {
      if (this.inPhase(game) > 0.5) this.setPhase('enter', game);
      return 'running';
    }
    bot.motor.stop();
    it.moveX = 0;
    it.moveZ = 0;
    it.interact = true;
    it.aimYaw = yawTo(p.pos.x, p.pos.z, pl.x, pl.z);
    if (!this.announced) {
      this.announced = true;
      bot.onStealStart(game, p, owner);
      practiceEvent('start', p, owner, pl.plant);
    }
    return 'running';
  }
}

/** Thief waits near a garden for its owner to leave. */
export class LurkGoal extends Goal {
  constructor(vslot, u) {
    super('lurk', u);
    this.vslot = vslot;
    this.sig = 'lurk:' + vslot;
  }

  update(bot, game, p, it, dt) {
    const g = game.gardens[this.vslot];
    const L = g.L;
    if (this.age(game) > 14) return 'done';
    if (!this.spot) {
      const side = bot.rng.next() < 0.5 ? -1 : 1;
      this.spot = { x: L.outside.x - L.inward * 7, z: L.outside.z + side * 10 };
    }
    bot.motor.goTo(this.spot.x, this.spot.z, LURK_OPTS);
    if (!bot.motor.update(game, p, dt, it)) it.aimYaw = yawTo(p.pos.x, p.pos.z, L.center.x, L.center.z) + Math.sin(game.time * 0.9) * 0.5;
    return 'running';
  }
}

// ------------------------------------------------------------------ defending

export class DefendGoal extends Goal {
  constructor(thief, u) {
    super('defend', u);
    this.q = thief;
    this.sig = 'defend:' + thief.slot;
    this.throwAt = 0;
  }

  get interruptible() {
    return false;
  }

  update(bot, game, p, it, dt) {
    const q = this.q;
    const now = game.time;
    if (!bot.isThreat(game, p, q)) return 'done';
    if (q.invisible(now)) return 'failed';
    const limit = bot.pers.chaseTime * (q.isHuman ? bot.diff.humanChaseMult : 1);
    if (this.age(game) > limit) return 'failed';
    const d = hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
    if (bot.tryBalloon(game, p, q, it, d)) return 'running';
    let tx, tz;
    const ambush = this._ambushPoint(bot, game, p, q, d);
    if (ambush) {
      tx = ambush.x;
      tz = ambush.z;
    } else {
      const lead = Math.min(0.7, d / Math.max(8, runSpeed(game, p)));
      tx = q.pos.x + q.vel.x * lead;
      tz = q.pos.z + q.vel.z * lead;
    }
    bot.sepIgnore = q;
    bot.motor.goTo(tx, tz, this.opts || (this.opts = { chase: true, arrive: 0.3, key: 'chase' + q.slot }));
    bot.motor.update(game, p, dt, it);
    bot.tryBonk(game, p, q, it);
    return 'running';
  }

  // A thief with our plant heads for our gate, then their own gate. If we can get to the next gate
  // first, wait there instead of chasing (Esther cutting them off).
  _ambushPoint(bot, game, p, q, d) {
    if (d < 9 || q.carrying?.kind !== 'plant') return null;
    const mine = bot.home;
    const theirs = game.layout.gardens[q.slot];
    const gate = gardenContains(mine, q.pos.x, q.pos.z) ? mine.outside : theirs.outside;
    const qT = hyp(gate.x - q.pos.x, gate.z - q.pos.z) / Math.max(4, q.maxSpeed(game.time, game.difficulty.botSpeedMult));
    const pT = hyp(gate.x - p.pos.x, gate.z - p.pos.z) / Math.max(4, runSpeed(game, p));
    return pT + 0.4 < qT ? gate : null;
  }

  end(bot) {
    bot.sepIgnore = null;
  }
}

/** Bonk a rival carrying a good seed, then grab the seed they drop. */
export class MugGoal extends Goal {
  constructor(target, u) {
    super('mug', u);
    this.q = target;
    this.sig = 'mug:' + target.slot;
  }

  update(bot, game, p, it, dt) {
    const q = this.q;
    const now = game.time;
    if (p.carrying) return 'done';
    if (this.age(game) > 9) return 'failed';
    if (this.dropped == null) {
      if (!q.carrying || q.carrying.kind !== 'seed') {
        // did it land on the ground next to them?
        const gi = game.ground.find((x) => x.kind === 'seed' && hyp(x.x - q.pos.x, x.z - q.pos.z) < 6 && now - x.droppedAt < 1);
        if (!gi) return 'failed';
        this.dropped = gi;
      } else {
        if (q.invisible(now)) return 'failed';
        bot.sepIgnore = q;
        const lead = 0.25;
        bot.motor.goTo(q.pos.x + q.vel.x * lead, q.pos.z + q.vel.z * lead, this.opts || (this.opts = { chase: true, arrive: 0.3, key: 'mug' + q.slot }));
        bot.motor.update(game, p, dt, it);
        bot.tryBonk(game, p, q, it);
        return 'running';
      }
    }
    return grabGround(bot, game, p, it, dt, this.dropped);
  }

  end(bot) {
    bot.sepIgnore = null;
  }
}

function grabGround(bot, game, p, it, dt, gi) {
  if (!game.ground.includes(gi)) return p.carrying ? 'done' : 'failed';
  if (p.interact.key === 'g' + gi.uid) {
    bot.press(it, p);
    bot.motor.stop();
    return 'running';
  }
  bot.motor.goTo(gi.x, gi.z, { arrive: 0.6, key: 'ground' + gi.uid });
  bot.motor.update(game, p, dt, it);
  return 'running';
}

export class GroundGoal extends Goal {
  constructor(item, u) {
    super('ground', u);
    this.gi = item;
    this.sig = 'ground:' + item.uid;
  }

  update(bot, game, p, it, dt) {
    if (p.carrying) return 'done';
    if (this.age(game) > 12) return 'failed';
    return grabGround(bot, game, p, it, dt, this.gi);
  }
}

// ------------------------------------------------------------------ home economy

export class ShopGoal extends Goal {
  constructor(plan, u) {
    super('shop', u);
    this.plan = plan; // {speed:bool, items:[id], rebirth:bool}
    this.sig = 'shop';
    this.buyAt = 0;
  }

  begin(bot, game, p) {
    super.begin(bot, game, p);
    this.pre = bot.departureErrands(game, p, { need: this.plan.cost });
    this.setPhase(this.plan.rebirth ? 'rebirth' : this.plan.speed ? 'speed' : 'gear', game);
    this.opts = { arrive: 2.2, key: 'shop' };
  }

  update(bot, game, p, it, dt) {
    if (p.carrying) return 'failed';
    if (runPre(this, bot, game, p, it, dt)) return 'running';
    const now = game.time;
    const shops = game.layout.shops;
    const shop = this.phase === 'rebirth' ? shops.rebirth : this.phase === 'speed' ? shops.speed : shops.gear;
    const sx = shop.x + bot.shopJitter, sz = shop.z + 2;
    const d = hyp(sx - p.pos.x, sz - p.pos.z);
    if (d > 3 && hyp(shop.x - p.pos.x, shop.z - p.pos.z) > 6.5) {
      this.opts.key = this.phase;
      bot.motor.goTo(sx, sz, this.opts);
      bot.motor.update(game, p, dt, it);
      return bot.motor.failed ? 'failed' : 'running';
    }
    bot.motor.stop();
    it.aimYaw = yawTo(p.pos.x, p.pos.z, shop.x, shop.z - 8);
    if (now < this.buyAt) return 'running';
    this.buyAt = now + 0.35;
    if (this.phase === 'rebirth') {
      game.rebirth(p);
      return 'done';
    }
    if (this.phase === 'speed') {
      if (bot.wantsMoreSpeed(game, p, 1) && game.buySpeed(p)) return 'running';
      if (this.plan.items.length) this.setPhase('gear', game);
      else return 'done';
      return 'running';
    }
    // gear shop: one item per tick of the buy timer
    while (this.plan.items.length) {
      const id = this.plan.items[0];
      const want = bot.pers.items[id] || 0;
      if ((p.items[id] || 0) < want && p.cash >= ITEM[id].price * 1.15 && game.buyItem(p, id, 1)) return 'running';
      this.plan.items.shift();
    }
    return 'done';
  }
}

export class UnlockGoal extends Goal {
  constructor(index, u) {
    super('unlock', u);
    this.index = index;
    this.sig = 'unlock:' + index;
  }

  begin(bot, game, p) {
    super.begin(bot, game, p);
    if (p.cash < PLANTERS.unlockCost[this.index]) this.pre.push({ kind: 'collect' });
  }

  update(bot, game, p, it, dt) {
    if (p.carrying) return 'failed';
    const g = game.gardens[p.slot];
    const pl = g.planters[this.index];
    if (pl.unlocked) return 'done';
    if (this.age(game) > 25) return 'failed';
    if (runPre(this, bot, game, p, it, dt)) return 'running';
    if (p.cash < PLANTERS.unlockCost[this.index]) return 'failed';
    const r = goToPlanter(bot, game, p, it, dt, g, pl, 'unlock' + pl.index, (q) => !q.unlocked || grownPlant(q), this);
    if (r === 'ready') bot.press(it, p);
    return r === 'fail' ? 'failed' : 'running';
  }
}

export class WaterGoal extends Goal {
  constructor(planter, u) {
    super('water', u);
    this.pl = planter;
    this.sig = 'water:' + planter.index;
  }

  update(bot, game, p, it, dt) {
    const pl = this.pl;
    if (p.carrying || !pl.plant || pl.plant.growLeft <= 5 || (p.items.bucket || 0) <= 0) return 'failed';
    if (this.age(game) > 20) return 'failed';
    const g = game.gardens[p.slot];
    const r = goToPlanter(bot, game, p, it, dt, g, pl, null, (q) => !!q.plant && q.plant.growLeft > 0, this);
    if (r === 'ready') {
      it.useItem = 'bucket';
      return 'done';
    }
    return r === 'fail' ? 'failed' : 'running';
  }
}

export class CollectGoal extends Goal {
  constructor(u) {
    super('collect', u);
    this.step = { at: 0 };
  }

  update(bot, game, p, it, dt) {
    if (p.carrying) return 'failed';
    if (this.age(game) > 15) return 'failed';
    return stepCollect(bot, game, p, it, dt, this.step) ? 'done' : 'running';
  }
}

export class LockGoal extends Goal {
  constructor(u) {
    super('lock', u);
  }

  update(bot, game, p, it, dt) {
    if (p.carrying || this.age(game) > 10) return 'failed';
    return stepLock(bot, game, p, it, dt) ? 'done' : 'running';
  }
}

// ------------------------------------------------------------------ idling

/**
 * Hang around: guardians patrol their gate and watch the plaza, others potter about their garden,
 * look around, hop. Short, so the brain soon finds something better to do.
 */
export class PatrolGoal extends Goal {
  constructor(u, duration = 6) {
    super('patrol', u);
    this.duration = duration;
    this.waitUntil = 0;
    this.point = null;
  }

  update(bot, game, p, it, dt) {
    const now = game.time;
    if (p.carrying) return 'failed';
    if (this.age(game) > this.duration) return 'done';
    const L = bot.home;
    if (!this.point || (bot.motor.arrived && now > this.waitUntil)) {
      const rng = bot.rng;
      if (!this.point && (bot.ease > 0.4 || bot.coast > 0) && rng.next() < 0.35) {
        // relaxed (well ahead of the human): hang out in the plaza for a bit, by the fountain or the road gate
        const a = rng.range(0, Math.PI * 2);
        this.point = rng.next() < 0.6 ? { x: Math.sin(a) * rng.range(9, 14), z: Math.cos(a) * rng.range(9, 14) } : { x: rng.range(-9, 9), z: rng.range(40, 48) };
        this.hangout = true;
        this.duration = Math.max(this.duration, 12);
      } else if (bot.pers.patrol) {
        // pace along the outside of the gate, watching the aisle
        this.point = { x: L.outside.x - L.inward * rng.range(0, 5), z: L.center.z + rng.range(-7, 7) };
      } else {
        // potter about the open half of the garden (but never onto the LOCK pad)
        for (let i = 0; i < 6; i++) {
          this.point = { x: L.gate.x + L.inward * rng.range(4, 15), z: L.center.z + rng.range(-16, 16) };
          if (hyp(this.point.x - L.lockPad.x, this.point.z - L.lockPad.z) > L.lockPad.r + 3) break;
        }
      }
      this.waitUntil = now + 99;
      this.arrivedOnce = false;
    }
    bot.motor.goTo(this.point.x, this.point.z, PATROL_OPTS);
    const moving = bot.motor.update(game, p, dt, it);
    if (!moving && bot.motor.arrived) {
      if (!this.arrivedOnce) {
        this.arrivedOnce = true;
        this.waitUntil = now + bot.rng.range(0.8, 2.6);
        this.lookBase = bot.pers.patrol ? yawTo(p.pos.x, p.pos.z, 0, L.center.z) : bot.rng.range(-Math.PI, Math.PI);
        if (this.hangout && bot.rng.next() < 0.4) bot.emoteNext = 'celebrate'; // a little happy dance
        else if (bot.rng.next() < 0.15) bot.hop(1);
        if (this.hangout) this.waitUntil = now + 99; // stay put until the break is over
      }
      const watch = bot.watchTarget(game, p);
      it.aimYaw = watch ? yawTo(p.pos.x, p.pos.z, watch.pos.x, watch.pos.z) : wrapAngle(this.lookBase + Math.sin(now * 0.8 + p.slot) * 0.7);
    }
    return 'running';
  }
}
