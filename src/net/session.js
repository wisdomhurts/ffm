// Online rooms for the app: lobby, create/join/quick play, host + clients, host migration, saving.
// Contract (docs/ONLINE.md): createOnline(app) -> {available, isHost, isClient, room, members,
//   listRooms(cb) -> stop, quickPlay(), createRoom({private}), joinRoom(code), leave(), mute(pid), kick(pid),
//   act(name, args), update(dt)}; emits net:status, net:joined, net:left, net:members, net:host, net:error.
//
// Roles: the host (host.js) runs the real Game; everyone else (client.js) keeps a mirror of it and moves
// their own player locally. The host is whoever made the room; if it disappears, the next member in the
// host's join order promotes its mirror (it has the whole world) and the room carries on.
//
// Test transports: `?net=local` (BroadcastChannel between tabs) or window.__SAS_NET__ = 'local'.
// Real play: window.__SAS_ONLINE__ = {url, key} (Supabase project URL + publishable key).
import { CHARACTERS } from '../config.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { getProfile, updateProfile } from '../core/profiles.js';
import { sanitizeName } from '../core/names.js';
import { registerFace, forgetFace } from '../characters/faces.js';
import { createTransport, pickTransport } from './transport.js';
import { HostRole } from './host.js';
import { ClientRole } from './client.js';
import { shareableFace } from './face.js';
import {
  VERSION, RATES, TIMEOUTS, MAX_HUMANS, LOBBY_TOPIC, makeCode, normalizeCode, isCode, roomTopic, upTopic, makePid, isPid,
  sanitizeWho, vetFull, int, num, RateLimiter,
} from './protocol.js';

export { normalizeCode, isCode, CODE_ALPHABET, CODE_LEN, MAX_HUMANS } from './protocol.js';

/** Kid-friendly words for everything that can go wrong. */
export const NET_ERRORS = {
  unavailable: "Online play isn't set up in this copy of the game yet.",
  offline: "You're offline. Connect to the internet to play with friends!",
  connect: "Couldn't reach the game server. Check your internet and try again.",
  bad_code: 'Room codes have 5 letters. Check the code and try again!',
  not_found: "We couldn't find that room. Check the letters and try again!",
  full: 'That room is full (4 players). Try another one!',
  version: 'That room is playing a different version of the game. Refresh this page to update, then try again!',
  no_answer: "The room didn't answer. Try again in a moment!",
  kicked: 'The host took you out of that room.',
  closed: 'The room closed.',
  lost: 'Lost connection to the room.',
  busy: "Couldn't make a room right now. Try again!",
};

const netErr = (code) => Object.assign(new Error(NET_ERRORS[code] || code), { code });

export function createOnline(app, opts = {}) {
  return new Online(app, opts);
}

class Online {
  constructor(app, { transport = null, pid = null, rates = null } = {}) {
    this.app = app;
    this.pick = transport ? { kind: transport.kind } : pickTransport();
    this.t = transport;
    this.available = !!this.pick;
    this.kind = this.pick?.kind || null;
    this.pid = pid || makePid();
    this.version = VERSION;
    const G = typeof globalThis !== 'undefined' ? globalThis : {};
    this.rates = { ...RATES, ...(G.__SAS_ONLINE__?.rates || {}), ...(rates || {}) };
    this.clock = 0;
    this.room = null; // {code, private, name, hostPid, hostName}
    this.role = null;
    this.world = null; // the Game this room drives (app.game while we're in the room)
    this.ch = null;
    this.up = null;
    this.status = 'idle';
    this.members = [];
    this.muted = new Set();
    this.who = new Map(); // pid -> identity card (faces only in private rooms)
    this.present = new Map(); // pid -> presence state
    this.dead = new Set(); // hosts we gave up on
    this._faceSig = new Map();
    this._memberSig = '';
    this._op = null;
    this._pending = null;
    this._saveAt = 0;
    this._lastSave = '';
    this._lobby = null;
    this._lobbyRefs = 0;
    this._lobbyFns = new Set();
    this._rooms = [];
    this._announced = '';
    this._whoAt = null;
    this._whoSig = '';
    this._hostMissingAt = null;
    this._hiddenAt = null;
    this.limitWho = new RateLimiter(1, 3);
    bus.on('profile:changed', ({ profile }) => {
      if (this.room && profile?.id === this._profile()?.id) this._queueWho(0.3);
    });
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('pagehide', () => this.room && this.leave('closed'));
      window.addEventListener('offline', () => this.room && this._status('reconnecting', "You're offline. Trying to reconnect…"));
      let last = performance.now();
      // hidden tabs get no animation frames: keep the room ticking (browsers allow ~1 timer a second)
      setInterval(() => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        if (document.hidden && this.room) this.update(Math.min(dt, 2));
      }, 1000);
      document.addEventListener('visibilitychange', () => {
        last = performance.now();
        this._hiddenAt = document.hidden ? this.clock : null;
      });
    }
  }

  get isHost() {
    return this.role instanceof HostRole;
  }
  get isClient() {
    return this.role instanceof ClientRole;
  }
  get mySlot() {
    return this.isClient ? this.role.slot : this.world?.human?.slot ?? null;
  }

  // ---------------------------------------------------------------- helpers

  _profile() {
    return this.app.profile || getProfile(this.app.profileId) || getProfile(CHARACTERS[0].id);
  }

  _transport() {
    if (!this.t) this.t = createTransport(this.pick.kind, this.pick);
    return this.t;
  }

  _status(status, text = '') {
    this.status = status;
    bus.emit('net:status', { status, text });
  }

  _error(code, err) {
    const message = NET_ERRORS[code] || err?.message || NET_ERRORS.connect;
    this._status('error', message);
    bus.emit('net:error', { code, message });
  }

  _ready() {
    if (!this.available) {
      this._error('unavailable');
      return false;
    }
    if (this.kind === 'supabase' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      this._error('offline');
      return false;
    }
    return true;
  }

  sendRoom(event, payload) {
    return this.ch ? this.ch.send(event, payload) : false;
  }

  sendUp(event, payload) {
    return this.up ? this.up.send(event, payload) : false;
  }

  isMuted(pOrPid) {
    const pid = typeof pOrPid === 'string' ? pOrPid : pOrPid?.pid;
    return !!pid && this.muted.has(pid);
  }

  _presenceState(host) {
    const prof = this._profile();
    return { pid: this.pid, name: sanitizeName(prof.name, 'Player'), v: this.version, at: Date.now(), h: host ? 1 : 0 };
  }

  // Build the room's world through the app (HUD, camera, state machine), like a solo game.
  _enterWorld(opts) {
    const app = this.app;
    let g;
    if (typeof app.startOnline === 'function') g = app.startOnline(opts);
    else {
      g = app._newGame({ mode: 'endless', difficulty: settings.difficulty, ...opts });
      app.state = 'playing';
      app.menus?.hideAll?.();
      if (app.input) app.input.enabled = true;
      app.touch?.setVisible?.(true);
      bus.emit('game:start', { game: g, human: app.human, resumed: false, online: true });
      bus.emit('app:state', { state: 'playing' });
    }
    this.world = g;
    return g;
  }

  // ---------------------------------------------------------------- channels

  async _openRoom(code) {
    const t = this._transport();
    const ch = t.channel(roomTopic(code), { presenceKey: this.pid });
    this.ch = ch;
    ch.on('hello', (m) => this._onHello(m));
    ch.on('welcome', (m) => this._onWelcome(m));
    ch.on('reject', (m) => this._onReject(m));
    ch.on('who', (m) => this._onWho(m));
    ch.on('tick', (m) => this._onTick(m));
    ch.on('kick', (m) => m?.to === this.pid && this.isClient && this.role.onKick(m));
    ch.on('kicked', (m) => m?.to === this.pid && this.room && this._exit('kicked'));
    ch.on('bye', (m) => this._onBye(m));
    ch.onPresence((list) => ch === this.ch && this._onPresence(list));
    ch.onStatus((st) => {
      if (ch !== this.ch || !this.room) return;
      if (st === 'reconnecting') this._status('reconnecting', 'Reconnecting…');
      else if (st === 'joined' && this.status === 'reconnecting') this._status('playing', '');
    });
    try {
      await ch.subscribe();
    } catch {
      throw netErr('connect');
    }
    return ch;
  }

  _closeChannels() {
    this.ch?.leave();
    this.up?.leave();
    this.ch = this.up = null;
  }

  _waitPresence(ms, test) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this._presenceWaiter = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this._presenceWaiter = () => (!test || test()) && done();
    });
  }

  _onPresence(list) {
    this.present.clear();
    for (const m of list) {
      if (!m || !isPid(m.pid) || m.key !== m.pid) continue;
      this.present.set(m.pid, { name: sanitizeName(m.name, 'Player'), v: String(m.v || ''), at: num(m.at), h: !!m.h });
    }
    const known = this._seenPids || (this._seenPids = new Set());
    let fresh = false;
    for (const pid of this.present.keys()) if (!known.has(pid)) {
      known.add(pid);
      if (pid !== this.pid) fresh = true;
    }
    if (fresh && this.role) this._queueWho(1, true); // newcomers need our name/face card
    if (this.isHost) this.role.onPresence(new Set(this.present.keys()));
    else if (this.isClient) {
      if (this.present.has(this.role.hostPid)) this._hostMissingAt = null;
      else if (this._hostMissingAt == null) this._hostMissingAt = this.clock;
    }
    this._presenceWaiter?.();
    this._refreshMembers();
  }

  // ---------------------------------------------------------------- lobby

  _lobbyRef(d) {
    this._lobbyRefs = Math.max(0, this._lobbyRefs + d);
    if (this._lobbyRefs && !this._lobby) {
      const ch = this._transport().channel(LOBBY_TOPIC, { presenceKey: this.pid });
      this._lobby = ch;
      ch.onPresence((list) => {
        if (ch !== this._lobby) return;
        this._rooms = list.map((r) => cleanRoom(r, this.version)).filter(Boolean).sort((a, b) => b.n - a.n || b.at - a.at);
        for (const fn of this._lobbyFns) fn(this._rooms);
        this._lobbyWaiter?.();
      });
      ch.subscribe().catch(() => {
        if (ch === this._lobby) for (const fn of this._lobbyFns) fn(this._rooms, 'connect');
      });
    } else if (!this._lobbyRefs && this._lobby) {
      this._lobby.leave();
      this._lobby = null;
      this._rooms = [];
    }
  }

  /** Watch the public rooms. cb(rooms: [{code, name, host, n, max, full, v, ok}], error?) -> stop(). */
  listRooms(cb) {
    if (!this.available) {
      cb([], 'unavailable');
      return () => {};
    }
    this._lobbyFns.add(cb);
    this._lobbyRef(1);
    cb(this._rooms);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this._lobbyFns.delete(cb);
      this._lobbyRef(-1);
    };
  }

  _announce() {
    const want = this.room && this.isHost && !this.room.private;
    if (!want) {
      if (this._announced) {
        this._lobby?.untrack();
        this._announced = '';
        this._lobbyRef(-1);
      }
      return;
    }
    const n = this.role.humans;
    const st = { code: this.room.code, host: sanitizeName(this._profile().name, 'Player'), n, max: MAX_HUMANS, v: this.version, at: Date.now() };
    const sig = `${st.code}|${st.host}|${n}`;
    if (sig === this._announced) return;
    if (!this._announced) this._lobbyRef(1);
    this._announced = sig;
    this._lobby.track(st);
  }

  // ---------------------------------------------------------------- joining

  _beginOp(kind) {
    this._cancelOp();
    const op = { kind, cancelled: false };
    this._op = op;
    return op;
  }

  _cancelOp() {
    if (this._op) this._op.cancelled = true;
    this._op = null;
    if (this._pending) {
      this._pending.reject(netErr('cancelled'));
      this._pending = null;
    }
  }

  /** Stop whatever join/create is in progress (the lobby's Cancel button). */
  cancel() {
    const busy = !!this._op;
    this._cancelOp();
    if (busy && !this.role) {
      this._closeChannels();
      this.room = null;
      this._status('idle', '');
    }
  }

  /** Make a room and host it. Returns the room code (or null). */
  async createRoom({ private: priv = false } = {}) {
    if (!this._ready()) return null;
    this.leave('switch');
    const op = this._beginOp('create');
    this._status('connecting', priv ? 'Making your private room…' : 'Making your room…');
    try {
      let code = null;
      for (let tries = 0; tries < 4 && !code; tries++) {
        const c = makeCode();
        await this._openRoom(c);
        await this._waitPresence(700, () => [...this.present.keys()].some((p) => p !== this.pid));
        if (op.cancelled) throw netErr('cancelled');
        if ([...this.present.keys()].some((p) => p !== this.pid)) this._closeChannels(); // taken: roll again
        else code = c;
      }
      if (!code) throw netErr('busy');
      const prof = this._profile();
      const name = sanitizeName(prof.name, 'Player');
      this.room = { code, private: !!priv, name: `${name}'s Garden`, hostPid: this.pid, hostName: name };
      const mySlot = Math.max(0, CHARACTERS.findIndex((c) => c.id === prof.base));
      const slots = CHARACTERS.map((c, i) => (i === mySlot ? { kind: 'local', profile: prof, pid: this.pid } : { kind: 'bot' }));
      const game = this._enterWorld({ mode: 'endless', difficulty: settings.difficulty, slots });
      if (prof.online) {
        try {
          game.loadSlot(mySlot, prof.online);
          game._recomputeNetWorth();
        } catch (e) {
          console.warn('[net] could not load online garden', e);
        }
      }
      this.role = new HostRole(this, game, { epoch: 1, order: [this.pid] });
      this.ch.track(this._presenceState(true));
      this._joined();
      return code;
    } catch (e) {
      if (op === this._op || !op.cancelled) this._fail(e);
      return null;
    } finally {
      if (this._op === op) this._op = null;
    }
  }

  /** Join a room by its code. Resolves true once we're in. */
  async joinRoom(raw, { quiet = false } = {}) {
    const code = normalizeCode(raw);
    if (!isCode(code)) {
      this._error('bad_code');
      return false;
    }
    if (!this._ready()) return false;
    this.leave('switch');
    const op = this._beginOp('join');
    this._status('joining', `Joining room ${code}…`);
    try {
      await this._openRoom(code);
      this.up = this._transport().channel(upTopic(code, this.pid), { presence: false });
      await this.up.subscribe().catch(() => {
        throw netErr('connect');
      });
      this.ch.track(this._presenceState(false));
      const others = () => [...this.present.keys()].filter((p) => p !== this.pid);
      await this._waitPresence(TIMEOUTS.presence * 1000, () => others().length > 0);
      if (op.cancelled) throw netErr('cancelled');
      if (!others().length) throw netErr('not_found');
      const hostSt = [...this.present.values()].find((st) => st.h);
      if (hostSt && hostSt.v !== this.version) throw netErr('version');
      const prof = this._profile();
      const hello = {
        v: this.version, pid: this.pid, who: this._who(null),
        data: prof.online && typeof prof.online === 'object' ? prof.online : null,
      };
      const welcome = await this._await(TIMEOUTS.welcome * 1000, () => this.sendRoom('hello', hello), 1500);
      if (op.cancelled) throw netErr('cancelled');
      const hostName = sanitizeName(this.present.get(welcome.h)?.name, 'Host');
      this.room = { code, private: !!welcome.priv, name: `${hostName}'s Garden`, hostPid: welcome.h, hostName };
      if (!this._startClient(welcome)) throw netErr('no_answer');
      this._joined();
      return true;
    } catch (e) {
      if (!op.cancelled) {
        if (quiet) {
          this._closeChannels();
          this.room = null;
        } else this._fail(e);
      }
      return false;
    } finally {
      if (this._op === op) this._op = null;
    }
  }

  /** Join the busiest public room with space, or open a new public room. */
  async quickPlay() {
    if (!this._ready()) return false;
    this.leave('switch');
    this._status('searching', 'Looking for a room…');
    this._lobbyRef(1);
    try {
      if (!this._rooms.length) {
        await new Promise((resolve) => {
          const timer = setTimeout(done, 2500);
          function done() {
            clearTimeout(timer);
            resolve();
          }
          this._lobbyWaiter = done;
        });
        this._lobbyWaiter = null;
      }
      const rooms = this._rooms.filter((r) => r.ok && !r.full);
      for (const r of rooms.slice(0, 3)) {
        if (await this.joinRoom(r.code, { quiet: true })) return true;
      }
      return !!(await this.createRoom({ private: false }));
    } finally {
      this._lobbyRef(-1);
    }
  }

  _await(ms, resend, every) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(netErr('no_answer')), ms);
      const again = setInterval(resend, every);
      const finish = (err, v) => {
        clearTimeout(timer);
        clearInterval(again);
        if (this._pending === pend) this._pending = null;
        if (err) reject(err);
        else resolve(v);
      };
      const pend = { resolve: (v) => finish(null, v), reject: (e) => finish(e) };
      this._pending = pend;
      resend();
    });
  }

  _fail(e) {
    const code = e?.code || 'connect';
    this._closeChannels();
    this.room = null;
    this.role = null;
    if (code !== 'cancelled') this._error(code, e);
    else this._status('idle', '');
  }

  _joined() {
    this._status('playing', '');
    this._saveAt = this.clock + 10;
    this._hostMissingAt = null;
    this.dead.clear();
    this._announce();
    this._refreshMembers(true);
    this._whoSig = '';
    this._queueWho(0, true);
    bus.emit('net:joined', { room: { ...this.room }, isHost: this.isHost });
    bus.emit('net:host', { pid: this.room.hostPid, isHost: this.isHost });
  }

  // ---------------------------------------------------------------- messages

  _onHello(m) {
    if (!this.isHost || !m || typeof m !== 'object' || !isPid(m.pid) || m.pid === this.pid) return;
    const who = sanitizeWho({ ...(m.who || {}), pid: m.pid }, !!this.room?.private);
    if (!who) return;
    this.role.onHello({ v: m.v, pid: m.pid, who, data: m.data && typeof m.data === 'object' ? m.data : null }).catch((e) => console.warn('[net] hello failed', e));
  }

  _onWelcome(m) {
    if (!m || m.to !== this.pid || !isPid(m.h)) return;
    if (this._pending) return this._pending.resolve(m);
    // a welcome we didn't wait for: the host re-seated us after a reconnect or a host change
    // (a repeat of the one we already have — our hello was re-sent — changes nothing)
    if (this.isClient && m.h === this.role.hostPid && m.slot === this.role.slot) return;
    if (this.room && !this.isHost) {
      this.room.hostPid = m.h;
      this._startClient(m);
      this._refreshMembers(true);
    }
  }

  _onReject(m) {
    if (!m || m.to !== this.pid) return;
    const reason = ['full', 'version', 'kicked', 'closed'].includes(m.reason) ? m.reason : 'no_answer';
    if (this._pending) this._pending.reject(netErr(reason));
    else if (this.room && !this.isHost) this._exit(reason);
  }

  _startClient(m) {
    const full = vetFull(m.st);
    if (!full) return false;
    const slot = int(m.slot, 0, CHARACTERS.length - 1, -1);
    if (slot < 0) return false;
    const old = this.role;
    const reuse = !!this.world && this.app.game === this.world && this.world.human?.slot === slot;
    let game = reuse ? this.world : null;
    old?.dispose();
    this.role = null;
    if (!game) {
      const prof = this._profile();
      const slots = full.players.map((d, i) => (i === slot ? { kind: 'local', profile: prof, pid: this.pid }
        : d.kind === 'bot' ? { kind: 'bot' }
          : { kind: 'remote', pid: d.pid, profile: { id: d.profileId, name: d.name, look: d.look, pet: d.pet } }));
      game = this._enterWorld({ mode: 'endless', difficulty: full.difficulty || 'normal', slots });
    }
    const order = Array.isArray(m.order) ? m.order.filter(isPid) : [m.h];
    this.dead.clear(); // a fresh seat: forget hosts we gave up on before
    this._hostMissingAt = null;
    this.role = new ClientRole(this, game, { slot, epoch: int(m.ep, 1, 1e9, 1), hostPid: m.h, order, full });
    this.role.start();
    return true;
  }

  _onTick(m) {
    if (!m || typeof m !== 'object' || !isPid(m.h) || !Number.isInteger(m.ep) || !this.room) return;
    if (this.isHost) {
      // Two hosts (a network split, or a frozen host waking up): the one people actually follow wins,
      // then the newer epoch, then the lower pid. The loser rejoins the winner's room as a member.
      const r = this.role;
      if (m.h === this.pid) return;
      const mine = r.followers(), theirs = int(m.f, 0, 8, 0);
      if (theirs > mine || (theirs === mine && (m.ep > r.epoch || (m.ep === r.epoch && m.h < this.pid)))) this._rejoin();
      return;
    }
    if (!this.isClient) return;
    const r = this.role;
    if (m.h !== r.hostPid) {
      // only switch hosts when ours is really gone (a device that lost its connection and
      // promoted itself must not steal the room when it comes back)
      const ourGone = this.dead.has(r.hostPid) || this.clock - r.lastTickAt > 1.5;
      if (m.ep <= r.epoch || !ourGone || this.dead.has(m.h)) return;
    }
    this.dead.delete(m.h);
    if (!this.present.size || this.present.has(m.h)) this._hostMissingAt = null;
    r.onTick(m);
  }

  _onWho(m) {
    if (!this.room || !m || typeof m !== 'object' || m.pid === this.pid) return;
    if (!this.limitWho.allow(m.pid, this.clock)) return;
    const w = sanitizeWho(m, !!this.room.private);
    if (!w) return;
    this.who.set(w.pid, w);
    this._syncFaces();
  }

  _onBye(m) {
    if (!this.room || !m || !isPid(m.pid) || m.pid === this.pid) return;
    if (this.isHost) {
      this.role.removeMember(m.pid, 'left');
      this._announce();
    } else if (this.isClient && m.pid === this.role.hostPid) {
      this.dead.add(m.pid);
      if (isPid(m.next)) this.role.order = [m.next, ...this.role.order.filter((p) => p !== m.next)];
      this._hostLost();
    }
  }

  /** Called by the host role when someone joined/left. */
  onMembersChanged(info) {
    this._announce();
    this._refreshMembers(false, info?.reason);
  }

  rememberWho(w) {
    if (w?.pid) this.who.set(w.pid, w);
    this._syncFaces();
  }

  forgetWho(pid) {
    if (!pid) return;
    this.who.delete(pid);
    this._faceSig.delete(pid);
    forgetFace('r_' + pid);
  }

  onStateApplied() {
    this._syncFaces();
    this._refreshMembers();
  }

  onHostChanged(pid) {
    if (!this.room) return;
    this.dead.clear(); // the room has a host again: whoever we gave up on may be back as a member
    this.room.hostPid = pid;
    this.room.hostName = sanitizeName(this.present.get(pid)?.name, this.room.hostName);
    this._hostMissingAt = null;
    this._status('playing', '');
    this._refreshMembers(true);
    bus.emit('net:host', { pid, isHost: false });
  }

  // ---------------------------------------------------------------- identity cards and faces

  _who(face) {
    const prof = this._profile();
    const eq = prof.pets?.owned?.find((x) => x.uid === prof.pets.equipped)?.id || null;
    const w = { pid: this.pid, id: prof.id, name: sanitizeName(prof.name, 'Player'), base: prof.base, look: prof.look, pet: eq };
    if (face) w.face = face;
    return w;
  }

  _queueWho(delay, force = false) {
    this._whoAt = Math.min(this._whoAt ?? Infinity, this.clock + delay);
    if (force) this._whoForce = true;
  }

  async _sendWho(force) {
    const room = this.room;
    if (!room) return;
    const prof = this._profile();
    const face = room.private && prof.shareFace ? await shareableFace(prof.id) : null;
    if (this.room !== room) return;
    const w = this._who(face);
    const sig = JSON.stringify({ ...w, face: face ? face.length : 0 });
    if (!force && sig === this._whoSig) return; // nothing new to tell
    this._whoSig = sig;
    this.sendRoom('who', w);
  }

  // Remote players' names/colours (and, in private rooms only, the faces they chose to share).
  _syncFaces() {
    const g = this.world;
    if (!g || !this.room) return;
    for (const p of g.players) {
      if (p.kind !== 'remote' || !p.pid) continue;
      const w = this.who.get(p.pid);
      const info = { name: p.name, color: p.char.color, skin: p.look?.skin || null, face: this.room.private ? w?.face || null : null };
      const sig = `${info.name}|${info.color}|${info.skin}|${info.face ? info.face.length : 0}`;
      if (this._faceSig.get(p.pid) === sig) continue;
      this._faceSig.set(p.pid, sig);
      registerFace('r_' + p.pid, info);
    }
  }

  // ---------------------------------------------------------------- members (for the UI)

  _refreshMembers(force = false, reason = null) {
    const g = this.world;
    const room = this.room;
    const list = [];
    if (g && room) {
      for (const p of g.players) {
        if (p.kind === 'bot') continue;
        const pid = p.kind === 'local' ? this.pid : p.pid;
        if (!pid) continue;
        list.push({
          pid, name: p.name, slot: p.slot, faceKey: p.faceKey, color: p.char.color, isHost: pid === room.hostPid, isMe: pid === this.pid,
          muted: this.muted.has(pid),
        });
      }
    }
    const sig = list.map((m) => `${m.pid}:${m.name}:${m.slot}:${m.isHost ? 1 : 0}:${m.muted ? 1 : 0}`).join('|');
    if (!force && sig === this._memberSig) return;
    const before = new Set(this.members.map((m) => m.pid));
    const now = new Set(list.map((m) => m.pid));
    // (the first list after joining is "who was already here", not news)
    const joined = before.size ? list.filter((m) => !before.has(m.pid) && !m.isMe).map((m) => m.pid) : [];
    const left = this.members.filter((m) => !now.has(m.pid) && !m.isMe).map((m) => m.pid);
    this._memberSig = sig;
    this.members = list;
    bus.emit('net:members', { members: list, joined, left, reason });
  }

  mute(pid, on = !this.muted.has(pid)) {
    if (!isPid(pid) || pid === this.pid) return false;
    if (on) this.muted.add(pid);
    else this.muted.delete(pid);
    this._refreshMembers(true);
    return on;
  }

  /** Host only: remove someone from the room (they can't come back to this room). */
  kick(pid) {
    if (!this.isHost || pid === this.pid) return false;
    const ok = this.role.kick(pid);
    this._announce();
    return ok;
  }

  /** app.act while online (clients send everything to the host; the host handles trades here). */
  act(name, args = []) {
    if (!this.role) return false;
    if (this.isClient) return this.role.act(name, args);
    return this.role.act(this.world?.human, name, args);
  }

  // ---------------------------------------------------------------- host changes

  _hostLost() {
    const r = this.role;
    if (!this.isClient || !this.room) return;
    this.dead.add(r.hostPid);
    let order = r.order.filter((p) => !this.dead.has(p));
    if (!order.includes(this.pid)) order.push(this.pid);
    // whoever is still here, in the order the host let them in
    if (this.present.size) order = order.filter((p) => p === this.pid || this.present.has(p));
    const next = order[0];
    if (next === this.pid) this._promote();
    else {
      r.hostPid = next;
      r.lastTickAt = this.clock;
      this._hostMissingAt = null;
      this._status('reconnecting', 'Switching to a new host…');
    }
  }

  _promote() {
    const c = this.role;
    const game = c.game;
    c.dispose();
    const alive = new Set([...this.present.keys()].filter((p) => !this.dead.has(p)));
    const order = [this.pid, ...c.order.filter((p) => p !== this.pid && !this.dead.has(p))];
    const host = new HostRole(this, game, { epoch: c.epoch + 1, order });
    this.role = host;
    host.adoptMirror(alive);
    this.up?.leave();
    this.up = null;
    this.room.hostPid = this.pid;
    this.room.hostName = sanitizeName(this._profile().name, 'Player');
    this.room.name = `${this.room.hostName}'s Garden`;
    this.ch.track(this._presenceState(true));
    this._status('playing', '');
    this._announce();
    this._refreshMembers(true);
    bus.emit('net:host', { pid: this.pid, isHost: true, promoted: true });
  }

  /** Host only: pass hosting to the next member and stay in the room as a member. */
  handoff() {
    const r = this.role;
    if (!(r instanceof HostRole) || this._rejoining) return false;
    const next = r.order.find((p) => p !== this.pid && r.members.has(p) && this.present.has(p));
    if (!next) return false;
    this._saveNow();
    this.sendRoom('bye', { pid: this.pid, next, stay: 1 });
    this._rejoin();
    return true;
  }

  /**
   * Ask the host to seat us again: after losing a host-vs-host tie, or when the host dropped us
   * (we were away too long). The world is kept when we get the same garden back.
   */
  async onDropped() {
    return this._rejoin();
  }

  async _rejoin() {
    if (this._rejoining || !this.room) return;
    this._rejoining = true;
    const room = this.room;
    this._saveNow();
    this.role?.dispose();
    this.role = null;
    this._announce();
    this._status('reconnecting', 'Finding the room again…');
    try {
      if (!this.up) {
        this.up = this._transport().channel(upTopic(room.code, this.pid), { presence: false });
        await this.up.subscribe();
      }
      this.ch.track(this._presenceState(false));
      const hello = { v: this.version, pid: this.pid, who: this._who(null), data: this._profile().online };
      const welcome = await this._await(TIMEOUTS.welcome * 1000, () => this.sendRoom('hello', hello), 1500);
      if (this.room !== room) return;
      room.hostPid = welcome.h;
      room.hostName = sanitizeName(this.present.get(welcome.h)?.name, room.hostName);
      if (!this._startClient(welcome)) throw netErr('lost');
      this._status('playing', '');
      this._refreshMembers(true);
      this._queueWho(0.5, true);
      bus.emit('net:host', { pid: welcome.h, isHost: false });
    } catch (e) {
      if (this.room === room && e?.code !== 'cancelled') this._exit(e?.code === 'no_answer' ? 'lost' : e?.code || 'lost');
    } finally {
      this._rejoining = false;
    }
  }

  // ---------------------------------------------------------------- leaving

  /** Leave the room (saves your online garden). The app decides what to show next. */
  leave(reason = 'left') {
    this._cancelOp();
    const had = !!this.room;
    if (this.room && this.role) {
      this._saveNow();
      if (this.isHost) {
        const next = this.role.order.find((p) => p !== this.pid && this.role.members.has(p));
        this.sendRoom('bye', { pid: this.pid, next: next || null });
      } else this.sendRoom('bye', { pid: this.pid });
    }
    this.role?.dispose();
    this.role = null;
    this._announce();
    this._closeChannels();
    for (const pid of this.who.keys()) forgetFace('r_' + pid);
    if (this.world) for (const p of this.world.players) if (p.kind === 'remote' && p.pid) forgetFace('r_' + p.pid);
    this.who.clear();
    this._faceSig.clear();
    this.present.clear();
    this._seenPids?.clear();
    this.dead.clear();
    this.room = null;
    this.world = null;
    this.members = [];
    this._memberSig = '';
    if (had) {
      if (this.status !== 'error') this._status('idle', '');
      bus.emit('net:left', { reason });
    }
  }

  // Leave because of something that happened in the room, and go back to the title screen.
  _exit(reason) {
    const inWorld = this.world && this.app.game === this.world;
    this.leave(reason);
    if (reason !== 'left') this._error(reason);
    if (inWorld) this.app.quitToTitle?.();
  }

  _saveNow() {
    const g = this.world;
    const slot = this.mySlot;
    // only ever save a garden that is really ours right now
    if (!g || slot == null || !g.players[slot] || g.players[slot].pid !== this.pid) return;
    try {
      const data = g.serializeSlot(slot);
      const json = JSON.stringify(data);
      if (json === this._lastSave) return;
      this._lastSave = json;
      const prof = this._profile();
      updateProfile(prof.id, (p) => {
        p.online = data;
      });
    } catch (e) {
      console.warn('[net] could not save the online garden', e);
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    if (!(dt >= 0)) return;
    if (!this.room) {
      this.clock += Math.min(dt, 1);
      return;
    }
    if (this.world && this.app.game !== this.world) {
      this.leave('quit'); // the app moved on (title screen, solo game)
      return;
    }
    if (!this.role) {
      this.clock += Math.min(dt, 1);
      return;
    }
    // long gaps (hidden tab) run in small steps so the host's world keeps its pace
    let left = Math.min(dt, 2);
    do {
      const h = Math.min(left, 0.1);
      left -= h;
      this.clock += h;
      if (this.isHost) this.role.update(h);
      else if (this.isClient) {
        this.role.update(h);
        // the host left (presence says so): move on quickly; just quiet: give it a few seconds
        const silent = this.clock - this.role.lastTickAt;
        const missing = this._hostMissingAt != null && this.clock - this._hostMissingAt > 1.2;
        if (silent > TIMEOUTS.hostSilent || (missing && silent > 1)) this._hostLost();
      }
    } while (left > 1e-6 && this.role);
    if (!this.room) return;
    if (this._whoAt != null && this.clock >= this._whoAt) {
      const force = this._whoForce;
      this._whoAt = null;
      this._whoForce = false;
      this._sendWho(force);
    }
    if (this.clock >= this._saveAt) {
      this._saveAt = this.clock + 10;
      this._saveNow();
    }
    if (this.isHost) this._announce();
    if (this._hiddenAt != null) {
      const hidden = this.clock - this._hiddenAt;
      // a hidden tab only gets a timer tick a second: let someone who's looking run the room
      if (this.isHost && hidden > TIMEOUTS.hiddenHandoff) this.handoff();
      if (hidden > TIMEOUTS.hiddenLeave) this._exit('left');
    }
  }
}

// A public room from the lobby's presence list, cleaned up for display.
function cleanRoom(r, version) {
  if (!r || !isCode(r.code)) return null;
  const n = int(r.n, 1, MAX_HUMANS, 1);
  const host = sanitizeName(r.host, 'Player');
  const v = String(r.v || '');
  return { code: r.code, host, name: `${host}'s Garden`, n, max: MAX_HUMANS, full: n >= MAX_HUMANS, v, ok: v === version, at: num(r.at) };
}
