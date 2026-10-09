// Wire protocol for online rooms: constants, room codes, compact motion packing, bus-event encoding and
// the safety filters every received value goes through. Pure JS (no DOM) so Node tests can use it.
//
// Channels (see transport.js):
//   sas:lobby                 presence only: public rooms announce {code, host, n, max, v, at, c}
//   sas:room:<CODE>           everyone in the room + presence {pid, dk, name, v, at, h, hp}
//   sas:room:<CODE>:u:<pid>   one member <-> the host only (inputs up; welcome/kick/kicked down)
//
// Every message is SEALED (crypto.js): {f: sender pid, d: '[counter, payload]', m: MAC or {pid: MAC}}.
// A pid is the hash of its device's public key (dk); MACs use pair keys only the two ends can make.
// Receivers drop anything that doesn't verify, isn't meant for them, or replays an old counter.
//
// Room channel (event: payload)
//   hello   {to, v, hn, who, data}              joiner -> the host it picked (who = identity card, data = its garden)
//   reject  {to, hn, reason}                    host -> joiner ('full' | 'version' | 'kicked')
//   who     {name, base, id, look, pet, pets, petNames, baseStyle, face?}  anyone -> everyone (face only in private rooms, opt-in)
//   tick    {ep, s, tm, P, M, B, A, E?, D?, K?, O?, bn?}   host -> everyone, 5x a second (+ right after events)
//   bye     {next?, ep?}                        host leaving / handing over (names its successor)
// Uplink (member <-> host)
//   in      {c, p, i, ip, sel, e, ka}           member -> host: own motion p = [x, y, z, vx, vy, vz, yaw, onGround,
//                                               targetVx, targetVz] when the shared guess (predict) drifts, held E, actions
//   bye     {}                                  member -> host: leaving
//   welcome {to, hn, slot, ep, order, priv, st} host -> joiner (st = full world state)
//   kick    {to, k, p, v, su, iu}               host -> member: the rules moved you (knockback, caught, respawn)
//   kicked  {to}                                host -> member: removed from the room
import { CHARACTERS, CHARACTER, PLANTS, PLANT, ITEMS, BIOMES, MUTATIONS, EVENTS, CHAT, PLAYER, WORLD, accelFor, BASE, BOOST, TREADMILL, PET_TRICKS, RARITY, SIZES } from '../config.js';
import { EMOTES, QUICK_CHAT, EMOTE, PHRASE } from '../social/catalog.js';
import { REPLIES, EMOTE_LINES, TYPED_REPLIES } from '../social/replies.js';
import { isTypedLine } from '../social/chat.js';
import { PRACTICE_LINES } from '../ai/personalities.js';
import { PETS, PET, EGG } from '../pets/catalog.js';
import { sanitizePetName } from '../pets/names.js';
import { sanitizeBaseStyle } from '../gameplay/basestyle.js';
import { sanitizeLook as canonLook } from '../characters/cosmetics.js';
import { sanitizeName, isNameAllowed } from '../core/names.js';
import { Player } from '../gameplay/player.js';
import { BOSS_STATES, BOSS_NEVER } from '../gameplay/boss.js';
import { ROAD_END_Z } from '../config.js';

/** Own keys only: catalog lookups must never match 'toString', '__proto__' and friends. */
export const own = (obj, k) => typeof k === 'string' && !!obj && Object.prototype.hasOwnProperty.call(obj, k);

export const PROTO = 4; // 2: garden lots (25 planters), 'empty' slots and a room's maxBots; 3: base levels + styles, pet teams, boost, treadmills, egg drops;
// 4: sell button, pet tricks, pet/seed trades, text chat, plant sizes, hero tips, Big Chomp, 3 new zones

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

/**
 * Every network rate in one place. Supabase counts each message sent AND each one delivered, so these
 * keep a full, busy 4-player room around 35 messages/s (Pro plan: 500/s per project). Override any of
 * them with window.__SAS_ONLINE__.rates = {...}.
 */
export const RATES = {
  tick: 5, // host -> room ticks per second for motion (monsters, players, balloons)
  tickFast: 12, // ...but something that happened (grab, steal, hit, purchase) goes out right away, up to this rate
  stateEvery: 3, // every Nth tick also refreshes slowly-changing numbers (cash piles, growth)
  keyEvery: 25, // every Nth tick is a full keyframe (heals anything lost on the way, ~5 s)
  interp: 0.26, // clients draw other players this far (s) behind the host (monsters are extrapolated)
  // member -> host: position updates only when the host's guess (last position + velocity) drifts
  inMax: 4, // on average at most this many a second while moving/turning...
  inBurst: 3, // ...with a few extra right away when starting, stopping or turning
  inHeartbeat: 1, // at least one a second (standing still)
  drPos: 0.6, // studs: drift that triggers an update
  drYaw: 0.6, // radians of turning that triggers an update
  eventsPerSecond: 40, // Supabase client-side cap
};

export const TIMEOUTS = {
  presence: 3.5, // joining: how long to wait for the room's presence list
  welcome: 7, // joining: how long the host has to answer
  hostSilent: 5, // no ticks this long: the host is gone, the next member takes over
  memberGrace: 8, // a member vanished from presence: keep their garden this long in case they reconnect
  memberSilent: 45, // a member sent nothing this long: free their slot
  hiddenHandoff: 4, // hosting from a hidden tab this long: hand the room to someone who's looking
  hiddenLeave: 300, // our tab has been hidden this long: leave the room
  settle: 12, // after a host change: don't save a garden that suddenly shrank for this long
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

/** pids are 'k' + 15 hex digits of the hash of the device's public key (see crypto.js). */
export const isPid = (s) => typeof s === 'string' && /^k[0-9a-f]{15}$/.test(s);

// ------------------------------------------------------------------ small helpers

export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const int = (v, lo, hi, d = lo) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
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

/** A Look from the network, in the canonical shape and key order the Wardrobe uses (cosmetics.js). */
export function sanitizeLook(look, base = CHARACTERS[0].id) {
  if (!isObj(look)) return null;
  return canonLook(look, own(CHARACTER, base) ? base : CHARACTERS[0].id);
}

/** A shared Photo Booth face: a small inline JPEG/PNG/WebP picture, nothing else. */
export function sanitizeFace(face) {
  if (typeof face !== 'string' || face.length > 90000) return null;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(face) ? face : null;
}

export const sanitizePet = (id) => (own(PET, id) ? id : null);
/** An equipped pet team: up to 3 known species ids. */
export const sanitizePets = (list) => (Array.isArray(list) ? list.slice(0, 3).filter((id) => own(PET, id)) : []);
/** A team with its nicknames: {pets: [id...], petNames: [name...]}, kept in step (names pass the name filter). */
export function sanitizePetTeam(ids, names) {
  const nm = Array.isArray(names) ? names : [];
  const team = (Array.isArray(ids) ? ids : []).slice(0, 3).map((id, i) => ({ id, name: nm[i] })).filter((x) => own(PET, x.id));
  return { pets: team.map((x) => x.id), petNames: team.map((x) => sanitizePetName(x.name)) };
}
export const sanitizeProfileId = (id) => (typeof id === 'string' && (/^p_[a-z0-9]{4,16}$/.test(id) || own(CHARACTER, id)) ? id : null);
export const sanitizeBase = (id) => (own(CHARACTER, id) ? id : CHARACTERS[0].id);

/** Identity card ('who' / hello.who) for `pid`. Faces are only kept when `allowFace` (private rooms). */
export function sanitizeWho(w, pid, allowFace) {
  if (!isObj(w) || !isPid(pid)) return null;
  const base = sanitizeBase(w.base);
  return {
    pid,
    id: sanitizeProfileId(w.id) || base,
    name: sanitizeName(w.name, 'Player'),
    base,
    look: sanitizeLook(w.look, base),
    pet: sanitizePet(w.pet),
    ...sanitizePetTeam(Array.isArray(w.pets) ? w.pets : w.pet ? [w.pet] : [], w.petNames),
    baseStyle: sanitizeBaseStyle(w.baseStyle),
    face: allowFace ? sanitizeFace(w.face) : null,
  };
}

// Bot lines are game content written by the host's code (never typed by people). They must be one of
// the game's own lines (config CHAT, bot replies, practice coaching) with names/plants filled in, or
// at least look like a short clean game line.
const BAD = ['fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'porn', 'sex', 'sexy', 'boob', 'boobs',
  'tits', 'nigger', 'nigga', 'fag', 'faggot', 'retard', 'rape', 'nazi', 'hitler', 'kkk', 'slut', 'whore', 'bastard', 'asshole', 'ass', 'wank',
  'jizz', 'cum', 'anal', 'kill', 'suicide', 'die', 'stupid', 'idiot', 'hate', 'dumb', 'loser', 'shut'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };
const LINE_CHARS = /^[\p{L}\p{N}\p{Emoji_Presentation} _'’.,!?:;&()\-+%$"#/…]*$/u;
export function isCleanLine(text) {
  if (typeof text !== 'string' || !text.length || text.length > 160) return false;
  if (!LINE_CHARS.test(text)) return false;
  const words = text.toLowerCase().replace(/[0134578@$]/g, (c) => LEET[c] || c).split(/[^a-z]+/);
  return !words.some((w) => w && BAD.includes(w));
}

let TEMPLATES = null;
function templates() {
  if (TEMPLATES) return TEMPLATES;
  const lines = new Set();
  const walk = (v) => {
    if (typeof v === 'string') lines.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(CHAT);
  walk(REPLIES);
  walk(EMOTE_LINES);
  walk(TYPED_REPLIES);
  walk(PRACTICE_LINES);
  // {name}, {plant}, {a_plant}... = a player name (sanitizeName charset) or a plant name
  const slot = "[\\p{L}\\p{N} _.'’-]{1,40}";
  TEMPLATES = [...lines].filter((l) => l.length > 1).map((l) => {
    const re = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-z_]+\\\}/g, slot);
    return new RegExp('^' + re + '$', 'u');
  });
  return TEMPLATES;
}

/** A line a bot may say: one of the game's own lines (names and plants filled in) or a clean short line. */
export function isBotLine(text) {
  if (typeof text !== 'string' || !text.length || text.length > 160) return false;
  if (!LINE_CHARS.test(text)) return false;
  for (const re of templates()) if (re.test(text)) return true;
  return isCleanLine(text);
}

/** A plant from the network, or null (unknown species/mutation, bad numbers). */
export function vetPlantData(d, owner = null) {
  if (!isObj(d) || !own(PLANT, d.speciesId)) return null;
  const sp = PLANT[d.speciesId];
  const growTotal = num(d.growTotal, sp.grow) > 0 ? Math.min(num(d.growTotal, sp.grow), 1e6) : sp.grow;
  const out = { speciesId: d.speciesId, mutation: own(MUTATIONS, d.mutation) ? d.mutation : 'normal', growTotal, growLeft: Math.max(0, Math.min(growTotal, num(d.growLeft))),
    size: own(SIZES, d.size) ? d.size : 'normal' };
  if ('uid' in d) out.uid = num(d.uid);
  if (owner != null) out.owner = int(d.owner, 0, CHARACTERS.length - 1, owner);
  return out;
}

/** A joiner's own online garden ({player, garden} from serializeSlot) before the host loads it. */
export function vetSlotData(data) {
  if (!isObj(data)) return null;
  const cap = (v, hi, d = 0) => Math.max(0, Math.min(hi, Math.floor(num(v, d))));
  const out = { v: 1 };
  const p = isObj(data.player) ? data.player : {};
  const items = {};
  for (const it of ITEMS) items[it.id] = cap(isObj(p.items) ? p.items[it.id] : 0, 999);
  const stats = {};
  if (isObj(p.stats)) for (const k of ['steals', 'robbed', 'planted', 'bonks', 'collected', 'seeds', 'eggs', 'rescues']) stats[k] = cap(p.stats[k], 1e12);
  out.player = {
    cash: cap(p.cash, 1e18, PLAYER.startCash), speedLevel: cap(p.speedLevel, 999), rebirths: cap(p.rebirths, 50),
    upgradeSpend: cap(p.upgradeSpend, 1e18), items, stats,
    baseLevel: Math.max(1, cap(p.baseLevel, BASE.maxLevel, 1)), boostLevel: cap(p.boostLevel, BOOST.maxLevel), treadmillTier: cap(p.treadmillTier, TREADMILL.tiers.length - 1),
  };
  const g = isObj(data.garden) ? data.garden : {};
  const planters = Array.isArray(g.planters) ? g.planters.slice(0, WORLD.planterCount) : [];
  out.garden = {
    cashPile: cap(g.cashPile, 1e18),
    planters: planters.map((pl) => (isObj(pl) ? { unlocked: !!pl.unlocked, plant: vetPlantData(pl.plant) } : { unlocked: false, plant: null })),
  };
  return out;
}

// ------------------------------------------------------------------ motion packing

const PLAYER_STRIDE = 8; // x, y, z, vx, vy, vz, yaw, onGround
const MONSTER_STRIDE = 7; // x, z, yaw, vx, vz, state, target
const PROJ_STRIDE = 9; // uid, owner, born, x, y, z, vx, vy, vz
export { PLAYER_STRIDE, MONSTER_STRIDE, PROJ_STRIDE };
const MSTATE = ['patrol', 'chase', 'stunned'];

/**
 * Where a player reported at `b` should be `age` seconds later if they keep pressing the same way:
 * their velocity {vx, vz} eases towards the target velocity {tx, tz} with the game's acceleration
 * (PLAYER.accel on the ground, airAccel in the air), height follows gravity while airborne. The host
 * draws remote players with this, and each device uses the same guess to decide when to report.
 */
export function predict(b, age, out) {
  // the game's grip grows with the player's top speed (accelFor): the faster of target and current speed stands in for it
  const a = accelFor(Math.max(Math.hypot(b.tx, b.tz), Math.hypot(b.vx, b.vz)), b.og);
  const dvx = b.tx - b.vx, dvz = b.tz - b.vz;
  const dv = Math.hypot(dvx, dvz);
  const T = dv > 1e-6 ? dv / a : 0; // time to reach the target velocity
  if (age <= T) {
    const k = (0.5 * a * age * age) / (dv || 1);
    out.x = b.x + b.vx * age + dvx * k;
    out.z = b.z + b.vz * age + dvz * k;
  } else {
    const k = (0.5 * a * T * T) / (dv || 1);
    out.x = b.x + b.vx * T + dvx * k + b.tx * (age - T);
    out.z = b.z + b.vz * T + dvz * k + b.tz * (age - T);
  }
  out.y = b.og ? b.y : Math.max(0, b.y + b.vy * age - 0.5 * WORLD.gravity * age * age);
  return out;
}

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
  'plant:watered', 'planter:unlocked', 'garden:expanded', 'steal:start', 'steal:cancel', 'steal:grabbed', 'steal:success', 'steal:foiled',
  'cash:collected', 'lock:on', 'lock:off', 'garden:full', 'bonk:swing', 'bonk:miss', 'bonk:blocked', 'player:hit', 'player:jump',
  'monster:aggro', 'monster:caught', 'monster:bonked', 'item:used', 'item:empty', 'item:fail', 'balloon:splash', 'banana:slip',
  'purchase', 'purchase:fail', 'speed:up', 'rebirth', 'pod:respawn', 'event:start', 'event:end', 'chat', 'shop:open', 'emote',
  'gift', 'gift:fail', 'pet:hatched', 'pet:equipped', 'player:look', 'slot:changed', 'practice:steal',
  'base:upgraded', 'base:style', 'base:bounce', 'guard:bonk', 'boost:start', 'boost:up', 'treadmill:up', 'pump:start',
  'drop:spawn', 'drop:claimed', 'drop:expired',
  // round 4
  'pet:trick', 'plant:giant', 'steal:rescued', 'boss:spawn', 'boss:hit', 'boss:defeated', 'boss:leave',
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
      return { $pl: { uid: v.uid, speciesId: v.speciesId, mutation: v.mutation, growTotal: r3(v.growTotal), growLeft: r3(v.growLeft), owner: v.owner, size: v.size } };
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
  decode(v, depth = 0, key = '') {
    const g = this.game;
    if (v == null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') return v.length <= (key === 'text' ? 160 : 48) ? v : undefined;
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
      if (d.kind === 'seed' && !own(PLANT, d.speciesId)) return undefined;
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
      const d = this.decode(x, depth + 1, k);
      if (d === undefined) return undefined;
      o[k] = d;
    }
    return o;
  }

  _plant(d) {
    if (!isObj(d) || !own(PLANT, d.speciesId)) return undefined;
    const g = this.game;
    for (const gd of g.gardens) for (const pl of gd.planters) if (pl.plant && pl.plant.uid === d.uid) return pl.plant;
    for (const p of g.players) if (p.carrying?.kind === 'plant' && p.carrying.plant.uid === d.uid) return p.carrying.plant;
    return {
      uid: num(d.uid), speciesId: d.speciesId, mutation: own(MUTATIONS, d.mutation) ? d.mutation : 'normal',
      growTotal: num(d.growTotal, 1), growLeft: num(d.growLeft), owner: int(d.owner, 0, 3, 0), size: own(SIZES, d.size) ? d.size : 'normal',
    };
  }

  /**
   * Last line of defence for what an event may say. Free text only where the game itself writes it
   * (quick-chat phrases are looked up locally, bot lines must look like clean game lines), and a person's
   * typed chat line ({typed: true}) only when `typed` says this device takes typed chat in this room
   * (social/chat.js typedChatAllowed) and the chat filter leaves the line exactly as it is.
   */
  static vet(name, e, { typed = false } = {}) {
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
        if (!own(PHRASE, e.phrase)) return null;
        e.text = PHRASE[e.phrase].text;
        delete e.typed;
      } else if (e.typed === true) {
        if (!typed || !p.isPlayer || !isTypedLine(e.text)) return null;
      } else if (p.kind !== 'bot' || !isBotLine(e.text)) return null;
      else delete e.typed;
    }
    if (name === 'emote' && !own(EMOTE, e.id)) return null;
    if (name === 'pet:trick' && (int(e.owner, 0, 3, -1) < 0 || int(e.k, 0, 2, -1) < 0 ||
      (!PET_TRICKS.walk.includes(e.trick) && !PET_TRICKS.fly.includes(e.trick)))) return null;
    // Giant Harvests: the size ids travel as plain ids (unknown ones mean the event is not about this build's rules)
    if ((name === 'plant:grown' && e.size != null && !own(SIZES, e.size)) || (name === 'plant:giant' &&
      (!isObj(e.plant) || !own(PLANT, e.plant.speciesId) || !own(MUTATIONS, e.plant.mutation) || !own(SIZES, e.plant.size)))) return null;
    // Help! Family Hero: three players and a tip (a number); nobody can be their own hero
    if (name === 'steal:rescued' && (!(e.hero instanceof Player) || !(e.thief instanceof Player) || !(e.victim instanceof Player) ||
      e.hero === e.thief || e.hero === e.victim || !(num(e.tip, -1) >= 0))) return null;
    return e;
  }
}

// ------------------------------------------------------------------ state sections (host deltas)

// The world state is split into sections; the host sends a section again when it changed.
// Continuous numbers (cash piles, growth timers, hold progress, positions) don't count as a change
// on their own: clients advance them locally and every few ticks get the exact values.
export function sectionize(full) {
  const S = {};
  S.m = { over: full.over, mode: full.mode, difficulty: full.difficulty, uid: full.uid, nextEventAt: full.nextEventAt, event: full.event, match: full.match, maxBots: full.maxBots, nextDropAt: full.nextDropAt };
  full.players.forEach((p, i) => (S['p' + i] = p));
  full.gardens.forEach((g, i) => (S['g' + i] = g));
  S.pd = full.pods;
  S.gr = full.ground;
  S.dr = full.drops || [];
  S.mo = full.monsters;
  S.bs = { next: full.nextBossAt, boss: full.boss ?? null }; // Big Chomp (gameplay/boss.js)
  return S;
}

/** The part of a section whose change must reach clients right away. */
export function signature(key, v) {
  if (key[0] === 'p' && key !== 'pd') {
    const { pos, vel, yaw, onGround, interact, sell, trainT, ...rest } = v;
    return stringifyR([rest, interact.key, interact.verb, interact.label, sell?.key, sell?.label, trainT > 0]);
  }
  if (key[0] === 'g' && key !== 'gr') {
    return stringifyR([v.lockedUntil, v.lockReadyAt, v.lockActive, v.guardReadyAt, v.guardAlert, v.planters.map((pl) => [pl.unlocked, pl.stealer, pl.plant && [pl.plant.uid, pl.plant.speciesId, pl.plant.mutation, pl.plant.owner, pl.plant.growLeft <= 0, pl.plant.size]])]);
  }
  if (key === 'mo') return stringifyR(v.map((m) => [m.stunUntil, m.attackAt]));
  if (key === 'm') return stringifyR([v.over, v.mode, v.difficulty, v.nextEventAt, v.event, v.match, v.maxBots]); // uid: only for promotion
  if (key === 'bs') return stringifyR(v.boss && [v.boss.uid, v.boss.hp, v.boss.state, v.boss.target]); // it crawls: position rides the periodic refresh
  return stringifyR(v);
}

/** Merge a received delta into the client's copy of the full state. */
export function mergeSections(full, D) {
  for (const [k, v] of Object.entries(D)) {
    if (k === 'm') Object.assign(full, v);
    else if (k === 'pd') full.pods = v;
    else if (k === 'gr') full.ground = v;
    else if (k === 'dr') full.drops = v;
    else if (k === 'bs') {
      full.boss = v.boss;
      full.nextBossAt = v.next;
    } else if (k === 'mo') {
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
  if (!Array.isArray(s.gardens) || s.gardens.length !== CHARACTERS.length || !Array.isArray(s.pods) || !Array.isArray(s.ground) ||
    !Array.isArray(s.projectiles) || !Array.isArray(s.monsters)) return null;
  for (let i = 0; i < s.players.length; i++) if (!vetPlayer(s.players[i], i)) return null;
  for (let i = 0; i < s.gardens.length; i++) if (!vetGarden(s.gardens[i], i)) return null;
  s.pods = s.pods.map(vetPod);
  s.ground = vetGround(s.ground);
  s.drops = vetDrops(s.drops);
  if (s.nextDropAt != null && !Number.isFinite(s.nextDropAt)) s.nextDropAt = 0;
  s.boss = vetBoss(s.boss);
  s.nextBossAt = num(s.nextBossAt, BOSS_NEVER);
  if (!Number.isFinite(s.time)) return null;
  return s;
}

export function vetGarden(g, i) {
  if (!isObj(g) || !Array.isArray(g.planters) || g.planters.length !== WORLD.planterCount) return false;
  g.planters = g.planters.map((pl) => (isObj(pl) ? { unlocked: !!pl.unlocked, stealer: int(pl.stealer, 0, 3, null), plant: vetPlantData(pl.plant, i) } : { unlocked: false, stealer: null, plant: null }));
  return true;
}

export const vetPod = (d) => (isObj(d) ? { seed: isObj(d.seed) && own(PLANT, d.seed.speciesId) ? { speciesId: d.seed.speciesId, mutation: own(MUTATIONS, d.seed.mutation) ? d.seed.mutation : 'normal', lucky: !!d.seed.lucky } : null, respawnAt: num(d.respawnAt) } : { seed: null, respawnAt: 0 });

export function vetGround(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).filter((gi) => isObj(gi) && (gi.kind === 'banana' || (gi.kind === 'seed' && own(PLANT, gi.speciesId)))).map((gi) => {
    const o = {};
    for (const [k, v] of Object.entries(gi)) if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' ? isId(v) : v == null || typeof v === 'boolean') o[k] = v;
    if (o.kind === 'seed' && !own(MUTATIONS, o.mutation)) o.mutation = 'normal';
    return o;
  });
}

export function vetDrops(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 32).filter((d) => isObj(d) && own(EGG, d.egg)).map((d) => ({
    uid: num(d.uid), egg: d.egg, x: num(d.x), z: num(d.z), spawnAt: num(d.spawnAt), landAt: num(d.landAt), expiresAt: num(d.expiresAt), biome: int(d.biome, -1, 20, -1),
  }));
}

/** Big Chomp from the network: a known state, numbers clamped to the world, target a garden slot (or null: none). */
export function vetBoss(d) {
  if (!isObj(d) || !BOSS_STATES.includes(d.state)) return null;
  const cl = (v, lo, hi, def = lo) => Math.max(lo, Math.min(hi, num(v, def)));
  const max = cl(d.max, 1, 10000, 1);
  return {
    uid: num(d.uid), x: cl(d.x, -WORLD.homeHalfW, WORLD.homeHalfW), z: cl(d.z, WORLD.homeMinZ, ROAD_END_Z), yaw: num(d.yaw),
    hp: cl(d.hp, 0, max), max, target: int(d.target, 0, CHARACTERS.length - 1, 0), slurped: cl(d.slurped, 0, 1e18),
    hits: CHARACTERS.map((_, i) => cl(Array.isArray(d.hits) ? d.hits[i] : 0, 0, 1e5)), state: d.state, born: num(d.born), until: num(d.until),
  };
}

/** The 'bs' section of a host delta ({next, boss}), or null when it isn't one. */
export const vetBossSection = (v) => (isObj(v) ? { next: num(v.next, BOSS_NEVER), boss: vetBoss(v.boss) } : null);

export function vetPlayer(d, i) {
  if (!isObj(d) || !isObj(d.pos) || !isObj(d.vel) || !isObj(d.items) || !isObj(d.stats) || !isObj(d.interact)) return false;
  d.name = sanitizeName(d.name, CHARACTERS[i].name);
  d.pid = isPid(d.pid) ? d.pid : null;
  d.profileId = sanitizeProfileId(d.profileId) || CHARACTERS[i].id;
  d.look = sanitizeLook(d.look, CHARACTERS[i].id) || { ...CHARACTERS[i].look };
  d.pet = sanitizePet(d.pet);
  Object.assign(d, sanitizePetTeam(d.pets, d.petNames));
  d.baseStyle = sanitizeBaseStyle(d.baseStyle);
  d.baseLevel = int(d.baseLevel, 1, BASE.maxLevel, 1);
  d.boostLevel = int(d.boostLevel, 0, BOOST.maxLevel, 0);
  d.treadmillTier = int(d.treadmillTier, 0, TREADMILL.tiers.length - 1, 0);
  for (const k of ['boostUntil', 'boostReadyAt', 'pumpUntil', 'trainT', 'heroUntil']) d[k] = num(d[k]);
  d.pumpMult = Math.max(1, Math.min(2, num(d.pumpMult, 1)));
  d.crownUntil = Math.max(0, num(d.crownUntil)); // Big Chomp's crown
  if (d.emote && (!isObj(d.emote) || !own(EMOTE, d.emote.id))) d.emote = null;
  const c = d.carrying;
  if (c) {
    if (c.kind === 'plant') {
      const plant = vetPlantData(c.plant, int(c.fromSlot, 0, 3, 0));
      d.carrying = plant ? { kind: 'plant', plant, fromSlot: int(c.fromSlot, 0, 3, 0), fromIndex: int(c.fromIndex, 0, WORLD.planterCount - 1, 0) } : null;
    } else if (c.kind === 'seed' && own(PLANT, c.speciesId)) {
      d.carrying = { kind: 'seed', speciesId: c.speciesId, mutation: own(MUTATIONS, c.mutation) ? c.mutation : 'normal', podId: c.podId === null ? null : int(c.podId, 0, 999, 0), lucky: !!c.lucky };
    } else d.carrying = null;
  }
  const items = {};
  for (const it of ITEMS) items[it.id] = Math.max(0, Math.floor(num(d.items[it.id])));
  d.items = items;
  const it = d.interact;
  for (const k of ['label', 'verb', 'key', 'rarity']) if (it[k] != null && (typeof it[k] !== 'string' || it[k].length > 64)) it[k] = '';
  // the Sell prompt (its own button): same shape as interact, plus what it sells for
  const sl = isObj(d.sell) ? d.sell : {};
  d.sell = { key: null, t: num(sl.t), hold: num(sl.hold), label: '', verb: '', rarity: undefined, value: Math.max(0, num(sl.value)) };
  for (const k of ['label', 'verb', 'key']) if (typeof sl[k] === 'string' && sl[k].length <= 64) d.sell[k] = sl[k];
  if (own(RARITY, sl.rarity)) d.sell.rarity = sl.rarity;
  d.petMail = vetPetMail(d.petMail);
  return true;
}

/** Pet-trade mail for a player's device ([{tid, give: [uid], get: [{id, name}]}], game.js trade): ids that look
 *  like ids, known pets, names through the pet-name filter, a few at most. */
export function vetPetMail(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-8).filter((m) => isObj(m) && isId(m.tid)).map((m) => ({
    tid: m.tid,
    give: Array.isArray(m.give) ? [...new Set(m.give.filter(isId))].slice(0, 3) : [],
    get: Array.isArray(m.get) ? m.get.slice(0, 3).filter((x) => isObj(x) && own(PET, x.id)).map((x) => ({ id: x.id, name: sanitizePetName(x.name) })) : [],
  }));
}
