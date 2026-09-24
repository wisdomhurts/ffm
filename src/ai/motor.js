// Bot locomotion: follows routes from nav.js with braking before corners and targets (the game's
// acceleration is finite, so fast bots must brake early), dodges monsters (dodge.js), steers around
// banana peels and other players, hops where the route crosses a planter, and recovers when stuck.
import { PLAYER, WORLD } from '../config.js';
import { BLOCK, getNav } from './nav.js';

const BRAKE = PLAYER.accel * 0.75; // deceleration budget used for speed planning
const ROAD_HALF = WORLD.road.width / 2;
const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Motor {
  constructor(bot) {
    this.bot = bot;
    this.target = null;
    this.opts = {};
    this.key = null;
    this.path = null;
    this.idx = 0;
    this.replanAt = 0;
    this.shortcutAt = 0;
    this.arrived = false;
    this.failed = false;
    this.dist = Infinity; // distance to the final target
    this.wantsMove = false;
    this.stuckEvents = 0; // debug counters (used by the sims)
    this.st = {
      t: 0, moved: 0, vint: 0, lx: null, lz: 0, count: 0, lastAt: -99, sideUntil: 0, sx: 0, sz: 0, escape: null, escapeUntil: 0, jump: false,
      best: Infinity, bestAt: 0,
    };
    this._dir = { x: 0, z: 0 };
  }

  /**
   * Walk/run to (x,z).
   * opts: {arrive (studs), via: [{x,z}] waypoints first, chase (target moves; no braking),
   *        speed (0..1 of top speed), key (same key + nearby target keeps the current route), lane}
   */
  goTo(x, z, opts = {}) {
    const t = this.target;
    const key = opts.key ?? 'default';
    const tol = opts.chase ? 4 : 0.75;
    this.opts = opts;
    if (t && key === this.key && Math.abs(t.x - x) + Math.abs(t.z - z) < tol) {
      t.x = x;
      t.z = z;
      if (this.path) {
        const last = this.path[this.path.length - 1];
        last.x = x;
        last.z = z;
      }
      return;
    }
    this.target = { x, z };
    this.key = key;
    this.path = null;
    this.arrived = false;
    this.failed = false;
    this._resetStuck();
  }

  _resetStuck() {
    const st = this.st;
    st.t = 0;
    st.moved = 0;
    st.vint = 0;
    st.lx = null;
    st.best = Infinity;
  }

  stop() {
    this.target = null;
    this.path = null;
    this.key = null;
    this.arrived = true;
    this.wantsMove = false;
    this._resetStuck();
  }

  replan() {
    this.path = null;
  }

  _plan(game, p) {
    const nav = getNav(game);
    const o = this.opts;
    const lane = o.lane ?? 0;
    let path = [{ x: p.pos.x, z: p.pos.z }];
    let fx = p.pos.x, fz = p.pos.z;
    const legs = o.via ? [...o.via, this.target] : [this.target];
    for (const leg of legs) {
      const r = nav.route(fx, fz, leg.x, leg.z, lane);
      path = path.concat(r.slice(1));
      fx = leg.x;
      fz = leg.z;
    }
    this.path = path;
    this.idx = Math.min(1, path.length - 1);
    this.replanAt = game.time + (o.chase ? 0.6 : 8);
  }

  /** Fill it.moveX/moveZ/jump for this tick. Returns true while moving. */
  update(game, p, dt, it) {
    const now = game.time;
    this.wantsMove = false;
    if (!this.target) return false;
    if (now < p.stunUntil) {
      this._resetStuck();
      return false;
    }
    const nav = getNav(game);
    const o = this.opts;
    const px = p.pos.x, pz = p.pos.z;
    const vmax = Math.max(1, p.maxSpeed(now, game.difficulty.botSpeedMult));
    const speed = hyp(p.vel.x, p.vel.z);
    const st = this.st;

    // stuck escape: head for a nearby free spot for a moment
    if (st.escape && now < st.escapeUntil) {
      this._steer(game, p, st.escape.x - px, st.escape.z - pz, 1, it, nav, false);
      this._stuckCheck(game, p, dt);
      return true;
    }
    st.escape = null;

    // chase: go straight at a moving target when nothing is in the way
    if (o.chase && now >= this.shortcutAt) {
      this.shortcutAt = now + 0.2;
      if (nav.los(px, pz, this.target.x, this.target.z)) {
        this.path = [{ x: px, z: pz }, { x: this.target.x, z: this.target.z }];
        this.idx = 1;
        this.replanAt = now + 0.6;
      }
    }
    if (!this.path || now >= this.replanAt) this._plan(game, p);
    const path = this.path;

    // advance along the route
    while (this.idx < path.length - 1) {
      const w = path[this.idx];
      if (hyp(w.x - px, w.z - pz) < Math.max(1.0, speed * 0.09)) this.idx++;
      else break;
    }
    if (!o.chase && now >= this.shortcutAt && this.idx < path.length - 1) {
      this.shortcutAt = now + 0.25;
      const n = path[this.idx + 1];
      if (!path[this.idx].jump && nav.los(px, pz, n.x, n.z)) this.idx++;
    }
    const last = path.length - 1;
    const wp = path[this.idx];
    const dx = wp.x - px, dz = wp.z - pz;
    const d = hyp(dx, dz) || 1e-6;
    this.dist = this.idx === last ? d : d + this._restLength();
    const arrive = o.arrive ?? 1.0;
    if (this.idx === last && d <= arrive) {
      this.arrived = true;
      this._resetStuck();
      return false;
    }
    this.arrived = false;

    // speed planning: brake for the target and for sharp corners
    let v = vmax * (o.speed ?? 1);
    if (!o.chase) {
      if (this.idx === last) v = Math.min(v, Math.sqrt(2 * BRAKE * Math.max(0, d - arrive * 0.6)) + 1.5);
      else {
        const n = path[this.idx + 1];
        const ox = n.x - wp.x, oz = n.z - wp.z;
        const ol = hyp(ox, oz) || 1;
        const cos = (dx * ox + dz * oz) / (d * ol);
        if (cos < 0.85) {
          const vc = 9 + 30 * clamp((cos + 0.2) / 1.05, 0, 1);
          v = Math.min(v, Math.sqrt(vc * vc + 2 * BRAKE * d));
        }
        v = Math.min(v, Math.sqrt(2 * BRAKE * this.dist) + 2);
      }
    }
    if (wp.jump && d < 2.6 && p.onGround) it.jump = true;
    this._steer(game, p, dx / d, dz / d, v / vmax, it, nav, true);
    this._stuckCheck(game, p, dt);
    return true;
  }

  _restLength() {
    let s = 0;
    const P = this.path;
    for (let i = this.idx; i < P.length - 1; i++) s += hyp(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
    return s;
  }

  // Combine the route direction with avoidance, hop obstacles, and write the intent.
  _steer(game, p, dx, dz, mag, it, nav, avoid) {
    const now = game.time;
    const st = this.st;
    let ax = dx, az = dz;
    if (now < st.sideUntil) {
      ax = dx * 0.35 + st.sx;
      az = dz * 0.35 + st.sz;
    } else if (avoid) {
      if (p.carrying && p.pos.z > 62) {
        const d = this.bot.roadDodge(game, p, dx, dz);
        if (d) {
          ax = d.x;
          az = d.z;
        }
      }
      const a = this.bot.avoidance(game, p, ax, az);
      ax += a.x;
      az += a.z;
      if (a.jump && p.onGround) it.jump = true;
    }
    let l = hyp(ax, az) || 1;
    ax /= l;
    az /= l;
    // never let avoidance push us into a wall: fall back towards the route direction
    const px = p.pos.x, pz = p.pos.z;
    if (nav.cellAt(px + ax * 1.8, pz + az * 1.8) === BLOCK && nav.cellAt(px + dx * 1.8, pz + dz * 1.8) !== BLOCK) {
      ax = dx;
      az = dz;
    }
    if (st.jump) {
      if (p.onGround) it.jump = true;
      st.jump = false;
    }
    // keep inside the road walls when dodging on the Seed Road
    if (pz > 62 && Math.abs(px) > ROAD_HALF - 2.2 && Math.sign(ax) === Math.sign(px)) ax *= 0.2;
    l = hyp(ax, az) || 1;
    it.moveX = (ax / l) * mag;
    it.moveZ = (az / l) * mag;
    this._dir.x = ax / l;
    this._dir.z = az / l;
    this.wantsMove = mag > 0.05;
  }

  // Stuck = the body barely moves while its velocity says it should (physics pushes the position
  // out of walls but leaves the velocity alone), or no progress towards the target for a while.
  _stuckCheck(game, p, dt) {
    const st = this.st;
    const now = game.time;
    if (!this.wantsMove) {
      this._resetStuck();
      return;
    }
    if (st.lx == null) {
      st.lx = p.pos.x;
      st.lz = p.pos.z;
      st.bestAt = now;
    }
    st.moved += hyp(p.pos.x - st.lx, p.pos.z - st.lz);
    st.lx = p.pos.x;
    st.lz = p.pos.z;
    st.vint += hyp(p.vel.x, p.vel.z) * dt;
    st.t += dt;
    if (!this.opts.chase) {
      if (this.dist < st.best - 1.5) {
        st.best = this.dist;
        st.bestAt = now;
      } else if (now - st.bestAt > 4.5) {
        st.best = this.dist;
        st.bestAt = now;
        this._unstick(game, p);
        return;
      }
    }
    if (st.t < 0.6) return;
    const blocked = st.vint > 2.5 && st.moved < st.vint * 0.35;
    st.t = 0;
    st.moved = 0;
    st.vint = 0;
    if (!blocked) {
      if (now - st.lastAt > 5) st.count = 0;
      return;
    }
    this._unstick(game, p);
  }

  _unstick(game, p) {
    const now = game.time;
    const st = this.st;
    const rng = this.bot.rng;
    this.stuckEvents++;
    this.bot.debugHook?.('unstick', { x: p.pos.x, z: p.pos.z, count: st.count, goal: this.bot.goal?.type, phase: this.bot.goal?.phase, target: this.target });
    st.count = now - st.lastAt < 6 ? st.count + 1 : 1;
    st.lastAt = now;
    st.jump = true;
    const side = rng.next() < 0.5 ? 1 : -1;
    st.sx = -this._dir.z * side;
    st.sz = this._dir.x * side;
    st.sideUntil = now + 0.35;
    this.path = null;
    if (st.count >= 3) {
      const nav = getNav(game);
      for (let i = 0; i < 12; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(3, 8);
        const x = p.pos.x + Math.sin(a) * r, z = p.pos.z + Math.cos(a) * r;
        if (nav.cellAt(x, z) === 0 && nav.los(p.pos.x, p.pos.z, x, z)) {
          st.escape = { x, z };
          st.escapeUntil = now + 1.0;
          break;
        }
      }
    }
    if (st.count >= 6) {
      st.count = 0;
      this.failed = true;
    }
  }
}
