// Online rooms for the app: lobby, create/join/quick play, host + clients, host migration, saving.
// Contract (docs/ONLINE.md): createOnline(app) -> {available, isHost, isClient, room, members,
//   listRooms(cb) -> stop, quickPlay(), createRoom({private}), joinRoom(code), leave(), mute(pid), kick(pid),
//   act(name, args), update(dt)}; emits net:status, net:joined, net:left, net:members, net:host, net:error.
//
// Roles: the host (host.js) runs the real Game; everyone else (client.js) keeps a mirror of it and moves
// their own player locally. The host is whoever made the room; if it disappears, the next member in the
// host's join order promotes its mirror (it has the whole world) and the room carries on.
//
// Trust: every message is sealed with pair keys (crypto.js, protocol.js). Members only obey their host,
// the host only takes a member's inputs from that member, and nobody can speak for anyone else.
//
// Test transports: `?net=local` (BroadcastChannel between tabs) or window.__SAS_NET__ = 'local'.
// Real play: src/online/config.js (or window.__SAS_ONLINE__ = {url, key}).
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
import { createIdentity, cryptoReady, pairKey, pidOf, macOf, digestOf, same, sha256, utf8, b64 } from './crypto.js';
import {
  VERSION, RATES, TIMEOUTS, MAX_HUMANS, LOBBY_TOPIC, makeCode, normalizeCode, isCode, roomTopic, upTopic, isPid,
  sanitizeWho, vetFull, int, num, RateLimiter,
} from './protocol.js';

export { normalizeCode, isCode, CODE_ALPHABET, CODE_LEN, MAX_HUMANS } from './protocol.js';

/** Kid-friendly words for everything that can go wrong. */
export const NET_ERRORS = {
  unavailable: "Online play isn't set up in this copy of the game yet.",
  insecure: 'Online play needs the game opened from its secure (https) web address.',
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
const nonce = () => b64(sha256(utf8(Math.random() + ':' + Date.now() + ':' + (typeof performance !== 'undefined' ? performance.now() : 0)))).slice(0, 16);

export function createOnline(app, opts = {}) {
  return new Online(app, opts);
}

class Online {
  constructor(app, { transport = null, rates = null } = {}) {
    this.app = app;
    this.pick = transport ? { kind: transport.kind } : pickTransport();
    this.t = transport;
    this.kind = this.pick?.kind || null;
    this.available = !!this.pick && cryptoReady();
    this.unavailable = !this.pick ? 'unavailable' : !cryptoReady() ? 'insecure' : null;
    this.id = null; // {pid, dk, priv}: made on first use (see _ensureId)
    this.pid = null;
    this.version = VERSION;
    const G = typeof globalThis !== 'undefined' ? globalThis : {};
    this.rates = { ...RATES, ...(G.__SAS_ONLINE__?.rates || {}), ...(rates || {}) };
    this.clock = 0;
    this.room = null; // {code, private, faceOk, name, hostPid, hostName, createdAt}
    this.role = null;
    this.world = null; // the Game this room drives (app.game while we're in the room)
    this.ch = null;
    this.up = null;
    this.status = 'idle';
    this.members = [];
    this.muted = new Set();
    this.who = new Map(); // pid -> identity card (faces only in private rooms)
    this.present = new Map(); // pid -> verified presence state
    this.dead = new Set(); // hosts we gave up on
    this.keys = new Map(); // pid -> {dk, key, p}: pair keys for this room
    this.seen = new Map(); // pid+channel -> last message counter (no replays)
    this.sendN = 0;
    this._code = null;
    this._faceSig = new Map();
    this._memberSig = '';
    this._op = null;
    this._pending = null;
    this._saveAt = 0;
    this._lastSave = '';
    this._lobby = null;
    this._lobbyRefs = 0;
    this._lobbyFns = new Set();
    this._lobbyErr = null;
    this._rooms = [];
    this._announced = '';
    this._whoAt = null;
    this._whoSig = '';
    this._hostMissingAt = null;
    this._hiddenAt = null;
    this._qpUntil = 0;
    this.limitWho = new RateLimiter(1, 3);
    const mine = (id) => this.room && id && id === this._profile()?.id;
    bus.on('profile:changed', ({ profile }) => mine(profile?.id) && this._queueWho(0.3));
    bus.on('face:changed', ({ id } = {}) => mine(id) && this._queueWho(0.3)); // a new Photo Booth photo
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('pagehide', () => this.room && this.leave('closed'));
      window.addEventListener('offline', () => this.room && this._status('reconnecting', "You're offline. Trying to reconnect…"));
      window.addEventListener('online', () => this._lobbyErr && this._lobbyRetry());
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
    if (!this.t) this.t = createTransport(this.pick.kind, { ...this.pick, rates: this.rates });
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

  _offline() {
    return this.kind === 'supabase' && typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  _ready() {
    if (!this.available) {
      this._error(this.unavailable || 'unavailable');
      return false;
    }
    if (this._offline()) {
      this._error('offline');
      return false;
    }
    return true;
  }

  async _ensureId() {
    if (!this._idP) {
      this._idP = createIdentity().then((id) => {
        this.id = id;
        this.pid = id.pid;
        return id;
      });
      this._idP.catch(() => (this._idP = null));
    }
    return this._idP;
  }

  isMuted(pOrPid) {
    const pid = typeof pOrPid === 'string' ? pOrPid : pOrPid?.pid;
    return !!pid && this.muted.has(pid);
  }

  _presenceState(host) {
    const prof = this._profile();
    return {
      pid: this.pid, dk: this.id.dk, name: sanitizeName(prof.name, 'Player'), v: this.version, at: Date.now(), h: host ? 1 : 0,
      hp: host ? this.pid : this.isClient ? this.role.hostPid : this._joinHost || null,
    };
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

  // ---------------------------------------------------------------- sealed messages

  _resetCrypto(code) {
    this._code = code;
    this.keys.clear();
    this.seen.clear();
  }

  /** A peer's public key (pid-bound): start making our pair key with them. */
  _learn(pid, dk) {
    if (!this.id || !this._code || pid === this.pid || !isPid(pid) || pidOf(dk) !== pid) return null;
    let e = this.keys.get(pid);
    if (e && e.dk === dk) return e;
    const code = this._code;
    e = { dk, key: null, p: null };
    e.p = pairKey(this.id, pid, dk, code).then((k) => {
      if (this.keys.get(pid) === e && this._code === code) e.key = k;
      return e.key;
    }, () => null);
    this.keys.set(pid, e);
    return e;
  }

  _key(pid) {
    return this.keys.get(pid)?.key || null;
  }

  async _keyAsync(pid) {
    const e = this.keys.get(pid);
    return e ? e.key || (await e.p) : null;
  }

  /** Seal a message for one peer (pid) or several (array). Returns the envelope, or null (no keys yet). */
  seal(event, payload, to) {
    const d = JSON.stringify([++this.sendN, payload]);
    const dg = digestOf(event, d);
    if (typeof to === 'string') {
      const k = this._key(to);
      return k ? { f: this.pid, d, m: macOf(k, dg) } : null;
    }
    const m = {};
    let any = false;
    for (const pid of to) {
      const k = this._key(pid);
      if (!k) continue;
      m[pid] = macOf(k, dg);
      any = true;
    }
    return any ? { f: this.pid, d, m } : null;
  }

  /** Verify an envelope meant for us (from `from`, if given). Returns the payload or null. */
  open(event, env, chan, from = null) {
    if (!env || typeof env !== 'object' || typeof env.d !== 'string' || env.d.length > 400000 || !isPid(env.f)) return null;
    if (env.f === this.pid || (from && env.f !== from)) return null;
    const key = this._key(env.f);
    if (!key) return null;
    const mac = typeof env.m === 'string' ? env.m : env.m && typeof env.m === 'object' && !Array.isArray(env.m) ? env.m[this.pid] : null;
    if (typeof mac !== 'string' || !same(mac, macOf(key, digestOf(event, env.d)))) return null;
    let a;
    try {
      a = JSON.parse(env.d);
    } catch {
      return null;
    }
    if (!Array.isArray(a) || a.length !== 2 || !Number.isSafeInteger(a[0]) || !a[1] || typeof a[1] !== 'object') return null;
    const sk = env.f + chan;
    if (a[0] <= (this.seen.get(sk) ?? -1)) return null; // replayed or out of date
    this.seen.set(sk, a[0]);
    return a[1];
  }

  /** open() for rare messages that may arrive before our pair key with the sender is ready. */
  async openAsync(event, env, chan, from = null) {
    if (!env || !isPid(env?.f)) return null;
    if (!this._key(env.f)) {
      if (typeof env.k === 'string') this._learn(env.f, env.k);
      await this._keyAsync(env.f);
    }
    return this.open(event, env, chan, from);
  }

  /** Everyone we can seal for in this room (present peers + the host's members). */
  _peers() {
    const set = new Set(this.present.keys());
    if (this.isHost) for (const pid of this.role.members.keys()) set.add(pid);
    set.delete(this.pid);
    return [...set];
  }

  /** Sealed broadcast on the room channel (to everyone we have keys for, or `to`). */
  sendRoom(event, payload, to = null) {
    if (!this.ch) return false;
    const env = this.seal(event, payload, to || this._peers());
    return env ? this.ch.send(event, env) : false;
  }

  /** Sealed message to the host on our own uplink. */
  sendUp(event, payload) {
    const host = this.isClient ? this.role.hostPid : this._joinHost;
    if (!this.up || !host) return false;
    const env = this.seal(event, payload, host);
    return env ? this.up.send(event, env) : false;
  }

  // ---------------------------------------------------------------- channels

  async _openRoom(code) {
    const t = this._transport();
    this._resetCrypto(code);
    const ch = t.channel(roomTopic(code), { presenceKey: this.pid });
    this.ch = ch;
    ch.on('hello', (e) => this._onHello(e));
    ch.on('reject', (e) => this._onReject(e));
    ch.on('who', (e) => this._onWho(e));
    ch.on('tick', (e) => this._onTick(e));
    ch.on('bye', (e) => this._onBye(e));
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

  // Our own uplink (member <-> host): the host's welcome/kick/kicked arrive here.
  async _openUp(code) {
    this.up?.leave();
    const up = this._transport().channel(upTopic(code, this.pid), { presence: false });
    this.up = up;
    up.on('welcome', (e) => this._onWelcome(e));
    up.on('kick', (e) => {
      if (!this.isClient) return;
      const m = this.open('kick', e, 'u', this.role.hostPid);
      if (m && m.to === this.pid) this.role.onKick(m);
    });
    up.on('kicked', (e) => {
      const host = this.isClient ? this.role.hostPid : null;
      const m = host && this.open('kicked', e, 'u', host);
      if (m && m.to === this.pid && this.room) this._exit('kicked');
    });
    await up.subscribe().catch(() => {
      throw netErr('connect');
    });
    return up;
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
      // a presence entry only counts when its pid really is the hash of its key
      if (!m || !isPid(m.pid) || m.key !== m.pid || pidOf(m.dk) !== m.pid) continue;
      this.present.set(m.pid, {
        name: sanitizeName(m.name, 'Player'), v: String(m.v || ''), at: num(m.at), h: !!m.h, hp: isPid(m.hp) ? m.hp : null, dk: m.dk,
      });
      if (m.pid !== this.pid) this._learn(m.pid, m.dk);
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

  /**
   * Which present device runs the room? The one claiming to host that the most members follow
   * (then the oldest). Members can't fake each other's entries (pids are key hashes).
   */
  _pickHost() {
    let best = null;
    for (const [pid, st] of this.present) {
      if (!st.h || pid === this.pid) continue;
      let votes = 0;
      for (const [, o] of this.present) if (o.hp === pid) votes++;
      const c = { pid, votes, at: st.at, v: st.v };
      if (!best || c.votes > best.votes || (c.votes === best.votes && (c.at < best.at || (c.at === best.at && c.pid < best.pid)))) best = c;
    }
    return best;
  }

  // ---------------------------------------------------------------- lobby

  _lobbyRef(d) {
    this._lobbyRefs = Math.max(0, this._lobbyRefs + d);
    if (this._lobbyRefs && !this._lobby) this._lobbyOpen();
    else if (!this._lobbyRefs && this._lobby) {
      this._lobby.leave();
      this._lobby = null;
      this._rooms = [];
      this._lobbyErr = null;
    }
  }

  _lobbyOpen() {
    if (this._offline()) {
      this._lobbyErr = 'offline';
      for (const fn of this._lobbyFns) fn(this._rooms, 'offline');
      return;
    }
    const ch = this._transport().channel(LOBBY_TOPIC, { presenceKey: 'lobby-' + (this.pid || nonce()) });
    this._lobby = ch;
    this._lobbyErr = null;
    this._lobbySynced = false;
    ch.onPresence((list) => {
      if (ch !== this._lobby) return;
      this._lobbyErr = null;
      this._lobbySynced = true;
      this._rooms = list.map((r) => cleanRoom(r, this.version)).filter(Boolean).sort((a, b) => b.n - a.n || b.at - a.at);
      for (const fn of this._lobbyFns) fn(this._rooms);
      this._lobbyWaiter?.();
    });
    const fail = (why) => {
      if (ch !== this._lobby) return;
      // stop trying: the list says so and offers a retry (no reconnect loop behind a closed lobby)
      this._lobbyErr = why;
      if (!this._announced) {
        ch.leave();
        this._lobby = null;
      }
      for (const fn of this._lobbyFns) fn(this._rooms, why);
      this._lobbyWaiter?.();
    };
    ch.onStatus((st) => st === 'reconnecting' && fail(this._offline() ? 'offline' : 'connect'));
    ch.subscribe().catch(() => fail(this._offline() ? 'offline' : 'connect'));
  }

  _lobbyRetry() {
    if (!this._lobbyRefs) return;
    this._lobby?.leave();
    this._lobby = null;
    this._lobbyOpen();
  }

  /**
   * Watch the public rooms. cb(rooms: [{code, name, host, n, max, full, v, ok}], error?) -> stop().
   * error: 'unavailable' | 'insecure' | 'offline' | 'connect'. stop.retry() tries again after an error.
   */
  listRooms(cb) {
    if (!this.available) {
      cb([], this.unavailable || 'unavailable');
      const stop = () => {};
      stop.retry = () => {};
      return stop;
    }
    this._lobbyFns.add(cb);
    this._lobbyRef(1);
    cb(this._rooms, this._lobbyErr || undefined);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      this._lobbyFns.delete(cb);
      this._lobbyRef(-1);
    };
    stop.retry = () => !stopped && this._lobbyRetry();
    return stop;
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
    const st = {
      code: this.room.code, host: sanitizeName(this._profile().name, 'Player'), n, max: MAX_HUMANS, v: this.version, at: Date.now(),
      c: this.room.createdAt || Date.now(),
    };
    const sig = `${st.code}|${st.host}|${n}`;
    if (sig === this._announced && this._lobby) return;
    if (!this._announced) this._lobbyRef(1);
    if (!this._lobby) this._lobbyOpen();
    this._announced = sig;
    this._lobby?.track(st);
  }

  // Quick Play friends pressing at the same moment each open a room: the newer one moves to the older.
  _quickMerge() {
    if (!this.isHost || this.role.members.size || this.clock > this._qpUntil || this._merging) return;
    const mine = this.room;
    const c = mine.createdAt;
    const other = this._rooms.find((r) => r.code !== mine.code && r.ok && !r.full && (r.c < c || (r.c === c && r.code < mine.code)));
    if (!other) return;
    this._merging = true;
    this._qpUntil = 0;
    (async () => {
      try {
        if (!(await this.joinRoom(other.code, { quiet: true }))) await this.createRoom({ private: false, quick: true });
      } finally {
        this._merging = false;
      }
    })();
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
  async createRoom({ private: priv = false, quick = false } = {}) {
    if (!this._ready()) return null;
    this.leave('switch');
    const op = this._beginOp('create');
    this._status('connecting', priv ? 'Making your private room…' : 'Making your room…');
    try {
      await this._ensureId().catch(() => {
        throw netErr('insecure');
      });
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
      this.room = { code, private: !!priv, faceOk: !!priv, name: `${name}'s Garden`, hostPid: this.pid, hostName: name, createdAt: Date.now() };
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
      this._qpUntil = quick ? this.clock + 8 : 0;
      this._joined();
      return code;
    } catch (e) {
      if (!op.cancelled) this._fail(e);
      return null;
    } finally {
      if (this._op === op) this._op = null;
    }
  }

  /**
   * Join a room by its code. Resolves true once we're in. `typed`: the player typed the code in (the
   * only way a Photo Booth face is ever shared: private room, and its code isn't in the public list).
   */
  async joinRoom(raw, { quiet = false, typed = false } = {}) {
    const code = normalizeCode(raw);
    if (!isCode(code)) {
      this._error('bad_code');
      return false;
    }
    if (!this._ready()) return false;
    this.leave('switch');
    const op = this._beginOp('join');
    this._status('joining', `Joining room ${code}…`);
    let listed = null;
    if (typed) {
      // is this code announced in the public lobby? (then it's a public room, whatever its host says)
      this._lobbyRef(1);
      listed = (async () => {
        if (this._lobby && !this._lobbySynced && !this._lobbyErr) {
          await new Promise((resolve) => {
            const timer = setTimeout(done, 1800);
            function done() {
              clearTimeout(timer);
              resolve();
            }
            this._lobbyWaiter = done;
          });
          this._lobbyWaiter = null;
        }
        const pub = !!this._lobbyErr || this._rooms.some((r) => r.code === code);
        this._lobbyRef(-1);
        return pub;
      })();
    }
    try {
      await this._ensureId().catch(() => {
        throw netErr('insecure');
      });
      await this._openRoom(code);
      await this._openUp(code);
      this._joinHost = null;
      this.ch.track(this._presenceState(false));
      await this._waitPresence(TIMEOUTS.presence * 1000, () => !!this._pickHost());
      if (op.cancelled) throw netErr('cancelled');
      const host = this._pickHost();
      if (!host) throw netErr([...this.present.keys()].some((p) => p !== this.pid) ? 'no_answer' : 'not_found');
      if (host.v !== this.version) throw netErr('version');
      if (!(await this._keyAsync(host.pid))) throw netErr('no_answer');
      const welcome = await this._hello(host.pid);
      if (op.cancelled) throw netErr('cancelled');
      const isListed = listed ? await listed : true;
      listed = null;
      const hostName = sanitizeName(welcome.st?.players?.find((p) => p?.pid === host.pid)?.name, 'Host');
      this.room = {
        code, private: !!welcome.priv, faceOk: typed && !!welcome.priv && !isListed, name: `${hostName}'s Garden`,
        hostPid: host.pid, hostName, createdAt: 0,
      };
      if (!this._startClient(welcome, host.pid)) throw netErr('no_answer');
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
      if (listed) listed.catch(() => {});
      if (this._op === op) this._op = null;
    }
  }

  // Say hello to a host (sealed for it, with our public key) until it answers on our uplink.
  _hello(hostPid) {
    this._joinHost = hostPid;
    const hn = nonce();
    this._hn = hn;
    const prof = this._profile();
    const payload = {
      to: hostPid, v: this.version, hn, who: this._who(null),
      data: prof.online && typeof prof.online === 'object' ? prof.online : null,
    };
    return this._await(TIMEOUTS.welcome * 1000, () => {
      const env = this.seal('hello', payload, hostPid);
      if (!env || !this.ch) return;
      env.k = this.id.dk; // lets the host make our pair key before it has seen our presence
      this.ch.send('hello', env);
    }, 1500);
  }

  /** Join the busiest public room with space, or open a new public room. */
  async quickPlay() {
    if (!this._ready()) return false;
    this.leave('switch');
    this._status('searching', 'Looking for a room…');
    this._lobbyRef(1);
    try {
      if (!this._lobbySynced && !this._lobbyErr) {
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
      if (this._lobbyErr) {
        this._error(this._lobbyErr);
        return false;
      }
      const rooms = this._rooms.filter((r) => r.ok && !r.full);
      for (const r of rooms.slice(0, 3)) {
        if (await this.joinRoom(r.code, { quiet: true })) return true;
      }
      return !!(await this.createRoom({ private: false, quick: true }));
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
    if (this.isClient) this.ch.track(this._presenceState(false)); // now we can say which host we follow
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

  async _onHello(env) {
    if (!this.isHost || !env || !isPid(env.f)) return;
    const m = await this.openAsync('hello', env, 'r');
    if (!m || m.to !== this.pid || !this.isHost || typeof m.hn !== 'string' || m.hn.length > 32) return;
    const who = sanitizeWho(m.who, env.f, !!this.room?.faceOk);
    if (!who) return;
    this.role.onHello(env.f, { v: m.v, hn: m.hn, who, data: m.data }).catch((e) => console.warn('[net] hello failed', e));
  }

  async _onWelcome(env) {
    const host = this._joinHost;
    if (!host || !this._pending) return;
    const m = await this.openAsync('welcome', env, 'u', host);
    if (!m || m.to !== this.pid || m.hn !== this._hn) return;
    this._pending?.resolve(m);
  }

  _onReject(env) {
    const host = this._joinHost;
    if (!host || !this._pending) return;
    const m = this.open('reject', env, 'r', host);
    if (!m || m.to !== this.pid || m.hn !== this._hn) return;
    const reason = ['full', 'version', 'kicked', 'closed'].includes(m.reason) ? m.reason : 'no_answer';
    this._pending.reject(netErr(reason));
  }

  _startClient(m, hostPid) {
    const full = vetFull(m.st);
    if (!full) return false;
    const slot = int(m.slot, 0, CHARACTERS.length - 1, -1);
    if (slot < 0 || full.players[slot]?.pid !== this.pid) return false;
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
    const order = Array.isArray(m.order) ? m.order.filter(isPid) : [hostPid];
    this.dead.clear(); // a fresh seat: forget hosts we gave up on before
    this._hostMissingAt = null;
    this.role = new ClientRole(this, game, { slot, epoch: int(m.ep, 1, 1e9, 1), hostPid, order, full, banned: m.bn });
    this.role.start();
    return true;
  }

  _onTick(env) {
    if (!this.room || !this.role || !env || !isPid(env.f)) return;
    const from = env.f;
    if (this.isHost) {
      // Another device thinks it hosts this room (a network split, or we were frozen). We step down only
      // when nobody follows us any more (what we see ourselves, not what the other side claims).
      if (from === this.pid) return;
      const m = this.open('tick', env, 'r');
      if (!m || !Number.isInteger(m.ep)) return;
      const r = this.role;
      if (r.followers() > 0) return; // people follow us: we stay
      // nobody follows us: step down if the room follows them (presence), or by epoch/pid on a tie
      let theirs = 0, ours = 0;
      for (const [pid, st] of this.present) {
        if (pid === from || pid === this.pid) continue;
        if (st.hp === from) theirs++;
        else if (st.hp === this.pid) ours++;
      }
      if (theirs > ours || (theirs === ours && (m.ep > r.epoch || (m.ep === r.epoch && from < this.pid)))) this._rejoin(from);
      return;
    }
    if (!this.isClient) return;
    const r = this.role;
    if (from !== r.hostPid) {
      // switch hosts only when ours is really gone and the new one is one of the room's members
      const ourGone = this.dead.has(r.hostPid) || this.clock - r.lastTickAt > 1.5;
      if (!ourGone || this.dead.has(from) || !r.order.includes(from)) return;
    }
    const m = this.open('tick', env, 'r', from);
    if (!m || !Number.isInteger(m.ep) || (from !== r.hostPid && m.ep <= r.epoch)) return;
    m.h = from;
    this.dead.delete(from);
    if (!this.present.size || this.present.has(from)) this._hostMissingAt = null;
    r.onTick(m);
  }

  async _onWho(env) {
    if (!this.room || !env || !isPid(env.f)) return;
    const m = await this.openAsync('who', env, 'r');
    if (!m || !this.room) return;
    // too many cards too fast: keep only the newest and apply it a moment later (never drop a "no face")
    if (!this.limitWho.allow(env.f, this.clock)) return void (this._whoLater ||= new Map()).set(env.f, m);
    this._applyWho(env.f, m);
  }

  _applyWho(pid, m) {
    const w = sanitizeWho(m, pid, !!this.room.faceOk);
    if (!w) return;
    this.who.set(w.pid, w);
    this._syncFaces();
  }

  async _onBye(env) {
    if (!this.room || !env || !isPid(env.f)) return;
    const m = await this.openAsync('bye', env, 'r');
    if (!m || !this.isClient || env.f !== this.role.hostPid) return;
    if (Number.isInteger(m.ep) && m.ep !== this.role.epoch) return; // an old goodbye
    this.dead.add(env.f);
    if (isPid(m.next)) this.role.order = [m.next, ...this.role.order.filter((p) => p !== m.next)];
    this._hostLost();
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
    const name = this.world?.players.find((p) => p.pid === pid)?.name || this.present.get(pid)?.name;
    this.room.hostName = sanitizeName(name, this.room.hostName);
    this.room.name = `${this.room.hostName}'s Garden`;
    this._hostMissingAt = null;
    this._status('playing', '');
    if (this.ch && this.id) this.ch.track(this._presenceState(false)); // we follow the new host now
    this._refreshMembers(true);
    bus.emit('net:host', { pid, isHost: false });
  }

  // ---------------------------------------------------------------- identity cards and faces

  _who(face) {
    const prof = this._profile();
    const eq = prof.pets?.owned?.find((x) => x.uid === prof.pets.equipped)?.id || null;
    const w = { id: prof.id, name: sanitizeName(prof.name, 'Player'), base: prof.base, look: prof.look, pet: eq };
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
    // faces only go to private rooms we know are private (never after Quick Play or the public list)
    const face = room.faceOk && prof.shareFace ? await shareableFace(prof.id) : null;
    if (this.room !== room) return;
    const w = this._who(face);
    const sig = JSON.stringify({ ...w, face: face ? b64(sha256(utf8(face))).slice(0, 12) : 0 });
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
      const face = this.room.faceOk ? w?.face || null : null;
      const info = { name: p.name, color: p.char.color, skin: p.look?.skin || null, face };
      const sig = `${info.name}|${info.color}|${info.skin}|${face ? face.length + face.slice(-24) : 0}`;
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
    if (name === 'addCash') return false; // rewards are banked on the device, never printed online
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
    const host = new HostRole(this, game, { epoch: c.epoch + 1, order, banned: c.banned });
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
    this.sendRoom('bye', { next, ep: r.epoch, stay: 1 });
    this._rejoin(next);
    return true;
  }

  /**
   * Ask the host to seat us again: after losing a host-vs-host tie, or when the host dropped us
   * (we were away too long). The world is kept when we get the same garden back.
   */
  async onDropped() {
    return this._rejoin(this.isClient ? this.role.hostPid : null);
  }

  async _rejoin(hostPid = null) {
    if (this._rejoining || !this.room) return;
    this._rejoining = true;
    const room = this.room;
    this._saveNow();
    this.role?.dispose();
    this.role = null;
    this._announce();
    this._status('reconnecting', 'Finding the room again…');
    try {
      if (!this.up) await this._openUp(room.code);
      this._joinHost = hostPid;
      this.ch.track(this._presenceState(false));
      if (!hostPid) {
        await this._waitPresence(TIMEOUTS.presence * 1000, () => !!this._pickHost());
        hostPid = this._pickHost()?.pid;
      }
      if (!hostPid || !(await this._keyAsync(hostPid))) throw netErr('lost');
      const welcome = await this._hello(hostPid);
      if (this.room !== room) return;
      room.hostPid = hostPid;
      const name = welcome.st?.players?.find((p) => p?.pid === hostPid)?.name;
      room.hostName = sanitizeName(name, room.hostName);
      room.name = `${room.hostName}'s Garden`;
      if (!this._startClient(welcome, hostPid)) throw netErr('lost');
      this.ch.track(this._presenceState(false));
      this._status('playing', '');
      this._refreshMembers(true);
      this._queueWho(0.5, true);
      bus.emit('net:host', { pid: hostPid, isHost: false });
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
        this.sendRoom('bye', { next: next || null, ep: this.role.epoch });
      } else this.sendUp('bye', {});
    }
    this.role?.dispose();
    this.role = null;
    this._announce();
    this._closeChannels();
    for (const pid of this.who.keys()) forgetFace('r_' + pid);
    if (this.world) for (const p of this.world.players) if (p.kind === 'remote' && p.pid) forgetFace('r_' + p.pid);
    this.who.clear();
    this._whoLater?.clear();
    this._faceSig.clear();
    this.present.clear();
    this._seenPids?.clear();
    this.dead.clear();
    this.keys.clear();
    this.seen.clear();
    this._code = null;
    this._joinHost = null;
    this._qpUntil = 0;
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
    if (this._whoLater?.size) {
      for (const [pid, m] of this._whoLater) {
        if (!this.limitWho.allow(pid, this.clock)) continue;
        this._whoLater.delete(pid);
        this._applyWho(pid, m);
      }
    }
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
    if (this.isHost) {
      this._announce();
      this._quickMerge();
    }
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
  return { code: r.code, host, name: `${host}'s Garden`, n, max: MAX_HUMANS, full: n >= MAX_HUMANS, v, ok: v === version, at: num(r.at), c: num(r.c, num(r.at)) };
}
