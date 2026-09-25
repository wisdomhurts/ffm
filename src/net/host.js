// The room host: runs the real Game for everyone. Remote players move on their own devices; the host
// takes their positions after a sanity check, runs every rule, and streams the world back ~10x a second.
import { PLAYER, WORLD, ITEMS } from '../config.js';
import { bus } from '../core/events.js';
import { emptyIntent } from '../gameplay/player.js';
import { EMOTE, PHRASE } from '../social/catalog.js';
import { BotController } from '../ai/bot.js';
import {
  RATES, TIMEOUTS, MAX_HUMANS, EventCodec, forwarded, packPlayers, packMonsters, packProjectiles, sectionize, signature,
  stringifyR, num, int, isId, sanitizeLook, sanitizePet, RateLimiter, upTopic, relay,
} from './protocol.js';

const R = WORLD.playerRadius;

/** Intent for a remote player, built from their 'in' messages (edges arrive with sequence numbers). */
export class RemoteController {
  constructor() {
    this.held = false;
    this.release = false; // report one released tick (a fresh press while still held)
    this.sel = null;
    this.q = []; // pending one-shot actions: ['j'|'b'|'u'|'m'|'s', value]
  }
  push(kind, value) {
    if (this.q.length < 24) this.q.push(kind, value);
  }
  getIntent() {
    const it = emptyIntent();
    it.interact = this.held && !this.release;
    this.release = false;
    if (this.sel != null) {
      it.selectSlot = this.sel;
      this.sel = null;
    }
    // at most one of each per tick, in order
    while (this.q.length) {
      const k = this.q[0];
      const v = this.q[1];
      if ((k === 'j' && it.jump) || (k === 'b' && it.bonk) || (k === 'u' && it.useItem != null) || (k === 'm' && it.emote) || (k === 's' && it.say)) break;
      this.q.splice(0, 2);
      if (k === 'j') it.jump = true;
      else if (k === 'b') it.bonk = true;
      else if (k === 'u') it.useItem = v;
      else if (k === 'm') it.emote = v;
      else if (k === 's') it.say = v;
    }
    return it;
  }
}

export class HostRole {
  /**
   * @param {object} s  the session (send, clock, pid, transport, emit)
   * @param {Game} game the real game (this device's app.game)
   */
  constructor(s, game, { epoch = 1, order = null } = {}) {
    this.s = s;
    this.game = game;
    this.epoch = epoch;
    this.order = order ? order.slice() : [s.pid];
    this.members = new Map(); // pid -> member (remote humans only)
    this.banned = new Set();
    this.seq = 0;
    this.tickAcc = 0;
    this.events = [];
    this.codec = new EventCodec(game);
    this.lastSig = {};
    this.lastJson = {};
    this.limitIn = new RateLimiter(40, 60);
    this.limitHello = new RateLimiter(1, 4);
    this.limitAct = new RateLimiter(6, 16); // shop/look/gift/trade actions per member
    this.forceKey = true;
    this.off = [
      bus.on('*', ({ name, payload }) => {
        try {
          if (relay.depth || !forwarded(name) || !payload || this.s.role !== this) return;
          this.codec.foreign = false;
          const enc = this.codec.encode(payload);
          if (!this.codec.foreign) this.events.push([name, enc]);
          if (this.events.length > 120) this.events.splice(0, 40);
        } catch (e) {
          console.warn('[net] event not shared', name, e);
        }
      }),
      // rules that throw a remote player around: tell their device (see _kick)
      bus.on('player:hit', ({ target }) => this._needKick(target)),
      bus.on('monster:caught', ({ target }) => this._needKick(target)),
    ];
  }

  dispose() {
    for (const f of this.off) f();
    for (const m of this.members.values()) m.up?.leave();
    this.members.clear();
  }

  get humans() {
    return this.members.size + 1;
  }

  /** Members whose devices are currently following this host (decides host-vs-host ties). */
  followers() {
    let n = 0;
    for (const m of this.members.values()) if (m.follows && this.s.clock - m.lastIn < 3) n++;
    return n;
  }

  // ---------------------------------------------------------------- joining and leaving

  /** A friend wants in. Returns a reason string when refused. */
  async onHello(msg) {
    const s = this.s;
    const pid = msg.pid;
    if (!this.limitHello.allow(pid, s.clock)) return;
    if (msg.v !== s.version) return s.sendRoom('reject', { to: pid, reason: 'version' });
    if (this.banned.has(pid)) return s.sendRoom('reject', { to: pid, reason: 'kicked' });
    let m = this.members.get(pid);
    if (!m) {
      const g = this.game;
      const free = g.players.filter((p) => p.kind === 'bot');
      if (!free.length || this.humans >= MAX_HUMANS) return s.sendRoom('reject', { to: pid, reason: 'full' });
      const who = msg.who;
      const pref = free.find((p) => p.char.id === who.base) || free[0];
      m = this._addMember(pid, pref.slot, who, msg.data);
      // the uplink must be open before we tell them to start sending on it
      try {
        await m.up.subscribe();
      } catch {
        /* inputs will still arrive once the channel recovers */
      }
      if (this.s.role !== this || !this.members.has(pid)) return;
    } else if (s.clock - m.welcomedAt < 2.5) return; // a re-sent hello crossed our welcome
    m.welcomedAt = s.clock;
    m.lastIn = s.clock;
    s.sendRoom('welcome', {
      to: pid, slot: m.slot, ep: this.epoch, h: s.pid, order: this.order, priv: !!s.room?.private, name: s.room?.name || '',
      st: JSON.parse(stringifyR(this.game.serializeFull())),
    });
    s.onMembersChanged();
  }

  _addMember(pid, slot, who, data) {
    const g = this.game;
    const profile = { id: who.id, name: who.name, look: who.look || undefined, pet: who.pet };
    let p;
    try {
      p = g.setSlot(slot, { kind: 'remote', profile, pid, data: data && typeof data === 'object' ? data : null });
    } catch (e) {
      console.warn('[net] could not load a joiner\'s garden; starting them fresh', e);
      p = g.setSlot(slot, { kind: 'remote', profile, pid });
    }
    const ctrl = new RemoteController();
    p.controller = ctrl;
    p.remoteMotion = true;
    const m = this._member(pid, p, ctrl);
    if (!this.order.includes(pid)) this.order.push(pid);
    this.orderDirty = true;
    this.s.rememberWho(who);
    return m;
  }

  _member(pid, p, ctrl) {
    const m = {
      pid, slot: p.slot, ctrl, up: null,
      base: { x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: 0, vy: 0, vz: 0, yaw: p.yaw, og: true, t: this.s.clock, c: null },
      ex: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
      lastIn: this.s.clock, goneAt: null, lastEdge: 0, ip: 0, welcomedAt: -9, follows: true,
      kick: 0, kickPending: false, kickAt: 0, kickTries: 0, kickGraceUntil: 0, needKick: false, fixAt: 0,
    };
    m.up = this.s.t.channel(upTopic(this.s.room.code, pid), { presence: false });
    m.up.on('in', (msg) => this.onIn(m, msg));
    this.members.set(pid, m);
    return m;
  }

  /** Promotion: the old host is gone and this device's mirror becomes the real game. */
  adoptMirror(alive) {
    const g = this.game;
    for (const p of g.players) {
      p.remoteMotion = false;
      if (p.kind === 'remote') {
        if (p.pid && alive.has(p.pid) && p.pid !== this.s.pid) {
          const ctrl = new RemoteController();
          p.controller = ctrl;
          p.remoteMotion = true;
          const m = this._member(p.pid, p, ctrl);
          m.base.vx = p.vel.x;
          m.base.vz = p.vel.z;
          m.up.subscribe().catch(() => {});
        } else {
          this.s.forgetWho(p.pid);
          this._toBot(p.slot);
        }
      } else if (p.kind === 'bot' && !(p.controller instanceof BotController)) {
        p.controller = new BotController(p.char.personality, g.difficultyId);
      }
    }
    this.order = this.order.filter((pid) => pid === this.s.pid || this.members.has(pid));
    this.order = [this.s.pid, ...this.order.filter((x) => x !== this.s.pid)];
    for (const pid of this.members.keys()) if (!this.order.includes(pid)) this.order.push(pid);
    this.orderDirty = true;
    g.paused = false;
    this.forceKey = true;
  }

  _toBot(slot) {
    const g = this.game;
    const p = g.setSlot(slot, { kind: 'bot' });
    p.remoteMotion = false;
    p.controller = new BotController(p.char.personality, g.difficultyId);
    return p;
  }

  removeMember(pid, reason = 'left') {
    const m = this.members.get(pid);
    if (!m) return;
    this.members.delete(pid);
    m.up?.leave();
    this.limitIn.forget(pid);
    this.order = this.order.filter((x) => x !== pid);
    this.orderDirty = true;
    this._toBot(m.slot);
    this.s.forgetWho(pid);
    this.s.onMembersChanged({ left: pid, reason });
  }

  kick(pid) {
    if (!this.members.has(pid)) return false;
    this.banned.add(pid);
    this.s.sendRoom('kicked', { to: pid });
    this.removeMember(pid, 'kicked');
    return true;
  }

  onPresence(present) {
    const now = this.s.clock;
    for (const m of this.members.values()) {
      if (present.has(m.pid)) m.goneAt = null;
      else if (m.goneAt == null) m.goneAt = now;
    }
  }

  // ---------------------------------------------------------------- inputs

  onIn(m, msg) {
    const s = this.s;
    if (s.role !== this || this.members.get(m.pid) !== m || !msg || typeof msg !== 'object') return;
    if (!this.limitIn.allow(m.pid, s.clock)) return;
    const p = this.game.players[m.slot];
    if (!p || p.pid !== m.pid) return;
    m.lastIn = s.clock;
    m.goneAt = null;
    const ctrl = m.ctrl;
    // one-shot actions, each exactly once (they are re-sent until we acknowledge them in a tick)
    if (Array.isArray(msg.e)) {
      for (const e of msg.e.slice(0, 24)) {
        if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] <= m.lastEdge) continue;
        m.lastEdge = e[0];
        this._edge(m, p, e[1], e[2]);
      }
    }
    // held interact; a new press while we still think it's held counts as release + press
    m.follows = msg.h === s.pid;
    const held = !!msg.i;
    if (Number.isInteger(msg.ip) && msg.ip !== m.ip) {
      if (ctrl.held && held) ctrl.release = true;
      m.ip = msg.ip;
    }
    ctrl.held = held;
    if (Number.isInteger(msg.sel) && msg.sel >= 0 && msg.sel < ITEMS.length && msg.sel !== p.selectedItem) ctrl.sel = msg.sel;
    if (m.kickPending && Number.isInteger(msg.ka) && msg.ka >= m.kick) {
      m.kickPending = false;
      p.remoteMotion = true;
      m.kickGraceUntil = s.clock + 1.5;
      const b = m.base;
      b.x = p.pos.x;
      b.y = p.pos.y;
      b.z = p.pos.z;
      b.t = s.clock;
      b.c = null;
    }
    if (!m.kickPending && Array.isArray(msg.p) && msg.p.length === 8) this._motion(m, p, msg.p, num(msg.c, NaN));
  }

  _edge(m, p, k, v) {
    const ctrl = m.ctrl;
    if (k === 'j' || k === 'b') ctrl.push(k, true);
    else if (k === 'u') {
      if (Number.isInteger(v) && v >= 0 && v < ITEMS.length) ctrl.push('u', v);
      else if (isId(v) && ITEMS.some((i) => i.id === v)) ctrl.push('u', v);
    } else if (k === 'm') {
      if (EMOTE[v]) ctrl.push('m', v);
    } else if (k === 's') {
      if (PHRASE[v]) ctrl.push('s', v);
    } else if (k === 'a' && Array.isArray(v) && typeof v[0] === 'string') {
      if (this.limitAct.allow(m.pid, this.s.clock)) this.act(p, v[0], Array.isArray(v[1]) ? v[1].slice(0, 4) : []);
    }
  }

  /** Accept a remote player's own position if it is physically possible, otherwise the closest that is. */
  _motion(m, p, a, c) {
    for (let i = 0; i < 8; i++) if (typeof a[i] !== 'number' || !Number.isFinite(a[i])) return;
    const s = this.s;
    const g = this.game;
    const b = m.base;
    let x = a[0], y = Math.max(-1, Math.min(60, a[1])), z = a[2];
    // time the client says passed (its own clock), never more than what really passed here (+ jitter)
    const dth = s.clock - b.t;
    let dt = b.c != null && Number.isFinite(c) ? c - b.c : dth;
    dt = Math.max(0, Math.min(dt, dth + 0.3, 1.5));
    const fast = s.clock < m.kickGraceUntil ? 32 : 0;
    const vmax = Math.max(p.maxSpeed(g.time), PLAYER.baseSpeed) * 1.3 + fast;
    const allowed = vmax * dt + 2.5;
    let dx = x - b.x, dz = z - b.z;
    const d = Math.hypot(dx, dz);
    let fix = false;
    if (d > allowed) {
      const k = allowed / d;
      x = b.x + dx * k;
      z = b.z + dz * k;
      dx *= k;
      dz *= k;
      fix = true;
    }
    // walk the same path through the world's colliders (fences, walls, locked gates)
    const sw = this._sweep(p, b.x, b.z, x, z, Math.max(b.y, y));
    if ((sw.x - x) ** 2 + (sw.z - z) ** 2 > 1.2 * 1.2) {
      x = sw.x;
      z = sw.z;
      fix = true;
    }
    b.x = x;
    b.y = y;
    b.z = z;
    // velocity only drives dead reckoning and the physics after a kick: keep it to what's possible
    let vx = a[3], vz = a[5];
    const vh = Math.hypot(vx, vz), vcap = vmax * 1.1;
    if (vh > vcap) {
      vx *= vcap / vh;
      vz *= vcap / vh;
    }
    b.vx = fix ? 0 : vx;
    b.vy = fix ? 0 : Math.max(-150, Math.min(WORLD.jumpVelocity + 30, a[4]));
    b.vz = fix ? 0 : vz;
    b.yaw = Math.atan2(Math.sin(a[6]), Math.cos(a[6]));
    b.og = !!a[7];
    b.t = s.clock;
    b.c = Number.isFinite(c) ? c : null;
    // tell them where they really are (not more than twice a second)
    if (fix && s.clock >= m.fixAt) {
      m.fixAt = s.clock + 0.5;
      this._applyBase(m, p, 0);
      this._kick(m, p);
    }
  }

  _sweep(p, x0, z0, x1, z1, y) {
    const phys = this.game.physics;
    const pos = this._sw || (this._sw = { x: 0, y: 0, z: 0, _grounded: true });
    pos.x = x0;
    pos.z = z0;
    pos.y = y;
    pos._grounded = true;
    const lasers = this.game._laserBoxesFor(p);
    const n = Math.min(40, Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (R * 0.5))));
    const sx = (x1 - x0) / n, sz = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      pos.x += sx;
      pos.z += sz;
      phys.resolve(pos, R, lasers);
    }
    return pos;
  }

  // Dead reckoning: between their messages, remote players keep moving the way they were going.
  _applyBase(m, p, age) {
    const b = m.base;
    age = Math.min(age, 0.15);
    p.pos.x = b.x + b.vx * age;
    p.pos.z = b.z + b.vz * age;
    p.pos.y = b.og ? b.y : Math.max(0, b.y + b.vy * age - 0.5 * WORLD.gravity * age * age);
    if (age > 0) {
      p.pos._grounded = b.og;
      this.game.physics.resolve(p.pos, R, null);
    }
    p.vel.x = b.vx;
    p.vel.y = b.vy;
    p.vel.z = b.vz;
    p.yaw = b.yaw;
    p.onGround = b.og;
  }

  _needKick(target) {
    if (relay.depth || !target || target.kind !== 'remote' || this.game.players[target.slot] !== target) return;
    const m = this.members.get(target.pid);
    if (m) m.needKick = true;
  }

  /** The rules moved a remote player (knockback, caught, respawn, correction): their device must follow. */
  _kick(m, p, resend = false) {
    if (!resend) {
      m.kick++;
      m.kickTries = 0;
    }
    m.kickPending = true;
    m.kickAt = this.s.clock;
    m.kickTries++;
    p.remoteMotion = false; // we simulate them until their device confirms
    this.s.sendRoom('kick', {
      to: m.pid, k: m.kick, p: [p.pos.x, p.pos.y, p.pos.z].map((v) => Math.round(v * 100) / 100),
      v: [p.vel.x, p.vel.y, p.vel.z].map((v) => Math.round(v * 100) / 100), su: p.stunUntil, iu: p.invulnUntil,
    });
  }

  // ---------------------------------------------------------------- actions (UI changes routed by app.act)

  act(p, name, args) {
    const g = this.game;
    if (!p || !g) return false;
    switch (name) {
      case 'buyItem': {
        const qty = int(args[1], 1, 99, 1);
        return isId(args[0]) ? g.buyItem(p, args[0], qty) : false;
      }
      case 'buySpeed': return g.buySpeed(p);
      case 'rebirth': return g.rebirth(p);
      case 'buyEgg': return isId(args[0]) ? g.buyEgg(p, args[0]) : null;
      case 'setPet': g.setPet(p, sanitizePet(args[0])); return true;
      case 'setLook': {
        const look = sanitizeLook(args[0]);
        if (look) g.setLook(p, look);
        return !!look;
      }
      case 'gift': {
        const to = g.players[int(args[0], 0, 3, -1)];
        return to ? g.giftPlant(p, to, int(args[1], 0, 9, -1)) : false;
      }
      case 'addCash': {
        // quest and badge rewards; capped so a modified client can't print money
        const n = Math.floor(num(args[0]));
        const cap = Math.max(20000, g.gardenIncome(g.gardens[p.slot]) * 1200); // ~20 minutes of their income
        if (n > 0) p.cash += Math.min(n, cap);
        return true;
      }
      case 'emote':
      case 'say': {
        const id = args[0];
        if (name === 'emote' ? !EMOTE[id] : !PHRASE[id]) return false;
        if (p.controller instanceof RemoteController) p.controller.push(name === 'emote' ? 'm' : 's', id);
        else p.controller?.queue?.(name, id);
        return true;
      }
      default:
        if (name.startsWith('trade')) return this.s.app.trades?.handle?.(p, name, args);
        return false;
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    const s = this.s;
    const g = this.game;
    const now = s.clock;
    for (const m of this.members.values()) {
      const p = g.players[m.slot];
      if (!m.kickPending) this._applyBase(m, p, now - m.base.t);
      else if (now - m.kickAt > 0.6) {
        if (m.kickTries < 4) this._kick(m, p, true);
        else {
          m.kickPending = false; // their device never answered: take its word again
          p.remoteMotion = true;
          m.base.t = now;
          m.base.c = null;
        }
      }
      m.ex.x = p.pos.x;
      m.ex.y = p.pos.y;
      m.ex.z = p.pos.z;
      if (now - m.lastIn > 1) m.ctrl.held = false; // lost contact: let go of the E key
    }
    g.paused = false; // an online world never pauses (the pause menu is just an overlay)
    g.update(dt);
    for (const m of this.members.values()) {
      const p = g.players[m.slot];
      const moved = !m.kickPending && (p.pos.x - m.ex.x) ** 2 + (p.pos.z - m.ex.z) ** 2 + (p.pos.y - m.ex.y) ** 2 > 3 * 3;
      if (m.needKick || moved) {
        m.needKick = false;
        const b = m.base;
        b.x = p.pos.x;
        b.y = p.pos.y;
        b.z = p.pos.z;
        this._kick(m, p);
      }
    }
    // members who vanished or went quiet
    let drop = null;
    for (const m of this.members.values()) {
      if (m.goneAt != null && now - m.goneAt > TIMEOUTS.memberGrace) (drop ||= []).push(m.pid, 'left');
      else if (now - m.lastIn > TIMEOUTS.memberSilent) (drop ||= []).push(m.pid, 'timeout');
    }
    if (drop) for (let i = 0; i < drop.length; i += 2) this.removeMember(drop[i], drop[i + 1]);
    this.tickAcc += dt;
    const rate = s.rates.tick * (this.humans >= 4 ? 0.8 : 1);
    if (this.tickAcc >= 1 / rate || this.forceKey) {
      this.tickAcc = Math.min(this.tickAcc - 1 / rate, 0.5 / rate);
      if (this.tickAcc < 0) this.tickAcc = 0;
      this._tick();
    }
  }

  _tick() {
    const s = this.s;
    const g = this.game;
    this.seq++;
    const key = this.forceKey || this.seq % s.rates.keyEvery === 0;
    const periodic = key || this.seq % s.rates.stateEvery === 0;
    this.forceKey = false;
    const acks = [0, 0, 0, 0];
    for (const m of this.members.values()) acks[m.slot] = m.lastEdge;
    const msg = { h: s.pid, ep: this.epoch, f: this.followers(), s: this.seq, tm: Math.round(g.time * 1000) / 1000, P: packPlayers(g), M: packMonsters(g), B: packProjectiles(g), A: acks };
    if (this.events.length) {
      msg.E = this.events;
      this.events = [];
    }
    const secs = sectionize(g.serializeFull());
    const D = {};
    let any = false;
    for (const k in secs) {
      const v = secs[k];
      const sig = signature(k, v);
      const sigChanged = sig !== this.lastSig[k];
      this.lastSig[k] = sig;
      if (key) {
        D[k] = JSON.parse((this.lastJson[k] = stringifyR(v)));
        any = true;
      } else if (k === 'mo') {
        if (sigChanged) {
          D.mo = v.map((m) => ({ stunUntil: m.stunUntil, attackAt: m.attackAt }));
          any = true;
        }
      } else if (sigChanged || periodic) {
        const json = stringifyR(v);
        if (sigChanged || json !== this.lastJson[k]) {
          this.lastJson[k] = json;
          D[k] = JSON.parse(json);
          any = true;
        }
      }
    }
    if (any) msg.D = D;
    if (key) msg.K = 1;
    if (key || this.orderDirty) {
      msg.O = this.order; // who hosts next if we disappear
      this.orderDirty = false;
    }
    // a full room trims everyone's input rate a little (the service counts every message)
    if (this.humans >= 4) msg.ir = Math.min(s.rates.inMove, 7);
    s.sendRoom('tick', msg);
  }
}
