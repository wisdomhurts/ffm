// Message transports for online rooms. One interface, three backends:
//   'supabase'  Supabase Realtime (broadcast + presence) for real play over the internet
//   'local'     BroadcastChannel: tabs of the same origin talk to each other (browser tests, dev)
//   'memory'    in-process hub (Node tests)
//
// createTransport(kind, opts) -> { kind, channel(topic, {presenceKey, presence}), close() }
// channel -> { subscribe(): Promise, send(event, payload): bool, on(event, fn(payload)),
//              track(state), untrack(), onPresence(fn(members)), onStatus(fn(status)), members(), leave() }
// Broadcasts never echo to the sender (Supabase `self: false`). Presence members are
// [{key, ...trackedState}], one entry per key. Status: 'joined' | 'reconnecting' | 'closed'.
//
// Supabase settings come from src/online/config.js (onlineConfig(): the project URL + publishable key,
// or `window.__SAS_ONLINE__ = {url, key}` for tests/dev). `?net=local` or `window.__SAS_NET__ = 'local'`
// selects the test transport instead.
import { RealtimeClient } from '@supabase/realtime-js';
import { onlineConfig } from '../online/config.js';

const G = typeof globalThis !== 'undefined' ? globalThis : {};

/** Which transport this page should use, or null when online play is unavailable. */
export function pickTransport() {
  let forced = G.__SAS_NET__ || null;
  try {
    const q = new URLSearchParams(G.location?.search || '').get('net');
    if (q) forced = q;
  } catch {
    /* no URL */
  }
  if (forced === 'local' && typeof G.BroadcastChannel === 'function') return { kind: 'local' };
  if (forced === 'memory') return { kind: 'memory' };
  let cfg = null;
  try {
    cfg = onlineConfig();
  } catch {
    cfg = G.__SAS_ONLINE__ || null;
  }
  if (cfg && typeof cfg.url === 'string' && /^https?:\/\//.test(cfg.url) && typeof cfg.key === 'string' && cfg.key && typeof G.WebSocket === 'function') {
    return { kind: 'supabase', url: cfg.url, key: cfg.key };
  }
  return null;
}

export function createTransport(kind, opts = {}) {
  if (kind === 'supabase') return new SupabaseTransport(opts);
  if (kind === 'local') return new LocalTransport(opts);
  if (kind === 'memory') return new MemoryTransport(opts);
  throw new Error('unknown transport ' + kind);
}

// A little shared plumbing for the channel objects.
class BaseChannel {
  constructor(topic, opts) {
    this.topic = topic;
    this.presenceKey = opts.presenceKey || '';
    this.handlers = new Map();
    this.presenceFns = [];
    this.statusFns = [];
    this.tracked = null;
    this.left = false;
    this._members = [];
  }
  on(event, fn) {
    let l = this.handlers.get(event);
    if (!l) this.handlers.set(event, (l = []));
    l.push(fn);
    return this;
  }
  onPresence(fn) {
    this.presenceFns.push(fn);
    return this;
  }
  onStatus(fn) {
    this.statusFns.push(fn);
    return this;
  }
  members() {
    return this._members;
  }
  _emit(event, payload) {
    const l = this.handlers.get(event);
    if (!l || this.left) return;
    for (const fn of l) {
      try {
        fn(payload);
      } catch (e) {
        console.warn('[net] handler for', event, 'failed', e);
      }
    }
  }
  _presence(members) {
    this._members = members;
    if (this.left) return;
    for (const fn of this.presenceFns) {
      try {
        fn(members);
      } catch (e) {
        console.warn('[net] presence handler failed', e);
      }
    }
  }
  _status(s) {
    if (this.left) return;
    for (const fn of this.statusFns) {
      try {
        fn(s);
      } catch (e) {
        console.warn('[net] status handler failed', e);
      }
    }
  }
}

// ------------------------------------------------------------------ Supabase Realtime

class SupabaseTransport {
  constructor({ url, key, rates } = {}) {
    this.kind = 'supabase';
    this.ws = url.replace(/\/+$/, '').replace(/^http/, 'ws') + '/realtime/v1';
    this.key = key;
    this.eps = rates?.eventsPerSecond || 40;
    this.client = this._client();
    this.old = [];
  }
  // Same wiring as supabase-js's createClient (anon access: the publishable key is also the token),
  // without bundling the auth/storage/database clients the game doesn't use here.
  _client() {
    const key = this.key;
    return new RealtimeClient(this.ws, {
      params: { apikey: key, eventsPerSecond: this.eps },
      accessToken: async () => key,
      heartbeatIntervalMs: 15000,
      // back off when the server can't be reached (1, 2, 5, 10, 20, then every 30 s)
      reconnectAfterMs: (tries) => [1000, 2000, 5000, 10000, 20000][tries - 1] ?? 30000,
      logLevel: 'error',
    });
  }
  channel(topic, opts = {}) {
    // realtime-js keeps one channel per topic per socket, and a channel we just left may still be
    // saying goodbye: coming straight back to the same room gets a fresh socket instead
    if (this.client.getChannels().some((c) => c.topic === 'realtime:' + topic)) {
      this.old.push(this.client);
      this.client = this._client();
    }
    this._sweep();
    return new SupabaseChannel(this, this.client, topic, opts);
  }
  // Sockets with no channels left are closed (a closed lobby stops trying to reconnect).
  _sweep() {
    this.old = this.old.filter((c) => {
      if (c.getChannels().length) return true;
      try {
        c.disconnect();
      } catch {
        /* closed */
      }
      return false;
    });
    if (!this.client.getChannels().length) {
      try {
        this.client.disconnect();
      } catch {
        /* closed */
      }
    }
  }
  close() {
    for (const c of [this.client, ...this.old]) {
      try {
        c.removeAllChannels();
        c.disconnect();
      } catch {
        /* already closed */
      }
    }
    this.old = [];
  }
}

class SupabaseChannel extends BaseChannel {
  constructor(t, client, topic, opts) {
    super(topic, opts);
    this.t = t;
    this.client = client;
    this.usePresence = opts.presence !== false;
    this.ch = client.channel(topic, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.presenceKey, enabled: this.usePresence } },
    });
    this.bound = new Set();
    if (this.usePresence) {
      this.ch.on('presence', { event: 'sync' }, () => this._presence(this._readPresence()));
    }
  }
  on(event, fn) {
    super.on(event, fn);
    if (!this.bound.has(event)) {
      this.bound.add(event);
      this.ch.on('broadcast', { event }, (msg) => this._emit(event, msg?.payload));
    }
    return this;
  }
  _readPresence() {
    const st = this.ch.presenceState() || {};
    const out = [];
    for (const [key, metas] of Object.entries(st)) {
      const m = Array.isArray(metas) && metas[metas.length - 1];
      if (!m) continue;
      const { presence_ref, ...rest } = m;
      out.push({ ...rest, key });
    }
    return out;
  }
  subscribe(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let first = true;
      this.ch.subscribe((status, err) => {
        if (this.left) return;
        if (status === 'SUBSCRIBED') {
          // re-announce ourselves after every (re)join: the server forgets presence when the socket drops
          if (this.tracked) this.ch.track(this.tracked).catch(() => {});
          this._status('joined');
          if (first) {
            first = false;
            resolve(this);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (first) {
            first = false;
            reject(err || new Error(status));
          } else this._status('reconnecting');
        } else if (status === 'CLOSED') this._status(first ? 'closed' : 'reconnecting');
      }, timeoutMs);
    });
  }
  send(event, payload) {
    if (this.left || this.ch.state !== 'joined') return false; // never fall back to REST mid-game
    this.ch.send({ type: 'broadcast', event, payload }).catch(() => {});
    return true;
  }
  track(state) {
    this.tracked = state;
    if (this.ch.state === 'joined') this.ch.track(state).catch(() => {});
  }
  untrack() {
    this.tracked = null;
    if (this.ch.state === 'joined') this.ch.untrack().catch(() => {});
  }
  leave() {
    if (this.left) return;
    this.left = true;
    this.client.removeChannel(this.ch).catch(() => {}).finally(() => this.t._sweep());
  }
}

// ------------------------------------------------------------------ BroadcastChannel (same-origin tabs)

const LOCAL_BEAT = 1000;
const LOCAL_EXPIRE = 3500;

class LocalTransport {
  constructor() {
    this.kind = 'local';
    this.id = Math.random().toString(36).slice(2, 10);
  }
  channel(topic, opts = {}) {
    return new LocalChannel(this, topic, opts);
  }
  close() {}
}

class LocalChannel extends BaseChannel {
  constructor(t, topic, opts) {
    super(topic, opts);
    this.t = t;
    this.usePresence = opts.presence !== false;
    this.peers = new Map(); // key -> {state, seen}
    this.bc = null;
    this.timer = null;
  }
  subscribe() {
    if (this.bc) return Promise.resolve(this);
    this.bc = new BroadcastChannel('sas-net:' + this.topic);
    this.bc.onmessage = (e) => this._recv(e.data);
    if (this.usePresence) {
      this._post({ k: 'pq' }); // ask everyone to announce themselves
      this.timer = setInterval(() => this._beat(), LOCAL_BEAT);
      // presence "sync" after the others had a moment to answer
      setTimeout(() => this._sync(), 120);
    }
    setTimeout(() => this._status('joined'), 0);
    return Promise.resolve(this);
  }
  _post(msg) {
    try {
      this.bc?.postMessage(msg);
    } catch {
      /* closed */
    }
  }
  _recv(m) {
    if (this.left || !m || typeof m !== 'object') return;
    if (m.k === 'b') this._emit(m.e, m.p);
    else if (!this.usePresence) return;
    else if (m.k === 'pq') {
      if (this.tracked) this._post({ k: 'ph', key: this.presenceKey, st: this.tracked });
    } else if (m.k === 'ph') {
      const had = this.peers.get(m.key);
      const changed = !had || JSON.stringify(had.state) !== JSON.stringify(m.st);
      this.peers.set(m.key, { state: m.st, seen: Date.now() });
      if (changed) this._sync();
    } else if (m.k === 'pl') {
      if (this.peers.delete(m.key)) this._sync();
    }
  }
  _beat() {
    if (this.tracked) this._post({ k: 'ph', key: this.presenceKey, st: this.tracked });
    const now = Date.now();
    let gone = false;
    for (const [k, v] of this.peers) if (now - v.seen > LOCAL_EXPIRE) {
      this.peers.delete(k);
      gone = true;
    }
    if (gone) this._sync();
  }
  _sync() {
    const out = [];
    for (const [key, v] of this.peers) out.push({ ...v.state, key });
    if (this.tracked) out.push({ ...this.tracked, key: this.presenceKey });
    this._presence(out);
  }
  send(event, payload) {
    if (this.left || !this.bc) return false;
    this._post({ k: 'b', e: event, p: payload });
    return true;
  }
  track(state) {
    this.tracked = state;
    this._post({ k: 'ph', key: this.presenceKey, st: state });
    this._sync();
  }
  untrack() {
    this.tracked = null;
    this._post({ k: 'pl', key: this.presenceKey });
    this._sync();
  }
  leave() {
    if (this.left) return;
    if (this.tracked) this._post({ k: 'pl', key: this.presenceKey });
    this.left = true;
    clearInterval(this.timer);
    try {
      this.bc?.close();
    } catch {
      /* closed */
    }
    this.bc = null;
  }
}

// ------------------------------------------------------------------ in-process hub (Node tests)

/**
 * Shared "server" for memory transports. Messages are JSON-copied and delivered asynchronously: on the
 * next microtask, or (with `latency` > 0) once a test advances the hub's clock past their arrival time.
 */
export class MemoryHub {
  constructor({ latency = 0 } = {}) {
    this.topics = new Map(); // topic -> Set<MemoryChannel>
    this.queue = [];
    this.scheduled = false;
    this.latency = latency;
    this.now = 0;
    this.sent = 0;
    this.delivered = 0;
    this.bytes = 0;
    this.log = null; // optional (event, payload, topic) => void, for tests
  }
  _join(ch) {
    let s = this.topics.get(ch.topic);
    if (!s) this.topics.set(ch.topic, (s = new Set()));
    s.add(ch);
    this._presenceChanged(ch.topic);
  }
  _part(ch) {
    const s = this.topics.get(ch.topic);
    if (!s) return;
    s.delete(ch);
    if (!s.size) this.topics.delete(ch.topic);
    this._presenceChanged(ch.topic);
  }
  _presenceChanged(topic) {
    const s = this.topics.get(topic);
    if (!s) return;
    const members = [];
    for (const c of s) if (c.tracked && !c.t.down) members.push({ ...c.tracked, key: c.presenceKey });
    for (const c of s) if (c.usePresence && !c.t.down) this._post(() => c._presence(members.map((m) => ({ ...m }))));
  }
  _broadcast(from, event, payload) {
    const s = this.topics.get(from.topic);
    if (!s) return;
    const json = JSON.stringify(payload ?? null);
    this.sent++;
    this.bytes += json.length;
    this.log?.(event, payload, from.topic);
    for (const c of s) {
      if (c === from || c.t.down) continue;
      this.delivered++;
      this._post(() => !c.t.down && c._emit(event, JSON.parse(json)));
    }
  }
  _post(fn) {
    this.queue.push({ at: this.now + this.latency, fn });
    if (!this.scheduled && !this.latency) {
      this.scheduled = true;
      queueMicrotask(() => this.flush());
    }
  }
  /** Deliver everything that has arrived by now. */
  flush() {
    this.scheduled = false;
    for (let guard = 0; guard < 100000; guard++) {
      const i = this.queue.findIndex((q) => q.at <= this.now + 1e-9);
      if (i < 0) break;
      this.queue.splice(i, 1)[0].fn();
    }
  }
  /** Move the hub's clock (tests with latency) and deliver what arrived. */
  advance(dt) {
    this.now += dt;
    this.flush();
  }
  /** Simulate a device dropping off the network (its presence vanishes, nothing in or out). */
  setDown(transport, down = true) {
    transport.down = down;
    for (const topic of this.topics.keys()) this._presenceChanged(topic);
  }
}

const DEFAULT_HUB = new MemoryHub();

class MemoryTransport {
  constructor({ hub = DEFAULT_HUB } = {}) {
    this.kind = 'memory';
    this.hub = hub;
    this.down = false;
  }
  channel(topic, opts = {}) {
    return new MemoryChannel(this, topic, opts);
  }
  close() {}
}

class MemoryChannel extends BaseChannel {
  constructor(t, topic, opts) {
    super(topic, opts);
    this.t = t;
    this.usePresence = opts.presence !== false;
    this.joined = false;
  }
  subscribe() {
    if (!this.joined) {
      this.joined = true;
      this.t.hub._join(this);
      this.t.hub._post(() => this._status('joined'));
    }
    return Promise.resolve(this);
  }
  send(event, payload) {
    if (this.left || !this.joined || this.t.down) return false;
    this.t.hub._broadcast(this, event, payload);
    return true;
  }
  track(state) {
    this.tracked = { ...state };
    if (this.joined) this.t.hub._presenceChanged(this.topic);
  }
  untrack() {
    this.tracked = null;
    if (this.joined) this.t.hub._presenceChanged(this.topic);
  }
  leave() {
    if (this.left) return;
    this.left = true;
    if (this.joined) this.t.hub._part(this);
  }
}
