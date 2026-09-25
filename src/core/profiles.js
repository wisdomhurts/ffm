// Player profiles on this device. The four family members always exist; friends can add their own.
// Contract: docs/ONLINE.md (Profiles). Everything is stored in localStorage (guarded; the game still runs
// without it) and mirrored to the cloud by src/online when the player links a save code.
import { CHARACTERS, CHARACTER } from '../config.js';
import { load, save, remove } from './save.js';
import { bus } from './events.js';
import { sanitizeName } from './names.js';

const INDEX_KEY = 'profiles';
const key = (id) => 'profile:' + id;
const cache = new Map();
const listeners = new Set();

export const FAMILY_IDS = CHARACTERS.map((c) => c.id);
export const isFamilyId = (id) => FAMILY_IDS.includes(id);

/** Default Look for a family character (the new customization fields start empty). */
export function defaultLook(base, family = true) {
  const c = CHARACTER[base] || CHARACTERS[0];
  return { ...c.look, hat: null, acc: null, face: family ? 'photo' : 'smile', noodle: null, trail: null };
}

function blank(id, base, name, family) {
  return {
    v: 1,
    id,
    base,
    name,
    look: defaultLook(base, family),
    shareFace: false,
    stars: 0,
    unlocks: [],
    pets: { owned: [], equipped: null },
    badges: {},
    quests: { day: '', list: [] },
    counters: {},
    best: { netWorth: 0, showdownWins: 0, showdownBest: 0 },
    online: null,
    cloud: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Fill in anything missing from older or foreign data so callers can rely on the shape.
function normalize(p, id) {
  const family = isFamilyId(id);
  const base = family ? id : CHARACTER[p?.base] ? p.base : CHARACTERS[0].id;
  const out = blank(id, base, family ? CHARACTER[id].name : sanitizeName(p?.name, 'Player'), family);
  if (!p || typeof p !== 'object') return out;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  if (!family && p.name) out.name = sanitizeName(p.name, out.name);
  if (obj(p.look)) out.look = { ...out.look, ...p.look };
  out.shareFace = !!p.shareFace;
  out.stars = Number.isFinite(p.stars) && p.stars > 0 ? Math.floor(p.stars) : 0;
  if (Array.isArray(p.unlocks)) out.unlocks = p.unlocks.filter((u) => typeof u === 'string');
  if (obj(p.pets)) {
    out.pets.owned = Array.isArray(p.pets.owned) ? p.pets.owned.filter((x) => x && typeof x.id === 'string') : [];
    out.pets.equipped = out.pets.owned.some((x) => x.uid === p.pets.equipped) ? p.pets.equipped : null;
  }
  if (obj(p.badges)) out.badges = { ...p.badges };
  if (obj(p.quests) && Array.isArray(p.quests.list)) out.quests = { day: String(p.quests.day || ''), list: p.quests.list };
  if (obj(p.counters)) for (const [k, v] of Object.entries(p.counters)) if (Number.isFinite(v)) out.counters[k] = v;
  if (obj(p.best)) for (const k of Object.keys(out.best)) if (Number.isFinite(p.best[k])) out.best[k] = p.best[k];
  if (obj(p.online)) out.online = p.online;
  if (obj(p.cloud)) out.cloud = p.cloud;
  if (Number.isFinite(p.createdAt)) out.createdAt = p.createdAt;
  if (Number.isFinite(p.updatedAt)) out.updatedAt = p.updatedAt;
  return out;
}

function readIndex() {
  const idx = load(INDEX_KEY, null);
  const custom = Array.isArray(idx?.custom) ? idx.custom.filter((id) => typeof id === 'string' && /^p_[a-z0-9]{4,16}$/.test(id)) : [];
  const active = typeof idx?.active === 'string' ? idx.active : load('ui:lastChar', null);
  return { custom, active };
}

function writeIndex(idx) {
  save(INDEX_KEY, { custom: idx.custom, active: idx.active });
}

/** All profiles on this device: the family first, then friends (oldest first). */
export function listProfiles() {
  const { custom } = readIndex();
  return [...FAMILY_IDS, ...custom].map(getProfile).filter(Boolean);
}

export function getProfile(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  if (!isFamilyId(id) && !readIndex().custom.includes(id)) return null;
  const p = normalize(load(key(id), null), id);
  cache.set(id, p);
  return p;
}

function persist(p) {
  p.updatedAt = Date.now();
  save(key(p.id), p);
}

function notify(p) {
  for (const fn of listeners) {
    try {
      fn(p);
    } catch (e) {
      console.warn('[profiles] listener failed', e);
    }
  }
  bus.emit('profile:changed', { profile: p });
}

/** Create a friend's profile. base = family character whose look/colour they start from. */
export function createProfile({ name, base = CHARACTERS[0].id } = {}) {
  const idx = readIndex();
  let id;
  do id = 'p_' + Math.random().toString(36).slice(2, 10);
  while (idx.custom.includes(id) || isFamilyId(id));
  const p = blank(id, CHARACTER[base] ? base : CHARACTERS[0].id, sanitizeName(name, 'Player'), false);
  idx.custom.push(id);
  writeIndex(idx);
  cache.set(id, p);
  persist(p);
  notify(p);
  return p;
}

/**
 * Change a profile. `patch` is an object merged at the top level, or a function (p) => void that
 * mutates it in place. Saves and notifies listeners.
 */
export function updateProfile(id, patch) {
  const p = getProfile(id);
  if (!p) return null;
  if (typeof patch === 'function') patch(p);
  else if (patch && typeof patch === 'object') Object.assign(p, patch);
  if (!isFamilyId(p.id)) p.name = sanitizeName(p.name, 'Player');
  else p.name = CHARACTER[p.id].name;
  persist(p);
  notify(p);
  return p;
}

/** Replace a profile's data wholesale (cloud restore). Keeps the id. */
export function replaceProfile(id, data) {
  const p = normalize(data, id);
  cache.set(id, p);
  persist(p);
  notify(p);
  return p;
}

export function deleteProfile(id) {
  if (isFamilyId(id)) return false;
  const idx = readIndex();
  idx.custom = idx.custom.filter((x) => x !== id);
  if (idx.active === id) idx.active = null;
  writeIndex(idx);
  cache.delete(id);
  remove(key(id));
  remove('save:endless:' + id);
  remove('save:showdown:' + id);
  remove('face:' + id);
  bus.emit('profile:deleted', { id });
  return true;
}

export function activeProfileId() {
  const { active } = readIndex();
  return active && getProfile(active) ? active : null;
}

export function setActiveProfile(id) {
  const idx = readIndex();
  idx.active = getProfile(id) ? id : null;
  writeIndex(idx);
  save('ui:lastChar', idx.active);
}

export function onProfileChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Add to a lifetime counter (no save; call updateProfile or rely on the progress module's periodic save). */
export function bump(p, counter, n = 1) {
  p.counters[counter] = (p.counters[counter] || 0) + n;
}

/** Display colour for a profile (its base family member's colour). */
export const profileColor = (p) => (CHARACTER[p?.base] || CHARACTERS[0]).color;
