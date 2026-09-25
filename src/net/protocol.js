// Wire protocol for online rooms: constants, room codes, compact motion packing, bus-event encoding and
// the safety filters every received value goes through. Pure JS (no DOM) so Node tests can use it.
//
// Channels (see transport.js):
//   sas:lobby                 presence only: public rooms announce {code, name, host, n, max, v, at}
//   sas:room:<CODE>           broadcast to everyone in the room + presence {pid, name, v, at, h}
//   sas:room:<CODE>:u:<pid>   one member's uplink: its 'in' messages reach only the host (saves fan-out)
//
// Room messages (event name: payload)
//   hello   {v, pid, who, data, pref}          joiner -> host (who = identity, data = its online garden)
//   welcome {to, slot, ep, h, order, priv, name, st}   host -> joiner (st = full world state)
//   reject  {to, reason}                       host -> joiner ('full' | 'version' | 'kicked' | 'closed')
//   who     {pid, name, base, look, pet, face?} anyone -> room (face only in private rooms, opt-in)
//   tick    {h, ep, s, tm, P, M, B, A, E?, D?, K?, O?}  host -> room, ~10 Hz (see packTick)
//   kick    {to, k, p, v, su, iu}              host -> one member: rules moved you (knockback, respawn)
//   kicked  {to}                               host -> one member: removed from the room
//   bye     {pid, next?}                       leaving (a leaving host names its successor)
// Uplink messages
//   in      {c, p, i, ip, sel, e, ka}          client -> host, 2-10 Hz (see ClientRole)
import { CHARACTERS, PLANTS, PLANT, ITEMS, BIOMES, MUTATIONS, EVENTS } from '../config.js';
import { EMOTES, QUICK_CHAT, EMOTE, PHRASE } from '../social/catalog.js';
import { PETS, PET } from '../pets/catalog.js';
import { sanitizeName, isNameAllowed } from '../core/names.js';
import { Player } from '../gameplay/player.js';

export const PROTO = 1;

// Two builds can only share a room when their rules agree (ids of everything that crosses the wire).
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
const RULES = fnv([PLANTS, ITEMS, BIOMES, CHARACTERS, EMOTES, QUICK_CHAT, PETS].map((l) => l.map((x) => x.id).join(',')).join('|'));
export const VERSION = `${PROTO}.${RULES}`;

export const MAX_HUMANS = 4;

/** Tunables. Supabase counts every message sent AND delivered (free plan: 100/s per project), so
 *  the defaults keep a full 4-player room around 80 messages/s; override with window.__SAS_ONLINE__.rates. */
export const RATES = {
  tick: 10, // host -> room ticks per second (motion + events + state deltas)
  inMove: 10, // client -> host inputs per second while moving / holding / acting
  inIdle: 2, // ... while standing still (keeps the host's view of us fresh)
  stateEvery: 5, // every Nth tick also refreshes slowly-changing numbers (cash piles, growth)
  keyEvery: 50, // every Nth tick is a full keyframe (heals anything lost on the way)
  interp: 0.15, // clients draw other players/monsters this far (s) behind the host
};

export const TIMEOUTS = {
  presence: 3.5, // joining: how long to wait for the room's presence list
  welcome: 7, // joining: how long the host has to answer
  hostSilent: 5, // no ticks this long: the host is gone, the next member takes over
  memberGrace: 8, // a member vanished from presence: keep their garden this long in case they reconnect
  memberSilent: 45, // a member sent nothing this long: free their slot
  hiddenHandoff: 4, // hosting from a hidden tab this long: hand the room to someone who's looking
  hiddenLeave: 300, // our tab has been hidden this long: leave the room
};

// ------------------------------------------------------------------ room codes

// No vowels (no accidental words) and nothing that looks alike (I/L/1, O/0).
export const CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXYZ';
export const CODE_LEN = 5;

export function makeCode(rand = Math.random) {
  for (let tries = 0; tries < 50; tries++) {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
    if (isNameAllowed(s)) return s;
  }
  return 'BGDKT';
}

/** Typed text -> a clean code (upper case, only code letters, max 5). */
export function normalizeCode(raw) {
  let s = '';
  for (const ch of String(raw ?? '').toUpperCase()) {
    if (CODE_ALPHABET.includes(ch)) s += ch;
    if (s.length >= CODE_LEN) break;
  }
  return s;
}

export const isCode = (s) => typeof s === 'string' && s.length === CODE_LEN && [...s].every((c) => CODE_ALPHABET.includes(c));

export const roomTopic = (code) => `sas:room:${code}`;
export const upTopic = (code, pid) => `sas:room:${code}:u:${pid}`;
export const LOBBY_TOPIC = 'sas:lobby';

export function makePid() {
  let s = 'x';
  for (let i = 0; i < 9; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)];
  return s;
}
export const isPid = (s) => typeof s === 'string' && /^[a-z0-9]{4,16}$/.test(s);

// ------------------------------------------------------------------ small helpers

export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const int = (v, lo, hi, d = lo) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID_RE = /^[a-zA-Z0-9_:-]{1,32}$/;
export const isId = (s) => typeof s === 'string' && ID_RE.test(s);

/** JSON with numbers rounded to 3 decimals (what the wire carries; also used to detect changes). */
export const stringifyR = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1000) / 1000 : x));

/** Per-sender token bucket: allow(key, now) -> false when that sender is over its budget. */
export class RateLimiter {
  constructor(perSec, burst = perSec * 2) {
    this.rate = perSec;
    this.burst = burst;
    this.m = new Map();
  }
  allow(key, now) {
    let b = this.m.get(key);
    if (!b) this.m.set(key, (b = { t: this.burst, at: now }));
    b.t = Math.min(this.burst, b.t + (now - b.at) * this.rate);
    b.at = now;
    if (b.t < 1) return false;
    b.t -= 1;
    return true;
  }
  forget(key) {
    this.m.delete(key);
  }
}

// ------------------------------------------------------------------ safety filters

const LOOK_KEYS = ['build', 'skin', 'hair', 'hairColor', 'shirt', 'shirtColor', 'shirtColor2', 'pants', 'shoes', 'hat', 'face', 'acc', 'noodle', 'trail'];
const LOOK_VAL = /^#?[a-zA-Z0-9_-]{1,24}$/;

/** A Look from the network: known keys (plus a few short extra ones from newer builds), id-like values only. */
export function sanitizeLook(look) {
  if (!isObj(look)) return null;
  const out = {};
  let extra = 0;
  for (const [k, v] of Object.entries(look)) {
    const known = LOOK_KEYS.includes(k);
    if (!known && (extra >= 8 || !/^[a-zA-Z][a-zA-Z0-9]{0,15}$/.test(k))) continue;
    if (v === null || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && LOOK_VAL.test(v)) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else continue;
    if (!known) extra++;
  }
  return out;
}

/** A shared Photo Booth face: a small inline JPEG/PNG/WebP picture, nothing else. */
export function sanitizeFace(face) {
  if (typeof face !== 'string' || face.length > 90000) return null;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(face) ? face : null;
}

export const sanitizePet = (id) => (typeof id === 'string' && PET[id] ? id : null);
export const sanitizeProfileId = (id) => (typeof id === 'string' && (/^p_[a-z0-9]{4,16}$/.test(id) || CHARACTERS.some((c) => c.id === id)) ? id : null);
export const sanitizeBase = (id) => (CHARACTERS.some((c) => c.id === id) ? id : CHARACTERS[0].id);

/** Identity card ('who' / hello.who). Faces are only kept when `allowFace` (private rooms). */
export function sanitizeWho(w, allowFace) {
  if (!isObj(w) || !isPid(w.pid)) return null;
  const base = sanitizeBase(w.base);
  return {
    pid: w.pid,
    id: sanitizeProfileId(w.id) || base,
    name: sanitizeName(w.name, 'Player'),
    base,
    look: sanitizeLook(w.look),
    pet: sanitizePet(w.pet),
    face: allowFace ? sanitizeFace(w.face) : null,
  };
}

// Bot lines are game content written by the host's code (never typed by people), but a modified host
// could still send anything, so they must look like a short game line with no bad words.
const BAD = ['fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'porn', 'sex', 'sexy', 'boob', 'boobs',
  'tits', 'nigger', 'nigga', 'fag', 'faggot', 'retard', 'rape', 'nazi', 'hitler', 'kkk', 'slut', 'whore', 'bastard', 'asshole', 'ass', 'wank',
  'jizz', 'cum', 'anal', 'kill', 'suicide', 'die', 'stupid', 'idiot', 'hate', 'dumb', 'loser', 'shut'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };
export function isCleanLine(text) {
  if (typeof text !== 'string' || !text.length || text.length > 160) return false;
  if (!/^[\p{L}\p{N}\p{Emoji_Presentation} '’.,!?:;&()\-+%$"#/…]*$/u.test(text)) return false;
  const words = text.toLowerCase().replace(/[0134578@$]/g, (c) => LEET[c] || c).split(/[^a-z]+/);
  return !words.some((w) => w && BAD.includes(w));
}

// ------------------------------------------------------------------ motion packing

const PLAYER_STRIDE = 8; // x, y, z, vx, vy, vz, yaw, onGround
const MONSTER_STRIDE = 7; // x, z, yaw, vx, vz, state, target
const PROJ_STRIDE = 9; // uid, owner, born, x, y, z, vx, vy, vz
export { PLAYER_STRIDE, MONSTER_STRIDE, PROJ_STRIDE };
const MSTATE = ['patrol', 'chase', 'stunned'];

export function packPlayers(game) {
  const out = [];
  for (const p of game.players) {
    out.push(r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.vel.x), r2(p.vel.y), r2(p.vel.z), r3(p.yaw), p.onGround ? 1 : 0);
  }
  return out;
}

export function packMonsters(game) {
  const out = [];
  for (const m of game.monsters) {
    out.push(r2(m.x), r2(m.z), r3(m.yaw), r2(m.vx), r2(m.vz), Math.max(0, MSTATE.indexOf(m.state)), m.target ?? -1);
  }
  return out;
}

export const monsterState = (code) => MSTATE[code] || 'patrol';

export function packProjectiles(game) {
  const out = [];
  for (const b of game.projectiles) out.push(b.uid, b.owner, r3(b.born), r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz));
  return out;
}

// ------------------------------------------------------------------ bus events over the wire

/** Gameplay events the host shares with everyone (HUD, FX and audio on each device react to them). */
export const FORWARD = new Set([
  'seed:grabbed', 'seed:dropped', 'seed:expired', 'ground:expired', 'plant:planted', 'plant:grown', 'plant:sold', 'plant:returned',
  'plant:watered', 'planter:unlocked', 'steal:start', 'steal:cancel', 'steal:grabbed', 'steal:success', 'steal:foiled',
  'cash:collected', 'lock:on', 'lock:off', 'garden:full', 'bonk:swing', 'bonk:miss', 'bonk:blocked', 'player:hit', 'player:jump',
  'monster:aggro', 'monster:caught', 'monster:bonked', 'item:used', 'item:empty', 'item:fail', 'balloon:splash', 'banana:slip',
  'purchase', 'purchase:fail', 'speed:up', 'rebirth', 'pod:respawn', 'event:start', 'event:end', 'chat', 'shop:open', 'emote',
  'gift', 'gift:fail', 'pet:hatched', 'pet:equipped', 'player:look', 'slot:changed', 'practice:steal',
]);
export const forwarded = (name) => FORWARD.has(name) || name.startsWith('trade:');

/** Set while a client replays the host's events on its bus: those must never be forwarded again. */
export const relay = { depth: 0 };

// Free-text fields the game itself puts in events; anything else must be an id, a number or a flag.
const ITEM_FAIL_REASONS = new Set(['Stand next to one of your growing plants.']);

/**
 * Encodes/decodes event payloads: game objects become small references ({$p: slot}, {$pt: [slot, i]}...)
 * that the other side turns back into ITS objects, so FX/HUD/audio handlers work unchanged.
 */
export class EventCodec {
  constructor(game) {
    this.game = game;
    this.refs = new Map();
    game.gardens.forEach((g, s) => {
      this.refs.set(g, { $g: s });
      g.planters.forEach((pl, i) => this.refs.set(pl, { $pt: [s, i] }));
    });
    game.pods.forEach((pod, i) => this.refs.set(pod, { $pod: i }));
    game.monsters.forEach((m, i) => this.refs.set(m, { $m: i }));
  }

  encode(v, depth = 0) {
    if (v == null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? v : r3(v)) : 0;
    if (typeof v !== 'object' || depth > 4) return null;
    if (v instanceof Player) {
      if (this.game.players[v.slot] !== v) this.foreign = true; // not about this game (another world on this page)
      return { $p: v.slot };
    }
    const ref = this.refs.get(v);
    if (ref) return ref;
    if (Array.isArray(v)) return v.slice(0, 16).map((x) => this.encode(x, depth + 1));
    if (typeof v.speciesId === 'string' && 'growTotal' in v) {
      return { $pl: { uid: v.uid, speciesId: v.speciesId, mutation: v.mutation, growTotal: r3(v.growTotal), growLeft: r3(v.growLeft), owner: v.owner } };
    }
    if ((v.kind === 'seed' || v.kind === 'banana') && 'expiresAt' in v) {
      const o = {};
      for (const [k, x] of Object.entries(v)) if (x == null || typeof x !== 'object') o[k] = typeof x === 'number' ? r3(x) : x;
      return { $gi: o };
    }
    if (v.def && typeof v.type === 'string' && 'endsAt' in v) return { $ev: { type: v.type, startedAt: r3(v.startedAt), endsAt: r3(v.endsAt) } };
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'function' || k.startsWith('_')) continue;
      o[k] = this.encode(x, depth + 1);
    }
    return o;
  }

  /** Back to live objects of this device's game. Returns undefined for anything malformed. */
  decode(v, depth = 0) {
    const g = this.game;
    if (v == null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') return v.length <= 48 ? v : undefined;
    if (typeof v !== 'object' || depth > 4) return undefined;
    if (Array.isArray(v)) {
      const out = [];
      for (const x of v.slice(0, 16)) {
        const d = this.decode(x, depth + 1);
        if (d === undefined) return undefined;
        out.push(d);
      }
      return out;
    }
    if ('$p' in v) return g.players[v.$p] || undefined;
    if ('$g' in v) return g.gardens[v.$g] || undefined;
    if ('$pt' in v) return (Array.isArray(v.$pt) && g.gardens[v.$pt[0]]?.planters[v.$pt[1]]) || undefined;
    if ('$pod' in v) return g.pods[v.$pod] || undefined;
    if ('$m' in v) return g.monsters[v.$m] || undefined;
    if ('$pl' in v) return this._plant(v.$pl);
    if ('$gi' in v) {
      const d = v.$gi;
      if (!isObj(d)) return undefined;
      const live = g.ground.find((x) => x.uid === d.uid);
      if (live) return live;
      if (d.kind === 'seed' && !PLANT[d.speciesId]) return undefined;
      const o = {};
      for (const [k, x] of Object.entries(d)) if (typeof x === 'number' ? Number.isFinite(x) : typeof x === 'string' ? isId(x) : x == null || typeof x === 'boolean') o[k] = x;
      return o;
    }
    if ('$ev' in v) {
      const d = v.$ev;
      const def = isObj(d) && EVENTS.types.find((e) => e.id === d.type);
      if (!def) return undefined;
      if (g.event?.type === def.id) return g.event;
      return { type: def.id, def, startedAt: num(d.startedAt), endsAt: num(d.endsAt) };
    }
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (!/^[a-zA-Z0-9_]{1,24}$/.test(k)) return undefined;
      const d = this.decode(x, depth + 1);
      if (d === undefined) return undefined;
      o[k] = d;
    }
    return o;
  }

  _plant(d) {
    if (!isObj(d) || !PLANT[d.speciesId]) return undefined;
    const g = this.game;
    for (const gd of g.gardens) for (const pl of gd.planters) if (pl.plant && pl.plant.uid === d.uid) return pl.plant;
    for (const p of g.players) if (p.carrying?.kind === 'plant' && p.carrying.plant.uid === d.uid) return p.carrying.plant;
    return {
      uid: num(d.uid), speciesId: d.speciesId, mutation: MUTATIONS[d.mutation] ? d.mutation : 'normal',
      growTotal: num(d.growTotal, 1), growLeft: num(d.growLeft), owner: int(d.owner, 0, 3, 0),
    };
  }

  /**
   * Last line of defence for what an event may say. Free text only where the game itself writes it
   * (quick-chat phrases are looked up locally, bot lines must look like clean game lines).
   */
  static vet(name, e) {
    if (!isObj(e)) return null;
    for (const [k, v] of Object.entries(e)) {
      if (typeof v !== 'string' || v === '') continue;
      if (name === 'chat' && k === 'text') continue;
      if (name === 'item:fail' && k === 'reason') {
        if (!ITEM_FAIL_REASONS.has(v)) e.reason = "Can't use that right now.";
        continue;
      }
      if (!isId(v)) return null;
    }
    if (name === 'chat') {
      const p = e.player;
      if (!(p instanceof Player)) return null;
      if (e.quick) {
        const ph = PHRASE[e.phrase];
        if (!ph) return null;
        e.text = ph.text;
      } else if (p.kind !== 'bot' || !isCleanLine(e.text)) return null;
    }
    if (name === 'emote' && !EMOTE[e.id]) return null;
    return e;
  }
}

// ------------------------------------------------------------------ state sections (host deltas)

// The world state is split into sections; the host sends a section again when it changed.
// Continuous numbers (cash piles, growth timers, hold progress, positions) don't count as a change
// on their own: clients advance them locally and every few ticks get the exact values.
export function sectionize(full) {
  const S = {};
  S.m = { over: full.over, mode: full.mode, difficulty: full.difficulty, uid: full.uid, nextEventAt: full.nextEventAt, event: full.event, match: full.match };
  full.players.forEach((p, i) => (S['p' + i] = p));
  full.gardens.forEach((g, i) => (S['g' + i] = g));
  S.pd = full.pods;
  S.gr = full.ground;
  S.mo = full.monsters;
  return S;
}

/** The part of a section whose change must reach clients right away. */
export function signature(key, v) {
  if (key[0] === 'p' && key !== 'pd') {
    const { pos, vel, yaw, onGround, interact, ...rest } = v;
    return stringifyR([rest, interact.key, interact.verb, interact.label]);
  }
  if (key[0] === 'g' && key !== 'gr') {
    return stringifyR([v.lockedUntil, v.lockReadyAt, v.lockActive, v.planters.map((pl) => [pl.unlocked, pl.stealer, pl.plant && [pl.plant.uid, pl.plant.speciesId, pl.plant.mutation, pl.plant.owner, pl.plant.growLeft <= 0]])]);
  }
  if (key === 'mo') return stringifyR(v.map((m) => [m.stunUntil, m.attackAt]));
  if (key === 'm') return stringifyR([v.over, v.mode, v.difficulty, v.nextEventAt, v.event, v.match]); // uid: only for promotion
  return stringifyR(v);
}

/** Merge a received delta into the client's copy of the full state. */
export function mergeSections(full, D) {
  for (const [k, v] of Object.entries(D)) {
    if (k === 'm') Object.assign(full, v);
    else if (k === 'pd') full.pods = v;
    else if (k === 'gr') full.ground = v;
    else if (k === 'mo') {
      if (Array.isArray(v)) v.forEach((m, i) => full.monsters[i] && Object.assign(full.monsters[i], m));
    } else if (k[0] === 'p') {
      const i = +k.slice(1);
      if (i >= 0 && i < full.players.length) full.players[i] = v;
    } else if (k[0] === 'g') {
      const i = +k.slice(1);
      if (i >= 0 && i < full.gardens.length) full.gardens[i] = v;
    }
  }
}

/** Check a full state from the network has the right shape (applyFull trusts it) and clean its text. */
export function vetFull(s) {
  if (!isObj(s) || s.v !== 1 || !Array.isArray(s.players) || s.players.length !== CHARACTERS.length) return null;
  if (!Array.isArray(s.gardens) || !Array.isArray(s.pods) || !Array.isArray(s.ground) || !Array.isArray(s.projectiles) || !Array.isArray(s.monsters)) return null;
  for (let i = 0; i < s.players.length; i++) if (!vetPlayer(s.players[i], i)) return null;
  for (const g of s.gardens) if (!isObj(g) || !Array.isArray(g.planters)) return null;
  if (!Number.isFinite(s.time)) return null;
  return s;
}

export function vetPlayer(d, i) {
  if (!isObj(d) || !isObj(d.pos) || !isObj(d.vel) || !isObj(d.items) || !isObj(d.stats) || !isObj(d.interact)) return false;
  d.name = sanitizeName(d.name, CHARACTERS[i].name);
  d.pid = isPid(d.pid) ? d.pid : null;
  d.profileId = sanitizeProfileId(d.profileId) || CHARACTERS[i].id;
  d.look = { ...CHARACTERS[i].look, ...(sanitizeLook(d.look) || {}) };
  d.pet = sanitizePet(d.pet);
  if (d.emote && (!isObj(d.emote) || !EMOTE[d.emote.id])) d.emote = null;
  const it = d.interact;
  for (const k of ['label', 'verb', 'key', 'rarity']) if (it[k] != null && (typeof it[k] !== 'string' || it[k].length > 64)) it[k] = '';
  return true;
}
