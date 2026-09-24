// Bot brains for the three family members you play against (and all four in the title attract mode).
// Contract: new BotController(personality, difficultyId) ; getIntent(game, player, dt) -> Intent
// Optional extras: a third `{seed}` argument for deterministic sims, `debugState`, `dispose()`, and
// `intent.emote = 'celebrate'` after a successful steal (ignored unless the game supports it).
//
// Layers:
//   perception (every tick)  threats to my garden, stat changes that deserve a chat line
//   brain (every ~0.6-1.2 s) utility scores for farm / steal / defend / shop / ... -> a Goal (brain.js)
//   goal (every tick)        a small state machine that drives the motor and interactions (goals.js)
//   motor (every tick)       routes, braking, dodging monsters and peels, un-sticking (motor.js)
// Personalities: tycoon (Dorian), guardian (Esther), speedster (Maddie), thief (Micah).
//
// Rubber band (`_pace`, from config DIFFICULTY): bots farm at most `biomeLead` biomes deeper than the
// human has been (and a biome shallower unless they trail), a bot ahead of the human eases off (jogs on
// errands, ignores shiny seeds, hangs out a little), one far ahead coasts (no upgrades or big buys), and
// while the human is last the bots think slower and mostly leave the human's garden alone.
// On Chill (and on Normal if nobody has robbed the human by ~4 min) one bot does a slow, telegraphed
// "practice steal" of the human's cheapest plant so a new player learns to chase and bonk.
import { PLAYER, BIOMES, REBIRTH, speedCost, speedAt } from '../config.js';
import { emptyIntent } from '../gameplay/player.js';
import { gardenContains } from '../gameplay/layout.js';
import { makeRng } from '../core/rng.js';
import { PERSONALITIES, PRACTICE_LINES, difficultyTuning } from './personalities.js';
import { Motor } from './motor.js';
import { getNav } from './nav.js';
import { chooseGoal } from './brain.js';
import { planDodge } from './dodge.js';
import { ReturnGoal, PracticeStealGoal } from './goals.js';
import { getBoard, trySay, releaseClaims, updateHuman } from './blackboard.js';
import { practiceTarget, practiceEvent } from './practice.js';
import { hyp, clamp, yawTo, wrapAngle, balloonYaw, tierOf, gardenInfo, carrySeedSpeed, approxDist } from './util.js';

export class BotController {
  /**
   * @param {'tycoon'|'guardian'|'speedster'|'thief'} personality
   * @param {'chill'|'normal'|'chaos'} [difficultyId] defaults to the game's difficulty
   * @param {{seed?: number}} [opts]
   */
  constructor(personality = 'tycoon', difficultyId = null, opts = {}) {
    this.personality = PERSONALITIES[personality] ? personality : 'tycoon';
    this.pers = PERSONALITIES[this.personality];
    this.difficultyId = difficultyId;
    this.diff = difficultyTuning(difficultyId || 'normal');
    this.rng = makeRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.motor = new Motor(this);
    this.goal = null;
    this.game = null;
    this.p = null;
    this.nextDecideAt = 0;
    this.threat = null;
    this.info = null;
    this.podBlock = new Map();
    this.lastStealAt = -999;
    this.stealAbortedAt = -999;
    this.revenge = null;
    this.revengeUntil = 0;
    this.stayHomeUntil = 0;
    this.sepIgnore = null;
    this.hopsLeft = 0;
    this.hopAt = 0;
    this.balloonAt = 0;
    this.bananaAt = 0;
    this.kitAt = 0;
    this.coilAt = 0;
    this.peelSeen = new Map();
    this.lurkBlock = new Map();
    this.biomeFail = [];
    this.mugReadyAt = 0;
    this.lastShopAt = -99;
    this.lastCollectAt = -99;
    this._avoid = { x: 0, z: 0, jump: false };
    this.dodgeAt = 0;
    this.dodgeOn = false;
    this.dodgeDir = { x: 0, z: -1 };
    this.dodgeState = { prev: null };
    // rubber band state (see _pace)
    this.ease = 0;
    this.tempo = 1;
    this.biomeCap = 99;
    this.humanLast = false;
    this.ahead = 0;
    this.coast = 0;
    this.practiceCarry = null;
  }

  _bind(game, p) {
    this.game = game;
    this.p = p;
    if (!this.difficultyId) this.diff = difficultyTuning(game.difficultyId);
    this.home = game.layout.gardens[p.slot];
    this.lane = this.pers.lane;
    this.shopJitter = this.rng.range(-3, 3);
    this.seenSteals = p.stats.steals;
    this.seenBonks = p.stats.bonks;
    this.bestTier = 0;
    this.prevCarry = p.carrying;
    this.goal = null;
    this.motor.stop();
    // memories are in game time: forget them when bound to a new match
    this.threat = null;
    this.podBlock.clear();
    this.lurkBlock.clear();
    this.peelSeen.clear();
    this.biomeFail = [];
    this.lastStealAt = -999;
    this.revenge = null;
    this.stayHomeUntil = this.mugReadyAt = this.balloonAt = this.bananaAt = this.kitAt = this.coilAt = this.dodgeAt = 0;
    this.lastShopAt = this.lastCollectAt = -99;
    this.hopsLeft = 0;
    this.ease = 0;
    this.tempo = 1;
    this.biomeCap = 99;
    this.humanLast = false;
    this.practiceCarry = null;
    // stagger the first decisions so the bots do not move in lockstep
    this.nextDecideAt = game.time + this.rng.range(0.1, 0.9);
    getNav(game);
  }

  getIntent(game, p, dt) {
    if (this.game !== game || this.p !== p) this._bind(game, p);
    // one intent object per bot, reset every tick (the game only reads it during this step)
    const it = this._it || (this._it = emptyIntent());
    it.moveX = 0;
    it.moveZ = 0;
    it.jump = false;
    it.interact = false;
    it.bonk = false;
    it.useItem = null;
    it.selectSlot = null;
    it.aimYaw = null;
    it.emote = null;
    const now = game.time;
    updateHuman(game);
    this._perceive(game, p, now);
    if (p.carrying && this.goal?.type !== 'return') this._setGoal(new ReturnGoal(this.goal?.type === 'practice'), game, p);
    if (!p.carrying) {
      const urgent = this.threat && !this.threat.handled && now >= this.threat.reactAt;
      if (urgent) this.threat.handled = true;
      if (urgent || now >= this.nextDecideAt) this._decide(game, p, now);
    }
    if (this.goal) {
      const status = this.goal.update(this, game, p, it, dt);
      if (status !== 'running') this._finish(game, p, status);
    }
    this._hops(game, p, it);
    if (this.emoteNext && !p.carrying) {
      // optional: games that support intent.emote play the celebration dance
      it.emote = this.emoteNext;
      this.emoteNext = null;
    }
    return it;
  }

  /** Debug snapshot (used by the headless sims). */
  get debugState() {
    return {
      goal: this.goal?.type ?? null, phase: this.goal?.phase ?? '', stuck: this.motor.stuckEvents, moving: this.motor.wantsMove,
      ease: this.ease, coast: this.coast, biomeCap: this.biomeCap, practice: this.goal?.type === 'practice' || !!this.practiceCarry,
    };
  }

  // ---------------------------------------------------------------- brain plumbing

  _decide(game, p, now) {
    this._pace(game, p, now);
    this.nextDecideAt = now + this.diff.decide * this.rng.range(0.8, 1.25) * (this.humanLast ? this.diff.lastDecide : 1);
    const cur = this.goal;
    if (this._practice(game, p, now)) return;
    const cand = chooseGoal(this, game, p);
    // an idle line now and then, only after a quiet spell for this bot (a relaxed bot chats more)
    const quiet = now - (getBoard(game).chatBy.get(p.slot) ?? -99);
    if (quiet > 45 - this.ease * 20 && cur?.type !== 'practice' && this.rng.next() < (0.025 + this.ease * 0.03) * this.pers.chatty) {
      this.say(game, p, 'idle', {});
    }
    if (!cand) return;
    if (!cur) return this._setGoal(cand, game, p);
    if (cand.sig === cur.sig) {
      cur.u = cand.u;
      return;
    }
    if (cand.type === 'defend') {
      if (cur.type !== 'defend' && cur.type !== 'return') this._setGoal(cand, game, p);
      return;
    }
    if (!cur.interruptible) return;
    if (cand.u > cur.u * 1.35 + 1e-4) this._setGoal(cand, game, p);
  }

  /**
   * Rubber band: read the human's progress and set how far up the road this bot may farm (`biomeCap`),
   * how relaxed it plays (`ease` 0..1: jogs, longer breathers, stays shallower) and whether the human
   * is in last place (comeback help). No human (attract mode) or Chaos: no limits.
   */
  _pace(game, p, now) {
    const hs = getBoard(game).human;
    const d = this.diff;
    this.ease = 0;
    this.tempo = 1;
    this.biomeCap = 99;
    this.humanLast = false;
    this.ahead = 0;
    this.coast = 0;
    if (!hs) return;
    this.humanLast = hs.last && now > 30;
    // ahead of the human on net worth, or on income (where net worth is heading)
    const ahead = this.ahead = Math.max(Math.max(game.netWorth.get(p) || 0, 400) / Math.max(hs.net, 400),
      Math.max(game.gardenIncome(game.gardens[p.slot]), 8) / Math.max(hs.inc, 8));
    if (d.paceCap > 0 && now > 20) {
      this.ease = clamp((ahead / d.paceCap - 1) / 0.4, 0, 1);
      this.tempo = 1 - this.ease * d.easeTempo;
      // clearly ahead of a struggling human: coast (no upgrades, no big purchases, more breathers)
      this.coast = clamp((ahead - d.coastAt) / 0.6, 0, 1);
    }
    // the biome lead is only for catching up: unless well behind the human farm a biome shallower,
    // and well ahead another one shallower still
    if (d.biomeLead < 50) {
      const drop = (ahead >= d.catchUp ? 1 : 0) + (this.ease > 0.5 ? 1 : 0);
      this.biomeCap = Math.max(0, hs.deep + d.biomeLead - drop);
    }
  }

  /** Practice steal: assign it to one bot, and start it when this bot is the one. Returns true when started. */
  _practice(game, p, now) {
    const b = getBoard(game);
    const pr = b.practice;
    if (pr.state === 'idle' && now >= (pr.checkAt || 0)) {
      pr.checkAt = now + 1;
      const pl = practiceTarget(game, this.diff);
      if (pl) {
        const o = game.layout.gardens[game.human.slot].outside;
        let best = null, bd = 160;
        for (const q of game.players) {
          if (q.isHuman || !q.controller?.canPractice?.(game, q)) continue;
          const d = approxDist(q.pos.x, q.pos.z, o.x, o.z);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        if (best) Object.assign(pr, { state: 'assigned', slot: best.slot, at: now, index: pl.index });
      }
    }
    if (pr.state !== 'assigned' || pr.slot !== p.slot) return false;
    const cur = this.goal;
    if (now - pr.at > 20 || !this.canPractice(game, p)) {
      // could not get free in time: let the next check pick again
      pr.state = 'idle';
      pr.checkAt = now + 8;
      return false;
    }
    if (cur && !cur.interruptible) return false;
    this._setGoal(new PracticeStealGoal(game.human.slot, pr.index), game, p);
    return true;
  }

  /** Free to do the practice steal right now (Micah sits it out on Chill so it never feels like a dogpile). */
  canPractice(game, p) {
    if (p.carrying || game.time < p.stunUntil) return false;
    if (this.diff.id === 'chill' && this.personality === 'thief') return false;
    const t = this.goal?.type;
    if (t === 'defend' || t === 'return' || (t === 'steal' && this.goal.phase === 'steal')) return false;
    return true;
  }

  _setGoal(goal, game, p) {
    if (this.goal) this.goal.end(this, game, p);
    this.goal = goal;
    this.motor.stop();
    // each trip wanders a little differently up the road
    this.lane = this.pers.lane + this.rng.range(-2.5, 2.5) * this.pers.wander;
    goal.begin(this, game, p);
  }

  _finish(game, p, status) {
    const g = this.goal;
    const now = game.time;
    g.end(this, game, p);
    this.goal = null;
    this.motor.stop();
    if (status === 'failed') {
      if (g.type === 'defend' && this.threat?.q === g.q) this.threat.gaveUp = true;
      if (g.type === 'farm') this.podBlock.set(g.pod.id, now + 12);
      if (g.type === 'steal') this.lastStealAt = Math.max(this.lastStealAt, now - this.pers.stealGap * 0.6);
    }
    if (g.type === 'shop') this.lastShopAt = now;
    if (g.type === 'collect') this.lastCollectAt = now;
    if (g.type === 'mug') this.mugReadyAt = now + 25;
    if (g.type === 'lurk') this.lurkBlock.set(g.vslot, now + 40);
    if (g.type === 'return' && status === 'done') {
      // back home with a seed: guardians hang around, others sometimes take a breather
      const relax = 1 + this.ease * this.diff.easeBeat;
      if (this.pers.patrol) this.stayHomeUntil = now + this.rng.range(3, 9) * this.diff.beat * relax;
      else if (this.rng.next() < this.diff.breakChance + this.ease * this.diff.easeBreak + this.coast * 0.4) this.stayHomeUntil = now + this.rng.range(2, 6) * this.diff.beat * relax;
      if (this.rng.next() < 0.2 + this.ease * 0.2) this.hop(1);
    }
    // a short human-like beat before the next plan (admire the new plant, catch a breath)
    const beat = (g.type === 'return' || g.type === 'shop' ? this.rng.range(0.3, 1.1) : this.rng.range(0.05, 0.3)) * this.diff.beat;
    // a relaxed bot takes longer breathers, pottering about its garden rather than standing still
    const extra = beat * this.ease * this.diff.easeBeat;
    if (extra > 1) this.stayHomeUntil = Math.max(this.stayHomeUntil, now + extra * 2.5);
    this.nextDecideAt = now + beat + Math.min(extra, 0.3) + (status === 'failed' ? this.diff.reaction * 0.5 : 0);
  }

  // ---------------------------------------------------------------- perception + chat

  _perceive(game, p, now) {
    const g = game.gardens[p.slot];
    let q = null, kind = null;
    for (const pl of g.planters) {
      if (pl.stealer != null && pl.stealer !== p.slot) {
        q = game.players[pl.stealer];
        kind = 'stealing';
        break;
      }
    }
    if (!q) {
      for (const o of game.players) {
        if (o !== p && o.carrying?.kind === 'plant' && o.carrying.fromSlot === p.slot) {
          q = o;
          kind = 'carrying';
          break;
        }
      }
    }
    if (q) {
      if (!this.threat || this.threat.q !== q) {
        const d = hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
        this.threat = { q, kind, seenAt: now, reactAt: now + this.diff.reaction * this.rng.range(0.8, 1.5) + (d > 80 ? 0.4 : 0), handled: false };
      }
      this.threat.kind = kind;
      if (kind === 'carrying' && this.threat.plantUid !== q.carrying.plant.uid) {
        const plant = q.carrying.plant;
        this.threat.plantUid = plant.uid;
        this.revenge = q;
        this.revengeUntil = now + 150;
        this.say(game, p, 'robbed', { plant: game.plantName(plant.speciesId, plant.mutation), thief: q.name }, { urgent: true });
      }
    } else this.threat = null;

    const c = p.carrying;
    if (c?.kind === 'plant' && this.lastCarry?.plant !== c.plant) this.lastCarry = { plant: c.plant, victim: game.players[c.fromSlot] };
    this._practiceCarry(game, p, c, now);
    if (p.stats.steals > this.seenSteals) {
      this.seenSteals = p.stats.steals;
      const lc = this.lastCarry;
      if (lc) this.say(game, p, 'steal', { plant: game.plantName(lc.plant.speciesId, lc.plant.mutation), victim: lc.victim.name }, { urgent: true });
      this.hop(2);
      this.emoteNext = 'celebrate';
    }
    if (p.stats.bonks > this.seenBonks) {
      this.seenBonks = p.stats.bonks;
      this.say(game, p, 'bonk', {}, { chance: 0.7 });
    }
    // lost a seed to a monster on the road: that biome feels scarier for a while
    if (!c && this.prevCarry?.kind === 'seed') {
      for (const m of game.monsters) {
        if (now - m.attackAt < 0.1 && hyp(m.x - p.pos.x, m.z - p.pos.z) < 8) {
          const f = this.biomeFail[m.biome] || (this.biomeFail[m.biome] = { n: 0, at: now });
          f.n = f.n * Math.pow(0.5, (now - f.at) / 60) + 1;
          f.at = now;
          break;
        }
      }
    }
    if (c?.kind === 'seed' && !this.prevCarry) {
      const tier = tierOf(c.speciesId);
      if (tier >= Math.max(3, this.bestTier + 1) || (c.mutation !== 'normal' && tier >= 1) || tier >= 5) {
        this.say(game, p, 'rare', { plant: game.plantName(c.speciesId, c.mutation) }, { chance: 0.85 });
        this.hop(1);
      }
      this.bestTier = Math.max(this.bestTier, tier);
    }
    this.prevCarry = c;
  }

  /** Practice-steal banter (config CHAT wins when it has the category). */
  sayPractice(game, p, kind, vars) {
    // the lesson's lines skip this bot's own chat cooldown (the global gap still applies)
    const chatBy = getBoard(game).chatBy;
    const last = chatBy.get(p.slot);
    chatBy.set(p.slot, -99);
    const lines = PRACTICE_LINES[kind]?.[p.id] || PRACTICE_LINES[kind]?.dorian || [];
    const said = trySay(game, p, kind, vars, { urgent: true, rng: this.rng.next, lines });
    if (!said && last != null) chatBy.set(p.slot, last);
    return said;
  }

  // The practice thief: tease once the pot is up, own up when bonked, and hand the stage back.
  _practiceCarry(game, p, c, now) {
    const pc = this.practiceCarry;
    if (!pc) {
      if (c?.kind === 'plant' && this.goal?.type === 'practice') {
        this.practiceCarry = { plant: c.plant, victim: game.players[c.fromSlot], steals: p.stats.steals, teased: false, at: now };
        practiceEvent('carry', p, this.practiceCarry.victim, c.plant);
      }
      return;
    }
    const victim = pc.victim;
    if (c?.plant === pc.plant) {
      if (!pc.teased && now - pc.at > 0.3) {
        pc.teased = this.sayPractice(game, p, 'tease', { victim: victim.name, plant: game.plantName(pc.plant.speciesId, pc.plant.mutation) });
        if (now - pc.at > 4) pc.teased = true;
      }
      return;
    }
    // it's over: home with it, or bonked back
    this.practiceCarry = null;
    const b = getBoard(game);
    b.practice.state = 'done';
    b.humanStealUntil = Math.max(b.humanStealUntil, now + this.diff.humanStealGap);
    if (p.stats.steals === pc.steals) {
      this.sayPractice(game, p, 'caught', { victim: victim.name });
      this.hop(1);
      practiceEvent('caught', p, victim, pc.plant);
    } else practiceEvent('escaped', p, victim, pc.plant);
  }

  say(game, p, category, vars, opts = {}) {
    const chance = (opts.chance ?? 1) * Math.min(1, this.pers.chatty);
    return trySay(game, p, category, vars, { ...opts, chance, rng: this.rng.next });
  }

  // ---------------------------------------------------------------- small action helpers

  /** Tap interact (instant actions fire on the press edge). */
  press(it, p) {
    it.interact = !p.prevInteract;
  }

  hop(n) {
    this.hopsLeft = Math.max(this.hopsLeft, n);
  }

  _hops(game, p, it) {
    if (this.hopsLeft <= 0 || game.time < this.hopAt || !p.onGround || game.time < p.stunUntil) return;
    if (p.interact.t > 0) return; // don't hop off a planter mid-steal
    it.jump = true;
    this.hopsLeft--;
    this.hopAt = game.time + 0.55;
  }

  /** Swing the pool noodle at a player or monster when it makes sense. Misses by difficulty. */
  tryBonk(game, p, target, it) {
    const now = game.time;
    if (p.carrying || now < p.bonkReadyAt || now < p.stunUntil) return false;
    const isPlayer = !!target.pos;
    const tx = isPlayer ? target.pos.x : target.x, tz = isPlayer ? target.pos.z : target.z;
    if (isPlayer && (now < target.invulnUntil - 0.05 || target.invisible(now) || Math.abs(target.pos.y - p.pos.y) > 4)) return false;
    const d = hyp(tx - p.pos.x, tz - p.pos.z);
    const R = PLAYER.bonk.range + (isPlayer ? 0 : 1.5);
    if (d > R + 2.5) {
      this.bonkRoll = null;
      return false;
    }
    if (!this.bonkRoll) {
      let acc = this.diff.bonkAccuracy;
      if (isPlayer && target.isHuman && this.diff.id === 'chill') acc *= 0.85;
      this.bonkRoll = { good: this.rng.next() < acc, at: now + this.diff.reaction * this.rng.range(0.1, 0.5) };
    }
    if (now < this.bonkRoll.at) return false;
    const aim = yawTo(p.pos.x, p.pos.z, tx, tz);
    if (this.bonkRoll.good) {
      if (d > R - 1.3) return false;
      if (Math.abs(wrapAngle(p.yaw - aim)) > 0.35) {
        it.moveX = 0;
        it.moveZ = 0;
        it.aimYaw = aim;
      }
    } else if (d <= R + 0.4) {
      // too close to whiff by distance: swing wide instead
      it.moveX = 0;
      it.moveZ = 0;
      it.aimYaw = aim + (this.rng.next() < 0.5 ? 1 : -1) * 1.45;
    }
    it.bonk = true;
    this.bonkRoll = null;
    return true;
  }

  /** Throw a water balloon at q (leading the target). */
  tryBalloon(game, p, q, it, d) {
    const now = game.time;
    if ((p.items.balloon || 0) <= 0 || now < this.balloonAt || d < 7 || d > 27) return false;
    if (now < q.invulnUntil || q.invisible(now)) return false;
    this.balloonAt = now + 1.2;
    if (q.isHuman && this.rng.next() > this.diff.humanBalloon) {
      this.balloonAt = now + 3;
      return false;
    }
    if (!getNav(game).los(p.pos.x, p.pos.z, q.pos.x, q.pos.z)) return false;
    const err = (this.rng.next() + this.rng.next() - 1) * this.diff.aimError * 1.6;
    it.moveX = 0;
    it.moveZ = 0;
    it.aimYaw = balloonYaw(p, q) + err;
    it.useItem = 'balloon';
    this.balloonAt = now + 2.4;
    return true;
  }

  /** While carrying: shake off pursuers with peels, balloons and coils. */
  escapeKit(game, p, it) {
    const now = game.time;
    if (now < this.kitAt || now < p.stunUntil) return;
    this.kitAt = now + 0.12;
    let pur = null, pd = Infinity;
    for (const q of game.players) {
      if (q === p || q.carrying || q.invisible(now) || now < q.stunUntil) continue;
      const rx = p.pos.x - q.pos.x, rz = p.pos.z - q.pos.z;
      const d = hyp(rx, rz);
      if (d > 26) continue;
      const closing = (q.vel.x * rx + q.vel.z * rz) / (d || 1);
      const hunting = q.controller?.goal?.q === p;
      if (!hunting && closing < 6) continue;
      if (d < pd) {
        pd = d;
        pur = q;
      }
    }
    if (pur) {
      if ((p.items.banana || 0) > 0 && pd > 2.2 && pd < 12 && now > this.bananaAt && Math.hypot(p.vel.x, p.vel.z) > 5) {
        it.useItem = 'banana';
        this.bananaAt = now + 2.5;
        return;
      }
      if (this.tryBalloon(game, p, pur, it, pd)) return;
      if ((p.items.coil || 0) > 0 && now > p.coilUntil && pd < 14) {
        it.useItem = 'coil';
        return;
      }
    }
    if ((p.items.coil || 0) > 0 && now > p.coilUntil) {
      const mySpeed = p.maxSpeed(now, game.difficulty.botSpeedMult);
      for (const m of game.monsters) {
        if (m.target === p.slot && m.def.speed > mySpeed * 0.92 && hyp(m.x - p.pos.x, m.z - p.pos.z) < 30) {
          it.useItem = 'coil';
          return;
        }
      }
    }
  }

  /** Speedster pops a coil for long road trips when she has spares. */
  maybeCoil(game, p, it) {
    const now = game.time;
    if (now < this.coilAt) return;
    this.coilAt = now + 2;
    if (this.personality === 'speedster' && (p.items.coil || 0) >= 2 && now > p.coilUntil && this.rng.next() < 0.3) it.useItem = 'coil';
  }

  /** Micah's big heist: go invisible when the owner is around and the plant is worth it. */
  maybeCloak(game, p, it, g, pl) {
    const now = game.time;
    if (this.personality !== 'thief' || (p.items.cloak || 0) <= 0 || p.invisible(now) || !pl.plant) return;
    const o = g.owner;
    const ownerNear = gardenContains(g.L, o.pos.x, o.pos.z) || hyp(o.pos.x - g.L.outside.x, o.pos.z - g.L.outside.z) < 50;
    const inc = game.plantIncome(pl.plant, p);
    const info = this.info || gardenInfo(game, p.slot);
    if (ownerNear && inc >= Math.max(10, info.bestInc * 0.8)) it.useItem = 'cloak';
  }

  /** A road monster near the pod that we can't comfortably outrun with a seed (bonk it first). */
  guardMonster(game, p, pod) {
    const now = game.time;
    if (p.bonkReadyAt > now + 0.6) return null;
    const s = carrySeedSpeed(game, p) * (now < p.coilUntil - 3 ? 1.5 : 1);
    let best = null, bd = Infinity;
    for (const m of game.monsters) {
      if (m.biome !== pod.biome || now < m.stunUntil - 0.3) continue;
      if (m.def.speed < s * 0.9) continue;
      const d = hyp(m.x - pod.x, m.z - pod.z);
      if (d > m.def.aggro + 8) continue;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** The garden owner is right on top of us (abort a steal). */
  ownerCloseIn(game, p, owner) {
    const now = game.time;
    if (owner.invisible(now) || now < owner.stunUntil || owner.carrying) return false;
    const rx = p.pos.x - owner.pos.x, rz = p.pos.z - owner.pos.z;
    const d = hyp(rx, rz);
    const lim = this.personality === 'thief' ? 7 : 10;
    if (d > lim) return false;
    const closing = (owner.vel.x * rx + owner.vel.z * rz) / (d || 1);
    return closing > 3 || d < 4.5;
  }

  isThreat(game, p, q) {
    if (q.carrying?.kind === 'plant' && q.carrying.fromSlot === p.slot) return true;
    for (const pl of game.gardens[p.slot].planters) if (pl.stealer === q.slot) return true;
    return false;
  }

  canDefend(game, p, q) {
    if (p.carrying || q.invisible(game.time) || this.threat?.gaveUp) return false;
    const d = hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
    return d <= this.pers.defendRange * (q.isHuman ? this.diff.humanChaseMult : 1);
  }

  /**
   * Errands before leaving home: sell to make room, bank cash, lock the gate.
   * `need`: cash the coming job requires (a trip home to collect is made only when it's needed).
   */
  departureErrands(game, p, { room = false, need = 0 } = {}) {
    const steps = [];
    const L = this.home;
    const dHome = hyp(p.pos.x - L.inside.x, p.pos.z - L.inside.z);
    const near = dHome < 28 || gardenContains(L, p.pos.x, p.pos.z);
    const pile = game.gardens[p.slot].cashPile;
    if (room) steps.push({ kind: 'sell' });
    if (((near || room) && pile >= 15) || (need > p.cash && pile >= 1)) steps.push({ kind: 'collect' });
    if ((near || room) && this.wantsLock(game, p)) steps.push({ kind: 'lock' });
    return steps;
  }

  wantsLock(game, p) {
    const g = game.gardens[p.slot];
    const now = game.time;
    if (game.isLocked(g) || now < g.lockReadyAt) return false;
    const info = this.info || gardenInfo(game, p.slot);
    if (info.grown === 0) return false;
    if (this.pers.lockChance >= 1) return true;
    let rivals = 0;
    for (const q of game.players) if (q !== p && hyp(q.pos.x - g.L.center.x, q.pos.z - g.L.center.z) < 60) rivals++;
    return rivals > 0 && this.rng.next() < this.pers.lockChance;
  }

  /** At home and a rival is sniffing around the gate: lock up (mostly Esther). */
  wantsLockNow(game, p) {
    const g = game.gardens[p.slot];
    const now = game.time;
    if (game.isLocked(g) || now < g.lockReadyAt) return false;
    const pad = this.home.lockPad;
    if (hyp(pad.x - p.pos.x, pad.z - p.pos.z) > 22) return false;
    const info = this.info || gardenInfo(game, p.slot);
    if (info.grown < 2) return false;
    const o = this.home.outside;
    for (const q of game.players) {
      if (q === p || q.carrying || q.invisible(now)) continue;
      if (hyp(q.pos.x - o.x, q.pos.z - o.z) < 20) return this.pers.lockChance >= 1 || this.rng.next() < this.pers.lockChance * 0.25;
    }
    return false;
  }

  /** Speed level at which a seed carrier comfortably outruns the monster of the deepest biome we may farm. */
  speedNeed(game, p) {
    const b = Math.min(BIOMES.length - 1, this.biomeCap);
    if (b <= 0) return 1;
    const m = BIOMES[b].monster.speed;
    const mult = game.difficulty.botSpeedMult * PLAYER.carrySeedMult;
    return Math.max(0, Math.ceil((((m * this.pers.risk) / mult) - speedAt(0, p.rebirths)) / PLAYER.speedPerLevel));
  }

  wantsMoreSpeed(game, p, eager, avail = p.cash) {
    if (p.speedLevel >= PLAYER.maxSpeedLevel) return false;
    const cost = speedCost(p.speedLevel + 1);
    if (avail < cost * eager) return false;
    const need = this.speedNeed(game, p);
    if (game.mode !== 'showdown' && this.wantsRebirth(game, p) && p.speedLevel >= need &&
      (game.netWorth.get(p) || 0) > REBIRTH.threshold(p.rebirths) * 0.25) return false;
    if (p.speedLevel >= need + 2 && avail < cost * 4) return false;
    return true;
  }

  wantsRebirth(game) {
    return game.mode !== 'showdown';
  }

  onStealStart(game, p, owner) {
    const now = game.time;
    const board = getBoard(game);
    this.lastStealAt = now;
    board.lastStealOn.set(owner.slot, now);
    if (owner.isHuman) board.humanStealUntil = now + this.diff.humanStealGap * this.rng.range(0.8, 1.3);
  }

  /** Someone worth looking at while idling (a curious glance). */
  watchTarget(game, p) {
    let best = null, bd = 30;
    for (const q of game.players) {
      if (q === p || q.invisible(game.time)) continue;
      const d = hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  /** 1 = no bad memories of this biome; halves-ish with each recent monster catch. */
  biomeConfidence(b, now) {
    const f = this.biomeFail[b];
    if (!f) return 1;
    return Math.pow(0.55, f.n * Math.pow(0.5, (now - f.at) / 60));
  }

  noticesPeel(gi) {
    let v = this.peelSeen.get(gi.uid);
    if (v === undefined) {
      v = this.rng.next() < this.diff.peelNotice;
      this.peelSeen.set(gi.uid, v);
      if (this.peelSeen.size > 64) this.peelSeen.delete(this.peelSeen.keys().next().value);
    }
    return v;
  }

  /**
   * Steering nudges added to the route direction (dx,dz): sidestep or hop noticed banana peels,
   * keep a little space from other players. (Monster dodging is roadDodge.)
   */
  avoidance(game, p, dx, dz) {
    const out = this._avoid;
    out.x = 0;
    out.z = 0;
    out.jump = false;
    const px = p.pos.x, pz = p.pos.z;
    const spd = hyp(p.vel.x, p.vel.z);
    for (const gi of game.ground) {
      if (gi.kind !== 'banana' || gi.owner === p.slot) continue;
      const rx = gi.x - px, rz = gi.z - pz;
      const along = rx * dx + rz * dz;
      if (along < -0.5 || along > 9) continue;
      const lat = rx * dz - rz * dx;
      if (Math.abs(lat) > 2.9) continue;
      if (!this.noticesPeel(gi)) continue;
      if (spd > 11 && Math.abs(lat) < 1.9 && along > 2.1 && along < 2.6 + spd * 0.04 && p.onGround) {
        out.jump = true;
        continue;
      }
      const w = ((2.9 - Math.abs(lat)) / 2.9) * 1.6;
      const side = lat >= 0 ? -1 : 1; // move away from the side the peel is on
      out.x += dz * side * w;
      out.z += -dx * side * w;
    }
    for (const q of game.players) {
      if (q === p || q === this.sepIgnore) continue;
      const rx = px - q.pos.x, rz = pz - q.pos.z;
      const d = hyp(rx, rz);
      if (d > 3.4 || d < 1e-3) continue;
      const w = ((3.4 - d) / 3.4) * 0.8;
      out.x += (rx / d) * w;
      out.z += (rz / d) * w;
    }
    return out;
  }

  /** Heading that slips past the road monsters while carrying a seed (see dodge.js), or null. */
  roadDodge(game, p, fx, fz) {
    const now = game.time;
    if (now >= this.dodgeAt) {
      this.dodgeAt = now + 0.1;
      this.dodgeOn = planDodge(game, p, fx, fz, this.dodgeDir, this.dodgeState);
    }
    return this.dodgeOn ? this.dodgeDir : null;
  }

  /** Forget per-game state (called by the sims between matches; optional in the app). */
  dispose() {
    if (this.game && this.p) releaseClaims(this.game, this.p.slot);
    this.game = null;
    this.p = null;
    this.goal = null;
  }
}
