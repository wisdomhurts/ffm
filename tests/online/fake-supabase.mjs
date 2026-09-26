// In-memory stand-in for the Supabase RPCs in supabase/migrations/0001_steal_a_seed.sql (same inputs,
// outputs, error tokens and HTTP statuses as PostgREST would give). Used by tests/online/online.test.mjs
// (as a fetch replacement) and tests/online/ui-check.mjs (behind Playwright's page.route).
import { sanitizeName } from '../../src/core/names.js';

export const FAKE_URL = 'https://fake-sas.supabase.test';
export const FAKE_KEY = 'sb_publishable_fake_test_key';
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const BASES = ['dorian', 'esther', 'maddie', 'micah'];
const CAPS = { networth: 1e18, showdown: 1e15, steals: 1e7, rebirths: 1e3 };

class RpcError extends Error {
  constructor(message, status = 400, code = 'P0001', hint = '') {
    super(message);
    this.status = status;
    this.pgcode = code;
    this.hint = hint;
  }
}

const rnd = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 256));
const hex = (n) => rnd(n).map((b) => b.toString(16).padStart(2, '0')).join('');
const uuid = () => {
  const h = hex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const newCode = () => {
  const s = rnd(8).map((b) => ALPHA[b & 31]).join('');
  return `SEED-${s.slice(0, 4)}-${s.slice(4)}`;
};
function normCode(c) {
  let s = String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 12 && s.startsWith('SEED')) s = s.slice(4);
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(s) ? `SEED-${s.slice(0, 4)}-${s.slice(4)}` : null;
}
// like public.sas_clean_name: accept a name only if it is already clean (what sanitizeName would keep)
function cleanName(n, fb) {
  if (n == null) return fb;
  const s = String(n).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s || [...s].length > 14 || sanitizeName(s, '') !== s) return fb;
  return s;
}
function cleanLook(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l) || new TextEncoder().encode(JSON.stringify(l)).length > 2048) return null;
  const out = {};
  for (const k of Object.keys(l).sort().slice(0, 32)) {
    const v = l[k];
    if (!/^[A-Za-z0-9_]{1,24}$/.test(k)) continue;
    if (v === null || typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= 40)) out[k] = v;
  }
  return out;
}
function weekStart(ms) {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/**
 * createFakeSupabase({rateMs, now}) -> {url, key, fetch, handle, state, players, scores, clearRateLimits()}
 * state.mode: 'up' | 'down' (fetch throws) | '500' (server error) ; state.calls: [{fn, args}]
 */
export function createFakeSupabase({ rateMs = 5000, now = () => Date.now(), url = FAKE_URL, key = FAKE_KEY } = {}) {
  const players = new Map();
  const scores = new Map();
  const state = { mode: 'up', calls: [], loadFails: 0 };

  const auth = (id, secret) => {
    const p = players.get(id);
    if (!p || typeof secret !== 'string' || p.secret !== secret || p.banned) throw new RpcError('bad_secret', 403, 'PT403');
    return p;
  };
  const guardLoads = () => {
    if (state.loadFails >= 20) throw new RpcError('rate_limited', 429, 'PT429', 'Too many wrong codes. Wait a few minutes.');
  };
  const byCode = (c) => [...players.values()].find((p) => p.code === c && !p.banned);

  const fns = {
    sas_register({ p_name, p_base, p_look }) {
      if (!BASES.includes(p_base)) throw new RpcError('bad_base', 400, '22023');
      const p = { id: uuid(), secret: hex(32), code: newCode(), name: cleanName(p_name, 'Player'), base: p_base, look: cleanLook(p_look) || {},
        save: null, listed: true, banned: false, lastWrite: 0, savedAt: null, saves: 0, loads: 0 };
      players.set(p.id, p);
      return { id: p.id, secret: p.secret, code: p.code };
    },
    sas_save({ p_id, p_secret, p_save, p_name = null, p_look = null }) {
      const p = auth(p_id, p_secret);
      if (p.lastWrite && now() - p.lastWrite < rateMs) throw new RpcError('rate_limited', 429, 'PT429');
      if (!p_save || typeof p_save !== 'object' || Array.isArray(p_save)) throw new RpcError('bad_save', 400, '22023');
      if (JSON.stringify(p_save).length > 204800) throw new RpcError('too_big', 413, 'PT413');
      p.save = p_save;
      p.name = cleanName(p_name, null) || p.name;
      p.look = cleanLook(p_look) || p.look;
      p.lastWrite = now();
      p.savedAt = new Date(now()).toISOString();
      p.saves++;
      for (const s of scores.values()) if (s.player === p.id) Object.assign(s, { name: p.name, look: p.look });
      return { ok: true, saved_at: p.savedAt };
    },
    sas_peek({ p_code }) {
      const c = normCode(p_code);
      if (!c) throw new RpcError('bad_code', 400, '22023');
      guardLoads();
      const p = byCode(c);
      if (!p) {
        state.loadFails++;
        return null;
      }
      const summary = p.save?.summary && typeof p.save.summary === 'object' ? p.save.summary : {};
      return { name: p.name, base: p.base, look: p.look, summary, has_save: !!p.save, saved_at: p.savedAt };
    },
    sas_load({ p_code }) {
      const c = normCode(p_code);
      if (!c) throw new RpcError('bad_code', 400, '22023');
      guardLoads();
      const p = byCode(c);
      if (!p) {
        state.loadFails++;
        return null;
      }
      p.secret = hex(32);
      p.lastWrite = 0;
      p.loads++;
      return { id: p.id, secret: p.secret, code: p.code, name: p.name, base: p.base, look: p.look, save: p.save, saved_at: p.savedAt };
    },
    sas_submit({ p_id, p_secret, p_board, p_value, p_name = null, p_look = null }) {
      const cap = CAPS[p_board];
      if (!cap) throw new RpcError('bad_board', 400, '22023');
      if (typeof p_value !== 'number' || !(p_value >= 0 && p_value <= cap)) throw new RpcError('bad_value', 400, '22023');
      if ((p_board === 'steals' || p_board === 'rebirths') && p_value !== Math.floor(p_value)) throw new RpcError('bad_value', 400, '22023');
      const p = auth(p_id, p_secret);
      p.name = cleanName(p_name, null) || p.name;
      p.look = cleanLook(p_look) || p.look;
      const k = p.id + '|' + p_board;
      const wk = weekStart(now());
      let s = scores.get(k);
      const t = now();
      if (!s) {
        s = { player: p.id, board: p_board, value: p_value, week: p_value, weekStart: wk, at: t, weekAt: t, submitted: t };
        scores.set(k, s);
      } else {
        if (t - s.submitted < rateMs) throw new RpcError('rate_limited', 429, 'PT429');
        if (p_value > s.value) Object.assign(s, { value: p_value, at: t });
        if (s.weekStart !== wk) Object.assign(s, { week: p_value, weekStart: wk, weekAt: t });
        else if (p_value > s.week) Object.assign(s, { week: p_value, weekAt: t });
        s.submitted = t;
      }
      Object.assign(s, { name: p.name, base: p.base, look: p.look, hidden: !p.listed || p.banned });
      return { board: p_board, best: s.value, week: s.week };
    },
    sas_top({ p_board, p_limit = 50, p_period = 'all', p_me = null }) {
      if (!CAPS[p_board]) throw new RpcError('bad_board', 400, '22023');
      if (!['all', 'week'].includes(p_period ?? 'all')) throw new RpcError('bad_period', 400, '22023');
      const lim = Math.min(Math.max(p_limit ?? 50, 1), 100);
      const wk = weekStart(now());
      const week = p_period === 'week';
      const rows = [...scores.values()]
        .filter((s) => s.board === p_board && !s.hidden && (!week || s.weekStart === wk))
        .map((s) => ({ s, v: week ? s.week : s.value, t: week ? s.weekAt : s.at }))
        .filter((r) => r.v > 0)
        .sort((a, b) => b.v - a.v || a.t - b.t);
      const rankOf = (v) => 1 + rows.filter((r) => r.v > v).length;
      const out = rows.slice(0, lim).map((r) => ({ rank: rankOf(r.v), name: r.s.name, base: r.s.base, look: r.s.look, value: r.v, updated_at: new Date(r.t).toISOString(), me: r.s.player === p_me }));
      const mine = rows.find((r) => r.s.player === p_me);
      if (mine && !out.some((r) => r.me)) out.push({ rank: rankOf(mine.v), name: mine.s.name, base: mine.s.base, look: mine.s.look, value: mine.v, updated_at: new Date(mine.t).toISOString(), me: true });
      return out;
    },
    sas_listed({ p_id, p_secret, p_listed }) {
      const p = auth(p_id, p_secret);
      p.listed = p_listed !== false;
      for (const s of scores.values()) if (s.player === p.id) s.hidden = !p.listed || p.banned;
      return { listed: p.listed };
    },
    sas_delete({ p_id, p_secret }) {
      const p = auth(p_id, p_secret);
      players.delete(p.id);
      for (const [k, s] of scores) if (s.player === p.id) scores.delete(k);
      return true;
    },
  };

  /** Handle one request: returns {status, body (string)} or throws TypeError for a network failure. */
  function handle(reqUrl, { headers = {}, body = '{}' } = {}) {
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const m = String(reqUrl).match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (!String(reqUrl).startsWith(url) || !m) throw new TypeError('Failed to fetch');
    const fn = m[1];
    let args = {};
    try {
      args = JSON.parse(body || '{}');
    } catch {
      return { status: 400, body: JSON.stringify({ code: 'PGRST102', message: 'Invalid body' }) };
    }
    state.calls.push({ fn, args });
    if (state.mode === 'down') throw new TypeError('Failed to fetch');
    if (state.mode === '500') return { status: 503, body: JSON.stringify({ message: 'upstream unavailable' }) };
    if (h.apikey !== key || h.authorization !== 'Bearer ' + key) return { status: 401, body: JSON.stringify({ message: 'Invalid API key' }) };
    if (!fns[fn]) return { status: 404, body: JSON.stringify({ code: 'PGRST202', message: `Could not find the function public.${fn}` }) };
    try {
      const out = fns[fn](args);
      return { status: 200, body: JSON.stringify(out === undefined ? null : out) };
    } catch (e) {
      if (e instanceof RpcError) return { status: e.status, body: JSON.stringify({ code: e.pgcode, message: e.message, hint: e.hint || null, details: null }) };
      return { status: 500, body: JSON.stringify({ message: String(e?.message || e) }) };
    }
  }

  async function fakeFetch(input, init = {}) {
    const r = handle(typeof input === 'string' ? input : input.url, { headers: init.headers || {}, body: init.body });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
  }

  return {
    url,
    key,
    fetch: fakeFetch,
    handle,
    state,
    players,
    scores,
    clearRateLimits() {
      for (const p of players.values()) p.lastWrite = 0;
      for (const s of scores.values()) s.submitted = 0;
    },
    stored(id) {
      return players.get(id)?.save ?? null;
    },
  };
}
