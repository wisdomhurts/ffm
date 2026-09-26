// Cloud saves + high scores (Supabase RPCs in supabase/migrations). OWNER: backend agent (docs/ONLINE.md).
//
//   onlineReady()                       configured and the browser thinks it's online
//   cloudLink(profile, {listed})        register -> profile.cloud = {id, secret, code, listed}; pushes once
//   cloudPush(profile, {app, force})    upload the profile + its Endless garden (skips when unchanged)
//   cloudPeek(code)                     preview a code {code, name, base, summary, savedAt} (read-only)
//   cloudPull(code)                     move a save to this device {id, secret, code, name, base, save}
//   restorePlan(remote) / restoreCloud(pulled, {into}) / undoRestore()   the safe restore flow
//   submitScore(profile, board, value)  keep the best per board (server-side)
//   topScores(board, {limit, period, me}) -> [{rank, name, value, look, base, updatedAt, me}]
//   familyScores(board, app)            the offline board of the profiles on this device
//
// The secret stays in profile.cloud on this device and is never shown. Sync bookkeeping (what was last
// uploaded/submitted) lives under its own storage key so writing it never fires 'profile:changed'.
import { CHARACTER } from '../config.js';
import { bus } from '../core/events.js';
import { load, save, remove } from '../core/save.js';
import { listProfiles, getProfile, updateProfile, replaceProfile, createProfile, isFamilyId } from '../core/profiles.js';
import { sanitizeName } from '../core/names.js';
import { onlineConfigured } from './config.js';
import { rpc, OnlineError, isOffline } from './rpc.js';
import { normalizeCode } from './codes.js';
import { BOARDS, BOARD, profileScores, profileSummary, hasProgress } from './boards.js';

export { OnlineError, BOARDS, BOARD, profileScores, profileSummary, hasProgress, normalizeCode, onlineConfigured };

// The server allows 200 KB of jsonb text, which is roomier than compact JSON (": " and ", "), so stay
// well under it here. Real saves are ~5-20 KB.
const MAX_SAVE_BYTES = 170 * 1024;

/** Online features can be tried right now (configured + the browser isn't offline). */
export const onlineReady = () => onlineConfigured() && !isOffline();

// ------------------------------------------------------------------ link state

const fresh = (p) => (p?.id ? getProfile(p.id) || p : p);
export const isLinked = (p) => !!(p?.cloud?.id && p.cloud.secret && p.cloud.code);

/** 'off' (no code) | 'linked' | 'moved' (the code was loaded on another device since) */
export function cloudState(profile) {
  const p = fresh(profile);
  if (!isLinked(p)) return 'off';
  return p.cloud.moved ? 'moved' : 'linked';
}

const metaKey = (id) => 'cloud:meta:' + id;

/** Sync bookkeeping for a profile: {pushedAt, pushedHash, sent: {board: value}, sentAt: {board: ms}, listedSync} */
export function cloudMeta(profileId) {
  const m = load(metaKey(profileId), null);
  return m && typeof m === 'object' ? { sent: {}, sentAt: {}, ...m } : { sent: {}, sentAt: {} };
}

export function setCloudMeta(profileId, patch) {
  const m = { ...cloudMeta(profileId), ...patch };
  save(metaKey(profileId), m);
  return m;
}

function status(profileId, extra = {}) {
  bus.emit('cloud:status', { profileId, ...extra });
}

function markMoved(profileId) {
  updateProfile(profileId, (p) => {
    if (p.cloud) p.cloud = { ...p.cloud, moved: true };
  });
  status(profileId, { state: 'moved' });
}

// ------------------------------------------------------------------ payload

// Photos must never leave the device (docs/ONLINE.md). They live under their own storage keys today;
// this also drops any image data URL or oversized string that ever ends up inside a profile.
const scrub = (v) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (typeof x === 'string' && (x.startsWith('data:') || x.length > 4000) ? undefined : x)));

function strippedProfile(p) {
  // eslint-disable-next-line no-unused-vars
  const { cloud, updatedAt, ...rest } = p;
  return scrub(rest);
}

// FNV-1a: cheap change detection so an idle game doesn't re-upload the same save
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ':' + str.length;
}

function contentHash(p) {
  return hash(JSON.stringify({ profile: strippedProfile(p), endless: load('save:endless:' + p.id, null) }));
}

/**
 * What goes to the cloud: the profile (minus its cloud link) and its solo Endless world. Photo Booth
 * faces are stored elsewhere and are never uploaded.
 */
export function cloudPayload(profile, app = null) {
  const p = fresh(profile);
  return {
    v: 1,
    kind: 'steal-a-seed',
    profile: strippedProfile(p),
    endless: scrub(load('save:endless:' + p.id, null)),
    listed: p.cloud?.listed !== false,
    summary: { ...profileSummary(p, app), pid: p.id, family: isFamilyId(p.id) },
    savedAt: Date.now(),
  };
}

// ------------------------------------------------------------------ cloud save

/**
 * Give this profile a save code (registers it with the server) and upload it once.
 * Resolves {code, created}. Already linked -> the existing code.
 */
export async function cloudLink(profile, { listed = true, app = null } = {}) {
  let p = fresh(profile);
  if (!p?.id) throw new OnlineError('invalid', 'No profile.');
  if (isLinked(p) && !p.cloud.moved) return { code: p.cloud.code, created: false };
  const r = await rpc('sas_register', { p_name: p.name, p_base: p.base, p_look: p.look || {} });
  if (!r || typeof r.id !== 'string' || typeof r.secret !== 'string' || !normalizeCode(r.code)) throw new OnlineError('server', 'Unexpected answer.');
  updateProfile(p.id, (x) => {
    x.cloud = { id: r.id, secret: r.secret, code: r.code, listed: !!listed, linkedAt: Date.now() };
  });
  setCloudMeta(p.id, { pushedHash: null, pushedAt: 0, sent: {}, sentAt: {}, listedSync: listed ? undefined : false });
  status(p.id, { state: 'linked' });
  p = getProfile(p.id);
  try {
    await cloudPush(p, { app, force: true });
  } catch {
    /* the sync retries later */
  }
  if (!listed) {
    try {
      await rpc('sas_listed', { p_id: r.id, p_secret: r.secret, p_listed: false });
      setCloudMeta(p.id, { listedSync: undefined });
    } catch {
      /* retried by the sync */
    }
  }
  return { code: r.code, created: true };
}

/**
 * Upload the profile. Resolves {pushed: true, at} or {pushed: false} when nothing changed since the last
 * upload (pass force to send anyway). Rejects with OnlineError; 'bad_secret' also marks the link as moved.
 */
export async function cloudPush(profile, { app = null, force = false, background = false, keepalive = false } = {}) {
  const p = fresh(profile);
  if (!isLinked(p)) throw new OnlineError('not_linked', 'This player has no save code yet.');
  if (p.cloud.moved) throw new OnlineError('moved', 'This save code now lives on another device.');
  const h = contentHash(p);
  const meta = cloudMeta(p.id);
  if (!force && h === meta.pushedHash) return { pushed: false, at: meta.pushedAt || 0 };
  const payload = cloudPayload(p, app);
  const body = JSON.stringify(payload);
  if (body.length > MAX_SAVE_BYTES) throw new OnlineError('too_big', 'This save is too big for the cloud.');
  status(p.id, { state: 'saving' });
  try {
    await rpc('sas_save', { p_id: p.cloud.id, p_secret: p.cloud.secret, p_save: payload, p_name: p.name, p_look: p.look || {} }, { background, keepalive });
  } catch (e) {
    if (e.code === 'bad_secret') markMoved(p.id);
    else status(p.id, { state: 'error', error: e.code });
    throw e;
  }
  const at = Date.now();
  setCloudMeta(p.id, { pushedHash: h, pushedAt: at });
  status(p.id, { state: 'saved', at });
  return { pushed: true, at };
}

function checkCode(code) {
  const c = normalizeCode(code);
  if (!c) throw new OnlineError('bad_code', 'Save codes look like SEED-7K4Q-9XPM.');
  return c;
}

/** Preview a code without changing anything: {code, name, base, look, summary, hasSave, savedAt}. */
export async function cloudPeek(code) {
  const c = checkCode(code);
  const r = await rpc('sas_peek', { p_code: c });
  if (!r || typeof r !== 'object') throw new OnlineError('not_found', 'No save with that code.');
  return {
    code: c,
    name: String(r.name || 'Player'),
    base: CHARACTER[r.base] ? r.base : 'dorian',
    look: r.look && typeof r.look === 'object' ? r.look : {},
    summary: r.summary && typeof r.summary === 'object' ? r.summary : {},
    hasSave: !!r.has_save,
    savedAt: r.saved_at ? Date.parse(r.saved_at) || 0 : 0,
  };
}

/**
 * Move a save to this device. Returns the data ({id, secret, code, name, base, look, save, savedAt});
 * nothing local changes until restoreCloud(). The server issues a new secret, so the device that had
 * this code before stops uploading to it (it will see 'moved').
 */
export async function cloudPull(code) {
  const c = checkCode(code);
  const r = await rpc('sas_load', { p_code: c });
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.secret !== 'string') throw new OnlineError('not_found', 'No save with that code.');
  return {
    id: r.id,
    secret: r.secret,
    code: normalizeCode(r.code) || c,
    name: String(r.name || 'Player'),
    base: CHARACTER[r.base] ? r.base : 'dorian',
    look: r.look && typeof r.look === 'object' ? r.look : {},
    save: r.save && typeof r.save === 'object' ? r.save : null,
    savedAt: r.saved_at ? Date.parse(r.saved_at) || 0 : 0,
  };
}

/**
 * Where a peeked/pulled save would go on this device:
 *   {target: profile|null, why: 'linked'|'family'|null, targetHasProgress, targetOtherCode}
 * target null = it becomes a new player. 'linked' = this device already had that code for the profile;
 * 'family' = it's one of the family's own profiles (Dorian, Esther, Mati, Micah).
 */
export function restorePlan(remote, app = null) {
  const all = listProfiles();
  let target = all.find((p) => p.cloud?.code && p.cloud.code === remote.code) || null;
  let why = target ? 'linked' : null;
  const pid = remote.summary?.pid || remote.save?.profile?.id;
  if (!target && isFamilyId(pid)) {
    target = getProfile(pid);
    why = 'family';
  }
  return {
    target,
    why,
    targetHasProgress: !!target && hasProgress(target, app),
    targetOtherCode: target && target.cloud?.code && target.cloud.code !== remote.code ? target.cloud.code : null,
    targetSummary: target ? profileSummary(target, app) : null,
  };
}

const BACKUP_KEY = 'cloud:backup';

/**
 * Write a pulled save onto this device. into = a profile id to REPLACE (its current data is backed up
 * first, see undoRestore) or null to add it as a NEW player. Returns {profile, replaced, created}.
 */
export function restoreCloud(pulled, { into = null } = {}) {
  const data = pulled?.save && typeof pulled.save === 'object' ? pulled.save : {};
  const src = data.profile && typeof data.profile === 'object' ? data.profile : { name: pulled?.name, base: pulled?.base, look: pulled?.look };
  let id = into;
  let replaced = false;
  if (id) {
    const cur = getProfile(id);
    if (!cur) throw new OnlineError('invalid', 'That player is not on this device.');
    save(BACKUP_KEY, { at: Date.now(), id, name: cur.name, profile: JSON.parse(JSON.stringify(cur)), endless: load('save:endless:' + id, null) });
    replaced = true;
  } else {
    const base = CHARACTER[src.base] ? src.base : pulled.base;
    // a family member's save added next to this device's own family member gets a "2"
    const taken = new Set(listProfiles().map((p) => p.name.toLowerCase()));
    let name = sanitizeName(src.name || pulled.name, 'Player');
    for (let n = 2; taken.has(name.toLowerCase()) && n < 50; n++) name = sanitizeName(`${(src.name || pulled.name || 'Player').slice(0, 11)} ${n}`, `Player ${n}`);
    id = createProfile({ name, base }).id;
    src.name = name;
  }
  // only one profile on a device may own a cloud identity
  for (const p of listProfiles()) {
    if (p.id !== id && (p.cloud?.id === pulled.id || p.cloud?.code === pulled.code)) updateProfile(p.id, { cloud: null });
  }
  const look = src.look && typeof src.look === 'object' ? { ...src.look } : undefined;
  if (look && look.face === 'photo' && !isFamilyId(id)) look.face = 'smile'; // photos belong to the family profiles only
  const restored = { ...src, id, look, cloud: { id: pulled.id, secret: pulled.secret, code: pulled.code, listed: data.listed !== false, linkedAt: Date.now() } };
  const p = replaceProfile(id, restored);
  if (data.endless && typeof data.endless === 'object') save('save:endless:' + id, data.endless);
  else remove('save:endless:' + id);
  // what this device now holds is exactly what the cloud has
  setCloudMeta(id, { pushedHash: contentHash(p), pushedAt: Date.now(), sent: {}, sentAt: {}, listedSync: undefined });
  status(id, { state: 'linked' });
  return { profile: getProfile(id), replaced, created: !into };
}

/** The last profile a restore replaced ({id, name, at}) or null. */
export function restoreBackup() {
  const b = load(BACKUP_KEY, null);
  return b && b.id && b.profile ? { id: b.id, name: b.name, at: b.at } : null;
}

/** Put back the profile the last restore replaced. Returns the profile or null. */
export function undoRestore() {
  const b = load(BACKUP_KEY, null);
  if (!b?.id || !b.profile) return null;
  const p = replaceProfile(b.id, b.profile);
  if (b.endless) save('save:endless:' + b.id, b.endless);
  else remove('save:endless:' + b.id);
  setCloudMeta(b.id, { pushedHash: null });
  remove(BACKUP_KEY);
  return p;
}

/** Stop syncing on this device (the code keeps working elsewhere). */
export function cloudUnlink(profile) {
  const p = fresh(profile);
  if (!p?.id) return;
  updateProfile(p.id, { cloud: null });
  remove(metaKey(p.id));
  status(p.id, { state: 'off' });
}

/** Delete the cloud save, its code and scores for good, then unlink. */
export async function cloudDelete(profile) {
  const p = fresh(profile);
  if (isLinked(p) && !p.cloud.moved) await rpc('sas_delete', { p_id: p.cloud.id, p_secret: p.cloud.secret });
  cloudUnlink(p);
}

/**
 * "Keep this device's progress" after the code moved elsewhere: takes the code back (new secret) and
 * uploads this device's save over the cloud one.
 */
export async function cloudReclaim(profile, { app = null } = {}) {
  const p = fresh(profile);
  if (!isLinked(p)) throw new OnlineError('not_linked', 'No save code.');
  const r = await rpc('sas_load', { p_code: p.cloud.code });
  if (!r || typeof r.secret !== 'string') throw new OnlineError('not_found', 'That save code was deleted.');
  updateProfile(p.id, (x) => {
    x.cloud = { ...x.cloud, id: r.id, secret: r.secret, moved: false };
  });
  setCloudMeta(p.id, { pushedHash: null, sent: {}, sentAt: {} });
  return cloudPush(getProfile(p.id), { app, force: true });
}

/** Show or hide this player on the global boards. Saved locally at once; the server follows (now or later). */
export async function setListed(profile, listed) {
  const p = fresh(profile);
  if (!p?.cloud) return false;
  updateProfile(p.id, (x) => {
    x.cloud = { ...x.cloud, listed: !!listed };
  });
  setCloudMeta(p.id, { listedSync: !!listed, ...(listed ? { sent: {}, sentAt: {} } : {}) });
  if (!isLinked(p) || p.cloud.moved) return true;
  try {
    await rpc('sas_listed', { p_id: p.cloud.id, p_secret: p.cloud.secret, p_listed: !!listed });
    setCloudMeta(p.id, { listedSync: undefined });
  } catch (e) {
    if (e.code === 'bad_secret') markMoved(p.id);
  }
  return true;
}

// ------------------------------------------------------------------ high scores

const intBoard = (b) => b === 'steals' || b === 'rebirths';

/** Submit a score (the server keeps the best). Resolves {best, week}. */
export async function submitScore(profile, board, value, { background = false } = {}) {
  const p = fresh(profile);
  if (!BOARD[board]) throw new OnlineError('bad_board', 'Unknown board.');
  if (!isLinked(p)) throw new OnlineError('not_linked', 'Join the board first.');
  if (p.cloud.moved) throw new OnlineError('moved', 'This save code now lives on another device.');
  if (p.cloud.listed === false) throw new OnlineError('not_listed', 'Hidden from the global board.');
  const v = intBoard(board) ? Math.floor(value) : Math.floor(value * 100) / 100;
  if (!Number.isFinite(v) || v < 0) throw new OnlineError('bad_value', 'Not a score.');
  let r;
  try {
    r = await rpc('sas_submit', { p_id: p.cloud.id, p_secret: p.cloud.secret, p_board: board, p_value: v, p_name: p.name, p_look: p.look || {} }, { background });
  } catch (e) {
    if (e.code === 'bad_secret') markMoved(p.id);
    throw e;
  }
  const m = cloudMeta(p.id);
  setCloudMeta(p.id, { sent: { ...m.sent, [board]: Math.max(m.sent[board] || 0, v) }, sentAt: { ...m.sentAt, [board]: Date.now() } });
  cache.clear();
  return { best: +r?.best || v, week: +r?.week || v };
}

const cache = new Map();
const CACHE_MS = 45000;

/**
 * Global top scores. opts: {limit (1-100, default 50), period 'all'|'week', me: profile (flags your row
 * and adds it with its rank when you're outside the top), fresh: skip the 45 s cache}.
 * Resolves [{rank, name, base, look, value, updatedAt, me}].
 */
export async function topScores(board, { limit = 50, period = 'all', me = null, fresh: noCache = false } = {}) {
  if (!BOARD[board]) throw new OnlineError('bad_board', 'Unknown board.');
  const meId = me && isLinked(me) && !me.cloud.moved ? me.cloud.id : null;
  const key = `${board}|${period}|${limit}|${meId || ''}`;
  const hit = cache.get(key);
  if (!noCache && hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = await rpc('sas_top', { p_board: board, p_limit: limit, p_period: period === 'week' ? 'week' : 'all', p_me: meId });
  const out = (Array.isArray(rows) ? rows : []).map((r) => ({
    rank: Math.max(1, Math.floor(+r.rank || 1)),
    name: String(r.name || 'Player').slice(0, 20),
    base: CHARACTER[r.base] ? r.base : 'dorian',
    look: r.look && typeof r.look === 'object' ? r.look : {},
    value: Number.isFinite(+r.value) ? +r.value : 0,
    updatedAt: r.updated_at ? Date.parse(r.updated_at) || 0 : 0,
    me: !!r.me,
  }));
  cache.set(key, { at: Date.now(), rows: out });
  return out;
}

/** The family board: every profile on this device, best first. Works offline. */
export function familyScores(board, app = null) {
  const activeId = app?.profileId || app?.profile?.id || null;
  const rows = listProfiles()
    .map((p) => ({ profileId: p.id, name: p.name, base: p.base, look: p.look, value: profileScores(p, app)[board] || 0, updatedAt: p.updatedAt || 0, me: p.id === activeId }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].value === r.value ? rows[i - 1].rank : i + 1));
  return rows;
}
