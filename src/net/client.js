// A room member that isn't the host. Keeps a mirror of the host's Game: its OWN player moves locally
// every frame (no input lag) while everything else follows the host's ticks, drawn slightly in the past
// and interpolated so it glides. UI actions and one-shot inputs travel to the host in 'in' messages.
import { WORLD, ITEMS, PLAYER } from '../config.js';
import { bus } from '../core/events.js';
import { emptyIntent } from '../gameplay/player.js';
import { EMOTE, PHRASE } from '../social/catalog.js';
import {
  EventCodec, forwarded, mergeSections, vetPlayer, PLAYER_STRIDE, MONSTER_STRIDE, PROJ_STRIDE, monsterState, isPid, num, r2, r3, relay,
} from './protocol.js';

const RING = 24;
const NO_PROJ = Object.freeze([]);
const R = WORLD.playerRadius;
const TAU = Math.PI * 2;
const lerpAngle = (a, b, t) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
};

export class ClientRole {
  constructor(s, game, { slot, epoch, hostPid, order, full }) {
    this.s = s;
    this.game = game;
    this.slot = slot;
    this.me = game.players[slot];
    this.epoch = epoch;
    this.hostPid = hostPid;
    this.order = Array.isArray(order) ? order.filter(isPid) : [hostPid];
    this.full = full;
    this.codec = new EventCodec(game);
    this.lastSeq = -1;
    this.lastTickAt = s.clock;
    this.offset = full.time - s.clock; // host time = our clock + offset
    this.synced = false;
    const nm = game.monsters.length * MONSTER_STRIDE;
    this.ring = Array.from({ length: RING }, () => ({ t: -1, P: new Float64Array(game.players.length * PLAYER_STRIDE), M: new Float64Array(nm) }));
    this.head = 0;
    this.count = 0;
    this.proj = [];
    this.q = []; // one-shot inputs not yet acknowledged: [n, kind, value]
    this.edgeN = 0;
    this.held = false;
    this.ip = 0;
    this.sel = null;
    this.lastKick = 0;
    this.urgent = true;
    this.sentAt = -9;
    this.li = { key: null, t: 0, hold: 0, label: '', verb: '', rarity: undefined, fired: false };
    this.predSwing = -9;
    this.predReady = 0;
    this.simulating = false;
    this.off = [
      // our own jumps are simulated here; the host only needs to know one happened (for everyone's FX)
      bus.on('player:jump', ({ player }) => {
        if (this.simulating && player === this.me) this._edge('j', 1);
      }),
    ];
  }

  dispose() {
    for (const f of this.off) f();
    this.off = [];
  }

  /** The first full state (welcome): our own position comes from the host too. */
  start() {
    const g = this.game;
    this.full.projectiles = NO_PROJ;
    g.applyFull(this.full, { localSlot: this.slot, force: true });
    g.projectiles = this.proj;
    this.me = g.players[this.slot];
    for (const q of g.players) q.remoteMotion = false; // a mirror never runs anyone's rules
    this.sel = this.me.selectedItem;
    this.s.onStateApplied();
  }

  // ---------------------------------------------------------------- from the host

  onTick(msg) {
    const s = this.s;
    if (!Number.isInteger(msg.s) || !Number.isInteger(msg.ep)) return;
    if (msg.ep < this.epoch) return;
    if (msg.ep > this.epoch || msg.h !== this.hostPid) {
      // a new host took over: its clock and sequence numbers start fresh
      this.epoch = msg.ep;
      this.hostPid = msg.h;
      this.lastSeq = -1;
      this.count = 0;
      this.synced = false;
      s.onHostChanged(msg.h);
    }
    if (msg.s <= this.lastSeq) return;
    this.lastSeq = msg.s;
    this.lastTickAt = s.clock;
    const tm = num(msg.tm, NaN);
    if (!Number.isFinite(tm)) return;
    // host clock estimate: follow the least-delayed ticks (late ones only ever look "older")
    const sample = tm - s.clock;
    if (!this.synced || Math.abs(sample - this.offset) > 1) {
      this.offset = sample;
      this.synced = true;
    } else this.offset += (sample - this.offset) * (sample > this.offset ? 0.5 : 0.03);
    if (Array.isArray(msg.A)) {
      const a = msg.A[this.slot];
      if (Number.isInteger(a)) while (this.q.length && this.q[0][0] <= a) this.q.shift();
    }
    if (Array.isArray(msg.O)) this.order = msg.O.filter(isPid).slice(0, 8);
    this.inRate = Number.isFinite(msg.ir) && msg.ir >= 2 ? msg.ir : 0;
    if (msg.D && typeof msg.D === 'object') this._applyDelta(msg.D, tm, !!msg.K);
    this._store(tm, msg.P, msg.M);
    this._syncProjectiles(msg.B);
    if (Array.isArray(msg.E)) this._events(msg.E);
  }

  _applyDelta(D, tm, key) {
    const n = this.game.players.length;
    for (const k of Object.keys(D)) {
      const v = D[k];
      let ok = true;
      if (k === 'm') ok = v && typeof v === 'object' && !Array.isArray(v);
      else if (k === 'pd' || k === 'gr') ok = Array.isArray(v);
      else if (k === 'mo') ok = Array.isArray(v) && v.every((m) => m && typeof m === 'object');
      else if (k[0] === 'p') ok = +k.slice(1) < n && vetPlayer(v, +k.slice(1));
      else if (k[0] === 'g') ok = +k.slice(1) < n && v && Array.isArray(v.planters) && v.planters.length === 10;
      else ok = false;
      if (!ok) delete D[k];
    }
    if (key && Array.isArray(D.mo)) this.full.monsters = D.mo.map((m) => ({ ...m }));
    else if (D.mo) {
      mergeSections(this.full, { mo: D.mo });
      delete D.mo;
    }
    mergeSections(this.full, D);
    // the host gave our garden away (we were gone too long): don't take that state, ask to be seated again
    if (this.full.players[this.slot]?.pid !== this.s.pid) {
      this.s.onDropped();
      return;
    }
    this._applyState(tm);
  }

  _applyState(tm) {
    const g = this.game;
    const p = this.me;
    const t = g.time;
    this.full.time = tm;
    this.full.projectiles = NO_PROJ;
    try {
      g.applyFull(this.full, { localSlot: this.slot });
    } catch (e) {
      console.warn('[net] bad state from host', e);
    }
    g.time = t;
    g.projectiles = this.proj;
    this._keepLocal(p);
    // applyFull put everyone else at the (older) state positions: back to where they're drawn
    this._interpolate(this.s.clock + this.offset - this.s.rates.interp);
    this.s.onStateApplied();
  }

  // things this device knows better than the (slightly old) host copy
  _keepLocal(p) {
    if (this.sel != null) p.selectedItem = this.sel;
    if (this.game.time - this.predSwing < 0.7) {
      p.swingStart = this.predSwing;
      p.bonkReadyAt = Math.max(p.bonkReadyAt, this.predReady);
    }
    if (p.emote && Math.hypot(p.vel.x, p.vel.z) > 1.5) p.emote = null;
    const it = p.interact;
    const li = this.li;
    it.key = li.key;
    it.t = li.t;
    it.hold = li.hold;
    it.label = li.label;
    it.verb = li.verb;
    it.rarity = li.rarity;
  }

  _store(tm, P, M) {
    const e0 = this.ring[this.head];
    if (!Array.isArray(P) || P.length !== e0.P.length) return;
    for (let i = 0; i < P.length; i++) if (typeof P[i] !== 'number' || !Number.isFinite(P[i])) return;
    const mOk = Array.isArray(M) && M.length === e0.M.length && M.every((v) => typeof v === 'number' && Number.isFinite(v));
    if (this.count && tm <= e0.t) return;
    const i = (this.head + 1) % RING;
    const e = this.ring[i];
    e.t = tm;
    for (let k = 0; k < P.length; k++) e.P[k] = P[k];
    if (mOk) for (let k = 0; k < M.length; k++) e.M[k] = M[k];
    else e.M.set(e0.M);
    this.head = i;
    this.count = Math.min(RING, this.count + 1);
  }

  _syncProjectiles(B) {
    if (!Array.isArray(B) || B.length % PROJ_STRIDE || B.length > PROJ_STRIDE * 40) return;
    const list = this.proj;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let i = 0; i < B.length; i += PROJ_STRIDE) {
      const uid = B[i];
      if (!Number.isFinite(uid)) continue;
      seen.add(uid);
      let b = null;
      for (const x of list) if (x.uid === uid) b = x;
      if (!b) list.push((b = { uid, kind: 'balloon', owner: 0, born: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
      b.owner = B[i + 1] | 0;
      b.born = num(B[i + 2]);
      b.x = num(B[i + 3]);
      b.y = num(B[i + 4]);
      b.z = num(B[i + 5]);
      b.vx = num(B[i + 6]);
      b.vy = num(B[i + 7]);
      b.vz = num(B[i + 8]);
    }
    for (let i = list.length - 1; i >= 0; i--) if (!seen.has(list[i].uid)) list.splice(i, 1);
    this.game.projectiles = list;
  }

  _events(E) {
    const me = this.me;
    for (const ev of E.slice(0, 120)) {
      if (!Array.isArray(ev) || typeof ev[0] !== 'string' || !forwarded(ev[0])) continue;
      const name = ev[0];
      let e = this.codec.decode(ev[1]);
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      e = EventCodec.vet(name, e);
      if (!e) continue;
      // already played on this device the moment it happened
      if ((name === 'player:jump' || name === 'bonk:swing') && e.player === me) continue;
      if ((name === 'chat' || name === 'emote') && this.s.isMuted(e.player)) continue;
      relay.depth++;
      try {
        bus.emit(name, e);
      } finally {
        relay.depth--;
      }
    }
  }

  onKick(k) {
    if (!Number.isInteger(k.k) || k.k <= this.lastKick) return;
    const ok = (a) => Array.isArray(a) && a.length === 3 && a.every((v) => typeof v === 'number' && Number.isFinite(v));
    if (!ok(k.p) || !ok(k.v)) return;
    this.lastKick = k.k;
    const p = this.me;
    p.pos.x = k.p[0];
    p.pos.y = k.p[1];
    p.pos.z = k.p[2];
    p.vel.x = k.v[0];
    p.vel.y = k.v[1];
    p.vel.z = k.v[2];
    p.onGround = false;
    p._jumpQ = 0;
    if (Number.isFinite(k.su)) p.stunUntil = k.su;
    if (Number.isFinite(k.iu)) p.invulnUntil = k.iu;
    this.urgent = true;
  }

  // ---------------------------------------------------------------- to the host

  _edge(kind, value) {
    this.q.push([++this.edgeN, kind, value]);
    if (this.q.length > 32) this.q.shift();
    this.urgent = true;
  }

  /** app.act on a client: everything goes to the host (emotes and chat ride the same reliable queue). */
  act(name, args) {
    if (name === 'emote') {
      if (EMOTE[args[0]]) this._edge('m', args[0]);
      return undefined;
    }
    if (name === 'say') {
      if (PHRASE[args[0]]) this._edge('s', args[0]);
      return undefined;
    }
    let json;
    try {
      json = JSON.stringify(args ?? []);
    } catch {
      return undefined;
    }
    if (json.length > 3000) return undefined;
    this._edge('a', [String(name).slice(0, 24), JSON.parse(json)]);
    return undefined;
  }

  _send() {
    const s = this.s;
    const p = this.me;
    const now = s.clock;
    const busy = this.held || this.q.length || !p.onGround || Math.abs(p.vel.x) + Math.abs(p.vel.z) > 0.3;
    if (this.busy && !busy) this.urgent = true; // just stopped: tell the host where right away
    this.busy = busy;
    const iv = 1 / (busy ? Math.min(s.rates.inMove, this.inRate || Infinity) : s.rates.inIdle);
    if (!(this.urgent && now - this.sentAt >= 0.04) && now - this.sentAt < iv) return;
    this.urgent = false;
    this.sentAt = now;
    s.sendUp('in', {
      c: r3(now),
      p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.vel.x), r2(p.vel.y), r2(p.vel.z), r3(p.yaw), p.onGround ? 1 : 0],
      i: this.held ? 1 : 0,
      ip: this.ip,
      sel: p.selectedItem,
      e: this.q.slice(0, 16),
      ka: this.lastKick,
      h: this.hostPid,
    });
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    const s = this.s;
    const g = this.game;
    const p = this.me;
    dt = Math.min(dt, 0.1);
    // 1) our own player, exactly like offline (same physics, same intent)
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      g.time += h;
      p._now = g.time;
      const it = p.controller ? p.controller.getIntent(g, p, h) || emptyIntent() : emptyIntent();
      if (it.bonk) this._bonk(p);
      if (it.useItem != null) {
        if (Number.isInteger(it.useItem) || typeof it.useItem === 'string') this._edge('u', it.useItem);
      }
      if (it.selectSlot != null) this.sel = p.selectedItem = Math.max(0, Math.min(ITEMS.length - 1, it.selectSlot | 0));
      if (it.emote) this._edge('m', it.emote);
      if (it.say) this._edge('s', it.say);
      it.emote = it.say = null; // the host plays these for everyone
      const held = !!it.interact;
      if (held !== this.held) {
        if (held) this.ip++;
        this.held = held;
        this.urgent = true;
      }
      p.intent = it;
      this.simulating = true;
      try {
        g._movePlayer(p, h);
      } finally {
        this.simulating = false;
      }
    }
    this._separate(p);
    // 2) the shared clock follows the host's
    const hostNow = s.clock + this.offset;
    const err = hostNow - g.time;
    if (Math.abs(err) > 0.5) g.time = hostNow;
    else g.time += err * Math.min(1, dt * 2);
    // 3) everyone else, a little in the past
    this._interpolate(hostNow - s.rates.interp);
    this._advanceLocal(dt);
    this._prompt(p, dt);
    this._keepLocal(p);
    this._send();
  }

  _bonk(p) {
    const g = this.game;
    this._edge('b', 1);
    if (p.carrying || g.time < p.stunUntil || g.time < p.bonkReadyAt) return;
    // swing right away (the host decides who got hit)
    p.swingStart = this.predSwing = g.time;
    p.bonkReadyAt = this.predReady = g.time + PLAYER.bonk.cooldown * p.mods.bonkCd;
    bus.emit('bonk:swing', { player: p });
  }

  _separate(p) {
    const r = R * 2 * 0.9;
    for (const q of this.game.players) {
      if (q === p || Math.abs(q.pos.y - p.pos.y) > 4) continue;
      const dx = p.pos.x - q.pos.x, dz = p.pos.z - q.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (r - d) / 2;
      p.pos.x += (dx / d) * push;
      p.pos.z += (dz / d) * push;
    }
  }

  _interpolate(rt) {
    if (!this.count) return;
    let i = this.head;
    let newer = -1;
    let k = 0;
    for (; k < this.count; k++) {
      if (this.ring[i].t <= rt) break;
      newer = i;
      i = (i - 1 + RING) % RING;
    }
    let a, b, t, ext;
    if (k === this.count) {
      a = b = this.ring[newer]; // older than anything we have: hold the oldest
      t = 0;
      ext = 0;
    } else {
      a = this.ring[i];
      b = newer >= 0 ? this.ring[newer] : null;
      if (b) {
        t = (rt - a.t) / Math.max(1e-4, b.t - a.t);
        ext = 0;
      } else {
        b = a;
        t = 0;
        ext = Math.min(0.25, rt - a.t); // ticks are late: coast for a moment
      }
    }
    const g = this.game;
    const A = a.P, B = b.P;
    for (let j = 0; j < g.players.length; j++) {
      if (j === this.slot) continue;
      const q = g.players[j];
      const o = j * PLAYER_STRIDE;
      const og = (t < 0.5 ? A : B)[o + 7] === 1;
      q.pos.x = A[o] + (B[o] - A[o]) * t + A[o + 3] * ext;
      q.pos.z = A[o + 2] + (B[o + 2] - A[o + 2]) * t + A[o + 5] * ext;
      q.pos.y = og || !ext ? A[o + 1] + (B[o + 1] - A[o + 1]) * t : Math.max(0, A[o + 1] + A[o + 4] * ext - 0.5 * WORLD.gravity * ext * ext);
      q.vel.x = B[o + 3];
      q.vel.y = B[o + 4];
      q.vel.z = B[o + 5];
      q.yaw = lerpAngle(A[o + 6], B[o + 6], t);
      q.onGround = og;
    }
    const MA = a.M, MB = b.M;
    for (let j = 0; j < g.monsters.length; j++) {
      const m = g.monsters[j];
      const o = j * MONSTER_STRIDE;
      m.x = MA[o] + (MB[o] - MA[o]) * t + MA[o + 3] * ext;
      m.z = MA[o + 1] + (MB[o + 1] - MA[o + 1]) * t + MA[o + 4] * ext;
      m.yaw = lerpAngle(MA[o + 2], MB[o + 2], t);
      m.vx = MB[o + 3];
      m.vz = MB[o + 4];
      const src = t < 0.5 ? MA : MB;
      m.state = monsterState(src[o + 5]);
      m.target = src[o + 6] >= 0 ? src[o + 6] : null;
    }
  }

  // Between host updates: balloons fly, plants grow and cash piles fill up the same way they do there.
  _advanceLocal(dt) {
    const g = this.game;
    const grav = WORLD.gravity * 0.35;
    for (const b of this.proj) {
      b.vy -= grav * dt;
      b.x += b.vx * dt;
      b.y = Math.max(0.3, b.y + b.vy * dt);
      b.z += b.vz * dt;
    }
    for (const gd of g.gardens) {
      for (const pl of gd.planters) {
        const pt = pl.plant;
        if (!pt) continue;
        if (pt.growLeft > 0) pt.growLeft = Math.max(0.001, pt.growLeft - dt); // "grown" is the host's call
        else gd.cashPile += g.plantIncome(pt, gd.owner) * dt;
      }
    }
  }

  // Our own proximity prompt, computed here so it appears and fills without waiting for the host.
  _prompt(p, dt) {
    const li = this.li;
    const f = this.game.findInteraction(p);
    if (!f) {
      li.key = null;
      li.t = 0;
      li.hold = 0;
      li.label = li.verb = '';
      li.fired = false;
      return;
    }
    if (f.key !== li.key) {
      li.key = f.key;
      li.t = 0;
      li.fired = false;
    }
    li.hold = f.hold;
    li.label = f.label;
    li.verb = f.verb;
    li.rarity = f.rarity;
    if (this.held) {
      if (f.hold > 0 && !li.fired) {
        li.t += dt / (p.mods?.hold || 1);
        if (li.t >= f.hold) {
          li.t = f.hold;
          li.fired = true;
        }
      }
    } else {
      li.t = 0;
      li.fired = false;
    }
  }
}
